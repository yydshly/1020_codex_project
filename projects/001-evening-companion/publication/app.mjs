const $ = id => document.getElementById(id);
const meanings = {
  idle: '挥手微笑 · 在线陪伴',
  think: '托腮思索 · 梳理问题',
  work: '面向电脑 · 正在处理',
  clap: '举手鼓掌 · 完成与庆祝',
  question: '歪头疑惑 · 核对与确认',
  heart: '双手比心 · 喜欢与回应',
  sleep: '闭眼休息 · 安静与打盹'
};
async function read(name) {
  const response = await fetch(`./${name}`);
  if (!response.ok) throw new Error(`${name} 读取失败`);
  return response.json();
}
try {
  const config = await read('pet-states.json');
  for (const [key, state] of Object.entries(config.states)) {
    const card = document.createElement('article');
    const emoji = document.createElement('span'); emoji.className = 'state-emoji'; emoji.textContent = state.emoji;
    const title = document.createElement('h3'); title.textContent = state.label;
    const meaning = document.createElement('p'); meaning.textContent = meanings[key];
    const duration = document.createElement('small'); duration.textContent = state.transient ? `${state.durationMs / 1000} 秒后回待机` : '持续至下次切换';
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = '查看 3 句原版台词';
    const lines = document.createElement('ul');
    for (const line of state.lines) {
      const li = document.createElement('li'); li.textContent = line; lines.append(li);
    }
    details.append(summary, lines); card.append(emoji, title, meaning, duration, details); $('state-cards').append(card);
  }
} catch (error) { $('state-cards').textContent = error.message; }
try {
  const [cases, output] = await Promise.all([read('cases.json'), read('results.json')]);
  for (const item of cases) {
    const details = document.createElement('details'); details.className = 'case';
    const summary = document.createElement('summary'); summary.textContent = `${item.icon} / ${item.title}`;
    const input = document.createElement('p'); input.className = 'question'; input.textContent = item.question;
    const label = document.createElement('small'); label.textContent = '原版 Skill + 宿主模型的实际输出';
    const answer = document.createElement('div'); answer.className = 'answer'; answer.textContent = output.results.find(row => row.id === item.id).answer;
    const check = document.createElement('p'); check.className = 'check'; check.textContent = `核对点：${item.check}`;
    details.append(summary, input, label, answer, check); $('case-list').append(details);
  }
} catch (error) { $('case-list').textContent = error.message; }
