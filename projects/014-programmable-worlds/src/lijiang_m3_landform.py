"""M3 karst shape grammar: rounded crowns, structural flanks and local scarps.

This emits the same BASE_FUNCS interface as lijiang_native_landform.  Authored
peak locations, peak-foot ellipses and the outer support/ray bounds are retained.
H, habitat fields, collision and marching cubes therefore consume this one field.
No model, image, voxel cache or material texture is read by this module.

The M2 four-mass composition is kept so the experiment isolates its actual
surface construction. Its unequal crown and flank curves remain; supporting
planes, bounded oblique setbacks and finite dissolution clefts cut their faces.
The setbacks occupy different sides; neither is a complete altitude contour.
"""
from __future__ import annotations

import math
from typing import Sequence

import lijiang_native_landform as m2

REVISION = 'm3-authored-mass-finite-joint-flanks-3'
FOOT_RADIUS = m2.FOOT_RADIUS
RAY_ENVELOPE_RADIUS = m2.RAY_ENVELOPE_RADIUS
Lobe = m2.Lobe
Profile = m2.Profile


def _fract(value: float) -> float:
    return value - math.floor(value)


_MASS_GLSL = r'''float liRockMass(vec2 q,vec4 mass,vec4 form){
  vec2 v=liMassTurn(q-mass.xy,form.w)/mass.zw;
  float roundR=(sqrt(dot(v,v)+.0016)-.04)/.96;
  // Eight unequal supporting planes form an inscribed, oblique rock section.
  // This is a scalar-field change, not an albedo/normal-map outline.  The
  // constant-bounded arithmetic adds no repeated volume/noise lookup.
  vec4 seed=fract(vec4(mass.x*11.73+mass.y*7.19+form.w*.37,
    mass.y*13.41-form.w*.53+form.x*3.17,
    mass.x*5.71-mass.y*9.23+form.x*7.31,
    form.w*2.71+mass.x*17.13+mass.y*3.61));
  vec4 support=1.04+.065*seed;
  float planeX=abs(v.x)*(1.+.025*sign(v.x)*(seed.z-.5))*support.x;
  float planeZ=abs(v.y)*(1.+.035*sign(v.y)*(seed.w-.5))*support.y;
  float planeA=abs((v.x+v.y)*.70710678118)*support.z;
  float planeB=abs((v.x-v.y)*.70710678118)*support.w;
  float faceR=(max(max(planeX,planeZ),max(planeA,planeB))-.04)/.96;
  faceR=max(roundR,faceR);
  // Preserve a rounded crown while unequal supports trim middle/lower flanks.
  // This limits the same continuous cylindrical highlight around every mass.
  float faceWeight=smoothstep(.20,.52,roundR)*.94;
  float r=max(0.,mix(roundR,faceR,faceWeight));
  // Keep the authored mass's unequal crown/flank exponents. A linear
  // height drop over radius made the first M3 experiment into thin cones.
  // The power curve retains broad shoulders and a steep limestone flank;
  // supporting planes, scarps and finite joints supply its structural faces.
  float crownExponent=max(1.7,form.y*(.96+.06*seed.y));
  float flankExponent=max(.32,form.z*(.88+.08*seed.z));
  float h=pow(max(0.,1.-pow(r,crownExponent)),flankExponent);
  // Broken, gently dipping beds.  Each setback has one finite lateral gate;
  // different inclinations/widths prevent a contour ring around the mass.
  float bedA=r+.075*v.y-.038*v.x;
  float startA=.555+.055*(seed.x-.5);
  float shelfA=smoothstep(startA-.017,startA+.017,bedA)
      *(1.-smoothstep(startA+.105,startA+.165,bedA));
  float sideA=smoothstep(.015,.31,v.x+.24*v.y)
      *(1.-smoothstep(.42,.82,abs(v.y-.10)));
  float bedB=r+.058*v.x+.095*v.y;
  float startB=.755+.060*(seed.w-.5);
  float shelfB=smoothstep(startB-.014,startB+.014,bedB)
      *(1.-smoothstep(startB+.060,startB+.115,bedB));
  float sideB=smoothstep(.045,.36,-v.y-.23*v.x)
      *(1.-smoothstep(.34,.76,abs(v.x+.12)));
  h=max(0.,h-(.035+.018*seed.y)*shelfA*sideA
                -(.022+.012*seed.z)*shelfB*sideB);
  // A bounded collapse scarp cuts a real inclined plane into one flank.
  // Its two possible orientations are local structural directions, not a
  // summit-centred radial fan. Intact shoulders frame the plane on both sides.
  vec2 scarpN=mix(vec2(.24,.97077289),vec2(-.97590148,.21821789),step(.48,seed.x));
  float along=dot(v,scarpN),across=dot(v,vec2(-scarpN.y,scarpN.x));
  float plane=1.66-2.25*along+.055*across;
  float scarp=smoothstep(.23,.34,along)*(1.-smoothstep(.86,1.05,along))
      *(1.-smoothstep(.26,.55,abs(across+.10*(seed.z-.5))));
  h-=max(0.,h-max(0.,plane))*scarp;
  // The contact at each local support remains compact.  The existing global
  // unwarped 1.20 support is applied once more by liKarstBody.
  return form.x*h*(1.-smoothstep(.94,1.,r));
}'''


