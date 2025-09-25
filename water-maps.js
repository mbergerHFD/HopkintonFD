/* Water Maps JS — enhanced diagnostics & robust GeoJSON handling */

const LAYER_INFO = {
  "Hydrants": { id: "hydrants", file: "hopkinton_fire_department___hydrants.geojson", color: "#e11d48", checked: true },
  "Cisterns": { id: "cisterns", file: "hopkinton_fire_department___cisterns.geojson", color: "#059669", checked: true },
  "Out of Hydrant District": { id: "outdistrict", file: "out_of_hydrant_district.geojson", color: "#b91c1c", checked: true },
  "All HFD Layers (optional)": { id: "hfd", file: "hopkinton_fire_department.geojson", color: "#7c3aed", checked: false }
};

/* Force a single known folder to simplify: set to 'data/' for your site. */
const PATH_PREFIX = 'data/';

const map = L.map('map').setView([42.228534, -71.533708], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

const layers = {};
const layerBounds = {};
const allBounds = L.latLngBounds([]);

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 4000);
}

// DivIcon SVG pin (no data: URLs)
function divPinIcon(hex) {
  const html = `
    <svg xmlns='http://www.w3.org/2000/svg' width='20' height='24' viewBox='0 0 24 28' aria-hidden='true'>
      <path d='M12 1C7.6 1 4 4.6 4 9c0 5 8 17 8 17s8-12 8-17c0-4.4-3.6-8-8-8z' fill='${hex}' stroke='white' stroke-width='1.2'/>
      <circle cx='12' cy='9' r='2.8' fill='white'/>
    </svg>`;
  return L.divIcon({
    className: 'pin-icon',
    html,
    iconSize: [20, 24],
    iconAnchor: [10, 22],
    popupAnchor: [0, -18]
  });
}

function pointToDivPin(hex) {
  const icon = divPinIcon(hex);
  return (feature, latlng) => L.marker(latlng, { icon, riseOnHover: true });
}

/* -------- Robust GeoJSON normalization ---------- */
function normalizeGeoJSON(input) {
  try {
    if (!input) return { type: 'FeatureCollection', features: [] };

    // Already FeatureCollection
    if (input.type === 'FeatureCollection' && Array.isArray(input.features)) return input;

    // Single Feature
    if (input.type === 'Feature') return { type: 'FeatureCollection', features: [input] };

    // Array of features/geometries
    if (Array.isArray(input)) {
      // If array of Features
      if (input.length && input[0] && input[0].type === 'Feature') {
        return { type: 'FeatureCollection', features: input };
      }
      // If array of coordinates/objects – try to wrap as points if lon/lat present
      const feats = input.map((v, i) => {
        if (v && typeof v === 'object' && 'lon' in v && 'lat' in v) {
          return { type: 'Feature', geometry: { type: 'Point', coordinates: [Number(v.lon), Number(v.lat)] }, properties: { index: i, ...v } };
        }
        return null;
      }).filter(Boolean);
      return { type: 'FeatureCollection', features: feats };
    }

    // GeometryCollection
    if (input.type === 'GeometryCollection' && Array.isArray(input.geometries)) {
      const feats = input.geometries.map(g => ({ type: 'Feature', geometry: g, properties: {} }));
      return { type: 'FeatureCollection', features: feats };
    }

    // TopoJSON is unsupported here; detect and inform
    if (input.type === 'Topology' && input.objects) {
      throw new Error('This file is TopoJSON. Please convert to GeoJSON.');
    }

    // Some exports put data under input.data
    if (input.data) return normalizeGeoJSON(input.data);

    // Fallback: no features
    return { type: 'FeatureCollection', features: [] };
  } catch (e) {
    console.warn('normalizeGeoJSON error:', e);
    return { type: 'FeatureCollection', features: [] };
  }
}

function defaultPopup(feature, layer) {
  const p = feature.properties||{};
  const name = p.name ? `<strong>${p.name}</strong>` : '';
  const desc = p.description ? `<div>${p.description}</div>` : '';
  const rest = Object.entries(p).filter(([k])=>k!=='name'&&k!=='description').map(([k,v])=>`<div><em>${k}</em>: ${v}</div>`).join('');
  const html = name + desc + (rest?`<div style="margin-top:6px">${rest}</div>`:'');
  if (html) layer.bindPopup(html);
}

function loadLayer(label, cfg) {
  const url = PATH_PREFIX + cfg.file + '?v=' + Date.now();
  fetch(url).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + cfg.file);
    return r.json();
  }).then(raw => {
    const data = normalizeGeoJSON(raw);
    const feats = Array.isArray(data.features) ? data.features : [];
    const hasAny = feats.length > 0;
    const isPoints = hasAny && feats.every(f => f.geometry && f.geometry.type === 'Point');

    const layer = L.geoJSON(data, {
      pointToLayer: isPoints ? pointToDivPin(cfg.color) : undefined,
      style: () => ({ color: cfg.color, weight: 2, fillOpacity: 0.1 }),
      onEachFeature: defaultPopup
    });
    layers[cfg.id] = layer;

    const checkbox = document.getElementById('layer-' + cfg.id);
    if (checkbox && checkbox.checked) layer.addTo(map);

    const b = L.latLngBounds([]);
    layer.getLayers().forEach(l => { if (l.getLatLng) b.extend(l.getLatLng()); else if (l.getBounds) b.extend(l.getBounds()); });
    if (b.isValid()) { layerBounds[cfg.id] = b; allBounds.extend(b); }

    console.log(`Loaded ${label} from ${url} — features: ${feats.length}, pointsOnly: ${isPoints}`);
    if (!hasAny) toast(`Loaded ${label}, but found 0 features. Check the GeoJSON contents.`);
  }).catch(err => {
    const optional = label.includes('(optional)');
    const msg = optional ? ('Optional layer skipped: ' + label) : ('Failed to load ' + label + ': ' + err.message);
    toast(msg);
    console.warn('Layer load error for', label, cfg.file, err);
  });
}

// Kick off loading
Object.entries(LAYER_INFO).forEach(([label, cfg]) => loadLayer(label, cfg));

// Search
document.getElementById('map-search-btn').addEventListener('click', () => {
  const q = document.getElementById('map-search-input').value.trim();
  if (!q) return;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
  fetch(url, { headers: {'Accept': 'application/json'}, referrerPolicy: 'no-referrer' }).then(r => r.json()).then(arr => {
    if (!arr || !arr.length) { toast('Address not found'); return; }
    const r0 = arr[0]; const lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
    map.setView([lat, lon], 16);
    L.marker([lat, lon]).addTo(map).bindPopup(r0.display_name).openPopup();
  }).catch(()=>toast('Search failed'));
});
document.getElementById('map-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('map-search-btn').click(); } });

// Zoom select
document.getElementById('zoom-select').addEventListener('change', (e) => {
  const val = e.target.value; if (!val) return;
  if (val === 'all') { if (allBounds.isValid()) map.fitBounds(allBounds.pad(0.05)); return; }
  const b = layerBounds[val]; if (b && b.isValid()) map.fitBounds(b.pad(0.05));
});

// Layer visibility checkboxes
Object.values(LAYER_INFO).forEach(cfg => {
  const cb = document.getElementById('layer-' + cfg.id);
  if (!cb) return;
  cb.addEventListener('change', (e) => {
    const layer = layers[cfg.id]; if (!layer) return;
    if (e.target.checked) layer.addTo(map); else map.removeLayer(layer);
  });
});
