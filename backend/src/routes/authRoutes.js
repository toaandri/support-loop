import { Router } from "express";
import { httpError } from "../services/supportStore.js";
import { rateLimit } from "../middleware/rateLimit.js";

const wrap = (work) => (req, res, next) =>
  Promise.resolve(work(req, res)).catch(next);
export function sessionToken(req) {
  return req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("supportloop_session="))
    ?.slice(20);
}
export function createAuthRouter(auth, { secure = false } = {}) {
  const router = Router();
  const cookie = (res, token, maxAge) =>
    res.cookie("supportloop_session", token, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge,
    });
  router.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("sec-fetch-site") === "cross-site"
    )
      return res.status(403).json({ error: "This request is not authorised." });
    next();
  });
  router.use((req, res, next) =>
    auth
      .userForSession(sessionToken(req))
      .then((user) => {
        req.user = user;
        next();
      })
      .catch(next),
  );
  const validate = (body, registration = false) => {
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body?.password;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length > 128 ||
      password.length < (registration ? 12 : 1) ||
      (registration && (!name || name.length > 100))
    )
      throw httpError(
        400,
        registration
          ? "Enter your name, a valid email address and a password of 12–128 characters."
          : "Email and password are required.",
      );
    return { email, password, name };
  };
  router.get("/auth/me", (req, res) => res.json({ user: req.user }));
  const loginLimit = rateLimit({ windowMs: 60_000, max: 10 });
  router.post(
    "/auth/register",
    loginLimit,
    wrap(async (req, res) => {
      const user = await auth.register(validate(req.body, true));
      const token = await auth.createSession(user.id);
      if (sessionToken(req)) await auth.logout(sessionToken(req));
      cookie(res, token, 7 * 24 * 60 * 60 * 1000);
      res.status(201).json({ user });
    }),
  );
  router.post(
    "/auth/login",
    loginLimit,
    wrap(async (req, res) => {
      const user = await auth.login(validate(req.body));
      const token = await auth.createSession(user.id);
      if (sessionToken(req)) await auth.logout(sessionToken(req));
      cookie(res, token, 7 * 24 * 60 * 60 * 1000);
      res.json({ user });
    }),
  );
  router.post(
    "/auth/logout",
    wrap(async (req, res) => {
      await auth.logout(sessionToken(req));
      cookie(res, "", 0);
      res.json({ ok: true });
    }),
  );
  return router;
}
