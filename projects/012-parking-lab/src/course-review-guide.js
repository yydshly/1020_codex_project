const finite = value => Number.isFinite(value);
const seconds = value => finite(value) ? `${value.toFixed(1)} 秒` : '记录位置';
const needsRetry = event => ['instruction', 'observation'].includes(event.type)
  || ['critical', 'danger', 'error'].includes(event.severity)
  || /collision|road-edge|parking-line|off-road|boundary/.test(event.type) && !/warning|proximity/.test(event.type);
const sides = {
  left: { name: '左', mirror: 'Q 看左外镜', blind: 'Z 看左后方', signal: 'J 开启左转向灯' },
  right: { name: '右', mirror: 'E 看右外镜', blind: 'B 看右后方', signal: 'L 开启右转向灯' },
};
const gazeActions = {
  forward: '按 C 看正前方，核对道路、行人和行驶方向。',
  'front-left': '按 1 扫视前左方，留意横向来车、行人和路口出口。',
  'front-right': '按 3 扫视前右方，留意横向来车、行人和路口出口。',
  left: '按 Q 看左外镜，辨认本车内缘与左后方道路。',
  right: '按 E 看右外镜，辨认本车内缘与右后方道路。',
  rear: '按 M 看车内后视镜，观察后方道路，再按 C 看回前方。',
  'left-back': '按 Z 转头查看左后方盲区，再按 C 看回前方。',
  'right-back': '按 B 转头查看右后方盲区，再按 C 看回前方。',
};

function correctionAction(error, session) {
  const id = error.id ?? '', side = sides[error.side] || sides[id.split(':').at(-1)];
  if (id.startsWith('lights:wrong:')) return `重练后保持车辆静止，按这道情境选灯：${error.detail || '核对当前灯光题的要求'}。选对后再处理下一题。`;
  if (id === 'lights:moving' || id === 'prepare:moving') return '重练后先核对车速；若车辆仍在移动，按 P 恢复控制后用空格制动至 0，再完成灯光或停车观察任务。教学暂停不等于已经制动停稳。';
  if (id.startsWith('front-conflict:') || id === 'crosswalk:restart-observation') return '重练后先按 1 看前左方、3 看前右方、C 看正前方，确认通行条件再继续驶入。外镜不能代替前方冲突观察，驶过以后补看不追认。';
  if (id.startsWith('zone-observation:')) return '回到有效观察窗口后，按 1、3、C 分别观察前左方、前右方和正前方；通过区域时继续留意变化。驶出后补看不会补记本次目标。';
  if (id.startsWith('speed-zone:')) return `重练后先确认前方，按 P 恢复控制后松开 W，用空格平稳减速，确认仪表车速降至本段教学目标${finite(session.speedZone?.limitKmh) ? `约 ${session.speedZone.limitKmh} km/h 以下` : '范围'}，再完整低速通过；短暂减速一下不算完成。`;
  if ((/^turn-(signal|observation):|^lane-entry:/.test(id)) && side) return `重练后先${side.signal}，${side.mirror}、${side.blind}，再按 C 看前方；确认空间后开始操作。${['lane-change', 'overtake'].includes(session.chapter?.id) ? '全车入道后补灯或补看，不能追认之前的变道。' : '操作后补灯或补看，不能追认之前的转向。'}`;
  if (id.startsWith('start:')) return '重练后可先按 J 开启左转向灯，Q 看左外镜、Z 看左后方，C 看前方；确认起步空间后，按 P 恢复控制，再轻按 W 平稳起步。';
  if (id === 'straight:large-steering') return '先核对仪表里的前轮转角；松开方向键会保留转角，暂停时按 X 不会回正。按 P 恢复控制后先用空格制动，并按 X 主动回正。X 回中的是前轮，车身方向仍要对照道路判断；再轻按 W，用 A / D 短按小幅修正，避免一直按住方向键。';
  if (error.type?.startsWith('mirror-')) return `先${side ? side.mirror : '查看发生擦碰一侧的外镜'}并看同侧窗外，辨认镜壳或支架与目标的间距；低速核对车头外摆，必要时停住重新选择路径。车身和轮胎没压线，也可能碰到外镜。`;
  if (/collision/.test(error.type ?? '')) return '重练后先查看前方、两侧与盲区，辨认发生接触风险的目标；按 P 恢复控制后先用空格制动，提早减速、留出空间。不要只凭示范轨迹继续驶向目标。';
  if (error.type === 'parking-line') return '先看同侧外镜里的车身窄条与库侧线，再换看另一镜；辨清车尾逼近哪一侧后才小幅纠偏，同时检查车头外摆。拿不准时保持停止，对照俯视再练。';
  if (error.type === 'opposing-line') return '重练后看远处道路，核对本侧车道与车头外摆，低速小幅修正；需要时按 X 回正，不要继续越过对向分隔实线。';
  if (['road-edge', 'boundary', 'off-road'].includes(error.type)) return '重练后先对照驾驶位和俯视，辨认道路边界、车头方向与两侧余量；低速小幅修正，避免继续沿原来的方向驶出道路。';
  return error.detail || '先看下方具体错误记录，再对照本项示范；确认本次需要改变的观察或操作后重练。';
}

