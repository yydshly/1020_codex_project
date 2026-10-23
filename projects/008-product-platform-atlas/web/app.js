/* Buildless local application. All content is maintained in data.js. */
(() => {
  'use strict';
  const { platforms, sources, routes } = window.ATLAS;
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getPlatform = (id) => platforms.find((p) => p.id === id);
  const mark = (p) => `<span class="monogram" style="--pcolor:${escape(p.color)}">${escape(p.mark)}</span>`;
  let family = 'all';
  let selected = 'ph';
  let compared = new Set(platforms.map((p) => p.id));

  function renderPlatforms() {
    const visible = platforms.filter((p) => family === 'all' || p.family === family);
    if (!visible.some((p) => p.id === selected)) selected = visible[0].id;
    document.querySelectorAll('[data-family]').forEach((button) => {
      const active = button.dataset.family === family;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#platform-grid').innerHTML = visible.map((p) => `<button type="button" class="platform-card ${p.id === selected ? 'selected' : ''}" data-platform="${p.id}" aria-pressed="${p.id === selected}" aria-controls="platform-detail"><span class="card-top">${mark(p)}<span><strong>${escape(p.name)}</strong><small>${escape(p.familyName)}</small></span><span aria-hidden="true">↗</span></span><h3>${escape(p.question)}</h3><p>${escape(p.tagline)}</p><span class="card-bottom"><span>${escape(p.object)}</span><span>${p.id === selected ? '正在查看' : '查看档案'} →</span></span></button>`).join('');
    renderDetail();
  }

  function renderDetail() {
    const p = getPlatform(selected);
    $('#platform-detail').innerHTML = `<div class="detail-intro"><p class="eyebrow">PLATFORM PROFILE / ${escape(p.familyName)}</p><h3>${escape(p.name)}</h3><p>${escape(p.insight)}</p><a href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">访问官方网站 ↗</a></div><div class="detail-body"><h4>核心能力</h4><ul>${p.features.map((f) => `<li>${escape(f)}</li>`).join('')}</ul><p class="detail-boundary"><b>理解边界</b> ${escape(p.limit)}</p><div class="detail-sources">资料依据 ${p.sources.map((id) => `<a href="#source-${id}">${escape(sources.find((s) => s.id === id).title.split(' · ')[1])} ↗</a>`).join(' ')}</div></div>`;
  }
  $('#family-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-family]');
    if (!button) return;
    family = button.dataset.family;
    renderPlatforms();
  });
  $('#platform-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-platform]');
    if (!button) return;
    selected = button.dataset.platform;
    document.querySelectorAll('[data-platform]').forEach((card) => {
      const active = card.dataset.platform === selected;
      card.classList.toggle('selected', active);
      card.setAttribute('aria-pressed', String(active));
      card.querySelector('.card-bottom span:last-child').textContent = active ? '正在查看 →' : '查看档案 →';
    });
    renderDetail();
  });

  const fields = [
    ['object', '内容中心'], ['audience', '主要人群'], ['entry', '发现入口'],
    ['interaction', '互动方式'], ['lifecycle', '产品阶段与时间'],
    ['participation', '参与方式'], ['cost', '发布与收费'], ['language', '语言与中文适配'],
    ['value', '主要价值'], ['limit', '理解边界']
  ];
  $('#compare-select').innerHTML = platforms.map((p) => `<label class="compare-option"><input type="checkbox" value="${p.id}" checked><span>${escape(p.name)}</span></label>`).join('');
  function renderComparison(message = '') {
    const items = platforms.filter((p) => compared.has(p.id));
    $('#comparison-table').innerHTML = `<caption class="sr-only">产品发现平台的十个维度对比</caption><thead><tr><th scope="col">对比维度</th>${items.map((p) => `<th scope="col">${mark(p)}<strong>${escape(p.name)}</strong></th>`).join('')}</tr></thead><tbody>${fields.map(([key, label]) => `<tr><th scope="row">${label}</th>${items.map((p) => `<td>${escape(p[key])}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#compare-status').textContent = message || `已选择 ${items.length} 个平台 · 10 个对比维度`;
  }
  $('#compare-select').addEventListener('change', (event) => {
    const input = event.target;
    if (!input.matches('input')) return;
    if (!input.checked && compared.size === 2) {
      input.checked = true;
      $('#compare-status').textContent = '至少保留 2 个平台进行对比。';
      return;
    }
    if (input.checked) compared.add(input.value); else compared.delete(input.value);
    renderComparison();
  });
  $('#compare-reset').addEventListener('click', () => {
    compared = new Set(platforms.map((p) => p.id));
    document.querySelectorAll('#compare-select input').forEach((input) => { input.checked = true; });
    renderComparison('已恢复全部 6 个平台 · 10 个对比维度');
  });

  function renderRoute(id) {
    const route = routes.find((r) => r.id === id);
    document.querySelectorAll('[data-route]').forEach((button) => {
      const active = button.dataset.route === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#route-result').innerHTML = `<p class="eyebrow">A PRACTICAL START</p><h3>${escape(route.title)}</h3><p>${escape(route.description)}</p><div class="route-platforms">${route.platforms.map((pid) => { const p = getPlatform(pid); return `<a href="#platforms" data-platform-link="${pid}">${mark(p)} ${escape(p.name)} ↗</a>`; }).join('')}</div><div class="route-action">${escape(route.action)}</div><p class="route-limit">${escape(route.boundary)}</p>`;
  }
  $('#route-options').innerHTML = routes.map((r, i) => `<button type="button" data-route="${r.id}" aria-pressed="false" aria-controls="route-result"><span>0${i + 1}</span>${escape(r.label)}<span>↗</span></button>`).join('');
  $('#route-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (button) renderRoute(button.dataset.route);
  });
  $('#examples').innerHTML = platforms.map((p) => `<div class="example-row"><b>${escape(p.name)}</b><p>${escape(p.example)}</p></div>`).join('');

  function renderSources() {
    const query = $('#source-search').value.trim().toLocaleLowerCase();
    const filtered = sources.filter((s) => `${s.title} ${s.supports} ${getPlatform(s.platform).name}`.toLocaleLowerCase().includes(query));
    $('#source-count').textContent = `${filtered.length} / ${sources.length}`;
    $('#source-list').innerHTML = filtered.length ? filtered.map((s) => `<article class="source-row" id="source-${s.id}"><span>${String(sources.indexOf(s) + 1).padStart(2, '0')}</span><div><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a><p>${escape(s.supports)}</p><small>${escape(new URL(s.url).hostname)} · 官方资料</small></div></article>`).join('') : '<p class="empty-results">没有匹配的来源。试试平台名称、发布或语言。</p>';
  }
  $('#source-search').addEventListener('input', renderSources);
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    if (link.dataset.familyLink) { family = link.dataset.familyLink; renderPlatforms(); }
    if (link.dataset.platformLink) { family = 'all'; selected = link.dataset.platformLink; renderPlatforms(); }
    if (link.getAttribute('href')?.startsWith('#source-') && $('#source-search').value) {
      $('#source-search').value = '';
      renderSources();
    }
  });
  $('#print-page').addEventListener('click', () => window.print());
  renderPlatforms();
  renderComparison();
  renderRoute('discover');
  renderSources();

  const navLinks = [...document.querySelectorAll('.side-nav a')];
  const sections = navLinks.map((a) => $(a.getAttribute('href')));
  let pending = false;
  function updateNav() {
    let current = sections[0];
    for (const section of sections) if (section.getBoundingClientRect().top <= 160) current = section;
    navLinks.forEach((a) => {
      const active = a.hash === `#${current.id}`;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    pending = false;
  }
  window.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(updateNav); } }, { passive: true });
  updateNav();
  if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
})();
