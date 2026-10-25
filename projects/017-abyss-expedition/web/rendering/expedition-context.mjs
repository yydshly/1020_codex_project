// SPDX-License-Identifier: GPL-3.0-only
// Authored 3D expedition context. Geometry is explanatory, not a surveyed scene
// or an engineering model of a named research vessel.
import * as THREE from 'three';
import {buildResearchVessel} from './research-vessel.mjs?v=4';
import {buildOceanWater} from './ocean-water.mjs?v=3';

function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.83,metalness:.05,...extra});
function rod(a,b,r,mat,parent){const d=new THREE.Vector3().subVectors(b,a),m=mesh(new THREE.CylinderGeometry(r,r,d.length(),7),mat,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}

export const createResearchVessel=buildResearchVessel;
export const createWaterColumn=buildOceanWater;

export function createSeabedContext({entities,toWorld,heightAt,random,texture}){
  const group=new THREE.Group(),rockLocations=[];
  // Small, anchored rubble only around work sites and fault shoulders; clear
  // corridors remain free, rather than scattering large repeated boulders.
  for(const entity of entities){const p=toWorld(entity.position),amount=entity.kind==='vent'?24:entity.kind==='ridge'?14:entity.kind==='coral'?10:6;
    for(let i=0;i<amount;i++){const a=random()*Math.PI*2,r=14+Math.sqrt(random())*(entity.kind==='vent'?42:30),x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;rockLocations.push({x,z,size:.35+Math.pow(random(),2)*1.5,angle:random()*6.28});}
  }
  const geometry=new THREE.IcosahedronGeometry(1,1),vertices=geometry.attributes.position;
  for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),r=1+.15*Math.sin(x*7+z*4)+.09*Math.sin(z*9-y*6);vertices.setXYZ(i,x*r,y*(.9+.1*Math.cos(x*5)),z*r);}geometry.computeVertexNormals();
  // instanceColor is already a surface reflectance. Multiplying another dark
  // base colour here made the former pebbles almost black in linear light.
  const mat=material(0xffffff,{roughness:1,metalness:0,envMapIntensity:.35}),rocks=new THREE.InstancedMesh(geometry,mat,rockLocations.length),transform=new THREE.Object3D(),color=new THREE.Color();
  rockLocations.forEach((rock,i)=>{transform.position.set(rock.x,heightAt(rock.x,rock.z)+rock.size*.12,rock.z);transform.rotation.set(random()*.35,rock.angle,random()*.25);transform.scale.set(rock.size*(.85+random()*.75),rock.size*(.31+random()*.26),rock.size*(.7+random()*.5));transform.updateMatrix();rocks.setMatrixAt(i,transform.matrix);color.set(0x607470).lerp(new THREE.Color(0x8b9382),random()*.72);rocks.setColorAt(i,color);});rocks.castShadow=true;rocks.receiveShadow=true;group.add(rocks);
  const count=160,positions=new Float32Array(count*3),seeds=[];
  for(let i=0;i<count;i++){const entity=entities[i%entities.length],p=toWorld(entity.position),a=random()*6.28,r=8+random()*70,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;positions.set([x,heightAt(x,z)+2+random()*13,z],i*3);seeds.push([random()*6.28,random()]);}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({map:texture,size:1.0,color:0xa3c3b9,transparent:true,opacity:.16,depthWrite:false,sizeAttenuation:true}));group.add(dust);
  const original=positions.slice();
  return {group,dust,update:time=>{const p=dustGeometry.attributes.position;for(let i=0;i<count;i++){const drift=Math.sin(time*.11+seeds[i][0]);p.setXYZ(i,original[i*3]+drift*(1+seeds[i][1]*3),original[i*3+1]+Math.sin(time*.27+seeds[i][0])*.6,original[i*3+2]+Math.cos(time*.09+seeds[i][0]));}p.needsUpdate=true;}};
}

