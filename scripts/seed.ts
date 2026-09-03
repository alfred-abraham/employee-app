import postgres from "postgres";

const people = [
  ["EMP-1001", "Maya", "Chen", "maya.chen@example.com", "Senior Software Engineer", "Engineering", "Phoenix, AZ", "active", "2022-04-11", "Avery Stone"],
  ["EMP-1002", "Jon", "Bell", "jon.bell@example.com", "Product Manager", "Product", "Austin, TX", "active", "2021-09-20", "Riley Morgan"],
  ["EMP-1003", "Nia", "Carter", "nia.carter@example.com", "Product Designer", "Design", "Remote", "on_leave", "2023-01-09", "Jon Bell"],
  ["EMP-1004", "Leo", "Martinez", "leo.martinez@example.com", "People Operations Partner", "People", "Chicago, IL", "active", "2020-06-15", "Riley Morgan"],
  ["EMP-1005", "Avery", "Stone", "avery.stone@example.com", "Engineering Manager", "Engineering", "Seattle, WA", "active", "2019-03-18", "Riley Morgan"],
  ["EMP-1006", "Riley", "Morgan", "riley.morgan@example.com", "VP of Operations", "Operations", "Denver, CO", "active", "2018-11-05", null],
  ["EMP-1007", "Sofia", "Patel", "sofia.patel@example.com", "Data Scientist", "Analytics", "San Francisco, CA", "active", "2022-08-22", "Avery Stone"],
  ["EMP-1008", "Ethan", "Brooks", "ethan.brooks@example.com", "Account Executive", "Sales", "Dallas, TX", "active", "2023-05-15", "Camila Reed"],
  ["EMP-1009", "Camila", "Reed", "camila.reed@example.com", "Sales Director", "Sales", "New York, NY", "active", "2020-02-10", "Riley Morgan"],
  ["EMP-1010", "Noah", "Williams", "noah.williams@example.com", "Customer Success Manager", "Customer Success", "Remote", "on_leave", "2021-07-12", "Camila Reed"],
  ["EMP-1011", "Amara", "Okafor", "amara.okafor@example.com", "Financial Analyst", "Finance", "Boston, MA", "active", "2022-10-03", "Riley Morgan"],
  ["EMP-1012", "Lucas", "Nguyen", "lucas.nguyen@example.com", "Frontend Engineer", "Engineering", "Portland, OR", "active", "2023-02-27", "Avery Stone"],
  ["EMP-1013", "Isabella", "Rivera", "isabella.rivera@example.com", "Content Strategist", "Marketing", "Miami, FL", "active", "2022-01-24", "Priya Shah"],
  ["EMP-1014", "Owen", "Foster", "owen.foster@example.com", "Security Engineer", "Security", "Washington, DC", "inactive", "2020-09-14", "Avery Stone"],
  ["EMP-1015", "Priya", "Shah", "priya.shah@example.com", "Marketing Director", "Marketing", "Los Angeles, CA", "active", "2019-06-03", "Riley Morgan"],
  ["EMP-1016", "Mateo", "Silva", "mateo.silva@example.com", "UX Researcher", "Design", "Remote", "active", "2023-06-19", "Nia Carter"],
  ["EMP-1017", "Harper", "Kim", "harper.kim@example.com", "Product Analyst", "Product", "San Diego, CA", "on_leave", "2021-12-06", "Jon Bell"],
  ["EMP-1018", "Elijah", "Turner", "elijah.turner@example.com", "DevOps Engineer", "Engineering", "Atlanta, GA", "active", "2022-05-09", "Avery Stone"],
  ["EMP-1019", "Zara", "Hassan", "zara.hassan@example.com", "Recruiter", "People", "Minneapolis, MN", "active", "2023-09-11", "Leo Martinez"],
  ["EMP-1020", "Henry", "Collins", "henry.collins@example.com", "Legal Counsel", "Legal", "New York, NY", "active", "2020-04-20", "Riley Morgan"],
  ["EMP-1021", "Layla", "Bennett", "layla.bennett@example.com", "Support Specialist", "Customer Success", "Remote", "active", "2024-01-08", "Noah Williams"],
  ["EMP-1022", "Jack", "Murphy", "jack.murphy@example.com", "Senior Accountant", "Finance", "Charlotte, NC", "inactive", "2021-03-29", "Riley Morgan"],
  ["EMP-1023", "Mina", "Park", "mina.park@example.com", "QA Engineer", "Engineering", "Phoenix, AZ", "active", "2023-11-13", "Avery Stone"],
  ["EMP-1024", "Gabriel", "Lopez", "gabriel.lopez@example.com", "Operations Analyst", "Operations", "Las Vegas, NV", "active", "2022-07-25", "Riley Morgan"],
  ["EMP-1025", "Chloe", "Davis", "chloe.davis@example.com", "Brand Designer", "Design", "Nashville, TN", "on_leave", "2024-02-12", "Nia Carter"],
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const person of people) await sql`insert into employees (employee_number, first_name, last_name, email, job_title, department, location, status, start_date, manager) values (${person[0]}, ${person[1]}, ${person[2]}, ${person[3]}, ${person[4]}, ${person[5]}, ${person[6]}, ${person[7]}, ${person[8]}, ${person[9]}) on conflict (employee_number) do nothing`;
    console.log("Seed data is ready.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
