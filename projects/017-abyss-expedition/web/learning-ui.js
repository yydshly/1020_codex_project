// SPDX-License-Identifier: GPL-3.0-only
// Teaching UI and temporary demonstration records. Never writes personal data.
import {createSamplingSession} from './core/learning-core.mjs';
import {glossary,learningSources,lessonStages,learningMissions,equipmentCatalog} from './data/learning-content.mjs?v=2';
import {getDirectorLessonCue} from './rendering/director-lesson-timeline.mjs?v=1';
const $=id=>document.getElementById(id);
const clamp=value=>Math.max(0,Math.min(1,value));
const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};

export function createLearningExperience({scene,onPause=()=>{},onPlay=()=>{},onSeek=()=>{},onOpenEquipment=()=>{}}){
  let session=null,unsubscribe=null,mission=null,state=null,lastShot='',manualStep=null,samplingFrame=0,samplingStarted=0,activeRole=null,activeEntity=null,summaryTab='known',manualSummaryTab=false,conditions={};
  const panel=$('learning-panel'),listeners=[];
  // Keep the current explanation outside the scrollable choices. Scrolling a
  // selected device must never carry its name or explanation out of view.
  const heading=node('div',undefined,'learning-panel-heading'),body=node('div',undefined,'learning-panel-body');
  heading.append(panel.querySelector('.learning-panel-top'),$('learning-title'),$('learning-text'));
  body.append($('learning-step-buttons'),$('learning-auto'),$('learning-extra'),$('learning-note'));panel.append(heading,body);
  let equipmentFrame=0,equipmentStamp=0,referenceTab='concepts';
  const listen=(element,event,callback)=>{element.addEventListener(event,callback);listeners.push(()=>element.removeEventListener(event,callback));};
  const button=(text,callback)=>{const item=node('button',text);item.type='button';item.addEventListener('click',callback);return item;};
  function cancelSampling(){if(samplingFrame)cancelAnimationFrame(samplingFrame);samplingFrame=0;}
  function cancelEquipment(){if(equipmentFrame)cancelAnimationFrame(equipmentFrame);equipmentFrame=0;scene.setEquipmentDemoTime?.(null);const action=$('equipment-run');if(action){action.disabled=false;action.textContent='运行设备 4秒';}const status=$('equipment-run-status');if(status)status.textContent='选择设备后可运行四秒；影片和讲解保持暂停。';}
  function updateRecords(){
    const record=session?.getState();if(!record)return;
    $('learning-record-count').textContent=`演示水样 ${Number(Boolean(record.samples.near))+Number(Boolean(record.samples.far))} / 2`;
    for(const role of ['near','far']){const element=$(`learning-${role}-record`);if(element)element.textContent=`${mission.sites[role].label} · ${record.samples[role]?'已取样，待化验':'尚未演示取样'}`;}
    if($('learning-comparison-body'))renderComparison();
    if(state?.shot.learning==='summary')renderSummaryBody();
  }
  function configure(id,missionData){
    cancelSampling();cancelEquipment();unsubscribe?.();session?.destroy();mission=learningMissions[id];
    if(!mission)throw new RangeError('没有这条教学航次');
    conditions={};for(const role of ['near','far']){const entity=missionData?.entities?.find(item=>item.id===mission.sites[role].id),event=missionData?.events?.find(item=>item.entityId===entity?.id);conditions[role]={code:role==='near'?'A-01':'B-01',depth:entity?.depth,time:event?.time};}
    session=createSamplingSession({id,sites:mission.sites});unsubscribe=session.subscribe(updateRecords);lastShot='';state=null;manualStep=null;activeRole=null;activeEntity=null;summaryTab='known';manualSummaryTab=false;panel.hidden=true;updateRecords();
  }
  function openConcepts(id=null,tab='concepts'){
    onPause();cancelSampling();cancelEquipment();renderReference(tab);$('concept-dialog').showModal();
    if(id){const target=$(`concept-${id}`);target?.scrollIntoView({block:'nearest'});target?.focus({preventScroll:true});}
  }
  function renderReference(tab=referenceTab){
    referenceTab=tab;
    $('concept-tab-concepts').setAttribute('aria-pressed',tab==='concepts');$('concept-tab-equipment').setAttribute('aria-pressed',tab==='equipment');
    $('concept-dialog-title').textContent=tab==='equipment'?'这次科考的设备与分工':'深海科考基础概念';$('concept-open-equipment').hidden=tab!=='equipment';
    const container=$('concept-list');container.replaceChildren();
    for(const entry of tab==='equipment'?equipmentCatalog:glossary){const card=node('article');card.id=`${tab==='equipment'?'device':'concept'}-${entry.id}`;card.tabIndex=-1;card.append(node('h3',entry.name));if(entry.question)card.append(node('p',entry.question,'equipment-question'));card.append(node('p',entry.text));if(entry.visible)card.append(node('p',`在画面中找：${entry.visible}`,'equipment-where'));const source=learningSources[entry.source];if(source){const link=node('a',source.label+' ↗');link.href=source.url;link.target='_blank';link.rel='noopener';card.append(link);}container.append(card);}
  }
  function clearPanel(title,text){
    $('equipment-run')?.remove();
    panel.dataset.staged='false';panel.setAttribute('aria-label',title);panel.querySelector('.learning-panel-top span').textContent='理解这一步';
    $('learning-title').textContent=title;$('learning-text').textContent=text;
    $('learning-step-buttons').replaceChildren();$('learning-step-buttons').scrollLeft=0;$('learning-extra').replaceChildren();$('learning-auto').hidden=true;
  }
  function buildStage(kind){
    const lesson=lessonStages[kind];clearPanel(lesson.title,lesson.steps[0][1]);
    panel.dataset.staged='true';panel.setAttribute('aria-label',lesson.title);
    lesson.steps.forEach(([title],index)=>{const item=button(`${index+1} ${title}`,()=>{onPause();cancelEquipment();manualStep=index;scene.setLearningStep?.(index);updateStep(index);$('learning-auto').hidden=false;});item.setAttribute('aria-pressed','false');$('learning-step-buttons').append(item);});
    if(kind==='equipment'){
      const action=button('运行设备 4秒',runEquipment);action.id='equipment-run';action.setAttribute('aria-label','运行当前设备四秒');$('learning-expand').before(action);const status=node('p','选中一项，再运行它，观察怎样支持工作。');status.id='equipment-run-status';status.setAttribute('role','status');$('learning-extra').append(status,button('设备清单与工作链 ↗',()=>openConcepts(null,'equipment')));
    }else if(lesson.term)$('learning-extra').append(button('解释这个概念 ↗',()=>openConcepts(lesson.term)));
    $('learning-note').textContent=kind==='equipment'?'无人ROV与科考现场使用同一模型。声波、数据流和部件放大均为工作方式示意。':'原理模型 · 颜色区分过程，比例与速度经过简化';
  }
  function runEquipment(){
    if(state?.shot.explanation!=='equipment')return;
    onPause();cancelEquipment();manualStep=manualStep??getDirectorLessonCue(state.shot,state.shotElapsed)?.step??Math.min(7,Math.floor(state.shotProgress*8));scene.setLearningStep?.(manualStep);updateStep(manualStep);$('learning-auto').hidden=false;equipmentStamp=0;
    $('equipment-run').disabled=true;$('equipment-run').textContent='正在运行…';$('equipment-run-status').textContent='正在演示当前设备的工作效果；影片和讲解保持暂停。';
    const step=now=>{if(!equipmentStamp)equipmentStamp=now;const seconds=Math.min(4,(now-equipmentStamp)/1000);scene.setEquipmentDemoTime?.(seconds);if(seconds<4)equipmentFrame=requestAnimationFrame(step);else{equipmentFrame=0;$('equipment-run').disabled=false;$('equipment-run').textContent='再运行 4秒';$('equipment-run-status').textContent=`演示完成：${lessonStages.equipment.steps[manualStep][1]}`;}};equipmentFrame=requestAnimationFrame(step);
  }
  function updateStep(index){
    const lesson=lessonStages[state?.shot.explanation];if(!lesson)return;
    const safe=Math.max(0,Math.min(lesson.steps.length-1,index));
    if(panel.dataset.currentStep===String(safe))return;
    panel.dataset.currentStep=String(safe);$('learning-title').textContent=lesson.steps[safe][0];$('learning-text').textContent=lesson.steps[safe][1];
    panel.querySelector('.learning-panel-top span').textContent=`${safe+1} / ${lesson.steps.length} · ${lesson.steps[safe][0].split('：')[0]}`;
    [...$('learning-step-buttons').children].forEach((item,i)=>item.setAttribute('aria-pressed',i===safe));
    revealSelectedStep();
  }
  function revealSelectedStep(){
    const item=$('learning-step-buttons').querySelector('[aria-pressed="true"]');if(!item)return;
    // Adjust only the list's own scroll surfaces, never the page or the fixed
    // explanation. This also keeps the selected chip visible on small screens.
    const choices=$('learning-step-buttons'),bounds=item.getBoundingClientRect(),list=choices.getBoundingClientRect(),area=body.getBoundingClientRect();
    if(bounds.left<list.left)choices.scrollLeft-=list.left-bounds.left;
    else if(bounds.right>list.right)choices.scrollLeft+=bounds.right-list.right;
    if(bounds.top<area.top)body.scrollTop-=area.top-bounds.top;
    else if(bounds.bottom>area.bottom)body.scrollTop+=bounds.bottom-area.bottom;
  }
  function roleShot(role){return state?.shots.findIndex(shot=>shot.learning===`sample-${role}`)??-1;}
  function goSample(role){const index=roleShot(role);if(index>=0)onSeek(index);}
  function recordCards(){const cards=node('div',undefined,'learning-records');for(const role of ['near','far']){const card=node('p');card.id=`learning-${role}-record`;cards.append(card);}return cards;}
  function sample(progress,{commit=false}={}){
    if(!activeRole||!activeEntity)return;scene.setSamplingProgress?.({entityId:activeEntity,progress:clamp(progress)});
    const meter=$('learning-sample-progress');if(meter)meter.value=clamp(progress);
    if(commit)session.collect(activeRole);
    if(session.getState().samples[activeRole]){const status=$('learning-sample-status');if(status)status.textContent='瓶盖已关闭 · 演示记录已保留 · 化验待完成';const action=$('learning-sample-action');if(action)action.textContent='重新演示采水';}
  }
  function manualSample(){
    onPause();cancelSampling();samplingStarted=0;
    // A manual demonstration gets an apparatus close-up while the voice and
    // film clock remain paused. Resuming the film restores its authored frame.
    if(state)scene.setDirectorFrame?.({...state.shot,shotId:state.shot.id,framing:'compare',progress:.92,duration:state.shot.duration,playing:false,elapsed:state.elapsed,jump:true});
    const step=now=>{if(!samplingStarted)samplingStarted=now;const progress=clamp((now-samplingStarted)/1600);sample(progress,{commit:progress===1});if(progress<1)samplingFrame=requestAnimationFrame(step);else samplingFrame=0;};samplingFrame=requestAnimationFrame(step);
  }
  function buildSampling(role){
    const site=mission.sites[role];clearPanel(`取一瓶海水 · ${site.label}`,role==='near'?'先在水样A站取海水，并保留站位。下一处也采海水，才能比较。':'在水样B站按同样方法取海水。两瓶材料类型相同，位置不同。');
    const extra=$('learning-extra'),action=button('亲自演示采水',manualSample);action.id='learning-sample-action';
    const meter=node('progress');meter.id='learning-sample-progress';meter.max=1;meter.value=0;meter.setAttribute('aria-label','采水动作进度');
    const status=node('p','播放会演示关盖；也可暂停后亲自操作。');status.id='learning-sample-status';status.setAttribute('role','status');
    const details=conditions[role],metadata=node('p',`记录 ${details.code} · 站点水深 ${details.depth??'—'} m · 航次第 ${details.time??'—'} 分钟`);
    extra.append(action,meter,status,metadata,recordCards());$('learning-note').textContent='这些是本轮教学演示记录；不会写入你的个人航次报告。';updateRecords();
  }
  function renderComparison(){
    const body=$('learning-comparison-body');if(!body)return;body.replaceChildren();const record=session.getState();
    const detail=role=>record.samples[role]?conditions[role]:null;
    for(const [label,a,b] of [['材料','海水','海水'],['位置',mission.sites.near.label,mission.sites.far.label],['演示状态',record.samples.near?'已取样':'未取样',record.samples.far?'已取样':'未取样'],['记录编号',detail('near')?.code||'未取样',detail('far')?.code||'未取样'],['水深',detail('near')?.depth?`${detail('near').depth} m`:'待记录',detail('far')?.depth?`${detail('far').depth} m`:'待记录'],['航次时刻',detail('near')?`第 ${detail('near').time??'—'} 分钟`:'待记录',detail('far')?`第 ${detail('far').time??'—'} 分钟`:'待记录'],['成分化验','待分析','待分析']]){const row=node('tr');row.append(node('th',label),node('td',a),node('td',b));body.append(row);}
    const status=$('learning-pair-status');if(status)status.textContent=record.comparisonUnlocked?'两份同类演示记录齐全。深度和时刻也有差别，具体成分与变化原因仍需化验和更多观测。':'对照还缺记录。可回到对应站点演示取样。';
  }
  function buildComparison(){
    buildStage('comparison');const extra=$('learning-extra');extra.replaceChildren();const table=node('table');table.setAttribute('aria-label','同类水样对照');const head=node('thead'),row=node('tr');row.append(node('th','检查项'),node('th','水样A'),node('th','水样B'));head.append(row);const body=node('tbody');body.id='learning-comparison-body';table.append(head,body);const status=node('p');status.id='learning-pair-status';status.setAttribute('role','status');
    const actions=node('div',undefined,'learning-inline-actions');actions.append(button('回到水样A',()=>goSample('near')),button('回到水样B',()=>goSample('far')));
    const question=node('p','只看颜色，能判断水中有什么吗？');const feedback=node('p');feedback.id='learning-answer';feedback.setAttribute('role','status');const answers=node('div',undefined,'learning-inline-actions');answers.append(button('还需仪器和化验',()=>{onPause();feedback.textContent='正确。颜色是观察线索，具体成分需要分析与对照。';}),button('颜色深就能确定',()=>{onPause();feedback.textContent='再想一想：不同颗粒也会改变颜色，不能据此确定成分或养分多少。';}));extra.append(table,status,actions,question,answers,feedback);renderComparison();$('learning-note').textContent='表中不提供虚构化验结果。取样位置与原理演示均为教学设计。';
  }
  function renderSummaryBody(){
    const body=$('learning-summary-body');if(!body)return;body.replaceChildren();
    if(summaryTab==='known'){const list=node('ol');for(const text of mission.known)list.append(node('li',text));body.append(list);}
    if(summaryTab==='records'){body.append(recordCards());const record=session.getState();for(const role of ['near','far'])$(`learning-${role}-record`).textContent=`${mission.sites[role].label} · ${record.samples[role]?'海水已取样，化验待完成':'本轮尚未演示取样'}`;const actions=node('div',undefined,'learning-inline-actions');actions.append(button('检查水样A',()=>goSample('near')),button('检查水样B',()=>goSample('far')));body.append(actions);}
    if(summaryTab==='pending')body.append(node('p',mission.pending),node('p','当前画面、温度、站位和样本记录均为教学模拟，不能用来宣布真实海域的研究结论。'));
  }
  function buildSummary(){
    clearPanel('回到开场的三个问题',mission.question);const tabs=node('div',undefined,'learning-tabs');
    for(const [id,label] of [['known','已知原理'],['records','本轮记录'],['pending','待分析']]){const item=button(label,()=>{onPause();manualSummaryTab=true;summaryTab=id;[...tabs.children].forEach(tab=>tab.setAttribute('aria-pressed',tab===item));renderSummaryBody();});item.dataset.summaryTab=id;item.setAttribute('aria-pressed',summaryTab===id);tabs.append(item);}
    const body=node('div');body.id='learning-summary-body';$('learning-extra').append(tabs,body);renderSummaryBody();$('learning-note').textContent='先总结能解释的机制，再区分观察记录与尚待验证的问题。';
  }
  function buildMission(){clearPanel('这次为什么出发',mission.question);const extra=$('learning-extra');extra.append(node('p',mission.goal),node('p','你是船上的科考观察员：跟随潜器拍摄、保留位置，完成两站同类采水演示。'),button('先认识基础概念',()=>openConcepts()));$('learning-note').textContent='影片可自动观看；原理可分步查看，采水可亲自演示。';}
  function sync(next,action={type:'TICK'}){
    state=next;if(!session)return;
    if(!next.active){cancelSampling();cancelEquipment();lastShot='';panel.hidden=true;document.body.classList.remove('learning-active','learning-concept','learning-sampling','learning-summary');return;}
    const discontinuity=['ENTER','SEEK','SEEK_SHOT','NEXT','PREVIOUS'].includes(action.type);
    if(discontinuity){cancelSampling();cancelEquipment();manualStep=null;scene.setLearningStep?.(null);$('learning-auto').hidden=true;}
    else if(next.playing&&manualStep!==null){cancelEquipment();manualStep=null;scene.setLearningStep?.(null);$('learning-auto').hidden=true;}
    if(next.playing&&samplingFrame)cancelSampling();
    if(next.playing||discontinuity)manualSummaryTab=false;
    if(next.elapsed===0&&['ENTER','PLAY'].includes(action.type)){session.reset();for(const role of ['near','far'])scene.setSamplingProgress?.({entityId:mission.sites[role].id,progress:0});}
    const changed=lastShot!==next.shot.id;
    if(changed){
      cancelSampling();cancelEquipment();lastShot=next.shot.id;manualStep=null;manualSummaryTab=false;scene.setLearningStep?.(null);activeRole=next.shot.learning==='sample-near'?'near':next.shot.learning==='sample-far'?'far':null;activeEntity=activeRole?next.shot.entityId:null;
      const kind=next.shot.explanation,summary=next.shot.learning==='summary';
      panel.dataset.kind=kind||next.shot.learning||'';
      panel.dataset.currentStep='';body.scrollTop=0;
      panel.classList.remove('expanded');$('learning-expand').setAttribute('aria-expanded','false');$('learning-expand').textContent=kind==='comparison'?'查看对照表':summary?'展开总结':'展开说明';
      document.body.classList.toggle('learning-concept',Boolean(kind&&kind!=='summary'));document.body.classList.toggle('learning-sampling',Boolean(activeRole));document.body.classList.toggle('learning-summary',summary);
      panel.hidden=!(kind||activeRole||next.shot.learning==='mission'||summary);
      document.body.classList.toggle('learning-active',!panel.hidden);
      if(summary)buildSummary();else if(activeRole)buildSampling(activeRole);else if(kind==='comparison')buildComparison();else if(lessonStages[kind])buildStage(kind);else if(next.shot.learning==='mission')buildMission();
    }
    const lessonCue=getDirectorLessonCue(next.shot,next.shotElapsed),lesson=lessonStages[next.shot.explanation];if(lesson&&!['summary'].includes(next.shot.explanation))updateStep(manualStep??lessonCue?.step??Math.min(lesson.steps.length-1,Math.floor(next.shotProgress*lesson.steps.length)));
    if(next.shot.learning==='summary'&&!manualSummaryTab){const desired=['known','records','pending'][lessonCue?.step??0];if(summaryTab!==desired){summaryTab=desired;for(const tab of $('learning-extra').querySelectorAll('[data-summary-tab]'))tab.setAttribute('aria-pressed',String(tab.dataset.summaryTab===desired));renderSummaryBody();}}
    if(activeRole&&!samplingFrame){const progress=session.getState().samples[activeRole]?1:clamp((next.shotProgress-.18)/.5);sample(progress,{commit:next.playing&&progress===1});}
  }
  renderReference();listen($('concepts-button'),'click',()=>openConcepts());listen($('director-concepts'),'click',()=>openConcepts());listen($('concept-close'),'click',()=>$('concept-dialog').close());
  listen($('concept-tab-concepts'),'click',()=>renderReference('concepts'));listen($('concept-tab-equipment'),'click',()=>renderReference('equipment'));
  listen($('concept-open-equipment'),'click',()=>{$('concept-dialog').close();onOpenEquipment();});
  listen($('help-concepts'),'click',()=>{$('help-dialog').close();openConcepts();});
  listen($('learning-auto'),'click',()=>{manualStep=null;scene.setLearningStep?.(null);$('learning-auto').hidden=true;if(state)sync(state);onPlay();});
  listen($('learning-expand'),'click',()=>{onPause();const expanded=panel.classList.toggle('expanded');$('learning-expand').textContent=expanded?'收起':panel.dataset.kind==='comparison'?'查看对照表':panel.dataset.kind==='summary'?'展开总结':'展开说明';$('learning-expand').setAttribute('aria-expanded',expanded);});
  listen(document,'visibilitychange',()=>{if(document.hidden){cancelSampling();cancelEquipment();}});
  listen(window,'resize',()=>requestAnimationFrame(()=>{if(!panel.hidden)revealSelectedStep();}));
  return {configure,sync,openConcepts,getState:()=>session?.getState(),destroy(){cancelSampling();cancelEquipment();unsubscribe?.();session?.destroy();listeners.forEach(remove=>remove());}};
}
