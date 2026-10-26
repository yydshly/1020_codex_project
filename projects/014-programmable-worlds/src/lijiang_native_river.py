"""A one-bounce, code-only calm river for the independently derived renderer.

Only this module is authored here. ``patch`` accepts the complete engine HTML
and returns its transformed source plus a provenance report; it does not write
the engine, start a renderer, alter the retained upstream or use external assets.
"""

from __future__ import annotations

import hashlib
import re

REVISION = "native-river-grazing-filter-4"


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _body_end(source: str, opening: int) -> int:
    """Find a balanced GLSL body while ignoring comment/string delimiters."""
    depth, index = 0, opening
    while index < len(source):
        if source.startswith("//", index):
            end = source.find("\n", index + 2)
            index = len(source) if end < 0 else end + 1
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end < 0:
                raise ValueError("Unclosed source comment")
            index = end + 2
            continue
        char = source[index]
        if char in "\"'":
            quote = char
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                elif source[index] == quote:
                    index += 1
                    break
                else:
                    index += 1
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1
    raise ValueError("Unclosed GLSL body")


def _functions(source: str, name: str) -> list[tuple[int, int, str]]:
    result = []
    pattern = re.compile(r"(?m)^[ \t]*(?:float|bool|vec[234]|void)\s+" + re.escape(name) + r"\s*\(")
    for match in pattern.finditer(source):
        index, depth = match.end(), 1
        while index < len(source) and depth:
            depth += (source[index] == "(") - (source[index] == ")")
            index += 1
        after = index
        while after < len(source) and source[after].isspace():
            after += 1
        if after >= len(source) or source[after] != "{":
            continue  # A forward declaration is not a function body.
        end = _body_end(source, after)
        result.append((match.start(), end, source[match.start():end]))
    return result


WAVES = r"""
// Native calm river: one code-defined spectrum for height and analytic slope.
// All amplitudes are metres. Small-scale slopes fade before becoming subpixel.
// No FFT ocean, shoaling, breakers, foam, beach swash or external normal map.
uniform float uLiWaveSpeed;
float liRiverFootprint(float rayDistance, vec3 rd) {
  // Project a screen pixel onto the water plane. A circular footprint leaves
  // near-horizontal views undersampled, especially in reflected bright sky.
  return max(.001,rayDistance*uTan*2./uRes.y)/max(-rd.y,.02);
}

vec3 liRiverSample(vec2 p, float footprint) {
  // Above the longest wave's exact filter cutoff every contribution is zero.
  if (footprint>=.48*19.) return vec3(0.);
  const float L[12] = float[12](19.,13.,8.,5.8,3.4,2.2,1.5,.9,.5,.28,.14,.07);
  const float A[12] = float[12](.008,.005,.0035,.003,.0022,.0016,.0012,.0007,.00045,.00025,.00014,.00007);
  vec3 sampleValue = vec3(0.);
  for (int i=uZero; i<12; i++) {
    float waveFilter=1.-smoothstep(.18,.48,max(footprint,.0001)/L[i]);
    if (waveFilter<=0.) continue;
    float fi=float(i);
    // Long waves retain the wind direction. Short waves cross one another
    // rather than forming an almost parallel, visibly artificial grating.
    float angle=i<3?.31+sin(fi*2.17+.8)*.84:.31+(fi-3.)*2.39996323;
    vec2 axis=vec2(sin(angle),cos(angle));
    float k=6.28318530718/L[i];
    float omega=sqrt((9.81*k+.000074*k*k*k)*tanh(k*3.5));
    float amplitude=A[i]*waveFilter*clamp(uOAmp,0.,2.)*.75;
    float phase=dot(p,axis)*k-omega*uTime*uLiWaveSpeed+fi*2.39996323;
    sampleValue.x+=amplitude*sin(phase);
    sampleValue.yz+=amplitude*k*cos(phase)*axis;
  }
  return sampleValue;
}

float oceanH(vec2 p, float pix, out vec4 sh) {
  sh=vec4(0.);
  return liRiverSample(p,pix).x;
}
""".strip()


