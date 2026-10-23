/* Static research reader. No model/API requests; only optional official audio playback. */
(() => {
  'use strict';
  const { tools, glossary, date } = window.RESEARCH;
  const main = document.getElementById('content');
  const progressKey = 'ai-toolkit-reading-v1';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const number = value => String(value).padStart(2, '0');
  const link = (url, label, className = 'source-link') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
  let progress = new Set();
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || '[]');
    if (Array.isArray(saved)) progress = new Set(saved.filter(id => tools.some(tool => tool.id === id)));
  } catch { storageAvailable = false; }
  let currentTool = null;
  let filter = 'all';
  let query = '';

  function sourceUrl(tool, key) {
    if (key.startsWith('https://')) return key;
    if (key === 'README') return tool.evidence.readme_url;
    return tool.evidence.inspected_files.find(file => file.path === key)?.url || tool.evidence.readme_url;
  }
  const sourceLink = (tool, key, label = '查看依据') => link(sourceUrl(tool, key), label);
  function progressUI() {
    document.getElementById('read-count').textContent = progress.size;
    document.getElementById('read-fill').style.width = `${progress.size / tools.length * 100}%`;
    document.querySelector('.sidebar-note small').textContent = storageAvailable ? '由你标记，仅保存在此浏览器。' : '浏览器存储不可用，本次阅读期间有效。';
    document.getElementById('tool-nav').innerHTML = tools.map(tool => `<a href="#/tool/${tool.id}" ${currentTool?.id === tool.id ? 'class="active" aria-current="page"' : ''}>
      <span class="num">${number(tool.level)}</span><span><span class="name">${escape(tool.id === 'shorts' ? 'YouTube Shorts Generator' : tool.name)}</span><span class="sub">${escape(tool.short)} · ${tool.depth === 'deep' ? '深入拆解' : '概览'}</span></span>${progress.has(tool.id) ? '<span class="read-dot" aria-label="已读"></span>' : ''}</a>`).join('');
  }
  function header(page, breadcrumb) {
    document.getElementById('breadcrumb').textContent = breadcrumb;
    document.title = `${breadcrumb} · AI 内容工具研究笔记`;
    document.querySelectorAll('[data-nav]').forEach(el => {
      const selected = el.dataset.nav === page;
      el.classList.toggle('active', selected);
      if (selected) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    progressUI();
  }
  function card(tool) {
    return `<a class="tool-card ${tool.depth === 'deep' ? 'featured' : ''}" href="#/tool/${tool.id}">
      <div class="card-meta"><span class="order">${number(tool.level)} / ${escape(tool.type)}</span><span class="depth-label">${tool.depth === 'deep' ? '深入拆解' : '概览已整理'}</span></div>
      <h3>${escape(tool.name)}</h3><p class="description">${escape(tool.summary)}</p>
      <div class="io-mini"><span>${escape(tool.short)}</span><span aria-hidden="true">→</span><b>${escape(tool.output)}</b></div>
      <div class="card-bottom"><span>阅读研究 <span aria-hidden="true">↗</span></span><span class="level-dots" aria-label="学习顺序第 ${tool.level} 项">${Array.from({ length: 6 }, (_, i) => `<i class="${i < tool.level ? 'on' : ''}"></i>`).join('')}</span></div>
    </a>`;
  }
  function home() {
    header('home', '研究总览');
    main.innerHTML = `<section class="hero">
      <div class="hero-copy"><p class="eyebrow">RESEARCH NOTEBOOK / 002</p><h1>六个 AI 内容工具，<br><em>从效果到原理。</em></h1>
      <p class="intro">按简单到复杂的顺序，逐个看清它能做什么、<br>为什么做得到，以及效果应该怎样验证。</p>
      <div class="hero-actions"><a class="button" href="#/summary">六个工具，一图总览 <span aria-hidden="true">↗</span></a><a class="text-link" href="#/tool/kokoro">从 Kokoro 开始学习 →</a></div></div>
      <div class="hero-board" aria-label="从单一能力到多环节制作再到研究 Agent">
        <div class="board-label"><span>THE LEARNING PATH</span><span>01 — 06</span></div>
        <div class="board-path"><div class="board-node"><small>FOUNDATION</small><strong>单一能力</strong><p>语音合成<br>本地内容检索</p></div><div class="board-node"><small>WORKFLOW</small><strong>多环节制作</strong><p>播客 · 素材混剪<br>长视频切片</p></div><div class="board-node"><small>AGENT</small><strong>研究与判断</strong><p>工具调用<br>循环搜索与综合</p></div></div>
        <div class="board-bottom"><span>当前深入研究</span><b>Local Deep Research / 问题 → 报告</b></div>
      </div></section>
      <div class="evidence-strip" aria-label="研究进展"><div><strong>06</strong><span><b>工具概览</b>文档与部分代码已核对</span></div><div><strong>${number(tools.filter(tool => tool.depth === 'deep').length)}</strong><span><b>深入拆解</b>${tools.filter(tool => tool.depth === 'deep').map(tool=>escape(tool.name)).join(' · ')}</span></div><div><strong>00</strong><span><b>本机实测</b>效果与性能待验证</span></div></div>
      <section><div class="section-heading"><div><h2>从简单到复杂，逐篇理解</h2><p>顺序按理解难度安排，不代表安装难度或工具优劣。</p></div><span class="counter">6 LIBRARIES</span></div>
      <div class="tool-grid">${tools.map(card).join('')}</div></section>
      <section class="reading-note"><div><h3>怎样阅读这些结论</h3><p>每篇都保留来源与研究版本。</p></div><div class="legend"><div><b>官方资料</b>作者说明的功能与样例</div><div><b>代码核对</b>在固定版本中读到的实现</div><div><b>本机实测</b>仅在实际运行后填写结果</div></div></section>`;
  }
  function effects(tool) {
    return `${tool.id === 'kokoro' ? '<aside class="lesson-entry"><div><span class="sample-tag">新增 · 声音基础</span><h3>波形怎样变成你熟悉的声音？</h3><p>可调波形与试听、四段中文讲解、音色向量和编码器训练示意。</p></div><a class="button" href="#/tool/kokoro/basics">进入图解与试听 →</a></aside>' : ''}<section class="reading-section"><p class="section-kicker">01 / INPUT & OUTPUT</p><h2>先看它处理什么</h2>
      <div class="example-panel"><div><label>示例输入</label><p>${escape(tool.example.input)}</p></div><span class="example-arrow" aria-hidden="true">→</span><div><label>预期输出形式</label><p>${escape(tool.example.output)}</p></div></div>
      <p class="disclosure">${escape(tool.example.note)}</p>
      ${(tool.samples || []).map(sample => `<div class="sample-panel"><div><span class="sample-tag">OFFICIAL SAMPLE / 官方样例</span><h3>${escape(sample.title)}</h3><p>${escape(sample.caption)}</p>${link(sample.source, '查看官方样例页')}</div><div><audio controls preload="none" aria-label="${escape(sample.title)}"><source src="${escape(sample.url)}" type="audio/wav">浏览器不支持内嵌音频。</audio><p class="sample-fallback">音频来自 Hugging Face，播放需联网。无法加载时可访问官方样例页。</p></div></div>`).join('')}
      ${tool.id === 'digup' ? window.DigUpLearning.effects() : ''}
      ${tool.id === 'podcastfy' ? window.PodcastfyLearning.effects() : ''}
      ${tool.id === 'video-factory' ? window.VideoFactoryLearning.effects() : ''}
      ${tool.id === 'shorts' ? window.ShortsLearning.effects() : ''}
      ${tool.id === 'ldr' ? window.LdrLearning.effects() : ''}
      ${!tool.samples?.length ? `<div class="result-empty"><span aria-hidden="true">◌</span><div><strong>本机效果样例待补充</strong><p>目前可核对功能与处理过程。实际质量、速度和中文表现留待实验记录。</p></div></div>` : ''}
      </section><section class="reading-section"><p class="section-kicker">02 / CAPABILITIES</p><h2>已经确认的能力</h2><p class="section-lead">以下依据官方文档或已检查代码；不是本机效果测试结论。</p>
      <div class="capabilities">${tool.capabilities.map((cap, i) => `<article class="capability"><span class="cap-num">${number(i + 1)}</span><h3>${escape(cap.title)}</h3><p>${escape(cap.body)}</p>${sourceLink(tool, cap.source, cap.source === 'README' ? '官方文档' : '关键代码')}</article>`).join('')}</div>
      <aside class="limits"><h3>使用时需要理解的边界</h3><ul>${tool.boundaries.map(item => `<li>${escape(item)}</li>`).join('')}</ul></aside></section>`;
  }
  function stageBody(tool, index) {
    const stage = tool.stages[index];
    return `<div><span class="stage-tag">${number(index + 1)} / ${escape(stage.tag)}</span><h3>${escape(stage.title)}</h3><p>${escape(stage.body)}</p>${sourceLink(tool, stage.source, '对应源码或文档')}</div>
      <div class="stage-io"><div><small>这一阶段的输入</small><p>${escape(stage.input)}</p></div><div><small>这一阶段的输出</small><p>${escape(stage.output)}</p></div><div><small>阅读入口</small><code>${escape(stage.code)}</code></div></div>`;
  }
  function principles(tool) {
    return `${tool.id === 'digup' ? window.DigUpLearning.principles() : ''}${tool.id === 'podcastfy' ? window.PodcastfyLearning.principles() : ''}${tool.id === 'video-factory' ? window.VideoFactoryLearning.principles() : ''}${tool.id === 'shorts' ? window.ShortsLearning.principles() : ''}${tool.id === 'ldr' ? window.LdrLearning.principles() : ''}<section class="reading-section"><p class="section-kicker">03 / UNDER THE HOOD</p><h2>沿着数据，拆开每一步</h2><p class="section-lead">点击任一阶段查看解释。这是基于文档与代码的流程讲解，不会在网页中运行模型。</p>
      <div class="flow-board"><div class="flow-buttons" style="--steps:${tool.stages.length}" role="group" aria-label="选择要理解的处理阶段">${tool.stages.map((stage, i) => `<button data-stage="${i}" aria-pressed="${i === 0}" class="${i === 0 ? 'active' : ''}" aria-controls="stage-detail"><small>STEP ${number(i + 1)}</small><strong>${escape(stage.title)}</strong></button>`).join('')}</div>
      <div class="stage-body" id="stage-detail" aria-live="polite">${stageBody(tool, 0)}</div></div>
      <div class="insight-list">${tool.insights.map(item => `<article class="insight"><h3>${escape(item.title)}</h3><div><p>${escape(item.body)}</p>${sourceLink(tool, item.source)}</div></article>`).join('')}</div></section>
      ${tool.id === 'digup' ? window.DigUpLearning.fusion() : ''}
      <section class="reading-section"><p class="section-kicker">04 / REQUIREMENTS</p><h2>要运行它，还需要什么</h2><div class="environment-grid"><div><small>运行环境</small><p>${escape(tool.environment)}</p></div><div><small>网络与服务</small><p>${escape(tool.network)}</p></div><div><small>成本来自哪里</small><p>${escape(tool.cost)}</p></div></div><p class="disclosure">依据研究版本整理。环境要求与实际运行表现分别记录，具体费用尚未估算。</p></section>`;
  }
  function experiment(tool) {
    const exp = tool.experiment;
    return `<section class="reading-section"><p class="section-kicker">05 / VERIFY IT</p><h2>用一个小实验验证理解</h2><p class="section-lead">先写清判断标准，再运行工具。以下是待执行方案。</p>
      <div class="experiment-panel"><span class="pending-label">待实测</span><h3>${escape(exp.title)}</h3><p>${escape(exp.material)}</p><ol>${exp.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><h3>要记录的指标</h3><div class="metrics">${exp.metrics.map(metric => `<span>${escape(metric)}</span>`).join('')}</div>
      <div class="result-empty"><span aria-hidden="true">◌</span><div><strong>还没有本机实验结果</strong><p>${escape(exp.next)}</p></div></div></div>
      <div class="quiz"><h3>读完后，试着回答</h3>${tool.quiz.map(item => `<details><summary>${escape(item.question)}</summary><p>${escape(item.answer)}</p></details>`).join('')}</div></section>`;
  }
  function sources(tool) {
    const entries = [
      { label: '官方 README', url: tool.evidence.readme_url, kind: '功能与用法' },
      ...tool.evidence.inspected_files.map(file => ({ label: file.path, url: file.url, kind: '检查过的源码或配置' })),
      ...tool.extras.map(item => ({ label: item.label, url: item.url, kind: '官方外部资料 · 页面内容可能更新' }))
    ];
    return `<section class="reading-section"><p class="section-kicker">06 / SOURCES</p><h2>可以回到源头的研究</h2><p class="section-lead">GitHub 文件固定到同一 commit；外部模型卡与样例保留官方入口。</p>
      <div class="source-notice">核对日期：${escape(date)}<br>研究版本：<span class="code-hash">${escape(tool.evidence.commit)}</span><br>GitHub 记录的许可证：${escape(tool.evidence.license)}</div>
      <div class="source-list">${entries.map(item => `<a class="source-row" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer"><div><b>${escape(item.label)}</b><small>${escape(item.kind)}</small></div><span aria-hidden="true">↗</span></a>`).join('')}</div>
      <p class="disclosure">本页的用途类比、学习顺序和实验设计是研究整理；能力与实现结论依据上面的官方来源。本机运行仍为待验证。</p></section>`;
  }
  function detail(tool, tab) {
    currentTool = tool;
    header('', tool.name);
    const tabs = [{ id: 'effects', label: '效果与能力' }, { id: 'principles', label: '底层原理' }, { id: 'experiment', label: '验证计划' }, { id: 'sources', label: '来源与版本' }];
    if (tool.id === 'kokoro') tabs.splice(1, 0, { id: 'basics', label: '声音基础 · 图解试听' });
    const active = tabs.some(item => item.id === tab) ? tab : 'effects';
    const next = tools[tool.level];
    main.innerHTML = `<div class="detail-top"><a class="back-link" href="#/">← 返回研究总览</a><span class="detail-status">${tool.depth === 'deep' ? '深入拆解' : '概览'} · 本机效果待验证</span></div>
      <section class="detail-hero"><div><p class="eyebrow">CHAPTER ${number(tool.level)} / ${escape(tool.type)}</p><h1>${escape(tool.name)}</h1><p class="headline">${escape(tool.headline)}</p><p class="intro">${escape(tool.summary)}</p><div class="meta-inline"><span>${escape(tool.evidence.license)}</span><span>COMMIT ${escape(tool.evidence.commit.slice(0, 7))}</span><span>${escape(date)}</span></div></div>
      <div class="io-panel"><div><small>INPUT / 输入</small><strong>${escape(tool.input)}</strong></div><div class="io-arrow" aria-hidden="true">↓</div><div><small>OUTPUT / 输出</small><strong>${escape(tool.output)}</strong></div></div></section>
      <nav class="section-nav" aria-label="研究内容">${tabs.map(item => `<button data-section="${item.id}" class="${item.id === active ? 'active' : ''}" aria-pressed="${item.id === active}">${item.label}</button>`).join('')}</nav>
      <div id="detail-content">${active === 'basics' ? window.KokoroLearning.render() : ({ effects, principles, experiment, sources })[active](tool)}</div>
      <div class="read-actions"><button class="read-button" data-read="${tool.id}" aria-pressed="${progress.has(tool.id)}">${progress.has(tool.id) ? '✓ 已标记读过 · 点击取消' : '○ 标记为已读'}</button>${next ? `<a href="#/tool/${next.id}">下一篇：${escape(next.name)} →</a>` : '<a href="#/compare">回看六个工具的能力对照 →</a>'}</div>`;
  }
  function compareRows() {
    const result = tools.filter(tool => {
      const matchesFilter = filter === 'all' || (filter === 'foundation' && tool.level <= 2) || (filter === 'workflow' && tool.level >= 3 && tool.level <= 5) || (filter === 'agent' && tool.level === 6);
      const haystack = `${tool.name} ${tool.short} ${tool.input} ${tool.output} ${tool.mechanism}`.toLocaleLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLocaleLowerCase());
    });
    document.getElementById('compare-body').innerHTML = result.length ? result.map(tool => `<tr><td><a href="#/tool/${tool.id}">${escape(tool.name)}</a><small>${number(tool.level)} · ${escape(tool.type)}</small></td><td>${escape(tool.input)}<br>↓<br>${escape(tool.output)}</td><td>${escape(tool.mechanism)}</td><td>${escape(tool.network)}</td><td>${escape(tool.cost)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-search">没有匹配的工具。试试更短的关键词或“全部”。</td></tr>';
    document.getElementById('table-count').textContent = `显示 ${result.length} / ${tools.length} 个工具 · 全部本机效果待验证`;
  }
  function compare() {
    header('compare', '能力对照');
    main.innerHTML = `<header class="page-header"><p class="eyebrow">SIDE BY SIDE</p><h1>相似的名字，不同的职责。</h1><p>比较输入输出、核心机制和运行边界。用途决定选择，不需要把六个工具全部接成一条流水线。</p></header>
      <div class="compare-controls"><div class="filters" role="group" aria-label="按工具层级筛选">${[['all', '全部'], ['foundation', '单一能力'], ['workflow', '多环节制作'], ['agent', '研究 Agent']].map(([id, label]) => `<button data-filter="${id}" aria-pressed="${filter === id}" class="${filter === id ? 'active' : ''}">${label}</button>`).join('')}</div><label class="search-box">查找工具 <input id="tool-search" type="search" placeholder="名称、配音、视频…" value="${escape(query)}"></label></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="六个工具能力比较，窄屏可横向滚动"><table><thead><tr><th scope="col">工具</th><th scope="col">输入 → 输出</th><th scope="col">核心机制</th><th scope="col">网络与本地边界</th><th scope="col">主要成本</th></tr></thead><tbody id="compare-body"></tbody></table></div><p class="table-count" id="table-count" aria-live="polite"></p>
      <section class="reading-note"><div><h3>能力重叠，不等于直接兼容</h3></div><p>例如 Kokoro 提供配音能力，而 Podcastfy 和短视频工厂已经有各自的语音后端。替换需要验证接口、格式和效果；网页中的学习顺序并不是官方集成顺序。</p></section>`;
    compareRows();
  }
  function experiments() {
    header('experiments', '实验记录');
    main.innerHTML = `<header class="page-header"><p class="eyebrow">OBSERVE / MEASURE / RECORD</p><h1>先定义“有效”，再运行工具。</h1><p>当前六项均待实测。实验用同一份记录结构保留输入、环境、输出与失败样例，避免只凭一次演示判断工具。</p></header>
      <div class="experiment-actions"><button class="button" id="download-template">下载实验记录模板 <span aria-hidden="true">↓</span></button><p>Markdown 文件，可直接放入项目 notes 目录。</p></div>
      <div class="experiment-list">${tools.map(tool => `<article class="experiment-card"><div><p class="section-kicker">EXPERIMENT ${number(tool.level)}</p><h3>${escape(tool.name)}</h3><span class="pending-label">待实测</span></div><div><h3>${escape(tool.experiment.title)}</h3><p>${escape(tool.experiment.material)}</p><a class="text-link" href="#/tool/${tool.id}/experiment">查看步骤与判断标准 →</a><div class="metrics">${tool.experiment.metrics.map(metric => `<span>${escape(metric)}</span>`).join('')}</div></div></article>`).join('')}</div>`;
  }
  function terms() {
    header('', '名词速查');
    main.innerHTML = `<header class="page-header"><p class="eyebrow">SMALL GLOSSARY</p><h1>读原理时会遇到的词。</h1><p>先掌握它在这套工具中的作用，再深入具体算法。</p></header><dl class="glossary">${glossary.map(([term, meaning]) => `<div><dt>${escape(term)}</dt><dd>${escape(meaning)}</dd></div>`).join('')}</dl><a class="button secondary" href="#/tool/kokoro/principles">回到第一篇的原理讲解 →</a>`;
  }
  function route(focus = false) {
    window.KokoroLearning.dispose();
    currentTool = null;
    const [, name, id, tab] = location.hash.replace(/^#/, '').split('/');
    if (!name) home();
    else if (name === 'summary') { header('summary', '一图总览'); main.innerHTML = window.SummaryPage.render(); }
    else if (name === 'tool' && tools.some(tool => tool.id === id)) detail(tools.find(tool => tool.id === id), tab);
    else if (name === 'compare') compare();
    else if (name === 'experiments') experiments();
    else if (name === 'glossary') terms();
    else {
      header('', '页面未找到');
      main.innerHTML = '<header class="page-header"><p class="eyebrow">NOT FOUND</p><h1>还没有这一篇研究。</h1><p>请从总览中选择工具。</p><a class="button" href="#/">返回总览 →</a></header>';
    }
    if (document.querySelector('.sound-lesson')) window.KokoroLearning.mount();
    if (currentTool?.id === 'digup') window.DigUpLearning.mount();
    if (currentTool?.id === 'podcastfy') window.PodcastfyLearning.mount();
    if (currentTool?.id === 'video-factory') window.VideoFactoryLearning.mount();
    if (currentTool?.id === 'shorts') window.ShortsLearning.mount();
    if (currentTool?.id === 'ldr') window.LdrLearning.mount();
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
    document.getElementById('menu-toggle').textContent = '展开目录';
    if (focus) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('.skip-link')) {
      event.preventDefault();
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start' });
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'menu-toggle') {
      const open = document.querySelector('.sidebar').classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? '收起目录' : '展开目录';
    } else if (button.dataset.section && currentTool) {
      location.hash = `/tool/${currentTool.id}/${button.dataset.section}`;
    } else if (button.dataset.stage !== undefined && currentTool) {
      const index = Number(button.dataset.stage);
      document.querySelectorAll('[data-stage]').forEach(el => {
        const active = el === button;
        el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
      });
      document.getElementById('stage-detail').innerHTML = stageBody(currentTool, index);
    } else if (button.dataset.read) {
      const id = button.dataset.read;
      if (progress.has(id)) progress.delete(id); else progress.add(id);
      try { localStorage.setItem(progressKey, JSON.stringify([...progress])); } catch { storageAvailable = false; }
      progressUI();
      button.setAttribute('aria-pressed', String(progress.has(id)));
      button.textContent = progress.has(id) ? '✓ 已标记读过 · 点击取消' : '○ 标记为已读';
      document.getElementById('announcement').textContent = `${progress.size} 篇已读。这只记录阅读进度，不改变实验状态。`;
    } else if (button.dataset.filter) {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(el => {
        const active = el === button;
        el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
      });
      compareRows();
    } else if (button.id === 'download-template') {
      const text = `# AI 工具实验记录\n\n日期：\n工具、版本与 commit：\n系统与硬件：\n模型和服务配置（不包含密钥）：\n样本与预期结果：\n实际操作或命令：\n首次准备耗时：\n后续运行耗时：\n输出文件：\n调用量与实际费用（未知时注明）：\n成功样例：\n失败样例：\n人工修正时间：\n本次结论：\n仍不能判断的事项：\n`;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'ai-tool-experiment.md'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById('announcement').textContent = '已准备下载实验记录模板。';
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'tool-search') { query = event.target.value; compareRows(); }
  });
  window.addEventListener('hashchange', () => route(true));
  route();
})();
