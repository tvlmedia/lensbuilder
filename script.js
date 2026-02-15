/* Meridional Raytracer (2D) — TVL Rebuild (FULL SCRIPT)
   - Optical axis: +x, height: y
   - Surfaces: spherical (R!=0) or plane (R=0)
   - Thickness t: distance to next surface vertex (along x)
   - Aperture ap: clear semi-diameter at surface
   - Glass column = medium AFTER the surface (OSLO-ish)
   - Stop = 1 surface
   - EFL/BFL via paraxial (skip IMS clip)
   - T-stop sanity approx: T ≈ EFL / (2*StopAp)  (entrance pupil not modeled)
*/

const $ = (sel) => document.querySelector(sel);
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); return el; };

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

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
  "ARRI Alexa Mini (S35)":   { w: 28.25, h: 18.17 },
  "ARRI Alexa Mini LF (LF)": { w: 36.70, h: 25.54 },
  "Sony VENICE (FF)":        { w: 36.00, h: 24.00 },
  "Fuji GFX (MF)":           { w: 43.80, h: 32.90 },
};

function getSensorWH() {
  const w = Number(ui.sensorW?.value || 36.7);
  const h = Number(ui.sensorH?.value || 25.54);
  return { w, h, halfH: Math.max(0.1, h * 0.5) };
}

function applySensorToIMS() {
  const { halfH } = getSensorWH();
  const ims = lens?.surfaces?.[lens.surfaces.length - 1];
  if (ims && String(ims.type).toUpperCase() === "IMS") ims.ap = halfH;
}

function applyPreset(name) {
  const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
  if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
  if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
  applySensorToIMS();
}

// -------------------- glass db (nd,Vd only) --------------------
// Note: For real build you must use exact datasheet values. This is a practical starter catalog.
const GLASS_DB = {
  AIR:   { nd: 1.0,    Vd: 999.0 },

  // common, usually easy/cheap equivalents exist (China)
  BK7:   { nd: 1.5168, Vd: 64.17 },
  "N-BK7":{ nd: 1.5168, Vd: 64.17 },
  BAK4:  { nd: 1.5688, Vd: 55.99 },
  F2:    { nd: 1.6200, Vd: 36.37 },
  "N-F2":{ nd: 1.6200, Vd: 36.37 },
  SF5:   { nd: 1.6727, Vd: 32.25 },
  "N-SF5":{ nd: 1.67271, Vd: 32.25 },
  SF10:  { nd: 1.7283, Vd: 28.41 },
  "N-SF10":{ nd: 1.7283, Vd: 28.41 },

  // mid-range crowns / lanthanum-ish (varies)
  "N-SK16":  { nd: 1.6204, Vd: 60.30 },
  "N-LAK22": { nd: 1.6516, Vd: 55.89 },
  LF5:       { nd: 1.5800, Vd: 40.0 },

  // higher index / lower abbe -> harder & pricier in practice
  LASF35:   { nd: 1.8061, Vd: 25.4 },
  LASFN31:  { nd: 1.8052, Vd: 25.3 },
  "N-LASF35":{ nd: 1.8061, Vd: 25.4 },
  "N-SF66":  { nd: 1.9229, Vd: 20.9 },

  // your CZJ placeholders (keep)
  CZJ_1: { nd: 1.5182, Vd: 63.8 },
  CZJ_2: { nd: 1.6465, Vd: 47.5 },
  CZJ_3: { nd: 1.6055, Vd: 60.4 },
  CZJ_4: { nd: 1.7343, Vd: 28.1 },
  CZJ_5: { nd: 1.6810, Vd: 54.7 },
  CZJ_6: { nd: 1.6229, Vd: 60.0 }
};

