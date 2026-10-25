import * as THREE from 'three';

const ACTIVE=new WeakMap();
const TREE_TOKENS=new Set(['SPACE06_Bark','SPACE06_Leaf','SPACE06_LeafLight','SPACE06_LeafShade']);
const tokens=material=>(material?.name??'').split(' / ').map(s=>s.trim());
const treeMaterial=material=>tokens(material).some(token=>TREE_TOKENS.has(token));
const retiredGrassMaterial=material=>tokens(material).some(token=>/^SPACE06_Grass(?:Shade|Dry)?$/.test(token));
const groundMaterial=material=>tokens(material).some(token=>token==='soil'||token==='EXT_B02_DampMineralGround'||/^SPACE06_Grass(?:Shade|Dry)?$/.test(token));
const seeded=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const between=(random,a,b)=>a+(b-a)*random();

const LEAF_CUTOFF=.35;
function alphaStatistics(data,width,height,cutoff=LEAF_CUTOFF){
  let sum=0,covered=0,nonzero=0;
  for(let i=3;i<data.length;i+=4){const alpha=data[i]/255;sum+=alpha;covered+=alpha>=cutoff?1:0;nonzero+=alpha>0?1:0;}
  const count=width*height;return {width,height,coverage:covered/count,meanAlpha:sum/count,nonzero:nonzero/count};
}

function preserveLeafMips(baseImage){
  const target=alphaStatistics(baseImage.data,baseImage.width,baseImage.height).coverage;
  const levels=[{data:new Uint8Array(baseImage.data),width:baseImage.width,height:baseImage.height}],records=[];
  records.push({...alphaStatistics(levels[0].data,levels[0].width,levels[0].height),unscaledCoverage:target,alphaScale:1});
  // RGB is averaged with alpha weighting, so empty black texels do not produce
  // dark halos. Mip alpha is rescaled to retain the base alpha-test coverage.
  let raw={data:new Uint8Array(baseImage.data),width:baseImage.width,height:baseImage.height};
  while(raw.width>1||raw.height>1){
    const width=Math.max(1,raw.width>>1),height=Math.max(1,raw.height>>1),data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let alpha=0,red=0,green=0,blue=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const index=(Math.min(raw.height-1,y*2+dy)*raw.width+Math.min(raw.width-1,x*2+dx))*4,a=raw.data[index+3];
        alpha+=a;red+=raw.data[index]*a;green+=raw.data[index+1]*a;blue+=raw.data[index+2]*a;
      }
      const index=(y*width+x)*4;data[index]=alpha?Math.round(red/alpha):0;data[index+1]=alpha?Math.round(green/alpha):0;
      data[index+2]=alpha?Math.round(blue/alpha):0;data[index+3]=Math.round(alpha/4);
    }
    const before=alphaStatistics(data,width,height),alphas=[];
    for(let i=3;i<data.length;i+=4)alphas.push(data[i]);alphas.sort((a,b)=>b-a);
    const wanted=Math.max(1,Math.min(alphas.length,Math.round(target*alphas.length))),edge=alphas[wanted-1]??0;
    const next=alphas[wanted]??edge,mid=edge===next?edge:(edge+next)*.5;
    const scale=target>0&&mid>0?(LEAF_CUTOFF*255+.75)/mid:1,scaled=new Uint8Array(data);
    for(let i=3;i<scaled.length;i+=4)scaled[i]=Math.min(255,Math.round(scaled[i]*scale));
    // A sub-pixel sprig eventually has only one texel. Keep this endpoint above
    // the cutoff; it is smaller than one screen pixel, never a visible rectangle.
    if(width===1&&height===1&&target>0)scaled[3]=Math.max(scaled[3],Math.round(.56*255));
    records.push({...alphaStatistics(scaled,width,height),unscaledCoverage:before.coverage,unscaledMeanAlpha:before.meanAlpha,alphaScale:scale});
    levels.push({data:scaled,width,height});raw={data,width,height};
  }
  return {levels,records};
}

