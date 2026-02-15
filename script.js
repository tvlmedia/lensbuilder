/* Meridional Raytracer (2D) — TVL MVP (clean rebuild)
   - Optical axis: +x, height: y
   - Surfaces: spherical (R!=0) or plane (R=0)
   - Thickness t: distance to next surface vertex (along x)
   - Aperture ap: clear semi-diameter at surface
   - Glass column = medium AFTER the surface (OSLO-ish)
   - Stop-aware ray sampling: rays fill the first STOP surface
   - Built-in OMIT 50mm concept preset (no upload needed)
   - Sensor presets: Alexa Mini (S35), Fuji GFX, Alexa Mini LF, Sony VENICE
   - Focal length: shows EFL/BFL sanity (paraxial axis crossing)
   - T-stop: shows **approx** T ≈ EFL / (2 * stop semi-diameter) (no pupil imaging / no transmission)
*/

const $ = (sel) => document.querySelector(sel);
const on = (sel, ev, fn) => {
  const el = $(sel);
  if (el) el.addEventListener(ev, fn);
  return el;
};

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

const ui = {
  tbody: $("#surfTbody"),
  status: $("#statusText"),
  efl: $("#badgeEfl"),
  bfl: $("#badgeBfl"),
  tnum: $("#badgeT"),
  vig: $("#badgeVig"),
  footerWarn: $("#footerWarn"),

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
  // Values in mm (active image area)
  ALEXA_MINI:    { name: "ARRI Alexa Mini (S35)",  w: 28.25, h: 18.17 },
  ALEXA_MINI_LF: { name: "ARRI Alexa Mini LF",     w: 36.70, h: 25.54 },
  SONY_VENICE:   { name: "Sony VENICE (FF)",       w: 36.2,  h: 24.1  },
  FUJI_GFX:      { name: "Fujifilm GFX (MF)",      w: 43.8,  h: 32.9  },
  CUSTOM:        { name: "Custom",                 w: 28.25, h: 18.17 }
};

function getSensor() {
  const w = Number(ui.sensorW.value || 0);
  const h = Number(ui.sensorH.value || 0);
  return {
    w: Number.isFinite(w) && w > 0 ? w : 28.25,
    h: Number.isFinite(h) && h > 0 ? h : 18.17
  };
}

function applySensorPreset(key) {
  const p = SENSOR_PRESETS[key] || SENSOR_PRESETS.ALEXA_MINI;
  ui.sensorW.value = p.w.toFixed(2);
  ui.sensorH.value = p.h.toFixed(2);

  const isCustom = key === "CUSTOM";
  ui.sensorW.disabled = !isCustom;
  ui.sensorH.disabled = !isCustom;

  renderAll();
}

// -------------------- glass db --------------------
const GLASS_DB = {
  AIR: { nd: 1.0, Vd: 999.0 },
  BK7: { nd: 1.5168, Vd: 64.17 },
  F2:  { nd: 1.6200, Vd: 36.37 },
  SF10:{ nd: 1.7283, Vd: 28.41 },
  LASF35: { nd: 1.8061, Vd: 25.4 },
  LASFN31:{ nd: 1.8052, Vd: 25.3 },
  LF5:    { nd: 1.5800, Vd: 40.0 },
  "N-SF5":   { nd: 1.67271,  Vd: 32.25 },
  "S-LAM3":  { nd: 1.717004, Vd: 47.927969 },
  "S-BAH11": { nd: 1.666718, Vd: 48.325247 },

  // Optional placeholders from earlier patent JSON naming
  glass_I:   { nd: 1.6129, Vd: 50.0 },
  glass_II:  { nd: 1.6112, Vd: 50.0 },
  glass_III: { nd: 1.5163, Vd: 60.0 },
  glass_IV:  { nd: 1.5163, Vd: 60.0 },
  glass_V:   { nd: 1.6489, Vd: 50.0 },
};

