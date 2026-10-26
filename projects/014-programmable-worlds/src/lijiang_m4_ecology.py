"""M4 habitat fields: wooded karst shoulders, summit scrub and moist gullies.

The retained ecology module remains the lowland baseline. Changes below are
guarded, M4-only field/placement overrides; the source RGBA contracts and all
field resolutions remain intact. These are candidate habitats, not permission
to attach a tree to a heightfield point without checking its actual SDF root.
"""
from __future__ import annotations

import hashlib
import lijiang_native_ecology as retained

REVISION = 'm4-montane-vegetation-potential-2'


def _once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError('M4 ecology source boundary changed: '+before[:100])
    return source.replace(before, after, 1)


def _vegetation(source: str) -> str:
    source = _once(source,
        '''  // Soil is both locally slope-limited and patch-dependent.  Ledges and wet
  // fissures carry vegetation down a wall, while dry convex crowns expose rock.''',
        '''  // Mountain habitats follow spatial moisture/cohort patches. The macro
  // heightfield cannot decide whether a finer signed-field ledge supports soil.''')
    begin = source.index('  float soil=')
    end = source.index('  // Lowland forest is a mosaic', begin)
    source = source[:begin] + r'''  // V is montane vegetation POTENTIAL, not a second support test. Macro H
  // slopes cannot resolve signed-field shelves. Actual surface normals and
  // root footprints reject sheer faces later, without clearing the whole peak.
  float soilPotential=clamp(.76+.24*moisture+.12*hollow-.10*ridge,.45,1.);
  float mountainPatch=smoothstep(.33,.59,.48*broad+.32*medium+.18*moisture
    +.10*hollow-.06*ridge+.035*fine);
  float shrubMat=soilPotential*(.13+.82*mountainPatch);
  // Interrupted damp fissures supply additional potential. Actual geometry
  // support, rather than this macro map, prevents a painted vertical wall.
  float fractureNoise=vnoise(wp*vec2(.031,.022)+vec2(.0035*h,.0045*h)+11.7);
  float fissure=1.-smoothstep(.05,.20,abs(fractureNoise));
  float pocket=smoothstep(.48,.70,.43*fissure+.25*medium+.22*moisture
    +.15*hollow-.12*ridge);
  float wallGrowth=pocket*mix(.40,.76,moisture);
  float cover=max(shrubMat,wallGrowth);
''' + source[end:]
    source = _once(source,
        '''  float forest=(.18+.77*grove)*(1.-.90*clearing)*(1.-smoothstep(.45,1.3,slB));
  forest*=mix(.65,1.,moisture)*(1.-.5*ridge);''',
        '''  float lowlandForest=(.18+.77*grove)*(1.-.90*clearing)*(1.-smoothstep(.45,1.3,slB));
  lowlandForest*=mix(.65,1.,moisture)*(1.-.5*ridge);
  // Convex exposed crowns become short scrub, while sheltered shoulders and
  // gullies support patchy woodland. The same 35--150m habitat crosses peaks.
  float mountainForest=(.12+.68*mountainPatch)*soilPotential
    *mix(.62,1.,moisture)*(1.-.16*ridge);
  float forest=mix(mountainForest,lowlandForest,lowland);''')
    return source


