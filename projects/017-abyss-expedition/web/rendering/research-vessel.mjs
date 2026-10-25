// SPDX-License-Identifier: GPL-3.0-only
// An authored research vessel. Hull sections, working deck and deployment gear
// are geometry; this is not a textured photograph or a named ship replica.
import * as THREE from 'three';

const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.12,...extra});
function addMesh(parent,geometry,material,x=0,y=0,z=0){const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
function roundedFootprint(width,depth,radius){const x=-width/2,z=-depth/2,s=new THREE.Shape();s.moveTo(x+radius,z);s.lineTo(x+width-radius,z);s.quadraticCurveTo(x+width,z,x+width,z+radius);s.lineTo(x+width,z+depth-radius);s.quadraticCurveTo(x+width,z+depth,x+width-radius,z+depth);s.lineTo(x+radius,z+depth);s.quadraticCurveTo(x,z+depth,x,z+depth-radius);s.lineTo(x,z+radius);s.quadraticCurveTo(x,z,x+radius,z);return s;}
function batchStaticMeshes(group){
  const batches=new Map();
  for(const object of [...group.children]){
    if(!object.isMesh||object.isInstancedMesh||Array.isArray(object.material))continue;
    const key=object.material.uuid;if(!batches.has(key))batches.set(key,{material:object.material,items:[]});batches.get(key).items.push(object);
  }
  for(const {material,items} of batches.values()){
    if(items.length<2)continue;
    const geometries=[];let count=0;const hasColour=items.some(item=>Boolean(item.geometry.attributes.color));
    for(const object of items){object.updateMatrix();const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(object.matrix);geometries.push(geometry);count+=geometry.attributes.position.count;}
    const merged=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2],...(hasColour?[['color',3]]:[])]){
      const values=new Float32Array(count*size);let offset=0;
      for(const geometry of geometries){const attribute=geometry.attributes[name],length=geometry.attributes.position.count*size;if(attribute)values.set(attribute.array,offset);else if(name==='color')values.fill(1,offset,offset+length);offset+=length;}
      merged.setAttribute(name,new THREE.BufferAttribute(values,size));
    }
    merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,material);mesh.castShadow=!material.isMeshPhysicalMaterial;mesh.receiveShadow=true;group.add(mesh);
    for(const object of items){group.remove(object);object.geometry.dispose();}for(const geometry of geometries)geometry.dispose();
  }
}

