import { getCoursePracticeComparison, resumeCoursePractice } from './course-practice.js';
import { getCourseSafetyModel, courseCarPolygon } from './course-safety.js';
import { getCourseReviewGuidance } from './course-review-guide.js';

const $ = id => document.getElementById(id);
const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const line = (text, className = '') => { const element = document.createElement('li'); element.textContent = text; element.className = className; return element; };
let lastReview = null, currentSession = null;
const checkSignatures = new Map();
export function courseRiskLabel(event) {
  const type = event?.type ?? '';
  if (type.startsWith('mirror-')) return '外镜擦碰';
  if (type === 'collision') return '车身碰撞';
  if (type === 'opposing-line') return '轮胎压实线';
  if (type === 'parking-line') return '车身触库线';
  if (type === 'road-edge' || type === 'boundary') return '车身越界';
  if (type === 'edge-line' || type === 'solid-line-proximity') return '车身余量';
  if (type === 'proximity') return '物体间距';
  return '';
}

function renderChecks(id, checks = []) {
  const signature = JSON.stringify(checks.map(({ id, label, done, detail }) => [id, label, done, detail]));
  if (id === 'practice-checks' && checkSignatures.get(id) === signature) return;
  if (id === 'practice-checks') checkSignatures.set(id, signature);
  $(id).replaceChildren(...checks.map(check => line(`${check.done ? '已记录' : '待完成'} · ${check.label}${check.detail ? `：${check.detail}` : ''}`, check.done ? 'check-done' : 'check-pending')));
}

export function renderCoursePractice(session) {
  currentSession = session;
  if (!session) return;
  const review = session.phase === 'review' ? session.review : null;
  $('practice-live').hidden = Boolean(review); $('practice-review').hidden = !review;
  $('manual-controls').hidden = Boolean(review);
  $('practice-title').textContent = session.plan.title;
  $('practice-objective').textContent = session.plan.objective;
  const checks = session.checks ?? [], done = checks.filter(check => check.done).length;
  $('practice-progress-text').textContent = `${done} / ${checks.length} 个目标`;
  $('practice-progress').value = checks.length ? done / checks.length : 0;
  $('practice-current-task').textContent = session.currentTask
    ? `${session.currentTask.label}${session.currentTask.id === 'route' ? `（剩余约 ${number(session.progress?.remaining, 0)} m）` : ''}`
    : session.plan.completionHint;
  $('practice-observe').hidden = !session.currentTask?.gaze;
  const feedback = session.feedback, feedbackText = feedback ? `${feedback.title}${feedback.detail ? ` · ${feedback.detail}` : ''}` : '';
  $('practice-feedback').hidden = !feedbackText || Boolean(review);
  if ($('practice-feedback').textContent !== feedbackText) $('practice-feedback').textContent = feedbackText;
  $('practice-feedback').dataset.type = feedback?.type ?? 'info';
  $('practice-scope').textContent = session.plan.scope;
  $('practice-limitations').textContent = (session.plan.limitations ?? []).join('；');
  renderChecks('practice-checks', checks);
  if (!review) { lastReview = null; return; }
  if (lastReview === review) return;
  lastReview = review;
  const canResume = resumeCoursePractice(session) !== session;
  $('practice-resume').hidden = !canResume;
  $('practice-retry').hidden = canResume;
  $('practice-review-title').textContent = review.title;
  const guidance = getCourseReviewGuidance(session);
  $('practice-review-summary').textContent = guidance.summary;
  if ($('practice-review-focus-label')) $('practice-review-focus-label').textContent = guidance.focusLabel;
  $('practice-review-focus').textContent = guidance.focus;
  $('practice-review-action').textContent = guidance.action;
  $('practice-review-retry-point').textContent = guidance.retryPoint;
  $('practice-review-result').textContent = { complete: '基础目标达成', incomplete: '有目标尚未完成', error: '需要纠正后再练' }[review.outcome] ?? '本次复盘';
  $('practice-review').dataset.outcome = review.outcome;
  $('practice-retry').disabled = !guidance.canRetry;
  $('practice-retry').textContent = guidance.retryButtonLabel;
  $('practice-review-errors').replaceChildren(...(review.errors ?? []).map(error => line(`${number(error.elapsed)} 秒 · ${courseRiskLabel(error) ? `【${courseRiskLabel(error)}】` : ''}${error.title}：${error.detail ?? ''}`)));
  if (!(review.errors ?? []).length) $('practice-review-errors').append(line(review.outcome === 'complete'
    ? '本章目标已完成，未记录到已覆盖的道路或碰撞风险。可以对照轨迹后重练，或选择下一章。'
    : '本次没有记录到已覆盖的道路或碰撞风险；请继续核对未完成目标。'));
  const metrics = review.metrics ?? {};
  $('practice-review-metrics').replaceChildren(...[
    ['模拟用时', `${number(metrics.duration)} s`], ['行驶路程', `${number(metrics.travelled)} m`],
    ['最高车速', `${number(metrics.peakSpeedKmh)} km/h`], ['切换观察', `${metrics.observations ?? 0} 次`],
  ].map(([label, value]) => { const element = document.createElement('span'); const name = document.createElement('small'); name.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; element.append(name, strong); return element; }));
  renderChecks('practice-review-checks', review.checks);
  for (const steering of metrics.steering ?? []) $('practice-review-checks').append(line(`${steering.label}：${steering.judgment}${Number.isFinite(steering.deltaMeters) ? `（相对模型示范 ${number(steering.deltaMeters)} m）` : ''}`));
  $('practice-review-limitations').textContent = [...new Set(review.limitations ?? [])].join(' ');
  drawCoursePracticeComparison(session);
}

