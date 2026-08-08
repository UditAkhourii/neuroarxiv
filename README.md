<p align="center">
  <img src="Assets/banner.png" alt="NeuroArxiv — Never Build From Scratch" width="100%">
</p>

# NeuroArxiv — a skill to kill from-scratch coding

[![CI](https://github.com/UditAkhourii/neuroarxiv/actions/workflows/ci.yml/badge.svg)](https://github.com/UditAkhourii/neuroarxiv/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](#install)

> **Before Claude designs something new, it checks arXiv first.**

Real papers, fetched over real HTTP, read in isolation so no source anchors
another, converged into ONE recommendation — cited, with a first step and
the known ways this has already gone wrong for somebody else. Not a search
wrapper: search finds you sources, NeuroArxiv forces a decision grounded in
them.

Reach for it before committing to non-trivial architecture, algorithms, or
systems techniques — anywhere real prior art plausibly exists and the cost
of guessing wrong is a rebuild, not a typo.

👤 **Author:** Udit Akhouri — [github.com/UditAkhourii](https://github.com/UditAkhourii)

---

## Side-by-side: cold vs NeuroArxiv

One eval problem, same model, two strategies. Full breakdown — all 5
problems, methodology, honest limitations — in [`EVALS.md`](./EVALS.md).

> **Problem.** *"Multiple coding agents are working on the same repository
> concurrently. How should they coordinate so they don't overwrite or
> conflict with each other's edits?"*

<table>
<tr>
<th width="50%">🟦 Cold (no skill)</th>
<th width="50%">🟧 NeuroArxiv</th>
</tr>
<tr valign="top">
<td>

"Use a git worktree or branch per agent, plus a lock file so agents claim
non-overlapping files before starting work."

**What's missing:** who releases the lock, what happens on timeout, how
staleness is handled. Correct in spirit, unspecified in practice.

</td>
<td>

Named an actual protocol — **Contract-Net-style claim rounds**: announce →
claim → award → renew/release — citing a paper on coordinating LLM agents
specifically, recent enough that no model's training data plausibly has it.

**What it adds:** the exact questions the cold answer left open, answered
by construction — because a real paper had already worked through them.

</td>
</tr>
</table>

**2 clear wins, 1 marginal win, 1 tie, 1 correct abort — out of 5.** Not a
sweep. Full scorecard, real cost numbers, and the honest caveats (small
sample, self-graded) in [`EVALS.md`](./EVALS.md).

---

## Install

One line, no clone, no build step of your own — drops the skill straight
into `~/.claude/skills/neuroarxiv`:

```bash
npx github:UditAkhourii/neuroarxiv install
```

Restart Claude Code (or start a new session) and `/neuroarxiv "<problem>"`
is live.

<details>
<summary>Prefer a full local checkout (editing the engine, running the CLI directly, contributing)?</summary>

```bash
git clone https://github.com/UditAkhourii/neuroarxiv.git
cd neuroarxiv
npm install
npm run build
node dist/cli.js install
```

</details>

## Quickstart

```bash
neuroarxiv "cache LLM completions across requests without serving stale answers"
neuroarxiv "leader election for a queue with flaky nodes" --papers 6
```

Inside Claude Code, no install is required to try it once — the skill in
[`skills/neuroarxiv/SKILL.md`](skills/neuroarxiv/SKILL.md) runs the same
loop using `WebFetch` against arXiv's export API directly. Full flag
reference: `neuroarxiv --help`.

---

## How it works

```
PROBLEM
  │
  ▼
0. CATEGORIZE  — map the problem onto 3-5 arXiv categories + search terms
  │
  ▼
1. FETCH       — real HTTP against export.arxiv.org, category by category
  │               (no LLM call — deterministic, courtesy-rate-limited)
  ▼
2. DIVERGE     — one isolated LLM read per paper, in parallel
  │               (each sees ONE abstract, never the others)
  ▼
3. SCORE       — relevance / practicality / rigor, per paper
   + CLUSTER   — group by underlying architectural angle
  │
  ▼
4. CONVERGE    — pick ONE cluster as the recommended path, synthesize,
                 cite, name the first step, name the risk, list pitfalls
                 pulled from EVERY paper's limitation — not just the winner's
```

Convergence is the deliberate departure from open-ended research tools:
NeuroArxiv doesn't hand back "here are 4 papers, you decide." It commits to
one recommendation, states why the runner-ups lost, and names what to watch
for even in the paths not taken.

Every claim traces to a fetched abstract — papers, ids, and links are real
arXiv metadata, never invented. The read prompt is explicitly forbidden
from quoting more than a few words verbatim, and the skill's anti-patterns
section calls out hallucinated citations as the failure mode to watch for.

---

## License

MIT

Skill: [`skills/neuroarxiv/SKILL.md`](./skills/neuroarxiv/SKILL.md) ·
Eval methodology: [`EVALS.md`](./EVALS.md)
