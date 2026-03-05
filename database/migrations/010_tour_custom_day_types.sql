-- Store custom day types per tour (used in routing day type combobox).
ALTER TABLE tours ADD COLUMN IF NOT EXISTS custom_day_types TEXT[] DEFAULT '{}';
