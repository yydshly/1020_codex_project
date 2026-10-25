import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildIdleClip } from "./cat-a-idle-pose-v2.js";

// Measured from the original paw paths at the same .07 scale used in the study.
// Run is an authored bounding run, not a trot. Street speed deliberately plays
// that clip slower than the original 2.6 m/s paw-travel reference.
export const CAT_A_SPEEDS = Object.freeze({ walk: .48, slow: .30, run: 1.65, nativeRun: 2.6 });
const SCALE = .07;
const CONTACT_PHASE = .426;
const smooth = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const wrap = value => ((value % 1) + 1) % 1;

// Kept independent of rendering so collision stops and rapid input changes can
// be tested without replacing the author's skeleton with procedural motion.
export function createCatMotionState({ walkDuration = 1.125, runDuration = .583333313 } = {}) {
  const state = { phase: CONTACT_PHASE, idlePhase: CONTACT_PHASE, movingBlend: 0, runBlend: 0, speed: 0, cycleRate: 0,
    idleWeight: 1, walkWeight: 0, runWeight: 0, walkTime: CONTACT_PHASE * walkDuration, runTime: CONTACT_PHASE * runDuration,
    idleTime: 0, settleTime: 0, settleDuration: 0, settleRemaining: 0, turnStepSpeed: 0, mode: "idle" };
  let settleStartBlend = 0;
  function beginSettle() {
    // Begin while the controller is still decelerating. The feet are planted
    // and then repositioned in short separate steps by the actor's stop solver.
    // The Walk timeline only advances by actual travel, never by a fake speed.
    settleStartBlend = state.movingBlend;
    state.settleTime = 0;
    state.settleDuration = .54;
    state.settleRemaining = state.settleDuration;
    state.mode = "settling";
  }
  function update(delta, input = {}) {
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const speed = Math.max(0, Number.isFinite(input.speed) ? input.speed : 0);
    if (input.reset) {
      Object.assign(state, { phase: CONTACT_PHASE, idlePhase: CONTACT_PHASE, movingBlend: 0, runBlend: 0, speed: 0, cycleRate: 0,
        idleTime: 0, settleTime: 0, settleDuration: 0, settleRemaining: 0, turnStepSpeed: 0, mode: "idle" });
    } else {
      state.speed = speed;
      const turnRate = Number.isFinite(input.turnRate) ? Math.abs(input.turnRate) : 0;
      // Small stepping while negotiating a tight turn. The controller supplies
      // actual angular velocity; a requested turn against a wall is not enough.
      state.turnStepSpeed = !input.blocked && turnRate > .06 ? Math.min(.22,turnRate*.12) : 0;
      const effectiveSpeed = Math.max(speed,state.turnStepSpeed);
      const hasIntent = input.hasIntent ?? (speed > .015 || state.turnStepSpeed > .01);
      const stopRequested = (!hasIntent || input.blocked || input.desiredSpeed === 0) && speed < .30 && state.turnStepSpeed < .015;
      if (stopRequested && state.mode !== "idle" && state.mode !== "settling") beginSettle();
      if (!stopRequested && effectiveSpeed > .008) {
        state.mode = "moving";
        state.idleTime = 0;
        state.settleRemaining = 0;
        // On restart use the exact last contact phase, never snap back to .426.
        const moveTarget = Math.max(smooth(speed,.008,.12),smooth(state.turnStepSpeed,.02,.22)*.65);
        state.movingBlend = damp(state.movingBlend,moveTarget,11,dt);
        state.runBlend = damp(state.runBlend,smooth(speed,.65,1.2),9,dt);
        const stride = CAT_A_SPEEDS.walk * walkDuration * (1-state.runBlend)
          + CAT_A_SPEEDS.nativeRun * runDuration * state.runBlend;
        state.cycleRate = effectiveSpeed / stride;
        state.phase = wrap(state.phase + state.cycleRate*dt);
      } else if (state.mode === "settling") {
        state.settleTime = Math.min(state.settleDuration,state.settleTime+dt);
        const t = state.settleTime/state.settleDuration;
        const stride = CAT_A_SPEEDS.walk*walkDuration*(1-state.runBlend)+CAT_A_SPEEDS.nativeRun*runDuration*state.runBlend;
        state.cycleRate = speed/stride;
        state.phase = wrap(state.phase+state.cycleRate*dt);
        state.runBlend = damp(state.runBlend,0,16,dt);
        state.movingBlend = settleStartBlend*(1-smooth(t,0,1));
        state.settleRemaining = Math.max(0,state.settleDuration-state.settleTime);
        if (t >= 1) {
          state.movingBlend = 0; state.runBlend = 0;
          state.cycleRate = 0; state.mode = "idle"; state.idleTime = 0;
        }
      } else {
        state.mode = "idle"; state.idleTime += dt;
        state.movingBlend = damp(state.movingBlend,0,12,dt);
        state.runBlend = damp(state.runBlend,0,12,dt);
        state.cycleRate = 0;
      }
    }
    state.idleWeight = 1 - state.movingBlend;
    state.walkWeight = state.movingBlend * (1 - state.runBlend);
    state.runWeight = state.movingBlend * state.runBlend;
    // Both clips always have a phase, including when their blend weight is zero.
    // Repeated Shift taps therefore never restart a leg on an unrelated frame.
    state.walkTime = state.phase * walkDuration;
    state.runTime = state.phase * runDuration;
    return state;
  }
  return { state, update };
}

