// SPDX-License-Identifier: GPL-3.0-only
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const source=await read('notes/archive-source-research.json'),exploration=await read('notes/archive-exploration.json');
const direction=await read('notes/research-direction.json');
await mkdir(new URL('web/research/',root),{recursive:true});
await writeFile(new URL('web/research/content.json',root),JSON.stringify({schema:'abyss-research-content/v1',updatedOn:'2026-10-25',source,exploration,direction},null,2)+'\n');
console.log(JSON.stringify({passed:true,sourceCapabilities:source.source.capabilities.length,sourcePatterns:source.source.patterns.length,journey:exploration.journey.length,modules:exploration.reusableModules.length,prompts:exploration.promptTemplates.length}));
