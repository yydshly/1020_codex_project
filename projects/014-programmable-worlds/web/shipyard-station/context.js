import * as THREE from 'three';

// Authored industrial context for the station, in metres. These are complete
// buildings and load-bearing structures, not camera-facing skyline cards.
// The caller gives every material a StationAux/... name and retains the
// geometry as a source occluder while excluding it from hero lightmap texels.
export function buildIndustrialContext(aux,m,tools){
 const {box,rod,cylinder,mesh,iBeamX,iBeamZ,roofSheet}=tools;
 const steel=m.steel||m.dark,wood=m.oak||m.wood;
 function beam(a,b,w=.16,d=.16,mat=steel){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const o=box(aux,w,delta.length(),d,...start.clone().add(end).multiplyScalar(.5).toArray(),mat,.008);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;
 }
 function panelGeometry(points){
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return new THREE.ShapeGeometry(shape);
 }
 function roofPlane(vertices,outer=m.zinc){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p[0],p[2]]),2));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  roofSheet(aux,geometry,outer,steel,'Industrial context / continuous roof sheet');
 }
 function window(x,y,z,w=2,h=1.2,axis='z'){
  // A recessed dark pane and four-sided steel reveal give windows thickness.
  if(axis==='z'){
   box(aux,w,h,.035,x,y,z,m.dark,0);
   for(const dx of [-w/2,w/2])box(aux,.065,h+.13,.11,x+dx,y,z+.045,steel,.006);
   for(const dy of [-h/2,h/2])box(aux,w+.13,.065,.11,x,y+dy,z+.045,steel,.006);
   box(aux,.045,h,.09,x,y,z+.07,steel,.004);box(aux,w,.045,.09,x,y,z+.07,steel,.004);
  }else{
   box(aux,.035,h,w,x,y,z,m.dark,0);
   for(const dz of [-w/2,w/2])box(aux,.11,h+.13,.065,x+.045,y,z+dz,steel,.006);
   for(const dy of [-h/2,h/2])box(aux,.11,.065,w+.13,x+.045,y+dy,z,steel,.006);
   box(aux,.09,h,.045,x+.07,y,z,steel,.004);box(aux,.09,.045,w,x+.07,y,z,steel,.004);
  }
 }
 function gableShed(x,z,w,d,eaves,rise,options={}){
  const ground=.65,wall=eaves-ground,front=z+d/2,back=z-d/2;
  box(aux,w+.6,.3,d+.6,x,.8,z,m.stone,.025,'Context warehouse stone foundation');
  // The front loading door is an actual opening with an interior shadow bay.
  const doorW=Math.min(5.0,w*.34),doorH=Math.min(4.3,wall-.6),doorX=x-(w*.13);
  const left=(doorX-doorW/2)-(x-w/2),right=(x+w/2)-(doorX+doorW/2);
  box(aux,left,wall,.38,x-w/2+left/2,ground+wall/2,front,m.brick,.012);
  box(aux,right,wall,.38,x+w/2-right/2,ground+wall/2,front,m.brick,.012);
  box(aux,doorW,wall-doorH,.38,doorX,ground+doorH+(wall-doorH)/2,front,m.brick,.012);
  box(aux,w,wall,.36,x,ground+wall/2,back,m.brick,.012);
  for(const side of [-1,1])box(aux,.36,wall,d,x+side*w/2,ground+wall/2,z,m.brick,.012);
  box(aux,doorW,doorH,.045,doorX,ground+doorH/2,front-1.8,m.dark,0);
  box(aux,doorW+.6,.14,2.25,doorX,.89,front-1.0,m.stone,.01);
  // One parked sliding door leaves the bay readable rather than sealing it.
  box(aux,doorW*.54,doorH,.13,doorX+doorW*.78,ground+doorH/2,front+.24,wood,.012);
  iBeamX(aux,doorW*1.9,.18,.13,doorX+doorW*.27,ground+doorH+.17,front+.26,steel);
  const pts=[[-w/2,0],[w/2,0],[0,rise]];
  for(const zz of [front,back]){const end=mesh(aux,panelGeometry(pts),m.brick,x,eaves,zz,'Context warehouse complete gable');if(zz===back)end.rotation.y=Math.PI;}
  roofPlane([[x-w/2-.35,eaves,back-.4],[x-w/2-.35,eaves,front+.4],[x,eaves+rise,front+.4],[x,eaves+rise,back-.4]]);
  roofPlane([[x,eaves+rise,back-.4],[x,eaves+rise,front+.4],[x+w/2+.35,eaves,front+.4],[x+w/2+.35,eaves,back-.4]]);
  iBeamZ(aux,d+.85,.13,.17,x,eaves+rise+.045,z,m.zinc);
  for(const side of [-1,1]){
   rod(aux,[x+side*(w/2+.23),eaves,back-.25],[x+side*(w/2+.23),eaves,front+.25],.065,m.zinc,10);
   rod(aux,[x+side*(w/2+.26),.9,front-.5],[x+side*(w/2+.26),eaves,front-.5],.045,m.zinc,10);
  }
  // Masonry piers subdivide the long elevations. The narrow horizontal
  // windows sit under the eaves, as on a small industrial loading shed.
  for(let zz=back+2;zz<front-1;zz+=4){
   for(const side of [-1,1])box(aux,.6,wall+.2,.65,x+side*w/2,ground+wall/2,zz,m.brick,.012);
   window(x+w/2+.19,eaves-1.25,zz,2.3,1.1,'x');
  }
  if(options.lantern){
   box(aux,w*.24,.55,d*.5,x,eaves+rise+.35,z,m.dark,.01);
   box(aux,w*.29,.12,d*.53,x,eaves+rise+.69,z,m.zinc,.012);
   for(const zz of [z-d*.22,z,z+d*.22])box(aux,w*.26,.56,.055,x,eaves+rise+.35,zz,steel,.003);
  }
 }

 // A finite service-yard edge. The near working apron and slipway remain
 // open; the wall is behind the winch, never between the boat and the camera.
 box(aux,.45,2.45,120,-45.45,1.875,-14,m.brick,.018,'Western repair works perimeter');
 box(aux,.65,.16,120.4,-45.45,3.18,-14,m.cap,.018);
 for(let z=-73;z<=46;z+=6){box(aux,.8,2.65,.8,-45.45,1.975,z,m.brick,.018);box(aux,1,.14,1,-45.45,3.36,z,m.cap,.02);}
 // Back wall behind the passenger service yard has a lower loading gate.
 for(const [a,b]of [[-80,-50],[-43,45]]){
  box(aux,.42,2.1,b-a,43,1.7,(a+b)/2,m.brick,.018);
  box(aux,.62,.14,b-a+.1,43,2.82,(a+b)/2,m.cap,.018);
 }
 for(const z of [-50,-43]){box(aux,.8,2.7,.8,43,2,z,m.brick,.018);box(aux,1,.14,1,43,3.42,z,m.cap,.02);}
 for(const z of [-48.4,-45.2]){
  for(const y of [1.1,2.6])box(aux,.12,.09,3.1,43,y,z,steel,.006);
  for(let zz=z-1.45;zz<z+1.5;zz+=.25)box(aux,.06,1.6,.045,43,1.85,zz,steel,.004);
 }

 // Bridge: two camelback trusses stand beside a six-metre service road.
 // Bottom of every cross-river member is >=5.7m, leaving the launch route
 // and its cabin unobstructed. The abutments are wholly outside the water.
 const bz=-82,deck=6.08,half=24,top=x=>9.15+1.65*(1-Math.abs(x)/half);
 for(const side of [-1,1]){
  box(aux,4.3,5.05,8.6,side*22.5,3.125,bz,m.stone,.025,'Steel bridge masonry abutment');
  box(aux,4.8,.36,9.0,side*22.5,5.83,bz,m.cap,.025);
  for(const zz of [-2.8,2.8])box(aux,.85,.22,.9,side*22.2,6.12,bz+zz,steel,.018);
  // Solid approach causeways are land-side of the banks.
  box(aux,17.5,5.3,6.4,side*33.25,3.3,bz,m.stone,.025);
  box(aux,18.0,.22,6.7,side*33.1,6.05,bz,m.paving,.012);
 }
 box(aux,48,.22,5.8,0,deck,bz,m.paving,.008,'Bridge service-road deck');
 for(const z of [bz-2.95,bz+2.95]){
  iBeamX(aux,48,.48,.24,0,5.98,z,steel);
  for(let x=-24;x<24;x+=6){
   const x1=x+6;beam([x,top(x),z],[x1,top(x1),z],.23,.22);
   beam([x,6.32,z],[x,top(x),z],.17,.18);
   if((x/6)%2===0)beam([x,6.32,z],[x1,top(x1),z],.14,.17);
   else beam([x,top(x),z],[x1,6.32,z],.14,.17);
   for(const xx of [x,x1])box(aux,.43,.36,.045,xx,6.35,z+.12,steel,.008);
  }
  beam([24,6.32,z],[24,top(24),z],.17,.18);
  // A separate pedestrian safety rail makes the deck thickness legible.
  rod(aux,[-24,7.1,z], [24,7.1,z],.035,steel,8);
  rod(aux,[-24,6.64,z],[24,6.64,z],.022,steel,8);
  for(let x=-24;x<=24;x+=2)rod(aux,[x,6.2,z],[x,7.12,z],.025,steel,8);
 }
 for(let x=-24;x<=24;x+=6){
  iBeamZ(aux,6.3,.42,.2,x,5.96,bz,steel);
  beam([x,top(x),bz-2.95],[x,top(x),bz+2.95],.15,.17);
  if(x<24){beam([x,top(x),bz-2.95],[x+6,top(x+6),bz+2.95],.08,.1);beam([x,top(x),bz+2.95],[x+6,top(x+6),bz-2.95],.08,.1);}
 }

 // Three connected sawtooth bays form the old engine and joinery works.
 // Their north-facing glazed risers are real vertical bands under supported
 // sloping roofs, giving the yard an industrial roofline from every angle.
 const fx=-59,fz=-22,fw=22,fd=31,base=.65,eaves=5.55,bay=fw/3;
 box(aux,fw+.6,.3,fd+.6,fx,.8,fz,m.stone,.025);
 for(const side of [-1,1])box(aux,.4,eaves-base,fd,fx+side*fw/2,(eaves+base)/2,fz,m.brick,.012);
 for(const zz of [fz-fd/2,fz+fd/2]){
  box(aux,fw,4.85,.38,fx,3.075,zz,m.brick,.012);
  for(let xx=fx-fw/2+2;xx<fx+fw/2-1;xx+=4.3)window(xx,3.8,zz+(zz>fz?.2:-.2),2.65,1.2);
 }
 for(let n=0;n<3;n++){
  const xa=fx-fw/2+n*bay,xb=xa+bay;
  roofPlane([[xa,7.55,fz-fd/2-.3],[xa,7.55,fz+fd/2+.3],[xb,5.55,fz+fd/2+.3],[xb,5.55,fz-fd/2-.3]]);
  box(aux,.055,2.0,fd,xa,6.55,fz,m.dark,0);
  for(let zz=fz-fd/2+.4;zz<fz+fd/2;zz+=2.5)box(aux,.1,2.05,.075,xa+.04,6.55,zz,steel,.006);
  for(const y of [5.58,6.55,7.52])box(aux,.1,.075,fd,xa+.04,y,fz,steel,.006);
  for(const zz of [fz-fd/2,fz+fd/2]){
   const endGeometry=panelGeometry([[0,0],[bay,0],[0,2]]);
   if(zz<fz){const index=endGeometry.index;for(let i=0;i<index.count;i+=3){const value=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,value);}endGeometry.computeVertexNormals();}
   mesh(aux,endGeometry,m.brick,xa,5.55,zz,'Sawtooth factory closed end');
  }
  for(const zz of [fz-fd/2+1,fz,fz+fd/2-1])beam([xa,5.55,zz],[xb,5.55,zz],.12,.14);
 }
 // A low repair annex has a different ridge direction and a sheltered loading
 // face; the taller boilerhouse and flue rise from the same operational site.
 gableShed(-60,23,23,20,4.5,2.0);
 gableShed(-82,-48,16,24,7.1,2.45,{lantern:true});
 box(aux,7,7.2,8,-78,4.25,-27,m.brick,.025,'Boilerhouse chimney base');
 cylinder(aux,1.14,1.45,19,-78,17.1,-27,m.brick,24);
 for(const y of [10.1,15.0,20.5,26.45]){const r=1.45-(y-7.6)/19*.31+.045;cylinder(aux,r,r,.14,-78,y,-27,steel,24);}
 cylinder(aux,1.29,1.3,.42,-78,26.7,-27,m.cap,24);
 cylinder(aux,.94,.94,.045,-78,26.92,-27,m.dark,24);

 // East-bank bonded store, offset from the station so its roof does not turn
 // the passenger hall back into one long row of repeated façades.
 gableShed(59,-43,25,27,6.7,3.1,{lantern:true});
 gableShed(78,-72,18,19,4.25,1.6);
 // Riveted water tank on four braced legs, with an actual tank bottom,
 // maintenance platform, pipe, top cap and access ladder.
 const tx=73,tz=-7,tankBottom=12.2,tankTop=17.1;
 for(const dx of [-2.25,2.25])for(const dz of [-2.25,2.25]){
  box(aux,1.1,.5,1.1,tx+dx,.9,tz+dz,m.stone,.018);
  beam([tx+dx,1.14,tz+dz],[tx+dx*.72,tankBottom,tz+dz*.72],.23,.25);
 }
 for(const h of [2.5,6.6,10.7])for(const side of [-1,1]){
  beam([tx-2.18,h,tz+side*2.18],[tx+2.18,h+3.3,tz+side*2.18],.07,.08);
  beam([tx+2.18,h,tz+side*2.18],[tx-2.18,h+3.3,tz+side*2.18],.07,.08);
  beam([tx+side*2.18,h,tz-2.18],[tx+side*2.18,h+3.3,tz+2.18],.07,.08);
 }
 cylinder(aux,3.15,3.0,tankTop-tankBottom,tx,(tankTop+tankBottom)/2,tz,steel,32);
 for(const y of [tankBottom+.1,tankBottom+1.65,tankBottom+3.2,tankTop-.1]){
  const radius=3.0+(y-tankBottom)/(tankTop-tankBottom)*.15+.035;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.055,6,48),m.zinc);ring.rotation.x=Math.PI/2;ring.position.set(tx,y,tz);aux.add(ring);
 }
 const lid=cylinder(aux,.2,3.26,.85,tx,tankTop+.42,tz,m.zinc,32);lid.name='Water tower conical weather cap';
 box(aux,7.1,.16,6.8,tx,12.0,tz,steel,.008);
 for(const side of [-1,1]){
  rod(aux,[tx-3.5,13.05,tz+side*3.35],[tx+3.5,13.05,tz+side*3.35],.025,steel,8);
  for(const xx of [-3.4,0,3.4])rod(aux,[tx+xx,12.1,tz+side*3.35],[tx+xx,13.05,tz+side*3.35],.022,steel,8);
 }
 rod(aux,[tx+1.65,1.1,tz],[tx+1.65,14,tz],.11,m.zinc,12);
 for(const dx of [-.28,.28])rod(aux,[tx+dx,1.2,tz+3.55],[tx+dx,17.8,tz+3.55],.027,steel,8);
 for(let y=1.4;y<17.7;y+=.32)rod(aux,[tx-.28,y,tz+3.55],[tx+.28,y,tz+3.55],.022,steel,8);

 // The navigation channel continues beneath the bridge into a smaller port.
 // Staggered bankside freight sheds and raised embankments terminate the
 // empty apron horizon without placing a solid plug across live water.
 gableShed(-38,-147,24,33,6.4,2.9);
 gableShed(40,-171,27,25,8.0,2.6,{lantern:true});
 gableShed(-76,-186,30,25,6.2,2.0);
 gableShed(75,-205,22,29,5.8,2.2);
 for(const side of [-1,1]){
  box(aux,10,2.6,112,side*27.0,1.65,-199,m.stone,.04,'Far canal raised industrial embankment');
  for(let z=-251;z<-144;z+=12){box(aux,1.1,3.2,1.1,side*21.5,2.25,z,m.brick,.018);box(aux,1.3,.2,1.3,side*21.5,3.95,z,m.cap,.02);}
 }
 // Context behind the viewer remains authored when they turn around.
 gableShed(-57,88,25,25,5.5,2.7);
 gableShed(55,102,30,19,4.75,2.0);
 box(aux,20,3.2,20,-37,2.25,112,m.brick,.025);
 box(aux,21,.2,21,-37,3.95,112,m.zinc,.018);
 return {bridge:{centre:[0,6.08,-82],span:48,clearance:5.72},bounds:{x:[-94,91],z:[-253,123]},identity:'north-dock-industrial-context-v1'};
}
