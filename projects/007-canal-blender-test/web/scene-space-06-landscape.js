// SPACE06 changes surface response only. Existing stone scans, geometry,
// textures and illumination remain owned by the preceding environment layers.
const RIVER_SECTIONS = Object.freeze([
  [-125,41,10.5],[-105,35,11],[-85,22,11],[-65,6,10.4],[-45,-3,9.2],
  [-28,-6.15138,8.74812],[0,-6.15138,8.74812],[24,-6.15138,8.74812],
  [42,-10,9.6],[65,-22,10.5],[90,-27,11],[120,-36,11],
]);

// Blender XY: retain dirt at the old walking/apron strips and house footings.
// Their stone/paving materials are never selected by this module in any case.
const CORE_DIRT = Object.freeze([
  [-25.46,-1.62,24.1,1.35],[-25.46,-16.0,24.1,-10.72],
  [-13.8,1.0,-11.8,9.1],[10.5,1.0,12.5,9.1],[-13.8,6.6,12.5,9.1],
  [-12.4,.95,11.0,7.1],[-14.2,-21.85,-7.8,-15.95],
  [-6.3,-21.85,.3,-15.95],[1.6,-21.85,8.0,-15.95],
  [-7.98,-23.5,-6.12,-15.1],[-12.25,-26.0,-5.95,-22.25],
]);

export function landscapeCategory(name='') {
  // Prefixes are runtime ownership labels. Match complete material tokens;
  // "stone", "mortar", "paving" and all building paint stay untouched.
  const tokens=name.split(' / ').map(token=>token.trim());
  if(tokens.some(token=>token==='EXT_B02_DampMineralGround'||token==='soil'))return 'earth';
  if(tokens.some(token=>/^SPACE06_Grass(?:Shade|Dry)?$/.test(token)))return 'grass';
  if(tokens.some(token=>/^SPACE06_Leaf(?:Light|Shade)?$/.test(token)))return 'leaf';
  if(tokens.includes('SPACE06_Reed'))return 'reed';
  if(tokens.includes('SPACE06_Bark'))return 'bark';
  return null;
}

function validRect(value) {
  return Array.isArray(value)&&value.length===4&&value.every(Number.isFinite)&&value[2]>value[0]&&value[3]>value[1];
}

export function collectDirtBounds(options={}) {
  const metadata=options.metadata??{},bounds=CORE_DIRT.map(rect=>[...rect]);
  // The build manifest supplies exact final house footprints and actual road
  // geometry; this also works before the geometry metadata has been attached.
  const houses=options.neighbourhood?.buildings?.houses??metadata.houses??
    (metadata.house_grounding??[]).map(house=>({footprint:house.support_bounds_xy}));
  for(const house of houses){
    if(validRect(house.footprint)){
      const [x0,y0,x1,y1]=house.footprint;
      bounds.push([x0-.45,y0-.45,x1+.45,y1+.45]);
    }
  }
  const roads=metadata.road_rectangles??metadata.road_plan?.road_rectangles??metadata.road_navigation?.road_rectangles??[];
  for(const road of roads){if(validRect(road.bounds))bounds.push([...road.bounds]);}
  const unique=new Map(bounds.map(rect=>[rect.join(','),rect]));
  return [...unique.values()];
}

// Exported for CPU checks and readers of the manifest; shader uses these same
// original river control points, including smooth curved approaches.
export function riverSection(x) {
  if(x<=RIVER_SECTIONS[0][0])return {center:RIVER_SECTIONS[0][1],width:RIVER_SECTIONS[0][2]};
  for(let i=1;i<RIVER_SECTIONS.length;i++){
    const a=RIVER_SECTIONS[i-1],b=RIVER_SECTIONS[i];
    if(x>b[0])continue;
    const t=(x-a[0])/(b[0]-a[0]),s=t*t*(3-2*t);
    return {center:a[1]+(b[1]-a[1])*s,width:a[2]+(b[2]-a[2])*s};
  }
  const last=RIVER_SECTIONS.at(-1);return {center:last[1],width:last[2]};
}

function glFloat(value){return Number(value).toFixed(6);}
function vec(values){return `vec${values.length}(${values.map(glFloat).join(',')})`;}

function fieldShader(bounds) {
  let river=`vec2 s06River(float x){\n vec2 r=${vec(RIVER_SECTIONS[0].slice(1))};\n`;
  for(let i=1;i<RIVER_SECTIONS.length;i++){
    const a=RIVER_SECTIONS[i-1],b=RIVER_SECTIONS[i];
    river+=` r=mix(r,${vec(b.slice(1))},smoothstep(${glFloat(a[0])},${glFloat(b[0])},x));\n`;
  }
  river+=' return r;\n}\n';
  const rectangles=bounds.map(rect=>` d=min(d,s06RectDistance(p,${vec(rect)}));`).join('\n');
  return `${river}
float s06RectDistance(vec2 p,vec4 r){
  vec2 q=abs(p-(r.xy+r.zw)*.5)-(r.zw-r.xy)*.5;
  return length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
}
float s06DirtDistance(vec2 p){float d=1000.;
${rectangles}
  return d;
}
`;
}

const NOISE=`
varying vec3 vSpace06LandWorld;
varying vec3 vSpace06LandNormal;
float s06LandHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float s06LandNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(s06LandHash(i),s06LandHash(i+vec2(1.,0.)),f.x),
    mix(s06LandHash(i+vec2(0.,1.)),s06LandHash(i+vec2(1.)),f.x),f.y);}
`;

