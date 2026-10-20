const $ = id => document.getElementById(id);
const petNotes = {
  idle: { scene: '正面微笑，抬起一只手打招呼；画面带有“待机”文字与小芽图案。', meaning: '在线、放松、可以开始互动。', trigger: '默认初始状态；也接收临时反馈结束后的回落。' },
  think: { scene: '手托下巴，视线朝侧上方；“思考”文字配思考脸与问号。', meaning: '正在梳理问题、考虑不同解释。', trigger: '单击轮换或用 CLI 指定 think；不等于模型正在推理的实时检测。' },
  work: { scene: '身体前倾，目光看向电脑，双手放在键盘位置；“干活”文字配工具图案。', meaning: '任务执行中，让用户知道正在处理。', trigger: '单击 / CLI；已接入的宿主开始事件也可触发。' },
  clap: { scene: '微笑并举起双手，定格在鼓掌姿势；下方是“鼓掌”文字与拍手图案。', meaning: '完成、赞许、庆祝小进展。', trigger: '双击人物，或单击 / CLI；已接入的宿主完成事件也可触发。' },
  question: { scene: '头部微倾、眉头蹙起，手指靠近下巴；“疑问”文字配单片眼镜脸和问号。', meaning: '有疑点、需要核对或进一步确认。', trigger: '单击 / CLI；通知桥把错误、失败事件映射到此状态。' },
  heart: { scene: '面带笑容，双手做指尖比心；画面有“比心”文字和大小爱心。', meaning: '亲近、喜欢、积极回应。', trigger: '单击轮换或用 CLI 指定 heart；没有自动识别好感的机制。' },
  sleep: { scene: '闭眼微笑，双手合拢垫在脸侧；“打盹”文字配睡脸与 Zzz。', meaning: '安静休息、暂时没有活动。', trigger: '单击 / CLI；可选会话监视器在无会话或长时间无更新时也会触发。' }
};
function showPet(name, config) {
  const state = config.states[name], note = petNotes[name];
  const url = `http://127.0.0.1:4318/${state.image}`;
  $('gallery-image').hidden = false;
  $('image-unavailable').hidden = true;
  $('gallery-image').src = url;
  $('gallery-image').alt = `${state.label}原图：${note.scene}`;
  $('image-original').href = url;
  $('image-credit').textContent = name === 'clap' ? '上游原图 · 作者实拍' : '上游原图 · 同一人设的 AI 生成动作图';
  $('pet-category').textContent = state.transient ? '临时反馈' : '持续状态';
  $('pet-code').textContent = name;
  $('pet-title').textContent = `${state.emoji} ${state.label}`;
  $('pet-scene').textContent = note.scene;
  $('pet-meaning').textContent = note.meaning;
  $('pet-duration').textContent = state.transient ? `${state.durationMs / 1000} 秒后回到待机（${state.returnTo}）。` : '保持至下一次状态切换，没有自动回落倒计时。';
  $('pet-trigger').textContent = note.trigger;
  $('pet-lines').replaceChildren(...state.lines.map(line => {
    const li = document.createElement('li'); li.textContent = line; return li;
  }));
  document.querySelectorAll('.pet-thumbnail').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === name)));
}
async function loadPetGallery() {
  try {
    const response = await fetch('./pet-states.json');
    if (!response.ok) throw new Error('配置读取失败');
    const config = await response.json();
    for (const [name, state] of Object.entries(config.states)) {
      const button = document.createElement('button'); button.className = 'pet-thumbnail'; button.dataset.state = name;
      button.setAttribute('aria-label', `查看${state.label}画面`);
      const image = document.createElement('img'); image.src = `http://127.0.0.1:4318/${state.image}`; image.alt = state.label;
      image.onerror = () => { image.hidden = true; button.classList.add('image-missing'); };
      const title = document.createElement('strong'); title.textContent = state.label;
      const detail = document.createElement('span'); detail.textContent = state.transient ? `${state.durationMs / 1000} 秒反馈` : '持续状态';
      button.append(image, title, detail); button.onclick = () => showPet(name, config); $('pet-thumbnails').append(button);
    }
    $('gallery-image').onerror = () => { $('gallery-image').hidden = true; $('image-unavailable').hidden = false; };
    showPet(config.defaultState, config);
  } catch (error) {
    $('pet-title').textContent = `图鉴暂不可用：${error.message}`;
  }
}
await loadPetGallery();
const observations = {
  listen: '遵守了“不复盘、不提行动建议”的要求，先回应投入落空的感受，再留出倾诉空间。这证明本例遵守了对话意图，不代表心理咨询能力。',
  clarify: '将“回复延迟”与“不尊重”分开；用回复期限、失约记录和交付影响作为下一步判断依据，没有擅自判定对方的动机。',
  decision: '明确建议现在不答应，依据是目标、预算和责任边界不清；给出先约定条件或缩成有偿小单的做法。',
  editing: '直接交付了短文，保留20条反馈、3类、人工核对和交付慢这些素材，没有编造节省时间或销量增长。',
  business: '优先检查100次点击到20人完成的流失，并将3条反馈当作线索；明确指出现有数据不能证明价格高。',
  intake: '保留了用户陈述、解释与未知的区分，并列出3项资料缺口。但它把明确虚构的案例称为“已有真实业务样本”，措辞不严谨；实际使用时仍需人工核对。'
};
let index = 0, cases, results, meta;
function showCase(next) {
  index = Math.max(0, Math.min(cases.length - 1, next));
  const c = cases[index], output = results.results.find(r => r.id === c.id);
  $('case-mode').textContent = c.mode;
  $('case-title').textContent = c.title;
  $('question').textContent = c.question;
  $('answer').textContent = output.answer;
  $('observation').textContent = observations[c.id];
  $('criterion').textContent = `核对点：${c.check}`;
  $('case-position').textContent = `${index + 1} / ${cases.length}`;
  $('previous').disabled = index === 0; $('next').disabled = index === cases.length - 1;
  $('source-list').replaceChildren();
  for (const source of c.sources) {
    const li = document.createElement('li'), a = document.createElement('a');
    a.textContent = source; a.href = `https://github.com/cyberxiaowan/cyber-xiaowan/blob/${meta.commit}/${source}`; a.target = '_blank'; a.rel = 'noreferrer';
    li.append(a); $('source-list').append(li);
  }
  document.querySelectorAll('.case-tab').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
}
try {
  [cases, results, meta] = await Promise.all(['cases.json', 'results.json', 'meta.json'].map(async path => {
    const response = await fetch(`./${path}`);
    if (!response.ok) throw new Error('实测数据尚未就绪');
    return response.json();
  }));
  cases.forEach((c, i) => {
    const button = document.createElement('button'); button.className = 'case-tab';
    const number = document.createElement('span'); number.className = 'number'; number.textContent = c.icon;
    const content = document.createElement('span'), title = document.createElement('strong'), subtitle = document.createElement('small');
    title.textContent = c.title; subtitle.textContent = c.mode; content.append(title, subtitle);
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗';
    button.append(number, content, arrow); button.onclick = () => showCase(i); $('case-tabs').append(button);
  });
  $('previous').onclick = () => showCase(index - 1); $('next').onclick = () => showCase(index + 1);
  $('provenance').textContent = `研究日期：${meta.date} · 版本 2.2.0`;
  showCase(0);
} catch (error) {
  $('case-title').textContent = '实测记录读取失败';
  $('answer').textContent = `${error.message}。请通过本地 HTTP 服务打开本页。`;
}
