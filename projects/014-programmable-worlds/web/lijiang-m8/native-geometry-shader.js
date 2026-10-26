// M3 geometry writer dependency pruning. Retained function bodies and all
// globals/macros are unchanged; this is not an SDF approximation or air skip.
const REVISION = 'm3-geometry-callgraph-prune-1';
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
  const roots = ['terrSD', ...(byName.has('H')?['H']:[])];
  if (roots.some(name => !byName.has(name))) throw new Error('Native geometry writer roots are missing');
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


export async function buildGeometryPrefix(source) {
  if(typeof source!=='string'||!source.startsWith('#version 300 es'))throw new Error('Expected native geometry shader prefix');
  const graph=pruneFunctions(source),restored=restoreEdits(graph.source,graph.ranges);
  if(restored!==source)throw new Error('M3 geometry prefix restoration failed');
  return {prefix:graph.source,metadata:{revision:REVISION,...graph.metadata,
    originalSHA256:await sha256(source),prunedSHA256:await sha256(graph.source),
    retainedFunctionBodiesUnchanged:true,globalsMacrosUnchanged:true,restorationBytesIdentical:true,
    removedUTF8Bytes:new TextEncoder().encode(source).length-new TextEncoder().encode(graph.source).length,
    GPUScalarEquivalenceValidated:false,usedAirSkipping:false},
    restorePrefix(){return restored;}};
}
