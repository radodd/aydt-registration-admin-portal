-- Media folders table for dynamic folder management
CREATE TABLE media_folders (
  name       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed built-in folders
INSERT INTO media_folders (name, label) VALUES
  ('general',       'General'),
  ('email-banners', 'Email Banners'),
  ('website',       'Website Images'),
  ('staff',         'Staff Photos');
