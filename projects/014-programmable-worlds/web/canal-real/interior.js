import * as THREE from 'three';
import {RoundedBoxGeometry} from '../quality-window/RoundedBoxGeometry.js';

export function buildInterior(scene,m,{shopAssets}={}){
 // The observed room has its own irradiance charts and local reflections.
 // Sharing an atlas with every street window starves these near surfaces.
 const roomMaterial=(source,name)=>{const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;material.name='Canal/'+name;return material;};
 m={...m,oak:roomMaterial(m.oak,'roomOak'),plaster:roomMaterial(m.plaster,'roomPlaster')};
 const root=new THREE.Group();root.name='Deep window and observed interior';scene.add(root);
 function box(w,h,d,x,y,z,material,r=.015){const geometry=new RoundedBoxGeometry(w,h,d,3,Math.min(r,Math.min(w,h,d)*.18)),uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;for(let i=0;i<uv.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));if(ax>ay&&ax>az)uv.setXY(i,p.getZ(i),p.getY(i));else if(ay>az)uv.setXY(i,p.getX(i),p.getZ(i));else uv.setXY(i,p.getX(i),p.getY(i));}const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;root.add(o);return o;}
 // The opening is 3.8m wide and 2.6m tall, in a 45cm thick masonry wall.
 // Camera begins 1.2m inside it; the external landscape remains true geometry.
 box(.5,1.5,8,-9.1,1.1,11.5,m.plaster,.02);box(.5,1.4,8,-9.1,4.95,11.5,m.plaster,.02);
 box(.5,3.2,2,-9.1,3.05,8.6,m.plaster,.025);box(.5,3.2,2,-9.1,3.05,14.4,m.plaster,.025);
 box(5.8,.16,8,-11.8,1.2,11.5,m.oak,.02);box(.2,3.6,8,-14.5,3.0,11.5,m.plaster,.02);
 // A complete room matters even in the first view: oblique rays previously
 // looked around the finite front wall and exposed the outside at image left.
 box(5.8,3.6,.2,-11.8,3.0,7.6,m.plaster,.02);
 box(5.8,3.6,.2,-11.8,3.0,15.4,m.plaster,.02);
 box(5.8,.16,8,-11.8,4.8,11.5,m.plaster,.02);
 for(const z of [9.6,13.4])box(.6,2.6,.12,-9.12,3.05,z,m.oak,.02);
 for(const y of [1.76,4.34])box(.6,.12,3.9,-9.12,y,11.5,m.oak,.02);
 box(.88,.16,4.18,-9.22,1.73,11.5,m.oak,.03);
 // A shallow top sash stays outside the principal sightline. Open casements
 // reflect the same sky, avoiding a milky screen laid over the entire world.
 const sash=new THREE.Group();sash.position.set(-9.12,3.05,13.4);sash.rotation.y=-.43;root.add(sash);
 const glass=new THREE.Mesh(new THREE.PlaneGeometry(1.86,2.45),m.glass);glass.rotation.y=Math.PI/2;glass.position.set(0,0,-.93);glass.castShadow=false;sash.add(glass);
 for(const z of [0,-1.86]){const o=new THREE.Mesh(new RoundedBoxGeometry(.08,2.5,.07,2,.01),m.oak);o.position.set(0,0,z);sash.add(o);}
 for(const y of [-1.25,1.25]){const o=new THREE.Mesh(new RoundedBoxGeometry(.08,.07,1.92,2,.01),m.oak);o.position.set(0,y,-.93);sash.add(o);}
 // Quiet foreground objects carry honest dimensions and self-shadowing.
 const table=box(1.65,.07,.75,-10.3,1.95,13.45,m.oak,.025);
 for(const x of [-10.95,-9.65])for(const z of [13.17,13.73])box(.07,.72,.07,x,1.56,z,m.oak,.008);
 if(shopAssets){let y=1.986;for(let i=0;i<3;i++){const book=shopAssets.looseBook(root,{x:-10.15,y,z:13.38,index:13+i*2,angle:.13+i*.08});const bounds=new THREE.Box3().setFromObject(book);y+=bounds.max.y-bounds.min.y+.001;}}
 else for(let i=0;i<3;i++){const book=box(.24,.04,.34,-10.15,2.01+i*.045,13.38,m.books[i+1],.006);book.rotation.y=.13+i*.08;}
 const ceramic=new THREE.MeshPhysicalMaterial({color:'#b6b0a1',roughness:.25,clearcoat:.6,clearcoatRoughness:.18});ceramic.name='Canal/ceramic';
 const profile=[new THREE.Vector2(0,0),new THREE.Vector2(.054,0),new THREE.Vector2(.058,.015),new THREE.Vector2(.063,.11),new THREE.Vector2(.061,.118),new THREE.Vector2(.055,.116),new THREE.Vector2(.052,.025),new THREE.Vector2(0,.025)];
 const cup=new THREE.Mesh(new THREE.LatheGeometry(profile,40),ceramic);cup.position.set(-10.63,1.986,13.38);cup.castShadow=true;root.add(cup);
 const teaMaterial=new THREE.MeshPhysicalMaterial({color:'#382b1e',roughness:.08,metalness:.1});teaMaterial.name='Canal/tea';const tea=new THREE.Mesh(new THREE.CircleGeometry(.052,40),teaMaterial);tea.rotation.x=-Math.PI/2;tea.position.set(-10.63,2.081,13.38);root.add(tea);
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.035,.008,12,48,Math.PI*1.5),ceramic);handle.position.set(-10.63,2.051,13.463);handle.rotation.set(0,Math.PI/2,Math.PI*.25);handle.castShadow=handle.receiveShadow=true;root.add(handle);
 const lamp=new THREE.PointLight('#ffd3a2',24,7,2);lamp.position.set(-11.2,3.6,14.2);root.add(lamp);
 return root;
}
