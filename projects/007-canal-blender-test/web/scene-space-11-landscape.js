import * as THREE from 'three';
import { riverSection } from './scene-space-06-landscape.js';
import { createNavigation } from './scene-space-10-navigation.js';

const ACTIVE=new WeakMap();
const ENVELOPE=[-68,-75,68,62];
const DEVELOPED=[-36,-44,36,26.5];
const TREE_PLAN=[
  ['northwest',-42,38,7.2],['northwest',-36,37,6.6],['northwest',-39,43,6.5],['northwest',-33,46,7.6],['northwest',-43,48,7.1],
  ['northeast',31,38,6.8],['northeast',38,38.5,7.5],['northeast',34,44,6.4],['northeast',39,48.5,7.6],['northeast',30,49,7.0],
  ['west-bend',-59,-17,6.8],['west-bend',-64,-10,6.1],['west-bend',-55,-24,6.5],
  ['east-bend',58,-40,6.8],['east-bend',63,-43,6.3],['east-bend',56,-44.5,6.7],
  ['southwest',-36,-62,6.5],['southwest',-29,-68,6.2],['southeast',35,-62,6.7],['southeast',29,-69,6.0],
];
const MEADOW_PATCHES=[
  [-25,29.4,3.7,1.65],[-35.4,29.1,2.7,1.55],[20.2,29.6,3.6,1.6],[35.8,28.7,2.8,1.5],
  [-37.9,11.0,1.65,4.0],[-38.5,-29.2,1.7,3.5],[38.0,10.2,1.7,3.8],[38.6,-32.0,1.7,3.2],
  [-18,-47.3,4.2,1.3],[3.5,-47.7,4.8,1.4],[22,-47.7,3.6,1.35],
];
const SHRUB_PATCHES=[[-39,34.5,2.9,1.8],[-30.5,38.5,2.6,1.8],[31,36.4,2.7,1.6],[40.5,42,2.5,1.8],
  [-55.5,-18.8,2.6,1.8],[55.7,-39.6,2.6,1.8],[-32,-61,2.5,1.6],[32.5,-63,2.7,1.6]];
