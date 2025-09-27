
// === HFD: Mobile-safe Leaflet wait wrapper ===
(function(){
  function HFD_waitForLeaflet(run){
    if (window.L && typeof L.map === 'function'){ run(); return; }
    var tries = 0;
    (function tick(){
      if (window.L && typeof L.map === 'function'){ run(); return; }
      if (++tries > 400){ console.warn('[HFD] Leaflet did not load in time'); return; }
      setTimeout(tick, 25);
    })();
  }
  HFD_waitForLeaflet(function(){


// === HFD: safe search query helper (street+city with fallback) ===
function HFD_getSearchQuery(){
  var s = document.getElementById('mapSearchStreet');
  var c = document.getElementById('mapSearchCity');
  var x = document.getElementById('mapSearchInput'); // legacy single input
  var street = s && typeof s.value === 'string' ? s.value.trim() : '';
  var city   = c && typeof c.value === 'string' ? c.value.trim() : 'Hopkinton';
  if (street) return (street + ', ' + (city || 'Hopkinton')).trim();
  return x && typeof x.value === 'string' ? x.value.trim() : '';
}


// HFD: Shim L.map to expose the created map as window.map (for search + tooling)
(function(){
  if (window.L && typeof L.map === 'function' && !L.map.__hfd_shimmed){
    var _orig = L.map;
    L.map = function(){
      var m = _orig.apply(this, arguments);
      try { window.map = m; } catch(e){}
      return m;
    };
    L.map.__hfd_shimmed = true;
  }
})();

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

    
  function loadLayers(map){
    const files = ["data/hopkinton_fire_department___cisterns.geojson"];
    const icon = L.divIcon({className:"cistern-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#10b981" stroke="#065f46" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>'
    });
    fetch(files[0]).then(r=>r.json()).then(geojson=>{
      const layer = L.geoJSON(geojson, {
        pointToLayer: (_, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (f, l)=> l.bindPopup(f.properties?.name || "Cistern")
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
    }).catch(()=> console.warn("Cistern GeoJSON not found."));
  }

  loadLayers(map);
  }

  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); }
  else{ init(); }
})();
  });
})();
// === HFD: end wrapper ===


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


// === HFD: local search fallback (works without maps-boot.js) ===
(function(){
  function pickForm(){
    return document.getElementById('mapSearchForm') ||
           document.querySelector('.map-search') ||
           document.querySelector('.map-toolbar form') || null;
  }
  function ensureMarker(m, lat, lon){
    if (!m.__hfd_search_marker){ m.__hfd_search_marker = L.marker([lat, lon]).addTo(m); }
    else { m.__hfd_search_marker.setLatLng([lat, lon]); }
  }
  function doSearch(m, query){
    if (!query) return;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=0&namedetails=0&email=' +
              encodeURIComponent('webmaster@hopkintonfd.org') + '&q=' + encodeURIComponent(query);
    fetch(url, { headers: {Accept:'application/json'}, referrerPolicy:'no-referrer' })
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if (!rows || !rows.length) return;
        var r0 = rows[0], lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        m.setView([lat, lon], 16);
        ensureMarker(m, lat, lon);
      })
      .catch(function(err){ console.warn('[HFD] local search failed', err); });
  }
  function attach(){
    var form = pickForm();
    if (!form || !window.map) return false;
    if (form.__hfd_local_bound) return true;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var q = (typeof HFD_getSearchQuery === 'function') ? HFD_getSearchQuery() : '';
      doSearch(window.map, q);
    });
    var btn = form.querySelector('button[type="submit"], button');
    if (btn){
      btn.addEventListener('click', function(e){
        e.preventDefault();
        var q = (typeof HFD_getSearchQuery === 'function') ? HFD_getSearchQuery() : '';
        doSearch(window.map, q);
      });
    }
    form.__hfd_local_bound = true;
    return true;
  }
  if (!attach()){
    var tries = 0, t = setInterval(function(){ if (attach() || ++tries > 200) clearInterval(t); }, 50);
  }
})();

