import * as THREE from 'three';
import {RoundedBoxGeometry} from '../quality-window/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildIndustrialContext} from './context.js';

// A separate industrial harbour, authored in metres. No city geometry, city
// camera route, or city lighting package is imported into this space.
export const stationSpace={water:{halfWidth:20,level:-.12},quayTop:.65,
 dock:{boat:[17.6,-.12,8],gangwayLand:[20,.74,9.1],gangwayBoat:[18.55,.68,9.1]},
 shots:{
  shipyard:{position:[-21.8,3.0,23],target:[-30.0,3.9,-4.5],fov:53},
  platform:{position:[21.95,2.3,22.2],target:[18.4,1.8,6.2],fov:60},
  hall:{position:[25.5,2.3,10.4],target:[30.5,2.0,4],fov:53},
  basin:{position:[-21.4,2.6,27],target:[0,3,-7],fov:58}
 },
 navigation:{
  shipyard:{bounds:{x:[-39,-20.7],y:[1.7,3.1],z:[9.2,29]}},
  platform:{bounds:{x:[20.85,23.35],y:[1.7,3.1],z:[-13.5,22.8]}},
  hall:{bounds:{x:[24.65,29.95],y:[1.9,3.1],z:[-.6,12.6]}},
  eyeHeight:1.7,waterX:[-20,20],doorPassage:{x:[23.05,24.7],z:[.8,1.35],floor:.855},
  walls:[
   {name:'west-front-south',min:[24.1,.65,-1.33],max:[24.65,4.5,.02]},
   {name:'west-front-north',min:[24.1,.65,1.38],max:[24.65,4.5,13.33]},
   {name:'station-back',min:[32.75,.65,-1.33],max:[33.2,4.6,13.33]},
   {name:'station-south',min:[24.1,.65,-1.34],max:[33.2,4.6,-.94]},
   {name:'station-north',min:[24.1,.65,12.94],max:[33.2,4.6,13.34]}
  ]
 }
};

function material(source,name,color,roughness){const result=source.clone();result.onBeforeCompile=source.onBeforeCompile;result.customProgramCacheKey=source.customProgramCacheKey;result.name='Station/'+name;if(color)result.color.set(color);if(roughness!==undefined)result.roughness=roughness;return result;}
function metreUvs(g,offset=new THREE.Vector3()){
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;if(!uv)return g;
 for(let i=0;i<p.count;i++){const x=p.getX(i)+offset.x,y=p.getY(i)+offset.y,z=p.getZ(i)+offset.z,ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));if(ax>ay&&ax>az)uv.setXY(i,z,y);else if(ay>az)uv.setXY(i,x,z);else uv.setXY(i,x,y);}return g;
}
function mesh(g,geometry,m,x=0,y=0,z=0,name=''){const o=new THREE.Mesh(geometry,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;if(name)o.name=name;g.add(o);return o;}
function box(g,w,h,d,x,y,z,m,r=.012,name=''){
 const geometry=r>0&&Math.min(w,h,d)>.055?new RoundedBoxGeometry(w,h,d,1,Math.min(r,Math.min(w,h,d)*.17)):new THREE.BoxGeometry(w,h,d);
 return mesh(g,metreUvs(geometry,new THREE.Vector3(x,y,z)),m,x,y,z,name);
}
function cylinder(g,r0,r1,h,x,y,z,m,segments=12){return mesh(g,new THREE.CylinderGeometry(r0,r1,h,segments),m,x,y,z);}
function rod(g,a,b,r,m,segments=10){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),o=cylinder(g,r,r,start.distanceTo(end),...(start.clone().add(end).multiplyScalar(.5).toArray()),m,segments);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return o;}
function curveTube(g,points,r,m,tubular=40,radial=8){return mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),tubular,r,radial,false),m);}
function reverseFaces(geometry){const index=geometry.index;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}geometry.computeVertexNormals();return geometry;}
function roofSheet(g,geometry,outer,inner,name){
 if(geometry.attributes.normal.getY(0)<0)reverseFaces(geometry);
 mesh(g,geometry,outer,0,0,0,name);
 const underside=geometry.clone(),p=underside.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-.065);reverseFaces(underside);mesh(g,underside,inner,0,0,0,name+' / actual underside');
}
function bolt(g,x,y,z,m,axis='z',radius=.037){const o=cylinder(g,radius,radius,.035,x,y,z,m,6);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;return o;}
function iBeamX(g,length,height,width,x,y,z,m){box(g,length,.055,width,x,y+height/2,z,m,.008);box(g,length,.055,width,x,y-height/2,z,m,.008);box(g,length,height,.045,x,y,z,m,.004);}
function iBeamZ(g,length,height,width,x,y,z,m){box(g,width,.055,length,x,y+height/2,z,m,.008);box(g,width,.055,length,x,y-height/2,z,m,.008);box(g,.045,height,length,x,y,z,m,.004);}
function iColumn(g,height,x,y,z,m,width=.22){box(g,width,height,.045,x,y,z,m,.006);for(const xx of [-1,1])box(g,.045,height,width,x+xx*width/2,y,z,m,.006);box(g,width+.16,.085,width+.16,x,y-height/2+.04,z,m,.012);for(const dx of [-.12,.12])for(const dz of [-.12,.12])bolt(g,x+dx,y-height/2+.095,z+dz,m,'y');}
function openingWall(width,height,openings,depth=.32){const s=new THREE.Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(width/2,height);s.lineTo(-width/2,height);s.closePath();for(const o of openings){const h=new THREE.Path();h.moveTo(o.x-o.w/2,o.y);h.lineTo(o.x-o.w/2,o.y+o.h);h.lineTo(o.x+o.w/2,o.y+o.h);h.lineTo(o.x+o.w/2,o.y);h.closePath();s.holes.push(h);}return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false});}
function labelMaterial(text,name,bg='#24393b',fg='#d8d2bb',width=1536,height=256){
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;
 const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.78});m.name='Station/'+name;
 if(canvas){canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,width,height);c.strokeStyle=fg;c.lineWidth=7;c.strokeRect(20,20,width-40,height-40);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font='500 '+Math.round(height*.49)+'px Georgia,"Microsoft YaHei",serif';c.fillText(text,width/2,height*.51,width*.91);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.map=t;}
 return m;
}

