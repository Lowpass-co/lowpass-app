-- Add "pending testing" status for post-deploy verification queue
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;

ALTER TABLE bug_reports
  ADD CONSTRAINT bug_reports_status_check
  CHECK (
    status IN (
      'open',
      'in_progress',
      'pending_testing',
      'resolved',
      'wont_fix',
      'duplicate'
    )
  );
