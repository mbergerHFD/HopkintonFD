// === HFD global readiness helpers (DOM + Leaflet) ===
(function () {
  const HFD = (window.HFD = window.HFD || {});

  // DOM ready as a Promise (works even if DOM was already ready)
  HFD.whenDOMReady = function () {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((res) =>
      document.addEventListener("DOMContentLoaded", res, { once: true })
    );
  };

  // Leaflet ready as a Promise, with small retry loop + load fallback (iOS-safe)
  HFD.whenLeafletReady = function (timeoutMs = 8000) {
    if (window.L && typeof window.L.map === "function") return Promise.resolve(window.L);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.L && typeof window.L.map === "function") {
          clearInterval(timer);
          resolve(window.L);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Leaflet timed out"));
        }
      }, 40);

      // also resolve on full load (covers iOS back/forward cache)
      window.addEventListener(
        "load",
        () => {
          if (window.L && typeof window.L.map === "function") {
            clearInterval(timer);
            resolve(window.L);
          }
        },
        { once: true }
      );
    });
  };
})();

// maps-boot.js — force a safe map height on iOS Safari and handle rotation
(function(){
  function ensureMapHeight(id="map"){
    var el = document.getElementById(id);
    if (!el) return;
    var minPx = 420;
    function apply(){
      var h = el.getBoundingClientRect().height;
      if (h < 150){
        var target = Math.max(minPx, Math.round(window.innerHeight * 0.7));
        el.style.height = target + "px";
      }
    }
    apply();
    window.addEventListener("orientationchange", function(){ setTimeout(apply, 300); }, {passive:true});
    window.addEventListener("resize", function(){ setTimeout(apply, 150); }, {passive:true});
  }

  // log any blocking errors in-page for quick diagnosis
  window.addEventListener("error", function(e){
    try{
      var box = document.getElementById("map-error");
      if (!box){
        box = document.createElement("div");
        box.id = "map-error";
        box.style.cssText = "position:fixed;bottom:8px;left:8px;right:8px;background:#fee2e2;color:#7f1d1d;padding:8px 10px;border:1px solid #fecaca;border-radius:6px;z-index:9999;font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;font-size:14px;";
        document.body.appendChild(box);
      }
      box.textContent = "[Map error] " + (e.message || e.error || "Unknown error");
    }catch(_){}
  });

  // Expose globally so pages can call it before initializing Leaflet
  window.ensureMapHeight = ensureMapHeight;
})();

// === HFD reusable toolbar search binder (v2.2 ultra-robust + debug) ===
(function(){
  function qSel(selector){ return document.querySelector(selector); }
  function pickInput(){
    // Prefer explicit IDs
    var s = document.getElementById('mapSearchStreet') || qSel('input[name="street"]') || qSel('input[placeholder*="Street" i]');
    var c = document.getElementById('mapSearchCity')   || qSel('input[name="city"]')   || qSel('input[placeholder*="City" i]');
    var single = document.getElementById('mapSearchInput') || qSel('.map-search input[type="search"]');
    return {street:s, city:c, single:single};
  }
  function pickForm(){
    return document.getElementById('mapSearchForm') || qSel('.map-search') || qSel('.map-toolbar form');
  }
  function ensureBinder(){
    if (typeof window.HFD_bindToolbarSearch === 'function' && window.HFD_bindToolbarSearch.__v22) return;
    window.HFD_bindToolbarSearch = function(map, opts){
      opts = opts || {};
      var form = pickForm();
      if (!form || !map) return;
      if (form.__hfd_bound) return;

      var inputs = pickInput();
      var status = document.createElement('div');
      status.className = 'map-search-status';
      status.style.cssText = 'font-size:12px;margin-top:6px;min-height:16px;color:#444;';
      form.parentNode && form.parentNode.appendChild(status);

      function setStatus(msg, err){ if (status){ status.textContent = msg||''; status.style.color = err ? '#b00020' : '#444'; } }
      function buildQuery(){
        var street = inputs.street && inputs.street.value ? inputs.street.value.trim() : '';
        var city   = inputs.city   && inputs.city.value   ? inputs.city.value.trim()   : (opts.defaultCity || 'Hopkinton');
        var single = inputs.single && inputs.single.value ? inputs.single.value.trim() : '';
        var q = street || city ? [street, city || 'Hopkinton'].filter(Boolean).join(', ') : single;
        if (window.HFD_DEBUG) console.log('[hfd-search] query:', q);
        return q;
      }
      function search(query){
        if (!query){ setStatus('Enter an address.', true); return; }
        setStatus('Searching…');
        var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=0&namedetails=0&email='
          + encodeURIComponent(opts.email || 'webmaster@hopkintonfd.org') + '&q=' + encodeURIComponent(query);
        if (window.HFD_DEBUG) console.log('[hfd-search] fetch:', url);
        var ac = new AbortController(), to = setTimeout(function(){ ac.abort(); }, 8000);
        fetch(url, { headers:{Accept:'application/json'}, signal: ac.signal, referrerPolicy:'no-referrer' })
          .then(function(r){ clearTimeout(to); return r.json(); })
          .then(function(rows){
            if (window.HFD_DEBUG) console.log('[hfd-search] rows:', rows);
            if (!rows || !rows.length){ setStatus('No results. Try a different address.', true); return; }
            var r0 = rows[0], lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
            if (!isFinite(lat) || !isFinite(lon)){ setStatus('Invalid result.', true); return; }
            setStatus('');
            map.setView([lat, lon], opts.zoom || 16);
            if (!map.__hfd_search_marker){ map.__hfd_search_marker = L.marker([lat, lon]).addTo(map); }
            else { map.__hfd_search_marker.setLatLng([lat, lon]); }
          })
          .catch(function(err){ console.warn('[hfd-search] error', err); setStatus('Search failed (network/CSP?).', true); });
      }

      // submit and click bindings
      form.addEventListener('submit', function(e){ e.preventDefault(); search(buildQuery()); });
      var btn = form.querySelector('button[type="submit"], button');
      if (btn){ btn.addEventListener('click', function(e){ e.preventDefault(); search(buildQuery()); }); }

      form.__hfd_bound = true;
      if (window.HFD_DEBUG) console.log('[hfd-search] binder attached');
    };
    window.HFD_bindToolbarSearch.__v22 = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureBinder);
  else ensureBinder();
})();