export function buildStationScene(scene,m){
 const group=new THREE.Group();group.name='Independent North Dock and Canal Station';scene.add(group);
 const auxiliaryGroup=new THREE.Group();auxiliaryGroup.name='Station distant continuous support terrain';auxiliaryGroup.userData.runtimeAuxiliary=true;scene.add(auxiliaryGroup);
 const s={
  brick:material(m.brick,'old-firebrick','#a88b75'),stone:material(m.stone,'quay-stone','#aaa18b'),
  paving:material(m.paving,'harbour-cobbles','#b2afa0'),cap:material(m.stonePale,'dressed-coping','#bdb5a3'),
  steel:material(m.metal,'riveted-blue-steel','#334b50',.48),iron:material(m.metal,'blackened-iron','#272e2c',.58),
  zinc:material(m.zinc,'corrugated-zinc','#929b96',.63),wood:material(m.wood,'yard-timber','#8f826a',.82),
  oak:material(m.oak,'oiled-oak','#aa9373',.74),paint:material(m.greenWood,'faded-boat-paint','#485f5b',.77),
  plaster:material(m.plaster,'waiting-room-plaster','#ddd7c5'),fabric:material(m.fabric,'seat-fabric','#66716d'),
  glass:material(m.glass,'clear-station-glass'),lamp:material(m.lamp,'warm-opal-lamp'),
  dark:material(m.interior,'interior-shadow','#514b3e'),yellow:material(m.paper,'old-platform-paint','#c0ad73'),
  platform:material(m.paving,'platform-paving','#b2afa0'),slip:material(m.stone,'slipway-stone','#aaa18b'),
  brass:material(m.metal,'ticket-machine-brass','#a8996b',.4),paper:material(m.paper,'ticket-stock','#ded5b9',.95)
 };
 const auxiliaryMaterials={};for(const [key,source]of Object.entries({paving:s.paving,stone:s.stone,cap:s.cap,brick:s.brick,steel:s.steel,zinc:s.zinc,wood:s.wood,oak:s.oak,dark:s.dark})){const copy=material(source,key);copy.name='StationAux/'+key;copy.userData={...copy.userData,runtimeAuxiliary:true};auxiliaryMaterials[key]=copy;}
 s.lamp.emissiveIntensity=1.4;
 const practical=[];
 buildGround(group,s,auxiliaryGroup,auxiliaryMaterials);
 buildSlipway(group,s);
 buildRepairHull(group,s);
 buildGantry(group,s);
 buildWaitingHall(group,s,practical);
 buildCanopy(group,s,practical);
 buildWarehouse(group,s,practical);
 buildYardProps(group,s);
 buildIndustrialContext(auxiliaryGroup,auxiliaryMaterials,{box,rod,cylinder,curveTube,iBeamX,iBeamZ,iColumn,mesh,roofSheet});
 group.updateMatrixWorld(true);auxiliaryGroup.updateMatrixWorld(true);mergeStatic(group);mergeStatic(auxiliaryGroup);auxiliaryGroup.traverse(o=>{o.userData.runtimeAuxiliary=true;});
 const stats={objects:0,triangles:0,vertices:0,materialNames:new Set()};group.traverse(o=>{if(!o.isMesh)return;stats.objects++;stats.vertices+=o.geometry.attributes.position.count;stats.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;stats.materialNames.add(o.material.name);});
 return {group,auxiliaryGroup,auxiliaryMaterialNames:Object.values(auxiliaryMaterials).map(m=>m.name),practical,materials:s,shots:stationSpace.shots,navigation:stationSpace.navigation,space:stationSpace,
  staticIdentity:'north-dock-station-independent-v1',stats:{...stats,materialNames:[...stats.materialNames]},
  reserved:{signalBoard:{position:[22.8,2.4,14.8],normal:[-1,0,0]},gangway:stationSpace.dock}};
}

function buildGround(g,m,aux,a){
 // The slipway is an actual opening in the western apron, not a ramp laid
 // on top of solid paving. The continuous outer land prevents floating edges.
 box(g,25,4.6,105,32.5,-1.675,-12.5,m.paving,.025,'Authored station-side apron');
 box(g,2,4.6,16,-44,-1.675,0,m.paving,.025);
 box(g,25,4.6,57,-32.5,-1.675,-36.5,m.paving,.025);box(g,25,4.6,32,-32.5,-1.675,24,m.paving,.025);
 // Auxiliary support is a separately named source occluder, never given a
 // share of the hero lightmap atlas or presented as baked near geometry.
 for(const side of [-1,1]){
  box(aux,95,4.6,500,side*92.5,-1.675,0,a.paving,.025);
  box(aux,25,4.6,185,side*32.5,-1.675,-157.5,a.paving,.025);
  box(aux,25,4.6,210,side*32.5,-1.675,145,a.paving,.025);
 }
 box(g,40,.7,105,0,-3.35,-12.5,m.stone,.015,'Authored harbour bed beneath the live water');
 box(aux,40,.7,185,0,-3.35,-157.5,a.stone,.015);box(aux,40,.7,210,0,-3.35,145,a.stone,.015);
 for(const side of [-1,1]){
  if(side===1)box(g,.7,3.4,105,20.05,-1.1,-12.5,m.stone,.025);
  else{box(g,.7,3.4,57,-20.05,-1.1,-36.5,m.stone,.025);box(g,.7,3.4,32,-20.05,-1.1,24,m.stone,.025);}
  box(aux,.7,3.4,185,side*20.05,-1.1,-157.5,a.stone,.025);box(aux,.7,3.4,210,side*20.05,-1.1,145,a.stone,.025);
  for(let z=-75;z<=65;z+=1.1){if(side===-1&&z>-8.6&&z<8.6)continue;if(side===1&&z>8.0&&z<10.2)continue;const hero=z>=-65&&z<=40;box(hero?g:aux,.85,.25,1.055,side*20.0,.67,z,hero?m.cap:a.cap,.035);}
 }
 // Low service walls and tree-free warehouse silhouettes give the industrial
 // site a finite, intentional boundary instead of an empty plane horizon.
 box(g,.45,2.1,105,39.5,1.68,-15,m.brick,.02);box(g,44,2.1,.45,-42,1.68,30,m.brick,.02);
 for(let z=-65;z<38;z+=6){box(g,.68,2.32,.66,39.5,1.75,z,m.cap,.015);box(g,.8,.14,.8,39.5,2.94,z,m.cap,.02);}
 for(let x=-61;x<-20;x+=5){box(g,.65,2.35,.7,x,1.76,30,m.brick,.018);box(g,.8,.13,.83,x,3,30,m.cap,.02);}
 // Platform paving and drain establish the exact passenger boarding edge.
 box(g,4.5,.13,37,22.25,.655,4,m.platform,.015);
 for(let z=-13;z<22;z+=1.3)box(g,.18,.012,.77,20.68,.728,z,m.yellow,.001);
 for(let z=-12;z<23;z+=4){box(g,.24,.022,.62,24.0,.73,z,m.iron,.002);for(let n=0;n<6;n++)box(g,.18,.025,.024,24,.75,z-.25+n*.1,m.zinc,.001);}
 // Wet, submerged blockwork stays below the surface, including the slipway.
 for(const side of [-1,1])for(let z=-47;z<38;z+=2.5){if(side===-1&&Math.abs(z)<9)continue;box(g,.13,.32,2.38,side*19.67,-.16,z,m.stone,.015);}
}

