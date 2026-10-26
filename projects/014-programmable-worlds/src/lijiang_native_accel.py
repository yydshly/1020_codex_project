"""Add conservative max-height air traversal to the native candidate.

This changes only the air advance in the already corrected marcher. The
retained 4 m fallback, peak bounds, signed roots, detailed geometry, shadows
and reflection share their original code. Actual max-pool data is built once
from the generated height field, not approximated from authored peak heights.
"""
from __future__ import annotations

import hashlib
import re

REVISION = 'native-maxheight-air-1'


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _functions(source: str, name: str) -> list[tuple[int,int,str]]:
    result=[]
    for match in re.finditer(r'(?m)^[ \t]*(?:float|bool|vec[234]|void)\s+'+re.escape(name)+r'\s*\(',source):
        i,depth=match.end(),1
        while i<len(source) and depth:
            depth+=(source[i]=='(')-(source[i]==')');i+=1
        while i<len(source) and source[i].isspace():i+=1
        if i>=len(source) or source[i]!='{':continue
        depth=0
        while i<len(source):
            if source.startswith('//',i):
                end=source.find('\n',i+2);i=len(source) if end<0 else end+1;continue
            if source.startswith('/*',i):
                end=source.find('*/',i+2)
                if end<0:raise ValueError('Unclosed source comment')
                i=end+2;continue
            depth+=(source[i]=='{')-(source[i]=='}');i+=1
            if depth==0:break
        if depth:raise ValueError('Unclosed source function '+name)
        result.append((match.start(),i,source[match.start():i]))
    return result


AIR_GLSL = r'''
// native-maxheight-air-1: positive maxima, never averaged mip levels.
uniform sampler2D uNativeMaxH;
uniform int uNativeMaxLevels,uNativeMaxEnabled;
float liNativeMaxAirAdvance(vec3 position,vec3 direction,float remaining){
  if(uNativeMaxEnabled==0||uNativeMaxLevels<1||position.y<=60.||remaining<=4.)return 0.;
  vec2 relative=(position.xz-uRect.xy)*uRect.w;
  if(any(lessThan(relative,vec2(0.)))||any(greaterThanEqual(relative,vec2(1.))))return 0.;
  float maximum=remaining;
  if(direction.y<0.)maximum=min(maximum,(60.-position.y)/direction.y);
  if(maximum<=4.)return 0.;
  for(int nativeLevel=uNativeMaxLevels-1;nativeLevel>=uZero;nativeLevel--){
    ivec2 dimensions=textureSize(uNativeMaxH,nativeLevel);
    float cell=uRect.z/float(dimensions.x);
    ivec2 index=clamp(ivec2(floor(relative*vec2(dimensions))),ivec2(0),dimensions-1);
    vec2 lower=uRect.xy+vec2(index)*cell,upper=lower+cell;
    float crossX=1e30,crossZ=1e30;
    // Exact zero-direction branches avoid division by zero. A negative ray
    // on a boundary simply falls back to the existing short step there.
    if(direction.x>0.)crossX=(upper.x-position.x)/direction.x;
    else if(direction.x<0.)crossX=(lower.x-position.x)/direction.x;
    if(direction.z>0.)crossZ=(upper.y-position.z)/direction.z;
    else if(direction.z<0.)crossZ=(lower.y-position.z)/direction.z;
    float segment=min(maximum,min(crossX,crossZ));
    if(segment<=4.01)continue;
    float maximumHeight=texelFetch(uNativeMaxH,index,nativeLevel).r;
    float minimumRayHeight=min(position.y,position.y+direction.y*segment);
    // Every source height sample contributing anywhere in this world cell
    // is bounded by maximumHeight. Ray y is linear, so its minimum is at an
    // endpoint. Both properties must hold before taking the longer step.
    if(minimumRayHeight>maximumHeight+ENV+.05){
      float inset=max(.005,segment*.000001);
      return max(0.,segment-inset);
    }
  }
  return 0.;
}
'''.strip()


BUILD_ZERO = r'''
uniform sampler2D uInputHeight;uniform float uOutputSize;out vec4 o;
void main(){
  ivec2 dimensions=textureSize(uInputHeight,0);
  ivec2 centre=ivec2(floor(gl_FragCoord.xy/uOutputSize*vec2(dimensions)));
  float maximumHeight=-1e30;
  // Five source texels span the complete positive-weight cubic support of
  // every point in this output cell; bilinear support is a strict subset.
  for(int j=uZero-2;j<=2;j++)for(int i=uZero-2;i<=2;i++){
    ivec2 p=clamp(centre+ivec2(i,j),ivec2(0),dimensions-1);
    maximumHeight=max(maximumHeight,texelFetch(uInputHeight,p,0).r);
  }
  o=vec4(maximumHeight,0.,0.,1.);
}'''.strip()


