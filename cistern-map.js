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

// === HFD: Embed an existing toolbar into Leaflet control ===
function HFD_embedToolbarInLeaflet(map, selector){
  try{
    if(!map || !map.getContainer) return;
    var el = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if(!el) return;
    var Ctrl = L.Control.extend({
      onAdd: function(){
        var div = L.DomUtil.create('div','leaflet-control map-search-control');
        div.appendChild(el); // moves node into the control
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
      }
    });
    map.addControl(new Ctrl({position:'topright'}));
  }catch(e){ console.warn("HFD_embedToolbarInLeaflet error:", e); }
}
// === End HFD block ===

(function(){
  if (typeof window.__HFD_SEARCH_CSS__ === 'undefined') {
    window.__HFD_SEARCH_CSS__ = true;
    var css = [
      ".map-search-control{background:#fff;padding:8px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:clamp(220px,35vw,420px);z-index:1200;}",
      ".map-search-control input[type=text],.map-search-control input[type=search]{width:100%;border:1px solid #ccc;border-radius:6px;padding:8px 10px;outline:none;}",
      ".map-search-control button{padding:6px 10px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7;cursor:pointer;margin-left:6px;}",
      ".leaflet-top.leaflet-right .map-search-control{margin:12px 12px 0 0;}",
      ".leaflet-top.leaflet-left .map-search-control{margin:12px 0 0 12px;}"
    ].join("\\n");
    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  }
})();

/* HFD map bootstrap */
(function(){
  var tries = 0;
  var timer = setInterval(function(){
    var candidate = (typeof map !== 'undefined' && map && map.getContainer) ? map : null;
    if (candidate && typeof HFD_embedToolbarInLeaflet === 'function'){
      HFD_embedToolbarInLeaflet(candidate, '#mapToolbar');
      clearInterval(timer);
    }
    if (++tries > 100) clearInterval(timer);
  }, 100);
})();
