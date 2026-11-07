import { fail } from "@agent-native/core/action";
import {
  isBlockedExtensionUrl,
  ssrfSafeFetch,
} from "@agent-native/core/extensions/url-safety";

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
  /** Wayback timestamp of the capture actually served, when from the Internet Archive. */
  archivedAt: string | null;
}

/**
 * Quick, readable rejection of obviously non-public URLs. The real guard is
 * ssrfSafeFetch below, which re-checks every redirect hop and the resolved IP
 * at connect time.
 */
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
  if (isBlockedExtensionUrl(url.toString()))
    fail("Only public web pages can be tracked.", { errorCode: "invalid_url" });
  url.hash = "";
  return url;
}

/** Wayback "id_" URLs return the archived HTML without the archive toolbar. */
export function waybackUrl(url: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

function charsetOf(contentType: string): string {
  const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  const label = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return "utf-8";
  }
}

async function readCapped(res: Response, signal: AbortSignal): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {});
      fail("The page took too long to download.", {
        errorCode: "fetch_failed",
        statusCode: 502,
      });
    }
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      fail("The page is larger than 3 MB.", { errorCode: "too_large" });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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
  // One deadline for headers and body together.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await ssrfSafeFetch(
        target,
        {
          signal: controller.signal,
          // Minimal headers on purpose: a browser-like Accept header from a
          // non-browser client trips some bot shields (seen on Devpost, 403).
          headers: { "user-agent": USER_AGENT, accept: "*/*" },
        },
        { maxRedirects: 5 },
      );
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? "timed out"
          : "could not be reached";
      fail(`The page ${reason}: ${url}`, {
        errorCode: "fetch_failed",
        statusCode: 502,
      });
    }
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
    const bytes = await readCapped(res, controller.signal);
    const raw = new TextDecoder(charsetOf(type)).decode(bytes);
    const { title, text } = /text\/plain/i.test(type)
      ? { title: "", text: raw.replace(/\r\n/g, "\n") }
      : htmlToText(raw);
    // Wayback serves the nearest capture; its timestamp is in the final URL.
    const served = opts.archiveTimestamp
      ? (/\/web\/(\d{14})/.exec(res.url)?.[1] ?? opts.archiveTimestamp)
      : null;
    return {
      requestedUrl: url,
      finalUrl: opts.archiveTimestamp ? url : res.url || url,
      httpStatus: res.status,
      title,
      text,
      contentHash: await sha256(text),
      archivedAt: served,
    };
  } finally {
    clearTimeout(timer);
  }
}
