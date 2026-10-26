// ---------------------------------------------------------------- water shading
// sky + clouds as seen in reflections (sun handled by the microfacet term); rough water sees softer clouds
vec3 skyRefl(vec3 rd, float rough){
  vec3 c=skyCol(rd);
  // marine haze: the sky just above the sea horizon is a pale, almost white band
  c=mix(c,vec3(.74,.79,.85)*(.9+.1*rd.y),(1.-smoothstep(.0,.3,rd.y))*.32);   // (r7w: was .45 -- the near water of the boat views read pale grey-mint)
  if(rd.y>.004){
    vec2 cp=rd.xz/rd.y*1800.+vec2(uTime*4.,uTime*1.5);
    vec2 wq=cp*.0006; wq+=vec2(fbm(wq*1.3,3),fbm(wq*1.3+3.3,3))*.45;
    float bl=clamp(rough*5.+.3,0.,1.);   // (r8w: +.3 -- near ripples swing the reflected ray across sharp cloud edges: jagged white slivers in v2)
    float cl=(bl>.6?fbm(wq,2):fbm(wq,4))*.5+.5;                  // rough water: only the broad cloud shapes survive
    // low clouds seen in a grazing reflection are far and hazy: they fade into the horizon haze
    float cov=smoothstep(.48-.15*bl,.68+.22*bl,cl)*smoothstep(.006,.12,rd.y);
    // (r7w) a steep reflection (the open sea seen from the air) blurs the broad cloud field into the blue: no grey-purple
    // blotches over the deep water
    c=mix(c,vec3(.95,.96,.97)*1.2,cov*.5*(1.-.65*bl)*(1.-.6*smoothstep(.45,.68,rd.y)));   // (r7w: .62 -> .5, the boat views' near water read pale; r8w: the fade starts at R.y .45, was .3 -- mid reflections (v2 near water) keep the photo's silver cloud patches)
  }
  // (r5) the sea reflects a blurred mix of the whole sky lobe (haze, cloud, blue): a little less saturated than the sky
  // itself -- silver glints and teal faces instead of a uniformly blue "liquid metal" sheen
  // (r7w) ... except for steep reflections (seen from the air): they keep the saturated blue of the high sky -- every
  // aerial photo shows the open sea as a deep navy with its red channel near zero (r6b: 38,78,116 vs photo 11,80,119)
  // (r8w) low / mid reflections (the boat views' near water: R.y .1-.55) back to the r6b .72: v2 near water read a
  // saturated cobalt (C24 h267 vs photo C17 h247); steep aerial reflections (R.y > .7) keep the navy
  return mix(vec3(dot(c,vec3(.3,.55,.15))),c,mix(.48,1.,smoothstep(.35,.8,rd.y)));   // (r8f: .68 -> .6: v2 near water still C20 h260 vs photo C14 h246; r9w: .6 -> .48, C19 h259)
}
// (r8w) sun sparkle seen from the air: the glints of the unresolved short waves are tiny facets -- a sparse field of
// points (cells of 2.5 m, one facet each, glinting for ~1/4 of a 2.3 s cycle), each a 12 cm disc convolved with the pixel
// footprint (radius sf): sub-pixel points light a pixel by their area share, so nothing aliases or crawls in motion.
// Mean 1 (it redistributes the smooth glitter sheen into points; far away it converges back to the sheen).
float sparkle(vec2 p, float sf){
  const float CSZ=3.5, RP=.12;
  vec2 q=p/CSZ, iq=floor(q-.5);
  float r2=RP*RP+sf*sf, s=0.;
  // clustered (~40 m patches of active short waves: gusts / wave groups), not an even star field
  float cl=.15+1.7*smoothstep(-.3,.4,fbm(p*.025+vec2(uTime*.01,4.2),2));
  for(int j=uZero;j<2;j++) for(int i=uZero;i<2;i++){
    vec2 c=iq+vec2(i,j);
    vec3 hh=hash33(vec3(c,3.7));
    float ph=fract(uTime*.3+hh.z);   // (r8f) slower, softer twinkle (3.3 s cycle, a smooth ~45 % pulse; was a 2.3 s flash, lit ~1/4): no flickering snow in flight
    float tw=smoothstep(0.,.25,ph)*smoothstep(.6,.32,ph);
    vec2 o=(c+.1+.8*hh.xy-q)*CSZ;
    float am=fract(hh.x*17.3+hh.y*3.1); am=am*am*am*4.;   // facet size / tilt: most glints faint, a few bright (mean 1)
    s+=tw*am*exp(-dot(o,o)/r2);
  }
  return mix(s*cl*(RP*RP/r2)/(.335*PI*RP*RP/(CSZ*CSZ)),1.,smoothstep(.22,.5,sf/CSZ));   // (r8f: .22 -> .335 = the new pulse's mean)   // (far: the points merge into their mean)
}
// (r13w) patch reef seen from the air: a granular field of coral heads / boulders and sand pockets (~1.5-5 m), dense in the cluster
//  cores (dn -> 1), single grains at the edges (dn -> 0): a thresholded noise whose threshold follows the cluster density. Footprint-
//  filtered: the fine octaves fade and the threshold edge widens with the bed footprint bpx (m), so far away it is a smooth cover.
float reefGrain(vec2 q, float dn, float bpx){
  float fk=clamp(1.3-bpx*.5,0.,1.), fk2=clamp(1.3-bpx*1.4,0.,1.);
  float g=fbm(q*.26+vec2(3.1,7.7),3)*(.55+.45*fk)+.28*vnoise(q*.85+1.3)*fk2;
  float th=mix(.42,-.4,dn), hw=.05+.3*(1.-fk);
  return smoothstep(th-hw,th+hw,g);
}
// (r13 fix, wk47) the same heads with softer rims (~2x the edge width): seen from the air they blur into the cluster, no cut-out spots
float reefGrainS(vec2 q, float dn, float bpx){
  float fk=clamp(1.3-bpx*.5,0.,1.), fk2=clamp(1.3-bpx*1.4,0.,1.);
  float g=fbm(q*.26+vec2(3.1,7.7),3)*(.55+.45*fk)+.28*vnoise(q*.85+1.3)*fk2;
  float th=mix(.42,-.4,dn), hw=.11+.3*(1.-fk);
  return smoothstep(th-hw,th+hw,g);
}
// open-sea whitecaps: sparse breaking crests (~1 % cover at 9-10 m/s), most of them small, a few large. Each is a
// compact bright head (elongated along the crest, i.e. across the wind) with a long thin fading streak of old
// foam trailing upwind -- seen from the air as sparse white flecks drawn out in the wind direction. Cells of
// 46 x 23 m (along x across the wind) hold at most one whitecap. Sub-pixel: replaced by the mean coverage.
// Returns (foam density, foam age).
float gWcC=0.;   // (r8w) whitecap area cover (for the direct composite at aerial footprints)
vec2 whitecaps(vec2 p, float pix, float act, float pixM){
  gWcC=0.;
  if(act<=.01) return vec2(0.,1.);
  vec2 sd=normalize(uShore+vec2(1e-4)); float ca=cos(.35), sa=sin(.35);
  vec2 wd=vec2(sd.x*ca-sd.y*sa,sd.x*sa+sd.y*ca), wn=vec2(-wd.y,wd.x);
  const vec2 CS=vec2(26.,13.);
  vec2 q=vec2(dot(p,wd),dot(p,wn))/CS+vec2(uTime*.3/CS.x,0.);
  vec2 iq=floor(q), fq=fract(q);
  float d=0., ag=1.;
  for(int j=uZero-1;j<=1;j++) for(int i=uZero-1;i<=1;i++){
    vec2 c=iq+vec2(i,j);
    vec3 hh=hash33(vec3(c,17.3));
    if(hh.z>.5*act) continue;
    vec2 o=(vec2(i,j)+.15+.7*hh.xy-fq)*CS;                  // metres to this whitecap's centre
    vec3 h2=hash33(vec3(c,5.1));
    float sz=(.25+1.15*h2.x*h2.x*h2.x)*mix(1.,uWK2.x,smoothstep(.3,.8,pix)), age=h2.y;   // (r10w: x uWK2.x (URL wk4) at aerial footprints: no 6-10 px white "fish" in v9)            // mostly small, a few big ones (r8w: max 2.2 -> 1.4 m: seen from the air the photos show flecks of 1-3 m, no 10 m dashes)
    vec2 l=-o/sz; l.y+=l.x*(h2.z-.5)*.35;                  // local: x downwind, y along the crest
    l+=vec2(vnoise(l*.7+c*3.1),vnoise(l*.7+c*5.7))*.8;     // ragged outline
    // a streak drawn out in the wind (fresh: short and dense; older: long, thin, broken into flecks)
    float L=1.8+2.6*age+1.2*h2.z, W=1.-.35*age;
    float brk=smoothstep(-.3,.4,vnoise(vec2(l.x*.9,l.y*.3)+c*7.7)+.5-age*.6);   // breaks along the streak
    // (r8w) footprint-filtered AREA cover: each part convolved with the pixel footprint (radius sf). A whitecap narrower
    // than the pixel lights it by its area share -- a soft point -- instead of a saturated 1-px white dash (the r7 slivers
    // that crawl in motion: their energy was 5-25x too high). Two parts: a compact head of fresh whitewater at the downwind
    // end and a long, thin, translucent streak of older foam trailing upwind (no uniform white dash).
    float sf=pixM*.55;
    vec2 lm=l*sz;
    float rH=sz*(1.05+.3*h2.z), rHW=sz*W*.95, qH=sqrt(rH*rH+sf*sf), qHW=sqrt(rHW*rHW+sf*sf);
    vec2 lh=lm-vec2(sz*L*.55,0.);
    float eH=lh.x*lh.x/(qH*qH)+lh.y*lh.y/(qHW*qHW);
    float rT=sz*L, rTW=sz*W*.55, qT=sqrt(rT*rT+sf*sf), qTW=sqrt(rTW*rTW+sf*sf);
    float e=lm.x*lm.x/(qT*qT)+lm.y*lm.y/(qTW*qTW);
    float cvH=clamp(smoothstep(1.25,.12,eH)*rH*rHW/(qH*qHW)*1.45,0.,1.)*(1.-.55*age);
    float cvT=clamp(smoothstep(1.25,.12,e)*rT*rTW/(qT*qTW)*1.3,0.,1.)*.3*(1.-.35*age)*mix(1.,brk,smoothstep(.1,.5,e+age*.4));
    float cv=max(cvH,cvT);
    if(cv>d){ d=cv; ag=.15+.6*mix(age,1.,cvT/max(cvH+cvT,1e-4)*.6); }
  }
  // far: the mean area cover of the whitecap field (~0.5 % x activity)
  float k=clamp(2.4-pix*.7,0.,1.);
  d=mix(.005*act,d,k);
  gWcC=d;
  // density for foamTex whose coverage C(D)=1-exp(-1.3D^2-.35D) (x .9 for old foam) equals this cover
  float an=mix(.8,ag,k), X=-log(1.-clamp(d/mix(1.,.9,an),0.,.85));
  return vec2((sqrt(.1225+5.2*X)-.35)/2.6,an);
}
// one cascade lookup with an explicit (anisotropic) pixel footprint
void oSamp(sampler2D tD, sampler2D tS, vec2 uv, vec2 gx, vec2 gy, out vec4 d, out vec4 s){ d=textureGrad(tD,uv,gx,gy); s=textureGrad(tS,uv,gx,gy); }
float gDbgW=0.;   // (r8f) debug channel (URL aout=2/3)
// (r10w) mean of exp(-x/s) over the water part of a footprint [w - f/2, w + f/2] (f: the pixel's extent along the shore
//  distance): bands narrower than the pixel light it by their share instead of being point-sampled (no row-by-row toggling)
float expAvg(float w, float s, float f){ if(f<.05*s) return exp(-w/s); float a=max(w-.5*f,0.), b=w+.5*f; return s*(exp(-a/s)-exp(-b/s))/max(b-a,1e-4); }
vec3 shadeWater(vec3 pos, vec3 rd, float t){
  vec2 p=pos.xz;
  float pix=t*uTan*2./uRes.y;
  float bed=H(p), depth0=max(-bed,0.), depth=max(pos.y-bed,0.), w=max(coastW(p),0.), wR=max(-coastD(p),0.);
  vec4 at=ATT(p), vb0=VEG(p);
  float bzW0=smoothstep(.05,.4,vb0.b);
  float expo=at.z;
  float g=shoreGain(depth0,w)*uOAmp;
  gSCp=p; float g2=smoothstep(-1.,4.,w)*uOAmp*surfChop(depth0,w);
  float gust=.8+.4*fbm(p*.0011+vec2(uTime*.004,0.),3);
  // ---- pixel footprint on the sea surface (ray differentials): anisotropic, band-limited wave detail
  vec3 cf=uCam[2]; float dz=max(dot(rd,cf),.05);
  vec3 Dr=rd/dz; float sR=t*dz, kp=2.*uTan/uRes.y;
  vec3 ax=uCam[0]*kp, ay=uCam[1]*kp;
  float Dy=min(Dr.y,-.003);
  vec2 gx=sR*(ax.xz-Dr.xz*(ax.y/Dy)), gy=sR*(ay.xz-Dr.xz*(ay.y/Dy)), gx0=gx, gy0=gy;   // (r10w: gx0 / gy0 the true, uncapped footprint)
  float glim=pix*48., anR=max(length(gx),length(gy))/max(pix,1e-6);   // anR: footprint elongation before the cap
  gx*=min(1.,glim/max(length(gx),1e-6))*1.35; gy*=min(1.,glim/max(length(gy),1e-6))*1.35;
  float pixL=max(length(gx),length(gy)), pixS=min(length(gx),length(gy)), pixG=sqrt(pixL*pixS);   // footprint axes (m)
  vec2 bw=oBlendW(p);
  // choppy (Lagrangian) waves: the surface seen at p started at p - D(p): sharp crests, broad flat troughs
  vec2 Dxz=(textureGrad(uOD0,p/uOL.x,gx/uOL.x,gy/uOL.x).xz+(textureGrad(uOD1,p/uOL.y,gx/uOL.y,gy/uOL.y).xz*bw.x
           +textureGrad(uOD1,p*OB_SC/uOL.y+OB_OFF,gx*OB_SC/uOL.y,gy*OB_SC/uOL.y).xz*bw.y)*gust)*g
           +(textureGrad(uOD2,p/uOL.z,gx/uOL.z,gy/uOL.z).xz*bw.y+textureGrad(uOD2,p*OB_SC/uOL.z+OB_OFF.yx,gx*OB_SC/uOL.z,gy*OB_SC/uOL.z).xz*bw.x)*gust*g2;
  vec2 pl=p-Dxz;
  vec4 d0,s0,dA,sA,dB,sB,d2,s2,eA,tA;
  oSamp(uOD0,uOS0,pl/uOL.x,gx/uOL.x,gy/uOL.x,d0,s0);
  oSamp(uOD1,uOS1,pl/uOL.y,gx/uOL.y,gy/uOL.y,dA,sA);
  oSamp(uOD1,uOS1,pl*OB_SC/uOL.y+OB_OFF,gx*OB_SC/uOL.y,gy*OB_SC/uOL.y,dB,sB);
  oSamp(uOD2,uOS2,pl/uOL.z,gx/uOL.z,gy/uOL.z,d2,s2);
  oSamp(uOD2,uOS2,pl*OB_SC/uOL.z+OB_OFF.yx,gx*OB_SC/uOL.z,gy*OB_SC/uOL.z,eA,tA);
  vec2 sl1=sA.xy*bw.x+sB.xy*bw.y, sl2=s2.xy*bw.y+tA.xy*bw.x;
  vec2 v0=max(s0.zw-s0.xy*s0.xy,0.);
  vec2 v1=max(sA.zw-sA.xy*sA.xy,0.)*bw.x*bw.x+max(sB.zw-sB.xy*sB.xy,0.)*bw.y*bw.y;
  vec2 v2=max(s2.zw-s2.xy*s2.xy,0.)*bw.y*bw.y+max(tA.zw-tA.xy*tA.xy,0.)*bw.x*bw.x;
  float h1=dA.y*bw.x+dB.y*bw.y, h2=d2.y*bw.y+eA.y*bw.x;
  // detail octave: the 20 m cascade reused at 1/4.37 scale (rotated) -> short wind ripples (3 cm .. 1.7 m) with a
  // real wave spectrum instead of value noise; only where the pixel footprint resolves it, else it is roughness
  const mat2 RD=mat2(.809,.588,-.588,.809); const float S3=4.37;
  vec2 uv3=RD*pl*S3/uOL.z+vec2(.29,.71), gx3=RD*gx*S3/uOL.z, gy3=RD*gy*S3/uOL.z;
  // (r5: the ripples are choppy too: Lagrangian offset of the scaled cascade -> sharp crinkled crests, broad troughs)
  uv3-=textureGrad(uOD2,uv3,gx3,gy3).xz*(.75/uOL.z);
  vec4 s3=textureGrad(uOS2,uv3,gx3,gy3);
  vec2 sl3=transpose(RD)*s3.xy, v3=max(s3.zw-s3.xy*s3.xy,0.);
  // (r5w) micro octave: the same cascade at 1/19 scale (~1 m tile: ripples 1-40 cm, rotated again, choppy) -- a real
  // ripple spectrum with sharp crinkled crests instead of value-noise blobs; mip-filtered by the footprint (no shimmer)
  const mat2 RD4=mat2(.276,-.961,.961,.276); const float S4=19.1;
  vec2 uv4=RD4*pl*S4/uOL.z+vec2(.53,.17), gx4=RD4*gx*S4/uOL.z, gy4=RD4*gy*S4/uOL.z;
  uv4-=textureGrad(uOD2,uv4,gx4,gy4).xz*(.85/uOL.z);
  vec4 s4=textureGrad(uOS2,uv4,gx4,gy4);
  vec2 sl4=transpose(RD4)*s4.xy, v4=max(s4.zw-s4.xy*s4.xy,0.);
  float J1=1.+(dA.w-1.)*bw.x+(dB.w-1.)*bw.y, J2=1.+(d2.w-1.)*bw.y+(eA.w-1.)*bw.x;
  if(uAOut>=2){ vec2 dv=uAOut==2?vec2(J1*.5,h1*.15+.5):vec2(J2*.5,d0.y*.1+.5); dv=clamp(dv,0.,.999); gDbgW=14./255.*(floor(dv.x*255.)+floor(dv.y*255.)/255.); }   // (r8f) debug: URL aout=2 / 3 + dbga=1 write two 8-bit wave signals (R, G)
  // wind-sea slopes: real seas at ~10 m/s have a mean-square slope of ~0.05, most of it in short waves
  const float K0=.45, K1=.55, K2=.75;   // total mean-square slope ~.06 (Cox-Munk at ~11 m/s)
  // pre-filter: waves only a few pixels long read as noise, not as waves -- move their slope into roughness
  float k1=smoothstep(.8,5.,pixG)*.85, k2=smoothstep(.12,.9,pixG)*.8;
  vec2 r1=sl1*gust*K1*g, r2=sl2*gust*g2*K2;
  vec2 sl=s0.xy*K0*g+r1*(1.-k1)+r2*(1.-k2);
  vec2 var=(v0*K0*K0+v1*K1*K1*gust*gust)*g*g+v2*K2*K2*gust*gust*g2*g2+r1*r1*(1.-(1.-k1)*(1.-k1))+r2*r2*(1.-(1.-k2)*(1.-k2));
  // (r5) hydrodynamic modulation: the short ripples ride on the longer waves and bunch up on their crests (compressed,
  // J<1), the troughs between stay smooth and glassy -> crinkled silver lines along the crests and dark transparent
  // troughs instead of an even speckle of ripples everywhere (filtered J -> 1 far away: no modulation there)
  float crW=smoothstep(1.12,.72,J2)*.75+smoothstep(1.2,.8,J1)*.25;
  float rmod=.3+1.6*crW;
  const float K3=.65; float k3=smoothstep(.015,.12,pixG)*.85;
  vec2 r3=sl3*K3*gust*g2*rmod*(.7+.6*smoothstep(.3,.8,fbm(p*.05+uTime*.03,2)*.5+.5));
  sl+=r3*(1.-k3); var+=v3.yx*K3*K3*g2*g2*rmod*rmod+r3*r3*(1.-(1.-k3)*(1.-k3));
  const float K4=.6; float k4=smoothstep(.004,.035,pixG)*.85;
  vec2 r4=sl4*K4*gust*g2*(.45+.55*rmod);
  sl+=r4*(1.-k4); var+=v4*K4*K4*g2*g2*(.45+.55*rmod)*(.45+.55*rmod)+r4*r4*(1.-(1.-k4)*(1.-k4));
  // (r10w) far grazing band of the boat views (footprint elongated > 30-120x, i.e. beyond ~80 m from a 2.6 m camera): one pixel
  //  row averages hundreds of waves, but the hardware filter (anisotropy <= 8, cap 48 px) leaves part of the slope resolved,
  //  so each row drew a random facet: the bent-normal limit (F .3 <-> .7), the next-wave share and the land in the
  //  reflection toggled row by row -- horizontal stair-stepped streaks at the v2 horizon that would crawl in motion. There
  //  the resolved slope goes to roughness (uWK2.z, URL wk6; ramp from an elongation of uWK.w, URL wk3, to 4x that). Aerial views (elongation 1-3) are untouched.
  vec2 varAn=vec2(0);   // (the variance moved here: kept out of the reflected-land cone below)
  { float fAn=uWK2.z*smoothstep(uWK.w,uWK.w*4.,anR); varAn=sl*sl*(1.-(1.-fAn)*(1.-fAn)); var+=varAn; sl*=1.-fAn; }
  // debug: 33 depth contours (4 / 8 / 16 m), 32 shore-distance bands (5 / 15 / 40 m), 29 depth
  if(uDbgM==33) return vec3(depth0<4.?1.:0.,depth0<8.?1.:0.,depth0<16.?1.:0.)*.3*(.6+.4*smoothstep(.0,.1,abs(fract(depth0/2.)-.5)));
  if(uDbgM==29) return vec3(depth0/5.,depth0/15.,depth0/40.)*.4;   // debug: water depth
  if(uDbgM==96) return vec3(step(depth0,1.),step(depth0,2.),step(depth0,3.5))*.25*(.5+.5*bzW0)+vec3(0.,0.,.03);   // (r9w debug, r9m: 76 -> 96) depth bands 1 / 2 / 3.5 m, brighter in the beach zone
  // (r5) breaking over the shallows is decided on a ~3 m smoothed depth: the bilinear height texels (1-2 m) and the steep
  // reef lumps drew foam slabs with straight, stair-stepped outlines
  float depthS=depth0;
  if(depth0<17.&&w<260.){ const vec2 o1=vec2(2.7,1.2), o2=vec2(-1.2,2.7); depthS=max(-(H(p+o1)+H(p-o1)+H(p+o2)+H(p-o2)+bed*2.)/6.,0.); }
  // (r11w) sheltered cove: the small waves break on the cove's broad depth profile, not on each reef patch -- long crest lines
  //  parallel to the beach (the photos) instead of white blobs floating over the shallow patches. Breaking there is decided on
  //  a ~12 m smoothed depth. URL wk19 (0 = r10f).
  float covD0=smoothstep(215.,135.,length((p-vec2(290.,690.))*vec2(1.,1.12)))*(1.-smoothstep(.05,.4,vb0.b));
  if(uWK5.w*covD0>.01&&depth0<17.){ float sL=0.; for(int i=uZero;i<6;i++){ float an=float(i)*1.0472+.5; sL+=H(p+vec2(cos(an),sin(an))*12.)+H(p+vec2(cos(an+.52),sin(an+.52))*24.); }
    depthS=mix(depthS,max(-(sL/12.*.8+bed*.2),0.),uWK5.w*covD0); }
  // (r10w) fW: the pixel's extent along the shore distance (true footprint), for the surf bands (shoal() here, the foam sources
  //  below). URL wk12.
  float ce=2.; vec2 cg=vec2(coastRaw(p+vec2(ce,0))-coastRaw(p-vec2(ce,0)),coastRaw(p+vec2(0,ce))-coastRaw(p-vec2(0,ce)))/(2.*ce);
  vec2 cgn=normalize(cg+1e-5); float fW=uWK4.x*length(vec2(dot(gx0,cgn),dot(gy0,cgn))), fWn=clamp(1.-fW/16.,0.,1.);
  gShFW=fW; gShCv=covD0*uWK5.w; vec4 sh=shoal(p,w,depthS); gShFW=0.; gShCv=0.;
  // swash: thin sheet running up the sand -- calm, follows the beach slope
  vec3 sw=swash(p,bed);
  // (only on beaches: water over a rock shelf at the cliff foot is churning surf, not a calm swash sheet)
  float sheet=smoothstep(-.1,.05,bed)*smoothstep(.05,.4,vb0.b);
  sl*=1.-sheet*.85; var*=1.-sheet*.9;
  if(sheet>0.){ const float e=1.2; vec2 gH=vec2(H(p+vec2(e,0))-H(p-vec2(e,0)),H(p+vec2(0,e))-H(p-vec2(0,e)))/(2.*e); sl+=gH*.72*sheet; }
  sl+=-cg*sh.y;
  float rfW0=smoothstep(1.05,.5,length((p-vec2(172.,626.))/vec2(62.,42.))+.5*fbm(p*.025+4.,3))*smoothstep(-1.,4.,w)*smoothstep(-.1,.4,depth);
  float chz=clamp(max(max(rfW0,smoothstep(3.6,1.4,depth0)*smoothstep(.3,.55,expo)*smoothstep(-1.,5.,w)),
            1.4*max(smoothstep(4.5,1.,depth0)*smoothstep(90.,30.,w),gShB*.22)*smoothstep(-1.,5.,w)),0.,1.)*(1.-bzW0)
            *(1.-smoothstep(.42,.7,-rd.y)*smoothstep(40.,150.,t));
  float chzN=chz*(1.-smoothstep(.6,1.5,pixG));   // (r10w) ... near only (within ~60 m of a low camera; far, one pixel row spans many waves and the
                                                  //  foam density behind the backscatter is aliased: speckles at the v2 horizon)
  // (r12w, URL wk33) churned surf seen from a boat (chzN): a bubbly, turbulent surface has no crisp ripple facets -- the resolved 3 cm ..
  //  1.7 m ripple slopes drew the crumpled-foil / marble facets of the v3 near water; that share of them goes to roughness
  { float kCh=uWK9.y*chzN; vec2 r3r=r3*(1.-k3), r4r=r4*(1.-k4);
    sl-=(r3r+r4r)*kCh; var+=(r3r*r3r+r4r*r4r)*(1.-(1.-kCh)*(1.-kCh)); }
  // capillary ripples / cat's paws: three octaves, each faded out before it drops below the pixel footprint
  // (r5) wind ripples are long-crested across the wind (crest ~3x the wavelength): their slope points mostly along the
  // wind, so the sky glints they catch are thin crinkled lines, not round blobs (fixed wind frame, no octave rotation)
  vec2 wdC; { vec2 sd=normalize(uShore+vec2(1e-4)); float ca=cos(.35), sa=sin(.35); wdC=vec2(sd.x*ca-sd.y*sa,sd.x*sa+sd.y*ca); }
  vec2 wnC=vec2(-wdC.y,wdC.x);
  vec2 rq=vec2(dot(p,wdC)*5.,dot(p,wnC)*1.8)+vec2(uTime*.8,uTime*.55);
  float cat=(.6+.8*smoothstep(.3,.8,fbm(p*.05+uTime*.03,2)*.5+.5))*g2*rmod;
  vec2 rs=vec2(0); float fq=3.3, am=.5;
  for(int i=uZero;i<3;i++){
    float fo=clamp(1.5-pixL*fq*3.3,0.,1.);
    vec3 n=vnoised(rq); rs+=am*fo*(wdC*n.y*1.5+wnC*n.z*.55)*fq/3.3;
    var+=vec2(1.)*am*am*(1.-fo)*.0008*cat*cat;            // ripples below the footprint become roughness
    rq=rq*2.03+vec2(5.3,1.7); fq*=2.; am*=.5;
  }
  const float KC=.015;   // (r5w: the FFT micro octave carries the ripples now; the value-noise octaves drew round blobs)
  sl+=rs*KC*cat;
  vec3 N=normalize(vec3(-sl.x,1.,-sl.y));
  // reflection direction of the wave surface without the capillary ripples (for the large reflected features:
  // terrain, the next wave -- ripples would only jitter their outlines into speckled edges)
  vec3 Rw=reflect(rd,normalize(vec3(-(sl.x-rs.x*KC*cat),1.,-(sl.y-rs.y*KC*cat))));
  // Beckmann m^2 = unresolved mean-square slope (sum of both axes)
  // + capillary / short gravity waves below the shortest cascade (~15 cm): never resolved, ~1/5 of the total
  // surf zone: turbulence, bubbles and chop roughen the water (no glassy mirror between the breakers)
  float turbR=smoothstep(5.,1.2,depth0)*smoothstep(-1.,4.,w)*(1.-sheet*.7);
  float rough=clamp(sqrt(.0004+var.x+var.y+.01*gust*g2*(1.-sheet)+.012*turbR),.02,.4);
  // facets turned away from the viewer cannot be seen on a real surface (the wave itself hides them); with a
  // band-limited normal they would reflect at ~grazing incidence (Fresnel -> 1: bright sky patches with hard edges):
  // bend such normals back toward the viewer
  // (r8w) near (resolved ripples) the limit is .13: ripple facets bent to grazing mirrored the white horizon haze at
  // F ~.7 -> jagged white slivers in v2; far (the horizon band) unchanged
  float cv0=dot(-rd,N), bnt=0.;
  // (r9w) near (resolved waves) the limit is .24 (was .13) and the clamp is a smooth max (width .1): the facets bent up to
  //  exactly CV all had one Fresnel (.51) and a reflection pointing below the horizon -- the pale flat "plates" with crisp
  //  stair-step edges on the near water of v3 / v4 (dbgm 70: they are exactly the bent, down-facing facets)
  { float CV=mix(mix(.24,.13,smoothstep(.025,.12,pixG)),.07,smoothstep(.12,.5,pixG)), kS=mix(.1,.02,smoothstep(.03,.5,pixG));   // (.24 only right in front of the camera: v2 kept its silver mid-distance reflections)
    float cvS=.5*(cv0+CV+sqrt((cv0-CV)*(cv0-CV)+kS*kS));
    if(cvS>cv0+1e-4){ N=normalize(N-rd*(cvS-cv0)); bnt=smoothstep(CV+kS,CV-kS,cv0); } }
  float cosi=max(dot(-rd,N),.001);
  float F=.02+.98*pow(1.-cosi,5.);
  // (r9w) masking: a facet turned away from the viewer is mostly hidden behind the crest in front of it -- less mirror
  F*=mix(1.,mix(.72,1.,smoothstep(-.15,.15,cv0)),1.-smoothstep(.03,.15,pixG));
  // (r10w) churned rocky surf (the reef flat off the headland, exposed rock flats, the shallow surf zone along rocky shores):
  //  the surface is broken by bubbles and turbulence and the water just below it is a cloud of micro-bubbles. Seen from a
  //  boat this water is a luminous blue with white lace, not a chrome mirror of the pale horizon haze (the v3 photo): a weaker,
  //  broken mirror here (uWK.y, URL wk1) and a blue bubble backscatter below (uWK2.y, URL wk5). From the air (aerial
  //  footprints: aerial aqua look of r8f) unchanged. Beaches excluded (sand floor: the v4 teal is tuned).
  F*=1.-uWK.y*.45*chzN;
  vec3 R=reflect(rd,N);
  // ---- optical water properties (per metre): diffuse attenuation and deep-water reflectance (clear tropical sea)
  // (r13w, URL wk41) red .36 -> .48 /m: the photos' cove and shallows have R ~0 (v9 cove 0/145/168, reef 0/75/100); ours kept R 22-50
  //  (sand and reef red through 1-4 m of water: a grey-milky aqua and purple-grey reef patches; v4 near water 108/154/165 vs 81/136/149)
  vec3 KD=vec3(.36+.12*uWK11.y,.049,.044);     // (r8w: G .053 -> .049: the floor of the cove shows a little deeper -- brighter aqua) clear oceanic water: blue penetrates furthest, then green; red is gone within a few metres (r7w: was .36,.052,.045)
  const vec3 RINF=vec3(.0002,.0138,.032);   // (r7w: was .0165,.040 -- with the grey sheen gone the open sea sat 10-25 sRGB above the photos' navy in G and B)
  float sunSh=shadow(vec3(p.x,.6,p.y),uSun,0.);
  // the water body under a cast shadow is still lit sideways by the sunlit water around it (light scattered in the
  // column, bright sunlit bed nearby) and by more of the bright sky near the sun: cliff shadows on the sea are soft
  vec3 Esun=SUN*uSun.y*mix(.4,1.,sunSh), Esky=skyIrr(vec3(0,1,0))*1.25;
  vec3 deepC=RINF*(Esun+Esky)*.45;
  // ---- reflection: sky (clouds), the water's own far side for down-pointing facets, terrain
  vec3 refl=skyRefl(vec3(R.x,max(R.y,.0),R.z),rough);
  float dn=smoothstep(.0,-.25,Rw.y)*.85;                      // facet faces down: sees the next wave (blended in below, once the body colour is known)
  // terrain in the reflection, seen through the rough-surface lobe: soft visibility (cone march) instead of hit / miss
  float tW=0., visH=1.; vec3 tcH=vec3(0);
  // (r13w, URL wk44) the march also runs for facets turned below the horizon (its ray is then the horizontal one): its result is the
  //  terrain seen at the horizon, which the next-wave blend below uses instead of the open horizon haze
  if(t<2200.&&(Rw.y>-.03||uWK12.x>0.)){
    vec3 Rr=normalize(vec3(Rw.x,max(Rw.y,.004),Rw.z));
    // (r10w: the cone from the roughness without varAn -- the wider cone turned the reflected cliff into olive speckles in v2's far band)
    float cone=.015+clamp(sqrt(max(rough*rough-varAn.x-varAn.y,.0004)),.02,.4)*.8, tr=2., mina=1.; vec3 q, qm=pos;
    // (r13w, URL wk44) the march goes on through the land up to ~.75 (tan) below the ray, so mina is the land's full angular height above
    //  the ray (it stopped at -cone: a facet whose ripple tilts its reflection up by more than the cone escaped over a 30 deg cliff into
    //  the sky -- the pale band in front of the v2 cliffs); the colour stays the one where the ray meets the face
    for(int i=uZero;i<56;i++){ q=pos+Rr*tr; float dd=q.y-H(q.xz); float a=dd/tr; if(a<mina){mina=a; if(a>-cone||tr<2.5||uWK12.x<=0.) qm=q;} if(a<-cone-.75*uWK12.x) break; tr+=max(dd*.6,1.5+tr*.02); if(tr>1400.||q.y>uHmax) break; }
    // (r9f) the resolved ripples break the reflected land up: the march runs along the ripple-free ray Rw, and the clearance
    //  angle mina is shifted by the ripple's own change of reflection elevation (tan units, R vs Rr): a facet tilted toward the
    //  viewer sends its ray over the ridge line into the sky, one tilted away sees deeper into the land -- the land / sky edge in
    //  the reflection crinkles with every resolved ripple (the normals are footprint-filtered: nothing below the pixel).
  //  URL fa0 (1). Small on its own (the capillary octave is small); kept because it is the physically right edge.
    float dE=R.y/max(length(R.xz),.05)-Rr.y/max(length(Rr.xz),.05);
    float vis=smoothstep(-cone,cone,mina+uFXa.x*clamp(dE,-.6,.6));
    vec3 tc=terrainCheap(vec3(qm.x,H(qm.xz),qm.z))*.75;
    // (r13w, URL wk44) the colour at the minimum-clearance point is the very foot of the land: the thin sand / shingle strip at the
    //  waterline (sand albedo .56), while the rough-surface lobe (cone up to ~14 deg) mostly sees the cliff face above it -- the far band
    //  in front of the v2 cliffs mirrored the bright strip (reflected land luminance > .1, the cliffs ~.04). Averaged with two points a
    //  little further along the ray (up the face)
    if(uWK12.x>0.){ vec2 q1=qm.xz+normalize(Rr.xz+1e-5)*6., q2=qm.xz+normalize(Rr.xz+1e-5)*16.;
      tc=mix(tc,(tc*.2+terrainCheap(vec3(q1.x,H(q1),q1.y))*.75*.35+terrainCheap(vec3(q2.x,H(q2),q2.y))*.75*.45),uWK12.x);
      // ... and terrainCheap has no cast shadow, AO or dark wet basalt: its land is lum .1-.15, ~2-3x the rendered cliffs (the v2 strip
      //  stayed L 55-65 under cliffs at L 24). The mirrored land is capped at the cliffs' brightness (hue kept)
      float tL=dot(tc,vec3(.2126,.7152,.0722)); tc*=mix(1.,min(1.,.04/max(tL,1e-4)),uWK12.x); }
    tc=mix(tc,skyCol(normalize(vec3(Rr.x,.02,Rr.z))),1.-exp(-uFog*tr*1.5));          // aerial perspective over the reflected path
    visH=vis; tcH=tc;
    float wTr=smoothstep(-.03,.015,Rw.y); if(uDbgM==91) vis=1.;   // (r9w; r9m: debug 71 -> 91) fades out toward Rw.y -.03 (it was cut there: a hard edge)
    vis=mix(mix(1.,vis,uWK12.x),vis,wTr); tW=1.-vis;   // (r13w, wk44: a facet whose reflection points just below the horizon (Rw.y < 0: neither the land nor, below R.y ~ -.05, the next wave) mirrored the open horizon haze -- in front of a cliff that horizon is the land)
    if(vis<.999) refl=mix(tc,refl,vis);
  }
  // sun glitter: Beckmann facet distribution (Gaussian slopes, Cox-Munk) on the band-limited surface:
  // tight sparkle up close, a smooth glitter field far away, no long GGX tail veiling the whole sea
  vec3 Hh=normalize(uSun-rd);
  // (r7w) aerial footprints: the sun lobe of the unresolved slopes is narrowed -- its broad tail laid a warm grey sheen
  // over the whole open sea (most of the red in the r6b deep sea); now the light gathers into glints on the resolved facets.
  // Keyed to the footprint at the OUTPUT resolution (941 rows), so every render quality (hres) gets the same look.
  float aGl=smoothstep(.25,.9,t*uTan*2./941.);
  // (r8w) ... but the narrowed lobe gathered the light onto the resolved 5-20 m wave faces: soft grey smears along the
  // crests (v1/v9). Now the wide lobe (the glitter of the unresolved facets) is broken into sparse sparkle points instead.
  float a2=rough*rough*mix(1.,.6,aGl), NdH=max(dot(N,Hh),.01);
  float NdL=max(dot(N,uSun),0.);
  float Fs=.02+.98*pow(1.-max(dot(Hh,-rd),0.),5.);
  float G=1./(1.+sqrt(1.+a2*(1.-cosi*cosi)/(cosi*cosi)))*2.;
  float c2=NdH*NdH;
  float spec=exp(-(1.-c2)/(c2*a2))/(PI*a2*c2*c2)*Fs*G/(4.*cosi+.001);
  spec=min(spec,300.);
  // (r8f) ... and the points sit on the crest veins (where the short waves bunch up), only faint in the troughs: sparkle x
  //  (.3 .. 1.8) by the crest signal (from the air only; mean ~x.7), sparkle mean .09 -> .08
  // (r9w) the group field gm (see the aerial relief below) is computed here: the sparkle gathers in the active patches too
  float gm=0.;
  if(aGl*smoothstep(.3,.6,-rd.y)*smoothstep(6.,20.,depth0)>.001){ vec2 gq=vec2(dot(p,wdC)/210.,dot(p,wnC)/95.)+vec2(fbm(p*.0045+1.7,2),fbm(p*.0045+5.1,2))*1.1+vec2(uTime*.003,0.);
    gm=smoothstep(-.32,.32,fbm(gq,3)); }
  { float aRs=smoothstep(.3,.6,-rd.y)*smoothstep(6.,20.,depth0), crP=clamp(3.*(1.-J1)+.75*(1.-J2),0.,1.);
    float spC=mix((.3+1.5*crP)*(.3+1.4*gm),(.06+2.4*crP*crP)*(.12+1.9*gm*gm)*1.15,uWK6.x);   // (r11w, URL wk20) the glints concentrate on the crest veins of the active patches; isolated specks in the troughs / calm stretches fade
    spec*=mix(1.,.7,smoothstep(.3,1.5,pixG))*mix(1.,.056*sparkle(p,pixL*.55)*mix(1.,spC,aRs),aGl); }   // (r9w: x(.3 .. 1.7) by the group field: clustered, not an even star field)   // aerial: sparse points (mean x.17), no smudges (r7w: x.4 smooth)
  // (r8m) sparkle mean .17 -> .09: at 1:1 the v1 open sea read as an even white star field ("snow", white L*>55 0.68 % of
  //  the sea vs photo 0.15 %); at half the mean only the few brightest facets stay visible, and they are dimmer
  // ---- water body: deep reflectance + sea bed seen through the column (two-way attenuation along refracted paths)
  vec3 Tr=refract(rd,N,.75);
  float muV=max(-Tr.y,.35), muS=sqrt(1.-(1.-uSun.y*uSun.y)*.5625);
  float tb=depth/muV;
  vec2 bp=p+Tr.xz*tb;
  float bdepth=max(pos.y-H(bp),0.);
  vec4 vb=VEG(bp);
  // the reef flat off the headland (seaFloor): dark lava rock and coral, sand only in gullies
  float rfS=smoothstep(1.,.6,length((bp-vec2(172.,626.))/vec2(62.,42.))+.3*fbm(bp*.03+4.,2));
  float aerA=smoothstep(.42,.7,-rd.y)*smoothstep(40.,150.,t);   // (r8f) seen from the air (v1 / v9), not from a boat (v2-v4: also not the steep water right below the camera)
  // sediment sorting by the waves: sheltered water (cove interiors) has a white sand floor; the exposed shelf along the
  // cliffs is mostly boulders / basalt with sand only in patches and gullies (darker teal from the air)
  float shelt=1.-smoothstep(.38,.62,ATT(bp).z+.1*fbm(bp*.01+6.,2));
  shelt=max(shelt,smoothstep(215.,135.,length((bp-vec2(290.,690.))*vec2(1.,1.12))+30.*fbm(bp*.012+2.,2)));   // the cove behind the headland: sand floor (r4f: inner cove only -- the cove mouth stays navy)
  float rfK=aerA*uWK8.z;
  float rfSd=rfS*(1.-.95*aerA*uWK10.x);   // (r12w, wk36) from the air the reef flat keeps only a trace of its dark floor: the faint darker zone in the cove (v1 / v9) is gone   // (r11 fix, URL wk30) the reef flat seen from the air, now that its white field is gone (r11w wk19)
  shelt*=mix(smoothstep(.75,1.25,length((bp-vec2(172.,626.))/vec2(62.,42.))),1.,rfK*(.75+.25*uWK10.x));   // (r11 fix) ... lies in the cove's sheltered water: its sand channels keep the cove's milky aqua (it read as a dark navy oval / stain in v1 / v9)   // (not the reef flat off the headland: lava rock, surf)
  // surf-zone turbidity (suspended sand, micro-bubbles): turquoise scattering, less of the bed visible
  // (and wherever waves break: the water between the breakers stays milky with bubbles and stirred-up sand)
  float turb=max(smoothstep(3.,.8,depth0)*.3,gShB*(.12+.1*smoothstep(10.,3.,depth0)))*smoothstep(-.2,.3,depth);
  // fine suspended sand over shallow sandy floors: a milky backscatter (turquoise rather than cyan), strongest in the
  // sheltered cove where the surf keeps the fine sand in suspension
  // (r5 merge: the r5w cove-mouth term (bed faded out beyond ~130-235 m from the beach) was dropped: ref.png and r9 both
  // show turquoise across the whole cove out to the headland line; with it v1's mid-cove went 37/121/139 -> 32/87/119,
  // photo 52/150/158, and v1 lost 2 points)
  // (r8w: .011 -> .015 (+ .007 over the shoreface): the cove's top end was ~6 L under the photos' aqua. The milky glow is
  // a view-angle effect: seen from the air it is the luminous aqua of the shallows; from a boat at a low angle the
  // surface reflection and the oblique path hide most of it (v3/v4 near water was a pale pool-turquoise))
  float aerV=mix(.4,1.,smoothstep(.3,.72,-rd.y));
  float milk=smoothstep(16.,4.,depth0)*(smoothstep(-.2,.6,vb.b+.3)*.006+shelt*.019*(1.-.7*bzW0)+.012*bzW0)*mix(.3,1.,aerV*aerV)
            +.026*bzW0*smoothstep(3.2,.8,bdepth)*aerA;   // (r9w) from the air the stirred-up sand over the last 1-3 m of the shoreface glows a bright aqua band along the beach (the boat views: aerA = 0)
  // (r8w) churned water over exposed rock / reef flats hides most of the bed (the boat views there read a pale pool-turquoise
  // from the lit 1-3 m bed: v3 L48 h217 vs photo L41 h248) and its backscatter is blue; over the beach shoreface the
  // suspended sand is the luminous aqua of the aerial photos (seen from a boat much less: aerV)
  float expT=(1.-shelt)*(1.-bzW0);
  // (r13w, URL wk40) the exposed shelf off the cliff coast drops into the navy within ~10-40 m of the rock (a steep basalt shelf): its sand
  //  floor and milky backscatter showed through 10-25 m of water out to 100-200 m off the coast -- the wide cyan halo round every headland
  //  in v1 / v9 (the photos: navy right up to the collars, turquoise only in the foam at the rock feet). The bed and the milk fade with the
  //  (ragged) distance from the rock, 16-55 m; the sheltered cove, the beach shoreface and the rock feet keep their turquoise.
  //  (r13 merge) the water round's late 14:38 edit (22-65 m: aqua kept under the outer collar lace, aerial water pops up 7.5 -> 6.7 /
  //  10k px) is reverted: it brought back a visibly wider cyan halo round the v9 headlands and scored lower (v1 78.1 -> 77.8, v9 78.2 -> 77.9)
  float hF=uWK11.x*expT*smoothstep(16.,55.,w+12.*fbm(p*.021+vec2(4.3,1.1),2))*(1.-rfS)
         *smoothstep(200.,290.,length((p-vec2(290.,690.))*vec2(1.,1.12))+25.*fbm(p*.012+2.,2));   // (not over the cove and its mouth: the photos keep turquoise out to the headland line)
  // (r13 fix, URL wt3) ... nor over the west bay's reef terrace (wBayM, the same world mask that shapes the floor in FS_HEIGHT):
  //  ref.png's bay is deep teal out to ~150-200 m; the fade is for the steep basalt shelf off the headlands (v9 photo)
  hF*=1.-uWT.w*uWT.x*wBayM(p);
  milk*=1.-.85*hF;
  // (r8f) ... seen from the air the churned reef flat is the luminous aqua of its bubble cloud over a 1-3 m floor (the photos
  //  show white foam straight on aqua): there the turbid layer keeps the r7 attenuation and an aqua backscatter -- the blue
  //  turbid veil + dark gravel drew an indigo-grey disc (h232-241, defined edge) under the softer r8 aerial foam
  float rfA=rfS*aerA;
  vec3 KDt=KD+turb*vec3(.45,.56,.48)*(1.+1.1*expT*(1.-.7*rfA)), RINFt=mix(RINF+milk*vec3(.08-.06*uWK11.y,1.25,1.1),mix(vec3(.005,.038,.052)*mix(.45,1.,aerV*aerV),mix(vec3(.006,.034,.062),vec3(.006,.046,.06),rfA),1.-bzW0),turb);   // turbid: bright turquoise backscatter (bubbles, sand) (r7: beach .004,.024,.034, rock .005,.04,.062)
  // (r8w) the floor's optical depth on a ~14-32 m smoothed bathymetry: the modelled shelf drops from ~8 to 25 m within a
  // few metres at the cove mouth -- from the air an abrupt cyan -> navy step; the smoothed depth ramps it through teal
  float bdO=bdepth;
  // (water taps only, and only toward shallower: the deep side of a step gets a teal fringe, the inner shallows and the
  // water along the beach keep their own depth)
  if(bdepth<45.){ float sm=0., sw=0.; for(int i=uZero;i<6;i++){ float an=float(i)*1.0472+.3; vec2 dq=vec2(cos(an),sin(an));
    float d1=pos.y-H(bp+dq*14.), d2=pos.y-H(bp+vec2(dq.y,-dq.x)*32.);
    float w1=smoothstep(.2,1.5,d1), w2=smoothstep(.2,1.5,d2); sm+=d1*w1+d2*w2; sw+=w1+w2; }
    if(sw>.5) bdO=min(bdepth,mix(bdepth,sm/sw,.6)); }
  vec3 Tb=exp(-KDt*bdO*(1./muS+1./muV))*(1.-smoothstep(24.,38.,bdO));   // (the modelled floor stops at ~40 m: beyond the shelf the sea is bottomless)
  if(uDbgM==97) return vec3(turb*3.,milk*40.,gShB*.5)*.5;   // (r10w debug) turbidity, milk, breaking
  // (r10w) exposed shelf (not the sheltered cove, not the beach shoreface, not the shallow reef flat): a basalt / boulder floor
  //  off a cliff coast fades into the navy within ~8-20 m. The modelled shelf stays 10-30 m deep far out in the bays: its sand
  //  turned the open water teal (v9 left bay h257 vs photo h266-273, v1 same bay h223-245 vs h258-263). URL wk7.
  Tb*=1.-uWK2.w*.75*expT*smoothstep(6.,18.,bdO);
  Tb*=1.-.7*smoothstep(8.,26.,bdO);
  Tb*=1.-.85*hF;   // (r13w, wk40)
  if(uDbgM==98) return vec3(Tb.g,shelt,expT)*.5;   // (r10w debug) bed transmission, sheltered floor, exposed shelf
  // (r9w: 10-22 -> 8-26 m: a softer turquoise -> navy ramp)   // (r4f: the floor fades into navy past ~10 m (the modelled shelf is shallower than the real cove mouth): turquoise stays in the inner cove; r7w: .8 over 8-18 m -> .7 over 10-22 m, the photos keep turquoise across the whole cove)
  // footprint on the bed: pixel + refraction blur through the unresolved surface slopes (grows with depth)
  float bpix=pix+bdepth*(.03+.5*sqrt(var.x+var.y))/muV;
  float bfd=clamp(1.-bpix*.6,0.,1.), bf1=clamp(1.2-bpix*.9,0.,1.), bf3=clamp(1.2-bpix*.3,0.,1.);
  float reef=clamp(vb.g*(.75+.5*fbm(bp*.5,3)*bf1),0.,1.);
  float rfP=mix(1.,smoothstep(-.1,.22,fbm(bp*.035+vec2(5.,2.),3)+.35*fbm(bp*.11+8.,2)),rfK);   // (r11 fix) from the air: ragged ~10-30 m reef patches with sand channels, like the cove's other patch reefs
  reef=max(reef,rfSd*rfP*smoothstep(-.2,.25,fbm(bp*.12+3.,3)+.15));
  // dark basalt bed only along rocky shores; in front of beaches the floor is sand right up to the swash
  float rockBed=(1.-smoothstep(4.,30.,max(-coastRaw(bp),0.)))*(1.-smoothstep(.0,.25,vb.b));
  vec2 sdir=normalize(uShore+vec2(1e-4));
  float rph=dot(bp,sdir)*1.9+fbm(bp*.15,3)*4.;
  float ripple=mix(.5,sin(rph)*.5+.5,clamp(1.-bpix*2.,0.,1.));
  vec3 sand=mix(vec3(.55,.575,.56),vec3(.23,.245,.26),bzW0*.85*smoothstep(.45,1.4,bdepth))*   // (r9w: the last metre of the shoreface (v4 near water is 1-2 m: unchanged) are the clean beach sand: the bright aqua band along the sand from the air)
         // (r8w: cove floor +12 %: the bright aqua shallows; shoreface .25 -> .23: v4's near water read ~6 L light and cyan)   // (r7w: bright cool-white coral sand, darker cooler shoreface: was .46,.46,.42 / .3,.31,.29)
       // (white coral sand on the cove floor; the surf-zone shoreface in front of the beach: darker, rippled, wet sediment)
     (.82+.3*(fbm(bp*.35,3)*.5+.5)+.08*vnoise(bp*2.)*bfd)*(.9+.16*ripple);
  sand*=mix(1.,mix(.5,.85,aerA),rfSd*mix(1.,rfP,rfK));   // (r8f: from the air x.85, see rfA)   // (r8w) the reef flat off the headland: dark basalt gravel in its gullies, not white coral sand
  float coral=mix(.12,smoothstep(.15,.45,fbm(bp*.9+11.,4)+.3*vnoise(bp*3.)*bfd),bf1)*smoothstep(.1,.5,vb.g+.25);
  float algae=smoothstep(.2,.6,fbm(bp*.2+4.,3))*(1.-vb.g)*.5;
  sand=mix(sand,vec3(.15,.15,.10),algae*.55);
  // where the water is only a film over the beach, the bed is the beach's own wet coral sand (no colour step)
  sand=mix(sand,vec3(.40,.31,.22)*(.9+.2*(fbm(bp*.35,3)*.5+.5)),smoothstep(-1.,-.15,pos.y-bdepth)*smoothstep(.2,.6,vb.b));   // (lit like the wet sand above: x .55 at the interface)
  // (r5) reef tone in three scales: ~15 m zones (turf / live coral / bare rock), ~2 m heads, ~0.7 m crevices; brown-dark
  float rvZ=fbm(bp*.07+2.,3)*.5+.5;
  float rv=mix(.5,fbm(bp*.45,3)*.5+.5,bf1)*.6+rvZ*.4;
  vec3 reefC=mix(mix(vec3(.02,.028,.024),vec3(.10,.08,.05),smoothstep(.32,.72,rv)),vec3(.055,.05,.036),   /* (r12 fix) .06,.045,.05 -> brown-olive: the purple-maroon tint in the cove centre (v1 / v9) */smoothstep(.75,.9,fbm(bp*1.3+3.,2)*.5+.5)*bfd);
  reefC*=mix(1.,.55+.9*(fbm(bp*1.4+7.,2)*.5+.5),bfd);   // crevices / heads below 1 m
  // reef: clusters (~60 m) of coral heads / rocks (~3-6 m), seen from above as dark speckles through the water;
  // the heads blur into the cluster's mean tone once the bed footprint exceeds their size
  float clus=smoothstep(-.15,.3,fbm(bp*.016+21.,3));
  float heads=fbm(bp*.21+5.,3)*bf3+.35*fbm(bp*.6+2.,2)*clamp(1.-bpix*.8,0.,1.);
  float hw=.09+.25*(1.-bf3);
  float patchR=smoothstep(.19-.25*clus-hw,.19-.25*clus+hw,heads)*clus*smoothstep(1.2,4.,bdepth);
  // patch reef of the cove floor: irregular coral / rock patches (~10-40 m) on the sand, ragged edges with coral
  // heads and sand pockets -- from the air dark teal blotches between bright sand channels
  vec2 pq=bp*.05+vec2(fbm(bp*.013+3.,2),fbm(bp*.013+8.,2))*1.6;
  float wbR=uWT.x*wBayM(bp);   // (r13 fix) the west bay terrace (11-19 m) carries patch reefs too: ref.png's bay shows dark reef masses in the teal
  float pm=fbm(pq+31.,4)+.17*fbm(bp*.14+9.,3)*bf3+.1*fbm(bp*.5+4.,2)*bf1;   // (r5: ragged at 6 m and 2 m too -- no smooth polka dots)
  float dP=smoothstep(-.03,.36,pm), thP=.32-.7*dP, hwP=.07+.3*(1.-bf3);
  float patchM=mix(smoothstep(thP-hwP,thP+hwP,heads),dP,.25+.5*(1.-bf3))*smoothstep(-.2,.05,pm)
              *smoothstep(1.,3.,bdepth)*smoothstep(35.,100.,w)*smoothstep(20.+wbR*7.,11.+wbR*7.,bdepth)*(.8+.2*clus);
  // (r13w, URL wk43) the patch reefs read as smooth camouflage blotches; the photos show clusters of coral heads / boulders on the sand:
  //  dense dark cores, granular edges that break into single heads (~1.5-4 m) and sand pockets. The same cluster field (pm) sets the
  //  head density; the heads are footprint-filtered discs (reefGrain).
  float rM=clamp(max(max(max(reef,coral*.9),patchR*.9),patchM*.88),0.,1.);
  if(uWK11.w>0.){ float dCl=clamp(rM*1.15+.12*fbm(bp*.3+2.7,2)*bf3,0.,1.);
    float rG=max(smoothstep(.85,1.,dCl)*.9,reefGrain(bp,dCl,bpix)*smoothstep(.04,.3,rM));
    // (r13 fix, URL wk47) the granular reef read as a CG leopard print in the cove (v9 / v1): many hard-edged dark blobs of one size,
    //  spread evenly up to the beach. ref.png / r9 show fewer, larger, soft-edged reef clusters mid-cove with granular heads inside, and
    //  clear sand-bottom aqua off the beach. A ~120 m cluster field thins the reef between clusters, the cluster body has a wide soft
    //  edge with the heads as texture inside it (not as the outline), and the first ~20-65 m off the beach stay sand (dC: the arcs'
    //  beach distance below).
    if(uWK12.w>0.){
      float clu=smoothstep(-.3,.25,fbm(bp*.0085+vec2(1.7,4.2),3));
      float dCb=length((bp-vec2(332.,862.))*vec2(1.,1.08))-88.+3.*vnoise(bp*.05+2.2);
      float clr=(1.-smoothstep(20.,65.,dCb+18.*fbm(bp*.02+vec2(5.5,1.2),2)))*smoothstep(215.,135.,length((bp-vec2(290.,690.))*vec2(1.,1.12)));
      float dn=clamp(dCl*mix(.6,1.25,clu),0.,1.)*(1.-.75*clr);
      float core=smoothstep(.5,1.,dn);
      float gr=reefGrainS(bp,dn,bpix);
      float rN=max(core*(.62+.38*gr)*.92,gr*smoothstep(.04,.35,dn)*.72);
      rG=mix(rG,rN,uWK12.w); }
    rM=mix(rM,rG,uWK11.w); }
  vec3 bedA=mix(sand,reefC,rM);
  // exposed shelf: boulder / basalt floor, sand in pockets (mottled at ~5-20 m)
  float bould=(1.-shelt)*clamp(.5+.5*fbm(bp*.07+17.,3)+.25*(heads-.2)*bf3,0.,1.)*(1.-smoothstep(.1,.5,vb.b));
  bedA=mix(bedA,mix(vec3(.035,.04,.035),vec3(.09,.085,.07),smoothstep(.2,.7,rv)),bould*.85);
  bedA=mix(bedA,vec3(.03,.032,.03),rockBed*.6);   // (r7w: was .75 -- the photos show turquoise with dark reef along the rocky shores too)
  // caustics: focusing by the surface curvature (Laplacian of the slope field), band-limited by the footprint
  vec2 cpp=bp-uSun.xz/max(uSun.y,.3)*bdepth*.75;
  float ex=.35, cl1=oLod(uOL.y,bpix), cl2=oLod(uOL.z,bpix);
  float lap=0.;
  lap+=(textureLod(uOS1,(cpp+vec2(ex,0))/uOL.y,cl1).x-textureLod(uOS1,(cpp-vec2(ex,0))/uOL.y,cl1).x+textureLod(uOS1,(cpp+vec2(0,ex))/uOL.y,cl1).y-textureLod(uOS1,(cpp-vec2(0,ex))/uOL.y,cl1).y)/(2.*ex);
  lap+=(textureLod(uOS2,(cpp+vec2(ex,0))/uOL.z,cl2).x-textureLod(uOS2,(cpp-vec2(ex,0))/uOL.z,cl2).x+textureLod(uOS2,(cpp+vec2(0,ex))/uOL.z,cl2).y-textureLod(uOS2,(cpp-vec2(0,ex))/uOL.z,cl2).y)/(2.*ex)*K2;
  float caus=clamp(1./max(1.+bdepth*.5*lap*g,.2),0.,3.5);
  caus=mix(1.,caus,clamp(1.-bpix*2.5,0.,1.)*smoothstep(.15,1.2,bdepth));
  vec3 Ebed=Esun*caus+Esky;
  // upwelling radiance falls off for grazing (refracted ~45 deg) views
  // seen at grazing angles the deep body turns teal: much of what reaches the eye has crossed thin wave crests
  // (r9w) the grazing tint acts on the water column only (more teal: v2's open water read cobalt, h259 vs photo h246); the
  //  bed seen at a low angle keeps its blue (G ~ B): the old tint on the bed light turned the shallow boat views cyan-green
  //  (v4 h210 vs photo h221, v3 h237 vs h249) -- a little darker and less red instead
  float gzT=1.-smoothstep(.66,.95,muV);
  if(uDbgM==99) return vec3(gzT,aerA,rfS)*.5;   // (r10w debug) grazing tint, aerial weight, reef flat
  // (r10w) seen from the air (aerA) the grazing column tint is a darker, less green blue: v9's upper open sea (35 deg down,
  //  gzT ~.6) read cerulean-teal (h243-255, L 32-35) against the photo's navy (h259-267, L 25-32); v1 (> 50 deg down, gzT < .2)
  //  barely changes, the boat views (aerA 0) not at all. URL wk15.
  vec3 gzC=mix(vec3(.3,.86,.52),vec3(.45,.50,.66),aerA*uWK4.w);
  vec3 body=(RINFt*(1.-Tb)*(Esun+Esky)*mix(vec3(1.),gzC,gzT)+bedA*Tb*Ebed*mix(vec3(1.),vec3(.64,.72,.76),gzT))*.45;   // (r8w: grazing tint .25,.60,.56 -> .3,.78,.58: v2's troughs teal-navy, not cobalt)   // (r5: grazing body a deeper teal, not near-black blue)
  // light transmitted through thin wave crests (teal glow on the back of near waves)
  float crest=max(h1*gust*g+h2*gust*g2*1.5,0.)+sh.x*.8;
  float back=smoothstep(-.3,.7,dot(normalize(rd.xz+1e-4),normalize(uSun.xz+1e-4)));
  body+=SUN*sunSh*vec3(.0,.011,.0125)*crest*(.25+.75*back)*clamp(1.-pix*1.5,0.,1.);
  // (r5) ... and the bright sky dome shines through every thin crest / ripple face from behind: faces turned to the viewer
  // glow transparent teal (seen in the troughs and the near faces at low views), whatever the sun direction
  float faceV=smoothstep(.15,.6,cosi)*smoothstep(.55,.2,-rd.y);
  // (r8w) ... over a visible bed the faces are lit by the bed light already (counted in the body): the extra teal glow
  // (G > B) turned the shallow near water of v3/v4 pool-turquoise (h214-219 vs photos h222-248)
  body+=Esky*vec3(.0,.06,.04)*(.35+1.4*clamp(crest,0.,.7))*faceV*clamp(1.-pix*.8,0.,1.)*mix(1.,.3,smoothstep(.12,.5,Tb.g));
  float dnD=dn;
  // (r9w) a facet whose reflection points below the horizon sees the next wave: its lit body and a little horizon sky. Keyed to
  //  the reflection with the ripples too (R): R.y < 0 used to return the clamped horizon haze, a constant pale grey
  dnD=smoothstep(0.,-.15,min(R.y,Rw.y+.02))*.9;   // (from R.y 0, not +.03: facets just above the horizon keep the silver low sky -- v2)
  // (r13w, URL wk44) ... the "horizon" a down-facing facet sees over the next crest is the land when a cliff stands behind it: the far band
  //  in front of the v2 cliffs mirrored the open marine haze there (a pale milky strip, L 56-69 vs photo 48-51)
  vec3 hzR=skyRefl(normalize(vec3(R.x,.002,R.z)),rough); hzR=mix(tcH,hzR,mix(1.,visH,uWK12.x));
  refl=mix(refl,mix(hzR,body*1.3,mix(.72,.45,smoothstep(.03,.2,pixG))),dnD);   // (mid distance: a pixel spans grazing faces too -- some silver horizon stays, v2)   // continuous with the horizon at R.y=0
  // (r9f) crest sheen: where the band-limited normal faces away from the viewer (bnt), what the eye really sees is the top of
  //  the crest in front of it at grazing incidence -- a high-Fresnel mirror of the bright marine haze low over the sea: thin
  //  silver lines along the ripple crests (the boat photos' crinkle highlights). bnt is smooth in the facet angle (smooth max,
  //  width kS), so the lines have soft edges and graded brightness (not r8f's flat plates); over a reflected land mass it is
  //  mostly the land (tW) the crest mirrors. Peaks where the bend starts (4 bnt (1 - bnt): lines, not the whole bent area -- the
  //  far band stays as it was) and only near (footprints < ~10 cm). URL fa1 (strength .6) / fa2 (land share .6).
  //  v2 water L>60 0 -> 5 % (photo 6.4), p90 36 -> 52 (53), hf sd 2.7 -> 4.8 (4.2); v3 / v4 near water a little brighter
  { float cs=uFXa.y*uWK4.y*4.*bnt*(1.-bnt)*(1.-smoothstep(.04,.15,pixG))*(1.-uFXa.z*tW)*(1.-uWK.y*.8*chzN);   // (r10w: x(1 - .8 wk1 chz): no silver lines on the bubbly churn)
    refl=mix(refl,skyRefl(normalize(vec3(R.x,.03,R.z)),rough),cs); F=mix(F,max(F,.5),cs); }
  if(uDbgM==90) return vec3(tW*F,dnD*F,bnt*.15+float(R.y<0.)*.15)*2.;   // (r9w debug, r9m: 70 -> 90) terrain share, next-wave share, bent / down-facing facets
  vec3 GLW=vec3(.9,.97,1.1)*mix(vec3(1.),vec3(.7,.95,1.14),aGl);   // (r9w: aerial tint .8,.95,1.08 -> .7,.95,1.14: the photo's specks are cyan) (r7w) glints white-silver, not warm (SUN is 1,.94,.84); (r8w) aerial sparkle cyan-white like the photos
  // (r8f) aerial wave relief: seen from the air the open sea is no flat navy -- the crests of the wind sea (compressed, J<1:
  //  short waves bunched up and breaking, bubbles, light through the thin crests) form a network of faint lighter cyan veins,
  //  the broad troughs between them are a little darker, and the swell modulates both in broad bands. Driven by the filtered
  //  FFT Jacobians / swell height (they move with the waves; band-limited by the footprint, so nothing crawls). Tuned offline
  //  on the r8m v1 render with the wave signals read back (agent_out/fx/seasim.mjs): v1 sea L* block sd 16 / 64 px
  //  0.9 / 0.7 -> ~2.3 / 1.1 (photo 1.8 / 1.3). Aerial, steep and deep water only (not the cove shallows or the boat views).
  float aRel=aGl*smoothstep(.3,.6,-rd.y)*smoothstep(6.,20.,depth0);
  float crS=clamp(2.*(1.-J1)+.5*(1.-J2),-1.,1.), crT=clamp(3.*(.7-J1),0.,1.), swM=max(1.+.3*d0.y,0.);
  const vec3 CRT=vec3(.5,1.,1.2);
  // (r9w) ... the swell alone gives only regular broad bands (a stronger swell term drew stripes). The real open sea from the
  //  air is patchy at 40-200 m: wave groups and gusts (rougher, more crests and foam) alternate with calmer slicks, drawn out
  //  along the wind. An irregular (domain-warped, non-repeating) group field gm modulates the crest veins (x .5 .. 1.5) and
  //  the tone (+-3 %); it drifts slowly and is 40x the pixel footprint, so it cannot alias.
  vec3 rel=mix(vec3(1.),(1.+(.16*max(crS,0.)+.21*crT)*swM*(.5+gm)*CRT+.1*min(crS,0.))*(.973+.12*d0.y)*(.94+.12*gm),aRel);   // (r8f: swell bands .1 -> .12: v1 64 px block sd .88 vs photo 1.32)
  // (r9w) foam-streak threads: the remnant foam of old whitecaps is gathered by the surface convergence into a web of thin,
  //  broken cyan lines (~25-50 m loops: the photos' "veins"). Zero isolines of a warped noise, each line ~.5 m wide and
  //  convolved with the pixel footprint (sub-pixel lines light a pixel by their area share: faint, stable in motion).
  if(aRel>.001){ vec2 tq=p*.021+vec2(fbm(p*.0042+3.3,2),fbm(p*.0042+9.1,2))*1.4+vec2(vnoise(p*.11+2.1),vnoise(p*.11+6.3))*.07+vec2(uTime*.0012,uTime*.0007);   // (+ ~9 m crinkle: no smooth worm-like curves)
    vec3 tn=fbmd(tq,3), tn2=fbmd(tq*1.37+vec2(5.3,2.9),3); float tw=.25;
    float tds=min(abs(tn.x)/(length(tn.yz)*.021+1e-5),abs(tn2.x)/(length(tn2.yz)*.0288+1e-5)*1.15);   // two isoline sets: a branching web, not closed loops
    float tcov=2.*tw/(2.*tw+pixL)*(1.-smoothstep(tw*.5,tw+pixL*.6,tds))*smoothstep(-.15,.35,fbm(p*.03+vec2(7.7,uTime*.002),2))*smoothstep(-.25,.35,vnoise(p*.22+vec2(3.7,uTime*.01)))*(.35+.65*gm);   // (broken into ~5 m beads and dashes)
    rel*=mix(vec3(1.),1.+tcov*1.3*CRT,aRel); }
  if(uDbgM==121) return vec3(dot(tcH,vec3(.2126,.7152,.0722))*10.,visH*.3,dot(refl,vec3(.2126,.7152,.0722))*3.);   // (r13w debug) reflected terrain luminance, horizon visibility, final reflection luminance
  vec3 col=(body*(1.-F)+refl*F)*rel+SUN*GLW*spec*NdL*sunSh;
  // (r9m) seen level over a bright shallow bed (v4: 1-2 m of water over sand) the bed light reads pool-teal (C 23.7 vs photo 19.1):
  //  the bed's share of the water colour loses uSL.w of its chroma. From the air (lv = 0: the cove aqua), over the dark reef
  //  flat (v3) and over deep water (v2) the bed share is ~0: unchanged.
  { float lv=1.-smoothstep(.25,.45,-rd.y), bs=clamp(dot(bedA*Tb*Ebed,vec3(.2126,.7152,.0722))*.45/max(dot(body,vec3(.2126,.7152,.0722)),1e-5),0.,1.);
    col=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,1.-uSL.w*lv*bs*(1.-F)); }
  // swash film a few cm thick over the sand: broken by sand grains / ripples, it reads as glossy wet sand (tan, darker
  // than dry sand) with a softened sky sheen -- not a grey mirror
  float film=smoothstep(.05,.4,vb0.b)*smoothstep(.3,.02,depth);
  if(film>0.){
    vec3 wetA=mix(vec3(.34,.30,.25),vec3(.33,.27,.20),uWK6.w)*(.9+.2*vnoise(p*.7));   // (r11w, wk23: warmer, a little darker -- photo wet sand 205-216,192-198,173-187; r10f strip 220,215,210)   // (r5 merge, sand specialist's note: was (.36,.29,.215), orange next to the now neutral beige wet sand)
    vec3 wetC=wetA*(SUN*max(uSun.y,0.)*sunSh*.9+skyIrr(vec3(0,1,0))*mix(1.1,.75,uWK6.w))*mix(1.,.6,smoothstep(.02,.25,depth));   // deeper film: darker
    // (r11w, URL wk23) a few-cm sheet over sand, broken by grains, ripples and bubbles: from a low camera it reads as glossy tan wet
    //  sand with a soft sheen (the v4 photo), not a pale grey mirror strip whose straight top edge drew a seam along the beach
    float fR=mix(1.,smoothstep(.004,.06,depth),uWK6.w);   // (the thinnest sheet at the run-up limit is only wet sand: its colour meets the beach's own, no edge for the post sharpening to ring)
    col=mix(col,wetC*(1.-F*fR*mix(.5,.25,uWK6.w))+refl*F*fR*mix(.8,.3,uWK6.w)+SUN*GLW*spec*NdL*sunSh*.5*fR,film*mix(.9,.97,uWK6.w));   // (wk23: the sheet's mirror x.3 -- grains, ripples and bubbles break it; at grazing a smooth film mirrored the pale low sky at F ~.75)
  }
  // debug views: 21 body, 22 reflection, 23 glitter, 24 roughness, 25 foam/residual/density, 29 depth, 31 foam sources
  if(uDbgM==50) return vec3(dot(SUN*GLW*spec*NdL*sunSh,vec3(.2126,.7152,.0722)),dot(refl*F,vec3(.2126,.7152,.0722)),dot(body*(1.-F),vec3(.2126,.7152,.0722)))*4.;   // debug (r8w): glint, reflection, body luminance
  if(uDbgM==21) return body*(1.-F); if(uDbgM==22) return refl*F; if(uDbgM==23) return SUN*GLW*spec*NdL*sunSh+vec3(0,0,.0001); if(uDbgM==24) return vec3(rough);
  // ---- foam
  // pattern frame: a FIXED global frame (a spatially varying rotation of world coordinates shears the pattern
  // into streaks); along the main shoreline = crests / long-shore drift, inland = cross-shore
  vec2 fdir=vec2(-sdir.y,sdir.x);
  // folding crests, from a blurred Jacobian (rounder, softer patches than the raw fold lines)
  vec2 gb=max(gx,gx*(.35/max(length(gx),1e-4)))*1., gb2=max(gy,gy*(.35/max(length(gy),1e-4)));
  float J2b=textureGrad(uOD2,pl/uOL.z,gb/uOL.z,gb2/uOL.z).w*bw.y+textureGrad(uOD2,pl*OB_SC/uOL.z+OB_OFF.yx,gb*OB_SC/uOL.z,gb2*OB_SC/uOL.z).w*bw.x+(1.-bw.x-bw.y);
  float J=(J1+J2b*.6)/1.6;
  // whitecaps: folding short waves near the camera + statistical breaking crests everywhere (wind gusts / groups)
  // breaking comes in groups: patches of active whitecapping (gusts, wave groups), calm stretches between
  float wact=smoothstep(.62,1.05,gust+.25*fbm(p*.004+7.,2))*smoothstep(-.35,.3,fbm(p*.0028+vec2(uTime*.003,1.3),2))*g*smoothstep(8.,20.,depth0)*(1.-smoothstep(215.,135.,length((p-vec2(290.,690.))*vec2(1.,1.12)))*uWK10.x);   // (r12w: no whitecaps in the sheltered cove -- white chips from the air)
  vec2 wcs=whitecaps(p,pixG,wact,pixL);
  // (r8w) aerial footprints: whitecaps are composited directly by their filtered area cover (below), not through foamTex,
  // whose lace threshold gave every fleck a crisp cut-out edge
  float wcA=smoothstep(.3,.8,pixG), wcC=gWcC*wcA;
  wcs.x=max(wcs.x*(1.-wcA)*mix(1.,uWK.z,aGl),smoothstep(.0,-.4,J)*.35*wact);   // (r10w: x uWK.z from the air)
  wcs.x*=mix(.6,1.,smoothstep(.1,.3,-rd.y));   // (r5w: low grazing views: whitecaps thinner -- no flat white paper dashes in the mid distance)
  float shelf=smoothstep(.06,.16,depth0/max(w,2.));
  float head=smoothstep(.2,.6,expo)*smoothstep(300.,30.,w)*shelf;
  float churn=.6+.6*fbm(p*.018-uTime*.025,4);
  // distance used for surf bands and arcs: meanders (+-7 m) so they are never parallel copies of the coastline
  // (r10w) fW: the pixel's extent along the shore distance (true footprint). At the v2 / v3 horizon one pixel row spans
  //  30-130 m of water, and every narrow surf band (collar, bore rings, the noise in them) was point-sampled: some rows hit
  //  the white band, the next did not -- horizontal stair-stepped dashes that would crawl in motion. The bands are averaged
  //  over fW (exp profiles exactly, rings as Gaussians, steps widened) and noise finer than fW fades to its mean. URL wk12.
  float wq=w+(7.*fbm(p*.018+vec2(3.1,1.7),2)*smoothstep(0.,15.,w)+2.5*vnoise(p*.07+1.3)*smoothstep(0.,6.,w)*fWn);
  // rock contact: a dense white collar right at the rock face (wider at exposed points)
  // (on beaches: the inner surf zone, ~15 m of churning bores between the last breakers and the swash)
  float bzW=smoothstep(.05,.4,vb0.b);
  float collar=expAvg(wq,4.+7.*head+1.5*smoothstep(3.,.5,depth0),fW)*(.85+.35*vnoise(p*.09+uTime*.3)*fWn);
  // ... and right where the water actually meets the rock (the traced coast and the terrain's waterline differ
  // by metres: shallow water along rocky shores is the contact zone)
  // estimate: horizontal distance to the terrain's own waterline = depth / bed slope
  const float eS=3.; float bsl=length(vec2(H(p+vec2(eS,0))-H(p-vec2(eS,0)),H(p+vec2(0,eS))-H(p-vec2(0,eS))))/(2.*eS);
  float wT=min(w,depth0/max(bsl,.04));
  // + the horizon occlusion of the terrain: water hemmed in by a cliff (where the coast field can be metres off)
  // + rock actually above water within a few metres (8 directions, 3 and 7 m): the terrain's own waterline
  float lnd=0.;
  if(w<40.&&bzW<.9) for(int i=uZero;i<8;i++){ float an=float(i)*.785+.39; vec2 dq=vec2(cos(an),sin(an)); lnd=max(lnd,max(smoothstep(-.2,.6,H(p+dq*3.)),.75*smoothstep(-.2,.6,H(p+dq*7.)))); }
  lnd*=smoothstep(.9,.72,bzW)*min(1.,10./max(fW,1e-3));   // (r10w: x its share of a long footprint)   // (r5: fades out before the loop is skipped -- the cut-off drew a hard seam in the beach foam)
  collar=max(collar,max(max(expAvg(wT,2.5+4.*head,fW),smoothstep(.74,.5,at.x)*.95),lnd*1.05)*(1.-bzW)*smoothstep(40.+.5*fW,10.-.5*fW,w)*(.9+.3*vnoise(p*.11+uTime*.3)*fWn));
  float contact=max(collar,bzW*max(smoothstep(1.1+.5*vnoise(p*.03+2.),.25,depth0)*.55+.75*smoothstep(.6+.3*vnoise(p*.05+7.),.08,depth0),   // (r4f: + the r3 band by shore distance: the bright white strip at the waterline)
      smoothstep(7.5+3.5*vnoise(p*.03+2.)+.5*fW,1.5-.5*fW,w)*.5+.7*smoothstep(4.5+2.*vnoise(p*.05+7.)+.5*fW,.8-.5*fW,w))*(.8+.35*vnoise(p*.06+uTime*.2)))*(1.-sheet*mix(.75,.97,uWK6.w));   // (r11w, wk23: the sheet over the sand is not veiled by the waterline band -- that ~40 % foam veil was the pale grey strip with a straight top edge in v4)   // (r8w: 11/7 m -> 9/5.5 m: from the air a flat white band hid the aqua shallows along the sand)
  // rock surge: every wave that hits an exposed rock face bursts into whitewater that spreads back out as a bore:
  // an arc of fresh foam following the shore that slows down, thins and decays into lace -> concentric foam arcs,
  // broken where that wave hit weakly; behind each arc the water is littered with the lace it left
  float lamS=34.+8.*vnoise(p*.004), Tw=lamS/4.2;
  float phS=4.2*uTime/lamS+.35*fbm(p*.006+3.,3)+.12*vnoise(p*.03)+.43;
  float sS0=fract(phS), idS=floor(phS);
  float surge=0., sAge=1.;
  float Rm=16.+42.*head;
  for(int k=uZero;k<4;k++){
    float tau=(sS0+float(k))*Tw;                                   // seconds since impact k
    float r=Rm*(1.-exp(-tau/9.));                                  // bore radius (decelerating)
    float hit=smoothstep(-.05,.5,vnoise(p*.02+(idS-float(k))*vec2(3.7,1.9))+.3*head-.12*float(k));   // every wave hits differently: arcs break off
    float aw=.9+.09*r, aw2=sqrt(aw*aw+fW*fW/6.);
    float ring=aw/aw2*exp(-pow((wq-r)/aw2,2.));                   // (r10w: convolved with the footprint fW)
    // behind the bore: a fresh burst of whitewater right after the impact, then the lace it leaves
    float lace=smoothstep(r+aw+.5*fW,r-6.-.5*fW,wq)*(.3*exp(-tau/8.)+1.3*exp(-tau/2.5)*smoothstep(.3,.8,head))*(1.-.7*uWK5.y);   // (r11w: x(1 - .7 wk17): the bore rings stand out as arcs over dark water)
    float d=hit*smoothstep(0.,.3,head)*(ring*1.55*exp(-tau/18.)*(1.+.4*uWK5.y)+lace)*(1.-bzW0);   // (rock bores only: none in front of the beach)
    if(d>surge){ surge=d; sAge=mix(clamp(tau/26.,0.,1.),.85,lace/max(d,1e-3)); }
  }
  // persistent churning white water right at exposed rocks (backwash, reflected waves)
  float crash=smoothstep(.0,.4,head)*(expAvg(wq,3.+9.*head,fW)*1.5+.3*(1.-.65*uWK5.y)*expAvg(wq,12.+20.*head,fW))*churn*(1.-bzW0);
  // (r11w) rock collar core: the photos' solid, brilliant white collar hugging every exposed rock (v1 / v9: ~10-20 m of opaque
  //  whitewater at the rock face, then lace arcs over dark water). The traced coast (w) sits metres off the real waterline, so the
  //  core keys on the terrain's own waterline estimates (wT: depth / bed slope, lnd: rock above water within 3-7 m). URL wk16.
  // (r12w, URL wk34) collar width by wave exposure: thin lace collars along sheltered / straight cliff stretches, broad ringed collars at
  //  exposed points (headland tips, stacks: the v1 photo's stack). Exposure = head (fetch x steep shelf) and the convexity of the coast
  //  (Laplacian of the coast distance over ~9 m: ~1/(R + w) round a tip of radius R, 0 along a straight coast, < 0 in bays).
  float lapW=0.; { const float ceL=9.; lapW=-(coastRaw(p+vec2(ceL,0))+coastRaw(p-vec2(ceL,0))+coastRaw(p+vec2(0,ceL))+coastRaw(p-vec2(0,ceL))-4.*coastRaw(p))/(ceL*ceL); }
  float tipX=smoothstep(.006,.035,lapW);
  float hx=clamp(.55*head+.6*tipX*smoothstep(.2,.5,expo),0.,1.), hxW=uWK9.z*hx;
  float rkZ=(1.-bzW)*smoothstep(40.+30.*hxW+.5*fW,10.+8.*hxW-.5*fW,w);
  // (r12w, URL wk35) ragged outer edge: the distance into the band is stretched / shrunk by noise in proportion to itself (none at the rock)
  float cDr=min(wq,wT)*max(1.+.6*uWK9.w*(.55*vnoise(p*.075+vec2(1.3,uTime*.03))+.3*vnoise(p*.21+5.1)*fWn),.3);
  float cW1=mix(mix(3.+7.*head,2.+10.*head*head,uWK7.z)*uWK7.y,1.8+20.*hx*hx,uWK9.z);
  float coreC=uWK5.x*rkZ*max(expAvg(mix(min(wq,wT),cDr,uWK9.w),cW1,fW),lnd*mix(1.,.4+.6*head,uWK7.z))*mix(.85+.3*vnoise(p*.06+vec2(uTime*.15,2.))*fWn,.6+.7*smoothstep(-.35,.35,fbm(p*.045+vec2(uTime*.04,1.3),2)),smoothstep(1.,1.4,uWK7.y));   // (core width x uWK7.y, URL wk25; wider cores bulge out in ~20 m billows)
  // (r11 fix, URL wk28) the collar core was one flat white paint band with a hard outer edge (v9 white share 6.8 % vs photo 4.2 %): it
  //  stays solid only within ~1/3 of its width of the rock (and where rock stands within a few metres); outward it breaks into ragged
  //  holes (~4-15 m) that open more and more toward the outer edge -- the lace and the turquoise water show through
  if(uWK8.x>0.){ float cW=cW1, cD=mix(min(wq,wT),cDr,uWK9.w);
    float rr=clamp(cD/max(cW,1.),0.,2.);
    // (holes laid out along the shore distance: broken concentric arcs round the rock, the photos' ringed collars; uWK8.w (URL wk31)
    //  keeps more of the band's width: fewer holes far out, more near the rock)
    vec2 cq=vec2(cD*.13,0.)+p*.035+vec2(fbm(p*.017+5.7,2),fbm(p*.017+1.9,2))*.7;
    float bn=fbm(cq+vec2(uTime*.02,4.1),2)+.4*vnoise(p*.21+vec2(2.3,uTime*.05))*clamp(1.6-pixL*.45,0.,1.);
    float brk=max(smoothstep(-.22,.22,bn+.5-.12*uWK8.w-mix(.6,.3,uWK8.w)*rr),lnd*.55);
    coreC*=mix(1.,brk,uWK8.x);
    // (r12w, wk35) concentric turquoise streaks through the outer two thirds of the band (the photos' ringed collars)
    coreC*=mix(1.,.4+.6*smoothstep(.04,.26,abs(fbm(vec2(cD*.19,0.)+p*.028+vec2(uTime*.015,7.),2))),uWK9.w*smoothstep(.25,.6,rr)*clamp(1.6-pixL*.3,0.,1.)); }
  if(uDbgM==86) return vec3(hx,coreC*.5,tipX)*.5;   // (r12w debug) collar exposure, core density, coast convexity
  if(uDbgM==31) return vec3(contact,max(surge,crash),sh.z)*.4;            // debug: foam sources
  if(uDbgM==32) return vec3(w<5.?1.:0.,w<15.?1.:0.,w<40.?1.:0.)*.3;
  if(uDbgM==89) return vec3(smoothstep(215.,135.,length((p-vec2(290.,690.))*vec2(1.,1.12)))*(1.-bzW),gShBrk,sh.z*.5)*.5;   // (r11w debug) cove weight, breaking, shoal foam
  if(uDbgM==88) return vec3(smoothstep(.05,.4,vb0.b)*smoothstep(.3,.02,depth),sheet,clamp(depth*10.,0.,1.))*.5;   // (r11w debug) film, swash sheet, depth x10

  // dominant source and its age (0 fresh whitewater .. 1 old lace / film)
  float dens=0., aw=0., ag=0.;
  #define DK(b) (((int(uWK7.w)>>b)&1)==1?0.:1.)   // (r11w debug) URL wk27 = bit mask of foam sources to drop (0 = all on)
  #define FSRC(d_,a_) { float fsD=(d_); dens=max(dens,fsD); float fsE=fsD*fsD*fsD+1e-6; aw+=fsE; ag+=fsE*(a_); }
  FSRC(DK(0)*contact*1.6,.08)
  FSRC(DK(1)*coreC*2.2,.02)   // (r11w)
  FSRC(DK(2)*surge,sAge)
  FSRC(DK(3)*crash,.2)
  // (r5) in the sheltered cove the small waves spill over the reef heads in short lines of lace, not opaque slabs
  float covD=smoothstep(215.,135.,length((p-vec2(290.,690.))*vec2(1.,1.12)))*(1.-bzW);
  // (r9w) cove: a narrower white front and a thin lace trail behind it, not a flat blob
  // (r11w, wk19) cove: each breaker is a crisp white crest line (~2-3 m) with a faint trail -- the photos' parallel lines -- instead of a
  //  lacy ~8 m front that read as blobs from the air; far (footprint > ~1/6 of the spacing) the line goes to its period mean
  float cvL=gShBrk*(1.75*exp(-pow((gShS-.055)/.03,2.))+.14*exp(-gShS*3.)); cvL=mix(cvL,gShBrk*.14,smoothstep(.15,.6,fW/38.));
  float cvF=mix(1.,smoothstep(75.,45.,w),covD*uWK5.w);   // (r11w, wk19) cove: crest lines within ~45-75 m of the shore only
  // (r12w, URL wk36) cove: the photos' two or three continuous breaking-wave arcs across the cove (white bands ~5 m wide with a lace trail,
  //  following the shore round the cove) instead of short crest pieces over the shallow patches (the isolated white chips). They key on
  //  the wave phase and the distance from the shore (outer limit ~wk37 m, ragged), not on the local depth; a few gaps per arc.
  //  Footprint-filtered: the line is convolved with the pixel's extent along the shore distance (fW, area kept), and in the far band of
  //  the boat views its mean is damped (thin lines seen edge-on, not a milky veil).
  float cvN=0., cvNs=1.;
  float dC=length((p-vec2(332.,862.))*vec2(1.,1.08))-88.+3.*vnoise(p*.05+2.2);   // distance from the beach along the cove (see below)
  float kN=smoothstep(215.,135.,length((p-vec2(290.,690.))*vec2(1.,1.12)))*(1.-sheet)*smoothstep(12.,30.,dC)*uWK10.x;   // cove weight of the arcs (beach zone included)
  if(kN>.001){
    float lamC=34.+8.*vnoise(p*.004);
    // distance from the beach along the cove: circles round a point behind the beach (0 at the waterline of the beach centre) --
    //  the waves refract into the cove and wrap round the beach as concentric arcs; near the side cliffs the arcs run into the collars
    float phC=(dC+4.2*uTime)/lamC+.25*fbm(p*.006+3.,3)+.06*vnoise(p*.03);
    float sC=fract(phC), idC=floor(phC); cvNs=sC;
    float reach=uWK10.y+18.*fbm(p*.012+vec2(idC*.71,3.3),2);
    float cvB=smoothstep(reach,reach-28.,dC)*smoothstep(7.,16.,w)*smoothstep(8.,22.,dC);
    float alA=(.55+.45*smoothstep(-.62,-.18,vnoise(p*.016+idC*vec2(5.1,2.7))))*mix(.4,1.,step(.5,abs(mod(idC,3.)-2.)));   // (two waves in three break strongly, the third faintly: two or three clear arcs)
    float fph=fW/lamC, sg=.075, sgE=sqrt(sg*sg+fph*fph/12.);
    float dl=sC-.075; dl-=floor(dl+.5);
    float line=1.7*sg/sgE*exp(-dl*dl/(2.*sgE*sgE));
    float tr=mix(.35*smoothstep(.0,.05,sC)*exp(-sC*4.),.35*(1.-exp(-4.))/4.,smoothstep(.1,.5,fph));
    // (r12 fix, URL rg0) the arcs read as thin pen strokes: a broader band of lace behind each line (~.75 over ~14 m), broken into ~6 m
    //  lace cells close up (their mean once unresolved)
    { float tA=mix(.35,.75,uRG.x), tK=mix(4.,2.4,uRG.x), lc=mix(1.,.45+.9*smoothstep(-.3,.4,vnoise(p*.17+idC*vec2(2.3,.7))),clamp(1.5-fW*.3,0.,1.)*uRG.x);
      tr=mix(tA*smoothstep(.0,.05,sC)*exp(-sC*tK),tA*(1.-exp(-tK))/tK,smoothstep(.1,.5,fph))*lc; }
    // (r12 merge) the arcs read as drawn, even white lines (v9 / v1: concentric rings round the beach): each wave's line breaks up
    //  along its length into ~14 m bright sections and gaps, with ~5 m lace inside close up (faded out by ~4 m footprints)
    { float bk1=.3+.7*smoothstep(-.5,.3,vnoise(p*.07+idC*vec2(3.7,1.9))), bk2=mix(1.,.65+.6*smoothstep(-.6,.6,vnoise(p*.21+idC*vec2(1.3,4.1))),clamp(1.5-fW*.35,0.,1.));
      line*=mix(1.,1.15*bk1*bk2,uWK10.x); tr*=mix(1.,.4+.6*bk1,uWK10.x); }
    float cvLT=line+tr;
    // (r13w, URL wk42) the arcs still read as thin pen strokes; the photos show broad bands of lacy whitewater: each breaking wave leaves
    //  a dense, fresh band ~5-8 m deep behind a ragged front, thinning into lace over ~15 m, broken along the crest into ~30-60 m
    //  sections with clear aqua gaps. Front jittered along the crest (~10 m / ~3 m), sections per wave; far (fph): the period mean.
    if(uWK11.z>0.){
      float jf=.04*vnoise(p*.085+vec2(idC*1.7,uTime*.04))+.018*vnoise(p*.29+vec2(3.3,idC));
      float sJ=fract(sC-.02+jf);
      float bSec=smoothstep(-.5,.15,vnoise(p*.024+idC*vec2(3.7,1.9)))*(.7+.3*smoothstep(-.4,.5,vnoise(p*.075+idC*vec2(1.1,2.3))));
      float bd=smoothstep(0.,.03,sJ)*(1.3*exp(-pow(sJ/.34,2.))+.4*exp(-sJ*2.5))*bSec;
      // (r13 fix, URL wk47) from the air (v9) the two arcs still read as painted-on curved strokes; r9 / ref.png show the whitewater off
      //  the beach as short irregular patches: ~25 m sections fade in and out along each band and ~9 m lace cells break its body up
      //  close up (their mean once the footprint exceeds ~4 m)
      if(uWK12.w>0.){ float lz=mix(1.,.3+.9*smoothstep(-.45,.45,vnoise(p*.11+idC*vec2(2.9,1.3))),clamp(1.6-fW*.3,0.,1.));
        bd*=mix(1.,lz*(.45+.55*smoothstep(-.25,.35,vnoise(p*.04+idC*vec2(1.3,3.1)))),uWK12.w); }
      bd=mix(bd,.55*.62,smoothstep(.1,.5,fph));
      cvLT=mix(cvLT,bd,uWK11.z); cvNs=mix(cvNs,.06+.22*sJ,uWK11.z);
    }
    cvN=cvB*alA*cvLT*(1.-.65*uWK10.w*smoothstep(.15,.6,fph)*(1.-aerA));
  }
  { float cvO=cvF*mix(sh.z*1.45*mix(1.,.95*exp(-gShS*11.)+.2*exp(-gShS*2.2),covD),cvL,covD*uWK5.w), cvAg=max(smoothstep(.03,.5+.4*smoothstep(4.,1.8,depth0),gShS),.45*covD);
    FSRC(DK(4)*mix(cvO,cvN,kN),mix(cvAg,smoothstep(.06,.3,cvNs),kN)) }   // (r12w: the cove arcs replace the cove crest pieces)
  // beach: the broken waves run on as spilling bores over the inner surf zone (depth ~.4-1.8 m): a dense white roller
  // right behind each crest, thinning into a trail of lace -- rows of whitewater parallel to the beach, clear water between
  { float bs=gShS, bAm=smoothstep(2.1,1.3,depth0)*smoothstep(.15,.45,depth0)*bzW*(.75+.45*vnoise(p*.05+vec2(floor(uTime*4.2/38.),0.)));
    FSRC(DK(5)*bAm*(smoothstep(0.,.05,bs)*exp(-bs*7.)*1.7+.35*smoothstep(0.,.05,bs)*exp(-bs*2.2)),smoothstep(.0,.35,bs)) }
  FSRC(DK(6)*sh.w*1.3*cvF*(1.-kN),.03)   // (r12w: no lip pieces in the cove)                                           // the lip of the breaking crest
  FSRC(DK(7)*wcs.x,wcs.y)
  float fresh=dens;
  // (r12w, URL wk39) far band of the boat views: the flat residual lace of the surf zone averaged over a 20-80 m footprint drew a pale
  //  milky veil over the water in front of the shore (v2 / v3); seen at grazing incidence that lace is thin and mostly edge-on
  float fvD=1.-.6*uWK10.w*(1.-aerA)*smoothstep(8.,30.,fW);
  // residual foam: the surf zone is littered with lace left behind by earlier breakers (persists for minutes)
  // (and wherever waves break -- reef flats, bars: churned, bubbly water full of lace between the breakers)
  // (shallow rock / reef flats away from beaches: every wave washes over them -- churned water, foam everywhere)
  float surfz=max(smoothstep(4.5,1.,depth0)*smoothstep(90.,30.,w),gShB*.22)*smoothstep(-1.,5.,w);
  // shallow rock / reef flats away from beaches: every wave washes over them -- churning, fairly fresh whitewater
  float rflat=smoothstep(3.6,1.4,depth0)*(1.-bzW)*smoothstep(.3,.55,expo)*smoothstep(-1.,5.,w);
  float rkX=1.-.7*uWK5.y*(1.-bzW)*(1.-rfW0)*(1.-chzN);
  float rfAir=1.-rfW0*aerA*uWK5.w*(1.-smoothstep(35.,8.,w));   // (r11w, wk19) the detached reef flat seen from the air: no lace field floating in the cove   // (r11w) less broad fill over the exposed rock shelves: arcs, not a grey blanket
  FSRC(DK(8)*rflat*(.18+.55*churn*churn)*rkX*rfAir*fvD*(1.-.85*kN),.5)   // (r12w: no churn pieces over the cove mounds)
  // (r5) the reef flat off the headland: every wave of a set breaks over it -- a churning field of aerated whitewater
  // (fresh right behind each bore, lace with blue holes further back)
  float rfW=rfW0*(.45+.55*smoothstep(-.35,.25,fbm(p*.045+vec2(9.,uTime*.01),2)))*mix(1.,smoothstep(35.,8.,w),aerA*uWK5.w);   // (r11w, wk19) from the air only the part within ~15-50 m of the rock: the modelled reef flat lies off the r10 headland, its field read as a white swirl floating in the cove (v9)   // (ragged, patchy outline: no white oval from the air)
  // (r12 fix, URL rg1) the bore's front was a step (phase 1 -> 0 at the crest: full white right behind it, none ahead): seen from the boat
  //  (v3) a hard, straight white edge across the water like a plane seam. The front now ramps in over ~4 % of the wavelength and wanders
  //  +-~5 % along the crest (ragged leading edge); exp(-9 x 1) ahead of it is ~0, so the wrap of the shifted phase is invisible
  // (r13w, URL wk46) the outer half of the reef flat: the bore field breaks into ~15-30 m patches with clear water between (seen from the boat
  //  its far part closed into one white slab with a straight top edge, v3)
  rfW*=mix(1.,smoothstep(-.3,.2,fbm(p*.05+vec2(2.3,uTime*.012),2)+.3*vnoise(p*.14+vec2(6.1,uTime*.03))),uWK12.z*smoothstep(.45,.85,length((p-vec2(172.,626.))/vec2(62.,42.))));
  float gSb=mix(gShS,fract(gShS+.05*vnoise(p*.07+vec2(3.1,uTime*.05))+.02*vnoise(p*.23+1.7)),uRG.y), bRm=mix(1.,smoothstep(0.,.045,gSb),uRG.y);
  // (r13w, URL wk46) ... the inner reef flat too (v3: the slab at 30-60 m is the bore behind a front ~30 m out; +-2 m of wander is ~4 rows
  //  there, so it still read as one straight seam): the front wanders +-~6 m along the crest (~20 m / ~6 m) and the bores break into
  //  sections with clear gaps; the steady churn between them is unchanged
  float bSc=1.;
  if(uWK12.z>0.){ gSb=fract(gSb+uWK12.z*(.11*vnoise(p*.05+vec2(7.3,uTime*.03))+.045*vnoise(p*.16+vec2(uTime*.06,2.9))));
    bRm=mix(1.,smoothstep(0.,.045,gSb),max(uRG.y,uWK12.z)); bSc=mix(1.,.3+.7*smoothstep(-.55,.15,vnoise(p*.045+vec2(1.3,uTime*.025))),uWK12.z); }
  FSRC(DK(9)*rfW*(1.3*mix(exp(-gSb*4.),exp(-gSb*9.)+.22*exp(-gSb*2.5),uWK10.w)*bRm*bSc*(.7+.6*churn)+(.26+.34*churn*churn)*(1.+uFXa.w)),.08+.62*smoothstep(0.,.7,gShS))   // (r9f: the steady part x(1 + uFXa.w), URL fa3 .6: v3 foreground L>60 25 -> 40 % (photo 42.5), without the r5 grey blanket -- the bores are unchanged) (r5 merge: the r5w denser / fresher field (.48+.5 churn^2, age .05+.5) turned v3 into a grey camouflage foam blanket (68.3 vs 73.3): back to the r5 predecessor level)
  fresh=max(fresh,rfW*1.35*mix(exp(-gSb*4.),exp(-gSb*9.)+.22*exp(-gSb*2.5),uWK10.w)*bRm*bSc);   // (r12w, wk39: front face + crest dense, a thin trail behind)   // (aerated: the water right behind each bore is a milky turquoise bubble cloud)
  // (on beaches the lace is concentrated in the inner surf zone, ~30 m wide; patches further out)
  FSRC(DK(10)*fvD*surfz*(.22+.62*churn*churn)*(1.+bzW)*mix(1.,.35+.65*smoothstep(50.,20.,w),bzW)*(1.-mix(.45,.85,uWK5.w)*covD)*mix(1.,rkX,1.-covD)*rfAir,.8)   // (r11w: cove x(1 - .85 covD) at wk19: clear aqua between the crest lines)   // (r8w: x(1-.45 covD): from the air the residual lace drew flat white blobs across the sheltered cove; the photos keep clear aqua between the breakers)
  // swash foam: a lacy bore front at the run-up limit during the up-rush, thinning streaks in the back-wash
  float front=max(sw.y-bed,0.), upr=1.-smoothstep(.3,.6,sw.z);
  // the swash film itself carries little foam (glossy wet sand shows through), only the bore front and its streaks
  dens*=1.-film*mix(.7,.96,uWK6.w);   // (r11w, wk23: the residual surf-zone lace (surfz) veiled the whole sheet: the pale grey strip with a straight top edge along the v4 beach)
  FSRC(DK(11)*(exp(-front/.03)*(.5+.65*upr)*mix(1.,.25+.75*smoothstep(-.25,.45,vnoise(p*vec2(.23,.19)+vec2(uTime*.3,1.7))),uWK6.w)+.4*upr*smoothstep(.0,.08,front)*exp(-front/.3))*sheet,.45)   // (r11w: the run-up front line broken into lobes at wk23)
  // (r12w, URL wk39) the surf line at the shore in the far band of the boat views: whitewater and spray stand up 1-3 m, so at grazing
  //  incidence they cover ~Hs / pix rows, while the flat band averaged over the 20-80 m footprint faded to a faint veil (no white line
  //  at the cliff foot in v2 / v3, unlike the photos). Only the row(s) whose footprint reaches the shore; solid white (coreF).
  float crtn=uWK10.w*(1.-aerA)*smoothstep(4.,14.,fW)*(1.-smoothstep(.5*fW+2.,.5*fW+9.,w))*clamp((.7+1.5*max(head,.35*bzW))/pix,0.,1.)*(.7+.4*vnoise(p*.045+vec2(uTime*.2,1.)));
  // (r13w, URL wk45) the line read as a flat, even white strip along the v2 cliff foot; the photo's surf is broken: bursts of whitewater and
  //  spray of varying height at the rocks with darker gaps (~20-60 m sections, a few metres of spray at the bursts)
  if(uWK12.y>0.){ float bS=smoothstep(-.45,.3,vnoise(p*.045+vec2(2.1,uTime*.06))), bH=.35+1.4*smoothstep(-.3,.7,vnoise(p*.11+vec2(uTime*.15,5.3)));
    crtn*=mix(1.,bS*clamp(bH*(.7+1.5*max(head,.35*bzW))/pix,0.,1.)/max(clamp((.7+1.5*max(head,.35*bzW))/pix,0.,1.),1e-3),uWK12.y); }
  FSRC(crtn*1.5,.04)
  float age=ag/aw;
  // floating foam gathers on the wave crests (convergence) and thins in the troughs: lines of foam along the crests
  // (the short waves, 1-8 m, and the surf bores: their crests carry the foam lines)
  float elev=h2*gust*g2*4.+sh.x*.6;
  dens*=mix(1.,mix(.6,1.25,smoothstep(-.3,.4,elev)),age*.6);
  // old foam is gathered by the currents into streaks / lines (convergence zones, ~6-15 m apart, along the flow),
  // with only thin threads between them
  float coreF=min(1.,crtn+smoothstep(.7+.6*uWK8.y,1.5+.6*uWK8.y,coreC*2.2)*mix(1.,max(smoothstep(2.6,.7,min(wq,wT)),lnd*.35),uWK9.w));   // (r12w, wk35) solid white only in the ~1-2.5 m strip at the rock: further out the band is dense lace with turquoise holes   // (r11 fix, URL wk29: solid only in the densest part; the rest is lace with holes)   // (r11w) collar core share (solid white in foamTex)
  { vec2 sq=vec2(dot(p,fdir)*.035,dot(p,sdir)*.11); sq+=vec2(fbm(p*.02+3.3,2),fbm(p*.02+8.1,2))*1.2;
    float ln=1.-abs(fbm(sq,3))*2.6; ln=clamp(ln,0.,1.);
    // (r11w) near exposed rocks the lace is gathered into arcs that follow the shore (the photos' concentric lace rings around
    //  the headlands and stacks), not into streaks along the one global frame (diagonal "hair" across the headland bands in v9):
    //  isolines of a noise whose gradient is mostly across the shore distance. URL wk18.
    float arcW=uWK5.z*(1.-bzW)*(1.-covD)*smoothstep(85.,35.,w)*(1.-chzN);
    if(arcW>.001){ vec2 aq=vec2(wq*.075,0.)+p*.011+vec2(fbm(p*.019+5.7,2),fbm(p*.019+1.9,2))*.4;
      float lnR=clamp(1.-abs(fbm(aq,3))*4.,0.,1.); ln=mix(ln,lnR,arcW); }
    dens*=mix(1.,mix(.3,.1,arcW)+mix(1.15,1.4,arcW)*ln*ln,max(smoothstep(.45,.8,age),arcW*smoothstep(.12,.35,age)*(1.-coreF))*clamp(1.6-pixL*.25,0.,1.)*(1.-uWK3.y*chzN)); }
  // (r10w) churned rocky surf seen from a boat (chzN: chz within ~60 m of a low camera): every wave washes over the reef flat and
  //  the rock shelves, the water is a sheet of aerated whitewater with blue holes (v3 photo: 42 % white), not scattered lace
  //  gathered into lines: no convergence lines there (URL wk9) and the density x(1 + wk8)
  dens*=1.+uWK3.x*chzN;
  if(uDbgM==40||uDbgM==27){ dens=floor(fract(p.x/40.)*4.+1.)*.35; age=floor(fract(p.y/24.)*3.)*.5; fresh=0.; }   // debug: foam look matrix (D .35..1.4 across x, age 0/.5/1 along z)
  vec2 uvw=(p-uRect.xy)*uRect.w; dens*=smoothstep(0.,.03,min(min(uvw.x,uvw.y),min(1.-uvw.x,1.-uvw.y)));
  // aerated water under / around whitewater: milky turquoise glow of the bubble cloud
  float aer=max(smoothstep(.5,1.3,fresh)*.75*(1.-.6*age),gShB*smoothstep(12.,3.,depth0)*.18);
  // (r10w) bubble cloud of the churned rocky surf (see chz): a blue backscatter, densest under and around the foam (plumes
  //  below the whitewater), thinner in the open holes -- the photo's luminous blue holes in the lace. URL wk5.
  col+=(Esun*.8+Esky)*mix(vec3(.014,.044,.074),vec3(.014,.038,.077),uWK6.z)*.45*uWK2.y*chzN*(.35+.65*smoothstep(.1,1.,dens))*(1.-F);   // (r11w, URL wk22: less cyan)
  // (a bubbly, broken surface: diffuse, little mirror reflection)
  // (r8w) over rock / open water the bubble cloud reads blue (the water above it filters the light), turquoise only over a
  // sand floor; and from low angles it shows much less (surface reflection, oblique path): the boat views' near water was
  // a pale pool-turquoise (v3 h218 L48 vs photo h248 L41, v4 L55 vs 50) from this veil alone
  float sandy=max(shelt*(1.-rfS*(1.-rfK)),bzW0);   // (r11 fix, wk30) from the air the reef flat's sand channels count as sand (aqua, not the cyan-blue of rock)
  // (r8f) ... except from the air: the bubble cloud right under the foam is the brightest, shallowest water there and reads
  //  aqua over any floor (the blue (.055,.10,.155) drew an indigo disc under the reef-flat foam of v1 / v9, h232-241 in the
  //  h219-224 turquoise); the boat views (v3: blue-steel churn) keep the blue
  col=mix(col,(Esun*.8+Esky)*mix(mix(vec3(.055,.10,.155),vec3(.05,.125,.16),sandy),mix(vec3(.05,.13,.155),mix(vec3(.016,.082,.15),vec3(.05,.13,.155),sandy),uWK7.x),aerA)*vec3(1.-.6*uWK11.y*aerA,1.,1.)*.55+refl*F*.4,aer*aerV);   // (r13w, wk41: x(1 - .6 red) from the air)   // (r11w, URL wk24) from the air the bubble cloud next to the rock collars is the photos' saturated cyan-blue (v1 9,85,119), not a grey aqua (44,96,110); over sand it stays aqua   // (r7w: was .07,.16,.16 -- mint)
  if(uDbgM==26) return vec3(aer,F,0.)*.25+vec3(0.,0.,dot(body,vec3(.2126,.7152,.0722)));   // debug: aer, Fresnel, body luminance
  gFoamU=vec3(wq,normalize(-cg+1e-5));                         // foam lines follow the shore (concentric arcs)
  // on the beach the foam is drawn out along the beach (its own fixed frame: the coast direction at the beach centre)
  if(bzW>.01){
    const vec2 BC=vec2(327.,800.); const float eb=18.;
    vec2 gb=vec2(coastRaw(BC+vec2(eb,0))-coastRaw(BC-vec2(eb,0)),coastRaw(BC+vec2(0,eb))-coastRaw(BC-vec2(0,eb)));
    gb=normalize(gb+1e-5); gFoamF2=vec3(-gb.y,gb.x,smoothstep(.05,.6,bzW)); gFoamST2=4.5;   // bands parallel to the beach
  }
  // (r10w) churned rocky surf from a boat: the whitewater left by each wave is drawn out in the direction it travels (shoreward,
  //  the swell direction: a fixed frame, never sheared) -- streaky, motion-textured foam instead of round camouflage blobs.
  //  Weight URL wk10, stretch 2.3 (1 + wk0); the close-up fibres follow the same frame
  else if(uWK3.z*chzN>.005){ const float cr=.9928, sr=-.1197; gFoamF2=vec3(sdir.x*cr-sdir.y*sr,sdir.x*sr+sdir.y*cr,uWK3.z*chzN); gFoamST2=2.3*(1.+uWK.x); }
