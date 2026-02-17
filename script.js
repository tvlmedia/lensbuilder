/* Meridional Raytracer (2D) — TVL Lens Builder (single-file script)
   - Full working file: UI + table + draw + rays + EFL/BFL + preview LUT
   - OSLO-ish: glass = medium AFTER surface
   - Reverse tracing preview: IMS does NOT vignette
   - Includes PL-mount drawing + sensor plane ruler (10mm ticks)
   - Loads default lens JSON + focus/distortion chart from same folder (GitHub Pages safe)
*/

(() => {
  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const on = (sel, ev, fn, opts) => {
    const el = $(sel);
    if (el) el.addEventListener(ev, fn, opts);
    return el;
  };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;

  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }

  function median(arr) {
    if (!arr || !arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length & 1 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  function smoothstep(a, b, x) {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  // -------------------- base urls --------------------
  const BASE_URL = new URL("./", window.location.href);
  const assetUrl = (p) => new URL(p, BASE_URL).toString();

  const DEFAULT_PREVIEW_URL = assetUrl("TVL_Focus_Distortion_Chart_3x2_6000x4000.png");
  const DEFAULT_LENS_URL = assetUrl("bijna-goed.json");

  // -------------------- canvases --------------------
  const canvas = $("#canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;

  const previewCanvasEl = $("#previewCanvas");
  const pctx = previewCanvasEl ? previewCanvasEl.getContext("2d") : null;

  // -------------------- UI handles --------------------
  const ui = {
    tbody: $("#surfTbody"),
    status: $("#statusText"),

    efl: $("#badgeEfl"),
    bfl: $("#badgeBfl"),
    tstop: $("#badgeT"),
    vig: $("#badgeVig"),
    fov: $("#badgeFov"),
    cov: $("#badgeCov"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    fovTop: $("#badgeFovTop"),
    covTop: $("#badgeCovTop"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    // controls
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

    // preview
    prevImg: $("#prevImg"),
    prevObjDist: $("#prevObjDist"),
    prevObjH: $("#prevObjH"),
    prevRes: $("#prevRes"),
    btnRenderPreview: $("#btnRenderPreview"),
    btnPreviewFS: $("#btnPreviewFS"),
    previewPane: $("#previewPane"),

    raysPane: $("#raysPane"),
    btnRaysFS: $("#btnRaysFS"),

    // lens actions
    btnScaleToFocal: $("#btnScaleToFocal"),
    btnSetTStop: $("#btnSetTStop"),
    btnNew: $("#btnNew"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnAdd: $("#btnAdd"),
    btnDuplicate: $("#btnDuplicate"),
    btnMoveUp: $("#btnMoveUp"),
    btnMoveDown: $("#btnMoveDown"),
    btnRemove: $("#btnRemove"),
    btnSave: $("#btnSave"),
    fileLoad: $("#fileLoad"),
    btnAutoFocus: $("#btnAutoFocus"),

    // element modal (optioneel)
    btnAddElement: $("#btnAddElement"),
    elementModal: $("#elementModal"),
    elClose: $("#elClose"),
    elCreate: $("#elCreate"),
    elType: $("#elType"),
    elFrontAir: $("#elFrontAir"),
    elGap: $("#elGap"),

    // new lens modal (optioneel)
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

  function setStatus(msg) {
    if (ui.status) ui.status.textContent = String(msg ?? "");
  }

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
    return { w, h, halfW: Math.max(0.1, w * 0.5), halfH: Math.max(0.1, h * 0.5), diag: Math.hypot(w, h) };
  }

  function applyPreset(name) {
    const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
    if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
    if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
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

  // -------------------- lenses --------------------
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
      name: "OMIT 50mm (concept v1)",
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
  let selectedIndex = 0;

  function loadLens(obj) {
    lens = sanitizeLens(obj);
    selectedIndex = 0;
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
    if (preview.ready) scheduleRenderPreview();
  }

  // -------------------- IMS matches sensor half-height --------------------
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

  // -------------------- physical sanity clamps --------------------
  const AP_SAFETY = 0.90;
  const AP_MAX_PLANE = 60.0;
  const AP_MIN = 0.01;

  function maxApForSurface(s) {
    const R = Number(s?.R || 0);
    if (!Number.isFinite(R) || Math.abs(R) < 1e-9) return AP_MAX_PLANE;
    return Math.max(AP_MIN, Math.abs(R) * AP_SAFETY);
  }

  function clampSurfaceAp(s) {
    if (!s) return;
    const t = String(s.type || "").toUpperCase();
    if (t === "IMS" || t === "OBJ") return;
    const lim = maxApForSurface(s);
    const ap = Number(s.ap || 0);
    s.ap = Math.max(AP_MIN, Math.min(ap, lim));
  }

  function clampAllApertures(surfaces) {
    if (!Array.isArray(surfaces)) return;
    for (const s of surfaces) clampSurfaceAp(s);
  }

  // -------------------- table focus restore (so typing doesn’t jump) --------------------
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

  function clampSelected() {
    selectedIndex = clamp(selectedIndex | 0, 0, lens.surfaces.length - 1);
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
    } else if (k === "glass") {
      s.glass = el.value;
    } else if (k === "type") {
      s.type = el.value;
    } else {
      s[k] = num(el.value, s[k] ?? 0);
    }

    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
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

  // -------------------- surface geometry --------------------
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
      const N = { x: -1, y: 0 };
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

  function intersectPlaneX(ray, xPlane) {
    if (Math.abs(ray.d.x) < 1e-12) return null;
    const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add(ray.p, mul(ray.d, t));
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

  // -------------------- rays bundle --------------------
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
    const n = clamp(count | 0, 3, 101);
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 120;
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

  // -------------------- EFL/BFL estimate --------------------
  function estimateEflBflParaxial(surfaces, wavePreset) {
    const lastVx = lastPhysicalVertexX(surfaces);
    const xStart = (surfaces[0]?.vx ?? 0) - 200;

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

  // -------------------- drawing view --------------------
  let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

  function resizeCanvasToCSS() {
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function worldToScreen(p, world) {
    const { cx, cy, s } = world;
    return { x: cx + p.x * s, y: cy - p.y * s };
  }

  function drawBackground(w, h) {
    ctx.save();
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.06;
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

  function drawAxes(world) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    const p1 = worldToScreen({ x: -260, y: 0 }, world);
    const p2 = worldToScreen({ x: 900, y: 0 }, world);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSurface(world, s, isStop) {
    const vx = s.vx;
    const ap = Math.max(0, s.ap);
    const R = s.R;

    ctx.save();
    ctx.lineWidth = isStop ? 2 : 1.25;
    ctx.strokeStyle = isStop ? "rgba(42,110,242,.9)" : "rgba(255,255,255,.25)";

    if (Math.abs(R) < 1e-9) {
      const a = worldToScreen({ x: vx, y: -ap }, world);
      const b = worldToScreen({ x: vx, y: ap }, world);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const cx = vx + R;
    const rad = Math.abs(R);

    const steps = 64;
    let first = true;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 - 1; // -1..1
      const y = t * ap;
      const inside = rad * rad - y * y;
      if (inside <= 0) continue;
      const dx = Math.sqrt(inside);
      const x = (R > 0) ? (cx - dx) : (cx + dx);
      const p = worldToScreen({ x, y }, world);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawLens(world, surfaces) {
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      drawSurface(world, s, !!s.stop || t === "STOP");
    }
  }

  function drawRays(world, traces) {
    ctx.save();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(66,209,143,.75)";

    for (const tr of traces) {
      const pts = tr.pts;
      if (!pts || pts.length < 2) continue;

      ctx.globalAlpha = tr.vignetted || tr.tir ? 0.15 : 0.85;
      ctx.beginPath();
      const p0 = worldToScreen(pts[0], world);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) {
        const pi = worldToScreen(pts[i], world);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSensor(world) {
    const { halfH } = getSensorWH();
    const x = 0.0; // IMS pinned at 0

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    const a = worldToScreen({ x, y: -halfH }, world);
    const b = worldToScreen({ x, y: halfH }, world);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("SENSOR (IMS @ x=0)", a.x + 8, a.y - 8);
    ctx.restore();
  }

  // PL mount & ruler: flange distance 52.00mm (PL)
  const PL_FFD = 52.0;

  function drawPLMount(world) {
    const xMount = -PL_FFD;

    const outerR = 26.0;     // ~ PL throat radius (approx)
    const innerR = 22.0;
    const lugR = 28.0;

    ctx.save();

    // vertical reference line at mount plane
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    {
      const a = worldToScreen({ x: xMount, y: -40 }, world);
      const b = worldToScreen({ x: xMount, y: 40 }, world);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // draw 3-lug-ish ring (stylized)
    ctx.strokeStyle = "rgba(255,255,255,.40)";
    ctx.lineWidth = 1.6;

    const center = worldToScreen({ x: xMount, y: 0 }, world);
    const s = world.s;

    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR * s, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, innerR * s, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(42,110,242,.55)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const ang = (k * 2 * Math.PI) / 3 - Math.PI / 6;
      const ax = center.x + Math.cos(ang) * lugR * s;
      const ay = center.y + Math.sin(ang) * lugR * s;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("PL MOUNT PLANE (x = -52mm)", center.x - 110, center.y - 12);

    ctx.restore();
  }

  function drawRuler(world) {
    const x0 = 0;        // sensor plane
    const x1 = -120;     // show behind mount
    const y = -42;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    const a = worldToScreen({ x: x1, y }, world);
    const b = worldToScreen({ x: x0, y }, world);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    // ticks each 10mm (1cm)
    for (let mm = x1; mm <= x0 + 1e-6; mm += 10) {
      const p = worldToScreen({ x: mm, y }, world);
      const len = (mm % 50 === 0) ? 10 : 6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - len);
      ctx.stroke();

      if (mm % 50 === 0) {
        const label = `${Math.round(mm)}mm`;
        ctx.fillText(label, p.x - 16, p.y + 14);
      }
    }

    // sensor label 0
    const p0 = worldToScreen({ x: 0, y }, world);
    ctx.fillText("0mm (sensor)", p0.x - 30, p0.y + 28);

    ctx.restore();
  }

  function drawTitle(world) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const name = lens?.name || "Lens";
    ctx.fillText(name, 18, 24);
    ctx.restore();
  }

  // -------------------- render scheduler --------------------
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
      else drawPreviewViewport();
    });
  }

  // -------------------- renderAll --------------------
  function renderAll() {
    if (!canvas || !ctx) return;

    resizeCanvasToCSS();
    const r = canvas.getBoundingClientRect();
    const W = r.width, H = r.height;

    drawBackground(W, H);

    applySensorToIMS();
    clampAllApertures(lens.surfaces);

    const lensShift = Number(ui.lensFocus?.value || 0);
    const surfaces = clone(lens.surfaces);
    computeVertices(surfaces, lensShift);

    const wavePreset = ui.wavePreset?.value || "d";
    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount = Number(ui.rayCount?.value || 21);

    const rays = buildRays(surfaces, fieldAngle, rayCount);
    const traces = rays.map((ray) => traceRayForward(clone(ray), surfaces, wavePreset, { skipIMS: false }));

    const world = makeWorldTransform();

    drawAxes(world);
    drawRuler(world);
    drawPLMount(world);
    drawLens(world, surfaces);
    drawRays(world, traces);
    drawSensor(world);
    drawTitle(world);

    // metrics
    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    const T = estimateTStopApprox(efl, surfaces);

    // simple coverage/vignette heuristic: count rays reaching IMS without vignette
    const ok = traces.filter(t => !t.vignetted && !t.tir).length;
    const vig = ok / Math.max(1, traces.length);

    const { w: sW, h: sH, diag } = getSensorWH();
    const fovDeg = (Number.isFinite(efl) && efl > 0) ? (2 * Math.atan((diag * 0.5) / efl) * 180 / Math.PI) : null;

    const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");

    if (ui.efl) ui.efl.textContent = `EFL: ${fmt(efl)}mm`;
    if (ui.bfl) ui.bfl.textContent = `BFL: ${fmt(bfl)}mm`;
    if (ui.tstop) ui.tstop.textContent = `T≈ ${Number.isFinite(T) ? ("T" + fmt(T, 2)) : "—"}`;
    if (ui.vig) ui.vig.textContent = `Vig: ${(vig * 100).toFixed(0)}%`;
    if (ui.fov) ui.fov.textContent = `FOV: ${Number.isFinite(fovDeg) ? fmt(fovDeg, 1) + "°" : "—"}`;
    if (ui.cov) ui.cov.textContent = `Sensor: ${fmt(sW, 1)}×${fmt(sH, 1)}mm`;

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || "";
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || "";
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || "";
    if (ui.fovTop) ui.fovTop.textContent = ui.fov?.textContent || "";
    if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || "";

    setStatus(`rays: ${ok}/${traces.length} ok • wave: ${wavePreset} • field: ${fieldAngle.toFixed(1)}°`);

    // keep preview in sync if already rendered once
    if (preview.ready) scheduleRenderPreview();
  }

  // -------------------- interactions: pan/zoom on ray canvas --------------------
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
      if (!wantZoom) return; // keep normal scroll on page
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;

      // zoom around cursor (nice)
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const before = view.zoom;
      const after = clamp(before * factor, 0.12, 12);

      // adjust pan so point under cursor stays under cursor
      const k = after / before;
      view.panX = mx - (mx - view.panX) * k;
      view.panY = my - (my - view.panY) * k;

      view.zoom = after;
      renderAll();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
      view.panX = 0; view.panY = 0; view.zoom = 1.0;
      renderAll();
    });
  }

  // -------------------- keyboard quickies --------------------
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (ui.newLensModal) ui.newLensModal.classList.remove("open");
      if (ui.elementModal) ui.elementModal.classList.remove("open");
    }
  });

  // -------------------- buttons / lens table ops --------------------
  function addSurfaceAfterSelected() {
    clampSelected();
    const i = selectedIndex;
    const base = lens.surfaces[i] || lens.surfaces[lens.surfaces.length - 2] || lens.surfaces[0];
    const s = {
      type: String(lens.surfaces.length),
      R: 0,
      t: 5,
      ap: Math.max(2, Number(base.ap || 10)),
      glass: "AIR",
      stop: false,
    };

    lens.surfaces.splice(i + 1, 0, s);
    // keep IMS last
    const imsIdx = lens.surfaces.findIndex((x) => String(x.type).toUpperCase() === "IMS");
    if (imsIdx >= 0 && imsIdx !== lens.surfaces.length - 1) {
      const ims = lens.surfaces.splice(imsIdx, 1)[0];
      lens.surfaces.push(ims);
    }
    // fix OBJ first
    lens.surfaces[0].type = "OBJ";
    lens.surfaces[lens.surfaces.length - 1].type = "IMS";

    selectedIndex = i + 1;
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
  }

  function duplicateSelected() {
    clampSelected();
    const s = lens.surfaces[selectedIndex];
    if (!s) return;

    const copy = { ...s, stop: false, type: String(lens.surfaces.length) };
    lens.surfaces.splice(selectedIndex + 1, 0, copy);

    // keep IMS last
    const imsIdx = lens.surfaces.findIndex((x) => String(x.type).toUpperCase() === "IMS");
    if (imsIdx >= 0 && imsIdx !== lens.surfaces.length - 1) {
      const ims = lens.surfaces.splice(imsIdx, 1)[0];
      lens.surfaces.push(ims);
    }

    lens.surfaces[0].type = "OBJ";
    lens.surfaces[lens.surfaces.length - 1].type = "IMS";

    selectedIndex++;
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
  }

  function moveSelected(dir) {
    clampSelected();
    const i = selectedIndex;
    const j = i + dir;
    if (j < 1 || j >= lens.surfaces.length - 1) return; // don't move OBJ/IMS
    const tmp = lens.surfaces[i];
    lens.surfaces[i] = lens.surfaces[j];
    lens.surfaces[j] = tmp;
    selectedIndex = j;
    buildTable();
    renderAll();
    scheduleRenderPreview();
  }

  function removeSelected() {
    clampSelected();
    if (selectedIndex <= 0) return;
    if (selectedIndex >= lens.surfaces.length - 1) return;

    lens.surfaces.splice(selectedIndex, 1);
    selectedIndex = clamp(selectedIndex, 0, lens.surfaces.length - 2);

    // ensure single stop
    const stopIdx = lens.surfaces.findIndex(s => s.stop);
    if (stopIdx >= 0) lens.surfaces.forEach((s,i)=>{ if(i!==stopIdx) s.stop=false; });

    lens.surfaces[0].type = "OBJ";
    lens.surfaces[lens.surfaces.length - 1].type = "IMS";

    buildTable();
    renderAll();
    scheduleRenderPreview();
  }

  function clearLens() {
    loadLens({
      name: "New lens",
      surfaces: [
        { type: "OBJ", R: 0, t: 0, ap: 60, glass: "AIR", stop: false },
        { type: "STOP", R: 0, t: 20, ap: 8, glass: "AIR", stop: true },
        { type: "IMS", R: 0, t: 0, ap: 12.7, glass: "AIR", stop: false },
      ],
    });
  }

  // Save lens JSON
  function saveLensJSON() {
    const obj = sanitizeLens(lens);
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safeName = String(obj.name || "lens").replace(/[^\w\-]+/g, "_");
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 250);
  }

  // Load lens JSON via file input
  function bindFileLoad() {
    if (!ui.fileLoad) return;
    ui.fileLoad.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const obj = JSON.parse(txt);
        loadLens(obj);
        toast("Lens JSON loaded");
      } catch (err) {
        console.warn(err);
        if (ui.footerWarn) ui.footerWarn.textContent = "Lens JSON load failed (invalid JSON).";
      }
      ui.fileLoad.value = "";
    });
  }

  // -------------------- preview state --------------------
  const preview = {
    img: null,
    imgCanvas: document.createElement("canvas"),
    imgCtx: null,
    ready: false,
    imgData: null,

    worldCanvas: document.createElement("canvas"),
    worldCtx: null,
    worldReady: false,
    dirtyKey: "",

    view: { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 },
  };
  preview.imgCtx = preview.imgCanvas.getContext("2d");
  preview.worldCtx = preview.worldCanvas.getContext("2d");

  // overscan factor (preview)
  const OV = 1.6;

  function resizePreviewCanvasToCSS() {
    if (!previewCanvasEl || !pctx) return;
    const r = previewCanvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    previewCanvasEl.width = Math.max(2, Math.floor(r.width * dpr));
    previewCanvasEl.height = Math.max(2, Math.floor(r.height * dpr));
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    previewCanvasEl._cssW = Math.max(2, r.width);
    previewCanvasEl._cssH = Math.max(2, r.height);
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

    pctx.clearRect(0, 0, Wc, Hc);

    const hasImg = !!(preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0);
    pctx.fillStyle = hasImg ? "#000" : "#fff";
    pctx.fillRect(0, 0, Wc, Hc);

    if (!preview.worldReady) {
      pctx.fillStyle = hasImg ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.65)";
      pctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      pctx.fillText(hasImg ? "Preview: render first" : "Upload preview image", 18, 24);
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
      preview.imgData = null;
      preview.ready = false;
      if (ui.footerWarn) ui.footerWarn.textContent =
        "Preview image blocked by CORS (tainted canvas). Gebruik upload of host op dezelfde origin (GitHub Pages).";
    }

    preview.worldReady = false;
    scheduleRenderPreview();
  }

  function loadPreviewFromUrl(url) {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => setPreviewImage(im);
    im.onerror = () => {
      console.warn("Default preview failed to load:", url);
      if (ui.footerWarn) ui.footerWarn.textContent = `Default preview image not found: ${url}`;
    };
    im.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  }

  // local upload for preview
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

  // -------------------- preview render (radial LUT) --------------------
  function renderPreview() {
    if (!pctx || !previewCanvasEl) return;
    if (!preview.ready) { drawPreviewViewport(); return; }

    const lensShift = Number(ui.lensFocus?.value || 0);

    applySensorToIMS();
    clampAllApertures(lens.surfaces);

    const surfacesTrace = clone(lens.surfaces);
    computeVertices(surfacesTrace, lensShift);

    const wavePreset = ui.wavePreset?.value || "d";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    const sensorX = 0.0;

    const { w: sensorW, h: sensorH } = getSensorWH();

    const stopIdx = findStopSurfaceIndex(surfacesTrace);
    const stopSurf = stopIdx >= 0 ? surfacesTrace[stopIdx] : surfacesTrace[0];
    const xStop = stopSurf.vx;

    const objDist = Math.max(1, Number(ui.prevObjDist?.value || 2000));
    const xObjPlane = (surfacesTrace[0]?.vx ?? 0) - objDist;

    const objH = Math.max(1, Number(ui.prevObjH?.value || 200));
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

    const hasImg = !!(preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0);
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
      const c0 = c00.map((v0, i) => lerp(v0, c10[i], tx));
      const c1 = c01.map((v0, i) => lerp(v0, c11[i], tx));
      return c0.map((v0, i) => lerp(v0, c1[i], ty));
    }

    // object view window uses sensor aspect (contain)
    const sensorAsp = sensorW / sensorH;
    const imgAsp = hasImg ? (imgW / imgH) : sensorAsp;

    const halfViewH = halfObjH;
    const halfViewW = halfObjH * sensorAsp;
    const viewW = halfViewW * 2;
    const viewH = halfViewH * 2;

    let dispW, dispH;
    if (imgAsp >= sensorAsp) {
      dispW = viewW;
      dispH = viewW / imgAsp;
    } else {
      dispH = viewH;
      dispW = viewH * imgAsp;
    }

    function objectMmToUVContain(xmm, ymm) {
      if (Math.abs(xmm) > dispW * 0.5 || Math.abs(ymm) > dispH * 0.5) return null;
      const u = 0.5 + (xmm / dispW);
      const v = 0.5 - (ymm / dispH);
      return { u, v };
    }

    // -------- LUT: radial mapping + mech trans + cos^4 --------
    const halfWv = sensorWv * 0.5;
    const halfHv = sensorHv * 0.5;
    const rMax = Math.hypot(halfWv, halfHv);

    const startX = sensorX + 0.001;

    const stopAp = Math.max(0.25, Number(stopSurf.ap || 6));
    const STOP_SAMPLES = 17;
    const yStopSamples = new Float32Array(STOP_SAMPLES);
    for (let i = 0; i < STOP_SAMPLES; i++) {
      const a = (i / (STOP_SAMPLES - 1)) * 2 - 1;
      yStopSamples[i] = a * stopAp;
    }

    const LUT_N = 768;
    const rObjLUT = new Float32Array(LUT_N);
    const transLUT = new Float32Array(LUT_N);
    const cos4LUT = new Float32Array(LUT_N);

    for (let k = 0; k < LUT_N; k++) {
      const r = (k / (LUT_N - 1)) * rMax;
      const y = Math.min(r, halfHv);

      let rObjVals = [];
      let cos4Sum = 0;

      // chief ray (stop center)
      {
        const dirChief = normalize({ x: xStop - startX, y: 0 - y });
        const trChief = traceRayReverse({ p: { x: startX, y }, d: dirChief }, surfacesTrace, wavePreset);
        if (!trChief.vignetted && !trChief.tir) {
          const hitObj = intersectPlaneX(trChief.endRay, xObjPlane);
          if (hitObj) rObjVals.push(Math.abs(hitObj.y));
          const cos = clamp01(Math.abs(dirChief.x));
          cos4Sum = cos ** 4;
        } else {
          cos4Sum = 0;
        }
      }

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

      rObjLUT[k] = rObjVals.length ? median(rObjVals) : 0;
      transLUT[k] = ok / yStopSamples.length;
      cos4LUT[k] = cos4Sum;
    }

    function lookupRadialByR(rSensorMm) {
      const rClamped = clamp(rSensorMm, 0, rMax);
      const x = (rClamped / rMax) * (LUT_N - 1);
      const i0 = Math.floor(x);
      const i1 = Math.min(LUT_N - 1, i0 + 1);
      const u = x - i0;

      const rObj = rObjLUT[i0] * (1 - u) + rObjLUT[i1] * u;
      const trans = transLUT[i0] * (1 - u) + transLUT[i1] * u;
      const cos4 = cos4LUT[i0] * (1 - u) + cos4LUT[i1] * u;

      return { rObj, trans, cos4 };
    }

    // render world canvas
    preview.worldCanvas.width = W;
    preview.worldCanvas.height = H;

    const wctx = preview.worldCtx;
    const out = wctx.createImageData(W, H);
    const outD = out.data;

    for (let py = 0; py < H; py++) {
      const sy = (0.5 - (py + 0.5) / H) * (sensorH * OV);
      for (let px = 0; px < W; px++) {
        const sx = ((px + 0.5) / W - 0.5) * (sensorW * OV);
        const idx = (py * W + px) * 4;

        const rSensorMm = Math.hypot(sx, sy);
        const { rObj, trans, cos4 } = lookupRadialByR(rSensorMm);

        const mech = clamp01(trans);
        const g = mech * clamp01(cos4);

        if (g < 1e-4) {
          outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
          continue;
        }

        const kScaleR = (rSensorMm > 1e-9) ? (rObj / rSensorMm) : 0;
        const ox = sx * kScaleR;
        const oy = sy * kScaleR;

        const uv = objectMmToUVContain(ox, oy);
        if (!uv) {
          outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
          continue;
        }

        const c = sample(uv.u, uv.v);
        outD[idx] = clamp(c[0] * g, 0, 255);
        outD[idx + 1] = clamp(c[1] * g, 0, 255);
        outD[idx + 2] = clamp(c[2] * g, 0, 255);
        outD[idx + 3] = 255;
      }
    }

    wctx.putImageData(out, 0, 0);
    preview.worldReady = true;
    drawPreviewViewport();
  }

  // -------------------- preview interactions (pan/zoom) --------------------
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
      preview.view.zoom = clamp(preview.view.zoom * factor, 0.12, 20);
      drawPreviewViewport();
    }, { passive: false });

    previewCanvasEl.addEventListener("dblclick", () => {
      preview.view.panX = 0;
      preview.view.panY = 0;
      preview.view.zoom = 1.0;
      drawPreviewViewport();
    });
  }

  // -------------------- load default lens from url --------------------
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

  // -------------------- hook UI controls --------------------
  function bindControls() {
    on("#sensorPreset", "change", (e) => applyPreset(e.target.value));
    on("#sensorW", "change", () => { applySensorToIMS(); renderAll(); scheduleRenderPreview(); });
    on("#sensorH", "change", () => { applySensorToIMS(); renderAll(); scheduleRenderPreview(); });

    on("#fieldAngle", "input", scheduleRenderAll);
    on("#rayCount", "input", scheduleRenderAll);
    on("#wavePreset", "change", () => { renderAll(); scheduleRenderPreview(); });

    on("#lensFocus", "input", () => { renderAll(); scheduleRenderPreview(); });
    on("#renderScale", "input", scheduleRenderAll);

    if (ui.btnRenderPreview) ui.btnRenderPreview.addEventListener("click", () => renderPreview());

    if (ui.btnNew) ui.btnNew.addEventListener("click", clearLens);
    if (ui.btnLoadOmit) ui.btnLoadOmit.addEventListener("click", () => loadLens(omit50ConceptV1()));
    if (ui.btnLoadDemo) ui.btnLoadDemo.addEventListener("click", () => loadLens(demoLensSimple()));

    if (ui.btnAdd) ui.btnAdd.addEventListener("click", addSurfaceAfterSelected);
    if (ui.btnDuplicate) ui.btnDuplicate.addEventListener("click", duplicateSelected);
    if (ui.btnMoveUp) ui.btnMoveUp.addEventListener("click", () => moveSelected(-1));
    if (ui.btnMoveDown) ui.btnMoveDown.addEventListener("click", () => moveSelected(+1));
    if (ui.btnRemove) ui.btnRemove.addEventListener("click", removeSelected);

    if (ui.btnSave) ui.btnSave.addEventListener("click", saveLensJSON);

    bindFileLoad();

    // fullscreen helpers (optional)
    if (ui.btnRaysFS && ui.raysPane) {
      ui.btnRaysFS.addEventListener("click", async () => {
        try {
          if (!document.fullscreenElement) await ui.raysPane.requestFullscreen();
          else await document.exitFullscreen();
        } catch (_) {}
      });
    }
    if (ui.btnPreviewFS && ui.previewPane) {
      ui.btnPreviewFS.addEventListener("click", async () => {
        try {
          if (!document.fullscreenElement) await ui.previewPane.requestFullscreen();
          else await document.exitFullscreen();
        } catch (_) {}
      });
    }
  }

  // -------------------- init --------------------
  async function init() {
    populateSensorPresetsSelect();
    if (ui.sensorPreset) ui.sensorPreset.value = "Fuji GFX (MF)";
    applyPreset("Fuji GFX (MF)");

    // default preview res if exists
    if (ui.prevRes && !ui.prevRes.value) ui.prevRes.value = "1920";

    // load default lens + chart
    await loadDefaultLensFromUrl(DEFAULT_LENS_URL);
    loadPreviewFromUrl(DEFAULT_PREVIEW_URL);

    buildTable();
    bindControls();
    bindViewControls();
    bindPreviewViewControls();

    renderAll();
    drawPreviewViewport();
  }

  init();
})();
