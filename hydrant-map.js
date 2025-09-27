
/* === HFD Leaflet guard: run page script only after Leaflet + DOM are ready (mobile-safe) === */
;(function(){
  function whenLeafletReady(fn){
    var tries = 0;
    (function tick(){
      if (window.L && typeof L.map === 'function'){
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
        else fn();
        return;
      }
      if (++tries > 400){ console.warn('[HFD] Leaflet not ready'); return; }
      setTimeout(tick, 25);
    })();
  }
  whenLeafletReady(function(){
// === HFD mobile-safe Leaflet guard (JS-only, no layout changes) ===
(function(){
  function domReady(cb){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, {once:true});
    else cb();
  }
  function afterLeaflet(run){
    var tries = 0;
    function tick(){
      if (window.L && typeof L.map === 'function'){ domReady(run); return; }
      if (++tries > 400){ console.warn('[HFD] Leaflet not ready'); return; }
      setTimeout(tick, 25);
    }
    tick();
  }
  afterLeaflet(function(){

// === HFD: Leaflet-ready page-local guard (JS-only) ===
(function(){
  function waitForLeaflet(run){
    if (window.L && typeof L.map === 'function'){ run(); return; }
    var tries = 0, t = setInterval(function(){
      if (window.L && typeof L.map === 'function'){ clearInterval(t); run(); }
      else if (++tries > 400){ clearInterval(t); console.warn('[HFD] Leaflet not ready'); }
    }, 25);
  }
  waitForLeaflet(function(){
    // Expose created Leaflet map as window.map (safe shim)
    if (window.L && typeof L.map === 'function' && !L.map.__hfd_shimmed){
      var _orig = L.map;
      L.map = function(){
        var m = _orig.apply(this, arguments);
        try { window.map = m; } catch(e){}
        return m;
      };
      L.map.__hfd_shimmed = true;
    }
// hydrant-map.js — diagnostic build (logs + safe fallbacks)
(function(){
  const center = [42.2289, -71.5223]; let map, searchMarker;

  // --- Helpers
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const qs = new URLSearchParams(location.search);
  const nofilter = qs.get("nofilter") === "1";

  function parseDescriptionBlob(txt){
    if (!txt) return {};
    const lines = String(txt).split(/\r?\n/);
    const obj = {};
    for (let ln of lines){
      const m = ln.match(/^\s*([^:]+)\s*:\s*(.*)\s*$/);
      if (m){ obj[m[1].trim()] = m[2].trim(); }
    }
    return obj;
  }

  function normalize(props){
    const p = {...props};
    const descPairs = parseDescriptionBlob(p.description || p.Description || "");
    for (const [k,v] of Object.entries(descPairs)){
      if (v && (p[k] == null || p[k] === "")) p[k] = v;
    }
    const building = p.Building_no || p.building_no || p.hyd_no || p.hydrant_no || p.hyd_id || "";
    const street   = p.street_loc || p.Street || p.Address || p.addr || p.location || "";
    const hydType  = p.Hyd_Type || p.type || p.Type || "";
    const size     = p.main_size || p.Main_Size || p.size || "";
    const flow     = p.Flow_gpm || p.flow_gpm || p.flow || "";
    const psiS     = p.psi_Static || p.static_psi || p.static || "";
    const psiR     = p.Residual_psi || p.residual_psi || p.residual || "";
    const year     = p.year != null ? String(p.year).replace(/\.0$/, "") : "";
    const lon      = p.Longitude || p.longitude || p.lon || "";
    const lat      = p.Latitude || p.latitude || p.lat || "";
    const clean = s => (s || "").toString().replace(/\\"/g,'"').replace(/\s+/g,' ').trim();
    return { building: clean(building), street: clean(street), hydType: clean(hydType), size: clean(size),
      flow: clean(flow), psiS: clean(psiS), psiR: clean(psiR), year: clean(year), lon: clean(lon),
      lat: clean(lat), props: p };
  }

  function buildPopup(allProps){
    const n = normalize(allProps);
    const coreRows = [
      ["Type", n.hydType || "–"],
      ["Main Size", n.size || "–"],
      ["Flow (gpm)", n.flow || "–"],
      ["Static PSI", n.psiS || "–"],
      ["Residual PSI", n.psiR || "–"],
      ["Year", n.year || "–"]
    ];
    const titleLine = `Hydrant ${n.building ? "#" + esc(n.building) : ""}`;
    const streetLine = n.street ? `<p style="margin:0 0 8px; color:#111;"><strong>${esc(n.street)}</strong></p>` : "";
    const coreTable = `
      <table style="width:100%; border-collapse: collapse; font-size:0.92rem;">
        ${coreRows.map(([k,v]) => `<tr><td style="padding:4px 6px; color:#374151;"><strong>${esc(k)}</strong></td><td style="padding:4px 6px;">${esc(v)}</td></tr>`).join("")}
        ${(n.lat || n.lon) ? `<tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td><td style="padding:4px 6px;">${esc(n.lat||"–")}, ${esc(n.lon||"–")}</td></tr>` : ""}
      </table>`;
    return `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; min-width:260px;">
      <h3 style="margin:0 0 6px; font-size:1.1rem; color:#b91c1c;">${titleLine}</h3>${streetLine}${coreTable}</div>`;
  }

  function hydrantSources(){
    const urlParam = new URLSearchParams(location.search).get("hydrants");
    const c = []; if (urlParam) c.push(urlParam);
    c.push("data/hopkinton_fire_department___hydrants.geojson","data/hydrants.geojson","hydrants.geojson",
           "../data/hopkinton_fire_department___hydrants.geojson","../data/hydrants.geojson","../hydrants.geojson",
           "/data/hopkinton_fire_department___hydrants.geojson","/data/hydrants.geojson","/hydrants.geojson");
    return [...new Set(c)];
  }

  function sanitizeJSONText(s){
    let out="",inStr=false,escaped=false;
    for (let i=0;i<s.length;i++){
      const ch=s[i];
      if (inStr){
        if (escaped){ out+=ch; escaped=false; continue; }
        if (ch==="\\"){ out+=ch; escaped=true; continue; }
        if (ch==='"'){ out+=ch; inStr=false; continue; }
        if (ch==="\n"){ out+="\\n"; continue; }
        if (ch==="\r"){ out+="\\r"; continue; }
        if (ch==="\t"){ out+="\\t"; continue; }
        out+=ch;
      } else {
        out+=ch; if (ch==='"'){ inStr=true; escaped=false; }
      }
    }
    return out;
  }

  async function fetchAny(paths){
    for (let path of paths){
      try{
        const absolute = new URL(path, location.href).toString();
        const r = await fetch(absolute, {cache:'no-cache'});
        if (!r.ok){ console.warn("[hydrant-map] Not found:", absolute, r.status); continue; }
        const text = await r.text();
        try{ console.log("[hydrant-map] Loaded:", absolute); return JSON.parse(text); }
        catch(e){ console.warn("[hydrant-map] Parse failed; sanitizing:", absolute, e.message);
          return JSON.parse(sanitizeJSONText(text)); }
      }catch(e){ console.warn("[hydrant-map] Fetch failed:", path, e); }
    }
    throw new Error("No hydrant GeoJSON found.");
  }

  function init(){
    const el = document.getElementById("map"); if(!el){ console.error("#map missing"); return; }
    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);

    // Mobile sizing fix
    function fixSizeSoon(d=0){ setTimeout(()=> map.invalidateSize(true), d); }
    map.once('load', ()=> fixSizeSoon(0));
    map.on('popupopen', ()=> fixSizeSoon(0));
    window.addEventListener('resize', ()=> fixSizeSoon(150));
    window.addEventListener('orientationchange', ()=> fixSizeSoon(300));

    const icon = L.divIcon({className:"hydrant-pin",
      html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444" stroke="#991b1b" stroke-width="1.5"><circle cx="12" cy="12" r="6"/></svg>'});

    fetchAny(hydrantSources()).then(geojson => {
      const all = geojson.features || [];
      console.log(`[hydrant-map] total features in file: ${all.length}`);

      let feats = all;
      if (!nofilter){
        feats = all.filter(f => !/LZ\d+/i.test(JSON.stringify(f.properties||{})));
        console.log(`[hydrant-map] after LZ filter: ${feats.length}`);
      } else {
        console.log("[hydrant-map] filter disabled via ?nofilter=1");
      }

      if (feats.length === 0){
        console.warn("[hydrant-map] No features to render. Falling back to no-filter circleMarkers for debug.");
        feats = all;
        const layer = L.geoJSON({type:"FeatureCollection", features:feats}, {
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius:5, color:"#ef4444", weight:2, fillOpacity:0.7}),
          onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature.properties||{}))
        }).addTo(map);
        try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
        return;
      }

      const layer = L.geoJSON({type:"FeatureCollection", features:feats}, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon}),
        onEachFeature: (feature, lyr)=> lyr.bindPopup(buildPopup(feature.properties||{}))
      }).addTo(map);
      try{ map.fitBounds(layer.getBounds(), {padding:[20,20]}); }catch{}
      console.log("[hydrant-map] rendered features:", layer.getLayers().length);
    }).catch(err => {
      console.error("Failed to load hydrants:", err);
      L.marker(center).addTo(map).bindPopup("Hydrant data not found.");
    });
  }

  if (document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
    // Post-init: nudge Leaflet to paint on small screens
    try {
      if (window.map && typeof window.map.invalidateSize === 'function'){
        setTimeout(function(){ window.map.invalidateSize(); }, 120);
        setTimeout(function(){ window.map.invalidateSize(); }, 400);
      }
      window.addEventListener('orientationchange', function(){
        if (window.map && window.map.invalidateSize){
          setTimeout(function(){ window.map.invalidateSize(); }, 180);
        }
      });
    } catch(e){}
  });
})();
// === HFD end guard ===

    try {
      if (window.map && typeof window.map.invalidateSize === 'function'){
        setTimeout(function(){ window.map.invalidateSize(); }, 120);
        setTimeout(function(){ window.map.invalidateSize(); }, 400);
        window.addEventListener('orientationchange', function(){ setTimeout(function(){ window.map.invalidateSize(); }, 180); });
      }
    } catch(e){}
  });
})();
// === end HFD guard ===

  });
})();
/* === end HFD Leaflet guard === */

