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
  `CREATE TABLE IF NOT EXISTS car_images (
     car_id TEXT PRIMARY KEY,
     data TEXT,
     updated_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,
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
    await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`);
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
  try { db.exec(`ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0`); } catch {} // existe déjà
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
  const num = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^(packs|pack_clock|id|opened|created_at|user_id|expires|count|first_at|points|total)$/.test(k) ? Number(v) : v]));
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
    // Recycle tous les doubles en points
    async recycle(userId, values) {
      return tx(async (tq) => {
        const rows = (await tq(`SELECT car_id, count FROM collection WHERE user_id = $1 AND count > 1`, [userId])).map(num);
        let gained = 0, cards = 0;
        for (const r of rows) { const extra = r.count - 1; cards += extra; gained += extra * (values[r.car_id] || 1); }
        if (!rows.length) {
          const u = await tq(`SELECT points FROM users WHERE id = $1`, [userId]);
          return { gained: 0, cards: 0, points: Number(u[0].points) };
        }
        await tq(`UPDATE collection SET count = 1 WHERE user_id = $1 AND count > 1`, [userId]);
        const u = await tq(`UPDATE users SET points = points + $2 WHERE id = $1 RETURNING points`, [userId, gained]);
        return { gained, cards, points: Number(u[0].points) };
      });
    },
    async buyPack(userId, cost) {
      const r = await q(`UPDATE users SET points = points - $2, packs = packs + 1 WHERE id = $1 AND points >= $2 RETURNING points, packs`, [userId, cost]);
      return r[0] ? num(r[0]) : null;
    },
    async allCollections() {
      return (await q(`SELECT u.id AS user_id, u.pseudo, c.car_id FROM users u LEFT JOIN collection c ON c.user_id = u.id`)).map(num);
    },
    async imageCache() {
      const out = {};
      for (const r of await q(`SELECT car_id, data FROM car_images`)) out[r.car_id] = r.data ? JSON.parse(r.data) : null;
      return out;
    },
    async setImage(carId, data) {
      await q(
        `INSERT INTO car_images (car_id, data, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (car_id) DO UPDATE SET data = $2, updated_at = $3`,
        [carId, data ? JSON.stringify(data) : null, Date.now()]
      );
    },
    // Migrations ponctuelles (exécutées une seule fois)
    async once(key, fn) {
      const done = await q(`SELECT key FROM meta WHERE key = $1`, [key]);
      if (done.length) return false;
      await fn(q);
      await q(`INSERT INTO meta (key, value) VALUES ($1, $2)`, [key, String(Date.now())]);
      return true;
    },
    // Ouvre un booster de façon atomique : décrémente le stock (si toujours égal à `expected`) et range les cartes.
    // Ouvre n boosters d'un coup (n = 1 pour un booster normal)
    async openPack(userId, expected, clock, cars, now, n = 1) {
      return tx(async (tq) => {
        const upd = await tq(
          `UPDATE users SET packs = packs - $4, pack_clock = $3, opened = opened + $4 WHERE id = $1 AND packs = $2 AND packs >= $4 RETURNING packs`,
          [userId, expected, clock, n]
        );
        if (!upd.length) return null;
        const counts = new Map();
        for (const carId of cars) counts.set(carId, (counts.get(carId) || 0) + 1);
        for (const [carId, k] of counts) {
          await tq(
            `INSERT INTO collection (user_id, car_id, count, first_at) VALUES ($1,$2,$4,$3)
             ON CONFLICT (user_id, car_id) DO UPDATE SET count = collection.count + $4`,
            [userId, carId, now, k]
          );
        }
        return Number(upd[0].packs);
      });
    },
  };
}

module.exports = { connect };
