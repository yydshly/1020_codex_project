import * as THREE from 'three';
import {RoundedBoxGeometry} from '../quality-window/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

let seed=204824;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const matrix=new THREE.Matrix4();
function metreUvs(g,x=0,y=0,z=0){const uv=g.attributes.uv,p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<uv.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));if(ax>ay&&ax>az)uv.setXY(i,p.getZ(i)+z,p.getY(i)+y);else if(ay>az)uv.setXY(i,p.getX(i)+x,p.getZ(i)+z);else uv.setXY(i,p.getX(i)+x,p.getY(i)+y);}return g;}
function mesh(parent,g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(parent,w,h,d,x,y,z,m,r=.015){const g=r>0&&Math.min(w,h,d)>=.06?new RoundedBoxGeometry(w,h,d,1,Math.min(r,Math.min(w,h,d)*.2)):new THREE.BoxGeometry(w,h,d);return mesh(parent,metreUvs(g,x,y,z),m,x,y,z);}
function cylinder(parent,r1,r2,h,x,y,z,m,segments=12){return mesh(parent,new THREE.CylinderGeometry(r1,r2,h,segments),m,x,y,z);}
function wallShape(width,height,holes,depth=.48){const s=new THREE.Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(width/2,height);s.lineTo(-width/2,height);s.closePath();for(const {x,y,w,h} of holes){const p=new THREE.Path();p.moveTo(x-w/2,y);p.lineTo(x-w/2,y+h);p.lineTo(x+w/2,y+h);p.lineTo(x+w/2,y);p.closePath();s.holes.push(p);}return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:12});}

export function buildArchitecture(scene,m,{shopAssets}={}){
 const architecture=new THREE.Group();architecture.name='Metre-scale canal masonry and deep architectural openings';scene.add(architecture);
 // Waterline is -0.12, the walking quay is +0.68. Both banks remain solid
 // under every camera, including the steps cut into the right-hand landing.
 for(const side of [-1,1]){
  const ground=box(architecture,6.1,.7,142,side*7.2,.28,-6,m.paving,.025);
  ground.name='Wet cobblestone quay';
  box(architecture,.55,2.8,142,side*4.42,-.85,-6,m.stone,.03);
  for(let z=-76;z<66;z+=.88){
   const coping=box(architecture,.72,.26,.84+random()*.025,side*4.39,.66+random()*.008,z,m.stonePale,.045);
   coping.rotation.y=(random()-.5)*.006;
  }
  // Coarse submerged foundation stones and a dark joint at the high-water mark.
  for(let z=-75;z<65;z+=1.35)box(architecture,.12,.28,1.27,side*4.115,-.11+(random()-.5)*.06,z,m.stone,.025);
 }
 const houses=[
  {z:6.1,w:7.4,h:9.35,rise:3.0,brick:m.brickWarm,wood:m.greenWood,roof:'gable',shop:true},
  {z:-.9,w:6.4,h:8.65,rise:2.7,brick:m.brick,wood:m.blueWood,roof:'hip'},
  {z:-7.8,w:7.2,h:10.7,rise:3.0,brick:m.brickDark,wood:m.greenWood,roof:'gable'},
  {z:-15.5,w:7.7,h:9.2,rise:2.6,brick:m.brickWarm,wood:m.blueWood,roof:'hip'},
  {z:-23,w:6.7,h:8.4,rise:2.9,brick:m.brick,wood:m.greenWood,roof:'gable'},
  {z:-38,w:8.2,h:10.4,rise:3.2,brick:m.brickDark,wood:m.blueWood,roof:'hip'},
  {z:14.1,w:8.1,h:10.2,rise:3.1,brick:m.brickDark,wood:m.blueWood,roof:'hip'},
  {z:22.2,w:8.1,h:8.7,rise:3.4,brick:m.brick,wood:m.greenWood,roof:'gable'}
 ];
 const shopLights=[];
 for(let index=0;index<houses.length;index++){
  const p=houses[index],house=new THREE.Group();house.position.set(10.25+(index%3)*.13,.72,p.z);house.rotation.y=Math.PI/2;house.name=`Canal house ${index+1}, ${p.w}m frontage`;architecture.add(house);
  buildHouse(house,p,m,shopLights,shopAssets);
 }
 // Opposite bank has separate shallow façades and roofs; it is not a row of
 // full repeats of the hero houses. The camera sees oblique end walls here.
 for(let i=0;i<7;i++){
  const house=new THREE.Group();house.position.set(-10.6,.72,-5-i*7.5);house.rotation.y=-Math.PI/2;architecture.add(house);
  buildHouse(house,{w:6.6+(i%2)*.65,h:8+(i%3)*.9,rise:2.8,brick:i%2?m.brick:m.brickDark,wood:m.greenWood,roof:i%2?'hip':'gable',quiet:true},m,shopLights,shopAssets);
 }
 buildBridge(architecture,m,-30.2);
 // Matching solid boxes support the upper-storey scanned plants.
 for(const z of [7.7,4.5]){const x=9.86;box(architecture,.42,.26,1.24,x,3.96,z,m.greenWood,.018);box(architecture,.34,.035,1.15,x,4.095,z,m.soil,.004);for(const zz of [z-.41,z+.41])box(architecture,.47,.05,.05,x+.08,3.83,zz,m.metal,.004);}
 for(const [x,z] of [[4.7,13.5],[4.7,-8.8],[-4.7,2.2],[-4.7,-18]])buildBollard(architecture,m,x,z);
 // Canal landing steps are a coherent continuous object rather than a prop
 // laid on the water. Lower treads disappear below its absorbing surface.
 for(let i=0;i<11;i++)box(architecture,1.55,.18,1.6,5.05-i*.125,.63-i*.13,1.7,m.stone,.025);
 for(const z of [10.5,-11.5,-24.5])buildStreetLamp(architecture,m,5.4,z);
 // Rain runoff reaches the water at identifiable drains.
 for(const z of [-2.8,10.2]){
  const grate=box(architecture,.85,.025,.52,5.15,.647,z,m.metal,.002);
  for(let i=0;i<7;i++)box(architecture,.045,.03,.49,4.84+i*.105,.667,z,m.zinc,.002);
 }
 architecture.updateMatrixWorld(true);
 // Merge only static, opaque architecture, keeping all world-space detail.
 // This reduces draw calls without discarding bevels, recesses or room depth.
 mergeStatic(architecture);
 return {group:architecture,shopLights,windowPosition:new THREE.Vector3(-9.2,3.15,10.2)};
}

