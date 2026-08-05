// Terminal renderer. Shape: problem → what was searched → papers read
// (grouped by cluster, chip-scored) → prior-art warnings → THE PATH (one,
// not a shortlist) → alternates considered → open thread.

import type { PaperRead, RunResult } from "./types.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function chip(r: PaperRead): string {
  if (!r.score) return "";
  const { relevance, practicality, rigor } = r.score;
  return dim(`[rel${relevance} prac${practicality} rig${rigor}]`);
}

export function renderText(r: RunResult): string {
  const out: string[] = [];

  out.push(bold("Problem: ") + r.problem);
  out.push(
    dim(
      `Searched: ${r.categories.map((c) => c.id).join(", ")} | terms: ${r.searchTerms.join(", ")} | ${r.papers.length} papers`,
    ),
  );
  if (r.note) out.push(dim(`Note: ${r.note}`));
  out.push("");

  if (r.papers.length === 0) {
    out.push(yellow(r.openThread));
    return out.join("\n");
  }

  // Papers read, by cluster.
  out.push(bold("Papers read"));
  const byCluster = new Map<string, PaperRead[]>();
  for (const read of r.reads) {
    const key = read.cluster ?? "(unclustered)";
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(read);
  }
  for (const [label, reads] of byCluster) {
    out.push("  " + cyan(label));
    for (const read of reads) {
      out.push(`    - [${read.paper.id}] ${read.paper.title} ${chip(read)}`);
      out.push(`      ${dim(read.approach)}`);
      if (read.score?.strength) out.push(`      ${green("+")} ${dim(read.score.strength)}`);
    }
  }
  out.push("");

  const traps = r.reads.filter((read) => read.score?.trap);
  if (traps.length > 0) {
    out.push(bold("Prior-art pitfalls (watch-outs, not verdicts)"));
    for (const t of traps) {
      out.push(`  ${red("⚠")} [${t.paper.id}] ${t.paper.title}`);
      out.push(`    ${dim(t.score?.trap ?? "")}`);
    }
    out.push("");
  }

  if (r.chosenPath) {
    out.push(bold("THE PATH — ") + green(r.chosenPath.clusterLabel));
    out.push("  " + r.chosenPath.sketch.split("\n").join("\n  "));
    out.push("");
    out.push("  " + bold("First step: ") + r.chosenPath.firstStep);
    out.push("  " + bold("Load-bearing risk: ") + r.chosenPath.loadBearingRisk);
    if (r.chosenPath.avoid.length > 0) {
      out.push("  " + bold("Avoid (known prior-art pitfalls):"));
      for (const a of r.chosenPath.avoid) out.push(`    · ${a}`);
    }
    out.push("  " + bold("Citations:"));
    for (const c of r.chosenPath.citations) {
      out.push(`    · [${c.paperId}] ${c.title} — ${dim(c.role)}`);
      out.push(`      ${dim(c.url)}`);
    }
    out.push("");
  } else {
    out.push(bold("THE PATH"));
    out.push("  " + yellow("Convergence pass failed to parse — see raw reads above."));
    out.push("");
  }

  if (r.alternates.length > 0) {
    out.push(bold("Alternates considered, not chosen"));
    for (const a of r.alternates) {
      out.push(`  - ${cyan(a.label)}: ${a.oneLiner}`);
    }
    out.push("");
  }

  out.push(bold("Open thread"));
  out.push("  " + yellow(r.openThread));

  return out.join("\n");
}
