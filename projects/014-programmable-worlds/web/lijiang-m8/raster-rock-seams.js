// Close sub-voxel cracks between separately sampled, ellipse-clipped MC domains.
// This is a narrow skirt derived from the existing triangles, not another
// heightfield. Original vertex/index prefixes remain byte-for-byte unchanged.
const REVISION='native-rock-actual-ellipse-skirts-1';
const TAU=Math.PI*2;
const brand=a=>Object.prototype.toString.call(a);

function ellipse(input){
  const u=input?.uLiSdfEllipse?.value||input?.value;
  const m=input?.metadata||input;
  const v=u?[u.x,u.y,u.z,u.w]:Array.isArray(input)?input:[...(m?.centre||[]),...(m?.clipEllipse||m?.ellipse||[])];
  if(v.length!==4||!v.every(Number.isFinite)||v[2]<=0||v[3]<=0)throw Error('Invalid seam clip ellipse');
  const [x,z,rx,rz]=v;return {x,z,rx,rz,left:x-rx,right:x+rx,near:z-rz,far:z+rz};
}
const q=(e,x,z)=>((x-e.x)/e.rx)**2+((z-e.z)/e.rz)**2;
function append(a,tail,Type){const out=new Type(a.length+tail.length);out.set(a);out.set(tail,a.length);return out;}

/**
 * Call after conservative index culling and before createBakedSdfMesh.
 * exclusions accepts the same clipSpec/uniforms as cullNativeRockTriangles.
 * The returned triangles use the existing material's exact clipping and must
 * also be passed to navigation; do not render an un-clipped separate skirt.
 */