const token=(material,name)=>(material?.name??'').split(' / ').map(s=>s.trim()).includes(name);
const earth=material=>token(material,'soil')||token(material,'EXT_B02_DampMineralGround');
const world=(x,y,z)=>new THREE.Vector3(x,z,-y);
const rng=initial=>()=>{initial|=0;initial=initial+0x6d2b79f5|0;let t=Math.imul(initial^initial>>>15,1|initial);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const mix=THREE.MathUtils.lerp;
const inside=(x,y,pad=0)=>x>=ENVELOPE[0]+pad&&x<=ENVELOPE[2]-pad&&y>=ENVELOPE[1]+pad&&y<=ENVELOPE[3]-pad;
const boxRecord=box=>({min:box.min.toArray(),max:box.max.toArray()});

export function planLandscape() {
  return {envelopeBlenderXY:[...ENVELOPE],treeCount:TREE_PLAN.length,
    trees:TREE_PLAN.map(([group,x,y,height],i)=>({id:`space11-tree-${String(i+1).padStart(2,'0')}`,group,x,blender_y:y,height})),
    meadowPatches:MEADOW_PATCHES.map(p=>[...p]),shrubPatches:SHRUB_PATCHES.map(p=>[...p]),
    openAreas:[{id:'north-central-skyline',bounds:[-15,28,15,48],policy:'No new tall trees'},
      {id:'south-central-meadow',bounds:[-20,-75,18,-49],policy:'Low meadow, no new tall trees'},
      {id:'western-canal-view',xRange:[-38,-25],policy:'No new woody planting'},
      {id:'eastern-canal-view',xRange:[24,58],policy:'River edge stays low; trees at least ten metres behind the bank'}]};
}

function supportSampler(model,navigation) {
  model.updateMatrixWorld(true);const targets=[];
  model.traverse(part=>{if(!part.isMesh||!part.visible)return;const list=Array.isArray(part.material)?part.material:[part.material];if(list.every(earth))targets.push(part);});
  if(!targets.length)throw new Error('SPACE11 cannot locate the unchanged soil/terrain meshes.');
  const ray=new THREE.Raycaster(),samples=[];
  function roadGap(x,y){let distance=Infinity;for(const r of navigation.zones){const dy=Math.max(r.minZ+y,0,-y-r.maxZ),dx=Math.max(r.minX-x,0,x-r.maxX);distance=Math.min(distance,Math.hypot(dx,dy));}return distance;}
  function sample(x,y){ray.set(world(x,y,35),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(targets,false)[0];
    if(!hit)throw new Error(`SPACE11 has no real ground at ${x},${y}.`);
    const section=riverSection(x),bankDistance=Math.abs(y-section.center)-section.width/2;
    const record={blender:[x,y,hit.point.y],normalThree:hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
      bankDistance,roadGap:roadGap(x,y),source:hit.object.name};samples.push(record);return record;}
  return {sample,samples,roadGap};
}

function makeBatch(coloured=false) {
  const positions=[],normals=[],colours=[];
  return {get count(){return positions.length/3;},
    vertex(p,n,colour){positions.push(...p.toArray());normals.push(...n.toArray());if(coloured)colours.push(...colour.toArray());},
    triangle(a,b,c,colour){const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
      for(const p of [a,b,c]){positions.push(...p.toArray());normals.push(...normal.toArray());if(coloured)colours.push(...colour.toArray());}},
    finish(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      if(coloured)g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.computeBoundingBox();g.computeBoundingSphere();return g;},
  };
}

function geometryRangeBounds(attribute,start,count){const box=new THREE.Box3(),p=new THREE.Vector3();for(let i=start;i<start+count;i++)box.expandByPoint(p.fromBufferAttribute(attribute,i));return boxRecord(box);}
function cardBounds(cards,start,count){const box=new THREE.Box3(),p=new THREE.Vector3();for(let i=start;i<start+count;i++)for(const x of [-.5,.5])for(const y of [-.5,.5])box.expandByPoint(p.set(x,y,0).applyMatrix4(cards[i].matrix));return boxRecord(box);}

function makeGroundMaterial(source,trees,riverSections) {
  const material=source.clone(),previous=source.onBeforeCompile,key=source.customProgramCacheKey.call(source);
  material.name=`Space 11 outer meadow / ${source.name}`;
  const groups=new Map();for(const tree of trees){if(!groups.has(tree.group))groups.set(tree.group,[]);groups.get(tree.group).push(tree);}
  const groveFields=[...groups.values()].map(items=>{const xs=items.map(t=>t.x),ys=items.map(t=>t.blender_y),
    minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    return new THREE.Vector4((minX+maxX)/2,(minY+maxY)/2,(maxX-minX)/2+2.7,(maxY-minY)/2+2.7);});
  const uniforms={s11Roots:{value:trees.map(t=>new THREE.Vector3(t.x,t.blender_y,t.height))},s11Groves:{value:groveFields},
    s11Developed:{value:new THREE.Vector4(...DEVELOPED)}};
  let river='vec2 s11River(float x){vec2 r=vec2(-6.15138,8.74812);';
  if(riverSections?.length){river=`vec2 s11River(float x){vec2 r=vec2(${riverSections[0][1].toFixed(6)},${riverSections[0][2].toFixed(6)});`;
    for(let i=1;i<riverSections.length;i++){const a=riverSections[i-1],b=riverSections[i];river+=`r=mix(r,vec2(${b[1].toFixed(6)},${b[2].toFixed(6)}),smoothstep(${a[0].toFixed(6)},${b[0].toFixed(6)},x));`;}}
  river+='return r;}';
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSpace11World;\nvarying vec3 vSpace11Normal;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvSpace11Normal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSpace11World=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSpace11World;varying vec3 vSpace11Normal;uniform vec3 s11Roots[${trees.length}];uniform vec4 s11Groves[${groveFields.length}];uniform vec4 s11Developed;
      float s11Hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float s11Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(s11Hash(i),s11Hash(i+vec2(1.,0.)),f.x),mix(s11Hash(i+vec2(0.,1.)),s11Hash(i+vec2(1.)),f.x),f.y);}
      float s11ReceiverPlaneBias(vec4 coordinate,vec2 mapSize){
        vec3 p=coordinate.xyz/max(abs(coordinate.w),.000001);
        vec3 dx=dFdx(p),dy=dFdy(p);float det=dx.x*dy.y-dx.y*dy.x;
        float required=.00070*(1024./max(mapSize.x,1.));
        if(abs(det)>1.0e-12){
          vec2 gradient=vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/det;
          // Three's PCFSoft taps can reach two shadow texels from the
          // receiver. Cover that plane-depth span at the actual resolution.
          required=2.*dot(abs(gradient),1./max(mapSize,vec2(1.)));
        }
        // SPACE09 already subtracts .00020 in the vertex receiver. Retain
        // it and add only the remaining footprint, with a bounded fallback.
        return clamp(required-.00020,0.,.00120);
      }
      ${river}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      vec2 s11P=vec2(vSpace11World.x,-vSpace11World.z);float s11ReceiverWeight=0.;
      if(s11P.x>-68.&&s11P.x<68.&&s11P.y>-75.&&s11P.y<62.){
        vec2 q=abs(s11P-(s11Developed.xy+s11Developed.zw)*.5)-(s11Developed.zw-s11Developed.xy)*.5;
        float s11Outside=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
        float s11Patch=s11Noise(s11P*.055)*.69+s11Noise(s11P*.17+4.2)*.31;
        float s11OutsideMask=smoothstep(0.,2.8,s11Outside);
        float s11Band=s11OutsideMask*smoothstep(.65,4.0,s11Outside+(s11Patch-.5)*2.4);
        float s11Envelope=smoothstep(-68.,-63.,s11P.x)*(1.-smoothstep(63.,68.,s11P.x))
          *smoothstep(-75.,-70.,s11P.y)*(1.-smoothstep(57.,62.,s11P.y));
        vec2 s11Section=s11River(s11P.x);float s11Bank=abs(s11P.y-s11Section.x)-s11Section.y*.5;
        float s11Wet=(1.-smoothstep(.18,3.0,s11Bank))*smoothstep(35.,40.,abs(s11P.x));
        float s11Top=smoothstep(.40,.86,normalize(vSpace11Normal).y);
        float s11Dry=smoothstep(.28,.72,s11Patch);
        vec3 s11Meadow=mix(vec3(.151,.157,.085),vec3(.255,.215,.128),s11Dry);
        float s11Understory=0.;
        for(int i=0;i<${groveFields.length};i++){vec4 grove=s11Groves[i];
          float edge=(length((s11P-grove.xy)/grove.zw)-1.)*min(grove.z,grove.w);
          s11Understory=max(s11Understory,1.-smoothstep(-.6,5.0,edge+(s11Patch-.5)*1.2));}
        vec3 s11ForestFloor=mix(vec3(.095,.105,.055),vec3(.143,.112,.066),s11Patch);
        vec3 s11Soil=mix(s11Meadow,s11ForestFloor,s11Understory*.82);
        s11Soil=mix(s11Soil,vec3(.095,.100,.060),s11Wet*.72);
        diffuseColor.rgb=mix(diffuseColor.rgb,s11Soil,(s11Band*.72+s11Wet*.20)*s11OutsideMask*s11Envelope*s11Top);
        float s11Contact=0.;
        for(int i=0;i<${trees.length};i++){vec2 delta=s11P-s11Roots[i].xy;s11Contact=max(s11Contact,exp(-dot(delta,delta)/.50));}
        diffuseColor.rgb*=1.-s11Contact*.16*s11Top*s11OutsideMask;
        roughnessFactor=mix(roughnessFactor,mix(.96,.84,s11Wet),s11Band*.42*s11Envelope*s11Top);
        s11ReceiverWeight=s11OutsideMask*s11Envelope;
      }
      #include <lights_physical_fragment>`);
    // Fragment-space masking keeps the complete old developed rectangle
    // unchanged, even when a large terrain triangle straddles its edge. Only
    // directional comparison depth changes; shadow UVs and all lights remain.
    const lighting=THREE.ShaderChunk.lights_fragment_begin.replace(
      'directionalLightShadow.shadowBias,',
      '( directionalLightShadow.shadowBias - s11ReceiverPlaneBias( vDirectionalShadowCoord[ i ], directionalLightShadow.shadowMapSize ) * s11ReceiverWeight ),');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lighting);
  };
  material.customProgramCacheKey=()=>`${key}/space11-bounded-grove-meadow-receiver-plane-03`;return material;
}

