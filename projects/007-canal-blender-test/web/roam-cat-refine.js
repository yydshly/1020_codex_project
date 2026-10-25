// Independent character study. Metres, Y up, +Z forward, paw soles at Y = 0.
// The controller owns the root transform; update() reads it for stance-foot locking.
export function createCat(THREE) {
  const object = new THREE.Group();
  object.name = "RoamCatRefined";
  object.userData = { forwardAxis: "+Z", upAxis: "+Y", groundAnchor: "paw soles", version: "anatomy-study-01" };
  const anatomy = new THREE.Group();
  const anatomyScale = new THREE.Vector3(.96,.85,.85);
  anatomy.scale.copy(anatomyScale); object.add(anatomy);
  const pawGroundOffset=.0175*anatomyScale.y;
  const geometries = new Set();
  const materials = new Set();
  const coatShaders = new Set();
  let disposed = false;
  let elapsed = 0;
  let phase = 0;
  let active = 0;
  let travelSinceRest = 0;
  let restTime = 0;
  let wasMoving = false;
  let initialized = false;
  const previousRoot = new THREE.Vector3();
  const coatAnchor = new THREE.Vector3();
  const coatYaw = new THREE.Vector2(0, 1);

  function ownGeometry(value) { geometries.add(value); return value; }
  function material(color, roughness = .82) {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.add(result); return result;
  }
  const fur = material("#bc8751", .88);
  fur.onBeforeCompile = shader => {
    shader.uniforms.catAnchor = { value: coatAnchor };
    shader.uniforms.catYaw = { value: coatYaw };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCatWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvCatWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vCatWorld; uniform vec3 catAnchor; uniform vec2 catYaw;
      float furHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float furNoise(vec3 p) {
        vec3 a=floor(p),b=fract(p); b=b*b*(3.0-2.0*b);
        return mix(mix(mix(furHash(a),furHash(a+vec3(1,0,0)),b.x),mix(furHash(a+vec3(0,1,0)),furHash(a+vec3(1,1,0)),b.x),b.y),mix(mix(furHash(a+vec3(0,0,1)),furHash(a+vec3(1,0,1)),b.x),mix(furHash(a+vec3(0,1,1)),furHash(a+vec3(1,1,1)),b.x),b.y),b.z);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 cp=vCatWorld-catAnchor;
      cp.xz=mat2(catYaw.y,catYaw.x,-catYaw.x,catYaw.y)*cp.xz;
      cp/=vec3(.96,.85,.85);
      float broad=furNoise(cp*vec3(34.0,24.0,18.0));
      float stripe=smoothstep(.59,.94,sin(cp.z*75.0+cp.y*23.0+broad*3.8)*.5+.5);
      float side=smoothstep(.025,.07,abs(cp.x));
      float chin=smoothstep(.31,.38,cp.z)*(1.0-smoothstep(.34,.37,cp.y));
      float bib=smoothstep(.11,.22,cp.z)*(1.0-smoothstep(.25,.34,cp.y));
      float belly=(1.0-smoothstep(.22,.26,cp.y))*(1.0-smoothstep(.07,.11,abs(cp.x)));
      float socks=1.0-smoothstep(.055,.095,cp.y+furNoise(cp*85.0)*.012);
      float pale=clamp(max(max(chin,bib),max(belly*.72,socks)),0.0,1.0);
      float strands=furNoise(cp*vec3(620.0,145.0,520.0));
      diffuseColor.rgb*=mix(.66,1.08,broad)*mix(1.0,.62,stripe*mix(.45,1.0,side));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.71,.62),pale*.93);
      diffuseColor.rgb*=mix(.91,1.06,strands);
    `);
    coatShaders.add(shader);
  };
  fur.customProgramCacheKey = () => "natural-cat-coat-01";
  const dark = material("#211a16", .47);
  const earMaterial = material("#967967", .95);
  const eyeMaterial = material("#9d995f", .17);
  const pupilMaterial = material("#121b16", .12);
  const noseMaterial = material("#815548", .72);
  const whiskerMaterial = material("#b9b0a0", .9);
  const sphere = ownGeometry(new THREE.SphereGeometry(1, 16, 12));

  function mesh(parent, geometry, surface, name, at = [0, 0, 0], scale) {
    const entry = new THREE.Mesh(geometry, surface);
    entry.name = name; entry.position.set(...at);
    if (scale) entry.scale.set(...scale);
    entry.castShadow = true; entry.receiveShadow = true;
    parent.add(entry); return entry;
  }
  function ellipsoid(parent, surface, name, at, scale) { return mesh(parent, sphere, surface, name, at, scale); }

  // One continuous silhouette from rump through chest and neck to the muzzle.
  const profile = [
    [-.285,.305,.008,.014],[-.255,.305,.066,.078],[-.21,.305,.091,.111],
    [-.145,.305,.089,.101],[-.06,.303,.076,.088],[.035,.307,.069,.085],
    [.115,.32,.076,.102],[.17,.333,.071,.104],[.207,.349,.059,.085],
    [.247,.367,.067,.072],[.285,.376,.075,.068],[.322,.373,.069,.061],
    [.354,.36,.05,.045],[.385,.343,.035,.027],[.407,.339,.015,.015],[.415,.34,.001,.002]
  ];
  function profileSample(t, component) {
    const index = t * (profile.length - 1), i = Math.floor(index), f = index - i;
    const p0 = profile[Math.max(0, i - 1)][component];
    const p1 = profile[Math.min(profile.length - 1, i)][component];
    const p2 = profile[Math.min(profile.length - 1, i + 1)][component];
    const p3 = profile[Math.min(profile.length - 1, i + 2)][component];
    return Math.max(component >= 2 ? .001 : -Infinity, .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f));
  }
  const bodyPositions = [], bodyIndices = [];
  const rings = 64, sides = 32;
  for (let i = 0; i <= rings; i++) {
    const t = i/rings, z=profileSample(t,0), cy=profileSample(t,1), rx=profileSample(t,2), ry=profileSample(t,3);
    for (let j = 0; j <= sides; j++) {
      const a = j/sides * Math.PI*2;
      bodyPositions.push(Math.cos(a)*rx, cy+Math.sin(a)*ry, z);
      if (i < rings && j < sides) {
        const q = i*(sides+1)+j;
        bodyIndices.push(q,q+1,q+sides+1,q+1,q+sides+2,q+sides+1);
      }
    }
  }
  const bodyGeometry = ownGeometry(new THREE.BufferGeometry());
  bodyGeometry.setAttribute("position",new THREE.Float32BufferAttribute(bodyPositions,3));
  bodyGeometry.setIndex(bodyIndices); bodyGeometry.computeVertexNormals();
  const torso = new THREE.Group(); anatomy.add(torso);
  mesh(torso,bodyGeometry,fur,"ContinuousTorsoNeckHead");

  function ear(side) {
    const shape = ownGeometry(new THREE.BufferGeometry());
    const points = [
      side*.025,.414,.267, side*.081,.408,.265, side*.077,.495,.257,
      side*.025,.412,.307, side*.08,.409,.302, side*.077,.49,.267
    ];
    shape.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
    shape.setIndex(side > 0 ? [0,2,1,3,4,5,0,1,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,4] : [0,1,2,3,5,4,0,4,1,0,3,4,0,5,3,0,2,5,1,5,2,1,4,5]);
    shape.computeVertexNormals(); mesh(torso,shape,fur,"TaperedEar");
    const inner = ownGeometry(new THREE.BufferGeometry());
    inner.setAttribute("position",new THREE.Float32BufferAttribute([side*.039,.421,.307,side*.072,.418,.303,side*.073,.477,.277],3));
    inner.setIndex(side > 0 ? [0,1,2] : [0,2,1]); inner.computeVertexNormals();
    const ear = mesh(torso,inner,earMaterial,"InnerEar"); ear.material.side=THREE.DoubleSide;
  }
  ear(-1); ear(1);
  const eyes = [];
  for (const side of [-1,1]) {
    const eye = new THREE.Group(); eye.position.set(side*.05,.387,.352); eye.rotation.y=side*.48;
    torso.add(eye);
    ellipsoid(eye,dark,"AlmondEyeRim",[0,0,0],[.020,.010,.006]);
    ellipsoid(eye,eyeMaterial,"MutedIris",[0,0,.004],[.016,.008,.0045]);
    ellipsoid(eye,pupilMaterial,"VerticalPupil",[0,0,.008],[.0025,.007,.0015]);
    eyes.push(eye);
  }
  ellipsoid(torso,noseMaterial,"SmallNose",[0,.345,.415],[.012,.008,.004]);
  // Fine whiskers are thin, curved strands rather than large protruding rods.
  for (const side of [-1,1]) for (let row=0; row<3; row++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side*.023,.335+row*.006,.39),
      new THREE.Vector3(side*.066,.332+row*.009,.402),
      new THREE.Vector3(side*.11,.323+row*.014,.395)
    ]);
    mesh(torso,ownGeometry(new THREE.TubeGeometry(curve,8,.00042,3,false)),whiskerMaterial,"FineWhisker");
  }

  // Continuous tapered tubes follow solved joints, so limbs have no ball seams.
  function legTube() {
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(21*11*3),3).setUsage(THREE.DynamicDrawUsage));
    const indices=[];
    for(let i=0;i<20;i++) for(let j=0;j<10;j++) {
      const q=i*11+j; indices.push(q,q+1,q+11,q+1,q+12,q+11);
    }
    geometry.setIndex(indices); return geometry;
  }
  const legs=[];
  for(const front of [false,true]) for(const side of [-1,1]) {
    const x=side*(front?.055:.065), z=front?.151:-.205;
    const skin=mesh(anatomy,legTube(),fur,`${front?"Fore":"Hind"}LegSkin`);
    skin.frustumCulled=false;
    const paw=ellipsoid(anatomy,fur,"GroundedPaw",[x,.0175,z+.024],[.027,.0175,.042]);
    legs.push({front,side,x,z,skin,paw,planted:new THREE.Vector3(),swingStart:new THREE.Vector3(),swingEnd:new THREE.Vector3(),foot:new THREE.Vector3(),swing:false,settling:false,settleProgress:0,lastPhase:0,footYaw:0});
  }
  const tail = new THREE.Group(); tail.position.set(0,.326,-.265); torso.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0),new THREE.Vector3(-.015,.02,-.08),new THREE.Vector3(-.065,.075,-.16),new THREE.Vector3(-.11,.17,-.19),new THREE.Vector3(-.105,.25,-.165),new THREE.Vector3(-.065,.29,-.12),new THREE.Vector3(-.02,.28,-.1)
  ]);
  const tailGeometry=ownGeometry(new THREE.TubeGeometry(tailCurve,32,.022,10,false));
  // Taper the stock tube towards its tip without altering its centreline.
  const tailAttribute=tailGeometry.attributes.position;
  for(let i=0;i<=32;i++) {
    const centre=tailCurve.getPointAt(i/32), taper=1-.5*Math.pow(i/32,1.5);
    for(let j=0;j<=10;j++) {
      const k=i*11+j;
      tailAttribute.setXYZ(k,centre.x+(tailAttribute.getX(k)-centre.x)*taper,centre.y+(tailAttribute.getY(k)-centre.y)*taper,centre.z+(tailAttribute.getZ(k)-centre.z)*taper);
    }
  }
  tailGeometry.computeVertexNormals(); mesh(tail,tailGeometry,fur,"TaperedExpressiveTail");
  ellipsoid(tail,fur,"RoundedTailEnd",[-.02,.28,-.1],[.011,.011,.011]);

  function toWorld(local,target) {
    const yaw=object.rotation.y,s=Math.sin(yaw),c=Math.cos(yaw);
    const x=local.x*anatomyScale.x,z=local.z*anatomyScale.z;
    return target.set(object.position.x+x*c+z*s,object.position.y+local.y*anatomyScale.y,object.position.z-x*s+z*c);
  }
  function toLocal(world,target) {
    const yaw=object.rotation.y,s=Math.sin(yaw),c=Math.cos(yaw),x=world.x-object.position.x,z=world.z-object.position.z;
    return target.set((x*c-z*s)/anatomyScale.x,(world.y-object.position.y)/anatomyScale.y,(x*s+z*c)/anatomyScale.z);
  }
  function solveJoint(start,end,a,b,bend) {
    const dy=end.y-start.y,dz=end.z-start.z,d=Math.max(.001,Math.hypot(dy,dz));
    const reach=Math.min(a+b-.001,Math.max(Math.abs(a-b)+.001,d));
    const along=(a*a-b*b+reach*reach)/(2*reach),normal=Math.sqrt(Math.max(0,a*a-along*along));
    return new THREE.Vector3((start.x+end.x)*.5,start.y+dy/d*along+dz/d*normal*bend,start.z+dz/d*along-dy/d*normal*bend);
  }
  function updateLegSkin(leg,foot,bob) {
    const start=new THREE.Vector3(leg.x,(leg.front?.322:.323)+bob,leg.z);
    const ankle=new THREE.Vector3(foot.x,foot.y+.024,foot.z-.012);
    let points;
    if(leg.front) {
      const elbow=solveJoint(start,ankle,.164,.153,-1);
      points=[start,elbow,ankle];
    } else {
      const hock=new THREE.Vector3(ankle.x,ankle.y+.045,ankle.z-.022);
      const knee=solveJoint(start,hock,.158,.15,1);
      points=[start,knee,hock,ankle];
    }
    const curve=new THREE.CatmullRomCurve3(points,false,"centripetal");
    const positions=leg.skin.geometry.attributes.position;
    for(let i=0;i<=20;i++) {
      const t=i/20,p=curve.getPoint(t),tangent=curve.getTangent(t).normalize();
      const axis=new THREE.Vector3(1,0,0),second=new THREE.Vector3().crossVectors(tangent,axis).normalize();
      axis.crossVectors(second,tangent).normalize();
      let radius=leg.front ? .037*(1-t)+.014*t : .055*Math.pow(1-t,2)+.016;
      if(!leg.front) radius*=1+.13*Math.sin(t*Math.PI);
      for(let j=0;j<=10;j++) {
        const a=j/10*Math.PI*2,dx=Math.cos(a)*radius,dy=Math.sin(a)*radius;
        positions.setXYZ(i*11+j,p.x+axis.x*dx+second.x*dy,p.y+axis.y*dx+second.y*dy,p.z+axis.z*dx+second.z*dy);
      }
    }
    positions.needsUpdate=true;leg.skin.geometry.computeVertexNormals();
  }
  const temp=new THREE.Vector3();
  function resetFeet() {
    for(const leg of legs) {
      toWorld(temp.set(leg.x,.0175,leg.z+.018),leg.planted);
      leg.foot.copy(leg.planted);leg.swingStart.copy(leg.planted);leg.swingEnd.copy(leg.planted);
      leg.swing=false;leg.settling=false;leg.lastPhase=0;leg.footYaw=object.rotation.y;
    }
    travelSinceRest=0;restTime=0;wasMoving=false;phase=0;
    previousRoot.copy(object.position);initialized=true;
  }
  function update(delta,state={}) {
    if(disposed) return;
    const dt=Math.min(.1,Math.max(0,Number.isFinite(delta)?delta:0));
    elapsed=Number.isFinite(state.time)?state.time:elapsed+dt;
    if(!initialized || state.reset || object.position.distanceTo(previousRoot)>1) resetFeet();
    const dx=object.position.x-previousRoot.x,dz=object.position.z-previousRoot.z;
    const distance=Math.hypot(dx,dz),speed=dt>0?distance/dt:0;
    const moving=(state.moving??speed>.01)&&speed>.005;
    if(moving) {
      if(!wasMoving) {travelSinceRest=0;phase=0;}
      travelSinceRest+=distance;restTime=0;
    } else { restTime+=dt; }
    active+=(Number(moving)-active)*(1-Math.exp(-dt*10));
    const run=THREE.MathUtils.smoothstep(speed,.95,1.6);
    // Short first steps let all four paws leave a neutral standing pose without
    // dragging the last support foot through a full steady-speed stride.
    const stride=.16+(.24+run*.20)*THREE.MathUtils.smoothstep(travelSinceRest,0,.6),duty=.73-run*.16;
    phase=(phase+distance/(stride*anatomyScale.z))%1;
    const bob=active*(.0025*Math.sin(phase*Math.PI*4))+(1-active)*Math.sin(elapsed*1.8)*.0014;
    torso.position.y=bob;torso.rotation.z=Math.sin(phase*Math.PI*2)*.012*active;
    for(const leg of legs) {
      const walkOffset=leg.front?(leg.side<0?.75:.25):(leg.side<0?0:.5);
      // Preserve footfall order during acceleration. Blending phase offsets
      // mid-stance can hold one planted paw for almost an extra cycle.
      const localPhase=(phase+walkOffset)%1;
      const swinging=localPhase>=duty && moving;
      const ahead=stride*duty*.50;
      if(!moving) {
        if(leg.swing) {
          leg.planted.copy(leg.foot);leg.swing=false;
        }
        toWorld(temp.set(leg.x,.0175,leg.z+.018),leg.swingEnd);
        const delay=(leg.front?(leg.side<0?0:2):(leg.side<0?3:1))*.13;
        if(!leg.settling && restTime>=delay && leg.foot.distanceTo(leg.swingEnd)>.018) {
          leg.settling=true;leg.settleProgress=0;leg.swingStart.copy(leg.foot);
        }
        if(leg.settling) {
          leg.settleProgress=Math.min(1,leg.settleProgress+dt/.2);
          const f=leg.settleProgress,ease=f*f*(3-2*f);
          leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,ease);
          leg.foot.y+=Math.sin(f*Math.PI)*.025;
          if(f===1) {leg.settling=false;leg.planted.copy(leg.foot);}
        } else {
          leg.foot.copy(leg.planted);
        }
        leg.footYaw+=(object.rotation.y-leg.footYaw)*(1-Math.exp(-dt*7));
      } else if(swinging) {
        leg.settling=false;
        if(!leg.swing) leg.swingStart.copy(leg.foot);
        const f=(localPhase-duty)/(1-duty),ease=f*f*(3-2*f);
        toWorld(temp.set(leg.x,.0175,leg.z+ahead),leg.swingEnd);
        leg.foot.lerpVectors(leg.swingStart,leg.swingEnd,ease);
        const ground=state.sampleHeight?.(leg.foot.x,leg.foot.z);
        leg.foot.y=(Number.isFinite(ground)?ground:object.position.y)+pawGroundOffset+Math.sin(f*Math.PI)*(.038+run*.021);
        leg.footYaw=object.rotation.y;
      } else {
        leg.settling=false;
        if(leg.swing) {leg.planted.copy(leg.foot);leg.planted.y=object.position.y+pawGroundOffset;}
        // Match the controller's local ground plane; horizontal stance remains locked.
        const ground=state.sampleHeight?.(leg.planted.x,leg.planted.z);
        leg.planted.y=(Number.isFinite(ground)?ground:object.position.y)+pawGroundOffset;
        leg.foot.copy(leg.planted);
      }
      leg.swing=swinging;leg.lastPhase=localPhase;
      toLocal(leg.foot,temp);
      // Turn-in-place or reset cannot stretch a limb beyond its anatomical reach.
      temp.x=THREE.MathUtils.clamp(temp.x,leg.x-.065,leg.x+.065);
      temp.z=THREE.MathUtils.clamp(temp.z,leg.z-.18,leg.z+.18);
      leg.paw.position.copy(temp);leg.paw.rotation.y=leg.footYaw-object.rotation.y;
      leg.paw.rotation.x=swinging?Math.sin((localPhase-duty)/(1-duty)*Math.PI)*-.12:0;
      updateLegSkin(leg,temp,bob);
    }
    tail.rotation.y=Math.sin(elapsed*1.05)*(.11+active*.08);
    tail.rotation.x=-.12*active+Math.sin(elapsed*.68)*.025;
    const blink=(elapsed+1.2)%5.3;
    eyes.forEach(eye=>eye.scale.y=blink<.14?1-.94*Math.sin(blink/.14*Math.PI):1);
    coatAnchor.copy(object.position);coatYaw.set(Math.sin(object.rotation.y),Math.cos(object.rotation.y));
    previousRoot.copy(object.position);
    wasMoving=moving;
    object.userData.gait={speed,phase,stanceFeet:legs.filter(leg=>!leg.swing&&!leg.settling).length};
  }
  function dispose() {
    if(disposed)return;disposed=true;object.removeFromParent();
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
    geometries.clear();materials.clear();coatShaders.clear();
  }
  update(0);
  function getDebugState() {
    return { version: object.userData.version, root: object.position.toArray(), gait: {...object.userData.gait}, feet: legs.map(leg=>({
      name: `${leg.front?"front":"hind"}-${leg.side<0?"left":"right"}`, stance: !leg.swing&&!leg.settling,
      world: leg.foot.toArray(), local: leg.paw.position.clone().multiply(anatomyScale).toArray(),
      groundClearance: leg.foot.y-object.position.y-pawGroundOffset
    })) };
  }
  return {object,update,dispose,getDebugState};
}