HIT = r"""
bool waterHit(vec3 ro, vec3 rd, float tmax, out float tw) {
  // Above-river cameras: solve against exactly liRiverSample, not a flat plane
  // with unrelated normal noise. This conservative slab exceeds 2x sum(A).
  if (rd.y>=-.000001) return false;
  const float bound=.065;
  float lo=max(0.,(ro.y-bound)/-rd.y);
  float hi=min(tmax,(ro.y+bound)/-rd.y);
  if (lo>hi) return false;
  vec3 last=ro+rd*hi;
  if (last.y-liRiverSample(last.xz,liRiverFootprint(hi,rd)).x>0.) return false;
  float t=clamp(ro.y/-rd.y,lo,hi);
  for (int i=uZero;i<12;i++) {
    vec3 p=ro+rd*t;
    vec3 wave=liRiverSample(p.xz,liRiverFootprint(t,rd));
    float f=p.y-wave.x;
    if (abs(f)<.00015) { tw=t; return t<=tmax; }
    if (f>0.) lo=t; else hi=t;
    float derivative=rd.y-dot(wave.yz,rd.xz);
    float candidate=abs(derivative)>.000001?t-f/derivative:.5*(lo+hi);
    t=(candidate>lo&&candidate<hi)?candidate:.5*(lo+hi);
  }
  tw=.5*(lo+hi);
  return tw>=0.&&tw<=tmax;
}
""".strip()


FRESH_BED = r"""
float seaFloor(vec2 p, float w) {
  // Fresh-water alluvium, in the native river's metre coordinates. The signed
  // coast field supplies actual distance inside this river, not an ocean shelf.
  float z=p.y;
  float centre=46.*sin((z+140.)*.00168)+28.*sin((z-70.)*.0031)
    -430.*(1.-smoothstep(-1350.,-350.,z));
  float u=clamp((z+1350.)/1000.,0.,1.);
  float centreSlope=46.*.00168*cos((z+140.)*.00168)
    +28.*.0031*cos((z-70.)*.0031)
    +((z>-1350.&&z< -350.)?430.*6.*u*(1.-u)/1000.:0.);
  float transverseScale=inversesqrt(1.+centreSlope*centreSlope);
  float halfWidth=170.*(1.+.11*sin(z*.0013-.4)+.055*cos(z*.0037))*transverseScale;
  float transverse=(p.x-centre)*transverseScale;
  float drift=.19*halfWidth*sin(z*.0018+.8)+6.*vnoise(vec2(z*.0023,19.7));
  float channel=exp(-pow((transverse-drift)/max(halfWidth*.46,12.),2.));
  float along=.5+.5*vnoise(vec2(z*.0015+7.3,31.2));
  float channelDepth=4.25+1.15*along+(1.25+.70*along)*channel;
  // A short, irregular wet foot falls into the channel. It does not create a
  // broad constant-depth sand terrace or a repeated pale band along both banks.
  float run=7.+7.*(.5+.5*fbm(p*.008+vec2(13.1,41.7),3));
  float profile=1.-exp(-pow(max(w,0.)/max(run,3.),1.22));
  float depth=.20+(channelDepth-.20)*profile;
  float grains=.075*fbm(p*.14+vec2(8.3,17.1),3)+.025*vnoise(p*.63+11.9);
  depth+=grains*smoothstep(1.,9.,w);
  return -clamp(depth,.20,8.0);
}
""".strip()


BED_HIT = r"""
bool liRiverBedHit(vec3 ro, vec3 rd, float maximumDistance, out float distanceToBed) {
  // The submerged bed is precisely the generated Hc heightfield, without
  // trees. A short bracket and ten bisections avoid a second full SDF march.
  if (rd.y>=-.000001) return false;
  float lower=.002;
  float clearance=ro.y-Hc(ro.xz);
  if (clearance<=0.) { distanceToBed=0.; return true; }
  float upper=min(maximumDistance,max(.12,clearance/max(-rd.y,.12)*.43));
  for (int bracketIndex=uZero;bracketIndex<8;bracketIndex++) {
    vec3 probe=ro+rd*upper;
    float separation=probe.y-Hc(probe.xz);
    if (separation<=0.) {
      for (int bisectIndex=uZero;bisectIndex<10;bisectIndex++) {
        float middle=.5*(lower+upper);
        vec3 atMiddle=ro+rd*middle;
        if (atMiddle.y>Hc(atMiddle.xz)) lower=middle;
        else upper=middle;
      }
      distanceToBed=.5*(lower+upper);
      return true;
    }
    if (upper>=maximumDistance) return false;
    lower=upper;
    upper=min(maximumDistance,upper*2.+.10);
  }
  return false;
}
""".strip()


