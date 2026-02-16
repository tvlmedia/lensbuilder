/* Meridional Raytracer (2D) — TVL Lens Builder (patched)
   Patch: Element modal upgraded for achromats
   - Adds FRONT AIR (mm) input (injected into modal UI; no HTML edit needed)
   - Adds Achromat (cemented, 3 surfaces) + Achromat (air-spaced, 4 surfaces)
   - Removes the old 0.01mm "hack" surface for cemented achromats
   - Front air is inserted as an AIR gap surface BEFORE the element chunk
*/

const $ = (sel) => document.querySelector(sel);
const on = (sel, ev, fn) => {
  const el = $(sel);
  if (el) el.addEventListener(ev, fn);
  return el;
};

// structuredClone fallback
const clone = (obj) =>
  typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

// -------------------- Preview canvas --------------------
const previewCanvas = $("#previewCanvas");
const pctx = previewCanvas?.getContext("2d");

const preview = {
  img: null,
  imgCanvas: document.createElement("canvas"),
  imgCtx: null,
  ready: false,
};

preview.imgCtx = preview.imgCanvas.getContext("2d");

// -------------------- UI --------------------
const ui = {
  tbody: $("#surfTbody"),
  status: $("#statusText"),

  efl: $("#badgeEfl"),
  bfl: $("#badgeBfl"),
  tstop: $("#badgeT"),
  vig: $("#badgeVig"),
  fov: $("#badgeFov"),
  cov: $("#badgeCov"),

  footerWarn: $("#footerWarn"),
  metaInfo: $("#metaInfo"),

  eflTop: $("#badgeEflTop"),
  bflTop: $("#badgeBflTop"),
  tstopTop: $("#badgeTTop"),
  fovTop: $("#badgeFovTop"),
  covTop: $("#badgeCovTop"),

  sensorPreset: $("#sensorPreset"),
  sensorW: $("#sensorW"),
  sensorH: $("#sensorH"),

  fieldAngle: $("#fieldAngle"),
  rayCount: $("#rayCount"),
  wavePreset: $("#wavePreset"),
  sensorOffset: $("#sensorOffset"),
  renderScale: $("#renderScale"),
};

let selectedIndex = 0;

// -------------------- sensor presets --------------------
const SENSOR_PRESETS = {
  "ARRI Alexa Mini (S35)": { w: 28.25, h: 18.17 },
  "ARRI Alexa Mini LF (LF)": { w: 36.7, h: 25.54 },
  "Sony VENICE (FF)": { w: 36.0, h: 24.0 },
  "Fuji GFX (MF)": { w: 43.8, h: 32.9 },
};

function populateSensorPresetsSelect() {
  if (!ui.sensorPreset) return;
  const keys = Object.keys(SENSOR_PRESETS);
  ui.sensorPreset.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
  const cur = ui.sensorPreset.value;
  if (!SENSOR_PRESETS[cur]) ui.sensorPreset.value = keys[0] || "ARRI Alexa Mini LF (LF)";
}

function getSensorWH() {
  const w = Number(ui.sensorW?.value || 36.7);
  const h = Number(ui.sensorH?.value || 25.54);
  return { w, h, halfH: Math.max(0.1, h * 0.5) };
}

function syncIMSCellApertureToUI() {
  if (!ui.tbody || !lens?.surfaces?.length) return;
  const i = lens.surfaces.length - 1;
  const s = lens.surfaces[i];
  if (!s || String(s.type).toUpperCase() !== "IMS") return;
  const apInput = ui.tbody.querySelector(`input.cellInput[data-k="ap"][data-i="${i}"]`);
  if (apInput) apInput.value = Number(s.ap || 0).toFixed(2);
}

function applySensorToIMS() {
  const { halfH } = getSensorWH();
  const ims = lens?.surfaces?.[lens.surfaces.length - 1];
  if (ims && String(ims.type).toUpperCase() === "IMS") {
    ims.ap = halfH;
    syncIMSCellApertureToUI();
  }
}

function applyPreset(name) {
  const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
  if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
  if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
  applySensorToIMS();
}

// -------------------- glass db --------------------
const GLASS_DB = {
  AIR: { nd: 1.0, Vd: 999.0 },
  BK7: { nd: 1.5168, Vd: 64.17 },
  F2: { nd: 1.62, Vd: 36.37 },
  SF10: { nd: 1.7283, Vd: 28.41 },
  LASF35: { nd: 1.8061, Vd: 25.4 },
  LASFN31: { nd: 1.8052, Vd: 25.3 },
  LF5: { nd: 1.58, Vd: 40.0 },
  "N-SF5": { nd: 1.67271, Vd: 32.25 },
  "S-LAM3": { nd: 1.717004, Vd: 47.927969 },
  "S-BAH11": { nd: 1.666718, Vd: 48.325247 },

  CZJ_1: { nd: 1.5182, Vd: 63.8 },
  CZJ_2: { nd: 1.6465, Vd: 47.5 },
  CZJ_3: { nd: 1.6055, Vd: 60.4 },
  CZJ_4: { nd: 1.7343, Vd: 28.1 },
  CZJ_5: { nd: 1.681, Vd: 54.7 },
  CZJ_6: { nd: 1.6229, Vd: 60.0 },
};

function glassN(glassName, preset /* d,g,c */) {
  const g = GLASS_DB[glassName] || GLASS_DB.AIR;
  if (glassName === "AIR") return 1.0;

  const base = g.nd;
  const strength = 1.0 / Math.max(10.0, g.Vd);
  if (preset === "g") return base + 35.0 * strength;
  if (preset === "c") return base - 20.0 * strength;
  return base;
}

// -------------------- built-in lenses --------------------
function demoLensSimple() {
  return {
    name: "Demo (simple)",
    surfaces: [
      { type: "OBJ", R: 0.0, t: 10.0, ap: 22.0, glass: "AIR", stop: false },
      { type: "1", R: 42.0, t: 10.0, ap: 22.0, glass: "LASF35", stop: false },
      { type: "2", R: -140.0, t: 10.0, ap: 21.0, glass: "AIR", stop: false },
      { type: "3", R: -30.0, t: 10.0, ap: 19.0, glass: "LASFN31", stop: false },
      { type: "STOP", R: 0.0, t: 10.0, ap: 14.0, glass: "AIR", stop: true },
      { type: "5", R: 12.42, t: 10.0, ap: 8.5, glass: "AIR", stop: false },
      { type: "AST", R: 0.0, t: 6.4, ap: 8.5, glass: "AIR", stop: false },
      { type: "7", R: -18.93, t: 10.0, ap: 11.0, glass: "LF5", stop: false },
      { type: "8", R: 59.6, t: 10.0, ap: 13.0, glass: "LASFN31", stop: false },
      { type: "9", R: -40.49, t: 10.0, ap: 13.0, glass: "AIR", stop: false },
      { type: "IMS", R: 0.0, t: 0.0, ap: 12.0, glass: "AIR", stop: false },
    ],
  };
}

