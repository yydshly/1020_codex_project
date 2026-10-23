"""Original deterministic score; render and measure before film production."""
import json, math, pathlib, subprocess, wave
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
P=ROOT/'web/media/v3'; P.mkdir(exist_ok=True,parents=True)
timing=json.loads((ROOT/'notes/v3/timing.json').read_text())
SR=48000; N=SR*20; rng=np.random.default_rng(7311)
music=np.zeros((N,2)); sfx=np.zeros((N,2))
def add(dst,frame,sig,pan=0):
    start=round(frame*SR/timing['fps']); end=min(N,start+len(sig))
    if end>start:
        dst[start:end,0]+=sig[:end-start]*math.sqrt((1-pan)/2)
        dst[start:end,1]+=sig[:end-start]*math.sqrt((1+pan)/2)
for i,frame in enumerate(timing['beats_frames']):
    t=np.arange(int(SR*.43))/SR
    # A woody upper transient makes the score onset measurable without harsh clicks.
    note=[57,64,69,72,60,67,72,76][i%8]; hz=440*2**((note-69)/12)
    env=(1-np.exp(-t*900))*np.exp(-t*8.5)
    sig=(np.sin(2*np.pi*hz*t)+.32*np.sin(2*np.pi*2.003*hz*t)+.10*np.sin(2*np.pi*3.99*hz*t))*env
    sig*=.13 if i%3 else .19
    add(music,frame,sig,(-.3,.2,-.15,.3)[i%4])
    if i%3==0:
        q=np.arange(int(SR*.48))/SR; bass=55*2**(([0,5,7,0][i//12%4])/12)
        add(music,frame,.18*np.sin(2*np.pi*bass*q)*np.exp(-q*6)*(1-np.exp(-q*800)))
    if i%2==0:
        q=np.arange(int(SR*.045))/SR
        tick=rng.normal(0,1,len(q))
        tick=np.diff(tick,prepend=0)*np.exp(-q*100)*.009
        add(music,frame,tick)
event_spectra=[]
for e in timing['events']:
    if e['kind']=='click':
        t=np.arange(int(SR*.07))/SR
        sig=.032*np.sin(2*np.pi*1800*t)*np.exp(-t*100)
    else:
        t=np.arange(int(SR*.20))/SR
        # Restrict the soft sweep below the 1.8 kHz click, instead of broadband
        # noise that occupied both event bands in the first full render.
        sig=.016*np.sin(2*np.pi*(500*t+350/(2*.20)*t*t))*np.sin(np.pi*t/.20)**2
    spec=np.abs(np.fft.rfft(sig))**2; hz=np.fft.rfftfreq(len(sig),1/SR)
    cumulative=np.cumsum(spec)/np.sum(spec)
    event_spectra.append({'id':e['id'],'kind':e['kind'],'energy_band_5_95_hz':[round(float(hz[np.searchsorted(cumulative,q)]),1) for q in [.05,.95]],'centroid_hz':round(float(np.sum(hz*spec)/np.sum(spec)),1)})
    # Click onset lands on the action; a whoosh's energy crest lands on handoff.
    offset_frame=e['frame'] if e['kind']=='click' else e['frame']-round(.1*timing['fps'])
    add(sfx,offset_frame,sig)
# The experiment plan becomes the second-half information peak. The energy
# envelope is continuous and its strongest actual beat is measured below.
frame_axis=np.arange(N)*timing['fps']/SR
music*= (1+.35*np.exp(-((frame_axis-timing['music_energy_focus_frame'])/timing['music_energy_width_frames'])**2))[:,None]
# Natural release; no abrupt last sample. Music remains present on last frame.
fade=np.ones(N);fade[-int(SR*.3):]=np.linspace(1,0,int(SR*.3))**1.5
music*=fade[:,None];sfx*=fade[:,None]
def save(name,data):
    with wave.open(str(P/name),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((np.clip(data,-1,1)*32767).astype('<i2').tobytes())
save('music-raw.wav',music);save('sfx-raw.wav',sfx);save('mix-raw.wav',music+sfx)
def normalize(inp,out):
    r=subprocess.run(['ffmpeg','-v','info','-i',str(P/inp),'-af','loudnorm=I=-14:TP=-1:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf8')
    measured=json.loads(r.stderr[r.stderr.rfind('{'):r.stderr.rfind('}')+1])
    filt='acompressor=threshold=0.05:ratio=6:attack=0.1:release=80,loudnorm=I=-14:TP=-3:LRA=7'
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/inp),'-af',filt,'-ar','48000',str(P/out)],check=True)
    return measured
mix=normalize('mix-raw.wav','mix.wav');normalize('music-raw.wav','music-only.wav')
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'music-only.wav'),'-c:a','aac','-b:a','320k',str(P/'music-only.m4a')],check=True)
# Detect each attack from the actual PCM energy rise, not just copy the intended grid.
mono=music.mean(axis=1); energy=np.convolve(mono**2,np.ones(240)/240,mode='same')
detected=[]
for frame in timing['beats_frames']:
    start=int(frame*SR/60); seg=energy[start:min(N,start+1600)]
    threshold=max(seg)*.12; ix=int(np.argmax(seg>=threshold)); detected.append(round((start+ix)*60/SR))
