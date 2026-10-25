import { prepareLimbSkin } from "./cat-v8-limb-skin.js";
import { prepareHockRig } from "./cat-v8-hock-rig.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The licensed surface and UVs come from the preserved cat asset. This module
// animates its skin with a deliberately conservative four-beat walk.
export async function createCat(THREE) {
  const [loaded, metadata] = await Promise.all([
    new GLTFLoader().loadAsync(new URL("./models/cat-v3-rig.glb", import.meta.url).href),
    fetch(new URL("./models/cat-v3-rig.json", import.meta.url)).then(response => {
      if (!response.ok) throw new Error("Cat rig metadata could not be loaded");
      return response.json();
    })
  ]);
  const object = new THREE.Group();
  object.name = "RoamCatV8";
  object.userData = { forwardAxis: "+Z", upAxis: "+Y", groundAnchor: "paw soles", version: "gait-study-08", source: "cat-v3-rig.glb" };
  const model = loaded.scene;
  object.add(model);
  object.updateMatrixWorld(true);
  const hockRig = prepareHockRig(THREE, object);
  const bones = new Map(), rest = new Map(), materials = new Set(), geometries = new Set(), textures = new Set();
  model.traverse(part => {
    if (part.isBone) {
      bones.set(part.name, part);
      rest.set(part.name, { position: part.position.clone(), quaternion: part.quaternion.clone(), worldQuaternion: part.getWorldQuaternion(new THREE.Quaternion()) });
    }
    if (!part.isMesh) return;
    part.castShadow = true; part.receiveShadow = true; part.frustumCulled = false;
    geometries.add(part.geometry);
    for (const material of (Array.isArray(part.material) ? part.material : [part.material])) {
      materials.add(material);
      material.roughness = Math.max(.82, material.roughness ?? .82);
      material.metalness = 0;
      for (const key of ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap"]) if (material[key]) textures.add(material[key]);
    }
  });
  const limbSkin = prepareLimbSkin(THREE, object);
  function bone(name) {
    const result = bones.get(name);
    if (!result) throw new Error("Cat rig is missing bone: " + name);
    return result;
  }
  function localPoint(entry) {
    return object.worldToLocal(entry.getWorldPosition(new THREE.Vector3()));
  }
  const sourceSoles = {
    fore_left: [-.0427,.0032,.1127], fore_right: [.0422,.0017,.1027],
    hind_left: [-.0541,.0031,-.1337], hind_right: [.0520,0,-.1638]
  };
  function legDefinition(key) {
    const definitions = metadata.legs;
    if (Array.isArray(definitions)) return definitions.find(entry => entry.id === key || entry.name === key) || {};
    return definitions?.[key] || {};
  }
  const legs = Object.entries(sourceSoles).map(([key, fallbackSole], index) => {
    const definition = legDefinition(key);
    const upper = bone(definition.upper || key+"_upper");
    const lower = bone(definition.lower || key+"_lower");
    const paw = bone(definition.paw || key+"_paw");
    const hip = localPoint(upper), knee = localPoint(lower), ankle = localPoint(paw);
    const sole = new THREE.Vector3().fromArray(definition.sole || fallbackSole);
    const neutralSole = sole.clone(); neutralSole.y = 0;
    const pawOffset = ankle.clone().sub(sole);
    const upperDirection = knee.clone().sub(hip), lowerDirection = ankle.clone().sub(knee);
    const restAxis = ankle.clone().sub(hip).normalize();
    const bend = knee.clone().sub(hip).addScaledVector(restAxis,-knee.clone().sub(hip).dot(restAxis)).normalize();
    return { key, index, upper, lower, paw, hip, knee, ankle, neutralSole, pawOffset, upperDirection, lowerDirection,
      upperLength: upperDirection.length(), lowerLength: lowerDirection.length(), bend,
      planted: new THREE.Vector3(), foot: new THREE.Vector3(), swingStart: new THREE.Vector3(), swingEnd: new THREE.Vector3(),
      swing: false, settling: false, settleProgress: 0, swingTime: 0, swingDuration: .25, lastPhase: 0,
      footYaw: 0, reachError: 0 };
  });
  let elapsed = 0, phase = 0, movement = 0, travelSinceRest = 0, restTime = 0, wasMoving = false, initialized = false, disposed = false, previousYaw = 0, wasTurning = false;
  const previousRoot = new THREE.Vector3();
  const modelRestPosition = model.position.clone();
  const rootQuaternion = new THREE.Quaternion();
  const inverseParent = new THREE.Quaternion();
  const directionRotation = new THREE.Quaternion();
  const desiredQuaternion = new THREE.Quaternion();
  const pawOrientation = new THREE.Quaternion(), pawDelta = new THREE.Quaternion();
  const torsoBob = { amount: 0 };
  const worldFoot = new THREE.Vector3();
  const localFoot = new THREE.Vector3();
  const yawQuaternion = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0,1,0);
  const rootVelocity = new THREE.Vector3(), predictedRoot = new THREE.Vector3();
  const shoulderOffset = new THREE.Vector3(), parentRotation = new THREE.Quaternion();
  const poseEuler = new THREE.Euler(0,0,0,'YXZ');
  const gait = { speed: 0, phase: 0, stanceFeet: 4, maxReachError: 0, stride: .25, duty: .64 };
  const contactPhase = { hind_right: 0, fore_right: .20, hind_left: .50, fore_left: .70 };
  const smoother = t => t*t*t*(10+t*(-15+6*t));
  function groundHeight(state, x, z) {
    const value = state.sampleHeight?.(x,z);
    return Number.isFinite(value) ? value : object.position.y;
  }
  function neutralWorld(leg, target, state) {
    object.localToWorld(target.copy(leg.neutralSole));
    target.y = groundHeight(state,target.x,target.z);
    return target;
  }
  function resetFeet(state) {
    object.updateMatrixWorld(true);
    for (const leg of legs) {
      neutralWorld(leg,leg.planted,state);
      leg.foot.copy(leg.planted); leg.swingStart.copy(leg.planted); leg.swingEnd.copy(leg.planted);
      leg.swing = false; leg.settling = false; leg.footYaw = object.rotation.y; leg.reachError = 0;
    }
    phase = 0; travelSinceRest = 0; restTime = 0; wasMoving = false; wasTurning = false;
    previousRoot.copy(object.position); previousYaw=object.rotation.y; initialized = true;
  }
  function setLocalRotation(name, x,y,z) {
    const entry = bones.get(name);
    if (!entry) return;
    entry.quaternion.copy(rest.get(name).quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));
  }
  function rootFrameOffset(name, x, y, z) {
    const entry=bone(name), world=entry.getWorldQuaternion(new THREE.Quaternion());
    entry.parent.getWorldQuaternion(inverseParent).invert();
    const q=new THREE.Quaternion().setFromEuler(poseEuler.set(x,y,z));
    const offset=rootQuaternion.clone().multiply(q).multiply(rootQuaternion.clone().invert());
    entry.quaternion.copy(inverseParent).multiply(offset).multiply(world);
    entry.updateMatrixWorld(true);
  }
  function flightTarget(leg, state, remaining, stride, duty, translationWeight, yawRate) {
    // Capture one predicted landing at lift-off, so the paw comes to rest in
    // the world instead of chasing a root-relative target right into contact.
    predictedRoot.copy(object.position).addScaledVector(rootVelocity,Math.min(.55,remaining));
    yawQuaternion.setFromAxisAngle(upAxis,object.rotation.y+yawRate*Math.min(.55,remaining));
    localFoot.copy(leg.neutralSole);
    localFoot.z+=((leg.hip.z-leg.ankle.z)+stride*duty*.50)*translationWeight;
    leg.swingEnd.copy(localFoot).applyQuaternion(yawQuaternion).add(predictedRoot);
    leg.swingEnd.y=groundHeight(state,leg.swingEnd.x,leg.swingEnd.z);
  }
  function orientBone(entry, restDirection, targetDirection) {
    const restWorldDirection = restDirection.clone().normalize().applyQuaternion(rootQuaternion);
    const targetWorldDirection = targetDirection.clone().normalize();
    directionRotation.setFromUnitVectors(restWorldDirection,targetWorldDirection);
    desiredQuaternion.copy(rootQuaternion).multiply(rest.get(entry.name).worldQuaternion).premultiply(directionRotation);
    entry.parent.getWorldQuaternion(inverseParent).invert();
    entry.quaternion.copy(inverseParent).multiply(desiredQuaternion);
    entry.updateMatrixWorld(true);
  }
  function solveLeg(leg, state, swingFraction) {
    const hip = leg.upper.getWorldPosition(new THREE.Vector3());
    yawQuaternion.setFromAxisAngle(upAxis,leg.footYaw-object.rotation.y);
    pawOrientation.copy(rootQuaternion).multiply(yawQuaternion).multiply(rest.get(leg.paw.name).worldQuaternion);
    if (leg.swing) pawOrientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.14*Math.sin(swingFraction*Math.PI)));
    pawDelta.copy(pawOrientation).multiply(rest.get(leg.paw.name).worldQuaternion.clone().invert());
    const wanted = leg.foot.clone().add(leg.pawOffset.clone().applyQuaternion(pawDelta));
    const axis = wanted.clone().sub(hip);
    const distance = Math.max(.0001,axis.length()); axis.divideScalar(distance);
    const reach = Math.min(leg.upperLength+leg.lowerLength-.0002,Math.max(Math.abs(leg.upperLength-leg.lowerLength)+.0002,distance));
    const target = hip.clone().addScaledVector(axis,reach);
    leg.reachError = Math.abs(distance-reach);
    const projection = (leg.upperLength**2-leg.lowerLength**2+reach**2)/(2*reach);
    const bendHeight = Math.sqrt(Math.max(0,leg.upperLength**2-projection**2));
    const bend = leg.bend.clone().applyQuaternion(rootQuaternion);
    bend.addScaledVector(axis,-bend.dot(axis));
    if (bend.lengthSq() < .00001) bend.set(0,0,leg.key.startsWith("fore")?-1:1).applyQuaternion(rootQuaternion).addScaledVector(axis,-bend.dot(axis));
    bend.normalize();
    const knee = hip.clone().addScaledVector(axis,projection).addScaledVector(bend,bendHeight);
    orientBone(leg.upper,leg.upperDirection,knee.clone().sub(hip));
    const actualKnee = leg.lower.getWorldPosition(new THREE.Vector3());
    orientBone(leg.lower,leg.lowerDirection,target.clone().sub(actualKnee));
    // Keep the paw's bind orientation during support; only lift its toes modestly.
    leg.paw.parent.getWorldQuaternion(inverseParent).invert();
    leg.paw.quaternion.copy(inverseParent).multiply(pawOrientation);
    leg.paw.updateMatrixWorld(true);
  }
  function step(delta,state={}) {
    if (disposed) return;
    const dt = Math.min(.08,Math.max(0,Number.isFinite(delta)?delta:0));
    elapsed = Number.isFinite(state.time) ? state.time : elapsed+dt;
    object.updateMatrixWorld(true);
    if (!initialized || state.reset || object.position.distanceTo(previousRoot) > .8) resetFeet(state);
    const distance = Math.hypot(object.position.x-previousRoot.x,object.position.z-previousRoot.z);
    const speed = dt>0?distance/dt:0;
    const yawChange=Math.atan2(Math.sin(object.rotation.y-previousYaw),Math.cos(object.rotation.y-previousYaw));
    const turnDistance=Math.abs(yawChange)*.18;
    rootVelocity.copy(object.position).sub(previousRoot).multiplyScalar(dt>0?1/dt:0); rootVelocity.y=0;
    const locomotionDistance=Math.max(distance,turnDistance);
    const translationWeight=locomotionDistance>.000001?Math.min(1,distance/locomotionDistance):0;
    const rotationWeight=locomotionDistance>.000001?Math.min(1,turnDistance/locomotionDistance):0;
    const turning=Math.abs(yawChange)>.001;
    // Paws planted during a pivot start near the hip instead of ahead of it.
    // Resume with short steps, while preserving footfall phase and contacts.
    if(wasTurning&&!turning)travelSinceRest=0;
    wasTurning=turning;
    const moving = ((state.moving ?? speed>.005) && speed>.004) || Math.abs(yawChange)>.0003;
    if (moving) { if (!wasMoving) {phase=.50;travelSinceRest=0;} travelSinceRest+=locomotionDistance;restTime=0; }
    else restTime+=dt;
    movement += (Number(moving)-movement)*(1-Math.exp(-dt*9));
    const stride = .18+.07*THREE.MathUtils.smoothstep(travelSinceRest,0,.42);
    const duty = .64;
    const phaseRate=dt>0?locomotionDistance/(stride*dt):0;
    phase = (phase+locomotionDistance/stride)%1;
    for (const [name,entry] of bones) {
      entry.position.copy(rest.get(name).position); entry.quaternion.copy(rest.get(name).quaternion);
    }
    torsoBob.amount = movement*Math.sin(phase*Math.PI*4+.5)*.002+(1-movement)*Math.sin(elapsed*1.9)*.0007;
    model.position.copy(modelRestPosition); model.position.y += torsoBob.amount-.006-movement*.013;
    model.position.x += Math.sin(phase*Math.PI*2)*movement*.002;
    setLocalRotation("tail_01",0,Math.sin(elapsed*.7)*.035,Math.sin(elapsed*.55)*.016);
    setLocalRotation("tail_02",0,Math.sin(elapsed*.7-.5)*.026,Math.sin(elapsed*.55-.4)*.012);
    setLocalRotation("tail_03",0,Math.sin(elapsed*.7-1)*.018,0);
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(rootQuaternion);
    rootFrameOffset('spine',Math.sin(phase*Math.PI*4)*movement*.004,
      Math.sin(phase*Math.PI*2)*movement*.012,Math.sin(phase*Math.PI*2+.5)*movement*.008);
    rootFrameOffset('chest',Math.sin(phase*Math.PI*4+1)*movement*.004,
      -Math.sin(phase*Math.PI*2)*movement*.014,-Math.sin(phase*Math.PI*2+.5)*movement*.006);
    object.updateMatrixWorld(true);
    let maxReachError = 0;
    for (const leg of legs) {
      const front=leg.key.startsWith("fore"),left=leg.key.endsWith("left");
      const localPhase=(phase-contactPhase[leg.key]+1)%1;
      if(front) {
        const segment=localPhase<duty?localPhase/duty:(localPhase-duty)/(1-duty);
        const scapulaZ=(localPhase<duty?Math.cos(segment*Math.PI):-Math.cos(segment*Math.PI))*.008*movement;
        const scapulaY=Math.sin(segment*Math.PI)*(localPhase<duty?.002:-.002)*movement;
        shoulderOffset.set(0,scapulaY,scapulaZ).applyQuaternion(rootQuaternion);
        leg.upper.parent.getWorldQuaternion(parentRotation).invert(); shoulderOffset.applyQuaternion(parentRotation);
        leg.upper.position.add(shoulderOffset); leg.upper.updateMatrixWorld(true);
      }
      let swingFraction=0;
      if (!moving) {
        if (leg.swing) {leg.settling=true;leg.settleProgress=0;leg.swingStart.copy(leg.foot);}
        neutralWorld(leg,leg.swingEnd,state);
        const delay=(front?(left?0:2):(left?3:1))*.12;
        if(!leg.settling&&restTime>=delay&&leg.foot.distanceTo(leg.swingEnd)>.045) {
          leg.settling=true;leg.settleProgress=0;leg.swingStart.copy(leg.foot);
        }
        if(leg.settling) {
          leg.settleProgress=Math.min(1,leg.settleProgress+dt/.22);
          const f=leg.settleProgress,ease=smoother(f);
          leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,ease);
          leg.foot.y+=16*f*f*(1-f)*(1-f)*.008;
          if(f===1){leg.settling=false;leg.planted.copy(leg.foot);}
        } else leg.foot.copy(leg.planted);
        const turn=Math.atan2(Math.sin(object.rotation.y-leg.footYaw),Math.cos(object.rotation.y-leg.footYaw));
        leg.footYaw+=turn*(1-Math.exp(-dt*7));
        leg.swing=false;
      } else {
        leg.settling=false;
        // Neutral standing feet are halfway through their support range, not
        // at a freshly planted forward contact. Allow a first/recovery step
        // before a planted limb reaches its extension limit.
        const hip=leg.upper.getWorldPosition(new THREE.Vector3());
        const stanceRotation=rootQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(upAxis,leg.footYaw-object.rotation.y));
        const wanted=leg.foot.clone().add(leg.pawOffset.clone().applyQuaternion(stanceRotation));
        const relativeAnkle=wanted.clone().sub(hip).applyQuaternion(rootQuaternion.clone().invert());
        const reachReserve=travelSinceRest<stride*1.1?.010:.003;
        const needsRecovery=(relativeAnkle.z<-.025||turning)&&wanted.distanceTo(hip)>leg.upperLength+leg.lowerLength-reachReserve;
        const liftCrossing=localPhase>=duty&&(leg.lastPhase<duty||!wasMoving);
        if(!leg.swing&&(liftCrossing||needsRecovery)) {
          leg.swing=true; leg.swingTime=0; leg.swingStart.copy(leg.foot);
          leg.swingDuration=THREE.MathUtils.clamp((1-duty)/Math.max(.3,phaseRate),.18,.5);
          flightTarget(leg,state,leg.swingDuration,stride,duty,translationWeight,dt?yawChange/dt:0);
        }
        if(leg.swing) {
          leg.swingTime+=dt; swingFraction=THREE.MathUtils.clamp(leg.swingTime/leg.swingDuration,0,1);
          // Re-estimate only in early swing when acceleration changes the
          // route. The final approach retains a fixed world landing.
          if(swingFraction<.4) flightTarget(leg,state,leg.swingDuration-leg.swingTime,stride,duty,translationWeight,dt?yawChange/dt:0);
          leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,smoother(swingFraction));
          const lift=swingFraction*swingFraction*(1-swingFraction)**3/(.4*.4*.6**3);
          leg.foot.y=groundHeight(state,leg.foot.x,leg.foot.z)+lift*.017;
          leg.footYaw=object.rotation.y;
          if(swingFraction===1) { leg.swing=false; leg.planted.copy(leg.swingEnd); leg.foot.copy(leg.planted); }
        } else {
          leg.planted.y=groundHeight(state,leg.planted.x,leg.planted.z); leg.foot.copy(leg.planted);
        }
      }
      leg.lastPhase=localPhase;
      solveLeg(leg,state,swingFraction);
      maxReachError=Math.max(maxReachError,leg.reachError);
    }
    object.updateMatrixWorld(true);
    Object.assign(gait,{speed,phase,stride,duty,cycleSeconds:phaseRate>.001?1/phaseRate:null,
      angularSpeed:dt?yawChange/dt:0,stanceFeet:legs.filter(leg=>!leg.swing&&!leg.settling).length,maxReachError});
    previousRoot.copy(object.position);previousYaw=object.rotation.y;wasMoving=moving;
  }
  function update(delta,state={}) {
    const dt=Math.min(.08,Math.max(0,Number.isFinite(delta)?delta:0));
    if(dt<=1/60+1e-8||!initialized||state.reset||object.position.distanceTo(previousRoot)>.8) {
      step(dt,state); return;
    }
    // A slow render frame must not skip lift-off/contact events. Interpolate
    // the actual root path while integrating at 60 Hz; repeating the end pose
    // would instead alternate double speed and zero speed inside the solver.
    const start=previousRoot.clone(), end=object.position.clone(), startYaw=previousYaw, endYaw=object.rotation.y;
    const yawDelta=Math.atan2(Math.sin(endYaw-startYaw),Math.cos(endYaw-startYaw));
    const count=Math.ceil(dt/(1/60)), subDt=dt/count;
    for(let i=1;i<=count;i++) {
      object.position.lerpVectors(start,end,i/count); object.rotation.y=startYaw+yawDelta*i/count;
      step(subDt,{...state,time:Number.isFinite(state.time)?state.time-dt+subDt*i:undefined});
    }
    object.position.copy(end); object.rotation.y=endYaw; object.updateMatrixWorld(true);
  }
  function getDebugState() {
    object.updateMatrixWorld(true);
    return { version: object.userData.version, root:object.position.toArray(), gait:{...gait}, limbSkin:limbSkin.stats, hockRig:hockRig.stats, bones:bones.size, feet:legs.map(leg=>{
      const renderedRotation=leg.paw.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get(leg.paw.name).worldQuaternion.clone().invert());
      const renderedSole=leg.paw.getWorldPosition(new THREE.Vector3()).sub(leg.pawOffset.clone().applyQuaternion(renderedRotation));
      return {name:leg.key,stance:!leg.swing&&!leg.settling,phase:(phase-contactPhase[leg.key]+1)%1,
        world:leg.foot.toArray(),renderedWorld:renderedSole.toArray(),groundClearance:leg.foot.y-object.position.y,reachError:leg.reachError};
    })};
  }
  function dispose() {
    if(disposed)return;disposed=true;object.removeFromParent();
    limbSkin.dispose();hockRig.dispose();geometries.forEach(entry=>entry.dispose());materials.forEach(entry=>entry.dispose());textures.forEach(entry=>entry.dispose());
    model.traverse(part=>{if(part.isSkinnedMesh)part.skeleton.dispose();});
    geometries.clear();materials.clear();textures.clear();
  }
  update(0,{reset:true});
  return {object,update,dispose,getDebugState};
}
