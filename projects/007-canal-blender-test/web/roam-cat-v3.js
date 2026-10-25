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
  object.name = "RoamCatV3";
  object.userData = { forwardAxis: "+Z", upAxis: "+Y", groundAnchor: "paw soles", version: "asset-rig-03", source: "cat-v3-rig.glb" };
  const model = loaded.scene;
  object.add(model);
  object.updateMatrixWorld(true);
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
      swing: false, settling: false, settleProgress: 0, footYaw: 0, reachError: 0 };
  });
  let elapsed = 0, phase = 0, movement = 0, travelSinceRest = 0, restTime = 0, wasMoving = false, initialized = false, disposed = false, previousYaw = 0, wasTurning = false;
  const previousRoot = new THREE.Vector3();
  const modelRestPosition = model.position.clone();
  const rootQuaternion = new THREE.Quaternion();
  const inverseParent = new THREE.Quaternion();
  const directionRotation = new THREE.Quaternion();
  const desiredQuaternion = new THREE.Quaternion();
  const torsoBob = { amount: 0 };
  const worldFoot = new THREE.Vector3();
  const localFoot = new THREE.Vector3();
  const yawQuaternion = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0,1,0);
  const gait = { speed: 0, phase: 0, stanceFeet: 4, maxReachError: 0 };
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
    const wanted = leg.foot.clone().add(leg.pawOffset.clone().applyQuaternion(rootQuaternion));
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
    yawQuaternion.setFromAxisAngle(upAxis,leg.footYaw-object.rotation.y);
    desiredQuaternion.copy(rootQuaternion).multiply(yawQuaternion).multiply(rest.get(leg.paw.name).worldQuaternion);
    if (leg.swing) desiredQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.08*Math.sin(swingFraction*Math.PI)));
    leg.paw.parent.getWorldQuaternion(inverseParent).invert();
    leg.paw.quaternion.copy(inverseParent).multiply(desiredQuaternion);
    leg.paw.updateMatrixWorld(true);
  }
  function update(delta,state={}) {
    if (disposed) return;
    const dt = Math.min(.08,Math.max(0,Number.isFinite(delta)?delta:0));
    elapsed = Number.isFinite(state.time) ? state.time : elapsed+dt;
    object.updateMatrixWorld(true);
    if (!initialized || state.reset || object.position.distanceTo(previousRoot) > .8) resetFeet(state);
    const distance = Math.hypot(object.position.x-previousRoot.x,object.position.z-previousRoot.z);
    const speed = dt>0?distance/dt:0;
    const yawChange=Math.atan2(Math.sin(object.rotation.y-previousYaw),Math.cos(object.rotation.y-previousYaw));
    const turnDistance=Math.abs(yawChange)*.44;
    const locomotionDistance=Math.max(distance,turnDistance);
    const translationWeight=locomotionDistance>.000001?Math.min(1,distance/locomotionDistance):0;
    const rotationWeight=locomotionDistance>.000001?Math.min(1,turnDistance/locomotionDistance):0;
    const turning=Math.abs(yawChange)>.001;
    // Paws planted during a pivot start near the hip instead of ahead of it.
    // Resume with short steps, while preserving footfall phase and contacts.
    if(wasTurning&&!turning)travelSinceRest=0;
    wasTurning=turning;
    const moving = ((state.moving ?? speed>.005) && speed>.004) || Math.abs(yawChange)>.0003;
    if (moving) { if (!wasMoving) {phase=0;travelSinceRest=0;} travelSinceRest+=locomotionDistance;restTime=0; }
    else restTime+=dt;
    movement += (Number(moving)-movement)*(1-Math.exp(-dt*9));
    const stride = .13+.10*THREE.MathUtils.smoothstep(travelSinceRest,0,.45);
    const duty = .69;
    phase = (phase+locomotionDistance/stride)%1;
    for (const [name,entry] of bones) {
      entry.position.copy(rest.get(name).position); entry.quaternion.copy(rest.get(name).quaternion);
    }
    torsoBob.amount = movement*Math.sin(phase*Math.PI*4)*.0012+(1-movement)*Math.sin(elapsed*1.9)*.0006;
    // Small natural compression creates joint clearance during a
    // step; the standing scan otherwise has almost fully extended forelegs.
    model.position.copy(modelRestPosition); model.position.y += torsoBob.amount-movement*.016;
    setLocalRotation("spine",0,0,Math.sin(phase*Math.PI*2)*movement*.008);
    setLocalRotation("head",Math.sin(elapsed*.8)*.009,(1-movement)*Math.sin(elapsed*.51)*.025,0);
    setLocalRotation("tail_01",0,Math.sin(elapsed*.9)*.045,Math.sin(elapsed*.7)*.023);
    setLocalRotation("tail_02",0,Math.sin(elapsed*.9+.6)*.035,Math.sin(elapsed*.7+.5)*.018);
    setLocalRotation("tail_03",0,Math.sin(elapsed*.9+1.2)*.024,0);
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(rootQuaternion);
    let maxReachError = 0;
    for (const leg of legs) {
      const front=leg.key.startsWith("fore"),left=leg.key.endsWith("left");
      const offset=front?(left?.75:.25):(left?0:.5);
      const localPhase=(phase+offset)%1;
      const swinging=moving&&localPhase>=duty;
      let swingFraction=0;
      if (!moving) {
        if (leg.swing) {leg.planted.copy(leg.foot);leg.planted.y=groundHeight(state,leg.planted.x,leg.planted.z);}
        neutralWorld(leg,leg.swingEnd,state);
        const delay=(front?(left?0:2):(left?3:1))*.12;
        if(!leg.settling&&restTime>=delay&&leg.foot.distanceTo(leg.swingEnd)>.009) {
          leg.settling=true;leg.settleProgress=0;leg.swingStart.copy(leg.foot);
        }
        if(leg.settling) {
          leg.settleProgress=Math.min(1,leg.settleProgress+dt/.22);
          const f=leg.settleProgress,ease=f*f*(3-2*f);
          leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,ease);
          leg.foot.y+=Math.sin(f*Math.PI)*.014;
          if(f===1){leg.settling=false;leg.planted.copy(leg.foot);}
        } else leg.foot.copy(leg.planted);
        const turn=Math.atan2(Math.sin(object.rotation.y-leg.footYaw),Math.cos(object.rotation.y-leg.footYaw));
        leg.footYaw+=turn*(1-Math.exp(-dt*7));
      } else if (swinging) {
        leg.settling=false;
        if(!leg.swing)leg.swingStart.copy(leg.foot);
        swingFraction=(localPhase-duty)/(1-duty);
        const ease=swingFraction*swingFraction*(3-2*swingFraction);
        localFoot.copy(leg.neutralSole);
        // Centre the moving paw track under its own shoulder/hip, retaining
        // the source scan's asymmetry only for the quiet standing pose.
        localFoot.z+=(leg.hip.z-leg.ankle.z)*movement+stride*duty*.50*translationWeight;
        object.localToWorld(leg.swingEnd.copy(localFoot));
        leg.swingEnd.y=groundHeight(state,leg.swingEnd.x,leg.swingEnd.z);
        leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,ease);
        leg.foot.y=groundHeight(state,leg.foot.x,leg.foot.z)+Math.sin(swingFraction*Math.PI)*.026;
        leg.footYaw=object.rotation.y;
      } else {
        leg.settling=false;
        if(leg.swing){
          // Resolve the actual phase crossing instead of freezing the previous
          // rendered swing frame. Otherwise 30 Hz leaves a paw behind its
          // touchdown point and consumes the next stance's reach budget.
          localFoot.copy(leg.neutralSole);
          localFoot.z+=(leg.hip.z-leg.ankle.z)*movement+(stride*duty*.50-localPhase*stride)*translationWeight;
          object.localToWorld(leg.planted.copy(localFoot));
          const rollback=-Math.sign(yawChange)*localPhase*stride/.44*rotationWeight;
          if(Math.abs(rollback)>.00001)leg.planted.sub(object.position).applyAxisAngle(upAxis,rollback).add(object.position);
          leg.planted.y=groundHeight(state,leg.planted.x,leg.planted.z);
        }
        leg.planted.y=groundHeight(state,leg.planted.x,leg.planted.z);
        leg.foot.copy(leg.planted);
      }
      leg.swing=swinging;
      solveLeg(leg,state,swingFraction);
      maxReachError=Math.max(maxReachError,leg.reachError);
    }
    object.updateMatrixWorld(true);
    Object.assign(gait,{speed,phase,angularSpeed:dt?yawChange/dt:0,stanceFeet:legs.filter(leg=>!leg.swing&&!leg.settling).length,maxReachError});
    previousRoot.copy(object.position);previousYaw=object.rotation.y;wasMoving=moving;
  }
  function getDebugState() {
    object.updateMatrixWorld(true);
    return { version: object.userData.version, root:object.position.toArray(), gait:{...gait}, bones:bones.size, feet:legs.map(leg=>{
      const renderedSole=leg.paw.getWorldPosition(new THREE.Vector3()).sub(leg.pawOffset.clone().applyQuaternion(rootQuaternion));
      return {name:leg.key,stance:!leg.swing&&!leg.settling,world:leg.foot.toArray(),renderedWorld:renderedSole.toArray(),groundClearance:leg.foot.y-object.position.y,reachError:leg.reachError};
    })};
  }
  function dispose() {
    if(disposed)return;disposed=true;object.removeFromParent();
    geometries.forEach(entry=>entry.dispose());materials.forEach(entry=>entry.dispose());textures.forEach(entry=>entry.dispose());
    model.traverse(part=>{if(part.isSkinnedMesh)part.skeleton.dispose();});
    geometries.clear();materials.clear();textures.clear();
  }
  update(0,{reset:true});
  return {object,update,dispose,getDebugState};
}
