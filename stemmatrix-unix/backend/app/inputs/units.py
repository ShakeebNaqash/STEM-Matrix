"""Scientific unit parser, quantities and dimensional vectors.

Quantities such as ``500 g``, ``2 m/s²``, ``25 °C`` or ``1.5×10⁻³ kg·m/s^2`` are parsed
into a value plus a :class:`Unit` (a dimension vector, an SI scale factor and, for
°C/°F, an offset).  Converting between incompatible dimensions raises
:class:`DimensionError` instead of silently calculating.

SI prefixes are case-sensitive (``mV`` = millivolt, ``MV`` = megavolt, ``Mm`` =
megametre).  Only when a token has no exact reading is a case-insensitive reading
tried, and that is reported in ``notes`` so it is never silent.
"""
from __future__ import annotations

import difflib
import math
import re
from dataclasses import dataclass
from fractions import Fraction
from typing import Iterable

from app.inputs.notation import NotationError, convert_superscripts, split_number_prefix

BASE_SYMBOLS = ("L", "M", "T", "I", "Θ", "N")      # length, mass, time, current, temperature, amount


class UnitError(ValueError):
    """A unit or quantity could not be interpreted."""


class DimensionError(UnitError):
    """Two quantities have incompatible physical dimensions."""


# --------------------------------------------------------------------------- #
# Dimensions
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Dimension:
    exps: tuple[Fraction, ...] = (Fraction(0),) * 6

    @staticmethod
    def of(L=0, M=0, T=0, I=0, Th=0, N=0) -> "Dimension":          # noqa: E741
        return Dimension(tuple(Fraction(v) for v in (L, M, T, I, Th, N)))

    def __mul__(self, other: "Dimension") -> "Dimension":
        return Dimension(tuple(a + b for a, b in zip(self.exps, other.exps)))

    def __truediv__(self, other: "Dimension") -> "Dimension":
        return Dimension(tuple(a - b for a, b in zip(self.exps, other.exps)))

    def __pow__(self, power) -> "Dimension":
        p = Fraction(power)
        return Dimension(tuple(a * p for a in self.exps))

    @property
    def dimensionless(self) -> bool:
        return all(a == 0 for a in self.exps)

    def formula(self) -> str:
        if self.dimensionless:
            return "dimensionless"
        parts = []
        for sym, e in zip(BASE_SYMBOLS, self.exps):
            if e == 0:
                continue
            parts.append(sym if e == 1 else f"{sym}^{e if e.denominator == 1 else f'({e})'}")
        return "·".join(parts)

    def name(self) -> str:
        return _NAMED.get(self, self.formula())

    def __str__(self) -> str:
        n = _NAMED.get(self)
        return f"{n} [{self.formula()}]" if n and not self.dimensionless else self.formula()


D = Dimension.of
DIMENSIONLESS = D()
LENGTH, MASS, TIME, CURRENT, TEMPERATURE, AMOUNT = D(L=1), D(M=1), D(T=1), D(I=1), D(Th=1), D(N=1)
AREA, VOLUME = LENGTH ** 2, LENGTH ** 3
SPEED, ACCELERATION = LENGTH / TIME, LENGTH / TIME ** 2
FORCE = MASS * ACCELERATION
ENERGY, POWER = FORCE * LENGTH, FORCE * LENGTH / TIME
PRESSURE = FORCE / AREA
MOMENTUM = MASS * SPEED
CHARGE = CURRENT * TIME
VOLTAGE = POWER / CURRENT
RESISTANCE = VOLTAGE / CURRENT
CAPACITANCE = CHARGE / VOLTAGE
DENSITY = MASS / VOLUME
CONCENTRATION = AMOUNT / VOLUME
FLOW_RATE = VOLUME / TIME
FREQUENCY = TIME ** -1
DYNAMIC_VISCOSITY = PRESSURE * TIME
SPECIFIC_HEAT = ENERGY / MASS / TEMPERATURE
HEAT_TRANSFER_COEFF = POWER / AREA / TEMPERATURE
MOLAR_MASS = MASS / AMOUNT
GAS_CONSTANT = ENERGY / AMOUNT / TEMPERATURE
SECOND_MOMENT_AREA = LENGTH ** 4
CONDUCTANCE = RESISTANCE ** -1
MAGNETIC_FLUX_DENSITY = MASS / CURRENT / TIME ** 2
INDUCTANCE = VOLTAGE * TIME / CURRENT

