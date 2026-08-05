// Grounded tree-of-thought: read real prior art wide, converge on one path.
//
// The loop, mapped onto the ADHD diverge/converge shape but grounded in
// external documents instead of model imagination:
//   0. CATEGORIZE — map the build problem onto arXiv subject categories
//      and a handful of search terms.
//   1. FETCH — real HTTP against export.arxiv.org, category by category.
//      No LLM call. This is the "read the arxiv, category-wise" step.
//   2. DIVERGE / READ — one isolated LLM call per paper. No branch sees
//      another paper. Each extracts: the mechanism, what to steal, the
//      breaking condition.
//   3. SCORE + CLUSTER — the critic comes back online. Score every
//      reading, cluster into underlying architectural angles.
//   4. CONVERGE — pick ONE cluster as the recommended path (not a
//      shortlist), synthesize its papers into a build plan with
//      citations, name the runner-ups' trade-offs in one line each, and
//      surface known pitfalls pulled from every paper's limitation, not
//      just the winner's.

import pLimit from "p-limit";
import { z } from "zod";
import { callLLM, parseJSON } from "./llm.js";
import { renderCategoryTable, looksLikeCategoryId } from "./categories.js";
import { searchArxivCategories, widenSearch } from "./arxiv.js";
import type {
  AlternatePath,
  Citation,
  Cluster,
  ConvergedPath,
  Paper,
  PaperRead,
  RunOptions,
  RunResult,
  Score,
} from "./types.js";

const CategorySelectSchema = z.object({
  categories: z.array(z.object({ id: z.string(), why: z.string() })).min(1),
  terms: z.array(z.string()).min(1),
  note: z.string().optional(),
});

const ReadSchema = z.object({
  approach: z.string(),
  borrow: z.string(),
  limitation: z.string(),
  relevanceNote: z.string(),
});

const ScoreRowSchema = z.array(
  z.object({
    id: z.string(),
    relevance: z.number().min(0).max(10),
    practicality: z.number().min(0).max(10),
    rigor: z.number().min(0).max(10),
    trap: z.string().optional(),
    strength: z.string().optional(),
  }),
);

const ClusterSchema = z.array(
  z.object({ label: z.string(), paperIds: z.array(z.string()) }),
);

const ConvergeSchema = z.object({
  chosenClusterLabel: z.string(),
  sketch: z.string(),
  citations: z.array(z.object({ paperId: z.string(), role: z.string() })),
  firstStep: z.string(),
  loadBearingRisk: z.string(),
  avoid: z.array(z.string()),
  alternates: z.array(z.object({ label: z.string(), oneLiner: z.string() })),
  openThread: z.string(),
});

const CATEGORY_SYSTEM = `You map a software/engineering build problem onto arXiv's subject taxonomy so
real prior art can be found before anything gets built.

You'll be given a curated list of common categories. Pick 3-5 whose subject
matter plausibly contains prior art for this problem. You may also name a
category outside the list if you're confident of its id (arXiv ids look like
"cs.XX" or "stat.ML") — the list is a starting point, not a wall.

Also produce 3-6 short search terms (2-4 words each): the core technical
mechanism words (e.g. "cache invalidation", "leader election", "attention
routing"), not generic filler ("system", "approach", "framework").

If the problem is pure product/business framing with no obvious technical
mechanism, say so honestly in "note" — but still commit to your best
technical-angle guess. Most build problems have an adjacent research angle
(caching, consistency, ranking, scheduling, retrieval) even when not phrased
that way.

Output JSON only: {"categories":[{"id":"cs.AI","why":"..."}],"terms":["...","..."],"note":"optional, omit if not needed"}`;

const READ_SYSTEM = `You are in DIVERGENT READ mode. You have exactly one paper's title and
abstract, and one build problem. You do not know what other papers exist —
do not assume, invent, or gesture at a broader survey.

Read this abstract as if scouting prior art for someone about to build the
stated thing from scratch. Never quote the abstract verbatim beyond a few
consecutive words — paraphrase in your own words.

Extract:
- approach: the core technical mechanism/architecture this paper uses (1-2 sentences)
- borrow: the single most concrete, implementable thing a builder could steal
  from this today (1 sentence, imperative: "Use X to do Y"). If the paper is
  too tangential to yield a real "borrow", say so plainly and name the
  tangent.
- limitation: the load-bearing weakness, or the condition under which this
  approach breaks (1 sentence)
- relevanceNote: how directly this addresses the stated problem (1 short clause)

Output JSON only: {"approach":"...","borrow":"...","limitation":"...","relevanceNote":"..."}`;

