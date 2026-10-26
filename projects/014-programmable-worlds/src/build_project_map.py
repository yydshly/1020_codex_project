"""Build the current single-image project map. Reads evidence; never starts 3D."""
from pathlib import Path
from html import escape
import base64
import hashlib
import json
import unicodedata
import xml.etree.ElementTree as ET
from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1800, 7280
PAPER, INK, MUTED = '#f6f3e9', '#233d34', '#617268'
GREEN, RUST, BLUE = '#315f4c', '#9c5936', '#456b80'
LINE, SAGE, WARM, COOL = '#cbd5c4', '#e7ede1', '#f2e6d6', '#e6edf0'
FONT = 'Microsoft YaHei'
parts, texts = [], []
fonts = {}

def add(s): parts.append(s)
def rect(x,y,w,h,fill='none',stroke=None,r=0):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
def rule(x,y,w): add(f'<path d="M{x} {y}h{w}" stroke="{LINE}"/>')
def text(x,y,s,size=23,color=INK,weight=400):
    texts.append(s)
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(s)}</text>')
def measure(s,size):
    if size not in fonts: fonts[size]=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)
    return fonts[size].getlength(s)
def para(x,y,s,width,size=23,lh=35,color=MUTED,weight=400):
    lines=[]
    for raw in s.split('\n'):
        line=''
        for c in raw:
            if line and measure(line+c,size)>width:
                lines.append(line);line=c
            else: line+=c
        lines.append(line)
    for i,line in enumerate(lines): text(x,y+i*lh,line,size,color,weight)
    return y+len(lines)*lh
def tag(x,y,label,kind='done',width=None):
    color,fill={'done':(GREEN,SAGE),'future':(RUST,WARM),'proposal':(BLUE,COOL)}[kind]
    width=width or measure(label,18)+26
    rect(x,y-24,width,34,fill,r=4);text(x+13,y,label,18,color,600)
def section(y,num,title,sub):
    rule(72,y-25,1656);rect(72,y,46,42,GREEN,r=4)
    text(81,y+30,num,23,'#f6f3e9',600)
    text(138,y+32,title,35,INK,600)
    para(138,y+72,sub,1560,21,31)
def arrow(x,y,w):
    add(f'<path d="M{x} {y}h{w-10}" fill="none" stroke="{GREEN}" stroke-width="2"/>')
    add(f'<path d="M{x+w-15} {y-5}l8 5-8 5" fill="none" stroke="{GREEN}" stroke-width="2"/>')

