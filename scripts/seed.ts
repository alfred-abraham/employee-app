import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });
const people = [
  ["EMP-1001", "Maya", "Chen", "maya.chen@example.com", "Senior Software Engineer", "Engineering", "Phoenix, AZ", "active", "2022-04-11", "Avery Stone"],
  ["EMP-1002", "Jon", "Bell", "jon.bell@example.com", "Product Manager", "Product", "Austin, TX", "active", "2021-09-20", "Riley Morgan"],
  ["EMP-1003", "Nia", "Carter", "nia.carter@example.com", "Product Designer", "Design", "Remote", "on_leave", "2023-01-09", "Jon Bell"],
  ["EMP-1004", "Leo", "Martinez", "leo.martinez@example.com", "People Operations Partner", "People", "Chicago, IL", "active", "2020-06-15", "Riley Morgan"],
];
for (const person of people) await sql`insert into employees (employee_number, first_name, last_name, email, job_title, department, location, status, start_date, manager) values (${person[0]}, ${person[1]}, ${person[2]}, ${person[3]}, ${person[4]}, ${person[5]}, ${person[6]}, ${person[7]}, ${person[8]}, ${person[9]}) on conflict (employee_number) do nothing`;
console.log("Seed data is ready.");
await sql.end();
