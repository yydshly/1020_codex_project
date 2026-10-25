"""Read-only checks for the archive's preservation, references and provenance."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote, quote
from urllib.request import urlopen, Request
import concurrent.futures
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
OUT = ROOT / 'artifacts/research-closure'
checks = []


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def check(name, condition, detail=None):
    checks.append({'name': name, 'passed': bool(condition), 'detail': detail})


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if 'id' in data:
            self.ids.add(data['id'])
        for attr in ('src', 'href', 'poster'):
            if data.get(attr):
                self.links.append(data[attr])


def main():
    baseline = read(OUT / 'web-before-closure.json')
    allowed = {'web/index.html', 'README.md', 'project.json'}
    changed = [p for p, h in baseline.items() if p not in allowed and (not (ROOT / p).is_file() or sha(ROOT / p) != h)]
    check('All existing scene/model/controller/media files unchanged', not changed, {'checked_files': len(baseline) - len(allowed), 'changed': changed})
    check('Previous homepage preserved byte-for-byte', sha(WEB / 'research-v4-original.html') == baseline['web/index.html'])
    check('Previous README preserved byte-for-byte', sha(OUT / 'README-v4-original.md') == baseline['README.md'])
    check('Two closure entry points identical', sha(WEB / 'index.html') == sha(WEB / 'research-closure.html'))
    earlier = read(ROOT / 'artifacts/scene-space-11/preserved-files.json')
    prior_changed = [p for p, h in earlier.items() if p not in allowed and (not (ROOT / p).is_file() or sha(ROOT / p) != h)]
    check('Earlier full-project preservation baseline unchanged except authorized research documents', not prior_changed, {'checked_files': len(set(earlier) - allowed), 'changed': prior_changed})
    data = read(WEB / 'research-data/closure-index.json')
    historical_pages = {p for p in baseline if p.startswith('web/') and p.endswith('.html')}
    registered = {p['path'] for p in data['pages']}
    check('All previous HTML pages indexed', historical_pages == registered, {'historical': len(historical_pages), 'registered': len(registered)})
    check('47 unique stage records', len(data['versions']) == len({v['id'] for v in data['versions']}) == 47)
    check('16 GLB files indexed', len(data['models']) == 16)
    check('Source-media status current', len(data['source_references'][0]['local_original_media_paths']) == 4 and not any(g['id'] in ('source-media-not-archived', 'media-not-packaged') for g in data['gaps_and_caveats']))
    references = set()
    for version in data['versions']:
        references.update(version['page_urls'] + version['model_urls'])
        references.update(item['url'] for item in version['showcase'])
        for blend in version['blend_paths']:
            check(f'Editable source exists: {blend}', (ROOT / blend).is_file())
    for record in data['packaged_media']:
        check(f'Media original preserved: {record["source"]}', sha(ROOT / record['source']) == sha(WEB / record['url']) == record['sha256'])
    evidence = read(WEB / 'research-data/evidence-catalog.json')
    for entry in evidence['entries']:
        references.add(entry['public_url'])
        check(f'Evidence source and public copy: {entry["source_path"]}', sha(ROOT / entry['source_path']) == entry['source_sha256'] and sha(WEB / unquote(entry['public_url'])) == entry['public_sha256'])
    source = read(WEB / 'research-media/source/provenance.json')
    for photo in source['media']:
        for record in (photo, photo['full_resolution']):
            path = ROOT / record['local_path']
            check(f'Exact source media: {record["local_path"]}', path.is_file() and sha(path) == record['sha256'])
            references.add(record['local_path'].removeprefix('web/'))
    parsed = {}
    for html in WEB.rglob('*.html'):
        parser = Links(); parser.feed(html.read_text(encoding='utf-8-sig')); parsed[html.resolve()] = parser
    missing, fragments = [], []
    for html, parser in parsed.items():
        for target in parser.links:
            value = urlsplit(target)
            if value.scheme or value.netloc or target.startswith('../../'):
                continue
            path = (html.parent / unquote(value.path)).resolve() if value.path else html
            if not path.exists():
                missing.append([html.name, target])
            elif value.fragment and path in parsed and unquote(value.fragment) not in parsed[path].ids:
                fragments.append([html.name, target])
            if path.is_file() and path.is_relative_to(WEB):
                references.add(path.relative_to(WEB).as_posix())
    check('Static local links and posters valid', not missing, missing)
    check('HTML fragment links valid', not fragments, fragments)
    check('Dynamic catalog URLs exist', all((WEB / unquote(urlsplit(p).path)).is_file() for p in references))
    path_leaks = []
    for path in list((WEB / 'research-data').rglob('*.json')) + list((WEB / 'research-evidence').rglob('*')):
        if not path.is_file() or path.suffix not in ('.json', '.md', '.html'):
            continue
        content = path.read_text(encoding='utf-8')
        values = [json.loads(content)] if path.suffix == '.json' else [content]
        while values:
            value = values.pop()
            if isinstance(value, dict):
                values.extend(value.values())
            elif isinstance(value, list):
                values.extend(value)
            elif isinstance(value, str) and (re.search(r'(?i)(?:\b[a-z]:[\\/]|file://)', value) or value.startswith('\\\\')):
                path_leaks.append(path.relative_to(WEB).as_posix())
                break
    check('New public evidence omits local absolute paths', not path_leaks, path_leaks)

    def fetch(url):
        try:
            with urlopen(Request('http://127.0.0.1:8062/' + quote(url, safe='/%'), method='HEAD'), timeout=10) as response:
                return (url, response.status)
        except Exception as error:
            return (url, str(error))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(fetch, sorted(references)))
    failures = [r for r in responses if r[1] != 200]
    check('HTTP local asset and page checks', not failures, {'urls': len(responses), 'failures': failures})
    report = {'scope': 'Local research closure only; no scene rendering or edits.', 'passed': all(c['passed'] for c in checks), 'checks': checks}
    (OUT / 'closure-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'checks': len(checks), 'http_urls': len(responses), 'failed': [c for c in checks if not c['passed']]}, ensure_ascii=False))
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
