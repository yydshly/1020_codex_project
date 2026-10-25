import * as THREE from 'three';

const ACTIVE=new WeakMap();
const token=(material,name)=>(material?.name??'').split(' / ').map(s=>s.trim()).includes(name);
const isEarth=material=>token(material,'soil')||token(material,'EXT_B02_DampMineralGround');
const seedRandom=initial=>()=>{initial|=0;initial=initial+0x6d2b79f5|0;let t=Math.imul(initial^initial>>>15,1|initial);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const lerp=THREE.MathUtils.lerp;
const point=(x,y,z)=>new THREE.Vector3(x,z,-y);

// These are complete vegetation/edge envelopes, not just planting centres.
// All lie inside the already developed block. The north-east plot leaves the
// newly rotated house and its two entrances outside its L-shaped boundary.
export function planPlots(neighbourhood={}) {
  const byId=new Map((neighbourhood.layout?.landscape_parcels??[]).map(p=>[p.id,p.bounds_xy]));
  const rect=(id,fallback)=>byId.get(id)??fallback;
  return [
    {id:'northwest-house-garden',purpose:'A sheltered orchard garden behind the two north-west houses',
      bounds:[rect('northwest-house-garden',[-30.25,17.15,-16.25,23.30])],
      hedges:[[[-29.88,22.90],[-16.65,22.90]], [[-29.88,17.55],[-29.88,22.90]], [[-16.65,19.5],[-16.65,22.90]]],
      beds:[[-27.9,17.8,-19.0,18.75],[-26.8,19.0,-18.5,19.85]],gate:null,
      accents:[[-28.1,21.05],[-22.4,21.15]]},
    {id:'northeast-corner-garden',purpose:'An L-shaped herb garden wrapping the turned corner house',
      bounds:[rect('northeast-house-garden-west',[15.25,17.15,24.35,23.30]),rect('northeast-house-garden-north',[24.35,19.60,30.25,23.30])],
      hedges:[[[15.65,22.90],[29.85,22.90]],[[15.65,17.55],[15.65,22.90]],[[29.85,20.0],[29.85,22.90]],[[24.8,20.0],[29.85,20.0]]],
      beds:[[18.7,17.85,23.3,18.8],[19.3,19.05,23.3,19.9]],gate:null,
      accents:[[17.8,21.20],[26.8,21.10]]},
    {id:'southwest-back-garden',purpose:'A bounded kitchen garden with beds beside the existing orchard trees',
      bounds:[rect('southwest-back-garden',[-30.25,-33.30,-15.25,-23.25])],
      hedges:[[[-29.85,-32.90],[-24.2,-32.90]],[[-22.8,-32.90],[-15.65,-32.90]],
        [[-29.85,-32.9],[-29.85,-23.65]],[[-15.65,-32.90],[-15.65,-26.1]]],
      beds:[[-23.1,-31.5,-21.95,-25.0],[-20.85,-31.5,-19.7,-25.0],[-18.6,-31.5,-17.45,-25.0]],
      gate:[[-24.2,-32.90],[-22.8,-32.90]],accents:[[-27.1,-26.0],[-26.1,-30.0]]},
    {id:'southeast-back-garden',purpose:'A smaller working garden and open tree court behind the east canal houses',
      bounds:[rect('southeast-back-garden',[14.50,-33.30,30.25,-23.25])],
      hedges:[[[14.90,-32.90],[20.15,-32.90]],[[21.55,-32.90],[29.85,-32.90]],
        [[29.85,-32.90],[29.85,-23.65]],[[14.90,-32.90],[14.90,-27.2]]],
      beds:[[16.0,-31.5,22.75,-30.35],[16.0,-29.05,21.7,-27.9],[16.0,-26.65,20.65,-25.5]],
      gate:[[20.15,-32.90],[21.55,-32.90]],accents:[[26.2,-26.0],[26.9,-30.1]]},
  ];
}

function batch() {
  const positions=[],normals=[],colours=[];
  function face(vertices,colour){
    for(let i=1;i<vertices.length-1;i++){
      const a=vertices[0],b=vertices[i],c=vertices[i+1],normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
      for(const v of [a,b,c]){positions.push(...v.toArray());normals.push(...normal.toArray());colours.push(...colour.toArray());}
    }
  }
  return {face,
    box(x,y,z,sx,sy,sz,colour,angle=0){
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),center=point(x,y,z);
      const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
        .map(([a,b,c])=>new THREE.Vector3(a*sx/2,b*sz/2,c*sy/2).applyQuaternion(q).add(center));
      for(const f of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])face(f.map(i=>v[i]),colour);
    },
    finish(){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;},
    get count(){return positions.length/3;},
  };
}