function buildSlipway(g,m){
 const geometry=new THREE.PlaneGeometry(24,16,16,10),p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i);p.setXYZ(i,x,.65-(x+12)/24*1.45,z);geometry.attributes.uv.setXY(i,x-31,z);}geometry.computeVertexNormals();
 reverseFaces(geometry);mesh(g,geometry,m.slip,-31,0,0,'Actual sloping slipway into basin');
 // A filled masonry wedge closes the exposed sides below the sloping top.
 const fill=new THREE.Shape();fill.moveTo(-12,-3);fill.lineTo(12,-3);fill.lineTo(12,-.815);fill.lineTo(-12,.635);fill.closePath();
 mesh(g,new THREE.ExtrudeGeometry(fill,{depth:16,bevelEnabled:false}),m.stone,-31,0,-8,'Solid slipway foundation');
 for(const side of [-1,1]){
  const curb=box(g,24.045,.3,.45,-31,.05,side*7.8,m.cap,.025);curb.rotation.z=-Math.atan(1.45/24);
  // Track on a real timber sleeper bed; rail gradients follow the concrete.
  const a=[-43,.72,side*2.1],b=[-19,-.73,side*2.1];rod(g,a,b,.055,m.iron,12);
  for(let x=-42.5;x<-20;x+=.9){const y=.65-(x+43)/24*1.45;box(g,.26,.14,5.6,x,y+.045,0,m.wood,.015);}
 }
 // Haul carriage, chocks and wheels bear the repair hull above the slope.
 for(const x of [-32.9,-25.3]){
  const ramp=.65-(x+43)/24*1.45;
  for(const z of [-2.1,2.1]){const wheel=cylinder(g,.31,.31,.13,x,ramp+.39,z,m.iron,24);wheel.rotation.x=Math.PI/2;}
  box(g,.23,.24,4.8,x,ramp+.64,0,m.steel,.015);
  for(const side of [-1,1])rod(g,[x,ramp+.73,side*2.05],[x,1.78,side*1.32],.09,m.wood,12);
 }
 for(const z of [-1.65,1.65])box(g,10.4,.28,.23,-29.1,.78,z,m.steel,.018);
 box(g,6.1,.22,.62,-29.1,.94,0,m.wood,.018);
}