function omit50ConceptV1() {
  return {
    name: "OMIT 50mm (concept v1 — scaled Double-Gauss base)",
    notes: [
      "Scaled from Double-Gauss base; used as geometric sanity for this 2D meridional tracer.",
      "Not optimized; coatings/stop/entrance pupil are not modeled.",
    ],
    surfaces: [
      { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },

      { type: "1", R: 37.4501, t: 4.49102, ap: 16.46707, glass: "S-LAM3", stop: false },
      { type: "2", R: 135.07984, t: 0.0499, ap: 16.46707, glass: "AIR", stop: false },

      { type: "3", R: 19.59581, t: 8.23852, ap: 13.72255, glass: "S-BAH11", stop: false },
      { type: "4", R: 0.0, t: 0.998, ap: 12.22555, glass: "N-SF5", stop: false },

      { type: "5", R: 12.7994, t: 5.48403, ap: 9.73054, glass: "AIR", stop: false },

      { type: "STOP", R: 0.0, t: 6.48703, ap: 9.28144, glass: "AIR", stop: true },

      { type: "7", R: -15.90319, t: 3.50798, ap: 9.23154, glass: "N-SF5", stop: false },
      { type: "8", R: 0.0, t: 4.48104, ap: 10.47904, glass: "S-LAM3", stop: false },
      { type: "9", R: -21.71158, t: 0.0499, ap: 10.47904, glass: "AIR", stop: false },

      { type: "10", R: 110.3493, t: 3.98204, ap: 11.47705, glass: "S-BAH11", stop: false },
      { type: "11", R: -44.30639, t: 30.6477, ap: 11.47705, glass: "AIR", stop: false },

      { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
    ],
  };
}

// -------------------- lens state --------------------
let lens = sanitizeLens(omit50ConceptV1());

// -------------------- sanitize/load --------------------
function sanitizeLens(obj) {
  const safe = {
    name: String(obj?.name ?? "No name"),
    notes: Array.isArray(obj?.notes) ? obj.notes.map(String) : [],
    surfaces: Array.isArray(obj?.surfaces) ? obj.surfaces : [],
  };

  safe.surfaces = safe.surfaces.map((s) => ({
    type: String(s?.type ?? ""),
    R: Number(s?.R ?? 0),
    t: Number(s?.t ?? 0),
    ap: Number(s?.ap ?? 10),
    glass: String(s?.glass ?? "AIR"),
    stop: Boolean(s?.stop ?? false),
  }));

  const firstStop = safe.surfaces.findIndex((s) => s.stop);
  if (firstStop >= 0) safe.surfaces.forEach((s, i) => { if (i !== firstStop) s.stop = false; });

  safe.surfaces.forEach((s, i) => { if (!s.type || !s.type.trim()) s.type = String(i); });

  if (safe.surfaces.length >= 1) safe.surfaces[0].type = "OBJ";
  const imsIdx = safe.surfaces.findIndex((s) => String(s.type).toUpperCase() === "IMS");
  if (imsIdx >= 0 && imsIdx !== safe.surfaces.length - 1) {
    const ims = safe.surfaces.splice(imsIdx, 1)[0];
    safe.surfaces.push(ims);
  }
  if (safe.surfaces.length >= 1) safe.surfaces[safe.surfaces.length - 1].type = "IMS";

  return safe;
}

function loadLens(obj) {
  lens = sanitizeLens(obj);
  selectedIndex = 0;

  clampAllApertures(lens.surfaces);
  buildTable();
  applySensorToIMS();
  renderAll();
}

// -------------------- table helpers --------------------
function clampSelected() {
  selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));
}
function enforceSingleStop(changedIndex) {
  if (!lens.surfaces[changedIndex]?.stop) return;
  lens.surfaces.forEach((s, i) => { if (i !== changedIndex) s.stop = false; });
}

// -------------------- number + focus helpers --------------------
function num(v, fallback = 0) {
  const s = String(v ?? "").trim().replace(",", ".");
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : fallback;
}

let _focusMemo = null;
function rememberTableFocus() {
  const a = document.activeElement;
  if (!a) return;
  if (!(a.classList && a.classList.contains("cellInput"))) return;
  _focusMemo = {
    i: a.dataset.i,
    k: a.dataset.k,
    ss: typeof a.selectionStart === "number" ? a.selectionStart : null,
    se: typeof a.selectionEnd === "number" ? a.selectionEnd : null,
  };
}
function restoreTableFocus() {
  if (!_focusMemo || !ui.tbody) return;
  const sel = `input.cellInput[data-i="${_focusMemo.i}"][data-k="${_focusMemo.k}"]`;
  const el = ui.tbody.querySelector(sel);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (_focusMemo.ss != null && _focusMemo.se != null) {
    try { el.setSelectionRange(_focusMemo.ss, _focusMemo.se); } catch (_) {}
  }
  _focusMemo = null;
}

// -------------------- table build + events --------------------
function buildTable() {
  clampSelected();
  if (!ui.tbody) return;

  rememberTableFocus();
  ui.tbody.innerHTML = "";

  lens.surfaces.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("selected", idx === selectedIndex);

    tr.addEventListener("click", (ev) => {
      if (["INPUT", "SELECT", "OPTION", "TEXTAREA"].includes(ev.target.tagName)) return;
      selectedIndex = idx;
      buildTable();
    });

    tr.innerHTML = `
      <td style="width:34px; font-family:var(--mono)">${idx}</td>
      <td style="width:72px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
      <td style="width:92px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}"></td>
      <td style="width:92px"><input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01" value="${s.t}"></td>
      <td style="width:92px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}"></td>
      <td style="width:110px">
        <select class="cellSelect" data-k="glass" data-i="${idx}">
          ${Object.keys(GLASS_DB).map((name) =>
            `<option value="${name}" ${name === s.glass ? "selected" : ""}>${name}</option>`
          ).join("")}
        </select>
      </td>
      <td class="cellChk" style="width:58px">
        <input type="checkbox" data-k="stop" data-i="${idx}" ${s.stop ? "checked" : ""}>
      </td>
    `;
    ui.tbody.appendChild(tr);
  });

  ui.tbody.querySelectorAll("input.cellInput").forEach((el) => {
    el.addEventListener("input", onCellInput);
    el.addEventListener("change", onCellCommit);
    el.addEventListener("blur", onCellCommit);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); onCellCommit(e); }
    });
  });

  ui.tbody.querySelectorAll("select.cellSelect").forEach((el) => el.addEventListener("change", onCellCommit));
  ui.tbody.querySelectorAll('input[type="checkbox"][data-k="stop"]').forEach((el) => el.addEventListener("change", onCellCommit));

  restoreTableFocus();
}

function onCellInput(e) {
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;

  selectedIndex = i;
  const s = lens.surfaces[i];
  if (!s) return;

  if (k === "type") s.type = el.value;
  else if (k === "R" || k === "t" || k === "ap") s[k] = num(el.value, s[k] ?? 0);
  else s[k] = num(el.value, s[k] ?? 0);

  applySensorToIMS();
  renderAll();
}

function onCellCommit(e) {
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;

  selectedIndex = i;
  const s = lens.surfaces[i];
  if (!s) return;

  if (k === "stop") { s.stop = !!el.checked; enforceSingleStop(i); }
  else if (k === "glass") s.glass = el.value;
  else if (k === "type") s.type = el.value;
  else s[k] = num(el.value, s[k] ?? 0);

  applySensorToIMS();
  clampAllApertures(lens.surfaces);
  buildTable();
  renderAll();
}

// -------------------- math helpers --------------------
function normalize(v) {
  const m = Math.hypot(v.x, v.y);
  if (m < 1e-12) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s }; }

function refract(I, N, n1, n2) {
  I = normalize(I);
  N = normalize(N);
  if (dot(I, N) > 0) N = mul(N, -1);
  const cosi = -dot(N, I);
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const T = add(mul(I, eta), mul(N, eta * cosi - Math.sqrt(k)));
  return normalize(T);
}

