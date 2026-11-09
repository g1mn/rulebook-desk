# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Rulebook Desk

Turn contest, grant and program rule pages into checked deadlines and requirements. `/desk` lists rulebooks with a deadline timeline; `/desk/:rulebookId?fact=<id>` is the review table beside the page text. Chat stays at `/chat`.

- Every saved fact carries a verbatim quote. `save-facts`/`update-fact` check it against the fetched page (normalized whitespace and curly quotes); unfound quotes are rejected for agents. Never paraphrase inside a quote.
- Only verified facts can be approved (409 `quote_unverified`). Agent approvals require the person's confirmation; an agent edit to an approved fact returns it to `proposed`.
- Deadlines: send `dueLocal` "YYYY-MM-DDTHH:mm" as written plus `timeZone` (IANA or PT/ET/UTC/KST/AoE). Code computes `dueAt` (UTC ISO). Do no time math.
- Time left is computed in code too, never by the agent: dated facts from `save-facts`, `update-fact`, `get-rulebook` and `list-rulebooks` (next deadline) carry `clock` (`timeLeft`, `yourTime`, `pageTime`, `utc`, `minutesLeft`), the same strings the screen shows (`shared/deadline-clock.ts`, server text from the screen's `desk.time.*` keys in `server/lib/rulebook/clock.ts`). Each agent request also gets a `<deadline-clock>` block (now, plus the open rulebook's deadlines). Quote these; call `deadline-clock` for a fresh value. The person's zone comes from the `x-user-timezone` header (actions from the screen) or, for chat requests that carry no such header, from `timeZone` in the screen's navigation state (`app/hooks/use-navigation-state.ts`); UTC only when neither exists. A deadline the page gives as a date with no time (`dueLocal` "YYYY-MM-DD") is date only: its `dueAt` is the start of that day in the page's zone, used for sorting and the timeline position only. The screen shows the page's date with "(no time given)" and a "date only" badge, and counts whole days ("4d left", "today", "closed 13d ago"); its `clock` has `dateOnly: true`, `daysLeft`, `minutesLeft: null` and no time of day in any string, and the context block marks it "date only". Never show or state a time for it.
- `check-sources` re-fetches pages; changed text stores a snapshot, records added/removed paragraphs, marks facts stale when their quote vanished, and emits `rulebook.source.changed`. `asOf` (Wayback "YYYYMMDD") loads an Internet Archive copy instead.
- `navigation` adds `rulebookId` and `factId` (selected row). `view-screen` returns the open rulebook and selected fact.
- Languages (10): en-US (source, default), ko-KR, ja-JP, zh-CN, zh-TW, es-ES, fr-FR, de-DE, pt-BR, vi-VN (`shared/locales.ts`, which also holds each language's own name for the menu). Screen text lives in `app/i18n/desk/<locale>.ts`; add a key to all ten files (`app/i18n/i18n.test.ts` checks key parity, placeholders and that every `t("desk.…")` key exists). Plural keys need every form the language uses: `_one`/`_other` everywhere, plus `_many` in es-ES, fr-FR and pt-BR. Names used mid-sentence go in `desk.editorInline`, never `toLowerCase()`. vi-VN is not a framework built-in: its loader is in `app/i18n/index.ts` and framework chat/settings text stays English there. Dates go through `Intl` with the active locale. The header language menu and Settings › Preferences write the same `localization` user setting; the agent prompt gets a reply-language block from it (`server/lib/agent-language.ts`). Quotes are never translated.

| Action | Purpose |
|---|---|
| list-rulebooks | Rulebooks with counts and next deadline |
| get-rulebook | Sources, facts, recent changes |
| create-rulebook | Track 1-5 URLs and fetch them |
| add-source | Add a page to a rulebook |
| read-source | Numbered paragraphs; `find` filters |
| save-facts | Batch-save quoted facts (proposed) |
| update-fact | Patch a fact or set status/done |
| check-sources | Re-fetch, diff, mark stale |
| list-archive-copies | Wayback copies to replay via asOf |
| deadline-clock | Now and time left per deadline, computed in code |
| delete-rulebook | Delete after the person confirms |
