// SPDX-License-Identifier: GPL-3.0-only
// Mission-specific place names for the two authored teaching landscapes.
// This is a small content adapter, not measured geography or a generic locator.
// New themes or changed landforms require their own regions to be reviewed.
const finite=Number.isFinite;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const result=(label,detail)=>({label,detail});

function nearbyNote(nearest){
  if(!object(nearest)||typeof nearest.label!=='string'||!nearest.label.trim()||nearest.label.length>80||!finite(nearest.distance)||nearest.distance<0)return '';
  const label=nearest.label.trim();
  if(nearest.distance<=55)return `邻近模型标记：${label}，可对照画面确认。`;
  if(nearest.distance<=160)return `最近的标记是${label}，仍有一段距离。`;
  return '';
}

function canyonRegion({x,y,z}){
  if(x>=100&&x<=245&&z>=120&&z<=300)return {name:'东侧谷道回弯',highName:'东侧峡谷区',low:'近底坡脚上方',detail:'沿下方谷道观察回弯，再抬高视线辨认岩壁与高台。'};
  if(x>=110&&x<=255&&z>=-155&&z<120)return {name:'东侧谷道',highName:'东侧峡谷区',low:'近底通道上方',detail:'先对照较低的泥沙槽道和两侧抬高的岩面，再寻找水样站标记。'};
  if(x>=-20&&x<=140&&z>=-270&&z<-115)return {name:'北侧谷道回弯',highName:'北侧峡谷区',low:'近底槽道上方',detail:'这里是谷道转弯的一段，可比较槽道、岸侧岩面与采水站的相对位置。'};
  if(x>=-190&&x<=-75&&z>=-25&&z<=140)return {name:'西侧峡壁工作带',highName:'西侧峡谷区',low:'近底岩面上方',detail:'把附近工作台面、继续升高的岩壁与较低的谷道放在一起观察。'};
  if(x>=-155&&x<=-20&&z>=-140&&z<0&&y>-120)return {name:'西侧岩壁台阶区',highName:'西侧峡谷区',low:'岩石台面附近',detail:'先辨认抬升的岩石台面，再对照其与低处谷道的高低关系。'};
  if(x>=-15&&x<=105&&z>=120&&z<=235&&y>-95)return {name:'内侧岩石台阶区',highName:'内侧峡谷区',low:'岩石台面附近',detail:'此处分区对应较高的岩面，谷道与群落标记需要分别核对位置。'};
  if(x>=-310&&x<=-145&&z>=130&&z<=320)return {name:'西侧入口谷道',highName:'西侧入口区',low:'近底航行',detail:'沿较低的谷道慢行，对照通道两旁逐渐升高的岩面。'};
  return {name:'峡谷岩面区',highName:'峡谷调查区',low:'近底岩面上方',detail:'先辨认附近岩面、台阶与较低的谷道，再对照站点标记。'};
}

/**
 * Describe an authored model position without steering or changing the camera.
 * pilotState: {position:{x,y,z}, clearance?, nearest?:{label,distance}}.
 * No depth conversion, measured chemistry, flow direction or ecological cause
 * is inferred from the coordinates or a nearest-station name.
 */
export function describeEnvironmentPosition(missionId,pilotState){
  if(!object(pilotState)||!object(pilotState.position)||!['x','y','z'].every(key=>finite(pilotState.position[key])))return result('位置待确认','等待有效的模型位置后，再说明所在区域。');
  if(!['canyon','vents'].includes(missionId))return result('教学场景','当前主题尚未配置位置分区，请对照场景与站点标记。');
  const p=pilotState.position,edge=Math.max(Math.abs(p.x),Math.abs(p.z));
  if(edge>=500)return result(missionId==='canyon'?'峡谷探索区外缘':'火山地形探索区外缘','此处远离主要调查站点，可对照标记返回调查区域。');
  const clearance=finite(pilotState.clearance)&&pilotState.clearance>=0?pilotState.clearance:null;
  const high=clearance!==null&&clearance>=120||(missionId==='canyon'?p.y>160:p.y>70);
  const nearBottom=clearance!==null&&clearance<=40;
  const note=nearbyNote(pilotState.nearest);
  if(missionId==='canyon'){
    const region=canyonRegion(p);
    if(high)return result(`${region.highName} · 离底较高`,'先下移视线寻找海床与岩壁，再核对离底仪表和站点方向。');
    if(clearance===null)return result(`${region.highName} · 模型位置`,'可对照岩壁、台阶和谷道；当前离底关系尚未确认。');
    // Low y is only a model-space guard against calling a high terrace the
    // valley floor. It is never presented as a water-depth measurement.
    const lowRelation=nearBottom&&(p.y<=-120||region.low==='岩石台面附近');
    const label=lowRelation?`${region.name} · ${region.low}`:nearBottom?`${region.highName} · 近底岩面上方`:`${region.highName} · 离底观察`;
    return result(label,[region.detail,note].filter(Boolean).join(' '));
  }
  if(high)return result('火山岩脊调查区 · 离底较高','先对照下方开阔岩面与低矮岩脊，再寻找喷口调查点的标记。');
  if(clearance===null)return result('开放火山地形 · 模型位置','可对照岩面、低脊与裂隙带；当前离底关系尚未确认。');
  let label='开放火山地形',detail='可对照较平缓的岩面、低矮岩脊与岩石裂隙，辨认调查点的相对位置。';
  if(nearBottom&&Math.hypot(p.x+49.6,p.z-18.6)<=85&&p.y>=-95&&p.y<=35){label='喷口群附近';detail='可寻找固体矿物烟囱与上方羽流，并分别观察它们的形态。';}
  else if(nearBottom&&Math.hypot(p.x-192.2,p.z+49.6)<=75){label='低火山脊附近';detail='对照抬高的低脊与较开阔岩面，再寻找喷口和背景水样站的方向。';}
  else if(nearBottom&&Math.abs(p.z+p.x*.75+20)<=45&&Math.abs(p.x)<280&&Math.abs(p.z)<280){label='开放岩面 · 裂隙带附近';detail='沿岩面辨认裂隙与低脊；地下热液循环需要另看原理说明。';}
  const relation=nearBottom?'近底观察':'离底观察';
  return result(`${label} · ${relation}`,[detail,note].filter(Boolean).join(' '));
}
