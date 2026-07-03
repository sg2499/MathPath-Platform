export type PopArtStyle = 'cyberpunk' | 'neon' | 'retro' | 'synthwave' | 'hologram' | 'glitch' | 'comic';

export interface MotivationQuote {
  id: string;
  text: string;
  author: string | null;
  style: PopArtStyle;
}

// Massive pool of quotes mixing Gamified Motivation, Stoicism, and Studying Mindset.
export const GAMER_MOTIVATIONS: MotivationQuote[] = [
  { id: "q1", text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", style: "retro" },
  { id: "q2", text: "The only way to learn mathematics is to do mathematics.", author: "Paul Halmos", style: "cyberpunk" },
  { id: "q3", text: "Do not worry about your difficulties in mathematics. I can assure you mine are still greater.", author: "Albert Einstein", style: "neon" },
  { id: "q4", text: "Precision beats power. Take your time, calculate the variables, strike.", author: null, style: "hologram" },
  { id: "q5", text: "Every failed attempt is just data for your next victory.", author: null, style: "glitch" },
  { id: "q6", text: "Mathematics is not about numbers, equations, computations, or algorithms: it is about understanding.", author: "William Paul Thurston", style: "synthwave" },
  { id: "q7", text: "Adapt. Overcome. Evolve. The algorithms don't wait for anyone.", author: null, style: "cyberpunk" },
  { id: "q8", text: "A flawless run isn't luck. It's a thousand invisible mistakes corrected.", author: null, style: "neon" },
  { id: "q9", text: "There is no speed limit on the road to mastery.", author: null, style: "synthwave" },
  { id: "q10", text: "The leaderboard only remembers the ones who stayed in the game.", author: null, style: "comic" },
  { id: "q11", text: "Unlock your potential. One perfect equation at a time.", author: null, style: "retro" },
  { id: "q12", text: "The harder you work for something, the greater you'll feel when you achieve it.", author: null, style: "neon" },
  { id: "q13", text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins", style: "glitch" },
  { id: "q14", text: "Pure mathematics is, in its way, the poetry of logical ideas.", author: "Albert Einstein", style: "hologram" },
  { id: "q15", text: "Grind while they rest. Study while they sleep. Live like they dream.", author: null, style: "cyberpunk" },
  { id: "q16", text: "Focus is a muscle. The more you use it, the stronger it gets.", author: null, style: "synthwave" },
  { id: "q17", text: "Your only limit is your mind.", author: null, style: "comic" },
  { id: "q18", text: "Level up your mind, the rest will follow.", author: null, style: "retro" },
  { id: "q19", text: "Equations are the lifeblood of the universe.", author: null, style: "neon" },
  { id: "q20", text: "Respawn. Reload. Re-calculate.", author: null, style: "glitch" },
  { id: "q21", text: "You don't lose when you fail. You lose when you quit the lobby.", author: null, style: "cyberpunk" },
  { id: "q22", text: "XP is earned in the silence of practice, not the roar of the leaderboard.", author: null, style: "hologram" },
  { id: "q23", text: "Fear the player who has practiced one math problem ten thousand times.", author: "Bruce Lee", style: "synthwave" },
  { id: "q24", text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson", style: "comic" },
  { id: "q25", text: "It’s not that I’m so smart, it’s just that I stay with problems longer.", author: "Albert Einstein", style: "retro" },
  { id: "q26", text: "Mathematics is the language with which God has written the universe.", author: "Galileo Galilei", style: "neon" },
  { id: "q27", text: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.", author: "Stephen King", style: "glitch" },
  { id: "q28", text: "Doubt kills more dreams than failure ever will.", author: "Suzy Kassem", style: "cyberpunk" },
  { id: "q29", text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison", style: "hologram" },
  { id: "q30", text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky", style: "synthwave" },
  { id: "q31", text: "The future belongs to those who learn more skills and combine them in creative ways.", author: "Robert Greene", style: "comic" },
  { id: "q32", text: "Mastery requires endurance. Mastery requires focus. Mastery requires you.", author: null, style: "retro" },
  { id: "q33", text: "Discipline equals freedom.", author: "Jocko Willink", style: "neon" },
  { id: "q34", text: "What we achieve inwardly will change outer reality.", author: "Plutarch", style: "glitch" },
  { id: "q35", text: "Let no one ignorant of geometry enter here.", author: "Plato", style: "cyberpunk" },
  { id: "q36", text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", style: "hologram" },
  { id: "q37", text: "There is no royal road to geometry.", author: "Euclid", style: "synthwave" },
  { id: "q38", text: "The highest form of pure thought is in mathematics.", author: "Plato", style: "comic" },
  { id: "q39", text: "The master has failed more times than the beginner has even tried.", author: "Stephen McCranie", style: "retro" },
  { id: "q40", text: "If you want to be the best, you have to do things that other people aren't willing to do.", author: "Michael Phelps", style: "neon" },
  { id: "q41", text: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong", style: "glitch" },
  { id: "q42", text: "Without mathematics, there's nothing you can do. Everything around you is mathematics.", author: "Shakuntala Devi", style: "cyberpunk" },
  { id: "q43", text: "Good math is not about how many answers you know, it's about how you behave when you don't know.", author: null, style: "hologram" },
  { id: "q44", text: "The universe cannot be read until we have learnt the language and become familiar with the characters in which it is written.", author: "Galileo", style: "synthwave" },
  { id: "q45", text: "Action is the foundational key to all success.", author: "Pablo Picasso", style: "comic" },
  { id: "q46", text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson", style: "retro" },
  { id: "q47", text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", style: "neon" },
  { id: "q48", text: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius", style: "glitch" },
  { id: "q49", text: "Nature is written in mathematical language.", author: "Galileo Galilei", style: "cyberpunk" },
  { id: "q50", text: "To infinity and beyond.", author: "Buzz Lightyear", style: "hologram" }
];

// Ensure Perfect Light/Dark Contrast
// Light mode text uses deep rich colors. Dark mode uses neon glowing colors.
export const POP_ART_STYLES: Record<PopArtStyle, { containerClass: string; textClass: string; authorClass: string; iconBoxClass: string; }> = {
  cyberpunk: {
    containerClass: "bg-yellow-400 dark:bg-yellow-500 border-r-8 border-b-8 border-slate-900 shadow-[8px_8px_0_rgba(15,23,42,1)] bg-[radial-gradient(rgba(0,0,0,0.15)_2px,transparent_2px)] [background-size:16px_16px]",
    textClass: "text-slate-900 font-black uppercase tracking-tighter",
    authorClass: "text-slate-900 font-black bg-white/70 px-2 py-0.5 rounded-sm inline-block uppercase",
    iconBoxClass: "bg-slate-900 text-yellow-400 border border-yellow-500",
  },
  neon: {
    containerClass: "bg-slate-900 dark:bg-slate-950 border-2 border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.6),inset_0_0_20px_rgba(236,72,153,0.4)] bg-[linear-gradient(45deg,transparent_25%,rgba(236,72,153,0.15)_50%,transparent_75%)] [background-size:24px_24px]",
    textClass: "text-pink-400 font-black italic tracking-widest drop-shadow-[0_0_10px_rgba(236,72,153,0.8)]",
    authorClass: "text-pink-300 font-medium tracking-widest uppercase",
    iconBoxClass: "bg-pink-600 text-white shadow-[0_0_15px_rgba(236,72,153,0.8)]",
  },
  retro: {
    containerClass: "bg-emerald-50 dark:bg-[#1e293b] border-4 border-emerald-500 border-dashed shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-95",
    textClass: "text-emerald-800 dark:text-emerald-400 font-mono font-bold tracking-tight drop-shadow-sm",
    authorClass: "text-emerald-700 dark:text-emerald-300 font-mono font-bold text-sm",
    iconBoxClass: "bg-emerald-500 text-white shadow-md",
  },
  synthwave: {
    containerClass: "bg-indigo-950 border border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.5)] bg-[linear-gradient(rgba(34,211,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.15)_1px,transparent_1px)] [background-size:30px_30px]",
    textClass: "text-cyan-400 font-black tracking-normal drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]",
    authorClass: "text-fuchsia-400 font-bold tracking-wider",
    iconBoxClass: "bg-cyan-500 text-indigo-950 shadow-[0_0_20px_rgba(34,211,238,0.8)]",
  },
  hologram: {
    containerClass: "bg-sky-50 dark:bg-cyan-950/40 border border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)] bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]",
    textClass: "text-cyan-800 dark:text-cyan-300 font-bold tracking-wider",
    authorClass: "text-cyan-700 dark:text-cyan-400 uppercase tracking-widest text-xs font-bold",
    iconBoxClass: "bg-cyan-500 text-white shadow-lg",
  },
  glitch: {
    containerClass: "bg-slate-200 dark:bg-black border-l-[10px] border-red-500 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/diagmonds.png')]",
    textClass: "text-red-600 dark:text-red-500 font-black uppercase drop-shadow-[2px_2px_0_rgba(0,0,0,0.1)] dark:drop-shadow-[2px_2px_0_rgba(255,255,255,0.1)]",
    authorClass: "text-red-700 dark:text-red-400 font-mono tracking-tighter",
    iconBoxClass: "bg-red-500 text-white animate-pulse",
  },
  comic: {
    containerClass: "bg-white dark:bg-purple-900 border-4 border-black dark:border-white shadow-[6px_6px_0_rgba(0,0,0,1)] dark:shadow-[6px_6px_0_rgba(255,255,255,1)] bg-[radial-gradient(circle,rgba(0,0,0,0.1)_2px,transparent_2px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.1)_2px,transparent_2px)] [background-size:16px_16px]",
    textClass: "text-black dark:text-white font-black uppercase text-center",
    authorClass: "text-slate-600 dark:text-slate-300 font-bold bg-yellow-300 dark:bg-black px-2 py-1 rounded-sm shadow-sm inline-block rotate-[-2deg]",
    iconBoxClass: "bg-purple-500 text-white border-2 border-black dark:border-white rounded-full",
  }
};
