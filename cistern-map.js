// cistern-map.js — Cautions in main popup + omit empty core rows
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

  // Extract a robust "Cautions" value:
  //  - any prop key containing "caution" or "hazard" (case-insensitive)
  //  - or a notes/note field that mentions caution/hazard
  //  - or a "CAUTIONS: ..." line inside description
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

  function normalize(props){
    const p = {...props};

    // Merge key/value pairs parsed from description
    const descPairs = parseDescriptionBlob(p.description || p.Description || "");
    for (const [k,v] of Object.entries(descPairs)){
      if (v && (p[k] == null || p[k] === "")) p[k] = v;
    }

    // Common cistern fields (fallbacks included)
    const name     = p.name || p.Name || p.title || "";
    const address  = p.street_loc || p.address || p.Address || p.location || "";
    const cap      = p.capacity || p.Capacity || p.gallons || p.Gallons || p.volume || p.Volume || "";
    const type     = p.type || p.Type || p.cistern_type || "";
    const year     = p.year != null ? String(p.year).replace(/\.0$/, "") : (p.Year || "");
    const status   = p.status || p.Status || "";
    const access   = p.access || p.Access || "";
    const depth    = p.depth || p.Depth || "";
    const diameter = p.diameter || p.Diameter || "";
    const lon      = p.Longitude || p.longitude || p.lon || "";
    const lat      = p.Latitude || p.latitude || p.lat || "";
    const cautions = extractCautions(p);

    const clean = s => (s || "").toString().replace(/\\"/g,'"').replace(/\s+/g,' ').trim();

    return {
      name: clean(name),
      address: clean(address),
      capacity: clean(cap),
      type: clean(type),
      year: clean(year),
      status: clean(status),
      access: clean(access),
      depth: clean(depth),
      diameter: clean(diameter),
      lon: clean(lon),
      lat: clean(lat),
      cautions: clean(cautions),
      props: p
    };
  }

  function prettyLabel(key){
    const map = {
      capacity: "Capacity (gal)",
      gallons: "Capacity (gal)",
      Volume: "Volume",
      diameter: "Diameter",
      depth: "Depth",
      access: "Access",
      status: "Status",
      street_loc: "Address / Location",
      Latitude: "Latitude",
      Longitude: "Longitude"
    };
    if (map[key]) return map[key];
    return key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function buildCisternPopup(allProps){
    const n = normalize(allProps);

    // Build core rows and OMIT any that are empty
    const corePairs = [
      ["Cautions", n.cautions],            // moved to core
      ["Capacity (gal)", n.capacity],
      ["Type", n.type],
      ["Status", n.status],
      ["Access", n.access],
      ["Depth", n.depth],
      ["Diameter", n.diameter],
      ["Year", n.year]
    ];
    const coreRows = corePairs
      .filter(([_, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => [`${k}`, String(v).trim()]);

    const title = n.name ? esc(n.name) : "Cistern";
    const addr  = n.address ? `<p style="margin:0 0 8px; color:#111;"><strong>${esc(n.address)}</strong></p>` : "";

    const coordRow = (n.lat || n.lon)
      ? `<tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td>
           <td style="padding:4px 6px;">${esc(n.lat||"–")}, ${esc(n.lon||"–")}</td></tr>`
      : "";

    const coreTable = `
      <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
        ${coreRows.map(([k,v]) => `
          <tr>
            <td style="padding:4px 6px; color:#374151; white-space:nowrap;"><strong>${esc(k)}</strong></td>
            <td style="padding:4px 6px;">${esc(v)}</td>
          </tr>`).join("")}
        ${coordRow}
      </table>
    `;

    // Prepare "More details" excluding keys used in core (and omitting empties)
    const used = new Set([
      "name","Name","title","street_loc","address","Address","location",
      "capacity","Capacity","gallons","Gallons","volume","Volume",
      "type","Type","cistern_type",
      "status","Status","access","Access","depth","Depth","diameter","Diameter",
      "year","Year","Longitude","Latitude","longitude","latitude","lon","lat",
      "notes","Notes","note","Note","hazards","Hazards","hazard","Hazard",
      "cautions","Cautions","CAUTIONS","description","Description"
    ]);

    const rest = [];
    for (const [k,v] of Object.entries(n.props)){
      if (used.has(k)) continue;
      const val = (v == null ? "" : String(v).trim());
      if (!val) continue;
      rest.push([prettyLabel(k), esc(val)]);
    }
    rest.sort((a,b) => a[0].localeCompare(b[0]));
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
        <h3 style="margin:0 0 6px; font-size:1.1rem; color:#065f46;">${title}</h3>
        ${addr}
        ${coreTable}
        ${more}
      </div>
    `;
  }

  // ---------- Source lookup + sanitizing (handles bad newlines/tabs in JSON)
  function cisternSources(){
    const urlParam = new URLSearchParams(location.search).get("cisterns");
    const candidates = [];
    if (urlParam) candidates.push(urlParam);
    candidates.push(
      "data/hopkinton_fire_department___cisterns.geojson",
      "data/cisterns.geojson",
      "cisterns.geojson",
      "../data/hopkinton_fire_department___cisterns.geojson",
      "../data/cisterns.geojson",
      "../cisterns.geojson",
      "/data/hopkinton_fire_department___cisterns.geojson",
      "/data/cisterns.geojson",
      "/cisterns.geojson"
    );
    return [...new Set(candidates)];
  }

  async function fetchAny(paths){
    for (let path of paths){
      try{
        const absolute = new URL(path, window.location.href).toString();
        const r = await fetch(absolute, {cache: 'no-cache'});
        if (!r.ok) { console.warn("[cistern-map] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          console.log("[cistern-map] Loaded:", absolute);
          return data;
        } catch (e) {
          console.warn("[cistern-map] Parse failed; attempting sanitize:", absolute, e.message);
          const fixed = sanitizeJSONText(text);
          const data = JSON.parse(fixed);
          console.log("[cistern-map] Loaded (sanitized):", absolute);
          return data;
        }
      }catch(e){
        console.warn("[cistern-map] Fetch failed:", path, e);
      }
    }
    throw new Error("No cistern GeoJSON found in known locations.");
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

    const icon = L.divIcon({className:"cistern-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#10b981" stroke="#065f46" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>'
    });

    fetchAny(cisternSources()).then(geojson => {
      const layer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (f, l) => l.bindPopup(buildCisternPopup(f.properties || {}))
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
      console.log("[cistern-map] features with popups:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load cisterns:", err);
      L.marker(center).addTo(map).bindPopup("Cistern data not found.");
    });
  }

  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); }
  else{ init(); }
})();