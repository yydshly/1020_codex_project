import { habitatNoise, TREE_FAMILIES } from './raster-habitat.js?v=20261026-m8';
import { mountainSurfacePatch, mountainLegacySurfacePatch } from './mountain-surface-habitat.js?v=20261026-m8';

const REVISION='m5-retained-cohorts-supported-contact-understory-5';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function hash(x,y,z=0){let h=Math.imul(Math.floor(x*17),374761393)^Math.imul(Math.floor(y*19),668265263)^Math.imul(Math.floor(z*23),2147483647);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
const xyKey=(x,z,size)=>Math.floor(x/size)+','+Math.floor(z/size);

/** Re-anchor mountain seeds to existing, visible SDF triangles. This owns no
 * renderer or GPU resources. Each peak's index is scanned once; its temporary
 * support lookup is released before the next peak. Lowland records are kept.
 */
export function prepareMountainPopulation({THREE,pilots=[],terrain,trees=[],bushes=[],peaks}={}){
  if(!THREE?.Matrix4||!terrain?.sampleVegetation)throw new Error('Mountain ecology requires actual SDF pilots and vegetation fields');
  const began=performance.now(),outTrees=[],outBushes=[],anchors=[],contacts=[],perPeak=[],siteCache=new Map();
  const stats={revision:REVISION,externalAssets:0,peakCount:pilots.length,scannedTriangles:0,indexedTriangles:0,faceWindingCorrections:0,
    nativeMountainSeeds:0,nativeAnchored:0,supplemented:0,microHabitatOverrides:0,cliffScrub:0,rejectedSupport:0,rejectedSteep:0,
    contactRoots:0,contactPaths:0,contactPoints:0,contactPatches:0,contactMossSamples:0,connectedSeeds:0,rejectedClip:0,trees:0,bushes:0,retainedLowlandTrees:0,retainedLowlandBushes:0,perPeak,milliseconds:0,
    anchorMethod:'Exact visible SDF triangle barycentrics and outward face normal; three/four-point woody root footprint support independent of branching crown; no H root resampling',
    distribution:'Broad connected shoulder/drainage ribbons grown from distributed surface seeds, with feathered shrub edges and fewer isolated cliff curtains; surface-following roots/vines connect foliage to actual stone'};
  const clips=pilots.map(p=>p.clipSpec||p.stats?.clipping),peakBins=new Map(),native=pilots.map(()=>({trees:[],bushes:[]}));
  function visible(index,x,z){
    const c=clips[index];if(!c?.centre||!c?.ellipse)return true;
    if(((x-c.centre[0])/c.ellipse[0])**2+((z-c.centre[1])/c.ellipse[1])**2>=.995)return false;
    for(const e of c.exclusions||[]){const a=Array.isArray(e)?e:[e.centre?.[0],e.centre?.[1],e.ellipse?.[0],e.ellipse?.[1]];
      if(((x-a[0])/a[2])**2+((z-a[1])/a[3])**2<=1.002)return false;}
    return true;
  }
  for(let i=0;i<clips.length;i++){
    const c=clips[i];if(!c?.centre||!c?.ellipse)continue;
    for(let z=Math.floor((c.centre[1]-c.ellipse[1])/256);z<=Math.floor((c.centre[1]+c.ellipse[1])/256);z++)
      for(let x=Math.floor((c.centre[0]-c.ellipse[0])/256);x<=Math.floor((c.centre[0]+c.ellipse[0])/256);x++){
        const k=x+','+z;if(!peakBins.has(k))peakBins.set(k,[]);peakBins.get(k).push(i);
      }
  }
  for(const [records,bush]of [[trees,false],[bushes,true]])for(const p of records){
    const x=Array.isArray(p)?p[0]:p.x,y=Array.isArray(p)?p[1]:p.y,z=Array.isArray(p)?p[2]:p.z;
    // H is used only to classify an existing seed. It never supplies an SDF
    // root height, support normal, relocation or generated mountain anchor.
    let owner=-1;if(y>14)for(const i of peakBins.get(xyKey(x,z,256))||[])if(visible(i,x,z)){owner=i;break;}
    if(owner>=0){native[owner][bush?'bushes':'trees'].push(p);stats.nativeMountainSeeds++;}
    else{(bush?outBushes:outTrees).push(p);stats[bush?'retainedLowlandBushes':'retainedLowlandTrees']++;}
  }
  function siteAt(x,y,z){
    const k=xyKey(x,z,6);let s=siteCache.get(k);
    if(!s){const v=terrain.sampleVegetation(x,z),a=terrain.sampleAttributes?.(x,z)||[.8,0,0,0],cover=clamp(v?.[0]||0);
      s={cover,forest:cover>.0001?clamp((v?.[3]||0)/cover):0,moisture:clamp(.25+.50*(a[3]||0)+.25*(1-(a[0]??.8)))};siteCache.set(k,s);}
    // This 3D field creates connected pockets across shelves and gullies.
    // It cannot paint a constant-height green ring around a peak.
    const patch=mountainSurfacePatch(x,y,z);
    return {...s,patch};
  }
  for(let peakIndex=0;peakIndex<pilots.length;peakIndex++){
    const peakBegan=performance.now(),pilot=pilots[peakIndex],g=pilot.mesh?.geometry,p=g?.attributes?.position,normals=g?.attributes?.normal,index=g?.index?.array;
    const summary={peakIndex,nativeSeeds:native[peakIndex].trees.length+native[peakIndex].bushes.length,scannedTriangles:0,indexedTriangles:0,
      supportCells:0,faceWindingCorrections:0,trees:0,bushes:0,uprightBushes:0,cliffScrub:0,nativeAnchored:0,supplemented:0,microHabitatOverrides:0,upperQuarter:0,upperHalf:0,
      normalYRange:[1,0],heightRange:[Infinity,-Infinity],families:[0,0,0,0]};perPeak.push(summary);
    if(!p||!index||!normals){summary.reason='No indexed SDF surface with outward gradient normals';continue;}
    pilot.mesh.updateWorldMatrix(true,false);const matrix=pilot.mesh.matrixWorld,e=matrix.elements,identity=matrix.equals(new THREE.Matrix4());
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix).elements;
    const a=[0,0,0],b=[0,0,0],c=[0,0,0],triBins=new Map(),cells=new Map(),occupied=new Map(),binSize=8,cellSize=4;
    // Root footprint tests revisit the same faces many times. Retain their
    // double-precision normal and XZ barycentric terms only for this peak.
    // Terms use the original subtraction/multiplication order; query results
    // and ties remain identical to recomputing each face for every root.
    let faceQueries=new Float64Array(index.length/3*13);
    if(!g.boundingBox)g.computeBoundingBox();const worldBounds=g.boundingBox?.clone().applyMatrix4(matrix);
    const maxY=worldBounds?.max?.y??pilot.stats?.bounds?.max?.[1]??400,minY=worldBounds?.min?.y??0;
    function vertex(i,out){const j=i*p.itemSize,x=p.array[j],y=p.array[j+1],z=p.array[j+2];
      if(identity){out[0]=x;out[1]=y;out[2]=z;}else{out[0]=e[0]*x+e[4]*y+e[8]*z+e[12];out[1]=e[1]*x+e[5]*y+e[9]*z+e[13];out[2]=e[2]*x+e[6]*y+e[10]*z+e[14];}return out;}
    function face(offset,recordCorrection=false){vertex(index[offset],a);vertex(index[offset+1],b);vertex(index[offset+2],c);
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz);
      const ia=index[offset]*normals.itemSize,ib=index[offset+1]*normals.itemSize,ic=index[offset+2]*normals.itemSize,data=normals.array;
      let gx=data[ia]+data[ib]+data[ic],gy=data[ia+1]+data[ib+1]+data[ic+1],gz=data[ia+2]+data[ib+2]+data[ic+2];
      if(!identity){const x=gx,y=gy,z=gz;gx=normalMatrix[0]*x+normalMatrix[3]*y+normalMatrix[6]*z;gy=normalMatrix[1]*x+normalMatrix[4]*y+normalMatrix[7]*z;gz=normalMatrix[2]*x+normalMatrix[5]*y+normalMatrix[8]*z;}
      // DoubleSide rendering can conceal MC index winding. Surface ecology
      // always uses the saved signed-field gradient as its outward reference.
      if(nx*gx+ny*gy+nz*gz<0){nx=-nx;ny=-ny;nz=-nz;if(recordCorrection)summary.faceWindingCorrections++;}
      return length>1e-9?[nx/length,ny/length,nz/length]:null;}
    for(let offset=0;offset<index.length;offset+=3){
      summary.scannedTriangles++;const n=face(offset,true);if(!n||n[1]<.08)continue;
      const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3,z=(a[2]+b[2]+c[2])/3;
      if(y<Math.max(12,minY+5))continue;if(!visible(peakIndex,x,z)){stats.rejectedClip++;continue;}
      summary.indexedTriangles++;
      const q=offset/3*13;
      faceQueries[q]=n[0];faceQueries[q+1]=n[1];faceQueries[q+2]=n[2];
      faceQueries[q+3]=b[2]-c[2];faceQueries[q+4]=c[0]-b[0];
      faceQueries[q+5]=c[2]-a[2];faceQueries[q+6]=a[0]-c[0];
      faceQueries[q+7]=c[0];faceQueries[q+8]=c[2];
      faceQueries[q+9]=a[1];faceQueries[q+10]=b[1];faceQueries[q+11]=c[1];
      faceQueries[q+12]=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      for(let iz=Math.floor(Math.min(a[2],b[2],c[2])/binSize);iz<=Math.floor(Math.max(a[2],b[2],c[2])/binSize);iz++)
        for(let ix=Math.floor(Math.min(a[0],b[0],c[0])/binSize);ix<=Math.floor(Math.max(a[0],b[0],c[0])/binSize);ix++){
          const key=ix+','+iz;if(!triBins.has(key))triBins.set(key,[]);triBins.get(key).push(offset);}
      const key=Math.floor(x/cellSize)+','+Math.floor(y/cellSize)+','+Math.floor(z/cellSize),score=n[1]*.50+hash(x,y,z)*.50;
      if(!cells.has(key)||score>cells.get(key).score)cells.set(key,{x,y,z,n,offset,weights:[1/3,1/3,1/3],score});
    }
    summary.supportCells=cells.size;stats.scannedTriangles+=summary.scannedTriangles;stats.indexedTriangles+=summary.indexedTriangles;stats.faceWindingCorrections+=summary.faceWindingCorrections;
    function query(x,z,referenceY,minNormal=.18,maxHeightDifference=60){
      if(!visible(peakIndex,x,z))return null;let best=null,cost=Infinity;
      for(const offset of triBins.get(xyKey(x,z,binSize))||[]){
        const q=offset/3*13;if(faceQueries[q+1]<minNormal)continue;
        const d=faceQueries[q+12];if(Math.abs(d)<1e-9)continue;
        const wa=(faceQueries[q+3]*(x-faceQueries[q+7])+faceQueries[q+4]*(z-faceQueries[q+8]))/d,
          wb=(faceQueries[q+5]*(x-faceQueries[q+7])+faceQueries[q+6]*(z-faceQueries[q+8]))/d,wc=1-wa-wb;
        if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
        const y=wa*faceQueries[q+9]+wb*faceQueries[q+10]+wc*faceQueries[q+11],dy=Math.abs(y-referenceY);if(dy>maxHeightDifference||dy>=cost)continue;
        cost=dy;best={x,y,z,n:[faceQueries[q],faceQueries[q+1],faceQueries[q+2]],offset,weights:[wa,wb,wc]};
      }return best;
    }
    function support(root,radius,bush,cliffScrub=false){
      if(cliffScrub){
        const n=root.n,horizontal=Math.hypot(n[0],n[2]);if(horizontal<.01)return {accepted:0,span:Infinity,valid:false};
        const u=[-n[2]/horizontal,0,n[0]/horizontal],v=[n[1]*u[2],n[2]*u[0]-n[0]*u[2],-n[1]*u[0]],reach=clamp(radius*.065,.15,.26);
        let accepted=0,min=Infinity,max=-Infinity;
        // A creeper roots into a small actual cliff fissure, measured in the
        // surface tangent plane. A horizontal crown-sized disk is unrelated
        // to this clinging, non-adult growth habit.
        for(const [axis,sign]of [[u,1],[u,-1],[v,1],[v,-1]]){
          const x=root.x+axis[0]*reach*sign,y=root.y+axis[1]*reach*sign,z=root.z+axis[2]*reach*sign;
          const q=query(x,z,y,.08,.42);if(!q||q.n[0]*n[0]+q.n[1]*n[1]+q.n[2]*n[2]<.60)continue;
          accepted++;min=Math.min(min,q.y);max=Math.max(max,q.y);
        }
        return {accepted,reach,span:accepted?max-min:Infinity,valid:accepted>=3&&max-min<1.2,tangent:true};
      }
      // A crown spreads beyond its anchoring fissure. Testing a crown-sized root
      // disk wrongly eliminated almost every adult on a karst shoulder.
      const reach=bush?clamp(radius*.09,.18,.42):clamp(radius*.16,.60,1.10),threshold=bush?.18:.45;let accepted=0,min=Infinity,max=-Infinity;
      for(const [dx,dz]of [[reach,0],[-reach,0],[0,reach],[0,-reach]]){
        const expected=root.y-(root.n[0]*dx+root.n[2]*dz)/Math.max(.18,root.n[1]);
        const q=query(root.x+dx,root.z+dz,expected,threshold,Math.max(.8,radius*.55));
        if(!q||q.n[0]*root.n[0]+q.n[1]*root.n[1]+q.n[2]*root.n[2]<.35)continue;
        accepted++;min=Math.min(min,q.y);max=Math.max(max,q.y);
      }
      return {accepted,reach,span:accepted?max-min:Infinity,valid:accepted>=3&&max-min<(bush?2.1:2.0)};
    }
    function closeToPlant(root,radius,bush){
      const ix=Math.floor(root.x/8),iy=Math.floor(root.y/8),iz=Math.floor(root.z/8);
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const q of occupied.get((ix+dx)+','+(iy+dy)+','+(iz+dz))||[]){
        const clearance=(bush&&q.bush?.32:.46)*(radius+q.radius)+.40;
        if((q.x-root.x)**2+(q.y-root.y)**2+(q.z-root.z)**2<clearance*clearance)return true;
      }return false;
    }
    function makeContact(record,root){
      const n=root.n,seed=record.seed,cliff=record.cliffScrub,paths=[],supports=[];
      const horizontal=Math.hypot(n[0],n[2]);
      const u=horizontal>.001?[-n[2]/horizontal,0,n[0]/horizontal]:[1,0,0];
      const down=[n[0]*n[1],-1+n[1]*n[1],n[2]*n[1]];
      const dl=Math.hypot(...down);if(dl>.001)for(let j=0;j<3;j++)down[j]/=dl;else{down[0]=0;down[1]=0;down[2]=1;}
      const rootRadius=clamp(record.radius*(record.bush?.014:.024),record.bush?.018:.040,record.bush?.045:.11);
      const count=record.bush?1:2;
      for(let branch=0;branch<count;branch++){
        const path=[root.x,root.y,root.z,...n,rootRadius],pathSupports=[root.offset],steps=cliff?6:record.bush?3:4;
        let q=root;const sign=branch===0?0:branch%2?-1:1;
        for(let k=1;k<=steps;k++){
          const spread=(cliff?.24:.55)*sign+.16*Math.sin(k*.71+seed*11);
          const nx=q.n[0],ny=q.n[1],nz=q.n[2],h=Math.hypot(nx,nz);
          const lateral=h>.001?[-nz/h,0,nx/h]:u;
          let direction=[nx*ny+lateral[0]*spread,-1+ny*ny,nz*ny+lateral[2]*spread];
          if(ny>.92){const angle=seed*6.28+branch*2.39996;direction=[Math.cos(angle),0,Math.sin(angle)];}
          const dot=direction[0]*nx+direction[1]*ny+direction[2]*nz;
          direction=[direction[0]-nx*dot,direction[1]-ny*dot,direction[2]-nz*dot];
          const length=Math.hypot(...direction);if(length<.001)break;
          const step=cliff?.27:record.bush?.18:.22;
          const wanted=[q.x+direction[0]/length*step,q.y+direction[1]/length*step,q.z+direction[2]/length*step];
          const next=query(wanted[0],wanted[2],wanted[1],.08,.40);
          if(!next||next.n[0]*q.n[0]+next.n[1]*q.n[1]+next.n[2]*q.n[2]<.35||Math.hypot(next.x-q.x,next.y-q.y,next.z-q.z)>step*1.8)break;
          path.push(next.x,next.y,next.z,...next.n,rootRadius*Math.pow(1-k/(steps+1),1.3));pathSupports.push(next.offset);q=next;
        }
        if(path.length>=14){paths.push(Float32Array.from(path));supports.push(Int32Array.from(pathSupports));stats.contactPaths++;stats.contactPoints+=path.length/7;}
      }
      // Small detached tufts, never an opaque soil fan. Their bases must be
      // resampled on the same visible SDF triangles as the woody root. A
      // lopsided, feathered footprint bridges the root into bare rock without
      // making a uniformly green disc or changing any plant distribution.
      // Layout: xyz, outward normal xyz, tuft strength (7 floats per sample).
      const moss=[root.x,root.y,root.z,...n,1],mossSupports=[root.offset];
      const reach=clamp(record.radius*(record.bush?.15:.105),.25,.56);
      for(let k=0;k<12;k++){
        const angle=hash(seed*41,k+19,7)*Math.PI*2;
        const radial=reach*(.18+.82*Math.pow(hash(seed*29,k+5,31),.72));
        const sideways=Math.cos(angle)*radial*(.65+.20*seed),downslope=Math.sin(angle)*radial+reach*.13;
        const wanted=[root.x+u[0]*sideways+down[0]*downslope,root.y+u[1]*sideways+down[1]*downslope,root.z+u[2]*sideways+down[2]*downslope];
        const sample=query(wanted[0],wanted[2],wanted[1],.08,.18);
        if(!sample||sample.n[0]*n[0]+sample.n[1]*n[1]+sample.n[2]*n[2]<.70||Math.hypot(sample.x-root.x,sample.y-root.y,sample.z-root.z)>reach*1.3)continue;
        const strength=clamp(1-radial/reach*.72,.22,1);
        moss.push(sample.x,sample.y,sample.z,...sample.n,strength);mossSupports.push(sample.offset);
      }
      const patch=[],patchSupports=[];
      contacts.push({root:[root.x,root.y,root.z],normal:n.slice(),embedded:[record.x,record.y,record.z],radius:rootRadius,
        peakIndex,seed,bush:record.bush,cliffScrub:cliff,paths,supports,patch:Float32Array.from(patch),patchSupports:Int32Array.from(patchSupports),
        moss:Float32Array.from(moss),mossSupports:Int32Array.from(mossSupports)});
      stats.contactRoots++;stats.contactMossSamples+=moss.length/7;
    }
    const treeCap=peakIndex===0?680:420,bushCap=peakIndex===0?1500:880,cliffCap=peakIndex===0?1000:520;
    let phaseCaps=null;
    function plant(root,bush,source=null,relictPocket=false){
      const cliffScrub=bush&&root.n[1]<.30;
      if((bush?(cliffScrub?summary.cliffScrub>=(phaseCaps?.cliff??cliffCap):summary.uprightBushes>=(phaseCaps?.bush??bushCap)):summary.trees>=(phaseCaps?.tree??treeCap))||root.n[1]<(bush?.08:.58))return false;
      const site=root.site||siteAt(root.x,root.y,root.z),seed=hash(root.x+19,root.y-7,root.z+31),ledge=smooth(.30,.78,root.n[1]);
      // Coarse XZ V cannot resolve a two-metre ledge on a signed-field cliff.
      // Actual normal + root support may admit a local, strongly patchy pocket.
      if(cliffScrub&&site.patch<.52)return false;
      const micro=site.patch>.47&&root.n[1]>(cliffScrub?.08:bush?.25:.42),override=micro&&site.cover<.25;
      const effectiveCover=clamp(Math.max(site.cover,override?(.25+.52*ledge)*site.patch:0));
      if(effectiveCover<(bush?.18:.25)||(!source&&site.patch<(relictPocket?.24:.32)))return false;
      const forest=clamp(Math.max(site.forest,override?(.32+.45*ledge):0));
      if(!bush&&forest<.27)return false;
      if(!source&&seed>(bush?Math.max(effectiveCover,.40)*(.60+.40*site.patch):Math.max(effectiveCover*forest,.27)*(.46+.54*site.patch)))return false;
      const rawRadius=source?(Array.isArray(source)?source[3]:source.radius):null;
      let radius=bush?clamp(rawRadius!=null?rawRadius*1.9:(1.10+2.60*site.patch+.45*site.moisture),1.0,4.15)
        :clamp(rawRadius!=null?rawRadius*1.95:(3.1+3.25*ledge*(.55+.45*site.patch)),2.8,6.8);
      // Thin fissure scrub stays low; shoulder/gully cohorts carry broad
      // gravity-grown crowns that can actually read against a 300 m wall.
      if(cliffScrub)radius=clamp(1.45+1.30*site.patch+.20*site.moisture,1.8,3.0);
      if(bush&&!cliffScrub&&root.n[1]<.58)radius=Math.min(4.7,radius*1.18);
      if(relictPocket)radius=Math.min(radius,1.5);
      if(closeToPlant(root,radius,bush))return false;
      const check=support(root,radius,bush,cliffScrub);if(!check.valid){stats.rejectedSupport++;return false;}
      const wind=clamp((1-site.moisture)*.35+.42*(1-ledge)+.23*habitatNoise(root.x,root.z,110,peakIndex*.7));
      let family=bush?(site.moisture>.62&&root.n[1]<.65?2:3):radius<3.5?3:wind>.58&&seed<.40?2:site.moisture>.61?1:seed<.60?0:1;
      const angle=peakIndex*2.39996+.45*habitatNoise(root.x,root.z,44,11),wx=Math.cos(angle),wz=Math.sin(angle);
      const lightX=wx*.70+root.n[0]*.30,lightZ=wz*.70+root.n[2]*.30,len=Math.hypot(lightX,lightZ)||1;
      const maturity=clamp(.27+.51*ledge+.12*site.moisture-.24*wind),bury=.075+radius*.018;
      const sdfAnchor={position:[root.x,root.y,root.z],normal:root.n.slice(),peakIndex,triangle:root.offset/3,
        vertices:[index[root.offset],index[root.offset+1],index[root.offset+2]],barycentric:root.weights.slice(),rootSupport:check.accepted,rootFootprintRadius:check.reach,rootFootprintPlane:check.tangent?'surface-tangent':'horizontal',rootHeightSpan:check.span};
      const x=root.x-root.n[0]*bury,y=root.y-root.n[1]*bury,z=root.z-root.n[2]*bury;
      const record={x,y,z,radius,species:family+1,seed,height:cliffScrub?radius*.90:bush?radius*(root.n[1]<.58?.65+.10*site.moisture:.90):radius*[1.65,2.12,1.48,1.60][family]*(1-.18*wind),bush,cliffScrub,
        growthHabit:!bush?'ledge-tree':cliffScrub?'hanging-creeper':root.n[1]<.58?'clinging-shrub':'slope-thicket',
        anchorMode:'sdf-surface',m4:true,m5:true,mountain:true,peakIndex,sdfAnchor,rootEmbedding:bury,architecture:family,family,
        architectureName:TREE_FAMILIES[family],crownFamily:TREE_FAMILIES[family],maturity,lightX:lightX/len,lightZ:lightZ/len,
        windExposure:wind,rootExposure:0,riparian:0,competition:.25,opening:1-site.patch,understory:bush?site.moisture:0,
        site:{moisture:site.moisture,forest,cover:effectiveCover,slope:Math.sqrt(1-root.n[1]**2)/Math.max(.18,root.n[1]),exposure:wind},
        canopyX:x+lightX/len*radius*.16,canopyZ:z+lightZ/len*radius*.16,canopyRadius:radius*(family===0?1.40:family===1?.84:family===2?1.25:.72)};
      (bush?outBushes:outTrees).push(record);anchors.push(record);const key=Math.floor(x/8)+','+Math.floor(y/8)+','+Math.floor(z/8);
      if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(record);
      summary[bush?'bushes':'trees']++;if(bush)summary[cliffScrub?'cliffScrub':'uprightBushes']++;if(cliffScrub)stats.cliffScrub++;summary.families[family]++;stats[bush?'bushes':'trees']++;
      const upper=(root.y-minY)/Math.max(1,maxY-minY);if(upper>.75)summary.upperQuarter++;if(upper>.5)summary.upperHalf++;
      summary.normalYRange[0]=Math.min(summary.normalYRange[0],root.n[1]);summary.normalYRange[1]=Math.max(summary.normalYRange[1],root.n[1]);
      summary.heightRange[0]=Math.min(summary.heightRange[0],root.y);summary.heightRange[1]=Math.max(summary.heightRange[1],root.y);
      if(source){summary.nativeAnchored++;stats.nativeAnchored++;}else{summary.supplemented++;stats.supplemented++;}
      if(override){summary.microHabitatOverrides++;stats.microHabitatOverrides++;}
      makeContact(record,root);
      return true;
    }
    for(const bush of [false,true])for(const seed of native[peakIndex][bush?'bushes':'trees']){
      if(bush?summary.bushes>=Math.floor(bushCap*.08):summary.trees>=Math.floor(treeCap*.15))break;
      const x=Array.isArray(seed)?seed[0]:seed.x,y=Array.isArray(seed)?seed[1]:seed.y,z=Array.isArray(seed)?seed[2]:seed.z;
      const root=query(x,z,y,bush?.08:.58);if(root)plant(root,bush,seed);else stats.rejectedSupport++;
    }
    // Grow each finite cohort through neighbouring actual surface cells. The
    // distributed seed cells keep one highest patch from consuming a peak's
    // entire budget; breadth-first neighbourhoods give connected woodland,
    // rather than independent specks ranked across the whole cliff.
    const supplements=[...cells.values()],regions=new Map();
    for(const root of supplements){
      root.site=siteAt(root.x,root.y,root.z);
      root.habitatPriority=root.site.patch*.78+root.n[1]*.17+hash(root.x+71,root.y,root.z)*.05;
      root.legacyPatch=mountainLegacySurfacePatch(root.x,root.y,root.z);
      root.legacyPriority=root.legacyPatch*.72+root.n[1]*.14+hash(root.x+71,root.y,root.z)*.14;
      const key=Math.floor(root.x/96)+','+Math.floor(root.y/96)+','+Math.floor(root.z/96);
      const old=regions.get(key);if(root.site.patch>.48&&(!old||root.habitatPriority>old.habitatPriority))regions.set(key,root);
    }
    // Keep a substantial share of the original productive M4 pockets before
    // expanding the new ribbons. A habitat union alone could still move all
    // plants elsewhere when a global ranked queue exhausted its finite cap.
    const legacyPlaced=[];
    phaseCaps={tree:Math.floor(treeCap*.55),bush:Math.floor(bushCap*.55),cliff:Math.floor(cliffCap*.55)};
    for(const root of supplements.slice().sort((a,b)=>b.legacyPriority-a.legacyPriority)){
      if(root.legacyPatch<.24)continue;
      const tree=root.n[1]>.58&&Math.max(root.site.forest,root.legacyPatch>.57?.55:0)>.30;
      if((tree&&plant(root,false))||plant(root,true))legacyPlaced.push(root);
      if(summary.trees>=phaseCaps.tree&&summary.uprightBushes>=phaseCaps.bush&&summary.cliffScrub>=phaseCaps.cliff)break;
    }
    phaseCaps=null;
    const seedRoots=[...regions.values()].sort((a,b)=>b.habitatPriority-a.habitatPriority).slice(0,peakIndex===0?18:14);
    stats.connectedSeeds+=seedRoots.length;
    const frontier=[...legacyPlaced,...seedRoots],visited=new Set(frontier);
    for(let cursor=0;cursor<frontier.length;cursor++){
      const root=frontier[cursor];
      if(summary.trees>=treeCap&&summary.uprightBushes>=bushCap&&summary.cliffScrub>=cliffCap)break;
      const site=root.site,tree=root.n[1]>.58&&Math.max(site.forest,site.patch>.47?.55:0)>.30;
      if(!(tree&&plant(root,false)))plant(root,true);
      const ix=Math.floor(root.x/cellSize),iy=Math.floor(root.y/cellSize),iz=Math.floor(root.z/cellSize);
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy&&!dz)continue;
        const next=cells.get((ix+dx)+','+(iy+dy)+','+(iz+dz));if(!next||visited.has(next))continue;
        if(next.site.patch<.34||next.n[0]*root.n[0]+next.n[1]*root.n[1]+next.n[2]*root.n[2]<.20)continue;
        if((next.x-root.x)**2+(next.y-root.y)**2+(next.z-root.z)**2>85)continue;
        visited.add(next);frontier.push(next);
      }
    }
    // Disconnected ledges can still have their own small, supported colony.
    supplements.sort((a,b)=>b.habitatPriority-a.habitatPriority);
    for(const root of supplements){
      if(visited.has(root))continue;
      if(summary.trees>=treeCap&&summary.uprightBushes>=bushCap&&summary.cliffScrub>=cliffCap)break;
      const site=root.site,tree=root.n[1]>.58&&Math.max(site.forest,site.patch>.47?.55:0)>.30;
      if(tree&&plant(root,false))continue;plant(root,true);
    }
    // A tiny valid remnant can occupy a dry isolated ledge even when the
    // large woodland cohort did not establish. Keep this low and local:
    // ordinary cover, actual normal, support and clipping still apply.
    if(!summary.trees&&!summary.bushes){
      for(const root of supplements){
        if(summary.bushes>=6)break;
        if(root.n[1]<.35||root.site.cover<.18||root.site.patch<.24)continue;
        plant(root,true,null,true);
      }
    }
    if(!summary.trees&&!summary.bushes){summary.heightRange=null;summary.normalYRange=null;summary.reason='No supported habitat passed clip, normal, cover and root footprint';}
    summary.milliseconds=performance.now()-peakBegan;
    triBins.clear();cells.clear();occupied.clear();faceQueries=null;
  }
  stats.peaksWithPlants=perPeak.filter(p=>p.trees+p.bushes>0).length;stats.milliseconds=performance.now()-began;siteCache.clear();
  return {trees:outTrees,bushes:outBushes,stats,getStats:()=>({...stats}),getContactPaths:()=>contacts,
    getAnchors:({limit=Infinity}={})=>anchors.slice(0,limit).map(p=>({m4:true,anchorMode:p.anchorMode,position:p.sdfAnchor.position.slice(),normal:p.sdfAnchor.normal.slice(),
      kind:p.cliffScrub?'cliff-fissure-scrub':p.bush?'mountain-shrub':'mountain-tree',cliffScrub:!!p.cliffScrub,peakIndex:p.peakIndex,radius:p.radius,family:p.family,triangle:p.sdfAnchor.triangle,
      sdfAnchor:{...p.sdfAnchor},embeddedPosition:[p.x,p.y,p.z]}))};
}
