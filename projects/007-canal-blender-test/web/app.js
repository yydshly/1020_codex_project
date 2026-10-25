"use strict";

const versions = {
  v1: {
    image: "media/render.png",
    tag: "V1 / BLENDER",
    caption: "首轮程序化搭建与渲染",
    step: "ITERATION 01",
    title: "元素齐了，画面关系却没对上。",
    description: "三间店铺、桥与运河已搭建。机位偏横向，像模型展示；外墙偏暗，水面反光和建筑形态较规则。它证明控制链路可运行，不代表视觉还原成功。",
    alt: "V1 本机 Blender 首轮渲染：横向展示完整店铺、石拱桥和运河，构图与参考概念图差异明显"
  },
  v2: {
    image: "media/render-v2.png",
    tag: "V2 / BLENDER",
    caption: "机位、天空与冷暖光照优化",
    step: "ITERATION 02",
    title: "沿河纵深成立了，质感仍有距离。",
    description: "切换沿河近景机位，重做蓝色暮空和桃色地平线，调整光照、湿润材质与既有远景。画面更接近目标氛围，但表面、植物和背景仍显得简化。",
    alt: "V2 本机 Blender 渲染：沿河近景构图与蓝橙暮空改善，店铺表面仍规则，远景仍简化"
  },
  v3: {
    image: "media/render-v3.png",
    tag: "V3 / BLENDER",
    caption: "材质、玻璃与反光优化",
    step: "ITERATION 03",
    title: "更清楚了，但仍有“模型感”。",
    description: "降低玻璃粗糙度，增加湿干区域、墙石旧化和水面倒影；延长既有远岸。细节更可读，规则建筑、稀疏植物和远景收尾依然明显。",
    alt: "V3 本机 Blender 渲染：沿河店铺、拱桥、较清晰的橱窗与水面倒影，仍有规则建模和简化背景痕迹"
  },
  v4: {
    image: "media/render-v4.png",
    tag: "V4 / BLENDER",
    caption: "先对齐机位、店铺与桥岸关系",
    step: "ITERATION 04",
    title: "构图更近了，视觉还原仍未达标。",
    description: "先用人工选点约束相机、桥位置与岸线比例，不增加物体，也不继续改材质。店铺和桥的画面位置更接近参考，但窗户与屋顶仍模板化，植被、远景及湿润反光差距依旧明显。",
    alt: "V4 本机 Blender 渲染：按参考选点校准机位、桥位置和岸线，建筑模板感与简化背景仍明显"
  }
};

const versionButtons = Array.from(document.querySelectorAll("[data-version]"));
const resultImage = document.getElementById("result-image");
const resultLink = document.getElementById("result-lightbox");

function selectVersion(key) {
  const version = versions[key];
  if (!version) return;
  versionButtons.forEach(button => {
    const selected = button.dataset.version === key;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  resultImage.src = version.image;
  resultImage.alt = version.alt;
  resultLink.href = version.image;
  resultLink.dataset.lightbox = `${key.toUpperCase()} · ${version.caption} · 本机 Blender 真实渲染`;
  document.getElementById("wipe-result").src = version.image;
  document.getElementById("wipe-result").alt = version.alt;
  document.getElementById("wipe-label").textContent = `${key.toUpperCase()} 真实渲染`;
  document.getElementById("result-tag").textContent = version.tag;
  document.getElementById("result-caption").textContent = version.caption;
  document.getElementById("version-step").textContent = version.step;
  document.getElementById("version-title").textContent = version.title;
  document.getElementById("version-description").textContent = version.description;
  const download = document.getElementById("render-download");
  download.href = version.image;
  download.download = `canal-blender-${key}.png`;
}

versionButtons.forEach((button, index) => {
  button.addEventListener("click", () => selectVersion(button.dataset.version));
  button.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % versionButtons.length;
    if (event.key === "ArrowLeft") next = (index + versionButtons.length - 1) % versionButtons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = versionButtons.length - 1;
    versionButtons[next].focus();
    selectVersion(versionButtons[next].dataset.version);
  });
});

document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    const wipe = button.dataset.mode === "wipe";
    document.getElementById("side-view").hidden = wipe;
    document.getElementById("wipe-view").hidden = !wipe;
    document.querySelectorAll("[data-mode]").forEach(control => {
      const selected = control === button;
      control.setAttribute("aria-pressed", String(selected));
      control.classList.toggle("active", selected);
    });
  });
});

const comparisonRange = document.getElementById("comparison-range");
comparisonRange.addEventListener("input", () => {
  document.querySelector(".wipe-stage").style.setProperty("--split", `${comparisonRange.value}%`);
  document.getElementById("comparison-value").value = `${comparisonRange.value}%`;
});

const dialog = document.getElementById("image-dialog");
const dialogImage = document.getElementById("dialog-image");
const zoomRange = document.getElementById("image-zoom");
let lastImageLink = null;

function resetZoom() {
  zoomRange.value = "100";
  dialogImage.style.width = "100%";
  document.querySelector(".dialog-scroll").scrollTo(0, 0);
}

document.querySelectorAll("[data-lightbox]").forEach(link => {
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || typeof dialog.showModal !== "function") return;
    event.preventDefault();
    lastImageLink = link;
    dialogImage.src = link.href;
    dialogImage.alt = link.dataset.lightbox;
    document.getElementById("dialog-title").textContent = link.dataset.lightbox;
    document.getElementById("dialog-download").href = link.href;
    resetZoom();
    dialog.showModal();
    document.body.classList.add("modal-open");
    document.getElementById("dialog-close").focus();
  });
});
zoomRange.addEventListener("input", () => { dialogImage.style.width = `${zoomRange.value}%`; });
document.getElementById("zoom-reset").addEventListener("click", resetZoom);
document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  if (lastImageLink) lastImageLink.focus();
});
dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});

if ("IntersectionObserver" in window) {
  const navigation = Array.from(document.querySelectorAll(".site-header nav a"));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navigation.forEach(link => {
        const active = link.getAttribute("href") === `#${entry.target.id}`;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-15% 0px -65% 0px" });
  navigation.forEach(link => {
    const section = document.querySelector(link.getAttribute("href"));
    if (section) observer.observe(section);
  });
}

document.querySelector(".comparison-toolbar").hidden = false;
selectVersion("v4");