_JOINT_GLSL = r'''float liFlankJoints(vec2 q,float angle,float ph){
  vec2 v=liMassTurn(q,angle);
  float cut=0.;
  // Unequal, finite fracture traces across a structural direction.  Actual
  // removal creates broken side faces in H and the SDF, not painted lines.
  // Their ends and widths differ; no full-height periodic radial fan.
  for(int i=0;i<7;i++){
    float k=float(i),a=fract(sin(k*127.1+ph*19.17)*43758.5453);
    float b=fract(sin(k*311.7+ph*7.91)*22578.1459);
    float c=fract(sin(k*74.71+ph*31.43)*19642.3491);
    float centre=-.89+1.78*a,along=-.60+1.20*b;
    float span=.20+.39*c,width=.010+.014*b;
    float shift=(.017+.021*a)*sin(v.x*4.1+ph+k*2.7);
    float lateral=abs(v.y-centre+(.035-.07*c)*v.x-shift);
    float slit=1.-smoothstep(width*.24,width*1.9,lateral);
    float reach=1.-smoothstep(span*.55,span,abs(v.x-along));
    cut=max(cut,(.020+.045*c)*slit*reach);
  }
  return cut;
}
'''


def _replace_function(source: str, name: str, replacement: str) -> str:
    marker = 'float ' + name + '('
    if source.count(marker) != 1:
        raise ValueError(f'Expected one {name} definition')
    begin = source.index(marker)
    opening = source.index('{', begin)
    depth = 1
    at = opening + 1
    while at < len(source) and depth:
        if source.startswith('//', at):
            end = source.find('\n', at + 2)
            at = len(source) if end < 0 else end + 1
            continue
        if source.startswith('/*', at):
            end = source.find('*/', at + 2)
            if end < 0:
                raise ValueError('Unclosed GLSL comment')
            at = end + 2
            continue
        if source[at] == '{':
            depth += 1
        elif source[at] == '}':
            depth -= 1
        at += 1
    if depth:
        raise ValueError(f'Unclosed {name}')
    return source[:begin] + replacement + source[at:]


def build_peak_glsl(peaks: Sequence[Sequence[float]]) -> str:
    """Drop-in BASE_FUNCS writer, preserving all authored bound arrays."""
    source = m2.build_peak_glsl(peaks)
    source = _replace_function(source, 'liRockMass', _MASS_GLSL)
    anchor = '  float retention=body/(body+.12);'
    assert source.count(anchor) == 1
    source = source.replace(anchor, '  cuts+=liFlankJoints(q,joints.x,ph)/max(joints.z,.01);\n'+anchor)
    return source.replace('float liKarstBody(', _JOINT_GLSL+'\nfloat liKarstBody(', 1)


def _profiles(peaks: Sequence[Sequence[float]]) -> list[Profile]:
    # No editing of the M2 module globals: both implementations may safely be
    # imported by the same build/audit process for a paired comparison.
    return m2._profiles(peaks)