BUILD_POOL = r'''
uniform sampler2D uInputHeight;uniform int uInputLevel;out vec4 o;
void main(){
  ivec2 dimensions=textureSize(uInputHeight,uInputLevel);
  ivec2 p=ivec2(gl_FragCoord.xy)*2;
  float a=texelFetch(uInputHeight,clamp(p,ivec2(0),dimensions-1),uInputLevel).r;
  float b=texelFetch(uInputHeight,clamp(p+ivec2(1,0),ivec2(0),dimensions-1),uInputLevel).r;
  float c=texelFetch(uInputHeight,clamp(p+ivec2(0,1),ivec2(0),dimensions-1),uInputLevel).r;
  float d=texelFetch(uInputHeight,clamp(p+ivec2(1,1),ivec2(0),dimensions-1),uInputLevel).r;
  o=vec4(max(max(a,b),max(c,d)),0.,0.,1.);
}'''.strip()


RUNTIME = r'''
// Build once after source generation; never rebuild for a camera/video frame.
const FS_NATIVE_MAX_ZERO=GLSL_COMMON+`BUILD_ZERO`;
const FS_NATIVE_MAX_POOL=GLSL_COMMON+`BUILD_POOL`;
const liNativeMaxRuntime={enabled:Q.get('maxskip')!=='0',ready:false,size:0,levels:0,bytes:0,buildMs:0};
window.lijiangNativeMaxHeight={
  getState(){return{...liNativeMaxRuntime,revision:'native-maxheight-air-1',unit:14};},
  setEnabled(value){liNativeMaxRuntime.enabled=Boolean(value);return this.getState();}
};
async function liNativeBuildMaxHeight(){
  const started=performance.now();liNativeMaxRuntime.ready=false;
  if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<15)throw new Error('Native max-height traversal requires fragment texture unit 14');
  const sourceSize=Math.max(1,Math.floor(HRES));
  let size=1;while(size<sourceSize)size*=2;
  if(size>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('Native max-height pyramid exceeds MAX_TEXTURE_SIZE');
  const levels=Math.floor(Math.log2(size))+1;
  runtimePhase('native-maxheight-build-start',{sourceSize,size,levels});
  if(loadtxt)loadtxt.textContent='建立保守空域高度层级';
  const target=gl.createTexture();bindTex(0,target);
  gl.texStorage2D(gl.TEXTURE_2D,levels,gl.R32F,size,size);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL,0);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,levels-1);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const framebuffer=gl.createFramebuffer();
  const attach=(texture,level)=>{
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,level);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Incomplete native max-height framebuffer');
  };
  const zero=await progDeferred(FS_NATIVE_MAX_ZERO,'FS_NATIVE_MAX_ZERO');
  const pool=await progDeferred(FS_NATIVE_MAX_POOL,'FS_NATIVE_MAX_POOL');
  try{
    gl.disable(gl.BLEND);
    attach(target,0);gl.useProgram(zero.p);bindTex(0,world.hTex);
    gl.uniform1i(zero.u.uInputHeight,0);gl.uniform1f(zero.u.uOutputSize,size);
    await tiled(framebuffer,size,size,512,null);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Native max-height level0 draw failed');
    for(let level=1;level<levels;level++){
      const dimension=Math.max(1,size>>level);
      // The temporary output is a different texture object. Sampling and
      // attaching different mip levels of one object can be a feedback loop
      // in WebGL, so each computed level is copied into the final pyramid.
      const temporary=tex(dimension,dimension,gl.R32F,gl.RED,gl.FLOAT,gl.NEAREST);
      try{
        attach(temporary,0);gl.useProgram(pool.p);bindTex(0,target);
        gl.uniform1i(pool.u.uInputHeight,0);gl.uniform1i(pool.u.uInputLevel,level-1);
        await tiled(framebuffer,dimension,dimension,512,null);
        bindTex(0,target);
        gl.copyTexSubImage2D(gl.TEXTURE_2D,level,0,0,0,0,dimension,dimension);
        await gpuWait();
        if(gl.getError()!==gl.NO_ERROR)throw new Error('Native max-height mip copy failed at level '+level);
      }finally{gl.deleteTexture(temporary);}
    }
    await gpuWait();
    const previous=world.nativeMaxHeight;
    world.nativeMaxHeight={texture:target,size,levels,sourceSize};
    if(previous)gl.deleteTexture(previous.texture);
    let bytes=0;for(let level=0;level<levels;level++)bytes+=4*(size>>level)**2;
    Object.assign(liNativeMaxRuntime,{ready:true,size,levels,bytes,buildMs:performance.now()-started});
    runtimePhase('native-maxheight-ready',liNativeMaxRuntime);
  }catch(error){gl.deleteTexture(target);throw error;}
  finally{gl.deleteFramebuffer(framebuffer);gl.deleteProgram(zero.p);gl.deleteProgram(pool.p);}
}
const liNativeSourceGenerate=generate;
generate=async function(...args){await liNativeSourceGenerate(...args);await liNativeBuildMaxHeight();};
const liNativeSourceRenderSample=renderSample;
renderSample=async function(...args){
  const field=world.nativeMaxHeight;
  if(!field)throw new Error('Native max-height field has not been built');
  gl.useProgram(pr.p);bindTex(14,field.texture);
  gl.uniform1i(pr.u.uNativeMaxH,14);gl.uniform1i(pr.u.uNativeMaxLevels,field.levels);
  gl.uniform1i(pr.u.uNativeMaxEnabled,liNativeMaxRuntime.enabled?1:0);
  return liNativeSourceRenderSample(...args);
};
'''.replace('BUILD_ZERO',BUILD_ZERO).replace('BUILD_POOL',BUILD_POOL).strip()


