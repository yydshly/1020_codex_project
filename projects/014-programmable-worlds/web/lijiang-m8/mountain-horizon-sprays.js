// Sub-pixel branch sprays for the horizon only. Each real plant keeps its
// own rooted branch skeleton and many small, independently oriented sprays.
// Neither the atlas nor a plane contains a whole tree or a whole crown.
import { mountainCrownForms } from './mountain-botanical-crown.js?v=20261026-m8';

const REVISION='m7-horizon-preserved-sprays-subpixel-twigs-2';
const hash=n=>{let h=Math.imul(Math.floor(n*1000003)^0x5f3759df,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const profile=f=>f<12?{habit:Math.floor(f/4),variant:f%4,density:1}:{habit:0,variant:f%4,density:f<16?4:9};

function atlas(T){
  const cell=128,size=cell*4,data=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),coverage=[];
  for(let i=0;i<size*size;i++){data[i*4]=data[i*4+1]=data[i*4+2]=255;normal[i*4]=normal[i*4+1]=128;normal[i*4+2]=255;normal[i*4+3]=255;}
  for(let tile=0;tile<16;tile++){
    const ox=(tile%4)*cell,oy=Math.floor(tile/4)*cell,seed=tile*91.31,sparse=tile<4,variant=tile%4;
    function pixel(x,y,alpha,tone,nx=0,ny=0){
      if(x<8||x>=cell-8||y<8||y>=cell-8)return;
      const p=((oy+y)*size+ox+x)*4;if(alpha*255<data[p+3])return;
      data[p]=Math.round(255*tone);data[p+1]=Math.round(255*clamp(tone*1.015,0,1));data[p+2]=Math.round(255*tone*.94);data[p+3]=Math.round(alpha*255);
      const nz=Math.sqrt(Math.max(.12,1-nx*nx-ny*ny)),l=Math.hypot(nx,ny,nz);normal[p]=Math.round(127.5*(nx/l+1));normal[p+1]=Math.round(127.5*(ny/l+1));normal[p+2]=Math.round(127.5*(nz/l+1));
    }
    function twig(a,b,width,tone){
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),steps=Math.ceil(length*2);
      for(let s=0;s<=steps;s++){const t=s/steps,x=a[0]+dx*t,y=a[1]+dy*t;for(let iy=Math.floor(y-width);iy<=Math.ceil(y+width);iy++)for(let ix=Math.floor(x-width);ix<=Math.ceil(x+width);ix++){
        const d=Math.hypot(ix+.5-x,iy+.5-y);if(d<width+.6)pixel(ix,iy,clamp(width+.6-d,0,1),tone);
      }}
    }
    function leaflet(base,angle,length,width,key){
      const dx=Math.cos(angle),dy=Math.sin(angle),cx=base[0]+dx*length*.5,cy=base[1]+dy*length*.5;
      for(let y=Math.max(8,Math.floor(cy-length));y<Math.min(cell-8,Math.ceil(cy+length));y++)for(let x=Math.max(8,Math.floor(cx-length));x<Math.min(cell-8,Math.ceil(cx+length));x++){
        const u=((x+.5-cx)*dx+(y+.5-cy)*dy)/(length*.5),v=(-(x+.5-cx)*dy+(y+.5-cy)*dx)/(width*.5);
        const edge=1-u*u-v*v;if(edge<-.12)continue;
        const alpha=clamp(edge*7+.25,0,1),tone=.91+.065*hash(key+19)+.020*(1-Math.abs(v));
        const fold=(v<0?-.22:.22)*(.55+.45*(1-Math.abs(u)));pixel(x,y,alpha,tone,-dy*fold+dx*u*.10,dx*fold+dy*u*.10);
      }
    }
    const origin=[63+(variant-1.5)*2,18],tip=[61+(hash(seed+2)-.5)*20,109];twig(origin,tip,1.0,.61);
    const branches=sparse?5:7;
    for(let b=0;b<branches;b++){
      const t=.18+b*.10,base=[origin[0]+(tip[0]-origin[0])*t,origin[1]+(tip[1]-origin[1])*t],sign=b%2?1:-1;
      const end=[base[0]+sign*(27+12*hash(seed+b+7)),base[1]+16+14*hash(seed+b+11)];twig(base,end,.65,.67);
      const dx=end[0]-base[0],dy=end[1]-base[1],angle=Math.atan2(dy,dx),pairs=sparse?3:4;
      for(let j=0;j<pairs;j++)for(const side of [-1,1]){
        const a=.18+j*.20,bud=[base[0]+dx*a,base[1]+dy*a],key=seed+b*13.7+j*3.1+side;
        leaflet(bud,angle+side*(.65+.26*hash(key+3)),(sparse?10:13)+5*hash(key+5),5+3*hash(key+8),key);
      }
      leaflet(end,angle,13,6,seed+b+101);
    }
    // Small opaque swatch for actual woody tubes, outside every spray's UVs.
    for(let y=2;y<6;y++)for(let x=2;x<6;x++){const p=((oy+y)*size+ox+x)*4;data[p]=data[p+1]=data[p+2]=255;data[p+3]=255;}
    let covered=0;for(let y=8;y<cell-8;y++)for(let x=8;x<cell-8;x++)if(data[((oy+y)*size+ox+x)*4+3]>=64)covered++;
    coverage.push(covered/((cell-16)**2));
  }
  const map=new T.DataTexture(data,size,size,T.RGBAFormat),normalMap=new T.DataTexture(normal,size,size,T.RGBAFormat);
  for(const texture of [map,normalMap]){texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;texture.flipY=false;}
  map.name='Code-generated small compound branch sprays';map.colorSpace=T.LinearSRGBColorSpace;normalMap.name='Code-generated folded leaflet tangent normals';normalMap.colorSpace=T.NoColorSpace;
  // Ordinary averaged alpha mips erase a 1–2 pixel spray. Preserve each
  // tile's occupied fraction at the material's fixed .25 alpha cutoff.
  // RGB is alpha-weighted to avoid dark transparent borders. These mips
  // retain separated sprays and do not introduce a whole-crown surface.
  map.mipmaps=[{data,width:size,height:size}];let previous=data,previousSize=size;
  while(previousSize>1){
    const width=previousSize/2,next=new Uint8Array(width*width*4);
    for(let y=0;y<width;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*4;let alpha=0,r=0,g=0,b=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const q=((y*2+dy)*previousSize+x*2+dx)*4,a=previous[q+3];alpha+=a;r+=previous[q]*a;g+=previous[q+1]*a;b+=previous[q+2]*a;}
      next[p]=alpha?r/alpha:255;next[p+1]=alpha?g/alpha:255;next[p+2]=alpha?b/alpha:255;next[p+3]=alpha*.25;
    }
    const tileSize=width/4;
    if(tileSize>=1)for(let tile=0;tile<16;tile++){
      const x0=tile%4*tileSize,y0=Math.floor(tile/4)*tileSize,values=[];
      for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++)values.push(next[((y0+y)*width+x0+x)*4+3]);
      // Adult crowns contain many overlapping real shoots. Preserve that
      // leaf area after minification, while sparse shrub margins stay open.
      const overlapCompensation=tile<4?1.20:tile<12?1.30:1;
      values.sort((a,b)=>b-a);const target=Math.max(1,Math.round(coverage[tile]*.765625*overlapCompensation*values.length)),threshold=values[Math.min(values.length-1,target-1)],factor=threshold>0?Math.min(5,65/threshold):1;
      for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++){const q=((y0+y)*width+x0+x)*4+3;next[q]=Math.min(255,Math.round(next[q]*factor));}
    }
    map.mipmaps.push({data:next,width,height:width});previous=next;previousSize=width;
  }
  map.generateMipmaps=false;map.needsUpdate=true;
  return {map,normalMap,size,cell,coverage};
}

