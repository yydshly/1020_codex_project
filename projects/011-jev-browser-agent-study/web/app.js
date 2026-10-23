"use strict";

const sourceBase = "https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/";
document.querySelectorAll("[data-source-file]").forEach(function (link) {
  link.href = sourceBase + link.dataset.sourceFile;
  link.target = "_blank";
  link.rel = "noreferrer";
});

const hotelSteps = [
  {short:"填城市",title:"城市输入框为空",observation:"任务要求杭州。当前城市为空，先选中填写城市这个动作。",city:"",options:["[1] 城市输入框 · 空 · 可填字 / 点击","[2] 入住 / 离店 · 可点击","[4] 免费取消 · 未勾选","[6] 搜索酒店 · 可点击"],selected:0,answer:"operation = TYPE_TEXT\ntype_text_target = 1",execute:"文字助手根据目标和字段生成“杭州”；库执行前检查页面，再向城市框输入。Jev 本轮只选择操作与目标。",history:"每轮请求：目标 + 当前页面 + 控件 + 最近最多 10 条已执行动作。",highlight:"mock-city"},
  {short:"选城市",title:"输入后，城市建议出现了",observation:"当前文本是“杭州”，但联想结果还未选定。输入文字和确认城市是两步。",city:"杭州",suggestion:true,options:["[1] 城市输入框 · 杭州","[5] 杭州 · 浙江，中国 · 城市建议","[2] 入住 / 离店 · 可点击"],selected:1,answer:"operation = CLICK\nclick_target = 5",execute:"库解析到刚观察到的建议节点，再读取它的位置、检查是否被遮挡，并点击。",history:"上一步：已向城市输入框填写“杭州”。",highlight:"hotel-suggestion"},
  {short:"开日历",title:"城市确认后，打开日期控件",observation:"城市已确认；任务里的入住与离店日期还没有设置。住客当前已经是 2 位成人。",city:"杭州 ✓",options:["[1] 城市输入框 · 杭州","[2] 入住 / 离店 · 未设置","[3] 住客 · 2 位成人","[4] 免费取消 · 未勾选"],selected:1,answer:"operation = CLICK\nclick_target = 2",execute:"库点击日期入口。只有控件展开后，下一轮才能观察到日历中的日期选项。",history:"最近动作包含城市填写、联想建议选择；已满足的城市条件不再重复设置。",highlight:"mock-dates"},
  {short:"选入住",title:"日历展开，选择入住日",observation:"新页面状态里出现日历日期。用户目标是 2026 年 10 月 30 日入住。",city:"杭州 ✓",calendar:true,options:["日历 · 2026 年 10 月","[8] 10 月 30 日 · 可点击","[9] 10 月 31 日 · 可点击"],selected:1,answer:"operation = CLICK\nclick_target = 8",execute:"库对观察到的日期节点执行点击。这里编号仅用于教学；实际编号由每轮快照决定。",history:"上一轮点击了日期入口；日历是新出现的候选环境。",highlight:"day-in"},
  {short:"选离店",title:"入住日已选，继续设置离店日",observation:"当前入住日为 10 月 30 日，离店日尚未设置。仍需满足完整日期要求。",city:"杭州 ✓",calendar:true,checkin:true,options:["入住 · 2026-10-30 · 已选择","[9] 10 月 31 日 · 可作为离店日","[4] 免费取消 · 未勾选"],selected:1,answer:"operation = CLICK\nclick_target = 9",execute:"库点击 10 月 31 日。真实控件若还需要确认按钮，必须在后续观察中再选择确认。",history:"已执行：城市设置、展开日历、选择入住日。",highlight:"day-out"},
  {short:"设筛选",title:"日期已设置，免费取消尚未勾选",observation:"城市、日期、人数均符合目标；免费取消仍处于未勾选状态。",city:"杭州 ✓",dates:true,options:["[2] 日期 · 2026.10.30 — 10.31","[3] 住客 · 2 位成人 · 已满足","[4] 免费取消 · 未勾选","[6] 搜索酒店 · 可点击"],selected:2,answer:"operation = CLICK\nclick_target = 4",execute:"库点击复选框。下一轮会再次读取 checked 状态，避免把已经勾选的控件反复切换。",history:"本例人数初始就是 2，不需要为了“走流程”再点击一次。",highlight:"mock-cancel"},
  {short:"点搜索",title:"条件已经填写，提交搜索",observation:"填好字段只是页面状态，尚不等于已经执行查询。现在需要点击搜索。",city:"杭州 ✓",dates:true,cancel:true,options:["[1] 城市 · 杭州","[2] 日期 · 2026.10.30 — 10.31","[4] 免费取消 · 已勾选","[6] 搜索酒店 · 可点击"],selected:3,answer:"operation = CLICK\nclick_target = 6",execute:"库检查搜索按钮当前是否有效、是否被遮挡，然后发出实际点击输入。",history:"业务条件已满足；模型使用当前状态判断无需重复填城市或切换筛选。",highlight:"mock-search"},
  {short:"等结果",title:"搜索已提交，结果尚在加载",observation:"页面暂时没有可用的酒店结果。此时等待页面更新，再重新观察。",city:"杭州 ✓",dates:true,cancel:true,loading:true,options:["结果区 · 加载中","WAIT · 等待页面更新","BLOCKED · 无支持操作时才停止"],selected:1,answer:"operation = WAIT\n无需目标元素",execute:"库短暂等待并重新观察页面。WAIT 是程序动作，不会提前猜测尚未出现的酒店元素。",history:"最近动作是提交搜索；并非看到几次 WAIT 就认定页面仍在加载。",highlight:null},
  {short:"开详情",title:"结果出现，打开匹配酒店",observation:"清溪酒店出现在结果中。任务要求打开详情，看到结果链接本身还不算完成。",city:"杭州 ✓",dates:true,cancel:true,results:true,options:["结果 · 清溪酒店 · 杭州","条件 · 日期 / 2 位成人 / 免费取消","[7] 清溪酒店 · 查看详情"],selected:2,answer:"operation = CLICK\nclick_target = 7",execute:"库点击刚观察到的详情入口，再读取跳转后的页面，准备判断目标是否满足。",history:"页面已从加载状态切换到搜索结果，候选动作随之更新。",highlight:"mock-detail"},
  {short:"模型完成",title:"已到详情页，模型判断完成",observation:"详情页可见目标酒店和要求条件。模型本轮选择 DONE，Agent 循环停止。",city:"杭州 ✓",dates:true,cancel:true,detail:true,options:["详情 · 清溪酒店","条件 · 杭州 / 指定日期 / 2 位成人 / 免费取消","DONE · 认为全部要求已满足"],selected:2,answer:"operation = DONE\nAgent 状态 → done",execute:"库接受完成信号并结束运行。DONE 表示模型判断，不是独立的业务成功证明。",history:"结果轨迹可交给业务代码校验；本例未创建任何订单。",highlight:null},
  {short:"独立核验",title:"业务代码独立检查实际结果",observation:"最后检查城市、日期、人数、免费取消条件和详情页。这一步不是再次调用 Jev。",city:"杭州 ✓",dates:true,cancel:true,detail:true,verified:true,options:["✓ 城市、日期与人数符合示例任务","✓ 筛选条件已应用，详情页已打开","✓ 本例目标到此结束，无下单 / 付款"],selected:-1,answer:"本轮没有模型请求\n由独立检查器读取实际结果",execute:"这是我们建议补充的验收环节；上游航班示例已有独立检查器，不能据此认为所有业务都有通用验证。",history:"本页检查的是固定教学状态，不能作为真实酒店平台的测试结果。",highlight:null}
];
let simIndex = 0;
let simTimer = null;
const byId = function (id) { return document.getElementById(id); };
const stepTrack = byId("step-track");
hotelSteps.forEach(function (step,index) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label","跳到第 " + (index+1) + " 轮：" + step.short);
  button.addEventListener("click",function () { stopPlayback(); renderHotel(index,true); });
  li.appendChild(button);
  stepTrack.appendChild(li);
});

