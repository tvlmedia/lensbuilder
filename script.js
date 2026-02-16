/* Meridional Raytracer (2D) — TVL Lens Builder (split-view build)
   - Matches your current index.html + style.css (no tabs required)
   - Element modal: achromats + optional FRONT AIR injection
   - Reverse tracing: IMS aperture does NOT vignette
   - Preview: radial mapping (rotational symmetry) with r->obj LUT
   - OSLO-ish convention: glass = medium AFTER surface
   - Added: Scale → FL, Set T, New Lens modal, Preview fullscreen button
*/

(() => {
  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const on = (sel, ev, fn, opts) => {
    const el = $(sel);
    if (el) el.addEventListener(ev, fn, opts);
    return el;
  };

  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }

  // -------------------- canvases --------------------
  const canvas = $("#canvas");
  const ctx = canvas?.getContext("2d");

  const previewCanvasEl = $("#previewCanvas");
  const pctx = previewCanvasEl?.getContext("2d");

// -------------------- preview state --------------------
const preview = {
  img: null,
  imgCanvas: document.createElement("canvas"),     // source image uploaded
  imgCtx: null,
  ready: false,

  imgData: null, // ✅ CACHE pixels 1x

  // NEW: offscreen rendered "world" (lens output)
  worldCanvas: document.createElement("canvas"),
  worldCtx: null,
  worldReady: false,

  // NEW: view controls for the SENSOR viewport
  view: { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 },
};

preview.imgCtx = preview.imgCanvas.getContext("2d");
preview.worldCtx = preview.worldCanvas.getContext("2d");

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

    // preview controls (exist in your HTML)
    prevImg: $("#prevImg"),
    prevObjDist: $("#prevObjDist"),
    prevObjH: $("#prevObjH"),
    prevRes: $("#prevRes"),
    btnRenderPreview: $("#btnRenderPreview"),
    btnPreviewFS: $("#btnPreviewFS"),
    previewPane: $("#previewPane"),

    // top toolbar
    btnScaleToFocal: $("#btnScaleToFocal"),
    btnSetTStop: $("#btnSetTStop"),
    btnNew: $("#btnNew"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnAdd: $("#btnAdd"),
    btnAddElement: $("#btnAddElement"),
    btnDuplicate: $("#btnDuplicate"),
    btnMoveUp: $("#btnMoveUp"),
    btnMoveDown: $("#btnMoveDown"),
    btnRemove: $("#btnRemove"),
    btnSave: $("#btnSave"),
    fileLoad: $("#fileLoad"),
    btnAutoFocus: $("#btnAutoFocus"),

    // New Lens modal
    newLensModal: $("#newLensModal"),
    nlClose: $("#nlClose"),
    nlCreate: $("#nlCreate"),
    nlTemplate: $("#nlTemplate"),
    nlFocal: $("#nlFocal"),
    nlT: $("#nlT"),
    nlStopPos: $("#nlStopPos"),
    nlName: $("#nlName"),
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
    if (!SENSOR_PRESETS[ui.sensorPreset.value]) ui.sensorPreset.value = "ARRI Alexa Mini LF (LF)";
  }

  function getSensorWH() {
    const w = Number(ui.sensorW?.value || 36.7);
    const h = Number(ui.sensorH?.value || 25.54);
    return { w, h, halfH: Math.max(0.1, h * 0.5), halfW: Math.max(0.1, w * 0.5) };
  }

   const OV = 1.6; // overscan factor

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

// -------------------- camera silhouettes (vector, simple) --------------------
// Coordinates are in mm, relative to PL flange plane (x=0 here means flange plane).
// We'll place them at worldX = plX + shape.x
const CAMERA_PRESETS = {
  "ARRI Alexa Mini (S35)": {
    label: "ARRI",
    model: "ALEXA MINI",
    body:  { x: 0,  y: -70, w: 175, h: 140, r: 10 }, // ✅ start at flange, goes to +x
    bumps: [
      { x: 25, y: -92, w: 80, h: 22, r: 8 },
      { x: 140, y: -35, w: 30, h: 70, r: 8 },
    ],
    logoPos: { x: 10, y: -55 },
    sensorMark: { x: 52, y: 0, w: 18, h: 12 } // ✅ flange +52 = sensor plane
  },

  "ARRI Alexa Mini LF (LF)": {
    label: "ARRI",
    model: "ALEXA MINI LF",
    body:  { x: 0,  y: -78, w: 190, h: 156, r: 12 },
    bumps: [
      { x: 28,  y: -102, w: 90, h: 24, r: 9 },
      { x: 150, y: -40,  w: 34, h: 78, r: 9 },
    ],
    logoPos: { x: 10, y: -60 },
    sensorMark: { x: 52, y: 0, w: 18, h: 12 }
  },

  "Sony VENICE (FF)": {
    label: "SONY",
    model: "VENICE",
    body:  { x: 0,  y: -82, w: 220, h: 164, r: 12 },
    bumps: [
      { x: 35,  y: -108, w: 110, h: 26, r: 10 },
      { x: 160, y: -46,  w: 42,  h: 92, r: 10 },
      { x: 0,   y: -25,  w: 18,  h: 50, r: 6 },
    ],
    logoPos: { x: 10, y: -62 },
    sensorMark: { x: 52, y: 0, w: 18, h: 12 }
  },

  "Fuji GFX (MF)": {
    label: "FUJI",
    model: "ETERNA (GFX)",
    body:  { x: 0,  y: -80, w: 205, h: 160, r: 12 },
    bumps: [
      { x: 30,  y: -106, w: 95, h: 24, r: 9 },
      { x: 150, y: -42,  w: 38, h: 84, r: 9 },
    ],
    logoPos: { x: 10, y: -62 },
    sensorMark: { x: 52, y: 0, w: 18, h: 12 }
  },
};

function getCurrentCameraPreset() {
  const key = ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)";
  return CAMERA_PRESETS[key] || CAMERA_PRESETS["ARRI Alexa Mini LF (LF)"];
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

  let lens = sanitizeLens(omit50ConceptV1());

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
scheduleRenderAll();
scheduleRenderPreview(); // throttle heavy preview render
  }

  function onCellCommit(e) {
    const el = e.target;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (!Number.isFinite(i) || !k) return;

    selectedIndex = i;
    const s = lens.surfaces[i];
    if (!s) return;
if (k === "stop") {
  const want = !!el.checked;

  // ✅ STOP mag niet op OBJ of IMS
  const t0 = String(s.type || "").toUpperCase();
  if (t0 === "OBJ" || t0 === "IMS") {
    el.checked = false;
    if (ui.footerWarn) ui.footerWarn.textContent = "STOP mag niet op OBJ of IMS.";
    return;
  }

  lens.surfaces.forEach((ss, j) => {
    ss.stop = false;
    if (String(ss.type).toUpperCase() === "STOP") ss.type = String(j);
  });

  s.stop = want;
  if (want) s.type = "STOP";
  if (want) s.R = 0.0;
}
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
  if (Math.abs(ray.d.x) < 1e-12) return null;

  const t = (vx - ray.p.x) / ray.d.x;
  if (!Number.isFinite(t) || t <= 1e-9) return null;

  const hit = add(ray.p, mul(ray.d, t));
  const vignetted = Math.abs(hit.y) > ap + 1e-9;

  // plane surface normal is a property of the surface, not of the ray.
// In our convention, normals point toward the OBJECT side (-x).
return { hit, t, vignetted, normal: { x: -1, y: 0 } };
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

  const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
  if (imsIdx >= 0) {
    const shift = -(surfaces[imsIdx].vx || 0);
    for (let i = 0; i < surfaces.length; i++) surfaces[i].vx += shift;
   
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

  const t = String(s.type || "").toUpperCase();
  if (t === "IMS" || t === "OBJ") return; // ✅ niet clampen

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

  // -------------------- tracing --------------------
  function traceRayForward(ray, surfaces, wavePreset, { skipIMS = false } = {}) {
    const pts = [{ x: ray.p.x, y: ray.p.y }];
    let vignetted = false;
    let tir = false;
    let nBefore = 1.0;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const isIMS = String(s?.type || "").toUpperCase() === "IMS";
      if (skipIMS && isIMS) continue;

      const hitInfo = intersectSurface(ray, s);
      if (!hitInfo) { vignetted = true; break; }

      pts.push(hitInfo.hit);

      // IMPORTANT: IMS must not clip rays (acts as sensor plane)
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

 function traceRayReverse(ray, surfaces, wavePreset) {
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;

  for (let i = surfaces.length - 1; i >= 0; i--) {
    const s = surfaces[i];
    const isIMS = String(s?.type || "").toUpperCase() === "IMS";

    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) { vignetted = true; break; }

    pts.push(hitInfo.hit);

    // IMS must not clip rays
    if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

    // OSLO-ish: glass = medium AFTER surface
    // reverse: right side is AFTER surface i, left side is BEFORE surface i
    const nRight = glassN(s.glass, wavePreset);
    const nLeft  = (i === 0) ? 1.0 : glassN(surfaces[i - 1].glass, wavePreset);

    if (Math.abs(nLeft - nRight) < 1e-9) {
      ray = { p: hitInfo.hit, d: ray.d };
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nRight, nLeft);
    if (!newDir) { tir = true; break; }

    ray = { p: hitInfo.hit, d: newDir };
  }

  return { pts, vignetted, tir, endRay: ray };
}

  function intersectPlaneX(ray, xPlane) {
  if (Math.abs(ray.d.x) < 1e-12) return null;
  const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add(ray.p, mul(ray.d, t));
  }

  function sensorHeightToObjectHeight_mm(sensorYmm, sensorX, xStop, xObjPlane, surfaces, wavePreset) {
    const dx = xStop - sensorX;
if (Math.abs(dx) < 1e-6) return null;
const dir = normalize({ x: dx, y: -sensorYmm });
    const eps = 0.01;
    const r0 = { p: { x: sensorX + dir.x * eps, y: sensorYmm + dir.y * eps }, d: dir };
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
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) { hi = mid; continue; }
      if (Math.abs(y) <= halfH) { best = mid; lo = mid; }
      else hi = mid;
    }
    return best;
  }

  // -------------------- EFL/BFL (paraxial-ish) --------------------
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
      const tr = traceRayForward(clone(ray), surfaces, wavePreset, { skipIMS: true });
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
    const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));

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
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

