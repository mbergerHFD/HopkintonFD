// hydrant-map.js — robust loader + rich popups + exclude LZ###
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

    return {
      building: clean(building),
      street: clean(street),
      hydType: clean(hydType),
      size: clean(size),
      flow: clean(flow),
      psiS: clean(psiS),
      psiR: clean(psiR),
      year: clean(year),
      lon: clean(lon),
      lat: clean(lat),
      props: p
    };
  }

  function prettyLabel(key){
    const map = {
      hyd_id: "Hydrant ID", Building_no: "Building #", building_no: "Building #",
      street_loc: "Street / Location", Hyd_Type: "Type", main_size: "Main Size",
      Flow_gpm: "Flow (gpm)", psi_Static: "Static PSI", Residual_psi: "Residual PSI",
      Longitude: "Longitude", Latitude: "Latitude"
    };
    if (map[key]) return map[key];
    return key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function buildHydrantPopup(allProps){
    const n = normalize(allProps);
    const coreRows = [
      ["Type", n.hydType || "–"],
      ["Main Size", n.size || "–"],
      ["Flow (gpm)", n.flow || "–"],
      ["Static PSI", n.psiS || "–"],
      ["Residual PSI", n.psiR || "–"],
      ["Year", n.year || "–"]
    ];

    const used = new Set([
      "Hyd_Type","type","Type","main_size","Main_Size","size","Flow_gpm","flow_gpm","flow",
      "psi_Static","static_psi","static","Residual_psi","residual_psi","residual","year",
      "Longitude","Latitude","longitude","latitude","lon","lat",
      "Building_no","building_no","hyd_no","hydrant_no","hyd_id",
      "street_loc","Street","Address","addr","location","description","Description"
    ]);

    const rest = [];
    for (const [k,v] of Object.entries(n.props)){
      if (used.has(k)) continue;
      const val = (v == null ? "" : String(v).trim());
      if (!val) continue;
      rest.push([prettyLabel(k), esc(val)]);
    }
    rest.sort((a,b) => a[0].localeCompare(b[0]));

    const titleLine = `Hydrant ${n.building ? "#" + esc(n.building) : ""}`;
    const streetLine = n.street ? `<p style="margin:0 0 8px; color:#111;"><strong>${esc(n.street)}</strong></p>` : "";

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
        <h3 style="margin:0 0 6px; font-size:1.1rem; color:#b91c1c;">${titleLine}</h3>
        ${streetLine}
        ${coreTable}
        ${more}
      </div>
    `;
  }

  // ---------- Robust source lookup
  function hydrantSources(){
    const urlParam = new URLSearchParams(location.search).get("hydrants");
    const candidates = [];
    if (urlParam) candidates.push(urlParam);

    candidates.push(
      "data/hopkinton_fire_department___hydrants.geojson",
      "data/hydrants.geojson",
      "hydrants.geojson",
      "../data/hopkinton_fire_department___hydrants.geojson",
      "../data/hydrants.geojson",
      "../hydrants.geojson",
      "/data/hopkinton_fire_department___hydrants.geojson",
      "/data/hydrants.geojson",
      "/hydrants.geojson"
    );
    return [...new Set(candidates)];
  }

  // Fetch as TEXT; sanitize control chars inside strings if parse fails
  async function fetchAny(paths){
    for (let path of paths){
      try {
        const absolute = new URL(path, window.location.href).toString();
        const r = await fetch(absolute, {cache: 'no-cache'});
        if (!r.ok) { console.warn("[hydrant-map] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          console.log("[hydrant-map] Loaded:", absolute);
          return data;
        } catch (e) {
          console.warn("[hydrant-map] Parse failed, attempting sanitize:", absolute, e.message);
          const fixed = sanitizeJSONText(text);
          const data = JSON.parse(fixed);
          console.log("[hydrant-map] Loaded (sanitized):", absolute);
          return data;
        }
      } catch(e) {
        console.warn("[hydrant-map] Fetch failed:", path, e);
      }
    }
    throw new Error("No hydrant GeoJSON found in any known locations.");
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

    if (L.Control && L.Control.Geocoder) {
      L.Control.geocoder({ defaultMarkGeocode:false })
        .on('markgeocode', e => {
          const b = e.geocode.bbox;
          map.fitBounds(L.latLngBounds(b._southWest, b._northEast));
        })
        .addTo(map);
    }

    const form = document.getElementById("mapSearchForm");
    const input = document.getElementById("mapSearchInput");
    if (form && input) {
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const q = (input.value||'').trim(); if(!q) return;
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
          const res = await fetch(url, { headers:{'Accept-Language':'en'} });
          const data = await res.json();
          if (data && data[0]) {
            const lat = +data[0].lat, lon = +data[0].lon;
            if (searchMarker) map.removeLayer(searchMarker);
            searchMarker = L.marker([lat,lon]).addTo(map).bindPopup(data[0].display_name);
            map.setView([lat,lon], 16);
          } else { alert("No results found."); }
        } catch(err) {
          console.error(err); alert("Search failed.");
        }
      });
    }

    const icon = L.divIcon({
      className: "hydrant-pin",
      html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444" stroke="#991b1b" stroke-width="1.5"><circle cx="12" cy="12" r="6"/></svg>'
    });

    fetchAny(hydrantSources()).then(geojson => {
      // --- Filter out Landing Zone artifacts like "LZ101" etc. ---
      const filtered = {
        type: "FeatureCollection",
        features: (geojson.features || []).filter(f => {
          const propsText = JSON.stringify(f.properties || {}).toUpperCase();
          return !/LZ\d+/.test(propsText);
        })
      };

      const layer = L.geoJSON(filtered, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon }),
        onEachFeature: (feature, lyr) => {
          lyr.bindPopup(buildHydrantPopup(feature.properties));
        }
      }).addTo(map);

      try { map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch {}
      console.log("[hydrant-map] features shown:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load hydrants:", err);
      L.marker(center).addTo(map).bindPopup("Hydrant data not found.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
