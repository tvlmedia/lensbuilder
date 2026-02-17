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
  function clamp01(x){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function smoothstep(a, b, x){
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
   
  // -------------------- canvases --------------------
  const canvas = $("#canvas");
  const ctx = canvas?.getContext("2d");

  const previewCanvasEl = $("#previewCanvas");
  const pctx = previewCanvasEl?.getContext("2d");

  // -------------------- preview state --------------------
  const preview = {
    img: null,
    imgCanvas: document.createElement("canvas"),
    imgCtx: null,
    ready: false,

    imgData: null, // cached pixels

    worldCanvas: document.createElement("canvas"),
    worldCtx: null,
    worldReady: false,
    dirtyKey: "",

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
    focusMode: $("#focusMode"),
    lensFocus: $("#lensFocus"),
    renderScale: $("#renderScale"),

    prevImg: $("#prevImg"),
    prevObjDist: $("#prevObjDist"),
    prevObjH: $("#prevObjH"),
    prevRes: $("#prevRes"),
    btnRenderPreview: $("#btnRenderPreview"),
    btnPreviewFS: $("#btnPreviewFS"),
    previewPane: $("#previewPane"),

    raysPane: $("#raysPane"),
    btnRaysFS: $("#btnRaysFS"),

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

    newLensModal: $("#newLensModal"),
    nlClose: $("#nlClose"),
    nlCreate: $("#nlCreate"),
    nlTemplate: $("#nlTemplate"),
    nlFocal: $("#nlFocal"),
    nlT: $("#nlT"),
    nlStopPos: $("#nlStopPos"),
    nlName: $("#nlName"),

    toastHost: $("#toastHost"),
  };

  function toast(msg, ms = 2200) {
    if (!ui.toastHost) return;
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = String(msg || "");
    ui.toastHost.appendChild(d);
    setTimeout(() => {
      d.style.opacity = "0";
      d.style.transform = "translateY(6px)";
      setTimeout(() => d.remove(), 250);
    }, ms);
  }

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
if (!SENSOR_PRESETS[ui.sensorPreset.value]) ui.sensorPreset.value = "Fuji GFX (MF)";
  }

  function getSensorWH() {
    const w = Number(ui.sensorW?.value || 36.7);
    const h = Number(ui.sensorH?.value || 25.54);
    return { w, h, halfH: Math.max(0.1, h * 0.5), halfW: Math.max(0.1, w * 0.5) };
  }

  const OV = 1.6; // overscan factor for preview

const BASE_URL = new URL("./", window.location.href); // directory van de huidige page
const assetUrl = (p) => new URL(p, BASE_URL).toString();

const DEFAULT_PREVIEW_URL = assetUrl("TVL_Focus_Distortion_Chart_3x2_6000x4000.png");
const DEFAULT_LENS_URL    = assetUrl("bijna-goed.json");
   
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
    if (preview.ready) scheduleRenderPreview();
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
    scheduleRenderPreview();
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

      // STOP mag niet op OBJ of IMS
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
    } else if (k === "glass") s.glass = el.value;
    else if (k === "type") s.type = el.value;
    else s[k] = num(el.value, s[k] ?? 0);

    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
  }
function getSurfacesForMetrics(lensShift) {
  applySensorToIMS();
  const st = buildSurfacesWithBarrelApertures(lens.surfaces, 1.0);
  computeVertices(st, lensShift);
  return st.filter(s => String(s.type || "").toUpperCase() !== "BAR");
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

      const N = { x: -1, y: 0 }; // normals toward object side
      return { hit, t, vignetted, normal: N };
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

  function computeVertices(surfaces, lensShift = 0) {
    let x = 0;
    for (let i = 0; i < surfaces.length; i++) {
      surfaces[i].vx = x;
      x += Number(surfaces[i].t || 0);
    }

    // Pin IMS at x=0
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx >= 0) {
      const shift = -(surfaces[imsIdx].vx || 0);
      for (let i = 0; i < surfaces.length; i++) surfaces[i].vx += shift;
    }

    // +lensShift moves lens toward sensor (+x) (shift all except IMS)
    if (Number.isFinite(lensShift) && Math.abs(lensShift) > 1e-12) {
      for (let i = 0; i < surfaces.length; i++) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t !== "IMS") surfaces[i].vx += lensShift;
      }
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
    if (t === "IMS" || t === "OBJ") return; // don't clamp

    const lim = maxApForSurface(s);
    const ap = Number(s.ap || 0);
    s.ap = Math.max(AP_MIN, Math.min(ap, lim));
  }

  function clampAllApertures(surfaces) {
    if (!Array.isArray(surfaces)) return;
    for (const s of surfaces) clampSurfaceAp(s);
  }

