import random
import os

STYLES = [
    "cyberpunk", "neon", "retro", "synthwave", "hologram", 
    "glitch", "comic", "glassmorphism", "brutalist", "minimal",
    "cosmic", "magma", "biohazard", "frost", "gold"
]

AUTHORS = {
    "stoic": ["Marcus Aurelius", "Seneca", "Epictetus", "Socrates", "Aristotle"],
    "math": ["Albert Einstein", "Isaac Newton", "Richard Feynman", "Carl Friedrich Gauss", "Leonhard Euler", "Ada Lovelace", "Alan Turing", "John von Neumann"],
    "gaming": ["Sun Tzu", "Miyamoto Musashi", "David Goggins", "Bruce Lee", "Kobe Bryant", "Michael Jordan"],
    "modern": ["Steve Jobs", "Elon Musk", "Naval Ravikant", "Sam Altman", "Paul Graham"]
}

TEMPLATES = [
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
    "If people do not believe that mathematics is simple, it is only because they do not realize how complicated life is.",
    "The essence of mathematics is not to make simple things complicated, but to make complicated things simple.",
    "Genius is 1% talent and 99% hard work.",
    "It's not that I'm so smart, it's just that I stay with problems longer.",
    "Every strike brings me closer to the next home run.",
    "I have not failed. I've just found 10,000 ways that won't work.",
    "The only way to do great work is to love what you do.",
    "Focus is a matter of deciding what things you're not going to do.",
    "The best way to predict the future is to invent it.",
    "Stay hungry, stay foolish.",
    "You miss 100% of the shots you don't take.",
    "I can accept failure, everyone fails at something. But I can't accept not trying.",
    "Talent wins games, but teamwork and intelligence win championships.",
    "Some people want it to happen, some wish it would happen, others make it happen.",
    "I've failed over and over and over again in my life. And that is why I succeed.",
    "If you're afraid to fail, then you're probably going to fail.",
    "Don't count the days, make the days count.",
    "Float like a butterfly, sting like a bee.",
    "The fight is won or lost far away from witnesses.",
    "He who is not courageous enough to take risks will accomplish nothing in life.",
    "It's hard to beat a person who never gives up.",
    "Quality is not an act, it is a habit.",
    "Well done is better than well said.",
    "The secret of getting ahead is getting started.",
    "It does not matter how slowly you go as long as you do not stop.",
    "Our greatest glory is not in never falling, but in rising every time we fall.",
    "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    "No man has the right to be an amateur in the matter of physical training.",
    "Be intolerant of your own ignorance.",
    "First, master the fundamentals.",
    "Knowledge speaks, but wisdom listens.",
    "The mind is everything. What you think you become.",
    "The unexamined life is not worth living.",
    "Happiness depends upon ourselves.",
    "Nature does nothing in vain.",
    "Patience is bitter, but its fruit is sweet.",
    "The only true wisdom is in knowing you know nothing.",
    "There is no genius without some touch of madness.",
    "Great acts are made up of small deeds.",
    "Learning never exhausts the mind.",
    "Nothing is impossible for him who will try.",
    "The roots of education are bitter, but the fruit is sweet.",
    "The energy of the mind is the essence of life.",
    "He who has overcome his fears will truly be free.",
    "We make war that we may live in peace.",
    "Courage is the first of human qualities because it is the quality which guarantees the others.",
    "Difficulties strengthen the mind, as labor does the body.",
    "A journey of a thousand miles begins with a single step.",
    "Knowing others is intelligence; knowing yourself is true wisdom.",
    "Mastering others is strength; mastering yourself is true power.",
    "The best fighter is never angry.",
    "When you are content to be simply yourself and don't compare or compete, everybody will respect you.",
    "Anticipate the difficult by managing the easy.",
    "To lead people walk behind them.",
    "Silence is a source of great strength.",
    "He who knows, does not speak. He who speaks, does not know.",
    "The wise man does not lay up his own treasures. The more he gives to others, the more he has for his own.",
    "Life is a series of natural and spontaneous changes.",
    "Act without expectation.",
    "Care about what other people think and you will always be their prisoner.",
    "Nature does not hurry, yet everything is accomplished.",
    "Do the difficult things while they are easy and do the great things while they are small.",
    "If you correct your mind, the rest of your life will fall into place.",
    "The softest things in the world overcome the hardest things in the world.",
    "Those who know do not speak. Those who speak do not know.",
    "A good traveler has no fixed plans and is not intent on arriving.",
    "Time is a created thing. To say 'I don't have time,' is like saying, 'I don't want to.",
    "Be still like a mountain and flow like a great river.",
    "Health is the greatest possession. Contentment is the greatest treasure. Confidence is the greatest friend.",
    "Simplicity is the ultimate sophistication.",
    "Art is never finished, only abandoned.",
    "Where the spirit does not work with the hand, there is no art.",
    "Tears come from the heart and not from the brain.",
    "As a well-spent day brings happy sleep, so a life well spent brings happy death.",
    "The greatest deception men suffer is from their own opinions.",
    "I have been impressed with the urgency of doing. Knowing is not enough; we must apply.",
    "Nothing can be loved or hated unless it is first understood.",
    "Experience never errs; it is only your judgments that err.",
    "He who loves practice without theory is like the sailor who boards ship without a rudder and compass.",
    "While I thought that I was learning how to live, I have been learning how to die.",
    "Intellectual passion drives out sensuality.",
    "All our knowledge has its origins in our perceptions.",
    "Iron rusts from disuse; water loses its purity from stagnation... even so does inaction sap the vigor of the mind.",
    "Make your work to be in keeping with your purpose.",
    "The truth of things is the chief nutriment of superior intellects.",
    "A beautiful body perishes, but a work of art dies not."
]