function makeLeafAtlas(renderer){
  const doc=renderer?.domElement?.ownerDocument??globalThis.document;
  if(!doc?.createElement)throw new Error('SPACE09 foliage needs a browser Canvas for its locally generated leaf alpha atlas.');
  const canvas=doc.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D is unavailable.');
  function drawSprig(lengthScale,widthScale){
  ctx.clearRect(0,0,256,256);
  // A small sprig of individual pointed leaves, with broad transparent gaps.
  // No noise dots or filled elliptical silhouette is used as a canopy card.
  ctx.strokeStyle='#7f895e';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(128,235);ctx.quadraticCurveTo(112,138,136,24);ctx.stroke();
  const leaves=[[-1,189,58,31],[1,170,65,33],[-1,137,68,35],[1,111,64,31],[-1,81,54,26],[1,57,43,22]];
  leaves.forEach(([side,y,originalLength,originalWidth],index)=>{
    const length=originalLength*lengthScale,width=originalWidth*widthScale;
    const rootX=124+(145-y)*.035,tipX=rootX+side*length,tipY=y-length*.48;
    ctx.fillStyle=['#c8d0a7','#d4d7b1','#bdcba1'][index%3];
    ctx.beginPath();ctx.moveTo(rootX,y);
    ctx.bezierCurveTo(rootX+side*length*.22,y-width,tipX-side*length*.22,tipY-width*.28,tipX,tipY);
    ctx.bezierCurveTo(tipX-side*length*.30,tipY+width*.60,rootX+side*length*.18,y+width*.28,rootX,y);ctx.fill();
    ctx.strokeStyle='#a8b68e';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(rootX,y);ctx.quadraticCurveTo(rootX+side*length*.45,y-length*.17,tipX,tipY);ctx.stroke();
  });
  ctx.fillStyle='#cbd3aa';ctx.beginPath();ctx.moveTo(131,63);ctx.bezierCurveTo(113,47,122,23,139,10);ctx.bezierCurveTo(149,32,151,48,131,63);ctx.fill();
  }
  drawSprig(1,1);
  const originalImage=ctx.getImageData(0,0,256,256),baseline=alphaStatistics(originalImage.data,256,256,.43);
  drawSprig(1.30,1.35);
  const dense=ctx.getImageData(0,0,256,256);let left=256,top=256,right=-1,bottom=-1;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(dense.data[(y*256+x)*4+3]>3){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const finalImage={width:256,height:256,data:new Uint8Array(256*256*4)};
  if(right>=left){
    left=Math.max(0,left-5);top=Math.max(0,top-5);right=Math.min(255,right+5);bottom=Math.min(255,bottom+5);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const sx=left+(x+.5)*(right-left+1)/256-.5,sy=top+(y+.5)*(bottom-top+1)/256-.5,
        ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      let a=0,r=0,g=0,b=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const weight=(dx?fx:1-fx)*(dy?fy:1-fy),index=(Math.max(0,Math.min(255,iy+dy))*256+Math.max(0,Math.min(255,ix+dx)))*4,
          alpha=dense.data[index+3]*weight;
        a+=alpha;r+=dense.data[index]*alpha;g+=dense.data[index+1]*alpha;b+=dense.data[index+2]*alpha;
      }
      const index=(y*256+x)*4;finalImage.data[index]=a?Math.round(r/a):0;finalImage.data[index+1]=a?Math.round(g/a):0;
      finalImage.data[index+2]=a?Math.round(b/a):0;finalImage.data[index+3]=Math.round(a);
    }
  }
  const {levels,records}=preserveLeafMips(finalImage);
  const texture=new THREE.DataTexture(levels[0].data,256,256,THREE.RGBAFormat,THREE.UnsignedByteType);texture.name='SPACE09_local_leaf_sprig_alpha';
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.mipmaps=levels;texture.flipY=true;texture.needsUpdate=true;
  texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()??1,4);
  texture.userData={alphaStatistics:{baselineAtOldCutoff:baseline,finalAtCurrentCutoff:records[0],
    croppedSourceBounds:[left,top,right,bottom],cutoff:LEAF_CUTOFF,mipLevels:records,
    method:'Actual Canvas ImageData; pointed leaves enlarged 30%/35%, transparent margins cropped. Explicit alpha-weighted RGB box mips with coverage-preserving alpha scale.'}};
  return texture;
}

