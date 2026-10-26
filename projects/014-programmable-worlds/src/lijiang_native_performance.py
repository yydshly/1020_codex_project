"""Optional conservative peak-interval experiment, disabled in release builds.

The existing march searches every four metres between the first and the last
peak AABB along a ray. This candidate instead finds the nearest remaining AABB
after leaving the current one. It skips only an empty *AABB-free* gap above the
existing 60 m lowland boundary. It does not change sceneSD, ENV, root finding,
leaf hits, shading, water, or resolution. Performance still needs GPU evidence:
extra slab scans can cost more than the eliminated height samples.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re

from lijiang_native_march import _functions, _native_boxes

REVISION = 'native-nearest-peak-interval-experiment-1'

NEAREST_INTERVAL = r'''
bool liNativePeakInterval(vec3 ro,vec3 rd,float tmin,float tmax,out float enter,out float leave){
  vec3 direction=mix(vec3(-1.),vec3(1.),step(vec3(0.),rd));
  vec3 inverse=direction/max(abs(rd),vec3(1e-8));
  enter=1e30;leave=-1e30;
  for(int j=uZero;j<LI_INTERVAL_COUNT;j++){
    vec3 ta=(LI_RAY_LO[j]-ro)*inverse,tb=(LI_RAY_HI[j]-ro)*inverse;
    vec3 near=min(ta,tb),far=max(ta,tb);
    float a=max(tmin,max(near.x,max(near.y,near.z)));
    float b=min(tmax,min(far.x,min(far.y,far.z)));
    if(b<a)continue;
    // Only the first remaining interval. Overlapping boxes need not be
    // sorted/merged: after leave, another scan clips any overlap to tmin.
    if(a<enter){enter=a;leave=b;}
    else if(a==enter){leave=max(leave,b);}
  }
  return leave>=enter;
}
'''.strip()

OLD_BRANCH = '''        if(!peakRay||t>peakLeave){
          if(rd.y>=0.||lowland>tmax){gWhy=1.;gEpsM=0.;return false;}
          t=max(t+.0001,lowland);inEnv=false;continue;
        }'''

NEW_BRANCH = '''        // Requery only after leaving the current conservative peak box.
        // No height field / crown can lie in an AABB-free gap above 60 m;
        // the retained lowland boundary and 48 m crown padding are unchanged.
        if(peakRay&&t>peakLeave)
          peakRay=liNativePeakInterval(ro,rd,t,tmax,peakEnter,peakLeave);
        if(!peakRay){
          if(rd.y>=0.||lowland>tmax){gWhy=1.;gEpsM=0.;return false;}
          t=max(t+.0001,lowland);inEnv=false;continue;
        }'''


def patch_nearest_intervals(shader: str) -> tuple[str, dict]:
    """Patch an already generated native FS_RENDER; caller explicitly opts in."""
    functions = _functions(shader, 'liNativePeakInterval')
    if len(functions) != 1:
        raise ValueError('Expected one native peak interval function')
    counts = re.findall(r'const vec3 LI_RAY_LO\[(\d+)\]', shader)
    if len(counts) != 1 or not 60 <= int(counts[0]) <= 90:
        raise ValueError('Invalid existing conservative peak bounds')
    if shader.count(OLD_BRANCH) != 1:
        raise ValueError('Native high-air branch changed; refuse blind patch')
    start, end, _ = functions[0]
    patched = shader[:start] + NEAREST_INTERVAL.replace('LI_INTERVAL_COUNT', counts[0]) + shader[end:]
    patched = patched.replace(OLD_BRANCH, NEW_BRANCH, 1)
    # Verify that all complete shading/geometry functions except the intended
    # march and interval helper remain byte-identical, including root finding.
    preserved = ('liNativeGroundRoot', 'H', 'Hc', 'terrSD', 'sceneSD', 'treesSD',
                 'bushSD', 'shadeScene', 'fogApply', 'shadeWater')
    verified = []
    for name in preserved:
        before, after = _functions(shader, name), _functions(patched, name)
        if before != after and [x[2] for x in before] != [x[2] for x in after]:
            raise ValueError('Unintended shader function change: ' + name)
        if before:
            verified.append(name)
    return patched, {
        'revision': REVISION,
        'enabledByDefault': False,
        'boundsCount': int(counts[0]),
        'shaderBeforeSHA256': hashlib.sha256(shader.encode()).hexdigest(),
        'shaderAfterSHA256': hashlib.sha256(patched.encode()).hexdigest(),
        'preservedFunctions': verified,
        'claim': 'Only certified AABB-free high-air gaps are skipped; speed and rendered image equivalence remain unverified until an actual hidden GPU comparison.'
    }


def _ray_intervals(origin, direction, boxes, tmin=0., tmax=14000.):
    intervals = []
    for lower, upper in boxes:
        near, far = tmin, tmax
        for axis in range(3):
            if abs(direction[axis]) < 1e-12:
                if not lower[axis] <= origin[axis] <= upper[axis]:
                    near, far = 1., 0.
                    break
            else:
                a = (lower[axis] - origin[axis]) / direction[axis]
                b = (upper[axis] - origin[axis]) / direction[axis]
                near, far = max(near, min(a, b)), min(far, max(a, b))
        if far >= near:
            intervals.append((near, far))
    return intervals


def interval_cpu_probe(engine: str) -> dict:
    """Exact box coverage, not a GPU speed estimate or artwork acceptance."""
    boxes = _native_boxes(engine)
    cameras = [
        ((-13.1824, 36., 1350.), (380., 92., 450.)),
        ((14.7384, 76., 1050.), (500., 125., -100.)),
        ((-5., 54., 830.), (530., 75., -320.)),
        ((-50., 16., 650.), (520., 0., -480.)),
        ((152.6776, 64., 500.), (530., 125., -200.)),
    ]
    def norm(vector):
        length = math.sqrt(sum(x*x for x in vector))
        return tuple(x/length for x in vector)
    rows = []
    for origin, target in cameras:
        forward = norm(tuple(b-a for a,b in zip(origin,target)))
        right = norm((forward[2], 0., -forward[0]))
        up = (forward[1]*right[2]-forward[2]*right[1],
              forward[2]*right[0]-forward[0]*right[2],
              forward[0]*right[1]-forward[1]*right[0])
        # right x forward = downward with this source camera convention;
        # forward x right yields the real camera's positive up.
        ray_count, intersected, total_span, total_union, segments = 0, 0, 0., 0., 0
        for row in range(20):
            for column in range(32):
                ray_count += 1
                x = ((column+.5)/32.*2.-1.)*(1440./902.)*math.tan(math.radians(29.))
                y = ((row+.5)/20.*2.-1.)*math.tan(math.radians(29.))
                direction = norm(tuple(forward[i]+x*right[i]+y*up[i] for i in range(3)))
                intervals = sorted(_ray_intervals(origin, direction, boxes))
                if not intervals:
                    continue
                intersected += 1
                merged = []
                for a,b in intervals:
                    if merged and a <= merged[-1][1]:
                        merged[-1] = (merged[-1][0], max(merged[-1][1], b))
                    else:
                        merged.append((a,b))
                total_span += max(b for _,b in intervals)-min(a for a,_ in intervals)
                total_union += sum(b-a for a,b in merged)
                segments += len(merged)
                # Independently walk nearest intervals using the same clipped
                # slab semantics. Every jump must be disjoint from every box.
                cursor = 0.
                for _ in range(len(boxes)+1):
                    remaining = [(max(a,cursor),b) for a,b in intervals if b >= cursor]
                    if not remaining:
                        break
                    enter = min(a for a,_ in remaining)
                    leave = max(b for a,b in remaining if a == enter)
                    if any(max(a,cursor) < min(b,enter) for a,b in intervals):
                        raise AssertionError('A skipped gap intersects a conservative peak box')
                    # Exit just beyond leave; exact closed boundaries contain
                    # no omitted positive-width span.
                    cursor = math.nextafter(leave, math.inf)
                else:
                    raise AssertionError('Nearest interval traversal failed to terminate')
        rows.append({'origin': origin, 'target': target, 'sampledRays': ray_count,
                     'raysIntersectingPeaks': intersected, 'aggregateSpanMetres': total_span,
                     'actualBoxUnionMetres': total_union,
                     'certifiedEmptyGapMetres': total_span-total_union,
                     'fractionOfAggregateSpanCertifiedEmpty': 1.-total_union/total_span if total_span else 0.,
                     'meanDisconnectedSegmentsPerIntersectingRay': segments/intersected if intersected else 0.})
    return {'revision': REVISION, 'scope': 'CPU slab coverage only; not GPU performance or scene geometry/visual acceptance',
            'allSkippedGapsOutsideEveryConservativePeakBox': True, 'views': rows}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', type=Path, default=Path(__file__).resolve().parents[1]/'web/lijiang-native/engine.html')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = interval_cpu_probe(args.engine.read_text(encoding='utf-8'))
    data = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(data, encoding='utf-8')
    print(data)
