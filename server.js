// ApexPack — serveur HTTP sans framework (Node ≥ 22)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CARS, RARITIES } = require("./data/cars");
const { connect } = require("./db");
const { resolveImages, EN_TITLES } = require("./images");

const PORT = Number(process.env.PORT) || 3000;
const PACK_INTERVAL = Number(process.env.PACK_INTERVAL_MIN || 5) * 60_000; // recharge toutes les 5 min
const PACKS_PER_TICK = Number(process.env.PACKS_PER_TICK || 2); // 2 boosters par recharge
const MAX_PACKS = Number(process.env.MAX_PACKS || 20);
const START_PACKS = Number(process.env.START_PACKS || 10);
const CARDS_PER_PACK = 5;
const PACK_COST = 10; // points garage pour acheter un booster
const RECYCLE_VALUE = { 1: 1, 2: 2, 3: 5, 4: 12, 5: 30, 6: 80 }; // points par double selon la rareté
const SESSION_DAYS = 30;
const PUBLIC = path.join(__dirname, "public");

const BY_RARITY = {};
for (const c of CARS) (BY_RARITY[c.rarity] ||= []).push(c);
const CAR_IDS = new Set(CARS.map((c) => c.id));
const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));
let leaderboardCache = null;
let CATALOG_JSON, CATALOG_ETAG;
function buildCatalog(images = {}) {
  CATALOG_JSON = JSON.stringify({
    cars: CARS.map((c) => {
      const out = { ...c };
      if (images[c.id]) out.img = images[c.id];
      else if (EN_TITLES[c.id]) out.wikiEn = EN_TITLES[c.id];
      return out;
    }),
    rarities: RARITIES.filter(Boolean).map(({ id, name, weight }) => ({ id, name, weight })),
    config: { packInterval: PACK_INTERVAL, packsPerTick: PACKS_PER_TICK, maxPacks: MAX_PACKS, cardsPerPack: CARDS_PER_PACK, startPacks: START_PACKS, packCost: PACK_COST, recycleValue: RECYCLE_VALUE },
  });
  CATALOG_ETAG = '"' + crypto.createHash("sha1").update(CATALOG_JSON).digest("hex").slice(0, 16) + '"';
}
buildCatalog();

// ───── tirage ─────
function rollRarity(minRarity = 1) {
  const pool = RARITIES.filter((r) => r && r.id >= minRarity && BY_RARITY[r.id]);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let x = crypto.randomInt(0, 1_000_000) / 1_000_000 * total;
  for (const r of pool) {
    if ((x -= r.weight) < 0) return r.id;
  }
  return pool[pool.length - 1].id;
}
function drawPack() {
  const out = [];
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    const rarity = rollRarity(i === CARDS_PER_PACK - 1 ? 3 : 1); // la dernière carte est au moins Rare
    const list = BY_RARITY[rarity];
    out.push(list[crypto.randomInt(0, list.length)].id);
  }
  return out;
}

// ───── boosters gratuits qui se rechargent ─────
function refill(user, now) {
  let { packs, pack_clock: clock } = user;
  if (packs >= MAX_PACKS) return { packs, clock: now, nextIn: null };
  const gained = Math.max(0, Math.floor((now - clock) / PACK_INTERVAL));
  packs = Math.min(MAX_PACKS, packs + gained * PACKS_PER_TICK);
  clock = packs >= MAX_PACKS ? now : clock + gained * PACK_INTERVAL;
  return { packs, clock, nextIn: packs >= MAX_PACKS ? null : clock + PACK_INTERVAL - now };
}

// ───── mots de passe ─────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(pw, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}
const DUMMY_HASH = hashPassword("pas-un-vrai-mot-de-passe");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ───── limite de tentatives (connexion / inscription) ─────
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { n: 0, t: now };
  if (now - a.t > 10 * 60_000) { a.n = 0; a.t = now; }
  a.n++;
  attempts.set(ip, a);
  return a.n > 30;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.t > 10 * 60_000) attempts.delete(k);
}, 60_000).unref();

// ───── utilitaires HTTP ─────
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readJson(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) { reject(Object.assign(new Error("Requête trop volumineuse"), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error("JSON invalide"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttps(req) {
  return req.headers["x-forwarded-proto"] === "https";
}
function sessionCookie(req, token, maxAge) {
  return `hg_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;
}
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

// Version des fichiers du site : change à chaque mise à jour, ce qui force les navigateurs à recharger app.js et styles.css
const ASSET_VERSION = crypto.createHash("sha1")
  .update(["app.js", "styles.css", "pack3d.js"].map((f) => { try { return fs.readFileSync(path.join(PUBLIC, f)); } catch { return ""; } }).join("|"))
  .digest("hex").slice(0, 10);

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "Interdit" });
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(PUBLIC, "index.html");
    const ext = path.extname(file);
    fs.readFile(file, (err2, buf) => {
      if (err2) return send(res, 404, { error: "Introuvable" });
      if (ext === ".html") buf = Buffer.from(String(buf).replace(/(\/(?:app\.js|styles\.css|pack3d\.js))"/g, `$1?v=${ASSET_VERSION}"`));
      const versioned = /[?&]v=/.test(req.url);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : versioned ? "public, max-age=31536000, immutable" : "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      });
      res.end(buf);
    });
  });
}

