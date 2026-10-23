"use strict";

const path = require("node:path");
const fs = require("node:fs");

const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.warn(`[env] не удалось прочитать ${ENV_FILE}: ${err.message}`);
  }
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATABASE_URL = process.env.DATABASE_URL || "";
const PGLITE_DIR = process.env.PGLITE_DIR || path.join(DATA_DIR, "pglite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at DOUBLE PRECISION,
    banned INTEGER NOT NULL DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL,
    last_login_at DOUBLE PRECISION,
    avatar TEXT,
    avatar_updated_at DOUBLE PRECISION
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email)) WHERE email IS NOT NULL;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DOUBLE PRECISION NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

  CREATE TABLE IF NOT EXISTS license_keys (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    created_by INTEGER,
    created_at DOUBLE PRECISION NOT NULL,
    activated_by INTEGER,
    activated_at DOUBLE PRECISION,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS license_keys_used_idx ON license_keys (used);

  CREATE TABLE IF NOT EXISTS news (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at DOUBLE PRECISION NOT NULL
  );
  CREATE INDEX IF NOT EXISTS logs_created_idx ON logs (created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS launcher_versions (
    id SERIAL PRIMARY KEY,
    brand TEXT NOT NULL,
    version TEXT NOT NULL,
    changelog TEXT,
    download_url_win TEXT,
    download_url_linux TEXT,
    download_url_mac TEXT,
    force_update INTEGER NOT NULL DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS launcher_logs (
    id SERIAL PRIMARY KEY,
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
    created_at DOUBLE PRECISION NOT NULL
  );
  CREATE INDEX IF NOT EXISTS launcher_logs_created_idx ON launcher_logs (created_at DESC);

  CREATE TABLE IF NOT EXISTS clicker_progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    claimed DOUBLE PRECISION NOT NULL DEFAULT 0,
    balance DOUBLE PRECISION NOT NULL DEFAULT 0,
    run DOUBLE PRECISION NOT NULL DEFAULT 0,
    rebirths INTEGER NOT NULL DEFAULT 0,
    energy DOUBLE PRECISION NOT NULL DEFAULT 100,
    playtime DOUBLE PRECISION NOT NULL DEFAULT 0,
    upgrades TEXT NOT NULL DEFAULT '{}',
    skills TEXT NOT NULL DEFAULT '{}',
    rev DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at DOUBLE PRECISION NOT NULL
  );
  ALTER TABLE clicker_progress ADD COLUMN IF NOT EXISTS skills TEXT NOT NULL DEFAULT '{}';
  CREATE INDEX IF NOT EXISTS clicker_total_idx ON clicker_progress (total DESC);
  CREATE INDEX IF NOT EXISTS clicker_rebirths_idx ON clicker_progress (rebirths DESC);
  CREATE INDEX IF NOT EXISTS clicker_playtime_idx ON clicker_progress (playtime DESC);
`;

let pool = null;
let lite = null;
let mode = "";

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

async function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: Number(process.env.PG_POOL_SIZE || 8),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
    await pool.query("SELECT 1");
    mode = "postgres";
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    lite = new PGlite(PGLITE_DIR);
    await lite.waitReady;
    mode = "pglite";
  }
  await exec(SCHEMA);
  return { mode, path: DATABASE_URL ? "DATABASE_URL" : PGLITE_DIR };
}

async function rawQuery(sql, params) {
  if (pool) {
    const result = await pool.query(convertPlaceholders(sql), params);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  const result = await lite.query(convertPlaceholders(sql), params);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
}

async function all(sql, ...args) {
  const result = await rawQuery(sql, normalizeParams(args));
  return result.rows;
}

async function get(sql, ...args) {
  const rows = await all(sql, ...args);
  return rows[0] || null;
}

async function run(sql, ...args) {
  let text = sql;
  const table = (text.match(/^\s*INSERT\s+INTO\s+([a-z_]+)/i) || [])[1];
  const hasId = ["users", "license_keys", "news", "logs", "launcher_versions", "launcher_logs"].includes(table);
  if (hasId && !/RETURNING/i.test(text)) text += " RETURNING id";
  const result = await rawQuery(text, normalizeParams(args));
  return {
    changes: result.rowCount,
    lastInsertRowid: result.rows[0] ? result.rows[0].id : undefined,
  };
}

async function exec(sql) {
  if (pool) {
    await pool.query(sql);
  } else {
    await lite.exec(sql);
  }
}

async function close() {
  if (pool) await pool.end();
  if (lite) await lite.close();
}

module.exports = { initDb, all, get, run, exec, close, mode: () => mode };