# The source uses globals as SDF/shading result channels. Nested reflection and
# bed marches must not replace the primary ray's footprint, material hints,
# cloud scratch values or debugging state. Uniforms are deliberately untouched.
_STATE = {
    "float": "gCuT gCuK gCuE gCuH gCuS gPix gEpsM gClId gDe gSpr gLeafId gLeafW gInner gCarpIn gCarpHit tClId tDe tSpr tLeafId tLeafW tInner gRkSl gRkSt gRkC gRkSlab gRkS10 gRkRdY gRkAn gCanW gCanAO gWhy gIt gShStart gShG gRkSea gFrCav gFrWt gFrUp gFrTn gCCsh gNau gInw gCCid gDbgW gHz",
    "bool": "gVeg",
    "vec3": "gClOff tClOff gCrownOff",
    "vec4": "gCrC gFr tFr gFrW gPalmC tPalmC gRk",
}


def _state_code() -> tuple[str, str]:
    save, restore = [], []
    for kind, names in _STATE.items():
        for name in names.split():
            save.append(f"  {kind} liSaved_{name}={name};")
            restore.append(f"  {name}=liSaved_{name};")
    return "\n".join(save), "\n".join(restore)


_SAVE, _RESTORE = _state_code()

SHADE = (r"""
// Moved from the atmosphere section: the function bodies there remain intact.
float gHz=0.;
vec3 fogApply(vec3 col, vec3 ro, vec3 rd, float t);

__BED_HIT__

vec3 shadeWater(vec3 pos, vec3 rd, float t) {
__SAVE__
  float pixel=max(.001,t*uTan*2./uRes.y);
  vec3 wave=liRiverSample(pos.xz,liRiverFootprint(t,rd));
  vec3 N=normalize(vec3(-wave.y,1.,-wave.z));
  vec3 V=-rd;
  // Same source sky/cloud radiance; the source sky contains the sun disc, so
  // no second direct-sun highlight is added on top of the reflected sun.
  vec3 R=reflect(rd,N);
  vec3 reflected;
  if (R.y>-.002) {
    vec3 origin=pos+N*.055;
    float reflectedDistance=0.; vec4 reflectedInfo=vec4(0.);
    bool hit=march(origin,R,.06,12000.,reflectedDistance,reflectedInfo);
    if (hit) {
      vec3 hitPosition=origin+R*reflectedDistance;
      // Full scene: individual SDF crowns, rock relief, own shadow/AO and sky
      // fill are shaded by the unchanged source land shader. Never terrainCheap.
      reflected=shadeScene(hitPosition,R,t+reflectedDistance,reflectedInfo);
      reflected=fogApply(reflected,origin,R,reflectedDistance);
    } else {
      reflected=skyView(R);
    }
  } else {
    // A facet facing the adjacent water gets a finite water/horizon fallback.
    // It does not recursively shadeWater, look through a second water surface,
    // or manufacture a white breaking-wave patch.
    reflected=mix(vec3(.006,.014,.010),skyDome(normalize(vec3(R.x,.015,R.z))),.08);
  }

  vec3 sigma=vec3(.26,.13,.31); // blue/red attenuate faster than green; no cyan body glow
  float sunlight=shadow(vec3(pos.x,pos.y+.12,pos.z),uSun,0.);
  vec3 skyLight=skyIrr(vec3(0,1,0))*1.1;
  vec3 sunLight=SUN*max(uSun.y,0.)*mix(.22,1.,sunlight);
  vec3 deep=vec3(.012,.029,.019)*(sunLight+skyLight)*.20;

  // Snell transmission follows the actual generated river bed. It is not a
  // reflected screen copy or a fixed shallow-water colour painted at the bank.
  vec3 T=refract(rd,N,1./1.333);
  float expected=max(.1,(pos.y-Hc(pos.xz))/max(-T.y,.12));
  float bedDistance=0.;
  vec3 bedOrigin=pos-N*.04;
  bool bedHit=liRiverBedHit(bedOrigin,T,min(32.,max(14.,expected*2.+3.)),bedDistance);
  vec3 transmitted=deep;
  if (bedHit) {
    vec3 bedPosition=bedOrigin+T*bedDistance;
    const float e=.8;
    vec3 bedNormal=normalize(vec3(Hc(bedPosition.xz-vec2(e,0))-Hc(bedPosition.xz+vec2(e,0)),2.*e,Hc(bedPosition.xz-vec2(0,e))-Hc(bedPosition.xz+vec2(0,e))));
    float detail=1.-smoothstep(.18,.65,pixel);
    float sediment=clamp(.5+.45*fbm(bedPosition.xz*.17+vec2(8.3,17.1),3),0.,1.);
    float grains=(voronoi(bedPosition.xz*1.2).x-.3)*detail;
    // Wet silt/fine gravel: dark neutral grey-olive reflectance in linear RGB.
    // Sediment variation stays within ~.025-.07, rather than luminous yellow sand.
    vec3 bedAlbedo=mix(vec3(.030,.033,.027),vec3(.066,.070,.060),sediment)*(.95+.06*grains);
    float depth=max(0.,pos.y-bedPosition.y);
    vec3 underSun=-refract(-uSun,N,1./1.333);
    vec3 bedIrradiance=SUN*max(dot(bedNormal,underSun),0.)*sunlight*exp(-sigma*depth/max(underSun.y,.12))+skyLight*.72;
    vec3 through=exp(-sigma*bedDistance);
    transmitted=bedAlbedo*bedIrradiance*through+deep*(vec3(1.)-through);
  }
  float fresnel=.02037+.97963*pow(1.-clamp(dot(N,V),0.,1.),5.);
  vec3 riverColor=mix(transmitted,reflected,fresnel);
__RESTORE__
  return max(riverColor,vec3(0.));
}
""".strip().replace("__SAVE__", _SAVE).replace("__RESTORE__", _RESTORE).replace("__BED_HIT__", BED_HIT))


