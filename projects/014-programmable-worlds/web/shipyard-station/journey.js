import * as THREE from 'three';

const STORAGE_KEY='shipyard-station:journey-v1';
const START=new THREE.Vector3(12,-.12,-28),BERTH=new THREE.Vector3(17.6,-.12,8),END=new THREE.Vector3(10,-.12,-65);
const ARRIVAL_SECONDS=22,BOARD_SECONDS=7,DEPARTURE_SECONDS=32;
const clamp01=value=>THREE.MathUtils.clamp(value,0,1),ease=value=>{const t=clamp01(value);return t*t*(3-2*t);};

// This vessel and its signal / gangway are dynamic objects in the independent
// industrial harbour. No canoe, letter mesh, or city journey is imported.
export function createStationJourney({scene,camera,controls,materials={},onPhase=()=>{}}){
 const group=new THREE.Group();group.name='North Dock / passenger service and working gangway';scene.add(group);
 const ownedMaterials=new Set(),ownedTextures=new Set();
 function material(source,name,options={}){
  const m=source?.isMaterial&&!options.physical?source.clone():options.physical?new THREE.MeshPhysicalMaterial():new THREE.MeshStandardMaterial();
  if(source?.isMaterial&&!options.physical){m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;}
  m.name='Dynamic station / '+name;for(const [key,value]of Object.entries(options)){if(key==='physical')continue;if(m[key]?.isColor)m[key].set(value);else m[key]=value;}ownedMaterials.add(m);return m;
 }
 const m={
  hull:material(null,'enamel over steel launch hull',{physical:true,color:'#29474b',metalness:.22,roughness:.38,clearcoat:.23,clearcoatRoughness:.34}),
  cream:material(null,'aged ivory cabin enamel',{physical:true,color:'#cbc7b5',metalness:.015,roughness:.49,clearcoat:.16,clearcoatRoughness:.42}),
  oak:material(materials.oak||materials.wood,'oiled oak deck',{color:'#ae9471',roughness:.68}),
  deck:material(null,'longitudinal teak passenger deck',{physical:true,color:'#9b8767',metalness:0,roughness:.69}),
  rail:material(materials.zinc||materials.metal,'brushed zinc guardrails',{color:'#858d88',metalness:.82,roughness:.29}),
  brass:material(materials.metal,'worn brass fittings',{color:'#a58b58',metalness:.75,roughness:.38}),
  rubber:material(null,'rubber fenders',{color:'#242a28',roughness:.88}),
  fabric:material(materials.fabric,'green passenger seats',{color:'#566a63',roughness:.95}),
  glass:material(materials.glass,'clear cabin glazing',{roughness:.045,transmission:.94,thickness:.012,ior:1.49,side:THREE.DoubleSide}),
  red:material(null,'red port lantern',{color:'#a64230',emissive:'#d83b23',emissiveIntensity:1.2,roughness:.4}),
  green:material(null,'green starboard lantern',{color:'#40765d',emissive:'#3e9c6a',emissiveIntensity:1.2,roughness:.4}),
  white:material(null,'warm stern lantern',{color:'#f1ddad',emissive:'#ffcf86',emissiveIntensity:1.1,roughness:.4})
 };
 for(const key of ['hull','cream','oak','deck','rail','brass','rubber','fabric'])bindPassengerSurface(m[key],key==='deck');
 const boat=buildPassengerLaunch(group,m),gangway=buildGangway(group,m),board=buildSignalBoard(group,m,ownedMaterials,ownedTextures);
 let phase='idle',phaseElapsed=0,tripElapsed=0,worldSeconds=0,paused=false,choice=null,lastNow=null,disposed=false,aboard=false,gangwayOpen=0,speed=0;
 let previous=readHistory(),historyWritten=false,boardingPath=null,boardingLengths=null,boardingTotal=0,boardingTarget=null,lastPhaseNotice=null;
 const velocityDir=new THREE.Vector2(0,-1),oldBoatMatrix=new THREE.Matrix4(),inverseBoatMatrix=new THREE.Matrix4();
 const originalControlsEnabled=controls?.enabled!==false;
 function notify(){if(lastPhaseNotice===phase)return;lastPhaseNotice=phase;try{onPhase({phase,choice,elapsed:phaseElapsed,duration:duration(),aboard});}catch(error){console.error('Station phase callback:',error);}}
 function duration(){return phase==='approaching'?ARRIVAL_SECONDS:phase==='boarding'?BOARD_SECONDS:phase==='departing'?DEPARTURE_SECONDS:0;}
 function setPhase(value,elapsed=0){phase=value;phaseElapsed=elapsed;notify();}
 function restoreControls(){if(controls)controls.enabled=originalControlsEnabled;}
 function makeBoardingPath(){
  // Walk through the real starboard opening, then turn aft on the open deck.
  // The eye stays 1.65m above the .775m deck; it is not raised over the roof.
  boat.updateMatrixWorld(true);
  boardingPath=[camera.position.clone(),new THREE.Vector3(21,2.42,9.1),new THREE.Vector3(20.2,2.42,9.1),new THREE.Vector3(18.85,2.39,9.1),boat.localToWorld(new THREE.Vector3(.55,2.42,1.22)),boat.localToWorld(new THREE.Vector3(.5,2.42,2.1))];
  boardingLengths=boardingPath.slice(1).map((p,i)=>p.distanceTo(boardingPath[i]));boardingTotal=boardingLengths.reduce((sum,n)=>sum+n,0);boardingTarget={start:controls.target.clone(),bridge:new THREE.Vector3(17.95,1.35,9.7),aft:boat.localToWorld(new THREE.Vector3(7,1.2,13))};
 }
 function boardingCamera(progress){
  if(!boardingPath)return;let distance=ease(progress)*boardingTotal;
  for(let i=0;i<boardingLengths.length;i++){const length=boardingLengths[i];if(distance<=length||i===boardingLengths.length-1){camera.position.lerpVectors(boardingPath[i],boardingPath[i+1],length?clamp01(distance/length):1);break;}distance-=length;}
  if(progress<.63)controls.target.lerpVectors(boardingTarget.start,boardingTarget.bridge,ease(progress/.63));else controls.target.lerpVectors(boardingTarget.bridge,boardingTarget.aft,ease((progress-.63)/.37));camera.lookAt(controls.target);
 }
 function applyBoatPose(){
  let yaw=0;speed=0;velocityDir.set(0,-1);
  if(phase==='idle'){boat.position.copy(START);yaw=Math.PI;}
  else if(phase==='approaching'){
   const t=clamp01(phaseElapsed/ARRIVAL_SECONDS),length=36+Math.PI*2.8,distance=ease(t)*length;
   speed=length*6*t*(1-t)/ARRIVAL_SECONDS;
   if(distance<=36){boat.position.set(12,-.12,-28+distance);yaw=Math.PI;velocityDir.set(0,1);}
   else{const angle=(distance-36)/2.8;boat.position.set(14.8-2.8*Math.cos(angle),-.12,8+2.8*Math.sin(angle));yaw=Math.PI+angle;velocityDir.set(Math.sin(angle),Math.cos(angle));}
  }else if(phase==='departing'||phase==='complete'){
   const t=phase==='complete'?1:clamp01((phaseElapsed-2)/(DEPARTURE_SECONDS-2));
   boat.position.lerpVectors(BERTH,END,ease(t));velocityDir.set(END.x-BERTH.x,END.z-BERTH.z).normalize();
   yaw=Math.atan2(-velocityDir.x,-velocityDir.y)*ease(t*6);if(phase!=='complete')speed=BERTH.distanceTo(END)*6*t*(1-t)/(DEPARTURE_SECONDS-2);
  }else boat.position.copy(BERTH);
  boat.position.y+=Math.sin(worldSeconds*1.7)*.004;boat.rotation.set(Math.sin(worldSeconds*.8)*.003,yaw,Math.sin(worldSeconds*1.1)*.005);boat.updateMatrixWorld(true);
  if(aboard&&phase!=='boarding'){
   inverseBoatMatrix.copy(oldBoatMatrix).invert();camera.position.applyMatrix4(inverseBoatMatrix).applyMatrix4(boat.matrixWorld);controls.target.applyMatrix4(inverseBoatMatrix).applyMatrix4(boat.matrixWorld);camera.lookAt(controls.target);
  }
  oldBoatMatrix.copy(boat.matrixWorld);
 }
 function updateGangway(){
  gangwayOpen=phase==='docked'?ease(phaseElapsed/1.25):phase==='boarding'?1:phase==='departing'?1-ease(phaseElapsed/1.65):0;
  gangway.rotation.z=-(1-gangwayOpen)*1.31;
 }
 function update(now=performance.now()){
  if(disposed)return getState();if(!Number.isFinite(now))throw new Error('Station journey time must be finite');
  const dt=lastNow===null?0:Math.max(0,(now-lastNow)/1000);lastNow=now;
  if(!paused){worldSeconds+=dt;if(!['idle','complete'].includes(phase)){phaseElapsed+=dt;tripElapsed+=dt;}}
  if(phase==='approaching'&&phaseElapsed>=ARRIVAL_SECONDS)setPhase('docked',phaseElapsed-ARRIVAL_SECONDS);
  if(phase==='boarding'&&phaseElapsed>=BOARD_SECONDS){boardingCamera(1);aboard=true;oldBoatMatrix.copy(boat.matrixWorld);restoreControls();setPhase('departing',phaseElapsed-BOARD_SECONDS);}
  if(phase==='departing'&&phaseElapsed>=DEPARTURE_SECONDS){setPhase('complete',DEPARTURE_SECONDS);if(!historyWritten){previous=writeHistory(choice,previous);historyWritten=true;}}
  applyBoatPose();if(phase==='boarding')boardingCamera(phaseElapsed/BOARD_SECONDS);updateGangway();board.update(phase,phaseElapsed,paused,worldSeconds);
  return getState();
 }
 function callBoat(){if(disposed)throw new Error('Station journey is disposed');if(phase==='complete')reset();if(phase!=='idle')throw new Error('客船已经在途中。');paused=false;choice=null;historyWritten=false;lastNow=null;setPhase('approaching');return getState();}
 function choose(value){
  if(!['board','stay'].includes(value))throw new Error('Unknown station choice');if(phase!=='docked')throw new Error('请等客船靠泊。');if(gangwayOpen<.95)throw new Error('栈桥还在放下，请稍候。');
  choice=value;paused=false;lastNow=null;
  if(value==='board'){makeBoardingPath();if(controls)controls.enabled=false;setPhase('boarding');}
  else{aboard=false;setPhase('departing');}
  return getState();
 }
 function pause(value=true){paused=!!value;lastNow=null;return getState();}
 function reset(){phase='idle';phaseElapsed=tripElapsed=worldSeconds=0;paused=false;choice=null;lastNow=null;aboard=false;historyWritten=false;boardingPath=null;lastPhaseNotice=null;restoreControls();applyBoatPose();updateGangway();board.update(phase,0,false,0);notify();return getState();}
 function getState(){return {phase,elapsed:phaseElapsed,duration:duration(),progress:duration()?clamp01(phaseElapsed/duration()):phase==='complete'?1:0,totalElapsed:tripElapsed,paused,choice,boatPosition:boat.position.toArray(),boatHeading:boat.rotation.y,velocityDir:velocityDir.toArray(),speed:paused?0:speed,gangwayOpen,canChoose:phase==='docked'&&gangwayOpen>=.95,boarding:phase==='boarding',cameraFollow:aboard,cameraLocked:phase==='boarding',completed:phase==='complete',history:{completedTrips:previous.completedTrips,lastChoice:previous.lastChoice},passengerSurface:boat.userData.surfaceQuality,disposed};}
 function dispose(){if(disposed)return;disposed=true;restoreControls();group.removeFromParent();const geometries=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const g of geometries)g.dispose();for(const texture of ownedTextures)texture.dispose();for(const material of ownedMaterials)material.dispose();}
 applyBoatPose();updateGangway();board.update(phase,0,false,0);
 return {group,boat,update,getState,callBoat,choose,pause,reset,dispose};
}

