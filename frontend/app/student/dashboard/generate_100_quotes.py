import random

NUM_STYLES = 100
NUM_QUOTES = 600

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
WEIGHTS = ["font-medium", "font-bold", "font-black", "font-light"]
STYLES_TEXT = ["italic", "uppercase", "normal-case"]
TRACKING = ["tracking-tight", "tracking-normal", "tracking-widest", "tracking-tighter"]

# Generate 100 unique templates
templates_data = {}
for i in range(1, NUM_STYLES + 1):
    style_name = f"style_{i}"
    
    # 50/50 light text vs dark text theme to ensure absolute contrast
    is_dark = random.choice([True, False])
    theme = random.choice(THEMES_DARK_TEXT) if not is_dark else random.choice(THEMES_LIGHT_TEXT)
    
    texture = random.choice(TEXTURES)
    font = random.choice(FONTS)
    weight = random.choice(WEIGHTS)
    t_style = random.choice(STYLES_TEXT)
    tracking = random.choice(TRACKING)
    
    containerClass = f"{theme['bg']} {theme['border']} {theme['shadow']} {texture} opacity-100 relative overflow-hidden"
    textClass = f"{theme['text']} {theme['textShadow']} {font} {weight} {t_style} {tracking} relative z-10"
    
    # randomly rotate author badge for pop art feel
    rot = random.choice(["", "rotate-[-2deg]", "rotate-[2deg]", "rotate-[-1deg]", "rotate-[1deg]"])
    authorClass = f"{theme['accentBg']} {theme['accentText']} {font} font-bold px-3 py-1 {rot} uppercase tracking-wider relative z-10"
    
    iconBoxClass = f"{theme['accentBg']} {theme['accentText']} border border-black/10 dark:border-white/10"
    
    templates_data[style_name] = {
        "containerClass": containerClass,
        "textClass": textClass,
        "authorClass": authorClass,
        "iconBoxClass": iconBoxClass
    }

AUTHORS = {
    "stoic": ["Marcus Aurelius", "Seneca", "Epictetus", "Socrates", "Aristotle", "Zeno"],
    "math": ["Albert Einstein", "Isaac Newton", "Richard Feynman", "Carl Friedrich Gauss", "Leonhard Euler", "Ada Lovelace", "Alan Turing", "John von Neumann", "Pythagoras", "Euclid", "Pascal", "Tesla"],
    "gaming": ["Sun Tzu", "Miyamoto Musashi", "David Goggins", "Bruce Lee", "Kobe Bryant", "Michael Jordan", "John Carmack", "Hideo Kojima", "Daigo Umehara", "Faker"],
    "modern": ["Steve Jobs", "Elon Musk", "Naval Ravikant", "Sam Altman", "Paul Graham", "Peter Thiel"]
}

BASE_QUOTES = [
    "The difference between a master and a beginner is that the master has failed more times than the beginner has even tried.",
    "A flawless run isn't luck. It's a thousand invisible mistakes corrected.",
    "Precision beats power. Timing beats speed.",
    "The obstacle is the way.",
    "What stands in the way becomes the way.",
    "You have power over your mind - not outside events.",
    "The more you sweat in practice, the less you bleed in battle.",
    "Do not pray for an easy life, pray for the strength to endure a difficult one.",
    "I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.",
    "There is no elevator to success, you have to take the stairs.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "In the middle of difficulty lies opportunity.",
    "Pure mathematics is, in its way, the poetry of logical ideas.",
    "Truth is ever to be found in simplicity, and not in the multiplicity and confusion of things.",
    "Genius is 1% talent and 99% hard work.",
    "It's not that I'm so smart, it's just that I stay with problems longer.",
    "Every strike brings me closer to the next home run.",
    "I have not failed. I've just found 10,000 ways that won't work.",
    "Focus is a matter of deciding what things you're not going to do.",
    "Stay hungry, stay foolish.",
    "You miss 100% of the shots you don't take.",
    "Talent wins games, but teamwork and intelligence win championships.",
    "If you're afraid to fail, then you're probably going to fail.",
    "Float like a butterfly, sting like a bee.",
    "He who is not courageous enough to take risks will accomplish nothing in life.",
    "Quality is not an act, it is a habit.",
    "Well done is better than well said.",
    "The secret of getting ahead is getting started.",
    "Our greatest glory is not in never falling, but in rising every time we fall.",
    "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    "First, master the fundamentals.",
    "The mind is everything. What you think you become.",
    "Happiness depends upon ourselves.",
    "Patience is bitter, but its fruit is sweet.",
    "The only true wisdom is in knowing you know nothing.",
    "Learning never exhausts the mind.",
    "Nothing is impossible for him who will try.",
    "The roots of education are bitter, but the fruit is sweet.",
    "He who has overcome his fears will truly be free.",
    "We make war that we may live in peace.",
    "Difficulties strengthen the mind, as labor does the body.",
    "A journey of a thousand miles begins with a single step.",
    "Knowing others is intelligence; knowing yourself is true wisdom.",
    "Mastering others is strength; mastering yourself is true power.",
    "When you are content to be simply yourself and don't compare or compete, everybody will respect you.",
    "Anticipate the difficult by managing the easy.",
    "Silence is a source of great strength.",
    "Life is a series of natural and spontaneous changes.",
    "Do the difficult things while they are easy and do the great things while they are small.",
    "If you correct your mind, the rest of your life will fall into place.",
    "Simplicity is the ultimate sophistication.",
    "Experience never errs; it is only your judgments that err.",
    "He who loves practice without theory is like the sailor who boards ship without a rudder and compass.",
    "Intellectual passion drives out sensuality."
]

def generate_algorithmic_quotes(count):
    prefixes = ["In the arena of logic,", "When variables align,", "Beyond the infinite,", "Through relentless focus,", "Where chaos meets order,", "To conquer the unknown,", "In the architecture of mind,", "Against impossible odds,", "In the silence of mastery,", "When the pressure mounts,"]
    subjects = ["a true master", "the apex scholar", "the silent observer", "a calculated mind", "the relentless student", "the architect of fate", "the unwavering spirit", "the visionary"]
    actions = ["finds clarity in the noise.", "strikes with absolute precision.", "rewrites the rules of the game.", "sees what others miss.", "calculates the perfect victory.", "turns failure into data.", "bends reality to their will.", "transcends the ordinary.", "embraces the grind.", "emerges victorious."]
    
    generated = []
    for _ in range(count):
        q = f"{random.choice(prefixes)} {random.choice(subjects)} {random.choice(actions)}"
        generated.append(q)
    return generated

quotes_list = []
# Ensure base quotes are there multiple times with different styles
for _ in range(8):
    for t in BASE_QUOTES:
        author = random.choice(AUTHORS[random.choice(list(AUTHORS.keys()))])
        style = f"style_{random.randint(1, NUM_STYLES)}"
        quotes_list.append({"text": t, "author": author, "style": style})

algo_quotes = generate_algorithmic_quotes(200)
for q in algo_quotes:
    style = f"style_{random.randint(1, NUM_STYLES)}"
    quotes_list.append({"text": q, "author": "Apex Intelligence", "style": style})

random.shuffle(quotes_list)
quotes_list = quotes_list[:NUM_QUOTES]

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
    author = q["author"].replace('"', '\\"')
    ts_content += f'  {{ id: "{i}", text: "{text}", author: "{author}", style: "{q["style"]}" }},\n'

ts_content += "];\n"

with open("quotes.ts", "w", encoding="utf-8") as f:
    f.write(ts_content)

print("Generated 100 styles and 600 quotes in quotes.ts successfully.")
