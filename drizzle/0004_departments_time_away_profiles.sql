CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO departments (name) SELECT DISTINCT department FROM employees;
ALTER TABLE employees ADD CONSTRAINT employees_department_fk FOREIGN KEY (department) REFERENCES departments(name) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE employees ADD COLUMN user_id text UNIQUE REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE employees e SET user_id = u.id FROM "user" u
WHERE u.email_verified = true AND lower(e.email) = lower(u.email)
  AND (SELECT count(*) FROM employees x WHERE lower(x.email) = lower(u.email)) = 1;

CREATE TABLE time_away (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type varchar(24) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'confirmed',
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_away_dates_ck CHECK (end_date >= start_date),
  CONSTRAINT time_away_type_ck CHECK (type IN ('vacation', 'sick', 'personal', 'other')),
  CONSTRAINT time_away_status_ck CHECK (status IN ('confirmed', 'cancelled'))
);
CREATE INDEX time_away_employee_dates_idx ON time_away (employee_id, start_date, end_date);
CREATE INDEX time_away_status_dates_idx ON time_away (status, start_date, end_date);
INSERT INTO time_away (employee_id, type, start_date, end_date, note)
SELECT id, 'other', current_date, '9999-12-31', 'Imported from the previous On leave status; review the end date.'
FROM employees WHERE status = 'on_leave';
UPDATE employees SET status = 'active' WHERE status = 'on_leave';

CREATE TABLE employee_home_address (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  line1 varchar(160) NOT NULL,
  line2 varchar(160),
  city varchar(100) NOT NULL,
  region varchar(100) NOT NULL,
  postal_code varchar(30) NOT NULL,
  country varchar(100) NOT NULL,
  place_id varchar(255),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profile_photos (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  data text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