function createBranchBatch(){
  const chunks=[];const up=new THREE.Vector3(0,1,0);
  return {
    add(a,b,r0,r1,sides=5){
      const length=a.distanceTo(b);if(length<.002)return;
      const geometry=new THREE.CylinderGeometry(r1,r0,length,sides,1,false).toNonIndexed();
      const rotation=new THREE.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize());
      geometry.applyQuaternion(rotation);geometry.translate(...a.clone().add(b).multiplyScalar(.5).toArray());chunks.push(geometry);
    },
    finish(){
      const count=chunks.reduce((sum,g)=>sum+g.attributes.position.count,0),positions=new Float32Array(count*3),normals=new Float32Array(count*3);let cursor=0;
      for(const g of chunks){positions.set(g.attributes.position.array,cursor);normals.set(g.attributes.normal.array,cursor);cursor+=g.attributes.position.array.length;g.dispose();}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
    },
    get vertexCount(){return chunks.reduce((sum,g)=>sum+g.attributes.position.count,0);},
  };
}

function measureCards(cards,start,end){
  const box=new THREE.Box3();const corner=new THREE.Vector3();
  for(let i=start;i<end;i++)for(const x of [-.5,.5])for(const y of [-.5,.5])box.expandByPoint(corner.set(x,y,0).applyMatrix4(cards[i].matrix));
  return {min:box.min.toArray(),max:box.max.toArray()};
}

