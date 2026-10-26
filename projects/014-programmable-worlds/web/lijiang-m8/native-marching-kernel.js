import {edgeTable,triTable} from './native-mc-tables.js';
const MC_REVISION='m3-marching-active-cell-kernel-2';
const CORNERS=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const EDGE_CORNERS=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const TRI_COUNTS=new Uint8Array(256);
for(let c=0;c<256;c++)for(let i=0;i<16&&triTable[c*16+i]!==-1;i+=3)TRI_COUNTS[c]++;
// Each lattice edge is owned by its lower adjacent cell. Extra ownership on
// the maximum x/y/z faces covers boundary edges exactly once. This is merely
// accounting from the eight sampled signs; it never skips unsampled space.
const OWNED_EDGE_COUNTS=new Uint8Array(8*256);
for(let boundary=0;boundary<8;boundary++){
  let owned=(1<<0)|(1<<3)|(1<<8);
  if(boundary&1)owned|=(1<<1)|(1<<9);
  if(boundary&2)owned|=(1<<2)|(1<<11);
  if((boundary&3)===3)owned|=1<<10;
  if(boundary&4)owned|=(1<<4)|(1<<7);
  if((boundary&5)===5)owned|=1<<5;
  if((boundary&6)===6)owned|=1<<6;
  for(let c=0;c<256;c++){
    let bits=edgeTable[c]&owned,count=0;
    while(bits){bits&=bits-1;count++;}
    OWNED_EDGE_COUNTS[boundary*256+c]=count;
  }
}

function finiteArray(value,length,label){
  if(!value||value.length!==length||!Array.from(value).every(Number.isFinite))throw new Error('Invalid '+label);
  return Array.from(value);
}
function isFloat32(value){
  // instanceof fails for real generated arrays returned by another Window.
  return ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)==='[object Float32Array]';
}

