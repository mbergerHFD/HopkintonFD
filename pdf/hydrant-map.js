// hydrant-map.js — diagnostic build (logs + safe fallbacks)
(function(){
  const center = [42.2289, -71.5223]; let map, searchMarker;

  // --- Helpers
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const qs = new URLSearchParams(location.search);
  const nofilter = qs.get("nofilter") === "1";

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

  function normalize(props){
    const p = {...props};
    const descPairs = parseDescriptionBlob(p.description || p.Description || "");
    for (const [k,v] of Object.entries(descPairs)){
      if (v && (p[k] == null || p[k] === "")) p[k] = v;
    }
    const building = p.Building_no || p.building_no || p.hyd_no || p.hydrant_no || p.hyd_id || "";
    const street   = p.street_loc || p.Street || p.Address || p.addr || p.location || "";
    const hydType  = p.Hyd_Type || p.type || p.Type || "";
    const size     = p.main_size || p.Main_Size || p.size || "";
    const flow     = p.Flow_gpm || p.flow_gpm || p.flow || "";
    const psiS     = p.psi_Static || p.static_psi || p.static || "";
    const psiR     = p.Residual_psi || p.residual_psi || p.residual || "";
    const year     = p.year != null ? String(p.year).replace(/\.0$/, "") : "";
    const lon      = p.Longitude || p.longitude || p.lon || "";
    const lat      = p.Latitude || p.latitude || p.lat || "";
    const clean = s => (s || "").toString().replace(/\\"/g,'"').replace(/\s+/g,' ').trim();
    return { building: clean(building), street: clean(street), hydType: clean(hydType), size: clean(size),
      flow: clean(flow), psiS: clean(psiS), psiR: clean(psiR), year: clean(year), lon: clean(lon),
      lat: clean(lat), props: p };
  }

  function buildPopup(allProps){
    const n = normalize(allProps);
    const coreRows = [
      ["Type", n.hydType || "–"],
      ["Main Size", n.size || "–"],
      ["Flow (gpm)", n.flow || "–"],
      ["Static PSI", n.psiS || "–"],
      ["Residual PSI", n.psiR || "–"],
      ["Year", n.year || "–"]
    ];
    const titleLine = `Hydrant ${n.building ? "#" + esc(n.building) : ""}`;
    const streetLine = n.street ? `<p style="margin:0 0 8px; color:#111;"><strong>${esc(n.street)}</strong></p>` : "";
    const coreTable = `
      <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
        ${coreRows.map(([k,v]) => `<tr><td style="padding:4px 6px; color:#374151;"><strong>${esc(k)}</strong></td><td style="padding:4px 6px;">${esc(v)}</td></tr>`).join("")}
        ${(n.lat || n.lon) ? `<tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td><td style="padding:4px 6px;">${esc(n.lat||"–")}, ${esc(n.lon||"–")}</td></tr>` : ""}
      </table>`;
    return `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; min-width:260px;">
      <h3 style="margin:0 0 6px; font-size:1.1rem; color:#b91c1c;">${titleLine}</h3>${streetLine}${coreTable}</div>`;
  }

  function hydrantSources(){
    const urlParam = new URLSearchParams(location.search).get("hydrants");
    const c = []; if (urlParam) c.push(urlParam);
    c.push("data/hopkinton_fire_department___hydrants.geojson","data/hydrants.geojson","hydrants.geojson",
           "../data/hopkinton_fire_department___hydrants.geojson","../data/hydrants.geojson","../hydrants.geojson",
           "/data/hopkinton_fire_department___hydrants.geojson","/data/hydrants.geojson","/hydrants.geojson");
    return [...new Set(c)];
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
        if (!r.ok){ console.warn("[hydrant-map] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try{ console.log("[hydrant-map] Loaded:", absolute); return JSON.parse(text); }
        catch(e){ console.warn("[hydrant-map] Parse failed; sanitizing:", absolute, e.message);
          return JSON.parse(sanitizeJSONText(text)); }
      }catch(e){ console.warn("[hydrant-map] Fetch failed:", path, e); }
    }
    throw new Error("No hydrant GeoJSON found.");
  }

  function init(){
    const el = document.getElementById("map"); if(!el){ console.error("#map missing"); return; }
    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);

    // --- Bind toolbar search (street + city -> marker)
    try{
      const form = document.getElementById('mapSearchForm');
      const streetEl = document.getElementById('mapSearchStreet');
      const cityEl = document.getElementById('mapSearchCity');
      if (form && streetEl && cityEl){
        form.addEventListener('submit', async (e)=>{
          e.preventDefault();
          const street = streetEl.value.trim();
          const city = (cityEl.value || "Hopkinton").trim();
          if (!street) return;
          const q = encodeURIComponent(street + ", " + city + ", MA");
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
          try{
            const res = await fetch(url, {headers:{'Accept':'application/json'}});
            const arr = await res.json();
            if (Array.isArray(arr) && arr.length){
              const lat = parseFloat(arr[0].lat), lon = parseFloat(arr[0].lon);
              if (!isNaN(lat) && !isNaN(lon)){
                if (searchMarker) { try{ map.removeLayer(searchMarker);}catch{} }
                searchMarker = L.marker([lat, lon]).addTo(map).bindPopup("Search location").openPopup();
                map.setView([lat, lon], 16);
              }
            } else {
              alert("Address not found. Try a more specific street and city.");
            }
          }catch(err){
            console.warn("Search failed:", err);
            alert("Search failed. Please check your connection.");
          }
        });
      }
    }catch(_){}


    // Mobile sizing fix
    function fixSizeSoon(d=0){ setTimeout(()=> map.invalidateSize(true), d); }
    map.once('load', ()=> fixSizeSoon(0));
    map.on('popupopen', ()=> fixSizeSoon(0));
    window.addEventListener('resize', ()=> fixSizeSoon(150));
    window.addEventListener('orientationchange', ()=> fixSizeSoon(300));

    const icon = L.divIcon({className:"hydrant-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444" stroke="#991b1b" stroke-width="1.5"><circle cx="12" cy="12" r="6"/></svg>'});

    fetchAny(hydrantSources()).then(geojson => {
      const all = geojson.features || [];
      console.log(`[hydrant-map] total features in file: ${all.length}`);

      let feats = all;
      if (!nofilter){
        feats = all.filter(f => !/LZ\d+/i.test(JSON.stringify(f.properties||{})));
        console.log(`[hydrant-map] after LZ filter: ${feats.length}`);
      } else {
        console.log("[hydrant-map] filter disabled via ?nofilter=1");
      }

      if (feats.length === 0){
        console.warn("[hydrant-map] No features to render. Falling back to no-filter circleMarkers for debug.");
        feats = all;
        const layer = L.geoJSON({type:"FeatureCollection", features:feats}, {
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius:5, color:"#ef4444", weight:2, fillOpacity:0.7}),
          onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature.properties||{}))
        }).addTo(map);
        try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
        return;
      }

      const layer = L.geoJSON({type:"FeatureCollection", features:feats}, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature.properties||{}))
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
      console.log("[hydrant-map] rendered features:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load hydrants:", err);
      L.marker(center).addTo(map).bindPopup("Hydrant data not found.");
    });
  }

  if (document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();