function buildSurfacesWithBarrelApertures(baseSurfaces, k = 1.0) {
  // ✅ Als k>=1: GEEN barrel planes toevoegen (anders knijp je de bundel af in air-gaps)
  if (k >= 0.999) return baseSurfaces.map(s => ({ ...s }));

  const out = [];
  const N = baseSurfaces.length;

  for (let i = 0; i < N; i++) {
    const s = baseSurfaces[i];
    const sNext = baseSurfaces[i + 1];

    const cur = { ...s };
    out.push(cur);
    if (!sNext) continue;

    const typeA = String(cur.type || "").toUpperCase();
    const typeB = String(sNext.type || "").toUpperCase();
    if (typeA === "OBJ" || typeA === "IMS") continue;
    if (typeB === "IMS") continue;

    const mediumAfter = String(cur.glass || "AIR").toUpperCase();
    if (mediumAfter !== "AIR") continue;

    const segT = Number(cur.t || 0);
    if (!Number.isFinite(segT) || segT <= 1e-6) continue;

    const apA = Math.max(0.01, Number(cur.ap || 0));
    const apB = Math.max(0.01, Number(sNext.ap || 0));

    // ✅ realistischer: barrel kleiner dan glas *kan* vignette geven, daarom alleen bij k<1
    // en we gebruiken max(apA, apB) als basis, niet min.
    const apBarrel = Math.max(0.01, Math.max(apA, apB) * k);

    const tHalf = segT * 0.5;
    cur.t = tHalf;

    out.push({
      type: "BAR",
      R: 0.0,
      t: segT - tHalf,
      ap: apBarrel,
      glass: "AIR",
      stop: false,
    });
  }

  return out;
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

      // IMS doesn't clip (sensor plane)
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
      if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

      if (isIMS) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nRight = glassN(String(s.glass || "AIR"), wavePreset);
      const nLeft = (i === 0) ? 1.0 : glassN(String(surfaces[i - 1].glass || "AIR"), wavePreset);

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

  // -------------------- ray bundles --------------------
  function getRayReferencePlane(surfaces) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const s = surfaces[stopIdx];
      return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * 0.98), refIdx: stopIdx };
    }
    let refIdx = 1;
    if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
    const s = surfaces[refIdx] || surfaces[0];
    return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * 0.98), refIdx };
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
    let maxX = -Infinity;
    for (const s of surfaces || []) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      maxX = Math.max(maxX, s.vx);
    }
    return Number.isFinite(maxX) ? maxX : 0;
  }
  function firstPhysicalVertexX(surfaces) {
    if (!surfaces?.length) return 0;
    let minX = Infinity;
    for (const s of surfaces) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      minX = Math.min(minX, s.vx);
    }
    return Number.isFinite(minX) ? minX : (surfaces[0]?.vx ?? 0);
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

  function autoFocus() {
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";

    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount = Number(ui.rayCount?.value || 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const currentLensShift = Number(ui.lensFocus?.value || 0);
    const sensorX = 0.0;

    const range = 20;
    const coarseStep = 0.25;
    const fineStep = 0.05;

    let best = { shift: currentLensShift, rms: Infinity, n: 0 };

    function evalShift(shift) {
  // sync IMS aperture eerst
  applySensorToIMS();

  // build trace surfaces
  const st = buildSurfacesWithBarrelApertures(lens.surfaces, 1.0);
  computeVertices(st, shift);

  const rays = buildRays(st, fieldAngle, rayCount);
  const traces = rays.map((r) => traceRayForward(clone(r), st, wavePreset));
  return spotRmsAtSensorX(traces, sensorX);
}
    function scan(center, halfRange, step) {
      const start = center - halfRange;
      const end = center + halfRange;
      for (let sh = start; sh <= end + 1e-9; sh += step) {
        const { rms, n } = evalShift(sh);
        if (rms == null) continue;
        if (rms < best.rms) best = { shift: sh, rms, n };
      }
    }

    scan(currentLensShift, range, coarseStep);
    if (Number.isFinite(best.rms)) scan(best.shift, 2.0, fineStep);

    if (!Number.isFinite(best.rms) || best.n < 5) {
      if (ui.footerWarn) ui.footerWarn.textContent =
        "Auto focus (lens) failed (too few valid rays). Try more rays / larger apertures.";
      computeVertices(lens.surfaces, currentLensShift);
      renderAll();
      return;
    }

    if (ui.lensFocus) ui.lensFocus.value = best.shift.toFixed(2);
    if (ui.footerWarn) ui.footerWarn.textContent =
      `Auto focus (LENS): lensFocus=${best.shift.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;

    renderAll();
    scheduleRenderPreview();
  }

  // -------------------- drawing --------------------
  let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

   // High-contrast canvas theme
function drawBackgroundCSS(w, h) {
  if (!ctx) return;

  ctx.save();
  // ctx staat al in dpr-space, dus w/h zijn CSS units -> OK
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, w, h);

ctx.globalAlpha = 0.05;
   ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;

  const step = 80;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.restore();
}

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

  // teken in CSS units
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  previewCanvasEl._cssW = Math.max(2, r.width);
  previewCanvasEl._cssH = Math.max(2, r.height);
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
   ctx.strokeStyle = "rgba(255,255,255,.10)";
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

  // fill
  ctx.globalAlpha = 1.0;
ctx.fillStyle = "rgba(140,200,255,0.16)";
    ctx.beginPath();
  let p0 = worldToScreen(poly[0], world);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < poly.length; i++) {
    const p = worldToScreen(poly[i], world);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // edge with glow
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(235,245,255,0.78)";
  ctx.shadowColor = "rgba(70,140,255,0.35)";
  ctx.shadowBlur = 10;
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
ctx.strokeStyle = "rgba(255,255,255,.34)";
     
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
   ctx.lineWidth = 1.6;
ctx.strokeStyle = "rgba(70,140,255,0.85)";
ctx.shadowColor = "rgba(70,140,255,0.45)";
ctx.shadowBlur = 12;
     

    for (const tr of rayTraces) {
      if (!tr.pts || tr.pts.length < 2) continue;
     ctx.globalAlpha = tr.vignetted ? 0.10 : 1.0;

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
ctx.strokeStyle = "rgba(255,255,255,.35)";
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

  // -------- PL mount visuals ----------
  const PL_FFD = 52.0;
  const PL_LENS_LIP = 3.0;

  function drawPLFlange(world, xFlange) {
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.setLineDash([10, 8]);

    const r = canvas.getBoundingClientRect();
    const yWorld = (r.height / (world.s || 1)) * 0.6;

    const a = worldToScreen({ x: xFlange, y: -yWorld }, world);
    const b = worldToScreen({ x: xFlange, y: yWorld }, world);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPLMountCutout(world, xFlange, opts = {}) {
    if (!ctx) return;

    const throatR = Number.isFinite(opts.throatR) ? opts.throatR : 27;
    const outerR = Number.isFinite(opts.outerR) ? opts.outerR : 31;
    const camDepth = Number.isFinite(opts.camDepth) ? opts.camDepth : 14;
    const lensLip = Number.isFinite(opts.lensLip) ? opts.lensLip : 3;
    const flangeT = Number.isFinite(opts.flangeT) ? opts.flangeT : 2.0;

    const P = (x, y) => worldToScreen({ x, y }, world);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
ctx.fillStyle = "rgba(255,255,255,.02)";

    // flange face
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // flange thickness
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange + flangeT, -outerR);
      const c = P(xFlange + flangeT, outerR);
      const d = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // throat tube
    {
      const a = P(xFlange - lensLip, -throatR);
      const b = P(xFlange + camDepth, -throatR);
      const c = P(xFlange + camDepth, throatR);
      const d = P(xFlange - lensLip, throatR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    // tiny shoulder
    {
      const shoulderX = xFlange + flangeT;
      const a = P(shoulderX, -outerR);
      const b = P(shoulderX + 3.0, -outerR);
      const c = P(shoulderX + 3.0, outerR);
      const d = P(shoulderX, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    ctx.font = `11px ${mono}`;
ctx.fillStyle = "rgba(255,255,255,.55)";
     ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lab = P(xFlange - lensLip + 1.5, outerR + 6);
    ctx.fillText("PL mount • Ø54 throat • flange @ -52mm", lab.x, lab.y);

    ctx.restore();
  }

 function drawRulerFrom(world, originX, xMin, yWorld = null, label = "", yOffsetMm = 0) {
  if (!ctx) return;

  let maxAp = 0;
  if (lens?.surfaces?.length) {
    for (const s of lens.surfaces) maxAp = Math.max(maxAp, Math.abs(Number(s.ap || 0)));
  }

  const yBase = (yWorld != null) ? yWorld : (maxAp + 18);
  const y = yBase + yOffsetMm;

  const P = (x, yy) => worldToScreen({ x, y: yy }, world);

  const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
  const fontMajor = 13;
  const fontMinor = 12;

  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(255,255,255,.30)";
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = `${fontMinor}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // base line
  const a = P(xMin, y);
  const b = P(originX, y);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

 // ---- FORCE 1cm ticks (10mm) ----
const pxPerMm = world.s;

const stepMm  = 10; // elke 1cm
const majorMm = 10; // major tick elke 1cm (zelfde als step)
const labelEvery = (pxPerMm < 1.2) ? 50 : 10; // label elke 5cm bij ver uitzoomen, anders elke 1cm

for (let x = originX; x >= xMin - 1e-6; x -= stepMm) {
  const distMm = originX - x;

  // altijd 1cm ticks
  const isMajor = true;
  const tLen = 12;

  const p = P(x, y);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y + tLen);
  ctx.stroke();

  // labels: 1cm of 5cm afhankelijk van zoom
  const shouldLabel = (Math.round(distMm) % labelEvery) === 0;
  if (shouldLabel) {
    const cm = Math.round(distMm / 10);
    const txt = `${cm}cm`;

    ctx.save();
    ctx.font = `${fontMajor}px ${mono}`;
    ctx.shadowColor = "rgba(0,0,0,.75)";
    ctx.shadowBlur = 6;

    const padX = 6, padY = 3;
    const w = ctx.measureText(txt).width + padX * 2;
    const h = fontMajor + padY * 2;

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,.78)";
    ctx.fillRect(p.x - w / 2, p.y + tLen + 3, w, h);

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.shadowColor = "rgba(0,0,0,.75)";
    ctx.shadowBlur = 6;
    ctx.fillText(txt, p.x, p.y + tLen + 5);
    ctx.restore();
  }
}

  if (label) {
    const p0 = P(originX, y);
    const txt = `${label} 0`;
    ctx.save();
    ctx.font = `${fontMajor}px ${mono}`;
    ctx.fillStyle = "rgba(0,0,0,.78)";
    const padX = 7, padY = 4;
    const w = ctx.measureText(txt).width + padX * 2;
    const h = fontMajor + padY * 2;
    ctx.fillRect(p0.x - w / 2, p0.y + 14, w, h);
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.shadowColor = "rgba(0,0,0,.75)";
    ctx.shadowBlur = 6;
    ctx.fillText(txt, p0.x, p0.y + 18);
    ctx.restore();
  }

  ctx.restore();
}