function glassN(glassName, preset /* d,g,c */) {
  const g = GLASS_DB[glassName] || GLASS_DB.AIR;
  if (glassName === "AIR") return 1.0;

  const base = g.nd;
  const strength = 1.0 / Math.max(10.0, g.Vd);
  if (preset === "g") return base + 35.0 * strength;
  if (preset === "c") return base - 20.0 * strength;
  return base; // d-line
}

// -------------------- built-in lenses --------------------
function demoLensSimple() {
  return {
    name: "Demo lens (toy)",
    surfaces: [
      { type:"OBJ",  R:0,      t:10.0,  ap:22.0, glass:"AIR",     stop:false },
      { type:"1",    R:42.0,   t:10.0,  ap:22.0, glass:"LASF35",  stop:false },
      { type:"2",    R:-140.0, t:10.0,  ap:21.0, glass:"AIR",     stop:false },
      { type:"3",    R:-30.0,  t:10.0,  ap:19.0, glass:"LASFN31", stop:false },
      { type:"STOP", R:0.0,    t:10.0,  ap:14.0, glass:"AIR",     stop:true  },
      { type:"5",    R:12.42,  t:10.0,  ap:8.5,  glass:"AIR",     stop:false },
      { type:"AST",  R:0.0,    t:6.4,   ap:8.5,  glass:"AIR",     stop:false },
      { type:"7",    R:-18.93, t:10.0,  ap:11.0, glass:"LF5",     stop:false },
      { type:"8",    R:59.6,   t:10.0,  ap:13.0, glass:"LASFN31", stop:false },
      { type:"9",    R:-40.49, t:10.0,  ap:13.0, glass:"AIR",     stop:false },
      { type:"IMS",  R:0.0,    t:0.0,   ap:12.0, glass:"AIR",     stop:false },
    ],
  };
}

// Built-in OMIT 50mm concept v1 (scaled Double-Gauss base)
function omit50ConceptV1() {
  return {
    name: "OMIT 50mm (concept v1 — scaled Double-Gauss base)",
    notes: [
      "Scaled from a Double-Gauss baseline; geometric sanity/spacing/stop baseline only.",
      "2D meridional tracer: no aspheres, no full optimization, no coatings/transmission model."
    ],
    surfaces: [
      { type:"OBJ",  R: 0.0,       t: 0.0,      ap: 60.0,     glass:"AIR",     stop:false },

      { type:"1",    R: 37.4501,   t: 4.49102,  ap: 16.46707, glass:"S-LAM3",  stop:false },
      { type:"2",    R: 135.07984, t: 0.0499,   ap: 16.46707, glass:"AIR",     stop:false },

      { type:"3",    R: 19.59581,  t: 8.23852,  ap: 13.72255, glass:"S-BAH11", stop:false },
      { type:"4",    R: 0.0,       t: 0.998,    ap: 12.22555, glass:"N-SF5",   stop:false },

      { type:"5",    R: 12.7994,   t: 5.48403,  ap: 9.73054,  glass:"AIR",     stop:false },

      { type:"STOP", R: 0.0,       t: 6.48703,  ap: 9.28144,  glass:"AIR",     stop:true  },

      { type:"7",    R: -15.90319, t: 3.50798,  ap: 9.23154,  glass:"N-SF5",   stop:false },
      { type:"8",    R: 0.0,       t: 4.48104,  ap: 10.47904, glass:"S-LAM3",  stop:false },
      { type:"9",    R: -21.71158, t: 0.0499,   ap: 10.47904, glass:"AIR",     stop:false },

      { type:"10",   R: 110.3493,  t: 3.98204,  ap: 11.47705, glass:"S-BAH11", stop:false },
      { type:"11",   R: -44.30639, t: 30.6477,  ap: 11.47705, glass:"AIR",     stop:false },

      { type:"IMS",  R: 0.0,       t: 0.0,      ap: 23.2,     glass:"AIR",     stop:false },
    ],
  };
}

