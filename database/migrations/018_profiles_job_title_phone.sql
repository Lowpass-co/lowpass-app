-- LOWPASS — Extend profiles with job title and phone for profile page.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN profiles.job_title IS 'User job title (e.g. Tour Manager)';
COMMENT ON COLUMN profiles.phone IS 'Contact phone number';
