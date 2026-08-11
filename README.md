<p align="center">
  <img src="Assets/banner.png" alt="NeuroArxiv — Never Build From Scratch" width="100%">
</p>

# NeuroArxiv — a skill to kill from-scratch coding

[![CI](https://github.com/UditAkhourii/neuroarxiv/actions/workflows/ci.yml/badge.svg)](https://github.com/UditAkhourii/neuroarxiv/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](#install)

> ### 🎮 [**Join the Discord →**](https://discord.gg/NbWwkwwGw)
> This is where the real-time thinking happens: arXiv category coverage, eval design, prior-art hunting, and neurodivergence-inspired research on reasoning architectures — shared with the [ADHD](https://github.com/UditAkhourii/adhd) community. Got opinions on isolation discipline, corpus gaps, or just want to argue about the next eval problem — **[come argue with us live](https://discord.gg/NbWwkwwGw).**

> 👉 [**Join the community →**](https://tally.so/r/WO1Nzj) as a contributor, maintainer, early adopter, or just a member. One short form. We coordinate category-taxonomy contributions, eval problems, integrations, and adopter onboarding there.

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

## Fair fight: cold vs. general web search vs. NeuroArxiv

Not "research vs. no research" — that's an easy win for anyone. The real
question is whether NeuroArxiv's isolate-then-converge discipline beats a
plain, capable agent with normal web + arXiv access and no special process.
Same model, same 5 cross-domain problems (physics, applied math,
quantitative biology, ML, statistics), three conditions, run independently.
A sample of the web-search condition's citations was verified against the
real arXiv API before anything below was scored — it's a genuinely grounded
condition, not a strawman.

**The headline isn't a ratio.** Every transcript was re-read for one
specific pattern: does the answer name a source it just cited and flag a
real limitation in *that source's own claim* — not a generic risk, a
documented weakness in the specific paper.

| | Cold | Web + arXiv (undisciplined) | **NeuroArxiv** |
| --- | :---: | :---: | :---: |
| Problems with a source-skepticism flag | 0/5 | 0/5 | **5/5** |
| Total flags | 0 | 0 | **7** |

Zero vs. zero vs. seven, out of five problems each. NeuroArxiv caught a
withdrawn proof it had cited and declined to rely on it. It caught a
benchmark result validated at only one context length and flagged it before
recommending the approach. Cold and web-search both produced real,
reasonable answers — neither produced that.

On raw answer quality (specificity, risk quality), NeuroArxiv beat the
web-search condition by a modest **1.1x–1.3x**, and *lost* on citation
breadth in 2 of 5 problems — arXiv-only search has a narrower net than
general web search, and that's reported, not hidden. Full scorecard,
per-problem transcripts, and every honest limitation:
[`EVALS.md`](./EVALS.md) · raw data: [`bench/deep-tech-eval-transcripts.md`](./bench/deep-tech-eval-transcripts.md).

---

## Install

One line, no clone, no build step of your own:

```bash
npx github:UditAkhourii/neuroarxiv install
```

Works for **Claude Code and Codex CLI**. Both discover skills at
`<agent home>/skills/<name>/SKILL.md` and read the same frontmatter, so one
bundled skill serves both — with no flag, `install` picks whichever agents are
actually present on your machine.

| Target | Flag | Lands in |
| --- | --- | --- |
| Claude Code | `--claude` | `~/.claude/skills/neuroarxiv` |
| Codex CLI | `--codex` | `~/.codex/skills/neuroarxiv` |
| Both | `--all` | both, whether or not they're detected |

Pin a target explicitly when you want it installed regardless of detection:

```bash
npx github:UditAkhourii/neuroarxiv install --codex
```

`CLAUDE_CONFIG_DIR` and `CODEX_HOME` are honoured if you keep those directories
somewhere non-default.

Restart the agent (or start a new session) and NeuroArxiv is live — in Claude
Code as `/neuroarxiv "<problem>"`, in Codex by asking for it by name.

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
