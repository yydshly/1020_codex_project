import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// CC0 measured props. The book set contains twenty real, separately modeled
// volumes with photographed bindings, pages, normal maps and roughness.
export async function loadShopAssets(renderer){
 const loader=new GLTFLoader();
 const [bookAsset,shelfAsset]=await Promise.all([
  loader.loadAsync('assets/book_encyclopedia_set_01/book_encyclopedia_set_01_1k.gltf'),
  loader.loadAsync('assets/wooden_bookshelf_worn/wooden_bookshelf_worn_1k.gltf')
 ]);
 const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
 for(const scene of [bookAsset.scene,shelfAsset.scene])scene.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMapIntensity=1;for(const t of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.aoMap])if(t)t.anisotropy=anisotropy;}});
 const books=bookAsset.scene.children.map((child,index)=>{const group=new THREE.Group();group.name='Scanned encyclopedia volume '+(index+1);group.add(child.clone(true));group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());group.children[0].position.sub(new THREE.Vector3(center.x,box.min.y,center.z));group.updateMatrixWorld(true);return {source:group,size};});
 function normalized(source){const root=new THREE.Group(),copy=source.clone(true);root.add(copy);root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(copy),center=bounds.getCenter(new THREE.Vector3());copy.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));return root;}
 const shelf=normalized(shelfAsset.scene);
 function populate(parent,{x,y,w,h,depth}){
  const root=new THREE.Group();root.name='Scanned bookshop furniture and real bindings';parent.add(root);
  // Shelf tops measured from the actual model's horizontal faces; these are
  // not estimated box heights. Books sit on wood instead of floating in it.
  const levels=[.11,.39,.67,.96,1.28,1.66];
  for(let bay=0;bay<2;bay++){
   const centerX=x+(bay===0?-.81:.81),centerZ=depth-.48;
   const furniture=shelf.clone(true);furniture.position.set(centerX,y,centerZ);root.add(furniture);
   for(let row=0;row<levels.length;row++){
    let xx=-.59,index=0;
    while(xx<.56){
     const item=books[(index+row*7+bay*11)%books.length],scale=.96+((index*7+row*3)%8)*.008,width=item.size.x*scale;
     if(xx+width>.59)break;
     const book=item.source.clone(true);book.name=`Bound volume bay${bay+1} row${row+1} ${index+1}`;book.rotation.y=Math.PI;book.scale.setScalar(scale);book.position.set(centerX+xx+width/2,y+levels[row]+.002,centerZ-.195+((index*13+row)%5)*.004);
     // Keep grouped volumes mostly upright. Small variations occur in depth,
     // book size and occasional breathing spaces, as on a working shelf.
     root.add(book);xx+=width+.003;if(index%13===8)xx+=.035;index++;
    }
   }
  }
  return root;
 }
 function looseBook(parent,{x,y,z,index=0,angle=0}){
  const book=books[index%books.length].source.clone(true);book.rotation.z=Math.PI/2;book.rotation.y=angle;const root=new THREE.Group();root.add(book);root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());book.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));root.position.set(x,y,z);parent.add(root);return root;
 }
 return {populate,looseBook,dimensions:{shelf:[1.37395,2.06344,.5813],books:books.length},sources:['https://polyhaven.com/a/book_encyclopedia_set_01','https://polyhaven.com/a/wooden_bookshelf_worn']};
}