// Optional meta for UI (cost/availability tiers)
const GLASS_META = {
  AIR: { cost:"—", avail:"—", note:"No glass." },

  BK7:   { cost:"LOW",  avail:"HIGH", note:"Workhorse crown. China equivalents common." },
  "N-BK7":{ cost:"LOW", avail:"HIGH", note:"Same family as BK7." },
  BAK4:  { cost:"LOW",  avail:"HIGH", note:"Higher index crown-ish; common." },
  F2:    { cost:"LOW",  avail:"HIGH", note:"Classic flint. China equivalents common." },
  "N-F2":{ cost:"LOW",  avail:"HIGH", note:"Same family as F2." },
  SF5:   { cost:"MED",  avail:"HIGH", note:"Flint-ish. Good for negative power." },
  "N-SF5":{ cost:"MED", avail:"HIGH", note:"Popular negative glass family." },
  SF10:  { cost:"MED",  avail:"HIGH", note:"Higher index flint. More bend, more dispersion." },
  "N-SF10":{ cost:"MED",avail:"HIGH", note:"Same family as SF10." },

  "N-SK16":  { cost:"MED",  avail:"MED", note:"Crown-ish; helpful balancing." },
  "N-LAK22": { cost:"MED",  avail:"MED", note:"Lanthanum-ish family. Supplier dependent." },
  LF5:       { cost:"MED",  avail:"MED", note:"Generic mid glass." },

  LASF35:    { cost:"HIGH", avail:"LOW", note:"High index / low Abbe. Often pricier & tricky." },
  LASFN31:   { cost:"HIGH", avail:"LOW", note:"High index. Supplier dependent." },
  "N-LASF35":{ cost:"HIGH", avail:"LOW", note:"Same family." },
  "N-SF66":  { cost:"HIGH", avail:"LOW", note:"Very high index / low Abbe. Often costly." },

  CZJ_1:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
  CZJ_2:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
  CZJ_3:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
  CZJ_4:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
  CZJ_5:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
  CZJ_6:{ cost:"?", avail:"?", note:"Placeholder CZJ." },
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
function newBlankLens() {
  // Clean sheet: OBJ + IMS only
  return {
    name: "New lens (blank)",
    notes: ["Blank start: only OBJ + IMS. Add surfaces/elements yourself."],
    surfaces: [
      { type:"OBJ", R:0.0, t:0.0, ap:60.0, glass:"AIR", stop:false },
      { type:"IMS", R:0.0, t:0.0, ap:12.77, glass:"AIR", stop:false },
    ],
  };
}

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

      { type:"1",    R: 37.4501,   t: 4.49102,  ap: 16.46707, glass:"CZJ_1",  stop:false },
      { type:"2",    R: 135.07984, t: 0.0499,   ap: 16.46707, glass:"AIR",     stop:false },

      { type:"3",    R: 19.59581,  t: 8.23852,  ap: 13.72255, glass:"CZJ_2", stop:false },
      { type:"4",    R: 0.0,       t: 0.998,    ap: 12.22555, glass:"CZJ_3",   stop:false },

      { type:"5",    R: 12.7994,   t: 5.48403,  ap: 9.73054,  glass:"AIR",     stop:false },

      { type:"STOP", R: 0.0,       t: 6.48703,  ap: 9.28144,  glass:"AIR",     stop:true  },

      { type:"7",    R: -15.90319, t: 3.50798,  ap: 9.23154,  glass:"CZJ_3",   stop:false },
      { type:"8",    R: 0.0,       t: 4.48104,  ap: 10.47904, glass:"CZJ_1",  stop:false },
      { type:"9",    R: -21.71158, t: 0.0499,   ap: 10.47904, glass:"AIR",     stop:false },

      { type:"10",   R: 110.3493,  t: 3.98204,  ap: 11.47705, glass:"CZJ_2", stop:false },
      { type:"11",   R: -44.30639, t: 30.6477,  ap: 11.47705, glass:"AIR",     stop:false },

      { type:"IMS",  R: 0.0,       t: 0.0,      ap: 12.77,    glass:"AIR",     stop:false },
    ],
  };
}

