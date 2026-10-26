// A separate material architecture for the live PBR renderer. The real native
// H/V/A fields and signed-field geometry remain the source of shape/ecology;
// the expensive source shadeScene/ray queries are deliberately not evaluated.
import { mountainSurfacePatch,MOUNTAIN_SURFACE_HABITAT_REVISION } from './mountain-surface-habitat.js';
export const FIELD_MATERIAL_REVISION='m4-shared-microhabitat-residual-3';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const isFloat=value=>ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)==='[object Float32Array]';
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const CHUNK=131072;
const NORMAL_LIMITS=[-1,0,.12,.25,.4,.62,.85,1];
const GREEN_RESIDUAL=.055,ROCK_GREEN_RATIO=1.045;
function coverageAccumulator(){return Array.from({length:NORMAL_LIMITS.length-1},()=>new Float64Array(14));}
function coverageSnapshot(accumulator){
  let total=0,mapped=0,painted=0,residual=0;
  const bands=accumulator.map((s,i)=>{
    const n=s[0],scale=n?1/n:0;total+=n;mapped+=s[1];painted+=s[2];residual+=s[8];
    return {normalY:[NORMAL_LIMITS[i],NORMAL_LIMITS[i+1]],samples:n,
      meanMappedCover:s[1]*scale,meanPaintCover:s[2]*scale,meanSurfaceSupport:s[3]*scale,
      meanHeightGapMetres:s[4]*scale,meanStoredRGB:[s[5]*scale,s[6]*scale,s[7]*scale],
      meanShaderGreenResidual:s[8]*scale,meanNominalDecodedCover:s[8]*scale/.0525,
      meanRawRGBChroma:s[9]*scale,
      mappedAtLeast025Fraction:s[10]*scale,densePaintAtLeast075Fraction:s[11]*scale,
      microHabitatFallbackFraction:s[12]*scale,meanMicroHabitatPaintCover:s[13]*scale};
  });
  return {schema:'m4-material-coverage-by-normal-v1',samples:total,
    weighting:'One sample per generated mesh vertex or terrain texel, not projected area or visible canvas pixels',
    meanMappedCover:total?mapped/total:0,meanPaintCover:total?painted/total:0,
    meanShaderGreenResidual:total?residual/total:0,
    residualConvention:'Shader linear RGB = stored CPU RGB times pi; residual = shaderG - 1.045*shaderR',
    residualPerUnitPaintCover:GREEN_RESIDUAL,nominalRasterDecoderDivisor:.0525,bands};
}

function hash(x,z){let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);}
function field(input,name,channels){
  const data=input?.data,width=input?.width||input?.resolution,height=input?.height||width;
  if(!isFloat(data)||!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2
    ||(input.channels||channels)!==channels||data.length!==width*height*channels)throw new Error('Invalid generated '+name+' field');
  return {data,width,height,channels};
}
async function sha256(array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(array.buffer,array.byteOffset,array.byteLength)))].map(v=>v.toString(16).padStart(2,'0')).join('');}

