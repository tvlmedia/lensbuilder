/* Meridional Raytracer (2D) — TVL MVP
   - Optical axis: +x, height: y
   - Surfaces: spherical (R!=0) or plane (R=0)
   - Thickness t: distance to next surface vertex (along x)
   - Aperture ap: clear semi-diameter at surface
   - Glass column = medium AFTER the surface (like your current model)
   - Stop-aware ray sampling: rays are generated to fill the first STOP surface
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

let selectedIndex = 0;

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

function demoLens() {
  return {
    name: "No name",
    surfaces: [
      { type:"OBJ", R:0,   t:10.0,  ap:22.0, glass:"AIR",   stop:false },
      { type:"1",   R:42.0,t:10.0,  ap:22.0, glass:"LASF35",stop:false },
      { type:"2",   R:-140.0,t:10.0,ap:21.0, glass:"AIR",   stop:false },
      { type:"3",   R:-30.0,t:10.0, ap:19.0, glass:"LASFN31",stop:false },
      { type:"4",   R:65.0,t:10.0,  ap:14.0, glass:"AIR",   stop:true  },
      { type:"5",   R:12.42,t:10.0, ap:8.5,  glass:"AIR",   stop:false },
      { type:"AST", R:0,   t:6.4,   ap:8.5,  glass:"AIR",   stop:false },
      { type:"7",   R:-18.93,t:10.0,ap:11.0, glass:"LF5",   stop:false },
      { type:"8",   R:59.6,t:10.0,  ap:13.0, glass:"LASFN31",stop:false },
      { type:"9",   R:-40.49,t:10.0,ap:13.0, glass:"AIR",   stop:false },
      { type:"IMS", R:0,   t:0.0,   ap:12.0, glass:"AIR",   stop:false },
    ],
  };
}

let lens = demoLens();

// -------------------- table + selection --------------------
function clampSelected() {
  selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));
}

function enforceSingleStop(changedIndex) {
  // only one stop allowed (first match)
  if (!lens.surfaces[changedIndex]?.stop) return;
  lens.surfaces.forEach((s, i) => {
    if (i !== changedIndex) s.stop = false;
  });
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
    buildTable(); // refresh checkboxes
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

  if (Math.abs(R) < 1e-9) {
    const t = (vx - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    const hit = add(ray.p, mul(ray.d, t));
    if (Math.abs(hit.y) > ap + 1e-9) return { hit, t, vignetted:true, normal:{x:-1,y:0} };
    return { hit, t, vignetted:false, normal:{x:-1,y:0} };
  }

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

  const xStart = (surfaces[0]?.vx ?? 0) - 30;

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

function estimateEflBfl(surfaces, wavePreset) {
  const rays = [
    { p:{x: surfaces[0].vx - 30, y: 1.0}, d: normalize({x:1,y:0}) },
    { p:{x: surfaces[0].vx - 30, y: 2.0}, d: normalize({x:1,y:0}) },
  ];
  const traces = rays.map(r => traceRayThroughLens(structuredClone(r), surfaces, wavePreset));
  if (traces.some(t=>t.vignetted||t.tir)) return { efl:null, bfl:null };

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
  const bfl = xFocal - lastVx;
  const efl = bfl;
  return { efl, bfl };
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
  const p2 = worldToScreen({x: 600, y:0}, world);
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

  const fieldAngle = Number(ui.fieldAngle.value || 0);
  const rayCount = Number(ui.rayCount.value || 31);
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
  ui.efl.textContent = `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
  ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
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

  const sensorAp = Math.max(5, last?.ap ?? 12);
  drawSensor(world, sensorX, sensorAp);

  drawTitleOverlay(`${lens.name} • sensorX=${sensorX.toFixed(2)}mm`);
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
$("#btnAdd").addEventListener("click", ()=>{
  insertAfterSelected({
    type: "",
    R: 0,
    t: 5.0,
    ap: 12.0,
    glass: "AIR",
    stop: false
  });
});

$("#btnAddElement").addEventListener("click", ()=>{
  clampSelected();

  // Insert AFTER selected, but never after IMS (then insert before IMS)
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

$("#btnDuplicate").addEventListener("click", ()=>{
  clampSelected();
  const s = lens.surfaces[selectedIndex];
  if (!s) return;
  const copy = structuredClone(s);
  lens.surfaces.splice(selectedIndex + 1, 0, copy);
  selectedIndex = selectedIndex + 1;
  buildTable();
  renderAll();
});

$("#btnMoveUp").addEventListener("click", ()=>{
  clampSelected();
  if (selectedIndex <= 0) return;
  // don't move OBJ above 0
  if (selectedIndex === 1 && isProtectedIndex(0)) { /* ok */ }
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex-1];
  lens.surfaces[selectedIndex-1] = a;
  selectedIndex -= 1;
  buildTable();
  renderAll();
});

$("#btnMoveDown").addEventListener("click", ()=>{
  clampSelected();
  if (selectedIndex >= lens.surfaces.length-1) return;
  const a = lens.surfaces[selectedIndex];
  lens.surfaces[selectedIndex] = lens.surfaces[selectedIndex+1];
  lens.surfaces[selectedIndex+1] = a;
  selectedIndex += 1;
  buildTable();
  renderAll();
});

$("#btnRemove").addEventListener("click", ()=>{
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

$("#btnReset").addEventListener("click", ()=>{
  lens = demoLens();
  selectedIndex = 0;
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

    lens.name = lens.name || "No name";
    lens.surfaces = lens.surfaces.map(s => ({
      type: String(s.type ?? ""),
      R: Number(s.R ?? 0),
      t: Number(s.t ?? 0),
      ap: Number(s.ap ?? 10),
      glass: String(s.glass ?? "AIR"),
      stop: Boolean(s.stop ?? false),
    }));

    // enforce single stop on load
    const firstStop = lens.surfaces.findIndex(s=>s.stop);
    if (firstStop >= 0) {
      lens.surfaces.forEach((s,i)=>{ if (i!==firstStop) s.stop=false; });
    }

    selectedIndex = 0;
    buildTable();
    renderAll();
  }catch(err){
    ui.footerWarn.textContent = `Load failed: ${err.message}`;
  }finally{
    e.target.value = "";
  }
});

// rerender on controls
["fieldAngle","rayCount","wavePreset","sensorOffset","renderScale"].forEach(id=>{
  $("#"+id).addEventListener("input", renderAll);
  $("#"+id).addEventListener("change", renderAll);
});
window.addEventListener("resize", renderAll);

// init
buildTable();
bindViewControls();
renderAll();