// -------------------- lens state --------------------
let lens = sanitizeLens(newBlankLens());

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

  // ensure OBJ first and IMS last (best-effort)
  const hasOBJ = safe.surfaces.some(s => String(s.type).toUpperCase() === "OBJ");
  const hasIMS = safe.surfaces.some(s => String(s.type).toUpperCase() === "IMS");
  if (!hasOBJ) safe.surfaces.unshift({ type:"OBJ", R:0, t:0, ap:60, glass:"AIR", stop:false });
  if (!hasIMS) safe.surfaces.push({ type:"IMS", R:0, t:0, ap:12.77, glass:"AIR", stop:false });

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
  if (changedIndex == null || changedIndex < 0) return;
  if (!lens.surfaces[changedIndex]?.stop) return;
  lens.surfaces.forEach((s, i) => { if (i !== changedIndex) s.stop = false; });
}

function buildTable() {
  clampSelected();
  if (!ui.tbody) return;
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
      <td style="width:140px">
        <select class="cellSelect" data-k="glass" data-i="${idx}">
          ${glassOptionsHTML(s.glass)}
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

function glassLabel(name){
  const m = GLASS_META[name];
  if (!m) return name;
  const cost = m.cost ?? "?";
  const avail = m.avail ?? "?";
  return `${name}  •  ${cost}/${avail}`;
}
function glassOptionsHTML(selected){
  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));
  return keys.map(name => {
    const sel = (name === selected) ? "selected" : "";
    return `<option value="${name}" ${sel}>${glassLabel(name)}</option>`;
  }).join("");
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

// -------------------- tracing --------------------
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

