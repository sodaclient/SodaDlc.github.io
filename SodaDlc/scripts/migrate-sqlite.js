"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { initDb, all, get, run, close } = require("../db");

const ROOT = path.join(__dirname, "..");
const SOURCE = process.env.SQLITE_PATH || path.join(ROOT, "data", "sodadlc.db");
const TABLES = [
  "users",
  "sessions",
  "license_keys",
  "news",
  "logs",
  "settings",
  "launcher_versions",
  "launcher_logs",
  "clicker_progress",
];
const SERIAL_TABLES = ["users", "license_keys", "news", "logs", "launcher_versions", "launcher_logs"];

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`SQLite база не найдена: ${SOURCE}`);
  }
  const source = new DatabaseSync(SOURCE, { readOnly: true });
  const info = await initDb();
  console.log(`Источник: ${SOURCE}`);
  console.log(`Назначение: ${info.mode} (${info.path})`);

  const existing = (await get("SELECT COUNT(*)::integer AS c FROM users")).c;
  if (existing > 0 && process.env.ALLOW_MERGE !== "1") {
    throw new Error(
      `В целевой базе уже есть ${existing} пользователей. Останови сервер и используй пустую БД или ALLOW_MERGE=1.`
    );
  }

  const sourceTables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
  );

  for (const table of TABLES) {
    if (!sourceTables.has(table)) {
      console.log(`- ${table}: пропущено (нет в SQLite)`);
      continue;
    }
    const cols = source.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    const rows = source.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${table}`).all();
    let inserted = 0;
    for (const row of rows) {
      const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
      const result = await run(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders(cols.length)}) ON CONFLICT DO NOTHING`,
        ...values
      );
      inserted += result.changes || 0;
    }
    console.log(`- ${table}: ${inserted}/${rows.length}`);
  }

  for (const table of SERIAL_TABLES) {
    await run(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
    );
  }

  source.close();
  await close();
  console.log("Готово: все данные перенесены.");
}

main().catch((err) => {
  console.error("[migrate]", err.message);
  process.exit(1);
});
