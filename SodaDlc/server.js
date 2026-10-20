"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "sodadlc.db");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_NAMES = ["lorezzzz", "zirassov"];
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "soda12345";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const PLANS = ["free", "pro", "premium"];

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at INTEGER,
    banned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS license_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    created_by INTEGER,
    created_at INTEGER NOT NULL,
    activated_by INTEGER,
    activated_at INTEGER,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS launcher_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    version TEXT NOT NULL,
    changelog TEXT,
    download_url_win TEXT,
    download_url_linux TEXT,
    download_url_mac TEXT,
    force_update INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS launcher_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    brand TEXT NOT NULL,
    version TEXT,
    os TEXT,
    arch TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  );
`);

const now = () => Date.now();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(password, salt, 64).toString("hex"),
  };
}

function verifyPassword(password, salt, hash) {
  try {
    const test = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return test.length === expected.length && crypto.timingSafeEqual(test, expected);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function genKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `SODA-${block()}-${block()}-${block()}`;
}

function log(user, action, details, ip) {
  db.prepare(
    "INSERT INTO logs (user_id, username, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(user ? user.id : null, user ? user.username : null, action, details || "", ip || "", now());
}

// ---------- seed ----------
function seed() {
  const insertUser = db.prepare(
    `INSERT INTO users (username, email, password_hash, password_salt, role, plan, plan_expires_at, created_at)
     VALUES (?, ?, ?, ?, 'admin', 'premium', ?, ?)`
  );
  for (const name of ADMIN_NAMES) {
    const exists = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(name);
    if (!exists) {
      const { hash, salt } = hashPassword(DEFAULT_ADMIN_PASSWORD);
      insertUser.run(name, `${name}@sodadlc.local`, hash, salt, now() + 3650 * 864e5, now());
      console.log(`[seed] admin "${name}" created (password: ${DEFAULT_ADMIN_PASSWORD})`);
    }
  }

  const newsCount = db.prepare("SELECT COUNT(*) AS c FROM news").get().c;
  if (newsCount === 0) {
    const ins = db.prepare(
      "INSERT INTO news (title, body, author, pinned, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    ins.run(
      "Добро пожаловать в SodaDlc",
      "Мы перезапустили проект под новым именем. Теперь сайт полностью рабочий: регистрация, личный кабинет, ключи и админ-панель. Добро пожаловать!",
      "SodaDlc",
      1,
      now()
    );
    ins.run(
      "Как активировать ключ",
      "Зарегистрируйтесь, войдите в личный кабинет и введите ключ в поле «Активация ключа». Ключ сразу продлит вашу подписку.",
      "SodaDlc",
      0,
      now() - 864e5
    );
  }

  const keyCount = db.prepare("SELECT COUNT(*) AS c FROM license_keys").get().c;
  if (keyCount === 0) {
    db.prepare(
      "INSERT INTO license_keys (key, plan, duration_days, created_by, created_at) VALUES (?, 'pro', 30, 1, ?)"
    ).run("SODA-DEMO-2026", now());
    console.log("[seed] demo key created: SODA-DEMO-2026 (pro, 30 days)");
  }

  const lvCount = db.prepare("SELECT COUNT(*) AS c FROM launcher_versions").get().c;
  const insVersion = db.prepare(
    "INSERT INTO launcher_versions (brand, version, changelog, download_url_win, download_url_linux, download_url_mac, force_update, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const ensureVersion = (brand, version, changelog) => {
    const exists = db.prepare("SELECT id FROM launcher_versions WHERE brand = ?").get(brand);
    if (!exists) insVersion.run(brand, version, changelog, "", "", "", 0, now());
  };
  if (lvCount === 0) {
    ensureVersion("SodaDlc Legit", "1.0.0", "Первый релиз SodaDlc Legit\n- Чистый визуал без риска\n- Полная интеграция с сайтом\n- Система ключей и подписок");
    ensureVersion("SodaDlc Rage", "1.0.0", "Первый релиз SodaDlc Rage\n- Агрессивный визуал\n- Максимальная выразительность\n- Полная интеграция с сайтом");
    ensureVersion("SodaVisuals", "2.1.0", "Обновление визуалов\n- Новые шейдеры\n- Исправлены баги");
    console.log("[seed] launcher versions created");
  } else {
    ensureVersion("SodaDlc Legit", "1.0.0", "Чистый визуал без риска\n- Полная интеграция с сайтом\n- Система ключей и подписок");
    ensureVersion("SodaDlc Rage", "1.0.0", "Агрессивный визуал\n- Максимальная выразительность\n- Полная интеграция с сайтом");
    ensureVersion("SodaVisuals", "2.1.0", "Классические визуалы\n- Новые шейдеры\n- Стабильная работа");
  }
}
seed();

// ---------- helpers ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const PAGES = {
  "/": "index.html",
  "/home": "index.html",
  "/login": "login.html",
  "/register": "register.html",
  "/cabinet": "cabinet.html",
  "/admin": "admin.html",
  "/news": "news.html",
  "/terms": "terms.html",
  "/privacy": "privacy.html",
  "/zapret": "zapret.html",
  "/launcher": "launcher.html",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...headers,
  });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100 * 1024) {
        reject(new Error("Слишком большой запрос"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Некорректный JSON"));
      }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

function isHttps(req) {
  return (req.headers["x-forwarded-proto"] || "").includes("https") || Boolean(req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  const parts = [
    `soda_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
  ];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", "soda_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function authToken(req) {
  let token = parseCookies(req).soda_session;
  if (!token) {
    const header = req.headers.authorization || "";
    if (header.toLowerCase().startsWith("bearer ")) token = header.slice(7).trim();
  }
  return token || "";
}

