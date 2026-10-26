import {collectNativeRockVolume} from './native-sdf-fields.js';
import {buildNativeMeshData} from './native-mesh-builder.js';
import {bakeNativeSurfaceColors} from './native-surface-fields.js';

const SHARED_SPACING=2;
export function alignVolumeSpec(spec){
  const origin=spec.origin.map(v=>Math.floor(v/SHARED_SPACING)*SHARED_SPACING);
  const size=Math.ceil((spec.size+SHARED_SPACING)/SHARED_SPACING)*SHARED_SPACING,resolution=size/SHARED_SPACING+1;
  if(resolution<64||resolution>512)throw new Error('Shared rock lattice exceeds verified volume bounds');
  return {...spec,origin,size,resolution};
}
const PATH=[[-13.1824,1350],[-4.4702,1280],[14.7384,1050],[-5,830],[-33,690],[-50,650]];
export function volumeSpec(peak){
  const [x,z,height,rx,rz]=peak;
  const distance=Math.min(...PATH.map(p=>Math.hypot(x-p[0],z-p[1]))),angularHeight=height/Math.max(250,distance);
  const resolution=distance<1450&&angularHeight>.20?320:angularHeight>.18?224:angularHeight>.10?144:96;
  const radius=Math.max(rx,rz)*1.32+10,size=Math.ceil(Math.max(radius*2+12,height*1.15+40)/8)*8;
  return alignVolumeSpec({resolution,origin:[x-size/2,-24,z-size/2],size,centre:[x,z],clipEllipse:[radius,radius],maxBatchPixels:60000});
}
// Extra domains cover only genuinely new connecting ground outside the original
// peak clips. Every domain samples the exact same terrSD, not a bridge model.
const mix=(a,b,t)=>a+(b-a)*t;
const point=(e,t)=>[mix(mix(e.A[0],e.control[0],t),mix(e.control[0],e.B[0],t),t),mix(mix(e.A[1],e.control[1],t),mix(e.control[1],e.B[1],t),t)];
function ridgeHeight(e,x,z){
  let best=Infinity,u=0;
  for(let j=0;j<4;j++){const t=j*.25,a=point(e,t),b=point(e,t+.25),dx=b[0]-a[0],dz=b[1]-a[1],s=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(.001,dx*dx+dz*dz))),d=Math.hypot(x-a[0]-dx*s,z-a[1]-dz*s);if(d<best){best=d;u=t+s*.25;}}
  const width=e.width*(.86+.14*Math.sin(Math.PI*u+e.phase)+.09*Math.sin(3*Math.PI*u+e.phase*.7));
  return best>=width?0:mix(e.height[0],e.height[1],u)*(1-e.saddleDepth*Math.sin(Math.PI*u)**2)*Math.max(0,1-(best/width)**2)**(1.22+.20*Math.sin(u*Math.PI+e.phase));
}
export function connectionPatchSpecs(peaks,landscape){
  if(!landscape?.connections)return [];
  const base=peaks.map(volumeSpec),cells=new Map(),cell=256,radius=Math.SQRT2*cell/2+12;
  const covered=(x,z)=>base.some(b=>((x-b.centre[0])/b.clipEllipse[0])**2+((z-b.centre[1])/b.clipEllipse[1])**2<=1);
  const add=(x,z,height)=>{if(height<=6||covered(x,z))return;const ix=Math.floor(x/cell),iz=Math.floor(z/cell),key=ix+','+iz,c=cells.get(key);if(c)c.top=Math.max(c.top,height);else cells.set(key,{x:(ix+.5)*cell,z:(iz+.5)*cell,top:height});};
  for(const e of [...landscape.connections,...(landscape.branches||[])]){
    const b=e.bounds;
    for(let z=b.min[2];z<=b.max[2]+12;z+=12)for(let x=b.min[0];x<=b.max[0]+12;x+=12)add(x,z,ridgeHeight(e,x,z));
  }
  for(const h of landscape.lowHills||[]){const [cx,cz]=h.center,[rx,rz]=h.axes,c=Math.cos(h.angle),n=Math.sin(h.angle),r=Math.max(rx,rz);
    for(let z=cz-r;z<=cz+r+12;z+=12)for(let x=cx-r;x<=cx+r+12;x+=12){const dx=x-cx,dz=z-cz,a=(dx*c+dz*n)/rx,b=(-dx*n+dz*c)/rz,q=a*a+b*b;add(x,z,q<1?h.height*(1-q)**1.35*1.1:0);}}
  return [...cells.values()].map(c=>{const size=Math.ceil(Math.max(radius*2+16,c.top*1.2+60)/8)*8;return alignVolumeSpec({resolution:224,origin:[c.x-size/2,-24,c.z-size/2],size,centre:[c.x,c.z],clipEllipse:[radius,radius],maxBatchPixels:60000,connectionPatch:true});});
}

