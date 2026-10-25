// SPDX-License-Identifier: GPL-3.0-only
// Geometry-only teaching models. Scale, flow speed and particles are explanatory
// symbols, never a numerical simulation or a reconstruction of sampled water.
import * as THREE from 'three';
import {createRovSystem,createRovControlStation} from './rov-system.mjs?v=1';

export const LEARNING_STEPS=Object.freeze({equipment:8,hydrothermal:5,'black-smoker':3,'food-web':3,habitat:3,comparison:3,summary:3});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.08,...extra});
const glow=color=>new THREE.MeshBasicMaterial({color});
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
function rod(parent,a,b,r,material){const d=b.clone().sub(a),o=mesh(new THREE.CylinderGeometry(r,r,d.length(),7),material,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return o;}
function tube(parent,points,r,material){const curve=new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?V(...p):p));mesh(new THREE.TubeGeometry(curve,48,r,7,false),material,parent);return curve;}
function pointsFlow(parent,curve,{count=22,color=0x60d8f4,radius=.65,speed=.10,opacity=.9}={}){
  const material=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1}),instances=new THREE.InstancedMesh(new THREE.SphereGeometry(radius,7,5),material,count);instances.frustumCulled=false;parent.add(instances);const pose=new THREE.Object3D();
  return time=>{for(let i=0;i<count;i++){const t=((i/count+time*speed)%1+1)%1,p=curve.getPoint(t),s=.65+.35*Math.sin(i*5.3+time*.5);pose.position.copy(p);pose.scale.setScalar(s);pose.updateMatrix();instances.setMatrixAt(i,pose.matrix);}instances.instanceMatrix.needsUpdate=true;};
}
function directionalFlow(parent,points,color){const curve=tube(parent,points,.62,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.25,depthWrite:false}));for(const t of [.25,.66]){const c=mesh(new THREE.ConeGeometry(1.3,3.2,8),glow(color),parent);c.position.copy(curve.getPoint(t));c.quaternion.setFromUnitVectors(V(0,1,0),curve.getTangent(t).normalize());}return pointsFlow(parent,curve,{color});}
function rock(parent,x,y,z,sx,sy,sz,color=0x536564){const m=mesh(new THREE.DodecahedronGeometry(1,1),mat(color,{roughness:1}),parent,x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(.15*Math.sin(x),x*.17,.1*Math.cos(z));return m;}
function chimney(parent,x=0,y=0,z=0,height=28){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);const geo=new THREE.CylinderGeometry(3.8,7,height,14,7,true),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i)),n=1+.12*Math.sin(a*5+p.getY(i)*.8)+.07*Math.sin(a*9-p.getY(i));p.setXYZ(i,p.getX(i)*n,p.getY(i),p.getZ(i)*n);}geo.computeVertexNormals();mesh(geo,mat(0x4a534c,{roughness:.97,side:THREE.DoubleSide}),g,0,height/2,0);const rim=mesh(new THREE.TorusGeometry(3.8,.85,7,17),mat(0xb4a269,{roughness:.92}),g,0,height,0);rim.rotation.x=Math.PI/2;mesh(new THREE.CylinderGeometry(3.05,2.8,8,14,1,true),mat(0x182d31,{side:THREE.BackSide}),g,0,height-4,0);for(let i=0;i<19;i++){const a=i*2.4,h=2+i/19*(height-3),r=5.9-h/height*2;rock(g,Math.cos(a)*r,h,Math.sin(a)*r,1.4,.9,1.1,i%3?0x776f4d:0xa39665);}return g;}
function planktonCloud(parent,{count=30,color=0xcea86c,bounds=[60,18,22],offset=[0,13,0]}={}){const model=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.42,0),glow(color),count),o=new THREE.Object3D();model.frustumCulled=false;parent.add(model);return time=>{for(let i=0;i<count;i++){const x=(((i*.61803398875+time*.03)%1)-.5)*bounds[0];o.position.set(x+offset[0],offset[1]+Math.sin(i*2.37)*bounds[1]/2,offset[2]+Math.sin(i*7.73)*bounds[2]/2);o.rotation.set(i,time*.12+i,0);o.scale.setScalar(.65+(i%5)*.13);o.updateMatrix();model.setMatrixAt(i,o.matrix);}model.instanceMatrix.needsUpdate=true;};}
function tubeWorms(parent,x,y,z,scale=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);const ivory=mat(0xdfd5b5),red=mat(0xa83e40,{roughness:.7});for(let i=0;i<11;i++){const a=i*2.399,r=Math.sqrt(i)*1.5,bx=Math.cos(a)*r,bz=Math.sin(a)*r,h=8+i%4*1.8;const curve=tube(g,[[bx,0,bz],[bx*.94,h*.5,bz],[bx+Math.sin(i)*2,h,bz+Math.cos(i)*1.5]],.52,ivory),top=curve.getPoint(1);for(let j=0;j<5;j++){const plume=mesh(new THREE.ConeGeometry(.45,3.3,5),red,g,top.x+Math.cos(j*1.25)*.55,top.y+1.2,top.z+Math.sin(j*1.25)*.55);plume.rotation.z=Math.sin(j*1.25)*.26;plume.rotation.x=Math.cos(j*1.25)*.26;}}return g;}
function coral(parent,x,y,z,scale=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);const m=mat(0xc6987e,{roughness:.8});const branches=(a,b,r,depth,seed)=>{rod(g,a,b,r,m);if(!depth)return;for(const side of [-1,1]){const d=V(side*(4+depth),6+depth*1.6,Math.sin(seed)*2.1),end=b.clone().add(d);branches(b,end,r*.6,depth-1,seed+side*1.9);}};branches(V(0,0,0),V(0,8,0),.68,3,2);return g;}
function sponge(parent,x,y,z,s=1){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);const m=mesh(new THREE.CylinderGeometry(2.4,1.25,7,12,1,true),mat(0xbdb88f,{side:THREE.DoubleSide,roughness:.98}),g,0,3.5,0);m.scale.setScalar(s);const rim=mesh(new THREE.TorusGeometry(2.4,.37,6,16),mat(0xd5cda7),g,0,7*s,0);rim.rotation.x=Math.PI/2;rim.scale.setScalar(s);return g;}