// ───── application ─────
async function main() {
  const db = await connect();
  setInterval(() => db.purgeSessions(Date.now()).catch(() => {}), 3600_000).unref();

  // Les comptes créés avant le passage à 10 boosters de départ sont remis à niveau une fois
  if (await db.once("bonus-10-boosters", (q) => q(`UPDATE users SET packs = CASE WHEN packs < $1 THEN $1 ELSE packs END`, [START_PACKS])))
    console.log("[migration] comptes existants remis à " + START_PACKS + " boosters minimum");

  // Photos réelles : chargées depuis la base, puis complétées en arrière-plan depuis Wikipédia
  let loading = false;
  const loadImages = async () => {
    if (loading) return;
    loading = true;
    try {
      buildCatalog(await db.imageCache());
      if (!process.env.NO_IMAGE_FETCH) buildCatalog(await resolveImages(CARS, db, console.log, buildCatalog));
    } catch (e) {
      console.error("[images]", e.message);
    } finally {
      loading = false;
    }
  };
  loadImages();
  setInterval(loadImages, 3600_000).unref();


  async function currentUser(req) {
    const token = cookies(req).hg_session;
    if (!token) return null;
    const s = await db.session(sha(token), Date.now());
    return s ? db.userById(s.user_id) : null;
  }

  async function startSession(req, res, user, status = 200) {
    const token = crypto.randomBytes(32).toString("base64url");
    await db.createSession(sha(token), user.id, Date.now() + SESSION_DAYS * 86400_000);
    return send(res, status, await profile(user), { "Set-Cookie": sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  async function profile(user) {
    const now = Date.now();
    const r = refill(user, now);
    const rows = await db.collection(user.id);
    const collection = {};
    for (const row of rows) if (CAR_IDS.has(row.car_id)) collection[row.car_id] = { count: row.count, first: row.first_at };
    return { pseudo: user.pseudo, packs: r.packs, nextPackIn: r.nextIn, opened: user.opened, points: user.points || 0, collection };
  }

  function validCreds(body) {
    const pseudo = typeof body.pseudo === "string" ? body.pseudo.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    return { pseudo, password };
  }

  const routes = {
    "GET /api/catalog": async (req, res) => {
      if (req.headers["if-none-match"] === CATALOG_ETAG) { res.writeHead(304); return res.end(); }
      send(res, 200, CATALOG_JSON, { "Cache-Control": "public, max-age=300", ETag: CATALOG_ETAG });
    },

    "POST /api/register": async (req, res) => {
      if (rateLimited(clientIp(req))) return send(res, 429, { error: "Trop de tentatives. Réessaie dans quelques minutes." });
      const { pseudo, password } = validCreds(await readJson(req));
      if (!/^[A-Za-z0-9_\-]{3,20}$/.test(pseudo))
        return send(res, 400, { error: "Le pseudo doit faire 3 à 20 caractères : lettres, chiffres, - ou _." });
      if (password.length < 6 || password.length > 128)
        return send(res, 400, { error: "Le mot de passe doit contenir au moins 6 caractères." });
      const user = await db.createUser(pseudo, hashPassword(password), START_PACKS, Date.now());
      if (!user) return send(res, 409, { error: "Ce pseudo est déjà pris. Choisis-en un autre." });
      return startSession(req, res, user, 201);
    },

    "POST /api/login": async (req, res) => {
      if (rateLimited(clientIp(req))) return send(res, 429, { error: "Trop de tentatives. Réessaie dans quelques minutes." });
      const { pseudo, password } = validCreds(await readJson(req));
      const user = pseudo ? await db.userByPseudo(pseudo) : null;
      const ok = checkPassword(password, user ? user.pass : DUMMY_HASH);
      if (!user || !ok) return send(res, 401, { error: "Pseudo ou mot de passe incorrect." });
      return startSession(req, res, user);
    },

    "POST /api/logout": async (req, res) => {
      const token = cookies(req).hg_session;
      if (token) await db.deleteSession(sha(token));
      send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
    },

    // Import de photos (Wikimedia) par l'administrateur, protégé par ADMIN_TOKEN
    "POST /api/admin/images": async (req, res) => {
      const token = new URL(req.url, "http://x").searchParams.get("token") || "";
      const expected = process.env.ADMIN_TOKEN || "";
      const a = Buffer.from(sha(token)), b = Buffer.from(sha(expected));
      if (!expected || expected.length < 16 || !crypto.timingSafeEqual(a, b)) return send(res, 403, { error: "Interdit" });
      const body = await readJson(req, 300_000);
      let added = 0;
      const clean = (t, n) => String(t || "").replace(/[<>]/g, "").slice(0, n);
      for (const [id, v] of Object.entries(body || {})) {
        if (!CAR_IDS.has(id) || !v || typeof v !== "object") continue;
        const src = String(v.src || ""), page = String(v.page || "");
        if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\/[^\s"'<>]+$/.test(src) || src.length > 800) continue;
        if (!/^https:\/\/(commons\.wikimedia\.org|[a-z]{2}\.wikipedia\.org)\/wiki\/[^\s"'<>]+$/.test(page) || page.length > 800) continue;
        await db.setImage(id, { src, page, artist: clean(v.artist, 80) || "Auteur inconnu", license: clean(v.license, 40) || "Licence libre", article: clean(v.article, 120) });
        added++;
      }
      buildCatalog(await db.imageCache());
      send(res, 200, { added });
    },

    "POST /api/recycle": async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Non connecté" });
      const values = Object.fromEntries(CARS.map((c) => [c.id, RECYCLE_VALUE[c.rarity] || 1]));
      const r = await db.recycle(user.id, values);
      leaderboardCache = null;
      send(res, 200, r);
    },

    "POST /api/packs/buy": async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Non connecté" });
      const now = Date.now();
      const r = refill(user, now);
      if (r.packs !== user.packs || r.clock !== user.pack_clock) await db.setPacks(user.id, r.packs, r.clock);
      const out = await db.buyPack(user.id, PACK_COST);
      if (!out) return send(res, 400, { error: `Il te faut ${PACK_COST} points garage pour acheter un booster.` });
      const after = refill({ packs: out.packs, pack_clock: r.clock }, now);
      send(res, 200, { points: out.points, packs: after.packs, nextPackIn: after.nextIn });
    },

    "GET /api/leaderboard": async (req, res) => {
      const user = await currentUser(req);
      if (!leaderboardCache || Date.now() - leaderboardCache.t > 30_000) {
        const byUser = new Map();
        for (const row of await db.allCollections()) {
          let u = byUser.get(row.user_id);
          if (!u) byUser.set(row.user_id, (u = { pseudo: row.pseudo, cards: 0, score: 0, best: 0 }));
          const car = row.car_id && CAR_BY_ID[row.car_id];
          if (!car) continue;
          u.cards++;
          u.score += RECYCLE_VALUE[car.rarity] || 1;
          u.best = Math.max(u.best, car.rarity);
        }
        const list = [...byUser.values()].sort((a, b) => b.cards - a.cards || b.score - a.score || a.pseudo.localeCompare(b.pseudo));
        list.forEach((u, i) => (u.rank = i + 1));
        leaderboardCache = { t: Date.now(), list };
      }
      const list = leaderboardCache.list;
      const me = user ? list.find((u) => u.pseudo === user.pseudo) : null;
      send(res, 200, { players: list.length, top: list.slice(0, 50), me });
    },

    "GET /api/me": async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Non connecté" });
      send(res, 200, await profile(user));
    },

    "POST /api/packs/open": async (req, res) => {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Non connecté" });
      const now = Date.now();
      const r = refill(user, now);
      if (r.packs <= 0) return send(res, 429, { error: "Plus de booster disponible pour le moment.", nextPackIn: r.nextIn });
      // on enregistre d'abord la recharge, puis on décrémente de façon atomique
      if (r.packs !== user.packs || r.clock !== user.pack_clock) await db.setPacks(user.id, r.packs, r.clock);
      // { count: "all" } ou un nombre : ouvre plusieurs boosters d'un coup (50 maximum par requête)
      const body = await readJson(req).catch(() => ({}));
      const wanted = body.count === "all" ? r.packs : Math.floor(Number(body.count) || 1);
      const n = Math.max(1, Math.min(r.packs, wanted, 50));
      const packs = Array.from({ length: n }, drawPack);
      const cards = packs.flat();
      const left = await db.openPack(user.id, r.packs, r.clock, cards, now, n);
      if (left === null) return send(res, 409, { error: "Booster déjà ouvert dans un autre onglet. Recharge la page." });
      const after = refill({ packs: left, pack_clock: r.clock }, now);
      leaderboardCache = null;
      send(res, 200, { cards, packs: after.packs, nextPackIn: after.nextIn, opened: n });
    },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const key = `${req.method} ${url.pathname}`;
    try {
      if (routes[key]) {
        if (req.method === "POST" && key !== "POST /api/admin/images") {
          // protection CSRF : la requête doit venir du site lui-même
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: "Origine refusée" });
        }
        return await routes[key](req, res);
      }
      if (url.pathname === "/healthz") return send(res, 200, { ok: true });
      if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Route inconnue" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Méthode non autorisée" });
      serveStatic(req, res, url.pathname);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "Erreur serveur. Réessaie." });
    }
  });

  server.listen(PORT, () => console.log(`ApexPack en ligne sur http://localhost:${PORT} — ${CARS.length} cartes`));
}

main().catch((e) => {
  console.error("Démarrage impossible :", e);
  process.exit(1);
});
