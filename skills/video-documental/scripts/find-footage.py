#!/usr/bin/env python
"""find-footage.py — search free/real footage sources for one idea, and show it as a sheet.

    python find-footage.py "<query>" <outdir> [--src archive,nasa,commons,mixkit,yt] [--n 8]

Writes <outdir>/<slug>.json (candidates: source, id, title, duration, licence, page, media
url or yt id) and <outdir>/<slug>.jpg (a thumbnail contact sheet, numbered) so a clip is
chosen by LOOKING at it, never by its title.

Sources (no keys, no logins):
  archive  archive.org moving images (Prelinger etc. — mostly public domain; check each item's
           licenseurl). The vintage-film look the references lean on.
  nasa     images-api.nasa.gov videos (public domain).
  commons  Wikimedia Commons video files (licence per file).
  mixkit   mixkit.co tag pages /free-stock-video/<tag>/ (Mixkit licence, free commercial use).
  yt       yt-dlp "ytsearch" metadata only. Rights depend on the channel: NASA = public domain;
           a company's own launch film used in commentary = flag it in PLAN.md; movie clips =
           flag, and only when the film is the subject or the metaphor is the point.
Cut the pick straight from its media URL with ev1_clip.py (ffmpeg reads the URL; 30fps CFR, -g 30). From YouTube,
first the section with the Sloth Python: sloth('-m', 'yt_dlp', '--download-sections', '*12-20', ...) (video-base sloth.py).
"""
import argparse, json, os, re, subprocess, sys, urllib.parse, urllib.request
from io import BytesIO

UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}
UA_API = {'User-Agent': os.environ.get('EV1_CONTACT_UA', 'EditorV1Kit/1.0 (personal video editing)')}   # Wikimedia asks for a contact UA: set EV1_CONTACT_UA='Name/1.0 (you@example.com)'


def get(url, hdr=UA, timeout=25):
    return urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=timeout).read()


def archive(q, n):
    qq = f'({q}) AND mediatype:movies'
    u = ('https://archive.org/advancedsearch.php?q=' + urllib.parse.quote(qq) +
         '&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=downloads&sort[]=downloads+desc&rows=%d&output=json' % n)
    out = []
    for d in json.loads(get(u, UA_API))['response']['docs']:
        ident = d['identifier']
        out.append(dict(src='archive', id=ident, title=d.get('title', ''), licence=d.get('licenseurl', 'see item'),
                        page=f'https://archive.org/details/{ident}', thumb=f'https://archive.org/services/img/{ident}'))
    return out


def archive_media(ident):
    """best mp4 for an archive item."""
    md = json.loads(get(f'https://archive.org/metadata/{ident}', UA_API))
    fs = [f for f in md.get('files', []) if f['name'].lower().endswith('.mp4')]
    fs.sort(key=lambda f: (('h.264' in f.get('format', '').lower()) or ('512kb' in f['name'].lower())) * -1 + 0)
    big = sorted(fs, key=lambda f: -int(f.get('size', 0) or 0))
    pick = big[0] if big else None
    return f'https://archive.org/download/{ident}/{urllib.parse.quote(pick["name"])}' if pick else None


def nasa(q, n):
    u = 'https://images-api.nasa.gov/search?media_type=video&q=' + urllib.parse.quote(q)
    out = []
    for it in json.loads(get(u, UA_API))['collection']['items'][:n]:
        m = it['data'][0]; thumb = next((l['href'] for l in it.get('links', []) if l.get('render') == 'image'), None)
        out.append(dict(src='nasa', id=m['nasa_id'], title=m.get('title', ''), licence='public domain (NASA)',
                        page=f'https://images.nasa.gov/details/{urllib.parse.quote(m["nasa_id"])}', thumb=thumb, collection=it['href']))
    return out


def commons(q, n):
    u = ('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=%d'
         '&gsrsearch=%s&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=480' % (n * 2, urllib.parse.quote(q + ' filetype:video')))
    out = []
    for p in (json.loads(get(u, UA_API)).get('query', {}).get('pages', {}) or {}).values():
        ii = p['imageinfo'][0]
        if not ii.get('mime', '').startswith('video'): continue
        lic = ii.get('extmetadata', {}).get('LicenseShortName', {}).get('value', '?')
        out.append(dict(src='commons', id=p['title'], title=p['title'][5:], licence=lic, page=ii.get('descriptionurl'),
                        media=ii['url'], thumb=ii.get('thumburl')))
    return out[:n]