timing['detected_beats_frames']=detected
timing['beat_detection_method']='PCM 5ms energy, first crossing 12% local peak within each expected onset window; detection uses audio values.'
timing['detected_max_error_frames']=max(abs(a-b) for a,b in zip(detected,timing['beats_frames']))
beat_energy=[float(np.mean(music[round(f*SR/60):min(N,round((f+25)*SR/60))]**2)) for f in timing['beats_frames']]
timing['climax_frames']=[timing['beats_frames'][int(np.argmax(beat_energy))]]
timing['climax_detection_method']='Actual music PCM mean-square energy per 25-frame beat window; strongest window start. A measured energy peak, not a claim about subjective musical drama.'
timing['audio_event_definition']={'click':'PCM transient onset at event frame','whoosh':'symmetric 0.2s envelope energy crest at event frame; starts 6 frames earlier','transition':'event frame is actual content handoff midpoint, not first anticipation frame'}
timing['measured_sfx_events']=[]
for e in timing['events']:
    center=round(e['frame']*SR/60)
    if e['kind']=='whoosh':
        lo=center-int(.08*SR);hi=center+int(.08*SR)
        energy_sfx=np.convolve(np.mean(sfx[lo:hi]**2,axis=1),np.ones(800)/800,mode='same')
        observed=(lo+int(np.argmax(energy_sfx)))*60/SR
    else:
        lo=center;hi=center+800
        segment=np.max(np.abs(sfx[lo:hi]),axis=1)
        observed=(lo+int(np.argmax(segment>.02*np.max(segment))))*60/SR
    timing['measured_sfx_events'].append({'id':e['id'],'planned_frame':e['frame'],'observed_frame':round(observed,3),'error_frames':round(observed-e['frame'],3),'measurement':'actual separate PCM stem; final mix masking/AAC requires independent check'})
timing['measurement_status']='measured PCM onset error; rendered image sync still requires separate check'
(ROOT/'notes/v3/timing.json').write_text(json.dumps(timing,indent=2),encoding='utf8')
report={'mix_raw_loudnorm':mix,'music_rms_db':float(20*np.log10(np.sqrt(np.mean(music**2)))),'sfx_rms_db':float(20*np.log10(np.sqrt(np.mean(sfx**2)))),'detected_max_error_frames':timing['detected_max_error_frames'],'event_spectral_measurements':event_spectra,'spectral_scope':'Energy bands measured from generated event PCM, not perceived masking in final AAC mix.','seed':7311,'generation':'original code synthesis, no generative audio model, no artist reference','listening':'Audio-only preview exported before complete movie; subjective hearing cannot be certified by an agent without audio listening capability.'}
(ROOT/'notes/v3/audio-measurements.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