def _plants(source: str) -> str:
    source = _once(source,
        '''  float slB=length(vec2(Hs(p+vec2(eb,0))-Hs(p-vec2(eb,0)),Hs(p+vec2(0,eb))-Hs(p-vec2(0,eb))))/(2.*eb);''',
        '''  float slB=length(vec2(Hs(p+vec2(eb,0))-Hs(p-vec2(eb,0)),Hs(p+vec2(0,eb))-Hs(p-vec2(0,eb))))/(2.*eb);
  float surroundingMin=min(min(Hs(p+vec2(60.,0.)),Hs(p-vec2(60.,0.))),min(Hs(p+vec2(0.,60.)),Hs(p-vec2(0.,60.))));
  float localRelief=max(0.,h-surroundingMin);
  float mountain=max(smoothstep(7.,26.,localRelief),smoothstep(.35,.95,slB));
  float hollow=1.-smoothstep(-2.8,.8,at.g),ridge=smoothstep(.8,5.5,at.g);''')
    source = _once(source,
        '''    float dens=vm.r*(1.-smoothstep(.42,.90,slB))*(1.-smoothstep(1.15,2.1,sl));
    dens*=mix(.55,.94,grove)*mix(.75,1.05,at.a)*.64*uDens;''',
        '''    float lowlandDens=vm.r*(1.-smoothstep(.42,.90,slB))*(1.-smoothstep(1.15,2.1,sl));
    lowlandDens*=mix(.55,.94,grove)*mix(.75,1.05,at.a)*.64*uDens;
    // V.a already contains forest occupancy times cover. Compact mountain
    // trees may root on sloping shoulders; sheer limestone is still rejected.
    float mountainDens=vm.a*(1.-smoothstep(.90,1.75,slB))
      *(1.-smoothstep(1.15,2.1,sl))*(.55+.20*grove+.15*at.a)*.78*uDens;
    float dens=mix(lowlandDens,mountainDens,mountain);''')
    source = _once(source,
        '''    R=min(R,uG.z*.745);''',
        '''    float mountainR=mix(1.55,3.9,clamp(.65*age+.35*r2,0.,1.))
      *mix(1.,.74,smoothstep(.45,1.4,slB))*mix(1.,.78,ridge);
    R=mix(R,mountainR,mountain);
    R=min(R,uG.z*.745);''')
    source = _once(source, '    float rootSpan=R*1.2;',
        '    float rootSpan=R*mix(1.2,.85,mountain);')
    source = _once(source,
        '    if(rootMax-rootMin>mix(6.5,11.,smoothstep(3.,8.,R)))return;',
        '''    float rootLimit=mix(mix(6.5,11.,smoothstep(3.,8.,R)),3.5+.85*R,mountain);
    if(rootMax-rootMin>rootLimit)return;''')
    source = _once(source,
        '    float sp=(r3>.93&&age>.62&&slB<.22&&clearing<.1)?2.:1.;',
        '    float sp=(r3>.93&&age>.62&&slB<.22&&clearing<.1&&mountain<.2)?2.:1.;')
    source = _once(source, '    o.z-=R*.45*smoothstep(.3,.8,sl);',
        '    o.z-=R*mix(.45,.18,mountain)*smoothstep(.3,.8,sl);')
    source = _once(source,
        '''    float dens=vm.r*(1.-smoothstep(.55,1.05,slB))*(.28+.48*edge+.22*at.a);''',
        '''    float lowlandDens=vm.r*(1.-smoothstep(.55,1.05,slB))*(.28+.48*edge+.22*at.a);
    float mountainDens=vm.r*(1.-smoothstep(1.35,2.9,slB))
      *(1.-smoothstep(2.2,4.2,sl))*(.16+.46*edge+.34*at.a+.20*hollow);
    float dens=mix(lowlandDens,mountainDens,mountain);''')
    source = _once(source,
        '''    o.w=mix(uRmin*.72,uRmax,mix(r2*r2,r2,.6*edge))*(1.-.32*smoothstep(.8,1.9,sl));''',
        '''    float lowlandR=mix(uRmin*.72,uRmax,mix(r2*r2,r2,.6*edge))*(1.-.32*smoothstep(.8,1.9,sl));
    float mountainR=mix(.55,1.65,clamp(.55*r2+.30*medium+.15*at.a,0.,1.))
      *mix(1.,.80,smoothstep(1.,2.5,slB));
    o.w=mix(lowlandR,mountainR,mountain);''')
    return source


VEGETATION = _vegetation(retained.VEGETATION)
PLANTS = _plants(retained.PLANTS)


def patch_plants(body: str) -> str:
    retained.patch_plants(body)  # validate the original retained packing schema
    return PLANTS


def description() -> dict[str, object]:
    return {
        'revision': REVISION,
        'derivedFrom': retained.REVISION,
        'material': 'Montane green-patch potential across shoulders and moist gullies; macro heightfield slope does not erase unresolved SDF shelves. Actual surface support rejects vertical faces during material/plant construction.',
        'riparianForest': 'Retained lowland grove/clearing mosaic; compact montane tree candidates and dwarf shrub colonies follow the same V habitat fields',
        'classification': 'Local 9m slope, 60m relative relief, aspect, convexity, flow and warped 35–150m patches; no absolute altitude vegetation band',
        'vegetationContract': {'r': 'montane green-patch potential; retained lowland cover', 'a': 'forest occupancy times potential', 'g': 0, 'b': 0},
        'sourceTreeEncodingPreserved': True,
        'rootSupport': 'Four crown-footprint height samples; smaller montane crowns and local relief budget; actual SDF surface reanchoring remains mandatory in the raster forest',
        'fullyMontaneTreeRadiusMetres': [.89466, 3.9],
        'fullyMontaneShrubRadiusMetres': [.44, 1.65],
        'transition': 'Continuous blend with retained lowland radii where relative-relief/slope mountain classification is between zero and one',
        'sourceResolutionsChanged': False,
        'newVegetationHeightLookups': 0,
        'newPlantHeightLookupsPerCandidate': 4,
        'newNoiseCalls': 0,
        'perRayFunctionsChanged': [],
        'vegetationSHA256': hashlib.sha256(VEGETATION.encode()).hexdigest(),
        'plantsSHA256': hashlib.sha256(PLANTS.encode()).hexdigest(),
        'geometrySemantics': 'M4 rock wrapper fixes terrSD bare=1, so exported gVeg=false rock geometry is independent of this V potential. Base height/76 peak layout and all sampling resolutions remain unchanged.',
        'externalAssets': 0,
        'artAccepted': False,
    }
