"""Read-only stdlib GLB inspection. Writes a separate audit JSON, never the GLB.

Usage: python audit_cat_a_glb.py [input.glb] [output-report.json]
"""
import bisect
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
WIDTH = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}


class GLB:
    def __init__(self,path):
        raw = Path(path).read_bytes()
        magic, version, declared = struct.unpack_from('<4sII',raw)
        if magic != b'glTF' or version != 2 or declared != len(raw):
            raise ValueError('Invalid GLB header / length')
        self.size = len(raw)
        self.bin = b''
        offset = 12
        while offset < len(raw):
            length, kind = struct.unpack_from('<I4s',raw,offset)
            payload = raw[offset+8:offset+8+length]
            if kind == b'JSON': self.doc = json.loads(payload)
            if kind == b'BIN\x00': self.bin = payload
            offset += 8+length
        self.cache = {}

    def _read_view(self,view_id,byte_offset,count,component_type,width):
        view = self.doc['bufferViews'][view_id]
        if view.get('buffer',0) != 0: raise ValueError('External buffers unsupported in this audit')
        fmt, size = COMPONENTS[component_type]
        stride = view.get('byteStride',size*width)
        start = view.get('byteOffset',0)+byte_offset
        return [tuple(struct.unpack_from('<'+fmt*width,self.bin,start+i*stride)) for i in range(count)]

    def accessor(self,index):
        if index in self.cache: return self.cache[index]
        a = self.doc['accessors'][index]
        width = WIDTH[a['type']]
        values = self._read_view(a['bufferView'],a.get('byteOffset',0),a['count'],a['componentType'],width) if 'bufferView' in a else [(0,)*width for _ in range(a['count'])]
        if 'sparse' in a:
            sparse = a['sparse']; i=sparse['indices']; v=sparse['values']
            indices=self._read_view(i['bufferView'],i.get('byteOffset',0),sparse['count'],i['componentType'],1)
            replacements=self._read_view(v['bufferView'],v.get('byteOffset',0),sparse['count'],a['componentType'],width)
            for (target,),value in zip(indices,replacements): values[target]=value
        if a.get('normalized'):
            denom={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295}[a['componentType']]
            values=[tuple(max(-1.,x/denom) for x in row) for row in values]
        self.cache[index]=values
        return values


def quat_angle(a,b):
    da=math.sqrt(sum(v*v for v in a)); db=math.sqrt(sum(v*v for v in b))
    return math.degrees(2*math.acos(min(1.,abs(sum(x*y for x,y in zip(a,b))/(da*db)))))


def multiply(a,b):
    return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def trs(node,overrides):
    if 'matrix' in node and not overrides:
        return [[node['matrix'][c*4+r] for c in range(4)] for r in range(4)]
    t=overrides.get('translation',node.get('translation',[0,0,0]))
    x,y,z,w=overrides.get('rotation',node.get('rotation',[0,0,0,1]))
    s=overrides.get('scale',node.get('scale',[1,1,1]))
    m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t[0]],
       [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t[1]],
       [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t[2]], [0,0,0,1]]
    for r in range(3):
        for c in range(3):m[r][c]*=s[c]
    return m


def interpolate(times,values,time,path,mode):
    if time <= times[0]:return values[0]
    if time >= times[-1]:return values[-1]
    i=bisect.bisect_right(times,time)-1
    if mode=='STEP':return values[i]
    if mode!='LINEAR':raise ValueError('World diagnostic requires LINEAR/STEP animation')
    weight=(time-times[i])/(times[i+1]-times[i]); a=values[i];b=values[i+1]
    if path=='rotation':
        dot=sum(x*y for x,y in zip(a,b))
        if dot<0:b=tuple(-x for x in b);dot=-dot
        if dot<.9995:
            theta=math.acos(min(1.,dot));s=math.sin(theta)
            return tuple((math.sin((1-weight)*theta)*x+math.sin(weight*theta)*y)/s for x,y in zip(a,b))
        q=tuple((1-weight)*x+weight*y for x,y in zip(a,b));n=math.sqrt(sum(x*x for x in q));return tuple(x/n for x in q)
    return tuple((1-weight)*x+weight*y for x,y in zip(a,b))