def mixkit(q, n):
    tag = re.sub(r'[^a-z0-9]+', '-', q.lower()).strip('-')
    try:
        h = get(f'https://mixkit.co/free-stock-video/{tag}/').decode('utf8', 'ignore')
    except Exception:
        return []
    out = []
    for slug, vid in re.findall(r'href="/free-stock-video/([a-z0-9\-]+)-(\d+)/"', h):
        if any(o['id'] == vid for o in out): continue
        out.append(dict(src='mixkit', id=vid, title=slug.replace('-', ' '), licence='Mixkit Stock Video Free License',
                        page=f'https://mixkit.co/free-stock-video/{slug}-{vid}/', media=f'https://assets.mixkit.co/videos/{vid}/{vid}-1080.mp4',
                        thumb=f'https://assets.mixkit.co/videos/{vid}/{vid}-thumb-360-0.jpg'))
        if len(out) >= n: break
    return out


def yt(q, n):
    # yt-dlp es el del Python de Sloth, como módulo (el .exe no arranca).
    sys.path.insert(0, os.path.join(os.environ.get('SLOTH_SKILLS') or os.path.join(os.path.expanduser('~'), '.claude', 'skills'), 'video-base', 'scripts'))
    from sloth import sloth
    r = sloth('-m', 'yt_dlp', '--flat-playlist', '-J', f'ytsearch{n}:{q}', capture_output=True, text=True, encoding='utf-8')
    try:
        es = json.loads(r.stdout).get('entries', [])
    except Exception:
        return []
    return [dict(src='yt', id=e['id'], title=e.get('title', ''), channel=e.get('channel') or e.get('uploader'),
                 duration=e.get('duration'), licence='check channel', page=f'https://www.youtube.com/watch?v={e["id"]}',
                 thumb=f'https://i.ytimg.com/vi/{e["id"]}/hqdefault.jpg') for e in es]


def sheet(cands, path):
    from PIL import Image, ImageDraw
    tw, th = 384, 216; cols = 4; rows = (len(cands) + cols - 1) // cols
    S = Image.new('RGB', (cols * tw, rows * (th + 34)), (25, 25, 25)); d = ImageDraw.Draw(S)
    for i, c in enumerate(cands):
        x, y = (i % cols) * tw, (i // cols) * (th + 34)
        try:
            im = Image.open(BytesIO(get(c['thumb'], UA, 15))).convert('RGB'); im.thumbnail((tw, th)); S.paste(im, (x, y + 34))
        except Exception:
            d.text((x + 8, y + 120), 'no thumb', fill=(200, 80, 80))
        d.text((x + 4, y + 2), f"{i} [{c['src']}] {c['title'][:44]}", fill=(255, 220, 0))
        d.text((x + 4, y + 17), f"{(c.get('channel') or c.get('licence') or '')[:40]} {c.get('duration') or ''}", fill=(170, 170, 170))
    S.save(path, quality=82)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('query'); ap.add_argument('out')
    ap.add_argument('--src', default='archive,nasa,commons,mixkit,yt'); ap.add_argument('--n', type=int, default=6)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    slug = re.sub(r'[^a-z0-9]+', '-', a.query.lower()).strip('-')[:50]
    allc = []
    for s in a.src.split(','):
        try:
            allc += globals()[s](a.query, a.n)
        except Exception as e:
            print(f'{s}: {e}', file=sys.stderr)
    with open(os.path.join(a.out, slug + '.json'), 'w', encoding='utf-8') as f:
        json.dump(allc, f, ensure_ascii=False, indent=1)
    sheet(allc, os.path.join(a.out, slug + '.jpg'))
    for i, c in enumerate(allc): print(i, c['src'], c['id'], '|', c['title'][:70], '|', c.get('channel') or c.get('licence'), c.get('duration') or '')
