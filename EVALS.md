# NeuroArxiv vs baseline — the eval

Run: session-based, 2026-08-06 · problems: 5

**Headline:** NeuroArxiv 2W / 1 marginal / 1 tie / 1 correct abort, vs a
single-shot baseline at the same underlying model.

This is a small, self-graded comparison — two subagents run in the same
session on 5 problems chosen by the author, judged by the author, not an
independent blind reviewer. Treat it as a first data point, not a proof.
A bigger, ideally blind-judged eval is the natural next step; this doc will
be updated when that exists.

## Methodology

Same underlying model, run twice per problem:

- **Cold** — no tools, answers straight from the model's own reasoning, exactly
  like an ordinary "design this for me" request.
- **NeuroArxiv** — follows [`SKILL.md`](skills/neuroarxiv/SKILL.md): map the
  problem to arXiv categories, real HTTP fetch against `export.arxiv.org`,
  isolated read per paper, score + cluster, converge to one recommended path.

To keep 5 scenarios tractable in one sitting, the NeuroArxiv run used a
budget-constrained isolation mode — sequential single-context reads instead
of true parallel Agent-per-paper spawns — noted explicitly by the agent that
ran it. That means both the token count and wall-clock below are
approximations of the loop as specified, not an exact measurement of it. A
faithful run would likely cost more in tokens (more Agent spawns) and less
in wall-clock (true parallelism), not more of both.

## Per-scenario verdicts

### Rate limiter across a leader election — tied
*"Design a rate limiter that stays correct across a leader election, where
the old leader's in-memory counters are lost with no warning."*

Both landed on the same architecture: externalize the counter, checkpoint,
fail conservative on failover. NeuroArxiv cited real leader-election papers
and added a risk note (checkpoint lag reproduces the same problem one level
down), but the recommended *design* didn't change. The cited papers were
generic leader-election theory, only loosely on-target for a rate-limiter-
specific question — a useful check on the honesty of this eval: a citation
attached to a recommendation isn't automatically a better recommendation.

### RAG pipeline: filter irrelevant retrieved context — marginal win
*"What's the best approach to detect when a RAG pipeline retrieved
irrelevant or low-quality context before that context reaches the LLM?"*

Cold: similarity threshold + cross-encoder reranker. NeuroArxiv: an
NLI/entailment pre-filter, citing two real, well-known RAG-robustness papers
(`2310.01558`, `2302.00093`), plus a sharper failure mode — naive
thresholding silently cuts recall instead of just "drifting." The underlying
technique family is close to what the cold answer already proposed; the win
is precision of framing and citation-backed grounding, not a different
architecture.

### Multiple coding agents on one repo — clear win
*"Multiple coding agents are working on the same repository concurrently.
How should they coordinate so they don't overwrite or conflict with each
other's edits?"*

Cold: "use a lock file" — never specifies who releases it, what happens on
timeout, how staleness is handled. NeuroArxiv named an actual protocol
(Contract-Net-style claim rounds: announce → claim → award → renew/release),
citing a paper on coordinating LLM agents specifically
([`2602.04418`](https://arxiv.org/abs/2602.04418)) recent enough that no
model's training data plausibly has it. This is a genuinely different,
more complete design, not a rebranded one — the cold answer's gap (who
arbitrates conflicting claims) is exactly what the cited protocol answers
by construction.

### Add a boolean dark-mode settings flag — correct abort
NeuroArxiv's pre-flight gate correctly recognized this as closed/trivial —
no real technical mechanism, no architecture commitment, approach already
fully specified — and skipped straight to "just build it." Zero fetches
spent. The cold answer also scoped this correctly and didn't over-engineer
it; the value here is cost discipline, not design quality.

### Postgres p99 latency, small skewed hot set — clear win
*"Reduce p99 read latency for a Postgres-backed API where the workload is
read-heavy with a small, skewed hot set of rows."*

Cold: "add a cache" (Redis/LRU) + indexes — never specifies how to identify
which rows are hot as that shifts. NeuroArxiv specified a heavy-hitter /
count-min-sketch approach, citing a paper
([`2006.08067`](https://arxiv.org/abs/2006.08067)) showing this beats plain
LRU/LFU/ARC at equal cache size for skewed workloads. This addresses the
actual hard part of the stated problem (tracking a *shifting* hot set) that
the cold answer glossed over entirely.

## Cost

| | Cold (no skill) | NeuroArxiv | Delta |
| --- | ---: | ---: | ---: |
| Wall-clock | 28.2s | 342.5s | ~12x |
| Tokens | 48,178 | 79,638 | ~1.65x |
| Real arXiv fetches | 0 | 9 | — |
| Tool calls | 0 | 11 | — |

Cost isn't evenly spread: the trivial scenario cost nothing (correct abort
before any fetch), so the 12x/1.65x is concentrated in the four scenarios
that actually warranted a check. NeuroArxiv is not faster or cheaper than a
cold answer — the entire case for it is design quality, not efficiency.

## Honest limitations

- **n=5, self-graded.** Not blind, not independently judged, not a large
  sample. The tie (scenario 1) is reported as a tie, not massaged into a win.
- **arXiv-only.** No coverage of ACM/IEEE-paywalled venues, postmortems,
  RFCs, or vendor engineering blogs — a lot of applied systems knowledge
  lives outside arXiv entirely.
- **Abstract-only reads.** No full-text reading, so recommendations are
  bounded by what an abstract can support.
- **Budget-constrained isolation mode**, as noted in Methodology above — the
  cost numbers approximate the spec, they don't measure it exactly.

## What would raise confidence

A bigger eval (more problems, more domains), independent/blind judging
(not the author grading the author's own tool), and a faithful run of the
true parallel Agent-per-paper isolation mode instead of the
budget-constrained sequential approximation used here.
