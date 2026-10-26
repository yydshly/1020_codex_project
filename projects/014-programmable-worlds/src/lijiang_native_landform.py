"""Independent, bounded Li River karst macro geometry.

This module emits BASE_FUNCS only.  It does not read or modify the retained
renderer, move a peak, run erosion, or claim visual acceptance.  The original
LI_P/LI_Q arrays remain the spatial contract used by the ray bounds patch.
Each mountain instead has four independently placed and shaped rock masses;
there is no shared radial cone, summit level, radial gully fan or cliff skirt.
"""
from dataclasses import dataclass
import math
import random
from typing import Sequence

REVISION = 'native-karst-tower-shoulder-hierarchy-2'
FOOT_RADIUS = 1.20
RAY_ENVELOPE_RADIUS = 1.28


@dataclass(frozen=True)
class Lobe:
    # Local coordinates are relative to the unchanged authored peak ellipse.
    x: float
    z: float
    rx: float
    rz: float
    height: float
    crown: float
    falloff: float
    angle: float


@dataclass(frozen=True)
class Profile:
    lobes: tuple[Lobe, ...]
    # The two joint sets are not spokes radiating from a common summit.
    joint_a: float
    joint_b: float
    cut: float
    bend: float
    phase: float
    width: float


# Twelve separate compositions, in the order of the existing authored peaks.
# Their different cap widths, unequal top spacing, falloffs and shoulder levels
# change the actual height field, rather than switching an albedo/noise seed.
# Values per mass: cx,cz,rx,rz,height,crown curvature,flank falloff,orientation.
_COMPOSED = (
    # Primary (575,-170): leaning round tower, broken lower left shoulder.
    ((.16,-.17,.47,.59,1.,2.45,.75,-.26),
     (-.34,.10,.49,.46,.65,1.65,.85,.35),
     (.29,.48,.31,.47,.43,2.10,1.05,-.50),
     (-.50,-.39,.35,.33,.30,1.75,1.15,.18)),
    # Unequal separated twin crowns and a broad, low rear buttress.
    ((-.25,-.20,.42,.55,1.,2.00,.72,-.36),
     (.36,.25,.38,.46,.83,2.65,.68,.25),
     (-.19,.53,.47,.39,.31,1.85,1.12,-.20),
     (.48,-.35,.34,.42,.48,2.20,.95,.48)),
    # Narrow bent pinnacle with one long declining shoulder.
    ((-.14,-.20,.35,.58,1.,2.80,.66,-.18),
     (.31,.25,.43,.51,.58,1.70,.88,-.40),
     (-.30,.49,.36,.42,.40,2.15,1.10,.30),
     (-.48,-.38,.33,.37,.22,1.80,1.20,-.35)),
    # Oblique broken ridge; its short saddle stays inside this peak's foot.
    ((-.31,-.18,.34,.50,1.,1.85,.78,-.57),
     (.21,.05,.38,.51,.89,2.25,.74,-.44),
     (.49,.42,.34,.42,.49,1.60,.92,-.35),
     (-.45,.45,.38,.43,.37,2.30,1.10,.24)),
    # Broad round head offset from a low, extended fan of unequal shoulders.
    ((.15,.07,.59,.47,1.,2.35,.88,.30),
     (-.38,-.31,.40,.48,.53,1.50,1.12,-.44),
     (.21,-.53,.34,.35,.28,2.20,1.08,.25),
     (-.39,.46,.46,.34,.40,1.90,1.05,-.12)),
    # Three visibly different elevations, a narrow high head and a split wall.
    ((-.14,-.34,.42,.44,1.,2.30,.70,.13),
     (.31,.16,.36,.44,.77,1.95,.78,-.20),
     (-.33,.39,.38,.48,.50,2.65,.86,.30),
     (.43,-.40,.40,.28,.24,1.65,1.18,-.24)),
    # Lower, wider blunt tower; the summit is an inclined rounded arc.
    ((-.09,.05,.62,.49,1.,2.85,.82,-.22),
     (.38,-.38,.36,.41,.46,1.60,1.10,.45),
     (-.45,-.39,.35,.41,.60,1.85,.88,-.30),
     (-.21,.56,.46,.30,.25,2.10,1.10,.24)),
    # Deep unequal saddle with diagonal low foot ridges, not a common cap.
    ((-.34,-.17,.33,.44,1.,2.50,.79,-.20),
     (.37,.17,.32,.47,.84,2.00,.72,-.36),
     (-.10,.51,.47,.33,.27,1.65,1.20,-.20),
     (.12,-.44,.48,.29,.39,2.25,1.08,.08)),
    # A long curved shoulder leading to a single high, narrow head.
    ((.28,-.25,.35,.48,1.,2.05,.70,.30),
     (-.15,.15,.43,.37,.68,1.65,.86,-.50),
     (-.47,.43,.32,.39,.38,2.20,1.05,-.30),
     (.40,.48,.29,.40,.22,2.65,1.12,.20)),
    # Broad rear mass, prominent lower head and a low front spur.
    ((.14,.21,.49,.51,1.,1.90,.88,.50),
     (-.34,-.24,.39,.40,.73,2.70,.70,-.30),
     (.40,-.44,.37,.32,.34,1.65,1.15,.15),
     (-.48,.40,.31,.41,.49,2.15,1.00,-.40)),
    # Asymmetric wall, one very low buttress and a taller leaning shoulder.
    ((-.17,-.09,.43,.58,1.,2.70,.74,.31),
     (.33,.38,.41,.40,.61,1.85,.85,-.25),
     (-.44,.49,.32,.39,.23,1.60,1.20,.35),
     (.40,-.42,.37,.33,.41,2.35,1.08,-.30)),
    # Closely spaced three-level crown with a narrow broken upper ridge.
    ((-.32,-.29,.32,.42,1.,2.20,.72,-.20),
     (.14,.02,.33,.43,.83,1.75,.76,-.30),
     (.39,.40,.33,.41,.61,2.65,.81,-.38),
     (-.30,.50,.43,.34,.32,1.80,1.12,.25)),
)