function buildHouse(g,p,m,shopLights,shopAssets){
 const width=p.w,height=p.h,levels=3,floorStep=height/levels,columns=width>7.5?3:2;
 const holes=[];const positions=[];
 for(let floor=0;floor<levels;floor++){
  const bottom=.26+floor*floorStep;
  for(let c=0;c<columns;c++){
   const x=(c-(columns-1)/2)*(width/(columns+.35));
   if(floor===0&&p.shop)continue;
   const h=floor===0?2.35:Math.min(2.1,floorStep*.64),w=floor===0?1.35:1.16;
   holes.push({x,y:bottom,w,h});positions.push({x,y:bottom,w,h,floor});
  }
 }
 if(p.shop){holes.push({x:-.6,y:.12,w:4.45,h:2.62});positions.push({x:-.6,y:.12,w:4.45,h:2.62,floor:0,shop:true});holes.push({x:2.65,y:.06,w:.96,h:2.68});positions.push({x:2.65,y:.06,w:.96,h:2.68,floor:0,door:true});}
 const facade=mesh(g,wallShape(width,height,holes),p.brick);facade.name='Loadbearing brick wall with open recesses';
 box(g,width,.4,6.3,0,height+.04,3.1,m.interior,.01);
 box(g,.4,height,6.3,-width/2+.12,height/2,3.2,p.brick,.02);box(g,.4,height,6.3,width/2-.12,height/2,3.2,p.brick,.02);
 box(g,width,height,.35,0,height/2,6.2,p.brick,.01);
 // Layered cut-stone plinth, ledges and cornices carry visible overhangs.
 for(const [y,h,d] of [[.13,.24,.65],[floorStep-.1,.14,.57],[height-.37,.16,.62],[height-.16,.16,.77],[height+.03,.12,.91]])box(g,width+.12,h,d,0,y,.12-d/2,m.stonePale,.025);
 for(let i=0;i<Math.floor(width/.42);i++)box(g,.19,.19,.2,-width/2+.22+i*.42,height-.28,-.34,m.stonePale,.012);
 for(const o of positions)buildWindow(g,o,p,m,shopLights,shopAssets);
 for(const sx of [-1,1]){
  const x=sx*(width/2-.08);
  for(let y=.6;y<height-.5;y+=.44)box(g,.21,.26,.55,x,y,.08,m.stonePale,.018);
  const gutter=cylinder(g,.035,.035,height+.3,x-sx*.19,height/2,-.34,m.zinc,10);gutter.rotation.z=.002;
  for(let y=.6;y<height;y+=2.3)box(g,.1,.03,.13,x-sx*.19,y,-.36,m.zinc,.004);
 }
 buildRoof(g,width,height,p.rise,p.roof,m);
 if(!p.quiet){
  // Genuine wrought iron anchor plates, asymmetric around the openings.
  for(const x of [-width*.34,width*.31])for(const y of [3.18,5.88]){
   const a=box(g,.055,.32,.025,x,y,-.04,m.metal,.006);a.rotation.z=.72;
   const b=box(g,.055,.32,.025,x,y,-.04,m.metal,.006);b.rotation.z=-.72;
  }
 }
}

