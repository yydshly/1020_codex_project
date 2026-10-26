"""M4 rock substrate stays independent of the ecological potential field.

The M3 finite-block relief and explicit combined +/-10 bound are retained.
Only terrSD's V-derived bare weight is overridden; actual plant/canopy fields
keep their own contracts, while exported gVeg=false rock geometry ignores V.
"""
from __future__ import annotations

import hashlib
from lijiang_m3_rock_relief import patch as patch_m3_relief
from lijiang_native_march import _functions

REVISION = 'm4-rock-substrate-independent-of-v-1'


def patch(source: str):
    source, base = patch_m3_relief(source)
    matches = _functions(source, 'terrSD')
    if len(matches) != 1:
        raise ValueError('Expected exactly one terrSD for M4 substrate')
    begin, end, original = matches[0]
    anchor = 'float bare=1.-smoothstep(.25,.75,vm.r);'
    if original.count(anchor) != 1:
        raise ValueError('M4 rock/vegetation decoupling anchor changed')
    terrain = original.replace(anchor,
        'float bare=1.; // M4: independent rock substrate; V is habitat potential', 1)
    report = {**base, 'revision': REVISION, 'baseReliefRevision': base['revision'],
        'baseTerrSDSHA256': base['terrainOffsetSHA256'],
        'terrainOffsetSHA256': hashlib.sha256(terrain.encode()).hexdigest(),
        'rockBareWeight': 1,
        'exportedRockGeometryDependsOnVegetation': False,
        'invarianceScope': 'terrSD gVeg=false volume export; canopy evaluation with gVeg=true still uses V',
        'steepRockMaskRetained': True,
        'scope': base['scope']+'; fixed bare=1 decouples rock relief and bicubic correction from M4 vegetation potential',
        'gpuReviewed': False}
    return source[:begin]+terrain+source[end:], report
