// Install the bundled Agent Skill for the supported coding agents.
//
// Cursor and Antigravity both consume the portable Agent Skills layout, as do
// Claude Code and Codex.  The skill directory is copied recursively so future
// references, scripts, and assets shipped alongside SKILL.md are not lost.

import { cpSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const SKILL_NAME = "neuroarxiv";

export type AgentId = "claude" | "codex" | "cursor" | "antigravity";

export const AGENT_IDS: readonly AgentId[] = [
	"claude",
	"codex",
	"cursor",
	"antigravity",
] as const;

export type AgentTarget = {
	id: AgentId;
	label: string;
	/** Agent configuration root; its presence is used for auto-detection. */
	home: string;
	/** Directory containing this skill's SKILL.md. */
	installDir: string;
	/** Printed after a successful install for this target. */
	activation: string;
};

/**
 * Resolve one agent's paths. Environment variables are injectable to keep
 * target selection deterministic in tests and support non-default homes.
 */
export function agentTarget(
	id: AgentId,
	env: Record<string, string | undefined> = process.env,
	home: string = homedir(),
): AgentTarget {
	const specs: Record<
		AgentId,
		{ label: string; home: string; activation: string }
	> = {
		claude: {
			label: "Claude Code",
			home: env.CLAUDE_CONFIG_DIR || join(home, ".claude"),
			activation: `Restart Claude Code (or start a new session), then run /${SKILL_NAME} "<problem>".`,
		},
		codex: {
			label: "Codex CLI",
			home: env.CODEX_HOME || join(home, ".codex"),
			activation: `Start a new Codex session and ask for ${SKILL_NAME} by name.`,
		},
		cursor: {
			label: "Cursor",
			home: env.CURSOR_CONFIG_DIR || join(home, ".cursor"),
			activation:
				"Restart Cursor (or reload the window) to discover the skill.",
		},
		antigravity: {
			label: "Antigravity",
			// Antigravity's user-global skill root is ~/.gemini/config/skills.
			home: join(home, ".gemini", "config"),
			activation:
				"Restart Antigravity to discover the skill from its Agent Skills directory.",
		},
	};

	const spec = specs[id];
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
	/** True when no targets were requested explicitly. */
	autoDetected: boolean;
	/** True when auto-detection found no agent and preserved the Claude default. */
	fellBack: boolean;
};

/**
 * Explicit requests always win. With no request, install for each detected
 * agent. On a fresh machine retain the historical Claude default instead of
 * silently doing nothing.
 */
export function resolveTargets(
	requested: readonly AgentId[],
	targets: readonly AgentTarget[] = allAgentTargets(),
	exists: (path: string) => boolean = existsSync,
): Resolution {
	if (requested.length > 0) {
		const wanted = new Set(requested);
		return {
			selected: targets.filter((target) => wanted.has(target.id)),
			autoDetected: false,
			fellBack: false,
		};
	}

	const detected = targets.filter((target) => exists(target.home));
	if (detected.length > 0) {
		return { selected: detected, autoDetected: true, fellBack: false };
	}

	return {
		selected: targets.filter((target) => target.id === "claude"),
		autoDetected: true,
		fellBack: true,
	};
}

export type InstallOptions = {
	packageRoot: string;
	requested: readonly AgentId[];
	env?: Record<string, string | undefined>;
	home?: string;
	log?: (message: string) => void;
	logError?: (message: string) => void;
};

/** Return 0 on success, 1 when the packaged skill is missing. */
export function installSkill(opts: InstallOptions): number {
	const log = opts.log ?? console.log;
	const logError = opts.logError ?? console.error;
	const source = join(opts.packageRoot, "skills", SKILL_NAME);
	const sourceManifest = join(source, "SKILL.md");

	if (!existsSync(sourceManifest)) {
		logError(`Error: couldn't find the bundled SKILL.md at ${sourceManifest}`);
		logError(
			"This usually means the package wasn't installed with its skills/ directory intact.",
		);
		return 1;
	}

	const { selected, autoDetected, fellBack } = resolveTargets(
		opts.requested,
		allAgentTargets(opts.env, opts.home),
	);

	for (const target of selected) {
		mkdirSync(target.installDir, { recursive: true });
		cpSync(source, target.installDir, { recursive: true });
		log(
			`✓ Installed the ${SKILL_NAME} skill for ${target.label} → ${join(target.installDir, "SKILL.md")}`,
		);
		log(`  ${target.activation}`);
	}

	if (fellBack) {
		log("");
		log(
			"  Note: no agent config directory was found, so this defaulted to Claude Code.",
		);
		log(
			`  Run \`${SKILL_NAME} install --codex\`, \`${SKILL_NAME} install --cursor\`, or \`${SKILL_NAME} install --antigravity\` to choose another target.`,
		);
	} else if (
		autoDetected &&
		selected.length > 0 &&
		selected.length < AGENT_IDS.length
	) {
		const missing = AGENT_IDS.filter(
			(id) => !selected.some((target) => target.id === id),
		);
		log("");
		log(
			`  Other agents were not detected. Install for them explicitly with ${missing.map((id) => `\`${SKILL_NAME} install --${id}\``).join(", ")}.`,
		);
	}

	return 0;
}
