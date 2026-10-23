"use strict";
(() => {
  const layout = JSON.parse(document.getElementById("guide-layout").textContent);
  const sections = layout.sections;
  const viewport = document.getElementById("map-viewport");
  const canvas = document.getElementById("map-canvas");
  const map = document.getElementById("full-map");
  const zoom = document.getElementById("zoom");
  const zoomOutput = document.getElementById("zoom-value");
  const textReader = document.getElementById("text-reader");
  const methodJump = document.getElementById("method-jump");
  const status = document.getElementById("reader-status");
  const detailTargets = { understanding: "understanding", architectures: "atlas", composition: "compose", workflow: "practice", constraints: "practice", example: "example", value: "map" };
  let active = Math.max(0, sections.findIndex(section => `#${section.id}` === location.hash));
  let mode = window.matchMedia("(max-width: 640px)").matches ? "text" : "chapter";
  let frame = null;
  let requestedFrame = 0;

  function center() {
    if (!frame || mode === "text") return null;
    return { x: (viewport.scrollLeft + frame.width / 2) / frame.scale, y: frame.start + (viewport.scrollTop + frame.height / 2) / frame.scale };
  }
  function draw(anchor = null, targetY = null) {
    if (mode === "text") return;
    const section = sections[active];
    const start = mode === "full" ? 0 : section.y;
    const end = mode === "full" ? layout.height : section.end;
    const width = viewport.clientWidth * Number(zoom.value) / 100;
    const scale = width / layout.width;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${(end - start) * scale}px`;
    map.style.width = `${width}px`;
    map.style.transform = `translateY(${-start * scale}px)`;
    map.alt = mode === "full" ? "完整引导图，七章内容可切换到文字阅读" : `${section.title}，可切换文字阅读获取完整内容`;
    zoomOutput.value = `${zoom.value}%`;
    zoomOutput.title = `相对适应宽度；约为原图尺寸的 ${Math.round(scale * 100)}%`;
    document.getElementById("zoom-out").disabled = Number(zoom.value) <= Number(zoom.min);
    document.getElementById("zoom-in").disabled = Number(zoom.value) >= Number(zoom.max);
    if (targetY !== null) {
      viewport.scrollTop = Math.max(0, (targetY - start) * scale);
      viewport.scrollLeft = 0;
    } else if (anchor) {
      viewport.scrollTop = Math.max(0, (anchor.y - start) * scale - viewport.clientHeight / 2);
      viewport.scrollLeft = Math.max(0, anchor.x * scale - viewport.clientWidth / 2);
    }
    frame = { scale, start, width: viewport.clientWidth, height: viewport.clientHeight };
  }
  function updateNavigation() {
    const section = sections[active];
    document.querySelectorAll("[data-section]").forEach(button => {
      if (button.dataset.section === section.id) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-text-section]").forEach(article => { article.hidden = article.dataset.textSection !== section.id; });
    document.getElementById("chapter-count").textContent = `${String(active + 1).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")}`;
    document.getElementById("chapter-title").textContent = section.title;
    document.getElementById("chapter-purpose").textContent = section.summary;
    document.getElementById("previous-chapter").disabled = active === 0;
    document.getElementById("next-chapter").disabled = active === sections.length - 1;
    document.getElementById("chapter-detail-link").href = `index.html#${detailTargets[section.id]}`;
  }
  function rememberSection() {
    try { history.replaceState(null, "", `#${sections[active].id}`); } catch { /* Reading still works when file URL history is restricted. */ }
  }
  function selectSection(index, announce = true) {
    active = Math.max(0, Math.min(sections.length - 1, index));
    methodJump.value = "";
    updateNavigation();
    draw(null, sections[active].y);
    rememberSection();
    if (announce) status.textContent = `第 ${active + 1} 章 · ${sections[active].short}`;
  }
  function revealReader() {
    const reader = document.getElementById("guide-content");
    if (reader.getBoundingClientRect().top < 0 || reader.getBoundingClientRect().top > 40) reader.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function setMode(next) {
    const anchor = center();
    const previous = mode;
    mode = next;
    document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === mode)));
    document.getElementById("image-reader").hidden = mode === "text";
    textReader.hidden = mode !== "text";
    const method = layout.methods.find(item => item.id === methodJump.value);
    draw(previous !== "text" ? anchor : null, previous === "text" ? (method ? method.y : sections[active].y) : null);
    if (mode === "text" && method) {
      const details = document.getElementById(`text-method-${method.id}`);
      details.open = true;
      details.scrollIntoView({ block: "start", behavior: "instant" });
    }
    if (previous === "text" && mode !== "text") revealReader();
    status.textContent = mode === "text" ? "文字阅读 · 与图共享架构资料，适合逐条细读。" : mode === "full" ? "整图浏览 · 滚动时章节定位会随之更新。" : "按章看图 · 当前只展示这一章，缩放后可在图内滚动。";
  }
  function changeZoom(next) {
    const anchor = center();
    zoom.value = String(Math.min(Number(zoom.max), Math.max(Number(zoom.min), next)));
    draw(anchor);
  }
  zoom.addEventListener("input", () => draw(center()));
  document.getElementById("zoom-in").addEventListener("click", () => changeZoom(Number(zoom.value) + 25));
  document.getElementById("zoom-out").addEventListener("click", () => changeZoom(Number(zoom.value) - 25));
  document.getElementById("fit-width").addEventListener("click", () => changeZoom(100));
  document.getElementById("actual-size").addEventListener("click", () => changeZoom(Math.round(layout.width / viewport.clientWidth * 100)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.view)));
  document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => { selectSection(sections.findIndex(section => section.id === button.dataset.section)); revealReader(); }));
  document.getElementById("previous-chapter").addEventListener("click", () => { selectSection(active - 1); revealReader(); });
  document.getElementById("next-chapter").addEventListener("click", () => { selectSection(active + 1); revealReader(); });
  methodJump.addEventListener("change", () => {
    const method = layout.methods.find(item => item.id === methodJump.value);
    if (!method) return;
    selectSection(sections.findIndex(section => section.id === "architectures"), false);
    methodJump.value = method.id;
    if (mode === "text") {
      const details = document.getElementById(`text-method-${method.id}`);
      details.open = true;
      details.scrollIntoView({ block: "start", behavior: "instant" });
    } else { draw(null, method.y); revealReader(); }
    status.textContent = `已定位：${method.name}`;
  });
  viewport.addEventListener("scroll", () => {
    if (mode !== "full" || !frame || requestedFrame) return;
    requestedFrame = requestAnimationFrame(() => {
      requestedFrame = 0;
      if (mode !== "full" || !frame) return;
      const y = viewport.scrollTop / frame.scale + 24;
      let index = 0;
      sections.forEach((section, i) => { if (section.y <= y) index = i; });
      if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) index = sections.length - 1;
      if (index !== active) { active = index; updateNavigation(); methodJump.value = ""; }
    });
  }, { passive: true });
  window.addEventListener("resize", () => draw(center()));
  window.addEventListener("hashchange", () => { const index = sections.findIndex(section => `#${section.id}` === location.hash); if (index >= 0) selectSection(index); });
  updateNavigation();
  setMode(mode);
  draw(null, sections[active].y);
})();
