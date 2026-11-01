ALTER TABLE reports ADD COLUMN issued_at INTEGER;
ALTER TABLE reports ADD COLUMN content_sha256 TEXT;
CREATE TABLE workspace_assets (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,backup_key TEXT NOT NULL UNIQUE,sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,mime_type TEXT NOT NULL,created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,id)
);
CREATE TABLE deliveries (
  workspace_id TEXT NOT NULL,id TEXT NOT NULL,report_id TEXT NOT NULL,
  request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('send','signature')),
  status TEXT NOT NULL DEFAULT 'queued',subject TEXT NOT NULL,created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,completed_at INTEGER,
  PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,request_key),
  FOREIGN KEY(workspace_id,report_id) REFERENCES reports(workspace_id,id)
);
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,delivery_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,lease_until INTEGER,provider_id TEXT,created_at INTEGER NOT NULL,
  accepted_at INTEGER,delivered_at INTEGER,last_error TEXT,
  FOREIGN KEY(workspace_id,delivery_id) REFERENCES deliveries(workspace_id,id)
);
CREATE INDEX email_outbox_due ON email_outbox(status,next_attempt_at);
CREATE TABLE signature_requests (
  workspace_id TEXT NOT NULL,id TEXT NOT NULL,report_id TEXT NOT NULL,delivery_id TEXT NOT NULL,
  signing_order TEXT NOT NULL CHECK(signing_order IN ('sequential','parallel')),
  status TEXT NOT NULL DEFAULT 'pending',revision INTEGER NOT NULL DEFAULT 1,
  issued_pdf_sha256 TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
  completed_at INTEGER,executed_key TEXT,executed_backup_key TEXT,executed_sha256 TEXT,executed_bytes INTEGER,
  execution_lease TEXT,execution_lease_until INTEGER,write_token TEXT,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,report_id) REFERENCES reports(workspace_id,id),
  FOREIGN KEY(workspace_id,delivery_id) REFERENCES deliveries(workspace_id,id)
);
CREATE UNIQUE INDEX one_pending_signature ON signature_requests(workspace_id,report_id) WHERE status IN ('pending','partially_signed','executing');
CREATE TABLE signature_parties (
  workspace_id TEXT NOT NULL,request_id TEXT NOT NULL,id TEXT NOT NULL,
  name TEXT NOT NULL,email TEXT NOT NULL,role_label TEXT NOT NULL,sequence INTEGER NOT NULL,
  countersigner INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL UNIQUE,token_encrypted TEXT NOT NULL,
  signed_name TEXT,signature_image TEXT,signature_hash TEXT,commentary TEXT,fields_json TEXT NOT NULL DEFAULT '[]',
  consent_text TEXT,signed_at INTEGER,created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,request_id) REFERENCES signature_requests(workspace_id,id)
);
CREATE TABLE email_webhook_events(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE archive_jobs (
  workspace_id TEXT NOT NULL,id TEXT NOT NULL,report_id TEXT NOT NULL,
  object_key TEXT NOT NULL,backup_key TEXT NOT NULL,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,archived_at INTEGER,last_error TEXT,
  PRIMARY KEY(workspace_id,id)
);
CREATE TABLE backup_status (
  kind TEXT PRIMARY KEY,completed_at INTEGER NOT NULL,manifest_sha256 TEXT NOT NULL,reference TEXT NOT NULL
);
CREATE TABLE closure_requests (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT PRIMARY KEY,requested_by TEXT NOT NULL,
  reason TEXT NOT NULL,requested_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending_review'
);

ALTER TABLE signature_requests ADD COLUMN last_checked_at INTEGER;

ALTER TABLE objects ADD COLUMN client_key TEXT;
CREATE UNIQUE INDEX objects_client_key ON objects(workspace_id,report_id,client_key) WHERE client_key IS NOT NULL;

ALTER TABLE archive_jobs ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE archive_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE archive_jobs ADD COLUMN lease_until INTEGER;
ALTER TABLE archive_jobs ADD COLUMN archive_id TEXT;
ALTER TABLE archive_jobs ADD COLUMN envelope_sha256 TEXT;

CREATE TRIGGER templates_property_scope BEFORE INSERT ON templates WHEN NEW.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM properties WHERE workspace_id=NEW.workspace_id AND id=NEW.property_id) BEGIN SELECT RAISE(ABORT,'template_property_scope'); END;
