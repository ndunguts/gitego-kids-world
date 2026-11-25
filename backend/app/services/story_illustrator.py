import hashlib
import html
import os
import re
from app.config import settings


SCENE_THEMES = {
    "night": {
        "sky_top": "#0f172a",
        "sky_mid": "#1e1b4b",
        "sky_bottom": "#312e81",
        "hill_back": "#1e293b",
        "hill_front": "#064e3b",
        "celestial": "moon",
    },
    "sunset": {
        "sky_top": "#ea580c",
        "sky_mid": "#fb923c",
        "sky_bottom": "#fde047",
        "hill_back": "#9a3412",
        "hill_front": "#15803d",
        "celestial": "sunset_sun",
    },
    "rain": {
        "sky_top": "#334155",
        "sky_mid": "#64748b",
        "sky_bottom": "#cbd5e1",
        "hill_back": "#0f766e",
        "hill_front": "#15803d",
        "celestial": "rain",
    },
    "water": {
        "sky_top": "#0284c7",
        "sky_mid": "#38bdf8",
        "sky_bottom": "#e0f2fe",
        "hill_back": "#10b981",
        "hill_front": "#059669",
        "celestial": "sun",
    },
    "forest": {
        "sky_top": "#0284c7",
        "sky_mid": "#7dd3fc",
        "sky_bottom": "#fef08a",
        "hill_back": "#15803d",
        "hill_front": "#166534",
        "celestial": "sun",
    },
    "mountain": {
        "sky_top": "#2563eb",
        "sky_mid": "#60a5fa",
        "sky_bottom": "#e0f2fe",
        "hill_back": "#475569",
        "hill_front": "#16a34a",
        "celestial": "sun",
    },
    "village": {
        "sky_top": "#0ea5e9",
        "sky_mid": "#7dd3fc",
        "sky_bottom": "#fef3c7",
        "hill_back": "#22c55e",
        "hill_front": "#16a34a",
        "celestial": "sun",
    },
    "sunny": {
        "sky_top": "#0ea5e9",
        "sky_mid": "#7dd3fc",
        "sky_bottom": "#fef9c3",
        "hill_back": "#4ade80",
        "hill_front": "#16a34a",
        "celestial": "sun",
    },
}

