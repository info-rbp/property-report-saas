-- All primary billable bytes, including retained logos and executed signature PDFs.
CREATE VIEW workspace_storage AS
SELECT workspace_id,bytes FROM objects
UNION ALL SELECT workspace_id,bytes FROM workspace_assets
UNION ALL SELECT workspace_id,executed_bytes AS bytes FROM signature_requests WHERE executed_bytes IS NOT NULL;
