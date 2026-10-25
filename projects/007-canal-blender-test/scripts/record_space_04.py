"""Record the browser-only appearance revision without duplicating geometry."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'web/models/space-04-manifest.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    if OUTPUT.exists():
        raise RuntimeError('SPACE04 manifest already exists; refusing to overwrite a delivered version.')
    source = json.loads((ROOT/'web/models/space-03-manifest.json').read_text(encoding='utf-8'))
    model = ROOT/'web/models/space-03.glb'
    if digest(model) != source['sha256']:
        raise RuntimeError('The reused source model does not match its saved manifest.')
    baseline = json.loads((ROOT/'artifacts/scene-space-04/preserved-files.json').read_text(encoding='utf-8-sig'))
    changes = [name for name,expected in baseline.items() if digest(ROOT/name).lower()!=expected.lower()]
    if changes:
        raise RuntimeError('A protected previous file changed: '+repr(changes))
    runtime = ['web/scene-space-04.html','web/scene-space-04.js','web/scene-space-04-environment.js','web/scene-space-04-lighting.js']
    report = {
        'created_utc':datetime.now(timezone.utc).isoformat(),
        'version':'space-04-surface-and-skylight',
        'asset':'space-03.glb','sha256':digest(model),'bytes':model.stat().st_size,
        'geometry':source['geometry'],'integrated_blend':source['integrated_blend'],
        'source_geometry_reused_unchanged':True,'new_geometry':0,'new_lights':0,
        'scope':'Appearance refinement of existing opposite-bank windows, wood and plaster plus restrained existing skylight adjustment.',
        'stages':['SPACE03 previous appearance','New materials with original lighting','New materials and restrained skylight'],
        'previous_files_checked':len(baseline),'previous_files_changed':changes,
        'runtime_files':{name:digest(ROOT/name) for name in runtime},
        'limitations':['Thin transparent panes and shallow sealed recesses, not full furnished interiors or refractive volumes.',
                       'Appearance lives in browser runtime; the unchanged SPACE03 Blender file remains the geometry source.'],
        'published':False,
    }
    OUTPUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'manifest':str(OUTPUT),'triangles':source['geometry']['triangles'],'new_geometry':0,'previous_files_changed':changes},ensure_ascii=False))


if __name__ == '__main__':
    run()
