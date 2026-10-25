// Short, cue-bound teaching scripts. These are demonstrations of an operation
// sequence, not fixed sight points or a question bank for a local test centre.
const teach = (id, text, kind, target, value, label) => ({ id, text,
  operation: { kind, target, value, label } });

const PLANS = {
  'reverse-parking': { subject: 2, steps: [
    teach('ready', '先看两侧和后方，踩稳制动，停稳后挂倒挡。', 'gear', 'gear', 'R', '停稳后挂倒挡'),
    teach('straight_back', '先认右镜车身和地面，直线慢倒，等库角进入镜面。', 'steering', 'steering', 'center', '前轮回中，直线慢倒'),
    teach('right_turn', '右镜到本车参照时向右打方向，留意左前方外摆。', 'steering', 'steering', 'right', '低速倒车，向右转向'),
    teach('approach_alignment', '交替看两镜，车身快与库线平行，准备主动回轮。', 'steering', 'steering', 'right', '观察快直，准备回轮'),
    teach('right_center', '车身快直时向左回轮至前轮回中，继续核对两侧。', 'steering', 'steering', 'center', '向左回轮至前轮回中'),
    teach('right_stop', '两侧都要看，确认全车入库，踩离合和制动停稳。', 'pedal', 'brake', 'down', '全车入库后停稳'),
    teach('transfer', '停稳换一挡，先看出口，再驶出换边，留意车头。', 'gear', 'gear', '1', '停稳换一挡后驶出'),
    teach('far_ready', '看另一端控制线，前轮越线后停稳，准备挂倒挡。', 'pedal', 'brake', 'down', '另一端越线后停稳'),
    teach('left_straight_back', '挂倒挡后直线慢倒，左镜找库角，兼顾右镜。', 'gear', 'gear', 'R', '挂倒挡，左镜找参照'),
    teach('left_turn', '左镜到本车参照时向左打方向，留意右前方外摆。', 'steering', 'steering', 'left', '低速倒车，向左转向'),
    teach('left_center', '车身快直时向右回轮至前轮回中，再核对两侧。', 'steering', 'steering', 'center', '向右回轮至前轮回中'),
    teach('left_stop', '确认车身平行且全车入库，踩离合和制动停稳。', 'pedal', 'brake', 'down', '全车入库后停稳'),
    teach('return', '停稳换一挡，观察出口，缓慢驶出回到起始端。', 'gear', 'gear', '1', '观察出口，换一挡驶出'),
    teach('finish', '看控制线和车头位置，回到起始端后平稳停住。', 'pedal', 'brake', 'down', '回到起始端后停稳'),
  ] },
  'hill-start': { subject: 2, steps: [
    teach('approach', '先看前方和右边线，一挡低速上坡，稳住车速。', 'gear', 'gear', '1', '一挡低速上坡'),
    teach('prepare_stop', '按本车停车参照判断位置，右脚准备平稳制动。', 'pedal', 'brake', 'ready', '接近停车位置，准备制动'),
    teach('hold', '踩离合和制动停稳，拉起驻车制动，防止后溜。', 'pedal', 'brake', 'down', '制动停稳并可靠驻车'),
    teach('bite', '先看前方，稳住车，缓抬离合建立驱动力再松驻车。', 'pedal', 'clutch', 'bite', '建立驱动力后解除驻车'),
    teach('leave', '确认车辆向前走稳，再平顺抬离合，继续看前方。', 'pedal', 'clutch', 'up', '车辆前进后平顺接合离合'),
  ] },
  'side-parking': { subject: 2, steps: [
    teach('ready', '右镜认清车位，兼顾两侧和后方，停稳挂倒挡。', 'gear', 'gear', 'R', '观察后挂倒挡'),
    teach('right_turn', '看右镜车尾和库边，低速向右打方向，兼顾左前方。', 'steering', 'steering', 'right', '车尾向右侧车位转入'),
    teach('countersteer', '交替看两镜，向左回轮并反向转向，让车身逐渐摆直。', 'steering', 'steering', 'left', '向左回轮，再反向调整姿态'),
    teach('entry_center', '车身快与库边平行，向右回轮至前轮回中，继续慢倒。', 'steering', 'steering', 'center', '向右回轮，前轮回中后慢倒'),
    teach('park', '全车入位后回中停稳，打左灯，再看左镜与左后方。', 'light', 'turn-signal', 'left', '库内停稳，打左转向灯'),
    teach('exit', '确认左后方和车头安全，一挡缓行，向左驶出车位。', 'steering', 'steering', 'left', '观察安全后向左驶出'),
    teach('exit_countersteer', '看车头和两侧余量，向右回轮修直，逐步对准道路。', 'steering', 'steering', 'right', '驶出中段，向右回轮修直'),
    teach('exit_center', '车身快与道路平行，及时回中，顺直后关闭左灯。', 'steering', 'steering', 'center', '驶出顺直，前轮回中后关灯'),
  ] },
  'curve-driving': { subject: 2, steps: [
    teach('enter', '先看第一弯的走向，低速入弯，兼顾两侧边线。', 'observe', 'road', 'ahead', '看道路走向，稳定低速'),
    teach('first_curve', '看前方弯道和内侧余量，适量向右转，别只盯车头。', 'steering', 'steering', 'right', '随第一弯适量向右转向'),
    teach('change_curve', '先看下一弯，逐步回中，再随左弯平顺转向。', 'steering', 'steering', 'left', '逐步回轮，再随左弯转向'),
    teach('exit', '看出口和两侧余量，确认后部通过后，逐渐回正。', 'steering', 'steering', 'center', '驶出弯道时逐渐回正'),
  ] },
  'right-angle': { subject: 2, steps: [
    teach('approach', '看出口和两侧边线，低速接近这个左转直角。', 'observe', 'road', 'ahead', '看清左转出口与两侧余量'),
    teach('prepare_turn', '按本车标定参照找转向位置，稳住低速再转向。', 'pedal', 'clutch', 'bite', '稳定低速，准备转向'),
    teach('left_turn', '向左转向，兼顾左后部与内侧线、右前方的空间。', 'steering', 'steering', 'left', '低速左转，核对内后外前空间'),
    teach('center', '看出口方向，车身快顺直时回轮，前轮回中后驶出。', 'steering', 'steering', 'center', '沿出口主动回正'),
  ] },
  prepare: { subject: 3, steps: [
    teach('walkaround', '先绕车观察轮胎和周围，确认车前车后没有障碍。', 'observe', 'check', 'walkaround', '绕车观察车辆与周边'),
    teach('open_door', '开门前先看后方来车，确认安全，再小幅开门上车。', 'prepare', 'door', 'open', '观察后开门上车'),
    teach('close_door', '坐稳后关好车门，确认车门已经关严。', 'prepare', 'door', 'close', '关严车门'),
    teach('seat', '先调座椅和靠背，让离合能踩到底，坐姿稳定。', 'prepare', 'seat', 'adjust', '调整座椅和靠背'),
    teach('mirrors', '保持坐姿再调镜，车身留少量，兼顾后方与地面。', 'prepare', 'mirrors', 'adjust', '按当前坐姿调整后视镜'),
    teach('belt', '拉出安全带扣牢，理顺带身，确认没有扭转。', 'prepare', 'belt', 'fasten', '系牢并理顺安全带'),
    teach('check', '最后看挡位、制动和仪表，确认状态后等待起步。', 'observe', 'check', 'controls', '检查挡位、制动与仪表'),
  ] },
  lights: { subject: 3, steps: [
    teach('wait', '车辆保持停稳，先听完整口令，再操作灯光。', 'light', 'headlight', 'off', '停稳听口令，灯光初始关闭'),
    teach('low', '夜间有路灯且照明良好，打开近光灯。', 'light', 'headlight', 'low', '照明良好，使用近光'),
    teach('high', '照明不良，确认不影响他人后，使用远光灯。', 'light', 'headlight', 'high', '无眩目风险时使用远光'),
    teach('meeting', '夜间会车，及时切换近光，避免照射对方。', 'light', 'headlight', 'low', '会车改用近光'),
    teach('flash', '夜间通过急弯、坡路等，交替使用远近光示意。', 'light', 'headlight', 'flash', '交替远近光示意'),
    teach('following', '同方向近距离跟车，使用近光灯，避免眩目。', 'light', 'headlight', 'low', '近距离跟车使用近光'),
    teach('hazard', '故障难以移动，开启示廓灯和危险报警闪光灯。', 'light', 'hazard', 'hazard', '开启示廓灯和危险报警闪光灯'),
    teach('off', '模拟灯光结束，按口令关闭灯光并复位。', 'light', 'headlight', 'off', '关闭灯光并复位'),
  ] },
  start: { subject: 3, steps: [
    teach('ready', '先看挡位、制动和仪表，踩稳制动，准备挂一挡。', 'gear', 'gear', '1', '踩离合，准备挂一挡'),
    teach('signal', '先打左灯，再看左镜、左后方和前方，确认空间。', 'light', 'turn-signal', 'left', '左转向灯，观察后方与前方'),
    teach('move', '看前方，一挡缓抬离合，建立驱动力后解除驻车。', 'pedal', 'clutch', 'bite', '协调离合和加速，平稳起步'),
    teach('center', '进入车道后看前方，车身顺直、前轮回中，再关灯。', 'light', 'turn-signal', 'off', '顺直进入车道后关闭转向灯'),
  ] },
  straight: { subject: 3, steps: [
    teach('far_reference', '把视线放远，先看道路走向，稳住方向和车速。', 'steering', 'steering', 'center', '远看道路，稳住方向'),
    teach('scan', '远近交替观察，顺带扫看后视镜，保持跟车距离。', 'observe', 'mirrors', 'both', '远近与后视镜交替观察'),
    teach('correct', '出现偏移才小幅修方向，偏移趋势减弱就及时回中。', 'steering', 'steering', 'center', '小幅修正后及时回中'),
  ] },
  gears: { subject: 3, steps: [
    teach('first', '视线保持看前方，一挡平稳加速，不低头看挡位。', 'gear', 'gear', '1', '一挡平稳加速'),
    teach('second', '先松油门，离合踩到底，挂二挡后平顺抬离合。', 'gear', 'gear', '2', '松油、踩离合，换二挡'),
    teach('third', '路况允许再松油踩离合，换三挡，平顺接合再加速。', 'gear', 'gear', '3', '松油、踩离合，换三挡'),
    teach('down_second', '先看前方减速，再踩离合换二挡，别低头看挡。', 'gear', 'gear', '2', '先减速，再踩离合减至二挡'),
    teach('down_first', '低速路段先减速，踩离合换一挡，避免高挡拖行。', 'gear', 'gear', '1', '先减速，再踩离合减至一挡'),
  ] },
  'lane-change': { subject: 3, steps: [
    teach('left_signal', '打左灯，看左镜和左后方，再确认前方及目标车道。', 'light', 'turn-signal', 'left', '左灯，观察目标车道'),
    teach('left_move', '确认左侧安全，小幅向左转向，一次只变一条车道。', 'steering', 'steering', 'left', '小幅向左变道'),
    teach('left_countersteer', '看前方和车道位置，向右回轮修直，逐步减小斜角。', 'steering', 'steering', 'right', '左变道中段，向右回轮修直'),
    teach('left_center', '车身快与车道平行，及时回中，顺直后关闭左灯。', 'steering', 'steering', 'center', '在目标车道回正并关灯'),
    teach('right_signal', '先打右灯，看右镜和右后方，安全后再准备返回。', 'light', 'turn-signal', 'right', '右灯，重新观察后再返回'),
    teach('right_move', '再次确认右侧安全，小幅向右转向，平顺返回车道。', 'steering', 'steering', 'right', '确认安全后向右返回车道'),
    teach('right_countersteer', '看前方和车道位置，向左回轮修直，别继续向右偏。', 'steering', 'steering', 'left', '右变道中段，向左回轮修直'),
    teach('right_center', '车身快与车道平行，前轮及时回中，顺直后关右灯。', 'steering', 'steering', 'center', '返回车道后回正并关灯'),
  ] },
  intersection: { subject: 3, steps: [
    teach('approach', '提前看信号和路口两侧，松油减速，准备制动。', 'pedal', 'brake', 'ready', '识别路口，提前减速'),
    teach('check', '看行人、横向车和出口，允许通行且出口畅通再进。', 'observe', 'road', 'intersection', '确认通行条件与出口空间'),
    teach('cross', '看行驶方向，持续扫看两侧冲突，平稳通过不抢行。', 'observe', 'road', 'both', '保持观察，平稳通过路口'),
    teach('leave', '驶离路口后再看前方车流，按路况平顺恢复车速。', 'pedal', 'throttle', 'gradual', '驶离后按路况平顺加速'),
  ] },
  'left-turn': { subject: 3, steps: [
    teach('signal', '打左灯并减速，先看信号、车道和对向来车。', 'light', 'turn-signal', 'left', '左灯，减速准备左转'),
    teach('yield', '再看行人、对向来车和出口，冲突解除后再转。', 'observe', 'road', 'intersection', '确认让行条件与出口空间'),
    teach('turn', '看正确出口，低速向左转向，别切入对向车道。', 'steering', 'steering', 'left', '看出口，低速向左转向'),
    teach('center', '车身快顺出口时回轮，顺直后关灯，继续看前方。', 'steering', 'steering', 'center', '沿出口回正，顺直后关灯'),
  ] },
  'right-turn': { subject: 3, steps: [
    teach('signal', '打右灯并减速，先看信号和右侧交通。', 'light', 'turn-signal', 'right', '右灯，减速准备右转'),
    teach('blind_spot', '看右镜，再核对右后方盲区，有行人和骑行者先让。', 'observe', 'mirrors', 'right', '右镜与右侧盲区观察让行'),
    teach('turn', '确认安全，低速向右转，兼顾右后部与出口空间。', 'steering', 'steering', 'right', '低速右转，留意内侧后部'),
    teach('center', '看出口方向，车身快顺直时回轮，顺直后关闭右灯。', 'steering', 'steering', 'center', '沿出口回正并关灯'),
  ] },
  crosswalk: { subject: 3, steps: [
    teach('approach', '先看斑马线两侧和遮挡处，松油减速，准备制动。', 'pedal', 'brake', 'ready', '识别人行横道，提前减速'),
    teach('stop', '有行人通过，在停止线前平稳制动，停稳让行。', 'pedal', 'brake', 'down', '停止线前平稳停住让行'),
    teach('wait', '保持停稳，继续看另一侧和遮挡处，不催促不绕行。', 'pedal', 'brake', 'down', '保持制动，持续观察让行'),
    teach('restart', '确认行人安全通过、前方畅通，一挡平稳重新起步。', 'pedal', 'clutch', 'bite', '重新确认后平稳起步'),
  ] },
  school: { subject: 3, steps: [
    teach('approach', '发现学校标志，提前松油减速，观察路侧环境。', 'pedal', 'brake', 'ready', '学校区域前提前减速'),
    teach('slow', '看儿童、接送车辆和遮挡处，保持低速，准备停住。', 'pedal', 'brake', 'ready', '低速观察遮挡处，准备制动'),
    teach('scan', '持续看两侧和前方，有人进入通行路径就停车让行。', 'observe', 'road', 'both', '持续观察，必要时停车让行'),
    teach('leave', '确认驶离学校区域且道路安全，再逐步恢复车速。', 'pedal', 'throttle', 'gradual', '安全驶离后逐步恢复车速'),
  ] },
  bus: { subject: 3, steps: [
    teach('approach', '看到公交站，提前减速，看站台、公交车和乘客。', 'pedal', 'brake', 'ready', '接近公交站前提前减速'),
    teach('occlusion', '重点看公交车前后遮挡，留出空间，随时准备制动。', 'pedal', 'brake', 'ready', '看车前后遮挡，准备制动'),
    teach('pass', '保持低速，持续看乘客和车头盲区，不抢行。', 'observe', 'road', 'occlusion', '低速通过，观察车头盲区'),
    teach('leave', '确认驶离站点、前方畅通，再平顺恢复车速。', 'pedal', 'throttle', 'gradual', '驶离站点后平顺加速'),
  ] },
  meeting: { subject: 3, steps: [
    teach('approach', '看对向车和道路宽度，提前减速，保持本车道。', 'pedal', 'brake', 'ready', '提前减速，保持本车道'),
    teach('space', '看本侧路边和横向间距，稳住方向，不抢道。', 'steering', 'steering', 'center', '保持车道与安全横向空间'),
    teach('pass', '会车时继续看前方和路侧，平稳通过，不猛打方向。', 'steering', 'steering', 'center', '稳住方向，平稳完成会车'),
  ] },
  overtake: { subject: 3, steps: [
    teach('left_signal', '确认允许超车，打左灯，看左镜、左后方和前方。', 'light', 'turn-signal', 'left', '确认允许后打左灯并观察'),
    teach('left_move', '确认目标车道安全，小幅向左变道，留足横向空间。', 'steering', 'steering', 'left', '平顺向左变道超车'),
    teach('left_countersteer', '看前方和车道位置，向右回轮修直，保持横向空间。', 'steering', 'steering', 'right', '左变道中段，向右回轮修直'),
    teach('pass', '进入左侧车道后回中，看右镜拉开距离，别急着回切。', 'steering', 'steering', 'center', '回中超越，先拉开安全距离'),
    teach('right_signal', '先打右灯，看右镜和右后方，距离足够再准备返回。', 'light', 'turn-signal', 'right', '右灯，确认返回空间'),
    teach('right_move', '确认右侧和被超车辆间距足够，再平顺向右返回。', 'steering', 'steering', 'right', '留足安全距离后向右返回'),
    teach('right_countersteer', '看前方车道位置，向左回轮修直，别继续向右偏。', 'steering', 'steering', 'left', '右变道中段，向左回轮修直'),
    teach('center', '回到原车道后及时回中，车身顺直，再关闭右灯。', 'steering', 'steering', 'center', '返回后回正，顺直后关灯'),
  ] },
  uturn: { subject: 3, steps: [
    teach('signal', '确认此处允许掉头，打左灯减速，观察对向交通。', 'light', 'turn-signal', 'left', '确认允许掉头后打左灯减速'),
    teach('check', '再看行人、骑行者和对向车，确认安全再进入开口。', 'observe', 'road', 'intersection', '确认开口与对向交通安全'),
    teach('turn', '低速向左转，兼顾车头外摆和后部空间，不抢行。', 'steering', 'steering', 'left', '低速向左掉头，留足空间'),
    teach('center', '看正确返回车道，逐步回轮，车身顺直后关闭左灯。', 'steering', 'steering', 'center', '进入返回车道后回正关灯'),
  ] },
  night: { subject: 3, steps: [
    teach('high', '照明不良，先确认不会眩目，再按需要使用远光。', 'light', 'headlight', 'high', '无眩目风险时按需使用远光'),
    teach('low', '发现对向车，提前切到近光，视线兼顾路侧。', 'light', 'headlight', 'low', '会车前提前切换近光'),
    teach('flash', '前方路段需要示意，先减速观察，再交替远近光。', 'light', 'headlight', 'flash', '减速观察，交替远近光示意'),
    teach('continue', '切回近光，在看得清且能停住的距离内平稳行驶。', 'light', 'headlight', 'low', '近光行驶，保持可停车视距'),
  ] },
  'pull-over': { subject: 3, steps: [
    teach('choose', '先看右镜、右后方和路边，选择允许停车的位置。', 'observe', 'mirrors', 'right', '观察右侧并选择停车位置'),
    teach('signal', '打右灯，减速观察行人和骑行者，确认安全再靠边。', 'light', 'turn-signal', 'right', '右灯，减速观察后靠边'),
    teach('right_move', '看右镜与路缘，确认右后方安全后，小幅向右靠边。', 'steering', 'steering', 'right', '确认安全后小幅向右靠边'),
    teach('countersteer', '看路缘与车身位置，向左回轮修直，减小车身斜角。', 'steering', 'steering', 'left', '向左回轮，使车身逐步顺直'),
    teach('center', '车身快与路缘平行，及时回中，保持余量准备停稳。', 'steering', 'steering', 'center', '沿路缘回中，留足停车余量'),
    teach('stop', '看路缘和车身位置，踩离合与制动，平稳停住。', 'pedal', 'brake', 'down', '核对路边距离，平稳停住'),
    teach('secure', '车辆停稳，拉起驻车制动，挂空挡，关闭转向灯。', 'gear', 'gear', 'N', '驻车制动、空挡、关闭转向灯'),
    teach('leave', '先看左镜和左后方，确认安全，再解安全带开门。', 'prepare', 'door', 'open', '观察后解带开门安全下车'),
  ] },
};

const keyFor = (chapterId, plan, step) => `coursecue${plan.subject}_${chapterId.replaceAll('-', '_')}_${step.id}`;

export const COURSE_CUE_NARRATION = Object.fromEntries(Object.entries(PLANS).flatMap(([chapterId, plan]) =>
  plan.steps.map(step => [keyFor(chapterId, plan, step), {
    title: step.operation.label, text: step.text, action: step.operation.label,
  }])));

/** Bind the stable script to the chapter's actual cue times, including speed-independent seeks. */
export function getCourseTeachingSteps(chapter) {
  const plan = PLANS[chapter?.id];
  if (!plan) return [];
  if (chapter.cues?.length !== plan.steps.length) {
    throw new Error(`Teaching cues for ${chapter.id}: expected ${plan.steps.length}, received ${chapter.cues?.length ?? 0}`);
  }
  return chapter.cues.map((cue, index) => {
    const step = plan.steps[index];
    return { id: `${chapter.id}:${step.id}`, t: cue.t, title: cue.title, look: cue.look,
      action: step.operation.label, narrationKey: keyFor(chapter.id, plan, step),
      operation: { ...step.operation } };
  });
}
