import pg from "pg";
import { hashPassword } from "../src/services/authService.js";
const { ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL } = process.env;
if (
  !ADMIN_EMAIL ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 12 ||
  ADMIN_PASSWORD.length > 128
)
  throw new Error(
    "Set ADMIN_EMAIL and a new ADMIN_PASSWORD of 12 to 128 characters in the private .env file.",
  );
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const result = await client.query(
    "UPDATE app_users SET password_hash=$1 WHERE email=$2 AND role='admin' RETURNING id",
    [await hashPassword(ADMIN_PASSWORD), ADMIN_EMAIL.trim().toLowerCase()],
  );
  if (!result.rowCount)
    throw new Error(
      "Administrator account not found. Start the application first.",
    );
  await client.query("DELETE FROM app_sessions WHERE user_id=$1", [
    result.rows[0].id,
  ]);
  await client.query("COMMIT");
  console.log(
    "Administrator password reset. Previous sessions have been invalidated.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
