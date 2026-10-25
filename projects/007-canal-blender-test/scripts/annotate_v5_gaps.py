import base64
import hashlib
import json
from pathlib import Path
import struct
from xml.sax.saxutils import escape


PROJECT_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = PROJECT_DIR / 'assets'
COLORS = ('#dc713f', '#3489b5', '#168b78')
GAPS = [
    {
        'id': 1,
        'title': '咖啡店上层：一个主窗的节奏',
        'reference_observation': '参考图可见咖啡店上层以一个较突出的大窗为主，两侧有较宽墙面。',
        'v4_observation': 'V4 咖啡店上层呈现两个近似等宽窗，与另外两店形成重复的双窗节奏。',
        'direction': '仅重排、缩放既有窗组及墙段，尝试形成一个主窗的视觉重心。',
        'acceptance': '主机位能清楚读出一个咖啡店主窗；不保留第二个明显开口或产生穿墙。',
        'reference_box_pixels': [252, 15, 185, 214],
        'v4_box_pixels': [148, 83, 397, 263],
    },
    {
        'id': 2,
        'title': '门窗比例：减轻横向装饰',
        'reference_observation': '参考图的门窗与墙面比例更有变化，店招和层间线脚较克制。',
        'v4_observation': 'V4 上层窗、门脸呈较统一的模块比例；层间、檐下和店招横条更厚、更突出。',
        'direction': '只调整既有窗框、门脸与横向线脚的尺度和位置，让开口与墙面占比更自然。',
        'acceptance': '横条不再压过门窗；保留窗洞、玻璃与框架对齐，室内可读。',
        'reference_box_pixels': [576, 310, 425, 295],
        'v4_box_pixels': [573, 334, 408, 304],
    },
    {
        'id': 3,
        'title': '屋顶轮廓：打破一条连续斜线',
        'reference_observation': '参考图屋顶有分段与局部高低变化，第三店屋顶附近可见小山墙轮廓。',
        'v4_observation': 'V4 三店屋顶和屋檐接近一条连续、统一的斜线，分段变化较弱。',
        'direction': '重排既有屋顶、檐线或顶端构件，尝试分段及第三店局部山墙感。',
        'acceptance': '主视角能读出分段轮廓；不用新增网格补细节，不引入明显断缝。',
        'reference_box_pixels': [787, 78, 237, 177],
        'v4_box_pixels': [555, 117, 435, 162],
    },
]
UNCHANGED = [
    {
        'name': '水面反光',
        'note': '两图反光表现不同，本轮不改水面、灯光或材质。',
        'reference_box_pixels': [770, 666, 665, 223],
        'v4_box_pixels': [790, 666, 675, 224],
    },
    {
        'name': '植物',
        'note': '两图枝叶密度与形态不同，本轮不增减或重排植物。',
        'reference_box_pixels': [8, 250, 155, 400],
        'v4_box_pixels': [5, 248, 134, 424],
    },
    {
        'name': '远景',
        'note': 'V4 背景建筑与岸线收尾较简化，本轮保持不变。',
        'reference_box_pixels': [1030, 342, 461, 165],
        'v4_box_pixels': [1011, 332, 494, 157],
    },
]


