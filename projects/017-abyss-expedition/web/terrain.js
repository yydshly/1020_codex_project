// SPDX-License-Identifier: GPL-3.0-only
// Multi-scale, domain-warped bathymetry: invented teaching topography, not a survey.
import * as THREE from 'three';

const smooth=t=>t*t*t*(t*(t*6-15)+10);
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const textures=new Map();
function rockTexture(name,color=false){
  if(textures.has(name))return textures.get(name);
  const texture=new THREE.TextureLoader().load(`./assets/materials/rock_surface_${name}_1k.jpg`);
  // A broad material scale leaves the landform readable; local geology comes
  // from slope and height below, rather than one grainy map on every surface.
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(18,18);texture.anisotropy=8;
  if(color)texture.colorSpace=THREE.SRGBColorSpace;textures.set(name,texture);return texture;
}
function hash(x,z,seed){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);return mix(mix(hash(ix,iz,seed),hash(ix+1,iz,seed),u),mix(hash(ix,iz+1,seed),hash(ix+1,iz+1,seed),u),v);}
function fbm(x,z,seed,octaves=6){let value=0,amplitude=.5,weight=0;for(let i=0;i<octaves;i++){value+=(noise(x,z,seed+i*13)*2-1)*amplitude;weight+=amplitude;x=x*2.03+7.1;z=z*2.01-3.2;amplitude*=.48;}return value/weight;}
function ridge(x,z,seed){let value=0,weight=1,amplitude=.55;for(let i=0;i<5;i++){let n=1-Math.abs(noise(x,z,seed+i*17)*2-1);n*=n;value+=n*weight*amplitude;weight=clamp(n*1.8,0,1);x=x*2.1+11;z=z*2.07-9;amplitude*=.49;}return value;}

