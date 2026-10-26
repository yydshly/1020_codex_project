"""Precomputed freshwater ecology for the independent Li River scene.

The material mask and plant placement describe the same groves, gaps and rock
crevices.  They add no per-ray noise, texture assets, or new rendering geometry:
the retained renderer still builds and lights its individual broadleaf trees.
This module is an artwork candidate and needs actual rendered-frame review.
"""
from __future__ import annotations

REVISION = 'native-riparian-mosaic-2-local-relief'


VEGETATION = r'''
uniform sampler2D uH,uA;uniform vec4 uRect;uniform vec2 uRes;uniform vec4 uVGM;uniform vec4 uBZ[4];uniform int uNBZ;
out vec4 o;
float Hs(vec2 p){return textureLod(uH,(p-uRect.xy)*uRect.w,0.).r;}
void main(){
  vec2 p=uRect.xy+gl_FragCoord.xy/uRes*uRect.z;
  float h=Hs(p),d=coastD(p);
  if(d<0.||h<.3){o=vec4(0.);return;}
  const float e=1.8,eb=9.;
  vec2 g=vec2(Hs(p+vec2(e,0))-Hs(p-vec2(e,0)),Hs(p+vec2(0,e))-Hs(p-vec2(0,e)))/(2.*e);
  vec2 gb=vec2(Hs(p+vec2(eb,0))-Hs(p-vec2(eb,0)),Hs(p+vec2(0,eb))-Hs(p-vec2(0,eb)))/(2.*eb);
  float slB=length(gb),slope=1.-inversesqrt(1.+dot(g,g));
  vec4 at=textureLod(uA,(p-uRect.xy)*uRect.w,0.);
  // Warped 35--150 m ecological patches cross contours.  A horizontal height
  // threshold would turn every mountain into the same green cap / rock belt.
  vec2 wp=p+28.*vec2(vnoise(p*.006+17.),vnoise(p*.007+73.));
  float broad=.5+.5*fbm(wp*.011+3.7,3);
  float medium=.5+.5*fbm(wp*.037+vec2(h*.008,19.1),3);
  float fine=vnoise(wp*.15+vec2(h*.026,5.3));
  float aspect=.5+.5*dot(-gb/(slB+.04),normalize(vec2(.55,-.83)));
  float hollow=1.-smoothstep(-2.8,.8,at.g);
  float ridge=smoothstep(.8,5.5,at.g);
  float moisture=clamp(.24+.24*broad+.13*aspect+.24*hollow+.28*at.a+.10*(1.-at.r),0.,1.);
  // Soil is both locally slope-limited and patch-dependent.  Ledges and wet
  // fissures carry vegetation down a wall, while dry convex crowns expose rock.
  float soil=1.-smoothstep(.37+.20*moisture,.88+.08*moisture,slope+.11*(medium-.5)+.035*fine);
  float fractureNoise=vnoise(wp*vec2(.031,.022)+vec2(.0035*h,.0045*h)+11.7);
  float fissure=1.-smoothstep(.07,.28,abs(fractureNoise));
  // Occupancy and foliage density are separate: a viable wet pocket is dense
  // enough to replace bare stone, rather than every wet wall receiving a weak
  // grey-green wash.  Medium patches interrupt the long solution channels.
  float habitat=.42*fissure+.27*medium+.15*broad+.12*hollow+.12*at.a-.14*ridge;
  float occupied=smoothstep(.39,.60,habitat)*smoothstep(.32,.72,slope);
  float wallGrowth=occupied*mix(.84,.98,moisture);
  float dryFace=smoothstep(.54,.77,medium+.14*ridge-.16*moisture)*smoothstep(.20,.62,slope);
  float dryCrest=ridge*smoothstep(.34,.60,broad+.30*(medium-.5)-.12*moisture);
  float cover=max(soil*(1.-.69*dryFace)*(1.-.88*dryCrest),wallGrowth);
  // Lowland forest is a mosaic of mature groves, young scrub and open clearings,
  // rather than an equally full row in every 13 m tree cell along the shoreline.
  float grove=smoothstep(.24,.67,broad+.16*(medium-.5));
  float clearing=smoothstep(.57,.76,.5+.5*vnoise(wp*.018+91.3))*(1.-smoothstep(.08,.34,slB));
  // A gentle summit is not a lowland.  Relative relief at 60m removes the
  // former automatic green cap without introducing an absolute altitude band.
  float surroundingMin=min(min(Hs(p+vec2(60.,0.)),Hs(p-vec2(60.,0.))),min(Hs(p+vec2(0.,60.)),Hs(p-vec2(0.,60.))));
  float localRelief=max(0.,h-surroundingMin);
  float lowland=(1.-smoothstep(.16,.65,slB))*(1.-smoothstep(4.,22.,localRelief));
  float riparian=1.-smoothstep(28.,150.,d);
  float groundCover=clamp(.59+.34*grove+.07*riparian-.67*clearing,.08,1.);
  cover=mix(cover,groundCover,lowland);
  cover*=smoothstep(.3,1.6,h)*smoothstep(.8,4.5,d);
  float forest=(.18+.77*grove)*(1.-.90*clearing)*(1.-smoothstep(.45,1.3,slB));
  forest*=mix(.65,1.,moisture)*(1.-.5*ridge);
  // r=all vegetation, a=forest versus low scrub; g/b remain zero because the
  // source shader reserves those channels for palms/reef and ocean beaches.
  o=vec4(clamp(cover,0.,1.),0.,0.,clamp(forest*cover,0.,1.));
}'''


