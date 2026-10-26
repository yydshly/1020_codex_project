const fs=require('fs'); const path=__dirname+'/v2_template.html'; let s=fs.readFileSync(path,'utf8');
const rep=(a,b)=>{ if(!s.includes(a)) {console.error('MISSING:',a.slice(0,110)); process.exitCode=1; return;} s=s.replace(a,b); };
const cut=(startMarker,endMarker,repl)=>{ const i=s.indexOf(startMarker); const j=s.indexOf(endMarker,i); if(i<0||j<0){console.error('CUT MISSING',startMarker); process.exitCode=1; return;} s=s.slice(0,i)+repl+s.slice(j); };
const geo=fs.readFileSync(__dirname+'/v3_geo.glsl','utf8'), shade=fs.readFileSync(__dirname+'/v3_shade.glsl','utf8');
// (r9 side) GLSL functions copied verbatim from v3_geo.glsl into the tree bound pass FS_TREEB (one source: the bound always matches treesSD)
const fnSrc=(sig)=>{ const i=geo.indexOf(sig); if(i<0){ console.error('FN MISSING',sig); process.exitCode=1; return ''; } let j=geo.indexOf('{',i), dep=0; for(;j<geo.length;j++){ if(geo[j]==='{') dep++; else if(geo[j]==='}'){ dep--; if(dep===0) break; } } return geo.slice(i,j+1); };
const TREEB_FNS=['vec2 tJit(','vec2 tLean(','float treeType(','void treeGeo(','void palmGeo('].map(fnSrc).join('\n');
if(/[`$\\]/.test(TREEB_FNS)){ console.error('TREEB_FNS: unexpected character for a JS template literal'); process.exitCode=1; }

// 1. replace canopy + march/shadow sections with instanced geometry
cut('// ---------------------------------------------------------------- canopy', '// ---------------------------------------------------------------- ocean surface', geo);
// 2. replace rock + terrain shading with the new material system
cut('// ---------------------------------------------------------------- rock\n', '// ---------------------------------------------------------------- water shading', shade);
// 3. uniforms
rep('uniform sampler2D uH, uA, uV;\nuniform sampler2D uOD0', 'uniform sampler2D uH, uA, uV;\nuniform sampler2D uTrees, uBush, uMS, uTB; uniform vec4 uTG, uBG; uniform float uVegRange;\nuniform sampler2D uOD0');
// 4. main()
rep(`  float tT=1e9; bool hitT=false;
  if(tmin<far) hitT=march(ro,rd,tmin,far,tT);`, `  float tT=1e9; bool hitT=false; vec4 inf=vec4(0);
  if(tmin<far) hitT=march(ro,rd,tmin,far,tT,inf);`);
rep('  else if(hitT){ col=shadeTerrain(ro+rd*tT,rd,tT); tt=tT; }', '  else if(hitT){ col=shadeScene(ro+rd*tT,rd,tT,inf); tt=tT; }');
rep('  if(tt>0.) col=fogApply(col,ro,rd,tt);', `  if(tt>0.) col=fogApply(col,ro,rd,tt);
  if(uDbgM==2&&!hitT) col=gWhy==1.?vec3(1,0,0):gWhy==2.?vec3(0,1,0):gWhy==3.?vec3(0,0,1):vec3(1,1,0);
  if(uDbgM==2&&hitT&&gWhy==4.) col=vec3(1,0,1);
  if(uDbgM==2&&hitW&&hitT) col=vec3(0,1,1);
  if(uDbgM==30) col=vec3(gIt/1100.);`);

// 5. placement pass: one texel per cell -> (jitter x, jitter z, ground y, size [+ species*100])
rep('// ---- FFT ocean', `// ---- vegetation instancing: decide every tree / bush from the terrain + vegetation masks
const FS_PLANTS = GLSL_COMMON + \`
uniform sampler2D uH, uV, uA; uniform vec4 uRect, uG; uniform int uKind; uniform float uDens, uRmin, uRmax; uniform vec4 uPK;
out vec4 o;
float Hs(vec2 p){ return textureLod(uH,(p-uRect.xy)*uRect.w,0.).r; }
void main(){
  vec2 c=floor(gl_FragCoord.xy);
  float kk=float(uKind);
  vec2 j=.12+.76*hash22(c*1.31+kk*17.);
  vec2 p=uG.xy+(c+j)*uG.z;
  vec2 uv=(p-uRect.xy)*uRect.w;
  vec4 vm=textureLod(uV,uv,0.), at=textureLod(uA,uv,0.);
  float h=Hs(p);
  const float e=2.;
  vec2 g=vec2(Hs(p+vec2(e,0))-Hs(p-vec2(e,0)),Hs(p+vec2(0,e))-Hs(p-vec2(0,e)))/(2.*e);
  float sl=length(g);
  const float e2=9.;
  float slB=length(vec2(Hs(p+vec2(e2,0))-Hs(p-vec2(e2,0)),Hs(p+vec2(0,e2))-Hs(p-vec2(0,e2))))/(2.*e2);   // slope ignoring flutes
  float r=hash12(c*2.17+kk*5.3), r2=hash12(c*.77+3.1+kk*1.9);
  o=vec4(j,h-.35,0.);
  float edgeB=smoothstep(.03,.15,vm.b)*smoothstep(.6,.3,vm.b)*smoothstep(1.7,2.4,h);   // back of the beach: naupaka / heliotrope band
  if(h<1.4||vm.b>(uKind==1?.6:.25)) return;
  float patchN=vnoise(p*.02+kk*3.)*.5+.5;                 // natural gaps and groves
  if(uKind==0){
    float palm=vm.g;                                    // palm suitability (lowland valley floors, back of beaches)
    float dens=vm.r*(1.-smoothstep(.45,.85,slB))*(1.-smoothstep(1.2,2.,sl))*mix(.6,1.,at.a)*mix(.55,1.,patchN)*uDens;
    // (r11 veg) the closed forest on gentle ground (valley / gorge floors) grows in clumps: dense, wider, taller crowns in the clumps,
    //  open dark gaps between them (ref.png gorge floor), not an even carpet of balls. uPK.x (URL pk0) strength, uPK.z (pk2) clump rise (m)
    float gen=(1.-smoothstep(.2,.45,slB))*smoothstep(.3,.7,vm.a)*uPK.x;
    // (r11 fix) the veg round's gaps (x(1 + 1.6 (.3 - 1)) < 0) emptied whole patches: bare olive clearings on the v1 gorge floor and, on
    //  the beach flat, only the palm-suitable cells survived -- a row of ~15 equal palms with no broadleaf canopy (v4). The canopy stays
    //  closed: gaps keep ~75 % of the crowns (smaller ones, R below), clumps ~1.15x; no clumping on the coastal strip below ~8-20 m
    gen=min(gen,1.)*smoothstep(8.,20.,h);
    float clump=smoothstep(-.3,.35,vnoise(p*.03+41.7)+.5*vnoise(p*.085+7.3));
    dens*=mix(1.,mix(.75,1.15,clump),gen);
    dens=max(dens,palm*.92);
    if(r>dens) return;
    if(vnoise(p*.065+13.7)>.45&&hash12(c*7.7+1.3)<.6&&palm<.5) return;   // small canopy gaps (dark holes in the forest seen from the air)
    float R=min(mix(uRmin,uRmax,pow(r2,1.4))*(1.-.3*smoothstep(.4,1.6,sl))*mix(.85,1.2,at.a)*mix(.72,1.18,vnoise(p*.021+71.3)*.5+.5)*mix(1.,1.25,smoothstep(.45,.85,vm.a)*(1.-smoothstep(.25,.6,slB)))*mix(1.,mix(.8,1.,clump),min(gen,1.)),uG.z*.745);   // (r8 forest) closed forest on gentle ground: crowns ~25 % wider, they overlap into one canopy (no balls on a lawn)   // groves of big and of small crowns   // <= 8.2: the widest crown stays inside the 3x3 cell search
    float r3=hash12(c*3.71+9.1);
    float grove=smoothstep(.3,.7,vnoise(p*.012+190.281)*.5+.5);   // palms grow in groves, not on a grid
    // coconut groves also spread up the flat valley floor inland (r5: palms all over the valley bottom), not just near the coast
    float valley=(1.-smoothstep(30.,75.,h))*(1.-smoothstep(.18,.42,slB))*smoothstep(3.,6.,h);
    float palmE=max(palm,valley*uPK.y);   // (r11 veg) uPK.y (URL pk1, .42): palms spread up the valley floor
    float sp=r3<palmE*mix(.05,mix(.85,.5,smoothstep(20.,45.,h)),grove*smoothstep(.25,.85,palmE))?3.:(r2>.88&&slB<.3?2.:1.);   // (r10c) no emergents on steep ground (an emergent on a slope / ridge reads as a disc on a stick on the skyline)   // dense coconut groves on the valley floor (r5, ref.png)
    // back of a beach: a coconut grove whose palms lean out over the sand; beach trees lean seaward too
    vec2 bdir=vec2(0); float nearB=0.;
    for(int i=uZero;i<12;i++){
      vec2 o2=vec2(cos(float(i)*.5236),sin(float(i)*.5236));
      float v1=textureLod(uV,(p+o2*16.-uRect.xy)*uRect.w,0.).b, v2=textureLod(uV,(p+o2*34.-uRect.xy)*uRect.w,0.).b;
      bdir+=o2*(v1+.5*v2); nearB=max(nearB,max(v1,v2*.75));
    }
    float bp=smoothstep(.12,.45,nearB)*(1.-smoothstep(5.,12.,h));
    if(sp<2.5&&hash12(c*5.17+2.3)<bp*.55){ sp=3.; }
    if(sp>2.5) R=mix(4.8,7.0,r2);   // <= 7: lean + frond reach stay inside the 3x3 cell search
    else o.z-=R*.45*smoothstep(.3,.8,sl);   // (r10c) broadleaf trees on steep ground stand lower: the downhill trunk under a wide crown read as a stick on the v4 / v5 skylines
    if(sp<2.5) o.z+=gen*clump*uPK.z;
    o.w=sp*100.+R;
    if(bp>.05&&length(bdir)>.01){
      float k=floor(mod(atan(bdir.y,bdir.x)/6.2831853*16.+16.5,16.));
      o.x+=2.*k; o.y+=2.*floor(1.+6.*bp*(.6+.4*hash12(c*3.3+1.)));
    }
  } else {
    float dens=vm.r*(1.-smoothstep(.45,.8,slB))*mix(.6,1.,patchN)*uDens*mix(1.,.3,smoothstep(.4,.85,vm.a));   // few shrubs under the closed forest canopy (hidden, and costly)
    dens=max(dens,edgeB*mix(.35,.95,smoothstep(-.3,.3,vnoise(p*.09+5.3))));   // naupaka band: clumps with sandy gaps, not a hedge
    // thickets (hau, heliotrope, guava) in a ~25 m band behind the sand: dense, tall shrub masses (the lit wall of
    // leaves at the back of the beach in r4), flagged by +10 in the size
    float nb2=0.;
    for(int i=uZero;i<8;i++){ vec2 o2=vec2(cos(float(i)*.785),sin(float(i)*.785)); nb2=max(nb2,max(textureLod(uV,(p+o2*12.-uRect.xy)*uRect.w,0.).b,textureLod(uV,(p+o2*24.-uRect.xy)*uRect.w,0.).b*.8)); }
    float thk=smoothstep(.08,.3,nb2)*(1.-smoothstep(.02,.1,vm.b))*(1.-smoothstep(6.,14.,h))*smoothstep(-.4,.1,vnoise(p*.05+8.1));
    dens=max(dens,thk*.85);
    if(r>dens) return;
    o.w=mix(uRmin,uRmax,r2)*(1.-.3*smoothstep(1.,2.,sl));
    if(edgeB>.3) o.w=mix(.9,2.3,r2*r2);
    else if(thk>.3) o.w=10.+mix(1.6,2.4,r2);
  }
}\`;

// ---- (r9 side) per tree cell bound for the 3D cell reject in treesSD: xyz = crown centre (palms: crown top), w = radius
const FS_TREEB = GLSL_COMMON + \`
uniform sampler2D uTrees; uniform vec4 uTG;
out vec4 o;
${TREEB_FNS}
void main(){
  vec2 c=floor(gl_FragCoord.xy);
  vec4 T=texelFetch(uTrees,ivec2(c),0);
  float R=mod(T.w,100.);
  if(R<.5){ o=vec4(0.,-1e5,0.,0.); return; }
  if(T.w>299.){ float seed, ht; vec3 base; vec2 lean; palmGeo(c,T,seed,base,ht,lean); o=vec4(base.x+lean.x,base.y+ht,base.z+lean.y,R*1.6+2.); return; }
  vec3 base, cen, rad; float sp, seed; treeGeo(c,T,base,cen,rad,sp,seed);
  o=vec4(cen,max(rad.x,max(rad.y,rad.z))+R*.75);
}\`;

// ---- conservative max slope within ~35 m (for safe sphere tracing near cliffs)
const FS_MAXSLOPE = GLSL_COMMON + \`
uniform sampler2D uH; uniform vec4 uRect; uniform vec2 uRes;
out vec4 o;
float Hs(vec2 p){ return textureLod(uH,(p-uRect.xy)*uRect.w,0.).r; }
void main(){
  vec2 p=uRect.xy+gl_FragCoord.xy/uRes*uRect.z;
  float m=0.; const float e=1.2;
  for(int j=uZero-6;j<=6;j++) for(int i=uZero-6;i<=6;i++){
    vec2 q=p+vec2(i,j)*5.;
    float h=Hs(q);
    m=max(m,length(vec2(Hs(q+vec2(e,0))-h,Hs(q+vec2(0,e))-h))/e);
  }
  o=vec4(m*1.15+.2,0,0,1);
}\`;

// ---- FFT ocean`);
rep(`  loadbar.style.width = '95%';
  console.log('generate ms', (performance.now() - T0).toFixed(0));`, `  // 7. every tree and bush
  loadtxt.textContent = 'Planting trees';
  const pp2 = prog(FS_PLANTS);
  const plants = (G, kind, dens, rmin, rmax) => {
    const n = Math.round(RECT[2] / G);
    const t = tex(n, n, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    gl.useProgram(pp2.p); setRect(pp2, RECT);
    bindTex(0, world.hTex); gl.uniform1i(pp2.u.uH, 0); bindTex(1, world.vTex); gl.uniform1i(pp2.u.uV, 1); bindTex(2, world.aTex); gl.uniform1i(pp2.u.uA, 2);
    gl.uniform4f(pp2.u.uG, RECT[0], RECT[1], G, 1 / G); gl.uniform1i(pp2.u.uKind, kind); gl.uniform4f(pp2.u.uPK, num('pk0', 1), num('pk1', .42), num('pk2', 0), 0);
    gl.uniform1f(pp2.u.uDens, dens); gl.uniform1f(pp2.u.uRmin, rmin); gl.uniform1f(pp2.u.uRmax, rmax);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(t)); gl.viewport(0, 0, n, n); gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { t, G };
  };
  world.trees = plants(PARAMS.treeCell, 0, PARAMS.treeDens, 2.6, 6.0);
  world.bush = plants(PARAMS.bushCell, 1, PARAMS.bushDens, 1.0, 2.4);
  { const ptb = prog(FS_TREEB), n = Math.round(RECT[2] / world.trees.G);   // (r9 side) per tree cell bounds (treesSD 3D cell reject)
    world.treeB = tex(n, n, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    gl.useProgram(ptb.p); bindTex(0, world.trees.t); gl.uniform1i(ptb.u.uTrees, 0); gl.uniform4f(ptb.u.uTG, RECT[0], RECT[1], world.trees.G, 1 / world.trees.G);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(world.treeB)); gl.viewport(0, 0, n, n); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  world.msTex = tex(1024, 1024, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
  const pms = prog(FS_MAXSLOPE);
  gl.useProgram(pms.p); setRect(pms, RECT); bindTex(0, world.hTex); gl.uniform1i(pms.u.uH, 0); gl.uniform2f(pms.u.uRes, 1024, 1024);
  await tiled(fbo(world.msTex), 1024, 1024, 512, null);
  await gpuWait();
  loadbar.style.width = '95%';
  console.log('generate ms', (performance.now() - T0).toFixed(0));`);
rep("  wind: num('wind', 9.5),", "  treeCell: num('treeCell', 6), bushCell: num('bushCell', 3), treeDens: num('treeDens', 0.9), bushDens: num('bushDens', 0.85), vegRange: num('vegRange', 2600),\n  wind: num('wind', 9.5),");
rep(`  gl.uniform3f(u.uOL, ocean.L[0], ocean.L[1], ocean.L[2]); gl.uniform1f(u.uOAmp, 1);`, `  gl.uniform3f(u.uOL, ocean.L[0], ocean.L[1], ocean.L[2]); gl.uniform1f(u.uOAmp, 1);
  bindTex(10, world.trees.t); gl.uniform1i(u.uTrees, 10); bindTex(11, world.bush.t); gl.uniform1i(u.uBush, 11);
  gl.uniform4f(u.uTG, RECT[0], RECT[1], world.trees.G, 1 / world.trees.G); gl.uniform4f(u.uBG, RECT[0], RECT[1], world.bush.G, 1 / world.bush.G);
  gl.uniform1f(u.uVegRange, PARAMS.vegRange); bindTex(12, world.msTex); gl.uniform1i(u.uMS, 12);
  bindTex(13, world.treeB); gl.uniform1i(u.uTB, 13);`);
fs.writeFileSync(path,s); console.log('patched v3');