def _mass(x: float, z: float, mass: Lobe) -> float:
    vx, vz = m2._turn(x-mass.x, z-mass.z, mass.angle)
    vx /= mass.rx
    vz /= mass.rz
    rr = (math.sqrt(vx*vx+vz*vz+.0016)-.04)/.96
    seed = (
        _fract(mass.x*11.73+mass.z*7.19+mass.angle*.37),
        _fract(mass.z*13.41-mass.angle*.53+mass.height*3.17),
        _fract(mass.x*5.71-mass.z*9.23+mass.height*7.31),
        _fract(mass.angle*2.71+mass.x*17.13+mass.z*3.61),
    )
    support = tuple(1.04+.065*s for s in seed)
    sx = 0. if vx == 0. else math.copysign(1., vx)
    sz = 0. if vz == 0. else math.copysign(1., vz)
    planes = (
        abs(vx)*(1.+.025*sx*(seed[2]-.5))*support[0],
        abs(vz)*(1.+.035*sz*(seed[3]-.5))*support[1],
        abs((vx+vz)*.70710678118)*support[2],
        abs((vx-vz)*.70710678118)*support[3],
    )
    face_r = max(rr, (max(planes)-.04)/.96)
    r = max(0., rr+(face_r-rr)*m2._smooth(.20,.52,rr)*.94)
    crown_exponent = max(1.7,mass.crown*(.96+.06*seed[1]))
    flank_exponent = max(.32,mass.falloff*(.88+.08*seed[2]))
    h = max(0.,1.-r**crown_exponent)**flank_exponent
    bed_a = r+.075*vz-.038*vx
    start_a = .555+.055*(seed[0]-.5)
    shelf_a = (m2._smooth(start_a-.017,start_a+.017,bed_a)
               *(1.-m2._smooth(start_a+.105,start_a+.165,bed_a)))
    side_a = (m2._smooth(.015,.31,vx+.24*vz)
              *(1.-m2._smooth(.42,.82,abs(vz-.10))))
    bed_b = r+.058*vx+.095*vz
    start_b = .755+.060*(seed[3]-.5)
    shelf_b = (m2._smooth(start_b-.014,start_b+.014,bed_b)
               *(1.-m2._smooth(start_b+.060,start_b+.115,bed_b)))
    side_b = (m2._smooth(.045,.36,-vz-.23*vx)
              *(1.-m2._smooth(.34,.76,abs(vx+.12))))
    h = max(0.,h-(.035+.018*seed[1])*shelf_a*side_a
              -(.022+.012*seed[2])*shelf_b*side_b)
    nx,nz = ((-.97590148,.21821789) if seed[0]>=.48
             else (.24,.97077289))
    along = vx*nx+vz*nz
    across = -vx*nz+vz*nx
    plane = 1.66-2.25*along+.055*across
    scarp = (m2._smooth(.23,.34,along)*(1.-m2._smooth(.86,1.05,along))
             *(1.-m2._smooth(.26,.55,abs(across+.10*(seed[2]-.5)))))
    h -= max(0.,h-max(0.,plane))*scarp
    return mass.height*h*(1.-m2._smooth(.94,1.,r))


def _flank_joints(x: float, z: float, angle: float, ph: float) -> float:
    vx, vz = m2._turn(x,z,angle)
    cut=0.
    for i in range(7):
        a=_fract(math.sin(i*127.1+ph*19.17)*43758.5453)
        b=_fract(math.sin(i*311.7+ph*7.91)*22578.1459)
        c=_fract(math.sin(i*74.71+ph*31.43)*19642.3491)
        centre=-.89+1.78*a
        along=-.60+1.20*b
        span=.20+.39*c
        width=.010+.014*b
        shift=(.017+.021*a)*math.sin(vx*4.1+ph+i*2.7)
        lateral=abs(vz-centre+(.035-.07*c)*vx-shift)
        slit=1.-m2._smooth(width*.24,width*1.9,lateral)
        reach=1.-m2._smooth(span*.55,span,abs(vx-along))
        cut=max(cut,(.020+.045*c)*slit*reach)
    return cut


