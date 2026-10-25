"""Read-only measurements of the exported author's paw paths at 0.07 scale."""
import json,statistics
from pathlib import Path
from audit_cat_a_glb import GLB,trs,multiply,interpolate
ROOT=Path(__file__).resolve().parents[1]
glb=GLB(ROOT/'web/models/cat-a-study.glb');doc=glb.doc;nodes=doc['nodes'];scale=.07
parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
names={n.get('name',''):i for i,n in enumerate(nodes)}
paws={
 'frontL':['Toe_ring_L_front','Toe_Pointer_L_front'],
 'frontR':['Toe_ring_L_front.002','Toe_Pointer_L_front.002'],
 'rearL':['Toe_back_L_Ring','Toe_back_L_Pointer'],
 'rearR':['Toe_back_L_Ring.002','Toe_back_L_Pointer.002']}
report={'scale':scale,'method':'Mean of two central toe-bone heads per paw, support candidates within 15mm of each paw minimum and backward velocity; original GLB animation only. Global grounding does not affect velocities.','animations':{}}
all_samples={}
for anim in doc['animations']:
    tracks=[]
    for channel in anim['channels']:
        sampler=anim['samplers'][channel['sampler']];target=channel['target']
        times=[v[0] for v in glb.accessor(sampler['input'])]
        tracks.append((target['node'],target['path'],times,glb.accessor(sampler['output']),sampler.get('interpolation','LINEAR')))
    duration=max(t[-1] for _,_,t,_,_ in tracks);steps=round(duration*240);dt=duration/steps
    samples=[]
    for step in range(steps+1):
        time=step*dt;overrides={};world={}
        for index,path,times,values,mode in tracks:overrides.setdefault(index,{})[path]=interpolate(times,values,time,path,mode)
        def matrix(index):
            if index not in world:
                local=trs(nodes[index],overrides.get(index,{}));world[index]=multiply(matrix(parents[index]),local) if index in parents else local
            return world[index]
        pose={}
        for paw,bones in paws.items():
            pose[paw]=[sum(matrix(names[b])[axis][3]*scale for b in bones)/len(bones) for axis in range(3)]
        samples.append({'t':time,'paws':pose})
    stats={};all_speeds=[]
    for paw in paws:
        lower=min(s['paws'][paw][1] for s in samples);speeds=[];contact=[]
        for i in range(1,len(samples)-1):
            p=samples[i]['paws'][paw];velocity=-(samples[i+1]['paws'][paw][2]-samples[i-1]['paws'][paw][2])/(2*dt)
            if p[1]<lower+.015 and velocity>.03:
                speeds.append(velocity);contact.append(samples[i]['t']/duration)
        all_speeds+=speeds
        stats[paw]={'minY':lower,'maxY':max(s['paws'][paw][1] for s in samples),'support_samples':len(speeds),'median_back_speed':statistics.median(speeds) if speeds else None,'quartile_speed':statistics.quantiles(speeds,n=4) if len(speeds)>3 else [],'support_phases': [min(contact),max(contact)] if contact else []}
    floor=min(stats[p]['minY'] for p in paws)
    candidates=[]
    for sample in samples:
        heights=[v[1]-floor for v in sample['paws'].values()]
        contact=sum(h<.035 for h in heights)
        candidates.append({'phase':sample['t']/duration,'frame':1+sample['t']*24,'support_paws':contact,'max_height':max(heights),'sum_height':sum(heights),'heights':heights})
    candidates.sort(key=lambda x:(-x['support_paws'],x['max_height'],x['sum_height']))
    sensitivity={}
    for threshold in (.004,.008,.015,.020):
        speeds=[]
        for paw in paws:
            for i in range(1,len(samples)-1):
                velocity=-(samples[i+1]['paws'][paw][2]-samples[i-1]['paws'][paw][2])/(2*dt)
                if samples[i]['paws'][paw][1]<stats[paw]['minY']+threshold and velocity>.03:speeds.append(velocity)
        sensitivity[str(threshold)]=statistics.median(speeds) if speeds else None
    report['animations'][anim['name']]={'duration':duration,'paws':stats,'median_back_speed':statistics.median(all_speeds),'quartile_speed':statistics.quantiles(all_speeds,n=4),'contact_threshold_sensitivity':sensitivity,'best_freeze_candidates':candidates[:8],'frame_samples':[samples[round(i*steps/round(duration*24))] for i in range(round(duration*24)+1)]}
    all_samples[anim['name']]=samples

def phase_position(clip,phase,paw):
    seq=all_samples[clip];f=(phase%1)*(len(seq)-1);i=int(f);fraction=f-i
    return [seq[i]['paws'][paw][k]*(1-fraction)+seq[min(i+1,len(seq)-1)]['paws'][paw][k]*fraction for k in range(3)]
offset_errors=[]
for offset_index in range(200):
    offset=offset_index/200;error=0
    for sample in range(100):
        phase=sample/100
        for paw in paws:
            a=phase_position('Walk',phase,paw);b=phase_position('Run',phase+offset,paw)
            error+=(a[2]-b[2])**2+.2*(a[1]-b[1])**2
    offset_errors.append((error/400,offset))
offset_errors.sort()
report['phase_alignment']={'method':'Minimize all-paw forward/backward position RMS over 100 shared phases; Y given 0.2 weight. Run phase = Walk phase + offset. This is only transition timing, not a retargeted gait.',
    'best_run_phase_offset':offset_errors[0][1],'weighted_paw_position_rms_m':offset_errors[0][0]**.5,
    'same_phase_weighted_rms_m':next(e**.5 for e,o in offset_errors if o==0),
    'limitations':'Walk is four-beat while Run is an asymmetric bounding gait; no single phase shift makes all four feet match. Use smooth weight transitions, not a hard switch.'}
report['recommendations']={'walk_reference_speed_mps':.48,'run_reference_speed_mps':2.6,
 'street_run_target_mps':1.8,'street_run_playback_rate':1.8/2.6,
 'idle_walk_phase':.426,'idle_walk_time_seconds':.426*1.125,
 'limitations':['No original idle/turn clip exists; frozen Walk contact frame is a stand-in, not an authored standing animation.',
 'Run support speeds vary substantially by paw and key; original gait is stylized and not a physically calibrated locomotion source.',
 'Speed fitting reduces gross foot sliding but cannot guarantee perfectly planted contacts without original-animation editing or IK.']}
out=ROOT/'artifacts/cat-a/stride-calibration.json';out.write_text(json.dumps(report,indent=2),encoding='utf-8')
for name,a in report['animations'].items():
    print(name,'median',a['median_back_speed'],'quartiles',a['quartile_speed'])
    print('paws',a['paws'])
    print('freeze',a['best_freeze_candidates'][:2])
print('PHASE',report['phase_alignment'])
