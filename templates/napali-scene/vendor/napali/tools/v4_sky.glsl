vec3 skyCol(vec3 rd){                                    // sky radiance for reflections (water, wet sand): unchanged
  float y=max(rd.y,0.);
  vec3 c=mix(vec3(.27,.43,.74),vec3(.07,.19,.53),smoothstep(0.,1.,pow(y,.75)));
  c=mix(c,vec3(.62,.71,.83),exp(-y*9.)*.78);
  float s=max(dot(rd,uSun),0.);
  c+=vec3(1.,.92,.75)*(pow(s,8.)*.2+pow(s,90.)*.45);
  return c*.84;
}
uniform vec4 uCu, uCv;                                   // sky dev knobs (URL cu0..cu3, cv0..cv3), 0 = default look
// ---------------------------------------------------------------- visible sky dome
// deep violet-blue zenith, clear blue mid sky, saturation falling toward a pale milky horizon, a whiter salt-haze
// band right on the sea horizon and a soft aureole toward the sun
vec3 skyDome(vec3 rd){
  float y=max(rd.y,0.);
  float s=max(dot(rd,uSun),0.);
  // (r13 sky) softer, paler azure instead of cobalt: zenith (.04,.13,.47) -> (.06,.155,.49), slower climb to it (pow .6 -> .65),
  //  mid sky (.23,.38,.74) -> (.25,.40,.75), horizon milk (.63,.72,.88) -> (.64,.73,.87): blue sky at 30-37 deg ~3 L* lighter and
  //  ~15 % less chroma, hue a few deg toward azure (photos v2-v5 top rows L60-71 C20-26 h-97..-99; r12f L60-65 C23-29 h-93..-97)
  vec3 c=mix(vec3(.25,.40,.75),vec3(.06,.155,.49),smoothstep(0.,1.,pow(y,.65)));
  c=mix(c,vec3(.64,.73,.87),exp(-y*5.5)*.84);
  c=mix(c,vec3(.76,.81,.88),exp(-y*30.)*.5);
  c+=vec3(1.,.93,.80)*(pow(s,5.)*.13+pow(s,40.)*.3);
  return c*.84;
}
// ---------------------------------------------------------------- fair-weather trade-wind cumulus (km units)
// r5: the field is organised around the island instead of an even scatter, in coast-aligned coordinates (the coast
// runs NW-SE through the cove). Clear air over the stretch of coast the cameras fly along (so the upper sky above
// any coastal camera stays deep blue), a few small scattered heaps further out, broad lumpy banks piled up over the
// mountains from ~1.5-2.5 km inland (they show right above the ridge lines) and a broken band far out at sea. The
// distribution mask is fixed to the island while the heaps themselves drift through it with the trade wind.
// Each heap: flat base at the condensation level and a dome top whose height follows the footprint; big banks
// are made of several turrets (a coarse ball union) carrying cauliflower lobes, small heaps are torn and wispy.
// Lit by a short march toward the sun through the detailed cloud (lobe self-shadowing) plus an analytic term for
// the thick body further toward the sun, so bank bases and the far sides sink into blue-grey shade.
const float CB=1.;                                       // condensation level (km): one flat base for the field
#define SIG (30.+uCv.y)                                  // extinction at full density (1/km)
float gCuT;                                              // top height (km above base) of the heap under the last cuCov
float gCuK;                                              // 0 small heap .. 1 big bank, under the last cuCov
float gCuE;                                              // footprint value under the last cuCov
float cuCov(vec2 q){                                     // footprint value: > 0 under a heap
  vec2 g=q-vec2(uTime*.004+.27,uTime*.0015+.65);         // island-fixed position (km) relative to the cove: the heaps drift through the mask
  float dl=dot(g,vec2(.607,.795)), da=dot(g,vec2(.795,-.607));   // inland / along-coast distance (the coast runs NW-SE)
  float ra=max(abs(da)-1.5,0.);                          // beyond the stretch of coast the cameras fly along
  float fSea=smoothstep(.8,4.5,length(vec2(ra,min(dl,0.))));   // seaward / along the coast: the field builds with distance
  float fL=smoothstep(1.4,2.6,dl);                       // inland: banks pile up over the mountains
  float mid=smoothstep(.5,2.5,length(vec2(ra,dl)));
  vec2 w=q+vec2(fbm(q*.3+1.3,2),fbm(q*.3+8.1,2))*.9;     // shared warp: irregular outlines
  vec2 bg=vec2(fbm(q*.13+vec2(2.,7.),2),fbm(q*.37+vec2(9.,3.),2));   // groups and clear lanes; tall / flat groups
  // banks (a few km across): none over the coast (clear deep-blue upper sky), ~25 % cover over the mountains right
  // behind the coast rising to ~80 % further inland, ~20 % far out at sea (a broken band on the sea horizon)
  // (r13 sky) + banks from ~.5-1.5 km inland (the valley mouth / coastal hills): the v4 / v5 photos carry big soft banks at
  //  25-40 deg elevation, the r12f sky had only the far banks low over the ridges and popcorn above them (v5 photo ~20 % cloud, r12f ~6 %)
  float eB=(fbm(w*.33+vec2(3.7,1.9),3)+.25*bg.x-(.55-.38*fSea-.4*fL-.08*smoothstep(.5,1.5,dl)-uCloud-uCu.x))*2.2;
  // small scattered heaps (a few hundred m): a handful near the coast, ~9 % further out (no popcorn sky)
  // (r13 sky) threshold .46 -> .62, mid .12 -> .1: far fewer small heaps (they read as popcorn)
  float eS=(fbm(w*1.5+vec2(8.2,4.4),2)-(.62-.1*mid-.1*bg.x-uCloud-uCu.x))*2.8;
  // dome tops: flat near the footprint edge, then a rounded flank (no thin skirts, no vertical walls)
  float tB=(.25+.35*max(fSea,fL)+.25*fL)*(.8+.4*bg.y)*pow(smoothstep(0.,1.2,eB),.6);
  float tS=(.12+.1*mid)*(.8+.4*bg.y)*pow(smoothstep(0.,.6,eS),.6);
  gCuT=max(tB,tS);
  gCuK=smoothstep(.1,.35,tB-tS*.5);
  gCuE=max(eB,eS);
  return gCuE;
}
float cuEnv(vec3 p){ float h=p.y-CB; return min(gCuT-h,h*2.5); }   // km: flat base, rounded top (call after cuCov)
float cuAmp(){ return (1.15+uCu.y*.1)*clamp(gCuT,.1,.6)*smoothstep(-.4,0.,gCuE); }   // detail amplitude (km); 0 well off the heaps
float puffy(vec3 p){                                     // union of jittered balls -> height of the ball surface (0 outside)
  vec3 n=floor(p), o=step(.5,fract(p))-1.;
  float b=0.;
  for(int k=uZero;k<8;k++){
    vec3 c=n+o+vec3(k&1,(k>>1)&1,k>>2);
    vec3 h=hash33(c);
    vec3 r=c+.25+.5*h-p;
    float rad=.5+.24*h.x;
    b=max(b,rad*rad-dot(r,r));
  }
  return sqrt(b);
}
float gCuH;                                              // relative height of the last sample inside its heap (0 base .. 1 top)
float gCuS;                                              // depth (km) of the last sample below the detailed cloud surface
float cuDens(vec3 p, float lod, float w){
  float s=cuEnv(p);
  float A=cuAmp();
  if(s<-A*.9-.04) return 0.;
  float h=max(p.y-CB,0.);
  gCuH=clamp(h/max(gCuT,.05),0.,1.);
  float up=smoothstep(0.,mix(.35,.18,gCuK),gCuH);       // only the lowest part of a heap is torn and wispy (banks: lobed almost to the base)
  vec3 q=p+vec3(uTime*.002,0.,0.);
  q.xz=mat2(.94,.34,-.34,.94)*q.xz;                     // lumps lean / stretch along the trade wind
  float n1=noise3(q*vec3(3.3,4.,4.)+1.7);
  float n2=noise3(q*vec3(8.,9.,9.)+5.1);
  float n3=noise3(q*vec3(18.,26.,28.)+9.3);              // slightly drawn out along the wind
  float n4=lod>.01?noise3(q*vec3(42.,58.,62.)+3.3):0.;
  float wis=n1*.45+n2*.25+n3*.2+n4*.1*lod-.08;          // smoky, torn lumps and wisps
  // cauliflower lobes; big banks add a coarse turret level so the top is a pile of rounded towers, not a lid
  float lob=(puffy(q*3.4)-.42)*1.+(puffy(q*7.5+3.1)-.42)*.5+(lod>.01?(puffy(q*17.+7.7)-.42)*.25*lod:0.);
  lob+=gCuK*(puffy(q*1.5+11.3)-.42)*1.3;
  s+=mix(wis,lob*(.8+uCu.w)+wis*.5,up)*A;
  // fixed-size fibrous detail (tens of m) on every heap, whatever its size: torn, textured edges instead of
  // airbrushed blobs on the small heaps
  s+=(n3*.6+n4*.4*lod)*.02*smoothstep(-.4,0.,gCuE);    // (r13 sky) .028 -> .015: softer, less chipped edges; (r13 fix) .02: a little texture back on the soft rims
  gCuS=s;
  // density builds up inward: torn wisps at the base / edges stay translucent, the lobed body is dense
  float core=mix(3.,7.,up);
  return smoothstep(0.,w,s)*clamp(mix(.12,.3,up)+s*(core+uCv.x*10.),0.,1.);
}
vec3 cirrus(vec3 rd, vec3 c){                            // a few thin high wisps (~8 km), stretched along the upper wind
  vec2 q=rd.xz/max(rd.y,.04)*8.+vec2(uTime*.01,0.);
  vec2 w=mat2(.8,.6,-.6,.8)*q;
  float fld=smoothstep(.55,.9,fbm(w*.025+2.,3)*.5+.5);  // only a few patches of the sky carry cirrus
  vec2 wq=w+vec2(fbm(w*.11+3.,3),fbm(w*.11+7.,3))*6.;
  float f=fbm(wq*vec2(.4,1.6)+fbm(w*.3,2)*1.4,5);
  float cov=smoothstep(.3,.85,f)*fld*.07*smoothstep(.06,.25,rd.y);
  float s=max(dot(rd,uSun),0.);
  vec3 cc=vec3(.95,.97,1.)*(1.25+1.2*pow(s,6.));
  return mix(c,cc,cov);
}
vec3 skyView(vec3 rd){
  vec3 c=skyDome(rd);
  float s=max(dot(rd,uSun),0.);
  c+=vec3(1.,.95,.85)*smoothstep(.99985,.99995,s)*80.;
  c=cirrus(rd,c);
  if(rd.y<=.004) return c;
  vec3 ro=uRo*.001+vec3(uTime*.004,0.,uTime*.0015);      // world-anchored field (km): the same heaps in every view
  float t0=max((CB-.05-ro.y)/rd.y,0.), t1=min((CB+1.6-ro.y)/rd.y,60.);
  if(t0>=t1) return c;
  float cs=dot(rd,uSun);
  // phase (normalised to mean 1): forward lobe + broad back lobe; a softer lobe for the scattering octaves
  float g1=.62, g2=-.18, g3=.3;
  float ph0=.62*(1.-g1*g1)/pow(1.+g1*g1-2.*g1*cs,1.5)+.38*(1.-g2*g2)/pow(1.+g2*g2-2.*g2*cs,1.5);
  float ph1=(1.-g3*g3)/pow(1.+g3*g3-2.*g3*cs,1.5);
  float sunI=1.35+uCu.z;
  float j=hash12(gl_FragCoord.xy*1.37+uJit*173.1+fract(uTime*7.3)*91.);
  float T=1.; vec3 acc=vec3(0); float tw=0., ws=0.;
  float rxz=max(length(rd.xz),.15);
  float t=t0+j*max(.015,t0*.0015);
  for(int i=uZero;i<170;i++){
    if(t>t1||T<.02) break;
    vec3 p=ro+rd*t;
    float pix=t*.0012;                                   // pixel footprint (km)
    float lod=1.-smoothstep(.008,.035,pix);              // fine lobes / wisps faded with the pixel footprint (gone by ~30 km)
    float dmin=max(.01,pix*.8);
    float w=max(.021,pix*2.4);                           // edge ramp: about 2.4 pixels, never under 21 m ((r13 sky) 12 m / 2 px: hard cut-out edges; (r13 fix) the sky round's 30 m / 3 px read slightly out of focus next to the photos' crisp cumulus (v4 / v5): halfway back)
    float e=cuCov(p.xz);
    // conservative clearance (km) to anything that can carry cloud: off the footprints (horizontal) or above the
    // detailed top of the heap below (vertical)
    float clr=max(e<-.4?(-e-.4)*.2/rxz:0., (-cuEnv(p)-cuAmp()*.9-.04)*.45);
    if(clr>dmin*1.5){ t+=clr; continue; }
    float d=cuDens(p,lod,w);
    if(d<.003){ t+=dmin; continue; }
    float hH=gCuH, sD=gCuS, gT=gCuT, gK=gCuK;
    // sun: optical depth toward the sun through the detailed (lobed, eroded) cloud: 25 m .. 440 m, so the near
    // lobes shadow each other ...
    float od=d*.006, ls=.025;
    for(int k=uZero;k<4;k++){ vec3 pl=p+uSun*ls; cuCov(pl.xz); od+=cuDens(pl,0.,max(w,.02))*ls*1.2; ls*=2.6; }
    // ... plus the thick body of a bank further along the sun ray (beyond the march), so bases and the far side
    // of the big heaps sink into shade
    float hh=p.y-CB;
    od+=max((gT-hh)/uSun.y-.75,0.)*.45;
    od*=SIG;
    vec3 sunL=vec3(1.,.96,.9)*ph0*exp(-od)+vec3(.9,.95,1.04)*(.38*ph1*exp(-od*.35)+.18/(1.+od*.1));   // single scattering (warm direct sun) + multiple scattering (the deep, diffuse part falls off slowly: bases stay grey, not black)
    // sky light: blue from above on the tops, dimmer sea / land bounce under the base; less of it deep inside
    // (r13 sky) under-base light (.17,.2,.26) -> (.23,.26,.32) and the deep multiple scattering .14/(1+.12 od) -> .18/(1+.1 od): the
    //  bank bases over the ridges read as dirty grey smoke (cloud p10 L* 70 vs photos 73-78)
    vec3 amb=mix(vec3(.23,.26,.32),vec3(.28,.37,.55),smoothstep(.1,.9,hH))*(1.+uCv.z);
    amb*=mix(1.,.5,smoothstep(.0,.12,sD));               // crevices and the body interior see less sky
    vec3 S=sunI*sunL+amb;
    float dt=dmin*mix(.5,1.,smoothstep(.97,.75,T));     // fine steps where the ray enters the heap: smooth, grain-free wisps
    float a=1.-exp(-d*SIG*dt);
    acc+=T*a*S; tw+=T*a*t; ws+=T*a;
    T*=1.-a;
    t+=dt;
  }
  if(ws>0.){
    float td=tw/ws;
    vec3 hz=skyDome(normalize(vec3(rd.x,.02,rd.z)))*1.25;
    vec3 cc=mix(acc,hz*(1.-T),(1.-exp(-td*.035))*.85);   // distant heaps dissolve into the horizon haze
    float fade=smoothstep(.004,.03,rd.y);
    c=mix(c,c*T+cc*.84,fade);
  }
  return c;
}
