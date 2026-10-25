// SPDX-License-Identifier: GPL-3.0-only
// Theme adapter: clustered tube worms and sponges. Geometry remains independent
// of mission IDs; groundHeight anchors each root to its caller's height field.
import * as THREE from 'three';

export function createVentLife({random,count=90,groundHeight=()=>0}) {
  const group=new THREE.Group(),positions=[],normals=[],colors=[],indices=[],crowns=[],mouths=[],collisionBoxes=[];
  const bone=new THREE.Color(0xc2bba6),base=new THREE.Color(0x63716a),tubeColor=new THREE.Color();
  const centers=Array.from({length:7},(_,i)=>{const a=i*2.399,r=3+Math.sqrt(i/6)*14;return [Math.cos(a)*r,Math.sin(a)*r];});
  const yAxis=new THREE.Vector3(0,1,0),xAxis=new THREE.Vector3(1,0,0),zAxis=new THREE.Vector3(0,0,1);
  for(let n=0;n<count;n++){
    const center=centers[n%centers.length],angle=random()*Math.PI*2,spread=Math.sqrt(random())*4.5;
    const x=center[0]+Math.cos(angle)*spread,z=center[1]+Math.sin(angle)*spread,root=groundHeight(x,z)-.22;
    const height=4.7+random()*8.3,radius=.24+random()*.23,leanX=(random()-.5)*3.4,leanZ=(random()-.5)*3.4;
    const curve=t=>new THREE.Vector3(x+leanX*t*t,root+height*t,z+leanZ*t*t+Math.sin(t*Math.PI)*.3);
    const first=positions.length/3,segments=9,sides=8;
    for(let ring=0;ring<=segments;ring++){
      const t=ring/segments,p=curve(t),tangent=new THREE.Vector3(2*leanX*t,height,2*leanZ*t+Math.cos(t*Math.PI)*Math.PI*.3).normalize();
      const normal=xAxis.clone().addScaledVector(tangent,-tangent.x).normalize(),binormal=new THREE.Vector3().crossVectors(tangent,normal);
      tubeColor.copy(base).lerp(bone,Math.min(1,t*3.5)*(.83+random()*.14));
      for(let side=0;side<=sides;side++){
        const a=side/sides*Math.PI*2,radial=normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal,Math.sin(a)),r=radius*(1-t*.20)*(1+.045*Math.sin(t*34+side));
        positions.push(p.x+radial.x*r,p.y+radial.y*r,p.z+radial.z*r);normals.push(radial.x,radial.y,radial.z);colors.push(tubeColor.r,tubeColor.g,tubeColor.b);
        if(ring<segments&&side<sides){const k=first+ring*(sides+1)+side;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
      }
    }
    // Rendering batches all tubes into one mesh. Collision retains each hard
    // tube's actual vertex bounds so the water between colonies stays open.
    const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity},end=positions.length/3;
    for(let vertex=first;vertex<end;vertex++)for(const [axis,offset]of [['x',0],['y',1],['z',2]]){const value=Math.fround(positions[vertex*3+offset]);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}
    for(const axis of ['x','y','z']){min[axis]-=.1;max[axis]+=.1;}
    collisionBoxes.push({min,max});
    const tip=curve(1),axis=new THREE.Vector3(2*leanX,height,2*leanZ-Math.PI*.3).normalize(),normal=xAxis.clone().addScaledVector(axis,-axis.x).normalize(),binormal=new THREE.Vector3().crossVectors(axis,normal);
    mouths.push({tip,axis,radius:radius*.8});
    for(let f=0;f<9;f++){
      const a=f/9*Math.PI*2+random()*.2,radial=normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal,Math.sin(a)),length=1.8+random()*1.35;
      const start=tip.clone().addScaledVector(axis,.12),end=start.clone().addScaledVector(axis,length*.85).addScaledVector(radial,length*.48),mid=start.clone().lerp(end,.5).addScaledVector(radial,-.18);
      crowns.push({a:start,b:mid,r:.09,color:0x641e2b},{a:mid,b:end,r:.065,color:0x963b3e});
      const across=new THREE.Vector3().crossVectors(axis,radial).normalize();
      for(let b=1;b<=4;b++){
        const t=b/5,p=start.clone().lerp(end,t),width=(1-t*.65)*.35;
        for(const side of [-1,1])crowns.push({a:p,b:p.clone().addScaledVector(across,width*side).addScaledVector(axis,.23),r:.035,color:b<3?0x87303a:0xb34c45});
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
  const tubes=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.94,metalness:0,side:THREE.DoubleSide}));tubes.userData.collisionBoxes=collisionBoxes;tubes.castShadow=true;tubes.receiveShadow=true;group.add(tubes);
  const fronds=new THREE.InstancedMesh(new THREE.CylinderGeometry(.38,1,1,4,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0}),crowns.length),transform=new THREE.Object3D(),direction=new THREE.Vector3();
  crowns.forEach((item,i)=>{direction.subVectors(item.b,item.a);transform.position.copy(item.a).add(item.b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(yAxis,direction.clone().normalize());transform.scale.set(item.r,direction.length(),item.r);transform.updateMatrix();fronds.setMatrixAt(i,transform.matrix);fronds.setColorAt(i,new THREE.Color(item.color));});fronds.userData.collision=false;fronds.castShadow=true;group.add(fronds);
  const lips=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.10,5,10),new THREE.MeshStandardMaterial({color:0xb2b39f,roughness:.96,metalness:0}),mouths.length);
  mouths.forEach((item,i)=>{transform.position.copy(item.tip);transform.quaternion.setFromUnitVectors(zAxis,item.axis);transform.scale.setScalar(item.radius);transform.updateMatrix();lips.setMatrixAt(i,transform.matrix);});group.add(lips);
  return group;
}