PLANTS = r'''
uniform sampler2D uH,uV,uA;uniform vec4 uRect,uG;uniform int uKind;uniform float uDens,uRmin,uRmax;uniform vec4 uPK;
out vec4 o;
float Hs(vec2 p){return textureLod(uH,(p-uRect.xy)*uRect.w,0.).r;}
void main(){
  vec2 c=floor(gl_FragCoord.xy);float kk=float(uKind);
  // Preserve the jitter/height/species-radius encoding consumed by treeGeo.
  vec2 j=.12+.76*hash22(c*1.31+kk*17.);
  vec2 p=uG.xy+(c+j)*uG.z,uv=(p-uRect.xy)*uRect.w;
  vec4 vm=textureLod(uV,uv,0.),at=textureLod(uA,uv,0.);
  float h=Hs(p);o=vec4(j,h-.35,0.);
  if(h<1.25||vm.r<.035)return;
  const float e=2.,eb=9.;
  vec2 g=vec2(Hs(p+vec2(e,0))-Hs(p-vec2(e,0)),Hs(p+vec2(0,e))-Hs(p-vec2(0,e)))/(2.*e);
  float sl=length(g);
  float slB=length(vec2(Hs(p+vec2(eb,0))-Hs(p-vec2(eb,0)),Hs(p+vec2(0,eb))-Hs(p-vec2(0,eb))))/(2.*eb);
  float r=hash12(c*2.17+kk*5.3),r2=hash12(c*.77+3.1+kk*1.9),r3=hash12(c*3.71+9.1);
  vec2 wp=p+28.*vec2(vnoise(p*.006+17.),vnoise(p*.007+73.));
  float broad=.5+.5*fbm(wp*.011+3.7,3);
  float medium=.5+.5*fbm(wp*.037+vec2(h*.008,19.1),3);
  float grove=smoothstep(.24,.67,broad+.16*(medium-.5));
  float clearing=smoothstep(.57,.76,.5+.5*vnoise(wp*.018+91.3))*(1.-smoothstep(.08,.34,slB));
  if(uKind==0){
    // uDens defaults to 1.7 in the retained engine.  The old boosts saturated it
    // at one tree in almost every cell; the factor below leaves real open cells.
    float dens=vm.r*(1.-smoothstep(.42,.90,slB))*(1.-smoothstep(1.15,2.1,sl));
    dens*=mix(.55,.94,grove)*mix(.75,1.05,at.a)*.64*uDens;
    dens*=1.-.91*clearing;
    if(r>clamp(dens,0.,.96))return;
    // A young fringe, mature interior and rare old emergents give adjacent
    // groves different crown sizes and skylines.  All fit the original 3x3 scan.
    float age=clamp(.18+.68*grove+.22*(medium-.5)+.15*r3,0.,1.);
    float R=mix(uRmin*.68,uRmax*.90,clamp(.12+.58*age+.30*pow(r2,1.65),0.,1.));
    R*=mix(.82,1.06,.5+.5*vnoise(p*.047+67.1))*(1.-.26*smoothstep(.32,1.4,sl));
    R=min(R,uG.z*.745);
    // A crown-sized soil footprint prevents trees floating from tiny cliff ledges.
    float rootSpan=R*1.2;
    vec4 roots=vec4(Hs(p+vec2(rootSpan,0.)),Hs(p-vec2(rootSpan,0.)),Hs(p+vec2(0.,rootSpan)),Hs(p-vec2(0.,rootSpan)));
    float rootMin=min(min(roots.x,roots.y),min(roots.z,roots.w));
    float rootMax=max(max(roots.x,roots.y),max(roots.z,roots.w));
    if(rootMax-rootMin>mix(6.5,11.,smoothstep(3.,8.,R)))return;
    float sp=(r3>.93&&age>.62&&slB<.22&&clearing<.1)?2.:1.;
    o.z-=R*.45*smoothstep(.3,.8,sl);
    o.w=sp*100.+R;
  }else{
    // Gappy thickets collect at grove edges and wet hollows, with very few
    // shrubs under mature crowns.  No beach flag (+10), palms or salt ecology.
    float edge=4.*grove*(1.-grove);
    float dens=vm.r*(1.-smoothstep(.55,1.05,slB))*(.28+.48*edge+.22*at.a);
    dens*=mix(1.,.28,smoothstep(.35,.8,vm.a))*uDens;
    dens*=mix(.65,1.1,medium)*(1.-.55*clearing);
    if(r>clamp(dens,0.,.84))return;
    o.w=mix(uRmin*.72,uRmax,mix(r2*r2,r2,.6*edge))*(1.-.32*smoothstep(.8,1.9,sl));
  }
}'''


def patch_plants(body: str) -> str:
    """Replace only the retained plant placement literal, with guarded schema.

    Pass the original FS_PLANTS literal body (without surrounding backticks).
    This replaces the old coastal placement patch and its support insertion.
    """
    required = ('uniform sampler2D uH, uV, uA;', 'void main(){',
                'o=vec4(j,h-.35,0.);', 'o.w=sp*100.+R;')
    missing = [anchor for anchor in required if body.count(anchor) != 1]
    if missing:
        raise ValueError('Retained plant-placement schema changed: '+repr(missing))
    return PLANTS


def description() -> dict[str, object]:
    return {
        'revision': REVISION,
        'material': 'Slope, aspect, drainage and convexity with warped ecological patches; wet fissures cross rock faces and dry crests break green caps',
        'riparianForest': 'Shared 35–150m grove/clearing mosaic, young-to-mature crown-size variation, sparse emergents, understory at grove margins',
        'sourceTreeEncodingPreserved': True,
        'rootSupport': 'Four crown-footprint height samples; 6.5–11m maximum relief',
        'perRayFunctionsChanged': [],
        'externalAssets': 0,
        'artAccepted': False,
    }