let lens = sanitizeLens(omit50ConceptV1()); // default preset

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

  // enforce single stop (first one wins)
  const firstStop = safe.surfaces.findIndex((s) => s.stop);
  if (firstStop >= 0) {
    safe.surfaces.forEach((s, i) => { if (i !== firstStop) s.stop = false; });
  }

  // fill types
  safe.surfaces.forEach((s, i) => { if (!s.type || !s.type.trim()) s.type = String(i); });

  return safe;
}

function loadLens(obj) {
  lens = sanitizeLens(obj);
  selectedIndex = 0;
  buildTable();
  renderAll();
}

// -------------------- table + selection --------------------
function clampSelected() {
  selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));
}

function enforceSingleStop(changedIndex) {
  if (!lens.surfaces[changedIndex]?.stop) return;
  lens.surfaces.forEach((s, i) => { if (i !== changedIndex) s.stop = false; });
}

function relabelTypes() {
  lens.surfaces.forEach((s, i) => {
    if (!s.type || s.type.trim() === "") s.type = String(i);
  });
}

function buildTable() {
  clampSelected();
  ui.tbody.innerHTML = "";

  lens.surfaces.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("selected", idx === selectedIndex);

    tr.addEventListener("click", (ev) => {
      if (["INPUT","SELECT","OPTION"].includes(ev.target.tagName)) return;
      selectedIndex = idx;
      buildTable();
    });

    tr.innerHTML = `
      <td style="width:34px; font-family:var(--mono)">${idx}</td>
      <td style="width:62px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
      <td style="width:92px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}"></td>
      <td style="width:92px"><input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01" value="${s.t}"></td>
      <td style="width:92px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}"></td>
      <td style="width:110px">
        <select class="cellSelect" data-k="glass" data-i="${idx}">
          ${Object.keys(GLASS_DB).map(name => `<option value="${name}" ${name===s.glass?"selected":""}>${name}</option>`).join("")}
        </select>
      </td>
      <td class="cellChk" style="width:58px">
        <input type="checkbox" data-k="stop" data-i="${idx}" ${s.stop ? "checked":""}>
      </td>
    `;

    ui.tbody.appendChild(tr);
  });

  ui.tbody.querySelectorAll("input,select").forEach(el => {
    el.addEventListener("input", onCellChange);
    el.addEventListener("change", onCellChange);
  });
}

function onCellChange(e) {
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;

  selectedIndex = i;

  const s = lens.surfaces[i];
  if (!s) return;

  if (k === "stop") {
    s.stop = el.checked;
    enforceSingleStop(i);
    buildTable();
  } else if (k === "glass") {
    s.glass = el.value;
  } else if (k === "type") {
    s.type = el.value;
  } else {
    s[k] = Number(el.value);
  }

  renderAll();
}

// -------------------- math helpers --------------------
function normalize(v) {
  const m = Math.hypot(v.x, v.y);
  if (m < 1e-12) return {x:0, y:0};
  return {x:v.x/m, y:v.y/m};
}
function dot(a,b){ return a.x*b.x + a.y*b.y; }
function add(a,b){ return {x:a.x+b.x, y:a.y+b.y}; }
function mul(a, s){ return {x:a.x*s, y:a.y*s}; }

function refract(I, N, n1, n2) {
  I = normalize(I);
  N = normalize(N);

  // flip normal if it points same way as ray
  if (dot(I, N) > 0) N = mul(N, -1);

  const cosi = -dot(N, I);
  const eta = n1 / n2;
  const k = 1 - eta*eta*(1 - cosi*cosi);
  if (k < 0) return null; // TIR
  const T = add(mul(I, eta), mul(N, (eta*cosi - Math.sqrt(k))));
  return normalize(T);
}

