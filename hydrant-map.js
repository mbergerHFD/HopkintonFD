// hydrant-map.js
// map-common.js — shared helpers for single-layer maps
const PATH_PREFIX = 'data/';
const map = L.map('map').setView([42.228534, -71.533708], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toast._tid); toast._tid = setTimeout(() => t.style.display = 'none', 4000);
}

if (location.protocol === 'file:') {
  toast('Open this page via a local web server (e.g., python3 -m http.server). Browsers block data/*.geojson over file://.');
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

function keyXY(lat, lon) { return (Math.round(lat*1e6)/1e6) + ',' + (Math.round(lon*1e6)/1e6); }

// Icons
function hydrantIcon() {
  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="30" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="white" stroke-width="1.2" fill="#e11d48">
        <rect x="7" y="3.5" width="10" height="2.2" rx="1"/>
        <rect x="9" y="6" width="6" height="12" rx="2"/>
        <rect x="8" y="18.2" width="8" height="2.2" rx="1"/>
        <circle cx="6" cy="12" r="2"/>
        <circle cx="18" cy="12" r="2"/>
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

const url = PATH_PREFIX + 'hopkinton_fire_department___hydrants.geojson?v=' + Date.now();
fetch(url).then(r=>r.json()).then(raw=>{
  const data = normalizeGeoJSON(raw);
  const layer = L.geoJSON(data, {
    pointToLayer: (f,latlng)=>L.marker(latlng,{icon:hydrantIcon(), riseOnHover:true}),
    onEachFeature: defaultPopup
  }).addTo(map);
  // fit
  const b = L.latLngBounds([]); layer.eachLayer(l=>b.extend(l.getLatLng())); if (b.isValid()) map.fitBounds(b.pad(0.05));
});
// search
document.getElementById('map-search-btn').addEventListener('click',()=>{
  const q = document.getElementById('map-search-input').value.trim(); if(!q) return;
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`).then(r=>r.json()).then(a=>{
    if(!a||!a.length) return toast('Address not found');
    const {lat,lon,display_name} = a[0]; map.setView([+lat,+lon],16); L.marker([+lat,+lon]).addTo(map).bindPopup(display_name).openPopup();
  }).catch(()=>toast('Search failed'));
});
