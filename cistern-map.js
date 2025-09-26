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

// Neutralize any old helpers that tried to move the toolbar into the map
window.HFD_embedToolbarInLeaflet = function(){ /* no-op */ };
window.addLeafletSearchControl = function(){ /* no-op */ };

