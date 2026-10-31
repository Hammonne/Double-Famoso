/* FACE_SEARCH.EXE: frontend estático del Lab 11 (pgvector).
   Lee window.LAB_DATA (data.js). Ver README.md para el formato. */
(() => {
  "use strict";
  const D = window.LAB_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // ░░ Utilidades ░░
  function hash(str) {
    let h = 2166136261;
    for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmt = (x, d = 2) => Number(x).toFixed(d);
  const nice = (name) => String(name).replace(/_/g, " ");

  // ░░ Avatares pixel 8×8 (no se usan fotos reales) ░░
  const SKIN = ["#ffe0c7", "#f6c9a4", "#e0a77e", "#b97a52", "#8a5638", "#ffd9e6"];
  const HAIR = ["#1b1b3a", "#5a3a2a", "#c98a3a", "#f3d46b", "#ff8fc8", "#7f9be6", "#9a6ad6", "#e6e4f0"];
  const SHIRT = ["#ff6fb5", "#3f7bff", "#6fbf4a", "#ffe066", "#a9b8f0", "#f7a8d8"];
  const HAIRSTYLES = [
    ["11111111", "11111111", "10000001", "10000001"],
    ["01111110", "11111111", "11000011", "10000001"],
    ["00111100", "01111110", "10000001", "00000000"],
    ["11111111", "11011011", "10000001", "10000001"],
    ["01111110", "11111111", "10000000", "10000000"],
  ];
  function drawAvatar(canvas, name) {
    const r = rng(hash(name));
    const pick = (a) => a[Math.floor(r() * a.length)];
    const skin = pick(SKIN), hair = pick(HAIR), shirt = pick(SHIRT), style = pick(HAIRSTYLES);
    const g = canvas.getContext("2d");
    g.fillStyle = "#fffdf7"; g.fillRect(0, 0, 8, 8);
    g.fillStyle = skin; g.fillRect(1, 1, 6, 6);
    g.fillStyle = shirt; g.fillRect(1, 7, 6, 1);
    style.forEach((row, y) => [...row].forEach((c, x) => { if (c === "1") { g.fillStyle = hair; g.fillRect(x, y, 1, 1); } }));
    g.fillStyle = "#1b1b3a"; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1);
    if (r() > 0.4) { g.fillStyle = "#ff9ec9"; g.fillRect(1, 4, 1, 1); g.fillRect(6, 4, 1, 1); }
    g.fillStyle = r() > 0.5 ? "#c0395e" : "#1b1b3a"; g.fillRect(3, 5, 2, 1);
  }
  // Foto real de LFW si el dato trae "img"; si no, avatar pixel de respaldo
  function face(obj, name, cls = "avatar") {
    if (obj && obj.img) {
      const im = new Image();
      im.src = obj.img; im.className = cls; im.alt = name; im.loading = "lazy"; im.decoding = "async";
      return im;
    }
    return avatar(name, cls);
  }
  function avatar(name, cls = "avatar") {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 8; c.className = cls;
    c.setAttribute("aria-hidden", "true");
    drawAvatar(c, name);
    return c;
  }

  // ░░ Flores del paisaje ░░
  (function flowers() {
    const g = $(".flowers"), r = rng(7);
    let s = "";
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * 316), y = 128 + Math.floor(r() * 48);
      s += `M${x} ${y}h2v2h-2zM${x - 1} ${y + 1}h1v1h-1zM${x + 2} ${y + 1}h1v1h-1z`;
    }
    g.innerHTML = `<path d="${s}"/>`;
  })();

  // ░░ Pantalla de carga ░░
  const startBtn = $("#startBtn");
  (function boot() {
    const fill = $(".loadbar-fill");
    let p = 0;
    const tick = () => {
      p = Math.min(100, p + 7 + Math.random() * 12);
      fill.style.width = p + "%";
      if (p < 100) setTimeout(tick, reduced ? 0 : 110);
      else { startBtn.disabled = false; startBtn.focus(); $(".boot-label").textContent = "READY!"; }
    };
    tick();
  })();
  function startDesktop() {
    $("#boot")?.remove();
    $("#desktop").hidden = false;
    if (D.meta.example) $("#exampleFlag").hidden = false;
    openWin("readme");
    openWin("finder");
    // atajo: index.html#start=recall,scale abre además esas ventanas
    const extra = (location.hash.match(/start=([\w,]+)/) || [])[1];
    extra?.split(",").forEach((id) => WIN_META[id] && openWin(id));
    // atajo: #start&m=ivf&i=0 abre Face Finder en IVFFlat con el primer parámetro
    const m = (location.hash.match(/[&#]m=(ivf|hnsw)/) || [])[1];
    if (/[&#]tab=hnsw/.test(location.hash) && opened.has("howto")) { $('.tab[data-tab="hnsw"]').click(); setTimeout(() => $("#hnswRun").click(), 300); }
    if (m) {
      const i = +((location.hash.match(/[&#]i=(\d+)/) || [])[1] || 0);
      state.idx[m] = Math.min(i, params[m].length - 1);
      $(`input[name=method][value=${m}]`).click();
    }
  }
  startBtn.addEventListener("click", startDesktop);
  if (location.hash.startsWith("#start")) setTimeout(startDesktop, 0);

  // ░░ Gestor de ventanas ░░
  const WIN_META = {
    finder: { name: "Face Finder", ico: "ico-folder", pos: [130, 20] },
    recall: { name: "Recall vs Latencia", ico: "ico-target", pos: [200, 60] },
    scale: { name: "Escalabilidad", ico: "ico-pc", pos: [240, 90] },
    howto: { name: "Cómo funciona", ico: "ico-note", pos: [170, 40] },
    twin: { name: "Doble famoso", ico: "ico-heart", pos: [320, 120] },
    cam: { name: "Cámara en vivo", ico: "ico-camera", pos: [150, 24] },
    upload: { name: "Subir foto", ico: "ico-upload", pos: [260, 60] },
    readme: { name: "LEEME.TXT", ico: "ico-floppy", pos: [9999, 30] },
  };
  let z = 10;
  const opened = new Set();
  const isMobile = () => matchMedia("(max-width: 720px)").matches;

  function focusWin(w) {
    w.style.zIndex = ++z;
    $$(".task").forEach((t) => t.classList.toggle("active", t.dataset.win === w.dataset.win));
  }
  function openWin(id) {
    const w = $(`.win[data-win="${id}"]`);
    w.hidden = false;
    if (!opened.has(id)) {
      const [x, y] = WIN_META[id].pos;
      const maxX = Math.max(8, innerWidth - w.offsetWidth - 16);
      w.style.left = Math.min(x, maxX) + "px";
      w.style.top = y + "px";
      opened.add(id);
      addTask(id);
      INIT[id]?.();
    }
    focusWin(w);
    if (isMobile()) w.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }
  function closeWin(id) {
    const w = $(`.win[data-win="${id}"]`);
    w.hidden = true;
    opened.delete(id);
    $(`.task[data-win="${id}"]`)?.remove();
  }
  function addTask(id) {
    const b = document.createElement("button");
    b.className = "task"; b.dataset.win = id;
    b.innerHTML = `<span class="ico ${WIN_META[id].ico}" style="width:18px;height:18px"></span>${WIN_META[id].name}`;
    b.addEventListener("click", () => {
      const w = $(`.win[data-win="${id}"]`);
      if (!w.hidden && +w.style.zIndex === z) w.hidden = true;
      else { w.hidden = false; focusWin(w); }
    });
    $("#tasks").append(b);
  }

  $$(".win").forEach((w) => {
    const id = w.dataset.win;
    w.addEventListener("pointerdown", () => focusWin(w));
    $$(".close, .close-btn", w).forEach((b) => b.addEventListener("click", () => closeWin(id)));
    $(".min", w)?.addEventListener("click", () => { w.hidden = true; });
    const bar = $(".titlebar", w);
    bar.addEventListener("pointerdown", (e) => {
      if (isMobile() || e.target.closest("button")) return;
      const sx = e.clientX - w.offsetLeft, sy = e.clientY - w.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        w.style.left = Math.max(-w.offsetWidth + 80, Math.min(innerWidth - 80, ev.clientX - sx)) + "px";
        w.style.top = Math.max(0, Math.min(innerHeight - 90, ev.clientY - sy)) + "px";
      };
      const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
  });
  $$("[data-open]").forEach((b) => b.addEventListener("click", () => openWin(b.dataset.open)));

  // Menú Inicio
  const smBtn = $("#startMenuBtn"), sm = $("#startMenu");
  $("ul", sm).innerHTML = Object.entries(WIN_META)
    .map(([id, m]) => `<li><button data-sm="${id}"><span class="ico ${m.ico}"></span>${m.name}</button></li>`).join("");
  const toggleSm = (open) => { sm.hidden = !open; smBtn.setAttribute("aria-expanded", open); };
  smBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleSm(sm.hidden); });
  sm.addEventListener("click", (e) => { const b = e.target.closest("[data-sm]"); if (b) { openWin(b.dataset.sm); toggleSm(false); } });
  document.addEventListener("click", (e) => { if (!sm.hidden && !sm.contains(e.target)) toggleSm(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleSm(false); });

  // Reloj
  const clock = () => { $("#clock").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); };
  clock(); setInterval(clock, 15000);

  // ░░ Lienzos pixel: helpers ░░
  const UI_FONT = "12px Tahoma, Verdana, sans-serif";
  const UI_BOLD = "bold 12px Tahoma, Verdana, sans-serif";
  async function fontsReady() { try { await document.fonts.load("20px VT323"); } catch { /* sin fuente: usa fallback */ } }
  function pxLine(g, x0, y0, x1, y1, s = 2) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      g.fillRect(x0 - (s >> 1), y0 - (s >> 1), s, s);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Coloca una etiqueta junto a (x, y) probando posiciones hasta no chocar con las ya puestas
  function placeLabel(g, text, x, y, placed, box) {
    const w = g.measureText(text).width + 6, h = 16;
    const tries = [[10, 4], [10, -18], [-w - 10, 4], [-w - 10, -18], [-w / 2, -26], [-w / 2, 12], [10, 22], [-w - 10, 22], [-w / 2, 30], [4, 40], [-w - 4, 40]];
    for (const [dx, dy] of tries) {
      const r = { x: x + dx, y: y + dy, w, h };
      const inside = !box || (r.x >= box.l + 4 && r.x + w <= box.r + 20 && r.y >= box.t - 12 && r.y + h <= box.b);
      if (inside && !placed.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)) {
        placed.push(r);
        const ink = g.fillStyle;
        g.fillStyle = "rgba(255,253,247,.92)"; g.fillRect(r.x, r.y, w, h);
        g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, r.x + 3, r.y + h / 2 + 1); return;
      }
    }
  }
  function axes(g, box, xTicks, yTicks, xLab, yLab, ink, grid, font = "18px VT323, monospace") {
    const { l, t, r, b } = box;
    g.font = font; g.textBaseline = "middle";
    g.fillStyle = grid;
    yTicks.forEach(([v, y]) => { for (let x = l; x < r; x += 6) g.fillRect(x, Math.round(y), 2, 2); });
    g.fillStyle = ink;
    g.fillRect(l, t, 2, b - t + 2); g.fillRect(l, b, r - l, 2);
    g.textAlign = "right"; yTicks.forEach(([v, y]) => g.fillText(v, l - 6, y));
    g.textAlign = "center"; xTicks.forEach(([v, x]) => g.fillText(v, x, b + 14));
    g.fillText(xLab, (l + r) / 2, b + 32);
    g.save(); g.translate(14, (t + b) / 2); g.rotate(-Math.PI / 2); g.fillText(yLab, 0, 0); g.restore();
  }

  // ░░ FACE FINDER ░░
  const state = { q: 0, method: "lineal", idx: { ivf: 2, hnsw: 2 } };
  const params = { ivf: D.sweep.ivf.map((s) => s.param), hnsw: D.sweep.hnsw.map((s) => s.param) };

  function initFinder() {
    const sel = $("#qSel");
    sel.innerHTML = D.queries.map((q, i) => `<option value="${i}">#${q.id} · ${nice(q.person)}</option>`).join("");
    sel.addEventListener("change", () => { state.q = +sel.value; renderFinder(true); });
    $$("input[name=method]").forEach((r) => r.addEventListener("change", () => { state.method = r.value; renderFinder(true); }));
    $("#paramRange").addEventListener("input", (e) => { state.idx[state.method] = +e.target.value; renderFinder(true); });
    renderFinder(false);
  }

  function currentResults() {
    const q = D.queries[state.q];
    if (state.method === "lineal") return { ids: q.exact, ms: D.meta.lineal_ms, param: null };
    const p = params[state.method][state.idx[state.method]];
    const sw = D.sweep[state.method].find((s) => s.param === p);
    return { ids: q[state.method][String(p)], ms: sw.ms, param: p };
  }

  function renderFinder(animate) {
    const q = D.queries[state.q];
    const { ids, ms, param } = currentResults();
    const exactSet = new Set(q.exact);
    const distOf = new Map(q.exact.map((id, i) => [id, q.dist[i]]));

    $("#qFace").replaceChildren(face(q, q.person));
    $("#qName").textContent = `${nice(q.person)} (reservada)`;

    const row = $("#paramRow");
    row.hidden = state.method === "lineal";
    if (!row.hidden) {
      const ps = params[state.method];
      const range = $("#paramRange");
      range.max = ps.length - 1; range.value = state.idx[state.method];
      $("#paramLabel").textContent = state.method === "ivf" ? "ivfflat.probes" : "hnsw.ef_search";
      $("#paramOut").textContent = param + (state.method === "ivf" && param === D.meta.lists ? " (= lists)" : "");
    }

    const hits = ids.filter((id) => exactSet.has(id)).length;
    const recall = hits / q.exact.length;
    $("#hearts").innerHTML = q.exact.map((_, i) => `<span class="heart${i < hits ? "" : " empty"}"></span>`).join("");
    $("#hearts").setAttribute("aria-label", `recall ${hits} de ${q.exact.length}`);
    $("#recallVal").textContent = fmt(recall);
    $("#latVal").textContent = fmt(ms);

    const grid = $("#grid");
    grid.innerHTML = "";
    ids.forEach((id, i) => {
      const it = D.items[String(id)];
      const li = document.createElement("li");
      const miss = !exactSet.has(id);
      li.className = "card" + (miss ? " miss" : "") + (animate && !reduced ? " pop" : "");
      li.style.animationDelay = i * 25 + "ms";
      li.append(face(it, it.person));
      li.insertAdjacentHTML("beforeend",
        `<span class="rank">${i + 1}</span><span class="who" title="${nice(it.person)}">${nice(it.person)}</span><span class="d">${distOf.has(id) ? "d=" + fmt(distOf.get(id), 3) : "fuera del top-10"}</span>`);
      grid.append(li);
    });

    const lost = q.exact.filter((id) => !ids.includes(id));
    $("#lostBox").hidden = lost.length === 0;
    $("#lostList").innerHTML = "";
    lost.forEach((id) => {
      const li = document.createElement("li");
      li.append(face(D.items[String(id)], D.items[String(id)].person, "mini"));
      li.append(`${nice(D.items[String(id)].person)} · d=${fmt(distOf.get(id), 3)}`);
      $("#lostList").append(li);
    });

    const plan = state.method === "lineal" ? "Seq Scan on face_embeddings (enable_indexscan = off)"
      : `Index Scan using ${state.method === "ivf" ? "face_ivf" : "face_hnsw"} · ${state.method === "ivf" ? "probes" : "ef_search"} = ${param}`;
    $("#planHint").innerHTML = `Plan: <code>${plan}</code>. La latencia es la mediana sobre todas las consultas.`;
    $("#finderStatus").textContent = state.method === "lineal"
      ? "Búsqueda exacta: es la verdad de referencia."
      : `${hits}/10 vecinos exactos recuperados${lost.length ? ` · ${lost.length} perdidos` : " · ¡perfecto!"}`;
    if (opened.has("recall")) drawRecall();
  }

  // ░░ Recall vs latencia ░░
  function initRecall() {
    $("#sweepTbl tbody").innerHTML = [
      ...D.sweep.ivf.map((s) => ["IVFFlat", `probes = ${s.param}${s.param === D.meta.lists ? " (lists)" : ""}`, s]),
      ...D.sweep.hnsw.map((s) => ["HNSW", `ef_search = ${s.param}`, s]),
    ].map(([n, p, s]) => `<tr class="${s.recall >= 0.95 ? "ok" : ""}"><td>${n}</td><td>${p}</td><td class="num">${fmt(s.recall, 3)}</td><td class="num">${fmt(s.ms)}</td></tr>`).join("")
      + `<tr><td>Lineal</td><td>—</td><td class="num">1.000</td><td class="num">${fmt(D.meta.lineal_ms)}</td></tr>`;
    fontsReady().then(drawRecall);
  }
  function drawRecall() {
    const c = $("#recallChart"), g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);   // lienzo a 2× para texto nítido
    const W = c.width / 2, H = c.height / 2, box = { l: 70, t: 18, r: W - 24, b: H - 46 };
    g.clearRect(0, 0, W, H);
    const all = [...D.sweep.ivf, ...D.sweep.hnsw];
    const xMax = Math.max(D.meta.lineal_ms, ...all.map((s) => s.ms)) * 1.08;
    const yMin = Math.floor((Math.min(...all.map((s) => s.recall)) - 0.05) * 20) / 20;
    const X = (v) => box.l + (v / xMax) * (box.r - box.l);
    const Y = (v) => box.b - ((v - yMin) / (1 - yMin)) * (box.b - box.t);
    const yT = []; for (let v = yMin; v <= 1.0001; v += 0.05) yT.push([fmt(v), Y(v)]);
    const xT = []; const step = xMax > 4 ? 1 : 0.5; for (let v = 0; v <= xMax; v += step) xT.push([fmt(v, 1), X(v)]);
    axes(g, box, xT, yT, "latencia mediana (ms)", "recall@10", css("--ink"), css("--face-dark"), UI_FONT);
    // umbral 0.95
    g.fillStyle = css("--green");
    for (let x = box.l; x < box.r; x += 10) g.fillRect(x, Math.round(Y(0.95)), 6, 2);
    g.font = UI_BOLD; g.textAlign = "left";
    const thX = box.l + (box.r - box.l) * 0.45, thY = Math.round(Y(0.95)) + 4;
    g.fillText("recall ≥ 0.95", thX, thY + 8); g.font = UI_FONT;

    const cur = currentResults();
    const placed = [{ x: box.l + (box.r - box.l) * 0.45, y: Math.round(Y(0.95)) + 4, w: 90, h: 16 }];
    const series = [["ivf", css("--ivf"), "p"], ["hnsw", css("--hnsw"), "ef"]];
    series.forEach(([k, col, tag]) => {
      const pts = D.sweep[k];
      g.fillStyle = col;
      for (let i = 1; i < pts.length; i++) pxLine(g, X(pts[i - 1].ms), Y(pts[i - 1].recall), X(pts[i].ms), Y(pts[i].recall), 3);
      pts.forEach((s) => {
        const x = Math.round(X(s.ms)), y = Math.round(Y(s.recall));
        g.fillStyle = css("--ink"); g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = col; g.fillRect(x - 4, y - 4, 8, 8);
        placed.push({ x: x - 6, y: y - 6, w: 12, h: 12 });
        if (state.method === k && cur.param === s.param) {
          g.strokeStyle = css("--yellow"); g.lineWidth = 3; g.strokeRect(x - 10, y - 10, 20, 20);
          g.strokeStyle = css("--ink"); g.lineWidth = 1; g.strokeRect(x - 12, y - 12, 24, 24);
        }
      });
    });
    const lx = Math.round(X(D.meta.lineal_ms)), ly = Math.round(Y(1));
    g.fillStyle = css("--ink"); g.fillRect(lx - 6, ly - 6, 12, 12);
    g.fillStyle = css("--lin"); g.fillRect(lx - 4, ly - 4, 8, 8);
    placed.push({ x: lx - 6, y: ly - 6, w: 12, h: 12 });
    g.fillStyle = css("--ink"); g.font = UI_BOLD;
    placeLabel(g, "lineal", lx, ly, placed, box);
    series.forEach(([k, , tag]) => D.sweep[k].forEach((s) => placeLabel(g, `${tag}=${s.param}`, X(s.ms), Y(s.recall), placed, box)));
  }

  // ░░ Escalabilidad ░░
  function initScale() {
    $("#scaleTbl tbody").innerHTML = D.scaling.map((s) =>
      `<tr><td class="num">${s.N.toLocaleString("es-PE")}</td><td class="num">${fmt(s.lineal)} ms</td><td class="num">${fmt(s.ivf)} ms <span class="muted">(probes=${s.ivf_param})</span></td><td class="num">${fmt(s.hnsw)} ms <span class="muted">(ef=${s.hnsw_param})</span></td></tr>`).join("");
    fontsReady().then(drawScale);
  }
  function drawScale() {
    const c = $("#scaleChart"), g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);
    const W = c.width / 2, H = c.height / 2, box = { l: 66, t: 16, r: W - 84, b: H - 46 };
    const ink = css("--crt-ink");
    g.fillStyle = css("--crt-bg"); g.fillRect(0, 0, W, H);
    const xMax = Math.max(...D.scaling.map((s) => s.N)) * 1.04;
    const yMax = Math.ceil(Math.max(...D.scaling.map((s) => s.lineal)) * 1.1);
    const X = (v) => box.l + (v / xMax) * (box.r - box.l);
    const Y = (v) => box.b - (v / yMax) * (box.b - box.t);
    const yT = []; for (let v = 0; v <= yMax; v += Math.max(1, Math.round(yMax / 6))) yT.push([v, Y(v)]);
    const xT = D.scaling.map((s) => [s.N >= 1000 ? s.N / 1000 + "k" : s.N, X(s.N)]);
    axes(g, box, xT, yT, "N (embeddings en la tabla)", "Execution Time (ms)", ink, "#3b3760");
    const series = [["lineal", "#d8d4ff", "Lineal"], ["ivf", css("--ivf"), "IVFFlat"], ["hnsw", "#7ea5ff", "HNSW"]];
    series.forEach(([k, col]) => {
      g.fillStyle = col;
      for (let i = 1; i < D.scaling.length; i++) pxLine(g, X(D.scaling[i - 1].N), Y(D.scaling[i - 1][k]), X(D.scaling[i].N), Y(D.scaling[i][k]), 3);
      D.scaling.forEach((s) => { const x = Math.round(X(s.N)), y = Math.round(Y(s[k])); g.fillRect(x - 4, y - 4, 8, 8); });
    });
    // etiquetas al final de cada línea, separadas al menos 18 px
    const last = D.scaling[D.scaling.length - 1];
    const tags = series.map(([k, col, name]) => ({ col, name, y: Y(last[k]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + 18);
    g.textAlign = "left";
    tags.forEach((t) => { g.fillStyle = t.col; g.fillText(t.name, X(last.N) + 10, t.y); });
    // scanlines CRT
    g.fillStyle = "rgba(0,0,0,.18)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  }

  // ░░ Demo IVF ░░
  const ivfDemo = { pts: [], cents: [], q: { x: 0.52, y: 0.48 }, K: 6, k: 5 };
  const CELL = ["#ffd3ea", "#d6e6ff", "#e3f7c9", "#fff1b3", "#e6dcff", "#ffe0c7"];
  const CELL_DK = ["#ff6fb5", "#3f7bff", "#3d7d2a", "#c9a000", "#7a52d6", "#d97a3a"];
  function initIvf() {
    const r = rng(42), blobs = [];
    for (let i = 0; i < 7; i++) blobs.push({ x: 0.12 + r() * 0.76, y: 0.15 + r() * 0.7 });
    for (let i = 0; i < 170; i++) {
      const b = blobs[i % blobs.length];
      ivfDemo.pts.push({ x: Math.min(0.98, Math.max(0.02, b.x + (r() + r() + r() - 1.5) * 0.17)), y: Math.min(0.97, Math.max(0.03, b.y + (r() + r() + r() - 1.5) * 0.17)) });
    }
    // k-means (Lloyd) — así construye IVFFlat sus listas
    ivfDemo.cents = ivfDemo.pts.slice(0, ivfDemo.K).map((p) => ({ ...p }));
    for (let it = 0; it < 12; it++) {
      const acc = ivfDemo.cents.map(() => ({ x: 0, y: 0, n: 0 }));
      ivfDemo.pts.forEach((p) => { const a = acc[nearestCent(p)]; a.x += p.x; a.y += p.y; a.n++; });
      ivfDemo.cents = acc.map((a, i) => (a.n ? { x: a.x / a.n, y: a.y / a.n } : ivfDemo.cents[i]));
    }
    ivfDemo.pts.forEach((p) => { p.c = nearestCent(p); });
    const c = $("#ivfCanvas");
    c.addEventListener("click", (e) => {
      const b = c.getBoundingClientRect();
      ivfDemo.q = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
      drawIvf();
    });
    $("#ivfProbes").max = ivfDemo.K;
    $("#ivfProbes").addEventListener("input", (e) => { $("#ivfProbesOut").textContent = e.target.value; drawIvf(); });
    fontsReady().then(drawIvf);
  }
  const d2 = (a, b) => (a.x - b.x) ** 2 + ((a.y - b.y) * 0.625) ** 2;
  function nearestCent(p) { let best = 0; ivfDemo.cents.forEach((c, i) => { if (d2(p, c) < d2(p, ivfDemo.cents[best])) best = i; }); return best; }
  function drawIvf() {
    const c = $("#ivfCanvas"), g = c.getContext("2d"), W = c.width, H = c.height, B = 6;
    const probes = +$("#ivfProbes").value;
    const order = ivfDemo.cents.map((ct, i) => [d2(ivfDemo.q, ct), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const visited = new Set(order.slice(0, probes));
    for (let y = 0; y < H; y += B) for (let x = 0; x < W; x += B) {
      const ci = nearestCent({ x: (x + B / 2) / W, y: (y + B / 2) / H });
      g.fillStyle = CELL[ci];
      g.globalAlpha = visited.has(ci) ? 1 : 0.28;
      g.fillRect(x, y, B, B);
      g.globalAlpha = 1;
    }
    const exact = [...ivfDemo.pts].sort((a, b) => d2(a, ivfDemo.q) - d2(b, ivfDemo.q)).slice(0, ivfDemo.k);
    const found = ivfDemo.pts.filter((p) => visited.has(p.c)).sort((a, b) => d2(a, ivfDemo.q) - d2(b, ivfDemo.q)).slice(0, ivfDemo.k);
    const foundSet = new Set(found);
    ivfDemo.pts.forEach((p) => {
      g.fillStyle = visited.has(p.c) ? CELL_DK[p.c] : "#c9c7d8";
      g.fillRect(Math.round(p.x * W) - 2, Math.round(p.y * H) - 2, 5, 5);
    });
    exact.forEach((p) => {
      const x = Math.round(p.x * W), y = Math.round(p.y * H);
      g.strokeStyle = "#1b1b3a"; g.lineWidth = 2; g.strokeRect(x - 6, y - 6, 12, 12);
      if (!foundSet.has(p)) { g.fillStyle = "#ff3d7f"; pxLine(g, x - 8, y - 8, x + 8, y + 8, 3); pxLine(g, x + 8, y - 8, x - 8, y + 8, 3); }
    });
    ivfDemo.cents.forEach((ct, i) => {
      const x = Math.round(ct.x * W), y = Math.round(ct.y * H);
      g.fillStyle = "#1b1b3a"; g.fillRect(x - 6, y - 2, 12, 4); g.fillRect(x - 2, y - 6, 4, 12);
      g.fillStyle = CELL_DK[i]; g.fillRect(x - 4, y - 1, 8, 2); g.fillRect(x - 1, y - 4, 2, 8);
    });
    starAt(g, ivfDemo.q.x * W, ivfDemo.q.y * H);
    const hits = exact.filter((p) => foundSet.has(p)).length;
    const frac = ivfDemo.pts.filter((p) => visited.has(p.c)).length;
    $("#ivfRecall").textContent = `recall@${ivfDemo.k} = ${hits}/${ivfDemo.k} · distancias calculadas: ${frac} de ${ivfDemo.pts.length}`;
  }
  function starAt(g, x, y) {
    x = Math.round(x); y = Math.round(y);
    const S = [[0, -3], [-1, -2], [0, -2], [1, -2], [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-2, 2], [-1, 2], [1, 2], [2, 2]];
    g.fillStyle = "#1b1b3a"; S.forEach(([a, b]) => g.fillRect(x + a * 3 - 2, y + b * 3 - 2, 7, 7));
    g.fillStyle = "#ffe066"; S.forEach(([a, b]) => g.fillRect(x + a * 3 - 1, y + b * 3 - 1, 3, 3));
  }

  // ░░ Demo HNSW ░░
  const hn = { nodes: [], layers: 3, q: { x: 0.7, y: 0.35 }, path: [], seed: 3, timer: null };
  function buildHnsw() {
    const r = rng(hn.seed);
    hn.nodes = [];
    for (let i = 0; i < 46; i++) {
      const lvl = r() < 0.1 ? 2 : r() < 0.3 ? 1 : 0;   // nivel aleatorio: pocos nodos arriba
      hn.nodes.push({ x: 0.04 + r() * 0.92, y: 0.08 + r() * 0.84, lvl, nb: [[], [], []] });
    }
    if (!hn.nodes.some((n) => n.lvl === 2)) hn.nodes[0].lvl = 2;
    if (hn.nodes.filter((n) => n.lvl >= 1).length < 4) hn.nodes.slice(0, 5).forEach((n) => { n.lvl = Math.max(n.lvl, 1); });
    for (let L = 0; L < hn.layers; L++) {
      const inL = hn.nodes.filter((n) => n.lvl >= L), m = L === 0 ? 3 : 2;
      inL.forEach((n) => {
        inL.filter((o) => o !== n).sort((a, b) => d2(a, n) - d2(b, n)).slice(0, m).forEach((o) => {
          if (!n.nb[L].includes(o)) n.nb[L].push(o);
          if (!o.nb[L].includes(n)) o.nb[L].push(n);
        });
      });
    }
    hn.entry = hn.nodes.find((n) => n.lvl === 2);
    hn.path = [];
    $("#hnswInfo").textContent = "Pulsa ▶ Buscar";
  }
  function searchHnsw() {
    let cur = hn.entry, evals = 1;
    const path = [{ n: cur, L: 2 }];
    for (let L = 2; L >= 0; L--) {
      for (let improved = true; improved;) {
        improved = false;
        for (const o of cur.nb[L]) { evals++; if (d2(o, hn.q) < d2(cur, hn.q)) { cur = o; improved = true; } }
        if (improved) path.push({ n: cur, L });
      }
      if (L > 0) path.push({ n: cur, L: L - 1 });
    }
    return { path, found: cur, evals };
  }
  const bandY = (L) => [200, 100, 0][L];
  const toXY = (n, L, W) => [Math.round(n.x * W), Math.round(bandY(L) + 8 + n.y * 84)];
  function drawHnsw(steps = Infinity) {
    const c = $("#hnswCanvas"), g = c.getContext("2d"), W = c.width;
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, c.height);
    for (let L = 2; L >= 0; L--) {
      g.fillStyle = ["#e3f7c9", "#d6e6ff", "#ffd3ea"][L]; g.fillRect(0, bandY(L), W, 98);
      g.fillStyle = "#1b1b3a"; g.font = UI_BOLD; g.textAlign = "left"; g.textBaseline = "top";
      g.fillText(`capa ${L}${L === 0 ? " (todos)" : ""}`, 6, bandY(L) + 2);
      g.fillStyle = "#a9a7bd";
      hn.nodes.filter((n) => n.lvl >= L).forEach((n) => n.nb[L].forEach((o) => { const [x0, y0] = toXY(n, L, W), [x1, y1] = toXY(o, L, W); pxLine(g, x0, y0, x1, y1, 1); }));
      hn.nodes.filter((n) => n.lvl >= L).forEach((n) => { const [x, y] = toXY(n, L, W); g.fillStyle = "#1b1b3a"; g.fillRect(x - 3, y - 3, 7, 7); g.fillStyle = n === hn.entry ? "#ffe066" : "#7f9be6"; g.fillRect(x - 2, y - 2, 5, 5); });
      const qx = hn.q.x * W, qy = bandY(L) + 8 + hn.q.y * 84;
      starAt(g, qx, qy);
    }
    g.fillStyle = "#ff3d7f";
    const p = hn.path.slice(0, steps);
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = toXY(p[i - 1].n, p[i - 1].L, W), [x1, y1] = toXY(p[i].n, p[i].L, W);
      pxLine(g, x0, y0, x1, y1, 3);
    }
    p.forEach(({ n, L }) => { const [x, y] = toXY(n, L, W); g.fillRect(x - 4, y - 4, 9, 9); });
  }
  function initHnsw() {
    buildHnsw();
    const c = $("#hnswCanvas");
    c.addEventListener("click", (e) => {
      const b = c.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = ((e.clientY - b.top) / b.height) * c.height;
      const L = y < 100 ? 2 : y < 200 ? 1 : 0;
      hn.q = { x, y: Math.min(0.99, Math.max(0.01, (y - bandY(L) - 8) / 84)) };
      hn.path = []; $("#hnswInfo").textContent = "Pulsa ▶ Buscar"; drawHnsw();
    });
    $("#hnswRun").addEventListener("click", runHnsw);
    $("#hnswNew").addEventListener("click", () => { hn.seed++; buildHnsw(); drawHnsw(); });
    fontsReady().then(() => drawHnsw());
  }
  function runHnsw() {
    clearInterval(hn.timer);
    const { path, found, evals } = searchHnsw();
    hn.path = path;
    const best = [...hn.nodes].sort((a, b) => d2(a, hn.q) - d2(b, hn.q))[0];
    const msg = `${found === best ? "✓ encontró el vecino real" : "✗ óptimo local: el vecino real era otro"} · distancias calculadas: ${evals} de ${hn.nodes.length}`;
    if (reduced) { drawHnsw(); $("#hnswInfo").textContent = msg; return; }
    let s = 1;
    hn.timer = setInterval(() => {
      drawHnsw(s++);
      if (s > path.length) { clearInterval(hn.timer); $("#hnswInfo").textContent = msg; }
    }, 280);
  }

  // Pestañas de "Cómo funciona"
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".tabpane").forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
  }));

  // ░░ Doble famoso ░░
  function initTwin() {
    const list = $("#twinList");
    list.innerHTML = "";
    D.famoso.forEach((f, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option"); li.tabIndex = 0; li.dataset.i = i;
      li.append(face(f, nice(f.name), "mini"));
      li.insertAdjacentHTML("beforeend",
        `<div><div class="twin-name"><span>${nice(f.name)} <span class="muted">(${f.fotos} foto${f.fotos > 1 ? "s" : ""})</span></span><b>${fmt(f.dist, 3)}</b></div>
         <div class="bar"><div class="bar-fill" style="width:${Math.min(100, f.dist * 100)}%"></div><div class="bar-th" style="left:60%"></div></div></div>`);
      const pick = () => showOcclusion(i);
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      list.append(li);
    });
    const top = D.famoso[0], bajo = D.famoso.filter((f) => f.dist < 0.6).length;
    $("#twinVerdict").innerHTML = top.dist < 0.6
      ? `Mi doble es <b>${nice(top.name)}</b> con distancia <b>${fmt(top.dist, 3)}</b>. Está bajo 0.6, así que para el modelo seríamos la misma persona, o sea me parezco muchísimo` +
        (bajo > 1 ? ` (y ${bajo - 1} más también quedan bajo el umbral)` : "")
      : `Mi doble es <b>${nice(top.name)}</b> con distancia <b>${fmt(top.dist, 3)}</b>. Está sobre 0.6, así que es parecido pero el modelo no nos confunde`;
    if (D.famoso.some((f) => f.occlusion)) showOcclusion(0);
  }

  function showOcclusion(i) {
    const f = D.famoso[i], occ = f.occlusion;
    $$("#twinList li").forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === i));
    $("#occ").hidden = !occ;
    if (!occ) return;
    const photo = $("#occPhoto");
    photo.replaceChildren(face(f, nice(f.name), ""));
    $("#occName").textContent = nice(f.name);
    const maxAbs = Math.max(0.02, ...occ.zones.map((z) => Math.abs(z.delta)));
    const bars = $("#occBars");
    bars.innerHTML = "";
    // de mayor a menor aporte al parecido
    [...occ.zones].sort((a, b) => b.delta - a.delta).forEach((z) => {
      const sign = z.delta >= 0 ? "pos" : "neg";
      const [x0, y0, x1, y1] = z.box;
      const zone = document.createElement("div");
      zone.className = `zone ${sign}`; zone.dataset.k = z.key;
      zone.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%;--a:${(0.15 + 0.5 * Math.abs(z.delta) / maxAbs).toFixed(2)}`;
      photo.append(zone);
      const row = document.createElement("div");
      row.className = "zbar"; row.tabIndex = 0; row.dataset.k = z.key;
      row.title = sign === "pos" ? "Sin esta zona se alejan: los hacía parecidos" : "Sin esta zona se acercan: los diferenciaba";
      row.innerHTML = `<span>${z.label}</span><div class="ztrack"><div class="zfill ${sign}" style="width:${(50 * Math.abs(z.delta)) / maxAbs}%"></div></div><span class="zval">${z.delta >= 0 ? "+" : ""}${fmt(z.delta, 3)}</span>`;
      const on = (v) => { photo.classList.toggle("focus", v); $$(".zone", photo).forEach((el) => el.classList.toggle("on", v && el.dataset.k === z.key)); };
      ["mouseenter", "focus"].forEach((ev) => row.addEventListener(ev, () => on(true)));
      ["mouseleave", "blur"].forEach((ev) => row.addEventListener(ev, () => on(false)));
      bars.append(row);
    });
    const top = [...occ.zones].sort((a, b) => b.delta - a.delta);
    const parecen = top.filter((z) => z.delta > 0.01).slice(0, 2).map((z) => z.label.toLowerCase());
    const difieren = top.filter((z) => z.delta < -0.01).map((z) => z.label.toLowerCase());
    $("#occHint").innerHTML =
      `Distancia original <b>${fmt(occ.d0, 3)}</b>. ` +
      (parecen.length ? `Lo que más pesa en el parecido: <b class="pos-t">${parecen.join(" y ")}</b>. ` : "Ninguna zona sola explica el parecido. ") +
      (difieren.length ? `Lo que más los diferencia: <b class="neg-t">${difieren[difieren.length - 1]}</b>. ` : "") +
      `<span class="muted">Pasa el mouse por una barra para ver la zona.</span>`;
  }

  // ░░ LEEME ░░
  function initReadme() {
    $("#readmeBody").innerHTML = `
      <h3>SOBRE ESTE LAB</h3>
      <p>El Lab 11 de <b>Base de Datos II</b> (UTEC) en versión interactiva: buscar rostros parecidos dentro de <b>PostgreSQL + pgvector</b>.</p>
      <p>Cada foto de LFW se convierte en un vector de <b>128 números</b> con <code>face_recognition</code>. Dos caras parecidas tienen vectores cercanos, así que "buscar parecidos" es buscar los <b>k vecinos más cercanos</b>.</p>

      <h3>TRES FORMAS DE BUSCAR</h3>
      <ul>
        <li><b>Lineal</b>: compara la consulta con todas las fotos. Exacta, pero lenta.</li>
        <li><b>IVFFlat</b>: agrupa los vectores con k-means y solo revisa los <i>probes</i> grupos más cercanos.</li>
        <li><b>HNSW</b>: navega un grafo por capas saltando al vecino más cercano. <i>ef_search</i> controla cuántos candidatos explora.</li>
      </ul>

      <h3>MODO DE USO</h3>
      <ul>
        <li><b>Face Finder</b>: elige una consulta y un método, y mueve el parámetro. Los ♥ son el <b>recall@10</b>: cuántos de los 10 vecinos exactos encontró el índice.</li>
        <li><b>Recall vs Latencia</b>: el costo de cada configuración. Lo ideal es estar arriba (recall alto) y a la izquierda (rápido).</li>
        <li><b>Escalabilidad</b>: cómo crece el tiempo al aumentar la tabla.</li>
        <li><b>Cómo funciona</b>: dos demos para jugar con IVF y HNSW.</li>
      </ul>
      ${D.meta.example ? `<p class="warn-box">⚠ <b>${D.meta.note}</b></p>` : ""}
      <p class="muted">Las fotos son de <b>LFW</b> (Labeled Faces in the Wild), un dataset público de investigación. La foto personal que se usó como consulta en el lab <b>no</b> se publica.</p>`;
  }

  // ░░ Cámara en vivo (necesita servidor_en_vivo.py) ░░
  const CAM_COLORS = ["#ff6fb5", "#3f7bff", "#6fbf4a", "#ffb000", "#9b5cff", "#00b8a9"];
  // abierta con doble clic (file://) la página usa el servidor local; servida por él, su mismo origen
  const CAM_API = location.protocol === "file:" ? "http://localhost:8000" : "";
  const cam = { ready: false, stream: null, running: false, paused: false, res: null, hist: [], photos: 0, frames: 0, t0: 0 };

  async function initCam() {
    if (cam.ready) return;
    cam.ready = true;
    let info = null;
    try {
      info = await (await fetch(CAM_API + "/api/info", { cache: "no-store" })).json();
    } catch (e) { info = null; }
    $("#camOffline").hidden = !!info;
    $("#camOnline").hidden = !info;
    if (!info) {
      cam.ready = false;
      $("#camRetry").onclick = initCam;
      return;
    }
    cam.info = info;
    $("#camToggle").addEventListener("click", () => (cam.stream ? stopCam() : startCam()));
    $("#camShot").addEventListener("click", takePhoto);
    $("#camPause").addEventListener("click", () => (cam.paused ? resumeCam() : pauseCam()));
    const win = $('.win[data-win="cam"]');
    $$(".close, .min", win).forEach((b) => b.addEventListener("click", stopCam));
    drawMetrics();
    drawSpark();
    drawIdle();
    if (/[&#]cam=on/.test(location.hash)) startCam();
  }

  function drawIdle() {
    const c = $("#camCanvas"), g = c.getContext("2d");
    g.fillStyle = "#1d1a33"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#b8ffcf"; g.font = "28px VT323, monospace"; g.textAlign = "center";
    g.fillText("[ cámara apagada ]", c.width / 2, c.height / 2);
    g.textAlign = "start";
  }

  async function startCam() {
    const btn = $("#camToggle");
    btn.disabled = true;
    $("#camStatus").textContent = "Pidiendo permiso de cámara…";
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    } catch (e) {
      $("#camStatus").textContent = "No se pudo abrir la cámara: " + e.message;
      btn.disabled = false;
      return;
    }
    const v = $("#camVideo");
    v.srcObject = cam.stream;
    await v.play();
    const c = $("#camCanvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    cam.running = true; cam.paused = false; cam.res = null; cam.hist = []; cam.frames = 0; cam.t0 = performance.now();
    btn.textContent = "■ Apagar cámara"; btn.disabled = false;
    $("#camShot").disabled = false;
    $("#camPause").disabled = false;
    $("#camStatus").textContent = "Buscando caras…";
    requestAnimationFrame(renderCam);
    analyzeLoop();
  }

  function stopCam() {
    if (cam.paused) resumeCam();
    cam.running = false;
    cam.stream?.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    if (!$("#camToggle")) return;
    $("#camToggle").textContent = "▶ Encender cámara";
    $("#camShot").disabled = true;
    $("#camPause").disabled = true;
    $("#camStatus").textContent = "Cámara apagada";
    drawIdle();
  }

  // Manda cuadros al servidor de uno en uno: el siguiente sale cuando llega la respuesta
  async function analyzeLoop() {
    const v = $("#camVideo");
    const off = document.createElement("canvas");
    while (cam.running) {
      if (cam.paused) { await new Promise((r) => setTimeout(r, 120)); continue; }
      const w = 640, h = Math.round(640 * v.videoHeight / v.videoWidth);
      off.width = w; off.height = h;
      off.getContext("2d").drawImage(v, 0, 0, w, h);
      const blob = await new Promise((r) => off.toBlob(r, "image/jpeg", 0.85));
      const t = performance.now();
      try {
        const resp = await fetch(CAM_API + "/api/buscar", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        if (cam.paused || !cam.running) continue;
        data.roundtrip = performance.now() - t;
        cam.res = data;
        cam.frames++;
        cam.hist.push(data.roundtrip);
        if (cam.hist.length > 60) cam.hist.shift();
        $("#camStatus").textContent = data.caras.length ? `${data.caras.length} cara${data.caras.length > 1 ? "s" : ""} detectada${data.caras.length > 1 ? "s" : ""}` : "Buscando caras…";
        drawMetrics(); drawSpark(); drawFaces();
      } catch (e) {
        $("#camStatus").textContent = "Error con el servidor: " + e.message;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  function drawFrame(g, w, h) {
    const v = $("#camVideo");
    g.save(); g.translate(w, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, w, h); g.restore();
    const r = cam.res;
    if (!r) return;
    const sx = w / r.w, sy = h / r.h, lw = Math.max(3, w / 220), fs = Math.max(16, Math.round(w / 34));
    r.caras.forEach((cara, i) => {
      const [top, right, bottom, left] = cara.box, col = CAM_COLORS[i % CAM_COLORS.length];
      const x = w - right * sx, y = top * sy, bw = (right - left) * sx, bh = (bottom - top) * sy;
      g.lineWidth = lw; g.strokeStyle = col; g.strokeRect(x, y, bw, bh);
      const d = cara.dobles[0];
      if (!d) return;
      const txt = `${i + 1}. ${nice(d.name)}  ${fmt(d.dist, 3)}`;
      g.font = `bold ${fs}px Tahoma, Verdana, sans-serif`;
      const tw = g.measureText(txt).width + 12;
      const thumbs = Math.round(Math.max(72, w / 7) * 1.2) + 8;   // columna de fotos de la derecha
      const lx = Math.max(0, Math.min(x, w - thumbs - Math.max(bw, tw))), ly = Math.min(y + bh, h - fs - 10);
      g.fillStyle = col; g.fillRect(lx, ly, Math.max(bw, tw), fs + 10);
      g.fillStyle = "#1b1b3a"; g.fillText(txt, lx + 6, ly + fs + 2);
    });
    drawTopThumbs(g, w, h, r.caras);
  }

  // Foto del top 1 de cada cara en la esquina superior derecha, con el color de su recuadro
  const camImgs = new Map();
  function camImg(src) {
    if (!camImgs.has(src)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      camImgs.set(src, img);
    }
    return camImgs.get(src);
  }

  function drawTopThumbs(g, w, h, caras) {
    const size = Math.round(Math.max(72, w / 7)), pad = Math.round(size / 10), fs = Math.max(12, Math.round(size / 9));
    const labelH = fs * 2 + 10, x = w - size - pad;
    caras.forEach((cara, i) => {
      const d = cara.dobles[0], col = CAM_COLORS[i % CAM_COLORS.length];
      const y = pad + i * (size + labelH + pad);
      if (!d || y + size + labelH > h) return;
      const img = camImg(CAM_API + d.img);
      g.fillStyle = col; g.fillRect(x - 4, y - 4, size + 8, size + labelH + 8);
      if (img.complete && img.naturalWidth) {
        const c = Math.min(img.naturalWidth, img.naturalHeight) * 0.6;
        g.drawImage(img, (img.naturalWidth - c) / 2, (img.naturalHeight - c) / 2, c, c, x, y, size, size);
      } else {
        g.fillStyle = "#1d1a33"; g.fillRect(x, y, size, size);
      }
      g.fillStyle = "#fffdf7"; g.fillRect(x, y + size, size, labelH);
      g.fillStyle = "#1b1b3a";
      g.font = `bold ${fs}px Tahoma, Verdana, sans-serif`;
      let name = `${i + 1}. ${nice(d.name)}`;
      while (name.length > 4 && g.measureText(name).width > size - 8) name = name.slice(0, -2) + "…";
      g.fillText(name, x + 4, y + size + fs + 2);
      g.font = `${fs}px Tahoma, Verdana, sans-serif`;
      g.fillStyle = d.dist < 0.6 ? "#3d7d2a" : "#c46a00";
      g.fillText(`d = ${fmt(d.dist, 3)}`, x + 4, y + size + fs * 2 + 6);
    });
  }

  function renderCam() {
    if (!cam.running) return;
    const c = $("#camCanvas");
    if (!cam.paused) drawFrame(c.getContext("2d"), c.width, c.height);
    requestAnimationFrame(renderCam);
  }

  function drawMetrics() {
    const r = cam.res, secs = (performance.now() - cam.t0) / 1000;
    const m = r ? r.ms : {};
    const val = (x, d = 1) => (x == null ? "—" : fmt(x, d));
    const items = [
      ["Análisis/s", cam.frames && secs > 0 ? fmt(cam.frames / secs, 1) : "—"],
      ["Caras", r ? r.caras.length : "—"],
      ["Detección", val(m.deteccion) + " ms"],
      ["Embedding", val(m.embedding) + " ms"],
      ["HNSW", val(m.busqueda) + " ms"],
      ["Servidor", val(m.servidor) + " ms"],
      ["Ida y vuelta", val(r && r.roundtrip) + " ms"],
      ["Tabla", cam.info ? cam.info.filas.toLocaleString("es-PE") : "—"],
    ];
    $("#camMetrics").innerHTML = items.map(([l, v]) => `<div class="cam-metric"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("");
  }

  function drawSpark() {
    const c = $("#camSpark"), g = c.getContext("2d"), W = c.width, H = c.height, h = cam.hist;
    g.fillStyle = "#1d1a33"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#b8ffcf"; g.font = "16px VT323, monospace";
    g.fillText(h.length ? `ida y vuelta (últimos ${h.length}): ${fmt(h[h.length - 1], 0)} ms` : "latencia ida y vuelta", 6, 14);
    if (h.length < 2) return;
    const max = Math.max(...h) * 1.15;
    g.strokeStyle = "#ff6fb5"; g.lineWidth = 2; g.beginPath();
    h.forEach((v, i) => {
      const x = (i / 59) * (W - 8) + 4, y = H - 4 - (v / max) * (H - 22);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }

  function drawFaces() {
    const ol = $("#camFaces");
    ol.innerHTML = "";
    (cam.res?.caras || []).forEach((cara, i) => {
      const li = document.createElement("li");
      li.className = "cam-face";
      li.style.setProperty("--c", CAM_COLORS[i % CAM_COLORS.length]);
      const head = document.createElement("div");
      head.className = "cam-face-head";
      head.textContent = `Cara ${i + 1}`;
      li.append(head);
      cara.dobles.forEach((d) => {
        const row = document.createElement("div");
        row.className = "cam-double";
        const img = document.createElement("img");
        img.src = CAM_API + d.img; img.alt = nice(d.name);
        const name = document.createElement("span");
        name.textContent = nice(d.name);
        const dist = document.createElement("b");
        dist.className = d.dist < 0.6 ? "ok" : "far";
        dist.textContent = fmt(d.dist, 3);
        row.append(img, name, dist);
        li.append(row);
      });
      ol.append(li);
    });
  }

  function takePhoto() {
    const v = $("#camVideo");
    if (!cam.stream || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d");
    drawFrame(g, c.width, c.height);
    const fs = Math.max(14, Math.round(c.width / 50));
    g.font = `${fs}px Tahoma, Verdana, sans-serif`;
    const stamp = `FACE_SEARCH · pgvector HNSW · ${new Date().toLocaleString("es-PE")}`;
    g.fillStyle = "rgb(27 27 58 / .7)"; g.fillRect(0, c.height - fs - 12, c.width, fs + 12);
    g.fillStyle = "#fff"; g.fillText(stamp, 8, c.height - 8);
    const url = c.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `doble_en_vivo_${++cam.photos}.png`; a.title = "Descargar foto";
    const img = document.createElement("img");
    img.src = url; img.alt = `Foto ${cam.photos}`;
    a.append(img);
    $("#camPhotos").prepend(a);
    $("#camPhotosWrap").hidden = false;
    const f = $("#camFlash");
    f.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => { f.classList.remove("on"); pauseCam(cam.photos); }));
  }

  // ░░ Pausa: se oculta el video y queda una mini página con los tops de ese momento ░░
  function pauseCam(foto) {
    if (!cam.running) return;
    cam.paused = true;
    $("#camLive").hidden = true;
    $("#camShot").disabled = true;
    $("#camPause").textContent = "▶ Reanudar";
    $("#camStatus").textContent = foto ? `En pausa · foto ${foto} guardada abajo` : "En pausa";
    renderPaused(cam.res, foto);
    $("#camPaused").hidden = false;
  }

  function resumeCam() {
    cam.paused = false;
    $("#camPaused").hidden = true;
    $("#camShot").disabled = !cam.running;
    $("#camLive").hidden = false;
    $("#camPause").textContent = "⏸ Pausar";
    $("#camStatus").textContent = "Buscando caras…";
  }

  function renderPaused(r, foto) {
    const box = $("#camPaused"), info = cam.info, m = r ? r.ms : {};
    box.innerHTML = "";
    const head = document.createElement("div");
    head.className = "cam-p-head";
    head.textContent = `⏸ PAUSA · ${new Date().toLocaleTimeString("es-PE")}` + (foto ? ` · FOTO ${foto}` : "");
    box.append(head);

    const caras = r ? r.caras : [];
    const resumen = document.createElement("p");
    resumen.className = "cam-p-sum";
    resumen.textContent = caras.length
      ? `${caras.length} cara${caras.length > 1 ? "s" : ""} en este cuadro. Distancia euclidiana: mientras más baja, más parecidos, y bajo ${info.umbral} el modelo diría que es la misma persona`
      : "No había ninguna cara en este cuadro";
    box.append(resumen);

    const grid = document.createElement("div");
    grid.className = "cam-p-grid";
    caras.forEach((cara, i) => {
      const card = document.createElement("section");
      card.className = "cam-p-card";
      card.style.setProperty("--c", CAM_COLORS[i % CAM_COLORS.length]);
      const h = document.createElement("h4");
      h.textContent = `Cara ${i + 1}`;
      card.append(h);
      cara.dobles.forEach((d, k) => {
        const row = document.createElement("div");
        row.className = "cam-p-row" + (k === 0 ? " top" : "");
        const img = document.createElement("img");
        img.src = CAM_API + d.img; img.alt = nice(d.name);
        const txt = document.createElement("div");
        const name = document.createElement("div");
        name.className = "cam-p-name";
        name.textContent = `#${k + 1} ${nice(d.name)}`;
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.innerHTML = `<div class="bar-fill" style="width:${Math.min(100, d.dist * 100)}%"></div><div class="bar-th" style="left:${info.umbral * 100}%"></div>`;
        const ver = document.createElement("div");
        ver.className = "cam-p-ver " + (d.dist < info.umbral ? "ok" : "far");
        ver.textContent = `${fmt(d.dist, 3)} · ` + (d.dist < info.umbral ? "bajo el umbral, el modelo los confundiría" : "sobre el umbral, solo parecido");
        txt.append(name, bar, ver);
        row.append(img, txt);
        card.append(row);
      });
      grid.append(card);
    });
    box.append(grid);

    const val = (x, d = 1) => (x == null ? "—" : fmt(x, d) + " ms");
    const filas = [
      ["Índice", `${info.indice} (m = ${info.m}, ef_construction = ${info.ef_construction})`],
      ["Consulta", `ORDER BY embedding ${info.operador} q LIMIT ${info.candidatos}, agrupado por persona`],
      ["hnsw.ef_search", info.ef_search],
      ["Filas en la tabla", info.filas.toLocaleString("es-PE")],
      ["Detección", val(m.deteccion)],
      ["Embedding", val(m.embedding)],
      ["Búsqueda HNSW", val(m.busqueda)],
      ["Total servidor", val(m.servidor)],
      ["Ida y vuelta", val(r && r.roundtrip)],
    ];
    const t = document.createElement("table");
    t.className = "cam-p-info";
    filas.forEach(([k, v]) => {
      const tr = t.insertRow();
      tr.insertCell().textContent = k;
      tr.insertCell().textContent = v;
    });
    box.append(t);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "▶ Reanudar";
    btn.addEventListener("click", resumeCam);
    box.append(btn);
  }

  // ░░ Subir foto: el doble famoso de cualquier imagen (necesita servidor_en_vivo.py) ░░
  const up = { ready: false, res: null, img: null, info: null };

  async function initUpload() {
    if (up.ready) return;
    up.ready = true;
    try {
      up.info = await (await fetch(CAM_API + "/api/info", { cache: "no-store" })).json();
    } catch (e) { up.info = null; }
    $("#upOffline").hidden = !!up.info;
    $("#upOnline").hidden = !up.info;
    if (!up.info) {
      up.ready = false;
      $("#upRetry").onclick = initUpload;
      return;
    }
    const drop = $("#upDrop"), file = $("#upFile");
    file.addEventListener("change", () => file.files[0] && handleUpload(file.files[0]));
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleUpload(f); });
  }

  function handleUpload(f) {
    if (!f.type.startsWith("image/")) { $("#upStatus").textContent = "Ese archivo no es una imagen"; return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onerror = () => { $("#upStatus").textContent = "No pude abrir ese formato, prueba con JPG o PNG"; URL.revokeObjectURL(url); };
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = $("#upCanvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      up.img = img;
      $("#upStatus").textContent = "Buscando caras y dobles…";
      $("#upResult").hidden = true;
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
      const t0 = performance.now();
      try {
        const resp = await fetch(CAM_API + "/api/buscar?top=5&escala=1", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        data.roundtrip = performance.now() - t0;
        // el servidor ordena para el video en espejo; aquí la foto no está volteada
        data.caras.sort((a, b) => a.box[3] - b.box[3]);
        up.res = data;
        showUpload();
      } catch (e) {
        $("#upStatus").textContent = "Error con el servidor: " + e.message;
      }
    };
    img.src = url;
  }

  function drawUpload(sel) {
    const c = $("#upCanvas"), g = c.getContext("2d"), r = up.res;
    g.drawImage(up.img, 0, 0, c.width, c.height);
    const sx = c.width / r.w, sy = c.height / r.h, lw = Math.max(3, c.width / 200), fs = Math.max(14, Math.round(c.width / 36));
    r.caras.forEach((cara, i) => {
      const [top, right, bottom, left] = cara.box, col = CAM_COLORS[i % CAM_COLORS.length];
      const x = left * sx, y = top * sy, bw = (right - left) * sx, bh = (bottom - top) * sy;
      g.lineWidth = i === sel ? lw * 1.8 : lw; g.strokeStyle = col; g.strokeRect(x, y, bw, bh);
      g.font = `bold ${fs}px Tahoma, Verdana, sans-serif`;
      const txt = String(i + 1), tw = g.measureText(txt).width + 12;
      g.fillStyle = col; g.fillRect(x, Math.max(0, y - fs - 8), tw, fs + 8);
      g.fillStyle = "#1b1b3a"; g.fillText(txt, x + 6, Math.max(fs, y - 6));
    });
  }

  function showUpload() {
    const r = up.res, n = r.caras.length;
    if (!n) {
      drawUpload(-1);
      $("#upResult").hidden = false;
      ["#upFaces", "#upList"].forEach((s) => { $(s).innerHTML = ""; });
      $("#upVerdict").textContent = "No se detectó ninguna cara. Prueba con una foto de frente y con buena luz";
      $("#upInfo").textContent = "";
      $("#upStatus").textContent = "";
      return;
    }
    const seg = $("#upFaces");
    seg.innerHTML = '<legend class="sr">Cara</legend>';
    seg.hidden = n < 2;
    r.caras.forEach((_, i) => {
      const lab = document.createElement("label");
      lab.innerHTML = `<input type="radio" name="upFace" value="${i}"${i ? "" : " checked"}><span>Cara ${i + 1}</span>`;
      lab.querySelector("span").style.setProperty("--c", CAM_COLORS[i % CAM_COLORS.length]);
      lab.querySelector("input").addEventListener("change", () => showUpFace(i));
      seg.append(lab);
    });
    $("#upStatus").textContent = `${n} cara${n > 1 ? "s" : ""} detectada${n > 1 ? "s" : ""}` + (n > 1 ? ", elige cuál ver" : "");
    $("#upResult").hidden = false;
    showUpFace(0);
  }

  function showUpFace(i) {
    const r = up.res, cara = r.caras[i], m = r.ms, umbral = up.info.umbral;
    drawUpload(i);
    const list = $("#upList");
    list.innerHTML = "";
    cara.dobles.forEach((d) => {
      const li = document.createElement("li");
      li.append(face({ img: CAM_API + d.img }, nice(d.name), "mini"));
      li.insertAdjacentHTML("beforeend",
        `<div><div class="twin-name"><span></span><b>${fmt(d.dist, 3)}</b></div>
         <div class="bar"><div class="bar-fill" style="width:${Math.min(100, d.dist * 100)}%"></div><div class="bar-th" style="left:${umbral * 100}%"></div></div></div>`);
      li.querySelector(".twin-name span").textContent = nice(d.name);
      list.append(li);
    });
    const top = cara.dobles[0], quien = r.caras.length > 1 ? `de la cara ${i + 1} ` : "";
    const bajo = cara.dobles.filter((d) => d.dist < umbral).length;
    $("#upVerdict").innerHTML = top
      ? `El doble ${quien}es <b></b> con distancia <b>${fmt(top.dist, 3)}</b>. ` +
        (top.dist < umbral
          ? `Está bajo ${umbral}, así que para el modelo serían la misma persona` + (bajo > 1 ? ` (y ${bajo - 1} más también quedan bajo el umbral)` : "")
          : `Está sobre ${umbral}, así que es parecido pero el modelo no los confunde`)
      : "No se encontraron dobles";
    if (top) $("#upVerdict b").textContent = nice(top.name);
    $("#upInfo").textContent = `HNSW (m = ${up.info.m}, ef_search = ${up.info.candidatos_subida}) · ${up.info.candidatos_subida} fotos candidatas agrupadas por persona · ` +
      `detección ${fmt(m.deteccion, 1)} ms · embedding ${fmt(m.embedding, 1)} ms · búsqueda ${fmt(m.busqueda, 1)} ms · total ${fmt(r.roundtrip, 0)} ms`;
  }

  const INIT = { finder: initFinder, recall: initRecall, scale: initScale, howto: () => { initIvf(); initHnsw(); }, twin: initTwin, cam: initCam, upload: initUpload, readme: initReadme };
})();
