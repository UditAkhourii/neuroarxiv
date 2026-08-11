import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";

import { agentTarget, allAgentTargets, resolveTargets } from "../src/install.ts";

const HOME = "/home/dev";
const noEnv = {};

test("both agents install to the same <home>/skills/<name>/SKILL.md shape", () => {
  const claude = agentTarget("claude", noEnv, HOME);
  const codex = agentTarget("codex", noEnv, HOME);

  assert.equal(claude.installDir, join(HOME, ".claude", "skills", "neuroarxiv"));
  assert.equal(codex.installDir, join(HOME, ".codex", "skills", "neuroarxiv"));
});

test("CLAUDE_CONFIG_DIR and CODEX_HOME override the default agent home", () => {
  const env = { CLAUDE_CONFIG_DIR: "/cfg/claude", CODEX_HOME: "/cfg/codex" };

  assert.equal(agentTarget("claude", env, HOME).installDir, "/cfg/claude/skills/neuroarxiv");
  assert.equal(agentTarget("codex", env, HOME).installDir, "/cfg/codex/skills/neuroarxiv");
});

test("an explicit request wins over what is present on disk", () => {
  const targets = allAgentTargets(noEnv, HOME);
  const { selected, autoDetected } = resolveTargets(["codex"], targets, () => true);

  assert.deepEqual(selected.map((t) => t.id), ["codex"]);
  assert.equal(autoDetected, false);
});

test("with no request, installs for every agent present on this machine", () => {
  const targets = allAgentTargets(noEnv, HOME);
  const { selected, autoDetected, fellBack } = resolveTargets([], targets, () => true);

  assert.deepEqual(selected.map((t) => t.id), ["claude", "codex"]);
  assert.equal(autoDetected, true);
  assert.equal(fellBack, false);
});

test("with only Codex present, Claude Code is not installed for", () => {
  const targets = allAgentTargets(noEnv, HOME);
  const codexOnly = (path: string) => path === join(HOME, ".codex");
  const { selected, fellBack } = resolveTargets([], targets, codexOnly);

  assert.deepEqual(selected.map((t) => t.id), ["codex"]);
  assert.equal(fellBack, false);
});

test("with no agent present, falls back to Claude Code rather than installing nothing", () => {
  const targets = allAgentTargets(noEnv, HOME);
  const { selected, fellBack } = resolveTargets([], targets, () => false);

  assert.deepEqual(selected.map((t) => t.id), ["claude"]);
  assert.equal(fellBack, true);
});
