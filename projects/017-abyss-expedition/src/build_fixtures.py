"""Build the two fictional teaching missions. No remote data or credentials."""
import json
from pathlib import Path

DEST = Path(__file__).resolve().parents[1] / 'web' / 'data'

def station(id, label, position, kind, depth, aliases, description, observation, sources, sample=None):
    return dict(id=id, label=label, position=position, kind=kind, depth=depth, aliases=aliases,
                description=description, observation=observation, sourceIds=sources, sample=sample)

def sample(id, name, category, description):
    return dict(id=id, name=name, category=category, description=description)

def mission(id, title, subtitle, description, duration, base_depth, seed, accent, phases, entities, rows):
    lookup = {e['id']: e for e in entities}
    events, frames = [], []
    for event_id, time, entity_id, event_title, detail, temperature, oxygen, battery in rows:
        entity = lookup[entity_id]
        events.append(dict(id=event_id, time=time, entityId=entity_id, title=event_title, detail=detail))
        frames.append(dict(time=time, position=entity['position'], depth=entity['depth'], temperature=temperature, oxygen=oxygen, battery=battery))
    return dict(id=id, title=title, subtitle=subtitle, description=description, unit='分钟', min=0, max=duration,
                baseDepth=base_depth, seed=seed, terrain=id, accent=accent,
                dataNotice='教学模拟航次。地形、站位、时间、深度和传感器读数均为程序化或编写的样例；不对应真实海域或实际航次。温度表示ROV周围海水，电量表示模拟备用电量。',
                phases=[dict(id=p[0], from_=p[1], to=p[2], label=p[3]) for p in phases],
                entities=entities, events=events, frames=frames)