function getSessionUser(req) {
  const token = authToken(req);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.expires_at, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token));
  if (!row) return null;
  if (row.expires_at < now() || row.banned) return null;
  return row;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    plan: u.plan,
    planExpiresAt: u.plan_expires_at,
    banned: Boolean(u.banned),
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    json(res, 401, { error: "Требуется авторизация" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    json(res, 403, { error: "Недостаточно прав" });
    return null;
  }
  return user;
}

const attempts = new Map();
function rateLimit(req, res, bucket = "default", limit = 20, windowMs = 10 * 60 * 1000) {
  const key = `${bucket}:${clientIp(req)}`;
  const item = attempts.get(key);
  const t = now();
  if (!item || item.reset < t) {
    attempts.set(key, { count: 1, reset: t + windowMs });
    return true;
  }
  item.count++;
  if (item.count > limit) {
    json(res, 429, { error: "Слишком много попыток. Попробуйте позже." });
    return false;
  }
  return true;
}
setInterval(() => {
  const t = now();
  for (const [key, item] of attempts) if (item.reset < t) attempts.delete(key);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
}, 10 * 60 * 1000).unref();

function validUsername(name) {
  return typeof name === "string" && /^[a-zA-Z0-9_]{3,16}$/.test(name);
}

function normalizePlan(value) {
  return PLANS.includes(value) ? value : null;
}

function planExpiryFrom(plan, days) {
  if (plan === "free") return null;
  return now() + days * 864e5;
}

