import * as THREE from 'three';

// SPACE08 consumes actual exported window positions, including corner facades,
// proxy replacements and the openings suppressed by shared walls. No inferred
// centre/width/index pattern is reused from the 17-house SPACE06 layout.
const OLD_HOUSES=[{x:-11,width:5.6,eaves:5.1},{x:-3,width:5.8,eaves:6},{x:4.8,width:5.6,eaves:4.8}];
const WARM_NAMES=new Set(['SPACE08_WindowWarm','SPACE03_WindowWarm']);

function sourceWarm(material){return material.name.split(' / ').find(name=>WARM_NAMES.has(name))??null;}

function descriptor(houseId,face,label,axis,plane,center,direction,u,y,width,height,extra={}) {
  const depth=extra.original?-.23:-.215;
  const worldCenter=axis==='Y'?[center+u,y,-(plane+depth*direction)]:[plane+depth*direction,y,-(center+u)];
  const normal=axis==='Y'?[0,0,-direction]:[direction,0,0];
  const tangent=axis==='Y'?[1,0,0]:[0,0,-1];
  return {id:`${houseId}/${face}/${label}`,houseId,face,axis,plane,center,direction,u,y,
    width,height,innerWidth:width-.15,innerHeight:height-.15,worldCenter,normal,tangent,
    depth,sourcePaneDepth:extra.original?-.15:-.12,sourceBackDepth:extra.original?-.265:-.245,
    clothDepth:extra.original?null:-.175,existingWarm:false,original:false,...extra};
}

function explicitWindow(house,window) {
  if(!Array.isArray(window.center)||!Array.isArray(window.outward_xy)||!Array.isArray(window.tangent_xy))
    throw new Error('SPACE08 window has no explicit world transform: '+window.id);
  const depth=-.215,[x,y,z]=window.center,[nx,ny]=window.outward_xy,[tx,ty]=window.tangent_xy;
  if(!(window.back_depth<depth&&depth<window.pane_depth))throw new Error('SPACE08 light depth lies outside its reveal: '+window.id);
  return {id:window.id,houseId:house.id,face:window.side,width:window.width,height:window.height,
    innerWidth:window.width-.15,innerHeight:window.height-.15,
    worldCenter:[x+nx*depth,z,-(y+ny*depth)],normal:[nx,0,-ny],tangent:[tx,0,-ty],depth,
    sourcePaneDepth:window.pane_depth,sourceBackDepth:window.back_depth,clothDepth:window.linen_depth,
    existingWarm:window.existing_warm,hasPhysicalCurtain:window.has_curtain,original:false,
    sourceManifestId:window.id,upper:window.upper};
}

function originalWindows(house,index) {
  const id=`original-opposite-${index+1}`,upper=house.eaves-.99,h=Math.min(1.3,(house.eaves-.85)*.30),windows={};
  for(const sign of [-1,1]){
    const side=sign<0?'left':'right',offset=sign*house.width*.265,base=index*10+(sign<0?0:3);
    windows[`front-${side}-upper`]=descriptor(id,'front',`${side}-upper`,'Y',-16.35,house.x,1,offset,upper,.86,h,
      {original:true,existingWarm:(index===0&&sign<0)||(index===2&&sign>0),backdropIndex:base});
    windows[`front-${side}-lower`]=descriptor(id,'front',`${side}-lower`,'Y',-16.35,house.x,1,offset,1.9,.78,1.02,
      {original:true,backdropIndex:base+1});
    windows[`rear-${side}`]=descriptor(id,'rear',side,'Y',-21.35,house.x,-1,offset,upper,.78,1.10,
      {original:true,backdropIndex:base+2});
    windows[`side-${side}`]=descriptor(id,side,'upper','X',house.x+sign*house.width/2,-18.85,sign,0,upper,.90,1.07,
      {original:true,backdropIndex:index*10+(sign<0?7:9)});
  }
  return windows;
}