vents = mission(
    'vents', '热液之境', '玄武岩脊 · 热液生态观测',
    '跟随遥操作潜器穿过海底火山脊：辨认岩石台地，寻找黑色羽流，再沿喷口外缘探访生命群落。带回地质、水体与影像记录，追问黑暗中的食物从哪里来。',
    180, 2600, 47, '#66e0ca',
    [('approach',0,18,'抵近定位'),('mapping',18,38,'地形测绘'),('vents',38,108,'热液观察'),('survey',108,152,'区域巡测'),('return',152,181,'返航归档')],
    [
        station('landing','着陆平台',[.15,.74],'lander',2560,['起点','着陆点','landing'],
                '潜器在近底平台旁稳定悬停，灯光扫过脚下的海床。远处岩脊隐入蓝色水体，近底观测从这里开始。',
                '先留下起点影像，辨认岩脊的方向与海床起伏。ROV 的相机、灯光和传感器让船上人员能够观察这片没有阳光的环境。',['noaa-rov']),
        station('basalt','玄武岩台地',[.27,.62],'ridge',2585,['玄武岩','台地','basalt'],
                '深色台地抬起一道粗糙的岩缘。灯光下的岩面纹理，与后方平缓海床形成对照；前方则是本次航次的热液目标区。',
                '记录岩面的纹理、裂隙与高低变化，再到喷口站比较。热液系统把海底岩石、水与地下热源联系起来，周围地貌也是理解喷口的线索。',['noaa-seafloor','whoi-vents'],
                sample('v-rock','玄武岩观察记录','地质记录','保存一份台地纹理与站位的虚拟观察记录，不代表取得真实岩样。')),
        station('chimney','黑烟囱群',[.42,.53],'vent',2610,['热液口','黑烟囱','喷口','chimney','vent'],
                '一组烟囱从岩床上竖起，深色羽流沿顶部升入水中。富含矿物的热液与冷海水相遇，矿物沉淀既能形成烟囱，也能产生悬浮颗粒。',
                '寻找羽流从哪里开始、向哪里扩散。黑色羽流并非燃烧的烟；留意它与周围较清水体的边界，再前往外缘站比较。',['whoi-vents'],
                sample('v-water','羽流外缘水样','模拟水样','标记喷口外缘的一次虚拟水样收集，用于将样本与时空事件关联。')),
        station('garden','热液生命花园',[.59,.39],'coral',2600,['管虫','生命花园','生物群落','garden'],
                '喷口之外，成簇的管状群落聚集在岩面上。这里的观察重点从烟囱转向生命：在阳光到不了的地方，食物网如何开始？',
                '化能合成微生物能利用化学反应释放的能量制造有机物。记录群落与喷口的相对位置，把生命影像和前一站的地质、水体记录联系起来。',['noaa-chemosynthesis'],
                sample('v-life','群落影像样本','影像记录','保存群落观察影像的模拟条目，记录位置与时间，不移除生物。')),
        station('plume','羽流观察窗',[.70,.28],'sampling',2575,['羽流','观察窗','水体','plume'],
                '潜器离开烟囱近旁，来到可回望羽流的水体窗口。此处适合把喷口、颗粒带和周围海水放在同一个视野中。',
                '对比烟囱口与外缘的外观：哪里仍能辨认颗粒，哪里已经接近背景水体？把影像和站点读数分别留下，供返航后对照。',['whoi-vents','noaa-rov']),
        station('crest','北侧山脊',[.81,.42],'ridge',2505,['山脊','北脊','crest'],
                '沿山脊向上，潜器越过热液区北侧的高地。回望时，台地、烟囱与生命花园串成了一段完整的地形关系。',
                '从高处比较各站的距离与相对高低。哪一站靠近喷口，哪一站适合作为远离目标的参照？把这些问题带到下一处沉积边缘。',['noaa-seafloor']),
        station('flank','沉积边缘',[.73,.65],'sampling',2620,['沉积','边缘','flank'],
                '粗糙岩地逐渐过渡为较平缓的海床。此处与烟囱站相隔一段距离，为本次航次提供另一种环境面貌。',
                '把海床外观与喷口外缘的水体记录配对查看。先描述相同和不同之处，再提出可能的原因；背景站让探索超出最醒目的目标。',['noaa-seafloor'],
                sample('v-background','背景环境记录','对照记录','保存一份模拟背景读数，与热液外缘记录成对展示。')),
        station('beacon','回收信标',[.48,.79],'lander',2550,['信标','回收点','beacon'],
                '回收信标重新出现在灯光中，环绕热液区的巡测接近尾声。烟囱、群落、背景海床的记录将在这里汇合。',
                '检查样本箱：是否同时留下了地质、水体与生命的线索？返航报告保留每份记录的站点和时刻，方便回看它们之间的联系。',['noaa-rov']),
    ],
    [
        ('v-arrive',0,'landing','灯光照亮海床','潜器稳定在近底平台旁。辨认远处岩脊，留下本次航次的第一幅海床印象。',2.3,205,100),
        ('v-map',18,'basalt','读取岩脊的纹理','沿玄武岩台地观察岩面与起伏，保存地质记录，为前方热液区留下参照。',2.4,202,97),
        ('v-vent',38,'chimney','发现黑色羽流','烟囱顶部出现深色颗粒带。观察羽流的起点与外缘，记录矿物、水和热在这里相遇的景象。',4.6,177,93),
        ('v-life',62,'garden','在黑暗中寻找生命','在喷口外缘停留，记录成簇的管状群落。没有阳光的环境，让化能合成成为这站的核心问题。',3.5,184,89),
        ('v-plume',84,'plume','沿羽流边界巡看','转到外侧水体窗口，回望烟囱与颗粒带。将这一视角和喷口近旁的记录放在一起比较。',2.9,192,85),
        ('v-crest',108,'crest','从山脊回望','越过北侧高地，将台地、喷口和生命花园收入同一视野，梳理各站的空间关系。',2.1,210,81),
        ('v-background',132,'flank','留下一个对照站','在较平缓的沉积边缘停留。记录海床外观与水体读数，给热液目标补上一份背景参照。',2.2,208,77),
        ('v-beacon',152,'beacon','核对回收信标','信标出现在灯光前方。检查地质、水体和影像记录是否齐全，准备整理这条环形巡测路线。',2.3,205,74),
        ('v-return',170,'landing','回到着陆平台','重新见到出发平台。回顾沿途的岩石、烟囱与群落：哪些观察回答了问题，哪些值得下一次重访？',2.3,205,71),
        ('v-archive',180,'landing','归档这次深海探索','近底巡测结束。打开航次报告，把站点、观测时刻与收集记录一同带回，保存这次探索的线索。',2.3,205,70),
    ])