export function drawCoursePracticeComparison(session = currentSession) {
  if (!session?.review) return;
  const comparison = getCoursePracticeComparison(session), canvas = $('practice-review-map');
  const actual = comparison.actual ?? [], reference = comparison.reference ?? [];
  const moved = actual.some(point => Math.hypot(point.x - actual[0].x, point.z - actual[0].z) > .01);
  canvas.hidden = !moved;
  if (!moved) {
    $('practice-review-caption').textContent = '本次没有可比较的行驶轨迹，请对照下方操作目标与错误记录。模拟用时在教学暂停时冻结。';
    return;
  }
  const width = Math.max(300, canvas.getBoundingClientRect().width || 780), height = 260;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.fillStyle = '#f5f7f0'; ctx.fillRect(0, 0, width, height);
  const all = actual.length ? actual : reference;
  if (!all.length) { $('practice-review-caption').textContent = '本次尚未产生可比较的行驶轨迹。'; return; }
  // Focus on the real driven section; the reference stays in world coordinates.
  let minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  let minZ = Math.min(...all.map(p => p.z)), maxZ = Math.max(...all.map(p => p.z));
  const padding = Math.max(4, Math.max(maxX - minX, maxZ - minZ) * .15);
  minX -= padding; maxX += padding; minZ -= padding; maxZ += padding;
  const sideways = maxZ - minZ > maxX - minX;
  const margin = 26, scale = Math.min((width - 2 * margin) / (sideways ? maxZ - minZ : maxX - minX), (height - 2 * margin) / (sideways ? maxX - minX : maxZ - minZ));
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  const screen = point => ({ x: width / 2 + (sideways ? point.z - centerZ : point.x - centerX) * scale,
    y: height / 2 - (sideways ? point.x - centerX : point.z - centerZ) * scale });
  const grid = Math.max(1, 10 ** Math.floor(Math.log10(36 / scale)) * 2);
  ctx.save(); ctx.beginPath(); ctx.rect(margin, margin, width - margin * 2, height - margin * 2); ctx.clip();
  const polygon = points => {
    ctx.beginPath(); points.forEach((point, i) => { const p = screen(point); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath();
  };
  const safety = getCourseSafetyModel(session.chapter);
  ctx.fillStyle = '#e4e9e2';
  for (const road of safety.roads) {
    const points = road.kind === 'rect'
      ? [{ x: road.left, z: road.back }, { x: road.right, z: road.back }, { x: road.right, z: road.front }, { x: road.left, z: road.front }]
      : road.points;
    polygon(points); ctx.fill();
  }
  ctx.strokeStyle = '#cfd9cd'; ctx.lineWidth = .7;
  for (let x = Math.floor(minX / grid) * grid; x <= maxX; x += grid) { const a = screen({ x, z: minZ }), b = screen({ x, z: maxZ }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let z = Math.floor(minZ / grid) * grid; z <= maxZ; z += grid) { const a = screen({ x: minX, z }), b = screen({ x: maxX, z }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (const line of safety.lines) {
    const a = screen(line.a), b = screen(line.b);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = line.type === 'edge-line' ? '#fff' : '#cfb04a';
    ctx.lineWidth = Math.max(1, line.width * scale); ctx.stroke();
  }
  const stroke = (points, color, lineWidth, dash = []) => {
    if (!points.length) return;
    ctx.beginPath(); points.forEach((point, i) => { const p = screen(point); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  };
  stroke(reference, '#a97b28', 2.2, [6, 4]); stroke(actual, '#267d9a', 3);
  if (session.lastPose) {
    polygon(courseCarPolygon(session.lastPose)); ctx.fillStyle = '#267d9a26'; ctx.fill(); ctx.strokeStyle = '#267d9a'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  for (const error of session.review.errors ?? []) if (error.position || error.pose) { const p = screen(error.position || error.pose); ctx.fillStyle = '#b64d37'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); }
  if (actual.length) { const p = screen(actual[0]); ctx.fillStyle = '#285b40'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore(); ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#55704f'; ctx.fillText(`每格 ${number(grid, 0)} m · 本次行驶区段 · 等比例`, margin, height - 9);
  $('practice-review-caption').textContent = `灰色：道路；黄白实线：检测标线；蓝色：本次轨迹与终点车身；金色虚线：模型示范；绿点：起点；红点：风险。保持等比例，聚焦本次行驶区段。${comparison.caption ?? ''}`;
}
