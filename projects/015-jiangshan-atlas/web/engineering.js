// SPDX-License-Identifier: GPL-3.0-only
import {createExplorer} from './lab/temporal-core.mjs';
import {datasets} from './lab/datasets.mjs';
const $=id=>document.getElementById(id);
const source='https://github.com/DeanChensj/jiangshan-map/blob/53059f1c7fed305807b19365857a5f135daf3ac6/';
const patterns=[
  {title:'用时间选择阶段，阶段引用快照',fn:'_resolvePhase / _resolveSnapKey',line:1537,mechanism:'年份先确定时期，再用 year < until 选择预设快照。城池另外用 appear / vanish 控制有效期。程序没有实时推算历史疆域。',transfer:'把日期换成版本号、项目天数或设备运行时长。抽象“时间 → 阶段”，由业务数据定义每个阶段的内容。',boundary:'公元无 0 年、朝代划分都是历史领域规则，不能硬编码到通用核心。先明确区间边界与顺序。',check:'验证阶段前一刻、边界、后一刻；任一有效时间只落在一个阶段。'},
  {title:'多种操作，共用状态变更入口',fn:'selectPersonEvent / jumpToYear',line:3388,mechanism:'选中人物事件后，控制器修改事件索引、年份、地图、卡片与相机。多入口走相同更新流程。',transfer:'提炼“动作 → 状态 → 派生数据 → 视图”。巡检、教学、复盘都可让列表与图示响应同一选择。',boundary:'源库是单体类，状态还在实例、DOM、定时器中。纯状态核心与订阅系统是本次提炼，并非原库现成架构。',check:'节点和列表选同一事件，结果一致；新增视图不复制业务选择逻辑。'},
  {title:'坐标统一，图层各负其责',fn:'MercatorProjector / camera-rig',line:36,mechanism:'经纬度统一投影到画布；底图、政权、河流、城市、路线分层绘制，共用相机。源库山体观感来自晕渲底图，主体是 SVG。',transfer:'工厂、校园、流程图或知识网络都先约定坐标，再叠加对象、状态和交互层。这个实验使用 0–1 流程坐标。',boundary:'墨卡托投影只适合相应地理任务；地形图片、图层顺序与透明度不能直接适用于所有主题。',check:'缩放后标记仍与对象对齐；关掉路线不应改变当前选择和详情。'},
  {title:'先解析实体，再查询与呈现',fn:'resolvePlace / inspect / locate',line:9143,mechanism:'名称、别名与年份先解析成地点。inspect 返回结构化信息，locate 执行定位，提供可利用的查询与交互边界。',transfer:'将“设备编号、客户名称、课程概念”解析成稳定 ID；搜索与 AI 工具可以调用相同查询接口。',boundary:'古地名同名处理、后缀与繁简转换属于领域解析器。模糊匹配必须能说明歧义与失败。',check:'别名落到同一实体；未知名称明确失败；只读查询不改变界面选择。'},
  {title:'异步完成时，确认结果仍然有效',fn:'_renderDynasty 请求结果检查',line:1580,mechanism:'快照加载后再次核对当前时期和快照键。若用户已经切换，过时结果直接丢弃，避免旧地图覆盖新选择。',transfer:'搜索建议、客户详情和设备记录都可以用请求序号或选择键，保护最后一次有效选择。',boundary:'原库检查的是朝代对象和快照键，并没有通用取消框架。迁移时需稳定 ID、错误态和合适的取消策略。',check:'让 A 请求故意变慢、B 变快，连续点 A→B，最终始终显示 B。'},
  {title:'按需要加载，按重要性展示',fn:'_ensureFullSnapshots / _fetchSnapshot',line:440,mechanism:'首屏数据与完整快照分开；加载 Promise 和快照会缓存，坐标延迟解码；标注密度随视图变化。',transfer:'大目录、密集设备点位和知识网络可分别使用按需加载、缓存与渐进细节。先测量瓶颈，再增加复杂度。',boundary:'小数据不必上 VLQ 压缩。源码 _loadScriptOnce 的加载错误也 resolve，缺失快照可能成空图层；迁移时要改善失败反馈。',check:'重复资料不重复加载；失败与空数据可区分；缩小后仍能看到重要对象。'},
  {title:'URL 是可重放的任务输入',fn:'_restoreFromQuery / atlasAPI',line:10228,mechanism:'year、place、person、stop 描述启动意图；必要数据就绪后再定位或选择人物事件。',transfer:'分享一次分析、一段课程、一个设备故障时点；页面点击和链接恢复最终使用同一组状态规则。',boundary:'原库支持深链接，不意味着所有操作状态都实时保存。需要自行决定序列化范围；播放中、悬停等可保持临时。',check:'刷新保留关键选择；非法参数明确回退；不把临时播放状态自动恢复。'},
  {title:'数据只维护一份，玩法从中派生',fn:'_collectPersonEvents / _buildChallengeDeck',line:3156,mechanism:'地点与事件用于地图探索、沿革与人物纪事，也用于挑战出题；答题再用同一坐标计算距离反馈。',transfer:'同一课程数据支持阅读与练习，同一设备事件支持监控、回放与培训。设计实体、事件、有效期和证据字段。',boundary:'不同玩法需要资格、难度与去重规则。原库不是每条记录都有统一证据字段；新增来源 schema 应注明是改进。',check:'修改实体后浏览、搜索和练习一致；新增玩法不复制第二份业务资料。'}
];
for(const [i,p] of patterns.entries()) {
  const card=document.createElement('article');card.className='pattern';
  card.innerHTML=`<span class="num">PATTERN ${String(i+1).padStart(2,'0')}</span><h3>${p.title}</h3><dl><dt>源码实际做法</dt><dd>${p.mechanism}</dd><dt>如何举一反三</dt><dd>${p.transfer}</dd></dl><p class="source">源码证据：<a href="${source}js/app.js#L${p.line}" target="_blank" rel="noopener"><code>${p.fn}</code> ↗</a></p><details><summary>适用边界与掌握标准</summary><p>${p.boundary}</p><p><strong>验收：</strong>${p.check}</p></details>`;
  $('pattern-list').append(card);
}
let explorer, dataset, unsubscribe, ticker;
const svgNS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs={},text) {const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;}
function act(action){try{explorer.dispatch(action);}catch(error){$('lab-feedback').textContent=error.message;}}
function render(view) {
  const state=view.state,selected=view.selectedEvent,phase=view.phase;
  $('lab-time').min=dataset.min;$('lab-time').max=dataset.max;$('lab-time').value=state.time;
  $('lab-time-value').textContent=`第 ${state.time} ${dataset.unit}`;
  $('lab-phase').textContent=`${phase.label} · [${phase.from}, ${phase.to})`;
  $('lab-title').textContent=selected?.title||'观察这个时刻';
  $('lab-detail').textContent=selected?.detail||'当前时间没有选中的事件。阶段与已发生事件由时间推导；选择一个节点或事件可联动定位。';
  $('lab-entity').textContent=view.activeEntity?.label||'未选中';
  $('lab-visited').textContent=`${view.visitedEvents.length} / ${view.events.length}`;
  $('lab-route').checked=state.visibleLayers.route;$('lab-labels').checked=state.visibleLayers.labels;
  $('lab-play').setAttribute('aria-pressed',state.playing);$('lab-play').textContent=state.playing?'暂停推进':'自动推进';
  const idx=view.events.findIndex(e=>e.id===state.selectedEventId);
  $('lab-prev').disabled=idx===0||(!selected&&state.time<view.events[0].time);
  $('lab-next').disabled=idx===view.events.length-1||(!selected&&state.time>view.events.at(-1).time);
  const eventButtons=$('lab-events');eventButtons.replaceChildren();
  view.events.forEach(event=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',event.id===state.selectedEventId);b.textContent=event.title;const small=document.createElement('small');small.textContent=`第 ${event.time} ${dataset.unit}`;b.append(small);b.addEventListener('click',()=>act({type:'SELECT_EVENT',id:event.id}));eventButtons.append(b);});
  const svg=$('lab-diagram');svg.replaceChildren();
  const coords=Object.fromEntries(view.entities.map(e=>[e.id,[e.position[0]*580+30,e.position[1]*270+30]]));
  const path=events=>events.map((e,i)=>`${i?'L':'M'}${coords[e.entityId].join(',')}`).join(' ');
  if(state.visibleLayers.route){svg.append(svgNode('path',{d:path(view.events),class:'route-base'}));svg.append(svgNode('path',{d:path(view.visitedEvents),class:'route-active'}));}
  view.entities.forEach((entity,i)=>{
    const event=view.events.find(e=>e.entityId===entity.id),visited=view.visitedEvents.some(e=>e.entityId===entity.id),active=view.activeEntity?.id===entity.id;
    const [x,y]=coords[entity.id];
    const attrs={class:`node${visited?' is-visited':''}${active?' is-active':''}`,transform:`translate(${x},${y})`};
    if(event)Object.assign(attrs,{role:'button',tabindex:'0','aria-label':`选择${entity.label}`,'aria-pressed':active});
    else Object.assign(attrs,{role:'img','aria-label':entity.label,style:'cursor:default'});
    const group=svgNode('g',attrs);
    group.append(svgNode('circle',{r:17}),svgNode('text',{y:4,class:'node-number'},i+1));
    if(state.visibleLayers.labels)group.append(svgNode('text',{y:43},entity.label));
    if(event){const choose=()=>act({type:'SELECT_EVENT',id:event.id});group.addEventListener('click',choose);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});}
    svg.append(group);
  });
  $('lab-state').textContent=JSON.stringify({dataset:dataset.id,state,derived:{phaseId:phase.id,activeEntityId:view.activeEntity?.id||null,visitedEventIds:view.visitedEvents.map(e=>e.id)}},null,2);
  history.replaceState(null,'',`${location.pathname}?${explorer.encode()}${location.hash}`);
  if(state.playing&&!ticker)ticker=setInterval(()=>act({type:'NEXT'}),1400);
  if(!state.playing&&ticker){clearInterval(ticker);ticker=null;}
}
function selectDataset(id,restore=false){
  if(ticker)clearInterval(ticker);ticker=null;unsubscribe?.();explorer?.destroy();
  dataset=datasets[id]||datasets.delivery;explorer=createExplorer(dataset,{initialTime:dataset.min});
  document.querySelectorAll('[data-dataset]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.dataset===dataset.id));
  $('dataset-note').textContent=dataset.description;
  let feedback='同一核心 + 同一界面；只切换数据。';
  if(restore)try{explorer.restore(location.search);}catch(error){feedback='链接参数未通过校验，已恢复样例起点：'+error.message;explorer.dispatch({type:'SELECT_EVENT',id:dataset.events[0].id});}
  else explorer.dispatch({type:'SELECT_EVENT',id:dataset.events[0].id});
  unsubscribe=explorer.subscribe(render);render(explorer.getView());$('lab-feedback').textContent=feedback;
}
document.querySelectorAll('[data-dataset]').forEach(b=>b.addEventListener('click',()=>selectDataset(b.dataset.dataset)));
$('lab-time').addEventListener('input',e=>act({type:'SET_TIME',time:Number(e.target.value)}));
$('lab-prev').addEventListener('click',()=>act({type:'PREVIOUS'}));$('lab-next').addEventListener('click',()=>act({type:'NEXT'}));
$('lab-play').addEventListener('click',()=>act({type:'SET_PLAYING',playing:!explorer.getState().playing}));
$('lab-boundary').addEventListener('click',()=>{act({type:'SET_TIME',time:dataset.phases[1].from});$('lab-feedback').textContent=`边界 ${dataset.phases[1].from} 属于 ${dataset.phases[1].label}；阶段区间左闭右开。`;});
$('lab-route').addEventListener('change',e=>act({type:'SET_LAYER',layer:'route',visible:e.target.checked}));$('lab-labels').addEventListener('change',e=>act({type:'SET_LAYER',layer:'labels',visible:e.target.checked}));
$('lab-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`${location.origin}${location.pathname}?${explorer.encode()}#lab`);$('lab-feedback').textContent='已复制实验链接；在新标签打开可恢复选择。';}catch{$('lab-feedback').textContent='自动复制未成功，可复制地址栏链接。';}});
const initial=new URLSearchParams(location.search);selectDataset(initial.get('dataset')||'delivery',initial.has('dataset')||initial.has('time'));
window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);selectDataset(q.get('dataset')||'delivery',q.has('dataset'));});
window.addEventListener('pagehide',()=>{if(ticker)clearInterval(ticker);});
function updatePrompts(){const theme=$('target-theme').value.trim()||'你的新主题';
  $('prompt-analysis').textContent=`请研究指定源库，目标是形成可迁移的技术方法。\n\n从真实源码选出最重要的 5–8 个机制。每项说明：用户看到什么、数据结构、关键函数与固定版本链接、状态如何流转、为什么这样实现、失败情形、可迁移场景。\n区分源码事实、你的推断和你提出的改进。指出单体耦合与领域规则，不要把原项目描述成它并不存在的通用框架。\n\n交付可追溯的模式卡，并挑选最适合在“${theme}”中验证的 1–2 个机制。暂时不以整库换名或复制原有内容作为掌握技术的证据。`;
  $('prompt-transfer').textContent=`基于已确认的源码模式，为“${theme}”做一个最小、可操作的迁移实验。\n\n先定义实体、事件、阶段、有效期和来源等必要字段，标明领域特有规则。只提炼本实验需要的核心，明确输入、输出和状态不变量。\n使用两份结构相同、业务不同的数据验证复用；复用同一个核心和视图，不为第二个案例复制一套逻辑。教学数据必须明确标为样例。\n\n测试时间边界、多入口选择一致、未知实体、错误输入不污染状态和链接恢复。真正使用现成库或源代码时保留来源并说明边界；独立新写的部分也单独列出。\n交付运行网页、最小模块、两份数据、行为测试和未覆盖的问题。`;
  $('prompt-expand').textContent=`把已验证的方法用于“${theme}”的完整首版。\n\n先列出：已经能复用的模块、需要更换的数据适配器、必须重新设计的领域模型和需要核实的资料。选择一条完整用户任务，写明通过条件。\n实现时让业务状态与渲染分离，新增交互走统一动作；异步结果提交前确认仍对应当前选择；需要分享的状态使用明确的 URL 协议。\n只在发现真实需求时扩展通用能力，保留具体项目的业务规则。\n\n完成后在桌面和手机实际走完主流程。把发现的问题、修改原因和验证结果记录到技术笔记，区分复用、改造和新增。`;
  $('prompt-review').textContent=`请评审当前“${theme}”项目是否形成了可复用技术资产。\n\n逐项核对：\n1. 能否从效果追溯到源码依据与技术原理？\n2. 模块是否有明确数据契约、状态规则和适用边界？\n3. 第二份业务数据是否无需复制核心逻辑就能运行？\n4. 关键失败情形是否有行为测试或真实操作证据？\n5. 后续项目如何接入、需要替换什么、哪些能力仍未实现？\n6. 第三方代码、素材与新写代码的来源是否清楚？\n\n请输出已验证资产、待验证假设、不能通用化的规则，以及下一项最值得做的迁移任务。不要用文件数量、截图数量或提示词长度代替复用证据。`;
}
$('target-theme').addEventListener('input',updatePrompts);updatePrompts();
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($(button.dataset.copy).textContent);$('prompt-feedback').textContent='已复制：'+button.textContent;}catch{$('prompt-feedback').textContent='自动复制未成功，可手动选择模板文字。';}}));
