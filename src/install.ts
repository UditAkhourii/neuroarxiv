// Installs the bundled skill into a local coding agent's skills directory.
//
// Claude Code and Codex CLI both discover skills at `<agent home>/skills/<name>/SKILL.md`
// and read the same YAML frontmatter (`name`, `description`), so one bundled copy serves
// both — only the agent home differs. That is why this installs by copying the skill
// directory verbatim rather than rewriting anything per target.

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SKILL_NAME = "neuroarxiv";

export type AgentId = "claude" | "codex";

export const AGENT_IDS: readonly AgentId[] = ["claude", "codex"] as const;

export type AgentTarget = {
  id: AgentId;
  label: string;
  /** Agent config root, e.g. ~/.claude — also the presence check for auto-detection. */
  home: string;
  /** Where the skill directory lands, e.g. ~/.claude/skills/neuroarxiv */
  installDir: string;
  /** Printed after a successful install for this target. */
  activation: string;
};

/**
 * Resolve one agent's paths. `env` and `home` are injectable so this stays pure and testable.
 * CLAUDE_CONFIG_DIR / CODEX_HOME are the agents' own overrides for a non-default config root.
 */
export function agentTarget(
  id: AgentId,
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): AgentTarget {
  const spec =
    id === "claude"
      ? {
          label: "Claude Code",
          home: env.CLAUDE_CONFIG_DIR || join(home, ".claude"),
          activation: `Restart Claude Code (or start a new session), then run /${SKILL_NAME} "<problem>".`,
        }
      : {
          label: "Codex CLI",
          home: env.CODEX_HOME || join(home, ".codex"),
          activation: `Start a new Codex session — the skill loads from its description, or ask for ${SKILL_NAME} by name.`,
        };

  return {
    id,
    label: spec.label,
    home: spec.home,
    installDir: join(spec.home, "skills", SKILL_NAME),
    activation: spec.activation,
  };
}

export function allAgentTargets(
  env?: Record<string, string | undefined>,
  home?: string,
): AgentTarget[] {
  return AGENT_IDS.map((id) => agentTarget(id, env, home));
}

export type Resolution = {
  selected: AgentTarget[];
  /** True when nothing was requested explicitly and we picked based on what's on disk. */
  autoDetected: boolean;
  /** Set when auto-detection found no agent and we fell back to a default. */
  fellBack: boolean;
};

/**
 * Pick install targets. Explicit request wins. Otherwise install to every agent that is
 * actually present on this machine, so `install` does the right thing for people running
 * one agent, the other, or both. With neither present we still install for Claude Code —
 * preserving the original behaviour for a fresh machine rather than failing.
 */
export function resolveTargets(
  requested: readonly AgentId[],
  targets: readonly AgentTarget[] = allAgentTargets(),
  exists: (path: string) => boolean = existsSync,
): Resolution {
  if (requested.length > 0) {
    const wanted = new Set(requested);
    return { selected: targets.filter((t) => wanted.has(t.id)), autoDetected: false, fellBack: false };
  }

  const detected = targets.filter((t) => exists(t.home));
  if (detected.length > 0) return { selected: detected, autoDetected: true, fellBack: false };

  return {
    selected: targets.filter((t) => t.id === "claude"),
    autoDetected: true,
    fellBack: true,
  };
}

export type InstallOptions = {
  packageRoot: string;
  requested: readonly AgentId[];
  /** Injectable alongside `home` so a caller (or a test) can install against a sandboxed root. */
  env?: Record<string, string | undefined>;
  home?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
};

/** Returns a process exit code: 0 on success, 1 if the bundled skill is missing. */
export function installSkill(opts: InstallOptions): number {
  const { packageRoot, requested } = opts;
  const log = opts.log ?? console.log;
  const logError = opts.logError ?? console.error;

  const source = join(packageRoot, "skills", SKILL_NAME);
  if (!existsSync(join(source, "SKILL.md"))) {
    logError(`Error: couldn't find the bundled SKILL.md at ${join(source, "SKILL.md")}`);
    logError("This usually means the package wasn't installed with its skills/ directory intact.");
    return 1;
  }

  const { selected, autoDetected, fellBack } = resolveTargets(
    requested,
    allAgentTargets(opts.env, opts.home),
  );

  for (const target of selected) {
    mkdirSync(target.installDir, { recursive: true });
    // Copy the whole skill directory, not just SKILL.md, so bundled references/ come along.
    cpSync(source, target.installDir, { recursive: true });
    log(`✓ Installed the ${SKILL_NAME} skill for ${target.label} → ${join(target.installDir, "SKILL.md")}`);
    log(`  ${target.activation}`);
  }

  if (fellBack) {
    log("");
    log("  Note: no agent config directory was found, so this defaulted to Claude Code.");
    log(`  Run \`${SKILL_NAME} install --codex\` to install for Codex CLI instead.`);
  } else if (autoDetected && selected.length === 1) {
    const missing = AGENT_IDS.filter((id) => !selected.some((t) => t.id === id));
    for (const id of missing) {
      log("");
      log(`  ${agentTarget(id, opts.env, opts.home).label} wasn't detected. Install for it anyway with \`${SKILL_NAME} install --${id}\`.`);
    }
  }

  return 0;
}
