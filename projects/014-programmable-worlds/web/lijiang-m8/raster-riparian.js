import { createHabitatSampler, ECOLOGY_REVISION } from './raster-habitat.js?v=20261026-m8';
// Real procedural wet-bank vegetation and a restrained forest-floor treatment.
// No images, facing cards, canopy planes or opaque crown cores are consumed.
const REVISION='m3-habitat-woodland-communities-3';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const fract=x=>x-Math.floor(x);
function hash(x,z){let h=Math.imul(Math.floor(x),374761393)^Math.imul(Math.floor(z),668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x,z){const a=Math.floor(x),b=Math.floor(z),u=smooth(0,1,fract(x)),v=smooth(0,1,fract(z));return mix(mix(hash(a,b),hash(a+1,b),u),mix(hash(a,b+1),hash(a+1,b+1),u),v);}
function random(seed){let s=seed>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

function grassGeometry(T){
  const p=[],colors=[],indices=[],levels=[0,.22,.46,.73,1];
  for(const t of levels){const width=.5*Math.max(.015,Math.sin(Math.PI*(t*.88+.10)))*(1-.55*t),bend=.28*t*t,fold=.025*Math.sin(Math.PI*t);
    p.push(-width,t,bend-fold,0,t,bend+fold,width,t,bend-fold);
    const tone=.48+.42*t;for(let j=0;j<3;j++)colors.push(tone*.92,tone,tone*.83);
  }
  for(let j=0;j<4;j++){const a=j*3,b=a+3;indices.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function fernGeometry(T){
  const p=[],colors=[],indices=[];
  function vertex(x,y,z,tone){const i=p.length/3;p.push(x,y,z);colors.push(tone*.91,tone,tone*.79);return i;}
  const arch=t=>.33*Math.sin(Math.PI*t)-.09*t*t;
  const rootA=vertex(-.008,0,0,.38),rootB=vertex(.008,0,0,.38),
    rootC=vertex(-.008,arch(.10),.10,.52),rootD=vertex(.008,arch(.10),.10,.52);
  indices.push(rootA,rootC,rootB,rootB,rootC,rootD);
  for(let i=0;i<8;i++){
    const t=.10+i*.105,y=arch(t),width=(.24*(1-t)+.025)*Math.sin(Math.PI*(t*.8+.1));
    for(const sign of [-1,1]){
      const a=vertex(0,y,t,.52),b=vertex(sign*width*.55,y+.018,t+.01,.82),c=vertex(sign*width,y+.010,t+.10,.90),d=vertex(sign*width*.62,y-.01,t+.13,.72),r=vertex(sign*width*.55,y+.055,t+.065,1.02);
      const faces=[a,b,r,a,r,d,b,c,r,r,c,d];if(sign>0)for(let j=0;j<faces.length;j+=3)[faces[j+1],faces[j+2]]=[faces[j+2],faces[j+1]];indices.push(...faces);
    }
    const next=t+.105,a=vertex(-.008,y,t,.45),b=vertex(.008,y,t,.45),c=vertex(-.006,arch(next),next,.62),d=vertex(.006,arch(next),next,.62);indices.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function woodlandGrassGeometry(T){
  const p=[],c=[],indices=[];
  for(const t of [0,.5,1])for(let side=-1;side<=1;side++){
    const width=t===1?0:.48*Math.sin(Math.PI*(t*.86+.08));
    p.push(side*width,t,.29*t*t+(1-Math.abs(side))*.045*Math.sin(Math.PI*t));
    const tone=.40+.58*t;c.push(tone*.90,tone,tone*.75);
  }
  for(let row=0;row<2;row++)for(let side=0;side<2;side++){
    const a=row*3+side,b=a+3;
    for(const tri of [[a,b,a+1],[a+1,b,b+1]]){
      const [i,j,k]=tri.map(v=>v*3),ax=p[j]-p[i],ay=p[j+1]-p[i+1],az=p[j+2]-p[i+2],bx=p[k]-p[i],by=p[k+1]-p[i+1],bz=p[k+2]-p[i+2];
      if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>1e-10)indices.push(...tri);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();
  for(let i=0;i<g.attributes.normal.count;i++)if(g.attributes.normal.getX(i)**2+g.attributes.normal.getY(i)**2+g.attributes.normal.getZ(i)**2<1e-8)g.attributes.normal.setXYZ(i,0,0,1);
  g.computeBoundingSphere();return g;
}

function woodlandLitterGeometry(T){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,-.5,-.28,.035,-.02,0,.075,.5,.23,.015,0],3));
  g.setAttribute('color',new T.Float32BufferAttribute([.65,.60,.48,.90,.82,.64,1.,.92,.77,.78,.70,.52],3));
  g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

function createWoodlandFloor({THREE,terrain,riverCenter,riverWidth,trees,grassMaterial,fernMaterial,fernG}){
  const group=new THREE.Group();group.name='Streamed rooted woodland floor';
  const size=16,maxTiles=24,tiles=new Map(),treeIndex=new Map(),up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D(),colour=new THREE.Color();
  const cameraPosition=new THREE.Vector3(),cameraUniform={value:cameraPosition},habitat=createHabitatSampler(terrain);
  const grassG=woodlandGrassGeometry(THREE),litterG=woodlandLitterGeometry(THREE);
  const materials=[grassMaterial.clone(),fernMaterial.clone(),new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide})];
  for(const [i,m]of materials.entries()){
    m.name=['Woodland creeping grasses','Woodland fern colonies','Curled fallen woodland leaves'][i];
    m.alphaToCoverage=false;m.transparent=false;
    m.onBeforeCompile=shader=>{
      shader.uniforms.uLiFloorCamera=cameraUniform;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec3 uLiFloorCamera;varying float vLiFloorKey;varying float vLiFloorDistance;').replace('#include <project_vertex>',`#include <project_vertex>
        vec4 liFloorPosition=vec4(0.,0.,0.,1.);
        #ifdef USE_INSTANCING
        liFloorPosition=instanceMatrix*liFloorPosition;
        #endif
        vec3 liFloorAnchor=(modelMatrix*liFloorPosition).xyz;
        vLiFloorKey=fract(sin(dot(liFloorAnchor.xz,vec2(12.9898,78.233)))*43758.5453);
        vLiFloorDistance=distance(liFloorAnchor.xz,uLiFloorCamera.xz);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying float vLiFloorKey;varying float vLiFloorDistance;`)
        .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
          float liFloorFade=1.-smoothstep(16.,30.,vLiFloorDistance);
          if(vLiFloorKey>=liFloorFade)discard;`);
    };
    m.customProgramCacheKey=()=>`m3-woodland-stable-plant-fade-3-${i}`;
  }
  for(const tree of trees){
    const x=Array.isArray(tree)?tree[0]:(tree.canopyX??tree.x),z=Array.isArray(tree)?tree[2]:(tree.canopyZ??tree.z),
      r=Array.isArray(tree)?tree[3]:(tree.canopyRadius??tree.radius);
    if(!Number.isFinite(x+z)||!(r>1.5))continue;
    const key=Math.floor(x/32)+','+Math.floor(z/32);if(!treeIndex.has(key))treeIndex.set(key,[]);treeIndex.get(key).push({x,z,r});
  }
  const stats={generation:0,pending:0,tiles:0,meshes:0,triangles:0,grassBlades:0,fernFronds:0,litterLeaves:0,fadeStart:16,fadeEnd:30,maxTiles,tileSize:size,habitatRevision:ECOLOGY_REVISION,communities:['gap-grasses','moist-shade-ferns','closed-canopy-humus'],buildMilliseconds:0,disposed:false};
  function canopyAt(x,z){
    const ix=Math.floor(x/32),iz=Math.floor(z/32);let cover=0;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const t of treeIndex.get((ix+dx)+','+(iz+dz))||[]){
      const d=Math.hypot(x-t.x,z-t.z)/Math.max(1,t.r*1.3);cover=Math.max(cover,Math.exp(-d*d*.6));
    }
    return cover;
  }
  function buildTile(ix,iz){
    const started=performance.now(),rng=random((Math.imul(ix,73856093)^Math.imul(iz,19349663)^0x321f2873)>>>0);
    const x0=ix*size,z0=iz*size,node=new THREE.Group();node.position.set(x0,0,z0);node.name=`Woodland floor ${ix},${iz}`;
    const grass=[],ferns=[],litter=[],cells=[];
    for(let z=.3;z<size;z+=.76)for(let x=.3;x<size;x+=.76)cells.push([x+(rng()-.5)*.67,z+(rng()-.5)*.67]);
    for(let i=cells.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
    const add=(records,x,y,z,normal,yaw,width,height,depth,tone)=>{
      dummy.position.set(x-x0,y,z-z0);dummy.quaternion.setFromUnitVectors(up,normal);dummy.rotateY(yaw);dummy.scale.set(width,height,depth);dummy.updateMatrix();records.push({matrix:dummy.matrix.clone(),tone});
    };
    for(const [xx,zz]of cells){
      if(grass.length>=1100&&ferns.length>=64)break;
      const x=x0+xx,z=z0+zz,y=terrain.sampleHeight(x,z),bank=Math.abs(x-riverCenter(z))-riverWidth(z)*.5;
      if(!Number.isFinite(y)||y<.7||y>78||bank<3)continue;
      const e=.75,gx=(terrain.sampleHeight(x+e,z)-terrain.sampleHeight(x-e,z))/(2*e),gz=(terrain.sampleHeight(x,z+e)-terrain.sampleHeight(x,z-e))/(2*e),slope=Math.hypot(gx,gz);
      if(!Number.isFinite(slope)||slope>.62)continue;
      const canopy=canopyAt(x,z),site=habitat.sample(x,z),
        moisture=clamp(.65*site.moisture+.22*canopy+.13*noise(x/19+17,z/19-9),0,1);
      // Strong colony boundaries redistribute the same blade budget. Dense
      // connected mats occupy part of the soil; other parts remain quiet.
      // A low baseline probability everywhere produced evenly dotted lawn.
      const patch=smooth(.43,.66,.70*noise(x/7.7+12,z/7.7-19)+.30*noise(x/2.3-8,z/2.3+21));
      const fernPatch=smooth(.42,.67,.72*noise(x/6.1-17,z/6.1+31)+.28*noise(x/2.1+3,z/2.1));
      const gap=.27+.73*(1-canopy),shade=.22+.78*canopy;
      if(rng()>.015+.97*Math.max(patch*gap,fernPatch*shade*smooth(.33,.68,moisture)))continue;
      const normal=new THREE.Vector3(-gx,1,-gz).normalize(),grassUp=up.clone().lerp(normal,.58).normalize();
      const fernChance=smooth(.34,.69,moisture)*shade*fernPatch;
      if(rng()<fernChance/Math.max(.08,fernChance+patch*gap)&&ferns.length<64){
        const fronds=4+Math.floor(rng()*4),phase=rng()*Math.PI*2,scale=.66+.66*rng();
        for(let j=0;j<fronds&&ferns.length<64;j++)add(ferns,x,y-.015,z,grassUp,phase+j/fronds*Math.PI*2+(rng()-.5)*.26,scale*(.84+.28*rng()),scale,scale,.78+.28*rng());
      }else if(grass.length<1100&&rng()<.025+.97*patch*gap){
        const blades=14+Math.floor(rng()*12),height=.10+.25*patch+.12*rng()+site.disturbance*.10;
        for(let j=0;j<blades&&grass.length<1100;j++){
          const angle=rng()*Math.PI*2,r=(.17+.35*patch)*Math.sqrt(rng()),bx=x+Math.cos(angle)*r,bz=z+Math.sin(angle)*r,by=terrain.sampleHeight(bx,bz);
          add(grass,bx,by-.018,bz,grassUp,angle,.040+.065*rng(),height*(.68+.57*rng()),height*(.80+.3*rng()),.75+.30*rng());
        }
      }
    }
    for(let i=0;i<1200;i++){
      const x=x0+rng()*size,z=z0+rng()*size,y=terrain.sampleHeight(x,z),bank=Math.abs(x-riverCenter(z))-riverWidth(z)*.5;
      const site=habitat.sample(x,z),canopy=canopyAt(x,z);
      const pile=.64*noise(x/4.3+27,z/4.3-13)+.36*noise(x/1.8-11,z/1.8+9);
      const leafCarpet=clamp((.18+.82*canopy)*smooth(.27,.68,pile+.12*site.maturity)-.16*site.disturbance,0,.95);
      if(!Number.isFinite(y)||y<.7||y>78||bank<5||rng()>leafCarpet)continue;
      const e=.25,gx=(terrain.sampleHeight(x+e,z)-terrain.sampleHeight(x-e,z))/(2*e),gz=(terrain.sampleHeight(x,z+e)-terrain.sampleHeight(x,z-e))/(2*e);
      if(!Number.isFinite(gx+gz)||Math.hypot(gx,gz)>.6)continue;
      const normal=new THREE.Vector3(-gx,1,-gz).normalize(),scale=.12+.14*rng();
      add(litter,x,y+.006,z,normal,rng()*Math.PI*2,scale*(.7+.45*rng()),scale,scale,.72+.40*rng());
    }
    let triangles=0;
    for(const [records,geometry,material,name]of [[grass,grassG,materials[0],'Rooted low grass tufts'],[ferns,fernG,materials[1],'Moist shade fern colonies'],[litter,litterG,materials[2],'Curled humus leaves']]){
      if(!records.length)continue;const mesh=new THREE.InstancedMesh(geometry,material,records.length);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;
      for(let i=0;i<records.length;i++){
        mesh.setMatrixAt(i,records[i].matrix);const tone=records[i].tone;
        if(name.includes('grass'))colour.setRGB(.058*tone,.118*tone,.035*tone);
        else if(name.includes('fern'))colour.setRGB(.070*tone,.135*tone,.043*tone);
        else colour.setRGB(.14*tone,.098*tone,.041*tone);
        mesh.setColorAt(i,colour);
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();node.add(mesh);triangles+=records.length*geometry.index.count/3;
    }
    group.add(node);const tile={node,triangles,grass:grass.length,ferns:ferns.length,litter:litter.length};
    tiles.set(ix+','+iz,tile);stats.generation++;stats.tiles++;stats.meshes+=node.children.length;stats.triangles+=triangles;
    stats.grassBlades+=grass.length;stats.fernFronds+=ferns.length;stats.litterLeaves+=litter.length;stats.buildMilliseconds+=performance.now()-started;
    if(stats.triangles>348000)throw new Error('Near woodland floor exceeded its 348k triangle budget');
  }
  function release(key){
    const t=tiles.get(key);if(!t)return;for(const mesh of t.node.children)mesh.dispose();t.node.removeFromParent();tiles.delete(key);
    stats.generation++;stats.tiles--;stats.meshes-=t.node.children.length;stats.triangles-=t.triangles;stats.grassBlades-=t.grass;stats.fernFronds-=t.ferns;stats.litterLeaves-=t.litter;
  }
  function update(camera,{maxBuilds=2}={}){
    if(stats.disposed||!camera?.position)return {...stats};camera.getWorldPosition(cameraPosition);
    const ix=Math.floor(cameraPosition.x/size),iz=Math.floor(cameraPosition.z/size),candidates=[];
    for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){
      const x=(ix+dx+.5)*size,z=(iz+dz+.5)*size,d=Math.hypot(x-cameraPosition.x,z-cameraPosition.z);
      if(d>70)continue;const y=terrain.sampleHeight(x,z),bank=Math.abs(x-riverCenter(z))-riverWidth(z)*.5;
      if(!Number.isFinite(y)||y<.7||y>78||bank<0)continue;
      candidates.push({ix:ix+dx,iz:iz+dz,key:(ix+dx)+','+(iz+dz),distance:d});
    }
    candidates.sort((a,b)=>a.distance-b.distance);candidates.length=Math.min(candidates.length,maxTiles);
    const wanted=new Set(candidates.map(c=>c.key));for(const key of tiles.keys())if(!wanted.has(key))release(key);
    const pending=candidates.filter(c=>!tiles.has(c.key)),count=Math.min(pending.length,maxBuilds);
    for(let i=0;i<count;i++)buildTile(pending[i].ix,pending[i].iz);stats.pending=pending.length-count;
    return {...stats};
  }
  return {group,materials,update,prewarm:camera=>update(camera,{maxBuilds:Infinity}),getStats:()=>({...stats}),
    dispose(){if(stats.disposed)return;for(const key of [...tiles.keys()])release(key);stats.disposed=true;stats.pending=0;group.removeFromParent();grassG.dispose();litterG.dispose();materials.forEach(m=>m.dispose());treeIndex.clear();habitat.clear();}};
}

export function createRiparianEcology({THREE,terrain,riverCenter,riverWidth,trees=[]}={}){
  if(!THREE?.InstancedMesh||!terrain?.sampleHeight||typeof riverCenter!=='function'||typeof riverWidth!=='function')throw new Error('Riparian ecology requires actual terrain and river functions');
  const started=performance.now(),group=new THREE.Group();group.name='Wet riparian sedges and interrupted fern understory';
  const rng=random(20261025),grass=[],ferns=[],roots=[],up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D();
  // Reallocate, rather than expand, the former ~400k-triangle budget. Native
  // bushes provide the low shrub layer; these are true sedge blades and fronds.
  const MAX_GRASS=5000,MAX_FERNS=870;let rejectedSlope=0,rejectedWater=0;
  function plant(x,z,inland,patch,woodland=false){
    const grassLimit=inland?MAX_GRASS:3700,fernLimit=inland?MAX_FERNS:350;
    if(grass.length>=grassLimit&&ferns.length>=fernLimit)return;
    const y=terrain.sampleHeight(x,z);if(!Number.isFinite(y)||y<=.15){rejectedWater++;return;}
    const e=1.1,gx=(terrain.sampleHeight(x+e,z)-terrain.sampleHeight(x-e,z))/(2*e),gz=(terrain.sampleHeight(x,z+e)-terrain.sampleHeight(x,z-e))/(2*e),slope=Math.hypot(gx,gz);
    if(!Number.isFinite(slope)||slope>.48){rejectedSlope++;return;}
    const normal=new THREE.Vector3(-gx,1,-gz).normalize(),lean=up.clone().lerp(normal,.38).normalize();
    const fern=(inland?rng()<.62:rng()<.17)&&ferns.length<fernLimit||grass.length>=grassLimit&&ferns.length<fernLimit;
    if(!fern&&grass.length>=grassLimit)return;
    roots.push({x,y,z,inland,patch});
    if(fern&&ferns.length<fernLimit){
      const count=4+Math.floor(rng()*4),phase=rng()*Math.PI*2,
        scale=woodland?1.05+1.2*rng():.72+.82*rng();
      for(let i=0;i<count&&ferns.length<fernLimit;i++){
        dummy.position.set(x,y-.025,z);dummy.quaternion.setFromUnitVectors(up,lean);dummy.rotateY(phase+i/count*Math.PI*2+(rng()-.5)*.4);
        dummy.scale.set(scale*(.80+.35*rng()),scale,scale*(.80+.35*rng()));dummy.updateMatrix();ferns.push({matrix:dummy.matrix.clone(),tone:.83+.23*rng()});
      }
    }else{
      const count=5+Math.floor(rng()*6),height=(inland?.29:.48)+rng()*(inland?.43:.95);
      for(let i=0;i<count&&grass.length<grassLimit;i++){
        const a=rng()*Math.PI*2,r=.05+.12*rng(),xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r,bladeY=terrain.sampleHeight(xx,zz);
        if(!Number.isFinite(bladeY)||bladeY<=.15)continue;dummy.position.set(xx,bladeY-.025,zz);
        dummy.quaternion.setFromUnitVectors(up,lean);dummy.rotateY(a);dummy.scale.set(.045+.065*rng(),height*(.65+.5*rng()),height);dummy.updateMatrix();grass.push({matrix:dummy.matrix.clone(),tone:.80+.27*rng()});
      }
    }
  }
  for(let z=-2280;z<2180;z+=3.8)for(const side of [-1,1]){
    const zz=z+(rng()-.5)*3.2,half=riverWidth(zz)*.5,center=riverCenter(zz);
    const broad=.64*noise(zz/57+side*13,side*3.1)+.36*noise(zz/24-11,side*7.3),patch=smooth(.30,.69,broad);
    if(rng()>patch*.94)continue;
    const count=1+Math.floor(patch*3);
    for(let j=0;j<count;j++){const d=1+13*rng(),x=center+side*(half+d);plant(x,zz+(rng()-.5)*2.8,false,patch);}
  }
  for(let z=-2240;z<2150;z+=7.6)for(const side of [-1,1]){
    const zz=z+(rng()-.5)*5,patch=smooth(.42,.74,.55*noise(zz/43+19,side*4.7)+.45*noise(zz/21,side*6.1));
    if(rng()>patch*.76)continue;
    plant(riverCenter(zz)+side*(riverWidth(zz)*.5+10+25*rng()),zz,true,patch);
  }
  // Woodland colonies follow mature tree roots and the same long moisture
  // patches as the bank. They are not a second regular band parallel to water.
  // Rank the 45s route's close banks first, where individual fronds resolve;
  // the native low shrub population supplies the wider forest-floor coverage.
  const woodlandCandidates=[];
  for(const tree of trees){
    const x=Array.isArray(tree)?tree[0]:tree.x,z=Array.isArray(tree)?tree[2]:tree.z;
    const radius=Array.isArray(tree)?tree[3]:tree.radius;
    if(!Number.isFinite(x)||!Number.isFinite(z)||!(radius>2.5))continue;
    const d=Math.abs(x-riverCenter(z))-riverWidth(z)*.5;
    if(d<18||d>230)continue;
    const y=terrain.sampleHeight(x,z);if(!Number.isFinite(y)||y<1||y>70)continue;
    const patch=smooth(.32,.70,.63*noise(x/54+7,z/54)+.37*noise(x/23,z/23-11));
    if(hash(x*17,z*19)>patch*.62)continue;
    const routeDistance=Math.max(0,650-z,z-1400),rank=routeDistance*.001+hash(x*11,z*13);
    woodlandCandidates.push({x,z,radius,patch,rank});
  }
  woodlandCandidates.sort((a,b)=>a.rank-b.rank);
  const woodlandStart=roots.length;
  for(const tree of woodlandCandidates){
    if(ferns.length>=MAX_FERNS&&grass.length>=MAX_GRASS)break;
    const count=2+Math.floor(tree.patch*3),phase=rng()*Math.PI*2;
    for(let i=0;i<count;i++){
      const a=phase+i*2.39996,r=tree.radius*(.35+.75*rng());
      plant(tree.x+Math.cos(a)*r,tree.z+Math.sin(a)*r,true,tree.patch,true);
    }
  }
  const grassG=grassGeometry(THREE),fernG=fernGeometry(THREE);
  const grassM=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}),fernM=grassM.clone();
  grassM.name='Low saturation wet-bank sedge blades';fernM.name='Curved understory fern pinnae';
  const meshes=[],color=new THREE.Color();
  for(const [records,g,m,name]of [[grass,grassG,grassM,'Interrupted wet sedge patches'],[ferns,fernG,fernM,'Rooted woodland-margin ferns']]){
    const mesh=new THREE.InstancedMesh(g,m,records.length);mesh.name=name;
    for(let i=0;i<records.length;i++){mesh.setMatrixAt(i,records[i].matrix);const tone=records[i].tone;color.setRGB(.078*tone,.127*tone,.045*tone);mesh.setColorAt(i,color);}
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=name.includes('ferns');mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
  }
  const triangles=grass.length*grassG.index.count/3+ferns.length*fernG.index.count/3;
  if(triangles>152000)throw new Error('Global riparian ecology exceeded its reserved 152k triangle budget');
  const floor=createWoodlandFloor({THREE,terrain,riverCenter,riverWidth,trees,grassMaterial:grassM,fernMaterial:fernM,fernG});group.add(floor.group);
  const stats={revision:REVISION,experimental:true,artAccepted:false,externalAssets:0,rootedClumps:roots.length,grassBlades:grass.length,fernFronds:ferns.length,
    inlandClumps:roots.filter(r=>r.inland).length,woodlandClumps:roots.length-woodlandStart,
    woodlandCandidates:woodlandCandidates.length,triangles,drawCalls:2,rejectedSlope,rejectedWater,rootHeightRange:roots.length?[Math.min(...roots.map(r=>r.y)),Math.max(...roots.map(r=>r.y))]:null,
    distribution:'Flow/wet-bank sedges, canopy-driven humus, moist shade fern colonies and open-gap grasses; stable 16m cells with 16–30m fade',milliseconds:performance.now()-started};
  let disposed=false;
  const getStats=()=>{const near=floor.getStats();return {...stats,disposed,generation:near.generation+1,pending:near.pending,
    triangles:disposed?0:triangles+near.triangles,drawCalls:disposed?0:2+near.meshes,nearFloor:near,triangleBudget:500000};};
  return {group,materials:[grassM,fernM,...floor.materials],getStats,stats,
    update:(camera,options)=>floor.update(camera,options),prewarm:camera=>floor.prewarm(camera),
    dispose(){if(disposed)return;disposed=true;floor.dispose();group.removeFromParent();grassG.dispose();fernG.dispose();grassM.dispose();fernM.dispose();},
  };
}

