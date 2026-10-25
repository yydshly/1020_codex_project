import * as THREE from 'three';
import { setupEnvironment as setupPrevious } from './shop-study-01-environment.js';

// Runtime material study only. Positions, indices, navigation, water and trees
// are preserved. The previous bookshop treatment remains a local detail layer.
const ROOT = new URL('./textures/shop-study-01/', import.meta.url);
const SURFACE = 'Refine ten metre street surface';
const CONFIG = Object.freeze({
  plaster: { asset:'worn_plaster_wall', metres:1.8, normal:.19, rough:[.76,.96], ao:.10 },
  wood: { asset:'wood_planks_grey', metres:1.45, normal:.15, rough:[.48,.76], ao:.12 },
  roof: { asset:'worn_plaster_wall', metres:.85, normal:.065, rough:[.65,.88], ao:.04 },
  paving: { asset:'cobblestone_floor_05', metres:2, normal:.56, rough:[.16,.91], ao:.58 },
  stone: { asset:'cobblestone_floor_05', metres:1.7, normal:.13, rough:[.62,.91], ao:.12 },
  mineral: { asset:'worn_plaster_wall', metres:2.4, normal:.12, rough:[.82,.98], ao:.04 },
  earth: { asset:'worn_plaster_wall', metres:3.4, normal:.10, rough:[.84,.99], ao:.02 },
});