function drawRuler(world, x0 = 0, xMin = -200, yWorld = null) {
  drawRulerFrom(world, x0, xMin, yWorld, "", 0);
}

  function drawTitleOverlay(partsOrText) {
    if (!ctx || !canvas) return;

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const r = canvas.getBoundingClientRect();

    const padX = 14;
    const padY = 10;
    const maxW = r.width - padX * 2;

    const fontSize = 13;
    const lineH = 17;
    const maxLines = 3;

    let parts = [];
    if (Array.isArray(partsOrText)) {
      parts = partsOrText.map(s => String(s || "").trim()).filter(Boolean);
    } else {
      parts = String(partsOrText || "")
        .split(" • ")
        .map(s => s.trim())
        .filter(Boolean);
    }

    ctx.save();
    ctx.font = `${fontSize}px ${mono}`;

    const lines = [];
    let cur = "";

    for (const p of parts) {
      const test = cur ? (cur + " • " + p) : p;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = p;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && cur) lines.push(cur);

    if (lines.length === maxLines && parts.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + " …").width > maxW && last.length > 0) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + " …";
    }

    const barH = padY * 2 + lines.length * lineH;

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(8, 6, r.width - 16, barH);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], padX, 6 + padY + i * lineH);
    }

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

  const lensShift = Number(ui.lensFocus?.value || 0);

  // 0) sync sensor -> IMS
  applySensorToIMS();

  // 1) TRACE surfaces (met BAR)
  const surfacesTrace = buildSurfacesWithBarrelApertures(lens.surfaces, 1.0);
  computeVertices(surfacesTrace, lensShift);

  // 2) DRAW surfaces (zonder BAR, maar mét correcte vx)
  const surfacesDraw = surfacesTrace.filter(s => String(s.type || "").toUpperCase() !== "BAR");

  const { w: sensorW, h: sensorH, halfH } = getSensorWH();
  const fieldAngle = Number(ui.fieldAngle?.value || 0);
  const rayCount = Number(ui.rayCount?.value || 31);
  const wavePreset = ui.wavePreset?.value || "d";

  if (ui.sensorOffset) ui.sensorOffset.value = "0";
  const sensorX = 0.0;

  const plX = -PL_FFD;

  // --- gebruik DRAW set voor geometrie-metrics ---
  const frontVx = firstPhysicalVertexX(surfacesDraw);
  const rearVx  = lastPhysicalVertexX(surfacesDraw);

  const lenToFlange = plX - frontVx;
  const totalLen = lenToFlange + PL_LENS_LIP;
  const lenTxt = (Number.isFinite(totalLen) && totalLen > 0)
    ? `LEN≈ ${totalLen.toFixed(1)}mm (front→PL + mount)`
    : `LEN≈ —`;

  const intrusion = rearVx - plX;
  const rearTxt = (intrusion > 0)
    ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
    : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

  // --- rays op TRACE set ---
  const rays = buildRays(surfacesTrace, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayForward(clone(r), surfacesTrace, wavePreset));

  const vCount = traces.filter(t => t.vignetted).length;
  const tirCount = traces.filter(t => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  // --- EFL/BFL/T: ook op DRAW of TRACE, maar kies er 1 consistent ---
  // Ik zou DRAW pakken (zonder BAR), want BAR is mechanische clip, geen optisch oppervlak.
  const { efl, bfl } = estimateEflBflParaxial(surfacesDraw, wavePreset);
  const T = estimateTStopApprox(efl, surfacesDraw);

  const fov = computeFovDeg(efl, sensorW, sensorH);
  const fovTxt = !fov
    ? "FOV: —"
    : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

  const maxField = coverageTestMaxFieldDeg(surfacesTrace, wavePreset, sensorX, halfH);
  const covMode = "v";
  const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

  const covTxt = !fov
    ? "COV(V): —"
    : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

  // badges...
  if (ui.efl) ui.efl.textContent = `Focal Length: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
  if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
  if (ui.fov) ui.fov.textContent = fovTxt;
  if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

  if (tirCount > 0 && ui.footerWarn) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  if (ui.status) {
    ui.status.textContent = `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • ${covTxt}`;
  }
  if (ui.metaInfo) ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;

  // --- draw ---
  resizeCanvasToCSS();
  const r = canvas.getBoundingClientRect();
  drawBackgroundCSS(r.width, r.height);

  const world = makeWorldTransform();
  drawAxes(world);

  drawRuler(world, 0, -200);

  const xMinPL = Math.min(frontVx - 20, plX - 20);
  drawRulerFrom(world, plX, xMinPL, null, "", +12);

  drawPLFlange(world, plX);

  // lens/stop op DRAW set (consistent met vx)
  drawLens(world, surfacesDraw);
  drawStop(world, surfacesDraw);

  // rays op TRACE set
  drawRays(world, traces, sensorX);

  drawPLMountCutout(world, plX);
  drawSensor(world, sensorX, halfH);

  const eflTxt = efl == null ? "—" : efl.toFixed(2) + "mm";
  const tTxt = T == null ? "—" : "T" + T.toFixed(2);
  const lensOff = Number(ui.lensFocus?.value || 0);

  drawTitleOverlay([
    lens.name,
    lenTxt,
    `EFL ${eflTxt}`,
    `T≈ ${tTxt}`,
    rearTxt,
    `Focus ${lensOff.toFixed(2)}mm`,
  ]);
}

  // -------------------- view controls (RAYS canvas) --------------------
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
      const wantZoom = e.ctrlKey || e.metaKey || e.altKey;
      if (!wantZoom) return;
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

  // -------------------- preview viewport (PAN/ZOOM) --------------------
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

  // dpr transform staat al goed; clear in CSS units
  pctx.clearRect(0, 0, Wc, Hc);

  const hasImg = !!(preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0);
  pctx.fillStyle = hasImg ? "#000" : "#fff";
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
  pctx.drawImage(
    preview.worldCanvas,
    0, 0, preview.worldCanvas.width, preview.worldCanvas.height,
    sr.x, sr.y, sr.w, sr.h
  );

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

    previewCanvasEl.style.touchAction = "none";

    previewCanvasEl.addEventListener("pointerdown", (e) => {
      preview.view.dragging = true;
      preview.view.lastX = e.clientX;
      preview.view.lastY = e.clientY;
      previewCanvasEl.setPointerCapture(e.pointerId);
    });

    previewCanvasEl.addEventListener("pointerup", (e) => {
      preview.view.dragging = false;
      try { previewCanvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    previewCanvasEl.addEventListener("pointercancel", (e) => {
      preview.view.dragging = false;
      try { previewCanvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
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

    previewCanvasEl.addEventListener("wheel", (e) => {
      const wantZoom = e.ctrlKey || e.metaKey || e.altKey;
      if (!wantZoom) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      preview.view.zoom = Math.max(0.12, Math.min(20, preview.view.zoom * factor));
      drawPreviewViewport();
    }, { passive: false });

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
    scheduleRenderPreview();
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

    if (elUI.g1 && elUI.g2 && !elUI.g1.dataset._filled) {
      const keys = Object.keys(GLASS_DB);
      elUI.g1.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
      elUI.g2.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
      elUI.g1.value = "BK7";
      elUI.g2.value = "F2";
      elUI.g1.dataset._filled = "1";
    }

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
      { type: "", R: R2, t: g, ap, glass: "AIR", stop: false },
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
      buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
      return;
    }

    if (v.type === "airgap") {
      let insertAt = safeInsertAtAfterSelected();
      insertAt = maybeInsertFrontAir(insertAt);
      lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: rearAir, ap, glass: "AIR", stop: false });
      selectedIndex = insertAt;
      buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
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
    scheduleRenderPreview();
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

  const lensShift = Number(ui.lensFocus?.value || 0);

  // 0) eerst alles syncen & clamped houden op de echte lens data
  applySensorToIMS();
  clampAllApertures(lens.surfaces);

  // 1) daarna pas trace-surfaces bouwen (met BAR) op basis van de actuele lens
  const surfacesTrace = buildSurfacesWithBarrelApertures(lens.surfaces, 1.0);

  // 2) vertices op trace-surfaces
  computeVertices(surfacesTrace, lensShift);

  const wavePreset = ui.wavePreset?.value || "d";
  if (ui.sensorOffset) ui.sensorOffset.value = "0";
  const sensorX = 0.0;

  const { w: sensorW, h: sensorH } = getSensorWH();

  const stopIdx = findStopSurfaceIndex(surfacesTrace);
  const stopSurf = stopIdx >= 0 ? surfacesTrace[stopIdx] : surfacesTrace[0];
  const xStop = stopSurf.vx;

  const objDist = Number(ui.prevObjDist?.value || 2000);

  // ✅ BUGFIX: object plane gebaseerd op dezelfde surfaces die vx hebben
  const xObjPlane = (surfacesTrace[0]?.vx ?? 0) - objDist;



    const objH = Number(ui.prevObjH?.value || 200);
    const halfObjH = Math.max(1e-3, objH * 0.5);

    const base = Math.max(64, Number(ui.prevRes?.value || 720));

    const key = JSON.stringify({
      lensShift,
      wave: wavePreset,
      sensor: [Number(sensorW.toFixed(4)), Number(sensorH.toFixed(4))],
      objDist,
      objH,
      base,
      lensHash: lens.surfaces.map(s => [s.type, s.R, s.t, s.ap, s.glass, s.stop].join(",")).join("|"),
    });

    if (preview.worldReady && preview.dirtyKey === key) {
      drawPreviewViewport();
      return;
    }
    preview.dirtyKey = key;
    preview.worldReady = false;

    const sensorWv = sensorW * OV;
    const sensorHv = sensorH * OV;

    const aspect = sensorW / sensorH;
    const W = Math.max(64, Math.round(base * aspect));
    const H = Math.max(64, base);

    const hasImg = preview.ready && preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0;
    const imgW = preview.imgCanvas.width;
    const imgH = preview.imgCanvas.height;
    const imgData = hasImg ? preview.imgData : null;

    function sample(u, v) {
      if (!hasImg) return [255, 255, 255, 255];
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

    const halfWv = sensorWv * 0.5;
    const halfHv = sensorHv * 0.5;

    // -------------------- RADIAL VIGNETTE / MAPPING LUT (aspect-correct) --------------------
const LUT_N = 768;
const rObjLUT = new Float32Array(LUT_N);   // object-space radius at object plane for chief ray
const transLUT = new Float32Array(LUT_N);  // mechanical throughput at that field radius
const cos4LUT  = new Float32Array(LUT_N);  // cos^4 approx (chief)

const STOP_SAMPLES = 21; // mechanical vignet sampling
const epsX = 0.05;
const startX = sensorX + epsX;

function stopYs(stopAp) {
  const ys = [];
  const N = Math.max(7, STOP_SAMPLES | 0);
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 2 - 1;
    ys.push(t * stopAp);
  }
  return ys;
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  return a[(a.length / 2) | 0];
}

// Elliptisch genormaliseerde radius (0..1) voor sensor aspect
// rNorm = 1 op "corner" van jouw (overscan) sensor rect.


const stopAp = Math.max(1e-6, Number(stopSurf?.ap || 0));
const yStopSamples = stopYs(stopAp);

const rMax = Math.hypot(halfWv, halfHv);   // ✅ diag/2

for (let k = 0; k < LUT_N; k++) {
  const rNorm = k / (LUT_N - 1);

  const r = rNorm * rMax;                  // ✅ radiale mm
  const y = r;

  
  // Chief ray door stop center (yStop=0)
  let rObjVals = [];
  let cos4Sum = 0;

  {
    const dirChief = normalize({ x: xStop - startX, y: 0 - y });
    const trChief = traceRayReverse({ p: { x: startX, y }, d: dirChief }, surfacesTrace, wavePreset);
    if (!trChief.vignetted && !trChief.tir) {
      const hitObj = intersectPlaneX(trChief.endRay, xObjPlane);
      if (hitObj) rObjVals.push(Math.abs(hitObj.y)); // meridional radius≈|y|
      const cos = Math.max(0, Math.min(1, Math.abs(dirChief.x)));
      cos4Sum += cos ** 4;
    } else {
      cos4Sum += 0;
    }
  }

  // Mechanical throughput: sample rays across stop at this field radius
  let ok = 0;
  for (let ssi = 0; ssi < yStopSamples.length; ssi++) {
    const yStop = yStopSamples[ssi];
    const dir = normalize({ x: xStop - startX, y: yStop - y });

    const tr = traceRayReverse({ p: { x: startX, y }, d: dir }, surfacesTrace, wavePreset);
    if (tr.vignetted || tr.tir) continue;
    const hitObj = intersectPlaneX(tr.endRay, xObjPlane);
    if (!hitObj) continue;
    ok++;
  }

  rObjLUT[k]  = rObjVals.length ? median(rObjVals) : 0;
  transLUT[k] = ok / yStopSamples.length;
  cos4LUT[k]  = cos4Sum;
}

function lookupRadial(rNorm) {
  const t = Math.max(0, Math.min(1, rNorm));
  const x = t * (LUT_N - 1);
  const i0 = Math.floor(x);
  const i1 = Math.min(LUT_N - 1, i0 + 1);
  const u = x - i0;

  const rObj  = rObjLUT[i0]  * (1 - u) + rObjLUT[i1]  * u;
  const trans = transLUT[i0] * (1 - u) + transLUT[i1] * u;
  const cos4  = cos4LUT[i0]  * (1 - u) + cos4LUT[i1]  * u;

  return { rObj, trans, cos4 };
}

// -------------------- render world canvas --------------------
preview.worldCanvas.width = W;
preview.worldCanvas.height = H;

const wctx = preview.worldCtx;
const out = wctx.createImageData(W, H);
const outD = out.data;

const sensorAsp = sensorW / sensorH;
const imgAsp    = hasImg ? (imgW / imgH) : sensorAsp;

// “view window” = jouw object plane in SENSOR aspect
const halfViewH = halfObjH;
const halfViewW = halfObjH * sensorAsp;
const viewW = halfViewW * 2;
const viewH = halfViewH * 2;

// image “contain” in view (no stretch)
// -> als image breder is dan view: letterbox (boven/onder)
// -> als image smaller is: pillarbox (links/rechts)
let dispW, dispH;
if (imgAsp >= sensorAsp) {
  // fit width
  dispW = viewW;
  dispH = viewW / imgAsp;
} else {
  // fit height
  dispH = viewH;
  dispW = viewH * imgAsp;
}

function objectMmToUVContain(xmm, ymm) {
  // buiten de “contained” image -> zwart
  if (Math.abs(xmm) > dispW * 0.5 || Math.abs(ymm) > dispH * 0.5) return null;

  const u = 0.5 + (xmm / dispW);
  const v = 0.5 - (ymm / dispH);
  return { u, v };
}

for (let py = 0; py < H; py++) {
  const sy = (0.5 - (py + 0.5) / H) * (sensorH * OV); // mm
  for (let px = 0; px < W; px++) {
    const sx = ((px + 0.5) / W - 0.5) * (sensorW * OV); // mm
    const idx = (py * W + px) * 4;

    // aspect-correct radial coordinate (0..1 at corner)
const rSensor = Math.hypot(sx, sy);
const rMax = Math.hypot(halfWv, halfHv);      // diag/2 (met OV)
const rNorm = (rMax > 1e-9) ? (rSensor / rMax) : 0;
     
    const { rObj, trans, cos4 } = lookupRadial(rNorm);

    const mech = Math.max(0, Math.min(1, trans));
    const g = mech * Math.max(0, Math.min(1, cos4));

    if (g < 1e-4) {
      outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
      continue;
    }

    // radial magnification mapping (chart blijft consistent)
    // rObj is meridional object radius; scale r -> rObj.
    const rSensor = Math.hypot(sx, sy);
    const kScaleR = (rSensor > 1e-9) ? (rObj / rSensor) : 0;

    const ox = sx * kScaleR;
    const oy = sy * kScaleR;

    const uv = objectMmToUVContain(ox, oy);
if (!uv) {
  outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
  continue;
}

const c = sample(uv.u, uv.v);

    outD[idx]     = Math.max(0, Math.min(255, c[0] * g));
    outD[idx + 1] = Math.max(0, Math.min(255, c[1] * g));
    outD[idx + 2] = Math.max(0, Math.min(255, c[2] * g));
    outD[idx + 3] = 255;
  }
}

wctx.putImageData(out, 0, 0);
preview.worldReady = true;
drawPreviewViewport();

      
  }

  // -------------------- toolbar actions: Scale → FL, Set T --------------------
function scaleToTargetFocal() {
  const wavePreset = ui.wavePreset?.value || "d";
  const lensShift = Number(ui.lensFocus?.value || 0);

  const surf = getSurfacesForMetrics(lensShift);
  const cur = estimateEflBflParaxial(surf, wavePreset).efl;

  if (!Number.isFinite(cur) || cur <= 0) {
    if (ui.footerWarn) ui.footerWarn.textContent = "Scale→FL: current EFL not solvable.";
    return;
  }

  const target = num(prompt("Target focal length (mm)?", String(Math.round(cur))), cur);
  if (!Number.isFinite(target) || target <= 0) return;

  const k = target / cur;

  for (let i = 0; i < lens.surfaces.length; i++) {
    const s = lens.surfaces[i];
    const t = String(s.type).toUpperCase();
    if (t !== "OBJ" && t !== "IMS") s.t = Number(s.t || 0) * k;
    if (Math.abs(Number(s.R || 0)) > 1e-9) s.R = Number(s.R) * k;
  }

  clampAllApertures(lens.surfaces);
  buildTable();
  renderAll();
  scheduleRenderPreview();

  if (ui.footerWarn) ui.footerWarn.textContent =
    `Scale→FL: EFL ${cur.toFixed(2)} → target ${target.toFixed(2)} (k=${k.toFixed(4)}).`;
}

function setTargetTStop() {
  const wavePreset = ui.wavePreset?.value || "d";
  const lensShift = Number(ui.lensFocus?.value || 0);

  const surf = getSurfacesForMetrics(lensShift);
  const { efl } = estimateEflBflParaxial(surf, wavePreset);

  if (!Number.isFinite(efl) || efl <= 0) {
    if (ui.footerWarn) ui.footerWarn.textContent = "Set T: EFL unknown.";
    return;
  }

  const stopIdx = findStopSurfaceIndex(lens.surfaces);
  if (stopIdx < 0) {
    if (ui.footerWarn) ui.footerWarn.textContent = "Set T: no STOP surface marked.";
    return;
  }

  const currentT = estimateTStopApprox(efl, surf);
  const targetT = num(prompt("Target T-stop? (approx)", currentT ? currentT.toFixed(2) : "2.00"), currentT || 2.0);
  if (!Number.isFinite(targetT) || targetT <= 0) return;

  const newAp = efl / (2 * targetT);
  lens.surfaces[stopIdx].ap = Math.max(AP_MIN, Math.min(newAp, maxApForSurface(lens.surfaces[stopIdx])));

  clampAllApertures(lens.surfaces);
  buildTable();
  renderAll();
  scheduleRenderPreview();

  if (ui.footerWarn) ui.footerWarn.textContent =
    `Set T: stop ap → ${lens.surfaces[stopIdx].ap.toFixed(2)}mm for T${targetT.toFixed(2)} @ EFL ${efl.toFixed(2)}mm.`;
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
    if (t === "doubleGauss") return omit50ConceptV1();
    if (t === "tessar") {
      return sanitizeLens({
        name: "Tessar-ish (simple)",
        surfaces: [
          { type: "OBJ", R: 0, t: 0, ap: 60, glass: "AIR", stop: false },
          { type: "1", R: 70, t: 4.5, ap: 18, glass: "BK7", stop: false },
          { type: "2", R: -35, t: 1.2, ap: 18, glass: "AIR", stop: false },
          { type: "STOP", R: 0, t: 6.0, ap: 8, glass: "AIR", stop: true },
          { type: "4", R: -50, t: 3.8, ap: 16, glass: "F2", stop: false },
          { type: "5", R: 120, t: 18, ap: 16, glass: "AIR", stop: false },
          { type: "IMS", R: 0, t: 0, ap: 12.77, glass: "AIR", stop: false },
        ],
      });
    }
    if (t === "omit50v1") return omit50ConceptV1();
    return sanitizeLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0, glass: "AIR", stop: true },
        { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
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

    if (stopPos === "middle") {
      const stopIdx = findStopSurfaceIndex(L.surfaces);
      if (stopIdx >= 0) L.surfaces[stopIdx].stop = false;
      const mid = Math.max(1, Math.min(L.surfaces.length - 2, Math.floor(L.surfaces.length / 2)));
      L.surfaces[mid].stop = true;
      L.surfaces[mid].type = "STOP";
      const f = findStopSurfaceIndex(L.surfaces);
      L.surfaces.forEach((s, i) => { if (i !== f) s.stop = false; });
    }

    loadLens(L);

    // scale to target focal
    {
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
    }

    // set T
    {
      const wavePreset = ui.wavePreset?.value || "d";
      const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
      const stopIdx = findStopSurfaceIndex(lens.surfaces);
      if (stopIdx >= 0 && Number.isFinite(efl) && efl > 0 && Number.isFinite(targetT) && targetT > 0) {
        const newAp = efl / (2 * targetT);
        lens.surfaces[stopIdx].ap = Math.max(AP_MIN, Math.min(newAp, maxApForSurface(lens.surfaces[stopIdx])));
      }
    }

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
    closeNewLensModal();
  }

  // -------------------- fullscreen helpers --------------------
  async function togglePaneFullscreen(pane) {
    if (!pane) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pane.requestFullscreen();
    } catch (e) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Fullscreen failed: ${e.message}`;
    }
  }

  async function togglePreviewFullscreen() {
    await togglePaneFullscreen(ui.previewPane);
  }
  async function toggleRaysFullscreen() {
    await togglePaneFullscreen(ui.raysPane);
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
    buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
  });

  on("#btnMoveUp", "click", () => {
    clampSelected();
    if (selectedIndex <= 0) return;
    const a = lens.surfaces[selectedIndex];
    lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex - 1];
    lens.surfaces[selectedIndex - 1] = a;
    selectedIndex -= 1;
    buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
  });

  on("#btnMoveDown", "click", () => {
    clampSelected();
    if (selectedIndex >= lens.surfaces.length - 1) return;
    const a = lens.surfaces[selectedIndex];
    lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex + 1];
    lens.surfaces[selectedIndex + 1] = a;
    selectedIndex += 1;
    buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
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
    buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
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
    toast("Saved JSON");
  });

  on("#btnAutoFocus", "click", () => autoFocus());
  on("#btnLoadOmit", "click", () => { loadLens(omit50ConceptV1()); toast("Loaded OMIT preset"); });
  on("#btnLoadDemo", "click", () => { loadLens(demoLensSimple()); toast("Loaded demo lens"); });

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
  if (ui.btnRaysFS) on("#btnRaysFS", "click", () => toggleRaysFullscreen());

  // Keyboard shortcuts: P = preview fullscreen, R = rays fullscreen (ignore typing)
  window.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toUpperCase();
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;
    if (typing) return;

    if (e.key?.toLowerCase() === "p") togglePreviewFullscreen();
    if (e.key?.toLowerCase() === "r") toggleRaysFullscreen();
  });

  // Fullscreen change: re-measure + redraw
  document.addEventListener("fullscreenchange", () => {
    resizeCanvasToCSS();
    resizePreviewCanvasToCSS();
    renderAll();
    if (preview.worldReady) drawPreviewViewport();
    else if (preview.ready) scheduleRenderPreview();
  });

  // Window resize: reset preview view + redraw
  window.addEventListener("resize", () => {
    preview.view.panX = 0;
    preview.view.panY = 0;
    preview.view.zoom = 1.0;

    scheduleRenderAll();

    if (preview.worldReady) drawPreviewViewport();
    else if (preview.ready) scheduleRenderPreview();
  });

