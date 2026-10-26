import { composeForestPopulation, TREE_FAMILIES } from './raster-habitat.js?v=20261026-m8';
/* Procedural raster forest candidate. No models, images, or texture assets.
 *
 * trees/bushes: [{x,y,z,radius,species,seed,height?}] in world metres.
 * Alternative native RGBA grids: {data,width,height,cellSize|G}, with rect
 * [originX,originZ,worldSize]. Native T.w = species*100 + radius; T.z is
 * the already embedded tree base. M3 composes terrain-driven cohorts and
 * crown competition; lowland relocation resamples H and keeps root embedding.
 *
 * Leaf/twig albedo/alpha and relief are rasterised here from botanical
 * curves. No image file is loaded. Near crowns use independently folded leaf
 * surfaces; distant crowns use fixed curved twig meshes, with matching cutout
 * shadows. They never face the camera and contain no opaque sphere cores.
 * Trilinear coverage-preserving alpha mips and opaque alpha-tested output keep
 * small silhouettes stable without partial canvas alpha during reflection.
 */

const TAU = Math.PI * 2;
const LEAFLETS_PER_PATCH = 324;
const LOD_BANDS=[[0,55],[27,795],[600,2570]];
const FAMILY_LEAF_TINTS=[[.94,1.02,.91],[.88,.99,1.12],[1.03,1.02,1.16],[1.06,1.07,.87]];
const FAMILY_BARK_TONES=[[.085,.078,.059],[.092,.088,.073],[.091,.074,.050],[.106,.098,.073]];
const fract = n => n - Math.floor(n);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function random(seed) {
  let state = (Math.floor(seed * 1000003) ^ 0x62c4b315) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function nativeHash(x, y) {
  let a = fract(x * .1031), b = fract(y * .1031), c = fract(x * .1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}

function populationNoise(x,z,scale,seed=0) {
  x=x/scale+seed;z=z/scale-seed*.73;
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,fract(x)),v=smooth(0,1,fract(z));
  return mix(mix(nativeHash(ix,iz),nativeHash(ix+1,iz),u),
    mix(nativeHash(ix,iz+1),nativeHash(ix+1,iz+1),u),v);
}

function riverCenter(z) {
  return 46*Math.sin((z+140)*.00168)+28*Math.sin((z-70)*.0031)
    -430*(1-smooth(-1350,-350,z));
}

function riverHalfWidth(z) {
  return 170*(1+.11*Math.sin(z*.0013-.4)+.055*Math.cos(z*.0037));
}


function readPlants(input, grid, rect, terrain, bush) {
  const plants = [];
  const push = (x, y, z, radius, species, seed, height,extra=null) => {
    if (![x, z, radius].every(Number.isFinite) || radius < .35) return;
    if (!Number.isFinite(y)) y = terrain?.sampleHeight?.(x, z) ?? 0;
    if (!Number.isFinite(y)) return;
    plants.push({ ...(extra||{}),x, y, z, radius, species: species ?? 1,
      seed: Number.isFinite(seed) ? seed : nativeHash(x * .31, z * .31),
      height: Number.isFinite(height) ? height : undefined, bush });
  };
  if (Array.isArray(input)) {
    for (const p of input) {
      if (Array.isArray(p)) push(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
      else if (p) push(p.x, p.y, p.z, p.radius ?? p.r, p.species, p.seed, p.height,p);
    }
    return plants;
  }
  const source = grid ?? (input?.data ? input : null);
  if (!source?.data) return plants;
  const data = source.data, width = source.width ?? source.size;
  const height = source.height ?? width;
  const cell = source.cellSize ?? source.G ?? rect[2] / width;
  const x0 = source.originX ?? rect[0], z0 = source.originZ ?? rect[1];
  if (!(width > 0 && height > 0 && cell > 0) || data.length < width * height * 4)
    throw new Error('Invalid native forest RGBA grid');
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = (z * width + x) * 4, packed = data[i + 3];
    const radius = bush ? packed % 10 : packed % 100;
    if (!Number.isFinite(packed) || radius < .35) continue;
    const jx = fract(data[i] * .5) * 2, jz = fract(data[i + 1] * .5) * 2;
    push(x0 + (x + jx) * cell, data[i + 2], z0 + (z + jz) * cell,
      radius, bush ? 0 : Math.floor(packed / 100 + .01),
      nativeHash(x * 1.37 + .5, z * 1.37 + .5));
  }
  return plants;
}

export function createFoliageTextures(THREE,{singleLeaf=false,denseTwigs=false}={}) {
  const tileSize=512,size=tileSize*2,count=size*size;
  const pixels=new Uint8Array(count*4),normalPixels=new Uint8Array(count*4);
  for(let i=0;i<count;i++){
    pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=255;
    normalPixels[i*4]=normalPixels[i*4+1]=128;normalPixels[i*4+2]=255;normalPixels[i*4+3]=255;
  }
  const put=(x,y,tone,alpha,nx=0,ny=0)=>{
    if(x<0||y<0||x>=size||y>=size)return;
    const i=(y*size+x)*4;if(alpha*255<pixels[i+3])return;
    pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(255*clamp(tone,0,1));pixels[i+3]=Math.round(alpha*255);
    const nz=Math.sqrt(Math.max(.01,1-nx*nx-ny*ny));
    normalPixels[i]=Math.round(127.5+127.5*nx);normalPixels[i+1]=Math.round(127.5+127.5*ny);normalPixels[i+2]=Math.round(127.5+127.5*nz);
  };
  for(let tile=0;tile<4;tile++){
    const ox=(tile%2)*tileSize,oy=Math.floor(tile/2)*tileSize,rng=random(97.13+tile*21.17);
    const point=(x,y)=>[ox+x*tileSize,oy+y*tileSize];
    const line=(a,b,width,tone)=>{
      const [ax,ay]=point(...a),[bx,by]=point(...b),dx=bx-ax,dy=by-ay,steps=Math.ceil(Math.hypot(dx,dy)*1.4);
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=ax+dx*t,y=ay+dy*t,r=width*tileSize;
        for(let py=Math.floor(y-r-1);py<=y+r+1;py++)for(let px=Math.floor(x-r-1);px<=x+r+1;px++){
          const alpha=clamp(r+.7-Math.hypot(px+.5-x,py+.5-y),0,1);if(alpha>0)put(px,py,tone,alpha);
        }
      }
    };
    const leaf=(root,angle,length,width,tone)=>{
      const [ax,ay]=point(...root),dx=Math.cos(angle),dy=Math.sin(angle),
        L=length*tileSize*[1.05,1.15,1.38,.88][tile],W=width*tileSize*[1.30,.80,.58,1.10][tile];
      const minX=Math.max(ox+2,Math.floor(Math.min(ax,ax+dx*L)-W-2)),maxX=Math.min(ox+tileSize-3,Math.ceil(Math.max(ax,ax+dx*L)+W+2));
      const minY=Math.max(oy+2,Math.floor(Math.min(ay,ay+dy*L)-W-2)),maxY=Math.min(oy+tileSize-3,Math.ceil(Math.max(ay,ay+dy*L)+W+2));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const xx=x+.5-ax,yy=y+.5-ay,t=(xx*dx+yy*dy)/L;if(t<=0||t>=1)continue;
        const transverse=-xx*dy+yy*dx,bend=.12*W*Math.sin(Math.PI*t),half=W*Math.pow(Math.sin(Math.PI*t),singleLeaf?[.52,.64,.86,.50][tile]:.78)*(1-.12*t);
        const q=(transverse-bend)/Math.max(.001,half),alpha=clamp(half-Math.abs(transverse-bend)+.65,0,1);if(alpha<=0)continue;
        const rib=Math.exp(-Math.abs(q)*27),surface=.94+.055*Math.sin(Math.PI*t)-.035*q+.023*rib;
        // Soft leaf relief, with no striped high-frequency vein pattern.
        const transverseNormal=clamp(q*.25,-.25,.25),longNormal=.08*Math.sin(Math.PI*t);
        put(x,y,tone*surface,alpha,-dy*transverseNormal+dx*longNormal,dx*transverseNormal+dy*longNormal);
      }
    };
    if(singleLeaf){
      // One botanical leaf per tile. Near geometry supplies its own petiole,
      // fold and orientation, so a whole flat compound sprig is not repeated.
      leaf([.50,.06],Math.PI*.5,.88/[1.05,1.15,1.38,.88][tile],
        [.405,.355,.24,.40][tile]/[1.30,.80,.58,1.10][tile],.94);
      continue;
    }
    // The middle/far atlas retains the same three-fork short shoots as the
    // physical near family. Several small shoots share a fixed curved patch;
    // no single long feather shaft stands in for every broadleaf crown.
    const roots=[];
    const twigRows=denseTwigs?6:5,twigColumns=denseTwigs?6:4;
    for(let row=0;row<twigRows;row++)for(let column=0;column<twigColumns;column++){
      if(row===0&&column===twigColumns-1||row===twigRows-1&&column===0)continue;
      // Extra independent short shoots fill distant mountain canopies. Their
      // individual leaves keep the same physical size and botanical shape.
      roots.push(denseTwigs
        ?[.10+column*.155+(rng()-.5)*.035,(tile===2?.25:.055)+row*(tile===2?.105:.125)+(rng()-.5)*.025]
        :[.14+column*.235+(rng()-.5)*.045,(tile===2?.27:.06)+row*.16+(rng()-.5)*.035]);
    }
    const ends=tile===0?[[-.15,.15],[.055,.22],[.19,.07]]:tile===1?[[-.10,.22],[.035,.28],[.15,.17]]
      :tile===2?[[-.15,-.17],[.065,-.23],[.19,-.12]]:[[-.12,.16],[.03,.23],[.15,.11]];
    for(let sprig=0;sprig<roots.length;sprig++){
      const root=roots[sprig],phase=(rng()-.5)*.75,fork=[root[0]+(rng()-.5)*.025,root[1]+(tile===2?-.045:.045)];
      line(root,fork,.0026,.59);
      for(let branch=0;branch<3;branch++){
        const dx=ends[branch][0]*(.84+.23*rng()),dy=ends[branch][1]*(.86+.22*rng());
        const end=[fork[0]+dx*Math.cos(phase)-dy*Math.sin(phase),fork[1]+dx*Math.sin(phase)+dy*Math.cos(phase)];
        line(fork,end,.0019,.64);const a=Math.atan2(end[1]-fork[1],end[0]-fork[0]);
        for(let j=0;j<6;j++){
          const t=.10+(j+.15+.42*rng())*.13,start=[mix(fork[0],end[0],t),mix(fork[1],end[1],t)];
          const angle=a+(j%2?1:-1)*(.85+.30*rng())+(rng()-.5)*.28;
          const L=([.044,.048,.055,.040][tile])*(.80+.36*rng()),W=L*[.325,.26,.16,.34][tile];
          leaf(start,angle,L/[1.05,1.15,1.38,.88][tile],W/[1.30,.80,.58,1.10][tile],.84+.15*rng());
        }
      }
    }
  }
  function make(data,normal=false){
    const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
    texture.name=(singleLeaf?'Code-generated single leaf ':'Code-generated twig ')+(normal?'relief':'silhouettes');
    texture.colorSpace=normal?THREE.NoColorSpace:THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.magFilter=THREE.LinearFilter;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
    if(!normal){
      // Preserve silhouette coverage through minification, rather than losing
      // small leaves whenever an ordinary averaged mip drops below alphaTest.
      let raw=data,width=size,height=size;
      let covered=0;for(let i=3;i<raw.length;i+=4)if(raw[i]>115)covered++;
      const coverage=covered/(width*height),mips=[{data,width,height}];
      while(width>1||height>1){
        const w=Math.max(1,width>>1),h=Math.max(1,height>>1),next=new Uint8Array(w*h*4);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4;let alpha=0,r=0,g=0,b=0;
          for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
            const j=((Math.min(height-1,y*2+dy))*width+Math.min(width-1,x*2+dx))*4,a=raw[j+3];
            alpha+=a;r+=raw[j]*a;g+=raw[j+1]*a;b+=raw[j+2]*a;
          }
          next[i]=alpha?r/alpha:255;next[i+1]=alpha?g/alpha:255;next[i+2]=alpha?b/alpha:255;next[i+3]=alpha*.25;
        }
        const corrected=new Uint8Array(next);let lo=.35,hi=6;
        // Fine leaves merge into coherent branch masses at a distance. Keeping
        // only the base 19% coverage made remote crowns pale sparse speckles.
        const desiredCoverage=mix(coverage,Math.max(coverage,denseTwigs?.53:.34),smooth(1,6,Math.log2(size/w)));
        if(w>=4){
          for(let iteration=0;iteration<12;iteration++){
            const scale=(lo+hi)*.5;let kept=0;
            for(let i=3;i<next.length;i+=4)if(next[i]*scale>115)kept++;
            if(kept/(w*h)<desiredCoverage)lo=scale;else hi=scale;
          }
          for(let i=3;i<corrected.length;i+=4)corrected[i]=Math.min(255,Math.round(next[i]*(lo+hi)*.5));
        }
        // At one texel per family an alpha-tested canopy must resolve to a
        // covered sample. Ordinary averaged alpha previously erased every
        // far crown in these final levels. This is only the dense canopy atlas.
        if(denseTwigs&&w<4)for(let i=3;i<corrected.length;i+=4)corrected[i]=Math.max(140,corrected[i]);
        mips.push({data:corrected,width:w,height:h});raw=next;width=w;height=h;
      }
      texture.mipmaps=mips;texture.generateMipmaps=false;
    }
    texture.anisotropy=4;texture.needsUpdate=true;return texture;
  }
  return {map:make(pixels),normalMap:make(normalPixels,true),size,leafletsPerPatch:singleLeaf?24:denseTwigs?612:LEAFLETS_PER_PATCH,denseTwigs};
}

