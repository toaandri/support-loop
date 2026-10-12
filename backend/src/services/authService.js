import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { httpError } from "./supportStore.js";

const scrypt = promisify(scryptCallback);
const publicUser = ({ id, email, name, role, customer_id }) => ({
  id,
  email,
  name,
  role,
  customerId: customer_id,
});
const digest = (token) => createHash("sha256").update(token).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, hash] = encoded.split(":");
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createAuthService(databaseUrl) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  let dummyHash;
  return {
    async bootstrap({ email, password, name = "Administrateur" } = {}) {
      dummyHash = await hashPassword(randomBytes(32).toString("hex"));
      if (!email || !password) return;
      if (password.length < 12)
        throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
      // An existing administrator is never silently overwritten on restart.
      await pool.query(
        `INSERT INTO app_users (id,email,name,password_hash,role)
        VALUES ($1,$2,$3,$4,'admin') ON CONFLICT (email) DO NOTHING`,
        [
          randomUUID(),
          email.trim().toLowerCase(),
          name,
          await hashPassword(password),
        ],
      );
    },
    async register({ name, email, password }) {
      const client = await pool.connect();
      const id = randomUUID();
      const customerId = `customer-${id}`;
      const hash = await hashPassword(password);
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO customers (id,name,email) VALUES ($1,$2,$3)",
          [customerId, name, email],
        );
        const result = await client.query(
          `INSERT INTO app_users (id,email,name,password_hash,role,customer_id)
          VALUES ($1,$2,$3,$4,'customer',$5) RETURNING *`,
          [id, email, name, hash, customerId],
        );
        await client.query("COMMIT");
        return publicUser(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505")
          throw httpError(409, "This email address is already in use.");
        throw error;
      } finally {
        client.release();
      }
    },
    async login({ email, password }) {
      const user = (
        await pool.query("SELECT * FROM app_users WHERE email=$1", [email])
      ).rows[0];
      const valid = await verifyPassword(
        password,
        user?.password_hash || dummyHash,
      );
      if (!user || !valid)
        throw httpError(401, "Email ou mot de passe incorrect.");
      return publicUser(user);
    },
    async createSession(userId) {
      const token = randomBytes(32).toString("base64url");
      await pool.query("DELETE FROM app_sessions WHERE expires_at < now()");
      await pool.query(
        `INSERT INTO app_sessions (token_hash,user_id,expires_at)
        VALUES ($1,$2,now()+interval '7 days')`,
        [digest(token), userId],
      );
      return token;
    },
    async userForSession(token) {
      if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
      const row = (
        await pool.query(
          `SELECT u.* FROM app_sessions s JOIN app_users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now()`,
          [digest(token)],
        )
      ).rows[0];
      return row ? publicUser(row) : null;
    },
    async logout(token) {
      if (token)
        await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [
          digest(token),
        ]);
    },
    async close() {
      await pool.end();
    },
  };
}
