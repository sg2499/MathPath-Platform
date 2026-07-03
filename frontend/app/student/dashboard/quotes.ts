export type PopArtStyle = 'cyberpunk' | 'neon' | 'retro' | 'synthwave' | 'hologram';

export interface MotivationQuote {
  id: string;
  text: string;
  author: string | null;
  style: PopArtStyle;
}

export const GAMER_MOTIVATIONS: MotivationQuote[] = [
  {
    id: "q1",
    text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    author: "Winston Churchill",
    style: "retro"
  },
  {
    id: "q2",
    text: "The only way to learn mathematics is to do mathematics.",
    author: "Paul Halmos",
    style: "cyberpunk"
  },
  {
    id: "q3",
    text: "Do not worry about your difficulties in mathematics. I can assure you mine are still greater.",
    author: "Albert Einstein",
    style: "neon"
  },
  {
    id: "q4",
    text: "Precision beats power. Take your time, calculate the variables, strike.",
    author: null,
    style: "neon"
  },
  {
    id: "q5",
    text: "Every failed attempt is just data for your next victory.",
    author: null,
    style: "hologram"
  },
  {
    id: "q6",
    text: "Mathematics is not about numbers, equations, computations, or algorithms: it is about understanding.",
    author: "William Paul Thurston",
    style: "synthwave"
  },
  {
    id: "q7",
    text: "Adapt. Overcome. Evolve. The algorithms don't wait for anyone.",
    author: null,
    style: "cyberpunk"
  },
  {
    id: "q8",
    text: "A flawless run isn't luck. It's a thousand invisible mistakes corrected.",
    author: null,
    style: "neon"
  },
  {
    id: "q9",
    text: "There is no speed limit on the road to mastery.",
    author: null,
    style: "synthwave"
  },
  {
    id: "q10",
    text: "The leaderboard only remembers the ones who stayed in the game.",
    author: null,
    style: "hologram"
  },
  {
    id: "q11",
    text: "Unlock your potential. One perfect equation at a time.",
    author: null,
    style: "retro"
  }
];

export const POP_ART_STYLES: Record<PopArtStyle, { containerClass: string; textClass: string; authorClass: string; iconBoxClass: string; }> = {
  cyberpunk: {
    containerClass: "bg-yellow-400 dark:bg-yellow-500 border-r-8 border-b-8 border-black dark:border-slate-900 shadow-[8px_8px_0_rgba(0,0,0,0.2)] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]",
    textClass: "text-black font-black uppercase tracking-tighter drop-shadow-md",
    authorClass: "text-slate-900 font-bold bg-white/50 px-2 py-0.5 rounded-sm inline-block",
    iconBoxClass: "bg-black text-yellow-400 border border-yellow-500",
  },
  neon: {
    containerClass: "bg-slate-950 border-2 border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.5),inset_0_0_20px_rgba(236,72,153,0.3)] bg-[linear-gradient(45deg,transparent_25%,rgba(236,72,153,0.1)_50%,transparent_75%)] [background-size:20px_20px]",
    textClass: "text-pink-400 font-black italic tracking-widest drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]",
    authorClass: "text-pink-300 font-medium tracking-widest uppercase",
    iconBoxClass: "bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.8)]",
  },
  retro: {
    containerClass: "bg-[#e2e8f0] dark:bg-[#1e293b] border-4 border-[#4ade80] border-dashed shadow-[0_0_15px_rgba(74,222,128,0.2)] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-95",
    textClass: "text-slate-800 dark:text-[#4ade80] font-mono font-bold tracking-tight",
    authorClass: "text-slate-600 dark:text-emerald-400 font-mono text-sm",
    iconBoxClass: "bg-[#4ade80] text-slate-900 shadow-md",
  },
  synthwave: {
    containerClass: "bg-gradient-to-br from-indigo-900 via-purple-900 to-fuchsia-900 border border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.4)] bg-[linear-gradient(rgba(34,211,238,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.1)_1px,transparent_1px)] [background-size:30px_30px]",
    textClass: "text-cyan-400 font-black tracking-normal drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]",
    authorClass: "text-fuchsia-300 font-bold",
    iconBoxClass: "bg-cyan-400 text-indigo-900 shadow-[0_0_20px_rgba(34,211,238,0.6)]",
  },
  hologram: {
    containerClass: "bg-slate-100/50 dark:bg-cyan-950/40 backdrop-blur-xl border border-cyan-400/30 shadow-[0_0_20px_rgba(103,232,249,0.2)]",
    textClass: "text-cyan-700 dark:text-cyan-300 font-bold tracking-wider",
    authorClass: "text-cyan-600 dark:text-cyan-400 uppercase tracking-widest text-xs",
    iconBoxClass: "bg-cyan-100 dark:bg-cyan-400/20 text-cyan-600 dark:text-cyan-300 border border-cyan-400/50",
  }
};
