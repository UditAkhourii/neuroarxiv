// Real HTTP client for arXiv's export API (https://info.arxiv.org/help/api).
// No LLM involved here — this is the deterministic "read the arxiv,
// category-wise" step the reads are grounded in. The API returns an Atom
// feed; we parse it with a small hand-rolled extractor tuned to arXiv's
// fixed entry shape rather than pulling in a full XML/DOM dependency.
//
// Courtesy: arXiv asks clients not to run more than one request at a time
// and to leave a few seconds between requests. We fetch categories
// sequentially with a delay, even though the LLM read passes downstream
// are parallel — the fan-out happens after the data is already local.

import type { Paper } from "./types.js";

const ARXIV_API = "https://export.arxiv.org/api/query";
const REQUEST_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT = "neuroarxiv-agent/0.1 (https://github.com/UditAkhourii/neuroarxiv; mailto:contact@example.com)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? xmlUnescape(m[1]).trim() : undefined;
}

function parseAttrs(tagStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tagStr.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[m[1]] = xmlUnescape(m[2]);
  }
  return attrs;
}

function extractLinks(block: string): Record<string, string>[] {
  return [...block.matchAll(/<link\b[^>]*\/>/g)].map((m) => parseAttrs(m[0]));
}

export function parseEntries(xml: string, category: string): Paper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.map((e) => {
    const idUrl = extractTag(e, "id") ?? "";
    const version = idUrl.match(/abs\/([^/]+)$/)?.[1] ?? idUrl;
    const id = version.replace(/v\d+$/, "");
    const title = (extractTag(e, "title") ?? "").replace(/\s+/g, " ").trim();
    const summary = (extractTag(e, "summary") ?? "").replace(/\s+/g, " ").trim();
    const authors = [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
      xmlUnescape(m[1]).trim(),
    );
    const links = extractLinks(e);
    const pdfUrl = links.find((l) => l.title === "pdf")?.href ?? idUrl.replace("/abs/", "/pdf/");
    const absUrl = links.find((l) => l.rel === "alternate")?.href ?? idUrl;

    return {
      id,
      version,
      title,
      summary,
      authors,
      categories: [category],
      published: extractTag(e, "published") ?? "",
      updated: extractTag(e, "updated") ?? "",
      absUrl,
      pdfUrl,
    };
  });
}

function termClause(term: string): string {
  const t = term.trim().replace(/"/g, "");
  return /\s/.test(t) ? `all:"${t}"` : `all:${t}`;
}

export function buildSearchQuery(category: string, terms: string[]): string {
  const cat = `cat:${category}`;
  if (terms.length === 0) return cat;
  return `${cat} AND (${terms.map(termClause).join(" OR ")})`;
}

async function fetchOnce(searchQuery: string, maxResults: number): Promise<string> {
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(maxResults),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const url = `${ARXIV_API}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 429) {
      // Back off once and retry — arXiv rate-limits aggressively.
      await sleep(5000);
      const retry = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
      if (!retry.ok) throw new Error(`arXiv API returned ${retry.status} after retry`);
      return retry.text();
    }
    if (!res.ok) throw new Error(`arXiv API returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function withinYears(paper: Paper, sinceYears: number): boolean {
  if (sinceYears <= 0) return true;
  const published = Date.parse(paper.published);
  if (Number.isNaN(published)) return true;
  const cutoff = Date.now() - sinceYears * 365.25 * 24 * 60 * 60 * 1000;
  return published >= cutoff;
}

export type CategoryFetch = {
  category: string;
  papers: Paper[];
};

// Fetches each category SEQUENTIALLY (courtesy delay between calls) and
// merges results, deduping papers that surface under more than one
// category by unioning their `categories` field onto the first occurrence.
export async function searchArxivCategories(
  categories: string[],
  terms: string[],
  papersPerCategory: number,
  sinceYears: number,
  onFetch?: (f: CategoryFetch) => void,
): Promise<Paper[]> {
  const byId = new Map<string, Paper>();

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const query = buildSearchQuery(category, terms);
    const xml = await fetchOnce(query, papersPerCategory);
    const found = parseEntries(xml, category).filter((p) => withinYears(p, sinceYears));

    for (const p of found) {
      const existing = byId.get(p.id);
      if (existing) {
        existing.categories = [...new Set([...existing.categories, ...p.categories])];
      } else {
        byId.set(p.id, p);
      }
    }
    onFetch?.({ category, papers: found });

    if (i < categories.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  return [...byId.values()];
}

// Fallback widen: category-only query (drops terms) for when the
// term-constrained search came back too thin. Used sparingly — it's another
// round of network calls against the same courtesy budget.
export async function widenSearch(
  categories: string[],
  papersPerCategory: number,
  sinceYears: number,
): Promise<Paper[]> {
  return searchArxivCategories(categories, [], papersPerCategory, sinceYears);
}
