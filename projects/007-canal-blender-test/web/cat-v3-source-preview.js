import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#d4d2cf');
scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2.8));
const key=new THREE.DirectionalLight(0xfff5e8,3);key.position.set(2,3,4);scene.add(key);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.005,20);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.235,0);controls.minDistance=.35;controls.maxDistance=3;
const gltf=await new GLTFLoader().loadAsync('./models/cat-v3-reference-source.glb');
const model=gltf.scene;model.rotation.y=.7;model.scale.setScalar(.9685895306353042);scene.add(model);
function view(name){
 const p={front:[0,.27,1.18],side:[1.22,.28,0],quarter:[.72,.39,.98]}[name];
 camera.position.set(...p);controls.target.set(0,.235,0);controls.update();renderer.render(scene,camera);
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view)));
view('quarter');
window.__catSourcePreview={loaded:true,view,bounds:new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray(),sourceHeadingCorrection:.7,earHeight:.42};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