export function windowLightPlan(neighbourhood) {
  const houses=neighbourhood?.buildings?.houses;
  if(!Array.isArray(houses)||!houses.length)throw new Error('SPACE08 window lights require the explicit house/window manifest.');
  const selected=[],coverage=[];
  houses.forEach((house,index)=>{
    if(!Array.isArray(house.windows)||!house.windows.length)throw new Error('Missing explicit windows for '+house.id);
    const windows=house.windows.map(window=>explicitWindow(house,window));
    const seed=[...house.id].reduce((sum,char,i)=>sum+char.charCodeAt(0)*(i+1),0);
    const front=windows.filter(window=>window.face==='front'),rear=windows.filter(window=>window.face==='rear');
    if(!front.length||!rear.length)throw new Error('SPACE08 house has no front/rear window coverage: '+house.id);
    const choices=windows.filter(window=>window.existingWarm);
    const add=window=>{if(window&&!choices.some(chosen=>chosen.id===window.id))choices.push(window);};
    if(!choices.some(window=>window.face==='front'))add(front[seed%front.length]);
    if(!choices.some(window=>window.face==='rear'))add(rear[(seed>>1)%rear.length]);
    const side=house.secondary_front?windows.filter(window=>window.face===house.secondary_front):[];
    if(side.length&&choices.length<3)add(side[seed%side.length]);
    else if(seed%4===0&&choices.length<3)add(front.find(window=>!choices.some(chosen=>chosen.id===window.id)));
    if(choices.length>3)throw new Error('Too many existing warm windows in '+house.id);
    choices.forEach((window,order)=>selected.push({...window,batch:(index+order)%3,brightness:.80+((seed+order*2)%5)*.055}));
    coverage.push({houseId:house.id,group:house.group,litWindows:choices.length,totalWindows:windows.length,
      windows:choices.map(window=>window.id),secondaryFront:house.secondary_front,original:false});
  });
  const oldChoices=[['front-left-upper','front-right-lower','rear-left'],['front-left-upper','side-right'],
    ['front-right-upper','front-left-lower','rear-right']];
  OLD_HOUSES.forEach((house,index)=>{
    const windows=originalWindows(house,index),choices=oldChoices[index];
    choices.forEach((key,order)=>selected.push({...windows[key],batch:(index+order+1)%3,brightness:.82+order*.07}));
    coverage.push({houseId:`original-opposite-${index+1}`,group:'original-opposite',litWindows:choices.length,totalWindows:10,
      windows:choices.map(key=>windows[key].id),original:true});
  });
  return {windows:selected,coverage};
}

