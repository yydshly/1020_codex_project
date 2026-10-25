"""Save a separate terrain revision, preserving every existing version."""
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
import soften_space_02_terrain
from export_viewer import digest
from extend_scene import PLAN, check_routes

SOURCE = ROOT / 'artifacts/rainy-canal-space-01.blend'
DEST = ROOT / 'artifacts/rainy-canal-space-02.blend'
GLB = ROOT / 'web/models/space-02.glb'
MANIFEST = ROOT / 'web/models/space-02-manifest.json'


def run():
    started = time.perf_counter()
    if any(path.exists() for path in (DEST, GLB, MANIFEST)):
        raise RuntimeError('New version already exists; refusing to overwrite a saved version.')
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    names_before = set(bpy.data.objects.keys())
    terrain = soften_space_02_terrain.build()
    if set(bpy.data.objects.keys()) != names_before:
        raise RuntimeError('Terrain revision unexpectedly added or removed objects.')
    routes = check_routes()
    water = exporter.verify_background_water()
    if not all(item['sampled_checks_passed'] for item in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('Route or background water verification failed: '+json.dumps({'routes':routes,'water':water}))
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST), check_existing=True)
    blend_hash = digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST), load_ui=False, use_scripts=False)
    exporter.DESTINATION = GLB
    exported = exporter.export_compact_scene()
    if digest(SOURCE) != source_hash or digest(DEST) != blend_hash:
        raise RuntimeError('Saved source or candidate bytes changed during export.')
    report = {
        'created_utc': datetime.now(timezone.utc).isoformat(), 'asset': GLB.name,
        'sha256': digest(GLB), 'bytes': GLB.stat().st_size,
        'source': {'file': SOURCE.name, 'sha256': source_hash, 'unchanged': True, 'object_count': len(names_before)},
        'integrated_blend': {'file': DEST.name, 'sha256': blend_hash, 'object_count': len(names_before)},
        'terrain_changes': terrain,
        'sampled_route_checks': routes, 'background_water_checks': water,
        'walk_routes_blender_xy': PLAN['routes'], **exported,
        'web_materials': 'scene-space-02-environment.js; world-space UV and existing local CC0 textures, applied at runtime.',
        'scope': 'Same exterior block and horizontal bounds; smoother distant bank elevations and coherent browser materials.',
        'limitations': ['Closed building interiors.', 'Far buildings remain simplified exterior masses.', 'Browser look development is separate from Blender source materials.'],
        'elapsed_seconds': round(time.perf_counter()-started,2), 'published': False,
    }
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE02_RESULT',json.dumps({k:report[k] for k in ('asset','bytes','geometry','elapsed_seconds')},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    run()
