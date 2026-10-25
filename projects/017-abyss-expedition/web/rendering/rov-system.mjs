// SPDX-License-Identifier: GPL-3.0-only
// The expedition and the teaching stage share these actual Three.js parts.
// Motion and sensor illustrations are explanatory, not navigation algorithms.
import * as THREE from 'three';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const clamp=v=>Math.max(0,Math.min(1,v));
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.15,...extra});
function mesh(parent,geometry,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function poseRod(object,a,b){const d=b.clone().sub(a);object.position.copy(a).add(b).multiplyScalar(.5);object.quaternion.setFromUnitVectors(V(0,1,0),d.clone().normalize());object.scale.y=d.length();}
function rod(parent,a,b,r,mat){const o=mesh(parent,new THREE.CylinderGeometry(r,r,1,8),mat);poseRod(o,a,b);return o;}

/** Full ROV geometry, semantic part groups and deterministic actuators. */
export function createRovSystem(){
  const group=new THREE.Group();group.name='rov-system';const parts={};
  for(const key of ['vision','navigation','propulsion','protection','tether','arm','sampling']){const g=new THREE.Group();g.name=`rov-${key}`;parts[key]=g;group.add(g);}
  // Each functional group owns its materials, so highlighting the explanation
  // cannot alter a different device or a second ROV elsewhere in the scene.
  const allMaterials=[];const mat=(color,extra={})=>{const m=material(color,extra);allMaterials.push(m);return m;};
  const yellow=mat(0xd6b43d,{roughness:.4,metalness:.12}),alloy=mat(0xb5c8c9,{roughness:.31,metalness:.58,envMapIntensity:.85}),dark=mat(0x1e353e,{roughness:.48,metalness:.24}),rubber=mat(0x101c22,{roughness:.9,metalness:0});
  // Material clones within each part prevent a selected lamp from illuminating
  // all the frame rails that happen to use the same alloy.
  const own=(part,source)=>{const m=source.clone();allMaterials.push(m);return m;};
  const frame=new THREE.Group();frame.name='rov-frame';group.add(frame);
  // Rounded housings stand for solid buoyancy material, not oxygen cylinders.
  // Neither the flotation blocks nor the electronics pressure case carry people.
  for(const x of [-6.7,6.7]){const f=mesh(parts.protection,new THREE.CapsuleGeometry(2.15,12,5,14),own('protection',yellow),x,5.1,0);f.rotation.x=Math.PI/2;for(const z of [-5.2,5.2])mesh(parts.protection,new THREE.TorusGeometry(2.18,.15,5,16),own('protection',rubber),x,5.1,z);for(const z of [-7.7,7.7])mesh(parts.protection,new THREE.BoxGeometry(3.3,1.1,2),own('protection',yellow),x,4.9,z);}
  const rails=[[-8,-5,-9],[8,-5,-9],[8,-5,9],[-8,-5,9]];for(let i=0;i<4;i++){const a=V(...rails[i]),b=V(...rails[(i+1)%4]);rod(frame,a,b,.44,alloy);rod(frame,a,V(a.x,3.3,a.z),.4,alloy);}
  for(const z of [-8.5,8.5])rod(frame,V(-8,3.3,z),V(8,3.3,z),.42,alloy);for(const x of [-8,8])rod(frame,V(x,3.3,-8.5),V(x,3.3,8.5),.38,alloy);
  const pressure=mesh(parts.protection,new THREE.CylinderGeometry(2.5,2.5,11,18),own('protection',alloy),0,1.1,2);pressure.rotation.x=Math.PI/2;
  const pressureCap=mesh(parts.protection,new THREE.SphereGeometry(2.5,14,8),own('protection',alloy),0,1.1,-3.5);pressureCap.scale.z=.5;mesh(parts.protection,new THREE.BoxGeometry(5.2,3,5),own('protection',dark),0,-1.4,5.5);
  const electronics=new THREE.Group();electronics.visible=false;parts.protection.add(electronics);mesh(electronics,new THREE.BoxGeometry(3.4,.22,7.5),mat(0x477a66,{roughness:.7}),0,1.1,1.2);for(let i=0;i<4;i++){mesh(electronics,new THREE.BoxGeometry(1.1,.55,1),own('protection',dark),Math.sin(i)*.8,1.5,-1.8+i*1.8);mesh(electronics,new THREE.BoxGeometry(.4,.4,.8),own('protection',alloy),1.25,1.4,-1.8+i*1.8);}
  // Camera and lamps face -Z, matching the original expedition adapter.
  const vision=parts.vision,vAlloy=own('vision',alloy),vDark=own('vision',dark);
  mesh(vision,new THREE.TorusGeometry(2.5,.34,6,20),vAlloy,0,-.7,-8.6);const housing=mesh(vision,new THREE.CylinderGeometry(2.1,2.2,4.2,18),vDark,0,-.7,-9);housing.rotation.x=Math.PI/2;
  const lensMat=new THREE.MeshPhysicalMaterial({color:0x285f71,roughness:.06,metalness:.55,clearcoat:1,clearcoatRoughness:.05});allMaterials.push(lensMat);
  mesh(vision,new THREE.SphereGeometry(1.75,20,14),lensMat,0,-.7,-11.15).scale.z=.55;mesh(vision,new THREE.TorusGeometry(1.82,.16,6,20),vAlloy,0,-.7,-11.15);
  mesh(vision,new THREE.SphereGeometry(.32,8,6),new THREE.MeshBasicMaterial({color:0xb3f3f9}),-.5,-.2,-12.1);
  const lampMaterial=mat(0xfff6da,{emissive:0xffe8ba,emissiveIntensity:3,roughness:.16,metalness:.1}),lightMounts=[];
  for(const x of [-5.1,5.1]){const h=mesh(vision,new THREE.CylinderGeometry(1.5,1.3,3,16),vAlloy,x,2,-9.5);h.rotation.x=Math.PI/2;mesh(vision,new THREE.TorusGeometry(1.5,.24,6,18),vDark,x,2,-11.1);mesh(vision,new THREE.SphereGeometry(1.18,14,10),lampMaterial,x,2,-11.2).scale.z=.35;lightMounts.push(V(x,2,-12));}
  // A visible forward acoustic head and compact attitude/navigation package.
  const navigation=parts.navigation,nDark=own('navigation',dark),nAlloy=own('navigation',alloy);
  mesh(navigation,new THREE.BoxGeometry(6.4,2.6,2.1),nDark,0,5,-7.9);const face=mesh(navigation,new THREE.CylinderGeometry(2.6,2.6,.6,20),mat(0x4d7881,{metalness:.25,roughness:.4}),0,5,-9.3);face.rotation.x=Math.PI/2;
  for(let i=0;i<5;i++){const rib=mesh(navigation,new THREE.BoxGeometry(.24,1.5,.2),nAlloy,-1.7+i*.85,5,-9.7);}
  mesh(navigation,new THREE.CylinderGeometry(1.35,1.35,3.2,12),nAlloy,0,6.8,4.3);mesh(navigation,new THREE.SphereGeometry(1.4,12,8),nDark,0,8.3,4.3).scale.y=.55;
  const fans=[],thrusterMounts=[];const pDark=own('propulsion',dark),pAlloy=own('propulsion',alloy);
  for(const x of [-9,9])for(const z of [-5.5,5.5]){const t=mesh(parts.propulsion,new THREE.CylinderGeometry(2,2,3,14,1,true),pDark,x,-.8,z);t.rotation.x=Math.PI/2;mesh(parts.propulsion,new THREE.TorusGeometry(2,.28,6,18),pAlloy,x,-.8,z-1.6);const fan=new THREE.Group();fan.position.set(x,-.8,z-1.65);parts.propulsion.add(fan);mesh(fan,new THREE.BoxGeometry(3.25,.45,.2),pAlloy);mesh(fan,new THREE.BoxGeometry(.45,3.25,.2),pAlloy);fans.push(fan);thrusterMounts.push(V(x,-.8,z+1.65));}
  // Tether termination is visible on the vehicle as well as in the explanation.
  const tether=parts.tether,tAlloy=own('tether',alloy);rod(tether,V(0,4.3,0),V(0,10.5,0),.44,tAlloy);mesh(tether,new THREE.CylinderGeometry(.9,1.1,2.8,12),own('tether',yellow),0,10,0);mesh(tether,new THREE.TorusGeometry(1.35,.27,7,20),tAlloy,0,11.2,0);
  const arm=parts.arm,aAlloy=own('arm',alloy),aYellow=own('arm',yellow),aDark=own('arm',dark);const shoulder=new THREE.Group();shoulder.position.set(5,-2,-4);arm.add(shoulder);rod(shoulder,V(0,0,0),V(4,-4,-8),.48,aAlloy);mesh(shoulder,new THREE.SphereGeometry(.8,10,7),aDark);const elbow=new THREE.Group();elbow.position.set(4,-4,-8);shoulder.add(elbow);rod(elbow,V(0,0,0),V(-4,-3,-6),.42,aYellow);mesh(elbow,new THREE.SphereGeometry(.8,10,7),aDark);const claw=new THREE.Group();claw.position.set(-4,-3,-6);elbow.add(claw);mesh(claw,new THREE.SphereGeometry(.8,10,7),aDark);const fingers=[rod(claw,V(-.8,0,0),V(-2,-.6,-3),.26,aAlloy),rod(claw,V(.8,0,0),V(2,-.6,-3),.26,aAlloy)];
  const hydraulic=new THREE.CatmullRomCurve3([V(4,0,-3),V(9,-1,-7),V(9,-5,-12),V(5,-8,-18)]);mesh(arm,new THREE.TubeGeometry(hydraulic,16,.17,5,false),own('arm',rubber));
  const sampling=parts.sampling,sDark=own('sampling',dark),sAlloy=own('sampling',alloy),caps=[];mesh(sampling,new THREE.BoxGeometry(10,.5,7),sDark,0,-4,4);
  for(let i=0;i<4;i++){const x=-3.5+i*2.3;mesh(sampling,new THREE.CylinderGeometry(.65,.65,3.5,10,1,true),sAlloy,x,-2.2,5);for(const y of [-3.95,-.45]){const pivot=new THREE.Group();pivot.position.set(x+.66,y,5);sampling.add(pivot);mesh(pivot,new THREE.CylinderGeometry(.73,.73,.23,10),sDark,-.66,0,0);caps.push({pivot,sign:y<-2?1:-1});}}
  const base=new Map();group.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){if(!base.has(m))base.set(m,{color:m.color?.clone(),emissive:m.emissive?.clone(),intensity:m.emissiveIntensity||0});}});
  let highlighted=null;
  function setHighlight(key){if(key===highlighted)return;highlighted=key;for(const [m,b] of base){if(b.color)m.color.copy(b.color);if(b.emissive)m.emissive.copy(b.emissive);m.emissiveIntensity=b.intensity;}if(parts[key])parts[key].traverse(o=>{const m=o.material;if(m?.emissive){m.emissive.set(0x4c8b86);m.emissiveIntensity=.62;}});}
  function update({time=0,armProgress=0,samplingProgress=0}={}){fans.forEach((fan,i)=>fan.rotation.z=time*12*(i%2?-1:1));const p=clamp(armProgress);shoulder.rotation.x=p*.12;elbow.rotation.x=-p*.22;for(let i=0;i<2;i++){const sign=i?1:-1;poseRod(fingers[i],V(sign*.8,0,0),V(sign*(2-p*1.65),-.6,-3.2));}const s=clamp(samplingProgress);for(const {pivot,sign} of caps)pivot.rotation.z=sign*(1-s)*Math.PI*.6;}
  update();
  function setCutaway(enabled){electronics.visible=Boolean(enabled);for(const object of [pressure,pressureCap]){object.material.transparent=Boolean(enabled);object.material.opacity=enabled?.16:1;object.material.depthWrite=!enabled;}}
  return {group,parts,fanRotors:fans,lightMounts,thrusterMounts,anchors:{camera:V(0,-.7,-12),sonar:V(0,5,-9.8),tether:V(0,11.2,0),claw:V(5,-9,-21),bottles:V(0,-2,5),pressure:V(0,1.1,2)},setHighlight,setCutaway,update};
}

