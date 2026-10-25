"""Refine semantic eyelid picks on the original projected eye surfaces."""
import json
import runpy
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
state=runpy.run_path(str(ROOT/'scripts/audit_cat_v5_eye_surfaces.py'))
positions,uv,faces=state['positions'],state['uv'],state['faces']
audit=json.loads((ROOT/'assets/cat-v5-eye-surface-audit.json').read_text())
curves={
 'screenLeft':{'x':[-12.2,-10,-6,-1,4,8,11.2],'upper':[4.2,8,10.8,11.5,10,6.5,-1.6],'lower':[4.2,-.7,-4.5,-6,-5.2,-3.7,-1.6], 'semantic':{'outerCorner':[-12.2,4.2],'innerCorner':[11.2,-1.6],'upperLid':[-.9,11.3],'lowerLid':[-.3,-6.1]}},
 'screenRight':{'x':[-12,-9,-5,0,5,9,12.8],'upper':[-2,5.8,9.7,10.8,9.4,6.5,1.5],'lower':[-2,-4,-5.8,-6,-5.1,-2.7,1.5], 'semantic':{'innerCorner':[-12,-2],'outerCorner':[12.8,1.5],'upperLid':[.5,10.7],'lowerLid':[0,-6]}}
}
result={'source':'web/models/cat-v3-rig.glb','coordinate_system':'Three root Y-up +Z-forward, metres','accuracy_note':'Texture eye boundaries manually refined in original textured local projections; coordinates are exact barycentric surface samples of these picks, not anatomically authored eyelid loops. Treat semantic edge placement as approximately 1 mm accuracy.','eyes':{},'limitations':['No separate globe or eyelid objects; this is one textured, irregular triangle surface.','Original eye appearance spans UV seams. Apply the same position-defined deformation to all coincident vertices; do not select deformations by UV island alone.','An aperture compression can provide a real geometric blink trial, but requires closed-pose visual verification for remaining green slit, triangle folds and stretched fur.','Green-pixel texture tests alone cannot identify all globe/pupil vertices; pupils are dark and surrounding fur can be yellow/green. Use the geometric aperture boundary and expand to containing triangles.']}
for name,e in audit['eyes'].items():
    center=np.array(e['center']);basis=np.stack([e['basis_columns'][a] for a in ['horizontal','vertical','outward']],axis=1)
    local=(positions-center)@basis
    curve=curves[name];xs=np.array(curve['x'])/1000;upper=np.array(curve['upper'])/1000;lower=np.array(curve['lower'])/1000
    def sample(x,y):
        best=None
        for tri in faces:
            v=local[tri];a,b,c=v[:,:2]
            if not(v[:,0].min()<=x<=v[:,0].max() and v[:,1].min()<=y<=v[:,1].max()):continue
            den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-12:continue
            wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;w=np.array([wa,wb,1-wa-wb])
            if min(w)<-1e-6:continue
            z=float(w@v[:,2])
            if -.012<z<.012 and (best is None or z>best['local'][2]):best={'root_position':(w@positions[tri]).tolist(),'local':[x,y,z],'uv':(w@uv[tri]).tolist(),'triangle_indices':tri.tolist()}
        return best
    landmarks={}
    for key,v in curve['semantic'].items():
        picked=sample(v[0]/1000,v[1]/1000)
        if picked is None:
            for dx,dy in [(0,-.2),(0,.2),(-.2,0),(.2,0),(0,-.5),(0,.5)]:
                picked=sample((v[0]+dx)/1000,(v[1]+dy)/1000)
                if picked is not None:
                    picked['pick_adjustment_mm']=[dx,dy];break
        if picked is None:raise RuntimeError('No nearby surface at '+name+'/'+key)
        landmarks[key]=picked
    active=(local[:,0]>=xs.min())&(local[:,0]<=xs.max())&(local[:,1]<=np.interp(local[:,0],xs,upper))&(local[:,1]>=np.interp(local[:,0],xs,lower))&(abs(local[:,2])<.008)
    ids=np.where(active)[0]
    triangles=np.where(np.any(active[faces],axis=1))[0]
    closed_y_slope=(lower[-1]-lower[0])/(xs[-1]-xs[0]);closed_y_intercept=lower[0]-closed_y_slope*xs[0]
    eout={k:e[k] for k in ['center','basis_columns','aperture_welded_position_count_1um','surrounding_welded_position_count_1um']}
    eout.update({'landmarks':landmarks,'aperture_curve_metres':{'x':xs.tolist(),'upper_y':upper.tolist(),'lower_y':lower.tolist()},'slit_line_y_intercept':float(closed_y_intercept),'slit_line_y_slope':float(closed_y_slope),'conservative_aperture_depth_gate_metres':[-.008,.008],'outer_fur_support_box_metres':{'x':[-.021,.021],'y':[-.013,.023],'z':[-.012,.012]},'aperture_vertex_ids':ids.tolist(),'triangles_touching_aperture':triangles.tolist(),'aperture_vertices_inside_polygon':len(ids),'notes':'Outer fur support must feather to zero. Keep lower/nose-facing influence tighter. Consider including entire triangles touching aperture to avoid unmoved green-bearing triangle interiors, then recheck nose separation.'})
    result['eyes'][name]=eout
    path=ROOT/f'assets/cat-v5-eye-{name}-projected.png';img=Image.open(path).convert('RGB');draw=ImageDraw.Draw(img)
    W,H=img.size
    def s(x,y):return ((x/.068+.5)*W,(.5-y/.052)*H)
    outline=[s(x,y) for x,y in zip(xs,upper)]+[s(x,y) for x,y in zip(xs[::-1],lower[::-1])]
    draw.line(outline+[outline[0]],fill=(250,70,40),width=2)
    draw.line([s(xs[0],lower[0]),s(xs[-1],lower[-1])],fill=(80,220,250),width=2)
    for key,v in landmarks.items():
        x,y,_=v['local'];px,py=s(x,y);draw.ellipse((px-4,py-4,px+4,py+4),outline=(255,220,30),width=2);draw.text((px+6,py+4),key,fill=(255,100,40))
    draw.text((8,H-18),'Red: refined aperture. Cyan: closure line. Positions in eye-landmarks-final.json.',fill=(255,255,255))
    img.save(ROOT/f'assets/cat-v5-eye-{name}-aperture.png')
    topology=Image.open(path).convert('RGB');draw=ImageDraw.Draw(topology)
    for fi in triangles:
        tri=faces[fi];p=[s(x,y) for x,y in local[tri,:2]];draw.line(p+[p[0]],fill=(255,150,30),width=1)
    topology.save(ROOT/f'assets/cat-v5-eye-{name}-topology.png')
(ROOT/'assets/cat-v5-eye-landmarks-final.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:{'landmarks':v['landmarks'],'aperture_vertices':v['aperture_vertices_inside_polygon'],'slit_line':[v['slit_line_y_intercept'],v['slit_line_y_slope']]} for k,v in result['eyes'].items()},indent=2))