# Six distinct distant families sampled from those authored macro forms.
_FAMILY = (0, 1, 2, 3, 4, 7)
_JOINTS = (
    (1.34,2.63,.078,.16), (1.78,2.91,.065,-.12),
    (1.23,2.46,.060,.22), (1.58,2.79,.075,-.16),
    (.88,2.30,.068,.11), (1.47,2.78,.080,-.19),
    (1.11,2.49,.056,.13), (1.86,2.80,.064,-.10),
    (1.18,2.66,.072,.18), (1.52,2.91,.061,-.14),
    (1.06,2.41,.074,.17), (1.69,2.83,.067,-.15),
)


def _check_peaks(peaks: Sequence[Sequence[float]]) -> None:
    if not peaks:
        raise ValueError('At least one authored peak is required')
    for index, peak in enumerate(peaks):
        if len(peak) != 8 or not all(math.isfinite(v) for v in peak):
            raise ValueError(f'Invalid peak {index}: expected eight finite values')
        if min(peak[2:5]) <= 0.:
            raise ValueError(f'Invalid peak height or radius at {index}')


def _retains_slender_head(index: int) -> bool:
    # Three deliberately slender authored heads, then one in each group of
    # four background peaks.  For the present 76 peaks this retains 19 tall
    # accents, rather than turning the whole valley into equally broad hills.
    return index in (2, 7, 11) or index >= 12 and (index - 12) % 4 == 1


def _contained_mass(mass: Lobe, *, limit: float = 1.075) -> Lobe:
    # A conservative bound on the rotated ellipse in q-space.  The final
    # unwarped support is still independently C1 tapered to zero at 1.20.
    allowance = max(.22, limit - math.hypot(mass.x, mass.z))
    scale = min(1., allowance / max(mass.rx, mass.rz))
    return Lobe(mass.x, mass.z, mass.rx * scale, mass.rz * scale,
                mass.height, mass.crown, mass.falloff, mass.angle)