function intersectSurface(ray, surf) {
  const vx = surf.vx;
  const R = surf.R;
  const ap = Math.max(0, surf.ap);

  if (Math.abs(R) < 1e-9) {
    const t = (vx - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    const hit = add(ray.p, mul(ray.d, t));
    if (Math.abs(hit.y) > ap + 1e-9) return { hit, t, vignetted: true, normal: { x: -1, y: 0 } };
    return { hit, t, vignetted: false, normal: { x: -1, y: 0 } };
  }

  const cx = vx + R;
  const rad = Math.abs(R);

  const px = ray.p.x - cx;
  const py = ray.p.y;
  const dx = ray.d.x;
  const dy = ray.d.y;

  const A = dx * dx + dy * dy;
  const B = 2 * (px * dx + py * dy);
  const C = px * px + py * py - rad * rad;

  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;

  const sdisc = Math.sqrt(disc);
  const t1 = (-B - sdisc) / (2 * A);
  const t2 = (-B + sdisc) / (2 * A);

  let t = null;
  if (t1 > 1e-9 && t2 > 1e-9) t = Math.min(t1, t2);
  else if (t1 > 1e-9) t = t1;
  else if (t2 > 1e-9) t = t2;
  else return null;

  const hit = add(ray.p, mul(ray.d, t));
  const vignetted = Math.abs(hit.y) > ap + 1e-9;
  const Nout = normalize({ x: hit.x - cx, y: hit.y });
  return { hit, t, vignetted, normal: Nout };
}

function computeVertices(surfaces) {
  let x = 0;
  for (let i = 0; i < surfaces.length; i++) {
    surfaces[i].vx = x;
    x += Number(surfaces[i].t || 0);
  }
  return x;
}

function findStopSurfaceIndex(surfaces) {
  return surfaces.findIndex((s) => !!s.stop);
}

// -------------------- physical sanity clamps --------------------
const AP_SAFETY = 0.90;
const AP_MAX_PLANE = 30.0;
const AP_MIN = 0.01;

function maxApForSurface(s) {
  const R = Number(s?.R || 0);
  if (!Number.isFinite(R) || Math.abs(R) < 1e-9) return AP_MAX_PLANE;
  return Math.max(AP_MIN, Math.abs(R) * AP_SAFETY);
}
function clampSurfaceAp(s) {
  if (!s) return;
  const lim = maxApForSurface(s);
  const ap = Number(s.ap || 0);
  s.ap = Math.max(AP_MIN, Math.min(ap, lim));
}
function clampAllApertures(surfaces) {
  if (!Array.isArray(surfaces)) return;
  for (const s of surfaces) clampSurfaceAp(s);
}

function surfaceXatY(s, y) {
  const vx = s.vx;
  const R = s.R;
  if (Math.abs(R) < 1e-9) return vx;

  const cx = vx + R;
  const rad = Math.abs(R);
  const sign = Math.sign(R) || 1;
  const inside = rad * rad - y * y;
  if (inside < 0) return null;
  return cx - sign * Math.sqrt(inside);
}

function maxNonOverlappingSemiDiameter(sFront, sBack, minCT = 0.10) {
  const apGuess = Math.max(0.01, Math.min(Number(sFront.ap || 0), Number(sBack.ap || 0)));
  function gapAt(y) {
    const xf = surfaceXatY(sFront, y);
    const xb = surfaceXatY(sBack, y);
    if (xf == null || xb == null) return -1e9;
    return xb - xf;
  }
  if (gapAt(0) < minCT) return 0.01;
  if (gapAt(apGuess) >= minCT) return apGuess;

  let lo = 0, hi = apGuess;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) * 0.5;
    if (gapAt(mid) >= minCT) lo = mid;
    else hi = mid;
  }
  return Math.max(0.01, lo);
}

const AUTO_AP_FROM_OVERLAP = false;
function enforceElementAperturesFromGeometry(surfaces, minCT = 0.10) {
  if (!Array.isArray(surfaces)) return;

  for (let i = 0; i < surfaces.length - 1; i++) {
    const sA = surfaces[i];
    const sB = surfaces[i + 1];

    const typeA = String(sA.type || "").toUpperCase();
    const typeB = String(sB.type || "").toUpperCase();
    if (typeA === "OBJ" || typeB === "OBJ") continue;
    if (typeA === "IMS" || typeB === "IMS") continue;

    const medium = String(sA.glass || "AIR").toUpperCase();
    if (medium === "AIR") continue;

    const capA = maxApForSurface(sA);
    const capB = maxApForSurface(sB);

    let capOverlap = Infinity;
    if (Math.abs(Number(sA.R || 0)) > 1e-9 && Math.abs(Number(sB.R || 0)) > 1e-9) {
      capOverlap = maxNonOverlappingSemiDiameter(sA, sB, minCT);
    }

    const cap = Math.max(AP_MIN, Math.min(capA, capB, capOverlap));
    if (Number(sA.ap) > cap) sA.ap = cap;
    if (Number(sB.ap) > cap) sB.ap = cap;
  }
}

// -------------------- tracing --------------------
function traceRayThroughLens(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;
  let nBefore = 1.0;

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) { vignetted = true; break; }

    pts.push(hitInfo.hit);

    if (hitInfo.vignetted) { vignetted = true; break; }

    const nAfter = glassN(s.glass, wavePreset);

    if (Math.abs(nAfter - nBefore) < 1e-9) {
      ray = { p: hitInfo.hit, d: ray.d };
      nBefore = nAfter;
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
    if (!newDir) { tir = true; break; }

    ray = { p: hitInfo.hit, d: newDir };
    nBefore = nAfter;
  }
  return { pts, vignetted, tir, endRay: ray };
}

function traceRayThroughLensSkipIMS(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;
  let nBefore = 1.0;

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    const isIMS = String(s?.type || "").toUpperCase() === "IMS";

    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) { vignetted = true; break; }

    pts.push(hitInfo.hit);

    if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

    const nAfter = glassN(s.glass, wavePreset);

    if (Math.abs(nAfter - nBefore) < 1e-9) {
      ray = { p: hitInfo.hit, d: ray.d };
      nBefore = nAfter;
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
    if (!newDir) { tir = true; break; }

    ray = { p: hitInfo.hit, d: newDir };
    nBefore = nAfter;
  }
  return { pts, vignetted, tir, endRay: ray };
}

// -------------------- reverse tracing (sensor -> object) --------------------
function traceRayReverse(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;

  // medium on the RIGHT side of a surface while traveling left
  let nRight = 1.0; // sensor side is AIR

  for (let i = surfaces.length - 1; i >= 0; i--) {
    const s = surfaces[i];
    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) { vignetted = true; break; }
    pts.push(hitInfo.hit);
    if (hitInfo.vignetted) { vignetted = true; break; }

    // medium on the LEFT side of this surface (in forward direction: nBefore)
    const nLeft = (i === 0) ? 1.0 : glassN(surfaces[i - 1].glass, wavePreset);

    if (Math.abs(nLeft - nRight) < 1e-9) {
      ray = { p: hitInfo.hit, d: ray.d };
      nRight = nLeft;
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nRight, nLeft);
    if (!newDir) { tir = true; break; }

    ray = { p: hitInfo.hit, d: newDir };
    nRight = nLeft;
  }

  return { pts, vignetted, tir, endRay: ray };
}

function intersectPlaneX(ray, xPlane) {
  const t = (xPlane - ray.p.x) / ray.d.x;
  if (!Number.isFinite(t) || t <= 1e-9) return null;
  return add(ray.p, mul(ray.d, t));
}

// Map ONE sensor coordinate (mm) -> object-plane y (mm) using chief-ray through stop center
function sensorToObjectY_mm(sensorYmm, sensorX, xStop, xObjPlane, surfaces, wavePreset) {
  const dir = normalize({ x: xStop - sensorX, y: -sensorYmm });
  const r0 = { p: { x: sensorX, y: sensorYmm }, d: dir };
  const tr = traceRayReverse(r0, surfaces, wavePreset);
  if (tr.vignetted || tr.tir) return null;

  const hitObj = intersectPlaneX(tr.endRay, xObjPlane);
  if (!hitObj) return null;
  return hitObj.y;
}

// -------------------- ray bundles --------------------
function getRayReferencePlane(surfaces) {
  let refIdx = 1;
  if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
  const s = surfaces[refIdx] || surfaces[0];
  return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10)), refIdx };
}

function buildRays(surfaces, fieldAngleDeg, count) {
  const n = Math.max(3, Math.min(101, count | 0));
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 80;
  const { xRef, apRef } = getRayReferencePlane(surfaces);

  const hMax = apRef * 0.98;
  const rays = [];
  const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;

  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1)) * 2 - 1;
    const yAtRef = a * hMax;
    const y0 = yAtRef - tanT * (xRef - xStart);
    rays.push({ p: { x: xStart, y: y0 }, d: dir });
  }
  return rays;
}

function buildChiefRay(surfaces, fieldAngleDeg) {
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 120;
  const stopIdx = findStopSurfaceIndex(surfaces);
  const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
  const xStop = stopSurf.vx;

  const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;
  const y0 = 0 - tanT * (xStop - xStart);
  return { p: { x: xStart, y: y0 }, d: dir };
}

function rayHitYAtX(endRay, x) {
  if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
  const t = (x - endRay.p.x) / endRay.d.x;
  if (!Number.isFinite(t)) return null;
  return endRay.p.y + t * endRay.d.y;
}

