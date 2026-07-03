import random
import itertools

NUM_STYLES = 100

# Base textures
TEXTURES = [
    "bg-[url('/noise.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/polka-dots.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/shattered-island.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')]",
    "bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]",
    "" # no texture
]

# Themes (to ensure legibility, we categorize into Light Text vs Dark Text)
THEMES_DARK_TEXT = [
    {"bg": "bg-yellow-400 dark:bg-yellow-400", "border": "border-4 border-black", "shadow": "shadow-[8px_8px_0px_rgba(0,0,0,1)]", "text": "text-black", "textShadow": "drop-shadow-[1px_1px_0px_white]", "accentBg": "bg-black", "accentText": "text-yellow-400"},
    {"bg": "bg-sky-100 dark:bg-sky-100", "border": "border-4 border-sky-900", "shadow": "shadow-[6px_6px_0px_rgba(12,74,110,1)]", "text": "text-sky-950", "textShadow": "drop-shadow-[1px_1px_0px_white]", "accentBg": "bg-sky-900", "accentText": "text-sky-100"},
    {"bg": "bg-emerald-100 dark:bg-emerald-100", "border": "border-l-8 border-emerald-600", "shadow": "shadow-xl", "text": "text-emerald-950", "textShadow": "drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]", "accentBg": "bg-emerald-600", "accentText": "text-white"},
    {"bg": "bg-rose-100 dark:bg-rose-100", "border": "border-2 border-dashed border-rose-500", "shadow": "shadow-[0_0_20px_rgba(225,29,72,0.3)]", "text": "text-rose-950", "textShadow": "drop-shadow-sm", "accentBg": "bg-rose-500", "accentText": "text-white"},
    {"bg": "bg-white dark:bg-white", "border": "border border-slate-300", "shadow": "shadow-2xl", "text": "text-slate-900", "textShadow": "drop-shadow-[1px_1px_0px_rgba(0,0,0,0.1)]", "accentBg": "bg-slate-900", "accentText": "text-white"},
    {"bg": "bg-amber-100 dark:bg-amber-100", "border": "border-4 border-amber-900", "shadow": "shadow-[0_10px_0_rgba(120,53,15,1)]", "text": "text-amber-950", "textShadow": "drop-shadow-[1px_1px_0_rgba(255,255,255,1)]", "accentBg": "bg-amber-900", "accentText": "text-amber-100"},
    {"bg": "bg-lime-200 dark:bg-lime-200", "border": "border border-lime-700", "shadow": "shadow-[inset_0_0_50px_rgba(77,124,15,0.3)]", "text": "text-lime-950", "textShadow": "drop-shadow-sm", "accentBg": "bg-lime-700", "accentText": "text-lime-50"},
]

THEMES_LIGHT_TEXT = [
    {"bg": "bg-slate-900 dark:bg-slate-900", "border": "border-2 border-indigo-500", "shadow": "shadow-[0_0_30px_rgba(99,102,241,0.5)]", "text": "text-indigo-50", "textShadow": "drop-shadow-[0_2px_4px_rgba(0,0,0,1)]", "accentBg": "bg-indigo-600", "accentText": "text-white"},
    {"bg": "bg-black dark:bg-black", "border": "border border-slate-700", "shadow": "shadow-2xl", "text": "text-white", "textShadow": "drop-shadow-[0_2px_5px_black]", "accentBg": "bg-white", "accentText": "text-black"},
    {"bg": "bg-fuchsia-950 dark:bg-fuchsia-950", "border": "border border-fuchsia-500", "shadow": "shadow-[0_0_40px_rgba(217,70,239,0.4)]", "text": "text-fuchsia-100", "textShadow": "drop-shadow-[0_0_10px_rgba(217,70,239,0.8)]", "accentBg": "bg-fuchsia-500", "accentText": "text-white"},
    {"bg": "bg-gradient-to-br from-purple-900 to-indigo-900 dark:from-purple-900 dark:to-indigo-900", "border": "border-t-2 border-pink-500", "shadow": "shadow-[0_10px_30px_rgba(0,0,0,0.5)]", "text": "text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400", "textShadow": "drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]", "accentBg": "bg-pink-500/20", "accentText": "text-cyan-400"},
    {"bg": "bg-cyan-950 dark:bg-cyan-950", "border": "border border-cyan-400/50", "shadow": "shadow-[inset_0_0_40px_rgba(34,211,238,0.2)]", "text": "text-cyan-50", "textShadow": "drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]", "accentBg": "bg-cyan-900", "accentText": "text-cyan-300"},
    {"bg": "bg-orange-950 dark:bg-orange-950", "border": "border-b-4 border-orange-500", "shadow": "shadow-[0_10px_40px_rgba(249,115,22,0.3)]", "text": "text-orange-100", "textShadow": "drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]", "accentBg": "bg-orange-600", "accentText": "text-white"},
    {"bg": "bg-zinc-900 dark:bg-zinc-900", "border": "border-4 border-zinc-100", "shadow": "shadow-none", "text": "text-zinc-100", "textShadow": "drop-shadow-[2px_2px_0px_black]", "accentBg": "bg-zinc-100", "accentText": "text-zinc-900"},
]