function intersectSurface(ray, surf) {
  const vx = surf.vx;
  const R = surf.R;
  const ap = Math.max(0, surf.ap);

  // plane
  if (Math.abs(R) < 1e-9) {
    const t = (vx - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    const hit = add(ray.p, mul(ray.d, t));
    const vignetted = (Math.abs(hit.y) > ap + 1e-9);
    return { hit, t, vignetted, normal:{x:-1,y:0} };
  }

  // sphere
  const cx = vx + R;
  const rad = Math.abs(R);

  const px = ray.p.x - cx;
  const py = ray.p.y;
  const dx = ray.d.x;
  const dy = ray.d.y;

  const A = dx*dx + dy*dy;
  const B = 2*(px*dx + py*dy);
  const C = px*px + py*py - rad*rad;

  const disc = B*B - 4*A*C;
  if (disc < 0) return null;

  const sdisc = Math.sqrt(disc);
  const t1 = (-B - sdisc) / (2*A);
  const t2 = (-B + sdisc) / (2*A);

  let t = null;
  if (t1 > 1e-9 && t2 > 1e-9) t = Math.min(t1, t2);
  else if (t1 > 1e-9) t = t1;
  else if (t2 > 1e-9) t = t2;
  else return null;

  const hit = add(ray.p, mul(ray.d, t));
  const vignetted = (Math.abs(hit.y) > ap + 1e-9);
  const Nout = normalize({x: hit.x - cx, y: hit.y});
  return { hit, t, vignetted, normal: Nout };
}

function computeVertices(surfaces) {
  let x = 0;
  for (let i=0;i<surfaces.length;i++){
    surfaces[i].vx = x;
    x += Number(surfaces[i].t || 0);
  }
  return x;
}

function traceRayThroughLens(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;

  let nBefore = 1.0;

  for (let i=0;i<surfaces.length;i++){
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

function findStopSurfaceIndex(surfaces) {
  return surfaces.findIndex(s => !!s.stop);
}

function buildRays(surfaces, fieldAngleDeg, count) {
  const n = Math.max(3, Math.min(101, count|0));
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 60;

  const stopIdx = findStopSurfaceIndex(surfaces);
  const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
  const xStop = stopSurf.vx;
  const apStop = Math.max(1e-3, stopSurf.ap ?? 10);

  const hMax = apStop * 0.98;
  const rays = [];

  const tanT = (Math.abs(dir.x) < 1e-9) ? 0 : (dir.y / dir.x);

  for (let k=0;k<n;k++){
    const a = (k/(n-1))*2 - 1;
    const yAtStop = a * hMax;
    const y0 = yAtStop - tanT * (xStop - xStart);
    rays.push({ p:{x:xStart, y:y0}, d:dir });
  }

  return rays;
}

// --- EFL/BFL sanity ---
function lastPhysicalVertexX(surfaces) {
  if (!surfaces?.length) return 0;
  const last = surfaces[surfaces.length - 1];
  const isIMS = String(last?.type || "").toUpperCase() === "IMS";
  const idx = isIMS ? surfaces.length - 2 : surfaces.length - 1;
  return surfaces[Math.max(0, idx)]?.vx ?? 0;
}

function estimateEflBfl(surfaces, wavePreset) {
  const xStart = (surfaces[0]?.vx ?? 0) - 100;
  const heights = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

  const rays = heights.map(h => ({
    p: { x: xStart, y: h },
    d: normalize({ x: 1, y: 0 })
  }));

  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), surfaces, wavePreset));
  if (traces.some(t => t.vignetted || t.tir)) return { efl: null, bfl: null };

  const xCrosses = [];
  for (const tr of traces) {
    const er = tr.endRay;
    const dy = er?.d?.y ?? 0;
    const dx = er?.d?.x ?? 0;
    if (Math.abs(dy) < 1e-9 || Math.abs(dx) < 1e-9) continue;
    const t = -er.p.y / dy;
    const xCross = er.p.x + t * dx;
    if (Number.isFinite(xCross)) xCrosses.push(xCross);
  }
  if (xCrosses.length < 2) return { efl: null, bfl: null };

  const xFocal = xCrosses.reduce((a,b)=>a+b,0) / xCrosses.length;
  const lastVx = lastPhysicalVertexX(surfaces);
  const bfl = xFocal - lastVx;

  // NOTE: Without principal planes, we show EFL as this sanity value.
  const efl = bfl;

  return { efl, bfl };
}

