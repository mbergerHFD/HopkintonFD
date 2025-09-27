
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

// out-of-hydrant-map.js — only Out-of-Hydrant District features from hopkinton_fire_department.geojson
(function(){
  const center = [42.2289, -71.5223];
  let map, searchMarker;

  function isOutOfHydrant(props={}){
    const vals = Object.values(props).join(" ").toLowerCase();
    // match common labels/abbreviations
    return /out[-\s]?of[-\s]?hydrant|out[-\s]?of[-\s]?district|\booh\b|no[-\s]?hydrant/.test(vals);
  }

  async function fetchGeoJSON(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error("Failed to load "+url);
    return r.json();
  }

  function init(){
    const el = document.getElementById("map");
    if(!el){ console.error("Map container #map not found"); return; }

    map = L.map(el).setView(center, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

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
          map.setView([lat,lon], 14);
        } else { alert("No results found."); }
      }catch(err){ console.error(err); alert("Search failed."); }
    });

    const style = { color:"#f59e0b", weight:3, fillColor:"#f59e0b", fillOpacity:0.15 };

    fetchGeoJSON("data/hopkinton_fire_department.geojson")
      .then(geojson => {
        // Filter polygons/lines that are labeled as out-of-hydrant (or similar)
        const only = {
          type: "FeatureCollection",
          features: (geojson.features||[]).filter(f => {
            const geomType = f.geometry && f.geometry.type;
            const isArea = /Polygon|MultiPolygon|LineString|MultiLineString/.test(geomType||"");
            return isArea && isOutOfHydrant(f.properties || {});
          })
        };

        const layer = L.geoJSON(only, { style }).addTo(map);
        try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
        console.log("[out-of-hydrant] features:", layer.getLayers().length);
      })
      .catch(err => console.error("Failed to load out-of-hydrant:", err));
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

