import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  agentTarget,
  allAgentTargets,
  installSkill,
  resolveTargets,
} from "../src/install.ts";

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

  // Compare through join() so the expectation holds on Windows separators too.
  assert.equal(
    agentTarget("claude", env, HOME).installDir,
    join("/cfg/claude", "skills", "neuroarxiv"),
  );
  assert.equal(
    agentTarget("codex", env, HOME).installDir,
    join("/cfg/codex", "skills", "neuroarxiv"),
  );
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

/** A throwaway package root holding a skill directory with a nested reference file. */
function fakePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "neuroarxiv-pkg-"));
  const skill = join(root, "skills", "neuroarxiv", "references");
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(root, "skills", "neuroarxiv", "SKILL.md"),
    "---\nname: neuroarxiv\n---\n",
  );
  writeFileSync(join(skill, "notes.md"), "reference body");
  return root;
}

test("installSkill copies the whole skill directory into the sandboxed home", () => {
  const packageRoot = fakePackageRoot();
  const home = mkdtempSync(join(tmpdir(), "neuroarxiv-home-"));

  try {
    const logs: string[] = [];
    const code = installSkill({
      packageRoot,
      requested: ["codex"],
      env: {},
      home,
      log: (m) => logs.push(m),
    });

    assert.equal(code, 0);
    const installed = join(home, ".codex", "skills", "neuroarxiv");
    assert.match(readFileSync(join(installed, "SKILL.md"), "utf8"), /name: neuroarxiv/);
    // references/ must come along, not just SKILL.md.
    assert.equal(readFileSync(join(installed, "references", "notes.md"), "utf8"), "reference body");
    assert.ok(logs.some((m) => m.includes("Codex CLI")));
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("installSkill honours env overrides rather than the real home", () => {
  const packageRoot = fakePackageRoot();
  const home = mkdtempSync(join(tmpdir(), "neuroarxiv-home-"));
  const configDir = join(home, "elsewhere", "claude");

  try {
    const code = installSkill({
      packageRoot,
      requested: ["claude"],
      env: { CLAUDE_CONFIG_DIR: configDir },
      home,
      log: () => {},
    });

    assert.equal(code, 0);
    assert.match(
      readFileSync(join(configDir, "skills", "neuroarxiv", "SKILL.md"), "utf8"),
      /name: neuroarxiv/,
    );
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("installSkill exits 1 when the bundled skill is missing", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "neuroarxiv-empty-"));
  const errors: string[] = [];

  try {
    const code = installSkill({
      packageRoot,
      requested: ["claude"],
      env: {},
      home: packageRoot,
      log: () => {},
      logError: (m) => errors.push(m),
    });

    assert.equal(code, 1);
    assert.ok(errors.some((m) => m.includes("SKILL.md")));
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
});