function buildRepairHull(g,m){
 const centre=-29.1,stations=[[-6.2,.08],[-5.2,1.02],[-3.4,1.83],[-1.0,2.24],[1.8,2.1],[4.1,1.48],[5.8,.12]],bands=9;
 const section=(t,width)=>({z:Math.sin(t*Math.PI*.5)*width,y:1.08+Math.pow(t,.8)*2.18});
 for(const side of [-1,1])for(let band=0;band<bands;band++){
  const positions=[],uv=[],indices=[],t0=band/bands,t1=(band+1)/bands;
  for(const [x,w]of stations)for(const t of [t0,t1]){const p=section(t,w);positions.push(x+centre,p.y,side*p.z);uv.push(x,band*.22+(t===t1?.225:0));}
  for(let i=0;i<stations.length-1;i++){const n=i*2;if(side===1)indices.push(n,n+2,n+1,n+1,n+2,n+3);else indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.setIndex(indices);geom.computeVertexNormals();
  const mat=band<3?m.iron:band<6?m.paint:m.oak;mesh(g,geom,mat,0,0,0,'Clinker planking of hauled repair hull');
  const interior=geom.clone(),p=interior.attributes.position;for(let i=0;i<p.count;i++){p.setZ(i,p.getZ(i)*.97);p.setY(i,p.getY(i)+.035);}reverseFaces(interior);mesh(g,interior,m.oak,0,0,0,'Visible inside face of repair hull planks');
 }
 for(const side of [-1,1])curveTube(g,stations.map(([x,w])=>[x+centre,3.29,side*w]),.075,m.oak,70,10);
 box(g,11.8,.16,.13,centre,1.05,0,m.oak,.025,'Keel resting on the haul carriage');
 // Closely spaced open ribs make the empty working interior readable.
 for(let i=1;i<stations.length-1;i++){
  const [x,w]=stations[i],points=[];for(let k=-8;k<=8;k++){const t=Math.abs(k)/8,p=section(t,w*.94);points.push([x+centre,p.y+.06,Math.sign(k)*p.z]);}curveTube(g,points,.055,m.oak,40,8);
 }
 for(const x of [-32.4,-28.9,-25.4])box(g,.18,.11,3.9,x,2.63,0,m.wood,.012);
 // A few repair clamps and one removed plank belong to this boatyard,
 // rather than adding decorative clutter unrelated to the structure.
 for(const x of [-33,-30,-26])for(const side of [-1,1]){box(g,.13,.23,.08,x,3.29,side*1.72,m.iron,.008);bolt(g,x,3.44,side*1.72,m.zinc,'y',.035);}
 const plank=box(g,5.6,.055,.24,-27.1,1.01,5.6,m.wood,.01);plank.rotation.y=.18;
}

function buildGantry(g,m){
 for(const z of [-5.1,5.1]){
  rod(g,[-40,.76,z],[-20,.76,z],.055,m.iron,12);
  for(const x of [-26.55,-25.05]){const wheel=cylinder(g,.22,.22,.16,x,.98,z,m.iron,20);wheel.rotation.x=Math.PI/2;}
  box(g,2.5,.23,.44,-25.8,1.23,z,m.steel,.018);
  // Flared portal legs have a physical bearing at the running bogies.
  rod(g,[-26.55,1.35,z],[-26.2,7.7,z*.87],.12,m.steel,10);
  rod(g,[-25.05,1.35,z],[-25.4,7.7,z*.87],.12,m.steel,10);
  for(let y=2;y<7.5;y+=1.05){rod(g,[-26.55+(y-1.35)*.055,y,z],[-25.05-(y-1.35)*.055,y,z],.042,m.steel,8);}
  box(g,.9,.26,.9,-25.8,7.72,z*.87,m.steel,.02);
 }
 iBeamZ(g,11.3,.66,.44,-25.8,8.12,0,m.steel);
 for(const z of [-4.4,-2.2,0,2.2,4.4]){box(g,.52,.66,.045,-25.8,8.12,z,m.steel,.005);for(const dx of [-.18,.18])for(const yy of [7.93,8.31])bolt(g,-25.8+dx,yy,z+.032,m.zinc,'z',.035);}
 // Hoist trolley, cable drum and an open forged hook with a visible throat.
 box(g,1.0,.38,.85,-25.8,7.63,-.35,m.iron,.04);const drum=cylinder(g,.23,.23,.7,-25.8,7.35,-.35,m.steel,28);drum.rotation.z=Math.PI/2;
 for(const x of [-25.95,-25.65])rod(g,[x,7.3,-.35],[x,4.65,-.35],.018,m.iron,8);
 cylinder(g,.12,.12,.3,-25.8,4.55,-.35,m.steel,16);
 curveTube(g,[[-25.8,4.45,-.35],[-25.8,4.15,-.35],[-25.8,3.94,-.12],[-25.8,4.03,.13],[-25.8,4.24,.15]],.055,m.iron,32,10);
 // Access ladder is attached to one leg, with a small landing at the beam.
 for(const x of [-26.08,-25.52])rod(g,[x,1.35,5.52],[x,7.6,5.52],.025,m.steel,8);
 for(let y=1.55;y<7.5;y+=.31)rod(g,[-26.08,y,5.52],[-25.52,y,5.52],.022,m.steel,8);
 box(g,1.7,.09,1.1,-25.8,7.66,5.1,m.iron,.008);
}

function buildWaitingHall(g,m,lights){
 const hall=new THREE.Group();hall.name='Barrel-roof canal passenger waiting hall';g.add(hall);
 box(hall,8.95,.22,14.6,28.48,.71,6,m.cap,.025);
 box(hall,8.6,.05,14,28.6,.836,6,m.dark,.003);
 // Oiled oak boards have their own measured grain; chipped exterior paint
 // belongs to the yard and is not used across this occupied room's floor.
 for(let row=0;row<38;row++){
  const x=24.3+(row+.5)*8.6/38,offset=(row%3)*1.13;
  const cuts=[-1,...[2.4,5.8,9.2,12.6].map(z=>z+offset).filter(z=>z<13),13];
  for(let n=0;n<cuts.length-1;n++)box(hall,8.6/38-.005,.047,cuts[n+1]-cuts[n]-.006,x,.86,(cuts[n]+cuts[n+1])/2,m.oak,.002);
 }
 const wall=new THREE.Group();wall.position.set(24.5,.82,6);wall.rotation.y=-Math.PI/2;hall.add(wall);
 const openings=[{x:-5.3,y:.04,w:1.36,h:2.7},{x:-2.45,y:.65,w:2.55,h:2.3},{x:1.25,y:.65,w:3.0,h:2.3},{x:5.0,y:.65,w:2.7,h:2.3}];
 mesh(wall,openingWall(14,3.65,openings,.34),m.brick,0,0,0,'Station frontage with real openings');
 for(const o of openings){
  for(const side of [-1,1])box(wall,.075,o.h+.05,.13,o.x+side*(o.w/2-.03),o.y+o.h/2,.34,m.steel,.008);
  box(wall,o.w,.08,.13,o.x,o.y,.34,m.steel,.008);box(wall,o.w,.08,.13,o.x,o.y+o.h,.34,m.steel,.008);
  if(o.x>-4){box(wall,o.w+.2,.13,.5,o.x,o.y-.08,.17,m.cap,.018);box(wall,.045,o.h,.09,o.x,o.y+o.h/2,.34,m.steel,.005);box(wall,o.w,.045,.09,o.x,o.y+o.h*.61,.34,m.steel,.005);}
  if(o.x>-4){const glass=mesh(wall,new THREE.PlaneGeometry(o.w-.12,o.h-.12),m.glass,o.x,o.y+o.h/2,.26);glass.castShadow=false;}
  else{
   const leaf=new THREE.Group();leaf.position.set(o.x-o.w/2,o.y,.28);leaf.rotation.y=-1.08;wall.add(leaf);
   for(const xx of [.035,o.w-.035])box(leaf,.07,o.h,.12,xx,o.h/2,0,m.steel,.008);
   for(const yy of [.04,o.h-.04])box(leaf,o.w,.08,.12,o.w/2,yy,0,m.steel,.008);
   const pane=mesh(leaf,new THREE.PlaneGeometry(o.w-.15,o.h-.17),m.glass,o.w/2,o.h/2,.005);pane.castShadow=false;
   rod(leaf,[o.w-.16,1.0,-.075],[o.w-.16,1.43,-.075],.018,m.zinc,10);
  }
 }
 // Three opaque walls and actual ceiling make room transmission meaningful.
 box(hall,.35,3.7,14.4,33,2.63,6,m.brick,.02);
 box(hall,8.7,3.7,.35,28.7,2.63,-1.15,m.brick,.02);box(hall,8.7,3.7,.35,28.7,2.63,13.15,m.brick,.02);
 box(hall,.045,3.4,13.8,32.79,2.57,6,m.plaster,.002);
 for(const z of [-.94,12.94])box(hall,8.2,3.4,.045,28.6,2.57,z,m.plaster,.002);
 // Barrel roof and a glazed end fanlight are distinct from the old city roofs.
 const half=4.65,cx=28.55,roofGeometry=new THREE.PlaneGeometry(half*2,15,40,12),p=roofGeometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i),height=4.43+1.5*Math.sqrt(Math.max(0,1-(x/half)**2));p.setXYZ(i,cx+x,height+.016*Math.cos(x*20),6+z);roofGeometry.attributes.uv.setXY(i,x,z);}roofGeometry.computeVertexNormals();
 roofSheet(hall,roofGeometry,m.zinc,m.steel,'Curved corrugated station roof');
 for(const z of [-1.5,2.3,6,9.7,13.5]){const points=[];for(let n=0;n<=24;n++){const x=-half+n/24*half*2;points.push([cx+x,4.43+1.5*Math.sqrt(Math.max(0,1-(x/half)**2))-.04,z]);}curveTube(hall,points,.065,m.steel,48,8);}
 const endShape=new THREE.Shape();endShape.moveTo(-half,0);for(let i=0;i<=24;i++){const x=-half+i/24*half*2;endShape.lineTo(x,1.5*Math.sqrt(Math.max(0,1-(x/half)**2)));}endShape.lineTo(half,0);endShape.closePath();
 for(const z of [-1.34,13.34]){const end=mesh(hall,new THREE.ShapeGeometry(endShape),m.glass,cx,4.43,z);if(z<0)end.rotation.y=Math.PI;end.castShadow=false;for(const dx of [-2.8,-1.4,0,1.4,2.8])rod(hall,[cx+dx,4.45,z],[cx+dx,4.43+1.5*Math.sqrt(1-(dx/half)**2),z],.026,m.steel,8);}
 // A working two-position ticket office, with panelled oak counter and a
 // shallow secure office behind a steel grille. The apertures are real.
 box(hall,.72,1.03,4.9,30.65,1.4,5.9,m.oak,.018);box(hall,.95,.1,5.2,30.55,1.96,5.9,m.oak,.018);
 for(const z of [3.68,5.15,6.65,8.12])box(hall,.055,.88,.065,30.26,1.42,z,m.oak,.007);
 for(const y of [.96,1.84])box(hall,.065,.08,4.87,30.245,y,5.9,m.oak,.007);
 for(const z of [4.4,7.4])box(hall,.018,.62,1.27,30.25,1.41,z,m.oak,.002);
 ticketMachine(hall,m,30.47,2.025,4.35);ticketMachine(hall,m,30.47,2.025,7.42);
 for(const z of [3.35,8.05]){
  for(let i=0;i<6;i++){const ticket=box(hall,.26,.003,.38,30.34+i*.004,2.021+i*.003,z+i*.004,m.paper,0);ticket.rotation.y=-.1;}
  box(hall,.055,.028,.34,30.58,2.04,z-.3,m.brass,.004);
 }
 // An open ledger, perforation ruler and ink stamp belong to the worktop.
 for(const side of [-1,1]){const page=box(hall,.34,.012,.43,30.34+side*.16,2.027,5.72,m.paper,.001);page.rotation.z=side*.065;}
 box(hall,.055,.03,.45,30.17,2.045,6.25,m.brass,.003);
 cylinder(hall,.045,.045,.13,30.49,2.12,6.15,m.oak,12);box(hall,.11,.03,.12,30.49,2.038,6.15,m.iron,.006);
 for(const z of [3.27,5.9,8.54])rod(hall,[30.85,2.02,z],[30.85,3.38,z],.031,m.steel,10);
 for(const y of [2.69,3.35])rod(hall,[30.85,y,3.26],[30.85,y,8.54],.024,m.steel,10);
 for(let z=3.42;z<8.53;z+=.19){const opening=Math.abs(z-4.35)<.56||Math.abs(z-7.42)<.56;rod(hall,[30.85,opening?2.7:2.04,z],[30.85,3.35,z],.011,m.steel,8);}
 box(hall,.2,2.15,4.0,32.62,2.12,6.1,m.oak,.012);
 for(let y=1.15;y<3.2;y+=.4)box(hall,.6,.055,4,32.3,y,6.1,m.oak,.006);
 for(let z=4.25;z<8;z+=.5)box(hall,.6,2.05,.045,32.3,2.13,z,m.oak,.004);
 // Sorted stock and a staff chair give the grille a genuinely occupied rear.
 for(const [z,y]of [[4.45,1.18],[5.46,1.58],[6.45,1.98],[7.45,2.38]])box(hall,.34,.14,.28,32.18,y+.11,z,m.paper,.005);
 box(hall,.48,.075,.5,31.65,1.4,5.75,m.oak,.009);for(const dx of [-.19,.19])for(const dz of [-.19,.19])rod(hall,[31.65+dx,.9,5.75+dz],[31.65+dx,1.37,5.75+dz],.023,m.steel,8);
 for(const yy of [1.67,1.9])box(hall,.04,.13,.5,31.9,yy,5.75,m.oak,.006);
 // The service-room wainscot and a framed departure sheet break up the
 // plaster at human height while preserving generous walls and floor.
 for(const z of [-.9,12.9]){box(hall,8.1,.78,.045,28.6,1.25,z,m.oak,.003);box(hall,8.16,.065,.065,28.6,1.67,z,m.oak,.006);}
 box(hall,.045,.78,13.6,32.75,1.25,6,m.oak,.003);box(hall,.065,.065,13.6,32.74,1.67,6,m.oak,.006);
 const departures=departureMaterial();
 framedWallPanel(hall,m,departures,27.9,2.85,-.887,1.8,1.92,0);
 const routes=routeMaterial();framedWallPanel(hall,m,routes,32.713,2.8,10.4,1.55,1.75,-Math.PI/2);
 // Small task lamp, with its actual emitting shade and local bulb source.
 cylinder(hall,.125,.15,.045,30.5,2.055,6.75,m.steel,24);
 curveTube(hall,[[30.5,2.08,6.75],[30.63,2.42,6.75],[30.46,2.57,6.75],[30.29,2.48,6.75]],.017,m.brass,24,8);
 cylinder(hall,.13,.055,.13,30.29,2.45,6.75,m.steel,24);cylinder(hall,.105,.105,.008,30.29,2.383,6.75,m.lamp,24);
 const deskLight=new THREE.PointLight('#ffd6a0',1.8,2.5,2);deskLight.name='Ticket desk shaded task lamp';deskLight.position.set(30.29,2.365,6.75);hall.add(deskLight);lights.push(deskLight);
 bench(hall,m,26.1,10.2);bench(hall,m,26.1,1.6);
 for(const z of [2.4,9.7]){
  const lamp=cylinder(hall,.23,.23,.06,28.6,4.02,z,m.lamp,28);box(hall,.68,.1,.43,28.6,4.11,z,m.steel,.03);
  rod(hall,[28.6,4.15,z],[28.6,5.6,z],.014,m.iron,8);
  const light=new THREE.PointLight('#ffd5a0',12,11,2);light.name='Station warm ceiling lamp '+z;light.position.set(28.6,3.91,z);hall.add(light);lights.push(light);
 }
 const sign=labelMaterial('北 坞 驿 站   /   NORTH DOCK','station-name');const panel=mesh(hall,new THREE.PlaneGeometry(5.6,.9),sign,24.12,4.02,6);panel.rotation.y=-Math.PI/2;
 const ticket=labelMaterial('T I C K E T S   /   船 票','ticket-sign');const plate=mesh(hall,new THREE.PlaneGeometry(2.2,.42),ticket,30.12,3.08,6);plate.rotation.y=-Math.PI/2;
}