function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH) {
  let lo = 0, hi = 60, best = 0;
  for (let iter = 0; iter < 18; iter++) {
    const mid = (lo + hi) * 0.5;
    const ray = buildChiefRay(surfaces, mid);
    const tr = traceRayThroughLens(clone(ray), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

    const y = rayHitYAtX(tr.endRay, sensorX);
    if (y == null) { hi = mid; continue; }
    if (Math.abs(y) <= halfH) { best = mid; lo = mid; }
    else hi = mid;
  }
  return best;
}

// -------------------- EFL/BFL (paraxial) --------------------
function lastPhysicalVertexX(surfaces) {
  if (!surfaces?.length) return 0;
  const last = surfaces[surfaces.length - 1];
  const isIMS = String(last?.type || "").toUpperCase() === "IMS";
  const idx = isIMS ? surfaces.length - 2 : surfaces.length - 1;
  return surfaces[Math.max(0, idx)]?.vx ?? 0;
}

function estimateEflBflParaxial(surfaces, wavePreset) {
  const lastVx = lastPhysicalVertexX(surfaces);
  const xStart = (surfaces[0]?.vx ?? 0) - 160;

  const heights = [0.25, 0.5, 0.75, 1.0, 1.25];
  const fVals = [];
  const xCrossVals = [];

  for (const y0 of heights) {
    const ray = { p: { x: xStart, y: y0 }, d: normalize({ x: 1, y: 0 }) };
    const tr = traceRayThroughLensSkipIMS(clone(ray), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;

    const er = tr.endRay;
    const dx = er.d.x, dy = er.d.y;
    if (Math.abs(dx) < 1e-12) continue;

    const uOut = dy / dx;
    if (Math.abs(uOut) < 1e-12) continue;

    const f = -y0 / uOut;
    if (Number.isFinite(f)) fVals.push(f);

    if (Math.abs(dy) > 1e-12) {
      const t = -er.p.y / dy;
      const xCross = er.p.x + t * dx;
      if (Number.isFinite(xCross)) xCrossVals.push(xCross);
    }
  }

  if (fVals.length < 2) return { efl: null, bfl: null };

  const efl = fVals.reduce((a, b) => a + b, 0) / fVals.length;

  let bfl = null;
  if (xCrossVals.length >= 2) {
    const xF = xCrossVals.reduce((a, b) => a + b, 0) / xCrossVals.length;
    bfl = xF - lastVx;
  }
  return { efl, bfl };
}

function estimateTStopApprox(efl, surfaces) {
  const stopIdx = findStopSurfaceIndex(surfaces);
  if (stopIdx < 0) return null;
  const stopAp = Math.max(1e-6, Number(surfaces[stopIdx].ap || 0));
  if (!Number.isFinite(efl) || efl <= 0) return null;
  const T = efl / (2 * stopAp);
  return Number.isFinite(T) ? T : null;
}

// -------------------- FOV --------------------
function rad2deg(r) { return (r * 180) / Math.PI; }
function computeFovDeg(efl, sensorW, sensorH) {
  if (!Number.isFinite(efl) || efl <= 0) return null;
  const diag = Math.hypot(sensorW, sensorH);
  const hfov = 2 * Math.atan(sensorW / (2 * efl));
  const vfov = 2 * Math.atan(sensorH / (2 * efl));
  const dfov = 2 * Math.atan(diag / (2 * efl));
  return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
}

function coversSensorYesNo({ fov, maxField, mode = "diag", marginDeg = 0.5 }) {
  if (!fov || !Number.isFinite(maxField)) return { ok: false, req: null };
  let req = null;
  if (mode === "h") req = fov.hfov * 0.5;
  else if (mode === "v") req = fov.vfov * 0.5;
  else req = fov.dfov * 0.5;
  const ok = maxField + marginDeg >= req;
  return { ok, req };
}

// -------------------- autofocus --------------------
function spotRmsAtSensorX(traces, sensorX) {
  const ys = [];
  for (const tr of traces) {
    if (!tr || tr.vignetted || tr.tir) continue;
    const y = rayHitYAtX(tr.endRay, sensorX);
    if (y == null) continue;
    ys.push(y);
  }
  if (ys.length < 5) return { rms: null, n: ys.length };
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const rms = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
  return { rms, n: ys.length };
}

function autoFocusSensorOffset() {
  computeVertices(lens.surfaces);

  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map((r) => traceRayThroughLens(clone(r), lens.surfaces, wavePreset));

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const baseX = ims?.vx ?? 0;

  const current = Number(ui.sensorOffset?.value || 0);
  const range = 80;
  const coarseStep = 0.5;
  const fineStep = 0.05;

  let best = { off: current, rms: Infinity, n: 0 };

  function scan(center, halfRange, step) {
    const start = center - halfRange;
    const end = center + halfRange;
    for (let off = start; off <= end + 1e-9; off += step) {
      const sensorX = baseX + off;
      const { rms, n } = spotRmsAtSensorX(traces, sensorX);
      if (rms == null) continue;
      if (rms < best.rms) best = { off, rms, n };
    }
  }

  scan(current, range, coarseStep);
  if (Number.isFinite(best.rms)) scan(best.off, 3.0, fineStep);

  if (!Number.isFinite(best.rms) || best.n < 5) {
    if (ui.footerWarn) ui.footerWarn.textContent = "Auto focus failed (too few valid rays). Try more rays / larger apertures.";
    return;
  }

  if (ui.sensorOffset) ui.sensorOffset.value = best.off.toFixed(2);
  if (ui.footerWarn) ui.footerWarn.textContent = `Auto focus: sensorOffset=${best.off.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;
  renderAll();
}

// -------------------- drawing --------------------
let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

function resizeCanvasToCSS() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(2, Math.floor(r.width * dpr));
  canvas.height = Math.max(2, Math.floor(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function worldToScreen(p, world) {
  const { cx, cy, s } = world;
  return { x: cx + p.x * s, y: cy - p.y * s };
}
function makeWorldTransform() {
  const r = canvas.getBoundingClientRect();
  const cx = r.width / 2 + view.panX;
  const cy = r.height / 2 + view.panY;
  const base = Number(ui.renderScale?.value || 1.25) * 3.2;
  const s = base * view.zoom;
  return { cx, cy, s };
}

function drawAxes(world) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(20,25,35,.28)";
  ctx.beginPath();
  const p1 = worldToScreen({ x: -240, y: 0 }, world);
  const p2 = worldToScreen({ x: 800, y: 0 }, world);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

function buildSurfacePolyline(s, ap, steps = 90) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = -ap + (i / steps) * (2 * ap);
    const x = surfaceXatY(s, y);
    if (x == null) continue;
    pts.push({ x, y });
  }
  return pts;
}

function drawElementBody(world, sFront, sBack, apRegion) {
  const front = buildSurfacePolyline(sFront, apRegion, 90);
  const back = buildSurfacePolyline(sBack, apRegion, 90);
  if (front.length < 2 || back.length < 2) return;
  const poly = front.concat(back.slice().reverse());

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  let p0 = worldToScreen(poly[0], world);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < poly.length; i++) {
    const p = worldToScreen(poly[i], world);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#1b1b1b";
  ctx.stroke();
  ctx.restore();
}

function drawElementsClosed(world, surfaces) {
  let minNonOverlap = Infinity;

  for (let i = 0; i < surfaces.length - 1; i++) {
    const sA = surfaces[i];
    const sB = surfaces[i + 1];

    const typeA = String(sA.type || "").toUpperCase();
    const typeB = String(sB.type || "").toUpperCase();

    if (typeA === "OBJ" || typeB === "OBJ") continue;
    if (typeA === "IMS" || typeB === "IMS") continue;

    const medium = String(sA.glass || "AIR").toUpperCase();
    if (medium === "AIR") continue;

    const apA = Math.max(0, Number(sA.ap || 0));
    const apB = Math.max(0, Number(sB.ap || 0));
    const limA = maxApForSurface(sA);
    const limB = maxApForSurface(sB);

    let apRegion = Math.max(0.01, Math.min(apA, apB, limA, limB));

    if (Math.abs(sA.R) > 1e-9 && Math.abs(sB.R) > 1e-9) {
      const nonOverlap = maxNonOverlappingSemiDiameter(sA, sB, 0.10);
      minNonOverlap = Math.min(minNonOverlap, nonOverlap);
      apRegion = Math.min(apRegion, nonOverlap);
    }

    drawElementBody(world, sA, sB, apRegion);
  }

  if (Number.isFinite(minNonOverlap) && minNonOverlap < 0.5 && ui.footerWarn) {
    ui.footerWarn.textContent =
      "WARNING: element surfaces overlap / too thin somewhere — increase t or reduce curvature/aperture.";
  }
}

function drawSurface(world, s) {
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#1b1b1b";

  const vx = s.vx;
  const ap = Math.min(Math.max(0, Number(s.ap || 0)), maxApForSurface(s));

  if (Math.abs(s.R) < 1e-9) {
    const a = worldToScreen({ x: vx, y: -ap }, world);
    const b = worldToScreen({ x: vx, y: ap }, world);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const R = s.R;
  const cx = vx + R;
  const rad = Math.abs(R);
  const sign = Math.sign(R) || 1;

  const steps = 90;
  ctx.beginPath();
  let moved = false;
  for (let i = 0; i <= steps; i++) {
    const y = -ap + (i / steps) * (2 * ap);
    const inside = rad * rad - y * y;
    if (inside < 0) continue;
    const x = cx - sign * Math.sqrt(inside);
    const sp = worldToScreen({ x, y }, world);
    if (!moved) { ctx.moveTo(sp.x, sp.y); moved = true; }
    else ctx.lineTo(sp.x, sp.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLens(world, surfaces) {
  drawElementsClosed(world, surfaces);
  for (const s of surfaces) drawSurface(world, s);
}

function drawRays(world, rayTraces, sensorX) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2a6ef2";

  for (const tr of rayTraces) {
    if (!tr.pts || tr.pts.length < 2) continue;
    ctx.globalAlpha = tr.vignetted ? 0.15 : 0.9;

    ctx.beginPath();
    const p0 = worldToScreen(tr.pts[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < tr.pts.length; i++) {
      const p = worldToScreen(tr.pts[i], world);
      ctx.lineTo(p.x, p.y);
    }

    const last = tr.endRay;
    if (last && Number.isFinite(sensorX) && last.d && Math.abs(last.d.x) > 1e-9) {
      const t = (sensorX - last.p.x) / last.d.x;
      if (t > 0) {
        const hit = add(last.p, mul(last.d, t));
        const ps = worldToScreen(hit, world);
        ctx.lineTo(ps.x, ps.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawStop(world, surfaces) {
  const idx = findStopSurfaceIndex(surfaces);
  if (idx < 0) return;
  const s = surfaces[idx];
  const ap = Math.max(0, s.ap);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#b23b3b";
  const a = worldToScreen({ x: s.vx, y: -ap }, world);
  const b = worldToScreen({ x: s.vx, y: ap }, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawSensor(world, sensorX, halfH) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.setLineDash([6, 6]);

  const a = worldToScreen({ x: sensorX, y: -halfH }, world);
  const b = worldToScreen({ x: sensorX, y: halfH }, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.25;
  const l1 = worldToScreen({ x: sensorX - 2.5, y: halfH }, world);
  const l2 = worldToScreen({ x: sensorX + 2.5, y: halfH }, world);
  const l3 = worldToScreen({ x: sensorX - 2.5, y: -halfH }, world);
  const l4 = worldToScreen({ x: sensorX + 2.5, y: -halfH }, world);

  ctx.beginPath();
  ctx.moveTo(l1.x, l1.y);
  ctx.lineTo(l2.x, l2.y);
  ctx.moveTo(l3.x, l3.y);
  ctx.lineTo(l4.x, l4.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

function drawTitleOverlay(text) {
  ctx.save();
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace";
  ctx.font = "14px " + mono;
  ctx.fillStyle = "#333";
  ctx.fillText(text, 14, 20);
  ctx.restore();
}

// -------------------- render --------------------
function renderAll() {
  if (ui.footerWarn) ui.footerWarn.textContent = "";

  computeVertices(lens.surfaces);
  clampSelected();

  const { w: sensorW, h: sensorH, halfH } = getSensorWH();
  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";
  const sensorOffset = Number(ui.sensorOffset?.value || 0);

  applySensorToIMS();
  clampAllApertures(lens.surfaces);

  if (AUTO_AP_FROM_OVERLAP) enforceElementAperturesFromGeometry(lens.surfaces, 0.10);

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (ims?.vx ?? 0) + sensorOffset;

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map((r) => traceRayThroughLens(clone(r), lens.surfaces, wavePreset));

  const vCount = traces.filter((t) => t.vignetted).length;
  const tirCount = traces.filter((t) => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
  const T = estimateTStopApprox(efl, lens.surfaces);

  const fov = computeFovDeg(efl, sensorW, sensorH);
  const fovTxt = !fov ? "FOV: —" : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

  const maxField = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, halfH);
  const covMode = "v";
  const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

  const covTxt = !fov
    ? "COV(V): —"
    : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

  if (ui.efl) ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
  if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
  if (ui.fov) ui.fov.textContent = fovTxt;
  if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

  if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
  if (ui.fovTop) ui.fovTop.textContent = fovTxt;
  if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (covers ? "COV: YES" : "COV: NO");

  if (tirCount > 0 && ui.footerWarn) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  if (ui.status) {
    ui.status.textContent = `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • ${covTxt}`;
  }
  if (ui.metaInfo) ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;

  resizeCanvasToCSS();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const world = makeWorldTransform();
  drawAxes(world);
  drawLens(world, lens.surfaces);
  drawStop(world, lens.surfaces);
  drawRays(world, traces, sensorX);
  drawSensor(world, sensorX, halfH);

  const eflTxt = efl == null ? "—" : efl.toFixed(2) + "mm";
  const bflTxt = bfl == null ? "—" : bfl.toFixed(2) + "mm";
  const tTxt = T == null ? "—" : "T" + T.toFixed(2);
  drawTitleOverlay(
    `${lens.name} • EFL ${eflTxt} • BFL ${bflTxt} • ${fovTxt} • ${covTxt} • T≈ ${tTxt} • sensorX=${sensorX.toFixed(2)}mm`
  );
}

// -------------------- view controls --------------------
function bindViewControls() {
  canvas.addEventListener("mousedown", (e) => {
    view.dragging = true;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
  });
  window.addEventListener("mouseup", () => { view.dragging = false; });

  window.addEventListener("mousemove", (e) => {
    if (!view.dragging) return;
    const dx = e.clientX - view.lastX;
    const dy = e.clientY - view.lastY;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    view.panX += dx;
    view.panY += dy;
    renderAll();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = delta > 0 ? 0.92 : 1.08;
    view.zoom = Math.max(0.12, Math.min(12, view.zoom * factor));
    renderAll();
  }, { passive: false });

  canvas.addEventListener("dblclick", () => {
    view.panX = 0; view.panY = 0; view.zoom = 1.0;
    renderAll();
  });
}

// -------------------- edit helpers --------------------
function isProtectedIndex(i) {
  const t = String(lens.surfaces[i]?.type || "").toUpperCase();
  return t === "OBJ" || t === "IMS";
}

function getIMSIndex() {
  return lens.surfaces.findIndex((s) => String(s.type).toUpperCase() === "IMS");
}
function safeInsertAtAfterSelected() {
  clampSelected();
  let insertAt = selectedIndex + 1;
  const imsIdx = getIMSIndex();
  if (imsIdx >= 0) insertAt = Math.min(insertAt, imsIdx);
  insertAt = Math.max(1, insertAt);
  return insertAt;
}

function insertSurface(atIndex, surfaceObj) {
  lens.surfaces.splice(atIndex, 0, surfaceObj);
  selectedIndex = atIndex;
  buildTable();
  applySensorToIMS();
  renderAll();
}
function insertAfterSelected(surfaceObj) {
  const at = safeInsertAtAfterSelected();
  insertSurface(at, surfaceObj);
}

// -------------------- +ELEMENT MODAL --------------------
// IDs are your HTML ones
const EL_UI_IDS = {
  modal: "#elementModal",
  type: "#elType",
  mode: "#elMode",
  f: "#elF",
  ap: "#elAp",
  ct: "#elCt",
  gap: "#elGap",
  rear: "#elAir",
  form: "#elForm",
  g1: "#elGlass1",
  g2: "#elGlass2",
  note: "#elGlassNote",
  cancel: "#elClose",
  insert: "#elAdd",
};

const elUI = {
  modal: $(EL_UI_IDS.modal),
  type: $(EL_UI_IDS.type),
  mode: $(EL_UI_IDS.mode),
  f: $(EL_UI_IDS.f),
  ap: $(EL_UI_IDS.ap),
  ct: $(EL_UI_IDS.ct),
  gap: $(EL_UI_IDS.gap),
  rear: $(EL_UI_IDS.rear),
  form: $(EL_UI_IDS.form),
  g1: $(EL_UI_IDS.g1),
  g2: $(EL_UI_IDS.g2),
  note: $(EL_UI_IDS.note),
  cancel: $(EL_UI_IDS.cancel),
  insert: $(EL_UI_IDS.insert),

  // injected
  front: null,

     // preview UI
  tabRays: $("#tabRays"),
  tabPreview: $("#tabPreview"),
  previewCanvas: $("#previewCanvas"),
  prevImg: $("#prevImg"),
  prevObjDist: $("#prevObjDist"),
  prevObjH: $("#prevObjH"),
  prevRes: $("#prevRes"),
  btnRenderPreview: $("#btnRenderPreview"),
};

function setRightTab(mode /* 'rays' | 'preview' */) {
  const isPreview = mode === "preview";

 if (elUI.tabRays) elUI.tabRays.classList.toggle("active", !isPreview);
if (elUI.tabPreview) elUI.tabPreview.classList.toggle("active", isPreview);

  if (canvas) canvas.classList.toggle("hiddenCanvas", isPreview);
  if (previewCanvas) previewCanvas.classList.toggle("hiddenCanvas", !isPreview);

  // overlay tekst aanpassen
  const oh = $("#overlayHelp");
  if (oh) {
    oh.textContent = isPreview
      ? "Preview: upload image → set object distance/height → Render Preview • (stap 2 = DOF blur)"
      : "Tips: zet stop op “STOP” surface • IMS ap = sensor half-height • “Scale → FL” fixeert focal drift";
  }
}

function renderPreview() {
  if (!pctx || !previewCanvas) return;

  computeVertices(lens.surfaces);

  const wavePreset = ui.wavePreset?.value || "d";
  const sensorOffset = Number(ui.sensorOffset?.value || 0);

  const { w: sensorW, h: sensorH } = getSensorWH();
  const ims = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (ims?.vx ?? 0) + sensorOffset;

  const stopIdx = findStopSurfaceIndex(lens.surfaces);
  const xStop = (stopIdx >= 0 ? lens.surfaces[stopIdx].vx : (lens.surfaces[0]?.vx ?? 0) + 10);

  const objDist = Math.max(1, Number(elUI.prevObjDist?.value || 2000)); // mm
const objH    = Math.max(1, Number(elUI.prevObjH?.value || 500));     // full height in mm
const halfObjH = objH * 0.5;

const base = Number(elUI.prevRes?.value || 384);

const xObjPlane = (lens.surfaces[0]?.vx ?? 0) - objDist;

// preview resolution
const aspect = sensorW / sensorH;
const W = Math.max(64, Math.round(base * aspect));
const H = Math.max(64, base);

  previewCanvas.width = W;
  previewCanvas.height = H;

  // need an uploaded image
  const hasImg = preview.ready && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0;

  const imgW = preview.imgCanvas.width;
  const imgH = preview.imgCanvas.height;
  const imgData = hasImg ? preview.imgCtx.getImageData(0, 0, imgW, imgH).data : null;

  // helper: sample uploaded image at normalized coords
  function sample(u, v) {
    if (!hasImg) return [20, 20, 20, 255];
    if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0, 255];

    const x = u * (imgW - 1);
    const y = v * (imgH - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(imgW - 1, x0 + 1);
    const y1 = Math.min(imgH - 1, y0 + 1);
    const tx = x - x0, ty = y - y0;

    function px(ix, iy) {
      const o = (iy * imgW + ix) * 4;
      return [imgData[o], imgData[o + 1], imgData[o + 2], imgData[o + 3]];
    }

    const c00 = px(x0, y0), c10 = px(x1, y0), c01 = px(x0, y1), c11 = px(x1, y1);
    const lerp = (a, b, t) => a + (b - a) * t;

    const c0 = c00.map((v0, i) => lerp(v0, c10[i], tx));
    const c1 = c01.map((v0, i) => lerp(v0, c11[i], tx));
    return c0.map((v0, i) => lerp(v0, c1[i], ty));
  }

  const out = pctx.createImageData(W, H);
  const outD = out.data;

  // render: for each pixel, map sensor(x,y) -> object(x,y) via 2 symmetric meridional traces
  for (let j = 0; j < H; j++) {
    const ny = (j / (H - 1)) * 2 - 1;        // -1..1
    const sensorYmm = ny * (sensorH * 0.5);  // mm

    for (let i = 0; i < W; i++) {
      const nx = (i / (W - 1)) * 2 - 1;
      const sensorXmm_local = nx * (sensorW * 0.5);

      // vertical mapping
      const yObj = sensorToObjectY_mm(sensorYmm, sensorX, xStop, xObjPlane, lens.surfaces, wavePreset);
      // horizontal mapping (symmetry trick: reuse meridional with "y = sensorXmm_local")
      const xObj = sensorToObjectY_mm(sensorXmm_local, sensorX, xStop, xObjPlane, lens.surfaces, wavePreset);

      let r = 0, g = 0, b = 0, a = 255;

      if (yObj == null || xObj == null) {
        // vignetted / no hit -> black
        r = g = b = 0;
      } else {
        // map object coords to uploaded image UV
        const u = 0.5 + (xObj / (2 * halfObjH));
        const v = 0.5 - (yObj / (2 * halfObjH));
        const c = sample(u, v);
        r = c[0]; g = c[1]; b = c[2]; a = c[3];
      }

      const o = (j * W + i) * 4;
      outD[o] = r;
      outD[o + 1] = g;
      outD[o + 2] = b;
      outD[o + 3] = a;
    }
  }

  pctx.putImageData(out, 0, 0);
}

function modalExists() {
  return !!(elUI.modal && elUI.insert && elUI.cancel && elUI.type && elUI.mode && elUI.f && elUI.ap && elUI.ct);
}

function ensureFrontAirFieldInjected() {
  if (!modalExists()) return;
  if (elUI.front) return;

  // Find the modal grid where fields live
  const grid = elUI.modal.querySelector(".modalGrid");
  if (!grid) return;

  // Create a new field block consistent with your HTML structure
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `
    <label>Front air (mm)</label>
    <input id="elFrontAir" class="cellInput" type="number" step="0.01" value="0" />
  `;
  // Put it right above "Rear air to next" if possible
  const rearField = elUI.rear?.closest(".field");
  if (rearField && rearField.parentElement === grid) {
    grid.insertBefore(wrap, rearField);
  } else {
    grid.appendChild(wrap);
  }

  elUI.front = wrap.querySelector("#elFrontAir");
}

function updateElementModalNote() {
  if (!elUI.note) return;
  const t = String(elUI.type?.value || "");
  const frontAir = Number(elUI.front?.value || 0);
  const gap = Number(elUI.gap?.value || 0);

  let msg = "";
  msg += `Front air: ${frontAir.toFixed(2)}mm (inserted as AIR surface before element)\n`;
  if (t === "achromat_cemented") msg += `Cemented achromat: 3 surfaces (no internal air gap)\n`;
  if (t === "achromat") msg += `Air-spaced achromat: 4 surfaces, internal gap = ${gap.toFixed(2)}mm\n`;
  msg += `Tip: f/2 @ 35mm => stop ap ≈ 8.75mm (semi-diam) (your T≈ formula)\n`;
  elUI.note.value = msg;
}

function openElementModal() {
  if (!modalExists()) return false;

  ensureFrontAirFieldInjected();

  // Fill glass dropdowns once
  if (elUI.g1 && elUI.g2 && !elUI.g1.dataset._filled) {
    const keys = Object.keys(GLASS_DB);
    elUI.g1.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
    elUI.g2.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
    elUI.g1.value = "BK7";
    elUI.g2.value = "F2";
    elUI.g1.dataset._filled = "1";
  }

  // Type options (patched)
 if (elUI.type && !elUI.type.dataset._patched) {
  elUI.type.innerHTML = `
    <option value="achromat">Achromat (air-spaced, 4 surfaces)</option>
    <option value="achromat_cemented">Achromat (cemented, 3 surfaces)</option>
    <option value="singlet">Singlet (2 surfaces)</option>
    <option value="stop">STOP (1 surface)</option>
    <option value="airgap">Air gap (1 surface)</option>
  `;
  elUI.type.value = "achromat";
  elUI.type.dataset._patched = "1";
}

if (elUI.mode && !elUI.mode.dataset._patched) {
  elUI.mode.innerHTML = `
    <option value="auto">Auto</option>
    <option value="custom">Custom</option>
  `;
  elUI.mode.value = "auto";
  elUI.mode.dataset._patched = "1";
}

if (elUI.form && !elUI.form.dataset._patched) {
  elUI.form.innerHTML = `
    <option value="symmetric">Symmetric</option>
    <option value="weakmeniscus">Weak meniscus</option>
    <option value="plano">Plano-convex</option>
  `;
  elUI.form.value = "symmetric";
  elUI.form.dataset._patched = "1";
}

  // Defaults
  if (elUI.f) elUI.f.value = Number(elUI.f.value || 50);
  if (elUI.ap) elUI.ap.value = Number(elUI.ap.value || 18);
  if (elUI.ct) elUI.ct.value = Number(elUI.ct.value || 4);
  if (elUI.gap) elUI.gap.value = Number(elUI.gap.value || 0.2);
  if (elUI.rear) elUI.rear.value = Number(elUI.rear.value || 4);
  if (elUI.front) elUI.front.value = Number(elUI.front.value || 0);

  // Hook live note updates
  [elUI.type, elUI.gap, elUI.front, elUI.rear, elUI.ct].forEach((x) => {
    if (!x || x.dataset._noteBound) return;
    x.addEventListener("input", updateElementModalNote);
    x.addEventListener("change", updateElementModalNote);
    x.dataset._noteBound = "1";
  });
  updateElementModalNote();

  elUI.modal.classList.remove("hidden");
  elUI.modal.style.pointerEvents = "auto";
  elUI.modal.style.opacity = "1";
  return true;
}

function closeElementModal() {
  if (!elUI.modal) return;
  elUI.modal.classList.add("hidden");
  elUI.modal.style.pointerEvents = "";
  elUI.modal.style.opacity = "";
}

// ---- element math helpers ----
function radiusForSymmetricSinglet(f, n) {
  // thin-lens-ish starting point for biconvex: R ~ 2(n-1)f
  return 2 * Math.max(0.01, (n - 1)) * Math.max(1e-3, f);
}

function buildSingletAuto({ f, ap, ct, rearAir, form, glass1 }) {
  const n = GLASS_DB[glass1]?.nd ?? 1.5168;
  const Rbase = radiusForSymmetricSinglet(f, n);

  let R1 = +Rbase;
  let R2 = -Rbase;

  if (form === "weakmeniscus") { R1 = +Rbase * 1.25; R2 = -Rbase * 1.05; }
  if (form === "plano") { R1 = 0.0; R2 = -Rbase * 1.6; }

  const chunk = [
    { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
    { type: "", R: R2, t: rearAir, ap, glass: "AIR", stop: false },
  ];
  clampAllApertures(chunk);
  return chunk;
}

// NEW: cemented achromat (3 surfaces)
function buildAchromatCementedAuto({ f, ap, ct, rearAir, form, glass1, glass2 }) {
  const n1 = GLASS_DB[glass1]?.nd ?? 1.5168;
  const n2 = GLASS_DB[glass2]?.nd ?? 1.62;

  // crude split of power: front (+), rear (-) — but cemented
  // these are just a geometric "starter", not an optimized achromat design.
  const f1 = f * 0.85;
  const f2 = -f * 2.6;

  const R1b = radiusForSymmetricSinglet(f1, n1);
  const R3b = radiusForSymmetricSinglet(Math.abs(f2), n2);

  // three radii: front, cement interface, rear
  let R1 = +R1b;
  let R2 = -R1b * 0.85;   // cement interface (mostly set by first glass)
  let R3 = +R3b * 0.95;   // rear surface (second glass)

  // “forms” just tilt the balance a bit
  if (form === "weakmeniscus") { R1 *= 0.9; R2 *= 1.05; R3 *= 1.1; }
  if (form === "plano") { R1 = 0.0; R2 = -R1b * 1.35; R3 = +R3b * 1.05; }

  // OSLO-ish: glass = medium AFTER surface
  // S1 -> glass1, thickness ct
  // S2 -> glass2, thickness ct
  // S3 -> AIR, thickness rearAir
  const chunk = [
    { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
    { type: "", R: R2, t: ct, ap, glass: glass2, stop: false }, // cemented interface
    { type: "", R: R3, t: rearAir, ap, glass: "AIR", stop: false },
  ];

  clampAllApertures(chunk);
  return chunk;
}

// Air-spaced achromat (4 surfaces)
function buildAchromatAirSpacedAuto({ f, ap, ct, gap, rearAir, form, glass1, glass2 }) {
  const n1 = GLASS_DB[glass1]?.nd ?? 1.5168;
  const n2 = GLASS_DB[glass2]?.nd ?? 1.62;

  const f1 = f * 0.75;
  const f2 = -f * 2.2;

  const R1b = radiusForSymmetricSinglet(f1, n1);
  const R2b = radiusForSymmetricSinglet(Math.abs(f2), n2);

  let R1 = +R1b;
  let R2 = -R1b * 0.9;
  let R3 = -R2b * 0.9;
  let R4 = +R2b;

  if (form === "weakmeniscus") { R1 *= 0.95; R2 *= 1.05; R3 *= 1.05; R4 *= 0.95; }
  if (form === "plano") { R1 = 0.0; R2 = -R1b * 1.4; R3 = -R2b * 0.9; R4 = +R2b * 1.1; }

  const g = Math.max(0.0, Number(gap || 0));

  const chunk = [
    { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
    { type: "", R: R2, t: g,  ap, glass: "AIR", stop: false },
    { type: "", R: R3, t: ct, ap, glass: glass2, stop: false },
    { type: "", R: R4, t: rearAir, ap, glass: "AIR", stop: false },
  ];

  clampAllApertures(chunk);
  return chunk;
}

function readElementModalValues() {
  const f = Number(elUI.f?.value ?? 50);
  const ap = Number(elUI.ap?.value ?? 18);
  const ct = Number(elUI.ct?.value ?? 4);
  const gap = Number(elUI.gap?.value ?? 0);
  const rearAir = Number(elUI.rear?.value ?? 4);
  const frontAir = Number(elUI.front?.value ?? 0);

  const type = String(elUI.type?.value ?? "achromat").toLowerCase();
  const mode = String(elUI.mode?.value ?? "auto").toLowerCase();
  const form = String(elUI.form?.value ?? "symmetric").toLowerCase();

  const glass1 = String(elUI.g1?.value ?? "BK7");
  const glass2 = String(elUI.g2?.value ?? "F2");

  return { f, ap, ct, gap, rearAir, frontAir, type, mode, form, glass1, glass2 };
}

function insertElementFromModal() {
  const v = readElementModalValues();

  const f = v.f; // can be negative for some experiments; allow
  const ap = Math.max(0.1, v.ap);
  const ct = Math.max(0.05, v.ct);
  const gap = Math.max(0.0, v.gap);
  const rearAir = Math.max(0.0, v.rearAir);
  const frontAir = Math.max(0.0, v.frontAir);

  // --- helper: optionally insert FRONT AIR as its own surface ---
  function maybeInsertFrontAir(insertAt) {
    if (frontAir <= 0) return insertAt;
    lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: frontAir, ap: ap, glass: "AIR", stop: false });
    return insertAt + 1;
  }

  if (v.type === "stop") {
    let insertAt = safeInsertAtAfterSelected();
    insertAt = maybeInsertFrontAir(insertAt);
    lens.surfaces.splice(insertAt, 0, { type: "STOP", R: 0.0, t: rearAir, ap, glass: "AIR", stop: true });
    selectedIndex = insertAt;
    enforceSingleStop(insertAt);
     lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    renderAll();
    return;
  }

  if (v.type === "airgap") {
    let insertAt = safeInsertAtAfterSelected();
    insertAt = maybeInsertFrontAir(insertAt);
    lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: rearAir, ap, glass: "AIR", stop: false });
    selectedIndex = insertAt;
     lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    renderAll();
    return;
  }

  if (v.mode !== "auto") {
    if (ui.footerWarn) ui.footerWarn.textContent = "Custom mode not implemented yet (auto only).";
    return;
  }

  let chunk = null;

  if (v.type === "achromat_cemented") {
    chunk = buildAchromatCementedAuto({
      f, ap, ct,
      rearAir,
      form: v.form,
      glass1: v.glass1,
      glass2: v.glass2,
    });
  } else if (v.type.includes("achromat")) {
    chunk = buildAchromatAirSpacedAuto({
      f, ap, ct,
      gap,
      rearAir,
      form: v.form,
      glass1: v.glass1,
      glass2: v.glass2,
    });
  } else {
    chunk = buildSingletAuto({
      f, ap, ct,
      rearAir,
      form: v.form,
      glass1: v.glass1,
    });
  }

  if (!chunk || !Array.isArray(chunk) || chunk.length < 2) {
    if (ui.footerWarn) ui.footerWarn.textContent = "Element insert failed (check modal values).";
    return;
  }

  let insertAt = safeInsertAtAfterSelected();
  insertAt = maybeInsertFrontAir(insertAt);

  lens.surfaces.splice(insertAt, 0, ...chunk);
  selectedIndex = insertAt;

   lens = sanitizeLens(lens);
selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));

  buildTable();
  applySensorToIMS();
  renderAll();
}

// modal bindings
if (modalExists()) {
  elUI.cancel.addEventListener("click", (e) => { e.preventDefault(); closeElementModal(); });
  elUI.insert.addEventListener("click", (e) => {
    e.preventDefault();
    insertElementFromModal();
    closeElementModal();
  });

  elUI.modal.addEventListener("mousedown", (e) => { if (e.target === elUI.modal) closeElementModal(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elUI.modal && !elUI.modal.classList.contains("hidden")) closeElementModal();
  });
}

// -------------------- buttons --------------------
on("#btnAdd", "click", () => {
  insertAfterSelected({ type: "", R: 0, t: 5.0, ap: 12.0, glass: "AIR", stop: false });
});

on("#btnAddElement", "click", () => {
  if (openElementModal()) return;
  if (ui.footerWarn) ui.footerWarn.textContent = "Add Element modal not found in HTML (expected #elementModal etc).";
});

// New/Clear
function newClear() {
  lens = sanitizeLens({
    name: "New Lens (blank)",
    surfaces: [
      { type: "OBJ",  R: 0.0, t: 0.0,  ap: 60.0,  glass: "AIR", stop: false },
      { type: "STOP", R: 0.0, t: 20.0, ap: 8.0,   glass: "AIR", stop: true  },
      { type: "IMS",  R: 0.0, t: 0.0,  ap: 12.77, glass: "AIR", stop: false },
    ],
  });

  selectedIndex = 0;
  if (ui.fieldAngle) ui.fieldAngle.value = 0;
  if (ui.rayCount) ui.rayCount.value = 31;
  if (ui.wavePreset) ui.wavePreset.value = "d";
  if (ui.sensorOffset) ui.sensorOffset.value = 0;
  if (ui.renderScale) ui.renderScale.value = 1.25;

  view.panX = 0; view.panY = 0; view.zoom = 1.0;
  clampAllApertures(lens.surfaces);
  buildTable();
  applySensorToIMS();
  renderAll();
}
on("#btnNew", "click", newClear);

on("#btnDuplicate", "click", () => {
  clampSelected();
  const s = lens.surfaces[selectedIndex];
  if (!s) return;
  const copy = clone(s);
  lens.surfaces.splice(selectedIndex + 1, 0, copy);
  selectedIndex += 1;
  buildTable();
  applySensorToIMS();
  renderAll();
});

on("#btnMoveUp", "click", () => {
  clampSelected();
  if (selectedIndex <= 0) return;
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex - 1];
  lens.surfaces[selectedIndex - 1] = a;
  selectedIndex -= 1;
  buildTable();
  applySensorToIMS();
  renderAll();
});

on("#btnMoveDown", "click", () => {
  clampSelected();
  if (selectedIndex >= lens.surfaces.length - 1) return;
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex + 1];
  lens.surfaces[selectedIndex + 1] = a;
  selectedIndex += 1;
  buildTable();
  applySensorToIMS();
  renderAll();
});

on("#btnRemove", "click", () => {
  clampSelected();
  if (lens.surfaces.length <= 2) return;
  if (isProtectedIndex(selectedIndex)) {
    if (ui.footerWarn) ui.footerWarn.textContent = "OBJ/IMS kun je niet deleten.";
    return;
  }
  lens.surfaces.splice(selectedIndex, 1);
  selectedIndex = Math.max(0, selectedIndex - 1);
  buildTable();
  applySensorToIMS();
  renderAll();
});

on("#btnSave", "click", () => {
  const payload = JSON.stringify(lens, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (lens.name || "lens") + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

on("#btnAutoFocus", "click", () => autoFocusSensorOffset());
on("#btnLoadOmit", "click", () => { loadLens(omit50ConceptV1()); });
on("#btnLoadDemo", "click", () => { loadLens(demoLensSimple()); });

on("#fileLoad", "change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.surfaces)) throw new Error("Invalid JSON format.");

    // optional glass_note import
    if (obj.glass_note && typeof obj.glass_note === "object") {
      for (const [k, v] of Object.entries(obj.glass_note)) {
        const nd = Number(v?.nd);
        if (Number.isFinite(nd)) {
          GLASS_DB[k] = GLASS_DB[k] || { nd, Vd: 50.0 };
          GLASS_DB[k].nd = nd;
          if (!Number.isFinite(GLASS_DB[k].Vd)) GLASS_DB[k].Vd = 50.0;
        }
      }
    }

    loadLens(obj);
  } catch (err) {
    if (ui.footerWarn) ui.footerWarn.textContent = `Load failed: ${err.message}`;
  } finally {
    e.target.value = "";
  }
});

// -------------------- controls -> rerender --------------------
["fieldAngle", "rayCount", "wavePreset", "sensorOffset", "renderScale", "sensorW", "sensorH"].forEach((id) => {
  on("#" + id, "input", renderAll);
  on("#" + id, "change", renderAll);
});

on("#sensorPreset", "change", (e) => {
  applyPreset(e.target.value);
  clampAllApertures(lens.surfaces);
  renderAll();
});

window.addEventListener("resize", renderAll);

// -------------------- init --------------------
function init() {
  populateSensorPresetsSelect();
  applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");
  loadLens(lens);
  bindViewControls();

  // -------------------- preview events --------------------
  if (elUI.tabRays) elUI.tabRays.addEventListener("click", () => setRightTab("rays"));
if (elUI.tabPreview) elUI.tabPreview.addEventListener("click", () => setRightTab("preview"));

if (elUI.prevImg) {
  elUI.prevImg.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      preview.img = im;

      preview.imgCanvas.width = im.naturalWidth;
      preview.imgCanvas.height = im.naturalHeight;
      preview.imgCtx.clearRect(0, 0, preview.imgCanvas.width, preview.imgCanvas.height);
      preview.imgCtx.drawImage(im, 0, 0);

      preview.ready = true;
      URL.revokeObjectURL(url);
    };
    im.src = url;
  });
}

if (elUI.btnRenderPreview) {
  elUI.btnRenderPreview.addEventListener("click", () => {
    setRightTab("preview");
    renderPreview();
  });
}
}
init();