/* === HFD: Hydrant page anti-blink search binder === */
(function(){
  // Build a safe query from Street + City (default city Hopkinton), or legacy single input.
  function HFD_getSearchQuery(){
    var s = document.getElementById('mapSearchStreet');
    var c = document.getElementById('mapSearchCity');
    var x = document.getElementById('mapSearchInput'); // legacy single input
    var street = s && typeof s.value === 'string' ? s.value.trim() : '';
    var city   = c && typeof c.value === 'string' ? c.value.trim() : 'Hopkinton';
    if (street) return (street + ', ' + (city || 'Hopkinton')).trim();
    return x && typeof x.value === 'string' ? x.value.trim() : '';
  }

  // Minimal local geocode fallback if the global binder isn't present.
  function doLocalSearch(query){
    if (!window.map || !query) return;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=0&namedetails=0&q=' + encodeURIComponent(query);
    fetch(url, { headers: {Accept:'application/json'}, referrerPolicy:'no-referrer' })
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if (!rows || !rows.length) return;
        var r0 = rows[0], lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        if (typeof window.map.setView === 'function'){
          window.map.setView([lat, lon], 16);
          if (!window.__hfd_search_marker){
            window.__hfd_search_marker = L.marker([lat, lon]).addTo(window.map);
          } else {
            window.__hfd_search_marker.setLatLng([lat, lon]);
          }
        }
      })
      .catch(function(err){ console.warn('[HFD] local hydrant search failed', err); });
  }

  // Debounce helper to avoid double-submits.
  function debounce(fn, ms){
    var t; return function(){ var ctx=this, args=arguments;
      clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, ms||120);
    };
  }

  function bindAntiBlink(){
    var form = document.getElementById('mapSearchForm') || document.querySelector('.map-search') || document.querySelector('.map-toolbar form');
    if (!form) return false;
    if (form.__hfd_bound) return true;

    var triggerSearch = debounce(function(){
      var q = HFD_getSearchQuery();
      if (typeof window.HFD_bindToolbarSearch === 'function' && window.map){
        try { window.HFD_bindToolbarSearch(window.map, { zoom: 16, defaultCity: 'Hopkinton' }); } catch(e){}
      }
      // Always run a local search too (harmless if global binder already recenters).
      doLocalSearch(q);
    }, 60);

    // Prevent default submit (the "blink")
    form.addEventListener('submit', function(e){
      e.preventDefault();
      e.stopPropagation();
      triggerSearch();
      return false;
    });

    // Prevent Enter key in inputs from submitting the page
    form.addEventListener('keydown', function(e){
      var key = e.key || e.keyCode;
      if (key === 'Enter' || key === 13){
        e.preventDefault();
        e.stopPropagation();
        triggerSearch();
        return false;
      }
    });

    // Also intercept clicks on buttons/anchors inside the form
    var buttons = form.querySelectorAll('button, input[type="submit"], a[href]');
    buttons.forEach(function(btn){
      btn.addEventListener('click', function(e){
        // If it's a real submit button, stop it from navigating/reloading.
        e.preventDefault();
        e.stopPropagation();
        triggerSearch();
        return false;
      });
    });

    form.__hfd_bound = true;
    return true;
  }

  // Retry a few times in case map/DOM arrives late.
  (function retry(){
    if (bindAntiBlink()) return;
    var tries = 0, t = setInterval(function(){
      if (bindAntiBlink() || ++tries > 100) clearInterval(t);
    }, 50);
  })();
})();
/* === end HFD: Hydrant page anti-blink search binder === */

