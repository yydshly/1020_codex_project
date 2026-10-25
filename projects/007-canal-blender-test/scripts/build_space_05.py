"""Connect one existing riverside passage to a small courtyard in a new copy."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_roam_scene as exporter
import build_space_05_courtyard
from export_viewer import digest
from extend_scene import check_routes

SOURCE=ROOT/'artifacts/rainy-canal-space-03.blend'
DEST=ROOT/'artifacts/rainy-canal-space-05.blend'
GLB=ROOT/'web/models/space-05.glb'
MANIFEST=ROOT/'web/models/space-05-manifest.json'


def run():
    started=time.perf_counter()
    if any(path.exists() for path in (DEST,GLB,MANIFEST)):
        raise RuntimeError('SPACE05 output exists; refusing to overwrite a previous version.')
    source_hash=digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
    names=set(bpy.data.objects.keys())
    courtyard=build_space_05_courtyard.build()
    added=sorted(set(bpy.data.objects.keys())-names)
    if not names.issubset(bpy.data.objects.keys()) or not all(name.startswith('SPACE05_') for name in added):
        raise RuntimeError('Only retained original objects and SPACE05 additions are permitted.')
    routes=check_routes()
    water=exporter.verify_background_water()
    if not all(row['sampled_checks_passed'] for row in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('An original route or background water check failed.')
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST),check_existing=True)
    blend_hash=digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST),load_ui=False,use_scripts=False)
    exporter.DESTINATION=GLB
    exported=exporter.export_compact_scene()
    if exported['geometry']['triangles']>174012+6500:
        raise RuntimeError('Courtyard additions exceed the bounded detail budget.')
    if digest(SOURCE)!=source_hash or digest(DEST)!=blend_hash:
        raise RuntimeError('A saved scene changed during export.')
    appearance=json.loads((ROOT/'web/models/space-03-manifest.json').read_text(encoding='utf-8'))['refinements']['facades']
    report={
        'created_utc':datetime.now(timezone.utc).isoformat(),'asset':GLB.name,'bytes':GLB.stat().st_size,'sha256':digest(GLB),
        'source':{'file':SOURCE.name,'sha256':source_hash,'object_count':len(names),'unchanged':True},
        'integrated_blend':{'file':DEST.name,'sha256':blend_hash,'object_count':len(names)+len(added)},
        'appearance_source':'SPACE04 runtime materials and skylight, with original SPACE03 facade aliases.',
        'refinements':{'facades':appearance},'courtyard':courtyard,'added_objects':added,
        'original_routes':routes,'background_water_checks':water,**exported,
        'navigation_module':'scene-space-05-navigation.js',
        'scope':'One passage between existing opposite-bank houses and one connected, bounded rear courtyard; no new houses or interiors.',
        'limitations':['Collision uses verified plan zones rather than arbitrary mesh physics.','Orbit inspection camera is unrestricted; walking camera follows the navigation boundary.'],
        'published':False,'elapsed_seconds':round(time.perf_counter()-started,2),
    }
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE05_RESULT',json.dumps({key:report[key] for key in ('asset','bytes','geometry','elapsed_seconds')},ensure_ascii=False),flush=True)


if __name__=='__main__':
    run()
