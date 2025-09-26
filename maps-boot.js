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

// Neutralize any old helpers that tried to move the toolbar into the map
window.HFD_embedToolbarInLeaflet = function(){ /* no-op */ };
window.addLeafletSearchControl = function(){ /* no-op */ };

// === HFD reusable toolbar search binder ===
function HFD_bindToolbarSearch(map, opts){
  opts = opts || {};
  var form = document.getElementById(opts.formId || 'mapSearchForm');
  var input = document.getElementById(opts.inputId || 'mapSearchInput');
  if (!form || !input || !map) return;

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var q = (input.value || '').trim();
    if (!q) return;
    // Basic Nominatim search
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1';
    fetch(url, { headers: { 'Accept': 'application/json' }, referrerPolicy: 'no-referrer' })
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if (!rows || !rows.length) return;
        var r0 = rows[0];
        var lat = parseFloat(r0.lat), lon = parseFloat(r0.lon);
        if (isFinite(lat) && isFinite(lon)){
          map.setView([lat, lon], opts.zoom || 16);
          if (!map.__hfd_search_marker){
            map.__hfd_search_marker = L.marker([lat, lon]).addTo(map);
          } else {
            map.__hfd_search_marker.setLatLng([lat, lon]);
          }
        }
      }).catch(function(err){ console.warn('Search error', err); });
  });
}