function renderHotel(index,announce) {
  simIndex = Math.max(0,Math.min(hotelSteps.length-1,index));
  const step = hotelSteps[simIndex];
  byId("sim-title").textContent = step.title;
  byId("sim-progress").textContent = String(simIndex+1).padStart(2,"0") + " / " + hotelSteps.length;
  byId("sim-observation").textContent = step.observation;
  byId("sim-answer").textContent = step.answer;
  byId("sim-execute").textContent = step.execute;
  byId("sim-history").textContent = step.history;
  byId("sim-role").textContent = step.verified ? "本轮 · 业务独立校验" : "本轮 · Jev 抉择";
  byId("sim-execute-label").textContent = step.verified ? "03 示例核验结果" : "03 程序执行";
  const options = byId("sim-options");
  options.replaceChildren();
  step.options.forEach(function (label,i) {
    const li = document.createElement("li");
    li.textContent = label;
    if(i === step.selected) li.classList.add("selected");
    options.appendChild(li);
  });
  byId("hotel-city").textContent = step.city || "选择城市";
  byId("hotel-dates").textContent = step.dates ? "10.30 — 10.31" : step.checkin ? "10.30 — 待选择" : "选择日期";
  byId("hotel-suggestion").hidden = !step.suggestion;
  byId("hotel-calendar").hidden = !step.calendar;
  byId("hotel-loading").hidden = !step.loading;
  byId("hotel-results").hidden = !step.results;
  byId("hotel-detail").hidden = !step.detail;
  byId("hotel-placeholder").hidden = !!(step.suggestion || step.calendar || step.loading || step.results || step.detail);
  byId("cancel-check").classList.toggle("checked",!!step.cancel);
  byId("cancel-check").textContent = step.cancel ? "✓" : "";
  byId("day-in").classList.toggle("chosen",!!step.checkin);
  byId("day-out").classList.toggle("chosen",!!step.dates);
  byId("calendar-caption").textContent = step.checkin ? "入住已选择，请选择离店日期" : "选择入住日期";
  byId("hotel-headline").textContent = step.detail ? "已经打开酒店详情" : step.results ? "找到了匹配的停留" : "下一站，住在哪里？";
  document.querySelectorAll(".simulation .highlight").forEach(function (node) { node.classList.remove("highlight"); });
  if (step.highlight) byId(step.highlight).classList.add("highlight");
  Array.from(stepTrack.children).forEach(function (li,i) {
    li.classList.toggle("past",i<simIndex);
    li.classList.toggle("current",i===simIndex);
    li.querySelector("button").setAttribute("aria-current",i===simIndex ? "step" : "false");
  });
  byId("sim-prev").disabled = simIndex===0;
  byId("sim-next").disabled = simIndex===hotelSteps.length-1;
  if(announce) byId("sim-announcement").textContent = "第 " + (simIndex+1) + " 轮，" + step.title;
}
function stopPlayback() {
  if(simTimer!==null) clearInterval(simTimer);
  simTimer=null;
  byId("sim-play").textContent="自动演示";
  byId("sim-play").setAttribute("aria-pressed","false");
}
byId("sim-prev").addEventListener("click",function () { stopPlayback();renderHotel(simIndex-1,true); });
byId("sim-next").addEventListener("click",function () { stopPlayback();renderHotel(simIndex+1,true); });
byId("sim-reset").addEventListener("click",function () { stopPlayback();renderHotel(0,true); });
byId("sim-play").addEventListener("click",function () {
  if(simTimer!==null) { stopPlayback();return; }
  if(simIndex===hotelSteps.length-1) renderHotel(0,true);
  byId("sim-play").textContent="暂停演示";
  byId("sim-play").setAttribute("aria-pressed","true");
  simTimer=setInterval(function () {
    renderHotel(simIndex+1,true);
    if(simIndex===hotelSteps.length-1) stopPlayback();
  },2600);
});
document.addEventListener("visibilitychange",function () { if(document.hidden) stopPlayback(); });
renderHotel(0,false);

