import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const HOUSE_SPECS=[
  [1,-48.4,7.3,8.7,7.4,2.7,'steps',0],
  [1,-58.1,8.7,10.2,8.1,2.4,'hip',1],
  [1,-69.4,9.1,8.2,7.8,3.3,'asymmetric',2],
  [1,-82.6,11.1,10.5,8.9,2.8,'mansard',0],
  [1,-99.2,11.4,9.0,9.2,3.8,'gable',1],
  [-1,-59.0,8.2,9.8,7.6,3.1,'asymmetric',2],
  [-1,-69.9,8.6,8.4,8.4,2.7,'steps',0],
  [-1,-81.8,9.7,11.0,8.6,2.9,'hip',1],
  [-1,-94.5,8.8,8.6,7.9,3.2,'gable',2],
  [-1,-106.1,8.2,10.2,8.8,2.7,'mansard',0]
];

function centre(z){const t=THREE.MathUtils.clamp((-72-z)/40,0,1);return 5.4*t*t*(3-2*t);}
function tangent(z){return Math.atan2((centre(z+.1)-centre(z-.1))/.2,1);}
function addMesh(group,geometry,material,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;}
function box(group,w,h,d,x,y,z,material){return addMesh(group,new THREE.BoxGeometry(w,h,d),material,x,y,z);}

export function buildDistantTown(scene,m){
  const town=new THREE.Group();town.name='Distant canal town / continuation beyond the first bridge';
  const roof=m.roof||m.slate||m.slateScan;
  if(!m.brick||!m.stonePale||!roof)throw new Error('Distant town requires the canal masonry and slate materials');
  const glazing=new THREE.MeshStandardMaterial({color:0x283831,roughness:.24,metalness:.18});glazing.name='Canal/distantTownWindowGlazing';
  const recess=new THREE.MeshStandardMaterial({color:0x373b32,roughness:1});recess.name='Canal/distantTownRecess';
  const palette=[m.brickWarm||m.brick,m.brick,m.brickDark||m.brick];
  scene.add(town);
  for(let i=0;i<HOUSE_SPECS.length;i++){
    const [side,z,width,height,depth,rise,type,tone]=HOUSE_SPECS[i],house=new THREE.Group();
    house.name=`Distant town house ${String(i+1).padStart(2,'0')} / ${type}`;
    house.position.set(centre(z)+side*(10.45+(i%3)*.28),.72,z);
    house.rotation.y=side*Math.PI/2+tangent(z);town.add(house);
    buildHouse(house,{width,height,depth,rise,type,index:i},palette[tone],roof,m,glazing,recess);
  }
  // The existing water and bed end behind this second real arch. Its deck,
  // approach banks and the gentle turn conceal their finite rear boundary.
  buildRearBanks(town,m);
  buildRearBridge(town,m,-73.7);
  town.updateWorldMatrix(true,true);
  mergeOpaque(town);
  town.userData.distantTown={houses:HOUSE_SPECS.length,units:'metres',zRange:[-112,-43],canalWidth:8.3,bendStartsAtZ:-72};
  return town;
}

function buildHouse(group,p,brick,roof,m,glazing,recess){
  const {width:w,height:h,depth:d,index}=p,levels=h>9.3?3:2,columns=w>9?3:2,openings=[];
  const facade=new THREE.Shape();facade.moveTo(-w/2,0);facade.lineTo(w/2,0);facade.lineTo(w/2,h);facade.lineTo(-w/2,h);facade.closePath();
  for(let floor=0;floor<levels;floor++)for(let column=0;column<columns;column++){
    const ow=1.04+(index%3)*.10,oh=floor===0?2.12:1.85,x=(column-(columns-1)/2)*(w/(columns+.65));
    const y=.43+floor*(h-.7)/levels+(column===0&&index%3===1?.12:0),hole=new THREE.Path();
    hole.moveTo(x-ow/2,y);hole.lineTo(x-ow/2,y+oh);hole.lineTo(x+ow/2,y+oh);hole.lineTo(x+ow/2,y);hole.closePath();facade.holes.push(hole);
    openings.push({x,y,w:ow,h:oh});
  }
  addMesh(group,new THREE.ExtrudeGeometry(facade,{depth:.43,bevelEnabled:false}),brick);
  // Complete returns, rear wall and floors keep the row solid from oblique
  // views. A lower attached rear wing varies the occupied building volume.
  for(const side of [-1,1])box(group,.33,h,d,side*(w/2-.13),h/2,d/2,brick);
  box(group,w,h,.32,0,h/2,d-.12,brick);
  box(group,w,.22,d,0,.08,d/2,m.stonePale);
  box(group,w,.17,d,0,h-.08,d/2,m.plaster||brick);
  if(index%3===0){box(group,w*.48,h*.53,d*.37,w*.19,h*.265,d*1.08,brick);const lean=box(group,w*.56,.14,d*.45,w*.19,h*.53+.27,d*1.08,roof);lean.rotation.x=.15;}
  for(const y of [.17,h*.48,h-.24,h+.02])box(group,w+.14,.16,.68,0,y,.02,m.stonePale);
  for(const side of [-1,1])box(group,.19,h+.12,.57,side*(w/2-.1),h/2,.08,m.stonePale);
  for(const opening of openings)windowOpening(group,opening,m.greenWood,glazing,recess,m.stonePale);
  if(index%2===0){
    // A small recessed doorway gives the ground storey a different rhythm.
    box(group,.95,2.12,.13,w*.31,1.06,.44,m.greenWood);
    box(group,1.22,.15,.75,w*.31,.03,-.01,m.stonePale);
  }
  buildRoof(group,p,brick,roof,m.stonePale);
  const chimneyX=-w*.23+(index%3)*.29,chimneyZ=d*.72,chimneyY=h+p.rise*.74;
  box(group,.67,1.3,.83,chimneyX,chimneyY+.5,chimneyZ,brick);
  box(group,.83,.17,.98,chimneyX,chimneyY+1.18,chimneyZ,m.stonePale);
  for(const dx of [-.18,.18])addMesh(group,new THREE.CylinderGeometry(.11,.13,.31,8),brick,chimneyX+dx,chimneyY+1.41,chimneyZ);
}

