/* ApexPack — front */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#app");
  const PER_PAGE = 9;
  const RARITY_VAR = ["", "--r1", "--r2", "--r3", "--r4", "--r5", "--r6"];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    catalog: null, byId: {}, rarities: [], config: {},
    me: null,
    authMode: "register",
    binder: {
      spread: 1,
      sort: store.get("hg_sort", "num"),
      view: store.get("hg_view", matchMedia("(max-width: 760px)").matches ? "grid" : "book"),
      q: "", rarity: 0, owned: "all",
    },
    fresh: new Set(),
    opening: false,
    pending: null, // booster ouvert côté serveur mais pas encore affiché
  };

  // ───────── API ─────────
  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
      });
    } catch {
      throw new Error("Connexion au serveur impossible. Vérifie ta connexion et réessaie.");
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && state.me && path !== "/api/me") {
      // session expirée : retour à l'écran de connexion
      state.me = null;
      state.authMode = "login";
      setTimeout(() => { render(); toast("Ta session a expiré. Reconnecte-toi pour continuer."); }, 0);
    }
    if (!res.ok) throw Object.assign(new Error(data.error || "Le serveur ne répond pas. Réessaie dans un instant."), { status: res.status, data });
    return data;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 3600);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rarityName = (r) => state.rarities.find((x) => x.id === r)?.name || "";
  const pad = (n) => String(n).padStart(3, "0");
  const fmtNum = (n) => Number(n).toLocaleString("fr-FR");
  const fmtAcc = (a) => (a == null ? "—" : a.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const FLAGS = {
    "France": "🇫🇷", "Allemagne": "🇩🇪", "Italie": "🇮🇹", "Japon": "🇯🇵", "États-Unis": "🇺🇸", "Royaume-Uni": "🇬🇧",
    "Suède": "🇸🇪", "Corée du Sud": "🇰🇷", "Roumanie": "🇷🇴", "Espagne": "🇪🇸", "Tchéquie": "🇨🇿", "Chine": "🇨🇳",
    "Russie": "🇷🇺", "Croatie": "🇭🇷",
  };
  const BODY_LABEL = {
    city: "Citadine", hatch: "Compacte", sedan: "Berline", wagon: "Break", suv: "SUV", offroad: "Tout-terrain",
    pickup: "Pick-up", van: "Van", coupe: "Coupé", sport: "Sportive", super: "Supercar", hyper: "Hypercar",
    classic: "Classique", muscle: "Muscle car", roadster: "Roadster", rally: "Course / rallye",
  };
  const ownedCount = () => Object.keys(state.me?.collection || {}).length;
  const doubles = () => Object.entries(state.me?.collection || {}).reduce((s, [, c]) => s + Math.max(0, c.count - 1), 0);
  const recyclePoints = () => Object.entries(state.me?.collection || {}).reduce((s, [id, c]) => s + Math.max(0, c.count - 1) * (state.config.recycleValue?.[state.byId[id]?.rarity] || 1), 0);

  // ───────── Silhouettes de voitures (SVG généré) ─────────
  const BODIES = {
    city:    { p: [[14,74],[14,50],[22,30],[60,22],[110,22],[140,38],[200,46],[222,52],[226,74]], w: [[26,44],[30,33],[62,27],[108,27],[133,41]], wh: [50,186,13] },
    hatch:   { p: [[12,74],[13,46],[24,30],[70,24],[120,24],[150,38],[205,46],[226,54],[228,74]], w: [[26,43],[30,33],[70,28],[118,28],[142,40]], wh: [50,190,13] },
    sedan:   { p: [[8,74],[10,52],[40,46],[70,28],[140,26],[170,42],[215,48],[232,56],[232,74]], w: [[48,46],[74,32],[138,30],[160,43]], wh: [52,194,13] },
    wagon:   { p: [[8,74],[9,44],[20,30],[140,26],[170,42],[215,48],[232,56],[232,74]], w: [[22,42],[26,33],[138,30],[160,43]], wh: [52,194,13] },
    suv:     { p: [[10,74],[10,36],[20,22],[150,20],[172,38],[218,44],[230,52],[230,74]], w: [[20,38],[24,26],[146,24],[164,38]], wh: [54,190,15] },
    offroad: { p: [[12,74],[12,26],[16,18],[140,18],[150,36],[222,38],[228,44],[228,74]], w: [[18,34],[20,23],[136,23],[143,34]], wh: [54,188,16] },
    pickup:  { p: [[8,74],[8,44],[110,44],[112,24],[160,22],[176,40],[222,44],[232,52],[232,74]], w: [[118,40],[120,28],[156,27],[168,40]], wh: [50,194,15] },
    van:     { p: [[10,74],[10,20],[16,14],[166,14],[184,30],[222,46],[230,56],[230,74]], w: [[22,34],[22,21],[160,21],[176,34]], wh: [50,194,14] },
    coupe:   { p: [[8,74],[10,52],[40,44],[80,26],[130,24],[168,40],[215,48],[232,58],[232,74]], w: [[52,44],[84,30],[128,28],[156,42]], wh: [52,196,13] },
    sport:   { p: [[8,74],[8,54],[40,48],[85,30],[125,28],[165,44],[220,52],[234,62],[234,74]], w: [[56,47],[88,34],[124,32],[152,45]], wh: [52,198,13] },
    super:   { p: [[6,74],[8,52],[30,46],[90,32],[120,32],[170,50],[225,58],[236,66],[236,74]], w: [[70,44],[94,36],[120,36],[150,48]], wh: [50,200,14] },
    hyper:   { p: [[6,74],[6,48],[20,46],[70,40],[100,30],[130,32],[180,52],[228,60],[238,68],[238,74]], w: [[80,42],[102,34],[128,36],[158,49]], wh: [52,202,14] },
    classic: { p: [[12,74],[14,56],[30,44],[60,26],[110,22],[150,30],[175,46],[220,50],[230,60],[230,74]], w: [[46,44],[64,30],[108,27],[142,33],[160,45]], wh: [52,192,13] },
    muscle:  { p: [[8,74],[8,48],[50,46],[80,30],[130,28],[160,44],[225,46],[234,54],[234,74]], w: [[60,45],[84,33],[128,32],[150,44]], wh: [52,198,14] },
    roadster:{ p: [[8,74],[10,52],[60,46],[110,46],[128,34],[140,44],[220,52],[234,60],[234,74]], w: [[116,46],[128,37],[135,46]], wh: [50,198,13] },
    rally:   { p: [[10,74],[10,48],[6,40],[30,40],[34,30],[80,24],[124,24],[152,38],[205,46],[228,54],[230,74]], w: [[38,42],[42,32],[80,28],[122,28],[144,40]], wh: [50,192,13] },
  };
  const BRAND_COLORS = {
    "Ferrari": ["#d4142a", "#d4142a", "#f6c400"],
    "Lamborghini": ["#97d42a", "#f39a1e", "#f3c613", "#e8ecf0"],
    "Porsche": ["#c9ccd1", "#f2c200", "#3f6fb5", "#e7e9ec"],
    "Bugatti": ["#1f4fa8", "#2a3550", "#c7cfd9"],
    "McLaren": ["#ff8000", "#e6e6e6", "#28b0e6"],
    "Koenigsegg": ["#e9eef2", "#ff7a00", "#2c3a4f"],
    "Aston Martin": ["#2f6b52", "#9aa6ad"],
    "Alpine": ["#2a62d6", "#e9edf2"],
    "Pagani": ["#c8cdd3", "#6b7c94"],
    "Mercedes-Benz": ["#c4c9cf", "#e8ebee", "#202938"],
    "Mercedes-AMG": ["#c4c9cf", "#7c8a9c", "#e3e600"],
    "Ford": ["#2f5fbf", "#e9eef3", "#c8202f", "#f2a900"],
    "Nissan": ["#3a5cc4", "#e8ecf0", "#c4c9cf"],
    "Toyota": ["#e8ecf0", "#d7262f", "#f2a900"],
    "Lancia": ["#e8ecf0", "#c8202f"],
    "Jaguar": ["#2f5a43", "#c4c9cf"],
  };
  const PALETTE = ["#e8ecf0", "#c4c9cf", "#d7262f", "#2f5fbf", "#f2a900", "#3d8f6b", "#7fb8e0", "#ff6a1a", "#6f4fd0", "#2b3a55"];
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function carColor(car) {
    const list = BRAND_COLORS[car.brand] || PALETTE;
    return list[hash(car.id) % list.length];
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  let svgSeq = 0;
  function carSVG(car, locked = false, cls = "card__car") {
    const b = BODIES[car.body] || BODIES.coupe;
    const [xr, xf, r] = b.wh;
    const R = r + 3, base = 74, cy = 86 - r;
    const p = b.p;
    const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    let d = `M${p[0]} L${mid(p[0], p[1])}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i]} ${mid(p[i], p[i + 1])}`;
    const end = p[p.length - 1];
    d += ` L${end} L${xf + R},${base} A${R} ${R} 0 0 0 ${xf - R},${base} L${xr + R},${base} A${R} ${R} 0 0 0 ${xr - R},${base} L${p[0][0]},${base} Z`;
    const win = "M" + b.w.map((pt) => pt.join(",")).join(" L") + " Z";
    const id = `g${++svgSeq}`;
    const col = carColor(car);
    const front = p[p.length - 2];
    const wheel = (x) => `<circle cx="${x}" cy="${cy}" r="${r}" fill="${locked ? "#141417" : "#12161d"}"/>` +
      (locked ? "" : `<circle cx="${x}" cy="${cy}" r="${r * 0.58}" fill="url(#${id}m)"/><circle cx="${x}" cy="${cy}" r="${r * 0.16}" fill="#1a1f28"/>`);
    if (locked) {
      return `<svg class="${cls}" viewBox="0 0 240 92" aria-hidden="true"><path d="${d}" fill="#18181c" stroke="#33333a" stroke-width="1.2"/>${wheel(xr)}${wheel(xf)}</svg>`;
    }
    return `<svg class="${cls}" viewBox="0 0 240 92" aria-hidden="true">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(col, 0.45)}"/><stop offset=".45" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, -0.55)}"/></linearGradient>
        <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fc4e6"/><stop offset=".5" stop-color="#1c2a40"/><stop offset="1" stop-color="#0d1420"/></linearGradient>
        <radialGradient id="${id}m"><stop offset="0" stop-color="#eef1f5"/><stop offset="1" stop-color="#6c778a"/></radialGradient>
      </defs>
      <ellipse cx="120" cy="87" rx="112" ry="4" fill="#000" opacity=".45"/>
      <path d="${d}" fill="url(#${id}b)"/>
      <path d="${win}" fill="url(#${id}w)" stroke="${shade(col, -0.6)}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M${p[0][0] + 4},58 L${end[0] - 6},${Math.min(60, front[1] + 8)}" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/>
      <ellipse cx="${end[0] - 6}" cy="${Math.min(62, front[1] + 6)}" rx="5" ry="2.4" fill="#fff6cf"/>
      <rect x="${p[0][0]}" y="${Math.min(60, p[1][1] + 6)}" width="5" height="4" rx="1" fill="#ff3b3b"/>
      ${wheel(xr)}${wheel(xf)}
    </svg>`;
  }


  // ───────── Photos : complétées depuis le navigateur si le serveur ne les a pas encore ─────────
  const IMG_KEY = "hg_img_v1";
  function photoHTML(car) {
    return `<img class="card__photo" src="${esc(car.img.src)}" alt="${esc(car.brand + " " + car.model)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.parentNode.classList.remove('has-photo');this.remove()">`;
  }
  function patchCardPhotos(id) {
    const car = state.byId[id];
    $$(`.card[data-id="${id}"]:not(.is-locked) .card__media:not(.has-photo)`).forEach((media) => {
      media.classList.add("has-photo");
      media.insertAdjacentHTML("afterbegin", photoHTML(car));
    });
  }
  async function wikiApi(host, params) {
    const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
    for (let t = 0; t < 3; t++) {
      const r = await fetch(url);
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 3000 * (t + 1))); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }
    throw new Error("429");
  }
  async function findPhoto(car) {
    const PI = { prop: "pageimages", piprop: "name", pilicense: "free", redirects: "1" };
    let hit = null;
    if (car.wikiEn) {
      const j = await wikiApi("en.wikipedia.org", { action: "query", titles: car.wikiEn, ...PI });
      const p = j.query?.pages?.[0];
      if (p?.pageimage) hit = { host: "en.wikipedia.org", title: p.title, file: p.pageimage };
    }
    if (!hit) {
      const q = `${car.brand} ${car.model.replace(/\s*\(\d{4}\)/, "")}`;
      const bw = car.brand.split(/[\s-]/)[0].toLowerCase();
      for (const host of ["fr.wikipedia.org", "en.wikipedia.org"]) {
        const j = await wikiApi(host, { action: "query", generator: "search", gsrsearch: q, gsrlimit: "3", gsrnamespace: "0", ...PI });
        const pages = (j.query?.pages || []).sort((a, b) => a.index - b.index);
        const p = pages.find((x) => x.pageimage && x.title.toLowerCase().includes(bw)) || pages.find((x) => x.pageimage);
        if (p) { hit = { host, title: p.title, file: p.pageimage }; break; }
      }
    }
    if (!hit) return null;
    const j = await wikiApi(hit.host, { action: "query", titles: "File:" + hit.file, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "720", iiextmetadatafilter: "Artist|LicenseShortName" });
    const ii = j.query?.pages?.[0]?.imageinfo?.[0];
    if (!ii) return null;
    const src = ii.thumburl || ii.url;
    if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(src)) return null;
    const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const m = ii.extmetadata || {};
    return { src, page: ii.descriptionurl, artist: strip(m.Artist?.value).slice(0, 80) || "Auteur inconnu", license: strip(m.LicenseShortName?.value) || "Licence libre", article: hit.title };
  }
  async function completePhotos() {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(IMG_KEY) || "{}"); } catch {}
    for (const car of state.catalog) if (!car.img && cache[car.id]) { car.img = cache[car.id]; patchCardPhotos(car.id); }
    const missing = state.catalog.filter((c) => !c.img && cache[c.id] !== null);
    for (const car of missing) {
      try {
        const img = await findPhoto(car);
        cache[car.id] = img;
        if (img) { car.img = img; patchCardPhotos(car.id); }
        try { localStorage.setItem(IMG_KEY, JSON.stringify(cache)); } catch {}
      } catch { break; }
      await new Promise((ok) => setTimeout(ok, 250));
    }
  }

  // ───────── Carte (recto) ─────────
  function cardHTML(car, { locked = false, count = 0, isNew = false, back = false } = {}) {
    const pips = "<i></i>".repeat(car.rarity);
    const photo = !locked && car.img;
    const badge = isNew ? `<span class="card__badge card__badge--new">Nouvelle</span>` : count > 1 ? `<span class="card__badge">×${count}</span>` : "";
    const modelCls = car.model.length > 16 ? " is-xlong" : car.model.length > 11 ? " is-long" : "";
    const spec = (v, unit, label) => `<div class="spec"><b>${locked ? "?" : v}${unit && !locked ? `<small>${unit}</small>` : ""}</b><span>${label}</span></div>`;
    return `<div class="card r${car.rarity}${locked ? " is-locked" : ""}" data-id="${car.id}">
      <div class="card__tilt">
        <div class="card__face card__front">
          <div class="card__media${photo ? " has-photo" : ""}">
            ${photo ? photoHTML(car) : ""}${carSVG(car, locked)}
            ${locked ? `<span class="card__lock" aria-hidden="true">?</span>` : ""}
          </div>
          <div class="card__top">
            <span class="card__rar"><span class="card__pips" aria-hidden="true">${pips}</span>${rarityName(car.rarity)}</span>
            <span class="card__num">${pad(car.num)}</span>
          </div>
          <div class="card__panel">
            <div class="card__title">
              <span class="card__brand">${locked ? "À découvrir" : esc(car.brand)}${locked ? "" : `<em>${FLAGS[car.country] || ""} ${car.year}</em>`}</span>
              <h3 class="card__model${modelCls}">${locked ? "???" : esc(car.model)}</h3>
            </div>
            <div class="card__specs">
              ${spec(fmtNum(car.hp), "ch", "Puissance")}
              ${spec(fmtAcc(car.acc), car.acc == null ? "" : "s", "0–100")}
              ${spec(car.vmax ? fmtNum(car.vmax) : "—", car.vmax ? "km/h" : "", "V. max")}
            </div>
          </div>
          <div class="card__holo"></div><div class="card__sparkle"></div><div class="card__glare"></div>
        </div>
        ${back ? cardBackHTML(car, locked) : ""}
      </div>${badge}
    </div>`;
  }

  // ───────── Carte (verso : fiche détaillée) ─────────
  function cardBackHTML(car, locked) {
    if (locked) {
      return `<div class="card__face card__back"><div class="back__inner back__inner--locked">
        <p class="back__brand">Carte n°${car.num}</p><h3 class="back__model">Pas encore obtenue</h3>
        <p class="back__text">Cette carte ${rarityName(car.rarity).toLowerCase()} se cache dans un booster. Sa fiche complète apparaîtra ici dès que tu l'auras trouvée.</p>
      </div></div>`;
    }
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    return `<div class="card__face card__back"><div class="back__inner">
      <p class="back__brand">${esc(car.brand)}</p>
      <h3 class="back__model">${esc(car.model)}</h3>
      <p class="back__text">${esc(car.long)}</p>
      <dl class="back__specs">
        ${row("Moteur", esc(car.engine))}
        ${row("Puissance", `${fmtNum(car.hp)} ch`)}
        ${row("0 à 100 km/h", car.acc == null ? "—" : `${fmtAcc(car.acc)} s`)}
        ${row("Vitesse max", car.vmax ? `${fmtNum(car.vmax)} km/h` : "—")}
        ${row("Année", car.year)}
        ${row("Origine", `${FLAGS[car.country] || ""} ${esc(car.country)}`)}
        ${row("Catégorie", BODY_LABEL[car.body] || "")}
      </dl>
      ${car.img ? `<p class="back__credit">Photo ${esc(car.img.artist)}, ${esc(car.img.license)}</p>` : ""}
    </div><div class="card__glare"></div></div>`;
  }


  // ───────── Inclinaison 3D ─────────
  function tilt(el, { strength = 1, target = el } = {}) {
    let raf = 0;
    const set = (px, py, hyp) => {
      target.style.setProperty("--px", px.toFixed(3));
      target.style.setProperty("--py", py.toFixed(3));
      target.style.setProperty("--hyp", hyp.toFixed(3));
      target.style.setProperty("--rx", `${((0.5 - py) * 22 * strength).toFixed(2)}deg`);
      target.style.setProperty("--ry", `${((px - 0.5) * 26 * strength).toFixed(2)}deg`);
    };
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        target.classList.add("is-tilting");
        set(px, py, Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2));
      });
    });
    el.addEventListener("pointerleave", () => {
      cancelAnimationFrame(raf);
      target.classList.remove("is-tilting");
      set(0.5, 0.5, 0);
    });
  }
  // Mouvement automatique doux (visionneuse sans souris / mobile)
  function idleSway(card) {
    if (reduceMotion) return () => {};
    let t0 = performance.now(), stop = false, hovering = false;
    card.addEventListener("pointerenter", () => (hovering = true));
    card.addEventListener("pointerleave", () => (hovering = false));
    const loop = (t) => {
      if (stop) return;
      if (!hovering) {
        const a = (t - t0) / 2400;
        const px = 0.5 + Math.cos(a) * 0.32, py = 0.5 + Math.sin(a * 1.3) * 0.28;
        card.style.setProperty("--px", px.toFixed(3));
        card.style.setProperty("--py", py.toFixed(3));
        card.style.setProperty("--hyp", "0.55");
        card.style.setProperty("--rx", `${((0.5 - py) * 14).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((px - 0.5) * 18).toFixed(2)}deg`);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => (stop = true);
  }


  // ───────── Rendu général ─────────
  const VIEWS = ["boosters", "classeur", "classement"];
  function currentView() {
    const h = location.hash.replace("#", "");
    return VIEWS.includes(h) ? h : "boosters";
  }
  function setTopbar() {
    const logged = !!state.me;
    $(".topbar").hidden = !logged;
    if (!logged) return;
    $("#who").textContent = state.me.pseudo;
    $("#progress").textContent = `${ownedCount()} / ${state.catalog.length} modèles`;
    const view = currentView();
    $$(".tabs a").forEach((a) => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }
  // Transition douce entre les vues (View Transitions API quand le navigateur la connaît)
  function render() {
    if (document.startViewTransition && !reduceMotion && render.ready) {
      const vt = document.startViewTransition(renderNow);
      vt.ready.catch(() => {}); vt.finished.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
    } else renderNow();
    render.ready = true;
  }
  function renderNow() {
    clearInterval(render.timer);
    if (!state.me) return renderAuth();
    setTopbar();
    const v = currentView();
    if (v === "classeur") renderBinder();
    else if (v === "classement") renderLeaderboard();
    else renderPacks();
  }

  // ───────── Boosters ─────────
  function garageHTML() {
    const cfg = state.config, me = state.me;
    const d = doubles(), pts = recyclePoints();
    return `<div class="panel garage" id="garage">
      <p class="panel__title">Points garage</p>
      <div class="garage__points"><b>${fmtNum(me.points || 0)}</b><span>points</span></div>
      <p class="garage__hint">${d ? `Tu as ${d} carte${d > 1 ? "s" : ""} en double. Recycle-les pour gagner ${pts} points : plus une carte est rare, plus elle rapporte.` : "Aucune carte en double pour l'instant. Les doubles pourront être recyclés en points."}</p>
      <div class="garage__actions">
        <button class="btn btn--small btn--light" type="button" id="recycle" ${d ? "" : "disabled"}>Recycler les doubles${d ? ` (+${pts})` : ""}</button>
        <button class="btn btn--small" type="button" id="buy" ${(me.points || 0) >= cfg.packCost ? "" : "disabled"}>Acheter un booster (${cfg.packCost} pts)</button>
      </div>
    </div>`;
  }
  function bindGarage() {
    $("#recycle")?.addEventListener("click", async (e) => {
      const d = doubles();
      if (!d || !confirmInline(e.currentTarget, `Recycler ${d} double${d > 1 ? "s" : ""} ?`)) return;
      try {
        const r = await api("/api/recycle", {});
        for (const c of Object.values(state.me.collection)) c.count = 1;
        state.me.points = r.points;
        toast(r.gained ? `${r.cards} double${r.cards > 1 ? "s" : ""} recyclé${r.cards > 1 ? "s" : ""} : +${r.gained} points garage.` : "Aucun double à recycler.");
        refreshGarage();
      } catch (ex) { toast(ex.message); }
    });
    $("#buy")?.addEventListener("click", async () => {
      try {
        const r = await api("/api/packs/buy", {});
        state.me.points = r.points;
        state.me.packs = r.packs;
        state.me.nextPackIn = r.nextPackIn;
        toast("Booster acheté. Il t'attend sur le tapis.");
        if (!state.opening) render(); else refreshGarage();
      } catch (ex) { toast(ex.message); }
    });
  }
  function refreshGarage() {
    const g = $("#garage");
    const sp = $("#stat-points");
    if (sp) sp.textContent = fmtNum(state.me.points || 0);
    if (!g) return;
    g.outerHTML = garageHTML();
    bindGarage();
  }
  // Demande une confirmation par un second clic sur le même bouton
  function confirmInline(btn, label) {
    if (btn.dataset.confirm === "1") { delete btn.dataset.confirm; return true; }
    const old = btn.textContent;
    btn.dataset.confirm = "1";
    btn.textContent = label + " Clique encore pour confirmer";
    setTimeout(() => { if (btn.isConnected && btn.dataset.confirm) { delete btn.dataset.confirm; btn.textContent = old; } }, 4000);
    return false;
  }

  function renderPacks() {
    const me = state.me;
    const cfg = state.config;
    const deadline = me.nextPackIn != null ? Date.now() + me.nextPackIn : null;
    const total = state.rarities.reduce((s, r) => s + r.weight, 0);
    const every = cfg.packInterval >= 3600000 ? `${Math.round(cfg.packInterval / 3600000)} h` : `${Math.round(cfg.packInterval / 60000)} min`;
    app.innerHTML = `<section class="arena">
      <div class="arena__stats reveal-up" style="--d:0">
        <div class="stat"><b id="pack-count">${me.packs}</b><span>${packWord(me.packs)} prêt${me.packs > 1 ? "s" : ""}</span></div>
        <div class="stat" id="timer">${deadline ? `<b>${fmtDuration(deadline - Date.now())}</b><span>avant +${cfg.packsPerTick} ${packWord(cfg.packsPerTick)}</span>` : `<b>Pleine</b><span>réserve de ${cfg.maxPacks}</span>`}</div>
        <div class="stat"><b id="stat-points">${fmtNum(me.points || 0)}</b><span>points garage</span></div>
      </div>
      <div class="stage" id="stage">
        ${me.packs > 0 ? packHTML(me.packs) : `<p class="pack-empty"><strong>Plus de booster pour l'instant</strong>De nouveaux boosters arrivent automatiquement, ou achète-en un avec tes points garage.</p>`}
        <div class="reveal" id="reveal"></div>
      </div>
      ${me.packs > 0 ? `<div class="arena__under"><button class="btn-ghost" type="button" id="auto-open">Ouvrir sans découper</button></div>` : ""}
      <div class="arena__panels reveal-up" style="--d:2">
        ${garageHTML()}
        <div class="panel">
          <p class="panel__title">Chances par carte</p>
          <ul class="odds">${state.rarities.slice().reverse().map((r) => `<li style="--c:var(${RARITY_VAR[r.id]})">${r.name}<span>${(r.weight / total * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</span></li>`).join("")}</ul>
          <p class="panel__note">La 5ᵉ carte de chaque booster est au moins Rare. ${cfg.packsPerTick} ${packWord(cfg.packsPerTick)} offerts toutes les ${every}, jusqu'à ${cfg.maxPacks} en réserve.</p>
        </div>
      </div>
    </section>`;

    if (deadline) {
      render.timer = setInterval(async () => {
        const left = deadline - Date.now();
        const t = $("#timer b");
        if (t) t.textContent = fmtDuration(Math.max(0, left));
        if (left <= 0) {
          clearInterval(render.timer);
          state.me = await api("/api/me").catch(() => state.me);
          if (!state.opening && currentView() === "boosters" && $("#viewer").hidden) render();
        }
      }, 1000);
    }
    bindGarage();
    const pack = $("#pack");
    if (pack) {
      tilt(pack, { strength: 0.8 });
      setupCutting(pack);
    }
  }

  // ───────── Connexion / inscription ─────────
  function renderAuth() {
    setTopbar();
    const pick = (r) => { const l = state.catalog.filter((c) => c.rarity === r); return l[hash(String(new Date().getDate()) + r) % l.length]; };
    const show = [pick(4), pick(6), pick(5)];
    const reg = state.authMode === "register";
    app.innerHTML = `<section class="hero">
      <h1 class="hero__title reveal-up" style="--d:0">ApexPack</h1>
      <p class="hero__lede reveal-up" style="--d:1">${state.catalog.length} vraies voitures en cartes holographiques, de la Clio à la McLaren F1. Ouvre des boosters, découpe-les, complète ton classeur.</p>
      <div class="fan reveal-up" style="--d:2">${show.map((c, i) => `<div class="fan__item" style="--i:${i}"><div class="fan__float">${cardHTML(c)}</div></div>`).join("")}</div>
      <div class="auth-card reveal-up" style="--d:3">
        <div class="seg" role="tablist">
          <button type="button" role="tab" aria-selected="${reg}" data-mode="register">Créer un compte</button>
          <button type="button" role="tab" aria-selected="${!reg}" data-mode="login">Se connecter</button>
        </div>
        <form id="auth-form" novalidate>
          <div class="field">
            <label for="pseudo">Pseudo</label>
            <input id="pseudo" name="pseudo" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_\\-]{3,20}" spellcheck="false" autocapitalize="off">
            ${reg ? "<small>3 à 20 caractères : lettres, chiffres, - ou _</small>" : ""}
          </div>
          <div class="field">
            <label for="password">Mot de passe</label>
            <input id="password" name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" required minlength="6" maxlength="128">
            ${reg ? "<small>Au moins 6 caractères</small>" : ""}
          </div>
          <p class="form-error" id="form-error" role="alert"></p>
          <button class="btn btn--block" type="submit">${reg ? `Créer mon compte et recevoir ${state.config.startPacks} boosters` : "Se connecter"}</button>
        </form>
      </div>
    </section>`;
    $$(".fan .card").forEach((c) => tilt(c));
    $$(".auth-card .seg button").forEach((b) => b.addEventListener("click", () => { state.authMode = b.dataset.mode; renderAuth(); $$(".reveal-up").forEach((el) => el.classList.add("no-anim")); $("#pseudo").focus(); }));
    $("#auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const btn = $("button[type=submit]", f);
      const err = $("#form-error");
      const pseudo = f.pseudo.value.trim(), password = f.password.value;
      if (!/^[A-Za-z0-9_\-]{3,20}$/.test(pseudo)) { err.textContent = "Le pseudo doit faire 3 à 20 caractères : lettres, chiffres, - ou _."; f.pseudo.focus(); return; }
      if (password.length < 6) { err.textContent = "Le mot de passe doit contenir au moins 6 caractères."; f.password.focus(); return; }
      btn.disabled = true; err.textContent = "";
      try {
        state.me = await api(reg ? "/api/register" : "/api/login", { pseudo, password });
        if (!location.hash) location.hash = "#boosters";
        render();
        if (reg) toast(`Bienvenue ${state.me.pseudo} ! ${state.config.startPacks} boosters t'attendent.`);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }


  // ───────── Boosters ─────────
  function fmtDuration(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min ${String(sec).padStart(2, "0")} s`;
  }
  function packHTML(n) {
    const ghosts = Array.from({ length: Math.min(n, 5) - 1 }, (_, i) => `<div class="pack__ghost" style="--i:${Math.min(n, 5) - 1 - i}"></div>`).join("");
    const hero = state.catalog.find((c) => c.id === "mclaren-f1-1992") || state.catalog[0];
    return `<div class="pack" id="pack" role="group" aria-label="Booster : glisse le long des pointillés pour le découper">
      <div class="pack__stack">${ghosts}</div>
      <div class="pack__body">
        <div class="pack__label">
          <div class="pack__brand"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10 16.5 18h-9Z" fill="currentColor"/></svg>ApexPack</div>
          ${carSVG(hero, false, "pack__car")}
          <div class="pack__info"><span>Booster</span><span><b>${state.config.cardsPerPack}</b> cartes</span></div>
        </div>
      </div>
      <div class="pack__top"></div>
      <div class="pack__flap"></div>
      <div class="pack__tear"></div>
      <div class="pack__cutline"></div>
      <div class="pack__spark"></div>
      <div class="pack__hint" aria-hidden="true"><span class="pack__scissors">✂</span> Glisse le long des pointillés</div>
    </div>`;
  }
  const packWord = (n) => (n > 1 ? "boosters" : "booster");
  // ───────── Découpe du booster à la souris / au doigt ─────────
  function setupCutting(pack) {
    let cut = 0, dragging = false, finished = false, request = null, lastFlake = 0;
    const setCut = (v) => {
      cut = Math.min(1, Math.max(cut, v));
      pack.style.setProperty("--cut", cut.toFixed(4));
      if (cut > 0) pack.classList.add("is-cutting");
      if (cut > 0.55 && !request) request = fetchPack();
      if (cut >= 0.96) finish();
    };
    const flake = () => {
      const now = performance.now();
      if (reduceMotion || now - lastFlake < 35) return;
      lastFlake = now;
      const f = document.createElement("i");
      f.className = "pack__flake";
      f.style.left = `${cut * 100}%`;
      f.style.setProperty("--h", Math.floor(Math.random() * 360));
      pack.appendChild(f);
      const dx = (Math.random() - 0.5) * 80, dy = 40 + Math.random() * 90, rot = (Math.random() - 0.5) * 720;
      f.animate(
        [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(.4)`, opacity: 0 }],
        { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.2,.6,.4,1)" }
      ).onfinish = () => f.remove();
    };
    const ratio = (e) => {
      const r = pack.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    pack.addEventListener("pointerdown", (e) => {
      if (finished) return;
      const { x, y } = ratio(e);
      if (y > 0.42 || x > cut + 0.22) {
        pack.querySelector(".pack__hint").animate([{ transform: "translate(-50%,0)" }, { transform: "translate(-50%,-8px)" }, { transform: "translate(-50%,0)" }], { duration: 400 });
        return;
      }
      dragging = true;
      pack.setPointerCapture(e.pointerId);
      pack.classList.add("is-dragging");
      setCut(Math.max(cut, Math.min(x, cut + 0.05)));
      e.preventDefault();
    });
    pack.addEventListener("pointermove", (e) => {
      if (!dragging || finished) return;
      const { x } = ratio(e);
      if (x > cut && x <= cut + 0.3) { setCut(x); flake(); }
    });
    const stop = () => { dragging = false; pack.classList.remove("is-dragging"); };
    pack.addEventListener("pointerup", stop);
    pack.addEventListener("pointercancel", stop);

    $("#auto-open")?.addEventListener("click", () => {
      if (finished) return;
      const from = cut, t0 = performance.now(), dur = reduceMotion ? 1 : 750;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        setCut(from + (1 - from) * (1 - Math.pow(1 - k, 3)));
        flake();
        if (k < 1 && !finished) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    async function finish() {
      if (finished) return;
      finished = true;
      dragging = false;
      pack.style.setProperty("--cut", "1");
      pack.classList.add("is-open");
      $(".arena__under")?.remove();
      if (!request) request = fetchPack();
      const result = await request;
      if (!result) return;
      setTimeout(() => revealPack(pack, result), reduceMotion ? 0 : 350);
    }
  }

  async function fetchPack() {
    state.opening = true;
    try {
      const r = await api("/api/packs/open", {});
      state.pending = r;
      return r;
    } catch (e) {
      state.opening = false;
      toast(e.message);
      if (state.me) {
        state.me = await api("/api/me").catch(() => state.me);
        render();
      }
      return null;
    }
  }

  // Range les cartes reçues dans la collection locale (une seule fois par booster)
  function applyResult(result) {
    if (!result || result.applied) return new Set();
    result.applied = true;
    if (state.pending === result) state.pending = null;
    const newOnes = new Set();
    for (const id of result.cards) {
      const c = state.me.collection[id];
      if (c) c.count++;
      else { state.me.collection[id] = { count: 1, first: Date.now() }; newOnes.add(id); }
    }
    newOnes.forEach((id) => state.fresh.add(id));
    state.me.packs = result.packs;
    state.me.nextPackIn = result.nextPackIn;
    state.me.opened++;
    setTopbar();
    return newOnes;
  }

  function revealPack(pack, result) {
    clearInterval(render.timer);
    if (!pack.isConnected) { applyResult(result); return; }
    const newOnes = applyResult(result);
    $("#pack-count").textContent = result.packs;
    refreshGarage();

    pack.classList.add("is-gone");
    $(".arena")?.classList.add("is-revealing");
    const reveal = $("#reveal");
    const cards = result.cards.map((id) => state.byId[id]);
    reveal.innerHTML = `<div class="reveal__row">` + cards.map((car, i) => `<button class="flip${car.rarity >= 4 ? " is-hot" : ""}" type="button" style="--i:${i};--hc:var(${RARITY_VAR[car.rarity]})" data-id="${car.id}" aria-label="Retourner la carte ${i + 1}">
        <div class="flip__inner">
          <div class="flip__back"><div class="cardback"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10 16.5 18h-9Z" fill="currentColor"/></svg><span>ApexPack</span></div></div>
          <div class="flip__front"><div class="burst"></div>${cardHTML(car, { isNew: newOnes.has(car.id) })}</div>
        </div>
      </button>`).join("") + `</div>` +
      `<div class="reveal-actions" id="reveal-actions">
        <button class="btn btn--light" type="button" id="reveal-all">Tout retourner</button>
      </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => reveal.classList.add("is-live")));

    const flips = $$(".flip", reveal);
    let finished = false;
    const done = () => {
      if (finished || !flips.every((f) => f.classList.contains("is-flipped"))) return;
      finished = true;
      const best = cards.reduce((a, c) => (c.rarity > a.rarity ? c : a), cards[0]);
      const fresh = cards.filter((c) => newOnes.has(c.id)).length;
      $("#reveal-actions").innerHTML = `
        <p class="reveal-sum">${fresh ? `${fresh} nouvelle${fresh > 1 ? "s" : ""} carte${fresh > 1 ? "s" : ""} pour ta collection` : "Que des doubles cette fois : recycle-les en points garage"}</p>
        ${state.me.packs > 0 ? `<button class="btn" type="button" id="again">Ouvrir le booster suivant</button>` : ""}
        <button class="btn btn--light" type="button" id="to-binder">Voir dans le classeur</button>`;
      $("#again")?.addEventListener("click", () => { state.opening = false; render(); });
      $("#to-binder").addEventListener("click", () => { state.opening = false; goToCard(best.id); });
      state.opening = false;
    };
    const flipOne = (f) => {
      if (f.classList.contains("is-flipped")) return;
      f.classList.add("is-flipped");
      f.classList.remove("is-hot");
      f.setAttribute("aria-label", "Voir la carte en grand");
      done();
    };
    flips.forEach((f) => {
      const card = $(".card", f);
      tilt(f, { target: card, strength: 0.7 });
      f.addEventListener("click", () => {
        if (!f.classList.contains("is-flipped")) flipOne(f);
        else openViewer(f.dataset.id, cards.map((c) => c.id));
      });
    });
    $("#reveal-all").addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      flips.forEach((f, i) => setTimeout(() => flipOne(f), i * 160));
    });
  }

  // ───────── Classeur ─────────
  function filteredCars() {
    const b = state.binder, col = state.me.collection;
    let list = state.catalog.slice();
    const q = norm(b.q.trim());
    if (q) list = list.filter((c) => col[c.id] ? norm(`${c.brand} ${c.model} ${c.year} ${c.country}`).includes(q) : norm(`${c.num}`).includes(q));
    if (b.rarity) list = list.filter((c) => c.rarity === b.rarity);
    if (b.owned === "mine") list = list.filter((c) => col[c.id]);
    else if (b.owned === "missing") list = list.filter((c) => !col[c.id]);
    else if (b.owned === "doubles") list = list.filter((c) => col[c.id]?.count > 1);
    const s = b.sort;
    if (s === "rarity") list.sort((a, c) => c.rarity - a.rarity || a.num - c.num);
    else if (s === "brand") list.sort((a, c) => a.brand.localeCompare(c.brand, "fr") || a.year - c.year);
    else if (s === "year") list.sort((a, c) => a.year - c.year || a.num - c.num);
    else if (s === "hp") list.sort((a, c) => c.hp - a.hp);
    else if (s === "recent") list.sort((a, c) => (col[c.id]?.first || 0) - (col[a.id]?.first || 0) || a.num - c.num);
    return list;
  }
  function goToCard(id) {
    const b = state.binder;
    b.q = ""; b.rarity = 0; b.owned = "all";
    const idx = filteredCars().findIndex((c) => c.id === id);
    const page = Math.floor(idx / PER_PAGE) + 1;
    // page impaire = verso de la feuille précédente (planche (page+1)/2), page paire = recto (planche page/2)
    b.spread = page % 2 ? (page + 1) / 2 : page / 2;
    b.highlight = id;
    if (location.hash !== "#classeur") location.hash = "#classeur";
    else render();
  }

  function binderToolbar() {
    const b = state.binder;
    const sorts = [["num", "Ordre du catalogue"], ["rarity", "Rareté"], ["brand", "Marque"], ["year", "Année"], ["hp", "Puissance"], ["recent", "Dernières obtenues"]];
    const owned = [["all", "Toutes les cartes"], ["mine", "Mes cartes"], ["missing", "Cartes manquantes"], ["doubles", "Mes doubles"]];
    return `<div class="toolbar" role="search">
      <input class="input" type="search" id="f-q" placeholder="Chercher une marque, un modèle…" value="${esc(b.q)}" aria-label="Rechercher une carte">
      <select class="select" id="f-owned" aria-label="Cartes affichées">${owned.map(([v, l]) => `<option value="${v}"${b.owned === v ? " selected" : ""}>${l}</option>`).join("")}</select>
      <select class="select" id="f-rarity" aria-label="Rareté"><option value="0">Toutes les raretés</option>${state.rarities.map((r) => `<option value="${r.id}"${b.rarity === r.id ? " selected" : ""}>${r.name}</option>`).join("")}</select>
      <select class="select" id="f-sort" aria-label="Trier par">${sorts.map(([v, l]) => `<option value="${v}"${b.sort === v ? " selected" : ""}>Tri : ${l}</option>`).join("")}</select>
      <div class="seg seg--small" role="group" aria-label="Affichage">
        <button type="button" data-v="book" aria-pressed="${b.view === "book"}">Classeur 3D</button>
        <button type="button" data-v="grid" aria-pressed="${b.view === "grid"}">Grille</button>
      </div>
    </div>`;
  }

  function renderBinder() {
    const me = state.me;
    const b = state.binder;
    const owned = ownedCount();
    const counts = state.rarities.map((r) => {
      const all = state.catalog.filter((c) => c.rarity === r.id);
      return { r, have: all.filter((c) => me.collection[c.id]).length, all: all.length };
    });
    app.innerHTML = `<section class="page">
      <div class="binder-head">
        <div>
          <h1 class="page__title">Mon classeur</h1>
          <p class="page__sub">${owned} modèles sur ${state.catalog.length}, ${me.opened} booster${me.opened > 1 ? "s" : ""} ouvert${me.opened > 1 ? "s" : ""}, ${doubles()} double${doubles() > 1 ? "s" : ""}</p>
          <div class="progressbar" aria-hidden="true"><i style="width:${(owned / state.catalog.length) * 100}%"></i></div>
        </div>
        <div class="chips">${counts.map(({ r, have, all }) => `<button type="button" class="chip${b.rarity === r.id ? " is-on" : ""}" data-r="${r.id}" style="--c:var(${RARITY_VAR[r.id]})"><b>${have}/${all}</b> ${r.name}</button>`).join("")}</div>
      </div>
      ${binderToolbar()}
      <div id="binder-body"></div>
    </section>`;

    const refresh = () => { b.spread = 1; renderBinderBody(); };
    let qTimer;
    $("#f-q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { b.q = e.target.value; refresh(); }, 180); });
    $("#f-owned").addEventListener("change", (e) => { b.owned = e.target.value; refresh(); });
    $("#f-rarity").addEventListener("change", (e) => { b.rarity = Number(e.target.value); syncChips(); refresh(); });
    $("#f-sort").addEventListener("change", (e) => { b.sort = e.target.value; store.set("hg_sort", b.sort); refresh(); });
    $$(".seg--small button").forEach((btn) => btn.addEventListener("click", () => {
      b.view = btn.dataset.v; store.set("hg_view", b.view);
      $$(".seg--small button").forEach((x) => x.setAttribute("aria-pressed", x === btn));
      renderBinderBody();
    }));
    const syncChips = () => { $$(".chip[data-r]").forEach((c) => c.classList.toggle("is-on", Number(c.dataset.r) === b.rarity)); $("#f-rarity").value = String(b.rarity); };
    $$(".chip[data-r]").forEach((c) => c.addEventListener("click", () => {
      const r = Number(c.dataset.r);
      b.rarity = b.rarity === r ? 0 : r;
      syncChips(); refresh();
    }));
    renderBinderBody();
  }

  function slotHTML(car) {
    const own = state.me.collection[car.id];
    return `<button class="slot" type="button" data-id="${car.id}" aria-label="${own ? esc(car.brand + " " + car.model) : "Carte non obtenue n°" + car.num}">${cardHTML(car, { locked: !own, count: own?.count || 0, isNew: state.fresh.has(car.id) })}</button>`;
  }

  function renderBinderBody() {
    const body = $("#binder-body");
    const list = filteredCars();
    const b = state.binder;
    if (!list.length) {
      body.innerHTML = `<div class="empty"><strong>Aucune carte ne correspond.</strong>Change la recherche ou les filtres pour voir d'autres cartes.</div>`;
      return;
    }
    const order = list.map((c) => c.id);
    if (b.view === "grid") {
      body.innerHTML = `<p class="result-count">${list.length} carte${list.length > 1 ? "s" : ""}</p><div class="grid">${list.map((c, i) => slotHTML(c).replace('class="slot"', `class="slot" style="--n:${Math.min(i, 24)}"`)).join("")}</div>`;
      $$(".slot[data-id]", body).forEach((s) => s.addEventListener("click", () => openViewer(s.dataset.id, order)));
      highlight(body);
      return;
    }

    const pages = Math.ceil(list.length / PER_PAGE);
    const leaves = Math.ceil((pages + 1) / 2); // feuille 0 : couverture au recto, page 1 au verso
    const spreads = leaves;
    b.spread = Math.max(0, Math.min(spreads, b.spread));
    const owned = ownedCount();

    const pageHTML = (n) => {
      if (n > pages) return `<div class="inside">${owned === state.catalog.length ? "Collection complète. Chapeau !" : `Encore ${state.catalog.length - owned} cartes à trouver.`}</div>`;
      const slice = list.slice((n - 1) * PER_PAGE, n * PER_PAGE);
      const slots = slice.map(slotHTML).join("") + `<div class="slot slot--empty"></div>`.repeat(PER_PAGE - slice.length);
      const have = slice.filter((c) => state.me.collection[c.id]).length;
      return `<div class="sheet__grid">${slots}</div><div class="sheet__foot"><span>Page ${n}</span><span>${have} / ${slice.length}</span></div>`;
    };

    let leavesHTML = "";
    for (let i = 0; i < leaves; i++) {
      const front = i === 0
        ? `<div class="leaf__side cover"><h2 class="cover__title"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10 16.5 18h-9Z" fill="currentColor"/></svg>ApexPack</h2><div class="cover__owner">Classeur de<b>${esc(state.me.pseudo)}</b>${owned} / ${state.catalog.length} cartes</div><button class="btn" type="button" data-open>Ouvrir le classeur</button></div>`
        : `<div class="leaf__side sheet">${pageHTML(i * 2)}</div>`;
      const back = `<div class="leaf__side leaf__side--back sheet">${pageHTML(i * 2 + 1)}</div>`;
      leavesHTML += `<div class="leaf${i < b.spread ? " is-flipped" : ""}" data-leaf="${i}" style="--z:${i < b.spread ? i + 1 : leaves - i}">${front}${back}</div>`;
    }

    body.innerHTML = `<div class="book-wrap">
        <div class="book" id="book">
          <div class="book__board book__board--l"></div>
          <div class="book__board book__board--r"></div>
          <div class="book__spine"></div>
          ${leavesHTML}
        </div>
      </div>
      <div class="book-nav">
        <button class="round" type="button" id="prev" aria-label="Page précédente">‹</button>
        <span class="book-nav__where" id="where"></span>
        <button class="round" type="button" id="next" aria-label="Page suivante">›</button>
      </div>`;

    const book = $("#book");
    const leafEls = $$(".leaf", book);
    const update = () => {
      book.classList.toggle("is-closed", b.spread === 0);
      book.classList.toggle("is-end", b.spread === spreads);
      $("#prev").disabled = b.spread === 0;
      $("#next").disabled = b.spread === spreads;
      const l = b.spread * 2 - 1, r = b.spread * 2;
      $("#where").textContent = b.spread === 0 ? "Couverture" : r > pages ? `Page ${l} sur ${pages}` : `Pages ${l} et ${r} sur ${pages}`;
    };
    const go = (k) => {
      k = Math.max(0, Math.min(spreads, k));
      if (k === b.spread) return;
      const forward = k > b.spread;
      const from = b.spread;
      b.spread = k;
      leafEls.forEach((leaf, i) => {
        const should = i < k;
        if (should !== leaf.classList.contains("is-flipped")) {
          clearTimeout(leaf._t);
          leaf.classList.add("is-turning");
          leaf.style.zIndex = 999 - Math.abs(i - (forward ? from : k));
          leaf.classList.toggle("is-flipped", should);
          leaf._t = setTimeout(() => {
            leaf.classList.remove("is-turning");
            leaf.style.zIndex = "";
            leaf.style.setProperty("--z", leaf.classList.contains("is-flipped") ? i + 1 : leaves - i);
          }, 1000);
        }
      });
      update();
    };
    update();
    $("#prev").addEventListener("click", () => go(b.spread - 1));
    $("#next").addEventListener("click", () => go(b.spread + 1));
    $("[data-open]", book)?.addEventListener("click", (e) => { e.stopPropagation(); go(1); });
    book._go = go;

    // glisser pour tourner les pages
    let sx = null, sy = null;
    book.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
    book.addEventListener("pointerup", (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { book.dataset.swiped = "1"; go(b.spread + (dx < 0 ? 1 : -1)); setTimeout(() => delete book.dataset.swiped, 50); }
    });

    $$(".slot[data-id]", book).forEach((s) => {
      const card = $(".card", s);
      s.addEventListener("pointermove", (e) => {
        const r = s.getBoundingClientRect();
        card.style.setProperty("--px", ((e.clientX - r.left) / r.width).toFixed(3));
        card.style.setProperty("--py", ((e.clientY - r.top) / r.height).toFixed(3));
      });
      s.addEventListener("click", () => { if (!book.dataset.swiped) openViewer(s.dataset.id, order); });
    });
    highlight(book);
  }
  function highlight(root) {
    const b = state.binder;
    if (!b.highlight) return;
    const el = $(`.slot[data-id="${b.highlight}"] .card`, root);
    b.highlight = null;
    if (!el) return;
    if (b.view === "grid") el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 900, delay: 400, easing: "ease-out" });
  }

  // ───────── Classement ─────────
  async function renderLeaderboard() {
    app.innerHTML = `<section class="page"><h1 class="page__title">Classement</h1><p class="page__sub">Chargement…</p></section>`;
    let data;
    try { data = await api("/api/leaderboard"); }
    catch (e) { app.innerHTML = `<section class="page"><h1 class="page__title">Classement</h1><p class="page__sub">${esc(e.message)}</p></section>`; return; }
    if (currentView() !== "classement") return;
    const me = state.me.pseudo;
    const total = state.catalog.length;
    const row = (u) => `<tr class="${u.pseudo === me ? "is-me" : ""}">
        <td class="lb__rank">${u.rank <= 3 ? ["", "🥇", "🥈", "🥉"][u.rank] : u.rank}</td>
        <td class="lb__name">${esc(u.pseudo)}${u.pseudo === me ? " <small>(toi)</small>" : ""}</td>
        <td><div class="lb__bar"><i style="width:${(u.cards / total) * 100}%"></i></div>${u.cards} / ${total}</td>
        <td class="lb__score">${fmtNum(u.score)}</td>
        <td>${u.best ? `<span class="lb__best" style="--c:var(${RARITY_VAR[u.best]})">${rarityName(u.best)}</span>` : "—"}</td>
      </tr>`;
    const inTop = data.top.some((u) => u.pseudo === me);
    app.innerHTML = `<section class="page">
      <div class="binder-head">
        <div>
          <h1 class="page__title">Classement</h1>
          <p class="page__sub">${data.players} collectionneur${data.players > 1 ? "s" : ""}. Classés par nombre de modèles différents, puis par score de rareté.</p>
        </div>
        ${data.me ? `<div class="lb__mine"><b>${data.me.rank}<sup>${data.me.rank === 1 ? "er" : "e"}</sup></b><span>ta place</span></div>` : ""}
      </div>
      <div class="lb-wrap"><table class="lb">
        <thead><tr><th>Rang</th><th>Joueur</th><th>Collection</th><th>Score</th><th>Plus rare</th></tr></thead>
        <tbody>${data.top.map(row).join("")}${!inTop && data.me ? `<tr class="lb__gap"><td colspan="5">…</td></tr>${row(data.me)}` : ""}</tbody>
      </table></div>
      <p class="odds-note">Le score additionne la valeur de chaque modèle différent : 1 point pour une Commune, jusqu'à 80 pour une Mythique.</p>
    </section>`;
  }

  // ───────── Visionneuse ─────────
  let stopSway = () => {};
  let viewerOrder = [];
  function openViewer(id, order) {
    const v = $("#viewer");
    const car = state.byId[id];
    const own = state.me?.collection[id];
    const idx = order.indexOf(id);
    const prev = order[idx - 1], next = order[idx + 1];
    stopSway();
    const firstSeen = own ? new Date(own.first).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
    const facts = [["Moteur", esc(car.engine)], ["Puissance", `${fmtNum(car.hp)} ch`], ["0 à 100 km/h", car.acc == null ? "—" : `${fmtAcc(car.acc)} s`], ["Vitesse max", car.vmax ? `${fmtNum(car.vmax)} km/h` : "—"], ["Année", car.year], ["Origine", `${FLAGS[car.country] || ""} ${esc(car.country)}`]];
    v.innerHTML = `<button class="round viewer__close" type="button" id="v-close" aria-label="Fermer">✕</button>
      <div class="viewer__box">
        <div class="viewer__cardcol">
          ${cardHTML(car, { locked: !own, back: true })}
          <button class="btn-ghost" type="button" id="v-flip">Retourner la carte</button>
        </div>
        <div class="viewer__info">
          ${own ? `<p class="viewer__brand">${esc(car.brand)}</p><h2 id="viewer-title">${esc(car.model)}</h2>` : `<p class="viewer__brand">Carte n°${car.num}</p><h2 id="viewer-title">Non obtenue</h2>`}
          <div class="viewer__rarity" style="--c:var(${RARITY_VAR[car.rarity]})">${rarityName(car.rarity)}<span>${BODY_LABEL[car.body] || ""}</span></div>
          ${own ? `<p class="viewer__desc">${esc(car.long)}</p>
          <dl class="viewer__facts">${facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("")}</dl>
          ${car.img ? `<p class="viewer__credit">Photo : <a href="${esc(car.img.page)}" target="_blank" rel="noopener">${esc(car.img.artist)}</a>, ${esc(car.img.license)}, via Wikimedia Commons</p>` : ""}
          <p class="viewer__owned">${own.count > 1 ? `Tu possèdes ${own.count} exemplaires.` : "Tu possèdes 1 exemplaire."} Obtenue le ${firstSeen}.</p>`
          : `<p class="viewer__desc">Cette carte ${rarityName(car.rarity).toLowerCase()} t'attend dans un booster. Sa fiche complète, avec photo, moteur et performances, se débloquera dès que tu l'auras trouvée.</p>
          <dl class="viewer__facts"><div><dt>Catégorie</dt><dd>${BODY_LABEL[car.body] || "—"}</dd></div><div><dt>Puissance</dt><dd>${fmtNum(car.hp)} ch</dd></div></dl>`}
          <div class="viewer__nav">
            <button class="round" type="button" id="v-prev" aria-label="Carte précédente" ${prev ? "" : "disabled"}>‹</button>
            <span class="viewer__pos">${idx + 1} / ${order.length}</span>
            <button class="round" type="button" id="v-next" aria-label="Carte suivante" ${next ? "" : "disabled"}>›</button>
          </div>
        </div>
      </div>`;
    const wasHidden = v.hidden;
    v.hidden = false;
    document.body.style.overflow = "hidden";
    const card = $(".card", v);
    tilt(card);
    stopSway = idleSway(card);
    const flip = () => {
      card.classList.toggle("is-flipped");
      $("#v-flip").textContent = card.classList.contains("is-flipped") ? "Voir le recto" : "Retourner la carte";
    };
    card.addEventListener("click", flip);
    $("#v-flip").onclick = flip;
    state.fresh.delete(id);
    if (wasHidden) $("#v-close").focus({ preventScroll: true });
    $("#v-close").onclick = closeViewer;
    $("#v-prev").onclick = () => prev && openViewer(prev, order);
    $("#v-next").onclick = () => next && openViewer(next, order);
    v.onclick = (e) => { if (e.target === v) closeViewer(); };
    v.dataset.prev = prev || ""; v.dataset.next = next || "";
    viewerOrder = order;
  }
  function closeViewer() {
    const v = $("#viewer");
    if (v.hidden) return;
    stopSway();
    v.hidden = true;
    v.innerHTML = "";
    document.body.style.overflow = "";
    // retire les badges « Nouvelle » des cartes déjà vues
    $$(".slot[data-id]").forEach((s) => { if (!state.fresh.has(s.dataset.id)) $(".card__badge--new", s)?.remove(); });
  }

  document.addEventListener("keydown", (e) => {
    const v = $("#viewer");
    if (!v.hidden) {
      if (e.key === "Escape") closeViewer();
      else if (e.key === "ArrowLeft" && v.dataset.prev) openViewer(v.dataset.prev, viewerOrder);
      else if (e.key === "ArrowRight" && v.dataset.next) openViewer(v.dataset.next, viewerOrder);
      else if ((e.key === "f" || e.key === " ") && document.activeElement?.id !== "v-flip") { e.preventDefault(); $("#v-flip")?.click(); }
      return;
    }
    if (currentView() === "classeur" && state.me && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === "ArrowLeft") $("#prev")?.click();
      if (e.key === "ArrowRight") $("#next")?.click();
    }
  });

  window.addEventListener("hashchange", () => {
    if (state.pending) applyResult(state.pending); // booster découpé mais quitté avant l'affichage
    state.opening = false;
    closeViewer();
    render();
    window.scrollTo(0, 0);
  });
  $("#logout").addEventListener("click", async () => {
    await api("/api/logout", {}).catch(() => {});
    state.me = null;
    state.authMode = "login";
    state.fresh.clear();
    history.replaceState(null, "", location.pathname);
    render();
  });
  // Au retour sur l'onglet, on met à jour boosters et points
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !state.me || state.opening) return;
    const me = await api("/api/me").catch(() => null);
    if (!me || state.opening) return;
    state.me = me;
    if (currentView() === "boosters" && $("#viewer").hidden) render(); else setTopbar();
  });

  // ───────── Démarrage ─────────
  (async () => {
    app.innerHTML = `<div class="loading">Chargement du garage…</div>`;
    try {
      const cat = await api("/api/catalog");
      state.catalog = cat.cars;
      state.rarities = cat.rarities;
      state.config = cat.config;
      for (const c of cat.cars) state.byId[c.id] = c;
    } catch {
      app.innerHTML = `<div class="loading">Impossible de joindre le serveur. Recharge la page dans un instant.</div>`;
      return;
    }
    try { state.me = await api("/api/me"); } catch { state.me = null; }
    render();
    setTimeout(completePhotos, 1500);
  })();
})();
