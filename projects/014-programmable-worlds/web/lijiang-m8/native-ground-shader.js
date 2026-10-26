// An opt-in textual pruning pass for the already proved ground-only writer.
// No caller, shader default or GPU state is changed by importing this module.
const REVISION = 'native-ground-material-chain-prune-3';

function maskComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g,
    comment => comment.replace(/[^\n\r]/g, ' '));
}

function closeBrace(masked, opening) {
  if (masked[opening] !== '{') throw new Error('Ground shader brace boundary is not an opening brace');
  let depth = 1;
  for (let at = opening + 1; at < masked.length; at++) {
    if (masked[at] === '{') depth++;
    else if (masked[at] === '}' && --depth === 0) return at;
  }
  throw new Error('Ground shader has an unclosed source block');
}

function skipSpace(source, at) {
  while (at < source.length && /\s/.test(source[at])) at++;
  return at;
}

function requireOne(source, text, label) {
  if (source.split(text).length !== 2) throw new Error('Expected one exact specialized ' + label);
}

async function sha256(source) {
  const bytes = new TextEncoder().encode(source);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

const blank = source => source.replace(/[^\n\r]/g, ' ');

function functionDefinitions(source) {
  const commented = maskComments(source), code = [], directives = [];
  let continuation = false;
  for (const match of commented.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0];if (!line) continue;
    const directive = continuation || /^[ \t]*#/.test(line);
    code.push(directive ? blank(line) : line);directives.push(directive ? line : blank(line));
    continuation = directive && line.trimEnd().endsWith('\\');
  }
  const masked = code.join(''), depthAt = new Uint32Array(masked.length + 1);
  let depth = 0;
  for (let at = 0; at < masked.length; at++) {
    depthAt[at] = depth;
    if (masked[at] === '{') depth++;
    else if (masked[at] === '}' && --depth < 0) throw new Error('Unbalanced top-level GLSL function boundaries');
  }
  if (depth !== 0) throw new Error('Unclosed top-level GLSL function boundaries');
  const pattern = /\b(?:(?:const|lowp|mediump|highp|precise|invariant)\s+)*([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;
  const definitions = [];
  for (let match; (match = pattern.exec(masked));) {
    if (depthAt[match.index] !== 0) continue;
    const opening = match.index + match[0].lastIndexOf('{'), closing = closeBrace(masked, opening);
    definitions.push({ name: match[2], start: match.index, opening, end: closing + 1 });
    pattern.lastIndex = closing + 1;
  }
  return { definitions, masked, directives: directives.join('') };
}

function unreachableFunctions(source) {
  const parsed = functionDefinitions(source), byName = new Map();
  for (const definition of parsed.definitions) {
    if (!byName.has(definition.name)) byName.set(definition.name, []);
    byName.get(definition.name).push(definition);
  }
  const roots = ['sceneSD', 'shadeScene'];
  if (roots.some(name => !byName.has(name))) throw new Error('Ground writer function-call roots are missing');
  const calls = text => [...text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)]
    .map(match => match[1]).filter(name => byName.has(name));
  // Macro expansion can hide calls. Conservatively retain any defined
  // function whose name appears anywhere in any preprocessor directive.
  const macroRoots = [...new Set([...parsed.directives.matchAll(/\b[A-Za-z_]\w*\b/g)]
    .map(match => match[0]).filter(name => byName.has(name)))];
  let outside = '', at = 0;
  for (const definition of parsed.definitions) {
    outside += parsed.masked.slice(at, definition.start) + blank(parsed.masked.slice(definition.start, definition.end));at = definition.end;
  }
  outside += parsed.masked.slice(at);
  const globalRoots = [...new Set(calls(outside))], retained = new Set([...roots, ...macroRoots, ...globalRoots]);
  const queue = [...retained];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    // Every overload of a reachable name contributes dependencies. A local
    // name that resembles a defined function only retains extra code.
    for (const definition of byName.get(queue[cursor]) || []) {
      for (const name of calls(parsed.masked.slice(definition.opening + 1, definition.end - 1)))
        if (!retained.has(name)) { retained.add(name);queue.push(name); }
    }
  }
  return { removed: parsed.definitions.filter(definition => !retained.has(definition.name)),
    metadata: { roots, macroConservativeRoots: macroRoots, globalExpressionConservativeRoots: globalRoots,
      sourceDefinitions: parsed.definitions.length, sourceFunctionNames: byName.size,
      retainedFunctionNames: [...retained].sort(), overloadPolicy: 'Retain every overload and its dependencies when its name is reachable',
      builtinsAndUnknownNames: 'No definition found means no removal decision; builtins and local-name ambiguity retain extra code',
      globalsStructsUniformsRemoved: false, crossFunctionConstantEvaluation: false } };
}

