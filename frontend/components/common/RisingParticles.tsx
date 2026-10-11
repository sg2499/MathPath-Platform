// 2026-10-11 (performance): the leaderboards' rising specks, drawn with CSS
// transform/opacity only (composited by the GPU), instead of 40 JavaScript-
// driven, individually blurred dots inside a full-screen blend layer.
// Positions are seeded so the server and browser render the same thing.
function Seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function RisingParticles({ count = 40, seed = 11, className = "" }: { count?: number; seed?: number; className?: string }) {
  const random = Seeded(seed);
  const specks = Array.from({ length: count }, () => ({
    left: random() * 100,
    duration: 10 + random() * 20,
    delay: -random() * 30,
    peak: 0.25 + random() * 0.65,
    size: random() > 0.7 ? 5 : 4,
  }));
  return (
    <div className="mp-rising absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {specks.map((speck, index) => (
        <span
          key={index}
          className={`mp-rising-speck ${className}`}
          style={{
            left: `${speck.left}%`,
            width: speck.size,
            height: speck.size,
            animationDuration: `${speck.duration}s`,
            animationDelay: `${speck.delay}s`,
            ["--mp-peak" as string]: speck.peak,
          }}
        />
      ))}
    </div>
  );
}
