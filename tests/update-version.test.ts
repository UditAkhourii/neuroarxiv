import assert from "assert/strict";
import { test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { isStrictSemver, updateVersionFiles } from "../scripts/update-version.mjs";

function fixtureRoot() {
	const root = mkdtempSync(join(tmpdir(), "neuroarxiv-version-"));
	for (const directory of [".codex-plugin", ".claude-plugin"]) {
		mkdirSync(join(root, directory), { recursive: true });
	}
	for (const path of [
		"package.json",
		"plugin.json",
		".codex-plugin/plugin.json",
		".claude-plugin/plugin.json",
	]) {
		writeFileSync(join(root, path), JSON.stringify({ version: "0.1.0", marker: path }, null, 2) + "\n");
	}
	writeFileSync(
		join(root, ".claude-plugin/marketplace.json"),
		JSON.stringify({ plugins: [{ name: "neuroarxiv", version: "0.1.0", marker: "keep" }] }, null, 2) + "\n",
	);
	return root;
}

test("strict semver accepts release, prerelease, and build metadata", () => {
	assert.equal(isStrictSemver("0.1.1"), true);
	assert.equal(isStrictSemver("1.2.3-rc.1+build.9"), true);
	assert.equal(isStrictSemver("1.2.3-alpha-1+linux.arm64"), true);
	assert.equal(isStrictSemver("1.2.3+20260826"), true);

	for (const invalid of [
		"v1.2.3",
		" 1.2.3",
		"1.2.3 ",
		"1.2",
		"01.2.3",
		"1.02.3",
		"1.2.03",
		"1.2.3-",
		"1.2.3-rc..1",
		"1.2.3-rc.01",
		"1.2.3+",
		"1.2.3+build..9",
		"1.2.3+build+other",
		"1.2.3-rc+build+other",
		"1.2.3-rc_1",
		"1.2.3-rc/1",
	]) {
		assert.equal(isStrictSemver(invalid), false, invalid);
	}
});

test("version update patches all contracts and preserves other data", () => {
	const root = fixtureRoot();
	updateVersionFiles(root, "0.1.1");

	for (const path of [
		"package.json",
		"plugin.json",
		".codex-plugin/plugin.json",
		".claude-plugin/plugin.json",
	]) {
		const data = JSON.parse(readFileSync(join(root, path), "utf8"));
		assert.equal(data.version, "0.1.1");
		assert.equal(data.marker, path);
	}
	const marketplace = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"));
	assert.equal(marketplace.plugins[0].version, "0.1.1");
	assert.equal(marketplace.plugins[0].marker, "keep");
});

test("CLI rejects invalid version input", () => {
	const result = Bun.spawnSync(["bun", "scripts/update-version.mjs", "v0.1.1"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	assert.equal(result.exitCode, 2);
	assert.match(new TextDecoder().decode(result.stderr), /strict-semver/);
});