# Comprehensive Multilingual Entity Dictionary (Kinyarwanda, French, Swahili, English)
ENTITIES = [
    # Animals
    ("rabbit", ["bakame", "urukwavu", "inkwavu", "lapin", "sungura", "rabbit", "hare"], "🐇", "Bakame"),
    ("bird", ["inyoni", "akanyoni", "keza", "oiseau", "oiseaux", "ndege", "bird", "birds"], "🐦", "Inyoni"),
    ("turtle", ["akanyamasyo", "ikinyamasyo", "tortue", "kobe", "turtle", "tortoise"], "🐢", "Akanyamasyo"),
    ("lion", ["intare", "umwami w'ishyamba", "lion", "simba"], "🦁", "Intare"),
    ("elephant", ["inzovu", "éléphant", "elephant", "tembo", "ndovu"], "🐘", "Inzovu"),
    ("gorilla", ["ingagi", "gorille", "gorilla", "sokwe"], "🦍", "Ingagi"),
    ("monkey", ["inkende", "singe", "monkey", "nyani", "kima"], "🐒", "Inkende"),
    ("giraffe", ["twiga", "girafe", "giraffe"], "🦒", "Twiga"),
    ("zebra", ["imparage", "zèbre", "zebra", "punda milia"], "🦓", "Imparage"),
    ("cow", ["inka", "inyana", "vache", "ng'ombe", "cow", "calf"], "🐄", "Inka"),
    ("dog", ["imbwa", "akabwa", "chien", "chiot", "mbwa", "dog", "puppy"], "🐶", "Imbwa"),
    ("cat", ["ipusi", "akapusi", "chat", "chaton", "paka", "cat", "kitten"], "🐱", "Ipusi"),
    ("frog", ["igikeri", "ibikeri", "grenouille", "grenouilles", "chura", "vyura", "frog", "frogs"], "🐸", "Igikeri"),
    ("butterfly", ["ikinyugunyugu", "ibinyugunyugu", "papillon", "papillons", "kipepeo", "vipepeo", "butterfly", "butterflies"], "🦋", "Ikinyugunyugu"),
    ("fish", ["ifi", "amafi", "poisson", "poissons", "samaki", "fish"], "🐟", "Ifi"),
    ("snake", ["inzoka", "serpent", "nyoka", "snake"], "🐍", "Inzoka"),
    ("chicken", ["inkoko", "isake", "umushwi", "poule", "coq", "kuku", "chicken", "hen"], "🐓", "Inkoko"),
    ("duck", ["igishuhe", "canard", "bata", "duck"], "🦆", "Igishuhe"),
    ("bee", ["uruyuki", "inzuki", "abeille", "nyuki", "bee", "bees"], "🐝", "Uruyuki"),
    ("sheep", ["intama", "mouton", "kondoo", "sheep", "lamb"], "🐑", "Intama"),
    ("goat", ["ihene", "chèvre", "mbuzi", "goat"], "🐐", "Ihene"),
    # People
    ("mother", ["nyina", "mama", "umubyeyi", "maman", "mère", "mother", "mom"], "👩🏾", "Mama"),
    ("father", ["papa", "data", "umugabo", "père", "baba", "father", "dad"], "👨🏾", "Papa"),
    ("teacher", ["mwarimu", "umwarimu", "enseignant", "professeur", "mwalimu", "teacher"], "🧑🏾‍🏫", "Mwarimu"),
    ("girl", ["umukobwa", "agakobwa", "fille", "msichana", "girl"], "👧🏾", "Umukobwa"),
    ("boy", ["umuhungu", "agahungu", "garçon", "mvulana", "boy"], "👦🏾", "Umuhungu"),
    ("child", ["umwana", "abana", "bana", "enfant", "enfants", "mtoto", "watoto", "child", "children", "kids"], "🧒🏾", "Umwana"),
    # Food & Objects
    ("bread", ["umugati", "imigati", "pain", "mkate", "mikate", "bread", "loaf"], "🥖", "Umugati"),
    ("banana", ["umuneke", "imineke", "igitoki", "banane", "ndizi", "banana", "bananas"], "🍌", "Umuneke"),
    ("apple", ["ipome", "imbuto", "urubuto", "pomme", "fruits", "matunda", "tufaha", "apple", "fruit"], "🍎", "Imbuto"),
    ("milk", ["amata", "lait", "maziwa", "milk"], "🥛", "Amata"),
    ("book", ["igitabo", "ibitabo", "gusoma", "livre", "livres", "kitabu", "vitabu", "book", "books"], "📚", "Igitabo"),
    ("ball", ["umupira", "imipira", "ballon", "balle", "mpira", "ball", "football"], "⚽", "Umupira"),
    ("drum", ["ingoma", "indirimbo", "umuziki", "tambour", "chanson", "ngoma", "wimbo", "drum", "music"], "🥁", "Ingoma"),
    ("flower", ["ururabo", "indabyo", "fleur", "fleurs", "maua", "flower", "flowers"], "🌷", "Indabyo"),
    ("star", ["inyenyeri", "étoile", "étoiles", "nyota", "star", "stars"], "⭐", "Inyenyeri"),
    ("car", ["imodoka", "voiture", "gari", "car", "bus"], "🚗", "Imodoka"),
    ("bicycle", ["igare", "vélo", "baiskeli", "bicycle", "bike"], "🚲", "Igare"),
    ("rocket", ["icyogajuru", "fusée", "roketi", "rocket", "spaceship"], "🚀", "Icyogajuru"),
    ("crown", ["ikamba", "umwami", "umwamikazi", "couronne", "roi", "reine", "mfalme", "crown", "king", "queen"], "👑", "Ikamba"),
]

