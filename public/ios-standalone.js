(() => {
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIosDevice && navigator.standalone === true) {
    document.documentElement.classList.add("ios-standalone-pwa");
  }
})();
