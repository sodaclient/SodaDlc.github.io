"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { initDb, all, get, run } = require("./db");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_NAMES = ["lorezzzz", "zirassov"];
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "soda12345";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const PLANS = ["free", "pro", "premium"];
const CLICKER_KEY_COST = 1e12;

fs.mkdirSync(DATA_DIR, { recursive: true });

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

async function log(user, action, details, ip) {
  (await run("INSERT INTO logs (user_id, username, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)", user ? user.id : null, user ? user.username : null, action, details || "", ip || "", now()));
}

// ---------- seed ----------
async function seed() {
  for (const name of ADMIN_NAMES) {
    const exists = await get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", name);
    if (!exists) {
      const { hash, salt } = hashPassword(DEFAULT_ADMIN_PASSWORD);
      await run(
        `INSERT INTO users (username, email, password_hash, password_salt, role, plan, plan_expires_at, created_at)
         VALUES (?, ?, ?, ?, 'admin', 'premium', ?, ?)`,
        name,
        `${name}@sodadlc.local`,
        hash,
        salt,
        now() + 3650 * 864e5,
        now()
      );
      console.log(`[seed] admin "${name}" created (password: ${DEFAULT_ADMIN_PASSWORD})`);
    }
  }

  const newsCount = (await get("SELECT COUNT(*)::integer AS c FROM news")).c;
  if (newsCount === 0) {
    const insertNews = async (title, body, author, pinned, createdAt) =>
      run("INSERT INTO news (title, body, author, pinned, created_at) VALUES (?, ?, ?, ?, ?)", title, body, author, pinned, createdAt);
    await insertNews(
      "Добро пожаловать в SodaDlc",
      "Мы перезапустили проект под новым именем. Теперь сайт полностью рабочий: регистрация, личный кабинет, ключи и админ-панель. Добро пожаловать!",
      "SodaDlc",
      1,
      now()
    );
    await insertNews(
      "Как активировать ключ",
      "Зарегистрируйтесь, войдите в личный кабинет и введите ключ в поле «Активация ключа». Ключ сразу продлит вашу подписку.",
      "SodaDlc",
      0,
      now() - 864e5
    );
  }

  const keyCount = (await get("SELECT COUNT(*)::integer AS c FROM license_keys")).c;
  if (keyCount === 0) {
    await run(
      "INSERT INTO license_keys (key, plan, duration_days, created_by, created_at) VALUES (?, 'pro', 30, 1, ?)",
      "SODA-DEMO-2026",
      now()
    );
    console.log("[seed] demo key created: SODA-DEMO-2026 (pro, 30 days)");
  }

  const ensureVersion = async (brand, version, changelog) => {
    const exists = await get("SELECT id FROM launcher_versions WHERE brand = ?", brand);
    if (!exists) {
      await run(
        "INSERT INTO launcher_versions (brand, version, changelog, download_url_win, download_url_linux, download_url_mac, force_update, created_at) VALUES (?, ?, ?, '', '', '', 0, ?)",
        brand,
        version,
        changelog,
        now()
      );
    }
  };
  const lvCount = (await get("SELECT COUNT(*)::integer AS c FROM launcher_versions")).c;
  if (lvCount === 0) {
    await ensureVersion("SodaDlc Legit", "1.0.0", "Первый релиз SodaDlc Legit\n- Чистый визуал без риска\n- Полная интеграция с сайтом\n- Система ключей и подписок");
    await ensureVersion("SodaDlc Rage", "1.0.0", "Первый релиз SodaDlc Rage\n- Агрессивный визуал\n- Максимальная выразительность\n- Полная интеграция с сайтом");
    await ensureVersion("SodaVisuals", "2.1.0", "Обновление визуалов\n- Новые шейдеры\n- Исправлены баги");
    console.log("[seed] launcher versions created");
  } else {
    await ensureVersion("SodaDlc Legit", "1.0.0", "Чистый визуал без риска\n- Полная интеграция с сайтом\n- Система ключей и подписок");
    await ensureVersion("SodaDlc Rage", "1.0.0", "Агрессивный визуал\n- Максимальная выразительность\n- Полная интеграция с сайтом");
    await ensureVersion("SodaVisuals", "2.1.0", "Классические визуалы\n- Новые шейдеры\n- Стабильная работа");
  }
}

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
  "/clicker": "clicker.html",
  "/terms": "terms.html",
  "/privacy": "privacy.html",
  "/zapret": "zapret.html",
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