function bench(g,m,x,z){
 for(const dx of [-.24,-.08,.08,.24])box(g,.13,.055,2.75,x+dx,1.12,z,m.oak,.01);
 for(const zz of [-1.03,1.03]){box(g,.5,.08,.14,x,.8,z+zz,m.steel,.012);for(const dx of [-.19,.19])box(g,.055,.45,.07,x+dx,.89,z+zz,m.steel,.006);box(g,.065,.96,.08,x+.27,1.28,z+zz,m.steel,.006);}
 for(const y of [1.41,1.58,1.75])box(g,.055,.13,2.75,x+.3,y,z,m.wood,.01);
}

function ticketMachine(g,m,x,y,z){
 const machine=new THREE.Group();machine.position.set(x,y,z);machine.name='Hand-cranked mechanical ticket printer';g.add(machine);
 box(machine,.43,.055,.46,0,.028,0,m.iron,.018);
 box(machine,.22,.3,.34,.1,.19,0,m.steel,.035);
 const drum=cylinder(machine,.135,.135,.36,-.025,.22,0,m.steel,28);drum.rotation.x=Math.PI/2;
 for(const zz of [-.19,.19]){const wheel=cylinder(machine,.108,.108,.025,-.025,.22,zz,m.brass,24);wheel.rotation.x=Math.PI/2;bolt(machine,-.025,.22,zz+Math.sign(zz)*.017,m.iron,'z',.024);}
 // A toothed indexing wheel, crank and wooden grip identify the apparatus.
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const tooth=box(machine,.032,.045,.031,-.025+Math.sin(a)*.115,.22+Math.cos(a)*.115,.215,m.brass,.003);tooth.rotation.z=-a;}
 rod(machine,[-.025,.22,.22],[-.025,.22,.29],.014,m.iron,8);
 rod(machine,[-.025,.22,.29],[-.025,.37,.29],.014,m.brass,8);
 rod(machine,[-.025,.37,.28],[-.025,.37,.4],.026,m.oak,12);
 box(machine,.018,.055,.28,-.174,.145,0,m.iron,.005);
 const printed=box(machine,.19,.004,.21,-.23,.092,0,m.paper,0);printed.rotation.z=.32;
 for(const zz of [-.11,.11])bolt(machine,.125,.342,zz,m.brass,'y',.016);
 // Small blank counter dial and an embossed registration strip.
 box(machine,.015,.065,.14,-.014,.319,0,m.brass,.003);
 for(const zz of [-.045,0,.045])box(machine,.009,.035,.023,-.024,.321,zz,m.dark,.001);
}