/** Build one authoritative triangulated field for drawing, stations and driving. */
export function createBathymetryField(data){
  const seed=data.seed||47,canyon=data.terrain==='canyon';
  // An incised, meandering channel places the wall/coral stations on rock
  // benches, and both water stations and the sand station in the deep thalweg.
  // These authored coordinates are explanatory landforms, not surveyed data.
  const course=canyon?new THREE.CatmullRomCurve3([
    [-450,610],[-280,350],[-190,210],[-71,75],[-15,-60],[30,-177],
    [106,-203],[175,-105],[187,61],[115,243],[210,450],[400,620]
  ].map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal').getPoints(112):[];
  const channelDistance=(x,z)=>{
    let best=Infinity;
    for(let i=1;i<course.length;i++){const a=course[i-1],b=course[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));}
    return best;
  };
  const rawHeightAt=(x,z)=>{
    if(canyon){
      const distance=channelDistance(x,z),regional=fbm(x*.003,z*.003,seed,4)*17;
      const floorWidth=31+fbm(x*.009,z*.009,seed+12,3)*5,wallWidth=65+fbm(x*.005,z*.005,seed+34,3)*9;
      const depth=312+fbm(x*.003,z*.003,seed+53,3)*24;
      const section=clamp((distance-floorWidth)/wallWidth,0,1),profile=smooth(section),wall=Math.sin(section*Math.PI);
      let h=76+regional-depth*(1-profile);
      // Actual height ledges accompany the material's bedding lines. They are
      // restricted to the steep wall; the mud channel stays quiet and smooth.
      h+=wall*(Math.round(h/24)*24-h)*.48;
      h-=wall*ridge(x*.033,z*.012,seed+24)*13;
      h+=fbm(x*.039,z*.039,seed+61,3)*(.45+wall*1.8);
      h+=Math.sin(x*.08+z*.023)*.36*(1-profile);
      return h;
    }
    const warp=fbm(x*.007,z*.007,seed+317,3)*5,rift=z+x*.75+20+warp;
    const cross=z-x*.27-112+fbm(x*.009,z*.009,seed+311,3)*4;
    const regional=fbm(x*.004,z*.004,seed,4)*8;
    const shield=23*Math.exp(-Math.pow((x+25)/250,2)-Math.pow((z+5)/220,2));
    const shoulders=13*Math.exp(-Math.pow((Math.abs(rift)-29)/23,2));
    const lowRidges=16*Math.exp(-Math.pow((rift-116)/43,2))+9*Math.exp(-Math.pow((rift+128)/55,2));
    const fracture=-15*Math.exp(-Math.pow(rift/6.8,2))-6*Math.exp(-Math.pow(cross/4.5,2));
    const flow=fbm(x*.020,z*.028,seed+61,3)*1.3+ridge(x*.021,z*.015,seed+82)*2.6;
    return -80+regional+shield+shoulders+lowRidges+fracture+flow;
  };
  // Stations sit in naturally blended sheltered patches. Mesh, model placement,
  // route and the vehicle all call this same adjusted height field.
  const stationPatches=data.entities.map(entity=>{
    const x=(entity.position[0]-.5)*620,z=(entity.position[1]-.5)*620;
    const radius=entity.kind==='vent'?27:entity.kind==='coral'?24:entity.kind==='lander'?13:entity.kind==='sampling'?20:12;
    const samples=[rawHeightAt(x,z)];
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;samples.push(rawHeightAt(x+Math.cos(a)*radius*.65,z+Math.sin(a)*radius*.65));}
    samples.sort((a,b)=>a-b);
    return {x,z,radius,height:samples[4],workbench:canyon};
  });
  const analyticHeightAt=(x,z)=>{
    let h=rawHeightAt(x,z);
    for(const patch of stationPatches){
      // A narrow capsule-shaped bench includes the expedition's canonical ROV
      // hover offset (+22,+26), instead of placing robot and device on opposite
      // sides of a newly steep cliff. Most of the surrounding wall is intact.
      const t=patch.workbench?clamp(((x-patch.x)*22+(z-patch.z)*26)/(22*22+26*26),0,1):0;
      const distance=Math.hypot(x-patch.x-22*t,z-patch.z-26*t),outer=patch.radius+(canyon?21:27);
      if(distance>=outer)continue;
      const weight=1-smooth(clamp((distance-patch.radius*.75)/(outer-patch.radius*.75),0,1));
      const shelf=patch.height+.65*Math.pow(Math.min(1,distance/patch.radius),2)+fbm(x*.12,z*.12,seed+332,3)*.48;
      h=mix(h,shelf,weight);
    }
    return h;
  };
  const extent=1320,resolution=320,edge=resolution+1,heights=new Float32Array(edge*edge),half=extent/2,cell=extent/resolution;
  for(let iz=0;iz<=resolution;iz++)for(let ix=0;ix<=resolution;ix++)heights[iz*edge+ix]=analyticHeightAt(-half+ix*cell,-half+iz*cell);
  // A ring mesh shares the exact central boundary, avoiding the former coarse
  // plane overlapping the active field and disagreeing with collision height.
  const ringExtents=[half,690,740,830,980,1170,1420,1750,2100],ringSize=resolution*4,outerPositions=new Float32Array(ringSize*ringExtents.length*3),outerIndices=[];
  for(let ring=0;ring<ringExtents.length;ring++){const radius=ringExtents[ring];for(let side=0;side<4;side++)for(let n=0;n<resolution;n++){
    const t=n/resolution,x=side===0?mix(-radius,radius,t):side===1?radius:side===2?mix(radius,-radius,t):-radius,z=side===0?-radius:side===1?mix(-radius,radius,t):side===2?radius:mix(radius,-radius,t);
    const y=ring===0?heights[(side===0?0:side===1?n:side===2?resolution:resolution-n)*edge+(side===0?n:side===1?resolution:side===2?resolution-n:0)]:analyticHeightAt(x,z),i=(ring*ringSize+side*resolution+n)*3;outerPositions.set([x,y,z],i);
  }}
  for(let ring=0;ring<ringExtents.length-1;ring++)for(let n=0;n<ringSize;n++){const next=(n+1)%ringSize,a=ring*ringSize+n,b=ring*ringSize+next,c=(ring+1)*ringSize+n,d=(ring+1)*ringSize+next;outerIndices.push(a,b,c,c,b,d);}
  const triangleHeight=(x,z,a,b,c)=>{const ax=outerPositions[a*3],az=outerPositions[a*3+2],bx=outerPositions[b*3],bz=outerPositions[b*3+2],cx=outerPositions[c*3],cz=outerPositions[c*3+2],den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;return {inside:u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7,height:u*outerPositions[a*3+1]+v*outerPositions[b*3+1]+(1-u-v)*outerPositions[c*3+1]};};
  const heightAt=(x,z)=>{
    if(Math.abs(x)<=half&&Math.abs(z)<=half){const gx=clamp((x+half)/cell,0,resolution-1e-8),gz=clamp((z+half)/cell,0,resolution-1e-8),ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz,a=iz*edge+ix,h00=heights[a],h10=heights[a+1],h01=heights[a+edge],h11=heights[a+edge+1];return tx+tz<=1?h00+(h10-h00)*tx+(h01-h00)*tz:h11+(h01-h11)*(1-tx)+(h10-h11)*(1-tz);}
    const radius=Math.max(Math.abs(x),Math.abs(z));if(radius>=ringExtents.at(-1))return analyticHeightAt(x,z);
    let ring=0;while(ringExtents[ring+1]<radius)ring++;
    const side=z<=-Math.abs(x)?0:x>=Math.abs(z)?1:z>=Math.abs(x)?2:3,ratio=side===0?(x/radius+1)*.5:side===1?(z/radius+1)*.5:side===2?(1-x/radius)*.5:(1-z/radius)*.5,n=Math.min(resolution-1,Math.floor(ratio*resolution)),index=side*resolution+n,next=(index+1)%ringSize,a=ring*ringSize+index,b=ring*ringSize+next,c=(ring+1)*ringSize+index,d=(ring+1)*ringSize+next,first=triangleHeight(x,z,a,c,b);return first.inside?first.height:triangleHeight(x,z,c,d,b).height;
  };
  return {heightAt,heights,extent,resolution,outerPositions,outerIndices,stationPatches,channelDistance,kind:canyon?'canyon':'vents'};
}

