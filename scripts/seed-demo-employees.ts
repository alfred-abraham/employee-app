import postgres from "postgres";

// Adds 225 clearly synthetic employees, bringing the initial 25-person directory
// to ten pages at the default page size. The employee numbers make repeat runs safe.
const demoCount = 225;
const firstNames = [
  "Amina", "Mateo", "Priya", "Owen", "Camila", "Elijah", "Nia", "Lucas", "Sofia", "Henry",
  "Mei", "Jordan", "Layla", "Amara", "Rafael", "Isabel", "Noah", "Zara", "Leo", "Chloe",
  "Malik", "Elena", "Ethan", "Mina", "Harper",
];
const lastNames = [
  "Anderson", "Bennett", "Brooks", "Carter", "Chen", "Collins", "Davis", "Diaz", "Edwards",
  "Flores", "Foster", "Garcia", "Green", "Hassan", "Hayes", "Hughes", "Jackson", "Kim",
  "Lee", "Lopez", "Martinez", "Mitchell", "Morgan", "Murphy", "Nguyen", "Okafor", "Park",
  "Patel", "Perez", "Reed", "Rivera", "Robinson", "Ross", "Shah", "Silva", "Singh",
  "Stone", "Taylor", "Thomas", "Turner", "Walker", "Ward", "White", "Williams", "Young",
];
const demoNames = Array.from({ length: demoCount }, (_, index) => ({
  number: `DEMO-${String(index + 1).padStart(4, "0")}`,
  firstName: firstNames[(index * 7) % firstNames.length],
  lastName: lastNames[index % lastNames.length],
}));

async function main() {
  if (process.env.SEED_DEMO_EMPLOYEES !== "yes") {
    throw new Error("Set SEED_DEMO_EMPLOYEES=yes to add demo employees.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const socketPath = process.env.DATABASE_SOCKET_PATH;
  const sql = postgres(connectionString, { max: 1, ...(socketPath ? { host: socketPath } : {}) });
  try {
    const [{ total: departmentCount }] = await sql`select count(*)::int as total from departments where active = true`;
    if (departmentCount === 0) throw new Error("An active department is required before seeding demo employees.");

    const inserted = await sql`
      with active_departments as (
        select name, row_number() over (order by name) - 1 as position,
          count(*) over () as total
        from departments where active = true
      )
      insert into employees (
        employee_number, first_name, last_name, email, company, job_title,
        department, location, status, start_date, manager
      )
      select
        'DEMO-' || lpad(person.number::text, 4, '0'),
        'Demo',
        'Employee ' || lpad(person.number::text, 4, '0'),
        'demo.employee.' || lpad(person.number::text, 4, '0') || '@example.invalid',
        'PeopleCore Demo',
        case person.number % 4 when 0 then 'Specialist' when 1 then 'Analyst'
          when 2 then 'Coordinator' else 'Associate' end,
        department.name,
        case person.number % 4 when 0 then 'Remote' when 1 then 'Phoenix, AZ'
          when 2 then 'Austin, TX' else 'Denver, CO' end,
        'active',
        date '2024-01-01' + (person.number % 700),
        'Demo Manager'
      from generate_series(1, ${demoCount}) as person(number)
      join active_departments as department
        on department.position = (person.number - 1) % department.total
      on conflict (employee_number) do nothing
      returning id
    `;
    const renamed = await sql`
      with desired as (
        select * from unnest(
          ${sql.array(demoNames.map((person) => person.number))}::text[],
          ${sql.array(demoNames.map((person) => person.firstName))}::text[],
          ${sql.array(demoNames.map((person) => person.lastName))}::text[]
        ) as person(employee_number, first_name, last_name)
      )
      update employees as employee
      set first_name = desired.first_name, last_name = desired.last_name,
        updated_at = now()
      from desired
      where employee.employee_number = desired.employee_number
        and employee.company = 'PeopleCore Demo'
        and employee.email like 'demo.employee.%@example.invalid'
      returning employee.id
    `;
    const [{ total }] = await sql`select count(*)::int as total from employees`;
    console.log(`Added ${inserted.length} demo employees and named ${renamed.length}. Directory now has ${total} employees.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
