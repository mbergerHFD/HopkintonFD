// landing-zone-map.js — diagnostic build (logs + minimal fields + geometry fallback)
(function(){
  const center = [42.2289, -71.5223]; let map, searchMarker;
  const qs = new URLSearchParams(location.search);
  const nofilter = qs.get("nofilter") === "1";

  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function parseDescriptionBlob(txt){
    if (!txt) return {};
    const lines = String(txt).split(/\r?\n/);
    const obj = {};
    for (let ln of lines){
      const m = ln.match(/^\s*([^:]+)\s*:\s*(.*)\s*$/);
      if (m){ obj[m[1].trim()] = m[2].trim(); }
    }
    return obj;
  }

  // derive centroid for non-Point geometries
  function centroid(coords){
    const flat = [];
    function walk(c){
      if (typeof c[0] === "number"){ flat.push(c); return; }
      for (const x of c) walk(x);
    }
    walk(coords);
    let sx=0, sy=0, n=0;
    for (const [x,y] of flat){ sx+=x; sy+=y; n++; }
    if (!n) return null;
    return [sx/n, sy/n];
  }

  function isLZ(props){
    if (nofilter) return true;
    const t = JSON.stringify(props||{}).toLowerCase();
    return /landing\s*zone|landing\s*z|\blz\b|lz\d+/.test(t);
  }

  function sanitizeJSONText(s){
    let out="",inStr=false,escaped=false;
    for (let i=0;i<s.length;i++){
      const ch=s[i];
      if (inStr){
        if (escaped){ out+=ch; escaped=false; continue; }
        if (ch==="\\"){ out+=ch; escaped=true; continue; }
        if (ch==='"'){ out+=ch; inStr=false; continue; }
        if (ch==="\n"){ out+="\\n"; continue; }
        if (ch==="\r"){ out+="\\r"; continue; }
        if (ch==="\t"){ out+="\\t"; continue; }
        out+=ch;
      } else {
        out+=ch; if (ch==='"'){ inStr=true; escaped=false; }
      }
    }
    return out;
  }

  async function fetchAny(paths){
    for (let path of paths){
      try{
        const absolute = new URL(path, location.href).toString();
        const r = await fetch(absolute, {cache:'no-cache'});
        if (!r.ok){ console.warn("[landing-zone] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try{ console.log("[landing-zone] Loaded:", absolute); return JSON.parse(text); }
        catch(e){ console.warn("[landing-zone] Parse failed; sanitizing:", absolute, e.message);
          return JSON.parse(sanitizeJSONText(text)); }
      }catch(e){ console.warn("[landing-zone] Fetch failed:", path, e); }
    }
    throw new Error("No Landing Zone GeoJSON found.");
  }

  function lzSources(){
    const urlParam = new URLSearchParams(location.search).get("lz");
    const c = []; if (urlParam) c.push(urlParam);
    c.push("data/hopkinton_fire_department.geojson","data/landing_zones.geojson","landing_zones.geojson",
           "../data/hopkinton_fire_department.geojson","../data/landing_zones.geojson","../landing_zones.geojson",
           "/data/hopkinton_fire_department.geojson","/data/landing_zones.geojson","/landing_zones.geojson");
    return [...new Set(c)];
  }

  function getCoords(feature){
    try{
      if (feature.geometry){
        if (feature.geometry.type === "Point"){
          const [lon, lat] = feature.geometry.coordinates || [];
          if (isFinite(lat) && isFinite(lon)) return {lat, lon};
        } else {
          const c = centroid(feature.geometry.coordinates);
          if (c){ const [lon, lat] = c; if (isFinite(lat)&&isFinite(lon)) return {lat, lon}; }
        }
      }
    }catch{}
    const p = feature.properties || {};
    const lat = parseFloat(p.Latitude || p.latitude || p.lat || "");
    const lon = parseFloat(p.Longitude || p.longitude || p.lon || "");
    return (isFinite(lat) && isFinite(lon)) ? {lat, lon} : null;
  }

  function extractCautions(props){
    if (!props) return "";
    let best = "";
    for (const [k,v] of Object.entries(props)){
      if (v == null) continue;
      const keyLc = String(k).toLowerCase();
      if (keyLc.includes("caution") || keyLc.includes("hazard")){
        const val = String(v).trim();
        if (val) best = best ? (best + "; " + val) : val;
      }
    }
    if (best) return best;
    const notes = props.notes || props.Notes || props.note || props.Note || "";
    if (notes && /caution|hazard/i.test(String(notes))) return String(notes).trim();
    const desc = props.description || props.Description || "";
    if (desc){
      const m = String(desc).match(/cautions?\s*:\s*(.+)/i);
      if (m && m[1]) return m[1].split(/\r?\n/)[0].trim();
    }
    return "";
  }

  function buildPopup(feature){
    const p = feature.properties || {};
    const descPairs = parseDescriptionBlob(p.description || p.Description || "");
    for (const [k,v] of Object.entries(descPairs)){
      if (v && (p[k] == null || p[k] === "")) p[k] = v;
    }
    const idRaw   = p.lz || p.LZ || p.LZ_ID || p.lz_id || p.LZId || p.id || "";
    const nameRaw = p.name || p.Name || p.title || p.Title || "";
    const descr   = p.Description || p.description || "";
    const title   = (idRaw ? `LZ ${esc(idRaw)}` : (nameRaw ? esc(nameRaw) : "Landing Zone"));
    const cautions = extractCautions(p);
    const coords = getCoords(feature);
    const coordHtml = coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}` : "–";
    const nameOrDesc = nameRaw ? esc(nameRaw) : (descr ? esc(String(descr).slice(0,300)) : "");

    return `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; min-width:240px;">
      <h3 style="margin:0 0 6px; font-size:1.1rem; color:#1e3a8a;">${title}</h3>
      ${nameOrDesc ? `<p style="margin:0 0 8px; color:#111;"><strong>${nameOrDesc}</strong></p>` : ""}
      <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
        <tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td><td style="padding:4px 6px;">${coordHtml}</td></tr>
        <tr><td style="padding:4px 6px; color:#374151;"><strong>Cautions</strong></td><td style="padding:4px 6px;">${cautions ? esc(cautions) : "–"}</td></tr>
        ${idRaw ? `<tr><td style="padding:4px 6px; color:#374151;"><strong>ID</strong></td><td style="padding:4px 6px;">${esc(idRaw)}</td></tr>` : ""}
      </table></div>`;
  }

  function init(){
    const el = document.getElementById("map"); if(!el){ console.error("#map missing"); return; }
    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);

    // Mobile sizing fix
    function fixSizeSoon(d=0){ setTimeout(()=> map.invalidateSize(true), d); }
    map.once('load', ()=> fixSizeSoon(0));
    map.on('popupopen', ()=> fixSizeSoon(0));
    window.addEventListener('resize', ()=> fixSizeSoon(150));
    window.addEventListener('orientationchange', ()=> fixSizeSoon(300));

    const icon = L.divIcon({
      className:"lz-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#3b82f6" stroke="#1e40af" stroke-width="1.5"><polygon points="12,3 21,21 3,21"/></svg>'
    });

    fetchAny(lzSources()).then(geojson => {
      const all = geojson.features || [];
      console.log(`[landing-zone] total features in file: ${all.length}`);

      let feats = all;
      if (!nofilter){
        feats = all.filter(f => isLZ(f.properties||{}));
        console.log(`[landing-zone] after LZ filter: ${feats.length}`);
      } else {
        console.log("[landing-zone] filter disabled via ?nofilter=1");
      }

      if (feats.length === 0){
        console.warn("[landing-zone] No features after filter; showing ALL as circles for debug.");
        feats = all;
        const layer = L.geoJSON({type:"FeatureCollection", features:feats}, {
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius:5, color:"#3b82f6", weight:2, fillOpacity:0.7}),
          onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature))
        }).addTo(map);
        try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
        return;
      }

      const markerFeats = feats.map(f => {
        if (f.geometry && f.geometry.type === "Point") return f;
        const c = getCoords(f);
        if (c){ return { type:"Feature", geometry:{type:"Point", coordinates:[c.lon, c.lat]}, properties:f.properties }; }
        return null;
      }).filter(Boolean);

      const layer = L.geoJSON({type:"FeatureCollection", features:markerFeats}, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature))
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
      console.log("[landing-zone] rendered features:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load Landing Zones:", err);
      L.marker(center).addTo(map).bindPopup("Landing Zone data not found.");
    });
  }

  if (document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();