"""Save and export a new grouped neighbourhood; retain every delivered version."""
from datetime import datetime,timezone
import argparse
import json
from pathlib import Path
import sys
import time

import bpy

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_space_08_buildings as buildings_module
import build_space_08_ground as ground_module
import build_roam_scene as exporter
from export_viewer import digest
from extend_scene import check_routes

SOURCE=ROOT/'artifacts/rainy-canal-space-06.blend'
DEST=ROOT/'artifacts/rainy-canal-space-08.blend'
GLB=ROOT/'web/models/space-08.glb'
MANIFEST=ROOT/'web/models/space-08-manifest.json'

def run(replace_draft=False):
    started=time.perf_counter()
    if not replace_draft and any(path.exists() for path in (DEST,GLB,MANIFEST)):
        raise RuntimeError('SPACE08 output already exists; use --replace-draft only for the current undelivered candidate.')
    source_hash=digest(SOURCE)
    layout=json.loads((ROOT/'assets/space-08-layout.json').read_text(encoding='utf-8'))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
    old_names=set(bpy.data.objects.keys())
    buildings=buildings_module.build(layout)
    ground=ground_module.build(layout,buildings)
    added=sorted(set(bpy.data.objects.keys())-old_names)
    if not old_names.issubset(bpy.data.objects.keys()) or not all(name.startswith('SPACE08_') for name in added):
        raise RuntimeError('The original objects must remain; all additions must be SPACE08_.')
    routes=check_routes();water=exporter.verify_background_water()
    if not all(row['sampled_checks_passed'] for row in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('An original canal route or water surface was obstructed.')
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST),check_existing=True)
    blend_hash=digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST),load_ui=False,use_scripts=False)
    exporter.DESTINATION=GLB;exported=exporter.export_compact_scene()
    if exported['geometry']['triangles']>290000:raise RuntimeError('SPACE08 exceeds the bounded geometry budget.')
    if digest(SOURCE)!=source_hash or digest(DEST)!=blend_hash:raise RuntimeError('A source file changed during export.')
    previous=json.loads((ROOT/'web/models/space-06-manifest.json').read_text(encoding='utf-8'))
    neighbourhood={'layout':layout,'buildings':buildings,'landscape':{**previous['neighbourhood']['landscape'],
      'house_grounding':[{'id':h['id'],'support_bounds_xy':h['footprint']} for h in buildings['houses']]},'ground':ground}
    report={'created_utc':datetime.now(timezone.utc).isoformat(),'asset':GLB.name,'bytes':GLB.stat().st_size,'sha256':digest(GLB),
      'source':{'file':SOURCE.name,'sha256':source_hash,'unchanged':True},
      'integrated_blend':{'file':DEST.name,'sha256':blend_hash},'refinements':previous['refinements'],
      'neighbourhood':neighbourhood,'added_objects':added,'retired_objects':buildings['replaced_objects']+['SPACE06_HouseGroundingAndDoorPaths'],
      'original_route_checks':routes,'background_water_checks':water,**exported,
      'navigation_module':'scene-space-08-navigation.js','published':False,
      'scope':'Same finite district, recomposed linked street groups, four upgraded proxy buildings and connected entrance forecourts.',
      'elapsed_seconds':round(time.perf_counter()-started,2)}
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'artifacts/scene-space-08/ground-build-audit.json').write_text(json.dumps(ground,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE08_RESULT',json.dumps({k:report[k] for k in ('asset','bytes','geometry','elapsed_seconds')},ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--replace-draft',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    run(args.replace_draft)
