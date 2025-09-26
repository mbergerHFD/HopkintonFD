
// water-maps-embed.js — two independent maps on one page (hydrants top, cisterns bottom)
(function(){
  const PATH_PREFIX = 'data/';

  function toast(id, msg) {
    const t = document.getElementById(id); if(!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._tid); t._tid = setTimeout(()=> t.style.display = 'none', 4000);
  }

  function normalizeGeoJSON(input) {
    try {
      if (!input) return { type:'FeatureCollection', features:[] };
      if (input.type==='FeatureCollection' && Array.isArray(input.features)) return input;
      if (input.type==='Feature') return { type:'FeatureCollection', features:[input] };
      if (Array.isArray(input)) {
        if (input.length && input[0] && input[0].type==='Feature') return { type:'FeatureCollection', features:input };
        const feats = input.map((v,i)=> (v && typeof v==='object' && 'lon' in v && 'lat' in v)
          ? { type:'Feature', geometry:{ type:'Point', coordinates:[Number(v.lon), Number(v.lat)] }, properties:{ index:i, ...v } }
          : null).filter(Boolean);
        return { type:'FeatureCollection', features:feats };
      }
      if (input.type==='GeometryCollection' && Array.isArray(input.geometries))
        return { type:'FeatureCollection', features: input.geometries.map(g=>({type:'Feature', geometry:g, properties:{}})) };
      if (input.type==='Topology' && input.objects) throw new Error('This is TopoJSON (convert to GeoJSON).');
      if (input.data) return normalizeGeoJSON(input.data);
      return { type:'FeatureCollection', features:[] };
    } catch(e) { return { type:'FeatureCollection', features:[] }; }
  }

  function defaultPopup(feature, layer) {
    const p = feature.properties||{};
    const title = p.name || p.title || p.label || null;
    const desc = p.description || p.notes || null;
    const parts = [];
    if (title) parts.push(`<div class="pp-title"><strong>${title}</strong></div>`);
    if (desc) parts.push(`<div class="pp-desc">${desc}</div>`);
    layer.bindPopup(parts.join('')||'<em>No details</em>', { maxWidth: 360 });
  }

  // Icons
  function hydrantIcon() {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="30" viewBox="0 0 24 24" aria-hidden="true">
        <g stroke="white" stroke-width="1.2" fill="#e11d48">
          <rect x="7" y="3.5" width="10" height="2.2" rx="1"/>
          <rect x="9" y="6" width="6" height="12" rx="2"/>
          <rect x="8" y="18.2" width="8" height="2.2" rx="1"/>
          <circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>
        </g>
      </svg>`;
    return L.divIcon({ className: 'pin-icon hydrant-icon', html, iconSize: [26,30], iconAnchor: [13,28], popupAnchor: [0,-24] });
  }
  function cisternIcon() {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="11" fill="#dc2626" stroke="white" stroke-width="2"/>
        <text x="13" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="Arial, sans-serif">C</text>
      </svg>`;
    return L.divIcon({ className: 'pin-icon cistern-icon', html, iconSize: [26,26], iconAnchor: [13,24], popupAnchor: [0,-20] });
  }
  function isDryHydrant(p){p=p||{}; if(p.dry_hydrant===true||p.DryHydrant===true)return true; const h=(JSON.stringify(p)+'').toLowerCase(); return h.includes('dry hydrant')||h.includes('dry-hydrant')||h.includes('dryhydrant');}
  function isLandingZone(p){p=p||{}; if(p.landing_zone===true||p.LandingZone===true)return true; const h=(JSON.stringify(p)+'').toLowerCase(); return h.includes('landing zone')||h.includes('landing-zone')||h.includes('landingzone');}

  // --- Hydrant map (top) ---
  const hydrantMap = L.map('hydrant-map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(hydrantMap);
  fetch(PATH_PREFIX + 'hopkinton_fire_department___hydrants.geojson?v=' + Date.now())
    .then(r=>r.json()).then(raw=>{
      const data = normalizeGeoJSON(raw);
      const layer = L.geoJSON(data, {
        pointToLayer: (f,latlng)=>L.marker(latlng,{icon:hydrantIcon(), riseOnHover:true}),
        onEachFeature: defaultPopup
      }).addTo(hydrantMap);
      const b = L.latLngBounds([]); layer.eachLayer(l=>b.extend(l.getLatLng())); if (b.isValid()) hydrantMap.fitBounds(b.pad(0.05));
    }).catch(()=>toast('hydrant-toast','Failed to load Hydrants'));

  document.getElementById('hydrant-search-btn').addEventListener('click',()=>{
    const q = document.getElementById('hydrant-search-input').value.trim(); if(!q) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
      .then(r=>r.json()).then(a=>{
        if(!a||!a.length) return toast('hydrant-toast','Address not found');
        const {lat,lon,display_name} = a[0]; hydrantMap.setView([+lat,+lon],16);
        L.marker([+lat,+lon]).addTo(hydrantMap).bindPopup(display_name).openPopup();
      }).catch(()=>toast('hydrant-toast','Search failed'));
  });

  // --- Cistern map (bottom) ---
  const cisternMap = L.map('cistern-map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(cisternMap);
  fetch(PATH_PREFIX + 'hopkinton_fire_department___cisterns.geojson?v=' + Date.now())
    .then(r=>r.json()).then(raw=>{
      const data = normalizeGeoJSON(raw);
      const feats = (data.features||[]).filter(f=>f.geometry && f.geometry.type==='Point' && !isDryHydrant(f.properties) && !isLandingZone(f.properties));
      const fc = {type:'FeatureCollection', features:feats};
      const layer = L.geoJSON(fc, {
        pointToLayer:(f,latlng)=>L.marker(latlng,{icon:cisternIcon(), riseOnHover:true}),
        onEachFeature: defaultPopup
      }).addTo(cisternMap);
      const b = L.latLngBounds([]); layer.eachLayer(l=>b.extend(l.getLatLng())); if (b.isValid()) cisternMap.fitBounds(b.pad(0.05));
    }).catch(()=>toast('cistern-toast','Failed to load Cisterns'));

  document.getElementById('cistern-search-btn').addEventListener('click',()=>{
    const q = document.getElementById('cistern-search-input').value.trim(); if(!q) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
      .then(r=>r.json()).then(a=>{
        if(!a||!a.length) return toast('cistern-toast','Address not found');
        const {lat,lon,display_name} = a[0]; cisternMap.setView([+lat,+lon],16);
        L.marker([+lat,+lon]).addTo(cisternMap).bindPopup(display_name).openPopup();
      }).catch(()=>toast('cistern-toast','Search failed'));
  });

})();