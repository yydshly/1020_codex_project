// Independent character study. Metres, Y up, +Z forward, paw soles at Y = 0.
// The controller owns the root transform; update() reads it for stance-foot locking.
export function createCat(THREE) {
  const object = new THREE.Group();
  object.name = "RoamCatV3";
  object.userData = { forwardAxis: "+Z", upAxis: "+Y", groundAnchor: "paw soles", version: "feline-study-03" };
  const anatomy = new THREE.Group();
  const anatomyScale = new THREE.Vector3(.96,.85,.85);
  anatomy.scale.copy(anatomyScale); object.add(anatomy);
  const pawGroundOffset=.0175*anatomyScale.y;
  const geometries = new Set();
  const materials = new Set();
  const coatShaders = new Set();
  const textures = new Set();
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
  const fur = material("#bd8c58", .9);
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
      float stripe=smoothstep(.61,.94,sin(cp.z*67.0+cp.y*23.0+broad*3.8)*.5+.5);
      float side=smoothstep(.025,.07,abs(cp.x));
      float chin=smoothstep(.29,.33,cp.z)*(1.0-smoothstep(.391,.411,cp.y));
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
  fur.customProgramCacheKey = () => "natural-cat-coat-03";
  const dark = material("#211a16", .47);
  const earMaterial = material("#c09a8a", .94);
  const eyeMaterial = material("#b3b778", .2);
  const pupilMaterial = material("#121b16", .12);
  const noseMaterial = material("#ad8177", .65);
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

  // Compact torso and a short neck. The skull is a separate continuous sculpt;
  // its short muzzle is not the pointed end of the long body loft.
  const profile = [
    [-.285,.300,.008,.014],[-.255,.302,.066,.078],[-.21,.304,.091,.105],
    [-.145,.302,.090,.102],[-.06,.301,.080,.092],[.035,.309,.074,.092],
    [.115,.321,.075,.102],[.17,.337,.066,.091],[.205,.362,.059,.076],
    [.235,.389,.052,.057],[.260,.402,.034,.037],[.274,.405,.002,.003]
  ];
  function profileSample(t, component) {
    const index=t*(profile.length-1),i=Math.floor(index),f=index-i;
    const p0=profile[Math.max(0,i-1)][component],p1=profile[Math.min(profile.length-1,i)][component];
    const p2=profile[Math.min(profile.length-1,i+1)][component],p3=profile[Math.min(profile.length-1,i+2)][component];
    return Math.max(component>=2?.001:-Infinity,.5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f));
  }
  const bodyPositions=[],bodyIndices=[],rings=56,sides=28;
  for(let i=0;i<=rings;i++) {
    const t=i/rings,z=profileSample(t,0),cy=profileSample(t,1),rx=profileSample(t,2),ry=profileSample(t,3);
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2;
      bodyPositions.push(Math.cos(a)*rx,cy+Math.sin(a)*ry,z);
      if(i<rings&&j<sides) {const q=i*(sides+1)+j;bodyIndices.push(q,q+1,q+sides+1,q+1,q+sides+2,q+sides+1);}
    }
  }
  const bodyGeometry=ownGeometry(new THREE.BufferGeometry());
  bodyGeometry.setAttribute("position",new THREE.Float32BufferAttribute(bodyPositions,3));
  bodyGeometry.setIndex(bodyIndices);bodyGeometry.computeVertexNormals();
  const torso=new THREE.Group();anatomy.add(torso);
  mesh(torso,bodyGeometry,fur,"SoftTorsoAndShortNeck");

  // Smooth implicit union produces a single cheek/muzzle surface without ball seams.
  const facialForms=[
    [0,.412,.252,.078,.073,.066,.014],
    [-.036,.393,.279,.046,.044,.050,.013],[.036,.393,.279,.046,.044,.050,.013],
    [0,.444,.275,.061,.042,.044,.012],
    [-.022,.382,.321,.028,.022,.024,.008],[.022,.382,.321,.028,.022,.024,.008],
    [0,.365,.312,.032,.018,.024,.009],[0,.407,.312,.023,.026,.024,.009]
  ];
  function ellipsoidDistance(x,y,z,f) {
    const px=x-f[0],py=y-f[1],pz=z-f[2];
    const k0=Math.hypot(px/f[3],py/f[4],pz/f[5]);
    const k1=Math.hypot(px/(f[3]*f[3]),py/(f[4]*f[4]),pz/(f[5]*f[5]));
    return k1<1e-10?-Math.min(f[3],f[4],f[5]):k0*(k0-1)/k1;
  }
  function headDistance(x,y,z) {
    let distance=ellipsoidDistance(x,y,z,facialForms[0]);
    for(let i=1;i<facialForms.length;i++) {
      const f=facialForms[i],d=ellipsoidDistance(x,y,z,f);
      const h=Math.max(f[6]-Math.abs(distance-d),0)/f[6];
      distance=Math.min(distance,d)-h*h*f[6]*.25;
    }
    // Slight temporal flattening around the eye sockets supports visible eyelids.
    return distance;
  }
  function implicitHead() {
    const bounds=[[-.091,.091],[.343,.492],[.177,.353]];
    const counts=[32,27,31],samples=new Float32Array((counts[0]+1)*(counts[1]+1)*(counts[2]+1));
    const index=(x,y,z)=>x+(counts[0]+1)*(y+(counts[1]+1)*z);
    const at=(x,y,z)=>[bounds[0][0]+x/counts[0]*(bounds[0][1]-bounds[0][0]),bounds[1][0]+y/counts[1]*(bounds[1][1]-bounds[1][0]),bounds[2][0]+z/counts[2]*(bounds[2][1]-bounds[2][0])];
    for(let z=0;z<=counts[2];z++)for(let y=0;y<=counts[1];y++)for(let x=0;x<=counts[0];x++) samples[index(x,y,z)]=headDistance(...at(x,y,z));
    const positions=[],normals=[],step=.0006;
    function normal(p) {
      const x=headDistance(p[0]+step,p[1],p[2])-headDistance(p[0]-step,p[1],p[2]);
      const y=headDistance(p[0],p[1]+step,p[2])-headDistance(p[0],p[1]-step,p[2]);
      const z=headDistance(p[0],p[1],p[2]+step)-headDistance(p[0],p[1],p[2]-step);
      const d=Math.hypot(x,y,z)||1;return [x/d,y/d,z/d];
    }
    function triangle(a,b,c) {
      const na=normal(a),nb=normal(b),nc=normal(c);
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      if((uy*vz-uz*vy)*na[0]+(uz*vx-ux*vz)*na[1]+(ux*vy-uy*vx)*na[2]<0) {const q=b;b=c;c=q;const qn=nb.slice();nb.splice(0,3,...nc);nc.splice(0,3,...qn);}
      positions.push(...a,...b,...c);normals.push(...na,...nb,...nc);
    }
    const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
    for(let z=0;z<counts[2];z++)for(let y=0;y<counts[1];y++)for(let x=0;x<counts[0];x++) {
      const vertices=offsets.map(o=>at(x+o[0],y+o[1],z+o[2]));
      const values=offsets.map(o=>samples[index(x+o[0],y+o[1],z+o[2])]);
      if(values.every(v=>v>=0)||values.every(v=>v<0))continue;
      const intersect=(i,j)=>{const f=values[i]/(values[i]-values[j]);return vertices[i].map((v,k)=>v+(vertices[j][k]-v)*f);};
      for(const tet of tets) {
        const inside=tet.filter(i=>values[i]<0),outside=tet.filter(i=>values[i]>=0);
        if(inside.length===1)triangle(...outside.map(i=>intersect(inside[0],i)));
        else if(inside.length===3)triangle(...inside.map(i=>intersect(outside[0],i)));
        else if(inside.length===2) {
          const a=intersect(inside[0],outside[0]),b=intersect(inside[0],outside[1]),c=intersect(inside[1],outside[0]),d=intersect(inside[1],outside[1]);
          triangle(a,b,c);triangle(b,d,c);
        }
      }
    }
    const geometry=ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    return geometry;
  }
  mesh(torso,implicitHead(),fur,"RoundedFelineSkullCheeksMuzzle");

  // Broad, thin auricles, with a recessed inner bowl rather than solid cone ears.
  function ear(side) {
    const a=new THREE.Vector3(side*.030,.459,.277),b=new THREE.Vector3(side*.091,.453,.247),c=new THREE.Vector3(side*.084,.550,.238);
    function patch(inset,back,surface,name) {
      const n=8,positions=[],indices=[];
      const ids=new Map();
      for(let i=0;i<=n;i++)for(let j=0;j<=n-i;j++) {
        let u=i/n,v=j/n,w=1-u-v;
        u=inset+u*(1-3*inset);v=inset+v*(1-3*inset);w=inset+w*(1-3*inset);
        const p=a.clone().multiplyScalar(u).addScaledVector(b,v).addScaledVector(c,w);
        p.z+=back-27*u*v*w*.013;
        ids.set(i+","+j,positions.length/3);positions.push(p.x,p.y,p.z);
      }
      for(let i=0;i<n;i++)for(let j=0;j<n-i;j++) {
        const p=ids.get(i+","+j),q=ids.get((i+1)+","+j),r=ids.get(i+","+(j+1));
        indices.push(p,q,r);
        if(j<n-i-1)indices.push(q,ids.get((i+1)+","+(j+1)),r);
      }
      const geometry=ownGeometry(new THREE.BufferGeometry());geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const result=mesh(torso,geometry,surface,name);result.material.side=THREE.DoubleSide;return result;
    }
    patch(0,-.009,fur,"EarBackShell");patch(0,0,fur,"FurredEarBowl");patch(.16,.0012,earMaterial,"RecessedWarmInnerEar");
    const rimCurve=new THREE.CatmullRomCurve3([a.clone(),c.clone(),b.clone()],false,"centripetal");
    mesh(torso,ownGeometry(new THREE.TubeGeometry(rimCurve,20,.0025,5,false)),fur,"SoftEarRim");
  }
  ear(-1);ear(1);

  function almondGeometry(width,height,depth) {
    const positions=[0,0,depth],uv=[.5,.5],indices=[],rings=5,segments=32;
    for(let ring=1;ring<=rings;ring++)for(let j=0;j<=segments;j++) {
      const t=j/segments*Math.PI*2,r=ring/rings,s=Math.sin(t);
      const x=Math.cos(t)*width*r,y=s*Math.pow(Math.abs(s),.25)*height*r;
      positions.push(x,y,depth*(1-r*r));uv.push(.5+x/(2*width),.5+y/(2*height));
    }
    for(let j=0;j<segments;j++)indices.push(0,1+j,2+j);
    for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++) {
      const p=1+(ring-1)*(segments+1)+j,q=p+segments+1;indices.push(p,q,p+1,p+1,q,q+1);
    }
    const geometry=ownGeometry(new THREE.BufferGeometry());geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  const irisPixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const dx=(x-63.5)/64,dy=(y-63.5)/64,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    const streak=(Math.sin(angle*47+r*14)+Math.sin(angle*83-r*21))*.075;
    const value=(.63+.37*(1-Math.min(1,r*r)))+streak;
    const offset=(y*128+x)*4;
    irisPixels[offset]=Math.round(128*value);irisPixels[offset+1]=Math.round(145*value);irisPixels[offset+2]=Math.round(72*value);irisPixels[offset+3]=255;
  }
  const irisTexture=new THREE.DataTexture(irisPixels,128,128,THREE.RGBAFormat);irisTexture.colorSpace=THREE.SRGBColorSpace;irisTexture.needsUpdate=true;irisTexture.magFilter=THREE.LinearFilter;textures.add(irisTexture);
  eyeMaterial.color.set("#ffffff");eyeMaterial.map=irisTexture;
  const glint=material("#f7eee0",.1),eyes=[];
  for(const side of [-1,1]) {
    const eye=new THREE.Group();eye.position.set(side*.043,.424,.315);eye.rotation.y=side*.25;eye.rotation.z=side*.12;torso.add(eye);
    mesh(eye,almondGeometry(.028,.017,.004),dark,"AlmondEyelidRim");
    mesh(eye,almondGeometry(.0255,.0145,.0045),eyeMaterial,"OliveRadialIris",[0,0,.001]);
    ellipsoid(eye,pupilMaterial,"NarrowVerticalPupil",[0,0,.006],[.0032,.0132,.0018]);
    ellipsoid(eye,glint,"SmallEyeCatchlight",[-.006,.005,.0075],[.0027,.0032,.001]);eyes.push(eye);
  }
  const noseGeometry=ownGeometry(new THREE.BufferGeometry());
  noseGeometry.setAttribute("position",new THREE.Float32BufferAttribute([-.013,.395,.347,.013,.395,.347,0,.382,.354,0,.391,.357],3));
  noseGeometry.setIndex([0,1,3,1,2,3,2,0,3]);noseGeometry.computeVertexNormals();mesh(torso,noseGeometry,noseMaterial,"SmallInvertedTriangleNose");
  function fineLine(name,points,radius,surface=dark) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    mesh(torso,ownGeometry(new THREE.TubeGeometry(curve,14,radius,4,false)),surface,name);
  }
  fineLine("ShortPhiltrum",[[0,.382,.354],[0,.374,.350],[0,.371,.345]],.00085);
  for(const side of [-1,1]) {
    fineLine("MuzzleSeparation",[[0,.371,.345],[side*.012,.369,.343],[side*.022,.374,.337]],.0007);
    ellipsoid(torso,dark,"SmallNostril",[side*.009,.390,.354],[.0027,.0016,.0013]);
    for(let row=0;row<4;row++)fineLine("FineWhisker",[
      [side*.029,.380+row*.006,.341],[side*.068,.373+row*.011,.349],[side*.119,.366+row*.014,.330]
    ],.00040,whiskerMaterial);
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
    textures.forEach(texture=>texture.dispose());
    geometries.clear();materials.clear();textures.clear();coatShaders.clear();
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
