const film = document.querySelector('#film');
const playButton = document.querySelector('#play-film');
const errorBox = document.querySelector('#video-error');
function showError() { errorBox.hidden = false; playButton.textContent = '重试播放'; }
async function playFilm(time) {
  errorBox.hidden = true;
  if (typeof time === 'number') film.currentTime = time;
  try { await film.play(); } catch (error) {
    if (error.name !== 'AbortError') showError();
  }
}
playButton.addEventListener('click', () => {
  if (film.error) film.load();
  if (film.paused) playFilm(); else film.pause();
});
film.addEventListener('play', () => { playButton.textContent = 'Ⅱ 暂停原片'; errorBox.hidden = true; });
film.addEventListener('pause', () => { playButton.textContent = film.ended ? '↻ 重播原片' : '▶ 继续播放'; });
film.addEventListener('ended', () => { playButton.textContent = '↻ 重播原片'; });
film.addEventListener('error', showError);
document.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#screening').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  playFilm(Number(button.dataset.time));
}));
const steps = [
  ['角色定制身份：先认识它是谁。','人确定角色的外形、声音、性格、渴望、弱点与关系；模型辅助整理角色档案和参考图。后续故事沿用这些设定，并保留人物经历。'],
  ['人把握情绪：决定为什么要讲。','人提供真实感受和生活细节，判断表达是否真诚。例如：很想被关心，却不愿主动开口。人不必独自写完整个故事，但要判断什么值得保留。'],
  ['模型辅助故事：让情绪进入行动。','模型把情绪意图展开成情境、冲突、选择和变化，提出多个故事版本；人筛选与修改，检查角色反应是否可信，而不是只追求戏剧性。'],
  ['模型辅助分镜：把内心变成可见细节。','将故事拆成景别、动作、环境、时长与声音，再制作带有同一角色的分镜图。用停顿、眼神和小动作承载情绪，并检查角色与场景的连续性。'],
  ['图生视频：实现动态表达。','以分镜图为视觉基础，结合动作与镜头要求生成动态片段。重点验证指定角色、指定动作和跨镜头一致性。本项目的阿灯短片已实际采用这条路线；原帖是否采用图生视频尚未核实。'],
  ['剪辑与验收：让故事完整抵达观众。','组合动态镜头、配音与字幕，调整节奏。人判断情绪是否自然、角色选择是否成立，再检查异常动作、字幕同步与音量；技术完成不等于故事动人。']
];
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.step);
  document.querySelectorAll('[data-step]').forEach(el => {el.classList.toggle('active', el === button);el.setAttribute('aria-pressed', String(el === button));});
  document.querySelector('#step-count').textContent = `0${index + 1} / 06`;
  document.querySelector('#step-title').textContent = steps[index][0];
  document.querySelector('#step-text').textContent = steps[index][1];
}));
const extensions = [
  ['LANGUAGE / 语言','一个故事，\n多种语言表达。','把文案、配音和字幕作为可替换模块，尝试中文科普或面向不同受众的本地化版本。','术语表、发音检查、字幕断句，以及随语速变化重新调整镜头时长。','同一脚本制作两种语言的小样，人工核对语义、发音和字幕同步。'],
  ['IDENTITY / 角色','带着过去的经历，\n走进下一个故事。','固定外形、声音和性格，并记录人物的关系、选择与成长。让角色身份可辨认，让故事经历逐步赋予它独特性。','角色档案、视觉参考、关系与经历记录，以及跨镜头一致性检查。模型续写时需要这些上下文。','制作两集相连的小样：既核对外形一致，也检查第二集的行为是否回应第一集的经历。'],
  ['FORMAT / 画幅','同一个主题，\n适配不同观看方式。','在横屏版本之外规划竖屏与方形构图，让关键人物和字幕在不同画幅中都保持清晰。','构图安全区、字幕重排、镜头重新生成或重构；不能只依赖机械裁切。','分别检查 16:9 与 9:16 成片，确保人物、关键道具和字幕不被裁断。'],
  ['PRODUCTION / 流程','每一次生成，\n都知道哪里值得改。','保留主题、分镜、素材版本、成本和质量检查结果，让返工可定位、成功经验可复用。','本次已保存任务、失败、素材版本与费用记录；自动排队、批量管理和审核界面仍待扩展。','沿用已保存的任务与素材，验证单镜头返修能否复用其余合格镜头，并核对成本记录。']
];
document.querySelectorAll('[data-extension]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-extension]').forEach(el => {el.classList.toggle('active',el === button);el.setAttribute('aria-pressed',String(el === button));});
  const content = extensions[Number(button.dataset.extension)];
  ['label','title','text','needs','check'].forEach((key,index) => {document.querySelector(`#extension-${key}`).textContent = content[index];});
}));