#ifdef FOAM_CAL
  // calibration views of the foam thresholds (build with FOAM_CAL defined): an 8 x 6 grid of test cells.
  // 41: coverage for D = .1 .. 1.5 (columns), rows age 0/.5/1 x (resolved, unresolved);  43: component means
  // (rows A, B, K);  42 / 45: CDF of the full / large-scale foam potential (16 thresholds -.75 .. .3 per age)
  vec2 cc=floor(gl_FragCoord.xy/uRes*vec2(8.,6.));
  if(uDbgM>=41&&uDbgM<=45){ age=floor(cc.y*.5)*.5; dens=(cc.x+.5)/8.*1.6; gx=vec2(uDbgM==41&&mod(cc.y,2.)>.5?30.:.004,0.); gy=gx.yx; gFoamU=vec3(0); gFoamF2=vec3(0); fdir=vec2(-sdir.y,sdir.x); }
#endif
  // (r10w) churned surf from a boat: bubbly whitewater has soft edges (a gradient of thinning bubbles), not crisp cut-outs:
  //  the lace threshold edge widened by .04 x URL wk14 there
  gFoamSoft=.04*uWK4.z*chzN;
  gFoamCore=coreF*(1.-age);   // (r11w)
  gFoamBig=uWK9.x*chzN;   // (r12w, URL wk32) churned surf from a boat: big foam sheets with big clear holes (the v3 photo), not a field of 1 m blobs
  vec4 fo; float foam=foamTex(p,gx,gy,dens,age,fdir,fo);
  gFoamSoft=0.; gFoamCore=0.; gFoamBig=0.;
