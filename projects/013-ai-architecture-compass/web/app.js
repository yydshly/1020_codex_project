"use strict";
(() => {
  const data = JSON.parse(document.getElementById("catalog-data").textContent);
  const cards = [...document.querySelectorAll(".architecture-card")];
  const search = document.getElementById("architecture-search");
  const filters = [...document.querySelectorAll("[data-category]")].filter(el => el.tagName === "BUTTON");
  let category = "全部";
  function filterMethods() {
    const term = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const match = (category === "全部" || card.dataset.category === category) && card.dataset.search.includes(term);
      card.hidden = !match;
      if (match) visible += 1;
    });
    document.getElementById("results-count").textContent = `显示 ${visible} / ${cards.length} 种方法${category === "全部" ? "" : ` · ${category}`}`;
    document.getElementById("no-results").hidden = visible !== 0;
  }
  filters.forEach(button => button.addEventListener("click", () => {
    category = button.dataset.category;
    filters.forEach(el => { const active = el === button; el.classList.toggle("active", active); el.setAttribute("aria-pressed", String(active)); });
    filterMethods();
  }));
  search.addEventListener("input", filterMethods);

  const options = [...document.querySelectorAll('input[name="pressure"]')];
  const projectName = document.getElementById("project-name");
  const { presets, recommend } = ArchitectureDecision;
  let planText = "";
  function selection() { return new Set(options.filter(el => el.checked).map(el => el.value)); }
  function updatePlan() {
    const selected = selection();
    const recommendations = recommend(selected);
    const root = document.getElementById("recommendations");
    root.replaceChildren();
    recommendations.forEach(item => {
      const article = document.createElement("article"); article.className = "recommendation";
      const label = document.createElement("span"); label.className = `rec-label${item.conditional ? " conditional" : ""}`; label.textContent = item.label;
      const title = document.createElement("h4"); title.textContent = item.name;
      const reason = document.createElement("p"); reason.textContent = item.reason;
      const rule = document.createElement("p"); rule.className = "rec-rule"; rule.textContent = `落地约束：${item.rule}`;
      article.append(label, title, reason, rule); root.append(article);
    });
    const name = projectName.value.trim() || "待命名项目";
    const pressureLabels = options.filter(el => el.checked).map(el => el.parentElement.querySelector("strong").textContent);
    planText = `# ${name} · 架构起步约束\n\n状态：候选方案，需结合真实用例验证\n整理日期：${data.date}\n\n## 目标与范围\n- 用户任务：待填写\n- 第一版边界：待填写\n- 关键验收场景：待填写\n\n## 已识别的压力\n${pressureLabels.length ? pressureLabels.map(value => `- ${value}`).join("\n") : "- 暂无明确额外压力，先验证简单实现。"}\n\n## 组合及采用理由\n${recommendations.map(item => `### ${item.name}${item.conditional ? "（待评估）" : ""}\n${item.reason}\n\n约束：${item.rule}\n`).join("\n")}\n## 组合的一致性约定\n- 规则与数据的所有者：待明确，跨模块通过公开入口。\n- 必须共同成功的操作与允许延后的任务：待明确；可靠交付需要验证写入成功但任务未送达的窗口。\n- 权威数据与派生数据：待明确；采用投影或事件历史时记录重建和兼容要求。\n\n## 每次实现\n1. 读取适用指令、相关架构说明和已有决策；定位用例、模块、规则及接口影响。\n2. 保持依赖方向和模块边界，围绕真实场景实现；架构需要调整时记录理由与影响。\n3. 执行项目实际存在的检查，报告通过、失败、未执行与未验证范围。\n4. 边界变化同步到代码、决策及检查，不为通过检查直接删除断言或放宽约束。\n\n## 验证与演进\n- 检查命令：待按真实工具链配置\n- 核心行为与失败场景：待填写\n- 合入必要检查：待在平台配置并确认\n- 重新评估架构的条件：待填写\n\n说明：此方案由静态规则映射生成；未分析代码，未配置实际检查。\n`;
    document.getElementById("plan-status").textContent = "";
  }
  document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
    options.forEach(el => { el.checked = presets[button.dataset.preset].includes(el.value); });
    document.querySelectorAll("[data-preset]").forEach(el => { const active = el === button; el.classList.toggle("active", active); el.setAttribute("aria-pressed", String(active)); });
    const names = { notes: "我的笔记产品", avatar: "我的数字人应用", tools: "我的 AI 工具工作台", simple: "我的简单工具" };
    projectName.value = names[button.dataset.preset]; updatePlan();
  }));
  options.forEach(el => el.addEventListener("change", () => {
    document.querySelectorAll("[data-preset]").forEach(button => { button.classList.remove("active"); button.setAttribute("aria-pressed", "false"); });
    updatePlan();
  }));
  projectName.addEventListener("input", updatePlan);
  document.getElementById("copy-plan").addEventListener("click", async () => {
    const status = document.getElementById("plan-status");
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(planText);
      else {
        const input = document.createElement("textarea"); input.value = planText; input.style.position = "fixed"; input.style.opacity = "0"; document.body.append(input); input.select();
        const copied = document.execCommand("copy"); input.remove(); if (!copied) throw new Error("Clipboard unavailable");
      }
      status.textContent = "已复制项目约束，可按真实项目继续补充。";
    } catch { status.textContent = "浏览器未允许复制，请使用下载 Markdown。"; }
  });
  document.getElementById("download-plan").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([planText], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "architecture-contract.md"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById("plan-status").textContent = "已发起下载；这份文件是待验证的起步方案。";
  });
  updatePlan();

  // Compare a small set on the same axes, without treating different levels as alternatives.
  const compareInputs = [...document.querySelectorAll('input[name="compare"]')];
  const comparison = document.getElementById("compare");
  comparison.addEventListener("toggle", () => { comparison.querySelector(".comparison-action").textContent = comparison.open ? "收起对比 −" : "展开对比 ＋"; });
  const compareRows = [["约束的层次", "kind"], ["核心问题", "question"], ["什么时候用", "scene"], ["何时延后", "notFor"], ["最小一步", "firstStep"], ["采用的代价", "cost"], ["有效性信号", "successSignal"]];
  function renderComparison() {
    const chosen = compareInputs.filter(el => el.checked).map(el => data.architectures.find(item => item.id === el.value));
    compareInputs.forEach(el => { el.disabled = chosen.length >= 3 && !el.checked; });
    document.getElementById("compare-status").textContent = `已选 ${chosen.length} / 3 种方法${chosen.length >= 3 ? "，取消一项后可选择其他方法。" : "，可选择任意 2–3 种并排阅读。"}`;
    const root = document.getElementById("comparison-result"); root.replaceChildren();
    if (!chosen.length) { const empty = document.createElement("p"); empty.className = "caption"; empty.textContent = "从上面选取方法，或使用一组对比预设。"; root.append(empty); return; }
    const table = document.createElement("table"); table.className = "comparison-table";
    const caption = table.createCaption(); caption.textContent = "相同问题，并排比较";
    const head = table.createTHead().insertRow();
    ["观察维度", ...chosen.map(item => item.name)].forEach(name => { const th = document.createElement("th"); th.scope = "col"; th.textContent = name; head.append(th); });
    const body = table.createTBody();
    compareRows.forEach(([label, key]) => { const row = body.insertRow(); const th = document.createElement("th"); th.scope = "row"; th.textContent = label; row.append(th); chosen.forEach(item => { const cell = row.insertCell(); cell.textContent = item[key]; }); });
    root.append(table);
    const note = document.createElement("p"); note.className = "comparison-note";
    if (chosen.length > 1 && chosen.every(item => ["hexagonal", "clean", "onion"].includes(item.id))) note.textContent = "这组方法都强调核心独立于外部技术。选一种团队容易表达的边界方式即可，再按实际需要补充规则，避免重复堆叠相同抽象。";
    else if (chosen.length > 1 && chosen.every(item => ["event", "cqrs", "sourcing"].includes(item.id))) note.textContent = "事件驱动关注协作，CQRS 关注读写模型，事件溯源关注状态来源。三者可以分别采用；是否拆库、异步投影或保留事件历史，需要各自的理由。";
    else if (new Set(chosen.map(item => item.category)).size > 1) note.textContent = "这些方法处在不同关注层次，可以组合。先写明每种方法负责哪一种问题，再确定它们共同遵守的数据所有权与一致性边界。";
    else note.textContent = "结合改动范围、代价和有效性信号作判断；表中没有通用优胜者。";
    root.append(note);
  }
  compareInputs.forEach(input => input.addEventListener("change", renderComparison));
  document.querySelectorAll("[data-compare-set]").forEach(button => button.addEventListener("click", () => {
    const ids = button.dataset.compareSet.split(","); compareInputs.forEach(input => { input.checked = ids.includes(input.value); }); renderComparison();
  }));
  renderComparison();

  // A task draft separates intended checks from execution evidence.
  const taskInputs = [...document.querySelectorAll("[data-task-field]")];
  const taskName = document.getElementById("task-project");
  const taskExample = {
    goal: "给笔记生成润色建议，由用户决定采纳。成功结果：用户看到建议，并能在版本未变时保存采纳结果。",
    invariants: "INV-01：生成建议与模型失败都不改变正式正文。\nINV-02：过期建议不能覆盖较新正文；版本检查与写入必须原子地维护此规则。",
    boundary: "AI 用例通过文本生成端口产出建议；模型 SDK 留在适配器。内容模块拥有正文和版本，所有采纳操作经过统一入口。实际接口名与文件路径需核对仓库。",
    failures: "模型超时、空结果；生成后正文已更新；两个请求基于同一版本并发采纳；保存中断后重开；索引失败后重试。",
    evidence: "INV-01：对比失败前后实际正文。INV-02：以实际存储验证并发采纳只有一个成功；再重开确认结果。依赖检查确认核心不导入厂商 SDK。检查命令在读取真实仓库后填写。",
    revisit: "同一版本规则在多个入口重复、增加第二模型需要改核心业务、一次局部改动持续扩散到无关模块时，记录例子并重审边界。"
  };
  function updateTask() {
    const values = Object.fromEntries(taskInputs.map(input => [input.dataset.taskField, input.value]));
    const state = ArchitectureDecision.taskState(values);
    document.getElementById("task-progress").textContent = `已填写 ${state.filled} / 6 项 · 只表示信息填写情况`;
    document.getElementById("task-missing").textContent = state.missing.length ? `待补充：${state.missing.join("、")}。` : "六项均已填写。交给 AI 后仍需核对真实代码，并提供实际验证结果。";
    document.getElementById("task-preview").value = ArchitectureDecision.buildTask(taskName.value, values);
    document.getElementById("task-status").textContent = "";
  }
  taskInputs.forEach(input => input.addEventListener("input", updateTask)); taskName.addEventListener("input", updateTask);
  document.getElementById("load-task-example").addEventListener("click", () => {
    taskName.value = "笔记 AI 润色（教学示例）"; taskInputs.forEach(input => { input.value = taskExample[input.dataset.taskField]; }); updateTask();
    document.getElementById("task-status").textContent = "已填入教学示例；请按自己的项目修改。";
  });
  document.getElementById("copy-task").addEventListener("click", async () => {
    const preview = document.getElementById("task-preview"); const status = document.getElementById("task-status");
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(preview.value);
      else { preview.focus(); preview.select(); if (!document.execCommand("copy")) throw new Error("Clipboard unavailable"); }
      status.textContent = "已复制任务约束草案；执行后的证据需要另行记录。";
    } catch { status.textContent = "浏览器未允许复制，可以选中预览内容手动复制，或下载任务卡。"; }
  });
  document.getElementById("download-task").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([document.getElementById("task-preview").value], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "ai-implementation-task.md"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById("task-status").textContent = "已发起任务卡下载。";
  });
  updateTask();

  const examples = [
    '<h3>先明确：建议与正文，分别由谁负责？</h3><p>生成建议是一项 AI 辅助用例；正式正文仍由内容模块维护。建议保留正文版本，采纳入口原子地检查版本并写入。</p><div class="example-columns"><div><h4>这次涉及的业务规则</h4><ul><li>生成失败不改变已保存正文。</li><li>旧建议无法直接覆盖较新版本。</li><li>INV-02：版本匹配与写入由统一内容入口原子地维护。</li></ul></div><div><h4>对应的结构</h4><ul><li>AI 用例依赖文本生成端口。</li><li>具体模型 SDK 留在适配器内。</li><li>内容模块拥有版本检查与写入。</li></ul></div></div><div class="check-result pass">架构提供的方向：规则有归属，接入有边界，新增用例可以复用既有能力。</div>',
    '<h3>一次方便的直连，会绕过什么？</h3><p>假设 AI 把模型调用和文件写入直接放进按钮事件，功能可能看起来可用，但版本规则和职责边界被绕过。</p><pre class="code-block">// 教学伪代码：按钮事件直接接入模型并写正式正文\nconst suggestion = await VendorSDK.generate(editor.text);\nawait writeFile(note.path, suggestion);\n\n// 应核对：建议属于哪个正文版本？\n// 所有写入是否通过内容更新入口？</pre><div class="check-result fail">预期审查结果：指出版本检查缺失与职责越界。导入规则可发现部分结构问题；业务问题需要场景审查与测试。</div>',
    '<h3>让失败场景检验这次设计。</h3><p>测试从需要保护的行为出发，并补充真实存储和外部适配验证。</p><table><thead><tr><th scope="col">场景</th><th scope="col">预期行为</th></tr></thead><tbody><tr><td>第 12 版生成建议，正文已到第 13 版</td><td>拒绝直接应用，要求重新核对。</td></tr><tr><td>两个请求基于同一版本同时采纳</td><td>在实际存储中只有一个成功，另一个收到明确冲突。</td></tr><tr><td>模型超时或返回错误</td><td>正文保持完整，建议任务有明确失败状态。</td></tr><tr><td>采纳后关闭并重新打开</td><td>实际存储中的正文与已确认结果一致。</td></tr><tr><td>索引更新失败</td><td>已保存正文可读取，索引可以重试或重建。</td></tr></tbody></table><div class="check-result pass">交付时附实际执行记录。这些是预期结果，页面没有运行上述测试。</div>'
  ];
  function showExample(index) {
    document.getElementById("example-panel").innerHTML = examples[index];
    document.querySelectorAll("[data-example]").forEach(button => { const active = Number(button.dataset.example) === index; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  }
  document.querySelectorAll("[data-example]").forEach(button => button.addEventListener("click", () => showExample(Number(button.dataset.example))));
  showExample(0);
  const sections = [...document.querySelectorAll("main>.section")];
  let navigationFrame = 0;
  function updateCurrentSection() {
    navigationFrame = 0;
    // Long sections may remain intersecting throughout an anchor jump.
    // Use all section positions, not just the observer's changed entries.
    const threshold = window.innerWidth <= 800 ? 165 : 160;
    let current = sections[0];
    sections.forEach(section => { if (section.getBoundingClientRect().top <= threshold) current = section; });
    document.querySelectorAll(".sidebar nav a").forEach(link => {
      const active = link.hash === `#${current.id}`;
      link.classList.toggle("current", active);
      if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
    });
  }
  function scheduleNavigation() { if (!navigationFrame) navigationFrame = requestAnimationFrame(updateCurrentSection); }
  window.addEventListener("scroll", scheduleNavigation, { passive: true });
  window.addEventListener("resize", scheduleNavigation);
  updateCurrentSection();
})();
