// Read-only model reproduction from the project root:
// node notes/full-audit-20261024/reproduce-review.mjs
import { createDemonstration, createProgress } from '../../src/lesson.js';
import { stepVehicle } from '../../src/vehicle.js';
import { assessCentering } from '../../src/steering-coach.js';
import { analyzePractice } from '../../src/review.js';

const demo = createDemonstration();
for (const [name, index, speed, input] of [
  ['stopped-X', 1495, 0, { center: true }],
  ['slider-1.2-kmh', 1484, -2.5 / 3.6, { center: true, reverse: true, speedLimit: 1.2 / 3.6 }],
]) {
  let state = { ...demo.frames[index], speed };
  const start = { ...state }, frames = [{ ...state }];
  for (let i = 1; i <= 45; i++) {
    state = stepVehicle(state, input, 1 / 120);
    if (i % 9 === 0) frames.push({ ...state, reviewCenter: true });
  }
  const actual = assessCentering(state, 'right', { completed: true });
  const review = analyzePractice(frames, demo, { ...createProgress(), started: true, checkedA: true }).attempts[0].center;
  console.log(JSON.stringify({
    name, actualResidualDeg: actual.predictedResidualDegrees,
    actualMovedM: state.distance - start.distance, actualKind: actual.kind,
    actualStraightSafe: actual.prediction.safe,
    actualStraightCrossesAtM: actual.prediction.crossingDistance,
    reviewKind: review.kind, reviewPredictedResidualDeg: review.predictedResidual,
    reviewSaysSafe: review.prediction.safe,
  }));
}
