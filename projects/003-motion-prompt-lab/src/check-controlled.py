from pathlib import Path
import json,hashlib,datetime,re,urllib.request
P=Path(__file__).resolve().parents[1];E=P/'.cache/controlled-20261023';N=P/'notes/controlled'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
protocol=json.loads((E/'protocol.json').read_text(encoding='utf8'))
assert sha(E/'protocol.json')==(E/'protocol.sha256').read_text(encoding='utf8')
assert sha(N/'protocol.json')==sha(E/'protocol.json')
for row in protocol['shared_manifest']:assert sha(E/'shared'/row['file'])==row['sha256'],row['file']
common=(E/'shared/brief.md').read_text(encoding='utf8')+'\n'+(E/'shared/run-rules.md').read_text(encoding='utf8')+'\n# 本组任务指令\n\n'
mapping=json.loads((E/'mapping-private.json').read_text(encoding='utf8'))
for row in mapping:
    t=(E/row['run']/'input.md').read_text(encoding='utf8');assert t.startswith(common)
    assert hashlib.sha256(t.encode()).hexdigest()==row['input_sha256']
    if row['condition']=='original':assert t[len(common):]==(P/'.cache/v3-source/original-prompt.txt').read_text(encoding='utf8')
    else:assert sha(N/'requirements-full-input.md')==sha(E/row['run']/'input.md')
checks={'protocol_hash_unchanged':True,'shared_files_unchanged':len(protocol['shared_manifest']),'input_conditions_verified':True,'original_text_unchanged_except_windows_newlines':True}
results=json.loads((N/'results.json').read_text(encoding='utf8'))
if results['status']=='complete':
    blindmap=json.loads((E/'blind-mapping-private.json').read_text(encoding='utf8'))
    checks['videos']=[]
    for row in blindmap:
        item=results['candidates'][row['label']];public=P/'web'/item['video'];assert sha(public)==row['anonymous_sha256']
        req=urllib.request.Request('http://127.0.0.1:8033/'+item['video'],headers={'Range':'bytes=100-199'})
        with urllib.request.urlopen(req) as response:assert response.status==206 and response.read()==public.read_bytes()[100:200]
        checks['videos'].append({'label':row['label'],'sha256':sha(public),'http_range':206})
    sealed=json.loads((N/'judge-seal.json').read_text(encoding='utf8'))
    for item in sealed['files']:assert sha(N/item['file'])==item['sha256'],item['file']
    checks['blind_scores_unchanged_since_sealing']=True
    for item in results['links']:
        assert (P/'web'/item['href']).exists(),item['href']
checks['checked_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(N/'verification.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
