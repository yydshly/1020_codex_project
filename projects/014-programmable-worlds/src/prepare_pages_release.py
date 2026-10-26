"""Prepare the explicit public subset. Never removes local research data."""
from pathlib import Path
import argparse,hashlib,json,shutil,re

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--destination',required=True);a=ap.parse_args()
 src=Path(a.source).resolve();dst=Path(a.destination).resolve()
 assert src.name==dst.name=='014-programmable-worlds' and src!=dst
 pack=dst/'packed-assets';manifest=json.loads((pack/'manifest.json').read_text(encoding='utf-8'))
 assert manifest['allBitForBitRestored'] and manifest['allOriginalFilesUnchanged']
 packed={x['sourceFile']:x for x in manifest['assets']}
 copied=[]
 def copy(rel,target=None):
  source=src/rel;out=dst/(target or rel)
  assert source.is_file(),str(source)
  assert out.resolve().is_relative_to(dst)
  out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,out);copied.append(str(out.relative_to(dst)).replace('\\','/'))
 def tree(rel,filter=lambda p:True):
  for p in sorted((src/rel).rglob('*')):
   if p.is_file() and filter(p):copy(p.relative_to(src).as_posix())
 for rel in ['project.json','README.md','Start-Project.ps1']:copy(rel)
 # Lightweight research/acceptance records only; render output and native caches stay local.
 for p in (src/'notes').iterdir():
  if p.is_file() and p.suffix in {'.md','.json'}:copy(p.relative_to(src).as_posix())
 for p in (src/'src').glob('*'):
  if p.is_file() and p.suffix in {'.py','.cjs','.js'}:copy(p.relative_to(src).as_posix())
 for rel in ['web/index.html','web/app.js','web/style.css','web/map.html','web/guide.html']:copy(rel)
 tree('web/assets',lambda p:p.suffix.lower() in {'.jpg','.png','.svg','.json','.md'} and p.name!='programmable-worlds-guide.svg')
 tree('web/upstream',lambda p:p.name in {'LICENSE','README.md'})
 for name in ['controller.js','controller.css','source-live.html','source-live.css','source-live.js']:copy('web/runtime/'+name)
 tree('web/lijiang-m8')
 copy('web/lijiang-flythrough/src/recorder.js')
 vendor=['three/build/three.module.js','three/build/three.core.js','three/examples/jsm/objects/Reflector.js','three/examples/jsm/objects/Sky.js','three/examples/jsm/objects/MarchingCubes.js','three/LICENSE','mediabunny/dist/bundles/mediabunny.min.mjs','mediabunny/LICENSE']
 vendor_paths=['lijiang-flythrough/node_modules/'+x for x in vendor]
 for v in vendor_paths:copy('web/'+v)
 # Complete live A/B dependencies; obsolete lighting versions are excluded.
 for scene in ['canal-real','shipyard-station']:
  for p in (src/'web'/scene).iterdir():
   if p.is_file():copy(p.relative_to(src).as_posix())
 tree('web/canal-real/vendor')
 tree('web/canal-real/assets',lambda p:'kloofendal_overcast_puresky' not in p.parts and p.relative_to(src).as_posix() not in packed)
 # The direct non-R5 benchmark still gets its original small HDR fallback.
 for prefix,manifest_name in [('canal-real/baked-r5','manifest.json'),('shipyard-station/baked-r1','manifest-oak2048.json')]:
  rel='web/'+prefix+'/'+manifest_name;copy(rel);m=json.loads((src/rel).read_text(encoding='utf-8'))
  for g in m['groups']:
   f='web/'+prefix+'/'+g['runtime']['file']
   if f not in packed:copy(f)
  model=(src/'web'/prefix/m['model']).resolve();r=model.relative_to(src).as_posix()
  if r not in packed:copy(r)
 # Pack files are byte-exact restored assets. No model/image/lighting is reduced.
 for item in manifest['assets']:
  a=pack/item['packedFile'];assert sha(a)==item['packedSHA256']
  out=dst/'web/packed-assets'/item['packedFile'];out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(a,out)
 out=dst/'web/packed-assets/manifest.json';shutil.copyfile(pack/'manifest.json',out)
 # Same research image bytes are archived once in Git and served by GitHub raw;
 # this avoids duplicating 30+ MB into the shared Pages quota.
 image_rels=['assets/project-map-cover.png','assets/programmable-worlds-map-20261026.svg','assets/programmable-worlds-map-20261026.png','assets/programmable-worlds-guide.svg']
 image_rels += [p.relative_to(src).as_posix() for p in (src/'assets/extension-references').iterdir() if p.suffix=='.png']
 for rel in image_rels:copy(rel)
 raw='https://raw.githubusercontent.com/yydshly/1020_codex_project/main/projects/014-programmable-worlds/'
 docs='https://github.com/yydshly/1020_codex_project/blob/main/projects/014-programmable-worlds/'
 for rel in ['web/index.html','web/map.html','web/guide.html']:
  p=dst/rel;s=p.read_text(encoding='utf-8').replace('../assets/',raw+'assets/').replace('../notes/',docs+'notes/').replace('../README.md',docs+'README.md')
  s=s.replace('assets/programmable-worlds-guide.svg',raw+'assets/programmable-worlds-guide.svg') if rel=='web/guide.html' else s.replace('href="assets/programmable-worlds-guide.svg"','href="'+raw+'assets/programmable-worlds-guide.svg"')
  s=s.replace('lijiang-m7-preview.html?revision=20261026-m7#lijiang',docs+'notes/project-wrap-up-20261026.md')
  p.write_text(s,encoding='utf-8')
 # Transport-only adapters for the exact original model, buffer and float16 pixels.
 copy('src/pages_lossless_loader.js','web/packed-assets/loader.js')
 for rel in ['web/canal-real/gi.js','web/shipyard-station/gi.js']:
  p=dst/rel;s=p.read_text(encoding='utf-8');s="import {readAssetBytes,readLightmapBytes} from '../packed-assets/loader.js';\n"+s
  start=s.index(" const response=await fetch(new URL(d.file,root)");end=s.index(" if(raw.byteLength!==",start)
  s=s[:start]+" const raw=await readLightmapBytes(new URL(d.file,root),d.sha256);\n"+s[end:]
  start=s.index(" const modelResponse=await fetch(new URL(manifest.model,root)");end=s.index(" const gltf=",start)
  s=s[:start]+" const modelBytes=await readAssetBytes(new URL(manifest.model,root)),modelDigest=await crypto.subtle.digest('SHA-256',modelBytes),modelSha256=Array.from(new Uint8Array(modelDigest),b=>b.toString(16).padStart(2,'0')).join('');\n if(manifest.runtimeAsset?.sha256!==modelSha256||manifest.runtimeAsset.bytes!==modelBytes.byteLength)throw Error('Restored GI geometry integrity mismatch');\n"+s[end:]
  p.write_text(s,encoding='utf-8')
 p=dst/'web/canal-real/vegetation.js';s=p.read_text(encoding='utf-8');s="import {packedBufferManager} from '../packed-assets/loader.js';\n"+s
 s=s.replace('const gltf=new GLTFLoader(),textures=',"const gltf=new GLTFLoader(await packedBufferManager(new THREE.LoadingManager(),new URL('./assets/tree_small_02/tree_small_02.bin',import.meta.url))),textures=",1)
 p.write_text(s,encoding='utf-8')
 # Canonical M8 source and original import paths remain byte-for-byte unchanged.
 for p in (src/'web/lijiang-m8').rglob('*'):
  if p.is_file():assert sha(p)==sha(dst/p.relative_to(src))
 meta=json.loads((dst/'project.json').read_text(encoding='utf-8'));meta['web_vendor_files']=vendor_paths
 (dst/'project.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (dst/'.gitignore').write_text('/packed-assets/\n/artifacts/\n__pycache__/\n',encoding='utf-8')
 (dst/'.gitattributes').write_text('web/** -text\nassets/** -text\n',encoding='utf-8')
 report={'schema':'programmable-worlds-pages-package-v1','rawImageBase':raw,'m8FilesUnchanged':51,'packedAssets':len(manifest['assets']),'rawImageFiles':image_rels,'copiedFiles':copied,'localResearchPreserved':True}
 (dst/'notes/pages-package.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'copied':len(copied),'m8Unchanged':51,'packedAssets':len(manifest['assets'])}))
if __name__=='__main__':main()
