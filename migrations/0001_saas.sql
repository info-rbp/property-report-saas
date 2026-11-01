PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL, trial_used INTEGER NOT NULL DEFAULT 0 CHECK(trial_used IN (0,1))
);
CREATE TABLE login_challenges (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE,
  flow_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL,
  trial_ends_at INTEGER NOT NULL, branding_json TEXT NOT NULL DEFAULT '{}',
  terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  billing_hold INTEGER NOT NULL DEFAULT 0 CHECK(billing_hold IN (0,1)),
  archived_at INTEGER
);
CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TRIGGER keep_last_owner_delete BEFORE DELETE ON members
WHEN OLD.role='owner' AND (SELECT COUNT(*) FROM members WHERE workspace_id=OLD.workspace_id AND role='owner')=1
BEGIN SELECT RAISE(ABORT,'last_owner'); END;
CREATE TRIGGER keep_last_owner_update BEFORE UPDATE OF role ON members
WHEN OLD.role='owner' AND NEW.role<>'owner' AND (SELECT COUNT(*) FROM members WHERE workspace_id=OLD.workspace_id AND role='owner')=1
BEGIN SELECT RAISE(ABORT,'last_owner'); END;
CREATE TABLE invitations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
  token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id), accepted_at INTEGER, revoked_at INTEGER
);
CREATE UNIQUE INDEX active_invitation ON invitations(workspace_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE billing_customers (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), customer_id TEXT NOT NULL UNIQUE
);
CREATE TABLE subscriptions (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  subscription_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, price_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('solo','professional','business')),
  access_until INTEGER NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  last_event_created INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at INTEGER NOT NULL,
  payload_hash TEXT NOT NULL, processed_at INTEGER NOT NULL
);
CREATE TABLE billing_risks (
  event_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL, stripe_object_id TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE checkout_attempts (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  request_id TEXT NOT NULL, plan TEXT NOT NULL, session_id TEXT, url TEXT, expires_at INTEGER NOT NULL
);
CREATE TABLE properties (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL,
  address TEXT NOT NULL, normalized_address TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER,
  PRIMARY KEY(workspace_id,id)
);
CREATE UNIQUE INDEX active_property_address ON properties(workspace_id,normalized_address) WHERE archived_at IS NULL;
CREATE TABLE reports (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL, property_id TEXT NOT NULL,
  report_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  revision INTEGER NOT NULL DEFAULT 1, report_data TEXT NOT NULL,
  parent_report_id TEXT, correction_reason TEXT, pdf_key TEXT, pdf_sha256 TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
  write_token TEXT,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,property_id) REFERENCES properties(workspace_id,id),
  FOREIGN KEY(workspace_id,parent_report_id) REFERENCES reports(workspace_id,id)
);
CREATE TRIGGER immutable_completed_update BEFORE UPDATE ON reports
WHEN OLD.status='completed'
BEGIN SELECT RAISE(ABORT,'completed_report_immutable'); END;
CREATE TRIGGER immutable_completed_delete BEFORE DELETE ON reports
WHEN OLD.status='completed'
BEGIN SELECT RAISE(ABORT,'completed_report_immutable'); END;
CREATE TABLE objects (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL, report_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('photo','cover','pdf')), object_key TEXT NOT NULL UNIQUE,
  backup_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>0),
  mime_type TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,report_id) REFERENCES reports(workspace_id,id)
);
CREATE TABLE templates (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL,
  name TEXT NOT NULL, report_type TEXT NOT NULL, property_id TEXT,
  template_data TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,property_id) REFERENCES properties(workspace_id,id)
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL, action TEXT NOT NULL, resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX audit_by_workspace ON audit_events(workspace_id,created_at DESC);
CREATE INDEX reports_by_property ON reports(workspace_id,property_id,updated_at DESC);
CREATE INDEX report_usage ON reports(workspace_id,created_at);
CREATE INDEX objects_by_report ON objects(workspace_id,report_id);
CREATE TABLE release_evidence (
  key TEXT PRIMARY KEY, release_id TEXT NOT NULL, approved_by TEXT NOT NULL,
  evidence_uri TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
  approved_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE billing_locks (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
-- A transaction-local assertion prevents a stale billing worker from committing after losing its lease.
CREATE TABLE transaction_guards (
  id TEXT PRIMARY KEY,
  approved INTEGER NOT NULL CONSTRAINT transaction_guard_failed CHECK(approved=1)
);
CREATE TABLE recovery_records (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), object_id TEXT NOT NULL,
  report_id TEXT NOT NULL, object_key TEXT NOT NULL, backup_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, mime_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL, removed_at INTEGER NOT NULL, removed_by TEXT NOT NULL,
  PRIMARY KEY(workspace_id,object_id)
);
CREATE TABLE storage_cleanup (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), object_id TEXT NOT NULL,
  object_key TEXT NOT NULL, report_id TEXT NOT NULL, queued_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, completed_at INTEGER,
  PRIMARY KEY(workspace_id,object_id)
);
CREATE INDEX pending_storage_cleanup ON storage_cleanup(completed_at,queued_at);
