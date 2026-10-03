CREATE TABLE profile_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  upload_key uuid NOT NULL,
  original_name varchar(200) NOT NULL,
  category varchar(16) NOT NULL CHECK (category IN ('resume', 'other')),
  content_type varchar(100) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 varchar(64) NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  generation text,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleting')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ready' OR generation IS NOT NULL)
);
CREATE UNIQUE INDEX profile_documents_upload_uq ON profile_documents(user_id, upload_key);
CREATE UNIQUE INDEX profile_documents_object_uq ON profile_documents(bucket, object_key);
CREATE INDEX profile_documents_owner_created_idx ON profile_documents(user_id, created_at);
CREATE INDEX profile_documents_cleanup_idx ON profile_documents(status, updated_at);
