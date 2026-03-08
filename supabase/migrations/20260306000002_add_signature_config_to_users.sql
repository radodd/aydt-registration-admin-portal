-- Add signature_config JSONB to users so admins can re-edit their signature fields.
-- signature_html already exists and is used by the email sender.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_config JSONB;
