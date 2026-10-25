// SPDX-License-Identifier: GPL-3.0-only
// Domain-neutral entity lookup. No atlas, browser or rendering dependencies.
const normalize = value => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Exact aliases may be ambiguous: resolve returns null rather than guessing. */
export function createEntityIndex(entities) {
  if (!Array.isArray(entities)) throw new TypeError('实体索引需要数组');
  const ids = new Set();
  const rows = entities.map((original, order) => {
    if (!original || typeof original.id !== 'string' || !original.id.trim() || typeof original.label !== 'string' || !original.label.trim()) throw new TypeError('实体需要 id 和 label');
    if (ids.has(original.id)) throw new TypeError(`实体 id 重复：${original.id}`);
    ids.add(original.id);
    if (original.aliases !== undefined && (!Array.isArray(original.aliases) || original.aliases.some(alias => typeof alias !== 'string' || !alias.trim()))) throw new TypeError('aliases 必须为非空字符串数组');
    const entity = freeze(structuredClone(original));
    return {entity, order, id:normalize(entity.id), label:normalize(entity.label), aliases:(entity.aliases || []).map(normalize), description:normalize(entity.description || '')};
  });
  function score(row, query) {
    if (row.id === query) return 100;
    if (row.label === query) return 95;
    if (row.aliases.includes(query)) return 90;
    if (row.label.startsWith(query) || row.id.startsWith(query)) return 70;
    if (row.aliases.some(alias => alias.startsWith(query))) return 65;
    if (row.label.includes(query) || row.id.includes(query) || row.aliases.some(alias => alias.includes(query))) return 45;
    return row.description.includes(query) ? 10 : 0;
  }
  function search(query, limit = 6) {
    if (typeof query !== 'string' || !Number.isInteger(limit) || limit < 0) throw new TypeError('搜索需要文字与非负整数条数');
    const normalized = normalize(query);
    if (!normalized) return rows.slice(0, limit).map(row => row.entity);
    return rows.map(row => ({row, score:score(row, normalized)})).filter(item => item.score > 0)
      .sort((a,b) => b.score - a.score || a.row.order - b.row.order).slice(0, limit).map(item => item.row.entity);
  }
  function resolve(input) {
    if (typeof input !== 'string') return null;
    const query = normalize(input);
    if (!query) return null;
    const exactId = rows.filter(row => row.id === query);
    if (exactId.length === 1) return exactId[0].entity;
    if (exactId.length > 1) return null;
    const matches = rows.filter(row => row.label === query || row.aliases.includes(query));
    return matches.length === 1 ? matches[0].entity : null;
  }
  return Object.freeze({search, resolve});
}
