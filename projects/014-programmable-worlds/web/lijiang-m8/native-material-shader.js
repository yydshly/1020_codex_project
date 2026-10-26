// This is a different rendering architecture: native procedural base color,
// followed by the raster renderer's live lighting. It is not native HDR shade.
const REVISION = 'native-ground-material-base-color-1';
const blank = source => source.replace(/[^\n\r]/g, ' ');
const maskComments = source => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, blank);

function closeBrace(masked, opening) {
  if (masked[opening] !== '{') throw new Error('Native material block has no opening brace');
  let depth = 1;
  for (let at = opening + 1; at < masked.length; at++) {
    if (masked[at] === '{') depth++;
    else if (masked[at] === '}' && --depth === 0) return at;
  }
  throw new Error('Native material block is unclosed');
}

function definitions(source) {
  const commented = maskComments(source), code = [], directives = [];
  let continuation = false;
  for (const match of commented.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0];if (!line) continue;
    const directive = continuation || /^[ \t]*#/.test(line);
    code.push(directive ? blank(line) : line);directives.push(directive ? line : blank(line));
    continuation = directive && line.trimEnd().endsWith('\\');
  }
  const masked = code.join(''), depths = new Uint32Array(masked.length + 1);
  let depth = 0;
  for (let at = 0; at < masked.length; at++) {
    depths[at] = depth;
    if (masked[at] === '{') depth++;
    else if (masked[at] === '}' && --depth < 0) throw new Error('Unbalanced material shader function boundaries');
  }
  if (depth) throw new Error('Unclosed material shader function boundaries');
  const pattern = /\b(?:(?:const|lowp|mediump|highp|precise|invariant)\s+)*([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;
  const functions = [];
  for (let match; (match = pattern.exec(masked));) {
    if (depths[match.index]) continue;
    const opening = match.index + match[0].lastIndexOf('{'), end = closeBrace(masked, opening) + 1;
    functions.push({ name: match[2], start: match.index, opening, end });pattern.lastIndex = end;
  }
  return { functions, masked, directives: directives.join('') };
}

function applyEdits(source, edits) {
  const ranges = [...edits].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const edit of ranges) {
    if (edit.start < previousEnd || edit.end <= edit.start || edit.end > source.length) throw new Error('Overlapping native material edits');
    edit.original = source.slice(edit.start, edit.end);previousEnd = edit.end;
  }
  let result = source;
  for (const edit of [...ranges].reverse()) result = result.slice(0, edit.start) + (edit.replacement || '') + result.slice(edit.end);
  return { source: result, ranges };
}

function restoreEdits(source, edits) {
  let result = source;
  for (const edit of edits) result = result.slice(0, edit.start) + edit.original + result.slice(edit.start + (edit.replacement || '').length);
  return result;
}

