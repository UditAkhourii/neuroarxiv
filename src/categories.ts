// Curated subset of arXiv's subject taxonomy, biased toward categories a
// software/AI builder is likely to have prior art in. Not exhaustive — the
// full taxonomy has 150+ categories across physics, math, econ, etc. The
// category-select LLM pass is told it may return an id outside this list if
// it knows arXiv's taxonomy well enough to be confident; this list exists so
// the common case needs no guessing.

export type CategoryDef = {
  id: string;
  label: string;
  description: string;
};

export const CATEGORIES: CategoryDef[] = [
  { id: "cs.AI", label: "Artificial Intelligence", description: "general AI systems, agents, planning, knowledge representation" },
  { id: "cs.LG", label: "Machine Learning", description: "learning algorithms, training methods, model architectures" },
  { id: "cs.CL", label: "Computation and Language", description: "NLP, language models, text processing" },
  { id: "cs.CV", label: "Computer Vision", description: "image/video understanding, generation, perception" },
  { id: "cs.IR", label: "Information Retrieval", description: "search, ranking, recommendation, retrieval-augmented systems" },
  { id: "cs.DC", label: "Distributed, Parallel, and Cluster Computing", description: "distributed systems, consensus, sharding, replication, scheduling" },
  { id: "cs.DB", label: "Databases", description: "storage engines, query processing, indexing, transactions, consistency" },
  { id: "cs.SE", label: "Software Engineering", description: "development practices, testing, program analysis, tooling" },
  { id: "cs.PL", label: "Programming Languages", description: "language design, type systems, compilers, runtimes" },
  { id: "cs.CR", label: "Cryptography and Security", description: "protocols, authentication, adversarial robustness, privacy" },
  { id: "cs.NI", label: "Networking and Internet Architecture", description: "protocols, routing, congestion control, edge/CDN" },
  { id: "cs.OS", label: "Operating Systems", description: "kernels, schedulers, memory management, virtualization" },
  { id: "cs.HC", label: "Human-Computer Interaction", description: "interface design, usability, interaction models" },
  { id: "cs.MA", label: "Multiagent Systems", description: "coordination, negotiation, emergent behavior among agents" },
  { id: "cs.RO", label: "Robotics", description: "control, perception, manipulation, motion planning" },
  { id: "cs.DS", label: "Data Structures and Algorithms", description: "algorithmic techniques, complexity, data structure design" },
  { id: "cs.GT", label: "Computer Science and Game Theory", description: "mechanism design, auctions, incentive-compatible systems" },
  { id: "cs.SD", label: "Sound", description: "audio processing, speech, music generation" },
  { id: "cs.PF", label: "Performance", description: "benchmarking, profiling, systems performance modeling" },
  { id: "stat.ML", label: "Machine Learning (Statistics)", description: "statistical learning theory, probabilistic models" },
  { id: "eess.SP", label: "Signal Processing", description: "sensor data, filtering, compression" },
  { id: "eess.SY", label: "Systems and Control", description: "control theory, feedback systems" },
  { id: "math.OC", label: "Optimization and Control", description: "optimization algorithms, scheduling, resource allocation" },
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// Loose validator — accepts anything shaped like a real arXiv category id
// (archive.SUBCLASS or a bare archive like "math", "physics") so the LLM
// isn't hard-blocked to our curated subset when it knows a better fit.
export function looksLikeCategoryId(id: string): boolean {
  return /^[a-z-]+(\.[A-Za-z]{2,3})?$/.test(id.trim());
}

export function renderCategoryTable(): string {
  return CATEGORIES.map((c) => `| ${c.id} | ${c.label} | ${c.description} |`).join("\n");
}