export async function applyLandscape(renderer,scene,model,neighbourhood={}) {
  if(ACTIVE.has(scene))return ACTIVE.get(scene);
  const sourceBranches=scene.getObjectByName('SPACE09_BranchHierarchy'),sourceLeaves=scene.getObjectByName('SPACE09_IndividualLeafSprigs');
  const sourceMetadata=scene.userData.space09Landscape;
  if(!sourceBranches?.isMesh||!sourceLeaves?.isInstancedMesh||!sourceMetadata?.trees)
    throw new Error('SPACE11 requires the established SPACE09 branch and alpha-foliage layer from SPACE10.');
  const navigation=createNavigation({ground:neighbourhood.ground.navigation}),support=supportSampler(model,navigation),plan=planLandscape();
  const treeSources=neighbourhood.landscape.trees,prototypes=['space06-tree-10','space06-tree-17','space06-tree-22'];
  const branches=makeBatch(),blades=makeBatch(true),cards=[],trees=[],lowGroups=[],random=rng(112511);
  const sourcePosition=sourceBranches.geometry.attributes.position,sourceNormal=sourceBranches.geometry.attributes.normal;
  const p=new THREE.Vector3(),n=new THREE.Vector3(),oldMatrix=new THREE.Matrix4(),newMatrix=new THREE.Matrix4(),colour=new THREE.Color();
  const rotation=new THREE.Quaternion(),normalMatrix=new THREE.Matrix3();
  for(const [i,tree]of plan.trees.entries()){
    const prototypeId=prototypes[i%prototypes.length],prototype=sourceMetadata.trees.find(t=>t.id===prototypeId),source=treeSources.find(t=>t.id===prototypeId);
    if(!prototype||!source)throw new Error('SPACE11 tree prototype metadata is incomplete.');
    const root=support.sample(tree.x,tree.blender_y);if(root.bankDistance<10)throw new Error('New tree is too close to the river.');
    const sy=tree.height/source.height,sx=sy*(.88+random()*.13)*1.20,sz=sy*(.88+random()*.13)*1.20,angle=random()*Math.PI*2;
    rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),angle);
    const transform=new THREE.Matrix4().compose(world(tree.x,tree.blender_y,root.blender[2]),rotation,new THREE.Vector3(sx,sy,sz))
      .multiply(new THREE.Matrix4().makeTranslation(-prototype.baseWorld[0],-prototype.baseWorld[1],-prototype.baseWorld[2]));
    normalMatrix.getNormalMatrix(transform);const branchStart=branches.count,leafStart=cards.length,r=prototype.branchVertexRange;
    for(let j=r.start;j<r.start+r.count;j++)branches.vertex(p.fromBufferAttribute(sourcePosition,j).applyMatrix4(transform),n.fromBufferAttribute(sourceNormal,j).applyNormalMatrix(normalMatrix).normalize());
    for(let j=prototype.leafInstances.start;j<prototype.leafInstances.start+prototype.leafInstances.count;j++){
      sourceLeaves.getMatrixAt(j,oldMatrix);newMatrix.multiplyMatrices(transform,oldMatrix);sourceLeaves.getColorAt(j,colour);
      cards.push({matrix:newMatrix.clone(),colour:colour.clone().multiplyScalar(.93+random()*.08)});
    }
    const originalLeaves=cards.length-leafStart,targetAdditional=Math.round(originalLeaves*.35),
      existingBounds=cardBounds(cards,leafStart,originalLeaves),extraPosition=new THREE.Vector3(),extraRotation=new THREE.Quaternion(),extraScale=new THREE.Vector3();
    let added=0;
    for(let attempt=0;added<targetAdditional&&attempt<targetAdditional*12;attempt++){
      const originalCard=cards[leafStart+Math.floor(random()*originalLeaves)];originalCard.matrix.decompose(extraPosition,extraRotation,extraScale);
      extraPosition.x=mix(extraPosition.x,tree.x,.14)+(random()-.5)*.38;
      extraPosition.z=mix(extraPosition.z,-tree.blender_y,.14)+(random()-.5)*.38;
      extraPosition.y+=(random()-.5)*.36;
      extraRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(random()-.5,random()-.5,random()-.5).normalize(),(random()-.5)*1.4));
      extraScale.multiplyScalar(.88+random()*.16);newMatrix.compose(extraPosition,extraRotation,extraScale);
      let fits=true;for(const x of [-.5,.5])for(const y of [-.5,.5]){p.set(x,y,0).applyMatrix4(newMatrix);
        if(p.x<existingBounds.min[0]||p.x>existingBounds.max[0]||p.y<existingBounds.min[1]||p.y>existingBounds.max[1]||p.z<existingBounds.min[2]||p.z>existingBounds.max[2])fits=false;}
      if(!fits)continue;cards.push({matrix:newMatrix.clone(),colour:originalCard.colour.clone().multiplyScalar(.94+random()*.08)});added++;
    }
    trees.push({...tree,prototypeId,baseWorld:world(tree.x,tree.blender_y,root.blender[2]).toArray(),support:root,
      scale:[sx,sy,sz],angle,branchVertexRange:{start:branchStart,count:branches.count-branchStart},
      canopyWidthMultiplier:1.20,originalLeafInstances:originalLeaves,additionalLeafInstances:added,
      leafInstanceRange:{start:leafStart,count:cards.length-leafStart},leafBounds:cardBounds(cards,leafStart,cards.length-leafStart)});
  }
  function addLeaf(x,y,z,width,height,tilt){
    const direction=new THREE.Vector3((random()-.5)*2,tilt+(random()-.5)*.5,(random()-.5)*2).normalize();
    rotation.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),random()*Math.PI*2));
    newMatrix.compose(world(x,y,z),rotation,new THREE.Vector3(width,height,1));
    cards.push({matrix:newMatrix.clone(),colour:new THREE.Color(.78+random()*.18,.85+random()*.14,.65+random()*.20)});
  }
  function blade(root,angle,height,width,lean,baseColour){
    const [x,y,z]=root.blender,dx=Math.cos(angle),dy=Math.sin(angle),nx=-dy,ny=dx;
    const a=world(x+nx*width,y+ny*width,z-.018),b=world(x-nx*width,y-ny*width,z-.018),
      c=world(x+dx*lean*.38+nx*width*.58,y+dy*lean*.38+ny*width*.58,z+height*.60),
      d=world(x+dx*lean*.38-nx*width*.58,y+dy*lean*.38-ny*width*.58,z+height*.60),
      e=world(x+dx*lean,y+dy*lean,z+height);
    blades.triangle(a,b,c,baseColour);blades.triangle(b,d,c,baseColour);blades.triangle(c,d,e,baseColour);
  }
  for(const [i,patch]of SHRUB_PATCHES.entries()){
    const [cx,cy,rx,ry]=patch,start=cards.length,roots=[];
    for(let cluster=0;cluster<3;cluster++){
      const angle=cluster*2.399963,x=cx+Math.cos(angle)*rx*.43,y=cy+Math.sin(angle)*ry*.43;
      if(support.roadGap(x,y)<1.1)continue;const root=support.sample(x,y);roots.push(root);
      for(let j=0;j<80;j++){
        const a=random()*Math.PI*2,r=Math.sqrt(random()),px=x+Math.cos(a)*r*.63,py=y+Math.sin(a)*r*.58;
        const height=.17+(1-r*r)*(.62+random()*.25)+random()*.12;
        addLeaf(px,py,root.blender[2]+height,.24+random()*.10,.26+random()*.13,.5);
      }
    }
    lowGroups.push({id:`space11-shrub-${i+1}`,type:'shrub',approvedBoundsBlenderXY:[cx-rx-.3,cy-ry-.3,cx+rx+.3,cy+ry+.3],
      support:roots,leafInstanceRange:{start,count:cards.length-start},leafBounds:cardBounds(cards,start,cards.length-start)});
  }
  for(const [i,patch]of MEADOW_PATCHES.entries()){
    const [cx,cy,rx,ry]=patch,start=blades.count,roots=[];
    for(let j=0;j<85;j++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random()),x=cx+Math.cos(angle)*rx*r,y=cy+Math.sin(angle)*ry*r;
      if(!inside(x,y,.4)||support.roadGap(x,y)<.9)continue;
      const root=support.sample(x,y);roots.push(root);
      blade(root,random()*Math.PI*2,.22+random()*.35,.014+random()*.008,.08+random()*.13,
        new THREE.Color(.13+random()*.05,.16+random()*.055,.075+random()*.035));
    }
    lowGroups.push({id:`space11-meadow-${i+1}`,type:'meadow',approvedBoundsBlenderXY:[cx-rx-.25,cy-ry-.25,cx+rx+.25,cy+ry+.25],
      support:roots,bladeVertexRange:{start,count:blades.count-start}});
  }
  for(const side of [-1,1])for(const [i,cx]of [-62,-57.8,-50.2,-43.5,42.8,48.6,55.2,62].entries()){
    const start=blades.count,roots=[];
    for(let j=0;j<40;j++){
      const x=cx+(random()-.5)*1.6,r=riverSection(x),distance=.28+random()*.92,y=r.center+side*(r.width/2+distance);
      if(!inside(x,y,.4)||support.roadGap(x,y)<1)continue;const root=support.sample(x,y);roots.push(root);
      blade(root,side>0?-Math.PI/2:Math.PI/2,.37+random()*.54,.014+random()*.011,.06+random()*.15,
        new THREE.Color(.15+random()*.065,.18+random()*.055,.087+random()*.045));
    }
    lowGroups.push({id:`space11-reed-${side}-${i}`,type:'reed',xRange:[cx-.8,cx+.8],bankSide:side,
      rootBankDistanceTarget:[.28,1.20],maximumWaterwardLean:.21,support:roots,bladeVertexRange:{start,count:blades.count-start}});
  }
  const branchGeometry=branches.finish(),bladeGeometry=blades.finish();
  for(const tree of trees)tree.branchBounds=geometryRangeBounds(branchGeometry.attributes.position,tree.branchVertexRange.start,tree.branchVertexRange.count);
  for(const group of lowGroups)if(group.bladeVertexRange)group.bladeBounds=geometryRangeBounds(bladeGeometry.attributes.position,group.bladeVertexRange.start,group.bladeVertexRange.count);
  const branchMaterial=sourceBranches.material.clone();branchMaterial.name='SPACE11_BorrowedTreeBarkStyle';
  const leafMaterial=sourceLeaves.material.clone();leafMaterial.name='SPACE11_BorrowedAlphaFoliage';leafMaterial.onBeforeCompile=sourceLeaves.material.onBeforeCompile;
  leafMaterial.customProgramCacheKey=()=>sourceLeaves.material.customProgramCacheKey.call(sourceLeaves.material)+'/space11';
  const bladeMaterial=new THREE.MeshStandardMaterial({name:'SPACE11_MeadowAndReedBlades',vertexColors:true,roughness:.94,side:THREE.DoubleSide});
  const group=new THREE.Group();group.name='SPACE11_OuterLandscape';group.userData.space11Owned=true;
  const branchMesh=new THREE.Mesh(branchGeometry,branchMaterial);branchMesh.name='SPACE11_OuterTreeBranches';
  const bladeMesh=new THREE.Mesh(bladeGeometry,bladeMaterial);bladeMesh.name='SPACE11_MeadowReeds';
  const leaves=new THREE.InstancedMesh(sourceLeaves.geometry,leafMaterial,cards.length);leaves.name='SPACE11_OuterLeaves';
  cards.forEach((card,i)=>{leaves.setMatrixAt(i,card.matrix);leaves.setColorAt(i,card.colour);});leaves.instanceMatrix.needsUpdate=true;leaves.instanceColor.needsUpdate=true;
  leaves.computeBoundingBox();leaves.computeBoundingSphere();
  for(const mesh of [branchMesh,leaves,bladeMesh]){mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.space11Owned=true;group.add(mesh);}
  const totalTriangles=branchGeometry.attributes.position.count/3+cards.length*2+bladeGeometry.attributes.position.count/3;
  const bounds=new THREE.Box3().setFromObject(group),validBounds=inside(bounds.min.x,-bounds.max.z)&&inside(bounds.max.x,-bounds.min.z);
  if(totalTriangles>60000||!validBounds){branchGeometry.dispose();bladeGeometry.dispose();branchMaterial.dispose();leafMaterial.dispose();bladeMaterial.dispose();
    throw new Error(`SPACE11 geometry limit failed: ${totalTriangles} triangles, envelope=${validBounds}.`);}
  const replacements=[],cache=new Map(),riverSections=scene.userData.space06Landscape?.riverSectionsBlenderXY;
  model.traverse(part=>{if(!part.isMesh||!part.visible)return;const original=part.material,list=Array.isArray(original)?original:[original];if(!list.some(earth))return;
    const next=list.map(source=>{if(!earth(source))return source;if(!cache.has(source))cache.set(source,makeGroundMaterial(source,plan.trees,riverSections));return cache.get(source);});
    part.material=Array.isArray(original)?next:next[0];replacements.push({part,original,installed:part.material});});
  scene.add(group);
  const metadata={version:'space-11-bounded-river-and-meadow-edge',envelopeBlenderXY:[...ENVELOPE],physicalBoundsThreeXYZ:boxRecord(bounds),
    treeCount:trees.length,trees,lowGroups,triangles:totalTriangles,branchTriangles:branchGeometry.attributes.position.count/3,
    foliageTriangles:cards.length*2,bladeTriangles:bladeGeometry.attributes.position.count/3,leafInstances:cards.length,addedMeshes:3,drawCalls:3,
    newLights:0,newTextures:0,shadowCastersAdded:0,borrowedResources:{leafTexture:sourceLeaves.material.map.name,leafGeometry:sourceLeaves.geometry.uuid,
      policy:'Borrowed texture and unit-card geometry are not modified or disposed. Branch vertices/normals are copied from three existing tree prototypes.'},
    openAreas:plan.openAreas,groundMaterialCount:cache.size,groundMeshes:replacements.map(r=>r.part.name),supportSampleCount:support.samples.length,
    heightMethod:'Every root is raycast onto the actual unchanged terrain mesh; no new terrain, road or ground overlay plane.',
    groundMethod:'Outside-only dry meadow/wet soil colour separation, 5m feathered leaf-litter understory around six copses, damp banks and restrained root contact; fade only at the approved outer envelope.',
    additionalGroundReceiverBias:{method:'Directional receiver-plane depth gradient covering the PCFSoft two-texel footprint at actual shadowMapSize',
      additionalNormalizedRange:[0,.00120],preservedVertexBias:-.00020,degenerateJacobianGuard:1e-12,
      mask:'Per-fragment outside the developed rectangle only, fading to the outer envelope',
      developedBoundsBlenderXY:[...DEVELOPED],receiveShadowPreserved:true,shadowUVAndGlobalLightsUnchanged:true,inherited09ReceiverPreserved:true},
    unchanged:'All original geometry, all 23 existing trees, public navigation, buildings, lights, fog, exposure and shadow frustum.'};
  const hadMetadata=Object.hasOwn(scene.userData,'space11Landscape'),previousMetadata=scene.userData.space11Landscape;scene.userData.space11Landscape=metadata;
  let disposed=false;const handle={metadata,update(){},dispose(){if(disposed)return;disposed=true;scene.remove(group);
    replacements.forEach(({part,original,installed})=>{if(part.material===installed)part.material=original;});cache.forEach(material=>material.dispose());
    branchGeometry.dispose();bladeGeometry.dispose();branchMaterial.dispose();leafMaterial.dispose();bladeMaterial.dispose();group.clear();
    if(hadMetadata)scene.userData.space11Landscape=previousMetadata;else delete scene.userData.space11Landscape;ACTIVE.delete(scene);}};
  ACTIVE.set(scene,handle);return handle;
}
