/* Meridional Raytracer (2D) — TVL Rebuild
   - Optical axis: +x, height: y
   - Surfaces: spherical (R!=0) or plane (R=0)
   - Thickness t: distance to next surface vertex (along x)
   - Aperture ap: clear semi-diameter at surface
   - Glass column = medium AFTER the surface (OSLO-ish)
   - Stop-aware ray sampling: rays fill the STOP surface aperture
   - Sensor presets (Mini S35, Mini LF, Venice FF, Fuji GFX)
   - IMS.ap auto = sensorHeight/2 (meridional)
   - EFL/BFL via paraxial method (closer to OSLO)
   - T-stop sanity approx: T ≈ EFL / (2*StopAp) (entrance pupil not modeled)
   - FOV computed from EFL + sensor W/H (rectilinear)
*/

const $ = (sel) => document.querySelector(sel);
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); return el; };

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

const ui = {
  tbody: $("#surfTbody"),
  status: $("#statusText"),
  efl: $("#badgeEfl"),
  bfl: $("#badgeBfl"),
  tstop: $("#badgeT"),
  vig: $("#badgeVig"),
  fov: $("#badgeFov"),

  footerWarn: $("#footerWarn"),
  metaInfo: $("#metaInfo"),

  eflTop: $("#badgeEflTop"),
  bflTop: $("#badgeBflTop"),
  tstopTop: $("#badgeTTop"),
  fovTop: $("#badgeFovTop"),

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
  "ARRI Alexa Mini (S35)":   { w: 28.25, h: 18.17 },
  "ARRI Alexa Mini LF (LF)": { w: 36.70, h: 25.54 },
  "Sony VENICE (FF)":        { w: 36.00, h: 24.00 },
  "Fuji GFX (MF)":           { w: 43.80, h: 32.90 },
};

function getSensorWH() {
  const w = Number(ui.sensorW.value || 36.7);
  const h = Number(ui.sensorH.value || 25.54);
  return { w, h, halfH: Math.max(0.1, h * 0.5) };
}

function applySensorToIMS() {
  const { halfH } = getSensorWH();
  const ims = lens?.surfaces?.[lens.surfaces.length - 1];
  if (ims && String(ims.type).toUpperCase() === "IMS") {
    ims.ap = halfH;
  }
}

function applyPreset(name) {
  const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
  ui.sensorW.value = p.w.toFixed(2);
  ui.sensorH.value = p.h.toFixed(2);
  applySensorToIMS();
}

// -------------------- glass db --------------------
const GLASS_DB = {
  AIR: { nd: 1.0, Vd: 999.0 },
  BK7: { nd: 1.5168, Vd: 64.17 },
  F2:  { nd: 1.6200, Vd: 36.37 },
  SF10:{ nd: 1.7283, Vd: 28.41 },
  LASF35:  { nd: 1.8061, Vd: 25.4 },
  LASFN31: { nd: 1.8052, Vd: 25.3 },
  LF5:     { nd: 1.5800, Vd: 40.0 },
  "N-SF5":   { nd: 1.67271,  Vd: 32.25 },
  "S-LAM3":  { nd: 1.717004, Vd: 47.927969 },
  "S-BAH11": { nd: 1.666718, Vd: 48.325247 },
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
    name: "Demo (simple)",
    surfaces: [
      { type:"OBJ", R:0.0,    t:10.0, ap:22.0, glass:"AIR",     stop:false },
      { type:"1",   R:42.0,   t:10.0, ap:22.0, glass:"LASF35",  stop:false },
      { type:"2",   R:-140.0, t:10.0, ap:21.0, glass:"AIR",     stop:false },
      { type:"3",   R:-30.0,  t:10.0, ap:19.0, glass:"LASFN31", stop:false },
      { type:"STOP",R:0.0,    t:10.0, ap:14.0, glass:"AIR",     stop:true  },
      { type:"5",   R:12.42,  t:10.0, ap:8.5,  glass:"AIR",     stop:false },
      { type:"AST", R:0.0,    t:6.4,  ap:8.5,  glass:"AIR",     stop:false },
      { type:"7",   R:-18.93, t:10.0, ap:11.0, glass:"LF5",     stop:false },
      { type:"8",   R:59.6,   t:10.0, ap:13.0, glass:"LASFN31", stop:false },
      { type:"9",   R:-40.49, t:10.0, ap:13.0, glass:"AIR",     stop:false },
      { type:"IMS", R:0.0,    t:0.0,  ap:12.0, glass:"AIR",     stop:false },
    ],
  };
}