/** Apply after any source color/clip/grade hooks; later air hooks can still wrap. */
export function applyRiparianGround(material){
  if(!material)throw new Error('Pass the riparian ground material');
  if(material.userData.liRiparianGround)return material;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey?.call(material)||material.type;
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    function insert(stage,anchor,value){if(shader[stage].split(anchor).length!==2)throw new Error('Riparian ground shader boundary changed: '+anchor);shader[stage]=shader[stage].replace(anchor,value);}
    insert('vertexShader','#include <common>','#include <common>\nvarying vec3 vLiRiparianWorld;');
    insert('vertexShader','#include <project_vertex>',`#include <project_vertex>
      vec4 liRiparianPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      liRiparianPosition=instanceMatrix*liRiparianPosition;
      #endif
      vLiRiparianWorld=(modelMatrix*liRiparianPosition).xyz;`);
    insert('fragmentShader','#include <common>',`#include <common>
      varying vec3 vLiRiparianWorld;
      float liRiparianHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float liRiparianNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(liRiparianHash(i),liRiparianHash(i+vec2(1,0)),f.x),mix(liRiparianHash(i+vec2(0,1)),liRiparianHash(i+vec2(1,1)),f.x),f.y);}
    `);
    // The native-radiance hook assigns RGB after color_fragment.  Insert at
    // the next stage so that assignment cannot overwrite the wet-floor tint.
    insert('fragmentShader','#include <alphamap_fragment>',`
      vec3 liRP=vLiRiparianWorld;float liRC=46.*sin((liRP.z+140.)*.00168)+28.*sin((liRP.z-70.)*.0031)-430.*(1.-smoothstep(-1350.,-350.,liRP.z));
      float liRH=170.*(1.+.11*sin(liRP.z*.0013-.4)+.055*cos(liRP.z*.0037));
      float liRD=abs(liRP.x-liRC)-liRH;
      float liRBand=smoothstep(2.,9.,liRD)*(1.-smoothstep(24.,37.,liRD));
      vec3 liRN=normalize(cross(dFdx(liRP),dFdy(liRP)));float liRFlat=smoothstep(.65,.90,abs(liRN.y));
      if(liRBand*liRFlat>.001){
        float liRSoil=smoothstep(.30,.68,.65*liRiparianNoise(liRP.xz*.022+19.)+.35*liRiparianNoise(liRP.xz*.055-7.));
        float liRDamp=liRBand*liRFlat*liRSoil;
        diffuseColor.rgb*=mix(vec3(1.),vec3(.75,.81,.70),liRDamp);
      }
      #include <alphamap_fragment>
    `);
  };
  material.customProgramCacheKey=()=>key+'|'+REVISION+'-damp-ground';material.userData.liRiparianGround=true;material.needsUpdate=true;return material;
}