def sample_profile(profile: Profile, qx: float, qz: float) -> float:
    """CPU mirror of M3 liKarstBody/liRockMass, not a rendered quality test."""
    foot = math.hypot(qx,qz)
    if foot >= FOOT_RADIUS:
        return 0.
    ph = profile.phase
    x = (qx+profile.bend*(qz*qz-.12)+.025*math.sin(qz*5.3+ph)
         +.012*math.sin(qx*8.1+qz*2.7+ph*2.))
    z = qz+.028*math.sin(qx*4.1-ph*.7)+.018*math.sin(qz*7.3+qx*3.3+ph)
    masses = profile.lobes
    body = m2._join(_mass(x,z,masses[0]),_mass(x,z,masses[1]),.035)
    body = m2._join(body,_mass(x,z,masses[2]),.026)
    body = m2._join(body,_mass(x,z,masses[3]),.019)
    a = (masses[0].x*.43+masses[1].x*.57+.045,
         masses[0].z*.43+masses[1].z*.57-.075)
    b = (masses[0].x*.39+masses[2].x*.61-.082,
         masses[0].z*.39+masses[2].z*.61+.031)
    cuts = m2._cut(x,z,a,profile.joint_a,profile.width,ph,.86)
    cuts += .63*m2._cut(x,z,b,profile.joint_b,profile.width*1.22,ph+5.1,.74)
    cuts += .30*m2._cut(x,z,(masses[3].x+.08,masses[3].z+.02),
                       profile.joint_a+.54,profile.width*.76,ph+9.3,.54)
    body = max(0.,body-(profile.cut*cuts+_flank_joints(x,z,profile.joint_a,ph))*body/(body+.12))
    return body*(1.-m2._smooth(.98,1.20,foot))


def validate_peak_shapes(peaks: Sequence[Sequence[float]], resolution: int=65) -> dict:
    """Finite/compact checks plus paired geometric differences, not art scores."""
    if resolution < 17:
        raise ValueError('Use at least 17 samples per axis')
    profiles = _profiles(peaks)
    maximum = outside = boundary = total_delta = maximum_delta = 0.
    positive = negative = samples = 0
    signatures = []
    rows = []
    for index, profile in enumerate(profiles):
        top = 0.
        top_at = (0.,0.)
        area = [0,0,0]
        delta = 0.
        for zi in range(resolution):
            z = -1.20+2.40*zi/(resolution-1)
            for xi in range(resolution):
                x = -1.20+2.40*xi/(resolution-1)
                value = sample_profile(profile,x,z)
                old = m2.sample_profile(profile,x,z)
                if not math.isfinite(value) or not 0. <= value <= 1.10:
                    raise AssertionError(f'Invalid peak {index} body: {value}')
                change = value-old
                delta += abs(change)
                total_delta += abs(change)
                maximum_delta = max(maximum_delta,abs(change))
                samples += 1
                positive += change > 1e-6
                negative += change < -1e-6
                if value > top:
                    top,top_at = value,(x,z)
                for j,level in enumerate((.2,.5,.8)):
                    area[j] += value > level
        for n in range(64):
            angle = n*math.tau/64
            c,s = math.cos(angle),math.sin(angle)
            outside = max(outside,sample_profile(profile,1.2*c,1.2*s),
                          sample_profile(profile,1.28*c,1.28*s))
            boundary = max(boundary,sample_profile(profile,1.1999*c,1.1999*s))
        signature = tuple(round(sample_profile(profile,x,z),4)
                          for z in (-.6,-.3,0.,.3,.6)
                          for x in (-.6,-.3,0.,.3,.6))
        signatures.append(signature)
        maximum = max(maximum,top)
        if index < 12:
            cell = (2.4/(resolution-1))**2
            rows.append({'index':index,'top_fraction':round(top,6),
                         'top_local':top_at,
                         'areas_above_20_50_80':[round(n*cell,5) for n in area],
                         'mean_absolute_M2_difference':delta/resolution**2})
    if outside > 1e-10 or boundary > 1e-5:
        raise AssertionError('M3 peak escaped its compact foot support')
    if len(set(signatures)) != len(peaks):
        raise AssertionError('Two M3 peaks share the same sampled shape')
    return {'revision':REVISION,'count':len(peaks),'max_fraction':maximum,
            'outside_support_max':outside,'edge_inside_max':boundary,
            'support_radius':FOOT_RADIUS,'ray_envelope_radius':RAY_ENVELOPE_RADIUS,
            'distinct_sampled_shapes':len(set(signatures)),
            'mean_absolute_M2_difference':total_delta/samples,
            'max_absolute_M2_difference':maximum_delta,
            'sampled_points_raised':positive,'sampled_points_lowered':negative,
            'composed':rows,
            'validation':'CPU scalar field and bounds only; actual GPU visual/continuity/performance acceptance outstanding'}
