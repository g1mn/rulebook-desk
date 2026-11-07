import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "rulebook-desk",
      sql: `CREATE TABLE IF NOT EXISTS rulebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS rulebook_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS rulebook_sources (
  id TEXT PRIMARY KEY,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id),
  url TEXT NOT NULL,
  title TEXT,
  current_snapshot_id TEXT,
  last_checked_at TEXT,
  last_changed_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'pending' CHECK (last_status IN ('pending', 'ok', 'error')),
  last_error TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  UNIQUE (rulebook_id, url)
);
CREATE TABLE IF NOT EXISTS rulebook_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES rulebook_sources(id),
  fetched_at TEXT NOT NULL,
  archived_at TEXT,
  content_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS rulebook_facts (
  id TEXT PRIMARY KEY,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id),
  source_id TEXT REFERENCES rulebook_sources(id),
  kind TEXT NOT NULL CHECK (kind IN ('deadline', 'submission', 'requirement', 'eligibility', 'judging', 'prize', 'other')),
  label TEXT NOT NULL,
  detail TEXT,
  due_local TEXT,
  due_time_zone TEXT,
  due_at TEXT,
  quote TEXT,
  quote_status TEXT NOT NULL DEFAULT 'none' CHECK (quote_status IN ('verified', 'unverified', 'none')),
  quote_paragraph INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'stale')),
  stale_reason TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT 'agent',
  updated_by TEXT NOT NULL DEFAULT 'agent',
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now()),
  CHECK (status <> 'approved' OR quote_status = 'verified')
);
CREATE TABLE IF NOT EXISTS rulebook_changes (
  id TEXT PRIMARY KEY,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id),
  source_id TEXT NOT NULL REFERENCES rulebook_sources(id),
  detected_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'live' CHECK (kind IN ('live', 'archive')),
  from_snapshot_id TEXT,
  to_snapshot_id TEXT NOT NULL,
  added TEXT NOT NULL DEFAULT '[]',
  removed TEXT NOT NULL DEFAULT '[]',
  affected_fact_ids TEXT NOT NULL DEFAULT '[]',
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE INDEX IF NOT EXISTS rulebooks_owner_org_idx ON rulebooks (owner_email, org_id, updated_at);
CREATE INDEX IF NOT EXISTS rulebook_shares_resource_idx ON rulebook_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS rulebook_sources_rulebook_idx ON rulebook_sources (rulebook_id);
CREATE INDEX IF NOT EXISTS rulebook_snapshots_source_idx ON rulebook_snapshots (source_id, fetched_at);
CREATE INDEX IF NOT EXISTS rulebook_facts_rulebook_idx ON rulebook_facts (rulebook_id, kind, due_at);
CREATE INDEX IF NOT EXISTS rulebook_changes_rulebook_idx ON rulebook_changes (rulebook_id, detected_at)`,
    },
  ],
  { table: "rulebook_app_migrations" },
);
