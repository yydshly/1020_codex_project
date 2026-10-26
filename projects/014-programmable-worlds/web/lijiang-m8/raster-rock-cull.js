// Conservative CPU removal of hidden triangles and small disconnected rock
// fragments.  Vertex/normal/color views are returned unchanged for SHA binding.
const REVISION='native-rock-conservative-index-cull-1';
const CLIP_MARGIN=1e-5; // retain the float-uniform rounding band for shader clipping
const brand=value=>Object.prototype.toString.call(value);

function ellipse(input){
  const value=input?.uLiSdfEllipse?.value||input?.value;
  if(value)return checked(value.x,value.y,value.z,value.w);
  const source=input?.metadata||input,c=source?.centre,a=source?.clipEllipse||source?.ellipse;
  if(c&&a)return checked(c[0],c[1],a[0],a[1]);
  if(Array.isArray(input)&&input.length===4)return checked(...input);
  throw new Error('Rock culling needs centre/clipEllipse metadata or a pilot uniform');
}
function checked(x,z,rx,rz){
  if(![x,z,rx,rz].every(Number.isFinite)||rx<=0||rz<=0)throw new Error('Invalid rock culling ellipse');
  return {x,z,rx,rz,ix:1/rx,iz:1/rz,left:x-rx,right:x+rx,near:z-rz,far:z+rz};
}

export function cullNativeRockTriangles({meshData,metadata,exclusions=[]}={}){
  const started=performance.now(),p=meshData?.positions,ix=meshData?.indices;
  if(!ArrayBuffer.isView(p)||brand(p)!=='[object Float32Array]'||p.length%3)throw new Error('Rock positions must be Float32 xyz');
  if(!ArrayBuffer.isView(ix)||!['[object Uint32Array]','[object Uint16Array]'].includes(brand(ix))||ix.length%3)throw new Error('Rock indices must be unsigned triangles');
  const vertices=p.length/3,rawTriangles=ix.length/3,own=ellipse(metadata),previous=exclusions.map(ellipse);
  const minimum=Number(metadata?.minimumComponentVertices??metadata?.minComponentVertices??64);
  if(!Number.isInteger(minimum)||minimum<1)throw new Error('Invalid minimum component size');
  const parent=new Uint32Array(vertices),size=new Uint32Array(vertices).fill(1),used=new Uint8Array(vertices);
  for(let i=0;i<vertices;i++)parent[i]=i;
  function find(a){let root=a;while(parent[root]!==root)root=parent[root];while(parent[a]!==a){const next=parent[a];parent[a]=root;a=next;}return root;}
  function unite(a,b){a=find(a);b=find(b);if(a===b)return;if(size[a]<size[b])[a,b]=[b,a];parent[b]=a;size[a]+=size[b];}
  for(let i=0;i<ix.length;i+=3){
    const a=ix[i],b=ix[i+1],c=ix[i+2];if(a>=vertices||b>=vertices||c>=vertices)throw new Error('Rock triangle index out of range');
    used[a]=used[b]=used[c]=1;unite(a,b);unite(a,c);
  }
  let components=0,componentsRemoved=0,componentVerticesRemoved=0,referencedVertices=0;
  const small=new Uint8Array(vertices),largest=[];
  for(let i=0;i<vertices;i++)if(used[i]){
    const j=i*3;if(!Number.isFinite(p[j])||!Number.isFinite(p[j+1])||!Number.isFinite(p[j+2]))throw new Error('Nonfinite referenced rock position');
    referencedVertices++;const root=find(i);
    if(root!==i)continue;components++;largest.push(size[root]);
    if(size[root]<minimum){small[root]=1;componentsRemoved++;componentVerticesRemoved+=size[root];}
  }
  largest.sort((a,b)=>b-a);
  const out=new Uint32Array(ix.length);
  let kept=0,componentTrianglesRemoved=0,underwaterTrianglesRemoved=0,outsideOwnTrianglesRemoved=0,excludedPriorTrianglesRemoved=0;
  for(let i=0;i<ix.length;i+=3){
    const a=ix[i],b=ix[i+1],c=ix[i+2];
    if(small[find(a)]){componentTrianglesRemoved++;continue;}
    const pa=a*3,pb=b*3,pc=c*3,ax=p[pa],ay=p[pa+1],az=p[pa+2],bx=p[pb],by=p[pb+1],bz=p[pb+2],cx=p[pc],cy=p[pc+1],cz=p[pc+2];
    if(ay<-.10&&by<-.10&&cy<-.10){underwaterTrianglesRemoved++;continue;}
    const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx),minZ=Math.min(az,bz,cz),maxZ=Math.max(az,bz,cz);
    const loX=(minX-own.x)*own.ix,hiX=(maxX-own.x)*own.ix,loZ=(minZ-own.z)*own.iz,hiZ=(maxZ-own.z)*own.iz;
    const nearestX=loX>0?loX:hiX<0?-hiX:0,nearestZ=loZ>0?loZ:hiZ<0?-hiZ:0;
    // A triangle is contained by its normalized axis-aligned bbox.  Only a box
    // wholly disjoint from the disk can safely be dropped without shader clip.
    if(nearestX*nearestX+nearestZ*nearestZ>1+CLIP_MARGIN){outsideOwnTrianglesRemoved++;continue;}
    let excluded=false;
    for(const e of previous){
      if(minX>e.right||maxX<e.left||minZ>e.far||maxZ<e.near)continue;
      const x0=(ax-e.x)*e.ix,z0=(az-e.z)*e.iz;
      if(x0*x0+z0*z0>1-CLIP_MARGIN)continue;
      const x1=(bx-e.x)*e.ix,z1=(bz-e.z)*e.iz;
      if(x1*x1+z1*z1>1-CLIP_MARGIN)continue;
      const x2=(cx-e.x)*e.ix,z2=(cz-e.z)*e.iz;
      // Ellipses are convex: three contained vertices imply a fully contained
      // triangle.  Boundary-crossing triangles remain for exact fragment clip.
      if(x2*x2+z2*z2<=1-CLIP_MARGIN){excluded=true;break;}
    }
    if(excluded){excludedPriorTrianglesRemoved++;continue;}
    out[kept++]=a;out[kept++]=b;out[kept++]=c;
  }
  const retained=kept===out.length?out:out.slice(0,kept),stats={revision:REVISION,rawTriangles,retainedTriangles:kept/3,removedTriangles:rawTriangles-kept/3,
    vertices,referencedVertices,unreferencedVertices:vertices-referencedVertices,minimumComponentVertices:minimum,
    components,componentsRemoved,componentVerticesRemoved,componentTrianglesRemoved,underwaterTrianglesRemoved,outsideOwnTrianglesRemoved,excludedPriorTrianglesRemoved,
    priorEllipses:previous.length,clipNumericalMargin:CLIP_MARGIN,largestComponentVertexCounts:largest.slice(0,8),vertexBuffersUnchanged:true,
    milliseconds:performance.now()-started};
  return {meshData:{...meshData,indices:retained},stats};
}
