// ---------------------------------------------------------------- materials
// land lighting (kept separate from SUN / skyIrr, which the water shading is tuned to)
const vec3 SUNL=vec3(1.0,.93,.8)*4.4;                 // warm golden tropical sun
vec3 skyFill(vec3 N, float veg){                       // sky + bounce irradiance: teal fill over forest, blue-grey on sea cliffs
  // a face turned sideways sees about half the sky (the other half is terrain / neighbouring crowns): no bright rims
  vec3 up=mix(vec3(.22,.37,.52),vec3(.19,.40,.36),veg), hor=mix(vec3(.19,.18,.165),vec3(.15,.26,.20),veg), gnd=mix(vec3(.05,.05,.05),vec3(.05,.065,.04),veg);
  return N.y>0.?mix(hor,up,N.y):mix(hor,gnd,-N.y);
}
vec3 sceneNormal(vec3 p, float eps){
  const vec2 k=vec2(1,-1); vec4 i;
  return normalize(k.xyy*sceneSD(p+k.xyy*eps,i)+k.yyx*sceneSD(p+k.yyx*eps,i)+k.yxy*sceneSD(p+k.yxy*eps,i)+k.xxx*sceneSD(p+k.xxx*eps,i));
}
float sceneAO(vec3 p, vec3 n, float s){
  float o=0., w=1.; vec4 i;
  for(int k=uZero;k<5;k++){ float h=s*(.12+.5*float(k*k)); float d=sceneSD(p+n*h,i); o+=max(h-d,0.)*w/h; w*=.75; }
  return clamp(1.-o*.32,0.,1.);
}
float gRkSea=1.;                                       // 1 = seaward, iron-stained red-brown faces; 0 = inland grey basalt walls
// Weathered volcanic rock (round 5). The colour follows the rock's own structure, not free-floating noise:
// - lava-flow scale lithology (25-80 m): dense charcoal flows, weathered brown flows, iron-stained red-brown sections;
// - weathering skin on the proud blocks (oxidised brown / orange / red-brown), recessed blocks stay sooty dark;
//   every block has its own shade, a few fresh grey breaks;
// - facet orientation: red-brown laterite / soil and some dark moss film on ledge tops;
// - open joints between the wall columns (rkSlots) darken as slots; mottle, grain and lichen only while resolved
//   (footprint fades), no thresholded iso-lines, no strata bands.
vec3 rockAlbedo(vec3 p, vec3 N, float spray){
  float disp=rockField(p);
  float jut=gRk.x, t1=gRk.y, t2=gRk.z, jut2=gRk.w;
  float gp=max(gPix*gRkAn,1e-4);   // (r5 fix) grazing-stretched footprint: the mottle / slot / lichen fades follow it
  // palette (linear albedo): sooty fresh basalt, dark brown weathered basalt, brown-ochre skin, iron-oxidised orange
  // skin (the lit pillars of r2), red-brown iron laterite (ref.png headlands), ochre, grey lichen
  vec3 basalt=vec3(.021,.0195,.018), dbrown=vec3(.036,.029,.021), tanc=vec3(.064,.046,.027),
       orange=vec3(.084,.051,.024), redb=vec3(.072,.039,.019),   /* (r5 fix) redb .066,.036,.020: a little rustier (ref.png headlands) */ ochre=vec3(.092,.065,.030), lichen=vec3(.10,.10,.088);
  // lava-flow scale lithology (25-80 m): soft-edged zones of dense dark flows, weathered brown flows and iron-stained
  // red-brown sections (mildly elongated along the flows, never thin bands)
  float L1=noise3(vec3(p.x*.011,p.y*.024,p.z*.011)+2.3)+.45*noise3(p*.043+7.);
  float L2=noise3(vec3(p.x*.016,p.y*.03,p.z*.016)+8.1)+.4*noise3(p*.065+3.);
  float L3=noise3(p*.028+13.)+.5*noise3(p*.1+5.)*clamp(2.-gp*.4,0.,1.);
  vec3 c=mix(basalt,dbrown,smoothstep(-.75,.15,L1));
  c=mix(c,redb*.85,smoothstep(-.05,.65,L2)*.72*gRkSea);   // (r5 fix) .05-.7 x .7: a little more rust   // iron-stained red-brown sections of the sea cliffs (ref.png)
  // weathering skin: proud blocks and the open faces between the joints oxidise warm; recessed blocks and fresh breaks
  // stay sooty dark (r2: orange-lit pillars, black slots). pr is .5 where the block octaves are no longer resolved.
  float pr=clamp(mix(jut,jut2,.45),0.,1.);
  float sk=smoothstep(.35,.95,pr+.35*L3+.3*(t1-.5));
  vec3 skin=mix(tanc,orange,smoothstep(-.3,.45,L2));
  skin=mix(skin,redb*1.1,smoothstep(.05,.75,L2)*.7);
  c=mix(c,skin,sk*mix(.4,.85,gRkSea)*smoothstep(-.9,-.2,L1));   // the dense dark flows stay charcoal
  // block to block: own shade (moderate: no quilt), a few fresh grey breaks
  c*=.8+.4*t1;
  c=mix(c,vec3(dot(c,vec3(.3,.5,.2)))*vec3(.95,.97,1.),smoothstep(.3,.05,t2)*.5);
  // facet orientation: red-brown laterite / soil on ledge tops and sloping faces
  float up=smoothstep(.45,.85,N.y), sheer=1.-smoothstep(.12,.45,N.y);
  vec3 lat=mix(redb,ochre,smoothstep(.45,.95,t2)*.35)*(.8+.4*t1);
  c=mix(c,lat,up*.7*(1.-spray));
  // moss / algae film on some of the ledge tops (dark olive; the ferns and shrubs themselves are the vegetation mask)
  float mo=up*(1.-spray)*smoothstep(.15,.65,noise3(p*.11+21.)+.4*noise3(p*.37+4.)*clamp(1.6-gp*1.8,0.,1.))*smoothstep(4.,15.,p.y);
  c=mix(c,vec3(.034,.043,.018)*(.8+.4*t1),mo*.5);
  c*=1.-.12*sheer;
  // (r5 fix) cliff walls (10 m slope > ~55 deg) are dark grey-brown basalt, not beige: r3 sunlit cove cliff ~70/78/61
  // incl. its fern ledges (render was 116/103/68), ref.png right cliff dark. The tan skin / laterite of the walls is
  // greyed and darkened; the iron-stained sections keep most of their rust (ref.png headlands, r2 pinnacle).
  // (the r3 faces are mostly 30-55 deg slopes: weighted by the 10 m slope gRkS10, not by the wall mask)
  float iron=smoothstep(-.05,.65,L2)*gRkSea;
  // The cliffs east of the cove (x > ~300 m: v3 right cliff, ref.png / r9 right side, the far cliffs of v2) are a
  // dense dark flow sequence: dark grey-brown; the headland west of the cove (v2 pinnacle, ref.png centre) keeps its
  // iron-stained red-brown. Broad, noise-perturbed transition (~150 m).
  float ez=smoothstep(220.,380.,p.x+70.*noise3(p*.005+3.));
  // Seen from the air (steep view down, wall detail unresolved) the iron crust / red soil of the countless small
  // ledge tops covers much of the projected area: ref.png headlands read rust / ochre, r3 (sea level) dark basalt
  float aer=smoothstep(.3,.7,-gRkRdY)*smoothstep(.35,.9,gp);
  float dk=gRkS10*mix(.12,mix(.2,1.,ez),gRkSea)*(1.-.5*aer*(1.-ez));   // inland walls: only a touch (they get their own grey below)
  c=mix(c,vec3(dot(c,vec3(.3,.5,.2)))*vec3(1.,.96,.88),dk*.62*(1.-.75*iron*(1.-.5*ez)));
  c*=1.-dk*.42*(1.-.6*iron*(1.-.5*ez));
  c=mix(c,mix(redb,ochre,.3)*(.85+.3*t1),aer*gRkS10*gRkSea*.32*smoothstep(-.6,.4,L3)*(1.-spray)*(1.-.7*ez));   // patchy, not a uniform wash
  // (r12 walls) uWA.w (URL wa3): seen from the air the seaward cliffs show their lava-flow sequence, dense near-black flows between
  //  the iron-stained red-brown sections (ref.png headlands), not an even tan felt
  //  (r12 fix, URL rf2) the flows are a warm brown-black (.034,.027,.019), not a neutral charcoal: under the blue fill and the aerial veil the
  //  neutral one read charcoal-olive on the v1 headland (tip 80/77/70, R-B 10; photo 84/79/64, R-B 20). From the air only (aer): the
  //  level views (v2 pinnacle, v3 east cliff) keep the r12m charcoal
  { float fl3=smoothstep(.35,-.35,L1+.35*noise3(p*.07+17.));
    float tx=noise3(p*vec3(.09,.16,.09)+23.)+.5*noise3(p*vec3(.25,.4,.25)+5.)*clamp(1.8-gp*1.4,0.,1.);   // 6-20 m blocks / ledges: texture, not felt
    c=mix(c,mix(basalt*1.25,vec3(.034,.027,.019),uRF.z*aer)*(.8+.4*t1),uWA.w*mix(.4,1.,aer)*gRkS10*gRkSea*clamp(fl3*.85+.4*smoothstep(-.1,.5,tx),0.,1.)*(1.-.5*iron)); }
  // dark weathering / seep streaks running down the steep faces (~3-8 m apart; r3 cliff base, r2 pillars): breaks up
  // the big planar facets; fades to its mean once a streak is < ~5 px
  float fsk=clamp(5./(gp*5.)-1.,0.,1.);
  if(fsk>0.){ float vs=noise3(vec3(p.x*.2,p.y*.03,p.z*.2)+41.)+.5*noise3(vec3(p.x*.55,p.y*.08,p.z*.55)+3.)*clamp(2./(gp*5.)-1.,0.,1.);
    c*=mix(1.,.5+.65*smoothstep(-.6,.5,vs),fsk*gRkS10*(1.-.5*up)); }
  // open joints between the columns of the walls: dark slots (shading only, band-limited in rkSlots)
  if(gRkSl>.01){
    vec3 q=p+vec3(noise3(p*.021+1.3),noise3(p*.017+4.2)*.6,noise3(p*.021+7.1))*6.;
    c*=1.-.8*rkSlots(q,gp)*gRkSl*(1.-up);
  }
  // weathering mottle (1-4 m) and grain (.2-.6 m), only while resolved (footprint fades)
  float fm=clamp(1.6-gp*1.8,0.,1.), ff=clamp(1.5-gp*6.,0.,1.), fg=clamp(1.4-gp*14.,0.,1.);
  c*=1.+(.18*noise3(p*.45+4.)+.12*noise3(p*1.3+9.)*ff)*fm+.16*noise3(p*4.1+2.)*fg;
  // lichen / salt crust: pale grey patches on dry, upper rock (resolved only)
  float lc=noise3(p*.35+5.)+.4*noise3(p*1.1+2.)*ff;
  c=mix(c,lichen,smoothstep(.5,1.,lc)*(1.-spray)*.16*fm*smoothstep(6.,25.,p.y));
  // inland walls: grey basalt, dark wet seeps and moss / algae stains down the face (no red cast)
  float lum=dot(c,vec3(.3,.5,.2));
  // (r12 walls) uWA.x (URL wa0): the inland basalt is a warm dark brown-grey, not a neutral grey: under the blue sky fill of the
  //  gully shade the neutral grey read as slate blue-grey patches on the v1 / v9 ridges (photos: near-black basalt in the shade,
  //  brown-grey in the sun). uWA.z (URL wa2): darker inland basalt
  float wA=uWA.x*mix(.25,1.,aer);   // seen level (v4 / v5 inland cliffs: dark grey basalt in the photos) only a touch
  vec3 cin=mix(vec3(lum)*mix(vec3(.95,.97,.95),vec3(1.2,.97,.7),wA),c,.35+.15*wA)*.85*(1.-.5*uWA.z);
  float ms=smoothstep(.1,.8,noise3(vec3(p.x*.09,p.y*.025,p.z*.09)+31.)+.3*noise3(p*.3+3.));
  cin=mix(cin,vec3(.026,.034,.02)*(1.-.25*uWA.z),ms*.6);
  // (r12 walls) uWA.y (URL wa1): red-brown soil / laterite scars on the inland walls (ref.png ridges, r5 right wall): ragged
  //  40-120 m patches on the less sheer faces, strongest from the air
  float scR=uWA.y*smoothstep(.2,.7,noise3(vec3(p.x*.012,p.y*.02,p.z*.012)+51.)+.45*noise3(p*.05+9.)+.25*noise3(p*.17+2.)*fm)*(1.-.6*sheer)*(1.-spray);
  cin=mix(cin,mix(redb,ochre,.25)*(.7+.5*t1),scR*mix(.12,.9,aer));
  c=mix(cin,c,gRkSea);
  return mix(c,c*vec3(.62,.62,.66),spray);
}
// (r13 mat) fractured, jointed basalt at mid / long range (shading only). The relief octaves of rockField fade out below ~5 px,
//  so from the air (footprint ~.8-1 m: v1 / v9 headlands) and on the far walls the rock read as smooth brown clay with soft
//  blobs; the photos show crisp fracture: columns and blocks with lit and shaded facets and near-black open joints between them.
//  The columns of a lava flow are vertical prisms: 2D jittered cells in xz (seen on a steep face as vertical strips of uneven
//  width), each column broken by cross joints into segments 1-3 columns tall. Every segment is a planar facet with its own turn
//  about the vertical and lean in / out (lit and shaded facets side by side), the face of each column rounds off toward its
//  joints, and the joints are open cracks (dark). Three fixed scales (2.8 / 7 / 17 m), each faded once its columns span fewer
//  than ~4-8 px (no shimmer, no morphing octaves); a crack narrower than ~1 px fades to its mean darkening. Steep faces only:
//  on gentle ground the cells would read as paving.
vec4 rkCol(vec2 q, float cs, float sd){   // x = F2-F1 (m), y = id, zw = p - cell centre (m)
  vec2 g=q/cs, n=floor(g), f=fract(g);
  float d1=9., d2=9., id=0.; vec2 b=vec2(0);
  for(int k=uZero;k<9;k++){
    vec2 o=vec2(k%3,k/3)-1.;
    vec3 h=rkHash(vec3(n+o,sd));
    vec2 r=o+.12+.76*h.xy-f;
    float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; b=r; id=h.z; } else if(d<d2) d2=d;
  }
  return vec4((sqrt(d2)-sqrt(d1))*cs,id,-b*cs);
}
float gFrCav=0., gFrWt=0., gFrUp=0., gFrTn=1.;   // last rkFracture call: open-joint darkness, weathered (oxidised) share, facet lean (+ up), segment tone
void rkFracture(vec3 p, vec3 Nf, inout vec3 N, float w){   // Nf: smooth face normal (~4 m)
  gFrCav=0.; gFrWt=0.; gFrUp=0.; gFrTn=1.;
  if(w<=.001) return;
  float gp=max(gPix*gRkAn,1e-4);
  float stp=smoothstep(.82,.5,Nf.y);
  if(stp<=0.) return;
  vec2 wq=p.xz+vec2(noise3(p*.043+3.1),noise3(p*.043+8.7))*4.;   // the joints wander (~25 m)
  vec3 tH=normalize(vec3(-Nf.z,0.,Nf.x)+vec3(1e-5,0.,0.));        // along the face, horizontal
  vec3 dn=vec3(0); float cav=0., tn=0., wt=0., ws=0.;
  for(int s=uZero;s<3;s++){
    float cs=s==0?2.8:(s==1?7.:17.);
    float fw=clamp(cs/(gp*4.)-1.,0.,1.)*stp;
    if(fw<=0.) continue;
    vec4 c=rkCol(wq+float(s)*37.3,cs,float(91+s*7));
    float segL=cs*mix(.9,2.6,fract(c.y*7.31));                       // cross-joint spacing of this column
    float sv=p.y/segL+c.y*5.7+noise3(p*(.6/cs)+float(s))*.25, sf=fract(sv);
    vec3 h=rkHash(vec3(floor(c.y*65536.),floor(sv),float(s)+5.));
    // facet: turn about the vertical (+-.6) and lean in / out (+-.35), the column face rounding off toward its joints
    float side=clamp(dot(vec2(tH.x,tH.z),c.zw)/(cs*.5),-1.,1.);
    float lean=(h.y*2.-1.)*.35+.12;
    vec3 tl=tH*((h.x*2.-1.)*.6+side*.45)+vec3(0.,lean,0.);
    float amp=s==0?.55:(s==1?.75:.6);
    dn+=(tl-Nf*dot(tl,Nf))*amp*fw;
    // open joints between the columns and at the cross joints (crack width .05-.12 of the column)
    float jw=mix(.05,.12,h.z)*cs;
    float vis=clamp(jw/gp*1.2-.3,0.,1.);
    float ed=min(c.x*.5,min(sf,1.-sf)*segL*.8);
    float cr=(1.-smoothstep(jw*.35,jw+gp*.7,ed))*vis+(1.-vis)*min(2.2*jw/cs,1.)*.8;
    float op=smoothstep(-.05,.4,noise3(p*(1.6/cs)+float(s)*17.)+.3*(fract(h.z*13.1)-.5));   // a joint is open over parts of its length only (no crackle net)
    cav=max(cav,cr*fw*op);
    tn+=(h.z-.5)*fw; wt+=smoothstep(.35,.75,h.x*.6+h.y*.4+.25*lean+.45*smoothstep(.25,.7,Nf.y)-.2)*fw; gFrUp+=lean*fw; ws+=fw;   // sloping faces hold the oxidised crust / laterite (ref.png: red-brown on the sloping crest faces), sheer faces are fresher dark basalt (r9 sea cliffs)
  }
  N=normalize(N+dn*w);
  { float dd=dot(N,Nf); if(dd<.45) N=normalize(N+Nf*(.45-dd)); }   // a facet never turns away from the face
  gFrCav=cav*w;
  gFrWt=ws>0.?wt/ws*min(ws,1.)*w:0.;
  gFrUp=ws>0.?gFrUp/ws*min(ws,1.):0.;
  gFrTn=1.+tn/max(ws,1.)*.7*w;
}
// 3D crown cells: x=F1 (0..), y=F2-F1, z=id
vec3 gCrownOff;   // offset from the nearest crown centre (cell units)
vec3 voronoi3c(vec3 p, float cs){
  vec3 g=p/cs, n=floor(g), f=fract(g);
  float d1=8., d2=8., id=0.; gCrownOff=vec3(0);
  for(int k=uZero;k<27;k++){
    vec3 o=vec3(k%3,(k/3)%3,k/9)-1.;
    vec3 c=n+o; vec3 r=o+hash33(c)-f;
    float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=hash13(c*1.7+3.); gCrownOff=-r; } else if(d<d2) d2=d;
  }
  return vec3(sqrt(d1),sqrt(d2)-sqrt(d1),id);
}
// per-leaf facets: nearest jittered cell -> (random normal xyz, tone w)
vec4 leafFacet(vec3 p, float size){
  vec3 g=p/size, n=floor(g), f=fract(g);
  float bd=8., bd2=8.; vec3 bc=vec3(0);
  for(int k=uZero;k<8;k++){
    vec3 o=vec3(k&1,(k>>1)&1,(k>>2)&1)-.5+step(.5,f)-.5;
    vec3 c=n+o+.5;
    vec3 r=c-.5+hash33(c)-g;
    float d=dot(r,r);
    if(d<bd){ bd2=bd; bd=d; bc=c; } else if(d<bd2) bd2=d;
  }
  vec3 h=hash33(bc*1.37+3.1)*2.-1.;
  float edge=smoothstep(0.,.35,sqrt(bd2)-sqrt(bd));            // dark slivers between leaves
  return vec4(h,hash13(bc*.71+9.3)*mix(.25,1.,edge));
}
// (r5) band-limited leaf / tuft speckle at every distance: the facet size follows the pixel footprint in octaves (never
// below ~4 px: no sparkle, cross-faded between octaves), so foliage keeps a fine-grained leafy light structure (lit and
// shaded tufts) instead of smooth clay. x,y,z = random tilt, w = tone
vec4 facetCell(vec3 p, float size){
  vec3 g=p/size, n=floor(g), f=fract(g);
  float bd=8., bd2=8.; vec3 bc=vec3(0);
  for(int k=uZero;k<8;k++){
    vec3 o=vec3(k&1,(k>>1)&1,(k>>2)&1)+step(.5,f)-1.;
    vec3 c=n+o;
    vec3 r=o+.2+.6*hash33(c+11.)-f;
    float d=dot(r,r);
    if(d<bd){ bd2=bd; bd=d; bc=c; } else if(d<bd2) bd2=d;
  }
  vec3 h=hash33(bc*1.37+3.1)*2.-1.;
  float edge=smoothstep(0.,.6,sqrt(bd2)-sqrt(bd));
  return vec4(h,hash13(bc*.71+9.3)*mix(.6,1.,edge));
}
void leafSpeckle(vec3 p, inout vec3 N, inout vec3 alb, float w){
  if(w<=.001) return;
  float kf=log2(max(6.*gPix/.12,1.)), k0=floor(kf), fk=smoothstep(.35,1.,fract(kf));   // facets 3-6 px (4*gPix = 2-4 px added per-pixel grain: photos are softer at the pixel level)
  float s0=.12*exp2(k0);
  vec4 a=facetCell(p,s0);
  if(fk>0.) a=mix(a,facetCell(p+5.3,s0*2.),fk);
  vec3 tn=a.xyz-N*dot(N,a.xyz);
  float fa=mix(1.,uVC.y,smoothstep(.35,1.1,gPix));   // (r11 veg) uVC.y (URL vc1, .5)   // (r7 forest) from the air: half the speckle (1-3 px energy 1.7-1.9x the photos', it broke the lit faces into grey noise)
  N=normalize(N+tn*.55*w*mix(1.,.8,smoothstep(.35,1.1,gPix)));
  alb*=mix(1.,.6+1.*a.w,w*fa);   // (r5: ~mean-preserving: the speckle shapes the light, it does not darken the canopy)
}
// species palettes (linear albedo), calibrated on the reference photos
vec3 forestTone(float k){
  return k<.22?vec3(.020,.036,.014):   // deep blue-green (mango, java plum, ohia)
         k<.42?vec3(.034,.052,.013):   // mid green
         k<.58?vec3(.050,.058,.012):   // olive green
         k<.74?vec3(.054,.066,.015):   // yellow-green (hau, guava)
         k<.84?vec3(.064,.074,.021):   // bright yellow-green (albizia, fresh flush)
         k<.94?vec3(.048,.062,.044):   // pale silvery grey-green (kukui)
         k<.985?vec3(.058,.056,.020):  // olive-bronze ((r7 forest) rarer, less orange)
               vec3(.060,.046,.024);   // reddish-bronze new growth
}
vec3 shrubTone(float k){
  return k<.25?vec3(.060,.083,.019):   // uluhe fern, yellow-green (sunlit fern slopes: the lime patches of r9)   ((r8 forest) .066,.092,.018: lit fern slopes read neon from the air)
         k<.48?vec3(.058,.064,.021):   // grass / sedge, straw-yellow
         k<.76?vec3(.050,.060,.016):   // olive shrubs
         k<.985?vec3(.030,.044,.014):  // dark shrubs
               vec3(.066,.052,.025);   // dried fern (rust) ((r7 forest) rarer: orange specks from the air)
}
// species choice: about half of the crowns follow the local grove's species, the rest are random
float speciesK(float id, vec3 p){
  float grove=noise3(p*.013+5.7)*.5+.5;
  return fract(id*3.71)<.45?fract(grove*1.9+.3):fract(id*7.31);
}
vec3 leafColor(float seed, vec3 p, float hgt){
  float k=fract(seed*7.31);
  vec3 c=k<.26?vec3(.040,.056,.022):        // deep green (mango, ohia)
         k<.50?vec3(.072,.088,.034):        // mid olive
         k<.66?vec3(.115,.125,.046):        // sunlit olive / kukui
         k<.78?vec3(.135,.140,.045):        // yellow-green (hau, guava)
         k<.88?vec3(.058,.074,.04):         // grey-olive
         k<.95?vec3(.050,.066,.030):        // dark olive
               vec3(.10,.085,.04);          // dry / bronze new growth
  c*=.85+.3*fract(seed*13.7);
  float f1=clamp(1.-gPix*3.,0.,1.), f2=clamp(1.-gPix*10.,0.,1.);
  c*=1.+.22*noise3(p*.7+seed*11.)+.3*noise3(p*4.+seed*3.)*f1+.35*noise3(p*13.)*f2;
  // leaf clusters: lit clumps with dark gaps between them
  c*=mix(1.,mix(.3,1.15,smoothstep(-.35,.35,noise3(p*2.6+seed*5.))),f1*.85);
  c*=.82+.36*hgt;
  if(fract(seed*3.3)>.93) c=mix(c,vec3(.23,.03,.02),smoothstep(.72,.85,noise3(p*5.))*f1*.8);   // ohia blossoms
  return c;
}
// tree / bush foliage albedo: species tone, cluster / spray / leaf variation and baked canopy occlusion
// (uses the shading hints g* of the crown that was evaluated last)
// instanced tree albedo by species (treeType in v3_geo), slight per-tree and per-grove shifts
vec3 treeTone(float seed, vec3 pos){
  float ty=treeType(seed), v=fract(seed*13.7);
  vec3 c=ty==0.?mix(vec3(.018,.032,.013),vec3(.028,.044,.015),v):   // mango, java plum: deep glossy (blue-)green
         ty==1.?mix(vec3(.032,.048,.015),vec3(.044,.060,.017),v):   // mid green
         ty==2.?mix(vec3(.050,.062,.019),vec3(.064,.074,.022),v):   // albizia / monkeypod: light yellow-green
         ty==3.?mix(vec3(.042,.058,.042),vec3(.054,.070,.052),v):   // (bluish before the warm FOLG balance: stays silvery)   // kukui: pale silvery grey-green
                mix(vec3(.046,.058,.015),vec3(.060,.070,.017),v);   // hau / guava: yellow-green
  if(fract(seed*23.1)>.975) c=mix(vec3(.050,.050,.022),vec3(.056,.050,.028),v);   // olive-bronze new flush
  float grove=noise3(pos*.012+2.3);
  c*=mix(.9,1.,smoothstep(.15,.6,gPix));                     // close up the broadleaf crowns are deep glossy green (r5), not lime
  float vt=fract(seed*29.3); c*=mix(.8+.4*vt,.66+.44*vt,smoothstep(.3,.9,gPix));   // (r8 forest) .6+.75vt^2: pale crowns among dark ones read as separate balls from the air   // tree to tree: many greens, light and dark crowns side by side (strongest from the air)
  c*=mix(vec3(1.),grove>0.?vec3(1.08,1.06,.92):vec3(.92,.96,1.06),abs(grove)*.8);
  float sv=fract(seed*41.7);   // (r7 forest) tree to tree chroma: greyish crowns beside saturated deep-green / lime ones (from the air)
  c=max(mix(vec3(dot(c,vec3(.3,.6,.1))),c,mix(1.,.9+.3*sv,smoothstep(.25,.8,gPix))),0.);   // (r8 forest) .78+.55sv: fewer grey-olive crowns
  return c*mix(vec3(1.),mix(vec3(.84,.97,1.06),vec3(.9,.96,.98),uVE.y)*.77,smoothstep(.3,.9,gPix));   // (r11 veg) uVE.y (URL ve1): less of the emerald (blue) push on the crowns from the air: lime-emerald gorge floor (v1 floor h122 vs photo 117)   // (r8 forest) closed forest from the air: deep emerald, not olive (ref.png valley 0.25-0.5 band h153, ours h132)
}
// leaf-scale light variation on foliage surfaces: tufts (~.36 m) and leaves, each with its own tilt (normal)
// and tone, dark slivers between them. Each level fades out below ~2 px (band-limited, no sparkle).
void leafyShade(vec3 p, inout vec3 N, inout vec3 alb, float leafS, float w){
  // only where the leaves are not real geometry (gLeafW): the facets stand in for them
  float fT=lodF(.36)*w*(1.-gLeafW), fL=lodF(leafS)*w*(1.-gLeafW);
  if(fT>0.){ vec4 a=leafFacet(p,.36); N=normalize(N+a.xyz*.35*fT); alb*=mix(1.,.62+.7*a.w,fT); }
  if(fL>0.){ vec4 b=leafFacet(p+3.1,leafS); N=normalize(N+b.xyz*.8*fL); alb*=mix(1.,.5+.95*b.w,fL); }
  alb*=mix(.94,1.,lodF(.36));                          // unresolved leaves self-shadow: darker average
}
// unresolved leaf clusters: bump the normal and darken the gaps (shading only); weight w fades each scale in where the
// geometry no longer resolves it and out below ~2 px
void clusterBumps(vec3 p, inout vec3 N, inout float tone, float cs, float h, float w){
  if(w<=.001) return;
  vec4 b=domeG(p+noised3(p*(.6/cs)).yzw*cs*.25+noised3(p*(1.7/cs)+4.1).yzw*cs*.16,cs);   // warped: irregular clusters, no rings (r5: + a finer warp: lobed, ragged clump outlines, not round pebbles)
  vec3 g=b.yzw-N*dot(N,b.yzw);
  N=normalize(N-g*h*cs*w);
  // (r5) no dark outline all round every clump (pebbles): a shallow gap darkening, plus the clump's own shadow on its
  // side away from the sun (the dome rises toward the sun from here): lit tops toward the sun, dark sides trailing away
  float su=dot(b.yzw,uSun)*cs;
  tone*=mix(1.,(.78+.32*b.x)*(1.-.4*smoothstep(.1,1.6,su)),w);
}
// (r9 side) canopy seen level at mid / long range (footprint ~.3-4 m): the unresolved crowns on the walls, each a lit cap with a
// shaded underside and dark gaps between them (r2 / r3 / r5 walls; the aerial carpet LOD reads as smooth moss from the side).
// Shading only, on warped 3D cells whose size follows the footprint in octaves (>= ~6 px per crown, cross-faded: no shimmer).
// Crowns of varied size (.55-1 cell) and tone, overlapping (max of the domes), some cells empty (gaps): organic, not scales.
void sideCrown1(vec3 p, inout vec3 N, inout float tone, float cs, float w){
  vec3 q=(p+noised3(p*(.45/cs)+2.9).yzw*cs*.3)/cs, n=floor(q), f=fract(q);
  float best=0., kb=1., cid=.5; vec3 rb=vec3(0,1,0);
  for(int k=uZero;k<8;k++){
    vec3 o=vec3(k&1,(k>>1)&1,(k>>2)&1)+step(.5,f)-1.;
    vec3 h=hash33(n+o+8.9);
    if(h.z<.2) continue;                                       // gap (r9f: .14 -> .2)
    vec3 r=o+.2+.6*h-f;
    float kr=mix(.55,1.,h.x);                                  // (r9f: tried .42-1 (squared): crowns under ~2 px radius at the finest octave could shimmer -- kept .55-1)   // reach <= .67 cell: the 2x2x2 search never cuts a dome
    float s=1.-dot(r,r)*2.2/(kr*kr);
    if(s>best){ best=s; rb=r; kb=kr; cid=h.y; }
  }
  float s=clamp(best,0.,1.), sd=s*s*(3.-2.*s);
  vec3 gr=6.*s*(1.-s)*4.4*rb/(kb*kb*cs);                       // gradient of the dome (toward its centre)
  vec3 g=gr-N*dot(N,gr);
  N=normalize(N-g*.45*cs*w);                                   // each crown bulges: its sun side lit, its far side shaded
  float lc=length(rb);
  float un=lc>1e-4?smoothstep(.1,.8,rb.y/lc):0.;              // the crown centre lies above: its underside
  float su=dot(gr,uSun)*cs;                                    // the centre lies toward the sun: the crown's own shadow side
  // (r9m) uSL.x = the gap / dome-edge floor (.6, URL sl0); the merge keeps the side round's value
  tone*=mix(1.,mix(uSL.x,1.04,smoothstep(.0,.55,sd))*(1.-.28*un*(1.-.6*sd))*(1.-.22*smoothstep(.1,1.6,su))*(.78+.44*cid),w);   // (r9f: crown-to-crown tone .84-1.16 -> .78-1.22)
}
void sideCrowns(vec3 p, inout vec3 N, inout float tone, float w){
  if(w<=.001) return;
  float kf=log2(max(gPix*6./2.8,1.)), k0=floor(kf), fk=smoothstep(.4,1.,fract(kf));
  float cs=2.8*exp2(k0);
  vec3 N0=N; float t0=tone;
  sideCrown1(p,N,tone,cs,w);
  if(fk>0.){ vec3 N1=N0; float t1=t0; sideCrown1(p+11.7,N1,t1,cs*2.,w); N=normalize(mix(N,N1,fk)); tone=mix(tone,t1,fk); }
}
// (r10 canopy) crown clusters at mid / long range (footprint > ~.25 m), in place of the side crowns' scale domes and the facet
// speckle there (flat tilted plates with hard edges: the "reptile skin" on the v5 spurs / v4 hills). Each crown is a rounded
// cap (sphere-like normal: lit top toward the sun, shaded lower flank), crowns of very different sizes grouped in clumps by a
// grove field, dark gaps between the clumps, and each crown's cast shadow on what lies below / behind it (sun ray from the
// visible point tested against the neighbouring crowns). Shading only, on warped 3D cells (works on walls) whose size follows
// the footprint in octaves (>= ~10 px per cell, cross-faded: no shimmer); soft crown edges (~.3 R).
// out: N bent, tone (albedo factor), shv (sun visibility), cid (crown id for species / warm tint)
float gCCsh=1.;   // (r10 canopy) sun visibility from the unresolved crowns' cast shadows (crownClusters), sun term only
void crownCl1(vec3 p, vec3 N0, out vec3 nO, out float tone, out float shv, out float cid, float cs){
  vec3 q=(p+noised3(p*(.3/cs)+5.1).yzw*cs*.3+noised3(p*(1.1/cs)+2.3).yzw*cs*uCX.z)/cs, n=floor(q), f=fract(q);   // (r10c) + a finer warp (uCX.z, URL cx2): ragged crown outlines, not discs
  vec4 Cc[8];                                                   // crown centre - p (cell units, xyz), radius (w); w = 0: empty cell
  float best=-9., rc=1., cov=0., cb=.5, b2=-9., r2=1.; vec3 tb=vec3(0), t2=vec3(0); int ib=-1;
  for(int k=uZero;k<8;k++){
    vec3 o=vec3(k&1,(k>>1)&1,(k>>2)&1)+step(.5,f)-1.;
    vec3 c=n+o, h=hash33(c+3.7);
    float gr=noise3(c*.41+11.3)+.35*uCC.w;                      // grove field (~2-3 cells): clumps of crowns, open gaps between clumps
    Cc[k]=vec4(0);
    if(h.z<mix(.12,.55,smoothstep(.15,-.55,gr))) continue;      // empty cell: .12 inside a grove .. .55 between the groves
    vec3 r=o+.2+.6*h-f;
    float R=mix(.38,.67,h.x*h.x*(3.-2.*h.x));                   // radius <= .67 cell: the 2x2x2 search never cuts a crown
    float dn=dot(r,N0); vec3 t=-r+N0*dn;                        // p - crown centre, along the surface
    float Rs2=R*R-dn*dn*.8; if(Rs2<.02) continue;               // the surface slices each crown sphere: smaller / missing crowns where the centre lies off the surface (no stacked projections)
    R=sqrt(Rs2);
    vec3 tv=t-vec3(0.,t.y*.2,0.);                               // upright crowns: ~1.25x taller than wide on the walls
    float d2=dot(tv,tv)/(R*R);
    float hh=R*(sqrt(max(1.-d2,0.))*.85+.3*h.y);                // crown top height above the cell base: the taller crown is seen
    Cc[k]=vec4(r+N0*(.3*h.y*R),R);
    if(d2<1.){ if(hh>best){ b2=best; r2=rc; t2=tb; best=hh; rc=R; tb=t; cb=h.y; ib=k; } else if(hh>b2){ b2=hh; r2=R; t2=t; } }
    cov=max(cov,smoothstep(1.,.62,d2));                         // soft crown edge (~1-2 px at 10 px cells)
  }
  float z=ib>=0?sqrt(max(1.-dot(tb,tb)/(rc*rc),0.)):0.;
  nO=ib>=0?normalize(tb/rc*uCX.w+N0*(z+.4)):N0;                   // rounded cap: the normal follows the crown surface (flattened toward the rim: no hard dark slivers)
  if(b2>-8.){ float z2=sqrt(max(1.-dot(t2,t2)/(r2*r2),0.)); nO=normalize(mix(normalize(t2/r2*uCX.w+N0*(z2+.4)),nO,smoothstep(0.,.14*rc,best-b2)*.5+.5)); }   // where two crowns meet: soft occlusion edge (half blend over ~.14 R of height)
  // (r10c) cauliflower: each crown is a heap of branch lobes (~1/3 of the crown, >= ~3.5 px), not a smooth cap
  { vec3 lg=noised3(p*(2./cs)+cb*17.).yzw; nO=normalize(nO+(lg-nO*dot(lg,nO))*uCX.y*cov); }   // uCX.y (URL cx1) lobe strength; uCX.w (cx3) cap curvature
  // cast shadows: sun ray from the visible point (crown surface or gap floor) through the neighbouring crowns (sphere tests)
  vec3 P=N0*(ib>=0?best:0.);
  shv=1.;
  for(int k=uZero;k<8;k++){
    if(k==ib||Cc[k].w==0.) continue;
    vec3 v=Cc[k].xyz-P; float tp=dot(v,uSun);
    if(tp<=0.) continue;
    float dd=dot(v,v)-tp*tp, R=Cc[k].w;
    shv*=1.-.92*smoothstep(R*R,R*R*.45,dd);
  }
  float und=ib>=0?smoothstep(-.1,-.75,tb.y/rc)*(1.-abs(N0.y)):0.;   // (r10c) on the walls the lower part of each crown is its own shaded underside (uCG.z, URL cg2)
  tone=mix(uCC.z,mix(.9+.2*cb,.7+.6*cb,uVA.w)*mix(.9,1.,z)*(1.-uCG.z*und),cov);                  // gap floor (understory in the crowns' shade) .. crown, foot a touch darker ((r10c) .8-1.2 / .82 rim: flat-toned discs with dark rims read as pebbles; the light and the cast shadows carry the form)
  cid=cb;
}
void crownClusters(vec3 p, vec3 Ns, inout vec3 N, inout float tone, inout float shv, inout float cid, float w){   // Ns: smooth surface normal (the crowns sit on it)
  if(w<=.001) return;
  float kf=log2(max(gPix*9./uCX.x,1.)), k0=floor(kf), fk=smoothstep(.4,1.,fract(kf));
  float cs=uCX.x*exp2(k0);   // (r10c) 3.4 -> 6 m: crowns of real trees (5-9 m) where they are resolved; cells >= ~9 px further out (crowns ~7-14 px across)
  vec3 n0; float t0, s0, c0; crownCl1(p,Ns,n0,t0,s0,c0,cs);
  if(fk>0.){ vec3 n1; float t1, s1, c1; crownCl1(p+11.7,Ns,n1,t1,s1,c1,cs*2.); n0=normalize(mix(n0,n1,fk)); t0=mix(t0,t1,fk); s0=mix(s0,s1,fk); c0=fk>.5?c1:c0; }
  N=normalize(mix(N,normalize(n0+(N-Ns)*.5),min(w,1.))); tone*=mix(1.,t0,w); shv*=mix(1.,s0,min(w,1.)); cid=c0;   // the finer leaf-cluster bumps ride on the crowns at half strength ((r10c) the shadow / id assignments were commented out by mistake)
}
// offset of p from the centre of its spray dome (same cells as sprayDome in v3_geo), as a unit vector:
// the leaves of one cluster face outward together, so every ~1 m cluster has a lit and a shaded side
vec3 sprayN(vec3 p, float cs){
  vec3 q=p/cs, n=floor(q), f=fract(q);
  float d1=8.; vec3 rb=vec3(0,-1,0);
  for(int k=uZero;k<8;k++){
    vec3 o=vec3(k&1,(k>>1)&1,(k>>2)&1)+step(.5,f)-1.;
    vec3 r=o+.2+.6*hash33(n+o)-f;
    float d=dot(r,r);
    if(d<d1){ d1=d; rb=r; }
  }
  return normalize(-rb+vec3(0,.15,0));
}
// coherent foliage normal of a crown: mass (branch tip) -> leaf cluster (2.2 m) -> spray (1 m), each level only once resolved
vec3 crownN(vec3 p, vec3 massOff){
  vec3 n=normalize(massOff+vec3(0,.3,0));
  float f1=lodF(2.2), f2=lodF(1.05)*clamp((.3-gPix)*10.,0.,1.);
  if(f1>0.) n+=sprayN(p+7.1,2.2)*.55*f1;
  if(f2>0.) n+=sprayN(p+noised3(p*.8).yzw*.3,1.05)*.9*f2;
  return normalize(n);
}
const vec3 FOLG=vec3(.9,.8,.64);   // (r7 forest) B .70 -> .64: limier sunlit tops, greener shade   // olive balance of the foliage palettes (refs: R ~ G in lit tones, but less yellow / saturated than lime)
float gNau=0., gInw=1.;
float gCCid=.5;   // (r10 canopy) crown id of the crown-cluster layer at the shaded point (warm / yellow-green crowns)   // gInw: inner faces of the crown seen through the gaps (set by the caller)
vec3 foliage(float seed, vec3 pos, float hgt, bool shrub){
  vec3 c=shrub?shrubTone(fract(seed*7.31))*(.9+.2*fract(seed*13.7)):treeTone(seed,pos);
  if(shrub) c=mix(c,vec3(.036,.058,.021)*(.75+.5*fract(seed*13.1)),gNau);   // naupaka: glossy mid green
  c*=.84+.32*fract(gClId*7.7);                              // cluster to cluster
  { float lv=fract(gLeafId*9.13); c*=mix(vec3(1.),(.76+.48*lv)*mix(vec3(.96,.98,1.04),vec3(1.06,1.05,.86),lv),gLeafW); }   // leaf to leaf (r5: wider, the lighter leaves a touch yellower: lime highlights)
  float occ=smoothstep(-.32,.0,gDe);                        // deep inside the crown: dark
  float top=clamp(gClOff.y*.5+.5,0.,1.);                    // top of each cluster catches light, underside dark
  // baked self-occlusion: depth in the crown, mass top / underside, leaf-cluster crevices, height in the crown, leaves
  // further in, inner faces seen through gaps. The product is floored: the factors overlap physically (no black crush).
  float ao=mix(.32,1.,occ)*mix(mix(.55,.8,smoothstep(.3,.8,gPix)),mix(1.08,1.28,smoothstep(.3,.8,gPix)),top)*clamp(gSpr,.25,1.3)*(.78+.36*hgt)*mix(1.,.7,gInner)*gInw;
  float nr=1.-smoothstep(.15,.4,gPix);                       // near crowns: light scattered between the leaf clusters lifts the mid-tones (r5 / r4)
  c*=max(mix(ao,ao*.8+.2,nr),.31)*mix(1.,.9,smoothstep(.34,.1,ao));   // (r7 forest) .75/.25 floor .34: the crown interiors stayed mid-green (photos: near-black pockets)
  c*=mix(vec3(1.),vec3(1.04,1.03,.95),nr);   // (r7 forest) near lift (1.14,1.12,.98) -> (1.04,1.03,.95)                  // near: sunlit tropical leaves, a touch lighter / yellower than the far canopy LOD
  c*=mix(mix(vec3(.9,.97,1.15),vec3(.96,.99,1.04),nr),vec3(1.04,1.02,.93),top*(.4+.6*hgt));   // sun leaves on top yellower, shade leaves below deeper blue-green
  if(fract(seed*3.3)>.993) c=mix(c,vec3(.12,.04,.025),step(.85,fract(gClId*31.7))*.5*lodF(.8));   // ohia lehua blossoms (near only)
  c=mix(vec3(dot(c,vec3(.3,.6,.1))),c,mix(mix(.74,.88,smoothstep(.12,.3,gPix)),.93,smoothstep(.3,.9,gPix)))*mix(.92,1.,smoothstep(.12,.3,gPix));   // (r8f) near crowns (footprint < ~.2 m: v4 / v5 foreground) .88 -> .74 and x.92: they read chartreuse and bright (v5 lit fg L65 C50 vs photo L60 C41.5); unchanged from ~.3 m up (all aerial / distant views)   // (r8 forest) far 1. -> .93   // near: a touch less chroma (deep olive / blue-green, not lime); from afar the haze already greys it
  c=max(mix(vec3(dot(c,vec3(.3,.6,.1))),c,1.+uVC.z*smoothstep(.3,.9,gPix)),0.);   // (r11 veg) uVC.z (URL vc2): instanced crowns from the air more saturated (emerald-lime gorge floor)
  return c*FOLG*mix(1.,1.15,smoothstep(.3,1.,gPix));   // from afar: multiple scattering inside the crown brightens the canopy
}
vec3 shadeScene(vec3 pos, vec3 rd, float t, vec4 inf){
  float pk=uTan*2./uRes.y*pkDbg();
  gPix=t*pk; gVeg=t<uVegRange;
  gCCsh=1.; gCCid=.5; float yc=.5;   // (r10 canopy) yc: per-crown warm (yellow-green) factor 0..1
  float mat=inf.w;
  // (r9 side) canopy seen from the side. gSideF: view ray within ~5-13 deg of horizontal (boat / beach / valley views) at mid /
  // long range (footprint > ~.3 m); gNear: close up (footprint < ~.3 m, any direction). Both are 0 in every aerial view (views
  // 1 / 9: -rd.y > .26 and footprints > .5 m) and smooth. Trees grow upright: seen level, much of each crown's visible side is
  // its shaded flank and underside; from above, its lit top.
  float gNear=1.-smoothstep(.2,.4,gPix), gSideF=(1.-smoothstep(.08,.22,-rd.y))*(1.-gNear);
  if(uDbgM==71) return vec3(.05,.06,.03);   // (r9 side) timing: march only
  vec2 p=pos.xz;
  // foliage: normals filtered over ~1.2 px, so leaf-level light variation stays band-limited (no sparkle at a distance)
  // (r5 fix) rock: the relief octaves / albedo fades use the footprint stretched along grazing slopes (heightfield normal),
  // so the joint risers of a sloping face seen at a grazing angle no longer alias into fine horizontal hatching
  // (AO keeps the plain footprint: it compares distances with the surface actually hit)
  float rkAn=1.;
  if(mat<.5){ const float ea=1.5; vec3 Na=normalize(vec3(H(p-vec2(ea,0))-H(p+vec2(ea,0)),2.*ea,H(p-vec2(0,ea))-H(p+vec2(0,ea)))); rkAn=max(1.,sqrt(.35/max(dot(Na,-rd),.1))); }   // only on grazing faces (cos < .35), up to ~1.9x: the full 1/cos smeared the walls seen from the air into clay   // area-equivalent stretch (max ~3.2x): the full 1/cos smeared the walls seen from the air into clay
  gRkAn=rkAn;
  vec3 N=sceneNormal(pos,max(.012,gPix*((mat>.5&&mat<1.5)||(mat>2.5&&mat<3.5)?1.2:.5+uVE.w*smoothstep(.45,1.1,gPix)*(1.-gSideF))));   // (r11 veg) uVE.w (URL ve3): from the air the ground normal is filtered over ~a pixel more (the canopy / relief SDF detail under a pixel read as 1-px grain: v1 ridge 1-px energy 5.1 vs photo 3.6)
  gRkAn=1.;
  vec4 at=ATT(p), vm;
  { float h0=H(p), hx=H(p+vec2(1.2,0.))-h0, hz=H(p+vec2(0.,1.2))-h0; vm=VEG(p+vegWarp(pos,sqrt(hx*hx+hz*hz)/1.2)); }   // (r13 mat) as terrSD (vegWarp)
  float aoH=at.x, expo=at.z, flow=at.w;
  float gh=H(p);
  // foliage: AO from the coarse crown LOD (leaf-scale occlusion is baked into the albedo) -> half the shading cost
  float gpA=gPix; if(mat>.5&&mat<3.5||mat<.5&&vm.r>.5) gPix=max(gPix,.32);
  float aoS=uDbgM==11?1.:sceneAO(pos,N,mat>.5?.9:1.4);
  gPix=gpA;
  vec3 alb; float rough=.8, trans=0., spec=.2, wrap=0., vegW=0., selfSh=1.;   // selfSh: sun reaching a leaf through the rest of its own crown
  vec3 sheen=vec3(0);                                        // beach: sky mirrored in the water film on wet sand
  vec3 NshR=vec3(0,1,0); float wShR=0.;   // (r13 mat) the rock normal before the fracture facets: shadow rays start off the true surface
  vec3 sandFK=vec3(0);                                       // beach: correction of the sky fill on open sand (see the beach block)
  float sandW=0.;                                            // beach: sand weight (sky fill under cast shadows, see the lighting)
  if(mat<.5){
    float sw=inf.x;
    const float e=1.5;
    vec3 Ng=normalize(vec3(H(p-vec2(e,0))-H(p+vec2(e,0)),2.*e,H(p-vec2(0,e))-H(p+vec2(0,e))));
    float spray=(1.-smoothstep(1.,mix(6.,22.,expo),gh))*smoothstep(.3,.6,1.-Ng.y);
    gRkSea=smoothstep(.08,.35,expo);
    { const float e3=5.; float sx=H(p+vec2(e3,0.))-H(p-vec2(e3,0.)), sz=H(p+vec2(0.,e3))-H(p-vec2(0.,e3)); float sl10=sqrt(sx*sx+sz*sz)/(2.*e3); gRkSl=smoothstep(1.2,2.2,sl10); gRkSt=smoothstep(1.,2.2,sl10); gRkS10=smoothstep(.5,1.2,sl10); }
    if(uDbgM==62) return vec3(step(.35,expo),step(.55,expo),step(.75,expo))*.3;   // (r5 fix) debug: rock exposure bands (expo > .35 / .55 / .75)
    float vegG=vm.r*(1.-sw*.8);
    vegG=mix(vegG,smoothstep(.25,.6,vegG),.6);   // crisper moss / rock boundaries (no olive blend over the rock)
    // steep faces with thin cover: moss / fern patches and bare rock streaks running down the face (not a uniform blend)
    float stp=(1.-uVD.w*gSideF)*smoothstep(.3+uMG.x,.6+uMG.x,1.-Ng.y)*smoothstep(.97,.6,vm.r)*mix(.15,1.,smoothstep(.1,.4,expo));   // mostly on the seaward faces   (r10m) uMG.x (URL mg0): slope shift of the streak onset
    if(stp>0.){
      float mz=noise3(pos*vec3(.16,.035,.16)+3.)*.65+noise3(pos*vec3(.5,.12,.5)+8.)*.35*clamp(1.5-gPix,0.,1.);
      vegG=mix(vegG,clamp((vegG-.4)*2.+mz*.7+.45,0.,1.),stp);
    }
    float ledge=smoothstep(.55,.8,N.y)*sw*(1.-spray)*smoothstep(8.,30.,gh)*smoothstep(-.35,.25,noise3(pos*.045+6.));   // grassy ledges, others red soil
    float n1=noise3(pos*.15)*.5+.5;
    // (r9 side) the rock albedo only where it shows: fully vegetated ground (the final mix weight below is 1) skips it (cost)
    float wVegA=clamp(max(vegG,ledge*.85),0.,1.);
    gRkAn=rkAn; gRkRdY=rd.y; vec3 ra=uDbgM==72?vec3(.05):(wVegA<1.||uDbgM==76||uDbgM==80||uDbgM==82)?rockAlbedo(pos,N,spray):vec3(0);
    // (r13 mat) fractured columnar basalt (rkFracture), where the rock shows. uMA.x (URL ma0): strength; uMA.y (ma1): open joints
    //  near-black; uMA.z (ma2): weathered (oxidised) facets of the seaward rock red-brown, fresh breaks dark grey (warm lit faces,
    //  near-black shade: the v1 headland's red-brown against v9's near-black basalt)
    if(wVegA<1.&&uMA.x>0.){ const float e4=4.; vec3 Nf=normalize(vec3(H(p-vec2(e4,0))-H(p+vec2(e4,0)),2.*e4,H(p-vec2(0,e4))-H(p+vec2(0,e4))));
      vec3 N0=N; if(uMA.w!=1.) rkFracture(pos,Nf,N,uMA.x); N=normalize(mix(N0,N,1.-wVegA)); NshR=N0; wShR=1.-wVegA; if(uMA.w==2.) N=N0; if(uMA.w==3.) wShR=0.;
      ra*=gFrTn;
      { float lr=dot(ra,vec3(.3,.5,.2));   // weathered facets toward an oxidised red-brown, fresh breaks toward dark grey basalt, at the facet's own lightness
        vec3 fc=mix(vec3(.97,.98,1.03)*lr*.68,vec3(1.45,.95,.6)*lr*1.15,gFrWt);
        ra=mix(ra,fc,.6*uMA.z*gRkSea*min(uMA.x,1.)*(1.-spray));
        // (r13 mat) uMB.y (URL mb1): from the air, once the facets are only a few px (footprint > ~.65 m), each pixel integrates the
        //  countless small ledge tops with their red soil / iron crust (ref.png headland, footprint ~.9 m: red-brown, R-B 44); closer
        //  views resolve the fresh dark faces between them (r9, ~.6 m: near-black basalt, R-B 20). Steep views down only (level views
        //  keep their colour)
        ra=mix(ra,vec3(1.5,.93,.56)*lr*1.2,uMB.y*smoothstep(.3,.7,-rd.y)*smoothstep(.62,1.05,gPix*rkAn)*gRkSea*(1.-spray)); }
      ra*=1.-uMA.y*gFrCav; }
    gRkAn=1.;   // (r5 fix) shadows / later sceneSD calls use the plain footprint
    // slope / understory canopy: the same crown field as the geometry
    vec3 cc=canopyField(pos,canopyAnchor(pos,gh),vm.a); float cw_=gCanW, cAO=gCanAO;
    float cg=clamp(cc.x/max(cc.z,.01),0.,1.);
    // (r11 veg) the wall crowns seen level: the parabolic canopy domes are shallow caps, lit almost evenly (flat pale discs on olive:
    //  cobbles / camouflage). Their tangential normal is exaggerated toward a rounder crown, so each crown shows a lit sun side and
    //  a dark far side (the photos' forest crowns on the walls). uVD.x (URL vd0): gain
    { vec3 tN=N-Ng*dot(N,Ng); N=normalize(N+tN*uVD.x*gSideF*vegG*(1.-vm.b)); }                     // 0 = crease / gap between crowns, 1 = crown top
    float sk=speciesK(cc.y,pos);
    vec3 ga=mix(shrubTone(sk)*1.1,mix(forestTone(sk),vec3(.014,.032,.010),.1*(1.-vm.a))*mix(.84,.78,smoothstep(.1,.9,vm.a)),cw_)*(.8+.4*fract(cc.y*13.7));   // trees scattered in the fern carpet: darker
    // (r11 veg) steep walls (10 m slope > ~50 deg) carry forest crowns, not a fern / moss carpet: the shrub carpet's lime / straw
    //  palette on the walls read as lime moss on rock (v3 right wall veg C 27 h110 vs photo 20 h115). uVA.x / uVA.y (URL va0 / va1):
    //  share of the forest palette on the walls seen level / from above; uVA.z (va2): its brightness (forest tones are ~30 % darker)
    ga=mix(ga,forestTone(sk)*uVA.z*(.8+.4*fract(cc.y*13.7)),gRkS10*mix(uVA.y,uVA.x,gSideF)*(1.-cw_));
    vec3 ga0=ga;
    float ccW=smoothstep(.16,.32,gPix)*mix(uCC.y,uCC.x,gSideF)*vegG*(1.-vm.b)*(uDbgM==86?0.:1.);   // (r10 canopy) crown-cluster layer weight (mid / long range; URL cc0 level, cc1 aerial)
    if(uDbgM!=74){ foliageRelief(pos,1.); ga*=mix(1.,clamp(tSpr,.1,1.5),mix(clamp(2.2/gPix*.25-1.,0.,1.),1.,cw_)*(1.-.6*min(ccW,1.)));   // (r10 canopy) x(1-.6 ccW): the 1-2 m cluster crevices outlined every bump (cobbles) under the crown clusters   // carpet: tuft gaps only close up                   // dark gaps between leaf clusters / sprays
    float lwC=lodF(.15);
    if(lwC>0.){ leavesSD(pos,.17,5.,-1.); ga*=mix(1.,.72+.56*fract(tLeafId*9.13),lwC); }
    if(uDbgM==77||uDbgM==80||uDbgM==82){ float sw_; terrSD(pos,gh,sw_); } else gCarpIn=gCarpHit;   // (r9 side) the march's last evaluation at the hit (cost: one full terrSD with canopy + leaves less per pixel)
    if(uDbgM!=73) ga*=mix(1.,.2,gCarpIn);
    gLeafW=lwC*(1.-gCarpIn); leafyShade(pos,N,ga,.15,vegG*smoothstep(.2,.6,vm.r)*(1.-vm.b));
    { float tb=1.; clusterBumps(pos,N,tb,1.3,.35,vegG*(1.-vm.b)*smoothstep(.2,.32,gPix)*lodF(1.3)*.6*(1.-.7*min(ccW,1.)));   // leaf clusters of the carpet below the geometric LOD (r5: x.6, the speckle carries the fine structure: fewer outlined bubbles)
      clusterBumps(pos+17.3,N,tb,3.6,.55,vegG*(1.-vm.b)*smoothstep(.3,.6,gPix)*lodF(3.6)*.5*(1.-.7*min(ccW,1.))); ga*=tb; }   // (r10 canopy) x(1-.7 ccW): the crown clusters carry the clumps   // (r8 forest) .75 -> .5: from the air the slope light, not clump speckle, shapes the carpet   // from the air: shrub / crown clumps (~4 m) with lit tops and dark gaps
    // forest canopy close up: the leaves of each leaf cluster (2.2 m / 1 m, the clusters of foliageRelief) face outward
    // together -> lit and shaded clumps instead of smooth moss-covered bubbles
    if(vegG>.01&&gPix<.3){
      vec3 pf=pos+noised3(pos*.45+2.).yzw*.55;
      vec3 nc=N*.8+sprayN(pf+7.1,2.2)*.5*lodF(2.2)+sprayN(pf,1.)*.9*lodF(1.)*clamp((.3-gPix)*10.,0.,1.);
      N=normalize(mix(N,normalize(nc),mix(.25,.45,smoothstep(.06,.3,gPix))*vegG*(1.-vm.b)));   // (r5: .65 shaded every clump like a smooth ball: clay pebbles; close up the leaves keep more of their own tilt)
    }
    leafSpeckle(pos,N,ga,vegG*(1.-vm.b)*(1.-lodF(.36))*.8*(1.-.8*min(ccW,1.))); }   // (r10 canopy) x(1-.8 ccW): flat facet plates read as scales under the crown clusters   // (r5) leafy tufts at every distance where the leaf facets are no longer resolved
    float lfF=clamp(2.1-gPix*.6,0.,1.), lfS=clamp(2.2-gPix,0.,1.);   // (r7 forest) 1.5 -> 2.1: dark creases out to gPix ~1.8 (valley floor forest of view 1)   // crease darkening fades from afar: directional light and cast shadows shape the crowns (no bubble rims)
    float aoF=mix(.80,mix(mix(.5,.25,smoothstep(.3,.8,vm.a)),1.06,smoothstep(.0,.5,cg)),lfF);   // (r7 forest) gaps .56/.32 -> .5/.25    // forest: dark creases between crowns (self-occlusion); (r5) scattered crowns on the walls stand on the fern carpet, not in a deep crease: no dark outline round each one
    float aoC=mix(.94,mix(mix(.8,.93,uMC.x),1.03,smoothstep(.0,.5,cg)),clamp(2.4/gPix/5.-1.,0.,1.));    // shrub carpet: soft (r5: .72 -> .8 in the gaps: no cobblestone outlines)
    ga*=mix(aoC,aoF,cw_)*cAO;
    { float tb=1.; sideCrowns(pos,N,tb,(uDbgM==81||uDbgM==82||uCC.x>0.)?0.:gSideF*vegG*(1.-vm.b)); ga*=tb; }   // (r10 canopy) replaced by crownClusters when cc0 > 0
    { float tb=1.; gCCid=fract(cc.y*7.7); crownClusters(pos,Ng,N,tb,gCCsh,gCCid,ccW); ga*=tb; yc=gCCid; }   // (r9 side) crowns on the walls seen level: lit caps, shaded undersides, dark gaps
    ga=max(ga,ga0*.17);
    ga*=mix(vec3(1.),mix(vec3(.7,.76,.78),vec3(.5,.6,.6),uCW.w),smoothstep(.5,.9,vm.a)*smoothstep(.3,.9,gPix));   // (r10c) uCW.w (URL cw3): deeper emerald floor between the crowns of the closed forest seen from above (v1 valley box: L<20 4 % vs photo 14 %)   // (r8 forest) lower canopy / forest floor between the instanced crowns from the air: deep emerald gaps (ref.png valley median L23-38, ours L33-47)   // (r7 forest) .22 -> .17   // (r5) the stacked crevice factors overlap physically: floor them (no flat black voids in the understory)
    // terrain form drives the canopy tone: sunny yellow-green on spur crests, dark wet green in gullies
    float conv=at.y;
    // (r10f) the tint follows the spur / gully form at the ~16 m ring as well as the 7 m attribute: the r10 terrain flutes
    //  (14 / 28 m ribs, triangle profile) put every rib past the 7 m onset, so every rib turned sunny lime and every gully dark
    //  teal: lime moss on the v3 right wall / v2 ridge (veg C 29.7 vs photo 20.5) and a fine comb on the v1 ridges. uMG.z (URL
    //  mg2, 1): share of the tint that needs the 16 m convexity too (0 = r10m)
    float cv16=H(p)-.25*(H(p+vec2(16.,0.))+H(p-vec2(16.,0.))+H(p+vec2(0.,16.))+H(p-vec2(0.,16.)));
    ga=mix(ga,ga*vec3(1.35,1.3,1.0),smoothstep(.1,1.,conv)*mix(1.,smoothstep(.5,4.,cv16),uMG.z));
    ga=mix(ga,ga*mix(vec3(.62,.72,.68),vec3(.42,.52,.52),uVD.y),smoothstep(-.1,-1.,conv)*mix(1.,smoothstep(-.5,-4.,cv16),uMG.z));
    ga=mix(ga,ga*vec3(.75,.85,.8),smoothstep(.3,.9,flow)*.5);
    ga=mix(ga,vec3(.05,.04,.025),smoothstep(.4,.9,flow)*.25);
    if(!gVeg){   // distant LOD: the canopy as seen from afar
      float cl=fbm3(pos*.09,3);
      ga=mix(vec3(.075,.088,.036),vec3(.032,.046,.02),smoothstep(-.2,.6,flow+cl))*(1.+.45*cl);
    }
    ga=mix(vec3(dot(ga,vec3(.3,.6,.1))),ga,mix(mix(.76,.88,smoothstep(.12,.3,gPix)),.87,smoothstep(.3,.9,gPix)))*mix(.93,1.,smoothstep(.12,.3,gPix));   // (r8f) near carpet like the near crowns   // (r8 forest) far 1. -> .87: lit fern / canopy planes from the air were 20-40 % more chromatic than ref.png / r9 (neon moss)
    ga=max(mix(vec3(dot(ga,vec3(.3,.6,.1))),ga,mix(1.,.8+.5*fract(cc.y*41.7),smoothstep(.3,.9,gPix)*vegG)),0.);   // (r7 forest) crown to crown chroma from the air: distinct greens
    ga*=mix(vec3(1.),vec3(1.02,1.01,.94),(1.-smoothstep(.15,.4,gPix))*vegG);   // (r7 forest) (1.12,1.1,.97) -> (1.02,1.01,.94)   // near canopy: same lift as the instanced crowns
    ga*=mix(vec3(1.),vec3(1.1,1.03,.74),uCG.y*smoothstep(.55,.8,yc)*vegG);   // (r10 canopy) yellow-green crowns (hau, albizia, guava, fresh flush) among the deep greens (URL cg1)
    alb=mix(ra,ga*FOLG*mix(1.,1.15,smoothstep(.3,1.,gPix)),wVegA);
    alb=mix(vec3(dot(alb,vec3(.3,.6,.1))),alb,1.-gSideF*wVegA*mix(uFP.z,uVB.x,smoothstep(.6,1.2,gPix)));   // (r11 veg) uVB.x (URL vb0): the same cut for the far ridges seen level (v2 ridge veg C 22.5 vs photo 16.5)   // (r10f) uFP.z (URL fp2): wall vegetation seen level at near / mid range (footprint < ~1 m) less chromatic -- level-view wall greens ran ~1.3x the photos' chroma at equal L* (v3 right wall L* 50-60 C36 vs 28, v4 / v5 left walls C28 vs 20-23: lime moss); the far ridges (v2) and every aerial view are untouched
    // (r11 veg) red soil scars on the knife-edge crests (ref.png ridges): thin fern cover over iron-red soil on the sharpest convex
    //  crests (7 m and 16 m convexity), patchy along the crest. uVB.w (URL vb3): strength
    float scar=uVB.w*smoothstep(.5,1.5,conv)*smoothstep(1.,4.,cv16)*smoothstep(.1,.5,noise3(pos*vec3(.03,.012,.03)+17.)+.35*noise3(pos*.11+3.))*(1.-vm.b)*wVegA;
    alb=mix(alb,vec3(.078,.044,.023)*(.8+.4*n1),scar);
    vegW=clamp(vegG,0.,1.)*(1.-vm.b)*(1.-.8*scar);
    float tf=mix(1.,.7,smoothstep(.25,.8,gPix));   // a whole crown seen from afar transmits little: shaded sides stay dark (crisp crowns)
    wrap=.2*vegG*tf; trans=.9*vegG*(1.-vm.b)*tf;   // sun shining through the leaves of the canopy: warm yellow-green shaded sides
    float beach=vm.b*(1.-smoothstep(.25,1.,pos.y-gh)*smoothstep(.05,.3,vm.r));   // raised vegetation at the back of the beach stays green
    float wet=0.;
    // wet rock at the waterline: black and glossy (higher where the surf is heavier)
    float wetR=(1.-smoothstep(.8,2.2+5.*expo,pos.y+.6*noise3(pos*.4)))*(1.-vegG);
    rough=mix(mix(.88,.5,wetR),.85,vegG);
    spec=mix(.08,.6,max(wetR,spray*.25));
    if(beach>.01){
      // ---- coral sand: smooth large-scale normal, wind ripples, grain, wet / damp / dry foreshore, swash marks, wrack
      float sf=clamp(1.-gPix*8.,0.,1.), sf2=clamp(1.-gPix*30.,0.,1.);
      // the height field's 1.2 m bilinear facets read as terraces on a smooth beach: use a wide bicubic normal
      const float es=2.4;
      vec3 Ns=normalize(vec3(Hc(p-vec2(es,0))-Hc(p+vec2(es,0)),2.*es,Hc(p-vec2(0,es))-Hc(p+vec2(0,es))));
      // footprint on the sloping sand, stretched at grazing views (lines / grain must stay band-limited there)
      float gpx=gPix/max(dot(Ns,-rd),.06);
      // recent run-up limit: the highest swashes of the last minutes (swash() reaches ~.3-.7 m), lobate / cuspate
      // along the beach. Below it the sand is saturated and glossy (the foam front of the current swash always
      // lies on wet sand), above it the sand dries over a few metres to a soft, ragged damp / dry edge
      // beach cusps: rhythmic crescents (~20-30 m along the shore, global shore frame) -- the swash runs further up
      // in the bays than over the horns, so every wet / damp edge and swash line is a chain of arcs, not a ruler line
      vec2 sdr=normalize(uShore+vec2(1e-4)), stn=vec2(-sdr.y,sdr.x);
      float sAl=dot(p,stn);
      float cu=fract(sAl/(25.+6.*noise3(vec3(p*.008,2.)))+.35*noise3(vec3(p*.011,4.))), bay=1.-(2.*cu-1.)*(2.*cu-1.);
      float wl=.72+.1*noise3(vec3(p*.045,1.))+.16*(bay-.65)+.05*noise3(vec3(p*.16,5.))+.02*noise3(vec3(p*.5,2.))*sf;
      float z=gh/wl;                                                    // 0 still-water line .. 1 recent run-up limit
      float wet=1.-smoothstep(.72,1.06,z+.07*noise3(vec3(p*1.1,6.))*sf);
      float gloss=1.-smoothstep(.3,1.,z+.15*noise3(vec3(p*.6,3.)));
      // the damp / dry edge wanders more (older run-ups, ~10-40 m lobes) and is ragged at the metre scale
      float damp=1.-smoothstep(1.,1.6,z+.35*noise3(vec3(p*.06,4.))+.18*noise3(vec3(p*.21,4.))+.1*noise3(vec3(p*.9,7.))*sf);
      vec2 wd=normalize(vec2(.8,.6));
      float rp=dot(p,wd)*9.+noise3(vec3(p*.6,1.))*6.+noise3(vec3(p*2.,3.))*1.5;
      float ripple=sin(rp)*(1.-damp)*smoothstep(-.3,.4,noise3(vec3(p*.15,7.)));
      vec4 dim=noised3(vec3(p*1.4,5.));                          // soft dimples (old footprints, wind scours)
      vec4 dim2=noised3(vec3(p*3.1,8.));
      float trod=smoothstep(.15,.6,noise3(vec3(p*.12,4.))*.5+.5)*(1.-damp);   // trampled areas up the beach
      vec3 gsn=vec3(wd.x,0.,wd.y)*ripple*.2*sf*(1.-trod)+(vec3(dim.y,0.,dim.w)*(.05+.07*trod)+vec3(dim2.y,0.,dim2.w)*.05*trod)*sf*(1.-wet*.8);
      gsn+=vec3(noise3(vec3(p*40.,1.)),0.,noise3(vec3(p*40.,2.)))*.06*sf2*(1.-wet);   // grain
      // warm cream coral sand (r4, r9, ref.png). The albedo is set for the displayed tone: a "physical" .45 albedo
      // lands in the ACES shoulder and comes out neutral white with every tone step flattened; at this level the
      // dry sand still reads near-white cream while the damp / wet / shaded tones keep their warmth and steps.
      // Paler and yellower patches (~10-30 m), faint grey streaks of heavy minerals
      float tn=noise3(vec3(p*.08,9.))*.5+.5, tn2=noise3(vec3(p*.35,2.)), tn3=noise3(vec3(p*.023,5.))*.5+.5;
      vec3 sa=mix(vec3(.298,.222,.165),vec3(.33,.255,.192),smoothstep(.25,.85,tn));
      sa*=mix(vec3(1.02,.99,.95),vec3(.97,1.,1.05),smoothstep(.3,.75,tn3));   // whiter / more golden stretches along the beach
      sa*=.93+.06*tn2+.06*noise3(vec3(p*6.,4.))*sf;
      sa=mix(sa,sa*vec3(.86,.85,.85),smoothstep(.55,.9,noise3(vec3(p*vec2(.04,.3),3.))*.5+.5)*.4);
      sa*=1.-.1*trod*(.5+.5*noise3(vec3(p*.9,2.)));             // trampled sand: churned, a little darker / rougher
      sa=mix(sa,sa*vec3(.86,.85,.84),damp*.75);                   // damp sand below the dry upper beach
      // saturated sand: darker tan (the film adds the sky sheen). From the air (> ~.3 m/px) the band also holds the
      // unresolved swash film, bubble lace and glints of the last swashes: on average it is only a little darker
      // (ref.png, r9 -- a full-strength dark band read as a brown outline drawn along the waterline)
      sa=mix(sa,sa*vec3(.66,.64,.63),wet*(1.-.55*smoothstep(.2,.8,gPix)));   // (r4: wet ~215/195/173, a neutral beige)
      // backwash streaks on the glossy lower foreshore: the draining film leaves faint cross-shore streaks / rills
      // (~1-3 m apart along the shore), glossier and matter strips; faded out before they get below ~4 px
      float bwF=clamp(1.3-gPix*4.,0.,1.)*gloss;
      float strk=noise3(vec3(sAl*.6+1.2*noise3(vec3(p*.12,2.)),dot(p,sdr)*.09,6.));
      sa*=1.+.07*strk*bwF;
      gloss*=1.-.45*smoothstep(-.2,.5,strk)*bwF;
      // swash marks: thin cuspate lines of bubbles / fine shell grit left where earlier swashes turned back, mostly
      // around the recent run-up limit; faded to their mean once they are thinner than the (grazing) footprint
      // each line is a chain of arcs (its own cusp spacing / phase), measured as a horizontal distance on the slope
      float sm=0., smB=0.;
      float slp=max(length(Ns.xz)/max(Ns.y,.3),.04);
      for(int k=uZero;k<4;k++){
        float fk=float(k);
        float cuk=fract(sAl/(17.+5.*fk+4.*noise3(vec3(p*.01,fk*5.3)))+.4*noise3(vec3(p*.013,fk*2.7))+fk*.37), bk_=1.-(2.*cuk-1.)*(2.*cuk-1.);
        float lv=.42+.24*fk+.25*bk_+.06*noise3(vec3(p*.07,fk*3.1));
        float wln=k<2?.18:.06;                                   // low: lace of bubbles / foam remnants; high: fine grit lines
        float dh=abs(z-lv)*wl/slp;                               // horizontal distance from the line
        float lw=wln+gpx*.6;
        float ln=(1.-smoothstep(.0,lw,dh))*min(wln/lw*1.3,1.)*smoothstep(.3,.65,noise3(vec3(p*.06,fk*7.))*.5+.5)*mix(1.,smoothstep(.25,.6,noise3(vec3(p*.7,fk*3.3))*.5+.5),sf);   // broken, patchy
        if(k<2) smB=max(smB,ln); else sm=max(sm,ln);
      }
      sa=mix(sa,vec3(.15,.13,.105),sm*.3);
      sa=mix(sa,vec3(.42,.41,.39),smB*.35*(.4+.6*wet));
      // wrack line: dark seaweed, coral rubble, lava pebbles along the high-water mark (near the berm crest)
      float wrack=smoothstep(.12,0.,abs(gh-1.15-.2*noise3(vec3(p*.2,3.))))*smoothstep(.55,.8,noise3(vec3(p*1.7,6.))*.5+.5);
      sa=mix(sa,vec3(.045,.038,.03),wrack*.6*sf);
      // back of the beach: leaf litter, twigs, lava pebbles and husks along the vegetation line; the sand there is
      // greyer (organic matter, shade)
      float bk=(1.-smoothstep(.55,.97,vm.b+.15*noise3(vec3(p*.13,8.))))*smoothstep(1.,1.6,gh);
      float lit=smoothstep(.62,.8,noise3(vec3(p*2.3,9.))*.5+.5+.12*noise3(vec3(p*.4,1.)))*clamp(1.-gPix*4.,0.,1.);
      sa=mix(sa,sa*vec3(.72,.7,.68),bk*.7);
      sa=mix(sa,vec3(.05,.042,.032),bk*lit*.75);
      // the edge of the swash: the bore front runs out to a thin lacy line of foam on the wet sand (and leaves
      // bubbly streaks) -- partly translucent, never a painted solid line
      // (a continuous line of bubbles whose density only wavers along it -- thresholded foam lace broke it into a
      // dashed white line at grazing views; its width is band-limited by the footprint)
      float swF=0.;
      if(gh<1.2){
        vec3 swv=swash(p,gh); float fd_=swv.y-gh, upr=1.-smoothstep(.35,.7,swv.z);
        float hF=(-fd_-.008)/slp;                                // horizontal distance from the bubble line (m)
        float wF=.1+.08*upr, lwF=wF+gpx*.6;
        float lace=mix(.75,.35+.65*smoothstep(.25,.75,noise3(vec3(p*1.6,9.))*.5+.5),clamp(1.-gpx*2.,0.,1.))*(.6+.4*smoothstep(-.4,.3,noise3(vec3(p*.18,3.))));
        swF=exp(-hF*hF/(lwF*lwF))*min(wF/lwF*1.3,1.)*lace*smoothstep(.02,.15,swv.y)*(.45+.55*upr);
        // the film just behind the front: a glossy sheet thinning onto the sand
        wet=max(wet,1.-smoothstep(-.01,.04,-fd_));
        sa=mix(sa,vec3(.6,.6,.58),swF*.8);
        wet=max(wet,swF);
      }
      if(uDbgM==61) return vec3(swF,wet,damp)*.3;
      alb=mix(alb,sa,beach);
      vec3 Nsd=normalize(Ns+gsn);
      N=normalize(mix(N,normalize(mix(Nsd,Ns,gloss*.8)),smoothstep(0.,.35,beach)));   // the water film smooths the micro relief
      rough=mix(rough,mix(.8,.12,wet),beach);
      spec=mix(spec,mix(.3,.9,wet),beach);
      // the water film on saturated sand mirrors the sky (Fresnel: strong at grazing views) -- glossy, pale, cool
      vec3 Rw=reflect(rd,Ns); float Fw=.02+.98*pow(1.-max(dot(Ns,-rd),0.),5.);
      sheen=skyCol(normalize(vec3(Rw.x,max(Rw.y,.02),Rw.z)))*Fw*(gloss*.26+wet*.05)*beach;
      // sky fill on open sand: the teal skyFill is tuned for canopy / rock; a bright open beach also gets warm bounce
      // from the sunlit sand and cliffs around it, and sand at the cliff foot sees much less sky (cliff shadow at the
      // west end of the beach: warm grey like ref.png, not a cyan-grey flat)
      sandFK=(vec3(1.45,1.,.85)*mix(1.,aoH,.6)-1.)*beach; sandW=beach;
    }
    alb=mix(alb,alb*vec3(.38,.4,.44),max(wetR,1.-smoothstep(.0,.8,gh))*(1.-beach));
  } else if(mat<1.5){
    vec4 i2; treesSD(pos,i2);                                 // refresh the crown shading hints
    gInw=mix(1.,mix(.55,1.,smoothstep(-.35,.25,dot(N,normalize(pos-gCrC.xyz)))),lodF(.5));   // inner faces of the masses, seen through the gaps: the dark crown interior
    yc=fract(inf.x*17.3); alb=foliage(inf.x,pos,inf.z,false); alb*=mix(vec3(1.),vec3(1.1,1.03,.74),uCG.y*smoothstep(.55,.8,yc));
    // (r12 walls) uWB.w (URL wb3): the instanced crowns of the valley floor seen from above a deeper, less lime green (v1 floor median
    //  L* 34 vs photo 23, lit C 43 vs 31: a lime orchard, not a closed forest)
    { float aWt=smoothstep(.4,.9,gPix)*(1.-gSideF); alb=mix(vec3(dot(alb,vec3(.3,.6,.1))),alb,1.-.15*uWB.w*aWt)*(1.-.2*uWB.w*aWt); }
    trans=mix(1.2,.7,smoothstep(.25,.8,gPix)); wrap=mix(.2,.12,smoothstep(.25,.8,gPix)); rough=mix(.48,.6,smoothstep(.05,.3,gPix)); spec=mix(.24,.1,smoothstep(.05,.3,gPix));   // glossy leaves glint in the sun (near)
    N=normalize(mix(N,crownN(pos+inf.x*31.,gClOff),mix(.36,.62,smoothstep(.06,.3,gPix))));
    { float fcN=smoothstep(.35,.9,gPix); if(fcN>0.) N=normalize(mix(N,normalize(pos-gCrC.xyz+vec3(0.,.4*gCrC.w,0.)),.66*fcN)); }   // (r8 forest) .72 / .3R -> .66 / .4R: a little flatter crown tops from the air   // (r7 forest) from the air: whole-crown shading (lit sun side, dark far side), not per-mass pixel noise   // leaves of a mass face roughly the same way: coherent lit / shaded masses, little per-leaf speckle (r5: close up the real leaves keep more of their own tilt: no smooth clay balls)
    if(uDbgM!=75){ float tb=1.; clusterBumps(pos+inf.x*7.,N,tb,1.4,.35,smoothstep(.24,.34,gPix)*lodF(1.4)); clusterBumps(pos+inf.x*5.,N,tb,2.6,.6,smoothstep(.3,.6,gPix)*lodF(2.6)); alb*=tb;    // far crown LOD: leaf clusters / branch lobes as bumps
    gLeafW*=1.-gInner; leafyShade(pos+inf.x*13.,N,alb,.16,1.);
    leafSpeckle(pos+inf.x*13.,N,alb,(1.-lodF(.36))*.7); }   // (r5)
  }
  else if(mat<2.5){ alb=vec3(.07,.06,.05)*(.8+.4*noise3(pos*vec3(3.,.4,3.))); rough=.8; }
  else if(mat<3.5){
    vec4 i2; bushSD(pos,i2);
    gNau=smoothstep(.01,.06,vm.b);                            // naupaka / beach heliotrope at the edge of the sand
    gInw=mix(1.,mix(.5,1.,smoothstep(-.35,.25,dot(N,normalize(pos-gCrC.xyz)))),lodF(.3));
    alb=foliage(inf.x*1.7+.3,pos,inf.z,true); trans=1.; wrap=.3; rough=.65; spec=.08;
    N=normalize(mix(N,crownN(pos+(inf.x*1.7+.3)*31.,gClOff),mix(.28,.5,smoothstep(.06,.3,gPix))));   // (r5: close up less of the smooth mass normal: leafy, not pebbles)
    { float tb=1.; clusterBumps(pos+inf.x*7.,N,tb,1.1,.35,smoothstep(.24,.34,gPix)*lodF(1.1)); alb*=tb; }
    gLeafW*=1.-gInner; leafyShade(pos+inf.x*13.,N,alb,.13,1.);
    leafSpeckle(pos+inf.x*13.,N,alb,(1.-lodF(.36))*.7);   // (r5)
  } else if(mat<4.5){
    // coconut fronds: glossy yellow-green leaflets, older fronds yellower / browner, yellow rachis
    vec4 i2; treesSD(pos,i2); vec4 fr=gFrW;
    if(uDbgM==56) return vec3(fr.x,fr.w,step(.5,fract(fr.z*7.)))*.3;
    float ph=fract(inf.x*5.7); yc=ph;
    alb=mix(vec3(.050,.060,.014),vec3(.094,.098,.021),fract(fr.y*3.7+ph));   // olive-green .. yellow-green fronds
    alb*=mix(mix(.6,1.,smoothstep(-.2,.3,N.y)),1.,smoothstep(.1,.4,gPix));   // undersides of the leaflets darker (near only) (r5: .45 -> .6: the thin leaflets glow through, no black serrations)
    alb*=.85+.3*fr.z;                                                     // leaflet to leaflet
    alb=mix(alb,vec3(.10,.085,.035),smoothstep(.72,.86,fr.y)*.6);           // ageing fronds
    alb=mix(alb,vec3(.075,.056,.032),smoothstep(.9,.96,fr.y)*.9);           // dead brown fronds hanging in the crown
    // each frond is a tent of hanging leaflets: the top along the rachis catches the sun (yellow), the hanging tips sit in
    // the shade of the leaflets above them (darker, greener)
    alb*=mix(1.12,.84,smoothstep(.1,1.,fr.w));
    alb=mix(alb,alb*vec3(1.15,1.05,.7),(1.-smoothstep(0.,.5,fr.w))*.6);
    alb=mix(alb,vec3(.13,.115,.05),smoothstep(.06,0.,fr.w)*step(.001,fr.x)); // rachis
    alb*=mix(.4+.6*smoothstep(.0,.4,fr.x),1.,smoothstep(.1,.4,gPix));  // shaded frond bases in the crown (near only)
    if(fr.x==0.) alb=mix(vec3(.07,.06,.035),vec3(.06,.07,.02),smoothstep(.1,.4,gPix));   // crown shaft / nuts
    alb*=mix(1.,.55*mix(.7,1.25,fract(inf.x*17.31)),smoothstep(.3,.8,gPix));   // aerial star crowns: self-shadowed fronds read darker (r5: palm to palm tone)
    alb=mix(vec3(dot(alb,vec3(.3,.6,.1))),alb,mix(.74,1.,smoothstep(.12,.3,gPix)))*mix(.92,1.,smoothstep(.12,.3,gPix));   // (r8f) near fronds: olive yellow-green, not chartreuse (v4 / v5 near palms)
    alb*=mix(vec3(1.),vec3(1.05,1.,.8),uVC.x*(1.-smoothstep(.12,.4,gPix)));   // (r11 veg) uVC.x (URL vc0): near fronds a touch warmer (v5 lit fg h107 vs photo 104)
    // (r12 walls) uWC.x (URL wc0): depth in the near palm crowns (the v5 / v4 palms read as flat pale-lime plastic: v5 palm boxes median
    //  L* 27 vs photo 19, mid 60/67/26 vs 46/49/12). The fronds of the lower, drooping whorl hang in the shade of the spreading whorl
    //  above, the frond bases sit in the dark crown interior, the leaflet undersides are dark olive-brown; the outer leaflets of the
    //  upper whorl stay lit. Close up only (footprint < ~.3 m; the aerial star crowns keep their look). uWC.y (URL wc1): the shaded
    //  frond tones warmer (olive-brown, not mint)
    float nrP=(1.-smoothstep(.12,.35,gPix))*uWC.x;
    if(nrP>0.){ vec3 qc=pos-gPalmC.xyz; float fl_=max(gPalmC.w,1.);
      float below=smoothstep(.05*fl_,-.5*fl_,qc.y);                   // under the crown top: the drooping whorl
      float inner=(1.-smoothstep(.12,.55,fr.x))*step(.001,fr.x);      // frond bases: the crown interior
      float und=1.-smoothstep(-.35,.25,N.y);                           // leaflet undersides
      float dk=mix(1.,.45,below)*mix(1.,.35,inner)*mix(1.,.55,und)*mix(1.,.6,smoothstep(.35,1.,fr.w))*(.62+.65*fr.z*fr.z)*mix(1.,1.15,smoothstep(.55,.95,fr.x)*(1.-below));   // + leaflet tips hanging in the shade of the leaflets above, leaflet to leaflet (some turned into the shade)
      alb*=mix(1.,dk,nrP);
      alb=mix(alb,alb*vec3(1.06,.97,.72),uWC.y*nrP*(1.-dk)); }
    trans=mix(1.1,.55,nrP); wrap=mix(.2,.05,nrP); rough=.32; spec=.5;     // waxy leaflets: bright sun glints   ((r12 walls) close up the shaded fronds glow less: dark interior)
    N=normalize(mix(N,vec3(0,1,0),.5*smoothstep(.4,.8,gPix)));          // (r5) aerial star cap: the fronds radiate and face up all round the crown, it is not a lit / shaded dome (every palm was the same half-lit fan)
    // the palm crown as a leafy volume: fronds on the far side of the crown from the sun sit in the shade of the others
    { vec3 q=pos-gPalmC.xyz; float r=gPalmC.w*.8, b=dot(q,uSun), c=dot(q,q)-r*r, ds=b*b-c; float dS=ds>0.?max(-b+sqrt(ds),0.):0.; selfSh=mix(mix(mix(.5,.3,nrP),.72,smoothstep(.4,.8,gPix)),1.,exp(-dS*(.16+.25*nrP))); }   // (r5: from the air the shaded half of every rosette was black: half-star stamps)   ((r12 walls) close up: deeper crown self-shadow (nrP))
  }
  else {
    // palm trunk: pale grey with leaf-scar rings, darker weathered foot, lichen patches
    float ring=1.-.35*smoothstep(.75,.95,fract(pos.y/.16+.3*noise3(pos*2.)))*lodF(.16);
    alb=vec3(.105,.096,.082)*ring*(.8+.3*noise3(pos*vec3(3.,.7,3.)));
    alb=mix(alb,vec3(.15,.148,.13),smoothstep(.3,.7,noise3(pos*vec3(1.5,.4,1.5)))*.5);
    alb*=mix(.6,1.,smoothstep(0.,2.5,pos.y-gh));
    rough=.8;
  }
  if(uDbgM==5) return N*.5+.5;
  if(uDbgM==14) return vec3(vm.a,vm.r*.5,vm.g);
  if(uDbgM==64) return vec3(at.w,max(at.y,0.),max(-at.y,0.))*.4;
  if(uDbgM==15) return vec3(vm.r<.3?1.:0.,vm.r>.7?1.:0.,(vm.r>=.3&&vm.r<=.7)?1.:0.)*.25;
  if(uDbgM==7){ vec3 q=pos+N*3.; float sw; float dt0=terrSD(q,H(q.xz),sw); vec4 i1,i2; float dt1=treesSD(q,i1), dt2=bushSD(q,i2);
    return vec3(dt0<0.?1.:0., dt1<0.?1.:0., dt2<0.?1.:0.)*.8+vec3(.1); }
  if(uDbgM==6) return vec3(aoS,aoH,0.);
  if(uDbgM==3) return vec3(inf.w/5.,(isnan(inf.w)||isinf(inf.w))?1.:0.,(isnan(N.x)||isnan(aoS))?1.:0.)+(isnan(alb.x)?vec3(1,0,1):vec3(0));
  if(uDbgM==1) return vec3(mat==0.?1.:0.,mat==1.||mat==3.?1.:0.,mat==4.?1.:0.)*.5*aoS;
  // ---------- lighting
  float shRange=uDbgM==8?0.:(t<500.?45.:(t<1400.?20.:(t<uVegRange?16.:0.)));   // (r7 forest) crowns shade their neighbours out to the vegetation range (the far valley forest had no crown shadows: flat, milky)
  if(uDbgM==9) return alb*(.3+.7*max(dot(N,uSun),0.));
  gShStart=(mat>.5&&mat<1.5)||(mat>2.5&&mat<3.5)?1.6:.06;   // foliage: skip the LOD crown it sits in
  // vegetated ground: light with a normal pulled toward the large-scale terrain so whole faces read lit / shaded
  // (the canopy bumps keep some texture), and start the shadow ray above the canopy bumps
  vec3 Nl=N;
  float fAir=smoothstep(.35,1.2,gPix);
  bool folI=(mat>.5&&mat<1.5)||(mat>2.5&&mat<3.5);
  if((mat<.5&&vegW>0.)||(folI&&fAir>0.)){
    float eb=mix(5.,uVB.z,fAir*(1.-gSideF));   // (r11 veg) uVB.z (URL vb2): span of the slope normal from the air
    vec3 Nb=normalize(vec3(H(p-vec2(eb,0))-H(p+vec2(eb,0)),2.*eb,H(p-vec2(0,eb))-H(p+vec2(0,eb))));
    // (r8 forest) from the air the slope-scale sun term dominates: canopy .5 and instanced crowns .35 toward the 5 m terrain normal
    // (sunlit faces read as continuous lime planes, shaded gullies as one deep shade, not crown-scale speckle)
    float wN=mat<.5?vegW*mix(clamp(.15+gPix*.2,.15,.28)*mix(1.,.55,smoothstep(.3,.8,vm.a)),mix(uVB.y,.5,gSideF),fAir)*mix(1.,.35,gSideF):mix(.28,.15,gSideF)*fAir;   // (r9 terrain) from the air .5 / .15 -> .62 / .28: the new fin flanks read as whole lit / shaded planes; (r9 side) seen level the crowns, not the slope, carry the light (r9m: the side values .5 / .15 x.35 kept where gSideF = 1)
    Nl=normalize(mix(N,Nb,wN));   // (r7 forest) closed forest: crowns keep their own lit / shaded sides
    // (r12 walls) uWB.x (URL wb0): seen level at mid / long range (footprint > ~.3 m) the wall canopy follows the slope light as well:
    //  whole spurs read lit and the gullies shaded (the v5 / v4 / v3 walls read as an even lumpy olive: the crown normals spread every
    //  face over lit and shaded alike)
    if(mat<.5) Nl=normalize(mix(Nl,Nb,uWB.x*gSideF*smoothstep(.25,.8,gPix)*vegW));
  }
  float sh=uDbgM==12?1.:uDbgM==13?shadowH(pos+N*.5,uSun):shadow(pos+(wShR>0.?normalize(mix(Nl,NshR,wShR)):Nl)*(max(.05,gPix*mix(1.5,1.,vegW*smoothstep(.4,1.,gPix)))+vegW*(.3+gPix*mix(.6,.4,smoothstep(.4,1.,gPix)))),uSun,shRange);   // (r7 forest) far canopy: start ~2 m (was ~3 m) above the crowns, so neighbouring crowns cast their shadows into the gaps
  float shG=gShG;
  sh*=selfSh*gCCsh;   // (r10 canopy) gCCsh: cast shadows of the unresolved crowns (crownClusters)
  float NdL=dot(Nl,uSun);
  if(uDbgM==40) return vec3(sh,max(NdL,0.),0.)*.25;
  float dif=max((NdL+wrap)/(1.+wrap),0.);
  // rough canopy seen from afar: leaves and crowns shade each other below the pixel footprint
  // (lit fraction < 1, falling off at grazing sun). Ground canopy always; instanced foliage once leaves are sub-pixel.
  float fol=(mat>.5&&mat<1.5)||(mat>2.5&&mat<4.5)?1.:0.;
  float vegL=max(vegW,fol);
  float canopy=mat<.5?vegW:fol*smoothstep(.03,.4,gPix);
  float cFar=smoothstep(.3,.8,gPix);
  float aW=cFar*(1.-gSideF);   // (r9f) the canopy LOD seen from above (not the level views' side-on crowns)
  // (r9f) seen from above at long range (footprint > ~.5 m, not the level views' side-on crowns) a canopy on a half-lit slope
  //  shows mostly the shaded flanks of its crowns: steeper fall-off, + uFXb.x (URL fb0, 1.2). v1 land L* 16/32/61 -> 15/25/56
  //  (photo 15/24/58), deep shade 12 -> 20 % (31), valley box 7 -> 15 % (23); v9 (photo lit brighter) median 44 -> ~40 (45)
  // (r12 walls) uWB.z (URL wb2): the exponent for the instanced crowns and the gentle valley floor; uFXb.x (fb0) now applies to the
  //  steep walls / ridges (10 m slope): fb0 1.2 -> .7 brightened the half-lit ridge faces toward the photos, but also lit the valley
  //  floor crowns into a lime orchard (v1 floor median L* 37 vs photo 23)
  float fbX=mat<.5?mix(uWB.z,uFXb.x,gRkS10):uWB.z;
  dif=pow(dif,1.+canopy*(.3+fbX*smoothstep(.45,1.2,gPix)*(1.-gSideF)))*mix(1.,mix(.92,.95,cFar),canopy);   // (r8 forest) far 1+.5c -> 1+.2c: half-lit slopes keep their light (forest canopies are flatter than Lambert, Minnaert k < 1)   // (r7 forest) 1+.3c / .92 -> 1+.5c / .95: half-lit canopy darker, fully lit faces unchanged (sharper lit / shade separation)   // canopy: lit fraction falls off at grazing sun (ridges read lit / shaded)
  float spk0=0.;
  float sideV=gSideF*vegL;   // (r9 side)
  // (r9m) uSL.y = level-view sun factor (.9, URL sl1); uSL.z below = level-view fill lift (1, URL sl2): knobs only, side values kept
  dif*=mix(1.,uSL.y,sideV)*mix(1.,.84,gNear*vegL);   // (r9 side) seen level / close up, a smaller share of the visible leaves is sunlit (shaded flanks / undersides of upright crowns)
  dif*=mix(1.,mix(.92,.97,smoothstep(.3,.8,gPix)),vegL);   // a leaf absorbs / transmits what it does not reflect   ((r7 forest) .92 -> .97: the sunlit faces glow)
  // sky light: horizon occlusion of the terrain (gullies, valley walls) and local cavities both darken it
  // (r11a) valley light: what a land / foliage face sees AHEAD of it, along the downslope direction of the 12 m terrain normal
  //  (heightfield taps 30-750 m). uAL / URL al0-al3 (al0=0&al1=0&al2=0&al3=0 gives r10f):
  //  - sky view (al3): aoH (12-direction horizon AO) counts the face's own upslope as occlusion, ~beta/pi for a plane of slope
  //    beta, which skyFill(N) already removes through the tilt (N.y). It is divided out, so a wall that overlooks an open
  //    valley (horizon ahead below the horizontal: the v4 / v5 west wall) keeps its sky, while gullies, slots and the foot of a
  //    wall keep their extra occlusion (more flute structure in the shade)
  //  - circumsolar sky (al0, al1): a face turned toward the sun but in a cast shadow (46 % of the v5 west wall, 37 % of the v4
  //    one, 20-29 % of the aerial views' land: heightfield twin agent_out/tw/tw1.mjs) still sees the bright aureole above the
  //    ridge that hides the disc; al1 = visible share of the aureole in a cast shadow
  //  - bounce (al2): the terrain ahead of a face turned away from the sun is the far side of the valley, turned toward the sun:
  //    its sunlit forest reflects yellow-green light (sunlight x leaf albedo) onto the shaded face, by the view factor of the
  //    terrain ahead (1-cos(alpha+beta))/2
  // (r11 merge) all valley-light knobs are 0 by default (see tweaks.cjs: every lift moved v1-v4 away from the photos); the block
  //  costs 9 heightfield taps per land pixel, so it only runs when one of its terms is switched on (URL al0 x al1, al2, al3, ab3)
  float nhV=0., hAh=0., FtV=1., aoHc=aoH; vec2 dV=vec2(0.);
  if(uAL.x*uAL.y+uAL.z+uAL.w+uAB.w>0.){
  vec3 Nv=normalize(vec3(H(p-vec2(12,0))-H(p+vec2(12,0)),24.,H(p-vec2(0,12))-H(p+vec2(0,12))));
  float bV=acos(clamp(Nv.y,0.,1.)); nhV=length(Nv.xz);
  dV=nhV>1e-4?Nv.xz/nhV:vec2(0.);
  float saV=-sin(bV);   // sin of the horizon elevation ahead (>= the face's own tangent plane); hAh: highest ground ahead
  if(nhV>.05){ for(int k=uZero;k<5;k++){ float r=30.*pow(2.15,float(k)); float hk=max(H(p+dV*r),0.); hAh=max(hAh,hk); float dy=hk-pos.y; saV=max(saV,dy/sqrt(r*r+dy*dy)); } }
  float aV=asin(clamp(saV,-1.,1.));
  FtV=clamp(.5-.5*cos(aV+bV),0.,1.);   // view factor of the terrain ahead (valley floor + far side)
  aoHc=mix(aoH,clamp(aoH/(1.-.85*bV/PI),0.,1.),uAL.w);
  }
  float occ=max(aoS*mix(1.,aoHc,.55),.25);
  // (r8 forest) the forest floor / lower canopy between the instanced crowns of a closed forest sees little sky: the crowns
  // 5-20 m above it occlude the fill (sceneAO only reaches ~1-10 m along the normal). Distance to the nearest crown, smooth
  // (no shimmer): deep emerald crevices between the crowns instead of a lit olive lawn (ref.png valley median L23-38, ours L33-47)
  float occA=smoothstep(.25,.5,gPix), occN=1.-smoothstep(.35,.6,gPix);   // (r9 side) occN: close up too (v5 / v4: the forest floor between the crowns read as lit moss)
  if(uDbgM==79||uDbgM==81||uDbgM==82) occN=0.;   // (r9 side) timing switches: 76-78 / 80 cost savings off, 79 / 81 new material terms off, 82 all off
  if(mat<.5&&vegW>.05&&gVeg&&vm.a>.35&&max(occA,occN)>0.){   // (r9 side) was aerial only
    float gp0=gPix; gPix=max(gPix,.32); vec4 ti; float dT=treesSD(pos+vec3(0.,1.5,0.),ti); gPix=gp0;
    occ*=mix(1.,mix(mix(.55,.3,occA),1.,smoothstep(.5,6.,dT)),smoothstep(.35,.8,vm.a)*max(occA,occN));   // (r9 side) close up .55 (.3 read as black holes)
  }
  // (r10f) interreflection: light bounced between the crowns, walls and gully sides fills part of what the stacked horizon /
  //  cavity / crown occlusion takes from the sky (uFP.x, URL fp0). The deepest shade sat near black in every view (L* < 20: v1
  //  ridges 26 % vs photo 10 %, v5 left wall 44 % vs 27 %; v3 / v4 shade p10 12 / 10 vs 24 / 13) once the r10f path-averaged
  //  valley mist stopped lifting it with grey veil; lit faces gain ~+5 % of their fill only
  occ=mix(occ,1.,uFP.x*mix(.5,1.,vegL));
  // inside / under a canopy the fill is light transmitted and re-scattered by leaves: yellow-green, not sky blue
  vec3 sunC=(alb+vec3(.0075,.0085,.004)*vegL*(1.-spk0))*SUNL*dif*sh;
  sunC*=uAB.x;   // (r11a) URL ab0: land sun scale (1 = r10f)
  // (r9f) sunlit foliage a warmer golden lime (less blue, a little more red): level views uFXb.y (fb1, .5), from above
  //  uFXb.z (fb2, .4). Mostly a hue turn (red up, green / blue down): (1+.2w, 1, 1-.5w) raised the level views' lit chroma
  //  (v4 near trees C 40 -> 44, photo 36); this one turns the hue as far (~6 deg toward yellow) for a third of the chroma gain
  { float wm=mix(uFXb.y,uFXb.z,aW)*mix(1.-uCW.z,1.+uCW.z,yc); sunC*=mix(vec3(1.),vec3(1.+uCW.x*wm,1.-.04*wm,1.-uCW.y*wm),vegL); }   // (r10 canopy) URL cw0 / cw1: red gain / blue cut of the turn (.3 / .3 = r9f); cw2: crown-to-crown spread of the warm turn (yc)
  sunC*=1.+uCG.w*aW*vegL;
  // (r11 veg) seen level at mid / long range (footprint > ~.4 m: the sunlit seaward walls of v2 / v3, not the near crowns of v4 / v5) the
  //  sunlit canopy is a rough forest: part of every crown is shaded by its neighbours and the lit caps are less chromatic than a lit
  //  fern lawn (v2 ridge veg L* 33/50/65 vs photo 33/47/58, lit share 65 % vs 57 %; v3 lit C 32.5 vs 26.7). uVF.x (URL vf0): light factor,
  //  uVF.y (vf1): chroma cut; the shaded walls (v5 west wall) keep their colour
  { float fl=sideV*smoothstep(.35,.7,gPix); sunC*=1.-uVF.x*fl; sunC=mix(vec3(dot(sunC,vec3(.3,.6,.1))),sunC,1.-uVF.y*fl); }
  // (r12 walls) uWB.y (URL wb1): the sunlit wall canopy seen level at mid range (footprint ~.3-1.6 m: the v5 right wall, the v4 / v3
  //  walls; fades out before the far ridges of v2) a warmer, richer yellow-green: the photos' lit crowns have R ~ G and little blue
  //  (v5 wall top 151/147/84 vs 143/144/92, mid 98/97/56 vs 75/81/51: ours a khaki olive). Hue turn plus a chroma gain, sun term only
  { float wmr=sideV*smoothstep(.4,.75,gPix)*(1.-smoothstep(1.2,2.,gPix)); sunC*=mix(vec3(1.),vec3(1.+.1*uWB.y,1.+.02*uWB.y,1.-.3*uWB.y),wmr); }
  sunC=mix(vec3(dot(sunC,vec3(.3,.6,.1))),sunC,1.-uVC.w*aW*vegL);
  // (r13 mat) uMB.x (URL mb0): a rough canopy seen from the air at a grazing angle (view 15-35 deg below the horizon) shows its sunlit
  //  crowns through the waxy sheen of their sides (Fresnel: the skylight mirrored by the leaves grows toward grazing views): the lit
  //  tone is cooler and greener than the same canopy seen steeply from above. Measured in the photos, lit canopy (top 20 % L*) by
  //  view elevation: 15-24 deg h112 (r9 far rows), 31-36 deg h107-109 (ref.png far rows), 40-50 deg h103-108 (r9 near rows); ours
  //  was h104-106 at every elevation (v9 far rows 167/165/87 vs photo 150/156/100). Sun term of the aerial canopy only; level views
  //  (gSideF) and the near crowns are untouched
  { float gz=uMB.x*smoothstep(.62,.28,-rd.y)*(1.-gSideF)*smoothstep(.3,.8,gPix)*vegL; sunC*=mix(vec3(1.),vec3(.9,.955,1.17),gz); }   // (r11 veg) uVC.w (URL vc3): sunlit canopy seen from above a little less chromatic (v9 lit C 40.6 vs photo 29.6)   // (r10c) uCG.w (URL cg3): sunlit canopy / fern planes seen from above glow brighter (v1 L>60 share 8 % vs photo 14 %, v9 mid-tones 30-60 43 % vs 63 %); shade unchanged
  sunC=mix(vec3(dot(sunC,vec3(.3,.6,.1))),sunC,1.+uVE.x*sideV*smoothstep(.45,.8,gPix)-uFP.y*sideV*(1.-smoothstep(.45,.8,gPix)));   // (r10f) uFP.y (URL fp1): seen level at near / mid range (footprint < ~.6 m) the sunlit leaves are less chromatic (waxy sheen, mixed lit / translucent leaves): lit veg C v3 33 / v4 36 / v5 32 vs photo 24 / 32 / 26, the v3 right wall read as lime moss (C 31 vs 20.5)   // (r9 side) seen level at long range, the sunlit crown caps glow lime (light scattered through several leaves): v2 lit C 23.5 vs photo 26-37 (from ~.6 m footprints: v3's mid-range land is already over-chromatic)
  vec3 col=sunC+alb*skyFill(Nl,vegL)*mix(vec3(1.),mix(vec3(1.0,1.02,.97),vec3(.86,1.07,.72),canopy),vegL)*occ*mix(3.6,3.9,vegL)*mix(1.,mix(.75,.8,smoothstep(.3,.8,gPix)),canopy)*mix(1.,mix(.93,.75,smoothstep(.15,.5,gPix)),(1.-shG)*vegL)*mix(vec3(1.),vec3(1.05,1.,.86)*mix(1.,1.12,gNear),max(sideV,gNear*vegL))*mix(1.,uSL.z,sideV)*mix(vec3(1.),vec3(1.+.12*uCG.x,1.,1.-.22*uCG.x),vegL);   // (r10 canopy) cg0: shade fill less cyan (darks h125 vs 117 level, h168 vs 158 v1)   // (r9 side) seen level / close up the shade sees more sunlit foliage than sky: warmer (photos h113-120 vs h116-126), and close up a little lighter (v3 / v4 / v5 darks)   // (r7 forest) canopy fill .75 -> .62; under a neighbouring crown's shadow the leaves also sit deeper in the gap (less sky): dark crown shadows / pockets
  // (r12 walls) uWA.x (URL wa0): the shaded rock faces of the inland gullies see the facing vegetated wall more than the sky: part of
  //  the blue sky fill is a warm green-brown bounce (the thin rock seams on the v1 / v9 ridges read slate blue-grey: 60/71/71 sRGB)
  if(mat<.5) col=sunC+(col-sunC)*mix(vec3(1.),vec3(1.18,1.,.7),uWA.x*(1.-vegL)*(1.-gRkSea)*(1.-sandW));
  // (r11a) horizon band (URL ab3): the low sky of the humid tropics is a bright white band of haze and sunlit cumulus, not the
  //  deep zenith blue that skyFill's horizon term assumes for a face turned sideways; a steep face that overlooks open ground
  //  (little terrain ahead, FtV small) sees it. Scaled by the face's own fill (same occlusion / canopy / tint factors)
  col+=(col-sunC)*uAB.w*(1.-max(Nl.y,0.))*clamp(1.-2.*FtV,0.,1.);
  // (r11a) circumsolar sky in a cast shadow + bounce from the sunlit far side of the valley (see the valley-light block above).
  //  SUNL already carries the aureole on sunlit faces; in a cast shadow the disc is hidden but a share of the aureole (al1) still
  //  shows above the ridge: al0 = aureole share of SUNL. The bounce is SUNL x leaf albedo x how much the far side faces the sun
  //  x the view factor of the terrain ahead (al2 = 1: single bounce off a forest of albedo .05 / .062 / .018)
  if(uAL.x*uAL.y+uAL.z>0.||uDbgM==111){ vec3 nO=normalize(vec3(-dV.x,1.2,-dV.y));   // the far side of the valley faces back toward this face (~40 deg slope)
    float litO=max(dot(nO,uSun),0.)*smoothstep(.05,.3,nhV)*smoothstep(2.,30.,hAh);   // no forest ahead of a sea cliff that faces the open sea
    vec3 eB=SUNL*vec3(.05,.062,.018)*litO*FtV*uAL.z;
    vec3 eC=SUNL*vec3(.95,1.,1.08)*uAL.x*uAL.y*max(dot(Nl,uSun),0.)*(1.-sh);
    if(uDbgM==111) return vec3(length(eB)*4.,length(eC)*4.,aoHc*.3);
    col+=alb*(eB+eC)*mix(1.,occ,.5)*mix(1.,.8,canopy); }
  // light scattered down through the canopy (leaf transmission / inter-reflection): shaded foliage glows a deep yellow-green
  col+=alb*mix(vec3(1.05,1.2,.55),vec3(.98,1.25,.55),cFar)*SUNL*.035*vegL*occ*(1.-.6*sh*max(NdL,0.));   // (r8 forest) from the air: greener, less yellow mid-shade
  float bl=max(-NdL,0.)*.6+pow(clamp(dot(rd,uSun),0.,1.),4.)*.6;
  col+=trans*alb*mix(vec3(1.1,1.5,.6),vec3(1.1,1.4,.55),vegL)*SUNL*bl*sh*.25*occ*(1.-.65*canopy);   // (r7 forest) .5 -> .65   // light through a whole unresolved crown is small
  vec3 Hh=normalize(uSun-rd);
  float a2=rough*rough*rough*rough;
  float NdH=max(dot(N,Hh),0.), dd=NdH*NdH*(a2-1.)+1.;
  float D=a2/(PI*dd*dd);
  float F=.04+.96*pow(1.-max(dot(Hh,-rd),0.),5.);
  // unresolved leaves point every way: their glints and Fresnel sheen average out (and are mostly self-shadowed)
  float spk=1.-.8*canopy;
  col+=SUNL*D*F*spec*max(NdL,0.)*sh*.25*spk;
  // sky sheen on glossy foliage
  col+=skyFill(reflect(rd,N),vegL)*F*spec*occ*.6*spk*spk*(1.-.8*vegL*(1.-max(NdL,0.)))*mix(vec3(1.),vec3(.95,.9,.7),vegL*uFXb.w);   // (r9f) foliage sky sheen less teal (fb3, 1): no mint frost on the palm fronds   // foliage: most of the sky sheen is shadowed by other leaves (no blue-grey frost on shaded leaves)
  col+=sheen;
  col=mix(vec3(dot(col,vec3(.3,.6,.1))),col,(1.-uVE.z*gSideF*vegL)*mix(1.,.9,gNear*vegL)*mix(1.,.9,gSideF*(1.-smoothstep(.45,.8,gPix))*vegL));   // (r9 side) near and mid-range level foliage a little less chromatic (v4 trees C 44 vs 36, v3 land lit C 33 vs 24)
  // sand in a large cast shadow lies at the foot of the obstacle that casts it (west cliff, tree line): a big part of
  // its sky is the cliff / canopy, which aoH (coarse horizon) misses -- darker, warmer shade (ref.png: ~147/135/125)
  col+=alb*skyFill(Nl,vegL)*occ*3.6*(sandFK+sandW*(vec3(1.)+sandFK)*(mix(vec3(.66,.62,.58),vec3(1.),sh)-1.));   // beach only (sandFK, sandW = 0 elsewhere)
  return col;
}

// cheap terrain colour for water reflections
vec3 terrainCheap(vec3 pos){
  vec2 p=pos.xz; float e=2.;
  vec3 N=normalize(vec3(H(p-vec2(e,0))-H(p+vec2(e,0)),2.*e,H(p-vec2(0,e))-H(p+vec2(0,e))));
  vec4 vm=VEG(p);
  vec3 alb=mix(vec3(.045,.04,.035),vec3(.06,.075,.03),vm.r);
  alb=mix(alb,vec3(.56,.51,.44),vm.b);
  return alb*(SUN*max(dot(N,uSun),0.)*.8+skyIrr(N)*ATT(p).x);
}