canyon = mission(
    'canyon', '峡谷回声', '深海峡谷 · 冷水珊瑚巡测',
    '沿深海峡谷从陡壁走向谷底，探访冷水珊瑚与海绵群落，比较岩壁、扇面和深谷水体。循着地形收集线索，寻找不同海床上的生命如何安家。',
    150, 2750, 93, '#e5b780',
    [('approach',0,16,'抵近定位'),('wall',16,50,'峡壁巡测'),('floor',50,90,'谷底观察'),('ecology',90,128,'生态记录'),('return',128,151,'返航归档')],
    [
        station('c-entry','峡谷入口',[.15,.78],'lander',2670,['入口','起点','entry'],
                '潜器在峡谷外缘开始近底观察。前方岩壁向下延伸，谷底藏在更深的蓝色水体里；此次航次将沿两侧地形深入。',
                '先辨认入口、岩壁和谷底的位置，再留意明亮近景之外的地形轮廓。建立整体方向，才能把后续零散站点连成一段海底故事。',['noaa-seafloor','noaa-rov']),
        station('c-wall','层叠岩壁',[.28,.62],'ridge',2710,['岩壁','峡壁','wall'],
                '沿岩壁向内，层叠起伏切出峡谷的边界。突出的岩缘与下方较平缓的海床，提供了截然不同的观察表面。',
                '记录岩壁的坡度、凹凸和裸露岩面，再与谷底扇面比较。地貌描述是第一步，仅凭外形还不能确定一段峡谷的形成历史。',['noaa-seafloor']),
        station('c-coral','冷水珊瑚台',[.37,.38],'coral',2685,['珊瑚','冷水珊瑚','coral'],
                '一处突出的台面上分布着枝状群落。冷水珊瑚能够生活在深、冷、暗的水域，通过捕捉随水流经过的食物颗粒获得营养。',
                '观察枝状结构之间的空间，并把台面的地形也收入影像。珊瑚提供的不只是自身的生活场所，也能为其他生物提供栖息空间。',['noaa-corals'],
                sample('c-coral-photo','珊瑚群落影像','影像记录','留下一条虚拟影像记录，观察群落形态，不采走珊瑚。')),
        station('c-fan','沉积扇面',[.55,.21],'sampling',2780,['沉积扇','扇面','fan'],
                '离开岩壁，视野展开为一片较平缓的扇面。这里把注意力从突出的岩石与群落转向海床表面的纹理与沉积外观。',
                '比较扇面和上一段岩壁：哪里更平缓，哪里能看见裸露岩面？留下地质记录，稍后与沙纹坡面和最深通道一起回看。',['noaa-seafloor'],
                sample('c-sediment','谷底沉积记录','地质记录','记录模拟沉积环境的外观与站位，用于和岩壁站点比较。')),
        station('c-sand','沙纹坡面',[.76,.34],'ridge',2800,['沙纹','坡面','sand'],
                '潜器越过带状起伏的坡面，海床表面出现与扇面不同的纹理。坡底继续通向此次航次最深的通道。',
                '顺着坡向观察纹理的排列，再回看扇面上的外观。先把纹理方向、位置和周围地形记清楚，形成机制需要更多观测来解释。',['noaa-seafloor']),
        station('c-channel','深谷通道',[.79,.61],'sampling',2850,['深谷','谷底','通道','channel'],
                '两侧地形在这里围出一条深谷通道，潜器抵达本次航次的最深站。灯光贴近海床，观察重点转向谷底水体与周围地形。',
                '保存这一站的水体记录，并与较高处的珊瑚台对照。影像告诉我们环境看起来怎样，传感器记录则补上位置与时刻对应的水体线索。',['noaa-rov'],
                sample('c-water','深谷水体记录','模拟水样','保存最深站的虚拟环境记录，与珊瑚台的站点信息比较。')),
        station('c-sponge','海绵花园',[.59,.78],'coral',2765,['海绵','花园','sponge'],
                '沿谷底边缘抬升，一簇管状与杯状结构进入视野。与珊瑚台的枝状形态相比，这处海绵花园呈现另一种群落外观。',
                '把群落的形态与所在海床一起记录下来，再与珊瑚台影像比较。相似的深海环境中可以出现不同形态，观察差异是提出生态问题的起点。',['noaa-corals'],
                sample('c-sponge-photo','海绵群落影像','影像记录','保存一条虚拟群落影像观察，不将几何模型当成物种鉴定。')),
        station('c-marker','归航标记',[.35,.84],'lander',2700,['归航','标记','marker'],
                '归航标记出现在峡谷外缘，岩壁、深谷与群落的巡测段落在这里汇合。潜器开始沿入口方向返回。',
                '核对三类线索：岩壁与扇面的地质记录、谷底水体记录、珊瑚与海绵的影像。每份记录都应能找回它所属的站点和观测时刻。',['noaa-rov']),
    ],
    [
        ('c-arrive',0,'c-entry','进入峡谷边缘','从外缘辨认岩壁和深谷，留下入口影像。接下来的站点将逐步连接高处台面与低处海床。',2.8,211,100),
        ('c-wall-view',16,'c-wall','沿岩壁向内巡测','沿层叠岩壁记录坡度与起伏，寻找裸露岩面和地形转折，为后续谷底站留下参照。',2.7,209,97),
        ('c-coral-view',32,'c-coral','发现冷水珊瑚','在枝状群落旁停留，将珊瑚形态和台面环境一起收入影像。思考没有阳光的珊瑚如何获得食物。',2.9,213,93),
        ('c-fan-view',50,'c-fan','记录沉积扇面','从岩壁转向平缓扇面，比较海床外观与裸露岩面的变化，保存这一段地形的观察记录。',2.5,205,89),
        ('c-sand-view',70,'c-sand','越过沙纹坡面','沿带状纹理向坡底前行，记下纹理排列与坡向，再回看扇面的地形差异。',2.4,200,85),
        ('c-deep',90,'c-channel','抵达最深通道','来到本次航次最深的谷底站。保存水体记录，为上方珊瑚台的观测补上另一处环境参照。',2.2,196,81),
        ('c-sponge-view',110,'c-sponge','遇见海绵群落','沿谷底边缘发现管状与杯状群落。保存影像，和珊瑚台的枝状外观并排比较。',2.6,204,77),
        ('c-marker-view',128,'c-marker','沿归航标记返回','主要巡测完成。检查样本箱是否留下地质、水体和群落影像，并核对各自的站点。',2.7,208,74),
        ('c-return',140,'c-entry','回到峡谷入口','入口地形重新出现。回顾从岩壁到谷底的变化，挑出最值得重访的一处站点和一个问题。',2.8,211,72),
        ('c-archive',150,'c-entry','完成峡谷档案','近底巡测结束。整理沿途的地形、群落和水体线索，导出报告保存这次峡谷探索。',2.8,211,70),
    ])

DEST.mkdir(parents=True, exist_ok=True)
for data in (vents, canyon):
    for phase in data['phases']:
        phase['from'] = phase.pop('from_')
    (DEST / f"{data['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Built 2 teaching missions; each has 8 entities, 10 events, 5 phases, 4 samples.')