/** An enlarged ship-side workstation, matching the vessel's yellow winch. */
export function createRovControlStation(){
  const group=new THREE.Group();group.name='ship-control-station';const yellow=material(0xc7ad56),steel=material(0xb2c4c4,{metalness:.55,roughness:.35}),dark=material(0x233a43),deck=material(0x6e847c),orange=material(0xcc7654);mesh(group,new THREE.BoxGeometry(34,1.3,23),deck,0,-1,0);
  const winch=new THREE.Group();winch.position.set(6,3,0);group.add(winch);const drum=mesh(winch,new THREE.CylinderGeometry(3.2,3.2,8,20),dark);drum.rotation.z=Math.PI/2;for(let x=-3.6;x<4;x+=.65){const coil=mesh(drum,new THREE.TorusGeometry(3.3,.12,5,24),steel,0,x,0);coil.rotation.x=Math.PI/2;}for(const x of [-5,5])mesh(winch,new THREE.BoxGeometry(1,6.8,8),yellow,x,0,0);for(const x of [0,12])rod(group,V(x,0,-6),V(x,13,-6),.43,yellow);rod(group,V(0,13,-6),V(12,13,-6),.43,yellow);const pulley=mesh(group,new THREE.TorusGeometry(1.5,.35,7,24),steel,6,11.5,-6);pulley.rotation.y=Math.PI/2;
  const console=new THREE.Group();console.position.set(-10,0,0);group.add(console);mesh(console,new THREE.BoxGeometry(7,5,5),dark,0,2.5,0);const screen=mesh(console,new THREE.BoxGeometry(5.7,3,.3),material(0x3b7983,{emissive:0x1b5263,emissiveIntensity:.75}),0,6,-1.4);screen.rotation.x=-.16;for(const x of [-1.6,1.6]){rod(console,V(x,5,1),V(x,6.3,1),.12,steel);mesh(console,new THREE.SphereGeometry(.3,8,6),orange,x,6.3,1);}for(let i=0;i<4;i++)mesh(console,new THREE.BoxGeometry(.9,.18,.5),steel,-2+i*1.3,5.2,1.8);
  const operator=new THREE.Group();operator.position.set(-10,0,6);group.add(operator);mesh(operator,new THREE.CapsuleGeometry(1.1,3,4,10),orange,0,4,0);mesh(operator,new THREE.SphereGeometry(1,12,8),material(0xc9baa0),0,7,0);for(const x of [-.65,.65])rod(operator,V(x,3,0),V(x,.2,0),.42,dark);for(const x of [-1,1])rod(operator,V(x,5.2,0),V(x,5,-3),.33,orange);
  const cableCurve=new THREE.CatmullRomCurve3([V(6,4,0),V(6,7,-4),V(6,11.5,-6),V(6,12,-10)]);mesh(group,new THREE.TubeGeometry(cableCurve,24,.26,6,false),dark);
  return {group,anchor:V(6,12,-10),update:time=>{drum.rotation.x=time*.23;}};
}
