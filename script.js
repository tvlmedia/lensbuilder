/* Meridional Raytracer (2D)
   - Optical axis: +x
   - Height: y
   - Surfaces: spherical (radius R) or plane (R=0)
   - Thickness: distance along x to next surface vertex
   - Aperture: clear semi-diameter (|y| must be <= aperture at intersection point)
   - Glass: simple n at chosen wavelength (approx via Abbe-ish tweak)
*/

const $ = (sel) => document.querySelector(sel);

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

const ui = {
  tbody: $("#surfTbody"),
  status: $("#statusText"),
  efl: $("#badgeEfl"),
  bfl: $("#badgeBfl"),
  vig: $("#badgeVig"),
  footerWarn: $("#footerWarn"),
  fieldAngle: $("#fieldAngle"),
  rayCount: $("#rayCount"),
  wavePreset: $("#wavePreset"),
  sensorOffset: $("#sensorOffset"),
  renderScale: $("#renderScale"),
};

const GLASS_DB = {
  AIR: { nd: 1.0, Vd: 999.0 },
  // A couple of typical catalog-like placeholders (names you can rename)
  BK7: { nd: 1.5168, Vd: 64.17 },
  F2:  { nd: 1.6200, Vd: 36.37 },
  SF10:{ nd: 1.7283, Vd: 28.41 },
  // Your screenshot had these-style tokens; we map them to plausible nd/Vd:
  LASF35: { nd: 1.8061, Vd: 25.4 },
  LASFN31:{ nd: 1.8052, Vd: 25.3 },
  LF5:    { nd: 1.5800, Vd: 40.0 },
};

function glassN(glassName, preset /* d,g,c */) {
  const g = GLASS_DB[glassName] || GLASS_DB.AIR;
  if (glassName === "AIR") return 1.0;

  // Super-simplified wavelength adjustment:
  // shorter wavelength => slightly higher n, longer => slightly lower
  // Abbe gives dispersion strength; we use Vd as a dampener.
  const base = g.nd;
  const strength = 1.0 / Math.max(10.0, g.Vd);
  if (preset === "g") return base + 35.0 * strength;  // blue-ish
  if (preset === "c") return base - 20.0 * strength;  // red-ish
  return base; // d-line
}

// -------------------- Demo lens --------------------
function demoLens() {
  return {
    name: "No name",
    surfaces: [
      { type:"OBJ", R:0,   t:10.0,  ap:22.0, glass:"AIR", stop:false },
      { type:"1",   R:42.0,t:10.0,  ap:22.0, glass:"LASF35", stop:false },
      { type:"2",   R:-140.0,t:10.0,ap:21.0, glass:"AIR", stop:false },
      { type:"3",   R:-30.0,t:10.0, ap:19.0, glass:"LASFN31", stop:false },
      { type:"4",   R:65.0,t:10.0,  ap:14.0, glass:"AIR", stop:true  }, // stop here
      { type:"5",   R:12.42,t:10.0, ap:8.5,  glass:"AIR", stop:false },
      { type:"AST", R:0,   t:6.4,   ap:8.5,  glass:"AIR", stop:false },
      { type:"7",   R:-18.93,t:10.0,ap:11.0, glass:"LF5", stop:false },
      { type:"8",   R:59.6,t:10.0,  ap:13.0, glass:"LASFN31", stop:false },
      { type:"9",   R:-40.49,t:10.0,ap:13.0, glass:"AIR", stop:false },
      { type:"IMS", R:0,   t:0.0,   ap:12.0, glass:"AIR", stop:false },
    ],
  };
}

let lens = demoLens();