def source_record(filename):
    contents = (ASSETS_DIR / filename).read_bytes()
    if contents[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Expected an original PNG: ' + filename)
    width, height = struct.unpack('>II', contents[16:24])
    return {
        'path': 'assets/' + filename,
        'sha256': hashlib.sha256(contents).hexdigest(),
        'width': width,
        'height': height,
    }, contents


def wrap_text(value, max_units=53):
    lines = []
    current = ''
    units = 0
    for character in value:
        character_units = 2 if ord(character) > 127 else 1
        if units + character_units > max_units and current:
            lines.append(current)
            current = ''
            units = 0
        current += character
        units += character_units
    if current:
        lines.append(current)
    return lines


def paragraph(parts, value, left, top, color='#334d50', size=21, max_units=53, line_height=31):
    lines = wrap_text(value, max_units)
    parts.append(f'<text x="{left}" y="{top}" fill="{color}" font-size="{size}">')
    for line_index, line in enumerate(lines):
        parts.append(f'<tspan x="{left}" dy="{0 if line_index == 0 else line_height}">{escape(line)}</tspan>')
    parts.append('</text>')
    return top + len(lines) * line_height


def overlay_box(parts, box, color, badge, dashed=False):
    left, top, width, height = box
    dash = ' stroke-dasharray="8 7"' if dashed else ''
    parts.append(f'<rect x="{left}" y="{top}" width="{width}" height="{height}" rx="6" fill="none" stroke="{color}" stroke-width="3" vector-effect="non-scaling-stroke"{dash}/>')
    if dashed:
        parts.append(f'<rect x="{left + 5}" y="{top + height - 36}" width="217" height="31" rx="5" fill="#edf0ed" fill-opacity=".9"/>')
        parts.append(f'<text x="{left + 13}" y="{top + height - 14}" fill="#5e6b6b" font-size="20" font-weight="600">{escape(badge)}</text>')
    else:
        badge_x = max(28, left - 34)
        badge_y = top + 21
        parts.append(f'<circle cx="{badge_x}" cy="{badge_y}" r="25" fill="{color}" stroke="#ffffff" stroke-width="2"/>')
        parts.append(f'<text x="{badge_x}" y="{badge_y + 10}" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="700">{badge}</text>')
        parts.append(f'<path d="M {badge_x + 28} {badge_y + 8} L {left + 17} {top + 35}" stroke="{color}" stroke-width="3" fill="none" marker-end="url(#arrow{badge})" vector-effect="non-scaling-stroke"/>')


def build_svg(sources, encoded_images):
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="2240" height="1595" viewBox="0 0 2240 1595">',
        '<title>V5 开始前：参考图与 V4 的建筑差距标注</title>',
        '<desc>原始参考 PNG 和 V4 渲染 PNG 按原字节嵌入，框、箭头及说明单独叠加。只做目视诊断，不提供相似度分数。V5 尚待主代理确认执行。</desc>',
        '<style>text{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif} .small{fill:#667778;font-size:21px}</style>',
        '<defs>',
    ]
    for index, color in enumerate(COLORS, 1):
        parts.append(f'<marker id="arrow{index}" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" fill="{color}"/></marker>')
    parts.extend([
        '</defs>',
        '<rect width="2240" height="1595" fill="#f5f3ec"/>',
        '<text x="52" y="60" fill="#173e43" font-size="39" font-weight="700">V5 开始前｜先标出建筑差距，再做两张以内的小样</text>',
        '<text x="54" y="101" class="small">原始图片不改写 · 彩色 1–3 为本轮优先项 · 灰框为本轮不改 · 目视诊断不等于像素误差或相似度评分</text>',
    ])
    for panel_index, (source, encoded) in enumerate(zip(sources, encoded_images)):
        panel_x = 52 + panel_index * 1080
        panel_y = 174
        image_width = 1056
        scale = image_width / source['width']
        image_height = source['height'] * scale
        label = '本项目生成入口图｜非源 X 演示图' if panel_index == 0 else 'V4｜本机 Blender 真实渲染'
        parts.append(f'<text x="{panel_x}" y="151" fill="#173e43" font-size="25" font-weight="700">{label}</text>')
        parts.append(f'<rect x="{panel_x - 1}" y="{panel_y - 1}" width="{image_width + 2}" height="{image_height + 2:.3f}" fill="#ffffff" stroke="#abb9b3"/>')
        parts.append(f'<image x="{panel_x}" y="{panel_y}" width="{image_width}" height="{image_height:.3f}" href="data:image/png;base64,{encoded}" preserveAspectRatio="xMinYMin meet"/>')
        parts.append(f'<g transform="translate({panel_x} {panel_y}) scale({scale:.9f})">')
        field = 'reference_box_pixels' if panel_index == 0 else 'v4_box_pixels'
        for unchanged in UNCHANGED:
            overlay_box(parts, unchanged[field], '#8a9898', '本轮不改 · ' + unchanged['name'], True)
        for gap, color in zip(GAPS, COLORS):
            overlay_box(parts, gap[field], color, gap['id'])
        parts.append('</g>')
        parts.append(f'<text x="{panel_x}" y="802" fill="#667778" font-size="18">{source["path"]} · {source["width"]} × {source["height"]} · SHA256 {source["sha256"][:16]}…</text>')
    for gap_index, (gap, color) in enumerate(zip(GAPS, COLORS)):
        card_x = 52 + gap_index * 722
        parts.append(f'<rect x="{card_x}" y="833" width="692" height="490" rx="13" fill="#fffdf7" stroke="#cdd3ca"/>')
        parts.append(f'<rect x="{card_x}" y="833" width="692" height="7" rx="3" fill="{color}"/>')
        parts.append(f'<text x="{card_x + 25}" y="883" fill="{color}" font-size="27" font-weight="700">{gap["id"]}　{escape(gap["title"])}</text>')
        cursor_y = paragraph(parts, '参考：' + gap['reference_observation'], card_x + 25, 929)
        cursor_y = paragraph(parts, 'V4：' + gap['v4_observation'], card_x + 25, cursor_y + 15)
        cursor_y = paragraph(parts, 'V5 方向：' + gap['direction'], card_x + 25, cursor_y + 15, color='#173e43')
        paragraph(parts, '验收：' + gap['acceptance'], card_x + 25, cursor_y + 15, color='#5b6f6d', size=20, line_height=29)
    parts.extend([
        '<rect x="52" y="1346" width="2136" height="181" rx="13" fill="#e6ece5" stroke="#bac8bc"/>',
        '<text x="79" y="1390" fill="#173e43" font-size="27" font-weight="700">本轮边界｜只动既有建筑构件；其他条件固定</text>',
        '<text x="79" y="1430" fill="#334d50" font-size="22">固定 V4 机位、灯光、材质、桥岸和道具；对象、基础顶点与面数不增加，不新加装饰填细节。</text>',
        '<text x="79" y="1465" fill="#334d50" font-size="22">最多两张低清小样 → 对照这 3 项检查 → 保留进展与失败；不改水面反光、植物和远景，先不更新网页。</text>',
        '<text x="79" y="1500" fill="#667778" font-size="21">本板是执行前的目视诊断与计划：没有改写原 PNG，没有新增 V5 渲染，也没有虚构误差分数。</text>',
        '<text x="54" y="1565" fill="#667778" font-size="18">图中框选位置是人工标注，不是自动配准；概念图中不可见结构不作事实推断。详细约束与原图完整哈希见 v5-gap-plan.json。</text>',
        '</svg>',
    ])
    return '\n'.join(parts)