function buildWindow(g,o,p,m,shopLights,shopAssets){
 const {x,y,w,h}=o,frame=p.wood;
 // Window sits 20cm behind the face; stone sill and drip course project out.
 box(g,w+.29,.15,.82,x,y-.025,.04,m.stonePale,.028);
 box(g,w+.23,.15,.64,x,y+h+.04,.04,m.stonePale,.024);
 for(const side of [-1,1])box(g,.1,h+.08,.18,x+side*(w/2-.035),y+h/2,.19,frame,.012);
 box(g,w,.1,.18,x,y+.04,.19,frame,.012);box(g,w,.1,.18,x,y+h-.035,.19,frame,.012);
 const roomDepth=o.shop?3.7:3.3;
 box(g,w+.1,h+.08,.08,x,y+h/2,roomDepth,m.interior,.002);
 box(g,w+.1,.06,roomDepth,x,y,roomDepth/2,m.oak,.002);box(g,w+.1,.06,roomDepth,x,y+h,roomDepth/2,m.interior,.002);
 for(const side of [-1,1])box(g,.06,h,roomDepth,x+side*w/2,y+h/2,roomDepth/2,m.interior,.002);
 if(o.shop){
  for(let i=0;i<3;i++)box(g,.055,h-.07,.13,x-w/2+(i+1)*w/4,y+h/2,.195,frame,.006);
  box(g,w,.055,.14,x,y+h*.77,.19,frame,.006);
  buildShop(g,x,y,w,h,roomDepth,m,shopLights,shopAssets);
 }else if(o.door){
  box(g,w-.16,h-.14,.11,x,y+h/2,.26,frame,.008);
  for(const yy of [.45,1.2,2.05])box(g,w-.3,.44,.05,x,y+yy,.18,m.oak,.01);
  const knob=cylinder(g,.025,.025,.045,x+w*.3,y+1.05,.13,m.zinc);knob.rotation.x=Math.PI/2;
 }else{
  if(random()<.64){const curtain=new THREE.PlaneGeometry(w*.24,h-.1,14,1),pos=curtain.attributes.position;for(let i=0;i<pos.count;i++)pos.setZ(i,Math.sin(pos.getX(i)*45)*.027);for(const side of [-1,1])mesh(g,curtain,m.fabric,x+side*w*.34,y+h/2,.54);}
  box(g,.055,h-.1,.14,x,y+h/2,.2,frame,.006);box(g,w-.1,.05,.13,x,y+h*.5,.2,frame,.006);
  if(random()<.22){box(g,.18,.25,.18,x+.22,y+.3,.71,m.paper,.02);box(g,.06,.25,.04,x+.28,y+.3,.59,m.oak,.002);}
 }
 if(!o.door){const glass=mesh(g,new THREE.PlaneGeometry(w-.13,h-.15),m.glass,x,y+h/2,.17);glass.rotation.y=Math.PI;glass.castShadow=false;}
 if(o.floor>0){
  // Separate radial brick arch voussoirs, hand-set above the real opening.
  const r=w*.57;
  for(let i=0;i<13;i++){const a=(i/12)*Math.PI;const stone=box(g,.145,.22,.21,x+Math.cos(a)*r,y+h+.11+Math.sin(a)*.2,-.035,p.brick,.018);stone.rotation.z=(a-Math.PI/2)*.24;}
 }
}