// -------------------- UI table --------------------
function buildTable() {
  ui.tbody.innerHTML = "";

  lens.surfaces.forEach((s, idx) => {
    const tr = document.createElement("tr");

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

  const s = lens.surfaces[i];
  if (!s) return;

  if (k === "stop") {
    s.stop = el.checked;
  } else if (k === "glass") {
    s.glass = el.value;
  } else if (k === "type") {
    s.type = el.value;
  } else {
    s[k] = Number(el.value);
  }

  renderAll();
}

// -------------------- Geometry + ray tracing --------------------
function normalize(v) {
  const m = Math.hypot(v.x, v.y);
  if (m < 1e-12) return {x:0, y:0};
  return {x:v.x/m, y:v.y/m};
}
function dot(a,b){ return a.x*b.x + a.y*b.y; }
function sub(a,b){ return {x:a.x-b.x, y:a.y-b.y}; }
function add(a,b){ return {x:a.x+b.x, y:a.y+b.y}; }
function mul(a, s){ return {x:a.x*s, y:a.y*s}; }

function refract(I, N, n1, n2) {
  // N must point into incident medium.
  I = normalize(I);
  N = normalize(N);

  // Ensure N faces against I so cosi is positive
  if (dot(I, N) > 0) N = mul(N, -1);

  const cosi = -dot(N, I);
  const eta = n1 / n2;
  const k = 1 - eta*eta*(1 - cosi*cosi);
  if (k < 0) return null; // TIR
  const T = add(mul(I, eta), mul(N, (eta*cosi - Math.sqrt(k))));
  return normalize(T);
}

function intersectSurface(ray, surf) {
  // ray: {p:{x,y}, d:{x,y}}
  // surf: {vx, R, ap}
  const vx = surf.vx;
  const R = surf.R;
  const ap = Math.max(0, surf.ap);

  // Plane
  if (Math.abs(R) < 1e-9) {
    // x = vx
    const t = (vx - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    const hit = add(ray.p, mul(ray.d, t));
    if (Math.abs(hit.y) > ap + 1e-9) return { hit, t, vignetted:true, normal:{x:-1,y:0} };
    // normal for a plane at x=vx: point left
    return { hit, t, vignetted:false, normal:{x:-1,y:0} };
  }

  // Sphere
  const cx = vx + R;
  const cy = 0;
  const rad = Math.abs(R);

  // Solve |(p + t d) - c|^2 = rad^2
  const px = ray.p.x - cx;
  const py = ray.p.y - cy;
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

  // choose smallest positive
  let t = null;
  if (t1 > 1e-9 && t2 > 1e-9) t = Math.min(t1, t2);
  else if (t1 > 1e-9) t = t1;
  else if (t2 > 1e-9) t = t2;
  else return null;

  const hit = add(ray.p, mul(ray.d, t));

  // aperture clip at intersection height
  const vignetted = (Math.abs(hit.y) > ap + 1e-9);

  // outward normal from center to point
  const Nout = normalize({x: hit.x - cx, y: hit.y - cy});
  // For refraction we’ll correct orientation inside refract()
  return { hit, t, vignetted, normal: Nout };
}

function computeVertices(surfaces) {
  // set vx for each surface (vertex x position)
  let x = 0;
  for (let i=0;i<surfaces.length;i++){
    surfaces[i].vx = x;
    x += Number(surfaces[i].t || 0);
  }
  return x; // total length to IMS vertex + thickness chain
}

function traceRayThroughLens(ray, surfaces, wavePreset) {
  // Determine n on each side from "glass" column:
  // Convention: surface i has a "glass" entry = medium AFTER the surface.
  // Medium BEFORE surface i is glass of previous surface, or AIR at start.
  const pts = [{ x: ray.p.x, y: ray.p.y }];
  let vignetted = false;
  let tir = false;

  let nBefore = 1.0;

  for (let i=0;i<surfaces.length;i++){
    const s = surfaces[i];

    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) {
      // miss (ray doesn't intersect) => treat as vignette/miss
      vignetted = true;
      break;
    }

    pts.push(hitInfo.hit);

    if (hitInfo.vignetted) {
      vignetted = true;
      break;
    }

    const nAfter = glassN(s.glass, wavePreset);

    // If same medium, just propagate direction unchanged (still record)
    if (Math.abs(nAfter - nBefore) < 1e-9) {
      // move ray origin to hit and continue
      ray = { p: hitInfo.hit, d: ray.d };
      nBefore = nAfter;
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
    if (!newDir) {
      tir = true;
      break;
    }

    ray = { p: hitInfo.hit, d: newDir };
    nBefore = nAfter;
  }

  return { pts, vignetted, tir, endRay: ray };
}

function buildRays(surfaces, fieldAngleDeg, count) {
  const firstAp = Math.max(1e-3, surfaces[0]?.ap ?? 10);
  const hMax = firstAp * 0.98;
  const n = Math.max(3, Math.min(101, count|0));
  const theta = (fieldAngleDeg * Math.PI) / 180;

  const rays = [];
  for (let k=0;k<n;k++){
    const a = (k/(n-1))*2 - 1;
    const y0 = a * hMax;
    const x0 = surfaces[0].vx - 30; // start left of first surface
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });
    rays.push({ p:{x:x0,y:y0}, d:dir });
  }
  return rays;
}

// Estimate EFL/BFL roughly using paraxial-ish approach on axis
function estimateEflBfl(surfaces, wavePreset) {
  // Two small-angle rays on-axis to estimate focal length at image plane:
  // We shoot two rays with small heights, get where they cross axis after last surface.
  const fieldAngleDeg = 0;
  const rays = [
    { p:{x: surfaces[0].vx - 30, y: 1.0}, d: normalize({x:1,y:0}) },
    { p:{x: surfaces[0].vx - 30, y: 2.0}, d: normalize({x:1,y:0}) },
  ];
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), surfaces, wavePreset));
  if (traces.some(t=>t.vignetted||t.tir)) return { efl:null, bfl:null };

  // Use the end rays (after last surface) and compute intersection with y=0 (axis)
  // y = y0 + t*dy => t = -y0/dy. x = x0 + t*dx
  const xs = [];
  for (const tr of traces){
    const er = tr.endRay;
    const dy = er.d.y;
    if (Math.abs(dy) < 1e-9) continue;
    const t = -er.p.y / dy;
    const xCross = er.p.x + t*er.d.x;
    if (Number.isFinite(xCross)) xs.push(xCross);
  }
  if (xs.length < 1) return { efl:null, bfl:null };

  const xFocal = xs.reduce((a,b)=>a+b,0)/xs.length;
  const lastVx = surfaces[surfaces.length-1].vx;
  const bfl = xFocal - lastVx; // back focal length from last vertex
  // For EFL we’ll approximate EFL ~ distance from principal plane is unknown.
  // But as a rough sanity value: treat last principal plane near last group => EFL ~ bfl
  const efl = bfl;

  return { efl, bfl };
}

