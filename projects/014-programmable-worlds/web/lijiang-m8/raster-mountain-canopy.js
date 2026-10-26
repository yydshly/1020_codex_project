// All mountain crown tiers use open sprays of individual folded leaf blades.
// Distance changes leaf density; it never introduces a closed crown shell.
import { createBotanicalCrownGeometry, MOUNTAIN_CROWN_PROTOTYPES } from './mountain-botanical-crown.js?v=20261026-m8';
import { createMountainHorizonSprays } from './mountain-horizon-sprays.js?v=20261026-m8';

const REVISION='m7-preserved-crowns-subpixel-horizon-twig-indices-9';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=n=>{let h=Math.imul(Math.floor(n*1000003)^0x5f3759df,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};

/** Up to twelve near, twelve middle and twelve distant InstancedMeshes. Input is the actual
 * composed forest records, including sdfAnchor/mountain metadata.
 */
export function createMountainCanopy({THREE:T,records=[],camera,maxTriangles=6000000,maxDetailTriangles=2400000,detailNear=35,detailFar=80,farStart=220,farEnd=280,detailBlendHalfWidth=12,horizonStart=650,horizonEnd=900,horizonBlendHalfWidth=50,nearStart=0,nearEnd=0}={}){
  if(!T?.InstancedMesh)throw new Error('Mountain canopy requires the shared Three namespace');
  const began=performance.now(),group=new T.Group();group.name='Rooted mountain thickets / distant branch mantles';
  const source=records.filter(p=>p.mountain&&p.anchorMode==='sdf-surface'&&p.sdfAnchor?.position&&p.radius>.35);
  const raw=[],bins=new Map(),up=new T.Vector3(0,1,0);
  // A thicket joins neighbours only on the same actual support plane. It does
  // not stretch one planted seed across a ravine or merge different peaks.
  for(const plant of source){
    if(!plant.bush){raw.push({members:[plant],tree:true,root:plant});continue;}
    const a=plant.sdfAnchor.position,n=plant.sdfAnchor.normal,ix=Math.floor(a[0]/6),iy=Math.floor(a[1]/6),iz=Math.floor(a[2]/6);let found=null;
    for(let dz=-1;dz<=1&&!found;dz++)for(let dy=-1;dy<=1&&!found;dy++)for(let dx=-1;dx<=1&&!found;dx++)
      for(const c of bins.get(plant.peakIndex+':'+(ix+dx)+','+(iy+dy)+','+(iz+dz))||[]){
        if(c.members.length>=6||c.cliffScrub!==!!plant.cliffScrub)continue;const b=c.root.sdfAnchor.position,m=c.root.sdfAnchor.normal;
        const vx=a[0]-b[0],vy=a[1]-b[1],vz=a[2]-b[2];
        if(n[0]*m[0]+n[1]*m[1]+n[2]*m[2]<.84||vx*vx+vy*vy+vz*vz>25||Math.abs(vx*m[0]+vy*m[1]+vz*m[2])>1.15)continue;
        found=c;break;
      }
    if(found)found.members.push(plant);else{const c={members:[plant],tree:false,cliffScrub:!!plant.cliffScrub,root:plant};raw.push(c);
      const key=plant.peakIndex+':'+ix+','+iy+','+iz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);}
  }
  bins.clear();
  const prototypeIds=Array.from({length:MOUNTAIN_CROWN_PROTOTYPES},(_,i)=>i),geometries=prototypeIds.map(f=>createBotanicalCrownGeometry(T,f,{lod:'middle'})),distantGeometries=prototypeIds.map(f=>createBotanicalCrownGeometry(T,f,{lod:'distant'})),detailGeometries=prototypeIds.map(f=>createBotanicalCrownGeometry(T,f)),items=[],basis=new T.Matrix4(),matrix=new T.Matrix4(),q=new T.Quaternion();
  const horizon=createMountainHorizonSprays(T,{families:prototypeIds}),horizonGeometries=horizon.geometries;
  const axisX=new T.Vector3(),axisY=new T.Vector3(),axisZ=new T.Vector3(),position=new T.Vector3(),scale=new T.Vector3();
  function makeDetailedMember(plant){
    const seed=hash(plant.seed+plant.x*.013+plant.z*.019),tree=!plant.bush,cliff=!!plant.cliffScrub;
    const densityBase=tree?(plant.radius>5?16:plant.radius>3?12:0):0;
    const family=(cliff?8:tree?densityBase:4)+(tree?(plant.architecture??3):Math.min(3,Math.floor(seed*4)));
    const g=detailGeometries[family],box=g.boundingBox,ux=Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),uz=Math.max(Math.abs(box.min.z),Math.abs(box.max.z));
    const yAxis=new T.Vector3(),xAxis=new T.Vector3(),zAxis=new T.Vector3(),n=plant.sdfAnchor.normal,r=plant.radius;
    let ex,ez,h;
    if(cliff){yAxis.set(n[0]*.12,-1,n[2]*.12).normalize();xAxis.set(-n[2],0,n[0]).normalize();ex=r*.72;ez=r*.24;h=plant.height??r*.9;}
    else{
      yAxis.set(n[0]*(tree?.10:.14),tree?1:.86+n[1]*.14,n[2]*(tree?.10:.14)).normalize();
      xAxis.set(plant.lightX??1,0,plant.lightZ??0).addScaledVector(yAxis,-((plant.lightX??1)*yAxis.x+(plant.lightZ??0)*yAxis.z));
      if(xAxis.lengthSq()<.01)xAxis.crossVectors(up,yAxis);if(xAxis.lengthSq()<.01)xAxis.set(1,0,0);xAxis.normalize();
      ex=r*(tree?[1.05,.68,1.05,.65][family%4]:.90);ez=r*(tree?[.95,.63,.75,.62][family%4]:.87);h=tree?(plant.height??r*1.7):(plant.height??r*.78);
    }
    zAxis.crossVectors(xAxis,yAxis).normalize();const basis=new T.Matrix4().makeBasis(xAxis,yAxis,zAxis),rotation=new T.Quaternion().setFromRotationMatrix(basis);
    const scale=new T.Vector3(ex/ux,h/box.max.y,ez/uz),matrix=new T.Matrix4().compose(new T.Vector3(plant.x,plant.y,plant.z),rotation,scale);
    const tone=.83+.23*seed,moisture=plant.site?.moisture??.5;
    const middleBox=geometries[family].boundingBox,middleScale=new T.Vector3(ex/Math.max(Math.abs(middleBox.min.x),Math.abs(middleBox.max.x)),h/middleBox.max.y,ez/Math.max(Math.abs(middleBox.min.z),Math.abs(middleBox.max.z)));
    const middleMatrix=new T.Matrix4().compose(new T.Vector3(plant.x,plant.y,plant.z),rotation,middleScale);
    return {family,matrix:Float32Array.from(matrix.elements),color:[(.071+.016*moisture)*tone,(.145+.025*moisture)*tone,(.029+.011*moisture)*tone],
      bladeScale:4.4/Math.max(scale.x,scale.y,scale.z),middleMatrix:Float32Array.from(middleMatrix.elements),middleBladeScale:4.3/Math.max(middleScale.x,middleScale.y,middleScale.z),root:plant.sdfAnchor};
  }
  let mergedShrubs=0;
  for(const cluster of raw){
    let root=cluster.root;
    if(cluster.members.length>1)root=cluster.members.reduce((a,b)=>(cluster.cliffScrub?a.sdfAnchor.position[1]>=b.sdfAnchor.position[1]:a.sdfAnchor.position[1]<=b.sdfAnchor.position[1])?a:b);
    const seed=hash(root.seed+root.x*.013+root.z*.019),densityBase=cluster.tree?(root.radius>5?16:root.radius>3?12:0):0,family=(cluster.cliffScrub?8:cluster.tree?densityBase:4)+(cluster.tree?(root.architecture??3):Math.min(3,Math.floor(seed*4)));
    const g=geometries[family],box=g.boundingBox,unitX=Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),unitZ=Math.max(Math.abs(box.min.z),Math.abs(box.max.z));
    // Both the coarse woody stem and every branch begin at this real root.
    // Crown volume may lean into light; the support coordinate never moves.
    position.set(root.x,root.y,root.z);
    let extentX,extentZ,height,targetTopY=null;
    if(cluster.tree){
      const n=root.sdfAnchor.normal;axisY.set(n[0]*.10,1,n[2]*.10).normalize();axisX.set(root.lightX??1,0,root.lightZ??0).addScaledVector(axisY,-((root.lightX??1)*axisY.x+(root.lightZ??0)*axisY.z)).normalize();axisZ.crossVectors(axisX,axisY).normalize();
      const h=root.height??root.radius*1.7;
      extentX=root.radius*[1.05,.68,1.05,.65][family%4];extentZ=root.radius*[.95,.63,.75,.62][family%4];height=h;
    }else if(cluster.cliffScrub){
      const n=root.sdfAnchor.normal;axisY.set(n[0]*.12,-1,n[2]*.12).normalize();axisX.set(-n[2],0,n[0]).normalize();axisZ.crossVectors(axisX,axisY).normalize();
      extentX=root.radius*.72;extentZ=root.radius*.24;height=root.height??root.radius*.9;
      const a=root.sdfAnchor.position;for(const member of cluster.members){const b=member.sdfAnchor.position,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
        extentX=Math.max(extentX,Math.abs(dx*axisX.x+dy*axisX.y+dz*axisX.z)+member.radius*.72);
        height=Math.max(height,dx*axisY.x+dy*axisY.y+dz*axisY.z+(member.height??member.radius*.9));}
      extentX=Math.min(extentX,7.2);mergedShrubs+=cluster.members.length;
    }else{
      const n=root.sdfAnchor.normal;axisY.set(n[0]*.14,.86+n[1]*.14,n[2]*.14).normalize();axisX.set(root.lightX??1,0,root.lightZ??0).addScaledVector(axisY,-((root.lightX??1)*axisY.x+(root.lightZ??0)*axisY.z));
      if(axisX.lengthSq()<.01)axisX.crossVectors(up,axisY);if(axisX.lengthSq()<.01)axisX.set(1,0,0);axisX.normalize();axisZ.crossVectors(axisX,axisY).normalize();
      extentX=root.radius*.90;extentZ=root.radius*.87;height=root.height??root.radius*.78;targetTopY=root.sdfAnchor.position[1]+height;
      const a=root.sdfAnchor.position;
      for(const member of cluster.members){const b=member.sdfAnchor.position,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
        extentX=Math.max(extentX,Math.abs(dx*axisX.x+dy*axisX.y+dz*axisX.z)+member.radius*.82);
        extentZ=Math.max(extentZ,Math.abs(dx*axisZ.x+dy*axisZ.y+dz*axisZ.z)+member.radius*.82);height=Math.max(height,dy*axisY.y+dx*axisY.x+dz*axisY.z+(member.height??member.radius*.78));
        targetTopY=Math.max(targetTopY,b[1]+(member.height??member.radius*.78));}
      extentX=Math.min(extentX,7.2);extentZ=Math.min(extentZ,7.2);position.y+=.025;mergedShrubs+=cluster.members.length;
      const tip=g.userData.topPoint;
      height=Math.max(height,(targetTopY-position.y-axisX.y*tip[0]*extentX/unitX-axisZ.y*tip[2]*extentZ/unitZ)/axisY.y);
    }
    basis.makeBasis(axisX,axisY,axisZ);q.setFromRotationMatrix(basis);
    scale.set(extentX/unitX,height/box.max.y,extentZ/unitZ);matrix.compose(position,q,scale);
    const center=position.clone().addScaledVector(axisY,height*.52),boundRadius=Math.hypot(extentX,extentZ,height*.55);
    const tone=.83+.23*seed,moisture=root.site?.moisture??.5;
    items.push({family,matrix:Float32Array.from(matrix.elements),color:[(.071+.016*moisture)*tone,(.145+.025*moisture)*tone,(.029+.011*moisture)*tone],
      key:cluster.cliffScrub?-1:Math.min(.999999,hash(root.seed+31.7)),cliffScrub:!!cluster.cliffScrub,center,boundRadius,root:root.sdfAnchor,members:cluster.members.length,peakIndex:root.peakIndex,tree:cluster.tree,
      detailMembers:cluster.members.map(makeDetailedMember),growthAxis:axisY.toArray(),height,targetTopY,bladeScale:4.4/Math.max(scale.x,scale.y,scale.z),detailCutoff:detailNear+(detailFar-detailNear)*hash(root.seed+49.3),farCutoff:farStart+(farEnd-farStart)*hash(root.seed+71.9),horizonCutoff:horizonStart+(horizonEnd-horizonStart)*hash(root.seed+97.4)});
  }
  const cameraUniform={value:new T.Vector3()};
  // Reuse the installed THREE filtered Wyman hash, with world coordinates.
  // Isolated names avoid enabling the default local-position alpha hash,
  // which would otherwise apply a second random test to atlas leaf alpha.
  const worldHashGLSL=T.ShaderChunk.alphahash_pars_fragment
    .replace('#ifdef USE_ALPHAHASH','').replace('#endif','')
    .replaceAll('getAlphaHashThreshold','liCanopyWorldHash')
    .replaceAll('hash2D','liCanopyHash2D').replaceAll('hash3D','liCanopyHash3D')
    .replaceAll('ALPHA_HASH_SCALE','LI_CANOPY_HASH_SCALE');
  const sharedVaryings=`varying float vCanopyWood;varying float vCanopyKey;varying float vCanopyDistance;
    varying float vCanopyDetailCutoff;varying float vCanopyFarCutoff;varying vec3 vCanopyWorld;varying vec4 vCanopyTransition;`;
  function patchVertex(shader){
    shader.uniforms.uMountainCanopyCamera=cameraUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec3 liBladeRoot;attribute vec4 liCanopyLod;attribute vec4 liCanopyTransition;
      attribute float liCanopyKey;attribute float liCanopyWood;attribute vec3 liCanopyCenter;
      ${sharedVaryings}uniform vec3 uMountainCanopyCamera;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed=liBladeRoot+(transformed-liBladeRoot)*liCanopyLod.w;
        vCanopyKey=liCanopyKey;vCanopyWood=liCanopyWood;vCanopyDetailCutoff=liCanopyLod.y;vCanopyFarCutoff=liCanopyLod.z;
        vCanopyTransition=liCanopyTransition;
        vCanopyWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
        vCanopyDistance=max(0.,min(distance(liCanopyCenter,uMountainCanopyCamera),distance(vec3(liCanopyCenter.x,-liCanopyCenter.y,liCanopyCenter.z),uMountainCanopyCamera))-liCanopyLod.x);`);
  }
  const detailWeight=`smoothstep(vCanopyDetailCutoff-vCanopyTransition.y,vCanopyDetailCutoff+vCanopyTransition.y,vCanopyDistance)`;
  const horizonWeight=`smoothstep(vCanopyTransition.x-vCanopyTransition.w,vCanopyTransition.x+vCanopyTransition.w,vCanopyDistance)`;
  // Each visible transition has complementary weights. Hash only runs inside
  // the blend band; solid tiers do not pay for derivative filtering.
  const layerDiscard={
    detail:`float amount=${detailWeight};if(amount>=1.||(amount>0.&&liCanopyWorldHash(vCanopyWorld)<amount))discard;`,
    middle:`if(vCanopyDistance>=vCanopyFarCutoff)discard;float amount=${detailWeight};if(amount<=0.||(amount<1.&&liCanopyWorldHash(vCanopyWorld)>=amount))discard;`,
    distant:`if(vCanopyDistance<vCanopyFarCutoff)discard;float amount=${horizonWeight};if(amount>=1.||(amount>0.&&liCanopyWorldHash(vCanopyWorld)<amount))discard;`,
    horizon:`float amount=${horizonWeight};if(amount<=0.||(amount<1.&&liCanopyWorldHash(vCanopyWorld)>=amount))discard;`
  };
  function patchVisual(shader,tier){
    patchVertex(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      ${sharedVaryings}
${worldHashGLSL}`)
      // Atlas alphaTest preserves the spray's leaf shape BEFORE LOD fading.
      // Fade weights never multiply alphaTest, so neither layer hard-cuts at .45.
      .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
