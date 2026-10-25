// Regularise the existing limb palette along the actual skin surface. This is
// a rest-space operation: no new triangles, bones, textures or per-frame work.
// Weld only coincident positions for the solve, leaving UV seams untouched.
const bytesOf = array => new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');

// Apply the exact precomputed result of prepareSurfaceSkin. The source palette
// fingerprint prevents silently applying weights to another rig revision.
export async function loadSurfaceSkin(THREE,object) {
  let mesh;object.traverse(node=>{if(!mesh&&node.isSkinnedMesh)mesh=node;});
  if(!mesh)throw new Error('Surface skin requires the cat body');
  const [metadataResponse,binaryResponse]=await Promise.all([
    fetch(new URL('./models/cat-v9-surface-skin.json',import.meta.url)),
    fetch(new URL('./models/cat-v9-surface-skin.bin',import.meta.url))
  ]);
  if(!metadataResponse.ok||!binaryResponse.ok)throw new Error('Cannot load the V9 surface palette');
  const [metadata,buffer]=await Promise.all([metadataResponse.json(),binaryResponse.arrayBuffer()]);
  const source=mesh.geometry,si=source.attributes.skinIndex,sw=source.attributes.skinWeight;
  if(source.attributes.position.count!==metadata.vertices||si.count!==metadata.vertices||sw.count!==metadata.vertices||si.itemSize!==4||sw.itemSize!==4)throw new Error('V9 surface vertex layout differs from the baked rig');
  if(JSON.stringify(mesh.skeleton.bones.map(b=>b.name))!==JSON.stringify(metadata.boneOrder))throw new Error('V9 surface bone order differs from the baked rig');
  const hashes=await Promise.all([sha256(bytesOf(sw.array)),sha256(bytesOf(si.array)),sha256(bytesOf(source.index.array)),sha256(new Uint8Array(buffer))]);
  if(hashes[0]!==metadata.input.skinWeightSHA256||hashes[1]!==metadata.input.skinIndexSHA256||hashes[2]!==metadata.input.triangleIndexSHA256||hashes[3]!==metadata.binarySHA256)throw new Error('V9 surface palette fingerprint mismatch');
  const view=new DataView(buffer),components=metadata.vertices*4,expectedBytes=16+components*6;
  if(buffer.byteLength!==expectedBytes||view.getUint32(0,true)!==0x31535343||view.getUint32(4,true)!==1||view.getUint32(8,true)!==metadata.vertices||view.getUint32(12,true)!==metadata.boneOrder.length)throw new Error('V9 surface palette binary layout mismatch');
  const indices=new Uint16Array(buffer,16,components),weights=new Float32Array(buffer,16+components*2,components);
  const outputHashes=await Promise.all([sha256(bytesOf(indices)),sha256(bytesOf(weights))]);
  if(outputHashes[0]!==metadata.output.skinIndexSHA256||outputHashes[1]!==metadata.output.skinWeightSHA256)throw new Error('V9 surface output fingerprint mismatch');
  for(let i=0;i<components;i+=4){let total=0;for(let s=0;s<4;s++){if(indices[i+s]>=metadata.boneOrder.length||!Number.isFinite(weights[i+s])||weights[i+s]<0)throw new Error('Invalid V9 surface palette entry');total+=weights[i+s];}if(Math.abs(total-1)>1e-6)throw new Error('V9 surface weights are not normalised');}
  const geometry=source.clone();geometry.attributes.skinIndex.array.set(indices);geometry.attributes.skinWeight.array.set(weights);geometry.attributes.skinIndex.needsUpdate=true;geometry.attributes.skinWeight.needsUpdate=true;mesh.geometry=geometry;
  let disposed=false;return {stats:{...metadata.stats,precomputed:true},geometry,dispose(){if(!disposed){geometry.dispose();disposed=true;}}};
}

