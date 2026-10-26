import {exportScene} from '../canal-real/scene-export.js';

export async function exportStationScene({scene,exclude,shots,endpoint,lighting}){
 if(!/^http:\/\/127\.0\.0\.1:8799\/export\/[a-f0-9]{48}$/.test(endpoint))throw new Error('Invalid station-only export receiver');
 const l=lighting.lighting,opaqueMaterialNames=new Set(),runtimeExcludedMaterialNames=new Set();
 scene.traverse(object=>{if(!object.isMesh||exclude.some(root=>root===object||root.getObjectById(object.id)))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){if(object.userData.runtimeAuxiliary||material.name.startsWith('StationAux/'))runtimeExcludedMaterialNames.add(material.name);else if(!material.transparent&&!material.transmission&&!/periwinkle/.test(material.name))opaqueMaterialNames.add(material.name);}});
 const originalToBlob=HTMLCanvasElement.prototype.toBlob;let encoding=Promise.resolve();
 // Bound concurrent browser encoding during the one-shot source export. This
 // does not change source pixels, texture dimensions, or the live renderer.
 HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){const canvas=this,width=this.width,height=this.height;encoding=encoding.then(()=>new Promise(resolve=>{const finish=blob=>{if(!blob)console.error('STATION_EXPORT_NULL_IMAGE '+JSON.stringify({width,height,type,quality}));callback(blob);resolve();};originalToBlob.call(canvas,blob=>{if(blob)finish(blob);else setTimeout(()=>originalToBlob.call(canvas,finish,type,quality),40);},type,quality);}));};
 try{return await exportScene({scene,exclude,shots,endpoint,sceneLabel:'Independent old shipyard and canal station',metadataOverrides:{
  schema:'shipyard-station-source-v1',sceneId:'shipyard-station',
  environment:{path:'web/canal-real/assets/lighting-r5/kloofendal_48d_partly_cloudy_puresky_2k.hdr',intensity:l.environmentIntensity,mappingRotationZDegrees:l.blenderMappingRotationZDegrees},
  lightingFingerprint:lighting.lightingFingerprint,runtimeLighting:l,
  practicalScaleAlreadyApplied:1,
  cameras:Object.fromEntries(Object.entries(shots).map(([name,shot])=>[name,{position:shot.position,target:shot.target,fov:shot.fov,width:1440,height:902,near:.045,far:450}])),
  opaqueMaterialNames:[...opaqueMaterialNames],runtimeExcludedMaterialNames:[...runtimeExcludedMaterialNames],
  workIdentity:{setting:'old-dry-dock-and-canal-passenger-station',geometryModule:'web/shipyard-station/scene.js',independentOf:'web/canal-real/baked-r4/canal-lightmapped.glb'},
  excluded:['Realtime station basin water','Moving passenger launch, gangway, signal and departure display','Sky background']
 }});}finally{HTMLCanvasElement.prototype.toBlob=originalToBlob;}
}
