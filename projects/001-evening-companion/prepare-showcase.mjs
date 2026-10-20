import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const cases = JSON.parse(await readFile(new URL('showcase/cases.json', root), 'utf8'));
const references = [...new Set(['SKILL.md', 'references/core-os.md', 'references/conversation.md', 'references/voice-and-presence.md', 'references/privacy.md', ...cases.flatMap(c => c.sources)])];
const files = [];
for (const path of references) {
  const text = await readFile(new URL(`upstream/${path}`, root), 'utf8');
  const installed = await readFile(new URL(`.agents/skills/cyber-xiaowan/${path}`, root), 'utf8');
  if (text.replace(/\r\n/g, '\n') !== installed.replace(/\r\n/g, '\n')) throw Error(`Skill differs: ${path}`);
  files.push({ path, text, sha256: createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex') });
}
await mkdir(new URL('.runtime/showcase/', root), { recursive: true });
const prompt = `这是原版 cyber-xiaowan Skill 的实际能力演示。请应用下列同一上游版本的原始 Skill 与参考文件，按场景使用相关规则。已提供全文，不需要也不要执行工具或读取文件。不要使用此前任何演示脚本或仓库合成示例的回复。
接下来是6个彼此独立、完全虚构的测试案例，不是实际用户资料，不能把某一例的事实带到其他案例。每例直接回答原问题，通常80至220个中文字；用户明确指定字数的按指定执行。资料整理例可适当加长。不要宣告模式或自评，不要解释你在测试。输出JSON，results内按输入顺序给出id和answer，answer保留完整实际答复。

${files.map(f => `=== 原版文件 ${f.path} ===\n${f.text}`).join('\n\n')}

=== 测试问题 ===
${JSON.stringify(cases.map(({ id, question }) => ({ id, question })), null, 2)}`;
const schema = { type: 'object', additionalProperties: false, required: ['results'], properties: { results: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'answer'], properties: { id: { type: 'string' }, answer: { type: 'string' } } } } } };
await writeFile(new URL('.runtime/showcase/prompt.txt', root), prompt);
await writeFile(new URL('.runtime/showcase/schema.json', root), JSON.stringify(schema));
await writeFile(new URL('.runtime/showcase/sources.json', root), JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 })), null, 2));
console.log(`Prepared ${cases.length} test cases with ${files.length} unchanged original instruction files.`);