def _mass_hierarchy(peak: Sequence[float], masses: tuple[Lobe, ...],
                    index: int) -> tuple[Lobe, ...]:
    """Compose a dominant head, off-axis shoulder and low eroded buttress.

    This changes the scalar field itself, not the colour/normal painted on an
    unchanged wall.  No authored peak position, foot ellipse or river envelope
    is enlarged.  The same result drives generated H, ecology and SDF meshes.
    """
    if _retains_slender_head(index):
        return masses
    main, old_shoulder, old_low, old_spur = masses
    aspect = peak[2] * main.height / (2. * min(peak[3] * main.rx,
                                                   peak[4] * main.rz))
    severity = _smooth(2.2, 4.6, aspect)
    broaden = 1.20 + .15 * severity
    height_scale = 1. - (.10 + .08 * _smooth(2.7, 4.6, aspect)) if aspect > 2.7 else 1.
    rng = random.Random(8261026 + index * 3571)
    main = _contained_mass(Lobe(
        main.x, main.z, main.rx * broaden,
        main.rz * broaden * rng.uniform(.94, 1.035),
        main.height * height_scale,
        max(1.80, min(2.72, main.crown * rng.uniform(.94, 1.01))),
        max(.84, min(1.06, main.falloff + .16)), main.angle))

    def direction(target: Lobe, fallback: float) -> tuple[float, float]:
        dx, dz = target.x - main.x, target.z - main.z
        distance = math.hypot(dx, dz)
        return ((dx / distance, dz / distance) if distance > .08
                else (math.cos(fallback), math.sin(fallback)))

    ux, uz = direction(old_shoulder, peak[7])
    reach = rng.uniform(.40, .58)
    shoulder = _contained_mass(Lobe(
        main.x + ux * reach, main.z + uz * reach,
        max(old_shoulder.rx * 1.13, main.rx * rng.uniform(1.04, 1.24)),
        max(.235, min(old_shoulder.rz * rng.uniform(.69, .85), main.rz * .78)),
        main.height * rng.uniform(.53, .72),
        rng.uniform(1.65, 2.17), rng.uniform(.96, 1.17),
        math.atan2(uz, ux) + rng.uniform(-.16, .16)))
    vx, vz = direction(old_low, peak[7] + 1.8)
    # A second lower buttress is oblique to the shoulder, not a concentric
    # all-round skirt and not another equal-height twin tower.
    if ux * vx + uz * vz > .72:
        vx, vz = (-uz, ux) if index % 2 else (uz, -ux)
    low_reach = rng.uniform(.43, .61)
    low = _contained_mass(Lobe(
        main.x + vx * low_reach, main.z + vz * low_reach,
        max(old_low.rx * 1.17, main.rx * rng.uniform(.97, 1.15)),
        max(.215, min(old_low.rz * rng.uniform(.68, .86), main.rz * .71)),
        main.height * rng.uniform(.23, .38),
        rng.uniform(1.60, 2.15), rng.uniform(1.04, 1.27),
        math.atan2(vz, vx) + rng.uniform(-.21, .21)))
    spur = _contained_mass(Lobe(
        old_spur.x, old_spur.z, old_spur.rx * rng.uniform(.98, 1.14),
        old_spur.rz * rng.uniform(.97, 1.13),
        main.height * rng.uniform(.16, .29),
        old_spur.crown, max(1.04, old_spur.falloff), old_spur.angle))
    return main, shoulder, low, spur


def _profiles(peaks: Sequence[Sequence[float]], *, adapt: bool = True) -> list[Profile]:
    _check_peaks(peaks)
    result = []
    for i, peak in enumerate(peaks):
        if i < len(_COMPOSED):
            form, joints = _COMPOSED[i], _JOINTS[i]
            lobes = tuple(Lobe(*mass) for mass in form)
        else:
            rng = random.Random(61025 + i * 7919)
            family = _FAMILY[(i * 5 + int(peak[7] * 1.7)) % len(_FAMILY)]
            form, joints = _COMPOSED[family], _JOINTS[family]
            flip = -1. if rng.random() < .5 else 1.
            lobes = tuple(Lobe(
                flip * (m[0] + rng.uniform(-.055,.055)),
                m[1] + rng.uniform(-.065,.065),
                m[2] * rng.uniform(.90,1.10),
                m[3] * rng.uniform(.88,1.10),
                1. if j == 0 else m[4] * rng.uniform(.79,1.13),
                m[5] * rng.uniform(.86,1.15),
                m[6] * rng.uniform(.90,1.13),
                flip * m[7] + rng.uniform(-.24,.24),
            ) for j,m in enumerate(form))
            joints = (joints[0]+rng.uniform(-.38,.38),
                      joints[1]+rng.uniform(-.30,.30),
                      joints[2]*rng.uniform(.78,1.18),
                      joints[3]*flip*rng.uniform(.75,1.20))
        if adapt:
            lobes = _mass_hierarchy(peak, lobes, i)
            if not _retains_slender_head(i):
                # Geometric clefts partition the shoulder/head volumes.  They
                # are not stripes painted over an unbroken round surface.
                joints = (joints[0], joints[1], joints[2] * 1.70, joints[3])
        result.append(Profile(lobes,*joints,peak[7],
                              max(.045,min(.105,11.5/min(peak[3:5])))))
    return result


