/* Water Maps JS — suppress point rendering in non-hydrant layers + dedupe LZ/Dry/Cistern at same coords */

const LAYER_INFO = {
  "Hydrants": { id: "hydrants", file: "hopkinton_fire_department___hydrants.geojson", color: "#e11d48", checked: true },
  "Cisterns": { id: "cisterns", file: "hopkinton_fire_department___cisterns.geojson", color: "#059669", checked: true },
  "Out of Hydrant District": { id: "outdistrict", file: "out_of_hydrant_district.geojson", color: "#b91c1c", checked: true },
  "All HFD Layers (optional)": { id: "hfd", file: "hopkinton_fire_department.geojson", color: "#7c3aed", checked: false }
};

const PATH_PREFIX = 'data/';

const map = L.map('map').setView([42.228534, -71.533708], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

const layers = {};
const layerBounds = {};
const allBounds = L.latLngBounds([]);

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toast._tid); toast._tid = setTimeout(() => t.style.display = 'none', 4500);
}

if (location.protocol === 'file:') {
  toast('Open this page via a local web server (e.g., python3 -m http.server). Browsers block data/*.geojson over file://.');
  console.warn('file:// detected — use a local server so fetch() can read GeoJSON.');
}

/* ---------- Icons ---------- */
function divPinIcon(hex) {
  const html = `
    <svg xmlns='http://www.w3.org/2000/svg' width='20' height='24' viewBox='0 0 24 28' aria-hidden='true'>
      <path d='M12 1C7.6 1 4 4.6 4 9c0 5 8 17 8 17s8-12 8-17c0-4.4-3.6-8-8-8z' fill='${hex}' stroke='white' stroke-width='1.2'/>
      <circle cx='12' cy='9' r='2.8' fill='white'/>
    </svg>`;
  return L.divIcon({ className: 'pin-icon', html, iconSize: [20,24], iconAnchor: [10,22], popupAnchor: [0,-18] });
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
function helicopterIcon() {
  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="14" fill="#2563eb" stroke="white" stroke-width="2"/>
      <path d="M6 15h18M15 8v14M11 12h8M11 18h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <rect x="13" y="13" width="4" height="4" fill="white"/>
    </svg>`;
  return L.divIcon({ className: 'pin-icon helicopter-icon', html, iconSize: [30,30], iconAnchor: [15,28], popupAnchor: [0,-24] });
}

/* ---------- Classification ---------- */
function isDryHydrant(props) {
  const p = props || {};
  if (p.dry_hydrant === true || p.DryHydrant === true) return true;
  const field = (p.type||p.Type||p.category||p.Category||p.facility||p.symbol||p.Symbol||"").toString().toLowerCase();
  if (field.includes('dry hydrant')||field.includes('dry-hydrant')||field.includes('dryhydrant')) return true;
  const hay = JSON.stringify(p).toLowerCase();
  if (hay.includes('dry hydrant')||hay.includes('dry-hydrant')||hay.includes('dryhydrant')) return true;
  if (/\bdh\b/.test(hay)) return true;
  return false;
}
function isLandingZone(props) {
  const p = props || {};
  if (p.landing_zone === true || p.LandingZone === true) return true;
  const field = (p.type||p.Type||p.category||p.Category||p.facility||p.symbol||p.Symbol||"").toString().toLowerCase();
  if (field.includes('landing zone')||field.includes('landing-zone')||field.includes('landingzone')) return true;
  const hay = JSON.stringify(p).toLowerCase();
  if (hay.includes('landing zone')||hay.includes('landing-zone')||hay.includes('landingzone')) return true;
  return false;
}

/* ---------- Popups ---------- */
function defaultPopup(feature, layer) {
  const pRaw = (feature && feature.properties) || {};
  const p = {};
  Object.keys(pRaw).forEach(k => { const l=k.toLowerCase(); if (p[l]==null||p[l]==='') p[l]=pRaw[k]; });
  const title = p.name || p.title || p.label || p['site name'] || null;
  const desc  = p.description || p.desc || p.notes || null;
  const exclude = new Set(['name','title','label','site name','description','desc','notes','lon','long','longitude','lat','latitude','_id','id','objectid']);
  const strip = x => String(x||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const titleStr = strip(title), descStr = strip(desc);
  const rows = []; const seen=new Set();
  for (const [kLower,v] of Object.entries(p)) {
    if (exclude.has(kLower)) continue;
    if (v==null || v==='') continue;
    if (seen.has(kLower)) continue;
    const vStr = strip(v);
    if (vStr && (vStr===titleStr || vStr===descStr)) continue;
    seen.add(kLower);
    const label = kLower.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    rows.push(`<div class="pp-row"><span class="pp-key">${label}</span><span class="pp-val">${typeof v==='boolean'?(v?'Yes':'No'):String(v)}</span></div>`);
  }
  const parts=[];
  if (title) parts.push(`<div class="pp-title"><strong>${title}</strong></div>`);
  if (desc) parts.push(`<div class="pp-desc">${desc}</div>`);
  if (rows.length) parts.push(`<div class="pp-grid">${rows.join('')}</div>`);
  layer.bindPopup(parts.join('')||'<em>No details</em>', { maxWidth: 360 });
}

/* ---------- Loaders ---------- */
let didAutoZoom = false;

/* key used for dedup at same coordinates */
function keyXY(lat, lon) {
  return (Math.round(lat*1e6)/1e6) + ',' + (Math.round(lon*1e6)/1e6);
}

function loadLayer(label, cfg) {
  const url = PATH_PREFIX + cfg.file + '?v=' + Date.now();
  fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(raw => {
    const data = normalizeGeoJSON(raw);
    const feats = Array.isArray(data.features) ? data.features : [];

    if (cfg.id === 'cisterns') {
      // Deduplicate per coordinate with priority: LandingZone > DryHydrant > Cistern
      const buckets = new Map();
      feats.forEach(f => {
        if (!f || !f.geometry || f.geometry.type !== 'Point') return;
        const lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        const k = keyXY(lat, lon);
        const props = f.properties || {};
        const tag = isLandingZone(props) ? 'lz' : isDryHydrant(props) ? 'dry' : 'cis';
        const rank = tag === 'lz' ? 3 : tag === 'dry' ? 2 : 1;
        const existing = buckets.get(k);
        if (!existing || rank > existing.rank) {
          buckets.set(k, { lat, lon, feature: f, tag, rank });
        }
      });

      const lzGroup  = L.layerGroup();
      const dryGroup = L.layerGroup();
      const cisGroup = L.layerGroup();

      buckets.forEach(({lat,lon,feature,tag}) => {
        let icon, group;
        if (tag === 'lz') { icon = helicopterIcon(); group = lzGroup; }
        else if (tag === 'dry') { icon = dryHydrantIcon(); group = dryGroup; }
        else { icon = cisternIcon(); group = cisGroup; }
        const m = L.marker([lat,lon], { icon, riseOnHover:true });
        defaultPopup(feature, m);
        group.addLayer(m);
      });

      layers['cisterns_lz'] = lzGroup;
      layers['cisterns_dry'] = dryGroup;
      layers['cisterns_cis'] = cisGroup;

      if (document.getElementById('layer-landingzones')?.checked) lzGroup.addTo(map);
      if (document.getElementById('layer-dryhydrants')?.checked) dryGroup.addTo(map);
      if (document.getElementById('layer-cisterns')?.checked) cisGroup.addTo(map);

      const b = L.latLngBounds([]);
      [lzGroup, dryGroup, cisGroup].forEach(g => g.eachLayer(l => b.extend(l.getLatLng())));
      if (b.isValid()) { layerBounds['cisterns_all'] = b; allBounds.extend(b); }
    } else {
      // IMPORTANT: suppress point markers in non-hydrant layers (prevents LZ pins echoing in outdistrict)
      const layer = L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          if (cfg.id === 'hydrants') return L.marker(latlng, { icon: hydrantIcon(), riseOnHover:true });
          return null; // returning null skips creating a marker for points
        },
        style: () => ({ color: cfg.color, weight: 2, fillOpacity: 0.1 }),
        onEachFeature: defaultPopup
      });
      layers[cfg.id] = layer;
      if (document.getElementById('layer-' + cfg.id)?.checked ?? cfg.checked) layer.addTo(map);

      const b = L.latLngBounds([]);
      layer.getLayers().forEach(l => { if (l.getLatLng) b.extend(l.getLatLng()); else if (l.getBounds) b.extend(l.getBounds()); });
      if (b.isValid()) { layerBounds[cfg.id] = b; allBounds.extend(b); }
      if (!didAutoZoom && cfg.id === 'hydrants' && b.isValid()) { didAutoZoom = true; map.fitBounds(b.pad(0.05)); }
    }

    console.log(`Loaded ${label} — features: ${feats.length}`);
  })
  .catch(err => { const opt = label.includes('(optional)'); toast(opt?`Optional layer skipped: ${label}`:`Failed to load ${label}: ${err.message}`); console.warn('Layer load error', label, err); });
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
    if (input.type==='Topology' && input.objects) throw new Error('This file is TopoJSON (convert to GeoJSON).');
    if (input.data) return normalizeGeoJSON(input.data);
    return { type:'FeatureCollection', features:[] };
  } catch(e) { console.warn('normalizeGeoJSON error:', e); return { type:'FeatureCollection', features:[] }; }
}

/* ---------- Wire up toggles ---------- */
document.addEventListener('DOMContentLoaded', () => {
  Object.entries(LAYER_INFO).forEach(([label, cfg]) => loadLayer(label, cfg));

  [['hydrants','hydrants'], ['outdistrict','outdistrict'], ['hfd','hfd']].forEach(([cbId, layerKey]) => {
    const cb = document.getElementById('layer-' + cbId);
    if (!cb) return;
    cb.addEventListener('change', (e) => {
      const layer = layers[layerKey];
      if (!layer) return;
      if (e.target.checked) layer.addTo(map); else map.removeLayer(layer);
    });
  });

  const mapKeyFor = (k) => k==='landingzones' ? 'cisterns_lz' : k==='dryhydrants' ? 'cisterns_dry' : 'cisterns_cis';
  ['landingzones','dryhydrants','cisterns'].forEach(key => {
    const cb = document.getElementById('layer-' + key);
    if (!cb) return;
    cb.addEventListener('change', (e) => {
      const layer = layers[mapKeyFor(key)];
      if (!layer) return;
      if (e.target.checked) layer.addTo(map); else map.removeLayer(layer);
    });
  });
});