function buildShop(g,x,y,w,h,depth,m,lights,shopAssets){
 box(g,w+.25,.44,.26,x,y+h+.33,-.16,m.greenWood,.025);
 // Code-drawn lettering is a separate surface on the physically modeled sign.
 const label=makeSignTexture('PAPIER  &  LIVRES'),ink=new THREE.MeshStandardMaterial({map:label,transparent:true,roughness:.9});ink.name='Canal/signInk';
 const sign=mesh(g,new THREE.PlaneGeometry(w,.28),ink,x,y+h+.33,-.303);sign.rotation.y=Math.PI;
 if(shopAssets)shopAssets.populate(g,{x,y,w,h,depth});
 else for(let shelf=0;shelf<4;shelf++){
  const yy=y+.34+shelf*.43;box(g,w-.3,.055,.35,x,yy,depth-.2,m.oak,.008);
  let xx=x-w/2+.25;
  while(xx<x+w/2-.2){const bw=.05+random()*.065,bh=.24+random()*.13;const mat=m.books[Math.floor(random()*m.books.length)];const book=box(g,bw,bh,.2,xx,yy+.035+bh/2,depth-.38,mat,.003);book.rotation.z=(random()-.5)*.06;xx+=bw+.012;}
 }
 const table=box(g,2.6,.1,.9,x,y+.79,1.15,m.oak,.02);
 for(const dx of [-1.05,1.05])for(const dz of [-.32,.32])box(g,.085,.75,.085,x+dx,y+.38,1.15+dz,m.oak,.006);
 if(shopAssets){for(let i=0;i<3;i++)shopAssets.looseBook(g,{x:x-.65+i*.65,y:y+.841,z:1.12+(i%2)*.05,index:i*7,angle:-.22+i*.21});}
 else for(let i=0;i<6;i++){const b=box(g,.31,.045,.42,x-1+i*.38,y+.87+i%2*.025,1.13,m.paper,.006);b.rotation.y=(random()-.5)*.3;}
 for(const dx of [-1.4,1.4]){
  cylinder(g,.008,.008,.38,x+dx,y+h-.2,.95,m.metal,8);
  const lamp=cylinder(g,.15,.055,.11,x+dx,y+h-.43,.95,m.metal,24);
  cylinder(g,.125,.125,.018,x+dx,y+h-.5,.95,m.lamp,24);
  const point=new THREE.PointLight('#ffcf8e',30,6,2);point.position.set(x+dx,y+h-.6,1.02);g.add(point);lights.push(point);
 }
 const light=new THREE.RectAreaLight('#ffd6a2',16,w-.2,h-.4);light.position.set(x,y+h*.6,depth-.1);light.lookAt(x,y+h*.5,-2);g.add(light);lights.push(light);
}

function buildRoof(g,w,h,rise,type,m){
 const half=w/2+.3,depth=6.9;
 // Pitched roof with real eaves and tile courses, no printed roof plane.
 for(const side of [-1,1]){
  const length=Math.hypot(half,rise),roof=box(g,length,.11,depth,side*half/2,h+rise/2+.1,3.0,m.slate,.012);roof.rotation.z=-side*Math.atan2(rise,half);
  const rows=Math.floor(length/.32),cols=Math.floor(depth/.27);
  for(let row=0;row<rows;row++)for(let c=0;c<cols;c++){
   const t=(row+.5)/rows,xx=side*half*(1-t),yy=h+rise*t+.17,zz=-.3+c*.27+(row%2)*.1;
   const tile=box(g,length/rows+.035,.035,.265,xx,yy,zz,m.slate,.009);tile.rotation.z=-side*Math.atan2(rise,half);tile.rotation.x=(random()-.5)*.012;
  }
 }
 // Gable closes the silhouette; old houses have modest stepped coping.
 const s=new THREE.Shape();s.moveTo(-w/2,h);s.lineTo(w/2,h);s.lineTo(0,h+rise);s.closePath();mesh(g,new THREE.ExtrudeGeometry(s,{depth:.32,bevelEnabled:false}),m.brick,0,0,-.02);
 if(type==='gable'){
  for(const side of [-1,1])for(let i=0;i<7;i++)box(g,w/14+.12,.14,.57,side*(w/2-i*w/14),h+i*rise/7+.04,-.12,m.stonePale,.018);
 }else{
  for(const side of [-1,1]){const bar=box(g,Math.hypot(w/2,rise)+.15,.16,.5,side*w/4,h+rise/2+.1,-.08,m.stonePale,.025);bar.rotation.z=-side*Math.atan2(rise,w/2);}
 }
 for(let z=-.3;z<6.4;z+=.32){const ridge=cylinder(g,.095,.095,.34,0,h+rise+.16,z,m.slate,12);ridge.rotation.x=Math.PI/2;}
 const chimney=box(g,.65,1.35,.72,w*.23,h+rise*.84+.55,4.8,m.brick,.025);box(g,.8,.15,.84,w*.23,h+rise*.84+1.29,4.8,m.stonePale,.025);
 for(const dx of [-.18,.18])cylinder(g,.115,.13,.35,w*.23+dx,h+rise*.84+1.53,4.8,m.brick,14);
}

