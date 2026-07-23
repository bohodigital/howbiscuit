(() => {
  const config = document.currentScript;
  if (!config) return;

  const marker = "boho_qa";
  let suppressed = navigator.webdriver === true;

  try {
    const markerValue = new URLSearchParams(window.location.search).get(marker);
    if (markerValue === "1") sessionStorage.setItem(marker, "1");
    if (markerValue === "0") sessionStorage.removeItem(marker);
    suppressed = suppressed || sessionStorage.getItem(marker) === "1";
  } catch {
    // Storage can be unavailable. navigator.webdriver and the current URL still apply.
    suppressed =
      suppressed || new URLSearchParams(window.location.search).get(marker) === "1";
  }

  if (suppressed) {
    document.documentElement.dataset.analyticsSuppressed = "boho-qa";
    return;
  }

  const umamiScriptUrl = config.dataset.umamiScriptUrl;
  const umamiWebsiteId = config.dataset.umamiWebsiteId;
  if (umamiScriptUrl && umamiWebsiteId) {
    const umami = document.createElement("script");
    umami.async = true;
    umami.src = umamiScriptUrl;
    umami.setAttribute("data-website-id", umamiWebsiteId);
    if (config.dataset.umamiDomains) {
      umami.setAttribute("data-domains", config.dataset.umamiDomains);
    }
    umami.setAttribute("data-do-not-track", "true");
    umami.setAttribute("data-exclude-search", "true");
    document.head.appendChild(umami);
  }

  const gaId = config.dataset.gaId;
  const gaHosts = (config.dataset.gaPublicHosts || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!gaId || (gaHosts.length && !gaHosts.includes(window.location.hostname.toLowerCase()))) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", gaId, { anonymize_ip: true });

  const ga = document.createElement("script");
  ga.async = true;
  ga.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(ga);
})();