function resizePreviewCanvasToCSS() {
  if (!previewCanvasEl || !pctx) return;
  const r = previewCanvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  previewCanvasEl.width  = Math.max(2, Math.floor(r.width  * dpr));
  previewCanvasEl.height = Math.max(2, Math.floor(r.height * dpr));

  // draw in CSS pixels
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // store CSS size for convenience
  previewCanvasEl._cssW = r.width;
  previewCanvasEl._cssH = r.height;
}
   
  function worldToScreen(p, world) {
    const { cx, cy, s } = world;
    return { x: cx + p.x * s, y: cy - p.y * s };
  }
  function makeWorldTransform() {
    if (!canvas) return { cx: 0, cy: 0, s: 1 };
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2 + view.panX;
    const cy = r.height / 2 + view.panY;
    const base = Number(ui.renderScale?.value || 1.25) * 3.2;
    const s = base * view.zoom;
    return { cx, cy, s };
  }

  function drawAxes(world) {
    if (!ctx) return;
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
    if (!ctx) return;
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
    if (!ctx) return;
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
    if (!ctx) return;
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
    if (!ctx) return;
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
    if (!ctx) return;
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

 

   // -------------------- PL flange + ruler + camera overlay --------------------
const PL_FFD = 52.0; // mm

function getLensTopY(surfaces) {
  let m = 0;
  for (const s of (surfaces || [])) {
    const ap = Math.max(0, Number(s.ap || 0));
    m = Math.max(m, ap);
  }
  return m;
}

function drawRulerFromSensor(world, sensorX0, yWorld, lenMm = 200, stepMm = 10) {
  if (!ctx) return;

  const xStart = sensorX0;           // 0 = sensor plane
  const xEnd = sensorX0 - lenMm;     // to the left

  ctx.save();

  // line
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = 2;

  const a = worldToScreen({ x: xStart, y: yWorld }, world);
  const b = worldToScreen({ x: xEnd,   y: yWorld }, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // ticks + labels
  const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
  ctx.font = `12px ${mono}`;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let mm = 0; mm <= lenMm; mm += stepMm) {
    const x = sensorX0 - mm;

    // tick sizes: 1cm small, 5cm medium, 10cm large
    let tick = 6;
    if (mm % 100 === 0) tick = 16;     // 10 cm
    else if (mm % 50 === 0) tick = 12; // 5 cm

    const p0 = worldToScreen({ x, y: yWorld }, world);
    const p1 = worldToScreen({ x, y: yWorld + (tick / (world.s || 1)) }, world);

    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // label every 10mm = 1cm (in cm)
    if (mm % 10 === 0) {
      const cm = (mm / 10) | 0;
      const tp = worldToScreen(
        { x, y: yWorld + ((tick + 6) / (world.s || 1)) },
        world
      );
      ctx.fillText(String(cm), tp.x, tp.y);
    }
  }

  // "0" marker at sensor
  ctx.fillStyle = "rgba(0,0,0,.75)";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const z = worldToScreen({ x: sensorX0, y: yWorld + (28 / (world.s || 1)) }, world);
  ctx.fillText("SENSOR 0", z.x - 28, z.y);

  ctx.restore();
}

function drawPLFlange(world, xFlange) {
  if (!ctx || !canvas) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.setLineDash([10, 8]);

  const r = canvas.getBoundingClientRect();
  const yWorld = (r.height / (world.s || 1)) * 0.6;

  const a = worldToScreen({ x: xFlange, y: -yWorld }, world);
  const b = worldToScreen({ x: xFlange, y:  yWorld }, world);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

  function drawPLMountSide(world, xFlange) {
  if (!ctx) return;

  // Visual-only rough PL throat/profile (SIDE VIEW)
  const outerR = 30;     // outer “mount body” half-height (mm-ish)
  const throatR = 22;    // throat half-height
  const camDepth = 18;   // how far mount body goes into camera (+x)
  const lensLip  = 4;    // small lip to lens side (-x)

  const P = (x, y) => worldToScreen({ x, y }, world);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,.30)";
  ctx.fillStyle = "rgba(0,0,0,.03)";

  // Outer mount block (camera side)
  {
    const a = P(xFlange,        -outerR);
    const b = P(xFlange+camDepth, -outerR);
    const c = P(xFlange+camDepth,  outerR);
    const d = P(xFlange,         outerR);

    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Small lens-side lip (just to show flange lip)
  {
    const a = P(xFlange - lensLip, -outerR*0.55);
    const b = P(xFlange,          -outerR*0.55);
    const c = P(xFlange,           outerR*0.55);
    const d = P(xFlange - lensLip, outerR*0.55);

    ctx.fillStyle = "rgba(0,0,0,.02)";
    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Throat "hole" (cut-out)
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  {
    const a = P(xFlange,          -throatR);
    const b = P(xFlange+camDepth, -throatR);
    const c = P(xFlange+camDepth,  throatR);
    const d = P(xFlange,           throatR);

    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Throat outline
  {
    const a = P(xFlange,          -throatR);
    const b = P(xFlange+camDepth, -throatR);
    const c = P(xFlange+camDepth,  throatR);
    const d = P(xFlange,           throatR);

    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
    ctx.closePath();
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.font = `12px ${(getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim()}`;
  const t = P(xFlange + 6, outerR + 6);
  ctx.fillText("PL MOUNT (side)", t.x, t.y);

  ctx.restore();
}

  // BODY
  drawRoundedRect(
    world,
    baseX + body.x, body.y,
    body.w, body.h, body.r,
    { fill, stroke, lineWidth: 2 }
  );

  // BUMPS
  for (const b of (cam.bumps || [])) {
    drawRoundedRect(
      world,
      baseX + b.x, b.y,
      b.w, b.h, b.r,
      { fill: bumpFill, stroke, lineWidth: 2 }
    );
  }

  // LOGO text
  ctx.save();
  const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
  ctx.font = `12px ${mono}`;
  ctx.fillStyle = logo;
  ctx.textBaseline = "top";

  const lp = cam.logoPos || { x: body.x + 10, y: body.y + 10 };
  const p1 = worldToScreen({ x: baseX + lp.x, y: lp.y }, world);
  const p2 = worldToScreen({ x: baseX + lp.x, y: lp.y + 14 }, world);

  ctx.fillText(cam.label || "CAM", p1.x, p1.y);
  ctx.fillText(cam.model || "", p2.x, p2.y);
  ctx.restore();
}

function drawTitleOverlay(text) {
  if (!ctx) return;
  ctx.save();
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace";
  ctx.font = "14px " + mono;
  ctx.fillStyle = "#333";
  ctx.fillText(text, 14, 20);
  ctx.restore();
}
// -------------------- render scheduler (RAF throttle) --------------------
let _rafAll = 0;
function scheduleRenderAll() {
  if (_rafAll) return;
  _rafAll = requestAnimationFrame(() => {
    _rafAll = 0;
    renderAll();
  });
}

let _rafPrev = 0;
function scheduleRenderPreview() {
  if (_rafPrev) return;
  _rafPrev = requestAnimationFrame(() => {
    _rafPrev = 0;
    if (preview.ready) renderPreview();
  });
}

function renderAll() {
  if (!canvas || !ctx) return;
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

  // IMS is always X=0 because computeVertices() shifts all vx
  const sensorX0 = 0.0;

  // keep sensorOffset as diagnostic shim for now
  const sensorX = sensorX0 + sensorOffset;

  // PL flange plane is always -52mm from sensor
  const plX = -PL_FFD;

  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));

  const vCount = traces.filter((t) => t.vignetted).length;
  const tirCount = traces.filter((t) => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
  const T = estimateTStopApprox(efl, lens.surfaces);

  const fov = computeFovDeg(efl, sensorW, sensorH);
  const fovTxt = !fov
    ? "FOV: —"
    : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

  const maxField = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, halfH);
  const covMode = "v";
  const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

  const covTxt = !fov
    ? "COV(V): —"
    : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

  // ---- NEW: rear intrusion / clearance relative to PL flange ----
  const rearVx = lastPhysicalVertexX(lens.surfaces); // last non-IMS vertex X
  const intrusion = rearVx - plX; // >0 = rear group passes flange toward sensor
  const rearTxt = (intrusion > 0)
    ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
    : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

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
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  const world = makeWorldTransform();
  drawAxes(world);
  drawPLFlange(world, plX);
drawPLMountSide(world, plX);// ✅ mount ring zichtbaar
drawCameraOverlay(world, plX);  // ✅ camera body zichtbaar
  drawLens(world, lens.surfaces);
  drawStop(world, lens.surfaces);
  drawRays(world, traces, sensorX);
  drawSensor(world, sensorX, halfH); // sensor line

  const eflTxt = efl == null ? "—" : efl.toFixed(2) + "mm";
  const bflTxt = bfl == null ? "—" : bfl.toFixed(2) + "mm";
  const tTxt = T == null ? "—" : "T" + T.toFixed(2);

  drawTitleOverlay(
    `${lens.name} • EFL ${eflTxt} • BFL ${bflTxt} • ${fovTxt} • ${covTxt} • T≈ ${tTxt} • SENSOR@0 • PL@-52 • ${rearTxt}`
  );

     // ... na drawLens(world, lens.surfaces);
  const topY = getLensTopY(lens.surfaces) + 8; // 8mm boven het hoogste glas
  drawRulerFromSensor(world, 0.0, topY, 300, 10); // 300mm lang, per 1cm tick

   
}

  // -------------------- view controls --------------------
  function bindViewControls() {
    if (!canvas) return;

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
function getSensorRectBaseInPane() {
  if (!previewCanvasEl) return { x: 0, y: 0, w: 0, h: 0 };

  const r = previewCanvasEl.getBoundingClientRect();
  const pad = 22;
  const paneW = r.width, paneH = r.height;

  const { w: sensorW, h: sensorH } = getSensorWH();
  const asp = sensorW / sensorH;

  let rw = paneW - pad * 2;
  let rh = rw / asp;

  if (rh > paneH - pad * 2) {
    rh = paneH - pad * 2;
    rw = rh * asp;
  }

  const x = (paneW - rw) * 0.5;
  const y = (paneH - rh) * 0.5;
  return { x, y, w: rw, h: rh };
}

function applyViewToSensorRect(sr0, v) {
  // center-based scale + pan
  const cx0 = sr0.x + sr0.w * 0.5;
  const cy0 = sr0.y + sr0.h * 0.5;

  const cx = cx0 + v.panX;
  const cy = cy0 + v.panY;

  const w = sr0.w * v.zoom;
  const h = sr0.h * v.zoom;

  return { x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

function drawPreviewViewport() {
  if (!previewCanvasEl || !pctx) return;

  resizePreviewCanvasToCSS();

  const Wc = previewCanvasEl._cssW || previewCanvasEl.getBoundingClientRect().width;
  const Hc = previewCanvasEl._cssH || previewCanvasEl.getBoundingClientRect().height;

  // clear in device pixels safely
  pctx.save();
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, previewCanvasEl.width, previewCanvasEl.height);
  pctx.restore();

  // bg
  pctx.fillStyle = "#000";
  pctx.fillRect(0, 0, Wc, Hc);

  if (!preview.worldReady) {
    pctx.fillStyle = "rgba(255,255,255,.65)";
    pctx.font = "12px " + (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace");
    pctx.fillText("Preview: render first", 18, 24);
    return;
  }

  const sr0 = getSensorRectBaseInPane();
  const sr = applyViewToSensorRect(sr0, preview.view);

  pctx.imageSmoothingEnabled = true;
  pctx.drawImage(preview.worldCanvas, 0, 0, preview.worldCanvas.width, preview.worldCanvas.height, sr.x, sr.y, sr.w, sr.h);

  pctx.save();
  pctx.strokeStyle = "rgba(255,255,255,.20)";
  pctx.lineWidth = 1;
  pctx.strokeRect(sr0.x, sr0.y, sr0.w, sr0.h);
  pctx.strokeStyle = "rgba(42,110,242,.55)";
  pctx.strokeRect(sr.x, sr.y, sr.w, sr.h);
  pctx.restore();
}

function bindPreviewViewControls() {
  if (!previewCanvasEl) return;
  if (previewCanvasEl.dataset._pvBound === "1") return;
  previewCanvasEl.dataset._pvBound = "1";

  previewCanvasEl.style.touchAction = "none"; // belangrijk voor trackpads/touch

  previewCanvasEl.addEventListener("pointerdown", (e) => {
    preview.view.dragging = true;
    preview.view.lastX = e.clientX;
    preview.view.lastY = e.clientY;
    previewCanvasEl.setPointerCapture(e.pointerId);
  });

 previewCanvasEl.addEventListener("pointerup", (e) => {
  preview.view.dragging = false;
  try { previewCanvasEl.releasePointerCapture(e.pointerId); } catch(_) {}
});
 previewCanvasEl.addEventListener("pointercancel", (e) => {
  preview.view.dragging = false;
  try { previewCanvasEl.releasePointerCapture(e.pointerId); } catch(_) {}
});

  previewCanvasEl.addEventListener("pointermove", (e) => {
    if (!preview.view.dragging) return;
    const dx = e.clientX - preview.view.lastX;
    const dy = e.clientY - preview.view.lastY;
    preview.view.lastX = e.clientX;
    preview.view.lastY = e.clientY;
    preview.view.panX += dx;
    preview.view.panY += dy;
    drawPreviewViewport();
  });

  previewCanvasEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      preview.view.zoom = Math.max(0.12, Math.min(20, preview.view.zoom * factor));
      drawPreviewViewport();
    },
    { passive: false }
  );

  previewCanvasEl.addEventListener("dblclick", () => {
    preview.view.panX = 0;
    preview.view.panY = 0;
    preview.view.zoom = 1.0;
    drawPreviewViewport();
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
  };

  function modalExists() {
    return !!(elUI.modal && elUI.insert && elUI.cancel && elUI.type && elUI.mode && elUI.f && elUI.ap && elUI.ct);
  }

  function ensureFrontAirFieldInjected() {
    if (!modalExists()) return;
    if (elUI.front) return;

    const grid = elUI.modal.querySelector(".modalGrid");
    if (!grid) return;

    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `
      <label>Front air (mm)</label>
      <input id="elFrontAir" class="cellInput" type="number" step="0.01" value="0" />
    `;

    const rearField = elUI.rear?.closest(".field");
    if (rearField && rearField.parentElement === grid) grid.insertBefore(wrap, rearField);
    else grid.appendChild(wrap);

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
    msg += `Tip: T ≈ EFL / (2*stop_ap) (semi-diam)\n`;
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

    // Ensure options exist (your HTML already has them, but safe)
    if (elUI.type && !elUI.type.querySelector("option")) {
      elUI.type.innerHTML = `
        <option value="achromat">Achromat (air-spaced, 4 surfaces)</option>
        <option value="achromat_cemented">Achromat (cemented, 3 surfaces)</option>
        <option value="singlet">Singlet (2 surfaces)</option>
        <option value="stop">STOP (1 surface)</option>
        <option value="airgap">Air gap (1 surface)</option>
      `;
      elUI.type.value = "achromat";
    }

    // Defaults
    if (elUI.f) elUI.f.value = Number(elUI.f.value || 50);
    if (elUI.ap) elUI.ap.value = Number(elUI.ap.value || 18);
    if (elUI.ct) elUI.ct.value = Number(elUI.ct.value || 4);
    if (elUI.gap) elUI.gap.value = Number(elUI.gap.value || 0.2);
    if (elUI.rear) elUI.rear.value = Number(elUI.rear.value || 4);
    if (elUI.front) elUI.front.value = Number(elUI.front.value || 0);

    [elUI.type, elUI.gap, elUI.front].forEach((x) => {
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

  function buildAchromatCementedAuto({ f, ap, ct, rearAir, form, glass1, glass2 }) {
    const n1 = GLASS_DB[glass1]?.nd ?? 1.5168;
    const n2 = GLASS_DB[glass2]?.nd ?? 1.62;

    const f1 = f * 0.85;
    const f2 = -f * 2.6;

    const R1b = radiusForSymmetricSinglet(f1, n1);
    const R3b = radiusForSymmetricSinglet(Math.abs(f2), n2);

    let R1 = +R1b;
    let R2 = -R1b * 0.85;
    let R3 = +R3b * 0.95;

    if (form === "weakmeniscus") { R1 *= 0.9; R2 *= 1.05; R3 *= 1.1; }
    if (form === "plano") { R1 = 0.0; R2 = -R1b * 1.35; R3 = +R3b * 1.05; }

    const chunk = [
      { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
      { type: "", R: R2, t: ct, ap, glass: glass2, stop: false },
      { type: "", R: R3, t: rearAir, ap, glass: "AIR", stop: false },
    ];
    clampAllApertures(chunk);
    return chunk;
  }

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

    const f = v.f;
    const ap = Math.max(0.1, v.ap);
    const ct = Math.max(0.05, v.ct);
    const gap = Math.max(0.0, v.gap);
    const rearAir = Math.max(0.0, v.rearAir);
    const frontAir = Math.max(0.0, v.frontAir);

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
      buildTable(); applySensorToIMS(); renderAll();
      return;
    }

    if (v.type === "airgap") {
      let insertAt = safeInsertAtAfterSelected();
      insertAt = maybeInsertFrontAir(insertAt);
      lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: rearAir, ap, glass: "AIR", stop: false });
      selectedIndex = insertAt;
      buildTable(); applySensorToIMS(); renderAll();
      return;
    }

    if (v.mode !== "auto") {
      if (ui.footerWarn) ui.footerWarn.textContent = "Custom mode not implemented yet (auto only).";
      return;
    }

    let chunk = null;

    if (v.type === "achromat_cemented") {
      chunk = buildAchromatCementedAuto({ f, ap, ct, rearAir, form: v.form, glass1: v.glass1, glass2: v.glass2 });
    } else if (v.type.includes("achromat")) {
      chunk = buildAchromatAirSpacedAuto({ f, ap, ct, gap, rearAir, form: v.form, glass1: v.glass1, glass2: v.glass2 });
    } else {
      chunk = buildSingletAuto({ f, ap, ct, rearAir, form: v.form, glass1: v.glass1 });
    }

    if (!chunk || !Array.isArray(chunk) || chunk.length < 2) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Element insert failed (check modal values).";
      return;
    }

    let insertAt = safeInsertAtAfterSelected();
    insertAt = maybeInsertFrontAir(insertAt);

    lens.surfaces.splice(insertAt, 0, ...chunk);
    selectedIndex = insertAt;

    buildTable();
    applySensorToIMS();
    renderAll();
  }

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

  // -------------------- preview rendering (split-view) --------------------
  function renderPreview() {
    if (!pctx || !previewCanvasEl) return;

    computeVertices(lens.surfaces);

    const wavePreset = ui.wavePreset?.value || "d";
    const sensorOffset = Number(ui.sensorOffset?.value || 0);

    const { w: sensorW, h: sensorH, halfW, halfH } = getSensorWH();
const sensorWv = sensorW * OV;
const sensorHv = sensorH * OV;
const halfWv = halfW * OV;
const halfHv = halfH * OV;
     
  // Keep exactly the same convention as renderAll():
const sensorX0 = 0.0;          // IMS is at 0 after computeVertices() shift
const sensorX  = sensorX0 + sensorOffset;

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    const xStop = (stopIdx >= 0 ? lens.surfaces[stopIdx].vx : (lens.surfaces[0]?.vx ?? 0) + 10);

    const objDist = Math.max(1, Number(ui.prevObjDist?.value || 2000)); // mm
    const objH = Math.max(1, Number(ui.prevObjH?.value || 500));       // full height in mm
    const halfObjH = objH * 0.5;

    const base = Number(ui.prevRes?.value || 384);
    const xObjPlane = (lens.surfaces[0]?.vx ?? 0) - objDist;

    const aspect = sensorW / sensorH;
const W = Math.max(64, Math.round(base * aspect));
const H = Math.max(64, base);

   

   const hasImg = preview.ready && preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0;

     // ---- fast path: no image loaded -> don't run heavy pixel loop ----
if (!hasImg) {
  preview.worldCanvas.width = W;
  preview.worldCanvas.height = H;

  const wctx = preview.worldCtx;
  wctx.fillStyle = "#111";
  wctx.fillRect(0, 0, W, H);

  wctx.fillStyle = "rgba(255,255,255,.75)";
  wctx.font =
    "14px " + (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace");
  wctx.fillText("Upload an image to preview", 18, 28);

  preview.worldReady = true;
  drawPreviewViewport();
  return;
}
     
const imgW = preview.imgCanvas.width;
const imgH = preview.imgCanvas.height;
const imgData = hasImg ? preview.imgData : null;

    function sample(u, v) {
      if (!hasImg) return [255, 255, 0, 255];      // yellow if no image
      if (u < 0 || u > 1 || v < 0 || v > 1) return [255, 0, 0, 255]; // red outside

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



     
    // LUT: r_sensor -> r_object
const rMaxSensor = Math.hypot(halfWv, halfHv);
     const LUT_N = 512;
    const rObjLUT = new Float32Array(LUT_N);
    const validLUT = new Uint8Array(LUT_N);

    for (let k = 0; k < LUT_N; k++) {
      const a = k / (LUT_N - 1);
      const r = a * rMaxSensor;
// 2-direction sample (±y) — because sensorHeightToObjectHeight_mm only accepts y
const s1 = sensorHeightToObjectHeight_mm( r,  sensorX, xStop, xObjPlane, lens.surfaces, wavePreset);
const s2 = sensorHeightToObjectHeight_mm(-r,  sensorX, xStop, xObjPlane, lens.surfaces, wavePreset);

let rObj = null;
if (s1 != null && Number.isFinite(s1) && s2 != null && Number.isFinite(s2)) {
  rObj = 0.5 * (Math.abs(s1) + Math.abs(s2));
} else if (s1 != null && Number.isFinite(s1)) {
  rObj = Math.abs(s1);
} else if (s2 != null && Number.isFinite(s2)) {
  rObj = Math.abs(s2);
}
       
       if (rObj == null || !Number.isFinite(rObj)) {
  rObjLUT[k] = 0;
  validLUT[k] = 0;
} else {
  // ✅ radial symmetry: radius must be positive, otherwise you get a 180° flip
  rObj = Math.abs(rObj);
  rObjLUT[k] = rObj;
  validLUT[k] = 1;
}
    }

    function lookupROut(r) {
      const t = Math.max(0, Math.min(1, r / rMaxSensor));
      const x = t * (LUT_N - 1);
      const i0 = Math.floor(x);
      const i1 = Math.min(LUT_N - 1, i0 + 1);
      const u = x - i0;

      const v0 = validLUT[i0], v1 = validLUT[i1];
      if (!v0 && !v1) return null;
      if (v0 && !v1) return rObjLUT[i0];
      if (!v0 && v1) return rObjLUT[i1];
      return rObjLUT[i0] * (1 - u) + rObjLUT[i1] * u;
    }

    // render into OFFSCREEN world buffer
preview.worldCanvas.width = W;
preview.worldCanvas.height = H;

const wctx = preview.worldCtx;
const out = wctx.createImageData(W, H);
const outD = out.data;


         // object plane extents (map object-mm -> input image UV)
    const imgAsp = hasImg ? (imgW / imgH) : 1.7777778;
    const halfObjW = halfObjH * imgAsp;

    function objectMmToUV(xmm, ymm) {
      // map object plane coords (mm) to [0..1]
      const u = 0.5 + (xmm / (2 * halfObjW));
      const v = 0.5 - (ymm / (2 * halfObjH)); // y up -> v down
      return { u, v };
    }

    // Fill outD (world image)
    for (let py = 0; py < H; py++) {
      // sensor y in mm
      const sy = (0.5 - (py + 0.5) / H) * sensorHv; // OV


      for (let px = 0; px < W; px++) {
        // sensor x in mm
const sx = ((px + 0.5) / W - 0.5) * sensorWv; // OV
         
        const r = Math.hypot(sx, sy);
        const idx = (py * W + px) * 4;

        // center pixel: trivial
        if (r < 1e-9) {
          const { u, v } = objectMmToUV(0, 0);
          const c = sample(u, v);
          outD[idx] = c[0]; outD[idx + 1] = c[1]; outD[idx + 2] = c[2]; outD[idx + 3] = 255;
          continue;
        }

        const rObj = lookupROut(r);
       if (rObj == null) {
  outD[idx] = 0; outD[idx+1] = 0; outD[idx+2] = 20; outD[idx+3] = 255; // navy
  continue;
}

        // preserve angle (radial mapping): scale vector by rObj/r
        const k = rObj / r;
        const ox = sx * k;
        const oy = sy * k;

        const { u, v } = objectMmToUV(ox, oy);
        const c = sample(u, v);

        outD[idx] = c[0];
        outD[idx + 1] = c[1];
        outD[idx + 2] = c[2];
        outD[idx + 3] = 255;
      }
    }
// ... jouw bestaande pixel-loop blijft hetzelfde,
// alleen op het einde:

wctx.putImageData(out, 0, 0);
preview.worldReady = true;

// now draw it into the sensor viewport
drawPreviewViewport();
  }

  // -------------------- toolbar actions: Scale → FL, Set T --------------------
  function scaleToTargetFocal() {
    const wavePreset = ui.wavePreset?.value || "d";
    const cur = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
    if (!Number.isFinite(cur) || cur <= 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Scale→FL: current EFL not solvable (try a valid stop + lens).";
      return;
    }

    const target = num(prompt("Target focal length (mm)?", String(Math.round(cur))), cur);
    if (!Number.isFinite(target) || target <= 0) return;

    const k = target / cur;

    // Scale geometry: radii + thicknesses (keep OBJ.t, IMS.t = 0)
    for (let i = 0; i < lens.surfaces.length; i++) {
      const s = lens.surfaces[i];
      const t = String(s.type).toUpperCase();
      if (t !== "OBJ" && t !== "IMS") s.t = Number(s.t || 0) * k;
      if (Math.abs(Number(s.R || 0)) > 1e-9) s.R = Number(s.R) * k;
      // ap: leave as-is (don’t auto scale aperture), user controls it
    }

    computeVertices(lens.surfaces);
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();

    if (ui.footerWarn) ui.footerWarn.textContent = `Scale→FL: EFL ${cur.toFixed(2)} → target ${target.toFixed(2)} (k=${k.toFixed(4)}).`;
  }

  function setTargetTStop() {
    const wavePreset = ui.wavePreset?.value || "d";
    const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    if (!Number.isFinite(efl) || efl <= 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Set T: EFL unknown (try Scale→FL or fix geometry).";
      return;
    }

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Set T: no STOP surface marked.";
      return;
    }

    const currentT = estimateTStopApprox(efl, lens.surfaces);
    const targetT = num(prompt("Target T-stop? (approx)", currentT ? currentT.toFixed(2) : "2.00"), currentT || 2.0);
    if (!Number.isFinite(targetT) || targetT <= 0) return;

    // T ≈ EFL / (2 * stop_ap)  => stop_ap ≈ EFL / (2T)
    const newAp = efl / (2 * targetT);

    lens.surfaces[stopIdx].ap = Math.max(AP_MIN, Math.min(newAp, maxApForSurface(lens.surfaces[stopIdx])));

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();

    if (ui.footerWarn) ui.footerWarn.textContent = `Set T: stop ap → ${lens.surfaces[stopIdx].ap.toFixed(2)}mm (semi-diam) for T${targetT.toFixed(2)} @ EFL ${efl.toFixed(2)}mm.`;
  }

  // -------------------- New Lens modal --------------------
  function openNewLensModal() {
    if (!ui.newLensModal) return;
    ui.newLensModal.classList.remove("hidden");
  }
  function closeNewLensModal() {
    if (!ui.newLensModal) return;
    ui.newLensModal.classList.add("hidden");
  }

  function makeTemplate(templateName) {
    const t = String(templateName || "blank");
    if (t === "doubleGauss") return omit50ConceptV1(); // good enough baseline for now
    if (t === "tessar") {
      return sanitizeLens({
        name: "Tessar-ish (simple)",
        surfaces: [
          { type: "OBJ",  R: 0,    t: 0,    ap: 60,  glass: "AIR", stop: false },
          { type: "1",    R: 70,   t: 4.5,  ap: 18,  glass: "BK7", stop: false },
          { type: "2",    R: -35,  t: 1.2,  ap: 18,  glass: "AIR", stop: false },
          { type: "STOP", R: 0,    t: 6.0,  ap: 8,   glass: "AIR", stop: true },
          { type: "4",    R: -50,  t: 3.8,  ap: 16,  glass: "F2",  stop: false },
          { type: "5",    R: 120,  t: 18,   ap: 16,  glass: "AIR", stop: false },
          { type: "IMS",  R: 0,    t: 0,    ap: 12.77, glass: "AIR", stop: false },
        ],
      });
    }
    if (t === "omit50v1") return omit50ConceptV1();
    return sanitizeLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ",  R: 0.0, t: 0.0,  ap: 60.0,  glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0,   glass: "AIR", stop: true  },
        { type: "IMS",  R: 0.0, t: 0.0,  ap: 12.77, glass: "AIR", stop: false },
      ],
    });
  }

  function createNewLensFromModal() {
    const template = ui.nlTemplate?.value || "blank";
    const targetF = num(ui.nlFocal?.value, 50);
    const targetT = num(ui.nlT?.value, 2.8);
    const stopPos = ui.nlStopPos?.value || "keep";
    const name = (ui.nlName?.value || "New lens").trim();

    let L = sanitizeLens(makeTemplate(template));
    L.name = name || L.name;

    // optionally force STOP to middle
    if (stopPos === "middle") {
      const stopIdx = findStopSurfaceIndex(L.surfaces);
      if (stopIdx >= 0) L.surfaces[stopIdx].stop = false;
      const mid = Math.max(1, Math.min(L.surfaces.length - 2, Math.floor(L.surfaces.length / 2)));
      L.surfaces[mid].stop = true;
      L.surfaces[mid].type = "STOP";
      // ensure only one stop
      const f = findStopSurfaceIndex(L.surfaces);
      L.surfaces.forEach((s, i) => { if (i !== f) s.stop = false; });
    }

    loadLens(L);

    // scale to target focal
    (function () {
      const wavePreset = ui.wavePreset?.value || "d";
      const cur = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
      if (Number.isFinite(cur) && cur > 0 && Number.isFinite(targetF) && targetF > 0) {
        const k = targetF / cur;
        for (let i = 0; i < lens.surfaces.length; i++) {
          const s = lens.surfaces[i];
          const tt = String(s.type).toUpperCase();
          if (tt !== "OBJ" && tt !== "IMS") s.t = Number(s.t || 0) * k;
          if (Math.abs(Number(s.R || 0)) > 1e-9) s.R = Number(s.R) * k;
        }
      }
    })();

    // set T
    (function () {
      const wavePreset = ui.wavePreset?.value || "d";
      const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
      const stopIdx = findStopSurfaceIndex(lens.surfaces);
      if (stopIdx >= 0 && Number.isFinite(efl) && efl > 0 && Number.isFinite(targetT) && targetT > 0) {
        const newAp = efl / (2 * targetT);
        lens.surfaces[stopIdx].ap = Math.max(AP_MIN, Math.min(newAp, maxApForSurface(lens.surfaces[stopIdx])));
      }
    })();

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    closeNewLensModal();
  }

  // -------------------- preview fullscreen --------------------
  async function togglePreviewFullscreen() {
    const pane = ui.previewPane;
    if (!pane) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await pane.requestFullscreen();
      }
    } catch (e) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Fullscreen failed: ${e.message}`;
    }
  }

  // -------------------- buttons --------------------
  on("#btnAdd", "click", () => {
    insertAfterSelected({ type: "", R: 0, t: 5.0, ap: 12.0, glass: "AIR", stop: false });
  });

  on("#btnAddElement", "click", () => {
    if (openElementModal()) return;
    if (ui.footerWarn) ui.footerWarn.textContent = "Add Element modal not found (#elementModal etc).";
  });

  on("#btnNew", "click", () => openNewLensModal());

  on("#btnDuplicate", "click", () => {
    clampSelected();
    const s = lens.surfaces[selectedIndex];
    if (!s) return;
    const copy = clone(s);
    lens.surfaces.splice(selectedIndex + 1, 0, copy);
    selectedIndex += 1;
    buildTable(); applySensorToIMS(); renderAll();
  });

  on("#btnMoveUp", "click", () => {
    clampSelected();
    if (selectedIndex <= 0) return;
    const a = lens.surfaces[selectedIndex];
    lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex - 1];
    lens.surfaces[selectedIndex - 1] = a;
    selectedIndex -= 1;
    buildTable(); applySensorToIMS(); renderAll();
  });

  on("#btnMoveDown", "click", () => {
    clampSelected();
    if (selectedIndex >= lens.surfaces.length - 1) return;
    const a = lens.surfaces[selectedIndex];
    lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex + 1];
    lens.surfaces[selectedIndex + 1] = a;
    selectedIndex += 1;
    buildTable(); applySensorToIMS(); renderAll();
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
    buildTable(); applySensorToIMS(); renderAll();
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

  on("#btnScaleToFocal", "click", () => scaleToTargetFocal());
  on("#btnSetTStop", "click", () => setTargetTStop());

  // New Lens modal bindings
  if (ui.newLensModal) {
    on("#nlClose", "click", (e) => { e.preventDefault(); closeNewLensModal(); });
    on("#nlCreate", "click", (e) => { e.preventDefault(); createNewLensFromModal(); });
    ui.newLensModal.addEventListener("mousedown", (e) => { if (e.target === ui.newLensModal) closeNewLensModal(); });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ui.newLensModal && !ui.newLensModal.classList.contains("hidden")) closeNewLensModal();
    });
  }

  // Preview bindings
  if (ui.btnRenderPreview) on("#btnRenderPreview", "click", () => renderPreview());
  if (ui.btnPreviewFS) on("#btnPreviewFS", "click", () => togglePreviewFullscreen());
  // Keyboard shortcut: P => fullscreen preview
  window.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;
  if (typing) return;

  if (e.key?.toLowerCase() === "p") togglePreviewFullscreen();
});

    document.addEventListener("fullscreenchange", () => {
  // ✅ canvas size verandert in fullscreen
  resizePreviewCanvasToCSS();

  // ✅ als world al gerenderd is: alleen viewport redraw (geen heavy render)
  if (preview.worldReady) {
    drawPreviewViewport();
    return;
  }

  // ✅ anders: render 1x als er een image is
  if (preview.ready) renderPreview();
  else drawPreviewViewport();
});

  if (ui.prevImg) {
    ui.prevImg.addEventListener("change", (e) => {
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

// CACHE imgData 1x (BELANGRIJK)
preview.imgData = preview.imgCtx.getImageData(0, 0, preview.imgCanvas.width, preview.imgCanvas.height).data;

preview.ready = true;
preview.worldReady = false;   // ✅ reset world cache
scheduleRenderPreview();
        URL.revokeObjectURL(url);
      };
      im.src = url;
    });
  }

  // -------------------- file load --------------------
  on("#fileLoad", "change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
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
    } catch (err) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Load failed: ${err.message}`;
    } finally {
      e.target.value = "";
    }
  });

  // -------------------- controls -> rerender --------------------
 ["fieldAngle", "rayCount", "wavePreset", "sensorOffset", "renderScale", "sensorW", "sensorH"].forEach((id) => {
  on("#" + id, "input", scheduleRenderAll);
  on("#" + id, "change", scheduleRenderAll);
});

  // preview numeric controls => rerender preview (only if img loaded)
 ["prevObjDist", "prevObjH", "prevRes"].forEach((id) => {
  on("#" + id, "input", () => scheduleRenderPreview());
  on("#" + id, "change", () => scheduleRenderPreview());
});

  on("#sensorPreset", "change", (e) => {
    applyPreset(e.target.value);
    clampAllApertures(lens.surfaces);
    renderAll();
    if (preview.ready) renderPreview();
  });

 window.addEventListener("resize", () => {
  // reset viewport omdat sr0 verandert
  preview.view.panX = 0;
  preview.view.panY = 0;
  preview.view.zoom = 1.0;

  scheduleRenderAll();
  if (preview.ready) renderPreview();
  else drawPreviewViewport();
});

  

  // -------------------- init --------------------
function init() {
  populateSensorPresetsSelect();
  applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");
  loadLens(lens);
  bindViewControls();
  bindPreviewViewControls();
  drawPreviewViewport(); // <= hier
}
  init();
})();
