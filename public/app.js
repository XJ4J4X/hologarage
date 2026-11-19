/* HoloGarage — front */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#app");
  const PER_PAGE = 9;
  const RARITY_VAR = ["", "--r1", "--r2", "--r3", "--r4", "--r5", "--r6"];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    catalog: null, byId: {}, rarities: [], config: {},
    me: null,
    authMode: "register",
    binder: { spread: 0, sort: localStorage.getItem("hg_sort") || "num" },
    fresh: new Set(),
    opening: false,
  };

  // ───────── API ─────────
  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error(data.error || "Erreur réseau"), { status: res.status, data });
    return data;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rarityName = (r) => state.rarities.find((x) => x.id === r)?.name || "";
  const pad = (n) => String(n).padStart(3, "0");
  const fmtNum = (n) => n.toLocaleString("fr-FR");

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
    const wheel = (x) => `<circle cx="${x}" cy="${cy}" r="${r}" fill="${locked ? "#1b2538" : "#12161d"}"/>` +
      (locked ? "" : `<circle cx="${x}" cy="${cy}" r="${r * 0.58}" fill="url(#${id}m)"/><circle cx="${x}" cy="${cy}" r="${r * 0.16}" fill="#1a1f28"/>`);
    if (locked) {
      return `<svg class="${cls}" viewBox="0 0 240 92" aria-hidden="true"><path d="${d}" fill="#1b2538" stroke="#34405a" stroke-width="1.5"/>${wheel(xr)}${wheel(xf)}</svg>`;
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

  // ───────── Carte ─────────
  function cardHTML(car, { locked = false, count = 0, isNew = false } = {}) {
    const pips = "<i></i>".repeat(car.rarity);
    const long = car.model.length > 13 ? " is-long" : "";
    const photo = !locked && car.img ? `<img class="card__photo" src="${esc(car.img.src)}" alt="${esc(car.brand + " " + car.model)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.parentNode.classList.remove('has-photo');this.remove()"><span class="card__credit">© ${esc(car.img.artist)} · ${esc(car.img.license)}</span>` : "";
    const badge = isNew ? `<span class="card__badge card__badge--new">Nouvelle</span>` : count > 1 ? `<span class="card__badge">×${count}</span>` : "";
    return `<div class="card r${car.rarity}${locked ? " is-locked" : ""}" data-id="${car.id}">
      <div class="card__tilt"><div class="card__face">
        <div class="card__frame">
          <header class="card__head"><span class="card__brand">${locked ? "Non obtenue" : esc(car.brand)}</span><span class="card__pips" aria-label="${rarityName(car.rarity)}">${pips}</span></header>
          <h3 class="card__model${long}">${locked ? "???" : esc(car.model)}</h3>
          <div class="card__art${photo ? " has-photo" : ""}">${locked ? "" : `<span class="card__mark">${esc(car.brand)}</span>`}${carSVG(car, locked)}${photo}</div>
          <dl class="card__stats">
            <div><dt>Année</dt><dd>${locked ? "—" : car.year}</dd></div>
            <div><dt>Puissance</dt><dd>${locked ? "—" : fmtNum(car.hp) + " ch"}</dd></div>
            <div><dt>Origine</dt><dd>${locked ? "—" : esc(car.country)}</dd></div>
          </dl>
          <p class="card__desc">${locked ? "Trouve cette carte dans un booster pour découvrir le modèle." : esc(car.desc)}</p>
          <footer class="card__foot"><span>#${pad(car.num)} / ${state.catalog.length}</span><b>${rarityName(car.rarity)}</b></footer>
        </div>
        <div class="card__holo"></div><div class="card__sparkle"></div><div class="card__glare"></div>
      </div></div>${badge}
    </div>`;
  }

  // Inclinaison 3D + reflets qui suivent le pointeur
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
  function setTopbar() {
    const logged = !!state.me;
    $(".topbar").hidden = !logged;
    if (!logged) return;
    $("#who").textContent = state.me.pseudo;
    const owned = Object.keys(state.me.collection).length;
    $("#progress").textContent = `${owned} / ${state.catalog.length} modèles`;
    const view = currentView();
    $$(".tabs a").forEach((a) => { if (a.dataset.view !== view) a.removeAttribute("aria-current"); else a.setAttribute("aria-current", "page"); });
  }
  function currentView() {
    const h = location.hash.replace("#", "");
    return h === "classeur" ? "classeur" : "boosters";
  }
  function render() {
    clearInterval(render.timer);
    if (!state.me) return renderAuth();
    setTopbar();
    if (currentView() === "classeur") renderBinder();
    else renderPacks();
  }

  // ───────── Connexion / inscription ─────────
  function renderAuth() {
    setTopbar();
    const pick = (r) => { const l = state.catalog.filter((c) => c.rarity === r); return l[hash(String(new Date().getDate()) + r) % l.length]; };
    const show = [pick(4), pick(6), pick(5)];
    const reg = state.authMode === "register";
    app.innerHTML = `<section class="auth">
      <div class="auth__show">
        <h1 class="auth__title">Holo<span>Garage</span></h1>
        <div class="fan">${show.map((c) => cardHTML(c)).join("")}</div>
        <p class="auth__lede">${state.catalog.length} voitures à collectionner, de la Clio à la McLaren F1. Ouvre tes boosters, fais briller les cartes rares et range-les dans ton classeur.</p>
      </div>
      <div class="auth__panel">
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
          <button class="btn" type="submit">${reg ? `Créer mon compte et recevoir ${state.config.startPacks} boosters` : "Se connecter"}</button>
        </form>
      </div>
    </section>`;
    $$(".fan .card").forEach((c) => tilt(c));
    $$(".seg button").forEach((b) => b.addEventListener("click", () => { state.authMode = b.dataset.mode; renderAuth(); $("#pseudo").focus(); }));
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
          <div class="pack__brand">Holo<span>Garage</span></div>
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
  function renderPacks() {
    const me = state.me;
    const cfg = state.config;
    const deadline = me.nextPackIn != null ? Date.now() + me.nextPackIn : null;
    const total = state.rarities.reduce((s, r) => s + r.weight, 0);
    const every = cfg.packInterval >= 3600000 ? `${Math.round(cfg.packInterval / 3600000)} h` : `${Math.round(cfg.packInterval / 60000)} min`;
    app.innerHTML = `<section class="page">
      <div class="packs">
        <div class="stage" id="stage">
          ${me.packs > 0 ? packHTML(me.packs) : `<p class="pack-empty"><strong>Plus de booster pour l'instant</strong>De nouveaux boosters arrivent automatiquement. Va admirer ta collection en attendant.</p>`}
          ${me.packs > 0 ? `<button class="btn-ghost pack-auto" type="button" id="auto-open">Ouvrir sans découper</button>` : ""}
          <div class="reveal" id="reveal"></div>
        </div>
        <aside class="side">
          <div>
            <div class="counter"><b id="pack-count">${me.packs}</b><span>${packWord(me.packs)} prêt${me.packs > 1 ? "s" : ""} à ouvrir</span></div>
            <p class="timer" id="timer">${deadline ? `+${cfg.packsPerTick} ${packWord(cfg.packsPerTick)} dans <b>${fmtDuration(deadline - Date.now())}</b>` : `Réserve pleine (${cfg.maxPacks}) : ouvre un booster pour relancer la recharge.`}</p>
          </div>
          <div>
            <p class="odds-title">Chances par carte</p>
            <ul class="odds">${state.rarities.slice().reverse().map((r) => `<li style="--c:var(${RARITY_VAR[r.id]})">${r.name}<span>${(r.weight / total * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</span></li>`).join("")}</ul>
            <p class="odds-note">La 5ᵉ carte de chaque booster est au moins Rare. Tu reçois ${cfg.packsPerTick} ${packWord(cfg.packsPerTick)} gratuits toutes les ${every}, jusqu'à ${cfg.maxPacks} en réserve.</p>
          </div>
        </aside>
      </div>
    </section>`;

    if (deadline) {
      render.timer = setInterval(async () => {
        const left = deadline - Date.now();
        const t = $("#timer b");
        if (t) t.textContent = fmtDuration(left);
        if (left <= 0) {
          clearInterval(render.timer);
          state.me = await api("/api/me").catch(() => state.me);
          if (!state.opening) render();
        }
      }, 1000);
    }
    const pack = $("#pack");
    if (pack) {
      tilt(pack, { strength: 0.8 });
      setupCutting(pack);
    }
  }

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
      $("#auto-open")?.remove();
      if (!request) request = fetchPack();
      const result = await request;
      if (!result) return;
      setTimeout(() => revealPack(pack, result), reduceMotion ? 0 : 350);
    }
  }

  async function fetchPack() {
    state.opening = true;
    try {
      return await api("/api/packs/open", {});
    } catch (e) {
      state.opening = false;
      toast(e.message);
      state.me = await api("/api/me").catch(() => state.me);
      render();
      return null;
    }
  }

  function revealPack(pack, result) {
    clearInterval(render.timer);
    // mise à jour locale de la collection
    const before = new Set(Object.keys(state.me.collection));
    const newOnes = new Set();
    for (const id of result.cards) {
      const c = state.me.collection[id];
      if (c) c.count++;
      else { state.me.collection[id] = { count: 1, first: Date.now() }; if (!before.has(id)) newOnes.add(id); }
    }
    newOnes.forEach((id) => state.fresh.add(id));
    state.me.packs = result.packs;
    state.me.nextPackIn = result.nextPackIn;
    state.me.opened++;
    setTopbar();
    $("#pack-count").textContent = result.packs;

    pack.classList.add("is-gone");
    const reveal = $("#reveal");
    const cards = result.cards.map((id) => state.byId[id]);
    reveal.innerHTML = `<div class="reveal__row">` + cards.map((car, i) => `<button class="flip${car.rarity >= 4 ? " is-hot" : ""}" type="button" style="--i:${i};--hc:var(${RARITY_VAR[car.rarity]})" data-id="${car.id}" aria-label="Retourner la carte ${i + 1}">
        <div class="flip__inner">
          <div class="flip__back"><div class="cardback"><div>Holo<span>Garage</span></div></div></div>
          <div class="flip__front"><div class="burst"></div>${cardHTML(car, { isNew: newOnes.has(car.id) })}</div>
        </div>
      </button>`).join("") + `</div>` +
      `<div class="reveal-actions" id="reveal-actions">
        <button class="btn btn--light" type="button" id="reveal-all">Tout retourner</button>
      </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => reveal.classList.add("is-live")));

    const flips = $$(".flip", reveal);
    const done = () => {
      if (flips.every((f) => f.classList.contains("is-flipped"))) {
        const best = cards.reduce((a, c) => (c.rarity > a.rarity ? c : a), cards[0]);
        $("#reveal-actions").innerHTML = `
          ${state.me.packs > 0 ? `<button class="btn" type="button" id="again">Ouvrir le booster suivant</button>` : ""}
          <button class="btn btn--light" type="button" id="to-binder">Voir dans le classeur</button>`;
        $("#again")?.addEventListener("click", () => { state.opening = false; render(); });
        $("#to-binder").addEventListener("click", () => { state.opening = false; goToCard(best.id); });
      }
    };
    flips.forEach((f) => {
      const card = $(".card", f);
      tilt(f, { target: card, strength: 0.7 });
      f.addEventListener("click", () => {
        if (!f.classList.contains("is-flipped")) { f.classList.add("is-flipped"); f.classList.remove("is-hot"); done(); }
        else openViewer(f.dataset.id, cards.map((c) => c.id));
      });
    });
    $("#reveal-all").addEventListener("click", () => {
      flips.forEach((f, i) => setTimeout(() => { f.classList.add("is-flipped"); f.classList.remove("is-hot"); if (i === flips.length - 1) done(); }, i * 160));
    });
  }

  // ───────── Classeur 3D ─────────
  function sortedCars() {
    const list = state.catalog.slice();
    const s = state.binder.sort;
    if (s === "rarity") list.sort((a, b) => b.rarity - a.rarity || a.num - b.num);
    else if (s === "brand") list.sort((a, b) => a.brand.localeCompare(b.brand, "fr") || a.year - b.year);
    else if (s === "year") list.sort((a, b) => a.year - b.year || a.num - b.num);
    return list;
  }
  function goToCard(id) {
    const idx = sortedCars().findIndex((c) => c.id === id);
    const page = Math.floor(idx / PER_PAGE) + 1; // pages numérotées à partir de 1
    // page impaire = verso (gauche) de la feuille (page-1)/2 → planche (page+1)/2 ; page paire = recto de la feuille page/2 → planche page/2
    state.binder.spread = page % 2 ? (page + 1) / 2 : page / 2;
    state.binder.highlight = id;
    if (location.hash !== "#classeur") location.hash = "#classeur";
    else render();
  }

  function renderBinder() {
    const me = state.me;
    const list = sortedCars();
    const pages = Math.ceil(list.length / PER_PAGE);
    const leaves = Math.ceil((pages + 1) / 2); // feuille 0 : couverture au recto, page 1 au verso
    const spreads = leaves; // planche k : feuilles < k tournées
    const b = state.binder;
    b.spread = Math.max(0, Math.min(spreads, b.spread));
    const owned = Object.keys(me.collection).length;
    const counts = state.rarities.map((r) => {
      const all = state.catalog.filter((c) => c.rarity === r.id);
      return { r, have: all.filter((c) => me.collection[c.id]).length, all: all.length };
    });

    const pageHTML = (n) => {
      if (n > pages) return `<div class="inside">${owned === state.catalog.length ? "Collection complète. Chapeau !" : `Encore ${state.catalog.length - owned} cartes à trouver.`}</div>`;
      const slice = list.slice((n - 1) * PER_PAGE, n * PER_PAGE);
      const slots = slice.map((car) => {
        const own = me.collection[car.id];
        return `<button class="slot" type="button" data-id="${car.id}" aria-label="${own ? esc(car.brand + " " + car.model) : "Carte non obtenue n°" + car.num}">${cardHTML(car, { locked: !own, count: own?.count || 0, isNew: state.fresh.has(car.id) })}</button>`;
      }).join("") + `<div class="slot slot--empty"></div>`.repeat(PER_PAGE - slice.length);
      const have = slice.filter((c) => me.collection[c.id]).length;
      return `<div class="sheet__grid">${slots}</div><div class="sheet__foot"><span>Page ${n}</span><span>${have} / ${slice.length}</span></div>`;
    };

    let leavesHTML = "";
    for (let i = 0; i < leaves; i++) {
      const front = i === 0
        ? `<div class="leaf__side cover"><h2 class="cover__title">Holo<span>Garage</span></h2><div class="cover__owner">Classeur de<b>${esc(me.pseudo)}</b>${owned} / ${state.catalog.length} cartes</div><button class="btn" type="button" data-open>Ouvrir le classeur</button></div>`
        : `<div class="leaf__side sheet">${pageHTML(i * 2)}</div>`;
      const back = `<div class="leaf__side leaf__side--back sheet">${pageHTML(i * 2 + 1)}</div>`;
      leavesHTML += `<div class="leaf${i < b.spread ? " is-flipped" : ""}" data-leaf="${i}" style="--z:${i < b.spread ? i + 1 : leaves - i}">${front}${back}</div>`;
    }

    const sorts = [["num", "Ordre du catalogue"], ["rarity", "Rareté"], ["brand", "Marque"], ["year", "Année"]];
    app.innerHTML = `<section class="page">
      <div class="binder-head">
        <div>
          <h1 class="page__title">Mon classeur</h1>
          <p class="page__sub">${owned} modèles sur ${state.catalog.length} · ${me.opened} booster${me.opened > 1 ? "s" : ""} ouvert${me.opened > 1 ? "s" : ""}</p>
          <div class="progressbar" aria-hidden="true"><i style="width:${(owned / state.catalog.length) * 100}%"></i></div>
        </div>
        <div style="display:grid;gap:12px;justify-items:end">
          <div class="chips">${counts.map(({ r, have, all }) => `<span class="chip" style="--c:var(${RARITY_VAR[r.id]})"><b>${have}/${all}</b> ${r.name}</span>`).join("")}</div>
          <label>Trier par <select class="select" id="sort">${sorts.map(([v, l]) => `<option value="${v}"${b.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
      </div>
      <div class="book-wrap">
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
      </div>
    </section>`;

    const book = $("#book");
    const leafEls = $$(".leaf", book);
    const update = () => {
      book.classList.toggle("is-closed", b.spread === 0);
      book.classList.toggle("is-end", b.spread === spreads);
      $("#prev").disabled = b.spread === 0;
      $("#next").disabled = b.spread === spreads;
      const l = b.spread * 2 - 1, r = b.spread * 2;
      $("#where").textContent = b.spread === 0 ? "Couverture" : r > pages ? `Page ${l} sur ${pages}` : `Pages ${l}–${r} sur ${pages}`;
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
          leaf.classList.add("is-turning");
          leaf.style.zIndex = 999 - Math.abs(i - (forward ? from : k));
          leaf.classList.toggle("is-flipped", should);
          setTimeout(() => {
            leaf.classList.remove("is-turning");
            leaf.style.zIndex = "";
            leaf.style.setProperty("--z", should ? i + 1 : leaves - i);
          }, 1000);
        }
      });
      update();
    };
    update();
    $("#prev").addEventListener("click", () => go(b.spread - 1));
    $("#next").addEventListener("click", () => go(b.spread + 1));
    $("[data-open]", book)?.addEventListener("click", (e) => { e.stopPropagation(); go(1); });
    $("#sort").addEventListener("change", (e) => { b.sort = e.target.value; localStorage.setItem("hg_sort", b.sort); b.spread = Math.min(b.spread, 1) || 1; renderBinder(); });

    // glisser pour tourner les pages (mobile)
    let sx = null;
    book.addEventListener("pointerdown", (e) => { sx = e.clientX; });
    book.addEventListener("pointerup", (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 60) { book.dataset.swiped = "1"; go(b.spread + (dx < 0 ? 1 : -1)); setTimeout(() => delete book.dataset.swiped, 50); }
    });

    $$(".slot[data-id]", book).forEach((s) => {
      const card = $(".card", s);
      s.addEventListener("pointermove", (e) => {
        const r = s.getBoundingClientRect();
        card.style.setProperty("--px", ((e.clientX - r.left) / r.width).toFixed(3));
        card.style.setProperty("--py", ((e.clientY - r.top) / r.height).toFixed(3));
      });
      s.addEventListener("click", () => { if (!book.dataset.swiped) openViewer(s.dataset.id, list.map((c) => c.id)); });
    });

    if (b.highlight) {
      const el = $(`.slot[data-id="${b.highlight}"] .card`, book);
      b.highlight = null;
      if (el) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 900, delay: 400, easing: "ease-out" });
    }
  }

  // ───────── Visionneuse ─────────
  let stopSway = () => {};
  function openViewer(id, order) {
    const v = $("#viewer");
    const car = state.byId[id];
    const own = state.me?.collection[id];
    const idx = order.indexOf(id);
    const prev = order[idx - 1], next = order[idx + 1];
    stopSway();
    const firstSeen = own ? new Date(own.first).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
    v.innerHTML = `<button class="round viewer__close" type="button" id="v-close" aria-label="Fermer">✕</button>
      <div class="viewer__box">
        ${cardHTML(car, { locked: !own })}
        <div class="viewer__info">
          ${own ? `<p class="viewer__brand">${esc(car.brand)}</p><h2 id="viewer-title">${esc(car.model)}</h2>` : `<p class="viewer__brand">Carte n°${car.num}</p><h2 id="viewer-title">Non obtenue</h2>`}
          <div class="viewer__rarity" style="--c:var(${RARITY_VAR[car.rarity]})">${rarityName(car.rarity)}</div>
          ${own ? `<p class="viewer__desc">${esc(car.desc)}</p>
          <dl class="viewer__facts"><div><dt>Année</dt><dd>${car.year}</dd></div><div><dt>Puissance</dt><dd>${fmtNum(car.hp)} ch</dd></div><div><dt>Origine</dt><dd>${esc(car.country)}</dd></div></dl>
          ${car.img ? `<p class="viewer__credit">Photo : <a href="${esc(car.img.page)}" target="_blank" rel="noopener">${esc(car.img.artist)}</a>, ${esc(car.img.license)}, via Wikimedia Commons</p>` : ""}
          <p class="viewer__owned">${own.count > 1 ? `Tu possèdes ${own.count} exemplaires.` : "Tu possèdes 1 exemplaire."} Obtenue le ${firstSeen}.</p>`
          : `<p class="viewer__desc">Cette carte t'attend dans un booster. Plus elle est rare, plus elle brille.</p>`}
          <div class="viewer__nav">
            <button class="round" type="button" id="v-prev" aria-label="Carte précédente" ${prev ? "" : "disabled"}>‹</button>
            <button class="round" type="button" id="v-next" aria-label="Carte suivante" ${next ? "" : "disabled"}>›</button>
          </div>
        </div>
      </div>`;
    v.hidden = false;
    document.body.style.overflow = "hidden";
    const card = $(".card", v);
    tilt(card);
    stopSway = idleSway(card);
    state.fresh.delete(id);
    $("#v-close").focus({ preventScroll: true });
    $("#v-close").onclick = closeViewer;
    $("#v-prev").onclick = () => prev && openViewer(prev, order);
    $("#v-next").onclick = () => next && openViewer(next, order);
    v.onclick = (e) => { if (e.target === v) closeViewer(); };
    v.dataset.prev = prev || ""; v.dataset.next = next || "";
    viewerOrder = order;
  }
  let viewerOrder = [];
  function closeViewer() {
    const v = $("#viewer");
    if (v.hidden) return;
    stopSway();
    v.hidden = true;
    v.innerHTML = "";
    document.body.style.overflow = "";
    // rafraîchit les badges « Nouvelle » du classeur
    if (currentView() === "classeur" && !state.opening) {
      $$(".slot[data-id]").forEach((s) => { if (!state.fresh.has(s.dataset.id)) $(".card__badge--new", s)?.remove(); });
    }
  }

  document.addEventListener("keydown", (e) => {
    const v = $("#viewer");
    if (!v.hidden) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft" && v.dataset.prev) openViewer(v.dataset.prev, viewerOrder);
      if (e.key === "ArrowRight" && v.dataset.next) openViewer(v.dataset.next, viewerOrder);
      return;
    }
    if (currentView() === "classeur" && state.me && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === "ArrowLeft") $("#prev")?.click();
      if (e.key === "ArrowRight") $("#next")?.click();
    }
  });

  window.addEventListener("hashchange", () => { state.opening = false; closeViewer(); render(); window.scrollTo(0, 0); });
  $("#logout").addEventListener("click", async () => {
    await api("/api/logout", {}).catch(() => {});
    state.me = null;
    state.authMode = "login";
    history.replaceState(null, "", location.pathname);
    render();
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
  })();
})();