function hydrothermal(){
  const group=new THREE.Group(),labels=[],updates=[];const slab=mat(0x53635f,{roughness:1});
  // The front face is removed: the transparent middle volume allows a view
  // through the rock, while the opaque rear and side walls establish a cutaway.
  mesh(new THREE.BoxGeometry(92,29,14),slab,group,0,-12,-17);mesh(new THREE.BoxGeometry(13,29,43),slab,group,-39.5,-12,4.5);mesh(new THREE.BoxGeometry(13,29,43),slab,group,39.5,-12,4.5);
  mesh(new THREE.BoxGeometry(66,27,36),mat(0x6d8276,{transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}),group,0,-12,1);
  for(let i=0;i<13;i++)rock(group,-38+i*6,2.6,-11+Math.sin(i*2)*3,4,1.6,5,i%2?0x738079:0x5b6a65);
  const water=mesh(new THREE.PlaneGeometry(100,51),mat(0x4babc5,{transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}),group,0,4.5,0);water.rotation.x=-Math.PI/2;
  const heatGroup=new THREE.Group();group.add(heatGroup);const heat=mesh(new THREE.SphereGeometry(1,24,12),mat(0xe46f38,{emissive:0xbf381c,emissiveIntensity:.55,transparent:true,opacity:.9}),heatGroup,0,-25,0);heat.scale.set(24,7,13);const heatRing=mesh(new THREE.TorusGeometry(15,.45,6,48),glow(0xffb467),heatGroup,0,-24,7);heatRing.rotation.x=.5;
  const cold=new THREE.Group();group.add(cold);updates.push(directionalFlow(cold,[[-33,18,4],[-29,3,5],[-23,-9,5],[-13,-19,4],[-3,-20,2]],0x59c5ee));
  const reaction=new THREE.Group();group.add(reaction);const reactionFlow=pointsFlow(reaction,new THREE.CatmullRomCurve3([V(-13,-19,5),V(-3,-18,6),V(8,-18,5)]),{count:16,color:0xe6c68b,radius:.65,speed:.13});updates.push(reactionFlow);for(let i=0;i<9;i++)rock(reaction,-14+i*3,-18+Math.sin(i)*2,7+(i%2)*2,1.3,1.8,1.4,0x9e9368);
  const hot=new THREE.Group();group.add(hot);updates.push(directionalFlow(hot,[[1,-20,3],[11,-16,3],[16,-5,2],[18,9,0],[18,28,0]],0xffa45f));chimney(group,18,3,0,24);
  const mixed=new THREE.Group();group.add(mixed);updates.push(pointsFlow(mixed,new THREE.CatmullRomCurve3([V(18,28,0),V(20,35,1),V(27,43,2),V(39,49,1)]),{count:37,color:0x7a7770,radius:1.1,speed:.12,opacity:.72}));updates.push(directionalFlow(mixed,[[40,33,9],[29,30,4],[21,29,1]],0x62c4e3));
  labels.push({id:'cold',text:'冷海水沿裂缝下渗',position:V(-30,20,5),from:0},{id:'heat',text:'地下热岩石',position:V(-12,-27,15),from:1},{id:'reaction',text:'水与岩石反应',position:V(4,-13,13),from:2},{id:'hot',text:'热液向上流动',position:V(22,16,4),from:3},{id:'mix',text:'与冷海水混合 · 矿物析出',position:V(34,48,1),from:4});
  return {group,labels,extent:105,target:V(0,9,0),update:(step,time)=>{heatGroup.visible=step>=1;reaction.visible=step>=2;hot.visible=step>=3;mixed.visible=step>=4;heat.material.emissiveIntensity=step===1?.9+.15*Math.sin(time*2):.55;updates.forEach(f=>f(time));}};
}