def build_peak_glsl(peaks: Sequence[Sequence[float]]) -> str:
    """Emit drop-in BASE_FUNCS, retaining every input position/radius verbatim.

    LI_P/LI_Q formatting deliberately matches the marcher envelope extractor.
    No dependency on build_lijiang_native.py avoids a generator import cycle.
    """
    profiles = _profiles(peaks)
    count = len(peaks)

    def array(name: str, values: Sequence[Sequence[float]]) -> str:
        data = ',\n'.join('vec4('+','.join(f'{v:.6f}' for v in row)+')'
                         for row in values)
        return f'const vec4 {name}[{count}]=vec4[{count}](\n{data});'

    arrays = [array('LI_P',[p[:4] for p in peaks]),
              array('LI_Q',[p[4:] for p in peaks])]
    for j in range(4):
        arrays.append(array(f'LI_M{j}',[(p.lobes[j].x,p.lobes[j].z,
                                        p.lobes[j].rx,p.lobes[j].rz)
                                       for p in profiles]))
        arrays.append(array(f'LI_F{j}',[(p.lobes[j].height,p.lobes[j].crown,
                                        p.lobes[j].falloff,p.lobes[j].angle)
                                       for p in profiles]))
    arrays.append(array('LI_J',[(p.joint_a,p.joint_b,p.cut,p.bend) for p in profiles]))
    return (_GLSL.replace('NPEAKS',str(count))
            .replace('PEAK_ARRAYS','\n'.join(arrays)))