function pendingAction(check, session) {
  if (!check) return '查看下方目标检查与本次轨迹，确认还有哪些动作没有记录。';
  if (check.gaze) return `${gazeActions[check.gaze] || check.label}${['school', 'bus'].includes(session.chapter?.id) ? '这些观察要在接近入口或区域内完成。' : ''}视角访问只记录观察动作，不代表已经确认安全。`;
  if (check.id === 'route') return '点击“继续完成目标”后仍保持暂停；先确认道路和车头方向，再按 P 继续，沿本项目道路驶向出口。';
  if (check.id === 'stable') return '对照前方道路和前轮方向，小幅修正并主动回正；若已经错过本项操作区，选择“从本项起点重练”。';
  if (check.id === 'slow-zone') return '须完整低速通过本章风险区域；如果从区域中途接手或已经绕离，建议“从本项起点重练”，不能只在终点减速补成完成。';
  if (check.id.startsWith('light:')) return `车辆保持静止，按当前情境选灯：${check.label}。`;
  return `继续练习时先完成“${check.label}”；若已错过操作位置，先看本项示范，再从本项起点重练。`;
}

/** A concise review prescription, grounded only in recorded events and the
 * actual saved retry point. It does not infer that an unvisited gaze was unsafe,
 * prescribe a steering side without geometry, or turn a model result into an
 * examination score. The first correctable event owns the retry snapshot. */
export function getCourseReviewGuidance(session) {
  const review = session?.review;
  if (!review) return null;
  const errors = review.errors ?? [], primary = errors.find(needsRetry), missing = (review.checks ?? []).find(check => !check.done);
  const summary = review.outcome === 'error' && errors.length > 1
    ? `已保留本次 ${errors.length} 条操作或风险记录；先处理下方优先纠正项，再从保存位置重练。` : review.summary;
  const snapshot = session.retrySnapshot || session.history?.[0], canRetry = Boolean(review.retryAvailable && snapshot?.driving);
  const retryButtonLabel = primary && session.retrySnapshot ? '从出错前重练'
    : snapshot?.elapsed > 0 ? `回到模拟 ${seconds(snapshot.elapsed)} 再练`
      : session.startProgress > 3 ? '返回本次接手位置' : '返回本次练习起点';
  if (review.outcome === 'complete') return {
    primaryId: null, canRetry, retryButtonLabel, summary, focusLabel: '接下来',
    focus: errors.length ? '本章基础目标已完成；本次仍有余量提醒，请对照下方记录。' : '本章基础目标已完成，可以回看轨迹或选择下一章。',
    action: '回想这次先看哪里、何时操作、何时回正；再练一次时自行判断。目标达成不等于已经掌握实车驾驶或通过考试。',
    retryPoint: `${canRetry ? `“${retryButtonLabel}”使用本轮保留的车辆快照；` : ''}想重做整章，请点“从本项起点重练”，也可选择下一章。`,
  };
  if (review.outcome === 'incomplete') return {
    primaryId: null, canRetry, retryButtonLabel, summary, focusLabel: '接下来',
    focus: missing ? `下一项先完成：${missing.label}。` : '还有目标未完成，本次不作操作错误推断。',
    action: pendingAction(missing, session),
    retryPoint: '点击“继续完成目标”会保留当前位置和已有进度，车辆仍暂停；暂停时可先观察或设灯，按 P 恢复控制后再执行转向和踏板操作。',
  };
  const error = primary || errors[0], light = session.chapter?.id === 'lights';
  const lightIndex = snapshot?.learning?.lightIndex;
  let retryPoint = !canRetry ? '没有可用的车辆快照，请点击“从本项起点重练”。'
    : light && Number.isInteger(lightIndex) ? `点击“从出错前重练”回到第 ${lightIndex + 1} 道灯光题，保留此前已完成题目；不需要重做整章。`
      : `点击“从出错前重练”回到本轮模拟第 ${seconds(snapshot.elapsed)}${snapshot.elapsed === 0 && session.startProgress > 3 ? '（本次接手位置，不是整章起点）' : ''}，保留此前有效目标，车辆仍暂停；暂停时可先观察或设灯，按 P 恢复控制后再执行转向和踏板操作。`;
  if (error?.detail?.includes('没有可恢复的接触前位置')) retryPoint = '当前记录没有确认可恢复的接触前位置，建议点击“从本项起点重练”；不要把返回快照当作安全位置保证。';
  return { primaryId: error?.id ?? null, canRetry, retryButtonLabel, summary, focusLabel: '先改哪项',
    focus: error ? `${light ? '' : `本轮模拟 ${seconds(error.elapsed)} · `}${error.title}${errors.filter(needsRetry).length > 1 ? '。先改这一项，其余错误保留在下方记录。' : ''}` : review.summary,
    action: error ? correctionAction(error, session) : '请先查看本次错误记录，再从本项起点练习。', retryPoint };
}
