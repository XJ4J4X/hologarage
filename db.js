// Couche base de données : PostgreSQL en production (DATABASE_URL, fourni par Render),
// SQLite intégré à Node (node:sqlite) en local pour développer sans rien installer.

const path = require("path");
const fs = require("fs");

const SCHEMA = (pg) => [
  `CREATE TABLE IF NOT EXISTS users (
     id ${pg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
     pseudo TEXT NOT NULL,
     pseudo_key TEXT NOT NULL UNIQUE,
     pass TEXT NOT NULL,
     packs INTEGER NOT NULL,
     pack_clock BIGINT NOT NULL,
     opened INTEGER NOT NULL DEFAULT 0,
     created_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL,
     expires BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS collection (
     user_id INTEGER NOT NULL,
     car_id TEXT NOT NULL,
     count INTEGER NOT NULL,
     first_at BIGINT NOT NULL,
     PRIMARY KEY (user_id, car_id)
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
];

async function connect() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: local || process.env.PGSSL === "off" ? false : { rejectUnauthorized: false },
      max: 5,
    });
    const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
    for (const s of SCHEMA(true)) await q(s);
    console.log("[db] PostgreSQL connecté");
    return makeApi(q, async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await fn(async (sql, p = []) => (await client.query(sql, p)).rows);
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });
  }

  const { DatabaseSync } = require("node:sqlite");
  const file = process.env.SQLITE_FILE || path.join(__dirname, "data", "local.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  const q = async (sql, params = []) => {
    const stmt = db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
    if (/^\s*SELECT|RETURNING/i.test(sql)) return stmt.all(...params);
    stmt.run(...params);
    return [];
  };
  for (const s of SCHEMA(false)) db.exec(s);
  console.log("[db] SQLite local :", file);
  return makeApi(q, async (fn) => {
    db.exec("BEGIN");
    try {
      const r = await fn(q);
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}

function makeApi(q, tx) {
  const num = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^(packs|pack_clock|id|opened|created_at|user_id|expires|count|first_at)$/.test(k) ? Number(v) : v]));
  return {
    async createUser(pseudo, pass, packs, now) {
      const rows = await q(
        `INSERT INTO users (pseudo, pseudo_key, pass, packs, pack_clock, created_at) VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (pseudo_key) DO NOTHING RETURNING *`,
        [pseudo, pseudo.toLowerCase(), pass, packs, now]
      );
      return num(rows[0]) || null;
    },
    async userByPseudo(pseudo) {
      return num((await q(`SELECT * FROM users WHERE pseudo_key = $1`, [pseudo.toLowerCase()]))[0]) || null;
    },
    async userById(id) {
      return num((await q(`SELECT * FROM users WHERE id = $1`, [id]))[0]) || null;
    },
    async createSession(token, userId, expires) {
      await q(`INSERT INTO sessions (token, user_id, expires) VALUES ($1,$2,$3)`, [token, userId, expires]);
    },
    async session(token, now) {
      const s = num((await q(`SELECT * FROM sessions WHERE token = $1`, [token]))[0]);
      if (!s) return null;
      if (s.expires < now) {
        await q(`DELETE FROM sessions WHERE token = $1`, [token]);
        return null;
      }
      return s;
    },
    async deleteSession(token) {
      await q(`DELETE FROM sessions WHERE token = $1`, [token]);
    },
    async purgeSessions(now) {
      await q(`DELETE FROM sessions WHERE expires < $1`, [now]);
    },
    async setPacks(userId, packs, clock) {
      await q(`UPDATE users SET packs = $2, pack_clock = $3 WHERE id = $1`, [userId, packs, clock]);
    },
    async collection(userId) {
      return (await q(`SELECT car_id, count, first_at FROM collection WHERE user_id = $1`, [userId])).map(num);
    },
    // Ouvre un booster de façon atomique : décrémente le stock (si toujours égal à `expected`) et range les cartes.
    async openPack(userId, expected, clock, cars, now) {
      return tx(async (tq) => {
        const upd = await tq(
          `UPDATE users SET packs = packs - 1, pack_clock = $3, opened = opened + 1 WHERE id = $1 AND packs = $2 AND packs > 0 RETURNING packs`,
          [userId, expected, clock]
        );
        if (!upd.length) return null;
        for (const carId of cars) {
          await tq(
            `INSERT INTO collection (user_id, car_id, count, first_at) VALUES ($1,$2,1,$3)
             ON CONFLICT (user_id, car_id) DO UPDATE SET count = collection.count + 1`,
            [userId, carId, now]
          );
        }
        return Number(upd[0].packs);
      });
    },
  };
}

module.exports = { connect };
