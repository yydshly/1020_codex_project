import {packedBufferManager} from '../packed-assets/loader.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export async function buildVegetation(scene,renderer,onProgress=()=>{}){
 const gltf=new GLTFLoader(await packedBufferManager(new THREE.LoadingManager(),new URL('./assets/tree_small_02/tree_small_02.bin',import.meta.url))),textures=new THREE.TextureLoader();
 const [tree,plants,treeAlpha,plantAlpha]=await Promise.all([
  gltf.loadAsync('assets/tree_small_02/tree_small_02_1k.gltf'),
  gltf.loadAsync('assets/periwinkle_plant/periwinkle_plant_1k.gltf'),
  textures.loadAsync('assets/tree_small_02/textures/tree_small_02_leaves_alpha_1k.png'),
  textures.loadAsync('assets/periwinkle_plant/textures/periwinkle_plant_opacity_1k.png')
 ]);onProgress(1);
 const root=new THREE.Group();root.name='CC0 scanned vegetation / individual leaf geometry';scene.add(root);
 function prepare(source,alpha){source.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;const materials=Array.isArray(o.material)?o.material:[o.material];for(const mat of materials){mat.envMapIntensity=.85;if(/leaves|periwinkle/.test(mat.name)){mat.alphaMap=alpha;mat.alphaTest=.48;mat.transparent=false;mat.depthWrite=true;mat.side=THREE.DoubleSide;mat.roughness=.84;mat.color.multiplyScalar(.88);mat.needsUpdate=true;}if(mat.map)mat.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  // Use the exact same mask for directional-light cutout shadows.
  const leaf=materials.find(mat=>mat.alphaMap);if(leaf&&materials.length===1)o.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:leaf.map,alphaMap:alpha,alphaTest:.48,side:THREE.DoubleSide});
 });}
 prepare(tree.scene,treeAlpha);prepare(plants.scene,plantAlpha);
 for(const [x,z,scale,angle]of [[6.6,-18.3,1.1,.8],[-6.3,-8.5,1.35,2.4],[6.7,20.8,1.08,3.6]]){
  const copy=tree.scene.clone(true);copy.position.set(x,.65,z);copy.scale.setScalar(scale);copy.rotation.y=angle;root.add(copy);
 }
 const variants=plants.scene.children;
 // Real plant silhouettes occur at roots and masonry cracks. Placement follows
 // sheltered soil strips and worn joints rather than uniformly covering stone.
 for(let i=0;i<85;i++){
  const side=i%2?1:-1,z=-35+(i*7.919)%66,x=side*(i%4===0?9.7:4.85+(i%3)*.12);
  const copy=variants[i%variants.length].clone(true);copy.position.set(x,.67,z);copy.rotation.y=i*2.39996;copy.scale.setScalar(.55+(i%5)*.12);root.add(copy);
 }
 // Planted window boxes use the same six scanned variants at their actual size.
 for(const z of [7.7,4.5])for(let i=0;i<3;i++){
  const copy=variants[(i+2)%variants.length].clone(true);copy.position.set(z<0?10.12:9.86,4.105,z+(i-1)*.25);copy.rotation.y=i;copy.scale.setScalar(.7);root.add(copy);
 }
 return root;
}
