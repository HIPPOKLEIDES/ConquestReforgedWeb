"""Turns the renders in historia-tools/out/ plus the pack's catalog/lang files into the website data:
    src/data/historia.json            catalog groups, double slabs, mobs, citizens (names/lore from the pack)
    src/assets/historia/...           trimmed WebP thumbnails + marketing screenshots
Run after render.html has produced out/blocks, out/mobs, out/doubleslabs:
    python historia-tools/make_data.py
"""
import json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
PACK = os.environ.get('HISTORIA_PACK', r'E:/Archive/Minecraft/Bedrock/Greco-Roman pack/mcm_packaged/HistoriaRome')
CONTENT = os.path.join(PACK, 'Content')
BP = os.path.join(CONTENT, 'world_template/behavior_packs/BP_hrmn_w')
RPW = os.path.join(CONTENT, 'world_template/resource_packs/RP_hrmn_w')
OUT = os.path.join(HERE, 'out')
ASSETS = os.path.join(SITE, 'src/assets/historia')
DATA = os.path.join(SITE, 'src/data/historia.json')


def read_json(p):
    t = open(p, encoding='utf8').read()
    t = re.sub(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*[\s\S]*?\*/', lambda m: m.group(1) or '', t)
    return json.loads(re.sub(r',\s*([}\]])', r'\1', t))


lang = {}
for line in open(os.path.join(RPW, 'texts/en_US.lang'), encoding='utf8'):
    if '=' in line and not line.startswith('#'):
        k, v = line.rstrip('\n').split('=', 1)
        lang[k] = re.sub(r'§.', '', v).split('#')[0].strip()


def names(item):
    """(name, subtitle, lore) for a catalog identifier like rmnmshp:amphora or rmnmshp:x_e_i (entity spawn item)."""
    short = item.split(':', 1)[1]
    if short.endswith('_e_i'):
        raw = lang.get(f'item.spawn_egg.entity.rmnmshp:{short[:-2]}.name') or lang.get(f'item.spawn_egg.entity.rmnmshp:{short[:-4]}.name') or ''
        lore = ''
    else:
        raw = lang.get(f'item.name.{short}') or lang.get(f'tile.{item}.name') or ''
        lore = ' '.join(lang[f'item.name.{short}.lore_{i}'] for i in range(4) if f'item.name.{short}.lore_{i}' in lang)
    if not raw or raw == 'undefined':
        raw = short.replace('_e_i', '').replace('_', ' ').title()
    name, _, sub = [s.strip() for s in raw.partition('|')]
    return name, sub, lore


def thumb(src, dest, size, pad=0.06):
    """Trim transparent edges, fit into a square canvas, save as WebP."""
    im = Image.open(src).convert('RGBA')
    bb = im.getbbox()
    if not bb:
        return False
    im = im.crop(bb)
    inner = int(size * (1 - pad * 2))
    im.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    canvas.save(dest, 'WEBP', quality=86, method=4)
    return True


def anim_webp(frames_dir, dest, size, fps, out_fps=None, max_s=None, quality=62):
    """Frames of one loop -> animated WebP, cropped to the union of all frames so the model doesn't jump."""
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith('.png'))
    if max_s:
        files = files[:int(max_s * fps)]
    if out_fps and out_fps < fps:
        n = int(len(files) * out_fps / fps)
        files = [files[round(i * fps / out_fps)] for i in range(n) if round(i * fps / out_fps) < len(files)]
        fps = out_fps
    if not files:
        return False
    ims = [Image.open(os.path.join(frames_dir, f)).convert('RGBA') for f in files]
    bb = None
    for im in ims:
        b = im.getbbox()
        if b:
            bb = b if not bb else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    if not bb:
        return False
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    side = max(w, h)
    inner = int(size * 0.92)
    out = []
    for im in ims:
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.alpha_composite(im.crop(bb), ((side - w) // 2, (side - h) // 2))
        sq = sq.resize((inner, inner), Image.LANCZOS)
        c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        c.alpha_composite(sq, ((size - inner) // 2, (size - inner) // 2))
        out.append(c)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    out[0].save(dest, 'WEBP', save_all=True, append_images=out[1:], duration=round(1000 / fps), loop=0, quality=quality, method=4, minimize_size=True)
    return True


GROUP_LABELS = {
    'statues': 'Statues', 'arches': 'Arches', 'columns': 'Columns & Capitals', 'entablature': 'Cornices & Entablature',
    'arena_seats': 'Arena Seating', 'balustrade': 'Balustrades', 'imbrex_and_tegulae': 'Roof Tiles', 'wooden': 'Woodwork',
    'plaster': 'Plaster', 'pediments': 'Pediments', 'food_and_kitchenware': 'Food & Kitchenware', 'lighting': 'Lighting',
    'decorative_paintings': 'Frescoes & Wall Paintings', 'decorative_paintings_entities': 'Frescoes & Wall Paintings',
    'chairs': 'Seating', 'storage': 'Amphorae & Storage', 'tables': 'Tables', 'carpet_roll': 'Rugs & Textiles',
    'plants_and_flowers': 'Plants & Flowers', 'tools': 'Tools & Workshop', 'miscellaneous': 'Miscellaneous',
}
SKIP_GROUPS = {'npcs', 'static_animals', 'effects'}

catalog = json.load(open(os.path.join(BP, 'item_catalog/crafting_item_catalog.json'), encoding='utf8'))
groups, seen = {}, set()
all_ids = {(i if isinstance(i, str) else i.get('name', '')).split(':', 1)[-1]
           for c in catalog['minecraft:crafting_items_catalog']['categories'] for g in c.get('groups', []) for i in g.get('items', [])}
PAINT = os.path.join(OUT, 'paintings')
for cat in catalog['minecraft:crafting_items_catalog']['categories']:
    for g in cat.get('groups', []):
        gid = g.get('group_identifier', {}).get('name', '')
        if not gid.startswith('rmnmshp:'):
            continue
        key = gid.split(':', 1)[1]
        if key in SKIP_GROUPS:
            continue
        label = GROUP_LABELS.get(key, key.replace('_', ' ').title())
        grp = groups.setdefault(label, {'key': re.sub(r'[^a-z]+', '-', label.lower()).strip('-'), 'label': label, 'items': []})
        for item in g.get('items', []):
            ident = item if isinstance(item, str) else item.get('name')
            if not ident or not ident.startswith('rmnmshp:'):
                continue
            short = ident.split(':', 1)[1]
            note = ''
            if key.startswith('decorative_paintings'):
                if short.endswith('_e_i') and short[:-4] in all_ids and os.path.exists(os.path.join(PAINT, short[:-4] + '.png')):
                    continue  # shown once, as the block version (whole picture) with a note
                if not short.endswith('_e_i') and short + '_e_i' in all_ids:
                    note = 'Block & entity'
            if not short.endswith('_e_i') and os.path.exists(os.path.join(PAINT, short + '.png')):
                src = os.path.join(PAINT, short + '.png')
            elif short.endswith('_e_i'):
                src = os.path.join(OUT, 'mobs/rpw', short[:-2] + '.png')
                if not os.path.exists(src):
                    src = os.path.join(OUT, 'mobs/rpw', short[:-4] + '.png')
            else:
                src = os.path.join(OUT, 'blocks', short + '.png')
            if not os.path.exists(src):
                print('no render for', ident)
                continue
            name, sub, lore = names(ident)
            dedupe = (label, name, sub, short.replace('_e_i', ''))
            if dedupe in seen:  # paintings exist as both block and entity: keep the first
                continue
            seen.add(dedupe)
            img = f'/assets/historia/cat/{short}.webp'
            if thumb(src, os.path.join(SITE, 'src' + img), 192):
                grp['items'].append({'id': short, 'name': name, 'sub': sub, 'lore': lore, 'img': img, **({'note': note} if note else {})})
groups = [g for g in groups.values() if g['items']]

# ---- double slabs (vanilla double slab -> Historia texture)
def pretty_slab(n):
    n = re.sub(r'_?double_?slab\d*', '', n).replace('double_stone_slab4', 'stone')
    return n.replace('_', ' ').strip().title() or 'Stone'
double = []
dsdir = os.path.join(OUT, 'doubleslabs')
for f in sorted(os.listdir(dsdir)):
    if '__base' in f or not f.endswith('.png'):
        continue
    n = f[:-4]
    img = f'/assets/historia/ds/{n}.webp'
    thumb(os.path.join(dsdir, f), os.path.join(SITE, 'src' + img), 192, pad=0.02)
    entry = {'id': n, 'name': pretty_slab(n), 'img': img}
    base = os.path.join(dsdir, n + '__base.png')
    if os.path.exists(base):
        bimg = f'/assets/historia/ds/{n}__base.webp'
        thumb(base, os.path.join(SITE, 'src' + bimg), 192, pad=0.02)
        entry['base'] = bimg
    double.append(entry)

# ---- bestiary (names are editable in src/data/historia.json afterwards; vanilla = the mob it replaces)
MOBS = [
    ('elder_guardian', 'Poseidon', 'Elder Guardian', 'mythic'), ('warden', 'Minotaur', 'Warden', 'mythic'),
    ('blaze', 'Harpy', 'Blaze', 'mythic'), ('guardian', 'Mermaid', 'Guardian', 'mythic'),
    ('piglin_brute', 'Centaur', 'Piglin Brute', 'mythic'), ('piglin', 'Satyr', 'Piglin', 'mythic'),
    ('iron_golem', 'Cyclops', 'Iron Golem', 'mythic'), ('allay', 'Cupid', 'Allay', 'mythic'),
    ('ravager', 'War Elephant', 'Ravager', 'beast'), ('hoglin', 'Wild Boar', 'Hoglin', 'beast'),
    ('sniffer', 'Tortoise', 'Sniffer', 'beast'), ('phantom', 'Vulture', 'Phantom', 'beast'),
    ('vex', 'Raven', 'Vex', 'beast'), ('parrot', 'Seagull', 'Parrot', 'beast'),
    ('silverfish', 'Rat', 'Silverfish', 'beast'), ('endermite', 'Snake', 'Endermite', 'beast'),
    ('mooshroom', 'Bull', 'Mooshroom', 'beast'), ('cow', 'Cow', 'Cow', 'farm'), ('horse', 'Horse', 'Horse', 'farm'),
    ('donkey', 'Donkey', 'Donkey', 'farm'), ('camel', 'Camel', 'Camel', 'farm'), ('goat', 'Goat', 'Goat', 'farm'),
    ('pig', 'Pig', 'Pig', 'farm'), ('sheep', 'Sheep', 'Sheep', 'farm'), ('chicken', 'Chicken', 'Chicken', 'farm'),
    ('wolf', 'Wolf', 'Wolf', 'farm'), ('cat', 'Cat', 'Cat', 'farm'), ('rabbit', 'Hare', 'Rabbit', 'farm'),
    ('pillager', 'Barbarian Archer', 'Pillager', 'foe'), ('vindicator', 'Barbarian Warrior', 'Vindicator', 'foe'),
    ('skeleton', 'Legionary Skeleton', 'Skeleton', 'foe'), ('creeper', 'Fire-pot Skeleton', 'Creeper', 'foe'),
]
mobs = []
for ent, name, vanilla, kind in MOBS:
    src = os.path.join(OUT, 'mobs/rp', ent + '.png')
    if not os.path.exists(src):
        print('no mob render', ent); continue
    img = f'/assets/historia/mobs/{ent}.webp'
    thumb(src, os.path.join(SITE, 'src' + img), 340)
    m = {'id': ent, 'name': name, 'replaces': vanilla, 'kind': kind, 'img': img}
    for a in ('idle', 'walk'):
        fd = os.path.join(OUT, 'anim', ent, a)
        if os.path.isdir(fd):
            aimg = f'/assets/historia/mobs/{ent}-{a}.webp'
            ok = anim_webp(fd, os.path.join(SITE, 'src' + aimg), 200, 12, out_fps=8, max_s=6) if a == 'idle' else anim_webp(fd, os.path.join(SITE, 'src' + aimg), 220, 12)
            if ok:
                m[a] = aimg
    mobs.append(m)

# ---- citizens (NPC entities in the world; every look a character can spawn with)
CITIZENS = ['priest', 'guard', 'baker', 'potter', 'sculptor', 'plasterer', 'farmer', 'fisherman', 'gardener',
            'washer_woman', 'well_woman', 'street_cleaner', 'worker', 'runner', 'cloaked_man', 'oldbeggar', 'beggar']
NAME_FIX = {'oldbeggar': 'Old Beggar'}
def npc_name(ent):
    raw = lang.get(f'entity.rmnmshp:{ent}.name') or lang.get(f'entity.rmnmshp:{ent}_npc.name') or ''
    raw = re.sub(r'§.', '', raw).split('|')[0].strip()
    return NAME_FIX.get(ent) or raw or ent.replace('_', ' ').title()
def variant_imgs(ent, size):
    d = os.path.join(OUT, 'citizens', ent)
    imgs = []
    if not os.path.isdir(d):
        return imgs
    for f in sorted(os.listdir(d), key=lambda x: int(x.split('.')[0])):
        img = f'/assets/historia/citizens/{ent}-{f[:-4]}.webp'
        if thumb(os.path.join(d, f), os.path.join(SITE, 'src' + img), size):
            imgs.append(img)
    return imgs
citizens = []
for ent in CITIZENS:
    imgs = variant_imgs(ent, 300)
    if imgs:
        citizens.append({'id': ent, 'name': npc_name(ent), 'imgs': imgs})
townsfolk = variant_imgs('towngoer', 220)

# ---- screenshots
shots = []
mk = os.path.join(PACK, 'Marketing Art')
for f in sorted(os.listdir(mk)):
    if not f.endswith('.jpg'):
        continue
    stem = f.replace('historiarome_', '').replace('.jpg', '').lower()
    im = Image.open(os.path.join(mk, f)).convert('RGB')
    for w in (1600, 800):
        dest = os.path.join(ASSETS, 'shots', f'{stem}-{w}.webp')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        c = im.copy(); c.thumbnail((w, w))
        c.save(dest, 'WEBP', quality=82, method=6)
    shots.append(stem)

# ---- colour textures across both resource packs (PBR helper maps and UI excluded)
SKIP_TEX = re.compile(r'(_mer|_normal|_heightmap)\.|[\\/](mers|normals?|heightmaps?|ui|gui|font|particles?|environment|colormap|misc|map)[\\/]', re.I)
n_textures = 0
for root in (os.path.join(CONTENT, 'resource_packs/RP_hrmn/textures'), os.path.join(RPW, 'textures')):
    for dp, dn, fn in os.walk(root):
        n_textures += sum(1 for f in fn if f.lower().endswith(('.png', '.tga')) and not SKIP_TEX.search(os.path.join(dp, f)))

json.dump({'textures': n_textures, 'groups': groups, 'doubleSlabs': double, 'mobs': mobs, 'citizens': citizens, 'townsfolk': townsfolk, 'shots': shots}, open(DATA, 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print(n_textures, 'textures |', len(groups), 'groups', sum(len(g['items']) for g in groups), 'items |', len(double), 'double slabs |', len(mobs), 'mobs |', len(citizens), 'citizens |', len(townsfolk), 'townsfolk |', len(shots), 'shots')