#ifdef FOAM_CAL
  float thk=-.75+(mod(cc.y,2.)*8.+cc.x)*.07;
  if(uDbgM==41) return vec3(step(hash12(gl_FragCoord.xy*.731+3.1),foam))*.25;
  if(uDbgM==42) return vec3(step(thk,gFoamS))*.25;
  if(uDbgM==45) return vec3(step(thk,gFoamSK))*.25;
  if(uDbgM==43){ float v=cc.y<1.5?gFoamSA:cc.y<3.5?gFoamDbg.y:gFoamDbg.z; return vec3(step(hash12(gl_FragCoord.xy*.731+3.1),(v+1.)/1.2))*.25; }
#endif
  if(uDbgM==25) return vec3(foam,age,dens*.5);
  if(uDbgM==27) return vec3(gFoamDbg.x,gFoamDbg.y+.5,gFoamDbg.z+.5)*.5;   // foam components (H, B, K) -- with 27 the look matrix of dbgm 40
  // foam surface: wave slope + the foam's own relief (rounded lace walls, bubble clusters) + lumps of fresh
  // whitewater (~1 m, ~0.3 m): a 3D mass that catches the sun on one side and is grey in its creases
  vec2 fsl=sl*mix(.7,.3,uWK9.x*chzN)+fo.yz;   // (r12w, wk32) churned whitewater is a diffuse bubble mass: less shading by the wave facets (no crumpled paper)
  float lump=(1.-age)*smoothstep(.3,1.,dens);
  float fo1=clamp(1.5-pixL*2.,0.,1.)*lump, fo2=clamp(1.5-pixL*6.,0.,1.)*lump, fo3=clamp(1.5-pixL*16.,0.,1.)*lump;
  float lh=0.;
  if(fo1>0.){ vec3 a=vnoised(p*.9+vec2(uTime*.1,0.)); fsl+=a.yz*.9*.55*fo1; lh+=a.x*fo1*.5; }
  if(fo2>0.){ vec3 a=vnoised(p*3.1+3.3); fsl+=a.yz*3.1*.13*fo2; lh+=a.x*fo2*.35; }
  if(fo3>0.){ vec3 a=vnoised(p*9.+7.1); fsl+=a.yz*9.*.035*fo3; lh+=a.x*fo3*.25; }   // bubble clusters ~10 cm
  vec3 Nf=normalize(vec3(-fsl.x,1.,-fsl.y));
  // foam is a multiple-scattering medium: diffuse (a little wrap), sky fill reduced in creases / thin foam;
  // thin foam is translucent (the water shows through, tinted by the bubbles), thick fresh foam opaque and bright
  float ndl=dot(Nf,uSun);
  float difF=max((ndl+.35)/1.35,0.);                          // multiple scattering: light bleeds round the lumps
  float aoF=mix(.62,1.,fo.x)*(.5+.5*clamp(lh*.6+.5,0.,1.));      // creases between lumps: grey
  vec3 sI=skyIrr(Nf); sI=mix(vec3(dot(sI,vec3(.3,.5,.2))),sI,.6);   // sky fill, a little desaturated (bubbles scatter the whole sky dome)
  vec3 foamLit=SUN*difF*mix(.3,1.,sunSh)*mix(.75,1.,aoF)+sI*1.05*aoF;
  vec3 fcol=foamLit*vec3(.585,.665,.765)*fo.w*(1.+.2*smoothstep(.6,1.4,fresh)*(1.-age));   // (r5: fresh dense whitewater: brilliant white)
  fcol=mix(fcol*vec3(.72,.84,.95),fcol,smoothstep(0.,.8,fo.x));
  fcol*=mix(vec3(1.),vec3(.87,.99,1.12),uWK6.y*aerA);   // (r11w) cooler whitewater from the air (URL wk21): the aerial photos' white is blue-white (v1 226,236,241, v9 227,239,245), r10f's warm-neutral (230,230,227); the boat photos' white is neutral (v3 224,226,228), so not there
  // ---- close up (footprint below ~10 cm) foam is no flat white sheet: a translucent web of bubble streaks drawn out
  // by the flow (fibres ~5-15 cm apart, up to a metre long) with bright ropes and bubble clusters in it; the
  // turquoise water shows through the thin parts. Fresh, dense whitewater stays an opaque (but streaky) mass.
  float crF=clamp(1.6-pixL*8.,0.,1.);   // (r5: out to ~20 m in the low views, was ~12 m: no band of flat white cut-outs behind it)
  float fib=1., bub=0.;
  if(crF>0.&&foam>.001){
    // (r5) two FIXED frames (open water / beach), blended by value: a frame rotating with position (the old mix of the
    // two directions) shears the streaks ~800 m from the origin into a pinch -- the hard seam in the near beach foam
    float wB2=gFoamF2.z, fibA=0., fibB=0.;
    vec2 fwob=vec2(0.,.9*fbm(p*.11+vec2(uTime*.02,3.1),3)+.18*vnoise(p*.9+1.7));      // the streaks bend with the eddies
    float fo2c=clamp(1.6-pixL*40.,0.,1.), fo3c=clamp(1.5-pixL*90.,0.,1.);
    for(int fi=uZero;fi<2;fi++){
      float wf=fi==0?1.-wB2:wB2; if(wf<.001) continue;
      vec2 tf=fi==0?fdir:gFoamF2.xy, nf=vec2(-tf.y,tf.x);
      vec2 fq=vec2(dot(p,tf),dot(p,nf))+fwob+float(fi)*vec2(17.3,5.1);
      float n1=vnoise(vec2(fq.x*.55,fq.y*6.5)+3.3), n2=vnoise(vec2(fq.x*1.4,fq.y*17.)+8.1), n3=vnoise(vec2(fq.x*3.,fq.y*40.)+1.9);
      float f1=mix(.3,smoothstep(.5,.95,1.-abs(n1)),clamp(1.7-pixL*6.,0.,1.)), f2=smoothstep(.55,.95,1.-abs(n2))*fo2c, f3=smoothstep(.6,.95,1.-abs(n3))*fo3c;
      float fv=clamp(f1*.7+f2*.55+f3*.4,0.,1.);
      if(fi==0) fibA=fv; else fibB=fv;
    }
    fib=mix(fibA,fibB,wB2);
    vec2 bd; float bid; vec4 bv=vorWall(p/.035+vec2(3.7,9.1),bd,bid);
    bub=(1.-smoothstep(.18,.38,bv.w))*step(.55,hash11(bid*13.7))*clamp(1.5-pixL*60.,0.,1.);   // single bubbles / clumps (~2-4 cm)
  }
  float thk=clamp(fo.x*(1.-.55*age)*smoothstep(.2,1.1,dens),0.,1.);
  // (r4f: lace, not a milky veil: the filaments are opaque bright white, the gaps between them clear water; dense
  // fresh whitewater is opaque)
  float opq=mix(1.,mix(smoothstep(.12,.45,fib),1.,smoothstep(.15,.7,thk)),crF);
  opq*=mix(1.,mix(.7,1.,smoothstep(.1,.6,thk)),(1.-crF)*smoothstep(.4,.2,-rd.y));   // (r5: low views, mid range: thin old lace is translucent too, not a paper cut-out)
  if(uDbgM==93) return vec3(foam*mix(.6,1.,fo.x)*opq,fib,thk)*.5;   // (r9w debug, r9m: 73 -> 93) final foam cover, close-up fibres, thickness
  if(uDbgM==94) return vec3(gFoamF2.z,crF,dens*.4)*.5;               // (r9w debug, r9m: 74 -> 94) beach frame weight, close-up weight, density
  fcol*=mix(1.,.9+.22*fib+.2*bub,crF);
  // the water under a thin veil of foam: milky turquoise (light scattered by the bubble cloud below the surface)
  col=mix(col,col*.8+(Esun*.8+Esky)*vec3(.04-.025*uWK11.y*aerA,.105,.14)*.3,foam*(1.-opq)*crF*.5);
  col=mix(col,fcol,foam*mix(.6,1.,fo.x)*opq);
  if(wcC>.0005){   // (r8w) aerial whitecaps: cool white, by area cover (soft points / translucent streaks)
    vec3 sIw=skyIrr(vec3(0,1,0)); sIw=mix(vec3(dot(sIw,vec3(.3,.5,.2))),sIw,.6);
    vec3 fW=(SUN*((uSun.y+.35)/1.35)*mix(.3,1.,sunSh)+sIw*1.05)*vec3(.585,.665,.765)*vec3(.9,.96,1.);
    col=mix(col,fW,wcC*uWK.z);   // (r10w: x uWK.z, URL wk2: fainter flecks -- seen from 500-1000 m a whitecap is thin foam, not a 100 % white disc)
  }
  if(uDbgM==51) return vec3(foam*mix(.6,1.,fo.x)*opq,aer,depth0/20.)*.5;
  if(uDbgM==120) return vec3(foam*mix(.6,1.,fo.x)*opq,tW*F,dot(refl*F,vec3(.2126,.7152,.0722))*4.)*.4;   // (r13w debug) final foam cover, terrain reflection share, reflection luminance   // debug (r8w): foam cover, aerated, depth
  return col;
}
// (r12w, URL wk38) soft whitewater fringe over the rock base at the waterline. The land / water silhouette is the zero contour of the
//  bilinear height texels (~1.2 m, about one pixel from the air): a hard, stair-stepped brown-to-white edge that would crawl in motion.
//  Surge washes up the rock: rock below a wash level (.15-.65 m, varying along the shore and with the surges) on a smoothed height
//  (4 taps: its contour has no texel kinks) is covered by mottled whitewater, with an alpha ramp at least ~1 px wide on screen.
vec3 waterEdge(vec3 pT, vec3 rd, float tT, vec3 col){
  if(uWK10.z<=0.||pT.y>2.4||pT.y<-.06) return col;
  vec2 p=pT.xz;
  float cw=coastRaw(p); if(abs(cw)>45.) return col;
  float bz=smoothstep(.05,.4,VEG(p).b); if(bz>.95) return col;
  const float e=1.2;
  float h1=H(p+vec2(e,.4*e)), h2=H(p-vec2(e,.4*e)), h3=H(p+vec2(-.4*e,e)), h4=H(p-vec2(-.4*e,e));
  float Hs=.25*(h1+h2+h3+h4);
  float gH=length(vec2(h1-h2,h3-h4))/(2.*e*1.077);
  float pix=tT*uTan*2./uRes.y;
  float lv=(.15+.5*smoothstep(-.35,.45,vnoise(p*.07+vec2(uTime*.22,3.1))))*uWK10.z;
  float m=.6*vnoise(p*.33+vec2(uTime*.35,1.7))+.4*vnoise(p*1.05+3.3)*clamp(1.5-pix*.8,0.,1.);
  float ew=max(.12,gH*pix*.9);
  float a=smoothstep(lv+ew,lv-ew,Hs+.3*m)*(1.-bz);
  // (r12 fix, URL rf0) the wash read as a smooth, structureless white band hugging every rock like a glowing outline (v9 / v1; white share
  //  v9 5.95 % vs photo 4.24). The flat rock shelves at the waterline lie below any wash height, so the old wash painted them white.
  //  Now: a ~1 px white lip only where a ground point ~1.3 px away is under water (the true silhouette: it still covers the stair steps),
  //  the surge above it broken into foam streaks / lace (~5 m cells, faded to their mean once unresolved, within ~3-8 m of the waterline,
  //  distance ~ height / slope), and the surge-wetted rock darker (wet basalt) between the streaks.
  if(uRF.x>0.){
    float dW=(Hs+.12*m)/max(gH,.004);
    float pr=max(1.3*pix,.5);   // lip: only where a ground point ~1.3 px away is under water (the true silhouette), not over whole low shelves
    float mH=min(min(H(p+vec2(pr,0.)),H(p-vec2(pr,0.))),min(H(p+vec2(0.,pr)),H(p-vec2(0.,pr))));
    float aT=smoothstep(.05,-.22,mH+.1*m)*smoothstep(.4+ew,.12,Hs);
    float lq=.65*vnoise(p*.19+vec2(uTime*.12,5.1))+.35*vnoise(p*.53+vec2(2.7,uTime*.2));
    float lace=mix(.3,smoothstep(.12,.42,lq),clamp(2.2-pix*.6,0.,1.));
    float aS=smoothstep(lv*.8+ew,lv*.8-ew,Hs+.3*m)*lace*smoothstep(8.,3.,dW);
    float lc2=mix(.55,smoothstep(-.25,.35,vnoise(p*.38+vec2(uTime*.25,8.3))),clamp(2.-pix*.7,0.,1.));   // the lip is lacy too: foam with dark wet rock showing through on the awash shelves
    a=mix(a,max(aT*.85*(.35+.65*lc2),aS)*(1.-bz),uRF.x);
    // the rock the surge reaches is wet: darker (wet basalt), so the shelves read dark wet rock between the foam streaks
    col*=1.-.42*uRF.x*smoothstep(lv+ew,lv-ew,Hs+.3*m)*smoothstep(10.,4.,dW)*(1.-bz);
  }
  if(a<.003) return col;
  float aerA=smoothstep(.42,.7,-rd.y)*smoothstep(40.,150.,tT);
  float sunSh=shadow(vec3(p.x,.6,p.y),uSun,0.);
  vec3 sI=skyIrr(vec3(0,1,0)); sI=mix(vec3(dot(sI,vec3(.3,.5,.2))),sI,.6);
  vec3 fc=(SUN*((uSun.y+.35)/1.35)*mix(.3,1.,sunSh)+sI*1.05)*vec3(.585,.665,.765)*(.9+.1*m)*mix(vec3(1.),vec3(.87,.99,1.12),uWK6.y*aerA);
  return mix(col,fc*.86,a*.8);   // (a thin wash over dark wet rock: a little greyer than the open whitewater)
}
