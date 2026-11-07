/**
 * Plain-text extraction, quote verification and paragraph diff for rule pages.
 * Everything here is deterministic: the agent proposes facts, this code decides
 * whether a quote really appears in the fetched page.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS =
  "address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul";

/** Turn an HTML page into readable paragraphs separated by blank lines. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]
    ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim())
    : "";
  let body = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch?.[1]) body = bodyMatch[1];
  // Prefer the page's <main> landmark when it holds most of the content.
  const mainMatch = body.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (mainMatch?.[1] && mainMatch[1].length > body.length * 0.3) body = mainMatch[1];
  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/ /g, " ")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t\r\n\f\v]+/g, " ").trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
  return { title, text };
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Normalize for quote matching: unify curly quotes, dashes and whitespace,
 * case-fold. Keeps letters, digits and punctuation so a quote still has to be
 * the same words in the same order.
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface QuoteMatch {
  found: boolean;
  /** Index into splitParagraphs(text) of the paragraph where the quote starts. */
  paragraph: number | null;
}

/** Find a verbatim quote (after normalization) in the page text. */
export function findQuote(text: string, quote: string): QuoteMatch {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return { found: false, paragraph: null };
  const paragraphs = splitParagraphs(text);
  const normalized = paragraphs.map(normalizeForMatch);
  for (const [i, p] of normalized.entries()) {
    if (p.includes(q)) return { found: true, paragraph: i };
  }
  // A quote may span adjacent paragraphs (list items rendered as blocks).
  let joined = "";
  const starts: number[] = [];
  for (const p of normalized) {
    starts.push(joined.length);
    joined += p + " ";
  }
  const at = joined.indexOf(q);
  if (at === -1) return { found: false, paragraph: null };
  let paragraph = 0;
  for (const [i, start] of starts.entries()) if (start <= at) paragraph = i;
  return { found: true, paragraph };
}

export interface ParagraphDiff {
  added: string[];
  removed: string[];
}

/** Paragraph-level diff: which paragraphs appeared or disappeared. */
export function diffParagraphs(before: string, after: string): ParagraphDiff {
  const a = splitParagraphs(before);
  const b = splitParagraphs(after);
  const key = (p: string) => normalizeForMatch(p);
  const aCount = new Map<string, number>();
  for (const p of a) aCount.set(key(p), (aCount.get(key(p)) ?? 0) + 1);
  const bCount = new Map<string, number>();
  for (const p of b) bCount.set(key(p), (bCount.get(key(p)) ?? 0) + 1);
  const added: string[] = [];
  const seenB = new Map<string, number>();
  for (const p of b) {
    const k = key(p);
    const n = (seenB.get(k) ?? 0) + 1;
    seenB.set(k, n);
    if (n > (aCount.get(k) ?? 0)) added.push(p);
  }
  const removed: string[] = [];
  const seenA = new Map<string, number>();
  for (const p of a) {
    const k = key(p);
    const n = (seenA.get(k) ?? 0) + 1;
    seenA.set(k, n);
    if (n > (bCount.get(k) ?? 0)) removed.push(p);
  }
  return { added, removed };
}

/**
 * Drop counter churn ("Participants (547)" -> "Participants (2421)"): short
 * paragraph pairs that differ only in their digits are not rule changes.
 */
export function withoutCounterNoise(diff: ParagraphDiff): ParagraphDiff {
  const shape = (p: string) => normalizeForMatch(p).replace(/[\d,.]+/g, "#");
  const short = (p: string) => p.length <= 80 && /\d/.test(p);
  const removedShapes = new Map<string, number>();
  for (const p of diff.removed)
    if (short(p)) removedShapes.set(shape(p), (removedShapes.get(shape(p)) ?? 0) + 1);
  const matched = new Map<string, number>();
  const added = diff.added.filter((p) => {
    if (!short(p)) return true;
    const k = shape(p);
    const avail = (removedShapes.get(k) ?? 0) - (matched.get(k) ?? 0);
    if (avail > 0) {
      matched.set(k, (matched.get(k) ?? 0) + 1);
      return false;
    }
    return true;
  });
  const used = new Map<string, number>();
  const removed = diff.removed.filter((p) => {
    if (!short(p)) return true;
    const k = shape(p);
    const n = used.get(k) ?? 0;
    if (n < (matched.get(k) ?? 0)) {
      used.set(k, n + 1);
      return false;
    }
    return true;
  });
  return { added, removed };
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