// --- Approx T-stop (very simplified) ---
function approxTNumber(efl, surfaces) {
  if (!Number.isFinite(efl) || !surfaces?.length) return null;
  const stopIdx = findStopSurfaceIndex(surfaces);
  if (stopIdx < 0) return null;
  const stopAp = Number(surfaces[stopIdx]?.ap ?? 0);
  if (!Number.isFinite(stopAp) || stopAp <= 0) return null;
  return efl / (2 * stopAp);
}

// --- autofocus ---
function rayHitYAtX(endRay, x) {
  if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
  const t = (x - endRay.p.x) / endRay.d.x;
  if (!Number.isFinite(t)) return null;
  return endRay.p.y + t * endRay.d.y;
}

function spotRmsAtSensorX(traces, sensorX) {
  const ys = [];
  for (const tr of traces) {
    if (!tr || tr.vignetted || tr.tir) continue;
    const y = rayHitYAtX(tr.endRay, sensorX);
    if (y == null) continue;
    ys.push(y);
  }
  if (ys.length < 5) return { rms: null, n: ys.length };
  const mean = ys.reduce((a,b)=>a+b,0) / ys.length;
  const rms = Math.sqrt(ys.reduce((acc,y)=>acc + (y-mean)*(y-mean),0) / ys.length);
  return { rms, n: ys.length };
}