function buildBridge(g,m,z){
 const deckHeight=x=>.68+1.32*(1-(x*x)/100);
 const shape=new THREE.Shape();shape.moveTo(-10,-2.4);shape.lineTo(10,-2.4);shape.lineTo(10,deckHeight(10));for(let x=9.5;x>=-10;x-=.5)shape.lineTo(x,deckHeight(x));shape.closePath();
 const hole=new THREE.Path();hole.moveTo(-3.7,-2.5);hole.lineTo(-3.7,.1);hole.absellipse(0,.1,3.7,1.4,Math.PI,0,true);hole.lineTo(3.7,-2.5);hole.closePath();shape.holes.push(hole);
 const bridge=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:3.4,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:2}),m.stone,0,0,z);
 for(let i=0;i<31;i++){const a=Math.PI*i/30;const v=box(g,.34,.34,3.7,Math.cos(a)*3.87,.1+Math.sin(a)*1.57,z+1.65,m.stonePale,.022);v.rotation.z=a-Math.PI/2;}
 for(const zz of [z-.1,z+3.5]){
  const path=[];
  for(let x=-9.9;x<10;x+=.6){const y=deckHeight(x);box(g,.065,.7,.065,x,y+.42,zz,m.metal,.007);const coping=box(g,.62,.16,.4,x,y+.08,zz,m.stonePale,.022);coping.rotation.z=Math.atan(-.0264*x);path.push(new THREE.Vector3(x,y+.79,zz));}
  mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),80,.033,8,false),m.metal);
 }
 const surface=new THREE.PlaneGeometry(20,3.4,80,1),p=surface.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),zz=p.getY(i);p.setXYZ(i,x,deckHeight(x)+.035,-zz+z+1.7);surface.attributes.uv.setXY(i,x,-zz);}
 surface.computeVertexNormals();mesh(g,surface,m.paving);
}
function buildBollard(g,m,x,z){cylinder(g,.11,.17,.44,x,.91,z,m.metal,16);cylinder(g,.14,.14,.07,x,1.13,z,m.metal,16);const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.022,6,18),m.metal);ring.position.set(x,.99,z-.1);g.add(ring);}
function buildStreetLamp(g,m,x,z){cylinder(g,.035,.075,3.6,x,2.43,z,m.metal,12);box(g,.38,.06,.38,x,4.24,z,m.metal,.018);box(g,.32,.4,.32,x,4.02,z,m.glass,.005);const cap=new THREE.Mesh(new THREE.ConeGeometry(.28,.18,4),m.metal);cap.position.set(x,4.38,z);cap.rotation.y=Math.PI/4;g.add(cap);cylinder(g,.045,.045,.16,x,4.02,z,m.lamp,12);const point=new THREE.PointLight('#ffcf92',9,7,2);point.position.set(x,4.01,z);g.add(point);}
function makeSignTexture(text){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=100;const c=canvas.getContext('2d');c.clearRect(0,0,1024,100);c.fillStyle='#c8bb96';c.textAlign='center';c.font='42px Georgia';c.fillText(text,512,65);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;}
function mergeStatic(group){
 const byMaterial=new Map(),remove=[];group.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.material.transparent||o.material.transmission>0)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.deleteAttribute('tangent');if(!g.attributes.uv){const uv=new Float32Array(g.attributes.position.count*2);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));}const key=o.material;if(!byMaterial.has(key))byMaterial.set(key,[]);byMaterial.get(key).push(g);remove.push(o);});
 for(const o of remove){o.removeFromParent();o.geometry.dispose();}
 // The merged objects already contain world coordinates; reset group transform.
 for(const [material,geometries]of byMaterial){const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('Architecture merge failed: '+material.name);const geometry=mergeVertices(merged,1e-6);merged.dispose();const o=new THREE.Mesh(geometry,material);o.castShadow=o.receiveShadow=true;o.name='Static architectural detail / '+material.name;group.add(o);for(const g of geometries)g.dispose();}
}
