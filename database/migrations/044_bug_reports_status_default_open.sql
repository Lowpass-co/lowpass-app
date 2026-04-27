-- Legacy 001 schema defaulted bug_reports.status to 'new', which is not allowed by
-- bug_reports_status_check after reconcile migrations — inserts that omit status then fail.
ALTER TABLE bug_reports ALTER COLUMN status SET DEFAULT 'open';

UPDATE bug_reports SET status = 'open' WHERE status IN ('new', 'triaged');
UPDATE bug_reports SET status = 'resolved' WHERE status = 'closed';
