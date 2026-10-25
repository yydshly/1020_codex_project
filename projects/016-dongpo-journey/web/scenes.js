// SPDX-License-Identifier: GPL-3.0-only
// Real mesh geometry and WebGL rendering. Architecture is authored imagery, not a survey.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.86,flatShading:true,...extra});
const materials={wood:mat('#705039'),darkwood:mat('#493d30'),wall:mat('#e5d8bb'),stone:mat('#a6ac98'),roof:mat('#4f6964'),tileEdge:mat('#354e49'),sand:mat('#c8b58b'),trunk:mat('#89704b'),leaf:mat('#4f7556'),leafLight:mat('#739264'),cliff:mat('#a88e72'),black:mat('#253c35'),red:mat('#ac593b'),cloth:mat('#ded0aa'),window:mat('#eabf6b',{emissive:'#b87929',emissiveIntensity:.15})};
const boxGeo=new THREE.BoxGeometry(1,1,1);
const sphereGeo=new THREE.IcosahedronGeometry(1,1);
const cylinderGeo=new THREE.CylinderGeometry(1,1,1,8);
const coneGeo=new THREE.ConeGeometry(1,1,9);
let seed=46;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function mesh(parent,geo,material,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const box=(p,x,y,z,sx,sy,sz,m)=>mesh(p,boxGeo,m,x,y,z,sx,sy,sz);
function beam(parent,a,b,r,material=materials.wood){const direction=b.clone().sub(a);const m=mesh(parent,cylinderGeo,material,...a.clone().add(b).multiplyScalar(.5).toArray(),r,direction.length(),r);m.quaternion.setFromUnitVectors(V(0,1,0),direction.normalize());return m;}
function tube(parent,points,r,material,segments=48){const curve=new THREE.CatmullRomCurve3(points);const m=mesh(parent,new THREE.TubeGeometry(curve,segments,r,5,false),material);return m;}
function roof(parent,w,d,y,material=materials.roof){
 const nx=16,nz=16,vertices=[],indices=[];
 for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const x=(ix/nx-.5)*w,z=(iz/nz-.5)*d;
  const arch=2.7*(1-Math.pow(Math.abs(z)/(d*.5),.75));
  const corner=.8*Math.pow(Math.abs(x)/(w*.5),7)*Math.pow(Math.abs(z)/(d*.5),4);
  vertices.push(x,y+arch+corner,z);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){let a=j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const m=mesh(parent,geometry,material);m.material.side=THREE.DoubleSide;
 beam(parent,V(-w*.5,y+2.7,0),V(w*.5,y+2.7,0),.13,materials.tileEdge);
 for(const sign of [-1,1]){const pts=[];for(let i=0;i<=16;i++){const x=(i/16-.5)*w;pts.push(V(x,y+.8*Math.pow(Math.abs(x)/(w*.5),7),sign*d*.5));}tube(parent,pts,.1,materials.tileEdge,24);}
 const linePositions=[];
 for(let i=0;i<=Math.floor(w/.65);i++){
  const x=-w*.5+i*.65;
  for(let j=0;j<16;j++){
   const z0=(j/16-.5)*d,z1=((j+1)/16-.5)*d;
   for(const z of [z0,z1])linePositions.push(x,y+2.7*(1-Math.pow(Math.abs(z)/(d*.5),.75))+.8*Math.pow(Math.abs(x)/(w*.5),7)*Math.pow(Math.abs(z)/(d*.5),4)+.035,z);
  }
 }
 const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(linePositions,3));parent.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:'#213e37',transparent:true,opacity:.25})));
 return m;
}
function house(parent,x,y,z,w=10,d=8,{open=false,rotation=0,red=false}={}){
 const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);
 box(g,0,.35,0,w+1.8,.7,d+1.8,materials.stone);
 box(g,0,.8,0,w+1,.25,d+1,materials.sand);
 if(!open){box(g,0,3.1,0,w*.85,4.5,d*.78,materials.wall);box(g,0,2.6,d*.4,2.2,3.5,.15,materials.darkwood);
 for(const side of [-1,1]){box(g,side*w*.29,3.4,d*.4,2.0,1.7,.15,materials.darkwood);for(let i=-1;i<=1;i++){box(g,side*w*.29+i*.55,3.4,d*.42,.065,1.6,.08,materials.wood);}box(g,side*w*.29,3.4,d*.43,2.1,.08,.08,materials.wood);}}
 for(const a of [-1,1])for(const b of [-1,1])mesh(g,cylinderGeo,red?materials.red:materials.wood,a*w*.41,3,b*d*.39,.18,5.1,.18);
 box(g,0,5.5,0,w, .25,d*.84,materials.darkwood);
 roof(g,w+2.1,d+3,5.5);
 if(open){for(const side of [-1,1]){beam(g,V(-w*.4,2,side*d*.39),V(w*.4,2,side*d*.39),.09);for(let j=-3;j<=3;j++)mesh(g,cylinderGeo,materials.wood,j*w*.11,1.6,side*d*.39,.06,1.2,.06);}}
 for(let i=0;i<3;i++)box(g,0,.12+i*.15,d*.55+1.8-i*.5,3.8,.24+i*.15,1.3,materials.stone);
 return g;
}
function pine(parent,x,y,z,scale=1){
 const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
 mesh(g,cylinderGeo,materials.trunk,0,3.5,0,.19,7,.19);
 for(let i=0;i<3;i++){const crown=mesh(g,sphereGeo,i===1?materials.leafLight:materials.leaf,Math.sin(i*3)*.9,5.2+i*1.4,Math.cos(i*4)*.5,3.3-i*.6,1.4,2.4-i*.4);crown.rotation.y=i*1.3;}
}
function broadleaf(parent,x,y,z,scale=1,fruit=false){
 const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
 mesh(g,cylinderGeo,materials.trunk,0,2.2,0,.24,4.5,.24);
 for(let i=0;i<5;i++){const a=i*2.399;beam(g,V(0,1.7,0),V(Math.cos(a)*1.8,4.2,Math.sin(a)*1.8),.1,materials.trunk);mesh(g,sphereGeo,i%2?materials.leafLight:materials.leaf,Math.cos(a)*1.6,4.5+random(),Math.sin(a)*1.6,2.4,2.0,2.4);}
 if(fruit)for(let i=0;i<9;i++){const a=random()*Math.PI*2;mesh(g,sphereGeo,materials.red,Math.cos(a)*2.5,3.8+random()*1.6,Math.sin(a)*2.5,.18,.22,.18);}
}
function palm(parent,x,y,z,scale=1){
 const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
 tube(g,[V(),V(.3,3,0),V(1.3,7,0),V(2.2,10,0)],.23,materials.trunk,12);
 const verts=[];
 for(let f=0;f<9;f++){
  const angle=f*Math.PI*2/9;
  for(let j=0;j<13;j++){
   const t=j/13,t2=(j+1)/13;
   const p=t=>V(2.2+Math.cos(angle)*t*7,10+Math.sin(t*Math.PI)*1.8-t*3,Math.sin(angle)*t*7);
   const a=p(t),b=p(t2),side=V(-Math.sin(angle),-.25,Math.cos(angle)).multiplyScalar(Math.sin(t*Math.PI)*1.3+.12);
   verts.push(...a.clone().sub(side).toArray(),...a.clone().add(side).toArray(),...b.toArray());
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();const material=materials.leaf.clone();material.side=THREE.DoubleSide;mesh(g,geo,material);
 for(let i=0;i<3;i++)mesh(g,sphereGeo,materials.wood,2+Math.cos(i*2)*.45,9.6,Math.sin(i*2)*.45,.4,.5,.4);
}
function boat(parent,x,z,{sail=false}={}){
 const g=new THREE.Group();g.position.set(x,.8,z);parent.add(g);
 mesh(g,new THREE.SphereGeometry(1,16,8),materials.wood,0,0,0,1.8,.8,5.1);
 box(g,0,.35,0,2.7,.3,7.6,materials.darkwood);
 if(sail){beam(g,V(0,.3,.1),V(0,11,.1),.12);const pts=[-.1,2,.2,4.4,2,.7,3.8,10,.6,-.1,11,.2];const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();mesh(g,geometry,new THREE.MeshStandardMaterial({color:'#d8c294',side:THREE.DoubleSide,roughness:1}));for(let i=0;i<5;i++)beam(g,V(0,2.6+i*1.5,.25),V(4-i*.15,2.6+i*1.5,.65),.035,materials.trunk);}
 else{const arch=[];for(let j=0;j<=14;j++){const a=j/14*Math.PI;arch.push(V(Math.cos(a)*1.6,.7+Math.sin(a)*1.7,-.6));}tube(g,arch,.1,materials.trunk,16);const canopy=new THREE.Mesh(new THREE.CylinderGeometry(1.65,1.65,3.8,20,1,true,0,Math.PI),new THREE.MeshStandardMaterial({color:'#c8b27b',side:THREE.DoubleSide,roughness:1}));canopy.rotation.x=Math.PI/2;canopy.rotation.z=Math.PI/2;canopy.position.set(0,.75,-.6);g.add(canopy);}
 mesh(g,sphereGeo,materials.wall,.1,1.7,2.8,.4,.4,.4);mesh(g,coneGeo,materials.sand,.1,2.05,2.8,.75,.35,.75);mesh(g,cylinderGeo,materials.black,.1,1,2.8,.4,1.05,.4);beam(g,V(.3,1.2,3),V(3.6,-.3,4),.07,materials.trunk);
 return g;
}
function bridge(parent,heightAt,x,z,length=34){
 const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
 const points=[];
 for(let i=0;i<=30;i++){
  const t=i/30,px=(t-.5)*length,y=1.6+Math.sin(t*Math.PI)*5.5;
  const plank=box(g,px,y,0,length/30+.1,.55,4.2,materials.stone);plank.rotation.z=Math.cos(t*Math.PI)*.22;
  if(i%3===0)for(const sign of [-1,1]){mesh(g,cylinderGeo,materials.stone,px,y+1.1,sign*1.9,.12,2.2,.12);mesh(g,sphereGeo,materials.sand,px,y+2.2,sign*1.9,.24,.24,.24);}
  points.push(V(px,y+1.9,1.9));
 }
 tube(g,points,.1,materials.stone,40);tube(g,points.map(p=>V(p.x,p.y,-1.9)),.1,materials.stone,40);
 for(const end of [-1,1])box(g,end*(length*.47),.6,0,3,2,5.4,materials.stone);
 return g;
}
function pagoda(parent,x,y,z){
 const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
 mesh(g,new THREE.CylinderGeometry(6.2,6.7,.8,8),materials.stone,0,.4,0);
 for(let i=0;i<7;i++){
  const r=5.1-i*.48,by=1+i*4.1;
  mesh(g,new THREE.CylinderGeometry(r,r+.13,3.7,8),materials.wall,0,by+1.8,0);
  for(let j=0;j<8;j++){const a=j*Math.PI/4;const win=box(g,Math.sin(a)*(r+.04),by+1.9,Math.cos(a)*(r+.04),.75,1.5,.1,materials.darkwood);win.rotation.y=a;}
  const eave=mesh(g,new THREE.CylinderGeometry(r*.65,r+1.2,1.5,8),materials.roof,0,by+3.9,0);eave.rotation.y=Math.PI/8;
 }
 mesh(g,coneGeo,materials.sand,0,31,0,.5,4,.5);return g;
}
function circularTerrain(parent,heightAt,palette){
 const radial=62,around=144,positions=[],colors=[],indices=[],color=new THREE.Color();
 for(let ring=0;ring<=radial;ring++)for(let j=0;j<=around;j++){
  const r=ring/radial,a=j/around*Math.PI*2,x=Math.cos(a)*r*63,z=Math.sin(a)*r*49,y=heightAt(x,z);
  positions.push(x,y,z);
  color.set(y<.25?'#bac7a7':palette[0]);color.lerp(new THREE.Color(palette[1]),clamp((y-2)/16,0,1));color.multiplyScalar(.94+random()*.10);colors.push(color.r,color.g,color.b);
 }
 for(let r=0;r<radial;r++)for(let j=0;j<around;j++){let a=r*(around+1)+j,b=a+around+1;indices.push(a,a+1,b,a+1,b+1,b);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 mesh(parent,geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true,side:THREE.DoubleSide}));
}
function disc(parent,waterMaterial){
 const rim=mesh(parent,new THREE.CylinderGeometry(63.1,61.3,5.6,144),mat('#d1c6a7'),0,-2.8,0,1,1,49/63);rim.receiveShadow=true;
 mesh(parent,new THREE.CylinderGeometry(61.6,60.1,.6,144),mat('#b59e73'),0,-5.6,0,1,1,49/63);
 const water=mesh(parent,new THREE.CircleGeometry(63,128),waterMaterial,0,.16,0,1,49/63,1);water.rotation.x=-Math.PI/2;water.castShadow=false;water.receiveShadow=false;
}
function landPath(parent,coords,heightAt,width=.55){tube(parent,coords.map(([x,z])=>V(x,heightAt(x,z)+.11,z)),width,materials.sand,80);}
function rocks(parent,heightAt,count){for(let i=0;i<count;i++){const x=(random()-.5)*105,z=(random()-.5)*78,h=heightAt(x,z);if(h<1||x*x/3800+z*z/2100>.9)continue;const size=.7+random()*2;const m=mesh(parent,sphereGeo,materials.stone,x,h+.3,z,size,size*.85,size*.7);m.rotation.set(random(),random()*3,random()*.3);}}
function reeds(parent,heightAt){const positions=[];for(let i=0;i<200;i++){let x=(random()-.5)*116,z=(random()-.5)*88,h=heightAt(x,z);if(h>.25&&h<1.6){for(let j=0;j<3;j++)positions.push(x,h,z,x+(random()-.5)*.6,h+.7+random(),z+(random()-.5)*.6);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));parent.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#82926a'})));}
function makeHuangzhou(water){
 seed=56;const group=new THREE.Group();disc(group,water);
 const river=z=>12+6*Math.sin(z*.05);
 const h=(x,z)=>{const d=Math.abs(x-river(z));const hill=2+18*Math.exp(-((x-37)**2/220+(z+20)**2/380))+7*Math.exp(-((x+30)**2/350+(z+25)**2/400))+.5*Math.sin(x*.2)*Math.cos(z*.16);return -.8+(hill+.8)*smooth(9,16,d);};
 circularTerrain(group,h,['#7f9974','#b39b7e']);
 landPath(group,[[-44,23],[-29,14],[-20,8],[-21,-7],[-33,-22]],h,.7);
 house(group,-24,h(-24,8),8,12,9);house(group,-39,h(-39,-5),-5,8,6,{rotation:.2});house(group,-36,h(-36,18),18,8,6,{rotation:-.15});house(group,37,h(37,-18),-18,9,8,{open:true,rotation:.25});
 for(let i=0;i<53;i++){const x=(random()-.5)*112,z=(random()-.5)*80;if(x*x/3100+z*z/1600>.9||h(x,z)<1.8)continue;if(Math.hypot(x+24,z-8)<11||Math.hypot(x-37,z+18)<10)continue;pine(group,x,h(x,z),z,.65+random()*.55);}
 for(let i=0;i<11;i++){let x=-19+i*.36,z=-8+random()*4;beam(group,V(x,h(x,z),z),V(x+.5,h(x,z)+5+random()*2,z),.07,materials.leaf);}
 for(let i=0;i<11;i++)box(group,-1+i*.95,1.5,13,1,.22,3.7,materials.wood);
 for(let i=0;i<4;i++)for(const s of [-1,1])mesh(group,cylinderGeo,materials.wood,i*3-.5,.4,13+s*1.5,.13,2.5,.13);
 const ship=boat(group,river(12),12);ship.rotation.y=-.2;
 rocks(group,h,32);reeds(group,h);
 return{group,ship,river,kind:'river',landmarks:[{name:'江上扁舟',target:[14,2,12],camera:[37,15,39]},{name:'崖上茅亭',target:[37,h(37,-18)+5,-18],camera:[68,36,16]},{name:'东坡小院',target:[-24,h(-24,8)+4,8],camera:[6,25,46]}],camera:[89,66,102],target:[1,7,0]};
}
function makeHuizhou(water){
 seed=92;const group=new THREE.Group();disc(group,water);
 const h=(x,z)=>{const left=smooth(-12,-27,x),right=smooth(13,28,x);const shore=Math.max(left,right,smooth(21,36,z));const hill=2.5+13*Math.exp(-((x+39)**2/160+(z+23)**2/200))+8*Math.exp(-((x-42)**2/200+(z+28)**2/200));return -.7+(hill+.7)*shore;};
 // smooth handles descending bounds as a clamped interpolation too.
 circularTerrain(group,h,['#84a17e','#b2b39a']);
 bridge(group,h,1,9,39);pagoda(group,-32,h(-32,-6),-6);
 house(group,35,h(35,18),18,10,8,{open:true});house(group,40,h(40,-5),-5,9,7,{rotation:-.2});
 for(let i=0;i<47;i++){let x=(random()-.5)*112,z=(random()-.5)*80;if(x*x/3100+z*z/1600>.9||h(x,z)<1.5||Math.hypot(x+32,z+6)<10||Math.hypot(x-35,z-18)<9)continue;broadleaf(group,x,h(x,z),z,.55+random()*.5,x>10);}
 landPath(group,[[-46,22],[-33,14],[-24,9]],h,.7);landPath(group,[[22,9],[32,15],[39,27],[28,37]],h,.6);
 const ship=boat(group,2,-18);ship.rotation.y=.8;rocks(group,h,18);reeds(group,h);
 return{group,ship,kind:'lake',landmarks:[{name:'湖上拱桥',target:[1,4,9],camera:[33,21,42]},{name:'湖畔古塔',target:[-32,18,-6],camera:[4,36,37]},{name:'荔枝庭院',target:[35,6,18],camera:[57,25,45]}],camera:[88,62,101],target:[0,8,0]};
}
function makeDanzhou(water){
 seed=118;const group=new THREE.Group();disc(group,water);
 const h=(x,z)=>{const shore=smooth(-4,14,x+z*.25);const hill=2.4+7*Math.exp(-((x-33)**2/550+(z+29)**2/230))+.7*Math.sin(x*.08)*Math.cos(z*.14);return -.8+(hill+.8)*shore;};
 circularTerrain(group,h,['#a1ad7e','#c6b68b']);
 // Central academy with two halls and an open court, created as a poetic miniature.
 const center=V(25,h(25,-9),-9);
 box(group,25,center.y+.25,-9,28,.5,31,materials.stone);
 box(group,25,center.y+.6,-9,26,.2,29,materials.sand);
 house(group,25,center.y+.7,-19,18,9,{red:true});house(group,25,center.y+.7,3,13,7,{open:true,red:true});
 for(const side of [-1,1]){box(group,25+side*12.3,center.y+2.1,-9,.5,3.5,21,materials.wall);}
 house(group,47,h(47,12),12,9,7,{rotation:.2});
 // Walkway descends from the academy to the coast.
 landPath(group,[[25,12],[21,20],[15,25],[4,27]],h,.9);
 for(let i=0;i<14;i++){const x=8+random()*43,z=-35+random()*70;if(x*x/3300+z*z/1700>.94||Math.hypot(x-25,z+8)<21)continue;palm(group,x,h(x,z),z,.7+random()*.35);}
 for(let i=0;i<15;i++){const x=10+random()*42,z=-40+random()*75;if(x*x/3300+z*z/1700>.85||Math.hypot(x-25,z+8)<23)continue;broadleaf(group,x,h(x,z),z,.6);}
 for(let i=0;i<11;i++)box(group,-6-i*.7,1.2,24,1,.2,3.8,materials.wood);
 const ship=boat(group,-28,9,{sail:true});ship.rotation.y=-.5;
 rocks(group,h,20);reeds(group,h);
 return{group,ship,kind:'sea',landmarks:[{name:'书院庭前',target:[25,center.y+5,-10],camera:[55,29,38]},{name:'椰影海岸',target:[8,4,28],camera:[-25,17,58]},{name:'北归帆影',target:[-28,6,9],camera:[-48,15,37]}],camera:[91,66,105],target:[2,5,0]};
}
function makeWater(){return new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uNight:{value:0}},side:THREE.DoubleSide,vertexShader:`
 varying vec3 vWorld; varying vec2 vUv; uniform float uTime;
 void main(){vec3 p=position;vUv=uv;vec4 world=modelMatrix*vec4(p,1.0);world.y+=sin(world.x*.29+uTime*.8)*.035+cos(world.z*.27+uTime*.5)*.035;vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
 `,fragmentShader:`
 uniform float uTime;uniform float uNight;varying vec3 vWorld;varying vec2 vUv;
 void main(){float a=sin(vWorld.x*.72+vWorld.z*.38+uTime*.8);float b=sin(vWorld.z*.82-vWorld.x*.21-uTime*.63);vec3 n=normalize(vec3(a*.13,1.0,b*.14));vec3 view=normalize(cameraPosition-vWorld);vec3 sun=normalize(vec3(-.7,1.0,.4));float shine=pow(max(dot(reflect(-sun,n),view),0.0),48.0);float wave=smoothstep(.93,1.0,sin(vWorld.x*1.9+vWorld.z*1.2+a+b));float fresnel=pow(1.0-max(dot(view,n),0.0),3.0);vec3 base=mix(vec3(.32,.53,.48),vec3(.14,.26,.31),uNight);vec3 color=base+fresnel*.12+shine*vec3(.48,.40,.23)+wave*.055;gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});}
function makeOverview(elevation,mapData,water){
 const group=new THREE.Group(),{width,height,heights,bounds}=elevation,W=170,D=181;
 const geoCoord=([lon,lat])=>[(lon-bounds.west)/(bounds.east-bounds.west)*W-W/2,(bounds.north-lat)/(bounds.north-bounds.south)*D-D/2];
 const sample=(lon,lat)=>{let x=clamp((lon-bounds.west)/(bounds.east-bounds.west)*(width-1),0,width-1),z=clamp((bounds.north-lat)/(bounds.north-bounds.south)*(height-1),0,height-1);let i=Math.floor(x),j=Math.floor(z);return heights[j*width+i];};
 const yFor=(lon,lat)=>1.2+Math.max(-60,sample(lon,lat))*.009;
 const positions=[],colors=[],indices=[],color=new THREE.Color();
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){
  const h=heights[j*width+i];positions.push(i/(width-1)*W-W/2,1.2+Math.max(-60,h)*.009,j/(height-1)*D-D/2);
  color.set(h<8?'#b1b58e':'#789477').lerp(new THREE.Color('#d6ceb5'),clamp(h/3000,0,1));colors.push(color.r,color.g,color.b);
 }
 for(let j=0;j<height-1;j++)for(let i=0;i<width-1;i++){let a=j*width+i,b=a+width;indices.push(a,b,a+1,b,b+1,a+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(group,geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));
 box(group,0,-3.2,0,W+1,6.2,D+1,mat('#bcb393'));
 const sea=mesh(group,new THREE.PlaneGeometry(W,D),water,0,1.24,0);sea.rotation.x=-Math.PI/2;sea.castShadow=false;
 // Rivers and selected-city positions are geographical, unlike the authored local scenes.
 mapData.rivers.forEach(river=>river.lines.forEach(line=>{
 let points=[];const flush=()=>{if(points.length>1){const geometry=new THREE.BufferGeometry().setFromPoints(points);group.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#b3d1bd',transparent:true,opacity:.8})));}points=[];};
 line.forEach(([lon,lat])=>{if(lon<bounds.west||lon>bounds.east||lat<bounds.south||lat>bounds.north){flush();return;}const [x,z]=geoCoord([lon,lat]);points.push(V(x,yFor(lon,lat)+.24,z));});flush();
 }));
 const stops=window.DONGPO_STORY.stops,anchors=stops.map(stop=>{const [x,z]=geoCoord(stop.coord);return V(x,Math.max(1.6,yFor(...stop.coord))+.8,z);});
 const routePoints=[];
 for(let i=0;i<2;i++){const p=anchors[i],q=anchors[i+1];for(let j=0;j<30;j++){const t=j/29;const lon=stops[i].coord[0]+(stops[i+1].coord[0]-stops[i].coord[0])*t,lat=stops[i].coord[1]+(stops[i+1].coord[1]-stops[i].coord[1])*t;const [x,z]=geoCoord([lon,lat]);routePoints.push(V(x,Math.max(1.7,yFor(lon,lat))+2+Math.sin(t*Math.PI)*4,z));}}
 const routeCurve=new THREE.CatmullRomCurve3(routePoints);const route=mesh(group,new THREE.TubeGeometry(routeCurve,170,.32,6,false),mat('#aa6946',{emissive:'#6d3820',emissiveIntensity:.3}));route.castShadow=false;
 const beaconMaterial=mat('#c28e4c',{emissive:'#a7672d',emissiveIntensity:.25});
 anchors.forEach(point=>{mesh(group,new THREE.CylinderGeometry(.7,.7,5,16),beaconMaterial,point.x,point.y+2.5,point.z);mesh(group,new THREE.TorusGeometry(2,.25,6,32),materials.red,point.x,point.y+.1,point.z).rotation.x=-Math.PI/2;mesh(group,sphereGeo,materials.cloth,point.x,point.y+5.3,point.z,1.1,1.1,1.1);});
 const traveler=mesh(group,sphereGeo,mat('#ffe6a2',{emissive:'#edc45f',emissiveIntensity:2}),0,0,0,.8,.8,.8);
 return{group,kind:'overview',anchors,traveler,routeCurve,landmarks:[],camera:[186,174,211],target:[0,3,0]};
}
export async function createExperience(canvas,{onFrame,onMapSelect}={}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 const scene=new THREE.Scene();scene.fog=new THREE.Fog('#e8e9dd',190,520);
 const camera=new THREE.PerspectiveCamera(38,1,.5,1000);camera.position.set(90,66,105);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.1;controls.minDistance=18;controls.maxDistance=420;controls.autoRotateSpeed=.35;controls.target.set(0,6,0);
 const hemi=new THREE.HemisphereLight('#fcf8df','#627d63',2.6);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff0c7',3.6);sun.position.set(-70,100,45);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-105,right:105,top:105,bottom:-105,near:1,far:320});sun.shadow.bias=-.00025;sun.shadow.normalBias=.15;scene.add(sun);
 const fill=new THREE.DirectionalLight('#c4e0d2',.9);fill.position.set(45,50,-65);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),new THREE.ShadowMaterial({opacity:.12}));floor.rotation.x=-Math.PI/2;floor.position.y=-6.2;floor.receiveShadow=true;scene.add(floor);
 const water=makeWater();const worlds={huangzhou:makeHuangzhou(water),huizhou:makeHuizhou(water),danzhou:makeDanzhou(water)};
 const data=await Promise.all([fetch('assets/elevation.json').then(r=>{if(!r.ok)throw new Error('高程数据未载入');return r.json();}),fetch('assets/map-data.json').then(r=>{if(!r.ok)throw new Error('地理数据未载入');return r.json();})]);
 worlds.overview=makeOverview(...data,water);
 for(const world of Object.values(worlds)){scene.add(world.group);world.group.visible=false;}
 // Birds are mesh silhouettes with animated wing joints, not a video or image.
 const birds=new THREE.Group();scene.add(birds);const birdObjects=[];
 for(let i=0;i<7;i++){const g=new THREE.Group();const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2.0,.15,-.35,.9,0,.5],3));wingGeo.computeVertexNormals();const bm=materials.black.clone();bm.side=THREE.DoubleSide;const left=new THREE.Mesh(wingGeo,bm),right=new THREE.Mesh(wingGeo,bm);right.scale.x=-1;g.add(left,right);birds.add(g);birdObjects.push({g,left,right,phase:i*1.9});}
 let active='huangzhou',pose=null,tween=null,night=false,previous=performance.now(),frames=0,reportTime=performance.now(),stopped=false;
 const labels=document.getElementById('map-labels');
 labels.replaceChildren(...window.DONGPO_STORY.stops.map(stop=>{const button=document.createElement('button');button.innerHTML=`${stop.name}<small>${stop.year}</small>`;button.addEventListener('click',()=>onMapSelect?.(stop.id));return button;}));
 function resize(){const width=canvas.clientWidth,height=canvas.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.clearViewOffset();if(width>760)camera.setViewOffset(width,height,-Math.min(width*.10,170),0,width,height);else camera.setViewOffset(width,height,0,-Math.min(height*.07,60),width,height);camera.updateProjectionMatrix();controls.maxDistance=width<=760?950:active==='overview'?540:300;if(pose)travel(pose.position,pose.target,0);}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 function travel(position,target,duration=1700){pose={position:[...position],target:[...target]};const width=canvas.clientWidth;const factor=width<=760?clamp(1100/width,1.9,3.1):clamp(1530/width,1.15,1.9);const p=V(...position),tar=V(...target);p.sub(tar).multiplyScalar(factor).add(tar);const distance=p.distanceTo(tar);scene.fog.near=Math.max(active==='overview'?450:190,distance*.9);scene.fog.far=Math.max(active==='overview'?1100:520,distance*1.8);const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;tween={from:camera.position.clone(),to:p,targetFrom:controls.target.clone(),targetTo:tar,start:performance.now(),duration:reduced?0:duration};controls.enabled=false;}
 function setScene(id,animate=true){if(!worlds[id])return;active=id;scene.fog.near=id==='overview'?450:190;scene.fog.far=id==='overview'?1100:520;for(const [key,world]of Object.entries(worlds))world.group.visible=key===id;labels.hidden=id!=='overview';birds.visible=id!=='overview';const world=worlds[id];camera.position.copy(V(...world.camera).multiplyScalar(1.15));controls.target.copy(V(...world.target));controls.minDistance=id==='overview'?100:18;controls.maxDistance=canvas.clientWidth<=760?950:id==='overview'?540:300;travel(world.camera,world.target,animate?1800:0);canvas.dataset.scene=id;canvas.dataset.engine='three-r180-webgl2';canvas.dataset.ready='true';}
 function focus(index){const point=worlds[active].landmarks[index];if(point)travel(point.camera,point.target,1400);}
 function reset(){const world=worlds[active];travel(world.camera,world.target);}
 function aerial(){const world=worlds[active],target=world.target;travel([target[0]+1,active==='overview'?280:131,target[2]+24],target);}
 function setNight(value){night=value;water.uniforms.uNight.value=value?1:0;hemi.intensity=value?1.15:2.6;sun.intensity=value?2.5:3.6;sun.color.set(value?'#ffc17d':'#fff0c7');sun.position.set(value?-95:-70,value?38:100,45);fill.intensity=value?.45:.9;scene.fog.color.set(value?'#d8d6cb':'#e8e9dd');materials.window.emissiveIntensity=value?1.4:.15;renderer.toneMappingExposure=value?1.05:1.18;}
 controls.addEventListener('start',()=>{if(tween){tween=null;controls.enabled=true;}});
 function tick(now){if(stopped)return;const delta=Math.min(.05,(now-previous)/1000);previous=now;const time=now/1000;
  if(tween){const t=tween.duration?clamp((now-tween.start)/tween.duration,0,1):1;const k=t*t*(3-2*t);camera.position.lerpVectors(tween.from,tween.to,k);controls.target.lerpVectors(tween.targetFrom,tween.targetTo,k);if(t>=1){tween=null;controls.enabled=true;}}
  water.uniforms.uTime.value=time;
  const world=worlds[active];if(world.ship){const ship=world.ship;ship.position.y=.8+Math.sin(time*1.2)*.08;ship.rotation.z=Math.sin(time*.8)*.014;if(world.kind==='river'){ship.position.z=10+Math.sin(time*.08)*20;ship.position.x=world.river(ship.position.z);ship.rotation.y=Math.atan(Math.cos(ship.position.z*.05)*.3);}if(world.kind==='lake'){ship.position.x=Math.sin(time*.06)*5;ship.rotation.y=.8+Math.sin(time*.06)*.3;}if(world.kind==='sea'){ship.position.z=8+Math.sin(time*.05)*9;}}
  birdObjects.forEach(({g,left,right,phase},i)=>{const angle=time*.05+phase;g.position.set(Math.cos(angle)*43,28+Math.sin(angle*2)*3+i*.8,Math.sin(angle)*33);g.rotation.y=-angle;left.rotation.z=Math.sin(time*3+phase)*.32;right.rotation.z=-Math.sin(time*3+phase)*.32;g.scale.setScalar(.55);});
  if(active==='overview'){world.traveler.position.copy(world.routeCurve.getPointAt((time*.035)%1));const rect=canvas.getBoundingClientRect();world.anchors.forEach((anchor,i)=>{const point=anchor.clone().add(V(0,8,0)).project(camera);const el=labels.children[i];el.style.left=`${(point.x*.5+.5)*rect.width}px`;el.style.top=`${(-point.y*.5+.5)*rect.height}px`;el.style.display=point.z>1||point.z< -1?'none':'';});}
  controls.update(delta);renderer.render(scene,camera);frames++;
  if(now-reportTime>700){const fps=Math.round(frames*1000/(now-reportTime));canvas.dataset.frames=String(renderer.info.render.frame);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.camera=camera.position.toArray().map(n=>n.toFixed(2)).join(',');onFrame?.({fps,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,scene:active});frames=0;reportTime=now;}
  requestAnimationFrame(tick);
 }
 setScene('huangzhou',false);requestAnimationFrame(tick);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();canvas.dataset.ready='false';document.getElementById('loading').classList.remove('gone');document.getElementById('loading-message').textContent='三维图形上下文已中断，请刷新页面重新载入。';});
 return{setScene,focus,reset,aerial,setNight,setAutoRotate:value=>{controls.autoRotate=value;},getLandmarks:id=>worlds[id].landmarks,dispose:()=>{stopped=true;observer.disconnect();controls.dispose();renderer.dispose();}};
}