function omit50ConceptV1() {
  return {
    name: "OMIT 50mm (concept v1 — scaled Double-Gauss base)",
    notes: [
      "Scaled from Double-Gauss base; used as geometric sanity for this 2D meridional tracer.",
      "Not optimized; coatings/stop/entrance pupil are not modeled."
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

      { type:"IMS",  R: 0.0,       t: 0.0,      ap: 12.77,    glass:"AIR",     stop:false },
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

  // enforce single stop (first wins)
  const firstStop = safe.surfaces.findIndex((s) => s.stop);
  if (firstStop >= 0) safe.surfaces.forEach((s, i) => { if (i !== firstStop) s.stop = false; });

  // ensure types
  safe.surfaces.forEach((s, i) => { if (!s.type || !s.type.trim()) s.type = String(i); });

  return safe;
}

function loadLens(obj) {
  lens = sanitizeLens(obj);
  selectedIndex = 0;
  applySensorToIMS();
  buildTable();
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
      <td style="width:72px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
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

  applySensorToIMS();
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

  // flip normal if it points same direction as ray
  if (dot(I, N) > 0) N = mul(N, -1);

  const cosi = -dot(N, I);
  const eta = n1 / n2;
  const k = 1 - eta*eta*(1 - cosi*cosi);
  if (k < 0) return null;
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
    if (Math.abs(hit.y) > ap + 1e-9) return { hit, t, vignetted:true, normal:{x:-1,y:0} };
    return { hit, t, vignetted:false, normal:{x:-1,y:0} };
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

function findStopSurfaceIndex(surfaces) {
  return surfaces.findIndex(s => !!s.stop);
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

// Same tracer but ignores IMS clipping (used for EFL)
function traceRayThroughLensSkipIMS(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;

  let nBefore = 1.0;

  for (let i=0;i<surfaces.length;i++){
    const s = surfaces[i];
    const isIMS = String(s?.type || "").toUpperCase() === "IMS";

    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) { vignetted = true; break; }

    pts.push(hitInfo.hit);

    // DO NOT clip at IMS
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

function getRayReferencePlane(surfaces) {
  // pak eerste "echte" surface na OBJ (index 1 meestal)
  // fallback: stop surface
  const stopIdx = findStopSurfaceIndex(surfaces);

  // probeer surface 1 als die bestaat en geen IMS is
  let refIdx = 1;
  if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") {
    refIdx = stopIdx >= 0 ? stopIdx : 0;
  }

  const s = surfaces[refIdx] || surfaces[0];
  return {
    xRef: s.vx,
    apRef: Math.max(1e-3, Number(s.ap || 10)),
    refIdx
  };
}

function buildRays(surfaces, fieldAngleDeg, count) {
  const n = Math.max(3, Math.min(101, count|0));
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 80;

  // NIEUW: reference plane = front element (ipv stop)
  const { xRef, apRef } = getRayReferencePlane(surfaces);

  const hMax = apRef * 0.98;
  const rays = [];

  const tanT = (Math.abs(dir.x) < 1e-9) ? 0 : (dir.y / dir.x);

  for (let k=0;k<n;k++){
    const a = (k/(n-1))*2 - 1;
    const yAtRef = a * hMax;

    // start y zó dat ray op xRef precies yAtRef heeft
    const y0 = yAtRef - tanT * (xRef - xStart);

    rays.push({ p:{x:xStart, y:y0}, d:dir });
  }

  return rays;
}

function buildChiefRay(surfaces, fieldAngleDeg){
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 120;

  const stopIdx = findStopSurfaceIndex(surfaces);
  const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
  const xStop = stopSurf.vx;

  const tanT = (Math.abs(dir.x) < 1e-9) ? 0 : (dir.y / dir.x);

  // chief ray: door het midden van de stop => yAtStop = 0
  const y0 = 0 - tanT * (xStop - xStart);

  return { p:{x:xStart, y:y0}, d:dir };
}

function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH){
  // zoek max field waarbij chief ray nog sensor bereikt zonder vignette
  let lo = 0, hi = 60; // 60° is al absurd hoog; prima als bracket
  let best = 0;

  for (let iter=0; iter<18; iter++){
    const mid = (lo + hi) * 0.5;
    const ray = buildChiefRay(surfaces, mid);
    const tr = traceRayThroughLens(structuredClone(ray), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

    const y = rayHitYAtX(tr.endRay, sensorX);
    if (y == null) { hi = mid; continue; }

    if (Math.abs(y) <= halfH) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best; // degrees to just reach sensor edge (ish)
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

  const heights = [0.25, 0.5, 0.75, 1.0, 1.25]; // mm
  const fVals = [];
  const xCrossVals = [];

  for (const y0 of heights) {
    const ray = { p:{x:xStart, y:y0}, d: normalize({x:1,y:0}) };
    const tr = traceRayThroughLensSkipIMS(structuredClone(ray), surfaces, wavePreset);
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

  const efl = fVals.reduce((a,b)=>a+b,0) / fVals.length;

  let bfl = null;
  if (xCrossVals.length >= 2) {
    const xF = xCrossVals.reduce((a,b)=>a+b,0) / xCrossVals.length;
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
function rad2deg(r){ return r * 180 / Math.PI; }

function computeFovDeg(efl, sensorW, sensorH) {
  if (!Number.isFinite(efl) || efl <= 0) return null;
  const diag = Math.hypot(sensorW, sensorH);
  const hfov = 2 * Math.atan(sensorW / (2 * efl));
  const vfov = 2 * Math.atan(sensorH / (2 * efl));
  const dfov = 2 * Math.atan(diag    / (2 * efl));
  return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
}

// -------------------- autofocus --------------------
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
  const p1 = worldToScreen({x:-240, y:0}, world);
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
  let moved = false;
  for (let i=0;i<=steps;i++){
    const y = -ap + (i/steps)*(2*ap);
    const inside = rad*rad - y*y;
    if (inside < 0) continue;
    const x = cx - sign*Math.sqrt(inside);
    const sp = worldToScreen({x, y}, world);
    if (!moved) { ctx.moveTo(sp.x, sp.y); moved = true; }
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
    ctx.globalAlpha = tr.vignetted ? 0.15 : 0.9;

    ctx.beginPath();
    const p0 = worldToScreen(tr.pts[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<tr.pts.length;i++){
      const p = worldToScreen(tr.pts[i], world);
      ctx.lineTo(p.x, p.y);
    }

    // extend to sensor plane for display
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
  const a = worldToScreen({x:s.vx, y:-ap}, world);
  const b = worldToScreen({x:s.vx, y: ap}, world);
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
  ctx.setLineDash([6,6]);

  const a = worldToScreen({x:sensorX, y:-halfH}, world);
  const b = worldToScreen({x:sensorX, y: halfH}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // gate markers
  ctx.setLineDash([3,6]);
  ctx.lineWidth = 1.25;
  const l1 = worldToScreen({x:sensorX-2.5, y: halfH}, world);
  const l2 = worldToScreen({x:sensorX+2.5, y: halfH}, world);
  const l3 = worldToScreen({x:sensorX-2.5, y:-halfH}, world);
  const l4 = worldToScreen({x:sensorX+2.5, y:-halfH}, world);

  ctx.beginPath();
  ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y);
  ctx.moveTo(l3.x, l3.y); ctx.lineTo(l4.x, l4.y);
  ctx.stroke();

  ctx.setLineDash([]);
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

  applySensorToIMS();
  computeVertices(lens.surfaces);
  clampSelected();

  const { w: sensorW, h: sensorH, halfH } = getSensorWH();

  const fieldAngle = Number(ui.fieldAngle.value || 0);
  const rayCount   = Number(ui.rayCount.value || 31);
  const wavePreset = ui.wavePreset.value;
  const sensorOffset = Number(ui.sensorOffset.value || 0);

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (ims?.vx ?? 0) + sensorOffset;

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset));

  const vCount = traces.filter(t => t.vignetted).length;
  const tirCount = traces.filter(t => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
  const T = estimateTStopApprox(efl, lens.surfaces);

  const fov = computeFovDeg(efl, sensorW, sensorH);
  const fovTxt = !fov ? "FOV: —" : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

  ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  ui.tstop.textContent = `T≈ ${T == null ? "—" : ("T" + T.toFixed(2))}`;
  ui.vig.textContent = `Vignette: ${vigPct}%`;
  ui.fov.textContent = fovTxt;

  if (ui.eflTop) ui.eflTop.textContent = ui.efl.textContent;
  if (ui.bflTop) ui.bflTop.textContent = ui.bfl.textContent;
  if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop.textContent;
  if (ui.fovTop) ui.fovTop.textContent = fovTxt;

  if (tirCount > 0) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  ui.status.textContent =
    `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount}`;

  if (ui.metaInfo) ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;

  resizeCanvasToCSS();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const world = makeWorldTransform();
  drawAxes(world);
  drawLens(world, lens.surfaces);
  drawStop(world, lens.surfaces);
  drawRays(world, traces, sensorX);
  drawSensor(world, sensorX, halfH);

  const eflTxt = (efl == null) ? "—" : efl.toFixed(2) + "mm";
  const bflTxt = (bfl == null) ? "—" : bfl.toFixed(2) + "mm";
  const tTxt   = (T == null) ? "—" : ("T" + T.toFixed(2));

  drawTitleOverlay(`${lens.name} • EFL ${eflTxt} • BFL ${bflTxt} • ${fovTxt} • T≈ ${tTxt} • sensorX=${sensorX.toFixed(2)}mm`);
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
  insertAfterSelected({ type:"", R:0, t:5.0, ap:12.0, glass:"AIR", stop:false });
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

  const s1 = { type:"", R: 40.0, t: centerThickness, ap, glass: glassName, stop:false };
  const s2 = { type:"", R:-40.0, t: airGap,         ap, glass: "AIR",   stop:false };

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

on("#btnAutoFocus", "click", ()=> autoFocusSensorOffset());

on("#btnLoadOmit", "click", ()=>{
  loadLens(omit50ConceptV1());
});

on("#btnLoadDemo", "click", ()=>{
  loadLens(demoLensSimple());
});

on("#fileLoad", "change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.surfaces)) throw new Error("Invalid JSON format.");

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

// -------------------- controls -> rerender --------------------
["fieldAngle","rayCount","wavePreset","sensorOffset","renderScale","sensorW","sensorH"].forEach(id=>{
  on("#"+id, "input", renderAll);
  on("#"+id, "change", renderAll);
});

on("#sensorPreset", "change", (e)=>{
  applyPreset(e.target.value);
  renderAll();
});

window.addEventListener("resize", renderAll);

// -------------------- init --------------------
function init() {
  applyPreset(ui.sensorPreset.value);
  loadLens(lens);
  buildTable();
  bindViewControls();
  renderAll();
}
init();
