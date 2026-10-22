'use strict';
const D = window.ATLAS;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceMap = new Map(D.sources.map(s => [s.id,s]));
const routeMap = new Map(D.routes.map(r => [r.id,r]));
const selected = new Set();
let routeId = 'clips';
const refs = ids => ids.map(id => {const s=sourceMap.get(id); return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : '';}).join(' ');
const routeName = id => routeMap.get(id)?.name || '配套与服务框架';
const storage = {
 get(key, fallback){try {return JSON.parse(localStorage.getItem('avatar-atlas:'+key)) ?? fallback;}catch{return fallback;}},
 set(key,value){try{localStorage.setItem('avatar-atlas:'+key,JSON.stringify(value));return true;}catch{return false;}}
};
const allTestIds = new Set(D.tests.map(t=>t[0]));
const storedTests = storage.get('tests', []);
const checked = new Set((Array.isArray(storedTests)?storedTests:[]).filter(x=>allTestIds.has(x)));

function renderRoute(id){
 routeId=id;const r=routeMap.get(id);if(!r)return;
 $$('#route-tabs button').forEach(b=>{const active=b.dataset.route===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 $('#route-detail').setAttribute('aria-labelledby','tab-'+id);
 $('#route-detail').innerHTML=`<span class="label">${esc(r.tag)} · 路线 ${r.n}</span><h3>${esc(r.name)}</h3><p>${esc(r.principle)}</p><div class="flow">${r.formula.map(t=>`<span>${esc(t)}</span>`).join('<b aria-hidden="true">→</b>')}</div><dl class="facts">${[['输入',r.input],['输出',r.output],['动作来源',r.motion],['优势',r.strength],['能力边界',r.limit],['适合场景',r.fit],['成本构成',r.cost]].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="small"><b>代表模型 / 工具：</b>${esc(r.models.join(' · '))}</p><div class="callout"><b>建议怎样测</b><p>${esc(r.test)}</p></div><p class="source-line">${refs(r.refs)}</p><a href="#models" class="text-button" id="show-route-models">查看这条路线的模型 →</a>`;
 $('#show-route-models').onclick=()=>{$('#route-filter').value=id;$('#search').value='';$('#deployment-filter').value='all';renderModels();};
}
$('#route-tabs').innerHTML=D.routes.map((r,i)=>`<button role="tab" id="tab-${r.id}" aria-controls="route-detail" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-route="${r.id}"><span>${r.n}</span>${esc(r.name)}</button>`).join('');
$('#route-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)renderRoute(b.dataset.route);});
$('#route-tabs').addEventListener('keydown',e=>{const buttons=$$('#route-tabs button');let i=buttons.indexOf(document.activeElement);if(i<0)return;if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home')i=0;else if(e.key==='End')i=buttons.length-1;else i=(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;buttons[i].focus();renderRoute(buttons[i].dataset.route);}});
renderRoute(routeId);
$('#route-matrix tbody').innerHTML=D.matrix.map(row=>`<tr><th scope="row">${esc(row[0])}</th>${row.slice(1).map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('');
$('#route-filter').insertAdjacentHTML('beforeend',D.routes.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')+'<option value="support">配套与服务框架</option>');
$('#model-count').textContent=D.models.length;$('#source-count').textContent=D.sources.length;

function renderModels(){
 const terms=$('#search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);const route=$('#route-filter').value;const deploy=$('#deployment-filter').value;
 const rows=D.models.filter(m=>{const hay=[m.name,m.type,m.input,m.output,m.quality,m.limit,m.hardware,routeName(m.route)].join(' ').toLowerCase();return terms.every(t=>hay.includes(t))&&(route==='all'||m.route===route)&&(deploy==='all'||(deploy==='local'?m.local:!m.local));});
 $('#results-count').textContent=`显示 ${rows.length} / ${D.models.length} 项`;
 $('#model-grid').innerHTML=rows.length?rows.map(m=>`<article class="model-card ${selected.has(m.id)?'selected':''}" data-model="${m.id}"><div class="card-top"><span class="badge ${routeMap.get(m.route)?.color||'blue'}">${esc(m.priority)}</span><small>${m.local?'有本地路径':'商业云服务'}</small></div><h3>${esc(m.name)}</h3><span class="model-type">${esc(m.type)} / ${esc(routeName(m.route))}</span><p>${esc(m.quality)}</p><div class="hardware">${esc(m.hardware)}</div><div class="card-actions"><label><input type="checkbox" data-select="${m.id}" ${selected.has(m.id)?'checked':''}>加入对比<span class="sr-only">：${esc(m.name)}</span></label><button data-detail="${m.id}" aria-label="查看 ${esc(m.name)} 详情">详情与来源 ↗</button></div></article>`).join(''):'<div class="empty">没有符合条件的条目。试试减少关键词或重置筛选。</div>';
}
['search','route-filter','deployment-filter'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',renderModels));
$('#reset-filters').onclick=()=>{$('#search').value='';$('#route-filter').value='all';$('#deployment-filter').value='all';renderModels();};
function updateSelection(){
 $('#compare-count').textContent=`已选 ${selected.size} / 4`;
 $('#selected-chips').innerHTML=[...selected].map(id=>{const m=D.models.find(m=>m.id===id);return `<button class="chip" data-remove="${id}" aria-label="移除 ${esc(m.name)}">${esc(m.name)} ×</button>`;}).join('');
 $('#compare-button').disabled=selected.size<2;
 if(!$('#comparison').hidden){if(selected.size>=2)renderComparison(false);else $('#comparison').hidden=true;}
}
$('#model-grid').addEventListener('change',e=>{const id=e.target.dataset.select;if(!id)return;if(e.target.checked&&selected.size>=4){e.target.checked=false;$('#selection-feedback').textContent='最多选择四项。请先移除一项再添加。';return;}e.target.checked?selected.add(id):selected.delete(id);e.target.closest('.model-card').classList.toggle('selected',e.target.checked);$('#selection-feedback').textContent='';updateSelection();});
$('#selected-chips').onclick=e=>{const id=e.target.closest('[data-remove]')?.dataset.remove;if(id){selected.delete(id);renderModels();updateSelection();}};
$('#clear-selection').onclick=()=>{selected.clear();renderModels();updateSelection();$('#selection-feedback').textContent='';};
function renderComparison(scroll=true){
 const list=[...selected].map(id=>D.models.find(m=>m.id===id));if(list.length<2)return;
 const fields=[['类型','type'],['路线',m=>routeName(m.route)],['输入','input'],['输出','output'],['表现与用途','quality'],['限制','limit'],['硬件 / 官方报告','hardware'],['许可边界','license'],['证据',m=>refs(m.refs)],['实测状态',()=> '本子项目未运行；用户已有测试不等于同条件模型对比。']];
 $('#compare-table').innerHTML=`<caption>能力比较 · 不构成统一画质排名</caption><thead><tr><th>比较项目</th>${list.map(m=>`<th>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${fields.map(([label,key])=>`<tr><th scope="row">${label}</th>${list.map(m=>`<td>${label==='证据'?key(m):esc(typeof key==='function'?key(m):m[key])}</td>`).join('')}</tr>`).join('')}</tbody>`;
 $('#comparison').hidden=false;if(scroll)$('#comparison').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
$('#compare-button').onclick=()=>renderComparison();
const dialog=$('#model-dialog');
$('#model-grid').onclick=e=>{const id=e.target.closest('[data-detail]')?.dataset.detail;if(!id)return;const m=D.models.find(m=>m.id===id);$('#dialog-content').innerHTML=`<span class="label">${esc(routeName(m.route))}</span><h2 id="dialog-title">${esc(m.name)}</h2><p>${esc(m.quality)}</p><dl class="facts">${[['工具类型',m.type],['输入',m.input],['输出',m.output],['硬件',m.hardware],['限制',m.limit],['许可',m.license],['验证状态','官方资料已核对；本子项目未执行模型推理。']].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="source-line">${refs(m.refs)}</p><p class="small">官方仓库或项目页中可查看演示；本页没有将宣传样片伪装为我们的实测效果。</p>`;dialog.showModal();};
$('#dialog-close').onclick=()=>dialog.close();
dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
renderModels();

function calculate(){
 const form=$('#cost-form');const values=Object.fromEntries(new FormData(form));const n=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v===''?null:Number(v)]));
 let error='';if(!form.checkValidity())error='请填写有效的非负金额、时长及正整数并发 / 卡数。';else if(n.setup>=n.hours)error='GPU 准备时长必须小于 GPU 总计费时长。';
 const output=['unit-cost','gpu-cost','session-hours','total-cost'];
 $('#cost-error').textContent=error;if(error){output.forEach(id=>$('#'+id).textContent='—');$('#cloud-comparison').textContent='请修正输入后再计算。';return;}
 const gpu=n.rate*n.cards*n.hours;const sessions=(n.hours-n.setup)*n.concurrency*n.utilization/100;const total=gpu+n.fixed+n.extra*sessions;const unit=total/sessions;
 const money=v=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(v);
 $('#unit-cost').textContent=money(unit);$('#gpu-cost').textContent=money(gpu);$('#session-hours').textContent=sessions.toFixed(2)+' 小时';$('#total-cost').textContent=money(total);
 $('#cloud-comparison').textContent=n.cloud===null?'填写云数字人当前单价后，可比较纯画面服务支出。':`同等有效时长的云画面费用约 ${money(n.cloud*sessions)}；本地画面与固定费用为 ${money(gpu+n.fixed)}。两者均未在此项比较中加入语音对话费用，也不代表效果等价。`;
}
$('#cost-form').oninput=calculate;$('#cost-form').onsubmit=e=>e.preventDefault();calculate();
function renderTests(){
 $('#test-list').innerHTML=D.tests.map(([id,title,text])=>`<label class="test-item"><input type="checkbox" data-test="${id}" ${checked.has(id)?'checked':''}><span><b>${esc(title)}</b><span>${esc(text)}</span></span></label>`).join('');
 $('#test-progress').textContent=`${checked.size} / ${D.tests.length} 已记录`;
}
$('#test-list').onchange=e=>{const id=e.target.dataset.test;if(!id)return;e.target.checked?checked.add(id):checked.delete(id);const saved=storage.set('tests',[...checked]);$('#test-progress').textContent=`${checked.size} / ${D.tests.length} 已记录${saved?'':' · 浏览器不支持保存，本次仅临时保留'}`;};
$('#reset-tests').onclick=()=>{checked.clear();storage.set('tests',[]);renderTests();};renderTests();
function download(name,object){const blob=new Blob([JSON.stringify(object,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export').onclick=()=>download('digital-human-atlas-'+D.date+'.json',D);
$('#export-tests').onclick=()=>download('avatar-test-record-template.json',{research_date:D.date,status:'待填写真实测量；勾选只表示已记录，不代表通过',environment:{gpu:'',gpu_count:null,vram_gb:null,driver:'',cuda:'',model:'',commit:'',weights_hash:'',resolution:'',target_fps:null,concurrency:1},measurements:{first_audio_ms:null,first_video_ms:null,response_p50_ms:null,response_p95_ms:null,playback_fps:null,av_sync_error_ms:null,peak_vram_gb:null,successful_session_hours:null,total_cost_cny:null},inputs:{image_hash:'',audio_hash:'',duration_seconds:null,seed:null},checks:D.tests.map(([id,title,description])=>({id,title,description,recorded:checked.has(id),passed:null,evidence:'',notes:''}))});
$('#print').onclick=()=>window.print();

const decisions={
 budget:['继续优化现有 MuseTalk＋素材库','先比较底片质量、口部融合和声音表情一致性。用统一输入记录收益，暂时不同时替换 ASR、LLM、TTS。','下一项实验：同一段中文语音，分别用高质量录制底片和 AI 底片，盲测嘴型、眼神和动作重复。'],
 head:['把 FlashHead Lite 作为人像后端对照','保留现有对话与语音层，对比 Ditto / MuseTalk。优先验证脸部自然度和长时稳定，而不是只看 GPU 峰值 FPS。','进入条件：头部表现稳定改善，且每有效会话成本与打断延迟可接受；不能据此宣称获得全身动作能力。'],
 action:['先用 Vidu S2-Avatar 测目标动作是否值得投入','它公开支持动作指令与参考交互，但不是本地开源替代。用少量有代表性的动作建立目标效果，再评估重型开源生成模型。','下一项实验：挥手、低头、拿物、换场景逐项记录成功率与等待；不要只挑成功录像。'],
 space:['探索显式 3D 角色与独立动作系统','以 Audio2Face / MetaHuman 或浏览器 3D 为面部入口；身体、IK、碰撞、视线与道具管理单独设计。','下一项实验：现成绑定角色＋固定语音＋三个身体动作，先验证资产重定向和渲染预算。'],
 anime:['优先比较 Live2D 与浏览器 3D','Live2D 适合立绘风格；VRM / TalkingHead 更适合转身、相机与空间控制。两者都要补齐语音、嘴型与动作调度。','下一项实验：同一段语音在目标设备上运行，比较口型可读性、帧率、耗电与美术制作成本。']
};
function renderDecision(){const [title,why,test]=decisions[$('#goal-select').value];$('#decision-result').innerHTML=`<span class="label">基于当前目标的工程判断</span><h3>${title}</h3><p>${why}</p><p><b>${test}</b></p>`;}
$('#goal-select').onchange=renderDecision;renderDecision();
$('#glossary-list').innerHTML=D.glossary.map(([term,definition])=>`<details><summary>${esc(term)}</summary><p>${esc(definition)}</p></details>`).join('');
$$('[data-refs]').forEach(el=>el.innerHTML=refs(el.dataset.refs.split(',')));
$('#source-list').innerHTML=D.sources.map((s,i)=>{
 const e=D.evidence.repositories.find(r=>r.url.toLowerCase()===s.url.toLowerCase());
 return `<div class="source-item" id="source-${s.id}"><span>${String(i+1).padStart(2,'0')}</span><div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.url)}</small>${e?`<details><summary>README SHA-256</summary><code class="hash">${esc(e.sha256)}</code></details>`:''}</div><div class="source-meta">${e?`<a href="${esc(e.url)}/tree/${esc(e.commit)}" target="_blank" rel="noopener noreferrer">commit ${esc(e.commit.slice(0,8))} ↗</a><small>README 已读取 · 未运行</small>`:`<small>${s.id==='post'?'原帖：会话前文读取':'官方网页 / 模型卡'}<br>未作模型实测</small>`}</div></div>`;
}).join('');
const observer=new IntersectionObserver(entries=>{const entry=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(!entry)return;$$('.sidebar nav a').forEach(a=>{const active=a.hash==='#'+entry.target.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});},{rootMargin:'-5% 0px -70% 0px',threshold:0});
$$('main>section').forEach(s=>observer.observe(s));
// Expose read-only UI metrics to make manual verification straightforward, no network calls.
document.documentElement.dataset.ready='true';