// Original teaching implementation: inspect this page's sample controls only.
function updateRuleLab() {
  byId("sample-search").disabled = byId("toggle-disabled").checked;
  byId("sample-city").readOnly = byId("toggle-readonly").checked;
  byId("sample-cancel-wrap").hidden = byId("toggle-hidden").checked;
  const candidates=[];
  const controls=byId("sample-controls").querySelectorAll("input,button");
  controls.forEach(function (el) {
    if(el.disabled || el.closest("[hidden]")) return;
    if(el.tagName==="INPUT" && el.type==="text") {
      if(!el.readOnly) candidates.push("TYPE_TEXT → 城市输入框（当前：“" + el.value + "”）");
      candidates.push("CLICK → 城市输入框" + (el.readOnly ? "（只读，不提供填字）" : ""));
    } else if(el.tagName==="BUTTON") candidates.push("CLICK → 搜索酒店按钮");
    else if(el.type==="checkbox") candidates.push("CLICK → 免费取消（" + (el.checked ? "已勾选" : "未勾选") + "）");
  });
  const list=byId("lab-actions");
  list.replaceChildren();
  candidates.forEach(function (text) { const li=document.createElement("li");li.textContent=text;list.appendChild(li); });
  byId("lab-status").textContent="当前生成 " + candidates.length + " 个候选动作。此实验不执行酒店搜索。";
}
["toggle-disabled","toggle-readonly","toggle-hidden","sample-city","sample-cancel"].forEach(function (id) {
  byId(id).addEventListener("input",updateRuleLab);
});
byId("sample-search").addEventListener("click",function () { byId("sample-feedback").textContent="这里是识别规则实验，按钮没有连接真实搜索服务。"; });
updateRuleLab();

