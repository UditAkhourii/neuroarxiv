import { test } from "bun:test";
import assert from "assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
	agentTarget,
	allAgentTargets,
	installSkill,
	resolveTargets,
} from "../src/install.ts";

const HOME = "/home/dev";
const noEnv = {};

test("all supported agents use the standard skills/<name>/SKILL.md shape", () => {
	assert.equal(
		agentTarget("claude", noEnv, HOME).installDir,
		join(HOME, ".claude", "skills", "neuroarxiv"),
	);
	assert.equal(
		agentTarget("codex", noEnv, HOME).installDir,
		join(HOME, ".codex", "skills", "neuroarxiv"),
	);
	assert.equal(
		agentTarget("cursor", noEnv, HOME).installDir,
		join(HOME, ".cursor", "skills", "neuroarxiv"),
	);
	assert.equal(
		agentTarget("antigravity", noEnv, HOME).installDir,
		join(HOME, ".gemini", "config", "skills", "neuroarxiv"),
	);
});

test("agent-specific environment variables override default homes", () => {
	const env = {
		CLAUDE_CONFIG_DIR: "/cfg/claude",
		CODEX_HOME: "/cfg/codex",
		CURSOR_CONFIG_DIR: "/cfg/cursor",
	};

	assert.equal(
		agentTarget("claude", env, HOME).installDir,
		"/cfg/claude/skills/neuroarxiv",
	);
	assert.equal(
		agentTarget("codex", env, HOME).installDir,
		"/cfg/codex/skills/neuroarxiv",
	);
	assert.equal(
		agentTarget("cursor", env, HOME).installDir,
		"/cfg/cursor/skills/neuroarxiv",
	);
	assert.equal(
		agentTarget("antigravity", env, HOME).installDir,
		join(HOME, ".gemini", "config", "skills", "neuroarxiv"),
	);
});

test("an explicit target wins over auto-detection", () => {
	const targets = allAgentTargets(noEnv, HOME);
	const resolution = resolveTargets(["codex"], targets, () => true);

	assert.deepEqual(
		resolution.selected.map((target) => target.id),
		["codex"],
	);
	assert.equal(resolution.autoDetected, false);
});

test("without flags, every detected target is selected", () => {
	const targets = allAgentTargets(noEnv, HOME);
	const resolution = resolveTargets([], targets, () => true);

	assert.deepEqual(
		resolution.selected.map((target) => target.id),
		["claude", "codex", "cursor", "antigravity"],
	);
	assert.equal(resolution.autoDetected, true);
	assert.equal(resolution.fellBack, false);
});

test("auto-detection can select one agent", () => {
	const targets = allAgentTargets(noEnv, HOME);
	const resolution = resolveTargets(
		[],
		targets,
		(path) => path === join(HOME, ".cursor"),
	);

	assert.deepEqual(
		resolution.selected.map((target) => target.id),
		["cursor"],
	);
	assert.equal(resolution.fellBack, false);
});

test("fresh machines retain the Claude fallback", () => {
	const targets = allAgentTargets(noEnv, HOME);
	const resolution = resolveTargets([], targets, () => false);

	assert.deepEqual(
		resolution.selected.map((target) => target.id),
		["claude"],
	);
	assert.equal(resolution.fellBack, true);
});

test("installation copies the complete skill directory", () => {
	const fixture = mkdtempSync(join(tmpdir(), "neuroarxiv-fixture-"));
	const packageRoot = join(fixture, "package");
	const source = join(packageRoot, "skills", "neuroarxiv");
	const destination = join(fixture, "destination");
	const logs: string[] = [];
	mkdirSync(join(source, "references"), { recursive: true });
	writeFileSync(
		join(source, "SKILL.md"),
		"---\nname: neuroarxiv\n---\n",
		"utf8",
	);
	writeFileSync(join(source, "references", "note.md"), "fixture", "utf8");

	const code = installSkill({
		packageRoot,
		requested: ["codex"],
		env: { CODEX_HOME: destination },
		log: (message) => logs.push(message),
		logError: (message) => logs.push(message),
	});

	assert.equal(code, 0);
	assert.equal(
		existsSync(join(destination, "skills", "neuroarxiv", "SKILL.md")),
		true,
	);
	assert.equal(
		readFileSync(
			join(destination, "skills", "neuroarxiv", "references", "note.md"),
			"utf8",
		),
		"fixture",
	);
	assert.match(logs.join("\n"), /Codex CLI/);
});
