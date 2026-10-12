import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import request from "supertest";
import { createAuthService } from "../src/services/authService.js";
import { createPostgresSupportStore } from "../src/services/supportStore.js";
import { createSupportService } from "../src/services/supportService.js";
import { createApp } from "../src/app.js";
import { createKnowledgeStore } from "../src/services/knowledgeStore.js";
const db = process.env.TEST_DATABASE_URL;
const suite = db ? describe : describe.skip;
suite("Individual accounts and role boundaries", () => {
  const suffix = randomUUID();
  const email = `auth-${suffix}@example.test`,
    adminEmail = `admin-${suffix}@example.test`,
    password = "Fixture-password-2026";
  let pool, auth, store, knowledgeStore, app, alice, bob, admin, aliceId, bobId;
  const productId = `service-${suffix}`;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: db });
    for (const name of ["support-schema.sql", "auth-schema.sql"])
      await pool.query(
        await readFile(
          new URL(`../../database/${name}`, import.meta.url),
          "utf8",
        ),
      );
    auth = createAuthService(db);
    await auth.bootstrap({ email: adminEmail, password });
    store = createPostgresSupportStore(db);
    knowledgeStore = createKnowledgeStore(db);
    await knowledgeStore.initialize(
      await readFile(
        new URL("../../database/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    app = createApp({
      authService: auth,
      supportService: createSupportService({ store, knowledgeStore }),
      access: { sessionAuth: true, demoMode: false },
    });
    alice = request.agent(app);
    bob = request.agent(app);
    admin = request.agent(app);
  });
  afterAll(async () => {
    const emails = [email, `bob-${suffix}@example.test`, adminEmail];
    await pool.query("DELETE FROM app_users WHERE email=ANY($1)", [emails]);
    await pool.query("DELETE FROM tickets WHERE conversation_id=$1", [
      `auth-${suffix}`,
    ]);
    await pool.query("DELETE FROM support_conversations WHERE id=$1", [
      `auth-${suffix}`,
    ]);
    await pool.query("DELETE FROM customers WHERE email=ANY($1)", [emails]);
    await pool.query("DELETE FROM products WHERE id=$1", [productId]);
    await auth.close();
    await store.close();
    await knowledgeStore.close();
    await pool.end();
  });
  it("registers as customer regardless of a role supplied in the body and sets an HttpOnly cookie", async () => {
    const result = await alice
      .post("/api/auth/register")
      .send({ name: "Alice", email, password, role: "admin" })
      .expect(201);
    aliceId = result.body.user.customerId;
    expect(result.body.user.role).toBe("customer");
    expect(result.body.user.password_hash).toBeUndefined();
    expect(result.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(result.headers["set-cookie"][0]).toContain("SameSite=Strict");
    const hash = (
      await pool.query("SELECT password_hash FROM app_users WHERE email=$1", [
        email,
      ])
    ).rows[0].password_hash;
    expect(hash).not.toContain(password);
    const second = await bob
      .post("/api/auth/register")
      .send({ name: "Bob", email: `bob-${suffix}@example.test`, password })
      .expect(201);
    bobId = second.body.user.customerId;
  });
  it("blocks guest and customer access to administration and permits the admin session", async () => {
    await request(app).get("/api/support/stats").expect(401);
    await alice.get("/api/support/stats").expect(403);
    await admin
      .post("/api/auth/login")
      .send({ email: adminEmail, password })
      .expect(200);
    await admin.get("/api/support/stats").expect(200);
    await request(app)
      .post("/api/auth/login")
      .send({ email, password: "incorrect" })
      .expect(401);
  });
  it("isolates customer conversations and rejects forged customer identities", async () => {
    const id = `auth-${suffix}`;
    await alice
      .post("/api/chat")
      .send({ conversationId: id, message: "Bonjour", customerId: bobId })
      .expect(200);
    expect((await store.conversation(id)).customerId).toBe(aliceId);
    const peer = await bob.get(`/api/conversations/${id}/messages`).expect(200);
    expect(peer.body.messages).toEqual([]);
    await bob
      .post("/api/chat")
      .send({ conversationId: id, message: "Bonjour" })
      .expect(404);
    const own = await alice.get("/api/conversations").expect(200);
    expect(own.body.conversations.some((item) => item.id === id)).toBe(true);
    const other = await bob.get("/api/conversations").expect(200);
    expect(other.body.conversations.some((item) => item.id === id)).toBe(false);
  });
  it("keeps catalog public, blocks cross-site mutations and invalidates logout sessions", async () => {
    await request(app).get("/api/products").expect(200);
    await alice
      .post("/api/auth/logout")
      .set("sec-fetch-site", "cross-site")
      .send({})
      .expect(403);
    await alice.post("/api/auth/logout").send({}).expect(200);
    await alice.get("/api/orders").expect(401);
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Short", email: "short@example.test", password: "tiny" })
      .expect(400);
  });
  it("publishes, updates and retracts articles, and manages an arbitrary catalog item", async () => {
    await bob
      .post("/api/support/documents")
      .send({ title: "Test", content: "Unauthorized" })
      .expect(403);
    const article = await admin
      .post("/api/support/documents")
      .send({
        title: `Accueil ${suffix}`,
        content: "Les rendez-vous sont disponibles du lundi au vendredi.",
      })
      .expect(201);
    const ref = article.body.source.slice(7);
    try {
      const visible = await request(app).get("/api/articles").expect(200);
      expect(
        visible.body.articles.some((row) => row.title === `Accueil ${suffix}`),
      ).toBe(true);
      await admin
        .put(`/api/support/documents/${ref}`)
        .send({
          title: `Accueil ${suffix}`,
          content: "Les rendez-vous sont disponibles du mardi au samedi.",
        })
        .expect(200);
      expect(
        (await request(app).get("/api/articles")).body.articles.find(
          (row) => row.title === `Accueil ${suffix}`,
        ).content,
      ).toContain("mardi");
      await admin
        .post("/api/support/products")
        .send({
          id: productId,
          name: "Formation professionnelle",
          description: "Un service personnalisé pour tous les secteurs.",
          price_cents: 4500,
          stock: 6,
        })
        .expect(200);
      await admin
        .post("/api/support/products")
        .send({
          id: productId,
          name: "Formation professionnelle",
          description: "Un service personnalisé pour tous les secteurs.",
          price_cents: 5500,
          stock: 4,
        })
        .expect(200);
      expect(
        (await request(app).get(`/api/products?q=${productId}`)).body
          .products[0],
      ).toMatchObject({ stock: 4, price_cents: 5500 });
      await admin
        .post("/api/support/products")
        .send({
          id: productId,
          name: "Invalid",
          description: "Invalid",
          price_cents: -1,
          stock: 1,
        })
        .expect(400);
      await admin
        .put("/api/support/documents/not-a-document")
        .send({ title: "No", content: "No" })
        .expect(400);
      await admin.delete(`/api/support/documents/${ref}`).expect(200);
      expect(
        (await request(app).get("/api/articles")).body.articles.some(
          (row) => row.title === `Accueil ${suffix}`,
        ),
      ).toBe(false);
    } finally {
      await knowledgeStore.deleteDocument(article.body.source);
    }
  });
});
