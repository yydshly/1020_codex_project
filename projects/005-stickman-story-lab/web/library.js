"use strict";

const categoryLabels = {
  all: "全部素材", overview: "研究总图", film: "完整成片", character: "角色设定", frames: "场景首帧",
  shots: "原始镜头", voices: "中文配音", documents: "创作档案"
};
const assetList = document.getElementById("asset-list");
const filters = document.getElementById("asset-filters");
const assetCount = document.getElementById("asset-count");
let assets = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function relativeUrl(value) {
  const url = new URL(value, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(new URL(".", window.location.href).pathname)) {
    throw new Error("素材地址不在当前项目中");
  }
  return value;
}

function mediaOnlyOneAtATime(media) {
  media.addEventListener("play", () => {
    assetList.querySelectorAll("video,audio").forEach(other => { if (other !== media) other.pause(); });
  });
}

function assetCard(asset) {
  const card = element("article", "asset-card");
  card.dataset.category = asset.category;
  card.id = "asset-" + asset.id;
  const url = relativeUrl(asset.file);
  if (asset.kind === "image") {
    const media = element("div", "asset-media");
    const link = element("a");
    link.href = url;
    link.setAttribute("aria-label", "查看原图：" + asset.title);
    const img = element("img");
    img.src = url; img.alt = asset.alt; img.loading = "lazy";
    if (asset.category === "overview") img.style.objectFit = "contain";
    link.append(img); media.append(link); card.append(media);
  } else if (asset.kind === "video") {
    const media = element("div", "asset-media");
    const video = element("video");
    video.controls = true; video.playsInline = true; video.preload = "none";
    video.poster = relativeUrl(asset.poster);
    video.setAttribute("aria-label", asset.title);
    const source = element("source"); source.src = url; source.type = "video/mp4";
    video.append(source, document.createTextNode("浏览器无法播放，请通过下方链接下载。"));
    mediaOnlyOneAtATime(video); media.append(video); card.append(media);
  } else if (asset.kind === "audio") {
    const face = element("div", "audio-face");
    face.append(element("span", "audio-speaker", asset.speaker + " / 普通话"));
    const wave = element("span", "audio-wave"); wave.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 11; i++) wave.append(element("i"));
    face.append(wave); card.append(face);
  } else {
    const face = element("div", "doc-face");
    const symbol = element("span", "", "↳"); symbol.setAttribute("aria-hidden", "true");
    face.append(symbol, element("span", "", asset.format)); card.append(face);
  }
  const body = element("div", "asset-body");
  const eyebrow = element("div", "asset-eyebrow");
  eyebrow.append(element("span", "", categoryLabels[asset.category]), element("span", "", asset.label));
  body.append(eyebrow, element("h3", "", asset.title), element("p", "asset-description", asset.description));
  if (asset.kind === "audio") {
    const audio = element("audio", "asset-audio");
    audio.controls = true; audio.preload = "none"; audio.src = url;
    audio.setAttribute("aria-label", asset.speaker + "的配音：" + asset.title);
    mediaOnlyOneAtATime(audio); body.append(audio);
  }
  if (asset.kind === "document") {
    const details = element("details", "asset-preview");
    const summary = element("summary", "", "展开查看内容");
    const pre = element("pre", "", "正在读取……");
    details.append(summary, pre);
    let loaded = false;
    details.addEventListener("toggle", async () => {
      if (!details.open || loaded) return;
      loaded = true;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("读取失败");
        pre.textContent = await response.text();
      } catch (_) { pre.textContent = "暂时无法预览，请使用下方下载链接。"; loaded = false; }
    });
    body.append(details);
  }
  body.append(element("p", "asset-meta", asset.metadata));
  const actions = element("div", "asset-actions");
  const download = element("a", "", "下载 " + asset.format + " ↓");
  download.href = url; download.download = url.split("/").pop();
  download.setAttribute("aria-label", "下载" + asset.title);
  actions.append(download);
  if (asset.context) {
    const context = element("a", "", asset.context_label || "查看创作过程 ↗");
    context.href = relativeUrl(asset.context); actions.append(context);
  }
  body.append(actions); card.append(body);
  return card;
}

function filterAssets(category, updateUrl = true) {
  if (!Object.hasOwn(categoryLabels, category)) category = "all";
  let count = 0;
  assetList.querySelectorAll(".asset-card").forEach(card => {
    card.hidden = category !== "all" && card.dataset.category !== category;
    if (!card.hidden) count++;
    else card.querySelectorAll("video,audio").forEach(media => media.pause());
  });
  filters.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === category)));
  assetCount.textContent = categoryLabels[category] + " · " + count + " / " + assets.length + " 份";
  if (updateUrl) history.replaceState(null, "", "#" + category);
}

async function initialize() {
  try {
    const response = await fetch("library-manifest.json");
    if (!response.ok) throw new Error("清单读取失败");
    const manifest = await response.json();
    assets = manifest.assets;
    document.getElementById("total-assets").textContent = assets.length;
    const cards = document.createDocumentFragment();
    assets.forEach(asset => cards.append(assetCard(asset)));
    assetList.append(cards);
    for (const [category, label] of Object.entries(categoryLabels)) {
      const button = element("button", "asset-filter", label);
      button.type = "button"; button.dataset.category = category;
      const count = category === "all" ? assets.length : assets.filter(asset => asset.category === category).length;
      button.append(element("span", "", String(count).padStart(2, "0")));
      button.addEventListener("click", () => filterAssets(category));
      filters.append(button);
    }
    filterAssets(location.hash.slice(1), false);
    window.addEventListener("hashchange", () => filterAssets(location.hash.slice(1), false));
  } catch (_) {
    assetCount.textContent = "素材清单暂时无法加载";
    const fallback = element("p", "library-error", "请刷新页面，或直接 ");
    const link = element("a", "", "观看30秒完整故事 ↗");
    link.href = "robot-sample.html#film"; fallback.append(link); assetList.append(fallback);
  }
}
initialize();