const SCORE_SYSTEM = `You are the critic scoring how directly arXiv papers help someone building a
specific system. Score each paper's READING (not the raw abstract) on three
axes, 0-10:
- relevance: how directly this addresses the stated build problem
- practicality: could a small team implement/adapt this without exotic
  infra, huge compute, or unpublished tricks
- rigor: does the abstract itself indicate real evidence (benchmarks,
  proofs, a shipped system) vs a purely conceptual proposal

Tell the truth about weaknesses. Two symmetric signals per paper:
- "strength": required, even for weak papers. The one concrete thing this
  paper's approach gets right.
- "trap" (optional): a known failure mode or hidden cost implied by its own
  stated limitation — phrase as an actionable heads-up ("solid up to N,
  breaks under concurrent writers"), not a dismissal.

Output JSON only.`;

const CLUSTER_SYSTEM = `You group paper readings into 3-6 clusters by their UNDERLYING ARCHITECTURAL
ANGLE (not by surface keywords or which paper they came from). Cluster
labels name the angle, e.g. "cache-invalidation plays", "consensus-free
plays", "learned-index plays". Output JSON only.`;

const CONVERGE_SYSTEM = `You are in CONVERGENT SYNTHESIS mode. You've been given several arXiv papers,
grouped into clusters by underlying architectural angle, each with a
per-paper score (relevance/practicality/rigor) and a short reading
(approach/borrow/limitation).

Your job: pick ONE cluster as THE recommended path for the stated build
problem — not a menu, an actual recommendation — and synthesize its papers
into one coherent implementation plan.

Rules:
- Choose the cluster with the strongest combination of relevance and
  practicality, not just novelty or rigor. A rigorous but impractical
  cluster loses to a rougher-but-buildable one for a build problem.
- The sketch must be actionable: describe the mechanism as something a
  builder starts today, not a literature summary. 4-8 sentences.
- citations: cite specific papers from the chosen cluster (and, if directly
  relevant, one cautionary paper from another cluster) with a role for each
  ("primary mechanism", "supporting evidence", "failure mode to avoid").
- avoid: pull concrete prior-art pitfalls from the LIMITATION field of ANY
  paper, not just the chosen cluster's — these are failure modes a builder
  shouldn't have to rediscover the hard way.
- alternates: for every cluster NOT chosen, one honest sentence on the
  real trade-off that lost it the pick — not a dismissal.
- openThread: one question the read papers raise but don't answer —
  something worth a design-review checkpoint before shipping.

Output JSON only.`;

function deriveNaiveTerms(problem: string): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "for", "with", "that", "this", "into",
    "from", "using", "build", "want", "need", "system", "approach",
  ]);
  const words = problem
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  return [...new Set(words)].slice(0, 5);
}

async function selectCategories(
  problem: string,
  context: string | undefined,
  model: string | undefined,
): Promise<{ categories: { id: string; why: string }[]; terms: string[]; note?: string }> {
  const userPrompt = `PROBLEM:
${problem}

${context ? `CONTEXT:\n${context}\n\n` : ""}CURATED CATEGORY LIST:
${renderCategoryTable()}

Pick categories and search terms. Output JSON only.`;

  const raw = await callLLM({ model, systemPrompt: CATEGORY_SYSTEM, userPrompt });
  try {
    const parsed = parseJSON(raw, CategorySelectSchema);
    const categories = parsed.categories.filter((c) => looksLikeCategoryId(c.id));
    if (categories.length === 0) throw new Error("no valid category ids");
    return { categories, terms: parsed.terms, note: parsed.note };
  } catch {
    // Fail open — default to a broad, generally-useful spread.
    return {
      categories: [
        { id: "cs.AI", why: "fallback: category-select pass failed to parse" },
        { id: "cs.SE", why: "fallback: category-select pass failed to parse" },
        { id: "cs.DC", why: "fallback: category-select pass failed to parse" },
      ],
      terms: deriveNaiveTerms(problem),
    };
  }
}

