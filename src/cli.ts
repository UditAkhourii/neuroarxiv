#!/usr/bin/env node
// CLI surface for neuroarxiv.
//
// Usage:
//   neuroarxiv "how should I cache LLM completions across requests?"
//   neuroarxiv "..." --categories cs.DB,cs.DC --papers 5 --json > result.json
//   neuroarxiv install            (install for every agent detected on this machine)
//   neuroarxiv install --codex    (install for Codex CLI only)

import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./engine.js";
import { renderText } from "./render.js";
import { AGENT_IDS, installSkill, type AgentId } from "./install.js";
import type { RunEvent, RunOptions } from "./types.js";

// Package root is one level up from dist/cli.js (or src/cli.ts under tsx).
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Parse `install` sub-flags: --claude, --codex, --all. No flags = auto-detect. */
function parseInstallTargets(argv: string[]): AgentId[] {
  const requested: AgentId[] = [];
  for (const arg of argv) {
    if (arg === "--all") {
      requested.push(...AGENT_IDS);
      continue;
    }
    const id = AGENT_IDS.find((candidate) => arg === `--${candidate}`);
    if (!id) {
      console.error(`Error: unknown flag for \`install\`: ${arg}`);
      console.error(`Supported: ${AGENT_IDS.map((a) => `--${a}`).join(", ")}, --all`);
      process.exit(1);
    }
    requested.push(id);
  }
  return [...new Set(requested)];
}

type Flags = {
  problem: string;
  context?: string;
  categories?: string[];
  papers?: number;
  concurrency?: number;
  sinceYears?: number;
  json: boolean;
  quiet: boolean;
  model?: string;
  criticModel?: string;
};

function positiveInt(raw: string, flag: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    console.error(`Error: ${flag} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }
  if (n > max) {
    console.error(`Error: ${flag} must be at most ${max}, got ${n}`);
    process.exit(1);
  }
  return n;
}

const MAX_CONTEXT_BYTES = 10 * 1024 * 1024; // 10 MB

function parse(argv: string[]): Flags {
  const f: Flags = { problem: "", json: false, quiet: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--categories": f.categories = argv[++i].split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--papers": f.papers = positiveInt(argv[++i], "--papers", 10); break;
      case "--concurrency": f.concurrency = positiveInt(argv[++i], "--concurrency", 16); break;
      case "--since-years": f.sinceYears = positiveInt(argv[++i], "--since-years", 100); break;
      case "--context": {
        const path = argv[++i];
        const { size } = statSync(path);
        if (size > MAX_CONTEXT_BYTES) {
          console.error(`Error: context file is ${(size / 1024 / 1024).toFixed(1)} MB (max 10 MB)`);
          process.exit(1);
        }
        f.context = readFileSync(path, "utf8");
        break;
      }
      case "--model": f.model = argv[++i]; break;
      case "--critic-model": f.criticModel = argv[++i]; break;
      case "--json": f.json = true; break;
      case "--quiet": f.quiet = true; break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        rest.push(a);
    }
  }
  f.problem = rest.join(" ").trim();
  return f;
}

function printHelp() {
  console.log(`neuroarxiv — a skill for coding agents

  Before you build something new, read the arXiv first. Fans out isolated
  reads across papers found category-wise via real arXiv search, scores and
  clusters them, then converges on ONE recommended path — cited, with a
  first step and known prior-art pitfalls to avoid — instead of a shortlist.

USAGE
  neuroarxiv install [target]  drop the skill into a local agent's skills directory
  neuroarxiv "<problem>" [flags]

INSTALL TARGETS
  (none)                 install for every agent detected on this machine
  --claude               Claude Code   → ~/.claude/skills/neuroarxiv
  --codex                Codex CLI     → ~/.codex/skills/neuroarxiv
  --all                  both, whether or not they're detected

  Honours CLAUDE_CONFIG_DIR and CODEX_HOME if you keep those elsewhere.

FLAGS
  --categories A,B      pin arXiv category ids instead of auto-detecting
                         (e.g. cs.DB,cs.DC); skips the category-select pass
  --papers N             papers fetched per category (default 4)
  --concurrency N        max parallel LLM read calls (default 4)
  --since-years N        drop papers older than N years (default 8, 0 = no filter)
  --context PATH         file to inject as context (code, constraints, stack)
  --model NAME           override the SDK model (reader + synthesizer)
  --critic-model NAME    override the model for score + cluster passes only
  --json                 emit RunResult as JSON
  --quiet                suppress progress events
  -h, --help

EXAMPLES
  neuroarxiv "cache LLM completions across requests without staleness"
  neuroarxiv "leader election for a queue with flaky nodes" --papers 6
  neuroarxiv "..." --categories cs.DB,cs.DC --json > out.json
`);
}

async function main() {
  if (process.argv[2] === "install") {
    const requested = parseInstallTargets(process.argv.slice(3));
    const code = installSkill({ packageRoot: PACKAGE_ROOT, requested });
    if (code !== 0) process.exit(code);
    return;
  }

  const flags = parse(process.argv.slice(2));
  if (!flags.problem) { printHelp(); process.exit(1); }

  const onEvent = flags.quiet ? undefined : (e: RunEvent) => {
    switch (e.kind) {
      case "categories:done": process.stderr.write(`  ▸ categories: ${e.categories.join(", ")} | terms: ${e.terms.join(", ")}\n`); break;
      case "fetch:done":      process.stderr.write(`    ${e.count} papers (${e.category})\n`); break;
      case "read:start":      process.stderr.write(`  ◎ reading [${e.paperId}] ${e.title}\n`); break;
      case "score:done":      process.stderr.write(`  scored ${e.total} readings\n`); break;
      case "cluster:done":    process.stderr.write(`  ${e.clusters} clusters\n`); break;
      case "converge:done":   process.stderr.write(`  → path: ${e.chosen ?? "(none)"}\n`); break;
      case "warn":            process.stderr.write(`  ! ${e.message}\n`); break;
    }
  };

  const opts: RunOptions = {
    problem: flags.problem,
    context: flags.context,
    categories: flags.categories,
    papersPerCategory: flags.papers,
    concurrency: flags.concurrency,
    sinceYears: flags.sinceYears,
    model: flags.model,
    criticModel: flags.criticModel,
    onEvent,
  };

  const result = await run(opts);

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(result) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
