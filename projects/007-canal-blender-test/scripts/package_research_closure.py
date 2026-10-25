"""Package existing evidence for research publication. Never runs Blender."""
from pathlib import Path
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
OUT = ROOT / 'artifacts/research-closure'
REFERENCE_NOTE = '本次生成过三个复杂度入口方案；实际建模选择了按范围与预算收敛后的最简单一档 reference.png。三图不是三次建模对照，也不是源帖输入或输出。'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in ('absolute_path', 'project_root', 'preview_url', 'local_preview_base')}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, str):
        value = value.replace(str(ROOT).replace('\\', '/'), '.').replace(str(ROOT), '.')
        if re.search(r'(?i)\b[a-z]:[\\/]', value):
            return '[local path omitted]'
    return value


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    baseline = OUT / 'web-before-closure.json'
    archive = WEB / 'research-v4-original.html'
    if not baseline.exists():
        files = [p for p in WEB.rglob('*') if p.is_file() and not any(s.startswith('research-') for s in p.relative_to(WEB).parts)]
        files += [ROOT / 'README.md', ROOT / 'project.json']
        write_json(baseline, {p.relative_to(ROOT).as_posix(): sha(p) for p in files})
    if not archive.exists():
        shutil.copy2(WEB / 'index.html', archive)
    historical = json.loads(baseline.read_text(encoding='utf-8'))
    if sha(archive) != historical['web/index.html']:
        raise RuntimeError('Historical V4 archive must be byte-identical to the previous index.')
    index = json.loads((OUT / 'media-index.json').read_text(encoding='utf-8'))
    media = {m['path']: m for m in index['media']}
    reference_options = json.loads((ROOT / 'assets/reference-options.json').read_text(encoding='utf-8-sig'))
    options = reference_options['options']
    expected_references = {'assets/reference-initial.png', 'assets/reference-complex.png', 'assets/reference.png'}
    if {item['file'] for item in options} != expected_references or len(options) != 3:
        raise RuntimeError('Reference selection must retain the three recovered original options.')
    selected = [item for item in options if item['selected_for_modeling']]
    if len(selected) != 1 or selected[0]['file'] != 'assets/reference.png':
        raise RuntimeError('Only the preserved reference.png was actually modelled.')
    for item in options:
        source = (ROOT / item['file']).resolve()
        target = (WEB / item['web_url']).resolve()
        if not source.is_relative_to(ROOT) or not target.is_relative_to(WEB):
            raise RuntimeError('Reference option paths must stay within the project and website.')
        if not source.is_file() or sha(source) != item['sha256']:
            raise RuntimeError(f'Recovered reference option failed provenance check: {item["file"]}')
        note = REFERENCE_NOTE if item['selected_for_modeling'] else '恢复的历史生成入口图，仅作为选题与复杂度方案留档，未据此完成对应场景建模。'
        if item['file'] not in media:
            record = {'path': item['file'], 'kind': 'generated-concept-reference', 'kind_zh': '聊天生成的测试入口概念图', 'role': 'reference-option-not-modelled', 'bytes': source.stat().st_size, 'exists': True, 'width': item['width'], 'height': item['height'], 'mime_type': 'image/png', 'served_copy_path': 'web/' + item['web_url'], 'web_relative_url': item['web_url'], 'sha256': item['sha256'], 'note_zh': note}
            index['media'].append(record)
            media[item['file']] = record
        else:
            media[item['file']]['note_zh'] = note
        if target.exists() and sha(target) != item['sha256']:
            raise RuntimeError(f'Existing reference copy differs from its preserved source: {item["web_url"]}')
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        media[item['file']]['served_copy_identical_sha256'] = True
    media['assets/control-guide-original.png']['note_zh'] = '海报生成当时尚未重新核实源帖媒体；本轮已补齐4张原帖照片，完整工程与执行记录仍未独立验证。此图始终是解释海报，不是源站截图或本项目实测成图。'
    index['source_references'][0]['note_zh'] = '研究起点；本轮已补齐该原帖4张照片。生成引导图仍不能当作原帖效果，完整工程与执行过程未独立复现。'
    index['source_references'][0]['local_original_media_paths'] = [f'web/research-media/source/source-x-{i:02d}-original.jpg' for i in range(1, 5)]
    index['source_references'][0]['verification_status'] = 'Four exact-post photos archived from official X responses in this closure. Complete project, full process logs and some per-image input/output identities remain unverified.'
    for item in index['recommended_storyboard']:
        if item['path'] == 'assets/reference.png':
            item['caption_zh'] = '三个生成入口中，最终按预算收敛选用的最简单一档；只有这一张进入实际建模。'
        if item['path'] == 'assets/control-guide-original.png':
            item['caption_zh'] = '前期生成的解释海报，保留当时理解；本轮另补齐源帖4图，非实测对比或能力排名。'
    for version in index['versions']:
        if version['id'] == 'cat-v9':
            version['representative_paths'] = ['assets/cat-v9-release-proof-running.png' if p == 'assets/cat-v9-final-running-threequarter.png' else p for p in version['representative_paths']]
        if version['id'] in ('cat-v3', 'cat-v5'):
            version['blend_paths'] = ['artifacts/cat-v3-rig.blend' if version['id'] == 'cat-v3' else 'artifacts/cat-v5-face.blend']
    used = {p for v in index['versions'] for p in v.get('representative_paths', [])}
    used |= expected_references
    used |= {r['path'] for r in index['recommended_storyboard']}
    used |= {
        'assets/v5-gap-annotations.png', 'assets/v5-preview-01.png', 'assets/v5-preview-02.png',
        'assets/v5-wet-preview-01.png', 'assets/v5-wet-preview-02.png',
        'assets/extension-01-review-01.png', 'assets/extension-01-review-02.png',
        'assets/boundary-02-preview-01.png', 'assets/boundary-02-preview-02.png',
        'assets/landscape-03-preview-01.png', 'assets/landscape-03-preview-02.png',
        'artifacts/scene-space-10/overview-final.png', 'artifacts/scene-space-10/court-final.png',
        'artifacts/scene-space-11/overview-final.png', 'artifacts/scene-space-11/north-edge-final.png',
        'artifacts/scene-space-11/east-river-final.png', 'artifacts/scene-space-11/walk-check.png',
        'assets/cat-v12-final-motion.webm', 'assets/cat-v12-final-run-side.png',
    }
    copied = []
    urls = {}
    for name in sorted(used):
        source = ROOT / name
        if not source.is_file():
            raise FileNotFoundError(name)
        known = media.get(name, {}).get('web_relative_url')
        if known and (WEB / known).is_file() and sha(source) == sha(WEB / known):
            urls[name] = known
            continue
        target = WEB / 'research-media' / 'experiment' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if sha(source) != sha(target):
            raise RuntimeError(name)
        urls[name] = target.relative_to(WEB).as_posix()
        copied.append({'source': name, 'url': urls[name], 'sha256': sha(source), 'bytes': source.stat().st_size, 'transformation': 'none'})
    for v in index['versions']:
        v['showcase'] = []
        for path in v.get('representative_paths', []):
            m = media.get(path, {})
            if path in urls:
                v['showcase'].append({'url': urls[path], 'source': path, 'kind': m.get('kind', ''), 'kind_zh': m.get('kind_zh', ''), 'note_zh': m.get('note_zh', ''), 'width': m.get('width'), 'height': m.get('height')})
        v['page_urls'] = [('research-v4-original.html' if p == 'web/index.html' else p.removeprefix('web/')) for p in v.get('page_paths', [])]
        v['model_urls'] = [p.removeprefix('web/') for p in v.get('model_paths', []) if p.startswith('web/')]
    public = clean(index)
    public['inventory_scope_at_collection_zh'] = public.get('scope_zh', '')
    public['scope_zh'] = '图生3D探索的公开研究档案：原帖展示、三个生成入口及实际采用图、真实建模与渲染、网页漫游、各阶段证据和能力边界。保留历史版本，不新增场景优化。'
    public['gaps_and_caveats'] = [g for g in public['gaps_and_caveats'] if g['id'] not in ('source-media-not-archived', 'media-not-packaged', 'early-generated-options-not-archived')]
    public['source_update_zh'] = '2026-10-25 已通过 X 官方接口补齐原帖4图。源媒体来源清单另见 research-media/source/provenance.json；原媒体与本实验结果严格区分。'
    public['gaps_and_caveats'].append({'id': 'local-diagnostic-originals', 'severity': 'archive-scope', 'detail_zh': '代表媒体已原字节打包；其余诊断图和工程以项目相对路径留索引，仅在本地原文件中保留。索引不提供不存在的网页下载链接。'})
    public['closure_note_zh'] = '完整历史文件索引。代表效果已打包到网页；其余原始诊断素材和 .blend 在本地项目保留，不伪装为网页可下载。源帖图片另见 source/provenance.json。'
    public['packaged_media'] = copied
    public['packaged_urls'] = urls
    public['historical_page'] = 'research-v4-original.html'
    public['reference_options'] = clean(reference_options)
    public['reference_recovery_update_zh'] = '本轮已恢复初始、高复杂度和最终采用的三张历史生成图，修正此前“其他方案未找到”的归档缺口。三图作为独立追加的选题资料，47 个实验条目不增加；只有最终最简单方案实际建模。'
    if 'summary_counts' in public:
        public['summary_counts']['registered_files'] = len(public['media'])
        public['summary_counts']['reference_options'] = len(options)
        public['summary_counts']['not_served_by_current_web_root'] = sum(not (m['path'] in urls or (m.get('web_relative_url') and (WEB / m['web_relative_url']).is_file())) for m in public['media'])
    write_json(WEB / 'research-data/reference-options.json', clean(reference_options))
    write_json(WEB / 'research-data/closure-index.json', public)
    if (OUT / 'evidence-audit.json').exists():
        process = clean(json.loads((OUT / 'evidence-audit.json').read_text(encoding='utf-8')))
        process['publishing_update'] = {'date': '2026-10-25', 'scope': 'Prepared for public research publication; deployment status is recorded separately after verification.', 'reference_options_manifest': 'research-data/reference-options.json', 'reference_options_recovered': 3, 'selected_reference': 'assets/reference.png', 'selection_note_zh': REFERENCE_NOTE, 'historical_timeline_unchanged': True, 'experiment_version_count_unchanged': len(index['versions']), 'note_zh': '追加恢复与公开整理说明，不改写原始审计时间线；旧文档中的本地预览范围及当时缺口属于历史记录。图生3D在本实验指看图后用Python/bpy组织可编辑场景并迭代，不代表单图自动扫描重建或高保真还原已完成。'}
        write_json(WEB / 'research-data/process-audit.json', process)
    print(json.dumps({'versions': len(index['versions']), 'historical_pages': len(index['pages']), 'showcase_media': len(used), 'new_copies': len(copied), 'archive_sha256': sha(archive)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
