"""Shared notation normalizer.

One place that turns the many ways people write maths, numbers and chemistry
into the single canonical form the solvers understand.  Nothing in here evaluates
user input: the output is plain text (or plain data) that is parsed later by the
restricted AST parser in ``core_math.safe_expr``.

Design rules
------------
* Function names (``sin``, ``log10`` ...), variable names (``x1``, ``theta``),
  constants and chemical formulas are never rewritten character-by-character;
  the text is tokenised first, so ``log10(x)`` stays ``log10(x)`` and ``H2O`` is
  never turned into ``H*2*O``.
* ``normalize_expression`` is idempotent: normalising twice equals normalising once.
* Equation boundaries (``=``, ``==``, ``＝``, chemical arrows) are located on tokens,
  never inside numbers or names.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


class NotationError(ValueError):
    """The text cannot be interpreted safely as the requested notation."""


# --------------------------------------------------------------------------- #
# Vocabulary shared with the solvers
# --------------------------------------------------------------------------- #
# canonical function name -> (min_args, max_args)
FUNCTION_ARITY: dict[str, tuple[int, int]] = {
    "sin": (1, 1), "cos": (1, 1), "tan": (1, 1), "sec": (1, 1), "csc": (1, 1), "cot": (1, 1),
    "asin": (1, 1), "acos": (1, 1), "atan": (1, 1), "atan2": (2, 2),
    "sinh": (1, 1), "cosh": (1, 1), "tanh": (1, 1), "asinh": (1, 1), "acosh": (1, 1), "atanh": (1, 1),
    "exp": (1, 1), "log": (1, 2), "ln": (1, 1), "log10": (1, 1), "log2": (1, 1),
    "sqrt": (1, 1), "cbrt": (1, 1), "abs": (1, 1), "floor": (1, 1), "ceiling": (1, 1),
    "factorial": (1, 1),
}
FUNCTION_ALIASES = {
    "arcsin": "asin", "arccos": "acos", "arctan": "atan", "arctan2": "atan2",
    "arcsinh": "asinh", "arccosh": "acosh", "arctanh": "atanh",
    "ceil": "ceiling", "fabs": "abs", "lg": "log10",
}
CONSTANT_NAMES = frozenset({"pi", "E", "e"})

_SUPERSCRIPT_CHARS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻"
_SUPERSCRIPT_TABLE = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-")
_SUBSCRIPT_TABLE = str.maketrans("₀₁₂₃₄₅₆₇₈₉₊₋", "0123456789+-")
_SUPERSCRIPT_RUN = re.compile(f"[{_SUPERSCRIPT_CHARS}]+")
_INVISIBLE = re.compile("[​‌‍⁠﻿­]")

_CHAR_MAP = {
    # minus / dash variants
    "−": "-", "–": "-", "—": "-", "‐": "-", "‑": "-", "‒": "-",
    "﹣": "-", "－": "-",
    # multiplication
    "×": "*", "·": "*", "⋅": "*", "∙": "*", "✕": "*", "∗": "*", "•": "*", "×": "*",
    # division
    "÷": "/", "∕": "/", "⁄": "/", "⁄": "/",
    # equality
    "＝": "=", "≔": "=",
    # misc punctuation
    "，": ",", "＋": "+",
}


@dataclass
class NormalizationReport:
    """Normalised text plus a human-readable list of what was rewritten."""
    text: str
    notes: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Low-level cleaning
# --------------------------------------------------------------------------- #
def convert_superscripts(text: str, style: str = "pow") -> str:
    """Rewrite Unicode superscript runs as exponents.

    style="pow":   ``x²`` -> ``x**2`` and ``x⁻¹`` -> ``x**(-1)`` (maths)
    style="caret": ``m/s²`` -> ``m/s^2`` and ``s⁻¹`` -> ``s^-1`` (unit strings)
    """
    def repl(match: re.Match[str]) -> str:
        digits = match.group(0).translate(_SUPERSCRIPT_TABLE)
        if style == "caret":
            return "^" + digits
        sign = ""
        if digits[0] in "+-":
            sign, digits = digits[0], digits[1:]
        digits = digits.replace("+", "").replace("-", "")
        if not digits:
            raise NotationError("Dangling superscript sign")
        return f"**({sign}{digits})" if sign == "-" else f"**{digits}"
    return _SUPERSCRIPT_RUN.sub(repl, text)


def _map_chars(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)  # after superscripts were handled
    return "".join(_CHAR_MAP.get(ch, ch) for ch in text)


# --------------------------------------------------------------------------- #
# Maths expressions
# --------------------------------------------------------------------------- #
_TOKEN = re.compile(
    r"""
    (?P<num>(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)
  | (?P<name>[^\W\d]\w*)
  | (?P<op>\*\*|//|<=|>=|==|!=|[-+*/%^(),=<>\[\]{}])
  | (?P<ws>\s+)
  | (?P<other>.)
    """,
    re.X,
)


def _split_unknown_name(name: str, variables: frozenset[str] | None) -> list[str] | None:
    """Split an undeclared token such as ``xy`` or ``x2`` into known pieces."""
    if variables is None:
        m = re.fullmatch(r"([A-Za-z])(\d+)", name)        # legacy: "x2" -> x*2
        return [m.group(1), m.group(2)] if m else None
    known = set(variables) | CONSTANT_NAMES
    m = re.fullmatch(r"([A-Za-z_]\w*?)(\d+)", name)
    if m and m.group(1) in known:
        return [m.group(1), m.group(2)]
    if all(ch in known for ch in name):                    # "xy" with x and y declared
        return list(name)
    return None


def normalize_expression(text: str, variables: list[str] | tuple[str, ...] | None = None,
                         report: NormalizationReport | None = None) -> str:
    """Normalise a mathematical expression (no ``=``-splitting).

    ``variables`` lists declared variable names.  When given, undeclared run-together
    names such as ``xy`` are split into ``x*y`` only if every piece is declared, and
    declared names such as ``x1`` are always preserved.
    """
    original = str(text)
    notes: list[str] = []
    s = _INVISIBLE.sub("", original).strip()
    if not s:
        return ""
    if _SUPERSCRIPT_RUN.search(s):
        s = convert_superscripts(s, "pow"); notes.append("superscripts rewritten as powers")
    s = s.translate(_SUBSCRIPT_TABLE) if "₀" in s else s
    s = _map_chars(s)
    if s != original.strip() and any(c in original for c in "−–—×·÷"):
        notes.append("Unicode operators normalised")
    s = s.replace("π", " pi ").replace("√", " √ ")
    # |x| -> abs(x) for simple, non-nested bars
    if "|" in s:
        if s.count("|") % 2 or "||" in s:
            raise NotationError("Unbalanced or nested absolute-value bars; use abs(...) instead")
        parts = s.split("|"); out = parts[0]
        for i, part in enumerate(parts[1:], 1):
            out += ("abs(" if i % 2 else ")") + part
        s = out; notes.append("|x| rewritten as abs(x)")

    declared = frozenset(variables) if variables is not None else None
    tokens: list[tuple[str, str]] = []
    for m in _TOKEN.finditer(s):
        kind, tok = m.lastgroup, m.group()
        if kind == "ws":
            continue
        if kind == "other":
            if tok != "√":
                raise NotationError(f"Unsupported character {tok!r} in expression")
            kind = "sqrt"
        tokens.append((kind, tok))

    _PAREN = {"[": "(", "{": "(", "]": ")", "}": ")"}
    resolved: list[tuple[str, str]] = []
    i = 0
    while i < len(tokens):
        kind, tok = tokens[i]
        if kind == "op":
            tok = {"^": "**", "==": "="}.get(tok, _PAREN.get(tok, tok))
            resolved.append(("op", tok)); i += 1; continue
        if kind == "sqrt":                       # "√x", "√2", "√(…)" -> sqrt(…)
            j = i + 1
            if j >= len(tokens):
                raise NotationError("'√' must be followed by a value")
            nk, nt = tokens[j]
            resolved += [("func", "sqrt"), ("op", "(")]
            if nk == "op" and nt in "([{":
                depth, end = 0, j
                while end < len(tokens):
                    t = tokens[end][1]
                    depth += (t in "([{" and tokens[end][0] == "op") - (t in ")]}" and tokens[end][0] == "op")
                    if depth == 0:
                        break
                    end += 1
                else:
                    raise NotationError("Unbalanced parentheses after '√'")
                for k2, t2 in tokens[j + 1:end]:
                    resolved.append(("op", _PAREN.get(t2, t2)) if k2 == "op" else (k2, t2))
                i = end + 1
            else:
                resolved.append((nk, nt)); i = j + 1
            resolved.append(("op", ")"))
            notes.append("√ rewritten as sqrt()")
            continue
        if kind == "name":
            canon = FUNCTION_ALIASES.get(tok, tok)
            nxt = tokens[i + 1] if i + 1 < len(tokens) else None
            is_call = nxt is not None and nxt[0] == "op" and nxt[1] in "([{"
            if declared is not None and tok in declared:
                resolved.append(("name", tok)); i += 1; continue
            if canon in FUNCTION_ARITY and is_call:
                if canon != tok:
                    notes.append(f"{tok} rewritten as {canon}")
                resolved.append(("func", canon)); i += 1; continue
            if tok in CONSTANT_NAMES or canon in FUNCTION_ARITY:
                resolved.append(("name", tok)); i += 1; continue
            if is_call and len(tok) > 1 and not (declared is not None and tok in declared) \
                    and _split_unknown_name(tok, declared) is None:
                resolved.append(("func", tok)); i += 1; continue        # unknown function: keep as a call, reject later
            pieces = _split_unknown_name(tok, declared)
            if pieces and len(pieces) > 1:
                for n, piece in enumerate(pieces):
                    resolved.append(("num" if piece.isdigit() else "name", piece))
                    if n < len(pieces) - 1:
                        resolved.append(("op", "*"))
                notes.append(f"implicit multiplication in {tok!r}")
                i += 1; continue
        resolved.append((kind, tok)); i += 1

    # implicit multiplication between tokens
    out: list[str] = []
    prev: tuple[str, str] | None = None
    for kind, tok in resolved:
        if prev is not None:
            pk, pt = prev
            prev_value_end = pk in ("num", "name") or (pk == "op" and pt == ")")
            cur_value_start = kind in ("num", "name", "func") or (kind == "op" and tok == "(")
            if prev_value_end and cur_value_start:
                out.append(" " if (pk == "num" and kind == "num") else "*")   # "2 3" stays invalid
            elif pk in ("name", "num") and kind in ("name", "num"):
                out.append(" ")
        out.append(tok)
        prev = (kind, tok)
    result = "".join(out)
    if report is not None:
        report.text = result
        report.notes.extend(n for n in notes if n not in report.notes)
    return result


def split_equation(source: str, variables: list[str] | tuple[str, ...] | None = None) -> tuple[str, str]:
    """Split ``lhs = rhs`` into two normalised expressions (missing rhs -> ``0``)."""
    s = _INVISIBLE.sub("", str(source))
    s = convert_superscripts(s, "pow") if _SUPERSCRIPT_RUN.search(s) else s
    s = _map_chars(s)
    for bad in ("<=", ">=", "!=", "≤", "≥", "≠", "<", ">"):
        if bad in s:
            raise NotationError("Inequalities are not supported; provide an equation with a single '='")
    s = s.replace("==", "=")
    if s.count("=") > 1:
        raise NotationError("Provide one equation with a single '=' sign")
    if "=" not in s:
        if not s.strip():
            raise NotationError("Equation cannot be empty")
        return normalize_expression(s, variables), "0"
    lhs, rhs = s.split("=", 1)
    if not lhs.strip() or not rhs.strip():
        raise NotationError("Both sides of the equation must contain an expression")
    return normalize_expression(lhs, variables), normalize_expression(rhs, variables)


# --------------------------------------------------------------------------- #
# Numbers (used by the unit parser and by model-answer comparison)
# --------------------------------------------------------------------------- #
_NUM_PREFIX = re.compile(
    r"""^\s*
    (?P<sign>[+-])?\s*
    (?P<mant>(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)
    (?:
        (?P<e>[eE][+-]?\d+)(?![A-Za-z0-9_])?
      | \s*[*xX]\s*10\s*(?:\^|\*\*)\s*\(?\s*(?P<p>[+-]?\d+)\s*\)?
    )?
    """, re.X)


def clean_numeric_text(text: str) -> str:
    """Prepare text containing a number: unicode minus, superscripts, NBSP, invisible chars."""
    s = _INVISIBLE.sub("", str(text))
    if _SUPERSCRIPT_RUN.search(s):
        s = convert_superscripts(s, "caret")
    s = _map_chars(s)
    return s.replace(" ", " ").strip()


def split_number_prefix(text: str) -> tuple[float, str]:
    """Split ``"-1.5×10^-3 kg"`` into ``(-0.0015, "kg")``.

    Accepts a leading sign (ASCII or Unicode minus), thousands separators
    (``1,000``), ``e``/``E`` notation and ``×10^n`` notation.  A decimal comma is
    rejected because it is ambiguous with a thousands separator or argument list.
    """
    s = clean_numeric_text(text)
    m = _NUM_PREFIX.match(s)
    if not m:
        raise NotationError(f"No numeric value found in {text!r}")
    if re.match(r"^\s*[+-]?\d+,\d{1,2}(?!\d)", s):
        raise NotationError(f"Ambiguous decimal comma in {text!r}; use a decimal point")
    mant = m.group("mant").replace(",", "")
    exp = m.group("e") or (("e" + m.group("p")) if m.group("p") is not None else "")
    try:
        value = float(f"{m.group('sign') or ''}{mant}{exp}")
    except (ValueError, OverflowError) as exc:
        raise NotationError(f"Number out of range in {text!r}") from exc
    if value in (float("inf"), float("-inf")) or value != value:
        raise NotationError(f"Number out of range in {text!r}")
    return value, s[m.end():].strip()


def parse_plain_number(text: str) -> float:
    """Parse a bare number such as ``"1.5e-3"``, ``"−3"``, ``"2×10^4"`` or ``"1,000"``."""
    value, rest = split_number_prefix(text)
    if rest:
        raise NotationError(f"Unexpected text {rest!r} after number in {text!r}")
    return value


# --------------------------------------------------------------------------- #
# Chemistry
# --------------------------------------------------------------------------- #
_ARROW = re.compile(r"\s*(?:<[-=]+>|-{1,2}>|=+>|[→⟶⟹⇒⇌⇄↔]|=)\s*")
_STATE = re.compile(r"\((?:s|l|g|aq)\)$")


def normalize_chemical_formula(text: str) -> str:
    """Normalise a formula: ``H₂O`` -> ``H2O``; hydrate dots unified to ``.``.

    Letters keep their case (``Co`` is cobalt, ``CO`` is carbon monoxide).
    """
    s = _INVISIBLE.sub("", str(text)).translate(_SUBSCRIPT_TABLE)
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[·•⋅∙*]", ".", s)
    if not s:
        raise NotationError("Provide a chemical formula, e.g. H2O")
    bad = re.search(r"[^A-Za-z0-9().]", s)
    if bad:
        raise NotationError(f"Unsupported character {bad.group()!r} in chemical formula {text!r}")
    return s


def normalize_chemical_equation(text: str) -> tuple[list[str], list[str], list[str]]:
    """Split ``"H2 + O2 => H2O"`` into (reactants, products, notes).

    Accepts ``->``, ``-->``, ``=>``, ``→``, ``⟶``, ``⇌``, ``<=>`` and ``=`` as the single
    arrow, strips state symbols ``(s) (l) (g) (aq)`` and leading coefficients.
    """
    notes: list[str] = []
    s = _INVISIBLE.sub("", str(text)).translate(_SUBSCRIPT_TABLE)
    s = unicodedata.normalize("NFKC", s).replace("＋", "+")
    parts = _ARROW.split(s)
    if len(parts) != 2:
        raise NotationError("Provide a chemical equation with exactly one arrow, e.g. H2 + O2 -> H2O")
    sides: list[list[str]] = []
    for side in parts:
        species = []
        for raw in side.split("+"):
            f = re.sub(r"\s+", "", raw)
            if not f:
                raise NotationError("Empty species in chemical equation")
            if _STATE.search(f):
                f = _STATE.sub("", f); notes.append("state symbols ignored")
            m = re.match(r"^(\d+)(?=[A-Z(])", f)
            if m:
                f = f[m.end():]; notes.append("existing coefficients ignored and recomputed")
            species.append(normalize_chemical_formula(f))
        sides.append(species)
    return sides[0], sides[1], sorted(set(notes))
