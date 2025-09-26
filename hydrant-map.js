// hydrant-map.js — robust hydrant loader with fallbacks and clearer errors
(function(){
  // ---- Guards ----
  if (!document.getElementById('hydrant-map')) {
    console.error('[hydrant-map] Missing <div id="hydrant-map"> in the page.');
    return;
  }
  if (typeof L === 'undefined') {
    console.error('[hydrant-map] Leaflet not loaded. Include leaflet/leaflet.js and leaflet/leaflet.css.');
    return;
  }

  const PATH_PREFIX = 'data/'; // folder for GeoJSON files
  // Try common filenames (case / spacing variations) until one loads:
  const CANDIDATES = [
    'hopkinton_fire_department___hydrants.geojson',
    'Hopkinton Fire Department - Hydrants.geojson',
    'hydrants.geojson',
    'Hydrants.geojson'
  ];

  function toast(id, msg) {
    const t = document.getElementById(id);
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => (t.style.display = 'none'), 4500);
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

  // --- Map init ---
  const map = L.map('hydrant-map').setView([42.228534, -71.533708], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // --- Fetch with fallbacks ---
  async function fetchFirstWorking() {
    for (const name of CANDIDATES) {
      const url = PATH_PREFIX + name + '?v=' + Date.now();
      try {
        const r = await fetch(url, { cache:'no-store' });
        if (!r.ok) { console.warn('[hydrant-map] Not found:', url, r.status); continue; }
        const json = await r.json();
        console.info('[hydrant-map] Loaded', url);
        return json;
      } catch (e) {
        console.warn('[hydrant-map] Fetch failed for', url, e);
      }
    }
    throw new Error('No hydrant GeoJSON found under data/. Tried: ' + CANDIDATES.join(', '));
  }

  fetchFirstWorking().then(raw => {
    const data = normalizeGeoJSON(raw);
    const feats = (data.features || []).filter(f => f && f.geometry && f.geometry.type === 'Point');
    if (!feats.length) {
      toast('hydrant-toast', 'Hydrant file loaded, but contains 0 points.');
      console.warn('[hydrant-map] No Point features in file.');
    }
    const layer = L.geoJSON({ type:'FeatureCollection', features:feats }, {
      pointToLayer: (f, latlng) => L.marker(latlng, { icon: hydrantIcon(), riseOnHover: true }),
      onEachFeature: defaultPopup
    }).addTo(map);

    const b = L.latLngBounds([]);
    layer.eachLayer(l => b.extend(l.getLatLng()));
    if (b.isValid()) map.fitBounds(b.pad(0.05));
  }).catch(err => {
    console.error('[hydrant-map] ' + err.message);
    toast('hydrant-toast', 'Failed to load hydrants: ' + err.message);
    if (location.protocol === 'file:') {
      toast('hydrant-toast', 'Tip: run a local server (python3 -m http.server) so fetch() can read data/*.geojson');
    }
  });

  // --- Address search ---
  const btn = document.getElementById('hydrant-search-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const qEl = document.getElementById('hydrant-search-input');
      const q = (qEl && qEl.value || '').trim();
      if (!q) return;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`)
        .then(r => r.json())
        .then(arr => {
          if (!arr || !arr.length) return toast('hydrant-toast','Address not found');
          const { lat, lon, display_name } = arr[0];
          map.setView([+lat, +lon], 16);
          L.marker([+lat, +lon]).addTo(map).bindPopup(display_name).openPopup();
        })
        .catch(() => toast('hydrant-toast', 'Search failed'));
    });
  }

  if (location.protocol === 'file:') {
    console.warn('[hydrant-map] file:// detected — use a local web server so fetch() can load data/*.geojson');
  }
})();