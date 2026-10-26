"""Build a source-only, evidence-linked technical poster. Never starts a renderer."""
from pathlib import Path
from html import escape
import base64
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 2160, 6460
COMMIT = '4afb7c3a1aad3d0203193100305c46607134d0f5'
GITHUB = f'https://github.com/Leonxlnx/napali/blob/{COMMIT}/'
PAPER, INK, MUTED = '#f5f3e9', '#203d3c', '#5b7271'
GREEN, BLUE, RUST = '#315e4c', '#315d78', '#99572f'
LINE, SAGE, COOL, WARM = '#c9d4c9', '#e6ede0', '#e5edf0', '#f0e4d4'
parts, text_records, links = [], [], []
fonts = {}

def add(s): parts.append(s)
def rect(x,y,w,h,fill='none',stroke=None,r=0):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
def rule(y): add(f'<path d="M80 {y}H2080" stroke="{LINE}"/>')
def measure(s,size,weight=400):
    key=(size,weight>=600)
    if key not in fonts: fonts[key]=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if key[1] else 'C:/Windows/Fonts/msyh.ttc',size)
    return fonts[key].getlength(s)
def text(x,y,s,size=25,color=INK,weight=400):
    assert x+measure(s,size,weight)<=W-45,(s,x,y)
    text_records.append({'x':x,'y':y,'text':s,'size':size})
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(s)}</text>')
def para(x,y,s,width,size=25,lh=37,color=MUTED,weight=400):
    lines=[]
    for raw in s.split('\n'):
        line=''
        for token in re.findall(r'[A-Za-z0-9_./+?=\-]+|.',raw):
            if line and measure(line+token,size,weight)>width:
                if token in '，。、；：！？）】》' and len(line)>1:
                    lines.append(line[:-1]);line=line[-1]+token
                else: lines.append(line);line=token
            else: line+=token
        lines.append(line)
    for i,s in enumerate(lines):text(x,y+i*lh,s,size,color,weight)
    return y+(len(lines)-1)*lh
def tag(x,y,label,kind='source',width=None):
    color,fill={'source':(GREEN,SAGE),'author':(BLUE,COOL),'advice':(RUST,WARM)}[kind]
    width=width or measure(label,19,600)+28
    rect(x,y-26,width,38,fill,r=5);text(x+14,y,label,19,color,600)
def section(y,n,title,sub,kind='source'):
    rule(y-26);rect(80,y,52,46,GREEN if kind=='source' else BLUE if kind=='author' else RUST,r=5)
    text(89,y+33,n,26,'#fffdf5',600);text(154,y+36,title,40,INK,600)
    para(154,y+79,sub,1920,23,34)
def code_link(x,y,label,line=None,file='index.html',size=19,width=600):
    url=GITHUB+file+(f'#L{line}' if line else '')
    links.append({'label':label,'url':url});add(f'<a href="{escape(url,quote=True)}" target="_blank">')
    end=para(x,y,label,width,size,27,BLUE)
    add('</a>');return end
def arrow(x,y,w):
    add(f'<path d="M{x} {y}h{w-9}m-6-5 7 5-7 5" stroke="{GREEN}" stroke-width="2" fill="none"/>')

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">')
add('<title id="title">Na Pali 源库实现解析：Claude Code 驱动开发，算法、参数与渲染技术地图</title>')
add('<desc id="desc">专门解析固定上游提交，包含作者记载的开发方式、两条GPU数据流、十二项算法、十八个真实参数、构建和输出工具，以及复用建议与证据边界。</desc>')
rect(0,0,W,H,PAPER);add('<g font-family="Microsoft YaHei, sans-serif">')
text(80,64,'SOURCE STUDY  /  NA PALI  /  2026.10.27',23,RUST,600)
text(80,149,'Na Pali：从 Claude Code 到程序海岸',65,INK,600)
text(80,207,'源库专属技术沉淀图  ·  算法 × 参数 × 镜头 × GPU 渲染',30,MUTED)
tag(80,266,'作者记载', 'author');tag(245,266,'源码可证');tag(410,266,'复用建议','advice')
text(635,266,'Leon Lin · MIT · 固定研究提交 4afb7c3 · 开发由 AI 辅助，运行由 JavaScript / WebGL2 执行',22,MUTED)

