'use strict';

// Compile-only inspection of this application's own fixed localhost source.
// The source's compileonly guard must stop before terrain/ocean/render draws.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function invariant(condition, message) { if (!condition) throw new Error(message); }
async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

async function runCompileAcceptance({ window, projectDirectory, workspaceDirectory, record, backend, getFatal }) {
  const started = Date.now(), runId = new Date(started).toISOString().replace(/[:.]/g, '-');
  const notes = path.join(projectDirectory, 'notes');
  const report = path.join(notes, 'source-compile-' + backend + '.json');
  const latest = path.join(notes, 'source-compile-' + backend + '.latest.json');
  const archive = path.join(notes, 'compile-runs', runId + '-' + backend + '.json');
  const progressFile = path.join(workspaceDirectory, '.cache', 'napali-compile-qa-status-' + backend + '.json');
  let previousPassed = false;
  if (fs.existsSync(report)) {
    try { previousPassed = JSON.parse(fs.readFileSync(report, 'utf8')).status === 'passed'; } catch {}
  }
  const result = {
    runId, backend, scene: 'source', mode: 'hidden-own-application-compile-only',
    status: 'running', startedAt: new Date(started).toISOString(),
    timeoutMilliseconds: 20 * 60 * 1000,
    windowPolicy: { show: false, skipTaskbar: true, focusable: false, backgroundThrottling: false, occludedWindowBackgrounding: false },
    security: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    tests: [], phases: [], errors: [],
    note: 'Compiles the four source renderer programs only. This does not accept world generation, actual GPU frames, driving, or artistic quality.'
  };
  function progress(phase, application) {
    const item = { ...result, phase, elapsedSeconds: (Date.now() - started) / 1000, application };
    fs.writeFileSync(progressFile, JSON.stringify(item, null, 2) + '\n');
    record('compile-qa-progress', { phase, elapsedSeconds: item.elapsedSeconds, application });
  }
  function persist() {
    fs.mkdirSync(notes, { recursive: true }); fs.mkdirSync(path.dirname(archive), { recursive: true });
    const content = JSON.stringify(result, null, 2) + '\n';
    fs.writeFileSync(latest, content); fs.writeFileSync(archive, content);
    if (!previousPassed || result.status === 'passed') fs.writeFileSync(report, content);
  }
  try {
    invariant(!window.isVisible() && !window.isFocused(), 'Compile QA window became visible or focused');
    result.tests.push({ name: 'window-remains-hidden-and-unfocused', passed: true });
    const deadline = started + result.timeoutMilliseconds;
    let previousPhase = null;
    progress('awaiting-renderer-program-compilation', null);
    while (Date.now() < deadline) {
      const fatal = getFatal(); if (fatal) throw new Error(fatal);
      invariant(!window.isDestroyed() && !window.webContents.isDestroyed(), 'Compile QA renderer was destroyed');
      const application = await bounded(window.webContents.executeJavaScript(`(() => ({
        url: location.href, phase: window.napaliDiagnostics || null,
        load: document.getElementById('loadtxt')?.textContent || null,
        sourceSHA256: document.querySelector('meta[name="upstream-sha256"]')?.content || null,
        sourceControlExposed: !!window.napaliControl,
        hidden: document.hidden
      }))()`, false), 30000, 'Read own renderer compile state');
      invariant(new URL(application.url).origin === 'http://127.0.0.1:8796' && new URL(application.url).searchParams.get('compileonly') === '1', 'Compile-only origin or guard query changed');
      invariant(!window.isVisible() && !window.isFocused(), 'Compile QA window became visible or focused');
      const phase = application.phase;
      if (phase && JSON.stringify(phase) !== previousPhase) { result.phases.push(phase); previousPhase = JSON.stringify(phase); }
      progress('compiling-source-renderer-programs', application);
      if (application.load?.startsWith('Error:')) throw new Error(application.load);
      if (phase?.phase === 'renderer-programs-ready') {
        invariant(!application.sourceControlExposed, 'Compile-only guard continued into live scene rendering');
        result.tests.push({ name: 'all-four-source-renderer-programs-compiled', passed: true, evidence: application });
        result.status = 'passed'; break;
      }
      if (phase && /generate-|ocean-init-|first-frame-ready|ground-readback-/.test(phase.phase)) throw new Error('Compile-only guard allowed generation or rendered GPU work: ' + phase.phase);
      await pause(1000);
    }
    if (result.status !== 'passed') throw new Error('Full source renderer program compilation exceeded 20 minutes');
  } catch (error) {
    result.status = 'failed'; result.errors.push(error.stack || String(error));
  }
  result.finishedAt = new Date().toISOString(); result.elapsedSeconds = (Date.now() - started) / 1000;
  persist(); progress(result.status, null); return result;
}

module.exports = { runCompileAcceptance };