FILES={
 'source':('assets/source-live-qa/2026-10-24T08-42-44-256Z/04-headland-35-decoded-video.png','原库完整实时画面的实际解码帧，2026-10-24'),
 'window':('assets/canal-real-qa/2026-10-24T14-18-59-251Z/01-window-canvas.png','老街窗景实际网页抓帧，2026-10-24'),
 'station':('assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/05-actual-docked-canvas.png','独立船坞车站实际靠泊抓帧，2026-10-24'),
 'lijiang':('assets/map-evidence/lijiang-m8-free-20261026.png','漓江M8实际网页画布，2026-10-26'),
 'raft':('assets/extension-references/lijiang-raft-clean-v1.png','用户截图经AI去除界面的静态参考，待开发'),
 'lagoon':('assets/extension-references/island-lagoon-clean-v1.png','用户截图经AI去除界面的静态参考，待开发'),
 'cosmic':('assets/extension-references/cosmic-harbor-clean-v1.png','用户截图经AI去除界面的静态参考，待开发')
}
evidence=[]
def image(key,x,y,w,h):
    rel,role=FILES[key];p=ROOT/rel;data=p.read_bytes()
    evidence.append({'key':key,'path':rel,'role':role,'sha256':hashlib.sha256(data).hexdigest()})
    b64=base64.b64encode(data).decode()
    add(f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{b64}"/>')
def card(x,y,w,h,title,body,status=None,kind='done'):
    rect(x,y,w,h,'#fbfaf4',LINE,8)
    if status: tag(x+22,y+38,status,kind)
    top=y+80 if status else y+40
    text(x+22,top,title,26,INK,600)
    para(x+22,top+42,body,w-44,22,34)

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="map-title map-desc">')
add('<title id="map-title">可编程世界：从源库效果到可控制作的一张图</title>')
add('<desc id="map-desc">源库原理、三个实际探索、三个静态扩展参考、六类创作方向、四条技术路线、受约束制作流程、新对话任务单及项目价值与证据边界。</desc>')
rect(0,0,W,H,PAPER)
add(f'<g font-family="{FONT},sans-serif">')
text(72,66,'014  /  PROGRAMMABLE WORLDS  /  2026.10.26',21,RUST,600)
text(72,141,'从一段海岸航拍，到可控的风景制作。',51,INK,600)
para(72,198,'把效果、方法、探索与经验放在一张图里。当前作为研究与演示成果收口；新的产品与自动制作能力仍需验证。',1656,25,38)
tag(72,289,'已实现／实际抓帧','done',260)
tag(355,289,'静态参考／待开发','future',260)
tag(638,289,'控制方案／尚未完整实现','proposal',340)
text(1020,289,'图像说明与状态分别标注，历史证据不代替本次验收。',20,MUTED)

# 01: source and mechanism
section(350,'01','源库 Na Pali：一个由代码构成的海岸','Leon Lin · MIT · 固定研究提交 4afb7c3 · 原库提供技术与创意参考，作品以自身实际效果判断。')
image('source',72,465,900,564)
text(72,1065,'原库完整实时画面 · 本机实际解码帧 / 35 秒海岬机位',20,GREEN,600)
text(72,1098,'地形、植被、海浪、天空与光照均由代码生成；原样副本和署名保留。',20,MUTED)
steps=[('海岸与地貌','海岸轮廓、地形、侵蚀与岩壁形态'),('表面与生态','植被分布、岩石材质与海岸层次'),('海水与天空','海浪、泡沫、云雾、光照与调色'),('镜头与画面','预设航线、自由驾驶与逐帧视频输出')]
for i,(title,body) in enumerate(steps):
    yy=468+i*120;rect(1014,yy,714,100,SAGE,r=6)
    text(1034,yy+34,f'{i+1:02d}  {title}',25,GREEN,600)
    text(1034,yy+72,body,21,MUTED)
    if i<3:add(f'<path d="M1371 {yy+100}v20" stroke="{GREEN}" stroke-width="2"/>')
para(1014,999,'作者记录了 13 轮开发和参考对照。\n接入：专用运行器 → WebRTC → 网页。\n传送完整实时画面，并提供实际控制。',714,22,34)
text(1014,1098,'这是特定海岸的精调作品，不是任意地点生成器。',20,RUST,600)

# 02: actual work
section(1170,'02','我们的探索：三处不同的实践','图中均为真实网页抓帧。A/B 使用有来源的模型、材质与光照资源；纯代码场景约束针对漓江。')
xs=[72,632,1192];cw=536
works=[('window','A · 一扇窗外的世界','环境陪伴 / 老街窗景','窗边、河岸、书店三个机位；观察、移动、暂停水流。','米制空间、有来源素材与烘焙光照，结合实时水面。','2026-10-24 实际网页抓帧'),('station','B · 旧船坞的下一班船','互动叙事 / 独立船坞车站','呼船约 22 秒靠泊；展开栈桥，选择上船离开或留岸目送。','另建布局、主体模型、光照与事件；复用部分底层能力。','2026-10-24 实际靠泊状态'),('lijiang','山水实践 · 漓江晨航 M8','自由取景 / 45 秒航线','四个机位、六向移动与四向转头、两档画质；暂停与重播。','代码生成岩体、贴岩植被、林带、水雾、实时光照和倒影。','2026-10-26 实际网页画布')]
for x,item in zip(xs,works):
    key,title,role,feature,method,caption=item
    rect(x,1283,cw,700,'#fbfaf4',LINE,8);image(key,x,1283,cw,336)
    text(x+18,1653,caption,18,GREEN,600)
    text(x+18,1700,title,26,INK,600)
    text(x+18,1740,role,20,RUST)
    yy=para(x+18,1785,feature,cw-36,22,34)
    para(x+18,yy+22,method,cw-36,21,32)
rect(72,2010,1656,74,SAGE,r=6)
para(96,2039,'漓江演进：开放叶冠／根岩支撑与林带 → 共同山脚、鞍部、支脊与接缝修复 → 生成和绘制调度 → M8 按需启动、常显控件与画质选择。',1608,21,31)

# 03: references / not products
section(2140,'03','三种后期效果：坐在船上，进入风景','船头建立位置，水面带来行进，山群或天幕展开空间。三图经 AI 清理界面，用于构图与氛围参考，均非已完成实时产品。')
future=[('raft','优先候选 · 漓江竹筏慢游','沿用 M8 山水，增加筏头、低位乘坐与自由转头。','最小首版：一段河心航线，启程／暂停／重播／转头；先验低位水面、倒影和镜头稳定。'),('lagoon','独立候选 · 海岛泻湖巡游','独立泻湖、临水峭壁与浅水，坐长尾船近距离观察。','最小首版：一处泻湖、一段贴崖路线和一个停留点；先验崖壁尺度与船水关系。'),('cosmic','独立候选 · 星河港湾夜航','港湾、城市和摩天轮，配奇幻天幕、灯光与水面联动。','最小首版：一段港湾航线与一组天幕变化；先验光色协调及动态舒适感。')]
for x,item in zip(xs,future):
    key,title,body,small=item
    image(key,x+43,2258,450,800)
    tag(x,3100,'静态视觉参考 · 待开发','future',300)
    text(x,3150,title,25,INK,600)
    yy=para(x,3194,body,cw,22,34)
    para(x,yy+16,small,cw,21,32)

# 04: extensions
section(3460,'04','六类扩展，三种可探索的产品形态','方向可以组合。先使用已有成果，再用有限小样验证新的停留、参与和重访价值。')
extensions=[('新风景','泻湖、港湾、雨巷、雪夜与其他自洽空间。'),('环境变化','昼夜、光色、天气、季节及天幕变化。'),('观众参与','停留、乘船、转头、选路线和控制节奏。'),('空间叙事','候船、出发、去留选择与沿途事件。'),('解释旅程','用空间与镜头解释过程，知识独立核验。'),('创作工具','保存地点、参数与机位，积累镜头和导出。')]
for i,(title,body) in enumerate(extensions):
    x=xs[i%3];y=3580+(i//3)*128
    rect(x,y,cw,110,SAGE,r=6);text(x+18,y+35,title,25,GREEN,600)
    para(x+18,y+73,body,cw-36,21,31)
rect(72,3860,1656,94,'#fbfaf4',LINE,6)
text(96,3897,'可能的产品形态',22,RUST,600)
text(352,3897,'陪伴型风景',25,INK,600);text(830,3897,'可参与的旅程',25,INK,600);text(1300,3897,'自己的镜头工作台',25,INK,600)
text(352,3934,'休息／专注／风景收藏',20,MUTED);text(830,3934,'短程游览／叙事／解释',20,MUTED);text(1300,3934,'壁纸／循环片段／分镜',20,MUTED)

# 05 routes and generator layers
section(4040,'05','技术路线：先决定画面怎样生产','编程模型写代码、专用模型生成资产／环境、产品管线整合交互，三层能力应分别看待。')
rows=[('2.5D 图片＋深度视差','保留图片外观，分层、补全遮挡并产生小范围视差。','适合有限镜头；大幅绕行或近看会暴露缺失空间。'),('成熟资产＋真实三维','选择模型、扫描材质，布景与调光后接网页交互。','近景与自由观察更可控；仍需美术、适配与优化。'),('专用三维／世界生成','训练好的模型推断形状、材质或环境，导出后加工。','减少初版制作；生成质量、背面与运行成本需实测。'),('全程序化生成','算法构造地貌、生态、材质、光照与变化。','规则与参数可控；复杂写实质感的开发成本较高。')]
cols=[72,440,1100];widths=[368,660,628]
for i,row in enumerate(rows):
    y=4160+i*106;rect(72,y,1656,106,'#fbfaf4' if i%2==0 else SAGE)
    for j,value in enumerate(row):para(cols[j]+18,y+35,value,widths[j]-36,22,33,INK if j==0 else MUTED,600 if j==0 else 400)
rule(72,4584,1656)
layers=[('生成器','Hunyuan3D／TRELLIS.2：物体与材质。\nMarble：环境、多图与粗布局控制。'),('制作与整合','选材、修整、尺度、布局、光照、格式和性能适配；工具可以替换。'),('网页体验','水面、航线、驾驶、事件与资源管理；生成模型不等于完成产品。')]
for x,(title,body) in zip(xs,layers):
    text(x,4633,title,26,GREEN,600);para(x,4675,body,cw,21,32)
tag(72,4801,'以上生成器尚未接入本项目；完整自动拟合管线尚未实现。','proposal',1110)

# 06 proposed bounded pipeline
section(4880,'06','让算法与固定流程减少无方向试改','建议沉淀的管线 / 尚未完整实现。单张图不能唯一恢复隐藏结构，自动分数也不能代替审美与实际使用。')
controls=[('参考约束','提取山／水／船分区、轮廓、相机和远近关系；人工确认关键构图。','可参考：图像分割、深度估计。\n例如 Depth Anything。'),('固定模板','锁定素材版本、随机种子、成熟模块与布局；只开放少量关键参数。','控制：峰形、位置、相机、光雾与水色。'),('有界求解','同机位自动渲染与对比，在参数范围和次数预算内搜索更合适的结果。','可参考：参数搜索／反向渲染，需定制整合。'),('多项验收','近中远机位＋连续路线；检查画面和操作、碰撞、等待与真实帧率。','通过部分冻结；达到约定用途即收口。')]
for i,(title,body,foot) in enumerate(controls):
    x=72+i*420;rect(x,5000,396,280,COOL,r=7)
    text(x+20,5041,f'{i+1:02d}  {title}',26,BLUE,600)
    yy=para(x+20,5085,body,356,22,34)
    para(x+20,yy+15,foot,356,19,29,BLUE)
    if i<3:arrow(x+396,5140,24)
rect(72,5312,1656,114,SAGE,r=6)
text(96,5352,'应交付成可复用文件',25,GREEN,600)
text(96,5394,'场景模板  ＋  参数与版本清单  ＋  参考约束包  ＋  自动对照脚本',28,INK,600)
para(72,5472,'现有工程已有部分规则、参数和检查脚本，但还没有“任意图 → 稳定高质量互动世界”的自动系统。\n可复现来自固定规则与配置；效率来自局部迭代、缓存和复用，而不是每轮重新生成与重写全部内容。',1656,23,35)

# 07 next-time brief and failure lessons
section(5620,'07','下次打开新对话：带着制作包，而不只是一句愿望','先明确产物是图片、影片还是实时互动；技术路线、素材限制、可操作范围与验收条件一起交接。')
rect(72,5740,1050,462,'#fbfaf4',LINE,8)
text(98,5784,'可直接使用的任务单',27,GREEN,600)
brief=[('目标','参考图中的观看位置、构图、尺度、光色与运动。'),('范围','一处场景、一段路线；启程、暂停、转头等核心操作。'),('路线','明确素材搭景／专用生成／程序化，单独声明素材限制。'),('约束','锁定模板、版本、seed、相机与已经认可的模块。'),('迭代','只改最大差距；给同机位实际截图与前后对照。'),('验收','画面、操作、连续运动、加载与帧率分别验证。'),('收口','达到约定用途结束，其余能力作为可选后续。')]
for i,(label,body) in enumerate(brief):
    yy=5831+i*48;text(98,yy,label,22,RUST,600);para(190,yy,body,900,21,31)
card(1154,5740,574,210,'先做一段代表性小样','先确认主景、观看位置与一段体验成立，再扩展空间和细节。',None)
card(1154,5972,574,230,'防止重复踩坑','功能通过不证明画质；更多细节不修正错误大形；换标题／机位不构成独立作品。',None)
para(72,6250,'复用已有项目时：读取 README、当前状态与方向说明；保留正式版本，在独立目录做小样。提示词组织任务，算法、素材、模板和实际验收共同决定结果。',1656,23,35)

# 08 evidence and value / stopping conditions
section(6340,'08','当前价值、使用边界与继续投入条件','项目作为研究与演示成果保留。工程积累具有复用价值，但技术差异化、稳定省时和商业需求尚未证明。')
card(72,6460,812,184,'已有价值','研究思路、可运行样例、参数与交互代码、来源记录、失败复盘和实际验收经验。常见工程能力的替代性较强。')
card(916,6460,812,184,'进一步投入的门槛','明确一个具体用途，实测证明更省时、同等成本下效果更好／更稳定，或提供用户愿意使用的额外体验。')
rect(72,6670,1656,190,WARM,r=7)
text(96,6712,'漓江 M8 已测范围与限制',26,RUST,600)
para(96,6754,'24 次实际 DOM 操作、9 项综合检查通过；首次生成约 107 秒。流畅／清晰短驾驶约 23.36／18.36fps，各约 2.5 秒，仅代表本次样本。\n离屏暂停绘制，准备中的生成可能继续；主动停止可释放。手机仅做过窄屏布局检查，M8 完整 45 秒导出本轮未复测；离线 60fps 不是实时 60fps。',1608,22,34)
para(72,6910,'证据纪律：本图整理已有抓帧和记录，未重新运行四个场景；静态参考不计作已完成产品；功能检查、视觉复核、性能测量和商业验证分别成立。',1656,22,34,GREEN,600)
rule(72,7000,1656)
text(72,7045,'来源与入口',23,RUST,600)
text(72,7086,'源库：github.com/Leonxlnx/napali · MIT · Leon Lin',21,INK)
text(72,7124,'项目：projects/014-programmable-worlds  /  网页 map.html 可缩放、跳章节、下载 SVG 与 PNG。',21,MUTED)
text(72,7162,'依据：M8 验收、独立运河场景记录、后期产品方向、理解与价值复盘。完整来源与技术链接见项目网页。',20,MUTED)
text(72,7214,'版本 2026-10-26  ·  核心判断：记录方法不等于实现自动能力；让实际用途与可验证增量决定下一步。',21,GREEN,600)
add('</g></svg>')

svg='\n'.join(parts);ET.fromstring(svg)
out=ROOT/'assets/programmable-worlds-map-20261026.svg'
out.write_text(svg,encoding='utf-8')
manifest={'schema':'project-map-content-v1','width':W,'height':H,'status':'generated-awaiting-layout-review','svg':str(out.relative_to(ROOT)),'svgSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'embeddedImages':evidence,'sections':[{'y':y,'title':title} for y,title in [(0,'总览'),(350,'源库效果与原理'),(1170,'我们的探索'),(2140,'三种扩展效果'),(3460,'六类延续与产品形态'),(4040,'技术路线与生成器'),(4880,'算法与控制管线'),(5620,'下次实现任务单'),(6340,'价值与证据边界')]],'textCount':len(texts),'runtimeRegenerated':False}
(ROOT/'notes/project-map-content-20261026.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'svg':str(out),'width':W,'height':H,'bytes':out.stat().st_size,'embeddedImages':len(evidence),'textCount':len(texts)}))