PRESERVE=(
    'liNativeGroundRoot','liNativePeakInterval','landH','terrSD','sceneSD','H','Hc',
    'treesSD','bushSD','crownSD','leafyShade','rockField','rockAlbedo','sceneNormal',
    'sceneAO','shadeScene','shadow','shadowH','skyView','skyDome','skyIrr','skyFill',
    'fogApply','oceanH','waterHit','shadeWater','waterEdge',
)

# In addition to the ESSL reserved words commonly encountered in native code,
# include C++/desktop qualifiers reserved for future GLSL versions. This scan
# is deliberately described as static validation, never GPU compilation.
RESERVED=frozenset('active asm cast class common external filter fixed fvec2 fvec3 fvec4 goto half hvec2 hvec3 hvec4 inline input interface long namespace noinline output packed partition public resource short sizeof static superp template this typedef union unsigned using volatile'.split())


def _reserved_declarations(glsl: str) -> dict:
    clean=re.sub(r'/\*.*?\*/|//[^\n]*','',glsl,flags=re.S)
    identifiers=re.findall(r'\b(?:bool|int|float|vec[234]|ivec[234]|sampler2D)\s+([A-Za-z_]\w*)',clean)
    forbidden=sorted(set(identifiers)&RESERVED)
    if forbidden:raise ValueError('Reserved GLSL declaration: '+','.join(forbidden))
    return {'checkedIdentifiers':len(identifiers),'forbidden':forbidden,'gpuCompilation':False}


def patch(source: str) -> tuple[str,dict]:
    """Add build/runtime hooks and one certified air-advance alternative."""
    if 'liNativeMaxAirAdvance(' in source or 'FS_NATIVE_MAX_ZERO' in source:
        raise ValueError('Native max-height acceleration already patched')
    before=source
    retained={name:[_sha(body) for _,_,body in _functions(source,name)] for name in PRESERVE}
    if any(not values for values in retained.values()):
        raise ValueError('Complete source renderer and corrected native march are required')
    matches=_functions(source,'march')
    if len(matches)!=1:raise ValueError('Expected exactly one native march function')
    a,b,old=matches[0]
    boundary='        advance=min(advance,4.);'
    if old.count(boundary)!=1 or 'if(hgt>ENV)' not in old:
        raise ValueError('Corrected native high-air fallback boundary changed')
    new=old.replace(boundary,boundary+'\n        advance=max(advance,liNativeMaxAirAdvance(p,rd,tmax-t));',1)
    source=source[:a]+AIR_GLSL+'\n\n'+new+source[b:]
    marker='async function main() {'
    if source.count(marker)!=1:raise ValueError('Native main runtime hook boundary changed')
    source=source.replace(marker,RUNTIME+'\n\n'+marker,1)
    for name,expected in retained.items():
        if [_sha(body) for _,_,body in _functions(source,name)]!=expected:
            raise ValueError('Acceleration changed retained source function '+name)
    scan=_reserved_declarations(AIR_GLSL+'\n'+BUILD_ZERO+'\n'+BUILD_POOL)
    report={
        'schema':'lijiang-native-maxheight-transform-v1','revision':REVISION,
        'inputSha256':_sha(before),'outputSha256':_sha(source),
        'marchAdvance':{'originalSha256':_sha(old),'replacementSha256':_sha(new),'change':'max(existing4mFallback,certifiedCellExitInset)'},
        'addedFunction':{'name':'liNativeMaxAirAdvance','sha256':_sha(AIR_GLSL)},
        'preservedFunctionSha256':retained,
        'data':'Actual world.hTex; 5x5 maximum support at level0, then exact 2x2 maxima. Next-power-of-two grid avoids dropped odd-dimension edge cells.',
        'certificate':'Within one mip world cell, min(ray endpoint heights)>cellMaxHeight+ENV+0.05m; jump remains at least0.005m inside the cell exit. Otherwise unchanged4m fallback.',
        'scope':'Only hgt>ENV and y>60 air branch inside the retained native peak search; primary/reflection use the same field.',
        'runtime':'Generate wrapper builds once; renderSample wrapper binds complete R32F mip pyramid on unit14. No gl.generateMipmap.',
        'feedbackAvoidance':'Each reduced level renders to a separate temporary texture, then copyTexSubImage2D writes the final mip; no sample/attachment feedback.',
        'memory4096':{'persistentBytes':sum(4*(4096>>i)**2 for i in range(13)),'largestTemporaryBytes':4*2048**2},
        'diagnostics':'window.lijiangNativeMaxHeight.getState()/setEnabled(); maxskip=0 selects the exact unchanged4m baseline using the same built field.',
        'staticGLSLDeclarations':scan,'gpuStarted':False,'qualityStatus':'candidate; actual WebGL compile/frame comparison required',
    }
    return source,report
