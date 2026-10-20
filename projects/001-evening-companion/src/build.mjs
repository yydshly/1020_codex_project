import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('.runtime/prototype-web/', root), { recursive: true });
for (const name of ['index.html', 'style.css', 'app.mjs', 'core.mjs', 'character.svg']) {
  await copyFile(new URL(`src/ui/${name}`, root), new URL(`.runtime/prototype-web/${name}`, root));
}
console.log('Historical prototype built in .runtime/prototype-web/. Not a research publication.');
