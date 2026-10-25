"""Refine the three existing opposite-bank houses in a separate version."""
import json
from pathlib import Path
import sys
import time
from datetime import datetime, timezone

import bpy

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_roam_scene as exporter
import refine_space_03_facades
import refine_space_03_roofs
import refine_space_03_plinths
from export_viewer import digest
from extend_scene import PLAN, check_routes

SOURCE = ROOT / 'artifacts/rainy-canal-space-02.blend'
DEST = ROOT / 'artifacts/rainy-canal-space-03.blend'
GLB = ROOT / 'web/models/space-03.glb'
MANIFEST = ROOT / 'web/models/space-03-manifest.json'


def run():
    started = time.perf_counter()
    replace_draft = '--replace-draft' in sys.argv
    if any(path.exists() for path in (DEST, GLB, MANIFEST)) and not replace_draft:
        raise RuntimeError('New version already exists; refusing to overwrite a saved version.')
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    names_before = set(bpy.data.objects.keys())
    roofs = refine_space_03_roofs.build()
    facades = refine_space_03_facades.build()
    plinths = refine_space_03_plinths.build()
    added = sorted(set(bpy.data.objects.keys()) - names_before)
    if not names_before.issubset(bpy.data.objects.keys()) or not all(name.startswith('SPACE03_') for name in added):
        raise RuntimeError('Only namespaced additions and retained original objects are allowed.')
    routes = check_routes()
    water = exporter.verify_background_water()
    if not all(item['sampled_checks_passed'] for item in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('Route or background water verification failed: '+json.dumps({'routes':routes,'water':water}))
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST), check_existing=True)
    blend_hash = digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST), load_ui=False, use_scripts=False)
    exporter.DESTINATION = GLB
    exported = exporter.export_compact_scene()
    if exported['geometry']['triangles'] > 163678 + 15000:
        raise RuntimeError('Opposite-building detail exceeded the agreed geometry budget.')
    if digest(SOURCE) != source_hash or digest(DEST) != blend_hash:
        raise RuntimeError('Saved source or candidate bytes changed during export.')
    report = {
        'created_utc': datetime.now(timezone.utc).isoformat(), 'asset': GLB.name,
        'sha256': digest(GLB), 'bytes': GLB.stat().st_size,
        'source': {'file': SOURCE.name, 'sha256': source_hash, 'unchanged': True, 'object_count': len(names_before)},
        'integrated_blend': {'file': DEST.name, 'sha256': blend_hash, 'object_count': len(names_before)+len(added)},
        'added_objects': added, 'refinements': {'roofs': roofs, 'facades': facades, 'plinths': plinths},
        'sampled_route_checks': routes, 'background_water_checks': water,
        'walk_routes_blender_xy': PLAN['routes'], **exported,
        'web_materials': 'scene-space-03-environment.js, inheriting scene-space-02 unified surfaces.',
        'scope': 'Existing three opposite-bank houses only: roof construction, true shallow openings and facade details; same block extent.',
        'limitations': ['Closed doors and non-enterable shallow window reveals.', 'No full furnished interiors.', 'Runtime browser materials remain separate from Blender appearance.'],
        'elapsed_seconds': round(time.perf_counter()-started,2), 'published': False,
    }
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE03_RESULT',json.dumps({k:report[k] for k in ('asset','bytes','geometry','elapsed_seconds')},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    run()