# 01. Evidence and recorded development workflow.
section(325,'01','Claude Code 驱动开发，成品由代码独立运行','开发角色依据作者 README；下方图像为原作真实运行抓帧，技术结构依据固定源码核对。','author')
photo=ROOT/'assets/source-live-qa/2026-10-24T08-42-44-256Z/04-headland-35-decoded-video.png'
data=photo.read_bytes();encoded=base64.b64encode(data).decode()
add(f'<image x="80" y="445" width="1120" height="702" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{encoded}"/>')
workflow=[('目标与参考','围绕纳帕利海岸照片与明确观看效果进行制作。'),('Claude Code 分工实现','作者记载使用 Claude Code / Opus 5.5；水、天空、地形和植被并行。'),('合并与照片对照','合并模块，由 judge 将渲染结果与海岸参考照片比较。'),('多轮返修与固化','README 记载 13 轮 agent 工作；结果保存在算法、参数和构建代码中。'),('运行与输出','浏览器执行独立 HTML，产生实时画面、静帧或离线影片。')]
for i,(title,body) in enumerate(workflow):
    y=446+i*137;rect(1240,y,840,119,COOL,r=6)
    text(1260,y+36,f'{i+1:02d}  {title}',27,BLUE,600)
    end=para(1260,y+75,body,800,23,32)
    assert end<=y+108,(title,end)
text(80,1186,'实际原作画面 / 2026.10.24 本机完整实时解码帧 · 无外部图片、模型或下载材质构成场景。',21,GREEN,600)
text(80,1222,'“13 轮与分工”属于作者记录；完整对话、每轮决策和参考照片集没有全部公开。',22,MUTED)

# 02. Two real code paths, rather than a fictional universal AI generator.
section(1290,'02','从数据场到像素：初始化一次，随后逐帧渲染','程序会生成高度、属性、植被和海浪纹理作为 GPU 数据缓存；“无下载素材”不等于不用纹理。')
def flow_row(y,label,items):
    text(80,y,label,23,GREEN,600)
    for i,(title,body) in enumerate(items):
        x=80+i*404;rect(x,y+27,384,152,SAGE,r=6)
        text(x+18,y+66,title,26,INK,600)
        end=para(x+18,y+105,body,348,22,30)
        assert end<=y+167,(title,end)
        if i<4:arrow(x+384,y+101,20)
flow_row(1420,'初始化 / generate() + oceanInit()',[
 ('海岸与基形','海岸距离场、山谷和基础山体'),('GPU 侵蚀','汇水下切、坡面崩塌与松弛'),('高度与属性','岩壁补形、坡度和地表属性'),('生态与边界','植被 mask、树格、灌木和包围边界'),('GPU 数据就绪','保留地貌、生态纹理；另初始化三组浪谱')])
flow_row(1660,'每帧 / renderSample() → present()',[
 ('时间、海浪与镜头','更新 FFT 海面与电影相机'),('射线求交','求地面、岩体、植被或水面交点'),('材质与天空','地物、水体或天空着色与阴影'),('空气与样本','雾与空气透视、抖动多采样累积'),('后处理与输出','bloom、ACES、调色、锐化与 HUD')])
para(80,1888,'主几何采用距离场射线步进（SDF raymarch），结合高度场、程序材质和多种近似光照；它不是完整的物理路径追踪器。',2000,23,34,BLUE)

