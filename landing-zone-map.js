// landing-zone-map.js — minimal stub with mobile fix
(function(){
  const center = [42.2289, -71.5223]; let map;
  function init(){
    const el = document.getElementById("map"); if(!el) return;
    map = L.map(el).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);

    // --- Mobile sizing fix ---
    function fixSizeSoon(delay=0){ setTimeout(()=> map.invalidateSize(true), delay); }
    map.once('load', () => fixSizeSoon(0));
    map.on('popupopen', () => fixSizeSoon(0));
    window.addEventListener('resize', () => fixSizeSoon(150));
    window.addEventListener('orientationchange', () => fixSizeSoon(300));

  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();