def audit(path):
    glb=GLB(path);d=glb.doc;nodes=d.get('nodes',[])
    names=lambda i:nodes[i].get('name','node_'+str(i))
    report={'file':str(Path(path).resolve()),'bytes':glb.size,'animations':[], 'meshes':[], 'skin_nodes':[],
            'materials':[m.get('name','') for m in d.get('materials',[])], 'images':len(d.get('images',[])),
            'extensions_used':d.get('extensionsUsed',[]),'errors':[],'warnings':[]}
    for mesh_id,mesh in enumerate(d.get('meshes',[])):
        info={'id':mesh_id,'name':mesh.get('name',''),'primitives':[],'vertices':0,'triangles':0}
        for primitive in mesh['primitives']:
            attr=primitive['attributes'];count=d['accessors'][attr['POSITION']]['count']
            index_values=glb.accessor(primitive['indices']) if 'indices' in primitive else None
            index_count=len(index_values) if index_values else count
            mode=primitive.get('mode',4)
            triangles=index_count//3 if mode==4 else max(0,index_count-2) if mode in (5,6) else 0
            p={'vertices':count,'triangles':triangles,'mode':mode,'attributes':list(attr),'material':primitive.get('material')}
            if index_values and max(row[0] for row in index_values)>=count: report['errors'].append(info['name']+' invalid vertex index')
            if 'WEIGHTS_0' in attr:
                weights=glb.accessor(attr['WEIGHTS_0']);joints=glb.accessor(attr['JOINTS_0'])
                extra=glb.accessor(attr['WEIGHTS_1']) if 'WEIGHTS_1' in attr else [(0,)]*count
                sums=[sum(w)+sum(e) for w,e in zip(weights,extra)]
                p['weight_sum_min_max']=[min(sums),max(sums)]
                p['max_joint_index']=max(v for row in joints for v in row)
                if 'JOINTS_1' in attr:p['max_joint_index']=max(p['max_joint_index'],max(v for row in glb.accessor(attr['JOINTS_1']) for v in row))
                if min(sums)<.98 or max(sums)>1.02:report['warnings'].append(info['name']+' non-normalized or unweighted vertices')
            info['primitives'].append(p);info['vertices']+=count;info['triangles']+=triangles
        report['meshes'].append(info)
    for node_id,node in enumerate(nodes):
        if 'mesh' not in node:continue
        skin=d['skins'][node['skin']] if 'skin' in node else None
        item={'node':names(node_id),'mesh':report['meshes'][node['mesh']]['name'],'skin':node.get('skin'),
              'joint_count':len(skin['joints']) if skin else 0,'joint_names':[names(i) for i in skin['joints']] if skin else []}
        report['skin_nodes'].append(item)
        if skin:
            for p in report['meshes'][node['mesh']]['primitives']:
                if 'JOINTS_0' not in p['attributes']:report['errors'].append(names(node_id)+' skinned node missing joints')
                elif p['max_joint_index']>=len(skin['joints']):report['errors'].append(names(node_id)+' invalid skin joint index')
    parents={child:i for i,node in enumerate(nodes) for child in node.get('children',[])}
    for animation in d.get('animations',[]):
        info={'name':animation.get('name',''),'channels':len(animation['channels']),'target_nodes':[], 'head_tail_spine_channels':[], 'world_motion':{}}
        all_times=[];tracks=[];targets=set()
        for channel in animation['channels']:
            target=channel['target'];node_id=target.get('node');path_name=target['path']
            if node_id is None:continue
            sampler=animation['samplers'][channel['sampler']]
            times=[v[0] for v in glb.accessor(sampler['input'])];values=glb.accessor(sampler['output'])
            all_times+=times;targets.add(names(node_id))
            mode=sampler.get('interpolation','LINEAR')
            if mode=='CUBICSPLINE':values=values[1::3]
            tracks.append((node_id,path_name,times,values,mode))
            if any(term in names(node_id).lower() for term in ('head','tail','spine','neck')):
                ranges=[max(v[c] for v in values)-min(v[c] for v in values) for c in range(len(values[0]))]
                item={'node':names(node_id),'path':path_name,'keys':len(times),'component_ranges':ranges,'varies':max(ranges)>1e-6}
                if path_name=='rotation':item['rotation_span_degrees']=max(quat_angle(values[0],v) for v in values)
                info['head_tail_spine_channels'].append(item)
        info['target_nodes']=sorted(targets);info['start']=min(all_times);info['end']=max(all_times);info['duration']=max(all_times)-min(all_times)
        # Parent motion matters: Walk's Head local rotation can be constant while
        # the evaluated head moves naturally with its animated neck/spine chain.
        samples={i:[] for i,node in enumerate(nodes) if any(term in names(i).lower() for term in ('head','tail','spine','neck'))}
        try:
            for time in sorted(set(all_times)):
                overrides={};world={}
                for node_id,path_name,times,values,mode in tracks:
                    overrides.setdefault(node_id,{})[path_name]=interpolate(times,values,time,path_name,mode)
                def matrix(i):
                    if i not in world:
                        local=trs(nodes[i],overrides.get(i,{}));world[i]=multiply(matrix(parents[i]),local) if i in parents else local
                    return world[i]
                for i in samples:samples[i].append(matrix(i))
            for i,matrices in samples.items():
                positions=[[m[r][3] for r in range(3)] for m in matrices]
                info['world_motion'][names(i)]={'position_ranges':[max(v[c] for v in positions)-min(v[c] for v in positions) for c in range(3)],
                 'matrix_max_delta_from_first':max(abs(m[r][c]-matrices[0][r][c]) for m in matrices for r in range(4) for c in range(4))}
        except ValueError as exc:report['warnings'].append(str(exc))
        report['animations'].append(info)
    report['totals']={'vertices':sum(m['vertices'] for m in report['meshes']),'triangles':sum(m['triangles'] for m in report['meshes']),
                      'nodes':len(nodes),'meshes':len(report['meshes']),'skins':len(d.get('skins',[]))}
    actual=[a['name'] for a in report['animations']]
    if sorted(actual)!=['Run','Walk']:report['errors'].append('Expected exactly Walk/Run; got '+str(actual))
    for a in report['animations']:
        expected={'Walk':1.125,'Run':14/24}.get(a['name'])
        if expected is not None and abs(a['duration']-expected)>1e-5:report['errors'].append(a['name']+' unexpected duration')
        for group in ('head','tail','spine'):
            found=[c for c in a['head_tail_spine_channels'] if group in c['node'].lower()]
            if not found:report['errors'].append(a['name']+' missing '+group+' channels')
    report['checks_passed']=not report['errors']
    return report


if __name__=='__main__':
    path=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'web/models/cat-a-study.glb'
    out=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'artifacts/cat-a/glb-audit.json'
    if not path.exists():
        print('WAITING_FOR_GLB',path)
        sys.exit(2)
    result=audit(path)
    out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('GLB_AUDIT',out)
    print('ANIMATIONS',[(a['name'],a['duration'],a['channels']) for a in result['animations']])
    print('TOTALS',result['totals'])
    print('SKIN_NODES',[(n['node'],n['joint_count']) for n in result['skin_nodes']])
    print('ERRORS',result['errors'],'WARNINGS',result['warnings'])
    sys.exit(0 if result['checks_passed'] else 1)
