// Thin wrapper around the Claude Agent SDK's `query` function.
// We use it as a stateless one-shot: each call gets a fresh session
// with a tight system prompt and the user's problem framing.
//
// Each paper read is its own query() call so they run in true parallel —
// isolated, no cross-paper visibility during the read pass. Mixing kills
// the point: a read that's seen the other abstracts starts summarizing the
// SET instead of grounding in the one paper in front of it.

import { query } from "@anthropic-ai/claude-agent-sdk";

export type LLMOptions = {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
};

export function buildQueryOptions(opts: LLMOptions) {
  return {
    model: opts.model,
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: opts.systemPrompt,
    },
    // No tools — reads and synthesis are pure generation over the text
    // we already fetched. Tool access here would let a branch go fetch
    // its own extra context and break isolation.
    tools: [] as string[],
  };
}

export async function callLLM(opts: LLMOptions): Promise<string> {
  const chunks: string[] = [];

  const iter = query({
    prompt: opts.userPrompt,
    options: buildQueryOptions(opts),
  });

  for await (const message of iter) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") chunks.push(block.text);
      }
    }
    if (message.type === "result" && message.subtype !== "success") {
      throw new Error(`LLM call failed: ${message.subtype}`);
    }
  }

  return chunks.join("").trim();
}

// Strip ```json fences and parse. LLMs love to wrap.
// When a Zod schema is provided, validates the parsed output against it.
import type { ZodType } from "zod";

export function parseJSON<T>(raw: string, schema?: ZodType<T>): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // Find the first { or [ — sometimes there's a preamble despite instructions.
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
      ? firstObj
      : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  const parsed = JSON.parse(s);
  if (schema) return schema.parse(parsed);
  return parsed as T;
}
