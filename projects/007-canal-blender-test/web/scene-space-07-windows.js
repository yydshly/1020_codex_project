import * as THREE from 'three';

// Existing facade geometry is the authority: SPACE06 window() uses panes at
// -.12m, linen at -.175m and closed backs at -.245m. These light sheets sit
// behind the cloth and glass, inside the original shallow opening.
const OLD_HOUSES=[{x:-11,width:5.6,eaves:5.1},{x:-3,width:5.8,eaves:6},{x:4.8,width:5.6,eaves:4.8}];
const WARM_NAMES=new Set(['SPACE06_WindowWarm','SPACE03_WindowWarm']);

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

function neighbourhoodWindows(house,index) {
  const [left,bottom,right,top]=house.footprint,x=(left+right)/2,z=(bottom+top)/2;
  const width=right-left,depth=top-bottom,direction=house.facade_direction_y;
  const front=z+direction*depth/2,rear=z-direction*depth/2,upper=house.eaves_z-.99;
  const w=[.88,.96,1.02][index%3],h=[1.24,1.34,1.29][index%3],result={};
  for(const sign of [-1,1]){
    const side=sign<0?'left':'right';
    result[`front-${side}-upper`]=descriptor(house.id,'front',`${side}-upper`,'Y',front,x,direction,sign*width*.265,upper,w,h,
      {existingWarm:sign<0&&index%4===0,hasPhysicalCurtain:true});
    result[`front-${side}-lower`]=descriptor(house.id,'front',`${side}-lower`,'Y',front,x,direction,sign*width*.265,house.base_z+1.24,w-.07,1.14,
      {hasPhysicalCurtain:index%2===0});
    result[`rear-${side}`]=descriptor(house.id,'rear',side,'Y',rear,x,-direction,sign*width*.26,upper,.80,1.08,
      {hasPhysicalCurtain:sign<0});
    result[`side-${side}`]=descriptor(house.id,side,'upper','X',sign<0?left:right,z,sign,0,upper,.83,1.12,
      {hasPhysicalCurtain:true});
  }
  return result;
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
  if(!Array.isArray(houses)||!houses.length)throw new Error('SPACE07 window lights require the SPACE06 house manifest.');
  const selected=[],coverage=[];
  houses.forEach((house,index)=>{
    if(!Array.isArray(house.footprint)||house.footprint.length!==4||!Number.isFinite(house.eaves_z))
      throw new Error('Incomplete SPACE06 window dimensions for '+house.id);
    const windows=neighbourhoodWindows(house,index),count=Math.max(2,index%5===0?1:index%3===0?3:2);
    const choices=[index%4===0?'front-left-upper':index%2?'front-right-lower':'front-left-upper'];
    // Both street-facing and garden-facing elevations have occupied windows,
    // including the southern row when seen from the reverse overview.
    choices.push(index%2?'rear-right':'rear-left');
    if(count>=3)choices.push(index%2?'side-right':'front-right-lower');
    choices.forEach((key,order)=>selected.push({...windows[key],batch:(index+order)%3,brightness:.80+((index*3+order*2)%5)*.055}));
    coverage.push({houseId:house.id,group:house.group,litWindows:choices.length,totalWindows:house.windows??8,
      windows:choices.map(key=>windows[key].id),original:false});
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
    name:`SPACE07_WindowLight_${batch+1}`,color:new THREE.Color(.025,.016,.008),
    emissive:new THREE.Color('#'+tint),emissiveIntensity:intensity,roughness:.92,metalness:0,
    side:THREE.FrontSide,depthWrite:true,dithering:true,
  });
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 space07WindowUV;
      attribute vec3 space07WindowParameters;
      attribute vec2 space07OpeningRatio;
      varying vec2 vSpace07WindowUV;
      varying vec3 vSpace07WindowParameters;
      varying vec2 vSpace07OpeningRatio;
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vSpace07WindowUV=space07WindowUV;
      vSpace07WindowParameters=space07WindowParameters;
      vSpace07OpeningRatio=space07OpeningRatio;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vSpace07WindowUV;
      varying vec3 vSpace07WindowParameters;
      varying vec2 vSpace07OpeningRatio;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      // Original SPACE04 linen is a shader on the opaque backboard. Leave its
      // actual margins exposed instead of painting a bright sheet over them.
      if(vSpace07WindowParameters.y>.5){
        vec2 openingUV=(vSpace07WindowUV-.5)*vSpace07OpeningRatio+.5;
        float hem=.205+.018*sin(openingUV.y*6.5+vSpace07WindowParameters.z*.7);
        if(openingUV.x<hem+.035||openingUV.x>.83)discard;
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 litUV=vSpace07WindowUV;
      float edge=smoothstep(0.,.10,litUV.x)*(1.-smoothstep(.90,1.,litUV.x))
        *smoothstep(0.,.12,litUV.y)*(1.-smoothstep(.87,1.,litUV.y));
      float interior=.84+.16*sin(litUV.y*2.5+.4);
      totalEmissiveRadiance*=vSpace07WindowParameters.x*mix(.62,1.,edge)*interior;
    `);
  };
  material.customProgramCacheKey=()=>`space07-recessed-window-light-${batch}-01`;
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
  geometry.setAttribute('space07WindowUV',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('space07WindowParameters',new THREE.Float32BufferAttribute(parameters,3));
  geometry.setAttribute('space07OpeningRatio',new THREE.Float32BufferAttribute(ratios,2));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

export function applyWindowLights(scene,model,neighbourhood) {
  const plan=windowLightPlan(neighbourhood),newWindows=plan.windows.filter(window=>!window.existingWarm);
  const group=new THREE.Group();group.name='SPACE07_RecessedWindowLights';
  group.userData.space07WindowLights=true;
  const ownMeshes=[],warmCache=new Map(),replacements=[];
  for(let batch=0;batch<3;batch++){
    const windows=newWindows.filter(window=>window.batch===batch);if(!windows.length)continue;
    const mesh=new THREE.Mesh(batchGeometry(windows),lightMaterial(batch));
    mesh.name=`SPACE07_WindowLights_Batch_${batch+1}`;mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.userData.space07WindowLights=true;mesh.userData.windowIds=windows.map(window=>window.id);
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
        material.name=`Space 07 / ${source.name}`;
        material.emissive=new THREE.Color('#ffd39c');material.emissiveIntensity=kind==='SPACE06_WindowWarm'?1.20:1.05;
        material.onBeforeCompile=(shader,renderer)=>compile.call(material,shader,renderer);
        material.customProgramCacheKey=()=>key+'/space07-existing-warm-pane-01';
        material.needsUpdate=true;warmCache.set(source,material);
      }
      return warmCache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
  });
  scene.add(group);
  const metadata={
    version:'space-07-scattered-occupied-windows',coordinateSystem:'Three X,Y,Z = Blender X,Z,-Y',
    addedMeshes:ownMeshes.length,addedDrawCalls:ownMeshes.length,addedTriangles:newWindows.length*2,
    addedLights:0,newTextures:0,litWindowCount:plan.windows.length,addedWindowSheets:newWindows.length,
    existingWarmWindows:plan.windows.filter(window=>window.existingWarm).length,
    boostedSourceMaterials:[...warmCache.keys()].map(material=>material.name),
    coverage:plan.coverage,windows:plan.windows,
    selection:'Deterministic manifest order; 2–3 of 8 windows per new house, at least one front and one rear window each, selected additional front/side windows.',
    existingCurtains:'New-house linen remains physically in front of the light sheet; old procedural linen margins are exposed by clipping the added sheet.',
    preserved:'All original geometry, panes, frames, curtains and closed backboards. Existing warm source materials are cloned; no PointLight or interior rooms.',
  };
  const previousMetadata=scene.userData.space07Windows;scene.userData.space07Windows=metadata;
  let disposed=false;
  return {metadata,dispose(){
    if(disposed)return;disposed=true;group.removeFromParent();
    replacements.forEach(({part,original})=>{part.material=original;});
    warmCache.forEach(material=>material.dispose());
    ownMeshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
    if(scene.userData.space07Windows===metadata){
      if(previousMetadata===undefined)delete scene.userData.space07Windows;
      else scene.userData.space07Windows=previousMetadata;
    }
  }};
}
