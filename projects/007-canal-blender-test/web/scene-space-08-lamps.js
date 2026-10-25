import * as THREE from 'three';

// A fixed neighbourhood of lamps, with six inexpensive local point lights.
// The bounded diffuse field below remains present at every camera distance.
// It evaluates on the original textured surfaces, never a floating glow decal.
const ACTIVE=new WeakMap();
const POOL_SIZE=6;
const FLOOR=.855;
const WARM=new THREE.Color(1,.58,.245);

export function planStreetLights(neighbourhood={}){
  const houses=neighbourhood.buildings?.houses;
  if(!Array.isArray(houses)||houses.length!==21)throw new Error('SPACE08 requires 21 explicit house records.');
  const fixtures=[];
  function add(id,zone,x,y,nx,ny,mount='wall',range=5.4,groundRect=null){
    const outward=new THREE.Vector3(nx,0,-ny),wall=new THREE.Vector3(x,3.50,-y);
    const position=wall.clone().addScaledVector(outward,mount==='wall'?.34:0);
    const fixture={id,zone,mount,position,wall,outward,range,ground:mount==='post'?.68:FLOOR,
      groundRect:groundRect??[-100,-100,100,100],pointRange:mount==='wall'?3.25:3.65,
      pointIntensity:mount==='wall'?13:17};
    fixtures.push(fixture);return fixture;
  }
  for(const house of houses){
    const door=house.doors.find(d=>d.side===house.secondary_front)??house.doors.find(d=>d.side==='front');
    if(!door)throw new Error('SPACE08 entrance metadata missing: '+house.id);
    const [nx,ny]=door.outward_xy,[x,y]=door.position_xy;
    const zone=house.group==='near-front'?'near-canal':house.group==='far-front'?'far-canal':house.group;
    const fixture=add('entry-'+house.id,zone,x-ny*.48,y+nx*.48,nx,ny);
    const height=Math.min(3.5,house.eaves_z-.46);
    fixture.wall.y=height;fixture.position.y=height;
    fixture.houseId=house.id;fixture.doorId=door.id;
  }
  add('opposite-west','far-canal',-10.45,-16.35,0,1);
  add('opposite-middle','far-canal',-2.45,-16.35,0,1);
  for(const x of [-23,-12,0,12,23]){
    const lamp=add('north-ring-'+x,'north-ring',x,x===0?27:23.55,0,0,'post',6.2);
    if(x===0)lamp.exteriorPlane=[0,-1,23.025];
  }
  add('old-shop-rear-west','north-backstreet',-5,6.62,0,1,'wall',6.5);
  add('old-shop-rear-east','north-backstreet',5,6.62,0,1,'wall',6.5);
  add('west-side-turn','side-streets',-35.05,-26.4,0,0,'post',6.2);
  add('east-side-turn','side-streets',35.05,-26.4,0,0,'post',6.2);
  add('old-courtyard','original-courtyard',-12.20,-24.35,1,0,'wall-post',4.8,[-12.07,-25.86,-6.23,-22.47]);
  return fixtures;
}
function geometryBatches(fixtures){
  const chunks={metal:[],emitter:[]};
  const prototypes={box:new THREE.BoxGeometry(1,1,1),pole:new THREE.CylinderGeometry(1,1,1,7,1)};
  function part(fixture,bucket,shape,position,scale){
    const geometry=prototypes[shape].clone().toNonIndexed();
    geometry.scale(...scale);geometry.translate(...position);
    // Local +Z is the facade's outward normal; poles are rotationally neutral.
    const angle=Math.atan2(fixture.outward.x,fixture.outward.z||0);
    geometry.rotateY(fixture.outward.lengthSq()?angle:0);
    geometry.translate(fixture.wall.x,fixture.wall.y,fixture.wall.z);
    chunks[bucket].push(geometry);
  }
  for(const fixture of fixtures){
    const offset=fixture.mount==='wall'?.34:0;
    if(fixture.mount==='wall'){
      part(fixture,'metal','box',[0,-.035,.018],[.13,.30,.045]);
      part(fixture,'metal','box',[0,.19,.18],[.048,.045,.36]);
    }else{
      // The roadside poles stand on graded soil (~.69), not on the
      // raised .855 pavement; embed their bases by a centimetre in that soil.
      const length=fixture.wall.y-fixture.ground;
      part(fixture,'metal','pole',[0,-length*.5,0],[.052,length,.052]);
      part(fixture,'metal','box',[0,-length+.035,0],[.15,.07,.15]);
    }
    part(fixture,'emitter','box',[0,0,offset],[.172,.27,.172]);
    part(fixture,'metal','box',[0,.164,offset],[.29,.047,.29]);
    part(fixture,'metal','box',[0,-.164,offset],[.23,.039,.23]);
    part(fixture,'metal','box',[0,.205,offset],[.14,.035,.14]);
    for(const sx of [-1,1])for(const sz of [-1,1])
      part(fixture,'metal','box',[sx*.096,0,offset+sz*.096],[.018,.30,.018]);
  }
  const geometries={};
  for(const [key,list]of Object.entries(chunks)){
    const count=list.reduce((sum,geometry)=>sum+geometry.attributes.position.count,0);
    const positions=new Float32Array(count*3),normals=new Float32Array(count*3);let cursor=0;
    for(const geometry of list){positions.set(geometry.attributes.position.array,cursor);
      normals.set(geometry.attributes.normal.array,cursor);cursor+=geometry.attributes.position.array.length;geometry.dispose();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.computeBoundingSphere();
    geometries[key]=geometry;
  }
  Object.values(prototypes).forEach(geometry=>geometry.dispose());
  return geometries;
}

function acceptsLightField(material){
  if(!material?.isMeshStandardMaterial||material.transparent||material.opacity<1)return false;
  if(material.emissiveIntensity>0&&material.emissive?.getHex()!==0)return false;
  if(/Window|Pane|Linen|Curtain|Recess|water|glass|roof|Leaf|Reed/i.test(material.name))return false;
  return true;
}

function makeLitSurface(source,uniforms,count){
  const material=source.clone(),previousCompile=source.onBeforeCompile;
  const previousKey=source.customProgramCacheKey.call(source);
  material.name=`Space 08 lamp field / ${source.name}`;
  material.userData={...source.userData,space08StreetLightField:true};
  material.onBeforeCompile=(shader,renderer)=>{
    previousCompile.call(material,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vSpace08LampWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvSpace08LampWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSpace08LampWorld;
      uniform vec4 s07LampPositions[${count}];
      uniform vec4 s07LampPlanes[${count}];
      uniform vec4 s07LampGroundRects[${count}];
      uniform vec3 s07LampColour;
    `);
    // These local diffuse contributions use the same albedo, scanned surface
    // normals and geometry as the old street. World-space facade half-planes
    // prevent the broad lamp field illuminating through its mounting house.
    // Court ground is additionally clipped to its enclosing walls.
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 s07World=vSpace08LampWorld;
      if(s07World.x>-42.&&s07World.x<42.&&s07World.z>-35.&&s07World.z<48.
          &&s07World.y>.35&&s07World.y<4.75){
        vec3 s07Normal=inverseTransformDirection(normal,viewMatrix);
        vec2 s07Plan=vec2(s07World.x,-s07World.z);
        vec3 s07Sum=vec3(0.);
        for(int i=0;i<${count};i++){
          vec3 s07Delta=s07LampPositions[i].xyz-s07World;
          float s07Distance=length(s07Delta);
          float s07Falloff=max(0.,1.-s07Distance/s07LampPositions[i].w);
          vec4 s07Plane=s07LampPlanes[i];
          float s07Outside=smoothstep(-.055,.025,dot(s07World.xz,s07Plane.xy)-s07Plane.z);
          vec4 s07Rect=s07LampGroundRects[i];
          float s07Inside=smoothstep(s07Rect.x,s07Rect.x+.08,s07Plan.x)
            *smoothstep(s07Rect.y,s07Rect.y+.08,s07Plan.y)
            *(1.-smoothstep(s07Rect.z-.08,s07Rect.z,s07Plan.x))
            *(1.-smoothstep(s07Rect.w-.08,s07Rect.w,s07Plan.y));
          float s07Ground=smoothstep(.55,.85,s07Normal.y);
          float s07Face=max(0.,dot(s07Normal,s07Delta/max(s07Distance,.001)));
          float s07Ceiling=1.-smoothstep(3.7,4.75,s07World.y);
          s07Sum+=s07LampColour*s07Face*s07Falloff*s07Falloff*2.65
            *s07Outside*mix(1.,s07Inside,s07Ground)*s07Ceiling*s07Plane.w;
        }
        outgoingLight+=diffuseColor.rgb*s07Sum;
      }
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>`${previousKey}/space08-bounded-lamp-field-${count}-01`;
  return material;
}

export function applyStreetLights(scene,model,neighbourhood={}){
  if(ACTIVE.has(scene))return ACTIVE.get(scene);
  const fixtures=planStreetLights(neighbourhood);
  const group=new THREE.Group();group.name='SPACE08_StreetLamps';group.userData.space08Owned=true;
  const geometries=geometryBatches(fixtures);
  const materials={metal:new THREE.MeshStandardMaterial({name:'SPACE08_LampIron',color:0x343b39,roughness:.65,metalness:.58}),
    emitter:new THREE.MeshStandardMaterial({name:'SPACE08_LampLight',color:0x6b4221,roughness:.32,
      emissive:new THREE.Color(1,.64,.29),emissiveIntensity:3.6,toneMapped:true})};
  for(const key of Object.keys(geometries)){
    const mesh=new THREE.Mesh(geometries[key],materials[key]);mesh.name=`SPACE08_Lamps_${key}`;
    mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.space08Owned=true;group.add(mesh);
  }
  const uniforms={
    s07LampPositions:{value:fixtures.map(f=>new THREE.Vector4(...f.position.toArray(),f.range))},
    s07LampPlanes:{value:fixtures.map(f=>f.exteriorPlane?new THREE.Vector4(...f.exteriorPlane,1):
      new THREE.Vector4(f.outward.x,f.outward.z,
        f.outward.lengthSq()?f.wall.x*f.outward.x+f.wall.z*f.outward.z-.025:-1,1))},
    s07LampGroundRects:{value:fixtures.map(f=>new THREE.Vector4(...f.groundRect))},
    s07LampColour:{value:WARM},
  };
  const replacements=[],cache=new Map();
  model.traverse(part=>{
    if(!part.isMesh||part.isReflector||part.userData.space08Owned)return;
    const original=part.material,list=Array.isArray(original)?original:[original];let changed=false;
    const next=list.map(source=>{
      if(!acceptsLightField(source))return source;changed=true;
      if(!cache.has(source))cache.set(source,makeLitSurface(source,uniforms,fixtures.length));
      return cache.get(source);
    });
    if(changed){part.material=Array.isArray(original)?next:next[0];replacements.push({part,original,installed:part.material});}
  });
  const pool=Array.from({length:POOL_SIZE},(_,index)=>{
    const fixture=fixtures[Math.floor(index*fixtures.length/POOL_SIZE)];
    const light=new THREE.PointLight(0xffbb73,fixture.pointIntensity,fixture.pointRange,2);
    light.name=`SPACE08_PooledStreetLight_${index+1}`;light.position.copy(fixture.position);
    light.castShadow=false;light.visible=true;light.userData.space08Owned=true;group.add(light);
    return{light,fixture,target:fixture};
  });
  const zones={};for(const fixture of fixtures)zones[fixture.zone]=(zones[fixture.zone]??0)+1;
  const metadata={version:'space-08-fixed-street-lamps-with-six-pooled-lights',fixtureCount:fixtures.length,
    zones,newPointLights:POOL_SIZE,newShadowMaps:0,lightVisibilityFixed:true,addedMeshes:2,
    addedTriangles:Object.values(geometries).reduce((sum,g)=>sum+g.attributes.position.count/3,0),
    surfaceMaterials:cache.size,surfaceMeshes:replacements.length,
    surfaceMethod:'Fixed all-distance diffuse irradiance on actual textured surfaces; distance/normal/facade exterior half-plane and court-floor bounds; no glow decals.',
    fieldBoundsThreeXYZ:{min:[-42,.35,-35],max:[42,4.75,48]},
    fixtures:fixtures.map(f=>({id:f.id,zone:f.zone,mount:f.mount,worldPosition:f.position.toArray(),
      blenderPosition:[f.position.x,-f.position.z,f.position.y],wallAnchor:f.wall.toArray(),
      outwardNormal:f.outward.toArray(),fieldRadius:f.range,pointRange:f.pointRange,
      exteriorFieldPlane:f.exteriorPlane??null,
      pointIntensity:f.pointIntensity,groundHeight:f.ground,groundBoundsBlenderXY:[...f.groundRect],
      physicalBoundsThreeXYZ:{min:[f.wall.x-.19,f.mount==='wall'?f.wall.y-.195:f.ground,f.wall.z-.19],
        max:[f.wall.x+.19,f.wall.y+.223,f.wall.z+.19]},
      groundObstruction:f.mount==='wall'?null:{x:f.wall.x,z:f.wall.z,radius:.076}})),
    pointLightPool:pool.map(item=>({name:item.light.name,fixtureId:item.fixture.id,worldPosition:item.light.position.toArray(),
      intensity:item.light.intensity,distance:item.light.distance,castShadow:false,visible:true})),
    limitations:'The broad field is bounded diffuse fill, not shadowed global illumination. Local point lights have short falloff and no new shadow maps.',
  };
  // Exact wall-lamp bounds include the outward-facing bracket and lamp body.
  for(let i=0;i<fixtures.length;i++){
    const f=fixtures[i],bounds=metadata.fixtures[i].physicalBoundsThreeXYZ;
    if(f.mount==='wall')for(const axis of [0,2]){
      bounds.min[axis]=Math.min(bounds.min[axis],f.position.getComponent(axis)-.15);
      bounds.max[axis]=Math.max(bounds.max[axis],f.position.getComponent(axis)+.15);
    }
  }
  const previousMetadata=scene.userData.space08StreetLights;
  const hadMetadata=Object.hasOwn(scene.userData,'space08StreetLights');
  scene.add(group);scene.userData.space08StreetLights=metadata;
  let disposed=false,lastTime=null,lastSelection=-Infinity;
  const handle={metadata,update(time,{camera}={}){
    if(disposed)return;
    const now=Number.isFinite(time)?time:0,dt=lastTime===null?1/60:THREE.MathUtils.clamp(now-lastTime,0,.1);lastTime=now;
    if(camera&&now-lastSelection>.28){
      lastSelection=now;
      const candidates=fixtures.map(f=>({f,d:f.position.distanceToSquared(camera.position)})).sort((a,b)=>a.d-b.d)
        .slice(0,POOL_SIZE).map(item=>item.f);
      const retained=new Set(pool.filter(item=>candidates.includes(item.target)).map(item=>item.target));
      const vacant=candidates.filter(f=>!retained.has(f));
      for(const item of pool)if(!candidates.includes(item.target))item.target=vacant.shift();
    }
    for(let i=0;i<pool.length;i++){
      const item=pool[i];
      if(item.target!==item.fixture){
        item.light.intensity*=Math.exp(-dt*14);
        if(item.light.intensity<.025){item.fixture=item.target;item.light.position.copy(item.fixture.position);
          item.light.distance=item.fixture.pointRange;item.light.intensity=0;}
      }else item.light.intensity=THREE.MathUtils.lerp(item.light.intensity,item.fixture.pointIntensity,1-Math.exp(-dt*8));
      const state=metadata.pointLightPool[i];state.fixtureId=item.fixture.id;
      state.worldPosition=item.light.position.toArray();state.intensity=item.light.intensity;state.distance=item.light.distance;
    }
  },dispose(){
    if(disposed)return;disposed=true;
    scene.remove(group);
    for(const {part,original,installed}of replacements)if(part.material===installed)part.material=original;
    cache.forEach(material=>material.dispose());
    Object.values(geometries).forEach(geometry=>geometry.dispose());Object.values(materials).forEach(material=>material.dispose());
    pool.forEach(({light})=>light.dispose());group.clear();
    if(hadMetadata)scene.userData.space08StreetLights=previousMetadata;else delete scene.userData.space08StreetLights;
    ACTIVE.delete(scene);
  }};
  ACTIVE.set(scene,handle);return handle;
}