function makeLandscapeMaterial(source,kind,bounds) {
  const material=source.clone(),previousCompile=source.onBeforeCompile;
  const previousKey=source.customProgramCacheKey.call(source);
  material.name=`Space 06 landscape / ${source.name}`;
  material.userData={...source.userData,space06Landscape:kind};
  // clone() borrows source maps/environment. Dispose below releases only the
  // new material, never its textures. Vertex albedo stays enabled exactly once.
  material.onBeforeCompile=(shader,renderer)=>{
    previousCompile.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vSpace06LandWorld;\nvarying vec3 vSpace06LandNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',`
      #include <defaultnormal_vertex>
      vSpace06LandNormal=inverseTransformDirection(transformedNormal,viewMatrix);
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      vSpace06LandWorld=(modelMatrix*vec4(transformed,1.)).xyz;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\n'+NOISE+((kind==='earth'||kind==='grass')?fieldShader(bounds):''));
    let surface='';
    if(kind==='earth'||kind==='grass'){
      surface=`
        vec2 s06Plan=vec2(vSpace06LandWorld.x,-vSpace06LandWorld.z);
        float s06Broad=s06LandNoise(s06Plan*.085)*.68+s06LandNoise(s06Plan*.31+7.2)*.32;
        float s06Detail=.92+.16*s06LandNoise(s06Plan*1.35);
        vec2 s06RiverProfile=s06River(s06Plan.x);
        float s06Bank=abs(s06Plan.y-s06RiverProfile.x)-s06RiverProfile.y*.5;
        float s06Wet=(1.-smoothstep(.6,3.0,s06Bank))*step(-.25,s06Bank);
        float s06Top=smoothstep(.35,.82,normalize(vSpace06LandNormal).y)
          *smoothstep(.03,.40,vSpace06LandWorld.y);
        float s06Dirt=s06DirtDistance(s06Plan);
        float s06Grass=smoothstep(.35,1.35,s06Dirt+(s06Broad-.5)*.32)
          *smoothstep(.55,2.9,s06Bank)*(.70+.22*s06Broad);
        vec3 s06Soil=mix(vec3(.164,.132,.098),vec3(.115,.098,.074),s06Wet);
        vec3 s06GrassColour=mix(vec3(.137,.170,.092),vec3(.190,.205,.118),s06Broad);
        vec3 s06Surface=mix(s06Soil,s06GrassColour,s06Grass)*s06Detail;
        // Replace the old grey chroma, keeping its restrained scan/vertex
        // shading. Multiplying a new base colour into COLOR_0 would darken twice.
        float s06SourceLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        float s06SourceVariation=clamp(s06SourceLuma/.18,.88,1.10);
        diffuseColor.rgb=mix(diffuseColor.rgb,s06Surface*s06SourceVariation,s06Top);
        roughnessFactor=mix(roughnessFactor,mix(.93,.79,s06Wet),s06Top);
      `;
    }else if(kind==='leaf'||kind==='reed'){
      surface=`
        float s06Crown=s06LandNoise(vSpace06LandWorld.xz*.45+vSpace06LandWorld.y*.19);
        float s06Fine=s06LandNoise(vSpace06LandWorld.xz*2.3);
        diffuseColor.rgb*=.90+.16*s06Crown+.04*s06Fine;
        roughnessFactor=clamp(roughnessFactor,.78,.96);
      `;
    }else{
      surface=`
        float s06Bark=s06LandNoise(vec2(vSpace06LandWorld.x*14.+vSpace06LandWorld.z*12.,vSpace06LandWorld.y*.8));
        diffuseColor.rgb*=.91+.18*s06Bark;
        roughnessFactor=max(roughnessFactor,.88);
      `;
    }
    // This runs after all inherited map/vertex/roughness/normal edits and before
    // Three's PBR lighting consumes diffuseColor. It leaves emissive untouched.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
      surface+'\n#include <lights_physical_fragment>');
  };
  material.customProgramCacheKey=()=>`${previousKey}/space06-landscape-${kind}-01/${JSON.stringify(bounds)}`;
  material.needsUpdate=true;
  return material;
}

export function applyLandscape(scene,model,options={}) {
  const bounds=collectDirtBounds(options),replacements=[],cache=new Map(),counts={};
  model.traverse(part=>{
    if(!part.isMesh||part.isReflector)return;
    const original=part.material,list=Array.isArray(original)?original:[original];
    let changed=false;
    const next=list.map(source=>{
      const kind=landscapeCategory(source.name);if(!kind)return source;
      changed=true;
      if(!cache.has(source)){
        cache.set(source,makeLandscapeMaterial(source,kind,bounds));
        counts[kind]=(counts[kind]??0)+1;
      }
      return cache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original});}
  });
  const metadata={
    version:'space-06-muted-grass-and-damp-soil',materialCounts:counts,
    sourceMaterials:[...cache.keys()].map(material=>material.name),
    changedMeshes:replacements.length,addedGeometry:0,addedLights:0,newTextures:0,
    dirtProtectionBoundsBlenderXY:bounds,riverSectionsBlenderXY:RIVER_SECTIONS.map(section=>[...section]),
    topFaceMask:'World normal y .35..82; foundation sides keep previous response.',
    wetBankBandMetres:[.6,3],
    preserved:'All paving/stone/bookshop/building materials, geometry/UVs, source vertex albedo and borrowed textures.',
  };
  const originalMetadata=scene.userData.space06Landscape;
  scene.userData.space06Landscape=metadata;
  let disposed=false;
  return {metadata,update(){},dispose(){
    if(disposed)return;disposed=true;
    replacements.forEach(({part,original})=>{part.material=original;});
    cache.forEach(material=>material.dispose());
    if(scene.userData.space06Landscape===metadata){
      if(originalMetadata===undefined)delete scene.userData.space06Landscape;
      else scene.userData.space06Landscape=originalMetadata;
    }
  }};
}