export function buildBathymetry(data){
  const seed=data.seed||47,canyon=data.terrain==='canyon',field=createBathymetryField(data),{heightAt,extent,resolution,heights}=field;
  const group=new THREE.Group();
  const geometry=new THREE.PlaneGeometry(extent,extent,resolution,resolution);geometry.rotateX(-Math.PI/2);
  const position=geometry.attributes.position,colorArray=new Float32Array(position.count*3);
  const low=new THREE.Color(canyon?0x75877e:0x526a69),sediment=new THREE.Color(canyon?0xa3aa96:0x8d9783),rock=new THREE.Color(canyon?0x657f80:0x465d61),mineral=new THREE.Color(0xa3a080),beds=new THREE.Color(0xa0a88e),col=new THREE.Color();
  for(let i=0;i<position.count;i++)position.setY(i,heights[i]);
  geometry.computeVertexNormals();const normals=geometry.attributes.normal;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),h=heights[i],slope=1-clamp(normals.getY(i),0,1);
    const broad=fbm(x*.013,z*.013,seed+201,3),exposure=clamp((slope-.02)*4.2,0,1);
    const sedimentMix=canyon?.14+.71*(1-smooth(clamp((field.channelDistance(x,z)-25)/44,0,1))):clamp(.13+broad*.65,0,.40);
    col.copy(low).lerp(sediment,sedimentMix);
    col.lerp(rock,exposure*.9);
    if(canyon)col.lerp(beds,(.5+.5*Math.sin(h*.24+broad*.7))*.20*exposure);
    const mineralPatch=clamp((fbm(x*.018,z*.018,seed+45,3)-.24)*1.9,0,canyon?.10:.28);col.lerp(mineral,mineralPatch);
    const ix=i%(resolution+1),iz=Math.floor(i/(resolution+1));
    let concavity=0;if(ix>0&&ix<resolution&&iz>0&&iz<resolution)concavity=clamp(((heights[i-1]+heights[i+1]+heights[i-resolution-1]+heights[i+resolution+1])*.25-h)/5,0,.45);
    col.multiplyScalar((.96+broad*.10)*(1-concavity*.40));colorArray[i*3]=col.r;colorArray[i*3+1]=col.g;colorArray[i*3+2]=col.b;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colorArray,3));
  const surface=new THREE.MeshStandardMaterial({vertexColors:true,map:rockTexture('diff',true),normalMap:rockTexture('nor_gl'),normalScale:new THREE.Vector2(.38,.38),roughnessMap:rockTexture('rough'),roughness:.91,metalness:0});
  // Smooth sediment accumulates on the low slopes; exposed rock keeps restrained
  // texture, fractured blocks and (in canyon terrain) horizontal bedding.
  surface.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSeabed;\nvarying float vRockExposure;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSeabed = position;\nvRockExposure = .12+.88*smoothstep(.015,.27,1.-normal.y);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSeabed;
      varying float vRockExposure;
      float rockHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float rockNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float sedimentDetail(vec3 p){return rockNoise(p*.055)*.76+rockNoise(p*.19)*.24;}
      float basaltJoints(vec2 p){
        vec2 cell=floor(p),f=fract(p);float first=8.,second=8.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 g=vec2(float(x),float(y));vec2 h=cell+g;
          vec2 point=vec2(rockHash(vec3(h,1.)),rockHash(vec3(h,7.)));
          vec2 delta=g+point-f;float d=dot(delta,delta);
          if(d<first){second=first;first=d;}else second=min(second,d);
        }
        float edge=second-first;float aa=fwidth(edge)*1.2;
        return smoothstep(.025-aa,.085+aa,edge);
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec3 rockSample=texture2D(map,vMapUv).rgb;
      float rockLuma=dot(rockSample,vec3(.2126,.7152,.0722));
      // Linear-space albedo from this dark CC0 rock needs a curved response;
      // a high clamp floor would erase almost all of its actual variation.
      float materialVariation=clamp(pow(max(rockLuma,.001),.55)*2.3,.50,1.30);
      diffuseColor.rgb*=mix(.97,materialVariation,.32+vRockExposure*.64);
    #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float sediment=sedimentDetail(vSeabed);
      float joints=basaltJoints(vSeabed.xz*vec2(.048,.061)+vec2(sediment*.65));
      float bedding=smoothstep(.56,.9,sin(vSeabed.y*${canyon?'.26':'.67'}+sediment*.72));
      float farDetail=1.-smoothstep(260.,${canyon?'1050.':'520.'},length(vViewPosition));
      float exposed=vRockExposure*farDetail;
      diffuseColor.rgb*=(.96+.08*sediment)*mix(1.,.70+.30*joints,exposed);
      diffuseColor.rgb*=1.-${canyon?'.21':'.035'}*bedding*exposed;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(.96,clamp(roughnessFactor,.74,.92),vRockExposure);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 smoothSeabedNormal=normal;
      #include <normal_fragment_maps>
      normal=normalize(mix(smoothSeabedNormal,normal,.25+vRockExposure*.75));
      float micro=sedimentDetail(vSeabed);vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
      vec3 surfX=cross(q1,normal),surfY=cross(normal,q0);
      float det=dot(q0,surfX);vec3 grad=sign(det)*(dFdx(micro)*surfX+dFdy(micro)*surfY);
      normal=normalize(abs(det)*normal-.045*grad);
    `);
  };
  surface.customProgramCacheKey=()=> `abyss-slope-material-v5-${canyon?'canyon':'vents'}`;
  const terrain=new THREE.Mesh(geometry,surface);terrain.receiveShadow=true;terrain.castShadow=true;group.add(terrain);
  const minor=[],major=[];
  // Contours interpolate the same mesh vertices used to draw the terrain.
  const addSegment=(a,b,dest)=>dest.push(...a,...b);
  for(let iz=0;iz<resolution;iz++)for(let ix=0;ix<resolution;ix++){
    const ids=[iz*(resolution+1)+ix,iz*(resolution+1)+ix+1,(iz+1)*(resolution+1)+ix+1,(iz+1)*(resolution+1)+ix];
    const hs=ids.map(i=>heights[i]),min=Math.min(...hs),max=Math.max(...hs);
    for(let level=Math.ceil(min/12)*12;level<max;level+=12){
      const hits=[];
      for(let e=0;e<4;e++){const a=ids[e],b=ids[(e+1)%4],ha=heights[a],hb=heights[b];if((ha<level&&hb>=level)||(hb<level&&ha>=level)){const t=(level-ha)/(hb-ha);hits.push([mix(position.getX(a),position.getX(b),t),level+.3,mix(position.getZ(a),position.getZ(b),t)]);}}
      const dest=level%60===0?major:minor;if(hits.length>=2)addSegment(hits[0],hits[1],dest);if(hits.length===4)addSegment(hits[2],hits[3],dest);
    }
  }
  const contourLines=[];
  for(const [points,opacity] of [[minor,.11],[major,.25]]){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9cb8ad,transparent:true,opacity,depthWrite:false}));group.add(line);contourLines.push({line,opacity});}
  // The ring shares every central boundary vertex; no overlapping hidden floor.
  const outerGeo=new THREE.BufferGeometry();outerGeo.setAttribute('position',new THREE.BufferAttribute(field.outerPositions,3));outerGeo.setIndex(field.outerIndices);
  outerGeo.computeVertexNormals();const outer=new THREE.Mesh(outerGeo,new THREE.MeshStandardMaterial({color:canyon?0x687f7b:0x455f61,roughness:1,metalness:0}));outer.receiveShadow=true;group.add(outer);
  const setPresentation=(mode,distance=700)=>{const near=clamp((distance-150)/420,0,1);const factor=mode==='dive'?.12+.2*near:.25+.75*near;contourLines.forEach(item=>{item.line.material.opacity=item.opacity*factor;});};
  const cameraAbove=(x,z,clearance)=>[x,heightAt(x,z)+clearance,z];
  const getOverviewPose=()=>canyon?{position:[335,405,475],target:[5,-100,30],fov:54}:{position:[365,245,410],target:[5,-60,0],fov:54};
  const getStationView=entityId=>{
    if(!canyon)return null;const entity=data.entities.find(item=>item.id===entityId);if(!entity)return null;
    const x=(entity.position[0]-.5)*620,z=(entity.position[1]-.5)*620,y=heightAt(x,z);
    // Along-channel views reveal hundreds of units of real wall relief. A
    // generic short orbit around a station only shows its small working bench.
    if(entityId==='c-wall')return {position:cameraAbove(x-110,z+185,140),target:[x-5,y+24,z],fov:62};
    if(entityId==='c-channel')return {position:cameraAbove(174,-113,100),target:[x,y+40,z],fov:61};
    if(entityId==='c-sand')return {position:cameraAbove(190,73,100),target:[x,y+35,z],fov:61};
    if(entityId==='c-coral')return {position:cameraAbove(-8,-67,108),target:[x,y+18,z],fov:55};
    if(entityId==='c-sponge')return {position:cameraAbove(151,190,138),target:[x,y+19,z],fov:56};
    return null;
  };
  const getPilotStart=()=>{
    const first=data.entities[0],x=(first.position[0]-.5)*620+22,z=(first.position[1]-.5)*620+26,position=cameraAbove(x,z,26),target=canyon?[-115,heightAt(-115,84)+32,84]:[-50,heightAt(-50,19)+23,19];
    return {position,target,heading:Math.atan2(target[0]-x,-(target[2]-z))};
  };
  return {group,heightAt,resolution,setPresentation,getOverviewPose,getStationView,getPilotStart,features:{kind:field.kind,extent,stations:field.stationPatches.map(p=>({position:[p.x,heightAt(p.x,p.z),p.z],height:p.height}))}};
}