async function readPaper(
  problem: string,
  context: string | undefined,
  paper: Paper,
  model: string | undefined,
): Promise<PaperRead> {
  const year = paper.published.slice(0, 4);
  const authors = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
  const userPrompt = `PROBLEM:
${problem}

${context ? `CONTEXT:\n${context}\n\n` : ""}PAPER (arXiv:${paper.id}, ${year}):
Title: ${paper.title}
Authors: ${authors}
Abstract: ${paper.summary}

Output JSON only.`;

  const raw = await callLLM({ model, systemPrompt: READ_SYSTEM, userPrompt });

  try {
    const parsed = parseJSON(raw, ReadSchema);
    return { paper, ...parsed };
  } catch {
    return {
      paper,
      approach: "(read pass failed to parse)",
      borrow: "(unavailable)",
      limitation: "(unavailable)",
      relevanceNote: "(unavailable)",
    };
  }
}

async function scoreReads(
  problem: string,
  reads: PaperRead[],
  model: string | undefined,
): Promise<Map<string, Score>> {
  if (reads.length === 0) return new Map();

  const userPrompt = `PROBLEM:
${problem}

READINGS (id :: title :: approach :: borrow :: limitation):
${reads
  .map((r) => `${r.paper.id} :: ${r.paper.title} :: ${r.approach} :: ${r.borrow} :: ${r.limitation}`)
  .join("\n")}

Score each. Output JSON array:
[{"id":"...","relevance":0-10,"practicality":0-10,"rigor":0-10,"strength":"...","trap":"... or omit"}]`;

  const raw = await callLLM({ model, systemPrompt: SCORE_SYSTEM, userPrompt });

  let rows: z.infer<typeof ScoreRowSchema>;
  try {
    rows = parseJSON(raw, ScoreRowSchema);
  } catch {
    return new Map();
  }

  const out = new Map<string, Score>();
  for (const r of rows) {
    // Practicality weighted heaviest — the point is to build, not survey.
    // Relevance next; rigor is a smaller tiebreaker (a well-evidenced paper
    // that doesn't fit the problem is still the wrong pick).
    const total = r.relevance * 0.4 + r.practicality * 0.4 + r.rigor * 0.2;
    out.set(r.id, {
      relevance: r.relevance,
      practicality: r.practicality,
      rigor: r.rigor,
      total,
      trap: r.trap,
      strength: r.strength,
    });
  }
  return out;
}

async function clusterReads(
  problem: string,
  reads: PaperRead[],
  model: string | undefined,
): Promise<Cluster[]> {
  if (reads.length === 0) return [];

  const userPrompt = `PROBLEM:
${problem}

READINGS:
${reads.map((r) => `${r.paper.id} :: ${r.paper.title} :: ${r.approach}`).join("\n")}

Output JSON: [{"label":"...","paperIds":["...","..."]}]`;

  const raw = await callLLM({ model, systemPrompt: CLUSTER_SYSTEM, userPrompt });

  try {
    return parseJSON(raw, ClusterSchema);
  } catch {
    return [];
  }
}