_NAMED: dict[Dimension, str] = {
    DIMENSIONLESS: "dimensionless", LENGTH: "length", MASS: "mass", TIME: "time", CURRENT: "current",
    TEMPERATURE: "temperature", AMOUNT: "amount", AREA: "area", VOLUME: "volume", SPEED: "speed",
    ACCELERATION: "acceleration", FORCE: "force", ENERGY: "energy", POWER: "power", PRESSURE: "pressure",
    MOMENTUM: "momentum", CHARGE: "charge", VOLTAGE: "voltage", RESISTANCE: "resistance",
    CAPACITANCE: "capacitance", DENSITY: "density", CONCENTRATION: "concentration", FLOW_RATE: "flow_rate",
    FREQUENCY: "frequency", DYNAMIC_VISCOSITY: "dynamic_viscosity", SPECIFIC_HEAT: "specific_heat",
    HEAT_TRANSFER_COEFF: "heat_transfer_coefficient", MOLAR_MASS: "molar_mass", GAS_CONSTANT: "gas_constant",
    SECOND_MOMENT_AREA: "second_moment_of_area", CONDUCTANCE: "conductance",
    MAGNETIC_FLUX_DENSITY: "magnetic_flux_density", INDUCTANCE: "inductance",
}


# --------------------------------------------------------------------------- #
# Unit table
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Unit:
    dim: Dimension
    factor: Fraction                 # SI = value * factor + offset
    offset: Fraction = Fraction(0)
    symbol: str = ""

    @property
    def affine(self) -> bool:
        return self.offset != 0

    def __str__(self) -> str:
        return self.symbol


_F = Fraction
# symbol -> (dimension, factor to SI, prefixable)
_BASE: dict[str, tuple[Dimension, Fraction, bool]] = {
    # length
    "m": (LENGTH, _F(1), True), "in": (LENGTH, _F("0.0254"), False), "ft": (LENGTH, _F("0.3048"), False),
    "yd": (LENGTH, _F("0.9144"), False), "mi": (LENGTH, _F("1609.344"), False), "nmi": (LENGTH, _F(1852), False),
    "Å": (LENGTH, _F("1e-10"), False),
    # mass (gram is the prefixable base; kg = k + g)
    "g": (MASS, _F("0.001"), True), "lb": (MASS, _F("0.45359237"), False), "oz": (MASS, _F("0.028349523125"), False),
    "t": (MASS, _F(1000), False),
    # time
    "s": (TIME, _F(1), True), "min": (TIME, _F(60), False), "h": (TIME, _F(3600), False),
    "hr": (TIME, _F(3600), False), "d": (TIME, _F(86400), False),
    # electrical / amount / frequency
    "A": (CURRENT, _F(1), True), "mol": (AMOUNT, _F(1), True), "Hz": (FREQUENCY, _F(1), True),
    "C": (CHARGE, _F(1), True), "V": (VOLTAGE, _F(1), True), "F": (CAPACITANCE, _F(1), True),
    "Ω": (RESISTANCE, _F(1), True), "ohm": (RESISTANCE, _F(1), True),
    # mechanics
    "N": (FORCE, _F(1), True), "lbf": (FORCE, _F("4.4482216152605"), False),
    "kgf": (FORCE, _F("9.80665"), False), "dyn": (FORCE, _F("1e-5"), False),
    "Pa": (PRESSURE, _F(1), True), "bar": (PRESSURE, _F(100000), True), "atm": (PRESSURE, _F(101325), False),
    "psi": (PRESSURE, _F("6894.757293168"), False), "mmHg": (PRESSURE, _F("133.322387415"), False),
    "torr": (PRESSURE, _F(101325) / 760, False),
    "J": (ENERGY, _F(1), True), "cal": (ENERGY, _F("4.184"), True), "eV": (ENERGY, _F("1.602176634e-19"), True),
    "Wh": (ENERGY, _F(3600), True), "BTU": (ENERGY, _F("1055.05585262"), False),
    "W": (POWER, _F(1), True), "hp": (POWER, _F("745.69987158227022"), False),
    # volume / speed / concentration
    "L": (VOLUME, _F("0.001"), True), "gal": (VOLUME, _F("0.003785411784"), False),
    "mph": (SPEED, _F("0.44704"), False),
    "M": (CONCENTRATION, _F(1000), True),
    # angle & ratios (dimensionless, but with a scale)
    "rad": (DIMENSIONLESS, _F(1), True), "deg": (DIMENSIONLESS, Fraction(math.pi) / 180, False),
    "%": (DIMENSIONLESS, _F("0.01"), False),
}
_PREFIXES: dict[str, Fraction] = {
    "T": _F(10) ** 12, "G": _F(10) ** 9, "M": _F(10) ** 6, "k": _F(10) ** 3, "h": _F(10) ** 2,
    "d": _F(1, 10), "c": _F(1, 100), "m": _F(1, 1000), "µ": _F(1, 10 ** 6), "μ": _F(1, 10 ** 6),
    "u": _F(1, 10 ** 6), "n": _F(1, 10 ** 9), "p": _F(1, 10 ** 12), "f": _F(1, 10 ** 15),
}
_PREFIX_WORDS = {"tera": "T", "giga": "G", "mega": "M", "kilo": "k", "hecto": "h", "deci": "d", "centi": "c",
                 "milli": "m", "micro": "µ", "nano": "n", "pico": "p", "femto": "f"}
