-- Profile editor: phone, passport (encrypted at app layer), day rate, per diem rate
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport_encrypted TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS day_rate NUMERIC(12,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS per_diem_rate NUMERIC(12,2);

COMMENT ON COLUMN profiles.passport_encrypted IS 'Optional; encrypt at application layer before storing.';