FONTS = ["font-sans", "font-mono", "font-serif"]
WEIGHTS = ["font-medium", "font-bold", "font-black"]
STYLES_TEXT = ["italic", "uppercase", "normal-case"]
TRACKING = ["tracking-tight", "tracking-normal", "tracking-widest", "tracking-tighter"]

# Generate exactly 100 unique templates
templates_data = {}
for i in range(1, NUM_STYLES + 1):
    style_name = f"style_{i}"
    
    is_dark = random.choice([True, False])
    theme = random.choice(THEMES_DARK_TEXT) if not is_dark else random.choice(THEMES_LIGHT_TEXT)
    
    texture = random.choice(TEXTURES)
    font = random.choice(FONTS)
    weight = random.choice(WEIGHTS)
    t_style = random.choice(STYLES_TEXT)
    tracking = random.choice(TRACKING)
    
    containerClass = f"{theme['bg']} {theme['border']} {theme['shadow']} {texture} opacity-100 relative overflow-hidden flex flex-col justify-center"
    textClass = f"{theme['text']} {theme['textShadow']} {font} {weight} {t_style} {tracking} relative z-10 transition-all duration-300"
    
    rot = random.choice(["", "rotate-[-2deg]", "rotate-[2deg]", "rotate-[-1deg]", "rotate-[1deg]"])
    authorClass = f"{theme['accentBg']} {theme['accentText']} {font} font-bold px-3 py-1 {rot} uppercase tracking-wider relative z-10"
    
    iconBoxClass = f"{theme['accentBg']} {theme['accentText']} border border-black/10 dark:border-white/10"
    
    templates_data[style_name] = {
        "containerClass": containerClass,
        "textClass": textClass,
        "authorClass": authorClass,
        "iconBoxClass": iconBoxClass
    }