_AFFINE = {
    "°C": Unit(TEMPERATURE, _F(1), _F("273.15"), "°C"),
    "°F": Unit(TEMPERATURE, _F(5, 9), _F("459.67") * 5 / 9, "°F"),
}
# words and legacy spellings (matched case-insensitively)
_WORDS: dict[str, str] = {
    "meter": "m", "meters": "m", "metre": "m", "metres": "m", "gram": "g", "grams": "g",
    "second": "s", "seconds": "s", "sec": "s", "secs": "s", "minute": "min", "minutes": "min",
    "hour": "h", "hours": "h", "day": "d", "days": "d", "ampere": "A", "amperes": "A", "amp": "A", "amps": "A",
    "kelvin": "K", "mole": "mol", "moles": "mol", "newton": "N", "newtons": "N", "pascal": "Pa", "pascals": "Pa",
    "joule": "J", "joules": "J", "watt": "W", "watts": "W", "volt": "V", "volts": "V", "ohms": "ohm",
    "hertz": "Hz", "liter": "L", "liters": "L", "litre": "L", "litres": "L", "radian": "rad", "radians": "rad",
    "degree": "deg", "degrees": "deg", "inch": "in", "inches": "in", "foot": "ft", "feet": "ft", "mile": "mi",
    "miles": "mi", "pound": "lb", "pounds": "lb", "lbs": "lb", "ounce": "oz", "ounces": "oz", "molar": "M",
    "celsius": "°C", "fahrenheit": "°F", "percent": "%", "kohm": "kΩ", "kohms": "kΩ", "knot": "kn_", "knots": "kn_",
    "ω": "Ω", "c": "°C", "f": "°F",
}


def _scaled(sym: str, prefix: str = "") -> Unit:
    dim, factor, _ = _BASE[sym]
    if prefix:
        factor = factor * _PREFIXES[prefix]
    return Unit(dim, factor, _F(0), prefix + sym)