function makeIndividualLeafGeometry(THREE,family){
  const positions=[],uvs=[],indices=[],lengths=[],rng=random(517.71+family*31.7),up=new THREE.Vector3(0,1,0);
  const root=new THREE.Vector3(0,-.17,0),fork=new THREE.Vector3(.018,-.025,.012);
  const angles=family===0?[-.35,1.95,4.05]:family===1?[.05,2.3,4.25]:family===2?[-.2,1.9,3.7]:[.45,2.45,4.6];
  const stem=(start,end,radius)=>{
    const base=positions.length/3,direction=end.clone().sub(start).normalize();
    const across=new THREE.Vector3().crossVectors(up,direction).normalize();if(across.lengthSq()<.1)across.set(1,0,0);
    const normal=new THREE.Vector3().crossVectors(direction,across).normalize();
    for(let j=0;j<=3;j++)for(let k=0;k<3;k++){
      const t=j/3,p=start.clone().lerp(end,t),a=k*Math.PI*2/3,r=radius*(1-.55*t);
      p.y+=.018*Math.sin(Math.PI*t);p.addScaledVector(across,Math.cos(a)*r).addScaledVector(normal,Math.sin(a)*r);
      positions.push(p.x,p.y,p.z);uvs.push(.5,.35+.12*t);
    }
    for(let j=0;j<3;j++)for(let k=0;k<3;k++){const a=base+j*3+k,b=base+j*3+(k+1)%3;indices.push(a,b,a+3,b,b+3,a+3);}
  };
  stem(root,fork,.0026);
  for(let branch=0;branch<3;branch++){
    const angle=angles[branch],reach=(family===0?[.24,.19,.27]:family===1?[.15,.20,.17]:family===2?[.25,.21,.29]:[.16,.12,.18])[branch];
    const rise=(family===0?[.08,.15,.025]:family===1?[.20,.31,.11]:family===2?[-.075,.035,-.13]:[.17,.25,.09])[branch];
    const start=fork.clone().add(new THREE.Vector3(0,branch===1?.035:branch===2?-.025:0,0));
    const end=new THREE.Vector3(Math.cos(angle)*reach,start.y+rise,Math.sin(angle)*reach);
    stem(start,end,family===3?.0017:.0022);
    const tangent=end.clone().sub(start).normalize(),sideAxis=new THREE.Vector3().crossVectors(up,tangent).normalize(),surfaceNormal=new THREE.Vector3().crossVectors(tangent,sideAxis).normalize();
    for(let leaf=0;leaf<8;leaf++){
      // Alternate, irregular internodes belong to three real short shoots.
      // A broadleaf crown has no shared 24-leaf feather shaft.
      const t=.10+(leaf+.15+.55*rng())*.102,sign=leaf%2?1:-1;
      const base=start.clone().lerp(end,t);base.y+=.018*Math.sin(Math.PI*t);
      const axis=tangent.clone().multiplyScalar(.22+.28*rng()).addScaledVector(sideAxis,sign*(.72+.30*rng()))
        .addScaledVector(surfaceNormal,(family===2?-.28:.12)+(rng()-.5)*.38).normalize();
      const across=new THREE.Vector3().crossVectors(surfaceNormal,axis).normalize();
      const normal=new THREE.Vector3().crossVectors(axis,across).normalize();
      const roll=(rng()-.5)*.9,q=new THREE.Quaternion().setFromAxisAngle(axis,roll);across.applyQuaternion(q);normal.applyQuaternion(q);
      base.addScaledVector(axis,.015+.018*rng());
      const length=(family===0?.145:family===1?.18:family===2?.205:.115)*(.77+.38*rng());
      const width=length*(family===0?.74:family===1?.57:family===2?.34:.72)*(.86+.23*rng());lengths.push(length);
      const rim=[[.5,0],[.035,.30],[.035,.66],[.5,1],[.965,.66],[.965,.30]],offset=positions.length/3;
      for(const [u,v]of rim){
        const p=base.clone().addScaledVector(axis,length*v).addScaledVector(across,(u-.5)*width)
          .addScaledVector(normal,.009*Math.sin(Math.PI*v)*(u===.5?1:-.25)+.006*v*v);
        positions.push(p.x,p.y,p.z);uvs.push(u,v);
      }
      indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3,offset,offset+3,offset+4,offset,offset+4,offset+5);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  g.userData={family,branches:3,leafCount:24,leafLengthRange:[Math.min(...lengths),Math.max(...lengths)],kind:'three-forked-alternate-leaf-shoots'};return g;
}

function makeTwigPatchGeometry(THREE,lod){
  const planes=lod===2?2:3,rows=[4,2,1][lod],columns=lod===0?2:1;
  const positions=[],uvs=[],indices=[];
  for(let plane=0;plane<planes;plane++){
    const angle=plane*Math.PI/planes+.17,rotation=new THREE.Quaternion().setFromEuler(
      new THREE.Euler((plane-1)*.38,angle,(plane-1)*.27));
    const base=positions.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
      const u=i/columns,t=j/rows;
      const p=new THREE.Vector3((u-.5)*1.15,(t-.5)*1.48,
        .16*Math.sin(Math.PI*t)+.13*(u-.5)*(u-.5)).applyQuaternion(rotation);
      positions.push(p.x,p.y,p.z);uvs.push(u,t);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
      const a=base+j*(columns+1)+i,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

const VARYINGS = `
attribute float liForestPatchKey;
varying float vForestPatchKey;
varying float vForestLodDistance;
uniform vec3 liForestCamera;
uniform float liForestTime;
varying vec3 vForestWorld;
varying vec2 vForestUv;
`;
const FRAGMENT = `
uniform vec3 liForestCamera;
uniform vec3 liForestSun;
varying vec3 vForestWorld;
varying vec2 vForestUv;
varying float vForestPatchKey;
varying float vForestLodDistance;
float liCanopyHash(vec3 p){
  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float liCanopyNoise(vec3 p){
  vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(mix(liCanopyHash(i),liCanopyHash(i+vec3(1,0,0)),u.x),
                 mix(liCanopyHash(i+vec3(0,1,0)),liCanopyHash(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(liCanopyHash(i+vec3(0,0,1)),liCanopyHash(i+vec3(1,0,1)),u.x),
                 mix(liCanopyHash(i+vec3(0,1,1)),liCanopyHash(i+vec3(1,1,1)),u.x),u.y),u.z);
}
vec2 liBarkPattern(vec2 uv){
  vec2 p=uv*vec2(18.,1.65);
  p.x+=.23*liCanopyNoise(vec3(uv.y*.71,uv.x*.45,4.7));
  p.y+=.17*liCanopyNoise(vec3(uv.x*3.1,uv.y*.26,9.2));
  vec2 cell=floor(p),f=fract(p);float first=20.,second=20.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y));
    vec2 q=vec2(liCanopyHash(vec3(cell+o,3.1)),liCanopyHash(vec3(cell+o,19.7)));
    vec2 d=o+.18+.64*q-f;float distance=dot(d,d);
    if(distance<first){second=first;first=distance;}else second=min(second,distance);
  }
  float edge=max(0.,sqrt(second)-sqrt(first));
  float aa=clamp(max(length(dFdx(p)),length(dFdy(p))),.012,.6);
  float crack=1.-smoothstep(.025,.10+aa*.3,edge);
  float broad=liCanopyNoise(vec3(uv.x*29.,uv.y*1.3,8.9));
  float grain=liCanopyNoise(vec3(uv.x*107.,uv.y*5.3,17.2));
  float detail=1.-smoothstep(.2,.8,aa);
  float tone=(.82+.25*broad+.055*(grain-.5)*detail)*(1.-.48*crack*detail);
  float height=(.011*(1.-crack)+.0025*(grain-.5))*detail;
  return vec2(tone,height);
}
vec2 liForestCoverage(float d){
  float nearBand=1.-smoothstep(32.,52.,d);
  float farBand=smoothstep(610.,790.,d);
  #if LI_FOREST_LEVEL == 0
    return vec2(0.,nearBand);
  #elif LI_FOREST_LEVEL == 1
    return vec2(nearBand,1.-farBand);
  #else
    return vec2(1.-farBand,1.-farBand*smoothstep(2200.,2550.,d));
  #endif
}
void liForestDiscard(){
  vec2 coverage=liForestCoverage(vForestLodDistance);
  float threshold=vForestPatchKey;
  // One stable decision belongs to the complete shoot/path. No pixel sieve,
  // wind-dependent key, opacity blending or canvas-alpha output is used.
  if(threshold<coverage.x||threshold>=coverage.y)discard;
}
`;

function patchMaterial(material, lod, uniforms, foliage, shadow = false) {
  material.defines = { ...material.defines, LI_FOREST_LEVEL: lod };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n'+VARYINGS+(foliage?'\n#ifdef USE_INSTANCING\nattribute float liForestVariant;\n#endif\n':'\nattribute vec3 liForestLodAnchor;\n'));
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      ${foliage ? `
      #ifdef USE_INSTANCING
        float liPhase=instanceMatrix[3].x*.19+instanceMatrix[3].z*.23;
        transformed.x+=.009*sin(liForestTime*1.12+liPhase+position.y*2.7)*position.y;
        transformed.z+=.006*sin(liForestTime*.83+liPhase*1.7)*position.y;
      #endif` : ''}
      vec4 liWorld=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        liWorld=instanceMatrix*liWorld;
      #endif
      vForestWorld=(modelMatrix*liWorld).xyz;
      vForestPatchKey=liForestPatchKey;
      ${foliage?`vec3 liAnchor=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz;`:`vec3 liAnchor=(modelMatrix*vec4(liForestLodAnchor,1.)).xyz;`}
      vForestLodDistance=distance(liForestCamera,liAnchor);
      vForestUv=uv;
    `);
    if(foliage)shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
      float liTile=clamp(floor(liForestVariant+.5),0.,3.);
      vec2 liAtlasOffset=vec2(mod(liTile,2.),floor(liTile*.5));
      #ifdef USE_MAP
      vMapUv=(vMapUv+liAtlasOffset)*.5;
      #endif
      #ifdef USE_NORMALMAP
      vNormalMapUv=(vNormalMapUv+liAtlasOffset)*.5;
      #endif
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n'+FRAGMENT);
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
      '#include <alphatest_fragment>\nliForestDiscard();');
    if(!shadow&&foliage){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        // Twig tone is coherent at branch scale. Fine structure belongs to
        // the generated leaflet silhouettes/normal map, not a dark noise grid.
        diffuseColor.rgb*=.95+.075*liCanopyNoise(vForestWorld*.47);
        if(!gl_FrontFacing)diffuseColor.rgb*=vec3(.95,1.,.90);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        vec3 liWN=inverseTransformDirection(normal,viewMatrix);
        float liThrough=pow(max(dot(-liWN,liForestSun)+.18,0.)/1.18,2.);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(.024,.038,.011)*liThrough;
      `);
    }else if(!shadow){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 liBarkSurface=liBarkPattern(vForestUv);
        diffuseColor.rgb*=liBarkSurface.x;
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>', `
        #include <normal_fragment_begin>
        float liBarkHeight=liBarkSurface.y;
        vec3 liBDx=dFdx(-vViewPosition),liBDy=dFdy(-vViewPosition);
        vec3 liBR1=cross(liBDy,normal),liBR2=cross(normal,liBDx);
        float liBDet=dot(liBDx,liBR1);
        normal=normalize(abs(liBDet)*normal-sign(liBDet)*(dFdx(liBarkHeight)*liBR1+dFdy(liBarkHeight)*liBR2)+normal*1e-12);
      `);
    }
  };
  material.customProgramCacheKey=()=>`li-raster-forest-stable-shoot-lod-13-${lod}-${foliage}-${shadow}`;
  return material;
}

function treeForm(THREE, tree) {
  const rng=random(tree.seed+tree.x*.00031+tree.z*.00017),R=tree.radius;
  const family=tree.architecture??Math.floor(rng()*4),age=tree.maturity??.45;
  const light=new THREE.Vector3(tree.lightX??Math.cos(tree.seed*31.7),0,tree.lightZ??Math.sin(tree.seed*31.7));
  const across=new THREE.Vector3(-light.z,0,light.x),clusters=[],leaders=[];
  const rotation=Math.atan2(light.z,light.x),crownOffset=R*[.14,.10,.58,.12][family];
  if(tree.bush){
    const arching=family===2,h=R*(arching?.70:.57),count=arching?6:5;
    const stem=new THREE.Vector3(light.x*R*.06,R*.14,light.z*R*.06);
    for(let i=0;i<count;i++){
      const a=rotation+i*2.39996+(rng()-.5)*.65,spread=R*(.23+.42*rng());
      clusters.push({center:new THREE.Vector3(Math.cos(a)*spread,h+(rng()-.5)*R*.39,Math.sin(a)*spread),
        radii:new THREE.Vector3(R*(.29+.15*rng()),R*(arching?.25:.35),R*(.28+.18*rng())),angle:a,
        weight:1,hue:rng(),shade:.91+.09*rng(),anchor:0});
    }
    if(tree.anchorMode==='sdf-surface'){
      const n=tree.sdfAnchor.normal,outward=R*.58*(1-n[1]);
      for(const c of clusters)c.center.add(new THREE.Vector3(n[0]*outward,n[1]*outward,n[2]*outward));
    }
    return {family,type:family,stem,leader:stem.clone().multiplyScalar(2.3),leaders,clusters,trunkHeight:R*.14,
      crownHeight:h,lean:light.clone().multiplyScalar(R*.10),swayAngle:rotation,trunkRadius:R*.026,rootFlare:.08};
  }
  const height=tree.height??R*([1.55+.45*age,2.30+.70*age,1.60+.40*age,1.55+.25*age][family]);
  const trunkHeight=R*([.48+.22*rng(),.95+.33*rng(),.69+.24*rng(),.71+.19*rng()][family]);
  const lean=light.clone().multiplyScalar(R*[.18,.13,.60,.12][family]*(.75+.35*rng())*(1+.40*(tree.windExposure??0)));
  const stem=lean.clone().multiplyScalar(family===2?.55:.40);stem.y=trunkHeight;
  const leader=lean.clone();leader.y=height;
  if(family===0){
    // A low fork into two unequal scaffold leaders makes a broad mature
    // crown. A central stem with the same ring of boughs is not reused here.
    for(let i=0;i<2;i++){
      const side=i?1:-1,p=leader.clone().addScaledVector(across,side*R*(.25+.13*rng()));
      p.addScaledVector(light,R*(i?.20:-.09));p.y*=i?.88:1.;
      leaders.push(p);
    }
    const count=10+Math.floor(rng()*3);
    for(let i=0;i<count;i++){
      const a=rotation+i*2.39996+(rng()-.5)*.58,reach=R*(.32+.62*Math.sqrt(rng()));
      const cx=light.x*crownOffset+Math.cos(a)*reach*1.12,cz=light.z*crownOffset+Math.sin(a)*reach;
      const level=i<2?.90:.53+.32*rng();
      clusters.push({center:new THREE.Vector3(cx,height*level,cz),
        radii:new THREE.Vector3(R*(.37+.17*rng()),R*(.22+.14*rng()),R*(.34+.18*rng())),
        angle:a,weight:i<2?1.12:1,hue:rng(),shade:.89+.11*level,anchor:i%2});
    }
  }else if(family===1){
    // A persistent high leader with unequal lateral shelves. Vertical gaps,
    // short lower boughs and a tapering top distinguish it from spreaders.
    leaders.push(leader);
    const count=7+Math.floor(rng()*3);
    for(let i=0;i<count;i++){
      const t=i/(count-1),a=rotation+i*2.39996+(rng()-.5)*.48;
      const reach=R*(.40-.19*t)*(.75+.45*rng());
      const cy=height*(.40+.55*t)+(rng()-.5)*R*.12;
      clusters.push({center:new THREE.Vector3(lean.x*.6+Math.cos(a)*reach,cy,lean.z*.6+Math.sin(a)*reach),
        radii:new THREE.Vector3(R*(.30+.12*rng())*(1-.29*t),R*(.37+.13*rng()),R*(.28+.14*rng())*(1-.26*t)),
        angle:a,weight:.85+.3*rng(),hue:rng(),shade:.89+.11*t,anchor:0});
    }
  }else if(family===2){
    // Riparian edge trees grow towards light over the channel. One scaffold
    // sweeps outwards; foliage hangs from its outer thirds, leaving a real
    // open side inside the stand instead of a symmetric canopy offset.
    const main=leader.clone().addScaledVector(light,R*.20);leaders.push(main);
    const sweep=light.clone().multiplyScalar(R*1.17);sweep.y=height*.71;leaders.push(sweep);
    const count=9+Math.floor(rng()*3);
    for(let i=0;i<count;i++){
      const fan=(rng()-.5)*2.7,a=rotation+fan;
      const reach=R*(.38+.83*rng()),outer=smooth(.42,1.13,reach/R);
      const cy=height*(.86-.28*outer)+(rng()-.5)*R*.26;
      clusters.push({center:new THREE.Vector3(light.x*R*.12+Math.cos(a)*reach,cy,light.z*R*.12+Math.sin(a)*reach),
        radii:new THREE.Vector3(R*(.31+.17*rng()),R*(.29+.16*rng()),R*(.27+.17*rng())),
        angle:a,weight:.90+.25*rng(),hue:rng(),shade:.88+.12*rng(),anchor:i%3===0?0:1});
    }
  }else{
    // Young understorey keeps a thin leader, few upward boughs and a narrow
    // lower crown. It is not an adult tree scaled down with the same fork.
    leaders.push(leader);
    const count=5+Math.floor(rng()*2);
    for(let i=0;i<count;i++){
      const t=i/(count-1),a=rotation+i*2.39996+(rng()-.5)*.5,reach=R*(.34-.16*t);
      clusters.push({center:new THREE.Vector3(lean.x*.7+Math.cos(a)*reach,height*(.48+.49*t),lean.z*.7+Math.sin(a)*reach),
        radii:new THREE.Vector3(R*(.24+.11*rng())*(1-.20*t),R*(.26+.11*rng()),R*(.23+.11*rng())*(1-.20*t)),
        angle:a,weight:1,hue:rng(),shade:.91+.09*t,anchor:0});
    }
  }
  for(const c of clusters)c.weight*=c.radii.x*c.radii.y*c.radii.z;
  const rootFlare=clamp(.10+.37*age+.18*(tree.rootExposure??.3)-.17*(tree.site?.moisture??.5),.12,.62);
  return {family,type:family,stem,leader,leaders,clusters,trunkHeight,crownHeight:height,lean,
    swayAngle:rotation,trunkRadius:R*[.052,.043,.049,.032][family],rootFlare};
}

function leafCount(tree,lod) {
  const area=tree.radius*tree.radius;
  if(tree.mountain){
    if(tree.bush)return lod===0?Math.floor(clamp(area*8,5,28)):lod===1?Math.floor(clamp(area*.65,1,4)):
      tree.radius>.65&&nativeHash(tree.x*.41,tree.z*.43)<.36?1:0;
    return Math.floor(clamp(area*[12,.55,.12][lod],[58,6,3][lod],[360,36,12][lod]));
  }
  if(tree.bush)return lod===0?Math.floor(clamp(area*12,16,150)):
    lod===1?Math.floor(clamp(area*.9,2,10)):
    tree.understory>.15&&nativeHash(tree.x*.41,tree.z*.43)<.16?1:0;
  const familyGain=[1.04,.96,1.02,.78][tree.architecture??0];
  // World-sized leaves receive density only within the 32–52m near band.
  // Distant fixed twigs carry the canopy beyond it; a small near tile avoids
  // submitting dense physical leaves for the old 230m-wide near population.
  return Math.floor(clamp(area*[24,.90,.24][lod]*familyGain,[280,15,7][lod],[2400,108,36][lod]));
}

/** Build an experimental raster forest without accessing or changing a renderer.
 * Call updateLOD(camera,timeSeconds) every frame. Its pending count reaches zero
 * after nearby spatial blocks have been built; inspect stats for actual density.
 * Call prewarm(camera) for synchronous loading-screen preparation if desired.
 */
export function createRasterForest({THREE,trees,bushes,treeGrid,bushGrid,
  rect=[-2400,-2400,4800],terrain,camera,sunDirection,chunkSize=48,
  maxDrawTriangles=150000,composeGroves=true,mountainCanopyOwns=false}={}) {
  if (!THREE?.InstancedMesh || !THREE?.MeshStandardMaterial)
    throw new Error('createRasterForest requires the shared THREE namespace');
  const group=new THREE.Group(); group.name='Li River · procedural broadleaf forest';
  const sourceRecords=[...readPlants(trees,treeGrid,rect,terrain,false),
    ...readPlants(bushes,bushGrid,rect,terrain,true)];
  const composition=composeGroves?composeForestPopulation(sourceRecords,terrain):{records:sourceRecords,removed:{trees:0,bushes:0},clearings:[]};
  const records=composition.records;
  const chunks=new Map(),builtChunks=new Set();
  for (const tree of records) for (let lod=0;lod<(tree.mountain?(mountainCanopyOwns?0:2):3);lod++) {
    // M5 can delegate every mountain tier to botanical canopy geometry. Do not also
    // allocate thousands of far twig chunks behind the same opaque canopy.
    // Fine near blocks prevent a 160m box from sending invisible near-detail
    // for hundreds of trees. Coarser far blocks retain reasonable draw count.
    const size=lod===0?16:chunkSize*(1<<lod),ix=Math.floor(tree.x/size),iz=Math.floor(tree.z/size);
    const iy=Math.floor(tree.y/Math.max(48,size*.75)),key=lod+','+ix+','+iz+','+iy+(tree.mountain?',mountain':'');
    if (!chunks.has(key)) {
      const node=new THREE.Group();node.position.set((ix+.5)*size,0,(iz+.5)*size);
      // Logical near cells cover the entire world. Empty metadata must not
      // become tens of thousands of scene nodes traversed by every render.
      node.matrixAutoUpdate=false;node.updateMatrix();
      chunks.set(key,{node,trees:[],lods:[null,null,null],lastUse:[0,0,0],lod,size,
        x:node.position.x,z:node.position.z,minY:Infinity,maxY:-Infinity,canopyPad:0,mountain:!!tree.mountain});
    }
    const chunk=chunks.get(key);chunk.trees.push(tree);
    chunk.minY=Math.min(chunk.minY,tree.y);
    chunk.maxY=Math.max(chunk.maxY,tree.y+tree.radius*3.9);
    chunk.canopyPad=Math.max(chunk.canopyPad,(tree.canopyRadius??tree.radius*1.5)+.7);
  }
  // Population and logical-cell bounds are immutable after construction.
  // Keep the exact original sphere/range values without rebuilding them for
  // every frame across the whole world's unmounted cells.
  for (const chunk of chunks.values()) {
    chunk.middleY=(chunk.minY+chunk.maxY)*.5;
    chunk.boundRadius=Math.hypot(chunk.size*.73,(chunk.maxY-chunk.minY)*.5)+(chunk.lod===0?chunk.canopyPad:24);
    chunk.rangeStart=LOD_BANDS[chunk.lod][0];
    chunk.rangeEnd=chunk.mountain&&chunk.lod===1?210:LOD_BANDS[chunk.lod][1];
  }
  const uniforms={liForestCamera:{value:new THREE.Vector3()},
    liForestTime:{value:0},liForestSun:{value:new THREE.Vector3()}};
  const direction=sunDirection ?? terrain?.sunDirection ?? {x:.52,y:.75,z:-.40};
  if (Array.isArray(direction)) uniforms.liForestSun.value.fromArray(direction).normalize();
  else uniforms.liForestSun.value.copy(direction).normalize();
  const foliageTextures=createFoliageTextures(THREE),nearLeafTextures=createFoliageTextures(THREE,{singleLeaf:true});
  const nearLeafGeometries=[0,1,2,3].map(family=>makeIndividualLeafGeometry(THREE,family));
  const leafGeometries=[nearLeafGeometries[0],makeTwigPatchGeometry(THREE,1),makeTwigPatchGeometry(THREE,2)];
  const foliageMaterials=[0,1,2].map(lod=>patchMaterial(new THREE.MeshLambertMaterial({
    color:0xffffff,side:THREE.DoubleSide,
    map:lod===0?nearLeafTextures.map:foliageTextures.map,normalMap:lod===0?nearLeafTextures.normalMap:foliageTextures.normalMap,
    normalScale:new THREE.Vector2(.46,.46),alphaTest:.45,alphaToCoverage:false,transparent:false}),lod,uniforms,true));
  const branchMaterials=[0,1].map(lod=>patchMaterial(new THREE.MeshLambertMaterial({
    color:0xffffff,vertexColors:true}),lod,uniforms,false));
  const depths=[0,1,2].map(lod=>patchMaterial(new THREE.MeshDepthMaterial({
    depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide,
    map:lod===0?nearLeafTextures.map:foliageTextures.map,alphaTest:.45,alphaToCoverage:false}),lod,uniforms,true,true));
  const branchDepths=[0,1].map(lod=>patchMaterial(new THREE.MeshDepthMaterial({
    depthPacking:THREE.RGBADepthPacking}),lod,uniforms,false,true));
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  const quaternion=new THREE.Quaternion(),spin=new THREE.Quaternion(),euler=new THREE.Euler(),up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
  const color=new THREE.Color(),viewPosition=new THREE.Vector3();
  const sphere=new THREE.Sphere(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  const stats={trees:records.filter(t=>!t.bush).length,bushes:records.filter(t=>t.bush).length,
    mountainTrees:records.filter(t=>t.mountain&&!t.bush).length,mountainBushes:records.filter(t=>t.mountain&&t.bush).length,
    chunks:chunks.size,mountedChunks:0,meshes:0,sprigs:[0,0,0],leafBlades:[0,0,0],crownVolumes:[0,0,0],branchSegments:0,visibleRootPaths:0,
    triangles:[0,0,0],branchTriangles:0,totalTriangles:0,submittedTriangles:0,
    mountainRenderingDelegated:mountainCanopyOwns,mainViewCastTriangles:0,maxDrawTriangles:0,maxDrawInstances:0,drawBudget:maxDrawTriangles,
    clearedTrees:composition.removed.trees,clearedBushes:composition.removed.bushes,
    clearingCenters:composition.clearings.map(c=>[c.x,c.z]),
    foliagePatches:[0,0,0],groundCoverPatches:0,generatedTextureCount:4,generatedAtlasSize:foliageTextures.size,
    leafletsPerPatch:[24,foliageTextures.leafletsPerPatch,foliageTextures.leafletsPerPatch],foliageMode:'world-sized-four-family-near-leaves-and-matching-forked-shoot-atlases',
    nearLeafArchitecture:nearLeafGeometries.map(g=>({...g.userData})),nearLeafBand:[32,52],nearTileSize:16,lodCoverage:'stable-whole-shoot-hash-with-shared-anchors',
    pending:0,buildMs:0,cacheClock:'monotonic-wall-time',invisibleCacheSeconds:8,mountainFarCanopy:true,revision:'m4-sdf-rooted-habitat-forest-1',ecology:composition.stats??null,familyNames:TREE_FAMILIES.slice()};
  let disposed=false,lastEviction=0;

  function branchPaths(tree,form,lod) {
    const paths=[],R=tree.radius,ground=tree.anchorMode==='sdf-surface'?tree.sdfAnchor.position[1]:terrain?.sampleHeight?.(tree.x,tree.z);
    const rootY=Number.isFinite(ground)?ground-tree.y:0,rng=random(tree.seed+1009.37);
    const addPath=(start,end,radius,steps,bend,{flatten=1,endRadius=radius*.14,flare=0}={})=>{
      if(start.distanceToSquared(end)<R*R*.00005)return;
      const points=[],radii=[];
      for(let i=0;i<=steps;i++){
        const t=i/steps,p=new THREE.Vector3().lerpVectors(start,end,t);
        p.y+=Math.sin(Math.PI*t)*bend;
        p.x+=Math.sin(Math.PI*t)*R*.040*Math.cos(form.swayAngle);
        p.z+=Math.sin(Math.PI*t)*R*.040*Math.sin(form.swayAngle);
        points.push(p);radii.push(mix(radius,endRadius,Math.pow(t,.83))+radius*flare*Math.exp(-t*15));
      }
      paths.push({points,radii,flatten});
    };
    if(tree.bush){
      if(lod>0||R<.8)return paths;
      const leader=form.clusters[0].center.clone().multiplyScalar(.74);
      addPath(new THREE.Vector3(0,rootY-.07,0),leader,R*.024,3,R*.035);
      for(let i=0;i<Math.min(2,form.clusters.length);i++)
        addPath(leader.clone().multiplyScalar(.58),form.clusters[i].center,R*.009,3,R*.06);
      return paths;
    }
    const base=new THREE.Vector3(0,rootY-.19,0),fork=form.stem.clone(),leaders=form.leaders;
    fork.y=Math.max(fork.y,rootY+R*.35);
    if(form.family===0){
      addPath(base,fork,form.trunkRadius,lod===0?6:4,R*.04,{endRadius:form.trunkRadius*.62,flare:form.rootFlare});
      for(let i=0;i<leaders.length;i++)
        addPath(fork,leaders[i],form.trunkRadius*(i?.48:.58),lod===0?7:4,R*.11);
    }else if(form.family===2){
      addPath(base,leaders[0],form.trunkRadius,lod===0?10:5,R*.07,{endRadius:form.trunkRadius*.12,flare:form.rootFlare});
      addPath(fork.clone().multiplyScalar(.88),leaders[1],form.trunkRadius*.48,lod===0?7:4,R*.15);
    }else{
      addPath(base,leaders[0],form.trunkRadius,lod===0?10:5,R*.06,{endRadius:form.trunkRadius*.10,flare:form.rootFlare});
    }
    if(lod===0&&form.family!==3&&tree.anchorMode!=='sdf-surface'){
      const site=tree.site,exposure=tree.rootExposure??.25;
      // Most roots remain below humus. The occasional visible root follows
      // the sampled slope, emerges briefly near the collar and re-enters soil.
      // No evenly spaced complete radial star is built around every tree.
      const count=exposure>.24&&rng()<exposure+.12?1+(rng()<.46&&exposure>.45?1:0)+(rng()<.14&&exposure>.65?1:0):0;
      const slopeAngle=site&&site.slope>.08?Math.atan2(site.gz,site.gx):form.swayAngle+Math.PI*.65;
      for(let i=0;i<count;i++){
        const angle=(i===0&&site?.slope>.13?slopeAngle:form.swayAngle+(rng()-.5)*4.7)+(rng()-.5)*.8;
        const length=R*(.14+.20*rng())*(.8+.4*exposure),bend=(rng()-.5)*R*.09;
        const steps=5,points=[],radii=[];let valid=true;
        for(let j=0;j<=steps;j++){
          const t=j/steps,a=angle+.22*Math.sin(t*Math.PI+tree.seed*3.1);
          const xx=Math.cos(a)*length*t-Math.sin(angle)*bend*Math.sin(Math.PI*t),
            zz=Math.sin(a)*length*t+Math.cos(angle)*bend*Math.sin(Math.PI*t);
          const yy=terrain?.sampleHeight?.(tree.x+xx,tree.z+zz);
          if(!Number.isFinite(yy)||Math.abs(yy-ground)>Math.max(.8,R*.42)){valid=false;break;}
          const emergence=(R*.055+.08)*Math.exp(-t*4.5)*(exposure+.3);
          points.push(new THREE.Vector3(xx,yy-tree.y-.055+emergence,zz));
          radii.push(R*(.023+.008*rng())*(.055+.945*Math.pow(1-t,1.2)));
        }
        if(valid)paths.push({points,radii,flatten:.62,root:true});
      }
    }
    for(let i=0;i<form.clusters.length;i++){
      if(lod===1&&i%3!==0)continue;
      const c=form.clusters[i],leader=leaders[c.anchor??0]??form.leader;
      const attachment=clamp((c.center.y-fork.y)/Math.max(.1,leader.y-fork.y)*.67,.10,.87);
      let start;
      if(form.family===0)start=new THREE.Vector3().lerpVectors(fork,leader,attachment);
      else if(form.family===2&&c.anchor===1)start=new THREE.Vector3().lerpVectors(fork.clone().multiplyScalar(.88),leader,.32+attachment*.54);
      else start=leader.clone().multiplyScalar(clamp(c.center.y/Math.max(.1,leader.y)*.72,.27,.93));
      const end=c.center.clone();end.y-=c.radii.y*(form.family===2?.13:.22);
      const radius=R*[.019,.014,.017,.009][form.family]*(i===0?1.14:1);
      addPath(start,end,radius,lod===0?6:3,R*(form.family===2?.13:.09));
      if(lod===0&&i<2&&form.family!==3){
        const tip=end.clone().add(new THREE.Vector3(Math.cos(c.angle)*c.radii.x*.54,c.radii.y*.18,Math.sin(c.angle)*c.radii.z*.54));
        addPath(end,tip,R*.0055,3,R*.018);
      }
    }
    return paths;
  }

  function buildBranchBatches(records,lod,chunk,node){
    const sides=lod===0?10:6,batches=[];let batch=[],triangles=0,totalSegments=0;
    const pathTriangles=path=>(path.points.length-1)*sides*2;
    for(const record of records){
      const n=pathTriangles(record.path);
      if(batch.length&&triangles+n>maxDrawTriangles){batches.push(batch);batch=[];triangles=0;}
      batch.push(record);triangles+=n;totalSegments+=record.path.points.length-1;
    }
    if(batch.length)batches.push(batch);
    let totalTriangles=0;
    for(const records of batches){
      const positions=[],uvs=[],colors=[],indices=[],seams=[],patchKeys=[],lodAnchors=[];
      for(const {tree,path} of records){
        let normal=new THREE.Vector3(1,0,0),distance=0;
        const base=positions.length/3,colour=.83+nativeHash(tree.seed,tree.seed*.31)*.22;
        const bark=FAMILY_BARK_TONES[tree.architecture??0];
        const end=path.points[path.points.length-1],anchor=path.points[0].clone().lerp(end,.5);
        const patchKey=Math.min(.999999,nativeHash(tree.seed*31.7+end.x*.41+end.y*.7,end.z*.37+tree.seed*.73));
        anchor.x+=tree.x-chunk.x;anchor.y+=tree.y;anchor.z+=tree.z-chunk.z;
        for(let ring=0;ring<path.points.length;ring++){
          const p=path.points[ring],before=path.points[Math.max(0,ring-1)],after=path.points[Math.min(path.points.length-1,ring+1)];
          const tangent=after.clone().sub(before).normalize();
          normal.addScaledVector(tangent,-normal.dot(tangent));
          if(normal.lengthSq()<1e-8)normal.set(0,0,1).addScaledVector(tangent,-tangent.z);
          normal.normalize();const binormal=new THREE.Vector3().crossVectors(tangent,normal).normalize();
          if(ring)distance+=p.distanceTo(path.points[ring-1]);
          const radius=path.radii[ring];
          for(let j=0;j<=sides;j++){
            const angle=j/sides*TAU;
            const flutes=1+.065*Math.sin(angle*5+tree.seed*17)+.035*Math.cos(angle*9+distance*.7);
            const radial=normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal,Math.sin(angle));
            const x=p.x+radial.x*radius*flutes,z=p.z+radial.z*radius*flutes,
              y=p.y+radial.y*radius*flutes*path.flatten;
            positions.push(tree.x-chunk.x+x,tree.y+y,tree.z-chunk.z+z);
            uvs.push(angle*path.radii[0],distance);
            colors.push(bark[0]*colour,bark[1]*colour,bark[2]*colour);
            patchKeys.push(patchKey);lodAnchors.push(anchor.x,anchor.y,anchor.z);
          }
          seams.push([base+ring*(sides+1),base+ring*(sides+1)+sides]);
        }
        for(let ring=0;ring<path.points.length-1;ring++)for(let j=0;j<sides;j++){
          const a=base+ring*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);
        }
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.setAttribute('liForestPatchKey',new THREE.Float32BufferAttribute(patchKeys,1));
      geometry.setAttribute('liForestLodAnchor',new THREE.Float32BufferAttribute(lodAnchors,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const normals=geometry.attributes.normal;
      for(const [a,b]of seams){const x=normals.getX(a)+normals.getX(b),y=normals.getY(a)+normals.getY(b),z=normals.getZ(a)+normals.getZ(b),n=Math.hypot(x,y,z)||1;
        normals.setXYZ(a,x/n,y/n,z/n);normals.setXYZ(b,x/n,y/n,z/n);}
      geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,branchMaterials[lod]);
      mesh.name='Continuous tapered bark tubes';mesh.castShadow=true;mesh.receiveShadow=true;mesh.customDepthMaterial=branchDepths[lod];
      mesh.matrixAutoUpdate=false;mesh.updateMatrix();
      mesh.userData.ownedGeometry=true;node.add(mesh);totalTriangles+=indices.length/3;
    }
    return {triangles:totalTriangles,segments:totalSegments,roots:records.filter(r=>r.path.root).length};
  }

  function buildChunk(chunk,lod) {
    const started=performance.now(),forms=chunk.trees.map(t=>treeForm(THREE,t));
    const counts=chunk.trees.map(t=>leafCount(t,lod));
    const total=counts.reduce((a,b)=>a+b,0);
    const node=new THREE.Group();node.name=`forest-leaf-lod-${lod}`;node.matrixAutoUpdate=false;node.updateMatrix();
    const leafTriangles=leafGeometries[lod].index.count/3;
    const leafLimit=Math.max(1,Math.floor(maxDrawTriangles/leafTriangles));
    const familyTotals=lod===0?[0,0,0,0]:[total];
    if(lod===0)for(let t=0;t<chunk.trees.length;t++)familyTotals[chunk.trees[t].architecture??forms[t].family]+=counts[t];
    const familyBatches=familyTotals.map(()=>[]),leafIndices=familyTotals.map(()=>0),leafBatches=[];
    for(let family=0;family<familyTotals.length;family++)for(let offset=0;offset<familyTotals[family];offset+=leafLimit){
      const count=Math.min(leafLimit,familyTotals[family]-offset),baseGeometry=lod===0?nearLeafGeometries[family]:leafGeometries[lod],leafGeometry=baseGeometry.clone();
      leafGeometry.setAttribute('liForestVariant',new THREE.InstancedBufferAttribute(new Float32Array(count),1));
      leafGeometry.setAttribute('liForestPatchKey',new THREE.InstancedBufferAttribute(new Float32Array(count),1));
      const mesh=new THREE.InstancedMesh(leafGeometry,foliageMaterials[lod],count);mesh.userData.ownedGeometry=true;
      mesh.matrixAutoUpdate=false;mesh.updateMatrix();
      mesh.name=lod===0?`alternate-forked-leaf-shoots-family-${family}`:`fixed-curved-twigs-${lod}`;
      mesh.castShadow=lod<2;mesh.receiveShadow=true;mesh.customDepthMaterial=depths[lod];
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);familyBatches[family].push(mesh);leafBatches.push(mesh);node.add(mesh);
    }
    const allBranches=lod<2?[]:null;
    for (let t=0;t<chunk.trees.length;t++) {
      const tree=chunk.trees[t],form=forms[t],rng=random(tree.seed+19.3);
      const clusters=form.clusters,weight=clusters.reduce((s,c)=>s+c.weight,0);
      const distribution=[];let sum=0;
      for (const c of clusters) {sum+=c.weight/weight;distribution.push(sum);}
      if (allBranches) for (const path of branchPaths(tree,form,lod)) allBranches.push({tree,path});
      for (let j=0;j<counts[t];j++) {
        // Every branch head receives leaves even at the far LOD. Remaining
        // sprigs occupy real crown volume, rather than a shell or flat layer.
        const selector=rng();
        let pick=j<clusters.length?j:distribution.findIndex(w=>w>selector);
        if (pick<0) pick=clusters.length-1;
        const c=clusters[pick],az=rng()*TAU,vertical=rng()*2-1;
        // Most foliage lives on connected outer boughs, with a smaller inner
        // population. Uniform volume filling made close crowns look dusty.
        const radial=rng()<.68?.58+.40*rng():.16+.62*rng();
        const horizontal=Math.sqrt(1-vertical*vertical);
        const localX=Math.cos(az)*horizontal*radial*c.radii.x;
        const localY=vertical*radial*c.radii.y;
        const localZ=Math.sin(az)*horizontal*radial*c.radii.z;
        position.set(tree.x-chunk.x+c.center.x+localX,tree.y+c.center.y+localY,
          tree.z-chunk.z+c.center.z+localZ);
        // Short shoots follow their actual bough/crown direction. Restricting
        // every patch to a small upright Euler jitter made parallel feathers.
        delta.set(c.center.x+localX*.55-form.lean.x*.35,
          tree.radius*(form.family===2?-.10:.12)+localY*.25,
          c.center.z+localZ*.55-form.lean.z*.35);
        if(delta.lengthSq()<.001)delta.set(Math.cos(az),.2,Math.sin(az));delta.normalize();
        quaternion.setFromUnitVectors(up,delta);quaternion.multiply(spin.setFromAxisAngle(up,rng()*TAU));
        const bladeScale=lod===0?(.88+.22*rng())*(tree.bush?.78:1)
          :([1,2.22,3.65][lod])*(.84+.31*rng())*clamp(Math.sqrt(tree.radius/5),.72,1.22)*(tree.bush?.56:1);
        scale.set(bladeScale*(.88+.22*rng()),bladeScale,bladeScale);
        if(tree.bush&&lod>0){
          const under=tree.understory??0;
          scale.multiplyScalar(1.15+.30*under);
        }
        const batchFamily=lod===0?(tree.architecture??form.family):0,leafIndex=leafIndices[batchFamily]++;
        const leaves=familyBatches[batchFamily][Math.floor(leafIndex/leafLimit)],localIndex=leafIndex%leafLimit;
        matrix.compose(position,quaternion,scale);leaves.setMatrixAt(localIndex,matrix);
        leaves.geometry.attributes.liForestVariant.setX(localIndex,tree.architecture??form.family);
        leaves.geometry.attributes.liForestPatchKey.setX(localIndex,Math.min(.999999,nativeHash(tree.seed*31.7+j*1.17,tree.seed*.73+j*2.31)));
        // Linear values: muted olive laurel/broadleaf, warm young tips and
        // darker internal foliage. No saturated emissive green canopy.
        const tip=smooth(-.35,.8,vertical)*(.7+.3*rng());
        const variation=.87+.24*rng(),tone=c.hue;
        color.setRGB((.058+.045*tip+.016*tone)*variation,
          (.105+.060*tip+.023*tone)*variation,(.027+.024*tip+.009*tone)*variation);
        color.multiplyScalar(tree.bush?.86+.08*(1-(tree.understory??0))
          :(lod===0?1:c.shade)*(.96+.08*(1-(tree.maturity??.4))));
        const familyTint=FAMILY_LEAF_TINTS[tree.architecture??0];
        color.r*=familyTint[0];color.g*=familyTint[1];color.b*=familyTint[2];
        leaves.setColorAt(localIndex,color);
      }
    }
    for (const leaves of leafBatches) {
      leaves.instanceMatrix.needsUpdate=true;leaves.geometry.attributes.liForestVariant.needsUpdate=true;leaves.geometry.attributes.liForestPatchKey.needsUpdate=true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate=true;
      leaves.computeBoundingSphere();
    }
    const branchBuild=allBranches?.length?buildBranchBatches(allBranches,lod,chunk,node):{triangles:0,segments:0,roots:0};
    stats.branchSegments+=branchBuild.segments;stats.visibleRootPaths+=branchBuild.roots;
    const groundPatches=0,groundTriangles=0;
    if(!chunk.node.parent)group.add(chunk.node);
    chunk.node.add(node);chunk.lods[lod]=node;builtChunks.add(chunk);stats.mountedChunks=builtChunks.size;
    node.userData.sprigs=total;node.userData.branches=branchBuild.segments;node.userData.rootPaths=branchBuild.roots;
    node.userData.groundPatches=groundPatches;stats.groundCoverPatches+=groundPatches;
    node.userData.triangles=total*leafTriangles+groundTriangles;
    node.userData.branchTriangles=branchBuild.triangles;
    stats.sprigs[lod]+=total;
    stats.foliagePatches[lod]+=total;
    stats.triangles[lod]+=node.userData.triangles;stats.branchTriangles+=node.userData.branchTriangles;
    stats.totalTriangles+=node.userData.triangles+node.userData.branchTriangles;
    for (const mesh of node.children) {
      mesh.userData.triangles=(mesh.isInstancedMesh?mesh.count:1)*mesh.geometry.index.count/3;
      stats.maxDrawTriangles=Math.max(stats.maxDrawTriangles,mesh.userData.triangles);
      stats.maxDrawInstances=Math.max(stats.maxDrawInstances,mesh.isInstancedMesh?mesh.count:1);
    }
    stats.meshes+=node.children.length;stats.buildMs+=performance.now()-started;
  }

  function releaseChunk(chunk,lod) {
    const node=chunk.lods[lod];if (!node) return;
    for (const mesh of node.children) {mesh.dispose?.();if(mesh.userData.ownedGeometry)mesh.geometry.dispose();}
    chunk.node.remove(node);chunk.lods[lod]=null;
    if(!chunk.lods.some(Boolean)){chunk.node.removeFromParent();builtChunks.delete(chunk);stats.mountedChunks=builtChunks.size;}
    stats.sprigs[lod]-=node.userData.sprigs;
    stats.groundCoverPatches-=node.userData.groundPatches;
    stats.foliagePatches[lod]-=node.userData.sprigs;
    stats.triangles[lod]-=node.userData.triangles;
    stats.branchTriangles-=node.userData.branchTriangles;
    stats.totalTriangles-=node.userData.triangles+node.userData.branchTriangles;
    stats.branchSegments-=node.userData.branches;stats.visibleRootPaths-=node.userData.rootPaths;stats.meshes-=node.children.length;
  }

  function updateLOD(nextCamera=camera,time=performance.now()*.001,{maxBuilds=3}={}) {
    if (disposed) return stats;
    if (!nextCamera?.position) throw new Error('Forest updateLOD requires a THREE camera');
    // Film time may pause or seek backwards. Cache expiry must not inherit it.
    const cacheTime=performance.now()*.001;
    nextCamera.updateMatrixWorld?.();nextCamera.getWorldPosition(viewPosition);
    uniforms.liForestCamera.value.copy(viewPosition);uniforms.liForestTime.value=time;
    projection.multiplyMatrices(nextCamera.projectionMatrix,nextCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    const pending=[];
    for (const chunk of chunks.values()) {
      sphere.center.set(chunk.x,chunk.middleY,chunk.z);
      sphere.radius=chunk.boundRadius;
      const distance=sphere.center.distanceTo(viewPosition),near=Math.max(0,distance-sphere.radius);
      const lod=chunk.lod,rangeEnd=chunk.rangeEnd;
      // Range rejection is exact and has no scene side effects. Distant
      // cells still follow the same visibility and eviction path below.
      const wanted=near<rangeEnd&&distance+sphere.radius>chunk.rangeStart&&frustum.intersectsSphere(sphere);
      if (chunk.lods[lod]) chunk.lods[lod].visible=wanted;
      if (wanted) {
        chunk.lastUse[lod]=cacheTime;
        if (!chunk.lods[lod]) pending.push({chunk,lod,priority:near+lod*28});
      } else if (cacheTime-lastEviction>.5 && chunk.lods[lod]
        && cacheTime-chunk.lastUse[lod]>(near>rangeEnd*1.5?3:8)) releaseChunk(chunk,lod);
    }
    pending.sort((a,b)=>a.priority-b.priority);
    const count=Math.min(pending.length,maxBuilds);
    for (let i=0;i<count;i++) buildChunk(pending[i].chunk,pending[i].lod);
    // This is geometry submitted after the same sphere/frustum test THREE
    // performs, not an FPS estimate from command queue submission time.
    stats.submittedTriangles=0;stats.mainViewCastTriangles=0;
    stats.maxDrawTriangles=0;stats.maxDrawInstances=0;
    group.updateMatrixWorld();
    for (const chunk of builtChunks) {
      const node=chunk.lods[chunk.lod];if (!node) continue;
      for (const mesh of node.children) {
        stats.maxDrawTriangles=Math.max(stats.maxDrawTriangles,mesh.userData.triangles);
        stats.maxDrawInstances=Math.max(stats.maxDrawInstances,mesh.isInstancedMesh?mesh.count:1);
        if (!group.visible||!node.visible||!mesh.visible) continue;
        sphere.copy(mesh.boundingSphere||mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
        if (!frustum.intersectsSphere(sphere)) continue;
        stats.submittedTriangles+=mesh.userData.triangles;
        if (mesh.castShadow) stats.mainViewCastTriangles+=mesh.userData.triangles;
      }
    }
    stats.pending=pending.length-count;
    if (cacheTime-lastEviction>.5) lastEviction=cacheTime;
    return stats;
  }

  function dispose() {
    if (disposed) return;
    disposed=true;
    for (const chunk of builtChunks) for (let lod=0;lod<3;lod++) releaseChunk(chunk,lod);
    for (const resource of [...leafGeometries,...nearLeafGeometries.slice(1),...foliageMaterials,
      ...branchMaterials,...depths,...branchDepths]) resource.dispose();
    foliageTextures.map.dispose();foliageTextures.normalMap.dispose();nearLeafTextures.map.dispose();nearLeafTextures.normalMap.dispose();
    chunks.clear();group.clear();group.removeFromParent();
  }

  return {group,updateLOD,dispose,stats,materials:[...foliageMaterials,...branchMaterials],getPopulation:()=>records,
    prewarm:(nextCamera=camera,time=performance.now()*.001)=>updateLOD(nextCamera,time,{maxBuilds:Infinity}),
    setSunDirection:value=>{if (Array.isArray(value)) uniforms.liForestSun.value.fromArray(value).normalize();
      else uniforms.liForestSun.value.copy(value).normalize();},
    userData:{kind:'experimental-raster-forest',nativePlacement:false,sourceHabitatRetained:true,externalAssets:false,
      validation:'CPU construction and syntax only; rendered acceptance outstanding'}};
}
