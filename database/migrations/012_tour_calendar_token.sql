-- Unique token for calendar feed subscriptions (shareable without login).
ALTER TABLE tours ADD COLUMN IF NOT EXISTS calendar_token UUID DEFAULT gen_random_uuid();
