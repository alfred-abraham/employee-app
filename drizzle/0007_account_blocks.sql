CREATE TABLE account_blocks (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  reason varchar(1000) NOT NULL CHECK (length(trim(reason)) > 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_block_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  target_user_id text NOT NULL,
  action varchar(16) NOT NULL CHECK (action IN ('block','unblock')),
  reason varchar(1000) NOT NULL,
  previous_expires_at timestamptz,
  expires_at timestamptz,
  previously_blocked boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_block_audit_target_idx ON account_block_audit(target_user_id, created_at);
