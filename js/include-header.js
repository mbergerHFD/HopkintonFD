// Injects /partials/header.html into #header-placeholder
(function () {
  function injectHeader() {
    var placeholder = document.getElementById("header-placeholder");
    if (!placeholder) return;
    fetch("partials/header.html", { cache: "no-cache" })
      .then(function (r) { return r.text(); })
      .then(function (html) { placeholder.innerHTML = html; })
      .catch(function (err) { console.error("Header include failed:", err); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectHeader);
  } else {
    injectHeader();
  }
})();