// -------------------- ray bundles --------------------
function getRayReferencePlane(surfaces) {
  const stopIdx = findStopSurfaceIndex(surfaces);

  let refIdx = 1;
  if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") {
    refIdx = (stopIdx >= 0) ? stopIdx : 0;
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
  const { xRef, apRef } = getRayReferencePlane(surfaces);

  const hMax = apRef * 0.98;
  const rays = [];
  const tanT = (Math.abs(dir.x) < 1e-9) ? 0 : (dir.y / dir.x);

  for (let k=0;k<n;k++){
    const a = (k/(n-1))*2 - 1;
    const yAtRef = a * hMax;
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
  const y0 = 0 - tanT * (xStop - xStart);

  return { p:{x:xStart, y:y0}, d:dir };
}

function rayHitYAtX(endRay, x) {
  if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
  const t = (x - endRay.p.x) / endRay.d.x;
  if (!Number.isFinite(t)) return null;
  return endRay.p.y + t * endRay.d.y;
}

function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH){
  let lo = 0, hi = 60;
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

function coversSensorYesNo({ fov, maxField, mode="diag", marginDeg=0.5 }) {
  if (!fov || !Number.isFinite(maxField)) return { ok:false, req:null };

  let req = null;
  if (mode === "h") req = fov.hfov * 0.5;
  else if (mode === "v") req = fov.vfov * 0.5;
  else req = fov.dfov * 0.5;

  const ok = (maxField + marginDeg) >= req;
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
  const mean = ys.reduce((a,b)=>a+b,0) / ys.length;
  const rms = Math.sqrt(ys.reduce((acc,y)=>acc + (y-mean)*(y-mean),0) / ys.length);
  return { rms, n: ys.length };
}

function autoFocusSensorOffset() {
  computeVertices(lens.surfaces);

  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount   = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";

  const rays   = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset));

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const baseX = ims?.vx ?? 0;

  const current = Number(ui.sensorOffset?.value || 0);
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
    if (ui.footerWarn) ui.footerWarn.textContent = "Auto focus failed (too few valid rays). Try more rays / larger apertures.";
    return;
  }

  if (ui.sensorOffset) ui.sensorOffset.value = best.off.toFixed(2);
  if (ui.footerWarn) ui.footerWarn.textContent = `Auto focus: sensorOffset=${best.off.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;
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
  const base = Number(ui.renderScale?.value || 1.25) * 3.2;
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

function surfaceXatY(s, y) {
  const vx = s.vx;
  const R  = s.R;

  if (Math.abs(R) < 1e-9) return vx;

  const cx  = vx + R;
  const rad = Math.abs(R);
  const sign = Math.sign(R) || 1;

  const inside = rad*rad - y*y;
  if (inside < 0) return null;

  return cx - sign * Math.sqrt(inside);
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
  const back  = buildSurfacePolyline(sBack,  apRegion, 90);
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
    const apRegion = Math.max(0.01, Math.min(apA, apB));

    drawElementBody(world, sA, sB, apRegion);
  }
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
  drawElementsClosed(world, surfaces);
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
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace";
  ctx.font = "14px " + mono;
  ctx.fillStyle = "#333";
  ctx.fillText(text, 14, 20);
  ctx.restore();
}

// -------------------- render --------------------
function renderAll() {
  if (ui.footerWarn) ui.footerWarn.textContent = "";

  applySensorToIMS();
  computeVertices(lens.surfaces);
  clampSelected();

  const { w: sensorW, h: sensorH, halfH } = getSensorWH();

  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount   = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";
  const sensorOffset = Number(ui.sensorOffset?.value || 0);

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

  const maxField = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, halfH);
  const covMode = "v";
  const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

  const covTxt = !fov
    ? "COV(V): —"
    : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

  if (ui.efl) ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : ("T" + T.toFixed(2))}`;
  if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
  if (ui.fov) ui.fov.textContent = fovTxt;
  if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

  if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : ("T" + T.toFixed(2))}`;
  if (ui.fovTop) ui.fovTop.textContent = fovTxt;
  if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (covers ? "COV: YES" : "COV: NO");

  if (tirCount > 0 && ui.footerWarn) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  if (ui.status) {
    ui.status.textContent =
      `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • ${covTxt}`;
  }

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

  drawTitleOverlay(`${lens.name} • EFL ${eflTxt} • BFL ${bflTxt} • ${fovTxt} • ${covTxt} • T≈ ${tTxt} • sensorX=${sensorX.toFixed(2)}mm`);
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

// -------------------- buttons (basic surfaces) --------------------
on("#btnAdd", "click", ()=>{
  clampSelected();
  const at = Math.min(lens.surfaces.length - 1, selectedIndex + 1);
  lens.surfaces.splice(at, 0, { type:"", R:0, t:5.0, ap:12.0, glass:"AIR", stop:false });
  selectedIndex = at;
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
    if (ui.footerWarn) ui.footerWarn.textContent = "OBJ/IMS kun je niet deleten.";
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

on("#btnLoadOmit", "click", ()=> loadLens(omit50ConceptV1()));
on("#btnLoadDemo", "click", ()=> loadLens(demoLensSimple()));
on("#btnNew", "click", ()=> {
  loadLens(newBlankLens());
  if (ui.sensorOffset) ui.sensorOffset.value = "0";
  view.panX = 0; view.panY = 0; view.zoom = 1.0;
  renderAll();
});

// Load JSON
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
        const Vd = Number(v?.Vd);
        if (Number.isFinite(nd)) {
          GLASS_DB[k] = GLASS_DB[k] || { nd, Vd: Number.isFinite(Vd) ? Vd : 50.0 };
          GLASS_DB[k].nd = nd;
          if (Number.isFinite(Vd)) GLASS_DB[k].Vd = Vd;
        }
      }
    }

    loadLens(obj);
  }catch(err){
    if (ui.footerWarn) ui.footerWarn.textContent = `Load failed: ${err.message}`;
  }finally{
    e.target.value = "";
  }
});

// controls -> rerender
["fieldAngle","rayCount","wavePreset","sensorOffset","renderScale","sensorW","sensorH"].forEach(id=>{
  on("#"+id, "input", renderAll);
  on("#"+id, "change", renderAll);
});
on("#sensorPreset", "change", (e)=>{
  applyPreset(e.target.value);
  renderAll();
});
window.addEventListener("resize", renderAll);

// -------------------- Element Builder Modal --------------------
const modal = {
  root: $("#elementModal"),
  close: $("#elClose"),
  add: $("#elAdd"),
  type: $("#elType"),
  mode: $("#elMode"),
  f: $("#elF"),
  ap: $("#elAp"),
  ct: $("#elCt"),
  gap: $("#elGap"),
  air: $("#elAir"),
  form: $("#elForm"),
  g1: $("#elGlass1"),
  g2: $("#elGlass2"),
  note: $("#elGlassNote"),

  customBox: $("#customBox"),
  customCount: $("#elCustomCount"),
  customPreset: $("#elCustomPreset"),
  customTbody: $("#elCustomTbody"),
};

function openElementModal(){
  fillModalGlassSelects();
  refreshModalVisibility();
  refreshGlassNote();
  buildCustomTable();
  modal.root?.classList.remove("hidden");
}
function closeElementModal(){
  modal.root?.classList.add("hidden");
}

modal.close?.addEventListener("click", closeElementModal);
modal.root?.addEventListener("click", (e)=>{ if (e.target === modal.root) closeElementModal(); });

function fillModalGlassSelects(){
  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));
  const optionHTML = (name) => `<option value="${name}">${glassLabel(name)}</option>`;
  if (modal.g1) modal.g1.innerHTML = keys.map(optionHTML).join("");
  if (modal.g2) modal.g2.innerHTML = keys.map(optionHTML).join("");

  // defaults
  if (modal.g1 && !modal.g1.value) modal.g1.value = "BK7";
  if (modal.g2 && !modal.g2.value) modal.g2.value = "F2";

  // ensure chosen values exist
  if (modal.g1 && !GLASS_DB[modal.g1.value]) modal.g1.value = "BK7";
  if (modal.g2 && !GLASS_DB[modal.g2.value]) modal.g2.value = "F2";
}

function refreshGlassNote(){
  const g1 = modal.g1?.value || "BK7";
  const g2 = modal.g2?.value || "F2";
  const m1 = GLASS_META[g1];
  const m2 = GLASS_META[g2];

  const line = (g, m) => {
    if (!m) return `• ${g}: (no meta)`;
    return `• ${g}: cost=${m.cost} • avail=${m.avail} • ${m.note || ""}`.trim();
  };

  if (modal.note) {
    modal.note.textContent = [
      "This is UI guidance only. Real pricing depends on supplier, diameter, tolerance, coatings, MOQ.",
      line(g1, m1),
      line(g2, m2),
    ].join("\n");
  }
}

function refreshModalVisibility(){
  const mode = modal.mode?.value || "auto";
  const isCustom = (mode === "custom");
  modal.customBox?.classList.toggle("hidden", !isCustom);

  // In custom mode, the auto fields still show but you can ignore them.
}

modal.mode?.addEventListener("change", ()=>{
  refreshModalVisibility();
  buildCustomTable();
});
modal.type?.addEventListener("change", ()=>{
  buildCustomTable();
});
modal.customCount?.addEventListener("change", buildCustomTable);
modal.customPreset?.addEventListener("change", buildCustomTable);
modal.g1?.addEventListener("change", refreshGlassNote);
modal.g2?.addEventListener("change", refreshGlassNote);

on("#btnAddElement", "click", ()=> openElementModal());

// -------------------- Element math (AUTO) --------------------
// All in mm. Phi in 1/mm.
function phiTotalFromF_mm(f_mm){
  const f = Math.max(1e-6, Number(f_mm || 50));
  return 1.0 / f;
}

function radiiFromPhi(phi, n, form){
  const k = Math.max(1e-9, (n - 1));

  if (form === "plano") {
    // R2 plane -> 1/R2=0 -> phi = k*(1/R1) -> R1 = k/phi
    const R1 = (k / phi);
    return { R1, R2: 0.0 };
  }

  if (form === "weakMeniscus") {
    // R2 = -1.6*R1 -> phi = k*(1/R1 + 1/(1.6R1)) = k*(1.625)/R1
    const factor = 1.625;
    const R1 = (k * factor) / phi;
    const R2 = -1.6 * R1;
    return { R1, R2 };
  }

  // symmetric
  const R1 = (2*k) / phi;
  const R2 = -R1;
  return { R1, R2 };
}

function achromatPowerSplit(phiTotal, V1, V2){
  const denom = (V1 - V2);
  if (Math.abs(denom) < 1e-9) return null;
  const phi1 = phiTotal * (V1 / denom);
  const phi2 = -phiTotal * (V2 / denom);
  return { phi1, phi2 };
}

function makeSingletAuto({ f_mm=50, ap=18, ct=4, rearAir=4, form="symmetric", glass="BK7" }){
  const g = GLASS_DB[glass] || GLASS_DB.BK7;
  const phi = phiTotalFromF_mm(f_mm);
  const rr = radiiFromPhi(phi, g.nd, form);
  const s1 = { type:"", R: Number(rr.R1.toFixed(4)), t: ct, ap, glass, stop:false };
  const s2 = { type:"", R: Number(rr.R2.toFixed(4)), t: rearAir, ap, glass:"AIR", stop:false };
  return [s1, s2];
}

function makeAchromatAuto({
  f_mm=50, ap=18, ct=4, gap=0, rearAir=4, form="symmetric",
  crown="BK7", flint="F2"
}){
  const gC = GLASS_DB[crown] || GLASS_DB.BK7;
  const gF = GLASS_DB[flint] || GLASS_DB.F2;

  const phiT = phiTotalFromF_mm(f_mm);
  const split = achromatPowerSplit(phiT, gC.Vd, gF.Vd);
  if (!split) return null;

  const rC = radiiFromPhi(split.phi1, gC.nd, form);
  const rF = radiiFromPhi(split.phi2, gF.nd, form);

  // 4 surfaces
  const s1 = { type:"", R: Number(rC.R1.toFixed(4)), t: ct,  ap, glass: crown, stop:false };
  const s2 = { type:"", R: Number(rC.R2.toFixed(4)), t: gap, ap, glass: flint, stop:false };
  const s3 = { type:"", R: Number(rF.R1.toFixed(4)), t: ct,  ap, glass: flint, stop:false };
  const s4 = { type:"", R: Number(rF.R2.toFixed(4)), t: rearAir, ap, glass: "AIR", stop:false };

  return [s1, s2, s3, s4];
}

// -------------------- Element builder (CUSTOM) --------------------
let customRows = []; // array of {type,R,t,ap,glass}

function buildCustomTable(){
  const isCustom = (modal.mode?.value || "auto") === "custom";
  if (!isCustom) return;

  const count = Number(modal.customCount?.value || 4);
  const preset = modal.customPreset?.value || "blank";
  const ap = Number(modal.ap?.value || 18);
  const ct = Number(modal.ct?.value || 4);
  const gap = Number(modal.gap?.value || 0);
  const air = Number(modal.air?.value || 4);
  const g1 = modal.g1?.value || "BK7";
  const g2 = modal.g2?.value || "F2";

  function blankRow(){
    return { type:"", R:0, t:0, ap, glass:"AIR" };
  }

  customRows = [];
  for (let i=0;i<count;i++) customRows.push(blankRow());

  if (preset === "starter") {
    if (count === 2) {
      customRows[0] = { type:"", R: 40, t: ct, ap, glass: g1 };
      customRows[1] = { type:"", R:-40, t: air, ap, glass:"AIR" };
    } else {
      customRows[0] = { type:"", R: 40, t: ct, ap, glass: g1 };
      customRows[1] = { type:"", R:-40, t: gap, ap, glass: g2 };
      customRows[2] = { type:"", R:-60, t: ct, ap, glass: g2 };
      customRows[3] = { type:"", R: 60, t: air, ap, glass:"AIR" };
    }
  }

  renderCustomTbody();
}

function renderCustomTbody(){
  if (!modal.customTbody) return;
  modal.customTbody.innerHTML = "";

  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));

  customRows.forEach((r, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="width:34px; font-family:var(--mono)">${idx+1}</td>
      <td style="width:90px"><input class="customCell" data-k="type" data-i="${idx}" value="${r.type}"></td>
      <td style="width:110px"><input class="customCell" data-k="R" data-i="${idx}" type="number" step="0.01" value="${r.R}"></td>
      <td style="width:110px"><input class="customCell" data-k="t" data-i="${idx}" type="number" step="0.01" value="${r.t}"></td>
      <td style="width:110px"><input class="customCell" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${r.ap}"></td>
      <td style="width:200px">
        <select class="customCell" data-k="glass" data-i="${idx}">
          ${keys.map(k => `<option value="${k}" ${k===r.glass?"selected":""}>${glassLabel(k)}</option>`).join("")}
        </select>
      </td>
    `;
    modal.customTbody.appendChild(tr);
  });

  modal.customTbody.querySelectorAll("input,select").forEach(el=>{
    el.addEventListener("input", onCustomCell);
    el.addEventListener("change", onCustomCell);
  });
}

