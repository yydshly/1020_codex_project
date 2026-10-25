// Public project status, deliberately separate from vehicle and 3D runtime code.
// Keep chapter IDs aligned with exam-courses.js; progress:verify checks this.
export const PROGRESS_UPDATED = '2026-10-25';
export const PARKING_ENTRIES = [
  { id: 'beginner', title: '倒库新手引导', text: '先认车、库位与镜中参照，再一步一步操作。', action: '从这里开始' },
  { id: 'voice', title: '倒库语音示范', text: '两侧完整路线，分段看镜；可以暂停、接手与返回。', action: '看完整倒库' },
  { id: 'practice', title: '倒库语音跟练与复盘', text: '自己操作，听提示；结束后对照转向、回正和轨迹。', action: '进入跟练' },
  { id: 'judgment', title: '看镜判断回正', text: '只练一小段：自行判断回正时机，再看镜面对比。', action: '练回正判断' },
  { id: 'correction', title: '镜面辨认与纠偏', text: '辨认车身、库侧线和逼线趋势，亲手小幅修正。', action: '练辨认与纠偏' },
];
export const COURSE_DIRECTORY = [
  { id: 'subject2', name: '科目二', description: '五项教学示范与基础练习', chapters: [
    ['reverse-parking', '倒车入库 · 两侧完整路线'], ['hill-start', '坡道定点停车和起步'],
    ['side-parking', '侧方停车 · 入位与驶出'], ['curve-driving', '曲线行驶 · S 弯'], ['right-angle', '直角转弯'],
  ] },
  { id: 'subject3', name: '科目三', description: '道路技能 16 项 + 模拟灯光', chapters: [
    ['prepare', '上车准备'], ['lights', '模拟夜间灯光'], ['start', '起步'], ['straight', '直线行驶'],
    ['gears', '加减挡位操作'], ['lane-change', '变更车道'], ['intersection', '直行通过路口'],
    ['left-turn', '路口左转弯'], ['right-turn', '路口右转弯'], ['crosswalk', '通过人行横道线'],
    ['school', '通过学校区域'], ['bus', '通过公共汽车站'], ['meeting', '会车'], ['overtake', '超车'],
    ['uturn', '掉头'], ['night', '夜间行驶'], ['pull-over', '靠边停车与安全结束'],
  ] },
];
export const courseHref = (course, chapter, drive = false) => `./courses.html?${new URLSearchParams({ course, chapter, ...(drive ? { mode: 'drive' } : {}) })}`;
export const parkingHref = id => `./?entry=${encodeURIComponent(id)}`;
export const resolveParkingEntry = search => {
  const id = new URLSearchParams(search).get('entry');
  return PARKING_ENTRIES.some(entry => entry.id === id) ? id : null;
};
export const FEATURES = [
  { no: '01', title: '科二科三全项目示范', text: '22 章连续播放、目录跳转。每章先讲路线与完成要求，再进入车内分步观察和操作。', scope: '教学项目串联；未包含当地实测考线与安全文明理论题库。', href: './courses.html?course=all', link: '打开全量演示' },
  { no: '02', title: 'MiniMax 语音与自动观察', text: '191 段真实 MiniMax：121 段步骤提醒、22 段总讲解、原倒库 48 段。支持字幕、暂停和重听。', scope: '示范按讲解与动作阶段协调；整科手动驾驶的实时语音仍待补齐。', href: './courses.html?course=subject3&chapter=left-turn', link: '看观察示范' },
  { no: '03', title: '自己驾驶与观察', text: 'W / S 控速，A / D 转向，X 回中前轮；驾驶位、内外镜、前方与肩后盲区可主动切换。', scope: '挡位和离合自动配合；暂停时转向和踏板不响应，P 恢复。', href: './courses.html?course=subject3&chapter=straight&mode=drive', link: '接手直线练习' },
  { no: '04', title: '镜面、眼位与辨认', text: '实体左右外镜、内后视镜，支持按眼位推荐、手动调镜、撤销和同域教学放大。', scope: '工程参考；真实车型与眼位还未实测标定，放大不增加镜域。', href: parkingHref('correction'), link: '进入镜面专项' },
  { no: '05', title: '分开判断道路风险', text: '车身越界、轮胎压实线、登记目标碰撞，与外镜壳和支架擦碰分别检查。', scope: '并非全场景精细碰撞；观察视角访问不等于已经确认安全。', href: './courses.html?course=subject3&chapter=bus&mode=drive', link: '查看道路练习' },
  { no: '06', title: '目标、复盘与出错前重练', text: '每章有目标、错误记录与轨迹对照。复盘说明先改哪项、怎么做、回到哪里；看示范后可返回。', scope: '反馈以本模型为参照；当前练习保存在页面内存，刷新会丢失。', href: parkingHref('practice'), link: '体验倒库闭环' },
];
export const LEARNING_LOOP = [
  { title: '先看路线与要求', text: '全景认起点、目标区域和完整顺序；先知道怎样才算完成。' },
  { title: '看镜头里的变化', text: '听 MiniMax 提醒，看当前方向与参照；拿不准就暂停或重看本步。' },
  { title: '切回自己判断', text: '自己驾驶，主动看前方、镜面与盲区；按本章目标完成操作。' },
  { title: '对照错误与改法', text: '复盘先处理与重练位置对应的错误，再对照操作和轨迹。' },
  { title: '回到出错前再练', text: '恢复车辆和已有有效目标，保留看镜状态；确认后按 P 继续。' },
];
export const ROADMAP = [
  { id: 'live-voice', priority: 'next', category: '语音带练', title: '让整科语音跟上你的实际操作', status: '部分覆盖 · 待扩展',
    current: '原倒库已有实时带练；整科语音主要覆盖示范，接手后主要看文字反馈。',
    next: '按实际位置、速度、观察与操作触发简短提醒，避免重复、过期播报和语音堆积。',
    acceptance: '慢速、快速、偏离路线、暂停和重练时都不会播错步骤；紧急提醒能打断普通讲解。',
    dependency: '需补充事件触发规则与 MiniMax 文稿，再生成并验收语音。', href: parkingHref('practice'), link: '先体验已有倒库带练' },
  { id: 'observation-judgment', priority: 'next', category: '看懂再操作', title: '从“看过镜头”进到“认出风险”', status: '专项已有 · 整科待扩展',
    current: '倒库有镜面辨认和回正短练；整科主要记录观察方向、时序与位置，不能证明看懂交通。',
    next: '加入车身与库线辨认、逼线趋势、后方来车及可否变道的短判断，再让学员操作。',
    acceptance: '答错能指出画面里的具体参照；答对后用实际动作验证，而不是只记点击。',
    dependency: '需可控危险情境、对应可见性检查和正确答案依据。', href: parkingHref('judgment'), link: '体验已有看镜短练' },
  { id: 'causal-review', priority: 'next', category: '复盘说明', title: '把错误、镜面变化与操作结果放在一起', status: '基础复盘已有 · 待深化',
    current: '已有错误改法、轨迹与出错前重练；部分早晚反馈仍对照模型示范的位置。',
    next: '在错误时刻配对镜面画面、车身姿态、前轮变化与后续结果，解释这一次为何逼线。',
    acceptance: '不同起始姿态不会被同一个点位误导；明确区分前轮回中、车身平行和整体偏边。',
    dependency: '需动作事件配对、镜面快照与姿态因果校验。', href: parkingHref('practice'), link: '查看已有复盘入口' },
  { id: 'full-acceptance', priority: 'next', category: '验收覆盖', title: '逐章走完正常、错误和重练三条路径', status: '代表性流程已验 · 全章人工待补',
    current: '最近模型全量测试 492 项通过；已实际走通代表性流程，未人工驾驶完全部 22 章。',
    next: '补齐每章正常完成、常见误操作、从错误前恢复，以及全部语音的逐段试听。',
    acceptance: '22 章都有可追溯的结果和页面证据，并经过真实新手试用。',
    dependency: '需要人工验收时间和学员反馈；自动测试不能替代这一部分。', href: '#verification', link: '查看已验证范围' },
  { id: 'real-car', priority: 'later', category: '实车真实性', title: '按具体教练车校准眼位与镜面', status: '工程参考 · 待实测',
    current: '已建模眼位、实体镜面、镜壳与遮挡，尚未对照指定教练车实测。',
    next: '记录车型、座椅、驾驶位照片与镜角，对照车身占比、库线出现时机和距离感。',
    acceptance: '同一车型可重现实车的可见参照，并明确不同身高与镜位的适配范围。',
    dependency: '需要可使用的实车测量与影像；当前没有“通用最佳镜位”保证。', href: parkingHref('correction'), link: '查看现有调镜与辨认' },
  { id: 'c1-controls', priority: 'later', category: 'C1 操控', title: '补齐离合、挡位和坡起操作', status: '简化操控 · 尚未实现完整仿真',
    current: '基础驾驶自动配合挡位和离合，没有完整手动换挡、发动机熄火、后溜或踏板脚感。',
    next: '加入离合结合、换挡联锁、扭矩、坡起与溜车，再适配踏板或方向盘设备。',
    acceptance: '操作、仪表、车辆反应和语音一致；设备差异与教学辅助有清晰标识。',
    dependency: '需要动力模型、输入设备适配及教练校验。', href: './courses.html?course=subject2&chapter=hill-start&mode=drive', link: '体验当前简化坡起' },
  { id: 'saved-progress', priority: 'later', category: '学习记录', title: '保存练习与常错项，刷新后可续练', status: '尚未实现',
    current: '练习轨迹与返回快照在当前页面内存中；刷新、关闭页面后无法保证恢复。镜位设置另有本地保存。',
    next: '按章节保存练习摘要、关键错误与恢复点，支持查看、导出和自行清除。',
    acceptance: '刷新可恢复到明确的暂停位置；版本升级、存储不足时不会静默丢失或覆盖记录。',
    dependency: '需要存储结构、版本兼容、容量策略与恢复校验。', href: '#learning-loop', link: '了解当前页面内闭环' },
  { id: 'performance', priority: 'later', category: '设备体验', title: '优化首次加载与弱设备画面', status: '待优化与专项验收',
    current: '共享 3D 包约 710 kB，构建仍有体积提示；移动端和弱设备缺少全面实测。',
    next: '按需加载场景、提供画质档位、降低镜面渲染成本，完善触屏操作。',
    acceptance: '用目标设备实测首屏、帧率、镜面辨认和触控；画质下降不能隐藏训练参照。',
    dependency: '需要设备性能基线；体积只是指标，不能单凭它推断卡顿。', href: './courses.html?course=all', link: '体验当前版本' },
  { id: 'local-exams', priority: 'future', category: '课程扩展', title: '车型、城市与更多训练情境', status: '可扩展方向 · 未接入',
    current: '目前为通用 C1 项目教学串联，不是当地实测考线，也没有完整理论题库。',
    next: '将车型、场地、项目口令与规则拆成版本配置，再扩展随机交通情境及理论学习。',
    acceptance: '标明配置来源、适用时间与地区，不同配置分别验收；不能把教学模型包装成官方评分。',
    dependency: '需可靠资料、使用授权与逐版本校验；暂未承诺上线时间。', href: '#directory', link: '查看当前课程覆盖' },
];
export const MILESTONES = [
  ['倒库原型', '可控车辆、驾驶位与俯视、暂停轨迹回看。'],
  ['车内与镜面训练', '驾驶舱、实体后视镜、眼位与调镜、辨认和纠偏专项。'],
  ['示范与 MiniMax', '双侧倒库、分步提醒、语音带练、镜面对比与复盘。'],
  ['科二科三 22 章', '全景导览、逐步操作、整科连播、任意章节接手。'],
  ['风险与练习闭环', '分开判断越界、压线、碰撞与外镜擦碰，支持保存位置重练。'],
  ['新手流程复查', '协调语音与当前镜头；修复暂停选段、复盘优先项和返回状态。'],
];
