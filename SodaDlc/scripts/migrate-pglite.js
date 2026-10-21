"use strict";

const path = require("node:path");
const { initDb, get, run, close } = require("../db");

const ROOT = path.join(__dirname, "..");
const SOURCE = process.env.SOURCE_PGLITE_DIR || process.env.PGLITE_DIR || path.join(ROOT, "data", "pglite");
const DATABASE_URL = process.env.DATABASE_URL || "";
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

async function main() {
  if (!DATABASE_URL) throw new Error("Задайте DATABASE_URL целевой PostgreSQL");
  const { PGlite } = await import("@electric-sql/pglite");
  const source = new PGlite(SOURCE);
  await source.waitReady;

  try {
    await initDb();
    const existing = (await get("SELECT COUNT(*)::integer AS c FROM users")).c;
    if (existing > 0 && process.env.ALLOW_MERGE !== "1") {
      throw new Error(`В целевой базе уже есть ${existing} пользователей. Используй пустую БД или ALLOW_MERGE=1.`);
    }
    console.log(`Источник: ${SOURCE}`);
    console.log("Назначение: PostgreSQL (DATABASE_URL)");

    for (const table of TABLES) {
      const { rows } = await source.query(`SELECT * FROM ${table}`);
      let inserted = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
        const params = cols.map(() => "?").join(", ");
        const result = await run(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${params}) ON CONFLICT DO NOTHING`,
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
    console.log("Готово: PGlite перенесена в PostgreSQL.");
  } finally {
    await close();
    await source.close();
  }
}

main().catch((err) => {
  console.error("[migrate:pglite]", err.message);
  process.exit(1);
});
