# NeuroArxiv vs baseline — the eval

Run: session-based, 2026-08-08 · problems: 5, cross-domain · conditions: 3

**Headline:** across physics, applied math, quantitative biology, ML, and
statistics, NeuroArxiv is the only one of three conditions that caught a
broken or over-stated source and said so — 7 times, in every one of the 5
problems, versus zero for either alternative. On raw answer quality it beat
a general web+arXiv agent by a modest 1.1x–1.3x, not a dramatic multiple.

Full raw transcripts, unedited: [`bench/deep-tech-eval-transcripts.md`](bench/deep-tech-eval-transcripts.md).
This is a small, self-graded comparison — chosen and judged by the author,
not an independent blind reviewer. Treat it as a first data point, not a
proof.

## Methodology

Three conditions, same underlying model, same 5 problems, run independently
with no visibility into each other's output:

- **Cold** — no tools, straight from the model's own reasoning.
- **Web + arXiv (undisciplined)** — normal WebSearch/WebFetch access, used
  at the agent's own judgment. No isolation, no forced convergence — just a
  capable agent that can look things up. This is the fair comparison: not
  "no research vs. research," but "research vs. *disciplined* research."
- **NeuroArxiv** — follows [`SKILL.md`](skills/neuroarxiv/SKILL.md) exactly:
  pre-flight gate, categorize, real arXiv fetch, isolated read per paper,
  score + cluster, converge to one path.

**Problems** were chosen to be cross-domain and previously untested (no
reuse of earlier, already-known-good CS scenarios): decoherence mitigation
in superconducting qubits (physics), a memory-constrained sparse solver for
3D FEM systems (applied math), protein-ligand binding affinity prediction
from few labeled examples (quantitative biology), KV-cache compression
without losing needle-in-haystack accuracy (ML), and real-time regime-change
detection under a low false-positive budget (statistics).

Before scoring anything, a sample of the web+arXiv condition's self-reported
citations (`2403.05391`, `2606.24467`, `2407.16376`, `2306.04886`) was
independently verified against the real arXiv API — all four were real and
matched exactly. **The web+arXiv condition is not a strawman; it produced
genuinely grounded, verifiable citations across 20 real sources.**

NeuroArxiv's isolated reads used a budget-constrained sequential-in-context
mode rather than true parallel Agent-per-paper spawns, disclosed by the
agent itself in its transcript — the numbers below approximate the loop as
specified, they don't measure it exactly.

## Metric 1: Source-Skepticism Rate

**Definition:** a "flag" counts only when an answer names a specific source
it just cited and states a scope, reliability, or generalization limit in
*that source's own claim* — not a general domain-risk statement. Every
transcript across all three conditions was re-read specifically for this
pattern before counting.

| Condition | Problems with ≥1 flag | Total flags |
| --- | :---: | :---: |
| Cold | 0/5 | 0 — no sources cited, so this is structurally impossible |
| Web + arXiv | 0/5 | 0 — found across 20 real cited sources on re-read |
| **NeuroArxiv** | **5/5** | **7** |

The 7: an "idealized bound, no hardware validation" caveat on a decoherence
paper; a withdrawn-proof flag *and* an untested-transfer caveat on two
separate FEM solver papers; an infra-impracticality flag on a hybrid
quantum-NN approach; a single-context-length validation caveat *and* a
collapse-without-added-component caveat on two KV-cache papers; and a
flag that neither cited change-point paper reports an absolute false-positive
rate. Full text of each, in context, is in the raw transcripts.

**Why this is the honest headline instead of a ratio:** it isn't graded on
a sliding scale, so there's nothing to round up. It's a behavior that
happened in 5 of 5 problems for one condition and 0 of 5 for both others.
The caveat that has to travel with it: **n=5.** Zero flags for web+arXiv in
this sample means it didn't happen here, not that it structurally can't —
a bigger sample could turn up a counterexample.

## Metric 2: Answer quality margins

Every answer was scored 0–10 on three axes — specificity of the recommended
mechanism, quality of the named risk, and groundedness — before any margin
was computed. Full per-problem scores are in the raw transcripts; this is
the best single result found on each comparison, not the average, labeled
as such:

| Comparison | Best result | Margin |
| --- | --- | ---: |
| NeuroArxiv vs. cold | Protein-ligand binding, specificity: 6 → 9 | **1.5x** |
| NeuroArxiv vs. web+arXiv | Protein-ligand binding, specificity: 7 → 9 | **1.29x** |

Averaged across all 5 problems, NeuroArxiv beat web+arXiv by roughly
**1.1x–1.14x** on specificity and risk quality, and tied it on groundedness
overall. **NeuroArxiv also lost on groundedness in 2 of 5 problems** — on
the KV-cache and regime-change problems, the web+arXiv condition's broader
search net (not limited to arXiv) found more relevant citations. That loss
is reported here, not left out.

## What this also found: a real product gap

NeuroArxiv's curated category taxonomy (`src/categories.ts`) has no slot
for `quant-ph`, `cond-mat`, `q-bio`, or even `math.NA` (mainstream numerical
analysis, not a niche category). For 3 of the 5 problems, the agent had to
guess a category id from general arXiv-taxonomy knowledge, unverified by
any tool. All three guesses happened to be correct and returned valid
results — but there's currently no fallback if a guess is wrong; it would
fail silently into an empty result set with no self-correction signal. This
is a known, open issue, independent of how the eval above reads.

## Honest limitations

- **n=5, self-graded, one session.** Not blind, not independently judged.
- **arXiv-only by design.** No coverage of PNAS/PMC/bioRxiv/medRxiv or any
  paywalled venue — the web+arXiv condition's edge on groundedness in 2/5
  problems is a direct consequence of this, not a fluke.
- **Abstract-only reads** — no full-text reading, so recommendations are
  bounded by what an abstract can support.
- **Budget-constrained isolation mode**, as noted above — approximates the
  loop as specified, doesn't measure it exactly.

## Earlier eval (superseded)

A narrower, CS/systems-only, 2-condition version of this eval (cold vs.
NeuroArxiv, no web+arXiv condition) preceded this one. Its scorecard — 2
clear wins, 1 marginal win, 1 tie, 1 correct abort on a boolean settings
flag — is consistent with what's reported here, but this cross-domain,
3-condition version is the one to trust going forward.

## What would raise confidence further

A bigger sample (more problems, more domains), independent/blind judging
instead of author-graded, and a faithful run of the true parallel
Agent-per-paper isolation mode instead of the budget-constrained
approximation used in both evals so far.
