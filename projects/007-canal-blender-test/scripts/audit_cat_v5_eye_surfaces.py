"""Read-only, CPU projected-texture and topology audit of the original GLB eyes."""
import json
import math
from pathlib import Path
import struct
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / 'web/models/cat-v3-rig.glb').read_bytes()
n, _ = struct.unpack_from('<II', raw, 12)
doc = json.loads(raw[20:20+n])
offset = 20+n
length, _ = struct.unpack_from('<II', raw, offset)
binary = raw[offset+8:offset+8+length]
types = {5121:'u1', 5123:'<u2', 5125:'<u4', 5126:'<f4'}
counts = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}
def acc(index):
    item=doc['accessors'][index];view=doc['bufferViews'][item['bufferView']]
    assert not view.get('byteStride')
    return np.frombuffer(binary,dtype=types[item['componentType']],count=item['count']*counts[item['type']],offset=view.get('byteOffset',0)+item.get('byteOffset',0)).reshape(item['count'],counts[item['type']]).astype(float)
primitive=doc['meshes'][0]['primitives'][0]
positions=acc(primitive['attributes']['POSITION']);normals=acc(primitive['attributes']['NORMAL']);uv=acc(primitive['attributes']['TEXCOORD_0'])
faces=acc(primitive['indices']).astype(int).reshape(-1,3)
texture=np.array(Image.open(ROOT/'assets/cat-v5-eye-source-basecolor.jpg').convert('RGB'))
initial=json.loads((ROOT/'assets/cat-v5-eye-landmarks-initial.json').read_text())
def unit(v):return v/np.linalg.norm(v)
def point(eye,name):return np.array(eye[name]['position'])

W,H=720,560
extent_x,extent_y=.034,.026
report={'source':'cat-v3-rig.glb','coordinate_system':'Three root, Y-up, +Z-forward, metres','eyes':{}}
for name,eye in initial['eyes'].items():
    center=point(eye,'center')
    x=unit(point(eye,'rightCorner')-point(eye,'leftCorner'))
    y=point(eye,'upperLid')-point(eye,'lowerLid');y=unit(y-x*np.dot(y,x))
    normal=unit(np.cross(x,y))
    if np.dot(normal,np.array([.8,0,.6]))<0:normal=-normal
    basis=np.stack([x,y,normal],axis=1)
    local=(positions-center)@basis
    points={key:((point(eye,key)-center)@basis).tolist() for key in ['leftCorner','rightCorner','upperLid','lowerLid']}
    # Original source texture projected orthographically onto the fitted eye
    # plane, using the original triangles. No texture or geometry is edited.
    xy=np.stack([(local[:,0]/(extent_x*2)+.5)*W,(.5-local[:,1]/(extent_y*2))*H],axis=1)
    pixels=np.full((H,W,3),230,dtype=np.uint8);depth=np.full((H,W),-np.inf)
    renderedLocal=np.full((H,W,3),np.nan)
    for tri in faces:
        lp=local[tri]
        if lp[:,2].max() < -.018 or lp[:,2].min() > .024:continue
        coords=xy[tri]
        x0=max(0,int(np.floor(coords[:,0].min())));x1=min(W-1,int(np.ceil(coords[:,0].max())))
        y0=max(0,int(np.floor(coords[:,1].min())));y1=min(H-1,int(np.ceil(coords[:,1].max())))
        if x1<x0 or y1<y0:continue
        a,b,c=coords
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-10:continue
        yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
        wa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
        wb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;wc=1-wa-wb
        dd=wa*lp[0,2]+wb*lp[1,2]+wc*lp[2,2]
        valid=(wa>=0)&(wb>=0)&(wc>=0)&(dd>depth[y0:y1+1,x0:x1+1])&(dd>-.018)&(dd<.024)
        tu=wa*uv[tri[0],0]+wb*uv[tri[1],0]+wc*uv[tri[2],0]
        tv=wa*uv[tri[0],1]+wb*uv[tri[1],1]+wc*uv[tri[2],1]
        tx=np.clip((tu*texture.shape[1]).astype(int),0,texture.shape[1]-1);ty=np.clip((tv*texture.shape[0]).astype(int),0,texture.shape[0]-1)
        patch=pixels[y0:y1+1,x0:x1+1];patch[valid]=texture[ty[valid],tx[valid]]
        depth[y0:y1+1,x0:x1+1][valid]=dd[valid]
        interpolated=wa[...,None]*lp[0]+wb[...,None]*lp[1]+wc[...,None]*lp[2]
        renderedLocal[y0:y1+1,x0:x1+1][valid]=interpolated[valid]
    image=Image.fromarray(pixels)
    image.save(ROOT/f'assets/cat-v5-eye-{name}-projected.png')
    overlay=image.copy();draw=ImageDraw.Draw(overlay)
    def screen(p):return ((p[0]/(extent_x*2)+.5)*W,(.5-p[1]/(extent_y*2))*H)
    for step in range(-30,31,5):
        px=screen([step/1000,0])[0];py=screen([0,step/1000])[1]
        if 0<=px<W:draw.line([(px,0),(px,H)],fill=(90,140,180),width=1);draw.text((px+2,3),str(step),fill=(0,220,255))
        if 0<=py<H:draw.line([(0,py),(W,py)],fill=(90,140,180),width=1);draw.text((3,py+2),str(step),fill=(0,220,255))
    for key,value in points.items():
        px,py=screen(value);draw.ellipse((px-4,py-4,px+4,py+4),outline=(255,40,40),width=2);draw.text((px+7,py+3),key,fill=(255,70,30))
    draw.text((8,H-22),name+' | eye-local millimetres | red: initial screenshot-picked boundaries',fill=(255,255,255))
    overlay.save(ROOT/f'assets/cat-v5-eye-{name}-coordinates.png')
    selection=(abs(local[:,0])<.026)&(abs(local[:,1])<.023)&(local[:,2]>-.015)&(local[:,2]<.015)
    aperture=(abs(local[:,0])<.015)&(abs(local[:,1])<.011)&(local[:,2]>-.01)&(local[:,2]<.01)
    green=(pixels[:,:,1]>pixels[:,:,0]*1.04)&(pixels[:,:,1]>pixels[:,:,2]*1.18)&(pixels[:,:,1]>45)&(abs(renderedLocal[:,:,0])<.018)&(abs(renderedLocal[:,:,1])<.013)
    gp=renderedLocal[green]
    vertices=[]
    for i in np.where(selection)[0]:
        rgb=texture[min(texture.shape[0]-1,int(uv[i,1]*texture.shape[0])),min(texture.shape[1]-1,int(uv[i,0]*texture.shape[1]))].tolist()
        vertices.append({'index':int(i),'position':positions[i].tolist(),'local':local[i].tolist(),'uv':uv[i].tolist(),'source_rgb':rgb})
    unique=lambda mask:len({tuple(np.round(v,6)) for v in positions[mask]})
    report['eyes'][name]={'center':center.tolist(),'basis_columns':{'horizontal':x.tolist(),'vertical':y.tolist(),'outward':normal.tolist()},'initial_landmarks_local':points,'aperture_bbox_count':int(aperture.sum()),'aperture_welded_position_count_1um':unique(aperture),'surrounding_vertex_count':int(selection.sum()),'surrounding_welded_position_count_1um':unique(selection),'visible_green_local_bounds':{'min':gp.min(axis=0).tolist(),'max':gp.max(axis=0).tolist()},'vertices':vertices}
(ROOT/'assets/cat-v5-eye-surface-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:{kk:vv for kk,vv in v.items() if kk!='vertices'} for k,v in report['eyes'].items()},indent=2))
