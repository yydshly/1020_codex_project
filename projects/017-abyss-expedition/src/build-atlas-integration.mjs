// SPDX-License-Identifier: GPL-3.0-only
// Rebuild the local historical-map integration from reviewed, explicit inputs.
// No downloads, source modifications, directory traversal or recursive copying.
import {readFile, writeFile, mkdir, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.resolve(project, '../..');
const sourceProject = path.join(workspace, 'projects/016-dongpo-journey');
const sourceWeb = path.join(sourceProject, 'web');
const destination = path.join(project, 'web/integrations/atlas');
const integrationAssets = path.join(project, 'web/integration-assets');
const commit = '53059f1c7fed305807b19365857a5f135daf3ac6';
const upstreamPaths = [
  'js/app.js', 'js/atlas_boot.js', 'js/atlas_snapshots.js', 'js/china_geo_data.js',
  'js/i18n_dict.js', 'js/lore_data.js', 'js/map_data.js', 'js/zh_hant.js', 'css/style.css',
  'assets/favicon.svg', 'assets/preview_1415_ming_yingtian.webp', 'assets/preview_741_tang_trace.webp',
  'assets/preview_journey_sushi.webp', 'assets/preview_quiz_challenge.webp', 'assets/terrain_relief.webp',
  'assets/icons/apple-touch-icon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512-maskable.png',
  'assets/icons/icon-512.png',
  'topics/battle-changping.html', 'topics/battle-chibi.html', 'topics/battle-feishui.html',
  'topics/beisong.html', 'topics/donghan.html', 'topics/dongjin.html', 'topics/dufu-763.html',
  'topics/hanyu-languan.html', 'topics/index.html', 'topics/journey-libai.html',
  'topics/journey-qinshihuang.html', 'topics/journey-sushi.html', 'topics/journey-wangyangming.html',
  'topics/journey-xuanzang.html', 'topics/journey-zhangqian.html', 'topics/journey-zhugeliang.html',
  'topics/ming.html', 'topics/nanbei.html', 'topics/nansong.html', 'topics/prc.html', 'topics/qin.html',
  'topics/qing.html', 'topics/roc.html', 'topics/sanguo.html', 'topics/shuihu-jiangzhou.html',
  'topics/sui.html', 'topics/sushi-exile.html', 'topics/tang.html', 'topics/wentianxiang-lingdingyang.html',
  'topics/wudai.html', 'topics/xihan.html', 'topics/xijin.html', 'topics/xinqiji-jingkou.html',
  'topics/yuan.html', 'topics/zhanguo.html'
];
const supplementalPaths = [
  'index.html', 'atlas-workbench.js', 'atlas-workbench.css', 'atlas-terrain.js', 'project-links.mjs',
  'atlas-source.json', 'assets/atlas-elevation.json', 'assets/atlas-elevation-source.json',
  'UPSTREAM-LICENSE', 'UPSTREAM-README_ZH.md', 'UPSTREAM-CONTRIBUTING_ZH.md', 'UPSTREAM-llms.txt',
  'vendor/three/source.json', 'vendor/three/build/three.module.min.js',
  'vendor/three/build/three.core.min.js', 'vendor/three/examples/jsm/controls/OrbitControls.js',
  'vendor/three/LICENSE'
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const forward = value => value.split(path.sep).join('/');
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function assertRelative(relative) {
  if (!relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('Unsafe whitelist path: ' + relative);
  }
}
async function safeRead(root, relative) {
  assertRelative(relative);
  const filename = path.resolve(root, relative);
  if (!within(root, filename)) throw new Error('Source outside selected root: ' + relative);
  const [resolvedRoot, resolved] = await Promise.all([realpath(root), realpath(filename)]);
  if (!within(resolvedRoot, resolved)) throw new Error('Linked source outside selected root: ' + relative);
  if (!(await stat(resolved)).isFile()) throw new Error('Whitelist item is not a file: ' + relative);
  return readFile(resolved);
}
function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match; found ${count}`);
  return text.replace(before, after);
}
const upstreamManifest = JSON.parse(await safeRead(sourceWeb, 'atlas-source.json'));
if (upstreamManifest.commit !== commit || upstreamManifest.files.length !== upstreamPaths.length || upstreamPaths.length !== 54) {
  throw new Error('The reviewed upstream version or 54-file boundary has changed. Review the whitelist before building.');
}
const upstreamHashes = new Map(upstreamManifest.files.map(file => [file.path, file.sha256]));
for (const relative of upstreamPaths) {
  if (!upstreamHashes.has(relative)) throw new Error('Whitelist path absent from upstream manifest: ' + relative);
}
const threeManifest = JSON.parse(await safeRead(sourceWeb, 'vendor/three/source.json'));
if (threeManifest.version !== '0.180.0' || threeManifest.files.length !== 4) throw new Error('Three.js version changed; review required.');
const threeHashes = new Map(threeManifest.files.map(file => ['vendor/three/' + file.path, file.sha256]));

// Read every input and verify original hashes before writing any destination file.
const inputs = await Promise.all([...upstreamPaths, ...supplementalPaths].map(async relative => {
  const bytes = await safeRead(sourceWeb, relative);
  const expectedHash = upstreamHashes.get(relative) || threeHashes.get(relative);
  if (expectedHash && sha256(bytes) !== expectedHash) throw new Error('Source checksum mismatch: ' + relative);
  return {relative, source: forward(path.relative(workspace, path.join(sourceWeb, relative))), bytes, expectedHash};
}));
const optionalMusicUrls = [...inputs.find(input => input.relative === 'js/lore_data.js').bytes.toString('utf8').matchAll(/https:\/\/upload\.wikimedia\.org\/[^"\s]+\.(?:mp3|ogg)/g)].map(match => match[0]);
async function integrationInput(relative) {
  try { return await safeRead(integrationAssets, relative); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('Required integration input is missing: projects/017-abyss-expedition/web/integration-assets/' + relative + '. No output files were written.');
    throw error;
  }
}
const bridge = await integrationInput('atlas-bridge.mjs');
const apiSuffix = await integrationInput('atlas-api-suffix.mjs');
const builder = await readFile(fileURLToPath(import.meta.url));
const notice = await safeRead(sourceProject, 'NOTICE.md');
const files = [];

function add(relative, bytes, details) {
  assertRelative(relative);
  files.push({path: relative, bytes: Buffer.from(bytes), ...details});
}
for (const input of inputs) {
  let bytes = input.bytes;
  const modifications = [];
  if (input.relative.startsWith('topics/') && input.relative.endsWith('.html')) {
    const html = bytes.toString('utf8');
    let removed = 0;
    const localHtml = html.replace(/<script\b[^>]*\bsrc=["']https:\/\/(?:events\.vercount\.one\/js|static\.cloudflareinsights\.com\/beacon\.min\.js)["'][^>]*>\s*<\/script>/gi, () => { removed++; return ''; });
    if (removed !== 2) throw new Error(`Topic analytics boundary changed in ${input.relative}: expected 2 scripts, found ${removed}`);
    bytes = Buffer.from(localHtml);
    modifications.push('Removed the two original-site analytics scripts from this published local topic copy. Historical text, author attribution, data and original-site links are unchanged.');
  } else if (input.relative === 'index.html') {
    let html = bytes.toString('utf8');
    html = replaceOnce(html, '<title>山河行记 · 历史时空地图</title>', '<title>山河行记 · 历史时空地图 · 集成演示</title>', 'Integration title');
    html = replaceOnce(html, '<body>', '<body data-atlas-integration="017" aria-label="山河行记历史地图能力集成；embedded=1 为研究页内嵌模式">', 'Integration body');
    html = replaceOnce(html, 'href="process.html"', 'href="integration-source.html" target="_blank" rel="noopener"', 'Source information link');
    html = replaceOnce(html, 'href="https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/research.html"', 'href="../../research.html" target="_top"', 'Portable research link');
    html = replaceOnce(html, '</body>', '<!-- Integration accepts ?embedded=1; iframe lifecycle and navigation are handled by this local bridge. -->\n<script type="module" src="integration-bridge.mjs?v=1"></script>\n</body>', 'Integration bridge');
    bytes = Buffer.from(html);
    modifications.push('Added integration title, embedded-mode accessibility description, local source/research links and the same-origin integration bridge.');
  } else if (input.relative === 'atlas-workbench.js') {
    bytes = Buffer.from(bytes.toString('utf8') + '\n\n// 017 integration lifecycle API; source adapter remains unchanged in project 016.\n' + apiSuffix.toString('utf8') + '\n');
    modifications.push('Appended web/integration-assets/atlas-api-suffix.mjs to expose the existing adapter closure as a lifecycle API.');
  } else if (input.relative === 'atlas-terrain.js') {
    let code = bytes.toString('utf8');
    code = replaceOnce(code, 'function setEnabled(value) {', 'function setEnabled(value,{retainCamera=false}={}) {', 'Terrain lifecycle signature');
    code = replaceOnce(code, 'if(enabled){resize();sync();focusState(false);cancelAnimationFrame(raf);', 'if(enabled){resize();sync();if(!retainCamera)focusState(false);cancelAnimationFrame(raf);', 'Retain terrain camera on resume');
    code = replaceOnce(code, 'if(enabled)focusState(false);', '// Preserve the user camera on layout changes; composition and projection were updated above.', 'Retain camera during layout changes');
    bytes = Buffer.from(code);
    modifications.push('Added an optional retainCamera flag to setEnabled and removed resize-triggered refocusing. Resume and layout changes preserve the user camera; composition/projection still update.');
  }
  add(input.relative, bytes, {
    origin: upstreamHashes.has(input.relative) ? 'jiangshan-map' : input.relative.startsWith('vendor/three/') ? 'three' : '016-dongpo-journey',
    source: input.source,
    sourceSha256: sha256(input.bytes),
    ...(input.expectedHash ? {reviewedSha256: input.expectedHash} : {}),
    modified: modifications.length > 0,
    ...(modifications.length ? {modifications} : {})
  });
}
add('integration-bridge.mjs', bridge, {origin: '017-abyss-expedition', source: 'projects/017-abyss-expedition/web/integration-assets/atlas-bridge.mjs', sourceSha256: sha256(bridge), modified: false});
add('integration-api-suffix.mjs', apiSuffix, {origin: '017-abyss-expedition', source: 'projects/017-abyss-expedition/web/integration-assets/atlas-api-suffix.mjs', sourceSha256: sha256(apiSuffix), modified: false, purpose: 'Published source of the API appended to atlas-workbench.js; not loaded a second time.'});
add('NOTICE-016.md', notice, {origin: '016-dongpo-journey', source: 'projects/016-dongpo-journey/NOTICE.md', sourceSha256: sha256(notice), modified: false, purpose: 'Unaltered historical provenance notice. Its old draft paths are context only; those draft assets are not bundled.'});

const integrationNotice = `# 历史地图能力集成：来源与修改声明\n\n这是把016山河行记的当前地图运行时接入017研究档案的本地集成包。它没有把历史地图引擎重新署为独立原创，也没有把这套渲染器迁移到深海作品。\n\n- 上游：DeanChensj / jiangshan-map，https://github.com/DeanChensj/jiangshan-map ，固定版本 ${commit}。54份上游输入按原始哈希核验；引擎与数据保持原始字节，专题HTML副本仅移除原站统计脚本。见 atlas-source.json 与 integration-source.json。\n- 016新增：地图入口、路线编排、同一历史状态驱动的Three.js三维地图、现代DEM投影适配。此次打包不修改016源文件。\n- 017新增：同源嵌入桥、生命周期API、相机保留选项、集成来源页面和可重建脚本。完整派生修改及输入/输出SHA-256见 integration-source.json。\n- 代码：上游GPL-3.0；016和017新增代码GPL-3.0-only；许可全文为UPSTREAM-LICENSE。浏览器直接加载的JS即对应源代码，桥与API附加源单独保留。\n- 数据例外：CHGIS V6、Hartwell等历史政区与疆域数据仍受原始学术、非商业条款约束；GPL代码许可不改变其条款。参见UPSTREAM-README_ZH.md、UPSTREAM-CONTRIBUTING_ZH.md、NOTICE-016.md。\n- Three.js 0.180.0：MIT，模块、source.json和LICENSE完整保留于vendor/three/。\n- 现代DEM：Mapzen Terrain Tiles / AWS Open Data。Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. NOAA. https://github.com/tilezen/joerd/blob/master/docs/attribution.md 。解码高程与15张瓦片来源哈希在assets/atlas-elevation*.json。该包不复制原始瓦片。\n- 历史边界为近似示意；现代高程不表示古代地貌，三维显示使用高度夸张；路线连线不等于精确行路轨迹。\n- 核心地图运行不请求8016或远程渲染服务，不依赖在线AI。专题HTML的历史文字、作者归属和原站链接保留，原站统计脚本从集成副本中移除。原库古琴播放器的5首Wikimedia音轨仍需联网，未下载或缓存；只有点击播放时使用，不影响地图、三维或时间轴。\n- 不打包旧微缩场景、旧三站地图、原始高程瓦片、私有配置或凭据。\n\n重建：在仓库根执行 node projects/017-abyss-expedition/src/build-atlas-integration.mjs。以HTTP服务启动017/web，再打开 /integrations/atlas/?embedded=1&view=3d。\n`;
add('INTEGRATION-NOTICE.md', Buffer.from(integrationNotice), {origin: '017-abyss-expedition', generated: true, modified: false});
const sourceHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>历史地图集成 · 来源与能力边界</title><link rel="icon" href="assets/favicon.svg"><style>body{margin:0;background:#f4f0e5;color:#263d35;font:16px/1.8 system-ui,sans-serif}main{max-width:920px;margin:auto;padding:48px 24px 80px}h1{font-size:clamp(28px,5vw,42px);line-height:1.3}h2{font-size:22px;margin-top:36px}a{color:#9e342b}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:13px 12px;border-bottom:1px solid #d5d2c4;vertical-align:top}code{overflow-wrap:anywhere;font-size:13px}.eyebrow{letter-spacing:.18em;font-size:12px}nav{display:flex;gap:20px;flex-wrap:wrap}.note{padding:18px 22px;background:#e7e9dd;border-left:3px solid #9e342b}li{margin:9px 0}@media(max-width:600px){main{padding:30px 18px}td,th{padding:10px 5px}}</style></head><body><main>
<p class="eyebrow">017 / 历史地图能力接入</p><h1>同一套历史状态，连接舆图与三维山河。</h1>
<nav><a href="./?view=3d">打开三维地图</a><a href="./?view=2d">打开二维舆图</a><a href="../../research.html" target="_top">研究与探索总档案</a></nav>
<p class="note">本页把016当前作品的完整地图运行时接入017演示网页。地图引擎与历史数据来自<a href="https://github.com/DeanChensj/jiangshan-map" target="_blank" rel="noopener">DeanChensj / 江山时序</a>；联动三维地形属于016的扩展；017提供同源集成、操作入口与生命周期控制。</p>
<h2>可以体验什么</h2><table><thead><tr><th>能力</th><th>操作与边界</th></tr></thead><tbody>
<tr><td>时间、疆域、历史事件</td><td>拖动年份，选朝代和阶段事件；边界为历史资料的示意表达。</td></tr>
<tr><td>城市沿革与人物行迹</td><td>搜城市、搜人物，读史事与生平；人物站点、年份、路线和两种视角同步。</td></tr>
<tr><td>图层、路线与寻址挑战</td><td>切换历史/现代图层，编排路线；细政区悬停、透视镜、寻址挑战在二维舆图中体验。</td></tr>
<tr><td>真实地形三维视角</td><td>Three.js实时绘制现代DEM、历史疆域、城市和路线。拖动旋转、滚轮缩放、右键平移；不是古地貌复原。</td></tr>
<tr><td>研究页集成</td><td>017页面内运行同源地图，可暂停后台绘制并恢复；不需要启动8016服务，也没有接入在线AI问答。</td></tr>
</tbody></table>
<h2>来源、许可与文件校验</h2><ul>
<li>上游固定版本：<a href="https://github.com/DeanChensj/jiangshan-map/tree/${commit}" target="_blank" rel="noopener"><code>${commit}</code></a>；54文件原始清单见<a href="atlas-source.json">atlas-source.json</a>。</li>
<li>本次包的每个文件、输入与输出SHA-256、派生修改及重建入口见<a href="integration-source.json">integration-source.json</a>。新增JS直接以可读源代码提供；<a href="integration-bridge.mjs">桥源代码</a>与<a href="integration-api-suffix.mjs">API附加源代码</a>均可查看。</li>
<li>代码遵循<a href="UPSTREAM-LICENSE">GPL-3.0全文</a>，新增代码为GPL-3.0-only。<strong>CHGIS V6 / Hartwell等数据的原始学术、非商业条款继续适用。</strong>参见<a href="UPSTREAM-README_ZH.md">上游说明</a>、<a href="UPSTREAM-CONTRIBUTING_ZH.md">校勘约定</a>、<a href="NOTICE-016.md">016原始来源声明</a>和<a href="INTEGRATION-NOTICE.md">本次集成修改声明</a>。</li>
<li><a href="vendor/three/LICENSE">Three.js 0.180.0 / MIT许可</a>，<a href="vendor/three/source.json">4份模块/许可文件的来源与SHA-256</a>；模块保持原样。</li>
<li><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles / AWS Open Data</a>现代高程：361×253格网，91,333采样点；<a href="assets/atlas-elevation-source.json">15张源瓦片、解码、投影与哈希记录</a>。Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. NOAA. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">原始归属与条款</a>。原始瓦片没有打包。</li>
</ul>
<h2>集成范围</h2><p>本地核心运行时包含引擎、完整历史数据、延迟加载的疆域快照与语言字典、当前适配器、解码DEM和Three.js。所有这些资源从017同源地址加载。旧微缩场景和旧三站草稿不属于本次接入。专题HTML保留历史文字、作者归属和原站链接，仅移除原站统计脚本；外站资料链接不是本地核心运行依赖。原库古琴播放器的5首Wikimedia音轨未缓存，点击播放音乐需要联网。</p>
<p>本次是现有地图能力的完整接入；它与017深海作品并列展示，便于对照研究，不表示两者已共用同一套三维渲染器。</p>
<p><a href="./?view=3d">返回地图 ↗</a></p></main></body></html>\n`;
add('integration-source.html', Buffer.from(sourceHtml), {origin: '017-abyss-expedition', generated: true, modified: false});

// Do not clean the destination: only explicit files below may be overwritten.
await mkdir(destination, {recursive: true});
const resolvedDestination = await realpath(destination);
const resolvedProject = await realpath(project);
if (!within(resolvedProject, resolvedDestination)) throw new Error('Output directory resolves outside project 017.');
async function publish(relative, bytes) {
  const output = path.resolve(destination, relative);
  if (!within(destination, output)) throw new Error('Output path escaped integration folder.');
  await mkdir(path.dirname(output), {recursive: true});
  const resolvedParent = await realpath(path.dirname(output));
  if (!within(resolvedDestination, resolvedParent)) throw new Error('Output parent is linked outside integration folder.');
  try { if (!within(resolvedDestination, await realpath(output))) throw new Error('Output file is linked outside integration folder.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(output, bytes);
}
for (const file of files) await publish(file.path, file.bytes);
const publishedFiles = files.map(({bytes, ...details}) => ({...details, bytes: bytes.length, sha256: sha256(bytes)}));
const totalPayloadBytes = publishedFiles.reduce((sum, file) => sum + file.bytes, 0);
const manifest = {
  schemaVersion: 1,
  name: '山河行记历史地图能力同源集成',
  generatedAt: new Date().toISOString(),
  entry: 'index.html?embedded=1&view=3d',
  standaloneEntry: 'index.html?view=3d',
  provenancePage: 'integration-source.html',
  rebuild: 'node projects/017-abyss-expedition/src/build-atlas-integration.mjs',
  upstream: {repository: upstreamManifest.repository, commit, codeLicense: 'GPL-3.0', fileCount: 54, originalInputsVerified: true, engineAndDataUnmodified: true, topicChanges: 'Removed only original-site analytics scripts; retained history, attribution and links.', originalManifest: 'atlas-source.json'},
  integratedFrom: {project: 'projects/016-dongpo-journey', role: 'Existing historical map integration and linked modern-DEM Three.js view', sourceNotice: 'NOTICE-016.md', sourceFilesModified: false},
  integration: {project: 'projects/017-abyss-expedition', codeLicense: 'GPL-3.0-only', mode: 'Same-origin self-contained runtime and embedded bridge, not an ocean renderer migration', modifiedFiles: publishedFiles.filter(file => file.modified).map(file => file.path)},
  licenses: {code: 'UPSTREAM-LICENSE', integration: 'INTEGRATION-NOTICE.md', upstreamReadme: 'UPSTREAM-README_ZH.md', dataExceptions: 'CHGIS V6 and Hartwell historical GIS data retain original academic/noncommercial terms. Code GPL does not replace those terms.', three: {version: threeManifest.version, license: 'MIT', notice: 'vendor/three/LICENSE', manifest: 'vendor/three/source.json'}, elevation: {source: 'Mapzen Terrain Tiles / AWS Open Data', manifest: 'assets/atlas-elevation-source.json', attribution: 'Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. NOAA.'}},
  optionalExternalMedia: {feature: 'Original guqin music player', cached: false, requestedOnlyOnPlay: true, note: 'Five original tracks use Wikimedia MP3/OGG streams. Music requires network; map/3D/timeline do not.', urls: optionalMusicUrls},
  boundaries: {historicalBorders: 'Approximate historical illustration', terrain: 'Modern DEM with displayed vertical exaggeration, not reconstructed ancient terrain', routes: 'Connections between historical events, not precise travel tracks', network: 'Core map assets are local and do not require port 8016. Topic documents retain optional external original-site links; original-site analytics scripts are removed from the published local copies.', excluded: ['Old miniature scenes', 'Old three-stop demo', 'Raw elevation tiles', 'Private configurations and credentials']},
  buildInputs: [{path: 'projects/017-abyss-expedition/src/build-atlas-integration.mjs', sha256: sha256(builder)}, {path: 'projects/017-abyss-expedition/web/integration-assets/atlas-api-suffix.mjs', sha256: sha256(apiSuffix)}, {path: 'projects/017-abyss-expedition/web/integration-assets/atlas-bridge.mjs', sha256: sha256(bridge)}],
  totalFiles: publishedFiles.length,
  totalPayloadBytes,
  manifestExcludedFromPayloadHashes: true,
  files: publishedFiles
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
await publish('integration-source.json', manifestBytes);
console.log(JSON.stringify({entry: 'http://127.0.0.1:8017/integrations/atlas/?embedded=1&view=3d', output: forward(path.relative(workspace, destination)), files: files.length + 1, upstreamFiles: upstreamPaths.length, payloadBytes: totalPayloadBytes, totalBytes: totalPayloadBytes + manifestBytes.length, modified: manifest.integration.modifiedFiles}, null, 2));