function blackSmoker(){
  const group=new THREE.Group(),labels=[],updates=[];rock(group,0,-2,0,31,5,21);chimney(group,0,0,0,29);for(let i=0;i<9;i++)rock(group,Math.cos(i*2.4)*10,1,Math.sin(i*2.4)*9,3,2,3);
  const water=new THREE.Group();group.add(water);updates.push(directionalFlow(water,[[0,9,0],[0,18,0],[0,31,0],[3,39,1]],0xf2b16b));
  const plume=new THREE.Group();group.add(plume);const cloud=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x324448,roughness:1,transparent:true,opacity:.4,depthWrite:false}),43),pose=new THREE.Object3D();cloud.frustumCulled=false;plume.add(cloud);
  const deposition=new THREE.Group();group.add(deposition);const deposits=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.38,0),glow(0xc7ad78),30);deposits.frustumCulled=false;deposition.add(deposits);
  labels.push({id:'fluid',text:'热液（水）',position:V(-7,19,8),from:0},{id:'mouth',text:'喷口（出口）',position:V(0,31,0),from:0},{id:'plume',text:'黑色羽流 · 悬浮矿物颗粒',position:V(13,56,0),from:1},{id:'chimney',text:'矿物烟囱 · 固体结构',position:V(10,11,8),from:2});
  return {group,labels,extent:92,target:V(0,26,0),update:(step,time)=>{plume.visible=step>=1;deposition.visible=step>=2;updates.forEach(f=>f(time));for(let i=0;i<43;i++){const t=(i/43+time*.065)%1,a=i*2.399;pose.position.set(t*t*19+Math.cos(a)*(1+t*8),30+t*36,Math.sin(a)*(1+t*7));const s=1+t*4;pose.scale.set(s*.9,s*1.4,s);pose.rotation.set(i*.3,time*.12+i,0);pose.updateMatrix();cloud.setMatrixAt(i,pose.matrix);}cloud.instanceMatrix.needsUpdate=true;for(let i=0;i<30;i++){const t=(i/30+time*.12)%1,a=i*2.399;pose.position.set(Math.cos(a)*(3.6+t*.5),29-t*13,Math.sin(a)*(3.6+t*.5));pose.scale.setScalar(.7+t*.5);pose.updateMatrix();deposits.setMatrixAt(i,pose.matrix);}deposits.instanceMatrix.needsUpdate=true;}};
}

