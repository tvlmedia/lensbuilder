/* Meridional Raytracer (2D) — TVL Lens Builder (RAYS ONLY)
   - Rays canvas + surface editor + merit score + simple optimizer.
   - No pixel preview/DOF/CA pipeline (keeps LUT-only analysis helpers).
*/

(() => {
  // -------------------- kill scroll restoration --------------------
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch(_) {}

  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x,a,b)=> x<a?a:(x>b?b:x);
  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }

  // -------------------- canvas (RAYS) --------------------
  const canvas = $("#canvas");
  const ctx = canvas?.getContext("2d");

  // -------------------- UI --------------------
  const ui = {
    toolbar: $(".toolbar"),
    tbody: $("#surfTbody"),
    status: $("#statusText"),

    efl: $("#badgeEfl"),
    bfl: $("#badgeBfl"),
    tstop: $("#badgeT"),
    vig: $("#badgeVig"),
    softIC: $("#badgeSoftIC"),
    dist: $("#badgeDist"),
    sharp: $("#badgeSharp"),
    od: $("#badgeOD"),
    realism: $("#badgeRealism"),
    fov: $("#badgeFov"),
    merit: $("#badgeMerit"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    softICTop: $("#badgeSoftICTop"),
    fovTop: $("#badgeFovTop"),
    distTop: $("#badgeDistTop"),
    sharpTop: $("#badgeSharpTop"),
    odTop: $("#badgeODTop"),
    realismTop: $("#badgeRealismTop"),
    meritTop: $("#badgeMeritTop"),

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

    btnRaysFS: $("#btnRaysFS"),
    raysPane: $("#raysPane"),

    toastHost: $("#toastHost"),

    // Optimizer
    optTargetFL: $("#optTargetFL"),
    optTargetT: $("#optTargetT"),
    optTargetIC: $("#optTargetIC"),
    optIters: $("#optIters"),
    distOptIters: $("#distOptIters"),
    optPop: $("#optPop"),
    optAutoApply: $("#optAutoApply"),
    optLog: $("#optLog"),

    btnOptStart: $("#btnOptStart"),
    btnOptDist: $("#btnOptDist"),
    btnOptDistApply: $("#btnOptDistApply"),
    btnOptSharp: $("#btnOptSharp"),
    btnOptSharpApply: $("#btnOptSharpApply"),
    btnOptStop: $("#btnOptStop"),
    btnOptApply: $("#btnOptApply"),
    btnOptBench: $("#btnOptBench"),
    btnBuildScratch: $("#btnBuildScratch"),

    // Cockpit panel
    cockpitProgress: $("#cockpitProgress"),
    cockpitProgressText: $("#cockpitProgressText"),
    cockpitCompareInfo: $("#cockpitCompareInfo"),

    cockpitValEfl: $("#cockpitValEfl"),
    cockpitDeltaEfl: $("#cockpitDeltaEfl"),
    cockpitValBfl: $("#cockpitValBfl"),
    cockpitDeltaBfl: $("#cockpitDeltaBfl"),
    cockpitValT: $("#cockpitValT"),
    cockpitDeltaT: $("#cockpitDeltaT"),
    cockpitValCov: $("#cockpitValCov"),
    cockpitDeltaCov: $("#cockpitDeltaCov"),
    cockpitValIc: $("#cockpitValIc"),
    cockpitDeltaIc: $("#cockpitDeltaIc"),
    cockpitValDist: $("#cockpitValDist"),
    cockpitDeltaDist: $("#cockpitDeltaDist"),
    cockpitValSharp: $("#cockpitValSharp"),
    cockpitDeltaSharp: $("#cockpitDeltaSharp"),
    cockpitValFeas: $("#cockpitValFeas"),
    cockpitDeltaFeas: $("#cockpitDeltaFeas"),

    btnBaselineLens: $("#btnBaselineLens"),
    btnOptEfl: $("#btnOptEfl"),
    btnOptTLocal: $("#btnOptTLocal"),
    btnOptICLocal: $("#btnOptICLocal"),
    btnOptDistLocal: $("#btnOptDistLocal"),
    btnOptSharpLocal: $("#btnOptSharpLocal"),
    btnOptAllMacro: $("#btnOptAllMacro"),

    btnSnapshotSave: $("#btnSnapshotSave"),
    btnSnapshotUndo: $("#btnSnapshotUndo"),
    btnSnapshotRedo: $("#btnSnapshotRedo"),
    btnSnapshotCompare: $("#btnSnapshotCompare"),

    cockpitIters: $("#cockpitIters"),
    cockpitStep: $("#cockpitStep"),
    cockpitStepOut: $("#cockpitStepOut"),
    cockpitSurfaceMode: $("#cockpitSurfaceMode"),
    cockpitSurfaceStart: $("#cockpitSurfaceStart"),
    cockpitSurfaceEnd: $("#cockpitSurfaceEnd"),
    cockpitStrictness: $("#cockpitStrictness"),
    cockpitMacroPasses: $("#cockpitMacroPasses"),
    cockpitAnneal: $("#cockpitAnneal"),

    newLensModal: $("#newLensModal"),
    elementModal: $("#elementModal"),
  };

  const AUTOSAVE_KEY = "tvl_lens_builder_autosave_v1";

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
    "IMAX 15/70 (70mm)": { w: 70.41, h: 56.62 },
    "65mm Analoog (5-perf)": { w: 52.15, h: 23.07 },
    "ARRI ALEXA 265": { w: 54.12, h: 25.58 },
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
    const w = num(ui.sensorW?.value, 36.7);
    const h = num(ui.sensorH?.value, 25.54);
    return { w, h, halfH: Math.max(0.1, h * 0.5), halfW: Math.max(0.1, w * 0.5) };
  }

  // -------------------- glass db --------------------
  const GLASS_DB = {
    AIR: { nd: 1.0, Vd: 999.0 },
    "N-BK7HT": { nd: 1.5168, Vd: 64.17 },
    "N-BK10": { nd: 1.49782, Vd: 66.95 },
    "N-K5": { nd: 1.52249, Vd: 59.48 },
    "N-KF9": { nd: 1.52346, Vd: 51.54 },
    "N-PK52A": { nd: 1.497, Vd: 81.61 },
    "N-ZK7A": { nd: 1.508054, Vd: 61.04 },
    "N-BAK1": { nd: 1.5725, Vd: 57.55 },
    "N-BAK2": { nd: 1.53996, Vd: 59.71 },
    "N-BAK4": { nd: 1.56883, Vd: 55.98 },
    "N-BALF4": { nd: 1.57956, Vd: 53.87 },
    "N-BALF5": { nd: 1.54739, Vd: 53.63 },
    "N-BAF4": { nd: 1.60568, Vd: 43.72 },
    "N-BAF10": { nd: 1.67003, Vd: 47.11 },
    "N-BAF51": { nd: 1.65224, Vd: 44.96 },
    "N-BAF52": { nd: 1.60863, Vd: 46.6 },
    "N-BASF2": { nd: 1.66446, Vd: 36.0 },
    "N-SK2": { nd: 1.60738, Vd: 56.65 },
    "N-SK4": { nd: 1.61272, Vd: 58.63 },
    "N-SK5": { nd: 1.58913, Vd: 61.27 },
    "N-SK11": { nd: 1.56384, Vd: 60.8 },
    "N-SK14": { nd: 1.60311, Vd: 60.6 },
    "N-SK16": { nd: 1.62041, Vd: 60.32 },
    "N-SSK2": { nd: 1.62229, Vd: 53.27 },
    "N-SSK5": { nd: 1.65844, Vd: 50.88 },
    "N-SSK8": { nd: 1.61773, Vd: 49.83 },
    "N-PSK3": { nd: 1.55232, Vd: 63.46 },
    "N-PSK53A": { nd: 1.618, Vd: 63.39 },
    "N-KZFS2": { nd: 1.55836, Vd: 54.01 },
    "N-KZFS4": { nd: 1.61336, Vd: 44.49 },
    "N-KZFS5": { nd: 1.65412, Vd: 39.7 },
    "N-KZFS8": { nd: 1.72047, Vd: 34.7 },
    "N-LAK9": { nd: 1.691, Vd: 54.71 },
    "N-LAK10": { nd: 1.72003, Vd: 50.62 },
    "N-LAK22": { nd: 1.65113, Vd: 55.89 },
    "N-LAK28": { nd: 1.74429, Vd: 50.77 },
    "N-LAK34": { nd: 1.72916, Vd: 54.5 },
    "N-LAF2": { nd: 1.74397, Vd: 44.85 },
    "N-LAF7": { nd: 1.7495, Vd: 34.82 },
    "N-LAF21": { nd: 1.788, Vd: 47.49 },
    "N-LAF34": { nd: 1.7725, Vd: 49.62 },
    "N-LASF9": { nd: 1.85025, Vd: 32.17 },
    "N-LASF40": { nd: 1.83404, Vd: 37.3 },
    "N-LASF41": { nd: 1.83501, Vd: 43.13 },
    "N-LASF43": { nd: 1.8061, Vd: 40.61 },
    "N-LASF44": { nd: 1.8042, Vd: 46.5 },
    "N-LASF45": { nd: 1.80107, Vd: 34.97 },
    "N-F2": { nd: 1.62005, Vd: 36.43 },
    "N-FK5": { nd: 1.48749, Vd: 70.41 },
    "N-FK58": { nd: 1.456, Vd: 90.9 },
    "N-SF1": { nd: 1.71736, Vd: 29.62 },
    "N-SF2": { nd: 1.64769, Vd: 33.82 },
    "N-SF4": { nd: 1.75513, Vd: 27.38 },
    "N-SF5": { nd: 1.67271, Vd: 32.25 },
    "N-SF6": { nd: 1.80518, Vd: 25.36 },
    "N-SF8": { nd: 1.68894, Vd: 31.31 },
    "N-SF10": { nd: 1.72828, Vd: 28.53 },
    "N-SF11": { nd: 1.78472, Vd: 25.68 },
    "N-SF15": { nd: 1.69892, Vd: 30.2 },
    "N-SF57": { nd: 1.84666, Vd: 23.78 },
    "N-SF66": { nd: 1.92286, Vd: 20.88 },
  };

  const GLASS_LIST = Object.keys(GLASS_DB).filter(k => k !== "AIR");

  // Wavelengths (nm)
  const WL = { C: 656.2725, d: 587.5618, F: 486.1327, g: 435.8343 };

  function fitCauchyFrom3(nC, nd, nF){
    const lC = WL.C / 1000, ld = WL.d / 1000, lF = WL.F / 1000;
    const M = [
      [1, 1/(lC*lC), 1/(lC*lC*lC*lC)],
      [1, 1/(ld*ld), 1/(ld*ld*ld*ld)],
      [1, 1/(lF*lF), 1/(lF*lF*lF*lF)],
    ];
    const y = [nC, nd, nF];

    const A = M.map(r=>r.slice());
    const b = y.slice();
    for (let i=0;i<3;i++){
      let piv=i;
      for (let r=i+1;r<3;r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv=r;
      if (piv!==i){ [A[i],A[piv]]=[A[piv],A[i]]; [b[i],b[piv]]=[b[piv],b[i]]; }

      const div = A[i][i] || 1e-12;
      for (let j=i;j<3;j++) A[i][j] /= div;
      b[i] /= div;

      for (let r=0;r<3;r++){
        if (r===i) continue;
        const f = A[r][i];
        for (let j=i;j<3;j++) A[r][j] -= f*A[i][j];
        b[r] -= f*b[i];
      }
    }
    return { A:b[0], B:b[1], C:b[2] };
  }

  function cauchyN_um(cfit, lambda_um){
    const L2 = lambda_um*lambda_um;
    return cfit.A + cfit.B/L2 + cfit.C/(L2*L2);
  }

  const GLASS_ALIASES = {
    BK7: "N-BK7HT",
    F2: "N-F2",
    LASF35: "N-LASF43",
    LASFN31: "N-LASF43",
    LF5: "N-SF5",
    "S-LAM3": "N-LAK9",
    "S-BAH11": "N-BAK4",
  };

  function resolveGlassName(name) {
    if (!name) return "AIR";
    if (GLASS_DB[name]) return name;
    const alias = GLASS_ALIASES[name];
    if (alias && GLASS_DB[alias]) return alias;
    return "AIR";
  }

  const _cauchyCache = new Map();
  const _glassWarned = new Set();
  function warnMissingGlass(name) {
    if (_glassWarned.has(name)) return;
    _glassWarned.add(name);
    console.warn(`[GLASS_DB] Unknown glass "${name}" (resolved to AIR). Add alias or DB entry.`);
  }

  function wavePresetToLambdaNm(w){
    const ww = String(w || "d");
    if (ww === "c" || ww === "C") return WL.C;
    if (ww === "F") return WL.F;
    if (ww === "g") return WL.g;
    return WL.d;
  }

  function glassN(glassName, wavePresetOrNm = "d") {
    const lambdaNm =
      (typeof wavePresetOrNm === "number" && Number.isFinite(wavePresetOrNm))
        ? wavePresetOrNm
        : wavePresetToLambdaNm(wavePresetOrNm);

    const key = resolveGlassName(glassName);
    if (key === "AIR" && glassName !== "AIR") warnMissingGlass(glassName);
    if (key === "AIR") return 1.0;

    const g = GLASS_DB[key];
    const nd = Number(g.nd || 1.5168);
    const Vd = Math.max(10, Number(g.Vd || 50));
    const dN = (nd - 1) / Vd; // nF - nC (approx)
    const nF = nd + 0.6 * dN;
    const nC = nd - 0.4 * dN;

    const cacheKey = key + "::cauchy";
    let fit = _cauchyCache.get(cacheKey);
    if (!fit){
      fit = fitCauchyFrom3(nC, nd, nF);
      _cauchyCache.set(cacheKey, fit);
    }
    return cauchyN_um(fit, lambdaNm / 1000);
  }

  // -------------------- demo lenses --------------------
  function demoLensSimple() {
    return {
      name: "Demo (simple)",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 22.0, glass: "AIR", stop: false },
        { type: "1", R: 42.0, t: 10.0, ap: 22.0, glass: "N-LASF43", stop: false },
        { type: "2", R: -140.0, t: 10.0, ap: 21.0, glass: "AIR", stop: false },
        { type: "3", R: -30.0, t: 10.0, ap: 19.0, glass: "N-LASF43", stop: false },
        { type: "STOP", R: 0.0, t: 10.0, ap: 14.0, glass: "AIR", stop: true },
        { type: "5", R: 12.42, t: 10.0, ap: 8.5, glass: "AIR", stop: false },
        { type: "AST", R: 0.0, t: 6.4, ap: 8.5, glass: "AIR", stop: false },
        { type: "7", R: -18.93, t: 10.0, ap: 11.0, glass: "N-SF5", stop: false },
        { type: "8", R: 59.6, t: 10.0, ap: 13.0, glass: "N-LASF43", stop: false },
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
        { type: "1", R: 37.4501, t: 4.49102, ap: 16.46707, glass: "N-LAK9", stop: false },
        { type: "2", R: 135.07984, t: 0.0499, ap: 16.46707, glass: "AIR", stop: false },
        { type: "3", R: 19.59581, t: 8.23852, ap: 13.72255, glass: "N-BAK4", stop: false },
        { type: "4", R: 0.0, t: 0.998, ap: 12.22555, glass: "N-SF5", stop: false },
        { type: "5", R: 12.7994, t: 5.48403, ap: 9.73054, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 6.48703, ap: 9.28144, glass: "AIR", stop: true },
        { type: "7", R: -15.90319, t: 3.50798, ap: 9.23154, glass: "N-SF5", stop: false },
        { type: "8", R: 0.0, t: 4.48104, ap: 10.47904, glass: "N-LAK9", stop: false },
        { type: "9", R: -21.71158, t: 0.0499, ap: 10.47904, glass: "AIR", stop: false },
        { type: "10", R: 110.3493, t: 3.98204, ap: 11.47705, glass: "N-BAK4", stop: false },
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

    if (safe.surfaces.length >= 1) {
      safe.surfaces[0].type = "OBJ";
      safe.surfaces[0].t = 0.0;
    }
    if (safe.surfaces.length >= 1) safe.surfaces[safe.surfaces.length - 1].type = "IMS";

    // resolve glass names
    safe.surfaces.forEach((s) => { s.glass = resolveGlassName(s.glass); });

    return safe;
  }

  let lens = sanitizeLens(omit50ConceptV1());
  let selectedIndex = 0;

  function applySensorToIMS() {
    const { halfH } = getSensorWH();
    const ims = lens?.surfaces?.[lens.surfaces.length - 1];
    if (ims && String(ims.type).toUpperCase() === "IMS") {
      ims.ap = halfH;
      const i = lens.surfaces.length - 1;
      const apInput = ui.tbody?.querySelector(`input.cellInput[data-k="ap"][data-i="${i}"]`);
      if (apInput) apInput.value = Number(ims.ap || 0).toFixed(2);
    }
  }

  function applyPreset(name) {
    const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
    if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
    if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
    applySensorToIMS();
  }

  function loadLens(obj) {
    lens = sanitizeLens(obj);
    selectedIndex = 0;
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
    scheduleAutosave();
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

      const isOBJ = String(s.type || "").toUpperCase() === "OBJ";
      const isIMS = String(s.type || "").toUpperCase() === "IMS";

      tr.innerHTML = `
        <td style="width:34px; font-family:var(--mono)">${idx}</td>
        <td style="width:72px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
        <td style="width:92px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}"></td>
        <td style="width:92px">
          <input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01"
            value="${isOBJ ? 0 : s.t}" ${isOBJ || isIMS ? "disabled" : ""}>
        </td>
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

    const t0 = String(s.type || "").toUpperCase();
    if (t0 === "OBJ" && k === "t") {
      s.t = 0.0;
      el.value = "0";
      scheduleRenderAll();
      return;
    }

    if (k === "type") s.type = el.value;
    else if (k === "R" || k === "t" || k === "ap") s[k] = num(el.value, s[k] ?? 0);

    applySensorToIMS();
    scheduleRenderAll();
    scheduleAutosave();
  }

  function onCellCommit(e) {
    const el = e.target;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (!Number.isFinite(i) || !k) return;

    selectedIndex = i;
    const s = lens.surfaces[i];
    if (!s) return;

    const t0 = String(s.type || "").toUpperCase();
    if (t0 === "OBJ" && k === "t") {
      s.t = 0.0;
      el.value = "0";
    }

    if (k === "stop") {
      s.stop = !!el.checked;
      enforceSingleStop(i);
    } else if (k === "glass") {
      s.glass = resolveGlassName(String(el.value || "AIR"));
    } else if (k === "type") {
      s.type = String(el.value || "");
    } else if (k === "R" || k === "t" || k === "ap") {
      s[k] = num(el.value, s[k] ?? 0);
    }

    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleAutosave();
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
    const R = Number(surf.R || 0);
    const ap = Math.max(0, Number(surf.ap || 0));

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

  function computeVertices(surfaces, lensShift = 0, sensorX = 0) {
    let x = 0;
    for (let i = 0; i < surfaces.length; i++) {
      surfaces[i].vx = x;
      x += Number(surfaces[i].t || 0);
    }

    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx >= 0) {
      const shiftAll = (Number(sensorX) || 0) - (surfaces[imsIdx].vx || 0);
      for (let i = 0; i < surfaces.length; i++) surfaces[i].vx += shiftAll;
    }

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
  const AP_MAX_PLANE = 45.0;
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

  function surfaceXatY(s, y) {
    const vx = s.vx;
    const R = Number(s.R || 0);
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

  const PHYS_CFG = {
    minAirGap: 0.12,
    prefAirGap: 0.60,
    minGlassCT: 0.35,
    prefGlassCT: 1.20,
    minRadius: 8.0,
    minAperture: 1.2,
    maxAperture: 40.0,
    minThickness: 0.05,
    maxThickness: 55.0,
    minStopToApertureRatio: 0.28,
    maxNegOverlap: 0.05,
    gapWeightAir: 1200.0,
    gapWeightGlass: 2600.0,
    overlapWeight: 3200.0,
    tinyApWeight: 120.0,
    tinyRadiusWeight: 80.0,
    pinchWeight: 220.0,
    stopOversizeWeight: 240.0,
    stopTooTinyWeight: 200.0,
    minAirGapsPreferred: 3,
    tooFewAirGapsWeight: 260.0,
    shortAirGapWeight: 190.0,
    thinGlassWeight: 150.0,
    minStopSideAirGap: 0.35,
    stopAirSideWeight: 1200.0,
    stopAirGapWeight: 900.0,
    planeRefractiveWeight: 520.0,
    planeNearStopExtraWeight: 880.0,
  };

  const REALISM_CFG = {
    // OD = clear semi-diameter + mechanical margin.
    mechMarginSmall: 3.0,
    mechMarginLarge: 6.0,
    mechMarginSmallApMm: 10.0,
    mechMarginLargeApMm: 32.0,

    // Family envelopes (soft preferred, hard invalid).
    presets: {
      cinePrimeFF: {
        key: "cinePrimeFF",
        label: "Cine Prime FF",
        preferredFrontODMin: 95.0,
        preferredFrontODMax: 125.0,
        hardFrontOD: 140.0,
        preferredMaxOD: 130.0,
        hardMaxOD: 140.0,
      },
      cinePrimeLFMF: {
        key: "cinePrimeLFMF",
        label: "Cine Prime LF/MF",
        preferredFrontODMin: 110.0,
        preferredFrontODMax: 140.0,
        hardFrontOD: 160.0,
        preferredMaxOD: 148.0,
        hardMaxOD: 160.0,
      },
    },
    largeIcThresholdMm: 44.0,
    largeIcFullReliefMm: 65.0,
    largeSensorPenaltyReliefMax: 0.35,
    largeSensorStageRelief: 0.86,

    // OD / package penalties.
    rearCheckDepthMm: 14.0,
    rearMountClearanceMm: 0.35,
    odFrontHighWeight: 2.2,
    odFrontLowWeight: 0.24,
    odMaxWeight: 1.9,
    odRearMountWeight: 3.8,

    // Thickness / spacing realism.
    glassCtStrongStartMm: 18.0,
    glassCtNearInvalidMm: 25.0,
    glassCtStrongWeight: 3.0,
    glassCtNearInvalidWeight: 13.0,
    airGapRareStartMm: 10.0,
    airGapVeryRareMm: 12.0,
    airGapRareWeight: 1.5,
    airGapVeryRareWeight: 4.5,

    // Radius realism.
    preferredRadiusMm: 13.5,
    radiusSmallWeight: 2.8,
    radiusDifficultyWeight: 8.8,
    radiusDifficultyPower: 2.4,
    preferredApOverR: 0.36,
    nearPlaneRadiusMm: 1.2,
    nearPlaneRadiusWeight: 18.0,
    hugeRadiusMm: 1200.0,
    hugeRadiusWeight: 0.45,
    hugeRadiusPowerTol: 8e-5,

    // Edge/wedge robustness.
    edgeRobustMarginMm: 0.22,
    edgeRobustWeight: 14.0,

    // Grouping / architecture.
    packagingIsolatedWeight: 9.5,
    packagingManyGroupsWeight: 1.2,
    preferredGroupCount: 4,
    stopTooCloseMm: 0.30,
    stopTooCloseWeight: 8.0,

    // Stage weights (FL acquire -> T tune -> IC growth -> polish).
    stageWeights: [0.08, 0.24, 0.40, 1.20],
  };

  const MOUNT_TRACE_CFG = {
    enabled: true,
    throatR: 27.0,      // PL throat radius (Ø54)
    lensLip: 3.0,       // lens-side extension before flange plane
    camDepth: 14.0,     // camera-side depth after flange plane
    clearanceMm: 0.08,  // tiny safety clearance to avoid optimistic edge cases
  };

  function minGapBetweenSurfaces(sFront, sBack, yMax, samples = 11) {
    const n = Math.max(3, samples | 0);
    const ym = Math.max(0.001, Number(yMax || 0));
    let minGap = Infinity;

    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : (k / (n - 1));
      const y = a * ym;
      const xf = surfaceXatY(sFront, y);
      const xb = surfaceXatY(sBack, y);
      if (!Number.isFinite(xf) || !Number.isFinite(xb)) return -Infinity;
      minGap = Math.min(minGap, xb - xf);
    }
    return minGap;
  }

  function evaluatePhysicalConstraints(surfaces) {
    let penalty = 0;
    let hardFail = false;
    let worstOverlap = 0;
    let worstPinch = 0;
    let airGapCount = 0;

    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopAp = stopIdx >= 0 ? Math.max(0.1, Number(surfaces[stopIdx]?.ap || 0)) : null;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const ap = Math.max(0, Number(s.ap || 0));
      const R = Math.abs(Number(s.R || 0));
      const th = Math.max(0, Number(s.t || 0));
      const nBefore = i > 0 ? String(resolveGlassName(surfaces[i - 1]?.glass || "AIR")).toUpperCase() : "AIR";
      const nAfter = String(resolveGlassName(s.glass || "AIR")).toUpperCase();
      const isRefractive = nBefore !== nAfter;

      if (ap < PHYS_CFG.minAperture) {
        const d = PHYS_CFG.minAperture - ap;
        penalty += PHYS_CFG.tinyApWeight * d * d;
      }
      if (ap > PHYS_CFG.maxAperture) {
        const d = ap - PHYS_CFG.maxAperture;
        penalty += 60.0 * d * d;
      }
      if (R > 1e-9 && R < PHYS_CFG.minRadius) {
        const d = PHYS_CFG.minRadius - R;
        penalty += PHYS_CFG.tinyRadiusWeight * d * d;
      }
      if (isRefractive && R <= 1e-9) {
        penalty += PHYS_CFG.planeRefractiveWeight;
        if (stopIdx >= 0 && Math.abs(i - stopIdx) <= 2) {
          penalty += PHYS_CFG.planeNearStopExtraWeight;
        }
      }
      if (th < PHYS_CFG.minThickness) {
        const d = PHYS_CFG.minThickness - th;
        penalty += 400.0 * d * d;
      }
      if (th > PHYS_CFG.maxThickness) {
        const d = th - PHYS_CFG.maxThickness;
        penalty += 5.0 * d * d;
      }

      if (Number.isFinite(stopAp) && ap < stopAp * PHYS_CFG.minStopToApertureRatio) {
        const d = stopAp * PHYS_CFG.minStopToApertureRatio - ap;
        penalty += PHYS_CFG.tinyApWeight * d * d;
      }
    }

    for (let i = 1; i < surfaces.length - 1; i++) {
      const prev = surfaces[i - 1];
      const cur = surfaces[i];
      const next = surfaces[i + 1];
      const tp = String(prev?.type || "").toUpperCase();
      const tc = String(cur?.type || "").toUpperCase();
      const tn = String(next?.type || "").toUpperCase();
      if (tp === "OBJ" || tc === "OBJ" || tn === "OBJ") continue;
      if (tp === "IMS" || tc === "IMS" || tn === "IMS") continue;
      const apPrev = Number(prev.ap || 0);
      const apCur = Number(cur.ap || 0);
      const apNext = Number(next.ap || 0);
      const ref = Math.min(apPrev, apNext);
      if (ref > 0.5 && apCur < 0.5 * ref) {
        const d = 0.5 * ref - apCur;
        worstPinch = Math.max(worstPinch, d);
        penalty += PHYS_CFG.pinchWeight * d * d;
      }
    }

    for (let i = 0; i < surfaces.length - 1; i++) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];
      const tA = String(sA?.type || "").toUpperCase();
      const tB = String(sB?.type || "").toUpperCase();
      if (tA === "OBJ" || tA === "IMS" || tB === "OBJ" || tB === "IMS") continue;

      const apShared = Math.max(0.1, Math.min(Number(sA.ap || 0), Number(sB.ap || 0), maxApForSurface(sA), maxApForSurface(sB)));
      const minGap = minGapBetweenSurfaces(sA, sB, apShared, 13);
      const mediumAfterA = String(sA.glass || "AIR").toUpperCase();
      if (mediumAfterA === "AIR") airGapCount++;
      const required = mediumAfterA === "AIR" ? PHYS_CFG.minAirGap : PHYS_CFG.minGlassCT;

      if (!Number.isFinite(minGap)) {
        penalty += 100_000;
        hardFail = true;
        continue;
      }

      if (minGap < required) {
        const d = required - minGap;
        const w = (mediumAfterA === "AIR") ? PHYS_CFG.gapWeightAir : PHYS_CFG.gapWeightGlass;
        penalty += w * d * d;
      }
      if (mediumAfterA === "AIR" && minGap < PHYS_CFG.prefAirGap) {
        const d = PHYS_CFG.prefAirGap - minGap;
        penalty += PHYS_CFG.shortAirGapWeight * d * d;
      }
      if (mediumAfterA !== "AIR" && minGap < PHYS_CFG.prefGlassCT) {
        const d = PHYS_CFG.prefGlassCT - minGap;
        penalty += PHYS_CFG.thinGlassWeight * d * d;
      }

      if (minGap < -PHYS_CFG.maxNegOverlap) hardFail = true;
      if (minGap < 0) worstOverlap = Math.max(worstOverlap, -minGap);

      if (mediumAfterA !== "AIR") {
        const noAp = maxNonOverlappingSemiDiameter(sA, sB, PHYS_CFG.minGlassCT);
        if (apShared > noAp + 1e-3) {
          const d = apShared - noAp;
          worstOverlap = Math.max(worstOverlap, d);
          penalty += PHYS_CFG.overlapWeight * d * d;
          if (d > 0.25) hardFail = true;
        }
      }
    }

    if (stopIdx < 0) {
      penalty += 1500;
      hardFail = true;
    } else {
      // Prefer iris in air on both sides.
      const prevMedium = stopIdx > 0 ? String(resolveGlassName(surfaces[stopIdx - 1]?.glass || "AIR")).toUpperCase() : "AIR";
      const nextMedium = String(resolveGlassName(surfaces[stopIdx]?.glass || "AIR")).toUpperCase();
      if (prevMedium !== "AIR") {
        penalty += PHYS_CFG.stopAirSideWeight;
        hardFail = true;
      }
      if (nextMedium !== "AIR") {
        penalty += PHYS_CFG.stopAirSideWeight;
        hardFail = true;
      }

      const leftGap = stopIdx > 0
        ? Math.max(0, Number(surfaces[stopIdx - 1]?.t || 0))
        : 0;
      const rightGap = Math.max(0, Number(surfaces[stopIdx]?.t || 0));
      if (leftGap < PHYS_CFG.minStopSideAirGap) {
        const d = PHYS_CFG.minStopSideAirGap - leftGap;
        penalty += PHYS_CFG.stopAirGapWeight * d * d;
      }
      if (rightGap < PHYS_CFG.minStopSideAirGap) {
        const d = PHYS_CFG.minStopSideAirGap - rightGap;
        penalty += PHYS_CFG.stopAirGapWeight * d * d;
      }

      // STOP should be compatible with nearby clear apertures to avoid heavy on-axis clipping.
      const neighbors = [];
      for (let d = 1; d <= 2; d++) {
        const iL = stopIdx - d;
        const iR = stopIdx + d;
        if (iL >= 0) {
          const sL = surfaces[iL];
          const tL = String(sL?.type || "").toUpperCase();
          if (tL !== "OBJ" && tL !== "IMS") neighbors.push(Number(sL.ap || 0));
        }
        if (iR < surfaces.length) {
          const sR = surfaces[iR];
          const tR = String(sR?.type || "").toUpperCase();
          if (tR !== "OBJ" && tR !== "IMS") neighbors.push(Number(sR.ap || 0));
        }
      }
      if (neighbors.length) {
        const minNeigh = Math.max(0.2, Math.min(...neighbors));
        if (stopAp > 1.08 * minNeigh) {
          const d = stopAp - 1.08 * minNeigh;
          penalty += PHYS_CFG.stopOversizeWeight * d * d;
          if (d > 0.9) hardFail = true;
        }
        if (stopAp < 0.55 * minNeigh) {
          const d = 0.55 * minNeigh - stopAp;
          penalty += PHYS_CFG.stopTooTinyWeight * d * d;
        }
      }
    }

    if (airGapCount < PHYS_CFG.minAirGapsPreferred) {
      const d = PHYS_CFG.minAirGapsPreferred - airGapCount;
      penalty += PHYS_CFG.tooFewAirGapsWeight * d * d;
    }

    return { penalty, hardFail, worstOverlap, worstPinch, airGapCount };
  }

  // -------------------- tracing --------------------
  function mountClipHitAlongRay(ray, tMax = Infinity) {
    if (!MOUNT_TRACE_CFG.enabled) return null;
    const dx = ray?.d?.x;
    const dy = ray?.d?.y;
    const dz = Number(ray?.d?.z || 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || Math.abs(dx) < 1e-12) return null;

    const xFlange = -PL_FFD;
    const xA = xFlange - MOUNT_TRACE_CFG.lensLip;
    const xB = xFlange + MOUNT_TRACE_CFG.camDepth;

    const tA = (xA - ray.p.x) / dx;
    const tB = (xB - ray.p.x) / dx;

    let t0 = Math.max(1e-9, Math.min(tA, tB));
    let t1 = Math.max(tA, tB);
    if (Number.isFinite(tMax)) t1 = Math.min(t1, tMax - 1e-9);
    if (!(t1 >= t0)) return null;

    const py = Number(ray?.p?.y || 0);
    const pz = Number(ray?.p?.z || 0);
    const yAt = (t) => py + dy * t;
    const zAt = (t) => pz + dz * t;
    const r2At = (t) => {
      const yy = yAt(t);
      const zz = zAt(t);
      return yy * yy + zz * zz;
    };
    const lim = Math.max(0.1, MOUNT_TRACE_CFG.throatR - Math.max(0, MOUNT_TRACE_CFG.clearanceMm || 0));
    const lim2 = lim * lim;
    const r20 = r2At(t0);
    const r21 = r2At(t1);

    if (r20 <= lim2 + 1e-9 && r21 <= lim2 + 1e-9) return null;

    let tClip = t0;
    const A = dy * dy + dz * dz;
    if (A > 1e-14) {
      const B = 2 * (py * dy + pz * dz);
      const C = py * py + pz * pz - lim2;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sd = Math.sqrt(disc);
        const rt1 = (-B - sd) / (2 * A);
        const rt2 = (-B + sd) / (2 * A);
        const roots = [rt1, rt2].filter((t) => t >= t0 - 1e-9 && t <= t1 + 1e-9);
        if (roots.length) tClip = Math.max(t0, Math.min(...roots));
      }
    }

    return {
      t: tClip,
      hit: { x: ray.p.x + dx * tClip, y: yAt(tClip), z: zAt(tClip) },
    };
  }

  function traceRayForward(ray, surfaces, wavePreset, opts = {}) {
    const skipIMS = !!opts.skipIMS;

    let pts = [];
    let vignetted = false;
    let tir = false;
    let clippedByMount = false;

    pts.push({ x: ray.p.x, y: ray.p.y });

    let nBefore = 1.0;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      if (skipIMS && isIMS) continue;

      const hitInfo = intersectSurface(ray, s);
      const mountHit = (!skipIMS && nBefore <= 1.000001)
        ? mountClipHitAlongRay(ray, hitInfo?.t ?? Infinity)
        : null;
      if (mountHit) { pts.push(mountHit.hit); vignetted = true; clippedByMount = true; break; }

      if (!hitInfo) { vignetted = true; break; }

      pts.push(hitInfo.hit);

      if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

      if (isIMS || isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nAfter = glassN(String(s.glass || "AIR"), wavePreset);

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

    return { pts, vignetted, tir, clippedByMount, endRay: ray };
  }

  // -------------------- ray bundles --------------------
  const RAY_BUNDLE_CFG = {
    apFill: 0.999, // sample almost full clear aperture (avoid optimistic vignette estimates)
  };
  const RAY_CROSS_CFG = {
    minGlassN: 1.0005,
    minOverlapX: 1e-4,
    edgePadFrac: 0.08,
    edgePadMaxMm: 0.03,
    yTol: 5e-4,
  };

  function getRayReferencePlane(surfaces) {
    const apFill = Math.max(0.5, Math.min(1.0, Number(RAY_BUNDLE_CFG.apFill || 1.0)));
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const s = surfaces[stopIdx];
      return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * apFill), refIdx: stopIdx };
    }
    let refIdx = 1;
    if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
    const s = surfaces[refIdx] || surfaces[0];
    return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * apFill), refIdx };
  }

  function buildRays(surfaces, fieldAngleDeg, count) {
    const n = Math.max(3, Math.min(101, count | 0));
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 80;
    const { xRef, apRef } = getRayReferencePlane(surfaces);

    const hMax = apRef;
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

  function segmentYAtX(p0, p1, x) {
    const x0 = Number(p0?.x), y0 = Number(p0?.y);
    const x1 = Number(p1?.x), y1 = Number(p1?.y);
    if (![x0, y0, x1, y1, x].every(Number.isFinite)) return null;
    const dx = x1 - x0;
    if (Math.abs(dx) < 1e-12) return null;
    const t = (x - x0) / dx;
    return y0 + (y1 - y0) * t;
  }

  function segmentPairCrossesInside(a0, a1, b0, b1) {
    const ax0 = Number(a0?.x), ax1 = Number(a1?.x);
    const bx0 = Number(b0?.x), bx1 = Number(b1?.x);
    if (![ax0, ax1, bx0, bx1].every(Number.isFinite)) return false;

    const xL = Math.max(Math.min(ax0, ax1), Math.min(bx0, bx1));
    const xR = Math.min(Math.max(ax0, ax1), Math.max(bx0, bx1));
    const span = xR - xL;
    if (!(span > Number(RAY_CROSS_CFG.minOverlapX || 1e-4))) return false;

    const pad = Math.min(
      Number(RAY_CROSS_CFG.edgePadMaxMm || 0.03),
      span * Math.max(0.01, Number(RAY_CROSS_CFG.edgePadFrac || 0.08))
    );
    const xA = xL + pad;
    const xB = xR - pad;
    if (!(xB > xA)) return false;

    const yA0 = segmentYAtX(a0, a1, xA);
    const yA1 = segmentYAtX(a0, a1, xB);
    const yB0 = segmentYAtX(b0, b1, xA);
    const yB1 = segmentYAtX(b0, b1, xB);
    if (![yA0, yA1, yB0, yB1].every(Number.isFinite)) return false;

    const d0 = yA0 - yB0;
    const d1 = yA1 - yB1;
    const tol = Math.max(1e-6, Number(RAY_CROSS_CFG.yTol || 5e-4));

    if (Math.abs(d0) <= tol || Math.abs(d1) <= tol) {
      const xm = 0.5 * (xA + xB);
      const yAm = segmentYAtX(a0, a1, xm);
      const yBm = segmentYAtX(b0, b1, xm);
      if (Number.isFinite(yAm) && Number.isFinite(yBm) && Math.abs(yAm - yBm) <= tol) return true;
    }
    return (d0 * d1) < -(tol * tol);
  }

  function detectInternalRayCrossings(traces, surfaces, wavePreset) {
    const out = {
      validRayCount: 0,
      checkedSegments: 0,
      checkedPairs: 0,
      crossPairs: 0,
      crossSegments: 0,
      invalid: false,
    };
    if (!Array.isArray(traces) || !Array.isArray(surfaces) || surfaces.length < 3) return out;

    const glassSegmentIdx = [];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS" || t === "MECH" || t === "BAFFLE" || t === "HOUSING") continue;
      const nAfter = glassN(String(s?.glass || "AIR"), wavePreset);
      if (!(Number.isFinite(nAfter) && nAfter > Number(RAY_CROSS_CFG.minGlassN || 1.0005))) continue;
      glassSegmentIdx.push(i);
    }
    if (!glassSegmentIdx.length) return out;

    const valid = traces.filter((tr) =>
      tr && !tr.vignetted && !tr.tir && Array.isArray(tr.pts) && tr.pts.length >= 4
    );
    out.validRayCount = valid.length;
    if (valid.length < 2) return out;

    const crossedSeg = new Set();
    for (const segIdx of glassSegmentIdx) {
      let segPairs = 0;
      let segHasCross = false;
      for (let r = 0; r < valid.length - 1; r++) {
        const ta = valid[r];
        const tb = valid[r + 1];
        const a0 = ta.pts[segIdx + 1];
        const a1 = ta.pts[segIdx + 2];
        const b0 = tb.pts[segIdx + 1];
        const b1 = tb.pts[segIdx + 2];
        if (!a0 || !a1 || !b0 || !b1) continue;
        segPairs++;
        if (segmentPairCrossesInside(a0, a1, b0, b1)) {
          out.crossPairs++;
          segHasCross = true;
        }
      }
      if (segPairs > 0) out.checkedSegments++;
      out.checkedPairs += segPairs;
      if (segHasCross) crossedSeg.add(segIdx);
    }
    out.crossSegments = crossedSeg.size;
    out.invalid = out.crossPairs > 0;
    return out;
  }

  function rayHitYAtX(endRay, x) {
    if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
    const t = (x - endRay.p.x) / endRay.d.x;
    if (!Number.isFinite(t)) return null;
    return endRay.p.y + t * endRay.d.y;
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

  function measureCenterThroughput(surfaces, wavePreset, sensorX, rayCount = 41) {
    const rays = buildRays(surfaces, 0, rayCount);
    let good = 0;
    const total = rays.length;

    for (const r of rays) {
      const tr = traceRayForward(clone(r), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (Number.isFinite(y)) good++;
    }

    const goodFrac = clamp(good / Math.max(1, total), 1e-6, 1.0);
    return { good, total, goodFrac };
  }

  function estimateEffectiveT(tGeom, goodFrac0) {
    if (!Number.isFinite(tGeom) || tGeom <= 0) return null;
    const g = clamp(Number(goodFrac0 || 0), 1e-6, 1.0);
    const tEff = tGeom / Math.sqrt(g);
    return Number.isFinite(tEff) ? tEff : null;
  }

  function tLossStops(tEff, tGeom) {
    if (!Number.isFinite(tEff) || !Number.isFinite(tGeom) || tEff <= 0 || tGeom <= 0) return null;
    const ds = Math.log2(tEff / tGeom);
    return Number.isFinite(ds) ? ds : null;
  }

  // -------------------- FOV --------------------
  function deg2rad(d) { return (d * Math.PI) / 180; }
  function rad2deg(r) { return (r * 180) / Math.PI; }
  function computeFovDeg(efl, sensorW, sensorH) {
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const diag = Math.hypot(sensorW, sensorH);
    const hfov = 2 * Math.atan(sensorW / (2 * efl));
    const vfov = 2 * Math.atan(sensorH / (2 * efl));
    const dfov = 2 * Math.atan(diag / (2 * efl));
    return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
  }

  const SENSOR_CLIP_TOL_MM = 0.02;

  function requiredHalfFieldDeg(efl, sensorW, sensorH, mode = "d") {
    const fov = computeFovDeg(efl, sensorW, sensorH);
    if (!fov) return null;
    if (mode === "h") return fov.hfov * 0.5;
    if (mode === "v") return fov.vfov * 0.5;
    return fov.dfov * 0.5;
  }

  function coverageHalfSizeMm(sensorW, sensorH, mode = "d") {
    if (mode === "h") return Math.max(0.1, sensorW * 0.5);
    if (mode === "v") return Math.max(0.1, sensorH * 0.5);
    const d = Math.hypot(sensorW, sensorH);
    return Math.max(0.1, d * 0.5);
  }

  const SOFT_IC_CFG = {
    thresholdRel: 0.36, // usable circle @ 36% of center illumination
    bgOverscan: 1.6,     // match Render Engine OV mapping
    bgLutSamples: 900,   // match Render Engine LUT density
    bgPupilSqrt: 16,     // denser pupil sampling for tighter edge estimate
    bgObjDistMm: 2000,   // object plane distance for reverse ray hit test
    bgStartEpsMm: 0.05,  // avoid exact sensor plane degeneracy
    minSamplesForCurve: 8,
    smoothingHalfWindow: 3,
    eps: 1e-6,
  };

  // Faster IC estimator for optimizer loop (keeps search responsive).
  const OPT_IC_CFG = {
    bgLutSamples: 96,
    bgPupilSqrt: 5,
    smoothingHalfWindow: 2,
  };

  // Very cheap IC settings for fast-tier candidate ranking.
  const FAST_OPT_IC_CFG = {
    bgLutSamples: 40,
    bgPupilSqrt: 3,
    smoothingHalfWindow: 1,
    minSamplesForCurve: 4,
    thetaStepDeg: 2.0,
    maxFieldDeg: 42,
    bgObjDistMm: 1400,
  };

  const OPT_STAGE_CFG = {
    flBandRel: 0.05,      // once FL is in +/-5%, keep all accepted updates in this band
    flStageRel: 0.01,     // do not leave FL phase until within +/-1%
    flPreferRel: 0.002,   // in later phases, do not accept >0.2% FL degradation
    flHoldRel: 0.05,      // hard FL hold after lock (within +/-5%)
    polishFlDriftRel: 0.0008, // in fine tune, keep FL nearly locked while reducing residual distortion
    icStageDriftRel: 0.006, // allow a bit more FL drift during IC growth
    bflHardShortMm: 0.80, // hard fail when BFL is too short for mount
    tCoarseAbs: 0.75,     // before IC growth, first reduce too-slow T overshoot
    icPassFrac: 1.00,     // IC is only good when measured IC >= requested IC
    tGoodAbs: 0.25,       // T phase considered good when too-slow T overshoot <= 0.25
  };

  const OPT_EVAL_CFG = {
    fastRayCount: 15,
    fastAutofocusEvery: 120,
    fastIcEvery: 10,
    accurateAuditEvery: 90,
    fastAfRange: 3.0,
    fastAfCoarseStep: 0.60,
    fastAfFineHalf: 0.90,
    fastAfFineStep: 0.20,
    accurateAfRange: 6.0,
    accurateAfCoarseStep: 0.30,
    accurateAfFineHalf: 1.60,
    accurateAfFineStep: 0.08,
  };

  const DIST_OPT_CFG = {
    objDistMm: 20000.0,
    sampleFracs: [0.3, 0.5, 0.7, 0.9],
    lutNBadge: 220,
    lutNOptFast: 320,
    lutNOptFinal: 700,
    lutPupilSqrtBadge: 1,
    lutPupilSqrtOpt: 1,
    maxFieldScanDeg: 65,
    maxFieldStepDeg: 1.0,
    maxCoverageDropDeg: 0.35,
    maxCoverageDropRejectDeg: 0.85,
    maxEflDriftRel: 0.018,
    maxEflDriftRelReject: 0.040,
    maxTDriftAbs: 0.20,
    maxTDriftAbsReject: 0.45,
    maxBflShortMm: 1.0,
    plWorsenTolMm: 0.05,
    iterationsMin: 800,
    iterationsMax: 100000,
    progressBatch: 80,
    annealTempStart: 6.0,
    annealTempEnd: 0.4,
    mutation: {
      stopMoveChance: 0.26,
      bendChance: 0.50,
      airChance: 0.20,
      stopApChance: 0.04,
      bendPctMin: 0.005,
      bendPctMax: 0.020,
      airDeltaMm: 0.60,
      stopApPct: 0.005,
    },
    weights: {
      dist: 120.0,
      efl: 80.0,
      t: 60.0,
      cov: 200.0,
      feas: 500.0,
    },
  };

  const SHARP_OPT_CFG = {
    angleFractions: [0.0, 0.35, 0.70, 0.95],
    angleWeights: [1.0, 1.2, 1.6, 2.2],
    rayCountMin: 11,
    rayCountMax: 41,
    minValidFrac: 0.48,
    lowValidPenaltyMm: 0.75,
    noDataPenaltyMm: 3.2,
    maxFieldScanDeg: 65,
    maxFieldStepDeg: 1.25,
    maxCoverageDropDeg: 0.35,
    maxCoverageDropRejectDeg: 0.80,
    maxEflDriftRel: 0.012,
    maxEflDriftRelReject: 0.030,
    maxTDriftAbs: 0.18,
    maxTDriftAbsReject: 0.42,
    maxBflShortMm: 1.0,
    plWorsenTolMm: 0.05,
    maxDist70WorsenPct: 0.30,
    maxDist70WorsenRejectPct: 0.90,
    iterationsMin: 1200,
    iterationsMax: 12000,
    progressBatch: 60,
    annealTempStart: 0.90,
    annealTempEnd: 0.10,
    autofocus: {
      rangeMm: 0.60,
      coarseStepMm: 0.10,
      fineHalfMm: 0.16,
      fineStepMm: 0.04,
      rayCount: 15,
      fieldMode: "center", // "center" | "weighted"
    },
    mutation: {
      airChance: 0.52,
      bendChance: 0.48,
      airDeltaMinMm: 0.05,
      airDeltaMaxMm: 0.40,
      bendPctMin: 0.002,
      bendPctMax: 0.010,
      pairBendChance: 0.42,
    },
    distGuardLutN: 180,
    distGuardPupilSqrt: 1,
    distGuardObjDistMm: 20000,
    weights: {
      sharp: 120.0,
      efl: 80.0,
      t: 60.0,
      cov: 200.0,
      dist: 60.0,
      feas: 500.0,
    },
  };

  const COCKPIT_CFG = {
    progressBatch: 60,
    minIterations: 80,
    maxIterations: 120000,
    defaultIters: 2400,
    defaultStepSize: 0.06,
    defaultMacroPasses: 2,
    hardMinValidCenterFrac: 0.28,
    plIntrusionRejectMm: 0.50,
    maxBflShortRejectMm: 1.0,
    defaultObjDistMm: Number(DIST_OPT_CFG.objDistMm || 20000),
    defaultLutN: 240,
    defaultRayCount: 21,
    maxCoverageDropNormalDeg: 0.40,
    maxCoverageDropStrictDeg: 0.20,
    maxDistWorsenNormalPct: 0.60,
    maxDistWorsenStrictPct: 0.30,
    maxEflDriftNormalMm: 0.80,
    maxEflDriftStrictMm: 0.35,
    maxTDriftNormal: 0.10,
    maxTDriftStrict: 0.05,
  };

  const SCRATCH_CFG = {
    autoFamilyWideMaxMm: 35,
    autoFamilyNormalMaxMm: 85,
    effortMin: 0.60,
    effortMax: 4.00,
    effortDefault: 1.00,
    maxGrowCycles: {
      safe: 2,
      normal: 4,
      wild: 6,
    },
    stageIters: {
      safe:   { A: 800,  B: 900,  C: 1400, D: 1700 },
      normal: { A: 1100, B: 1300, C: 2300, D: 2800 },
      wild:   { A: 1500, B: 1900, C: 3400, D: 4200 },
    },
    plateauImproveFrac: 0.010,
    acceptableFlRel: 0.020,
    acceptableTAbs: 0.35,
    acceptableIcNeedMm: 0.60,
    acceptableIcNeedFrac: 0.03,
    strictDistRmsPct: 1.00,
    strictDistMaxPct: 2.00,
    acceptableDistRmsPct: 2.20,
    acceptableDistMaxPct: 4.20,
    // Focusability/sharpness sanity to avoid accepting "technically feasible but useless" designs.
    strictRmsCenterMm: 0.45,
    strictRmsEdgeMm: 1.20,
    acceptableRmsCenterMm: 0.75,
    acceptableRmsEdgeMm: 2.20,
    // Hard floor for "usable best effort" output.
    minUsableFlRel: 0.06,
    minUsableTSlowAbs: 1.60,
    minUsableIcNeedMmAbs: 3.0,
    minUsableIcNeedMmFrac: 0.16,
    minUsableRmsCenterMm: 1.20,
    minUsableRmsEdgeMm: 4.50,
    maxUsableVigFrac: 0.50,
    minUsableCenterThroughput: 0.18,
    minElements: 3,
    maxElementsHardCap: 14,
  };

  function softIcLabel(cfg = SOFT_IC_CFG) {
    const pct = Math.round(Number(cfg?.thresholdRel ?? 0) * 100);
    return `IC${pct}%`;
  }

  let _softIcCacheKey = "";
  let _softIcCacheVal = null;
  let _distCacheKey = "";
  let _distCacheVal = null;
  let _lutOnlyCacheKey = "";
  let _lutOnlyCacheVal = null;
  let _lutDistMetricCacheKey = "";
  let _lutDistMetricCacheVal = null;
  let _realismCacheKey = "";
  let _realismCacheVal = null;
  let _sharpCacheKey = "";
  let _sharpCacheVal = null;
  let _cockpitMetricsCacheKey = "";
  let _cockpitMetricsCacheVal = null;

  function chiefRadiusAtFieldDeg(workSurfaces, fieldDeg, wavePreset, sensorX) {
    const chief = buildChiefRay(workSurfaces, fieldDeg);
    const tr = traceRayForward(clone(chief), workSurfaces, wavePreset);
    if (!tr || !tr.endRay || tr.tir) return null;
    const y = rayHitYAtX(tr.endRay, sensorX);
    return Number.isFinite(y) ? Math.abs(y) : null;
  }

  // -------------------- IC-only background helpers (ported from Render Engine) --------------------
  function normalize3(v) {
    const m = Math.hypot(v.x, v.y, v.z);
    if (m < 1e-12) return { x: 0, y: 0, z: 0 };
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function mul3(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }

  function refract3(I, N, n1, n2) {
    I = normalize3(I);
    N = normalize3(N);
    if (dot3(I, N) > 0) N = mul3(N, -1);
    const cosi = -dot3(N, I);
    const eta = n1 / n2;
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    const T = add3(mul3(I, eta), mul3(N, eta * cosi - Math.sqrt(k)));
    return normalize3(T);
  }

  function intersectSurface3D(ray, surf) {
    const vx = surf.vx;
    const R = Number(surf.R || 0);
    const ap = Math.max(0, Number(surf.ap || 0));

    if (Math.abs(R) < 1e-9) {
      if (Math.abs(ray.d.x) < 1e-12) return null;
      const t = (vx - ray.p.x) / ray.d.x;
      if (!Number.isFinite(t) || t <= 1e-9) return null;
      const hit = add3(ray.p, mul3(ray.d, t));
      const r = Math.hypot(hit.y, hit.z);
      const vignetted = r > ap + 1e-9;
      return { hit, t, vignetted, normal: { x: -1, y: 0, z: 0 } };
    }

    const cx = vx + R;
    const rad = Math.abs(R);
    const px = ray.p.x - cx;
    const py = ray.p.y;
    const pz = ray.p.z;
    const dx = ray.d.x;
    const dy = ray.d.y;
    const dz = ray.d.z;

    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (px * dx + py * dy + pz * dz);
    const C = px * px + py * py + pz * pz - rad * rad;
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

    const hit = add3(ray.p, mul3(ray.d, t));
    const r = Math.hypot(hit.y, hit.z);
    const vignetted = r > ap + 1e-9;
    const normal = normalize3({ x: hit.x - cx, y: hit.y, z: hit.z });
    return { hit, t, vignetted, normal };
  }

  function traceRayReverse3D(ray, surfaces, wavePreset) {
    let vignetted = false;
    let tir = false;

    for (let i = surfaces.length - 1; i >= 0; i--) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      const hitInfo = intersectSurface3D(ray, s);
      if (!hitInfo) { vignetted = true; break; }
      if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

      if (isIMS || isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nRight = glassN(String(s.glass || "AIR"), wavePreset);
      const nLeft = (i === 0) ? 1.0 : glassN(String(surfaces[i - 1].glass || "AIR"), wavePreset);

      if (Math.abs(nLeft - nRight) < 1e-9) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const newDir = refract3(ray.d, hitInfo.normal, nRight, nLeft);
      if (!newDir) { tir = true; break; }
      ray = { p: hitInfo.hit, d: newDir };
    }

    return { vignetted, tir, endRay: ray };
  }

  function intersectPlaneX3D(ray, xPlane) {
    if (!ray?.d || Math.abs(ray.d.x) < 1e-12) return null;
    const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add3(ray.p, mul3(ray.d, t));
  }

  function samplePupilDisk(stopAp, u, v) {
    const a = u * 2 - 1;
    const b = v * 2 - 1;
    let r, phi;
    if (a === 0 && b === 0) { r = 0; phi = 0; }
    else if (Math.abs(a) > Math.abs(b)) { r = a; phi = (Math.PI / 4) * (b / a); }
    else { r = b; phi = (Math.PI / 2) - (Math.PI / 4) * (a / b); }

    const rr = Math.abs(r) * Math.max(1e-6, Number(stopAp || 0));
    return { y: rr * Math.cos(phi), z: rr * Math.sin(phi) };
  }

  function naturalCos4AtSensorRadius(surfaces, sensorX, rMm) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
    const xStop = Number(stopSurf?.vx);
    const sx = Number(sensorX) + Number(SOFT_IC_CFG.bgStartEpsMm || 0.05);
    if (!Number.isFinite(xStop) || !Number.isFinite(sx)) return 1.0;
    const rr = Math.max(0, Number(rMm || 0));
    const dir = normalize3({ x: xStop - sx, y: -rr, z: 0 });
    const c = clamp(Math.abs(dir.x), 0, 1);
    return c * c * c * c;
  }

  function estimateUsableCircleBackgroundLut(
    surfaces,
    sensorW,
    sensorH,
    wavePreset,
    rayCount,
    cfgOverride = null,
    focusOpts = null
  ) {
    const cfg = { ...SOFT_IC_CFG, ...(cfgOverride || {}) };
    const sensorX = 0.0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const ov = Math.max(1.0, Number(cfg.bgOverscan || 1.6));
    const work = clone(surfaces);
    const useFocusedGeometry = !!focusOpts?.useCurrentGeometry;
    let lensShift = Number(focusOpts?.lensShift || 0);

    if (!useFocusedGeometry) {
      const af = bestLensShiftForDesign(work, 0, Math.max(21, rayCount | 0), wavePreset);
      if (!af.ok) {
        return {
          softICmm: 0, rEdge: 0,
          relMin: Number(cfg.thresholdRel || 0.35),
          thresholdRel: Number(cfg.thresholdRel || 0.35),
          usableCircleDiameterMm: 0,
          usableCircleRadiusMm: 0,
          relAtCutoff: 0,
          centerGoodFrac: 0,
          samples: [],
          focusLensShift: 0,
          focusFailed: true,
          drasticDropRadiusMm: null,
        };
      }

      lensShift = af.shift;
      computeVertices(work, lensShift, sensorX);
    }

    const stopIdx = findStopSurfaceIndex(work);
    const stopSurf = stopIdx >= 0 ? work[stopIdx] : work[0];
    const stopAp = Math.max(1e-6, Number(stopSurf?.ap || 0));
    const xStop = Number(stopSurf?.vx);
    if (!(stopAp > 0) || !Number.isFinite(xStop)) {
      return {
        softICmm: 0, rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: 0,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const lutMin = Math.max(8, Number(cfg.bgLutMin || 24) | 0);
    const pupilMin = Math.max(2, Number(cfg.bgPupilMin || 2) | 0);
    const lutN = Math.max(lutMin, Math.min(1200, Number(cfg.bgLutSamples || 900) | 0));
    const pupilSqrt = Math.max(pupilMin, Math.min(28, Number(cfg.bgPupilSqrt || 14) | 0));
    const startX = sensorX + Number(cfg.bgStartEpsMm || 0.05);
    const xObjPlane = (work[0]?.vx ?? 0) - Math.max(100, Number(cfg.bgObjDistMm || 2000));
    const sensorWv = Number(sensorW) * ov;
    const sensorHv = Number(sensorH) * ov;
    const rMaxSensor = Math.hypot(sensorWv * 0.5, sensorHv * 0.5);

    const radialMm = new Float64Array(lutN);
    const gainCurve = new Float64Array(lutN);

    for (let k = 0; k < lutN; k++) {
      const a = lutN > 1 ? (k / (lutN - 1)) : 0;
      const rS = a * rMaxSensor;
      radialMm[k] = rS / ov;

      const pS = { x: startX, y: rS, z: 0 };
      const natural = naturalCos4AtSensorRadius(work, sensorX, rS);

      let ok = 0;
      let total = 0;
      for (let iy = 0; iy < pupilSqrt; iy++) {
        for (let ix = 0; ix < pupilSqrt; ix++) {
          const uu = (ix + 0.5) / pupilSqrt;
          const vv = (iy + 0.5) / pupilSqrt;
          const pp = samplePupilDisk(stopAp, uu, vv);
          const target = { x: xStop, y: pp.y, z: pp.z };
          const dir = normalize3({ x: target.x - pS.x, y: target.y - pS.y, z: target.z - pS.z });

          const tr = traceRayReverse3D({ p: pS, d: dir }, work, wavePreset);
          total++;
          if (tr.vignetted || tr.tir || !tr.endRay) continue;
          const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
          if (!hitObj) continue;
          ok++;
        }
      }

      const trans = total ? (ok / total) : 0;
      gainCurve[k] = clamp(trans * natural, 0, 1);
    }

    const uc = computeUsableCircleFromRadialCurve(radialMm, gainCurve, cfg);
    const relCurve = uc.relCurve?.length === lutN ? uc.relCurve : Array.from({ length: lutN }, () => 0);

    const samples = Array.from({ length: lutN }, (_, i) => {
      const relIllum = clamp(Number(relCurve[i] || 0), 0, 1);
      return {
        rMm: Number(radialMm[i] || 0),
        thetaDeg: null,
        gain: Number(gainCurve[i] || 0),
        relIllum,
        stopsDown: relIllum > cfg.eps ? -Math.log2(relIllum) : Infinity,
      };
    });

    const rEdge = uc.valid ? clamp(Number(uc.radiusMm || 0), 0, halfDiag) : 0;
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;
    const centerGoodFrac = gainCurve.length ? clamp(Number(gainCurve[0] || 0), 0, 1) : 0;

    return {
      softICmm,
      rEdge,
      relMin: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      thresholdRel: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      relAtCutoff: Number(uc.relAtCutoff || 0),
      centerGoodFrac,
      samples,
      focusLensShift: lensShift,
      focusFailed: false,
      drasticDropRadiusMm: null,
    };
  }

  function buildLUTOnly({
    surfaces,
    wavePreset = "d",
    sensorX = 0,
    lensShift = 0,
    objDist = null,
    lutN = 480,
    lutPupilSqrt = 1,
    doCA = false,
    sensorW = null,
    sensorH = null,
  } = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return null;

    const sensor = getSensorWH();
    const wMm = Number.isFinite(sensorW) ? Number(sensorW) : Number(sensor.w || 36.7);
    const hMm = Number.isFinite(sensorH) ? Number(sensorH) : Number(sensor.h || 25.54);
    const halfDiag = 0.5 * Math.hypot(wMm, hMm);
    const work = clone(surfaces);

    computeVertices(work, Number(lensShift || 0), Number(sensorX || 0));
    const stopIdx = findStopSurfaceIndex(work);
    if (stopIdx < 0) return null;
    const stopSurf = work[stopIdx];
    const stopAp = Math.max(1e-6, Number(stopSurf?.ap || 0));
    const xStop = Number(stopSurf?.vx);
    if (!(stopAp > 0) || !Number.isFinite(xStop)) return null;

    const startX = Number(sensorX || 0) + Number(SOFT_IC_CFG.bgStartEpsMm || 0.05);
    const objDistMm = Math.max(300, Number(objDist || DIST_OPT_CFG.objDistMm || SOFT_IC_CFG.bgObjDistMm || 20000));
    const xObjPlane = (work[0]?.vx ?? 0) - objDistMm;

    const n = Math.max(24, Math.min(1600, Number(lutN || 480) | 0));
    const pupilSqrt = Math.max(1, Math.min(20, Number(lutPupilSqrt || 1) | 0));
    const rMaxSensor = Math.max(0.2, halfDiag);

    const rSensorLUT = new Float32Array(n);
    const naturalLUT = new Float32Array(n);
    const transLUT = new Float32Array(n);
    const rObjLUT = [
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
    ];
    for (let ch = 0; ch < 3; ch++) {
      for (let k = 0; k < n; k++) rObjLUT[ch][k] = NaN;
    }

    const waveByCh = doCA
      ? ["c", "d", "g"]
      : [wavePreset, wavePreset, wavePreset];

    for (let k = 0; k < n; k++) {
      const a = n > 1 ? (k / (n - 1)) : 0;
      const rS = a * rMaxSensor;
      rSensorLUT[k] = rS;
      naturalLUT[k] = naturalCos4AtSensorRadius(work, sensorX, rS);

      const pS = { x: startX, y: rS, z: 0 };
      const chiefTarget = { x: xStop, y: 0, z: 0 };
      const chiefDir = normalize3({ x: chiefTarget.x - pS.x, y: chiefTarget.y - pS.y, z: chiefTarget.z - pS.z });

      for (let ch = 0; ch < 3; ch++) {
        const trChief = traceRayReverse3D({ p: pS, d: chiefDir }, work, waveByCh[ch]);
        if (trChief?.vignetted || trChief?.tir || !trChief?.endRay) continue;
        const hitObj = intersectPlaneX3D(trChief.endRay, xObjPlane);
        if (!hitObj) continue;
        rObjLUT[ch][k] = Math.hypot(Number(hitObj.y || 0), Number(hitObj.z || 0));
      }

      if (pupilSqrt <= 1) {
        const trChief = traceRayReverse3D({ p: pS, d: chiefDir }, work, wavePreset);
        transLUT[k] = (trChief && !trChief.vignetted && !trChief.tir && trChief.endRay) ? 1 : 0;
      } else {
        let ok = 0;
        let total = 0;
        for (let iy = 0; iy < pupilSqrt; iy++) {
          for (let ix = 0; ix < pupilSqrt; ix++) {
            const uu = (ix + 0.5) / pupilSqrt;
            const vv = (iy + 0.5) / pupilSqrt;
            const pp = samplePupilDisk(stopAp, uu, vv);
            const target = { x: xStop, y: pp.y, z: pp.z };
            const dir = normalize3({ x: target.x - pS.x, y: target.y - pS.y, z: target.z - pS.z });
            const tr = traceRayReverse3D({ p: pS, d: dir }, work, wavePreset);
            total++;
            if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
            const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
            if (!hitObj) continue;
            ok++;
          }
        }
        transLUT[k] = total > 0 ? (ok / total) : 0;
      }
    }

    return {
      rMaxSensor,
      rSensorLUT,
      rObjLUT,
      transLUT,
      naturalLUT,
      objDist: objDistMm,
      xObjPlane,
      sensorW: wMm,
      sensorH: hMm,
      lutN: n,
      doCA: !!doCA,
      wavePreset: String(wavePreset || "d"),
    };
  }

  function sampleLutLinear(arr, rS, rMaxSensor) {
    if (!arr || !arr.length || !(rMaxSensor > 1e-9)) return NaN;
    const n = arr.length;
    const x = clamp(Number(rS || 0), 0, rMaxSensor);
    const t = x / rMaxSensor;
    const p = t * (n - 1);
    const i0 = clamp(Math.floor(p), 0, n - 1);
    const i1 = clamp(i0 + 1, 0, n - 1);
    const f = p - i0;
    const v0 = Number(arr[i0]);
    const v1 = Number(arr[i1]);
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) return NaN;
    return v0 + (v1 - v0) * f;
  }

  function computeDistortionFromLUT(lutPack, {
    efl = null,
    objDist = null,
    sampleFracs = null,
  } = {}) {
    if (!lutPack) return null;
    const rMaxSensor = Number(lutPack?.rMaxSensor || 0);
    const eflMm = Number(efl || 0);
    const objDistMm = Math.max(1, Number(objDist || lutPack?.objDist || DIST_OPT_CFG.objDistMm || 20000));
    if (!(rMaxSensor > 1e-9) || !(eflMm > 1e-9)) return null;

    const green = lutPack?.rObjLUT?.[1] || lutPack?.rObjLUT?.[0];
    if (!green || !green.length) return null;

    const fracs = Array.isArray(sampleFracs) && sampleFracs.length
      ? sampleFracs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [0.3, 0.5, 0.7, 0.9];
    if (!fracs.length) return null;

    const samples = [];
    let sumSq = 0;
    let maxAbs = 0;
    let valid = 0;
    for (const fracRaw of fracs) {
      const frac = clamp(fracRaw, 1e-4, 1.2);
      const rS = frac * rMaxSensor;
      const rObj = sampleLutLinear(green, rS, rMaxSensor);
      const rIdeal = (objDistMm / eflMm) * rS;
      if (!(Number.isFinite(rObj) && Number.isFinite(rIdeal) && rIdeal > 1e-12)) {
        samples.push({ frac, rS, rObj: null, rIdeal: null, distPct: null });
        continue;
      }
      const distPct = 100 * (rObj - rIdeal) / rIdeal;
      sumSq += distPct * distPct;
      maxAbs = Math.max(maxAbs, Math.abs(distPct));
      valid++;
      samples.push({ frac, rS, rObj, rIdeal, distPct });
    }
    if (valid <= 0) return null;

    const at70 = samples.find((s) => Math.abs(Number(s.frac || 0) - 0.7) < 1e-3);
    const edge = [...samples].reverse().find((s) => Number.isFinite(s?.distPct));
    const edgeDistPct = Number.isFinite(edge?.distPct) ? Number(edge.distPct) : null;
    const flavor = !Number.isFinite(edgeDistPct)
      ? "unknown"
      : edgeDistPct <= -0.05 ? "barrel"
      : edgeDistPct >= 0.05 ? "pincushion"
      : "neutral";

    return {
      distPctAt70: Number.isFinite(at70?.distPct) ? Number(at70.distPct) : null,
      rmsDistPct: Math.sqrt(sumSq / valid),
      maxAbsDistPct: maxAbs,
      edgeDistPct,
      flavor,
      sampleCount: fracs.length,
      validSamples: valid,
      samples,
      objDistMm,
      rMaxSensor,
    };
  }

  function getLutOnlyCached(params = {}) {
    const surfaces = params?.surfaces || [];
    const keyObj = {
      wavePreset: String(params?.wavePreset || "d"),
      sensorX: Number(params?.sensorX || 0).toFixed(6),
      lensShift: Number(params?.lensShift || 0).toFixed(6),
      objDist: Number(params?.objDist || 0).toFixed(3),
      lutN: Number(params?.lutN || 0) | 0,
      lutPupilSqrt: Number(params?.lutPupilSqrt || 0) | 0,
      doCA: !!params?.doCA,
      sensorW: Number(params?.sensorW || 0).toFixed(4),
      sensorH: Number(params?.sensorH || 0).toFixed(4),
      surfaces: surfaces.map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        vx: Number(s?.vx || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _lutOnlyCacheKey && _lutOnlyCacheVal) return _lutOnlyCacheVal;
    const val = buildLUTOnly(params);
    _lutOnlyCacheKey = key;
    _lutOnlyCacheVal = val;
    return val;
  }

  function getLutDistortionMetricsCached(params = {}) {
    const lutPack = getLutOnlyCached(params);
    const keyObj = {
      lutKey: _lutOnlyCacheKey,
      efl: Number(params?.efl || 0).toFixed(6),
      objDist: Number(params?.objDist || 0).toFixed(3),
      fracs: (params?.sampleFracs || []).map((x) => Number(x).toFixed(4)),
    };
    const key = JSON.stringify(keyObj);
    if (key === _lutDistMetricCacheKey && _lutDistMetricCacheVal) return _lutDistMetricCacheVal;
    const val = computeDistortionFromLUT(lutPack, {
      efl: params?.efl,
      objDist: params?.objDist,
      sampleFracs: params?.sampleFracs,
    });
    _lutDistMetricCacheKey = key;
    _lutDistMetricCacheVal = val;
    return val;
  }

  function computeUsableIcFromLUTPack(lutPack, cfg = SOFT_IC_CFG) {
    if (!lutPack || !lutPack.rSensorLUT || !lutPack.transLUT || !lutPack.naturalLUT) {
      return {
        valid: false,
        diameterMm: 0,
        radiusMm: 0,
        thresholdRel: Number(cfg?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35),
        relAtCutoff: 0,
        samples: [],
      };
    }
    const n = Math.min(
      Number(lutPack.rSensorLUT.length || 0),
      Number(lutPack.transLUT.length || 0),
      Number(lutPack.naturalLUT.length || 0)
    );
    if (n < 4) {
      return {
        valid: false,
        diameterMm: 0,
        radiusMm: 0,
        thresholdRel: Number(cfg?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35),
        relAtCutoff: 0,
        samples: [],
      };
    }

    const radialMm = new Array(n);
    const gainCurve = new Array(n);
    const samples = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = Number(lutPack.rSensorLUT[i] || 0);
      const trans = clamp(Number(lutPack.transLUT[i] || 0), 0, 1);
      const natural = clamp(Number(lutPack.naturalLUT[i] || 0), 0, 1);
      const gain = clamp(trans * natural, 0, 1);
      radialMm[i] = Math.max(0, r);
      gainCurve[i] = gain;
      samples[i] = { rMm: radialMm[i], gain };
    }

    const uc = computeUsableCircleFromRadialCurve(radialMm, gainCurve, {
      ...SOFT_IC_CFG,
      ...(cfg || {}),
      minSamplesForCurve: Math.max(4, Number(cfg?.minSamplesForCurve || 6) | 0),
      smoothingHalfWindow: Math.max(0, Number(cfg?.smoothingHalfWindow ?? 1) | 0),
    });

    return {
      valid: !!uc?.valid,
      diameterMm: Number.isFinite(uc?.diameterMm) ? Math.max(0, Number(uc.diameterMm)) : 0,
      radiusMm: Number.isFinite(uc?.radiusMm) ? Math.max(0, Number(uc.radiusMm)) : 0,
      thresholdRel: Number.isFinite(uc?.thresholdRel)
        ? Number(uc.thresholdRel)
        : Number(cfg?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35),
      relAtCutoff: Number.isFinite(uc?.relAtCutoff) ? Number(uc.relAtCutoff) : 0,
      samples,
    };
  }

  function formatLutDistortionBadgeText(distMetrics, compact = false) {
    if (!distMetrics || !Number.isFinite(distMetrics.distPctAt70)) {
      return compact ? "DIST@0.7D — • RMS —" : "DIST @0.7D: — • RMS: —";
    }
    const d70 = Number(distMetrics.distPctAt70).toFixed(2);
    const rms = Number.isFinite(distMetrics.rmsDistPct) ? Number(distMetrics.rmsDistPct).toFixed(2) : "—";
    const flavor = String(distMetrics?.flavor || "neutral");
    const tail = (flavor === "barrel" || flavor === "pincushion") ? ` • ${flavor}` : "";
    return compact
      ? `DIST@0.7D ${d70}% • RMS ${rms}%${tail}`
      : `DIST @0.7D: ${d70}% • RMS: ${rms}%${tail}`;
  }

  function traceBundleAtFieldForSoftIc(surfaces, fieldDeg, wavePreset, sensorX, raysPerBundle) {
    const rays = buildRays(surfaces, fieldDeg, raysPerBundle);
    const total = rays.length;
    const rChief = chiefRadiusAtFieldDeg(surfaces, fieldDeg, wavePreset, sensorX);
    const bandMm = Math.max(0.05, Number(SOFT_IC_CFG.localBandMm || 1.0));
    if (total < 3) {
      return {
        total,
        good: 0,
        goodFrac: 0,
        localGood: 0,
        localFrac: 0,
        mountClipped: 0,
        mountFrac: 1,
        rMm: null,
        rChief: Number.isFinite(rChief) ? rChief : null,
        yHits: [],
        valid: false,
      };
    }

    let good = 0;
    let localGood = 0;
    let mountClipped = 0;
    const yHits = [];

    for (const ray of rays) {
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      if (!tr || tr.tir || !tr.endRay) continue;
      if (tr.clippedByMount) mountClipped++;
      if (tr.vignetted) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (!Number.isFinite(y)) continue;
      good++;
      const absY = Math.abs(y);
      yHits.push(absY);
      if (Number.isFinite(rChief) && Math.abs(absY - rChief) <= bandMm) localGood++;
    }

    const rMm = Number.isFinite(rChief) ? rChief : null;
    return {
      total,
      good,
      goodFrac: good / Math.max(1, total),
      localGood,
      localFrac: localGood / Math.max(1, total),
      mountClipped,
      mountFrac: mountClipped / Math.max(1, total),
      rMm: Number.isFinite(rMm) ? rMm : null,
      rChief: Number.isFinite(rChief) ? rChief : null,
      yHits,
      valid: true,
    };
  }

  function estimateUsableCircleFastProxy(
    surfaces,
    sensorW,
    sensorH,
    wavePreset,
    rayCount,
    cfgOverride = null
  ) {
    const cfg = { ...SOFT_IC_CFG, ...(cfgOverride || {}) };
    const sensorX = 0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const raysPerBundle = Math.max(7, Math.min(21, Number(rayCount || 15) | 0));
    const stepDeg = Math.max(0.5, Number(cfg.thetaStepDeg || 2.0));
    const maxFieldDeg = Math.max(stepDeg, Number(cfg.maxFieldDeg || 42));
    const eps = Math.max(1e-6, Number(cfg.eps || 1e-6));

    const centerPack = traceBundleAtFieldForSoftIc(surfaces, 0, wavePreset, sensorX, raysPerBundle);
    const centerGood = Math.max(eps, Number(centerPack.goodFrac || 0));
    if (!(centerGood > eps)) {
      return {
        softICmm: 0,
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        centerGoodFrac: 0,
        samples: [],
      };
    }

    const radial = [];
    const gain = [];
    let beyondRun = 0;

    for (let th = 0; th <= maxFieldDeg + 1e-9; th += stepDeg) {
      const pack = th <= 1e-9
        ? centerPack
        : traceBundleAtFieldForSoftIc(surfaces, th, wavePreset, sensorX, raysPerBundle);
      if (!pack?.valid) continue;
      const rMm = Number(pack.rChief);
      if (!Number.isFinite(rMm)) continue;
      const natural = naturalCos4AtSensorRadius(surfaces, sensorX, rMm);
      radial.push(Math.max(0, rMm));
      gain.push(clamp(Number(pack.goodFrac || 0) * natural, 0, 1));
      if (rMm > halfDiag + 1.2) beyondRun++;
      else beyondRun = 0;
      if (beyondRun >= 2 && gain[gain.length - 1] < centerGood * 0.4) break;
    }

    if (radial.length < 4) {
      return {
        softICmm: 0,
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        centerGoodFrac: centerGood,
        samples: [],
      };
    }

    const uc = computeUsableCircleFromRadialCurve(radial, gain, {
      ...cfg,
      minSamplesForCurve: 4,
      smoothingHalfWindow: Math.min(1, Number(cfg.smoothingHalfWindow || 1) | 0),
    });

    const rEdge = uc.valid ? clamp(Number(uc.radiusMm || 0), 0, halfDiag) : 0;
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;
    return {
      softICmm,
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      thresholdRel: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      centerGoodFrac: centerGood,
      samples: radial.map((rMm, i) => ({
        rMm,
        gain: gain[i],
      })),
    };
  }

  function computeUsableCircleFromRadialCurve(radialMm, gainCurve, cfg = SOFT_IC_CFG) {
    const minN = Math.max(3, Number(cfg.minSamplesForCurve || 8) | 0);
    const n = Math.min(radialMm?.length || 0, gainCurve?.length || 0);
    if (n < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    const pairs = [];
    for (let i = 0; i < n; i++) {
      const ri = Number(radialMm[i]);
      const gi = Number(gainCurve[i]);
      if (!Number.isFinite(ri) || !Number.isFinite(gi) || ri < 0) continue;
      pairs.push({ r: ri, g: Math.max(0, gi) });
    }
    if (pairs.length < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    pairs.sort((a, b) => a.r - b.r);
    const r = [];
    const g = [];
    for (const p of pairs) {
      if (r.length && p.r <= r[r.length - 1] + 1e-6) {
        // Conservative merge for near-duplicate radius samples.
        g[g.length - 1] = Math.min(g[g.length - 1], p.g);
        continue;
      }
      r.push(p.r);
      g.push(p.g);
    }
    if (r.length < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    const m = r.length;
    const halfWin = Math.max(0, Number(cfg.smoothingHalfWindow || 3) | 0);
    const smoothed = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = -halfWin; k <= halfWin; k++) {
        const j = i + k;
        if (j < 0 || j >= m) continue;
        sum += g[j];
        cnt++;
      }
      smoothed[i] = cnt ? (sum / cnt) : g[i];
    }

    const refN = Math.max(6, Math.min(m, Math.floor(m * 0.06)));
    let ref = 0;
    for (let i = 0; i < refN; i++) ref += smoothed[i];
    ref /= Math.max(1, refN);
    if (!(ref > Number(cfg.eps || 1e-6))) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: r,
        relCurve: Array.from({ length: m }, () => 0),
        smoothedCurve: Array.from(smoothed),
      };
    }

    const rel = new Float64Array(m);
    rel[0] = smoothed[0] / ref;
    for (let i = 1; i < m; i++) {
      const v = smoothed[i] / ref;
      // Match render-engine behavior: force monotone non-increasing falloff.
      rel[i] = Math.min(v, rel[i - 1]);
    }

    const thr = clamp(Number(cfg.thresholdRel || 0.35), Number(cfg.eps || 1e-6), 1);
    let cutR = r[m - 1];
    let relAtCut = rel[m - 1];

    if (rel[0] <= thr) {
      cutR = 0;
      relAtCut = rel[0];
    } else {
      for (let i = 1; i < m; i++) {
        if (rel[i] > thr) continue;
        const g0 = rel[i - 1];
        const g1 = rel[i];
        const r0 = r[i - 1];
        const r1 = r[i];
        const denom = (g1 - g0);
        const t = Math.abs(denom) > 1e-9 ? clamp((thr - g0) / denom, 0, 1) : 0;
        cutR = r0 + (r1 - r0) * t;
        relAtCut = g0 + (g1 - g0) * t;
        break;
      }
    }

    const valid = cutR > 0.1;
    return {
      valid,
      radiusMm: valid ? cutR : 0,
      diameterMm: valid ? (cutR * 2) : 0,
      thresholdRel: thr,
      relAtCutoff: valid ? relAtCut : 0,
      radialMm: r,
      relCurve: Array.from(rel),
      smoothedCurve: Array.from(smoothed),
    };
  }

  function estimateSoftImageCircleStandalone(surfaces, sensorW, sensorH, wavePreset, rayCount) {
    const cfg = SOFT_IC_CFG;
    const sensorX = 0.0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const work = clone(surfaces);

    const af = bestLensShiftForDesign(work, 0, rayCount, wavePreset);
    if (!af.ok) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: 0,
        samples: [],
        focusLensShift: 0,
        focusFailed: true,
        drasticDropRadiusMm: null,
      };
    }

    const lensShift = af.shift;
    computeVertices(work, lensShift, sensorX);

    const centerPack = traceBundleAtFieldForSoftIc(work, 0, wavePreset, sensorX, cfg.raysPerBundle);
    const centerLocalFrac = Math.max(cfg.eps, Number(centerPack.localFrac || 0));
    if (centerLocalFrac <= cfg.eps * 1.01) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: centerLocalFrac,
        centerLocalFrac,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const fieldSamples = [];
    let mapFailRun = 0;
    let beyondDiagRun = 0;

    const stepDeg = Math.max(0.1, Number(cfg.thetaStepDeg || 0.5));
    const maxFieldDeg = Math.max(stepDeg, Number(cfg.maxFieldDeg || 60));
    const minSamplesForBreak = Math.max(3, Number(cfg.minSamplesForBreak || 10) | 0);
    const maxConsecutiveMapFails = Math.max(2, Number(cfg.maxConsecutiveMapFails || 8) | 0);

    for (let thetaDeg = 0; thetaDeg <= maxFieldDeg + 1e-9; thetaDeg += stepDeg) {
      const pack = thetaDeg <= 1e-9
        ? centerPack
        : traceBundleAtFieldForSoftIc(work, thetaDeg, wavePreset, sensorX, cfg.raysPerBundle);
      if (!pack.valid) continue;
      const rMm = Number.isFinite(pack.rMm) ? pack.rMm : null;
      if (!Number.isFinite(rMm)) {
        mapFailRun++;
        if (fieldSamples.length >= minSamplesForBreak && mapFailRun >= maxConsecutiveMapFails) break;
        continue;
      }
      mapFailRun = 0;

      const goodFrac = clamp(pack.goodFrac, 0, 1);
      const localFrac = clamp(Number(pack.localFrac || 0), 0, 1);
      fieldSamples.push({
        rMm,
        thetaDeg,
        goodFrac,
        localFrac,
        rawRel: clamp(localFrac / centerLocalFrac, 0, 1),
        mountFrac: pack.mountFrac,
      });

      if (Number.isFinite(rMm) && rMm > halfDiag + Math.max(0.1, Number(cfg.diagMarginMm || 0))) {
        beyondDiagRun++;
      } else {
        beyondDiagRun = 0;
      }
      if (fieldSamples.length >= minSamplesForBreak && beyondDiagRun >= 2) break;
    }

    const ordered = fieldSamples
      .filter((s) => Number.isFinite(s.rMm))
      .sort((a, b) => a.rMm - b.rMm);
    if (!ordered.length) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: centerLocalFrac,
        centerLocalFrac,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const merged = [];
    for (const s of ordered) {
      const prev = merged[merged.length - 1];
      if (prev && s.rMm <= prev.rMm + 1e-6) {
        prev.goodFrac = Math.min(prev.goodFrac, s.goodFrac);
        prev.localFrac = Math.min(prev.localFrac, s.localFrac);
        prev.rawRel = Math.min(prev.rawRel, s.rawRel);
        prev.mountFrac = Math.max(prev.mountFrac, s.mountFrac);
        prev.thetaDeg = Math.max(prev.thetaDeg, s.thetaDeg);
        continue;
      }
      merged.push({ ...s });
    }

    if (!merged.length || merged[0].rMm > 1e-6) {
      merged.unshift({
        rMm: 0,
        thetaDeg: 0,
        goodFrac: Math.max(0, Number(centerPack.goodFrac || 0)),
        localFrac: centerLocalFrac,
        rawRel: 1,
        mountFrac: centerPack.mountFrac,
      });
    } else {
      merged[0].rMm = 0;
      merged[0].goodFrac = Math.max(merged[0].goodFrac, Number(centerPack.goodFrac || 0));
      merged[0].localFrac = Math.max(merged[0].localFrac, centerLocalFrac);
      merged[0].rawRel = 1;
    }

    const radialMm = merged.map((s) => s.rMm);
    const relCurveRaw = merged.map((s) => clamp(s.rawRel, 0, 1));
    const uc = computeUsableCircleFromRadialCurve(radialMm, relCurveRaw, cfg);

    const relCurve = (uc.relCurve?.length === merged.length) ? uc.relCurve : relCurveRaw;
    const thr = Number(uc.thresholdRel || cfg.thresholdRel || 0.35);
    const samples = merged.map((s, i) => {
      const relIllum = clamp(Number(relCurve[i] ?? s.rawRel), 0, 1);
      return {
        rMm: s.rMm,
        thetaDeg: s.thetaDeg,
        goodFrac: s.goodFrac,
        localFrac: s.localFrac,
        relRaw: s.rawRel,
        relIllum,
        stopsDown: relIllum > cfg.eps ? -Math.log2(relIllum) : Infinity,
        mountFrac: s.mountFrac,
        pass: relIllum >= thr,
      };
    });

    let drasticDropRadiusMm = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const dr = b.rMm - a.rMm;
      if (dr <= 1e-9) continue;
      const slope = (a.relIllum - b.relIllum) / dr;
      if (slope > cfg.drasticSlopePerMm) {
        drasticDropRadiusMm = b.rMm;
        break;
      }
    }

    let rEdge = uc.valid ? Number(uc.radiusMm || 0) : 0;
    rEdge = clamp(rEdge, 0, halfDiag);
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;

    return {
      softICmm,
      rEdge,
      relMin: thr, // alias for backward compatibility
      thresholdRel: thr,
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      relAtCutoff: Number(uc.relAtCutoff || 0),
      centerGoodFrac: centerLocalFrac,
      centerLocalFrac,
      samples,
      focusLensShift: lensShift,
      focusFailed: false,
      drasticDropRadiusMm,
    };
  }

  function getSoftIcForCurrentLens(surfaces, sensorW, sensorH, wavePreset, rayCount) {
    const keyObj = {
      wavePreset,
      rayCount,
      sensorW: Number(sensorW).toFixed(3),
      sensorH: Number(sensorH).toFixed(3),
      softCfg: {
        thresholdRel: Number(SOFT_IC_CFG.thresholdRel).toFixed(4),
        bgOverscan: Number(SOFT_IC_CFG.bgOverscan).toFixed(3),
        bgLutSamples: Number(SOFT_IC_CFG.bgLutSamples).toFixed(0),
        bgPupilSqrt: Number(SOFT_IC_CFG.bgPupilSqrt).toFixed(0),
        bgObjDistMm: Number(SOFT_IC_CFG.bgObjDistMm).toFixed(2),
        smoothingHalfWindow: Number(SOFT_IC_CFG.smoothingHalfWindow).toFixed(0),
      },
      surfaces: (surfaces || []).map((s) => ({
        type: String(s.type || ""),
        R: Number(s.R || 0).toFixed(6),
        t: Number(s.t || 0).toFixed(6),
        ap: Number(s.ap || 0).toFixed(6),
        glass: String(s.glass || "AIR"),
        stop: !!s.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _softIcCacheKey && _softIcCacheVal) return _softIcCacheVal;
    const val = estimateUsableCircleBackgroundLut(surfaces, sensorW, sensorH, wavePreset, rayCount);
    _softIcCacheKey = key;
    _softIcCacheVal = val;
    return val;
  }

  function distortionFlavorFromEdgePct(edgePct) {
    const v = Number(edgePct);
    if (!Number.isFinite(v)) return "unknown";
    if (v <= -0.05) return "barrel";
    if (v >= 0.05) return "pincushion";
    return "neutral";
  }

  function measureDistortionChiefSamples(
    surfaces,
    wavePreset,
    sensorX,
    sensorW,
    sensorH,
    efl,
    mode = "d",
    fracs = null
  ) {
    const idealHalf = coverageHalfSizeMm(sensorW, sensorH, mode);
    if (!Number.isFinite(efl) || efl <= 1e-9 || !Number.isFinite(idealHalf) || idealHalf < 1e-9) return null;
    const fractions = Array.isArray(fracs) && fracs.length
      ? fracs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [0.25, 0.55, 0.85, 1.00];
    if (!fractions.length) return null;

    let sumSq = 0;
    let maxAbs = 0;
    let validSamples = 0;
    const samples = [];
    for (let i = 0; i < fractions.length; i++) {
      const frac = clamp(fractions[i], 1e-4, 1.25);
      const rIdeal = idealHalf * frac;
      if (!(Number.isFinite(rIdeal) && rIdeal > 1e-9)) continue;
      const thetaRad = Math.atan(rIdeal / efl);
      const thetaDeg = thetaRad * (180 / Math.PI);
      const chief = buildChiefRay(surfaces, thetaDeg);
      const tr = traceRayForward(clone(chief), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) {
        samples.push({
          frac,
          thetaDeg,
          rIdeal,
          rActual: null,
          distRel: null,
          distPct: null,
          ok: false,
        });
        continue;
      }
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (!Number.isFinite(y)) {
        samples.push({
          frac,
          thetaDeg,
          rIdeal,
          rActual: null,
          distRel: null,
          distPct: null,
          ok: false,
        });
        continue;
      }
      const rActual = Math.abs(y);
      const distRel = (rActual - rIdeal) / rIdeal;
      const distAbs = Math.abs(distRel);
      validSamples += 1;
      sumSq += distRel * distRel;
      if (distAbs > maxAbs) maxAbs = distAbs;
      samples.push({
        frac,
        thetaDeg,
        rIdeal,
        rActual,
        distRel,
        distPct: distRel * 100,
        ok: true,
      });
    }
    if (validSamples <= 0) return null;
    const rmsPct = Math.sqrt(sumSq / validSamples) * 100;
    const edgeSample = [...samples].reverse().find((s) => Number.isFinite(s?.distPct));
    const edgePct = Number.isFinite(edgeSample?.distPct) ? Number(edgeSample.distPct) : null;
    const sampleCount = fractions.length;
    const missingSamples = Math.max(0, sampleCount - validSamples);
    return {
      mode,
      sampleCount,
      validSamples,
      missingSamples,
      rmsPct,
      maxPct: maxAbs * 100,
      edgePct,
      flavor: distortionFlavorFromEdgePct(edgePct),
      samples,
    };
  }

  function getDistortionChiefStatsCached(
    surfaces,
    wavePreset,
    sensorX,
    sensorW,
    sensorH,
    efl,
    mode = "d",
    fracs = null
  ) {
    const fractions = Array.isArray(fracs) && fracs.length
      ? fracs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [0.25, 0.55, 0.85, 1.00];
    const keyObj = {
      wavePreset: String(wavePreset || "d"),
      sensorX: Number(sensorX || 0).toFixed(6),
      sensorW: Number(sensorW || 0).toFixed(4),
      sensorH: Number(sensorH || 0).toFixed(4),
      efl: Number(efl || 0).toFixed(6),
      mode: String(mode || "d"),
      fracs: fractions.map((x) => Number(x).toFixed(4)),
      surfaces: (surfaces || []).map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        vx: Number(s?.vx || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _distCacheKey) return _distCacheVal;
    const val = measureDistortionChiefSamples(
      surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      mode,
      fractions
    );
    _distCacheKey = key;
    _distCacheVal = val;
    return val;
  }

  function estimateDistortionPct(surfaces, wavePreset, sensorX, sensorW, sensorH, efl, mode = "d") {
    const stats = getDistortionChiefStatsCached(
      surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      mode
    );
    return Number.isFinite(stats?.edgePct) ? Number(stats.edgePct) : null;
  }

  function formatDistortionBadgeText(stats, compact = false) {
    if (!stats || !Number.isFinite(stats?.rmsPct) || !Number.isFinite(stats?.maxPct)) {
      return compact ? "Dist RMS — • MAX —" : "Dist RMS: — • MAX: —";
    }
    const rmsTxt = `${Number(stats.rmsPct).toFixed(2)}%`;
    const maxTxt = `${Number(stats.maxPct).toFixed(2)}%`;
    const flavor = String(stats?.flavor || "neutral");
    const tail = (flavor === "barrel" || flavor === "pincushion") ? ` • ${flavor}` : "";
    return compact
      ? `Dist RMS ${rmsTxt} • MAX ${maxTxt}${tail}`
      : `Dist RMS: ${rmsTxt} • MAX: ${maxTxt}${tail}`;
  }

  function distortionWeightForStage(stage) {
    const st = Number(stage);
    if (st === 0) return Number(MERIT_CFG.distStageWeights?.[0] || 0);
    if (st === 1) return Number(MERIT_CFG.distStageWeights?.[1] || 0);
    if (st === 2) return Number(MERIT_CFG.distStageWeights?.[2] || 0);
    if (st >= 3) return Number(MERIT_CFG.distStageWeights?.[3] || 0);
    return 0;
  }

  function distortionWeightForPriority(pri) {
    if (!pri || !pri.feasible) return 0;
    let w = distortionWeightForStage(pri.stage);
    if (!pri.flInBand) {
      w = Math.min(w, Number(MERIT_CFG.distStageWeights?.[0] || 0));
    }
    if (pri.stage >= 3 && !pri.tGood) {
      // Keep distortion gentle until T is also within its good band.
      w = Math.min(w, Number(MERIT_CFG.distStageWeights?.[1] || w));
    }
    return Math.max(0, w);
  }

  function distortionPenaltyFromStats(stats, distWeight = 0) {
    const weight = Math.max(0, Number(distWeight || 0));
    if (weight <= 0) {
      return {
        weight,
        baseTerm: 0,
        penalty: 0,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm: 0,
      };
    }
    if (!stats) {
      const baseTerm = Math.max(0, Number(MERIT_CFG.distNoDataTerm || 0));
      return {
        weight,
        baseTerm,
        penalty: baseTerm * weight,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm: baseTerm,
      };
    }
    const rmsPct = Number(stats?.rmsPct);
    const maxPct = Number(stats?.maxPct);
    const edgePct = Number(stats?.edgePct);
    const sampleCount = Math.max(1, Number(stats?.sampleCount || 1));
    const validSamples = Math.max(0, Number(stats?.validSamples || 0));
    const missingSamples = Math.max(0, sampleCount - validSamples);
    const missFrac = clamp(missingSamples / sampleCount, 0, 1);
    const missingTerm = Number(MERIT_CFG.distMissingWeight || 0) * (missFrac * missFrac);

    if (!Number.isFinite(rmsPct) || !Number.isFinite(maxPct)) {
      const noDataTerm = Math.max(0, Number(MERIT_CFG.distNoDataTerm || 0));
      const baseTerm = noDataTerm + missingTerm;
      return {
        weight,
        baseTerm,
        penalty: baseTerm * weight,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm,
      };
    }

    const rmsNorm = Math.max(1e-6, Number(MERIT_CFG.distNormPct || 1.0));
    const maxNorm = Math.max(1e-6, Number(MERIT_CFG.distMaxNormPct || 1.5));
    const edgeNorm = Math.max(1e-6, Number(MERIT_CFG.distEdgeNormPct || maxNorm));
    const rmsTerm = Math.pow(rmsPct / rmsNorm, 2);
    const maxTerm = 0.5 * Math.pow(maxPct / maxNorm, 2);
    const edgeTerm = Number.isFinite(edgePct)
      ? 0.35 * Math.pow(Math.abs(edgePct) / edgeNorm, 2)
      : 0;
    const baseTerm = rmsTerm + maxTerm + edgeTerm + missingTerm;
    return {
      weight,
      baseTerm,
      penalty: baseTerm * weight,
      rmsTerm,
      maxTerm,
      edgeTerm,
      missingTerm,
    };
  }

  function realismCoverageNeedMm(targets = {}) {
    const targetIC = Math.max(0, Number(targets?.targetIC || 0));
    const sensorW = Math.max(0, Number(targets?.sensorW || 0));
    const sensorH = Math.max(0, Number(targets?.sensorH || 0));
    const sensorDiag = Math.hypot(sensorW, sensorH);
    return Math.max(targetIC, sensorDiag);
  }

  function realismProfileForTargets(targets = {}) {
    const needMm = realismCoverageNeedMm(targets);
    const largeStart = Math.max(1, Number(REALISM_CFG.largeIcThresholdMm || 44));
    const largeEnd = Math.max(largeStart + 1, Number(REALISM_CFG.largeIcFullReliefMm || 65));
    const largeT = clamp((needMm - largeStart) / (largeEnd - largeStart), 0, 1);
    const largeSensor = needMm >= largeStart - 1e-6;
    const preset = largeSensor
      ? REALISM_CFG.presets.cinePrimeLFMF
      : REALISM_CFG.presets.cinePrimeFF;
    return {
      needMm,
      largeSensor,
      largeT,
      relief: largeT * Math.max(0, Number(REALISM_CFG.largeSensorPenaltyReliefMax || 0)),
      preset,
    };
  }

  function mechanicalMarginForAperture(ap) {
    const apMm = Math.max(0, Number(ap || 0));
    const a0 = Math.max(0.1, Number(REALISM_CFG.mechMarginSmallApMm || 10));
    const a1 = Math.max(a0 + 0.1, Number(REALISM_CFG.mechMarginLargeApMm || 32));
    const m0 = Math.max(0.1, Number(REALISM_CFG.mechMarginSmall || 3));
    const m1 = Math.max(m0, Number(REALISM_CFG.mechMarginLarge || 6));
    const t = clamp((apMm - a0) / (a1 - a0), 0, 1);
    return m0 + (m1 - m0) * t;
  }

  function computeMechanicalEnvelope(surfaces, targets = {}) {
    const profile = realismProfileForTargets(targets);
    const preset = profile.preset || REALISM_CFG.presets.cinePrimeFF;
    const points = [];
    for (let i = 0; i < (surfaces?.length || 0); i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      const ap = Math.max(0, Number(s?.ap || 0));
      const margin = mechanicalMarginForAperture(ap);
      const odRadius = ap + margin;
      const od = odRadius * 2;
      const vx = Number(s?.vx);
      points.push({
        i,
        vx: Number.isFinite(vx) ? vx : i,
        ap,
        margin,
        odRadius,
        od,
      });
    }
    if (!points.length) {
      const rearLimitR = Math.max(
        0.1,
        Number(MOUNT_TRACE_CFG.throatR || 27) - Math.max(
          Number(MOUNT_TRACE_CFG.clearanceMm || 0),
          Number(REALISM_CFG.rearMountClearanceMm || 0)
        )
      );
      const rearLimitOD = 2 * rearLimitR;
      return {
        profileKey: preset.key,
        profileLabel: preset.label,
        frontOD: 0,
        maxOD: 0,
        rearOD: 0,
        rearNearMountOD: 0,
        hasRearNearMountPoints: false,
        rearMountLimitOD: rearLimitOD,
        preferredFrontODMin: Number(preset.preferredFrontODMin || 0),
        preferredFrontODMax: Number(preset.preferredFrontODMax || 0),
        hardFrontOD: Number(preset.hardFrontOD || Infinity),
        preferredMaxOD: Number(preset.preferredMaxOD || 0),
        hardMaxOD: Number(preset.hardMaxOD || Infinity),
        overPreferred: {
          frontLowMm: 0,
          frontHighMm: 0,
          maxMm: 0,
          rearMountMm: 0,
          totalMm: 0,
        },
        overHard: {
          frontMm: 0,
          maxMm: 0,
          rearMountMm: 0,
          totalMm: 0,
        },
        hardInvalid: false,
        points,
      };
    }

    let front = points[0];
    let rear = points[0];
    let maxPt = points[0];
    for (const p of points) {
      if (p.vx < front.vx) front = p;
      if (p.vx > rear.vx) rear = p;
      if (p.od > maxPt.od) maxPt = p;
    }

    const plX = -PL_FFD;
    const rearDepth = Math.max(1, Number(REALISM_CFG.rearCheckDepthMm || 14));
    const rearNear = points.filter((p) => p.vx >= (plX - rearDepth));
    const hasRearNearMountPoints = rearNear.length > 0;
    const rearNearMountOD = rearNear.length
      ? Math.max(...rearNear.map((p) => p.od))
      : rear.od;

    const rearLimitR = Math.max(
      0.1,
      Number(MOUNT_TRACE_CFG.throatR || 27) - Math.max(
        Number(MOUNT_TRACE_CFG.clearanceMm || 0),
        Number(REALISM_CFG.rearMountClearanceMm || 0)
      )
    );
    const rearMountLimitOD = 2 * rearLimitR;

    const preferredFrontODMin = Number(preset.preferredFrontODMin || 0);
    const preferredFrontODMax = Number(preset.preferredFrontODMax || preferredFrontODMin);
    const hardFrontOD = Number(preset.hardFrontOD || Infinity);
    const preferredMaxOD = Number(preset.preferredMaxOD || preferredFrontODMax);
    const hardMaxOD = Number(preset.hardMaxOD || Infinity);

    const frontOD = front.od;
    const maxOD = maxPt.od;
    const rearOD = rear.od;

    const overPreferred = {
      frontLowMm: Math.max(0, preferredFrontODMin - frontOD),
      frontHighMm: Math.max(0, frontOD - preferredFrontODMax),
      maxMm: Math.max(0, maxOD - preferredMaxOD),
      rearMountMm: hasRearNearMountPoints ? Math.max(0, rearNearMountOD - rearMountLimitOD) : 0,
    };
    overPreferred.totalMm =
      overPreferred.frontLowMm +
      overPreferred.frontHighMm +
      overPreferred.maxMm +
      overPreferred.rearMountMm;

    const overHard = {
      frontMm: Math.max(0, frontOD - hardFrontOD),
      maxMm: Math.max(0, maxOD - hardMaxOD),
      rearMountMm: hasRearNearMountPoints ? Math.max(0, rearNearMountOD - rearMountLimitOD) : 0,
    };
    overHard.totalMm = overHard.frontMm + overHard.maxMm + overHard.rearMountMm;

    return {
      profileKey: preset.key,
      profileLabel: preset.label,
      frontOD,
      maxOD,
      rearOD,
      rearNearMountOD,
      hasRearNearMountPoints,
      rearMountLimitOD,
      preferredFrontODMin,
      preferredFrontODMax,
      hardFrontOD,
      preferredMaxOD,
      hardMaxOD,
      overPreferred,
      overHard,
      hardInvalid: overHard.totalMm > 1e-6,
      points,
    };
  }

  function evaluateRealismPenalty(surfaces, targets = {}) {
    const profile = realismProfileForTargets(targets);
    const env = computeMechanicalEnvelope(surfaces, targets);
    const reliefScale = 1 - Math.max(0, Number(profile.relief || 0));
    const apertureReliefScale = 1 - Math.max(0, Number(profile.relief || 0)) * 0.85;

    let odPenalty =
      Number(REALISM_CFG.odFrontLowWeight || 0) * Math.pow(env.overPreferred.frontLowMm, 2) +
      Number(REALISM_CFG.odFrontHighWeight || 0) * Math.pow(env.overPreferred.frontHighMm, 2) +
      Number(REALISM_CFG.odMaxWeight || 0) * Math.pow(env.overPreferred.maxMm, 2) +
      Number(REALISM_CFG.odRearMountWeight || 0) * Math.pow(env.overPreferred.rearMountMm, 2);
    odPenalty *= reliefScale;

    const hardOverMm = Math.max(0, Number(env.overHard?.totalMm || 0));
    if (hardOverMm > 0) {
      odPenalty += 120.0 * hardOverMm * hardOverMm;
    }

    let thicknessPenalty = 0;
    let radiusPenalty = 0;
    let edgePenalty = 0;
    let packagingPenalty = 0;
    let longGlassCount = 0;
    let longAirCount = 0;
    let isolatedSurfaceCount = 0;
    let groupCount = 0;
    let stopClearanceMinMm = Infinity;

    const lastSegIdx = (() => {
      for (let i = (surfaces?.length || 0) - 2; i >= 0; i--) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t !== "OBJ" && t !== "IMS") return i;
      }
      return -1;
    })();

    const refrFlags = [];
    for (let i = 0; i < (surfaces?.length || 0); i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        refrFlags.push(false);
        continue;
      }

      const prevName = i > 0 ? resolveGlassName(surfaces[i - 1]?.glass || "AIR") : "AIR";
      const nextName = resolveGlassName(s?.glass || "AIR");
      const prevMedium = String(prevName || "AIR").toUpperCase();
      const nextMedium = String(nextName || "AIR").toUpperCase();
      const isRefractive = prevMedium !== nextMedium;
      refrFlags.push(isRefractive);

      if (!isRefractive) continue;

      const absR = Math.abs(Number(s?.R || 0));
      const ap = Math.max(0.1, Number(s?.ap || 0));
      const prefR = Math.max(1, Number(REALISM_CFG.preferredRadiusMm || 13.5));
      if (absR < prefR) {
        const d = (prefR - Math.max(1e-6, absR)) / prefR;
        const apScale = Math.pow(clamp(ap / 12.0, 0.5, 3.2), 1.5);
        radiusPenalty += Number(REALISM_CFG.radiusSmallWeight || 0) * d * d * apScale;
      }

      const ratio = ap / Math.max(1e-6, absR);
      const steep = Math.max(0, ratio - Number(REALISM_CFG.preferredApOverR || 0.36));
      if (steep > 0) {
        const powP = Math.max(1.5, Number(REALISM_CFG.radiusDifficultyPower || 2.4));
        const apScale = Math.pow(clamp(ap / 14.0, 0.6, 3.8), 1.2);
        radiusPenalty += Number(REALISM_CFG.radiusDifficultyWeight || 0) * Math.pow(steep, powP) * apScale;
      }

      if (absR > 1e-9 && absR < Number(REALISM_CFG.nearPlaneRadiusMm || 1.2)) {
        const d = Number(REALISM_CFG.nearPlaneRadiusMm || 1.2) - absR;
        radiusPenalty += Number(REALISM_CFG.nearPlaneRadiusWeight || 0) * d * d;
      }

      const nBefore = Number(GLASS_DB[resolveGlassName(prevName)]?.nd || 1.0);
      const nAfter = Number(GLASS_DB[resolveGlassName(nextName)]?.nd || 1.0);
      if (absR > Number(REALISM_CFG.hugeRadiusMm || 1200)) {
        const approxPower = Math.abs((nAfter - nBefore) / Math.max(1e-6, absR));
        if (approxPower < Number(REALISM_CFG.hugeRadiusPowerTol || 8e-5)) {
          const d = (absR - Number(REALISM_CFG.hugeRadiusMm || 1200)) / Math.max(1, Number(REALISM_CFG.hugeRadiusMm || 1200));
          radiusPenalty += Number(REALISM_CFG.hugeRadiusWeight || 0) * d * d;
        }
      }
    }
    radiusPenalty *= apertureReliefScale;

    for (let i = 0; i < Math.max(0, (surfaces?.length || 0) - 1); i++) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];
      const tA = String(sA?.type || "").toUpperCase();
      const tB = String(sB?.type || "").toUpperCase();
      if (tA === "OBJ" || tA === "IMS" || tB === "OBJ" || tB === "IMS") continue;

      const mediumAfterA = String(resolveGlassName(sA?.glass || "AIR")).toUpperCase();
      const segT = Math.max(0, Number(sA?.t || 0));
      const isFinalImageGap = mediumAfterA === "AIR" && i === lastSegIdx;

      if (mediumAfterA === "AIR") {
        if (!isFinalImageGap) {
          if (segT > Number(REALISM_CFG.airGapRareStartMm || 10)) {
            const d = segT - Number(REALISM_CFG.airGapRareStartMm || 10);
            thicknessPenalty += Number(REALISM_CFG.airGapRareWeight || 0) * d * d;
            longAirCount++;
          }
          if (segT > Number(REALISM_CFG.airGapVeryRareMm || 12)) {
            const d = segT - Number(REALISM_CFG.airGapVeryRareMm || 12);
            thicknessPenalty += Number(REALISM_CFG.airGapVeryRareWeight || 0) * d * d;
          }
        }
      } else {
        if (segT > Number(REALISM_CFG.glassCtStrongStartMm || 18)) {
          const d = segT - Number(REALISM_CFG.glassCtStrongStartMm || 18);
          thicknessPenalty += Number(REALISM_CFG.glassCtStrongWeight || 0) * d * d;
          longGlassCount++;
        }
        if (segT > Number(REALISM_CFG.glassCtNearInvalidMm || 25)) {
          const d = segT - Number(REALISM_CFG.glassCtNearInvalidMm || 25);
          thicknessPenalty += Number(REALISM_CFG.glassCtNearInvalidWeight || 0) * d * d;
        }
      }

      if (mediumAfterA !== "AIR") {
        const apShared = Math.max(
          0.1,
          Math.min(
            Number(sA?.ap || 0),
            Number(sB?.ap || 0),
            maxApForSurface(sA),
            maxApForSurface(sB)
          )
        );
        const minGap = minGapBetweenSurfaces(sA, sB, apShared, 11);
        if (Number.isFinite(minGap)) {
          const robustNeed = Number(PHYS_CFG.minGlassCT || 0.35) + Number(REALISM_CFG.edgeRobustMarginMm || 0.22);
          if (minGap < robustNeed) {
            const d = robustNeed - minGap;
            edgePenalty += Number(REALISM_CFG.edgeRobustWeight || 0) * d * d;
          }
        }
      }
    }

    let inGroup = false;
    for (let i = 0; i < refrFlags.length; i++) {
      const here = !!refrFlags[i];
      if (here && !inGroup) {
        groupCount++;
        inGroup = true;
      } else if (!here) {
        inGroup = false;
      }

      if (!here) continue;
      const prev = i > 0 ? !!refrFlags[i - 1] : false;
      const next = i + 1 < refrFlags.length ? !!refrFlags[i + 1] : false;
      if (!prev && !next) isolatedSurfaceCount++;
    }

    if (isolatedSurfaceCount > 0) {
      packagingPenalty += Number(REALISM_CFG.packagingIsolatedWeight || 0) * isolatedSurfaceCount * isolatedSurfaceCount;
    }
    const preferredGroups = Math.max(1, Number(REALISM_CFG.preferredGroupCount || 4));
    if (groupCount > preferredGroups + 2) {
      const d = groupCount - (preferredGroups + 2);
      packagingPenalty += Number(REALISM_CFG.packagingManyGroupsWeight || 0) * d * d;
    }

    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const leftGap = stopIdx > 0 ? Math.max(0, Number(surfaces[stopIdx - 1]?.t || 0)) : Infinity;
      const rightGap = Math.max(0, Number(surfaces[stopIdx]?.t || 0));
      stopClearanceMinMm = Math.min(leftGap, rightGap);
      const stopMin = Number(REALISM_CFG.stopTooCloseMm || 0.30);
      if (Number.isFinite(stopClearanceMinMm) && stopClearanceMinMm < stopMin) {
        const d = stopMin - stopClearanceMinMm;
        packagingPenalty += Number(REALISM_CFG.stopTooCloseWeight || 0) * d * d;
      }
    }

    const basePenalty = odPenalty + thicknessPenalty + radiusPenalty + edgePenalty + packagingPenalty;
    return {
      penalty: basePenalty,
      hardInvalid: !!env.hardInvalid,
      hardOverMm,
      envelope: env,
      breakdown: {
        profileKey: env.profileKey,
        profileLabel: env.profileLabel,
        largeSensor: !!profile.largeSensor,
        relief: Number(profile.relief || 0),
        odPenalty,
        thicknessPenalty,
        radiusPenalty,
        edgePenalty,
        packagingPenalty,
        frontOD: Number(env.frontOD || 0),
        maxOD: Number(env.maxOD || 0),
        rearOD: Number(env.rearOD || 0),
        rearNearMountOD: Number(env.rearNearMountOD || 0),
        rearMountLimitOD: Number(env.rearMountLimitOD || 0),
        overPreferredMm: Number(env.overPreferred?.totalMm || 0),
        hardOverMm,
        isolatedSurfaceCount,
        groupCount,
        longGlassCount,
        longAirCount,
        stopClearanceMinMm: Number.isFinite(stopClearanceMinMm) ? stopClearanceMinMm : null,
      },
    };
  }

  function getRealismPenaltyCached(surfaces, targets = {}) {
    const t = targets || {};
    const keyObj = {
      targetIC: Number(t.targetIC || 0).toFixed(4),
      sensorW: Number(t.sensorW || 0).toFixed(4),
      sensorH: Number(t.sensorH || 0).toFixed(4),
      surfaces: (surfaces || []).map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        vx: Number(s?.vx || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _realismCacheKey && _realismCacheVal) return _realismCacheVal;
    const val = evaluateRealismPenalty(surfaces, t);
    _realismCacheKey = key;
    _realismCacheVal = val;
    return val;
  }

  function realismWeightForStage(stage) {
    const st = Number(stage);
    if (st === 0) return Number(REALISM_CFG.stageWeights?.[0] || 0);
    if (st === 1) return Number(REALISM_CFG.stageWeights?.[1] || 0);
    if (st === 2) return Number(REALISM_CFG.stageWeights?.[2] || 0);
    if (st >= 3) return Number(REALISM_CFG.stageWeights?.[3] || 0);
    return 0;
  }

  function realismWeightForPriority(pri, targets = {}) {
    if (!pri || !pri.feasible) return 0;
    let w = realismWeightForStage(pri.stage);
    if (!pri.flInBand) {
      w = Math.min(w, Number(REALISM_CFG.stageWeights?.[0] || w));
    }
    if (pri.stage >= 3 && !pri.tGood) {
      w = Math.min(w, Number(REALISM_CFG.stageWeights?.[1] || w));
    }
    const profile = realismProfileForTargets(targets);
    if (profile.largeSensor && pri.stage <= 2) {
      w *= Math.max(0.25, Number(REALISM_CFG.largeSensorStageRelief || 0.86));
    }
    return Math.max(0, w);
  }

  function realismPenaltyFromBase(realismBase, realismWeight = 0) {
    const weight = Math.max(0, Number(realismWeight || 0));
    const base = realismBase || { penalty: 0, hardInvalid: false, hardOverMm: 0, breakdown: {}, envelope: null };
    const basePenalty = Math.max(0, Number(base.penalty || 0));
    return {
      weight,
      basePenalty,
      penalty: basePenalty * weight,
      hardInvalid: !!base.hardInvalid,
      hardOverMm: Math.max(0, Number(base.hardOverMm || 0)),
      breakdown: base.breakdown || {},
      envelope: base.envelope || null,
    };
  }

  function formatEnvelopeBadgeText(envelope, compact = false) {
    if (!envelope || !Number.isFinite(envelope.frontOD) || !Number.isFinite(envelope.maxOD)) {
      return compact ? "OD F— • M—" : "Front OD: — • Max OD: —";
    }
    const f = Number(envelope.frontOD).toFixed(1);
    const m = Number(envelope.maxOD).toFixed(1);
    const rear = Number.isFinite(envelope.rearOD) ? Number(envelope.rearOD).toFixed(1) : "—";
    const hardTag = envelope.hardInvalid ? " ❌" : "";
    return compact
      ? `OD F${f} • M${m}${hardTag}`
      : `Front OD: ${f}mm • Max OD: ${m}mm • Rear OD: ${rear}mm${hardTag}`;
  }

  function formatRealismBadgeText(realismEval, compact = false) {
    const pen = Number(realismEval?.penalty);
    const base = Number(realismEval?.basePenalty);
    if (!Number.isFinite(pen) && !Number.isFinite(base)) {
      return compact ? "Realism —" : "Realism: —";
    }
    const b = realismEval?.breakdown || {};
    const od = Number(b.odPenalty || 0);
    const th = Number(b.thicknessPenalty || 0);
    const rr = Number(b.radiusPenalty || 0);
    const ed = Number(b.edgePenalty || 0);
    const pk = Number(b.packagingPenalty || 0);
    const hard = realismEval?.hardInvalid ? " • hard❌" : "";
    if (compact) {
      return `Realism ${Number.isFinite(pen) ? pen.toFixed(1) : "—"}${hard}`;
    }
    return `Realism: ${Number.isFinite(pen) ? pen.toFixed(1) : "—"} (OD ${od.toFixed(1)} • t ${th.toFixed(1)} • R ${rr.toFixed(1)} • edge ${ed.toFixed(1)} • pack ${pk.toFixed(1)}${Number.isFinite(base) ? ` • base ${base.toFixed(1)}` : ""}${hard})`;
  }

  function collectUiSnapshot() {
    return {
      sensorPreset: ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)",
      sensorW: ui.sensorW?.value || "",
      sensorH: ui.sensorH?.value || "",
      fieldAngle: ui.fieldAngle?.value || "0",
      rayCount: ui.rayCount?.value || "31",
      wavePreset: ui.wavePreset?.value || "d",
      sensorOffset: ui.sensorOffset?.value || "0",
      focusMode: ui.focusMode?.value || "cam",
      lensFocus: ui.lensFocus?.value || "0",
      renderScale: ui.renderScale?.value || "1.25",
      optTargetFL: ui.optTargetFL?.value || "75",
      optTargetT: ui.optTargetT?.value || "2.0",
      optTargetIC: ui.optTargetIC?.value || "0",
      optIters: ui.optIters?.value || "2000",
      distOptIters: ui.distOptIters?.value || "12000",
      optPop: ui.optPop?.value || "safe",
      optAutoApply: !!ui.optAutoApply?.checked,
      cockpitIters: ui.cockpitIters?.value || "2400",
      cockpitStep: ui.cockpitStep?.value || "0.06",
      cockpitSurfaceMode: ui.cockpitSurfaceMode?.value || "auto",
      cockpitSurfaceStart: ui.cockpitSurfaceStart?.value || "1",
      cockpitSurfaceEnd: ui.cockpitSurfaceEnd?.value || "10",
      cockpitStrictness: ui.cockpitStrictness?.value || "normal",
      cockpitMacroPasses: ui.cockpitMacroPasses?.value || "2",
      cockpitAnneal: !!ui.cockpitAnneal?.checked,
    };
  }

  function applyUiSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;
    const set = (el, v) => { if (el != null && v != null) el.value = String(v); };
    set(ui.sensorPreset, snap.sensorPreset);
    set(ui.sensorW, snap.sensorW);
    set(ui.sensorH, snap.sensorH);
    set(ui.fieldAngle, snap.fieldAngle);
    set(ui.rayCount, snap.rayCount);
    set(ui.wavePreset, snap.wavePreset);
    set(ui.sensorOffset, snap.sensorOffset);
    set(ui.focusMode, snap.focusMode);
    set(ui.lensFocus, snap.lensFocus);
    set(ui.renderScale, snap.renderScale);
    set(ui.optTargetFL, snap.optTargetFL);
    set(ui.optTargetT, snap.optTargetT);
    set(ui.optTargetIC, snap.optTargetIC);
    set(ui.optIters, snap.optIters);
    set(ui.distOptIters, snap.distOptIters);
    set(ui.optPop, snap.optPop);
    set(ui.cockpitIters, snap.cockpitIters);
    set(ui.cockpitStep, snap.cockpitStep);
    set(ui.cockpitSurfaceMode, snap.cockpitSurfaceMode);
    set(ui.cockpitSurfaceStart, snap.cockpitSurfaceStart);
    set(ui.cockpitSurfaceEnd, snap.cockpitSurfaceEnd);
    set(ui.cockpitStrictness, snap.cockpitStrictness);
    set(ui.cockpitMacroPasses, snap.cockpitMacroPasses);
    if (ui.optAutoApply && Object.prototype.hasOwnProperty.call(snap, "optAutoApply")) {
      ui.optAutoApply.checked = !!snap.optAutoApply;
    }
    if (ui.cockpitAnneal && Object.prototype.hasOwnProperty.call(snap, "cockpitAnneal")) {
      ui.cockpitAnneal.checked = !!snap.cockpitAnneal;
    }
    markCockpitStepLabel();
    syncCockpitRangeInputs();
  }

  let _autosaveTimer = 0;
  function saveAutosaveNow() {
    try {
      const payload = {
        savedAt: Date.now(),
        lens: sanitizeLens(lens),
        ui: collectUiSnapshot(),
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }
  function scheduleAutosave(ms = 320) {
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      _autosaveTimer = 0;
      saveAutosaveNow();
    }, ms);
  }
  function restoreAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload || !payload.lens) return false;
      applyUiSnapshot(payload.ui);
      lens = sanitizeLens(payload.lens);
      selectedIndex = 0;
      clampAllApertures(lens.surfaces);
      buildTable();
      applySensorToIMS();
      renderAll();
      toast("Autosave restored");
      return true;
    } catch (_) {
      return false;
    }
  }

  // -------------------- spot RMS + autofocus core --------------------
  function bundleStatsAtSensorX(traces, sensorX, sensorHalfMm = null) {
    const ys = [];
    let insideCount = 0;
    for (const tr of traces) {
      if (!tr || tr.vignetted || tr.tir) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) continue;
      ys.push(y);
      if (Number.isFinite(sensorHalfMm) && Math.abs(y) <= sensorHalfMm + SENSOR_CLIP_TOL_MM) {
        insideCount++;
      }
    }
    if (ys.length < 5) {
      return {
        rms: null,
        n: ys.length,
        insideFrac: Number.isFinite(sensorHalfMm) ? (insideCount / Math.max(1, traces.length)) : null,
        insideCount,
        maxAbsY: ys.length ? Math.max(...ys.map((v) => Math.abs(v))) : null,
      };
    }
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const rms = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
    return {
      rms,
      n: ys.length,
      insideFrac: Number.isFinite(sensorHalfMm) ? (insideCount / Math.max(1, traces.length)) : null,
      insideCount,
      maxAbsY: ys.length ? Math.max(...ys.map((v) => Math.abs(v))) : null,
    };
  }

  function spotRmsAtSensorX(traces, sensorX) {
    const st = bundleStatsAtSensorX(traces, sensorX, null);
    return { rms: st.rms, n: st.n };
  }

  function bestLensShiftForDesign(surfaces, fieldAngle, rayCount, wavePreset, opts = null) {
    const o = opts || {};
    const sensorX = 0.0;
    const x0 = Number.isFinite(o.centerShift) ? Number(o.centerShift) : 0;
    const range = Math.max(0.4, Number.isFinite(o.coarseHalfRange) ? Number(o.coarseHalfRange) : 22);
    const coarseStep = Math.max(0.02, Number.isFinite(o.coarseStep) ? Number(o.coarseStep) : 0.35);
    const fineHalfRange = Math.max(0.08, Number.isFinite(o.fineHalfRange) ? Number(o.fineHalfRange) : 2.4);
    const fineStep = Math.max(0.02, Number.isFinite(o.fineStep) ? Number(o.fineStep) : 0.07);
    const afRayCount = Math.max(5, Math.min(61, Number.isFinite(o.rayCount) ? (Number(o.rayCount) | 0) : (rayCount | 0)));

    let best = { shift: x0, rms: Infinity, n: 0 };

    function evalShift(shift) {
      computeVertices(surfaces, shift, sensorX);
      const rays = buildRays(surfaces, fieldAngle, afRayCount);
      const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
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

    scan(x0, range, coarseStep);
    if (Number.isFinite(best.rms)) scan(best.shift, fineHalfRange, fineStep);
    if (!Number.isFinite(best.rms) || best.n < 5) return { shift: 0, ok: false, rms: null };
    return { shift: best.shift, ok: true, rms: best.rms };
  }

  function autoFocus() {
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";

    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = num(ui.rayCount?.value, 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const res = bestLensShiftForDesign(lens.surfaces, fieldAngle, rayCount, wavePreset);

    if (!res.ok) {
      if (ui.footerWarn) ui.footerWarn.textContent =
        "Auto focus (lens) failed (too few valid rays). Try more rays / larger apertures.";
      renderAll();
      return;
    }

    if (ui.lensFocus) ui.lensFocus.value = res.shift.toFixed(2);
    if (ui.footerWarn) ui.footerWarn.textContent =
      `Auto focus (LENS): lensFocus=${res.shift.toFixed(2)}mm • RMS=${res.rms.toFixed(3)}mm`;

    renderAll();
  }

  // -------------------- merit (v1) --------------------
  // Lower = better.
  const MERIT_CFG = {
    rmsNorm: 0.05,            // 0.05mm RMS = "ok" baseline
    vigWeight: 16.0,
    centerVigWeight: 180.0,
    midVigWeight: 60.0,
    intrusionWeight: 16.0,
    fieldWeights: [1.0, 1.5, 2.0],
    distSampleFracs: [0.25, 0.55, 0.85, 1.00], // chief-ray samples across image height/diag
    distNormPct: 0.55,        // RMS distortion normalization target
    distMaxNormPct: 0.95,     // MAX distortion normalization target
    distEdgeNormPct: 0.60,    // edge distortion normalization target
    distMissingWeight: 3.0,   // penalize missing/invalid chief samples
    distNoDataTerm: 30.0,     // heavy penalty when distortion cannot be measured
    distStageWeights: [0.08, 0.22, 0.55, 6.50], // stage 0..3
    distFastMeasureOnlyInFlBand: true, // keep fast-tier evals lightweight outside FL lock band
    crossPairWeight: 3200.0,  // no internal ray crossing in glass
    crossSegWeight: 900.0,

    // target terms (optimizer uses these)
    eflWeight: 0.35,          // penalty per mm error (squared)
    eflRelWeight: 6000.0,     // relative EFL penalty (dominant vs absolute mm)
    eflBarrierRel: 0.05,      // beyond 5% FL error, apply hard barrier
    eflBarrierWeight: 280000.0,
    tWeight: 10.0,            // penalty per too-slow T overshoot (squared)
    tBarrierAbs: 0.50,        // beyond +0.5 too-slow T overshoot, apply hard barrier
    tBarrierWeight: 5200.0,
    bflMin: 52.0,             // for PL: discourage too-short backfocus
    bflWeight: 6.0,
    lowValidPenalty: 450.0,
    hardInvalidPenalty: 1_000_000.0,
  };

  function internalCrossPenaltyFromStats(stats) {
    const pairs = Math.max(0, Number(stats?.crossPairs || 0));
    const segs = Math.max(0, Number(stats?.crossSegments || 0));
    if (pairs <= 0) return 0;
    const wPair = Math.max(0, Number(MERIT_CFG.crossPairWeight || 0));
    const wSeg = Math.max(0, Number(MERIT_CFG.crossSegWeight || 0));
    return (wPair * pairs * pairs) + (wSeg * segs * segs);
  }

  function traceBundleAtField(surfaces, fieldDeg, rayCount, wavePreset, sensorX, sensorHalfMm = null){
    const rays = buildRays(surfaces, fieldDeg, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;
    const st = bundleStatsAtSensorX(traces, sensorX, sensorHalfMm);
    return {
      traces,
      rms: st.rms,
      n: st.n,
      vigFrac,
      vCount,
      insideFrac: st.insideFrac,
      insideCount: st.insideCount,
      maxAbsY: st.maxAbsY,
    };
  }

  function computeMeritV1({
    surfaces,
    wavePreset,
    sensorX,
    rayCount,
    fov,
    intrusion,
    efl, T, bfl,
    targetEfl = null,
    targetT = null,
    physPenalty = 0,
    hardInvalid = false,
    internalCrossPairs = 0,
    internalCrossSegments = 0,
    internalCrossPenalty = 0,
    distortionStats = null,
    distortionPenalty = 0,
    distortionWeight = 0,
    realismPenalty = 0,
    realismBasePenalty = 0,
    realismWeight = 0,
    realismHardInvalid = false,
    realismBreakdown = null,
    envelopeStats = null,
  }){
    const edge = Number.isFinite(fov?.dfov) ? clamp(fov.dfov * 0.5, 4, 60) : 15;
    const f0 = 0;
    const f1 = edge * 0.65;
    const f2 = edge * 0.95;

    const fields = [f0, f1, f2];
    const fieldWeights = MERIT_CFG.fieldWeights;

    let merit = 0;
    let rmsCenter = null, rmsEdge = null;
    let vigAvg = 0;
    let vigCenter = 1;
    let vigMid = 1;
    let validMin = 999;

    for (let k = 0; k < fields.length; k++){
      const fa = fields[k];
      const pack = traceBundleAtField(surfaces, fa, rayCount, wavePreset, sensorX);

      validMin = Math.min(validMin, pack.n || 0);
      vigAvg += pack.vigFrac / fields.length;

      const rms = Number.isFinite(pack.rms) ? pack.rms : 999;
      if (k === 0) rmsCenter = rms;
      if (k === fields.length - 1) rmsEdge = rms;
      if (k === 0) vigCenter = pack.vigFrac;
      if (k === 1) vigMid = pack.vigFrac;

      const rn = rms / MERIT_CFG.rmsNorm;
      merit += fieldWeights[k] * (rn * rn);
    }

    merit += MERIT_CFG.vigWeight * (vigAvg * vigAvg);
    merit += MERIT_CFG.centerVigWeight * (vigCenter * vigCenter);
    merit += MERIT_CFG.midVigWeight * (vigMid * vigMid);

    if (Number.isFinite(intrusion) && intrusion > 0){
      const x = intrusion / 1.0;
      merit += MERIT_CFG.intrusionWeight * (x * x);
    }

    // BFL soft-constraint (paraxial) – helps keep designs physically plausible
    if (Number.isFinite(bfl) && bfl < MERIT_CFG.bflMin){
      const d = (MERIT_CFG.bflMin - bfl);
      merit += MERIT_CFG.bflWeight * (d * d);
    }

    // Targets (optional)
    if (Number.isFinite(targetEfl) && targetEfl > 1e-9 && Number.isFinite(efl)){
      const d = (efl - targetEfl);
      const dRel = Math.abs(d) / targetEfl;
      merit += MERIT_CFG.eflWeight * (d * d);
      merit += MERIT_CFG.eflRelWeight * (dRel * dRel);
      if (dRel > MERIT_CFG.eflBarrierRel) {
        const x = dRel - MERIT_CFG.eflBarrierRel;
        merit += MERIT_CFG.eflBarrierWeight * (x * x);
      }
    }
    if (Number.isFinite(targetT) && Number.isFinite(T)){
      // Target T is treated as a maximum allowed value.
      // Faster lens (smaller T) is acceptable; only too-slow T is penalized.
      const dSlow = Math.max(0, T - targetT);
      merit += MERIT_CFG.tWeight * (dSlow * dSlow);
      if (dSlow > MERIT_CFG.tBarrierAbs) {
        const x = dSlow - MERIT_CFG.tBarrierAbs;
        merit += MERIT_CFG.tBarrierWeight * (x * x);
      }
    }

    const minValidTarget = Math.max(7, Math.floor(rayCount * 0.45));
    if (validMin < minValidTarget) {
      const d = (minValidTarget - validMin);
      merit += MERIT_CFG.lowValidPenalty + 32.0 * d * d;
    }

    if (Number.isFinite(physPenalty) && physPenalty > 0) merit += physPenalty;
    if (Number.isFinite(internalCrossPenalty) && internalCrossPenalty > 0) merit += internalCrossPenalty;
    if (hardInvalid) merit += MERIT_CFG.hardInvalidPenalty;
    if (Number.isFinite(distortionPenalty) && distortionPenalty > 0) merit += distortionPenalty;
    if (Number.isFinite(realismPenalty) && realismPenalty > 0) merit += realismPenalty;

    const breakdown = {
      rmsCenter, rmsEdge,
      vigPct: Math.round(vigAvg * 100),
      intrusion: Number.isFinite(intrusion) ? intrusion : null,
      fields: fields.map(v => Number.isFinite(v) ? v : 0),
      vigCenterPct: Math.round(vigCenter * 100),
      vigMidPct: Math.round(vigMid * 100),
      physPenalty: Number.isFinite(physPenalty) ? physPenalty : 0,
      hardInvalid: !!hardInvalid,
      internalCrossPairs: Math.max(0, Number(internalCrossPairs || 0)),
      internalCrossSegments: Math.max(0, Number(internalCrossSegments || 0)),
      internalCrossPenalty: Number.isFinite(internalCrossPenalty) ? Number(internalCrossPenalty) : 0,
      distRmsPct: Number.isFinite(distortionStats?.rmsPct) ? Number(distortionStats.rmsPct) : null,
      distMaxPct: Number.isFinite(distortionStats?.maxPct) ? Number(distortionStats.maxPct) : null,
      distEdgePct: Number.isFinite(distortionStats?.edgePct) ? Number(distortionStats.edgePct) : null,
      distFlavor: String(distortionStats?.flavor || "unknown"),
      distPenalty: Number.isFinite(distortionPenalty) ? Number(distortionPenalty) : 0,
      distWeight: Number.isFinite(distortionWeight) ? Number(distortionWeight) : 0,
      distSampleCount: Number.isFinite(distortionStats?.sampleCount) ? Number(distortionStats.sampleCount) : 0,
      distValidSamples: Number.isFinite(distortionStats?.validSamples) ? Number(distortionStats.validSamples) : 0,
      frontOD: Number.isFinite(envelopeStats?.frontOD) ? Number(envelopeStats.frontOD) : null,
      maxOD: Number.isFinite(envelopeStats?.maxOD) ? Number(envelopeStats.maxOD) : null,
      rearOD: Number.isFinite(envelopeStats?.rearOD) ? Number(envelopeStats.rearOD) : null,
      realismPenalty: Number.isFinite(realismPenalty) ? Number(realismPenalty) : 0,
      realismBasePenalty: Number.isFinite(realismBasePenalty) ? Number(realismBasePenalty) : 0,
      realismWeight: Number.isFinite(realismWeight) ? Number(realismWeight) : 0,
      realismHardInvalid: !!realismHardInvalid,
      realismHardOverMm: Number.isFinite(realismBreakdown?.hardOverMm)
        ? Number(realismBreakdown.hardOverMm)
        : Number.isFinite(envelopeStats?.overHard?.totalMm) ? Number(envelopeStats.overHard.totalMm) : 0,
      realismOdPenalty: Number.isFinite(realismBreakdown?.odPenalty) ? Number(realismBreakdown.odPenalty) : 0,
      realismThicknessPenalty: Number.isFinite(realismBreakdown?.thicknessPenalty) ? Number(realismBreakdown.thicknessPenalty) : 0,
      realismRadiusPenalty: Number.isFinite(realismBreakdown?.radiusPenalty) ? Number(realismBreakdown.radiusPenalty) : 0,
      realismEdgePenalty: Number.isFinite(realismBreakdown?.edgePenalty) ? Number(realismBreakdown.edgePenalty) : 0,
      realismPackagingPenalty: Number.isFinite(realismBreakdown?.packagingPenalty) ? Number(realismBreakdown.packagingPenalty) : 0,
      realismProfileLabel: String(realismBreakdown?.profileLabel || envelopeStats?.profileLabel || ""),
      realismLargeSensor: !!realismBreakdown?.largeSensor,
    };

    return { merit, breakdown };
  }

  // -------------------- drawing --------------------
  let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

  function drawBackgroundCSS(w, h) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.08;
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

  function worldToScreen(p, world) {
    const { cx, cy, s } = world;
    return { x: cx + p.x * s, y: cy - p.y * s };
  }

  function makeWorldTransform() {
    if (!canvas) return { cx: 0, cy: 0, s: 1 };
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2 + view.panX;
    const cy = r.height / 2 + view.panY;
    const base = num(ui.renderScale?.value, 1.25) * 3.2;
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
    const back  = buildSurfacePolyline(sBack,  apRegion, 90);
    if (front.length < 2 || back.length < 2) return;

    const poly = front.concat(back.slice().reverse());

    ctx.save();
    ctx.fillStyle = "rgba(120,180,255,0.10)";
    ctx.beginPath();
    let p0 = worldToScreen(poly[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < poly.length; i++) {
      const p = worldToScreen(poly[i], world);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(220,235,255,0.55)";
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
    ctx.strokeStyle = "rgba(255,255,255,.22)";

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

    const R = Number(s.R || 0);
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

    const throatR = Number.isFinite(opts.throatR) ? opts.throatR : MOUNT_TRACE_CFG.throatR;
    const outerR  = Number.isFinite(opts.outerR)  ? opts.outerR  : 31;
    const camDepth= Number.isFinite(opts.camDepth)? opts.camDepth: MOUNT_TRACE_CFG.camDepth;
    const lensLip = Number.isFinite(opts.lensLip) ? opts.lensLip : MOUNT_TRACE_CFG.lensLip;
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
      if (ctx.measureText(test).width <= maxW) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = p;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && cur) lines.push(cur);

    if (lines.length === maxLines && parts.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + " …").width > maxW && last.length > 0) last = last.slice(0, -1);
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

  // -------------------- render scheduler --------------------
  let _rafAll = 0;
  function scheduleRenderAll() {
    if (_rafAll) return;
    _rafAll = requestAnimationFrame(() => {
      _rafAll = 0;
      renderAll();
    });
  }

  // ===========================
  // RENDER ALL
  // ===========================
  function renderAll() {
    if (!canvas || !ctx) return;
    if (ui.footerWarn) ui.footerWarn.textContent = "";

    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount   = num(ui.rayCount?.value, 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? num(ui.sensorOffset?.value, 0) : 0.0;
    const lensShift = (focusMode === "lens") ? num(ui.lensFocus?.value, 0) : 0;

    computeVertices(lens.surfaces, lensShift, sensorX);

    const plX = -PL_FFD;

    const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));
    const rayCross = detectInternalRayCrossings(traces, lens.surfaces, wavePreset);
    const crossPenalty = internalCrossPenaltyFromStats(rayCross);

    const vCount = traces.filter((t) => t.vignetted).length;
    const tirCount = traces.filter((t) => t.tir).length;
    const vigPct = traces.length ? Math.round((vCount / traces.length) * 100) : 0;

    const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    const Tgeom = estimateTStopApprox(efl, lens.surfaces);
    const centerTp = measureCenterThroughput(lens.surfaces, wavePreset, sensorX, Math.max(31, rayCount | 0));
    const T = estimateEffectiveT(Tgeom, centerTp.goodFrac);
    const tLoss = tLossStops(T, Tgeom);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const fovTxt = !fov
      ? "FOV: —"
      : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

    const softIc = getSoftIcForCurrentLens(lens.surfaces, sensorW, sensorH, wavePreset, rayCount);
    const icDiameterMm = Number(
      softIc?.usableCircleDiameterMm ?? softIc?.softICmm ?? 0
    );
    const softIcValid = Number.isFinite(icDiameterMm) && icDiameterMm > 0.1;
    const softIcTxt = softIcValid ? `IC: Ø${icDiameterMm.toFixed(1)}mm` : "IC: —";
    const softIcDetailTxt = softIcValid
      ? `Image Circle: Ø${icDiameterMm.toFixed(1)}mm (IC${Math.round(Number(softIc?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35) * 100)}%)`
      : "Image Circle: —";

    const rearVx = lastPhysicalVertexX(lens.surfaces);
    const intrusion = rearVx - plX;
    const phys = evaluatePhysicalConstraints(lens.surfaces);
    const physPenaltyBase = Number(phys.penalty || 0);
    const targetEflUi = num(ui.optTargetFL?.value, NaN);
    const targetTUi = num(ui.optTargetT?.value, NaN);
    const targetICUi = Math.max(0, num(ui.optTargetIC?.value, 0));
    const realismBase = getRealismPenaltyCached(
      lens.surfaces,
      {
        targetIC: targetICUi,
        sensorW,
        sensorH,
      }
    );
    const distStats = getDistortionChiefStatsCached(
      lens.surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      "d",
      MERIT_CFG.distSampleFracs
    );
    const previewPri = buildOptPriority(
      {
        score: 0,
        efl,
        T,
        softIcMm: softIcValid ? icDiameterMm : 0,
        intrusion,
        hardInvalid: !!phys.hardFail || !!rayCross.invalid || !!realismBase?.hardInvalid,
        physPenalty: physPenaltyBase,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
        realismPenalty: Number(realismBase?.penalty || 0),
        realismHardInvalid: !!realismBase?.hardInvalid,
        realismHardOverMm: Number(realismBase?.hardOverMm || 0),
        frontOD: Number(realismBase?.envelope?.frontOD || 0),
        maxOD: Number(realismBase?.envelope?.maxOD || 0),
        rearOD: Number(realismBase?.envelope?.rearOD || 0),
      },
      {
        targetEfl: targetEflUi,
        targetIC: targetICUi,
        targetT: targetTUi,
      }
    );
    const distWeight = distortionWeightForPriority(previewPri);
    const distPenaltyRes = distortionPenaltyFromStats(distStats, distWeight);
    const chiefDistBadgeTopText = formatDistortionBadgeText(distStats, true);
    const lutDistMetrics = getLutDistortionMetricsCached({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      lensShift,
      objDist: DIST_OPT_CFG.objDistMm,
      lutN: DIST_OPT_CFG.lutNBadge,
      lutPupilSqrt: DIST_OPT_CFG.lutPupilSqrtBadge,
      doCA: false,
      sensorW,
      sensorH,
      efl,
      sampleFracs: DIST_OPT_CFG.sampleFracs,
    });
    const distBadgeText = formatLutDistortionBadgeText(lutDistMetrics, false);
    const distBadgeTopText = formatLutDistortionBadgeText(lutDistMetrics, true);
    const sharpBadgeEval = getSharpnessBadgeCached({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      lensShift,
      rayCount: clamp(rayCount | 0, 15, 31),
      sensorW,
      sensorH,
    });
    const sharpBadgeText = formatSharpnessBadgeText(sharpBadgeEval, false);
    const sharpBadgeTopText = formatSharpnessBadgeText(sharpBadgeEval, true);
    const realismWeight = realismWeightForPriority(
      previewPri,
      {
        targetIC: targetICUi,
        sensorW,
        sensorH,
      }
    );
    const realismPenaltyRes = realismPenaltyFromBase(realismBase, realismWeight);
    const odBadgeText = formatEnvelopeBadgeText(realismPenaltyRes.envelope, false);
    const odBadgeTopText = formatEnvelopeBadgeText(realismPenaltyRes.envelope, true);
    const realismBadgeText = formatRealismBadgeText(realismPenaltyRes, false);
    const realismBadgeTopText = formatRealismBadgeText(realismPenaltyRes, true);

    const meritRes = computeMeritV1({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      rayCount,
      fov,
      intrusion,
      efl, T, bfl,
      targetEfl: targetEflUi,
      targetT: targetTUi,
      physPenalty: physPenaltyBase,
      hardInvalid: !!phys.hardFail || !!rayCross.invalid || !!realismPenaltyRes.hardInvalid,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      internalCrossPenalty: crossPenalty,
      distortionStats: distStats,
      distortionPenalty: distPenaltyRes.penalty,
      distortionWeight: distPenaltyRes.weight,
      realismPenalty: realismPenaltyRes.penalty,
      realismBasePenalty: realismPenaltyRes.basePenalty,
      realismWeight: realismPenaltyRes.weight,
      realismHardInvalid: realismPenaltyRes.hardInvalid,
      realismBreakdown: realismPenaltyRes.breakdown,
      envelopeStats: realismPenaltyRes.envelope,
    });

    const m = meritRes.merit;
    const bd = meritRes.breakdown;

    const meritTxt =
      `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"} ` +
      `(RMS0 ${bd.rmsCenter?.toFixed?.(3) ?? "—"}mm • RMSedge ${bd.rmsEdge?.toFixed?.(3) ?? "—"}mm • Vig ${bd.vigPct}%` +
      `${Number.isFinite(bd.vigCenterPct) ? ` • V0 ${bd.vigCenterPct}%` : ""}` +
      `${Number.isFinite(bd.vigMidPct) ? ` • Vmid ${bd.vigMidPct}%` : ""}` +
      `${Number.isFinite(bd.distRmsPct) ? ` • DistRMS ${bd.distRmsPct.toFixed(2)}%` : ""}` +
      `${Number.isFinite(bd.distMaxPct) ? ` • DistMAX ${bd.distMaxPct.toFixed(2)}%` : ""}` +
      `${Number.isFinite(lutDistMetrics?.distPctAt70) ? ` • LUT@0.7D ${Number(lutDistMetrics.distPctAt70).toFixed(2)}%` : ""}` +
      `${Number.isFinite(lutDistMetrics?.rmsDistPct) ? ` • LUT RMS ${Number(lutDistMetrics.rmsDistPct).toFixed(2)}%` : ""}` +
      `${Number.isFinite(sharpBadgeEval?.centerRmsMm) ? ` • SharpC ${Number(sharpBadgeEval.centerRmsMm).toFixed(3)}mm` : ""}` +
      `${Number.isFinite(sharpBadgeEval?.edgeRmsMm) ? ` • SharpE ${Number(sharpBadgeEval.edgeRmsMm).toFixed(3)}mm` : ""}` +
      `${Number.isFinite(bd.frontOD) ? ` • FrontOD ${bd.frontOD.toFixed(1)}mm` : ""}` +
      `${Number.isFinite(bd.maxOD) ? ` • MaxOD ${bd.maxOD.toFixed(1)}mm` : ""}` +
      `${Number.isFinite(bd.realismPenalty) ? ` • Realism ${bd.realismPenalty.toFixed(1)}` : ""}` +
      `${Number(bd.internalCrossPairs || 0) > 0 ? ` • XOVER ${Number(bd.internalCrossPairs || 0)}` : ""}` +
      `${bd.intrusion != null && bd.intrusion > 0 ? ` • INTR +${bd.intrusion.toFixed(2)}mm` : ""}` +
      `${bd.physPenalty > 0 ? ` • PHYS +${bd.physPenalty.toFixed(1)}` : ""}` +
      `${bd.hardInvalid ? " • INVALID ❌" : ""})`;

    if (ui.merit) ui.merit.textContent = `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"}`;
    if (ui.meritTop) ui.meritTop.textContent = `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"}`;

    const rearTxt = (intrusion > 0)
      ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
      : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

    const frontVx = firstPhysicalVertexX(lens.surfaces);
    const lenToFlange = plX - frontVx;
    const totalLen = lenToFlange + PL_LENS_LIP;
    const lenTxt = (Number.isFinite(totalLen) && totalLen > 0)
      ? `LEN≈ ${totalLen.toFixed(1)}mm (front→PL + mount)`
      : `LEN≈ —`;

    if (ui.efl) ui.efl.textContent = `Focal Length: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstop) {
      ui.tstop.textContent = `T_eff≈ ${T == null ? "—" : "T" + T.toFixed(2)} (${Tgeom == null ? "geom —" : "geom T" + Tgeom.toFixed(2)})`;
    }
    if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
    if (ui.softIC) ui.softIC.textContent = softIcDetailTxt;
    if (ui.dist) ui.dist.textContent = distBadgeText;
    if (ui.sharp) ui.sharp.textContent = sharpBadgeText;
    if (ui.od) ui.od.textContent = odBadgeText;
    if (ui.realism) ui.realism.textContent = realismBadgeText;
    if (ui.fov) ui.fov.textContent = fovTxt;

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T_eff≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.softICTop) ui.softICTop.textContent = softIcTxt;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.distTop) ui.distTop.textContent = distBadgeTopText;
    if (ui.sharpTop) ui.sharpTop.textContent = sharpBadgeTopText;
    if (ui.odTop) ui.odTop.textContent = odBadgeTopText;
    if (ui.realismTop) ui.realismTop.textContent = realismBadgeTopText;

    if (phys.hardFail && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID geometry: overlap/clearance issue (overlap ${phys.worstOverlap.toFixed(2)}mm, pinch ${phys.worstPinch.toFixed(2)}mm).`;
    } else if (rayCross.invalid && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID optics: ${rayCross.crossPairs} ray crossings inside glass across ${rayCross.crossSegments} segment(s).`;
    } else if (realismPenaltyRes.hardInvalid && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID envelope: OD exceeds hard housing limits (${odBadgeTopText}).`;
    } else if (phys.airGapCount < PHYS_CFG.minAirGapsPreferred && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Few air gaps (${phys.airGapCount}); aim for >= ${PHYS_CFG.minAirGapsPreferred} for practical designs.`;
    } else if (centerTp.goodFrac < 0.85 && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Center throughput low (${(centerTp.goodFrac * 100).toFixed(0)}%): effective T is slower than geometric T.`;
    } else if (tirCount > 0 && ui.footerWarn) {
      ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;
    }

    if (ui.status) {
      ui.status.textContent =
        `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • xover ${rayCross.crossPairs} • ${softIcTxt} • ${meritTxt}`;
    }
    if (ui.metaInfo) {
      ui.metaInfo.textContent =
        `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm • ` +
        (softIcValid ? `IC ${icDiameterMm.toFixed(1)}mm` : "IC —") +
        ` • FrontOD ${Number.isFinite(realismPenaltyRes?.envelope?.frontOD) ? realismPenaltyRes.envelope.frontOD.toFixed(1) : "—"}mm` +
        ` • MaxOD ${Number.isFinite(realismPenaltyRes?.envelope?.maxOD) ? realismPenaltyRes.envelope.maxOD.toFixed(1) : "—"}mm`;
    }

    const cockpitFieldDeg = Number.isFinite(sharpBadgeEval?.maxFieldDeg)
      ? Number(sharpBadgeEval.maxFieldDeg)
      : Number.NaN;
    const reqFieldDeg = (Number.isFinite(efl) && efl > 1e-9)
      ? (Math.atan((0.5 * Math.hypot(sensorW, sensorH)) / efl) * 180 / Math.PI)
      : Number.NaN;
    const cockpitReasons = [];
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, Number(MERIT_CFG.bflMin || 52) - bfl) : Infinity;
    if (phys.hardFail) cockpitReasons.push("physics");
    if (rayCross.invalid) cockpitReasons.push("xover");
    if (!(intrusion <= Number(COCKPIT_CFG.plIntrusionRejectMm || 0.5))) cockpitReasons.push("pl");
    if (!(bflShortMm <= Number(COCKPIT_CFG.maxBflShortRejectMm || 1.0))) cockpitReasons.push("bfl");
    if (!Number.isFinite(T) || T <= 0) cockpitReasons.push("t");
    if (!Number.isFinite(efl) || efl <= 0) cockpitReasons.push("efl");
    const cockpitLive = {
      feasible: {
        ok: cockpitReasons.length === 0,
        reasons: cockpitReasons,
        plIntrusionMm: intrusion,
        overlapOk: !phys.hardFail && Number(phys.worstOverlap || 0) <= 1e-4,
        thicknessOk: !phys.hardFail && Number(phys.worstPinch || 0) <= 1e-4,
        stopOk: findStopSurfaceIndex(lens.surfaces) >= 0,
        validCenterFrac: clamp(1 - (vigPct / 100), 0, 1),
        bflShortMm,
      },
      efl,
      bfl,
      T,
      maxFieldDeg: cockpitFieldDeg,
      fovDeg: fov,
      coversGeom: Number.isFinite(cockpitFieldDeg) && Number.isFinite(reqFieldDeg) ? cockpitFieldDeg >= reqFieldDeg - 1e-3 : false,
      usableIC: {
        valid: softIcValid,
        diameterMm: softIcValid ? icDiameterMm : 0,
        radiusMm: softIcValid ? (icDiameterMm * 0.5) : 0,
        thresholdRel: Number(softIc?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35),
      },
      distortion: {
        dist70Pct: Number(lutDistMetrics?.distPctAt70),
        rmsPct: Number(lutDistMetrics?.rmsDistPct),
        samples: Array.isArray(lutDistMetrics?.samples) ? lutDistMetrics.samples : [],
      },
      sharpness: {
        rmsCenter: Number(sharpBadgeEval?.centerRmsMm),
        rmsEdge: Number(sharpBadgeEval?.edgeRmsMm),
        rmsByAngle: Array.isArray(sharpBadgeEval?.rmsByAngle) ? sharpBadgeEval.rmsByAngle : [],
      },
      context: {
        sensorW,
        sensorH,
        wavePreset,
        reqFieldDeg,
      },
    };
    updateCockpitMetricsTable(cockpitLive);

    resizeCanvasToCSS();
    const r = canvas.getBoundingClientRect();
    drawBackgroundCSS(r.width, r.height);

    const world = makeWorldTransform();
    drawAxes(world);

    drawPLFlange(world, plX);
    drawLens(world, lens.surfaces);
    drawStop(world, lens.surfaces);
    drawRays(world, traces, sensorX);
    drawPLMountCutout(world, plX);
    drawSensor(world, sensorX, halfH);

    const eflTxt = efl == null ? "—" : `${efl.toFixed(2)}mm`;
    const tTxt   = T == null ? "—" : `T_eff ${T.toFixed(2)}`;
    const tGeomTxt = Tgeom == null ? "—" : `T_geom ${Tgeom.toFixed(2)}`;
    const tpTxt = `Tp0 ${(centerTp.goodFrac * 100).toFixed(0)}%${Number.isFinite(tLoss) ? ` • +${tLoss.toFixed(2)}st` : ""}`;
    const focusTxt = (focusMode === "cam")
      ? `CamFocus ${sensorX.toFixed(2)}mm`
      : `LensFocus ${lensShift.toFixed(2)}mm`;
    const crossTxt = rayCross.crossPairs > 0
      ? `XOVER ${rayCross.crossPairs} ❌`
      : "XOVER 0";

    drawTitleOverlay([
      lens?.name || "Lens",
      `EFL ${eflTxt}`,
      `BFL ${bfl == null ? "—" : bfl.toFixed(2) + "mm"}`,
      tTxt,
      tGeomTxt,
      tpTxt,
      softIcTxt,
      crossTxt,
      distBadgeTopText,
      sharpBadgeTopText,
      chiefDistBadgeTopText,
      odBadgeTopText,
      realismBadgeTopText,
      fovTxt,
      rearTxt,
      lenTxt,
      focusTxt,
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

  // -------------------- editing actions --------------------
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
    lens = sanitizeLens(lens);
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function insertAfterSelected(surfaceObj) {
    const at = safeInsertAtAfterSelected();
    insertSurface(at, surfaceObj);
  }

  function addSurface() {
    insertAfterSelected({ type: "", R: 0.0, t: 4.0, ap: 18.0, glass: "AIR", stop: false });
  }

  function duplicateSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot duplicate OBJ/IMS");
    const s = clone(lens.surfaces[selectedIndex]);
    s.type = "";
    const at = safeInsertAtAfterSelected();
    insertSurface(at, s);
  }

  function moveSelected(delta) {
    clampSelected();
    const i = selectedIndex;
    const j = i + delta;
    if (j < 0 || j >= lens.surfaces.length) return;
    if (isProtectedIndex(i) || isProtectedIndex(j)) return toast("Cannot move OBJ/IMS");
    const a = lens.surfaces[i];
    lens.surfaces[i] = lens.surfaces[j];
    lens.surfaces[j] = a;
    selectedIndex = j;
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function removeSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot remove OBJ/IMS");
    lens.surfaces.splice(selectedIndex, 1);
    selectedIndex = Math.max(0, selectedIndex - 1);

    lens = sanitizeLens(lens);
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function newClearLens() {
    loadLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ",  R: 0.0, t: 0.0,  ap: 60.0, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0,  glass: "AIR", stop: true },
        { type: "IMS",  R: 0.0, t: 0.0,  ap: 12.77, glass: "AIR", stop: false },
      ],
    });
    toast("New / Clear");
  }

  // -------------------- element modal (+Element) --------------------
  function openElementModal() {
    if (!ui.elementModal) return;

    const opts = Object.keys(GLASS_DB)
      .filter(k => k !== "AIR")
      .map(k => `<option value="${k}">${k}</option>`)
      .join("");

    ui.elementModal.innerHTML = `
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Add Element">
        <div class="modalTop">
          <div>
            <div class="modalTitle">Add Element (2 surfaces)</div>
            <div class="modalSub">Front surface krijgt GLASS, back surface = AIR. Dikte = glasdikte (t) op de front surface.</div>
          </div>
          <button class="modalX" id="elClose" type="button">✕</button>
        </div>
        <div class="modalScroll">
          <div class="modalGrid">
            <div class="field">
              <label>Front R</label>
              <input id="elR1" type="number" step="0.01" value="40" />
            </div>
            <div class="field">
              <label>Back R</label>
              <input id="elR2" type="number" step="0.01" value="-60" />
            </div>
            <div class="field">
              <label>Glass thickness (t)</label>
              <input id="elT" type="number" step="0.01" value="6" />
            </div>
            <div class="field">
              <label>Air gap after element</label>
              <input id="elAir" type="number" step="0.01" value="2" />
            </div>
            <div class="field">
              <label>Aperture (semi-diam)</label>
              <input id="elAp" type="number" step="0.01" value="18" />
            </div>
            <div class="field">
              <label>Glass</label>
              <select id="elGlass">${opts}</select>
            </div>
            <div class="fieldFull">
              <div class="hint">Tip: wil je een achromaat? Zet 2 elementen achter elkaar met verschillende glassoorten (crown + flint) en speel met R.</div>
            </div>
          </div>
        </div>
        <div class="modalBottom">
          <button class="btn" id="elCancel" type="button">Cancel</button>
          <button class="btn btnPrimary" id="elAdd" type="button">Insert</button>
        </div>
      </div>
    `;

    ui.elementModal.classList.remove("hidden");
    ui.elementModal.setAttribute("aria-hidden","false");

    const close = () => {
      ui.elementModal.classList.add("hidden");
      ui.elementModal.setAttribute("aria-hidden","true");
      ui.elementModal.innerHTML = "";
    };

    ui.elementModal.querySelector("#elClose")?.addEventListener("click", close);
    ui.elementModal.querySelector("#elCancel")?.addEventListener("click", close);
    ui.elementModal.addEventListener("click", (e) => {
      if (e.target === ui.elementModal) close();
    });

    ui.elementModal.querySelector("#elAdd")?.addEventListener("click", () => {
      const R1 = num($("#elR1")?.value, 0);
      const R2 = num($("#elR2")?.value, 0);
      const tG = Math.max(0.01, num($("#elT")?.value, 4));
      const tAir = Math.max(0.01, num($("#elAir")?.value, 2));
      const ap = Math.max(0.5, num($("#elAp")?.value, 18));
      const g = resolveGlassName($("#elGlass")?.value || "N-BK7HT");

      const at = safeInsertAtAfterSelected();
      // front surface: after it is GLASS
      lens.surfaces.splice(at, 0, { type: "", R: R1, t: tG, ap, glass: g, stop: false });
      // back surface: after it is AIR
      lens.surfaces.splice(at + 1, 0, { type: "", R: R2, t: tAir, ap, glass: "AIR", stop: false });

      lens = sanitizeLens(lens);
      clampAllApertures(lens.surfaces);
      selectedIndex = at;
      buildTable();
      applySensorToIMS();
      renderAll();
      close();
      toast("Element inserted");
    });
  }

  function normalizeScratchFamily(v) {
    const s = String(v || "auto").trim().toLowerCase();
    if (s === "double-gauss" || s === "double_gauss" || s === "dg") return "double_gauss";
    if (s === "retrofocus" || s === "retrofocus wide" || s === "retrofocus_wide" || s === "wide") return "retrofocus_wide";
    if (s === "tele" || s === "telephoto") return "telephoto";
    return "auto";
  }

  function normalizeScratchAggressiveness(v) {
    const s = String(v || "normal").trim().toLowerCase();
    if (s === "safe") return "safe";
    if (s === "wild") return "wild";
    return "normal";
  }

  function scratchFamilyLabel(key) {
    if (key === "double_gauss") return "Double-Gauss";
    if (key === "retrofocus_wide") return "Retrofocus Wide";
    if (key === "telephoto") return "Telephoto";
    return "Auto";
  }

  function autoScratchFamilyForTargetEfl(targetEfl) {
    const f = Number(targetEfl || 0);
    if (!Number.isFinite(f) || f <= 0) return "double_gauss";
    if (f < Number(SCRATCH_CFG.autoFamilyWideMaxMm || 35)) return "retrofocus_wide";
    if (f <= Number(SCRATCH_CFG.autoFamilyNormalMaxMm || 85)) return "double_gauss";
    return "telephoto";
  }

  function resolveScratchFamily(requestedFamily, targetEfl) {
    const req = normalizeScratchFamily(requestedFamily);
    return req === "auto" ? autoScratchFamilyForTargetEfl(targetEfl) : req;
  }

  function countLensElements(surfaces) {
    if (!Array.isArray(surfaces)) return 0;
    let n = 0;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      const g = String(resolveGlassName(s?.glass || "AIR")).toUpperCase();
      if (g !== "AIR") n++;
    }
    return n;
  }

  function clampScratchMaxElements(v) {
    const raw = Number(v);
    if (!Number.isFinite(raw)) return 8;
    const minE = Number(SCRATCH_CFG.minElements || 3);
    const maxE = Number(SCRATCH_CFG.maxElementsHardCap || 14);
    return Math.max(minE, Math.min(maxE, Math.round(raw)));
  }

  function clampScratchEffort(v) {
    const raw = Number(v);
    const lo = Number(SCRATCH_CFG.effortMin || 0.6);
    const hi = Number(SCRATCH_CFG.effortMax || 4.0);
    const def = Number(SCRATCH_CFG.effortDefault || 1.0);
    if (!Number.isFinite(raw)) return clamp(def, lo, hi);
    return clamp(raw, lo, hi);
  }

  function scratchMmFromF(f, rel, lo, hi) {
    return clamp(Math.abs(Number(f || 50)) * Number(rel || 0.1), Number(lo || 0.1), Number(hi || 999));
  }

  function scratchRadiusFromF(f, rel, lo, hi, sign = 1) {
    const r = scratchMmFromF(f, rel, lo, hi);
    return (Number(sign) >= 0 ? 1 : -1) * r;
  }

  function scratchMakeElementPair({
    R1 = 40,
    R2 = -60,
    tGlass = 4,
    tAir = 2,
    ap = 16,
    glass = "N-BK7HT",
  } = {}) {
    return [
      {
        type: "",
        R: Number(R1),
        t: Math.max(PHYS_CFG.minThickness, Number(tGlass)),
        ap: Math.max(PHYS_CFG.minAperture, Number(ap)),
        glass: resolveGlassName(glass),
        stop: false,
      },
      {
        type: "",
        R: Number(R2),
        t: Math.max(PHYS_CFG.minThickness, Number(tAir)),
        ap: Math.max(PHYS_CFG.minAperture, Number(ap)),
        glass: "AIR",
        stop: false,
      },
    ];
  }

  function setImsApertureForSensor(surfaces, sensorH) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 0) return;
    surfaces[imsIdx].ap = Math.max(0.1, Number(sensorH || 24) * 0.5);
  }

  function findScratchRearSurfaceIndex(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return -1;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx <= 0) return -1;
    for (let i = imsIdx - 1; i >= 0; i--) {
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      return i;
    }
    return -1;
  }

  function enforceRearMountStart(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || !surfaces.length) return false;
    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    if (rearIdx < 0) return false;

    const minRearClear = Math.max(0, Number(opts?.minRearClearMm ?? 0.8));
    const minGapToSensor = Math.max(PHYS_CFG.minAirGap, PL_FFD + minRearClear);
    const maxGapToSensor = Math.max(minGapToSensor + 2, Number(opts?.maxRearGapMm ?? (PL_FFD + 95)));
    const rear = surfaces[rearIdx];
    rear.glass = "AIR";
    rear.t = clamp(
      Math.max(PHYS_CFG.minAirGap, Number(rear.t || 0), minGapToSensor),
      minGapToSensor,
      maxGapToSensor
    );

    // If the gap right before the rear surface got very large, shift excess into the
    // final image-space gap so the geometry does not "balloon" near the sensor.
    const preRearIdx = rearIdx - 1;
    if (preRearIdx >= 0) {
      const prev = surfaces[preRearIdx];
      const tp = String(prev?.type || "").toUpperCase();
      const prevMed = String(resolveGlassName(prev?.glass || "AIR")).toUpperCase();
      if (tp !== "OBJ" && tp !== "IMS" && prevMed === "AIR") {
        const preRearMax = Math.max(PHYS_CFG.minAirGap, Number(opts?.maxPreRearAirGapMm ?? 14));
        const prevGap = Math.max(PHYS_CFG.minAirGap, Number(prev.t || 0));
        if (prevGap > preRearMax) {
          const spill = prevGap - preRearMax;
          prev.t = preRearMax;
          rear.t = clamp(Number(rear.t || 0) + spill, minGapToSensor, maxGapToSensor);
        }
      }
    }
    return true;
  }

  function bakeLensShiftIntoRearGap(surfaces, lensShiftMm) {
    if (!Array.isArray(surfaces) || !surfaces.length) return false;
    const sh = Number(lensShiftMm);
    if (!Number.isFinite(sh) || Math.abs(sh) < 1e-5) return false;
    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    if (rearIdx < 0) return false;
    const rear = surfaces[rearIdx];
    rear.glass = "AIR";
    rear.t = Math.max(PHYS_CFG.minAirGap, Number(rear.t || 0) - sh);
    return true;
  }

  function enforceSingleStopSurface(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    ensureStopExists(surfaces);
    let stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        s.stop = false;
        continue;
      }
      const isStop = i === stopIdx;
      s.stop = isStop;
      if (isStop) s.type = "STOP";
      else if (t === "STOP") s.type = "";
    }
  }

  function ensureStopInAirBothSides(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    const stop = surfaces[stopIdx];
    if (!stop) return;
    stop.glass = "AIR";
    stop.stop = true;
    stop.type = "STOP";
    if (stopIdx > 0) {
      const prev = surfaces[stopIdx - 1];
      const tp = String(prev?.type || "").toUpperCase();
      if (tp !== "OBJ" && tp !== "IMS") prev.glass = "AIR";
    }
  }

  function recenterScratchStopSurface(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 5) return false;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 3) return false;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 1 || stopIdx >= imsIdx) return false;

    computeVertices(surfaces, 0, 0);
    const firstX = firstPhysicalVertexX(surfaces);
    const lastX = lastPhysicalVertexX(surfaces);
    if (!(Number.isFinite(firstX) && Number.isFinite(lastX) && lastX > firstX + 1e-6)) return false;

    const centerFrac = clamp(Number(opts?.centerFrac ?? 0.50), 0.20, 0.80);
    const targetX = firstX + (lastX - firstX) * centerFrac;
    const currentX = Number(surfaces[stopIdx]?.vx);

    const candidates = [];
    for (let ins = 2; ins <= imsIdx - 1; ins++) {
      const prev = surfaces[ins - 1];
      const next = surfaces[ins];
      const tp = String(prev?.type || "").toUpperCase();
      const tn = String(next?.type || "").toUpperCase();
      if (tp === "OBJ" || tp === "IMS" || tn === "OBJ" || tn === "IMS") continue;
      const prevMedium = String(resolveGlassName(prev?.glass || "AIR")).toUpperCase();
      if (prevMedium !== "AIR") continue;
      const x = Number(next?.vx);
      if (!Number.isFinite(x)) continue;
      candidates.push({ ins, x, dist: Math.abs(x - targetX) });
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    const minMoveMm = Math.max(0.5, Number(opts?.minMoveMm ?? 2.0));
    if (Number.isFinite(currentX) && Math.abs(best.x - currentX) < minMoveMm) return false;

    const stopSurf = surfaces.splice(stopIdx, 1)[0];
    let insertIdx = best.ins;
    if (insertIdx > stopIdx) insertIdx--;

    const movedStop = stopSurf || {};
    movedStop.type = "STOP";
    movedStop.stop = true;
    movedStop.glass = "AIR";
    movedStop.R = 0;
    movedStop.t = clamp(
      Math.max(PHYS_CFG.minAirGap, Number(movedStop.t || opts?.defaultStopGapMm || 2.0)),
      PHYS_CFG.minAirGap,
      24
    );

    surfaces.splice(insertIdx, 0, movedStop);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    return true;
  }

  function scaleLensGeometryToTargetEfl(surfaces, targetEfl, wavePreset) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return false;
    const tgt = Number(targetEfl || 0);
    if (!Number.isFinite(tgt) || tgt <= 1) return false;

    enforceRearMountStart(surfaces);
    let ok = false;
    for (let pass = 0; pass < 4; pass++) {
      computeVertices(surfaces, 0, 0);
      const p = estimateEflBflParaxial(surfaces, wavePreset);
      const efl = Number(p?.efl);
      if (!(Number.isFinite(efl) && efl > 1e-9)) break;
      const errRel = Math.abs(efl - tgt) / tgt;
      if (errRel <= 0.008) {
        ok = true;
        break;
      }
      const kRaw = tgt / efl;
      if (!Number.isFinite(kRaw) || kRaw <= 0) break;
      const k = pass === 0
        ? clamp(kRaw, 0.30, 3.20)
        : clamp(kRaw, 0.60, 1.70);

      const rearIdx = findScratchRearSurfaceIndex(surfaces);
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        s.R = Number(s.R || 0) * k;
        if (i === rearIdx) {
          // Keep image-space gap tied to mount geometry instead of scaling with optical power.
          s.t = Math.max(PHYS_CFG.minAirGap, Number(s.t || 0));
          s.glass = "AIR";
        } else {
          s.t = Math.max(PHYS_CFG.minThickness, Number(s.t || 0) * k);
        }
        s.ap = Math.max(PHYS_CFG.minAperture, Number(s.ap || 0) * Math.sqrt(k));
      }
      enforceRearMountStart(surfaces);
      quickSanity(surfaces);
      ok = true;
    }
    return ok;
  }

  function setStopForTargetTOnSurfaces(surfaces, targetEfl, targetT) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return false;
    enforceSingleStopSurface(surfaces);
    let stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return false;

    const tTarget = Number(targetT || 0);
    const fTarget = Number(targetEfl || 0);
    if (!(Number.isFinite(tTarget) && tTarget > 0.2 && Number.isFinite(fTarget) && fTarget > 1)) {
      ensureStopInAirBothSides(surfaces);
      quickSanity(surfaces);
      return true;
    }

    const stop = surfaces[stopIdx];
    const desiredStopAp = clamp(fTarget / (2 * tTarget), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    // One-sided T target: preserve faster-than-target pupil if already present.
    stop.ap = Math.max(Number(stop.ap || 0), desiredStopAp);
    stop.glass = "AIR";
    stop.stop = true;
    stop.type = "STOP";
    enforceApertureRadiusCoupling(stop, 1.10);

    for (let d = 1; d <= 3; d++) {
      const need = Number(stop.ap || desiredStopAp) * (1 - d * 0.10);
      for (const idx of [stopIdx - d, stopIdx + d]) {
        if (idx < 0 || idx >= surfaces.length) continue;
        const ss = surfaces[idx];
        const tt = String(ss?.type || "").toUpperCase();
        if (tt === "OBJ" || tt === "IMS") continue;
        if (Number(ss.ap || 0) < need) {
          ss.ap = clamp(need, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
        enforceApertureRadiusCoupling(ss, 1.08);
      }
    }

    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function generateBaseLens(family, targets, sensor, cfg = {}) {
    const resolvedFamily = resolveScratchFamily(family, targets?.targetEfl);
    const f = clamp(Math.abs(Number(targets?.targetEfl || 50)), 14, 260);
    const targetT = (() => {
      const t = Number(targets?.targetT);
      if (Number.isFinite(t) && t > 0.25) return t;
      return 2.0;
    })();
    const targetIC = Math.max(0, Number(targets?.targetIC || 0));
    const sensorW = Math.max(1, Number(sensor?.w || 36));
    const sensorH = Math.max(1, Number(sensor?.h || 24));
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);

    const stopAp = clamp(f / (2 * targetT), PHYS_CFG.minAperture, Math.min(26, PHYS_CFG.maxAperture * 0.75));
    const baseAp = clamp(
      Math.max(
        stopAp * 1.65,
        halfDiag * 0.75,
        targetIC > 0 ? targetIC * 0.34 : 0,
        8.0
      ),
      8.0,
      30.0
    );
    const gC = "N-BK7HT";
    const gF = "N-SF5";
    const gHi = "N-LAK9";

    const m = (rel, lo, hi) => scratchMmFromF(f, rel, lo, hi);
    const r = (rel, lo, hi, sign) => scratchRadiusFromF(f, rel, lo, hi, sign);

    const surfaces = [
      { type: "OBJ", R: 0.0, t: 0.0, ap: Math.max(60, baseAp * 2.2), glass: "AIR", stop: false },
    ];
    const pushPair = (spec) => {
      const p = scratchMakeElementPair(spec);
      surfaces.push(p[0], p[1]);
    };

    if (resolvedFamily === "retrofocus_wide") {
      pushPair({
        R1: r(0.56, 8, 180, -1),
        R2: r(0.48, 8, 160, +1),
        tGlass: m(0.10, 2.0, 10),
        tAir: m(0.34, 3.2, 22),
        ap: clamp(baseAp * 1.48, 9, 34),
        glass: gF,
      });
      pushPair({
        R1: r(0.86, 10, 220, +1),
        R2: r(1.14, 14, 280, -1),
        tGlass: m(0.10, 2.0, 11),
        tAir: m(0.11, 1.2, 12),
        ap: clamp(baseAp * 1.30, 8, 32),
        glass: gC,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.2, 14),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.96, 10, 240, +1),
        R2: r(1.34, 14, 320, -1),
        tGlass: m(0.09, 1.8, 9),
        tAir: m(0.18, 2.2, 24),
        ap: clamp(baseAp * 1.18, 7, 30),
        glass: gHi,
      });
    } else if (resolvedFamily === "telephoto") {
      pushPair({
        R1: r(0.92, 20, 360, +1),
        R2: r(1.36, 24, 420, -1),
        tGlass: m(0.11, 2.4, 18),
        tAir: m(0.12, 2.0, 14),
        ap: clamp(baseAp * 1.34, 9, 34),
        glass: gHi,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.5, 18),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.74, 16, 280, -1),
        R2: r(0.62, 14, 240, +1),
        tGlass: m(0.10, 2.2, 16),
        tAir: m(0.11, 1.8, 14),
        ap: clamp(baseAp * 1.22, 8, 31),
        glass: gF,
      });
      pushPair({
        R1: r(1.20, 22, 380, +1),
        R2: r(1.62, 24, 460, -1),
        tGlass: m(0.09, 1.8, 12),
        tAir: m(0.18, 2.8, 32),
        ap: clamp(baseAp * 1.15, 7, 30),
        glass: gC,
      });
    } else {
      pushPair({
        R1: r(0.94, 14, 260, +1),
        R2: r(1.24, 16, 320, -1),
        tGlass: m(0.10, 2.3, 16),
        tAir: m(0.10, 1.4, 13),
        ap: clamp(baseAp * 1.34, 9, 34),
        glass: gC,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.2, 16),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.82, 12, 240, -1),
        R2: r(1.06, 14, 300, +1),
        tGlass: m(0.09, 2.0, 14),
        tAir: m(0.15, 2.2, 26),
        ap: clamp(baseAp * 1.20, 8, 32),
        glass: gF,
      });
    }

    surfaces.push({
      type: "IMS",
      R: 0.0,
      t: 0.0,
      ap: Math.max(0.1, sensorH * 0.5),
      glass: "AIR",
      stop: false,
    });

    recenterScratchStopSurface(surfaces);
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);

    const made = sanitizeLens({
      name: `Scratch ${scratchFamilyLabel(resolvedFamily)} ${f.toFixed(0)}mm`,
      notes: [
        `Generated from scratch (${scratchFamilyLabel(resolvedFamily)}).`,
        `Aggressiveness: ${normalizeScratchAggressiveness(cfg?.aggressiveness || "normal")}`,
      ],
      surfaces,
    });
    return made;
  }

  function prepareScratchLensForTargets(lensObj, targets, sensor, opts = {}) {
    const wavePreset = String(opts?.wavePreset || ui.wavePreset?.value || "d");
    const work = sanitizeLens(clone(lensObj));
    const surfaces = work.surfaces;
    enforceRearMountStart(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    enforceSingleStopSurface(surfaces);
    recenterScratchStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    scaleLensGeometryToTargetEfl(surfaces, Number(targets?.targetEfl || 50), wavePreset);
    setStopForTargetTOnSurfaces(surfaces, Number(targets?.targetEfl || 50), Number(targets?.targetT || 0));
    promoteElementDiameters(surfaces, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      stage: 1,
      strength: 0.82,
      keepFl: false,
    });
    enforcePupilHealthFloors(surfaces, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      stage: 1,
      keepFl: false,
    });
    recenterScratchStopSurface(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    ensureStopInAirBothSides(surfaces);
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return sanitizeLens(work);
  }

  function scratchGrowReasonElementCost(reason) {
    const r = String(reason || "").toLowerCase();
    if (r === "achromat_corrector") return 2;
    return 1;
  }

  function pickScratchGrowReason(priority, targets, cycleIdx = 0) {
    const p = priority || {};
    const icNeed = Math.max(0, Number(p.icNeedMm || 0));
    const distRms = Number.isFinite(p.distRmsScore) ? Number(p.distRmsScore) : 999;
    const distMax = Number.isFinite(p.distMaxScore) ? Number(p.distMaxScore) : 999;
    const sharp = Number.isFinite(p.sharpness) ? Number(p.sharpness) : 999;
    const targetIC = Math.max(0, Number(targets?.targetIC || 0));
    const intrusion = Math.max(0, Number(p.intrusionMm || 0));
    const overlap = Math.max(0, Number(p.overlapMm || 0));
    const bflShort = Math.max(0, Number(p.bflShortMm || 0));

    // If physical feasibility is bad, avoid rear-heavy growth that tends to worsen intrusion.
    if (!p.feasible && (intrusion > 0.15 || overlap > 0.01)) {
      return (cycleIdx % 2 === 0) ? "distortion_corrector" : "achromat_corrector";
    }
    if (bflShort > 0.8) return "rear_expander";

    if (targetIC > 0 && icNeed > Math.max(0.55, targetIC * 0.02)) return "rear_expander";
    if (distRms > 0.90 || distMax > 1.80) return "distortion_corrector";
    if (sharp > 1.15 || distRms > 0.60) return (cycleIdx % 2 === 0) ? "achromat_corrector" : "field_flattener";
    return "field_flattener";
  }

  function growLensByOneBlock(lensObj, reason, ctx = {}) {
    const why = String(reason || "").toLowerCase();
    const work = sanitizeLens(clone(lensObj));
    const surfaces = work.surfaces;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 0) return null;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const targets = ctx?.targets || {};
    const sensor = ctx?.sensor || getSensorWH();
    const targetEfl = clamp(Math.abs(Number(targets.targetEfl || 50)), 14, 260);
    const targetT = Math.max(0.7, Number(targets.targetT || 2.0));
    const targetIC = Math.max(0, Number(targets.targetIC || 0));
    const distEdge = Number(ctx?.priority?.distEdgePct || 0);

    const m = (rel, lo, hi) => scratchMmFromF(targetEfl, rel, lo, hi);
    const r = (rel, lo, hi, sign) => scratchRadiusFromF(targetEfl, rel, lo, hi, sign);
    const stopAp = stopIdx >= 0
      ? Math.max(PHYS_CFG.minAperture, Number(surfaces[stopIdx]?.ap || 0))
      : clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, 26);
    const halfDiag = 0.5 * Math.hypot(Number(sensor?.w || 36), Number(sensor?.h || 24));
    const baseAp = clamp(Math.max(stopAp * 1.12, halfDiag * 0.85, targetIC > 0 ? targetIC * 0.30 : 0, 6.0), 6.0, 33.0);

    const clampInsert = (at) => Math.max(1, Math.min(Math.max(1, imsIdx), at | 0));
    const insertBlock = (at, block) => {
      const idx = clampInsert(at);
      surfaces.splice(idx, 0, ...block);
      return idx;
    };

    if (why === "rear_expander") {
      const at = clampInsert(Math.max(stopIdx + 1, imsIdx - 1));
      insertBlock(at, scratchMakeElementPair({
        R1: r(1.04, 18, 380, +1),
        R2: r(1.46, 20, 460, -1),
        tGlass: m(0.08, 1.8, 11),
        tAir: m(0.14, 2.2, 18),
        ap: clamp(baseAp * 1.18, 8, 35),
        glass: "N-LAK9",
      }));
    } else if (why === "distortion_corrector") {
      let at = stopIdx >= 0 ? (stopIdx + 1) : (imsIdx - 1);
      if (at >= imsIdx) at = Math.max(1, imsIdx - 1);
      const sign = distEdge >= 0 ? -1 : +1;
      insertBlock(at, scratchMakeElementPair({
        R1: r(2.80, 30, 640, sign),
        R2: r(1.90, 22, 520, sign),
        tGlass: m(0.05, 0.9, 5.8),
        tAir: m(0.06, 1.0, 6.5),
        ap: clamp(baseAp * 1.08, 6, 30),
        glass: "N-BK7HT",
      }));
    } else if (why === "achromat_corrector") {
      const at = stopIdx >= 0 ? Math.min(imsIdx, stopIdx + 1) : Math.max(1, imsIdx - 1);
      const pairA = scratchMakeElementPair({
        R1: r(1.25, 18, 420, +1),
        R2: r(1.54, 18, 420, -1),
        tGlass: m(0.05, 1.0, 6.4),
        tAir: m(0.03, 0.35, 1.8),
        ap: clamp(baseAp * 1.04, 6, 30),
        glass: "N-BK7HT",
      });
      const pairB = scratchMakeElementPair({
        R1: r(1.10, 16, 360, -1),
        R2: r(1.80, 20, 460, +1),
        tGlass: m(0.05, 1.0, 6.0),
        tAir: m(0.10, 1.0, 9.5),
        ap: clamp(baseAp * 1.04, 6, 30),
        glass: "N-SF5",
      });
      insertBlock(at, [...pairA, ...pairB]);
    } else {
      // field_flattener default
      const at = clampInsert(imsIdx);
      insertBlock(at, scratchMakeElementPair({
        R1: r(2.90, 28, 660, +1),
        R2: r(4.50, 46, 900, -1),
        tGlass: m(0.04, 0.7, 4.6),
        tAir: m(0.06, 0.8, 5.8),
        ap: clamp(Math.max(baseAp * 0.98, halfDiag * 0.95), 5.5, 28),
        glass: "N-BK7HT",
      }));
    }

    recenterScratchStopSurface(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return sanitizeLens(work);
  }

  function scratchPassesForAggressiveness(aggr, targets, growthCycle = false, effort = 1.0) {
    const profile = SCRATCH_CFG.stageIters[normalizeScratchAggressiveness(aggr)] || SCRATCH_CFG.stageIters.normal;
    const hasIC = Number(targets?.targetIC || 0) > 0;
    const effortScale = clampScratchEffort(effort);
    const scale = (growthCycle ? 0.78 : 1.0) * effortScale;
    const passes = [
      { id: "A", label: "FL acquire", targetT: 0, targetIC: 0, iters: Math.max(300, Math.round(profile.A * scale)) },
      { id: "B", label: "T tune", targetT: Number(targets?.targetT || 0), targetIC: 0, iters: Math.max(300, Math.round(profile.B * scale)) },
    ];
    if (hasIC) {
      passes.push({
        id: "C",
        label: "IC growth",
        targetT: Number(targets?.targetT || 0),
        targetIC: Number(targets?.targetIC || 0),
        iters: Math.max(600, Math.round(profile.C * scale)),
      });
    }
    passes.push({
      id: "D",
      label: "Polish",
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      iters: Math.max(700, Math.round(profile.D * scale)),
    });
    return passes;
  }

  function scratchOptModeForPass(aggr, passId) {
    const a = normalizeScratchAggressiveness(aggr);
    if (a === "wild") return "wild";
    if (a === "normal" && (passId === "C" || passId === "D")) return "wild";
    return "safe";
  }

  function applyOptimizerBestUnsafe(targets = null) {
    if (!optBest?.lens) return false;
    if (targets && typeof targets === "object") {
      const pri = buildOptPriority(optBest.eval, {
        targetEfl: Number(targets.targetEfl || 50),
        targetIC: Math.max(0, Number(targets.targetIC || 0)),
        targetT: Number(targets.targetT || 0),
      });
      if (!pri.feasible) return false;
    }
    loadLens(optBest.lens);
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    if (ui.lensFocus) ui.lensFocus.value = Number(optBest?.eval?.lensShift || 0).toFixed(2);
    renderAll();
    return true;
  }

  function evaluateCurrentLensPriorityForTargets(targets) {
    const sensor = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0)));
    const wavePreset = ui.wavePreset?.value || "d";
    const evalRes = evalLensMerit(lens, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Math.max(0, Number(targets?.targetIC || 0)),
      fieldAngle,
      rayCount,
      wavePreset,
      sensorW: sensor.w,
      sensorH: sensor.h,
      evalTier: "accurate",
      icOptions: Number(targets?.targetIC || 0) > 0 ? { mode: "lut", cfg: OPT_IC_CFG } : { mode: "skip" },
    });
    const pri = buildOptPriority(evalRes, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetIC: Math.max(0, Number(targets?.targetIC || 0)),
      targetT: Number(targets?.targetT || 0),
    });
    return { evalRes, pri };
  }

  function scratchProgressMetric(priority, targets) {
    const p = priority;
    if (!p) return Infinity;
    if (!p.feasible) {
      return 1e9 + p.feasibilityDebt * 120 + p.eflErrRel * 1e5;
    }
    const hasT = Number(targets?.targetT || 0) > 0;
    const hasIC = Number(targets?.targetIC || 0) > 0;
    return (
      p.eflErrRel * 120000 +
      (hasT ? p.tErrAbs * 900 : 0) +
      (hasIC ? p.icNeedMm * 460 : 0) +
      p.distRmsScore * 220 +
      p.distMaxScore * 100 +
      p.sharpness * 120
    );
  }

  function scratchTargetsReached(priority, targets) {
    if (!priority?.feasible) return false;
    if (priority.afOk === false) return false;
    if (Number(priority.bflShortMm || 0) > 0.8) return false;
    if (!(Number(priority.eflErrRel) <= (OPT_STAGE_CFG.flStageRel + 1e-4))) return false;
    if (Number(targets?.targetT || 0) > 0) {
      if (!(Number(priority.tErrAbs) <= Math.max(0.20, OPT_STAGE_CFG.tGoodAbs))) return false;
    }
    if (Number(targets?.targetIC || 0) > 0) {
      if (!(Number(priority.icNeedMm) <= 1e-4)) return false;
    }
    const strictDistRms = Number(SCRATCH_CFG.strictDistRmsPct || 1.0);
    const strictDistMax = Number(SCRATCH_CFG.strictDistMaxPct || 2.0);
    if (!(Number.isFinite(priority.distRmsScore) && priority.distRmsScore <= strictDistRms)) return false;
    if (!(Number.isFinite(priority.distMaxScore) && priority.distMaxScore <= strictDistMax)) return false;
    if (!(Number.isFinite(priority.rms0) && priority.rms0 <= Number(SCRATCH_CFG.strictRmsCenterMm || 0.45))) return false;
    if (!(Number.isFinite(priority.rmsE) && priority.rmsE <= Number(SCRATCH_CFG.strictRmsEdgeMm || 1.2))) return false;
    return true;
  }

  function scratchAcceptableReached(priority, targets) {
    if (!priority?.feasible) return false;
    if (priority.afOk === false) return false;
    if (Number(priority.bflShortMm || 0) > 1.0) return false;
    if (!(Number(priority.eflErrRel) <= Number(SCRATCH_CFG.acceptableFlRel || 0.02))) return false;
    if (Number(targets?.targetT || 0) > 0) {
      if (!(Number(priority.tErrAbs) <= Number(SCRATCH_CFG.acceptableTAbs || 0.35))) return false;
    }
    if (Number(targets?.targetIC || 0) > 0) {
      if (!(Number(priority.icNeedMm) <= 1e-4)) return false;
    }
    const okDistRms = Number(SCRATCH_CFG.acceptableDistRmsPct || 2.2);
    const okDistMax = Number(SCRATCH_CFG.acceptableDistMaxPct || 4.2);
    if (!(Number.isFinite(priority.distRmsScore) && priority.distRmsScore <= okDistRms)) return false;
    if (!(Number.isFinite(priority.distMaxScore) && priority.distMaxScore <= okDistMax)) return false;
    if (!(Number.isFinite(priority.rms0) && priority.rms0 <= Number(SCRATCH_CFG.acceptableRmsCenterMm || 0.75))) return false;
    if (!(Number.isFinite(priority.rmsE) && priority.rmsE <= Number(SCRATCH_CFG.acceptableRmsEdgeMm || 2.2))) return false;
    return true;
  }

  function scratchUsabilityReasons(snap, targets) {
    const p = snap?.pri;
    const ev = snap?.evalRes || {};
    const reasons = [];
    if (!p?.feasible) reasons.push("phys");
    if (p?.afOk === false) reasons.push("af");
    if (!(Number(p?.eflErrRel) <= Number(SCRATCH_CFG.minUsableFlRel || 0.06))) reasons.push("fl");

    if (Number(targets?.targetT || 0) > 0) {
      if (!(Number(p?.tErrAbs) <= Number(SCRATCH_CFG.minUsableTSlowAbs || 1.6))) reasons.push("t");
    }
    if (Number(targets?.targetIC || 0) > 0) {
      const icTol = Math.max(
        Number(SCRATCH_CFG.minUsableIcNeedMmAbs || 3.0),
        Number(targets.targetIC || 0) * Number(SCRATCH_CFG.minUsableIcNeedMmFrac || 0.16)
      );
      if (!(Number(p?.icNeedMm) <= icTol)) reasons.push("ic");
    }

    if (!(Number.isFinite(p?.rms0) && p.rms0 <= Number(SCRATCH_CFG.minUsableRmsCenterMm || 1.2))) reasons.push("rmsC");
    if (!(Number.isFinite(p?.rmsE) && p.rmsE <= Number(SCRATCH_CFG.minUsableRmsEdgeMm || 4.5))) reasons.push("rmsE");

    const vigFrac = Number(ev?.vigFrac);
    if (Number.isFinite(vigFrac) && vigFrac > Number(SCRATCH_CFG.maxUsableVigFrac || 0.5)) reasons.push("vig");

    const goodFrac0 = Number(ev?.goodFrac0);
    if (Number.isFinite(goodFrac0) && goodFrac0 < Number(SCRATCH_CFG.minUsableCenterThroughput || 0.18)) reasons.push("tp0");

    return reasons;
  }

  function scratchMinimumUsableReached(snap, targets) {
    return scratchUsabilityReasons(snap, targets).length === 0;
  }

  async function runScratchOptimizerPass(pass, targets, aggr, meta = {}) {
    if (scratchStopRequested) return evaluateCurrentLensPriorityForTargets(targets);
    if (!pass) return evaluateCurrentLensPriorityForTargets(targets);
    if (ui.optTargetFL) ui.optTargetFL.value = Number(targets.targetEfl).toFixed(2);
    if (ui.optTargetT) ui.optTargetT.value = Number(pass.targetT || 0).toFixed(2);
    if (ui.optTargetIC) ui.optTargetIC.value = Math.max(0, Number(pass.targetIC || 0)).toFixed(2);
    if (ui.optIters) ui.optIters.value = String(Math.max(60, Number(pass.iters || 600) | 0));
    if (ui.optPop) ui.optPop.value = scratchOptModeForPass(aggr, pass.id);

    const tag = meta?.tag ? `${meta.tag} • ` : "";
    const runIndex = Number(meta?.runIndex || 0);
    const runTotal = Number(meta?.runTotal || 0);
    const runStepTxt = (Number.isFinite(runIndex) && runIndex > 0 && Number.isFinite(runTotal) && runTotal > 0)
      ? `Step ${Math.round(runIndex)}/${Math.round(runTotal)} • `
      : "";
    const phaseLabel = String(meta?.phaseLabel || "").trim();
    setOptLog(
      `Build From Scratch\n` +
      `${runStepTxt}${tag}stage ${pass.id}: ${pass.label}\n` +
      `targets FL ${Number(targets.targetEfl).toFixed(2)} • T ${Number(pass.targetT || 0).toFixed(2)} • IC ${Math.max(0, Number(pass.targetIC || 0)).toFixed(2)}\n` +
      `optimizer ${ui.optPop?.value || "safe"} • ${ui.optIters?.value || pass.iters} iters`
    );
    const prevRunCtx = optRunContext;
    setOptRunContext({
      mode: "Build From Scratch",
      stepIndex: runIndex,
      stepTotal: runTotal,
      label: phaseLabel || `${tag}stage ${pass.id}: ${pass.label}`,
    });
    try {
      await runOptimizer();
    } finally {
      setOptRunContext(prevRunCtx);
    }
    if (scratchStopRequested) return evaluateCurrentLensPriorityForTargets(targets);
    let loaded = applyOptimizerBestUnsafe({
      targetEfl: Number(targets.targetEfl || 50),
      targetT: Number(pass.targetT || 0),
      targetIC: Math.max(0, Number(pass.targetIC || 0)),
    });
    if (!loaded) loaded = applyOptimizerBestUnsafe(null);
    if (loaded && Array.isArray(lens?.surfaces)) {
      const sensorNow = getSensorWH();
      const shiftNow = Number(ui.lensFocus?.value ?? optBest?.eval?.lensShift ?? 0);
      bakeLensShiftIntoRearGap(lens.surfaces, shiftNow);
      enforceRearMountStart(lens.surfaces);
      ensureStopInAirBothSides(lens.surfaces);
      setImsApertureForSensor(lens.surfaces, Number(sensorNow?.h || 24));
      quickSanity(lens.surfaces);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0";
      if (ui.lensFocus) ui.lensFocus.value = "0.00";
      buildTable();
      applySensorToIMS();
      autoFocus();
    }
    return evaluateCurrentLensPriorityForTargets(targets);
  }

  async function buildFromScratchPipeline({
    targetEfl,
    targetT,
    targetIC = 0,
    family = "auto",
    maxElements = 8,
    aggressiveness = "normal",
    effort = 1.0,
    stopWhenAcceptable = true,
  } = {}) {
    if (scratchBuildRunning) return;
    if (optRunning || distOptRunning || sharpOptRunning) {
      toast("Stop optimizer/distortion/sharpness run first before Build From Scratch.");
      return;
    }

    scratchBuildRunning = true;
    scratchStopRequested = false;
    if (ui.btnBuildScratch) ui.btnBuildScratch.disabled = true;
    const prevOptIters = ui.optIters?.value;
    const prevOptPop = ui.optPop?.value;
    const prevFieldAngle = ui.fieldAngle?.value;
    const preBuildLens = sanitizeLens(clone(lens));
    const preBuildFocusMode = String(ui.focusMode?.value || "lens");
    const preBuildSensorOffset = Number(ui.sensorOffset?.value || 0);
    const preBuildLensFocus = Number(ui.lensFocus?.value || 0);

    try {
      const sensor = getSensorWH();
      const wavePreset = ui.wavePreset?.value || "d";
      const tRaw = Number(targetT ?? num(ui.optTargetT?.value, 2.0));
      const targets = {
        targetEfl: clamp(Math.abs(Number(targetEfl || num(ui.optTargetFL?.value, 50))), 12, 320),
        targetT: (Number.isFinite(tRaw) && tRaw > 0.25) ? tRaw : 2.0,
        targetIC: Math.max(0, Number(targetIC ?? num(ui.optTargetIC?.value, 0))),
      };
      const aggr = normalizeScratchAggressiveness(aggressiveness);
      const effortScale = clampScratchEffort(effort);
      const stopOnAccept = stopWhenAcceptable !== false;
      const familyResolved = resolveScratchFamily(family, targets.targetEfl);
      const maxElems = clampScratchMaxElements(maxElements);

      if (ui.optTargetFL) ui.optTargetFL.value = targets.targetEfl.toFixed(2);
      if (ui.optTargetT) ui.optTargetT.value = targets.targetT.toFixed(2);
      if (ui.optTargetIC) ui.optTargetIC.value = targets.targetIC.toFixed(2);
      if (ui.fieldAngle) ui.fieldAngle.value = "0";

      const baseLens = generateBaseLens(
        familyResolved,
        targets,
        { w: sensor.w, h: sensor.h },
        { aggressiveness: aggr }
      );
      const prepared = prepareScratchLensForTargets(
        baseLens,
        targets,
        { w: sensor.w, h: sensor.h },
        { wavePreset }
      );
      loadLens(prepared);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0";
      autoFocus();

      const firstPasses = scratchPassesForAggressiveness(aggr, targets, false, effortScale);
      const maxGrowCyclesBase = Number(SCRATCH_CFG.maxGrowCycles[aggr] || 4);
      const maxGrowCycles = Math.max(1, Math.round(maxGrowCyclesBase * effortScale));
      const growPassTemplate = scratchPassesForAggressiveness(aggr, targets, true, effortScale);
      const runTotalEstimate = firstPasses.length + (maxGrowCycles * growPassTemplate.length) + 1;
      let runStep = 0;

      const startElements = countLensElements(lens.surfaces);
      setOptLog(
        `Build From Scratch\n` +
        `family ${scratchFamilyLabel(familyResolved)} • aggr ${aggr} • effort x${effortScale.toFixed(2)} • stopOnAccept ${stopOnAccept ? "ON" : "OFF"}\n` +
        `targets FL ${targets.targetEfl.toFixed(2)} • T ${targets.targetT.toFixed(2)} • IC ${targets.targetIC.toFixed(2)}\n` +
        `elements ${startElements}/${maxElems}\n` +
        `planned optimizer runs <= ${runTotalEstimate}`
      );

      let snap = null;
      let bestFeasibleSnapshot = null;
      let bestUsableSnapshot = null;
      let earlyStopReason = "";
      let abortedByUser = false;
      const markStoppedByUser = () => {
        abortedByUser = true;
        if (!earlyStopReason) earlyStopReason = "stopped by user";
      };
      const storeBestFeasible = (label, resObj) => {
        const pri = resObj?.pri;
        if (!pri?.feasible) return;
        const metric = scratchProgressMetric(pri, targets);
        if (!bestFeasibleSnapshot || metric < bestFeasibleSnapshot.metric) {
          bestFeasibleSnapshot = {
            metric,
            label: String(label || "snapshot"),
            lens: sanitizeLens(clone(lens)),
            pri,
            eval: resObj.evalRes,
          };
        }
      };
      const storeBestUsable = (label, resObj) => {
        if (!scratchMinimumUsableReached(resObj, targets)) return;
        const pri = resObj?.pri;
        const metric = scratchProgressMetric(pri, targets);
        if (!bestUsableSnapshot || metric < bestUsableSnapshot.metric) {
          bestUsableSnapshot = {
            metric,
            label: String(label || "snapshot"),
            lens: sanitizeLens(clone(lens)),
            pri,
            eval: resObj?.evalRes,
          };
        }
      };
      const startSnap = evaluateCurrentLensPriorityForTargets(targets);
      storeBestFeasible("prepared", startSnap);
      storeBestUsable("prepared", startSnap);
      for (let i = 0; i < firstPasses.length; i++) {
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        runStep++;
        snap = await runScratchOptimizerPass(firstPasses[i], targets, aggr, {
          tag: `pass ${i + 1}/${firstPasses.length}`,
          phaseLabel: `initial stage ${firstPasses[i]?.id || (i + 1)} (${firstPasses[i]?.label || "run"})`,
          runIndex: runStep,
          runTotal: runTotalEstimate,
        });
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        storeBestFeasible(`pass_${firstPasses[i]?.id || i}`, snap);
        storeBestUsable(`pass_${firstPasses[i]?.id || i}`, snap);
        if (stopOnAccept && scratchAcceptableReached(snap?.pri, targets)) {
          earlyStopReason = `accepted in initial pass ${firstPasses[i]?.id || (i + 1)}`;
          break;
        }
      }

      let bestPri = snap?.pri || evaluateCurrentLensPriorityForTargets(targets).pri;
      let bestMetric = scratchProgressMetric(bestPri, targets);
      let plateauRun = 0;
      if (scratchStopRequested && !earlyStopReason) markStoppedByUser();

      for (let cycle = 0; cycle < maxGrowCycles && !earlyStopReason; cycle++) {
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        const cur = evaluateCurrentLensPriorityForTargets(targets);
        if (scratchTargetsReached(cur.pri, targets)) break;
        if (stopOnAccept && scratchAcceptableReached(cur.pri, targets)) {
          earlyStopReason = `accepted before grow cycle ${cycle + 1}`;
          break;
        }

        const curElements = countLensElements(lens.surfaces);
        if (curElements >= maxElems) break;

        let reason = pickScratchGrowReason(cur.pri, targets, cycle);
        let cost = scratchGrowReasonElementCost(reason);
        if (curElements + cost > maxElems) {
          const fallback = (curElements + 1 <= maxElems)
            ? (cur.pri.icNeedMm > 0.5 ? "rear_expander" : "field_flattener")
            : null;
          if (!fallback) break;
          reason = fallback;
          cost = 1;
        }

        const grown = growLensByOneBlock(lens, reason, {
          targets,
          sensor: { w: sensor.w, h: sensor.h },
          family: familyResolved,
          priority: cur.pri,
          aggressiveness: aggr,
        });
        if (!grown) break;
        const preparedGrow = prepareScratchLensForTargets(
          grown,
          targets,
          { w: sensor.w, h: sensor.h },
          { wavePreset }
        );
        loadLens(preparedGrow);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        autoFocus();

        const growPasses = scratchPassesForAggressiveness(aggr, targets, true, effortScale);
        setOptLog(
          `Build From Scratch\n` +
          `grow ${cycle + 1}/${maxGrowCycles}: ${reason} (+${cost} elem)\n` +
          `elements ${countLensElements(lens.surfaces)}/${maxElems}\n` +
          `running staged optimize...`
        );
        for (let i = 0; i < growPasses.length; i++) {
          if (scratchStopRequested) {
            markStoppedByUser();
            break;
          }
          runStep++;
          snap = await runScratchOptimizerPass(growPasses[i], targets, aggr, {
            tag: `grow ${cycle + 1} • pass ${i + 1}/${growPasses.length}`,
            phaseLabel: `grow ${cycle + 1}/${maxGrowCycles} • ${reason} • stage ${growPasses[i]?.id || (i + 1)} (${growPasses[i]?.label || "run"})`,
            runIndex: runStep,
            runTotal: runTotalEstimate,
          });
          if (scratchStopRequested) {
            markStoppedByUser();
            break;
          }
          storeBestFeasible(`grow_${cycle + 1}_${growPasses[i]?.id || i}`, snap);
          storeBestUsable(`grow_${cycle + 1}_${growPasses[i]?.id || i}`, snap);
          if (stopOnAccept && scratchAcceptableReached(snap?.pri, targets)) {
            earlyStopReason = `accepted in grow ${cycle + 1} pass ${growPasses[i]?.id || (i + 1)}`;
            break;
          }
        }
        if (earlyStopReason) break;

        const after = evaluateCurrentLensPriorityForTargets(targets);
        storeBestFeasible(`grow_${cycle + 1}`, after);
        storeBestUsable(`grow_${cycle + 1}`, after);
        const metric = scratchProgressMetric(after.pri, targets);
        const relImprove = (bestMetric - metric) / Math.max(1e-6, Math.abs(bestMetric));
        if (metric < bestMetric) {
          bestMetric = metric;
          bestPri = after.pri;
        }
        if (relImprove <= Number(SCRATCH_CFG.plateauImproveFrac || 0.01)) plateauRun++;
        else plateauRun = 0;

        if (plateauRun >= 2 && aggr !== "wild") break;
      }

      if (scratchStopRequested && !earlyStopReason) markStoppedByUser();
      const preFinal = evaluateCurrentLensPriorityForTargets(targets);
      const shouldSkipFinalPolish = abortedByUser || (stopOnAccept && scratchAcceptableReached(preFinal.pri, targets));
      if (shouldSkipFinalPolish) {
        if (!earlyStopReason && !abortedByUser) earlyStopReason = "accepted before final polish";
      } else {
        const distNow = Math.max(0, Number(preFinal?.pri?.distRmsScore || 0));
        const distOver = Math.max(0, distNow - Number(SCRATCH_CFG.acceptableDistRmsPct || 2.2));
        const distScale = clamp(1 + distOver * 0.35, 1.0, 2.4);
        const finalPolishIters = Math.max(
          800,
          Math.round(Number((SCRATCH_CFG.stageIters[aggr] || SCRATCH_CFG.stageIters.normal).D) * 0.75 * effortScale * distScale)
        );
        runStep++;
        await runScratchOptimizerPass(
          {
            id: "D",
            label: "Final polish",
            targetT: targets.targetT,
            targetIC: targets.targetIC,
            iters: finalPolishIters,
          },
          targets,
          aggr,
          {
            tag: "final",
            phaseLabel: "final polish",
            runIndex: runStep,
            runTotal: runTotalEstimate,
          }
        );
      }

      const final = evaluateCurrentLensPriorityForTargets(targets);
      let finalSnap = final;
      storeBestUsable("final_precheck", finalSnap);
      if (!finalSnap.pri?.feasible && bestFeasibleSnapshot?.lens) {
        loadLens(bestFeasibleSnapshot.lens);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        if (ui.lensFocus && Number.isFinite(bestFeasibleSnapshot?.eval?.lensShift)) {
          ui.lensFocus.value = Number(bestFeasibleSnapshot.eval.lensShift).toFixed(2);
        }
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        storeBestUsable("fallback_feasible", finalSnap);
      }
      if (!finalSnap.pri?.feasible && !bestFeasibleSnapshot?.lens && preBuildLens?.surfaces?.length) {
        loadLens(preBuildLens);
        if (ui.focusMode) ui.focusMode.value = preBuildFocusMode;
        if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(preBuildSensorOffset) ? String(preBuildSensorOffset) : "0";
        if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(preBuildLensFocus) ? preBuildLensFocus.toFixed(2) : "0.00";
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        storeBestUsable("fallback_previous", finalSnap);
        if (!earlyStopReason) earlyStopReason = "no feasible scratch result; restored previous lens";
      }
      if (finalSnap.pri?.feasible) {
        // Final guard: ensure the resulting design can actually autofocus at center.
        const afFinal = findBestFocusShift(
          lens.surfaces,
          "lens",
          0,
          Number(ui.lensFocus?.value || 0),
          wavePreset,
          {
            rangeMm: 1.8,
            coarseStepMm: 0.15,
            fineHalfMm: 0.45,
            fineStepMm: 0.04,
            rayCount: Math.max(11, Math.min(31, Number(ui.rayCount?.value || 21) | 0)),
            fieldMode: "center",
          }
        );
        if (afFinal?.ok) {
          if (ui.focusMode) ui.focusMode.value = "lens";
          if (ui.sensorOffset) ui.sensorOffset.value = "0";
          if (ui.lensFocus) ui.lensFocus.value = Number(afFinal.shift || 0).toFixed(2);
          renderAll();
          finalSnap = evaluateCurrentLensPriorityForTargets(targets);
          storeBestUsable("final_af", finalSnap);
        } else if (bestFeasibleSnapshot?.lens) {
          loadLens(bestFeasibleSnapshot.lens);
          if (ui.focusMode) ui.focusMode.value = "lens";
          if (ui.sensorOffset) ui.sensorOffset.value = "0";
          if (ui.lensFocus && Number.isFinite(bestFeasibleSnapshot?.eval?.lensShift)) {
            ui.lensFocus.value = Number(bestFeasibleSnapshot.eval.lensShift).toFixed(2);
          }
          renderAll();
          finalSnap = evaluateCurrentLensPriorityForTargets(targets);
          storeBestUsable("fallback_af_feasible", finalSnap);
          if (!earlyStopReason) earlyStopReason = "final autofocus failed; restored best feasible";
        } else if (preBuildLens?.surfaces?.length) {
          loadLens(preBuildLens);
          if (ui.focusMode) ui.focusMode.value = preBuildFocusMode;
          if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(preBuildSensorOffset) ? String(preBuildSensorOffset) : "0";
          if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(preBuildLensFocus) ? preBuildLensFocus.toFixed(2) : "0.00";
          renderAll();
          finalSnap = evaluateCurrentLensPriorityForTargets(targets);
          storeBestUsable("fallback_af_previous", finalSnap);
          if (!earlyStopReason) earlyStopReason = "final autofocus failed; restored previous lens";
        }
      }

      let usable = scratchMinimumUsableReached(finalSnap, targets);
      if (!usable && bestUsableSnapshot?.lens) {
        loadLens(bestUsableSnapshot.lens);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        if (ui.lensFocus && Number.isFinite(bestUsableSnapshot?.eval?.lensShift)) {
          ui.lensFocus.value = Number(bestUsableSnapshot.eval.lensShift).toFixed(2);
        } else if (ui.lensFocus) {
          ui.lensFocus.value = "0.00";
          autoFocus();
        }
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        usable = scratchMinimumUsableReached(finalSnap, targets);
        if (!earlyStopReason) earlyStopReason = `result below usable floor; restored ${bestUsableSnapshot.label}`;
      }
      if (!usable && bestFeasibleSnapshot?.lens) {
        loadLens(bestFeasibleSnapshot.lens);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        if (ui.lensFocus && Number.isFinite(bestFeasibleSnapshot?.eval?.lensShift)) {
          ui.lensFocus.value = Number(bestFeasibleSnapshot.eval.lensShift).toFixed(2);
        } else if (ui.lensFocus) {
          ui.lensFocus.value = "0.00";
          autoFocus();
        }
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        usable = scratchMinimumUsableReached(finalSnap, targets);
        if (!earlyStopReason) earlyStopReason = `no usable scratch result; kept best feasible ${bestFeasibleSnapshot.label}`;
      }
      if (!usable && !bestFeasibleSnapshot?.lens && preBuildLens?.surfaces?.length) {
        loadLens(preBuildLens);
        if (ui.focusMode) ui.focusMode.value = preBuildFocusMode;
        if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(preBuildSensorOffset) ? String(preBuildSensorOffset) : "0";
        if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(preBuildLensFocus) ? preBuildLensFocus.toFixed(2) : "0.00";
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        usable = scratchMinimumUsableReached(finalSnap, targets);
        if (!earlyStopReason) earlyStopReason = "no usable scratch result; restored previous lens";
      }
      const p = finalSnap.pri;
      const doneStrict = scratchTargetsReached(p, targets);
      const acceptable = scratchAcceptableReached(p, targets);
      const done = !abortedByUser && usable && (doneStrict || (stopOnAccept && acceptable));
      const finalElems = countLensElements(lens.surfaces);
      const usableReasons = scratchUsabilityReasons(finalSnap, targets);
      const headline = abortedByUser
        ? "STOPPED ⏹"
        : (!p.feasible
          ? "FAILED ❌"
          : (usable ? (done ? "DONE ✅" : "DONE (usable best effort)") : "DONE (best feasible ⚠)"));
      setOptLog(
        `Build From Scratch ${headline}\n` +
        `family ${scratchFamilyLabel(familyResolved)} • aggr ${aggr} • effort x${effortScale.toFixed(2)}\n` +
        `${earlyStopReason ? `stop ${earlyStopReason}\n` : ""}` +
        `${bestFeasibleSnapshot ? `fallback ${bestFeasibleSnapshot.label}\n` : ""}` +
        `${bestUsableSnapshot ? `usable fallback ${bestUsableSnapshot.label}\n` : ""}` +
        `optimizer runs ${runStep}/${runTotalEstimate}\n` +
        `elements ${finalElems}/${maxElems}\n` +
        `FL err ${(Number(p.eflErrRel || 0) * 100).toFixed(2)}%\n` +
        `T slow ${Number.isFinite(p.tErrAbs) ? p.tErrAbs.toFixed(2) : "—"}\n` +
        `IC short ${Number.isFinite(p.icNeedMm) ? p.icNeedMm.toFixed(2) : "—"}mm\n` +
        `acceptable ${acceptable ? "YES" : "NO"} • strict ${doneStrict ? "YES" : "NO"} • usable ${usable ? "YES" : "NO"}\n` +
        `${!usable ? `usable fail: ${usableReasons.join(", ")}\n` : ""}` +
        `Dist RMS ${Number.isFinite(p.distRmsPct) ? Math.abs(p.distRmsPct).toFixed(2) : "—"}% • MAX ${Number.isFinite(p.distMaxPct) ? Math.abs(p.distMaxPct).toFixed(2) : "—"}%\n` +
        `${fmtPhysOpt(finalSnap.evalRes, targets)}\n` +
        `stage ${p.stageName}`
      );

      toast(
        `Build from scratch ${abortedByUser ? "stopped" : (!p.feasible ? "failed" : (usable ? (done ? "done" : "ready (usable best effort)") : "ready (best feasible)"))} • ${scratchFamilyLabel(familyResolved)} • FL ${Number.isFinite(p.efl) ? p.efl.toFixed(1) : "—"}mm`
      );
      scheduleAutosave();
    } catch (err) {
      console.error(err);
      setOptLog(
        `Build From Scratch failed\n${String(err?.message || err)}`
      );
      toast("Build From Scratch failed. Check console/log.");
    } finally {
      if (ui.optIters && prevOptIters != null) ui.optIters.value = String(prevOptIters);
      if (ui.optPop && prevOptPop != null) ui.optPop.value = String(prevOptPop);
      if (ui.fieldAngle && prevFieldAngle != null) ui.fieldAngle.value = String(prevFieldAngle);
      scratchStopRequested = false;
      scratchBuildRunning = false;
      if (ui.btnBuildScratch) ui.btnBuildScratch.disabled = false;
      scheduleRenderAll();
    }
  }

  function openBuildScratchModal() {
    if (!ui.newLensModal) return;
    if (scratchBuildRunning || optRunning) {
      toast("Wait for current build/optimizer run to finish.");
      return;
    }

    const curSensor = getSensorWH();
    const curFamily = resolveScratchFamily("auto", num(ui.optTargetFL?.value, 50));
    ui.newLensModal.innerHTML = `
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Build From Scratch">
        <div class="modalTop">
          <div>
            <div class="modalTitle">Build From Scratch</div>
            <div class="modalSub">Generate topology + staged optimize + auto-grow blocks until targets or max elements.</div>
          </div>
          <button class="modalX" id="bfClose" type="button">✕</button>
        </div>
        <div class="modalScroll">
          <div class="modalGrid">
            <div class="field">
              <label>Target FL (mm)</label>
              <input id="bfTargetFL" type="number" step="0.1" value="${num(ui.optTargetFL?.value, 50).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Target T</label>
              <input id="bfTargetT" type="number" step="0.05" value="${num(ui.optTargetT?.value, 2.0).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Target IC (mm)</label>
              <input id="bfTargetIC" type="number" step="0.1" min="0" value="${Math.max(0, num(ui.optTargetIC?.value, 0)).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Family</label>
              <select id="bfFamily">
                <option value="auto" selected>Auto (${scratchFamilyLabel(curFamily)} now)</option>
                <option value="double_gauss">Double-Gauss</option>
                <option value="retrofocus_wide">Retrofocus Wide</option>
                <option value="telephoto">Telephoto</option>
              </select>
            </div>
            <div class="field">
              <label>Max elements</label>
              <input id="bfMaxElements" type="number" step="1" min="3" max="14" value="8" />
            </div>
            <div class="field">
              <label>Aggressiveness</label>
              <select id="bfAggro">
                <option value="safe">safe</option>
                <option value="normal" selected>normal</option>
                <option value="wild">wild</option>
              </select>
            </div>
            <div class="field">
              <label>Build effort (x)</label>
              <input id="bfEffort" type="number" step="0.1" min="${Number(SCRATCH_CFG.effortMin || 0.6).toFixed(1)}" max="${Number(SCRATCH_CFG.effortMax || 4.0).toFixed(1)}" value="${Number(SCRATCH_CFG.effortDefault || 1.0).toFixed(1)}" />
            </div>
            <div class="field">
              <label>Stop when acceptable</label>
              <select id="bfStopAccept">
                <option value="1" selected>Yes (recommended)</option>
                <option value="0">No (always polish)</option>
              </select>
            </div>
            <div class="fieldFull">
              <div class="hint">
                Sensor currently: ${curSensor.w.toFixed(2)}×${curSensor.h.toFixed(2)}mm.
                Build uses existing mount/physics constraints (PL intrusion/throat, stop in AIR, min CT/gaps).
                Effort > 1.0 gives longer runs and more grow cycles.
              </div>
            </div>
          </div>
        </div>
        <div class="modalBottom">
          <button class="btn" id="bfCancel" type="button">Cancel</button>
          <button class="btn btnPrimary" id="bfRun" type="button">Build</button>
        </div>
      </div>
    `;

    ui.newLensModal.classList.remove("hidden");
    ui.newLensModal.setAttribute("aria-hidden", "false");

    const close = () => {
      ui.newLensModal.classList.add("hidden");
      ui.newLensModal.setAttribute("aria-hidden", "true");
      ui.newLensModal.innerHTML = "";
    };

    ui.newLensModal.querySelector("#bfClose")?.addEventListener("click", close);
    ui.newLensModal.querySelector("#bfCancel")?.addEventListener("click", close);
    ui.newLensModal.addEventListener("click", (e) => {
      if (e.target === ui.newLensModal) close();
    });

    ui.newLensModal.querySelector("#bfRun")?.addEventListener("click", () => {
      const payload = {
        targetEfl: num($("#bfTargetFL")?.value, num(ui.optTargetFL?.value, 50)),
        targetT: Math.max(0, num($("#bfTargetT")?.value, num(ui.optTargetT?.value, 2.0))),
        targetIC: Math.max(0, num($("#bfTargetIC")?.value, num(ui.optTargetIC?.value, 0))),
        family: normalizeScratchFamily($("#bfFamily")?.value || "auto"),
        maxElements: clampScratchMaxElements($("#bfMaxElements")?.value),
        aggressiveness: normalizeScratchAggressiveness($("#bfAggro")?.value || "normal"),
        effort: clampScratchEffort($("#bfEffort")?.value),
        stopWhenAcceptable: String($("#bfStopAccept")?.value || "1") !== "0",
      };
      close();
      buildFromScratchPipeline(payload);
    });
  }

  // -------------------- Scale → FL + Set T --------------------
  function scaleToFocal() {
    const target = num(prompt("Target focal length (mm)?", String(ui.optTargetFL?.value || "75")), NaN);
    if (!Number.isFinite(target) || target <= 1) return;

    const wave = ui.wavePreset?.value || "d";
    computeVertices(lens.surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 1) return toast("Scale failed (EFL not solvable)");

    const k = target / efl;

    for (let i = 0; i < lens.surfaces.length; i++) {
      const s = lens.surfaces[i];
      const t = String(s.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      // scale geometry
      s.R = Number(s.R) * k;
      s.t = Number(s.t) * k;
      s.ap = Number(s.ap) * k;
    }

    // keep sensor half-height (IMS ap)
    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`Scaled ×${k.toFixed(3)} → ${target.toFixed(1)}mm`);
  }

  function setTStop() {
    const targetT = num(prompt("Target T-stop?", String(ui.optTargetT?.value || "2.0")), NaN);
    if (!Number.isFinite(targetT) || targetT <= 0.2) return;

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) return toast("No STOP surface selected");

    const wave = ui.wavePreset?.value || "d";
    computeVertices(lens.surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 1) return toast("Set T failed (EFL not solvable)");

    const desiredStopAp = efl / (2 * targetT);
    lens.surfaces[stopIdx].ap = clamp(desiredStopAp, 0.2, maxApForSurface(lens.surfaces[stopIdx]));

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`STOP ap → ${lens.surfaces[stopIdx].ap.toFixed(2)} (T≈${targetT.toFixed(2)})`);
  }

  // -------------------- save/load JSON --------------------
  function saveJSON() {
    const data = JSON.stringify(lens, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (lens?.name ? lens.name.replace(/[^\w\-]+/g, "_") : "lens") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Saved JSON");
  }

  async function loadJSONFile(file) {
    const txt = await file.text();
    const obj = JSON.parse(txt);
    loadLens(obj);
    toast("Loaded JSON");
  }

  // -------------------- fullscreen (rays) --------------------
  function toggleFullscreen(el) {
    if (!el) return;
    const isFS = document.fullscreenElement;
    if (!isFS) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // ===========================
  // OPTIMIZER
  // ===========================
  let optRunning = false;
  let distOptRunning = false;
  let distOptStopRequested = false;
  let distOptBest = null;
  let sharpOptBest = null;
  let sharpOptRunning = false;
  let sharpOptStopRequested = false;
  let optBest = null; // {lens, score, meta}
  let scratchBuildRunning = false;
  let scratchStopRequested = false;
  let optimizerRunSerial = 0;
  let optRunContext = null;
  let cockpitOptRunning = false;
  let cockpitMacroRunning = false;
  let cockpitStopRequested = false;
  let cockpitBaselineSnapshot = null;
  let cockpitHistory = [];
  let cockpitHistoryIndex = -1;
  let cockpitCompareSnapshot = null;
  let cockpitLiveMetrics = null;
  let cockpitLastEngineResult = null;

  function setOptLog(lines){
    if (!ui.optLog) return;
    ui.optLog.value = String(lines || "");
  }

  function setOptRunContext(ctx) {
    if (!ctx || typeof ctx !== "object") {
      optRunContext = null;
      return;
    }
    const stepIndex = Number(ctx.stepIndex);
    const stepTotal = Number(ctx.stepTotal);
    optRunContext = {
      mode: String(ctx.mode || "").trim(),
      label: String(ctx.label || "").trim(),
      stepIndex: (Number.isFinite(stepIndex) && stepIndex > 0) ? Math.round(stepIndex) : null,
      stepTotal: (Number.isFinite(stepTotal) && stepTotal > 0) ? Math.round(stepTotal) : null,
    };
  }

  function formatOptimizerRunHeader(runNo) {
    const c = optRunContext;
    const base = `Run #${Math.max(1, Number(runNo) || 1)}`;
    if (!c) return base;
    const modeTxt = c.mode ? ` • ${c.mode}` : "";
    const stepTxt = (c.stepIndex && c.stepTotal) ? ` • Step ${c.stepIndex}/${c.stepTotal}` : "";
    const labelTxt = c.label ? ` • ${c.label}` : "";
    return `${base}${modeTxt}${stepTxt}${labelTxt}`;
  }

  function setCockpitProgress(ratio, text = "") {
    const r = clamp(Number(ratio || 0), 0, 1);
    if (ui.cockpitProgress) ui.cockpitProgress.value = r;
    if (ui.cockpitProgressText) {
      ui.cockpitProgressText.textContent = text
        ? String(text)
        : (r <= 1e-6 ? "Idle" : `${Math.round(r * 100)}%`);
    }
  }

  function ensureToolbarStartVisible() {
    const tb = ui.toolbar || document.querySelector(".toolbar");
    if (!tb) return;
    try { tb.scrollLeft = 0; } catch(_) {}
  }

  function setCockpitButtonsBusy(busy) {
    const on = !!busy;
    [
      ui.btnBaselineLens,
      ui.btnOptEfl,
      ui.btnOptTLocal,
      ui.btnOptICLocal,
      ui.btnOptDistLocal,
      ui.btnOptSharpLocal,
      ui.btnOptAllMacro,
      ui.btnSnapshotSave,
      ui.btnSnapshotUndo,
      ui.btnSnapshotRedo,
      ui.btnSnapshotCompare,
    ].forEach((el) => {
      if (el) el.disabled = on;
    });
  }

  function getCockpitSettings() {
    const stepSize = clamp(num(ui.cockpitStep?.value, COCKPIT_CFG.defaultStepSize), 0.01, 0.20);
    const iters = clamp(
      Math.round(num(ui.cockpitIters?.value, num(ui.optIters?.value, COCKPIT_CFG.defaultIters))),
      COCKPIT_CFG.minIterations,
      COCKPIT_CFG.maxIterations
    );
    const strictness = String(ui.cockpitStrictness?.value || "normal").toLowerCase() === "strict"
      ? "strict"
      : "normal";
    const surfaceMode = String(ui.cockpitSurfaceMode?.value || "auto").toLowerCase() === "manual"
      ? "manual"
      : "auto";
    const macroPasses = clamp(
      Math.round(num(ui.cockpitMacroPasses?.value, COCKPIT_CFG.defaultMacroPasses)),
      1,
      3
    );
    return {
      iterations: iters,
      stepSize,
      strictness,
      surfaceMode,
      rangeStart: Math.max(1, Math.round(num(ui.cockpitSurfaceStart?.value, 1))),
      rangeEnd: Math.max(1, Math.round(num(ui.cockpitSurfaceEnd?.value, 12))),
      anneal: !!ui.cockpitAnneal?.checked,
      macroPasses,
    };
  }

  function getCockpitTargets() {
    return {
      targetEfl: clamp(Math.abs(num(ui.optTargetFL?.value, 50)), 5, 500),
      targetT: Math.max(0.25, num(ui.optTargetT?.value, 2.0)),
      targetIC: Math.max(0, num(ui.optTargetIC?.value, 0)),
    };
  }

  function snapshotHash(snapshotObj) {
    if (!snapshotObj) return "";
    return JSON.stringify({
      lens: snapshotObj?.lens?.surfaces || [],
      focus: snapshotObj?.focus || {},
    });
  }

  function captureCurrentCockpitSnapshot(label = "Snapshot", metricsOverride = null) {
    const focus = getFocusStateFromUi();
    const sensor = getSensorWH();
    const wavePreset = ui.wavePreset?.value || "d";
    const metrics = metricsOverride || computeMetrics({
      surfaces: lens.surfaces,
      wavePreset,
      focusMode: focus.focusMode,
      sensorX: focus.sensorX,
      lensShift: focus.lensShift,
      sensorW: sensor.w,
      sensorH: sensor.h,
      rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
      lutN: 240,
      includeDistortion: true,
      includeSharpness: true,
      autofocus: false,
      useCache: true,
    });
    const snap = {
      label: String(label || "Snapshot"),
      at: Date.now(),
      lens: sanitizeLens(clone(lens)),
      focus: {
        focusMode: focus.focusMode,
        sensorX: Number(focus.sensorX || 0),
        lensShift: Number(focus.lensShift || 0),
      },
      metrics,
    };
    snap.hash = snapshotHash(snap);
    return snap;
  }

  function pushCockpitSnapshot(snapshotObj) {
    if (!snapshotObj?.lens?.surfaces) return false;
    const last = cockpitHistoryIndex >= 0 ? cockpitHistory[cockpitHistoryIndex] : null;
    if (last?.hash && snapshotObj.hash && last.hash === snapshotObj.hash) return false;
    if (cockpitHistoryIndex < cockpitHistory.length - 1) {
      cockpitHistory = cockpitHistory.slice(0, cockpitHistoryIndex + 1);
    }
    cockpitHistory.push(snapshotObj);
    if (cockpitHistory.length > 80) cockpitHistory.shift();
    cockpitHistoryIndex = cockpitHistory.length - 1;
    return true;
  }

  function recordCockpitSnapshot(label = "Snapshot", metricsOverride = null) {
    const snap = captureCurrentCockpitSnapshot(label, metricsOverride);
    const pushed = pushCockpitSnapshot(snap);
    updateSnapshotButtonsState();
    return { pushed, snapshot: snap };
  }

  function applyCockpitSnapshot(snapshotObj, toastMsg = "") {
    if (!snapshotObj?.lens?.surfaces) return false;
    loadLens(snapshotObj.lens);
    const f = snapshotObj.focus || {};
    const fm = String(f.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    if (ui.focusMode) ui.focusMode.value = fm;
    if (ui.sensorOffset) ui.sensorOffset.value = Number(f.sensorX || 0).toFixed(3);
    if (ui.lensFocus) ui.lensFocus.value = Number(f.lensShift || 0).toFixed(3);
    renderAll();
    scheduleRenderPreviewIfAvailable();
    scheduleAutosave();
    if (toastMsg) toast(toastMsg);
    return true;
  }

  function setCockpitBaselineFromCurrent(label = "Baseline") {
    const snap = captureCurrentCockpitSnapshot(label);
    cockpitBaselineSnapshot = snap;
    cockpitCompareSnapshot = snap;
    if (ui.cockpitCompareInfo) {
      ui.cockpitCompareInfo.textContent = `Baseline: ${snap.label} (${new Date(snap.at).toLocaleTimeString()})`;
    }
    updateSnapshotButtonsState();
    return snap;
  }

  function updateSnapshotButtonsState() {
    if (ui.btnSnapshotUndo) ui.btnSnapshotUndo.disabled = cockpitOptRunning || cockpitMacroRunning || cockpitHistoryIndex <= 0;
    if (ui.btnSnapshotRedo) ui.btnSnapshotRedo.disabled = cockpitOptRunning || cockpitMacroRunning || cockpitHistoryIndex >= cockpitHistory.length - 1;
    if (ui.btnSnapshotCompare) ui.btnSnapshotCompare.disabled = cockpitOptRunning || cockpitMacroRunning || cockpitHistory.length <= 0;
  }

  function markCockpitStepLabel() {
    if (!ui.cockpitStepOut || !ui.cockpitStep) return;
    ui.cockpitStepOut.textContent = num(ui.cockpitStep.value, COCKPIT_CFG.defaultStepSize).toFixed(3);
  }

  function syncCockpitRangeInputs() {
    const manual = String(ui.cockpitSurfaceMode?.value || "auto").toLowerCase() === "manual";
    if (ui.cockpitSurfaceStart) ui.cockpitSurfaceStart.disabled = !manual;
    if (ui.cockpitSurfaceEnd) ui.cockpitSurfaceEnd.disabled = !manual;
  }

  function deltaToneClass(metricKey, currentVal, baseVal, ctx = {}) {
    const cur = Number(currentVal);
    const base = Number(baseVal);
    if (!Number.isFinite(cur) || !Number.isFinite(base)) return "neutral";
    const targetEfl = Number(ctx.targetEfl);
    const targetT = Number(ctx.targetT);
    if (metricKey === "efl" && Number.isFinite(targetEfl) && targetEfl > 0) {
      const cErr = Math.abs(cur - targetEfl);
      const bErr = Math.abs(base - targetEfl);
      return cErr < bErr - 1e-6 ? "good" : (cErr > bErr + 1e-6 ? "bad" : "neutral");
    }
    if (metricKey === "t" && Number.isFinite(targetT) && targetT > 0) {
      const cSlow = Math.max(0, cur - targetT);
      const bSlow = Math.max(0, base - targetT);
      return cSlow < bSlow - 1e-6 ? "good" : (cSlow > bSlow + 1e-6 ? "bad" : "neutral");
    }
    if (metricKey === "dist" || metricKey === "sharp" || metricKey === "feas") {
      return cur < base - 1e-6 ? "good" : (cur > base + 1e-6 ? "bad" : "neutral");
    }
    return cur > base + 1e-6 ? "good" : (cur < base - 1e-6 ? "bad" : "neutral");
  }

  function setCockpitDelta(el, text, tone = "neutral") {
    if (!el) return;
    el.textContent = String(text || "—");
    el.classList.remove("good", "bad", "neutral");
    el.classList.add(tone === "good" ? "good" : (tone === "bad" ? "bad" : "neutral"));
  }

  function updateCockpitMetricsTable(metricsObj) {
    if (!metricsObj || typeof metricsObj !== "object") return;
    cockpitLiveMetrics = metricsObj;
    const targetEfl = num(ui.optTargetFL?.value, NaN);
    const targetT = num(ui.optTargetT?.value, NaN);
    const base = cockpitCompareSnapshot?.metrics || cockpitBaselineSnapshot?.metrics || null;

    const efl = Number(metricsObj?.efl);
    const bfl = Number(metricsObj?.bfl);
    const t = Number(metricsObj?.T);
    const cov = Number(metricsObj?.maxFieldDeg);
    const covYes = !!metricsObj?.coversGeom;
    const ic = Number(metricsObj?.usableIC?.diameterMm);
    const d70 = Number(metricsObj?.distortion?.dist70Pct);
    const drms = Number(metricsObj?.distortion?.rmsPct);
    const sc = Number(metricsObj?.sharpness?.rmsCenter);
    const se = Number(metricsObj?.sharpness?.rmsEdge);
    const feasOk = !!metricsObj?.feasible?.ok;
    const intr = Number(metricsObj?.feasible?.plIntrusionMm);
    const reasons = Array.isArray(metricsObj?.feasible?.reasons) ? metricsObj.feasible.reasons : [];

    if (ui.cockpitValEfl) ui.cockpitValEfl.textContent = Number.isFinite(efl) ? `${efl.toFixed(2)} mm` : "—";
    if (ui.cockpitValBfl) ui.cockpitValBfl.textContent = Number.isFinite(bfl) ? `${bfl.toFixed(2)} mm` : "—";
    if (ui.cockpitValT) ui.cockpitValT.textContent = Number.isFinite(t) ? `T${t.toFixed(2)}` : "—";
    if (ui.cockpitValCov) ui.cockpitValCov.textContent = Number.isFinite(cov) ? `${cov.toFixed(2)}° • COV ${covYes ? "YES" : "NO"}` : "—";
    if (ui.cockpitValIc) ui.cockpitValIc.textContent = Number.isFinite(ic) ? `Ø${ic.toFixed(2)} mm` : "—";
    if (ui.cockpitValDist) {
      ui.cockpitValDist.textContent =
        `${Number.isFinite(d70) ? d70.toFixed(2) : "—"}% @0.7D • RMS ${Number.isFinite(drms) ? drms.toFixed(2) : "—"}%`;
    }
    if (ui.cockpitValSharp) {
      ui.cockpitValSharp.textContent =
        `C/E ${Number.isFinite(sc) ? sc.toFixed(3) : "—"} / ${Number.isFinite(se) ? se.toFixed(3) : "—"} mm`;
    }
    if (ui.cockpitValFeas) {
      ui.cockpitValFeas.textContent = feasOk
        ? `OK • intr ${Number.isFinite(intr) ? intr.toFixed(2) : "—"}mm`
        : `FAIL • intr ${Number.isFinite(intr) ? intr.toFixed(2) : "—"}mm${reasons.length ? ` • ${reasons.join(",")}` : ""}`;
    }

    if (!base) {
      [
        ui.cockpitDeltaEfl,
        ui.cockpitDeltaBfl,
        ui.cockpitDeltaT,
        ui.cockpitDeltaCov,
        ui.cockpitDeltaIc,
        ui.cockpitDeltaDist,
        ui.cockpitDeltaSharp,
        ui.cockpitDeltaFeas,
      ].forEach((el) => setCockpitDelta(el, "—", "neutral"));
      if (ui.cockpitCompareInfo && !cockpitCompareSnapshot) ui.cockpitCompareInfo.textContent = "No baseline yet";
      updateSnapshotButtonsState();
      return;
    }

    const bEfl = Number(base?.efl);
    const bBfl = Number(base?.bfl);
    const bT = Number(base?.T);
    const bCov = Number(base?.maxFieldDeg);
    const bIc = Number(base?.usableIC?.diameterMm);
    const bD = Number(base?.distortion?.rmsPct);
    const bSc = Number(base?.sharpness?.rmsCenter);
    const bSe = Number(base?.sharpness?.rmsEdge);
    const bFeas = !!base?.feasible?.ok;
    const bIntr = Number(base?.feasible?.plIntrusionMm);

    const ctx = { targetEfl, targetT };
    setCockpitDelta(
      ui.cockpitDeltaEfl,
      (Number.isFinite(efl) && Number.isFinite(bEfl)) ? `${(efl - bEfl) >= 0 ? "+" : ""}${(efl - bEfl).toFixed(2)} mm` : "—",
      deltaToneClass("efl", efl, bEfl, ctx)
    );
    setCockpitDelta(
      ui.cockpitDeltaBfl,
      (Number.isFinite(bfl) && Number.isFinite(bBfl)) ? `${(bfl - bBfl) >= 0 ? "+" : ""}${(bfl - bBfl).toFixed(2)} mm` : "—",
      deltaToneClass("bfl", bfl, bBfl, ctx)
    );
    setCockpitDelta(
      ui.cockpitDeltaT,
      (Number.isFinite(t) && Number.isFinite(bT)) ? `${(t - bT) >= 0 ? "+" : ""}${(t - bT).toFixed(2)}` : "—",
      deltaToneClass("t", t, bT, ctx)
    );
    setCockpitDelta(
      ui.cockpitDeltaCov,
      (Number.isFinite(cov) && Number.isFinite(bCov)) ? `${(cov - bCov) >= 0 ? "+" : ""}${(cov - bCov).toFixed(2)}°` : "—",
      deltaToneClass("cov", cov, bCov, ctx)
    );
    setCockpitDelta(
      ui.cockpitDeltaIc,
      (Number.isFinite(ic) && Number.isFinite(bIc)) ? `${(ic - bIc) >= 0 ? "+" : ""}${(ic - bIc).toFixed(2)} mm` : "—",
      deltaToneClass("ic", ic, bIc, ctx)
    );
    setCockpitDelta(
      ui.cockpitDeltaDist,
      (Number.isFinite(drms) && Number.isFinite(bD)) ? `${(drms - bD) >= 0 ? "+" : ""}${(drms - bD).toFixed(2)}%` : "—",
      deltaToneClass("dist", Math.abs(drms), Math.abs(bD), ctx)
    );
    const sCur = Number.isFinite(sc) && Number.isFinite(se) ? (0.40 * sc + 0.60 * se) : NaN;
    const sBase = Number.isFinite(bSc) && Number.isFinite(bSe) ? (0.40 * bSc + 0.60 * bSe) : NaN;
    setCockpitDelta(
      ui.cockpitDeltaSharp,
      (Number.isFinite(sCur) && Number.isFinite(sBase)) ? `${(sCur - sBase) >= 0 ? "+" : ""}${(sCur - sBase).toFixed(3)} mm` : "—",
      deltaToneClass("sharp", sCur, sBase, ctx)
    );
    const feasScore = (feasOk ? 0 : 1) + Math.max(0, intr);
    const bFeasScore = (bFeas ? 0 : 1) + Math.max(0, bIntr);
    setCockpitDelta(
      ui.cockpitDeltaFeas,
      (Number.isFinite(intr) && Number.isFinite(bIntr))
        ? `${(intr - bIntr) >= 0 ? "+" : ""}${(intr - bIntr).toFixed(2)} mm`
        : "—",
      deltaToneClass("feas", feasScore, bFeasScore, ctx)
    );
    updateSnapshotButtonsState();
  }

  function postOptAutoApplyEnabled() {
    return !!ui.optAutoApply?.checked;
  }

  function queueManualBestFromState(bestLens, state, meta = {}) {
    if (!bestLens?.surfaces || !Array.isArray(bestLens.surfaces)) return false;
    const phys = state?.phys || {};
    const cross = state?.cross || {};
    const focusMode = String(meta?.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sensorX = Number(meta?.sensorX ?? state?.focus?.sensorX ?? num(ui.sensorOffset?.value, 0));
    const lensShift = Number(meta?.lensShift ?? state?.focus?.lensShift ?? num(ui.lensFocus?.value, 0));
    const scoreGuess =
      Number(state?.sharp?.score) ||
      Number(state?.distScore) ||
      Number(state?.score) ||
      0;
    optBest = {
      lens: sanitizeLens(clone(bestLens)),
      eval: {
        score: Number.isFinite(scoreGuess) ? scoreGuess : 0,
        efl: Number.isFinite(Number(state?.efl)) ? Number(state.efl) : null,
        T: Number.isFinite(Number(state?.T)) ? Number(state.T) : null,
        bfl: Number.isFinite(Number(state?.bfl)) ? Number(state.bfl) : null,
        intrusion: Number.isFinite(Number(state?.intrusion)) ? Number(state.intrusion) : 0,
        physPenalty: Number.isFinite(Number(phys?.penalty)) ? Number(phys.penalty) : 0,
        worstOverlap: Number.isFinite(Number(phys?.worstOverlap)) ? Number(phys.worstOverlap) : 0,
        worstPinch: Number.isFinite(Number(phys?.worstPinch)) ? Number(phys.worstPinch) : 0,
        hardInvalid: false,
        internalCrossPairs: Math.max(0, Number(cross?.crossPairs || 0)),
        internalCrossSegments: Math.max(0, Number(cross?.crossSegments || 0)),
        lensShift,
        softIcMm: Number.isFinite(Number(meta?.softIcMm)) ? Number(meta.softIcMm) : 0,
        rms0: Number.isFinite(Number(state?.sharp?.centerRmsMm)) ? Number(state.sharp.centerRmsMm) : null,
        rmsE: Number.isFinite(Number(state?.sharp?.edgeRmsMm)) ? Number(state.sharp.edgeRmsMm) : null,
        distEdgePct: Number.isFinite(Number(state?.dist70Pct)) ? Number(state.dist70Pct) : null,
      },
      iter: Number(meta?.iter || 0),
      meta: {
        source: String(meta?.source || "post-opt"),
        focusMode,
        sensorX: Number.isFinite(sensorX) ? sensorX : 0,
        lensShift: Number.isFinite(lensShift) ? lensShift : 0,
      },
    };
    return true;
  }

  function queueDistortionBest(bestLens, state, meta = {}) {
    if (!bestLens?.surfaces || !Array.isArray(bestLens.surfaces)) return false;
    const focusMode = String(meta?.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sensorX = Number(meta?.sensorX ?? 0);
    const lensShift = Number(meta?.lensShift ?? 0);
    distOptBest = {
      lens: sanitizeLens(clone(bestLens)),
      meta: {
        focusMode,
        sensorX: Number.isFinite(sensorX) ? sensorX : 0,
        lensShift: Number.isFinite(lensShift) ? lensShift : 0,
        runNo: Number(meta?.runNo || 0),
      },
      state: {
        efl: Number.isFinite(Number(state?.efl)) ? Number(state.efl) : null,
        T: Number.isFinite(Number(state?.T)) ? Number(state.T) : null,
        dist70Pct: Number.isFinite(Number(state?.dist?.distPctAt70))
          ? Number(state.dist.distPctAt70)
          : (Number.isFinite(Number(state?.dist70Pct)) ? Number(state.dist70Pct) : null),
        rmsDistPct: Number.isFinite(Number(state?.dist?.rmsDistPct))
          ? Number(state.dist.rmsDistPct)
          : null,
      },
    };
    return true;
  }

  function applyDistortionBest() {
    if (!distOptBest?.lens?.surfaces) return toast("No distortion best yet");
    if (optRunning || distOptRunning || sharpOptRunning || scratchBuildRunning) {
      return toast("Stop running optimizer/build first.");
    }
    recordCockpitSnapshot("Dist pre-apply");
    loadLens(distOptBest.lens);
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    if (ui.lensFocus) ui.lensFocus.value = "0";
    autoFocus();
    scheduleRenderPreviewIfAvailable();
    scheduleAutosave();
    recordCockpitSnapshot("Dist applied");
    const d70 = Number(distOptBest?.state?.dist70Pct);
    toast(`Applied Dist best${Number.isFinite(d70) ? ` (@0.7D ${d70.toFixed(2)}%)` : ""}`);
  }

  function queueSharpnessBest(bestLens, state, meta = {}) {
    if (!bestLens?.surfaces || !Array.isArray(bestLens.surfaces)) return false;
    const focusMode = String(meta?.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sensorX = Number(meta?.sensorX ?? state?.focus?.sensorX ?? 0);
    const lensShift = Number(meta?.lensShift ?? state?.focus?.lensShift ?? 0);
    sharpOptBest = {
      lens: sanitizeLens(clone(bestLens)),
      meta: {
        focusMode,
        sensorX: Number.isFinite(sensorX) ? sensorX : 0,
        lensShift: Number.isFinite(lensShift) ? lensShift : 0,
        runNo: Number(meta?.runNo || 0),
      },
      state: {
        efl: Number.isFinite(Number(state?.efl)) ? Number(state.efl) : null,
        T: Number.isFinite(Number(state?.T)) ? Number(state.T) : null,
        centerRmsMm: Number.isFinite(Number(state?.sharp?.centerRmsMm)) ? Number(state.sharp.centerRmsMm) : null,
        edgeRmsMm: Number.isFinite(Number(state?.sharp?.edgeRmsMm)) ? Number(state.sharp.edgeRmsMm) : null,
        sharpScore: Number.isFinite(Number(state?.sharp?.score)) ? Number(state.sharp.score) : null,
      },
    };
    return true;
  }

  function applySharpnessBest() {
    if (!sharpOptBest?.lens?.surfaces) return toast("No sharpness best yet");
    if (optRunning || distOptRunning || sharpOptRunning || scratchBuildRunning) {
      return toast("Stop running optimizer/build first.");
    }
    recordCockpitSnapshot("Sharp pre-apply");
    loadLens(sharpOptBest.lens);
    const m = sharpOptBest.meta || {};
    const fm = String(m.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    if (ui.focusMode) ui.focusMode.value = fm;
    if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(Number(m.sensorX))
      ? Number(m.sensorX).toFixed(3)
      : "0";
    if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(Number(m.lensShift))
      ? Number(m.lensShift).toFixed(3)
      : "0";
    renderAll();
    scheduleRenderPreviewIfAvailable();
    scheduleAutosave();
    recordCockpitSnapshot("Sharp applied");
    const c = Number(sharpOptBest?.state?.centerRmsMm);
    const e = Number(sharpOptBest?.state?.edgeRmsMm);
    toast(`Applied Sharp best${Number.isFinite(c) && Number.isFinite(e) ? ` (C/E ${c.toFixed(3)}/${e.toFixed(3)}mm)` : ""}`);
  }

  function cockpitResolveSurfaceIndices(surfaces, settings, preferRear = false) {
    const n = Math.max(0, Number(surfaces?.length || 0));
    if (n < 3) return [];
    let start = 1;
    let end = n - 2;
    if (String(settings?.surfaceMode || "auto").toLowerCase() === "manual") {
      start = clamp(Math.round(Number(settings?.rangeStart || 1)), 1, n - 2);
      end = clamp(Math.round(Number(settings?.rangeEnd || (n - 2))), 1, n - 2);
      if (end < start) [start, end] = [end, start];
    } else {
      const stopIdx = findStopSurfaceIndex(surfaces);
      if (stopIdx >= 0) {
        start = Math.max(1, stopIdx - 6);
        end = Math.min(n - 2, Math.max(stopIdx + 8, n - 8));
      }
    }
    const idx = [];
    for (let i = start; i <= end; i++) {
      const s = surfaces[i];
      if (!s || surfaceIsLocked(s)) continue;
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      idx.push(i);
    }
    if (!preferRear) return idx;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const rear = idx.filter((i) => i > stopIdx);
    return rear.length ? rear : idx;
  }

  function cockpitScaleLensByFactor(surfaces, k, opts = {}) {
    const kk = Number(k);
    if (!Array.isArray(surfaces) || !(Number.isFinite(kk) && kk > 0)) return false;
    const keepAperture = opts?.keepAperture !== false;
    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    const apScale = keepAperture
      ? (kk >= 1 ? Math.pow(kk, 0.20) : Math.max(0.995, Math.pow(Math.max(1e-6, kk), 0.08)))
      : Math.sqrt(Math.max(1e-6, kk));
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      s.R = Number(s.R || 0) * kk;
      if (i === rearIdx) {
        s.t = Math.max(PHYS_CFG.minAirGap, Number(s.t || 0));
        s.glass = "AIR";
      } else {
        s.t = clamp(Number(s.t || 0) * kk, PHYS_CFG.minThickness, PHYS_CFG.maxThickness);
      }
      s.ap = clamp(Number(s.ap || 0) * apScale, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      enforceApertureRadiusCoupling(s, keepAperture ? 1.03 : 1.08);
    }
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function mutateEflCandidate(lensObj, ctx = {}) {
    const surfaces = lensObj?.surfaces;
    if (!Array.isArray(surfaces)) return { ok: false, reason: "lens" };
    const curEfl = Number(ctx?.currentMetrics?.efl);
    const targetEfl = Number(ctx?.targets?.targetEfl);
    if (!(Number.isFinite(curEfl) && curEfl > 1e-6 && Number.isFinite(targetEfl) && targetEfl > 1e-6)) {
      return { ok: false, reason: "efl" };
    }
    const strict = String(ctx?.settings?.strictness || "normal").toLowerCase() === "strict";
    const stepUi = clamp(Number(ctx?.settings?.stepSize || COCKPIT_CFG.defaultStepSize), 0.01, 0.20);
    const kGoal = targetEfl / curEfl;
    const errRelSigned = (targetEfl - curEfl) / Math.max(1e-9, curEfl);
    const dir = Math.sign(errRelSigned);
    if (!Number.isFinite(dir) || dir === 0) return { ok: false, reason: "target_met" };

    // Use small directional steps first; large fixed FL jumps were causing hard rejects only.
    let maxStep = Math.min(stepUi, Math.max(0.008, Math.abs(errRelSigned) * 0.55));
    let minStep = Math.max(0.0015, maxStep * 0.12);

    if (dir < 0) {
      const curBfl = Number(ctx?.currentMetrics?.bfl);
      const bflFloor = strict
        ? (PL_FFD - 0.45)
        : (PL_FFD - Number(COCKPIT_CFG.maxBflShortRejectMm || 1.0));
      if (Number.isFinite(curBfl)) {
        const margin = curBfl - bflFloor;
        if (margin < 1.2) {
          maxStep = Math.min(maxStep, 0.006 + Math.max(0, margin) * 0.006);
          minStep = Math.min(minStep, maxStep);
        }
      }
    }
    if (!(maxStep > 1e-6)) return { ok: false, reason: "step" };

    let stepMag = randRange(Math.max(1e-4, minStep), maxStep);
    if (Math.random() < 0.25) stepMag *= 0.35;
    let k = 1 + dir * stepMag;
    const kGoalBlend = clamp(1 + (kGoal - 1) * randRange(0.08, 0.45), 1 - stepUi, 1 + stepUi);
    if (Math.random() < 0.35) k = (k * 0.6) + (kGoalBlend * 0.4);
    k = clamp(k, 1 - stepUi, 1 + stepUi);
    if (dir < 0) k = Math.min(k, 0.9995);
    if (dir > 0) k = Math.max(k, 1.0005);
    if (!(Number.isFinite(k) && k > 0 && Math.abs(k - 1) > 1e-6)) return { ok: false, reason: "scale" };

    cockpitScaleLensByFactor(surfaces, k, { keepAperture: true });

    // Keep BFL viable while pulling EFL down by expanding image-space gap when needed.
    if (dir < 0) {
      const rearIdx = findScratchRearSurfaceIndex(surfaces);
      if (rearIdx >= 0) {
        const rear = surfaces[rearIdx];
        const curBfl = Number(ctx?.currentMetrics?.bfl);
        const predBfl = Number.isFinite(curBfl) ? (curBfl * k) : NaN;
        const bflFloor = strict
          ? (PL_FFD - 0.45)
          : (PL_FFD - Number(COCKPIT_CFG.maxBflShortRejectMm || 1.0));
        const safety = strict ? 0.22 : 0.45;
        if (Number.isFinite(predBfl) && predBfl < (bflFloor + safety)) {
          const need = (bflFloor + safety) - predBfl;
          rear.t = clamp(
            Number(rear.t || 0) + need,
            Math.max(PHYS_CFG.minAirGap, PL_FFD + 0.8),
            PL_FFD + 95
          );
        }
      }
    }
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return { ok: true, kind: "scale", scale: k };
  }

  function mutateTCandidate(lensObj, ctx = {}) {
    const surfaces = lensObj?.surfaces;
    if (!Array.isArray(surfaces)) return { ok: false, reason: "lens" };
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };
    const stop = surfaces[stopIdx];
    const step = clamp(Number(ctx?.settings?.stepSize || COCKPIT_CFG.defaultStepSize), 0.01, 0.20);
    const curT = Number(ctx?.currentMetrics?.T);
    const tgtT = Number(ctx?.targets?.targetT);
    let dir = 1;
    if (Number.isFinite(curT) && Number.isFinite(tgtT)) {
      if (curT < tgtT * 0.80) dir = -1;
      else if (curT > tgtT) dir = 1;
      else dir = Math.random() < 0.75 ? 1 : -1;
    }
    const pct = randRange(Math.max(0.002, step * 0.05), Math.max(0.006, step * 0.35));
    const factor = 1 + dir * pct;
    stop.ap = clamp(Number(stop.ap || 0) * factor, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    for (let d = 1; d <= 2; d++) {
      const idx = stopIdx + d;
      if (idx <= 0 || idx >= surfaces.length - 1) continue;
      const s = surfaces[idx];
      if (!s || surfaceIsLocked(s)) continue;
      if (dir > 0) {
        const floor = Number(stop.ap || 0) * (0.88 - d * 0.12);
        if (Number(s.ap || 0) < floor) s.ap = clamp(floor, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      }
      enforceApertureRadiusCoupling(s, 1.08);
    }
    quickSanity(surfaces);
    return { ok: true, kind: "stop_ap", factor };
  }

  function mutateIcCandidate(lensObj, ctx = {}) {
    const surfaces = lensObj?.surfaces;
    if (!Array.isArray(surfaces)) return { ok: false, reason: "lens" };
    const settings = ctx?.settings || {};
    const step = clamp(Number(settings.stepSize || COCKPIT_CFG.defaultStepSize), 0.01, 0.20);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };
    const idxAll = cockpitResolveSurfaceIndices(surfaces, settings, false);
    const idxRear = cockpitResolveSurfaceIndices(surfaces, settings, true);
    if (!idxAll.length) return { ok: false, reason: "range" };

    const airCandidates = idxRear.filter((i) => {
      const s = surfaces[i];
      if (!s || surfaceIsLocked(s)) return false;
      const mediumAfter = String(resolveGlassName(s?.glass || "AIR")).toUpperCase();
      return mediumAfter === "AIR";
    });
    const apCandidates = idxRear.length ? idxRear : idxAll;
    const bendCandidates = idxAll.filter((i) => {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "STOP" || t === "OBJ" || t === "IMS") return false;
      return Math.abs(Number(s?.R || 0)) > 1e-6;
    });

    const r = Math.random();
    if (r < 0.42 && airCandidates.length) {
      const idx = pick(airCandidates);
      const s = surfaces[idx];
      const baseDelta = clamp(0.05 + step * 1.1, 0.05, 0.80);
      const needIc = Number(ctx?.targets?.targetIC || 0) > Number(ctx?.currentMetrics?.usableIC?.diameterMm || 0);
      const delta = needIc
        ? randRange(0.03, baseDelta)
        : randRange(-baseDelta, baseDelta);
      s.t = clamp(Number(s.t || 0) + delta, PHYS_CFG.minAirGap, 24);
      quickSanity(surfaces);
      return { ok: true, kind: "air_gap", idx };
    }

    if (r < 0.78 && apCandidates.length) {
      const idx = pick(apCandidates);
      const s = surfaces[idx];
      const gain = 1 + randRange(0.004, Math.max(0.01, step * 0.65));
      s.ap = clamp(Number(s.ap || 0) * gain, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      enforceApertureRadiusCoupling(s, 1.08);
      quickSanity(surfaces);
      return { ok: true, kind: "aperture", idx };
    }

    if (bendCandidates.length) {
      const idx = pick(bendCandidates);
      const s = surfaces[idx];
      const R0 = Number(s?.R || 0);
      const sign = Math.sign(R0 || 1) || 1;
      const absR = Math.max(PHYS_CFG.minRadius, Math.abs(R0));
      const frac = randRange(0.002, Math.max(0.004, step * 0.20));
      const delta = Math.random() < 0.5 ? -frac : frac;
      s.R = sign * clamp(absR * (1 + delta), PHYS_CFG.minRadius, 650);
      enforceApertureRadiusCoupling(s, 1.08);
      quickSanity(surfaces);
      return { ok: true, kind: "bend", idx };
    }

    return { ok: false, reason: "mut" };
  }

  function cockpitSummaryToast(label, before, after) {
    const bEfl = Number(before?.efl);
    const aEfl = Number(after?.efl);
    const bT = Number(before?.T);
    const aT = Number(after?.T);
    const bIc = Number(before?.usableIC?.diameterMm);
    const aIc = Number(after?.usableIC?.diameterMm);
    const bDr = Number(before?.distortion?.rmsPct);
    const aDr = Number(after?.distortion?.rmsPct);
    const bSe = Number(before?.sharpness?.rmsEdge);
    const aSe = Number(after?.sharpness?.rmsEdge);
    return `${label}: ` +
      `Dist ${Number.isFinite(bDr) ? bDr.toFixed(2) : "—"}%→${Number.isFinite(aDr) ? aDr.toFixed(2) : "—"}% | ` +
      `EFL drift ${Number.isFinite(aEfl) && Number.isFinite(bEfl) ? ((aEfl - bEfl) >= 0 ? "+" : "") + (aEfl - bEfl).toFixed(2) : "—"}mm | ` +
      `T ${Number.isFinite(bT) ? bT.toFixed(2) : "—"}→${Number.isFinite(aT) ? aT.toFixed(2) : "—"} | ` +
      `IC ${Number.isFinite(bIc) ? bIc.toFixed(1) : "—"}→${Number.isFinite(aIc) ? aIc.toFixed(1) : "—"}mm | ` +
      `SharpE ${Number.isFinite(bSe) ? bSe.toFixed(3) : "—"}→${Number.isFinite(aSe) ? aSe.toFixed(3) : "—"}mm`;
  }

  async function runCockpitOptimizerEngine({
    label = "Local Optimizer",
    objectiveFn = null,
    mutateFn = null,
    guardFn = null,
    iterations = null,
    includeUsableIC = true,
    includeDistortion = true,
    includeSharpness = true,
    autofocusCandidates = false,
    rayCount = null,
    lutN = null,
    anneal = null,
    applyBestNow = true,
    nested = false,
    runContext = null,
    silent = false,
    allowedBaselineHardReasons = [],
  } = {}) {
    if (!nested) {
      if (cockpitOptRunning || cockpitMacroRunning) return null;
      if (optRunning || scratchBuildRunning || distOptRunning || sharpOptRunning) {
        toast("Stop other optimizer/build runs first.");
        return null;
      }
    }
    if (typeof objectiveFn !== "function" || typeof mutateFn !== "function") return null;

    const settings = getCockpitSettings();
    const targets = getCockpitTargets();
    const sensor = getSensorWH();
    const focus = getFocusStateFromUi();
    const wavePreset = ui.wavePreset?.value || "d";
    const iters = clamp(
      Math.round(Number(iterations ?? settings.iterations)),
      COCKPIT_CFG.minIterations,
      COCKPIT_CFG.maxIterations
    );
    const useAnneal = anneal == null ? !!settings.anneal : !!anneal;
    const evalRayCount = clamp(Number(rayCount ?? num(ui.rayCount?.value, COCKPIT_CFG.defaultRayCount)) | 0, 11, 41);
    const evalLutN = clamp(Number(lutN ?? COCKPIT_CFG.defaultLutN) | 0, 120, 900);
    const runNo = ++optimizerRunSerial;
    const prevCtx = optRunContext;
    const ctxObj = runContext && typeof runContext === "object"
      ? {
          mode: runContext.mode || label,
          label: runContext.label || "local tune",
          stepIndex: runContext.stepIndex,
          stepTotal: runContext.stepTotal,
        }
      : { mode: label, label: "local tune" };
    setOptRunContext(ctxObj);
    const runHeader = formatOptimizerRunHeader(runNo);

    if (!nested) {
      cockpitOptRunning = true;
      cockpitStopRequested = false;
      setCockpitButtonsBusy(true);
      setCockpitProgress(0, `${label} • init`);
    }

    try {
      const baseLens = sanitizeLens(clone(lens));
      const baseMetrics = computeMetrics({
        surfaces: baseLens.surfaces,
        wavePreset,
        focusMode: focus.focusMode,
        sensorX: focus.sensorX,
        lensShift: focus.lensShift,
        sensorW: sensor.w,
        sensorH: sensor.h,
        objDist: COCKPIT_CFG.defaultObjDistMm,
        rayCount: evalRayCount,
        lutN: evalLutN,
        includeUsableIC,
        includeDistortion,
        includeSharpness,
        autofocus: false,
        useCache: false,
      });
      if (!nested) recordCockpitSnapshot(`${label} • start`, baseMetrics);
      const hardBase = failsHardConstraints(baseLens.surfaces, baseMetrics, { strictness: settings.strictness });
      const relaxedBaseReasons = normalizeHardReasonList(allowedBaselineHardReasons);
      const baselineRelaxAllowed = hardBase.fail
        && hardBase.reasons.every((r) => relaxedBaseReasons.includes(String(r || "").toLowerCase()));
      if (hardBase.fail && !baselineRelaxAllowed) {
        setOptLog(
          `${runHeader}\n` +
          `failed: baseline violates hard constraints (${hardBase.reasons.join(", ")})\n` +
          `No changes applied.`
        );
        if (!silent) toast(`${label} aborted: baseline invalid`);
        return { ok: false, reason: "baseline", hard: hardBase, before: baseMetrics, after: baseMetrics };
      }

      let curLens = clone(baseLens);
      let curFocus = { ...focus };
      let curMetrics = baseMetrics;

      const baseGuard = (typeof guardFn === "function")
        ? (guardFn(baseMetrics, baseMetrics, { targets, settings }) || {})
        : {};
      const basePenalty = Number(baseGuard?.penalty || 0);
      const baseMerit = Number(objectiveFn(baseMetrics, baseMetrics, { targets, settings })) + basePenalty;
      let curMerit = baseMerit;

      let bestLens = clone(curLens);
      let bestFocus = { ...curFocus };
      let bestMetrics = baseMetrics;
      let bestMerit = baseMerit;
      let bestIter = 0;

      const rejects = { mut: 0, hard: 0, guard: 0 };
      const hardReasonCounts = Object.create(null);
      const batch = Math.max(20, Number(COCKPIT_CFG.progressBatch || 60) | 0);
      const t0 = performance.now();

      setOptLog(
        `${runHeader}\n` +
        `running… 0/${iters}\n` +
        `objective ${label}\n` +
        `${baselineRelaxAllowed ? `baseline relax mode: ${hardBase.reasons.join(", ")} (must not worsen)\n` : ""}` +
        `baseline EFL ${Number(baseMetrics?.efl).toFixed(2)}mm • T ${Number(baseMetrics?.T).toFixed(2)} • field ${Number(baseMetrics?.maxFieldDeg).toFixed(2)}° • IC ${Number(baseMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm\n` +
        `baseline Dist@0.7 ${Number.isFinite(baseMetrics?.distortion?.dist70Pct) ? Number(baseMetrics.distortion.dist70Pct).toFixed(2) : "—"}% • RMS ${Number.isFinite(baseMetrics?.distortion?.rmsPct) ? Number(baseMetrics.distortion.rmsPct).toFixed(2) : "—"}%`
      );

      let itersRan = 0;
      for (let i = 1; i <= iters; i++) {
        if ((!nested && (!cockpitOptRunning || cockpitStopRequested)) || (nested && cockpitStopRequested)) break;
        itersRan = i;

        const alpha = i / iters;
        const temp = useAnneal ? (0.8 * (1 - alpha) + 0.12 * alpha) : 0;
        const useBestParent = Math.random() < 0.62;
        const parentLens = useBestParent ? bestLens : curLens;
        const parentFocus = useBestParent ? bestFocus : curFocus;
        const parentMetrics = useBestParent ? bestMetrics : curMetrics;

        const candLens = clone(parentLens);
        let candFocus = { ...parentFocus };
        const mut = mutateFn(candLens, {
          iter: i,
          iterations: iters,
          settings,
          targets,
          baselineMetrics: baseMetrics,
          currentMetrics: parentMetrics,
          bestMetrics,
          focus: candFocus,
          wavePreset,
        }) || { ok: false, reason: "mut" };
        if (!mut.ok) {
          rejects.mut++;
          continue;
        }
        if (mut.focus && typeof mut.focus === "object") {
          candFocus = {
            focusMode: String(mut.focus.focusMode || candFocus.focusMode || focus.focusMode),
            sensorX: Number(mut.focus.sensorX ?? candFocus.sensorX ?? 0),
            lensShift: Number(mut.focus.lensShift ?? candFocus.lensShift ?? 0),
          };
        }

        const candMetrics = computeMetrics({
          surfaces: candLens.surfaces,
          wavePreset,
          focusMode: candFocus.focusMode,
          sensorX: candFocus.sensorX,
          lensShift: candFocus.lensShift,
          sensorW: sensor.w,
          sensorH: sensor.h,
          objDist: COCKPIT_CFG.defaultObjDistMm,
          rayCount: evalRayCount,
          lutN: evalLutN,
          includeUsableIC,
          includeDistortion,
          includeSharpness,
          autofocus: !!autofocusCandidates,
          autofocusOptions: SHARP_OPT_CFG.autofocus,
          useCache: false,
        });
        if (autofocusCandidates && candMetrics?.focus) {
          candFocus = {
            focusMode: candFocus.focusMode,
            sensorX: Number(candMetrics.focus.sensorX || candFocus.sensorX || 0),
            lensShift: Number(candMetrics.focus.lensShift || candFocus.lensShift || 0),
          };
        }

        const hard = failsHardConstraints(candLens.surfaces, candMetrics, { strictness: settings.strictness });
        if (hard.fail) {
          const relax = baselineRelaxAllowed
            ? canRelaxHardFailureForBaseline(
                hard,
                hardBase,
                candMetrics,
                baseMetrics,
                relaxedBaseReasons
              )
            : { ok: false };
          if (!relax.ok) {
            rejects.hard++;
            for (const rr of (hard.reasons || [])) {
              const k = String(rr || "unknown").toLowerCase() || "unknown";
              hardReasonCounts[k] = (hardReasonCounts[k] || 0) + 1;
            }
            continue;
          }
        }
        const g = (typeof guardFn === "function")
          ? (guardFn(candMetrics, baseMetrics, { targets, settings, iter: i }) || {})
          : {};
        if (g?.reject) {
          rejects.guard++;
          continue;
        }
        const penalty = Number(g?.penalty || 0);
        const merit = Number(objectiveFn(candMetrics, baseMetrics, { targets, settings, iter: i })) + penalty;
        if (!Number.isFinite(merit)) {
          rejects.guard++;
          continue;
        }

        let accept = merit < curMerit;
        if (!accept && useAnneal) {
          const uphill = merit - curMerit;
          const pAcc = Math.exp(-uphill / Math.max(1e-6, temp));
          accept = Math.random() < pAcc;
        }
        if (accept) {
          curLens = candLens;
          curFocus = candFocus;
          curMetrics = candMetrics;
          curMerit = merit;
        }

        if (merit + 1e-9 < bestMerit) {
          bestLens = clone(candLens);
          bestFocus = { ...candFocus };
          bestMetrics = candMetrics;
          bestMerit = merit;
          bestIter = i;
        }

        if (i % batch === 0) {
          const dt = Math.max(1e-6, (performance.now() - t0) / 1000);
          const ips = i / dt;
          setOptLog(
            `${runHeader}\n` +
            `running… ${i}/${iters} (${ips.toFixed(1)} it/s)\n` +
            `current merit ${curMerit.toFixed(4)} • best merit ${bestMerit.toFixed(4)} @${bestIter}\n` +
            `base EFL ${Number(baseMetrics?.efl).toFixed(2)}mm • T ${Number(baseMetrics?.T).toFixed(2)} • IC ${Number(baseMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm\n` +
            `best EFL ${Number(bestMetrics?.efl).toFixed(2)}mm • T ${Number(bestMetrics?.T).toFixed(2)} • IC ${Number(bestMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm • field ${Number(bestMetrics?.maxFieldDeg).toFixed(2)}°\n` +
            `best Dist@0.7 ${Number.isFinite(bestMetrics?.distortion?.dist70Pct) ? Number(bestMetrics.distortion.dist70Pct).toFixed(2) : "—"}% • RMS ${Number.isFinite(bestMetrics?.distortion?.rmsPct) ? Number(bestMetrics.distortion.rmsPct).toFixed(2) : "—"}%\n` +
            `rejects mut ${rejects.mut} • hard ${rejects.hard} • guard ${rejects.guard}` +
            `${rejects.hard > 0
              ? `\nhard reasons ${Object.entries(hardReasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(" • ")}`
              : ""}`
          );
          if (!nested) setCockpitProgress(i / iters, `${label} • ${i}/${iters}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const improved = Number.isFinite(bestMerit) && Number.isFinite(baseMerit) && (bestMerit + 1e-9 < baseMerit);
      let applied = false;
      if (improved && applyBestNow) {
        recordCockpitSnapshot(`${label} • pre-apply`);
        loadLens(bestLens);
        const fm = String(bestFocus?.focusMode || focus.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
        if (ui.focusMode) ui.focusMode.value = fm;
        if (ui.sensorOffset) ui.sensorOffset.value = Number(bestFocus?.sensorX || 0).toFixed(3);
        if (ui.lensFocus) ui.lensFocus.value = Number(bestFocus?.lensShift || 0).toFixed(3);
        renderAll();
        scheduleRenderPreviewIfAvailable();
        scheduleAutosave();
        recordCockpitSnapshot(`${label} • applied`);
        applied = true;
      }
      const afterMetrics = improved ? bestMetrics : baseMetrics;
      cockpitLastEngineResult = {
        label,
        improved,
        applied,
        bestIter,
        iters,
        before: baseMetrics,
        after: afterMetrics,
        bestLens: improved ? bestLens : baseLens,
        bestFocus: improved ? bestFocus : focus,
        bestMerit,
        baseMerit,
      };

      setOptLog(
        `${runHeader}\n` +
        `${cockpitStopRequested ? "stopped" : "done"} ${itersRan}/${iters}\n` +
        `best iteration ${bestIter > 0 ? `${bestIter}/${iters}` : "baseline (0)"}\n` +
        `${improved ? (applied ? "APPLIED ✅" : "improved (not applied)") : "no better candidate"}\n` +
        `before EFL ${Number(baseMetrics?.efl).toFixed(2)}mm • T ${Number(baseMetrics?.T).toFixed(2)} • IC ${Number(baseMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm • DistRMS ${Number.isFinite(baseMetrics?.distortion?.rmsPct) ? Number(baseMetrics.distortion.rmsPct).toFixed(2) : "—"}%\n` +
        `after  EFL ${Number(afterMetrics?.efl).toFixed(2)}mm • T ${Number(afterMetrics?.T).toFixed(2)} • IC ${Number(afterMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm • DistRMS ${Number.isFinite(afterMetrics?.distortion?.rmsPct) ? Number(afterMetrics.distortion.rmsPct).toFixed(2) : "—"}%\n` +
        `rejects mut ${rejects.mut} • hard ${rejects.hard} • guard ${rejects.guard}` +
        `${rejects.hard > 0
          ? `\nhard reasons ${Object.entries(hardReasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(" • ")}`
          : ""}`
      );
      if (!nested) setCockpitProgress(1, `${label} • done`);
      if (!silent) toast(cockpitSummaryToast(label, baseMetrics, afterMetrics));
      return { ok: true, improved, applied, before: baseMetrics, after: afterMetrics, bestIter, iters };
    } finally {
      if (!nested) {
        cockpitOptRunning = false;
        setCockpitButtonsBusy(false);
        setTimeout(() => {
          if (!cockpitOptRunning && !cockpitMacroRunning && !optRunning && !distOptRunning && !sharpOptRunning) {
            setCockpitProgress(0, "Idle");
          }
        }, 450);
      }
      setOptRunContext(prevCtx);
      updateSnapshotButtonsState();
      scheduleRenderAll();
    }
  }

  async function runOptimizeEflLocal(opts = {}) {
    const settings = getCockpitSettings();
    const targets = getCockpitTargets();
    const covTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxCoverageDropStrictDeg
      : COCKPIT_CFG.maxCoverageDropNormalDeg;
    return runCockpitOptimizerEngine({
      label: "Optimize EFL",
      objectiveFn: (m) => {
        const eflErr = Number.isFinite(m?.efl) ? (Number(m.efl) - targets.targetEfl) : 999;
        return eflErr * eflErr;
      },
      mutateFn: mutateEflCandidate,
      guardFn: (m, b) => {
        const covDrop = Math.max(0, Number(b?.maxFieldDeg || 0) - Number(m?.maxFieldDeg || 0));
        if (covDrop > covTol) return { reject: true };
        return { reject: false, penalty: 6.0 * covDrop * covDrop };
      },
      iterations: Number(opts?.iterations || settings.iterations),
      includeUsableIC: false,
      includeDistortion: false,
      includeSharpness: false,
      autofocusCandidates: false,
      anneal: opts?.anneal,
      allowedBaselineHardReasons: ["pl"],
      nested: !!opts?.nested,
      runContext: opts?.runContext || null,
      silent: !!opts?.silent,
    });
  }

  async function runOptimizeTLocal(opts = {}) {
    const settings = getCockpitSettings();
    const targets = getCockpitTargets();
    const eflTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxEflDriftStrictMm
      : COCKPIT_CFG.maxEflDriftNormalMm;
    const covTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxCoverageDropStrictDeg
      : COCKPIT_CFG.maxCoverageDropNormalDeg;
    return runCockpitOptimizerEngine({
      label: "Optimize T",
      objectiveFn: (m) => {
        const tNow = Number(m?.T);
        const slow = Number.isFinite(tNow) ? Math.max(0, tNow - targets.targetT) : 99;
        return slow * slow;
      },
      mutateFn: mutateTCandidate,
      guardFn: (m, b) => {
        const eflDrift = Math.abs(Number(m?.efl || 0) - Number(b?.efl || 0));
        const covDrop = Math.max(0, Number(b?.maxFieldDeg || 0) - Number(m?.maxFieldDeg || 0));
        if (eflDrift > eflTol || covDrop > covTol) return { reject: true };
        return { reject: false, penalty: 3.0 * eflDrift * eflDrift + 6.0 * covDrop * covDrop };
      },
      iterations: Number(opts?.iterations || settings.iterations),
      includeUsableIC: false,
      includeDistortion: false,
      includeSharpness: false,
      autofocusCandidates: false,
      anneal: opts?.anneal,
      allowedBaselineHardReasons: ["pl"],
      nested: !!opts?.nested,
      runContext: opts?.runContext || null,
      silent: !!opts?.silent,
    });
  }

  async function runOptimizeImageCircleLocal(opts = {}) {
    const settings = getCockpitSettings();
    const targets = getCockpitTargets();
    const sensor = getSensorWH();
    const icGoal = Math.max(Number(targets.targetIC || 0), Math.hypot(sensor.w, sensor.h));
    const eflTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxEflDriftStrictMm
      : COCKPIT_CFG.maxEflDriftNormalMm;
    const tTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxTDriftStrict
      : COCKPIT_CFG.maxTDriftNormal;
    const distTol = settings.strictness === "strict"
      ? COCKPIT_CFG.maxDistWorsenStrictPct
      : COCKPIT_CFG.maxDistWorsenNormalPct;
    return runCockpitOptimizerEngine({
      label: "Optimize Image Circle",
      objectiveFn: (m) => {
        const icNow = Number(m?.usableIC?.diameterMm || 0);
        const icShort = Math.max(0, icGoal - icNow);
        const reqField = Number(m?.context?.reqFieldDeg || 0);
        const covShort = Math.max(0, reqField - Number(m?.maxFieldDeg || 0));
        return icShort * icShort * 10.0 + covShort * covShort * 5.0 - 0.03 * Math.max(0, icNow);
      },
      mutateFn: mutateIcCandidate,
      guardFn: (m, b) => {
        const eflDrift = Math.abs(Number(m?.efl || 0) - Number(b?.efl || 0));
        const tDrift = Math.abs(Number(m?.T || 0) - Number(b?.T || 0));
        const distWorse = Math.max(0, Math.abs(Number(m?.distortion?.dist70Pct || 0)) - Math.abs(Number(b?.distortion?.dist70Pct || 0)));
        if (eflDrift > eflTol || tDrift > tTol || distWorse > distTol) return { reject: true };
        return {
          reject: false,
          penalty: 5.0 * eflDrift * eflDrift + 10.0 * tDrift * tDrift + 8.0 * distWorse * distWorse,
        };
      },
      iterations: Number(opts?.iterations || settings.iterations),
      includeUsableIC: true,
      includeDistortion: true,
      includeSharpness: false,
      autofocusCandidates: false,
      anneal: opts?.anneal,
      allowedBaselineHardReasons: ["pl"],
      nested: !!opts?.nested,
      runContext: opts?.runContext || null,
      silent: !!opts?.silent,
    });
  }

  async function runOptimizeDistortionLocal(opts = {}) {
    const nested = !!opts?.nested;
    const silent = !!opts?.silent;
    const runContext = opts?.runContext || null;
    const prevCtx = optRunContext;
    const prevAuto = !!ui.optAutoApply?.checked;
    if (!nested) {
      if (cockpitOptRunning || cockpitMacroRunning) return null;
      cockpitOptRunning = true;
      cockpitStopRequested = false;
      setCockpitButtonsBusy(true);
      setCockpitProgress(0, "Optimize Distortion • init");
    }
    try {
      const before = computeMetrics({
        surfaces: lens.surfaces,
        wavePreset: ui.wavePreset?.value || "d",
        ...getFocusStateFromUi(),
        ...getSensorWH(),
        includeDistortion: true,
        includeSharpness: true,
        rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
        lutN: 260,
        useCache: false,
      });
      if (!nested) recordCockpitSnapshot("Optimize Distortion • start", before);
      if (ui.optAutoApply) ui.optAutoApply.checked = true;
      if (runContext && typeof runContext === "object") {
        setOptRunContext({
          mode: runContext.mode || "Optimize Distortion",
          label: runContext.label || "local tune",
          stepIndex: runContext.stepIndex,
          stepTotal: runContext.stepTotal,
        });
      }
      await runDistortionOptimizer();
      if (runContext && typeof runContext === "object") setOptRunContext(prevCtx);
      const after = computeMetrics({
        surfaces: lens.surfaces,
        wavePreset: ui.wavePreset?.value || "d",
        ...getFocusStateFromUi(),
        ...getSensorWH(),
        includeDistortion: true,
        includeSharpness: true,
        rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
        lutN: 260,
        useCache: false,
      });
      recordCockpitSnapshot("Optimize Distortion");
      if (!silent) toast(cockpitSummaryToast("Distortion", before, after));
      return { ok: true, before, after, improved: Number(after?.distortion?.rmsPct) < Number(before?.distortion?.rmsPct) };
    } finally {
      if (ui.optAutoApply) ui.optAutoApply.checked = prevAuto;
      if (runContext && typeof runContext === "object") setOptRunContext(prevCtx);
      if (!nested) {
        cockpitOptRunning = false;
        setCockpitButtonsBusy(false);
        setCockpitProgress(0, "Idle");
        updateSnapshotButtonsState();
      }
    }
  }

  async function runOptimizeSharpnessLocal(opts = {}) {
    const nested = !!opts?.nested;
    const silent = !!opts?.silent;
    const runContext = opts?.runContext || null;
    const prevCtx = optRunContext;
    const prevAuto = !!ui.optAutoApply?.checked;
    if (!nested) {
      if (cockpitOptRunning || cockpitMacroRunning) return null;
      cockpitOptRunning = true;
      cockpitStopRequested = false;
      setCockpitButtonsBusy(true);
      setCockpitProgress(0, "Optimize Sharpness • init");
    }
    try {
      const before = computeMetrics({
        surfaces: lens.surfaces,
        wavePreset: ui.wavePreset?.value || "d",
        ...getFocusStateFromUi(),
        ...getSensorWH(),
        includeDistortion: true,
        includeSharpness: true,
        rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
        lutN: 240,
        useCache: false,
      });
      if (!nested) recordCockpitSnapshot("Optimize Sharpness • start", before);
      if (ui.optAutoApply) ui.optAutoApply.checked = true;
      if (runContext && typeof runContext === "object") {
        setOptRunContext({
          mode: runContext.mode || "Optimize Sharpness",
          label: runContext.label || "local tune",
          stepIndex: runContext.stepIndex,
          stepTotal: runContext.stepTotal,
        });
      }
      await runSharpnessOptimizer();
      if (runContext && typeof runContext === "object") setOptRunContext(prevCtx);
      const after = computeMetrics({
        surfaces: lens.surfaces,
        wavePreset: ui.wavePreset?.value || "d",
        ...getFocusStateFromUi(),
        ...getSensorWH(),
        includeDistortion: true,
        includeSharpness: true,
        rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
        lutN: 240,
        useCache: false,
      });
      recordCockpitSnapshot("Optimize Sharpness");
      if (!silent) toast(cockpitSummaryToast("Sharpness", before, after));
      return { ok: true, before, after, improved: Number(after?.sharpness?.rmsEdge) < Number(before?.sharpness?.rmsEdge) };
    } finally {
      if (ui.optAutoApply) ui.optAutoApply.checked = prevAuto;
      if (runContext && typeof runContext === "object") setOptRunContext(prevCtx);
      if (!nested) {
        cockpitOptRunning = false;
        setCockpitButtonsBusy(false);
        setCockpitProgress(0, "Idle");
        updateSnapshotButtonsState();
      }
    }
  }

  async function runOptimizeAllMacro() {
    if (cockpitMacroRunning || cockpitOptRunning) return;
    if (optRunning || scratchBuildRunning || distOptRunning || sharpOptRunning) {
      toast("Stop current optimizer/build first.");
      return;
    }
    cockpitMacroRunning = true;
    cockpitStopRequested = false;
    setCockpitButtonsBusy(true);
    setCockpitProgress(0, "Optimize All • init");
    const settings = getCockpitSettings();
    const passes = Math.max(1, Number(settings.macroPasses || 1) | 0);
    const stepsPerPass = 5;
    const totalSteps = passes * stepsPerPass;
    const startMetrics = computeMetrics({
      surfaces: lens.surfaces,
      wavePreset: ui.wavePreset?.value || "d",
      ...getFocusStateFromUi(),
      ...getSensorWH(),
      includeDistortion: true,
      includeSharpness: true,
      rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
      lutN: 260,
      useCache: false,
    });
    recordCockpitSnapshot("Optimize All • start", startMetrics);
    let curMetrics = startMetrics;
    let step = 0;
    setOptLog(
      `Optimize All (Macro)\n` +
      `passes ${passes} • steps ${totalSteps}\n` +
      `start EFL ${Number(startMetrics?.efl).toFixed(2)}mm • T ${Number(startMetrics?.T).toFixed(2)} • IC ${Number(startMetrics?.usableIC?.diameterMm || 0).toFixed(2)}mm`
    );
    try {
      for (let p = 0; p < passes; p++) {
        if (cockpitStopRequested) break;
        const tag = `pass ${p + 1}/${passes}`;

        step++;
        await runOptimizeEflLocal({
          nested: true,
          silent: true,
          runContext: { mode: "Optimize All", label: `${tag} • EFL`, stepIndex: step, stepTotal: totalSteps },
        });
        if (cockpitStopRequested) break;
        setCockpitProgress(step / totalSteps, `Optimize All • ${tag} • EFL`);

        step++;
        await runOptimizeTLocal({
          nested: true,
          silent: true,
          runContext: { mode: "Optimize All", label: `${tag} • T`, stepIndex: step, stepTotal: totalSteps },
        });
        if (cockpitStopRequested) break;
        setCockpitProgress(step / totalSteps, `Optimize All • ${tag} • T`);

        step++;
        await runOptimizeImageCircleLocal({
          nested: true,
          silent: true,
          runContext: { mode: "Optimize All", label: `${tag} • IC`, stepIndex: step, stepTotal: totalSteps },
        });
        if (cockpitStopRequested) break;
        setCockpitProgress(step / totalSteps, `Optimize All • ${tag} • IC`);

        step++;
        await runOptimizeSharpnessLocal({
          nested: true,
          silent: true,
          runContext: { mode: "Optimize All", label: `${tag} • sharpness`, stepIndex: step, stepTotal: totalSteps },
        });
        if (cockpitStopRequested) break;
        setCockpitProgress(step / totalSteps, `Optimize All • ${tag} • sharpness`);

        step++;
        await runOptimizeDistortionLocal({
          nested: true,
          silent: true,
          runContext: { mode: "Optimize All", label: `${tag} • distortion`, stepIndex: step, stepTotal: totalSteps },
        });
        setCockpitProgress(step / totalSteps, `Optimize All • ${tag} • distortion`);

        const m = computeMetrics({
          surfaces: lens.surfaces,
          wavePreset: ui.wavePreset?.value || "d",
          ...getFocusStateFromUi(),
          ...getSensorWH(),
          includeDistortion: true,
          includeSharpness: true,
          rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
          lutN: 260,
          useCache: false,
        });
        const prevScore =
          Math.abs(Number(curMetrics?.efl || 0) - Number(getCockpitTargets().targetEfl || 0)) * 0.8 +
          Math.max(0, Number(curMetrics?.T || 0) - Number(getCockpitTargets().targetT || 0)) * 3.0 +
          Math.max(0, Number(getCockpitTargets().targetIC || 0) - Number(curMetrics?.usableIC?.diameterMm || 0)) * 1.2 +
          Math.abs(Number(curMetrics?.distortion?.rmsPct || 0)) * 0.35 +
          Number(curMetrics?.sharpness?.rmsEdge || 0) * 40;
        const nowScore =
          Math.abs(Number(m?.efl || 0) - Number(getCockpitTargets().targetEfl || 0)) * 0.8 +
          Math.max(0, Number(m?.T || 0) - Number(getCockpitTargets().targetT || 0)) * 3.0 +
          Math.max(0, Number(getCockpitTargets().targetIC || 0) - Number(m?.usableIC?.diameterMm || 0)) * 1.2 +
          Math.abs(Number(m?.distortion?.rmsPct || 0)) * 0.35 +
          Number(m?.sharpness?.rmsEdge || 0) * 40;
        curMetrics = m;
        if (p > 0 && (prevScore - nowScore) < 0.02) break;
      }
      recordCockpitSnapshot("Optimize All (Macro)");
      toast(cockpitSummaryToast("Optimize All", startMetrics, curMetrics));
    } finally {
      cockpitMacroRunning = false;
      setCockpitButtonsBusy(false);
      setCockpitProgress(0, "Idle");
      updateSnapshotButtonsState();
      scheduleRenderAll();
    }
  }

  async function makeBaselineLensFromCockpit() {
    if (cockpitOptRunning || cockpitMacroRunning || optRunning || scratchBuildRunning || distOptRunning || sharpOptRunning) {
      toast("Stop current optimizer/build first.");
      return;
    }
    cockpitOptRunning = true;
    cockpitStopRequested = false;
    setCockpitButtonsBusy(true);
    setCockpitProgress(0, "Baseline • generating");
    try {
      const sensor = getSensorWH();
      const wavePreset = ui.wavePreset?.value || "d";
      const targets = getCockpitTargets();
      const family = resolveScratchFamily("auto", targets.targetEfl);
      const base = generateBaseLens(
        family,
        targets,
        { w: sensor.w, h: sensor.h },
        { aggressiveness: "normal" }
      );
      const prepared = prepareScratchLensForTargets(
        base,
        targets,
        { w: sensor.w, h: sensor.h },
        { wavePreset }
      );

      recordCockpitSnapshot("Pre-baseline");
      loadLens(prepared);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0.000";
      autoFocus();
      renderAll();
      scheduleAutosave();
      const m = computeMetrics({
        surfaces: lens.surfaces,
        wavePreset,
        ...getFocusStateFromUi(),
        sensorW: sensor.w,
        sensorH: sensor.h,
        includeDistortion: true,
        includeSharpness: true,
        rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
        lutN: 260,
        useCache: false,
      });
      setCockpitBaselineFromCurrent(`Baseline ${scratchFamilyLabel(family)}`);
      recordCockpitSnapshot(`Baseline ${scratchFamilyLabel(family)}`, m);
      toast(`Baseline ready: ${scratchFamilyLabel(family)} • EFL ${Number(m?.efl).toFixed(2)}mm`);
    } finally {
      cockpitOptRunning = false;
      setCockpitButtonsBusy(false);
      setCockpitProgress(0, "Idle");
      updateSnapshotButtonsState();
      scheduleRenderAll();
    }
  }

  function saveCockpitSnapshotManual() {
    const res = recordCockpitSnapshot("Manual Snapshot");
    if (res?.pushed) {
      if (ui.cockpitCompareInfo) {
        ui.cockpitCompareInfo.textContent = `Snapshot saved • ${new Date(res.snapshot.at).toLocaleTimeString()}`;
      }
      toast("Snapshot saved");
    } else {
      toast("No changes since last snapshot");
    }
  }

  function undoCockpitSnapshot() {
    if (cockpitOptRunning || cockpitMacroRunning || optRunning || scratchBuildRunning || distOptRunning || sharpOptRunning) {
      return toast("Stop current run first.");
    }
    if (cockpitHistoryIndex <= 0) return toast("Nothing to undo");
    cockpitHistoryIndex--;
    const snap = cockpitHistory[cockpitHistoryIndex];
    if (applyCockpitSnapshot(snap, "Undo snapshot")) {
      if (ui.cockpitCompareInfo) ui.cockpitCompareInfo.textContent = `Undo → ${snap.label}`;
      updateSnapshotButtonsState();
    }
  }

  function redoCockpitSnapshot() {
    if (cockpitOptRunning || cockpitMacroRunning || optRunning || scratchBuildRunning || distOptRunning || sharpOptRunning) {
      return toast("Stop current run first.");
    }
    if (cockpitHistoryIndex >= cockpitHistory.length - 1) return toast("Nothing to redo");
    cockpitHistoryIndex++;
    const snap = cockpitHistory[cockpitHistoryIndex];
    if (applyCockpitSnapshot(snap, "Redo snapshot")) {
      if (ui.cockpitCompareInfo) ui.cockpitCompareInfo.textContent = `Redo → ${snap.label}`;
      updateSnapshotButtonsState();
    }
  }

  function compareCockpitSnapshot() {
    if (!cockpitHistory.length) return toast("No snapshots yet");
    const snap = cockpitHistory[cockpitHistoryIndex >= 0 ? cockpitHistoryIndex : (cockpitHistory.length - 1)];
    if (!snap) return toast("No snapshot selected");
    if (cockpitCompareSnapshot?.hash && snap?.hash && cockpitCompareSnapshot.hash === snap.hash) {
      cockpitCompareSnapshot = null;
      if (ui.cockpitCompareInfo) {
        ui.cockpitCompareInfo.textContent = cockpitBaselineSnapshot
          ? `Baseline: ${cockpitBaselineSnapshot.label} (${new Date(cockpitBaselineSnapshot.at).toLocaleTimeString()})`
          : "No baseline yet";
      }
      if (cockpitLiveMetrics) updateCockpitMetricsTable(cockpitLiveMetrics);
      else scheduleRenderAll();
      toast("Snapshot compare cleared");
      return;
    }
    cockpitCompareSnapshot = snap;
    const cur = cockpitLiveMetrics || computeMetrics({
      surfaces: lens.surfaces,
      wavePreset: ui.wavePreset?.value || "d",
      ...getFocusStateFromUi(),
      ...getSensorWH(),
      includeDistortion: true,
      includeSharpness: true,
      rayCount: clamp(num(ui.rayCount?.value, 21) | 0, 11, 41),
      lutN: 240,
      useCache: false,
    });
    const base = snap.metrics || {};
    setOptLog(
      `Snapshot Compare\n` +
      `snapshot ${snap.label} • ${new Date(snap.at).toLocaleString()}\n` +
      `EFL ${Number(base?.efl).toFixed(2)} → ${Number(cur?.efl).toFixed(2)} mm (${(Number(cur?.efl || 0) - Number(base?.efl || 0)).toFixed(2)}mm)\n` +
      `T ${Number(base?.T).toFixed(2)} → ${Number(cur?.T).toFixed(2)} (${(Number(cur?.T || 0) - Number(base?.T || 0)).toFixed(2)})\n` +
      `IC ${Number(base?.usableIC?.diameterMm || 0).toFixed(2)} → ${Number(cur?.usableIC?.diameterMm || 0).toFixed(2)} mm\n` +
      `Dist RMS ${Number(base?.distortion?.rmsPct || 0).toFixed(2)} → ${Number(cur?.distortion?.rmsPct || 0).toFixed(2)} %\n` +
      `Sharp C/E ${Number(base?.sharpness?.rmsCenter || 0).toFixed(3)}/${Number(base?.sharpness?.rmsEdge || 0).toFixed(3)} → ${Number(cur?.sharpness?.rmsCenter || 0).toFixed(3)}/${Number(cur?.sharpness?.rmsEdge || 0).toFixed(3)} mm\n` +
      `PL intrusion ${Number(base?.feasible?.plIntrusionMm || 0).toFixed(2)} → ${Number(cur?.feasible?.plIntrusionMm || 0).toFixed(2)} mm`
    );
    if (ui.cockpitCompareInfo) {
      ui.cockpitCompareInfo.textContent = `Comparing against: ${snap.label}`;
    }
    updateCockpitMetricsTable(cur);
    updateSnapshotButtonsState();
  }

  function makeEvalPerfBucket() {
    return {
      evals: 0,
      totalMs: 0,
      afMs: 0,
      traceMs: 0,
      icMs: 0,
      physMs: 0,
    };
  }

  function randn(){
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function pick(arr){ return arr[(Math.random() * arr.length) | 0]; }

  function surfaceIsLocked(s){
    const t = String(s?.type || "").toUpperCase();
    return t === "OBJ" || t === "IMS";
  }

  function lensHasStop(surfaces){
    return findStopSurfaceIndex(surfaces) >= 0;
  }

  function ensureStopExists(surfaces){
    if (lensHasStop(surfaces)) return;
    // set first non-OBJ non-IMS surface as stop
    for (let i=0;i<surfaces.length;i++){
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      surfaces[i].stop = true;
      surfaces[i].type = "STOP";
      break;
    }
  }

  function quickSanity(surfaces){
    // avoid negative thickness & crazy apertures
    for (const s of surfaces){
      const t = String(s.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      s.t = Math.max(PHYS_CFG.minThickness, Number(s.t || 0));
      s.ap = Math.max(PHYS_CFG.minAperture, Number(s.ap || 0));
      s.glass = resolveGlassName(s.glass);
      clampSurfaceAp(s);
    }

    // discourage abrupt aperture pinches (common optimizer failure mode)
    for (let i = 1; i < surfaces.length - 1; i++) {
      const a = surfaces[i - 1], b = surfaces[i], c = surfaces[i + 1];
      const ta = String(a?.type || "").toUpperCase();
      const tb = String(b?.type || "").toUpperCase();
      const tc = String(c?.type || "").toUpperCase();
      if (ta === "OBJ" || tb === "OBJ" || tc === "OBJ") continue;
      if (ta === "IMS" || tb === "IMS" || tc === "IMS") continue;
      const ref = Math.min(Number(a.ap || 0), Number(c.ap || 0));
      if (ref > 0.5 && Number(b.ap || 0) < 0.45 * ref) b.ap = 0.45 * ref;
      clampSurfaceAp(b);
    }
  }

  function captureTopology(lensObj) {
    const s = lensObj?.surfaces || [];
    return {
      count: s.length,
      media: s.map((x) => String(resolveGlassName(x?.glass)).toUpperCase() === "AIR" ? "AIR" : "GLASS"),
      stopIdx: findStopSurfaceIndex(s),
    };
  }

  function enforceTopology(surfaces, topo) {
    if (!Array.isArray(surfaces) || !topo) return false;
    if (!Number.isFinite(topo.count) || surfaces.length !== topo.count) return false;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const want = topo.media?.[i];
      if (want === "AIR") {
        s.glass = "AIR";
      } else if (want === "GLASS") {
        // keep glass family but never collapse to AIR
        const g = resolveGlassName(s.glass);
        s.glass = (String(g).toUpperCase() === "AIR") ? "N-BK7HT" : g;
      }
    }

    const lockStop = Number.isFinite(topo.stopIdx) ? topo.stopIdx : -1;
    surfaces.forEach((s, i) => {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        s.stop = false;
        return;
      }
      s.stop = (i === lockStop);
      if (s.stop) s.type = "STOP";
    });
    return true;
  }

  function mutateLens(baseLens, mode, topo = null, opt = null){
    const L = clone(baseLens);
    L.name = baseLens.name;
    const stage = Number(opt?.stage ?? 0);
    const targetIC = Math.max(0, Number(opt?.targetIC || 0));
    const targetEfl = Math.max(1, Number(opt?.targetEfl || 0));
    const targetT = Math.max(0, Number(opt?.targetT || 0));
    const icNeedMm = Math.max(0, Number(opt?.icNeedMm || 0));
    const icStage = (stage === 2 && targetIC > 0);
    const fineTuneStage = stage >= 3;
    const keepFl = !!opt?.keepFl;

    const s = L.surfaces;

    // occasionally add/remove a surface.
    // During heavy IC shortfall, allow this even in safe mode to escape local minima.
    const allowStructureJump = (!topo && mode === "wild" && !fineTuneStage) || (icStage && icNeedMm > 8.0);
    const structureProb = (!topo && mode === "wild" && !fineTuneStage) ? 0.03 : (icStage ? 0.08 : 0.0);
    if (allowStructureJump && Math.random() < structureProb){
      const imsIdx = s.findIndex(x => String(x.type).toUpperCase()==="IMS");
      const canRemove = s.length > 6;

      if (canRemove && Math.random() < 0.35){
        // remove a random non-locked surface
        const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
        if (idxs.length){
          const ri = pick(idxs).i;
          s.splice(ri,1);
        }
      } else {
        // insert a random surface before IMS
        const at = Math.max(1, Math.min(imsIdx >= 0 ? imsIdx : s.length-1, 1 + ((Math.random()*Math.max(1,(s.length-2)))|0)));
        const baseAp = icStage ? clamp(targetIC * (0.22 + Math.random() * 0.20), 8, 30) : (4 + Math.random() * 20);
        const baseR = Math.max(16, (baseAp / AP_SAFETY) * (1.06 + Math.random() * 0.24));
        s.splice(at,0,{
          type:"",
          R: (Math.random()<0.5?1:-1) * baseR,
          t: 0.6 + Math.random() * 10,
          ap: baseAp,
          glass: (Math.random()<0.12 ? "AIR" : pick(GLASS_LIST)),
          stop:false
        });
      }
    }

    // main: perturb a few parameters
    let kChanges = mode === "wild" ? 6 : 3;
    if (icStage) kChanges += (mode === "wild" ? 6 : 5);
    if (icStage && keepFl) kChanges += 2;
    if (fineTuneStage) {
      kChanges = Math.max(2, Math.min(kChanges, mode === "wild" ? 3 : 2));
    }

    let radiusScale = icStage
      ? (keepFl ? (mode === "wild" ? 0.20 : 0.12) : (mode === "wild" ? 0.42 : 0.24))
      : (keepFl ? (mode === "wild" ? 0.12 : 0.06) : (mode === "wild" ? 0.35 : 0.18));
    let thickScale  = icStage
      ? (keepFl ? (mode === "wild" ? 0.24 : 0.16) : (mode === "wild" ? 0.62 : 0.30))
      : (keepFl ? (mode === "wild" ? 0.18 : 0.08) : (mode === "wild" ? 0.55 : 0.25));
    if (fineTuneStage) {
      radiusScale *= 0.42;
      thickScale *= 0.40;
    }

    const rThresh = fineTuneStage ? 0.36 : (!icStage ? 0.45 : (keepFl ? 0.28 : 0.35));
    let tThresh = fineTuneStage ? 0.62 : (!icStage ? 0.70 : (keepFl ? 0.48 : 0.58));
    let aThresh = fineTuneStage ? 0.92 : (!icStage ? 0.88 : 0.98);
    if (!fineTuneStage && stage >= 1) {
      // In T/IC phases, bias mutations away from random thickness-only tweaks and toward aperture growth.
      tThresh = Math.max(rThresh + 0.12, tThresh - 0.06);
      aThresh = Math.min(0.995, aThresh + 0.05);
    } else if (!fineTuneStage && stage === 0 && targetIC > 0) {
      // Even in FL acquire, keep enough aperture exploration alive to avoid tiny-glass local minima.
      aThresh = Math.min(0.95, aThresh + 0.03);
    }

    for (let c=0;c<kChanges;c++){
      const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
      if (!idxs.length) break;
      const o = pick(idxs);
      const ss = o.x;

      const choice = Math.random();
      if (choice < rThresh){
        // radius tweak
        const d = randn() * radiusScale;
        const R = Number(ss.R || 0);
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(R));
        const newAbs = absR * (1 + d);
        ss.R = (R >= 0 ? 1 : -1) * clamp(newAbs, PHYS_CFG.minRadius, 450);
      } else if (choice < tThresh){
        // thickness tweak
        const d = randn() * thickScale;
        ss.t = clamp(Number(ss.t||0) * (1 + d), PHYS_CFG.minThickness, 42);
      } else if (choice < aThresh){
        // aperture tweak
        if (icStage) {
          // In IC phase, strongly prefer larger clear apertures.
          const grow = 1 + Math.abs(randn()) * (mode === "wild" ? 0.30 : 0.20);
          ss.ap = clamp(Number(ss.ap || 0) * grow, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        } else {
          const scale = mode === "wild" ? 0.45 : 0.20;
          const d = randn() * scale;
          ss.ap = clamp(Number(ss.ap||0) * (1 + d), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
      } else {
        // glass swap
        const lock = topo?.media?.[o.i];
        if (lock === "AIR") ss.glass = "AIR";
        else ss.glass = pick(GLASS_LIST);
      }

      // sometimes toggle stop
      if (!topo && mode === "wild" && Math.random() < 0.015){
        ss.stop = !ss.stop;
        if (ss.stop) ss.type = "STOP";
      }
    }

    if (icStage) {
      // Pull tiny apertures up toward a practical floor for the requested image circle.
      const apFloor = clamp(targetIC * 0.30, 6.0, 34.0);
      for (let i = 0; i < s.length; i++) {
        const ss = s[i];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;

        const ap = Number(ss.ap || 0);
        if (ap < apFloor) {
          const alpha = 0.35 + Math.random() * 0.45;
          ss.ap = clamp(ap + (apFloor - ap) * alpha, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        } else if (Math.random() < 0.25) {
          ss.ap = clamp(ap * (1.02 + Math.random() * 0.10), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }

        // Keep radius aligned to aperture; otherwise quickSanity clamps aperture back down.
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.07;
        if (absR < needAbsR) {
          ss.R = signR * clamp(absR + (needAbsR - absR) * 0.72, PHYS_CFG.minRadius, 600);
        }
      }

      // Rear group usually drives hard cutoff; give it extra breathing room.
      const stopIdx = findStopSurfaceIndex(s);
      if (stopIdx >= 0) {
        for (let i = stopIdx + 1; i < s.length - 1; i++) {
          const ss = s[i];
          if (surfaceIsLocked(ss)) continue;
          if (Math.random() < 0.65) {
            const ap = Number(ss.ap || 0);
            ss.ap = clamp(ap * (1.05 + Math.random() * 0.13), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
            const signR = Math.sign(Number(ss.R || 1)) || 1;
            const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
            const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.06;
            if (absR < needAbsR) ss.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
          }
        }
      }
    }

    if (icStage && Math.random() < 0.22) {
      // Rare macro step to escape local minima: grow clear apertures + matching radii globally.
      const macro = keepFl ? (1.06 + Math.random() * 0.08) : (1.10 + Math.random() * 0.14);
      for (let i = 0; i < s.length; i++) {
        const ss = s[i];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        ss.ap = clamp(Number(ss.ap || 0) * macro, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.08;
        ss.R = signR * clamp(Math.max(absR * (1.02 + Math.random() * 0.06), needAbsR), PHYS_CFG.minRadius, 600);
      }
    }

    // Keep stop/pupil health alive in every stage; stronger in IC stage.
    if (targetEfl > 1 && targetT > 0) {
      const stopStrength = icStage ? (keepFl ? 0.52 : 0.70) : (stage === 1 ? 0.62 : 0.40);
      nudgeStopTowardTargetT(s, targetEfl, targetT, stopStrength);
    }

    promoteElementDiameters(s, {
      targetEfl,
      targetT,
      targetIC,
      stage,
      strength: icStage ? 1.0 : 0.72,
      keepFl,
    });
    enforcePupilHealthFloors(s, {
      targetEfl,
      targetT,
      targetIC,
      stage,
      keepFl,
    });

    ensureStopExists(s);
    // enforce single stop
    const firstStop = s.findIndex(x => !!x.stop);
    if (firstStop >= 0) s.forEach((x,i)=>{ if (i!==firstStop) x.stop=false; });

    // keep OBJ/IMS types correct
    if (s.length) s[0].type = "OBJ";
    if (s.length) s[s.length-1].type = "IMS";

    if (topo) enforceTopology(s, topo);
    enforceRearMountStart(s);
    quickSanity(s);
    enforceRearMountStart(s);
    if (topo) enforceTopology(s, topo);
    return sanitizeLens(L);
  }

  function applyCoverageBoostMutation(
    surfaces,
    { targetIC = 0, targetEfl = 50, targetT = 0, icNeedMm = 0, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const need = Math.max(0, Number(icNeedMm || 0));
    const growth = clamp(
      1.14 + 0.08 * Math.random() + Math.min(0.34, need * 0.016),
      1.10,
      keepFl ? 1.42 : 1.58
    );

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (surfaceIsLocked(s)) continue;
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const rear = (stopIdx >= 0 && i > stopIdx && i < surfaces.length - 1);
      const localGrow = growth * (rear ? (1.07 + Math.random() * 0.12) : 1.0);
      let ap = Number(s.ap || 0) * localGrow;

      // Keep aperture growth physically reachable by growing radius together.
      const signR = Math.sign(Number(s.R || 1)) || 1;
      let absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
      const needAbsR = (ap / AP_SAFETY) * 1.10;
      if (absR < needAbsR) {
        const alpha = keepFl ? 0.58 : 0.74;
        absR = absR + (needAbsR - absR) * alpha;
      }
      s.R = signR * clamp(absR, PHYS_CFG.minRadius, 600);

      s.ap = clamp(ap, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const tGrow = rear ? (1.04 + Math.random() * 0.12) : (1.02 + Math.random() * 0.08);
      s.t = clamp(Number(s.t || 0) * tGrow, PHYS_CFG.minThickness, 42);
    }

    // Drive stop toward target T, and ensure neighbors can support it.
    if (stopIdx >= 0) {
      const stop = surfaces[stopIdx];
      const stopNeed = (targetT > 0 && targetEfl > 1) ? (targetEfl / (2 * targetT)) : 0;
      const stopBoost = stopNeed > 0
        ? Math.max(stopNeed * 0.98, Number(stop.ap || 0) * (1.10 + Math.random() * 0.16))
        : Number(stop.ap || 0) * (1.08 + Math.random() * 0.14);
      stop.ap = clamp(stopBoost, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);

      const neighNeed = stop.ap / 1.06;
      for (let d = 1; d <= 3; d++) {
        const ids = [stopIdx - d, stopIdx + d];
        for (const id of ids) {
          if (id < 0 || id >= surfaces.length) continue;
          const s = surfaces[id];
          if (surfaceIsLocked(s)) continue;
          const t = String(s?.type || "").toUpperCase();
          if (t === "OBJ" || t === "IMS") continue;

          s.ap = clamp(Math.max(Number(s.ap || 0), neighNeed * (1 - d * 0.06)), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          const signR = Math.sign(Number(s.R || 1)) || 1;
          const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
          const needAbsR = (Number(s.ap || 0) / AP_SAFETY) * 1.08;
          s.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
        }
      }
    }

    // Coverage floor by target IC (kept moderate to avoid instant hard-fails).
    if (targetIC > 0) {
      const floorBase = clamp(targetIC * (keepFl ? 0.44 : 0.50), 10.0, 34.0);
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        if (surfaceIsLocked(s)) continue;
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        if (Number(s.ap || 0) < floorBase) {
          s.ap = clamp(floorBase, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          const signR = Math.sign(Number(s.R || 1)) || 1;
          const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
          const needAbsR = (Number(s.ap || 0) / AP_SAFETY) * 1.05;
          s.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
        }
      }
    }
  }

  function nudgeStopTowardTargetT(surfaces, targetEfl, targetT, strength = 0.75) {
    if (!Array.isArray(surfaces)) return;
    if (!(Number.isFinite(targetEfl) && targetEfl > 1 && Number.isFinite(targetT) && targetT > 0.2)) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    const stop = surfaces[stopIdx];
    const targetAp = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    const curAp = Number(stop.ap || targetAp);
    const s = clamp(Number(strength), 0.05, 1);
    // One-sided T target: if lens is already faster (curAp >= targetAp), keep that speed.
    stop.ap = (curAp < targetAp)
      ? clamp(curAp + (targetAp - curAp) * s, PHYS_CFG.minAperture, PHYS_CFG.maxAperture)
      : clamp(curAp, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    {
      const signR = Math.sign(Number(stop.R || 1)) || 1;
      const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(stop.R || 0)));
      const needAbsR = (Number(stop.ap || targetAp) / AP_SAFETY) * 1.08;
      stop.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
    }

    // Keep immediate neighbors compatible with a larger stop.
    const neighNeed = Number(stop.ap || targetAp) / 1.08;
    for (let d = 1; d <= 3; d++) {
      for (const idx of [stopIdx - d, stopIdx + d]) {
        if (idx < 0 || idx >= surfaces.length) continue;
        const ss = surfaces[idx];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        const apNeed = neighNeed * (1 - d * 0.06);
        if (Number(ss.ap || 0) < apNeed) ss.ap = apNeed;
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.06;
        ss.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
      }
    }
  }

  function enforceApertureRadiusCoupling(surface, margin = 1.06) {
    if (!surface) return;
    const t = String(surface?.type || "").toUpperCase();
    if (t === "OBJ" || t === "IMS") return;
    const ap = Math.max(PHYS_CFG.minAperture, Number(surface.ap || 0));
    const signR = Math.sign(Number(surface.R || 1)) || 1;
    const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(surface.R || 0)));
    const needAbsR = (ap / AP_SAFETY) * Math.max(1.0, Number(margin || 1.06));
    surface.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
  }

  function promoteElementDiameters(
    surfaces,
    { targetEfl = 50, targetT = 0, targetIC = 0, stage = 0, strength = 0.8, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const st = Number(stage || 0);
    const sGain = clamp(Number(strength || 0.8), 0.2, 1.5);
    const stopIdx = findStopSurfaceIndex(surfaces);

    if (stopIdx >= 0 && Number.isFinite(targetEfl) && targetEfl > 1 && Number.isFinite(targetT) && targetT > 0.2) {
      const stop = surfaces[stopIdx];
      const stopNeed = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const f = st >= 2 ? 0.96 : (st === 1 ? 0.90 : 0.84);
      const curAp = Number(stop.ap || stopNeed);
      stop.ap = clamp(curAp + (stopNeed * f - curAp) * (0.45 * sGain), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      enforceApertureRadiusCoupling(stop, 1.08);

      const neighBase = Number(stop.ap || stopNeed);
      for (let d = 1; d <= 3; d++) {
        const ids = [stopIdx - d, stopIdx + d];
        for (const id of ids) {
          if (id < 0 || id >= surfaces.length) continue;
          const ss = surfaces[id];
          if (surfaceIsLocked(ss)) continue;
          const tt = String(ss?.type || "").toUpperCase();
          if (tt === "OBJ" || tt === "IMS") continue;
          const need = neighBase * (1 - d * 0.08);
          if (Number(ss.ap || 0) < need) ss.ap = clamp(need, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          enforceApertureRadiusCoupling(ss, 1.06);
        }
      }
    }

    if (Number.isFinite(targetIC) && targetIC > 0) {
      const floor = clamp(
        targetIC * (st >= 2 ? 0.34 : (st === 1 ? 0.30 : 0.28)),
        8.0,
        keepFl ? 24.0 : 30.0
      );
      for (let i = 0; i < surfaces.length; i++) {
        const ss = surfaces[i];
        if (surfaceIsLocked(ss)) continue;
        const tt = String(ss?.type || "").toUpperCase();
        if (tt === "OBJ" || tt === "IMS") continue;
        const ap = Number(ss.ap || 0);
        if (ap < floor) {
          ss.ap = clamp(ap + (floor - ap) * (0.28 * sGain), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
        enforceApertureRadiusCoupling(ss, 1.04);
      }
    }
  }

  function enforcePupilHealthFloors(
    surfaces,
    { targetEfl = 50, targetT = 0, targetIC = 0, stage = 0, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const st = Number(stage || 0);
    const stopIdx = findStopSurfaceIndex(surfaces);

    let stopFloor = 0;
    if (Number.isFinite(targetT) && targetT > 0.2 && Number.isFinite(targetEfl) && targetEfl > 1) {
      const stopNeed = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const stopFrac = st <= 0 ? 0.62 : (st === 1 ? 0.80 : (st === 2 ? 0.90 : 0.95));
      stopFloor = stopNeed * stopFrac;
    }

    let icFloor = 0;
    if (Number.isFinite(targetIC) && targetIC > 0) {
      const icFrac = st <= 0 ? 0.28 : (st === 1 ? 0.32 : (st === 2 ? 0.38 : 0.36));
      icFloor = clamp(targetIC * icFrac, 8.0, keepFl ? 28.0 : 34.0);
    }

    const baseFloor = Math.max(6.0, icFloor, stopFloor * 0.62);
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (surfaceIsLocked(s)) continue;
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (Number(s.ap || 0) < baseFloor) s.ap = baseFloor;
    }

    if (stopIdx >= 0) {
      const stop = surfaces[stopIdx];
      if (!surfaceIsLocked(stop)) {
        if (stopFloor > 0 && Number(stop.ap || 0) < stopFloor) stop.ap = stopFloor;
        enforceApertureRadiusCoupling(stop, 1.09);
      }

      const stopAp = Math.max(0, Number(stop.ap || 0));
      for (let d = 1; d <= 3; d++) {
        const need = stopAp * (1 - d * 0.10);
        for (const idx of [stopIdx - d, stopIdx + d]) {
          if (idx < 0 || idx >= surfaces.length) continue;
          const s = surfaces[idx];
          if (surfaceIsLocked(s)) continue;
          const t = String(s?.type || "").toUpperCase();
          if (t === "OBJ" || t === "IMS") continue;
          if (Number(s.ap || 0) < need) s.ap = need;
          enforceApertureRadiusCoupling(s, 1.07);
        }
      }

      const rearFrac = st >= 2 ? 0.80 : (st === 1 ? 0.74 : 0.68);
      for (let i = stopIdx + 1; i < surfaces.length - 1; i++) {
        const s = surfaces[i];
        if (surfaceIsLocked(s)) continue;
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        const need = Math.max(baseFloor, stopAp * rearFrac);
        if (Number(s.ap || 0) < need) s.ap = need;
        enforceApertureRadiusCoupling(s, 1.06);
      }
    }
  }

  function buildGuidedCandidate(baseLens, pri, targets, wavePreset, topo, aggressive = false) {
    const c = clone(baseLens);
    const st = Number(pri?.stage ?? 0);
    const icNeed = Math.max(0, Number(pri?.icNeedMm || 0));
    const keepFl = !!pri?.flInBand;
    const hard = !!aggressive;

    if (st <= 0) {
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 1.0 : 0.92, hard ? 0.30 : 0.22, { keepAperture: true });
      if (targets.targetT > 0) {
        nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.56 : 0.42);
      }
    } else if (st === 1) {
      // T coarse phase before IC growth.
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.98 : 0.88);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.64 : 0.52, hard ? 0.08 : 0.06, { keepAperture: true });
    } else if (st === 2) {
      const passes = hard ? 3 : (icNeed > 3.0 ? 2 : 1);
      for (let p = 0; p < passes; p++) {
        applyCoverageBoostMutation(c.surfaces, {
          targetIC: targets.targetIC,
          targetEfl: targets.targetEfl,
          targetT: targets.targetT,
          icNeedMm: hard ? (icNeed + 3.0) : icNeed,
          // First pass respects FL lock, extra passes may relax lock for stronger IC push.
          keepFl: (p === 0 ? keepFl : false),
        });
      }
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.92 : 0.78);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.55 : 0.40, hard ? 0.07 : 0.05, { keepAperture: true });
    } else {
      // Fine tune: keep T close and clean up sharpness.
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.85 : 0.62);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.42 : 0.32, hard ? 0.05 : 0.035, { keepAperture: true });
    }

    promoteElementDiameters(c.surfaces, {
      targetEfl: targets.targetEfl,
      targetT: targets.targetT,
      targetIC: targets.targetIC,
      stage: st,
      strength: hard ? 1.15 : 0.9,
      keepFl,
    });
    enforcePupilHealthFloors(c.surfaces, {
      targetEfl: targets.targetEfl,
      targetT: targets.targetT,
      targetIC: targets.targetIC,
      stage: st,
      keepFl,
    });

    quickSanity(c.surfaces);
    if (topo) enforceTopology(c.surfaces, topo);
    enforceRearMountStart(c.surfaces);
    quickSanity(c.surfaces);
    return c;
  }

  function nudgeLensTowardFocal(lensObj, targetEfl, wavePreset, strength = 0.6, maxStep = 0.20, opts = null) {
    if (!lensObj?.surfaces || !(Number.isFinite(targetEfl) && targetEfl > 1)) return false;
    const o = opts || {};
    const keepAperture = o.keepAperture !== false;
    const surfaces = lensObj.surfaces;
    computeVertices(surfaces, 0, 0);
    const p = estimateEflBflParaxial(surfaces, wavePreset);
    const efl = Number(p?.efl);
    if (!(Number.isFinite(efl) && efl > 1e-6)) return false;

    const kRaw = targetEfl / efl;
    if (!Number.isFinite(kRaw) || kRaw <= 0) return false;

    const s = clamp(Number(strength), 0, 1);
    const cap = clamp(Number(maxStep), 0.01, 0.60);
    const k = clamp(1 + (kRaw - 1) * s, 1 - cap, 1 + cap);
    if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) return false;

    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    for (let i = 0; i < surfaces.length; i++) {
      const ss = surfaces[i];
      if (surfaceIsLocked(ss)) continue;
      const t = String(ss?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      ss.R = Number(ss.R || 0) * k;
      if (i === rearIdx) {
        // Keep image-space gap tied to mount geometry during FL nudges.
        ss.t = Math.max(PHYS_CFG.minAirGap, Number(ss.t || 0));
        ss.glass = "AIR";
      } else {
        ss.t = clamp(Number(ss.t || 0) * k, PHYS_CFG.minThickness, 42);
      }
      const ap0 = Number(ss.ap || 0);
      if (keepAperture) {
        const kAp = (k >= 1)
          ? Math.pow(k, 0.20)
          : Math.max(0.995, Math.pow(k, 0.08)); // keep pupil nearly stable during FL pulls
        ss.ap = clamp(ap0 * kAp, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        enforceApertureRadiusCoupling(ss, 1.03);
      } else {
        ss.ap = clamp(ap0 * k, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      }
    }
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function evalLensMerit(lensObj, {
    targetEfl,
    targetT,
    targetIC = 0,
    fieldAngle,
    rayCount,
    wavePreset,
    sensorW,
    sensorH,
    evalTier = "accurate",
    lensShiftHint = null,
    afOptions = null,
    icOptions = null,
    rayCountFast = null,
    timingSink = null,
  }){
    const evalTierNorm = String(evalTier || "accurate").toLowerCase() === "fast" ? "fast" : "accurate";
    const tEval0 = performance.now();
    let tAfMs = 0;
    let tPhysMs = 0;
    let tTraceMs = 0;
    let tIcMs = 0;

    const finishEval = (payload) => {
      const totalMs = performance.now() - tEval0;
      if (timingSink && typeof timingSink === "object") {
        timingSink.evals = (timingSink.evals || 0) + 1;
        timingSink.totalMs = (timingSink.totalMs || 0) + totalMs;
        timingSink.afMs = (timingSink.afMs || 0) + tAfMs;
        timingSink.traceMs = (timingSink.traceMs || 0) + tTraceMs;
        timingSink.icMs = (timingSink.icMs || 0) + tIcMs;
        timingSink.physMs = (timingSink.physMs || 0) + tPhysMs;
      }
      return {
        ...payload,
        evalTier: evalTierNorm,
        evalMs: totalMs,
      };
    };

    const tmp = clone(lensObj);
    const surfaces = tmp.surfaces;
    const evalRayCount = evalTierNorm === "fast"
      ? Math.max(9, Math.min(21, Number(rayCountFast || rayCount || 15) | 0))
      : Math.max(9, Math.min(61, Number(rayCount || 31) | 0));
    const afRayCountDefault = evalTierNorm === "fast"
      ? Math.max(7, Math.min(15, evalRayCount))
      : Math.max(9, Math.min(31, evalRayCount));

    // IMS ap = half height
    const halfH = Math.max(0.1, sensorH * 0.5);
    const ims = surfaces[surfaces.length-1];
    if (ims && String(ims.type).toUpperCase()==="IMS") ims.ap = halfH;

    // autofocus (lens shift)
    const af0 = performance.now();
    const afCfg = afOptions || {};
    const hintShift = Number(lensShiftHint);
    const hasHint = Number.isFinite(hintShift);
    const forceAf = !!afCfg.force;
    const doFastSkipAf = (evalTierNorm === "fast") && hasHint && !forceAf;
    let lensShift = hasHint ? hintShift : 0;
    let afOk = hasHint;
    if (!doFastSkipAf) {
      const af = bestLensShiftForDesign(
        surfaces,
        fieldAngle,
        afRayCountDefault,
        wavePreset,
        {
          centerShift: hasHint ? hintShift : Number(afCfg.centerShift || 0),
          coarseHalfRange: Number.isFinite(afCfg.coarseHalfRange)
            ? Number(afCfg.coarseHalfRange)
            : (evalTierNorm === "fast" ? 3.0 : 6.0),
          coarseStep: Number.isFinite(afCfg.coarseStep)
            ? Number(afCfg.coarseStep)
            : (evalTierNorm === "fast" ? 0.60 : 0.30),
          fineHalfRange: Number.isFinite(afCfg.fineHalfRange)
            ? Number(afCfg.fineHalfRange)
            : (evalTierNorm === "fast" ? 0.90 : 1.60),
          fineStep: Number.isFinite(afCfg.fineStep)
            ? Number(afCfg.fineStep)
            : (evalTierNorm === "fast" ? 0.20 : 0.08),
          rayCount: Number.isFinite(afCfg.rayCount) ? Number(afCfg.rayCount) : afRayCountDefault,
        }
      );
      if (af.ok) {
        lensShift = af.shift;
        afOk = true;
      }
    }
    tAfMs += (performance.now() - af0);

    const sensorX = 0.0;
    const phys0 = performance.now();
    // Evaluate mount intrusion at both neutral focus and focused state.
    // This prevents "cheating" mount constraints by sliding the whole lens with lensShift.
    computeVertices(surfaces, 0, sensorX);
    const rearVxNeutral = lastPhysicalVertexX(surfaces);
    const intrusionNeutral = Number.isFinite(rearVxNeutral) ? (rearVxNeutral - (-PL_FFD)) : Infinity;
    computeVertices(surfaces, lensShift, sensorX);
    const phys = evaluatePhysicalConstraints(surfaces);
    const rearVxFocused = lastPhysicalVertexX(surfaces);
    const intrusionFocused = Number.isFinite(rearVxFocused) ? (rearVxFocused - (-PL_FFD)) : Infinity;
    const intrusion = Math.max(intrusionNeutral, intrusionFocused);
    tPhysMs += (performance.now() - phys0);

    if (phys.hardFail) {
      const score = MERIT_CFG.hardInvalidPenalty + Math.max(0, Number(phys.penalty || 0));
      const icShortfallMm = Number.isFinite(targetIC) && targetIC > 0 ? targetIC : 0;
      return finishEval({
        score,
        efl: null,
        T: null,
        softIcMm: 0,
        icShortfallMm,
        bfl: null,
        intrusion,
        vigFrac: 1,
        hardInvalid: true,
        physPenalty: Number(phys.penalty || 0),
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        lensShift,
        rms0: null,
        rmsE: null,
        distRmsPct: null,
        distMaxPct: null,
        distEdgePct: null,
        distFlavor: "unknown",
        distPenalty: 0,
        distWeight: 0,
        realismPenalty: 0,
        realismBasePenalty: 0,
        realismWeight: 0,
        realismHardInvalid: false,
        realismHardOverMm: 0,
        frontOD: null,
        maxOD: null,
        rearOD: null,
        internalCrossPairs: 0,
        internalCrossSegments: 0,
        afOk,
        breakdown: {
          rmsCenter: null,
          rmsEdge: null,
          vigPct: 100,
          intrusion: null,
          fields: [0, 0, 0],
          physPenalty: Number(phys.penalty || 0),
          hardInvalid: true,
          internalCrossPairs: 0,
          internalCrossSegments: 0,
          internalCrossPenalty: 0,
          distRmsPct: null,
          distMaxPct: null,
          distEdgePct: null,
          distFlavor: "unknown",
          distPenalty: 0,
          distWeight: 0,
          distSampleCount: 0,
          distValidSamples: 0,
          frontOD: null,
          maxOD: null,
          rearOD: null,
          realismPenalty: 0,
          realismBasePenalty: 0,
          realismWeight: 0,
          realismHardInvalid: false,
          realismHardOverMm: 0,
          realismOdPenalty: 0,
          realismThicknessPenalty: 0,
          realismRadiusPenalty: 0,
          realismEdgePenalty: 0,
          realismPackagingPenalty: 0,
          realismProfileLabel: "",
          realismLargeSensor: false,
        },
      });
    }

    const trace0 = performance.now();
    const rays = buildRays(surfaces, fieldAngle, evalRayCount);
    const traces = rays.map(r => traceRayForward(clone(r), surfaces, wavePreset));
    const rayCross = detectInternalRayCrossings(traces, surfaces, wavePreset);
    const crossPenalty = internalCrossPenaltyFromStats(rayCross);
    const physPenaltyTotal = Number(phys.penalty || 0) + crossPenalty;
    const hardInvalidBase = !!phys.hardFail || !!rayCross.invalid;

    const vCount = traces.filter(t=>t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;

    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    const Tgeom = estimateTStopApprox(efl, surfaces);
    if (rayCross.invalid) {
      const score = MERIT_CFG.hardInvalidPenalty + Math.max(0, physPenaltyTotal);
      const icShortfallMm = Number.isFinite(targetIC) && targetIC > 0 ? targetIC : 0;
      tTraceMs += Math.max(0, performance.now() - trace0);
      return finishEval({
        score,
        efl,
        T: Number.isFinite(Tgeom) ? Tgeom : null,
        softIcMm: 0,
        icShortfallMm,
        bfl,
        intrusion,
        vigFrac,
        hardInvalid: true,
        physPenalty: physPenaltyTotal,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        goodFrac0: 0,
        lensShift,
        afOk,
        rms0: null,
        rmsE: null,
        distRmsPct: null,
        distMaxPct: null,
        distEdgePct: null,
        distFlavor: "unknown",
        distPenalty: 0,
        distWeight: 0,
        realismPenalty: 0,
        realismBasePenalty: 0,
        realismWeight: 0,
        realismHardInvalid: false,
        realismHardOverMm: 0,
        frontOD: null,
        maxOD: null,
        rearOD: null,
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
        breakdown: {
          rmsCenter: null,
          rmsEdge: null,
          vigPct: Math.round(vigFrac * 100),
          intrusion: Number.isFinite(intrusion) ? intrusion : null,
          fields: [0, 0, 0],
          vigCenterPct: Math.round(vigFrac * 100),
          vigMidPct: Math.round(vigFrac * 100),
          physPenalty: physPenaltyTotal,
          hardInvalid: true,
          internalCrossPairs: Number(rayCross.crossPairs || 0),
          internalCrossSegments: Number(rayCross.crossSegments || 0),
          internalCrossPenalty: crossPenalty,
          distRmsPct: null,
          distMaxPct: null,
          distEdgePct: null,
          distFlavor: "unknown",
          distPenalty: 0,
          distWeight: 0,
          distSampleCount: 0,
          distValidSamples: 0,
          frontOD: null,
          maxOD: null,
          rearOD: null,
          realismPenalty: 0,
          realismBasePenalty: 0,
          realismWeight: 0,
          realismHardInvalid: false,
          realismHardOverMm: 0,
          realismOdPenalty: 0,
          realismThicknessPenalty: 0,
          realismRadiusPenalty: 0,
          realismEdgePenalty: 0,
          realismPackagingPenalty: 0,
          realismProfileLabel: "",
          realismLargeSensor: false,
        },
      });
    }
    const centerTp = measureCenterThroughput(
      surfaces,
      wavePreset,
      sensorX,
      evalTierNorm === "fast" ? Math.max(13, evalRayCount) : Math.max(31, evalRayCount)
    );
    const T = estimateEffectiveT(Tgeom, centerTp.goodFrac);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    let softIcMm = null;
    let icShortfallMm = 0;
    let icEvalMs = 0;
    if (Number.isFinite(targetIC) && targetIC > 0) {
      const ic0 = performance.now();
      const icMode = String(icOptions?.mode || (evalTierNorm === "fast" ? "proxy" : "lut")).toLowerCase();
      const icHint = Number(icOptions?.hintMm);
      if (icMode === "skip") {
        softIcMm = Number.isFinite(icHint) ? icHint : 0;
      } else if (icMode === "proxy") {
        const icRes = estimateUsableCircleFastProxy(
          surfaces,
          sensorW,
          sensorH,
          wavePreset,
          Math.max(9, evalRayCount),
          { ...FAST_OPT_IC_CFG, ...(icOptions?.cfg || {}) }
        );
        const measured = Number(icRes?.usableCircleDiameterMm ?? icRes?.softICmm ?? 0);
        softIcMm = Number.isFinite(measured) ? measured : 0;
      } else {
        const icRes = estimateUsableCircleBackgroundLut(
          surfaces,
          sensorW,
          sensorH,
          wavePreset,
          Math.max(15, Math.min(41, evalRayCount | 0)),
          { ...OPT_IC_CFG, ...(icOptions?.cfg || {}) },
          { useCurrentGeometry: true, lensShift }
        );
        const measured = Number(icRes?.usableCircleDiameterMm ?? icRes?.softICmm ?? 0);
        softIcMm = Number.isFinite(measured) ? measured : 0;
      }
      icShortfallMm = Math.max(0, Number(targetIC) - softIcMm);
      icEvalMs = performance.now() - ic0;
    }
    tIcMs += icEvalMs;

    const realismBase = getRealismPenaltyCached(
      surfaces,
      {
        targetIC,
        sensorW,
        sensorH,
      }
    );
    const hardInvalidCombined = hardInvalidBase || !!realismBase?.hardInvalid;

    const provisionalPriority = buildOptPriority(
      {
        score: 0,
        efl,
        T,
        softIcMm: Number.isFinite(softIcMm) ? Number(softIcMm) : 0,
        intrusion,
        hardInvalid: hardInvalidCombined,
        physPenalty: physPenaltyTotal,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
        realismPenalty: Number(realismBase?.penalty || 0),
        realismHardInvalid: !!realismBase?.hardInvalid,
        realismHardOverMm: Number(realismBase?.hardOverMm || 0),
        frontOD: Number(realismBase?.envelope?.frontOD || 0),
        maxOD: Number(realismBase?.envelope?.maxOD || 0),
        rearOD: Number(realismBase?.envelope?.rearOD || 0),
      },
      { targetEfl, targetIC, targetT }
    );
    const shouldMeasureDistortion =
      (evalTierNorm !== "fast") ||
      !MERIT_CFG.distFastMeasureOnlyInFlBand ||
      provisionalPriority.flInBand;
    const distortionStats = shouldMeasureDistortion
      ? (
        evalTierNorm === "fast"
          ? measureDistortionChiefSamples(
              surfaces,
              wavePreset,
              sensorX,
              sensorW,
              sensorH,
              efl,
              "d",
              MERIT_CFG.distSampleFracs
            )
          : getDistortionChiefStatsCached(
              surfaces,
              wavePreset,
              sensorX,
              sensorW,
              sensorH,
              efl,
              "d",
              MERIT_CFG.distSampleFracs
            )
      )
      : null;
    const distortionWeight = shouldMeasureDistortion
      ? distortionWeightForPriority(provisionalPriority)
      : 0;
    const distPenaltyRes = distortionPenaltyFromStats(distortionStats, distortionWeight);
    const realismWeight = realismWeightForPriority(
      provisionalPriority,
      {
        targetIC,
        sensorW,
        sensorH,
      }
    );
    const realismPenaltyRes = realismPenaltyFromBase(realismBase, realismWeight);

    const meritRes = computeMeritV1({
      surfaces,
      wavePreset,
      sensorX,
      rayCount: evalRayCount,
      fov,
      intrusion,
      efl,
      T,
      bfl,
      targetEfl,
      targetT,
      physPenalty: physPenaltyTotal,
      hardInvalid: hardInvalidCombined,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      internalCrossPenalty: crossPenalty,
      distortionStats,
      distortionPenalty: distPenaltyRes.penalty,
      distortionWeight: distPenaltyRes.weight,
      realismPenalty: realismPenaltyRes.penalty,
      realismBasePenalty: realismPenaltyRes.basePenalty,
      realismWeight: realismPenaltyRes.weight,
      realismHardInvalid: realismPenaltyRes.hardInvalid,
      realismBreakdown: realismPenaltyRes.breakdown,
      envelopeStats: realismPenaltyRes.envelope,
    });
    tTraceMs += Math.max(0, performance.now() - trace0 - icEvalMs);

    // tiny extra: hard fail if NaNs
    const score = Number.isFinite(meritRes.merit) ? meritRes.merit : 1e9;

    return finishEval({
      score,
      efl,
      T,
      softIcMm,
      icShortfallMm,
      bfl,
      intrusion,
      vigFrac,
      hardInvalid: hardInvalidCombined,
      physPenalty: physPenaltyTotal,
      worstOverlap: Number(phys.worstOverlap || 0),
      worstPinch: Number(phys.worstPinch || 0),
      goodFrac0: centerTp.goodFrac,
      lensShift,
      afOk,
      rms0: meritRes.breakdown.rmsCenter,
      rmsE: meritRes.breakdown.rmsEdge,
      distRmsPct: meritRes.breakdown.distRmsPct,
      distMaxPct: meritRes.breakdown.distMaxPct,
      distEdgePct: meritRes.breakdown.distEdgePct,
      distFlavor: meritRes.breakdown.distFlavor,
      distPenalty: meritRes.breakdown.distPenalty,
      distWeight: meritRes.breakdown.distWeight,
      realismPenalty: meritRes.breakdown.realismPenalty,
      realismBasePenalty: meritRes.breakdown.realismBasePenalty,
      realismWeight: meritRes.breakdown.realismWeight,
      realismHardInvalid: meritRes.breakdown.realismHardInvalid,
      realismHardOverMm: meritRes.breakdown.realismHardOverMm,
      frontOD: meritRes.breakdown.frontOD,
      maxOD: meritRes.breakdown.maxOD,
      rearOD: meritRes.breakdown.rearOD,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      breakdown: meritRes.breakdown,
    });
  }

  function stageName(stage) {
    if (stage < 0) return "Physics fix";
    if (stage === 0) return "FL acquire";
    if (stage === 1) return "T coarse";
    if (stage === 2) return "IC growth";
    return "Fine tune";
  }

  function buildOptPriority(evalRes, { targetEfl, targetIC, targetT }) {
    const efl = Number(evalRes?.efl);
    const T = Number(evalRes?.T);
    const bfl = Number(evalRes?.bfl);
    const score = Number.isFinite(evalRes?.score) ? Number(evalRes.score) : 1e9;
    const crossPairs = Math.max(0, Number(evalRes?.internalCrossPairs || 0));
    const crossSegments = Math.max(0, Number(evalRes?.internalCrossSegments || 0));
    const realismPenalty = Math.max(
      0,
      Number(evalRes?.realismPenalty ?? evalRes?.breakdown?.realismPenalty ?? 0)
    );
    const realismBasePenalty = Math.max(
      0,
      Number(evalRes?.realismBasePenalty ?? evalRes?.breakdown?.realismBasePenalty ?? 0)
    );
    const realismWeight = Math.max(
      0,
      Number(evalRes?.realismWeight ?? evalRes?.breakdown?.realismWeight ?? 0)
    );
    const realismHardInvalid = !!(evalRes?.realismHardInvalid ?? evalRes?.breakdown?.realismHardInvalid);
    const realismHardOverMm = Math.max(
      0,
      Number(evalRes?.realismHardOverMm ?? evalRes?.breakdown?.realismHardOverMm ?? 0)
    );
    const frontOD = Number(evalRes?.frontOD ?? evalRes?.breakdown?.frontOD);
    const maxOD = Number(evalRes?.maxOD ?? evalRes?.breakdown?.maxOD);
    const rearOD = Number(evalRes?.rearOD ?? evalRes?.breakdown?.rearOD);
    const realismOdPenalty = Math.max(
      0,
      Number(evalRes?.realismOdPenalty ?? evalRes?.breakdown?.realismOdPenalty ?? 0)
    );
    const realismThicknessPenalty = Math.max(
      0,
      Number(evalRes?.realismThicknessPenalty ?? evalRes?.breakdown?.realismThicknessPenalty ?? 0)
    );
    const realismRadiusPenalty = Math.max(
      0,
      Number(evalRes?.realismRadiusPenalty ?? evalRes?.breakdown?.realismRadiusPenalty ?? 0)
    );
    const realismEdgePenalty = Math.max(
      0,
      Number(evalRes?.realismEdgePenalty ?? evalRes?.breakdown?.realismEdgePenalty ?? 0)
    );
    const realismPackagingPenalty = Math.max(
      0,
      Number(evalRes?.realismPackagingPenalty ?? evalRes?.breakdown?.realismPackagingPenalty ?? 0)
    );
    const realismProfileLabel = String(evalRes?.realismProfileLabel ?? evalRes?.breakdown?.realismProfileLabel ?? "");
    const realismLargeSensor = !!(evalRes?.realismLargeSensor ?? evalRes?.breakdown?.realismLargeSensor);
    const afOk = evalRes?.afOk !== false;
    const hardInvalid = !!evalRes?.hardInvalid || crossPairs > 0 || realismHardInvalid || !afOk;
    const intrusionMm = Math.max(0, Number(evalRes?.intrusion || 0));
    const overlapMm = Math.max(0, Number(evalRes?.worstOverlap || 0));
    const pinchMm = Math.max(0, Number(evalRes?.worstPinch || 0));
    const physPenalty = Math.max(0, Number(evalRes?.physPenalty || 0));
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, MERIT_CFG.bflMin - bfl) : MERIT_CFG.bflMin;
    const bflHardShortMm = Math.max(0.1, Number(OPT_STAGE_CFG.bflHardShortMm || 0.8));
    const bflHardFail = bflShortMm > bflHardShortMm;
    const bflBad = bflShortMm > 0.5;
    const feasible = !hardInvalid && !bflHardFail && intrusionMm <= 1e-3 && overlapMm <= 1e-3 && crossPairs <= 0;
    const feasibilityDebt =
      (hardInvalid ? 5000 : 0) +
      (!afOk ? 2800 : 0) +
      (bflHardFail ? 2400 : 0) +
      intrusionMm * 1200 +
      overlapMm * 2000 +
      bflShortMm * 260 +
      Math.max(0, pinchMm - 0.35) * 160 +
      crossPairs * 1800 +
      crossSegments * 500 +
      physPenalty * 0.02 +
      (realismHardInvalid ? (1200 + realismHardOverMm * 1800) : 0) +
      realismPenalty * 0.015;

    const eflErrRel = Number.isFinite(efl) && targetEfl > 1e-9
      ? Math.abs(efl - targetEfl) / targetEfl
      : Infinity;
    // Tiny epsilon avoids floating-point edge misses.
    const flInBand = eflErrRel <= (OPT_STAGE_CFG.flBandRel + 1e-4);
    const flReady = eflErrRel <= (OPT_STAGE_CFG.flStageRel + 1e-4);

    const icMeasured = Number.isFinite(evalRes?.softIcMm) ? Number(evalRes.softIcMm) : 0;
    const icGoalMm = targetIC > 0 ? (targetIC * OPT_STAGE_CFG.icPassFrac) : 0;
    const icNeedMm = targetIC > 0 ? Math.max(0, icGoalMm - icMeasured) : 0;
    const icGood = targetIC <= 0 || icNeedMm <= 0;

    // One-sided T error: only too-slow T is an error.
    const tErrAbs = targetT > 0 && Number.isFinite(T)
      ? Math.max(0, T - targetT)
      : (targetT > 0 ? Infinity : 0);
    const tFastAbs = targetT > 0 && Number.isFinite(T)
      ? Math.max(0, targetT - T)
      : 0;
    const tGood = targetT <= 0 || tErrAbs <= OPT_STAGE_CFG.tGoodAbs;

    const rms0 = Number(evalRes?.rms0);
    const rmsE = Number(evalRes?.rmsE);
    const vigFrac = Number(evalRes?.vigFrac);
    const sharpness = (Number.isFinite(rms0) ? rms0 : 999) +
      1.7 * (Number.isFinite(rmsE) ? rmsE : 999) +
      0.5 * (Number.isFinite(vigFrac) ? vigFrac : 1);
    const distRmsPctRaw = Number(evalRes?.distRmsPct);
    const distMaxPctRaw = Number(evalRes?.distMaxPct);
    const distEdgePct = Number(evalRes?.distEdgePct);
    const distFlavor = String(evalRes?.distFlavor || distortionFlavorFromEdgePct(distEdgePct));
    const distPenalty = Math.max(0, Number(evalRes?.distPenalty || 0));
    const distWeight = Math.max(0, Number(evalRes?.distWeight || 0));
    const distRmsScore = Number.isFinite(distRmsPctRaw) ? Math.abs(distRmsPctRaw) : 999;
    const distMaxScore = Number.isFinite(distMaxPctRaw) ? Math.abs(distMaxPctRaw) : 999;
    const distortionScore = distRmsScore + 0.45 * distMaxScore;
    const realismScore = realismPenalty + 0.25 * realismBasePenalty;

    let stage = feasible ? 0 : -1;
    // Stage flow: FL acquire -> T coarse -> IC growth -> fine tune.
    if (feasible && flInBand) {
      const needsTCoarse = targetT > 0 && (!Number.isFinite(tErrAbs) || tErrAbs > OPT_STAGE_CFG.tCoarseAbs);
      if (needsTCoarse) stage = 1;
      else if (!icGood) stage = 2;
      else stage = 3;
    }
    const stageRank = stage < 0 ? 0 : (stage + 1); // 0=invalid, 1..4 better as objectives complete

    return {
      stage,
      stageRank,
      stageName: stageName(stage),
      score,
      feasible,
      feasibilityDebt,
      hardInvalid,
      intrusionMm,
      overlapMm,
      pinchMm,
      physPenalty,
      bfl,
      bflShortMm,
      bflHardFail,
      bflBad,
      efl,
      eflErrRel,
      flInBand,
      flReady,
      icMeasured,
      icGoalMm,
      icNeedMm,
      icGood,
      T,
      tErrAbs,
      tFastAbs,
      tGood,
      afOk,
      sharpness,
      rms0: Number.isFinite(rms0) ? rms0 : null,
      rmsE: Number.isFinite(rmsE) ? rmsE : null,
      internalCrossPairs: crossPairs,
      internalCrossSegments: crossSegments,
      distRmsPct: Number.isFinite(distRmsPctRaw) ? distRmsPctRaw : null,
      distMaxPct: Number.isFinite(distMaxPctRaw) ? distMaxPctRaw : null,
      distEdgePct: Number.isFinite(distEdgePct) ? distEdgePct : null,
      distFlavor,
      distPenalty,
      distWeight,
      distRmsScore,
      distMaxScore,
      distortionScore,
      realismPenalty,
      realismBasePenalty,
      realismWeight,
      realismHardInvalid,
      realismHardOverMm,
      realismScore,
      frontOD: Number.isFinite(frontOD) ? frontOD : null,
      maxOD: Number.isFinite(maxOD) ? maxOD : null,
      rearOD: Number.isFinite(rearOD) ? rearOD : null,
      realismOdPenalty,
      realismThicknessPenalty,
      realismRadiusPenalty,
      realismEdgePenalty,
      realismPackagingPenalty,
      realismProfileLabel,
      realismLargeSensor,
    };
  }

  function compareEvalByPlan(a, b, targets) {
    if (!b) return -1;
    const A = buildOptPriority(a, targets);
    const B = buildOptPriority(b, targets);

    // Hard physical feasibility gate.
    if (A.feasible !== B.feasible) return A.feasible ? -1 : 1;
    if (!A.feasible && !B.feasible) {
      if (Math.abs(A.feasibilityDebt - B.feasibilityDebt) > 1e-3) {
        return A.feasibilityDebt - B.feasibilityDebt;
      }
      if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
      return A.score - B.score;
    }

    // Hard gate: while in FL acquire, FL error is lexicographically dominant.
    if (A.stage === 0 && B.stage === 0) {
      if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
      return A.score - B.score;
    }

    const flGap = Math.abs(A.eflErrRel - B.eflErrRel);
    // FL is dominant while still acquiring FL or when either candidate drifts outside the hold band.
    const flDominant = (A.stage <= 0 && B.stage <= 0) || !A.flInBand || !B.flInBand;
    if (flDominant && flGap > OPT_STAGE_CFG.flPreferRel) {
      return A.eflErrRel - B.eflErrRel;
    }

    // Higher stage rank is better: Physics fix < FL acquire < T coarse < IC growth < Fine tune.
    if (A.stageRank !== B.stageRank) return B.stageRank - A.stageRank;

    if (A.stage === 0 && Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) {
      return A.eflErrRel - B.eflErrRel;
    }

    if (A.stage === 1) {
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
      if (Math.abs(A.icNeedMm - B.icNeedMm) > 0.01) return A.icNeedMm - B.icNeedMm;
    }

    if (A.stage === 2) {
      if (Math.abs(A.icNeedMm - B.icNeedMm) > 0.005) return A.icNeedMm - B.icNeedMm;
      if (Math.abs(A.icMeasured - B.icMeasured) > 0.005) return B.icMeasured - A.icMeasured;
      // If IC is flat, prefer better T so the pupil can open for later IC jumps.
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
    }

    if (A.stage === 3) {
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
      if (Math.abs(A.eflErrRel - B.eflErrRel) > OPT_STAGE_CFG.polishFlDriftRel) return A.eflErrRel - B.eflErrRel;
      if (Math.abs(A.distRmsScore - B.distRmsScore) > 0.001) return A.distRmsScore - B.distRmsScore;
      if (Math.abs(A.distMaxScore - B.distMaxScore) > 0.002) return A.distMaxScore - B.distMaxScore;
      const aEdge = Number.isFinite(A.distEdgePct) ? Math.abs(A.distEdgePct) : 999;
      const bEdge = Number.isFinite(B.distEdgePct) ? Math.abs(B.distEdgePct) : 999;
      if (Math.abs(aEdge - bEdge) > 0.003) return aEdge - bEdge;
      if (Math.abs(A.realismScore - B.realismScore) > 0.05) return A.realismScore - B.realismScore;
      if (Math.abs(A.sharpness - B.sharpness) > 1e-5) return A.sharpness - B.sharpness;
    }

    if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
    return A.score - B.score;
  }

  function planEnergy(pri) {
    if (!pri) return Infinity;
    if (!pri.feasible) {
      return 1e9 + pri.feasibilityDebt * 100 + pri.eflErrRel * 1e5;
    }
    const stagePenalty = Math.max(0, 5 - Number(pri.stageRank || 0));
    const eflW = pri.stage <= 0 ? 360000 : (pri.stage === 1 ? 60000 : 16000);
    const icW = pri.stage === 2 ? 1400 : 260;
    const tW = pri.stage === 1 ? 520 : (pri.stage === 2 ? 260 : 140);
    const distW = pri.stage >= 3 ? 520 : (pri.stage === 2 ? 85 : 10);
    const realismW = pri.stage >= 3 ? 45 : (pri.stage === 2 ? 12 : 4);
    return (
      stagePenalty * 100000 +
      pri.eflErrRel * eflW +
      pri.icNeedMm * icW +
      pri.tErrAbs * tW +
      pri.sharpness * 15 +
      pri.distRmsScore * distW +
      pri.distMaxScore * distW * 0.45 +
      pri.realismScore * realismW
    );
  }

  function isEvalBetterByPlan(a, b, targets) {
    return compareEvalByPlan(a, b, targets) < 0;
  }

  function fmtFlOpt(evalRes, targetEfl) {
    const p = buildOptPriority(evalRes, { targetEfl, targetIC: 0, targetT: 0 });
    const eflTxt = Number.isFinite(p.efl) ? p.efl.toFixed(2) : "—";
    const errTxt = Number.isFinite(p.eflErrRel) ? (p.eflErrRel * 100).toFixed(2) : "—";
    const mark = p.flReady ? " ✅ tight" : (p.flInBand ? " ✓ band" : "");
    return `FL ${eflTxt}mm (target ${targetEfl.toFixed(2)} • err ${errTxt}%${mark})`;
  }

  function fmtIcOpt(evalRes, targetIC) {
    if (!(Number.isFinite(targetIC) && targetIC > 0)) return "IC target off";
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC, targetT: 0 });
    return `IC ${p.icMeasured.toFixed(2)}mm (goal >= ${p.icGoalMm.toFixed(2)} • short ${p.icNeedMm.toFixed(2)})`;
  }

  function fmtTOpt(evalRes, targetT) {
    if (!(Number.isFinite(targetT) && targetT > 0)) return "T target off";
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC: 0, targetT });
    const tTxt = Number.isFinite(p.T) ? p.T.toFixed(2) : "—";
    const slowTxt = Number.isFinite(p.tErrAbs) ? p.tErrAbs.toFixed(2) : "—";
    const fastTxt = Number.isFinite(p.tFastAbs) && p.tFastAbs > 0.01 ? ` • fast ${p.tFastAbs.toFixed(2)}` : "";
    return `T ${tTxt} (target <= ${targetT.toFixed(2)} • slow ${slowTxt}${fastTxt}${p.tGood ? " ✅" : ""})`;
  }

  function fmtDistOpt(evalRes) {
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC: 0, targetT: 0 });
    const rmsTxt = Number.isFinite(p.distRmsPct) ? `${Math.abs(p.distRmsPct).toFixed(2)}%` : "—";
    const maxTxt = Number.isFinite(p.distMaxPct) ? `${Math.abs(p.distMaxPct).toFixed(2)}%` : "—";
    const edgeTxt = Number.isFinite(p.distEdgePct) ? `${Number(p.distEdgePct).toFixed(2)}%` : "—";
    const flavor = (p.distFlavor === "barrel" || p.distFlavor === "pincushion") ? ` • ${p.distFlavor}` : "";
    return `Dist RMS ${rmsTxt} • MAX ${maxTxt} • edge ${edgeTxt}${flavor} • target 0.00%`;
  }

  function fmtRealismOpt(evalRes, targets = {}) {
    const p = buildOptPriority(evalRes, {
      targetEfl: Number(targets?.targetEfl || 1),
      targetIC: Number(targets?.targetIC || 0),
      targetT: Number(targets?.targetT || 0),
    });
    const scoreTxt = Number.isFinite(p.realismScore) ? p.realismScore.toFixed(2) : "—";
    const odTxt = Number.isFinite(p.realismOdPenalty) ? p.realismOdPenalty.toFixed(1) : "—";
    const tTxt = Number.isFinite(p.realismThicknessPenalty) ? p.realismThicknessPenalty.toFixed(1) : "—";
    const rTxt = Number.isFinite(p.realismRadiusPenalty) ? p.realismRadiusPenalty.toFixed(1) : "—";
    const eTxt = Number.isFinite(p.realismEdgePenalty) ? p.realismEdgePenalty.toFixed(1) : "—";
    const pkTxt = Number.isFinite(p.realismPackagingPenalty) ? p.realismPackagingPenalty.toFixed(1) : "—";
    const fTxt = Number.isFinite(p.frontOD) ? `${p.frontOD.toFixed(1)}mm` : "—";
    const mTxt = Number.isFinite(p.maxOD) ? `${p.maxOD.toFixed(1)}mm` : "—";
    const prof = p.realismProfileLabel ? ` • ${p.realismProfileLabel}` : "";
    const hardTag = p.realismHardInvalid ? " • HARD ❌" : "";
    return `Realism ${scoreTxt}${prof}${hardTag} • FrontOD ${fTxt} • MaxOD ${mTxt} • OD ${odTxt} • t ${tTxt} • R ${rTxt} • edge ${eTxt} • pack ${pkTxt}`;
  }

  function fmtPhysOpt(evalRes, targets) {
    const p = buildOptPriority(evalRes, targets);
    if (p.feasible) return "PHYS OK ✅";
    const intrTxt = Number.isFinite(p.intrusionMm) ? p.intrusionMm.toFixed(2) : "—";
    const ovTxt = Number.isFinite(p.overlapMm) ? p.overlapMm.toFixed(2) : "—";
    const bflTxt = Number.isFinite(p.bflShortMm) ? p.bflShortMm.toFixed(2) : "—";
    const xoverTxt = Math.max(0, Number(p.internalCrossPairs || 0)).toFixed(0);
    const odTxt = p.realismHardInvalid
      ? ` • OD hard +${Math.max(0, Number(p.realismHardOverMm || 0)).toFixed(2)}mm`
      : "";
    const afTxt = p.afOk === false ? " • AF fail" : "";
    return `PHYS INVALID ❌ (intr ${intrTxt}mm • overlap ${ovTxt}mm • BFL short ${bflTxt}mm • xover ${xoverTxt}${odTxt}${afTxt})`;
  }

  function fmtStageStep(stage) {
    if (!Number.isFinite(stage) || stage < 0) return "0/4";
    return `${Math.min(4, (stage | 0) + 1)}/4`;
  }

  function evaluateSharpness(surfaces, wavePreset, sensorX, rayCount, opts = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) {
      return {
        ok: false,
        score: Infinity,
        weightedRmsMm: Infinity,
        penaltyMm: Number(SHARP_OPT_CFG.noDataPenaltyMm || 3.2),
        rmsByAngle: [],
        validCounts: [],
        validFracs: [],
        anglesDeg: [],
        maxFieldDeg: 0,
        centerRmsMm: null,
        edgeRmsMm: null,
      };
    }

    const sensor = getSensorWH();
    const sensorW = Number.isFinite(opts?.sensorW) ? Number(opts.sensorW) : Number(sensor.w || 36.7);
    const sensorH = Number.isFinite(opts?.sensorH) ? Number(opts.sensorH) : Number(sensor.h || 25.54);
    const lensShift = Number.isFinite(opts?.lensShift) ? Number(opts.lensShift) : 0;
    const stepDeg = Number.isFinite(opts?.maxFieldStepDeg)
      ? Number(opts.maxFieldStepDeg)
      : Number(SHARP_OPT_CFG.maxFieldStepDeg || 1.25);
    const scanDeg = Number.isFinite(opts?.maxFieldScanDeg)
      ? Number(opts.maxFieldScanDeg)
      : Number(SHARP_OPT_CFG.maxFieldScanDeg || 65);
    const angleFractions = Array.isArray(opts?.angleFractions) && opts.angleFractions.length
      ? opts.angleFractions.map((v) => clamp(Number(v || 0), 0, 1))
      : Array.from(SHARP_OPT_CFG.angleFractions || [0, 0.35, 0.7, 0.95]);
    const angleWeights = Array.isArray(opts?.angleWeights) && opts.angleWeights.length === angleFractions.length
      ? opts.angleWeights.map((v) => Math.max(0.05, Number(v || 0.05)))
      : angleFractions.map((_, i) => Number(SHARP_OPT_CFG.angleWeights?.[i] ?? 1));
    const evalRayCount = clamp(
      Number(rayCount || 21) | 0,
      Number(SHARP_OPT_CFG.rayCountMin || 11),
      Number(SHARP_OPT_CFG.rayCountMax || 41)
    );
    const minValidFrac = clamp(
      Number(opts?.minValidFrac ?? SHARP_OPT_CFG.minValidFrac ?? 0.48),
      0.05,
      1.0
    );
    const lowValidPenaltyMm = Math.max(0, Number(opts?.lowValidPenaltyMm ?? SHARP_OPT_CFG.lowValidPenaltyMm ?? 0.75));
    const noDataPenaltyMm = Math.max(0.1, Number(opts?.noDataPenaltyMm ?? SHARP_OPT_CFG.noDataPenaltyMm ?? 3.2));

    computeVertices(surfaces, lensShift, Number(sensorX || 0));
    const maxFieldDeg = Number.isFinite(opts?.maxFieldDeg)
      ? Math.max(0, Number(opts.maxFieldDeg))
      : coverageTestMaxFieldDeg(surfaces, wavePreset, Number(sensorX || 0), {
          sensorW,
          sensorH,
          stepDeg,
          maxDeg: scanDeg,
        });

    const anglesDeg = angleFractions.map((f) => clamp(f, 0, 1) * maxFieldDeg);
    const rmsByAngle = [];
    const validCounts = [];
    const validFracs = [];
    const sampleDetails = [];
    let weightedRmsMm = 0;
    let weightSum = 0;
    let penaltyMm = 0;
    let validFields = 0;

    for (let i = 0; i < anglesDeg.length; i++) {
      const fieldDeg = Math.max(0, Number(anglesDeg[i] || 0));
      const w = Math.max(0.05, Number(angleWeights[i] || 1));
      const rays = buildRays(surfaces, fieldDeg, evalRayCount);
      const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
      const spot = spotRmsAtSensorX(traces, Number(sensorX || 0));
      const nValid = Math.max(0, Number(spot?.n || 0));
      const total = Math.max(1, traces.length);
      const validFrac = nValid / total;
      const rms = Number(spot?.rms);
      const rmsSafe = Number.isFinite(rms) ? rms : 999;

      rmsByAngle.push(Number.isFinite(rms) ? rms : null);
      validCounts.push(nValid);
      validFracs.push(validFrac);
      sampleDetails.push({
        idx: i,
        fieldDeg,
        weight: w,
        rmsMm: Number.isFinite(rms) ? rms : null,
        valid: nValid,
        total,
        validFrac,
      });

      if (Number.isFinite(rms) && nValid > 0) {
        weightedRmsMm += w * rmsSafe;
        weightSum += w;
        validFields++;
      } else {
        penaltyMm += noDataPenaltyMm * w;
      }

      if (validFrac < minValidFrac) {
        const d = (minValidFrac - validFrac);
        penaltyMm += lowValidPenaltyMm * w * d * d * 8.0;
      }
    }

    const weighted = weightSum > 1e-9 ? (weightedRmsMm / weightSum) : Infinity;
    const score = (Number.isFinite(weighted) ? weighted : noDataPenaltyMm * 2) + penaltyMm;
    const centerRmsMm = rmsByAngle.length ? rmsByAngle[0] : null;
    const edgeRmsMm = rmsByAngle.length ? rmsByAngle[rmsByAngle.length - 1] : null;

    return {
      ok: Number.isFinite(score),
      score,
      weightedRmsMm: weighted,
      penaltyMm,
      rmsByAngle,
      validCounts,
      validFracs,
      anglesDeg,
      maxFieldDeg,
      centerRmsMm,
      edgeRmsMm,
      validFields,
      rayCount: evalRayCount,
      samples: sampleDetails,
      minValidFrac,
    };
  }

  function findBestFocusShift(surfaces, focusMode, sensorX, lensShift, wavePreset, opts = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) {
      return {
        ok: false,
        mode: String(focusMode || "lens"),
        shift: Number(focusMode === "cam" ? sensorX : lensShift) || 0,
        sensorX: Number(sensorX || 0),
        lensShift: Number(lensShift || 0),
        score: Infinity,
        rmsCenter: null,
      };
    }
    const mode = String(focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sensor = getSensorWH();
    const sensorW = Number.isFinite(opts?.sensorW) ? Number(opts.sensorW) : Number(sensor.w || 36.7);
    const sensorH = Number.isFinite(opts?.sensorH) ? Number(opts.sensorH) : Number(sensor.h || 25.54);
    const center = mode === "cam" ? Number(sensorX || 0) : Number(lensShift || 0);
    const range = Math.max(0.1, Number(opts?.rangeMm ?? SHARP_OPT_CFG.autofocus.rangeMm ?? 0.6));
    const coarseStep = Math.max(0.02, Number(opts?.coarseStepMm ?? SHARP_OPT_CFG.autofocus.coarseStepMm ?? 0.10));
    const fineHalf = Math.max(0.04, Number(opts?.fineHalfMm ?? SHARP_OPT_CFG.autofocus.fineHalfMm ?? 0.16));
    const fineStep = Math.max(0.01, Number(opts?.fineStepMm ?? SHARP_OPT_CFG.autofocus.fineStepMm ?? 0.04));
    const afRayCount = clamp(
      Number(opts?.rayCount ?? SHARP_OPT_CFG.autofocus.rayCount ?? 15) | 0,
      9,
      31
    );
    const fieldMode = String(opts?.fieldMode || SHARP_OPT_CFG.autofocus.fieldMode || "center").toLowerCase();

    let best = {
      shift: center,
      sensorX: mode === "cam" ? center : Number(sensorX || 0),
      lensShift: mode === "lens" ? center : Number(lensShift || 0),
      score: Infinity,
      rmsCenter: null,
      nCenter: 0,
    };

    const evalAt = (shiftVal) => {
      const sx = mode === "cam" ? shiftVal : Number(sensorX || 0);
      const ls = mode === "lens" ? shiftVal : Number(lensShift || 0);
      computeVertices(surfaces, ls, sx);

      if (fieldMode === "weighted") {
        const sh = evaluateSharpness(surfaces, wavePreset, sx, afRayCount, {
          sensorW,
          sensorH,
          lensShift: ls,
          maxFieldStepDeg: Math.max(1.2, Number(SHARP_OPT_CFG.maxFieldStepDeg || 1.25)),
          maxFieldScanDeg: Math.max(18, Number(SHARP_OPT_CFG.maxFieldScanDeg || 65)),
          noDataPenaltyMm: Number(SHARP_OPT_CFG.noDataPenaltyMm || 3.2),
        });
        const centerRms = Number(sh?.centerRmsMm);
        return {
          score: Number(sh?.score),
          rmsCenter: Number.isFinite(centerRms) ? centerRms : null,
          nCenter: Number(sh?.validCounts?.[0] || 0),
          sensorX: sx,
          lensShift: ls,
        };
      }

      const rays = buildRays(surfaces, 0, afRayCount);
      const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
      const st = spotRmsAtSensorX(traces, sx);
      const n = Math.max(0, Number(st?.n || 0));
      const vf = n / Math.max(1, traces.length);
      const rms = Number(st?.rms);
      if (!Number.isFinite(rms)) {
        return { score: Infinity, rmsCenter: null, nCenter: n, sensorX: sx, lensShift: ls };
      }
      const validPenalty = vf < 0.45 ? (0.7 * Math.pow(0.45 - vf, 2) * 8.0) : 0;
      return {
        score: rms + validPenalty,
        rmsCenter: rms,
        nCenter: n,
        sensorX: sx,
        lensShift: ls,
      };
    };

    const scan = (centerShift, half, step) => {
      const start = centerShift - half;
      const end = centerShift + half;
      for (let sh = start; sh <= end + 1e-9; sh += step) {
        const ev = evalAt(sh);
        if (!Number.isFinite(ev.score)) continue;
        if (ev.score + 1e-12 < best.score) {
          best = {
            shift: sh,
            sensorX: ev.sensorX,
            lensShift: ev.lensShift,
            score: ev.score,
            rmsCenter: ev.rmsCenter,
            nCenter: ev.nCenter,
          };
        }
      }
    };

    scan(center, range, coarseStep);
    if (Number.isFinite(best.score)) scan(best.shift, fineHalf, fineStep);

    return {
      ok: Number.isFinite(best.score),
      mode,
      shift: Number(best.shift || 0),
      sensorX: Number(best.sensorX || 0),
      lensShift: Number(best.lensShift || 0),
      score: Number.isFinite(best.score) ? best.score : Infinity,
      rmsCenter: Number.isFinite(best.rmsCenter) ? best.rmsCenter : null,
      nCenter: Number(best.nCenter || 0),
    };
  }

  function formatSharpnessBadgeText(sharp, compact = false) {
    const c = Number(sharp?.centerRmsMm);
    const e = Number(sharp?.edgeRmsMm);
    if (!Number.isFinite(c) && !Number.isFinite(e)) {
      return compact ? "RMS C/E — / —" : "RMS C/E: — / — mm";
    }
    const cTxt = Number.isFinite(c) ? c.toFixed(3) : "—";
    const eTxt = Number.isFinite(e) ? e.toFixed(3) : "—";
    if (compact) return `RMS C/E ${cTxt} / ${eTxt}`;
    return `RMS C/E: ${cTxt} / ${eTxt} mm`;
  }

  function getSharpnessBadgeCached({
    surfaces,
    wavePreset,
    sensorX,
    lensShift = 0,
    rayCount = 21,
    sensorW,
    sensorH,
  }) {
    const key = JSON.stringify({
      wavePreset: String(wavePreset || "d"),
      sensorX: Number(sensorX || 0).toFixed(4),
      lensShift: Number(lensShift || 0).toFixed(4),
      rayCount: Number(rayCount || 21) | 0,
      sensorW: Number(sensorW || 0).toFixed(3),
      sensorH: Number(sensorH || 0).toFixed(3),
      fracs: Array.from(SHARP_OPT_CFG.angleFractions || []),
      weights: Array.from(SHARP_OPT_CFG.angleWeights || []),
      surfaces: (surfaces || []).map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    });
    if (key === _sharpCacheKey && _sharpCacheVal) return _sharpCacheVal;
    const val = evaluateSharpness(surfaces, wavePreset, sensorX, rayCount, {
      sensorW,
      sensorH,
      lensShift,
      angleFractions: SHARP_OPT_CFG.angleFractions,
      angleWeights: SHARP_OPT_CFG.angleWeights,
      maxFieldStepDeg: SHARP_OPT_CFG.maxFieldStepDeg,
      maxFieldScanDeg: SHARP_OPT_CFG.maxFieldScanDeg,
      minValidFrac: SHARP_OPT_CFG.minValidFrac,
      lowValidPenaltyMm: SHARP_OPT_CFG.lowValidPenaltyMm,
      noDataPenaltyMm: SHARP_OPT_CFG.noDataPenaltyMm,
    });
    _sharpCacheKey = key;
    _sharpCacheVal = val;
    return val;
  }

  function getFocusStateFromUi() {
    const focusMode = String(ui.focusMode?.value || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sensorX = focusMode === "cam" ? num(ui.sensorOffset?.value, 0) : 0;
    const lensShift = focusMode === "lens" ? num(ui.lensFocus?.value, 0) : 0;
    return { focusMode, sensorX, lensShift };
  }

  function computeMetrics({
    surfaces,
    wavePreset = "d",
    focusMode = "lens",
    sensorX = 0,
    lensShift = 0,
    sensorW = null,
    sensorH = null,
    objDist = COCKPIT_CFG.defaultObjDistMm,
    rayCount = COCKPIT_CFG.defaultRayCount,
    lutN = COCKPIT_CFG.defaultLutN,
    lutPupilSqrt = 1,
    includeUsableIC = true,
    includeDistortion = true,
    includeSharpness = true,
    autofocus = false,
    autofocusOptions = null,
    useCache = false,
  } = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) {
      return {
        feasible: {
          ok: false,
          reasons: ["lens"],
          plIntrusionMm: Infinity,
          overlapOk: false,
          thicknessOk: false,
          stopOk: false,
          validCenterFrac: 0,
          bflShortMm: Infinity,
        },
        efl: NaN,
        bfl: NaN,
        T: NaN,
        maxFieldDeg: NaN,
        fovDeg: null,
        coversGeom: false,
        usableIC: { valid: false, diameterMm: 0, radiusMm: 0, thresholdRel: SOFT_IC_CFG.thresholdRel },
        distortion: { dist70Pct: NaN, rmsPct: NaN, samples: [] },
        sharpness: { rmsCenter: NaN, rmsEdge: NaN, rmsByAngle: [], score: Infinity, validCounts: [] },
      };
    }

    const sensor = getSensorWH();
    const wMm = Number.isFinite(sensorW) ? Number(sensorW) : Number(sensor.w || 36.7);
    const hMm = Number.isFinite(sensorH) ? Number(sensorH) : Number(sensor.h || 25.54);
    const focusModeNorm = String(focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    const sxIn = Number(sensorX || 0);
    const lsIn = Number(lensShift || 0);
    const rays = clamp(Number(rayCount || 21) | 0, 11, 61);
    const lutSamples = clamp(Number(lutN || COCKPIT_CFG.defaultLutN) | 0, 80, 1200);
    const lutPupil = clamp(Number(lutPupilSqrt || 1) | 0, 1, 8);

    const keyObj = {
      wavePreset: String(wavePreset || "d"),
      focusMode: focusModeNorm,
      sensorX: sxIn.toFixed(5),
      lensShift: lsIn.toFixed(5),
      sensorW: wMm.toFixed(4),
      sensorH: hMm.toFixed(4),
      objDist: Number(objDist || COCKPIT_CFG.defaultObjDistMm).toFixed(2),
      rayCount: rays,
      lutN: lutSamples,
      lutPupilSqrt: lutPupil,
      includeDistortion: !!includeDistortion,
      includeUsableIC: !!includeUsableIC,
      includeSharpness: !!includeSharpness,
      autofocus: !!autofocus,
      surfaces: surfaces.map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (useCache && key === _cockpitMetricsCacheKey && _cockpitMetricsCacheVal) {
      return _cockpitMetricsCacheVal;
    }

    const work = clone(surfaces);
    ensureStopExists(work);
    enforceSingleStopSurface(work);
    ensureStopInAirBothSides(work);
    quickSanity(work);

    let sx = sxIn;
    let ls = lsIn;
    if (autofocus) {
      const af = findBestFocusShift(work, focusModeNorm, sxIn, lsIn, wavePreset, {
        sensorW: wMm,
        sensorH: hMm,
        ...(autofocusOptions || SHARP_OPT_CFG.autofocus || {}),
      });
      if (af?.ok) {
        sx = Number(af.sensorX || sx);
        ls = Number(af.lensShift || ls);
      }
    }

    computeVertices(work, ls, sx);
    const stopIdx = findStopSurfaceIndex(work);
    const phys = evaluatePhysicalConstraints(work);
    const rearVx = lastPhysicalVertexX(work);
    const plIntrusionMm = Number.isFinite(rearVx) ? (rearVx - (-PL_FFD)) : Infinity;

    const centerRays = buildRays(work, 0, Math.max(11, Math.min(31, rays)));
    const centerTraces = centerRays.map((r) => traceRayForward(clone(r), work, wavePreset));
    const centerTotal = Math.max(1, centerTraces.length);
    let centerValid = 0;
    for (const tr of centerTraces) {
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      const y = rayHitYAtX(tr.endRay, sx);
      if (Number.isFinite(y)) centerValid++;
    }
    const validCenterFrac = centerValid / centerTotal;
    const cross = detectInternalRayCrossings(centerTraces, work, wavePreset);

    const parax = estimateEflBflParaxial(work, wavePreset);
    const efl = Number(parax?.efl);
    const bfl = Number(parax?.bfl);
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, Number(MERIT_CFG.bflMin || 52) - bfl) : Infinity;
    const T = estimateTStopApprox(efl, work);
    const maxFieldDeg = coverageTestMaxFieldDeg(work, wavePreset, sx, {
      sensorW: wMm,
      sensorH: hMm,
      stepDeg: 1.0,
      maxDeg: 65,
    });
    const fovDeg = computeFovDeg(efl, wMm, hMm);
    const halfDiag = 0.5 * Math.hypot(wMm, hMm);
    const reqFieldDeg = (Number.isFinite(efl) && efl > 1e-9)
      ? (Math.atan(halfDiag / efl) * 180 / Math.PI)
      : NaN;
    const coversGeom = Number.isFinite(maxFieldDeg) && Number.isFinite(reqFieldDeg)
      ? (maxFieldDeg >= reqFieldDeg - 1e-3)
      : false;

    let usableIC = {
      valid: false,
      diameterMm: 0,
      radiusMm: 0,
      thresholdRel: Number(SOFT_IC_CFG.thresholdRel || 0.35),
      relAtCutoff: 0,
      samples: [],
    };
    let distortion = {
      dist70Pct: NaN,
      rmsPct: NaN,
      maxAbsPct: NaN,
      flavor: "unknown",
      samples: [],
    };

    if (includeUsableIC || includeDistortion) {
      const lutPack = getLutOnlyCached({
        surfaces: work,
        wavePreset,
        sensorX: sx,
        lensShift: ls,
        objDist,
        lutN: lutSamples,
        lutPupilSqrt: lutPupil,
        doCA: false,
        sensorW: wMm,
        sensorH: hMm,
      });
      if (includeUsableIC) {
        const uc = computeUsableIcFromLUTPack(lutPack, {
          thresholdRel: Number(SOFT_IC_CFG.thresholdRel || 0.35),
          smoothingHalfWindow: 1,
          minSamplesForCurve: 5,
        });
        usableIC = {
          valid: !!uc?.valid,
          diameterMm: Number.isFinite(uc?.diameterMm) ? Number(uc.diameterMm) : 0,
          radiusMm: Number.isFinite(uc?.radiusMm) ? Number(uc.radiusMm) : 0,
          thresholdRel: Number(uc?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35),
          relAtCutoff: Number(uc?.relAtCutoff || 0),
          samples: Array.isArray(uc?.samples) ? uc.samples : [],
        };
      }

      if (includeDistortion) {
        const distLut = computeDistortionFromLUT(lutPack, {
          efl,
          objDist,
          sampleFracs: DIST_OPT_CFG.sampleFracs,
        });
        if (distLut) {
          distortion = {
            dist70Pct: Number(distLut?.distPctAt70),
            rmsPct: Number(distLut?.rmsDistPct),
            maxAbsPct: Number(distLut?.maxAbsDistPct),
            flavor: String(distLut?.flavor || "unknown"),
            samples: Array.isArray(distLut?.samples) ? distLut.samples : [],
          };
        }
      }
    }

    let sharpness = {
      rmsCenter: NaN,
      rmsEdge: NaN,
      rmsByAngle: [],
      validCounts: [],
      score: Infinity,
      maxFieldDeg: Number.isFinite(maxFieldDeg) ? maxFieldDeg : NaN,
    };
    if (includeSharpness) {
      const sh = evaluateSharpness(work, wavePreset, sx, rays, {
        sensorW: wMm,
        sensorH: hMm,
        lensShift: ls,
        maxFieldDeg: Number.isFinite(maxFieldDeg) ? maxFieldDeg : undefined,
        angleFractions: SHARP_OPT_CFG.angleFractions,
        angleWeights: SHARP_OPT_CFG.angleWeights,
        maxFieldStepDeg: SHARP_OPT_CFG.maxFieldStepDeg,
        maxFieldScanDeg: SHARP_OPT_CFG.maxFieldScanDeg,
        minValidFrac: SHARP_OPT_CFG.minValidFrac,
        lowValidPenaltyMm: SHARP_OPT_CFG.lowValidPenaltyMm,
        noDataPenaltyMm: SHARP_OPT_CFG.noDataPenaltyMm,
      });
      sharpness = {
        rmsCenter: Number(sh?.centerRmsMm),
        rmsEdge: Number(sh?.edgeRmsMm),
        rmsByAngle: Array.isArray(sh?.rmsByAngle) ? sh.rmsByAngle : [],
        validCounts: Array.isArray(sh?.validCounts) ? sh.validCounts : [],
        score: Number(sh?.score),
        maxFieldDeg: Number(sh?.maxFieldDeg),
      };
    }

    const reasons = [];
    if (stopIdx < 0) reasons.push("stop");
    if (!!phys?.hardFail) reasons.push("physics");
    if (cross?.invalid) reasons.push("xover");
    if (!(plIntrusionMm <= Number(COCKPIT_CFG.plIntrusionRejectMm || 0.5))) reasons.push("pl");
    if (!(validCenterFrac >= Number(COCKPIT_CFG.hardMinValidCenterFrac || 0.28))) reasons.push("vignette");
    if (!(bflShortMm <= Number(COCKPIT_CFG.maxBflShortRejectMm || 1.0))) reasons.push("bfl");

    const result = {
      feasible: {
        ok: reasons.length === 0,
        reasons,
        plIntrusionMm,
        overlapOk: Number(phys?.worstOverlap || 0) <= 1e-4,
        thicknessOk: Number(phys?.worstPinch || 0) <= 1e-4 && !phys?.hardFail,
        stopOk: stopIdx >= 0,
        validCenterFrac,
        bflShortMm,
        hardPhysics: !!phys?.hardFail,
        crossPairs: Number(cross?.crossPairs || 0),
      },
      efl,
      bfl,
      T,
      maxFieldDeg,
      fovDeg,
      coversGeom,
      usableIC,
      distortion,
      sharpness,
      focus: {
        mode: focusModeNorm,
        sensorX: sx,
        lensShift: ls,
      },
      context: {
        sensorW: wMm,
        sensorH: hMm,
        wavePreset,
        objDist: Number(objDist || COCKPIT_CFG.defaultObjDistMm),
        reqFieldDeg,
      },
      phys,
      cross,
      stopIdx,
    };

    if (useCache) {
      _cockpitMetricsCacheKey = key;
      _cockpitMetricsCacheVal = result;
    }
    return result;
  }

  function failsHardConstraints(surfaces, metrics, opts = {}) {
    const strict = String(opts?.strictness || "normal").toLowerCase() === "strict";
    const plLimit = strict ? 0.10 : Number(COCKPIT_CFG.plIntrusionRejectMm || 0.50);
    const minValid = strict ? 0.35 : Number(COCKPIT_CFG.hardMinValidCenterFrac || 0.28);
    const bflLimit = strict ? 0.45 : Number(COCKPIT_CFG.maxBflShortRejectMm || 1.0);
    const reasons = [];

    if (!Array.isArray(surfaces) || surfaces.length < 3) reasons.push("lens");
    if (!metrics || typeof metrics !== "object") reasons.push("metrics");
    if (!Number.isFinite(metrics?.efl) || Number(metrics?.efl) <= 1e-6) reasons.push("efl");
    if (!Number.isFinite(metrics?.T) || Number(metrics?.T) <= 0) reasons.push("t");
    if (!metrics?.feasible?.stopOk) reasons.push("stop");
    if (metrics?.feasible?.hardPhysics) reasons.push("physics");
    if (!(Number(metrics?.feasible?.plIntrusionMm) <= plLimit)) reasons.push("pl");
    if (!(Number(metrics?.feasible?.validCenterFrac) >= minValid)) reasons.push("valid");
    if (!(Number(metrics?.feasible?.bflShortMm) <= bflLimit)) reasons.push("bfl");
    if (Number(metrics?.feasible?.crossPairs || 0) > 0) reasons.push("xover");

    return {
      fail: reasons.length > 0,
      reasons,
    };
  }

  function normalizeHardReasonList(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const it of list) {
      const r = String(it || "").trim().toLowerCase();
      if (!r) continue;
      if (!out.includes(r)) out.push(r);
    }
    return out;
  }

  function canRelaxHardFailureForBaseline(hardEval, baseHardEval, candMetrics, baseMetrics, allowedReasons = []) {
    if (!hardEval?.fail) return { ok: true, reason: "none" };
    if (!baseHardEval?.fail) return { ok: false, reason: "no-base-hard" };

    const allow = new Set(normalizeHardReasonList(allowedReasons));
    if (!allow.size) return { ok: false, reason: "no-allow-list" };

    const baseReasons = normalizeHardReasonList(baseHardEval?.reasons || []);
    const nowReasons = normalizeHardReasonList(hardEval?.reasons || []);
    const baseSet = new Set(baseReasons);

    for (const r of nowReasons) {
      if (!allow.has(r) || !baseSet.has(r)) return { ok: false, reason: `new-hard-${r}` };
    }

    // Relax mode still requires monotonic improvement (or equal) for allowed reasons.
    if (nowReasons.includes("pl")) {
      const baseIntr = Number(baseMetrics?.feasible?.plIntrusionMm);
      const candIntr = Number(candMetrics?.feasible?.plIntrusionMm);
      if (!Number.isFinite(baseIntr) || !Number.isFinite(candIntr)) return { ok: false, reason: "pl-nan" };
      if (candIntr > (baseIntr + 0.05)) return { ok: false, reason: "pl-worse" };
    }

    return { ok: true, reason: "relaxed" };
  }

  function fmtIntrusion(evalRes) {
    const v = Number(evalRes?.intrusion);
    return Number.isFinite(v) ? `${v.toFixed(2)}mm` : "—";
  }

  function coverageTestMaxFieldDeg(
    surfaces,
    wavePreset,
    sensorX,
    {
      sensorW = null,
      sensorH = null,
      stepDeg = DIST_OPT_CFG.maxFieldStepDeg,
      maxDeg = DIST_OPT_CFG.maxFieldScanDeg,
      diagTolMm = 0.35,
      breakMissRun = 4,
    } = {}
  ) {
    const sensor = getSensorWH();
    const wMm = Number.isFinite(sensorW) ? Number(sensorW) : Number(sensor.w || 36.7);
    const hMm = Number.isFinite(sensorH) ? Number(sensorH) : Number(sensor.h || 25.54);
    const halfDiag = 0.5 * Math.hypot(wMm, hMm);
    const step = Math.max(0.25, Number(stepDeg || 1.0));
    const limit = Math.max(step, Number(maxDeg || 60));

    let best = 0;
    let missRun = 0;
    for (let th = 0; th <= limit + 1e-9; th += step) {
      const chief = buildChiefRay(surfaces, th);
      const tr = traceRayForward(clone(chief), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay || tr.clippedByMount) {
        missRun++;
        if (th > 8 && missRun >= breakMissRun) break;
        continue;
      }
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (!Number.isFinite(y)) {
        missRun++;
        if (th > 8 && missRun >= breakMissRun) break;
        continue;
      }
      const ok = Math.abs(y) <= (halfDiag + Math.max(0.05, Number(diagTolMm || 0.35)));
      if (ok) {
        best = th;
        missRun = 0;
      } else {
        missRun++;
        if (th > 8 && missRun >= breakMissRun) break;
      }
    }
    return Math.max(0, Number(best || 0));
  }

  function distortionScoreFromSampleSet(samples = []) {
    let score = 0;
    let valid = 0;
    for (const s of samples || []) {
      const frac = Number(s?.frac || 0);
      const d = Number(s?.distPct);
      if (!Number.isFinite(d)) continue;
      let w = 1.0;
      if (frac >= 0.89) w = 1.80;
      else if (frac >= 0.69) w = 1.55;
      score += w * Math.pow(d / 2.0, 2);
      valid++;
    }
    if (valid <= 0) return Infinity;
    return score;
  }

  function measureDistortionState(
    lensObj,
    {
      wavePreset = "d",
      sensorX = 0,
      lensShift = 0,
      objDist = DIST_OPT_CFG.objDistMm,
      sampleFracs = DIST_OPT_CFG.sampleFracs,
      sensorW = null,
      sensorH = null,
      lutN = DIST_OPT_CFG.lutNOptFast,
      lutPupilSqrt = DIST_OPT_CFG.lutPupilSqrtOpt,
      maxFieldStepDeg = DIST_OPT_CFG.maxFieldStepDeg,
      maxFieldScanDeg = DIST_OPT_CFG.maxFieldScanDeg,
      maxBflShortMm = DIST_OPT_CFG.maxBflShortMm,
      plBaselineIntrusionMm = null,
      plWorsenTolMm = DIST_OPT_CFG.plWorsenTolMm,
    } = {}
  ) {
    if (!lensObj?.surfaces || !Array.isArray(lensObj.surfaces)) {
      return { ok: false, reason: "lens" };
    }

    const surfaces = lensObj.surfaces;
    ensureStopExists(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };

    const sx = Number(sensorX || 0);
    const ls = Number(lensShift || 0);
    computeVertices(surfaces, 0, sx);
    const rearVxNeutral = lastPhysicalVertexX(surfaces);
    const intrusionNeutral = Number.isFinite(rearVxNeutral) ? (rearVxNeutral - (-PL_FFD)) : Infinity;

    computeVertices(surfaces, ls, sx);
    const phys = evaluatePhysicalConstraints(surfaces);
    if (phys.hardFail) return { ok: false, reason: "phys", phys };

    const rearVxFocused = lastPhysicalVertexX(surfaces);
    const intrusionFocused = Number.isFinite(rearVxFocused) ? (rearVxFocused - (-PL_FFD)) : Infinity;
    const intrusion = Math.max(intrusionNeutral, intrusionFocused);
    const baseIntr = Number(plBaselineIntrusionMm);
    const plTol = Math.max(0, Number(plWorsenTolMm ?? DIST_OPT_CFG.plWorsenTolMm ?? 0.05));
    const allowRelaxedPl = Number.isFinite(baseIntr) && baseIntr > 1e-3 && intrusion <= (baseIntr + plTol);
    if (!(intrusion <= 1e-3) && !allowRelaxedPl) return { ok: false, reason: "pl", intrusion, phys };

    const rays = buildRays(surfaces, 0, 13);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const cross = detectInternalRayCrossings(traces, surfaces, wavePreset);
    if (cross.invalid) return { ok: false, reason: "xover", cross, phys };

    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    if (!(Number.isFinite(efl) && efl > 1e-6)) return { ok: false, reason: "efl", phys };
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, MERIT_CFG.bflMin - bfl) : Infinity;
    if (!(bflShortMm <= Number(maxBflShortMm || DIST_OPT_CFG.maxBflShortMm))) {
      return { ok: false, reason: "bfl", bflShortMm, bfl, phys };
    }

    const T = estimateTStopApprox(efl, surfaces);
    if (!(Number.isFinite(T) && T > 0)) return { ok: false, reason: "t", efl, phys };

    const maxFieldDeg = coverageTestMaxFieldDeg(surfaces, wavePreset, sx, {
      sensorW,
      sensorH,
      stepDeg: maxFieldStepDeg,
      maxDeg: maxFieldScanDeg,
    });
    if (!(Number.isFinite(maxFieldDeg) && maxFieldDeg >= 0)) {
      return { ok: false, reason: "cov", efl, T, phys };
    }

    const lut = buildLUTOnly({
      surfaces,
      wavePreset,
      sensorX: sx,
      lensShift: ls,
      objDist,
      lutN,
      lutPupilSqrt,
      doCA: false,
      sensorW,
      sensorH,
    });
    if (!lut) return { ok: false, reason: "lut", efl, T, maxFieldDeg, phys };
    const dist = computeDistortionFromLUT(lut, {
      efl,
      objDist,
      sampleFracs,
    });
    if (!dist || !(Number.isFinite(dist.rmsDistPct) && Number.isFinite(dist.maxAbsDistPct))) {
      return { ok: false, reason: "dist", efl, T, maxFieldDeg, phys };
    }

    return {
      ok: true,
      efl,
      T,
      bfl,
      bflShortMm,
      intrusion,
      plRelaxed: allowRelaxedPl,
      plBaselineIntrusionMm: Number.isFinite(baseIntr) ? baseIntr : null,
      maxFieldDeg,
      stopIdx,
      phys,
      cross,
      lut,
      dist,
      distScore: distortionScoreFromSampleSet(dist.samples),
    };
  }

  function scoreDistortionState(state, baseline, cfg = DIST_OPT_CFG) {
    const ws = cfg?.weights || DIST_OPT_CFG.weights;
    const eflDiff = Number(state?.efl || 0) - Number(baseline?.efl || 0);
    const eflRel = Math.abs(eflDiff) / Math.max(1e-6, Math.abs(Number(baseline?.efl || 1)));
    const tDiff = Number(state?.T || 0) - Number(baseline?.T || 0);
    const tAbs = Math.abs(tDiff);
    const covDropDeg = Math.max(0, Number(baseline?.maxFieldDeg || 0) - Number(state?.maxFieldDeg || 0));
    const covPenaltyDeg = Math.max(0, covDropDeg - Number(cfg.maxCoverageDropDeg || DIST_OPT_CFG.maxCoverageDropDeg));
    const distScore = Number.isFinite(state?.distScore) ? Number(state.distScore) : Infinity;

    let hardReject = false;
    let hardReason = "";
    if (!(Number.isFinite(distScore) && distScore < Infinity)) {
      hardReject = true;
      hardReason = "dist";
    } else if (eflRel > Number(cfg.maxEflDriftRelReject || DIST_OPT_CFG.maxEflDriftRelReject)) {
      hardReject = true;
      hardReason = "efl_guard";
    } else if (tAbs > Number(cfg.maxTDriftAbsReject || DIST_OPT_CFG.maxTDriftAbsReject)) {
      hardReject = true;
      hardReason = "t_guard";
    } else if (covDropDeg > Number(cfg.maxCoverageDropRejectDeg || DIST_OPT_CFG.maxCoverageDropRejectDeg)) {
      hardReject = true;
      hardReason = "cov_guard";
    }

    let merit =
      Number(ws.dist || 120) * distScore +
      Number(ws.efl || 80) * (eflDiff * eflDiff) +
      Number(ws.t || 60) * (tDiff * tDiff) +
      Number(ws.cov || 200) * (covPenaltyDeg * covPenaltyDeg);

    if (eflRel > Number(cfg.maxEflDriftRel || DIST_OPT_CFG.maxEflDriftRel)) {
      const d = eflRel - Number(cfg.maxEflDriftRel || DIST_OPT_CFG.maxEflDriftRel);
      merit += 3000.0 * d * d;
    }
    if (tAbs > Number(cfg.maxTDriftAbs || DIST_OPT_CFG.maxTDriftAbs)) {
      const d = tAbs - Number(cfg.maxTDriftAbs || DIST_OPT_CFG.maxTDriftAbs);
      merit += 1800.0 * d * d;
    }

    return {
      merit,
      hardReject,
      hardReason,
      distScore,
      eflDiff,
      eflRel,
      tDiff,
      tAbs,
      covDropDeg,
      covPenaltyDeg,
    };
  }

  function estimateImageCircleDriftProxyMm(
    surfaces,
    sensorW,
    sensorH,
    wavePreset,
    rayCount = 15
  ) {
    if (!Array.isArray(surfaces) || !surfaces.length) return NaN;
    const ic = Number(
      estimateUsableCircleFastProxy(
        surfaces,
        Number(sensorW || 36.7),
        Number(sensorH || 25.54),
        wavePreset || "d",
        Math.max(7, Math.min(21, Number(rayCount || 15) | 0)),
        FAST_OPT_IC_CFG
      )?.usableCircleDiameterMm
    );
    return Number.isFinite(ic) && ic > 0 ? ic : NaN;
  }

  function formatSignedMm(v, digits = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(Math.max(0, digits | 0))}mm`;
  }

  function randRange(a, b) {
    return Number(a) + Math.random() * (Number(b) - Number(a));
  }

  function moveStopSurfaceByOne(surfaces, dir) {
    if (!Array.isArray(surfaces) || !surfaces.length) return false;
    const snapshot = clone(surfaces);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 1 || stopIdx >= surfaces.length - 1) return false;
    const d = dir < 0 ? -1 : 1;
    let targetIdx = stopIdx + d;
    if (targetIdx <= 0 || targetIdx >= surfaces.length - 1) return false;
    const tTarget = String(surfaces[targetIdx]?.type || "").toUpperCase();
    if (tTarget === "OBJ" || tTarget === "IMS") return false;

    const moved = surfaces.splice(stopIdx, 1)[0];
    if (!moved) return false;
    if (targetIdx > stopIdx) targetIdx--;
    surfaces.splice(targetIdx, 0, moved);
    enforceSingleStopSurface(surfaces);

    const newStopIdx = findStopSurfaceIndex(surfaces);
    const prevMedium = newStopIdx > 0
      ? String(resolveGlassName(surfaces[newStopIdx - 1]?.glass || "AIR")).toUpperCase()
      : "AIR";
    const nextMedium = String(resolveGlassName(surfaces[newStopIdx]?.glass || "AIR")).toUpperCase();
    if (prevMedium !== "AIR" || nextMedium !== "AIR") {
      surfaces.splice(0, surfaces.length, ...snapshot);
      return false;
    }

    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function collectDistortionMutationIndices(surfaces, stopIdx) {
    const bend = [];
    const gaps = [];
    const addIf = (arr, idx) => {
      if (!Number.isFinite(idx) || idx < 1 || idx >= surfaces.length - 1) return;
      if (!arr.includes(idx)) arr.push(idx);
    };

    for (let d = -3; d <= 3; d++) addIf(bend, stopIdx + d);
    for (let d = 4; d <= 6; d++) addIf(bend, stopIdx + d);
    for (let d = -3; d <= 6; d++) addIf(gaps, stopIdx + d);

    const bendFiltered = bend.filter((idx) => {
      if (idx === stopIdx) return false;
      const s = surfaces[idx];
      if (!s || surfaceIsLocked(s)) return false;
      const t = String(s?.type || "").toUpperCase();
      if (t === "STOP") return false;
      const absR = Math.abs(Number(s?.R || 0));
      return absR > 1e-9;
    });

    const gapFiltered = gaps.filter((idx) => {
      const s = surfaces[idx];
      if (!s || surfaceIsLocked(s)) return false;
      const mediumAfter = String(resolveGlassName(s?.glass || "AIR")).toUpperCase();
      return mediumAfter === "AIR";
    });

    return { bend: bendFiltered, gaps: gapFiltered };
  }

  function applyOneDistortionMutation(surfaces, cfg = DIST_OPT_CFG) {
    if (!Array.isArray(surfaces) || surfaces.length < 4) return { ok: false, reason: "lens" };
    ensureStopExists(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };

    const mut = cfg?.mutation || DIST_OPT_CFG.mutation;
    const totalChance = Math.max(
      1e-6,
      Number(mut.stopMoveChance || 0) +
      Number(mut.bendChance || 0) +
      Number(mut.airChance || 0) +
      Number(mut.stopApChance || 0)
    );
    const r = Math.random() * totalChance;
    const cutStop = Number(mut.stopMoveChance || 0);
    const cutBend = cutStop + Number(mut.bendChance || 0);
    const cutAir = cutBend + Number(mut.airChance || 0);

    const ids = collectDistortionMutationIndices(surfaces, stopIdx);
    let kind = "bend";
    let mutated = false;

    if (r < cutStop) {
      kind = "stop_shift";
      mutated = moveStopSurfaceByOne(surfaces, Math.random() < 0.5 ? -1 : 1);
    } else if (r < cutBend) {
      kind = "bend";
      if (ids.bend.length) {
        const idx = pick(ids.bend);
        const s = surfaces[idx];
        const R0 = Number(s?.R || 0);
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(R0));
        const sign = Math.sign(R0 || 1) || 1;
        const frac = randRange(
          Math.max(0.0005, Number(mut.bendPctMin || 0.005)),
          Math.max(0.001, Number(mut.bendPctMax || 0.020))
        );
        const delta = Math.random() < 0.5 ? -frac : frac;
        const absNew = clamp(absR * (1 + delta), PHYS_CFG.minRadius, 650);
        s.R = sign * absNew;
        enforceApertureRadiusCoupling(s, 1.08);
        mutated = true;
      }
    } else if (r < cutAir) {
      kind = "air_gap";
      if (ids.gaps.length) {
        const idx = pick(ids.gaps);
        const s = surfaces[idx];
        const d = randRange(-Math.abs(Number(mut.airDeltaMm || 0.6)), Math.abs(Number(mut.airDeltaMm || 0.6)));
        s.t = clamp(
          Number(s?.t || 0) + d,
          PHYS_CFG.minAirGap,
          Math.min(28, PHYS_CFG.maxThickness)
        );
        mutated = true;
      }
    } else {
      kind = "stop_ap";
      const idx = findStopSurfaceIndex(surfaces);
      if (idx >= 0) {
        const stop = surfaces[idx];
        const pct = Math.abs(Number(mut.stopApPct || 0.005));
        const f = 1 + randRange(-pct, pct);
        stop.ap = clamp(Number(stop.ap || 0) * f, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        mutated = true;
      }
    }

    if (!mutated) return { ok: false, reason: kind };
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    return { ok: true, kind };
  }

  function collectSharpnessMutationIndices(surfaces, stopIdx) {
    const bend = [];
    const gaps = [];
    const add = (arr, idx) => {
      if (!Number.isFinite(idx) || idx < 1 || idx >= surfaces.length - 1) return;
      if (!arr.includes(idx)) arr.push(idx);
    };

    for (let d = -3; d <= 3; d++) add(bend, stopIdx + d);
    for (let d = 4; d <= 6; d++) add(bend, stopIdx + d);
    for (let d = -3; d <= 8; d++) add(gaps, stopIdx + d);

    const bendFiltered = bend.filter((idx) => {
      const s = surfaces[idx];
      if (!s || surfaceIsLocked(s)) return false;
      const t = String(s?.type || "").toUpperCase();
      if (t === "STOP" || t === "OBJ" || t === "IMS") return false;
      const absR = Math.abs(Number(s?.R || 0));
      return absR > 1e-9;
    });
    const gapFiltered = gaps.filter((idx) => {
      const s = surfaces[idx];
      if (!s || surfaceIsLocked(s)) return false;
      const mediumAfter = String(resolveGlassName(s?.glass || "AIR")).toUpperCase();
      return mediumAfter === "AIR";
    });
    return { bend: bendFiltered, gaps: gapFiltered };
  }

  function applyOneSharpnessMutation(surfaces, cfg = SHARP_OPT_CFG) {
    if (!Array.isArray(surfaces) || surfaces.length < 4) return { ok: false, reason: "lens" };
    ensureStopExists(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };

    const mut = cfg?.mutation || SHARP_OPT_CFG.mutation;
    const pAir = Math.max(0.01, Number(mut.airChance || 0.52));
    const pBend = Math.max(0.01, Number(mut.bendChance || 0.48));
    const r = Math.random() * (pAir + pBend);
    const ids = collectSharpnessMutationIndices(surfaces, stopIdx);

    let kind = "air_gap";
    let mutated = false;

    if (r < pAir) {
      kind = "air_gap";
      if (ids.gaps.length) {
        const idx = pick(ids.gaps);
        const s = surfaces[idx];
        const dAbs = randRange(
          Math.max(0.01, Number(mut.airDeltaMinMm || 0.05)),
          Math.max(0.02, Number(mut.airDeltaMaxMm || 0.40))
        );
        const d = Math.random() < 0.5 ? -dAbs : dAbs;
        s.t = clamp(
          Number(s?.t || 0) + d,
          Math.max(0.05, Number(PHYS_CFG.minAirGap || 0.12)),
          Math.min(22, Number(PHYS_CFG.maxThickness || 55))
        );
        mutated = true;
      }
    } else {
      kind = "bend";
      if (ids.bend.length) {
        const idx = pick(ids.bend);
        const s = surfaces[idx];
        const R0 = Number(s?.R || 0);
        const absR = Math.max(Number(PHYS_CFG.minRadius || 8), Math.abs(R0));
        const sign = Math.sign(R0 || 1) || 1;
        const frac = randRange(
          Math.max(0.0005, Number(mut.bendPctMin || 0.002)),
          Math.max(0.0015, Number(mut.bendPctMax || 0.010))
        );
        const delta = Math.random() < 0.5 ? -frac : frac;
        s.R = sign * clamp(absR * (1 + delta), Number(PHYS_CFG.minRadius || 8), 650);
        enforceApertureRadiusCoupling(s, 1.08);
        mutated = true;

        if (Math.random() < Math.max(0, Number(mut.pairBendChance || 0.42))) {
          const pairIdx = stopIdx - (idx - stopIdx);
          if (Number.isFinite(pairIdx) && pairIdx >= 1 && pairIdx < surfaces.length - 1 && pairIdx !== idx) {
            const sp = surfaces[pairIdx];
            const tp = String(sp?.type || "").toUpperCase();
            const Rp0 = Number(sp?.R || 0);
            if (sp && !surfaceIsLocked(sp) && tp !== "STOP" && Math.abs(Rp0) > 1e-9) {
              const pairScale = randRange(0.60, 1.00);
              const pairDelta = -delta * pairScale;
              const pairAbsR = Math.max(Number(PHYS_CFG.minRadius || 8), Math.abs(Rp0));
              const pairSign = Math.sign(Rp0 || 1) || 1;
              sp.R = pairSign * clamp(pairAbsR * (1 + pairDelta), Number(PHYS_CFG.minRadius || 8), 650);
              enforceApertureRadiusCoupling(sp, 1.08);
            }
          }
        }
      }
    }

    if (!mutated) return { ok: false, reason: kind };
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    return { ok: true, kind };
  }

  function measureSharpnessState(
    lensObj,
    {
      wavePreset = "d",
      focusMode = "lens",
      sensorX = 0,
      lensShift = 0,
      rayCount = 25,
      sensorW = null,
      sensorH = null,
      maxFieldStepDeg = SHARP_OPT_CFG.maxFieldStepDeg,
      maxFieldScanDeg = SHARP_OPT_CFG.maxFieldScanDeg,
      maxBflShortMm = SHARP_OPT_CFG.maxBflShortMm,
      afOptions = null,
      withDistGuard = true,
      plBaselineIntrusionMm = null,
      plWorsenTolMm = SHARP_OPT_CFG.plWorsenTolMm,
    } = {}
  ) {
    if (!lensObj?.surfaces || !Array.isArray(lensObj.surfaces)) return { ok: false, reason: "lens" };
    const surfaces = lensObj.surfaces;
    ensureStopExists(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return { ok: false, reason: "stop" };

    const sensor = getSensorWH();
    const wMm = Number.isFinite(sensorW) ? Number(sensorW) : Number(sensor.w || 36.7);
    const hMm = Number.isFinite(sensorH) ? Number(sensorH) : Number(sensor.h || 25.54);
    const focus = findBestFocusShift(
      surfaces,
      focusMode,
      Number(sensorX || 0),
      Number(lensShift || 0),
      wavePreset,
      {
        sensorW: wMm,
        sensorH: hMm,
        ...(afOptions || {}),
      }
    );
    if (!focus.ok) return { ok: false, reason: "af" };

    computeVertices(surfaces, 0, focus.sensorX);
    const rearVxNeutral = lastPhysicalVertexX(surfaces);
    const intrusionNeutral = Number.isFinite(rearVxNeutral) ? (rearVxNeutral - (-PL_FFD)) : Infinity;
    computeVertices(surfaces, focus.lensShift, focus.sensorX);
    const phys = evaluatePhysicalConstraints(surfaces);
    if (phys.hardFail) return { ok: false, reason: "phys", phys, focus };
    const rearVxFocused = lastPhysicalVertexX(surfaces);
    const intrusionFocused = Number.isFinite(rearVxFocused) ? (rearVxFocused - (-PL_FFD)) : Infinity;
    const intrusion = Math.max(intrusionNeutral, intrusionFocused);
    const baseIntr = Number(plBaselineIntrusionMm);
    const plTol = Math.max(0, Number(plWorsenTolMm ?? SHARP_OPT_CFG.plWorsenTolMm ?? 0.05));
    const allowRelaxedPl = Number.isFinite(baseIntr) && baseIntr > 1e-3 && intrusion <= (baseIntr + plTol);
    if (!(intrusion <= 1e-3) && !allowRelaxedPl) return { ok: false, reason: "pl", intrusion, phys, focus };

    const rays = buildRays(surfaces, 0, 13);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const cross = detectInternalRayCrossings(traces, surfaces, wavePreset);
    if (cross.invalid) return { ok: false, reason: "xover", cross, phys, focus };

    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    if (!(Number.isFinite(efl) && efl > 1e-6)) return { ok: false, reason: "efl", focus, phys };
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, Number(MERIT_CFG.bflMin || 52) - bfl) : Infinity;
    if (!(bflShortMm <= Number(maxBflShortMm || SHARP_OPT_CFG.maxBflShortMm))) {
      return { ok: false, reason: "bfl", bfl, bflShortMm, focus, phys };
    }
    const T = estimateTStopApprox(efl, surfaces);
    if (!(Number.isFinite(T) && T > 0)) return { ok: false, reason: "t", efl, bfl, focus, phys };

    const sharp = evaluateSharpness(
      surfaces,
      wavePreset,
      focus.sensorX,
      rayCount,
      {
        sensorW: wMm,
        sensorH: hMm,
        lensShift: focus.lensShift,
        angleFractions: SHARP_OPT_CFG.angleFractions,
        angleWeights: SHARP_OPT_CFG.angleWeights,
        maxFieldStepDeg,
        maxFieldScanDeg,
        minValidFrac: SHARP_OPT_CFG.minValidFrac,
        lowValidPenaltyMm: SHARP_OPT_CFG.lowValidPenaltyMm,
        noDataPenaltyMm: SHARP_OPT_CFG.noDataPenaltyMm,
      }
    );
    if (!(sharp?.ok && Number.isFinite(sharp?.score))) {
      return { ok: false, reason: "sharp", efl, T, bfl, focus, sharp, phys };
    }

    let dist70Pct = null;
    if (withDistGuard) {
      const dist = getLutDistortionMetricsCached({
        surfaces,
        wavePreset,
        sensorX: focus.sensorX,
        lensShift: focus.lensShift,
        objDist: Number(SHARP_OPT_CFG.distGuardObjDistMm || DIST_OPT_CFG.objDistMm || 20000),
        lutN: Number(SHARP_OPT_CFG.distGuardLutN || 180),
        lutPupilSqrt: Number(SHARP_OPT_CFG.distGuardPupilSqrt || 1),
        doCA: false,
        sensorW: wMm,
        sensorH: hMm,
        efl,
        sampleFracs: DIST_OPT_CFG.sampleFracs,
      });
      const d70 = Number(dist?.distPctAt70);
      if (!Number.isFinite(d70)) {
        return { ok: false, reason: "dist_guard", efl, T, bfl, focus, sharp, phys };
      }
      dist70Pct = d70;
    }

    return {
      ok: true,
      stopIdx,
      efl,
      T,
      bfl,
      bflShortMm,
      intrusion,
      plRelaxed: allowRelaxedPl,
      plBaselineIntrusionMm: Number.isFinite(baseIntr) ? baseIntr : null,
      phys,
      cross,
      sharp,
      focus,
      maxFieldDeg: Number(sharp?.maxFieldDeg || 0),
      dist70Pct,
      dist70AbsPct: Number.isFinite(dist70Pct) ? Math.abs(dist70Pct) : null,
    };
  }

  function scoreSharpnessState(state, baseline, cfg = SHARP_OPT_CFG) {
    const ws = cfg?.weights || SHARP_OPT_CFG.weights;
    const sharpScore = Number.isFinite(state?.sharp?.score) ? Number(state.sharp.score) : Infinity;
    const eflDiff = Number(state?.efl || 0) - Number(baseline?.efl || 0);
    const eflRel = Math.abs(eflDiff) / Math.max(1e-6, Math.abs(Number(baseline?.efl || 1)));
    const tDiff = Number(state?.T || 0) - Number(baseline?.T || 0);
    const tAbs = Math.abs(tDiff);
    const covDropDeg = Math.max(0, Number(baseline?.maxFieldDeg || 0) - Number(state?.maxFieldDeg || 0));
    const covPenaltyDeg = Math.max(0, covDropDeg - Number(cfg.maxCoverageDropDeg || SHARP_OPT_CFG.maxCoverageDropDeg));
    const baseDistAbs = Math.abs(Number(baseline?.dist70AbsPct || 0));
    const curDistAbs = Math.abs(Number(state?.dist70AbsPct || 0));
    const distWorse = Number.isFinite(curDistAbs)
      ? Math.max(0, curDistAbs - (baseDistAbs + Number(cfg.maxDist70WorsenPct || SHARP_OPT_CFG.maxDist70WorsenPct)))
      : 0;

    let hardReject = false;
    let hardReason = "";
    if (!(Number.isFinite(sharpScore) && sharpScore < Infinity)) {
      hardReject = true;
      hardReason = "sharp";
    } else if (eflRel > Number(cfg.maxEflDriftRelReject || SHARP_OPT_CFG.maxEflDriftRelReject)) {
      hardReject = true;
      hardReason = "efl_guard";
    } else if (tAbs > Number(cfg.maxTDriftAbsReject || SHARP_OPT_CFG.maxTDriftAbsReject)) {
      hardReject = true;
      hardReason = "t_guard";
    } else if (covDropDeg > Number(cfg.maxCoverageDropRejectDeg || SHARP_OPT_CFG.maxCoverageDropRejectDeg)) {
      hardReject = true;
      hardReason = "cov_guard";
    } else if (
      Number.isFinite(curDistAbs) &&
      curDistAbs > baseDistAbs + Number(cfg.maxDist70WorsenRejectPct || SHARP_OPT_CFG.maxDist70WorsenRejectPct)
    ) {
      hardReject = true;
      hardReason = "dist_guard";
    }

    let merit =
      Number(ws.sharp || 120) * sharpScore +
      Number(ws.efl || 80) * (eflDiff * eflDiff) +
      Number(ws.t || 60) * (tDiff * tDiff) +
      Number(ws.cov || 200) * (covPenaltyDeg * covPenaltyDeg) +
      Number(ws.dist || 60) * (distWorse * distWorse);

    if (eflRel > Number(cfg.maxEflDriftRel || SHARP_OPT_CFG.maxEflDriftRel)) {
      const d = eflRel - Number(cfg.maxEflDriftRel || SHARP_OPT_CFG.maxEflDriftRel);
      merit += 2500.0 * d * d;
    }
    if (tAbs > Number(cfg.maxTDriftAbs || SHARP_OPT_CFG.maxTDriftAbs)) {
      const d = tAbs - Number(cfg.maxTDriftAbs || SHARP_OPT_CFG.maxTDriftAbs);
      merit += 1400.0 * d * d;
    }

    return {
      merit,
      hardReject,
      hardReason,
      sharpScore,
      eflDiff,
      eflRel,
      tDiff,
      tAbs,
      covDropDeg,
      covPenaltyDeg,
      distWorse,
      distAbsPct: Number.isFinite(curDistAbs) ? curDistAbs : null,
    };
  }

  async function runSharpnessOptimizer() {
    if (sharpOptRunning) return;
    if (optRunning || scratchBuildRunning || distOptRunning) {
      toast("Stop optimizer/build/distortion first before Optimize Sharpness.");
      return;
    }

    sharpOptRunning = true;
    sharpOptStopRequested = false;
    if (ui.btnOptSharp) ui.btnOptSharp.disabled = true;
    if (ui.btnOptDist) ui.btnOptDist.disabled = true;
    if (!cockpitMacroRunning) setCockpitProgress(0, "Optimize Sharpness • init");

    const runNo = ++optimizerRunSerial;
    const prevRunCtx = optRunContext;
    setOptRunContext({
      mode: "Sharpness Optimizer",
      label: "multi-field RMS",
    });

    try {
      const sensor = getSensorWH();
      const wavePreset = ui.wavePreset?.value || "d";
      const focusMode = String(ui.focusMode?.value || "lens").toLowerCase() === "cam" ? "cam" : "lens";
      const sensorX0 = focusMode === "cam" ? num(ui.sensorOffset?.value, 0) : 0;
      const lensShift0 = focusMode === "lens" ? num(ui.lensFocus?.value, 0) : 0;
      const autoApply = postOptAutoApplyEnabled();
      const rayCount = clamp(
        num(ui.rayCount?.value, 31) | 0,
        Number(SHARP_OPT_CFG.rayCountMin || 11),
        Number(SHARP_OPT_CFG.rayCountMax || 41)
      );
      const iters = clamp(
        num(ui.optIters?.value, 3000),
        SHARP_OPT_CFG.iterationsMin,
        SHARP_OPT_CFG.iterationsMax
      );
      const runHeader = formatOptimizerRunHeader(runNo);

      const ctxBase = {
        wavePreset,
        focusMode,
        sensorX: sensorX0,
        lensShift: lensShift0,
        rayCount,
        sensorW: sensor.w,
        sensorH: sensor.h,
        maxFieldStepDeg: SHARP_OPT_CFG.maxFieldStepDeg,
        maxFieldScanDeg: SHARP_OPT_CFG.maxFieldScanDeg,
        maxBflShortMm: SHARP_OPT_CFG.maxBflShortMm,
        afOptions: SHARP_OPT_CFG.autofocus,
        withDistGuard: true,
      };
      let plBaselineIntrusionMm = null;
      const plWorsenTolMm = Math.max(0, Number(SHARP_OPT_CFG.plWorsenTolMm || 0.05));
      let plRelaxedMode = false;

      const startLens = sanitizeLens(clone(lens));
      let baseState = measureSharpnessState(startLens, ctxBase);
      if (!baseState.ok && baseState.reason === "pl" && Number.isFinite(Number(baseState.intrusion))) {
        plBaselineIntrusionMm = Number(baseState.intrusion);
        plRelaxedMode = true;
        baseState = measureSharpnessState(startLens, {
          ...ctxBase,
          plBaselineIntrusionMm,
          plWorsenTolMm,
        });
      }
      if (!baseState.ok) {
        setOptLog(
          `${runHeader}\n` +
          `failed: baseline invalid (${baseState.reason})\n` +
          `No changes applied.`
        );
        toast(`Sharpness optimizer aborted: baseline ${baseState.reason}`);
        return;
      }
      const baseScore = scoreSharpnessState(baseState, baseState, SHARP_OPT_CFG);
      const baseIcMm = estimateImageCircleDriftProxyMm(startLens.surfaces, sensor.w, sensor.h, wavePreset, 15);

      let bestLens = clone(startLens);
      let bestState = baseState;
      let bestMerit = Number(baseScore?.merit || Infinity);
      let bestIter = 0;
      let bestIcMm = baseIcMm;
      let bestIcIterMeasured = 0;

      let curLens = clone(startLens);
      let curState = baseState;
      let curMerit = Number(baseScore?.merit || Infinity);

      const rejects = {
        mutation: 0,
        af: 0,
        sharp: 0,
        phys: 0,
        pl: 0,
        xover: 0,
        bfl: 0,
        efl_guard: 0,
        t_guard: 0,
        cov_guard: 0,
        dist_guard: 0,
        other: 0,
      };
      const countReject = (reason) => {
        const k = String(reason || "other");
        if (Object.prototype.hasOwnProperty.call(rejects, k)) rejects[k]++;
        else rejects.other++;
      };

      const batch = Math.max(20, Number(SHARP_OPT_CFG.progressBatch || 60) | 0);
      const t0 = performance.now();
      setOptLog(
        `${runHeader}\n` +
        `running… 0/${iters}\n` +
        `apply mode: ${autoApply ? "auto" : "manual (Apply best)"}\n` +
        `${plRelaxedMode ? `baseline relax mode: PL ${plBaselineIntrusionMm.toFixed(2)}mm (must not worsen > +${plWorsenTolMm.toFixed(2)}mm)\n` : ""}` +
        `baseline RMS C/E ${Number(baseState?.sharp?.centerRmsMm || 0).toFixed(3)} / ${Number(baseState?.sharp?.edgeRmsMm || 0).toFixed(3)} mm\n` +
        `baseline score ${Number(baseState?.sharp?.score || 0).toFixed(4)} • EFL ${baseState.efl.toFixed(2)}mm • T ${baseState.T.toFixed(2)} • field ${baseState.maxFieldDeg.toFixed(2)}° • IC ${Number.isFinite(baseIcMm) ? baseIcMm.toFixed(2) : "—"}mm`
      );

      let itersRan = 0;
      for (let i = 1; i <= iters; i++) {
        if (!sharpOptRunning || sharpOptStopRequested) break;
        itersRan = i;
        const alpha = i / iters;
        const temp = SHARP_OPT_CFG.annealTempStart * (1 - alpha) + SHARP_OPT_CFG.annealTempEnd * alpha;
        const parent = Math.random() < 0.66 ? curLens : bestLens;
        const cand = clone(parent);
        const mut = applyOneSharpnessMutation(cand.surfaces, SHARP_OPT_CFG);
        if (!mut.ok) {
          countReject("mutation");
          continue;
        }

        const candState = measureSharpnessState(cand, {
          ...ctxBase,
          ...(plRelaxedMode ? { plBaselineIntrusionMm, plWorsenTolMm } : {}),
        });
        if (!candState.ok) {
          countReject(candState.reason);
          continue;
        }
        if (plRelaxedMode && Number.isFinite(plBaselineIntrusionMm) && Number(candState?.intrusion) > (plBaselineIntrusionMm + plWorsenTolMm)) {
          countReject("pl");
          continue;
        }
        const candScore = scoreSharpnessState(candState, baseState, SHARP_OPT_CFG);
        if (candScore.hardReject) {
          countReject(candScore.hardReason || "other");
          continue;
        }

        let accept = false;
        if (candScore.merit < curMerit) {
          accept = true;
        } else {
          const uphill = candScore.merit - curMerit;
          const pAcc = Math.exp(-uphill / Math.max(1e-6, temp));
          accept = Math.random() < pAcc;
        }
        if (accept) {
          curLens = cand;
          curState = candState;
          curMerit = candScore.merit;
        }

        if (candScore.merit + 1e-9 < bestMerit) {
          const checkState = measureSharpnessState(cand, {
            ...ctxBase,
            rayCount: Math.min(41, Math.max(rayCount, 29)),
            maxFieldStepDeg: Math.max(0.8, Number(SHARP_OPT_CFG.maxFieldStepDeg || 1.25) * 0.85),
            ...(plRelaxedMode ? { plBaselineIntrusionMm, plWorsenTolMm } : {}),
          });
          if (checkState.ok) {
            if (plRelaxedMode && Number.isFinite(plBaselineIntrusionMm) && Number(checkState?.intrusion) > (plBaselineIntrusionMm + plWorsenTolMm)) {
              countReject("pl");
              continue;
            }
            const checkScore = scoreSharpnessState(checkState, baseState, SHARP_OPT_CFG);
            if (!checkScore.hardReject && checkScore.merit + 1e-9 < bestMerit) {
              bestLens = clone(cand);
              bestState = checkState;
              bestMerit = checkScore.merit;
              bestIter = i;
            }
          }
        }

        if (i % batch === 0) {
          const dt = Math.max(1e-6, (performance.now() - t0) / 1000);
          const ips = i / dt;
          const curC = Number(curState?.sharp?.centerRmsMm);
          const curE = Number(curState?.sharp?.edgeRmsMm);
          const bestC = Number(bestState?.sharp?.centerRmsMm);
          const bestE = Number(bestState?.sharp?.edgeRmsMm);
          const eflDrift = Number(bestState?.efl || 0) - Number(baseState?.efl || 0);
          const tDrift = Number(bestState?.T || 0) - Number(baseState?.T || 0);
          const fieldDrop = Math.max(0, Number(baseState?.maxFieldDeg || 0) - Number(bestState?.maxFieldDeg || 0));
          const distNow = Number(bestState?.dist70Pct);
          if (bestIter !== bestIcIterMeasured) {
            bestIcMm = estimateImageCircleDriftProxyMm(bestLens.surfaces, sensor.w, sensor.h, wavePreset, 15);
            bestIcIterMeasured = bestIter;
          }
          const icDriftMm = Number.isFinite(baseIcMm) && Number.isFinite(bestIcMm)
            ? (bestIcMm - baseIcMm)
            : NaN;
          setOptLog(
            `${runHeader}\n` +
            `running… ${i}/${iters} (${ips.toFixed(1)} it/s)\n` +
            `current merit ${curMerit.toFixed(2)} • best merit ${bestMerit.toFixed(2)} @${bestIter}\n` +
            `base RMS C/E ${Number(baseState?.sharp?.centerRmsMm || 0).toFixed(3)} / ${Number(baseState?.sharp?.edgeRmsMm || 0).toFixed(3)} mm\n` +
            `cur  RMS C/E ${Number.isFinite(curC) ? curC.toFixed(3) : "—"} / ${Number.isFinite(curE) ? curE.toFixed(3) : "—"} mm\n` +
            `best RMS C/E ${Number.isFinite(bestC) ? bestC.toFixed(3) : "—"} / ${Number.isFinite(bestE) ? bestE.toFixed(3) : "—"} mm\n` +
            `best drift EFL ${eflDrift.toFixed(3)}mm • T ${tDrift.toFixed(3)} • field drop ${fieldDrop.toFixed(2)}° • IC drift ${formatSignedMm(icDriftMm, 2)} • dist70 ${Number.isFinite(distNow) ? distNow.toFixed(2) : "—"}%\n` +
            `focus ${focusMode === "cam" ? `sensor ${Number(bestState?.focus?.sensorX || 0).toFixed(3)}mm` : `lens ${Number(bestState?.focus?.lensShift || 0).toFixed(3)}mm`}\n` +
            `rejects phys ${rejects.phys} • pl ${rejects.pl} • xover ${rejects.xover} • bfl ${rejects.bfl} • af ${rejects.af} • sharp ${rejects.sharp} • efl ${rejects.efl_guard} • t ${rejects.t_guard} • cov ${rejects.cov_guard} • dist ${rejects.dist_guard} • mut ${rejects.mutation}`
          );
          if (!cockpitMacroRunning) setCockpitProgress(i / Math.max(1, iters), `Optimize Sharpness • ${i}/${iters}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const bestScore = scoreSharpnessState(bestState, baseState, SHARP_OPT_CFG);
      const improved =
        Number.isFinite(bestScore?.merit) &&
        Number.isFinite(baseScore?.merit) &&
        bestScore.merit + 1e-6 < baseScore.merit;

      if (improved) {
        queueSharpnessBest(bestLens, bestState, {
          focusMode,
          sensorX: Number(bestState?.focus?.sensorX ?? sensorX0),
          lensShift: Number(bestState?.focus?.lensShift ?? lensShift0),
          runNo,
        });
      }

      const appliedNow = improved && autoApply;
      const queuedManual = improved && !autoApply;

      if (appliedNow) {
        loadLens(bestLens);
        if (ui.focusMode) ui.focusMode.value = focusMode;
        if (focusMode === "cam") {
          if (ui.sensorOffset) ui.sensorOffset.value = Number(bestState?.focus?.sensorX || 0).toFixed(3);
        } else {
          if (ui.sensorOffset) ui.sensorOffset.value = Number(sensorX0 || 0).toFixed(3);
        }
        if (focusMode === "lens") {
          if (ui.lensFocus) ui.lensFocus.value = Number(bestState?.focus?.lensShift || 0).toFixed(3);
        } else {
          if (ui.lensFocus) ui.lensFocus.value = Number(lensShift0 || 0).toFixed(3);
        }
        renderAll();
        scheduleRenderPreviewIfAvailable();
        scheduleAutosave();
      } else if (queuedManual) {
        queueManualBestFromState(bestLens, bestState, {
          source: "sharpness",
          iter: bestIter,
          focusMode,
          sensorX: Number(bestState?.focus?.sensorX ?? sensorX0),
          lensShift: Number(bestState?.focus?.lensShift ?? lensShift0),
        });
        renderAll();
      } else {
        renderAll();
      }

      const eflDrift = Number(bestState?.efl || 0) - Number(baseState?.efl || 0);
      const tDrift = Number(bestState?.T || 0) - Number(baseState?.T || 0);
      const fieldDrop = Math.max(0, Number(baseState?.maxFieldDeg || 0) - Number(bestState?.maxFieldDeg || 0));
      if (bestIter !== bestIcIterMeasured) {
        bestIcMm = estimateImageCircleDriftProxyMm(bestLens.surfaces, sensor.w, sensor.h, wavePreset, 15);
        bestIcIterMeasured = bestIter;
      }
      const icDriftMm = Number.isFinite(baseIcMm) && Number.isFinite(bestIcMm)
        ? (bestIcMm - baseIcMm)
        : NaN;
      const bestIterTxt = (bestIter > 0) ? `${bestIter}/${Math.max(1, iters)}` : "baseline (0)";
      setOptLog(
        `${runHeader}\n` +
        `${sharpOptStopRequested ? "stopped" : "done"} ${itersRan}/${iters}\n` +
        `best iteration ${bestIterTxt}\n` +
        `${appliedNow ? "APPLIED ✅" : (queuedManual ? "QUEUED (click Apply best) ⏳" : "no better candidate (kept original)")}\n` +
        `sharp before RMS C/E ${Number(baseState?.sharp?.centerRmsMm || 0).toFixed(3)} / ${Number(baseState?.sharp?.edgeRmsMm || 0).toFixed(3)} mm • score ${Number(baseState?.sharp?.score || 0).toFixed(4)}\n` +
        `sharp after  RMS C/E ${Number(bestState?.sharp?.centerRmsMm || 0).toFixed(3)} / ${Number(bestState?.sharp?.edgeRmsMm || 0).toFixed(3)} mm • score ${Number(bestState?.sharp?.score || 0).toFixed(4)}\n` +
        `focus ${focusMode === "cam" ? `sensorOffset ${Number(bestState?.focus?.sensorX || 0).toFixed(3)}mm` : `lensFocus ${Number(bestState?.focus?.lensShift || 0).toFixed(3)}mm`}\n` +
        `drift EFL ${eflDrift.toFixed(3)}mm • T ${tDrift.toFixed(3)} • field drop ${fieldDrop.toFixed(2)}° • IC drift ${formatSignedMm(icDriftMm, 2)} (${Number.isFinite(baseIcMm) ? baseIcMm.toFixed(2) : "—"}→${Number.isFinite(bestIcMm) ? bestIcMm.toFixed(2) : "—"}mm) • dist70 ${Number.isFinite(bestState?.dist70Pct) ? Number(bestState.dist70Pct).toFixed(2) : "—"}%\n` +
        `rejects phys ${rejects.phys} • pl ${rejects.pl} • xover ${rejects.xover} • bfl ${rejects.bfl} • af ${rejects.af} • sharp ${rejects.sharp} • efl ${rejects.efl_guard} • t ${rejects.t_guard} • cov ${rejects.cov_guard} • dist ${rejects.dist_guard} • mut ${rejects.mutation}`
      );
      toast(
        improved
          ? (appliedNow
            ? `Sharpness optimized: C/E ${Number(bestState?.sharp?.centerRmsMm || 0).toFixed(3)} / ${Number(bestState?.sharp?.edgeRmsMm || 0).toFixed(3)} mm`
            : "Sharpness optimized: candidate queued, click Apply best")
          : "Sharpness optimizer: no better lens within guards"
      );
      if (!cockpitMacroRunning) setCockpitProgress(1, "Optimize Sharpness • done");
    } finally {
      sharpOptStopRequested = false;
      sharpOptRunning = false;
      if (ui.btnOptSharp) ui.btnOptSharp.disabled = false;
      if (ui.btnOptDist && !distOptRunning) ui.btnOptDist.disabled = false;
      if (!cockpitOptRunning && !cockpitMacroRunning) setCockpitProgress(0, "Idle");
      setOptRunContext(prevRunCtx);
    }
  }

  function scheduleRenderPreviewIfAvailable() {
    if (typeof scheduleRenderPreview === "function") {
      try { scheduleRenderPreview(); } catch (_) {}
    }
  }

  async function runDistortionOptimizer() {
    if (distOptRunning) return;
    if (optRunning || scratchBuildRunning || sharpOptRunning) {
      toast("Stop optimizer/build/sharpness first before Optimize Distortion.");
      return;
    }

    distOptRunning = true;
    distOptStopRequested = false;
    if (ui.btnOptDist) ui.btnOptDist.disabled = true;
    if (ui.btnOptSharp) ui.btnOptSharp.disabled = true;
    if (!cockpitMacroRunning) setCockpitProgress(0, "Optimize Distortion • init");

    const runNo = ++optimizerRunSerial;
    const prevRunCtx = optRunContext;
    setOptRunContext({
      mode: "Distortion Optimizer",
      label: "LUT dedistort",
    });

    try {
      const sensor = getSensorWH();
      const wavePreset = ui.wavePreset?.value || "d";
      const focusMode = String(ui.focusMode?.value || "lens").toLowerCase();
      const sensorX = focusMode === "cam" ? num(ui.sensorOffset?.value, 0) : 0;
      const lensShift = focusMode === "lens" ? num(ui.lensFocus?.value, 0) : 0;
      const autoApply = postOptAutoApplyEnabled();
      const iters = clamp(
        num(ui.distOptIters?.value, num(ui.optIters?.value, 12000)),
        DIST_OPT_CFG.iterationsMin,
        DIST_OPT_CFG.iterationsMax
      );
      const runHeader = formatOptimizerRunHeader(runNo);

      const ctxBase = {
        wavePreset,
        sensorX,
        lensShift,
        objDist: DIST_OPT_CFG.objDistMm,
        sampleFracs: DIST_OPT_CFG.sampleFracs,
        sensorW: sensor.w,
        sensorH: sensor.h,
        lutN: DIST_OPT_CFG.lutNOptFinal,
        lutPupilSqrt: DIST_OPT_CFG.lutPupilSqrtOpt,
        maxFieldStepDeg: DIST_OPT_CFG.maxFieldStepDeg,
        maxFieldScanDeg: DIST_OPT_CFG.maxFieldScanDeg,
        maxBflShortMm: DIST_OPT_CFG.maxBflShortMm,
      };
      let plBaselineIntrusionMm = null;
      const plWorsenTolMm = Math.max(0, Number(DIST_OPT_CFG.plWorsenTolMm || 0.05));
      let plRelaxedMode = false;

      const startLens = sanitizeLens(clone(lens));
      let baseState = measureDistortionState(startLens, ctxBase);
      if (!baseState.ok && baseState.reason === "pl" && Number.isFinite(Number(baseState.intrusion))) {
        plBaselineIntrusionMm = Number(baseState.intrusion);
        plRelaxedMode = true;
        baseState = measureDistortionState(startLens, {
          ...ctxBase,
          plBaselineIntrusionMm,
          plWorsenTolMm,
        });
      }
      if (!baseState.ok) {
        setOptLog(
          `${runHeader}\n` +
          `failed: baseline invalid (${baseState.reason})\n` +
          `No changes applied.`
        );
        toast(`Distortion optimizer aborted: baseline ${baseState.reason}`);
        return;
      }
      const baseScore = scoreDistortionState(baseState, baseState, DIST_OPT_CFG);
      const baseDist70 = Number(baseState?.dist?.distPctAt70);
      const baseRms = Number(baseState?.dist?.rmsDistPct);
      const baseIcMm = estimateImageCircleDriftProxyMm(startLens.surfaces, sensor.w, sensor.h, wavePreset, 15);

      let bestLens = clone(startLens);
      let bestState = baseState;
      let bestMerit = baseScore.merit;
      let bestIter = 0;
      let bestIcMm = baseIcMm;
      let bestIcIterMeasured = 0;

      let curLens = clone(startLens);
      let curState = baseState;
      let curMerit = baseScore.merit;

      const rejects = {
        mutation: 0,
        phys: 0,
        pl: 0,
        xover: 0,
        bfl: 0,
        cov: 0,
        dist: 0,
        efl_guard: 0,
        t_guard: 0,
        cov_guard: 0,
        other: 0,
      };
      const countReject = (reason) => {
        const k = String(reason || "other");
        if (Object.prototype.hasOwnProperty.call(rejects, k)) rejects[k]++;
        else rejects.other++;
      };

      const batch = Math.max(20, Number(DIST_OPT_CFG.progressBatch || 80) | 0);
      const t0 = performance.now();
      setOptLog(
        `${runHeader}\n` +
        `running… 0/${iters}\n` +
        `apply mode: ${autoApply ? "auto" : "manual (Apply best)"}\n` +
        `${plRelaxedMode ? `baseline relax mode: PL ${plBaselineIntrusionMm.toFixed(2)}mm (must not worsen > +${plWorsenTolMm.toFixed(2)}mm)\n` : ""}` +
        `baseline DIST@0.7D ${Number.isFinite(baseDist70) ? baseDist70.toFixed(2) : "—"}% • RMS ${Number.isFinite(baseRms) ? baseRms.toFixed(2) : "—"}%\n` +
        `baseline EFL ${baseState.efl.toFixed(2)}mm • T ${baseState.T.toFixed(2)} • field ${baseState.maxFieldDeg.toFixed(2)}° • IC ${Number.isFinite(baseIcMm) ? baseIcMm.toFixed(2) : "—"}mm • stop #${baseState.stopIdx}`
      );

      let itersRan = 0;
      for (let i = 1; i <= iters; i++) {
        if (!distOptRunning || distOptStopRequested) break;
        itersRan = i;

        const alpha = i / iters;
        const temp = DIST_OPT_CFG.annealTempStart * (1 - alpha) + DIST_OPT_CFG.annealTempEnd * alpha;
        const parent = Math.random() < 0.64 ? curLens : bestLens;
        const cand = clone(parent);
        const mut = applyOneDistortionMutation(cand.surfaces, DIST_OPT_CFG);
        if (!mut.ok) {
          countReject("mutation");
          continue;
        }

        const candState = measureDistortionState(cand, {
          ...ctxBase,
          lutN: DIST_OPT_CFG.lutNOptFast,
          ...(plRelaxedMode ? { plBaselineIntrusionMm, plWorsenTolMm } : {}),
        });
        if (!candState.ok) {
          countReject(candState.reason);
          continue;
        }
        if (plRelaxedMode && Number.isFinite(plBaselineIntrusionMm) && Number(candState?.intrusion) > (plBaselineIntrusionMm + plWorsenTolMm)) {
          countReject("pl");
          continue;
        }
        const candScore = scoreDistortionState(candState, baseState, DIST_OPT_CFG);
        if (candScore.hardReject) {
          countReject(candScore.hardReason || "other");
          continue;
        }

        let accept = false;
        if (candScore.merit < curMerit) {
          accept = true;
        } else {
          const uphill = candScore.merit - curMerit;
          const pAcc = Math.exp(-uphill / Math.max(1e-6, temp));
          accept = Math.random() < pAcc;
        }
        if (accept) {
          curLens = cand;
          curState = candState;
          curMerit = candScore.merit;
        }

        if (candScore.merit + 1e-9 < bestMerit) {
          const checkState = measureDistortionState(cand, {
            ...ctxBase,
            lutN: DIST_OPT_CFG.lutNOptFinal,
            ...(plRelaxedMode ? { plBaselineIntrusionMm, plWorsenTolMm } : {}),
          });
          if (checkState.ok) {
            if (plRelaxedMode && Number.isFinite(plBaselineIntrusionMm) && Number(checkState?.intrusion) > (plBaselineIntrusionMm + plWorsenTolMm)) {
              countReject("pl");
              continue;
            }
            const checkScore = scoreDistortionState(checkState, baseState, DIST_OPT_CFG);
            if (!checkScore.hardReject && checkScore.merit + 1e-9 < bestMerit) {
              bestLens = clone(cand);
              bestState = checkState;
              bestMerit = checkScore.merit;
              bestIter = i;
            }
          }
        }

        if (i % batch === 0) {
          const dt = Math.max(1e-6, (performance.now() - t0) / 1000);
          const ips = i / dt;
          const cur70 = Number(curState?.dist?.distPctAt70);
          const best70 = Number(bestState?.dist?.distPctAt70);
          const curRms = Number(curState?.dist?.rmsDistPct);
          const bestRms = Number(bestState?.dist?.rmsDistPct);
          const eflDrift = Number(bestState?.efl || 0) - Number(baseState?.efl || 0);
          const tDrift = Number(bestState?.T || 0) - Number(baseState?.T || 0);
          const fieldDrop = Math.max(0, Number(baseState?.maxFieldDeg || 0) - Number(bestState?.maxFieldDeg || 0));
          if (bestIter !== bestIcIterMeasured) {
            bestIcMm = estimateImageCircleDriftProxyMm(bestLens.surfaces, sensor.w, sensor.h, wavePreset, 15);
            bestIcIterMeasured = bestIter;
          }
          const icDriftMm = Number.isFinite(baseIcMm) && Number.isFinite(bestIcMm)
            ? (bestIcMm - baseIcMm)
            : NaN;
          setOptLog(
            `${runHeader}\n` +
            `running… ${i}/${iters} (${ips.toFixed(1)} it/s)\n` +
            `current merit ${curMerit.toFixed(2)} • best merit ${bestMerit.toFixed(2)} @${bestIter}\n` +
            `base DIST@0.7D ${Number.isFinite(baseDist70) ? baseDist70.toFixed(2) : "—"}% • RMS ${Number.isFinite(baseRms) ? baseRms.toFixed(2) : "—"}%\n` +
            `cur  DIST@0.7D ${Number.isFinite(cur70) ? cur70.toFixed(2) : "—"}% • RMS ${Number.isFinite(curRms) ? curRms.toFixed(2) : "—"}%\n` +
            `best DIST@0.7D ${Number.isFinite(best70) ? best70.toFixed(2) : "—"}% • RMS ${Number.isFinite(bestRms) ? bestRms.toFixed(2) : "—"}%\n` +
            `best drift EFL ${eflDrift.toFixed(3)}mm • T ${tDrift.toFixed(3)} • field drop ${fieldDrop.toFixed(2)}° • IC drift ${formatSignedMm(icDriftMm, 2)} • stop #${bestState.stopIdx}\n` +
            `rejects phys ${rejects.phys} • pl ${rejects.pl} • xover ${rejects.xover} • bfl ${rejects.bfl} • dist ${rejects.dist} • efl ${rejects.efl_guard} • t ${rejects.t_guard} • cov ${rejects.cov_guard} • mut ${rejects.mutation}`
          );
          if (!cockpitMacroRunning) setCockpitProgress(i / Math.max(1, iters), `Optimize Distortion • ${i}/${iters}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const bestScore = scoreDistortionState(bestState, baseState, DIST_OPT_CFG);
      const improved =
        Number.isFinite(bestScore?.merit) &&
        Number.isFinite(baseScore?.merit) &&
        bestScore.merit + 1e-6 < baseScore.merit;

      if (improved) {
        queueDistortionBest(bestLens, bestState, {
          focusMode: focusMode === "cam" ? "cam" : "lens",
          sensorX,
          lensShift,
          runNo,
        });
      }

      const appliedNow = improved && autoApply;
      const queuedManual = improved && !autoApply;

      if (appliedNow) {
        loadLens(bestLens);
        if (ui.focusMode) ui.focusMode.value = focusMode === "cam" ? "cam" : "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = Number(sensorX).toFixed(2);
        if (ui.lensFocus) ui.lensFocus.value = Number(lensShift).toFixed(2);
        renderAll();
        scheduleRenderPreviewIfAvailable();
        scheduleAutosave();
      } else if (queuedManual) {
        queueManualBestFromState(bestLens, bestState, {
          source: "distortion",
          iter: bestIter,
          focusMode: focusMode === "cam" ? "cam" : "lens",
          sensorX,
          lensShift,
        });
        renderAll();
      } else {
        renderAll();
      }

      const after70 = Number(bestState?.dist?.distPctAt70);
      const afterRms = Number(bestState?.dist?.rmsDistPct);
      const eflDrift = Number(bestState?.efl || 0) - Number(baseState?.efl || 0);
      const tDrift = Number(bestState?.T || 0) - Number(baseState?.T || 0);
      const fieldDrop = Math.max(0, Number(baseState?.maxFieldDeg || 0) - Number(bestState?.maxFieldDeg || 0));
      if (bestIter !== bestIcIterMeasured) {
        bestIcMm = estimateImageCircleDriftProxyMm(bestLens.surfaces, sensor.w, sensor.h, wavePreset, 15);
        bestIcIterMeasured = bestIter;
      }
      const icDriftMm = Number.isFinite(baseIcMm) && Number.isFinite(bestIcMm)
        ? (bestIcMm - baseIcMm)
        : NaN;
      const bestIterTxt = (bestIter > 0) ? `${bestIter}/${Math.max(1, iters)}` : "baseline (0)";
      setOptLog(
        `${runHeader}\n` +
        `${distOptStopRequested ? "stopped" : "done"} ${itersRan}/${iters}\n` +
        `best iteration ${bestIterTxt}\n` +
        `${appliedNow ? "APPLIED ✅" : (queuedManual ? "QUEUED (click Apply best) ⏳" : "no better candidate (kept original)")}\n` +
        `dist before DIST@0.7D ${Number.isFinite(baseDist70) ? baseDist70.toFixed(2) : "—"}% • RMS ${Number.isFinite(baseRms) ? baseRms.toFixed(2) : "—"}%\n` +
        `dist after  DIST@0.7D ${Number.isFinite(after70) ? after70.toFixed(2) : "—"}% • RMS ${Number.isFinite(afterRms) ? afterRms.toFixed(2) : "—"}%\n` +
        `drift EFL ${eflDrift.toFixed(3)}mm • T ${tDrift.toFixed(3)} • field drop ${fieldDrop.toFixed(2)}° • IC drift ${formatSignedMm(icDriftMm, 2)} (${Number.isFinite(baseIcMm) ? baseIcMm.toFixed(2) : "—"}→${Number.isFinite(bestIcMm) ? bestIcMm.toFixed(2) : "—"}mm)\n` +
        `stop idx ${bestState.stopIdx}\n` +
        `rejects phys ${rejects.phys} • pl ${rejects.pl} • xover ${rejects.xover} • bfl ${rejects.bfl} • dist ${rejects.dist} • efl ${rejects.efl_guard} • t ${rejects.t_guard} • cov ${rejects.cov_guard} • mut ${rejects.mutation}`
      );
      toast(
        improved
          ? (appliedNow
            ? `Distortion optimized: @0.7D ${Number.isFinite(after70) ? after70.toFixed(2) : "—"}% (was ${Number.isFinite(baseDist70) ? baseDist70.toFixed(2) : "—"}%)`
            : "Distortion optimized: candidate queued, click Apply best")
          : "Distortion optimizer: no better lens within guards"
      );
      if (!cockpitMacroRunning) setCockpitProgress(1, "Optimize Distortion • done");
    } finally {
      distOptStopRequested = false;
      distOptRunning = false;
      if (ui.btnOptDist) ui.btnOptDist.disabled = false;
      if (ui.btnOptSharp && !sharpOptRunning) ui.btnOptSharp.disabled = false;
      if (!cockpitOptRunning && !cockpitMacroRunning) setCockpitProgress(0, "Idle");
      setOptRunContext(prevRunCtx);
    }
  }

  async function runOptimizer(){
    if (optRunning) return;
    if (distOptRunning || sharpOptRunning) {
      toast("Stop distortion/sharpness optimizer first.");
      return;
    }
    optRunning = true;
    if (!cockpitOptRunning && !cockpitMacroRunning) setCockpitProgress(0, "Optimize • init");
    const runNo = ++optimizerRunSerial;
    const runHeader = formatOptimizerRunHeader(runNo);

    const targetEfl = num(ui.optTargetFL?.value, 75);
    const targetT = num(ui.optTargetT?.value, 2.0);
    const targetIC = Math.max(0, num(ui.optTargetIC?.value, 0));
    const targets = { targetEfl, targetIC, targetT };
    const iters = Math.max(10, (num(ui.optIters?.value, 2000) | 0));
    const mode = (ui.optPop?.value || "safe");

    // snapshot sensor settings
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0))); // limit for speed
    const wavePreset = ui.wavePreset?.value || "d";

    const startLens = sanitizeLens(lens);
    const topo = captureTopology(startLens);
    const fastRayCount = Math.max(11, Math.min(21, Math.min(rayCount, Number(OPT_EVAL_CFG.fastRayCount || 15) | 0)));
    const perf = {
      fast: makeEvalPerfBucket(),
      accurate: makeEvalPerfBucket(),
    };

    let cur = startLens;
    let curEval = evalLensMerit(cur, {
      targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH,
      evalTier: "accurate",
      lensShiftHint: num(ui.lensFocus?.value, 0),
      afOptions: {
        force: true,
        centerShift: num(ui.lensFocus?.value, 0),
        coarseHalfRange: OPT_EVAL_CFG.accurateAfRange,
        coarseStep: OPT_EVAL_CFG.accurateAfCoarseStep,
        fineHalfRange: OPT_EVAL_CFG.accurateAfFineHalf,
        fineStep: OPT_EVAL_CFG.accurateAfFineStep,
      },
      icOptions: { mode: targetIC > 0 ? "lut" : "skip", cfg: OPT_IC_CFG },
      rayCountFast: fastRayCount,
      timingSink: perf.accurate,
    });
    let best = { lens: clone(cur), eval: curEval, iter: 0 };
    let elites = [{ lens: clone(cur), eval: curEval, iter: 0 }];
    const ELITE_MAX = 8;
    const addElite = (lensObj, evalObj, iterIdx) => {
      if (!lensObj || !evalObj) return;
      const p = buildOptPriority(evalObj, targets);
      if (!p.feasible && p.stageRank <= 0) return;
      const efl = Number(evalObj?.efl);
      const score = Number(evalObj?.score);
      const dup = elites.some((e) => {
        const ee = Number(e?.eval?.efl);
        const es = Number(e?.eval?.score);
        return Number.isFinite(score) && Number.isFinite(es) &&
          Math.abs(score - es) < 1e-6 &&
          Number.isFinite(efl) && Number.isFinite(ee) && Math.abs(efl - ee) < 1e-6;
      });
      if (dup) return;
      elites.push({ lens: clone(lensObj), eval: evalObj, iter: iterIdx | 0 });
      elites.sort((a, b) => compareEvalByPlan(a.eval, b.eval, targets));
      if (elites.length > ELITE_MAX) elites = elites.slice(0, ELITE_MAX);
    };
    let stallIters = 0;
    let flLocked = (() => {
      const p0 = buildOptPriority(curEval, targets);
      return p0.feasible && p0.flInBand;
    })();

    // annealing-ish
    let temp0 = mode === "wild" ? 3.5 : 1.8;
    let temp1 = mode === "wild" ? 0.25 : 0.12;

    const tStart = performance.now();

    const BATCH = 60;
    let itersRan = 0;

    const evalCandidateTier = (lensCand, tier, priRef, baseEvalRef, iterIdx, forceAcc = false) => {
      const baseShift = Number(baseEvalRef?.lensShift);
      const hasShift = Number.isFinite(baseShift);
      const useFast = tier === "fast" && !forceAcc;
      const doFastAf = useFast && (!hasShift || (iterIdx % Math.max(10, Number(OPT_EVAL_CFG.fastAutofocusEvery || 120) | 0) === 0));
      const icHint = Number(baseEvalRef?.softIcMm);
      const fastIcTick = iterIdx % Math.max(2, Number(OPT_EVAL_CFG.fastIcEvery || 10) | 0) === 0;
      const fastIcMode = (priRef?.stage === 2 || fastIcTick) ? "proxy" : "skip";
      return evalLensMerit(lensCand, {
        targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH,
        evalTier: useFast ? "fast" : "accurate",
        lensShiftHint: hasShift ? baseShift : curEval?.lensShift,
        afOptions: useFast
          ? {
              force: !!doFastAf,
              centerShift: hasShift ? baseShift : Number(curEval?.lensShift || 0),
              coarseHalfRange: OPT_EVAL_CFG.fastAfRange,
              coarseStep: OPT_EVAL_CFG.fastAfCoarseStep,
              fineHalfRange: OPT_EVAL_CFG.fastAfFineHalf,
              fineStep: OPT_EVAL_CFG.fastAfFineStep,
              rayCount: Math.max(7, Math.min(15, fastRayCount)),
            }
          : {
              force: true,
              centerShift: hasShift ? baseShift : Number(curEval?.lensShift || 0),
              coarseHalfRange: OPT_EVAL_CFG.accurateAfRange,
              coarseStep: OPT_EVAL_CFG.accurateAfCoarseStep,
              fineHalfRange: OPT_EVAL_CFG.accurateAfFineHalf,
              fineStep: OPT_EVAL_CFG.accurateAfFineStep,
              rayCount: Math.max(9, Math.min(31, rayCount)),
            },
        icOptions: useFast
          ? {
              mode: targetIC > 0 ? fastIcMode : "skip",
              hintMm: Number.isFinite(icHint) ? icHint : 0,
              cfg: FAST_OPT_IC_CFG,
            }
          : {
              mode: targetIC > 0 ? "lut" : "skip",
              cfg: OPT_IC_CFG,
            },
        rayCountFast: fastRayCount,
        timingSink: useFast ? perf.fast : perf.accurate,
      });
    };

    for (let i = 1; i <= iters; i++){
      if (!optRunning) break;
      itersRan = i;

      const a = i / iters;
      const temp = temp0 * (1 - a) + temp1 * a;

      const curPri = buildOptPriority(curEval, targets);
      const bestPriPre = buildOptPriority(best.eval, targets);
      const tries = (curPri.stage === 0)
        ? (curPri.eflErrRel > 0.20 ? 10 : 6)
        : (curPri.stage === 1)
        ? (flLocked ? 12 : 9) // T coarse
        : (curPri.stage === 2)
        ? (flLocked ? (curPri.icNeedMm > 9 ? 18 : 14) : 10) // IC growth
        : (flLocked ? 5 : 3); // fine tune
      let cand = null;
      let candEval = null;
      let candPri = null;

      // Deterministic guided candidate each iteration to keep momentum.
      {
        const guideBase = best?.lens || cur;
        const guidePri = best?.lens ? bestPriPre : curPri;
        const guided = buildGuidedCandidate(
          guideBase,
          guidePri,
          targets,
          wavePreset,
          topo,
          stallIters > 380
        );
        const ge = evalCandidateTier(
          guided,
          "fast",
          guidePri,
          best?.lens ? best.eval : curEval,
          i
        );
        cand = guided;
        candEval = ge;
        candPri = buildOptPriority(ge, targets);
      }

      for (let trIdx = 0; trIdx < tries; trIdx++) {
        const rBase = Math.random();
        let baseLens = cur;
        let baseEvalRef = curEval;
        let basePri = curPri;
        if (best?.lens && rBase < 0.70) {
          baseLens = best.lens;
          baseEvalRef = best.eval;
          basePri = bestPriPre;
        } else if (elites.length > 1 && rBase < 0.90) {
          const ePick = pick(elites);
          if (ePick?.lens && ePick?.eval) {
            baseLens = ePick.lens;
            baseEvalRef = ePick.eval;
            basePri = buildOptPriority(baseEvalRef, targets);
          }
        }
        const unlockForIC = (basePri.stage === 2 && basePri.icNeedMm > 10);
        const mutMode = (unlockForIC && Math.random() < 0.40) ? "wild" : mode;
        const topoUse = (unlockForIC && mutMode === "wild" && Math.random() < 0.55) ? null : topo;
        const c = mutateLens(baseLens, mutMode, topoUse, {
          stage: basePri.stage,
          targetIC,
          targetEfl,
          targetT,
          icNeedMm: basePri.icNeedMm,
          keepFl: flLocked
        });
        if (basePri.stage === 1 && Math.random() < 0.95) {
          // Coarse T phase: always push stop/pupil first.
          nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.95);
          quickSanity(c.surfaces);
          if (topoUse) enforceTopology(c.surfaces, topoUse);
        }
        if (basePri.stage === 2) {
          // IC phase: every candidate keeps pupil health in sync.
          nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.86);
        }
        if (basePri.stage === 2 && basePri.icNeedMm > 1.0 && Math.random() < 0.92) {
          applyCoverageBoostMutation(c.surfaces, {
            targetIC,
            targetEfl,
            targetT,
            icNeedMm: basePri.icNeedMm + (stallIters > 220 ? 2.5 : 0),
            keepFl: flLocked,
          });
          if (basePri.icNeedMm > 3.0 && Math.random() < 0.55) {
            applyCoverageBoostMutation(c.surfaces, {
              targetIC,
              targetEfl,
              targetT,
              icNeedMm: basePri.icNeedMm + 3.0,
              keepFl: false,
            });
          }
          quickSanity(c.surfaces);
          if (topoUse) enforceTopology(c.surfaces, topoUse);
        }
        // Keep FL search from hovering around ~5% by adding a small deterministic focal nudge.
        if (basePri.stage === 0) {
          const flErrRel = Number(basePri.eflErrRel);
          const nearEdge = Number.isFinite(flErrRel) && flErrRel <= 0.03;
          const farAway = !Number.isFinite(flErrRel) || flErrRel >= 0.12;
          nudgeLensTowardFocal(
            c,
            targetEfl,
            wavePreset,
            1.0,
            nearEdge ? 0.03 : (farAway ? 0.10 : 0.06),
            { keepAperture: true }
          );
          if (farAway) {
            nudgeLensTowardFocal(c, targetEfl, wavePreset, 0.85, 0.06, { keepAperture: true });
          }
          if (targetT > 0 && Math.random() < 0.85) {
            nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.48);
          }
        } else if (flLocked && Math.random() < 0.90) {
          nudgeLensTowardFocal(c, targetEfl, wavePreset, 0.40, 0.045, { keepAperture: true });
        }
        promoteElementDiameters(c.surfaces, {
          targetEfl,
          targetT,
          targetIC,
          stage: basePri.stage,
          strength: basePri.stage === 2 ? 1.1 : 0.8,
          keepFl: flLocked,
        });
        enforcePupilHealthFloors(c.surfaces, {
          targetEfl,
          targetT,
          targetIC,
          stage: basePri.stage,
          keepFl: flLocked,
        });
        quickSanity(c.surfaces);
        if (topoUse) enforceTopology(c.surfaces, topoUse);
        const ce = evalCandidateTier(
          c,
          "fast",
          basePri,
          baseEvalRef,
          i
        );
        if (!candEval || isEvalBetterByPlan(ce, candEval, targets)) {
          cand = c;
          candEval = ce;
          candPri = buildOptPriority(ce, targets);
        }
      }

      let candAccurate = false;
      let candAccEval = null;
      const promoteCandAccurate = () => {
        if (candAccurate && candAccEval) return candAccEval;
        candAccEval = evalCandidateTier(
          cand,
          "accurate",
          candPri,
          candEval || curEval,
          i,
          true
        );
        candEval = candAccEval;
        candPri = buildOptPriority(candEval, targets);
        candAccurate = true;
        return candAccEval;
      };

      const auditEveryBase = Math.max(20, Number(OPT_EVAL_CFG.accurateAuditEvery || 90) | 0);
      const auditEvery = (stallIters > 280)
        ? Math.max(10, Math.round(auditEveryBase * 0.35))
        : auditEveryBase;
      const shouldAccurateCheck =
        isEvalBetterByPlan(candEval, curEval, targets) ||
        isEvalBetterByPlan(candEval, best.eval, targets) ||
        (i % auditEvery === 0);
      if (shouldAccurateCheck) promoteCandAccurate();

      let accept = false;
      if (!curPri.feasible && candPri.feasible) {
        accept = true;
      } else if (curPri.feasible && !candPri.feasible) {
        if (
          curPri.stage === 2 &&
          candPri.stage <= 2 &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.icMeasured > curPri.icMeasured + 0.8 &&
          candPri.feasibilityDebt < 3500
        ) {
          // Allow temporary controlled infeasible jumps to escape IC plateaus.
          accept = Math.random() < 0.22;
        } else {
          accept = false;
        }
      } else
      // Once we have entered FL band, never accept candidates outside the 5% band.
      if (flLocked && candPri.eflErrRel > OPT_STAGE_CFG.flHoldRel) {
        accept = false;
      } else if (curPri.stage === 0 && candPri.stage === 0) {
        // Hard FL gate: in FL acquire we only move when FL gets better (or not worse within tiny epsilon).
        const flTol = 1e-6;
        if (candPri.eflErrRel < curPri.eflErrRel - flTol) {
          accept = true;
        } else if (candPri.eflErrRel <= curPri.eflErrRel + flTol) {
          accept = candPri.score <= curEval.score + 1e-6;
        } else {
          accept = false;
        }
      } else if (curPri.flInBand && curPri.stage === 2 && candPri.eflErrRel > OPT_STAGE_CFG.flHoldRel) {
        // IC phase may move inside FL hold band, but never outside hard hold.
        accept = false;
      } else if (curPri.flInBand && curPri.stage === 3 && candPri.eflErrRel > curPri.eflErrRel + OPT_STAGE_CFG.polishFlDriftRel) {
        // Fine tune (distortion polish): keep FL locked while polishing.
        accept = false;
      } else if (
        curPri.stage === 3 &&
        candPri.stage === 3 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
        (
          candPri.distRmsScore > curPri.distRmsScore + 0.02 ||
          candPri.distMaxScore > curPri.distMaxScore + 0.04
        )
      ) {
        // In final polish, avoid drifting toward higher distortion.
        accept = false;
      } else if (
        curPri.stage === 1 &&
        candPri.stage === 1 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.tErrAbs < curPri.tErrAbs - 0.01
      ) {
        // Coarse T phase should move even if IC does not.
        accept = true;
      } else if (
        curPri.stage === 2 &&
        candPri.stage === 2 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.icMeasured > curPri.icMeasured + 0.005
      ) {
        // Explicitly keep climbing IC when FL remains inside lock band.
        accept = true;
      } else if (isEvalBetterByPlan(candEval, curEval, targets)) {
        accept = true;
      } else {
        // Controlled exploration within FL constraints, to avoid optimizer stagnation.
        const sameStage = candPri.stage === curPri.stage;
        if (sameStage) {
          if (curPri.stage === 0) {
            // No uphill exploration in FL acquire.
            accept = candPri.eflErrRel <= curPri.eflErrRel + 1e-6;
          } else if (curPri.stage === 1) {
            // T coarse stays target-dominant: do not accept worse T error.
            accept =
              candPri.feasible &&
              candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
              candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
              candPri.icNeedMm <= curPri.icNeedMm + 0.25;
          } else if (curPri.stage === 2) {
            // IC growth stays target-dominant: do not accept worse IC shortfall.
            const icTol = stallIters > 220 ? 0.35 : 0.18;
            accept =
              candPri.feasible &&
              candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
              candPri.icNeedMm <= curPri.icNeedMm + icTol &&
              candPri.tErrAbs <= curPri.tErrAbs + 0.12;
          } else {
            const dE = planEnergy(candPri) - planEnergy(curPri);
            const tempScale = (curPri.stage === 2 ? 520 : 300) * Math.max(0.10, temp);
            const uphillProb = Math.exp(-Math.max(0, dE) / Math.max(1e-6, tempScale));
            if (flLocked) {
              accept = Math.random() < uphillProb;
            } else {
              accept = (dE <= 0) || (Math.random() < uphillProb);
            }
          }
        }
      }
      if (accept && !candAccurate) {
        promoteCandAccurate();
        const stage1PlateauOk =
          curPri.stage === 1 &&
          candPri.stage === 1 &&
          candPri.feasible &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
          candPri.icNeedMm <= curPri.icNeedMm + 0.25;
        const stage2PlateauOk =
          curPri.stage === 2 &&
          candPri.stage === 2 &&
          candPri.feasible &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.icNeedMm <= curPri.icNeedMm + (stallIters > 220 ? 0.35 : 0.18) &&
          candPri.tErrAbs <= curPri.tErrAbs + 0.12;
        const stage0PlateauOk =
          curPri.stage === 0 &&
          candPri.stage === 0 &&
          candPri.eflErrRel <= curPri.eflErrRel + 1e-6;
        const accStillGood =
          isEvalBetterByPlan(candEval, curEval, targets) ||
          stage0PlateauOk ||
          stage1PlateauOk ||
          stage2PlateauOk ||
          (
            curPri.stage === 1 &&
            candPri.stage === 1 &&
            candPri.feasible &&
            candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
            candPri.tErrAbs < curPri.tErrAbs - 0.01
          ) ||
          (
            curPri.stage === 2 &&
            candPri.stage === 2 &&
            candPri.feasible &&
            candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
            candPri.icMeasured > curPri.icMeasured + 0.005
          );
        if (!accStillGood) accept = false;
      }
      if (accept){
        cur = cand;
        curEval = candEval;
        flLocked = flLocked || (candPri.feasible && candPri.flInBand);
        addElite(cur, curEval, i);
      }

      let improvedBest = false;
      if (!candAccurate && isEvalBetterByPlan(candEval, best.eval, targets)) {
        promoteCandAccurate();
      }
      if (isEvalBetterByPlan(candEval, best.eval, targets)){
        best = { lens: clone(cand), eval: candEval, iter: i };
        addElite(best.lens, best.eval, i);
        improvedBest = true;
        const bp = buildOptPriority(best.eval, targets);
        const stageStep = fmtStageStep(bp.stage);

        // UI update (rare)
        if (ui.optLog){
          setOptLog(
            `${runHeader}\n` +
            `best @${i}/${iters}\n` +
            `score ${best.eval.score.toFixed(2)}\n` +
            `stage ${stageStep}: ${bp.stageName}\n` +
            `${fmtPhysOpt(best.eval, targets)}\n` +
            `${fmtFlOpt(best.eval, targetEfl)}\n` +
            `${fmtIcOpt(best.eval, targetIC)}\n` +
            `${fmtTOpt(best.eval, targetT)}\n` +
            `${fmtDistOpt(best.eval)}\n` +
            `${fmtRealismOpt(best.eval, targets)}\n` +
            `Tp0 ${Number.isFinite(best.eval.goodFrac0)?(best.eval.goodFrac0*100).toFixed(0):"—"}%\n` +
            `INTR ${fmtIntrusion(best.eval)}\n` +
            `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n`
          );
        }
      }
      stallIters = improvedBest ? 0 : (stallIters + 1);

      if (stallIters > 220 && (i % Math.max(40, BATCH / 2) === 0)) {
        const bpKick = buildOptPriority(best.eval, targets);
        const kick = buildGuidedCandidate(best.lens, bpKick, targets, wavePreset, topo, true);
        const kickEval = evalCandidateTier(kick, "accurate", bpKick, best.eval, i, true);
        if (isEvalBetterByPlan(kickEval, curEval, targets)) {
          cur = kick;
          curEval = kickEval;
          const kp = buildOptPriority(kickEval, targets);
          flLocked = flLocked || (kp.feasible && kp.flInBand);
          addElite(cur, curEval, i);
        }
        if (isEvalBetterByPlan(kickEval, best.eval, targets)) {
          best = { lens: clone(kick), eval: kickEval, iter: i };
          addElite(best.lens, best.eval, i);
          stallIters = 0;
        } else {
          stallIters = Math.floor(stallIters * 0.6);
        }
      }


      // Re-anchor when current drifts too far from best; keeps learning around elites.
      const bestPriPost = buildOptPriority(best.eval, targets);
      const curPriPost = buildOptPriority(curEval, targets);
      const curMuchWorse =
        (curPriPost.stageRank < bestPriPost.stageRank) ||
        (curPriPost.eflErrRel > bestPriPost.eflErrRel + 0.08) ||
        (curEval.score > best.eval.score * 2.4);
      if (curMuchWorse && (i % Math.max(40, BATCH / 2) === 0)) {
        cur = clone(best.lens);
        curEval = best.eval;
        flLocked = flLocked || (bestPriPost.feasible && bestPriPost.flInBand);
      }

      if (i % BATCH === 0){
        const tNow = performance.now();
        const dt = (tNow - tStart) / 1000;
        const ips = i / Math.max(1e-6, dt);
        const cp = buildOptPriority(curEval, targets);
        const bp = buildOptPriority(best.eval, targets);
        if (ui.optLog){
          setOptLog(
            `${runHeader}\n` +
            `running… ${i}/${iters}  (${ips.toFixed(1)} it/s)\n` +
            `current ${curEval.score.toFixed(2)} • best ${best.eval.score.toFixed(2)} @${best.iter}\n` +
            `phase current: ${cp.stageName} • best: ${bp.stageName}${flLocked ? " • FL lock ON" : ""}\n` +
            `${fmtPhysOpt(curEval, targets)}\n` +
            `current ${fmtFlOpt(curEval, targetEfl)}\n` +
            `current ${fmtIcOpt(curEval, targetIC)}\n` +
            `current ${fmtTOpt(curEval, targetT)}\n` +
            `current ${fmtDistOpt(curEval)}\n` +
            `current ${fmtRealismOpt(curEval, targets)}\n` +
            `best ${fmtFlOpt(best.eval, targetEfl)}\n` +
            `best ${fmtIcOpt(best.eval, targetIC)}\n` +
            `best ${fmtTOpt(best.eval, targetT)}\n` +
            `best ${fmtDistOpt(best.eval)}\n` +
            `best ${fmtRealismOpt(best.eval, targets)}\n` +
            `best ${fmtPhysOpt(best.eval, targets)}\n`
          );
        }
        if (!cockpitOptRunning && !cockpitMacroRunning) {
          setCockpitProgress(i / Math.max(1, iters), `Optimize • ${i}/${iters}`);
        }
        // yield to UI
        await new Promise(r => setTimeout(r, 0));
      }
    }

    optBest = best;
    optRunning = false;

    const tEnd = performance.now();
    const sec = (tEnd - tStart) / 1000;
    const bp = buildOptPriority(best.eval, targets);
    const stageStep = fmtStageStep(bp.stage);
    if (ui.optLog){
      setOptLog(
        `${runHeader}\n` +
        `done ${itersRan}/${iters}  (${(Math.max(1, itersRan)/Math.max(1e-6,sec)).toFixed(1)} it/s)\n` +
        `BEST score ${best.eval.score.toFixed(2)}\n` +
        `BEST @${best.iter}\n` +
        `BEST stage ${stageStep}: ${bp.stageName}\n` +
        `${fmtPhysOpt(best.eval, targets)}\n` +
        `${fmtFlOpt(best.eval, targetEfl)}\n` +
        `${fmtIcOpt(best.eval, targetIC)}\n` +
        `${fmtTOpt(best.eval, targetT)}\n` +
        `${fmtDistOpt(best.eval)}\n` +
        `${fmtRealismOpt(best.eval, targets)}\n` +
        `Tp0 ${Number.isFinite(best.eval.goodFrac0)?(best.eval.goodFrac0*100).toFixed(0):"—"}%\n` +
        `INTR ${fmtIntrusion(best.eval)}\n` +
        `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n` +
        `Click “Apply best” to load.`
      );
    }

    toast(
      optBest
        ? `Optimize done. Score ${optBest.eval.score.toFixed(2)} • FL ${Number.isFinite(optBest.eval.efl) ? Number(optBest.eval.efl).toFixed(1) : "—"}mm${targetIC > 0 ? ` • IC ${Number(optBest.eval.softIcMm || 0).toFixed(1)}mm` : ""}`
        : "Optimize stopped"
    );
    if (!cockpitOptRunning && !cockpitMacroRunning) {
      setCockpitProgress(1, "Optimize • done");
      setTimeout(() => {
        if (!optRunning && !cockpitOptRunning && !cockpitMacroRunning) setCockpitProgress(0, "Idle");
      }, 500);
    }
  }

  function stopOptimizer(){
    const stoppingScratch = !!scratchBuildRunning;
    const stoppingOpt = !!optRunning;
    const stoppingDist = !!distOptRunning;
    const stoppingSharp = !!sharpOptRunning;
    const stoppingCockpit = !!cockpitOptRunning || !!cockpitMacroRunning;
    if (!stoppingScratch && !stoppingOpt && !stoppingDist && !stoppingSharp && !stoppingCockpit) return;
    if (stoppingScratch) scratchStopRequested = true;
    if (stoppingOpt) optRunning = false;
    if (stoppingDist) distOptStopRequested = true;
    if (stoppingSharp) sharpOptStopRequested = true;
    if (stoppingCockpit) cockpitStopRequested = true;

    const parts = [];
    if (stoppingScratch) parts.push("build");
    if (stoppingOpt) parts.push("optimizer");
    if (stoppingDist) parts.push("distortion");
    if (stoppingSharp) parts.push("sharpness");
    if (stoppingCockpit) parts.push("cockpit");
    toast(`Stopping ${parts.join(" + ")} run${parts.length > 1 ? "s" : ""}…`);
  }

  function applyBest(){
    if (!optBest?.lens) return toast("No best yet");
    const targets = {
      targetEfl: num(ui.optTargetFL?.value, 75),
      targetIC: Math.max(0, num(ui.optTargetIC?.value, 0)),
      targetT: num(ui.optTargetT?.value, 2.0),
    };
    const p = buildOptPriority(optBest.eval, targets);
    if (!p.feasible) {
      return toast("Best is fysiek ongeldig (intrusion/overlap/BFL). Eerst verder optimaliseren.");
    }
    const usable = scratchMinimumUsableReached({ pri: p, evalRes: optBest.eval }, targets);
    if (!usable) {
      toast("Waarschuwing: best is nog niet ideaal (focus/scherpte/T/vignette), maar wordt wel toegepast.");
    }
    recordCockpitSnapshot("Main pre-apply");
    loadLens(optBest.lens);
    const m = optBest?.meta || {};
    const fm = String(m.focusMode || "lens").toLowerCase() === "cam" ? "cam" : "lens";
    if (ui.focusMode) ui.focusMode.value = fm;
    if (fm === "cam") {
      if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(Number(m.sensorX))
        ? Number(m.sensorX).toFixed(3)
        : "0";
      if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(Number(m.lensShift))
        ? Number(m.lensShift).toFixed(3)
        : Number(optBest.eval.lensShift || 0).toFixed(3);
    } else {
      if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(Number(m.sensorX))
        ? Number(m.sensorX).toFixed(3)
        : "0";
      if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(Number(m.lensShift))
        ? Number(m.lensShift).toFixed(3)
        : Number(optBest.eval.lensShift || 0).toFixed(3);
    }
    renderAll();
    recordCockpitSnapshot("Main applied");
    toast(`Applied best${m?.source ? ` (${String(m.source)})` : ""}`);
  }

  function benchOptimizer(){
    const N = 200;
    const targetEfl = num(ui.optTargetFL?.value, 75);
    const targetT = num(ui.optTargetT?.value, 2.0);
    const targetIC = Math.max(0, num(ui.optTargetIC?.value, 0));
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0)));
    const wavePreset = ui.wavePreset?.value || "d";

    const t0 = performance.now();
    let best = Infinity;
    let bestIc = 0;
    let bestShort = Infinity;
    for (let i=0;i<N;i++){
      const res = evalLensMerit(lens, {targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH});
      if (res.score < best) best = res.score;
      if (targetIC > 0) {
        const s = Math.max(0, Number(res.icShortfallMm || 0));
        if (s < bestShort) {
          bestShort = s;
          bestIc = Number(res.softIcMm || 0);
        }
      }
    }
    const t1 = performance.now();
    const sec = (t1 - t0)/1000;
    const eps = N / Math.max(1e-6, sec);
    setOptLog(
      `bench ${N} evals\n` +
      `${eps.toFixed(1)} eval/s\n` +
      `best seen ${best.toFixed(2)}\n` +
      `${targetIC > 0 ? `IC best ${bestIc.toFixed(2)}mm • short ${bestShort.toFixed(2)}mm\n` : ""}` +
      `(rays=${rayCount}, field=${fieldAngle}°, wave=${wavePreset})`
    );
    toast(`Bench: ${eps.toFixed(1)} eval/s`);
  }

  // -------------------- init wiring --------------------
  function wireUI() {
    populateSensorPresetsSelect();
    applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");

    ui.sensorPreset?.addEventListener("change", () => {
      applyPreset(ui.sensorPreset.value);
      renderAll();
      scheduleAutosave();
    });
    ui.sensorW?.addEventListener("input", () => { applySensorToIMS(); renderAll(); scheduleAutosave(); });
    ui.sensorH?.addEventListener("input", () => { applySensorToIMS(); renderAll(); scheduleAutosave(); });

    ["fieldAngle","rayCount","wavePreset","sensorOffset","focusMode","lensFocus"].forEach((id) => {
      ui[id]?.addEventListener("input", () => { scheduleRenderAll(); scheduleAutosave(); });
      ui[id]?.addEventListener("change", () => { scheduleRenderAll(); scheduleAutosave(); });
    });
    ui.renderScale?.addEventListener("input", () => { scheduleRenderAll(); scheduleAutosave(); });

    ui.btnNew?.addEventListener("click", () => { newClearLens(); scheduleAutosave(); });
    ui.btnLoadOmit?.addEventListener("click", () => { loadLens(omit50ConceptV1()); scheduleAutosave(); });
    ui.btnLoadDemo?.addEventListener("click", () => { loadLens(demoLensSimple()); scheduleAutosave(); });

    ui.btnAdd?.addEventListener("click", () => { addSurface(); scheduleAutosave(); });
    ui.btnAddElement?.addEventListener("click", openElementModal);
    ui.btnDuplicate?.addEventListener("click", () => { duplicateSelected(); scheduleAutosave(); });
    ui.btnMoveUp?.addEventListener("click", () => { moveSelected(-1); scheduleAutosave(); });
    ui.btnMoveDown?.addEventListener("click", () => { moveSelected(+1); scheduleAutosave(); });
    ui.btnRemove?.addEventListener("click", () => { removeSelected(); scheduleAutosave(); });

    ui.btnScaleToFocal?.addEventListener("click", () => { scaleToFocal(); scheduleAutosave(); });
    ui.btnSetTStop?.addEventListener("click", () => { setTStop(); scheduleAutosave(); });

    ui.btnAutoFocus?.addEventListener("click", () => { autoFocus(); scheduleAutosave(); });

    ui.btnSave?.addEventListener("click", saveJSON);
    ui.fileLoad?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) loadJSONFile(f).catch((err) => {
        console.error(err);
        toast("Load failed (invalid JSON?)");
      });
      if (f) scheduleAutosave();
      e.target.value = "";
    });

    ui.btnRaysFS?.addEventListener("click", () => toggleFullscreen(ui.raysPane));

    // optimizer
    ui.btnBuildScratch?.addEventListener("click", openBuildScratchModal);
    ui.btnOptStart?.addEventListener("click", runOptimizer);
    ui.btnOptDist?.addEventListener("click", runDistortionOptimizer);
    ui.btnOptDistApply?.addEventListener("click", applyDistortionBest);
    ui.btnOptSharp?.addEventListener("click", runSharpnessOptimizer);
    ui.btnOptSharpApply?.addEventListener("click", applySharpnessBest);
    ui.btnOptStop?.addEventListener("click", stopOptimizer);
    ui.btnOptApply?.addEventListener("click", applyBest);
    ui.btnOptBench?.addEventListener("click", benchOptimizer);

    // cockpit
    ui.btnBaselineLens?.addEventListener("click", makeBaselineLensFromCockpit);
    ui.btnOptEfl?.addEventListener("click", () => runOptimizeEflLocal());
    ui.btnOptTLocal?.addEventListener("click", () => runOptimizeTLocal());
    ui.btnOptICLocal?.addEventListener("click", () => runOptimizeImageCircleLocal());
    ui.btnOptDistLocal?.addEventListener("click", () => runOptimizeDistortionLocal());
    ui.btnOptSharpLocal?.addEventListener("click", () => runOptimizeSharpnessLocal());
    ui.btnOptAllMacro?.addEventListener("click", runOptimizeAllMacro);

    ui.btnSnapshotSave?.addEventListener("click", saveCockpitSnapshotManual);
    ui.btnSnapshotUndo?.addEventListener("click", undoCockpitSnapshot);
    ui.btnSnapshotRedo?.addEventListener("click", redoCockpitSnapshot);
    ui.btnSnapshotCompare?.addEventListener("click", compareCockpitSnapshot);

    ui.cockpitStep?.addEventListener("input", () => { markCockpitStepLabel(); scheduleAutosave(); });
    ui.cockpitStep?.addEventListener("change", () => { markCockpitStepLabel(); scheduleAutosave(); });
    ui.cockpitSurfaceMode?.addEventListener("change", () => { syncCockpitRangeInputs(); scheduleAutosave(); });

    ["optTargetFL","optTargetT","optTargetIC","optIters","distOptIters","optPop","optAutoApply"].forEach((id)=>{
      ui[id]?.addEventListener("change", () => { scheduleRenderAll(); scheduleAutosave(); });
      ui[id]?.addEventListener("input", () => {
        // don't rerender constantly for iters/preset; but update merit targets
        if (id === "optTargetFL" || id === "optTargetT" || id === "optTargetIC") scheduleRenderAll();
        scheduleAutosave();
      });
    });

    ["cockpitIters","cockpitSurfaceMode","cockpitSurfaceStart","cockpitSurfaceEnd","cockpitStrictness","cockpitMacroPasses","cockpitAnneal"].forEach((id) => {
      ui[id]?.addEventListener("change", () => { scheduleRenderAll(); scheduleAutosave(); });
      ui[id]?.addEventListener("input", () => { scheduleAutosave(); });
    });
    syncCockpitRangeInputs();
  }

  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      const target = e.target;
      const tag = String(target?.tagName || "").toUpperCase();
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        saveJSON();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "o") {
        e.preventDefault();
        ui.fileLoad?.click();
        return;
      }
      if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey && String(e.key).toLowerCase() === "a") {
        e.preventDefault();
        autoFocus();
        scheduleAutosave();
      }
    });
  }

  // -------------------- boot --------------------
  function boot() {
    wireUI();
    bindKeyboardShortcuts();
    markCockpitStepLabel();

    // Force top on boot
    try {
      window.scrollTo(0, 0);
      document.querySelector(".leftScroll")?.scrollTo(0, 0);
      setTimeout(() => document.querySelector(".leftScroll")?.scrollTo(0, 0), 0);
      setTimeout(() => ensureToolbarStartVisible(), 0);
      setTimeout(() => ensureToolbarStartVisible(), 80);
    } catch(_) {}

    const restored = restoreAutosave();
    if (!restored) {
      buildTable();
      applySensorToIMS();
    }
    bindViewControls();
    renderAll();
    recordCockpitSnapshot("Session start");
    updateSnapshotButtonsState();
    if (ui.cockpitCompareInfo && !cockpitBaselineSnapshot) {
      ui.cockpitCompareInfo.textContent = "No baseline yet";
    }
    setCockpitProgress(0, "Idle");

    window.addEventListener("resize", () => { ensureToolbarStartVisible(); renderAll(); });
    document.addEventListener("fullscreenchange", () => renderAll());
  }

  boot();
})();
