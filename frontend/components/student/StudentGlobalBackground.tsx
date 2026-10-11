"use client";

// 2026-10-11 (Shailesh, "the entire platform must have pristine optimization
// and must feel seamless across any sort of device"): the student backdrop
// keeps its look but is now cheap to draw.
//
// Before: light mode animated three 120-140px CSS blurs from JavaScript on
// every frame, and dark mode ran a full WebGL scene (3,000 stars, sparkles,
// floating shapes and a bloom pass) behind every student page. Measured on a
// mid-range phone profile, student pages scrolled at 7-13 frames a second
// (teacher and admin pages: 60).
//
// Now: the glows are radial gradients (painted once, no blur filter) and the
// stars are one static SVG. The only motion is a slow drift done with
// `transform` / `opacity`, which the GPU composites without repainting, and
// it stops entirely for anyone who prefers reduced motion.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const checkDark = () => document.documentElement.classList.contains("dark");
    setIsDark(checkDark());
    const observer = new MutationObserver(() => setIsDark(checkDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// Deterministic star positions (same sky on every visit, no hydration drift).
function Seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function BuildStars(count: number, seed: number, minRadius: number, maxRadius: number) {
  const random = Seeded(seed);
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 100,
    r: minRadius + random() * (maxRadius - minRadius),
    o: 0.25 + random() * 0.6,
  }));
}

const FAINT_STARS = BuildStars(220, 7, 0.35, 0.9);
const BRIGHT_STARS = BuildStars(36, 31, 0.9, 1.6);
const VIOLET_SPARKS = BuildStars(28, 97, 1, 1.8);

function StarLayer({ stars, color, className }: { stars: ReturnType<typeof BuildStars>; color: string; className?: string }) {
  return (
    <svg className={className} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      {stars.map((star, index) => (
        <circle key={index} cx={`${star.x}%`} cy={`${star.y}%`} r={star.r} fill={color} opacity={star.o} />
      ))}
    </svg>
  );
}

function LightAurora() {
  return (
    <div className="se-bg-light fixed inset-0 z-[-10] overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 opacity-40 mix-blend-soft-light bg-[url('/noise.png')]" />
      <div className="se-bg-orb se-bg-orb-a" />
      <div className="se-bg-orb se-bg-orb-b" />
      <div className="se-bg-orb se-bg-orb-c" />
    </div>
  );
}

function DarkSky() {
  return (
    <div className="se-bg-dark fixed inset-0 z-[-10] overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="se-bg-glow" />
      <div className="se-bg-stars">
        <StarLayer stars={FAINT_STARS} color="#e2e8f0" className="absolute inset-0" />
      </div>
      <div className="se-bg-stars se-bg-stars-slow">
        <StarLayer stars={BRIGHT_STARS} color="#f8fafc" className="absolute inset-0" />
      </div>
      <div className="se-bg-sparks">
        <StarLayer stars={VIOLET_SPARKS} color="#a78bfa" className="absolute inset-0" />
      </div>
    </div>
  );
}

// Test-taking screens (practice sheets, assessments, mock exams, annual
// practice and the official annual paper) get a plain, still backdrop: no
// drifting colour, nothing moving behind a question.
const TEST_ROUTE_PATTERN = /^\/student\/(attempt|assessment-attempt|competition\/mock-attempt|competition\/annual\/attempt)\//;

export default function StudentGlobalBackground() {
  const isDark = useDarkMode();
  const pathname = usePathname();

  if (pathname && TEST_ROUTE_PATTERN.test(pathname)) {
    return <div className="se-test-backdrop fixed inset-0 z-[-10] pointer-events-none" aria-hidden="true" />;
  }

  return isDark ? <DarkSky /> : <LightAurora />;
}