// -------------------- Drawing --------------------
let view = {
  panX: 0,
  panY: 0,
  zoom: 1.0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

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
  const base = Number(ui.renderScale.value) * 3.2; // mm->px baseline
  const s = base * view.zoom;
  return { cx, cy, s };
}

function drawAxes(world) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d0d0d0";
  ctx.beginPath();
  // x-axis
  const p1 = worldToScreen({x:-200, y:0}, world);
  const p2 = worldToScreen({x: 400, y:0}, world);
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

  // Plane
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

  // sample curve by y
  const steps = 80;
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
    ctx.globalAlpha = tr.vignetted ? 0.15 : 0.9;

    ctx.beginPath();
    const p0 = worldToScreen(tr.pts[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<tr.pts.length;i++){
      const p = worldToScreen(tr.pts[i], world);
      ctx.lineTo(p.x, p.y);
    }

    // extend to sensor plane
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

function drawSensor(world, sensorX, ap) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.setLineDash([6,6]);
  const a = worldToScreen({x:sensorX, y:-ap}, world);
  const b = worldToScreen({x:sensorX, y: ap}, world);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTitleOverlay(world, text) {
  ctx.save();
  ctx.font = "14px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
  ctx.fillStyle = "#333";
  ctx.fillText(text, 14, 20);
  ctx.restore();
}

// -------------------- Main render --------------------
function renderAll() {
  ui.footerWarn.textContent = "";

  computeVertices(lens.surfaces);

  const fieldAngle = Number(ui.fieldAngle.value || 0);
  const rayCount = Number(ui.rayCount.value || 31);
  const wavePreset = ui.wavePreset.value;
  const sensorOffset = Number(ui.sensorOffset.value || 0);

  // Determine sensor plane at last surface vertex + offset
  const last = lens.surfaces[lens.surfaces.length - 1];
  const sensorX = (last?.vx ?? 0) + sensorOffset;

  // Rays
  const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), lens.surfaces, wavePreset));

  // Metrics
  const vCount = traces.filter(t => t.vignetted).length;
  const tirCount = traces.filter(t => t.tir).length;
  const vigPct = Math.round((vCount / traces.length) * 100);

  const { efl, bfl } = estimateEflBfl(lens.surfaces, wavePreset);
  ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
  ui.vig.textContent = `Vignette: ${vigPct}%`;

  if (tirCount > 0) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;

  ui.status.textContent = `Traced ${traces.length} rays @ ${wavePreset}-preset • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount}`;

  // Draw
  resizeCanvasToCSS();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const world = makeWorldTransform();

  drawAxes(world);
  drawLens(world, lens.surfaces);
  drawRays(world, traces, sensorX);

  // sensor ap: take last aperture as a visual height
  const sensorAp = Math.max(5, last?.ap ?? 12);
  drawSensor(world, sensorX, sensorAp);

  drawTitleOverlay(world, `${lens.name} • sensorX=${sensorX.toFixed(2)}mm`);
}

