from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11'])
 page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8062/cat-v10-thigh-study.html',wait_until='networkidle')
 page.wait_for_function('window.__catFormStudy?.getState().candidatesReady',timeout=60000)
 page.evaluate("()=>{window.__catFormStudy.seek('run',0);window.__catFormStudy.setView('side');window.__catFormStudy.setVariant('current');}")
 probes=[]
 for xy in [[715,435],[745,455],[675,445],[720,400]]:
  probes.append(page.evaluate('xy=>window.__catFormStudy.probePixel(...xy)',xy))
 state=page.evaluate('window.__catFormStudy.getState()')
 page.locator('#viewport canvas').screenshot(path=str(root/'assets/cat-v10-thigh-raycast-source.png'))
 browser.close()
report={'state':state,'errors':errors,'probes':probes}
(root/'assets/cat-v10-thigh-raycast.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for probe in probes:
 print(probe['pixel'],'hits',len(probe['hits']))
 if probe['hits']:print(json.dumps(probe['hits'][0],ensure_ascii=False))
