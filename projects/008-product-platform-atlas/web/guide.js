(() => {
  'use strict';
  const viewport = document.getElementById('viewport');
  const map = document.getElementById('map');
  const range = document.getElementById('zoom');
  const output = document.getElementById('zoom-value');
  const imageWidth = Number(map.getAttribute('width')) || 1600;
  let fitMode = true;
  function setZoom(value) {
    const zoom = Math.max(15, Math.min(180, Math.round(value)));
    range.value = zoom;
    output.value = `${zoom}%`;
    map.style.width = `${imageWidth * zoom / 100}px`;
    map.style.height = 'auto';
  }
  function fit() {
    fitMode = true;
    const style = getComputedStyle(viewport);
    setZoom(Math.floor((viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / imageWidth * 100));
    viewport.scrollLeft = 0;
  }
  range.addEventListener('input', () => { fitMode = false; setZoom(Number(range.value)); });
  document.getElementById('zoom-in').addEventListener('click', () => { fitMode = false; setZoom(Number(range.value) + 15); });
  document.getElementById('zoom-out').addEventListener('click', () => { fitMode = false; setZoom(Number(range.value) - 15); });
  document.getElementById('original').addEventListener('click', () => { fitMode = false; setZoom(100); });
  document.getElementById('fit').addEventListener('click', fit);
  window.addEventListener('resize', () => { if (fitMode) fit(); });
  fit();
})();