function foodWeb(){
  const group=new THREE.Group(),labels=[],updates=[];const platforms=mat(0x304e57,{metalness:.18,roughness:.66});for(const x of [-36,0,36])mesh(new THREE.CylinderGeometry(14,15,2,36),platforms,group,x,-2,0);
  const chemicals=new THREE.Group();chemicals.position.set(-36,7,0);group.add(chemicals);for(let i=0;i<8;i++){const a=i*2.4,p=V(Math.cos(a)*4.2,Math.sin(i*2)*3,Math.sin(a)*4.2),sphere=mesh(new THREE.SphereGeometry(i%3===0?1.65:1.05,12,8),mat(i%3===0?0xd6bb72:0x79c6d1,{emissive:i%3===0?0x5d4513:0x11434a,emissiveIntensity:.25}),chemicals,p.x,p.y,p.z);if(i)rod(chemicals,V(0,0,0),p,.18,mat(0x83a5a5));}
  const microbes=new THREE.Group();group.add(microbes);for(let i=0;i<7;i++){const cell=new THREE.Group();cell.position.set(Math.cos(i*2.4)*(3+i*.5),6+(i%3)*3,Math.sin(i*2.4)*5);cell.rotation.set(Math.sin(i)*.3,0,i*.8);microbes.add(cell);mesh(new THREE.CapsuleGeometry(1.3,3.4,4,10),mat(0x76bdb0,{transparent:true,opacity:.7,roughness:.35}),cell);for(let j=0;j<4;j++)mesh(new THREE.SphereGeometry(.26,7,5),glow(0xd3d898),cell,Math.sin(j)*.55,j-1.5,Math.cos(j)*.45);tube(cell,[[0,-3,0],[2,-4,.3],[1.4,-5.3,1],[3,-6,.5]],.12,mat(0xc9d9b1));}
  const animals=tubeWorms(group,36,0,0,1.2);const link1=new THREE.Group(),link2=new THREE.Group();group.add(link1,link2);updates.push(directionalFlow(link1,[[-24,8,0],[-17,13,0],[-10,10,0]],0xe1b96d));updates.push(directionalFlow(link2,[[12,10,0],[20,14,0],[27,10,0]],0x92d0a8));
  // An opened tube and transparent animal body make the symbiosis explicit.
  // This enlarged section is an anatomical teaching symbol, not microscopy.
  const section=new THREE.Group();section.position.set(2,0,8);animals.add(section);
  mesh(new THREE.CylinderGeometry(2.1,2.3,12.5,16,1,true,Math.PI/2,Math.PI),mat(0xd7d1b1,{side:THREE.DoubleSide}),section,0,6.5,0);
  mesh(new THREE.CapsuleGeometry(1.45,7.5,5,14),mat(0xd9bfb0,{transparent:true,opacity:.21,roughness:.35,depthWrite:false}),section,0,6.3,0);
  for(let i=0;i<8;i++){const b=mesh(new THREE.CapsuleGeometry(.42,.85,3,8),glow(0xa5cf9f),section,Math.sin(i*2.4)*.85,3+i%4*1.7,.55+Math.cos(i*2.4)*.45);b.rotation.z=i*.7;}
  for(let i=0;i<5;i++){const plume=mesh(new THREE.ConeGeometry(.52,3.5,7),mat(0xaa4446),section,Math.cos(i*1.25)*.8,14,Math.sin(i*1.25)*.8);plume.rotation.z=Math.sin(i*1.25)*.23;}
  labels.push({id:'chem',text:'热液携带的化学物质 · 符号示意',position:V(-36,16,0),from:0},{id:'microbe',text:'化能合成微生物 · 放大示意',position:V(0,19,0),from:1},{id:'animal',text:'部分管虫与细菌共生 · 剖面放大',position:V(36,23,8),from:2});
  return {group,labels,extent:110,target:V(0,8,0),update:(step,time)=>{microbes.visible=step>=1;link1.visible=step>=1;animals.visible=step>=2;link2.visible=step>=2;chemicals.rotation.y=Math.sin(time*.13)*.3;updates.forEach(f=>f(time));}};
}

