export type Paper = {
  id: string; // bare arXiv id, e.g. "2401.12345"
  version: string; // versioned id, e.g. "2401.12345v2"
  title: string;
  summary: string; // abstract, whitespace-normalized
  authors: string[];
  categories: string[]; // every category (searched or declared) this paper surfaced under
  published: string; // ISO date, first submission
  updated: string; // ISO date, latest version
  absUrl: string;
  pdfUrl: string;
};

export type Score = {
  relevance: number; // 0-10, how directly it addresses the stated problem
  practicality: number; // 0-10, implementable by a small team without exotic infra
  rigor: number; // 0-10, evidence the abstract itself claims (benchmarks, proofs, deployment) vs pure concept
  total: number; // weighted
  trap?: string; // known failure mode / prior-art pitfall, if the abstract implies one
  strength?: string; // the one concrete thing this paper gets right
};

export type PaperRead = {
  paper: Paper;
  approach: string; // core technical mechanism, in the reader's own words
  borrow: string; // single most concrete implementable takeaway
  limitation: string; // load-bearing weakness / breaking condition
  relevanceNote: string; // one clause on fit to the stated problem
  cluster?: string;
  score?: Score;
};

export type Cluster = {
  label: string; // underlying architectural angle, not a paper title
  paperIds: string[]; // Paper.id values
};

export type Citation = {
  paperId: string;
  title: string;
  url: string;
  role: string; // e.g. "primary mechanism", "supporting evidence", "failure mode to avoid"
};

export type ConvergedPath = {
  clusterLabel: string;
  sketch: string; // 4-8 sentences: the recommended architecture, synthesized across the cluster's papers
  citations: Citation[];
  firstStep: string;
  loadBearingRisk: string;
  avoid: string[]; // known prior-art pitfalls to not repeat, drawn from across ALL clusters
};

export type AlternatePath = {
  label: string;
  oneLiner: string; // why it was considered but not chosen
};

export type RunResult = {
  problem: string;
  categories: { id: string; why: string }[];
  searchTerms: string[];
  note?: string; // honesty flag when the problem has weak arXiv coverage
  papers: Paper[];
  reads: PaperRead[];
  clusters: Cluster[];
  chosenPath: ConvergedPath | null;
  alternates: AlternatePath[];
  openThread: string;
};

export type RunOptions = {
  problem: string;
  context?: string; // codebase snippets, constraints, stack
  categories?: string[]; // override auto-detected arXiv category ids
  papersPerCategory?: number; // default 4
  concurrency?: number; // parallel LLM read calls, default 4
  sinceYears?: number; // filter papers older than N years, default 8 (0 = no filter)
  model?: string; // override SDK model (reader + synthesizer)
  criticModel?: string; // override model for score + cluster passes; falls back to `model`
  onEvent?: (e: RunEvent) => void;
};

export type RunEvent =
  | { kind: "categories:done"; categories: string[]; terms: string[] }
  | { kind: "fetch:done"; category: string; count: number }
  | { kind: "read:start"; paperId: string; title: string }
  | { kind: "read:done"; paperId: string }
  | { kind: "score:done"; total: number }
  | { kind: "cluster:done"; clusters: number }
  | { kind: "converge:done"; chosen: string | null }
  | { kind: "warn"; message: string };