document.querySelectorAll("[data-copy]").forEach(function (button) {
  button.addEventListener("click",async function () {
    const text=byId(button.dataset.copy).textContent;
    let copied=false;
    if(navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text);copied=true; } catch (_) { /* Selection fallback below. */ }
    }
    if(!copied) {
      const selection=window.getSelection();
      const range=document.createRange();
      range.selectNodeContents(byId(button.dataset.copy));
      selection.removeAllRanges();selection.addRange(range);
    }
    byId("copy-status").textContent=copied ? "代码已复制" : "代码已选中，可使用系统复制快捷键";
    button.textContent=copied ? "已复制 ✓" : "已选中";
    setTimeout(function () { button.textContent="复制"; },2000);
  });
});

const sectionLinks=Array.from(document.querySelectorAll("#section-nav a"));
function updateSectionNavigation() {
  let current="intro";
  document.querySelectorAll(".section-observe").forEach(function (section) {
    if(section.getBoundingClientRect().top<=140) current=section.id;
  });
  sectionLinks.forEach(function (link) {
    const active=link.hash==="#"+current;
    link.classList.toggle("active",active);
    if(active) link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");
  });
}
let navFrame=false;
window.addEventListener("scroll",function () {
  if(navFrame) return;
  navFrame=true;
  requestAnimationFrame(function () { updateSectionNavigation();navFrame=false; });
},{passive:true});
updateSectionNavigation();

const detailedMapFrame=byId("detailed-map-frame");
function setDetailedMapEnlarged(enlarged) {
  detailedMapFrame.classList.toggle("is-enlarged",enlarged);
  byId("detailed-map-fit").setAttribute("aria-pressed",String(!enlarged));
  byId("detailed-map-actual").setAttribute("aria-pressed",String(enlarged));
  byId("detailed-map-status").textContent=enlarged ? "已原地放大，可在图内滚动或用方向键移动。" : "已完整展开，向下阅读即可。";
  detailedMapFrame.scrollTop=0;
  detailedMapFrame.scrollLeft=0;
}
byId("detailed-map-fit").addEventListener("click",function () { setDetailedMapEnlarged(false); });
byId("detailed-map-actual").addEventListener("click",function () { setDetailedMapEnlarged(true); });