export function createSpongeColony({random,count=20,groundHeight=()=>0}) {
  const group=new THREE.Group(),transform=new THREE.Object3D();
  const profiles=[
    [[0,0],[1.3,0],[1.8,.5],[1.8,2],[2.1,4.3],[2.9,6.6],[2.9,7],[2.55,7.1],[2.4,6.4],[1.8,4.3],[1.2,2.1],[0,1.5]],
    [[0,0],[1.05,0],[1.4,.7],[1.4,4],[1.3,7],[1.1,9],[.78,9],[.94,6.8],[.95,4],[.6,1.5],[0,1.4]],
    [[0,0],[1.1,0],[1.5,1],[1.3,3],[1.9,6],[2.1,8.5],[1.8,9],[1.43,9.1],[1.7,8.3],[1.45,6],[.9,3],[.55,1.5],[0,1.3]],
  ];
  const shades=[0xa49b75,0x829680,0x9b9f7d],color=new THREE.Color(),interior=new THREE.Color(0x485f55);
  profiles.forEach((profile,type)=>{
    const geometry=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),18),p=geometry.attributes.position,uv=geometry.attributes.uv,colors=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),angle=Math.atan2(z,x),wave=1+.055*Math.sin(angle*7+y*1.1)+.025*Math.sin(angle*13-y);
      p.setXYZ(i,x*wave,y+Math.sin(angle*5)*.13*(y/9),z*wave);
      color.set(shades[type]);if(uv.getY(i)>.57)color.lerp(interior,.38);
      color.multiplyScalar(.92+.10*Math.sin(angle*9+y*3.7));colors.push(color.r,color.g,color.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.98,metalness:0});
    const amount=Math.floor((count+2-type)/3),mesh=new THREE.InstancedMesh(geometry,material,amount);
    for(let i=0;i<amount;i++){
      const index=i*3+type,angle=index*2.399,radius=Math.sqrt((index+.5)/count)*19,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius,scale=.65+random()*.72;
      transform.position.set(x,groundHeight(x,z)-.15,z);transform.rotation.set((random()-.5)*.16,random()*Math.PI*2,(random()-.5)*.13);transform.scale.set(scale,scale*(.82+random()*.38),scale);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    }
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  });
  return group;
}
