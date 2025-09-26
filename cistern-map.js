// cistern-map.js — Cisterns + Dry Hydrants (excludes Landing Zones)
(function(){
  const PATH_PREFIX = 'data/'; // folder for GeoJSON files

  function toast(id, msg) {
    const t = document.getElementById(id);
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => (t.style.display = 'none'), 4000);
  }

  function normalizeGeoJSON(input) {
    try {
      if (!input) return { type:'FeatureCollection', features:[] };
      if (input.type === 'FeatureCollection' && Array.isArray(input.features)) return input;
      if (input.type === 'Feature') return { type:'FeatureCollection', features:[input] };
      if (Array.isArray(input)) {
        if (input.length && input[0] && input[0].type === 'Feature') return { type:'FeatureCollection', features: input };
        const feats = input.map((v,i)=>
          (v && typeof v === 'object' && 'lon' in v && 'lat' in v)
          ? { type:'Feature', geometry:{ type:'Point', coordinates:[Number(v.lon), Number(v.lat)] }, properties:{ index:i, ...v } }
          : null
        ).filter(Boolean);
        return { type:'FeatureCollection', features: feats };
      }
      if (input.type === 'GeometryCollection' && Array.isArray(input.geometries)) {
        return { type:'FeatureCollection', features: input.geometries.map(g=>({type:'Feature', geometry:g, properties:{}})) };
      }
      if (input.type === 'Topology' && input.objects) throw new Error('This file is TopoJSON (convert to GeoJSON)');
      if (input.data) return normalizeGeoJSON(input.data);
      return { type:'FeatureCollection', features:[] };
    } catch(e) {
      console.warn('normalizeGeoJSON error:', e);
      return { type:'FeatureCollection', features:[] };
    }
  }

  function defaultPopup(feature, layer) {
    const p = feature.properties || {};
    const title = p.name || p.title || p.label || null;
    const desc  = p.description || p.notes || null;
    const parts = [];
    if (title) parts.push(`<div class="pp-title"><strong>${title}</strong></div>`);
    if (desc)  parts.push(`<div class="pp-desc">${desc}</div>`);
    layer.bindPopup(parts.join('') || '<em>No details</em>', { maxWidth: 360 });
  }

  // Classification helpers
  function isDryHydrant(p){
    p = p || {};
    if (p.dry_hydrant === true || p.DryHydrant === true) return true;
    const hay = JSON.stringify(p).toLowerCase();
    return hay.includes('dry hydrant') || hay.includes('dry-hydrant') || hay.includes('dryhydrant') || /\bdh\b/.test(hay);
  }
  function isLandingZone(p){
    p = p || {};
    if (p.landing_zone === true || p.LandingZone === true) return true;
    const hay = JSON.stringify(p).toLowerCase();
    return hay.includes('landing zone') || hay.includes('landing-zone') || hay.includes('landingzone') || /\blz\b/.test(hay);
  }

  // Icons
  function cisternIcon() {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="11" fill="#dc2626" stroke="white" stroke-width="2"/>
        <text x="13" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="Arial, sans-serif">C</text>
      </svg>`;
    return L.divIcon({ className: 'pin-icon cistern-icon', html, iconSize: [26,26], iconAnchor: [13,24], popupAnchor: [0,-20] });
  }
  function dryHydrantIcon() {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="13" fill="#dc2626" stroke="white" stroke-width="2"/>
        <polygon points="14,5 11,9 13,9 13,11 15,11 15,9 17,9" fill="white"/>
        <polygon points="23,14 19,11 19,13 17,13 17,15 19,15 19,17" fill="white"/>
        <polygon points="14,23 17,19 15,19 15,17 13,17 13,19 11,19" fill="white"/>
        <polygon points="5,14 9,17 9,15 11,15 11,13 9,13 9,11" fill="white"/>
      </svg>`;
    return L.divIcon({ className: 'pin-icon dryhydrant-icon', html, iconSize: [28,28], iconAnchor: [14,26], popupAnchor: [0,-22] });
  }

  // Map init
  const map = L.map('cistern-map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Load cisterns (now includes Dry Hydrants; excludes Landing Zones)
  const url = PATH_PREFIX + 'hopkinton_fire_department___cisterns.geojson?v=' + Date.now();
  fetch(url).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(raw => {
    const data = normalizeGeoJSON(raw);
    const feats = (data.features || []).filter(f =>
      f && f.geometry && f.geometry.type === 'Point' && !isLandingZone(f.properties)
    );
    const fc = { type:'FeatureCollection', features: feats };

    const layer = L.geoJSON(fc, {
      pointToLayer: (f, latlng) => {
        const icon = isDryHydrant(f.properties) ? dryHydrantIcon() : cisternIcon();
        return L.marker(latlng, { icon, riseOnHover: true });
      },
      onEachFeature: defaultPopup
    }).addTo(map);

    const b = L.latLngBounds([]);
    layer.eachLayer(l => b.extend(l.getLatLng()));
    if (b.isValid()) map.fitBounds(b.pad(0.05));
    else toast('cistern-toast', 'Loaded file, but found 0 cistern/dry hydrant points.');
  }).catch(err => {
    console.warn('Failed to load cisterns:', err);
    toast('cistern-toast', 'Failed to load Cisterns data');
  });

  // Address search
  const btn = document.getElementById('cistern-search-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const qEl = document.getElementById('cistern-search-input');
      const q = (qEl && qEl.value || '').trim();
      if (!q) return;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
        .then(r => r.json())
        .then(arr => {
          if (!arr || !arr.length) return toast('cistern-toast','Address not found');
          const { lat, lon, display_name } = arr[0];
          map.setView([+lat, +lon], 16);
          L.marker([+lat, +lon]).addTo(map).bindPopup(display_name).openPopup();
        })
        .catch(() => toast('cistern-toast', 'Search failed'));
    });
  }

  if (location.protocol === 'file:') {
    toast('cistern-toast', 'Open via a local server (python3 -m http.server). Browsers block data/*.geojson over file://.');
  }
})();