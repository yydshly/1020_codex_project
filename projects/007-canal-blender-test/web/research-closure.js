'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const localUrl = path => typeof path === 'string' && !path.startsWith('/') && !path.includes('..') && !/^[a-z]+:/i.test(path);
  const link = (title, url) => { const a = el('a', title); if (localUrl(url)) a.href = url; return a; };
  const basename = path => path.split('/').pop();
  const lightbox = $('image-lightbox');
  const closeImage = () => { lightbox.close(); $('lightbox-image').removeAttribute('src'); };
  document.addEventListener('click', event => {
    const a = event.target.closest('a[data-image]');
    if (!a || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const img = a.querySelector('img');
    $('lightbox-image').src = a.href;
    $('lightbox-image').alt = img?.alt || a.dataset.caption || '原始图像';
    $('lightbox-caption').textContent = a.dataset.caption || img?.alt || '';
    lightbox.showModal();
  });
  $('close-image').addEventListener('click', closeImage);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeImage(); });
  lightbox.addEventListener('close', () => $('lightbox-image').removeAttribute('src'));

  const family = id => /^SPACE/.test(id) ? 'space' : /^(cat|cat-A)/.test(id) ? 'cat' : /^(shop|roam)/.test(id) ? 'roam' : /^(extension|boundary|landscape)/.test(id) ? 'extension' : 'render';
  const families = { space: '街区主线', cat: '猫 / 资产支线', roam: '漫游与店面', extension: '补景与边界', render: '参考与渲染' };
  let catalog = [], evidenceByPath = new Map();
  const evidenceReady = fetch('research-data/evidence-catalog.json').then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json();
  }).then(data => {
    catalog = data.entries;
    evidenceByPath = new Map(catalog.map(e => [e.source_path, e]));
    const renderEvidence = () => {
      const query = $('evidence-search').value.toLowerCase().trim();
      const selected = catalog.filter(e => `${e.source_path} ${e.stage} ${e.description}`.toLowerCase().includes(query));
      const nodes = selected.map(entry => {
        const row = el('div', undefined, 'evidence-row');
        row.append(link(entry.source_path, entry.public_url), el('small', `${entry.stage} · ${entry.description}${entry.content_changed ? ' · 公开副本已净化 / 摘录' : ' · 内容未改'}`));
        return row;
      });
      $('evidence-list').replaceChildren(...nodes);
      $('evidence-count').textContent = `${selected.length} / ${catalog.length} 份资料`;
    };
    $('evidence-search').addEventListener('input', renderEvidence); renderEvidence();
  }).catch(error => {
    $('evidence-count').textContent = '证据目录暂未载入';
    $('evidence-list').append(el('p', `请从本地预览服务打开；也可直接查看目录 JSON。${error.message}`, 'error-box'));
  });

  Promise.all([fetch('research-data/closure-index.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), evidenceReady]).then(([data]) => {
    const mediaMap = new Map(data.media.map(m => [m.path, m]));
    const publicMediaUrl = path => data.packaged_urls[path] || mediaMap.get(path)?.web_relative_url;
    const makeCard = version => {
      const card = el('article', undefined, 'version-card'); card.id = `version-${version.id}`;
      const head = el('div', undefined, 'version-head'); head.append(el('span', version.id, 'eyebrow'), el('span', families[family(version.id)], 'tag')); card.append(head, el('h3', version.title_zh));
      if (version.note_zh) card.append(el('p', version.note_zh));
      if (version.showcase.length) {
        const gallery = el('div', undefined, 'version-gallery');
        version.showcase.forEach(item => {
          const figure = el('figure');
          if (/\.(webm|mp4)$/i.test(item.url)) {
            const video = el('video'); video.controls = true; video.preload = 'none'; video.src = item.url; video.setAttribute('aria-label', `${version.title_zh} · 实际录屏`); figure.append(video);
          } else {
            const a = link('', item.url); a.dataset.image = ''; a.dataset.caption = `${version.title_zh} · ${item.kind_zh}。${item.note_zh || version.note_zh || ''} 原件：${item.source}`;
            const image = el('img'); image.src = item.url; image.loading = 'lazy'; image.alt = `${version.title_zh} · ${item.kind_zh} · ${basename(item.source)}`; a.append(image); figure.append(a);
          }
          figure.append(el('figcaption', `${item.kind_zh || '归档材料'} · ${basename(item.source)}`)); gallery.append(figure);
        }); card.append(gallery);
      } else { card.append(el('p', '没有独立归档的最终静帧，使用原页面动态观察；不以其他版图片冒充。', 'caption-note')); }
      const links = el('div', undefined, 'version-links');
      version.page_urls.forEach(url => links.append(link(`打开 ${url.replace('.html', '')} ↗`, url)));
      version.model_urls.forEach(url => links.append(link(`GLB · ${basename(url)}`, url)));
      card.append(links);
      if (version.blend_paths.length) card.append(el('p', `可编辑本地工程：${version.blend_paths.join(' / ')}（本地保留，未复制到网页）`, 'local-files'));
      const detail = el('details'), summary = el('summary', `图像 ${version.gallery_paths.length} · 证据 ${version.evidence_paths.length} · 查看原文件索引`), list = el('ul');
      for (const path of version.evidence_paths) {
        const li = el('li'), evidence = evidenceByPath.get(path);
        if (evidence) li.append(link(`证据 · ${path}`, evidence.public_url));
        else li.append(el('span', `本地证据 · ${path}`)); list.append(li);
      }
      for (const path of version.gallery_paths) {
        const li = el('li'), url = publicMediaUrl(path), m = mediaMap.get(path);
        if (url && localUrl(url)) {
          const a = link(`${m?.kind_zh || '材料'} · ${path}`, url);
          if (/\.(png|jpe?g|svg)$/i.test(url)) { a.dataset.image = ''; a.dataset.caption = `${version.title_zh} · ${m?.kind_zh || ''} · ${path}`; }
          li.append(a);
        } else li.append(el('span', `本地原件保留 · ${path}`));
        list.append(li);
      }
      detail.append(summary, list); card.append(detail); return card;
    };
    const cards = data.versions.map(v => ({ version: v, node: makeCard(v) }));
    const renderArchive = () => {
      const group = $('archive-filter').value, query = $('archive-search').value.toLowerCase().trim();
      const selected = cards.filter(({ version }) => (group === 'all' || family(version.id) === group) && `${version.id} ${version.title_zh} ${version.note_zh || ''} ${version.page_paths.join(' ')} ${version.gallery_paths.join(' ')}`.toLowerCase().includes(query));
      $('archive-list').replaceChildren(...selected.map(item => item.node));
      if (!selected.length) $('archive-list').append(el('p', '没有匹配条目，请换一个版本名或清除筛选。', 'empty'));
      $('archive-count').textContent = `${selected.length} / ${cards.length} 个归档条目`;
    };
    $('archive-filter').addEventListener('change', renderArchive); $('archive-search').addEventListener('input', renderArchive); renderArchive();
    $('page-links').replaceChildren(...data.pages.map(page => link(`${page.title_zh} · ${basename(page.path)}`, page.path === 'web/index.html' ? 'research-v4-original.html' : page.path.replace(/^web\//, ''))));
    $('model-links').replaceChildren(...data.models.map(model => link(`${basename(model.path)} · ${(model.bytes / 1024 / 1024).toFixed(2)} MiB · ${model.version_ids.join(' / ')}`, model.path.replace(/^web\//, ''))));
    $('archive-caveats').replaceChildren(...data.gaps_and_caveats.map(gap => el('p', gap.detail_zh, 'small')));
  }).catch(error => {
    $('archive-count').textContent = '档案目录暂未载入'; $('archive-list').append(el('p', `请通过本地 HTTP 服务打开本页，或直接下载完整索引。${error.message}`, 'error-box'));
  });

  fetch('research-data/process-audit.json').then(r => r.json()).then(data => {
    const target = $('process-timeline'); if (!target) return;
    if (data.publishing_update) target.append(el('p', '以下保留上次收束的38个审计节点与当时用语。本轮已找齐三张生成入口，确认只以最终最简单预算版实际建模，并按用户授权发布；恢复说明与当前结论见上方三档参考及图生3D总结。', 'callout'));
    for (const item of data.timeline) {
      const article = el('article', undefined, 'panel');
      article.append(el('span', String(item.order).padStart(2, '0'), 'eyebrow'), el('h3', item.title), el('p', `目标：${item.goal}`), el('p', `结果：${item.result}`), el('p', `边界：${item.limits}`, 'warning-text'));
      const details = el('details'); details.append(el('summary', '原证据路径')); const list = el('ul');
      item.evidence.forEach(path => { const li = el('li'); li.append(el('code', path)); list.append(li); }); details.append(list); article.append(details); target.append(article);
    }
  }).catch(() => { if ($('process-timeline')) $('process-timeline').append(el('p', '可直接下载下方过程审计 JSON 查看完整节点。')); });
})();
