// landing-zone-map.js — robust loader + LZ-only + professional popups
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

  function normalize(props){
    const p = {...props};

    // Merge key/value pairs parsed from description
    const descPairs = parseDescriptionBlob(p.description || p.Description || "");
    for (const [k,v] of Object.entries(descPairs)){
      if (v && (p[k] == null || p[k] === "")) p[k] = v;
    }

    // Extract common Landing Zone fields
    const name    = p.name || p.Name || p.title || p.Title || p.lz_name || "";
    const lzId    = p.lz || p.LZ || p.LZ_ID || p.LZId || p.lz_id || "";
    const address = p.street_loc || p.address || p.Address || p.location || "";
    const surface = p.surface || p.Surface || "";
    const size    = p.size || p.Size || p.dimensions || p.Dimensions || "";
    const notes   = p.notes || p.Notes || p.note || p.Note || "";
    const hazards = p.hazards || p.Hazards || p.hazard || p.Hazard || "";
    const lighting= p.lighting || p.Lighting || p.night || p.Night || "";
    const access  = p.access || p.Access || "";
    const lat     = p.Latitude || p.latitude || p.lat || "";
    const lon     = p.Longitude || p.longitude || p.lon || "";

    const clean = s => (s || "").toString().replace(/\\"/g,'"').replace(/\s+/g,' ').trim();

    return {
      name: clean(name),
      lzId: clean(lzId),
      address: clean(address),
      surface: clean(surface),
      size: clean(size),
      notes: clean(notes),
      hazards: clean(hazards),
      lighting: clean(lighting),
      access: clean(access),
      lat: clean(lat),
      lon: clean(lon),
      props: p
    };
  }

  function prettyLabel(key){
    const map = {
      lz: "LZ ID", LZ: "LZ ID", LZ_ID: "LZ ID", lz_id: "LZ ID",
      street_loc: "Address / Location",
      lighting: "Lighting", night: "Night Lighting"
    };
    if (map[key]) return map[key];
    return key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function isLandingZoneProps(props){
    const text = JSON.stringify(props || {}).toLowerCase();
    // Match "landing zone", "landing z", or standalone 'lz'/'lz123'
    return /landing\s*zone|landing\s*z|\blz\b|lz\d+/.test(text);
  }

  function buildPopup(allProps){
    const n = normalize(allProps);
    const title = (n.lzId ? `LZ ${esc(n.lzId)}` : (n.name ? esc(n.name) : "Landing Zone"));

    const coreRows = [
      ["Surface", n.surface || "–"],
      ["Size/Dimensions", n.size || "–"],
      ["Access", n.access || "–"],
      ["Lighting", n.lighting || "–"],
      ["Hazards", n.hazards || "–"]
    ];

    const used = new Set([
      "name","Name","title","Title","lz","LZ","lz_id","LZ_ID","LZId",
      "street_loc","address","Address","location",
      "surface","Surface","size","Size","dimensions","Dimensions",
      "notes","Notes","note","Note","hazards","Hazards","hazard","Hazard",
      "lighting","Lighting","night","Night",
      "Latitude","Longitude","latitude","longitude","lat","lon",
      "description","Description"
    ]);

    const rest = [];
    for (const [k,v] of Object.entries(n.props)){
      if (used.has(k)) continue;
      const val = (v == null ? "" : String(v).trim());
      if (!val) continue;
      rest.push([prettyLabel(k), esc(val)]);
    }
    rest.sort((a,b)=> a[0].localeCompare(b[0]));

    const addrLine = n.address ? `<p style="margin:0 0 8px; color:#111;"><strong>${esc(n.address)}</strong></p>` : "";

    const coreTable = `
      <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
        ${coreRows.map(([k,v]) => `
          <tr>
            <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>${esc(k)}</strong></td>
            <td style="padding:4px 6px;">${esc(v)}</td>
          </tr>`).join("")}
        ${(n.lat || n.lon) ? `
          <tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td>
          <td style="padding:4px 6px;">${esc(n.lat||"–")}, ${esc(n.lon||"–")}</td></tr>` : ""}
        ${n.notes ? `
          <tr><td style="padding:4px 6px; color:#374151;"><strong>Notes</strong></td>
          <td style="padding:4px 6px;">${esc(n.notes)}</td></tr>` : ""}
      </table>
    `;

    const more = rest.length ? `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer; font-weight:700; color:#1f2937;">More details</summary>
        <div style="margin-top:6px; max-height:220px; overflow:auto; border-top:1px solid #e5e7eb; padding-top:6px;">
          <table style="width:100%; border-collapse: collapse; font-size:0.9rem;">
            ${rest.map(([k,v]) => `
              <tr>
                <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>${esc(k)}</strong></td>
                <td style="padding:4px 6px;">${v}</td>
              </tr>`).join("")}
          </table>
        </div>
      </details>
    ` : "";

    return `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; min-width:260px;">
        <h3 style="margin:0 0 6px; font-size:1.1rem; color:#1e3a8a;">${title}</h3>
        ${addrLine}
        ${coreTable}
        ${more}
      </div>
    `;
  }

  // ---------- Source lookup + sanitizing
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
      // Filter: only features whose properties look like Landing Zones
      const only = {
        type: "FeatureCollection",
        features: (geojson.features || []).filter(f => isLandingZoneProps(f.properties || {}))
      };

      const layer = L.geoJSON(only, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (f, l) => l.bindPopup(buildPopup(f.properties || {}))
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