EDGE = r"""
vec3 waterEdge(vec3 pT, vec3 rd, float tT, vec3 col) {
  // An inland quiet bank has no inherited marine foam/swash overlay.
  return col;
}
""".strip()

_PRESERVE = (
    "landH", "terrSD", "sceneSD", "march", "treesSD", "bushSD",
    "crownSD", "leafyShade", "shadeScene", "sceneNormal", "sceneAO",
    "rockField", "rockAlbedo", "skyView", "skyDome", "skyIrr", "skyFill",
    "shadow", "shadowH", "fogApply", "eroFlutes", "massif",
)

# A first actual GL compile exposed `filter` as a GLSL reserved future word.
# Keep the declaration check separate from JS template extraction: neither
# claims to replace the eventual real GPU compilation and image review.
_RESERVED_IDENTIFIERS = set("""
common partition active asm class union enum typedef template this resource
goto inline noinline public static extern external interface long short half
fixed unsigned superp input output hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 fvec2
fvec3 fvec4 sampler3DRect filter sizeof cast namespace using row_major
""".split())


def _check_declarations() -> int:
    code = "\n".join((WAVES, HIT, FRESH_BED, SHADE, EDGE))
    code = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", code)
    names = set(re.findall(r"\b(?:float|bool|int|vec[234]|mat[234])\s+(\w+)", code))
    forbidden = names & _RESERVED_IDENTIFIERS
    if forbidden:
        raise ValueError("Reserved GLSL declaration identifier: " + ", ".join(sorted(forbidden)))
    return len(names)


