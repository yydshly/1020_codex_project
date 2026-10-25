import { createCat as createBase } from './cat-v12-base.js';
import { prepareContinuousSkin } from './cat-v10-continuous-skin.js';

// Slow posture changes and stride-linked movement have separate paths. V11
// low-passed even the tiny gait cycles until the head and tail looked fixed.
// The phase relationships are reference-informed animation choices for this
// rig, not a measured motion-capture reconstruction of a particular animal.
export async function createCat(THREE) {
  const base = await createBase(THREE);
  const skin = prepareContinuousSkin(THREE, base.object, {sigma:.008});
  base.setAttention({enabled:false}); base.update(0,{reset:true});
  const object=base.object, bones=new Map();
  object.traverse(node=>{if(node.isBone)bones.set(node.name,node);});
  const head=bones.get('head'), neck=bones.get('neck');
  const tail=['tail_01','tail_02','tail_03','tail_04'].map(name=>bones.get(name));
  if(!head||!neck||tail.some(node=>!node)){skin.dispose();base.dispose();throw new Error('V12 requires the preserved head, neck and tail rig');}
  object.updateMatrixWorld(true);
  const rootQ=new THREE.Quaternion(),invRoot=new THREE.Quaternion(),invParent=new THREE.Quaternion();
  const worldQ=new THREE.Quaternion(),deltaQ=new THREE.Quaternion(),relativeQ=new THREE.Quaternion();
  const inheritedHead=new THREE.Quaternion(),inheritedNeck=new THREE.Quaternion();
  object.getWorldQuaternion(rootQ);invRoot.copy(rootQ).invert();
  const neutralHead=head.getWorldQuaternion(new THREE.Quaternion()).premultiply(invRoot);
  const neutralNeck=neck.getWorldQuaternion(new THREE.Quaternion()).premultiply(invRoot);
  const tailRest=tail.map(node=>node.quaternion.clone());
  const tailTipLocal=tail[3].worldToLocal(object.localToWorld(new THREE.Vector3(.015,.469,-.18)));
  const euler=new THREE.Euler(0,0,0,'YXZ'),rad=Math.PI/180;
  const clamp=THREE.MathUtils.clamp,smooth=THREE.MathUtils.smoothstep;
  const damp=(value,next,rate,dt)=>value+(next-value)*(1-Math.exp(-rate*dt));
  const control={enabled:true,mode:'natural',yaw:0,pitch:0};
  const applied={yaw:0,pitch:0,roll:0,tailPitch:-.58,tailYaw:0,tailMid:0,tailTip:0,tailCurl:0,tailEnd:0};
  const target={...applied},cycle={headPitch:0,headYaw:0,headRoll:0,tailBase:0,tailMid:0,tailTip:0};
  let elapsed=0,idleTime=0,previousSpeed=0,acceleration=0,turnRate=0,movingBlend=0,runBlend=0,speed=0;
  let initialized=false,disposed=false; const lastPosition=object.position.clone();
  function setAttention(next={}){
    if(typeof next.enabled==='boolean')control.enabled=next.enabled;
    if(next.mode==='natural'||next.mode==='manual')control.mode=next.mode;
    if(Number.isFinite(next.yaw)){control.yaw=clamp(next.yaw,-8,8);control.mode='manual';}
    if(Number.isFinite(next.pitch)){control.pitch=clamp(next.pitch,-4,5);control.mode='manual';}
  }
  function rootPose(node,orientation,pitch,yaw,roll){
    deltaQ.setFromEuler(euler.set(pitch,yaw,roll));
    worldQ.copy(rootQ).multiply(deltaQ).multiply(orientation);
    node.parent.getWorldQuaternion(invParent).invert();
    node.quaternion.copy(invParent).multiply(worldQ).normalize();node.updateMatrixWorld(true);
  }
  function addRootOffset(node,pitch,yaw,roll){
    node.getWorldQuaternion(worldQ);deltaQ.setFromEuler(euler.set(pitch,yaw,roll));
    relativeQ.copy(rootQ).multiply(deltaQ).multiply(invRoot);worldQ.premultiply(relativeQ);
    node.parent.getWorldQuaternion(invParent).invert();node.quaternion.copy(invParent).multiply(worldQ).normalize();
    node.updateMatrixWorld(true);
  }
  function pulse(time,start,duration){return time>start&&time<start+duration?Math.sin((time-start)/duration*Math.PI)**2:0;}
  function update(delta,state={}){
    if(disposed)return;
    const dt=Math.min(.08,Math.max(0,Number.isFinite(delta)?delta:0));
    const reset=!!state.reset||!initialized||object.position.distanceTo(lastPosition)>.8;
    base.update(delta,state);const previous=base.getDebugState(),gait=previous.gait;
    speed=Math.max(0,gait.speed||0);
    if(reset){
      elapsed=idleTime=0;previousSpeed=speed;acceleration=turnRate=movingBlend=runBlend=0;
      Object.assign(applied,{yaw:0,pitch:0,roll:0,tailPitch:-.58,tailYaw:0,tailMid:0,tailTip:0,tailCurl:0,tailEnd:0});
      initialized=true;
    }else{
      elapsed+=dt;
      acceleration=damp(acceleration,clamp(dt>0?(speed-previousSpeed)/dt:0,-2.2,2.2),7,dt);
      turnRate=damp(turnRate,clamp(gait.angularSpeed||0,-2.5,2.5),8,dt);
      movingBlend=damp(movingBlend,smooth(Math.max(speed,Math.abs(turnRate)*.12),.015,.25),6,dt);
      runBlend=damp(runBlend,smooth(speed,.48,.85),5,dt);
      idleTime=speed<.02&&Math.abs(turnRate)<.05?idleTime+dt:0;
    }
    previousSpeed=speed;lastPosition.copy(object.position);
    const phase=(gait.phase||0)*Math.PI*2;
    const lead=clamp(Number.isFinite(state.lookAheadYaw)?state.lookAheadYaw:turnRate*.18,-.55,.55);
    const idlePhase=idleTime%23,activityPhase=elapsed%17;
    const idleGlance=-6*pulse(idlePhase,3.2,2.8)+4.5*pulse(idlePhase,13.2,3.1);
    const walkGlance=2.0*pulse(activityPhase,7.4,1.8)*movingBlend*(1-runBlend);
    const manualWeight=1-.4*movingBlend;
    target.yaw=control.enabled?clamp((lead*.36+turnRate*.055)/rad+
      (control.mode==='manual'?control.yaw*manualWeight:idleGlance*(1-movingBlend)+walkGlance),-12,12):0;
    target.pitch=control.enabled?clamp(1.2*movingBlend+4.4*runBlend+acceleration*.85+
      (control.mode==='manual'?control.pitch*manualWeight:2.4*pulse(idlePhase,8.5,2.5)*(1-movingBlend)),-3,9):0;
    target.roll=control.enabled?clamp(-turnRate*.85*movingBlend,-2,2):0;
    target.tailPitch=-.58-.42*movingBlend-.43*runBlend-acceleration*.05;
    target.tailYaw=clamp(-turnRate*.075-lead*.11,-.21,.21);
    // Release the scan's hooked distal curve gradually along the tail, rather
    // than rotating the entire curled shape as one rigid flag.
    target.tailCurl=-.10*movingBlend-.08*runBlend;
    target.tailEnd=-.06*movingBlend-.05*runBlend;
    applied.yaw=damp(applied.yaw,target.yaw,7,dt);applied.pitch=damp(applied.pitch,target.pitch,7,dt);
    applied.roll=damp(applied.roll,target.roll,6,dt);
    applied.tailPitch=damp(applied.tailPitch,target.tailPitch,4.5,dt);
    applied.tailYaw=damp(applied.tailYaw,target.tailYaw,4.5,dt);
    target.tailMid=applied.tailYaw*.70;applied.tailMid=damp(applied.tailMid,target.tailMid,3.8,dt);
    target.tailTip=applied.tailMid*.65+(pulse(idlePhase,5.6,2.3)-.7*pulse(idlePhase,16.7,2.6))*.12*(1-movingBlend);
    applied.tailTip=damp(applied.tailTip,target.tailTip,3.2,dt);
    applied.tailCurl=damp(applied.tailCurl,target.tailCurl,4,dt);applied.tailEnd=damp(applied.tailEnd,target.tailEnd,3.5,dt);

    // Pitch twice per stride; yaw/roll once per stride. A small phase delay
    // leaves residual head motion instead of cancelling the entire torso.
    // Gait cycles bypass the slow posture filter, with a smooth stop envelope.
    cycle.headPitch=control.enabled?Math.sin(phase*2-.95)*movingBlend*(1.3+.15*runBlend):0;
    cycle.headYaw=control.enabled?Math.sin(phase-.45)*movingBlend*(.5-.2*runBlend):0;
    cycle.headRoll=control.enabled?Math.sin(phase-.8)*movingBlend*(.35-.1*runBlend):0;
    cycle.tailBase=Math.sin(phase*2-1.3)*movingBlend*.025;
    cycle.tailMid=Math.sin(phase*2-2.0)*movingBlend*.038;
    cycle.tailTip=Math.sin(phase*2-2.7)*movingBlend*.05;
    object.getWorldQuaternion(rootQ);invRoot.copy(rootQ).invert();
    // Inherit some shoulder/neck motion; V11's absolute orientation erased it.
    head.getWorldQuaternion(inheritedHead).premultiply(invRoot);
    neck.getWorldQuaternion(inheritedNeck).premultiply(invRoot);
    inheritedHead.slerp(neutralHead,.62);
    inheritedNeck.slerp(neutralNeck,.22);
    rootPose(neck,inheritedNeck,(applied.pitch*.28+cycle.headPitch*.5)*rad,
      (applied.yaw*.24+cycle.headYaw*.5)*rad,(applied.roll*.25+cycle.headRoll*.5)*rad);
    rootPose(head,inheritedHead,(applied.pitch+cycle.headPitch)*rad,
      (applied.yaw+cycle.headYaw)*rad,(applied.roll+cycle.headRoll)*rad);
    tail.forEach((node,i)=>{node.quaternion.copy(tailRest[i]);node.updateMatrixWorld(true);});
    addRootOffset(tail[0],applied.tailPitch+cycle.tailBase,applied.tailYaw,0);
    addRootOffset(tail[1],cycle.tailMid,applied.tailMid,0);
    addRootOffset(tail[2],applied.tailCurl+cycle.tailTip,applied.tailTip,0);
    addRootOffset(tail[3],applied.tailEnd+cycle.tailTip*.45,applied.tailTip*.35,0);
    object.updateMatrixWorld(true);
  }
  update(0,{reset:true});
  return {object,update,setAttention,setBlink:base.setBlink,
    getDebugState(){const previous=base.getDebugState();return {...previous,version:'cat-motion-12',
      continuousSkin:skin.stats,attention:{...previous.attention,version:'motion-attention-12',...control,
        appliedDegrees:{yaw:applied.yaw+cycle.headYaw,pitch:applied.pitch+cycle.headPitch,roll:applied.roll+cycle.headRoll},
        requestedDegrees:{yaw:control.yaw,pitch:control.pitch},yawLimit:12},
      secondaryMotion:{version:12,speed,acceleration,turnRate,movingBlend,runBlend,elapsed,idleTime,
        applied:{...applied},target:{...target},cycle:{...cycle},
        tailTip:object.worldToLocal(tail[3].localToWorld(tailTipLocal.clone())).toArray(),
        points:Object.fromEntries([neck,head,...tail].map(node=>[node.name,object.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray()])),
        headStabilization:'partial torso inheritance plus phase-delayed residual movement',tailPose:'articulated curve and load-linked follow-through'}};},
    dispose(){if(disposed)return;disposed=true;skin.dispose();base.dispose();}};
}
