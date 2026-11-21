/* ApexPack — booster en 3D temps réel (WebGL 1, sans dépendance)
   Un paquet « coussin » noir brillant, sertis en haut et en bas, logo en foil irisé.
   API : Pack3D.create(canvas, { stack }) -> { setHover, startSpin, moveSpin, endSpin, setCut, open, drop, rect, facingFront, destroy } */
(() => {
  "use strict";

  const W = 1, H = 1.62;                  // dimensions du paquet (unités monde)
  const LINE = 0.17;                       // ligne de découpe : 17 % depuis le haut
  const Y_TOP = H / 2, Y_BOT = -H / 2;
  const Y_LINE = Y_TOP - H * LINE;
  const CRIMP_T = 0.065, CRIMP_B = 0.055;  // hauteur des sertis (fraction de H)
  const PUFF = 0.05;

  // ───── maths ─────
  const m4 = {
    ident: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    mul(a, b) {
      const o = new Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
      return o;
    },
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
      return [t / asp,0,0,0, 0,t,0,0, 0,0,(f + n) * nf,-1, 0,0,2 * f * n * nf,0];
    },
    trans: (x, y, z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
    apply(m, p) {
      const [x, y, z] = p;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
    },
  };

  // ───── géométrie : surface bombée, nulle sur les bords pour fermer le coussin ─────
  function height(u, y) {
    const yb = Y_BOT + H * CRIMP_B, yt = Y_TOP - H * CRIMP_T;
    if (y > yt || y < yb) return 0.004; // sertis : plats
    const t = (y - yb) / (yt - yb);
    return 0.004 + PUFF * Math.pow(Math.sin(Math.PI * u), 0.4) * Math.pow(Math.sin(Math.PI * t), 0.45);
  }
  function buildSection(y0, y1, cols, rows, side) {
    const pos = [], nor = [], uv = [], idx = [];
    const s = side === 0 ? 1 : -1;
    for (let j = 0; j <= rows; j++) {
      const y = y0 + (y1 - y0) * (j / rows);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols, x = -W / 2 + W * u;
        const z = s * height(u, y);
        const e = 0.004;
        const dhdx = (height(Math.min(1, u + e), y) - height(Math.max(0, u - e), y)) / (2 * e * W);
        const dhdy = (height(u, y + e) - height(u, y - e)) / (2 * e);
        // recto : n = (-dh/dx, -dh/dy, 1) ; verso (z = -h) : n = (dh/dx, dh/dy, -1)
        const nx = -s * dhdx, ny = -s * dhdy, nz = s;
        const l = Math.hypot(nx, ny, nz);
        pos.push(x, y, z);
        nor.push(nx / l, ny / l, nz / l);
        // l'arrière est vu en miroir : on inverse u pour que le texte se lise
        uv.push(side === 0 ? u : 1 - u, (y - Y_BOT) / H);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      if (side === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  // ───── textures dessinées (recto, verso, masque foil) ─────
  const LOGO_PATH_OUT = [[12, 3], [22, 20], [2, 20]];
  const LOGO_PATH_IN = [[12, 10], [16.5, 18], [7.5, 18]];
  function drawLogo(ctx, cx, cy, size, fill, lineW) {
    const k = size / 24, ox = cx - 12 * k, oy = cy - 12 * k;
    ctx.lineJoin = "round";
    ctx.beginPath(); LOGO_PATH_OUT.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + x * k, oy + y * k)); ctx.closePath();
    ctx.lineWidth = lineW * k; ctx.strokeStyle = fill; ctx.stroke();
    ctx.beginPath(); LOGO_PATH_IN.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + x * k, oy + y * k)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  function crimps(ctx, w, h) {
    for (const [y0, hh] of [[0, h * CRIMP_T], [h - h * CRIMP_B, h * CRIMP_B]]) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + hh);
      g.addColorStop(0, "#1b1b20"); g.addColorStop(1, "#101013");
      ctx.fillStyle = g; ctx.fillRect(0, y0, w, hh);
      for (let x = 0; x < w; x += 7) { ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(x, y0, 2, hh); }
    }
  }
  function noise(ctx, w, h, a) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  const FONT = '"Geist", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
  function frontTexture(w, h, cards) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#111114"); g.addColorStop(0.5, "#08080a"); g.addColorStop(1, "#111115");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 9);
    crimps(ctx, w, h);
    // ligne de découpe
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(w * 0.04, h * LINE); ctx.lineTo(w * 0.96, h * LINE); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = `500 ${w * 0.026}px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText("Découper ici", w / 2, h * LINE - w * 0.025);
    // fin cadre
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.06, h * (LINE + 0.03), w * 0.88, h * (1 - LINE - 0.03 - CRIMP_B - 0.03));
    // logo et nom
    drawLogo(ctx, w / 2, h * 0.47, w * 0.34, "#f4f4f5", 1.6);
    ctx.fillStyle = "#f4f4f5"; ctx.font = `700 ${w * 0.115}px ${FONT}`;
    ctx.fillText("ApexPack", w / 2, h * 0.64);
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = `500 ${w * 0.036}px ${FONT}`;
    ctx.fillText("Cartes de voitures à collectionner", w / 2, h * 0.685);
    // bas : rareté et nombre de cartes
    const dots = ["#a1a1aa", "#4ade80", "#60a5fa", "#c084fc", "#fbbf24", "#f472b6"];
    dots.forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w * 0.12 + i * w * 0.045, h * 0.885, w * 0.012, 0, Math.PI * 2); ctx.fill(); });
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = `500 ${w * 0.035}px ${FONT}`;
    ctx.fillText("cartes", w * 0.88, h * 0.893);
    const lw = ctx.measureText("cartes").width;
    ctx.fillStyle = "#f4f4f5"; ctx.font = `700 ${w * 0.07}px ${FONT}`;
    ctx.fillText(String(cards), w * 0.88 - lw - w * 0.018, h * 0.895);
    return c;
  }
  function maskTexture(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    drawLogo(ctx, w / 2, h * 0.47, w * 0.34, "#fff", 1.6);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `700 ${w * 0.115}px ${FONT}`;
    ctx.fillText("ApexPack", w / 2, h * 0.64);
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.06, h * (LINE + 0.03), w * 0.88, h * (1 - LINE - 0.03 - CRIMP_B - 0.03));
    return c;
  }
  function backTexture(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 8);
    crimps(ctx, w, h);
    // motif de triangles très discret
    ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.lineWidth = 2;
    for (let y = h * 0.1; y < h * 0.9; y += w * 0.12) for (let x = (Math.round(y / (w * 0.12)) % 2) * w * 0.06; x < w; x += w * 0.12) {
      ctx.beginPath(); ctx.moveTo(x, y - w * 0.035); ctx.lineTo(x + w * 0.035, y + w * 0.025); ctx.lineTo(x - w * 0.035, y + w * 0.025); ctx.closePath(); ctx.stroke();
    }
    drawLogo(ctx, w / 2, h * 0.3, w * 0.14, "rgba(255,255,255,.85)", 1.8);
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `700 ${w * 0.06}px ${FONT}`;
    ctx.fillText("ApexPack", w / 2, h * 0.37);
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = `400 ${w * 0.03}px ${FONT}`;
    ["Chaque booster contient 5 cartes.", "La dernière est au moins Rare.", "Six raretés, de Commune à Mythique."].forEach((t, i) => ctx.fillText(t, w / 2, h * 0.47 + i * w * 0.05));
    // code-barres décoratif
    let x = w * 0.36;
    while (x < w * 0.64) { const bw = 2 + Math.random() * 6; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(x, h * 0.78, bw, h * 0.06); x += bw + 3 + Math.random() * 5; }
    return c;
  }

  // ───── shaders ─────
  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
uniform mat4 uProj, uView, uModel;
uniform float uStrip, uCut, uDir, uFly, uDrop;
varying vec3 vN; varying vec3 vP; varying vec2 vUv; varying vec3 vT;
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
void main(){
  vec3 p = aPos; vec3 n = aNor;
  if (uStrip > .5) {
    // la languette se recourbe derrière la lame
    float blade = uDir > 0. ? (-.5 + uCut) : (.5 - uCut);
    float d = uDir > 0. ? (blade - p.x) : (p.x - blade);
    float k = clamp(d, 0., 1.);
    if (k > 0.) {
      vec3 piv = vec3(blade, ${Y_LINE.toFixed(4)}, 0.);
      mat3 r = rotZ(uDir * k * .22) * rotX(-k * 1.1);
      p = r * (p - piv) + piv; n = r * n;
    }
    if (uFly > 0.) {
      float f = uFly;
      mat3 r = rotZ(uDir * f * 2.6) * rotX(-f * 3.2);
      vec3 c = vec3(0., ${Y_LINE.toFixed(4)} + .07, 0.);
      p = r * (p - c) + c + vec3(uDir * f * .9, f * 1.1 - f * f * 2.6, f * .6);
      n = r * n;
    }
  } else if (uDrop > 0.) {
    p.y -= uDrop * uDrop * 2.4; p.z -= uDrop * .3;
  }
  vec4 w = uModel * vec4(p, 1.);
  vP = w.xyz;
  vN = normalize((uModel * vec4(n, 0.)).xyz);
  vT = normalize((uModel * vec4(1.,0.,0.,0.)).xyz);
  vUv = aUv;
  gl_Position = uProj * uView * w;
}`;
  const FS = `
precision mediump float;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec3 uCam; uniform vec3 uLight; uniform float uTime, uAlpha, uDim, uBack;
varying vec3 vN; varying vec3 vP; varying vec2 vUv; varying vec3 vT;
void main(){
  vec4 tex = texture2D(uTex, vUv);
  float foil = uBack > .5 ? 0. : texture2D(uMask, vUv).r;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float crimp = step(1. - ${CRIMP_T.toFixed(3)}, vUv.y) + step(vUv.y, ${CRIMP_B.toFixed(3)});
  N = normalize(N + vT * sin(vUv.x * 520.) * .45 * crimp);
  vec3 V = normalize(uCam - vP);
  vec3 L = normalize(uLight);
  vec3 Hh = normalize(L + V);
  float diff = max(dot(N, L), 0.);
  float nh = max(dot(N, Hh), 0.);
  float spec = pow(nh, 140.) * 1.6 + pow(nh, 18.) * .18;
  float fres = pow(1. - max(dot(N, V), 0.), 3.);
  vec3 R = reflect(-V, N);
  float env = smoothstep(.35, .9, R.y) * .55 + smoothstep(.7, .98, abs(R.x)) * .3 + smoothstep(.6, 1., -R.y) * .06;
  vec3 irid = .55 + .45 * cos(6.2831 * (vec3(0., .33, .67) + dot(N, V) * 1.8 + vUv.y * 1.2 + vUv.x * .6 + uTime * .04));
  vec3 base = tex.rgb;
  vec3 col = base * (.35 + .65 * diff);
  col += env * mix(vec3(.16), irid * .9, foil);
  col += spec * mix(vec3(1.), irid, foil * .7);
  col += fres * mix(vec3(.18), irid * .5, foil);
  col += foil * irid * .22;
  col *= uDim;
  gl_FragColor = vec4(col, uAlpha);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function create(canvas, opts = {}) {
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    } catch (e) { console.warn("[pack3d]", e.message); return null; }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const A = { pos: gl.getAttribLocation(prog, "aPos"), nor: gl.getAttribLocation(prog, "aNor"), uv: gl.getAttribLocation(prog, "aUv") };
    const U = {};
    for (const n of ["uProj", "uView", "uModel", "uStrip", "uCut", "uDir", "uFly", "uDrop", "uTex", "uMask", "uCam", "uLight", "uTime", "uAlpha", "uDim", "uBack"]) U[n] = gl.getUniformLocation(prog, n);

    const mesh = (g) => {
      const b = (data, target = gl.ARRAY_BUFFER) => { const buf = gl.createBuffer(); gl.bindBuffer(target, buf); gl.bufferData(target, data, gl.STATIC_DRAW); return buf; };
      return { pos: b(g.pos), nor: b(g.nor), uv: b(g.uv), idx: b(g.idx, gl.ELEMENT_ARRAY_BUFFER), n: g.idx.length };
    };
    const ROWS_BODY = 80, ROWS_STRIP = 18, COLS = 56;
    const parts = {
      bodyF: mesh(buildSection(Y_BOT, Y_LINE, COLS, ROWS_BODY, 0)),
      bodyB: mesh(buildSection(Y_BOT, Y_LINE, COLS, ROWS_BODY, 1)),
      stripF: mesh(buildSection(Y_LINE, Y_TOP, COLS, ROWS_STRIP, 0)),
      stripB: mesh(buildSection(Y_LINE, Y_TOP, COLS, ROWS_STRIP, 1)),
    };
    const tex = (cv) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const TW = 512, TH = 1024; // puissances de deux pour les mipmaps
    let tFront = tex(frontTexture(TW, TH, opts.cards || 5)), tBack = tex(backTexture(TW, TH)), tMask = tex(maskTexture(TW, TH));
    // si la police arrive après coup, on redessine les textures
    if (document.fonts?.status !== "loaded") document.fonts?.ready.then(() => {
      if (dead) return;
      gl.deleteTexture(tFront); gl.deleteTexture(tMask);
      tFront = tex(frontTexture(TW, TH, opts.cards || 5)); tMask = tex(maskTexture(TW, TH));
    });

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const st = {
      yaw: 0, pitch: 0, roll: 0, yawVel: 0,
      hoverX: 0, hoverY: 0, curHX: 0, curHY: 0,
      spinning: false, lastSpin: 0, lastX: 0,
      cut: 0, dir: 1, cutting: false,
      fly: -1, drop: -1, t0: performance.now(),
      stack: Math.max(0, Math.min(3, opts.stack || 0)),
    };
    const DIST = 3.7, FOV = 0.56;
    let dead = false, proj, view = m4.trans(0, 0, -DIST);

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      proj = m4.persp(FOV, w / h, 0.1, 30);
    }

    function bind(m) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nor); gl.enableVertexAttribArray(A.nor); gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.enableVertexAttribArray(A.uv); gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    }
    function draw(m, isBack, isStrip) {
      bind(m);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, isBack ? tBack : tFront); gl.uniform1i(U.uTex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tMask); gl.uniform1i(U.uMask, 1);
      gl.uniform1f(U.uBack, isBack ? 1 : 0);
      gl.uniform1f(U.uStrip, isStrip ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
    }

    function modelMatrix(extra = 0) {
      const t = (performance.now() - st.t0) / 1000;
      const idle = reduce || st.cutting || st.fly >= 0 ? 0 : 1;
      const bob = Math.sin(t * 1.3) * 0.03 * idle;
      let m = m4.trans(0, bob, 0);
      m = m4.mul(m, m4.ry(st.yaw + st.curHX * 0.55 + Math.sin(t * 0.7) * 0.06 * idle));
      m = m4.mul(m, m4.rx(st.pitch + st.curHY * 0.4 + Math.sin(t * 0.9) * 0.03 * idle));
      m = m4.mul(m, m4.rz(st.roll + Math.sin(t * 0.5) * 0.015 * idle));
      if (extra) m = m4.mul(m, m4.mul(m4.trans(extra * 0.07, extra * 0.05, -extra * 0.09), m4.rz(extra * 0.05)));
      return m;
    }

    function frame() {
      if (dead) return;
      if (!canvas.isConnected) { destroy(); return; }
      resize();
      if (!proj) { requestAnimationFrame(frame); return; }
      const now = performance.now();
      const dt = Math.min(4, (now - (st.last || now)) / 16.67); // en « images à 60 i/s », borné
      st.last = now;
      const ease = (k) => 1 - Math.pow(1 - k, dt);
      // physique de rotation (indépendante de la cadence d'affichage)
      if (!st.spinning) {
        st.yaw += st.yawVel * dt;
        st.yawVel *= Math.pow(0.92, dt);
        if ((Math.abs(st.yawVel) < 0.004 && now - st.lastSpin > 700) || st.cutting) {
          st.yawVel = st.cutting ? 0 : st.yawVel;
          const target = Math.round(st.yaw / (Math.PI * 2)) * Math.PI * 2; // revient de face
          st.yaw += (target - st.yaw) * ease(st.cutting ? 0.25 : 0.07);
        }
      }
      st.pitch += (0 - st.pitch) * ease(0.08);
      const hx = st.cutting ? 0 : st.hoverX, hy = st.cutting ? 0 : st.hoverY;
      st.curHX += (hx - st.curHX) * ease(0.08); st.curHY += (hy - st.curHY) * ease(0.08);
      if (st.fly >= 0) st.fly = Math.min(1, st.fly + dt / 55);
      if (st.drop >= 0) st.drop = Math.min(1, st.drop + dt / 40);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniformMatrix4fv(U.uView, false, view);
      gl.uniform3f(U.uCam, 0, 0, DIST);
      const t = (now - st.t0) / 1000;
      gl.uniform3f(U.uLight, 0.6 + st.curHX * 1.2, 1.0 - st.curHY * 0.8, 1.4);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uCut, st.cut);
      gl.uniform1f(U.uDir, st.dir);
      gl.uniform1f(U.uFly, Math.max(0, st.fly));

      // paquets en réserve derrière
      const dropA = st.drop >= 0 ? 1 - st.drop : 1;
      for (let k = st.stack; k >= 1; k--) {
        gl.uniformMatrix4fv(U.uModel, false, modelMatrix(k));
        gl.uniform1f(U.uDim, 0.55 - k * 0.1);
        gl.uniform1f(U.uAlpha, st.fly >= 0 ? Math.max(0, 1 - st.fly * 2) : 1);
        gl.uniform1f(U.uDrop, 0);
        draw(parts.bodyF, false, false); draw(parts.bodyB, true, false);
        draw(parts.stripF, false, false); draw(parts.stripB, true, false);
      }
      const M = modelMatrix(0);
      gl.uniformMatrix4fv(U.uModel, false, M);
      gl.uniform1f(U.uDim, 1);
      gl.uniform1f(U.uDrop, Math.max(0, st.drop));
      gl.uniform1f(U.uAlpha, dropA);
      draw(parts.bodyF, false, false); draw(parts.bodyB, true, false);
      gl.uniform1f(U.uDrop, 0);
      gl.uniform1f(U.uAlpha, st.fly >= 0 ? Math.max(0, 1 - st.fly * 1.3) : 1);
      draw(parts.stripF, false, true); draw(parts.stripB, true, true);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function destroy() {
      dead = true;
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    }

    return {
      setHover(x, y) { st.hoverX = x; st.hoverY = y; },
      startSpin(x) { st.spinning = true; st.lastX = x; st.yawVel = 0; },
      moveSpin(x) {
        const dx = x - st.lastX; st.lastX = x;
        st.yaw += dx * 0.012; st.yawVel = dx * 0.012; st.lastSpin = performance.now();
      },
      endSpin() { st.spinning = false; st.lastSpin = performance.now(); },
      setCut(v, dir) { st.cutting = true; st.yawVel = 0; st.cut = v; st.dir = dir; },
      open() { st.cut = 1; st.fly = 0; },
      drop() { st.drop = 0; },
      facingFront() {
        const tau = Math.PI * 2, a = (((st.yaw % tau) + tau * 1.5) % tau) - Math.PI;
        return Math.abs(a) < 0.6 && !st.spinning;
      },
      // rectangle du paquet (de face) à l'écran, en pixels CSS relatifs au canvas
      rect() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const P = m4.mul(m4.persp(FOV, w / h, 0.1, 30), view);
        const a = m4.apply(P, [-W / 2, Y_TOP, 0]), b = m4.apply(P, [W / 2, Y_BOT, 0]);
        const sx = (v) => (v * 0.5 + 0.5) * w, sy = (v) => (1 - (v * 0.5 + 0.5)) * h;
        return { left: sx(a[0]), top: sy(a[1]), width: sx(b[0]) - sx(a[0]), height: sy(b[1]) - sy(a[1]) };
      },
      line: LINE,
      destroy,
    };
  }

  window.Pack3D = { create };
})();
