import { mkdir, copyFile, readdir, lstat, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = path.resolve(root, 'web');
if (output !== path.join(root, 'web')) throw new Error('Unexpected output directory');
const stat = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (stat?.isSymbolicLink()) throw new Error('Refusing a linked output directory');
// web is this project's fixed, reproducible output; source stays in publication/.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of await readdir(path.join(root, 'publication'))) {
  await copyFile(path.join(root, 'publication', name), path.join(output, name));
}
for (const name of ['cases.json', 'results.json', 'pet-states.json']) {
  await copyFile(path.join(root, 'showcase', name), path.join(output, name));
}
await copyFile(path.join(root, 'assets/repository-summary.png'), path.join(output, 'repository-summary.png'));
console.log('Built public research in web/: no local runtime, upstream photos, or simulated chat.');
