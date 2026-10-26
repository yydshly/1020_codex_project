import {buildNativeMarchingMesh} from './native-marching-kernel.js';
// Each field buffer is transferred into and then back out of this worker.
// No WebGL context, scene asset, imported model or duplicate field is created.
self.addEventListener('message',event=>{
  const {id,field,metadata}=event.data;
  try{
    const result=buildNativeMarchingMesh(field,metadata);
    self.postMessage({id,field,result},[field.buffer,result.meshData.positions.buffer,result.meshData.normals.buffer,result.meshData.indices.buffer]);
  }catch(error){self.postMessage({id,field,error:String(error.stack||error)},[field.buffer]);}
});
