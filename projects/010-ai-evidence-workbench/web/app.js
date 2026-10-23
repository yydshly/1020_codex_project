"use strict";
(() => {
  const sources = window.EVIDENCE_SOURCES;
  const demo = window.EVIDENCE_DEMO;
  const $ = (selector) => document.querySelector(selector);
  const sourceList = $("#source-list");
  sources.forEach((source) => {
    const article = document.createElement("article");
    article.className = "source-card";
    article.dataset.role = source.role;
    article.dataset.starter = String(source.starter);
    article.innerHTML = `<div class="source-card-top"><div><span class="source-id">${source.id} / ${source.label}</span><h3>${source.name}</h3></div><span class="badge ${source.starter ? "green" : "gray"}">${source.status}</span></div><p>${source.contribution}</p><p class="source-caution">${source.caution}</p>${source.url ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>` : '<span class="caption">按目标工具补充具体入口</span>'}`;
    sourceList.append(article);
  });
  function filterSources(filter) {
    let visible = 0;
    sourceList.querySelectorAll("article").forEach((card) => {
      card.hidden = !(filter === "all" || (filter === "starter" ? card.dataset.starter === "true" : card.dataset.role === filter));
      if (!card.hidden) visible += 1;
    });
    $("#source-count").textContent = `${visible} 个入口`;
    document.querySelectorAll(".filter").forEach((button) => {
      const active = button.dataset.filter === filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  $("#source-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-filter]"); if (button) filterSources(button.dataset.filter); });
  filterSources("starter");

  let currentStep = 0;
  const stages = [
    () => `<p class="example-intro">先读材料，确认每篇在说什么，以及它引用的最初出处。六篇文章里，可能只有三组不同证据。</p><div class="material-grid">${demo.map((item) => `<article class="material ${item.origin !== item.id ? "copied" : ""}"><span>${item.id} / ${item.type}</span><h4>${item.title}</h4><p>${item.claim}</p></article>`).join("")}</div>`,
    () => `<p class="example-intro">A、B、C、D 的关键声明都来自 A，合并展示并保留引用关系。E 和 F 分别提供不同条件下的新信息，继续保留。</p><div class="group-grid"><article class="evidence-group"><span class="mono">A ← B / C / D</span><strong>官方声明 · 1 组</strong><p>四篇材料，源头相同。只能确认厂商声称支持中文 PDF 与表格。</p><small>记录转载关系，不增加独立支持数量。</small></article><article class="evidence-group"><span class="mono">E / 独立实测</span><strong>操作结果 · 1 组</strong><p>两份文字版 PDF 的样例结果，补充任务与修改成本。</p><small>样本有限，不能推广为所有 PDF 都可用。</small></article><article class="evidence-group"><span class="mono">F / 用户反馈</span><strong>失败线索 · 1 组</strong><p>扫描件合并列出错，补充限制与待核查条件。</p><small>需要核对版本和复现，不能直接判定普遍故障。</small></article></div>`,
    () => `<p class="example-intro">比较的是每组证据回答的问题。两份文字版 PDF 的成功与一份扫描件的失败，可能源于输入差异，暂时不能互相推翻。</p><div class="comparison-list"><span class="head">证据</span><span class="head">新增了什么</span><span class="head">还不能说明什么</span><strong>官方 A</strong><p>厂商声明支持的功能范围。</p><p>无法单独证明准确性和稳定性。</p><strong>实测 E</strong><p>特定文字版 PDF 可用及修改情况。</p><p>无法证明扫描件、复杂版式或其他版本的效果。</p><strong>反馈 F</strong><p>扫描件合并列存在失败线索。</p><p>未复现前，无法判断影响范围和普遍程度。</p></div>`,
    () => `<div class="decision-result"><div><span class="badge green">示意判断 · 保留不确定性</span><h3>值得小范围试用，<br>优先验证扫描件。</h3><p>已知证据只支持“某些文字版样例可用”。若你的主要资料是扫描件，应先复现相关场景，再决定是否迁移或付费。</p><ul><li>保留三组证据及 A—D 的转载关系。</li><li>判断与证据分开记录，注明适用范围。</li><li>实际测试后，再更新结论。</li></ul></div><aside class="decision-next"><h4>下一步，只补关键缺口</h4><p>① 核对官方当前版本的扫描件限制。</p><p>② 查具体问题的复现条件和修复状态。</p><p>③ 用自己的两份中文文件，比较总耗时、漏项与修改量。</p><p class="caption">不是继续收集十篇相似推荐。</p></aside></div>`
  ];
  const stageLabels = ["6 篇材料 / 读取与追溯原始出处", "6 篇材料 → 3 组证据 / 保留独立实测和反例", "3 组证据 / 比较任务、版本与适用条件", "形成有边界的判断 / 转为最小试用"];
  function setStep(step, focus = false) {
    currentStep = step;
    document.querySelectorAll("[data-step]").forEach((tab) => {
      const active = Number(tab.dataset.step) === step;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (focus && active) tab.focus();
    });
    $("#example-panel").innerHTML = stages[step]();
    $("#example-panel").setAttribute("aria-labelledby", `step-${step}`);
    $("#example-status").textContent = stageLabels[step];
    $("#next-step").textContent = step === 3 ? "从头看一遍 ↺" : "下一步 →";
  }
  document.querySelector(".step-tabs").addEventListener("click", (event) => { const tab = event.target.closest("[data-step]"); if (tab) setStep(Number(tab.dataset.step)); });
  document.querySelector(".step-tabs").addEventListener("keydown", (event) => {
    const next = {ArrowRight:(currentStep + 1) % 4, ArrowLeft:(currentStep + 3) % 4, Home:0, End:3}[event.key];
    if (next !== undefined) { event.preventDefault(); setStep(next, true); }
  });
  $("#next-step").addEventListener("click", () => setStep((currentStep + 1) % 4));
  setStep(0);

  const checks = $("#source-checks");
  sources.forEach((source) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox"; input.value = source.id; input.checked = source.starter;
    label.append(input, document.createTextNode(source.name));
    checks.append(label);
  });
  function updatePrompt() {
    const task = $("#task").value.trim();
    const selected = new Set([...checks.querySelectorAll("input:checked")].map((input) => input.value));
    const entries = sources.filter((source) => selected.has(source.id)).map((source) => `${source.name}${source.url ? `（${source.url}）` : "（按候选补具体地址）"}`);
    const mode = $("#source-mode").value;
    const sourceRules = {
      priority:entries.length ? `优先参考：${entries.join("、")}。按证据缺口扩展新来源，不必每次全部查。` : "自行寻找合适来源，覆盖官方资料、独立实测与用户问题反馈。",
      explore:"自行探索合适来源，覆盖官方资料、独立实测与用户问题反馈；按证据缺口补查。",
      strict:entries.length ? `本轮仅查以下来源：${entries.join("、")}。不能补齐的证据明确标注；所选入口内部引用的外站，未经扩展授权只记为待查，不读取。` : "本轮没有选定来源。请先选择来源，再执行限定范围调研。"
    };
    $("#prompt-output").textContent = `请帮我调研：${task || "[先填写一个具体任务、使用场景和限制]"}\n\n${sourceRules[mode]}\n\n先检查我提供的已有证据，再收集新增信息。读取原文，记录日期、版本和使用条件；无法读取正文的只记为待查线索。\n\n合并同一发布稿或同一次测试的转载，保留原始出处与引用关系；同一工具的独立实测和反例分别保留。区分官方声明、实测、用户反馈和你的推断，核对原文不等于证实效果。\n\n按“工具/主题、事实或反馈、证据类型、出处、日期/版本、条件与限制、同源关系、核验状态”输出建议新增或更新的证据。\n\n最后给出推荐与取舍、引用的证据、仍缺什么以及最小验证办法。证据足够支持行动时停止搜索，不为凑数量扩大检索。`;
    $("#copy-status").textContent = "";
  }
  $("#task").addEventListener("input", updatePrompt);
  $("#source-mode").addEventListener("change", updatePrompt);
  checks.addEventListener("change", updatePrompt);
  updatePrompt();
  async function copyPrompt() {
    const content = $("#prompt-output").textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(content);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = content; textarea.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.append(textarea); textarea.select();
        const copied = document.execCommand("copy"); textarea.remove();
        if (!copied) throw new Error("copy unavailable");
        $("#copy-prompt").focus();
      }
      $("#copy-status").textContent = "已复制，可交给联网模型执行。";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents($("#prompt-output"));
      selection.removeAllRanges(); selection.addRange(range);
      $("#copy-status").textContent = "已选中文本，请按 Ctrl+C，或下载 TXT。";
    }
  }
  $("#copy-prompt").addEventListener("click", copyPrompt);
  $("#download-prompt").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([$("#prompt-output").textContent], {type:"text/plain;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "AI来源互补分析提示词.txt";
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  $("#print-button").addEventListener("click", () => window.print());
  const sidebar = $("#sidebar");
  const menu = $("#menu-button");
  const backdrop = $("#menu-backdrop");
  const mobileMenuQuery = window.matchMedia("(max-width:930px)");
  function syncMenuAccessibility() { sidebar.inert = mobileMenuQuery.matches && !sidebar.classList.contains("open"); }
  function closeMenu(returnFocus = false) { sidebar.classList.remove("open"); backdrop.hidden = true; menu.setAttribute("aria-expanded", "false"); menu.setAttribute("aria-label", "展开目录"); syncMenuAccessibility(); if (returnFocus) menu.focus(); }
  menu.addEventListener("click", () => { const open = !sidebar.classList.contains("open"); sidebar.classList.toggle("open", open); backdrop.hidden = !open; menu.setAttribute("aria-expanded", String(open)); menu.setAttribute("aria-label", open ? "关闭目录" : "展开目录"); syncMenuAccessibility(); if (open) sidebar.querySelector("a").focus(); });
  backdrop.addEventListener("click", () => closeMenu(true));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && sidebar.classList.contains("open")) closeMenu(true); });
  sidebar.addEventListener("keydown", (event) => { if (event.key !== "Tab" || !mobileMenuQuery.matches || !sidebar.classList.contains("open")) return; const links = [...sidebar.querySelectorAll("a")]; if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0].focus(); } });
  sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));
  mobileMenuQuery.addEventListener("change", () => closeMenu());
  syncMenuAccessibility();
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      document.querySelectorAll("#navigation a").forEach((link) => { const active = link.hash === `#${visible[0].target.id}`; link.classList.toggle("active", active); if (active) link.setAttribute("aria-current","location"); else link.removeAttribute("aria-current"); });
    }, {rootMargin:"-10% 0px -60% 0px",threshold:0});
    document.querySelectorAll("main>.section").forEach((section) => observer.observe(section));
  }
})();
