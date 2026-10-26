import * as THREE from 'three';

// Runtime-only support terrain. It is deliberately added after the immutable
// GI model binds; it receives live deSun IBL, direct light and building shadows.
// No frozen mesh, UV, material atlas or baked irradiance is altered here.
export function createAuxiliaryGround({scene,materials}){
 const group=new THREE.Group();group.name='Runtime auxiliary unbaked land and foundations';group.userData.runtimeAuxiliary=true;
 const clones=[];
 function material(source,name){const m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;m.name='Runtime auxiliary / '+name;m.userData={...m.userData,runtimeAuxiliary:true};clones.push(m);return m;}
 const paving=material(materials.paving,'continuous paved land'),stone=material(materials.stone,'solid masonry foundations'),brick=material(materials.brickDark||materials.stone,'courtyard brick boundary'),cap=material(materials.stonePale||materials.stone,'courtyard stone coping');
 const boxes=[];
 function solid(name,x0,x1,z0,z1,bottom,top,mat){
  const geometry=new THREE.BoxGeometry(x1-x0,top-bottom,z1-z0),positions=geometry.attributes.position,normals=geometry.attributes.normal,uv=geometry.attributes.uv,center=new THREE.Vector3((x0+x1)/2,(top+bottom)/2,(z0+z1)/2);
  for(let i=0;i<positions.count;i++){const x=positions.getX(i)+center.x,y=positions.getY(i)+center.y,z=positions.getZ(i)+center.z,ax=Math.abs(normals.getX(i)),ay=Math.abs(normals.getY(i)),az=Math.abs(normals.getZ(i));if(ax>ay&&ax>az)uv.setXY(i,z,y);else if(ay>az)uv.setXY(i,x,z);else uv.setXY(i,x,y);}
  const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.copy(center);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.runtimeAuxiliary=true;group.add(mesh);boxes.push({name,min:[x0,bottom,z0],max:[x1,top,z1]});return mesh;
 }
 for(const side of [-1,1]){
  const sideBox=(name,inner,outer,z0,z1,bottom,top,mat)=>solid(name,side<0?-outer:inner,side<0?-inner:outer,z0,z1,bottom,top,mat);
  sideBox('Continuous land beyond '+(side<0?'left':'right')+' bank',9.8,260,-300,300,-2.4,.625,paving);
  // Existing houses start at y .72; a real footing closes the small vertical
  // gap instead of putting a floating wall above the new .625m ground.
  sideBox('Continuous low building footing '+side,10.25,17.4,-77,65,.35,.725,stone);
  sideBox('Canal bank continuation north '+side,4.15,9.8,-300,-76.99,-2.4,.625,paving);
  sideBox('Canal bank continuation south '+side,4.15,9.8,64.99,300,-2.4,.625,paving);
 }
 solid('Observation-room foundation',-14.7,-9.35,7.5,15.5,.35,1.125,stone);
 // A real side-yard boundary joins the first left-bank house and continues
 // beyond the story frame. It stops before the observation room's z7.5 wall;
 // the window and its open view remain physically unobstructed.
 solid('Left-bank courtyard masonry plinth',-10.65,-10.21,-2.1,6.7,.55,.94,stone);
 solid('Left-bank courtyard brick wall',-10.61,-10.25,-2.1,6.7,.91,2.64,brick);
 solid('Left-bank courtyard stone coping',-10.70,-10.16,-2.16,6.76,2.62,2.77,cap);
 for(const z of [-1.85,1.0,3.85,6.52]){
  solid('Courtyard masonry pier '+z,-10.69,-10.17,z-.20,z+.20,.63,2.79,brick);
  solid('Courtyard pier cap '+z,-10.73,-10.13,z-.25,z+.25,2.77,2.89,cap);
 }
 // These continue the existing 144m bed. The original water object remains
 // unique; its spectrum/reflection renderer owns the longer water surface.
 for(const [name,z0,z1]of [['north',-300,-76.99],['south',66.99,300]])solid('Canal bed continuation '+name,-4.13,4.13,z0,z1,-2.4,-1.52,stone);
 scene.add(group);
 function dispose(){group.removeFromParent();group.traverse(object=>object.geometry?.dispose());for(const m of clones)m.dispose();}
 return {group,dispose,getState:()=>({mode:'runtime-unbaked-auxiliary',receivesLiveLighting:true,sourceGeometryUnchanged:true,extent:{x:[-260,260],z:[-300,300]},openWaterChannelWidth:8.3,boxes})};
}