async function getSessionUser(req) {
  const token = authToken(req);
  if (!token) return null;
  const row = (await get(`SELECT s.expires_at, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`, hashToken(token)));
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
    avatar: u.avatar ? `/api/avatar/${u.id}?v=${u.avatar_updated_at || 0}` : null,
  };
}

const AVATAR_MAX_BYTES = 64 * 1024;
function parseAvatar(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  let buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
  if (buffer.length < 32 || buffer.length > AVATAR_MAX_BYTES) return null;
  const png = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!(match[1] === "png" && png) && !(match[1] === "jpeg" && jpeg) && !(match[1] === "webp" && webp)) return null;
  return { value, mime: `image/${match[1]}`, buffer };
}

async function requireUser(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    json(res, 401, { error: "Требуется авторизация" });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
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
setInterval(async () => {
  const t = now();
  for (const [key, item] of attempts) if (item.reset < t) attempts.delete(key);
  try {
    await run("DELETE FROM sessions WHERE expires_at < ?", t);
  } catch (err) {
    console.error("[cleanup]", err.message);
  }
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

async function applyPlan(userId, plan, days) {
  const user = (await get("SELECT * FROM users WHERE id = ?", userId));
  if (!user) return null;
  let base = now();
  if (plan !== "free" && user.plan === plan && user.plan_expires_at && user.plan_expires_at > base) {
    base = user.plan_expires_at;
  }
  const expires = plan === "free" ? null : base + days * 864e5;
  (await run("UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?", plan, expires, userId));
  return { plan, planExpiresAt: expires };
}

// ---------- clicker ----------
const CLICKER_UPGRADES = ["power", "energy", "regen", "auto", "crit"];
const CLICKER_MAX_LEVEL = 10000;
const CLICKER_SKILLS = {
  might: 12, crit: 15, rage: 15,
  battery: 12, flow: 15, offline: 12,
  auto: 15, fortune: 12, rebirth: 15, legacy: 10,
};
const CLICKER_SKILL_KEYS = Object.keys(CLICKER_SKILLS);
const CLICKER_SKILL_REQS = {
  rage: { id: "might", level: 5 },
  offline: { id: "battery", level: 5 },
  fortune: { id: "auto", level: 5 },
  rebirth: { id: "fortune", level: 5 },
  legacy: { id: "rebirth", level: 5 },
};
const CLICKER_CLICK_TREE = {
  impact: 10, precision: 10, execution: 10,
  reservoir: 10, circulation: 10, thrift: 10,
  metronome: 10, resonance: 10, nightshift: 10,
  multiclick: 10,
};
const CLICKER_CLICK_TREE_KEYS = Object.keys(CLICKER_CLICK_TREE);
const CLICKER_CLICK_TREE_REQS = {
  precision: { id: "impact", level: 3 },
  execution: { id: "precision", level: 3 },
  circulation: { id: "reservoir", level: 3 },
  thrift: { id: "circulation", level: 3 },
  resonance: { id: "metronome", level: 3 },
  nightshift: { id: "resonance", level: 3 },
};

function clampNumber(value, min, max, fallback = min) {
  const x = Number(value);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function clickerUpgrades(raw) {
  let parsed = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {}
  const out = {};
  for (const key of CLICKER_UPGRADES) {
    out[key] = Math.floor(clampNumber(parsed[key], 0, CLICKER_MAX_LEVEL, 0));
  }
  return out;
}

function clickerMaxEnergy(upgrades, skills = {}, clickTree = {}) {
  return 100 + clickerUpgrades(upgrades).energy * 20 + (Number(skills.battery) || 0) * 20 +
    (Number(clickTree.reservoir) || 0) * 15;
}

function clickerSkills(raw) {
  let parsed = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {}
  const out = {};
  for (const key of CLICKER_SKILL_KEYS) {
    out[key] = Math.floor(clampNumber(parsed[key], 0, CLICKER_SKILLS[key], 0));
  }
  return out;
}

function clickerSkillPoints(rebirths) {
  const n = Math.max(0, Math.floor(rebirths));
  return n + Math.floor(n / 5) + Math.floor(n / 10);
}

function clickerSkillSpent(skills) {
  return CLICKER_SKILL_KEYS.reduce((sum, key) => sum + (skills[key] || 0), 0);
}

function clickerClickTree(raw) {
  let parsed = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {}
  const out = {};
  for (const key of CLICKER_CLICK_TREE_KEYS) {
    out[key] = Math.floor(clampNumber(parsed[key], 0, CLICKER_CLICK_TREE[key], 0));
  }
  return out;
}

function serializeClicker(row) {
  const r = row || {};
  const upgrades = clickerUpgrades(r.upgrades);
  const skills = clickerSkills(r.skills);
  const clickTree = clickerClickTree(r.click_tree);
  return {
    total: clampNumber(r.total, 0, Number.MAX_SAFE_INTEGER, 0),
    claimed: Math.floor(clampNumber(r.claimed, 0, Number.MAX_SAFE_INTEGER, 0)),
    balance: clampNumber(r.balance, 0, Number.MAX_SAFE_INTEGER, 0),
    run: clampNumber(r.run, 0, Number.MAX_SAFE_INTEGER, 0),
    rebirths: Math.floor(clampNumber(r.rebirths, 0, 1000000, 0)),
    energy: clampNumber(r.energy, 0, clickerMaxEnergy(upgrades, skills, clickTree), 100),
    playtime: clampNumber(r.playtime, 0, Number.MAX_SAFE_INTEGER, 0),
    upgrades,
    skills,
    clickTree,
    rev: Math.floor(clampNumber(r.rev, 0, Number.MAX_SAFE_INTEGER, 0)),
    updatedAt: Number(r.updated_at) || 0,
    cost: CLICKER_KEY_COST,
  };
}

async function readClicker(userId) {
  return (await get("SELECT * FROM clicker_progress WHERE user_id = ?", userId)) || null;
}

async function writeClicker(userId, state) {
  (await run(`INSERT INTO clicker_progress (user_id, total, claimed, balance, run, rebirths, energy, playtime, upgrades, skills, click_tree, rev, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       total = excluded.total, claimed = excluded.claimed, balance = excluded.balance,
       run = excluded.run, rebirths = excluded.rebirths, energy = excluded.energy,
       playtime = excluded.playtime, upgrades = excluded.upgrades, skills = excluded.skills,
       click_tree = excluded.click_tree, rev = excluded.rev, updated_at = excluded.updated_at`, userId,
    Math.floor(state.total),
    Math.floor(state.claimed),
    state.balance,
    state.run,
    state.rebirths,
    state.energy,
    state.playtime,
    JSON.stringify(state.upgrades),
    JSON.stringify(state.skills || {}),
    JSON.stringify(state.clickTree || {}),
    state.rev,
    now()));
  return readClicker(userId);
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
    if ((await get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", username))) {
      return json(res, 409, { error: "Этот ник уже занят" });
    }
    if (email && (await get("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", email))) {
      return json(res, 409, { error: "Этот email уже используется" });
    }
    const { hash, salt } = hashPassword(password);
    const isAdmin = ADMIN_NAMES.some((n) => n.toLowerCase() === username.toLowerCase());
    const result = (await run(`INSERT INTO users (username, email, password_hash, password_salt, role, plan, created_at)
         VALUES (?, ?, ?, ?, ?, 'free', ?)`, username, email || null, hash, salt, isAdmin ? "admin" : "user", now()));
    const user = (await get("SELECT * FROM users WHERE id = ?", result.lastInsertRowid));
    const token = crypto.randomBytes(32).toString("hex");
    (await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)", hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || ""));
    await log(user, "register", `Регистрация (${isAdmin ? "admin" : "user"})`, clientIp(req));
    setSessionCookie(req, res, token);
    return json(res, 201, { user: publicUser(user) });
  }

  if (route === "/api/login" && method === "POST") {
    if (!rateLimit(req, res, "login", 15)) return;
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = (await get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", username));
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return json(res, 401, { error: "Неверный ник или пароль" });
    }
    if (user.banned) return json(res, 403, { error: "Аккаунт заблокирован" });
    const token = crypto.randomBytes(32).toString("hex");
    (await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)", hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || ""));
    (await run("UPDATE users SET last_login_at = ? WHERE id = ?", now(), user.id));
    await log(user, "login", "", clientIp(req));
    setSessionCookie(req, res, token);
    return json(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/logout" && method === "POST") {
    const token = parseCookies(req).soda_session;
    if (token) (await run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token)));
    clearSessionCookie(req, res);
    return json(res, 200, { ok: true });
  }

  if (route === "/api/me" && method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    return json(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/me/avatar" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, res, "avatar", 30)) return;
    const body = await readBody(req);
    if (body.avatar === null || body.avatar === "") {
      (await run("UPDATE users SET avatar = NULL, avatar_updated_at = ? WHERE id = ?", now(), user.id));
      await log(user, "avatar", "Удалён аватар", clientIp(req));
      const updated = (await get("SELECT * FROM users WHERE id = ?", user.id));
      return json(res, 200, { ok: true, user: publicUser(updated) });
    }
    const parsed = parseAvatar(body.avatar);
    if (!parsed) {
      return json(res, 400, { error: "Аватар: PNG, JPG или WEBP до 64 КБ" });
    }
    (await run("UPDATE users SET avatar = ?, avatar_updated_at = ? WHERE id = ?", parsed.value, now(), user.id));
    await log(user, "avatar", "Обновлён аватар", clientIp(req));
    const updated = (await get("SELECT * FROM users WHERE id = ?", user.id));
    return json(res, 200, { ok: true, user: publicUser(updated) });
  }

  const avatarMatch = route.match(/^\/api\/avatar\/(\d+)$/);
  if (avatarMatch && method === "GET") {
    const row = (await get("SELECT avatar FROM users WHERE id = ?", Number(avatarMatch[1])));
    const parsed = row && parseAvatar(row.avatar);
    if (!parsed) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": parsed.mime,
      "Content-Length": parsed.buffer.length,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(parsed.buffer);
    return;
  }

  if (route === "/api/me/password" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    if (!verifyPassword(current, user.password_salt, user.password_hash)) {
      return json(res, 400, { error: "Текущий пароль неверный" });
    }
    if (next.length < 6) return json(res, 400, { error: "Новый пароль короче 6 символов" });
    const { hash, salt } = hashPassword(next);
    (await run("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", hash, salt, user.id));
    await log(user, "password", "Смена пароля", clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/keys/activate" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, res, "activate", 20)) return;
    const body = await readBody(req);
    const key = String(body.key || "").trim().toUpperCase();
    const row = (await get("SELECT * FROM license_keys WHERE key = ?", key));
    if (!row) return json(res, 404, { error: "Ключ не найден" });
    if (row.used) return json(res, 409, { error: "Ключ уже активирован" });
    if (!normalizePlan(row.plan)) return json(res, 400, { error: "Повреждённый ключ" });
    (await run("UPDATE license_keys SET used = 1, activated_by = ?, activated_at = ? WHERE id = ?", user.id, now(), row.id));
    const applied = await applyPlan(user.id, row.plan, row.duration_days);
    await log(user, "key", `Активирован ключ ${key} (${row.plan}, ${row.duration_days} дн.)`, clientIp(req));
    return json(res, 200, { ok: true, subscription: applied });
  }

  if (route === "/api/clicker/leaderboard" && method === "GET") {
    const board = async (field) => {
      const rows = await all(`SELECT u.id, u.username, cp.${field} AS value,
                  CASE WHEN u.avatar IS NULL THEN 0 ELSE 1 END AS has_avatar,
                  u.avatar_updated_at
           FROM clicker_progress cp
           JOIN users u ON u.id = cp.user_id
           WHERE u.banned = 0 AND u.role != 'admin'
           ORDER BY cp.${field} DESC, cp.total DESC
           LIMIT 10`);
      return rows.map((row) => ({
        username: row.username,
        value: Number(row.value),
        avatar: row.has_avatar ? `/api/avatar/${row.id}?v=${row.avatar_updated_at || 0}` : null,
      }));
    };
    return json(res, 200, {
      rebirths: await board("rebirths"),
      clicks: await board("total"),
      hours: await board("playtime"),
    });
  }

  if (route === "/api/clicker/state" && method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    const row = await readClicker(user.id);
    return json(res, 200, row ? serializeClicker(row) : serializeClicker(null));
  }

  if (route === "/api/clicker/save" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, res, "clicker-save", 2000)) return;
    const body = await readBody(req);
    const row = await readClicker(user.id);
    const current = serializeClicker(row);
    const rev = Math.floor(Number(body.rev));
    if (!Number.isFinite(rev) || rev !== current.rev) {
      return json(res, 409, { error: "Прогресс обновлён", state: current });
    }
    const upgrades = clickerUpgrades(body.upgrades);
    const incomingSkills = body.skills === undefined ? current.skills : clickerSkills(body.skills);
    const skills = {};
    for (const key of CLICKER_SKILL_KEYS) {
      skills[key] = Math.max(current.skills[key], incomingSkills[key]);
    }
    const rebirths = Math.max(
      current.rebirths,
      Math.floor(clampNumber(body.rebirths, 0, 1000000, current.rebirths))
    );
    if (clickerSkillSpent(skills) > clickerSkillPoints(rebirths)) {
      return json(res, 400, { error: "Недостаточно очков навыков" });
    }
    for (const [key, req] of Object.entries(CLICKER_SKILL_REQS)) {
      if (skills[key] > 0 && skills[req.id] < req.level) {
        return json(res, 400, { error: "Сначала изучите предыдущий навык" });
      }
    }
    const incomingClickTree = body.clickTree === undefined
      ? current.clickTree
      : clickerClickTree(body.clickTree);
    const clickTree = {};
    for (const key of CLICKER_CLICK_TREE_KEYS) {
      clickTree[key] = Math.max(current.clickTree[key], incomingClickTree[key]);
    }
    for (const [key, req] of Object.entries(CLICKER_CLICK_TREE_REQS)) {
      if (clickTree[key] > 0 && clickTree[req.id] < req.level) {
        return json(res, 400, { error: "Сначала изучите предыдущий узел дерева кликов" });
      }
    }
    const maxEnergyValue = clickerMaxEnergy(upgrades, skills, clickTree);
    const state = {
      total: Math.max(current.total, Math.floor(clampNumber(body.total, 0, Number.MAX_SAFE_INTEGER, current.total))),
      claimed: current.claimed,
      balance: clampNumber(body.balance, 0, Number.MAX_SAFE_INTEGER, 0),
      run: clampNumber(body.run, 0, Number.MAX_SAFE_INTEGER, 0),
      rebirths,
      energy: clampNumber(body.energy, 0, maxEnergyValue, maxEnergyValue),
      playtime: Math.max(current.playtime, clampNumber(body.playtime, 0, Number.MAX_SAFE_INTEGER, current.playtime)),
      upgrades,
      skills,
      clickTree,
      rev: current.rev + 1,
    };
    const saved = await writeClicker(user.id, state);
    return json(res, 200, serializeClicker(saved));
  }

  if (route === "/api/clicker/redeem" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, res, "clicker", 6)) return;
    const body = await readBody(req);
    const reported = Math.floor(Number(body.total));
    if (!Number.isFinite(reported) || reported < 0) {
      return json(res, 400, { error: "Некорректный прогресс" });
    }
    const total = Math.min(reported, Number.MAX_SAFE_INTEGER);
    const row = await readClicker(user.id);
    const current = serializeClicker(row);
    const best = Math.max(total, current.total);
    if (best - current.claimed * CLICKER_KEY_COST < CLICKER_KEY_COST) {
      return json(res, 400, { error: "Нужно 1 000 000 000 000 кликов" });
    }
    let key;
    do {
      key = genKey();
    } while ((await get("SELECT id FROM license_keys WHERE key = ?", key)));
    (await run("INSERT INTO license_keys (key, plan, duration_days, created_by, created_at) VALUES (?, 'premium', 7, ?, ?)", key, user.id, now()));
    const saved = await writeClicker(user.id, {
      ...current,
      total: best,
      claimed: current.claimed + 1,
      rev: current.rev + 1,
    });
    await log(user, "clicker", `Ключ за 1 трлн кликов: ${key}`, clientIp(req));
    return json(res, 201, {
      key,
      plan: "premium",
      days: 7,
      claimed: current.claimed + 1,
      total: best,
      state: serializeClicker(saved),
    });
  }

  if (route === "/api/news" && method === "GET") {
    const rows = (await all("SELECT id, title, body, author, pinned, created_at FROM news ORDER BY pinned DESC, created_at DESC LIMIT 30"));
    return json(res, 200, { news: rows });
  }

  if (route === "/api/stats" && method === "GET") {
    const users = (await get("SELECT COUNT(*)::integer AS c FROM users")).c;
    const activated = (await get("SELECT COUNT(*)::integer AS c FROM license_keys WHERE used = 1")).c;
    const newsCount = (await get("SELECT COUNT(*)::integer AS c FROM news")).c;
    return json(res, 200, { users, activated, news: newsCount });
  }

  // ---------- admin ----------
  if (route === "/api/admin/stats" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const t = now();
    return json(res, 200, {
      users: (await get("SELECT COUNT(*)::integer AS c FROM users")).c,
      admins: (await get("SELECT COUNT(*)::integer AS c FROM users WHERE role = 'admin'")).c,
      banned: (await get("SELECT COUNT(*)::integer AS c FROM users WHERE banned = 1")).c,
      activeSubs: (await get("SELECT COUNT(*)::integer AS c FROM users WHERE plan != 'free' AND plan_expires_at > ?", t)).c,
      keys: (await get("SELECT COUNT(*)::integer AS c FROM license_keys")).c,
      unusedKeys: (await get("SELECT COUNT(*)::integer AS c FROM license_keys WHERE used = 0")).c,
      online: (await get("SELECT COUNT(DISTINCT user_id)::integer AS c FROM sessions WHERE expires_at > ?", t)).c,
      news: (await get("SELECT COUNT(*)::integer AS c FROM news")).c,
    });
  }

  if (route === "/api/admin/clicker" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const q = String(url.searchParams.get("q") || "").trim();
    const like = `%${q}%`;
    const rows = (await all(`SELECT u.id, u.username, u.role,
                COALESCE(cp.total, 0) AS total,
                COALESCE(cp.balance, 0) AS balance,
                COALESCE(cp.run, 0) AS run,
                COALESCE(cp.rebirths, 0) AS rebirths,
                COALESCE(cp.claimed, 0) AS claimed,
                COALESCE(cp.updated_at, 0) AS updated_at,
                CASE WHEN u.avatar IS NULL THEN 0 ELSE 1 END AS has_avatar,
                u.avatar_updated_at
         FROM users u
         LEFT JOIN clicker_progress cp ON cp.user_id = u.id
         WHERE u.username LIKE ?
         ORDER BY COALESCE(cp.total, 0) DESC, u.id ASC
         LIMIT 200`, like))
      .map(({ has_avatar, avatar_updated_at, ...row }) => ({
        ...row,
        avatar: has_avatar ? `/api/avatar/${row.id}?v=${avatar_updated_at || 0}` : null,
      }));
    return json(res, 200, { users: rows });
  }

  if (route === "/api/admin/clicker/grant" && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const userId = Math.floor(Number(body.userId));
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(userId) || !Number.isFinite(amount) || amount === 0) {
      return json(res, 400, { error: "Укажите пользователя и количество кликов" });
    }
    const target = (await get("SELECT id, username FROM users WHERE id = ?", userId));
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    const current = serializeClicker(await readClicker(target.id));
    const saved = await writeClicker(target.id, {
      ...current,
      total: Math.max(0, current.total + amount),
      balance: Math.max(0, current.balance + amount),
      rev: current.rev + 1,
    });
    await log(
      admin,
      "admin:clicker",
      `${amount > 0 ? "Начислено" : "Списано"} ${Math.abs(amount)} кликов: ${target.username}`,
      clientIp(req)
    );
    return json(res, 200, { ok: true, state: serializeClicker(saved) });
  }

  if (route === "/api/admin/clicker/reset" && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const userId = Math.floor(Number(body.userId));
    const target = (await get("SELECT id, username FROM users WHERE id = ?", userId));
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    const current = serializeClicker(await readClicker(target.id));
    const saved = await writeClicker(target.id, {
      total: 0,
      claimed: 0,
      balance: 0,
      run: 0,
      rebirths: 0,
      energy: 100,
      playtime: 0,
      upgrades: clickerUpgrades(null),
      skills: clickerSkills(null),
      clickTree: clickerClickTree(null),
      rev: current.rev + 1,
    });
    await log(admin, "admin:clicker", `Сброшен прогресс кликера: ${target.username}`, clientIp(req));
    return json(res, 200, { ok: true, state: serializeClicker(saved) });
  }

  if (route === "/api/admin/users" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const q = String(url.searchParams.get("q") || "").trim();
    const rows = q
      ? (await all("SELECT * FROM users WHERE LOWER(username) LIKE LOWER(?) ORDER BY id DESC", `%${q}%`))
      : (await all("SELECT * FROM users ORDER BY id DESC"));
    return json(res, 200, { users: rows.map(publicUser) });
  }

  let m = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m && method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    const target = (await get("SELECT * FROM users WHERE id = ?", userId));
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
      if (body.banned) (await run("DELETE FROM sessions WHERE user_id = ?", target.id));
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
    (await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, ...values));
    const updated = (await get("SELECT * FROM users WHERE id = ?", userId));
    await log(admin, "admin:user", `Изменён ${target.username}: ${JSON.stringify(body)}`, clientIp(req));
    return json(res, 200, { user: publicUser(updated) });
  }

  m = route.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (m && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    const target = (await get("SELECT * FROM users WHERE id = ?", userId));
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    const body = await readBody(req);
    const password = String(body.password || "");
    if (password.length < 6) return json(res, 400, { error: "Пароль короче 6 символов" });
    const { hash, salt } = hashPassword(password);
    (await run("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", hash, salt, userId));
    (await run("DELETE FROM sessions WHERE user_id = ?", userId));
    await log(admin, "admin:password", `Сброшен пароль ${target.username}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  m = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(m[1]);
    if (userId === admin.id) return json(res, 400, { error: "Нельзя удалить самого себя" });
    const target = (await get("SELECT * FROM users WHERE id = ?", userId));
    if (!target) return json(res, 404, { error: "Пользователь не найден" });
    (await run("DELETE FROM users WHERE id = ?", userId));
    await log(admin, "admin:user", `Удалён ${target.username}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/keys" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const rows = (await all(`SELECT k.*, u.username AS activated_username FROM license_keys k
         LEFT JOIN users u ON u.id = k.activated_by
         ORDER BY k.id DESC LIMIT 300`));
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
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const plan = normalizePlan(body.plan);
    const days = Math.max(1, Math.min(3650, Number(body.days) || 30));
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    if (!plan || plan === "free") return json(res, 400, { error: "Выберите тариф pro или premium" });
    const created = [];
    for (let i = 0; i < count; i++) {
      let key;
      do {
        key = genKey();
      } while (await get("SELECT id FROM license_keys WHERE key = ?", key));
      await run(
        "INSERT INTO license_keys (key, plan, duration_days, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        key,
        plan,
        days,
        admin.id,
        now()
      );
      created.push(key);
    }
    await log(admin, "admin:keys", `Создано ключей: ${count} (${plan}, ${days} дн.)`, clientIp(req));
    return json(res, 201, { keys: created });
  }

  m = route.match(/^\/api\/admin\/keys\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const key = (await get("SELECT * FROM license_keys WHERE id = ?", id));
    if (!key) return json(res, 404, { error: "Ключ не найден" });
    (await run("DELETE FROM license_keys WHERE id = ?", id));
    await log(admin, "admin:keys", `Удалён ключ ${key.key}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/news" && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    if (title.length < 3 || title.length > 120) return json(res, 400, { error: "Заголовок: 3–120 символов" });
    if (text.length < 3 || text.length > 5000) return json(res, 400, { error: "Текст: 3–5000 символов" });
    const pinned = body.pinned ? 1 : 0;
    if (pinned) (await run("UPDATE news SET pinned = 0"));
    (await run("INSERT INTO news (title, body, author, pinned, created_at) VALUES (?, ?, ?, ?, ?)", title,
      text,
      admin.username,
      pinned,
      now()));
    await log(admin, "admin:news", `Новость: ${title}`, clientIp(req));
    return json(res, 201, { ok: true });
  }

  m = route.match(/^\/api\/admin\/news\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const post = (await get("SELECT * FROM news WHERE id = ?", id));
    if (!post) return json(res, 404, { error: "Новость не найдена" });
    (await run("DELETE FROM news WHERE id = ?", id));
    await log(admin, "admin:news", `Удалена новость: ${post.title}`, clientIp(req));
    return json(res, 200, { ok: true });
  }

  if (route === "/api/admin/logs" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const rows = (await all("SELECT * FROM logs ORDER BY id DESC LIMIT 100"));
    return json(res, 200, { logs: rows });
  }

  // ---------- launcher ----------
  if (route === "/api/launcher/version" && method === "GET") {
    const brand = String(url.searchParams.get("brand") || "SodaDlc");
    const current = String(url.searchParams.get("current") || "0.0.0");
    const row = (await get("SELECT * FROM launcher_versions WHERE brand = ? ORDER BY created_at DESC LIMIT 1", brand));
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
    const user = await getSessionUser(req);
    const brand = String(body.brand || "SodaDlc");
    const version = String(body.version || "unknown");
    const os = String(body.os || "unknown");
    const arch = String(body.arch || "unknown");
    const action = String(body.action || "launch");
    const details = String(body.details || "");
    (await run(`INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, user ? user.id : null,
      user ? user.username : null,
      brand,
      version,
      os,
      arch,
      action,
      details,
      clientIp(req),
      req.headers["user-agent"] || "",
      now()));
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
    const user = (await get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", username));
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      (await run(`INSERT INTO launcher_logs (username, brand, version, os, arch, action, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, 'login_failed', ?, ?, ?, ?)`, username, brand, version, os, arch, "Неверные учетные данные", clientIp(req), req.headers["user-agent"] || "", now()));
      return json(res, 401, { error: "Неверный ник или пароль" });
    }
    if (user.banned) {
      return json(res, 403, { error: "Аккаунт заблокирован" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    (await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)", hashToken(token), user.id, now(), now() + SESSION_TTL, clientIp(req), req.headers["user-agent"] || ""));
    (await run("UPDATE users SET last_login_at = ? WHERE id = ?", now(), user.id));
    await log(user, "launcher:login", `${brand} v${version} (${os}/${arch})`, clientIp(req));
    (await run(`INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'login', ?, ?, ?, ?)`, user.id, user.username, brand, version, os, arch, `Успешный вход в ${brand}`, clientIp(req), req.headers["user-agent"] || "", now()));
    setSessionCookie(req, res, token);
    return json(res, 200, {
      token,
      user: publicUser(user),
      subscription: { plan: user.plan, expiresAt: user.plan_expires_at },
    });
  }

  if (route === "/api/launcher/activate" && method === "POST") {
    const user = await getSessionUser(req);
    if (!user || user.banned) return json(res, 401, { error: "Требуется авторизация" });
    const body = await readBody(req);
    const key = String(body.key || "").trim().toUpperCase();
    const brand = String(body.brand || "SodaDlc");
    const version = String(body.version || "unknown");
    const os = String(body.os || "unknown");
    const arch = String(body.arch || "unknown");
    const row = (await get("SELECT * FROM license_keys WHERE key = ?", key));
    if (!row) return json(res, 404, { error: "Ключ не найден" });
    if (row.used) return json(res, 409, { error: "Ключ уже активирован" });
    if (!normalizePlan(row.plan)) return json(res, 400, { error: "Повреждённый ключ" });
    (await run("UPDATE license_keys SET used = 1, activated_by = ?, activated_at = ? WHERE id = ?", user.id, now(), row.id));
    const applied = await applyPlan(user.id, row.plan, row.duration_days);
    await log(user, "launcher:key", `Активирован ключ ${key} (${row.plan}, ${row.duration_days} дн.) в ${brand}`, clientIp(req));
    (await run(`INSERT INTO launcher_logs (user_id, username, brand, version, os, arch, action, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'activate_key', ?, ?, ?, ?)`, user.id, user.username, brand, version, os, arch, `Ключ ${key} (${row.plan})`, clientIp(req), req.headers["user-agent"] || "", now()));
    return json(res, 200, { ok: true, subscription: applied });
  }

  if (route === "/api/launcher/status" && method === "GET") {
    const user = await getSessionUser(req);
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
    if (!(await requireAdmin(req, res))) return;
    const brand = String(url.searchParams.get("brand") || "");
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 100);
    let rows;
    if (brand) {
      rows = (await all("SELECT * FROM launcher_logs WHERE brand = ? ORDER BY id DESC LIMIT ?", brand, limit));
    } else {
      rows = (await all("SELECT * FROM launcher_logs ORDER BY id DESC LIMIT ?", limit));
    }
    return json(res, 200, { logs: rows });
  }

  if (route === "/api/admin/launcher-versions" && method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    const rows = (await all("SELECT * FROM launcher_versions ORDER BY brand, created_at DESC"));
    return json(res, 200, { versions: rows });
  }

  if (route === "/api/admin/launcher-versions" && method === "POST") {
    const admin = await requireAdmin(req, res);
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
    (await run(`INSERT INTO launcher_versions (brand, version, changelog, download_url_win, download_url_linux, download_url_mac, force_update, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, brand, version, changelog, downloadUrlWin, downloadUrlLinux, downloadUrlMac, forceUpdate, now()));
    await log(admin, "admin:launcher", `Добавлена версия ${brand} v${version}`, clientIp(req));
    return json(res, 201, { ok: true });
  }

  m = route.match(/^\/api\/admin\/launcher-versions\/(\d+)$/);
  if (m && method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const id = Number(m[1]);
    const v = (await get("SELECT * FROM launcher_versions WHERE id = ?", id));
    if (!v) return json(res, 404, { error: "Версия не найдена" });
    (await run("DELETE FROM launcher_versions WHERE id = ?", id));
    await log(admin, "admin:launcher", `Удалена версия ${v.brand} v${v.version}`, clientIp(req));
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
    if ((url.pathname === "/clicker" || url.pathname === "/clicker.html") && !(await getSessionUser(req))) {
      res.writeHead(302, { Location: "/login?next=/clicker" });
      res.end();
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

async function start() {
  const info = await initDb();
  await seed();
  server.listen(PORT, HOST, () => {
    console.log(`SodaDlc is running: http://localhost:${PORT}`);
    console.log(`Database: ${info.mode} (${info.path})`);
  });
}

start().catch((err) => {
  console.error("[startup]", err);
  process.exit(1);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
