"""Mechanical measurements of actual encoded output. Not a director's approval."""
import hashlib,json,pathlib,re,subprocess,sys
import numpy as np
from PIL import Image,ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[2]
movie=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'web/media/v3/round-01.mp4')
name=movie.stem; OUT=ROOT/'.cache/v3-source/measurements'/name;OUT.mkdir(parents=True,exist_ok=True)
def run(args):return subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
probe=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(movie)]).stdout)
video=next(s for s in probe['streams'] if s['codec_type']=='video')
r=run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-14:TP=-1:LRA=7:print_format=json','-f','null','-'])
loud=json.loads(r.stderr[r.stderr.rfind('{'):r.stderr.rfind('}')+1])
(OUT/'loudnorm.log').write_text(r.stderr,encoding='utf8')
freezes={}
for threshold in ['-50dB','-60dB']:
 r=run(['ffmpeg','-hide_banner','-i',str(movie),'-vf',f'freezedetect=n={threshold}:d=0.5','-an','-f','null','-'])
 (OUT/('freeze'+threshold+'.log')).write_text(r.stderr,encoding='utf8')
 durations=[float(x) for x in re.findall(r'freeze_duration:\s*([\d.]+)',r.stderr)]
 start=[float(x) for x in re.findall(r'freeze_start:\s*([\d.]+)',r.stderr)]
 ends=[float(x) for x in re.findall(r'freeze_end:\s*([\d.]+)',r.stderr)]
 if len(start)>len(ends):durations.append(float(probe['format']['duration'])-start[-1])
 freezes[threshold]={'durations_seconds':durations,'total_seconds':sum(durations),'longest_seconds':max(durations,default=0),'definition':'FFmpeg perceptual near-freeze threshold; not identical-frame freeze'}
md5=run(['ffmpeg','-v','error','-i',str(movie),'-map','0:v:0','-f','framemd5','-']).stdout
(OUT/'frames.md5').write_text(md5,encoding='utf8')
hashes=[line.split(',')[-1].strip() for line in md5.splitlines() if line and not line.startswith('#')]
runs=[]; count=0
for a,b in zip(hashes,hashes[1:]):
 if a==b:count+=1
 elif count:runs.append(count);count=0
if count:runs.append(count)
# Dense sheets for independent reviewers, extracted from actual movie.
for kind,step,cols,thumb in [('silent-2fps',30,5,(320,180)),('dense-0.2s',12,5,(256,144)),('contact-sheet',75,4,(320,180))]:
 frames=list(range(0,1200,step))
 if kind=='contact-sheet':
  frames=[i*150+j for i in range(8) for j in [45,105]];frames[0]=0;frames[-1]=1199
 rows=(len(frames)+cols-1)//cols
 sheet=Image.new('RGB',(cols*thumb[0],rows*(thumb[1]+24)),'#eee9dc');draw=ImageDraw.Draw(sheet)
 for i,f in enumerate(frames):
  dest=OUT/f'f{f:04}.png'
  if not dest.exists():run(['ffmpeg','-y','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{f})','-frames:v','1',str(dest)])
  im=Image.open(dest).convert('RGB');im.thumbnail(thumb)
  x=i%cols*thumb[0];y=i//cols*(thumb[1]+24);sheet.paste(im,(x,y));draw.text((x+8,y+thumb[1]+3),f'{f/60:.2f}s / f{f}',fill='#263b34')
 sheet.save(OUT/(kind+'.jpg'),quality=94)
 if kind=='contact-sheet':sheet.save(ROOT/'web/media/v3/contact-sheet.jpg',quality=94)
report={'file':str(movie.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'duration':float(probe['format']['duration']),'video':{k:video.get(k) for k in ['width','height','r_frame_rate','avg_frame_rate','nb_frames','pix_fmt']},'loudness_lufs':float(loud['input_i']),'true_peak_dbtp':float(loud['input_tp']),'freeze':freezes,'identical_frames':{'adjacent_pairs':sum(runs),'longest_repeat_seconds':max(runs,default=0)/60},'scope':'Automated actual artifact measurements; subjective hearing, pixel handoff and every-word checks require independent review.'}
(ROOT/'notes/v3'/f'measurements-{name}.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