function autoFocusSensorOffset() {
  relabelTypes();
  computeVertices(lens.surfaces);

  const fieldAngle = Number(ui.fieldAngle.value || 0);
  const rayCount   = Number(ui.rayCount.value || 31);
  const wavePreset = ui.wavePreset.value;

  const rays   = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset));

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const baseX = ims?.vx ?? 0;

  const current = Number(ui.sensorOffset.value || 0);
  const range = 80;
  const coarseStep = 0.5;
  const fineStep = 0.05;

  let best = { off: current, rms: Infinity, n: 0 };

  function scan(center, halfRange, step) {
    const start = center - halfRange;
    const end   = center + halfRange;
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
    ui.footerWarn.textContent = "Auto focus failed (too few valid rays). Try more rays / larger apertures.";
    return;
  }

  ui.sensorOffset.value = best.off.toFixed(2);
  ui.footerWarn.textContent = `Auto focus: sensorOffset=${best.off.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;
  renderAll();
}

// -------------------- drawing --------------------
let view = { panX:0, panY:0, zoom:1.0, dragging:false, lastX:0, lastY:0 };

function resizeCanvasToCSS() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(2, Math.floor(r.width * dpr));
  canvas.height = Math.max(2, Math.floor(r.height * dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function worldToScreen(p, world) {
  const { cx, cy, s } = world;
  return { x: cx + (p.x* s), y: cy - (p.y* s) };
}

function makeWorldTransform() {
  const r = canvas.getBoundingClientRect();
  const cx = r.width/2 + view.panX;
  const cy = r.height/2 + view.panY;
  const base = Number(ui.renderScale.value) * 3.2;
  const s = base * view.zoom;
  return { cx, cy, s };
}

function drawAxes(world) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d0d0d0";
  ctx.beginPath();
  const p1 = worldToScreen({x:-200, y:0}, world);
  const p2 = worldToScreen({x: 800, y:0}, world);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

function drawSurface(world, s) {
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#1b1b1b";

  const vx = s.vx;
  const ap = Math.max(0, s.ap);

  if (Math.abs(s.R) < 1e-9) {
    const a = worldToScreen({x:vx, y:-ap}, world);
    const b = worldToScreen({x:vx, y: ap}, world);
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
  for (let i=0;i<=steps;i++){
    const y = -ap + (i/steps)*(2*ap);
    const inside = rad*rad - y*y;
    if (inside < 0) continue;
    const x = cx - sign*Math.sqrt(inside);
    const sp = worldToScreen({x, y}, world);
    if (i===0) ctx.moveTo(sp.x, sp.y);
    else ctx.lineTo(sp.x, sp.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLens(world, surfaces) {
  for (const s of surfaces) drawSurface(world, s);
}

function drawRays(world, rayTraces, sensorX) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2a6ef2";

  for (const tr of rayTraces){
    if (!tr.pts || tr.pts.length < 2) continue;
    ctx.globalAlpha = tr.vignetted ? 0.12 : 0.9;

    ctx.beginPath();
    const p0 = worldToScreen(tr.pts[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<tr.pts.length;i++){
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

function drawSensor(world, sensorX, sensorHalfH) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.setLineDash([6,6]);
  const a = worldToScreen({x:sensorX, y:-sensorHalfH}, world);
  const b = worldToScreen({x:sensorX, y: sensorHalfH}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
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
  const a = worldToScreen({x:s.vx, y:-ap}, world);
  const b = worldToScreen({x:s.vx, y: ap}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawTitleOverlay(text) {
  ctx.save();
  ctx.font = "14px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
  ctx.fillStyle = "#333";
  ctx.fillText(text, 14, 20);
  ctx.restore();
}

// -------------------- render --------------------
function renderAll() {
  ui.footerWarn.textContent = "";

  relabelTypes();
  computeVertices(lens.surfaces);
  clampSelected();

  const sensor = getSensor();
  const sensorHalfH = sensor.h * 0.5;

  const fieldAngle = Number(ui.fieldAngle.value || 0);
  const rayCount   = Number(ui.rayCount.value || 31);
  const wavePreset = ui.wavePreset.value;
  const sensorOffset = Number(ui.sensorOffset.value || 0);

  const last = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (last?.vx ?? 0) + sensorOffset;

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset));

  const vCount = traces.filter(t => t.vignetted).length;
  const tirCount = traces.filter(t => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBfl(lens.surfaces, wavePreset);
  const tApprox = approxTNumber(efl, lens.surfaces);

  ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  ui.tnum.textContent = `T≈: ${tApprox == null ? "—" : tApprox.toFixed(2)}`;
  ui.vig.textContent = `Vignette: ${vigPct}%`;

  if (tirCount > 0) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  ui.status.textContent =
    `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount}`;

  resizeCanvasToCSS();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const world = makeWorldTransform();
  drawAxes(world);
  drawLens(world, lens.surfaces);
  drawStop(world, lens.surfaces);
  drawRays(world, traces, sensorX);
  drawSensor(world, sensorX, sensorHalfH);

  drawTitleOverlay(`${lens.name} • sensor=${sensor.w.toFixed(2)}×${sensor.h.toFixed(2)}mm • sensorX=${sensorX.toFixed(2)}mm`);
}

// -------------------- view controls --------------------
function bindViewControls() {
  canvas.addEventListener("mousedown", (e)=>{
    view.dragging = true;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
  });
  window.addEventListener("mouseup", ()=>{ view.dragging=false; });

  window.addEventListener("mousemove", (e)=>{
    if (!view.dragging) return;
    const dx = e.clientX - view.lastX;
    const dy = e.clientY - view.lastY;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    view.panX += dx;
    view.panY += dy;
    renderAll();
  });

  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = (delta > 0) ? 0.92 : 1.08;
    view.zoom = Math.max(0.12, Math.min(12, view.zoom * factor));
    renderAll();
  }, { passive:false });

  canvas.addEventListener("dblclick", ()=>{
    view.panX = 0;
    view.panY = 0;
    view.zoom = 1.0;
    renderAll();
  });
}

// -------------------- edit helpers --------------------
function isProtectedIndex(i) {
  const t = String(lens.surfaces[i]?.type || "").toUpperCase();
  return t === "OBJ" || t === "IMS";
}

function insertSurface(atIndex, surfaceObj) {
  lens.surfaces.splice(atIndex, 0, surfaceObj);
  selectedIndex = atIndex;
  buildTable();
  renderAll();
}

function insertAfterSelected(surfaceObj) {
  clampSelected();
  const at = selectedIndex + 1;
  insertSurface(at, surfaceObj);
}

// -------------------- buttons --------------------
on("#btnAdd", "click", ()=>{
  insertAfterSelected({
    type: "",
    R: 0,
    t: 5.0,
    ap: 12.0,
    glass: "AIR",
    stop: false
  });
});

on("#btnAddElement", "click", ()=>{
  clampSelected();

  let insertAt = selectedIndex + 1;
  if (String(lens.surfaces[selectedIndex]?.type || "").toUpperCase() === "IMS") {
    insertAt = Math.max(0, lens.surfaces.length - 1);
  }
  if (insertAt >= lens.surfaces.length) insertAt = lens.surfaces.length - 1;

  const glassName = "BK7";
  const centerThickness = 6.0;
  const airGap = 4.0;
  const ap = 18.0;

  const s1 = { type:"", R: 40.0,  t: centerThickness, ap, glass: glassName, stop:false };
  const s2 = { type:"", R:-40.0,  t: airGap,         ap, glass: "AIR",   stop:false };

  lens.surfaces.splice(insertAt, 0, s1, s2);
  selectedIndex = insertAt;
  buildTable();
  renderAll();
});

on("#btnDuplicate", "click", ()=>{
  clampSelected();
  const s = lens.surfaces[selectedIndex];
  if (!s) return;
  const copy = structuredClone(s);
  lens.surfaces.splice(selectedIndex + 1, 0, copy);
  selectedIndex += 1;
  buildTable();
  renderAll();
});

on("#btnMoveUp", "click", ()=>{
  clampSelected();
  if (selectedIndex <= 0) return;
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex-1];
  lens.surfaces[selectedIndex-1] = a;
  selectedIndex -= 1;
  buildTable();
  renderAll();
});

on("#btnMoveDown", "click", ()=>{
  clampSelected();
  if (selectedIndex >= lens.surfaces.length-1) return;
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex+1];
  lens.surfaces[selectedIndex+1] = a;
  selectedIndex += 1;
  buildTable();
  renderAll();
});

on("#btnRemove", "click", ()=>{
  clampSelected();
  if (lens.surfaces.length <= 2) return;
  if (isProtectedIndex(selectedIndex)) {
    ui.footerWarn.textContent = "OBJ/IMS kun je niet deleten.";
    return;
  }
  lens.surfaces.splice(selectedIndex, 1);
  selectedIndex = Math.max(0, selectedIndex - 1);
  buildTable();
  renderAll();
});

// Load preset buttons
on("#btnReset", "click", ()=>{
  loadLens(omit50ConceptV1());
});
on("#btnResetSimple", "click", ()=>{
  loadLens(demoLensSimple());
});

on("#btnSave", "click", ()=>{
  const payload = JSON.stringify(lens, null, 2);
  const blob = new Blob([payload], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (lens.name || "lens") + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

on("#btnAutoFocus", "click", ()=>{
  autoFocusSensorOffset();
});

on("#fileLoad", "change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.surfaces)) throw new Error("Invalid JSON format.");

    // Optional: merge extra glasses from JSON (if it has glass_note)
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
  }catch(err){
    ui.footerWarn.textContent = `Load failed: ${err.message}`;
  }finally{
    e.target.value = "";
  }
});

// sensor preset wiring
on("#sensorPreset", "change", ()=>{
  applySensorPreset(ui.sensorPreset.value);
});
on("#sensorW", "input", ()=>{ ui.sensorPreset.value = "CUSTOM"; ui.sensorW.disabled=false; ui.sensorH.disabled=false; renderAll(); });
on("#sensorH", "input", ()=>{ ui.sensorPreset.value = "CUSTOM"; ui.sensorW.disabled=false; ui.sensorH.disabled=false; renderAll(); });

// rerender on controls
["fieldAngle","rayCount","wavePreset","sensorOffset","renderScale"].forEach(id=>{
  on("#"+id, "input", renderAll);
  on("#"+id, "change", renderAll);
});
window.addEventListener("resize", renderAll);

// init
buildTable();
bindViewControls();
ui.sensorPreset.value = "ALEXA_MINI";
applySensorPreset("ALEXA_MINI");
renderAll();
