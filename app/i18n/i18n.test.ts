import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { localeDisplayName } from "@agent-native/core/localization/shared";
import { describe, expect, it } from "vitest";

import {
  pickReplyLocale,
  replyLanguageInstruction,
} from "../../server/lib/agent-language";
import { deskTimeT } from "../../server/lib/rulebook/clock";
import { AGENT_LANGUAGE_NAMES, APP_LOCALE_METADATA, APP_LOCALES } from "../../shared/locales";
import {
  KIND_ORDER,
  checkSummary,
  countdown,
  editorInline,
  formatInZone,
  formatWayback,
  localizeStaleReason,
  relativeTime,
  saveSummary,
  shortDate,
  type Translate,
} from "../lib/rulebook";

import deDE from "./de-DE";
import enUS from "./en-US";
import esES from "./es-ES";
import frFR from "./fr-FR";
import { i18nCatalog } from "./index";
import jaJP from "./ja-JP";
import koKR from "./ko-KR";
import ptBR from "./pt-BR";
import viVN from "./vi-VN";
import zhCN from "./zh-CN";
import zhTW from "./zh-TW";

const CATALOGS: Record<string, Record<string, unknown>> = {
  "en-US": enUS,
  "ko-KR": koKR,
  "ja-JP": jaJP,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "es-ES": esES,
  "fr-FR": frFR,
  "de-DE": deDE,
  "pt-BR": ptBR,
  "vi-VN": viVN,
};
const OTHER_LOCALES = APP_LOCALES.filter((locale) => locale !== "en-US");

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

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
/** Plural keys in English ("desk.index.created" for created_one/created_other). */
const pluralBases = (keys: string[]) =>
  [...new Set(keys.filter((k) => k.endsWith("_other")).map((k) => k.replace(PLURAL_SUFFIX, "")))];
/** English keys plus the plural forms this language's rules use (French adds _many). */
function expectedKeys(locale: string, en: Record<string, string>) {
  const keys = new Set(Object.keys(en));
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  for (const base of pluralBases(Object.keys(en)))
    for (const category of categories) keys.add(`${base}_${category}`);
  return [...keys].sort();
}