export function appendNativeRockSeams({meshData,metadata,exclusions=[],depth=2.5,minHeight=12}={}){
  const start=performance.now(),p=meshData?.positions,n=meshData?.normals,c=meshData?.colors,ix=meshData?.indices;
  if(brand(p)!=='[object Float32Array]'||p.length%3||brand(n)!=='[object Float32Array]'||n.length!==p.length)throw Error('Seam positions/normals must be matching Float32 xyz');
  if(c&&(brand(c)!=='[object Float32Array]'||c.length!==p.length))throw Error('Seam colors must match positions');
  if(!['[object Uint16Array]','[object Uint32Array]'].includes(brand(ix))||ix.length%3)throw Error('Seam indices must be unsigned triangles');
  if(!Number.isFinite(depth)||depth<=0||depth>3||!Number.isFinite(minHeight))throw Error('Seam depth must be in (0,3] metres');
  const own=ellipse(metadata),prior=exclusions.map(ellipse),boundaries=[{e:own,sign:-1},...prior.map(e=>({e,sign:1}))];
  const vertices=p.length/3,positions=[],normals=[],colors=[],indices=[];
  const stats={revision:REVISION,inputVertices:vertices,inputTriangles:ix.length/3,addedVertices:0,addedTriangles:0,boundarySegments:0,
    ownSegments:0,exclusionSegments:0,verticalTangencies:0,lowSegmentsSkipped:0,hiddenSegmentsSkipped:0,
    depthMetres:depth,maximumHorizontalOffsetMetres:0,maximumExtrusionMetres:0,maximumBoundaryResidual:0,maximumBarycentricOutside:0,
    originalBuffersPreserved:true,intersectionSource:'actual indexed MC triangles / analytic ellipse edge intersections',minHeight};
  // Sub-metre chords keep the ellipse sagitta below 0.2mm at current domain
  // radii. A 1mm visible-side inset exceeds sagitta and Float32 roundoff; it
  // avoids leaving a centimetre-wide empty channel between the two skirts.
  const chord=.5,inset=.001,bottomInset=.002,areaEpsilon=1e-14;
  const visible=(x,z)=>q(own,x,z)<=1+1e-9&&prior.every(e=>q(e,x,z)>1);
  function vertex(point,weights,ids,e,sign,bottom){
    const outside=Math.max(0,...weights.map(w=>Math.max(-w,w-1)));
    if(outside>1e-4)throw Error('Seam endpoint left its source MC triangle');
    stats.maximumBarycentricOutside=Math.max(stats.maximumBarycentricOutside,outside);
    let gx=(point[0]-e.x)/(e.rx*e.rx),gz=(point[2]-e.z)/(e.rz*e.rz),gl=Math.hypot(gx,gz);gx/=gl;gz/=gl;
    const d=bottom?bottomInset:inset,x=point[0]+sign*gx*d,y=point[1]-(bottom?depth:0),z=point[2]+sign*gz*d;
    positions.push(x,y,z);let nx=0,ny=0,nz=0,cr=0,cg=0,cb=0;
    for(let j=0;j<3;j++){const k=ids[j]*3,w=weights[j];nx+=n[k]*w;ny+=n[k+1]*w;nz+=n[k+2]*w;if(c){cr+=c[k]*w;cg+=c[k+1]*w;cb+=c[k+2]*w;}}
    const nl=Math.hypot(nx,ny,nz)||1;normals.push(nx/nl,ny/nl,nz/nl);if(c)colors.push(Math.max(0,cr),Math.max(0,cg),Math.max(0,cb));
    stats.maximumHorizontalOffsetMetres=Math.max(stats.maximumHorizontalOffsetMetres,d);
    stats.maximumExtrusionMetres=Math.max(stats.maximumExtrusionMetres,Math.hypot(d,bottom?depth:0));
    stats.maximumBoundaryResidual=Math.max(stats.maximumBoundaryResidual,Math.abs(q(e,point[0],point[2])-1));
  }
  function segment(a,b,wa,wb,ids,e,sign,boundaryIndex){
    if(Math.min(a[1],b[1])<minHeight){stats.lowSegmentsSkipped++;return;}
    const mx=(a[0]+b[0])*.5,mz=(a[2]+b[2])*.5;
    let gx=(mx-e.x)/(e.rx*e.rx),gz=(mz-e.z)/(e.rz*e.rz),gl=Math.hypot(gx,gz);gx/=gl;gz/=gl;
    if(!visible(mx+sign*gx*inset,mz+sign*gz*inset)){stats.hiddenSegmentsSkipped++;return;}
    // A cylinder tangent to a vertical triangle has a vertical intersection;
    // a downward skirt there has no area and cannot close a geometric gap.
    const horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);
    if(horizontal<1e-6){stats.verticalTangencies++;return;}
    const k=vertices+positions.length/3;
    vertex(a,wa,ids,e,sign,false);vertex(b,wb,ids,e,sign,false);vertex(a,wa,ids,e,sign,true);vertex(b,wb,ids,e,sign,true);
    // Both render and navigation use DoubleSide. Preserve a consistent winding
    // relative to interpolated SDF gradients for downstream triangle queries.
    const o=(k-vertices)*3,ux=positions[o+3]-positions[o],uy=positions[o+4]-positions[o+1],uz=positions[o+5]-positions[o+2],vx=positions[o+6]-positions[o],vy=positions[o+7]-positions[o+1],vz=positions[o+8]-positions[o+2];
    const dot=(uy*vz-uz*vy)*normals[o]+(uz*vx-ux*vz)*normals[o+1]+(ux*vy-uy*vx)*normals[o+2];
    if(dot<0)indices.push(k,k+2,k+1,k+1,k+2,k+3);else indices.push(k,k+1,k+2,k+1,k+3,k+2);
    stats.boundarySegments++;if(boundaryIndex===0)stats.ownSegments++;else stats.exclusionSegments++;
  }
  for(let i=0;i<ix.length;i+=3){
    const ids=[ix[i],ix[i+1],ix[i+2]];
    if(ids.some(v=>v>=vertices))throw Error('Seam index out of range');
    const a=ids.map(id=>[p[id*3],p[id*3+1],p[id*3+2]]);
    if(a.some(v=>!v.every(Number.isFinite)))throw Error('Nonfinite seam source position');
    if(Math.max(a[0][1],a[1][1],a[2][1])<minHeight)continue;
    const minX=Math.min(...a.map(v=>v[0])),maxX=Math.max(...a.map(v=>v[0])),minZ=Math.min(...a.map(v=>v[2])),maxZ=Math.max(...a.map(v=>v[2]));
    const ux=a[1][0]-a[0][0],uz=a[1][2]-a[0][2],vx=a[2][0]-a[0][0],vz=a[2][2]-a[0][2],det=ux*vz-uz*vx;
    // A vertical projection cannot provide a finite height-vs-angle curve.
    // Its cylinder intersections are vertical lines (zero skirt area).
    if(Math.abs(det)<areaEpsilon)continue;
    function sample(e,t){
      const x=e.x+e.rx*Math.cos(t),z=e.z+e.rz*Math.sin(t),dx=x-a[0][0],dz=z-a[0][2];
      const w1=(dx*vz-dz*vx)/det,w2=(ux*dz-uz*dx)/det,w0=1-w1-w2;
      return {point:[x,w0*a[0][1]+w1*a[1][1]+w2*a[2][1],z],weights:[w0,w1,w2]};
    }
    for(let bi=0;bi<boundaries.length;bi++){
      const {e,sign}=boundaries[bi];
      if(minX>e.right||maxX<e.left||minZ>e.far||maxZ<e.near)continue;
      const loX=(minX-e.x)/e.rx,hiX=(maxX-e.x)/e.rx,loZ=(minZ-e.z)/e.rz,hiZ=(maxZ-e.z)/e.rz;
      const nearestX=loX>0?loX:hiX<0?-hiX:0,nearestZ=loZ>0?loZ:hiZ<0?-hiZ:0;
      if(nearestX*nearestX+nearestZ*nearestZ>1+1e-9||Math.max(loX*loX,hiX*hiX)+Math.max(loZ*loZ,hiZ*hiZ)<1-1e-9)continue;
      const hits=[];
      for(let edge=0;edge<3;edge++){
        const v=a[edge],w=a[(edge+1)%3],x=(v[0]-e.x)/e.rx,z=(v[2]-e.z)/e.rz,dx=(w[0]-v[0])/e.rx,dz=(w[2]-v[2])/e.rz;
        const aa=dx*dx+dz*dz,bb=2*(x*dx+z*dz),cc=x*x+z*z-1,disc=bb*bb-4*aa*cc;
        if(aa<1e-25||disc<0)continue;
        const root=Math.sqrt(Math.max(0,disc));
        for(const t of [(-bb-root)/(2*aa),(-bb+root)/(2*aa)])if(t>=-1e-9&&t<=1+1e-9){
          let theta=Math.atan2(z+dz*t,x+dx*t);if(theta<0)theta+=TAU;
          if(!hits.some(h=>Math.abs(h-theta)<1e-10||Math.abs(Math.abs(h-theta)-TAU)<1e-10))hits.push(theta);
        }
      }
      if(hits.length<2)continue;hits.sort((a,b)=>a-b);
      for(let h=0;h<hits.length;h++){
        const from=hits[h],to=h+1<hits.length?hits[h+1]:hits[0]+TAU,mid=sample(e,(from+to)*.5);
        if(mid.weights.some(w=>w< -1e-7||w>1+1e-7))continue;
        const localChord=Math.min(chord,Math.sqrt(4*Math.min(e.rx,e.rz)*inset));
        const steps=Math.max(1,Math.ceil((to-from)*Math.max(e.rx,e.rz)/localChord));
        for(let s=0;s<steps;s++){
          const v=sample(e,from+(to-from)*s/steps),w=sample(e,from+(to-from)*(s+1)/steps);
          segment(v.point,w.point,v.weights,w.weights,ids,e,sign,bi);
        }
      }
    }
  }
  stats.addedVertices=positions.length/3;stats.addedTriangles=indices.length/3;stats.milliseconds=performance.now()-start;
  if(!positions.length)return {meshData,stats};
  for(const a of [positions,normals,colors])if(a.some(v=>!Number.isFinite(v)))throw Error('Nonfinite generated seam attribute');
  return {meshData:{...meshData,positions:append(p,positions,Float32Array),normals:append(n,normals,Float32Array),
    ...(c?{colors:append(c,colors,Float32Array)}:{}),indices:append(ix,indices,Uint32Array)},stats};
}
