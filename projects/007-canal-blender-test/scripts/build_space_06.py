"""Build one bounded neighbourhood around the preserved SPACE05 core."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_roam_scene as exporter
import build_space_06_buildings
import build_space_06_landscape
from export_viewer import digest
from extend_scene import check_routes

SOURCE=ROOT/'artifacts/rainy-canal-space-05.blend'
DEST=ROOT/'artifacts/rainy-canal-space-06.blend'
GLB=ROOT/'web/models/space-06.glb'
MANIFEST=ROOT/'web/models/space-06-manifest.json'


def run():
    started=time.perf_counter()
    if any(path.exists() for path in (DEST,GLB,MANIFEST)):
        raise RuntimeError('SPACE06 outputs already exist; refusing to overwrite a delivered version.')
    source_hash=digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
    names=set(bpy.data.objects.keys())
    landscape=build_space_06_landscape.build()
    buildings=build_space_06_buildings.build()
    added=sorted(set(bpy.data.objects.keys())-names)
    if not names.issubset(bpy.data.objects.keys()) or not all(name.startswith('SPACE06_') for name in added):
        raise RuntimeError('All old objects must remain, and all additions must use SPACE06_.')
    routes=check_routes()
    water=exporter.verify_background_water()
    if not all(row['sampled_checks_passed'] for row in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('An existing route or the original river surface was obstructed.')
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST),check_existing=True)
    blend_hash=digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST),load_ui=False,use_scripts=False)
    exporter.DESTINATION=GLB
    exported=exporter.export_compact_scene()
    if exported['geometry']['triangles']>177260+105000:
        raise RuntimeError('The neighbourhood exceeds the bounded geometry budget.')
    if digest(SOURCE)!=source_hash or digest(DEST)!=blend_hash:
        raise RuntimeError('A preserved scene file changed during export.')
    previous=json.loads((ROOT/'web/models/space-05-manifest.json').read_text(encoding='utf-8'))
    layout=json.loads((ROOT/'assets/space-06-layout.json').read_text(encoding='utf-8-sig'))
    report={
        'created_utc':datetime.now(timezone.utc).isoformat(),'asset':GLB.name,'bytes':GLB.stat().st_size,'sha256':digest(GLB),
        'source':{'file':SOURCE.name,'sha256':source_hash,'object_count':len(names),'unchanged':True},
        'integrated_blend':{'file':DEST.name,'sha256':blend_hash,'object_count':len(names)+len(added)},
        'refinements':previous['refinements'],'neighbourhood':{'layout':layout,'buildings':buildings,'landscape':landscape},
        'added_objects':added,'original_route_checks':routes,'background_water_checks':water,**exported,
        'navigation_module':'scene-space-06-navigation.js',
        'appearance':'SPACE04 inherited materials/skylight plus SPACE06 materials and landscape.',
        'scope':'A finite complete neighbourhood around the detailed canal core, with streets, residential groups and greens; no open interiors or unlimited city generation.',
        'published':False,'elapsed_seconds':round(time.perf_counter()-started,2),
    }
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE06_RESULT',json.dumps({key:report[key] for key in ('asset','bytes','geometry','elapsed_seconds')},ensure_ascii=False),flush=True)


if __name__=='__main__':
    run()
