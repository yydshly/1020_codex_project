"""Install the pinned, complete atlas engine into the independent workbench."""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
SOURCE = ROOT.parent / '015-jiangshan-atlas/web/upstream'
PIN = '53059f1c7fed305807b19365857a5f135daf3ac6'
assert json.loads((SOURCE / 'SOURCE.json').read_text(encoding='utf-8'))['commit'] == PIN
files = []
for folder in ('js', 'css', 'assets', 'topics'):
    for src in (SOURCE / folder).rglob('*'):
        if not src.is_file():
            continue
        rel = src.relative_to(SOURCE)
        dst = WEB / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        files.append(dict(path=rel.as_posix(), sha256=hashlib.sha256(dst.read_bytes()).hexdigest()))
for name in ('LICENSE', 'README_ZH.md', 'CONTRIBUTING_ZH.md', 'llms.txt'):
    shutil.copyfile(SOURCE / name, WEB / ('UPSTREAM-' + name))
(WEB / 'atlas-source.json').write_text(json.dumps(dict(repository='https://github.com/DeanChensj/jiangshan-map', commit=PIN, license='GPL-3.0', files=files, changes='Complete engine/data files retained; independent shell and linked 3D map added in atlas-workbench.js and atlas-terrain.js.'), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
html = (SOURCE / 'index.html').read_text(encoding='utf-8')
body = html[html.index('  <div id="atlas-shell">'):html.index('    <nav id="seo-atlas-directory"')]
body = body.replace('<div id="viewport-frame">', '<div id="viewport-frame">\n<div id="atlas-terrain-host" hidden></div>\n<div id="terrain-caption" hidden><span>三维山河</span> · 拖动旋转 / 滚轮缩放 / 右键平移</div>')
toolbar = '''
      <nav id="workbench-launcher" aria-label="探索历史地图">
        <span class="launcher-label">从这里开始</span>
        <button data-experience="qin">秦扫六合</button>
        <button data-experience="changan">长安沿革</button>
        <button data-experience="sushi">苏轼一生</button>
        <button data-experience="dufu">杜甫归乡</button>
        <button data-experience="compare">古今叠图</button>
        <button data-experience="quiz">寻址挑战</button>
        <button id="make-route">＋ 自建路线</button>
      </nav>
'''
body = body.replace('    </header>', toolbar + '    </header>')
body = body.replace('<div class="control-strip" role="toolbar" aria-label="地图图层与交互模式">', '''<div class="control-strip" role="toolbar" aria-label="地图视角与工具">
        <div class="view-switch" role="group" aria-label="地图视角">
          <button id="view-2d" aria-pressed="false">舆图</button>
          <button id="view-3d" aria-pressed="true">3D 山河</button>
        </div>
        <button id="workbench-help" class="action-btn subtle">怎么玩</button>
        <button id="workbench-fullscreen" class="action-btn subtle" aria-label="全屏地图">⤢</button>
''')
extra = '''
<div id="workbench-feedback" role="status" aria-live="polite" hidden></div>
<dialog id="route-dialog" class="workbench-dialog">
  <form id="route-form">
    <div class="dialog-top"><span>把诗词与行迹放回山河</span><button type="button" data-close="route-dialog" aria-label="关闭路线编辑">×</button></div>
    <h2>画自己的时空路线</h2>
    <p>输入古今地名。一个年份用于整条路线；多个年份与地点逐一对应。</p>
    <label for="route-places">依次经过的地点</label><textarea id="route-places" rows="3" required>湖州，黄州，惠州，儋州</textarea>
    <label for="route-years">年份（负数为公元前）</label><input id="route-years" value="1079，1080，1094，1097" required>
    <p id="route-error" role="alert"></p><button type="submit" class="route-submit">生成路线 →</button>
  </form>
</dialog>
<dialog id="workbench-help-dialog" class="workbench-dialog">
  <div class="dialog-top"><span>山河行记 · 独立历史地图作品</span><button data-close="workbench-help-dialog" aria-label="关闭玩法介绍">×</button></div>
  <h2>在同一张地图里，穿行两千年。</h2>
  <ol><li><strong>拖时间：</strong>底部切换年份与朝代，看疆域、城池、年号和史事一起变化。</li><li><strong>找人和地点：</strong>搜索苏轼、长安或赤壁，打开生平行迹或历代沿革；点事件回到那一年。</li><li><strong>重走路线：</strong>点人物事件、前后箭头或播放；也能自己填写地名和年份生成路线。</li><li><strong>切视角：</strong>舆图保留源库的细部查询与寻址挑战；3D 山河把同一份疆域、地形、城市与路线立起来，可旋转缩放。</li></ol>
  <p>地图引擎与历史数据直接复用 <a href="https://github.com/DeanChensj/jiangshan-map" target="_blank" rel="noopener">DeanChensj / 江山时序</a>；本项目新增独立入口、路线编辑器和联动三维地图。不是从零重写原库。</p>
  <p class="fineprint">历史疆域为源库示意数据；现代 DEM 只作山川参照，垂直比例经过夸张。路线连线表达站点关系，不代表精确行路。挑战使用舆图视角。</p>
  <p><a href="process.html">能力对照、数据来源与实现说明 ↗</a></p>
</dialog>
'''
head = '''<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>山河行记 · 历史时空地图</title>
<meta id="meta-description" name="description" content="复用江山时序完整地图能力的独立作品：时间轴、疆域、古城沿革、人物行迹、自建路线与联动三维山河。">
<link rel="icon" href="assets/favicon.svg"><link rel="stylesheet" href="css/style.css?v=atlas1"><link rel="stylesheet" href="atlas-workbench.css?v=atlas1">
<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.min.js","three/addons/":"./vendor/three/examples/jsm/"}}</script>
</head><body>
'''
scripts = '\n'.join(f'<script src="js/{name}.js?v=20261024a"></script>' for name in ('china_geo_data', 'atlas_boot', 'map_data', 'lore_data', 'zh_hant', 'app'))
previous = WEB / 'miniatures.html'
if not previous.exists():
    shutil.copyfile(WEB / 'index.html', previous)
(WEB / 'index.html').write_text(head+body+extra+scripts+'\n<script type="module" src="atlas-workbench.js?v=atlas1"></script></body></html>\n', encoding='utf-8')
print(f'Installed {len(files)} pinned upstream files; independent workbench shell generated.')
