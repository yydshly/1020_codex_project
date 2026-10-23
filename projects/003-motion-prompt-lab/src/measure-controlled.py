"""Unified measurement of sealed, anonymous candidates. Never fixes or re-encodes a film."""
from pathlib import Path
import subprocess,json,hashlib,re,datetime,sys
from PIL import Image,ImageDraw,ImageFont

def run(args):
    p=subprocess.run([str(s) for s in args],capture_output=True,text=True,encoding='utf8',errors='replace')
    if p.returncode: raise RuntimeError(p.stderr[-1800:])
    return p
def measure(file,dest,label):
    dest.mkdir(exist_ok=True,parents=True)
    probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',file]).stdout)
    (dest/'probe.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2),encoding='utf8')
    v=next(s for s in probe['streams'] if s['codec_type']=='video')
    a=next((s for s in probe['streams'] if s['codec_type']=='audio'),None)
    dur=float(v.get('duration',probe['format']['duration']))
    decoded=run(['ffmpeg','-v','error','-threads','2','-i',file,'-f','null','-'])
    low=run(['ffmpeg','-hide_banner','-threads','2','-i',file,'-vf','freezedetect=n=-50dB:d=0.5','-an','-f','null','-']).stderr
    (dest/'freezedetect.txt').write_text(low,encoding='utf8')
    events=[]; active=None
    for line in low.splitlines():
        m=re.search(r'freeze_start: ([0-9.]+)',line)
        if m: active=float(m.group(1))
        m=re.search(r'freeze_end: ([0-9.]+)',line)
        if m and active is not None:
            end=float(m.group(1));events.append({'start':active,'end':end,'duration':end-active});active=None
    if active is not None:events.append({'start':active,'end':dur,'duration':dur-active})
    loud=None
    if a:
        log=run(['ffmpeg','-hide_banner','-threads','2','-i',file,'-vn','-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-']).stderr
        (dest/'loudnorm.txt').write_text(log,encoding='utf8')
        loud=json.loads(log[log.rfind('{'):log.rfind('}')+1])
    # All score rules saved prior to seeing outputs: loudness ±1 LU, peak <= -1, audio duration ±.1 s.
    audio_score=(4 if loud and abs(float(loud['input_i'])+14)<=1 else 0)+(3 if loud and float(loud['input_tp'])<=-1 else 0)+(3 if a and abs(float(a.get('duration',0))-20)<=.1 else 0)
    count=json.loads(run(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','json',file]).stdout)['streams'][0]['nb_read_frames']
    fmt=abs(dur-20)<.001 and v['width']==1280 and v['height']==720 and v['avg_frame_rate']=='60/1' and int(count)==1200
    results={'label':label,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,'duration':dur,'width':v['width'],'height':v['height'],'fps':v['avg_frame_rate'],'decoded_frames':int(count),'decode_ok':True,'format_pass':fmt,'loudness_lufs':float(loud['input_i']) if loud else None,'true_peak_dbtp':float(loud['input_tp']) if loud else None,'audio_technical_score_out_of_10':audio_score,'subjective_audio':'unverified','freeze':{'filter':'freezedetect=n=-50dB:d=0.5','events':events,'total':sum(x['duration'] for x in events),'longest':max([x['duration'] for x in events],default=0)},'measured_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    results['freeze']['threshold_pass']=results['freeze']['total']<=2/3+1e-5 and results['freeze']['longest']<=.5+1e-5
    (dest/'measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
    frames=dest/'frames';frames.mkdir(exist_ok=True)
    run(['ffmpeg','-v','error','-y','-threads','2','-i',file,'-vf',r'select=not(mod(n\,12))','-fps_mode','vfr','-q:v','2',frames/'f-%03d.jpg'])
    run(['ffmpeg','-v','error','-y','-i',file,'-frames:v','1',dest/'poster.png'])
    font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',18)
    allf=sorted(frames.glob('f-*.jpg'))
    def sheet(indices,path,cols=5,width=320):
        hh=180+28;out=Image.new('RGB',(cols*width,((len(indices)+cols-1)//cols)*hh),(245,245,240));d=ImageDraw.Draw(out)
        for k,idx in enumerate(indices):
            im=Image.open(allf[idx]).resize((width,180));x=(k%cols)*width;y=(k//cols)*hh;out.paste(im,(x,y));d.text((x+6,y+183),f'{label} / {idx*.2:04.1f}s',font=font,fill=(25,45,38))
        out.save(path,quality=93)
    # Select exact frame numbers: 0,30,...,1170 for the 2fps sheet, not rounded samples from 5fps.
    bf=dest/'blind-frames';bf.mkdir(exist_ok=True)
    run(['ffmpeg','-v','error','-y','-threads','2','-i',file,'-vf',r'select=not(mod(n\,30)),scale=320:180','-fps_mode','vfr','-q:v','2',bf/'b-%02d.jpg'])
    ims=sorted(bf.glob('b-*.jpg'));bs=Image.new('RGB',(1600,8*208),(245,245,240));draw=ImageDraw.Draw(bs)
    for i,f in enumerate(ims):
        x=(i%5)*320;y=(i//5)*208;bs.paste(Image.open(f),(x,y));draw.text((x+6,y+183),f'{label} / {i*.5:04.1f}s',font=font,fill=(25,45,38))
    bs.save(dest/'blind-2fps.jpg',quality=93)
    for n in range(4):sheet(list(range(n*25,min((n+1)*25,len(allf)))),dest/f'dense-{n+1}.jpg')
    sheet(list(range(0,len(allf),5)),dest/'contact-20.jpg')
    print(json.dumps(results,ensure_ascii=False))
if __name__=='__main__':measure(Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3])
