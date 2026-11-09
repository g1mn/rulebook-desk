import { createRequire } from "node:module";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Translate } from "@/lib/rulebook";
import { APP_LOCALES } from "../../../shared/locales";
import deDE from "../../i18n/de-DE";
import enUS from "../../i18n/en-US";
import esES from "../../i18n/es-ES";
import frFR from "../../i18n/fr-FR";
import jaJP from "../../i18n/ja-JP";
import koKR from "../../i18n/ko-KR";
import ptBR from "../../i18n/pt-BR";
import viVN from "../../i18n/vi-VN";
import zhCN from "../../i18n/zh-CN";
import zhTW from "../../i18n/zh-TW";

import { FactRow, type Fact } from "./FactRow";

const CATALOGS = {
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

// The row as the screen renders it, with the app's own i18next catalogs
// (the same library the framework runs; see app/i18n/i18n.test.ts).
const coreRequire = createRequire(createRequire(import.meta.url).resolve("@agent-native/core/client/i18n"));
type I18nModule = {
  createInstance: () => { init: (o: Record<string, unknown>) => unknown; getFixedT: (l: string) => unknown };
  default?: I18nModule;
};
const i18next = coreRequire("i18next") as I18nModule;
const instance = (i18next.default ?? i18next).createInstance();
const current = { locale: "en-US" };

vi.mock("@/hooks/use-desk-i18n", () => ({
  useDeskI18n: () => ({
    t: instance.getFixedT(current.locale) as unknown as Translate,
    locale: current.locale,
  }),
}));

const base: Fact = {
  id: "f1",
  sourceId: "s1",
  kind: "deadline",
  label: "Hackathon start",
  detail: null,
  dueLocal: "2026-10-27",
  dueTimeZone: "America/Los_Angeles",
  // Start of the day in PT, stored for sorting.
  dueAt: "2026-10-27T07:00:00.000Z",
  quote: "October 27, 2026 : Hackathon begins",
  quoteStatus: "verified",
  quoteParagraph: 3,
  status: "proposed",
  staleReason: null,
  done: false,
  createdBy: "agent",
  updatedBy: "agent",
  updatedAt: "2026-11-09T08:00:00.000Z",
};

const render = (fact: Fact, locale = "en-US") => {
  current.locale = locale;
  const html = renderToStaticMarkup(
    <FactRow
      fact={fact}
      selected={false}
      flash={false}
      userZone="Asia/Seoul"
      onSelect={() => {}}
      onApprove={() => {}}
      onReject={() => {}}
      onEdit={() => {}}
      onToggleDone={() => {}}
    />,
  );
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
};

describe("FactRow deadline line", () => {
  beforeAll(async () => {
    await instance.init({
      resources: Object.fromEntries(
        Object.entries(CATALOGS).map(([locale, messages]) => [locale, { translation: messages }]),
      ),
      lng: "en-US",
      fallbackLng: "en-US",
      interpolation: { escapeValue: false },
      initAsync: false,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    // v2.2 demo, 17:10 KST.
    vi.setSystemTime(Date.parse("2026-11-09T08:10:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("a date-only fact shows the page's date, a day count and no clock time", () => {
    const text = render(base);
    expect(text).toContain("closed 13d ago");
    expect(text).toContain("page says Tue, Oct 27, 2026 (no time given)");
    expect(text).toContain("date only");
    for (const madeUp of ["12:00 AM", "PDT", "4:00 PM", "Seoul time", "UTC", "13d 1h"])
      expect(text).not.toContain(madeUp);
    const target = render({ ...base, label: "Target winner announcement", dueLocal: "2026-11-13", dueAt: "2026-11-13T08:00:00.000Z" });
    expect(target).toContain("4d left");
    expect(target).toContain("page says Fri, Nov 13, 2026 (no time given)");
    expect(target).not.toMatch(/\d{1,2}:\d{2}|3d 23h/);
  });

  it("no clock time in any of the ten languages", () => {
    for (const locale of APP_LOCALES) {
      const text = render(base, locale);
      const t = instance.getFixedT(locale) as unknown as Translate;
      expect(text, locale).not.toMatch(/\d{1,2}[:：]\d{2}|\bUTC\b/);
      expect(text, locale).toContain(t("desk.time.dateOnly"));
      expect(text, locale).toContain(t("desk.time.closed", { span: t("desk.time.spanDay", { d: 13 }) }));
    }
    expect(render(base, "ko-KR")).toContain("페이지 표기 2026년 10월 27일 (화), 시각 미기재");
    expect(render(base, "ko-KR")).toContain("날짜만");
  });

  it("a fact with a time on the page keeps its local, page and UTC times", () => {
    const text = render({
      ...base,
      label: "Final submission deadline",
      dueLocal: "2026-11-09T23:59",
      dueAt: "2026-11-10T07:59:00.000Z",
      quote: "Monday, November 9, 2026 at 11:59 PM PT : Final submission deadline.",
    });
    expect(text).toContain("23h 49m left");
    expect(text).toContain("Tue, Nov 10, 2026, 4:59 PM Seoul time");
    expect(text).toContain("page says Mon, Nov 9, 2026, 11:59 PM PST");
    expect(text).toContain("2026-11-10 07:59 UTC");
    expect(text).not.toContain("no time given");
    expect(text).not.toContain("date only");
  });
});