${layerDiscard[tier]}`);
    if(tier!=='detail')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 liLeafGroup=vCanopyWorld*4.8;
      float liLeafFootprint=max(length(dFdx(liLeafGroup)),length(dFdy(liLeafGroup)));
      float liLeafResolved=1.-smoothstep(.25,1.1,liLeafFootprint);
      float liLeafTone=sin(liLeafGroup.x*1.7+liLeafGroup.y*.8)*sin(liLeafGroup.z*1.9-liLeafGroup.y*.5);
      float liBranchTone=sin(vCanopyWorld.x*.71+vCanopyWorld.z*.47)*sin(vCanopyWorld.y*1.23-vCanopyWorld.z*.31);
      diffuseColor.rgb*=1.+.18*liLeafResolved*liLeafTone+.055*liBranchTone;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      if(vCanopyWood<.5){
        float liThrough=pow(max(dot(-normal,normalize(directionalLights[0].direction))+.25,0.)/1.25,2.);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(.08,.11,.035)*liThrough;
      }
      #endif`);
  }
  function foliageMaterial(tier,name,options={}){
    const m=new T.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide,...options});
    m.name=name;m.onBeforeCompile=shader=>patchVisual(shader,tier);m.customProgramCacheKey=()=>REVISION+'-'+tier;return m;
  }
  const material=foliageMaterial('middle','Open botanical sprays of independent folded mountain leaves');
  const distantMaterial=foliageMaterial('distant','Distant open folded-leaf mountain sprays');
  const detailMaterial=foliageMaterial('detail','Actual folded mountain leaves and connected tapered branches');
  const horizonMaterial=foliageMaterial('horizon','Horizon multi-direction botanical twig sprays',{
    map:horizon.map,normalMap:horizon.normalMap,normalScale:horizon.normalScale||new T.Vector2(.6,.6),alphaTest:horizon.alphaTest??.45});
  function volumeDepth(tier){
    const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide,
      ...(tier==='horizon'?{map:horizon.map,alphaTest:horizon.alphaTest??.45}:{})});
    depth.name='Stable '+tier+' open-canopy shadow';
    depth.onBeforeCompile=shader=>{
      patchVertex(shader);
      // Shadows ignore near-detail fading. Middle stays the near proxy, then
      // low and horizon exchange continuously at their shared world threshold.
      const discard=tier==='middle'?'if(vCanopyDistance>=vCanopyFarCutoff)discard;':layerDiscard[tier];
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        ${sharedVaryings}
${worldHashGLSL}`)
        .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
${discard}`);
    };
    depth.customProgramCacheKey=()=>REVISION+'-shadow-'+tier;return depth;
  }
  const farDepth=volumeDepth('middle'),distantDepth=volumeDepth('distant'),horizonDepth=volumeDepth('horizon');
  function makeMeshes(sourceGeometries,meshMaterial,detailed,distant=false,horizonLevel=false){return sourceGeometries.map((g,family)=>{
    // Capacity retains every actual member at every level. Adult families 12-19
    // carry stable crown-area density; budgets never replace or omit plants.
    const capacity=Math.max(1,items.reduce((n,c)=>n+c.detailMembers.filter(m=>m.family===family).length,0)),geometry=g.clone();
    geometry.setAttribute('liCanopyKey',new T.InstancedBufferAttribute(new Float32Array(capacity),1));
    geometry.setAttribute('liCanopyCenter',new T.InstancedBufferAttribute(new Float32Array(capacity*3),3));
    // Packed LOD: x=radius, y=detail cutoff, z=distant cutoff, w=leaf scale.
    geometry.setAttribute('liCanopyLod',new T.InstancedBufferAttribute(new Float32Array(capacity*4),4));
    // Transition: horizon cutoff, near/middle half-band, reserved far half-band, horizon half-band.
    geometry.setAttribute('liCanopyTransition',new T.InstancedBufferAttribute(new Float32Array(capacity*4),4));
    const mesh=new T.InstancedMesh(geometry,meshMaterial,capacity);mesh.name=(detailed?'Mountain botanical leaf crown family ':horizonLevel?'Mountain horizon spray family ':distant?'Mountain far low canopy family ':'Mountain middle canopy family ')+family;
    mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.castShadow=!detailed;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
    if(!detailed)mesh.customDepthMaterial=horizonLevel?horizonDepth:distant?distantDepth:farDepth;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.setColorAt(0,new T.Color());mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    for(const name of ['liCanopyKey','liCanopyCenter','liCanopyLod','liCanopyTransition'])geometry.attributes[name].setUsage(T.DynamicDrawUsage);
    group.add(mesh);return mesh;
  });}
  const meshes=makeMeshes(geometries,material,false),distantMeshes=makeMeshes(distantGeometries,distantMaterial,false,true),detailMeshes=makeMeshes(detailGeometries,detailMaterial,true),horizonMeshes=makeMeshes(horizonGeometries,horizonMaterial,false,false,true);
  const stats={revision:REVISION,externalAssets:0,sourcePlants:source.length,adultDensityPolicy:'Stable crown-radius bins: <=3m 1x, <=5m 4x, >5m 9x independent foliage shoots; physical leaf sizes unchanged',clusters:items.length,treeCrowns:items.filter(c=>c.tree).length,
    shrubThickets:items.filter(c=>!c.tree).length,cliffCurtains:items.filter(c=>c.cliffScrub).length,mergedShrubPlants:mergedShrubs,familyCounts:prototypeIds.map(f=>items.filter(c=>c.family===f).length),
    geometryTriangles:geometries.map(g=>g.userData.triangles),distantGeometryTriangles:distantGeometries.map(g=>g.userData.triangles),leafPlanesPerCrown:geometries.map(g=>g.userData.leafPlanes),leafCloudsPerCrown:geometries.map(g=>g.userData.leafClouds),proceduralAtlasSize:horizon.stats?.atlasSize??0,horizonGeometryTriangles:horizonGeometries.map(g=>g.userData.triangles),horizonTechnique:horizon.stats,middleIndividualLeavesPerCrown:geometries.map(g=>g.userData.leafCount),distantIndividualLeavesPerCrown:distantGeometries.map(g=>g.userData.leafCount),detailGeometryTriangles:detailGeometries.map(g=>g.userData.triangles),individualLeavesPerCrown:detailGeometries.map(g=>g.userData.leafCount),foliageTechnique:'Near: unmerged real plant roots with dense 3D compound shoots and individually folded small leaflets. Middle: independent member roots and folded leaves. Distant: the same seven shoots with small single-triangle leaves. Both retain every actual member, with world-size caps and no closed shell. Adult trees, basal shrubs and hanging creepers use distinct shared near/far habits. Horizon uses independent multi-direction twig sprays only beyond its distant blend band. Filtered world-hash transitions; no close leaf-cluster planes',heightRange:items.length?items.reduce((a,c)=>[Math.min(a[0],c.height),Math.max(a[1],c.height)],[Infinity,-Infinity]):[0,0],triangleBudget:maxTriangles,detailTriangleSoftBudget:maxDetailTriangles,detailNear,detailFar,farStart,farEnd,detailBlendHalfWidth,horizonStart,horizonEnd,horizonBlendHalfWidth,budgetPolicy:'Fixed per-cluster distance thresholds; budgets record costs, never omit candidate plants',shadowRepresentation:'Near-independent middle/low leaf proxies, then complementary world-hash horizon spray shadows',exactIndividualLeafShadows:false,visibleTriangles:0,visibleClusters:0,horizonTriangles:0,horizonInstances:0,detailTriangles:0,detailClusters:0,detailMandatoryOverflow:0,drawCalls:0,
    nearStart,nearEnd,generation:0,disposed:false,buildMilliseconds:performance.now()-began,horizonWoodVariant:'baseline',horizonBaselineTriangles:0,horizonSavedWoodTriangles:0,horizonSavedWoodFraction:0,
    rootMethod:'Connected tapered tube skeleton begins at exact embedded SDF member root: lowest for upright woodland, highest for hanging cliff curtains; each actual leaf begins at a shoot axil',lod:'Stable parent-cluster thresholds and filtered world-space alpha-hash blends; all actual member roots retained',instanceVertexAttributeSlots:14,horizonVertexAttributeSlots:15,castsAdditionalShadow:true};
  const forward=new T.Vector3(),lastPosition=new T.Vector3(Infinity,Infinity,Infinity),lastQuaternion=new T.Quaternion();
  let lastUpdate=-Infinity,lastProjection='';
  function update(nextCamera=camera,{force=false}={}){
    if(stats.disposed||!nextCamera)return {...stats};nextCamera.updateMatrixWorld();nextCamera.getWorldPosition(cameraUniform.value);
    const now=performance.now(),position=cameraUniform.value;
    const moved=position.distanceToSquared(lastPosition)>25,turned=Math.abs(nextCamera.quaternion.dot(lastQuaternion))<.998;
    const projectionKey=[nextCamera.fov,nextCamera.aspect,nextCamera.zoom].join(','),projectionChanged=projectionKey!==lastProjection;
    if(!force&&!projectionChanged&&!moved&&!turned&&now-lastUpdate<180)return {...stats};
    // Camera uniforms above remain exact. Candidate bounds have a 12 m margin
    // and a widened cone, so unchanged / sub-cell poses need no rebuild even
    // when a capture asks to prewarm. This also keeps fixed-view timing from
    // paying for a 90k-item sort on every otherwise identical frame.
    if(!projectionChanged&&!moved&&!turned)return {...stats};
    nextCamera.getWorldDirection(forward);const horizontalLength=Math.hypot(forward.x,forward.z),fx=forward.x/Math.max(.001,horizontalLength),fz=forward.z/Math.max(.001,horizontalLength);
    const halfAngle=Math.min(Math.PI*.82,Math.atan(Math.tan((nextCamera.fov||58)*Math.PI/360)*(nextCamera.aspect||1))+.40);
    const focal=(nextCamera.isPerspectiveCamera?1/Math.tan(nextCamera.fov*Math.PI/360):1)*450,candidates=[];
    for(const item of items){
      const dx=item.center.x-position.x,dz=item.center.z-position.z,horizontalDistance=Math.hypot(dx,dz);
      const d=Math.min(item.center.distanceTo(position),Math.hypot(dx,item.center.y+position.y,dz));
      if(d>4800||item.boundRadius*focal/Math.max(1,d)<.45)continue;
      // Vertical frustum rejection would remove a high slope visible only in
      // the planar reflection. A conservative shared horizontal cone retains
      // both main and mirror-Y views; exact raster clipping belongs to THREE.
      const margin=Math.asin(Math.min(1,(item.boundRadius+12)/Math.max(1,horizontalDistance)));
      if(horizontalLength>.15&&horizontalDistance>item.boundRadius+12&&(dx*fx+dz*fz)/horizontalDistance<Math.cos(Math.min(Math.PI,halfAngle+margin)))continue;
      candidates.push({item,nearDistance:Math.max(0,d-item.boundRadius),score:item.boundRadius*item.boundRadius/Math.max(1,d*d)});
    }
    stats.candidateClusters=candidates.length;
    const counts=prototypeIds.map(()=>0),distantCounts=prototypeIds.map(()=>0),horizonCounts=prototypeIds.map(()=>0),detailCounts=prototypeIds.map(()=>0),selectedDetails=new Set();let triangles=0,distantTriangles=0,horizonTriangles=0,detailTriangles=0;
    function write(mesh,n,item,cutoff,member){
      const near=mesh.material===detailMaterial,leafScale=near?member.bladeScale:member.middleBladeScale*(mesh.material===distantMaterial?4/4.3:1);
      mesh.instanceMatrix.array.set(near?member.matrix:member.middleMatrix,n*16);mesh.instanceColor.array.set(member.color,n*3);
      const attributes=mesh.geometry.attributes;attributes.liCanopyKey.setX(n,item.key);
      attributes.liCanopyCenter.setXYZ(n,item.center.x,item.center.y,item.center.z);attributes.liCanopyLod.setXYZW(n,item.boundRadius,cutoff,item.farCutoff,leafScale);
      attributes.liCanopyTransition.setXYZW(n,item.horizonCutoff,detailBlendHalfWidth,0,horizonBlendHalfWidth);
    }
    // A 6 m preload margin covers the 5 m candidate-cache cell. Every
    // cluster keeps its fixed threshold; neither tier's budget changes it.
    for(const {item,nearDistance}of candidates){
      if(nearDistance<=item.detailCutoff+detailBlendHalfWidth+6){
        for(const member of item.detailMembers){
          write(detailMeshes[member.family],detailCounts[member.family]++,item,item.detailCutoff,member);
          detailTriangles+=detailGeometries[member.family].userData.triangles;
        }
        selectedDetails.add(item);
      }
      for(const member of item.detailMembers){
        if(nearDistance<=item.farCutoff+6){write(meshes[member.family],counts[member.family]++,item,item.detailCutoff,member);triangles+=geometries[member.family].userData.triangles;}
        if(nearDistance>=item.farCutoff-6&&nearDistance<=item.horizonCutoff+horizonBlendHalfWidth+6){write(distantMeshes[member.family],distantCounts[member.family]++,item,item.detailCutoff,member);distantTriangles+=distantGeometries[member.family].userData.triangles;}
        if(nearDistance>=item.horizonCutoff-horizonBlendHalfWidth-6){write(horizonMeshes[member.family],horizonCounts[member.family]++,item,item.detailCutoff,member);horizonTriangles+=horizonGeometries[member.family].userData.triangles;}
      }
    }
    function upload(collection,amounts){for(let f=0;f<MOUNTAIN_CROWN_PROTOTYPES;f++){
      const mesh=collection[f],count=amounts[f];mesh.count=count;mesh.visible=count>0;
      if(!count)continue;
      for(const attribute of [mesh.instanceMatrix,mesh.instanceColor,...['liCanopyKey','liCanopyCenter','liCanopyLod','liCanopyTransition'].map(name=>mesh.geometry.attributes[name])]){
        attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;
      }
    }}
    upload(meshes,counts);upload(distantMeshes,distantCounts);upload(detailMeshes,detailCounts);upload(horizonMeshes,horizonCounts);
    lastPosition.copy(position);lastQuaternion.copy(nextCamera.quaternion);lastProjection=projectionKey;lastUpdate=now;stats.generation++;
    stats.visibleTriangles=triangles+distantTriangles+horizonTriangles+detailTriangles;stats.farTriangles=triangles+distantTriangles+horizonTriangles;stats.horizonTriangles=horizonTriangles;stats.middleTriangles=triangles;stats.distantTriangles=distantTriangles;
    stats.visibleClusters=candidates.length;stats.omittedByBudget=0;stats.middleInstances=counts.reduce((a,b)=>a+b,0);stats.distantInstances=distantCounts.reduce((a,b)=>a+b,0);stats.horizonInstances=horizonCounts.reduce((a,b)=>a+b,0);
    stats.farBudgetOverflow=Math.max(0,stats.farTriangles-maxTriangles);stats.detailTriangles=detailTriangles;stats.detailClusters=selectedDetails.size;
    stats.detailPlants=detailCounts.reduce((a,b)=>a+b,0);stats.detailMandatoryOverflow=Math.max(0,detailTriangles-maxDetailTriangles);stats.detailSoftBudgetOverflowTriangles=stats.detailMandatoryOverflow;
    stats.horizonBaselineTriangles=horizonCounts.reduce((sum,count,f)=>sum+count*horizonGeometries[f].userData.baselineTriangles,0);stats.horizonSavedWoodTriangles=stats.horizonBaselineTriangles-horizonTriangles;stats.horizonSavedWoodFraction=stats.horizonBaselineTriangles?stats.horizonSavedWoodTriangles/stats.horizonBaselineTriangles:0;
    stats.shadowSubmittedTriangles=stats.farTriangles;stats.drawCalls=counts.filter(n=>n>0).length+distantCounts.filter(n=>n>0).length+detailCounts.filter(n=>n>0).length+horizonCounts.filter(n=>n>0).length;return {...stats};
  }
  function setHorizonWoodVariant(variant){
    if(variant!=='baseline'&&variant!=='optimized')throw new RangeError('Unknown horizon wood variant: '+variant);
    if(stats.disposed||variant===stats.horizonWoodVariant)return {...stats};
    const previousTriangles=stats.horizonTriangles;let activeTriangles=0,baselineTriangles=0;
    for(const family of prototypeIds){
      const data=horizon.woodVariants[family][variant],prototype=horizonGeometries[family],mesh=horizonMeshes[family];
      // The actual InstancedMesh owns a geometry clone. Update both fixed-size
      // buffers, never replace/resize a live WebGL index allocation. Bounding
      // volumes and every vertex/instance/material/texture remain unchanged.
      for(const geometry of [prototype,mesh.geometry]){geometry.index.array.set(data);geometry.index.needsUpdate=true;geometry.setDrawRange(0,data.length);geometry.userData.triangles=data.length/3;}
      activeTriangles+=mesh.count*(data.length/3);baselineTriangles+=mesh.count*prototype.userData.baselineTriangles;
    }
    stats.horizonWoodVariant=variant;stats.horizonGeometryTriangles=horizonGeometries.map(g=>g.userData.triangles);horizon.stats.geometryTriangles=stats.horizonGeometryTriangles.slice();
    stats.horizonTriangles=activeTriangles;stats.horizonBaselineTriangles=baselineTriangles;stats.horizonSavedWoodTriangles=baselineTriangles-activeTriangles;stats.horizonSavedWoodFraction=baselineTriangles?(baselineTriangles-activeTriangles)/baselineTriangles:0;
    stats.visibleTriangles+=activeTriangles-previousTriangles;stats.farTriangles=(stats.farTriangles||0)+activeTriangles-previousTriangles;stats.farBudgetOverflow=Math.max(0,stats.farTriangles-maxTriangles);stats.shadowSubmittedTriangles=stats.farTriangles;
    // Geometry changed even at a static camera: this invalidates the parent's
    // paused frame signature and shadow cache without touching plant selection.
    stats.generation++;return {...stats};
  }
  setHorizonWoodVariant('optimized');
  return {group,materials:[material,distantMaterial,detailMaterial,horizonMaterial],update,prewarm:nextCamera=>update(nextCamera,{force:true}),getStats:()=>({...stats}),setHorizonWoodVariant,
    getClusters:({limit=Infinity}={})=>items.slice(0,limit).map(c=>({family:c.family,peakIndex:c.peakIndex,members:c.members,tree:c.tree,
      root:c.root,cliffScrub:c.cliffScrub,center:c.center.toArray(),boundRadius:c.boundRadius,growthAxis:c.growthAxis.slice(),height:c.height,targetTopY:c.targetTopY,detailCutoff:c.detailCutoff,farCutoff:c.farCutoff,horizonCutoff:c.horizonCutoff})),
    dispose(){if(stats.disposed)return;stats.disposed=true;for(const mesh of [...meshes,...distantMeshes,...detailMeshes,...horizonMeshes]){mesh.dispose();mesh.geometry.dispose();}[...geometries,...distantGeometries,...detailGeometries,...horizonGeometries].forEach(g=>g.dispose());material.dispose();distantMaterial.dispose();detailMaterial.dispose();farDepth.dispose();distantDepth.dispose();horizonDepth.dispose();horizonMaterial.dispose();horizon.disposeTextures();group.removeFromParent();group.clear();items.length=0;raw.length=0;source.length=0;stats.visibleTriangles=0;stats.visibleClusters=0;stats.detailTriangles=0;stats.detailClusters=0;stats.detailPlants=0;stats.farTriangles=0;stats.middleTriangles=0;stats.distantTriangles=0;stats.horizonTriangles=0;stats.horizonInstances=0;stats.horizonBaselineTriangles=0;stats.horizonSavedWoodTriangles=0;stats.horizonSavedWoodFraction=0;stats.middleInstances=0;stats.distantInstances=0;stats.shadowSubmittedTriangles=0;stats.candidateClusters=0;stats.drawCalls=0;}};
}
