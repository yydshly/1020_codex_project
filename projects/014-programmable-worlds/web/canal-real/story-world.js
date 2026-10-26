import * as THREE from 'three';

// Narrative objects are actual meshes in the common world, excluded from the
// static light bake. Picking the letter reparents and moves the same object.
export function createStoryWorld({scene,camera,materials:m}){
 const group=new THREE.Group();group.name='Dynamic letter journey';scene.add(group);
 const boat=new THREE.Group();boat.name='Open wooden letter boat';group.add(boat);
 const outline=[new THREE.Vector2(0,-.82),new THREE.Vector2(.19,-.64),new THREE.Vector2(.29,-.28),new THREE.Vector2(.30,.18),new THREE.Vector2(.23,.55),new THREE.Vector2(0,.85),new THREE.Vector2(-.23,.55),new THREE.Vector2(-.30,.18),new THREE.Vector2(-.29,-.28),new THREE.Vector2(-.19,-.64)];
 const positions=[],uv=[],indices=[],n=outline.length,levels=[[-.09,.48],[.025,.87],[.21,1]];
 for(const [y,scale]of levels)for(let i=0;i<n;i++){const p=outline[i];positions.push(p.x*scale,y,p.y*scale);uv.push(i/n*3.7,y+.12);}
 for(let row=0;row<levels.length-1;row++)for(let i=0;i<n;i++){const a=row*n+i,b=row*n+(i+1)%n,c=(row+1)*n+i,d=(row+1)*n+(i+1)%n;indices.push(a,c,b,b,c,d);}
 const hullGeometry=new THREE.BufferGeometry();hullGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hullGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));hullGeometry.setIndex(indices);hullGeometry.computeVertexNormals();
 const hullMaterial=m.greenWood.clone();hullMaterial.name='Dynamic / weathered boat hull';hullMaterial.side=THREE.DoubleSide;
 const hull=new THREE.Mesh(hullGeometry,hullMaterial);hull.castShadow=hull.receiveShadow=true;boat.add(hull);
 const rimCurve=new THREE.CatmullRomCurve3(outline.map(p=>new THREE.Vector3(p.x,.21,p.y)),true,'centripetal');
 const rim=new THREE.Mesh(new THREE.TubeGeometry(rimCurve,120,.018,8,true),m.oak);rim.castShadow=true;boat.add(rim);
 const floorPositions=[0,-.005,0],floorIndices=[];for(const p of outline)floorPositions.push(p.x*.73,-.005,p.y*.76);for(let i=0;i<n;i++)floorIndices.push(0,(i+1)%n+1,i+1);
 const floorGeometry=new THREE.BufferGeometry();floorGeometry.setAttribute('position',new THREE.Float32BufferAttribute(floorPositions,3));floorGeometry.setIndex(floorIndices);floorGeometry.computeVertexNormals();const floorUV=[];for(let i=0;i<floorPositions.length;i+=3)floorUV.push(floorPositions[i],floorPositions[i+2]);floorGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(floorUV,2));
 const floor=new THREE.Mesh(floorGeometry,m.oak);floor.receiveShadow=true;boat.add(floor);
 for(const z of [-.39,.12,.5]){const width=z>.4?.37:.48,seat=new THREE.Mesh(new THREE.BoxGeometry(width,.028,.11),m.oak);seat.position.set(0,.16,z);seat.castShadow=seat.receiveShadow=true;boat.add(seat);}
 const letter=new THREE.Group();letter.name='The same letter, afloat then held';letter.position.set(0,.177,.12);boat.add(letter);
 const paperMaterial=new THREE.MeshPhysicalMaterial({color:'#ddd1ac',roughness:.86,metalness:0});
 const envelope=new THREE.Mesh(new THREE.BoxGeometry(.315,.003,.216),paperMaterial);envelope.castShadow=envelope.receiveShadow=true;letter.add(envelope);
 const flapGeometry=new THREE.BufferGeometry();flapGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.151,.002,-.102,.151,.002,-.102,0,.003,.032],3));flapGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));flapGeometry.computeVertexNormals();
 const flapMaterial=paperMaterial.clone();flapMaterial.side=THREE.DoubleSide;const flap=new THREE.Mesh(flapGeometry,flapMaterial);letter.add(flap);
 const seal=new THREE.Mesh(new THREE.CylinderGeometry(.017,.018,.003,40),new THREE.MeshPhysicalMaterial({color:'#773b2e',roughness:.4,clearcoat:.25}));seal.position.set(0,.005,.028);seal.castShadow=true;letter.add(seal);
 // Texture belongs to a physical piece of paper, with a curled segmented edge.
 const noteMap=makeNote(),noteGeometry=new THREE.PlaneGeometry(.287,.384,12,18),p=noteGeometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setZ(i,Math.sin((p.getY(i)/.384+.5)*Math.PI)*.0025+Math.sin(p.getX(i)*35)*.0007);
 noteGeometry.computeVertexNormals();const note=new THREE.Mesh(noteGeometry,new THREE.MeshStandardMaterial({map:noteMap,roughness:.94,side:THREE.DoubleSide}));note.rotation.x=-Math.PI/2;note.position.set(0,.008,-.032);note.visible=false;note.castShadow=note.receiveShadow=true;letter.add(note);
 const startPosition=new THREE.Vector3(),startQuaternion=new THREE.Quaternion(),targetPosition=new THREE.Vector3(),targetQuaternion=new THREE.Quaternion(),offset=new THREE.Vector3();
 const heldRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,-.035));
 const noteCenterOffset=note.position.clone().applyQuaternion(heldRotation),projected=new THREE.Vector3();
 let choice=null,pickupSeconds=0,readingLayout=null;
 function reset(){choice=null;pickupSeconds=0;readingLayout=null;boat.add(letter);letter.position.set(0,.177,.12);letter.quaternion.identity();note.visible=false;note.scale.set(1,1,1);envelope.visible=flap.visible=seal.visible=true;}
 function choose(value,now=performance.now()){
  if(!['read','drift'].includes(value))throw new Error('Unknown letter decision');choice=value;
  if(value==='read'){scene.updateMatrixWorld(true);letter.getWorldPosition(startPosition);letter.getWorldQuaternion(startQuaternion);group.attach(letter);pickupSeconds=0;note.visible=true;note.scale.y=.52;}
 }
 function update({time=0,elapsed=0,choiceElapsed=0,delta=0,paused=false,now=performance.now()}={}){
  const downstream=choiceElapsed*(choice==='drift'?.62:choice==='read'?.22:0);
  boat.position.set(.9+Math.sin(time*.13)*.12,-.075+Math.sin(time*1.9)*.007,9.8-Math.min(elapsed,25)*.18-downstream);
  boat.rotation.set(Math.sin(time*.8)*.012,.12+Math.sin(time*.22)*.025,Math.sin(time*1.1)*.012);
  if(choice==='read'){
   if(!paused)pickupSeconds+=Math.max(0,delta);const t=THREE.MathUtils.clamp(pickupSeconds/1.5,0,1),ease=t*t*(3-2*t);
   camera.updateMatrixWorld();readingLayout=measureReadingArea();
   const halfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5),area=readingLayout.area;
   const widthFraction=(area.right-area.left)/readingLayout.width,heightFraction=(area.bottom-area.top)/readingLayout.height;
   const distance=Math.max(.63,.287/(2*halfFov*camera.aspect*widthFraction*.9),.384/(2*halfFov*heightFraction*.9));
   const centerX=(area.left+area.right)/readingLayout.width-1,centerY=1-(area.top+area.bottom)/readingLayout.height;
   offset.set(centerX*distance*halfFov*camera.aspect-noteCenterOffset.x,centerY*distance*halfFov-noteCenterOffset.y,-distance-noteCenterOffset.z).applyQuaternion(camera.quaternion);targetPosition.copy(camera.position).add(offset);
   targetQuaternion.copy(camera.quaternion).multiply(heldRotation);readingLayout.distance=distance;
   letter.position.lerpVectors(startPosition,targetPosition,ease);letter.quaternion.slerpQuaternions(startQuaternion,targetQuaternion,ease);
   note.scale.y=.52+.48*THREE.MathUtils.smoothstep(t,.22,.92);
   envelope.visible=flap.visible=seal.visible=t<.65;
  }
 }
 function measureReadingArea(){
  const canvas=document.querySelector('#world canvas'),canvasRect=canvas?.getBoundingClientRect();
  const width=Math.max(1,canvasRect?.width||innerWidth),height=Math.max(1,canvasRect?.height||innerHeight),originY=canvasRect?.top||0;
  const header=document.querySelector('header'),headerRect=header?.getClientRects().length?header.getBoundingClientRect():null;
  const top=headerRect?Math.max(18,headerRect.bottom-originY+18):18;
  let bottom=height-18;
  // Use the actual visible HUD, including the compact embedded preview. The
  // canvas aspect ratio alone cannot tell us how much reading space remains.
  for(const selector of ['.caption','#experience-timeline','#scene-controls','#choice','.hint','#experience-notice']){
   const element=document.querySelector(selector);if(!element?.getClientRects().length)continue;
   const rect=element.getBoundingClientRect();if(rect.height>0&&rect.top-originY>top)bottom=Math.min(bottom,rect.top-originY-16);
  }
  return {width,height,area:{left:Math.max(18,width*.08),right:width-Math.max(18,width*.08),top,bottom:Math.max(top+80,bottom)},bodyFontSourcePixels:96};
 }
 function paperScreenBounds(){
  if(!note.visible||!readingLayout)return null;
  camera.updateMatrixWorld();note.updateWorldMatrix(true,false);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  const vertices=note.geometry.attributes.position;
  for(let i=0;i<vertices.count;i++){projected.fromBufferAttribute(vertices,i).applyMatrix4(note.matrixWorld).project(camera);const x=(projected.x*.5+.5)*readingLayout.width,y=(.5-projected.y*.5)*readingLayout.height;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return {left,right,top,bottom,bodyFontEstimate:(bottom-top)*96/1500};
 }
 function getState(){letter.updateWorldMatrix(true,false);return {choice,boatPosition:boat.position.toArray(),letterPosition:letter.getWorldPosition(new THREE.Vector3()).toArray(),letterParent:letter.parent===boat?'boat':'held',paperVisible:note.visible,paperUnfold:note.scale.y,readingLayout,paperScreenBounds:paperScreenBounds()};}
 return {group,boat,letter,reset,choose,update,getState};
}

function makeNote(){
 const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=1500;const c=canvas.getContext('2d');c.fillStyle='#e5dab9';c.fillRect(0,0,canvas.width,canvas.height);
 let seed=237;for(let i=0;i<14000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%1120;seed=(seed*1664525+1013904223)>>>0;const y=seed%1500;c.fillStyle=i%2?'#584c3610':'#fffbe91a';c.fillRect(x,y,1+i%2,1);}
 c.strokeStyle='#7b70534a';c.lineWidth=1.5;c.strokeRect(58,58,1004,1384);
 c.textAlign='left';c.fillStyle='#292b22';c.font='500 110px Georgia,"Microsoft YaHei",serif';c.fillText('写给窗边的人',140,260);
 c.font='500 96px Georgia,"Microsoft YaHei",serif';c.fillStyle='#303128';
 const lines=['雨停以后，','记得打开窗。','没说完的话，','河水会带回来。','灯，还为你留着。'];
 lines.forEach((line,i)=>c.fillText(line,142,445+i*150));c.textAlign='right';c.font='italic 72px Georgia,"Microsoft YaHei",serif';c.fillText('一个还记得的人',960,1300);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.name='Fictional letter ink on actual curled paper';return texture;
}