def patch(source: str) -> tuple[str, dict]:
    """Patch the calm river's live entry points and return an explicit audit."""
    if "vec3 liRiverSample(" in source:
        raise ValueError("River patch already applied")
    checked_declarations = _check_declarations()
    before = source
    preserved = {name: [_sha(block) for _, _, block in _functions(source, name)] for name in _PRESERVE}
    if any(not blocks for blocks in preserved.values()):
        raise ValueError("Expected complete source land/forest/atmosphere functions are absent")
    declaration = "float gHz=0.;"
    if source.count(declaration) != 1:
        raise ValueError("Expected one source atmosphere diagnostic declaration")
    source = source.replace(declaration, "// gHz diagnostic is declared before the nested river shader.", 1)
    records = []
    for name, selector, replacement in [
        ("oceanH", lambda block: "out vec4 sh" in block[:block.index("{")], WAVES),
        ("waterHit", lambda block: True, HIT),
        ("shadeWater", lambda block: True, SHADE),
        ("waterEdge", lambda block: True, EDGE),
        ("seaFloor", lambda block: True, FRESH_BED),
    ]:
        matches = [(a, b, block) for a, b, block in _functions(source, name) if selector(block)]
        if len(matches) != 1:
            raise ValueError(f"Expected one complete {name} body, found {len(matches)}")
        start, end, original = matches[0]
        source = source[:start] + replacement + source[end:]
        records.append({"function": name, "originalSha256": _sha(original), "replacementSha256": _sha(replacement), "originalLines": original.count("\n") + 1, "replacementLines": replacement.count("\n") + 1})
    for name, expected in preserved.items():
        actual = [_sha(block) for _, _, block in _functions(source, name)]
        if actual != expected:
            raise ValueError("River transform changed a retained source function: " + name)
    water_body = _functions(source, "shadeWater")[0][2]
    for forbidden in ["terrainCheap(", "foamTex(", "shoal(", "swash(", "whitecaps(", "skyRefl("]:
        if forbidden in water_body:
            raise ValueError("Inherited marine approximation remained live: " + forbidden)
    if water_body.count("shadeWater(") != 1:
        raise ValueError("Recursive water shading is forbidden")
    if water_body.count("march(") != 1 or "liRiverBedHit(" not in water_body:
        raise ValueError("Only reflection may use the full scene marcher; the bed must use Hc")
    bed_body = _functions(source, "seaFloor")[0][2]
    for forbidden in ["uNSH", "uSH[", "uWT", "wBayM(", "vec2(172.,626.)"]:
        if forbidden in bed_body:
            raise ValueError("Marine bed structure remained live: " + forbidden)
    if source.count("float gHz=0.;") != 1:
        raise ValueError("Atmosphere diagnostic relocation failed")
    if not re.search(r"vec3\s+fogApply\([^;{}]+\);", source):
        raise ValueError("Nested atmosphere shading needs its forward declaration")
    report = {
        "schema": "lijiang-native-river-transform-v1", "revision": REVISION,
        "inputSha256": _sha(before), "outputSha256": _sha(source),
        "replacements": records, "preservedFunctionSha256": preserved,
        "globalStateSavedAndRestored": {kind: names.split() for kind, names in _STATE.items()},
        "globalDeclarationRelocation": {"name": "gHz", "reason": "Allow nested fogApply state save/restore; atmosphere function body unchanged"},
        "reflection": "One real march + unchanged shadeScene + unchanged fogApply; same source skyView for sky misses. No terrainCheap brightness cap, no recursive water.",
        "waterGeometry": "Shared analytic 12-wave height/gradient and shared grazing-correct footprint for intersection and shading, at unchanged 0.75 quiet amplitude, with conservative-slab bracketed Newton intersection; peak envelope 0.039165m < 0.065m at uOAmp<=2.",
        "waveSampling": {"footprint": "max(0.001, t*2*uTan/uRes.y) / max(-rd.y,0.02), shared by waterHit and shadeWater", "directionDistribution": "First three long waves keep the existing wind directions; remaining nine advance by the golden angle 2.39996323 radians", "zeroWeightWork": "Return exact zero beyond the longest-wave filter cutoff; skip each exact-zero filter before wave direction/dispersion/phase evaluation", "bedDetail": "Unchanged base screen-pixel footprint, without grazing correction", "amplitudesChanged": False, "brightnessClampAdded": False},
        "transmission": "Snell ray intersects actual Hc bed through at most eight brackets and ten bisections, then uses Hc normal, code-only wet-silt albedo and per-metre two-way attenuation.",
        "freshwaterBed": "New seaFloor function only: ~0.20m irregular wet foot to a 4-8m along-channel/transverse alluvial bed; no inherited Pacific reef/cove coordinates or shelf terms.",
        "opticsLinear": {"bedLow": [.030, .033, .027], "bedHigh": [.066, .070, .060], "absorptionPerMetre": [.26, .13, .31], "deepReflectance": [.012, .029, .019], "deepScale": .20},
        "marineEffects": "Disabled at all live water entries; inherited unreachable helper definitions remain for transparent source provenance.",
        "performance": "Reflection retains one extra full land/crown/shadow shade. The bed uses <=18 bracket/bisection Hc lookups instead of the full scene/SDF/tree marcher; actual cost requires hidden GPU measurement. No FPS promise.",
        "knownApproximation": "skyView retains the source uRo-based cloud origin; clouds are distant, while reflected land/crowns use the true water-surface ray origin.",
        "gpuStarted": False, "externalAssets": 0,
        "cpuReservedDeclarationCheck": {"checkedIdentifiers": checked_declarations, "forbidden": [], "scope": "Static declaration check, not GPU compilation"},
    }
    return source, report