def _all_exact() -> dict[str, Unit]:
    table: dict[str, Unit] = {"K": Unit(TEMPERATURE, _F(1), _F(0), "K"), **_AFFINE}
    for sym, (dim, _f, prefixable) in _BASE.items():
        table[sym] = _scaled(sym)
        if prefixable:
            for p in _PREFIXES:
                if p + sym not in _BASE:
                    table.setdefault(p + sym, _scaled(sym, p))
    for p in ("m", "µ", "μ", "u", "n", "p", "f", "c", "d", "k", "M", "G", "T", "h"):  # prefixed kelvin e.g. mK
        table.setdefault(p + "K", Unit(TEMPERATURE, _PREFIXES[p], _F(0), p + "K"))
    table["knot"] = Unit(SPEED, _F(1852, 3600), _F(0), "kn")
    return table


_EXACT = _all_exact()
_EXACT_BY_LOWER: dict[str, set[Unit]] = {}
for _k, _u in _EXACT.items():
    _EXACT_BY_LOWER.setdefault(_k.lower(), set()).add(_u)
_PREFIXABLE_CI: dict[str, str] = {k.lower(): k for k, v in _BASE.items() if v[2]}
_PREFIXABLE_CI["k"] = "K"


def _ci_unit(token: str) -> tuple[Unit, str] | None:
    """Case-insensitive reading of a token; returns (unit, note) or None. Raises on ambiguity."""
    low = token.lower()
    cands = {u for u in _EXACT_BY_LOWER.get(low, set()) if not u.affine}
    if len(cands) > 1:                      # "mv" -> mV or MV?  keep the prefix case the user typed
        same_prefix = {u for u in cands if u.symbol[:1] == token[:1]}
        if len(same_prefix) >= 1 and len({(u.dim, u.factor) for u in same_prefix}) == 1:
            cands = same_prefix
    if len({(u.dim, u.factor) for u in cands}) == 1:
        u = next(iter(cands))
        return Unit(u.dim, u.factor, u.offset, u.symbol), f"unit '{token}' read as '{u.symbol}'"
    if len({(u.dim, u.factor) for u in cands}) > 1:
        raise UnitError(f"Ambiguous unit '{token}': could be " + " or ".join(sorted(u.symbol for u in cands)))
    # prefix is case-sensitive ("m" milli / "M" mega), the unit symbol after it is not ("mv" -> mV)
    for p in sorted(_PREFIXES, key=len, reverse=True):
        if token.startswith(p) and len(token) > len(p):
            rest = token[len(p):]
            base = _PREFIXABLE_CI.get(rest.lower())
            if base == "K":
                return Unit(TEMPERATURE, _PREFIXES[p], _F(0), p + "K"), f"unit '{token}' read as '{p}K'"
            if base:
                return _scaled(base, p), f"unit '{token}' read as '{p}{base}'"
    if token.startswith("K") and len(token) > 1:           # "Kg", "KM" -> kilo
        base = _PREFIXABLE_CI.get(token[1:].lower())
        if base and base != "K":
            return _scaled(base, "k"), f"unit '{token}' read as 'k{base}'"
    return None


def lookup_atom(token: str, notes: list[str] | None = None, expected: Dimension | None = None) -> Unit:
    """Resolve one unit atom such as ``km``, ``mV`` or ``°C``."""
    if token in _EXACT:
        return _EXACT[token]
    if expected == TEMPERATURE and token in ("C", "F"):          # "25 C" where a temperature is required
        return _AFFINE["°" + token]
    low = token.lower()
    if low in _WORDS:
        target = _WORDS[low]
        if target == "kn_":
            return _EXACT["knot"]
        if target in _EXACT:
            return _EXACT[target]
    if token == "°":
        return _EXACT["deg"]
    ci = _ci_unit(token)
    if ci:
        if notes is not None:
            notes.append(ci[1])
        return ci[0]
    hint = difflib.get_close_matches(token, list(_EXACT) + list(_WORDS), n=3, cutoff=0.6)
    raise UnitError(f"Unsupported unit '{token}'" + (f" (did you mean {', '.join(repr(h) for h in hint)}?)" if hint else ""))