def run():
    reference, reference_bytes = source_record('reference.png')
    v4, v4_bytes = source_record('render-v4.png')
    sources = [reference, v4]
    plan = {
        'schema_version': 1,
        'stage': 'pre_v5_visual_diagnosis',
        'execution_status': 'proposed_awaiting_root_review_before_v5_execution',
        'reference_origin': '本项目生成的测试入口概念图，非源 X 演示图。',
        'sources': sources,
        'source_images_modified': False,
        'annotation_method': 'Deterministic SVG overlays on byte-identical embedded original PNG files; manually selected boxes in original image pixels.',
        'assessment_scope': 'Visual observations only; no author intent inferred, no automatic alignment and no fabricated error or similarity score.',
        'priority_gaps': GAPS,
        'out_of_scope': UNCHANGED,
        'locked_v4_conditions': ['camera', 'lighting', 'materials', 'bridge_and_banks', 'water', 'props', 'vegetation', 'distant_background'],
        'allowed_changes': ['Reposition or scale existing architectural components', 'Rearrange existing architectural vertices without adding topology'],
        'complexity_budget': {'objects_must_not_increase': True, 'base_vertices_must_not_increase': True, 'base_faces_must_not_increase': True, 'lights_must_not_increase': True},
        'preview_budget': {'maximum_low_resolution_previews': 2, 'formal_render_authorized_by_this_plan': False},
        'website_updates': False,
        'acceptance': ['Compare each of the three annotated architectural gaps at the unchanged V4 camera', 'Check window/frame/glass alignment and roof/facade continuity', 'Keep both improvements and regressions visible; stop after at most two low-resolution previews'],
    }
    encoded = [base64.b64encode(contents).decode('ascii') for contents in (reference_bytes, v4_bytes)]
    svg_path = ASSETS_DIR / 'v5-gap-annotations.svg'
    json_path = ASSETS_DIR / 'v5-gap-plan.json'
    svg_path.write_text(build_svg(sources, encoded), encoding='utf-8')
    json_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for record in sources:
        current_hash = hashlib.sha256((PROJECT_DIR / record['path']).read_bytes()).hexdigest()
        if current_hash != record['sha256']:
            raise RuntimeError('Original PNG changed during annotation generation.')
    print(json.dumps({'annotation': str(svg_path), 'plan': str(json_path), 'original_png_hashes_unchanged': True, 'v5_render_started': False}, ensure_ascii=False))


if __name__ == '__main__':
    run()