function drawnMaterial(name,width,height,draw){
 const m=new THREE.MeshStandardMaterial({color:'#e1d7ba',roughness:.9});m.name='Station/'+name;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;draw(canvas.getContext('2d'),width,height);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.map=t;m.color.set(0xffffff);
 }
 return m;
}
function departureMaterial(){return drawnMaterial('framed-departure-table',768,1024,(c,w,h)=>{
 c.fillStyle='#d6ceb7';c.fillRect(0,0,w,h);c.strokeStyle='#586763';c.lineWidth=3;c.strokeRect(31,31,w-62,h-62);
 c.fillStyle='#344b4a';c.textAlign='center';c.font='500 50px Georgia,serif';c.fillText('DEPARTURES',w/2,111);c.font='30px "Microsoft YaHei",serif';c.fillText('北坞 · 运河客运',w/2,164);
 c.font='20px Georgia,serif';c.fillText('NORTH DOCK   —   CANAL SERVICE',w/2,212);
 c.textAlign='left';c.font='22px Georgia,serif';c.fillText('TIME',64,288);c.fillText('DESTINATION',220,288);c.fillText('PIER',619,288);
 const rows=[['06:40','OLD LOCK','2'],['08:10','NORTH BANK','1'],['09:15','SHIPYARD','1'],['11:30','CANAL JUNCTION','2'],['14:05','SOUTH WHARF','1'],['16:20','OLD LOCK','2'],['18:45','NORTH BANK','1']];
 rows.forEach(([a,b,d],i)=>{const y=355+i*68;c.strokeStyle='#a29e88';c.lineWidth=1;c.beginPath();c.moveTo(58,y+21);c.lineTo(w-58,y+21);c.stroke();c.fillStyle='#3c4a43';c.font='29px Georgia,serif';c.fillText(a,64,y);c.font='24px Georgia,serif';c.fillText(b,220,y);c.fillText(d,642,y);});
 c.textAlign='center';c.font='italic 22px Georgia,serif';c.fillText('Ring the quay signal before boarding.',w/2,919);c.font='18px Georgia,serif';c.fillText('Tickets issued at this office',w/2,957);
 });}