function removeRanges(source, ranges) {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  let end = 0;
  for (const range of ordered) {
    if (range.start < end || range.end <= range.start || range.end > source.length) throw new Error('Overlapping or invalid GLSL pruning ranges');
    range.text = source.slice(range.start, range.end);end = range.end;
  }
  let result = source;
  for (const range of [...ordered].reverse()) result = result.slice(0, range.start) + (range.replacement || '') + result.slice(range.end);
  return { source: result, ranges: ordered };
}

function restoreRanges(source, ranges) {
  let result = source;
  for (const range of ranges) result = result.slice(0, range.start) + range.text + result.slice(range.start + (range.replacement || '').length);
  return result;
}

export async function pruneGroundOnlyShader(prefix, { freezeDebug = false } = {}) {
  if (typeof freezeDebug !== 'boolean') throw new Error('freezeDebug must be a boolean');
  if (typeof prefix !== 'string' || !prefix.startsWith('#version 300 es'))
    throw new Error('Ground pruning needs the actual already-specialized native shader prefix');
  const masked = maskComments(prefix);
  if (/\bvoid\s+main\s*\(/.test(masked)) throw new Error('Pass the source prefix before writer main, not the complete shader');
  const definitions = [...masked.matchAll(/\bvec3\s+shadeScene\s*\([^;{}]*\)\s*\{/g)];
  if (definitions.length !== 1) throw new Error('Expected exactly one native shadeScene definition');
  const opening = masked.indexOf('{', definitions[0].index), closing = closeBrace(masked, opening);
  const body = masked.slice(opening + 1, closing);
  requireOne(body, 'float mat=0.;', 'ground-only material selector');
  requireOne(body, 'gVeg=false;', 'shadeScene vegetation assignment');
  if ([...body.matchAll(/\bmat\s*=(?!=)/g)].length !== 1)
    throw new Error('Ground-only material selector is assigned elsewhere');
  requireOne(masked, 'if(false&&p.y-h<ENV){', 'sceneSD tree/bush gate');
  requireOne(masked, '(false&&uDbgM!=85?1.:0.)', 'terrain canopy gate');
  requireOne(body, 'if(mat<.5&&vegW>.05&&false&&vm.a>.35&&max(occA,occN)>0.){', 'crown occlusion gate');
  requireOne(masked, 'uniform int uDbgM;', 'debug mode uniform declaration');
  requireOne(body, 'if(uDbgM==7){', 'shadeScene debug tree/bush probe');

  const candidates = [];
  const needle = 'if(mat<.5){';
  for (let at = opening + 1, depth = 0; at < closing; at++) {
    if (depth === 0 && masked.startsWith(needle, at)) {
      const blockOpening = at + needle.length - 1, blockClosing = closeBrace(masked, blockOpening);
      const next = skipSpace(masked, blockClosing + 1);
      if (masked.startsWith('else if(mat<1.5){', next))
        candidates.push({ at, opening: blockOpening, closing: blockClosing });
    }
    if (masked[at] === '{') depth++;
    else if (masked[at] === '}') depth--;
  }
  if (candidates.length !== 1) throw new Error('Expected one top-level native ground material branch chain');
  const ground = candidates[0];
  if (!masked.slice(ground.opening + 1, ground.closing).trimStart().startsWith('float sw=inf.x;'))
    throw new Error('Ground material body boundary changed');

  const headers = ['else if(mat<1.5){', 'else if(mat<2.5){', 'else if(mat<3.5){', 'else if(mat<4.5){', 'else {'];
  const branches = [];
  let end = ground.closing + 1;
  for (const header of headers) {
    const start = skipSpace(masked, end);
    if (!masked.startsWith(header, start)) throw new Error('Native non-ground material branch chain changed: ' + header);
    const blockClosing = closeBrace(masked, start + header.length - 1);
    if (blockClosing >= closing) throw new Error('Non-ground branch escaped shadeScene');
    branches.push({ header, start, end: blockClosing + 1 });end = blockClosing + 1;
  }
  if (!masked.slice(end, closing).trimStart().startsWith('if(uDbgM==5) return N*.5+.5;'))
    throw new Error('Common post-material shading boundary changed');
  const start = ground.closing + 1, removed = prefix.slice(start, end);
  const blockHeaders = [
    { function: 'sceneSD', header: 'if(false&&p.y-h<ENV){', scope: 'Proven-false individual tree/bush distance-field block' },
    { function: 'shadeScene', header: 'if(mat<.5&&vegW>.05&&false&&vm.a>.35&&max(occA,occN)>0.){', scope: 'Proven-false tree distance-field occlusion block' },
    { function: 'shadeScene', header: 'if(uDbgM==7){', scope: 'Debug tree/bush probe unreachable with baker-fixed uDbgM=0' }
  ];
  const initialDefinitions = functionDefinitions(prefix).definitions;
  const deadBlocks = blockHeaders.map(block => {
    const blockStart = masked.indexOf(block.header), blockEnd = closeBrace(masked, blockStart + block.header.length - 1) + 1;
    const owner = initialDefinitions.find(definition => definition.name === block.function && definition.opening < blockStart && definition.end > blockEnd);
    if (!owner || /^else\b/.test(masked.slice(skipSpace(masked, blockEnd)))) throw new Error('False vegetation block ownership or following else changed');
    return { start: blockStart, end: blockEnd, function: block.function, scope: block.scope };
  });
  const materialStage = removeRanges(prefix, [
    { start, end, function: 'shadeScene', scope: 'Five unreachable non-ground material branches' }, ...deadBlocks,
    ...(freezeDebug ? [{ start: masked.indexOf('uniform int uDbgM;'), end: masked.indexOf('uniform int uDbgM;') + 'uniform int uDbgM;'.length,
      function: null, scope: 'Debug mode fixed to the zero value explicitly uploaded by bakeNativeSurfaceColors', replacement: 'const int uDbgM=0;' }] : [])
  ]);
  const graph = unreachableFunctions(materialStage.source);
  const functionStage = removeRanges(materialStage.source, graph.removed.map(definition => ({
    start: definition.start, end: definition.end, function: definition.name, scope: 'Unreachable top-level GLSL function definition'
  })));
  const pruned = functionStage.source;
  const restored = restoreRanges(restoreRanges(pruned, functionStage.ranges), materialStage.ranges);
  if (restored !== prefix) throw new Error('Ground material pruning failed exact source restoration');
  const [originalPrefixSHA256, prunedPrefixSHA256, removedTextSHA256, restoredPrefixSHA256, groundBodySHA256] = await Promise.all([
    sha256(prefix), sha256(pruned), sha256(removed), sha256(restored), sha256(prefix.slice(ground.opening + 1, ground.closing))
  ]);
  const deletionStages = await Promise.all([
    { name: freezeDebug ? 'dead-material-vegetation-debug-blocks-and-fixed-debug-mode' : 'dead-material-vegetation-and-debug-blocks', ranges: materialStage.ranges },
    { name: 'unreachable-function-definitions', ranges: functionStage.ranges }
  ].map(async stage => ({ stage: stage.name, rangeCoordinateSpace: 'Input source of this stage, UTF-16 offsets, end exclusive',
    ranges: await Promise.all(stage.ranges.map(async range => ({
      start: range.start, end: range.end, function: range.function, scope: range.scope,
      originalTextSHA256: await sha256(range.text), originalUTF8Bytes: new TextEncoder().encode(range.text).length,
      ...(range.replacement ? { replacement: range.replacement, replacementTextSHA256: await sha256(range.replacement) } : {})
    }))) })));
  const allRanges = [...materialStage.ranges, ...functionStage.ranges];
  const metadata = {
    revision: REVISION, applied: true, function: 'shadeScene', removedMaterialBranches: branches.length,
    scope: 'Delete five unreachable non-ground material branches, two proven-false vegetation blocks and one baker-disabled debug block; '
      + (freezeDebug ? 'specialize debug uniform to zero; ' : 'preserve the debug uniform declaration; ')
      + 'then remove unreachable named GLSL function definitions while preserving ground canopy and common lighting dependencies',
    proof: 'Input prefix explicitly has shadeScene mat=0 and gVeg=false plus the three false vegetation geometry/occlusion gates. sceneSD supplies inf.w=0. The retained if(mat<.5) therefore always selects ground; the following else chain cannot execute. bakeNativeSurfaceColors explicitly uploads gl.uniform1i(program.u.uDbgM,0) for every bake, so the uDbgM==7 tree/bush debug probe cannot execute. Optional freezeDebug additionally changes the declaration to const; keeping the uniform does not change that baker value assumption.',
    removedRange: { start, end, indexUnits: 'JavaScript UTF-16 source offsets, end exclusive' },
    removedCharacters: prefix.length - pruned.length,
    removedUTF8Bytes: new TextEncoder().encode(prefix).length - new TextEncoder().encode(pruned).length,
    removedOriginalUTF8Bytes: allRanges.reduce((sum, range) => sum + new TextEncoder().encode(range.text).length, 0),
    materialChainRemovedUTF8Bytes: new TextEncoder().encode(removed).length,
    branchHeaders: branches.map(branch => branch.header), originalPrefixSHA256, prunedPrefixSHA256,
    removedTextSHA256, restoredPrefixSHA256, groundBodySHA256, groundBodyUnchanged: true,
    sourceBeforeGroundAndAfterMaterialChainUnchanged: false, restoredPrefixBytesIdentical: restoredPrefixSHA256 === originalPrefixSHA256,
    originalPrefixByteIdentical: false, falseGeometryBlocksRemoved: 2, fixedDebugBlocksRemoved: 1,
    freezeDebug, debugUniformPreserved: !freezeDebug,
    fixedDebugMode: { original: 'uniform int uDbgM;', specialized: freezeDebug ? 'const int uDbgM=0;' : 'uniform int uDbgM;',
      matchCount: 1, declarationChanged: freezeDebug, value: 0, valueSource: 'Explicit baker uniform upload',
      proof: freezeDebug ? 'bakeNativeSurfaceColors uploads zero after the original uniform uploader for every bake; inactive uniform uploads remain WebGL no-ops'
        : 'Retain the original uniform and its arithmetic/control-flow representation; only the physically removed debug7 probe relies on the explicit zero upload' },
    functionDefinitionsRemoved: functionStage.ranges.length,
    removedFunctionNames: [...new Set(functionStage.ranges.map(range => range.function))].sort(),
    functionCallGraph: graph.metadata, deletionStages,
    commonLightingPreservedExceptProvenFalseOcclusionAndDebugProbe: true,
    gpuValidated: false, artAccepted: false
  };
  return { prefix: pruned, metadata,
    restorePrefix(candidate = pruned) {
      if (candidate !== pruned) throw new Error('Restore only the exact pruned prefix returned by this operation');
      return restoreRanges(restoreRanges(candidate, functionStage.ranges), materialStage.ranges);
    } };
}