function habitat(){
  const group=new THREE.Group(),labels=[],updates=[];const mud=mesh(new THREE.BoxGeometry(90,4,47),mat(0x858c79,{roughness:1}),group,0,-3,0);for(let i=0;i<11;i++){tube(group,[[-43,-.8,-20+i*4],[-20,-.3,-22+i*4],[0,-.8,-20+i*4],[20,-.5,-21+i*4],[43,-.8,-20+i*4]],.18,mat(0x939b85));}
  for(let i=0;i<8;i++)rock(group,8+i%4*9,Math.floor(i/4)*2.5,Math.sin(i*3)*11,6.7,4+i%3,5.5,i%2?0x5e736e:0x738078);
  const colonies=new THREE.Group();group.add(colonies);coral(colonies,21,3,-4,.63);coral(colonies,35,3,7,.48);sponge(colonies,9,5,7,1.1);sponge(colonies,31,4,-10,.8);sponge(colonies,22,5,12,.6);
  const food=new THREE.Group();group.add(food);updates.push(directionalFlow(food,[[-45,17,5],[-18,15,3],[11,16,2],[42,19,0]],0x76c4d6));updates.push(planktonCloud(food,{count:41,bounds:[90,18,32],offset:[0,15,1]}));const signals=new THREE.Group();group.add(signals);for(const x of [11,25,37]){const ring=mesh(new THREE.TorusGeometry(4.2,.16,5,28),glow(0xe1ca96),signals,x,1,5);ring.rotation.x=Math.PI/2;}
  labels.push({id:'mud',text:'沉积海床',position:V(-29,1,13),from:0},{id:'rock',text:'岩面与附着群落',position:V(25,22,0),from:0},{id:'food',text:'水流输送食物颗粒 · 示意',position:V(-20,27,0),from:1},{id:'record',text:'记录位置 · 比较环境 · 继续检验',position:V(17,0,21),from:2});
  return {group,labels,extent:108,target:V(0,9,0),update:(step,time)=>{food.visible=step>=1;signals.visible=step>=2;updates.forEach(f=>f(time));}};
}