function setPreviewImage(im) {
  preview.img = im;

  preview.imgCanvas.width = im.naturalWidth;
  preview.imgCanvas.height = im.naturalHeight;

  preview.imgCtx.clearRect(0, 0, preview.imgCanvas.width, preview.imgCanvas.height);
  preview.imgCtx.drawImage(im, 0, 0);

  try {
    preview.imgData = preview.imgCtx
      .getImageData(0, 0, preview.imgCanvas.width, preview.imgCanvas.height)
      .data;
    preview.ready = true;
    toast("Preview image loaded");
  } catch (e) {
    // ✅ CORS/tainted fallback
    preview.imgData = null;
    preview.ready = false;
    if (ui.footerWarn) ui.footerWarn.textContent =
      "Preview image blocked by CORS (tainted canvas). Use a local upload OR host the PNG on same origin (GitHub Pages).";
  }

  preview.worldReady = false;
  scheduleRenderPreview();
}

function loadPreviewFromUrl(url) {
  const im = new Image();
  im.crossOrigin = "anonymous"; // meestal ok voor GH pages
  im.onload = () => setPreviewImage(im);
  im.onerror = () => {
    console.warn("Default preview failed to load:", url);
    if (ui.footerWarn) ui.footerWarn.textContent = `Default preview image not found: ${url}`;
  };

  // cache-buster handig bij GH pages updates
  im.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
}
   
  // Image load (cache pixels once)