function createTreeGeometry(sourceTrees){
  const branchBatch=createBranchBatch(),cards=[],trees=[];
  const leafNormal=new THREE.Vector3(0,0,1),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
  for(let index=0;index<sourceTrees.length;index++){
    const source=sourceTrees[index],random=seeded(90217+index*413),x=source.x,z=-source.blender_y,base=source.base_z,h=source.height,r=source.trunk_radius;
    const origin=new THREE.Vector3(x,base,z),branchStart=branchBatch.vertexCount,cardStart=cards.length;
    const lean=new THREE.Vector3(between(random,-.14,.14),0,between(random,-.14,.14));
    const trunk=[origin.clone().add(new THREE.Vector3(0,-.025,0)),origin.clone().add(new THREE.Vector3(.014,.95,-.012)),
      origin.clone().add(new THREE.Vector3(.025,2.39,-.018)),origin.clone().add(lean.clone().multiplyScalar(.58)).add(new THREE.Vector3(0,h*.68,0)),
      origin.clone().add(lean).add(new THREE.Vector3(0,h*.91,0))];
    const radii=[r*1.20,r*.84,r*.62,r*.40,.024];
    for(let i=1;i<trunk.length;i++)branchBatch.add(trunk[i-1],trunk[i],radii[i-1],radii[i],7);
    const branchPoints=trunk.map(p=>p.clone());
    const original=source.crown_bounds;
    const sourceBounds=new THREE.Box3(new THREE.Vector3(original.min[0]-.06,original.min[2]-.16,-original.max[1]-.06),
      new THREE.Vector3(original.max[0]+.06,original.max[2]+.10,-original.min[1]+.06));
    const canopyMid=(sourceBounds.min.y+sourceBounds.max.y)*.5;
    const phase=random()*Math.PI*2;
    for(let b=0;b<8;b++){
      const angle=phase+b*2.399963+between(random,-.20,.20),reach=between(random,1.12,1.65)*(h/5.5);
      const start=origin.clone().add(new THREE.Vector3(lean.x*.5,Math.max(2.47,h*(.45+b*.027)),lean.z*.5));
      const tip=new THREE.Vector3(x+Math.cos(angle)*reach,canopyMid+between(random,-.45,.40),z+Math.sin(angle)*reach);
      const joint=start.clone().lerp(tip,.56).add(new THREE.Vector3(Math.cos(angle+.8)*.10,-.10,Math.sin(angle+.8)*.10));
      branchBatch.add(start,joint,r*.34,r*.19,6);branchBatch.add(joint,tip,r*.19,.017,6);
      branchPoints.push(start,joint,tip);
      const twigEnds=[];
      for(let k=0;k<3;k++){
        const a=angle+(k-1)*.76+between(random,-.18,.18),anchor=joint.clone().lerp(tip,.30+k*.21);
        const end=anchor.clone().add(new THREE.Vector3(Math.cos(a)*between(random,.38,.64),between(random,.20,.48),Math.sin(a)*between(random,.38,.64)));
        // Side branches belong above the preserved two-metre walking volume.
        end.y=Math.max(base+2.55,end.y);branchBatch.add(anchor,end,.019,.0055,5);branchPoints.push(anchor,end);twigEnds.push(end);
      }
      for(let leaf=0;leaf<56;leaf++){
        const end=twigEnds[leaf%twigEnds.length],center=tip.clone().lerp(end,between(random,.10,.98));
        const theta=random()*Math.PI*2,rad=Math.sqrt(random());
        center.x+=Math.cos(theta)*rad*.49;center.z+=Math.sin(theta)*rad*.45;center.y+=between(random,-.35,.41);
        const width=between(random,.29,.43),height=width*between(random,.92,1.28),margin=Math.hypot(width,height)*.5;
        center.y=Math.max(base+2.62,center.y);
        // Reject a leaf that would form a clipped rectangular canopy edge.
        if(center.x-margin<sourceBounds.min.x||center.x+margin>sourceBounds.max.x||center.z-margin<sourceBounds.min.z||center.z+margin>sourceBounds.max.z||center.y+margin>sourceBounds.max.y)continue;
        const normal=new THREE.Vector3(between(random,-1,1),between(random,-.35,1),between(random,-1,1)).normalize();
        rotation.setFromUnitVectors(leafNormal,normal);rotation.multiply(new THREE.Quaternion().setFromAxisAngle(leafNormal,random()*Math.PI*2));
        // Keep the accepted cards and the branch random sequence unchanged.
        // A quarter of the existing outer sprigs fills the mid-crown instead
        // of leaving eight disconnected tufts at the branch tips.
        if(leaf%4===0){
          center.x=THREE.MathUtils.lerp(center.x,x+lean.x,.40);
          center.z=THREE.MathUtils.lerp(center.z,z+lean.z,.40);
          center.y=THREE.MathUtils.lerp(center.y,canopyMid,.20);
        }
        let finalWidth=width*1.28,finalHeight=height*1.14;
        const finalMargin=Math.hypot(finalWidth,finalHeight)*.5;
        center.y=Math.max(base+2.62+finalMargin,center.y);
        const available=Math.min(center.x-sourceBounds.min.x,sourceBounds.max.x-center.x,
          center.z-sourceBounds.min.z,sourceBounds.max.z-center.z,sourceBounds.max.y-center.y);
        const fit=Math.min(1,Math.max(.40,available/finalMargin));
        finalWidth*=fit;finalHeight*=fit;
        matrix.compose(center,rotation,new THREE.Vector3(finalWidth,finalHeight,1));
        const colour=new THREE.Color().setRGB(between(random,.78,1.02),between(random,.88,1.04),between(random,.72,.91));
        cards.push({matrix:matrix.clone(),colour,tree:index});
      }
    }
    const branchBounds=new THREE.Box3().setFromPoints(branchPoints).expandByScalar(r*.35);
    trees.push({id:source.id,sourcePositionBlender:[x,source.blender_y,base],baseWorld:[x,base,z],
      trunkCircle:{x,z,radius:source.collider_radius},baseTrunkRadius:r*1.20,
      lowerTrunkMaximumOffset:.031,branchStartAboveGround:2.47,
      branchVertexRange:{start:branchStart,count:branchBatch.vertexCount-branchStart},
      branchBounds:{min:branchBounds.min.toArray(),max:branchBounds.max.toArray()},
      leafInstances:{start:cardStart,count:cards.length-cardStart},leafBounds:measureCards(cards,cardStart,cards.length),
      previousCrownBoundsBlender:original});
  }
  const branches=branchBatch.finish(),attribute=branches.attributes.position,p=new THREE.Vector3();
  for(const tree of trees){
    const box=new THREE.Box3(),range=tree.branchVertexRange;
    for(let i=range.start;i<range.start+range.count;i++)box.expandByPoint(p.fromBufferAttribute(attribute,i));
    tree.branchBounds={min:box.min.toArray(),max:box.max.toArray()};
  }
  return {branches,cards,trees};
}

