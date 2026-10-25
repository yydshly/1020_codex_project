"""Acquire public Mapzen Terrarium tiles and build a small local elevation grid."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import io, math, json, hashlib, urllib.request, shutil

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'web/assets'
BOUNDS=dict(west=105,east=122,south=17,north=33)
ZOOM=5

def tile_xy(lon,lat):
    return ((lon+180)/360*2**ZOOM,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**ZOOM)

left,top=tile_xy(BOUNDS['west'],BOUNDS['north'])
right,bottom=tile_xy(BOUNDS['east'],BOUNDS['south'])
tiles=[(x,y) for x in range(int(left),int(right)+1) for y in range(int(top),int(bottom)+1)]

def acquire(pair):
    x,y=pair
    url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
    target=ROOT/'assets/terrain-source'/f'{ZOOM}-{x}-{y}.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        with urllib.request.urlopen(url,timeout=45) as response: data=response.read()
        target.write_bytes(data)
    else: data=target.read_bytes()
    return pair,Image.open(io.BytesIO(data)).convert('RGB'),dict(url=url,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))

records=list(ThreadPoolExecutor(max_workers=6).map(acquire,tiles))
images={pair:im for pair,im,_ in records}
width=241;height=241;values=[]
for row in range(height):
    lat=BOUNDS['north']-(BOUNDS['north']-BOUNDS['south'])*row/(height-1)
    for column in range(width):
        lon=BOUNDS['west']+(BOUNDS['east']-BOUNDS['west'])*column/(width-1)
        tx,ty=tile_xy(lon,lat)
        r,g,b=images[(int(tx),int(ty))].getpixel((min(255,int(tx%1*256)),min(255,int(ty%1*256))))
        values.append(round(r*256+g+b/256-32768))
payload=dict(bounds=BOUNDS,width=width,height=height,heights=values,units='meters',source='Mapzen Terrain Tiles / AWS Open Data',accessed='2026-10-24')
target=ASSETS/'elevation.json';target.write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
manifest=dict(source='https://registry.opendata.aws/terrain-tiles/',attribution='https://github.com/tilezen/joerd/blob/master/docs/attribution.md',format='Terrarium: (R*256+G+B/256)-32768 meters',zoom=ZOOM,accessed='2026-10-24',tiles=[record for _,_,record in records],output_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),vertical_display='Exaggerated for legibility; city scenes are authored illustrations, not surveyed reconstructions.')
(ASSETS/'elevation-source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
vendor=ROOT/'web/vendor/three';vendor.mkdir(parents=True,exist_ok=True)
source=ROOT.parents[0]/'014-programmable-worlds/web/canal-real/vendor/three'
names=['build/three.module.min.js','build/three.core.min.js','examples/jsm/controls/OrbitControls.js','LICENSE']
files=[]
for name in names:
    out=vendor/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,out)
    files.append(dict(path=name,sha256=hashlib.sha256(out.read_bytes()).hexdigest(),url=f'https://cdn.jsdelivr.net/npm/three@0.180.0/{name}'))
(vendor/'source.json').write_text(json.dumps(dict(package='three',version='0.180.0',license='MIT',modified=False,files=files),indent=2)+'\n',encoding='utf-8')
print(f'Elevation {width}x{height}, range {min(values)}..{max(values)} m; {len(records)} source tiles. Three.js r180 copied with license.')
