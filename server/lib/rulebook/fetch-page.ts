import { fail } from "@agent-native/core/action";

import { htmlToText, sha256 } from "./text.js";

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; RulebookDesk/0.1; rules and deadline tracker)";

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  title: string;
  text: string;
  contentHash: string;
  /** Wayback timestamp when the page came from the Internet Archive. */
  archivedAt: string | null;
}

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    fail(`"${raw}" is not a valid URL.`, { errorCode: "invalid_url" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    fail("Only http and https pages can be tracked.", {
      errorCode: "invalid_url",
    });
  if (PRIVATE_HOST.test(url.hostname))
    fail("Only public web pages can be tracked.", { errorCode: "invalid_url" });
  url.hash = "";
  return url;
}

/** Wayback "id_" URLs return the archived HTML without the archive toolbar. */
export function waybackUrl(url: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

export async function fetchPage(
  rawUrl: string,
  opts: { archiveTimestamp?: string | undefined } = {},
): Promise<FetchedPage> {
  const url = assertPublicUrl(rawUrl).toString();
  const target = opts.archiveTimestamp
    ? waybackUrl(url, opts.archiveTimestamp)
    : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      // Minimal headers on purpose: a browser-like Accept header from a
      // non-browser client trips some bot shields (seen on Devpost, 403).
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
    });
  } catch (error) {
    clearTimeout(timer);
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timed out"
        : "could not be reached";
    fail(`The page ${reason}: ${url}`, {
      errorCode: "fetch_failed",
      statusCode: 502,
    });
  }
  clearTimeout(timer);
  if (!res.ok)
    fail(`The page answered HTTP ${res.status}: ${url}`, {
      errorCode: "fetch_failed",
      statusCode: 502,
      details: { httpStatus: res.status },
    });
  const type = res.headers.get("content-type") ?? "";
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type))
    fail(`Unsupported content type "${type}". Track an HTML page instead.`, {
      errorCode: "unsupported_content",
    });
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES)
    fail("The page is larger than 3 MB.", { errorCode: "too_large" });
  const raw = new TextDecoder("utf-8").decode(buffer);
  const { title, text } = /text\/plain/i.test(type)
    ? { title: "", text: raw.replace(/\r\n/g, "\n") }
    : htmlToText(raw);
  return {
    requestedUrl: url,
    finalUrl: opts.archiveTimestamp ? url : res.url || url,
    httpStatus: res.status,
    title,
    text,
    contentHash: await sha256(text),
    archivedAt: opts.archiveTimestamp ?? null,
  };
}
