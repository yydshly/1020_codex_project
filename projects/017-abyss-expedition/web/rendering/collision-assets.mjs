// SPDX-License-Identifier: GPL-3.0-only
// Collision snapshots of actual solids. No group-wide synthetic bounding box.
import * as THREE from 'three';

// World-sized coordinates relative to the ROV origin after scale .85. This
// conservative envelope covers every actuator state and the visual +/- .016
// roll; caller applies heading, never the scene scale for a second time.
export const ROV_COLLISION_PROFILE=Object.freeze({
  min:Object.freeze({x:-10.4,y:-9.2,z:-19}),
  max:Object.freeze({x:10.4,y:11.8,z:8.9}),
});
export const ROV_BODY_RADIUS=Math.hypot(
  Math.max(Math.abs(ROV_COLLISION_PROFILE.min.x),Math.abs(ROV_COLLISION_PROFILE.max.x)),
  Math.max(Math.abs(ROV_COLLISION_PROFILE.min.z),Math.abs(ROV_COLLISION_PROFILE.max.z)),
);

const fail=message=>{throw new TypeError(message);};
const finiteVector=vector=>['x','y','z'].every(axis=>Number.isFinite(vector[axis]));
const excluded=object=>object.visible===false||object.userData?.collision===false;

/**
 * snapshotSolidColliders(root,{padding=0,filter=(mesh,instanceId?)=>true}={})
 * Returns deeply frozen, owned world AABBs. A mesh UUID is stable for its life;
 * each InstancedMesh instance appends :index. Padding is in world units.
 * Invisible/collision:false ancestors exclude their whole subtree. Transparent
 * glass remains solid. A RingGeometry is an annotation, so only it is skipped.
 * An explicit userData.collisionBoxes array replaces a batch mesh's whole box
 * with independent local {min,max} boxes. An empty array creates no collider.
 * Custom boxes also expand per instance; filters still run once per instance.
 */
export function snapshotSolidColliders(root,{padding=0,filter=()=>true}={}){
  if(!root?.isObject3D)fail('Collider snapshots require a Three.js Object3D root');
  if(typeof padding!=='number'||!Number.isFinite(padding)||padding<0)fail('Collider padding must be a nonnegative finite world distance');
  if(typeof filter!=='function')fail('Collider filter must be a function');
  for(let ancestor=root;ancestor;ancestor=ancestor.parent)if(excluded(ancestor))return Object.freeze([]);
  root.updateWorldMatrix(true,true);
  const colliders=[],instanceMatrix=new THREE.Matrix4(),worldMatrix=new THREE.Matrix4();
  function append(mesh,localBox,matrix,id){
    if(!matrix.elements.every(Number.isFinite))fail('Collider transforms must remain finite');
    const box=localBox.clone().applyMatrix4(matrix).expandByScalar(padding);
    if(!finiteVector(box.min)||!finiteVector(box.max)||box.isEmpty())fail('Collider bounds must remain finite and ordered');
    colliders.push(Object.freeze({id,min:Object.freeze({x:box.min.x,y:box.min.y,z:box.min.z}),max:Object.freeze({x:box.max.x,y:box.max.y,z:box.max.z})}));
  }
  function appendBoxes(mesh,boxes,matrix,instanceId,custom){
    const accepted=filter(mesh,instanceId);if(typeof accepted!=='boolean')fail('Collider filter must return a boolean');if(!accepted)return;
    const id=mesh.uuid+(instanceId===undefined?'':`:${instanceId}`);
    boxes.forEach((box,index)=>append(mesh,box,matrix,id+(custom?`:box:${index}`:'')));
  }
  function localBoxes(object){
    if(Object.hasOwn(object.userData,'collisionBoxes')){
      const source=object.userData.collisionBoxes;if(!Array.isArray(source))fail('Explicit collisionBoxes must be an array of local bounds');
      return {custom:true,boxes:Array.from(source,item=>{
        if(!item?.min||!item?.max||!finiteVector(item.min)||!finiteVector(item.max)||['x','y','z'].some(axis=>item.min[axis]>item.max[axis]))fail('Explicit collision boxes must have finite ordered local bounds');
        return new THREE.Box3(new THREE.Vector3(item.min.x,item.min.y,item.min.z),new THREE.Vector3(item.max.x,item.max.y,item.max.z));
      })};
    }
    const geometry=object.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();const box=geometry.boundingBox;
    if(!box||box.isEmpty())return {custom:false,boxes:[]};
    if(!finiteVector(box.min)||!finiteVector(box.max))fail('Collider geometry must have finite bounds');
    return {custom:false,boxes:[box]};
  }
  function visit(object){
    if(excluded(object))return;
    if(object.isMesh&&object.geometry&&object.geometry.type!=='RingGeometry'){
      const {boxes,custom}=localBoxes(object);
      if(boxes.length){
        if(object.isInstancedMesh){
          if(!Number.isInteger(object.count)||object.count<0||object.count>object.instanceMatrix.count)fail('Instanced collider count exceeds its matrix buffer');
          for(let index=0;index<object.count;index++){
            object.getMatrixAt(index,instanceMatrix);worldMatrix.multiplyMatrices(object.matrixWorld,instanceMatrix);appendBoxes(object,boxes,worldMatrix,index,custom);
          }
        }else appendBoxes(object,boxes,object.matrixWorld,undefined,custom);
      }
    }
    for(const child of object.children)visit(child);
  }
  visit(root);return Object.freeze(colliders);
}
