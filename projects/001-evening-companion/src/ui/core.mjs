export const STORAGE_KEY = 'evening-companion-v1';
export const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function initialState() {
  return { version: 1, messages: [], memories: [], reminders: [], quiet: false, voice: false, autoCare: false, lastCare: 0 };
}
export function restoreState(raw) {
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1) return initialState();
    const s = initialState();
    s.messages = Array.isArray(data.messages) ? data.messages.filter(x => x && ['user', 'assistant'].includes(x.role) && typeof x.content === 'string').slice(-100).map(x => ({ ...x, content: x.content.slice(0, 8000) })) : [];
    s.memories = Array.isArray(data.memories) ? data.memories.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.key === 'string').slice(0, 100).map(x => ({ ...x, text: x.text.slice(0, 500) })) : [];
    s.reminders = Array.isArray(data.reminders) ? data.reminders.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string' && Number.isFinite(x.due) && ['pending', 'done'].includes(x.status)).slice(-100) : [];
    for (const k of ['quiet', 'voice', 'autoCare']) s[k] = data[k] === true;
    s.lastCare = Number.isFinite(data.lastCare) ? data.lastCare : 0;
    return s;
  } catch { return initialState(); }
}
export function extractMemory(input) {
  const text = input.trim();
  // Explicit statements only. Questions and negations must not become facts.
  if (/[?？]/.test(text) || /(?:什么|吗|么|呢)[。！!]*$/.test(text) || /^(别|不要|不用|不必)记/.test(text)) return null;
  const explicit = text.match(/^(?:请)?(?:帮我)?记住[：:,，\s]*(.+)$/s);
  if (explicit) {
    const value = explicit[1].trim().slice(0, 500);
    const name = value.match(/^(?:以后)?(?:请)?叫我(.{1,20})$/);
    return { key: name ? 'name' : `note:${value}`, text: name ? `称呼：${name[1]}` : value, category: name ? '关于你' : '你说过的事' };
  }
  const name = text.match(/^(?:以后)?(?:请)?叫我([^，。！!?？]{1,20})[。！!]?$/);
  if (name) return { key: 'name', text: `称呼：${name[1]}`, category: '关于你' };
  const like = text.match(/^我(?:最)?喜欢([^，。！？?]{1,80})[。！!]?$/);
  if (like) return { key: `like:${like[1]}`, text: `喜欢${like[1]}`, category: '小偏好' };
  return null;
}
export function upsertMemory(memories, item, now = Date.now()) {
  const existing = memories.find(x => x.key === item.key);
  if (existing) Object.assign(existing, item, { updatedAt: now });
  else memories.push({ ...item, id: newId(), createdAt: now, updatedAt: now });
}
export function demoReply(input, memories) {
  if (/记得|记忆|知道我|喜欢什么|我叫什么/.test(input)) {
    return memories.length ? `我记着这些：\n${memories.map(x => `· ${x.text}`).join('\n')}\n你可以在「我们的记忆」里修改；如果我记错了，随时纠正我。` : '我们的记忆本还是空白的。可以告诉我「叫我小林」，或者「记住：我喜欢雨天」。刷新之后，这些也会留下。';
  }
  if (/累|烦|难过|焦虑|压力|不开心/.test(input)) return '那就先在这里歇一会儿。现在不用急着把一切处理好。\n愿意的话，挑最让你累的那件事说说；不想分析，我们也可以只待一会儿。';
  if (/面试|工作|项目|学习/.test(input)) return '听起来这件事占了你不少心思。我们可以先挑出眼下最需要解决的一小件事。\n当前是离线演示；接入模型后，我才能围绕你的具体情况继续聊。';
  if (/你好|嗨|hello|在吗/i.test(input)) return '在呢。窗边的位置给你留好了。\n今天想聊一点日常，还是让我记住一件关于你的小事？';
  if (/晚安|睡觉/.test(input)) return '晚安。今天没做完的事，可以留给明天。希望你今晚睡得安稳。';
  if (/能做|能力|介绍|怎么用/.test(input)) return '现在可以试试：\n① 说「记住：我喜欢雨天」，再问我记得什么。\n② 在「主动关心」里设一个提醒。\n③ 刷新页面，看看记忆是不是还在。\n我是离线演示模式，自由对话需要连接模型。';
  return '我收到啦。这个版本目前用规则演示回应，还不能真正理解所有话题。\n你可以试试「今天有点累」「你还记得什么」，或用「记住：……」留下一条记忆。连接模型后就能自由聊了。';
}
export function dueReminders(state, now = Date.now()) {
  if (state.quiet) return [];
  return state.reminders.filter(x => x.status === 'pending' && x.due <= now);
}
export function makeReminder(text, seconds, now = Date.now()) {
  if (!text.trim() || !Number.isFinite(seconds) || seconds < 5 || seconds > 86400) throw new Error('提醒时间需在 5 秒至 24 小时之间');
  return { id: newId(), text: text.trim().slice(0, 200), due: now + seconds * 1000, status: 'pending', createdAt: now };
}