# --------------------------------------------------------------------------- #
# Compound unit parser:  m/s^2   kg*m/s²   J/(kg·K)   mol m-3   km per hour
# --------------------------------------------------------------------------- #
_UNIT_TOKEN = re.compile(
    r"""\s*(?:
        (?P<atom>°[CFK]?|[^\W\d_]+)(?P<iexp>[+-]?\d+)?
      | (?P<num>\d+(?:\.\d+)?)
      | (?P<op>\*\*|[*/^()\-])
    )""", re.X)


def _prepare_unit_text(text: str) -> str:
    s = convert_superscripts(str(text), "caret") if re.search("[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]", str(text)) else str(text)
    s = re.sub(r"[​﻿]", "", s)
    s = s.replace("℃", "°C").replace("℉", "°F").replace("º", "°")
    s = re.sub(r"(?i)\bdeg(?:rees?)?\s*([CFK])\b", r"°\1", s)
    s = re.sub(r"\s+per\s+", "/", s, flags=re.I)
    s = re.sub(r"[·⋅∙×•]", "*", s).replace("−", "-").replace("÷", "/")
    s = s.replace("°K", "K")
    return s.strip()


class _UnitParser:
    def __init__(self, text: str, notes: list[str], expected: Dimension | None):
        self.text, self.notes, self.expected = _prepare_unit_text(text), notes, expected
        self.tokens: list[tuple[str, str, str | None]] = []
        pos = 0
        while pos < len(self.text):
            m = _UNIT_TOKEN.match(self.text, pos)
            if not m or m.end() == pos:
                raise UnitError(f"Could not parse unit '{text}'")
            if m.group("atom"):
                self.tokens.append(("atom", m.group("atom"), m.group("iexp")))
            elif m.group("num"):
                self.tokens.append(("num", m.group("num"), None))
            else:
                self.tokens.append(("op", m.group("op"), None))
            pos = m.end()
        self.i = 0
        self.simple_atom: Unit | None = None
        self.atom_count = 0

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def parse(self) -> tuple[Dimension, Fraction, Fraction]:
        if not self.tokens:
            return DIMENSIONLESS, _F(1), _F(0)
        d, f = self.expr()
        if self.i != len(self.tokens):
            raise UnitError(f"Could not parse unit '{self.text}'")
        if self.atom_count == 1 and self.simple_atom is not None and self.simple_atom.affine and self._plain:
            return self.simple_atom.dim, self.simple_atom.factor, self.simple_atom.offset
        return d, f, _F(0)

    _plain = True

    def expr(self):
        d, f = self.term()
        while True:
            t = self.peek()
            if t is None or (t[0] == "op" and t[1] == ")"):
                return d, f
            if t == ("op", "*", None) or t == ("op", "-", None):
                self.i += 1; d2, f2 = self.term(); d, f = d * d2, f * f2; self._plain = False
            elif t == ("op", "/", None):
                self.i += 1; d2, f2 = self.term(); d, f = d / d2, f / f2; self._plain = False
            elif t[0] in ("atom", "num") or t == ("op", "(", None):
                d2, f2 = self.term(); d, f = d * d2, f * f2; self._plain = False   # implicit: "kg m"
            else:
                raise UnitError(f"Could not parse unit '{self.text}'")

    def term(self):
        t = self.peek()
        if t is None:
            raise UnitError(f"Could not parse unit '{self.text}'")
        iexp: Fraction | None = None
        if t[0] == "atom":
            self.i += 1
            u = lookup_atom(t[1], self.notes, self.expected)
            self.atom_count += 1; self.simple_atom = u
            d, f = u.dim, u.factor
            if t[2] is not None:
                iexp = Fraction(int(t[2]))
        elif t[0] == "num":
            self.i += 1
            if t[1] != "1":
                raise UnitError(f"Unexpected number '{t[1]}' in unit '{self.text}'")
            d, f = DIMENSIONLESS, _F(1)
        elif t == ("op", "(", None):
            self.i += 1; d, f = self.expr()
            if self.peek() != ("op", ")", None):
                raise UnitError(f"Unbalanced parentheses in unit '{self.text}'")
            self.i += 1; self._plain = False
        else:
            raise UnitError(f"Could not parse unit '{self.text}'")
        nxt = self.peek()
        if nxt and nxt[0] == "op" and nxt[1] in ("^", "**"):
            self.i += 1; iexp = self.exponent()
        if iexp is not None:
            d = d ** iexp
            f = f ** int(iexp) if iexp.denominator == 1 else Fraction(float(f) ** float(iexp))
            if iexp != 1:
                self._plain = False
        return d, f

    def exponent(self) -> Fraction:
        paren = self.peek() == ("op", "(", None)
        if paren:
            self.i += 1
        sign = 1
        t = self.peek()
        if t and t[0] == "op" and t[1] in "-":
            sign = -1; self.i += 1; t = self.peek()
        if not t or t[0] != "num":
            raise UnitError(f"Bad exponent in unit '{self.text}'")
        self.i += 1
        value = Fraction(t[1])
        if paren and self.peek() == ("op", "/", None):
            self.i += 1; t2 = self.peek()
            if not t2 or t2[0] != "num":
                raise UnitError(f"Bad exponent in unit '{self.text}'")
            self.i += 1; value /= Fraction(t2[1])
        if paren:
            if self.peek() != ("op", ")", None):
                raise UnitError(f"Bad exponent in unit '{self.text}'")
            self.i += 1
        return sign * value