async function convergeToOnePath(
  problem: string,
  reads: PaperRead[],
  clusters: Cluster[],
  model: string | undefined,
): Promise<{ chosenPath: ConvergedPath; alternates: AlternatePath[]; openThread: string } | null> {
  const effectiveClusters =
    clusters.length > 0 ? clusters : [{ label: "all findings", paperIds: reads.map((r) => r.paper.id) }];

  const clusterBlocks = effectiveClusters
    .map((c) => {
      const members = c.paperIds
        .map((id) => reads.find((r) => r.paper.id === id))
        .filter((r): r is PaperRead => Boolean(r));
      const memberText = members
        .map((r) => {
          const chip = r.score
            ? `[rel${r.score.relevance} prac${r.score.practicality} rig${r.score.rigor}]`
            : "";
          return `  - ${r.paper.id} :: "${r.paper.title}" (${r.paper.published.slice(0, 4)}) ${chip}
    approach: ${r.approach}
    borrow: ${r.borrow}
    limitation: ${r.limitation}`;
        })
        .join("\n");
      return `CLUSTER "${c.label}":\n${memberText}`;
    })
    .join("\n\n");

  const userPrompt = `PROBLEM:
${problem}

${clusterBlocks}

Pick ONE cluster as the recommended path and synthesize. Output JSON only.`;

  const raw = await callLLM({ model, systemPrompt: CONVERGE_SYSTEM, userPrompt });

  let parsed: z.infer<typeof ConvergeSchema>;
  try {
    parsed = parseJSON(raw, ConvergeSchema);
  } catch {
    return null;
  }

  const chosenCluster =
    effectiveClusters.find((c) => c.label === parsed.chosenClusterLabel) ?? effectiveClusters[0];

  const citations: Citation[] = parsed.citations.map((c) => {
    const r = reads.find((x) => x.paper.id === c.paperId);
    return {
      paperId: c.paperId,
      title: r?.paper.title ?? c.paperId,
      url: r?.paper.absUrl ?? `https://arxiv.org/abs/${c.paperId}`,
      role: c.role,
    };
  });

  return {
    chosenPath: {
      clusterLabel: chosenCluster.label,
      sketch: parsed.sketch,
      citations,
      firstStep: parsed.firstStep,
      loadBearingRisk: parsed.loadBearingRisk,
      avoid: parsed.avoid,
    },
    alternates: parsed.alternates,
    openThread: parsed.openThread,
  };
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const {
    problem,
    context,
    categories: categoryOverride,
    papersPerCategory = 4,
    concurrency = 4,
    sinceYears = 8,
    model,
    criticModel,
    onEvent,
  } = opts;

  const critic = criticModel ?? model;

  // PHASE 0 — CATEGORIZE. Skipped if the caller pinned categories.
  let categories: { id: string; why: string }[];
  let terms: string[];
  let note: string | undefined;
  if (categoryOverride && categoryOverride.length > 0) {
    categories = categoryOverride.map((id) => ({ id, why: "user-specified" }));
    terms = deriveNaiveTerms(problem);
  } else {
    const sel = await selectCategories(problem, context, model);
    categories = sel.categories;
    terms = sel.terms;
    note = sel.note;
  }
  onEvent?.({ kind: "categories:done", categories: categories.map((c) => c.id), terms });

  const categoryIds = categories.map((c) => c.id);

  // PHASE 1 — FETCH. Real HTTP against export.arxiv.org. No LLM.
  let papers = await searchArxivCategories(categoryIds, terms, papersPerCategory, sinceYears, (f) => {
    onEvent?.({ kind: "fetch:done", category: f.category, count: f.papers.length });
  });

  if (papers.length < 3) {
    onEvent?.({ kind: "warn", message: "thin results — widening search by dropping search terms" });
    const widened = await widenSearch(categoryIds, papersPerCategory, sinceYears);
    const byId = new Map(papers.map((p) => [p.id, p]));
    for (const p of widened) if (!byId.has(p.id)) byId.set(p.id, p);
    papers = [...byId.values()];
  }

  if (papers.length === 0) {
    return {
      problem,
      categories,
      searchTerms: terms,
      note,
      papers: [],
      reads: [],
      clusters: [],
      chosenPath: null,
      alternates: [],
      openThread:
        "No papers surfaced for these categories/terms — that's itself a signal: either the mechanism is too novel for arXiv, or the search terms need to be more literal. Try --categories or narrower terms.",
    };
  }

  // PHASE 2 — DIVERGE / READ. Parallel, isolated. No branch sees another paper.
  const limit = pLimit(concurrency);
  const reads = await Promise.all(
    papers.map((p) =>
      limit(async () => {
        onEvent?.({ kind: "read:start", paperId: p.id, title: p.title });
        const r = await readPaper(problem, context, p, model);
        onEvent?.({ kind: "read:done", paperId: p.id });
        return r;
      }),
    ),
  );

  // PHASE 3 — SCORE + CLUSTER. Critic comes back online.
  const [scoreMap, clusters] = await Promise.all([
    scoreReads(problem, reads, critic),
    clusterReads(problem, reads, critic),
  ]);
  for (const r of reads) r.score = scoreMap.get(r.paper.id);
  for (const c of clusters)
    for (const id of c.paperIds) {
      const r = reads.find((x) => x.paper.id === id);
      if (r) r.cluster = c.label;
    }
  onEvent?.({ kind: "score:done", total: reads.length });
  onEvent?.({ kind: "cluster:done", clusters: clusters.length });

  // PHASE 4 — CONVERGE. One recommended path, not a shortlist.
  const converged = await convergeToOnePath(problem, reads, clusters, critic);
  onEvent?.({ kind: "converge:done", chosen: converged?.chosenPath.clusterLabel ?? null });

  return {
    problem,
    categories,
    searchTerms: terms,
    note,
    papers,
    reads,
    clusters,
    chosenPath: converged?.chosenPath ?? null,
    alternates: converged?.alternates ?? [],
    openThread: converged?.openThread ?? "What did none of these papers address?",
  };
}
