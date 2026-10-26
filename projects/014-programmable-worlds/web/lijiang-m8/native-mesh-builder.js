import {buildNativeMarchingMesh} from './native-marching-kernel.js';
let worker=null,nextId=0;
const jobs=new Map();
function ensureWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./native-marching-worker.js',import.meta.url),{type:'module',name:'Li River M3 marching cubes'});
  worker.addEventListener('message',event=>{
    const {id,field,result,error}=event.data,job=jobs.get(id);if(!job)return;jobs.delete(id);
    job.volume.field=field;
    if(error){job.reject(new Error(error));return;}
    result.stats.execution='module-worker';
    result.stats.mainThreadElapsedMilliseconds=performance.now()-job.started;
    result.stats.inputFieldCopied=false;result.stats.fieldBufferTransferredBack=true;
    job.resolve(result);
  });
  worker.addEventListener('error',event=>{
    const error=new Error('M3 MC worker failed: '+(event.message||'module load/worker execution error'));
    for(const job of jobs.values())job.reject(error);jobs.clear();worker?.terminate();worker=null;
  });
  return worker;
}
export async function buildNativeMeshData(volume,{useWorker=true}={}){
  if(volume.meshData)return {meshData:volume.meshData,stats:volume.colorGeometryStats||volume.meshStatistics};
  if(!volume?.field?.length)throw new Error('M3 mesh builder requires a complete generated scalar volume');
  if(!useWorker||typeof Worker==='undefined'){
    const result=buildNativeMarchingMesh(volume.field,volume.metadata);
    result.stats.execution='synchronous-CPU';result.stats.inputFieldCopied=false;
    volume.meshData=result.meshData;volume.meshStatistics=result.stats;return result;
  }
  const target=ensureWorker(),id=++nextId;
  const result=await new Promise((resolve,reject)=>{
    jobs.set(id,{volume,resolve,reject,started:performance.now()});
    try{target.postMessage({id,field:volume.field,metadata:volume.metadata},[volume.field.buffer]);}
    catch(error){jobs.delete(id);reject(error);}
  });
  volume.meshData=result.meshData;volume.meshStatistics=result.stats;return result;
}
export function disposeNativeMeshBuilder(){
  const pending=jobs.size;worker?.terminate();worker=null;
  for(const job of jobs.values())job.reject(new Error('M3 field producer disposed during mesh generation'));jobs.clear();
  return {terminatedWorker:true,pendingJobsCancelled:pending};
}
