// landing-zone-map.js — ensure CAUTIONS show up (case-insensitive + description scan)
(function(){
  const center = [42.2289, -71.5223]; // Hopkinton approx
  let map, searchMarker;

  // ---------- Helpers
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function parseDescriptionBlob(txt){
    if (!txt) return {};
    const lines = String(txt).split(/\r?\n/);
    const obj = {};
    for (let ln of lines){
      const m = ln.match(/^\s*([^:]+)\s*:\s*(.*)\s*$/);
      if (m){
        const k = m[1].trim();
        const v = m[2].trim();
        if (k) obj[k] = v;
      }
    }
    return obj;
  }

  // case-insensitive getter across props (keys may vary in case/underscore)
  function getCI(props, names){
    const entries = Object.entries(props || {});
    for (const want of names){
      const wantLc = want.toLowerCase();
      for (const [k,v] of entries){
        if (k && String(k).toLowerCase() === wantLc && v != null && String(v).trim() !== ""){
          return String(v).trim();
        }
      }
    }
    return "";
  }

  // extract cautions robustly:
  //  - any prop whose key contains "caution" or "hazard" (any case)
  //  - otherwise: a "CAUTIONS: ..." line from description text
  function extractCautions(props){
    if (!props) return "";
    // 1) direct property keys
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

    // 2) consider "notes" if it clearly mentions cautions/hazards
    const notes = getCI(props, ["notes","note"]);
    if (notes && /caution|hazard/i.test(notes)) return notes;

    // 3) scan freeform description for a "cautions: ..." line
    const desc = props.description || props.Description || "";
    if (desc){
      const m = String(desc).match(/cautions?\s*:\s*(.+)/i);
      if (m && m[1]){
        // stop at line break if present
        return m[1].split(/\r?\n/)[0].trim();
      }
    }
    return "";
  }

  function isLandingZoneProps(props){
    const text = JSON.stringify(props || {}).toLowerCase();
    return /landing\s*zone|landing\s*z|\blz\b|lz\d+/.test(text);
  }

  function getCoords(feature){
    try{
      if (feature.geometry && feature.geometry.type === "Point"){
        const [lon, lat] = feature.geometry.coordinates || [];
        if (typeof lat === "number" && typeof lon === "number") return {lat, lon};
      }
    }catch{}
    const p = feature.properties || {};
    const lat = parseFloat(p.Latitude || p.latitude || p.lat || "");
    const lon = parseFloat(p.Longitude || p.longitude || p.lon || "");
    return (isFinite(lat) && isFinite(lon)) ? {lat, lon} : null;
  }

  function buildPopup(feature){
    const p = feature.properties || {};

    // Merge parsed description into properties (non-destructive, case-insensitive)
    const descText = p.description || p.Description || "";
    const descPairs = parseDescriptionBlob(descText);
    for (const [k,v] of Object.entries(descPairs)){
      if (!v) continue;
      // if a case-insensitive equivalent doesn't exist or is empty, set it
      const hasSame = Object.keys(p).some(pk => pk.toLowerCase() === k.toLowerCase() && String(p[pk]||"").trim() !== "");
      if (!hasSame) p[k] = v;
    }

    const idRaw   = getCI(p, ["lz","LZ","lz_id","LZ_ID","LZId","id"]);
    const nameRaw = getCI(p, ["name","Name","title","Title"]);
    const descr   = p.Description || p.description || "";
    const title   = (idRaw ? `LZ ${esc(idRaw)}` : (nameRaw ? esc(nameRaw) : "Landing Zone"));

    const cautions = extractCautions(p);
    const coords = getCoords(feature);
    const coordHtml = coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}` : "–";
    const nameOrDesc = nameRaw ? esc(nameRaw) : (descr ? esc(String(descr).slice(0,300)) : "");

    return `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; min-width:240px;">
        <h3 style="margin:0 0 6px; font-size:1.1rem; color:#1e3a8a;">${title}</h3>
        ${nameOrDesc ? `<p style="margin:0 0 8px; color:#111;"><strong>${nameOrDesc}</strong></p>` : ""}
        <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
          <tr>
            <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>Coordinates</strong></td>
            <td style="padding:4px 6px;">${coordHtml}</td>
          </tr>
          <tr>
            <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>Cautions</strong></td>
            <td style="padding:4px 6px;">${cautions ? esc(cautions) : "–"}</td>
          </tr>
          ${idRaw ? `
          <tr>
            <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>ID</strong></td>
            <td style="padding:4px 6px;">${esc(idRaw)}</td>
          </tr>` : ""}
        </table>
      </div>
    `;
  }

  // ---------- Source lookup + sanitizing (same robust loader as before)
  function lzSources(){
    const urlParam = new URLSearchParams(location.search).get("lz");
    const candidates = [];
    if (urlParam) candidates.push(urlParam);
    candidates.push(
      "data/hopkinton_fire_department.geojson",
      "data/landing_zones.geojson",
      "landing_zones.geojson",
      "../data/hopkinton_fire_department.geojson",
      "../data/landing_zones.geojson",
      "../landing_zones.geojson",
      "/data/hopkinton_fire_department.geojson",
      "/data/landing_zones.geojson",
      "/landing_zones.geojson"
    );
    return [...new Set(candidates)];
  }

  async function fetchAny(paths){
    for (let path of paths){
      try{
        const absolute = new URL(path, window.location.href).toString();
        const r = await fetch(absolute, {cache: 'no-cache'});
        if (!r.ok) { console.warn("[landing-zone] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          console.log("[landing-zone] Loaded:", absolute);
          return data;
        } catch (e) {
          console.warn("[landing-zone] Parse failed; attempting sanitize:", absolute, e.message);
          const fixed = sanitizeJSONText(text);
          const data = JSON.parse(fixed);
          console.log("[landing-zone] Loaded (sanitized):", absolute);
          return data;
        }
      }catch(e){
        console.warn("[landing-zone] Fetch failed:", path, e);
      }
    }
    throw new Error("No Landing Zone GeoJSON found in known locations.");
  }

  function sanitizeJSONText(s){
    let out = "", inStr = false, escaped = false;
    for (let i=0; i<s.length; i++){
      const ch = s[i];
      if (inStr){
        if (escaped){ out += ch; escaped = false; continue; }
        if (ch === "\\\\"){ out += ch; escaped = true; continue; }
        if (ch === '"'){ out += ch; inStr = false; continue; }
        if (ch === "\n"){ out += "\\n"; continue; }
        if (ch === "\r"){ out += "\\r"; continue; }
        if (ch === "\t"){ out += "\\t"; continue; }
        out += ch;
      } else {
        out += ch;
        if (ch === '"'){ inStr = true; escaped = false; }
      }
    }
    return out;
  }

  // ---------- Init
  function init(){
    const el = document.getElementById("map");
    if(!el){ console.error("Map container #map not found"); return; }

    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if(L.Control && L.Control.Geocoder){
      L.Control.geocoder({ defaultMarkGeocode:false })
      .on('markgeocode', e => {
        const b = e.geocode.bbox; map.fitBounds(L.latLngBounds(b._southWest, b._northEast));
      }).addTo(map);
    }

    const form = document.getElementById("mapSearchForm");
    const input = document.getElementById("mapSearchInput");
    if (form && input){
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const q = (input.value||'').trim(); if(!q) return;
        try{
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
          const res = await fetch(url, { headers:{'Accept-Language':'en'} });
          const data = await res.json();
          if(data && data[0]){
            const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
            if(searchMarker) map.removeLayer(searchMarker);
            searchMarker = L.marker([lat,lon]).addTo(map).bindPopup(data[0].display_name);
            map.setView([lat,lon], 16);
          } else { alert("No results found."); }
        }catch(err){ console.error(err); alert("Search failed."); }
      });
    }

    const icon = L.divIcon({
      className:"lz-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#3b82f6" stroke="#1e40af" stroke-width="1.5"><polygon points="12,3 21,21 3,21"/></svg>'
    });

    fetchAny(lzSources()).then(geojson => {
      const only = {
        type: "FeatureCollection",
        features: (geojson.features || []).filter(f => isLandingZoneProps(f.properties || {}))
      };

      const layer = L.geoJSON(only, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (f, l) => l.bindPopup(buildPopup(f))
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
      console.log("[landing-zone] features with popups:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load Landing Zones:", err);
      L.marker(center).addTo(map).bindPopup("Landing Zone data not found.");
    });
  }

  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); }
  else{ init(); }
})();