function equipment(){
  const group=new THREE.Group(),labels=[],model=createRovSystem(),updates=[];model.group.scale.setScalar(1.8);group.add(model.group);
  const partKeys=['vision','navigation','propulsion','protection','tether','arm','sampling',null],helpers=Array.from({length:8},()=>new THREE.Group());helpers.forEach(g=>group.add(g));
  const localHelpers=Array.from({length:4},()=>new THREE.Group());localHelpers.forEach(g=>model.group.add(g));
  const vision=localHelpers[0];
  for(const mount of model.lightMounts){const beam=mesh(new THREE.ConeGeometry(7,31,20,1,true),new THREE.MeshBasicMaterial({color:0xe3dbb1,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),vision,mount.x,mount.y,mount.z-15.5);beam.rotation.x=Math.PI/2;}
  const camera=model.anchors.camera,corners=[V(-8,-5,-40),V(8,-5,-40),V(8,5,-40),V(-8,5,-40)],lines=[];for(let i=0;i<4;i++)lines.push(camera,corners[i],corners[i],corners[(i+1)%4]);const frustumGeometry=new THREE.BufferGeometry().setFromPoints(lines);vision.add(new THREE.LineSegments(frustumGeometry,new THREE.LineBasicMaterial({color:0x8acee1,transparent:true,opacity:.5})));const viewPlane=mesh(new THREE.PlaneGeometry(16,10),new THREE.MeshBasicMaterial({color:0x5ea2b1,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}),vision,0,0,-40);
  rock(helpers[0],-2,-9,-72,8,4,5,0x637976);
  const sonar=localHelpers[1],waves=[];for(let i=0;i<4;i++){const wave=mesh(new THREE.TorusGeometry(1,.035,5,52),new THREE.MeshBasicMaterial({color:0x6dcbdc,transparent:true,opacity:.5,depthWrite:false}),sonar);waves.push(wave);}const fan=mesh(new THREE.ConeGeometry(13,31,28,1,true),new THREE.MeshBasicMaterial({color:0x528eaa,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false}),sonar,0,5,-25);fan.rotation.x=Math.PI/2;
  for(const mount of model.thrusterMounts){updates.push(pointsFlow(localHelpers[2],new THREE.CatmullRomCurve3([mount,mount.clone().add(V(.3,0,7)),mount.clone().add(V(1,-.4,18))]),{count:13,color:0x73cbd2,radius:.35,speed:.42,opacity:.8}));const jet=mesh(new THREE.ConeGeometry(2.4,15,14,1,true),new THREE.MeshBasicMaterial({color:0x58a8b9,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}),localHelpers[2],mount.x,mount.y,mount.z+7.5);jet.rotation.x=-Math.PI/2;}
  // Ship endpoint is an enlarged cutout of the same winch/control hardware.
  const station=createRovControlStation();station.group.scale.setScalar(.88);station.group.position.set(-32,34,14);const shipGroup=new THREE.Group();shipGroup.add(station.group);group.add(shipGroup);const anchor=station.anchor.clone().multiplyScalar(.88).add(station.group.position),vehicleEnd=model.anchors.tether.clone().multiplyScalar(1.8),cordCurve=new THREE.CatmullRomCurve3([vehicleEnd,V(-5,28,-4),V(-24,35,-1),anchor]);
  mesh(new THREE.TubeGeometry(cordCurve,40,.36,7,false),mat(0x8da5a7,{roughness:.6,metalness:.2}),shipGroup);const down=pointsFlow(shipGroup,cordCurve,{count:17,color:0xe1b668,radius:.68,speed:-.19}),up=pointsFlow(shipGroup,cordCurve,{count:17,color:0x75d4dc,radius:.56,speed:.15});
  const tag=mesh(new THREE.BoxGeometry(9,6,.6),mat(0xd0c7a8),helpers[6],19,-4,12);tag.rotation.y=.17;for(let i=0;i<3;i++){const bar=mesh(new THREE.BoxGeometry(5,.35,.12),mat(0x49636b),helpers[6],19,-2.7-i*1.5,12.45);bar.rotation.y=.17;}rod(helpers[6],V(10,-2,9),V(19,-1,12),.12,mat(0xb7c5bd));
  const sampleRock=rock(helpers[5],9,-17,-39.5,1.5,1.2,1.4,0x9b9a79);
  labels.push(
    {id:'eq-camera',text:'相机视野与灯光 · 示意',position:V(0,-1,-49),only:0},
    {id:'eq-sonar',text:'前向声呐 · 声波范围示意',position:V(0,17,-22),only:1},
    {id:'eq-navigation',text:'导航与姿态传感头（示意）',position:V(4,21,7),only:1},
    {id:'eq-thrust',text:'推进器推动水流 · 调整运动和悬停',position:V(-15,-3,20),only:2},
    {id:'eq-float',text:'固体浮力材料（外形示意）',position:V(-12,17,1),only:3},
    {id:'eq-pressure',text:'耐压舱 · 保护电子设备 · 不载人',position:V(0,0,-5),only:3},
    {id:'eq-down',text:'船 → 潜器：供电与控制指令',position:V(-23,35,-1),only:4},
    {id:'eq-up',text:'潜器 → 船：视频与状态',position:V(4,25,0),only:4},
    {id:'eq-arm',text:'关节机械臂与夹爪 · 持取动作',position:V(11,-15,-37),only:5},
    {id:'eq-bottles',text:'随身采水瓶 · 封盖示意',position:V(-3,-2,12),only:6},
    {id:'eq-record',text:'样本与站位记录对应',position:V(20,1,12),only:6},
    {id:'eq-crew',text:'船上人员：看画面、下达操作',position:V(-41,43,22),only:7},
    {id:'eq-winch',text:'绞车管理脐带缆 · 布放与回收',position:V(-26,49,5),only:7}
  );
  function update(step,time,frame){const selected=partKeys[step];model.setHighlight(selected);model.setCutaway(step===3);helpers.forEach((g,i)=>g.visible=i===step);localHelpers.forEach((g,i)=>g.visible=i===step);shipGroup.visible=step===4||step===7;const phase=frame?.demoTime!==null&&frame?.demoTime!==undefined?clamp(time/2.8,0,1):clamp((time%6)/3,0,1),action=smooth(phase);model.update({time,armProgress:step===5?action:0,samplingProgress:step===6?action:0});
    for(let i=0;i<waves.length;i++){const t=(time*.38+i/waves.length)%1,wave=waves[i];wave.position.set(0,5,-10-t*31);wave.scale.set(2+t*13,1+t*5.5,1);wave.material.opacity=(1-t)*.7;}updates.forEach(f=>f(time));station.update(step===7?time:0);down(time);up(time);sampleRock.scale.y=1.2;}
  function cameraFrame(aspect,step){const targets=[V(0,-1,-20),V(0,7,-16),V(0,-1,1),V(0,6,0),V(-10,22,1),V(7,-9,-27),V(1,-3,8),V(-23,28,9)],directions=[V(.75,.42,-1),V(.7,.42,-1),V(1,.4,-.55),V(.75,.7,-1),V(.8,.32,-1),V(.8,.35,-1),V(.7,.35,1),V(.72,.38,-1)],distances=[125,117,116,111,153,100,94,148];const phone=aspect<.94,fov=phone?54:43,fit=aspect<.9?.9/Math.max(.48,aspect):1,position=targets[step].clone().addScaledVector(directions[step].clone().normalize(),distances[step]*fit);return {position,target:targets[step].clone(),fov};}
  return {group,labels,extent:95,target:V(0,4,-8),update,cameraFrame};
}

function comparison(){
  const group=new THREE.Group(),labels=[],updates=[];const silver=mat(0xa2b6b8,{metalness:.5,roughness:.35});mesh(new THREE.BoxGeometry(78,2,28),mat(0x344e58,{metalness:.3}),group,0,-2,0);const bottles=[];
  for(const [index,x] of [[0,-23],[1,23]]){const bottle=new THREE.Group();bottle.position.x=x;group.add(bottle);const liquid=mesh(new THREE.CylinderGeometry(6.25,6.25,21,32),mat(0x79b6c0,{transparent:true,opacity:.16,roughness:.08,metalness:0,depthWrite:false}),bottle,0,11,0);const wall=mesh(new THREE.CylinderGeometry(6.55,6.55,23,32,1,true),mat(0xc2e0dc,{transparent:true,opacity:.2,side:THREE.DoubleSide,roughness:.1,depthWrite:false}),bottle,0,12,0);for(const y of [.5,23.5])mesh(new THREE.CylinderGeometry(6.8,6.8,1.2,28),silver,bottle,0,y,0);mesh(new THREE.CylinderGeometry(3.5,4.7,2.5,20),mat(index?0x71a9b7:0xbca25e),bottle,0,25,0);for(const z of [-8.5,8.5])rod(bottle,V(-8,0,z),V(-8,21,z),.27,silver);const symbols=new THREE.Group();bottle.add(symbols);updates.push(planktonCloud(symbols,{count:18,bounds:[9,17,8],offset:[0,11,0],color:0xd4d5b2}));bottles.push(bottle);}
  const matched=new THREE.Group();group.add(matched);for(const x of [-23,23]){const ring=mesh(new THREE.TorusGeometry(8,.23,7,40),glow(0xd5c597),matched,x,2,0);ring.rotation.x=Math.PI/2;}
  const checklist=new THREE.Group();group.add(checklist);for(const x of [-23,23]){for(let i=0;i<3;i++){const tag=mesh(new THREE.BoxGeometry(5.5,.65,.5),mat(0xabc0bb),checklist,x+10.5,4+i*3.4,8);const dot=mesh(new THREE.SphereGeometry(.53,8,5),glow(0xb9ce9f),checklist,x+6.5,4+i*3.4,8);}}
  labels.push({id:'a',text:'水样 A · 教学示意',position:V(-23,29,0),from:0},{id:'b',text:'水样 B · 教学示意',position:V(23,29,0),from:0},{id:'method',text:'同类材料 · 相同方法',position:V(0,-5,17),from:1},{id:'limit',text:'颗粒为概念符号，不表示实测成分或多少',position:V(0,38,0),from:2});
  return {group,labels,extent:100,target:V(0,13,0),update:(step,time)=>{matched.visible=step>=1;checklist.visible=step>=2;updates.forEach(f=>f(time));}};
}

/** A replaceable, deterministic Three.js teaching-stage adapter. */
export function createLearningWorld(){
  const group=new THREE.Group();group.name='learning-world';group.visible=false;const stages=new Map();let kind=null,step=0,stepOverride=null,progress=0,elapsed=0,demoTime=null,lastFrame={};
  const builders={equipment,hydrothermal,'black-smoker':blackSmoker,'food-web':foodWeb,habitat,comparison};
  function update(frame={}){lastFrame={...frame};const nextKind=LEARNING_STEPS[frame.explanation]?frame.explanation:null;if(nextKind!==kind){stepOverride=null;demoTime=null;}kind=nextKind;progress=clamp(Number(frame.progress)||0,0,1);elapsed=Number.isFinite(frame.shotElapsed)?frame.shotElapsed:Number.isFinite(frame.elapsed)?frame.elapsed:progress*(frame.duration||15);const count=LEARNING_STEPS[kind]||0;step=count?clamp(stepOverride??(Number.isInteger(frame.lessonStep)?frame.lessonStep:Math.floor(progress*count)),0,count-1):0;
    group.visible=Boolean(builders[kind]);for(const [key,stage] of stages)stage.group.visible=key===kind;
    if(group.visible){if(!stages.has(kind)){const stage=builders[kind]();stages.set(kind,stage);group.add(stage.group);}const stage=stages.get(kind);stage.group.visible=true;const time=kind==='equipment'&&demoTime!==null?demoTime:kind==='equipment'&&stepOverride===null&&Number.isFinite(frame.lessonProgress)?frame.lessonProgress*4:elapsed;stage.update(step,time,{demoTime});}
  }
  function setStep(value){if(value!==null&&(!Number.isInteger(value)||value<0))throw new TypeError('学习步骤须为非负整数或 null');stepOverride=value;update(lastFrame);}
  function setDemoTime(value){if(value!==null&&(!Number.isFinite(value)||value<0))throw new TypeError('设备演示时间须为非负秒数或 null');demoTime=value;update(lastFrame);}
  function cameraFrame(aspect){const stage=stages.get(kind);if(!stage)return null;if(stage.cameraFrame)return stage.cameraFrame(aspect,step);const phone=aspect<.94,fov=phone?54:43;const distance=stage.extent/(2*Math.tan(THREE.MathUtils.degToRad(fov*.5)))*(phone?1/Math.max(.54,aspect)*1.13:1.16)*1.60;const target=stage.target.clone();const direction=kind==='hydrothermal'?V(.24,.28,1):kind==='habitat'?V(.42,.49,1):V(.25,.25,1);direction.normalize();return {position:target.clone().addScaledVector(direction,distance),target,fov};}
  return {group,update,setStep,setDemoTime,cameraFrame,getLabels:()=>{const stage=stages.get(kind);return stage?stage.labels.filter(label=>label.only!==undefined?step===label.only:step>=(label.from||0)):[];},getState:()=>({kind,step,stepsCount:LEARNING_STEPS[kind]||0,manual:stepOverride!==null}),isActive:()=>group.visible,reset:()=>{stepOverride=null;demoTime=null;update({});}};
}