export function materialCategory(name) {
  if (/^Shop study 01\s*\//.test(name)) return null;
  const kind=name.replace(/^(?:Viewer|Roam|ROAM01_PBR) \/ /,'').split(' / ')[0];
  if (/^plaster(?:_alt)?$/.test(kind)) return 'plaster';
  if (/^(?:wood|wood_light|teal|olive)$/.test(kind)) return 'wood';
  if (/^roof(?:_alt)?$/.test(kind)) return 'roof';
  if (/^paving(?:_alt)?$/.test(kind)) return 'paving';
  if (/^stone(?:_light|_alt)?$/.test(kind)) return 'stone';
  if (/^mortar$/.test(kind)) return 'mineral';
  if (/^(?:soil|EXT_B02_DampMineralGround)$/.test(kind)) return 'earth';
  return null;
}

const COMMON = `
varying vec3 vSpaceWorld;
float spaceHash(vec2 p) {
  p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float spaceNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(spaceHash(i),spaceHash(i+vec2(1.,0.)),f.x),
             mix(spaceHash(i+vec2(0.,1.)),spaceHash(i+vec2(1.)),f.x),f.y);
}
`;

function installShader(material,kind,clipOldSurface=false) {
  const detail={
    plaster:'mix(.91,1.075,clamp(spaceScanLuma*1.6,0.,1.))',
    wood:'mix(.87,1.09,clamp(spaceScanLuma*2.,0.,1.))',
    roof:'mix(.97,1.03,clamp(spaceScanLuma*1.6,0.,1.))',
    paving:'mix(.73,1.15,clamp(spaceScanLuma*2.2,0.,1.))',
    stone:'mix(.92,1.06,clamp(spaceScanLuma*2.2,0.,1.))',
    mineral:'mix(.94,1.05,clamp(spaceScanLuma*1.6,0.,1.))',
    earth:'mix(.95,1.04,clamp(spaceScanLuma*1.6,0.,1.))',
  }[kind];
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vSpaceWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvSpaceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\n'+COMMON);
    // Keep each exported facade/paint colour. Scans provide restrained texture,
    // not a blanket replacement colour or wood grain on the ceramic roofs.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 spaceScan=texture2D(map,vMapUv).rgb;
      float spaceScanLuma=dot(spaceScan,vec3(.2126,.7152,.0722));
      diffuseColor.rgb*=${detail};
    `);
    let colour='';
    let rough='';
    if(kind==='plaster'){
      colour=`float spaceFoot=(1.-smoothstep(.93,1.65,vSpaceWorld.y))
          *(.35+.65*spaceNoise(vSpaceWorld.xz*2.3));
        diffuseColor.rgb*=vec3(.975,1.0,1.035)*(1.-spaceFoot*.18);`;
      rough='roughnessFactor=clamp(.72+roughnessFactor*.23,.76,.96);';
    }else if(kind==='wood'){
      colour='diffuseColor.rgb*=.97+.045*spaceNoise(vSpaceWorld.xz*.65);';
      rough='roughnessFactor=clamp(.39+roughnessFactor*.35,.48,.76);';
    }else if(kind==='roof'){
      colour='diffuseColor.rgb*=.98+.035*spaceNoise(vSpaceWorld.xz*1.9);';
      rough='roughnessFactor=clamp(.61+roughnessFactor*.25,.65,.88);';
    }else if(kind==='paving'){
      colour=`float spaceWet=smoothstep(.43,.78,spaceNoise(vSpaceWorld.xz*.83)
          *.76+spaceNoise(vSpaceWorld.xz*2.41)*.24);
        float spaceBaseLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,spaceBaseLuma*vec3(1.025,1.02,.985),.20);
        diffuseColor.rgb*=mix(1.01,.86,spaceWet);`;
      rough=`roughnessFactor=clamp(.42+roughnessFactor*.38-spaceWet*.14,.40,.83);`;
    }else if(kind==='stone'){
      colour=`float spaceFoot=(1.-smoothstep(.35,1.25,vSpaceWorld.y))
          *(.25+.75*spaceNoise(vSpaceWorld.xz*2.0));
        diffuseColor.rgb*=vec3(.985,1.,1.025)*(1.-spaceFoot*.16);`;
      rough='roughnessFactor=clamp(.57+roughnessFactor*.32,.62,.91);';
    }else if(kind==='earth'){
      colour=`float spaceEarthField=spaceNoise(vSpaceWorld.xz*.19)*.65
          +spaceNoise(vSpaceWorld.xz*.67)*.35;
        diffuseColor.rgb*=mix(vec3(.94,1.015,.95),vec3(1.08,.97,.86),spaceEarthField)
          *(.95+.08*spaceNoise(vSpaceWorld.xz*.43));`;
      rough='roughnessFactor=clamp(.82+roughnessFactor*.17,.84,.99);';
    }else{
      colour=`float spaceGroundShade=spaceNoise(vSpaceWorld.xz*.35);
        diffuseColor.rgb*=.94+.105*spaceGroundShade;`;
      rough='roughnessFactor=clamp(.79+roughnessFactor*.19,.82,.98);';
    }
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n'+colour);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n'+rough);
    if(clipOldSurface){
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
        #include <alphatest_fragment>
        if(vSpaceWorld.x>-7. && vSpaceWorld.x<3. && vSpaceWorld.z>-1.06 &&
           vSpaceWorld.z<1.55 && vSpaceWorld.y>.72 && vSpaceWorld.y<.86) discard;
      `);
    }
  };
  material.customProgramCacheKey=()=>`space-02-world-surface-${kind}-${clipOldSurface?'masked':'full'}`;
}

async function loadMaps(renderer,mobile) {
  const loader=new THREE.TextureLoader();
  const records=[];
  for(const asset of [...new Set(Object.values(CONFIG).map(entry=>entry.asset))]){
    for(const suffix of ['diff_1k.jpg','nor_gl_1k.png','rough_1k.jpg','ao_1k.jpg']){
      records.push({asset,suffix,promise:loader.loadAsync(new URL(`${asset}/${asset}_${suffix}`,ROOT).href)});
    }
  }
  const settled=await Promise.allSettled(records.map(entry=>entry.promise));
  const loaded=settled.filter(entry=>entry.status==='fulfilled').map(entry=>entry.value);
  const failed=settled.find(entry=>entry.status==='rejected');
  if(failed){loaded.forEach(texture=>texture.dispose());throw new Error('街区表面贴图未能载入。',{cause:failed.reason});}
  const assets={};
  settled.forEach((entry,index)=>{
    const texture=entry.value,{asset,suffix}=records[index];
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=suffix.startsWith('diff')?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.anisotropy=Math.min(mobile?4:8,renderer.capabilities.getMaxAnisotropy());
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    (assets[asset]??=[]).push(texture);
  });
  return {assets,loaded};
}