_GLSL = r'''
uniform vec4 uRect; uniform vec2 uRes;
uniform vec4 uVS[24],uVP[24];uniform int uNV;uniform vec4 uSH[8];uniform int uNSH;
uniform float uMtnH,uMtnL,uVW;uniform vec4 uBZ[4];uniform int uNBZ;uniform vec4 uCH[16];uniform int uNCH;uniform vec4 uMS[4];uniform int uNMS;
PEAK_ARRAYS
vec2 liMassTurn(vec2 q,float angle){
  float c=cos(angle),s=sin(angle);
  return vec2(c*q.x+s*q.y,-s*q.x+c*q.y);
}
float liRockMass(vec2 q,vec4 mass,vec4 form){
  vec2 v=liMassTurn(q-mass.xy,form.w)/mass.zw;
  // A rounded convex crown and an independently curved steep flank.  Unlike
  // a cone, their derivatives do not meet in a point at a universal slope.
  float r=(sqrt(dot(v,v)+.0016)-.04)/.96;
  float h=pow(max(0.,1.-pow(max(r,0.),form.y)),form.z);
  // Compact, C1 lower contact; no clipped vertical rim at a lobe's support.
  return form.x*h*(1.-smoothstep(.84,1.,r));
}
float liMassJoin(float a,float b,float k){
  // The blend width also vanishes at zero: smooth-max(0,0) must be 0,
  // otherwise every mountain acquires the same low circular pedestal.
  float w=min(k,a+b);
  if(w<1e-7)return max(a,b);
  float h=max(w-abs(a-b),0.)/w;
  return max(a,b)+.25*w*h*h;
}
float liJointCut(vec2 q,vec2 origin,float angle,float width,float ph,float reach){
  vec2 v=liMassTurn(q-origin,angle);
  // Meandering, oblique dissolution joints, at different offsets and extents.
  // There is no radial angular sin() fan and no common altitude gate.
  float bend=.047*sin(v.x*3.7+ph)+.018*sin(v.x*10.1+ph*1.31);
  float across=v.y-bend;
  float widen=width*(1.+.24*sin(v.x*4.3+ph*.63));
  // A finite cleft with a short irregular floor and broken shoulders.  The
  // old Gaussian only scooped a smoothly rounded groove from each blob.
  float channel=1.-smoothstep(.20,1.35,abs(across)/widen);
  return channel*smoothstep(-reach-.20,-reach*.52,v.x)
         *(1.-smoothstep(reach*.61,reach+.13,v.x));
}
float liKarstBody(vec2 raw,vec4 first,vec4 second,vec4 third,vec4 fourth,
                  vec4 f0,vec4 f1,vec4 f2,vec4 f3,vec4 joints,float ph,float width){
  float foot=length(raw);
  if(foot>=1.20)return 0.;
  // Cross-coupled macro warp is nonradial and has a different handedness for
  // each mountain.  The envelope is always tested BEFORE this deformation.
  vec2 q=raw;
  q.x+=joints.w*(raw.y*raw.y-.12)
      +.025*sin(raw.y*5.3+ph)+.012*sin(raw.x*8.1+raw.y*2.7+ph*2.);
  q.y+=.028*sin(raw.x*4.1-ph*.7)+.018*sin(raw.y*7.3+raw.x*3.3+ph);
  float body=liMassJoin(liRockMass(q,first,f0),liRockMass(q,second,f1),.035);
  body=liMassJoin(body,liRockMass(q,third,f2),.026);
  body=liMassJoin(body,liRockMass(q,fourth,f3),.019);
  vec2 mouthA=mix(first.xy,second.xy,.57)+vec2(.045,-.075);
  vec2 mouthB=mix(first.xy,third.xy,.61)+vec2(-.082,.031);
  float cuts=liJointCut(q,mouthA,joints.x,width,ph,.86);
  cuts+=.63*liJointCut(q,mouthB,joints.y,width*1.22,ph+5.1,.74);
  cuts+=.30*liJointCut(q,fourth.xy+vec2(.08,.02),joints.x+.54,
                       width*.76,ph+9.3,.54);
  float retention=body/(body+.12);
  body=max(0.,body-joints.z*cuts*retention);
  // Explicit unwarped support remains inside the existing 1.28 river and ray
  // bounds.  Both height and first derivative go to zero at radius 1.20.
  return body*(1.-smoothstep(.98,1.20,foot));
}
float baseLand(vec2 p){
  float d=coastD(p);
  if(d<0.)return -1.1-min(10.,-d*.055);
  float plain=2.1+3.8*(.5+.5*fbm(p*.006+1.7,3))+.8*vnoise(p*.023);
  plain*=smoothstep(0.,11.,d);
  float height=plain;
  for(int i=uZero;i<NPEAKS;i++){
    vec4 a=LI_P[i],b=LI_Q[i];vec2 dp=p-a.xy;
    // A 1.20 rotated ellipse fits within this circle; unlike 1.4*maxAxis,
    // this bound states the same geometric contract as the support check.
    float extent=1.20*max(a.w,b.x);
    if(abs(dp.x)>extent||abs(dp.y)>extent)continue;
    vec2 q=liMassTurn(dp,b.y)/vec2(a.w,b.x);
    if(dot(q,q)>=1.44)continue;
    float width=clamp(11.5/min(a.w,b.x),.045,.105);
    float body=liKarstBody(q,LI_M0[i],LI_M1[i],LI_M2[i],LI_M3[i],
                           LI_F0[i],LI_F1[i],LI_F2[i],LI_F3[i],LI_J[i],b.w,width);
    height=max(height,plain+a.z*(uMtnH/320.)*body);
  }
  return height;
}
'''


def _smooth(a: float,b: float,x: float) -> float:
    t=max(0.,min(1.,(x-a)/(b-a)))
    return t*t*(3.-2.*t)


def _turn(x: float,z: float,angle: float) -> tuple[float,float]:
    c,s=math.cos(angle),math.sin(angle)
    return c*x+s*z,-s*x+c*z


def _mass(x: float,z: float,m: Lobe) -> float:
    vx,vz=_turn(x-m.x,z-m.z,m.angle)
    r=(math.sqrt((vx/m.rx)**2+(vz/m.rz)**2+.0016)-.04)/.96
    h=max(0.,1.-max(r,0.)**m.crown)**m.falloff
    return m.height*h*(1.-_smooth(.84,1.,r))


def _join(a: float,b: float,k: float) -> float:
    w=min(k,a+b)
    if w<1e-7:
        return max(a,b)
    h=max(w-abs(a-b),0.)/w
    return max(a,b)+.25*w*h*h


def _cut(x: float,z: float,origin: tuple[float,float],angle: float,
         width: float,phase: float,reach: float) -> float:
    along,across=_turn(x-origin[0],z-origin[1],angle)
    bend=.047*math.sin(along*3.7+phase)+.018*math.sin(along*10.1+phase*1.31)
    widen=width*(1.+.24*math.sin(along*4.3+phase*.63))
    return ((1.-_smooth(.20,1.35,abs(across-bend)/widen))
            *_smooth(-reach-.20,-reach*.52,along)
            *(1.-_smooth(reach*.61,reach+.13,along)))


