/* Meridional Raytracer (2D) — TVL Lens Builder (FINAL)
   - Optical axis: +x, height: y
   - Surfaces: spherical (R!=0) or plane (R=0)
   - Thickness t: distance to next surface vertex (along x)
   - Aperture ap: clear semi-diameter at surface
   - Glass column = medium AFTER the surface (OSLO-ish)
   - Stop = exactly 1 surface
   - EFL/BFL via paraxial bundle (skip IMS clip)
   - T-stop approx: T ≈ EFL / (2*StopAp)  (entrance pupil not modeled)
   - Added: New Lens wizard, Scale→FL, Set T, improved drawing/grid
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

function mountSensorPresetSelect(){
  const keys = Object.keys(SENSOR_PRESETS);
  ui.sensorPreset.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join("");
  ui.sensorPreset.value = "ARRI Alexa Mini LF (LF)";
}

function getSensorWH() {
  const w = Number(ui.sensorW?.value || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"].w);
  const h = Number(ui.sensorH?.value || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"].h);
  return { w, h, halfH: Math.max(0.1, h * 0.5) };
}

function applySensorToIMS() {
  const { halfH } = getSensorWH();
  const ims = lens?.surfaces?.[lens.surfaces.length - 1];
  if (ims && String(ims.type).toUpperCase() === "IMS") ims.ap = halfH;
}

function applyPreset(name) {
  const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
  ui.sensorW.value = p.w.toFixed(2);
  ui.sensorH.value = p.h.toFixed(2);
  applySensorToIMS();
}

// -------------------- glass db (nd,Vd only) --------------------
const GLASS_DB = {
  AIR:   { nd: 1.0,    Vd: 999.0 },

  BK7:   { nd: 1.5168, Vd: 64.17 },
  "N-BK7":{ nd: 1.5168, Vd: 64.17 },
  BAK4:  { nd: 1.5688, Vd: 55.99 },
  F2:    { nd: 1.6200, Vd: 36.37 },
  "N-F2":{ nd: 1.6200, Vd: 36.37 },
  SF5:   { nd: 1.6727, Vd: 32.25 },
  "N-SF5":{ nd: 1.67271, Vd: 32.25 },
  SF10:  { nd: 1.7283, Vd: 28.41 },
  "N-SF10":{ nd: 1.7283, Vd: 28.41 },

  "N-SK16":  { nd: 1.6204, Vd: 60.30 },
  "N-LAK22": { nd: 1.6516, Vd: 55.89 },
  LF5:       { nd: 1.5800, Vd: 40.0 },

  LASF35:   { nd: 1.8061, Vd: 25.4 },
  LASFN31:  { nd: 1.8052, Vd: 25.3 },
  "N-LASF35":{ nd: 1.8061, Vd: 25.4 },
  "N-SF66":  { nd: 1.9229, Vd: 20.9 },

  // CZJ placeholders
  CZJ_1: { nd: 1.5182, Vd: 63.8 },
  CZJ_2: { nd: 1.6465, Vd: 47.5 },
  CZJ_3: { nd: 1.6055, Vd: 60.4 },
  CZJ_4: { nd: 1.7343, Vd: 28.1 },
  CZJ_5: { nd: 1.6810, Vd: 54.7 },
  CZJ_6: { nd: 1.6229, Vd: 60.0 }
};

const GLASS_META = {
  AIR: { cost:"—", avail:"—", note:"No glass." },

  BK7:   { cost:"LOW",  avail:"HIGH", note:"Workhorse crown." },
  "N-BK7":{ cost:"LOW", avail:"HIGH", note:"Same family as BK7." },
  BAK4:  { cost:"LOW",  avail:"HIGH", note:"Higher index crown-ish." },
  F2:    { cost:"LOW",  avail:"HIGH", note:"Classic flint." },
  "N-F2":{ cost:"LOW",  avail:"HIGH", note:"Same family as F2." },
  SF5:   { cost:"MED",  avail:"HIGH", note:"Good negative glass." },
  "N-SF5":{ cost:"MED", avail:"HIGH", note:"Popular negative family." },
  SF10:  { cost:"MED",  avail:"HIGH", note:"More bend, more dispersion." },
  "N-SF10":{ cost:"MED",avail:"HIGH", note:"Same family as SF10." },

  "N-SK16":  { cost:"MED",  avail:"MED", note:"Crown-ish balancing." },
  "N-LAK22": { cost:"MED",  avail:"MED", note:"Lanthanum-ish family." },
  LF5:       { cost:"MED",  avail:"MED", note:"Generic mid glass." },

  LASF35:    { cost:"HIGH", avail:"LOW", note:"High index / low Abbe." },
  LASFN31:   { cost:"HIGH", avail:"LOW", note:"High index." },
  "N-LASF35":{ cost:"HIGH", avail:"LOW", note:"Same family." },
  "N-SF66":  { cost:"HIGH", avail:"LOW", note:"Very high index." },

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
  return base;
}

function glassLabel(name){
  const m = GLASS_META[name];
  if (!m) return name;
  return `${name}  •  ${m.cost ?? "?"}/${m.avail ?? "?"}`;
}
function glassOptionsHTML(selected){
  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));
  return keys.map(name => `<option value="${name}" ${name===selected?"selected":""}>${glassLabel(name)}</option>`).join("");
}

// -------------------- lens templates --------------------
function newBlankLens() {
  return {
    name: "New lens (blank)",
    notes: ["Blank start: only OBJ + IMS."],
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
      "2D meridional sanity design. Not optimized.",
      "Use Scale→FL + Set T to lock focal/T."
    ],
    surfaces: [
      { type:"OBJ",  R: 0.0,       t: 0.0,      ap: 60.0,     glass:"AIR",    stop:false },

      { type:"1",    R: 37.4501,   t: 4.49102,  ap: 16.46707, glass:"CZJ_1", stop:false },
      { type:"2",    R: 135.07984, t: 0.0499,   ap: 16.46707, glass:"AIR",    stop:false },

      { type:"3",    R: 19.59581,  t: 8.23852,  ap: 13.72255, glass:"CZJ_2", stop:false },
      { type:"4",    R: 0.0,       t: 0.998,    ap: 12.22555, glass:"CZJ_3", stop:false },

      { type:"5",    R: 12.7994,   t: 5.48403,  ap: 9.73054,  glass:"AIR",    stop:false },

      { type:"STOP", R: 0.0,       t: 6.48703,  ap: 9.28144,  glass:"AIR",    stop:true  },

      { type:"7",    R: -15.90319, t: 3.50798,  ap: 9.23154,  glass:"CZJ_3", stop:false },
      { type:"8",    R: 0.0,       t: 4.48104,  ap: 10.47904, glass:"CZJ_1", stop:false },
      { type:"9",    R: -21.71158, t: 0.0499,   ap: 10.47904, glass:"AIR",    stop:false },

      { type:"10",   R: 110.3493,  t: 3.98204,  ap: 11.47705, glass:"CZJ_2", stop:false },
      { type:"11",   R: -44.30639, t: 30.6477,  ap: 11.47705, glass:"AIR",    stop:false },

      { type:"IMS",  R: 0.0,       t: 0.0,      ap: 12.77,    glass:"AIR",    stop:false },
    ],
  };
}

// Simple extra template for wizard
function doubleGaussBaseline() {
  // super rough DG-ish layout: 6 elements-ish simplified to surfaces
  return {
    name: "Double-Gauss (baseline)",
    notes: ["Baseline DG-ish geometry. Use Scale→FL + Set T."],
    surfaces: [
      { type:"OBJ",  R:0,     t:0,     ap:60,   glass:"AIR", stop:false },

      { type:"1",    R: 40,   t:4.0,   ap:18,   glass:"BK7", stop:false },
      { type:"2",    R: 120,  t:0.2,   ap:18,   glass:"AIR", stop:false },

      { type:"3",    R: 22,   t:6.5,   ap:15,   glass:"F2",  stop:false },
      { type:"4",    R: 0,    t:1.0,   ap:13,   glass:"BK7", stop:false },

      { type:"STOP", R:0,     t:6.0,   ap:9.0,  glass:"AIR", stop:true  },

      { type:"7",    R:-18,   t:3.8,   ap:10,   glass:"BK7", stop:false },
      { type:"8",    R: 0,    t:4.0,   ap:11,   glass:"F2",  stop:false },
      { type:"9",    R:-26,   t:0.2,   ap:11,   glass:"AIR", stop:false },

      { type:"10",   R: 130,  t:4.0,   ap:12,   glass:"BK7", stop:false },
      { type:"11",   R:-55,   t:26.0,  ap:12,   glass:"AIR", stop:false },

      { type:"IMS",  R:0,     t:0,     ap:12.77,glass:"AIR", stop:false },
    ],
  };
}

function tessarSimple() {
  return {
    name: "Tessar-ish (simple)",
    notes: ["3-group-ish simplification. Use Scale→FL + Set T."],
    surfaces: [
      { type:"OBJ", R:0,   t:0,    ap:60, glass:"AIR", stop:false },

      { type:"1",   R: 55, t:5.0,  ap:18, glass:"BK7", stop:false },
      { type:"2",   R:-55, t:6.0,  ap:18, glass:"AIR", stop:false },

      { type:"STOP",R:0,   t:3.0,  ap:10, glass:"AIR", stop:true },

      { type:"4",   R:-30, t:4.0,  ap:14, glass:"F2",  stop:false },
      { type:"5",   R: 90, t:0.2,  ap:14, glass:"BK7", stop:false },
      { type:"6",   R:-90, t:22.0, ap:14, glass:"AIR", stop:false },

      { type:"IMS", R:0,   t:0,    ap:12.77, glass:"AIR", stop:false },
    ]
  };
}

// -------------------- state / sanitize --------------------
let lens = sanitizeLens(newBlankLens());

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

  // ensure OBJ first and IMS last
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

// -------------------- table --------------------
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
  ui.tbody.innerHTML = "";

  lens.surfaces.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("selected", idx === selectedIndex);

    tr.addEventListener("click", (ev) => {
      if (["INPUT","SELECT","OPTION","TEXTAREA"].includes(ev.target.tagName)) return;
      selectedIndex = idx;
      buildTable();
    });

    tr.innerHTML = `
      <td style="width:42px; font-family:var(--mono)">${idx}</td>
      <td style="width:86px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
      <td style="width:110px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}"></td>
      <td style="width:110px"><input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01" value="${s.t}"></td>
      <td style="width:110px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}"></td>
      <td style="width:170px">
        <select class="cellSelect" data-k="glass" data-i="${idx}">
          ${glassOptionsHTML(s.glass)}
        </select>
      </td>
      <td class="cellChk" style="width:70px">
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

  // Ensure N opposes incoming ray
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

  // plane at x=vx
  if (Math.abs(R) < 1e-9) {
    if (Math.abs(ray.d.x) < 1e-12) return null;
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

function findStopSurfaceIndex(surfaces) {
  return surfaces.findIndex(s => !!s.stop);
}

// -------------------- tracing --------------------
function traceRayThroughLens(ray, surfaces, wavePreset, skipIMSClip=false) {
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

    if (!(skipIMSClip && isIMS) && hitInfo.vignetted) { vignetted = true; break; }

    const nAfter = glassN(s.glass, wavePreset);

    // same medium -> pass through
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
  // prefer stop; else first surface after OBJ; else OBJ
  let refIdx = stopIdx >= 0 ? stopIdx : 1;
  if (!surfaces[refIdx]) refIdx = 0;
  const s = surfaces[refIdx];
  return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10)), refIdx };
}

function buildRays(surfaces, fieldAngleDeg, count) {
  const n = Math.max(3, Math.min(101, count|0));
  const theta = (fieldAngleDeg * Math.PI) / 180;
  const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

  const xStart = (surfaces[0]?.vx ?? 0) - 90;
  const { xRef, apRef } = getRayReferencePlane(surfaces);

  const hMax = apRef * 0.98;
  const rays = [];
  const tanT = (Math.abs(dir.x) < 1e-12) ? 0 : (dir.y / dir.x);

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

  const xStart = (surfaces[0]?.vx ?? 0) - 140;
  const stopIdx = findStopSurfaceIndex(surfaces);
  const xStop = (stopIdx >= 0 ? surfaces[stopIdx].vx : surfaces[0].vx);

  const tanT = (Math.abs(dir.x) < 1e-12) ? 0 : (dir.y / dir.x);
  const y0 = 0 - tanT * (xStop - xStart);
  return { p:{x:xStart, y:y0}, d:dir };
}

function rayHitYAtX(endRay, x) {
  if (!endRay?.d || Math.abs(endRay.d.x) < 1e-12) return null;
  const t = (x - endRay.p.x) / endRay.d.x;
  if (!Number.isFinite(t)) return null;
  return endRay.p.y + t * endRay.d.y;
}

// -------------------- coverage --------------------
function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH){
  let lo = 0, hi = 60;
  let best = 0;

  for (let iter=0; iter<18; iter++){
    const mid = (lo + hi) * 0.5;
    const ray = buildChiefRay(surfaces, mid);
    const tr = traceRayThroughLens(structuredClone(ray), surfaces, wavePreset, false);
    if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

    const y = rayHitYAtX(tr.endRay, sensorX);
    if (y == null) { hi = mid; continue; }

    if (Math.abs(y) <= halfH) { best = mid; lo = mid; }
    else hi = mid;
  }
  return best;
}

// -------------------- EFL/BFL (robust paraxial bundle) --------------------
function lastPhysicalVertexX(surfaces) {
  if (!surfaces?.length) return 0;
  const last = surfaces[surfaces.length - 1];
  const isIMS = String(last?.type || "").toUpperCase() === "IMS";
  const idx = isIMS ? surfaces.length - 2 : surfaces.length - 1;
  return surfaces[Math.max(0, idx)]?.vx ?? 0;
}

function estimateEflBflParaxial(surfaces, wavePreset) {
  const lastVx = lastPhysicalVertexX(surfaces);
  const xStart = (surfaces[0]?.vx ?? 0) - 220;

  // Use a bundle of small heights, ignore outliers
  const heights = [0.2, 0.4, 0.6, 0.8, 1.0]; // mm
  const fVals = [];
  const xCrossVals = [];

  for (const y0 of heights) {
    const ray = { p:{x:xStart, y:y0}, d: {x:1, y:0} };
    const tr = traceRayThroughLens(structuredClone(ray), surfaces, wavePreset, true);
    if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;

    const er = tr.endRay;
    if (Math.abs(er.d.x) < 1e-12) continue;

    const uOut = er.d.y / er.d.x;
    if (!Number.isFinite(uOut) || Math.abs(uOut) < 1e-10) continue;

    const f = -y0 / uOut;
    if (Number.isFinite(f) && Math.abs(f) < 5000) fVals.push(f);

    // x-axis crossing
    if (Math.abs(er.d.y) > 1e-12) {
      const t = -er.p.y / er.d.y;
      const xCross = er.p.x + t * er.d.x;
      if (Number.isFinite(xCross) && Math.abs(xCross) < 1e6) xCrossVals.push(xCross);
    }
  }

  if (fVals.length < 2) return { efl: null, bfl: null };

  // robust mean (trim 1)
  fVals.sort((a,b)=>a-b);
  const trimmed = fVals.length >= 4 ? fVals.slice(1, -1) : fVals;
  const efl = trimmed.reduce((a,b)=>a+b,0) / trimmed.length;

  let bfl = null;
  if (xCrossVals.length >= 2) {
    xCrossVals.sort((a,b)=>a-b);
    const trimmedX = xCrossVals.length >= 4 ? xCrossVals.slice(1, -1) : xCrossVals;
    const xF = trimmedX.reduce((a,b)=>a+b,0) / trimmedX.length;
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
function coversSensorYesNo({ fov, maxField, mode="v", marginDeg=0.5 }) {
  if (!fov || !Number.isFinite(maxField)) return { ok:false, req:null };
  const req = (mode === "h") ? (fov.hfov*0.5) : (mode==="v") ? (fov.vfov*0.5) : (fov.dfov*0.5);
  return { ok: (maxField + marginDeg) >= req, req };
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
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset, false));

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
    ui.footerWarn.textContent = "Auto focus failed (too few valid rays). Try more rays / larger apertures.";
    return;
  }

  ui.sensorOffset.value = best.off.toFixed(2);
  ui.footerWarn.textContent = `Auto focus: sensorOffset=${best.off.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;
  renderAll();
}

// -------------------- scaling helpers (KEY FIX FOR “DRIFT”) --------------------
function scaleLensGeometryToFocal(targetF){
  // Scale R and t by factor k; in first order, focal scales with k.
  // Iterate to avoid nonlinearity.
  const wavePreset = ui.wavePreset?.value || "d";

  for (let iter=0; iter<12; iter++){
    computeVertices(lens.surfaces);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    if (!Number.isFinite(efl) || efl <= 0) break;

    const k = targetF / efl;
    if (!Number.isFinite(k) || k <= 0) break;

    // close enough
    if (Math.abs(efl - targetF) < 0.05) break;

    lens.surfaces.forEach(s=>{
      const t = String(s.type).toUpperCase();
      // we do NOT scale OBJ/IMS t=0, but scaling them also doesn’t matter; keep clean.
      if (t !== "OBJ" && t !== "IMS"){
        s.R = Number.isFinite(s.R) ? s.R * k : s.R;
        s.t = Number.isFinite(s.t) ? s.t * k : s.t;
        // apertures: keep physical; optional scale could be another button later.
      }
    });
  }

  buildTable();
  renderAll();
}

function setApproxTStop(targetT){
  const wavePreset = ui.wavePreset?.value || "d";
  computeVertices(lens.surfaces);
  const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
  const stopIdx = findStopSurfaceIndex(lens.surfaces);
  if (!Number.isFinite(efl) || efl <= 0 || stopIdx < 0) return;

  // T ≈ EFL / (2*StopAp) => StopAp ≈ EFL / (2*T)
  const stopAp = efl / (2 * Math.max(0.01, targetT));
  lens.surfaces[stopIdx].ap = Math.max(0.01, stopAp);

  buildTable();
  renderAll();
}

// -------------------- drawing / view --------------------
let view = { panX:0, panY:0, zoom:1.0, dragging:false, lastX:0, lastY:0 };

function resizeCanvasToCSS() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(2, Math.floor(r.width * dpr));
  canvas.height = Math.max(2, Math.floor(r.height * dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function makeWorldTransform() {
  const r = canvas.getBoundingClientRect();
  const cx = r.width/2 + view.panX;
  const cy = r.height/2 + view.panY;
  const base = Number(ui.renderScale?.value || 1.25) * 3.2;
  const s = base * view.zoom;
  return { cx, cy, s, w:r.width, h:r.height };
}
function worldToScreen(p, world) {
  return { x: world.cx + (p.x * world.s), y: world.cy - (p.y * world.s) };
}

function drawGrid(world){
  ctx.save();
  ctx.lineWidth = 1;

  const minor = 10; // world mm
  const major = 50;

  const worldLeft   = (-world.cx) / world.s;
  const worldRight  = (world.w - world.cx) / world.s;
  const worldTop    = (world.cy) / world.s;
  const worldBottom = (world.cy - world.h) / world.s;

  function drawLines(step, alpha){
    ctx.globalAlpha = alpha;
    for (let x = Math.floor(worldLeft/step)*step; x <= worldRight; x += step){
      const a = worldToScreen({x, y: worldTop}, world);
      const b = worldToScreen({x, y: worldBottom}, world);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    for (let y = Math.floor(worldBottom/step)*step; y <= worldTop; y += step){
      const a = worldToScreen({x: worldLeft, y}, world);
      const b = worldToScreen({x: worldRight, y}, world);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,.07)";
  drawLines(minor, 1.0);
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  drawLines(major, 1.0);

  // axis
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,.20)";
  const ax1 = worldToScreen({x: worldLeft, y:0}, world);
  const ax2 = worldToScreen({x: worldRight, y:0}, world);
  ctx.beginPath(); ctx.moveTo(ax1.x,ax1.y); ctx.lineTo(ax2.x,ax2.y); ctx.stroke();

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

function buildSurfacePolyline(s, ap, steps = 100) {
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
  const front = buildSurfacePolyline(sFront, apRegion, 100);
  const back  = buildSurfacePolyline(sBack,  apRegion, 100);
  if (front.length < 2 || back.length < 2) return;

  const poly = front.concat(back.slice().reverse());

  ctx.save();
  // subtle glass fill
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  let p0 = worldToScreen(poly[0], world);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < poly.length; i++) {
    const p = worldToScreen(poly[i], world);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // edge
  ctx.globalAlpha = 1.0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(0,0,0,.65)";
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
  ctx.lineWidth = 1.35;
  ctx.strokeStyle = "rgba(0,0,0,.70)";

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

  const steps = 110;
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
  ctx.lineWidth = 1.15;
  ctx.strokeStyle = "rgba(42,110,242,.95)";

  for (const tr of rayTraces){
    if (!tr.pts || tr.pts.length < 2) continue;
    ctx.globalAlpha = tr.vignetted ? 0.12 : 0.85;

    ctx.beginPath();
    const p0 = worldToScreen(tr.pts[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<tr.pts.length;i++){
      const p = worldToScreen(tr.pts[i], world);
      ctx.lineTo(p.x, p.y);
    }

    const last = tr.endRay;
    if (last && Number.isFinite(sensorX) && last.d && Math.abs(last.d.x) > 1e-12) {
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
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = "rgba(217,91,91,.95)";
  const a = worldToScreen({x:s.vx, y:-ap}, world);
  const b = worldToScreen({x:s.vx, y: ap}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // caps
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(217,91,91,.55)";
  ctx.beginPath();
  ctx.moveTo(a.x-6, a.y); ctx.lineTo(a.x+6, a.y);
  ctx.moveTo(b.x-6, b.y); ctx.lineTo(b.x+6, b.y);
  ctx.stroke();

  ctx.restore();
}

function drawSensor(world, sensorX, halfH) {
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(0,0,0,.70)";
  ctx.setLineDash([8,7]);

  const a = worldToScreen({x:sensorX, y:-halfH}, world);
  const b = worldToScreen({x:sensorX, y: halfH}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

function drawTitleOverlay(text) {
  ctx.save();
  ctx.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace"}`;
  ctx.fillStyle = "rgba(255,255,255,.70)";
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

  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount   = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";
  const sensorOffset = Number(ui.sensorOffset?.value || 0);

  const ims = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (ims?.vx ?? 0) + sensorOffset;

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset, false));

  const vCount = traces.filter(t => t.vignetted).length;
  const tirCount = traces.filter(t => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
  const T = estimateTStopApprox(efl, lens.surfaces);

  const fov = computeFovDeg(efl, sensorW, sensorH);
  const fovTxt = !fov ? "FOV: —" : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

  const maxField = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, halfH);
  const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: "v", marginDeg: 0.5 });
  const covTxt = !fov
    ? "COV(V): —"
    : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

  ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  ui.tstop.textContent = `T≈ ${T == null ? "—" : ("T" + T.toFixed(2))}`;
  ui.vig.textContent = `Vignette: ${vigPct}%`;
  ui.fov.textContent = fovTxt;
  ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

  ui.eflTop.textContent = ui.efl.textContent;
  ui.bflTop.textContent = ui.bfl.textContent;
  ui.tstopTop.textContent = ui.tstop.textContent;
  ui.fovTop.textContent = fovTxt;
  ui.covTop.textContent = ui.cov.textContent;

  if (tirCount > 0) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  ui.status.textContent =
    `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • ${covTxt}`;

  ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;

  // draw
  resizeCanvasToCSS();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const world = makeWorldTransform();
  drawGrid(world);
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

// -------------------- buttons --------------------
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
  // auto-lock naar “OMIT 50 / T2.67” zodat het niet “66mm” is bij load
  scaleLensGeometryToFocal(50);
  setApproxTStop(2.67);
});
on("#btnLoadDemo", "click", ()=> loadLens(demoLensSimple()));
on("#btnNew", "click", ()=>{
  loadLens(newBlankLens());
  ui.sensorOffset.value = "0";
  view.panX = 0; view.panY = 0; view.zoom = 1.0;
  renderAll();
});

on("#btnScaleToFocal", "click", ()=>{
  const v = prompt("Target focal length (mm)?", "50");
  if (!v) return;
  const target = Number(v);
  if (!Number.isFinite(target) || target <= 0) return;
  scaleLensGeometryToFocal(target);
});

on("#btnSetTStop", "click", ()=>{
  const v = prompt("Target T-stop (approx)?", "2.67");
  if (!v) return;
  const target = Number(v);
  if (!Number.isFinite(target) || target <= 0) return;
  setApproxTStop(target);
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
    ui.footerWarn.textContent = `Load failed: ${err.message}`;
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

// -------------------- NEW LENS WIZARD --------------------
const newLensModal = {
  root: $("#newLensModal"),
  close: $("#nlClose"),
  create: $("#nlCreate"),
  tmpl: $("#nlTemplate"),
  focal: $("#nlFocal"),
  t: $("#nlT"),
  stopPos: $("#nlStopPos"),
  name: $("#nlName"),
};

function openNewLensModal(){ newLensModal.root.classList.remove("hidden"); }
function closeNewLensModal(){ newLensModal.root.classList.add("hidden"); }

on("#btnNewLensWizard", "click", openNewLensModal);
newLensModal.close?.addEventListener("click", closeNewLensModal);
newLensModal.root?.addEventListener("click", (e)=>{ if (e.target === newLensModal.root) closeNewLensModal(); });

newLensModal.create?.addEventListener("click", ()=>{
  const template = newLensModal.tmpl.value;
  const targetF = Number(newLensModal.focal.value || 50);
  const targetT = Number(newLensModal.t.value || 2.67);
  const stopPos = newLensModal.stopPos.value || "keep";
  const nm = String(newLensModal.name.value || "New lens");

  let obj;
  if (template === "blank") obj = newBlankLens();
  else if (template === "doubleGauss") obj = doubleGaussBaseline();
  else if (template === "tessar") obj = tessarSimple();
  else obj = omit50ConceptV1();

  obj.name = nm;

  // optionally force stop to middle-ish
  if (stopPos === "middle") {
    obj.surfaces.forEach(s=>s.stop=false);
    const mid = Math.floor(obj.surfaces.length/2);
    // find a plane stop candidate near mid, else insert new STOP
    let idx = mid;
    for (let k=0;k<obj.surfaces.length;k++){
      const i = Math.min(obj.surfaces.length-2, Math.max(1, mid + (k%2? -k:k)));
      if (String(obj.surfaces[i].type).toUpperCase() !== "OBJ" &&
          String(obj.surfaces[i].type).toUpperCase() !== "IMS") { idx = i; break; }
    }
    obj.surfaces[idx].type = "STOP";
    obj.surfaces[idx].R = 0.0;
    obj.surfaces[idx].stop = true;
  }

  loadLens(obj);

  // lock focal & T
  if (Number.isFinite(targetF) && targetF > 0) scaleLensGeometryToFocal(targetF);
  if (Number.isFinite(targetT) && targetT > 0) setApproxTStop(targetT);

  closeNewLensModal();
});

// -------------------- ELEMENT BUILDER MODAL --------------------
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

let customRows = [];

function openElementModal(){
  fillModalGlassSelects();
  refreshModalVisibility();
  refreshGlassNote();
  buildCustomTable();
  modal.root.classList.remove("hidden");
}
function closeElementModal(){ modal.root.classList.add("hidden"); }

modal.close?.addEventListener("click", closeElementModal);
modal.root?.addEventListener("click", (e)=>{ if (e.target === modal.root) closeElementModal(); });
on("#btnAddElement", "click", openElementModal);

function fillModalGlassSelects(){
  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));
  const optionHTML = (name) => `<option value="${name}">${glassLabel(name)}</option>`;
  modal.g1.innerHTML = keys.map(optionHTML).join("");
  modal.g2.innerHTML = keys.map(optionHTML).join("");
  if (!modal.g1.value) modal.g1.value = "BK7";
  if (!modal.g2.value) modal.g2.value = "F2";
  if (!GLASS_DB[modal.g1.value]) modal.g1.value = "BK7";
  if (!GLASS_DB[modal.g2.value]) modal.g2.value = "F2";
}

function refreshGlassNote(){
  const g1 = modal.g1.value || "BK7";
  const g2 = modal.g2.value || "F2";
  const m1 = GLASS_META[g1];
  const m2 = GLASS_META[g2];
  const line = (g, m) => !m ? `• ${g}: (no meta)` : `• ${g}: cost=${m.cost} • avail=${m.avail} • ${m.note || ""}`.trim();
  modal.note.textContent = [
    "UI guidance only. Real pricing depends on supplier, diameter, tolerance, coatings, MOQ.",
    line(g1, m1),
    line(g2, m2),
  ].join("\n");
}

function refreshModalVisibility(){
  const mode = modal.mode.value || "auto";
  modal.customBox.classList.toggle("hidden", mode !== "custom");
}

modal.mode?.addEventListener("change", ()=>{
  refreshModalVisibility();
  buildCustomTable();
});
modal.type?.addEventListener("change", buildCustomTable);
modal.customCount?.addEventListener("change", buildCustomTable);
modal.customPreset?.addEventListener("change", buildCustomTable);
modal.g1?.addEventListener("change", refreshGlassNote);
modal.g2?.addEventListener("change", refreshGlassNote);

function phiTotalFromF_mm(f_mm){ return 1.0 / Math.max(1e-6, Number(f_mm || 50)); }
function radiiFromPhi(phi, n, form){
  const k = Math.max(1e-9, (n - 1));
  if (form === "plano") {
    const R1 = (k / phi);
    return { R1, R2: 0.0 };
  }
  if (form === "weakMeniscus") {
    const factor = 1.625;
    const R1 = (k * factor) / phi;
    const R2 = -1.6 * R1;
    return { R1, R2 };
  }
  const R1 = (2*k) / phi;
  return { R1, R2: -R1 };
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
  return [
    { type:"", R: Number(rr.R1.toFixed(4)), t: ct, ap, glass, stop:false },
    { type:"", R: Number(rr.R2.toFixed(4)), t: rearAir, ap, glass:"AIR", stop:false },
  ];
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

  return [
    { type:"", R: Number(rC.R1.toFixed(4)), t: ct,  ap, glass: crown, stop:false },
    { type:"", R: Number(rC.R2.toFixed(4)), t: gap, ap, glass: flint, stop:false },
    { type:"", R: Number(rF.R1.toFixed(4)), t: ct,  ap, glass: flint, stop:false },
    { type:"", R: Number(rF.R2.toFixed(4)), t: rearAir, ap, glass: "AIR", stop:false },
  ];
}

function buildCustomTable(){
  const isCustom = (modal.mode.value || "auto") === "custom";
  if (!isCustom) return;

  const count = Number(modal.customCount.value || 4);
  const preset = modal.customPreset.value || "blank";
  const ap = Number(modal.ap.value || 18);
  const ct = Number(modal.ct.value || 4);
  const gap = Number(modal.gap.value || 0);
  const air = Number(modal.air.value || 4);
  const g1 = modal.g1.value || "BK7";
  const g2 = modal.g2.value || "F2";

  customRows = Array.from({length:count}, ()=>({ type:"", R:0, t:0, ap, glass:"AIR" }));

  if (preset === "starter") {
    if (count >= 4) {
      customRows[0] = { type:"", R: 40, t: ct, ap, glass: g1 };
      customRows[1] = { type:"", R:-40, t: gap, ap, glass: g2 };
      customRows[2] = { type:"", R:-60, t: ct, ap, glass: g2 };
      customRows[3] = { type:"", R: 60, t: air, ap, glass:"AIR" };
    } else if (count === 2){
      customRows[0] = { type:"", R: 40, t: ct, ap, glass: g1 };
      customRows[1] = { type:"", R:-40, t: air, ap, glass:"AIR" };
    }
  }

  renderCustomTbody();
}

function renderCustomTbody(){
  modal.customTbody.innerHTML = "";
  const keys = Object.keys(GLASS_DB).sort((a,b)=>a.localeCompare(b));

  customRows.forEach((r, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="width:42px; font-family:var(--mono)">${idx+1}</td>
      <td style="width:90px"><input class="cellInput customCell" data-k="type" data-i="${idx}" value="${r.type}"></td>
      <td style="width:120px"><input class="cellInput customCell" data-k="R" data-i="${idx}" type="number" step="0.01" value="${r.R}"></td>
      <td style="width:120px"><input class="cellInput customCell" data-k="t" data-i="${idx}" type="number" step="0.01" value="${r.t}"></td>
      <td style="width:120px"><input class="cellInput customCell" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${r.ap}"></td>
      <td style="width:220px">
        <select class="cellSelect customCell" data-k="glass" data-i="${idx}">
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
}

// Insert element
modal.add?.addEventListener("click", ()=>{
  clampSelected();

  let insertAt = selectedIndex + 1;
  if (String(lens.surfaces[selectedIndex]?.type || "").toUpperCase() === "IMS") {
    insertAt = Math.max(0, lens.surfaces.length - 1);
  }
  insertAt = Math.min(insertAt, lens.surfaces.length - 1);

  const elType = modal.type.value || "achromat";
  const elMode = modal.mode.value || "auto";

  const ap    = Number(modal.ap.value || 18);
  const ct    = Number(modal.ct.value || 4);
  const gap   = Number(modal.gap.value || 0);
  const air   = Number(modal.air.value || 4);
  const form  = modal.form.value || "symmetric";
  const g1    = modal.g1.value || "BK7";
  const g2    = modal.g2.value || "F2";
  const f_mm  = Number(modal.f.value || 50);

  let surfacesToAdd = null;

  if (elMode === "custom") {
    surfacesToAdd = customRows.map(r => ({
      type: r.type || "",
      R: Number(r.R || 0),
      t: Number(r.t || 0),
      ap: Number(r.ap || ap),
      glass: String(r.glass || "AIR"),
      stop: false
    }));
  } else {
    if (elType === "achromat") surfacesToAdd = makeAchromatAuto({ f_mm, ap, ct, gap, rearAir: air, form, crown: g1, flint: g2 });
    else if (elType === "singlet") surfacesToAdd = makeSingletAuto({ f_mm, ap, ct, rearAir: air, form, glass: g1 });
    else if (elType === "stop") surfacesToAdd = [{ type:"STOP", R:0.0, t: air, ap, glass:"AIR", stop:true }];
    else if (elType === "airgap") surfacesToAdd = [{ type:"", R:0.0, t: air, ap, glass:"AIR", stop:false }];
  }

  if (!surfacesToAdd || !surfacesToAdd.length) return;

  lens.surfaces.splice(insertAt, 0, ...surfacesToAdd);

  // enforce single stop: keep first stop encountered
  const stopIdx = findStopSurfaceIndex(lens.surfaces);
  if (stopIdx >= 0) lens.surfaces.forEach((s, i)=>{ s.stop = (i === stopIdx) ? !!s.stop : false; });

  selectedIndex = insertAt;
  applySensorToIMS();
  buildTable();
  renderAll();
  closeElementModal();
});

// -------------------- init --------------------
function init() {
  mountSensorPresetSelect();
  applyPreset(ui.sensorPreset.value);
  loadLens(lens);
  buildTable();
  bindViewControls();
  renderAll();
}
init();
