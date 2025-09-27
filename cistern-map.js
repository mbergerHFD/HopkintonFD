
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

  function isLandingZone(p = {}){
  const id   = String(p.ID ?? p.id ?? p.hyd_id ?? '').toUpperCase();
  const name = String(p.Name ?? p.name ?? '');
  const desc = String(p.Description ?? p.description ?? '');
  const type = String(p.Type ?? p.type ?? '');
  return /^LZ\d*/.test(id)
      || /\bLanding\s*Zone\b/i.test(name)
      || /\bLanding\s*Zone\b/i.test(desc)
      || /\bLanding\s*Zone\b/i.test(type);
}

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

    
  function loadLayers(map){
    const files = ["data/hopkinton_fire_department___cisterns.geojson"];
    const icon = L.divIcon({className:"cistern-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#10b981" stroke="#065f46" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>'
    });
    fetch(files[0]).then(r=>r.json()).then(geojson=>{
const esc = v => (v == null ? "" :
  String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));


const layer = L.geoJSON(geojson, {
  filter: (f) => {
    const g = f && f.geometry && f.geometry.type;
    if (g !== 'Point') return false;
    return !isLandingZone(f.properties || {});
  },
  pointToLayer: (_, latlng) => L.marker(latlng, {icon}),
  onEachFeature: (f, l) => {
    const p = f.properties || {};
    const esc = v => (v == null ? "" : String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
    const pick = (...keys) => {
      for (const k of keys) {
        if (p.hasOwnProperty(k) && p[k] != null && String(p[k]).trim() !== "") return p[k];
        const kc = Object.keys(p).find(x => x.toLowerCase() === String(k).toLowerCase());
        if (kc && p[kc] != null && String(p[kc]).trim() !== "") return p[kc];
      }
      return "";
    };
const name = pick("Name","name");
const location  = pick("Location","location","street_location","street_loc","Address","address");
    const type      = pick("Type","type");
    const capacity  = pick("Capacity (gal)","Capacity_gal","capacity_gal","capacity");
    const status    = pick("Status","status");
    const access    = pick("Access","access");
    const depth     = pick("Depth","depth");
    const diameter  = pick("Diameter","diameter");
    const year      = pick("Year","year");
    const descMerged = [pick("Description"), pick("description")]
      .filter((v,i,a)=>v && (i===0 || v!==a[0]))
      .join(" / ")
      .replace(/^\s*$/,"");
// -- Clean unwanted labels from description --
let description = descMerged
  .replace(/ID:\s*\S+/gi, "")
  .replace(/Description:\s*/gi, "")
  .replace(/Latitude:[^<\n]*/gi, "")
  .replace(/Longitude:[^<\n]*/gi, "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/\s{2,}/g, " ")
  .trim();


    let lat = pick("Latitude","latitude"), lon = pick("Longitude","longitude");
    if (lat === "" || lon === "") {
      const coords = f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
      if (coords) { lon = lon || coords[0]; lat = lat || coords[1]; }
    }
    const coord = (lat !== "" && lon !== "") ? `${lat}, ${lon}` : "—";

    const rows = [];
    const addRow = (label, value) => rows.push(
      `<tr><td style="padding:4px 6px; color:#374151;"><b>${label}</b></td><td style="padding:4px 6px;">${esc(value)}</td></tr>`
    );
if (location)  addRow("Location", location);
    if (type)      addRow("Type", type);
    if (capacity)  addRow("Capacity (gal)", capacity);
    if (status)    addRow("Status", status);
    if (access)    addRow("Access", access);
    if (depth)     addRow("Depth", depth);
    if (diameter)  addRow("Diameter", diameter);
    if (year)      addRow("Year", year);
    if (description) addRow("Description", description);
addRow("Coordinates", coord);

    const used = new Set(["ID","id","CISTERN_ID","cistern_id",
                          "Location","location","street_location","street_loc","Address","address",
                          "Type","type",
                          "Capacity (gal)","Capacity_gal","capacity_gal","capacity",
                          "Status","status",
                          "Access","access",
                          "Depth","depth",
                          "Diameter","diameter",
                          "Year","year",
                          "Name","name",
                          "Description","description",
                          "Latitude","latitude","Longitude","longitude"]);
    const otherRows = [];
    for (const [k,v] of Object.entries(p)) {
  if (used.has(k)) continue;
  if (v == null || String(v).trim() === "") continue;
  if (String(k).toLowerCase() === 'cistern') {
    otherRows.push(`<tr><td style="padding:4px 6px; color:#b91c1c; font-weight:700;">${esc(k)}</td><td style="padding:4px 6px; color:#b91c1c; font-weight:700;">${esc(v)}</td></tr>`);
  } else {
    otherRows.push(`<tr><td style="padding:4px 6px; color:#6b7280;">${esc(k)}</td><td style="padding:4px 6px;">${esc(v)}</td></tr>`);
  }
}
    const otherSection = otherRows.length ?
      `<tr><td colspan="2" style="padding:8px 6px 2px; color:#374151;"><b>Other</b></td></tr>${otherRows.join("")}` : "";

    const html = `
      <div class="cistern-popup">
        <div style="font-weight:700; font-size:1rem; margin-bottom:4px;"> ${esc(name || "Cistern")}</div>
        <table style="width:100%; border-collapse:collapse; font-size:.95rem;">
          ${rows.join("")}
          ${otherSection}
        </table>
      </div>
    `;
    l.bindPopup(html);
  }
}).addTo(map);


      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
    }).catch(()=> console.warn("Cistern GeoJSON not found."));
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