export function createSamplingEquipment({type='water-sampler'}={}){
  const group=new THREE.Group(),alloy=material(0x98b4b5,{roughness:.42,metalness:.52}),dark=material(0x243e48,{metalness:.2}),yellow=material(0xbca04c,{roughness:.58,metalness:.15}),white=material(0xced5c2,{roughness:.67});
  if(type==='sediment-corer'){
    for(const x of [-6,6])for(const z of [-6,6]){rod(new THREE.Vector3(x,0,z),new THREE.Vector3(x*.6,12,z*.6),.45,alloy,group);mesh(new THREE.BoxGeometry(3,.8,3),dark,group,x,.3,z);}
    mesh(new THREE.BoxGeometry(13,1.1,13),yellow,group,0,11,0);mesh(new THREE.CylinderGeometry(1.65,1.65,10,14),material(0x688b87,{transparent:true,opacity:.55,roughness:.38}),group,0,5.5,0);mesh(new THREE.CylinderGeometry(1.3,1.3,3,12),material(0x66594c),group,0,1.8,0);mesh(new THREE.CylinderGeometry(2,2,1,14),dark,group,0,10.5,0);rod(new THREE.Vector3(0,12,0),new THREE.Vector3(0,17,0),.3,alloy,group);mesh(new THREE.TorusGeometry(1.3,.25,6,16),alloy,group,0,17,0);
  }else if(type==='current-meter'){
    for(let i=0;i<3;i++){const a=i*2.094;rod(new THREE.Vector3(Math.cos(a)*7,0,Math.sin(a)*7),new THREE.Vector3(0,9,0),.45,alloy,group);}
    rod(new THREE.Vector3(0,4,0),new THREE.Vector3(0,20,0),.4,alloy,group);mesh(new THREE.CylinderGeometry(1.7,1.7,5,12),yellow,group,0,15,0);const meter=mesh(new THREE.CylinderGeometry(2.2,2.2,1.5,12),dark,group,0,20,0);mesh(new THREE.SphereGeometry(.65,8,6),material(0x7fe1cc,{emissive:0x359d91,emissiveIntensity:.8}),group,0,21.4,0);
  }else{
    mesh(new THREE.CylinderGeometry(6.5,6.5,1,20),dark,group,0,.7,0);
    const caps=[];
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2,x=Math.cos(a)*4.4,z=Math.sin(a)*4.4,bottle=new THREE.Group();bottle.position.set(x,0,z);bottle.rotation.y=-a;group.add(bottle);
      // Both ends are open during flushing. The two hinged lids physically
      // close around the same water; this is an illustrative sampling action.
      mesh(new THREE.CylinderGeometry(.85,.85,9,12,1,true),white,bottle,0,5.5,0);
      for(const y of [1,10]){const rim=mesh(new THREE.TorusGeometry(.84,.12,5,14),alloy,bottle,0,y,0);rim.rotation.x=Math.PI/2;const pivot=new THREE.Group();pivot.position.set(.9,y,0);bottle.add(pivot);mesh(new THREE.CylinderGeometry(.95,.95,.32,12),dark,pivot,-.9,0,0);caps.push({pivot,sign:y>5?-1:1});}
      rod(new THREE.Vector3(x,1,z),new THREE.Vector3(x,12,z),.14,alloy,group);
    }
    for(const y of [1.5,11.5]){const ring=mesh(new THREE.TorusGeometry(6.3,.35,6,24),alloy,group,0,y,0);ring.rotation.x=Math.PI/2;}
    rod(new THREE.Vector3(0,1,0),new THREE.Vector3(0,16,0),.55,yellow,group);mesh(new THREE.TorusGeometry(1.3,.3,6,16),alloy,group,0,16,0);
    const trigger=mesh(new THREE.CylinderGeometry(.8,.8,2.7,12),white,group,0,14.2,0),line=rod(new THREE.Vector3(0,10,0),new THREE.Vector3(0,15,0),.16,alloy,group);
    group.userData.samplingType='water-sampler';group.userData.samplingCaps=caps;
    group.userData.setSamplingProgress=value=>{const p=Math.max(0,Math.min(1,value)),t=Math.max(0,Math.min(1,(p-.12)/.73)),ease=t*t*(3-2*t);for(const {pivot,sign} of caps)pivot.rotation.z=sign*(1-ease)*Math.PI*.62;trigger.position.y=14.2-Math.min(1,p/.35)*1.8;line.scale.y=1-Math.min(1,p/.35)*.15;group.userData.samplingProgress=p;};
    group.userData.setSamplingProgress(0);
  }
  return group;
}