// -------------------- Interactions (pan/zoom) --------------------
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

// -------------------- Buttons: add/remove/save/load --------------------
$("#btnAdd").addEventListener("click", ()=>{
  lens.surfaces.splice(lens.surfaces.length - 1, 0, {
    type: String(lens.surfaces.length-1),
    R: 0,
    t: 5.0,
    ap: 12.0,
    glass: "AIR",
    stop: false
  });
  buildTable();
  renderAll();
});

$("#btnRemove").addEventListener("click", ()=>{
  if (lens.surfaces.length <= 2) return;
  // remove the one before IMS if exists
  lens.surfaces.splice(lens.surfaces.length - 2, 1);
  buildTable();
  renderAll();
});

$("#btnReset").addEventListener("click", ()=>{
  lens = demoLens();
  buildTable();
  renderAll();
});

$("#btnSave").addEventListener("click", ()=>{
  const payload = JSON.stringify(lens, null, 2);
  const blob = new Blob([payload], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (lens.name || "lens") + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

$("#fileLoad").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.surfaces)) throw new Error("Invalid JSON format.");
    lens = obj;
    // sanitize
    lens.name = lens.name || "No name";
    lens.surfaces = lens.surfaces.map(s => ({
      type: String(s.type ?? ""),
      R: Number(s.R ?? 0),
      t: Number(s.t ?? 0),
      ap: Number(s.ap ?? 10),
      glass: String(s.glass ?? "AIR"),
      stop: Boolean(s.stop ?? false),
    }));
    buildTable();
    renderAll();
  }catch(err){
    ui.footerWarn.textContent = `Load failed: ${err.message}`;
  }finally{
    e.target.value = "";
  }
});

// Re-render when controls change
["fieldAngle","rayCount","wavePreset","sensorOffset","renderScale"].forEach(id=>{
  $("#"+id).addEventListener("input", renderAll);
  $("#"+id).addEventListener("change", renderAll);
});

window.addEventListener("resize", renderAll);

// -------------------- Init --------------------
buildTable();
bindViewControls();
renderAll();
