import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  pickReplyLocale,
  replyLanguageInstruction,
} from "../../server/lib/agent-language";
import { APP_LOCALES } from "../../shared/locales";
import {
  KIND_ORDER,
  checkSummary,
  countdown,
  formatInZone,
  formatWayback,
  localizeStaleReason,
  relativeTime,
  saveSummary,
  shortDate,
  type Translate,
} from "../lib/rulebook";

import enUS from "./en-US";
import { i18nCatalog } from "./index";
import jaJP from "./ja-JP";
import koKR from "./ko-KR";
import zhCN from "./zh-CN";

const CATALOGS: Record<string, Record<string, unknown>> = {
  "en-US": enUS,
  "ko-KR": koKR,
  "ja-JP": jaJP,
  "zh-CN": zhCN,
};

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out[path] = child;
    else flatten(child, path, out);
  }
  return out;
}

/** Keys whose callers pass several forms of a value; a language uses the ones it needs. */
const PLACEHOLDER_CHOICES: Record<string, string[]> = {
  "desk.time.spanHours": ["h", "m", "mm"],
};

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

// The app runs on the framework's i18next; use the same library (a dependency
// of @agent-native/core) so plural and interpolation rules match the screen.
const coreRequire = createRequire(createRequire(import.meta.url).resolve("@agent-native/core/client/i18n"));
type I18nInstance = {
  init: (options: Record<string, unknown>) => unknown;
  getFixedT: (locale: string) => unknown;
};
type I18nModule = { createInstance: () => I18nInstance; default?: I18nModule };
const i18next = coreRequire("i18next") as I18nModule;
const instance = (i18next.default ?? i18next).createInstance();
void instance.init({
  resources: Object.fromEntries(
    Object.entries(CATALOGS).map(([locale, messages]) => [locale, { translation: messages }]),
  ),
  lng: "en-US",
  fallbackLng: "en-US",
  interpolation: { escapeValue: false },
  initAsync: false,
});
const tr = (locale: string): Translate => instance.getFixedT(locale) as unknown as Translate;

