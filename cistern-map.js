
// === HFD: mobile-ready wrapper (Leaflet + DOM) ===
(function(){
  function domReady(cb){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, {once:true});
    else cb();
  }
  function ready(run){
    function ok(){ return (window.L && typeof L.map==='function'); }
    let tries = 0;
    function tick(){
      if (ok()){ domReady(run); return; }
      if (++tries > 400){ console.warn('[HFD] Leaflet not ready'); return; }
      setTimeout(tick, 25);
    }
    tick();
  }
  ready(function(){





// === HFD: robust late binder to avoid race with maps-boot.js ===
(function(){
  function attempt(){
    if (window.map && typeof window.map.setView === 'function' &&
        typeof window.HFD_bindToolbarSearch === 'function'){
      try { window.HFD_bindToolbarSearch(window.map, { zoom: 16, defaultCity: 'Hopkinton' }); }
      catch(e){ console.warn('[HFD] bind search failed', e); }
      return true;
    }
    return false;
  }
  if (!attempt()){
    var tries = 0, t = setInterval(function(){ if (attempt() || ++tries > 200) clearInterval(t); }, 50);
  }
})();


// === HFD: local search fallback (works without maps-boot.js) ===
(function(){
  function pickForm(){
    return document.getElementById('mapSearchForm') ||
           document.querySelector('.map-search') ||
           document.querySelector('.map-toolbar form') || null;
  }
  function ensureMarker(m, lat, lon){
    if (!m.__hfd_search_marker){ m.__hfd_search_marker = L.marker([lat, lon]).addTo(m); }
    else { m.__hfd_search_marker.setLatLng([lat, lon]); }
  }
  function doSearch(m, query){
    if (!query) return;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=0&namedetails=0&email=' +
              encodeURIComponent('webmaster@hopkintonfd.org') + '&q=' + encodeURIComponent(query);
    fetch(url, { headers: {Accept:'application/json'}, referrerPolicy:'no-referrer' })
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if (!rows || !rows.length) return;
        var r0 = rows[0], lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        m.setView([lat, lon], 16);
        ensureMarker(m, lat, lon);
      })
      .catch(function(err){ console.warn('[HFD] local search failed', err); });
  }
  function attach(){
    var form = pickForm();
    if (!form || !window.map) return false;
    if (form.__hfd_local_bound) return true;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var q = (typeof HFD_getSearchQuery === 'function') ? HFD_getSearchQuery() : '';
      doSearch(window.map, q);
    });
    var btn = form.querySelector('button[type="submit"], button');
    if (btn){
      btn.addEventListener('click', function(e){
        e.preventDefault();
        var q = (typeof HFD_getSearchQuery === 'function') ? HFD_getSearchQuery() : '';
        doSearch(window.map, q);
      });
    }
    form.__hfd_local_bound = true;
    return true;
  }
  if (!attach()){
    var tries = 0, t = setInterval(function(){ if (attach() || ++tries > 200) clearInterval(t); }, 50);
  }
})();



    // Post-init helpers to make sure the map paints on mobile
    try {
      if (window.map && typeof window.map.invalidateSize === 'function'){
        setTimeout(function(){ window.map.invalidateSize(); }, 100);
        setTimeout(function(){ window.map.invalidateSize(); }, 500);
        window.addEventListener('orientationchange', function(){ setTimeout(function(){ window.map.invalidateSize(); }, 200); });
        window.addEventListener('resize', function(){ setTimeout(function(){ window.map.invalidateSize(); }, 200); });
      }
    } catch(e){}
  });
})();
// === HFD end mobile-ready wrapper ===