/** Desk keys a language may leave as in English: an example name, a time-zone hint, a "{{name}}: …" pattern. */
const MAY_MATCH_ENGLISH = [
  "desk.edit.zonePlaceholder",
  "desk.index.namePlaceholder",
  "desk.timeline.chipTitle",
];

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

  it("ship exactly the ten app languages, English first", () => {
    expect([...APP_LOCALES]).toEqual([
      "en-US",
      "ko-KR",
      "ja-JP",
      "zh-CN",
      "zh-TW",
      "es-ES",
      "fr-FR",
      "de-DE",
      "pt-BR",
      "vi-VN",
    ]);
    expect(Object.keys(CATALOGS)).toEqual([...APP_LOCALES]);
    expect(i18nCatalog.supportedLocales).toEqual(APP_LOCALES);
    expect(i18nCatalog.sourceLocale).toBe("en-US");
  });

  it("the language menu names each language in that language", () => {
    const metadata = Object.fromEntries(APP_LOCALE_METADATA.map((m) => [m.code, m]));
    expect(i18nCatalog.locales?.map((m) => m.code)).toEqual([...APP_LOCALES]);
    expect(APP_LOCALES.map((code) => localeDisplayName(code, metadata))).toEqual([
      "English",
      "한국어",
      "日本語",
      "简体中文",
      "繁體中文",
      "Español",
      "Français",
      "Deutsch",
      "Português",
      "Tiếng Việt",
    ]);
    expect(Object.keys(AGENT_LANGUAGE_NAMES)).toEqual([...APP_LOCALES]);
  });

  for (const locale of OTHER_LOCALES) {
    const other = flatten(CATALOGS[locale]);

    it(`${locale} has the same keys as English, plus the plural forms its grammar uses`, () => {
      expect(Object.keys(other).sort()).toEqual(expectedKeys(locale, en));
    });

    it(`${locale} keeps every {{placeholder}}`, () => {
      const wrong = Object.keys(other).filter((key) => {
        const mine = placeholders(other[key] ?? "");
        // An extra plural form ("_many") carries the same values as "_other".
        const source = key in en ? key : key.replace(PLURAL_SUFFIX, "_other");
        const allowed = PLACEHOLDER_CHOICES[source];
        // A few keys get several forms of one value (zero-padded "05m" in English).
        if (allowed) return mine.some((p) => !allowed.includes(p!));
        return placeholders(en[source]!).join() !== mine.join();
      });
      expect(wrong).toEqual([]);
    });

    it(`${locale} translates the desk screens`, () => {
      const same = Object.keys(en).filter(
        (key) => key.startsWith("desk.") && other[key] === en[key],
      );
      expect(same.filter((key) => !MAY_MATCH_ENGLISH.includes(key))).toEqual([]);
    });

    it(`${locale} gives every count its own text instead of falling back to English`, () => {
      const values = { name: "X", ok: 1, host: "example.org", changed: 1 };
      const missing: string[] = [];
      for (const base of pluralBases(Object.keys(en)))
        for (const count of [0, 1, 2, 5, 21, 1_000_000]) {
          const text = tr(locale)(base, { ...values, count });
          if (text === tr("en-US")(base, { ...values, count })) missing.push(`${base} ${count}`);
        }
      expect(missing).toEqual([]);
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
    const left: Record<string, string> = {
      "en-US": "2d 7h left",
      "ko-KR": "2일 7시간 남음",
      "ja-JP": "残り2日7時間",
      "zh-CN": "剩余2天7小时",
      "zh-TW": "剩餘2天7小時",
      "es-ES": "quedan 2 d 7 h",
      "fr-FR": "encore 2 j 7 h",
      "de-DE": "noch 2 Tg. 7 Std.",
      "pt-BR": "faltam 2 d 7 h",
      "vi-VN": "còn 2 ngày 7 giờ",
    };
    expect(Object.fromEntries(APP_LOCALES.map((l) => [l, countdown(due, tr(l), now).text]))).toEqual(left);
    const closed = "2026-11-07T21:55:00Z";
    expect(countdown(closed, tr("en-US"), now).text).toBe("closed 2h 05m ago");
    expect(countdown(closed, tr("ko-KR"), now).text).toBe("2시간 5분 전 마감");
    expect(countdown(closed, tr("fr-FR"), now).text).toBe("clos il y a 2 h 05");
    expect(countdown(closed, tr("de-DE"), now).text).toBe("vor 2 Std. 05 Min. abgelaufen");
    expect(countdown(closed, tr("vi-VN"), now).text).toBe("đã đóng 2 giờ 5 phút trước");
  });

  it("the agent's countdown strings are the screen's, in every language", () => {
    // Actions and the agent's <deadline-clock> context render time left on the
    // server (deskTimeT); it must read exactly like the screen (i18next).
    const at = [
      "2026-11-08T00:00:00Z", // days
      "2026-11-10T05:00:00Z", // hours
      "2026-11-10T07:51:00Z", // minutes
      "2026-11-10T10:04:00Z", // closed
      "2026-11-14T09:00:00Z", // closed days ago
    ].map((x) => Date.parse(x));
    for (const locale of APP_LOCALES)
      for (const when of at)
        expect(countdown(due, deskTimeT(locale), when).text, `${locale} ${when}`).toBe(
          countdown(due, tr(locale), when).text,
        );
  });

  it("relative time", () => {
    const fiveMin = new Date(now - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMin, tr("en-US"), now)).toBe("5m ago");
    expect(relativeTime(fiveMin, tr("ko-KR"), now)).toBe("5분 전");
    expect(relativeTime(fiveMin, tr("ja-JP"), now)).toBe("5分前");
    expect(relativeTime(fiveMin, tr("zh-CN"), now)).toBe("5分钟前");
    expect(relativeTime(fiveMin, tr("zh-TW"), now)).toBe("5分鐘前");
    expect(relativeTime(fiveMin, tr("es-ES"), now)).toBe("hace 5 min");
    expect(relativeTime(fiveMin, tr("fr-FR"), now)).toBe("il y a 5 min");
    expect(relativeTime(fiveMin, tr("de-DE"), now)).toBe("vor 5 Min.");
    expect(relativeTime(fiveMin, tr("pt-BR"), now)).toBe("há 5 min");
    expect(relativeTime(fiveMin, tr("vi-VN"), now)).toBe("5 phút trước");
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
    // The ten languages: each names the place in its own words.
    expect(formatInZone(due, "America/Los_Angeles", "es-ES")).toContain("hora de Los Ángeles");
    expect(formatInZone(due, "America/Los_Angeles", "de-DE")).toContain("9. Nov. 2026");
    expect(formatInZone(due, "America/Los_Angeles", "pt-BR")).toContain("9 de nov. de 2026");
    expect(formatInZone(due, "Asia/Seoul", "fr-FR")).toContain("Corée du Sud");
    // Intl gives Traditional Chinese and Vietnamese only "PT" in the short form; they get the long name.
    expect(formatInZone(due, "America/Los_Angeles", "zh-TW")).toContain("太平洋時間");
    expect(formatInZone(due, "America/Los_Angeles", "vi-VN")).toContain("Giờ Thái Bình Dương");
    // French writes the offset "UTC−12"; it still reads AoE.
    for (const locale of OTHER_LOCALES)
      expect(formatInZone(due, "Etc/GMT+12", locale), locale).toContain("AoE (UTC−12)");
    expect(shortDate(due, "UTC", "de-DE")).toBe("10. Nov.");
    expect(formatWayback("20251212", "fr-FR")).toBe("12 déc. 2025");
    expect(formatWayback("20251212", "vi-VN")).toBe("12 thg 12, 2025");
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
    const saved = (locale: string, count: number) => tr(locale)("desk.rulebook.savedFacts", { count });
    expect(saved("de-DE", 1)).toBe("1 Eintrag gespeichert.");
    expect(saved("de-DE", 2)).toBe("2 Einträge gespeichert.");
    // French counts 0 as singular; es, fr and pt have a "many" form for millions.
    expect(saved("fr-FR", 0)).toBe("0 élément enregistré.");
    expect(saved("fr-FR", 1_000_000)).toBe("1000000 d’éléments enregistrés.");
    expect(saved("es-ES", 2)).toBe("Se guardaron 2 datos.");
    expect(saved("pt-BR", 1)).toBe("1 item salvo.");
    // Vietnamese and Chinese have one form for every count.
    expect(saved("vi-VN", 1)).toBe("Đã lưu 1 mục.");
    expect(saved("zh-TW", 1)).toBe("已儲存 1 個條目。");
    // Card badges: "1 aprovado", not "1 aprovados".
    const approved = (locale: string, count: number) => tr(locale)("desk.index.approvedCount", { count });
    expect(approved("pt-BR", 1)).toBe("1 aprovado");
    expect(approved("pt-BR", 2)).toBe("2 aprovados");
    expect(approved("fr-FR", 0)).toBe("0 approuvé");
    expect(approved("es-ES", 1)).toBe("1 aprobado");
    expect(approved("ko-KR", 3)).toBe("승인 3");
    expect(tr("en-US")("desk.index.pageErrors", { count: 2 })).toBe("2 page errors");
    expect(tr("fr-FR")("desk.rulebook.paragraphsRemoved", { count: 1 })).toBe("1 supprimé");
  });

  it("the editor's name inside a sentence follows each language", () => {
    const editedBy = (locale: string) =>
      tr(locale)("desk.fact.editedBy", {
        creator: tr(locale)("desk.editor.person"),
        editor: editorInline("agent", tr(locale)),
      });
    expect(editedBy("en-US")).toBe("You · edited by agent");
    expect(editedBy("de-DE")).toBe("Du · bearbeitet von dem KI-Agenten");
    expect(editedBy("fr-FR")).toBe("Vous · modifié par l’agent IA");
    expect(editedBy("vi-VN")).toBe("Bạn · trợ lý AI đã sửa");
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
    expect(checkSummary(result, "20251212", tr("de-DE"), "de-DE")).toBe(
      "Kopie aus dem Internet Archive vom 12. Dez. 2025 geladen. 2 Seiten geprüft, geändert: 1. 1 Eintrag ist jetzt veraltet. 1 Seite übersprungen, die an eine Kopie aus dem Internet Archive gebunden ist.",
    );
    expect(checkSummary({ results: [] }, undefined, tr("pt-BR"))).toBe("Nenhum regulamento para verificar.");
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
    expect(localizeStaleReason(archive, tr("fr-FR"), "fr-FR")).toBe(
      "La citation a disparu de la copie d’Internet Archive de kiroween.devpost.com du 12 déc. 2025.",
    );
    expect(localizeStaleReason(live, tr("es-ES"), "es-ES")).toBe(
      "La cita ya no aparece en builder.io (revisado el 2026-11-09 10:00 UTC).",
    );
    expect(localizeStaleReason("Something else.", tr("ko-KR"))).toBe("Something else.");
  });
});