function groundSampler(model) {
  model.updateMatrixWorld(true);
  const targets=[];model.traverse(mesh=>{if(mesh.isMesh&&mesh.visible){const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(list.every(isEarth))targets.push(mesh);}});
  if(!targets.length)throw new Error('SPACE10 plots need visible real soil/terrain to support every planting.');
  const ray=new THREE.Raycaster(),samples=[];
  return {samples,sample(x,y){ray.set(point(x,y,25),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(targets,false)[0];
    if(!hit)throw new Error(`No physical ground for SPACE10 plot at ${x},${y}.`);
    samples.push([x,y,hit.point.y]);return hit.point.y;}};
}

function surfaceMaterial(source,beds) {
  const material=source.clone(),before=source.onBeforeCompile,cacheKey=source.customProgramCacheKey.call(source);
  material.name=`Space 10 planted beds / ${source.name}`;
  const uniforms={s10Beds:{value:beds.map(r=>new THREE.Vector4(...r))}};
  material.onBeforeCompile=(shader,renderer)=>{
    before.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSpace10PlotWorld;\nvarying vec3 vSpace10PlotNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvSpace10PlotNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSpace10PlotWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSpace10PlotWorld;varying vec3 vSpace10PlotNormal;uniform vec4 s10Beds[${beds.length}];`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      vec2 s10P=vec2(vSpace10PlotWorld.x,-vSpace10PlotWorld.z);float s10Bed=0.;
      for(int i=0;i<${beds.length};i++){
        vec4 r=s10Beds[i];vec2 q=abs(s10P-(r.xy+r.zw)*.5)-(r.zw-r.xy)*.5;
        float d=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
        s10Bed=max(s10Bed,1.-smoothstep(-.025,.10,d));
      }
      s10Bed*=smoothstep(.65,.93,normalize(vSpace10PlotNormal).y);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.105,.077,.047),s10Bed*.88);
      roughnessFactor=mix(roughnessFactor,.95,s10Bed);
      #include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey=()=>`${cacheKey}/space10-planted-earth-${beds.length}-01`;
  return material;
}

function hedgeMaterial(leafTexture) {
  const material=new THREE.MeshStandardMaterial({name:'SPACE10_ClippedHedgeInterior',vertexColors:true,roughness:.95});
  material.onBeforeCompile=shader=>{
    shader.uniforms.s10HedgeLeaf={value:leafTexture};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSpace10HedgeWorld;\nvarying vec3 vSpace10HedgeNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvSpace10HedgeNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSpace10HedgeWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSpace10HedgeWorld;varying vec3 vSpace10HedgeNormal;uniform sampler2D s10HedgeLeaf;
      float s10HedgeHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float s10HedgeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(s10HedgeHash(i),s10HedgeHash(i+vec2(1.,0.)),f.x),mix(s10HedgeHash(i+vec2(0.,1.)),s10HedgeHash(i+vec2(1.)),f.x),f.y);}
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec3 s10HN=abs(normalize(vSpace10HedgeNormal));
      vec2 s10HUV=s10HN.y>max(s10HN.x,s10HN.z)?vSpace10HedgeWorld.xz:
        s10HN.x>s10HN.z?vSpace10HedgeWorld.zy:vSpace10HedgeWorld.xy;
      float s10HA=texture2D(s10HedgeLeaf,fract(s10HUV*3.3)).a;
      float s10HB=texture2D(s10HedgeLeaf,fract(s10HUV*2.7+vec2(.37,.61))).a;
      float s10LeafLayer=max(s10HA*.95,s10HB*.58);
      float s10HCluster=s10HedgeNoise(s10HUV*4.8);
      float s10HFilter=1.-smoothstep(.10,.42,length(fwidth(s10HUV)*3.3));
      float s10HHeight=(s10LeafLayer*.007+s10HCluster*.004)*s10HFilter;
      vec3 s10HX=dFdx(-vViewPosition),s10HY=dFdy(-vViewPosition);
      vec3 s10HR1=cross(s10HY,normal),s10HR2=cross(normal,s10HX);float s10HDet=dot(s10HX,s10HR1);
      vec3 s10HGradient=sign(s10HDet)*(dFdx(s10HHeight)*s10HR1+dFdy(s10HHeight)*s10HR2);
      normal=normalize(abs(s10HDet)*normal-s10HGradient);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      diffuseColor.rgb*=mix(.46,.98,s10LeafLayer)*mix(.88,1.10,s10HCluster);
      roughnessFactor=.95;
      #include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey=()=> 'space10-hedge-layered-existing-leaf-alpha-01';return material;
}

export async function applyPlots(renderer,scene,model,neighbourhood={}) {
  if(ACTIVE.has(scene))return ACTIVE.get(scene);
  const leafSource=scene.getObjectByName('SPACE09_IndividualLeafSprigs')?.material;
  if(!leafSource?.map)throw new Error('SPACE10 plots borrow the existing SPACE09 leaf alpha atlas; initialise landscape first.');
  const plots=planPlots(neighbourhood),ground=groundSampler(model),stone=batch(),wood=batch(),hedge=batch(),cards=[];
  const random=seedRandom(100275),q=new THREE.Quaternion(),matrix=new THREE.Matrix4(),leafNormal=new THREE.Vector3(0,0,1);
  const records=[];
  function leaf(x,y,z,width,height,tilt=.55){
    const n=new THREE.Vector3((random()-.5)*2,tilt+(random()-.5)*.6,(random()-.5)*2).normalize();
    q.setFromUnitVectors(leafNormal,n);q.multiply(new THREE.Quaternion().setFromAxisAngle(leafNormal,random()*Math.PI*2));
    matrix.compose(point(x,y,z),q,new THREE.Vector3(width,height,1));
    cards.push({matrix:matrix.clone(),colour:new THREE.Color().setRGB(.78+random()*.20,.87+random()*.13,.67+random()*.20)});
  }
  for(const [index,plot]of plots.entries()){
    const starts={stone:stone.count,wood:wood.count,hedge:hedge.count,leaves:cards.length},bedRecords=[],hedgeRecords=[];
    for(const [a,b]of plot.hedges){
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length,n=Math.ceil(length/.60);
      const strip=[];
      for(let j=0;j<=n;j++){
        const t=j/n,x=lerp(a[0],b[0],t),y=lerp(a[1],b[1],t),z=ground.sample(x,y),height=.55+random()*.15;
        strip.push({x,y,z,height,width:.20+random()*.025});
        if(j<n){const mid=(j+.5)/n,mx=lerp(a[0],b[0],mid),my=lerp(a[1],b[1],mid),base=ground.sample(mx,my);
          stone.box(mx,my,base+.085,length/n+.015,.23,.21,new THREE.Color(.29,.285,.25),-Math.atan2(dy,dx));}
      }
      for(let j=0;j<n;j++){
        const p=strip[j],r=strip[j+1],cross=s=>[
          point(s.x+nx*s.width,s.y+ny*s.width,s.z+.12),point(s.x+nx*s.width*.75,s.y+ny*s.width*.75,s.z+s.height*.85),
          point(s.x,s.y,s.z+s.height),point(s.x-nx*s.width*.75,s.y-ny*s.width*.75,s.z+s.height*.85),
          point(s.x-nx*s.width,s.y-ny*s.width,s.z+.12)];
        const first=cross(p),last=cross(r),colour=new THREE.Color(.13+random()*.025,.18+random()*.025,.080+random()*.018);
        for(let k=0;k<4;k++)hedge.face([first[k+1],last[k+1],last[k],first[k]],colour);
        if(j===0)hedge.face([...first].reverse(),colour);if(j===n-1)hedge.face(last,colour);
        for(let k=0;k<13;k++){
          const t=random(),x=lerp(p.x,r.x,t),y=lerp(p.y,r.y,t),z=lerp(p.z,r.z,t),side=random()<.5?-1:1;
          const top=k%3===0,offset=top?(random()-.5)*.27:.18*side;
          const rise=top?lerp(p.height,r.height,t)-.015:.30+random()*.32;
          leaf(x+nx*offset,y+ny*offset,z+rise,.19+random()*.055,.23+random()*.06,top?.95:.38);
        }
      }
      hedgeRecords.push({a,b,width:.74,maximumHeight:.85,privateBoundary:true});
    }
    if(plot.gate){
      const [a,b]=plot.gate,length=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=-Math.atan2(b[1]-a[1],b[0]-a[0]);
      for(let i=0;i<9;i++){const t=i/8,x=lerp(a[0],b[0],t),y=lerp(a[1],b[1],t),z=ground.sample(x,y);
        wood.box(x,y,z+.32,.075,.065,.65,new THREE.Color(.22,.165,.105),angle);}
      for(const rise of [.16,.50]){const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,z=ground.sample(x,y);
        wood.box(x,y,z+rise,length,.075,.055,new THREE.Color(.20,.15,.095),angle);}
    }
    for(const r of plot.beds){
      const [a,b,c,d]=r;
      for(const [p,s]of [[[a,b],[c,b]],[[c,b],[c,d]],[[c,d],[a,d]],[[a,d],[a,b]]]){
        const length=Math.hypot(s[0]-p[0],s[1]-p[1]),n=Math.ceil(length/1.2),angle=-Math.atan2(s[1]-p[1],s[0]-p[0]);
        for(let i=0;i<n;i++){const t=(i+.5)/n,x=lerp(p[0],s[0],t),y=lerp(p[1],s[1],t),z=ground.sample(x,y);
          wood.box(x,y,z+.06,length/n+.01,.055,.16,new THREE.Color(.25,.19,.115),angle);}
      }
      const longX=c-a>d-b,length=longX?c-a:d-b,steps=Math.max(4,Math.floor(length/.46));
      for(let i=0;i<steps;i++)for(let row=0;row<2;row++){
        const t=(i+.5)/steps,x=longX?lerp(a+.2,c-.2,t):lerp(a+.28,c-.28,row),y=longX?lerp(b+.28,d-.28,row):lerp(b+.2,d-.2,t),z=ground.sample(x,y);
        for(let k=0;k<4;k++){const angle=k*Math.PI*.5+random()*.4;
          leaf(x+Math.cos(angle)*.08,y+Math.sin(angle)*.08,z+.15+random()*.10,.25+random()*.06,.27+random()*.07,.9);}
      }
      bedRecords.push({bounds:[...r],surface:'Existing terrain shaded as soil; no overlay plane',edgingHeight:.14});
    }
    for(const [x,y]of plot.accents){
      for(let k=0;k<30;k++){const angle=k*2.399963,rad=.45+random()*.55,px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad,z=ground.sample(px,py);
        leaf(px,py,z+.12+random()*.13,.23+random()*.06,.25+random()*.08,.9);}
    }
    records.push({id:plot.id,purpose:plot.purpose,allowedBoundsBlenderXY:plot.bounds,hedges:hedgeRecords,beds:bedRecords,gate:plot.gate,
      ranges:{stone:{start:starts.stone,count:stone.count-starts.stone},wood:{start:starts.wood,count:wood.count-starts.wood},
        hedge:{start:starts.hedge,count:hedge.count-starts.hedge},leaves:{start:starts.leaves,count:cards.length-starts.leaves}}});
  }
  const group=new THREE.Group();group.name='SPACE10_PlantedParcels';group.userData.space10Owned=true;
  const materials={stone:new THREE.MeshStandardMaterial({name:'SPACE10_PlotStone',vertexColors:true,roughness:.92}),
    wood:new THREE.MeshStandardMaterial({name:'SPACE10_PlotTimber',vertexColors:true,roughness:.94}),
    hedge:hedgeMaterial(leafSource.map)};
  const geometries={stone:stone.finish(),wood:wood.finish(),hedge:hedge.finish()};
  for(const key of Object.keys(geometries)){const mesh=new THREE.Mesh(geometries[key],materials[key]);mesh.name=`SPACE10_Parcels_${key}`;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.space10Owned=true;group.add(mesh);}
  const leafMaterial=leafSource.clone();leafMaterial.name='SPACE10_PlotLeafSprigs';leafMaterial.onBeforeCompile=leafSource.onBeforeCompile;
  leafMaterial.customProgramCacheKey=()=>leafSource.customProgramCacheKey.call(leafSource)+'/plots10';
  const leafGeometry=new THREE.PlaneGeometry(1,1),leaves=new THREE.InstancedMesh(leafGeometry,leafMaterial,cards.length);
  leaves.name='SPACE10_PlotLeaves';leaves.userData.space10Owned=true;leaves.castShadow=false;leaves.receiveShadow=true;
  cards.forEach((card,i)=>{leaves.setMatrixAt(i,card.matrix);leaves.setColorAt(i,card.colour);});leaves.instanceMatrix.needsUpdate=true;leaves.instanceColor.needsUpdate=true;
  leaves.computeBoundingBox();leaves.computeBoundingSphere();group.add(leaves);scene.add(group);group.updateMatrixWorld(true);
  const beds=plots.flatMap(plot=>plot.beds),replacements=[],materialCache=new Map();
  model.traverse(part=>{if(!part.isMesh||!part.visible)return;const original=part.material,list=Array.isArray(original)?original:[original];
    if(!list.some(isEarth))return;
    const next=list.map(source=>{if(!isEarth(source))return source;if(!materialCache.has(source))materialCache.set(source,surfaceMaterial(source,beds));return materialCache.get(source);});
    part.material=Array.isArray(original)?next:next[0];replacements.push({part,original,installed:part.material});});
  const bounds=new THREE.Box3().setFromObject(group),triangles=Object.values(geometries).reduce((sum,g)=>sum+g.attributes.position.count/3,0)+leaves.count*2;
  if(triangles>15000)throw new Error(`SPACE10 plot budget exceeded: ${triangles} triangles.`);
  const metadata={version:'space-10-four-purposeful-garden-parcels',plots:records,plotCount:4,addedMeshes:4,drawCalls:4,
    triangles,leafInstances:leaves.count,addedTrees:0,movedTrees:0,newLights:0,newTextures:0,borrowedLeafTexture:leafSource.map.name,
    surfaceMethod:'Exact real terrain height samples; low edges and planting only. Bed soil is a material mask, never a second coplanar surface.',
    physicalBoundsThreeXYZ:{min:bounds.min.toArray(),max:bounds.max.toArray()},groundSamples:ground.samples,
    originalGeometryChanged:false,originalNavigationChanged:false,sourceMaterialClones:materialCache.size,
    privateGardenGatePolicy:'Two low closed timber gates make the planted plots visibly private; all old public routes stay open.'};
  metadata.hedgeSurface='Two world-space layers of the borrowed leaf alpha atlas, filtered millimetre bump and cluster shading. Existing cards redistributed across top and sides; no added geometry or textures.';
  const hadMetadata=Object.hasOwn(scene.userData,'space10Plots'),previousMetadata=scene.userData.space10Plots;scene.userData.space10Plots=metadata;
  let disposed=false;const handle={metadata,update(){},dispose(){if(disposed)return;disposed=true;scene.remove(group);
    replacements.forEach(({part,original,installed})=>{if(part.material===installed)part.material=original;});materialCache.forEach(m=>m.dispose());
    Object.values(geometries).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());leafGeometry.dispose();leafMaterial.dispose();group.clear();
    if(hadMetadata)scene.userData.space10Plots=previousMetadata;else delete scene.userData.space10Plots;ACTIVE.delete(scene);}};
  ACTIVE.set(scene,handle);return handle;
}