function routeMaterial(){return drawnMaterial('framed-canal-route',640,768,(c,w,h)=>{
 c.fillStyle='#d3cfb8';c.fillRect(0,0,w,h);c.fillStyle='#3d5653';c.textAlign='center';c.font='36px Georgia,serif';c.fillText('THE WORKING CANAL',w/2,76);c.font='22px Georgia,serif';c.fillText('North Dock navigation sketch',w/2,117);
 c.lineWidth=39;c.strokeStyle='#92a69b';c.beginPath();c.moveTo(180,674);c.bezierCurveTo(110,540,360,550,275,400);c.bezierCurveTo(210,285,390,270,366,172);c.stroke();
 c.lineWidth=3;c.strokeStyle='#e8e1c8';c.beginPath();c.moveTo(180,674);c.bezierCurveTo(110,540,360,550,275,400);c.bezierCurveTo(210,285,390,270,366,172);c.stroke();
 const points=[[183,616,'SOUTH WHARF',263,621],[276,444,'NORTH DOCK',333,450],[297,315,'SHIPYARD',65,306],[365,206,'OLD LOCK',72,207]];
 for(const[x,y,text,tx,ty]of points){c.fillStyle='#e5dac0';c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.fill();c.strokeStyle='#3d5653';c.lineWidth=3;c.stroke();c.fillStyle='#364e49';c.font='21px Georgia,serif';c.textAlign='left';c.fillText(text,tx,ty);}
 c.textAlign='center';c.font='italic 18px Georgia,serif';c.fillText('Cargo and passenger waterway',w/2,716);
 });}
function framedWallPanel(g,m,printed,x,y,z,w,h,rotation){
 const p=new THREE.Group();p.position.set(x,y,z);p.rotation.y=rotation;g.add(p);box(p,w+.14,h+.14,.065,0,0,-.016,m.oak,.008);
 mesh(p,new THREE.PlaneGeometry(w,h),printed,0,0,.021);
 for(const side of [-1,1]){box(p,.035,h+.09,.033,side*(w+.045)/2,0,.025,m.brass,.004);box(p,w+.09,.035,.033,0,side*(h+.045)/2,.025,m.brass,.004);}
}

function buildCanopy(g,m,lights){
 for(const z of [-8,0,8,16,22]){
  iColumn(g,3.52,23.65,2.48,z,m.steel,.23);iBeamX(g,5.7,.3,.16,22.55,4.31,z,m.steel);
  rod(g,[23.65,3.2,z],[21.1,4.25,z],.045,m.steel,10);
  for(const dx of [-.19,.19])for(const yy of [3.8,4.05])bolt(g,23.65+dx,yy,z+.13,m.zinc,'z',.027);
 }
 for(const x of [20.05,22,24.4])iBeamZ(g,32,.18,.14,x,4.34,7,m.steel);
 const roof=new THREE.PlaneGeometry(5.9,33,24,20),p=roof.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i)+22.45,z=p.getY(i)+7,y=4.54+(x-22.45)*.045+.018*Math.sin(p.getY(i)*22);p.setXYZ(i,x,y,z);roof.attributes.uv.setXY(i,x,z);}roof.computeVertexNormals();roofSheet(g,roof,m.zinc,m.steel,'Platform cantilever roof');
 rod(g,[19.55,4.45,-9.5],[19.55,4.45,23.5],.07,m.zinc,12);
 for(const z of [-7,21]){rod(g,[19.62,4.45,z],[24.07,4.65,z],.035,m.zinc,10);rod(g,[24.07,4.65,z],[24.07,.9,z],.038,m.zinc,10);}
 bench(g,m,23.05,-4);bench(g,m,23.05,18.6);
 // The working signal/boarding board at [22.8,2.4,14.8] is reserved for the
 // root's real interaction system. This clock is a separate station landmark.
 const cx=21.5,cy=3.39,cz=12.5;
 rod(g,[23.65,4.13,cz],[cx,4.13,cz],.045,m.steel,10);rod(g,[cx,4.13,cz],[cx,3.85,cz],.018,m.iron,8);
 const rim=cylinder(g,.47,.47,.14,cx,cy,cz,m.steel,48);rim.rotation.x=Math.PI/2;
 const faceMaterial=labelMaterial('','clock-face','#d2ccaf','#786d51',512,512);const face=mesh(g,new THREE.CircleGeometry(.419,48),faceMaterial,cx,cy,cz+.075);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,mark=box(g,.022,i%3===0?.085:.05,.012,cx+Math.sin(a)*.35,cy+Math.cos(a)*.35,cz+.086,m.iron,.002);mark.rotation.z=-a;}
 const minute=box(g,.023,.31,.015,cx,cy+.133,cz+.1,m.iron,.003);minute.rotation.z=-.34;
 const hour=box(g,.034,.23,.017,cx-.09,cy+.02,cz+.118,m.iron,.003);hour.rotation.z=-1.43;bolt(g,cx,cy,cz+.13,m.steel,'z',.042);
 for(const z of [-6,7,20]){
  cylinder(g,.16,.2,.1,21.4,4.04,z,m.steel,20);cylinder(g,.14,.14,.028,21.4,3.97,z,m.lamp,20);
  const lamp=new THREE.PointLight('#ffdaa5',6,8,2);lamp.name='Platform pendant '+z;lamp.position.set(21.4,3.86,z);g.add(lamp);lights.push(lamp);
 }
 for(const z of [-12,-5,16,21])bollard(g,m,20.63,z);
 // Canal-side handrail deliberately leaves the two-metre boarding gap.
 for(const [a,b]of [[-14,7.5],[10.6,23]]){
  for(let z=a;z<b;z+=1.4)rod(g,[20.48,.75,z],[20.48,1.69,z],.025,m.iron,10);
  rod(g,[20.48,1.65,a],[20.48,1.65,b],.028,m.iron,10);rod(g,[20.48,1.12,a],[20.48,1.12,b],.018,m.iron,8);
 }
}