/** This object owns no GPU resource and never mutates source fields/geometry. */
export function createFieldMaterialSampler({height,vegetation,attributes,rect,provenance}={}){
  const H=field(height,'height',1),V=field(vegetation,'vegetation',4),A=field(attributes,'attributes',4);
  if((!Array.isArray(rect)&&!ArrayBuffer.isView(rect))||rect.length<3)throw new Error('Field material needs a world rectangle');
  const [x0,z0,worldWidth,fourth]=Array.from(rect),worldHeight=fourth>1?fourth:worldWidth;
  if(![x0,z0,worldWidth,worldHeight].every(Number.isFinite)||worldWidth<=0||worldHeight<=0)throw new Error('Invalid field material world rectangle');
  const sourceRect=[x0,z0,worldWidth,worldHeight],sourceProvenance={...provenance};
  let active=false;
  const channelScratch=new Float64Array(8);
  const aggregateCoverage=coverageAccumulator();let coverageCalls=0;
  function publishCoverage(local,kind){
    const snapshot=coverageSnapshot(local);coverageCalls++;
    for(let i=0;i<local.length;i++)for(let j=0;j<local[i].length;j++)aggregateCoverage[i][j]+=local[i][j];
    if(typeof window!=='undefined')window.lijiangM4MaterialCoverage={revision:FIELD_MATERIAL_REVISION,
      calls:coverageCalls,lastOperation:kind,...coverageSnapshot(aggregateCoverage)};
    return snapshot;
  }
  function scalar(f,x,z){
    const u=clamp((x-x0)/worldWidth*f.width-.5,0,f.width-1),v=clamp((z-z0)/worldHeight*f.height-.5,0,f.height-1);
    const ix=Math.floor(u),iz=Math.floor(v),jx=Math.min(ix+1,f.width-1),jz=Math.min(iz+1,f.height-1),tx=u-ix,tz=v-iz,a=f.data;
    return mix(mix(a[iz*f.width+ix],a[iz*f.width+jx],tx),mix(a[jz*f.width+ix],a[jz*f.width+jx],tx),tz);
  }
  function rgba(f,x,z,target,offset){
    const u=clamp((x-x0)/worldWidth*f.width-.5,0,f.width-1),v=clamp((z-z0)/worldHeight*f.height-.5,0,f.height-1);
    const ix=Math.floor(u),iz=Math.floor(v),jx=Math.min(ix+1,f.width-1),jz=Math.min(iz+1,f.height-1),tx=u-ix,tz=v-iz,a=f.data;
    const i00=(iz*f.width+ix)*4,i10=(iz*f.width+jx)*4,i01=(jz*f.width+ix)*4,i11=(jz*f.width+jx)*4;
    for(let c=0;c<4;c++)target[offset+c]=mix(mix(a[i00+c],a[i10+c],tx),mix(a[i01+c],a[i11+c],tx),tz);
  }
  function paint(x,y,z,normalY,output,at,diagnostics,allowMicroHabitat=false){
    rgba(V,x,z,channelScratch,0);rgba(A,x,z,channelScratch,4);
    const mappedCover=clamp(channelScratch[0]),forest=clamp(channelScratch[3]),ao=clamp(channelScratch[4]);
    const convexity=channelScratch[5],flow=clamp(channelScratch[7]);
    const hollow=1-smooth(-2.8,.8,convexity),ridge=smooth(.8,5.5,convexity);
    const moisture=clamp(.24+.24*hollow+.28*flow+.10*(1-ao));
    const broad=noise(x*.023+y*.006,z*.027-y*.004),patch=noise(x*.071-y*.009,z*.067+y*.013);
    // V is an XZ habitat map of the height surface. An actual overhanging wall
    // below that surface cannot inherit its entire green summit. Mesh normals
    // and height agreement distinguish ledges from hanging vertical pockets.
    const heightGap=Math.abs(scalar(H,x,z)-y);
    // M4 V is spatial habitat potential, independent of the coarse H slope.
    // The actual mesh normal supplies the local support test here: even
    // NY=.25 can be a real micro-terrace. Apply this support test only once.
    const upward=smooth(.08,.24,normalY);
    const hangingWall=smooth(24,88,heightGap)*(1-smooth(.12,.26,normalY));
    const surfaceSupport=upward*(1-hangingWall);
    const habitat=.50*broad+.22*mappedCover+.15*moisture+.13*hollow-.10*ridge;
    // The habitat field now carries mountain woodland as well as lowland
    // cover. Keep supported soil patches dark and dense; an XZ canopy mask
    // cannot recolour the vertical wall beneath it as a continuous green cap.
    const wallCover=mappedCover*smooth(.72,.90,habitat)*.12*moisture*(1-upward)*smooth(-.08,.08,normalY);
    // Interpret medium cover as area occupancy: dark coherent shrub/soil
    // islands separated by rock, rather than a grey-green wash everywhere.
    // These are the existing two noise calls, with no extra generation pass.
    const patchRank=smooth(.24,.76,.72*broad+.28*patch);
    const patchThreshold=.08+.84*patchRank;
    const occupied=smooth(patchThreshold-.065,patchThreshold+.065,mappedCover);
    const ledgeCover=surfaceSupport*occupied*mix(.86,.98,mappedCover);
    // The coarse XZ potential can miss an actual SDF ledge. Use exactly the
    // planter's shared 3D patch for its low-V microhabitat, without drawing a
    // second, unrelated occupancy pattern beneath already rooted communities.
    // Only actual SDF vertices participate; terrain texels and lowland soil do
    // not gain this fallback. This is not a five-point root-disk certificate.
    let microCover=0;
    if(allowMicroHabitat&&mappedCover<.25&&normalY>.23&&y>12){
      const microPatch=mountainSurfacePatch(x,y,z),ledge=smooth(.30,.78,normalY);
      microCover=smooth(.23,.27,normalY)*smooth(.53,.57,microPatch)*mix(.78,.94,ledge);
    }
    const cover=clamp(Math.max(wallCover,ledgeCover,microCover));
    const rockR=mix(.265,.365,.6*broad+.4*patch),rockG=rockR*ROCK_GREEN_RATIO,rockB=rockR*.99;
    const plantTone=mix(1.,.88,forest);
    const greenR=mix(.031,.067,patch)*plantTone,greenG=greenR*ROCK_GREEN_RATIO+GREEN_RESIDUAL,greenB=mix(.023,.044,patch)*plantTone;
    const lowGround=(1-smooth(30,100,y))*smooth(.64,.94,normalY);
    const earthR=mix(.115,.174,patch),earthG=mix(.105,.155,patch),earthB=mix(.070,.098,patch);
    const earthMix=lowGround*(1-cover*.72);
    // Only weak intrinsic cavity tint is retained. Direct sun, geometry
    // shadows, sky illumination, fog and display transform remain live.
    const cavity=.91+.09*ao,wet=(1-smooth(.3,3.1,y))*.24;
    const gain=cavity*(1-wet)/Math.PI;
    output[at]=mix(mix(rockR,greenR,cover),earthR,earthMix)*gain;
    output[at+1]=mix(mix(rockG,greenG,cover),earthG,earthMix)*gain;
    output[at+2]=mix(mix(rockB,greenB,cover),earthB,earthMix)*gain;
    let band=0;while(band<NORMAL_LIMITS.length-2&&normalY>=NORMAL_LIMITS[band+1])band++;
    const s=diagnostics[band],r=output[at],g=output[at+1],b=output[at+2];
    s[0]++;s[1]+=mappedCover;s[2]+=cover;s[3]+=surfaceSupport;s[4]+=heightGap;
    s[5]+=r;s[6]+=g;s[7]+=b;s[8]+=(g-ROCK_GREEN_RATIO*r)*Math.PI;
    s[9]+=(g-Math.max(r*.985,b*1.06))/Math.max(.2126*r+.7152*g+.0722*b,.012);
    if(mappedCover>=.25)s[10]++;if(cover>=.75)s[11]++;
    if(microCover>0)s[12]++;s[13]+=microCover;
  }
  function metadataBase(){return {
    revision:FIELD_MATERIAL_REVISION,architecture:'Native generated fields and actual mesh normals -> CPU base color -> live physical raster light',
    materialOnly:true,sourceHDREquivalent:false,sourceFullShadeEvaluated:false,sourceDirectionalLightingEvaluated:false,
    nativeGeometryAndPlantFieldsRetained:true,sourceFieldResolutions:{height:[H.width,H.height],vegetation:[V.width,V.height],attributes:[A.width,A.height]},
    habitatInterpretation:'M4 V is montane green-patch potential. Actual normals reject near-vertical/hanging faces once; shared 3D low-V microhabitats support shrub/soil bases on actual SDF vertices.',
    microHabitat:{revision:MOUNTAIN_SURFACE_HABITAT_REVISION,scope:'Actual SDF vertices above y12, V<.25, upward support and the same 3D patch used by mountain planting; terrain texels excluded',
      patchFullyOccupiedFrom:.57,normalFullySupportedFrom:.27,rootFootprintValidated:false},
    colorCoverEncoding:{mineralGreenRatio:ROCK_GREEN_RATIO,plantGreenResidual:GREEN_RESIDUAL,
      shaderResidual:'Without low-ground earth overlay: cover * .055 * cavity * (1-wet)',
      shoreEarthPaletteAndMixRetained:true,plantToneAppliedToResidual:false,normalSupportFullyOpenFrom:.24},
    sourceFieldSemantics:{vegetation:'r=montane green-patch potential / lowland cover; a=forest occupancy times potential; g/b unused',attributes:'r=horizon AO; g=7m convexity; b=nearby-water fraction; a=normalized erosion flow'},
    rect:sourceRect.slice(),sampleConvention:'Native bilinear half-texel centres; x fastest, row zero at minimum world z',flipY:false,
    colorSpace:'Linear physical base reflectance divided by pi for the existing raster material pi gain',rendererAlbedoGain:Math.PI,
    noFog:true,noPost:true,viewFrozen:false,sunFrozen:false,strictlySunIndependentAlbedo:true,
    rebakeRequiredForChangedViewLighting:false,externalAssets:0,artAccepted:false,provenance:{...sourceProvenance},
  };}
  async function colorVertices(positions,normals,{onProgress=null}={}){
    if(active)throw new Error('A field material CPU operation is already active');
    if(!isFloat(positions)||!positions.length||positions.length%3||!isFloat(normals)||normals.length!==positions.length)throw new Error('Field material needs matching actual Float32 mesh positions and normals');
    active=true;const started=performance.now(),count=positions.length/3,colors=new Float32Array(positions.length);
    const diagnostics=coverageAccumulator();
    let minimumRGB=Infinity,maximumRGB=0,meanLuminance=0;
    try{
      for(let offset=0;offset<count;offset+=CHUNK){
        const end=Math.min(count,offset+CHUNK);
        for(let i=offset;i<end;i++){
          const at=i*3,x=positions[at],y=positions[at+1],z=positions[at+2],ny=normals[at+1];
          if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||!Number.isFinite(ny)
            ||!Number.isFinite(normals[at])||!Number.isFinite(normals[at+2]))throw new Error('Nonfinite field material mesh input at '+i);
          paint(x,y,z,clamp(ny,-1,1),colors,at,diagnostics,true);
          const r=colors[at],g=colors[at+1],b=colors[at+2];
          if(!Number.isFinite(r)||!Number.isFinite(g)||!Number.isFinite(b)||r<0||g<0||b<0)throw new Error('Invalid field material output at '+i);
          minimumRGB=Math.min(minimumRGB,r,g,b);maximumRGB=Math.max(maximumRGB,r,g,b);meanLuminance+=.2126*r+.7152*g+.0722*b;
        }
        onProgress?.({revision:FIELD_MATERIAL_REVISION,phase:'cpu-mesh-material',completed:end,total:count,elapsedMilliseconds:performance.now()-started});
        if(typeof document!=='undefined'){const text=document.getElementById('loadtxt');if(text)text.textContent=`岩壁材质 · ${Math.round(end/count*100)}%`;}
        await yieldTask();
      }
      const [positionsSHA256,colorsSHA256]=await Promise.all([sha256(positions),sha256(colors)]);
      return {colors,metadata:{...metadataBase(),schema:'field-material-surface-v1',vertices:count,channels:3,scalarType:'float32',
        positionsSHA:positionsSHA256,positionsSHA256,colorsSHA256,colorsByteLength:colors.byteLength,
        positionsCoordinateSpace:'Actual unmodified world-metre MC Float32 positions and vertex order',normalSource:'Actual marching-cubes mesh normals',
        inputPositionsCopied:false,inputBuffersModified:false,sourceShaderSHA256:null,writerShaderSHA256:null,
        statistics:{shadedVertices:count,minimumRGB,maximumRGB,meanLuminance:meanLuminance/count,nonFiniteVertices:0},
        coverageDiagnostics:publishCoverage(diagnostics,'mesh'),
        cpuMilliseconds:performance.now()-started,bakedMilliseconds:performance.now()-started}};
    }finally{active=false;}
  }
  async function collectTerrain({resolution=1024,onProgress=null}={}){
    if(active)throw new Error('A field material CPU operation is already active');
    if(!Number.isInteger(resolution)||resolution<64||resolution>4096)throw new Error('Invalid field material terrain resolution');
    active=true;const started=performance.now(),total=resolution*resolution,data=new Float32Array(total*4),epsilon=Math.max(worldWidth/H.width,.6),colour=new Float32Array(3);
    const diagnostics=coverageAccumulator();
    let minimumRGB=Infinity,maximumRGB=0,minHeight=Infinity,maxHeight=-Infinity;
    try{
      for(let offset=0;offset<total;offset+=CHUNK){
        const end=Math.min(total,offset+CHUNK);
        for(let i=offset;i<end;i++){
          const x=x0+((i%resolution)+.5)/resolution*worldWidth,z=z0+(Math.floor(i/resolution)+.5)/resolution*worldHeight,y=scalar(H,x,z);
          const gx=(scalar(H,x+epsilon,z)-scalar(H,x-epsilon,z))/(2*epsilon),gz=(scalar(H,x,z+epsilon)-scalar(H,x,z-epsilon))/(2*epsilon);
          paint(x,y,z,1/Math.hypot(gx,1,gz),colour,0,diagnostics);const at=i*4;
          if(!Number.isFinite(y)||!Number.isFinite(colour[0])||!Number.isFinite(colour[1])||!Number.isFinite(colour[2]))throw new Error('Invalid field terrain material at '+i);
          data[at]=colour[0];data[at+1]=colour[1];data[at+2]=colour[2];data[at+3]=1;
          minimumRGB=Math.min(minimumRGB,colour[0],colour[1],colour[2]);maximumRGB=Math.max(maximumRGB,colour[0],colour[1],colour[2]);minHeight=Math.min(minHeight,y);maxHeight=Math.max(maxHeight,y);
        }
        const state={revision:FIELD_MATERIAL_REVISION,phase:'cpu-terrain-material',completed:end,total,resolution,elapsedMilliseconds:performance.now()-started};
        if(typeof window!=='undefined')window.lijiangNativeRadianceStatus=Object.freeze({...state,active:end<total});onProgress?.(state);
        if(typeof document!=='undefined'){const text=document.getElementById('loadtxt');if(text)text.textContent=`地表材质 · ${Math.round(end/total*100)}%`;}
        await yieldTask();
      }
      const dataSHA256=await sha256(data);
      return {data,width:resolution,height:resolution,channels:4,metadata:{...metadataBase(),schema:'field-material-world-v1',
        resolution,width:resolution,height:resolution,channels:4,scalarType:'float32',byteLength:data.byteLength,dataSHA256,rgbaSHA256:dataSHA256,
        samples:total,sampledHeightRange:[minHeight,maxHeight],radianceRGBRange:[minimumRGB,maximumRGB],
        normalSource:'Central derivatives of the real generated CPU H field',coverageDiagnostics:publishCoverage(diagnostics,'terrain'),cpuMilliseconds:performance.now()-started,elapsedMilliseconds:performance.now()-started}};
    }finally{active=false;}
  }
  return Object.freeze({revision:FIELD_MATERIAL_REVISION,colorVertices,collectTerrain,getMetadata:metadataBase,
    getCoverageDiagnostics:()=>({calls:coverageCalls,...coverageSnapshot(aggregateCoverage)})});
}
