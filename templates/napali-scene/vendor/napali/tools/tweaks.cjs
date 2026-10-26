// Look-dev tweaks applied on top of the patched template (called by rebuild.cjs).
module.exports = (t, rep) => {
  // bare basalt on the steep seaward faces of the headlands (red-brown / dark faces from the air), green ledges and streaks left
  rep('  veg*=1.-sea*smoothstep(.12,.4,slope);', `  veg*=1.-sea*smoothstep(.12,.4,slope);
  float hR=mix(60.,180.,smoothstep(.15,.5,at.b))*(.65+.7*(fbm(p*.02+4.,2)*.5+.5));
  float faceR=smoothstep(.1,.32,at.b)*(1.-smoothstep(hR*.45,hR,h))*(.3*smoothstep(.06,.2,slope)+.7*smoothstep(.22,.42,slope));   // thin cover over red soil, bare steep faces
  faceR*=smoothstep(-.25,.25,fbm(p*.006+31.,2)+.15);           // bare faces come and go along the coast (~150 m patches)
  float keepV=smoothstep(.3,.7,fbm(p*.08+vec2(0.,h*.04),3)*.5+.5+n3*.12);
  veg*=1.-faceR*(1.-.75*keepV);`);
  // reef / rock never breaks the surface away from the shoreline
  rep('  return -max(dep,.25);', '  return -max(dep,mix(.25,1.1,smoothstep(4.,25.,w)));');
  // more bare rock on exposed seaward faces
  rep('  float sprayH=mix(25.,95.,at.b)*(.6+.8*(n1*.5+.5));', '  float sprayH=mix(22.,80.,at.b)*(.6+.8*(n1*.5+.5));');
  // sand (not rock) on the shallow sea floor in front of beaches
  rep('    o=vec4(0.,reefM,0.,0.); return;', `    float bzS=0.; for(int i=uZero;i<uNBZ;i++){ bzS=max(bzS,smoothstep(uBZ[i].z*1.3,uBZ[i].z*.8,length(p-uBZ[i].xy))); }
    o=vec4(0.,reefM*(1.-bzS),bzS*(1.-smoothstep(-2.,-4.,h)),0.); return;`);
  // no boulders on the sandy shelves in front of beaches
  rep('  dep-=(1.-smoothstep(0.,.55,v.x))*1.6*exp(-w/18.)', '  dep-=(1.-smoothstep(0.,.55,v.x))*1.6*exp(-w/18.)*(1.-cove)');
  // the swash zone of a beach is sand even where the waterline is ragged / steeper
  rep('  float beach=(1.-smoothstep(2.2,3.4+1.*n2,h))*(1.-smoothstep(.16,.34,slope))*(1.-smoothstep(30.,55.,d))*bz;', '  float lowB=smoothstep(2.,.8,h);\n  float bo=8.*vnoise(p*.028+11.3)+4.*vnoise(p*.083+5.9); bo=bo>0.?bo*(1.-smoothstep(.008,.03,slope)):bo;\n  float beach=(1.-smoothstep(2.2,3.4+1.*n2,h))*(1.-smoothstep(mix(.16,.7,lowB),mix(.34,1.2,lowB),slope))*(1.-smoothstep(32.+bo,46.+bo,d))*bz;');
  // (r5 sand: the back edge of the sand is irregular -- bays of sand between the naupaka / heliotrope clumps and lobes
  // of beach plants creeping onto it (~15-60 m along the beach), a crisper line than the 25 m blend; the sand only
  // ever gets narrower on sloping ground, so it never spreads into the cliff toe (the round-4 bzL lesson))   // (r4f: r3 sand line again -- the round-4 bzL widening painted sand on the cliff toes, removed the beach-front bushes and grew the grey flat)
  // calmer foam: fewer / smaller whitecaps, tighter crash zones around headlands and stacks
  // foam around rocks keeps holes / texture instead of going solid white
  // breaker crests: thin streaky white water instead of solid sheets
  // palms grow across lowland valley floors and gentle slopes, not just at the beach
  rep('  float palm=(1.-smoothstep(18.,40.,h))*(1.-smoothstep(.15,.35,slope))*smoothstep(3.3,5.5,h)*(1.-smoothstep(80.+40.*n2,150.+50.*n2,d))*bz;',
      '  float palm=(1.-smoothstep(40.+20.*n2,85.,h))*(1.-smoothstep(.3,.6,slope))*smoothstep(2.6,4.5,h)*mix(.7,1.,bz)*(1.-smoothstep(170.+60.*n2,420.+60.*n2,d));');
  // no grey crowns
  // short waves carry a bit more energy (choppy wind sea); total mean-square slope stays near Cox-Munk (~0.05 at 10 m/s)
  rep('    gl.uniform1f(u.uScale, PARAMS.waveScale);', '    gl.uniform1f(u.uScale, PARAMS.waveScale*[1.6, 2.6, 1.8][c]);');
  // no horizontal terracing in the height field (read as contour lines from afar)
  rep('  h=mix(h,terr,.07*smoothstep(.8,1.8,slope)*land*smoothstep(-.2,.4,fbm(p*.006+11.,3)));', '');
  // vegetation clings to near-vertical walls (Na Pali): bare rock only in vertical strips / overhangs
  rep('  float vegMax=.74+.10*n1+.05*n2+.08*at.a;', '  float fwM=smoothstep(30.,110.,d); float vegMax=.77+uVGM.z*fwM+.08*n1+.05*n2+.08*at.a-mix(.11,.2,smoothstep(.1,.4,at.b))*smoothstep(.5,.8,fbm(p*vec2(.05,.05)+vec2(fbm(p*.008,2)*4.,0.),3)*.5+.5)+.07*(1.-smoothstep(.1,.4,at.b))+.06*smoothstep(120.,380.,d)*(1.-smoothstep(.05,.3,at.b));');   // bare strips: fewer on the inland walls   (r8 forest) inland walls (> ~250 m from the sea): fern / shrub cover almost to vertical (ref.png, r9: green velvet, no bald slate slabs), a few bare strips stay   (r10m) .77 -> .77 + uVGM.z (URL vg2, .03): the r10 terrain flutes raised the land over the bare-rock threshold from 7.3 to 12.7 % (grey slabs on the v2 ridge); .80 restores ~7.8 % (offline on the terrain round's hd3 read-back)
  rep('  veg*=1.-smoothstep(.6,1.6,at.g)*smoothstep(.35,.6,slope)*.8;', `  veg*=1.-smoothstep(.9+uVGM.y*fwM,2.+uVGM.y*fwM,at.g)*smoothstep(.55+uVGM.x*fwM,.85+uVGM.x*fwM,slope)*mix(.3,.6,smoothstep(.05,.3,at.b));   // (r8 forest) inland knife-edge crests mostly green
  // red soil / rock showing through thin fern cover on convex crests and spur noses (patchy, stronger near the sea)
  veg*=1.-smoothstep(.4+uVGM.y*fwM,1.4+uVGM.y*fwM,at.g)*smoothstep(.2,.45,slope)*smoothstep(.05,.45,fbm(p*.013+17.,3)+.4*at.b)*.45*(.3+.7*smoothstep(.1,.4,at.b));
  // seaward cliffs (within ~250 m of the coast): steep faces are bare basalt, vegetation only on tops, ledges and gentler slopes (ref.png, r7, r9)
  veg*=1.-.55*(1.-smoothstep(90.+70.*n2,220.+80.*n2,d))*smoothstep(.55+uVGM.x*fwM,.75+uVGM.x*fwM,slope+.08*n3+.07*n2);`);
  // (r10m) uVGM: the r10 terrain flutes (14-56 m) made the 1.8 m slope and the 7 m convexity of FS_VEG fire far more often (offline on
  //  the r9 / r10 height read-backs, agent_out/fx/r10m/vegsh2.mjs: slope > .65 near the sea 15.4 -> 23.0 %, inland 20.1 -> 34.9 %; crest convexity
  //  share x1.8): every flute rib turned into a bare grey strip (v2 ridge). Shifts that bring the r10 shares back near r9's: x = slope
  //  onset of the crest / seaward-cliff bare terms (URL vg0, .04), y = convexity onset of the crest / red-soil terms (vg1, .6), z = vegMax (vg2, .03); all faded in with the flutes (fwM: 30-110 m from the coast, as eroFlutes) so the sea-cliff foot keeps its r9 rock
  rep('uniform sampler2D uH, uA; uniform vec4 uRect; uniform vec2 uRes;', 'uniform sampler2D uH, uA; uniform vec4 uRect; uniform vec2 uRes; uniform vec4 uVGM;');
  rep('gl.uniform4fv(pv.u.uBZ, val.BZ); gl.uniform1i(pv.u.uNBZ, val.nBZ);', 'gl.uniform4fv(pv.u.uBZ, val.BZ); gl.uniform1i(pv.u.uNBZ, val.nBZ); gl.uniform4f(pv.u.uVGM, num("vg0", .04), num("vg1", .6), num("vg2", .03), num("vg3", 1));   /* (r13 mat) vg3 */');
  // vm.a = forest weight: big tree crowns on gentle ground, in gullies and wet hollows; shrub / fern carpet on steep walls and crests
  rep('  float disp=veg*(1.-smoothstep(.45,.85,slope));', `  const float eB=9.;
  float slB=length(vec2(Hs(p+vec2(eB,0))-Hs(p-vec2(eB,0)),Hs(p+vec2(0,eB))-Hs(p-vec2(0,eB))))/(2.*eB);
  // (r13 mat) uVGM.w (URL vg3): steep little banks (stream cuts) in gentle inland ground (9 m slope < ~40 deg, > ~150 m from the sea,
  //  sheltered) stay under the forest: they were bare laterite / rock knobs on the valley floor (v5 bottom right, film t72: cobbles)
  veg=max(veg,uVGM.w*(1.-smoothstep(.55,.9,slB))*smoothstep(110.,190.,d)*step(.3,h)*(1.-beach)*(1.-smoothstep(.08,.25,at.b)));
  float disp=veg*(1.-smoothstep(.75,1.5,slB-.5*smoothstep(-.1,-.9,at.g)+.25*smoothstep(.25,1.2,at.g)-.35*at.a+.3*n2-.2*smoothstep(.0,.5,vnoise(p*.031+4.))));`);   // (r8 forest) convex spurs and crests: uluhe fern / shrub carpet (the lit lime planes of ref.png / r9), closed forest in the gullies
  // beaches: one continuous slope from the berm down into the sea (no step at the waterline)
  rep('uniform sampler2D uB, uE; uniform vec4 uRect, uDom; uniform vec2 uRes;\nuniform vec4 uSH[8]; uniform int uNSH;', 'uniform sampler2D uB, uE; uniform vec4 uRect, uDom; uniform vec2 uRes;\nuniform vec4 uSH[8]; uniform int uNSH; uniform vec4 uBZ[4]; uniform int uNBZ;');
  rep('  o=vec4(d>=0.?landH(p):seaFloor(p,-d),0,0,1);', `  float hh=d>=0.?landH(p):seaFloor(p,-d);
  float bzw=0., bzw2=0.; for(int i=uZero;i<uNBZ;i++){ float lb=length(p-uBZ[i].xy); bzw=max(bzw,smoothstep(uBZ[i].z*1.2,uBZ[i].z*.85,lb)); bzw2=max(bzw2,smoothstep(uBZ[i].z*1.75,uBZ[i].z*1.1,lb)); }
  if(bzw2>0.){
    // the coast distance field has creases along its medial axes (they read as terraces / facets on the sand):
    // smooth it over a ~13 m disc before turning it into the beach profile
    float ds=d*.16; for(int i=uZero;i<12;i++){ float a=float(i)*.5236+.4; ds+=coastD(p+vec2(cos(a),sin(a))*(6.+7.*float(i%3)))*.07; }
    // irregular waterline: soft cusps / lobes (~15-40 m) only in the swash zone (no straight shoreline)
    ds+=(2.6*vnoise(p*.04+2.7)+1.1*vnoise(p*.13+5.1))*exp(-ds*ds/300.);
    // one smooth profile through the waterline (slope ~6 deg on both sides, no ledge):
    //   backshore (gentle) -> rounded berm crest (~1.6 m) -> foreshore ~6 deg -> concave shoreface -> shelf at ~-2.3 m
    float prof;
    if(ds>=0.) prof=1.5*(1.-exp(-ds/14.))+.012*ds+.1*(exp(-pow((ds-16.)/6.,2.))-exp(-pow(16./6.,2.)))
      // (r5 sand) backshore: low wind-blown hummocks rising toward the vegetation line (.2-.9 m, ~20-60 m along the
      // beach), so the upper beach is no flat slab at eye height and the plant line rises and falls
      +smoothstep(14.,40.,ds)*(.45+.3*vnoise(p*.045+8.1)+.15*vnoise(p*.14+2.2));
    else { float u=min(-ds,46.); prof=-(.104*u-.00113*u*u)-.01*max(-ds-46.,0.); }
    float near=1.-smoothstep(30.,70.,abs(ds));
    hh=mix(hh,prof,bzw*near);
    // low ground beside / behind the beach (the land floor of landH, ~.3 m) read as a huge flat wet mirror from the
    // air: it rises at least like the beach berm
    if(ds>0.&&d>=0.) hh+=max(prof-hh,0.)*bzw2;
  }
  o=vec4(hh,0,0,1);`);
  rep('  gl.uniform4fv(ph.u.uSH, val.SH); gl.uniform1i(ph.u.uNSH, val.nSH);', '  gl.uniform4fv(ph.u.uSH, val.SH); gl.uniform1i(ph.u.uNSH, val.nSH); gl.uniform4fv(ph.u.uBZ, val.BZ); gl.uniform1i(ph.u.uNBZ, val.nBZ);');
  // aerial perspective: Rayleigh-blue haze that thickens with distance (distant ridges go blue-grey like the references)
  rep(`  vec3 fc=mix(vec3(.46,.60,.80),vec3(.95,.90,.80),pow(s,10.)*.6);
  return mix(col,fc,1.-exp(-fogAmt));`, `  float ext=1.-exp(-fogAmt);
  // thin veil = Rayleigh blue; thick haze = paler Mie grey-blue; forward scatter toward the sun
  vec3 thin=mix(vec3(.33,.41,.52),vec3(.14,.35,.55),smoothstep(.08,.45,-rd.y));   // grazing sea-level paths: salt-aerosol grey; steep paths: Rayleigh blue
  // (r8: steep veil (.20,.37,.54) -> (.14,.35,.55): from altitude the path runs through clean air, so its in-scatter is Rayleigh
  //  blue with little red; the old Mie-grey veil put R 12-24 into the open sea seen from the air, photo 0-8)
  vec3 fc=mix(mix(thin,vec3(.45,.54,.68),smoothstep(0.,.6,ext)),vec3(.95,.90,.80),pow(s,10.)*.6);
  vec3 ray=vec3(.55,.78,1.)*ext;                       // blue scatters more: slight hue shift of distant objects
  col=col*(1.-ray*.35);
  return mix(col,fc,ext);`);
  rep("fog: num('fog', 0.00004)", "fog: num('fog', 0.0002)");
  // ======== LOOK (rock / lighting / grade / sky agent) ========
  // bloom pass also carries blurred log luminance (alpha) for local contrast
  rep('  o=vec4(c*smoothstep(1.,3.,l),1.);\n}`;', '  o=vec4(c*smoothstep(1.,3.,l),log2(l+.002));\n}`;');
  rep(`  vec3 c=textureLod(uT,uv,0.).rgb*.227;
  c+=(textureLod(uT,uv+tx*1.385,0.).rgb+textureLod(uT,uv-tx*1.385,0.).rgb)*.316;
  c+=(textureLod(uT,uv+tx*3.231,0.).rgb+textureLod(uT,uv-tx*3.231,0.).rgb)*.0703;
  o=vec4(c,1.);`, `  vec4 c=textureLod(uT,uv,0.)*.227;
  c+=(textureLod(uT,uv+tx*1.385,0.)+textureLod(uT,uv-tx*1.385,0.))*.316;
  c+=(textureLod(uT,uv+tx*3.231,0.)+textureLod(uT,uv-tx*3.231,0.))*.0703;
  o=c;`);
  // grade: clarity, ACES, display-space S-curve, split tone (cool shadows / golden highlights), vibrance
  // (r7) photographic grade: the last colour step, in display space, in OkLab lightness / chroma / hue. Smooth hue bumps
  // (raised cosines) and lightness / chroma ramps only -- no hard masks, so nothing bands or shimmers. Measured against the
  // photos per material (OkLab, coarse scale):
  //  - tone: a mild S around L .55 (deeper darks, a touch more light in sand / foam / cloud)
  //  - greens: +chroma in shade / mids / lit (vibrance-limited, so the near ground-view foliage that is already rich barely
  //    moves); teal-grey shade pulled toward emerald (v1 shade h171 -> ~155, photo 141-159)
  //  - turquoise: +chroma (vibrance-limited, foam protected by its low chroma), a little darker, cyan-green -> turquoise
  //  - deep sea: cleaner royal / navy (R -> 0 as in the photos), the lighter wave faces more chroma and a little cyan
  //  - warm hues (red-brown rock, soil, sand): +chroma, a few degrees toward red-brown
  //  - soft gamut map: pull toward the grey of equal luminance instead of clipping a channel
  rep('uniform float uExpo, uSat, uSharp, uContrast;', `uniform float uExpo, uSat, uSharp, uContrast, uClar, uGrade, uDbgA, uHzG;
float grBump(float h,float c,float w){ float d=abs(mod(h-c+540.,360.)-180.); return d>=w?0.:.5+.5*cos(3.14159265*d/w); }
float grBl(float x,float c,float w){ float d=abs(x-c); return d>=w?0.:.5+.5*cos(3.14159265*d/w); }
vec3 grade7(vec3 c){
  c=clamp(c,0.,1.);
  vec3 li=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));
  float l_=pow(max(dot(li,vec3(.4122214708,.5363325363,.0514459929)),0.),1./3.);
  float m_=pow(max(dot(li,vec3(.2119034982,.6806995451,.1073969566)),0.),1./3.);
  float s_=pow(max(dot(li,vec3(.0883024619,.2817188376,.6299787005)),0.),1./3.);
  vec3 q=vec3(l_,m_,s_);
  float L=dot(q,vec3(.2104542553,.7936177850,-.0040720468)), A=dot(q,vec3(1.9779984951,-2.4285922050,.4505937099)), B=dot(q,vec3(.0259040371,.7827717662,-.8086757660));
  float C=length(vec2(A,B)); float h=degrees(atan(B,A+1e-9)); h+=h<0.?360.:0.;
  float wGr=grBump(h,135.,50.), wTq=grBump(h,207.,28.), wBl=grBump(h,252.,25.), wW=grBump(h,62.,42.);   // lime..teal-green / turquoise / ocean blue / red-brown..sand
  float cw=smoothstep(.02,.06,C), cw2=smoothstep(.012,.04,C), cwW=smoothstep(.008,.025,C);              // coloured pixels only (foam, cloud, grey rock untouched)
  float wDeep=1.-smoothstep(.55,.65,L), dk=1.-smoothstep(.3,.55,L);                                    // sea body below the sky / glare; shade..half-light
  // lightness
  float dL=.02*L*(1.-L)*(L-.55)*4.*(L<.55?smoothstep(.12,.32,L):1.)+.008*grBl(L,.75,.2);              // faint S, deepest shade kept; a touch of light in sand / foam / cloud
  dL-=.015*wGr*cw*grBl(L,.48,.2);                                                                       // green mid-tones a little deeper
  dL-=.025*grBump(h,118.,35.)*smoothstep(.05,.1,C)*smoothstep(.5,.72,L);   // (r7m: .04 -> .025, keep the lit lime luminous)                                // lit greens: rich lime, not pale (photos: most chromatic greens at L .62-.71, ours .74-.76)
  // (r7m) the hazed-teal-shade darkening (.05) is dropped: the r7 forest build already deepens the aerial shade (stacked, the
  //  v1 ridge shade bands sat 2-3 L* under the photo); the shade is made greener instead (see the shade term below)
  dL-=.03*wTq*cw2*smoothstep(.4,.62,L);                                                                 // turquoise less milky
  // (r7m) the deep-sea darkening (.025) is dropped: the r7 water body is already ~15% deeper (stacked, the v1 open sea sat 3-4 L* dark)
  dL+=.01*wBl*cw*wDeep;   // (r8m) open sea body +.01: the r8 water (no glint smears) and the r8 clean steep veil (less red) each took ~1 L* off;
                           //  stacked, v1 open sea L*50/90 22/25 vs photo 24/29 (r7m 23/28). Now 23/26, sRGB 8,59,104 vs photo 1,60,105
  dL+=.4*wBl*cw*(L-.38)*grBl(L,.38,.2);                                                                 // sea body: wave faces vs troughs (monotonic)
  // chroma
  float gLo=.6*(1.-smoothstep(.035,.06,C)), gHi=1.-smoothstep(.05,.095,C);                             // vibrance: the rich near foliage barely moves
  float g=1.+.3*wGr*mix(gLo,gHi,smoothstep(.3,.55,L));
  g*=1.+.15*wGr*smoothstep(.55,.7,L)*(1.-smoothstep(.11,.14,C));   // (r7m: .12 -> .15)
  g*=1.+.3*wTq*cw2*(1.-smoothstep(.06,.1,C));   // (r7m: .4 -> .3, the r7 water's turquoise is already richer; v4 overshot)                                                          // turquoise: less milky; vibrance-limited (no neon pool-cyan)
  g*=1.+.25*wW*cwW*smoothstep(.15,.3,L);
  g*=1.+.1*wBl*cw*smoothstep(.33,.46,L)*wDeep;   // (r7m: .3 -> .1, the r7 water already has the photo's navy chroma; v2 overshot)
  // hue
  float dh=12.*grBump(h,190.,20.)*cw2*smoothstep(.45,.6,L);                                             // cyan-green shallows -> turquoise-blue
  float wPull=smoothstep(100.,125.,h)*(1.-smoothstep(185.,212.,h))*(1.-smoothstep(175.,200.,h)*smoothstep(.36,.46,L));
  dh-=.4*max(h-128.,0.)*wPull*cw2*(.4+.6*dk);   // (r7m: .4 -> .6; r8m: back to .4, the r8 forest + r8 veil already make the aerial shade greener)                                                           // teal-grey shade -> emerald (never water)
  dh-=5.*wW*cwW;                                                                                         // warm hues a few degrees toward red-brown
  dh-=5.*wBl*cw*smoothstep(.36,.48,L)*wDeep;                                                            // lighter sea body a little toward cyan (r7m: 12 -> 5, the r7 water's wave faces are already cyan)
  dh-=10.*wTq*cw2*smoothstep(.55,.7,L);                                                                 // (r7m) bright turquoise a little toward aqua (photo v1/v9 shallows h205/199, ours h211/210)
  { float wS=grBump(h,215.,25.)*smoothstep(.008,.02,C)*smoothstep(.1,.18,L)*(1.-smoothstep(.28,.38,L));   // (r7m) deep blue-teal shade (land, OkLab L<.3)
    dh-=8.*wS; dL+=.012*wS; }   // (r8m: hue -18 -> -8 deg, chroma +20 % -> 0: stacked on the r8 forest / veil the shade overshot to emerald)
  // (r8m) dark land shade (OkLab L .06-.42, greens..teal-greens, hue 115-215) a little less chromatic: the r8 forest fill / skyFill and
  //  the r8 steep veil both made the aerial shade more saturated; stacked, v1 ridge shade sat at Lab C11/14 vs photo 7/9 (r7m 9/11)
  { float wSd=grBump(h,165.,50.)*(1.-smoothstep(.3,.42,L))*smoothstep(.06,.14,L); g*=1.-.35*wSd; }
  float L2=L+dL, C2=C*g, h2=radians(h+dh);
  float A2=C2*cos(h2), B2=C2*sin(h2);
  vec3 r=vec3(L2+.3963377774*A2+.2158037573*B2, L2-.1055613458*A2-.0638541728*B2, L2-.0894841775*A2-1.2914855480*B2);
  r=r*r*r;
  vec3 o3=vec3(dot(r,vec3(4.0767416621,-3.3077115913,.2309699292)), dot(r,vec3(-1.2684380046,2.6097574011,-.3413193965)), dot(r,vec3(-.0041960863,-.7034186147,1.7076147010)));
  // soft gamut map: pull toward the grey of equal luminance until no channel is below 2 % of it (no clipped channel)
  float Y=max(dot(o3,vec3(.2126,.7152,.0722)),0.), mn=min(o3.r,min(o3.g,o3.b));
  if(mn<Y*.02) o3=Y+(o3-Y)*(Y*.98/max(Y-mn,1e-6));
  o3=clamp(o3,0.,1.);
  return mix(12.92*o3,1.055*pow(o3,vec3(1./2.4))-.055,step(.0031308,o3));
}`);
  rep(`  c+=textureLod(uBloom,uvG,0.).rgb*.06;
  c*=uExpo;
  c=aces(c);
  // grade: gentle S-curve + saturation
  c=clamp(c,0.,1.);
  c=mix(c,c*c*(3.-2.*c),uContrast);
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=max(mix(vec3(l),c,uSat),0.);
  c=srgb(clamp(c,0.,1.));
  vec2 q=uv0-.5;
  c*=1.-.22*dot(q,q)*2.;`, `  vec4 bt=textureLod(uBloom,uvG,0.);
  c+=bt.rgb*.06;
  // (r8) share of the pixel that is low-layer atmosphere (fogApply gHz, accumulated in alpha): the land grade below (lime
  // push, foliage yellow push, grade7) is a surface-colour correction, so it must not re-saturate / re-yellow the haze
  float hzA=clamp(textureLod(uAcc,uvG,0.).a*uInvN,0.,1.)*uHzG;
  // local contrast ("clarity"): push each pixel away from the luminance of its neighbourhood (~40 px)
  float lc=dot(c,vec3(.2126,.7152,.0722));
  c*=exp2(clamp(log2(lc+.002)-bt.a,-.6,1.5)*uClar);
  c*=uExpo;
  c=aces(c)+.15*c*exp(-c/.05);
  c=srgb(clamp(c,0.,1.));
  // tone curve in display space: S around a pivot
  c=c*(1.-.006)+.006;                                  // veiling flare: blacks never fully crush
  const float pv=.36; float ka=1.+uContrast;
  vec3 lo=pv*pow(max(c,0.)/pv,vec3(ka)), hi=1.-(1.-pv)*pow(max(1.-c,0.)/(1.-pv),vec3(ka));
  c=mix(lo,hi,step(pv,c));
  // split tone: cool cyan-blue shadows and mids, warm golden highlights
  float l=dot(c,vec3(.2126,.7152,.0722));
  c*=1.+vec3(-.02,.01,.0)*(1.-smoothstep(.04,.42,l))+vec3(.03,.01,-.05)*smoothstep(.42,.72,l)*(1.-smoothstep(.6,.78,l));
  // selective colour: deeper, cleaner blues (ocean, zenith); golden-lime sunlit foliage
  l=dot(c,vec3(.2126,.7152,.0722));
  float wB=smoothstep(.06,.16,c.b-max(c.r,c.g))*(1.-smoothstep(.3,.55,l));   // deep water only (not the sky, not blue-green land shadows)
  c=max(mix(vec3(l),c,1.+.4*wB),0.);
  float wG=smoothstep(.01,.08,c.g-max(c.r,c.b))*smoothstep(.22,.55,l);
  wG*=1.-hzA;
  c.r+=(c.g-c.r)*.08*wG; c.b*=1.-.08*wG;
  // (r6b) foliage hue: half-lit and lit greens one step toward yellow-lime (every photo has R/G .87-1.0 in its foliage bands, r6a .80-.91)
  float wF=smoothstep(.01,.06,c.g-c.b)*smoothstep(-.04,.02,c.g-c.r)*smoothstep(.06,.25,l);
  c.r+=(c.g-c.r)*.35*wF*(1.-hzA);
  // saturation with vibrance (muted colours gain more); (r6b) greens keep x.88 of it (foliage chroma ran 10-45 % over the photos
  // at sat 1.0) and the blue sky x.88 (sky C25-29 vs photos C20-26); water keeps the full sat
  l=dot(c,vec3(.2126,.7152,.0722));
  float chr=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
  float wS=smoothstep(.05,.12,c.b-max(c.r,c.g))*smoothstep(.42,.58,l);
  c=max(mix(vec3(l),c,uSat*(1.-.12*wF-.12*wS)*(1.+.1*(1.-smoothstep(.05,.5,chr))+.12*smoothstep(.45,.8,l))),0.);
  c=clamp(c,0.,1.);
  // (r7) photographic grade (see grade7 above); uGrade 0 = r6b look, 1 = graded
  c=mix(c,grade7(c),uGrade*(1.-hzA));
  vec2 q=uv0-.5;
  c*=1.-.08*dot(q,q)*2.;`);
  rep("expo: num('expo', 1.0), sat: num('sat', 1.12), sharp: num('sharp', 0.3), contrast: num('contrast', 0.15),",
      "expo: num('expo', 1.04), sat: num('sat', 1.0), sharp: num('sharp', 0.15), contrast: num('contrast', 0.1), clar: num('clar', 0.15), grade: num('grade', 1.0),");
  rep('gl.uniform1f(pp.u.uContrast, PARAMS.contrast);', 'gl.uniform1f(pp.u.uContrast, PARAMS.contrast); gl.uniform1f(pp.u.uClar, PARAMS.clar); gl.uniform1f(pp.u.uGrade, PARAMS.grade); gl.uniform1f(pp.u.uDbgA, num("dbga", 0)); gl.uniform1f(pp.u.uHzG, PARAMS.hzg);');
  // (r8) URL dbga=1: write the accumulated alpha (aout=1: log2 distance / 14) as 16 bits in R (coarse) and G (fine)
  rep("  c+=(hash12(gl_FragCoord.xy*1.7+fract(uInvN*91.7))-.5)/255.;", "  c+=(hash12(gl_FragCoord.xy*1.7+fract(uInvN*91.7))-.5)/255.;\n  if(uDbgA>0.){ float va=clamp(textureLod(uAcc,uv0,0.).a*uInvN/14.,0.,1.)*255.; c=vec3(floor(va)/255.,floor(fract(va)*255.+.5)/255.,0.); }");
  rep("sunAz: num('sunAz', -4), sunEl: num('sunEl', 45),", "sunAz: num('sunAz', -15), sunEl: num('sunEl', 44),");
  // aerial perspective: thicker, deeper haze layer (shadows lifted to teal from altitude, distant ridges blue)
  rep('  float b=uFog, hf=1./420.;', '  float b=uFog, hf=1./300.;');
  // second, low layer: humid valley / marine mist hugging the ground (scale height 120 m). Long low paths
  // (valley heads, distant ridges seen from the boat) get a bright sunlit veil; the view from 1 km up barely changes.
  // round 3: humid marine / valley air (scale height uMist.x ~350 m). Seen along grazing paths from the boat or the
  // valley floor, walls 1-2 km away sink into a blue-grey veil (r3, r4, r5); terrain closer than ~150 m stays crisp.
  // (r8) distance- and air-mass-aware aerial perspective. tauM = optical depth of the humid marine / valley layer along the
  // view path (scale height uMist.x, grazing paths only: from the air the paths are steep and short in it, so the aerial
  // views keep their vivid colour). Two effects of that layer:
  //  - chroma veil: forward-scattered skylight replaces the surface colour by a blue-grey of the same luminance -- distant
  //    land loses chroma and its yellow while keeping its light / shade structure (photos r2 r3 r5: ridges at 0.4-1.5 km are
  //    grey-green, C 6-16, but still dark in shade). Builds up from ~100 m: 1-exp(-kC tauM t/(t+t0)).
  //  - additive mist veil (as before): lifts the far walls (>~600 m) toward the sunlit / blue-grey haze colour.
  // gHz (fraction of the pixel's colour that is atmosphere) goes to the post in the accumulation alpha.
  rep('  return mix(col,fc,ext);\n}', `  float hm=1./uMist.x, km=rd.y*hm;
  float tauM=uFog*uMist.y*exp(-ro.y*hm)*(abs(km)>1e-6?(1.-exp(-t*km))/km:t)*(1.-smoothstep(.10,.26,-rd.y));   // (r8: grazing gate .15-.35 -> .10-.26: v9's top rows no longer fog over)
  // (r10f) the valley-interior weights inl / inR were read at the hit point only: wherever a ridge hides a wall a few tens of m
  //  further inland, the hit z steps through the 800-1100 m ramp and the veil jumped with it -- the diagonal milky "light shafts"
  //  on the v4 / v5 walls (t steps of 50-60 m gave +20 levels). Now they are the average of the ramp along the view path (the
  //  share of the path inside the valley air), continuous in t. A camera inside the valley (v5) keeps most of the valley haze,
  //  a camera on the beach looking in (v4) sees through less of it. uMG.w (URL mg3): 1 path average, 0 hit point (r10m)
  float inl=mix(smoothstep(950.,1700.,ro.z+rd.z*t),zRampAvg(ro.z,ro.z+rd.z*t,950.,1700.),uMG.w);   // humid valley interior: droplet mist, a bright veil (x2.2 -> x3.5) more than a colour loss (x2.2)
  // (r8f) the faster ramps (mist 200-1200 m, colour loss from t0 = 200 m) only for the valley interior (hit z > ~1 km); along the
  //  coast (v2 / v3: the walls at 0.4-1 km) the mist ramps over 400-1700 m and the colour loss starts later (t0 700 m): v2's
  //  coastal mountains read milky sage (lit veg C 20.8 vs photo 25.9, grey share 24 vs 15.5 %, shade L*10 25 vs 17); now
  //  C 25.9, grey 17.6 %, L*10 23 (offline twin agent_out/fx/simhz.mjs); the valley walls of v4 / v5 keep the r8 haze
  float inR=mix(smoothstep(800.,1100.,ro.z+rd.z*t),zRampAvg(ro.z,ro.z+rd.z*t,800.,1100.),uMG.w);
  float extM=1.-exp(-tauM*(1.+2.5*(1.-uAB.y)*inl)*mix(smoothstep(400.,1700.,t),smoothstep(uHzR.x,uHzR.y,t),inR)*(1.+uHzR.z*inR));   // (r8: ramp 300-1500 -> 200-1200: the valley head walls at 0.6-1 km sink into the haze as in r5)
  // (r9m) valley interior: ramp 200-1200 -> 60-700 m (uHzR.xy) and x1.3 optical depth (uHzR.z): with the r9 terrain spurs in the
  //  mid-ground and the r9 side darker level-view canopy, the v5 walls sat at veg L* 13/33/56 (photo 21/45/60, grey share 24 vs 41 %);
  //  now 15/38/58, grey 41 %. The coast (inR = 0: v2 / v3 walls) and every steep aerial path (grazing gate) are unchanged.
  tauM*=1.+1.2*inl;
  vec3 mc=uMistC+vec3(1.,.9,.74)*(.03+.7*pow(s,4.));   // Mie: bright toward the sun, dim blue-grey veil away from it
  col=mix(col,fc,ext);
  float dC=(1.-exp(-uHaze.x*tauM*t/(t+mix(700.,uHaze.y,inR))))*mix(1.,uHzR.w,inR);   // (r10f) uHzR.w (URL hz3): valley-interior chroma veil scale
  col=mix(col,mix(vec3(.92,1.,1.08),vec3(.98,1.,1.02),uAB.z*inR)*(dot(col,vec3(.2126,.7152,.0722))/mix(.9888,.9971,uAB.z*inR)),dC);   // (r11a) URL ab2: valley-interior veil tint, 0 blue-grey (r10f) .. 1 neutral: the humid valley air is a droplet mist (neutral Mie); the coastal veil (inR 0, v2 / v3) keeps its blue-grey
  gHz=1.-(1.-dC)*(1.-extM);
  return mix(col,mc,extM);
}`);
  rep("fog: num('fog', 0.0002)", "fog: num('fog', 0.0002), mistH: num('mistH', 350), mistK: num('mistK', 2.3), mistR: num('mistR', .11), mistG: num('mistG', .13), mistB: num('mistB', .15), hazeC: num('hazeC', 1.6), hazeT: num('hazeT', 200), hzg: num('hzg', 1)");
  rep("'uniform vec2 uShore; uniform float uFog;'", "'uniform vec2 uShore; uniform float uFog; uniform vec2 uMist; uniform vec3 uMistC; uniform int uAOut; uniform vec2 uHaze; uniform vec4 uHzR, uSL, uFXa, uFXb;'");   // (r9m) uHzR: valley-interior mist ramp; uSL: level-view canopy knobs (URL-tunable); (r9f) uFXa / uFXb: fix-pass knobs
  // (r10f) hz2 .22 -> 1.0, hz3 .6 (valley chroma veil x.6), mg3 1 (path-averaged valley weights, see fogApply): with the path average a camera
  //  outside the valley (v4 on the beach) sees through less valley air, so the valley optical depth can rise for the cameras inside it (v5 shade
  //  L<28 44 -> 39 %, lit 19 -> 21 %) while v4 stays clear (grey share 23.6 -> ~10 %). fp0 .55 interreflection fill, fp2 .3 level-view wall
  //  chroma, fb1 .25 -> .1 (level-view lit hue 106-108 -> 110-111, photos 109-111); fp1 / fp3 spare
  // (r10m) defaults hz0 60 -> 90, hz1 700 -> 800, hz2 .3 -> .22: the r10 terrain's raised west wall put the v4 / v5 left walls in a grey veil
  //  (v4 grey share 27 % vs photo 8 %); a middle between r9f and r8f (v4 grey 23.6 %; v5 veg L* 19/39/60, r9f 15/38/57, photo 21/45/60). fb1 .5 -> .25: the r10
  //  canopy's stronger warm turn (cw0 .45) made the level views' lit foliage too yellow (lit hue v2 / v3 / v4 105 / 103 / 103, photo 109 / 111 / 109)
  // (r12 valley) hz2 1.0 -> .7: thinner valley-interior mist; hz3 .6 -> .45: less chroma veil (saturation only, no luminance change);
  //  the v4 / v5 walls at 0.5-1.3 km read crisp and green as in the photos. (ab1 .4 was tested too: v4 darker like its photo, but the
  //  v5 left wall went from 44 to 49 % shade, photo 19 %; left at 0.)
  // (r12 fix) hz2 .7 -> 1 (back to r11f): the thinner mist made the whole v5 frame darker than r11f (left box shade 25 -> 33 %, photo 10 %;
  //  frame mean 79/86/59 -> 76/82/55, photo 89/92/66) while the v4 walls stayed as milky by eye (the fix-pass review)
  //  (hz2 1.2 / 1.3 tested: v5 left box shade 25 / 24 %, frame mean +1 only, but the v4 head wall turned visibly milkier; 1 kept)
  // (r13 sky) valley-interior mist ramp hz0 / hz1 90-800 m -> 130-950 m: the near walls (v4 left walls and the v5 near spurs at 300-600 m)
  //  were veiled in milky "sunbeam" haze; the far walls keep (and, with the uSK far in-scatter below, brighten) their haze. Tested
  //  250-1200 (v5 left wall far too dark, land mean -5) and 150-1000 + sk1 .5 (v4 head wall washed out); this is the compromise.
  rep('gl.uniform1f(u.uFog, PARAMS.fog);', 'gl.uniform1f(u.uFog, PARAMS.fog); gl.uniform2f(u.uMist, PARAMS.mistH, PARAMS.mistK); gl.uniform3f(u.uMistC, PARAMS.mistR, PARAMS.mistG, PARAMS.mistB); gl.uniform1i(u.uAOut, num("aout", 0)); gl.uniform2f(u.uHaze, PARAMS.hazeC, PARAMS.hazeT); gl.uniform4f(u.uHzR, num("hz0", 130), num("hz1", 950), num("hz2", 1), num("hz3", .45)); gl.uniform4f(u.uSL, num("sl0", .6), num("sl1", .95), num("sl2", 1.1), num("sl3", .4)); gl.uniform4f(u.uFXa, num("fa0", 1), num("fa1", .6), num("fa2", .6), num("fa3", .6)); gl.uniform4f(u.uFXb, num("fb0", .7), num("fb1", .1), num("fb2", .25), num("fb3", 1));');
  // (r10 canopy) canopy knobs (URL-tunable, defaults = the shipped look): uCC crown clusters (cc0 level / cc1 aerial strength,
  //  cc2 gap floor, cc3 grove bias), uCW warm sun turn (cw0 red gain, cw1 blue cut, cw2 crown-to-crown spread), uCG (cg0 shade fill
  //  warmth, cg1 yellow-green crown share, cg2 / cg3 spare)
  rep("uniform vec4 uHzR, uSL, uFXa, uFXb;'", "uniform vec4 uHzR, uSL, uFXa, uFXb, uCC, uCW, uCG, uCX, uMG, uFP, uAL, uAB;'");   // (r11a) uAL: valley light (URL al0-al3), uAB: atmos knobs (URL ab0-ab3)   // (r10m) uMG: merge knobs (URL mg0..mg3)
  // (r11a) valley light uAL (al0 aureole share of SUNL .2, al1 its visible share in a cast shadow .5, al2 bounce off the sunlit far
  //  side x2.5 of a single forest bounce, al3 aoH slope self-occlusion divided out 1) and atmos / light knobs uAB (ab0 land sun x1.04,
  //  ab1 deep-valley mist density cut 0 = r10f, ab2 neutral valley-interior veil tint 1, ab3 horizon band on steep open faces .7);
  //  fp0 .5 -> .4 (the flat interreflection lift: the directional bounce now carries part of it; lower keeps the v1 gullies deep);
  //  mist colour .11/.13/.15 -> .12/.13/.14 (less blue). al0=0&al2=0&al3=0&ab0=1&ab2=0&ab3=0&fp0=.55&mistR=.11&mistB=.15 gives r10f.
  // (r11 merge) defaults: the atmos light lift is OFF (al0 0, al2 0, al3 0, ab0 1, ab3 0, fp0 .55, mist .11/.13/.15 = r10f light; ab2 1 kept:
  //  measured no-op). r11m (the atmos values above) lightened the shade in every view: v1 ridge shade 53.8 -> 48.3 % (photo 57.8), v2
  //  wall shade 15.0 -> 12.1 (photo 28), v4 shade 41.4 -> 34.9 (photo 51.6); scores -0.7..-2.6 in all six views. Without ab3 / al3 the
  //  remaining terms (bounce, aureole, sun x1.04, fp0 .4) moved the metrics < 2 % and the look not visibly. Vegetation: fp2 .35, cc0 .15,
  //  cc1 .4, cg3 .4. To get the atmos look back: al0=.2&al2=2.5&al3=1&ab0=1.04&ab3=.7&fp0=.4&mistR=.12&mistB=.14
  rep('gl.uniform4f(u.uFXb, num("fb0", .7)', 'gl.uniform4f(u.uAL, num("al0", 0), num("al1", .5), num("al2", 0), num("al3", 0)); gl.uniform4f(u.uAB, num("ab0", 1), num("ab1", 0), num("ab2", 1), num("ab3", 0)); gl.uniform4f(u.uFP, num("fp0", .55), num("fp1", 0), num("fp2", .35), num("fp3", 0)); gl.uniform4f(u.uMG, num("mg0", 0), num("mg1", 0), num("mg2", 1), num("mg3", 1)); gl.uniform4f(u.uCC, num("cc0", .15), num("cc1", 1), num("cc2", .6), num("cc3", 0)); gl.uniform4f(u.uCW, num("cw0", .45), num("cw1", .3), num("cw2", 0), num("cw3", 1)); gl.uniform4f(u.uCG, num("cg0", 2), num("cg1", 0), num("cg2", .35), num("cg3", .4)); gl.uniform4f(u.uCX, num("cx0", 2.6), num("cx1", .6), num("cx2", .3), num("cx3", .45)); gl.uniform4f(u.uFXb, num("fb0", .7)');
  // (r11 veg) vegetation knobs (URL-tunable; see v3_shade.glsl (r11) notes): uVA wall forest (va0 level / va1 aerial forest-tone share on
  //  steep walls, va2 its brightness, va3 lit-crown contrast), uVB (vb0 far level-view chroma cut, vb1 aerial light-normal weight, vb2 its span m,
  //  vb3 crest scar), uVC (vc0 near palm warm, vc1 aerial speckle, vc2 floor crown contrast, vc3 spare)
  rep("uFP, uAL, uAB;'", "uFP, uAL, uAB, uVA, uVB, uVC, uVD, uVE, uVF;'");   // (r11 merge) chained after the atmos uniforms uAL, uAB
  rep('gl.uniform4f(u.uFP, num("fp0"', 'gl.uniform4f(u.uVA, num("va0", 1), num("va1", 0), num("va2", .95), num("va3", 0)); gl.uniform4f(u.uVB, num("vb0", .15), num("vb1", .8), num("vb2", 14), num("vb3", .4)); gl.uniform4f(u.uVC, num("vc0", .8), num("vc1", .2), num("vc2", .3), num("vc3", .06)); gl.uniform4f(u.uVD, num("vd0", 2.5), num("vd1", .6), num("vd2", 1), num("vd3", .6)); gl.uniform4f(u.uVE, num("ve0", -.1), num("ve1", .5), num("ve2", 0), num("ve3", .6)); gl.uniform4f(u.uVF, num("vf0", .15), num("vf1", .12), num("vf2", 0), num("vf3", 0)); gl.uniform4f(u.uFP, num("fp0"');
  // (r8) the accumulation buffer's alpha (unused before: 1 per sample) carries the low-layer haze fraction gHz set in fogApply,
  // so the post grade knows how much of a pixel is atmosphere (URL aout=1: log2 distance instead, for offline analysis)
  rep('vec3 fogApply(vec3 col, vec3 ro, vec3 rd, float t){', 'float gHz=0.;\n// (r10f) mean of smoothstep(a,b,z) over z in [z0,z1] (antiderivative (b-a)(u^3-u^4/2) + max(z-b,0))\nfloat zRampF(float z,float a,float b){ float u=clamp((z-a)/(b-a),0.,1.); return (b-a)*(u*u*u-.5*u*u*u*u)+max(z-b,0.); }\nfloat zRampAvg(float z0,float z1,float a,float b){ return abs(z1-z0)<1.?smoothstep(a,b,.5*(z0+z1)):(zRampF(z1,a,b)-zRampF(z0,a,b))/(z1-z0); }\nvec3 fogApply(vec3 col, vec3 ro, vec3 rd, float t){');
  rep('  o=vec4(col,1.);\n}`', '  o=vec4(col,uAOut==1?(tt>0.?log2(max(tt,1.)):0.):uAOut>=2?gDbgW:gHz);\n}`');
  // photographic aerial perspective: near terrain stays crisp (a few % veil within ~1 km), haze builds up on the
  // distant ridges (~25 % at 2 km, ~45 % at 4 km), as in the reference photos
  // (r12 fix, URL rf1 / rf3) far aerial veil on steep (aerial) paths beyond rf3 (1 km): v9's far ridges read lime-yellow (top rows 75/83/47
  //  vs photo 71/86/76) and v1's top rows too warm (69/82/53 vs 62/76/59); + rf1 x .07 optical depth per km past rf3, steep rays only (the
  //  level views keep their low-layer mist as it was)
  rep('  float ext=1.-exp(-fogAmt);', '  fogAmt=mix(fogAmt*fogAmt/(fogAmt+.25),fogAmt,smoothstep(.15,.45,-rd.y));   // steep views from altitude keep the full veil\n  fogAmt+=uRF.y*7e-5*max(t-uRF.w,0.)*smoothstep(.12,.3,-rd.y);   // (r12 fix) far aerial veil\n  float ext=1.-exp(-fogAmt);');
  // ======== end LOOK ========
  // ======== r4f: sharpen on log luminance with a clamped ratio: the linear-HDR unsharp mask drove every neighbour of a
  // much brighter pixel (bird, foam against rock, sunlit cloud against a ridge) to 0 -- black 1-px rims that crawl in motion
  rep("  c=max(c+(c-bl)*uSharp,0.);", "  { float lc0=dot(c,vec3(.2126,.7152,.0722)), lb0=dot(bl,vec3(.2126,.7152,.0722)); c*=exp2(clamp(log2((lc0+.003)/(lb0+.003)),-2.,2.)*uSharp); }");
  // ======== r4f: sea floor seen in a wave trough (terrain below mean sea level hit before the water surface) is no dry
  // black rock: it is awash -- shade it as the water / foam at that point
  rep("  else if(hitT){ col=shadeScene(ro+rd*tT,rd,tT,inf); tt=tT; }", "  else if(hitT){ vec3 pT=ro+rd*tT; col=(pT.y<-.05&&inf.w<.5)?shadeWater(pT,rd,tT):shadeScene(pT,rd,tT,inf); tt=tT; }");
  // ======== SKY (round 4): dev knobs for the cumulus field (URL cu0..cu3, defaults 0 = tuned look) ========
  rep("gl.uniform1f(u.uCloud, num('cloud', 0.0));", "gl.uniform1f(u.uCloud, num('cloud', 0.0)); gl.uniform4f(u.uCu, num('cu0', 0), num('cu1', 0), num('cu2', 0), num('cu3', 0)); gl.uniform4f(u.uCv, num('cv0', 0), num('cv1', 0), num('cv2', 0), num('cv3', 0));");
  // ======== end SKY ========
  // (r12 walls) wall light / rock / palm knobs (URL-tunable; see the (r12 walls) notes in v3_shade.glsl). uWA rock (wa0 inland rock
  //  warmth, wa1 red-brown soil scars on the walls, wa2 darker inland basalt, wa3 seaward headland basalt contrast), uWB wall light
  //  (wb0..wb3), uWC palms (wc0..wc3). r11f look: wa0=0&wa1=0&wa2=0&wa3=0&wb0=0&wb1=0&wc0=0&wc1=0&vb2=5&fb0=1.2
  rep("uVE, uVF;'", "uVE, uVF, uWA, uWB, uWC;'");
  // (r12 fix) fix-pass knobs uRF (rf0 broken waterline wash, rf1 far aerial veil strength, rf2 warm brown-black headland flows, rf3 far veil
  //  start distance m) and uRG (rg0 broad cove arc trail, rg1 ragged soft reef-flat bore front, rg2 rg3 spare). r12m look: rf0=0&rf1=0&rf2=0&rg0=0&hz2=.7
  rep("uWA, uWB, uWC;'", "uWA, uWB, uWC, uRF, uRG;'");
  rep('gl.uniform4f(u.uVA, num("va0"', 'gl.uniform4f(u.uWA, num("wa0", 1), num("wa1", .8), num("wa2", .6), num("wa3", 1)); gl.uniform4f(u.uWB, num("wb0", .4), num("wb1", .6), num("wb2", 1.2), num("wb3", 1)); gl.uniform4f(u.uWC, num("wc0", .85), num("wc1", 1), num("wc2", 0), num("wc3", 0)); gl.uniform4f(u.uVA, num("va0"');
  rep('gl.uniform4f(u.uWA, num("wa0"', 'gl.uniform4f(u.uRF, num("rf0", 1), num("rf1", 0), num("rf2", .85), num("rf3", 1000)); gl.uniform4f(u.uRG, num("rg0", 1), num("rg1", 1), num("rg2", 0), num("rg3", 0)); gl.uniform4f(u.uWA, num("wa0"');
  // (r13 sky) knobs uSK: sk0 shadowed air (sun in-scatter of the low mist only where the air is sunlit, 1 = on), sk1 far haze toward the
  //  horizon sky radiance (amount at >= 1.5 km), sk2 narrow forward lobe (0 = r12f broad pow(s,4) lobe, 1 = 1.3 pow(s,8): the broad
  //  side glow on the walls 45-60 deg from the sun goes, the glow near the sun stays), sk3 spare.
  //  r12f air in one URL: sk0=0&sk1=0&sk2=0&hz0=90&hz1=800 (only the mist sun colour (1,.9,.74) -> (1,.94,.85) stays)
  rep("uRF, uRG;'", "uRF, uRG, uSK;'");
  rep('gl.uniform4f(u.uRF, num("rf0"', 'gl.uniform4f(u.uSK, num("sk0", 1), num("sk1", .35), num("sk2", 1), num("sk3", 0)); gl.uniform4f(u.uRF, num("rf0"');
  // (r13 sky) low-mist in-scatter: (a) its sun part only where the air is sunlit: a soft heightfield shadow probe at .7 t gives
  //  the share of the path inside the terrain's shadow volume, which scatters no sunlight -- the air in front of a shadowed wall stays
  //  clear and dark (the r12 veil lit every shadowed near wall on the sun side like a sunbeam: v4 left walls, v5 near walls);
  //  (b) less warm (the photos' valley haze is neutral grey-blue, (1,.9,.74) -> (1,.94,.85));
  //  (c) long paths: the in-scatter tends to the horizon sky radiance in that direction (aerial perspective converges on the horizon),
  //  so the far walls get a bright, hazy face instead of a dim grey veil; the sunlit share keeps it physical (shadowed air: ~60 %)
  rep('  vec3 mc=uMistC+vec3(1.,.9,.74)*(.03+.7*pow(s,4.));   // Mie: bright toward the sun, dim blue-grey veil away from it',
      `  float vis=1.;
  if(uSK.x>0.&&extM>.003&&t>100.) vis=mix(1.,mistVis(ro+rd*(t*.7)),uSK.x);   // (r13 sky) sunlit share of the mist path (one probe at .7 t)
  vec3 mc=uMistC+vec3(1.,.94,.85)*(.03+.7*mix(pow(s,4.),1.3*pow(s,8.),uSK.z))*vis;   // Mie: bright toward the sun, dim blue-grey veil away from it
  mc=mix(mc,skyDome(normalize(vec3(rd.x,.06,rd.z)))*mix(.6,1.,vis),uSK.y*smoothstep(300.,1500.,t));   // (r13 sky) far paths: in-scatter -> horizon sky`);
  // (r13 sky) cheap soft heightfield sun visibility for a point in the air (<= 20 coarse steps; shadowH's 70 fine steps cost ~25 % of a v5 frame)
  rep('float gHz=0.;\n', 'float gHz=0.;\nfloat mistVis(vec3 p){ float res=1., t=2.; for(int i=uZero;i<20;i++){ vec3 q=p+uSun*t; if(q.y>uHmax) break; float d=q.y-H(q.xz); res=min(res,8.*d/t); if(res<-.2) break; t+=clamp(d*.6,4.,80.); } return smoothstep(-.2,1.,res); }   // (r13 sky)\n');
  // (r13 mat) rock / wall-vegetation material knobs (see the (r13 mat) notes in v3_shade.glsl). uMA rock: ma0 fracture strength,
  //  ma1 open-joint darkness, ma2 weathered / fresh facet colour, ma3 spare. uMB / uMC: wall vegetation (see v3_shade.glsl)
  rep("uRF, uRG, uSK;'", "uRF, uRG, uSK, uMA, uMB, uMC;'");   // (r13 merge) chained after the sky round's uSK
  rep('gl.uniform4f(u.uRF, num("rf0"', 'gl.uniform4f(u.uMA, num("ma0", 1), num("ma1", .7), num("ma2", 1), num("ma3", 0)); gl.uniform4f(u.uMB, num("mb0", 1.8), num("mb1", .55), num("mb2", 0), num("mb3", 0)); gl.uniform4f(u.uMC, num("mc0", 1), num("mc1", 1), num("mc2", 0), num("mc3", 0)); gl.uniform4f(u.uRF, num("rf0"');
  return t;
};