function onCustomCell(e){
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;
  const row = customRows[i];
  if (!row) return;

  if (k === "glass" || k === "type") row[k] = el.value;
  else row[k] = Number(el.value);

  // keep ap synced if user changes modal ap
}

// Insert element
modal.add?.addEventListener("click", ()=>{
  clampSelected();

  let insertAt = selectedIndex + 1;
  if (String(lens.surfaces[selectedIndex]?.type || "").toUpperCase() === "IMS") {
    insertAt = Math.max(0, lens.surfaces.length - 1);
  }
  insertAt = Math.min(insertAt, lens.surfaces.length - 1);

  const elType = modal.type?.value || "achromat";
  const elMode = modal.mode?.value || "auto";

  const ap    = Number(modal.ap?.value || 18);
  const ct    = Number(modal.ct?.value || 4);
  const gap   = Number(modal.gap?.value || 0);
  const air   = Number(modal.air?.value || 4);
  const form  = modal.form?.value || "symmetric";
  const g1    = modal.g1?.value || "BK7";
  const g2    = modal.g2?.value || "F2";
  const f_mm  = Number(modal.f?.value || 50);

  let surfacesToAdd = null;

  if (elMode === "custom") {
    // Use customRows as surfacesToAdd, but ensure ap fields exist
    surfacesToAdd = customRows.map(r => ({
      type: r.type || "",
      R: Number(r.R || 0),
      t: Number(r.t || 0),
      ap: Number(r.ap || ap),
      glass: String(r.glass || "AIR"),
      stop: false
    }));
  } else {
    if (elType === "achromat") {
      surfacesToAdd = makeAchromatAuto({ f_mm, ap, ct, gap, rearAir: air, form, crown: g1, flint: g2 });
    } else if (elType === "singlet") {
      surfacesToAdd = makeSingletAuto({ f_mm, ap, ct, rearAir: air, form, glass: g1 });
    } else if (elType === "stop") {
      surfacesToAdd = [{ type:"STOP", R:0.0, t: air, ap, glass:"AIR", stop:true }];
    } else if (elType === "airgap") {
      surfacesToAdd = [{ type:"", R:0.0, t: air, ap, glass:"AIR", stop:false }];
    }
  }

  if (!surfacesToAdd || !surfacesToAdd.length) return;

  // If inserting a STOP, enforce single stop after splice
  lens.surfaces.splice(insertAt, 0, ...surfacesToAdd);

  // enforce single stop: keep first stop encountered
  const stopIdx = findStopSurfaceIndex(lens.surfaces);
  if (stopIdx >= 0) {
    lens.surfaces.forEach((s, i)=>{ s.stop = (i === stopIdx) ? !!s.stop : false; });
  }

  selectedIndex = insertAt;
  applySensorToIMS();
  buildTable();
  renderAll();
  closeElementModal();
});

// -------------------- init --------------------
function init() {
  applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");
  loadLens(lens);
  buildTable();
  bindViewControls();
  renderAll();
}
init();
