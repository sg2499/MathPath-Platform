import confetti from "canvas-confetti";

// A utility to fire confetti multiple times for a shockwave effect
export const triggerShockwave = () => {
  const duration = 3000;
  const end = Date.now() + duration;

  // We can use standard shapes and stars
  const shapes = ["star", "circle", "square"] as any;

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ["#6366f1", "#a855f7", "#ec4899", "#fcd34d"],
      shapes,
      gravity: 1.2,
      drift: 0,
      ticks: 300,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ["#6366f1", "#a855f7", "#ec4899", "#fcd34d"],
      shapes,
      gravity: 1.2,
      drift: 0,
      ticks: 300,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();

  // Initial massive center burst
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.6 },
    colors: ["#ffffff", "#6366f1", "#a855f7"],
    shapes,
    gravity: 0.8,
    scalar: 1.2,
    ticks: 400,
    zIndex: 9999,
  });
};

export const triggerGoldRush = () => {
  const duration = 4000;
  const end = Date.now() + duration;
  const colors = ["#fbbf24", "#f59e0b", "#d97706", "#ffffff"];

  (function frame() {
    confetti({
      particleCount: 8,
      angle: 270,
      spread: 180,
      origin: { x: Math.random(), y: -0.2 },
      colors,
      gravity: 0.8,
      scalar: Math.random() * 0.8 + 0.4,
      shapes: ["star", "circle"] as any,
      ticks: 400,
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

export const triggerStarfall = () => {
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ["#818cf8", "#c084fc", "#38bdf8"];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors,
      shapes: ["star", "circle"] as any,
      gravity: 0.6,
      scalar: 0.8,
      zIndex: 9999,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors,
      shapes: ["star", "circle"] as any,
      gravity: 0.6,
      scalar: 0.8,
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

export const triggerMicroBurst = (x: number, y: number, colors: string[]) => {
  confetti({
    particleCount: 40,
    spread: 60,
    origin: { x, y },
    colors,
    gravity: 1,
    scalar: 0.7,
    ticks: 150,
    shapes: ["star", "circle"] as any,
    zIndex: 9999,
  });
};