function windowOpening(group,o,wood,glazing,recess,stone){
  const {x,y,w,h}=o;
  // Actual 0.7m recess, opaque room back, glazing slab and projecting frame.
  box(group,w+.04,h+.03,.07,x,y+h/2,.87,recess);
  for(const side of [-1,1])box(group,.06,h,.71,x+side*w/2,y+h/2,.53,recess);
  box(group,w,.06,.71,x,y+.02,.53,stone);box(group,w,.06,.71,x,y+h-.02,.53,recess);
  box(group,w-.12,h-.12,.018,x,y+h/2,.54,glazing);
  for(const side of [-1,1])box(group,.085,h+.02,.14,x+side*(w/2-.025),y+h/2,.39,wood);
  for(const yy of [y+.025,y+h-.025])box(group,w,.085,.15,x,yy,.38,wood);
  box(group,.05,h-.1,.12,x,y+h/2,.35,wood);box(group,w-.1,.05,.12,x,y+h*.55,.35,wood);
  box(group,w+.29,.14,.76,x,y-.05,.10,stone);
  box(group,w+.2,.13,.59,x,y+h+.04,.12,stone);
}

function triangles(group,faces,material){const values=[];for(const face of faces){for(let i=1;i<face.length-1;i++)for(const point of [face[0],face[i],face[i+1]])values.push(...point);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeVertexNormals();return addMesh(group,geometry,material);}
function hipRoof(group,w,d,y,rise,z,roof,inset=1.5){
  const a=[-w/2,y,z],b=[w/2,y,z],c=[w/2,y,z+d],e=[-w/2,y,z+d],r1=[0,y+rise,z+inset],r2=[0,y+rise,z+d-inset];
  triangles(group,[[a,r1,b],[b,r1,r2,c],[c,r2,e],[e,r2,r1,a]],roof);
}
function buildRoof(group,p,brick,roof,stone){
  const {width:w,height:h,depth:d,rise,type}=p;
  if(type==='hip')hipRoof(group,w+.56,d+.65,h+.13,rise,-.32,roof,1.55);
  else if(type==='mansard'){
    const x=w/2+.28,z0=-.3,z1=d+.3,inset=.66,upperY=h+rise*.7;
    const a=[-x,h+.12,z0],b=[x,h+.12,z0],c=[x,h+.12,z1],e=[-x,h+.12,z1];
    const aa=[-x+inset,upperY,z0+inset],bb=[x-inset,upperY,z0+inset],cc=[x-inset,upperY,z1-inset],ee=[-x+inset,upperY,z1-inset];
    triangles(group,[[a,aa,bb,b],[b,bb,cc,c],[c,cc,ee,e],[e,ee,aa,a]],roof);
    hipRoof(group,w+.56-2*inset,d+.6-2*inset,upperY,rise*.3,z0+inset,roof,1.4);
    box(group,w+.7,.14,d+.76,0,h+.02,d/2,stone);
  }else{
    const ridge=type==='asymmetric'?w*.13:0,half=w/2+.28,z0=-.3,z1=d+.35;
    triangles(group,[[[-half,h+.12,z0],[-half,h+.12,z1],[ridge,h+rise,z1],[ridge,h+rise,z0]],[[ridge,h+rise,z0],[ridge,h+rise,z1],[half,h+.12,z1],[half,h+.12,z0]]],roof);
    const gable=new THREE.Shape();gable.moveTo(-w/2,h);
    if(type==='steps'){
      const count=5,step=w/(count*2);
      for(let i=0;i<count;i++){gable.lineTo(-w/2+i*step,h+(i+1)*rise/count);gable.lineTo(-w/2+(i+1)*step,h+(i+1)*rise/count);}
      for(let i=count-1;i>=0;i--){gable.lineTo((count-i)*step,h+(i+1)*rise/count);gable.lineTo((count-i)*step,h+i*rise/count);}
      for(const side of [-1,1])for(let i=0;i<count;i++)box(group,step+.11,.14,.67,side*(w/2-(i+.5)*step),h+(i+1)*rise/count+.05,-.06,stone);
    }else{gable.lineTo(ridge,h+rise);gable.lineTo(w/2,h);}
    gable.closePath();addMesh(group,new THREE.ExtrudeGeometry(gable,{depth:.36,bevelEnabled:false}),brick,0,0,-.055);
    const ridgeCap=addMesh(group,new THREE.CylinderGeometry(.105,.105,d+.72,8),roof,ridge,h+rise+.06,d/2);ridgeCap.rotation.x=Math.PI/2;
  }
}

function buildRearBanks(group,m){
  for(let z=-77;z>-113;z-=3.8){const yaw=tangent(z),bend=centre(z);
    for(const side of [-1,1]){
      const segment=new THREE.Group();segment.position.set(bend,0,z);segment.rotation.y=yaw;group.add(segment);
      box(segment,6.15,.7,4.1,side*7.3,.28,0,m.paving||m.stonePale);
      box(segment,.52,2.8,4.1,side*4.43,-.85,0,m.stone||m.brick);
      box(segment,.73,.27,4.12,side*4.40,.66,0,m.stonePale);
    }
    const bed=box(group,8.3,.46,4.2,bend,-1.74,z,m.stone||m.brick);bed.rotation.y=yaw;
  }
}
function buildRearBridge(group,m,z){
  const bridgeGroup=new THREE.Group();bridgeGroup.position.set(centre(z),0,z);bridgeGroup.rotation.y=tangent(z);group.add(bridgeGroup);
  const deck=x=>.73+1.45*(1-x*x/121),shape=new THREE.Shape();shape.moveTo(-11,-2);shape.lineTo(11,-2);shape.lineTo(11,deck(11));for(let x=10.5;x>=-11;x-=.5)shape.lineTo(x,deck(x));shape.closePath();
  const opening=new THREE.Path();opening.moveTo(-3.6,-2);opening.lineTo(-3.6,-.1);opening.absellipse(0,-.1,3.6,1.55,Math.PI,0,true);opening.lineTo(3.6,-2);opening.closePath();shape.holes.push(opening);
  addMesh(bridgeGroup,new THREE.ExtrudeGeometry(shape,{depth:2.65,bevelEnabled:false,curveSegments:12}),m.stone||m.brick);
  for(const zz of [-.08,2.72])for(let x=-10.8;x<=10.8;x+=.72){
    box(bridgeGroup,.075,.65,.075,x,deck(x)+.38,zz,m.metal||m.greenWood);
    const rail=box(bridgeGroup,.77,.07,.075,x,deck(x)+.71,zz,m.metal||m.greenWood);rail.rotation.z=Math.atan(-2*1.45*x/121);
    box(bridgeGroup,.77,.16,.44,x,deck(x)+.06,zz,m.stonePale);
  }
}

function metreUVs(geometry){const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));if(x>y&&x>z){uv[i*2]=p.getZ(i);uv[i*2+1]=p.getY(i);}else if(y>z){uv[i*2]=p.getX(i);uv[i*2+1]=p.getZ(i);}else{uv[i*2]=p.getX(i);uv[i*2+1]=p.getY(i);}}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
function mergeOpaque(group){
  const inverse=group.matrixWorld.clone().invert(),buckets=new Map(),originals=[];
  group.traverse(object=>{if(!object.isMesh)return;const material=object.material;if(Array.isArray(material)||material.transparent||material.transmission>0)throw new Error('Distant town merging requires opaque single-material meshes');
    const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));geometry.deleteAttribute('tangent');metreUVs(geometry);
    if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(geometry);originals.push(object);
  });
  for(const object of originals){object.removeFromParent();object.geometry.dispose();}
  let triangles=0;
  for(const [material,geometries]of buckets){const geometry=mergeGeometries(geometries,false);if(!geometry)throw new Error('Distant town geometry merge failed');geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name='Distant town static / '+material.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);triangles+=geometry.attributes.position.count/3;for(const part of geometries)part.dispose();}
  group.userData.staticGeometry={materialGroups:buckets.size,triangles};
}