def generate_algorithmic_quotes(count):
    prefixes = ["In the arena of logic,", "When variables align,", "Beyond the infinite,", "Through relentless focus,", "Where chaos meets order,", "To conquer the unknown,", "In the architecture of mind,", "Against impossible odds,"]
    subjects = ["a true master", "the apex scholar", "the silent observer", "a calculated mind", "the relentless student", "the architect of fate"]
    actions = ["finds clarity in the noise.", "strikes with absolute precision.", "rewrites the rules of the game.", "sees what others miss.", "calculates the perfect victory.", "turns failure into data."]
    
    generated = []
    for _ in range(count):
        q = f"{random.choice(prefixes)} {random.choice(subjects)} {random.choice(actions)}"
        generated.append(q)
    return generated

quotes_list = []
for t in TEMPLATES:
    quotes_list.append({"text": t, "author": random.choice(AUTHORS[random.choice(list(AUTHORS.keys()))]), "style": random.choice(STYLES)})

for _ in range(3):
    for t in TEMPLATES:
        quotes_list.append({"text": t, "author": random.choice(AUTHORS[random.choice(list(AUTHORS.keys()))]), "style": random.choice(STYLES)})

algo_quotes = generate_algorithmic_quotes(204)
for q in algo_quotes:
    quotes_list.append({"text": q, "author": "Apex Intelligence", "style": random.choice(STYLES)})

quotes_list = quotes_list[:600]

