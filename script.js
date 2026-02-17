/* TVL — Meridional Raytracer (2D) — Lens Builder + Chart Preview
   - Visible glass drawing (fixes “lens bijna onzichtbaar”)
   - PL mount @ flange distance (default 52mm)
   - Sensor plane + ruler (0–60mm)
   - Chart preview with DEFAULT_CHART_URL + Fit/Fill/1:1 + load URL/file
*/

(() => {
  // ========= CONFIG =========
  // Zet hier je GitHub chart URL (raw / direct image).
  // Voorbeeld: "https://tvlmedia.github.io/lensbuilder/assets/focus_distortion_chart_3x2.png"
  const DEFAULT_CHART_URL = ""; // <-- VUL DIT IN

  // ========= DOM =========
  const $ = (s) => document.querySelector(s);

  const lensCanvas = $("#lensCanvas");
  const lensCtx = lensCanvas.getContext("2d");

  const chartCanvas = $("#chartCanvas");
  const chartCtx = chartCanvas.getContext("2d");

  const ui = {
    sensorW: $("#sensorW"),
    sensorH: $("#sensorH"),
    flange: $("#flange"),
    fieldAngle: $("#fieldAngle"),
    rayCount: $("#rayCount"),
    pxPerMm: $("#pxPerMm"),

    chkStopAware: $("#chkStopAware"),
    chkShowAps: $("#chkShowAps"),
    chkShowAxis: $("#chkShowAxis"),
    chkShowPL: $("#chkShowPL"),

    badgeEfl: $("#badgeEfl"),
    badgeBfl: $("#badgeBfl"),
    badgeVig: $("#badgeVig"),
    status: $("#status"),

    tbody: $("#tbody"),

    btnNew: $("#btnNew"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnAdd: $("#btnAdd"),
    btnAddElement: $("#btnAddElement"),
    btnImport: $("#btnImport"),
    btnExport: $("#btnExport"),

    fileJson: $("#fileJson"),

    btnChartUrl: $("#btnChartUrl"),
    btnChartFile: $("#btnChartFile"),
    fileChart: $("#fileChart"),

    btnChartFit: $("#btnChartFit"),
    btnChartFill: $("#btnChartFill"),
    btnChart11: $("#btnChart11"),
    chartMeta: $("#chartMeta"),

    btnFullscreen: $("#btnFullscreen"),
  };

  // ========= DATA =========
  // OSLO-ish: glass is medium AFTER surface
  const GLASS_DB = {
    AIR: { nd: 1.0, Vd: 999.0 },
    BK7: { nd: 1.5168, Vd: 64.17 },
    F2:  { nd: 1.6200, Vd: 36.37 },
    SF10:{ nd: 1.7283, Vd: 28.41 },
  };

  // surface: { R, t, ap, glassAfter, isStop }
  let surfaces = [];
  let chartImg = null;

  // chart view mode: "fit" | "fill" | "11"
  let chartMode = "fit";

  // ========= HELPERS =========
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, f=0) => {
    const x = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(x) ? x : f;
  };

  function setStatus(msg){
    ui.status.textContent = `Status: ${msg}`;
  }

  function mmToX(mm){
    // sensor plane is x=0, lens is on the left (negative)
    const s = num(ui.pxPerMm.value, 6);
    return Math.round(lensCanvas.width/2 + (mm * s));
  }

  function mmToY(mm){
    const s = num(ui.pxPerMm.value, 6);
    return Math.round(lensCanvas.height/2 - (mm * s));
  }

  // ========= BASIC “SANITY” METRICS (lightweight) =========
  // NOTE: dit is bewust simpel. Je echte raytracer kan hier later terug in,
  // maar de UI + tekenlaag + chart-loader zijn nu alvast “1x goed”.
  function computeEflBflVig(){
    // Placeholder-ish but stable: EFL ~ sum(t) * factor / stopAware fudge
    // (Je oude raytracer kun je hier weer in hangen zonder UI te slopen.)
    const totalLen = surfaces.reduce((a,s)=>a+num(s.t,0),0);
    const stopAware = ui.chkStopAware.checked ? 1.0 : 0.9;
    const efl = clamp(totalLen * 0.85 * stopAware + 25, 10, 300);
    const flange = num(ui.flange.value, 52);
    const bfl = clamp(flange - 19 + (totalLen*0.03), -200, 200);
    const vig = surfaces.some(s => num(s.ap,0) < 5) ? "YES" : "no";
    return { efl, bfl, vig };
  }

  // ========= DRAW — LENS =========
  function drawBackground(){
    lensCtx.clearRect(0,0,lensCanvas.width,lensCanvas.height);
    lensCtx.fillStyle = "#000";
    lensCtx.fillRect(0,0,lensCanvas.width,lensCanvas.height);
  }

  function drawAxis(){
    if(!ui.chkShowAxis.checked) return;
    lensCtx.save();
    lensCtx.strokeStyle = "rgba(255,255,255,.10)";
    lensCtx.lineWidth = 1;
    lensCtx.beginPath();
    lensCtx.moveTo(0, lensCanvas.height/2);
    lensCtx.lineTo(lensCanvas.width, lensCanvas.height/2);
    lensCtx.stroke();
    lensCtx.restore();
  }

  function drawSensorPlaneAndRuler(){
    const x0 = mmToX(0);
    lensCtx.save();
    // sensor plane
    lensCtx.strokeStyle = "rgba(80,170,255,.90)";
    lensCtx.lineWidth = 2;
    lensCtx.beginPath();
    lensCtx.moveTo(x0, 70);
    lensCtx.lineTo(x0, lensCanvas.height-70);
    lensCtx.stroke();

    // ruler 0..60mm to the right
    const top = 40;
    const baseY = 42;
    lensCtx.strokeStyle = "rgba(255,255,255,.22)";
    lensCtx.fillStyle = "rgba(255,255,255,.55)";
    lensCtx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    for(let cm=0; cm<=6; cm++){
      const mm = cm*10;
      const x = mmToX(mm);
      const tick = cm===0 ? 16 : 10;
      lensCtx.beginPath();
      lensCtx.moveTo(x, top);
      lensCtx.lineTo(x, top+tick);
      lensCtx.stroke();
      lensCtx.fillText(`${mm}`, x-6, baseY+28);
      // 1cm ticks (10mm) already, add 1mm micro ticks between
      if(cm<6){
        for(let i=1;i<10;i++){
          const xx = mmToX(mm+i);
          lensCtx.strokeStyle = "rgba(255,255,255,.10)";
          lensCtx.beginPath();
          lensCtx.moveTo(xx, top);
          lensCtx.lineTo(xx, top+6);
          lensCtx.stroke();
          lensCtx.strokeStyle = "rgba(255,255,255,.22)";
        }
      }
    }
    lensCtx.restore();
  }

  function drawPLMount(){
    if(!ui.chkShowPL.checked) return;

    const flange = num(ui.flange.value, 52);
    const xMount = mmToX(-flange);

    lensCtx.save();
    // mount line
    lensCtx.strokeStyle = "rgba(255,120,120,.85)";
    lensCtx.lineWidth = 2;
    lensCtx.beginPath();
    lensCtx.moveTo(xMount, 70);
    lensCtx.lineTo(xMount, lensCanvas.height-70);
    lensCtx.stroke();

    // label
    lensCtx.fillStyle = "rgba(255,160,160,.85)";
    lensCtx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    lensCtx.fillText("PL FLANGE", xMount-44, 62);

    // simple “mount blocks” silhouette (not full CAD, but looks like PL area)
    lensCtx.strokeStyle = "rgba(255,120,120,.35)";
    lensCtx.lineWidth = 1.5;
    lensCtx.strokeRect(xMount-14, lensCanvas.height/2-90, 28, 180);
    lensCtx.strokeRect(xMount-26, lensCanvas.height/2-60, 52, 120);

    lensCtx.restore();
  }

  function drawGlass(){
    // Make the lens visible: subtle glass fill + bright outline
    const showAps = ui.chkShowAps.checked;

    let x = -num(ui.flange.value, 52) - 10; // start a bit left of mount
    for(let i=0;i<surfaces.length;i++){
      const s = surfaces[i];
      const R = num(s.R,0);
      const t = num(s.t,0);
      const ap = num(s.ap,0);

      const xSurf = x;
      const yAp = ap; // semi-height in mm

      // draw aperture line
      if(showAps){
        lensCtx.save();
        lensCtx.strokeStyle = "rgba(255,255,255,.15)";
        lensCtx.lineWidth = 1;
        const xs = mmToX(xSurf);
        lensCtx.beginPath();
        lensCtx.moveTo(xs, mmToY(+yAp));
        lensCtx.lineTo(xs, mmToY(-yAp));
        lensCtx.stroke();
        lensCtx.restore();
      }

      // draw surface curve (spherical approximation)
      // We draw a simple arc-like bezier for readability (not optical-accurate)
      const xs = mmToX(xSurf);
      const sign = R===0 ? 0 : (R>0 ? 1 : -1);
      const bulge = sign===0 ? 0 : clamp(Math.abs(R)/80, 0.6, 2.6) * 18 * sign;

      lensCtx.save();
      // glass body: fill between this and next surface if next exists
      if(i < surfaces.length-1){
        const xn = mmToX(xSurf + t);

        lensCtx.fillStyle = "rgba(255,255,255,.04)";
        lensCtx.strokeStyle = "rgba(255,255,255,.30)";
        lensCtx.lineWidth = 1.5;

        const yTop = mmToY(+yAp);
        const yBot = mmToY(-yAp);

        lensCtx.beginPath();
        // left surface
        lensCtx.moveTo(xs, yTop);
        lensCtx.bezierCurveTo(xs+bulge, yTop, xs+bulge, yBot, xs, yBot);
        // go to next surface
        lensCtx.lineTo(xn, yBot);
        // right surface (mirrored bulge for “thickness block”)
        lensCtx.bezierCurveTo(xn-bulge, yBot, xn-bulge, yTop, xn, yTop);
        lensCtx.closePath();
        lensCtx.fill();
        lensCtx.stroke();
      } else {
        // last surface outline only
        lensCtx.strokeStyle = "rgba(255,255,255,.55)";
        lensCtx.lineWidth = 1.5;
        lensCtx.beginPath();
        lensCtx.moveTo(xs, mmToY(+yAp));
        lensCtx.bezierCurveTo(xs+bulge, mmToY(+yAp), xs+bulge, mmToY(-yAp), xs, mmToY(-yAp));
        lensCtx.stroke();
      }

      // index label
      lensCtx.fillStyle = "rgba(255,255,255,.70)";
      lensCtx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      lensCtx.fillText(`#${i+1}`, xs-10, mmToY(+yAp)+14);

      lensCtx.restore();

      x += t;
    }
  }

  function redraw(){
    drawBackground();
    drawAxis();
    drawSensorPlaneAndRuler();
    drawPLMount();
    drawGlass();

    const { efl, bfl, vig } = computeEflBflVig();
    ui.badgeEfl.textContent = `EFL: ${efl.toFixed(2)} mm`;
    ui.badgeBfl.textContent = `BFL: ${bfl.toFixed(2)} mm`;
    ui.badgeVig.textContent = `Vig: ${vig}`;
  }

  // ========= TABLE =========
  function glassOptionsHtml(selected){
    return Object.keys(GLASS_DB).map(k => {
      const sel = (k===selected) ? "selected" : "";
      return `<option value="${k}" ${sel}>${k}</option>`;
    }).join("");
  }

  function rebuildTable(){
    ui.tbody.innerHTML = surfaces.map((s, idx) => {
      return `
        <tr data-i="${idx}">
          <td>${idx+1}</td>
          <td><input class="inpR" type="number" step="0.01" value="${s.R}"></td>
          <td><input class="inpt" type="number" step="0.01" value="${s.t}"></td>
          <td><input class="inpap" type="number" step="0.01" value="${s.ap}"></td>
          <td>
            <select class="selG">${glassOptionsHtml(s.glassAfter || "AIR")}</select>
          </td>
          <td style="text-align:center">
            <input class="chkStop" type="checkbox" ${s.isStop ? "checked" : ""}>
          </td>
          <td class="rowBtns">
            <button class="btn btnTiny btnRowUp">↑</button>
            <button class="btn btnTiny btnRowDn">↓</button>
            <button class="btn btnTiny btnDanger btnRowDel">del</button>
          </td>
        </tr>
      `;
    }).join("");

    ui.tbody.querySelectorAll("tr").forEach(tr => {
      const i = parseInt(tr.getAttribute("data-i"),10);
      const s = surfaces[i];

      tr.querySelector(".inpR").addEventListener("input", (e)=>{ s.R = num(e.target.value,0); redraw(); });
      tr.querySelector(".inpt").addEventListener("input", (e)=>{ s.t = num(e.target.value,0); redraw(); });
      tr.querySelector(".inpap").addEventListener("input", (e)=>{ s.ap = num(e.target.value,0); redraw(); });
      tr.querySelector(".selG").addEventListener("change", (e)=>{ s.glassAfter = e.target.value; redraw(); });

      tr.querySelector(".chkStop").addEventListener("change", (e)=>{
        // only 1 stop
        if(e.target.checked){
          surfaces.forEach((x,ii)=> x.isStop = (ii===i));
        } else {
          s.isStop = false;
        }
        rebuildTable();
        redraw();
      });

      tr.querySelector(".btnRowUp").addEventListener("click", ()=>{
        if(i<=0) return;
        const tmp = surfaces[i-1]; surfaces[i-1]=surfaces[i]; surfaces[i]=tmp;
        rebuildTable(); redraw();
      });
      tr.querySelector(".btnRowDn").addEventListener("click", ()=>{
        if(i>=surfaces.length-1) return;
        const tmp = surfaces[i+1]; surfaces[i+1]=surfaces[i]; surfaces[i]=tmp;
        rebuildTable(); redraw();
      });
      tr.querySelector(".btnRowDel").addEventListener("click", ()=>{
        surfaces.splice(i,1);
        rebuildTable(); redraw();
      });
    });
  }

  // ========= PRESETS =========
  function loadDemo(){
    surfaces = [
      { R:  80, t:  6, ap: 22, glassAfter:"BK7", isStop:false },
      { R: -80, t:  2, ap: 20, glassAfter:"AIR", isStop:false },
      { R:  55, t:  5, ap: 18, glassAfter:"F2",  isStop:false },
      { R: -55, t:  1.5, ap: 16, glassAfter:"AIR", isStop:true  },
      { R:  120, t:  6, ap: 16, glassAfter:"BK7", isStop:false },
      { R: -70,  t:  4, ap: 14, glassAfter:"AIR", isStop:false },
      { R:  90,  t:  8, ap: 14, glassAfter:"SF10",isStop:false },
      { R: -140, t:  0, ap: 14, glassAfter:"AIR", isStop:false },
    ];
    rebuildTable();
    redraw();
    setStatus("demo lens loaded");
  }

  function loadOmit50(){
    // “concept” placeholder preset — jouw echte OMIT JSON kun je importeren
    surfaces = [
      { R:  65, t:  5, ap: 24, glassAfter:"BK7", isStop:false },
      { R: -65, t:  2, ap: 22, glassAfter:"AIR", isStop:false },
      { R:  40, t:  6, ap: 20, glassAfter:"F2",  isStop:false },
      { R: -40, t:  2, ap: 18, glassAfter:"AIR", isStop:true  },
      { R:  75, t:  7, ap: 18, glassAfter:"BK7", isStop:false },
      { R: -90, t:  4, ap: 16, glassAfter:"AIR", isStop:false },
      { R:  55, t:  7, ap: 16, glassAfter:"SF10",isStop:false },
      { R: -120,t:  0, ap: 16, glassAfter:"AIR", isStop:false },
    ];
    rebuildTable();
    redraw();
    setStatus("OMIT 50 preset loaded");
  }

  function clearAll(){
    surfaces = [
      { R: 60, t: 5, ap: 22, glassAfter:"BK7", isStop:false },
      { R:-60, t: 2, ap: 20, glassAfter:"AIR", isStop:true },
      { R:40, t: 8, ap: 18, glassAfter:"F2", isStop:false },
      { R:-90, t: 0, ap: 18, glassAfter:"AIR", isStop:false },
    ];
    rebuildTable();
    redraw();
    setStatus("cleared");
  }

  // ========= JSON IO =========
  function exportJson(){
    const data = {
      meta: { tool: "TVL Meridional Raytracer (2D)", v: 1 },
      sensor: { w: num(ui.sensorW.value,44), h: num(ui.sensorH.value,33) },
      flange: num(ui.flange.value,52),
      params: {
        fieldAngle: num(ui.fieldAngle.value,0),
        rayCount: num(ui.rayCount.value,17),
        pxPerMm: num(ui.pxPerMm.value,6),
        stopAware: !!ui.chkStopAware.checked
      },
      surfaces
    };
    const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tvl_lens.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("exported JSON");
  }

  function importJsonObj(obj){
    if(obj && obj.surfaces && Array.isArray(obj.surfaces)){
      surfaces = obj.surfaces.map(s => ({
        R: num(s.R,0),
        t: num(s.t,0),
        ap: num(s.ap,10),
        glassAfter: s.glassAfter || "AIR",
        isStop: !!s.isStop
      }));
      if(obj.sensor){
        ui.sensorW.value = num(obj.sensor.w, ui.sensorW.value);
        ui.sensorH.value = num(obj.sensor.h, ui.sensorH.value);
      }
      if(obj.flange!=null) ui.flange.value = num(obj.flange, ui.flange.value);

      // ensure single stop
      let stopIdx = surfaces.findIndex(s=>s.isStop);
      if(stopIdx>=0){
        surfaces.forEach((s,i)=> s.isStop = (i===stopIdx));
      }

      rebuildTable();
      redraw();
      setStatus("imported JSON");
    } else {
      setStatus("import failed (no surfaces)");
    }
  }

  // ========= CHART PREVIEW =========
  function drawChart(){
    chartCtx.clearRect(0,0,chartCanvas.width, chartCanvas.height);
    chartCtx.fillStyle = "#000";
    chartCtx.fillRect(0,0,chartCanvas.width, chartCanvas.height);

    if(!chartImg){
      chartCtx.fillStyle = "rgba(255,255,255,.55)";
      chartCtx.font = "14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      chartCtx.fillText("No chart loaded", 18, 28);
      return;
    }

    const cw = chartCanvas.width, ch = chartCanvas.height;
    const iw = chartImg.naturalWidth || chartImg.width;
    const ih = chartImg.naturalHeight || chartImg.height;

    let dw = iw, dh = ih;
    let dx = (cw - dw)/2, dy = (ch - dh)/2;

    if(chartMode === "fit"){
      const s = Math.min(cw/iw, ch/ih);
      dw = iw*s; dh = ih*s;
      dx = (cw - dw)/2; dy = (ch - dh)/2;
    } else if(chartMode === "fill"){
      const s = Math.max(cw/iw, ch/ih);
      dw = iw*s; dh = ih*s;
      dx = (cw - dw)/2; dy = (ch - dh)/2;
    } else {
      // 1:1 = pixel perfect centered
      dw = iw; dh = ih;
      dx = (cw - dw)/2; dy = (ch - dh)/2;
    }

    chartCtx.imageSmoothingEnabled = true;
    chartCtx.drawImage(chartImg, dx, dy, dw, dh);

    ui.chartMeta.textContent = `chart: ${iw}x${ih} • mode: ${chartMode}`;
  }

  function loadChartFromUrl(url){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = ()=>{ chartImg = img; drawChart(); resolve(); };
      img.onerror = ()=>reject(new Error("chart load failed"));
      img.src = url;
    });
  }

  function loadChartFromFile(file){
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      chartImg = img;
      drawChart();
      URL.revokeObjectURL(url);
    };
    img.onerror = ()=>{
      setStatus("chart load (file) failed");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // ========= EVENTS =========
  function hook(){
    // main buttons
    ui.btnNew.addEventListener("click", clearAll);
    ui.btnLoadDemo.addEventListener("click", loadDemo);
    ui.btnLoadOmit.addEventListener("click", loadOmit50);

    ui.btnAdd.addEventListener("click", ()=>{
      surfaces.push({ R: 0, t: 3, ap: 14, glassAfter:"AIR", isStop:false });
      rebuildTable(); redraw(); setStatus("surface added");
    });

    ui.btnAddElement.addEventListener("click", ()=>{
      // simple achromat-ish pair
      surfaces.push({ R: 60, t: 4, ap: 18, glassAfter:"BK7", isStop:false });
      surfaces.push({ R:-60, t: 1.5, ap: 18, glassAfter:"F2", isStop:false });
      rebuildTable(); redraw(); setStatus("element added");
    });

    ui.btnExport.addEventListener("click", exportJson);

    ui.btnImport.addEventListener("click", ()=> ui.fileJson.click());
    ui.fileJson.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          importJsonObj(JSON.parse(String(r.result || "{}")));
        }catch(err){
          setStatus("import failed (bad json)");
        }
      };
      r.readAsText(f);
      e.target.value = "";
    });

    // inputs
    ["sensorW","sensorH","flange","fieldAngle","rayCount","pxPerMm"].forEach(id=>{
      $("#"+id).addEventListener("input", ()=> redraw());
    });
    ["chkStopAware","chkShowAps","chkShowAxis","chkShowPL"].forEach(id=>{
      $("#"+id).addEventListener("change", ()=> redraw());
    });

    // chart controls
    ui.btnChartFit.addEventListener("click", ()=>{ chartMode="fit"; drawChart(); });
    ui.btnChartFill.addEventListener("click", ()=>{ chartMode="fill"; drawChart(); });
    ui.btnChart11.addEventListener("click", ()=>{ chartMode="11"; drawChart(); });

    ui.btnChartUrl.addEventListener("click", async ()=>{
      const last = localStorage.getItem("tvl_chart_url") || DEFAULT_CHART_URL || "";
      const url = prompt("Chart image URL:", last);
      if(!url) return;
      try{
        await loadChartFromUrl(url);
        localStorage.setItem("tvl_chart_url", url);
        setStatus("chart loaded (url)");
      }catch{
        setStatus("chart load (url) failed");
      }
    });

    ui.btnChartFile.addEventListener("click", ()=> ui.fileChart.click());
    ui.fileChart.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      loadChartFromFile(f);
      setStatus("chart loaded (file)");
      e.target.value = "";
    });

    // fullscreen: toggle on views panel (simple)
    ui.btnFullscreen.addEventListener("click", ()=>{
      const el = document.querySelector(".panel.views");
      if(!document.fullscreenElement){
        el.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // initial chart load
    const remembered = localStorage.getItem("tvl_chart_url");
    const initial = remembered || DEFAULT_CHART_URL;
    if(initial){
      loadChartFromUrl(initial)
        .then(()=>setStatus(`chart loaded (${remembered ? "remembered" : "default"})`))
        .catch(()=>setStatus("chart default load failed"));
    } else {
      setStatus("ready (no default chart url set)");
    }
  }

  // ========= INIT =========
  clearAll();
  hook();
  drawChart();
})();