function canopyMaterial(texture){
  const material=new THREE.MeshStandardMaterial({name:'SPACE09_AlphaLeafSprigs',color:0x8d9d71,map:texture,
    roughness:.86,metalness:0,alphaTest:LEAF_CUTOFF,transparent:false,depthWrite:true,side:THREE.DoubleSide});
  material.alphaToCoverage=false;material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Thin leaves transmit a little of the existing directional illumination;
      // this adds neither a light nor a separate transmission render pass.
      #if NUM_DIR_LIGHTS > 0
        float s09LeafBack=pow(max(0.,dot(-normal,normalize(directionalLights[0].direction))),2.);
        outgoingLight+=diffuseColor.rgb*directionalLights[0].color*s09LeafBack*.12;
      #endif
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'space09-alpha-leaf-sprigs-coverage-02';return material;
}

const GROUND_NOISE=`
varying vec3 vSpace09GroundWorld;
varying vec3 vSpace09GroundNormal;
float s09GroundHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float s09GroundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(s09GroundHash(i),s09GroundHash(i+vec2(1.,0.)),f.x),mix(s09GroundHash(i+vec2(0.,1.)),s09GroundHash(i+vec2(1.)),f.x),f.y);}
`;

function makeGroundMaterial(source,riverSections){
  const material=source.clone(),previousCompile=source.onBeforeCompile,key=source.customProgramCacheKey.call(source);
  material.name=`Space 09 ground / ${source.name}`;
  const sections=riverSections??[];
  let river='vec2 s09River(float x){vec2 r=vec2(-6.15138,8.74812);';
  if(sections.length){river=`vec2 s09River(float x){vec2 r=vec2(${sections[0][1].toFixed(6)},${sections[0][2].toFixed(6)});`;
    for(let i=1;i<sections.length;i++){const a=sections[i-1],b=sections[i];river+=`r=mix(r,vec2(${b[1].toFixed(6)},${b[2].toFixed(6)}),smoothstep(${a[0].toFixed(6)},${b[0].toFixed(6)},x));`;}}
  river+='return r;}';
  material.onBeforeCompile=(shader,renderer)=>{
    previousCompile.call(material,shader,renderer);
    // The inherited light's 76m-wide shadow frustum retained the tiny local
    // sample's bias. PCF taps then self-shadow the low-relief terrain, visible
    // as contour-like waves. Move only the directional depth comparison toward
    // the light (2.09cm across its 104.5m depth span), not shadow UVs: shadows
    // remain anchored at wall/tree feet. Point-light shadows stay untouched.
    shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>',`
      #include <shadowmap_vertex>
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
          vDirectionalShadowCoord[ i ].z -= .00020 * vDirectionalShadowCoord[ i ].w;
        }
        #pragma unroll_loop_end
      #endif
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSpace09GroundWorld;\nvarying vec3 vSpace09GroundNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvSpace09GroundNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSpace09GroundWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+GROUND_NOISE+river);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
      vec2 s09P=vec2(vSpace09GroundWorld.x,-vSpace09GroundWorld.z);
      vec2 s09Section=s09River(s09P.x);
      float s09Bank=abs(s09P.y-s09Section.x)-s09Section.y*.5;
      float s09Slope=1.-clamp(normalize(vSpace09GroundNormal).y,0.,1.);
      float s09Top=smoothstep(.35,.85,normalize(vSpace09GroundNormal).y);
      float s09Wet=(1.-smoothstep(.6,3.6,s09Bank))*.30;
      float s09Outer=smoothstep(28.,49.,max(abs(s09P.x),abs(s09P.y+7.)));
      float s09Moisture=s09GroundNoise(s09P*.10)*.62+s09GroundNoise(s09P*.27+2.8)*.38;
      float s09Foot=1.-smoothstep(.015,.16,s09Slope);
      float s09Green=smoothstep(.025,.085,diffuseColor.g-diffuseColor.r);
      vec3 s09Colour=mix(vec3(1.02,.99,.92),vec3(.91,1.035,.85),s09Green);
      s09Colour*=1.-s09Wet;
      s09Colour*=mix(.94,1.05,s09Moisture)*mix(1.,.96,s09Outer);
      s09Colour=mix(s09Colour,vec3(1.035,.985,.90),s09Slope*.45);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*s09Colour,s09Top*.78);
      roughnessFactor=mix(roughnessFactor,mix(.90,.77,s09Wet),s09Top*.35);
      #include <lights_physical_fragment>
    `);
  };
  material.customProgramCacheKey=()=>`${key}/space09-bank-slope-outer-ground-receiver-02`;
  return material;
}

export async function applyLandscape(renderer,scene,model,neighbourhood={}){
  if(ACTIVE.has(scene))return ACTIVE.get(scene);
  const sourceTrees=neighbourhood.landscape?.trees;
  if(!Array.isArray(sourceTrees)||sourceTrees.length!==23)throw new Error('SPACE09 expects the original 23 SPACE06 tree records.');
  const hidden=[],retiredGround=[],groundSources=[];
  model.traverse(part=>{
    if(!part.isMesh)return;const materials=Array.isArray(part.material)?part.material:[part.material];
    if(materials.every(treeMaterial))hidden.push({part,visible:part.visible});
    else if(materials.some(treeMaterial))throw new Error('Tree material shares geometry with protected content; refuse to hide that batch.');
    if(materials.every(retiredGrassMaterial))retiredGround.push({part,visible:part.visible});
    else if(materials.some(retiredGrassMaterial))throw new Error('Grass overlays share protected geometry; refuse to hide that batch.');
    else if(materials.some(groundMaterial))groundSources.push(part);
  });
  if(hidden.length!==4)throw new Error(`SPACE09 expected four exclusive tree material batches, found ${hidden.length}.`);
  const texture=makeLeafAtlas(renderer),built=createTreeGeometry(sourceTrees);
  const group=new THREE.Group();group.name='SPACE09_ReplacementTrees';group.userData.space09Owned=true;
  const bark=new THREE.MeshStandardMaterial({name:'SPACE09_WeatheredBark',color:0x665d4e,roughness:.96,metalness:0});
  const branches=new THREE.Mesh(built.branches,bark);branches.name='SPACE09_BranchHierarchy';branches.castShadow=true;branches.receiveShadow=true;
  const leafMaterial=canopyMaterial(texture),cardGeometry=new THREE.PlaneGeometry(1,1);
  const leaves=new THREE.InstancedMesh(cardGeometry,leafMaterial,built.cards.length);leaves.name='SPACE09_IndividualLeafSprigs';
  built.cards.forEach(({matrix,colour},i)=>{leaves.setMatrixAt(i,matrix);leaves.setColorAt(i,colour);});
  leaves.instanceMatrix.needsUpdate=true;if(leaves.instanceColor)leaves.instanceColor.needsUpdate=true;
  leaves.computeBoundingBox();leaves.computeBoundingSphere();leaves.castShadow=false;leaves.receiveShadow=true;
  group.add(branches,leaves);
  const replacements=[],cache=new Map();
  const river=scene.userData.space06Landscape?.riverSectionsBlenderXY??neighbourhood.landscape?.river_sections;
  for(const part of groundSources){
    const original=part.material,list=Array.isArray(original)?original:[original];
    const next=list.map(source=>{if(!groundMaterial(source))return source;
      if(!cache.has(source))cache.set(source,makeGroundMaterial(source,river));return cache.get(source);});
    part.material=Array.isArray(original)?next:next[0];replacements.push({part,original,installed:part.material});
  }
  [...hidden,...retiredGround].forEach(({part})=>{part.visible=false;});scene.add(group);
  const branchTriangles=built.branches.attributes.position.count/3,leafTriangles=cardGeometry.index.count/3*leaves.count;
  const metadata={version:'space-09-branch-hierarchy-and-alpha-leaf-sprigs',treeCount:sourceTrees.length,
    oldHiddenMeshes:hidden.map(({part,visible})=>({name:part.name,previousVisible:visible})),
    retiredGroundOverlays:retiredGround.map(({part,visible})=>({name:part.name,previousVisible:visible})),
    newMeshes:2,drawCalls:2,branchTriangles,leafTriangles,totalTriangles:branchTriangles+leafTriangles,
    leafInstances:leaves.count,leafTexture:{source:'Local Canvas; no downloaded assets',size:[256,256],
      alphaTest:LEAF_CUTOFF,transparent:false,alphaToCoverage:false,individualLeavesPerCard:7,mipmaps:'Explicit coverage-preserving levels',
      alphaStatistics:texture.userData.alphaStatistics},
    trees:built.trees,leafShadows:false,branchShadows:true,
    canopyDistribution:{midCrownFraction:.25,midCrownRadialInwardBlend:.40,cardWidthMultiplier:1.28,cardHeightMultiplier:1.14,
      bounds:'Each card remains inside the original crown envelope; no additional instances or branch triangles.'},
    groundMaterialCount:cache.size,groundMeshes:replacements.map(({part})=>part.name),
    groundMethod:'Restrained low-frequency moisture variation, dark wet-bank band, slope tint and subdued outer ground; original geometry and prior grass/dirt masks preserved.',
    groundShadowReceiver:{directionalDepthBias:-.00020,lightDepthSpanMetres:104.5,equivalentDepthOffsetMetres:.0209,
      scope:'Cloned earth/soil material vertex shader only; shadow comparison depth, not UV or surface position',
      receiveShadowPreserved:true,globalLightSettingsChanged:false,shadowCastersChanged:false,
      diagnosis:'GPU same-camera A/B: disabling earth receiveShadow removed the fine waves. Source grass overlays were not the wave cause; their removal only eliminates floating duplicate grass surfaces.'},
    visibleBounds:{min:new THREE.Box3().setFromObject(group).min.toArray(),max:new THREE.Box3().setFromObject(group).max.toArray()},
    preserved:'All original buffers, transforms, drawRange, navigation, water, buildings and core trees. Four exclusive SPACE06 tree batches and three five-green-space overlay batches become invisible at runtime; real soil/terrain stays visible.',
    limitations:'Leaf cards are alpha-tested geometry without fur-like micro detail; foliage does not add shadow passes. Existing lights illuminate both sides.'};
  if(metadata.totalTriangles>50000)throw new Error('SPACE09 tree geometry exceeded its 50k triangle budget.');
  const hadMetadata=Object.hasOwn(scene.userData,'space09Landscape'),previousMetadata=scene.userData.space09Landscape;
  scene.userData.space09Landscape=metadata;let disposed=false;
  const handle={metadata,update(){},dispose(){
    if(disposed)return;disposed=true;scene.remove(group);
    [...hidden,...retiredGround].forEach(({part,visible})=>{part.visible=visible;});
    replacements.forEach(({part,original,installed})=>{if(part.material===installed)part.material=original;});
    cache.forEach(material=>material.dispose());built.branches.dispose();cardGeometry.dispose();bark.dispose();leafMaterial.dispose();texture.dispose();group.clear();
    if(hadMetadata)scene.userData.space09Landscape=previousMetadata;else delete scene.userData.space09Landscape;
    ACTIVE.delete(scene);
  }};
  ACTIVE.set(scene,handle);return handle;
}
