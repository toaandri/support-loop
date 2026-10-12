// Dedicated, disposable database for the real account-based browser regression.
import pg from "../backend/node_modules/pg/lib/index.js";
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error("TEST_DATABASE_URL is required.");
const target = new URL(base);
const databaseName = process.env.PORTAL_TEST_DATABASE_NAME || "supportloop_portal_test";
if (!/^supportloop_portal_test(?:_[a-z0-9]+)?$/.test(databaseName)) throw new Error("Invalid test database name.");
target.pathname = "/" + databaseName;
const admin = new pg.Pool({ connectionString: base });
if (process.argv[2] === "prepare") {
  if (
    !(
      await admin.query(
        "SELECT 1 FROM pg_database WHERE datname=$1", [databaseName],
      )
    ).rowCount
  )
    await admin.query(`CREATE DATABASE "${databaseName}"`);
}
await admin.end();
const pool = new pg.Pool({ connectionString: target.toString() });
try {
  if (process.argv[2] === "prepare") {
    const exists = await pool.query(
      "SELECT to_regclass('public.app_users') AS name",
    );
    if (exists.rows[0].name)
      await pool.query(
        "TRUNCATE app_users,customers,products,knowledge_documents CASCADE",
      );
  } else if (process.argv[2] === "order") {
    const customer = (
      await pool.query(
        "SELECT id FROM customers WHERE email='portal-client@example.test'",
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO orders(id,customer_id,status,total_cents,tracking_number) VALUES('ORD-PORTAL-001',$1,'shipped',4500,'TRACK-PORTAL-001') ON CONFLICT DO NOTHING",
      [customer.id],
    );
  } else if (process.argv[2] === "clean") {
    await pool.query(
      "TRUNCATE app_users,customers,products,knowledge_documents CASCADE",
    );
  } else throw new Error("Unknown fixture command.");
} finally {
  await pool.end();
}
