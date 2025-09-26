// cistern-map.js — Standalone script for Cistern Map page
(function(){
  const PATH_PREFIX = 'data/'; // where your .geojson files live

  // --- Toast helper ---
  function toast(id, msg) {
    const t = document.getElementById(id);
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => (t.style.display = 'none'), 4000);
  }

  // --- GeoJSON normalizer (tolerant) ---
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

  // --- Simple popup builder ---
  function defaultPopup(feature, layer) {
    const p = feature.properties || {};
    const title = p.name || p.title || p.label || null;
    const desc  = p.description || p.notes || null;
    const parts = [];
    if (title) parts.push(`<div class="pp-title"><strong>${title}</strong></div>`);
    if (desc)  parts.push(`<div class="pp-desc">${desc}</div>`);
    layer.bindPopup(parts.join('') || '<em>No details</em>', { maxWidth: 360 });
  }

  // --- Classification helpers ---
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
    return hay.includes('landing zone') || hay.includes('landing-zone') || hay.includes('landingzone');
  }

  // --- Cistern icon (red circle with white "C") ---
  function cisternIcon() {
    const html = `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="11" fill="#dc2626" stroke="white" stroke-width="2"/>
        <text x="13" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="Arial, sans-serif">C</text>
      </svg>`;
    return L.divIcon({ className: 'pin-icon cistern-icon', html, iconSize: [26,26], iconAnchor: [13,24], popupAnchor: [0,-20] });
  }

  // --- Map init ---
  const map = L.map('cistern-map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // --- Load cisterns, filter out dry hydrants & landing zones ---
  const url = PATH_PREFIX + 'hopkinton_fire_department___cisterns.geojson?v=' + Date.now();
  fetch(url).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(raw => {
    const data = normalizeGeoJSON(raw);
    const feats = (data.features || []).filter(f =>
      f && f.geometry && f.geometry.type === 'Point' &&
      !isDryHydrant(f.properties) && !isLandingZone(f.properties)
    );
    const fc = { type:'FeatureCollection', features: feats };

    const layer = L.geoJSON(fc, {
      pointToLayer: (f, latlng) => L.marker(latlng, { icon: cisternIcon(), riseOnHover: true }),
      onEachFeature: defaultPopup
    }).addTo(map);

    // Fit to markers
    const b = L.latLngBounds([]);
    layer.eachLayer(l => b.extend(l.getLatLng()));
    if (b.isValid()) map.fitBounds(b.pad(0.05));
    else toast('cistern-toast', 'Loaded cisterns, but found 0 points.');
  }).catch(err => {
    console.warn('Failed to load cisterns:', err);
    toast('cistern-toast', 'Failed to load Cisterns data');
  });

  // --- Address search (OSM Nominatim) ---
  document.getElementById('cistern-search-btn').addEventListener('click', () => {
    const q = document.getElementById('cistern-search-input').value.trim();
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

  // Warn if opened as file:// (fetch will be blocked)
  if (location.protocol === 'file:') {
    toast('cistern-toast', 'Open this page via a local web server (e.g., python3 -m http.server). Browsers block data/*.geojson over file://.');
  }
})();