const SUN=[Math.sin(25*Math.PI/180)*Math.cos(18*Math.PI/180),Math.sin(18*Math.PI/180),Math.cos(25*Math.PI/180)*Math.cos(18*Math.PI/180)];

// Build one native isosurface at a time, then retain only its actual mesh
// arrays. No authored model is fetched and no full-volume stack is retained.
export async function collectNativeRockBatch({peaks=window.lijiangNativePeakSpec,primary,specializeVegetation=true,materialOnly=false,materialSampler=null,pipelineSampling=true,scheduleByWorkload=true}={}){
  if(!Array.isArray(peaks)||!peaks.length||!primary?.field)throw new Error('Native peak specification and primary signed volume are required');
  const rocks=[],rows=[],started=performance.now();
  const overlap=!!(pipelineSampling&&materialOnly&&materialSampler&&typeof Worker!=='undefined');
  const specs=peaks.map(volumeSpec);
  // Similar-sized neighbours cover each other's worker/GL work. Keeping the
  // original authored peak order alternated 320^3 meshes with tiny far peaks,
  // leaving most of the expensive mesh extraction uncovered. Return order is
  // still the authored order and every resolution/bound remains unchanged.
  const rest=Array.from({length:peaks.length-1},(_,i)=>i+1);
  if(overlap&&scheduleByWorkload)rest.sort((a,b)=>specs[b].resolution-specs[a].resolution||a-b);
  const order=[0,...rest];
  let prefetched=null;
  function prefetch(index,spec=specs[index]){
    // Only one next volume is allowed. Its own GL capture/restore remains
    // serial; only the dedicated CPU worker and CPU albedo run concurrently.
    prefetched={index,promise:collectNativeRockVolume(spec).then(value=>({value}),error=>({error}))};
  }
  try{
    for(let workIndex=0;workIndex<order.length;workIndex++){
      const index=order[workIndex];
      const peakStarted=performance.now(),[x,z,height,rx,rz]=peaks[index];
      let volume=index===0&&primary.metadata?.spacing===SHARED_SPACING&&primary.metadata.origin?.every(v=>v%SHARED_SPACING===0)?primary:null;
      if(!volume){
        if(prefetched?.index===index){
          const pending=prefetched;prefetched=null;const next=await pending.promise;
          if(next.error)throw next.error;volume=next.value;
        }else volume=await collectNativeRockVolume(specs[index]);
      }
      if(overlap&&workIndex+1<order.length)prefetch(order[workIndex+1]);
      const meshStarted=performance.now(),meshReused=!!volume.meshData,built=await buildNativeMeshData(volume);const meshMilliseconds=performance.now()-meshStarted;
      try{
        const positions=built.meshData.positions,colorStarted=performance.now();
        let colors=volume.colors,colorMetadata=volume.colorMetadata;
        if(!colors){
          const shade=materialOnly&&materialSampler
            ? await materialSampler.colorVertices(positions,built.meshData.normals)
            : await bakeNativeSurfaceColors(positions,{sunDirection:SUN,maxBatchPixels:60000,specializeVegetation,materialOnly});
          colors=shade.colors;colorMetadata=shade.metadata;
        }
        rocks.push({peakIndex:index,metadata:volume.metadata,colorMetadata,stats:built.stats,
          meshData:{...built.meshData,colors}});
        rows.push({peakIndex:index,workIndex,resolution:volume.metadata.resolution,samplingMilliseconds:volume.metadata.collectedMilliseconds,
          samplingPhaseTimings:volume.metadata.phaseTimingsMilliseconds||null,samplingDraws:volume.metadata.statistics?.submittedDraws??null,samplingReadbacks:volume.metadata.statistics?.readbackCalls??null,
          meshMilliseconds,meshKernelMilliseconds:built.stats.milliseconds,meshPhaseTimings:built.stats.phaseTimingsMilliseconds||null,meshExecution:built.stats.execution,meshReused,samplingOverlappedWithWorker:overlap,colorMilliseconds:performance.now()-colorStarted,wallMilliseconds:performance.now()-peakStarted});
      }finally{if(index>0){volume.field=null;volume.meshData=null;}}
      window.lijiangNativeRockBatchStatus={phase:'building',completed:rocks.length,total:peaks.length,elapsedMilliseconds:performance.now()-started,rows:rows.slice()};
      const text=document.getElementById('loadtxt');if(text)text.textContent=`完整岩壁 · ${rocks.length} / ${peaks.length}`;
      if(typeof runtimeYield==='function')await runtimeYield();
    }
    window.lijiangNativeRockBatchStatus={phase:'complete',completed:rocks.length,total:peaks.length,elapsedMilliseconds:performance.now()-started,rows:rows.slice()};
    const patches=connectionPatchSpecs(peaks,window.lijiangNativeGroupSpec);
    window.lijiangM6ConnectionPatchSpecs=patches.map(p=>({...p}));
    window.lijiangM6SharedLattice={spacing:SHARED_SPACING,originPhase:[0,0,0],allVolumes:[...specs,...patches].map(p=>({origin:p.origin,size:p.size,resolution:p.resolution,spacing:p.size/(p.resolution-1)}))};
    for(let i=0;i<patches.length;i++){
      const index=peaks.length+i,patchStarted=performance.now();
      let volume;
      if(prefetched?.index===index){
        const pending=prefetched;prefetched=null;const next=await pending.promise;
        if(next.error)throw next.error;volume=next.value;
      }else volume=await collectNativeRockVolume(patches[i]);
      // Identical domain and output order; only one next GPU volume overlaps
      // this domain's dedicated MC worker and CPU material sampling. The
      // materialOnly/sampler/Worker guard prevents concurrent GL color bakes.
      if(overlap&&i+1<patches.length)prefetch(index+1,patches[i+1]);
      try{
        const meshStarted=performance.now(),built=await buildNativeMeshData(volume),positions=built.meshData.positions;
        const meshMilliseconds=performance.now()-meshStarted,colorStarted=performance.now();
        const shade=materialOnly&&materialSampler?await materialSampler.colorVertices(positions,built.meshData.normals):await bakeNativeSurfaceColors(positions,{sunDirection:SUN,maxBatchPixels:60000,specializeVegetation,materialOnly});
        rocks.push({peakIndex:index,connectionPatch:true,metadata:{...volume.metadata,connectionPatch:true},colorMetadata:shade.metadata,stats:built.stats,meshData:{...built.meshData,colors:shade.colors}});
        rows.push({peakIndex:index,connectionPatch:true,resolution:volume.metadata.resolution,wallMilliseconds:performance.now()-patchStarted,triangles:built.meshData.indices?.length/3,
          meshMilliseconds,colorMilliseconds:performance.now()-colorStarted,samplingOverlappedWithWorker:overlap});
      }finally{volume.field=null;volume.meshData=null;}
      window.lijiangNativeRockBatchStatus={phase:'connection-patches',completed:i+1,total:patches.length,elapsedMilliseconds:performance.now()-started};
      const text=document.getElementById('loadtxt');if(text)text.textContent=`连接岩脊 · ${i+1} / ${patches.length}`;
      if(typeof runtimeYield==='function')await runtimeYield();
    }
    return rocks.sort((a,b)=>a.peakIndex-b.peakIndex);
  }finally{
    // Never abandon an active own-context readback on an extraction/colour
    // error: allow its finally block to restore GL state before propagating.
    if(prefetched)await prefetched.promise;
    window.lijiangM3GeometryTimings={rows:rows.slice(),generationOrder:order.slice(),scheduleByWorkload:overlap&&scheduleByWorkload,samplingWorkerOverlap:overlap,
      connectionSamplingWorkerOverlap:overlap,maximumPrefetchedVolumes:overlap?1:0,elapsedMilliseconds:performance.now()-started};
  }
}
