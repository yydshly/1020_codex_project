"""Read-only checks of the published source and packed-resource headers."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import urllib.request,hashlib,json,time
root=Path(__file__).resolve().parents[1]
base='https://yydshly.github.io/1020_codex_project/projects/014-programmable-worlds/'
paths=[p.relative_to(root/'web').as_posix() for p in (root/'web/lijiang-m8').iterdir() if p.is_file()]
paths+=['index.html','app.js','style.css','map.html','canal-real/main.js','canal-real/gi.js','canal-real/vegetation.js','shipyard-station/main.js','shipyard-station/gi.js','packed-assets/loader.js','packed-assets/manifest.json','quality-window/RoundedBoxGeometry.js','assets/reading/programmable-worlds-map-20261026.webp']
manifest=json.loads((root/'web/packed-assets/manifest.json').read_text(encoding='utf-8'))
targets=[(rel,'GET',(root/'web'/rel).stat().st_size) for rel in paths]
targets += [('packed-assets/'+x['packedFile'],'HEAD',x['packedBytes']) for x in manifest['assets']]
start=time.perf_counter()
def check(item):
 rel,method,size=item
 for attempt in range(2):
  try:
   request=urllib.request.Request(base+rel+'?verify=7c31488',headers={'Accept-Encoding':'identity','User-Agent':'Programmable-Worlds-Release-Verification'},method=method)
   with urllib.request.urlopen(request,timeout=20) as response:
    assert response.status==200,(rel,response.status)
    record={'path':rel,'method':method,'status':response.status}
    if method=='GET':
     data=response.read();expected=(root/'web'/rel).read_bytes();assert data==expected,('Published bytes differ',rel)
     record.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),matchesLocal=True)
    else:
     length=response.headers.get('Content-Length');assert length is None or int(length)==size,('Packed Content-Length differs',rel,length,size)
     record.update(contentLength=length,expectedBytes=size,scope='Header only; complete binary integrity is verified by the runtime decoder, not this network check.')
    return record
  except Exception as error:
   if attempt==1:return {'path':rel,'method':method,'error':str(error)}
   time.sleep(.4)
results=[]
with ThreadPoolExecutor(max_workers=6) as pool:
 for f in as_completed(pool.submit(check,x) for x in targets):results.append(f.result())
errors=[x for x in results if 'error' in x]
report={'schema':'pages-published-resource-verification-v1','base':base,'status':'passed' if not errors else 'failed','sourceCommit':'7c3148838c92ebe2431dd4221654422a97f1e7d2','requests':len(results),'fullByteComparisons':sum(x.get('method')=='GET' and x.get('matchesLocal') is True for x in results),'packedPayloadHeadersOnly':sum(x.get('method')=='HEAD' for x in results),'seconds':time.perf_counter()-start,'errors':errors,'resources':sorted(results,key=lambda x:x['path'])}
(root/'notes/published-resource-verification-20261027.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='resources'},ensure_ascii=False))
raise SystemExit(bool(errors))