export function projectWorldUV(part) {
  const source=part.geometry,position=source.attributes.position,normal=source.attributes.normal;
  if(!normal)throw new Error(`World surface projection requires normals: ${part.name}`);
  const uv=new Float32Array(position.count*2);
  const world=new THREE.Vector3(),direction=new THREE.Vector3();
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(part.matrixWorld);
  for(let i=0;i<position.count;i++){
    world.fromBufferAttribute(position,i).applyMatrix4(part.matrixWorld);
    direction.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);
    const axis=Math.abs(direction.y)>Math.max(Math.abs(direction.x),Math.abs(direction.z))?1:
      Math.abs(direction.x)>Math.abs(direction.z)?0:2;
    uv[i*2]=axis===0?world.z:world.x;
    uv[i*2+1]=axis===1?-world.z:world.y;
  }
  const geometry=source.clone();
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return geometry;
}

function triangleCount(model) {
  let triangles=0;
  model.traverse(part=>{if(part.isMesh&&!part.isReflector)triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3;});
  return triangles;
}

export async function setupEnvironment(renderer,scene,model,options={}) {
  const previous=await setupPrevious(renderer,scene,model,options);
  let loadedMaps;
  try{loadedMaps=await loadMaps(renderer,options.mobile??false);}
  catch(error){previous.dispose();throw error;}
  const {assets,loaded}=loadedMaps,textureCopies=[],materials=[],replacements=[],cache=new Map();
  const trianglesBefore=triangleCount(model),classTriangles={},sourceNames=new Set();
  const streetSurface=scene.getObjectByName(SURFACE);
  if(!streetSurface?.isMesh)throw new Error('The preserved street material sample is unavailable.');
  const streetMaterial=streetSurface.material;
  const classMaps={};
  for(const [kind,config] of Object.entries(CONFIG)){
    classMaps[kind]=assets[config.asset].map(source=>{
      const texture=source.clone();texture.repeat.set(1/config.metres,1/config.metres);texture.needsUpdate=true;
      // The preserved plane's original UVs and repeat sample
      // ((worldX+7)/2, (1.55-worldZ)/2). Match that phase on all quays.
      if(kind==='paving')texture.offset.set(3.5,.775);
      textureCopies.push(texture);return texture;
    });
  }
  function createMaterial(source,kind,clip=false){
    const config=CONFIG[kind],maps=classMaps[kind];
    if(kind==='paving'){
      // Keep the established scanned-stone response rather than converting it
      // to a tinted grayscale patch. Only UV placement changes for the quays.
      const material=streetMaterial.clone();
      material.name=`Space 02 / ${source.name}`;
      material.map=maps[0];material.normalMap=maps[1];material.roughnessMap=maps[2];material.aoMap=maps[3];
      material.vertexColors=source.vertexColors;
      // The bookshop's local probe stays on its original sample. Other streets
      // use the unchanged scene environment, not a displaced shop reflection.
      material.envMap=null;
      const previousCompile=streetMaterial.onBeforeCompile;
      material.onBeforeCompile=(shader,renderer)=>{
        previousCompile.call(material,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          #ifdef USE_COLOR
            float spaceOriginalLuma=max(dot(vColor.rgb,vec3(.2126,.7152,.0722)),.001);
            diffuseColor.rgb/=max(vColor.rgb,vec3(.001));
            diffuseColor.rgb*=mix(vec3(1.),vColor.rgb/spaceOriginalLuma,.06)
              *clamp(.94+spaceOriginalLuma*.18,.97,1.02);
          #endif
        `);
        if(clip)shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
          #include <alphatest_fragment>
          if(vShopGroundWorld.x>-7. && vShopGroundWorld.x<3. && vShopGroundWorld.z>-1.06 &&
             vShopGroundWorld.z<1.55 && vShopGroundWorld.y>.72 && vShopGroundWorld.y<.86) discard;
        `);
      };
      material.customProgramCacheKey=()=>`space-02-preserved-scanned-stone-${clip?'masked':'full'}`;
      materials.push(material);return material;
    }
    const material=new THREE.MeshPhysicalMaterial({
      name:`Space 02 / ${source.name}`,color:source.color?.clone()??new THREE.Color(1,1,1),
      vertexColors:source.vertexColors,side:source.side,roughness:1,metalness:0,
      map:maps[0],normalMap:maps[1],roughnessMap:maps[2],aoMap:maps[3],
      normalScale:new THREE.Vector2(config.normal,config.normal),aoMapIntensity:config.ao,
      clearcoat:kind==='paving'?.035:kind==='wood'?.025:0,clearcoatRoughness:.36,
      envMapIntensity:kind==='paving'?.66:.80,dithering:true,
    });
    installShader(material,kind,clip);materials.push(material);return material;
  }
  model.updateMatrixWorld(true);
  model.traverse(part=>{
    if(!part.isMesh||part.isReflector)return;
    const originalMaterial=part.material,list=Array.isArray(originalMaterial)?originalMaterial:[originalMaterial];
    let changed=false;
    const next=list.map(source=>{
      const kind=materialCategory(source.name);
      if(!kind)return source;
      sourceNames.add(source.name);changed=true;
      if(!cache.has(source))cache.set(source,createMaterial(source,kind,kind==='paving'));
      return cache.get(source);
    });
    if(!changed)return;
    const originalGeometry=part.geometry;
    part.geometry=projectWorldUV(part);
    part.material=Array.isArray(originalMaterial)?next:next[0];
    replacements.push({part,originalMaterial,originalGeometry,replacementGeometry:part.geometry});
    const kind=materialCategory(list[0].name);
    classTriangles[kind]=(classTriangles[kind]??0)+(part.geometry.index?.count??part.geometry.attributes.position.count)/3;
  });
  // The original 10m material, UVs, normals and local reflection remain intact.
  // All other paving now follows that established sample's scan and phase.
  scene.traverse(light=>{
    if(!light.isDirectionalLight)return;
    Object.assign(light.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:105});
    light.shadow.camera.updateProjectionMatrix();light.shadow.needsUpdate=true;
    light.shadow.normalBias=.018;
  });
  scene.fog.density=.008;
  const metadata={
    version:'space-02-unified-surfaces',trianglesBefore,trianglesAfter:triangleCount(model),
    addedMeshes:0,addedTriangles:0,positionAndIndexBuffersUnchanged:true,
    sourceMaterialNames:[...sourceNames],classTriangles,
    textureCoverageMetres:Object.fromEntries(Object.entries(CONFIG).map(([name,value])=>[name,value.metres])),
    textureAssets:Object.keys(assets),textureLicense:'CC0-1.0; existing local Poly Haven downloads',
    originalBookshopTreatmentPreserved:true,wholeStreetShadows:true,
    streetPatch:'Existing plane material, UVs and local reflection retained unchanged; all other paving matches its scan, wetness shader and world UV phase. Underlying original mask retained.',
    lighting:'Original exposure .96 and light intensity/colour retained; fog .008 for both comparison stages.',
    limitations:'Original geometric paving joints remain; no displacement, new props, trees, lights or buildings.',
  };
  scene.userData.spaceStudy=metadata;
  let disposed=false;
  return {
    cameraOccluders:previous.cameraOccluders,metadata,
    update(time,state={}){previous.update(time,state);},
    dispose(){
      if(disposed)return;disposed=true;
      for(const {part,originalMaterial,originalGeometry,replacementGeometry} of replacements){
        part.material=originalMaterial;part.geometry=originalGeometry;replacementGeometry.dispose();
      }
      materials.forEach(material=>material.dispose());
      textureCopies.forEach(texture=>texture.dispose());loaded.forEach(texture=>texture.dispose());
      if(scene.userData.spaceStudy===metadata)delete scene.userData.spaceStudy;
      previous.dispose();
    },
  };
}