# Number words across Kinyarwanda, French, Swahili, English (matched as whole words)
NUMBER_WORDS = {
    1: ["1", "rimwe", "umwe", "kimwe", "un", "une", "moja", "one"],
    2: ["2", "kabiri", "babiri", "bibiri", "ebyiri", "abiri", "deux", "mbili", "wawili", "two"],
    3: ["3", "gatatu", "batatu", "bitatu", "eshatu", "atatu", "trois", "tatu", "watatu", "three"],
    4: ["4", "kane", "bane", "bine", "enye", "quatre", "nne", "wanne", "four"],
    5: ["5", "gatanu", "batanu", "bitanu", "eshanu", "atanu", "cinq", "tano", "watano", "five"],
}


def _has_word(text_lower: str, words: list[str]) -> bool:
    for w in words:
        if re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", text_lower):
            return True
    return False


def _extract_dialogue(text: str) -> str | None:
    """Extract quoted dialogue from story text (e.g. 'Gusangira birashimisha!' or « Partager rend heureux ! »)."""
    patterns = [
        r"«\s*([^»]+?)\s*»",
        r'"([^"]{3,65})"',
        r"(?:ati|bati|ziti|dit|dirent|akasema|wakasema|said|whispering|cheered)\s*[:,-]?\s*['‘]([^'’]{3,65})['’]",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _detect_entity_counts(page_lower: str) -> dict[str, int]:
    """Detect explicit whole-word quantities tied to entities on the current page (e.g., 'ibikeri bitatu (3)')."""
    counts: dict[str, int] = {}
    for key, words, _emoji, _label in ENTITIES:
        for w in words:
            m = re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", page_lower)
            if m:
                idx = m.start()
                window = page_lower[max(0, idx - 24) : min(len(page_lower), idx + len(w) + 28)]
                detected = 1
                for num, num_tokens in NUMBER_WORDS.items():
                    if _has_word(window, num_tokens):
                        detected = max(detected, num)
                counts[key] = max(counts.get(key, 1), detected)
    return counts


def analyze_story_scene(page_text: str, title: str = "", story_context: str = "") -> dict:
    page_lower = f" {page_text.lower()} "
    full_lower = f" {title.lower()} {story_context.lower()} {page_lower} "

    # 1. Detect time of day & setting primarily from the current page text (falling back to title)
    theme_key = "sunny"
    if any(w in page_lower for w in ["nijoro", "ijoro", "ukwezi", "nuit", "lune", "usiku", "night", "moon", "goodnight"]):
        theme_key = "night"
    elif any(w in page_lower for w in ["imvura", "pluie", "mvua", "rain", "raining", "storm"]):
        theme_key = "rain"
    elif any(w in page_lower for w in ["umugoroba", "izuba rirenga", "soir", "jioni", "sunset", "dusk"]):
        theme_key = "sunset"
    elif any(w in page_lower for w in ["uruzi", "ikiyaga", "amazi", "rivière", "lac", "maji", "mto", "ziwa", "river", "lake", "pond", "ocean"]):
        theme_key = "water"
    elif any(w in f"{title.lower()} {page_lower}" for w in ["imisozi", "ibirunga", "birunga", "umusozi", "montagne", "volcan", "milima", "mountain", "volcano"]):
        theme_key = "mountain"
    elif any(w in page_lower for w in ["inzu", "urugo", "umudugudu", "ishuri", "maison", "école", "village", "nyumba", "shule", "kijiji", "house", "school", "village", "home"]):
        theme_key = "village"
    elif any(w in f"{title.lower()} {page_lower}" for w in ["ishyamba", "ibiti", "forêt", "arbres", "msitu", "miti", "forest", "woods", "trees", "jungle"]):
        theme_key = "forest"

    # 2. Detect actions & emotions on the current page
    is_flying = any(
        w in page_lower
        for w in [
            "aguruka mu kirere",
            "yazamuye amababa",
            "hejuru y'ibiti",
            "soared",
            "flapped her wings",
            "flying high",
            "s'envola",
            "akaruka angani",
        ]
    )
    is_falling = any(
        w in page_lower
        for w in ["yaguye hasi", "tumbled", "fell", "tomba", "akaanguka", "bwa mbere yaguye"]
    )
    is_sharing = any(
        w in page_lower
        for w in [
            "yagabanye",
            "gusangira",
            "basangiye",
            "partagé",
            "partager",
            "aligawana",
            "kushirikiana",
            "shared",
            "sharing",
        ]
    )
    is_hungry_or_sad = any(
        w in page_lower for w in ["bashonje", "inzara", "faim", "njaa", "hungry", "agahinda", "kurira"]
    )
    is_happy = is_sharing or any(
        w in page_lower
        for w in [
            "yarishimye",
            "baraseka",
            "birashimisha",
            "yatsinze",
            "heureux",
            "souri",
            "alifurahi",
            "walicheka",
            "furaha",
            "happy",
            "smiled",
            "she did it",
        ]
    )
    has_pronoun_group = any(
        w in page_lower
        for w in ["na bo", "bose", "inshuti ze", "avec eux", "tout le monde", "ses amis", "nao", "wote", "marafiki", "with them", "everyone", "his friends"]
    )

    # 3. Detect entities mentioned directly on THIS page (using whole-word boundaries)
    entity_counts = _detect_entity_counts(page_lower)
    page_entities = []
    seen_keys = set()
    for key, words, emoji, label in ENTITIES:
        if _has_word(page_lower, words):
            page_entities.append((key, emoji, label, entity_counts.get(key, 1)))
            seen_keys.add(key)

    # 4. If the page refers to companions ("na bo", "bose", "with them", "everyone") or is a sharing scene,
    # bring in the companion characters from the story context!
    if (has_pronoun_group or is_sharing or not page_entities) and story_context:
        for key, words, emoji, label in ENTITIES:
            if key in seen_keys:
                continue
            if key in {"rabbit", "bird", "turtle", "lion", "elephant", "gorilla", "monkey", "giraffe", "cow", "dog", "cat", "frog", "mother", "father", "girl", "boy", "child", "bread"}:
                if _has_word(full_lower, words):
                    page_entities.append((key, emoji, label, 1))
                    seen_keys.add(key)

    # Also check title for the main protagonist if still missing
    for key, words, emoji, label in ENTITIES:
        if key not in seen_keys and _has_word(f" {title.lower()} ", words):
            page_entities.insert(0, (key, emoji, label, 1))
            seen_keys.add(key)

    if not page_entities:
        page_entities = [("child", "🧒🏾", "Umwana", 1), ("butterfly", "🦋", "Ikinyugunyugu", 1)]

    has_trees = theme_key == "forest" or any(
        w in f"{title.lower()} {page_lower}"
        for w in ["ishyamba", "ibiti", "igiti", "forêt", "arbre", "arbres", "msitu", "miti", "forest", "tree", "trees", "busitani", "garden"]
    )
    has_nest = any(w in full_lower for w in ["inyoni", "keza", "oiseau", "ndege", "bird", "icyari", "nid", "nest"]) and has_trees
    has_mountains = theme_key == "mountain" or any(
        w in f"{title.lower()} {page_lower}" for w in ["imisozi", "ibirunga", "birunga", "montagne", "milima", "mountain"]
    )
    has_water = theme_key == "water"
    has_village = theme_key == "village"

    dialogue = _extract_dialogue(page_text)

    return {
        "theme_key": theme_key,
        "theme": SCENE_THEMES[theme_key],
        "entities": page_entities,
        "is_flying": is_flying,
        "is_falling": is_falling,
        "is_sharing": is_sharing,
        "is_hungry_or_sad": is_hungry_or_sad,
        "is_happy": is_happy,
        "has_trees": has_trees,
        "has_nest": has_nest,
        "has_mountains": has_mountains,
        "has_water": has_water,
        "has_village": has_village,
        "dialogue": dialogue,
    }


def _render_vector_tree(x: int, y: int, scale: float = 1.0, with_nest: bool = False) -> str:
    nest_svg = ""
    if with_nest:
        nest_svg = """
        <g transform="translate(52, 62)">
          <ellipse cx="0" cy="6" rx="22" ry="9" fill="#92400e" stroke="#78350f" stroke-width="2" />
          <ellipse cx="0" cy="3" rx="17" ry="5" fill="#d97706" />
          <text x="0" y="-2" font-size="22" text-anchor="middle">🪺</text>
        </g>
        """
    return f"""
    <g transform="translate({x}, {y}) scale({scale})">
      <ellipse cx="45" cy="175" rx="42" ry="10" fill="rgba(15,23,42,0.18)" />
      <path d="M 34 85 L 30 175 L 60 175 L 54 85 Z" fill="#78350f" />
      <path d="M 44 105 L 68 78" stroke="#78350f" stroke-width="8" stroke-linecap="round" />
      <circle cx="45" cy="55" r="52" fill="#15803d" />
      <circle cx="16" cy="74" r="38" fill="#16a34a" />
      <circle cx="76" cy="72" r="38" fill="#22c55e" />
      <circle cx="45" cy="30" r="36" fill="#4ade80" opacity="0.8" />
      <circle cx="28" cy="48" r="8" fill="#ef4444" opacity="0.9" />
      <circle cx="64" cy="54" r="7" fill="#ef4444" opacity="0.9" />
      {nest_svg}
    </g>
    """


def _render_village_house(x: int, y: int) -> str:
    return f"""
    <g transform="translate({x}, {y})">
      <ellipse cx="75" cy="135" rx="78" ry="12" fill="rgba(15,23,42,0.18)" />
      <rect x="20" y="55" width="110" height="76" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="3" />
      <polygon points="8,58 75,8 142,58" fill="#ea580c" stroke="#9a3412" stroke-width="3" />
      <rect x="60" y="83" width="30" height="48" rx="6" fill="#78350f" />
      <rect x="30" y="72" width="20" height="20" rx="4" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
      <rect x="100" y="72" width="20" height="20" rx="4" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
    </g>
    """


def _render_speech_bubble(x: int, y: int, text: str) -> str:
    clean = html.escape(text[:46] + ("..." if len(text) > 46 else ""))
    box_w = max(180, min(390, len(clean) * 8 + 34))
    half_w = box_w // 2
    return f"""
    <g transform="translate({x}, {y})">
      <rect x="-{half_w}" y="-28" width="{box_w}" height="40" rx="20" fill="#ffffff" stroke="#f59e0b" stroke-width="3" />
      <polygon points="-10,12 6,12 -6,26" fill="#ffffff" stroke="#f59e0b" stroke-width="2" />
      <text x="0" y="-3" fill="#0f172a" font-family="Nunito, system-ui, sans-serif" font-size="14.5" font-weight="900" text-anchor="middle">
        💬 "{clean}"
      </text>
    </g>
    """


def render_story_scene_svg(text: str, title: str = "", page_number: int = 1, story_context: str = "") -> str:
    """Compose a context-accurate, richly illustrated 800x420 SVG scene tailored directly to the story page."""
    sc = analyze_story_scene(page_text=text, title=title, story_context=story_context)
    th = sc["theme"]
    uid = hashlib.md5(f"{title}:{page_number}:{text}".encode("utf-8")).hexdigest()[:8]

    # 1. Sky & Celestial Body (Sun, Moon + exact star count, or Rainclouds + Rainbow)
    star_entity = next((e for e in sc["entities"] if e[0] == "star"), None)
    star_count = star_entity[3] if star_entity else (5 if th["celestial"] == "moon" else 0)

    if th["celestial"] == "moon":
        star_positions = [(120, 62), (240, 48), (370, 72), (500, 50), (610, 78)]
        stars_svg = "".join(
            f'<g transform="translate({sx},{sy})"><circle cx="0" cy="0" r="18" fill="#fef08a" opacity="0.22"/><text x="0" y="7" font-size="28" text-anchor="middle">⭐</text></g>'
            for sx, sy in star_positions[: max(1, min(5, star_count))]
        )
        celestial_svg = f"""
        <circle cx="715" cy="76" r="44" fill="#fef08a" opacity="0.95" />
        <circle cx="734" cy="64" r="36" fill="{th['sky_top']}" />
        {stars_svg}
        """
    elif th["celestial"] == "rain":
        celestial_svg = """
        <g stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" opacity="0.75">
          <line x1="140" y1="95" x2="125" y2="145" /><line x1="220" y1="100" x2="205" y2="150" />
          <line x1="340" y1="90" x2="325" y2="140" /><line x1="480" y1="95" x2="465" y2="145" />
          <line x1="610" y1="90" x2="595" y2="140" />
        </g>
        """
    else:
        sun_color = "#fde047" if th["celestial"] == "sun" else "#fb923c"
        rainbow_svg = ""
        if sc["is_flying"] or sc["is_happy"]:
            rainbow_svg = """
            <path d="M 120 270 A 260 210 0 0 1 680 270" fill="none" stroke="#f43f5e" stroke-width="10" opacity="0.32" />
            <path d="M 132 270 A 248 198 0 0 1 668 270" fill="none" stroke="#facc15" stroke-width="10" opacity="0.35" />
            <path d="M 144 270 A 236 186 0 0 1 656 270" fill="none" stroke="#4ade80" stroke-width="10" opacity="0.35" />
            <path d="M 156 270 A 224 174 0 0 1 644 270" fill="none" stroke="#38bdf8" stroke-width="10" opacity="0.35" />
            """
        celestial_svg = f"""
        {rainbow_svg}
        <circle cx="705" cy="76" r="64" fill="{sun_color}" opacity="0.24" />
        <circle cx="705" cy="76" r="48" fill="{sun_color}" opacity="0.4" />
        <circle cx="705" cy="76" r="36" fill="{sun_color}" />
        """

    # 2. Clouds
    cloud_opacity = "0.22" if sc["theme_key"] == "night" else "0.9"
    clouds_svg = f"""
    <g fill="#ffffff" opacity="{cloud_opacity}">
      <ellipse cx="145" cy="74" rx="54" ry="22" />
      <circle cx="120" cy="62" r="25" /><circle cx="164" cy="60" r="21" />
      <ellipse cx="475" cy="58" rx="48" ry="18" />
      <circle cx="455" cy="48" r="20" /><circle cx="494" cy="48" r="17" />
    </g>
    """

    # 3. Mountains (Virunga peaks)
    mountains_svg = ""
    if sc["has_mountains"]:
        mountains_svg = """
        <polygon points="70,285 235,105 400,285" fill="#64748b" />
        <polygon points="235,105 198,160 272,160" fill="#f8fafc" opacity="0.88" />
        <polygon points="310,290 495,88 680,290" fill="#475569" />
        <polygon points="495,88 452,148 538,148" fill="#e2e8f0" opacity="0.9" />
        """

    # 4. Water / River or Winding Golden Meadow Path
    if sc["has_water"]:
        ground_feature_svg = """
        <path d="M 0 318 Q 200 294 400 318 T 800 312 L 800 420 L 0 420 Z" fill="#0284c7" />
        <path d="M 55 348 Q 165 335 275 348 M 440 362 Q 550 348 660 362" stroke="#bae6fd" stroke-width="4" fill="none" stroke-linecap="round" />
        <ellipse cx="180" cy="355" rx="26" ry="8" fill="#22c55e" />
        <ellipse cx="590" cy="348" rx="24" ry="7" fill="#22c55e" />
        """
    else:
        ground_feature_svg = """
        <path d="M 305 420 Q 370 335 435 292 Q 495 335 555 420 Z" fill="#fcd34d" opacity="0.6" />
        """

    # 5. Trees & Village Houses
    env_props_svg = ""
    if sc["has_trees"]:
        env_props_svg += _render_vector_tree(38, 128, scale=1.02, with_nest=sc["has_nest"])
        env_props_svg += _render_vector_tree(652, 138, scale=0.94, with_nest=False)
    if sc["has_village"]:
        env_props_svg += _render_village_house(595, 168)

    # 6. Expand entities by their detected quantities (e.g. 3 frogs + 4 flowers, or 2 butterflies)
    expanded_actors = []
    expanded_decor = []
    for key, emoji, label, count in sc["entities"]:
        if key == "star" and th["celestial"] == "moon":
            continue  # Already rendered in the night sky!
        if key == "flower":
            for _ in range(min(6, count)):
                expanded_decor.append(emoji)
        elif key == "butterfly":
            for _ in range(min(5, count)):
                expanded_actors.append((key, emoji, label, "sky"))
        else:
            for i in range(min(5, count)):
                role_pos = "ground"
                if key == "bird" and sc["is_flying"] and i == 0:
                    role_pos = "soaring"
                elif key == "bird" and sc["is_falling"] and i == 0:
                    role_pos = "tumbled"
                expanded_actors.append((key, emoji, label, role_pos))

    # Draw counted flowers along the meadow foreground
    decor_svg = ""
    if expanded_decor:
        f_count = len(expanded_decor)
        for i, femoji in enumerate(expanded_decor):
            fx = 165 + i * (470 // max(1, f_count))
            fy = 342 + (i % 2) * 12
            decor_svg += f'<text x="{fx}" y="{fy}" font-size="34" text-anchor="middle">{femoji}</text>'
    else:
        decor_svg = '<text x="175" y="352" font-size="24">🌼</text><text x="615" y="356" font-size="24">🌻</text>'

    # 7. Position Main Story Actors according to Action & Scene Dynamics
    actors_svg = ""
    ground_actors = [a for a in expanded_actors if a[3] in {"ground", "tumbled"}]
    sky_actors = [a for a in expanded_actors if a[3] in {"sky", "soaring"}]

    # Sky / Flying Actors (e.g. Keza soaring high in the sky, or counted butterflies)
    for idx, (key, emoji, label, pos_mode) in enumerate(sky_actors):
        if pos_mode == "soaring":
            sx, sy = 400, 128
            actors_svg += f"""
            <g transform="translate({sx}, {sy})">
              <path d="M -95 28 Q -45 -10 -15 8 M -85 44 Q -40 16 -12 24" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85" />
              <circle cx="0" cy="0" r="52" fill="#fef08a" opacity="0.32" />
              <text x="0" y="14" font-size="82" text-anchor="middle" dominant-baseline="middle">{emoji}</text>
              <text x="58" y="-24" font-size="28">✨</text>
              <text x="-58" y="-18" font-size="26">🌟</text>
            </g>
            """
        else:
            bx = 270 + idx * 140
            by = 135 + (idx % 2) * 28
            actors_svg += f"""
            <g transform="translate({bx}, {by})">
              <text x="0" y="0" font-size="52" text-anchor="middle">{emoji}</text>
              <text x="32" y="-18" font-size="20">✨</text>
            </g>
            """

    # Ground Actors (with Sharing Picnic Table / Warm Bread / Companion Circle)
    if sc["is_sharing"] and len(ground_actors) >= 2:
        # Draw a cozy forest picnic mat in the center with warm bread and characters gathered around it!
        actors_svg += """
        <g transform="translate(400, 312)">
          <ellipse cx="0" cy="14" rx="175" ry="32" fill="#fef08a" stroke="#f59e0b" stroke-width="3" opacity="0.92" />
          <text x="0" y="-58" font-size="30" text-anchor="middle">💛 ✨ 💛</text>
        </g>
        """

    g_count = len(ground_actors)
    if g_count > 0:
        spacing = min(130, 500 // max(1, g_count))
        start_x = 400 - ((g_count - 1) * spacing) // 2
        for idx, (key, emoji, label, pos_mode) in enumerate(ground_actors):
            cx = start_x + idx * spacing
            cy = 276 if idx % 2 == 0 else 266
            if pos_mode == "tumbled":
                cy = 310
            font_sz = 78 if key not in {"bread", "apple", "banana", "milk"} else 62

            # Extra visual effects per actor state
            fx_svg = ""
            if key == "bread":
                # Rising warm steam lines above hot bread
                fx_svg = """
                <path d="M -12 -42 Q -18 -56 -8 -68 M 4 -45 Q -2 -59 8 -71 M 18 -40 Q 12 -54 22 -66" stroke="#ffffff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.85" />
                """
            elif pos_mode == "tumbled":
                fx_svg = '<text x="-38" y="18" font-size="26">🍃</text><text x="40" y="14" font-size="26">🍃</text>'
            elif sc["is_hungry_or_sad"] and key in {"bird", "turtle"}:
                fx_svg = '<text x="28" y="-36" font-size="24">💭🥖</text>'
            elif sc["is_happy"]:
                fx_svg = '<text x="0" y="-48" font-size="22" text-anchor="middle">✨</text>'

            # Actor name pill below character
            label_pill = f"""
            <rect x="-44" y="46" width="88" height="20" rx="10" fill="rgba(15,23,42,0.72)" />
            <text x="0" y="60" fill="#ffffff" font-family="Nunito, system-ui, sans-serif" font-size="11.5" font-weight="800" text-anchor="middle">{html.escape(label)}</text>
            """

            actors_svg += f"""
            <g transform="translate({cx}, {cy})">
              <ellipse cx="0" cy="38" rx="38" ry="11" fill="rgba(15,23,42,0.24)" />
              {fx_svg}
              <text x="0" y="8" font-size="{font_sz}" text-anchor="middle" dominant-baseline="middle">{emoji}</text>
              {label_pill}
            </g>
            """

    # 8. Dialogue Speech Bubble if story page has quoted speech
    dialogue_svg = ""
    if sc["dialogue"]:
        bubble_y = 78 if sc["is_flying"] else 165
        dialogue_svg = _render_speech_bubble(400, bubble_y, sc["dialogue"])

    snippet = html.escape(text.strip()[:74] + ("..." if len(text.strip()) > 74 else ""))

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="100%" height="100%">
  <defs>
    <linearGradient id="sky-{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{th['sky_top']}" />
      <stop offset="55%" stop-color="{th['sky_mid']}" />
      <stop offset="100%" stop-color="{th['sky_bottom']}" />
    </linearGradient>
    <linearGradient id="hill1-{uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{th['hill_back']}" />
      <stop offset="100%" stop-color="{th['hill_front']}" />
    </linearGradient>
  </defs>

  <!-- Sky Background -->
  <rect width="800" height="420" fill="url(#sky-{uid})" />

  {celestial_svg}
  {clouds_svg}
  {mountains_svg}

  <!-- Back Rolling Hills -->
  <path d="M 0 282 Q 190 212 410 270 T 800 252 L 800 420 L 0 420 Z" fill="url(#hill1-{uid})" opacity="0.88" />

  <!-- Front Meadow -->
  <path d="M 0 312 Q 260 264 520 308 T 800 292 L 800 420 L 0 420 Z" fill="{th['hill_front']}" />

  {ground_feature_svg}
  {env_props_svg}
  {decor_svg}

  <!-- Main Story Characters, Actions & Props -->
  {actors_svg}
  {dialogue_svg}

  <!-- Bottom AI Story Scene Caption Strip -->
  <rect x="20" y="376" width="760" height="34" rx="17" fill="rgba(15, 23, 42, 0.78)" />
  <text x="400" y="398" fill="#fef08a" font-family="Nunito, system-ui, sans-serif" font-size="14" font-weight="800" text-anchor="middle">
    🎨 Ipaji {page_number}: "{snippet}"
  </text>
</svg>"""


def generate_and_save_story_illustration(
    text: str,
    title: str = "",
    page_number: int = 1,
    story_context: str = "",
) -> str:
    """Generate a context-aware SVG illustration file from story text, save it to uploads, and return its URL."""
    svg_content = render_story_scene_svg(
        text=text,
        title=title,
        page_number=page_number,
        story_context=story_context,
    )
    digest = hashlib.sha256(
        f"v2:{title}:{page_number}:{text}:{story_context}".encode("utf-8")
    ).hexdigest()[:16]
    rel_dir = "story_illustrations"
    abs_dir = os.path.join(settings.UPLOAD_DIR, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    filename = f"story_v2_p{page_number}_{digest}.svg"
    abs_path = os.path.join(abs_dir, filename)
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    return f"/uploads/{rel_dir}/{filename}"


def needs_ai_illustration(illustration_url: str | None) -> bool:
    """Return True if illustration_url is empty, plain emoji, or an older v1 story_page_ SVG."""
    if not illustration_url:
        return True
    s = illustration_url.strip()
    if "story_page_" in s:
        return True
    if s.startswith(("/uploads/", "http://", "https://", "data:image/")):
        return False
    return True
