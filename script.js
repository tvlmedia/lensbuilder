/* Meridional Raytracer (2D) — TVL Lens Builder (single-file MVP)
   - Split view: Lens canvas + Chart preview
   - Table editor for surfaces
   - Stop-aware ray sampling (simple)
   - Import/Export JSON
   - Chart load: URL (GitHub raw) + local file
*/

(() => {
  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, fb=0) => {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fb;
  };
  const deepClone = (o) => (typeof structuredClone === "function")
    ? structuredClone(o)
    : JSON.parse(JSON.stringify(o));

  // -------------------- CONFIG: put your GitHub chart here --------------------
  // TIP for GitHub:
  // - Use the RAW url (raw.githubusercontent.com/...)
  // - Or host via GitHub Pages and point to /assets/...
  const DEFAULT_CHART_URL = "./assets/lens_chart_3x2.png"; // <-- CHANGE THIS

  // -------------------- GLASS DB (extend whenever) --------------------
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

  // -------------------- DOM refs --------------------
  const canvasLens = $("#canvasLens");
  const ctxLens = canvasLens.getContext("2d");

  const canvasPrev = $("#canvasPrev");
  const ctxPrev = canvasPrev.getContext("2d");

  const ui = {
    tbody: $("#surfTbody"),
    status: $("#statusText"),
    efl: $("#badgeEfl"),
    bfl: $("#badgeBfl"),
    vig: $("#badgeVig"),

    sensorW: $("#sensorW"),
    sensorH: $("#sensorH"),
    flange: $("#flange"),
    fieldDeg: $("#fieldDeg"),
    rayCount: $("#rayCount"),
    pxPerMm: $("#pxPerMm"),

    chkStops: $("#chkStops"),
    chkApertures: $("#chkApertures"),
    chkAxis: $("#chkAxis"),

    btnNew: $("#btnNew"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnAddSurf: $("#btnAddSurf"),
    btnAddElement: $("#btnAddElement"),
    btnImport: $("#btnImport"),
    btnExport: $("#btnExport"),
    fileJson: $("#fileJson"),

    btnLoadChart: $("#btnLoadChart"),
    btnPickChart: $("#btnPickChart"),
    fileChart: $("#fileChart"),

    btnFit: $("#btnFit"),
    btnFill: $("#btnFill"),
    btn1to1: $("#btn1to1"),
    btnFullscreenPreview: $("#btnFullscreenPreview"),

    modal: $("#modal"),
    btnCloseModal: $("#btnCloseModal"),
    btnInsertElement: $("#btnInsertElement"),

    elType: $("#elType"),
    elAfter: $("#elAfter"),
    elAp: $("#elAp"),
    elGap: $("#elGap"),
    elR1: $("#elR1"),
    elT1: $("#elT1"),
    elG1: $("#elG1"),
    elR2: $("#elR2"),
    elR3: $("#elR3"),
    elT2: $("#elT2"),
    elG2: $("#elG2"),
    elStopMode: $("#elStopMode"),
  };

  // populate glass selects
  function fillGlassSelect(sel){
    const keys = Object.keys(GLASS_DB);
    sel.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join("");
  }
  fillGlassSelect(ui.elG1);
  fillGlassSelect(ui.elG2);
  ui.elG1.value = "BK7";
  ui.elG2.value = "F2";

  // -------------------- Model --------------------
  // OSLO-ish: glass = medium AFTER the surface.
  // Surface: { R, t, ap, glass, isStop }
  const state = {
    surfaces: [],
    chart: {
      mode: "fit", // fit | fill | 1to1
      img: null,
      url: DEFAULT_CHART_URL,
      loaded: false,
    },
    last: {
      efl: null,
      bfl: null,
      vignette: false,
    }
  };

  // -------------------- Presets --------------------
  function presetDemo(){
    // A simple, plausible-ish 6-surface double-gauss-ish toy (NOT a real lens)
    return {
      meta: { name: "Demo (toy) 50mm-ish" },
      sensor: { w: 36, h: 24, flange: 52 },
      surfaces: [
        { R:  80, t:  6, ap: 22, glass:"BK7", isStop:false },
        { R: -80, t:  2, ap: 20, glass:"AIR", isStop:false },

        { R:  55, t:  5, ap: 18, glass:"F2",  isStop:false },
        { R: -55, t:  1.5, ap: 16, glass:"AIR", isStop:true  }, // stop-ish

        { R: -65, t:  5, ap: 18, glass:"BK7", isStop:false },
        { R:  90, t: 30, ap: 20, glass:"AIR", isStop:false }, // to sensor space
      ]
    };
  }

  function presetOmit50(){
    // Placeholder "OMIT 50" style preset for your workflow — tune freely
    return {
      meta: { name: "OMIT 50 preset (placeholder)" },
      sensor: { w: 36, h: 24, flange: 52 },
      surfaces: [
        { R:  70, t:  6, ap: 24, glass:"BK7", isStop:false },
        { R: -45, t:  1, ap: 22, glass:"AIR", isStop:false },

        { R:  40, t:  5, ap: 18, glass:"F2",  isStop:false },
        { R: -40, t:  2, ap: 14, glass:"AIR", isStop:true  },

        { R: -55, t:  5, ap: 18, glass:"BK7", isStop:false },
        { R:  80, t: 28, ap: 20, glass:"AIR", isStop:false },
      ]
    };
  }

  // -------------------- Chart loading --------------------
  function drawChart(){
    const W = canvasPrev.width, H = canvasPrev.height;
    ctxPrev.setTransform(1,0,0,1,0,0);
    ctxPrev.clearRect(0,0,W,H);
    ctxPrev.fillStyle = "#000";
    ctxPrev.fillRect(0,0,W,H);

    const img = state.chart.img;
    if(!img || !state.chart.loaded){
      ctxPrev.fillStyle = "rgba(255,255,255,.75)";
      ctxPrev.font = "700 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctxPrev.textAlign = "center";
      ctxPrev.fillText("No chart loaded — use 'Load chart (URL)' or 'Load chart (file)'", W/2, H/2);
      return;
    }

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    // keep aspect ratio; chart should be 3:2 ideally (e.g. 6000x4000)
    const fit = (mode) => {
      const sx = W / iw;
      const sy = H / ih;
      if(mode === "1to1") return { dw: iw, dh: ih };
      if(mode === "fill"){
        const s = Math.max(sx, sy);
        return { dw: iw*s, dh: ih*s };
      }
      // fit
      const s = Math.min(sx, sy);
      return { dw: iw*s, dh: ih*s };
    };

    const { dw, dh } = fit(state.chart.mode);
    const dx = (W - dw)/2;
    const dy = (H - dh)/2;

    ctxPrev.imageSmoothingEnabled = true;
    ctxPrev.imageSmoothingQuality = "high";
    ctxPrev.drawImage(img, dx, dy, dw, dh);

    // tiny overlay: 3:2 label + dims
    ctxPrev.fillStyle = "rgba(0,0,0,.55)";
    ctxPrev.fillRect(12, 12, 230, 44);
    ctxPrev.strokeStyle = "rgba(255,255,255,.12)";
    ctxPrev.strokeRect(12, 12, 230, 44);

    ctxPrev.fillStyle = "rgba(255,255,255,.88)";
    ctxPrev.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctxPrev.fillText(`chart: ${iw}x${ih}`, 22, 30);
    ctxPrev.fillText(`mode: ${state.chart.mode}`, 22, 48);
  }

  function loadChartFromUrl(url){
    state.chart.url = url;
    state.chart.loaded = false;
    const img = new Image();
    img.crossOrigin = "anonymous"; // works if server allows; GitHub raw usually ok
    img.onload = () => {
      state.chart.img = img;
      state.chart.loaded = true;
      drawChart();
      setStatus("chart loaded");
    };
    img.onerror = () => {
      state.chart.img = null;
      state.chart.loaded = false;
      drawChart();
      setStatus("chart load FAILED (check URL / CORS)");
    };
    img.src = url;
  }

  function loadChartFromFile(file){
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.chart.img = img;
      state.chart.loaded = true;
      drawChart();
      setStatus("chart loaded (file)");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setStatus("chart file load FAILED");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // -------------------- Optics core (simple 2D meridional) --------------------
  // We trace rays from left to right through spherical surfaces.
  // This is a compact MVP (good enough for layout + sanity checks).
  function refractRay(ray, surf, n1, n2){
    // surface at x = current vertex; ray is {x,y, dx, dy}
    // Find intersection with surface:
    // - If R == 0 => plane at x=0 (in local), intersection at t = (0 - x)/dx
    // - If sphere: center at (R, 0) in local coords (vertex at 0), equation: (x - R)^2 + y^2 = R^2
    const R = surf.R;
    const x0 = ray.x, y0 = ray.y, vx = ray.dx, vy = ray.dy;

    let tHit = null;
    let nx = 1, ny = 0;

    if (Math.abs(R) < 1e-9){
      if (Math.abs(vx) < 1e-12) return null;
      tHit = (-x0) / vx;
      if (tHit <= 1e-9) return null;
      // plane normal points +x
      nx = 1; ny = 0;
    } else {
      // Solve quadratic for intersection with sphere
      const cx = R;
      const A = vx*vx + vy*vy;
      const B = 2*((x0 - cx)*vx + y0*vy);
      const C = (x0 - cx)*(x0 - cx) + y0*y0 - R*R;
      const D = B*B - 4*A*C;
      if (D < 0) return null;
      const sD = Math.sqrt(D);

      const t1 = (-B - sD)/(2*A);
      const t2 = (-B + sD)/(2*A);
      // choose smallest positive
      const t = (t1 > 1e-9) ? t1 : ((t2 > 1e-9) ? t2 : null);
      if (t == null) return null;
      tHit = t;

      const xi = x0 + vx*tHit;
      const yi = y0 + vy*tHit;

      // normal is from center to point: (xi-cx, yi)
      let nnx = (xi - cx);
      let nny = yi;
      const nlen = Math.hypot(nnx, nny) || 1;
      nnx /= nlen; nny /= nlen;

      // For refraction we want normal pointing *against* incident ray direction
      // If dot(v, n) > 0, flip
      if (vx*nnx + vy*nny > 0){
        nnx = -nnx; nny = -nny;
      }
      nx = nnx; ny = nny;
    }

    // Intersection point in local surface coords
    const xi = x0 + vx*tHit;
    const yi = y0 + vy*tHit;

    // Aperture clip
    if (Math.abs(yi) > surf.ap + 1e-9) return { hit: true, clipped: true, x: xi, y: yi };

    // Snell refraction: v -> v'
    // Using vector form:
    const vlen = Math.hypot(vx, vy) || 1;
    let ivx = vx / vlen, ivy = vy / vlen;

    const eta = n1 / n2;
    const cosi = -(nx*ivx + ny*ivy); // incident cosine
    const k = 1 - eta*eta*(1 - cosi*cosi);
    if (k < 0){
      // total internal reflection (rare in this usage)
      return { hit:true, tir:true, x: xi, y: yi };
    }
    const cost = Math.sqrt(k);
    const tvx = eta*ivx + (eta*cosi - cost)*nx;
    const tvy = eta*ivy + (eta*cosi - cost)*ny;

    return {
      hit:true,
      x: xi,
      y: yi,
      dx: tvx,
      dy: tvy,
      clipped:false,
      tir:false
    };
  }

  function traceOneRay(yStart, angRad){
    // Start ray at x = -X0 far left, heading to the right with field angle
    // Use a finite start distance so intersections work.
    const X0 = 200; // mm left of first vertex
    let ray = {
      x: -X0,
      y: yStart,
      dx: Math.cos(angRad),
      dy: Math.sin(angRad)
    };

    const pts = [];
    let xAccum = 0;
    let nCur = 1.0;

    for(let i=0;i<state.surfaces.length;i++){
      const s = state.surfaces[i];

      // move into local coords of this surface vertex
      ray.x -= xAccum; // shift so surface vertex is at x=0
      const nNext = GLASS_DB[s.glass]?.nd ?? 1.0;

      const hit = refractRay(ray, s, nCur, nNext);
      if(!hit || !hit.hit){
        return { ok:false, pts, why:"miss" };
      }

      pts.push({ x: hit.x + xAccum, y: hit.y, clipped: !!hit.clipped, stop: !!s.isStop });

      if(hit.clipped) return { ok:false, pts, why:"vignette" };
      if(hit.tir) return { ok:false, pts, why:"tir" };

      // update ray at hit point (global)
      ray = {
        x: hit.x + xAccum,
        y: hit.y,
        dx: hit.dx,
        dy: hit.dy
      };

      // restore to global then advance to next vertex by thickness t
      ray.x += s.t;
      xAccum = 0;

      // prepare for next: accumulate via explicit translate
      // We keep everything in global x, but for next surface we need local shift:
      // easiest: maintain a running "vertexX" instead.
      // We'll do that outside the loop in a cleaner tracer (below).
      // For MVP, we’ll restructure:
    }

    return { ok:true, pts, why:"ok" };
  }

  function traceRayGlobal(yStart, angRad){
    // Better: keep vertex positions explicitly
    const vertexX = [];
    let x = 0;
    for(let i=0;i<state.surfaces.length;i++){
      vertexX.push(x);
      x += state.surfaces[i].t;
    }
    const sensorX = x; // plane after last thickness

    let ray = {
      x: vertexX[0] - 200,
      y: yStart,
      dx: Math.cos(angRad),
      dy: Math.sin(angRad)
    };

    const pts = [];
    let nCur = 1.0;

    for(let i=0;i<state.surfaces.length;i++){
      const s = state.surfaces[i];
      const vx = vertexX[i];

      // transform to local at vertex
      const local = { x: ray.x - vx, y: ray.y, dx: ray.dx, dy: ray.dy };
      const nNext = GLASS_DB[s.glass]?.nd ?? 1.0;

      const hit = refractRay(local, s, nCur, nNext);
      if(!hit || !hit.hit) return { ok:false, pts, why:"miss", sensorX };

      const hx = hit.x + vx;
      const hy = hit.y;
      pts.push({ x: hx, y: hy, clipped: !!hit.clipped, stop: !!s.isStop });

      if(hit.clipped) return { ok:false, pts, why:"vignette", sensorX };
      if(hit.tir) return { ok:false, pts, why:"tir", sensorX };

      // new ray in global
      ray = { x: hx, y: hy, dx: hit.dx, dy: hit.dy };

      // propagate to next vertex plane (approx along x): we just let next surface solve intersection again.
      // but keep ray slightly advanced to avoid self-hit.
      ray.x += 1e-6;
      nCur = nNext;
    }

    // intersect sensor plane at sensorX
    const vx = ray.dx;
    if(Math.abs(vx) < 1e-12) return { ok:false, pts, why:"sensor-miss", sensorX };
    const t = (sensorX - ray.x) / vx;
    const ys = ray.y + ray.dy * t;
    pts.push({ x: sensorX, y: ys, sensor:true });

    return { ok:true, pts, why:"ok", sensorX, ySensor: ys };
  }

  function computeEflBfl(){
    // crude paraxial-ish:
    // - shoot small-angle chief ray from y=0 with small field, see image height => focal
    // - and on-axis ray from some height with 0 angle => find focus crossing
    if(state.surfaces.length < 2) return { efl:null, bfl:null };

    const vertexX = [];
    let x = 0;
    for(let i=0;i<state.surfaces.length;i++){
      vertexX.push(x);
      x += state.surfaces[i].t;
    }
    const sensorX = x;

    // Ray A: small field angle
    const ang = (1 * Math.PI/180); // 1 deg
    const rA = traceRayGlobal(0, ang);
    if(!rA.ok) return { efl:null, bfl:null };

    // Approx: image height = ySensor at sensor plane.
    // For object at infinity: y = f * tan(theta)  => f ≈ y / tan(theta)
    const efl = Math.abs(rA.ySensor / Math.tan(ang));

    // BFL: approximate where paraxial ray crosses axis after last vertex
    // Ray B: on-axis angle 0, starting at y=1mm
    const rB = traceRayGlobal(1.0, 0);
    if(!rB.ok) return { efl, bfl:null };

    // last segment: take final direction at last surface output (second last pt to sensor pt)
    const p1 = rB.pts[rB.pts.length - 2];
    const p2 = rB.pts[rB.pts.length - 1];
    const dx = (p2.x - p1.x);
    const dy = (p2.y - p1.y);
    if(Math.abs(dy) < 1e-12) return { efl, bfl:null };

    // line from p1 to axis y=0: y = p1.y + t*(dy), set 0 => t = -p1.y/dy
    const t = -p1.y / dy;
    const xCross = p1.x + t*dx;

    const lastVertex = vertexX[vertexX.length - 1];
    const bfl = xCross - lastVertex; // distance from last vertex to focus

    return { efl, bfl };
  }

  // -------------------- Rendering --------------------
  function setStatus(msg){
    ui.status.textContent = msg;
  }

  function clearLensCanvas(){
    const W = canvasLens.width, H = canvasLens.height;
    ctxLens.setTransform(1,0,0,1,0,0);
    ctxLens.clearRect(0,0,W,H);
    ctxLens.fillStyle = "#000";
    ctxLens.fillRect(0,0,W,H);
  }

  function drawLens(){
    clearLensCanvas();

    const pxPerMm = num(ui.pxPerMm.value, 6);
    const W = canvasLens.width, H = canvasLens.height;
    const cx = 60; // left margin px
    const cy = H/2;

    const sensorW = num(ui.sensorW.value, 36);
    const sensorH = num(ui.sensorH.value, 24);
    const flange = num(ui.flange.value, 52);

    // compute vertex positions
    const vertexX = [];
    let x = 0;
    for(let i=0;i<state.surfaces.length;i++){
      vertexX.push(x);
      x += state.surfaces[i].t;
    }
    const sensorX = x;

    // axis
    if(ui.chkAxis.checked){
      ctxLens.strokeStyle = "rgba(255,255,255,.12)";
      ctxLens.lineWidth = 1;
      ctxLens.beginPath();
      ctxLens.moveTo(0, cy);
      ctxLens.lineTo(W, cy);
      ctxLens.stroke();
    }

    // draw sensor plane and PL flange reference
    const sx = cx + sensorX * pxPerMm;
    ctxLens.strokeStyle = "rgba(42,110,242,.8)";
    ctxLens.lineWidth = 2;
    ctxLens.beginPath();
    ctxLens.moveTo(sx, cy - (sensorH/2)*pxPerMm);
    ctxLens.lineTo(sx, cy + (sensorH/2)*pxPerMm);
    ctxLens.stroke();

    // flange plane (sensorX - flange)
    const fx = cx + (sensorX - flange) * pxPerMm;
    ctxLens.strokeStyle = "rgba(255,255,255,.22)";
    ctxLens.lineWidth = 1.5;
    ctxLens.beginPath();
    ctxLens.moveTo(fx, cy - 120);
    ctxLens.lineTo(fx, cy + 120);
    ctxLens.stroke();

    ctxLens.fillStyle = "rgba(255,255,255,.75)";
    ctxLens.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctxLens.fillText("SENSOR", sx + 6, 18);
    ctxLens.fillText("FLANGE", fx + 6, 34);

    // draw surfaces as arcs/lines
    for(let i=0;i<state.surfaces.length;i++){
      const s = state.surfaces[i];
      const vx = cx + vertexX[i] * pxPerMm;
      const ap = s.ap * pxPerMm;

      // aperture lines
      if(ui.chkApertures.checked){
        ctxLens.strokeStyle = "rgba(255,255,255,.10)";
        ctxLens.lineWidth = 1;
        ctxLens.beginPath();
        ctxLens.moveTo(vx, cy - ap);
        ctxLens.lineTo(vx, cy + ap);
        ctxLens.stroke();
      }

      // surface shape
      ctxLens.strokeStyle = s.isStop ? "rgba(217,91,91,.9)" : "rgba(255,255,255,.75)";
      ctxLens.lineWidth = s.isStop ? 2.5 : 1.6;

      if(Math.abs(s.R) < 1e-9){
        ctxLens.beginPath();
        ctxLens.moveTo(vx, cy - ap);
        ctxLens.lineTo(vx, cy + ap);
        ctxLens.stroke();
      } else {
        // draw circle arc clipped to aperture
        const Rpx = s.R * pxPerMm;
        const cxArc = vx + Rpx; // center in px
        // y range within aperture
        // angle range: y = R*sin(theta), x = R*cos(theta) relative to center
        const yMax = clamp(ap / Math.abs(Rpx), -1, 1);
        const a = Math.asin(yMax);
        // For sign, we want arc near vertex (leftmost/rightmost)
        // We'll just draw a full arc section symmetric.
        ctxLens.beginPath();
        ctxLens.arc(cxArc, cy, Math.abs(Rpx), Math.PI - a, Math.PI + a, false);
        ctxLens.stroke();
      }

      // label
      ctxLens.fillStyle = "rgba(255,255,255,.55)";
      ctxLens.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctxLens.fillText(`#${i+1}`, vx - 10, cy - ap - 8);
    }

    // rays
    const fieldDeg = num(ui.fieldDeg.value, 10);
    const ang = fieldDeg * Math.PI/180;
    const rayCount = clamp(Math.floor(num(ui.rayCount.value, 17)), 3, 61);

    // stop-aware: pick stop semi-diameter to fill
    let stopIdx = state.surfaces.findIndex(s => s.isStop);
    if(stopIdx < 0) stopIdx = Math.floor(state.surfaces.length/2);
    const stopAp = state.surfaces[stopIdx]?.ap ?? 10;

    let vignetteAny = false;
    for(let r=0;r<rayCount;r++){
      const t = (rayCount === 1) ? 0.5 : (r/(rayCount-1));
      const y0 = ui.chkStops.checked
        ? ( (t*2-1) * stopAp )     // fill stop
        : ( (t*2-1) * 10 );        // default bundle

      const tr = traceRayGlobal(y0, ang);
      if(!tr.ok){
        vignetteAny = true;
      }

      ctxLens.strokeStyle = tr.ok ? "rgba(90,160,255,.75)" : "rgba(217,91,91,.75)";
      ctxLens.lineWidth = 1;
      ctxLens.beginPath();

      // start point far left
      const startX = cx + ( (vertexX[0] ?? 0) - 200 ) * pxPerMm;
      ctxLens.moveTo(startX, cy - y0*pxPerMm);

      for(const p of tr.pts){
        const px = cx + p.x * pxPerMm;
        const py = cy - p.y * pxPerMm;
        ctxLens.lineTo(px, py);
      }
      ctxLens.stroke();
    }

    state.last.vignette = vignetteAny;

    // update badges
    const { efl, bfl } = computeEflBfl();
    state.last.efl = efl;
    state.last.bfl = bfl;

    ui.efl.textContent = (efl && Number.isFinite(efl)) ? `${efl.toFixed(2)} mm` : "—";
    ui.bfl.textContent = (bfl && Number.isFinite(bfl)) ? `${bfl.toFixed(2)} mm` : "—";
    ui.vig.textContent = vignetteAny ? "YES" : "NO";
  }

  // -------------------- Table UI --------------------
  function rowHtml(i, s){
    const glassKeys = Object.keys(GLASS_DB);
    const opts = glassKeys.map(k => `<option value="${k}" ${k===s.glass?"selected":""}>${k}</option>`).join("");
    return `
      <tr data-i="${i}">
        <td>${i+1}</td>
        <td><input class="cell" data-k="R" type="number" step="0.1" value="${s.R}"></td>
        <td><input class="cell" data-k="t" type="number" step="0.01" value="${s.t}"></td>
        <td><input class="cell" data-k="ap" type="number" step="0.1" value="${s.ap}"></td>
        <td>
          <select class="cell" data-k="glass">${opts}</select>
        </td>
        <td>
          <label class="miniChk">
            <input class="cellStop" type="checkbox" ${s.isStop?"checked":""}>
            stop
          </label>
        </td>
        <td class="right">
          <button class="rowBtn" data-act="up">↑</button>
          <button class="rowBtn" data-act="dn">↓</button>
          <button class="rowBtn" data-act="del">del</button>
        </td>
      </tr>
    `;
  }

  function renderTable(){
    ui.tbody.innerHTML = state.surfaces.map((s,i)=>rowHtml(i,s)).join("");

    // inputs
    ui.tbody.querySelectorAll(".cell").forEach(el=>{
      el.addEventListener("input", () => {
        const tr = el.closest("tr");
        const i = Number(tr.dataset.i);
        const k = el.dataset.k;
        if(k === "glass") state.surfaces[i][k] = el.value;
        else state.surfaces[i][k] = num(el.value, state.surfaces[i][k]);
        drawLens();
      });
    });

    ui.tbody.querySelectorAll(".cellStop").forEach(el=>{
      el.addEventListener("change", () => {
        const tr = el.closest("tr");
        const i = Number(tr.dataset.i);
        // allow only ONE stop (clean)
        state.surfaces.forEach((s,idx)=> s.isStop = (idx === i) ? el.checked : false);
        renderTable();
        drawLens();
      });
    });

    ui.tbody.querySelectorAll(".rowBtn").forEach(btn=>{
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const i = Number(tr.dataset.i);
        const act = btn.dataset.act;

        if(act === "del"){
          state.surfaces.splice(i,1);
        } else if(act === "up" && i>0){
          const tmp = state.surfaces[i-1];
          state.surfaces[i-1] = state.surfaces[i];
          state.surfaces[i] = tmp;
        } else if(act === "dn" && i < state.surfaces.length-1){
          const tmp = state.surfaces[i+1];
          state.surfaces[i+1] = state.surfaces[i];
          state.surfaces[i] = tmp;
        }
        renderTable();
        drawLens();
      });
    });

    // style mini checkbox labels inside table
    ui.tbody.querySelectorAll(".miniChk").forEach(l=>{
      l.style.display = "inline-flex";
      l.style.gap = "6px";
      l.style.alignItems = "center";
      l.style.color = "rgba(255,255,255,.62)";
      l.style.fontSize = "12px";
    });
    ui.tbody.querySelectorAll("input.cell").forEach(inp=>{
      inp.style.width = "100%";
      inp.style.padding = "6px 8px";
      inp.style.borderRadius = "10px";
      inp.style.border = "1px solid rgba(255,255,255,.14)";
      inp.style.background = "rgba(0,0,0,.25)";
      inp.style.color = "rgba(255,255,255,.92)";
      inp.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
    });
    ui.tbody.querySelectorAll("select.cell").forEach(sel=>{
      sel.style.width = "100%";
      sel.style.padding = "6px 8px";
      sel.style.borderRadius = "10px";
      sel.style.border = "1px solid rgba(255,255,255,.14)";
      sel.style.background = "rgba(0,0,0,.25)";
      sel.style.color = "rgba(255,255,255,.92)";
      sel.style.fontFamily = "ui.monospace";
    });
  }

  // -------------------- Modal (element insert) --------------------
  function openModal(){
    ui.modal.classList.remove("hidden");
    ui.elAfter.value = String(clamp(num(ui.elAfter.value, 0), 0, Math.max(0, state.surfaces.length)));
  }
  function closeModal(){
    ui.modal.classList.add("hidden");
  }

  function insertElement(){
    const type = ui.elType.value;
    const after = clamp(Math.floor(num(ui.elAfter.value,0)), 0, state.surfaces.length);
    const ap = Math.max(0.1, num(ui.elAp.value, 18));
    const gap = Math.max(0.0, num(ui.elGap.value, 2));

    const R1 = num(ui.elR1.value, 60);
    const T1 = Math.max(0.01, num(ui.elT1.value, 6));
    const G1 = ui.elG1.value;

    const R2 = num(ui.elR2.value, -60);
    const R3 = num(ui.elR3.value, -120);
    const T2 = Math.max(0.01, num(ui.elT2.value, 4));
    const G2 = ui.elG2.value;

    const stopMode = ui.elStopMode.value;

    const block = [];
    if(type === "singlet"){
      block.push({ R: R1, t: T1, ap, glass: G1, isStop:false });
      block.push({ R: R2, t: gap, ap, glass: "AIR", isStop: (stopMode==="atR2") });
    } else {
      // achromat: R1 (glass1) -> R2 (glass2) -> R3 (air)
      block.push({ R: R1, t: T1, ap, glass: G1, isStop:false });
      block.push({ R: R2, t: T2, ap, glass: G2, isStop: (stopMode==="atR2") });
      block.push({ R: R3, t: gap, ap, glass: "AIR", isStop:false });
    }

    state.surfaces.splice(after, 0, ...block);
    // ensure only one stop
    let found = false;
    state.surfaces.forEach(s=>{
      if(s.isStop){
        if(!found){ found = true; }
        else s.isStop = false;
      }
    });

    closeModal();
    renderTable();
    drawLens();
  }

  // -------------------- JSON IO --------------------
  function exportJson(){
    const payload = {
      meta: { name: "TVL Lens Builder export", t: new Date().toISOString() },
      sensor: {
        w: num(ui.sensorW.value, 36),
        h: num(ui.sensorH.value, 24),
        flange: num(ui.flange.value, 52),
      },
      surfaces: deepClone(state.surfaces),
      chart: { url: state.chart.url, mode: state.chart.mode }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tvl_lens_builder.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("exported json");
  }

  function importJsonText(txt){
    const j = JSON.parse(txt);

    if(j.sensor){
      ui.sensorW.value = j.sensor.w ?? ui.sensorW.value;
      ui.sensorH.value = j.sensor.h ?? ui.sensorH.value;
      ui.flange.value  = j.sensor.flange ?? ui.flange.value;
    }
    if(Array.isArray(j.surfaces)){
      state.surfaces = j.surfaces.map(s => ({
        R: num(s.R, 0),
        t: Math.max(0.001, num(s.t, 1)),
        ap: Math.max(0.1, num(s.ap, 10)),
        glass: (s.glass in GLASS_DB) ? s.glass : "AIR",
        isStop: !!s.isStop
      }));
      // enforce single stop
      let found = false;
      state.surfaces.forEach(s=>{
        if(s.isStop){
          if(!found) found = true;
          else s.isStop = false;
        }
      });
    }
    if(j.chart?.url){
      state.chart.url = j.chart.url;
      // don't auto-load if it fails; but we try
      loadChartFromUrl(state.chart.url);
    }
    if(j.chart?.mode){
      state.chart.mode = j.chart.mode;
    }

    renderTable();
    drawLens();
    drawChart();
    setStatus("imported json");
  }

  // -------------------- Events --------------------
  function wire(){
    // controls rerender
    ["sensorW","sensorH","flange","fieldDeg","rayCount","pxPerMm"].forEach(id=>{
      ui[id].addEventListener("input", () => drawLens());
    });
    ["chkStops","chkApertures","chkAxis"].forEach(id=>{
      ui[id].addEventListener("change", () => drawLens());
    });

    ui.btnNew.addEventListener("click", () => {
      state.surfaces = [];
      renderTable();
      drawLens();
      setStatus("cleared");
    });

    ui.btnLoadDemo.addEventListener("click", () => {
      const p = presetDemo();
      ui.sensorW.value = p.sensor.w;
      ui.sensorH.value = p.sensor.h;
      ui.flange.value  = p.sensor.flange;
      state.surfaces = deepClone(p.surfaces);
      renderTable();
      drawLens();
      setStatus(p.meta.name);
    });

    ui.btnLoadOmit.addEventListener("click", () => {
      const p = presetOmit50();
      ui.sensorW.value = p.sensor.w;
      ui.sensorH.value = p.sensor.h;
      ui.flange.value  = p.sensor.flange;
      state.surfaces = deepClone(p.surfaces);
      renderTable();
      drawLens();
      setStatus(p.meta.name);
    });

    ui.btnAddSurf.addEventListener("click", () => {
      state.surfaces.push({ R: 0, t: 5, ap: 15, glass:"AIR", isStop:false });
      renderTable();
      drawLens();
      setStatus("added surface");
    });

    ui.btnAddElement.addEventListener("click", openModal);
    ui.btnCloseModal.addEventListener("click", closeModal);
    ui.modal.addEventListener("click", (e) => {
      if(e.target === ui.modal) closeModal();
    });
    ui.btnInsertElement.addEventListener("click", insertElement);

    ui.btnExport.addEventListener("click", exportJson);

    ui.btnImport.addEventListener("click", () => ui.fileJson.click());
    ui.fileJson.addEventListener("change", async () => {
      const f = ui.fileJson.files?.[0];
      if(!f) return;
      const txt = await f.text();
      importJsonText(txt);
      ui.fileJson.value = "";
    });

    // chart load
    ui.btnLoadChart.addEventListener("click", () => {
      const u = prompt("Chart URL (GitHub RAW / Pages).", state.chart.url || DEFAULT_CHART_URL);
      if(!u) return;
      loadChartFromUrl(u.trim());
    });

    ui.btnPickChart.addEventListener("click", () => ui.fileChart.click());
    ui.fileChart.addEventListener("change", () => {
      const f = ui.fileChart.files?.[0];
      if(!f) return;
      loadChartFromFile(f);
      ui.fileChart.value = "";
    });

    ui.btnFit.addEventListener("click", () => { state.chart.mode="fit"; drawChart(); });
    ui.btnFill.addEventListener("click", () => { state.chart.mode="fill"; drawChart(); });
    ui.btn1to1.addEventListener("click", () => { state.chart.mode="1to1"; drawChart(); });

    ui.btnFullscreenPreview.addEventListener("click", async () => {
      // request fullscreen on preview pane canvas parent
      const pane = canvasPrev.closest(".pane");
      if(!pane) return;
      if(document.fullscreenElement){
        await document.exitFullscreen();
      } else {
        await pane.requestFullscreen();
      }
    });

    // handle resize: keep crisp render
    const ro = new ResizeObserver(() => {
      // keep fixed internal res to avoid weird scaling
      // you can change these to match your preferred base (960x540)
      canvasLens.width = 960; canvasLens.height = 540;
      canvasPrev.width = 960; canvasPrev.height = 540;
      drawLens();
      drawChart();
    });
    ro.observe(canvasLens);
    ro.observe(canvasPrev);
  }

  // -------------------- boot --------------------
  function boot(){
    // initial empty lens
    renderTable();
    drawLens();

    // auto-load default chart (if file exists)
    if(DEFAULT_CHART_URL){
      loadChartFromUrl(DEFAULT_CHART_URL);
    } else {
      drawChart();
    }

    wire();
    setStatus("ready");
  }

  boot();
})();