describe("agent reply language", () => {
  it("prefers the saved choice, then the screen, then the browser", () => {
    expect(pickReplyLocale({ setting: "ko-KR", screen: "en-US" })).toBe("ko-KR");
    expect(pickReplyLocale({ setting: "system", screen: "ja-JP" })).toBe("ja-JP");
    expect(pickReplyLocale({ setting: "system", acceptLanguage: "zh-Hans-CN,zh;q=0.9" })).toBe("zh-CN");
    expect(pickReplyLocale({ setting: "de-DE", screen: "fr-FR" })).toBe("de-DE");
    expect(pickReplyLocale({ setting: "vi-VN" })).toBe("vi-VN");
    // Regional and script variants land on the shipped language.
    expect(pickReplyLocale({ acceptLanguage: "zh-Hant-TW,zh;q=0.9" })).toBe("zh-TW");
    expect(pickReplyLocale({ acceptLanguage: "zh-HK" })).toBe("zh-TW");
    expect(pickReplyLocale({ acceptLanguage: "es-MX" })).toBe("es-ES");
    expect(pickReplyLocale({ acceptLanguage: "pt-PT" })).toBe("pt-BR");
    expect(pickReplyLocale({ acceptLanguage: "fr-CA" })).toBe("fr-FR");
    expect(pickReplyLocale({ acceptLanguage: "de-AT" })).toBe("de-DE");
    expect(pickReplyLocale({ acceptLanguage: "vi" })).toBe("vi-VN");
    // A language the app does not ship is skipped; nothing usable means English.
    expect(pickReplyLocale({ acceptLanguage: "it-IT,ko;q=0.8" })).toBe("ko-KR");
    expect(pickReplyLocale({ acceptLanguage: "it-IT" })).toBe("en-US");
    expect(pickReplyLocale({})).toBe("en-US");
  });

  it("tells the agent to answer in the screen language and keep quotes verbatim", () => {
    expect(replyLanguageInstruction("en-US")).toBe("");
    for (const locale of OTHER_LOCALES) {
      const text = replyLanguageInstruction(locale);
      expect(text, locale).toContain(`The person reads this app in ${AGENT_LANGUAGE_NAMES[locale]}.`);
      expect(text, locale).toContain("Never translate a quote");
    }
    expect(replyLanguageInstruction("ko-KR")).toContain("Korean (한국어)");
    expect(replyLanguageInstruction("zh-CN")).toContain("Simplified Chinese");
    expect(replyLanguageInstruction("zh-TW")).toContain("Traditional Chinese (繁體中文)");
    expect(replyLanguageInstruction("vi-VN")).toContain("Vietnamese (Tiếng Việt)");
  });
});
