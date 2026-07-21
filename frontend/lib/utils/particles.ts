import confetti from "canvas-confetti";

let activeTimeouts: NodeJS.Timeout[] = [];
let activeIntervals: NodeJS.Timeout[] = [];
let activeFrames: number[] = [];

const safeSetTimeout = (cb: () => void, ms: number) => {
  const id = setTimeout(cb, ms);
  activeTimeouts.push(id);
  return id;
};

const safeSetInterval = (cb: () => void, ms: number) => {
  const id = setInterval(cb, ms);
  activeIntervals.push(id);
  return id;
};

const safeRequestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = requestAnimationFrame(cb);
  activeFrames.push(id);
  return id;
};

export const triggerBlaze = () => {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#450a0a"];

  (function frame() {
    confetti({
      particleCount: 10,
      angle: 90,
      spread: 80,
      origin: { x: Math.random(), y: 1.2 },
      colors,
      shapes: ["circle", "square"] as any,
      gravity: -0.5,
      scalar: Math.random() * 0.8 + 0.4,
      ticks: 300,
      zIndex: 9999,
    });
    if (Date.now() < end) safeRequestAnimationFrame(frame);
  })();
  
  const pop = () => confetti({ particleCount: 150, spread: 120, startVelocity: 60, origin: { y: 0.6 }, colors, gravity: 1.5, scalar: 1.2, ticks: 300, zIndex: 9999 });
  pop();
  safeSetTimeout(pop, 400); // secondary pop
};

export const triggerSurge = () => {
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ["#0ea5e9", "#22d3ee", "#38bdf8", "#0284c7", "#ffffff"];

  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors, shapes: ["star", "square"] as any, gravity: 0.8, startVelocity: 80, scalar: 0.8, zIndex: 9999 });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors, shapes: ["star", "square"] as any, gravity: 0.8, startVelocity: 80, scalar: 0.8, zIndex: 9999 });
    if (Date.now() < end) safeRequestAnimationFrame(frame);
  })();
  
  const zap = () => confetti({ particleCount: 100, spread: 360, origin: { y: 0.5 }, colors, gravity: 0, startVelocity: 100, scalar: 0.5, ticks: 100, zIndex: 9999 });
  zap();
  safeSetTimeout(zap, 300);
  safeSetTimeout(zap, 600);
};

export const triggerCrystal = () => {
  const duration = 3500;
  const end = Date.now() + duration;
  const colors = ["#a855f7", "#d946ef", "#c084fc", "#f0abfc", "#ffffff"];

  const interval = safeSetInterval(() => {
    if (Date.now() > end) return clearInterval(interval);
    confetti({ particleCount: 40, spread: 60, origin: { x: 0.5 + (Math.random() - 0.5) * 0.2, y: 0.5 + (Math.random() - 0.5) * 0.2 }, colors, gravity: 0.1, scalar: 0.5, ticks: 200, shapes: ["circle"] as any, zIndex: 9999 });
  }, 200);
  
  const blast = () => confetti({ particleCount: 250, spread: 180, origin: { y: 0.5 }, colors, gravity: 0.6, scalar: 1, ticks: 400, zIndex: 9999 });
  blast();
  safeSetTimeout(blast, 800); // Delayed massive double blast
};

export const triggerMythic = () => {
  const duration = 6000;
  const end = Date.now() + duration;
  const colors = ["#fbbf24", "#f59e0b", "#d97706", "#fef3c7", "#ffffff"];

  (function frame() {
    confetti({ particleCount: 8, angle: 270, spread: 180, origin: { x: Math.random(), y: -0.2 }, colors, gravity: 0.3, scalar: Math.random() * 1.5 + 0.8, shapes: ["star", "circle", "square"] as any, ticks: 800, zIndex: 9999 });
    if (Date.now() < end) safeRequestAnimationFrame(frame);
  })();
  
  const royalBurst = () => confetti({ particleCount: 200, spread: 360, origin: { y: 0.4 }, colors, gravity: 0.4, startVelocity: 40, scalar: 1.5, shapes: ["star", "circle"] as any, ticks: 600, zIndex: 9999 });
  royalBurst();
  safeSetTimeout(royalBurst, 1000);
  safeSetTimeout(royalBurst, 2000);
};

// A light, brief welcome burst for a successful login — deliberately far more
// subdued than the loot-drop/badge-unlock effects above (triggerBlaze/triggerSurge/
// triggerCrystal/triggerMythic), which are earned-reward moments for students only.
// Login happens for every role on every session, so this stays a single quick pop
// themed to whichever role just signed in, not a multi-second celebration.
export const triggerLoginWelcome = (colors: string[]) => {
  confetti({
    particleCount: 60,
    spread: 70,
    startVelocity: 42,
    origin: { x: 0.5, y: 0.35 },
    colors,
    gravity: 1,
    scalar: 0.9,
    ticks: 180,
    zIndex: 9999,
  });
};

// Kept for backward compatibility
export const triggerShockwave = triggerBlaze;
export const triggerGoldRush = triggerMythic;
export const triggerStarfall = triggerSurge;
export const triggerMicroBurst = (x: number, y: number, colors: string[]) => {
  confetti({ particleCount: 40, spread: 60, origin: { x, y }, colors, gravity: 1, scalar: 0.7, ticks: 150, shapes: ["star", "circle"] as any, zIndex: 9999 });
};

export const resetParticles = () => {
  activeTimeouts.forEach(clearTimeout);
  activeIntervals.forEach(clearInterval);
  activeFrames.forEach(cancelAnimationFrame);
  activeTimeouts = [];
  activeIntervals = [];
  activeFrames = [];
  confetti.reset();
};
