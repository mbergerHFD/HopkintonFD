// === HFD global readiness helpers (DOM + Leaflet) ===
(function () {
  const HFD = (window.HFD = window.HFD || {});

  HFD.whenDOMReady = function () {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((res) =>
      document.addEventListener("DOMContentLoaded", res, { once: true })
    );
  };

  // Inject Leaflet CSS once if missing
  function ensureLeafletCSS() {
    const has = [...document.styleSheets].some(
      (ss) => ss.href && /leaflet(\.min)?\.css/i.test(ss.href)
    );
    if (has) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  // Try loading Leaflet JS from multiple CDNs until one works
  function loadLeafletFromCDNs() {
    return new Promise((resolve, reject) => {
      const urls = [
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
      ];
      let i = 0;
      function tryNext() {
        if (window.L && typeof window.L.map === "function") return resolve(window.L);
        if (i >= urls.length) return reject(new Error("All Leaflet CDNs failed"));
        const url = urls[i++];
        const s = document.createElement("script");
        s.src = url;
        s.crossOrigin = "anonymous";
        s.async = false; // predictable execution order on iOS
        s.onload = () => resolve(window.L);
        s.onerror = () => setTimeout(tryNext, 60);
        document.head.appendChild(s);
      }
      tryNext();
    });
  }

  // NEW: start polling and CDN injection *immediately*, race them
  HFD.whenLeafletReady = function (timeoutMs = 8000) {
    ensureLeafletCSS();

    if (window.L && typeof window.L.map === "function") {
      return Promise.resolve(window.L);
    }

    // 1) poll for environments where the tag executes normally
    const pollPromise = new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = setInterval(() => {
        if (window.L && typeof window.L.map === "function") {
          clearInterval(tick);
          resolve(window.L);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(tick);
          reject(new Error("Leaflet timed out"));
        }
      }, 40);

      window.addEventListener(
        "load",
        () => {
          if (window.L && typeof window.L.map === "function") {
            clearInterval(tick);
            resolve(window.L);
          }
        },
        { once: true }
      );
    });

    // 2) proactively inject from CDNs right away
    const cdnPromise = loadLeafletFromCDNs();

    // Resolve whichever finishes first
    return Promise.race([pollPromise, cdnPromise]);
  };
})();