function applyPlan(userId, plan, days) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return null;
  let base = now();
  if (plan !== "free" && user.plan === plan && user.plan_expires_at && user.plan_expires_at > base) {
    base = user.plan_expires_at;
  }
  const expires = plan === "free" ? null : base + days * 864e5;
  db.prepare("UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?").run(plan, expires, userId);
  return { plan, planExpiresAt: expires };
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = url.pathname;
  const method = req.method;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (route === "/api/register" && method === "POST") {
    if (!rateLimit(req, res, "register", 10)) return;
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const email = String(body.email || "").trim();
    if (!validUsername(username)) {
      return json(res, 400, { error: "Ник: 3–16 символов, латиница, цифры и _" });
    }
    if (password.length < 6) return json(res, 400, { error: "Пароль должен быть не короче 6 символов" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: "Некорректный email" });
    }
    if (db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username)) {
      return json(res, 409, { error: "Этот ник уже занят" });
    }
    if (email && db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email)) {
      return json(res, 409, { error: "Этот email уже используется" });
    }
    const { hash, salt } = hashPassword(password);
    const isAdmin = ADMIN_NAMES.some((n) => n.toLowerCase() === username.toLowerCase());
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, password_salt, role, plan, created_at)
         VALUES (?, ?, ?, ?, ?, 'free', ?)`
      )
      .run(username, email || null, hash, salt, isAdmin ? "admin" : "user", now());
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || "");
    log(user, "register", `Регистрация (${isAdmin ? "admin" : "user"})`, clientIp(req));
    setSessionCookie(req, res, token);
    return json(res, 201, { user: publicUser(user) });
  }

  if (route === "/api/login" && method === "POST") {
    if (!rateLimit(req, res, "login", 15)) return;
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return json(res, 401, { error: "Неверный ник или пароль" });
    }
    if (user.banned) return json(res, 403, { error: "Аккаунт заблокирован" });
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || "");
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), user.id);
    log(user, "login", "", clientIp(req));
    setSessionCookie(req, res, token);
    return json(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/logout" && method === "POST") {
    const token = parseCookies(req).soda_session;
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    clearSessionCookie(req, res);
    return json(res, 200, { ok: true });
  }

  if (route === "/api/me" && method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/me/password" && method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    if (!verifyPassword(current, user.password_salt, user.password_hash)) {
      return json(res, 400, { error: "Текущий пароль неверный" });
    }
    if (next.length < 6) return json(res, 400, { error: "Новый пароль короче 6 символов" });
    const { hash, salt } = hashPassword(next);
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, user.id);
    log(user, "password", "Смена пароля", clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/keys/activate" && method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, res, "activate", 20)) return;
    const body = await readBody(req);
    const key = String(body.key || "").trim().toUpperCase();
    const row = db.prepare("SELECT * FROM license_keys WHERE key = ?").get(key);
    if (!row) return json(res, 404, { error: "Ключ не найден" });
    if (row.used) return json(res, 409, { error: "Ключ уже активирован" });
    if (!normalizePlan(row.plan)) return json(res, 400, { error: "Повреждённый ключ" });
    db.prepare(
      "UPDATE license_keys SET used = 1, activated_by = ?, activated_at = ? WHERE id = ?"
    ).run(user.id, now(), row.id);
    const applied = applyPlan(user.id, row.plan, row.duration_days);
    log(user, "key", `Активирован ключ ${key} (${row.plan}, ${row.duration_days} дн.)`, clientIp(req));
    return json(res, 200, { ok: true, subscription: applied });
  }

  if (route === "/api/news" && method === "GET") {
    const rows = db
      .prepare("SELECT id, title, body, author, pinned, created_at FROM news ORDER BY pinned DESC, created_at DESC LIMIT 30")
      .all();
    return json(res, 200, { news: rows });
  }

  if (route === "/api/stats" && method === "GET") {
    const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const activated = db.prepare("SELECT COUNT(*) AS c FROM license_keys WHERE used = 1").get().c;
    const newsCount = db.prepare("SELECT COUNT(*) AS c FROM news").get().c;
    return json(res, 200, { users, activated, news: newsCount });
  }

  // ---------- admin ----------
  if (route === "/api/admin/stats" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const t = now();
    return json(res, 200, {
      users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
      admins: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c,
      banned: db.prepare("SELECT COUNT(*) AS c FROM users WHERE banned = 1").get().c,
      activeSubs: db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE plan != 'free' AND plan_expires_at > ?")
        .get(t).c,
      keys: db.prepare("SELECT COUNT(*) AS c FROM license_keys").get().c,
      unusedKeys: db.prepare("SELECT COUNT(*) AS c FROM license_keys WHERE used = 0").get().c,
      online: db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM sessions WHERE expires_at > ?").get(t).c,
      news: db.prepare("SELECT COUNT(*) AS c FROM news").get().c,
    });
  }

  if (route === "/api/admin/users" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const q = String(url.searchParams.get("q") || "").trim();
    const rows = q
      ? db
          .prepare("SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE ORDER BY id DESC")
          .all(`%${q}%`)
      : db.prepare("SELECT * FROM users ORDER BY id DESC").all();
    return json(res, 200, { users: rows.map(publicUser) });
  }

  let m = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m && method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    const body = await readBody(req);
    const updates = [];
    const values = [];
    if (body.role !== undefined) {
      if (!["user", "admin"].includes(body.role)) return json(res, 400, { error: "Неверная роль" });
      if (target.id === admin.id && body.role !== "admin") {
        return json(res, 400, { error: "Нельзя снять права с самого себя" });
      }
      updates.push("role = ?");
      values.push(body.role);
    }
    if (body.banned !== undefined) {
      if (target.id === admin.id) return json(res, 400, { error: "Нельзя забанить самого себя" });
      updates.push("banned = ?");
      values.push(body.banned ? 1 : 0);
      if (body.banned) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    }
    if (body.plan !== undefined) {
      const plan = normalizePlan(body.plan);
      if (!plan) return json(res, 400, { error: "Неверный тариф" });
      const expires = plan === "free" ? null : now() + Number(body.days || 30) * 864e5;
      updates.push("plan = ?", "plan_expires_at = ?");
      values.push(plan, expires);
    }
    if (!updates.length) return json(res, 400, { error: "Нет изменений" });
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    log(admin, "admin:user", `Изменён ${target.username}: ${JSON.stringify(body)}`, clientIp(req));
    return json(res, 200, { user: publicUser(updated) });
  }

  m = route.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (m && method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    const body = await readBody(req);
    const password = String(body.password || "");
    if (password.length < 6) return json(res, 400, { error: "Пароль короче 6 символов" });
    const { hash, salt } = hashPassword(password);
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    log(admin, "admin:password", `Сброшен пароль ${target.username}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  m = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    if (userId === admin.id) return json(res, 400, { error: "Нельзя удалить самого себя" });
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    log(admin, "admin:user", `Удалён ${target.username}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/keys" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const rows = db
      .prepare(
        `SELECT k.*, u.username AS activated_username FROM license_keys k
         LEFT JOIN users u ON u.id = k.activated_by
         ORDER BY k.id DESC LIMIT 300`
      )
      .all();
    return json(res, 200, {
      keys: rows.map((k) => ({
        id: k.id,
        key: k.key,
        plan: k.plan,
        durationDays: k.duration_days,
        used: Boolean(k.used),
        createdAt: k.created_at,
        activatedAt: k.activated_at,
        activatedUsername: k.activated_username,
      })),
    });
  }

  if (route === "/api/admin/keys" && method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const plan = normalizePlan(body.plan);
    const days = Math.max(1, Math.min(3650, Number(body.days) || 30));
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    if (!plan || plan === "free") return json(res, 400, { error: "Выберите тариф pro или premium" });
    const created = [];
    const ins = db.prepare(
      "INSERT INTO license_keys (key, plan, duration_days, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    for (let i = 0; i < count; i++) {
      let key;
      do {
        key = genKey();
      } while (db.prepare("SELECT id FROM license_keys WHERE key = ?").get(key));
      ins.run(key, plan, days, admin.id, now());
      created.push(key);
    }
    log(admin, "admin:keys", `Создано ключей: ${count} (${plan}, ${days} дн.)`, clientIp(req));
    return json(res, 201, { keys: created });
  }

  m = route.match(/^\/api\/admin\/keys\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const key = db.prepare("SELECT * FROM license_keys WHERE id = ?").get(id);
    if (!key) return json(res, 404, { error: "Ключ не найден" });
    db.prepare("DELETE FROM license_keys WHERE id = ?").run(id);
    log(admin, "admin:keys", `Удалён ключ ${key.key}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/news" && method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    if (title.length < 3 || title.length > 120) return json(res, 400, { error: "Заголовок: 3–120 символов" });
    if (text.length < 3 || text.length > 5000) return json(res, 400, { error: "Текст: 3–5000 символов" });
    const pinned = body.pinned ? 1 : 0;
    if (pinned) db.prepare("UPDATE news SET pinned = 0").run();
    db.prepare("INSERT INTO news (title, body, author, pinned, created_at) VALUES (?, ?, ?, ?, ?)").run(
      title,
      text,
      admin.username,
      pinned,
      now()
    );
    log(admin, "admin:news", `Новость: ${title}`, clientIp(req));
    return json(res, 201, { ok: true });
  }

  m = route.match(/^\/api\/admin\/news\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const post = db.prepare("SELECT * FROM news WHERE id = ?").get(id);
    if (!post) return json(res, 404, { error: "Новость не найдена" });
    db.prepare("DELETE FROM news WHERE id = ?").run(id);
    log(admin, "admin:news", `Удалена новость: ${post.title}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/logs" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const rows = db
      .prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 100")
      .all();
    return json(res, 200, { logs: rows });
  }

  // ---------- launcher ----------
  if (route === "/api/launcher/version" && method === "GET") {
    const brand = String(url.searchParams.get("brand") || "SodaDlc");
    const current = String(url.searchParams.get("current") || "0.0.0");
    const row = db
      .prepare("SELECT * FROM launcher_versions WHERE brand = ? ORDER BY created_at DESC LIMIT 1")
      .get(brand);
    if (!row) return json(res, 404, { error: "Версия не найдена" });
    const needsUpdate = compareVersions(current, row.version) < 0;
    return json(res, 200, {
      version: row.version,
      changelog: row.changelog,
      downloadUrlWin: row.download_url_win,
      downloadUrlLinux: row.download_url_linux,
      downloadUrlMac: row.download_url_mac,
      forceUpdate: Boolean(row.force_update),
      needsUpdate,
    });
  }

  if (route === "/api/launcher/log" && method === "POST") {
    const body = await readBody(req);
    const user = getSessionUser(req);
    const brand = String(body.brand || "SodaDlc");
    const version = String(body.version || "unknown");
    const os = String(body.os || "unknown");
    const arch = String(body.arch || "unknown");
    const action = String(body.action || "launch");
    const details = String(body.details || "");
    db.prepare(
      `INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user ? user.id : null,
      user ? user.username : null,
      brand,
      version,
      os,
      arch,
      action,
      details,
      clientIp(req),
      req.headers["user-agent"] || "",
      now()
    );
    return json(res, 200, { ok: true });
  }

  if (route === "/api/launcher/auth" && method === "POST") {
    if (!rateLimit(req, res, "launcher-auth", 30)) return;
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const brand = String(body.brand || "SodaDlc");
    const version = String(body.version || "unknown");
    const os = String(body.os || "unknown");
    const arch = String(body.arch || "unknown");
    const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      db.prepare(
        `INSERT INTO launcher_logs (username, brand, version, os, arch, action, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, 'login_failed', ?, ?, ?, ?)`
      ).run(username, brand, version, os, arch, "Неверные учетные данные", clientIp(req), req.headers["user-agent"] || "", now());
      return json(res, 401, { error: "Неверный ник или пароль" });
    }
    if (user.banned) {
      return json(res, 403, { error: "Аккаунт заблокирован" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || "");
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), user.id);
    log(user, "launcher:login", `${brand} v${version} (${os}/${arch})`, clientIp(req));
    db.prepare(
      `INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'login', ?, ?, ?, ?)`
    ).run(user.id, user.username, brand, version, os, arch, `Успешный вход в ${brand}`, clientIp(req), req.headers["user-agent"] || "", now());
    setSessionCookie(req, res, token);
    return json(res, 200, {
      token,
      user: publicUser(user),
      subscription: { plan: user.plan, expiresAt: user.plan_expires_at },
    });
  }

  if (route === "/api/launcher/activate" && method === "POST") {
    const user = getSessionUser(req);
    if (!user || user.banned) return json(res, 401, { error: "Требуется авторизация" });
    const body = await readBody(req);
    const key = String(body.key || "").trim().toUpperCase();
    const brand = String(body.brand || "SodaDlc");
    const version = String(body.version || "unknown");
    const os = String(body.os || "unknown");
    const arch = String(body.arch || "unknown");
    const row = db.prepare("SELECT * FROM license_keys WHERE key = ?").get(key);
    if (!row) return json(res, 404, { error: "Ключ не найден" });
    if (row.used) return json(res, 409, { error: "Ключ уже активирован" });
    if (!normalizePlan(row.plan)) return json(res, 400, { error: "Повреждённый ключ" });
    db.prepare(
      "UPDATE license_keys SET used = 1, activated_by = ?, activated_at = ? WHERE id = ?"
    ).run(user.id, now(), row.id);
    const applied = applyPlan(user.id, row.plan, row.duration_days);
    log(user, "launcher:key", `Активирован ключ ${key} (${row.plan}, ${row.duration_days} дн.) в ${brand}`, clientIp(req));
    db.prepare(
      `INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'activate_key', ?, ?, ?, ?)`
    ).run(user.id, user.username, brand, version, os, arch, `Ключ ${key} (${row.plan})`, clientIp(req), req.headers["user-agent"] || "", now());
    return json(res, 200, { ok: true, subscription: applied });
  }

  if (route === "/api/launcher/status" && method === "GET") {
    const user = getSessionUser(req);
    if (!user) return json(res, 401, { error: "Сессия недействительна" });
    const daysLeft = user.plan_expires_at ? Math.max(0, Math.ceil((user.plan_expires_at - now()) / 864e5)) : null;
    return json(res, 200, {
      user: publicUser(user),
      subscription: { plan: user.plan, expiresAt: user.plan_expires_at, daysLeft },
      canLaunch: user.plan !== "free" && (!user.plan_expires_at || user.plan_expires_at > now()),
    });
  }

  // ---------- admin launcher ----------
  if (route === "/api/admin/launcher-logs" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const brand = String(url.searchParams.get("brand") || "");
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 100);
    let rows;
    if (brand) {
      rows = db
        .prepare("SELECT * FROM launcher_logs WHERE brand = ? ORDER BY id DESC LIMIT ?")
        .all(brand, limit);
    } else {
      rows = db
        .prepare("SELECT * FROM launcher_logs ORDER BY id DESC LIMIT ?")
        .all(limit);
    }
    return json(res, 200, { logs: rows });
  }

  if (route === "/api/admin/launcher-versions" && method === "GET") {
    if (!requireAdmin(req, res)) return;
    const rows = db
      .prepare("SELECT * FROM launcher_versions ORDER BY brand, created_at DESC")
      .all();
    return json(res, 200, { versions: rows });
  }

  if (route === "/api/admin/launcher-versions" && method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const brand = String(body.brand || "").trim();
    const version = String(body.version || "").trim();
    const changelog = String(body.changelog || "").trim();
    const downloadUrlWin = String(body.downloadUrlWin || "").trim();
    const downloadUrlLinux = String(body.downloadUrlLinux || "").trim();
    const downloadUrlMac = String(body.downloadUrlMac || "").trim();
    const forceUpdate = body.forceUpdate ? 1 : 0;
    if (!brand || !version) return json(res, 400, { error: "Brand и version обязательны" });
    if (!["SodaDlc", "SodaVisuals", "SodaLegit"].includes(brand)) return json(res, 400, { error: "Неверный бренд" });
    db.prepare(
      `INSERT INTO launcher_versions (brand, version, changelog, download_url_win, download_url_linux, download_url_mac, force_update, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(brand, version, changelog, downloadUrlWin, downloadUrlLinux, downloadUrlMac, forceUpdate, now());
    log(admin, "admin:launcher", `Добавлена версия ${brand} v${version}`, clientIp(req));
    return json(res, 201, { ok: true });
  }

  m = route.match(/^\/api\/admin\/launcher-versions\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const v = db.prepare("SELECT * FROM launcher_versions WHERE id = ?").get(id);
    if (!v) return json(res, 404, { error: "Версия не найдена" });
    db.prepare("DELETE FROM launcher_versions WHERE id = ?").run(id);
    log(admin, "admin:launcher", `Удалена версия ${v.brand} v${v.version}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  function compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  return json(res, 404, { error: "API-метод не найден" });
}

// ---------- static ----------
function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Bad Request", { "Content-Type": "text/plain; charset=utf-8" });
  }

  let relative;
  if (PAGES[pathname]) {
    relative = PAGES[pathname];
  } else if (pathname.startsWith("/fonts/") || pathname.startsWith("/images/")) {
    relative = pathname.slice(1);
  } else {
    relative = pathname.replace(/^\/+/, "");
  }

  const full = path.resolve(PUBLIC_DIR, relative);
  if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== PUBLIC_DIR) {
    return send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
  }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      if (!path.extname(pathname)) {
        return send(res, 404, "Страница не найдена", {
          "Content-Type": "text/plain; charset=utf-8",
        });
      }
      return send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    }
    const ext = path.extname(full).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    console.error("[error]", err);
    if (!res.headersSent) {
      json(res, 500, { error: "Внутренняя ошибка сервера" });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SodaDlc is running: http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
