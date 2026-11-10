# Demo

## Before demo day

Run this on the demo laptop, with internet:

```bash
node scripts/start.mjs --setup
```

Then turn Wi-Fi off and run a full dry run. With the default setup the status pill says "No model".

## On the day

```bash
node scripts/start.mjs
```

Wait until the terminal prints "StemMatrix is ready", then open the URL it prints. Saved chats from the dry run are still in the browser. Keep them, or clear site data for this origin if you want the two sample chats only.

## What's real and what's scripted

Practice numeric questions, and the grade for those answers, come from the solver backend. Chat answers, flashcards, and textbook passages are scripted. They are labelled "Preview answer" or "sample". There is no language model and no textbook search yet. Say that out loud when you present.

## Questions to show

| Question | What it shows | What you should see |
| --- | --- | --- |
| Integrate x^2 from 0 to 3 | The first draft is wrong, and the solver sends it back | Preview answer. Textbook, Solver, and Model. Checked by the solver. The first attempt mismatches and the second matches. |
| Inverse of [[1,2],[2,4]] | A singular matrix | Preview answer. "That matrix has no inverse." |
| Integrate x^3 from 0 to 2 | The model's number never matches | Preview answer. "The model's answer didn't match. Showing the solver's result." |
| How fast is a car | The wording is too vague to calculate | Preview answer. A clarification, and "Edit your question" puts the text back in the composer. |
| Force on a 500 g mass accelerating at 2 m/s^2 | A unit conversion checked by the solver | Preview answer. 1 N. "Read 500 g as 0.5 kg." |
| Eigenvalues of [[0,-1],[1,0]] | Complex eigenvalues | Preview answer. i, -i |
| Integrate sin(x^2) from 0 to 1 | Stopping an answer that is still arriving | "Stopped before the answer finished." The parts that already arrived stay, and you can type again. |
| Practice: Evaluate the definite integral of x^2 from 0 to 3. Enter 9. | A live grade from the solver | Correct. This page does not say "sample questions". |

## If something breaks

Restart with `node scripts/start.mjs`.

If the backend will not start, use `node scripts/start.mjs --mock-ui`. The pill says "Preview", and the answers are still labelled.

Do not present `--test-model` as a real model. That flag only makes the pill say "Test model".