export function buildNativeMarchingMesh(field,metadata){
  if(!isFloat32(field))throw new Error('M3 MC requires actual Float32 scalar field');
  const bakedColors=false,colors=null;
  const started=performance.now(),n=Number(metadata?.resolution),cells=n-1;
  if(!Number.isInteger(n)||n<3||n>512||field.length!==n*n*n)throw new Error('SDF dimensions disagree');
  const origin=finiteArray(metadata.origin,3,'volume origin');
  const size=typeof metadata.size==='number'?[metadata.size,metadata.size,metadata.size]:finiteArray(metadata.size,3,'volume size');
  if(!size.every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid volume size');
  const spacing=metadata.spacing===undefined?size.map(x=>x/cells):(typeof metadata.spacing==='number'?[metadata.spacing,metadata.spacing,metadata.spacing]:finiteArray(metadata.spacing,3,'volume spacing'));
  if(!spacing.every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid volume spacing');
  const offset=metadata.sampleOffset===undefined?[0,0,0]:finiteArray(metadata.sampleOffset,3,'sample offset');
  const centre=finiteArray(metadata.centre,2,'pilot centre'),ellipse=finiteArray(metadata.clipEllipse,2,'pilot ellipse');
  if(!ellipse.every(x=>x>0))throw new Error('Pilot ellipse axes must be positive');
  const iso=Number(metadata.isovalue??0);if(!Number.isFinite(iso))throw new Error('Invalid isovalue');
  const microNormalStrength=Number(metadata.microNormalStrength??.25);
  if(!Number.isFinite(microNormalStrength)||microNormalStrength<0||microNormalStrength>4)throw new Error('Invalid micro normal strength');
  const n2=n*n,phaseTimingsMilliseconds={};
  let minField=Infinity,maxField=-Infinity;
  for(let q=0;q<field.length;q++){
    const f=field[q];if(!Number.isFinite(f))throw new Error('Nonfinite SDF sample at '+q);
    if(f<minField)minField=f;if(f>maxField)maxField=f;
  }
  phaseTimingsMilliseconds.validateField=performance.now()-started;
  const classifyStarted=performance.now();
  let rawTriangles=0,activeCells=0,expectedVertices=0;
  let activeCapacity=Math.min(cells*cells*cells,n2*4);
  let activeSamples=new Uint32Array(activeCapacity),activeCases=new Uint8Array(activeCapacity);
  for(let z=0;z<cells;z++)for(let y=0;y<cells;y++){
    const row=n*y+n2*z,boundary=(y===cells-1?2:0)|(z===cells-1?4:0);
    // Adjacent cubes share their entire left face. Carry those four sign bits
    // forward, loading only the new right face after the first cube of a row.
    let c=(field[row]<iso?1:0)|(field[row+1]<iso?2:0)|(field[row+1+n]<iso?4:0)|(field[row+n]<iso?8:0)|
      (field[row+n2]<iso?16:0)|(field[row+1+n2]<iso?32:0)|(field[row+1+n+n2]<iso?64:0)|(field[row+n+n2]<iso?128:0);
    for(let x=0;x<cells;x++){
      const q=row+x;
      if(c!==0&&c!==255){
        rawTriangles+=TRI_COUNTS[c];
        expectedVertices+=OWNED_EDGE_COUNTS[((boundary|(x===cells-1?1:0))*256)+c];
        if(activeCells===activeCapacity){
          activeCapacity=Math.min(cells*cells*cells,activeCapacity*2);
          const nextSamples=new Uint32Array(activeCapacity),nextCases=new Uint8Array(activeCapacity);
          nextSamples.set(activeSamples);nextCases.set(activeCases);activeSamples=nextSamples;activeCases=nextCases;
        }
        activeSamples[activeCells]=q;activeCases[activeCells++]=c;
      }
      if(x+1<cells)c=((c&2)>>1)|((c&4)<<1)|((c&32)>>1)|((c&64)<<1)|
        (field[q+2]<iso?2:0)|(field[q+2+n]<iso?4:0)|(field[q+2+n2]<iso?32:0)|(field[q+2+n+n2]<iso?64:0);
    }
  }
  phaseTimingsMilliseconds.classifyAndCountEdges=performance.now()-classifyStarted;
  const maxTriangles=Number(metadata.maxTriangles??3000000);
  if(rawTriangles>maxTriangles)throw new Error('Pilot triangle budget exceeded: '+rawTriangles+' > '+maxTriangles);
  if(bakedColors&&colors.length!==expectedVertices*3)throw new Error('Native RGB vertex count disagrees: '+colors.length+' / '+expectedVertices*3);
  const positions=new Float32Array(expectedVertices*3),normals=new Float32Array(expectedVertices*3),indices=new Uint32Array(rawTriangles*3);
  let x0=new Int32Array(n2).fill(-1),x1=new Int32Array(n2).fill(-1),y0=new Int32Array(n2).fill(-1),y1=new Int32Array(n2).fill(-1);
  const ze=new Int32Array(n2).fill(-1),edgeIndices=new Int32Array(12),cornerOffsets=CORNERS.map(c=>c[0]+n*(c[1]+n*c[2]));
  let vertexCount=0,indexCount=0,windingFlips=0,discardedDegenerate=0;
  function gradient(q,x,y,z){
    const xl=x>0?1:0,xr=x<cells?1:0,yl=y>0?1:0,yr=y<cells?1:0,zl=z>0?1:0,zr=z<cells?1:0;
    return [(field[q+xr]-field[q-xl])/((xl+xr)*spacing[0]),
      (field[q+yr*n]-field[q-yl*n])/((yl+yr)*spacing[1]),
      (field[q+zr*n2]-field[q-zl*n2])/((zl+zr)*spacing[2])];
  }
  function vertex(edge,q,x,y,z){
    let cache,key=x+n*y;
    if(edge===0)cache=x0;
    else if(edge===1){cache=y0;key++;}
    else if(edge===2){cache=x0;key+=n;}
    else if(edge===3)cache=y0;
    else if(edge===4)cache=x1;
    else if(edge===5){cache=y1;key++;}
    else if(edge===6){cache=x1;key+=n;}
    else if(edge===7)cache=y1;
    else {cache=ze;if(edge===9)key++;else if(edge===10)key+=n+1;else if(edge===11)key+=n;}
    if(cache[key]!==-1)return cache[key];
    const [ca,cb]=EDGE_CORNERS[edge],a=CORNERS[ca],b=CORNERS[cb],qa=q+cornerOffsets[ca],qb=q+cornerOffsets[cb];
    const va=field[qa]-iso,vb=field[qb]-iso,t=Math.max(0,Math.min(1,va/(va-vb)));
    const index=vertexCount++,p=index*3;
    positions[p]=origin[0]+offset[0]+(x+a[0]+(b[0]-a[0])*t)*spacing[0];
    positions[p+1]=origin[1]+offset[1]+(y+a[1]+(b[1]-a[1])*t)*spacing[1];
    positions[p+2]=origin[2]+offset[2]+(z+a[2]+(b[2]-a[2])*t)*spacing[2];
    const ga=gradient(qa,x+a[0],y+a[1],z+a[2]),gb=gradient(qb,x+b[0],y+b[1],z+b[2]);
    let nx=ga[0]+(gb[0]-ga[0])*t,ny=ga[1]+(gb[1]-ga[1])*t,nz=ga[2]+(gb[2]-ga[2])*t;
    let length=Math.hypot(nx,ny,nz);
    if(length<1e-12){const direction=vb>va?1:-1;nx=(b[0]-a[0])*direction;ny=(b[1]-a[1])*direction;nz=(b[2]-a[2])*direction;length=Math.hypot(nx,ny,nz);}
    normals[p]=nx/length;normals[p+1]=ny/length;normals[p+2]=nz/length;
    cache[key]=index;return index;
  }
  const areaEpsilon=Math.pow(Math.min(...spacing),4)*1e-16;
  const extractStarted=performance.now();
  let activeIndex=0;
  for(let z=0;z<cells;z++){
    x1.fill(-1);y1.fill(-1);ze.fill(-1);
    const nextPlane=(z+1)*n2;
    // Only cells whose actual sampled signs straddle the isovalue reach mesh
    // extraction. Their z/y/x visitation order remains exactly the old order.
    while(activeIndex<activeCells&&activeSamples[activeIndex]<nextPlane){
      const q=activeSamples[activeIndex],c=activeCases[activeIndex++],bits=edgeTable[c];
      const inPlane=q-z*n2,y=Math.floor(inPlane/n),x=inPlane-y*n;
      for(let e=0;e<12;e++)if(bits&(1<<e))edgeIndices[e]=vertex(e,q,x,y,z);
      const table=c*16;
      for(let i=0;i<16&&triTable[table+i]!==-1;i+=3){
        const a=edgeIndices[triTable[table+i]],b=edgeIndices[triTable[table+i+1]],cc=edgeIndices[triTable[table+i+2]],pa=a*3,pb=b*3,pc=cc*3;
        const ux=positions[pb]-positions[pa],uy=positions[pb+1]-positions[pa+1],uz=positions[pb+2]-positions[pa+2];
        const vx=positions[pc]-positions[pa],vy=positions[pc+1]-positions[pa+1],vz=positions[pc+2]-positions[pa+2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
        if(nx*nx+ny*ny+nz*nz<=areaEpsilon){discardedDegenerate++;continue;}
        const orientation=nx*(normals[pa]+normals[pb]+normals[pc])+ny*(normals[pa+1]+normals[pb+1]+normals[pc+1])+nz*(normals[pa+2]+normals[pb+2]+normals[pc+2]);
        indices[indexCount++]=a;
        if(orientation<0){indices[indexCount++]=cc;indices[indexCount++]=b;windingFlips++;}
        else {indices[indexCount++]=b;indices[indexCount++]=cc;}
      }
    }
    [x0,x1]=[x1,x0];[y0,y1]=[y1,y0];
  }
  phaseTimingsMilliseconds.extractSurface=performance.now()-extractStarted;
  if(vertexCount!==expectedVertices)throw new Error('SDF edge-cache accounting mismatch: '+vertexCount+' / '+expectedVertices);

  const finalIndices=indexCount===indices.length?indices:indices.slice(0,indexCount);
  const finalizeStarted=performance.now();
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3)for(let j=0;j<3;j++){low[j]=Math.min(low[j],positions[i+j]);high[j]=Math.max(high[j],positions[i+j]);}
  const stats={revision:MC_REVISION,experimental:true,artAccepted:false,externalAssets:0,resolution:n,origin,size,spacing,voxelCount:field.length,
    fieldRange:[minField,maxField],activeCells,vertices:vertexCount,triangles:indexCount/3,rawTriangles,discardedDegenerate,windingFlips,
    bounds:vertexCount?{min:low,max:high}:null,milliseconds:performance.now()-started,
    phaseTimingsMilliseconds:{...phaseTimingsMilliseconds,finalizeBounds:performance.now()-finalizeStarted},
    classifiedCells:cells*cells*cells,extractedCells:activeCells,edgeCapacityFromSampledCases:true,
    topology:'Exact M2 edge order, sign convention, gradient normals, winding and degenerate test',
    meshBytes:positions.byteLength+normals.byteLength+finalIndices.byteLength};
  return {meshData:{positions,normals,indices:finalIndices},stats};
}