# 03. Source-linked algorithm map.
section(1980,'03','十二项算法：每一项都对应可见的画面作用','以下是对源码实现及其视觉作用的归纳；代码定位链接嵌入 SVG，可直接跳到固定提交。')
algorithms=[
 ('海岸与基础山体','海岸距离、噪声和山谷约束先确定海湾、山脊、峡谷及整体空间尺度。','baseLand / coastSDF · L188 / L4531',188),
 ('GPU 流水侵蚀','八邻域多流向汇水 MFD，结合 stream-power 下切及坡面松弛，组织沟壑与坡脚。','FS_EINIT / FS_ERODE · L222–279',234),
 ('岩壁沟槽与山谷补形','山谷补形、phasor / Gabor 条带、域扭曲及岩层台阶共同形成冲刷槽与岩台。','FS_VFILL / eroFlutes / landH',451),
 ('生态分布规则','依据高度、坡度和海岸距离分配地面植被、树与灌木，控制林带与裸岩关系。','FS_ATTR / FS_VEG / FS_PLANTS',583),
 ('SDF 树冠与岩块','树冠簇、叶丛、棕榈叶和岩块通过距离场构成三维形态，能够相互遮挡。','crownSD / treesSD / rockField',1264),
 ('求交、材质与光照','相机射线求交，近景几何阴影、远景高度场阴影和 AO，配湿润、苔藓与天空补光。','march / shadow / shadeScene',1844),
 ('三尺度 FFT 海浪','方向性 JONSWAP 波谱与涌浪，经过时间演化及 Stockham 逆 FFT，输出位移和坡度。','FS_OSPEC → OEVOLVE → OFFT → OFINAL',803),
 ('水色、浅滩与泡沫','Fresnel 反射、海床与吸收水色、浅水变形、破浪、白帽泡沫和湿岩衔接。','waterHit / foamS / shadeWater',3364),
 ('体积云与天空','在世界坐标中定义积云密度，沿视线积分透射率及光学厚度，另叠加卷云。','cuDens / cirrus / skyView',991),
 ('空气与山谷雾','高度衰减雾、薄霾、前向散射与山谷路径权重，使远近山体产生颜色和对比差异。','mistVis / fogApply · L4227–4295',4227),
 ('电影镜头与构图','PCHIP 单调三次 Hermite 插值位置、注视点和视角，加入轻微侧倾并收束到静帧。','pchip / cineCam · L5161–5211',5182),
 ('采样与最终呈现','抖动多采样累积后，再做亮部扩散、ACES 拟合色调映射、调色和锐化。','renderSample / present / FS_POST',4837),
]
for i,(title,body,code,line) in enumerate(algorithms):
    x=80+(i%3)*680;y=2110+(i//3)*280
    rect(x,y,640,252,'#fbfaf5',LINE,7)
    text(x+20,y+42,f'{i+1:02d}  {title}',29,INK,600)
    end=para(x+20,y+88,body,600,23,34)
    assert end<=y+184,(title,end)
    end=code_link(x+20,y+218,code,line,size=18,width=600)
    assert end<=y+244,(title,end)

# 04. Representative defaults, directly checked against num() calls.
section(3290,'04','十八个真实参数：知道在改什么，再谈可控','固定提交运行页的代表性 URL 参数。默认值不是通用推荐值；源码没有为这些输入提供统一合法范围校验。')
groups=[('地形与生成成本',[
 ('mtnH','320','山体高度尺度；不等于实际最高峰。',4511),('mtnL','520','山体随离岸距离抬升的尺度，改变整体坡势。',4511),('vw','110','谷地之外恢复山体高度的过渡宽度。',4511),('K','0.0022','流水侵蚀强度，要结合迭代次数判断形态。',4512),('eiters','4000','侵蚀迭代次数，直接影响生成工作量。',4513),('hres','4096','最终高度纹理分辨率；更高意味着更多显存与预计算。',4527)]),
 ('生态、水面与空气',[
 ('treeDens','1.7','树木布点密度系数，改变森林的疏密。',4516),('vegRange','2600','精细植被及部分冠层阴影参与距离；增大会增加开销。',4516),('wind','9.5','频谱海浪的风速参数，影响波浪谱。',4517),('waveScale','1.6','三组海浪级联的总幅度系数。',4517),('chop','1.55','海面水平位移与浪形尖锐程度。',4517),('fog','0.0002','距离雾与空气透视系数，影响远山层次。',4514)]),
 ('光照、镜头与采样',[
 ('sunEl','44°','太阳高度角，改变光向和明暗关系。',4515),('expo','1.04','后处理曝光乘数，调节整体亮度。',4514),('camH','1000','静帧与航线最终参考构图的相机高度。',34),('vfov','38°','静帧与收尾参考构图的垂直视场角。',34),('rs','实时 0.5 / 静帧 1','初始线性分辨率比例；像素量约随比例平方变化。',5132),('spp','16（静帧）','抖动多采样次数；增加质量，也增加渲染工作。',5252)])]
parameter_manifest=[]
for gi,(heading,rows) in enumerate(groups):
    x=80+gi*680;y=3420;rect(x,y,640,790,COOL if gi==2 else SAGE,r=7)
    text(x+22,y+43,heading,29,BLUE if gi==2 else GREEN,600)
    for ri,(name,default,body,line) in enumerate(rows):
        yy=y+103+ri*111
        text(x+22,yy,name+' = '+default,25,INK,600)
        end=para(x+22,yy+39,body,596,22,31)
        assert end<y+779,(name,end)
        parameter_manifest.append({'parameter':name,'default':default,'meaning':body,'sourceLine':line})
rect(80,4250,980,135,WARM,r=6);text(100,4290,'固定设计，不是任意世界的自动求解',25,RUST,600)
para(100,4331,'三组 256² FFT；海岸／属性场 2048²；CINE 镜头关键点表，收尾停留 4 秒。',938,22,31)
rect(1100,4250,980,135,WARM,r=6);text(1120,4290,'两个易错点',25,RUST,600)
para(1120,4331,'rough=70 是地形扰动，不是材质粗糙度。默认电影镜头最终采用 cineCam，而非前面保留的 FPV 分支。',938,22,31)

# 05. Reproducible build and the three different output modes.
section(4460,'05','从模块重建，再选择实时、静帧或影片','rebuild.cjs / build_v2.cjs 与截图、视频工具均为开源实现；最终页面可独立运行。')
builds=[('干净模板','v2_template_backup.html'),('几何与材质','patch_v3.cjs'),('海水与天空','patch_v4.cjs'),('外观与植被修正','tweaks.cjs / 植被补丁'),('插入数据与镜头','build_v2.cjs'),('独立成品','index.html')]
for i,(title,code) in enumerate(builds):
    x=80+i*336;y=4590;rect(x,y,320,135,'#fbfaf5',LINE,6)
    text(x+16,y+39,title,25,INK,600)
    para(x+16,y+79,code,288,19,28,BLUE)
    if i<5:arrow(x+320,y+66,16)
outputs=[('实时航线','index.html','当前默认电影镜头；实时会根据负载调整分辨率。首次需要编译着色器并生成世界。','WebGL2 画面质量和真实完成帧率需分别测量。'),('高质量静帧','?mode=still&spp=16','shot.mjs 通过 CDP 驱动浏览器，取得 RGBA，再由 ffmpeg 输出图片。默认图幅 1672×941。','多采样累积可以改善静帧，不等于实时同样快速。'),('离线影片','video.mjs','工具默认 1920×1080、30fps、每帧 4 采样。发布片记录为 SPEED=2.5、1584 帧。','机器级 GPU 锁与分块渲染用于约束负载；离线 30fps 不是实时 30fps。')]
for i,(title,code,body,foot) in enumerate(outputs):
    x=80+i*680;y=4785;rect(x,y,640,320,'#fbfaf5',LINE,7)
    text(x+22,y+45,title,31,INK,600);text(x+22,y+87,code,23,BLUE,600)
    yy=para(x+22,y+132,body,596,23,34)
    end=para(x+22,yy+45,foot,596,21,31,RUST)
    assert end<=y+298,(title,end)

# 06. Explicitly marked interpretation, not invented author tooling.
section(5180,'06','后期复用：先继承已验证的效果，再做受控改造','以下是从本次源码分析得出的复用建议，不代表作者已开源一个任意图片自动生成世界的平台。','advice')
advice=[('确认约束','先复现原作实际画面，明确目标机位、构图、尺度、光色和可更改范围。'),('固定模板','锁定提交、模块、参数与构建工具，保留完整成熟管线作为对照基线。'),('有界改造','从数据和少量关键参数开始；限制变量、候选次数与计算预算，再逐个替换模块。'),('独立验证','固定机位对照后，再看近中远景、连续运动、操作、加载与实际完成帧率。')]
for i,(title,body) in enumerate(advice):
    x=80+i*510;y=5310;rect(x,y,470,265,WARM,r=7)
    text(x+20,y+43,f'{i+1:02d}  {title}',29,RUST,600)
    para(x+20,y+92,body,430,24,36)
    if i<3:arrow(x+470,y+132,40)
rect(80,5620,2000,196,SAGE,r=7)
text(104,5664,'证据边界：哪些已经公开，哪些仍需自己完成',29,GREEN,600)
para(104,5710,'已公开：可运行 HTML、算法模块、真实参数、重建与输出工具。\n未完整公开：开发对话、逐轮决策及评审过程；参考照片集没有附带。\n换题材仍需重新组织地形、生态与镜头，并实测画面和性能。Claude Code 不参与成品的逐像素运行。',1952,24,36)
rule(5880)
text(80,5930,'来源与复用索引',29,RUST,600)
code_link(80,5980,'github.com/Leonxlnx/napali  ·  Leon Lin  ·  MIT',file='README.md',size=24,width=2000)
text(80,6026,'固定提交：'+COMMIT,22,MUTED)
code_link(80,6070,'开发记录：README  /  构建：tools/rebuild.cjs、build_v2.cjs',file='tools/rebuild.cjs',size=22,width=2000)
code_link(80,6112,'模块：v3_geo.glsl、v3_shade.glsl、v4_water.glsl、v4_sky.glsl、v2_flight.js',file='tools/v3_geo.glsl',size=22,width=2000)
code_link(80,6154,'输出工具：shot.mjs、video.mjs、cdp.mjs  /  参数与调用入口：index.html',file='tools/video.mjs',size=22,width=2000)
text(80,6200,'定位：参数 L4510–4518 / generate L4596 / renderSample L4801 / present L4837 / main L5240',21,MUTED)
para(80,6262,'沉淀的重点：可运行实现、算法之间的配合、调校过的默认值，以及能重复执行的构建与画面对照。',2000,28,42,GREEN,600)
text(80,6342,'2026.10.27 源码分析版 · 作者记载、源码事实与复用建议已分开标注 · 本次不作新的 GPU 性能或艺术验收',21,MUTED)
add('</g></svg>')

svg='\n'.join(parts);ET.fromstring(svg)
target=ROOT/'assets/napali-implementation-map-20261027.svg';target.write_text(svg,encoding='utf-8')
manifest={'schema':'napali-implementation-map-v1','title':'Na Pali：从 Claude Code 到程序海岸','width':W,'height':H,'upstreamCommit':COMMIT,'upstreamFileSHA256':hashlib.sha256((ROOT/'web/upstream/index.html').read_bytes()).hexdigest(),'svg':target.relative_to(ROOT).as_posix(),'svgSHA256':hashlib.sha256(target.read_bytes()).hexdigest(),'status':'generated-awaiting-layout-review','authorStatements':'README self-report: Claude Code, Opus5.5,13 rounds,parallel specialists and photo judge; complete history unavailable.','sourceImage':{'path':photo.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(data).hexdigest(),'role':'2026-10-24 actual full original decoded video frame; reused unchanged'},'algorithmCount':len(algorithms),'parameters':parameter_manifest,'links':links,'sections':[{'y':y,'title':title} for y,title in [(0,'总览'),(325,'Claude Code与原作效果'),(1290,'两条GPU数据流'),(1980,'十二项算法'),(3290,'十八个真实参数'),(4460,'构建与三类输出'),(5180,'复用建议与来源')]],'textCount':len(text_records),'runtimeRegenerated':False}
(ROOT/'notes/napali-implementation-map-20261027.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'svg':str(target),'bytes':target.stat().st_size,'width':W,'height':H,'textCount':len(text_records),'parameters':len(parameter_manifest)}))
