// out-of-hydrant.js — Polygons/lines only (no point markers)
(function(){
  const PATH_PREFIX = 'data/';
  function normalizeGeoJSON(input) {
    try {
      if (!input) return { type:'FeatureCollection', features:[] };
      if (input.type === 'FeatureCollection' && Array.isArray(input.features)) return input;
      if (input.type === 'Feature') return { type:'FeatureCollection', features:[input] };
      return { type:'FeatureCollection', features:[] };
    } catch(e) { return { type:'FeatureCollection', features:[] }; }
  }
  const map = L.map('map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  fetch(PATH_PREFIX + 'out_of_hydrant_district.geojson?v=' + Date.now())
    .then(r=>r.json()).then(raw=>{
      const data = normalizeGeoJSON(raw);
      const layer = L.geoJSON(data, {
        filter: f => f && f.geometry && f.geometry.type !== 'Point', // <- never render points
        style: () => ({ color:'#b91c1c', weight:2, fillOpacity:0.08 })
      }).addTo(map);
      const b = L.latLngBounds([]);
      layer.eachLayer(l=>{ if(l.getBounds) b.extend(l.getBounds()); });
      if (b.isValid()) map.fitBounds(b.pad(0.05));
    });
})();