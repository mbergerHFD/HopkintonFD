
/* === HFD Leaflet guard: run page script only after Leaflet + DOM are ready (mobile-safe) === */
;(function(){
  function whenLeafletReady(fn){
    var tries = 0;
    (function tick(){
      if (window.L && typeof L.map === 'function'){
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
        else fn();
        return;
      }
      if (++tries > 400){ console.warn('[HFD] Leaflet not ready'); return; }
      setTimeout(tick, 25);
    })();
  }
  whenLeafletReady(function(){
// === HFD mobile-safe Leaflet guard (JS-only, no layout changes) ===
(function(){
  function domReady(cb){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, {once:true});
    else cb();
  }
  function afterLeaflet(run){
    var tries = 0;
    function tick(){
      if (window.L && typeof L.map === 'function'){ domReady(run); return; }
      if (++tries > 400){ console.warn('[HFD] Leaflet not ready'); return; }
      setTimeout(tick, 25);
    }
    tick();
  }
  afterLeaflet(function(){

// === HFD: Leaflet-ready page-local guard (JS-only) ===
(function(){
  function waitForLeaflet(run){
    if (window.L && typeof L.map === 'function'){ run(); return; }
    var tries = 0, t = setInterval(function(){
      if (window.L && typeof L.map === 'function'){ clearInterval(t); run(); }
      else if (++tries > 400){ clearInterval(t); console.warn('[HFD] Leaflet not ready'); }
    }, 25);
  }
  waitForLeaflet(function(){
    // Expose created Leaflet map as window.map (safe shim)
    if (window.L && typeof L.map === 'function' && !L.map.__hfd_shimmed){
      var _orig = L.map;
      L.map = function(){
        var m = _orig.apply(this, arguments);
        try { window.map = m; } catch(e){}
        return m;
      };
      L.map.__hfd_shimmed = true;
    }

// === HFD safe query helper ===
function HFD_getSearchQuery(){
  var s = document.getElementById('mapSearchStreet');
  var c = document.getElementById('mapSearchCity');
  var x = document.getElementById('mapSearchInput');
  var street = s && typeof s.value === 'string' ? s.value.trim() : '';
  var city   = c && typeof c.value === 'string' ? c.value.trim() : 'Hopkinton';
  if (street) return (street + ', ' + (city||'Hopkinton')).trim();
  return x && typeof x.value === 'string' ? x.value.trim() : '';
}

(function(){
  const center = [42.2289, -71.5223]; // Hopkinton approx
  let map, searchMarker;

  function init(){
    const el = document.getElementById("map");
    if(!el){ console.error("Map container #map not found"); return; }

    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    // --- Mobile sizing fix ---
    function fixSizeSoon(delay=0){ setTimeout(()=> map.invalidateSize(true), delay); }
    map.once('load', () => fixSizeSoon(0));
    map.on('popupopen', () => fixSizeSoon(0));
    window.addEventListener('resize', () => fixSizeSoon(150));
    window.addEventListener('orientationchange', () => fixSizeSoon(300));


    if(L.Control && L.Control.Geocoder){
      L.Control.geocoder({ defaultMarkGeocode:false })
      .on('markgeocode', e => {
        const b = e.geocode.bbox; map.fitBounds(L.latLngBounds(b._southWest, b._northEast));
      }).addTo(map);
    }

    const form = document.getElementById("mapSearchForm");
    const input = document.getElementById("mapSearchInput");
    form.addEventListener("submit", async (e)=>{
      e.preventDefault(); var query = HFD_getSearchQuery();
      const q = HFD_getSearchQuery(); if(!q) return;
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

// === Sets the long lat markers to a mini fire hydranr ===

function loadLayers(map){
  const files = ["data/hopkinton_fire_department___hydrants.geojson"];

  // your existing icon…
  const icon = L.divIcon({
    className:"hydrant-pin",
    html:`<svg viewBox="0 0 64 64" width="20" height="20">
      <rect x="26" y="24" width="12" height="24" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
      <circle cx="32" cy="20" r="8" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
      <circle cx="20" cy="36" r="4" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="44" cy="36" r="4" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
      <rect x="24" y="48" width="16" height="4" fill="#7f1d1d"/>
    </svg>`
  });

  // ---- Landing Zone detector ----
  function isLandingZone(p = {}){
    const id   = String(p.hydi_id ?? p.hyd_id ?? p.ID ?? "").trim().toUpperCase();
    const name = String(p.Name ?? p.name ?? "");
    const desc = String(p.Description ?? p.description ?? "");
    const type = String(p.Hyd_Type ?? p.type ?? "");
    // Heuristics: ID like "LZ###", or label/desc/type mentions "Landing Zone"
    return /^LZ\d*/.test(id)
        || /\bLanding\s*Zone\b/i.test(name)
        || /\bLanding\s*Zone\b/i.test(desc)
        || /\bLanding\s*Zone\b/i.test(type);
  }

  // simple HTML-escape
  const esc = v => (v == null ? "" :
    String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  fetch(files[0]).then(r=>r.json()).then(geojson=>{
    // (optional) count removed LZs for sanity
    let removed = 0;

    const layer = L.geoJSON(geojson, {
      // ⬅️ filter out landing zones here
      filter: (f) => {
        const keep = !isLandingZone(f?.properties);
        if (!keep) removed++;
        return keep;
      },
      pointToLayer: (_, latlng) => L.marker(latlng, {icon}),
onEachFeature: (f, l) => {
  const p = f.properties || {};

  const hydrantId = p.hydi_id ?? p.hyd_id ?? p.ID ?? "N/A";
  const notes     = p.Name ?? p.name ?? "";

  // Merge both description variants
  let description = [p.Description, p.description]
    .filter((v,i,arr)=>v && (i===0 || v!==arr[0]))
    .join(" / ");

  // --- CLEAN DUPLICATES FROM DESCRIPTION ---
  // 1) Normalize line breaks
  description = description.replace(/<br\s*\/?>/gi, '\n');

  // 2) Remove lines that are actually other fields you already show elsewhere
  const removeLabeledLine = new RegExp(
    String.raw`^\s*(?:` +
    [
      `street(?:_loc(?:ation)?)?`,  // street_loc, street_location
      `Hyd[_\\s-]*Type`,            // Hyd_Type, Hyd Type
      `main[_\\s-]*size`,           // main_size, main size
      `psi[_\\s-]*Static`,          // psi_Static
      `Residual[_\\s-]*psi`,        // Residual_psi
      `Flow[_\\s-]*gpm`,            // Flow_gpm
      `year`,                       // year
      `Latitude`,                   // Latitude
      `Longitude`,                  // Longitude
      `ID`                          // ID
    ].join('|') +
    String.raw`)\\s*:\\s*.*$`,
    'gim'
  );
  description = description.replace(removeLabeledLine, '');

  // 3) Drop lone “hyd_ 90” style artifacts
  description = description.replace(/^\s*hyd[_\s-]*\d+\s*$/gim, '');

  // 4) Collapse whitespace and convert back to <br>
  description = description
    .replace(/\n{2,}/g, '\n')
    .trim()
    .replace(/\n/g, '<br>');

  const street   = p.street_location ?? p.street_loc ?? "";
  const bldg     = p.Building_no ?? p.building_no ?? "";
  const mainSize = p.main_size ?? "";
  const gpm      = p.Flow_gpm ?? p.flow_gpm ?? "";
  const cautions = p.CAUTIONS ?? "";

  let lat = p.Latitude, lon = p.Longitude;
  if (lat == null || lon == null) {
    const coords = f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
    if (coords) { lon = lon ?? coords[0]; lat = lat ?? coords[1]; }
  }
  const latlon = (lat != null && lon != null) ? `${lat}, ${lon}` : "Unknown";

  const esc = v => (v == null ? "" :
    String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  const html = `
    <div class="hydrant-popup">
      <div><b>Hydrant ID:</b> ${esc(hydrantId)}</div>
      <div><b>Notes:</b> ${esc(notes) || "—"}</div>
      <div><b>Street Location:</b> ${esc(street) || "—"}</div>
      <div><b>Building Number:</b> ${esc(bldg) || "—"}</div>
      <div><b>Main Size:</b> ${esc(mainSize) || "—"}</div>
      <div><b>GPM:</b> ${esc(gpm) || "—"}</div>
      ${cautions ? `<div><b>CAUTIONS:</b> <span style="color:#b91c1c;font-weight:700">${esc(cautions)}</span></div>` : ""}
      <div><b>Latitude Longitude:</b> ${esc(latlon)}</div>
    </div>
  `;
  l.bindPopup(html);
}
    }).addTo(map);

    // Fit and log how many LZs were excluded (for debugging)
    try { map.fitBounds(layer.getBounds(), {padding:[20,20]}); } catch {}
    if (removed) console.info(`[HFD] Excluded ${removed} Landing Zone records from hydrant map.`);
  }).catch(()=> console.warn("hydrant GeoJSON not found."));
}



  loadLayers(map);
  }

  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); }
  else{ init(); }
})();

// === HFD: late binder to ensure toolbar search is wired ===
(function(){
  function tryBind(){
    if (typeof window.HFD_bindToolbarSearch !== 'function') return false;
    var m = window.map;
    if (!m || typeof m.setView !== 'function') return false;
    try {
      window.HFD_bindToolbarSearch(m, { zoom: 16, defaultCity: 'Hopkinton' });
      return true;
    } catch(e){ console.warn('HFD_bindToolbarSearch failed', e); return false; }
  }
  if (!tryBind()){
    var attempts = 0;
    var t = setInterval(function(){
      attempts++;
      if (tryBind() || attempts > 200){ clearInterval(t); }
    }, 50);
  }
})();

// === HFD late binder call (guards missing function) ===
(function(){
  function attempt(){
    if (window.map && typeof window.map.setView === 'function' && typeof window.HFD_bindToolbarSearch === 'function'){
      try { window.HFD_bindToolbarSearch(window.map, { zoom: 16, defaultCity: 'Hopkinton' }); } catch(e){ console.warn('bind search failed', e); }
      return true;
    }
    return false;
  }
  if (!attempt()){
    var tries = 0, t = setInterval(function(){ if (attempt() || ++tries > 200) clearInterval(t); }, 50);
  }
})();

// === HFD: robust late binder to avoid race with maps-boot.js ===
(function(){
  function attempt(){
    if (window.map && typeof window.map.setView === 'function' &&
        typeof window.HFD_bindToolbarSearch === 'function'){
      try { window.HFD_bindToolbarSearch(window.map, { zoom: 16, defaultCity: 'Hopkinton' }); }
      catch(e){ console.warn('[HFD] bind search failed', e); }
      return true;
    }
    return false;
  }
  if (!attempt()){
    var tries = 0, t = setInterval(function(){ if (attempt() || ++tries > 200) clearInterval(t); }, 50);
  }
})();


    // Post-init: nudge Leaflet to paint on small screens
    try {
      if (window.map && typeof window.map.invalidateSize === 'function'){
        setTimeout(function(){ window.map.invalidateSize(); }, 120);
        setTimeout(function(){ window.map.invalidateSize(); }, 400);
      }
      window.addEventListener('orientationchange', function(){
        if (window.map && window.map.invalidateSize){
          setTimeout(function(){ window.map.invalidateSize(); }, 180);
        }
      });
    } catch(e){}
  });
})();
// === HFD end guard ===

    try {
      if (window.map && typeof window.map.invalidateSize === 'function'){
        setTimeout(function(){ window.map.invalidateSize(); }, 120);
        setTimeout(function(){ window.map.invalidateSize(); }, 400);
        window.addEventListener('orientationchange', function(){ setTimeout(function(){ window.map.invalidateSize(); }, 180); });
      }
    } catch(e){}
  });
})();
// === end HFD guard ===

  });
})();
/* === end HFD Leaflet guard === */

/* HFD bootstrap: DOM then Leaflet, then init() (desktop-safe) */
HFD.whenDOMReady().then(() => HFD.whenLeafletReady()).then(() => {
  try { init(); } catch(e) { console.error('[HFD] init() failed:', e); }
  if (window.map && window.map.invalidateSize) {
    setTimeout(() => window.map.invalidateSize(), 200);
    setTimeout(() => window.map.invalidateSize(), 500);
    window.addEventListener('orientationchange', () => setTimeout(() => window.map.invalidateSize(), 180));
  }
});