export function prepareSurfaceSkin(THREE, object, options = {}) {
  let mesh;
  object.traverse(node => { if (!mesh && node.isSkinnedMesh) mesh = node; });
  if (!mesh) throw new Error('Surface skin requires the cat body');
  const geometry = mesh.geometry.clone();
  const p = geometry.attributes.position, si = geometry.attributes.skinIndex;
  const sw = geometry.attributes.skinWeight, index = geometry.index;
  const names = mesh.skeleton.bones.map(b => b.name), count = names.length;
  const vertices = [], groups = new Map(), map = new Uint32Array(p.count);
  const weldTolerance=options.weldTolerance??.000001;
  const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  for (let i=0;i<p.count;i++) {
    const xyz=[p.getX(i),p.getY(i),p.getZ(i)];
    const cell=xyz.map(v=>Math.floor(v/weldTolerance));
    const key=cell.join(',');
    let g;
    search:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const candidates=groups.get([cell[0]+dx,cell[1]+dy,cell[2]+dz].join(','));
      if(!candidates)continue;
      for(const candidate of candidates){if(Math.hypot(...xyz.map((v,j)=>v-vertices[candidate].xyz[j]))<=weldTolerance){g=candidate;break search;}}
    }
    if(g===undefined){g=vertices.length;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);vertices.push({xyz,ids:[],neighbors:new Map(),weights:new Float64Array(count)});}
    map[i]=g;const v=vertices[g];v.ids.push(i);
    for(let s=0;s<4;s++)v.weights[si.getComponent(i,s)]+=sw.getComponent(i,s);
  }
  for(const v of vertices)for(let b=0;b<count;b++)v.weights[b]/=v.ids.length;
  const edgeUses=new Map();let degenerateTriangles=0;
  for(let k=0;k<index.count;k+=3){
    const tri=[map[index.getX(k)],map[index.getX(k+1)],map[index.getX(k+2)]];
    if(new Set(tri).size<3){degenerateTriangles++;continue;}
    for(let s=0;s<3;s++){
      const a=tri[s],b=tri[(s+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
      edgeUses.set(key,(edgeUses.get(key)||0)+1);
      const av=vertices[a],bv=vertices[b],distance=Math.hypot(...av.xyz.map((v,j)=>v-bv.xyz[j]));
      // Bounded inverse-distance weights prevent a tiny scan triangle from
      // overpowering every other neighbour while respecting surface scale.
      const weight=1/Math.max(.002,distance);
      av.neighbors.set(b,weight);bv.neighbors.set(a,weight);
    }
  }
  const active=vertices.map(v=>{
    const [,y]=v.xyz;
    const protectedWeight=v.weights.reduce((sum,w,b)=>sum+(/^(head|neck|tail)/.test(names[b])?w:0),0);
    return protectedWeight>1e-6?0:smooth(.065,.105,y)*(1-smooth(.225,.265,y));
  });
  let current=vertices.map(v=>v.weights.slice());
  const iterations=options.iterations??48;
  for(let step=0;step<iterations;step++){
    const next=current.map(w=>w.slice());
    for(let i=0;i<vertices.length;i++){
      const envelope=active[i];if(envelope<=0)continue;
      const v=vertices[i],average=new Float64Array(count);let total=0;
      for(const [j,w] of v.neighbors){total+=w;for(let b=0;b<count;b++)average[b]+=current[j][b]*w;}
      if(!total)continue;
      for(let b=0;b<count;b++)next[i][b]=current[i][b]*(1-.65*envelope)+envelope*(.61*average[b]/total+.04*v.weights[b]);
    }
    current=next;
  }
  // Enforce a finite spatial gradient as well as a graph average. Uneven scan
  // triangles otherwise leave a 1 mm edge with a larger palette jump than a
  // neighbouring 1 cm edge, which is exactly the small fan/crease failure.
  const constraintEdges=[];
  for(let a=0;a<vertices.length;a++)for(const b of vertices[a].neighbors.keys())if(a<b&&(active[a]+active[b])>0){
    const distance=Math.hypot(...vertices[a].xyz.map((v,j)=>v-vertices[b].xyz[j]));
    constraintEdges.push([a,b,distance]);
  }
  for(let pass=0;pass<(options.gradientPasses??16);pass++)for(const [a,b,distance]of constraintEdges){
    const wa=current[a],wb=current[b],aa=active[a],ab=active[b];
    let difference=0;for(let k=0;k<count;k++)difference+=Math.abs(wa[k]-wb[k]);
    const allowed=distance*(options.maxGradient??32);
    if(difference<=allowed)continue;
    const amount=(1-allowed/difference)*.65;
    const ma=amount*aa/(aa+ab),mb=amount*ab/(aa+ab);
    for(let k=0;k<count;k++){const delta=(wa[k]-wb[k]);wa[k]-=delta*ma;wb[k]+=delta*mb;}
  }
  let changed=0,maxChange=0,protectedVertices=0;
  for(let i=0;i<vertices.length;i++){
    if(active[i]<=0){protectedVertices+=vertices[i].ids.length;continue;}
    const ordered=Array.from(current[i],(w,b)=>[b,w]).filter(([,w])=>w>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total=ordered.reduce((s,v)=>s+v[1],0);
    for(const [b,w]of ordered)maxChange=Math.max(maxChange,Math.abs(w/total-vertices[i].weights[b]));
    for(const id of vertices[i].ids){for(let s=0;s<4;s++){si.setComponent(id,s,ordered[s]?.[0]??0);sw.setComponent(id,s,(ordered[s]?.[1]??0)/total);}changed++;}
  }
  si.needsUpdate=true;sw.needsUpdate=true;mesh.geometry=geometry;
  const stats={method:'Welded-surface constrained skin diffusion with edge-gradient bounds',iterations,gradientPasses:options.gradientPasses??16,maxGradient:options.maxGradient??32,weldTolerance,vertices:p.count,weldedVertices:vertices.length,triangles:index.count/3,changedVertices:changed,protectedVertices,maxWeightChange:maxChange,topology:{boundaryEdges:[...edgeUses.values()].filter(n=>n===1).length,nonManifoldEdges:[...edgeUses.values()].filter(n=>n>2).length,degenerateTriangles}};
  let disposed=false;
  return {stats,geometry,dispose(){if(!disposed){geometry.dispose();disposed=true;}}};
}
