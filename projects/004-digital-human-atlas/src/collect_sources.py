"""Read public upstream READMEs, pin revisions and keep an auditable source manifest."""
import concurrent.futures, hashlib, json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOS = ['TMElyralab/MuseTalk','Rudrabha/Wav2Lip','bytedance/LatentSync','antgroup/ditto-talkinghead','KlingAIResearch/LivePortrait','OpenTalker/SadTalker','Soul-AILab/SoulX-FlashHead','Soul-AILab/SoulX-FlashTalk','Alibaba-Quark/LiveAvatar','lipku/LiveTalking','antgroup/echomimic_v2','fudan-generative-vision/hallo','guanjz20/ER-NeRF','ashawkey/RAD-NeRF','yerfor/GeneFacePlusPlus','Fictionarry/TalkingGaussian','NVIDIA/Audio2Face-3D-SDK','NVIDIA/Audio2Face-3D-Training-Framework','met4citizen/TalkingHead','pixiv/three-vrm','DanielSWolf/rhubarb-lip-sync','hzwer/ECCV2022-RIFE','FunAudioLLM/CosyVoice','FunAudioLLM/SenseVoice','RVC-Boss/GPT-SoVITS','openspline/openspline']

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'AvatarResearch/1.0'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()

def collect(repo):
    info = {'repository':repo,'url':'https://github.com/'+repo,'checked_on':'2026-10-23','verification':'not-run'}
    try:
        head=json.loads(get('https://api.github.com/repos/'+repo+'/commits?per_page=1'))[0]
        info['commit']=head['sha']
        for filename in ['README.md','readme.md','README.MD','README.adoc']:
            try:
                url=f'https://raw.githubusercontent.com/{repo}/{info["commit"]}/{filename}'
                raw=get(url); break
            except Exception:
                raw=None
        if raw is None: raise ValueError('README unavailable')
        info.update(source_url=url,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),status='verified')
        cache=ROOT.parent.parent/'.cache'/'digital-human-atlas';cache.mkdir(parents=True,exist_ok=True)
        (cache/(repo.replace('/','__')+'.md')).write_bytes(raw)
        lines=raw.decode('utf-8',errors='replace').splitlines()
        relevant=[l for l in lines if any(s in l.lower() for s in ['fps','license','real-time','realtime','vram','4090','3090','commercial','8.6','stream','emotion'])]
        print(repo+'\n'+'\n'.join(relevant[:9])[:1800],flush=True)
    except Exception as error:
        info.update(status='unverified',error=str(error));print(repo+': '+str(error),flush=True)
    return info

if __name__=='__main__':
    REPOS = [r.replace('guanjz20/ER-NeRF','Fictionarry/ER-NeRF') for r in REPOS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        sources=list(pool.map(collect,REPOS))
    (ROOT/'notes'/'sources.json').write_text(json.dumps({'checked_on':'2026-10-23','method':'Official repository README fetched at pinned HEAD; SHA-256 of retrieved bytes; no model inference performed.','repositories':sources},ensure_ascii=False,indent=2),encoding='utf-8')
