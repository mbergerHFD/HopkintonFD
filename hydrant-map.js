// hydrant-map.js — mobile-safe, single-guard, with data & search fallbacks

(async function () {
  // 1) Wait for DOM + Leaflet (helpers provided by maps-boot.js)
  try {
    await HFD.whenDOMReady();
    await HFD.whenLeafletReady(8000);
  } catch (e) {
    console.warn("[HFD] Leaflet not ready; retrying on window.load", e);
    await new Promise((res) => window.addEventListener("load", res, { once: true }));
    await HFD.whenLeafletReady(8000);
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  const center = [42.2289, -71.5223];
  const qs = new URLSearchParams(location.search);
  const nofilter = qs.get("nofilter") === "1";

  const esc = (s) =>
    String(s ?? "")
      .replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function hydrantSources() {
  const urlParam = new URLSearchParams(location.search).get("hydrants");
  const list = [];

  // 1) URL override (kept first)
  if (urlParam) list.push(urlParam);

  // 2) Relative candidates (work when you host the HTML + data together)
  list.push(
    "data/hopkinton_fire_department___hydrants.geojson",
    "data/hydrants.geojson",
    "hydrants.geojson",
    "../data/hopkinton_fire_department___hydrants.geojson",
    "../data/hydrants.geojson",
    "../hydrants.geojson",
    "/data/hopkinton_fire_department___hydrants.geojson",
    "/data/hydrants.geojson",
    "/hydrants.geojson"
  );

  // 3) GitHub Pages (adjust to the **exact** path that exists in your repo)
  // If your repo is mbergerHFD/HopkintonFD and the file is data/hydrants.geojson, these are correct:
  list.push(
    "https://mbergerhfd.github.io/HopkintonFD/data/hydrants.geojson",
    "https://mbergerhfd.github.io/HopkintonFD/data/hopkinton_fire_department___hydrants.geojson"
  );

  // 4) CORS-friendly CDNs (WORK FROM ANY ORIGIN, including html-preview)
  list.push(
    // “stable” pin to main branch tip
    "https://cdn.jsdelivr.net/gh/mbergerHFD/HopkintonFD@main/data/hydrants.geojson",
    "https://cdn.jsdelivr.net/gh/mbergerHFD/HopkintonFD@main/data/hopkinton_fire_department___hydrants.geojson",

    // optional: @latest alias
    "https://cdn.jsdelivr.net/gh/mbergerHFD/HopkintonFD@latest/data/hydrants.geojson",
    "https://cdn.jsdelivr.net/gh/mbergerHFD/HopkintonFD@latest/data/hopkinton_fire_department___hydrants.geojson"
  );

  // 5) Dynamic absolute relative to current page (last resort)
  list.push(new URL("data/hydrants.geojson", document.baseURI).toString());

  return [...new Set(list)];
}

  function sanitizeJSONText(s) {
    // Make invalid newlines in quoted strings JSON-safe (common GIS export issue)
    let out = "", inStr = false, escp = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (escp) {
          out += ch; escp = false; continue;
        }
        if (ch === "\\") { out += ch; escp = true; continue; }
        if (ch === '"') { out += ch; inStr = false; continue; }
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        out += ch;
      } else {
        out += ch;
        if (ch === '"') { inStr = true; escp = false; }
      }
    }
    return out;
  }

  async function fetchAny(paths) {
    for (const p of paths) {
      try {
        const url = new URL(p, location.href).toString();
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) { console.warn("[hydrant-map] not found:", url, r.status); continue; }
        const text = await r.text();
        try {
          console.log("[hydrant-map] Loaded:", url);
          return JSON.parse(text);
        } catch (e) {
          console.warn("[hydrant-map] parse failed; sanitizing:", url, e.message);
          return JSON.parse(sanitizeJSONText(text));
        }
      } catch (e) {
        console.warn("[hydrant-map] fetch failed:", p, e);
      }
    }
    throw new Error("No hydrant GeoJSON found from any source.");
  }

  function normalize(props) {
    const p = { ...props };
    const get = (...k) => k.map((x) => p[x]).find((v) => v != null && String(v).trim() !== "") || "";
    const clean = (s) => String(s || "").replace(/\\"/g, '"').replace(/\s+/g, " ").trim();

    return {
      id: clean(get("Building_no", "building_no", "hyd_no", "hydrant_no", "hyd_id", "id")),
      street: clean(get("street_loc", "Street", "Address", "addr", "location")),
      hydType: clean(get("Hyd_Type", "type", "Type")),
      size: clean(get("main_size", "Main_Size", "size")),
      flow: clean(get("Flow_gpm", "flow_gpm", "flow")),
      psiS: clean(get("psi_Static", "static_psi", "static")),
      psiR: clean(get("Residual_psi", "residual_psi", "residual")),
      year: clean(get("year")),
      lat: clean(get("Latitude", "latitude", "lat")),
      lon: clean(get("Longitude", "longitude", "lon")),
      props: p
    };
  }

  function buildPopup(allProps) {
    const n = normalize(allProps);
    const rows = [
      ["Type", n.hydType || "–"],
      ["Main Size", n.size || "–"],
      ["Flow (gpm)", n.flow || "–"],
      ["Static PSI", n.psiS || "–"],
      ["Residual PSI", n.psiR || "–"],
      ["Year", n.year || "–"]
    ];
    const title = `Hydrant ${n.id ? "#" + esc(n.id) : ""}`;
    const streetLine = n.street ? `<p style="margin:0 0 8px;"><strong>${esc(n.street)}</strong></p>` : "";
    const table = rows.map(([k, v]) =>
      `<tr><td style="padding:4px 6px; color:#374151;"><strong>${esc(k)}</strong></td><td style="padding:4px 6px;">${esc(v)}</td></tr>`
    ).join("");
    const coords = (n.lat || n.lon)
      ? `<tr><td style="padding:4px 6px; color:#374151;"><strong>Coordinates</strong></td><td style="padding:4px 6px;">${esc(n.lat || "–")}, ${esc(n.lon || "–")}</td></tr>`
      : "";
    return `<div style="min-width:260px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h3 style="margin:0 0 6px; font-size:1.05rem; color:#b91c1c;">${title}</h3>
      ${streetLine}
      <table style="width:100%; border-collapse:collapse; font-size:0.92rem;">
        ${table}${coords}
      </table>
    </div>`;
  }

  // ------------------------------------------------------------
  // 2) Map init
  // ------------------------------------------------------------
  const el = document.getElementById("map");
  if (!el) { console.error("#map not found"); return; }

  const map = L.map(el).setView(center, 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // expose map for other helpers that expect it
  window.HFD = window.HFD || {};
  HFD.map = map;

  // Keep size correct on iOS as UI settles
  const nudge = (d = 0) => setTimeout(() => { try { map.invalidateSize(true); } catch {} }, d);
  map.once("load", () => nudge(0));
  map.on("popupopen", () => nudge(0));
  window.addEventListener("resize", () => nudge(150));
  window.addEventListener("orientationchange", () => nudge(300));

  // Marker icon
  const icon = L.divIcon({
    className: "hydrant-pin",
    html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444" stroke="#991b1b" stroke-width="1.5"><circle cx="12" cy="12" r="6"/></svg>'
  });

  // ------------------------------------------------------------
  // 3) Data load and render
  // ------------------------------------------------------------
  try {
    const geojson = await fetchAny(hydrantSources());
    const all = Array.isArray(geojson.features) ? geojson.features : [];
    console.log(`[hydrant-map] total features in file: ${all.length}`);

    const feats = nofilter
      ? all
      : all.filter((f) => !/LZ\d+/i.test(JSON.stringify(f.properties || {})));

    if (!nofilter) console.log(`[hydrant-map] after LZ filter: ${feats.length}`);

    if (feats.length === 0) {
      console.warn("[hydrant-map] No features to render. Falling back to circle markers for debug.");
      const layer = L.geoJSON(
        { type: "FeatureCollection", features: all },
        {
          pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 5, color: "#ef4444", weight: 2, fillOpacity: 0.7 }),
          onEachFeature: (f, lyr) => lyr.bindPopup(buildPopup(f.properties || {}))
        }
      ).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch {}
    } else {
      const layer = L.geoJSON(
        { type: "FeatureCollection", features: feats },
        {
          pointToLayer: (_, latlng) => L.marker(latlng, { icon }),
          onEachFeature: (f, lyr) => lyr.bindPopup(buildPopup(f.properties || {}))
        }
      ).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch {}
      console.log("[hydrant-map] rendered features:", layer.getLayers().length);
    }
  } catch (err) {
    console.error("Failed to load hydrants:", err);
    L.marker(center).addTo(map).bindPopup("Hydrant data not found on this origin.");
  }

  // ------------------------------------------------------------
  // 4) Search binding
  // ------------------------------------------------------------
  if (typeof window.HFD_bindToolbarSearch === "function") {
    try { window.HFD_bindToolbarSearch(map, { zoom: 16, defaultCity: "Hopkinton" }); }
    catch (e) { console.warn("[HFD] search bind failed:", e); }
  } else {
    // Simple fallback binder (street + city -> Nominatim)
    const form = document.getElementById("mapSearchForm");
    const street = document.getElementById("mapSearchStreet");
    const city = document.getElementById("mapSearchCity");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = [street?.value || "", city?.value || "Hopkinton"].filter(Boolean).join(", ");
        if (!q.trim()) return;
        try {
          const r = await fetch(
            "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(q),
            { headers: { Accept: "application/json" } }
          );
          const data = await r.json();
          if (data && data[0]) {
            const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
            map.setView([lat, lon], 16);
          }
        } catch (err) {
          console.warn("[HFD] simple search failed:", err);
        }
      });
    } else {
      console.warn("[HFD] mapSearchForm not found; search not bound");
    }
  }

  // final gentle nudge after first paint
  nudge(200);

})();