export function buildResearchVessel({position=[0,430,0]}={}){
  const group=new THREE.Group();group.position.fromArray(position);
  const paint=mat(0xd8dfd9,{roughness:.55,metalness:.18}),deck=mat(0x647b7b,{roughness:.91,metalness:.06}),navy=mat(0x244c65,{roughness:.55,metalness:.3}),steel=mat(0xa9bebf,{roughness:.36,metalness:.65}),yellow=mat(0xc9a34a,{roughness:.48,metalness:.3}),dark=mat(0x173844,{roughness:.7,metalness:.2}),orange=mat(0xd6672f,{roughness:.58}),rubber=mat(0x102832,{roughness:.9,metalness:0});
  const glass=new THREE.MeshPhysicalMaterial({color:0x164c63,roughness:.10,metalness:.25,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.1,emissive:0x123b49,emissiveIntensity:.23});
  const pipes=new Map();
  const pipe=(a,b,r,material=paint)=>{if(!pipes.has(material))pipes.set(material,[]);pipes.get(material).push({a:new THREE.Vector3(...a),b:new THREE.Vector3(...b),r});};
  const box=(w,h,d,material,x,y,z)=>addMesh(group,new THREE.BoxGeometry(w,h,d),material,x,y,z);
  const house=(w,h,d,r,material,x,base,z)=>{const object=addMesh(group,new THREE.ExtrudeGeometry(roundedFootprint(w,d,r),{depth:h,bevelEnabled:true,bevelSize:.32,bevelThickness:.3,bevelSegments:2,curveSegments:5}),material,x,base+h,z);object.rotation.x=Math.PI/2;return object;};
  // A swept hull with a fine bow, flared topsides, a curved bilge and a proper
  // transom replaces the former flat extrusion. Vertex colours split the
  // anti-fouling bottom, boot stripe and painted topsides at the waterline.
  const sections=[[-52,13,-4.5,4],[-45,16,-8.5,4.8],[-25,17.7,-10.5,5.4],[0,18,-10,6],[23,16,-8.2,7],[43,11.2,-5,9],[55,5.5,-2.2,11],[62,.65,.1,12]];
  const profile=[[-1,1],[-.99,.6],[-.94,.1],[-.76,-.61],[-.40,-.94],[0,-1],[.40,-.94],[.76,-.61],[.94,.1],[.99,.6],[1,1]];
  const vertices=[],colours=[],indices=[],colour=new THREE.Color(),antifoul=new THREE.Color(0x6d343c),stripe=new THREE.Color(0x132f3d),topcoat=new THREE.Color(0x295b76);
  sections.forEach(([z,w,keel,top])=>profile.forEach(([nx,ny])=>{const y=keel+(top-keel)*(ny+1)/2;vertices.push(nx*w,y,z);colour.copy(y<-2.7?antifoul:y<.6?stripe:topcoat);colours.push(colour.r,colour.g,colour.b);}));
  const row=profile.length;
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<row-1;j++){const a=i*row+j,b=a+1,c=a+row,d=c+1;indices.push(a,b,c,b,d,c);}
  for(const [section,reverse] of [[0,true],[sections.length-1,false]]){const start=section*row;for(let j=1;j<row-1;j++)indices.push(start,reverse?start+j+1:start+j,reverse?start+j:start+j+1);}
  const hullGeometry=new THREE.BufferGeometry();hullGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hullGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));hullGeometry.setIndex(indices);hullGeometry.computeVertexNormals();addMesh(group,hullGeometry,mat(0xffffff,{vertexColors:true,roughness:.58,metalness:.27}));
  const deckVertices=[],deckIndices=[];
  sections.forEach(([z,w,keel,top])=>deckVertices.push(-w,top+.08,z,w,top+.08,z));
  for(let i=0;i<sections.length-1;i++){const a=i*2;deckIndices.push(a,a+2,a+1,a+1,a+2,a+3);}
  const deckGeometry=new THREE.BufferGeometry();deckGeometry.setAttribute('position',new THREE.Float32BufferAttribute(deckVertices,3));deckGeometry.setIndex(deckIndices);deckGeometry.computeVertexNormals();addMesh(group,deckGeometry,deck);
  // Bulwark sheer, deck-edge rails and stanchions follow the curved foredeck.
  for(const side of [-1,1])for(let i=0;i<sections.length-1;i++){
    const [za,wa,ka,ya]=sections[i],[zb,wb,kb,yb]=sections[i+1];pipe([side*wa,ya+.55,za],[side*wb,yb+.55,zb],.32,paint);pipe([side*wa,ya+3,za],[side*wb,yb+3,zb],.14,steel);pipe([side*wa,ya+1.8,za],[side*wb,yb+1.8,zb],.12,steel);
    const count=Math.ceil((zb-za)/6);for(let j=0;j<count;j++){const t=j/count,x=side*(wa+(wb-wa)*t),y=ya+(yb-ya)*t,z=za+(zb-za)*t;pipe([x,y+.6,z],[x,y+3,z],.13,steel);}
  }
  // Stepped accommodation decks and a wrap-around glazed wheelhouse.
  house(28,10,35,1.6,paint,0,6,12);house(25,7,26,1.3,paint,0,16.2,16);house(29,8,20,1.4,paint,0,23.4,23);house(33.5,1.1,24,1.5,paint,0,31.6,23);
  for(const x of [-10.5,-5.2,0,5.2,10.5]){const pane=box(4.45,4.45,.19,glass,x,28,33.15);pane.rotation.x=-.08;}
  for(const x of [-10.5,-5.2,0,5.2,10.5])box(4.45,4.45,.20,glass,x,28,12.82);
  for(const x of [-8.5,-3,3,8.5])box(3.8,2.7,.20,glass,x,20,2.75);
  for(const x of [-9,-4.5,4.5,9])box(3.15,2.5,.20,glass,x,12,-5.72);
  box(2.8,5.5,.22,paint,0,9.7,-5.8);box(1.7,1.8,.24,glass,0,11,-5.96);
  for(const side of [-1,1])for(const z of [15.7,21.4,27.1])box(.18,4.45,4.65,glass,side*14.65,28,z);
  for(const y of [12,20])for(const side of [-1,1])for(const z of [2,8,14,20,26])box(.16,1.75,2.4,glass,side*(y===12?14.2:12.7),y,z);
  for(const x of [-6.8,0,6.8])box(3.1,2.4,.17,glass,x,12,29.8);
  for(const side of [-1,1]){box(8,1.0,15,paint,side*18.2,24.2,21);pipe([side*22,24.8,13.8],[side*22,27.4,13.8],.15,steel);pipe([side*22,24.8,28],[side*22,27.4,28],.15,steel);pipe([side*22,27.4,13.8],[side*22,27.4,28],.14,steel);pipe([side*14.5,27.4,28],[side*22,27.4,28],.14,steel);}
  // Exterior doors, stair treads and vents give the white superstructure scale.
  for(const side of [-1,1]){box(.22,4.9,2.65,paint,side*14.35,9.4,-1.3);box(.25,1.2,1.4,glass,side*14.5,10.3,-1.3);for(let z=-1;z<6;z++)box(.26,.16,3,dark,side*14.45,7.4+z*.38,5.4+z*.43);for(let j=0;j<7;j++)box(.18,.18,4.6,dark,side*12.85,18.1+j*.37,4);}
  // Two work laboratories leave a central deck corridor to the stern winch.
  for(const side of [-1,1]){house(10,8.4,19,.5,mat(side<0?0x7f9d9b:0xb2beb4,{roughness:.78}),side*10,5.5,-10);for(let j=0;j<8;j++)box(.14,7.6,.15,steel,side*15.15,9.7,-18+j*2.3);box(6,5.8,.18,paint,side*10,9.2,-19.65);box(.14,5.8,.25,dark,side*10,9.2,-19.8);}
  // A-frame, pulley, winch drum and an articulated knuckle-boom crane.
  for(const x of [-12.8,12.8]){pipe([x,5.5,-45],[x,34,-42],1.0,yellow);pipe([x,5.5,-29],[x,34,-42],.85,yellow);box(3.5,2.5,5,dark,x,6.2,-43);}
  pipe([-12.8,34,-42],[12.8,34,-42],1.1,yellow);const pulley=addMesh(group,new THREE.TorusGeometry(2.2,.45,8,20),steel,0,32,-42);pulley.rotation.y=Math.PI/2;
  const winch=addMesh(group,new THREE.CylinderGeometry(4.6,4.6,12,24),dark,0,10,-30);winch.rotation.z=Math.PI/2;for(let x=-5.5;x<=5.5;x+=.85){const rib=addMesh(group,new THREE.TorusGeometry(4.7,.16,5,24),steel,x,10,-30);rib.rotation.y=Math.PI/2;}for(const x of [-7,7])box(1.1,10,11,yellow,x,9.5,-30);
  addMesh(group,new THREE.CylinderGeometry(2.2,2.5,7,16),yellow,15,9,-24);pipe([15,12,-24],[12,28,-28],1,yellow);pipe([12,28,-28],[28,23,-43],.85,yellow);pipe([15,13,-24],[16,24,-30],.4,steel);pipe([28,23,-43],[28,15,-43],.16,dark);addMesh(group,new THREE.TorusGeometry(.7,.15,6,12,Math.PI*1.6),steel,28,14.5,-43);
  // Bow fittings and anchor hawse holes.
  for(const x of [-7,7]){addMesh(group,new THREE.CylinderGeometry(1.8,2,2.7,14),navy,x,10.3,45);box(4.8,.8,4.8,steel,x,9,45);const hawse=addMesh(group,new THREE.CylinderGeometry(1.2,1.2,.8,12),dark,x<0?-11.6:11.6,4.7,43);hawse.rotation.z=Math.PI/2;pipe([x,10.6,45],[x*.7,11.1,53],.2,dark);}
  // A pair of cylindrical life rafts and an orange rescue tender are obvious
  // maritime cues without relying on painted texture details.
  for(const side of [-1,1])for(const z of [3,11]){const raft=addMesh(group,new THREE.CapsuleGeometry(1.8,5.6,4,12),paint,side*17,19.8,z);raft.rotation.x=Math.PI/2;for(const dz of [-1.6,1.6]){const strap=addMesh(group,new THREE.TorusGeometry(1.83,.16,5,14),dark,side*17,19.8,z+dz);}}
  const tender=addMesh(group,new THREE.CapsuleGeometry(2.3,9.7,5,14),orange,21,14,-5);tender.rotation.x=Math.PI/2;box(3.3,1.1,8,rubber,21,16.1,-5);for(const z of [-10,0]){pipe([16,17,z],[23.5,20,z],.32,steel);pipe([23.5,20,z],[23.5,15,z],.2,steel);}
  for(const side of [-1,1])for(const z of [7,23]){const ring=addMesh(group,new THREE.TorusGeometry(1.2,.32,8,24),orange,side*14.4,12,z);ring.rotation.y=Math.PI/2;for(let j=0;j<4;j++){const band=addMesh(group,new THREE.TorusGeometry(1.2,.35,6,6,Math.PI*.14),paint,side*14.5,12,z);band.rotation.y=Math.PI/2;band.rotateZ(j*Math.PI/2);}}
  // Mast, radar platforms, domes, aerials and navigation lights.
  pipe([0,32.7,19],[0,59,19],.42,steel);pipe([-10,48,19],[10,48,19],.3,steel);pipe([-7,54,19],[7,54,19],.25,steel);pipe([0,34,19],[5,44,19],.22,steel);pipe([0,34,19],[-5,44,19],.22,steel);
  const radar=new THREE.Group();radar.position.set(0,56,19);group.add(radar);addMesh(radar,new THREE.BoxGeometry(10,.7,1.7),paint);addMesh(radar,new THREE.CylinderGeometry(.9,.9,2,10),steel,0,-1,0);
  for(const x of [-8.5,8.5]){addMesh(group,new THREE.SphereGeometry(2.2,16,10),paint,x,35,24);pipe([x,32.7,24],[x,33.5,24],.7,steel);pipe([x,32.7,15],[x,44,15],.15,steel);}
  const glow=(color)=>mat(color,{emissive:color,emissiveIntensity:1.4,roughness:.4});addMesh(group,new THREE.SphereGeometry(.44,8,6),glow(0xe99878),-10,48,19);addMesh(group,new THREE.SphereGeometry(.44,8,6),glow(0x81c8a7),10,48,19);addMesh(group,new THREE.SphereGeometry(.55,8,6),glow(0xffe8b6),0,60,19);
  for(const x of [-11,11])addMesh(group,new THREE.SphereGeometry(.7,8,6),glow(0xffd39b),x,33,-42);
  // Instance all pipework by material: fine details remain cheap to draw.
  const transform=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  for(const [material,segments] of pipes){const instances=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,7),material,segments.length);segments.forEach((part,i)=>{direction.subVectors(part.b,part.a);transform.position.copy(part.a).add(part.b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(axis,direction.clone().normalize());transform.scale.set(part.r,direction.length(),part.r);transform.updateMatrix();instances.setMatrixAt(i,transform.matrix);});instances.castShadow=true;instances.receiveShadow=true;group.add(instances);}
  batchStaticMeshes(group);
  return {group,anchor:new THREE.Vector3(position[0],position[1]+31,position[2]-42),deployment:new THREE.Vector3(position[0]+44,position[1]+8,position[2]-82),update:time=>{radar.rotation.y=time*.28;}};
}
