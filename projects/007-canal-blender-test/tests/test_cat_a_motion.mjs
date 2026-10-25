import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../web/cat-a-actor.js", import.meta.url), "utf8");
const pureSource = source.slice(0, source.indexOf("function freezeClip"))
  .replace(/^import .*;\r?$/gm, "").replace(/export /g, "");
const context = vm.createContext({});
vm.runInContext(pureSource + ";this.createMotion=createCatMotionState;", context);
const make = () => context.createMotion();

function invariant(s) {
  assert.ok(Object.values(s).every(Number.isFinite), "All playback state must stay finite");
  assert.ok(s.phase >= 0 && s.phase < 1);
  for (const name of ["idleWeight", "walkWeight", "runWeight"]) assert.ok(s[name] >= 0 && s[name] <= 1);
  assert.ok(Math.abs(s.idleWeight + s.walkWeight + s.runWeight - 1) < 1e-10);
}

test("collision stop settles to a stable original contact pose without replaying run", () => {
  const motion = make();
  for (let i=0;i<180;i++) motion.update(1/60,{speed:1.65});
  assert.ok(motion.state.runWeight > .99);
  for (let i=0;i<120;i++) invariant(motion.update(1/60,{speed:0}));
  assert.ok(motion.state.idleWeight > .999);
  const phase = motion.state.phase;
  motion.update(1/60,{speed:0});
  assert.equal(motion.state.phase,phase);
});

test("rapid walk/run changes preserve one phase and bounded weight transitions", () => {
  const motion = make();
  let previous = 0;
  for (let i=0;i<300;i++) {
    const s=motion.update(1/60,{speed:i%12<6?.48:1.65});
    invariant(s);
    assert.ok(Math.abs(s.runWeight-previous)<.16,"A Shift tap must not hard-swap poses");
    assert.ok(Math.abs(s.walkTime/1.125-s.runTime/.583333313)<1e-10,"Clips must share phase");
    previous=s.runWeight;
  }
});

test("cycle rate matches measured stride speed and reset is deterministic", () => {
  const motion=make();
  for(let i=0;i<180;i++) motion.update(1/60,{speed:.48});
  assert.ok(Math.abs(motion.state.cycleRate-1/1.125)<1e-7);
  for(let i=0;i<180;i++) motion.update(1/60,{speed:1.65});
  assert.ok(Math.abs(motion.state.cycleRate-1.65/(2.6*.583333313))<1e-7);
  const s=motion.update(0,{reset:true,speed:1.65});
  assert.equal(s.phase,.426);assert.equal(s.idleWeight,1);invariant(s);
});