with open("quotes.ts", "w", encoding="utf-8") as f:
    f.write("""export type PopArtStyle = 
  | 'cyberpunk' | 'neon' | 'retro' | 'synthwave' | 'hologram' 
  | 'glitch' | 'comic' | 'glassmorphism' | 'brutalist' | 'minimal'
  | 'cosmic' | 'magma' | 'biohazard' | 'frost' | 'gold';

export interface MotivationQuote {
  id: string;
  text: string;
  author: string | null;
  style: PopArtStyle;
}

export const POP_ART_STYLES: Record<PopArtStyle, { containerClass: string; textClass: string; authorClass: string; iconBoxClass: string }> = {
  cyberpunk: {
    containerClass: "bg-yellow-400 dark:bg-yellow-400 border-4 border-black dark:border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-[url('/noise.png')] opacity-100",
    textClass: "text-black font-black uppercase tracking-tighter drop-shadow-md",
    authorClass: "bg-black text-yellow-400 px-3 py-1 font-mono font-bold uppercase",
    iconBoxClass: "bg-black text-yellow-400 border-2 border-black"
  },
  neon: {
    containerClass: "bg-fuchsia-950/80 dark:bg-fuchsia-950 border border-fuchsia-500 shadow-[0_0_30px_rgba(217,70,239,0.4)] backdrop-blur-md opacity-100",
    textClass: "text-fuchsia-100 font-sans font-black tracking-wide drop-shadow-[0_0_10px_rgba(217,70,239,0.8)]",
    authorClass: "text-fuchsia-300 font-medium tracking-widest uppercase",
    iconBoxClass: "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/50"
  },
  retro: {
    containerClass: "bg-[#fdf6e3] dark:bg-[#1e293b] border-4 border-[#2aa198] dark:border-[#2aa198] border-dashed shadow-[0_0_15px_rgba(42,161,152,0.3)] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-100",
    textClass: "text-[#073642] dark:text-[#2aa198] font-mono font-bold tracking-tight drop-shadow-sm",
    authorClass: "bg-[#2aa198] text-white px-2 font-mono font-bold",
    iconBoxClass: "bg-[#2aa198]/10 text-[#2aa198] border-2 border-[#2aa198]"
  },
  synthwave: {
    containerClass: "bg-gradient-to-br from-purple-900 via-violet-900 to-indigo-900 border-t-2 border-pink-500 shadow-[0_0_40px_rgba(236,72,153,0.3)] bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-100",
    textClass: "text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400 font-black italic tracking-tighter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]",
    authorClass: "text-cyan-400 font-mono text-sm tracking-widest",
    iconBoxClass: "bg-pink-500/20 text-cyan-400 border border-pink-500/50"
  },
  hologram: {
    containerClass: "bg-cyan-50/90 dark:bg-cyan-950/40 border border-cyan-400/50 shadow-[inset_0_0_30px_rgba(34,211,238,0.2)] backdrop-blur-xl opacity-100",
    textClass: "text-cyan-800 dark:text-cyan-300 font-sans font-light tracking-wide",
    authorClass: "text-cyan-600 dark:text-cyan-500 font-medium tracking-widest uppercase",
    iconBoxClass: "bg-cyan-400/10 text-cyan-500 border border-cyan-400/30"
  },
  glitch: {
    containerClass: "bg-slate-100 dark:bg-black border-l-8 border-red-500 shadow-[4px_0_0_rgba(59,130,246,0.5)] opacity-100",
    textClass: "text-slate-900 dark:text-white font-black tracking-tighter uppercase drop-shadow-[2px_2px_0px_rgba(239,68,68,0.7)]",
    authorClass: "bg-red-500 text-white px-2 font-bold italic",
    iconBoxClass: "bg-red-500/10 text-red-500 border-2 border-red-500"
  },
  comic: {
    containerClass: "bg-blue-100 dark:bg-blue-600 border-4 border-black shadow-[6px_6px_0px_rgba(0,0,0,1)] bg-[url('https://www.transparenttextures.com/patterns/polka-dots.png')] opacity-100",
    textClass: "text-black font-black uppercase tracking-tight drop-shadow-[2px_2px_0px_white]",
    authorClass: "bg-yellow-400 text-black px-3 py-1 font-bold border-2 border-black rotate-[-2deg]",
    iconBoxClass: "bg-yellow-400 text-black border-2 border-black"
  },
  glassmorphism: {
    containerClass: "bg-white/40 dark:bg-white/5 border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.2)] backdrop-blur-2xl opacity-100 rounded-3xl",
    textClass: "text-slate-800 dark:text-white font-medium tracking-tight",
    authorClass: "text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-widest",
    iconBoxClass: "bg-white/20 text-slate-800 dark:text-white border border-white/30"
  },
  brutalist: {
    containerClass: "bg-zinc-200 dark:bg-zinc-900 border-4 border-zinc-950 dark:border-zinc-100 opacity-100",
    textClass: "text-zinc-950 dark:text-zinc-100 font-black uppercase tracking-tighter",
    authorClass: "bg-zinc-950 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 px-4 py-2 font-bold uppercase",
    iconBoxClass: "bg-zinc-300 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 border-4 border-zinc-950 dark:border-zinc-100"
  },
  minimal: {
    containerClass: "bg-white dark:bg-black border border-gray-200 dark:border-gray-800 opacity-100",
    textClass: "text-black dark:text-white font-serif italic tracking-wide",
    authorClass: "text-gray-400 font-sans text-xs tracking-widest uppercase",
    iconBoxClass: "bg-gray-100 dark:bg-gray-900 text-black dark:text-white"
  },
  cosmic: {
    containerClass: "bg-slate-900 border border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.2)] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-100",
    textClass: "text-indigo-100 font-light tracking-widest drop-shadow-[0_0_8px_rgba(165,180,252,0.8)]",
    authorClass: "text-indigo-400 font-bold tracking-widest uppercase",
    iconBoxClass: "bg-indigo-900/50 text-indigo-300 border border-indigo-500/50"
  },
  magma: {
    containerClass: "bg-orange-950/90 border-b-4 border-orange-500 shadow-[0_10px_40px_rgba(249,115,22,0.3)] opacity-100",
    textClass: "text-orange-100 font-black tracking-tight drop-shadow-[0_2px_4px_rgba(234,88,12,1)]",
    authorClass: "text-orange-400 font-bold uppercase",
    iconBoxClass: "bg-orange-600/20 text-orange-400 border border-orange-500/50"
  },
  biohazard: {
    containerClass: "bg-lime-50 dark:bg-lime-950 border-4 border-lime-500 shadow-[0_0_20px_rgba(132,204,22,0.4)] opacity-100",
    textClass: "text-lime-900 dark:text-lime-400 font-mono font-bold tracking-tighter drop-shadow-sm",
    authorClass: "bg-lime-500 text-lime-950 px-2 font-mono font-black",
    iconBoxClass: "bg-lime-500/20 text-lime-600 dark:text-lime-400 border-2 border-lime-500"
  },
  frost: {
    containerClass: "bg-sky-50/80 dark:bg-sky-950/60 border border-sky-300 shadow-[0_0_30px_rgba(125,211,252,0.3)] backdrop-blur-md opacity-100",
    textClass: "text-sky-900 dark:text-sky-100 font-sans font-medium tracking-wide",
    authorClass: "text-sky-600 dark:text-sky-400 font-bold uppercase tracking-widest",
    iconBoxClass: "bg-sky-200/50 dark:bg-sky-800/50 text-sky-700 dark:text-sky-300 border border-sky-400"
  },
  gold: {
    containerClass: "bg-amber-100 dark:bg-amber-950 border-2 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.2)] opacity-100",
    textClass: "text-amber-900 dark:text-amber-200 font-serif font-black tracking-normal drop-shadow-sm",
    authorClass: "text-amber-700 dark:text-amber-500 font-serif italic tracking-widest",
    iconBoxClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500"
  }
};

export const GAMER_MOTIVATIONS: MotivationQuote[] = [
""")
    for i, q in enumerate(quotes_list):
        # Escape any quotes
        text = q["text"].replace('"', '\\"')
        author = q["author"].replace('"', '\\"')
        f.write(f'  {{ id: "{i}", text: "{text}", author: "{author}", style: "{q["style"]}" }},\n')
    f.write('];\n')

print("Generated quotes.ts successfully.")