function mesh(parent,geometry,material,position=[0,0,0],name=''){
 if(!geometry.getAttribute('stationAO'))geometry.setAttribute('stationAO',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(1),1));
 const o=new THREE.Mesh(geometry,material);o.position.fromArray(position);o.name=name;o.castShadow=o.receiveShadow=true;parent.add(o);return o;
}
function box(parent,size,position,material,name=''){return mesh(parent,new THREE.BoxGeometry(...size),material,position,name);}
function rod(parent,a,b,radius,material){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),o=mesh(parent,new THREE.CylinderGeometry(radius,radius,p.distanceTo(q),10),material,p.clone().add(q).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.sub(p).normalize());return o;}

// Small physical bevels, including intermediate face vertices for local AO.
// Unlike a faceted box, the face remains flat and the last millimetres turn
// smoothly into the adjacent face. No addon download or asset is required.
function roundedBoxGeometry(size,radius=.008){
 const half=size.map(n=>n*.5),r=Math.min(radius,...size.map(n=>n*.22)),positions=[],normals=[],uv=[],indices=[];
 const axisGrid=h=>{const core=h-r,n=Math.max(1,Math.ceil(core*2/.65)),a=[-h,-h+r*.5];for(let i=0;i<=n;i++)a.push(-core+core*2*i/n);a.push(h-r*.5,h);return a;};
 const grids=half.map(axisGrid);
 for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
  const u=(axis+1)%3,v=(axis+2)%3,us=grids[u],vs=grids[v],base=positions.length/3;
  for(const vv of vs)for(const uu of us){
   const p=[0,0,0];p[axis]=side*half[axis];p[u]=uu;p[v]=vv;
   const core=p.map((value,i)=>THREE.MathUtils.clamp(value,-half[i]+r,half[i]-r)),normal=new THREE.Vector3(...p).sub(new THREE.Vector3(...core)).normalize();
   positions.push(...core.map((value,i)=>value+r*normal.getComponent(i)));normals.push(...normal.toArray());uv.push(uu,vv);
  }
  for(let y=0;y<vs.length-1;y++)for(let x=0;x<us.length-1;x++){const a=base+y*us.length+x,b=a+1,c=a+us.length,d=c+1;if(side>0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);return geometry;
}
function launchBox(parent,size,position,material,name='',radius=.008,ao=true){const o=mesh(parent,roundedBoxGeometry(size,radius),material,position,name);o.userData.launchOccluder=true;o.userData.launchAO=ao;return o;}

function bindPassengerSurface(material,wood=false){
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float stationAO; varying float vStationAO; varying vec3 vStationSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStationAO=stationAO;vStationSurface=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vStationAO;varying vec3 vStationSurface;float stationHash(vec3 p){return fract(sin(dot(p,vec3(41.17,107.31,67.13)))*13457.867);}float stationNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(stationHash(i),stationHash(i+vec3(1,0,0)),f.x),mix(stationHash(i+vec3(0,1,0)),stationHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(stationHash(i+vec3(0,0,1)),stationHash(i+vec3(1,0,1)),f.x),mix(stationHash(i+vec3(0,1,1)),stationHash(i+vec3(1,1,1)),f.x),f.y),f.z);}')
   .replace('#include <color_fragment>',`#include <color_fragment>
    float stationVariation=stationNoise(vStationSurface*8.7)*.68+stationNoise(vStationSurface*83.1)*.32;
    diffuseColor.rgb*=.974+.052*stationVariation;
    ${wood?`float stationPlank=fract((vStationSurface.x+.07)/.14);float stationSeam=1.-smoothstep(.006,.022,min(stationPlank,1.-stationPlank));float stationGrain=sin(vStationSurface.x*240.+stationNoise(vec3(vStationSurface.x*35.,0.,vStationSurface.z*.7))*5.);diffuseColor.rgb*=1.-stationSeam*.46;diffuseColor.rgb*=.96+.045*stationGrain;`:''}`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(stationVariation-.5)*.075,.045,.98);')
   .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.indirectDiffuse*=clamp(vStationAO,.24,1.);');
 };
 material.customProgramCacheKey=function(){return previousKey.call(this)+'|station-passenger-local-ao-bevel-v2|'+wood;};material.userData.localGeometryAO='indirect diffuse only';
}