function lightMaterial(batch) {
  const tint=['ffd39b','ffe2b8','edc394'][batch],intensity=[1.55,1.30,1.10][batch];
  const material=new THREE.MeshStandardMaterial({
    name:`SPACE08_WindowLight_${batch+1}`,color:new THREE.Color(.025,.016,.008),
    emissive:new THREE.Color('#'+tint),emissiveIntensity:intensity,roughness:.92,metalness:0,
    side:THREE.FrontSide,depthWrite:true,dithering:true,
  });
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 space08WindowUV;
      attribute vec3 space08WindowParameters;
      attribute vec2 space08OpeningRatio;
      varying vec2 vSpace08WindowUV;
      varying vec3 vSpace08WindowParameters;
      varying vec2 vSpace08OpeningRatio;
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vSpace08WindowUV=space08WindowUV;
      vSpace08WindowParameters=space08WindowParameters;
      vSpace08OpeningRatio=space08OpeningRatio;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vSpace08WindowUV;
      varying vec3 vSpace08WindowParameters;
      varying vec2 vSpace08OpeningRatio;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      // Original SPACE04 linen is a shader on the opaque backboard. Leave its
      // actual margins exposed instead of painting a bright sheet over them.
      if(vSpace08WindowParameters.y>.5){
        vec2 openingUV=(vSpace08WindowUV-.5)*vSpace08OpeningRatio+.5;
        float hem=.205+.018*sin(openingUV.y*6.5+vSpace08WindowParameters.z*.7);
        if(openingUV.x<hem+.035||openingUV.x>.83)discard;
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 litUV=vSpace08WindowUV;
      float edge=smoothstep(0.,.10,litUV.x)*(1.-smoothstep(.90,1.,litUV.x))
        *smoothstep(0.,.12,litUV.y)*(1.-smoothstep(.87,1.,litUV.y));
      float interior=.84+.16*sin(litUV.y*2.5+.4);
      totalEmissiveRadiance*=vSpace08WindowParameters.x*mix(.62,1.,edge)*interior;
    `);
  };
  material.customProgramCacheKey=()=>`space08-recessed-window-light-${batch}-01`;
  return material;
}

function batchGeometry(windows) {
  const positions=[],normals=[],uv=[],parameters=[],ratios=[],indices=[];
  windows.forEach(window=>{
    const center=new THREE.Vector3(...window.worldCenter),tangent=new THREE.Vector3(...window.tangent),normal=new THREE.Vector3(...window.normal);
    const start=positions.length/3;
    for(const [u,v]of [[0,0],[1,0],[1,1],[0,1]]){
      const point=center.clone().addScaledVector(tangent,(u-.5)*window.innerWidth);
      point.y+=(v-.5)*window.innerHeight;
      positions.push(...point.toArray());normals.push(...normal.toArray());uv.push(u,v);
      parameters.push(window.brightness,window.original?1:0,window.backdropIndex??0);
      ratios.push(window.innerWidth/window.width,window.innerHeight/window.height);
    }
    const positive=new THREE.Vector3().crossVectors(tangent,new THREE.Vector3(0,1,0)).dot(normal)>0;
    const order=positive?[0,1,2,0,2,3]:[0,2,1,0,3,2];
    indices.push(...order.map(index=>start+index));
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('space08WindowUV',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('space08WindowParameters',new THREE.Float32BufferAttribute(parameters,3));
  geometry.setAttribute('space08OpeningRatio',new THREE.Float32BufferAttribute(ratios,2));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

export function applyWindowLights(scene,model,neighbourhood) {
  const plan=windowLightPlan(neighbourhood),newWindows=plan.windows.filter(window=>!window.existingWarm);
  const group=new THREE.Group();group.name='SPACE08_RecessedWindowLights';
  group.userData.space08WindowLights=true;
  const ownMeshes=[],warmCache=new Map(),replacements=[];
  for(let batch=0;batch<3;batch++){
    const windows=newWindows.filter(window=>window.batch===batch);if(!windows.length)continue;
    const mesh=new THREE.Mesh(batchGeometry(windows),lightMaterial(batch));
    mesh.name=`SPACE08_WindowLights_Batch_${batch+1}`;mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.userData.space08WindowLights=true;mesh.userData.windowIds=windows.map(window=>window.id);
    group.add(mesh);ownMeshes.push(mesh);
  }
  model.traverse(part=>{
    if(!part.isMesh)return;
    const original=part.material,list=Array.isArray(original)?original:[original];let changed=false;
    const next=list.map(source=>{
      const kind=sourceWarm(source);if(!kind)return source;
      changed=true;
      if(!warmCache.has(source)){
        const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey.call(source);
        material.name=`Space 08 / ${source.name}`;
        material.emissive=new THREE.Color('#ffd39c');material.emissiveIntensity=kind==='SPACE08_WindowWarm'?1.20:1.05;
        material.onBeforeCompile=(shader,renderer)=>compile.call(material,shader,renderer);
        material.customProgramCacheKey=()=>key+'/space08-existing-warm-pane-01';
        material.needsUpdate=true;warmCache.set(source,material);
      }
      return warmCache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
  });
  scene.add(group);
  const metadata={
    version:'space-08-scattered-occupied-windows',coordinateSystem:'Three X,Y,Z = Blender X,Z,-Y',
    addedMeshes:ownMeshes.length,addedDrawCalls:ownMeshes.length,addedTriangles:newWindows.length*2,
    addedLights:0,newTextures:0,litWindowCount:plan.windows.length,addedWindowSheets:newWindows.length,
    existingWarmWindows:plan.windows.filter(window=>window.existingWarm).length,
    boostedSourceMaterials:[...warmCache.keys()].map(material=>material.name),
    coverage:plan.coverage,windows:plan.windows,
    selection:'Stable building identities and explicit manifest windows; 2–3 explicit windows per new house, at least one front and one rear window each, selected additional front/side windows.',
    existingCurtains:'New-house linen remains physically in front of the light sheet; old procedural linen margins are exposed by clipping the added sheet.',
    preserved:'All original geometry, panes, frames, curtains and closed backboards. Existing warm source materials are cloned; no PointLight or interior rooms.',
  };
  const previousMetadata=scene.userData.space08Windows;scene.userData.space08Windows=metadata;
  let disposed=false;
  return {metadata,dispose(){
    if(disposed)return;disposed=true;group.removeFromParent();
    replacements.forEach(({part,original})=>{part.material=original;});
    warmCache.forEach(material=>material.dispose());
    ownMeshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
    if(scene.userData.space08Windows===metadata){
      if(previousMetadata===undefined)delete scene.userData.space08Windows;
      else scene.userData.space08Windows=previousMetadata;
    }
  }};
}
