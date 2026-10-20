import { STORAGE_KEY, initialState, restoreState, newId, extractMemory, upsertMemory, demoReply, dueReminders, makeReminder } from './core.mjs';
const $ = id => document.getElementById(id);
let state;
let storageAvailable = true;
try { state = restoreState(localStorage.getItem(STORAGE_KEY)); } catch { state = initialState(); storageAvailable = false; }
let configured = false, busy = false, requestController = null, toastTimer, editId, confirmation;
let lastActivity = Date.now();
const greeting = '你来啦。\n把今天的疲惫先放一放，给自己留一点不必赶路的时间。\n我在，想说什么都可以。';
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { storageAvailable = false; toast('浏览器无法保存数据；当前记录只会保留到页面关闭。'); }
}
function toast(text, duration = 4500) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, duration);
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function showView(view) {
  if (!['home', 'memories', 'moments', 'settings'].includes(view)) view = 'home';
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `view-${view}`);
  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
    if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('page-label').textContent = { home: '陪伴空间', memories: '我们的记忆', moments: '主动关心', settings: '偏好设置' }[view];
  if (view === 'memories') renderMemories();
  if (view === 'moments') renderReminders();
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.view; }));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
function renderMessages() {
  const container = $('messages');
  container.replaceChildren();
  container.append(element('div', 'chat-date', '在这里，慢慢来就好'));
  const messages = state.messages.length ? state.messages : [{ role: 'assistant', content: greeting, kind: 'welcome' }];
  for (const message of messages) {
    const row = element('div', `message ${message.role}${message.kind === 'care' ? ' proactive' : ''}`);
    const label = element('div', 'message-label', message.role === 'user' ? '你' : '晚晚');
    if (message.kind === 'care') label.append(element('span', 'notice-tag', '主动关心'));
    if (message.kind === 'demo') label.append(element('span', 'notice-tag', '演示回应'));
    if (message.kind === 'memory') label.append(element('span', 'notice-tag', '记忆已保存'));
    row.append(label, element('div', 'message-bubble', message.content));
    container.append(row);
  }
  if (busy) {
    const row = element('div', 'message typing');
    row.append(element('div', 'message-label', '晚晚'), element('div', 'message-bubble', configured ? '正在想怎么回应你…' : '· · ·'));
    container.append(row);
  }
  container.scrollTop = container.scrollHeight;
}
function say(text, kind = 'demo') {
  state.messages.push({ id: newId(), role: 'assistant', content: text, kind, time: Date.now() });
  state.messages = state.messages.slice(-100);
  save(); renderMessages();
  $('mini-note').textContent = text.length > 45 ? `${text.slice(0, 45)}…` : text;
  if (state.voice && !state.quiet && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'zh-CN'; speech.rate = 0.95;
    speech.onerror = () => toast('朗读未能播放，可以继续使用文字聊天。');
    speechSynthesis.speak(speech);
  }
}
function setBusy(value) {
  busy = value;
  $('send-button').disabled = value;
  $('chat-input').disabled = value;
  $('mood-label').textContent = value ? '认真听你说' : '安静陪着你';
  $('composer-note').textContent = value ? '正在回应，请稍等…' : 'Enter 发送 · Shift + Enter 换行';
  renderMessages();
}
async function send(input) {
  input = input.trim();
  if (!input || busy) return;
  lastActivity = Date.now();
  showView('home');
  if (!state.messages.length) state.messages.push({ id: newId(), role: 'assistant', content: greeting, kind: 'welcome', time: Date.now() });
  state.messages.push({ id: newId(), role: 'user', content: input.slice(0, 2000), time: Date.now() });
  $('chat-input').value = '';
  save(); setBusy(true);
  const memory = extractMemory(input);
  try {
    if (memory) {
      upsertMemory(state.memories, memory);
      save(); renderMemories();
      await new Promise(resolve => setTimeout(resolve, 350));
      say(`记下啦：${memory.text}。\n下次也会记得。你可以在「我们的记忆」里修改或删除。`, 'memory');
    } else if (configured) {
      requestController = new AbortController();
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.messages.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })), memories: state.memories.map(x => x.text) }),
        signal: requestController.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '模型连接失败。');
      say(data.text, 'model');
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
      say(demoReply(input, state.memories), 'demo');
    }
  } catch (error) {
    if (error.name !== 'AbortError') say(`这次没能连接上模型。${error.message}\n你可以稍后重新发送。`, 'error');
  } finally {
    requestController = null; setBusy(false); $('chat-input').focus();
  }
}
$('chat-form').addEventListener('submit', e => { e.preventDefault(); send($('chat-input').value); });
$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('chat-input').value); }
});
document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click', () => send(el.dataset.prompt)));
$('try-memory').addEventListener('click', () => send('记住：我喜欢雨天和热茶'));
function renderMemories() {
  $('memory-count').textContent = state.memories.length;
  const list = $('memory-list'); list.replaceChildren();
  if (!state.memories.length) {
    const empty = element('div', 'empty-state', '♡ 记忆本，等你写下第一页');
    empty.append(element('small', '', '试着告诉我一个偏好，或一个你喜欢的称呼。'));
    list.append(empty); return;
  }
  for (const memory of [...state.memories].reverse()) {
    const card = element('article', 'memory-card');
    card.append(element('div', 'memory-category', memory.category || '你说过的事'), element('p', '', memory.text));
    const bottom = element('div', 'memory-bottom');
    bottom.append(element('small', '', `你告诉我的 · ${new Date(memory.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`));
    const edit = element('button', '', '修改');
    edit.setAttribute('aria-label', `修改记忆：${memory.text}`);
    edit.onclick = () => { editId = memory.id; $('edit-memory').value = memory.text; $('edit-dialog').showModal(); };
    const remove = element('button', '', '删除');
    remove.setAttribute('aria-label', `删除记忆：${memory.text}`);
    remove.onclick = () => { state.memories = state.memories.filter(x => x.id !== memory.id); save(); renderMemories(); toast('这条记忆已删除。聊天原文仍可单独清除。'); };
    bottom.append(edit, remove); card.append(bottom); list.append(card);
  }
}
$('memory-form').onsubmit = e => {
  e.preventDefault(); const text = $('memory-input').value.trim();
  if (!text) return;
  upsertMemory(state.memories, { key: `note:${text}`, text, category: '你说过的事' });
  save(); renderMemories(); $('memory-input').value = ''; toast('已记下来，刷新后也会保留。');
};
$('edit-form').onsubmit = e => {
  e.preventDefault(); const memory = state.memories.find(x => x.id === editId), text = $('edit-memory').value.trim();
  if (!memory || !text) return;
  memory.text = text; memory.updatedAt = Date.now();
  if (memory.key !== 'name') memory.key = `note:${text}`;
  save(); renderMemories(); $('edit-dialog').close(); toast('记忆已更新。');
};
$('cancel-edit').onclick = () => $('edit-dialog').close();
function renderReminders() {
  const list = $('reminder-list'); list.replaceChildren();
  if (!state.reminders.length) { list.append(element('div', 'empty-state', '✧ 还没有安排，下一个小小的期待。')); return; }
  for (const reminder of [...state.reminders].reverse()) {
    const row = element('div', 'reminder-item');
    row.append(element('span', 'reminder-symbol', reminder.status === 'done' ? '✓' : '✧'));
    const body = element('div', 'reminder-body');
    body.append(element('strong', '', reminder.text));
    const remaining = Math.max(0, Math.ceil((reminder.due - Date.now()) / 1000));
    const detail = reminder.status === 'done' ? (reminder.skipped ? '已过期，未打扰你' : '已经告诉你啦') : remaining === 0 ? (state.quiet ? '已到时间 · 免打扰结束后送达' : '即将送达') : `还有 ${remaining >= 60 ? `${Math.ceil(remaining / 60)} 分钟` : `${remaining} 秒`}`;
    body.append(element('small', '', detail));
    const remove = element('button', '', reminder.status === 'done' ? '移除' : '取消');
    remove.onclick = () => { state.reminders = state.reminders.filter(x => x.id !== reminder.id); save(); renderReminders(); };
    row.append(body, remove); list.append(row);
  }
}
function schedule(text, seconds) {
  if (state.reminders.filter(x => x.status === 'pending').length >= 20) return toast('已经有 20 条待提醒事项，先处理一些再安排吧。');
  state.reminders.push(makeReminder(text, seconds)); save(); renderReminders();
  toast(`${seconds} 秒后，晚晚会来找你。${state.quiet ? '免打扰已开启，届时会暂缓。' : '保持页面打开即可。'}`);
}
$('try-care').onclick = () => schedule('忙完这一小段，就喝口水吧。我在这里，不用急着回复。', 10);
$('reminder-form').onsubmit = e => {
  e.preventDefault(); const text = $('reminder-text').value.trim();
  if (!text) return;
  schedule(text, Number($('reminder-delay').value)); $('reminder-text').value = '';
};
function tick() {
  if (!busy) {
    const due = dueReminders(state);
    let delivered = false;
    for (const reminder of due) {
      reminder.status = 'done';
      if (Date.now() - reminder.due > 86400000) { reminder.skipped = true; save(); continue; }
      say(reminder.text, 'care'); delivered = true;
    }
    if (delivered) { state.lastCare = Date.now(); save(); toast('晚晚给你留了一句关心，去「陪伴空间」看看吧。', 6000); }
    if (state.autoCare && !state.quiet && !document.hidden && Date.now() - lastActivity > 180000 && Date.now() - state.lastCare > 1800000) {
      state.lastCare = Date.now(); save(); say('已经安静一会儿了。要不要让肩膀松一松？我在，忙你的就好。', 'care');
    }
  }
  if (!$('view-moments').hidden) renderReminders();
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
for (const name of ['pointerdown', 'keydown']) document.addEventListener(name, () => { lastActivity = Date.now(); }, { passive: true });
function renderSettings() {
  $('quiet-toggle').setAttribute('aria-pressed', String(state.quiet));
  $('quiet-text').textContent = state.quiet ? '免打扰已开启' : '开启免打扰';
  $('voice-toggle').setAttribute('aria-checked', String(state.voice));
  $('auto-care-toggle').setAttribute('aria-checked', String(state.autoCare));
}
$('quiet-toggle').onclick = () => {
  state.quiet = !state.quiet; save(); renderSettings();
  if (state.quiet) window.speechSynthesis?.cancel();
  toast(state.quiet ? '安静陪着你。主动提醒会暂缓。' : '免打扰已关闭。'); tick();
};
$('voice-toggle').onclick = () => {
  if (!('speechSynthesis' in window)) return toast('这个浏览器暂不支持朗读。');
  state.voice = !state.voice; save(); renderSettings();
  if (!state.voice) speechSynthesis.cancel();
  toast(state.voice ? '之后的回应会尝试朗读。' : '已关闭朗读。');
};
$('auto-care-toggle').onclick = () => {
  state.autoCare = !state.autoCare; lastActivity = Date.now(); save(); renderSettings();
  toast(state.autoCare ? '已开启：闲置 3 分钟后问候，至少间隔 30 分钟。' : '已关闭自动问候，已安排的提醒仍会保留。');
};
$('scene-toggle').onclick = () => {
  const night = document.querySelector('.room-card').classList.toggle('night');
  $('scene-toggle').textContent = night ? '☀' : '☾';
  $('room-greeting').replaceChildren(document.createTextNode(night ? '夜深了，慢一点。' : '今天也辛苦啦。'), document.createElement('br'), document.createTextNode(night ? '这里有一盏灯。' : '要不要，坐一会儿？'));
};
$('pet-button').onclick = () => {
  $('heart-pop').classList.remove('show'); void $('heart-pop').offsetWidth; $('heart-pop').classList.add('show');
  $('mood-label').textContent = '收到你的招呼啦 ♡';
  toast('晚晚：嗨，给你留了一杯热茶。');
  setTimeout(() => $('mood-label').textContent = busy ? '认真听你说' : '安静陪着你', 3000);
};
$('mini-toggle').onclick = () => { $('mini-pet').hidden = !$('mini-pet').hidden; };
$('close-mini').onclick = () => $('mini-pet').hidden = true;
$('mini-chat').onclick = () => { location.hash = 'home'; showView('home'); $('chat-input').focus(); $('chat-input').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
let drag = null;
$('mini-handle').addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  const rect = $('mini-pet').getBoundingClientRect(); drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  $('mini-handle').setPointerCapture(e.pointerId);
});
$('mini-handle').addEventListener('pointermove', e => {
  if (!drag) return;
  const pet = $('mini-pet');
  pet.style.left = `${Math.max(0, Math.min(innerWidth - pet.offsetWidth, e.clientX - drag.x))}px`;
  pet.style.top = `${Math.max(0, Math.min(innerHeight - pet.offsetHeight, e.clientY - drag.y))}px`;
  pet.style.right = 'auto'; pet.style.bottom = 'auto';
});
for (const event of ['pointerup', 'pointercancel']) $('mini-handle').addEventListener(event, () => drag = null);
function confirmAction(title, description, action) {
  $('confirm-title').textContent = title; $('confirm-text').textContent = description; confirmation = action; $('confirm-dialog').showModal();
}
$('cancel-confirm').onclick = () => { confirmation = null; $('confirm-dialog').close(); };
$('accept-confirm').onclick = () => { $('confirm-dialog').close(); confirmation?.(); confirmation = null; };
$('clear-chat').onclick = () => {
  if (busy) return toast('请等本轮回应结束，再清除聊天。');
  confirmAction('清空聊天记录？', '这会清除当前设备上的对话。已经保存的记忆和提醒会保留。', () => { state.messages = []; save(); renderMessages(); toast('聊天已清空。'); });
};
$('reset-data').onclick = () => {
  if (busy) return toast('请等本轮回应结束，再清除数据。');
  confirmAction('清除全部本地数据？', '聊天、记忆和提醒都会删除，无法恢复。需要保留的话，请先导出记录。', () => {
    window.speechSynthesis?.cancel(); state = initialState(); save(); renderMessages(); renderMemories(); renderReminders(); renderSettings(); toast('本地数据已清除。');
  });
};
$('export-data').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `evening-companion-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('记录已导出，请妥善保存。');
};
async function checkModel() {
  try {
    const response = await fetch('/api/config'); if (!response.ok) return;
    const config = await response.json(); configured = config.configured === true;
    if (configured) {
      $('mode-label').textContent = '模型已连接 · 自由聊天';
      $('connection-tag').textContent = '模型已连接';
      $('connection-detail').textContent = `已配置模型：${config.model}。模型是否可用，以实际发送结果为准。`;
      $('chat-footnote').textContent = '聊天与相关记忆将发送到配置的模型服务';
    }
  } catch { /* Static preview intentionally runs without a model server. */ }
}
$('today').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
if (!('speechSynthesis' in window)) { $('voice-toggle').disabled = true; $('voice-description').textContent = '当前浏览器不支持朗读，文字聊天仍可正常使用。'; }
renderMessages(); renderMemories(); renderSettings(); showView(location.hash.slice(1)); checkModel(); tick();
if (!storageAvailable) toast('当前浏览器无法持久保存数据。', 8000);
