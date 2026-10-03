CREATE TABLE user_sign_ins (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  first_sign_in_at timestamptz NOT NULL,
  last_sign_in_at timestamptz NOT NULL
);
INSERT INTO user_sign_ins (user_id, first_sign_in_at, last_sign_in_at)
SELECT user_id, min(created_at), max(created_at) FROM session GROUP BY user_id;

CREATE TABLE user_roles (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX user_roles_admin_idx ON user_roles (role, expires_at);

CREATE TABLE role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  target_user_id text NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  action varchar(16) NOT NULL CHECK (action IN ('grant', 'change', 'revoke', 'bootstrap')),
  previous_expires_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX role_audit_target_idx ON role_audit (target_user_id, created_at);
