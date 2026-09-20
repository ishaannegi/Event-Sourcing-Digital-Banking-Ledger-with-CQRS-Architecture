ALTER TABLE tamper_demo_backups 
ADD COLUMN IF NOT EXISTS original_previous_hash VARCHAR(128),
ADD COLUMN IF NOT EXISTS original_hash VARCHAR(128);