describe("translation catalogs", () => {
  const en = flatten(enUS);

  it("ship exactly the four app languages", () => {
    expect([...APP_LOCALES]).toEqual(["en-US", "ko-KR", "ja-JP", "zh-CN"]);
    expect(i18nCatalog.supportedLocales).toEqual(APP_LOCALES);
    expect(i18nCatalog.sourceLocale).toBe("en-US");
  });

  for (const locale of ["ko-KR", "ja-JP", "zh-CN"]) {
    const other = flatten(CATALOGS[locale]);

    it(`${locale} has the same keys as English`, () => {
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    });

    it(`${locale} keeps every {{placeholder}}`, () => {
      const wrong = Object.keys(en).filter((key) => {
        const mine = placeholders(other[key] ?? "");
        const allowed = PLACEHOLDER_CHOICES[key];
        // A few keys get several forms of one value (zero-padded "05m" in English).
        if (allowed) return mine.some((p) => !allowed.includes(p!));
        return placeholders(en[key]!).join() !== mine.join();
      });
      expect(wrong).toEqual([]);
    });

    it(`${locale} translates the desk screens`, () => {
      const same = Object.keys(en).filter(
        (key) => key.startsWith("desk.") && other[key] === en[key],
      );
      // Proper names and examples may stay as they are.
      expect(same.sort()).toEqual(
        ["desk.edit.zonePlaceholder", "desk.index.namePlaceholder", "desk.timeline.chipTitle"].filter(
          (key) => other[key] === en[key],
        ),
      );
    });

    it(`${locale} loads through the catalog`, async () => {
      const loaded = flatten(await i18nCatalog.loadMessages(locale as never));
      expect(loaded["desk.nav.rulebooks"]).toBe(other["desk.nav.rulebooks"]);
      expect(loaded["desk.fact.approve"]).toBe(other["desk.fact.approve"]);
    });
  }

  it("has every key the screens ask for", () => {
    const appDir = path.resolve(__dirname, "..");
    const files = (readdirSync(appDir, { recursive: true }) as string[])
      .filter((f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => readFileSync(path.join(appDir, f), "utf8"));
    const used = new Set<string>();
    for (const src of files)
      for (const m of src.matchAll(/\bt\(\s*"(desk\.[\w.]+)"/g)) used.add(m[1]!);
    // Keys built from values.
    for (const kind of KIND_ORDER) used.add(`desk.kind.${kind}`).add(`desk.kindSingular.${kind}`);
    for (const status of ["proposed", "approved", "rejected", "stale"]) used.add(`desk.status.${status}`);
    for (const status of ["success", "error", "running", "skipped"])
      used.add(`desk.automations.runStatus.${status}`);
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter(
      (key) => !(key in en) && !(`${key}_one` in en && `${key}_other` in en),
    );
    expect(missing).toEqual([]);
  });

  it("has no empty strings and no em dashes in desk text", () => {
    for (const messages of Object.values(CATALOGS)) {
      for (const [key, text] of Object.entries(flatten(messages))) {
        expect(text.trim(), key).not.toBe("");
        if (key.startsWith("desk.")) expect(text, key).not.toContain("—");
      }
    }
  });
});

describe("dates, times and counts per language", () => {
  const now = Date.parse("2026-11-08T00:00:00Z");
  const due = "2026-11-10T07:59:00.000Z";

  it("countdown", () => {
    expect(countdown(due, tr("en-US"), now).text).toBe("2d 7h left");
    expect(countdown(due, tr("ko-KR"), now).text).toBe("2일 7시간 남음");
    expect(countdown(due, tr("ja-JP"), now).text).toBe("残り2日7時間");
    expect(countdown(due, tr("zh-CN"), now).text).toBe("剩余2天7小时");
    expect(countdown("2026-11-07T21:55:00Z", tr("en-US"), now).text).toBe("closed 2h 05m ago");
    expect(countdown("2026-11-07T21:55:00Z", tr("ko-KR"), now).text).toBe("2시간 5분 전 마감");
  });

  it("relative time", () => {
    const fiveMin = new Date(now - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMin, tr("en-US"), now)).toBe("5m ago");
    expect(relativeTime(fiveMin, tr("ko-KR"), now)).toBe("5분 전");
    expect(relativeTime(fiveMin, tr("ja-JP"), now)).toBe("5分前");
    expect(relativeTime(fiveMin, tr("zh-CN"), now)).toBe("5分钟前");
    expect(relativeTime(null, tr("en-US"), now)).toBe("never");
  });

  it("English deadline text is unchanged; other languages name the place in that language", () => {
    expect(formatInZone(due, "America/Los_Angeles")).toBe("Mon, Nov 9, 2026, 11:59 PM PST");
    expect(formatInZone(due, "Asia/Seoul")).toBe("Tue, Nov 10, 2026, 4:59 PM Seoul time");
    expect(formatInZone(due, "America/Los_Angeles", "ko-KR")).toContain("로스앤젤레스");
    expect(formatInZone(due, "Asia/Seoul", "ko-KR")).toContain("2026년 11월 10일");
    expect(formatInZone(due, "America/Los_Angeles", "ja-JP")).toContain("2026年11月9日");
    expect(formatInZone(due, "America/Los_Angeles", "zh-CN")).toContain("洛杉矶");
    expect(formatInZone(due, "UTC", "zh-CN")).toContain("UTC");
    expect(formatInZone(due, "Etc/GMT+12", "ja-JP")).toContain("AoE (UTC−12)");
    expect(shortDate(due, "UTC", "ko-KR")).toBe("11월 10일");
    expect(formatWayback("20251212", "ja-JP")).toBe("2025年12月12日");
  });

  it("plurals follow each language", () => {
    expect(tr("en-US")("desk.index.created", { name: "X", ok: 1, count: 1 })).toBe(
      'Created "X" and fetched 1 of 1 page.',
    );
    expect(tr("en-US")("desk.index.created", { name: "X", ok: 2, count: 3 })).toBe(
      'Created "X" and fetched 2 of 3 pages.',
    );
    expect(tr("ko-KR")("desk.index.created", { name: "X", ok: 1, count: 1 })).toBe(
      '"X" 규정집을 만들고 페이지 1개 중 1개를 가져왔습니다.',
    );
  });

  it("toasts are built from the action result", () => {
    const result = {
      results: [
        { status: "changed", staleFactIds: ["a"] },
        { status: "unchanged", staleFactIds: [] },
      ],
      pinned: 1,
    };
    expect(checkSummary(result, "20251212", tr("en-US"))).toBe(
      "Loaded the Internet Archive copy from Dec 12, 2025. Checked 2 pages, 1 changed. 1 fact now stale. Skipped 1 page pinned to an Internet Archive copy.",
    );
    expect(checkSummary({ results: [] }, undefined, tr("zh-CN"))).toBe("没有可检查的规则。");
    expect(
      saveSummary({ saved: [], rejected: [{ reason: "Quote not found verbatim on any fetched page." }] }, tr("ja-JP")),
    ).toEqual({ ok: false, text: "追跡中のページにない文なので保存できません。" });
    expect(saveSummary({ saved: [{}], rejected: [] }, tr("ko-KR"))).toEqual({
      ok: true,
      text: "항목 1개를 저장했습니다.",
    });
  });

  it("stale reasons stored in English read in the screen language", () => {
    const archive = "Quote is gone from the Internet Archive copy of kiroween.devpost.com dated 2025-12-12.";
    expect(localizeStaleReason(archive, tr("en-US"))).toBe(
      "Quote is gone from the Internet Archive copy of kiroween.devpost.com dated Dec 12, 2025.",
    );
    expect(localizeStaleReason(archive, tr("ko-KR"), "ko-KR")).toBe(
      "2025년 12월 12일 자 kiroween.devpost.com 인터넷 아카이브 사본에서 인용 문장이 사라졌습니다.",
    );
    const live = "Quote no longer appears on builder.io (checked 2026-11-09 10:00 UTC).";
    expect(localizeStaleReason(live, tr("zh-CN"), "zh-CN")).toBe(
      "builder.io 上已找不到这段引文（2026-11-09 10:00 UTC 检查）。",
    );
    expect(localizeStaleReason("Something else.", tr("ko-KR"))).toBe("Something else.");
  });
});

describe("agent reply language", () => {
  it("prefers the saved choice, then the screen, then the browser", () => {
    expect(pickReplyLocale({ setting: "ko-KR", screen: "en-US" })).toBe("ko-KR");
    expect(pickReplyLocale({ setting: "system", screen: "ja-JP" })).toBe("ja-JP");
    expect(pickReplyLocale({ setting: "system", acceptLanguage: "zh-Hans-CN,zh;q=0.9" })).toBe("zh-CN");
    expect(pickReplyLocale({ acceptLanguage: "fr-FR,ko;q=0.8" })).toBe("ko-KR");
    expect(pickReplyLocale({ acceptLanguage: "fr-FR" })).toBe("en-US");
    expect(pickReplyLocale({})).toBe("en-US");
  });

  it("tells the agent to answer in the screen language and keep quotes verbatim", () => {
    expect(replyLanguageInstruction("en-US")).toBe("");
    const ko = replyLanguageInstruction("ko-KR");
    expect(ko).toContain("Korean (한국어)");
    expect(ko).toContain("Never translate a quote");
    expect(replyLanguageInstruction("zh-CN")).toContain("Simplified Chinese");
  });
});
