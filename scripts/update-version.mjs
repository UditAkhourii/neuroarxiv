#!/usr/bin/env bun
// Maintainer-only release helper. The scripts/ directory is not part of the
// published package; this updates the repository's version contract in place.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const VERSION_FILES = [
	"package.json",
	"plugin.json",
	".codex-plugin/plugin.json",
	".claude-plugin/plugin.json",
	".claude-plugin/marketplace.json",
];

// SemVer 2.0.0 grammar. Numeric core identifiers cannot have leading zeros;
// numeric prerelease identifiers cannot either, while build metadata may.
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Strict SemVer 2.0.0 validation without accepting a leading v or whitespace. */
export function isStrictSemver(version) {
	return typeof version === "string" && SEMVER_PATTERN.test(version);
}

function patchVersion(text, file, version) {
	const matches = text.match(/("version"\s*:\s*)"[^"]*"/g) ?? [];
	if (matches.length !== 1) {
		throw new Error(
			`${file}: expected exactly one version field, found ${matches.length}`,
		);
	}
	return text.replace(
		matches[0],
		`${matches[0].replace(/"[^"]*"$/, "")}"${version}"`,
	);
}

/** Update all five owned manifests while preserving their other JSON data. */
export function updateVersionFiles(root, version) {
	if (!isStrictSemver(version)) {
		throw new Error(`invalid strict semver: ${String(version)}`);
	}
	const updates = [];
	for (const relativePath of VERSION_FILES) {
		const path = join(root, relativePath);
		if (!existsSync(path))
			throw new Error(`missing version contract: ${relativePath}`);
		const original = readFileSync(path, "utf8");
		const parsed = JSON.parse(original);
		if (relativePath.endsWith("marketplace.json")) {
			const plugin = parsed.plugins?.find(
				(entry) => entry.name === "neuroarxiv",
			);
			if (!plugin || typeof plugin.version !== "string") {
				throw new Error(
					`${relativePath}: neuroarxiv plugin version is missing`,
				);
			}
		} else if (typeof parsed.version !== "string") {
			throw new Error(`${relativePath}: version is missing`);
		}
		updates.push([path, patchVersion(original, relativePath, version)]);
	}
	for (const [path, contents] of updates) writeFileSync(path, contents, "utf8");
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.length !== 1 || !isStrictSemver(args[0])) {
		console.error("Usage: bun scripts/update-version.mjs <strict-semver>");
		process.exit(2);
	}
	try {
		updateVersionFiles(process.cwd(), args[0]);
		console.log(
			`Updated ${VERSION_FILES.length} version contracts to ${args[0]}.`,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