function passengerDeckGeometry(stations){
 const positions=[],uv=[],indices=[],rows=22,columns=12;
 function beam(z){for(let i=1;i<stations.length;i++)if(z<=stations[i][0]){const a=stations[i-1],b=stations[i];return THREE.MathUtils.lerp(a[1],b[1],(z-a[0])/(b[0]-a[0]))*.96;}return stations.at(-1)[1]*.96;}
 for(let row=0;row<=rows;row++){const z=-3+6*row/rows,w=beam(z);for(let c=0;c<=columns;c++){const x=-w+2*w*c/columns;positions.push(x,.778,z);uv.push(x,z);}}
 for(let row=0;row<rows;row++)for(let c=0;c<columns;c++){const a=row*(columns+1)+c,b=a+1,d=a+columns+1,e=d+1;indices.push(a,d,b,b,d,e);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Once-only, bounded local occlusion on the main opaque cabin/deck surfaces.
// Rays use measured bounds of real roof, walls, seats and deck, never glazing
// or 10k small rail/rivet triangles. The lighting patch leaves direct diffuse
// and all specular paths intact. There is no per-frame AO or rebake dependency.
function bakePassengerContactAO(boat){
 boat.updateMatrixWorld(true);const occluders=[],surfaces=[];
 boat.traverse(o=>{if(!o.isMesh)return;o.updateMatrix();if(o.userData.launchOccluder){o.geometry.computeBoundingBox();occluders.push({object:o,box:o.geometry.boundingBox.clone().applyMatrix4(o.matrix)});}if(o.userData.launchAO)surfaces.push(o);});
 const ray=new THREE.Ray(),hit=new THREE.Vector3(),point=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 const radius=2.15,samples=24;let vertices=0,rayCount=0,min=1,sum=0;
 for(const o of surfaces){
  const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),values=o.geometry.getAttribute('stationAO');normalMatrix.getNormalMatrix(o.matrix);
  for(let i=0;i<p.count;i++){
   point.fromBufferAttribute(p,i).applyMatrix4(o.matrix);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();up.set(0,Math.abs(normal.y)>.9?0:1,Math.abs(normal.y)>.9?1:0);tangent.crossVectors(up,normal).normalize();bitangent.crossVectors(normal,tangent).normalize();let blocked=0;
   ray.origin.copy(point).addScaledVector(normal,.012);
   for(let j=0;j<samples;j++){
    const u=(j+.5)/samples,angle=j*2.399963229728653;direction.copy(normal).multiplyScalar(Math.sqrt(1-u)).addScaledVector(tangent,Math.sqrt(u)*Math.cos(angle)).addScaledVector(bitangent,Math.sqrt(u)*Math.sin(angle));ray.direction.copy(direction);let nearest=radius;
    for(const blocker of occluders){if(blocker.object===o)continue;rayCount++;if(ray.intersectBox(blocker.box,hit)){const distance=hit.distanceTo(ray.origin);if(distance<nearest)nearest=distance;}}
    if(nearest<radius)blocked+=1-(nearest/radius)**2;
   }
   const value=Math.max(.24,1-.84*blocked/samples);values.setX(i,value);min=Math.min(min,value);sum+=value;vertices++;
  }
  values.needsUpdate=true;
 }
 boat.userData.surfaceQuality={method:'bounded real principal-geometry AO / indirectDiffuse only',sampledVertices:vertices,hemisphereSamples:samples,principalOccluders:occluders.length,rayBoxTests:rayCount,minAO:min,meanAO:sum/Math.max(1,vertices),maxDistance:radius,physicalBevels:true};
}
function buildPassengerLaunch(parent,m){
 const boat=new THREE.Group();boat.name='Six-metre steel and oak passenger launch';parent.add(boat);
 const stations=[[-3,.08],[-2.8,.36],[-2.2,.78],[-1.2,1.03],[0,1.1],[1.5,1.06],[2.55,.92],[2.9,.7],[3,.54]],positions=[],uv=[],indices=[];
 for(const [z,w]of stations)for(const [factor,y]of [[-1,.82],[-.93,.15],[-.54,-.36],[0,-.43],[.54,-.36],[.93,.15],[1,.82]]){positions.push(w*factor,y,z);uv.push(z+3,(factor+1)*.7+y*.15);}
 for(let row=0;row<stations.length-1;row++)for(let c=0;c<6;c++){const a=row*7+c,b=a+1,d=a+7,e=d+1;indices.push(a,b,d,b,e,d);}
 for(const row of [0,stations.length-1]){const start=row*7;for(let c=1;c<6;c++)if(row===0)indices.push(start,start+c+1,start+c);else indices.push(start,start+c,start+c+1);}
 const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hull.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));hull.setIndex(indices);hull.computeVertexNormals();mesh(boat,hull,m.hull,[0,0,0],'Closed steel hull below the actual waterline');
 const outline=[...stations.map(([z,w])=>new THREE.Vector2(-w*.96,-z)),...stations.slice().reverse().map(([z,w])=>new THREE.Vector2(w*.96,-z))],shape=new THREE.Shape(outline);
 const deck=mesh(boat,new THREE.ExtrudeGeometry(shape,{depth:.05,bevelEnabled:true,bevelSize:.007,bevelThickness:.003,bevelSegments:2,steps:1}),m.oak,[0,.72,0],'Measured oak passenger deck substrate');deck.rotation.x=-Math.PI/2;deck.userData.launchOccluder=true;
 const deckTop=mesh(boat,passengerDeckGeometry(stations),m.deck,[0,0,0],'Actual open aft teak deck / unobstructed boarding destination');deckTop.userData.launchAO=true;
 for(const side of [-1,1]){
  const edge=stations.map(([z,w])=>new THREE.Vector3(side*w,.84,z));mesh(boat,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge),90,.035,10,false),m.rail);
  for(const z of [-1.8,1.9]){mesh(boat,new THREE.CylinderGeometry(.095,.11,.44,18),m.rubber,[side*1.1,.44,z],'Hanging rubber fender');rod(boat,[side*1.03,.86,z],[side*1.11,.64,z],.012,m.brass);}
  for(const z of [-2,-1.5,-1,-.5,0,.5,1,1.5,2])mesh(boat,new THREE.SphereGeometry(.018,8,6),m.brass,[side*(stations.find(([zz])=>zz>=z)?.[1]||1.05)*.95,.65,z]);
 }
 // Real lower panels, slender posts and separate glazing enclose a cabin.
 for(const side of [-1,1]){
  launchBox(boat,[.055,.48,3.02],[side*.83,1.035,-.8],m.cream,'Rounded cabin lower panel',.008);
  for(const z of [-2.27,-1.2,-.12,.7])launchBox(boat,[.055,1.04,.055],[side*.84,1.67,z],m.cream,'Rounded glazing mullion',.006,false);
  for(const [z,length]of [[-1.75,.96],[-.66,.97],[.31,.68]]){
   const glass=mesh(boat,new THREE.PlaneGeometry(length,.72),m.glass,[side*.845,1.68,z],'Separate thin cabin glazing');glass.rotation.y=side*Math.PI/2;glass.castShadow=false;
   for(const y of [1.32,2.04])rod(boat,[side*.851,y,z-length*.5],[side*.851,y,z+length*.5],.006,m.rubber);
   for(const end of [-1,1])rod(boat,[side*.851,1.32,z+end*length*.5],[side*.851,2.04,z+end*length*.5],.006,m.rubber);
  }
  launchBox(boat,[.08,.045,3.09],[side*.84,1.285,-.8],m.rail,'Brushed metal window sill',.006,false);
  launchBox(boat,[.065,.07,3.08],[side*.84,2.12,-.8],m.cream,'Rounded cabin window header',.007,false);
 }
 launchBox(boat,[1.7,.44,.06],[0,1.01,-2.32],m.cream,'Rounded front lower cabin panel',.009);launchBox(boat,[1.7,.055,.06],[0,2.12,-2.32],m.cream,'Rounded windscreen header',.006,false);launchBox(boat,[.05,.93,.07],[0,1.65,-2.32],m.cream,'Rounded windscreen mullion',.006,false);
 launchBox(boat,[1.7,.045,.075],[0,1.265,-2.32],m.rail,'Brushed windscreen base reveal',.006,false);
 for(const x of [-.415,.415]){const windscreen=mesh(boat,new THREE.PlaneGeometry(.76,.78),m.glass,[x,1.67,-2.354]);windscreen.rotation.y=Math.PI;windscreen.castShadow=false;}
 for(const x of [-.65,.65]){launchBox(boat,[.38,1.36,.06],[x,1.43,.75],m.cream,'Aft cabin doorway / rounded jamb',.009);rod(boat,[x*.55,1.18,.79],[x*.55,1.94,.79],.018,m.brass);}
 launchBox(boat,[1.94,.12,3.42],[0,2.23,-.8],m.cream,'Overhanging passenger roof / rounded underside lip',.016);launchBox(boat,[1.98,.035,3.48],[0,2.3,-.8],m.hull,'Enamel roof cap / rolled metal edge',.007,false);
 for(const z of [-1.75,-.85,.05])for(const side of [-1,1]){
  launchBox(boat,[.58,.16,.52],[side*.46,1.05,z],m.fabric,'Soft upholstered passenger seat',.035,false);launchBox(boat,[.6,.55,.12],[side*.46,1.3,z+.27],m.fabric,'Soft upholstered seat back',.025,false);
  for(const x of [side*.46-.2,side*.46+.2])rod(boat,[x,.78,z],[x,.99,z],.022,m.rail);
 }
 // Aft boarding opening is on the starboard (+X) side at local z1.1.
 for(const side of [-1,1]){
  const zs=side===1?[1.75,2.55]:[.95,1.75,2.55];for(const z of zs){rod(boat,[side*.99,.8,z],[side*.99,1.47,z],.024,m.rail);launchBox(boat,[.105,.018,.105],[side*.99,.802,z],m.brass,'Bolted guardrail foot',.004,false);}
  rod(boat,[side*.99,1.47,side===1?1.75:.95],[side*.99,1.47,2.55],.024,m.rail);
 }
 rod(boat,[-.99,1.47,2.55],[.99,1.47,2.55],.024,m.rail);
 for(const side of [-1,1]){rod(boat,[side*.75,.83,-2.15],[side*.75,1.39,-2.15],.022,m.rail);rod(boat,[side*.75,1.39,-2.15],[0,1.34,-2.83],.022,m.rail);}
 const buoy=mesh(boat,new THREE.TorusGeometry(.2,.042,10,36),m.cream,[-.89,1.65,-.45],'Life ring');buoy.rotation.y=Math.PI/2;
 for(const side of [-1,1]){box(boat,[.11,.14,.15],[side*.89,2.23,-2.1],side<0?m.red:m.green);box(boat,[.16,.05,.2],[side*.89,2.33,-2.1],m.hull);}
 launchBox(boat,[.13,.13,.12],[0,1.57,2.58],m.white,'Warm stern lantern',.018,false);
 rod(boat,[0,2.35,-.4],[0,2.82,-.4],.018,m.brass);launchBox(boat,[.11,.13,.11],[0,2.83,-.4],m.white,'Mast lantern behind the open aft viewpoint',.015,false);
 for(const z of [-2.3,2.3])for(const x of [-.48,.48]){rod(boat,[x,.79,z],[x,.92,z],.035,m.brass);rod(boat,[x-.08,.92,z],[x+.08,.92,z],.026,m.brass);}
 box(boat,[.11,.45,.11],[.4,1.04,-1.96],m.rail);const wheel=mesh(boat,new THREE.TorusGeometry(.16,.017,8,24),m.brass,[.4,1.36,-1.91]);wheel.rotation.x=.35;
 bakePassengerContactAO(boat);return boat;
}
function buildGangway(parent,m){
 const g=new THREE.Group();g.name='Working folding gangway, platform to starboard aft deck';g.position.set(20,.74,9.1);parent.add(g);
 const slope=.06/1.45,deck=new THREE.Group();deck.rotation.z=Math.atan(slope);g.add(deck);
 box(deck,[1.45,.065,.88],[-.725,-.04,0],m.rail);for(let i=0;i<12;i++)box(deck,[.095,.028,.79],[-.075-i*.115,.004,0],m.oak);
 for(const z of [-.41,.41]){for(const x of [-.1,-.72,-1.39])rod(deck,[x,.035,z],[x,.73,z],.019,m.rail);rod(deck,[-.1,.73,z],[-1.39,.73,z],.023,m.rail);}
 const hinge=mesh(g,new THREE.CylinderGeometry(.07,.07,1.0,16),m.brass,[0,0,0]);hinge.rotation.x=Math.PI/2;return g;
}
function buildSignalBoard(parent,m,ownedMaterials,ownedTextures){
 const g=new THREE.Group();g.name='Working platform departure board and signal';g.position.set(22.8,2.4,14.8);parent.add(g);
 box(g,[.15,1.04,1.85],[0,0,0],m.hull);rod(g,[0,-1.75,-.62],[0,-.48,-.62],.048,m.rail);rod(g,[0,-1.75,.62],[0,-.48,.62],.048,m.rail);
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;let texture=null,context=null,labelMaterial;
 if(canvas){canvas.width=1120;canvas.height=600;context=canvas.getContext('2d');texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;ownedTextures.add(texture);labelMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.8,emissive:'#d5c598',emissiveIntensity:.035});}
 else labelMaterial=new THREE.MeshStandardMaterial({color:'#d5c598',roughness:.8});ownedMaterials.add(labelMaterial);
 for(const side of [-1,1]){const display=mesh(g,new THREE.PlaneGeometry(1.65,.87),labelMaterial,[side*.081,0,0]);display.rotation.y=side*Math.PI/2;}
 const lamps=[];
 for(let i=0;i<3;i++){
  const lamp=new THREE.MeshStandardMaterial({color:i===0?'#9e4e3e':i===1?'#b09456':'#4b8063',roughness:.5,emissive:i===0?'#e15636':i===1?'#f5b75a':'#53b57a',emissiveIntensity:.05});ownedMaterials.add(lamp);
  mesh(g,new THREE.SphereGeometry(.088,18,12),lamp,[-.22,.32-i*.31,-1.09]);box(g,[.32,.3,.3],[0,.32-i*.31,-1.09],m.hull);lamps.push(lamp);
 }
 let lastKey='';
 function update(phase,elapsed,paused,worldTime){
  const selected=phase==='approaching'||phase==='docked'?2:phase==='boarding'?1:phase==='departing'?0:1;
  for(let i=0;i<lamps.length;i++)lamps[i].emissiveIntensity=i===selected?(phase==='approaching'?.9+.3*Math.sin(worldTime*3):1.1):.025;
  const seconds=phase==='approaching'?Math.max(0,Math.ceil(22-elapsed)):0,key=phase+':'+seconds+':'+paused;if(!context||key===lastKey)return;lastKey=key;
  context.fillStyle='#203335';context.fillRect(0,0,1120,600);context.strokeStyle='#a89669';context.lineWidth=8;context.strokeRect(24,24,1072,552);context.textAlign='center';context.textBaseline='middle';context.fillStyle='#c5b887';context.font='42px Georgia,"Microsoft YaHei",serif';context.fillText('北船坞 · 运河客运',560,109);context.fillStyle='#e3ddc6';context.font='500 73px "Microsoft YaHei",sans-serif';
  const text={idle:'下一班，等你呼船',approaching:'客船正在进站',docked:'已靠泊，请上船',boarding:'请沿栈桥上船',departing:'客船离站',complete:'留一班船给下次'}[phase];context.fillText(text,560,282,1010);context.font='44px "Microsoft YaHei",sans-serif';context.fillStyle='#b4bca9';context.fillText(paused?'暂停片刻':phase==='approaching'?'约 '+seconds+' 秒后靠泊':phase==='docked'?'上船，或留在站台':'NORTH DOCK / SERVICE 07',560,457,1000);texture.needsUpdate=true;
 }
 return {update};
}
function readHistory(){
 try{const raw=globalThis.localStorage?.getItem(STORAGE_KEY);if(!raw)return {completedTrips:0,lastChoice:null};const v=JSON.parse(raw);return {completedTrips:Number.isSafeInteger(v.completedTrips)&&v.completedTrips>=0?Math.min(v.completedTrips,999999):0,lastChoice:['board','stay'].includes(v.lastChoice)?v.lastChoice:null};}catch{return {completedTrips:0,lastChoice:null};}
}
function writeHistory(choice,previous){const next={completedTrips:previous.completedTrips+1,lastChoice:choice};try{globalThis.localStorage?.setItem(STORAGE_KEY,JSON.stringify({...next,updatedAt:new Date().toISOString()}));}catch{}return next;}
