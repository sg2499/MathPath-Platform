import confetti from "canvas-confetti";

export const triggerBlaze = () => {
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#450a0a"];

  (function frame() {
    confetti({
      particleCount: 10,
      angle: 90,
      spread: 80,
      origin: { x: Math.random(), y: 1.2 }, // Coming from bottom like fire
      colors,
      shapes: ["circle", "square"] as any,
      gravity: -0.5, // Float up!
      scalar: Math.random() * 0.8 + 0.4,
      ticks: 300,
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
  
  // Initial aggressive pop
  confetti({
    particleCount: 150,
    spread: 120,
    startVelocity: 60,
    origin: { y: 0.6 },
    colors,
    gravity: 1.5,
    scalar: 1.2,
    ticks: 300,
    zIndex: 9999,
  });
};

export const triggerSurge = () => {
  const duration = 2000;
  const end = Date.now() + duration;
  const colors = ["#0ea5e9", "#22d3ee", "#38bdf8", "#0284c7", "#ffffff"];

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors,
      shapes: ["star", "square"] as any,
      gravity: 0.8,
      startVelocity: 80, // High velocity
      scalar: 0.8,
      zIndex: 9999,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors,
      shapes: ["star", "square"] as any,
      gravity: 0.8,
      startVelocity: 80,
      scalar: 0.8,
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

export const triggerCrystal = () => {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ["#a855f7", "#d946ef", "#c084fc", "#f0abfc", "#ffffff"];

  const interval = setInterval(() => {
    if (Date.now() > end) {
      return clearInterval(interval);
    }
    // dense micro bursts around the center
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { x: 0.5 + (Math.random() - 0.5) * 0.2, y: 0.5 + (Math.random() - 0.5) * 0.2 },
      colors,
      gravity: 0.2, // floating in space
      scalar: 0.5,
      ticks: 150,
      shapes: ["circle"] as any,
      zIndex: 9999,
    });
  }, 250);
  
  // Big center burst
  confetti({
    particleCount: 200,
    spread: 160,
    origin: { y: 0.5 },
    colors,
    gravity: 0.5,
    scalar: 1,
    ticks: 400,
    zIndex: 9999,
  });
};

export const triggerMythic = () => {
  const duration = 5000;
  const end = Date.now() + duration;
  const colors = ["#fbbf24", "#f59e0b", "#d97706", "#fef3c7", "#ffffff"];

  (function frame() {
    confetti({
      particleCount: 8,
      angle: 270,
      spread: 180,
      origin: { x: Math.random(), y: -0.2 },
      colors,
      gravity: 0.3, // slow motion fall
      scalar: Math.random() * 1.5 + 0.8, // Massive chunks of gold
      shapes: ["star", "circle", "square"] as any,
      ticks: 800, // Lingers on screen
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

// Kept for backward compatibility
export const triggerShockwave = triggerBlaze;
export const triggerGoldRush = triggerMythic;
export const triggerStarfall = triggerSurge;
export const triggerMicroBurst = (x: number, y: number, colors: string[]) => {
  confetti({ particleCount: 40, spread: 60, origin: { x, y }, colors, gravity: 1, scalar: 0.7, ticks: 150, shapes: ["star", "circle"] as any, zIndex: 9999 });
};
