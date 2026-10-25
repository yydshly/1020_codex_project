from pathlib import Path
import hashlib,json
r=Path(__file__).resolve().parents[1];w=r/'web'
if any((w/name).exists() for name in ['cat-v12-gait-study.html','cat-v12-gait-study.js','shop-study-09.html','shop-study-09-controller.js']):
    raise SystemExit('One-time scaffold already exists; preserve subsequent reviewed edits.')
files=[p for p in w.rglob('*') if p.is_file() and 'cat-v12' not in p.name and 'shop-study-09' not in p.name]
baseline={str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(r/'assets/cat-v12-preservation-baseline.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
def build(source,target,pairs):
    text=(w/source).read_text(encoding='utf-8')
    for a,b in pairs:
        if a not in text:raise RuntimeError('Missing '+a)
        text=text.replace(a,b)
    (w/target).write_text(text,encoding='utf-8')
build('cat-v11-gait-study.html','cat-v12-gait-study.html',[
 ('cat-v11-gait-study.js','cat-v12-gait-study.js'),('阿橘 · 头尾协调','阿橘 · 整体联动'),
 ('随速度与转弯调整头尾 · 保留走跑对照','肩背负重 · 头颈随步 · 分段尾巴'),
 ('V10 走跑对照','V11 走跑对照'),('V10 同速走跑对照','V11 同速走跑对照'),
 ('cat-v10-gait-study.html','cat-v11-gait-study.html'),('原 V10 试样页','原 V11 试样页'),
 ('shop-study-08.html','shop-study-09.html')])
build('cat-v11-gait-study.js','cat-v12-gait-study.js',[
 ('./cat-v11.js','./cat-v12.js'),('./cat-v10.js','./cat-v11.js'),('cat-v11-gait-study','cat-v12-gait-study'),
 ('V11 头尾协调','V12 整体联动'),('V10 走跑对照','V11 走跑对照')])
build('shop-study-08.html','shop-study-09.html',[
 ('shop-study-08-controller.js','shop-study-09-controller.js'),('头尾协调','整体联动'),
 ('cat-v11-gait-study.html','cat-v12-gait-study.html'),('shop-study-07.html','shop-study-08.html'),
 ('阿橘会随走跑调整头尾，转弯时看向前路，停下后缓缓放松。','阿橘的肩背会随落脚承重，头颈保留轻微随步动作，尾巴分段跟随转向和起停。')])
build('shop-study-08-controller.js','shop-study-09-controller.js',[('./cat-v11.js','./cat-v12.js'),('shop-study-08','shop-study-09')])
print(json.dumps({'preservedFiles':len(baseline),'pages':['cat-v12-gait-study','shop-study-09']}))
