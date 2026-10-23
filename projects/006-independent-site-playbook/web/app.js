(() => {
  'use strict';
  const data = window.PLAYBOOK_CONTENT;
  if (!data) {
    const error = document.createElement('div');
    error.className = 'callout amber-callout';
    error.textContent = '研究数据暂未加载，请刷新页面，或确认 content.js 与网页在同一目录。';
    document.querySelector('#main').prepend(error);
    return;
  }
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = (value) => /^https:\/\//.test(String(value)) ? escape(value) : '#sources';
  const external = (url, title) => `<a href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a>`;
  const money = (value) => Number(value).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
  const field = (name, value) => `<div><dt>${name}</dt><dd>${escape(value)}</dd></div>`;

  $('#decisions').innerHTML = data.decisions.map(item => `<article class="decision-card"><span class="pill ${item.status==='已明确'?'green':'amber'}">${escape(item.status)}</span><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></article>`).join('');
  $('#glossary-list').innerHTML = data.glossary.map(item => `<div><dt>${escape(item.term)}</dt><dd>${escape(item.definition)}<small>${escape(item.example)}</small></dd></div>`).join('');

  let directionIndex = 0;
  const directionTabs = $('#direction-tabs');
  directionTabs.innerHTML = data.directions.map((item,index) => `<button id="direction-tab-${index}" role="tab" aria-controls="direction-detail" aria-selected="${index===0}" tabindex="${index===0?'0':'-1'}" data-direction="${index}">${escape(item.title)}</button>`).join('');
  function showDirection(index, focus = false) {
    directionIndex = index;
    const item = data.directions[index];
    $$('#direction-tabs button').forEach((button, i) => {button.setAttribute('aria-selected', String(i===index));button.tabIndex = i===index?0:-1;});
    const panel = $('#direction-detail');
    panel.setAttribute('aria-labelledby', `direction-tab-${index}`);
    panel.innerHTML = `<article class="direction-panel"><div class="direction-top"><div><h3>${escape(item.title)}</h3><p>${escape(item.task)}</p></div><span class="pill ${index===0?'green':'amber'}">${escape(item.status)}</span></div><dl class="direction-fields">${field('目标用户',item.audience)}${field('网页呈现',item.format)}${field('第一批用户入口',item.channel)}${field('长期复用的可能价值',item.repeatValue)}${field('当前证据',item.proof)}${field('尚待确认',item.unknown)}${field('最小验证动作',item.experiment)}</dl></article>`;
    if (focus) $(`#direction-tab-${index}`).focus();
  }
  showDirection(0);
  $('#print-directions').innerHTML=data.directions.map(item=>`<article class="direction-panel"><h3>${escape(item.title)}</h3><p>${escape(item.task)}</p><p>${escape(item.status)}</p><dl class="direction-fields">${field('目标用户',item.audience)}${field('网页呈现',item.format)}${field('第一批用户入口',item.channel)}${field('长期复用价值',item.repeatValue)}${field('当前证据',item.proof)}${field('尚待确认',item.unknown)}${field('最小验证动作',item.experiment)}</dl></article>`).join('');
  directionTabs.addEventListener('click', event => {const button=event.target.closest('[data-direction]');if(button)showDirection(Number(button.dataset.direction));});
  directionTabs.addEventListener('keydown', event => {let index=directionIndex;if(event.key==='ArrowRight')index=(index+1)%data.directions.length;else if(event.key==='ArrowLeft')index=(index-1+data.directions.length)%data.directions.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=data.directions.length-1;else return;event.preventDefault();showDirection(index,true);});

  function showExample(after, focus=false) {
    ['before','after'].forEach(name => {const active=after?(name==='after'):(name==='before');$(`#example-${name}`).hidden=!active;$(`#example-${name}-tab`).setAttribute('aria-selected',String(active));$(`#example-${name}-tab`).tabIndex=active?0:-1;});
    if(focus)$(after?'#example-after-tab':'#example-before-tab').focus();
  }
  $('#example-before-tab').addEventListener('click',()=>showExample(false));
  $('#example-after-tab').addEventListener('click',()=>showExample(true));
  [$('#example-before-tab'),$('#example-after-tab')].forEach(button=>button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();showExample(event.key==='End'?true:event.key==='Home'?false:button.id==='example-before-tab',true);}}));

  $('#gap-list').innerHTML = data.gaps.map(item=>`<article class="gap-card"><div class="gap-heading"><h4>${escape(item.title)}</h4><span class="pill amber">${escape(item.priority)}</span></div><p>${escape(item.value)}</p><div class="gap-fields"><p><strong>输入</strong>${escape(item.input)}</p><p><strong>输出</strong>${escape(item.output)}</p><p><strong>已有线索</strong>${escape(item.evidence)}</p><p><strong>待验证</strong>${escape(item.uncertainty)}</p></div></article>`).join('');
  $('#evidence-list').innerHTML = data.evidence.map(item=>`<article class="evidence-card"><span class="pill muted">${escape(item.kind)}</span><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p><p class="limitation">证据边界：${escape(item.limitation)}</p>${external(item.url,'阅读原始来源')}</article>`).join('');
  $('#competitor-rows').innerHTML = data.competitors.map(item=>`<tr><td><strong>${external(item.url,item.name)}</strong><small>${escape(item.position)}</small></td><td>${escape(item.features)}</td><td>${escape(item.price)}</td><td>${escape(item.implication)}</td></tr>`).join('');
  $('#prospect-list').innerHTML = data.prospects.map(item=>`<article class="prospect"><div class="prospect-name">${external(item.url,item.name)}<span class="pill amber">${escape(item.status)}</span></div><p><span>为什么匹配</span>${escape(item.fit)}</p><p><span>第一轮沟通</span>${escape(item.action)}</p></article>`).join('');
  $('#workflow-list').innerHTML = data.workflow.map((item,index)=>`<details class="workflow-step" ${index===0?'open':''}><summary><span>${String(index+1).padStart(2,'0')}</span><strong>${escape(item.title.replace(/^\d+\s+/,''))}</strong><small aria-hidden="true">＋</small></summary><div class="workflow-detail"><div><span>具体动作</span><p>${escape(item.action)}</p></div><div><span>阶段交付</span><p>${escape(item.deliverable)}</p></div><div><span>怎样算完成</span><p>${escape(item.pass)}</p></div><div><span>需要观察</span><p>${escape(item.risk)}</p></div></div></details>`).join('');
  $('#faq-list').innerHTML = data.faq.map(item=>`<details><summary>${escape(item.question)}<span aria-hidden="true">＋</span></summary><p>${escape(item.answer)}</p></details>`).join('');

  function sourceGroup(source){const type=String(source.type);if(/社区|用户讨论|从业|候选对象|潜在渠道|community|practitioner/i.test(type))return'community';if(/官方|竞品官网|获客研究入口|official/i.test(type))return'official';return'other';}
  $('#source-list').innerHTML=data.sources.map(item=>`<li data-source-group="${sourceGroup(item)}"><div>${external(item.url,item.title)}<p>${escape(item.note)}</p></div><span class="pill muted">${escape(item.type)}</span></li>`).join('');
  function filterSources(){let count=0;$$('#source-list li').forEach(item=>{item.hidden=$('#source-filter').value!=='all'&&item.dataset.sourceGroup!==$('#source-filter').value;if(!item.hidden)count++;});$('#source-count').textContent=`${count} / ${data.sources.length} 条`;}
  $('#source-filter').addEventListener('change',filterSources);filterSources();

  const checkLabels=['找到具体目标用户与一个近期真实任务','记录现有做法、耗时与替代工具','做出一份输入到输出的交付样例','发布可访问的网站并完成端到端自测','邀请匹配用户带真实项目试用','完成交付并记录修正与总耗时','对第二次使用提出明确收费','复盘复用、付款和获客成本，决定继续或调整'];
  const storageKey='independent-site-playbook-006-checklist-v1';
  let checks=Array(checkLabels.length).fill(false);
  let canStore=true;
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(saved)&&saved.length===checks.length)checks=saved.map(value=>value===true);}catch{canStore=false;}
  function updateChecks(){const count=checks.filter(Boolean).length;$('#checklist-progress').textContent=`${count} / ${checks.length}`;$('#checklist').innerHTML=checkLabels.map((label,index)=>`<label class="check-item"><input type="checkbox" data-check="${index}" ${checks[index]?'checked':''}><span>${escape(label)}</span></label>`).join('');if(!canStore)$('#storage-status').textContent='浏览器暂不允许本地存储；本次勾选仍可使用，刷新后可能丢失。';}
  function saveChecks(){try{localStorage.setItem(storageKey,JSON.stringify(checks));}catch{canStore=false;}$('#checklist-progress').textContent=`${checks.filter(Boolean).length} / ${checks.length}`;if(!canStore)$('#storage-status').textContent='本地保存不可用，请导出执行记录留存。';}
  updateChecks();
  $('#checklist').addEventListener('change',event=>{if(event.target.matches('[data-check]')){checks[Number(event.target.dataset.check)]=event.target.checked;saveChecks();}});
  $('#reset-checklist').addEventListener('click',()=>{checks=checks.map(()=>false);saveChecks();updateChecks();$('#storage-status').textContent=canStore?'已清空本浏览器中的执行勾选。':'已清空本次勾选，本地保存不可用。';});

  let currentBudget;
  function boundedNumber(selector){const input=$(selector);const number=Number(input.value);return Number.isFinite(number)?Math.min(10000,Math.max(0,number)):0;}
  function updateBudget(){
    const route=$('#hosting').value;
    const months=Number($('#months').value);
    const base=route==='vps'?12:route==='workers'?5:0;
    const backup=route==='vps'&&$('#include-backup').checked?2.4:0;
    const domain=$('#include-domain').checked?11.08:0;
    const ai=boundedNumber('#ai-budget');
    const extra=boundedNumber('#storage-budget');
    const total=domain+months*(base+backup+ai+extra);
    $('#include-backup').disabled=route!=='vps';$('#backup-label').classList.toggle('disabled',route!=='vps');
    $('#months-label').value=`${months} 个月`;$('#months-label').textContent=`${months} 个月`;
    $('#budget-total').textContent=money(total);
    const lines=[['域名首年，一次计入',domain],['部署费用',base*months],...(route==='vps'?[['周备份',backup*months]]:[]),['AI API 计划预算',ai*months],['其他计划预算',extra*months]];
    $('#budget-breakdown').innerHTML=lines.map(([label,value])=>`<div class="budget-breakdown-line"><span>${label}</span><strong>$${money(value)}</strong></div>`).join('');
    $('#budget-assumption').textContent=route==='free'?'假设网站工作负载在免费方案限制内。复杂处理可能需要升级；额外预算按你的输入计入。':'假设资源用量在套餐包含额度内，超额、税费和收款手续费另计。AI 与额外存储按你的计划计入。';
    currentBudget={route,months,domain,hosting:base*months,backup:backup*months,ai:ai*months,extra:extra*months,total};
  }
  $('#budget-form').addEventListener('input',updateBudget);$('#budget-form').addEventListener('change',updateBudget);$('#budget-form').addEventListener('submit',event=>event.preventDefault());updateBudget();

  $('#copy-outreach').addEventListener('click',async()=>{try{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText($('#outreach').value);$('#copy-status').textContent='已复制。发送前请按对方实际流程修改。';}catch{$('#outreach').focus();$('#outreach').select();$('#copy-status').textContent='已选中文案，请使用 Ctrl+C 或系统复制。';}});
  $('#export-plan').addEventListener('click',()=>{const b=currentBudget;const date=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date());const markdown=`# 独立站第一轮执行记录\n\n导出时间：${date}（Asia/Shanghai）\n研究参考日：2026-10-23，价格需重新核对。\n\n## 核心判断\n\n部署已有可行路线；项目价值需由真实任务、再次使用和付费验证。\n个人勾选不代表研究已完成，不构成采购。\n\n## 我的执行清单\n\n${checkLabels.map((text,i)=>`- [${checks[i]?'x':' '}] ${text}`).join('\n')}\n\n## 当前预算（美元）\n\n- 路线：${b.route}\n- 周期：${b.months}个月\n- 域名：$${money(b.domain)}\n- 部署：$${money(b.hosting)}\n- 备份：$${money(b.backup)}\n- AI计划预算：$${money(b.ai)}\n- 其他计划预算：$${money(b.extra)}\n- 合计：$${money(b.total)}\n\n未计税费、超额用量、交易手续费、开发和推广时间。\n\n## 下一次复盘\n\n- 谁提供了真实任务？\n- 输出节省了什么工作？\n- 修正和人工介入用了多久？\n- 用户是否再次使用、愿意付款？\n- 下一批同类用户从哪里来？\n`;const blob=new Blob([markdown],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='独立站第一轮执行记录.md';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#storage-status').textContent='已生成执行记录下载。';});

  const menuButton=$('#menu-button');
  function setMenu(open){$('#sidebar').classList.toggle('open',open);menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'关闭章节目录':'打开章节目录');$('#scrim').hidden=!open;if(open)$('#sidebar .brand').focus();}
  menuButton.addEventListener('click',()=>setMenu(menuButton.getAttribute('aria-expanded')!=='true'));$('#scrim').addEventListener('click',()=>setMenu(false));
  $$('#sidebar a').forEach(link=>link.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(menuButton.getAttribute('aria-expanded')==='true'){setMenu(false);menuButton.focus();}else if(document.activeElement===$('#search')){$('#search').value='';filterChapters();$('#search').blur();}}if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){event.preventDefault();$('#search').focus();}});
  const chapters=$$('.chapter');
  function filterChapters(){const query=$('#search').value.trim().toLocaleLowerCase('zh-CN');if(query){const match=data.directions.findIndex(item=>Object.values(item).some(value=>String(value).toLocaleLowerCase('zh-CN').includes(query)));if(match>=0)showDirection(match);}let count=0;chapters.forEach(chapter=>{const text=chapter.textContent+(chapter.id==='directions'?JSON.stringify(data.directions):'');const matches=!query||text.toLocaleLowerCase('zh-CN').includes(query);chapter.hidden=!matches;if(matches)count++;const link=$(`#toc a[href="#${chapter.id}"]`);if(link)link.hidden=!matches;});$('#search-status').hidden=!query;$('#search-status').textContent=count?`“${$('#search').value.trim()}” 匹配 ${count} 个章节。清空搜索可恢复完整手册。`:`没有找到“${$('#search').value.trim()}”。可以尝试“需求”“域名”“用户”或“部署”。`;}
  $('#search').addEventListener('input',filterChapters);
  const observer=new IntersectionObserver(entries=>{const active=entries.filter(entry=>entry.isIntersecting&&!entry.target.hidden).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(active)$$('#toc .nav-link').forEach(link=>link.classList.toggle('active',link.hash===`#${active.target.id}`));},{rootMargin:'-12% 0px -65% 0px',threshold:0});chapters.forEach(chapter=>observer.observe(chapter));
  let scrollFrame=0;
  function updateReading(){const height=document.documentElement.scrollHeight-innerHeight;$('#reading-progress').style.width=`${height>0?Math.min(100,Math.max(0,scrollY/height*100)):0}%`;scrollFrame=0;}
  addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateReading);},{passive:true});addEventListener('resize',()=>{if(innerWidth>900)setMenu(false);updateReading();});updateReading();
  let printStates=[];
  addEventListener('beforeprint',()=>{printStates=$$('details').map(item=>[item,item.open]);printStates.forEach(([item])=>item.open=true);});addEventListener('afterprint',()=>printStates.forEach(([item,state])=>item.open=state));$('#print-button').addEventListener('click',()=>window.print());
})();
