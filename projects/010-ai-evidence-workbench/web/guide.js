"use strict";
(() => {
  const image = document.getElementById("guide-image");
  const range = document.getElementById("zoom");
  const output = document.getElementById("zoom-value");
  const viewer = document.getElementById("viewer");
  const toolbar = document.getElementById("toolbar");
  let fitting = true;
  function setZoom(value, fit = false) {
    const zoom = Math.max(15, Math.min(150, Math.round(value)));
    const previousScale = image.getBoundingClientRect().width / 1600;
    const position = {x: viewer.scrollLeft / previousScale, y: viewer.scrollTop / previousScale};
    fitting = fit; range.value = zoom; output.value = `${zoom}%`;
    image.style.width = `${1600 * zoom / 100}px`;
    viewer.scrollLeft = position.x * zoom / 100;
    viewer.scrollTop = position.y * zoom / 100;
  }
  function fitWidth() { const padding = innerWidth < 600 ? 20 : 44; setZoom(Math.floor((viewer.clientWidth - padding) / 1600 * 100), true); }
  range.addEventListener("input", () => setZoom(Number(range.value)));
  document.getElementById("zoom-out").addEventListener("click", () => setZoom(Number(range.value) - 10));
  document.getElementById("zoom-in").addEventListener("click", () => setZoom(Number(range.value) + 10));
  document.getElementById("actual").addEventListener("click", () => setZoom(100));
  document.getElementById("fit").addEventListener("click", fitWidth);
  document.getElementById("chapter").addEventListener("change", (event) => {
    viewer.scrollTop = Number(event.target.value) * Number(range.value) / 100;
  });
  function resize() { document.documentElement.style.setProperty("--toolbar-height", `${toolbar.getBoundingClientRect().height}px`); if (fitting) fitWidth(); }
  new ResizeObserver(resize).observe(toolbar);
  addEventListener("resize", resize);
  resize();
})();