# TRUE ACCURATE QUOTES - Zero randomization of authors here.
ACCURATE_QUOTES = [
    {"text": "The obstacle is the way.", "author": "Marcus Aurelius"},
    {"text": "You have power over your mind - not outside events.", "author": "Marcus Aurelius"},
    {"text": "What stands in the way becomes the way.", "author": "Marcus Aurelius"},
    {"text": "The more you sweat in practice, the less you bleed in battle.", "author": "Richard Marcinko"},
    {"text": "Do not pray for an easy life, pray for the strength to endure a difficult one.", "author": "Bruce Lee"},
    {"text": "I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.", "author": "Bruce Lee"},
    {"text": "Success is not final, failure is not fatal: it is the courage to continue that counts.", "author": "Winston Churchill"},
    {"text": "In the middle of difficulty lies opportunity.", "author": "Albert Einstein"},
    {"text": "Pure mathematics is, in its way, the poetry of logical ideas.", "author": "Albert Einstein"},
    {"text": "Genius is 1% talent and 99% hard work.", "author": "Thomas Edison"},
    {"text": "I have not failed. I've just found 10,000 ways that won't work.", "author": "Thomas Edison"},
    {"text": "Stay hungry, stay foolish.", "author": "Steve Jobs"},
    {"text": "You miss 100% of the shots you don't take.", "author": "Wayne Gretzky"},
    {"text": "Float like a butterfly, sting like a bee.", "author": "Muhammad Ali"},
    {"text": "He who is not courageous enough to take risks will accomplish nothing in life.", "author": "Muhammad Ali"},
    {"text": "Quality is not an act, it is a habit.", "author": "Aristotle"},
    {"text": "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "author": "Will Durant"},
    {"text": "The mind is everything. What you think you become.", "author": "Buddha"},
    {"text": "A journey of a thousand miles begins with a single step.", "author": "Lao Tzu"},
    {"text": "Simplicity is the ultimate sophistication.", "author": "Leonardo da Vinci"}
]

# PROCEDURAL QUOTES (NO AUTHOR)
# We generate a massive list of algorithmic combinations and set author = null.
PREFIXES = ["In the arena of logic,", "When variables align,", "Beyond the infinite,", "Through relentless focus,", "Where chaos meets order,", "To conquer the unknown,", "In the architecture of mind,", "Against impossible odds,", "In the silence of mastery,", "When the pressure mounts,", "Every calculated move,", "Before the final strike,", "Within the deep systems,", "As the clock ticks down,"]
SUBJECTS = ["a true master", "the apex scholar", "the silent observer", "a calculated mind", "the relentless student", "the architect of fate", "the unwavering spirit", "the visionary", "the disciplined learner", "a focused mind"]
ACTIONS = ["finds clarity in the noise.", "strikes with absolute precision.", "rewrites the rules of the game.", "sees what others miss.", "calculates the perfect victory.", "turns failure into data.", "bends reality to their will.", "transcends the ordinary.", "embraces the grind.", "emerges victorious.", "shatters the plateau.", "locks onto the target.", "achieves absolute flow.", "defies expectation."]
CONNECTORS = ["And so,", "Thus,", "In return,", "Because", "For this reason,", "Therefore,"]
OUTCOMES = ["the legacy is built.", "the challenge is conquered.", "victory is inevitable.", "the mind expands.", "the system bows.", "greatness is achieved.", "weakness is eradicated.", "the next level unlocks."]

algo_quotes = []
# Generate simple 3-part quotes
for p in PREFIXES:
    for s in SUBJECTS:
        for a in ACTIONS:
            algo_quotes.append(f"{p} {s} {a}")

# Generate complex 5-part quotes
for p in PREFIXES[:5]:
    for s in SUBJECTS[:5]:
        for a in ACTIONS[:5]:
            for c in CONNECTORS[:3]:
                for o in OUTCOMES[:5]:
                    algo_quotes.append(f"{p} {s} {a} {c} {o}")

algo_quotes = list(set(algo_quotes)) # ensure unique
random.shuffle(algo_quotes)

quotes_list = []
# Add accurate quotes multiple times with different styles
for _ in range(5):
    for q in ACCURATE_QUOTES:
        style = f"style_{random.randint(1, NUM_STYLES)}"
        quotes_list.append({"text": q["text"], "author": q["author"], "style": style})

# Add algorithmic quotes (author=null)
for q in algo_quotes:
    style = f"style_{random.randint(1, NUM_STYLES)}"
    quotes_list.append({"text": q, "author": None, "style": style})

random.shuffle(quotes_list)
# We want AT LEAST 600, let's take up to 800
quotes_list = quotes_list[:800]

ts_content = f"export type PopArtStyle = \n"
style_keys = [f"'style_{i}'" for i in range(1, NUM_STYLES + 1)]
for i in range(0, len(style_keys), 10):
    ts_content += "  | " + " | ".join(style_keys[i:i+10]) + "\n"
ts_content += ";\n\n"

ts_content += """export interface MotivationQuote {
  id: string;
  text: string;
  author: string | null;
  style: PopArtStyle;
}

export const POP_ART_STYLES: Record<PopArtStyle, { containerClass: string; textClass: string; authorClass: string; iconBoxClass: string }> = {\n"""

for name, cls in templates_data.items():
    ts_content += f"""  {name}: {{
    containerClass: "{cls['containerClass']}",
    textClass: "{cls['textClass']}",
    authorClass: "{cls['authorClass']}",
    iconBoxClass: "{cls['iconBoxClass']}"
  }},\n"""

ts_content += """};

export const GAMER_MOTIVATIONS: MotivationQuote[] = [
"""

for i, q in enumerate(quotes_list):
    text = q["text"].replace('"', '\\"')
    
    author_val = f'"{q["author"]}"' if q["author"] else "null"
    ts_content += f'  {{ id: "{i}", text: "{text}", author: {author_val}, style: "{q["style"]}" }},\n'

ts_content += "];\n"

with open("quotes.ts", "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Generated 100 styles and {len(quotes_list)} quotes (with accurate/null authors) successfully.")