def sample_profile(profile: Profile,qx: float,qz: float) -> float:
    """CPU mirror of liKarstBody, for shape/bounds checks, not rendered QA."""
    foot=math.hypot(qx,qz)
    if foot>=FOOT_RADIUS:
        return 0.
    ph=profile.phase
    x=(qx+profile.bend*(qz*qz-.12)+.025*math.sin(qz*5.3+ph)
       +.012*math.sin(qx*8.1+qz*2.7+ph*2.))
    z=qz+.028*math.sin(qx*4.1-ph*.7)+.018*math.sin(qz*7.3+qx*3.3+ph)
    m=profile.lobes
    body=_join(_mass(x,z,m[0]),_mass(x,z,m[1]),.035)
    body=_join(body,_mass(x,z,m[2]),.026)
    body=_join(body,_mass(x,z,m[3]),.019)
    a=(m[0].x*.43+m[1].x*.57+.045,m[0].z*.43+m[1].z*.57-.075)
    b=(m[0].x*.39+m[2].x*.61-.082,m[0].z*.39+m[2].z*.61+.031)
    cuts=_cut(x,z,a,profile.joint_a,profile.width,ph,.86)
    cuts+=.63*_cut(x,z,b,profile.joint_b,profile.width*1.22,ph+5.1,.74)
    cuts+=.30*_cut(x,z,(m[3].x+.08,m[3].z+.02),profile.joint_a+.54,
                   profile.width*.76,ph+9.3,.54)
    body=max(0.,body-profile.cut*cuts*body/(body+.12))
    return body*(1.-_smooth(.98,1.20,foot))


def validate_peak_shapes(peaks: Sequence[Sequence[float]],resolution: int=65) -> dict:
    """Check support/finite heights and report geometric diversity on the CPU.

    Sampling is not a proof of aesthetic quality or GPU correctness.  Exterior
    zero support and the ray-envelope relation additionally follow directly
    from the unwarped length test and compact support in emitted GLSL.
    """
    profiles=_profiles(peaks)
    if resolution<17:
        raise ValueError('Use at least 17 samples per axis')
    rows=[]
    signatures=[]
    maximum=0.
    outside=0.
    boundary=0.
    for index,profile in enumerate(profiles):
        top=0.
        top_at=(0.,0.)
        area=[0,0,0]
        for zi in range(resolution):
            z=-1.20+2.40*zi/(resolution-1)
            for xi in range(resolution):
                x=-1.20+2.40*xi/(resolution-1)
                h=sample_profile(profile,x,z)
                if not math.isfinite(h) or h<0. or h>1.10:
                    raise AssertionError(f'Invalid body height at peak {index}: {h}')
                if h>top:
                    top,top_at=h,(x,z)
                for j,level in enumerate((.2,.5,.8)):
                    area[j]+=h>level
        # Slope at the support edge should converge to zero with epsilon.
        for angle in range(48):
            c,s=math.cos(angle*math.tau/48),math.sin(angle*math.tau/48)
            outside=max(outside,sample_profile(profile,1.20*c,1.20*s),
                        sample_profile(profile,1.28*c,1.28*s))
            boundary=max(boundary,sample_profile(profile,1.1999*c,1.1999*s))
        signature=tuple(round(sample_profile(profile,x,z),3)
                        for z in (-.60,-.30,0.,.30,.60)
                        for x in (-.60,-.30,0.,.30,.60))
        signatures.append(signature)
        maximum=max(maximum,top)
        if index<12:
            cell=(2.4/(resolution-1))**2
            rows.append({'index':index,'top_fraction':round(top,5),
                         'top_local':tuple(round(v,4) for v in top_at),
                         'areas_above_20_50_80':[round(v*cell,4) for v in area]})
    if outside>1e-10 or boundary>1e-5:
        raise AssertionError(f'Foot support discontinuity: outside={outside}, inside={boundary}')
    if len(set(signatures))!=len(peaks):
        raise AssertionError('Two peak bodies have the same sampled shape')
    return {'revision':REVISION,'count':len(peaks),'max_fraction':maximum,
            'outside_support_max':outside,'edge_inside_max':boundary,
            'distinct_sampled_shapes':len(set(signatures)),
            'support_radius':FOOT_RADIUS,'ray_envelope_radius':RAY_ENVELOPE_RADIUS,
            'composed':rows,'validation':'CPU field sampling only; visual QA outstanding'}
