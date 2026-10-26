import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export async function buildStationVegetation(scene,renderer){
 const root=new THREE.Group();root.name='Station masonry-joint scanned plants';
 const asset=new URL('../canal-real/assets/periwinkle_plant/',import.meta.url);
 const [plant,alpha]=await Promise.all([new GLTFLoader().loadAsync(new URL('periwinkle_plant_1k.gltf',asset).href),new THREE.TextureLoader().loadAsync(new URL('textures/periwinkle_plant_opacity_1k.png',asset).href)]);
 plant.scene.traverse(object=>{if(!object.isMesh)return;object.castShadow=object.receiveShadow=true;for(const material of Array.isArray(object.material)?object.material:[object.material]){material.alphaMap=alpha;material.alphaTest=.48;material.transparent=false;material.side=THREE.DoubleSide;material.roughness=.86;material.envMapIntensity=1;if(material.map)material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}object.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:object.material.map,alphaMap:alpha,alphaTest:.48,side:THREE.DoubleSide});});
 const variants=plant.scene.children;
 // Plants occupy sheltered wall joints and the unused rail verge, not the
 // active boarding platform or an evenly distributed decorative grid.
 for(let i=0;i<34;i++){
  const copy=variants[i%variants.length].clone(true),west=i<23;
  copy.position.set(west?-37.2+(i%4)*.19:32.8,.67,west?-13+i*.87:-.5+(i-23)*1.08);
  copy.rotation.y=i*2.399963;copy.scale.setScalar(.55+(i%5)*.09);root.add(copy);
 }
 scene.add(root);return root;
}
