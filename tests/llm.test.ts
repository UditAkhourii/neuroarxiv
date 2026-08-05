import assert from "node:assert/strict";
import test from "node:test";

import { buildQueryOptions, parseJSON } from "../src/llm.ts";

test("generation-only queries disable all built-in tools", () => {
  const options = buildQueryOptions({
    model: "claude-sonnet-4-5",
    systemPrompt: "Read this one paper in isolation.",
    userPrompt: "Extract the approach.",
  });

  assert.deepEqual(options.tools, []);
  assert.equal("allowedTools" in options, false);
  assert.equal("permissionMode" in options, false);
});

test("parseJSON strips markdown code fences before parsing", () => {
  const raw = "```json\n{\"approach\":\"use a bloom filter\"}\n```";
  assert.deepEqual(parseJSON(raw), { approach: "use a bloom filter" });
});

test("parseJSON handles a preamble before the JSON payload", () => {
  const raw = 'Sure, here is the result:\n[{"id":"1"}]';
  assert.deepEqual(parseJSON(raw), [{ id: "1" }]);
});
