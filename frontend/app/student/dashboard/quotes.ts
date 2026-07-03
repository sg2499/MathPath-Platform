export type PopArtStyle = 'cyberpunk' | 'neon' | 'retro' | 'synthwave' | 'hologram';

export interface MotivationQuote {
  id: string;
  text: string;
  author: string;
  style: PopArtStyle;
}

export const GAMER_MOTIVATIONS: MotivationQuote[] = [
  {
    id: "q1",
    text: "The grind never stops. Your next milestone is waiting in the shadows.",
    author: "Apex Protocol",
    style: "cyberpunk"
  },
  {
    id: "q2",
    text: "Precision beats power. Take your time, calculate the variables, strike.",
    author: "Grandmaster",
    style: "neon"
  },
  {
    id: "q3",
    text: "Every failed attempt is just data for your next victory.",
    author: "Neural Net",
    style: "hologram"
  },
  {
    id: "q4",
    text: "You don't lose when you fail. You lose when you quit the lobby.",
    author: "Player One",
    style: "retro"
  },
  {
    id: "q5",
    text: "XP is earned in the silence of practice, not the roar of the leaderboard.",
    author: "The Architect",
    style: "synthwave"
  },
  {
    id: "q6",
    text: "Adapt. Overcome. Evolve. The algorithms don't wait for anyone.",
    author: "System Core",
    style: "cyberpunk"
  },
  {
    id: "q7",
    text: "A flawless run isn't luck. It's a thousand invisible mistakes corrected.",
    author: "Void Walker",
    style: "neon"
  },
  {
    id: "q8",
    text: "Respawn. Reload. Re-calculate.",
    author: "Glitch",
    style: "retro"
  },
  {
    id: "q9",
    text: "There is no speed limit on the road to God-Tier.",
    author: "Velocity",
    style: "synthwave"
  },
  {
    id: "q10",
    text: "The leaderboard only remembers the ones who stayed in the game.",
    author: "Oracle",
    style: "hologram"
  },
  {
    id: "q11",
    text: "Unlock your potential. One perfect equation at a time.",
    author: "Apex Protocol",
    style: "neon"
  },
  {
    id: "q12",
    text: "Fear the player who has practiced one math problem ten thousand times.",
    author: "Sensei",
    style: "retro"
  }
];

export const POP_ART_STYLES: Record<PopArtStyle, { bg: string; text: string; border: string; glow: string; font: string; icon: any }> = {
  cyberpunk: {
    bg: "bg-yellow-400 dark:bg-yellow-500",
    text: "text-slate-900",
    border: "border-r-8 border-b-8 border-slate-900",
    glow: "shadow-[8px_8px_0_rgba(0,0,0,0.2)]",
    font: "font-black uppercase tracking-tighter",
    icon: "bg-black text-yellow-400"
  },
  neon: {
    bg: "bg-slate-950",
    text: "text-pink-500",
    border: "border-2 border-pink-500",
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.5),inset_0_0_20px_rgba(236,72,153,0.3)]",
    font: "font-black italic tracking-widest",
    icon: "bg-pink-500 text-white"
  },
  retro: {
    bg: "bg-[#2d3748]",
    text: "text-[#4ade80]",
    border: "border-4 border-[#4ade80] border-dashed",
    glow: "shadow-[0_0_15px_rgba(74,222,128,0.2)]",
    font: "font-mono font-bold tracking-tight",
    icon: "bg-[#4ade80] text-slate-900"
  },
  synthwave: {
    bg: "bg-gradient-to-br from-indigo-900 to-fuchsia-900",
    text: "text-cyan-400",
    border: "border border-cyan-400/50",
    glow: "shadow-[0_0_30px_rgba(34,211,238,0.4)]",
    font: "font-black tracking-normal",
    icon: "bg-cyan-400 text-indigo-900"
  },
  hologram: {
    bg: "bg-cyan-950/40 backdrop-blur-md",
    text: "text-cyan-300",
    border: "border border-cyan-400/30",
    glow: "shadow-[0_0_20px_rgba(103,232,249,0.2)]",
    font: "font-bold tracking-wider",
    icon: "bg-cyan-400/20 text-cyan-300 border border-cyan-400/50"
  }
};