def parse_unit(text: str, *, expected: Dimension | None = None, notes: list[str] | None = None) -> Unit:
    """Parse a (possibly compound) unit string.

    A bare ``°C``/``°F`` keeps its offset (absolute temperature).  Inside a compound
    (``J/(kg·°C)``) the degree is a temperature *interval*, so only its size is used.
    """
    local: list[str] = [] if notes is None else notes
    dim, factor, offset = _UnitParser(text, local, expected).parse()
    return Unit(dim, factor, offset, _prepare_unit_text(text) or "1")


# --------------------------------------------------------------------------- #
# Quantities
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Quantity:
    value: float
    unit: Unit

    @property
    def dimension(self) -> Dimension:
        return self.unit.dim

    def _si_exact(self, delta: bool) -> Fraction:
        return Fraction(self.value) * self.unit.factor + (0 if delta else self.unit.offset)

    def to_si(self, *, delta: bool = False) -> float:
        return float(self._si_exact(delta))

    def to(self, target: "Unit | str", *, delta: bool = False) -> float:
        tu = parse_unit(target) if isinstance(target, str) else target
        if tu.dim != self.unit.dim:
            raise DimensionError(
                f"Incompatible units: {self.unit.symbol or 'dimensionless'} ({self.unit.dim.name()}) "
                f"and {tu.symbol or 'dimensionless'} ({tu.dim.name()})")
        out = float((self._si_exact(delta) - (0 if delta else tu.offset)) / tu.factor)
        if not math.isfinite(out):
            raise UnitError("Conversion result is non-finite")
        return out


def parse_quantity(text: str, *, expected: Dimension | None = None, notes: list[str] | None = None) -> Quantity:
    """Parse ``"500 g"``, ``"2 m/s²"``, ``"25 °C"``, ``"1.5×10^-3 kg"``.  A bare number is dimensionless."""
    try:
        value, rest = split_number_prefix(text)
    except NotationError as exc:
        raise UnitError(str(exc)) from exc
    unit = parse_unit(rest, expected=expected, notes=notes) if rest else Unit(DIMENSIONLESS, _F(1), _F(0), "")
    return Quantity(value, unit)


def convert(value: float, from_unit: str, to_unit: str, *, delta: bool = False,
            notes: list[str] | None = None) -> float:
    fu = parse_unit(from_unit, notes=notes)
    tu = parse_unit(to_unit, expected=fu.dim, notes=notes)
    return Quantity(float(value), fu).to(tu, delta=delta)


def dimension_of(unit_text: str, notes: list[str] | None = None) -> Dimension:
    return parse_unit(unit_text, notes=notes).dim


def supported_unit_symbols() -> Iterable[str]:
    return sorted(_EXACT) + sorted(_WORDS)
