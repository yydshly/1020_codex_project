// Runtime rock-face ecology. Every root is an actual SDF-mesh vertex; every
// frond and vine uses real stem/leaf geometry. No cards, textures or opaque cores.
const REVISION='native-sdf-cliff-gardens-2-world-anchors';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y,z)=>{let h=Math.imul(Math.floor(x*31),374761393)^Math.imul(Math.floor(y*31),668265263)^Math.imul(Math.floor(z*31),2147483647);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
function random(seed){let s=(seed*4294967295)>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

export function createCliffGardens({THREE,pilot,terrain,sunDirection}={}){
  if(!THREE?.BufferGeometry||!pilot?.mesh?.geometry||!terrain?.sampleVegetation)throw new Error('Cliff gardens require the actual pilot mesh and vegetation sampler');
  const started=performance.now(),source=pilot.mesh.geometry;let p=source.attributes.position,n=source.attributes.normal;
  if(!p||!n||p.count!==n.count)throw new Error('Pilot surface positions/normals disagree');
  const usedVertices=source.index?new Uint8Array(p.count):null;
  if(usedVertices)for(const index of source.index.array)usedVertices[index]=1;
  pilot.mesh.updateWorldMatrix(true,false);
  const sourceWorld=pilot.mesh.matrixWorld.clone(),transformed=!sourceWorld.equals(new THREE.Matrix4());
  if(transformed){
    const positions=new Float32Array(p.count*3),normals=new Float32Array(n.count*3),normalMatrix=new THREE.Matrix3().getNormalMatrix(sourceWorld),v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(sourceWorld);positions.set(v.toArray(),i*3);
      v.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();normals.set(v.toArray(),i*3);
    }
    p=new THREE.BufferAttribute(positions,3);n=new THREE.BufferAttribute(normals,3);
  }
  const group=new THREE.Group();group.name='Rooted cliff ferns, shrubs and hanging vines';
  const UP=new THREE.Vector3(0,1,0),FORWARD=new THREE.Vector3(0,0,1),sun=new THREE.Vector3();
  if(sunDirection?.isVector3)sun.copy(sunDirection);else if(sunDirection?.length===3)sun.fromArray(sunDirection);else sun.set(-.5,.31,.8);sun.normalize();
  const readP=i=>new THREE.Vector3().fromBufferAttribute(p,i),readN=i=>new THREE.Vector3().fromBufferAttribute(n,i).normalize();
  const clip=pilot.clipSpec||pilot.stats?.clipping;
  const insidePilot=(x,z)=>!clip||Math.pow((x-clip.centre[0])/clip.ellipse[0],2)+Math.pow((z-clip.centre[1])/clip.ellipse[1],2)<.98;
  const cell=8,buckets=new Map(),bucketKey=(x,y,z)=>x+','+y+','+z;
  for(let i=0;i<p.count;i++){
    if(usedVertices&&!usedVertices[i])continue;
    const key=bucketKey(Math.floor(p.getX(i)/cell),Math.floor(p.getY(i)/cell),Math.floor(p.getZ(i)/cell));
    let list=buckets.get(key);if(!list)buckets.set(key,list=[]);list.push(i);
  }
  const candidates=[];
  for(let i=0;i<p.count;i++){
    if(usedVertices&&!usedVertices[i])continue;
    const ny=n.getY(i),x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(ny<.10||ny>.70||y<2.5||!insidePilot(x,z))continue;
    const cover=terrain.sampleVegetation(x,z)[0];if(!Number.isFinite(cover)||cover<=.60)continue;
    const attrs=terrain.sampleAttributes?.(x,z)||[1,0,0,0],wet=clamp(.35+.45*(attrs[3]||0)+.20*(1-(attrs[0]??1)),0,1);
    const probability=hash(x+71,y-13,z+31);
    candidates.push({i,cover,wet,score:probability/(.35+.65*wet)});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const anchors=[],occupied=new Map();
  function neighbours(key){const out=[];for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const a=occupied.get(bucketKey(key[0]+x,key[1]+y,key[2]+z));if(a)out.push(...a);}return out;}
  for(const c of candidates){
    const point=readP(c.i),key=[Math.floor(point.x/cell),Math.floor(point.y/cell),Math.floor(point.z/cell)];
    const rng=random(hash(point.x+19,point.y+5,point.z-11)),radius=2.0+2.5*rng()+1.0*c.wet;
    if(neighbours(key).some(a=>point.distanceToSquared(a.point)<Math.pow(4.8+.55*(radius+a.radius),2)))continue;
    const seed=hash(point.x,point.y,point.z),kind=seed<.38?'shrub':seed<.84?'fern':'hanging';
    const a={...c,point,normal:readN(c.i),radius,seed,kind};
    anchors.push(a);const name=bucketKey(...key);let list=occupied.get(name);if(!list)occupied.set(name,list=[]);list.push(a);
    if(anchors.length>=180)break;
  }
  function nearestSurface(point,referenceNormal,maxDistance=3.1){
    const key=[Math.floor(point.x/cell),Math.floor(point.y/cell),Math.floor(point.z/cell)];let best=-1,ds=maxDistance*maxDistance;
    for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
      const list=buckets.get(bucketKey(key[0]+x,key[1]+y,key[2]+z));if(!list)continue;
      for(const i of list){if(!insidePilot(p.getX(i),p.getZ(i))||n.getX(i)*referenceNormal.x+n.getY(i)*referenceNormal.y+n.getZ(i)*referenceNormal.z<.3)continue;
        const d=Math.pow(p.getX(i)-point.x,2)+Math.pow(p.getY(i)-point.y,2)+Math.pow(p.getZ(i)-point.z,2);if(d<ds){best=i;ds=d;}}
    }
    return best<0?null:{point:readP(best),normal:readN(best)};
  }
  const leafMatrices=[],leafColors=[],stemPositions=[],stemNormals=[],stemIndices=[];
  const dummy=new THREE.Object3D(),leafPalette=new THREE.Color(),MAX_LEAVES=24000,MAX_SEGMENTS=10000;
  let segments=0,vines=0;
  function leaf(position,direction,length,width,rng){
    if(leafMatrices.length>=MAX_LEAVES)return;
    dummy.position.copy(position);dummy.quaternion.setFromUnitVectors(FORWARD,direction.clone().normalize());
    dummy.rotateZ((rng()-.5)*.7);dummy.scale.set(width,1,length);dummy.updateMatrix();leafMatrices.push(dummy.matrix.clone());
    const lit=.74+.26*Math.max(0,direction.dot(sun));
    leafPalette.setRGB((.018+.027*rng())*lit,(.047+.060*rng())*lit,(.009+.022*rng())*lit);leafColors.push(leafPalette.clone());
  }
  function stem(a,b,radius){
    if(segments>=MAX_SEGMENTS||a.distanceToSquared(b)<.0025)return;
    const dir=b.clone().sub(a).normalize(),side=new THREE.Vector3().crossVectors(dir,UP);if(side.lengthSq()<.02)side.set(1,0,0);side.normalize();
    const across=new THREE.Vector3().crossVectors(dir,side).normalize(),base=stemPositions.length/3;
    for(const point of [a,b])for(let i=0;i<4;i++){
      const q=side.clone().multiplyScalar(Math.cos(i*Math.PI/2)).addScaledVector(across,Math.sin(i*Math.PI/2));
      stemPositions.push(point.x+q.x*radius,point.y+q.y*radius,point.z+q.z*radius);stemNormals.push(q.x,q.y,q.z);
    }
    for(let i=0;i<4;i++){const j=(i+1)%4;stemIndices.push(base+i,base+j,base+i+4,base+j,base+j+4,base+i+4);}segments++;
  }
  for(const a of anchors){
    const rng=random(a.seed),normal=a.normal,root=a.point.clone().addScaledVector(normal,.035);
    const up=UP.clone().addScaledVector(normal,-UP.dot(normal)).normalize(),side=new THREE.Vector3().crossVectors(up,normal).normalize();
    const count=(a.kind==='fern'?7:a.kind==='shrub'?5:4)+Math.floor(rng()*4),rotation=rng()*Math.PI*2;
    for(let f=0;f<count;f++){
      const angle=rotation+f/count*Math.PI*2;
      const axis=a.kind==='shrub'?up.clone().multiplyScalar(.35+.65*rng()).addScaledVector(side,(rng()*2-1)*.9).normalize():up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side,Math.sin(angle));
      const reach=a.radius*(.58+.34*rng())*(a.kind==='hanging'?.64:1);let previous=root;
      for(let j=1;j<=5;j++){
        const t=j/5,point=root.clone().addScaledVector(axis,reach*t).addScaledVector(normal,reach*(.19+.20*Math.sin(Math.PI*t))).addScaledVector(UP,reach*.23*t*(1-t));
        stem(previous,point,.022+.012*(1-t));
        const forward=point.clone().sub(previous).normalize(),lateral=new THREE.Vector3().crossVectors(forward,normal).normalize();
        for(const sign of [-1,1]){
          const dir=lateral.clone().multiplyScalar(sign).addScaledVector(forward,.48).addScaledVector(normal,.12+.14*rng()).normalize();
          leaf(point,dir,(.44+.44*rng())*(1-.38*t)*(a.kind==='shrub'?1.28:1),.9+.45*rng(),rng);
        }
        if(j===5)leaf(point,forward,.50+.33*rng(),1.1,rng);previous=point;
      }
    }
    if(rng()<(a.kind==='hanging'?.94:.34)){
      const down=up.clone().negate();let last={point:a.point.clone(),normal:normal.clone()};
      const length=3.4+4.5*rng();let planted=false;
      for(let d=1;d<=length;d+=.9){
        const target=a.point.clone().addScaledVector(down,d).addScaledVector(side,Math.sin(d*.75+a.seed*7)*.35);
        const next=nearestSurface(target,normal);if(!next)break;
        const from=last.point.clone().addScaledVector(last.normal,.10),to=next.point.clone().addScaledVector(next.normal,.10);
        if(from.distanceToSquared(to)<.12)continue;
        stem(from,to,.025);const tangent=to.clone().sub(from).normalize();
        for(const sign of [-1,1])leaf(to,side.clone().multiplyScalar(sign).addScaledVector(tangent,.4).addScaledVector(next.normal,.25).normalize(),.42+.28*rng(),.9,rng);
        last=next;planted=true;
      }
      if(planted)vines++;
    }
  }
  const leafGeometry=new THREE.BufferGeometry();
  leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.18,.045,.28,0,.10,.35,.18,.045,.28,-.13,.04,.65,0,.08,.72,.13,.04,.65,0,-.035,1],3));
  leafGeometry.setAttribute('color',new THREE.Float32BufferAttribute([.42,.50,.37,.82,.93,.72,1,1,.88,.90,1,.78,.85,.95,.71,1.03,1.10,.86,.84,.96,.72,.68,.81,.58],3));
  leafGeometry.setIndex([0,1,2,0,2,3,1,4,2,4,5,2,2,5,6,2,6,3,4,7,5,5,7,6]);leafGeometry.computeVertexNormals();
  const leafMaterial=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});
  leafMaterial.name='Actual curved cliff leaf blades / dark undersides';
  leafMaterial.onBeforeCompile=shader=>{const anchor='#include <color_fragment>';if(shader.fragmentShader.split(anchor).length!==2)throw new Error('Cliff leaf material boundary changed');shader.fragmentShader=shader.fragmentShader.replace(anchor,anchor+'\ndiffuseColor.rgb*=gl_FrontFacing?1.:.57;');};
  leafMaterial.customProgramCacheKey=()=>REVISION+'-leaf-undersides';
  const leaves=new THREE.InstancedMesh(leafGeometry,leafMaterial,leafMatrices.length);leaves.name='Rooted fern fronds and hanging vine leaves';
  for(let i=0;i<leafMatrices.length;i++){leaves.setMatrixAt(i,leafMatrices[i]);leaves.setColorAt(i,leafColors[i]);}
  leaves.instanceMatrix.needsUpdate=true;if(leaves.instanceColor)leaves.instanceColor.needsUpdate=true;
  leaves.castShadow=leaves.receiveShadow=true;leaves.computeBoundingBox();leaves.computeBoundingSphere();group.add(leaves);
  const stemGeometry=new THREE.BufferGeometry();stemGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stemPositions,3));stemGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(stemNormals,3));stemGeometry.setIndex(stemIndices);
  stemGeometry.computeBoundingBox();stemGeometry.computeBoundingSphere();
  const stemMaterial=new THREE.MeshLambertMaterial({color:0x253521});const stems=new THREE.Mesh(stemGeometry,stemMaterial);stems.name='Attached fern rachises and rock-following vine stems';stems.castShadow=stems.receiveShadow=true;group.add(stems);
  // All generated positions above are world metres.  Compensate the source
  // world matrix when attaching, so transformed pilots retain exact roots.
  // Later source transforms move its gardens together with the same mesh.
  pilot.mesh.add(group);group.matrixAutoUpdate=false;group.matrix.copy(sourceWorld).invert();group.updateMatrixWorld(true);
  let disposed=false;
  const kinds={fern:0,shrub:0,hanging:0};for(const a of anchors)kinds[a.kind]++;
  const range=values=>values.length?[Math.min(...values),Math.max(...values)]:null;
  const stats={revision:REVISION,experimental:true,artAccepted:false,externalAssets:0,eligibleVertices:candidates.length,rootedClumps:anchors.length,
    leaves:leafMatrices.length,vines,stemSegments:segments,triangles:leafMatrices.length*8+stemIndices.length/3,maxTriangles:272000,
    kinds,anchorCoverRange:range(anchors.map(a=>a.cover)),anchorNormalYRange:range(anchors.map(a=>a.normal.y)),anchorHeightRange:range(anchors.map(a=>a.point.y)),
    coordinateSpace:'World-space field samples and transformed SDF normals; child transform preserves exact mesh roots',sourceTransformApplied:transformed,
    drawCalls:2,materials:2,shadows:{cast:true,receive:true},
    rootMethod:'Exact SDF vertex, cover > .60 and outward-normal y .10–.70; no floating crown cores',
    vineMethod:'Each hanging segment snaps to a nearby same-facing SDF vertex; growth stops without a surface',milliseconds:performance.now()-started};
  if(stats.triangles>300000)throw new Error('Cliff garden triangle budget exceeded');
  return {group,stats,materials:[leafMaterial,stemMaterial],getStats:()=>({...stats,disposed}),
    getAnchors:()=>anchors.map(a=>({vertex:a.i,position:a.point.toArray(),normal:a.normal.toArray(),cover:a.cover,radius:a.radius,kind:a.kind})),
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();leafGeometry.dispose();leafMaterial.dispose();stemGeometry.dispose();stemMaterial.dispose();}};
}