export function createMountainHorizonSprays(T,{families=Array.from({length:20},(_,i)=>i)}={}){
  const started=performance.now(),texture=atlas(T),up=new T.Vector3(0,1,0),geometries=[],woodVariants=[];
  for(const family of families){
    const {habit,variant,density}=profile(family),forms=mountainCrownForms(family),positions=[],normals=[],colors=[],uvs=[],wood=[],indices=[];
    const stemLean=variant===2?-.13:.035,root=new T.Vector3(),stemPath=[root.clone()],fineTwigIndexRanges=[];let sprayCards=0,tubeSegments=0,maxSprayDiameter=0;
    function vertex(p,n,color,uv,isWood){const i=positions.length/3;positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);colors.push(...color);uvs.push(...uv);wood.push(isWood?1:0);return i;}
    function tube(a,b,r0,r1,fineTwig=false){
      const indexStart=indices.length;
      const axis=b.clone().sub(a).normalize(),side=new T.Vector3().crossVectors(axis,up);if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();const cross=new T.Vector3().crossVectors(axis,side).normalize();
      const rings=[],color=[1.12,.42,.65],uv=[4/texture.size,4/texture.size];
      for(let j=0;j<2;j++){const ring=[],p=j?b:a,r=j?r1:r0;for(let k=0;k<3;k++){const angle=k/3*Math.PI*2,n=side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(cross,Math.sin(angle));ring.push(vertex(p.clone().addScaledVector(n,r),n,color,uv,true));}rings.push(ring);}
      for(let k=0;k<3;k++){const n=(k+1)%3;indices.push(rings[0][k],rings[1][n],rings[1][k],rings[0][k],rings[0][n],rings[1][n]);}tubeSegments++;
      if(fineTwig)fineTwigIndexRanges.push([indexStart,indices.length]);
    }
    function spray(center,direction,width,height,key){
      const axis=direction.clone().normalize(),side=new T.Vector3().crossVectors(axis,up);if(side.lengthSq()<.001)side.set(1,0,0);side.normalize().applyAxisAngle(axis,(hash(key+21)-.5)*Math.PI*2);
      const n=new T.Vector3().crossVectors(side,axis).normalize(),tileBase=habit===0?(density===1?0:density===4?4:8):12,tile=tileBase+Math.floor(hash(key+33)*4);
      const tx=tile%4,ty=Math.floor(tile/4),u0=(tx*128+8)/512,u1=(tx*128+120)/512,v0=(ty*128+8)/512,v1=(ty*128+120)/512;
      const tone=.91+.15*hash(key+19),color=[tone*.97,tone,tone*.83],corners=[[-1,-1],[1,-1],[1,1],[-1,1]],v=[];
      for(let k=0;k<4;k++){const [x,y]=corners[k],p=center.clone().addScaledVector(side,x*width*.5).addScaledVector(axis,y*height*.5);v.push(vertex(p,n,color,[x<0?u0:u1,y<0?v0:v1],false));}
      indices.push(v[0],v[1],v[2],v[0],v[2],v[3]);sprayCards++;maxSprayDiameter=Math.max(maxSprayDiameter,Math.hypot(width,height));
    }
    let previous=root.clone();if(habit===0)for(const y of [.24,.53,.84,1.16,variant===1?1.68:1.43]){
      const next=new T.Vector3(stemLean*y/1.6+.018*Math.sin(y*4.2+variant),y,.025*Math.sin(y*3.1+variant));tube(previous,next,.011*(1-previous.y/2),.011*(1-y/2));previous=next;stemPath.push(next.clone());
    }
    const stemAttachment=y=>{for(let i=1;i<stemPath.length;i++)if(y<=stemPath[i].y)return stemPath[i-1].clone().lerp(stemPath[i],(y-stemPath[i-1].y)/(stemPath[i].y-stemPath[i-1].y));return stemPath.at(-1).clone();};
    for(let group=0;group<forms.length;group++){
      const [x,y,z,w,h]=forms[group],center=new T.Vector3(x,y,z),seed=family*157+group*31.7,phase=group*2.39996+variant*.731;
      const origin=habit===0?stemAttachment(Math.max(.22,y*.48)):root.clone(),elbow=origin.clone().lerp(center,habit===0?.58:.40);elbow.y-=habit===0?.025+hash(seed+3)*.055:0;elbow.z+=(hash(seed+5)-.5)*(habit===2?.018:.04);tube(origin,center,habit===0?.0035:.0018,.0007,true);
      const shootCount=habit===0&&density>1?9:7;
      for(let k=0;k<shootCount;k++){
        // Stratify the same seven/density shoots used by the actual crown.
        // Additional adult density changes spray area, never whole-tree scale.
        const shoot=Math.min(7*density-1,Math.floor(k/shootCount*7*density)+Math.floor(hash(seed+k+37)*Math.max(1,7*density/shootCount))),angle=phase+shoot*2.39996,radius=(habit===0?.30+.32*hash(seed+shoot+23):.22+.15*hash(seed+shoot+23))*w;
        const end=center.clone().add(new T.Vector3(Math.cos(angle)*radius,(hash(seed+shoot+27)-(habit===0?.45:.15))*h*(habit===0?.9:.49),Math.sin(angle)*radius*.9));
        const start=habit===0?center.clone().lerp(elbow,.18+.42*hash(seed+shoot+30)):origin.clone().lerp(center,.20+.32*hash(seed+shoot+30));
        const axis=end.clone().sub(start).normalize(),size=habit===0?(density===1?[.29,.45,.54,.53][variant]:density===4?[.49,.54,.56,.46][variant]:[.53,.57,.60,.48][variant]):habit===2?[.28,.27,.25,.25][variant]:.31;
        for(let j=0;j<2;j++){
          const key=seed+shoot*17.3+j*7.1,p=j?end.clone():start.clone().lerp(end,habit===0?.63:.72),direction=axis.clone().addScaledVector(up,.24).normalize();
          if(!j)direction.add(new T.Vector3(Math.cos(angle)*.55,.22,Math.sin(angle)*.55)).normalize();
          spray(p,direction,size*(.82+.25*hash(key+3)),size*(.92+.28*hash(key+5)),key);
        }
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setAttribute('liCanopyWood',new T.Float32BufferAttribute(wood,1));g.setAttribute('liBladeRoot',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();
    let top=0;for(let i=1;i<positions.length/3;i++)if(positions[i*3+1]>positions[top*3+1])top=i;
    // Preserve every vertex, normal, UV, spray triangle and adult trunk. The
    // only omitted primitives are the hair-thin root-to-spray twig tubes.
    // At 600 m, the largest adult twig is about .054 physical pixels in
    // the 680 px reference view (central axis, 58 deg); the original thicker
    // adult trunk is deliberately retained. Actual A/B still judges the
    // minification result, including the view edges and exported resolution.
    // Two fixed index lists allow exact same-scene A/B without rebuilding
    // plants or textures. Keep the GPU index capacity unchanged on switches.
    const optimizedIndices=[];let range=0;
    for(let i=0;i<indices.length;i+=3){while(range<fineTwigIndexRanges.length&&i>=fineTwigIndexRanges[range][1])range++;if(range<fineTwigIndexRanges.length&&i>=fineTwigIndexRanges[range][0])continue;optimizedIndices.push(indices[i],indices[i+1],indices[i+2]);}
    const ArrayType=g.index.array.constructor,baseline=ArrayType.from(indices),optimized=ArrayType.from(optimizedIndices);
    woodVariants.push({baseline,optimized});
    g.userData={kind:'independent-rooted-horizon-compound-branch-sprays',family,lod:'horizon',density,habit:['ledge-tree','basal-multistem-shrub','trailing-cliff-creeper'][habit],root:[0,0,0],topPoint:positions.slice(top*3,top*3+3),triangles:indices.length/3,baselineTriangles:indices.length/3,optimizedTriangles:optimized.length/3,omittedFineTwigTriangles:(baseline.length-optimized.length)/3,preservedTrunkTriangles:habit===0?30:0,maxFineTwigDiameter:habit===0?.007:.0036,tubeSegments,sprayCards,wholeCrownPlanes:0,leafPlanes:0,leafClouds:0,maxSprayDiameter,externalAssets:0};geometries.push(g);
  }
  const stats={revision:REVISION,externalAssets:0,atlasSize:texture.size,atlasCells:16,alphaCoverage:texture.coverage,alphaMipPolicy:'Per-spray tile occupied-area preservation at alphaTest .25; alpha-weighted RGB',manualMipLevels:texture.map.mipmaps.length,geometryTriangles:geometries.map(g=>g.userData.triangles),sprayCards:geometries.map(g=>g.userData.sprayCards),wholeCrownPlanes:0,baseAttributeSlots:6,instancedAttributeSlots:15,root:[0,0,0],buildMilliseconds:performance.now()-started};
  stats.baselineTriangles=geometries.map(g=>g.userData.baselineTriangles);stats.optimizedTriangles=geometries.map(g=>g.userData.optimizedTriangles);stats.omittedFineTwigTriangles=geometries.map(g=>g.userData.omittedFineTwigTriangles);stats.woodPolicy='All spray vertices/indices, atlas and adult trunk tubes preserved; only subpixel fine twig tubes omitted at horizon';
  return {geometries,woodVariants,map:texture.map,normalMap:texture.normalMap,normalScale:new T.Vector2(.42,.42),alphaTest:.25,stats,disposeTextures(){texture.map.dispose();texture.normalMap.dispose();}};
}
