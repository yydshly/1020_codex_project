// Shared finite-depth water algorithm; independently sized station basin and direction-aware passenger-boat wake.
import {Reflector} from '../canal-real/vendor/three/examples/jsm/objects/Reflector.js';

// Metres, seconds, a finite-depth gravity/capillary spectrum. This is a quiet
// canal: displacement is centimetres, with a separate sub-centimetre slope band.
// Both reflection and refraction contain the current 3D scene and camera.
export function createStationWater({THREE,renderer,scene,camera}) {
  const COUNT=36, waves=[];
  // Long, millimetric gravity waves travel through the smaller wind ripples.
  // They organize the reflections into slow bands without ocean-size swell.
  for(const [wavelength,amplitude,direction]of [[11,.0045,.12],[7.5,.0052,-.22],[5.2,.0045,.4],[3.8,.0035,.8]]){
    const k=2*Math.PI/wavelength;waves.push(new THREE.Vector4(Math.sin(direction)*k,Math.cos(direction)*k,amplitude,Math.sqrt((9.81*k+.000074*k*k*k)*Math.tanh(k*2.4))));
  }
  for(let i=0;i<COUNT-4;i++) {
    const wavelength=3.2*Math.pow(.875,i),k=2*Math.PI/wavelength;
    const direction=.28+Math.sin(i*12.9898)*.9+(i%3===0?Math.PI*.52:0);
    const amplitude=(i<20?.0039:.0012)*Math.pow(wavelength/3.2,.72);
    const omega=Math.sqrt((9.81*k+.000074*k*k*k)*Math.tanh(k*2.4));
    waves.push(new THREE.Vector4(Math.sin(direction)*k,Math.cos(direction)*k,amplitude,omega));
  }
  const dimensions=new THREE.Vector2(),inverseModel=new THREE.Matrix4();
  const refraction=new THREE.WebGLRenderTarget(1024,640,{type:THREE.HalfFloatType,depthBuffer:true});
  refraction.depthTexture=new THREE.DepthTexture(1024,640,THREE.UnsignedIntType);
  const uniforms={
    ...THREE.UniformsLib.fog,
    color:{value:new THREE.Color(0xffffff)},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},
    uTime:{value:0},uWaves:{value:waves},uInverseModel:{value:inverseModel},
    uWakePosition:{value:new THREE.Vector2(10000,10000)},uWakeSpeed:{value:0},uWakeAxis:{value:new THREE.Vector2(0,-1)},
    uRefraction:{value:null},uDepth:{value:null},
    uProjectionInverse:{value:new THREE.Matrix4()},uViewProjection:{value:new THREE.Matrix4()},
    uDeep:{value:new THREE.Color(0x263e40)},uAbsorption:{value:new THREE.Vector3(.32,.18,.21)},
    uReflectionTexel:{value:new THREE.Vector2(1/1536,1/1536)}
  };
  const spectrum=/* glsl */`
    uniform float uTime;
    uniform vec4 uWaves[36];
    uniform vec2 uWakePosition;
    uniform float uWakeSpeed;
    uniform vec2 uWakeAxis;
    float phaseOffset(int i){return fract(sin(float(i)*127.1+17.3)*43758.5453)*6.2831853;}
    float bankDamping(vec2 p){return smoothstep(0.015,0.32,20.0-abs(p.x));}
    // A broad, slowly shifting breeze leaves quiet and lightly rippled water
    // within the same reach. Include the amplitude gradient in the normal.
    vec3 windPatch(vec2 p){
      float a=dot(p,vec2(.14,.11))-.028*uTime,b=dot(p,vec2(.32,-.09))+.018*uTime;
      float first=.55+.45*sin(a),second=.8+.2*sin(b);
      vec2 gradient=.55*(.45*cos(a)*vec2(.14,.11)*second+first*.2*cos(b)*vec2(.32,-.09));
      return vec3(.45+.55*first*second,gradient);
    }
    // The current carries the small hull toward -Z. A subdued V-shaped train
    // trails it; millimetric radial ripples remain while the boat gently bobs.
    vec3 hullWake(vec2 p){
      vec2 forward=normalize(uWakeAxis),lateral=vec2(-forward.y,forward.x);
      vec2 delta=p-uWakePosition,q=vec2(dot(delta,lateral),-dot(delta,forward));float r=max(length(q),.025);
      float phase=24.0*r-5.0*uTime,radial=.00085*exp(-r/.65);
      float height=radial*sin(phase);
      vec2 slope=radial*(24.0*cos(phase)-sin(phase)/.65)*q/r;
      float aft=max(q.y,0.0),t=clamp(aft/.5,0.0,1.0),start=t*t*(3.0-2.0*t);
      float startDerivative=(aft>0.0&&aft<.5)?12.0*t*(1.0-t):0.0;
      float band=abs(q.x)-.34*aft,e=exp(-band*band/.08);
      float train=e*sin(10.0*band),derivative=e*(10.0*cos(10.0*band)-25.0*band*sin(10.0*band));
      float strength=.035*clamp(uWakeSpeed/2.5,0.0,1.0)*exp(-aft/3.5);
      height+=strength*start*train;
      slope.x+=strength*start*derivative*sign(q.x);
      slope.y+=strength*((startDerivative-start/3.5)*train-.34*start*derivative);
      return vec3(height,slope.x*lateral-slope.y*forward);
    }
  `;
  const shader={name:'FiniteDepthCanalWater',uniforms,
    vertexShader:/* glsl */`
      uniform mat4 textureMatrix,uInverseModel,uViewProjection;
      varying vec3 vWorld,vSurfaceView;
      varying vec4 vReflected,vRefracted;
      #include <common>
      #include <fog_pars_vertex>
      ${spectrum}
      void main(){
        vec3 world=(modelMatrix*vec4(position,1.0)).xyz;
        vec2 p=world.xz;float damp=bankDamping(p);
        vec3 displacement=vec3(0.0);
        for(int i=0;i<24;i++){
          vec4 w=uWaves[i];float phase=dot(w.xy,p)-w.w*uTime+phaseOffset(i);
          float strength=i<4?1.0:windPatch(p).x;
          displacement.y+=strength*w.z*sin(phase);
          displacement.xz+=strength*.12*w.z*normalize(w.xy)*cos(phase);
        }
        displacement.y+=hullWake(p).x;
        world+=displacement*damp;
        // Millimetric meniscus only; the quay itself carries the wet algae line.
        world.y+=.002*exp(-max(0.0,20.0-abs(p.x))*35.0);
        vec4 local=uInverseModel*vec4(world,1.0);
        vWorld=world;vReflected=textureMatrix*local;
        vRefracted=uViewProjection*vec4(world,1.0);
        vec4 mvPosition=viewMatrix*vec4(world,1.0);vSurfaceView=mvPosition.xyz;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */`
      uniform sampler2D tDiffuse,uRefraction,uDepth;
      uniform mat4 textureMatrix,uInverseModel,uProjectionInverse;
      uniform vec3 uDeep,uAbsorption;
      uniform vec2 uReflectionTexel;
      varying vec3 vWorld,vSurfaceView;
      varying vec4 vReflected,vRefracted;
      #include <common>
      #include <fog_pars_fragment>
      ${spectrum}
      vec3 cameraPoint(vec2 uv,float depth){
        vec4 p=uProjectionInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
        return p.xyz/p.w;
      }
      void main(){
        vec2 slope=vec2(0.0);float damp=bankDamping(vWorld.xz);
        for(int i=0;i<36;i++){
          vec4 w=uWaves[i];float phase=dot(w.xy,vWorld.xz)-w.w*uTime+phaseOffset(i);
          // Footprint filtering avoids distant capillary shimmer and moire.
          float footprint=max(length(vec2(dFdx(phase),dFdy(phase))),.0001);
          float bandWeight=1.0-smoothstep(.8,2.8,footprint);
          vec3 strength=i<4?vec3(1.0,0.0,0.0):windPatch(vWorld.xz);
          slope+=(w.xy*w.z*cos(phase)*strength.x+w.z*sin(phase)*strength.yz)*bandWeight*damp;
        }
        slope+=hullWake(vWorld.xz).yz*damp;
        vec3 N=normalize(vec3(-slope.x,1.0,-slope.y));
        vec3 V=normalize(cameraPosition-vWorld);
        float ndv=clamp(dot(N,V),.001,1.0);
        float fresnel=.02037+.97963*pow(1.0-ndv,5.0);
        vec3 ray=reflect(-V,N),flatRay=reflect(-V,vec3(0.0,1.0,0.0));
        // Project the changed reflected direction through the same virtual
        // camera rather than adding unrelated screen-space noise.
        vec3 sampleOffset=(ray-flatRay)*mix(1.8,4.8,1.0-ndv);
        vec4 reflected=vReflected+textureMatrix*uInverseModel*vec4(sampleOffset,0.0);
        vec2 ruv=reflected.xy/reflected.w;
        vec2 blur=uReflectionTexel*mix(.8,2.4,1.0-ndv);
        vec3 reflectedLight=texture2D(tDiffuse,clamp(ruv,.001,.999)).rgb*.4;
        reflectedLight+=texture2D(tDiffuse,clamp(ruv+vec2(blur.x,blur.y),.001,.999)).rgb*.15;
        reflectedLight+=texture2D(tDiffuse,clamp(ruv+vec2(-blur.x,blur.y),.001,.999)).rgb*.15;
        reflectedLight+=texture2D(tDiffuse,clamp(ruv+vec2(blur.x,-blur.y),.001,.999)).rgb*.15;
        reflectedLight+=texture2D(tDiffuse,clamp(ruv-blur,.001,.999)).rgb*.15;
        vec2 uv=vRefracted.xy/vRefracted.w*.5+.5;
        float depth=texture2D(uDepth,uv).x;
        vec3 backgroundPoint=cameraPoint(uv,depth);
        float thickness=clamp(length(backgroundPoint)-length(vSurfaceView),0.0,12.0);
        if(depth>.99999)thickness=5.0;
        // Snell distortion is depth-dependent and fades at solid intersections.
        vec2 bend=(mat3(viewMatrix)*N).xy*.018*min(thickness,1.7);
        vec2 refractedUv=clamp(uv+bend,.001,.999);
        vec3 through=texture2D(uRefraction,refractedUv).rgb;
        vec3 transmission=exp(-uAbsorption*thickness);
        vec3 subsurface=through*transmission+uDeep*(vec3(1.0)-transmission);
        // Fresnel provides the actual sky/building reflection at grazing angles.
        gl_FragColor=vec4(mix(subsurface,reflectedLight,fresnel),1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  // Keep the existing 20cm sampling through the authored street. Coarser,
  // continuous outer strips carry that same single surface beyond both ends;
  // they prevent a driven camera from revealing a clipped water rectangle.
  const geometry=new THREE.PlaneGeometry(40,1,160,900),positions=geometry.attributes.position,inner=700/900;
  for(let i=0;i<positions.count;i++){
    const coordinate=positions.getY(i)*2,magnitude=Math.abs(coordinate);
    const distance=magnitude<=inner?magnitude/inner*70:70+235*Math.pow((magnitude-inner)/(1-inner),1.35);
    positions.setY(i,Math.sign(coordinate)*distance);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new Reflector(geometry,{textureWidth:1536,textureHeight:1536,multisample:0,clipBias:.002,shader});
  mesh.name='Canal: gravity/capillary spectrum with live reflection and depth refraction';
  mesh.rotation.x=-Math.PI/2;mesh.position.set(0,-.12,-5);mesh.material.fog=true;
  const transmissionPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),mesh.position.y);
  mesh.material.toneMapped=true;mesh.renderOrder=3;
  // Reflector clones its shader uniforms; use the live material values below.
  const u=mesh.material.uniforms,renderReflection=mesh.onBeforeRender;
  // Render-target textures are owned by their targets and must not be cloned.
  u.uRefraction.value=refraction.texture;u.uDepth.value=refraction.depthTexture;
  let refracting=false,disposed=false;
  mesh.onBeforeRender=function(r,s,c){
    if(refracting||s.overrideMaterial)return;
    renderReflection.call(this,r,s,c);
  };
  scene.add(mesh);
  function resize(w,h){
    const width=Math.max(640,Math.min(1536,Math.round(w))),height=Math.max(400,Math.min(1024,Math.round(h)));
    refraction.setSize(width,height);
  }
  function update(time,body=null){
    if(disposed)return;
    u.uTime.value=time;camera.updateMatrixWorld();mesh.updateMatrixWorld();
    if(body?.direction)u.uWakeAxis.value.copy(body.direction);
    if(body?.position){u.uWakePosition.value.set(body.position.x,body.position.z);u.uWakeSpeed.value=Math.max(0,Math.min(4,Number(body.speed)||0));}
    u.uInverseModel.value.copy(mesh.matrixWorld).invert();
    u.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
    u.uViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const currentTarget=renderer.getRenderTarget(),currentXr=renderer.xr.enabled;
    const currentClipping=renderer.clippingPlanes;
    const shadowUpdate=renderer.shadowMap.autoUpdate,currentAutoClear=renderer.autoClear;
    renderer.getDrawingBufferSize(dimensions);resize(dimensions.x,dimensions.y);
    refracting=true;mesh.visible=false;
    try{
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.autoClear=true;
      // Transmission sees geometry below the water, not a foreground object
      // held between the viewer and the surface. Rendering that object into
      // this screen-space target produces a green rectangular copy at its edge.
      transmissionPlane.constant=mesh.position.y;
      renderer.clippingPlanes=[...currentClipping,transmissionPlane];
      renderer.setRenderTarget(refraction);renderer.clear();renderer.render(scene,camera);
    }finally{
      renderer.setRenderTarget(currentTarget);renderer.xr.enabled=currentXr;
      renderer.shadowMap.autoUpdate=shadowUpdate;renderer.autoClear=currentAutoClear;
      renderer.clippingPlanes=currentClipping;
      mesh.visible=true;refracting=false;
    }
  }
  function dispose(){if(disposed)return;disposed=true;scene.remove(mesh);geometry.dispose();mesh.dispose();refraction.dispose();}
  return {mesh,update,resize,dispose};
}