function pruneFunctions(source) {
  const parsed = definitions(source), byName = new Map();
  for (const item of parsed.functions) {
    if (!byName.has(item.name)) byName.set(item.name, []);byName.get(item.name).push(item);
  }
  const roots = ['sceneSD', 'shadeScene'];
  if (roots.some(name => !byName.has(name))) throw new Error('Native material writer roots are missing');
  const calls = text => [...text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(match => match[1]).filter(name => byName.has(name));
  const macroRoots = [...new Set([...parsed.directives.matchAll(/\b[A-Za-z_]\w*\b/g)].map(match => match[0]).filter(name => byName.has(name)))];
  let globals = '', offset = 0;
  for (const item of parsed.functions) { globals += parsed.masked.slice(offset, item.start) + blank(parsed.masked.slice(item.start, item.end));offset = item.end; }
  globals += parsed.masked.slice(offset);
  const globalRoots = [...new Set(calls(globals))], retained = new Set([...roots, ...macroRoots, ...globalRoots]), queue = [...retained];
  for (let at = 0; at < queue.length; at++) for (const item of byName.get(queue[at]) || [])
    for (const name of calls(parsed.masked.slice(item.opening + 1, item.end - 1)))
      if (!retained.has(name)) { retained.add(name);queue.push(name); }
  const removed = parsed.functions.filter(item => !retained.has(item.name));
  return { ...applyEdits(source, removed.map(item => ({ start: item.start, end: item.end, function: item.name }))),
    metadata: { roots, macroConservativeRoots: macroRoots, globalExpressionConservativeRoots: globalRoots,
      sourceDefinitions: parsed.functions.length, removedDefinitions: removed.length,
      removedFunctionNames: [...new Set(removed.map(item => item.name))].sort(), retainedFunctionNames: [...retained].sort(),
      overloadPolicy: 'Every overload of a reachable name and all its named dependencies are retained',
      globalsStructsUniformsRemoved: false, crossFunctionConstantEvaluation: false } };
}

async function sha256(source) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function buildNativeMaterialPrefix(groundPrunedPrefix) {
  if (typeof groundPrunedPrefix !== 'string' || !groundPrunedPrefix.startsWith('#version 300 es'))
    throw new Error('Native material extraction needs the already ground-pruned shader prefix');
  const parsed = definitions(groundPrunedPrefix), shades = parsed.functions.filter(item => item.name === 'shadeScene');
  if (shades.length !== 1 || /\bvoid\s+main\s*\(/.test(parsed.masked)) throw new Error('Expected one shadeScene before writer main');
  const shade = shades[0], body = parsed.masked.slice(shade.opening + 1, shade.end - 1);
  if (body.split('float mat=0.;').length !== 2 || body.includes('else if(mat<1.5){'))
    throw new Error('Native material extraction requires the proved ground-only material shader');
  const groundBlocks = [], header = 'if(mat<.5){';
  for (let at = shade.opening + 1, depth = 0; at < shade.end - 1; at++) {
    if (depth === 0 && parsed.masked.startsWith(header, at)) {
      const opening = at + header.length - 1, closing = closeBrace(parsed.masked, opening);
      if (parsed.masked.slice(opening + 1, closing).trimStart().startsWith('float sw=inf.x;')) groundBlocks.push({ opening, closing });
    }
    if (parsed.masked[at] === '{') depth++;
    else if (parsed.masked[at] === '}') depth--;
  }
  if (groundBlocks.length !== 1) throw new Error('Expected one complete native ground material body');
  const ground = groundBlocks[0];
  const aoStatements = [
    'float gpA=gPix; if(mat>.5&&mat<3.5||mat<.5&&vm.r>.5) gPix=max(gPix,.32);',
    'float aoS=uDbgM==11?1.:sceneAO(pos,N,mat>.5?.9:1.4);',
    'gPix=gpA;'
  ];
  const preamble = parsed.masked.slice(shade.opening + 1, ground.opening);
  const edits = aoStatements.map(statement => {
    if (preamble.split(statement).length !== 2) throw new Error('Expected one exact native material AO statement: ' + statement);
    const start = parsed.masked.indexOf(statement, shade.opening + 1);return { start, end: start + statement.length, scope: 'Remove pre-material source lighting AO' };
  });
  edits.push({ start: ground.closing + 1, end: shade.end - 1, replacement: '\n  return max(alb,vec3(0.));\n', scope: 'Replace common HDR lighting/shadow tail with procedural base color' });
  const material = applyEdits(groundPrunedPrefix, edits), graph = pruneFunctions(material.source), prefix = graph.source;
  const restored = restoreEdits(restoreEdits(prefix, graph.ranges), material.ranges);
  if (restored !== groundPrunedPrefix) throw new Error('Native material extraction failed exact source restoration');
  const [inputPrefixSHA256, materialPrefixSHA256, restoredPrefixSHA256, groundBodySHA256] = await Promise.all([
    sha256(groundPrunedPrefix), sha256(prefix), sha256(restored), sha256(groundPrunedPrefix.slice(ground.opening + 1, ground.closing))
  ]);
  const metadata = { revision: REVISION, architecture: 'Native procedural ground base color plus separate raster live lighting',
    output: 'Nonnegative linear procedural base color; not HDR scene radiance', sourceHDREquivalent: false,
    sourceAOStatementsRemoved: aoStatements, commonHDRLightingRemoved: true, sourceShadowLightingRemoved: true,
    sourceSceneNormalRetained: true, sourceSceneNormalFieldSamples: 4,
    completeGroundMaterialBodyPreserved: true, groundBodySHA256,
    intrinsicCavityAndMicroShadowToneRetained: true, strictlySunIndependentAlbedo: false,
    directionDependentMaterialDetails: 'Original clusterBumps/sideCrown tone can use uSun; the full ground material is intentionally preserved',
    inputPrefixSHA256, materialPrefixSHA256, restoredPrefixSHA256,
    restoredPrefixBytesIdentical: restored === groundPrunedPrefix, originalPrefixByteIdentical: false,
    removedUTF8Bytes: new TextEncoder().encode(groundPrunedPrefix).length - new TextEncoder().encode(prefix).length,
    functionCallGraph: graph.metadata,
    edits: await Promise.all(material.ranges.map(async edit => ({ start: edit.start, end: edit.end, scope: edit.scope,
      originalTextSHA256: await sha256(edit.original), replacement: edit.replacement || '' }))),
    removedFunctionDefinitions: await Promise.all(graph.ranges.map(async edit => ({ function: edit.function,
      start: edit.start, end: edit.end, originalTextSHA256: await sha256(edit.original) }))),
    gpuValidated: false, artAccepted: false };
  return { prefix, metadata,
    restorePrefix(candidate = prefix) {
      if (candidate !== prefix) throw new Error('Restore only the exact returned material prefix');
      return restoreEdits(restoreEdits(candidate, graph.ranges), material.ranges);
    } };
}