export async function createCat(THREE) {
  const gltf = await new GLTFLoader().loadAsync(new URL("./models/cat-a-study.glb", import.meta.url).href);
  const walk = gltf.animations.find(clip => clip.name === "Walk");
  const run = gltf.animations.find(clip => clip.name === "Run");
  if (!walk || !run) throw new Error("A 模型缺少原作 Walk / Run 动画");
  const object = new THREE.Group(); object.name = "SkaterCat_street_actor";
  const terrain = new THREE.Group(); terrain.name = "Whole_cat_slope_alignment";
  const modelFrame = new THREE.Group(); modelFrame.scale.setScalar(SCALE);
  object.add(terrain); terrain.add(modelFrame); modelFrame.add(gltf.scene);
  const model = gltf.scene;
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true; node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material.map) material.map.anisotropy = 4;
  });
  const mixer = new THREE.AnimationMixer(model);
  const idleResult = buildIdleClip(THREE,model,walk);
  const idleClip = idleResult.clip || idleResult;
  const actions = {
    idle: mixer.clipAction(idleClip), walk: mixer.clipAction(walk), run: mixer.clipAction(run)
  };
  for (const [name, action] of Object.entries(actions)) {
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    action.paused = true;
    action.setEffectiveWeight(name === "idle" ? 1 : 0);
  }
  actions.idle.time=0;
  mixer.update(0); object.updateMatrixWorld(true);
  const body = model.getObjectByName("Cat");
  if (!body?.isSkinnedMesh) throw new Error("A 模型缺少可校准落脚的身体蒙皮");
  body.computeBoundingBox();
  const bodyBounds = new THREE.Box3().setFromObject(body);
  const groundOffset = -bodyBounds.min.y;
  // Stand adaptation changes the sole plane. Keep the author's locomotion at
  // its original first-Walk grounding instead of raising every moving pose.
  actions.idle.setEffectiveWeight(0);actions.walk.setEffectiveWeight(1);actions.walk.time=0;
  mixer.update(0);object.updateMatrixWorld(true);body.computeBoundingBox();
  const walkGroundOffset=-new THREE.Box3().setFromObject(body).min.y;
  actions.idle.setEffectiveWeight(1);actions.walk.setEffectiveWeight(0);mixer.update(0);
  modelFrame.position.y = groundOffset;
  object.updateMatrixWorld(true);
  const motion = createCatMotionState({ walkDuration: walk.duration, runDuration: run.duration });
  let disposed = false, slope = 0, elapsed = 0, turnLook = 0, lastMode="idle", releaseTime=99, locomotionRelease=99;
  const sampleAhead = .22;
  const bones={}; model.traverse(node=>{if(node.isBone)bones[node.name]=node;});
  const findBone=name=>bones[name] || bones[name.replace(/[.]/g,"")];
  // AnimationMixer skips unchanged property writes. Restore its unmodified
  // result explicitly before each sample so idle additions and IK cannot drift.
  const basePose=Object.values(bones).map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
  const feet=[
    ["frontL","Toe_Pointer_L_front",["Foot_front_L2","Calf_Front_L","Thigh_front_L"],0],
    ["rearR","Toe_back_L_Pointer.002",["Foot_Back_R","Calf_back_R","Thigh_Back_R"],.11],
    ["frontR","Toe_Pointer_L_front.002",["Foot_front_L2.002","Calf_Front_R","Thigh_front_R"],.22],
    ["rearL","Toe_back_L_Pointer",["Foot_Back_L","Calf_back_L","Thigh_Back_L"],.33]
  ].map(([name,tip,joints,delay])=>{
    const effector=findBone(tip), chain=joints.map(findBone).filter(Boolean);
    if(!effector || chain.length!==3)throw new Error(`A 猫缺少 ${name} 腿骨`);
    const world=effector.getWorldPosition(new THREE.Vector3());
    return {name,effector,chain,delay,idleLocal:terrain.worldToLocal(world.clone()),lastWorld:world.clone(),startWorld:world.clone()};
  });
  const jointPosition=new THREE.Vector3(), tipPosition=new THREE.Vector3(), desiredVector=new THREE.Vector3(), currentVector=new THREE.Vector3(), solveTarget=new THREE.Vector3();
  const solveRotation=new THREE.Quaternion(), parentWorld=new THREE.Quaternion(), localAxis=new THREE.Vector3();
  const footGoals=new Map();
  let footCorrectionMax=0;
  function solveFoot(foot,requested) {
    foot.effector.getWorldPosition(tipPosition);
    // Limit any one-frame correction and keep the source chain's bend close.
    solveTarget.copy(requested);
    const displacement=solveTarget.distanceTo(tipPosition);
    if(displacement>.16)solveTarget.copy(tipPosition).lerp(requested,.16/displacement);
    const originals=foot.chain.map(bone=>bone.quaternion.clone());
    for(let iteration=0;iteration<6;iteration++){
      for(let index=0;index<foot.chain.length;index++){
        const joint=foot.chain[index];
        joint.getWorldPosition(jointPosition);foot.effector.getWorldPosition(tipPosition);
        currentVector.subVectors(tipPosition,jointPosition).normalize();
        desiredVector.subVectors(solveTarget,jointPosition).normalize();
        const angle=Math.acos(Math.max(-1,Math.min(1,currentVector.dot(desiredVector))));
        if(angle<1e-5)continue;
        localAxis.crossVectors(currentVector,desiredVector);
        if(localAxis.lengthSq()<1e-10)continue;
        joint.parent.getWorldQuaternion(parentWorld).invert();
        localAxis.normalize().applyQuaternion(parentWorld);
        solveRotation.setFromAxisAngle(localAxis,Math.min(.12,angle));
        joint.quaternion.premultiply(solveRotation);
        const total=originals[index].angleTo(joint.quaternion),limit=index===0?.45:.65;
        if(total>limit){const candidate=joint.quaternion.clone();joint.quaternion.slerpQuaternions(originals[index],candidate,limit/total);}
        joint.updateMatrixWorld(true);
      }
      foot.effector.getWorldPosition(tipPosition);
      if(tipPosition.distanceToSquared(solveTarget)<.000004)break;
    }
    foot.effector.getWorldPosition(tipPosition);
    footCorrectionMax=Math.max(footCorrectionMax,tipPosition.distanceTo(requested));
  }
  const axis=new THREE.Vector3(), actorQuaternion=new THREE.Quaternion(), parentQuaternion=new THREE.Quaternion(), rotationDelta=new THREE.Quaternion();
  function rotateInActorFrame(name,x,y,z,angle) {
    const bone=findBone(name); if(!bone || Math.abs(angle)<1e-7)return;
    // The original Blender bone axes are not anatomical yaw/pitch axes. Convert
    // an actor-space axis into the parent frame before premultiplication.
    terrain.getWorldQuaternion(actorQuaternion);
    bone.parent.getWorldQuaternion(parentQuaternion).invert();
    axis.set(x,y,z).applyQuaternion(actorQuaternion).applyQuaternion(parentQuaternion).normalize();
    rotationDelta.setFromAxisAngle(axis,angle);
    bone.quaternion.premultiply(rotationDelta);bone.updateMatrixWorld(true);
  }
  function pulse(time,start,end,edge=.6) {
    return smooth(time,start,start+edge)*(1-smooth(time,end-edge,end));
  }

  function update(delta, input = {}) {
    if (disposed) return;
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const state = motion.update(delta, input);
    elapsed = input.reset ? 0 : elapsed + dt;
    for(const saved of basePose){saved.bone.position.copy(saved.position);saved.bone.quaternion.copy(saved.quaternion);saved.bone.scale.copy(saved.scale);}
    actions.idle.setEffectiveWeight(state.idleWeight);
    actions.walk.setEffectiveWeight(state.walkWeight);
    actions.run.setEffectiveWeight(state.runWeight);
    actions.idle.time = 0;
    actions.walk.time = state.walkTime;
    actions.run.time = state.runTime;
    mixer.update(0);
    for(const saved of basePose){saved.position.copy(saved.bone.position);saved.quaternion.copy(saved.bone.quaternion);saved.scale.copy(saved.bone.scale);}
    let requestedSlope = 0;
    if (typeof input.sampleHeight === "function") {
      const dx = Math.sin(object.rotation.y) * sampleAhead;
      const dz = Math.cos(object.rotation.y) * sampleAhead;
      const front = input.sampleHeight(object.position.x + dx, object.position.z + dz);
      const back = input.sampleHeight(object.position.x - dx, object.position.z - dz);
      if (Number.isFinite(front) && Number.isFinite(back))
        requestedSlope = Math.max(-.48, Math.min(.48, -Math.atan2(front - back, sampleAhead * 2)));
    }
    slope = input.reset ? requestedSlope : damp(slope, requestedSlope, 7, dt);
    terrain.rotation.x = slope;
    modelFrame.position.y=walkGroundOffset*(1-state.idleWeight)+groundOffset*state.idleWeight;
    object.updateMatrixWorld(true);
    if(input.reset){turnLook=0;releaseTime=99;locomotionRelease=99;lastMode="idle";}
    if(state.mode==="settling" && lastMode!=="settling"){
      releaseTime=0;
      for(const foot of feet)foot.startWorld.copy(foot.lastWorld);
    }
    else releaseTime+=dt;
    if(state.mode==="moving" && lastMode!=="moving"){
      locomotionRelease=0;
      for(const foot of feet)foot.startWorld.copy(foot.lastWorld);
    }else locomotionRelease+=dt;
    lastMode=state.mode;
    const idle = state.idleWeight*smooth(state.idleTime,.12,.8);
    const breath = Math.sin(elapsed*Math.PI*2/3.7)*idle;
    // Chest-only expansion preserves the animated leg chains and paw positions.
    for(const name of ["Spine.003","Spine.004"]){
      const bone=findBone(name);if(bone){bone.scale.x*=1+.006*breath;bone.scale.z*=1+.006*breath;}
    }
    const cycle=state.idleTime%11.3, side=Math.floor(state.idleTime/11.3)%2 ? -1:1;
    const glance=side*.14*pulse(cycle,1.0,4.8,.85)*idle;
    const lower=.035*pulse(cycle,7.0,9.2,.7)*idle;
    const requestedLook=Math.max(-.10,Math.min(.10,(input.turnRate||0)*.06));
    turnLook=damp(turnLook,requestedLook,7,dt);
    rotateInActorFrame("Neck",0,1,0,.38*(glance+turnLook));
    rotateInActorFrame("Neck.002",0,1,0,.25*(glance+turnLook));
    rotateInActorFrame("Head",0,1,0,.37*(glance+turnLook));
    rotateInActorFrame("Neck",1,0,0,lower*.5+.004*breath);
    rotateInActorFrame("Head",1,0,0,lower*.5);
    const tailRelease=.055*Math.exp(-releaseTime*2.8)*Math.sin(releaseTime*6);
    const flick=.065*pulse(cycle,5.8,6.8,.4)*idle;
    rotateInActorFrame("Tail.004",0,0,1,tailRelease*.45+flick*.3);
    rotateInActorFrame("Tail.007",0,0,1,tailRelease+flick);
    const ear=.045*pulse(cycle,2.4,2.9,.15)*idle;
    rotateInActorFrame("Ear",0,1,0,ear);
    rotateInActorFrame("Ear.006",0,1,0,-ear*.7);
    object.updateMatrixWorld(true);
    footCorrectionMax=0;
    if(state.mode==="settling" || state.mode==="idle" || locomotionRelease<.16){
      for(const foot of feet){
        const goal=state.mode==="moving" ? foot.effector.getWorldPosition(new THREE.Vector3()) : terrain.localToWorld(foot.idleLocal.clone());
        if(state.mode==="moving"){
          goal.lerpVectors(foot.startWorld,goal,smooth(locomotionRelease,0,.16));
        }else if(state.mode==="settling"){
          const progress=smooth(state.settleTime,foot.delay,foot.delay+.21);
          goal.lerpVectors(foot.startWorld,goal,progress);
          goal.y+=.018*Math.sin(Math.PI*progress);
        }
        footGoals.set(foot.name,goal.toArray());
        solveFoot(foot,goal);
      }
    }
    for(const foot of feet)foot.effector.getWorldPosition(foot.lastWorld);
  }

  function dispose() {
    if (disposed) return;
    disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    model.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  return {
    object, update, dispose,
    metadata: { author: "JonasDichelle", license: "CC BY 3.0", source: "https://blendswap.com/blend/18519",
      asset: "models/cat-a-study.glb", originalClips: ["Walk", "Run"],
      idle: "Symmetric stance adapted from two original Walk poses, restrained breathing/gaze/ear motion, separate small foot placements while stopping",
      limitations: "Original Run tail loop seam remains. New idle and turn stepping are adaptations, not original authored clips. Limited stop-only IK, not general terrain/contact solving." },
    getDebugState() {
      const s = motion.state;
      return { source: "A / Skater Cat", elapsed, gait: { ...s, phase: s.phase, speed: s.speed,
        mode: s.mode === "settling" ? "settling" : s.movingBlend < .05 ? "idle" : s.runBlend > .5 ? "run" : "walk" },
        animation: { idleWeight: s.idleWeight, walkWeight: s.walkWeight, runWeight: s.runWeight,
          walkTime: s.walkTime, runTime: s.runTime, phase: s.phase, cyclesPerSecond: s.cycleRate },
        groundOffset, walkGroundOffset, slope, turnLook, footCorrectionMax, footGoals:Object.fromEntries(footGoals),
        idleAudit:idleResult.audit || null, scale: SCALE, nativeSpeeds: { walk: CAT_A_SPEEDS.walk, run: CAT_A_SPEEDS.nativeRun } };
    }
  };
}