function buildWarehouse(g,m,lights){
 const x=-32,z=-27,w=18,d=12,h=6.3;
 box(g,w,.35,d,x,.75,z,m.cap,.03);
 const front=new THREE.Group();front.position.set(x,.9,z+d/2);g.add(front);
 mesh(front,openingWall(w,h,[{x:1.6,y:0,w:6.3,h:4.7},{x:-5.9,y:2.5,w:2.0,h:2.0}],.4),m.brick);
 for(const side of [-1,1])box(g,.4,h,d,x+side*w/2,h/2+.9,z,m.brick,.02);box(g,w,h,.4,x,h/2+.9,z-d/2,m.brick,.02);
 box(g,w,.16,d,x,h+.95,z,m.zinc,.015);
 // A shallow central ridge and roof ventilation caps change the skyline.
 const rr=box(g,w+.4,.15,d+.6,x,h+1.08,z,m.zinc,.015);rr.rotation.x=.055;
 for(const xx of [-6,0,6]){box(g,1.0,.6,1.2,x+xx,h+1.48,z,m.steel,.015);box(g,1.3,.12,1.5,x+xx,h+1.82,z,m.zinc,.02);}
 // Sliding door leaves show depth and their real hanging track.
 iBeamX(g,12,.22,.17,x+1.6,5.87,z+d/2+.15,m.steel);
 for(const side of [-1,1]){
  const door=box(g,3.2,4.65,.13,x+1.6+side*4.8,3.24,z+d/2+.17,m.wood,.012);
  for(const dx of [-1.35,1.35]){box(g,.1,4.6,.045,door.position.x+dx,3.24,door.position.z+.09,m.steel,.004);bolt(g,door.position.x+dx,5.39,door.position.z+.12,m.zinc,'z');}
  const brace=box(g,3.4,.09,.06,door.position.x,3.15,door.position.z+.1,m.steel,.006);brace.rotation.z=side*.72;
 }
 box(g,6.2,.12,5,x+1.6,.91,z+3.1,m.wood,.008);box(g,6.2,4.5,.1,x+1.6,3.15,z+.6,m.dark,.004);
 for(const xx of [-1.8,0,1.8])crate(g,m,x+xx,1.45,z+3.0,1.2);
 const lamp=new THREE.PointLight('#ffd39a',14,10,2);lamp.name='Warehouse working lamp';lamp.position.set(x+1.6,4.95,z+2.8);g.add(lamp);lights.push(lamp);
 const sign=labelMaterial('船 体 修 造   /   BOAT REPAIR','repair-yard-sign');mesh(g,new THREE.PlaneGeometry(7.2,.75),sign,x+1.6,6.13,z+d/2+.43);
 // Sparse service pipes and vertical downspouts make a working façade.
 for(const xx of [-8,8])rod(g,[x+xx,1.0,z+d/2+.5],[x+xx,6.7,z+d/2+.5],.046,m.zinc,10);
}

function bollard(g,m,x,z){cylinder(g,.13,.19,.43,x,.96,z,m.iron,16);cylinder(g,.19,.19,.08,x,1.2,z,m.steel,16);const r=new THREE.Mesh(new THREE.TorusGeometry(.13,.024,8,20),m.iron);r.position.set(x,1.05,z-.12);g.add(r);}
function crate(g,m,x,y,z,size=1){
 box(g,size*.93,size*.9,size*.92,x,y,z,m.wood,.018);
 for(const sx of [-1,1])for(const zz of [-1,1])box(g,.1,size,.1,x+sx*size*.46,y,z+zz*size*.46,m.oak,.01);
 for(const yy of [-.32,.32]){box(g,size+.05,.085,.055,x,y+yy*size,z+size*.49,m.steel,.004);box(g,.055,.085,size+.05,x+size*.49,y+yy*size,z,m.steel,.004);}
 const brace=box(g,size*1.18,.075,.045,x,y,z+size*.5,m.oak,.005);brace.rotation.z=.66;
}
function buildYardProps(g,m){
 for(const [x,z,size]of [[-23,11,1],[-25,12.2,.85],[-34,10.6,1.2],[-35.2,12.0,.95]])crate(g,m,x,.65+size*.5,z,size);
 // Winch, drum, ratchet and crank. The running rope points down the slipway.
 box(g,1.55,.22,1.45,-41.2,.8,0,m.cap,.025);
 for(const z of [-.54,.54])box(g,.65,.65,.12,-41.2,1.18,z,m.steel,.018);
 const drum=cylinder(g,.29,.29,1.08,-41.2,1.32,0,m.iron,32);drum.rotation.x=Math.PI/2;
 for(const z of [-.53,.53]){const flange=cylinder(g,.43,.43,.055,-41.2,1.32,z,m.steel,32);flange.rotation.x=Math.PI/2;}
 for(let i=0;i<11;i++){const coil=new THREE.Mesh(new THREE.TorusGeometry(.303,.017,6,28),m.oak);coil.rotation.y=Math.PI/2;coil.position.set(-41.2,1.32,-.45+i*.083);g.add(coil);}
 rod(g,[-41.2,1.32,.63],[-41.2,1.32,1.0],.035,m.iron,8);rod(g,[-41.2,1.32,1.0],[-41.2,1.73,1.0],.03,m.iron,8);rod(g,[-41.2,1.73,.99],[-41.2,1.73,1.21],.045,m.wood,10);
 rod(g,[-40.9,1.2,0],[-34.9,1.03,0],.023,m.oak,8);
 // Rope coiled on the quay, physically rounded rather than a decal.
 const points=[];for(let i=0;i<=180;i++){const a=i/180*Math.PI*8,r=.11+.008*i;points.push([-22.7+Math.cos(a)*r,.71+.015*Math.sin(a*.7),15.1+Math.sin(a)*r*.72]);}curveTube(g,points,.019,m.oak,180,6);
 for(const [x,z]of [[-20.65,12],[-20.65,-12]])bollard(g,m,x,z);
 for(const x of [-34,-32.8,-31.6]){const b=box(g,.22,.2,7.4,x,.85,15.5,m.wood,.014);b.rotation.y=-.05;}
 // Warehouse-side gantry travel stops and square forged anchor plates.
 for(const z of [-5.1,5.1])for(const x of [-40.2,-19.9]){box(g,.38,.46,.48,x,1,z,m.steel,.012);rod(g,[x-.25,.76,z],[x+.2,1.22,z],.035,m.iron,8);}
}

function mergeStatic(group){
 const materials=new Map(),removed=[];group.updateMatrixWorld(true);
 group.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.material.transparent||o.material.transmission>0)return;
  const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);geometry.deleteAttribute('tangent');
  if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
  if(!materials.has(o.material))materials.set(o.material,[]);materials.get(o.material).push(geometry);removed.push(o);
 });
 for(const o of removed){o.removeFromParent();o.geometry.dispose();}
 for(const [mat,parts]of materials){const combined=mergeGeometries(parts,false);if(!combined)throw new Error('Station geometry merge failed: '+mat.name);const geometry=mergeVertices(combined,1e-6);combined.dispose();const o=new THREE.Mesh(geometry,mat);o.name='Station static / '+mat.name;o.castShadow=o.receiveShadow=true;group.add(o);for(const p of parts)p.dispose();}
}
