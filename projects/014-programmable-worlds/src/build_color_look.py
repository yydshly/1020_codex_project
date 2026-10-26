"""Bake Blender's actual AgX Medium High Contrast display into a log-shaper LUT.
Run in pinned Blender background Python; no camera/geometry rendering is used.
"""
from pathlib import Path
import gzip, hashlib, io, json
import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/shared-scene/look';ART=ROOT/'artifacts/color-look'
SIZE=65;LOG_MIN=-12.47393;LOG_MAX=12.5260688117
OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.dither_intensity=0
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='16'
scene.render.image_settings.compression=15

def display_roundtrip(name,rgba,width,height):
    image=bpy.data.images.new(name,width=width,height=height,float_buffer=True,alpha=True)
    image.colorspace_settings.name='Linear Rec.709'
    image.pixels.foreach_set(np.asarray(rgba,dtype=np.float32).ravel())
    path=ART/(name+'.png');image.save_render(str(path),scene=scene)
    loaded=bpy.data.images.load(str(path),check_existing=False)
    result=np.empty(width*height*4,dtype=np.float32)
    loaded.pixels.foreach_get(result)
    bpy.data.images.remove(image);bpy.data.images.remove(loaded)
    return result.reshape(height,width,4),path

samples=np.exp2(np.linspace(LOG_MIN,LOG_MAX,SIZE,dtype=np.float32))
bb,gg,rr=np.meshgrid(samples,samples,samples,indexing='ij')
rgba=np.stack([rr,gg,bb,np.ones_like(rr)],axis=-1)
transformed,master=display_roundtrip('agx-medium-high-65',rgba,SIZE*SIZE,SIZE)
lut=transformed.reshape(SIZE,SIZE,SIZE,4).astype('<f2')
assert np.isfinite(lut).all()
raw=lut.tobytes();blob=io.BytesIO()
with gzip.GzipFile(filename='',mode='wb',fileobj=blob,compresslevel=6,mtime=0) as writer:writer.write(raw)
packed=blob.getvalue();file=OUT/'agx-medium-high-65.rgba16f.gz';file.write_bytes(packed)
# Independent arbitrary scene-linear swatches, not only LUT lattice points.
rng=np.random.default_rng(1847)
colors=np.vstack([np.array([[.18,.18,.18],[.01,.01,.01],[1,1,1],[.12,.045,.02],[.025,.09,.055],[2,1,.2]],dtype=np.float32),np.exp2(rng.uniform(-9,5,(128,3))).astype(np.float32)])
refs,_=display_roundtrip('look-validation',np.column_stack([colors,np.ones(len(colors))]),len(colors),1)
coords=np.clip((np.log2(np.maximum(colors,2**LOG_MIN))-LOG_MIN)/(LOG_MAX-LOG_MIN),0,1)*(SIZE-1)
lo=np.floor(coords).astype(int);hi=np.minimum(lo+1,SIZE-1);f=coords-lo
prediction=np.zeros((len(colors),3),dtype=np.float64)
for bz in (0,1):
 for gy in (0,1):
  for rx in (0,1):
   indices=[np.where(rx,hi[:,0],lo[:,0]),np.where(gy,hi[:,1],lo[:,1]),np.where(bz,hi[:,2],lo[:,2])]
   weight=np.prod(np.column_stack([f[:,0] if rx else 1-f[:,0],f[:,1] if gy else 1-f[:,1],f[:,2] if bz else 1-f[:,2]]),axis=1)
   prediction+=lut[indices[2],indices[1],indices[0],:3].astype(float)*weight[:,None]
errors=np.abs(prediction-refs.reshape(-1,4)[:,:3])
config=Path(bpy.utils.resource_path('LOCAL'))/'datafiles/colormanagement/config.ocio'
manifest={'schema_version':1,'size':SIZE,'logMin':LOG_MIN,'logMax':LOG_MAX,'file':file.name,'type':'RGBA16F_LE','channels':4,'layout':'x=R,y=G,z=B; red fastest','output':'Linear Rec.709, decoded from the actual sRGB display-baked PNG','look':'AgX - Medium High Contrast','view_transform':'AgX','baked_exposure_stops':0,'runtime_exposure':'Multiply scene-linear RGB once before log shaping; no prior Three AgX transform.','blender_version':bpy.app.version_string,'config_sha256':hashlib.sha256(config.read_bytes()).hexdigest(),'master_png':str(master.relative_to(ROOT)).replace('\\','/'),'raw_bytes':len(raw),'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'validation':{'swatches':len(colors),'max_absolute_linear_error':float(errors.max()),'mean_absolute_linear_error':float(errors.mean()),'midgrey_reference':refs.reshape(-1,4)[0,:3].tolist(),'midgrey_interpolated':prediction[0].tolist(),'method':'Actual independent OCIO display swatches compared with trilinear half-float LUT sampling.'}}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest))