if (ui.prevImg) {
  ui.prevImg.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const url = URL.createObjectURL(f);
    const im = new Image();

    im.onload = () => {
      setPreviewImage(im);
      URL.revokeObjectURL(url);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      if (ui.footerWarn) ui.footerWarn.textContent = "Preview image load failed.";
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
      scheduleRenderAll();
      scheduleRenderPreview();
      toast("Loaded JSON");
    } catch (err) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Load failed: ${err?.message || err}`;
      console.error(err);
    } finally {
      if (ui.fileLoad) ui.fileLoad.value = "";
    }
  });

// -------------------- sensor UI bindings --------------------
function resetPreviewView() {
  preview.view.panX = 0;
  preview.view.panY = 0;
  preview.view.zoom = 1.0;
}

function bindControlRerenders() {
  const all = [
    ui.fieldAngle, ui.rayCount, ui.wavePreset, ui.lensFocus, ui.renderScale,
    ui.sensorW, ui.sensorH, ui.sensorPreset,
  ].filter(Boolean);

  for (const el of all) {
    el.addEventListener("input", () => {
      const isSensor = (el === ui.sensorW || el === ui.sensorH);
      if (isSensor) {
        applySensorToIMS();
        resetPreviewView();
      }
      scheduleRenderAll();
      scheduleRenderPreview();
    });

    el.addEventListener("change", () => {
      if (el === ui.sensorPreset) {
        applyPreset(ui.sensorPreset.value);
        resetPreviewView();
      }

      const isSensor = (el === ui.sensorW || el === ui.sensorH);
      if (isSensor) {
        applySensorToIMS();
        resetPreviewView();
      }

      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }

  // preview controls: only rerender preview
  const prev = [ui.prevObjDist, ui.prevObjH, ui.prevRes].filter(Boolean);
  for (const el of prev) {
    el.addEventListener("input", () => scheduleRenderPreview());
    el.addEventListener("change", () => scheduleRenderPreview());
  }

  // focusMode: cam focus disabled here
  if (ui.focusMode) {
    ui.focusMode.addEventListener("change", () => {
      if (ui.focusMode.value === "cam") {
        toast("Cam focus is disabled in this build (sensor plane fixed). Use Lens focus.");
        ui.focusMode.value = "lens";
      }
    });
  }
}
async function loadDefaultLensFromUrl(url) {
  try {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const obj = await res.json();
    if (!obj || !Array.isArray(obj.surfaces)) throw new Error("Invalid lens JSON");
    loadLens(obj);
    toast("Loaded default lens JSON");
    return true;
  } catch (e) {
    console.warn("Default lens failed to load:", url, e);
    if (ui.footerWarn) ui.footerWarn.textContent = `Default lens not found: ${url} (fallback to OMIT)`;
    loadLens(omit50ConceptV1());
    toast("Loaded OMIT fallback");
    return false;
  }
}
  async function init() {
  populateSensorPresetsSelect();
  if (ui.sensorPreset) ui.sensorPreset.value = "Fuji GFX (MF)";
  applyPreset("Fuji GFX (MF)");

  await loadDefaultLensFromUrl(DEFAULT_LENS_URL);

  bindViewControls();
  bindPreviewViewControls();
  bindControlRerenders();

  // force preview res default
  if (ui.prevRes) {
    ui.prevRes.value = "1920";
    ui.prevRes.dispatchEvent(new Event("change", { bubbles: true }));
  }

  loadPreviewFromUrl(DEFAULT_PREVIEW_URL);

  renderAll();
  drawPreviewViewport();
}

init();
})();
