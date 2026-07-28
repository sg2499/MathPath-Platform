/* ==========================================================================
 * BESPOKE BADGE GLYPHS -- reference batch (2026-07-27, craft pass)
 * --------------------------------------------------------------------------
 * The five reference badges previously borrowed stock `lucide-react` glyphs
 * (Zap / Gem / Diamond / Layers / Flame). Those are *UI* icons: single-weight,
 * single-path, designed to sit in a 16px toolbar. Blown up to 120px on a
 * cinematic card they read as clip-art, and -- worse -- as interchangeable,
 * which is the exact opposite of "this is a distinct unlock".
 *
 * Everything in this file is drawn by hand, per badge, on a 24x24 grid:
 *   - a soft accent under-layer for depth (fills, no stroke)
 *   - the hero silhouette in `currentColor` (so it inherits the badge's own
 *     `iconColorHex` from whatever renders it)
 *   - internal facet / detail strokes that only make sense for that one badge
 *
 * SCOPE: these five components are used for the five reference-batch iconName
 * keys ONLY. Every other badge in the product keeps its lucide icon, untouched.
 *
 * API: drop-in compatible with the lucide call signature already used across
 * the app -- `<Icon size={n} strokeWidth={n} style={{color}} className="..." />`
 * -- so `BadgeIconMap` / `IconMap` can map to these with no call-site changes.
 * ========================================================================== */
import React from "react";

export interface BadgeGlyphProps
  extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  /** Matches lucide's `size` prop: sets both width and height. */
  size?: number | string;
}

type GlyphShellProps = BadgeGlyphProps & { children: React.ReactNode };

/**
 * Shared shell. Note the style merge order: an explicit `color` prop wins, but
 * with no `color` prop the caller's `style.color` is what `currentColor`
 * resolves to -- which is how every existing call site passes the badge tint.
 */
function GlyphShell({
  size = 24,
  color,
  strokeWidth = 1.6,
  style,
  children,
  ...rest
}: GlyphShellProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...style, ...(color ? { color } : null) }}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* --------------------------------------------------------------------------
 * 1. SpeedComet -- Speed Demon, BASE. Cyan / electric blue.
 * A raked faceted crystal dart (the same silhouette language as the 3D
 * hourglass shard) with three swept motion trails behind it and a hot core at
 * the waist. Deliberately asymmetric: it leans into its direction of travel.
 * ------------------------------------------------------------------------ */
const SPEED_CYAN = "#22d3ee";
const SPEED_ICE = "#67e8f9";
const SPEED_WHITE = "#ecfeff";

export function IconSpeedComet(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Motion trails -- drawn first so the dart sits on top of them. All
          three run parallel to the dart's own axis, which is what makes them
          read as speed rather than as decoration. */}
      <g stroke={SPEED_ICE} strokeWidth={1.15} opacity={0.5} fill="none">
        <path d="M8.1 4.9 Q6.2 7.5 4.3 10.1" />
        <path d="M19.3 15.6 Q17.2 18.4 15.1 21.2" />
      </g>
      <path
        d="M9.6 8.4 Q7 12 4.3 15.7"
        stroke={SPEED_CYAN}
        strokeWidth={1.5}
        opacity={0.85}
        fill="none"
      />

      {/* Velocity echo: the dart silhouette dropped back along its own axis. */}
      <path
        d="M20.4 4.2 L17.9 13.6 L7.6 21.6 L11.9 9.2 Z"
        fill={SPEED_CYAN}
        opacity={0.26}
        stroke="none"
      />

      {/* Hero dart. */}
      <path d="M22.2 1.8 L19.7 11.2 L9.4 19.2 L13.7 6.8 Z" fill={SPEED_CYAN} fillOpacity={0.22} />
      {/* Internal facets -- the crystal read. */}
      <path d="M22.2 1.8 L9.4 19.2" strokeWidth={1.1} opacity={0.9} />
      <path d="M13.7 6.8 L19.7 11.2" strokeWidth={1.1} opacity={0.75} />
      {/* Hot core, set forward of the waist so the mark has a head. */}
      <circle cx="17.7" cy="7.9" r="1.45" fill={SPEED_WHITE} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * 2. PerfectionistGem -- Perfectionist, SUPER. Amethyst / magenta.
 * A cut stone with a real crown/girdle/pavilion structure and step facets --
 * NOT a generic diamond outline. Intact, symmetrical, unbroken: that
 * intactness is the whole point, because MYTHIC below is the same stone split.
 * ------------------------------------------------------------------------ */
const GEM_AMETHYST = "#9b1fd6";
const GEM_MAGENTA = "#e0219c";
const GEM_LILAC = "#f5a3ff";

export function IconPerfectionistGem(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Depth: crown lit warmer than the pavilion, so the stone has a top. */}
      <path d="M8.6 3.4 L15.4 3.4 L20.4 8.2 L3.6 8.2 Z" fill={GEM_MAGENTA} opacity={0.3} stroke="none" />
      <path d="M3.6 8.2 L20.4 8.2 L12 21 Z" fill={GEM_AMETHYST} opacity={0.24} stroke="none" />

      {/* Silhouette. */}
      <path d="M8.6 3.4 L15.4 3.4 L20.4 8.2 L12 21 L3.6 8.2 Z" />
      {/* Girdle. */}
      <path d="M3.6 8.2 L20.4 8.2" strokeWidth={1.25} />
      {/* Crown facets down to the girdle. */}
      <path d="M8.6 3.4 L6.9 8.2" strokeWidth={1} opacity={0.85} />
      <path d="M15.4 3.4 L17.1 8.2" strokeWidth={1} opacity={0.85} />
      {/* Pavilion main facets converging on the culet. */}
      <path d="M6.9 8.2 L12 21" strokeWidth={1} opacity={0.8} />
      <path d="M17.1 8.2 L12 21" strokeWidth={1} opacity={0.8} />
      {/* Step cuts -- two horizontal breaks tracking the taper. */}
      <path d="M5.8 11.5 L18.2 11.5" strokeWidth={0.85} opacity={0.6} />
      <path d="M8.1 15 L15.9 15" strokeWidth={0.85} opacity={0.5} />
      {/* Table glint. */}
      <path d="M9.7 4.6 L12.3 4.6 L10.9 6.8 L8.3 6.8 Z" fill={GEM_LILAC} opacity={0.75} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * 3. PerfectionistGemMythic -- Perfectionist, MYTHIC. Opal / prismatic.
 * The SAME stone family as #2, split down the middle. The two halves are
 * pushed apart along a jagged crack and spectral rays escape from the break,
 * so the icon tells the "the stone fractures and there is still light inside"
 * story at thumbnail size, without needing the cinematic to explain it.
 * ------------------------------------------------------------------------ */
const OPAL_AQUA = "#5ffbf1";
const OPAL_MINT = "#7cff9e";
const OPAL_FIRE = "#ffd166";
const OPAL_ROSE = "#ff7bd5";
const OPAL_PERI = "#8ea2ff";
const OPAL_PEARL = "#ffffff";

export function IconPerfectionistGemMythic(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Escaping light -- spectral rays, drawn under the halves so they look
          like they are coming out from behind the break. */}
      <g strokeWidth={1.25} strokeLinecap="round">
        <path d="M11.9 10.6 L15.9 5.7" stroke={OPAL_FIRE} opacity={0.9} />
        <path d="M11.9 10.6 L17.8 9.4" stroke={OPAL_ROSE} opacity={0.85} />
        <path d="M11.9 10.6 L16.6 13.9" stroke={OPAL_MINT} opacity={0.8} />
        <path d="M11.5 11 L6.4 7.1" stroke={OPAL_AQUA} opacity={0.9} />
        <path d="M11.5 11 L4.9 11.9" stroke={OPAL_PERI} opacity={0.85} />
        <path d="M11.5 11 L6.9 14.9" stroke={OPAL_FIRE} opacity={0.7} />
      </g>

      {/* Iridescent fill behind each half -- different hue per half, which is
          what makes this read as opal rather than as one tinted stone. */}
      <path
        d="M7.8 3.4 L11.4 3.4 L12.3 7.2 L10.3 10.4 L12.5 13.6 L11.4 20.8 L2.9 8.2 Z"
        fill={OPAL_AQUA}
        opacity={0.3}
        stroke="none"
      />
      <path
        d="M12.6 3.4 L16.2 3.4 L21.1 8.2 L12.6 20.8 L13.7 13.6 L11.5 10.4 L13.5 7.2 Z"
        fill={OPAL_ROSE}
        opacity={0.3}
        stroke="none"
      />

      {/* The two halves of the stone. */}
      <path d="M7.8 3.4 L11.4 3.4 L12.3 7.2 L10.3 10.4 L12.5 13.6 L11.4 20.8 L2.9 8.2 Z" />
      <path d="M12.6 3.4 L16.2 3.4 L21.1 8.2 L12.6 20.8 L13.7 13.6 L11.5 10.4 L13.5 7.2 Z" />

      {/* Residual girdle stubs, so the family resemblance to #2 survives. */}
      <path d="M2.9 8.2 L9.1 8.2" strokeWidth={1} opacity={0.6} />
      <path d="M14.6 8.2 L21.1 8.2" strokeWidth={1} opacity={0.6} />

      {/* The core still burning inside the break. */}
      <circle cx="11.7" cy="10.8" r="1.5" fill={OPAL_PEARL} stroke="none" />
      <circle cx="11.7" cy="10.8" r="2.6" fill={OPAL_FIRE} opacity={0.35} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * 4. LevelMonument -- Intermediate Level 1 Perfected, LEGENDARY.
 * A stepped ziggurat: four stacked trapezoidal tiers on a plinth, with an
 * apex marker and a faint axis of ascent running through the stack. This is
 * the only architectural glyph in the whole set -- every other badge icon is
 * an object; this one is a structure, which is how a *level* badge stays
 * visually separable from every *skill* badge.
 * ------------------------------------------------------------------------ */
const MON_INDIGO = "#6366f1";
const MON_TEAL = "#14b8a6";
const MON_MINT = "#5eead4";

export function IconLevelMonument(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Axis of ascent (matches the light shaft in the 3D monument). */}
      <path d="M12 3.2 L12 21.4" stroke={MON_MINT} strokeWidth={0.9} opacity={0.45} />

      {/* Tiers, bottom (indigo) to top (emerald) -- the badge's own gradient,
          stepped rather than smooth so each tier reads as a separate stone. */}
      <path d="M1.8 21.4 L22.2 21.4 L20.9 17.4 L3.1 17.4 Z" fill={MON_INDIGO} opacity={0.34} stroke="none" />
      <path d="M3.8 16.8 L20.2 16.8 L18.9 12.8 L5.1 12.8 Z" fill={MON_INDIGO} opacity={0.28} stroke="none" />
      <path d="M5.9 12.2 L18.1 12.2 L16.9 8.2 L7.1 8.2 Z" fill={MON_TEAL} opacity={0.28} stroke="none" />
      <path d="M7.9 7.6 L16.1 7.6 L15 3.6 L9 3.6 Z" fill={MON_MINT} opacity={0.34} stroke="none" />

      <path d="M1.8 21.4 L22.2 21.4 L20.9 17.4 L3.1 17.4 Z" />
      <path d="M3.8 16.8 L20.2 16.8 L18.9 12.8 L5.1 12.8 Z" />
      <path d="M5.9 12.2 L18.1 12.2 L16.9 8.2 L7.1 8.2 Z" />
      <path d="M7.9 7.6 L16.1 7.6 L15 3.6 L9 3.6 Z" />

      {/* Apex marker -- the "perfected" cap. */}
      <path d="M12 0.9 L13.3 2.4 L12 3.9 L10.7 2.4 Z" fill={MON_MINT} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * 5. StreakChainLegendary -- Unstoppable Streak, LEGENDARY.
 * Fire is the obvious read and it is the wrong one on its own: the badge is
 * about a chain that has not broken. So the chain is the structure and the
 * flame is threaded THROUGH it -- one link passes behind the flame and two
 * interlocked links clamp across its base, which only works because of the
 * paint order below (back link -> flame -> front links).
 * ------------------------------------------------------------------------ */
const FIRE_ORANGE = "#f97316";
const FIRE_CRIMSON = "#dc2626";
const FIRE_GOLD = "#fde68a";

export function IconStreakChainLegendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Link that passes BEHIND the flame -- only its shoulders are visible,
          which is what sells "woven through" rather than "next to". It has to
          be noticeably wider than the flame (rx 7.4 vs the flame's 4.6
          half-width) or the shoulders disappear at card size. */}
      <ellipse
        cx="12"
        cy="8.8"
        rx="7.4"
        ry="3.1"
        stroke={FIRE_CRIMSON}
        strokeWidth={1.8}
        opacity={0.9}
        fill="none"
      />

      {/* Flame body. */}
      <path
        d="M12 1.6 C15.4 5.6 16.6 8 16.6 10.8 C16.6 13.9 14.5 16.2 12 16.2 C9.5 16.2 7.4 13.9 7.4 10.8 C7.4 8 8.6 5.6 12 1.6 Z"
        fill={FIRE_CRIMSON}
        fillOpacity={0.34}
      />
      <path
        d="M12 7.2 C13.8 9.2 14.4 10.4 14.4 11.8 C14.4 13.3 13.3 14.4 12 14.4 C10.7 14.4 9.6 13.3 9.6 11.8 C9.6 10.4 10.2 9.2 12 7.2 Z"
        fill={FIRE_GOLD}
        fillOpacity={0.8}
        stroke={FIRE_ORANGE}
        strokeWidth={0.9}
      />

      {/* Two interlocked links clamped across the base of the flame. They
          overlap each other around x=12, which is the actual interlock. */}
      <ellipse
        cx="7.4"
        cy="17.6"
        rx="3.1"
        ry="4.7"
        transform="rotate(-36 7.4 17.6)"
        strokeWidth={1.9}
        fill="none"
      />
      <ellipse
        cx="16.6"
        cy="17.6"
        rx="3.1"
        ry="4.7"
        transform="rotate(36 16.6 17.6)"
        strokeWidth={1.9}
        fill="none"
      />
      {/* Inner highlight on each link -- the tube read. */}
      <g stroke={FIRE_ORANGE} strokeWidth={0.65} opacity={0.75} fill="none">
        <ellipse cx="7.4" cy="17.6" rx="1.7" ry="3.3" transform="rotate(-36 7.4 17.6)" />
        <ellipse cx="16.6" cy="17.6" rx="1.7" ry="3.3" transform="rotate(36 16.6 17.6)" />
      </g>
    </GlyphShell>
  );
}

/**
 * The five reference-batch keys, ready to be spread into an icon map. Kept as
 * one export so `badgeVisuals.ts` and `BadgeInspectionModal.tsx` cannot drift
 * apart on which glyph a key resolves to (they previously each maintained
 * their own hand-written copy of these five lines).
 */
export const referenceBatchGlyphs = {
  SpeedComet: IconSpeedComet,
  PerfectionistGem: IconPerfectionistGem,
  PerfectionistGemMythic: IconPerfectionistGemMythic,
  LevelMonument: IconLevelMonument,
  StreakChainLegendary: IconStreakChainLegendary,
} as const;

/* ==========================================================================
 * MOCK-EXAM BADGE ELEVATION -- BATCH 1 (2026-07-27)
 * --------------------------------------------------------------------------
 * 13 hand-drawn marks for the first 5 real mock-exam badge families.
 *
 * KEY DIFFERENCE FROM THE REFERENCE BATCH ABOVE: those five used invented
 * iconName keys precisely so they could not disturb a live badge. These
 * thirteen deliberately REUSE the backend's own iconName strings ("Target",
 * "Scan", "FastForward", ...) because the goal now is to elevate badges
 * students already hold. That is safe here, and only here, because every one
 * of these fifteen iconName values is used by EXACTLY ONE row in
 * backend/app/services/achievements.py -- verified against the seed list. No
 * other badge shares any of these keys, so overriding them in the icon maps
 * cannot change the appearance of a badge outside this batch.
 *
 * Two of the fifteen are not redrawn: "Zap" (Speed Demon BASE) and "Focus"
 * (Perfectionist SUPER) are aliased onto the already-approved reference-batch
 * marks instead, so the real badges finally render as the artwork that was
 * signed off for them.
 *
 * INK vs LIGHT MARKS: three of these badges sit on high-luminance cards
 * (speed_demon_SUPER citron, unstoppable_streak_SUPER vital green,
 * early_bird_SUPER dawn peach) and carry a DARK iconColorHex. Their baked
 * accent colours below are therefore dark too -- a pale accent that reads
 * beautifully on a navy card disappears entirely on a yellow one, and the
 * accents are literal hexes, not `currentColor`, so they do not follow the
 * ink automatically. Each affected glyph flags this in its own comment.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * PERFECTIONIST -- shape narrative: hit the mark -> cut stone -> resolve
 * everything. Escalating precision, three unrelated colours.
 * ------------------------------------------------------------------------ */

/** 1. Target -- Perfectionist BASE (jade). Struck target: three rings, four
 *  reticle ticks, and a dart buried in the bullseye at an angle so the mark
 *  has a direction and an event in it rather than being a passive roundel. */
const TGT_JADE = "#4fd6b4";
const TGT_DEEP = "#0d5a49";
const TGT_HOT = "#eafff9";

export function IconPrecisionTarget(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Depth: the target face, darker toward the rim. */}
      <circle cx="11" cy="13" r="8.6" fill={TGT_DEEP} opacity={0.32} stroke="none" />
      <circle cx="11" cy="13" r="5.1" fill={TGT_JADE} opacity={0.22} stroke="none" />

      {/* Rings. */}
      <circle cx="11" cy="13" r="8.6" strokeWidth={1.5} />
      <circle cx="11" cy="13" r="5.1" strokeWidth={1.15} opacity={0.9} />
      <circle cx="11" cy="13" r="2.1" strokeWidth={1} opacity={0.8} />

      {/* Reticle ticks -- four, breaking the outer ring at the cardinals. */}
      <g strokeWidth={1.35} stroke={TGT_JADE} opacity={0.95}>
        <path d="M11 2.6 L11 5.1" />
        <path d="M11 20.9 L11 23.4" />
        <path d="M0.6 13 L3.1 13" />
        <path d="M18.9 13 L21.4 13" />
      </g>

      {/* The dart, struck in from the upper right. Shaft, then head, then
          fletching -- three separate parts, because a single line reads as a
          scratch on the ring rather than as a projectile. */}
      <path d="M21.6 3.2 L12.1 12.1" strokeWidth={1.7} stroke={TGT_HOT} />
      <path d="M13.6 10.7 L11 13 L12.6 9.6 Z" fill={TGT_HOT} stroke="none" />
      <g strokeWidth={1.25} stroke={TGT_JADE}>
        <path d="M21.6 3.2 L18.4 3.6" />
        <path d="M21.6 3.2 L21.2 6.4" />
      </g>

      {/* Bullseye. */}
      <circle cx="11" cy="13" r="0.95" fill={TGT_HOT} stroke="none" />
    </GlyphShell>
  );
}

/** 2. Scan -- Perfectionist LEGENDARY (azure). Instrument frame: four corner
 *  brackets, a sweep bar mid-travel with its own leading edge, a lattice the
 *  sweep is resolving, and a locked diamond with two confirmed ticks. Where
 *  Target says "I hit it", this says "I resolved all of it". */
const SCN_ICE = "#8fd4ff";
const SCN_DEEP = "#0a3f66";
const SCN_HOT = "#ffffff";

export function IconResolveScan(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Field. */}
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="1.6" fill={SCN_DEEP} opacity={0.3} stroke="none" />

      {/* The lattice being resolved -- deliberately faint and irregular in
          spacing so it reads as data, not as graph paper. */}
      <g stroke={SCN_ICE} strokeWidth={0.6} opacity={0.42}>
        <path d="M3.4 8.2 H20.6" />
        <path d="M3.4 15.8 H20.6" />
        <path d="M8.2 3.4 V20.6" />
        <path d="M15.8 3.4 V20.6" />
      </g>

      {/* Corner brackets -- only the corners, never a closed box: the open
          frame is what makes it read as an instrument reticle. */}
      <g strokeWidth={1.7}>
        <path d="M3.4 8 V4.9 A1.5 1.5 0 0 1 4.9 3.4 H8" />
        <path d="M16 3.4 H19.1 A1.5 1.5 0 0 1 20.6 4.9 V8" />
        <path d="M20.6 16 V19.1 A1.5 1.5 0 0 1 19.1 20.6 H16" />
        <path d="M8 20.6 H4.9 A1.5 1.5 0 0 1 3.4 19.1 V16" />
      </g>

      {/* Sweep bar with a hot leading edge and a decaying wake behind it. */}
      <path d="M3.4 12 H20.6" stroke={SCN_HOT} strokeWidth={1.5} />
      <path d="M3.4 13.5 H20.6" stroke={SCN_ICE} strokeWidth={0.9} opacity={0.55} />
      <path d="M3.4 14.8 H20.6" stroke={SCN_ICE} strokeWidth={0.6} opacity={0.28} />

      {/* Locked target: a diamond, not another circle -- Target already owns
          the circle, and the family must not repeat a primitive. */}
      <path d="M12 8.5 L14.6 11.1 L12 13.7 L9.4 11.1 Z" fill={SCN_ICE} opacity={0.5} stroke={SCN_HOT} strokeWidth={1.05} />
      <circle cx="12" cy="11.1" r="0.75" fill={SCN_HOT} stroke="none" />

      {/* Two resolved confirmations. */}
      <g stroke={SCN_HOT} strokeWidth={1.1} opacity={0.9}>
        <path d="M5.4 17.6 L6.5 18.7 L8.6 16.3" />
        <path d="M15.6 17.6 L16.7 18.7 L18.8 16.3" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * SPEED DEMON -- shape narrative: dart -> twin blades -> full vehicle.
 * ------------------------------------------------------------------------ */

/** 3. FastForward -- Speed Demon SUPER (electric citron).
 *  INK MARK: this sits on the highest-luminance card in the catalogue, so
 *  every baked accent below is a DARK olive, not a pale tint. Twin swept
 *  blades (the double-chevron, rebuilt as raked wings) over four receding
 *  trail bars whose length decays with distance. */
const FF_DARK = "#3c3e0f";
const FF_MID = "#6f7413";
const FF_EDGE = "#161705";

export function IconAfterburnerChevron(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Trail bars -- lengths decay left to right, which is what encodes
          "receding" without needing perspective. */}
      <g stroke={FF_MID} strokeLinecap="round" opacity={0.75}>
        <path d="M0.9 7.4 H5.4" strokeWidth={1.5} />
        <path d="M1.9 12 H5.0" strokeWidth={1.8} />
        <path d="M0.9 16.6 H5.4" strokeWidth={1.5} />
        <path d="M3.4 4.6 H6.2" strokeWidth={0.9} opacity={0.55} />
        <path d="M3.4 19.4 H6.2" strokeWidth={0.9} opacity={0.55} />
      </g>

      {/* Rear blade. */}
      <path d="M6.4 3.8 L14.2 12 L6.4 20.2 L6.4 15.9 L10.1 12 L6.4 8.1 Z" fill={FF_MID} fillOpacity={0.55} stroke={FF_DARK} strokeWidth={1.2} />

      {/* Forward blade -- overlaps the rear one, slightly larger, and its
          leading edge is the hardest line in the mark. */}
      <path d="M13.0 3.0 L21.8 12 L13.0 21.0 L13.0 16.3 L17.3 12 L13.0 7.7 Z" fill={FF_DARK} fillOpacity={0.72} stroke={FF_EDGE} strokeWidth={1.35} />
      <path d="M13.0 3.0 L21.8 12" stroke={FF_EDGE} strokeWidth={1.6} />

      {/* Hot tip. */}
      <circle cx="21.3" cy="12" r="1.15" fill={FF_EDGE} stroke="none" />
    </GlyphShell>
  );
}

/** 4. Rocket -- Speed Demon LEGENDARY (plasma rose). A real vehicle, not an
 *  abstract dart: nose cone, pressurised body with a porthole, two swept fins,
 *  and a three-lobed plume with a white-hot inner core. Two shock rings sit
 *  behind the plume so the thrust reads as ongoing rather than parked. */
const RKT_ROSE = "#ff5f9e";
const RKT_DEEP = "#5e0d30";
const RKT_HOT = "#fff0f6";

export function IconRocketApex(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Plume: three lobes, drawn first so the body sits on them. */}
      <path d="M9.5 16.4 C8.4 19.2 8.9 21.6 12 23.4 C15.1 21.6 15.6 19.2 14.5 16.4 Z" fill={RKT_ROSE} opacity={0.4} stroke="none" />
      <path d="M10.4 16.6 C9.9 18.7 10.4 20.4 12 21.6 C13.6 20.4 14.1 18.7 13.6 16.6 Z" fill={RKT_HOT} opacity={0.85} stroke="none" />

      {/* Shock rings behind the plume. */}
      <g stroke={RKT_ROSE} strokeWidth={0.85} fill="none" opacity={0.6}>
        <path d="M7.6 18.6 Q12 20.4 16.4 18.6" />
        <path d="M8.6 21.2 Q12 22.6 15.4 21.2" />
      </g>

      {/* Fins. */}
      <path d="M9.4 11.4 L5.6 15.2 L5.6 18.4 L9.4 16.2 Z" fill={RKT_DEEP} opacity={0.7} strokeWidth={1.15} />
      <path d="M14.6 11.4 L18.4 15.2 L18.4 18.4 L14.6 16.2 Z" fill={RKT_DEEP} opacity={0.7} strokeWidth={1.15} />

      {/* Body + nose cone as one silhouette. */}
      <path d="M12 0.9 C15.1 4.3 16.3 8.0 16.3 11.6 L16.3 16.9 L7.7 16.9 L7.7 11.6 C7.7 8.0 8.9 4.3 12 0.9 Z" fill={RKT_ROSE} fillOpacity={0.28} strokeWidth={1.45} />
      {/* Cone/body seam. */}
      <path d="M8.3 9.4 Q12 8.2 15.7 9.4" strokeWidth={0.95} opacity={0.75} />
      {/* Porthole. */}
      <circle cx="12" cy="6.3" r="1.9" fill={RKT_DEEP} opacity={0.55} strokeWidth={1.15} />
      <circle cx="11.3" cy="5.7" r="0.6" fill={RKT_HOT} stroke="none" />
      {/* Engine skirt. */}
      <path d="M8.5 16.9 L15.5 16.9" strokeWidth={1.5} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * COMPETITOR -- shape narrative: awarded -> contested -> reigning.
 * ------------------------------------------------------------------------ */

/** 5. Medal -- Competitor BASE (pewter). A struck medallion on a ribbon:
 *  two crossed ribbon straps, a fluted rim (eight cut notches, not a plain
 *  circle), an inner field and a laurel pair. Reads as an object with weight
 *  rather than as a coin outline. */
const MED_STEEL = "#c9c4d6";
const MED_SHADOW = "#4a4756";
const MED_LIGHT = "#f5f2fb";

export function IconStruckMedallion(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Ribbon -- two straps meeting at the disc, one folded behind. */}
      <path d="M7.6 1.2 L11.1 10.4 L8.0 11.6 L4.6 3.0 Z" fill={MED_SHADOW} opacity={0.5} strokeWidth={1.15} />
      <path d="M16.4 1.2 L12.9 10.4 L16.0 11.6 L19.4 3.0 Z" fill={MED_STEEL} opacity={0.4} strokeWidth={1.15} />

      {/* Fluted rim: eight short radial cuts around the disc. */}
      <g stroke={MED_STEEL} strokeWidth={1.1} opacity={0.85}>
        <path d="M12 8.2 L12 9.6" />
        <path d="M17.0 10.3 L15.9 11.2" />
        <path d="M19.1 15.3 L17.7 15.3" />
        <path d="M17.0 20.3 L15.9 19.4" />
        <path d="M12 22.4 L12 21.0" />
        <path d="M7.0 20.3 L8.1 19.4" />
        <path d="M4.9 15.3 L6.3 15.3" />
        <path d="M7.0 10.3 L8.1 11.2" />
      </g>

      {/* Disc. */}
      <circle cx="12" cy="15.3" r="5.7" fill={MED_SHADOW} opacity={0.35} stroke="none" />
      <circle cx="12" cy="15.3" r="5.7" strokeWidth={1.5} />
      <circle cx="12" cy="15.3" r="3.9" strokeWidth={0.9} opacity={0.7} />

      {/* Laurel pair inside the field -- the "awarded" mark. */}
      <g stroke={MED_LIGHT} strokeWidth={1.05} fill="none">
        <path d="M10.1 17.6 Q8.9 15.2 10.4 12.9" />
        <path d="M13.9 17.6 Q15.1 15.2 13.6 12.9" />
      </g>
      <circle cx="12" cy="15.6" r="0.85" fill={MED_LIGHT} stroke="none" />
    </GlyphShell>
  );
}

/** 6. Flag -- Competitor SUPER (signal red). A planted race banner: mast with
 *  a ground spike, a fly with a real double-curve ripple (one curve is a
 *  cartoon, two is cloth), a checker block in the hoist and a swallow-tail
 *  notch on the fly edge. */
const FLG_RED = "#ff5b5b";
const FLG_DEEP = "#5a0303";
const FLG_LIGHT = "#ffe9e9";

export function IconStartBanner(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Cloth: hoist edge straight on the mast, fly edge notched, top and
          bottom edges rippling in opposite phase. */}
      <path
        d="M6.6 3.0 C10.4 1.5 14.2 4.5 18.0 3.0 L20.4 3.0 L17.6 7.4 L20.4 11.8 L18.0 11.8 C14.2 13.3 10.4 10.3 6.6 11.8 Z"
        fill={FLG_RED}
        fillOpacity={0.34}
        strokeWidth={1.4}
      />

      {/* Checker block in the hoist corner -- 2x2, alternating. */}
      <g stroke="none">
        <rect x="7.1" y="4.0" width="2.4" height="2.4" fill={FLG_LIGHT} opacity={0.9} />
        <rect x="9.5" y="6.4" width="2.4" height="2.4" fill={FLG_LIGHT} opacity={0.9} />
        <rect x="9.5" y="4.0" width="2.4" height="2.4" fill={FLG_DEEP} opacity={0.55} />
        <rect x="7.1" y="6.4" width="2.4" height="2.4" fill={FLG_DEEP} opacity={0.55} />
      </g>

      {/* Ripple shading -- one soft fold line following the cloth's curve. */}
      <path d="M13.4 3.4 C13.9 6.6 13.0 9.2 13.4 12.2" stroke={FLG_DEEP} strokeWidth={0.85} opacity={0.55} fill="none" />

      {/* Mast, finial and ground spike. */}
      <path d="M6.6 1.4 L6.6 21.4" strokeWidth={1.7} />
      <circle cx="6.6" cy="1.4" r="1.15" fill={FLG_LIGHT} stroke="none" />
      <path d="M6.6 21.4 L5.1 23.0 M6.6 21.4 L8.1 23.0" strokeWidth={1.3} stroke={FLG_RED} />
      {/* Ground line, so the banner is planted rather than floating. */}
      <path d="M2.9 21.4 H10.3" strokeWidth={1.1} opacity={0.6} />
    </GlyphShell>
  );
}

/** 7. Crown -- Competitor LEGENDARY (imperial gold). Five spires each capped
 *  with its own orb, an arched band beneath them carrying three gem lozenges,
 *  and a pearl trim row. The arch matters: a flat band reads as a paper hat. */
const CRN_GOLD = "#f0c74a";
const CRN_DEEP = "#4a3a06";
const CRN_LIGHT = "#fff6d8";

export function IconSovereignCrown(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Crown body: five peaks, four valleys, sitting on an arched band. */}
      <path
        d="M2.2 6.2 L5.6 11.2 L8.8 4.6 L12 10.4 L15.2 4.6 L18.4 11.2 L21.8 6.2 L20.4 17.6 Q12 19.4 3.6 17.6 Z"
        fill={CRN_GOLD}
        fillOpacity={0.3}
        strokeWidth={1.45}
      />

      {/* Orb caps -- one per spire, decreasing size toward the outside so the
          centre spire reads as the tallest even though the peaks are level. */}
      <circle cx="2.2" cy="6.2" r="1.25" fill={CRN_LIGHT} stroke="none" />
      <circle cx="8.8" cy="4.2" r="1.05" fill={CRN_LIGHT} stroke="none" />
      <circle cx="12" cy="2.6" r="1.5" fill={CRN_LIGHT} stroke="none" />
      <circle cx="15.2" cy="4.2" r="1.05" fill={CRN_LIGHT} stroke="none" />
      <circle cx="21.8" cy="6.2" r="1.25" fill={CRN_LIGHT} stroke="none" />
      {/* Centre spire rises to its orb. */}
      <path d="M12 4.2 L12 10.4" strokeWidth={1.1} opacity={0.7} />

      {/* Arched band. */}
      <path d="M3.6 17.6 Q12 19.4 20.4 17.6" strokeWidth={1.5} />
      <path d="M3.9 14.5 Q12 16.3 20.1 14.5" strokeWidth={1.15} opacity={0.8} />

      {/* Three gem lozenges set into the band. */}
      <g stroke="none">
        <path d="M12 15.0 L13.5 16.4 L12 17.8 L10.5 16.4 Z" fill={CRN_LIGHT} />
        <path d="M7.2 14.9 L8.4 16.1 L7.2 17.3 L6.0 16.1 Z" fill={CRN_GOLD} opacity={0.95} />
        <path d="M16.8 14.9 L18.0 16.1 L16.8 17.3 L15.6 16.1 Z" fill={CRN_GOLD} opacity={0.95} />
      </g>

      {/* Pearl trim along the bottom edge. */}
      <g fill={CRN_DEEP} opacity={0.6} stroke="none">
        <circle cx="6.0" cy="18.4" r="0.55" />
        <circle cx="9.0" cy="18.9" r="0.55" />
        <circle cx="12" cy="19.05" r="0.55" />
        <circle cx="15.0" cy="18.9" r="0.55" />
        <circle cx="18.0" cy="18.4" r="0.55" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * UNSTOPPABLE STREAK -- shape narrative: ignition -> the pulse it produces ->
 * the loop that never closes. None of the three may read as orange fire; the
 * separate `unstoppable_streak_chain` demo badge owns that.
 * ------------------------------------------------------------------------ */

/** 8. Flame -- Unstoppable Streak BASE (cobalt). A cold flame, drawn with the
 *  temperature gradient inverted on purpose: dark cobalt body, white-blue core,
 *  and a row of ignition sparks at the base. A secondary tongue licks off to
 *  one side so the silhouette is not symmetrical (symmetrical fire reads as a
 *  leaf). */
const CF_COBALT = "#5f74ee";
const CF_DEEP = "#101a52";
const CF_CORE = "#eaf0ff";

export function IconColdFlame(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Outer body. */}
      <path
        d="M12 1.1 C16.3 5.6 17.9 8.6 17.9 12.2 C17.9 16.6 15.2 19.7 12 19.7 C8.8 19.7 6.1 16.6 6.1 12.2 C6.1 8.6 7.7 5.6 12 1.1 Z"
        fill={CF_DEEP}
        fillOpacity={0.55}
        strokeWidth={1.45}
      />
      {/* Secondary tongue -- breaks the symmetry. */}
      <path
        d="M16.6 7.4 C19.4 9.7 19.9 12.0 18.9 14.4 C18.2 12.2 17.5 10.6 16.0 9.4 Z"
        fill={CF_COBALT}
        fillOpacity={0.45}
        strokeWidth={1}
      />

      {/* Mid mantle. */}
      <path
        d="M12 6.0 C14.6 8.8 15.5 10.6 15.5 12.6 C15.5 15.2 13.9 17.1 12 17.1 C10.1 17.1 8.5 15.2 8.5 12.6 C8.5 10.6 9.4 8.8 12 6.0 Z"
        fill={CF_COBALT}
        fillOpacity={0.6}
        stroke={CF_COBALT}
        strokeWidth={0.9}
      />

      {/* White-blue core -- the hottest part, and the whole conceit. */}
      <path
        d="M12 10.2 C13.3 11.7 13.7 12.7 13.7 13.7 C13.7 15.0 12.9 15.9 12 15.9 C11.1 15.9 10.3 15.0 10.3 13.7 C10.3 12.7 10.7 11.7 12 10.2 Z"
        fill={CF_CORE}
        stroke="none"
      />

      {/* Ignition sparks at the base. */}
      <g fill={CF_COBALT} stroke="none">
        <circle cx="8.2" cy="21.2" r="0.85" opacity={0.9} />
        <circle cx="12" cy="22.4" r="1.05" opacity={0.75} />
        <circle cx="15.8" cy="21.2" r="0.85" opacity={0.9} />
        <circle cx="5.4" cy="19.6" r="0.55" opacity={0.55} />
        <circle cx="18.6" cy="19.6" r="0.55" opacity={0.55} />
      </g>
    </GlyphShell>
  );
}

/** 9. Activity -- Unstoppable Streak SUPER (vital green).
 *  INK MARK: bright card, so accents are dark greens. A cardiac trace inside a
 *  monitor bezel: baseline, P bump, a tall QRS spike, T bump, a marker dot
 *  riding the peak, and a faded echo of the previous beat behind it. */
const VT_DARK = "#0f3e1d";
const VT_MID = "#1a6b32";
const VT_EDGE = "#062611";

export function IconVitalTrace(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Monitor bezel. */}
      <rect x="1.5" y="4.6" width="21" height="14.8" rx="2.4" fill={VT_DARK} opacity={0.16} strokeWidth={1.35} />
      {/* Screen inset. */}
      <rect x="3.1" y="6.2" width="17.8" height="11.6" rx="1.4" stroke={VT_MID} strokeWidth={0.7} opacity={0.5} fill="none" />

      {/* Echo of the previous beat -- shifted left and faded. */}
      <path
        d="M3.4 13.4 H5.3 L6.2 11.9 L7.1 13.4 H8.3 L9.6 6.9 L11.0 18.4 L12.1 13.4"
        stroke={VT_MID}
        strokeWidth={1.05}
        opacity={0.3}
        fill="none"
      />

      {/* Live trace. */}
      <path
        d="M3.4 13.4 H8.6 L9.5 11.9 L10.4 13.4 H11.6 L13.0 6.9 L14.4 18.4 L15.5 13.4 H20.6"
        stroke={VT_EDGE}
        strokeWidth={1.75}
        fill="none"
      />

      {/* Marker riding the QRS peak. */}
      <circle cx="13.0" cy="6.9" r="1.5" fill={VT_EDGE} stroke="none" />
      <circle cx="13.0" cy="6.9" r="2.5" stroke={VT_MID} strokeWidth={0.8} fill="none" opacity={0.65} />
    </GlyphShell>
  );
}

/** 10. Infinity -- Unstoppable Streak LEGENDARY (orchid). The lemniscate drawn
 *  as a RIBBON rather than a line: two offset strokes with a crossing plate at
 *  the waist that makes the over/under legible, plus two light nodes running
 *  the loop on opposite lobes so the shape reads as in motion. */
const INF_ORCHID = "#ffa8ec";
const INF_DEEP = "#6b0455";
const INF_HOT = "#ffffff";

export function IconEndlessRibbon(props: BadgeGlyphProps) {
  const LOOP =
    "M12 12 C9.6 8.0 7.0 6.3 4.7 7.2 C2.0 8.2 1.4 11.8 3.2 13.9 C5.3 16.4 9.0 15.6 12 12 C15.0 8.4 18.7 7.6 20.8 10.1 C22.6 12.2 22.0 15.8 19.3 16.8 C17.0 17.7 14.4 16.0 12 12 Z";
  return (
    <GlyphShell {...props}>
      {/* Ribbon body. */}
      <path d={LOOP} fill={INF_DEEP} fillOpacity={0.35} stroke="none" />
      {/* Outer edge. */}
      <path d={LOOP} strokeWidth={1.7} />
      {/* Inner edge, scaled slightly toward the centre -- the two edges
          together are what make this a band rather than a wire. */}
      <g transform="translate(12 12) scale(0.72) translate(-12 -12)">
        <path d={LOOP} stroke={INF_ORCHID} strokeWidth={1.5} opacity={0.75} fill="none" />
      </g>

      {/* Crossing plate at the waist -- resolves the over/under. */}
      <path d="M10.1 9.9 L13.9 14.1" stroke={INF_DEEP} strokeWidth={2.6} opacity={0.85} />
      <path d="M10.1 14.1 L13.9 9.9" stroke={INF_HOT} strokeWidth={1.5} />

      {/* Two light nodes, on opposite lobes. */}
      <circle cx="3.6" cy="10.4" r="1.35" fill={INF_HOT} stroke="none" />
      <circle cx="20.4" cy="13.6" r="1.35" fill={INF_ORCHID} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * EARLY BIRD -- shape narrative: the dial you beat -> the sun you beat it to
 * -> the alarm that never had to go off.
 * ------------------------------------------------------------------------ */

/** 11. Clock -- Early Bird BASE (antique bronze). A pocket-watch dial: heavy
 *  bezel, a winder stub at 1 o'clock, twelve ticks (four long), hands set to
 *  just before five, and a low sunrise arc behind the bottom of the case so
 *  the "early" is in the picture and not only in the name. */
const CLK_BRASS = "#d9a75a";
const CLK_DEEP = "#3a2810";
const CLK_LIGHT = "#ffeccd";

export function IconDawnDial(props: BadgeGlyphProps) {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const long = i % 3 === 0;
    const r1 = long ? 6.2 : 6.9;
    const r2 = 7.8;
    ticks.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * r1).toFixed(2)} ${(12.6 + Math.sin(a) * r1).toFixed(2)} L${(12 + Math.cos(a) * r2).toFixed(2)} ${(12.6 + Math.sin(a) * r2).toFixed(2)}`}
        strokeWidth={long ? 1.25 : 0.7}
        opacity={long ? 0.95 : 0.6}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      {/* Sunrise arc behind the case. */}
      <path d="M1.6 20.6 A10.4 10.4 0 0 1 22.4 20.6" stroke={CLK_BRASS} strokeWidth={1.05} opacity={0.4} fill="none" />
      <path d="M0.8 20.6 H23.2" stroke={CLK_BRASS} strokeWidth={1.15} opacity={0.55} />

      {/* Winder stub at 1 o'clock. */}
      <path d="M17.6 5.0 L19.6 3.0" strokeWidth={1.9} stroke={CLK_BRASS} />
      <circle cx="20.1" cy="2.5" r="1.15" fill={CLK_BRASS} stroke="none" />

      {/* Case. */}
      <circle cx="12" cy="12.6" r="9.3" fill={CLK_DEEP} opacity={0.34} stroke="none" />
      <circle cx="12" cy="12.6" r="9.3" strokeWidth={1.6} />
      <circle cx="12" cy="12.6" r="8.0" strokeWidth={0.8} opacity={0.55} />

      {/* Ticks. */}
      <g stroke={CLK_BRASS}>{ticks}</g>

      {/* Hands -- just before five, i.e. the hour this badge is about. */}
      <path d="M12 12.6 L12 6.8" strokeWidth={1.5} stroke={CLK_LIGHT} />
      <path d="M12 12.6 L15.4 16.6" strokeWidth={1.9} stroke={CLK_LIGHT} />
      <circle cx="12" cy="12.6" r="1.05" fill={CLK_LIGHT} stroke="none" />
    </GlyphShell>
  );
}

/** 12. Sun -- Early Bird SUPER (dawn peach).
 *  INK MARK: pale card, so all accents are dark umber. A half-risen disc
 *  breaking a horizon, seven rays of alternating length, and a second faint
 *  line under the horizon reading as reflected light. */
const SUN_INK = "#3e220f";
const SUN_MID = "#8b4718";
const SUN_WARM = "#c26a24";

export function IconSunrise(props: BadgeGlyphProps) {
  const rays = [];
  // 7 rays across the upper half only -- a full 360 corona would read as the
  // midday sun, and this badge is specifically about the moment it clears the
  // horizon.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    const long = i % 2 === 0;
    const r1 = 7.4;
    const r2 = long ? 11.0 : 9.6;
    rays.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * r1).toFixed(2)} ${(16.4 + Math.sin(a) * r1).toFixed(2)} L${(12 + Math.cos(a) * r2).toFixed(2)} ${(16.4 + Math.sin(a) * r2).toFixed(2)}`}
        strokeWidth={long ? 1.6 : 1.05}
        opacity={long ? 0.95 : 0.65}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      <g stroke={SUN_MID}>{rays}</g>

      {/* Disc, clipped by the horizon -- drawn as a half-round path rather
          than a circle behind a bar, so there is no seam to misalign. */}
      <path d="M6.6 16.4 A5.4 5.4 0 0 1 17.4 16.4 Z" fill={SUN_WARM} opacity={0.42} stroke="none" />
      <path d="M6.6 16.4 A5.4 5.4 0 0 1 17.4 16.4" strokeWidth={1.6} stroke={SUN_INK} fill="none" />
      {/* Bright core. */}
      <path d="M9.4 16.4 A2.6 2.6 0 0 1 14.6 16.4 Z" fill={SUN_INK} opacity={0.75} stroke="none" />

      {/* Horizon, plus a shorter reflected line beneath it. */}
      <path d="M1.4 16.4 H22.6" strokeWidth={1.8} stroke={SUN_INK} />
      <path d="M5.0 19.2 H19.0" strokeWidth={1.1} stroke={SUN_MID} opacity={0.6} />
      <path d="M8.2 21.6 H15.8" strokeWidth={0.85} stroke={SUN_MID} opacity={0.35} />
    </GlyphShell>
  );
}

/** 13. AlarmClock -- Early Bird LEGENDARY (blue-hour petrol). Twin bells, a
 *  striker between them, splayed legs, and two ring arcs on each side. The
 *  hands are set to 4:20-ish and the ring arcs are drawn mid-strike, so the
 *  mark is a moment rather than a product shot. */
const ALM_TEAL = "#4fc3d1";
const ALM_DEEP = "#04262b";
const ALM_LIGHT = "#e6fbff";

export function IconAlarmReveille(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Ring arcs -- two per side, the outer one fainter. */}
      <g stroke={ALM_TEAL} fill="none">
        <path d="M2.9 5.4 A4.4 4.4 0 0 0 1.6 9.0" strokeWidth={1.15} opacity={0.85} />
        <path d="M1.5 3.2 A7.2 7.2 0 0 0 0.3 9.4" strokeWidth={0.8} opacity={0.45} />
        <path d="M21.1 5.4 A4.4 4.4 0 0 1 22.4 9.0" strokeWidth={1.15} opacity={0.85} />
        <path d="M22.5 3.2 A7.2 7.2 0 0 1 23.7 9.4" strokeWidth={0.8} opacity={0.45} />
      </g>

      {/* Bells. */}
      <path d="M3.4 6.6 A2.9 2.9 0 0 1 8.4 4.0 L5.6 8.2 Z" fill={ALM_TEAL} fillOpacity={0.45} strokeWidth={1.2} />
      <path d="M20.6 6.6 A2.9 2.9 0 0 0 15.6 4.0 L18.4 8.2 Z" fill={ALM_TEAL} fillOpacity={0.45} strokeWidth={1.2} />
      {/* Striker bridging the two bells, over the case. */}
      <path d="M8.6 4.6 Q12 1.8 15.4 4.6" strokeWidth={1.3} opacity={0.8} fill="none" />

      {/* Case. */}
      <circle cx="12" cy="13.6" r="7.6" fill={ALM_DEEP} opacity={0.4} stroke="none" />
      <circle cx="12" cy="13.6" r="7.6" strokeWidth={1.6} />
      <circle cx="12" cy="13.6" r="6.2" strokeWidth={0.8} opacity={0.55} />

      {/* Four cardinal ticks only -- the dial is small here and twelve would
          fill in to a grey ring at card size. */}
      <g stroke={ALM_TEAL} strokeWidth={1.1} opacity={0.9}>
        <path d="M12 8.2 V9.5" />
        <path d="M17.4 13.6 H16.1" />
        <path d="M12 19.0 V17.7" />
        <path d="M6.6 13.6 H7.9" />
      </g>

      {/* Hands. */}
      <path d="M12 13.6 L9.0 11.4" strokeWidth={1.7} stroke={ALM_LIGHT} />
      <path d="M12 13.6 L14.0 17.2" strokeWidth={1.35} stroke={ALM_LIGHT} />
      <circle cx="12" cy="13.6" r="0.95" fill={ALM_LIGHT} stroke="none" />

      {/* Splayed legs. */}
      <path d="M6.6 19.6 L4.2 22.8" strokeWidth={1.6} />
      <path d="M17.4 19.6 L19.8 22.8" strokeWidth={1.6} />
    </GlyphShell>
  );
}

/**
 * Batch-1 keys, spread into the icon maps AFTER the stock lucide block so they
 * win the lookup. Unlike `referenceBatchGlyphs` these are existing backend
 * iconName strings -- see the block comment at the top of this section for why
 * that is safe (each key is owned by exactly one badge row).
 *
 * `Zap` and `Focus` intentionally alias the reference-batch marks rather than
 * getting new artwork: those two badges' visual identity was already approved,
 * and this just connects the live badge to it.
 */
export const mockExamBatch1Glyphs = {
  // Perfectionist
  Target: IconPrecisionTarget,
  Focus: IconPerfectionistGem,
  Scan: IconResolveScan,
  // Speed Demon
  Zap: IconSpeedComet,
  FastForward: IconAfterburnerChevron,
  Rocket: IconRocketApex,
  // Competitor
  Medal: IconStruckMedallion,
  Flag: IconStartBanner,
  Crown: IconSovereignCrown,
  // Unstoppable Streak
  Flame: IconColdFlame,
  Activity: IconVitalTrace,
  Infinity: IconEndlessRibbon,
  // Early Bird
  Clock: IconDawnDial,
  Sun: IconSunrise,
  AlarmClock: IconAlarmReveille,
} as const;

/* ==========================================================================
 * MOCK-EXAM BADGE ELEVATION -- BATCH 2 (2026-07-27)
 * --------------------------------------------------------------------------
 * The remaining 5 real mock-exam families: comeback_kid, podium_finisher,
 * sharpshooter, underdog and polymath (display name "High Achiever" -- the
 * backend `code` really is `polymath`). 15 more hand-drawn marks, same rules
 * as batch 1:
 *
 *   - each of these 15 iconName strings is owned by EXACTLY ONE badge row in
 *     backend/app/services/achievements.py, so overriding them in the icon maps
 *     cannot change any badge outside this batch;
 *   - complexity escalates BASE -> SUPER -> LEGENDARY inside a family, and the
 *     three marks in a family never repeat a primitive (this is the same rule
 *     that stops Perfectionist's Target/Gem/Scan reading as one icon);
 *   - accent hexes are BAKED, not `currentColor`, so they do not follow the
 *     badge's ink. Three badges in this batch sit on high-luminance cards
 *     (comeback_kid_LEGENDARY incandescent rose, podium_finisher_BASE pale
 *     laurel, sharpshooter_LEGENDARY ice) and therefore carry DARK accents.
 *     Each of the three flags this in its own comment.
 *
 * DELIBERATE SEPARATIONS FROM BATCH 1 (checked mark by mark):
 *   - `Crosshair` (sharpshooter BASE) must not restate `Target` (perfectionist
 *     BASE). Target is a struck archery face with a dart in it; Crosshair is an
 *     optical reticle with a mil-dot ladder and a time-elapsed arc, because
 *     this badge is about accuracy AND clock discipline, not about the hit.
 *   - `Radar` (sharpshooter LEGENDARY) must not restate `Scan` (perfectionist
 *     LEGENDARY). Scan is a rectangular instrument frame resolving a lattice;
 *     Radar is polar -- range rings, a rotating sweep wedge and live contacts.
 *   - `Trophy` (podium BASE) must not restate `Medal` (competitor BASE). Medal
 *     is a struck disc on a ribbon; Trophy is the podium itself, three blocks
 *     seen in elevation with the standings implied by their heights.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * COMEBACK KID -- shape narrative: the trough you climbed out of -> the
 * ceiling you broke through -> the surge that no longer needs a reason.
 * ------------------------------------------------------------------------ */

/** 1. TrendingUp -- Comeback Kid BASE (ember rust). The badge is literally
 *  "score >20% better than last time", so the mark is a plotted result curve:
 *  a ghosted previous run, a dashed datum at the old score, a live line that
 *  drops into a marked trough and then climbs steeply through the datum with a
 *  real arrowhead. The trough is the point -- an arrow that only goes up would
 *  be a Speed Demon mark, not a comeback. */
const CBK_EMBER = "#e8703f";
const CBK_DEEP = "#2c0f0b";
const CBK_HOT = "#ffd9c9";

export function IconComebackArc(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Axes -- only two sides, so it reads as a chart rather than a box. */}
      <path d="M2.6 2.4 V21.2 H21.8" strokeWidth={1.15} opacity={0.55} />

      {/* Datum: the previous exam's score. Dashed, because it is a memory. */}
      <path d="M2.6 11.4 H21.8" stroke={CBK_EMBER} strokeWidth={0.9} strokeDasharray="2 2.2" opacity={0.75} />

      {/* Ghost of the previous run -- flat and low, under everything. */}
      <path d="M4.2 12.6 L8.4 13.4 L12.6 12.9 L16.8 13.6 L20.6 13.1" stroke={CBK_EMBER} strokeWidth={1} opacity={0.28} fill="none" />

      {/* Live run: fall, floor, climb. The climb is drawn steeper than the
          fall so the eye reads recovery, not symmetry. */}
      <path d="M4.2 8.6 L7.4 13.0 L9.8 17.4" strokeWidth={1.75} opacity={0.85} />
      <path d="M9.8 17.4 L13.2 12.2 L16.4 8.0 L19.4 4.4" strokeWidth={2} stroke={CBK_HOT} fill="none" />

      {/* Trough marker -- a ringed dot at the lowest point. */}
      <circle cx="9.8" cy="17.4" r="1.05" fill={CBK_DEEP} stroke={CBK_EMBER} strokeWidth={1} />

      {/* Arrowhead, drawn as a filled wedge on the line's own bearing. */}
      <path d="M19.4 4.4 L15.6 5.6 L18.0 8.5 Z" fill={CBK_HOT} stroke="none" />

      {/* Crossing spark: where the climb passes the old score. */}
      <circle cx="14.9" cy="11.4" r="1.55" fill={CBK_EMBER} opacity={0.35} stroke="none" />
      <circle cx="14.9" cy="11.4" r="0.7" fill={CBK_HOT} stroke="none" />
    </GlyphShell>
  );
}

/** 2. ArrowUpRight -- Comeback Kid SUPER (vermillion flare). Three comebacks,
 *  so the mark is a wedge punching THROUGH a fractured ceiling slab: the slab
 *  is broken into displaced pieces, shards fly outward from the breach, and
 *  the shaft carries three notches (one per comeback). A bare diagonal arrow
 *  is a UI affordance; this is an event. */
const CBS_DEEP = "#7a0d18";
const CBS_HOT = "#ffe3e6";
const CBS_MID = "#ff9aa2";

export function IconBreakthroughWedge(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* The ceiling, broken into three displaced slabs with a gap where the
          wedge went through. Each piece is rotated slightly off-level. */}
      <g strokeWidth={1.3} stroke={CBS_MID} fill={CBS_DEEP} fillOpacity={0.45}>
        <path d="M1.4 14.6 L8.2 13.4 L8.9 15.8 L2.1 17.0 Z" />
        <path d="M15.8 12.0 L22.4 10.6 L23.0 13.0 L16.4 14.4 Z" />
      </g>

      {/* Shards thrown out of the breach -- three, all on outward bearings. */}
      <g fill={CBS_MID} stroke="none" opacity={0.9}>
        <path d="M9.6 12.0 L11.2 10.7 L10.2 13.1 Z" />
        <path d="M14.6 14.6 L16.6 14.0 L15.2 16.1 Z" />
        <path d="M8.8 17.4 L10.6 17.6 L9.0 18.9 Z" />
      </g>

      {/* Hero wedge, climbing to the upper right. Body first, then the hard
          leading edge, so the edge stays the sharpest line in the mark. */}
      <path d="M20.6 2.2 L21.2 9.4 L14.6 9.0 Z" fill={CBS_HOT} stroke="none" />
      <path d="M20.6 2.2 L6.2 21.4 L4.2 18.8 L18.4 1.0 Z" fill={CBS_DEEP} fillOpacity={0.55} strokeWidth={1.4} />
      <path d="M20.6 2.2 L4.2 18.8" strokeWidth={1.6} stroke={CBS_HOT} />

      {/* Three notches on the shaft -- one per recorded comeback. */}
      <g stroke={CBS_HOT} strokeWidth={1.15} opacity={0.95}>
        <path d="M9.0 15.2 L11.0 16.6" />
        <path d="M11.6 12.2 L13.6 13.6" />
        <path d="M14.2 9.2 L16.2 10.6" />
      </g>
    </GlyphShell>
  );
}

/** 3. ChevronsUp -- Comeback Kid LEGENDARY (incandescent rose).
 *  INK MARK: pale card, so every accent below is a deep wine, not a tint.
 *  Five stacked chevrons whose width and weight DECAY upward, riding a rising
 *  column of heat, with two swept updraft lines either side. The decay is what
 *  turns a stack of identical arrows into an accelerating surge. */
const CBL_INK = "#4a1024";
const CBL_MID = "#8c2247";
const CBL_WARM = "#c24a6e";

export function IconSurgeChevrons(props: BadgeGlyphProps) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <GlyphShell {...props}>
      {/* Updraft: two long swept lines, opposite curvature. */}
      <path d="M5.2 22.6 Q3.6 15.0 6.4 7.6" stroke={CBL_WARM} strokeWidth={1} opacity={0.55} fill="none" />
      <path d="M18.8 22.6 Q20.4 15.0 17.6 7.6" stroke={CBL_WARM} strokeWidth={1} opacity={0.55} fill="none" />

      {/* Heat column behind the stack. */}
      <path d="M9.4 22.4 Q12 16.5 12 9.4 Q12 16.5 14.6 22.4 Z" fill={CBL_WARM} opacity={0.22} stroke="none" />

      {/* Five chevrons, decaying in half-width and stroke as they climb. */}
      {rows.map((i) => {
        const y = 20.4 - i * 3.9;
        const half = 7.4 - i * 1.15;
        const rise = 3.0 - i * 0.28;
        const w = 2.1 - i * 0.26;
        return (
          <path
            key={i}
            d={`M${(12 - half).toFixed(2)} ${y.toFixed(2)} L12 ${(y - rise).toFixed(2)} L${(12 + half).toFixed(2)} ${y.toFixed(2)}`}
            stroke={i === 4 ? CBL_INK : CBL_MID}
            strokeWidth={w}
            opacity={0.55 + i * 0.11}
            fill="none"
          />
        );
      })}

      {/* Apex spark -- the top of the surge. */}
      <circle cx="12" cy="2.6" r="1.35" fill={CBL_INK} stroke="none" />
      <circle cx="12" cy="2.6" r="2.5" stroke={CBL_MID} strokeWidth={0.75} fill="none" opacity={0.6} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * PODIUM FINISHER -- laurel, not metal. Competitor already owns pewter, signal
 * red and imperial gold; a second metal family would read as its reskin. The
 * through-line here is the wreath: pale laurel -> gilt laurel -> the closed
 * champion's crown.
 * ------------------------------------------------------------------------ */

/** 4. Trophy -- Podium Finisher BASE (pale laurel).
 *  INK MARK: this card is high-key, so accents are deep olive.
 *  The PODIUM, not a cup: three blocks in 1-2-3 order with the centre tallest,
 *  numerals implied by block height, a small cup on the winner's block and a
 *  laurel sprig laid across the front edge. Deliberately shares no primitive
 *  with competitor BASE's struck medallion. */
const PDB_INK = "#31381f";
const PDB_LEAF = "#5c6a3a";
const PDB_DEEP = "#232a13";

export function IconPodiumSteps(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Floor line the blocks stand on. */}
      <path d="M1.2 20.6 H22.8" strokeWidth={1.35} stroke={PDB_INK} />

      {/* Blocks: 2nd (left), 1st (centre, tallest), 3rd (right, shortest). */}
      <g strokeWidth={1.35} stroke={PDB_INK}>
        <rect x="2.2" y="12.6" width="6.4" height="8.0" fill={PDB_LEAF} fillOpacity={0.35} />
        <rect x="8.6" y="9.0" width="6.8" height="11.6" fill={PDB_LEAF} fillOpacity={0.55} />
        <rect x="15.4" y="14.8" width="6.4" height="5.8" fill={PDB_LEAF} fillOpacity={0.22} />
      </g>
      {/* Front-face shading breaks, so the blocks have thickness. */}
      <g stroke={PDB_DEEP} strokeWidth={0.75} opacity={0.55}>
        <path d="M2.2 14.6 H8.6" />
        <path d="M8.6 11.0 H15.4" />
        <path d="M15.4 16.8 H21.8" />
      </g>

      {/* The cup on the winner's block -- small, because the podium is the
          subject and the cup is the annotation. */}
      <path d="M10.3 3.2 H13.7 V5.4 A1.7 1.7 0 0 1 10.3 5.4 Z" fill={PDB_INK} opacity={0.85} strokeWidth={1.05} stroke={PDB_INK} />
      <path d="M10.3 3.9 A1.25 1.25 0 0 0 8.9 5.1" strokeWidth={0.95} stroke={PDB_INK} fill="none" />
      <path d="M13.7 3.9 A1.25 1.25 0 0 1 15.1 5.1" strokeWidth={0.95} stroke={PDB_INK} fill="none" />
      <path d="M12 7.0 V8.4 M10.4 8.4 H13.6" strokeWidth={1.15} stroke={PDB_INK} />

      {/* Laurel sprig laid across the winner's block face. */}
      <g stroke={PDB_DEEP} strokeWidth={0.9} fill="none" opacity={0.9}>
        <path d="M9.4 17.6 Q12 15.4 14.6 17.6" />
        <path d="M10.4 17.0 Q10.0 16.0 11.1 15.9" />
        <path d="M12.0 16.2 Q12.0 15.1 13.0 15.2" />
        <path d="M13.6 17.0 Q14.0 16.0 12.9 15.9" />
      </g>
    </GlyphShell>
  );
}

/** 5. Star -- Podium Finisher SUPER (gilt laurel). A five-point star held in an
 *  OPEN laurel wreath: two mirrored branches with four leaves each, meeting at
 *  a tie at the bottom and left open at the top. Five pips ring the star, one
 *  per required podium finish. The star is a true five-point construction, not
 *  a sparkle. */
const PDS_DEEP = "#2e3d01";
const PDS_LIGHT = "#d9f27a";

export function IconLaurelStar(props: BadgeGlyphProps) {
  const pips = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return (
      <circle
        key={i}
        cx={(12 + Math.cos(a) * 9.4).toFixed(2)}
        cy={(11.4 + Math.sin(a) * 9.4).toFixed(2)}
        r={0.62}
        fill={PDS_LIGHT}
        opacity={0.9}
        stroke="none"
      />
    );
  });
  return (
    <GlyphShell {...props}>
      {/* Wreath branches. */}
      <g strokeWidth={1.3} fill="none">
        <path d="M12 21.4 Q4.0 19.4 3.4 10.6" />
        <path d="M12 21.4 Q20.0 19.4 20.6 10.6" />
      </g>
      {/* Leaves -- four per side, angled outward along the branch. */}
      <g fill={PDS_LIGHT} opacity={0.85} stroke="none">
        <path d="M5.0 18.2 Q2.9 17.4 3.2 15.3 Q5.4 16.1 5.0 18.2 Z" />
        <path d="M3.9 15.0 Q1.9 13.8 2.5 11.8 Q4.6 12.9 3.9 15.0 Z" />
        <path d="M3.5 11.6 Q2.0 9.9 3.0 8.1 Q4.8 9.6 3.5 11.6 Z" />
        <path d="M7.0 19.9 Q5.1 19.6 4.9 17.6 Q7.0 17.9 7.0 19.9 Z" />
        <path d="M19.0 18.2 Q21.1 17.4 20.8 15.3 Q18.6 16.1 19.0 18.2 Z" />
        <path d="M20.1 15.0 Q22.1 13.8 21.5 11.8 Q19.4 12.9 20.1 15.0 Z" />
        <path d="M20.5 11.6 Q22.0 9.9 21.0 8.1 Q19.2 9.6 20.5 11.6 Z" />
        <path d="M17.0 19.9 Q18.9 19.6 19.1 17.6 Q17.0 17.9 17.0 19.9 Z" />
      </g>
      {/* Tie at the bottom of the wreath. */}
      <path d="M10.4 21.6 H13.6" strokeWidth={1.5} stroke={PDS_LIGHT} />

      {pips}

      {/* Five-point star: outer/inner radius construction. */}
      <path
        d={(() => {
          const pts = [];
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? 6.4 : 2.6;
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(11.4 + Math.sin(a) * r).toFixed(2)}`);
          }
          return "M" + pts.join(" L") + " Z";
        })()}
        fill={PDS_DEEP}
        fillOpacity={0.45}
        strokeWidth={1.4}
      />
      {/* Interior facets, so the star has a fold rather than being a decal. */}
      <g strokeWidth={0.8} opacity={0.7}>
        <path d="M12 5.0 L12 17.8" />
        <path d="M6.1 9.3 L17.9 9.3" />
      </g>
      <circle cx="12" cy="11.4" r="1.0" fill={PDS_LIGHT} stroke="none" />
    </GlyphShell>
  );
}

/** 6. Sparkles -- Podium Finisher LEGENDARY, "The Champion" (imperial laurel).
 *  The wreath CLOSES. A full circular laurel crown, twelve leaves, a jewelled
 *  clasp at the tie, a numeral I standing in the centre and eight radiating
 *  light spokes of alternating length behind it. Where SUPER's wreath is open
 *  and holds something, this one is sealed and is the object. */
const PDL_LEAF = "#4ad46a";
const PDL_HOT = "#d8ffe1";
const PDL_DEEP = "#00280a";

export function IconChampionWreath(props: BadgeGlyphProps) {
  const leaves = [];
  for (let i = 0; i < 12; i++) {
    // Skip the two positions at the very bottom -- that is where the clasp is.
    if (i === 5 || i === 6) continue;
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const cx = 12 + Math.cos(a) * 8.4;
    const cy = 12 + Math.sin(a) * 8.4;
    const deg = (a * 180) / Math.PI + 90;
    leaves.push(
      <path
        key={i}
        d="M0 -2.3 Q1.5 -0.6 0 2.3 Q-1.5 -0.6 0 -2.3 Z"
        transform={`translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg.toFixed(1)})`}
        fill={PDL_LEAF}
        opacity={0.85}
        stroke="none"
      />
    );
  }
  const spokes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r2 = i % 2 === 0 ? 11.6 : 10.2;
    spokes.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * 6.0).toFixed(2)} ${(12 + Math.sin(a) * 6.0).toFixed(2)} L${(12 + Math.cos(a) * r2).toFixed(2)} ${(12 + Math.sin(a) * r2).toFixed(2)}`}
        strokeWidth={i % 2 === 0 ? 1.05 : 0.65}
        opacity={i % 2 === 0 ? 0.6 : 0.35}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      <g stroke={PDL_LEAF}>{spokes}</g>

      {/* Crown ring. */}
      <circle cx="12" cy="12" r="8.4" strokeWidth={1.35} opacity={0.9} />
      {leaves}

      {/* Jewelled clasp at the tie. */}
      <path d="M12 18.6 L14.0 20.4 L12 22.2 L10.0 20.4 Z" fill={PDL_HOT} stroke="none" />
      <circle cx="12" cy="20.4" r="0.7" fill={PDL_DEEP} stroke="none" />

      {/* Numeral I -- first place, serifed so it reads as a numeral and not as
          a stray rule. */}
      <g strokeWidth={1.7} stroke={PDL_HOT}>
        <path d="M12 7.4 V16.2" />
        <path d="M9.6 7.4 H14.4" />
        <path d="M9.6 16.2 H14.4" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * SHARPSHOOTER -- optics, not archery. Three instruments in escalating order:
 * the reticle you aim through, the iris that gathers the light, the radar that
 * has already found everything.
 * ------------------------------------------------------------------------ */

/** 7. Crosshair -- Sharpshooter BASE (gunmetal). The badge is "100% accuracy
 *  while using >90% of your time", so the mark carries BOTH: an optical
 *  reticle (fine cross, mil-dot ladder, four floating corner ticks, centre
 *  pip) sitting inside a time arc that is drawn almost all the way round with
 *  a hot tick at its head. Explicitly NOT perfectionist BASE's struck target:
 *  no rings of colour, no dart, no impact. */
const SSB_STEEL = "#8f97b8";
const SSB_DEEP = "#1a1a24";
const SSB_HOT = "#ffffff";

export function IconPrecisionReticle(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Time arc -- ~92% of a full turn, open at the top, with a hot head.
          This is the ">90% of your time" half of the badge. */}
      <path
        d="M12 1.6 A10.4 10.4 0 1 1 9.4 1.9"
        stroke={SSB_STEEL}
        strokeWidth={1.5}
        opacity={0.7}
        fill="none"
      />
      <circle cx="9.4" cy="1.9" r="1.15" fill={SSB_HOT} stroke="none" />

      {/* Optic body. */}
      <circle cx="12" cy="12" r="7.6" fill={SSB_DEEP} opacity={0.4} stroke="none" />
      <circle cx="12" cy="12" r="7.6" strokeWidth={1.35} />

      {/* Fine cross -- broken at the centre so the pip is readable. */}
      <g strokeWidth={1.05}>
        <path d="M12 4.8 V9.6" />
        <path d="M12 14.4 V19.2" />
        <path d="M4.8 12 H9.6" />
        <path d="M14.4 12 H19.2" />
      </g>

      {/* Mil-dot ladder on the lower stadia -- five graduated ticks. */}
      <g stroke={SSB_STEEL} strokeWidth={1} opacity={0.9}>
        <path d="M10.8 14.9 H13.2" />
        <path d="M11.1 16.2 H12.9" />
        <path d="M11.3 17.5 H12.7" />
      </g>
      <g stroke={SSB_STEEL} strokeWidth={0.9} opacity={0.7}>
        <path d="M6.9 11.0 V13.0" />
        <path d="M17.1 11.0 V13.0" />
      </g>

      {/* Four floating corner ticks -- the acquisition box, unattached to the
          optic so it reads as an overlay rather than as part of the barrel. */}
      <g strokeWidth={1.25} stroke={SSB_HOT} opacity={0.85}>
        <path d="M6.0 8.4 V6.6 H7.8" />
        <path d="M18.0 8.4 V6.6 H16.2" />
        <path d="M6.0 15.6 V17.4 H7.8" />
        <path d="M18.0 15.6 V17.4 H16.2" />
      </g>

      {/* Centre pip. */}
      <circle cx="12" cy="12" r="1.0" fill={SSB_HOT} stroke="none" />
    </GlyphShell>
  );
}

/** 8. Aperture -- Sharpshooter SUPER (steel). Six real iris blades, each a
 *  swept quadrilateral rotated 60 degrees from the last, leaving a hexagonal
 *  pupil. Two lens-element ellipses sit behind the barrel ring and a single
 *  specular streak crosses the glass, which is what stops it reading as a flat
 *  hexagon pattern. */
const SSS_DEEP = "#1f363b";
const SSS_ICE = "#bfe2ea";

export function IconApertureIris(props: BadgeGlyphProps) {
  const blades = [];
  for (let i = 0; i < 6; i++) {
    const deg = i * 60;
    blades.push(
      <path
        key={i}
        d="M0 -8.6 L6.6 -5.4 L2.4 -2.4 L-1.9 -3.9 Z"
        transform={`translate(12 12) rotate(${deg})`}
        fill={SSS_ICE}
        fillOpacity={i % 2 === 0 ? 0.42 : 0.24}
        stroke={SSS_ICE}
        strokeWidth={0.9}
        strokeOpacity={0.85}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      {/* Barrel ring. */}
      <circle cx="12" cy="12" r="10.2" strokeWidth={1.45} />
      <circle cx="12" cy="12" r="8.9" strokeWidth={0.7} opacity={0.55} />

      {/* Lens elements seen edge-on behind the blades. */}
      <ellipse cx="12" cy="12" rx="9.6" ry="3.0" stroke={SSS_DEEP} strokeWidth={0.8} opacity={0.45} fill="none" />
      <ellipse cx="12" cy="12" rx="6.4" ry="1.9" stroke={SSS_DEEP} strokeWidth={0.7} opacity={0.35} fill="none" />

      {/* Blades. */}
      {blades}

      {/* Pupil. */}
      <path
        d={(() => {
          const pts = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            pts.push(`${(12 + Math.cos(a) * 3.0).toFixed(2)} ${(12 + Math.sin(a) * 3.0).toFixed(2)}`);
          }
          return "M" + pts.join(" L") + " Z";
        })()}
        fill={SSS_DEEP}
        fillOpacity={0.85}
        stroke={SSS_ICE}
        strokeWidth={1.05}
      />
      <circle cx="12" cy="12" r="1.05" fill={SSS_ICE} stroke="none" />

      {/* Specular streak across the glass. */}
      <path d="M6.4 16.4 L14.6 6.4" stroke={SSS_ICE} strokeWidth={1.15} opacity={0.5} />
    </GlyphShell>
  );
}

/** 9. Radar -- Sharpshooter LEGENDARY (ice).
 *  INK MARK: the brightest card in this batch, so accents are deep teal.
 *  A POLAR instrument, deliberately unlike perfectionist LEGENDARY's
 *  rectangular scan frame: three range rings, twelve bearing ticks, a swept
 *  wedge with a decaying wake, three contacts at different ranges and a lock
 *  bracket on the nearest of them. */
const SSL_INK = "#0b3a30";
const SSL_MID = "#177f6c";
const SSL_DEEP = "#04211b";

export function IconRadarSweep(props: BadgeGlyphProps) {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 3 === 0;
    const r1 = long ? 8.6 : 9.3;
    ticks.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * r1).toFixed(2)} ${(12 + Math.sin(a) * r1).toFixed(2)} L${(12 + Math.cos(a) * 10.2).toFixed(2)} ${(12 + Math.sin(a) * 10.2).toFixed(2)}`}
        strokeWidth={long ? 1.2 : 0.65}
        opacity={long ? 0.95 : 0.6}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      {/* Scope face. */}
      <circle cx="12" cy="12" r="10.2" fill={SSL_MID} opacity={0.14} stroke="none" />
      <circle cx="12" cy="12" r="10.2" strokeWidth={1.4} />
      <circle cx="12" cy="12" r="6.8" strokeWidth={0.85} opacity={0.6} />
      <circle cx="12" cy="12" r="3.4" strokeWidth={0.85} opacity={0.45} />
      <g stroke={SSL_MID}>{ticks}</g>

      {/* Sweep wedge, plus a fainter wake behind it -- the wedge is a real
          pie slice so the leading edge is hard and the trailing edge is not. */}
      <path d="M12 12 L21.6 8.6 A10.2 10.2 0 0 0 19.2 4.8 Z" fill={SSL_MID} opacity={0.45} stroke="none" />
      <path d="M12 12 L19.2 4.8 A10.2 10.2 0 0 0 15.4 2.4 Z" fill={SSL_MID} opacity={0.2} stroke="none" />
      <path d="M12 12 L21.6 8.6" strokeWidth={1.5} stroke={SSL_INK} />

      {/* Contacts at three ranges. */}
      <circle cx="8.0" cy="15.6" r="1.25" fill={SSL_INK} stroke="none" />
      <circle cx="15.2" cy="16.4" r="0.85" fill={SSL_DEEP} opacity={0.75} stroke="none" />
      <circle cx="7.4" cy="8.4" r="0.7" fill={SSL_DEEP} opacity={0.55} stroke="none" />

      {/* Lock bracket on the nearest contact. */}
      <g strokeWidth={1.1} stroke={SSL_INK}>
        <path d="M5.6 13.4 V12.2 H6.8" />
        <path d="M10.4 13.4 V12.2 H9.2" />
        <path d="M5.6 17.8 V19.0 H6.8" />
        <path d="M10.4 17.8 V19.0 H9.2" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * UNDERDOG -- grit. Three objects that have all taken damage and held:
 * the shield that got hit, the anchor that did not drag, the ridge that got
 * climbed anyway.
 * ------------------------------------------------------------------------ */

/** 10. Shield -- Underdog BASE (basalt). A heater shield that has clearly been
 *  USED: the rim is notched in two places, two impact scars cross the face,
 *  a row of rivets runs the border and a single chevron device sits in the
 *  chief. The damage is asymmetric on purpose -- symmetrical damage reads as
 *  pattern. */
const UDB_STONE = "#9c9578";
const UDB_DEEP = "#1d1b12";
const UDB_HOT = "#e8e2cd";

export function IconBatteredShield(props: BadgeGlyphProps) {
  const SHIELD =
    "M12 1.6 L21.2 4.6 L21.2 11.6 C21.2 17.2 17.2 21.0 12 22.6 C6.8 21.0 2.8 17.2 2.8 11.6 L2.8 4.6 Z";
  return (
    <GlyphShell {...props}>
      <path d={SHIELD} fill={UDB_DEEP} fillOpacity={0.5} strokeWidth={1.5} />
      {/* Inner border + rivets. */}
      <path
        d="M12 3.6 L19.3 6.0 L19.3 11.6 C19.3 16.2 16.1 19.4 12 20.7 C7.9 19.4 4.7 16.2 4.7 11.6 L4.7 6.0 Z"
        strokeWidth={0.75}
        opacity={0.55}
        fill="none"
      />
      <g fill={UDB_STONE} stroke="none" opacity={0.85}>
        <circle cx="12" cy="3.0" r="0.5" />
        <circle cx="17.6" cy="5.0" r="0.5" />
        <circle cx="20.4" cy="9.6" r="0.5" />
        <circle cx="3.6" cy="9.6" r="0.5" />
        <circle cx="6.4" cy="5.0" r="0.5" />
        <circle cx="17.9" cy="16.4" r="0.5" />
        <circle cx="6.1" cy="16.4" r="0.5" />
      </g>

      {/* Two notches taken out of the rim. */}
      <path d="M21.2 8.0 L18.6 9.4 L21.2 10.6 Z" fill={UDB_DEEP} stroke={UDB_STONE} strokeWidth={0.9} />
      <path d="M8.5 21.4 L10.2 19.4 L11.6 21.9 Z" fill={UDB_DEEP} stroke={UDB_STONE} strokeWidth={0.85} opacity={0.9} />

      {/* Impact scars -- two, crossing, different weights. */}
      <path d="M6.6 8.2 L15.4 15.4" stroke={UDB_HOT} strokeWidth={1.3} opacity={0.85} />
      <path d="M15.8 7.4 L10.6 12.6" stroke={UDB_HOT} strokeWidth={0.9} opacity={0.6} />

      {/* Chevron device in the chief. */}
      <path d="M7.8 7.0 L12 4.6 L16.2 7.0" strokeWidth={1.5} stroke={UDB_STONE} fill="none" />
    </GlyphShell>
  );
}

/** 11. Anchor -- Underdog SUPER (weathered tan). An admiralty anchor drawn as
 *  a real piece of ironwork: shackle ring, stock across the shank, curved arms
 *  ending in barbed flukes, and a rope that actually WRAPS the shank (two
 *  passes, one crossing behind) before running off to a seabed line. The
 *  seabed matters -- an anchor floating in space has not held anything. */
const UDS_DEEP = "#3b2618";
const UDS_ROPE = "#e3c6ac";

export function IconAnchorHold(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Seabed. */}
      <path d="M1.4 21.8 H22.6" strokeWidth={1.1} stroke={UDS_DEEP} opacity={0.65} />
      <path d="M4.2 21.8 Q7.4 19.4 10.4 21.8" strokeWidth={0.8} stroke={UDS_DEEP} opacity={0.4} fill="none" />

      {/* Shackle ring. */}
      <circle cx="12" cy="3.1" r="2.0" strokeWidth={1.45} />
      {/* Shank. */}
      <path d="M12 5.1 V19.4" strokeWidth={1.9} />
      {/* Stock. */}
      <path d="M6.9 8.0 H17.1" strokeWidth={1.6} />
      <path d="M6.9 7.1 V8.9 M17.1 7.1 V8.9" strokeWidth={1.2} />

      {/* Arms + barbed flukes. */}
      <path d="M12 19.4 C7.8 19.4 4.4 16.6 3.9 12.4" strokeWidth={1.55} fill="none" />
      <path d="M12 19.4 C16.2 19.4 19.6 16.6 20.1 12.4" strokeWidth={1.55} fill="none" />
      <path d="M3.9 12.4 L1.9 14.6 L6.0 15.0 Z" fill={UDS_ROPE} stroke="none" />
      <path d="M20.1 12.4 L22.1 14.6 L18.0 15.0 Z" fill={UDS_ROPE} stroke="none" />
      {/* Crown at the base of the shank. */}
      <path d="M9.9 19.4 H14.1" strokeWidth={1.5} />

      {/* Rope: one pass in front, one behind, then off to the left. */}
      <g stroke={UDS_ROPE} strokeWidth={1.15} fill="none">
        <path d="M15.4 10.6 Q10.4 11.9 13.2 13.6" />
        <path d="M13.2 13.6 Q17.0 14.6 14.2 16.4" />
        <path d="M15.4 10.6 Q18.4 9.6 19.4 6.6" />
        <path d="M14.2 16.4 Q9.2 18.4 4.6 20.6" opacity={0.8} />
      </g>
      <path d="M11.2 12.4 L13.0 11.6" stroke={UDS_DEEP} strokeWidth={1.5} opacity={0.7} />
    </GlyphShell>
  );
}

/** 12. Mountain -- Underdog LEGENDARY (granite moss). A ridge in THREE depth
 *  planes (far/mid/near) rather than one silhouette, a snow cap broken by
 *  exposed rock, a switchback route climbing the near face, and a summit cairn
 *  with a pennant. The switchback is what makes it a climb rather than a
 *  landscape. */
const UDL_DEEP = "#2a2e17";
const UDL_SNOW = "#eef1de";
const UDL_MOSS = "#a8b184";

export function IconSummitRidge(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Far ridge. */}
      <path d="M0.8 17.4 L5.6 9.8 L9.4 14.6 L12.6 10.4 L17.0 16.2 L23.2 8.6 L23.2 17.4 Z" fill={UDL_MOSS} opacity={0.22} stroke="none" />

      {/* Mid ridge. */}
      <path d="M1.4 20.4 L7.6 11.0 L12.2 17.2 L15.4 13.2 L22.6 20.4 Z" fill={UDL_DEEP} opacity={0.4} stroke={UDL_MOSS} strokeWidth={0.9} />

      {/* Near massif -- the hero. */}
      <path d="M2.4 21.8 L11.2 4.2 L20.6 21.8 Z" fill={UDL_DEEP} fillOpacity={0.55} strokeWidth={1.5} />

      {/* Snow cap, broken by two exposed rock teeth. */}
      <path d="M8.0 10.6 L11.2 4.2 L14.6 11.0 L12.9 9.6 L11.6 11.2 L10.1 9.4 Z" fill={UDL_SNOW} stroke="none" opacity={0.95} />

      {/* Switchback route up the near face. */}
      <path
        d="M6.6 20.4 L10.6 18.8 L7.9 16.4 L11.6 14.6 L9.3 12.4 L11.2 10.4"
        stroke={UDL_SNOW}
        strokeWidth={1}
        strokeDasharray="1.8 1.4"
        opacity={0.85}
        fill="none"
      />

      {/* Summit cairn + pennant. */}
      <path d="M11.2 4.2 V1.2" strokeWidth={1.2} stroke={UDL_SNOW} />
      <path d="M11.2 1.2 L15.0 2.3 L11.2 3.4 Z" fill={UDL_SNOW} stroke="none" />

      {/* Ground line. */}
      <path d="M0.8 21.8 H23.2" strokeWidth={1.15} opacity={0.7} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * HIGH ACHIEVER (backend code `polymath`) -- intellect, and specifically
 * BREADTH: a lattice of connected ideas, the moment one of them lights, and
 * the architecture that holds all of them.
 * ------------------------------------------------------------------------ */

/** 13. Brain -- High Achiever BASE (lapis ink). NOT the lucide brain outline:
 *  the silhouette is filled as a soft under-layer and the interior is a plexus
 *  -- eight nodes joined by edges, with the corpus-callosum split drawn as a
 *  single vertical seam. Reads as "a connected mind", which is the badge's
 *  actual claim (breadth), rather than as an anatomy icon. */
const PMB_DEEP = "#2c1c36";
const PMB_LILAC = "#c9a8dc";

export function IconMindLattice(props: BadgeGlyphProps) {
  const nodes: [number, number, number][] = [
    [7.4, 7.6, 1.15],
    [11.0, 5.6, 0.9],
    [15.4, 7.4, 1.05],
    [5.8, 12.0, 0.95],
    [9.8, 11.2, 1.3],
    [14.6, 12.2, 1.0],
    [8.0, 16.4, 1.05],
    [13.4, 16.8, 0.9],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 5], [4, 5], [3, 6], [4, 6], [5, 7], [6, 7], [4, 7],
  ];
  return (
    <GlyphShell {...props}>
      {/* Cranial silhouette, filled -- the container for the lattice. */}
      <path
        d="M12 2.4 C16.9 2.4 20.8 5.8 20.8 10.6 C20.8 13.2 19.9 14.8 19.9 16.6 C19.9 19.4 17.6 21.6 14.4 21.6 C12.9 21.6 12 21.0 12 21.0 C12 21.0 11.1 21.6 9.6 21.6 C6.4 21.6 4.1 19.4 4.1 16.6 C4.1 14.8 3.2 13.2 3.2 10.6 C3.2 5.8 7.1 2.4 12 2.4 Z"
        fill={PMB_DEEP}
        fillOpacity={0.5}
        strokeWidth={1.4}
      />
      {/* Hemisphere seam. */}
      <path d="M12 3.2 V21.0" strokeWidth={0.85} opacity={0.55} strokeDasharray="1.6 1.4" />

      {/* Edges, then nodes -- paint order is what makes the nodes sit on top. */}
      <g stroke={PMB_LILAC} strokeWidth={0.8} opacity={0.75}>
        {edges.map(([a, b], i) => (
          <path key={i} d={`M${nodes[a][0]} ${nodes[a][1]} L${nodes[b][0]} ${nodes[b][1]}`} />
        ))}
      </g>
      <g stroke="none">
        {nodes.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i === 4 ? "#ffffff" : PMB_LILAC} opacity={i === 4 ? 1 : 0.9} />
        ))}
      </g>
      {/* Halo on the hub node. */}
      <circle cx="9.8" cy="11.2" r="2.6" stroke={PMB_LILAC} strokeWidth={0.7} fill="none" opacity={0.6} />
    </GlyphShell>
  );
}

/** 14. Lightbulb -- High Achiever SUPER (periwinkle). The filament is the
 *  point: inside the glass it is drawn as a small CONSTELLATION (five stars
 *  joined by fine lines) rather than as a coil, which ties the mark to BASE's
 *  lattice without repeating it. Screw base with three thread ridges, and six
 *  short emission rays of alternating length outside the glass. */
const PMS_DEEP = "#3b1d78";
const PMS_HOT = "#ffffff";

export function IconInsightLamp(props: BadgeGlyphProps) {
  const rays = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    const long = i % 2 === 0;
    rays.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * 8.4).toFixed(2)} ${(9.6 + Math.sin(a) * 8.4).toFixed(2)} L${(12 + Math.cos(a) * (long ? 11.4 : 10.2)).toFixed(2)} ${(9.6 + Math.sin(a) * (long ? 11.4 : 10.2)).toFixed(2)}`}
        strokeWidth={long ? 1.35 : 0.85}
        opacity={long ? 0.9 : 0.55}
      />
    );
  }
  const stars: [number, number][] = [
    [12, 5.4],
    [9.0, 8.2],
    [15.0, 8.4],
    [10.4, 12.0],
    [13.8, 11.6],
  ];
  return (
    <GlyphShell {...props}>
      <g stroke={PMS_HOT}>{rays}</g>

      {/* Glass envelope. */}
      <path
        d="M12 1.4 C16.1 1.4 19.4 4.6 19.4 8.7 C19.4 11.6 17.6 13.4 16.5 14.8 C15.8 15.7 15.5 16.3 15.5 17.2 L8.5 17.2 C8.5 16.3 8.2 15.7 7.5 14.8 C6.4 13.4 4.6 11.6 4.6 8.7 C4.6 4.6 7.9 1.4 12 1.4 Z"
        fill={PMS_DEEP}
        fillOpacity={0.45}
        strokeWidth={1.4}
      />

      {/* Constellation filament. */}
      <g stroke={PMS_HOT} strokeWidth={0.75} opacity={0.8}>
        <path d="M12 5.4 L9.0 8.2 L10.4 12.0 L13.8 11.6 L15.0 8.4 Z" />
        <path d="M12 5.4 L13.8 11.6" opacity={0.6} />
      </g>
      <g fill={PMS_HOT} stroke="none">
        {stars.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 1.15 : 0.75} />
        ))}
      </g>

      {/* Screw base with three thread ridges. */}
      <g strokeWidth={1.3}>
        <path d="M8.8 18.4 H15.2" />
        <path d="M9.1 20.2 H14.9" />
        <path d="M10.2 22.0 H13.8" />
      </g>
    </GlyphShell>
  );
}

/** 15. Library -- High Achiever LEGENDARY (imperial violet). Architecture, not
 *  a book: a two-storey stack seen head-on inside a stone arch, twelve spines
 *  of varying width and height, a single volume pulled proud of the shelf and
 *  an open book on the reading desk below throwing light up the arch. The one
 *  pulled-out volume is what keeps it from being wallpaper. */
const PML_DEEP = "#2a0525";
const PML_LIGHT = "#f0c7e8";
const PML_ORCHID = "#d878c8";

export function IconGreatLibrary(props: BadgeGlyphProps) {
  // Deterministic spine widths -- no Math.random, this renders on every card.
  const upper = [1.5, 1.1, 1.8, 1.3, 1.0, 1.6];
  const lower = [1.2, 1.7, 1.1, 1.5, 1.4, 1.1];
  const spines = (xs: number[], y: number, h: number, key: string) => {
    let x = 4.6;
    return xs.map((w, i) => {
      const hh = h - (i % 3) * 0.9;
      const el = (
        <rect
          key={`${key}${i}`}
          x={x.toFixed(2)}
          y={(y + (h - hh)).toFixed(2)}
          width={w.toFixed(2)}
          height={hh.toFixed(2)}
          fill={i % 2 === 0 ? PML_ORCHID : PML_DEEP}
          fillOpacity={i % 2 === 0 ? 0.75 : 0.6}
          stroke={PML_LIGHT}
          strokeWidth={0.55}
        />
      );
      x += w + 0.55;
      return el;
    });
  };
  return (
    <GlyphShell {...props}>
      {/* Stone arch. */}
      <path d="M2.6 21.6 V10.4 A9.4 9.4 0 0 1 21.4 10.4 V21.6" strokeWidth={1.45} fill="none" />
      <path d="M4.2 21.6 V10.6 A7.8 7.8 0 0 1 19.8 10.6 V21.6" strokeWidth={0.7} opacity={0.5} fill="none" />

      {/* Two shelves of spines. */}
      <g stroke="none">{spines(upper, 8.4, 4.6, "u")}</g>
      <path d="M4.0 13.4 H20.0" strokeWidth={1.15} />
      <g stroke="none">{spines(lower, 14.2, 4.2, "l")}</g>
      <path d="M4.0 18.7 H20.0" strokeWidth={1.15} />

      {/* One volume pulled proud of the upper shelf. */}
      <rect x="15.9" y="7.0" width="1.7" height="6.0" fill={PML_LIGHT} stroke={PML_DEEP} strokeWidth={0.55} />

      {/* Open book on the desk, throwing light. */}
      <path d="M12 22.4 L7.4 20.9 L7.4 19.2 L12 20.7 Z" fill={PML_LIGHT} stroke="none" />
      <path d="M12 22.4 L16.6 20.9 L16.6 19.2 L12 20.7 Z" fill={PML_ORCHID} stroke="none" opacity={0.9} />
      <path d="M12 20.7 V22.4" strokeWidth={0.85} stroke={PML_DEEP} />
      <g stroke={PML_LIGHT} strokeWidth={0.75} opacity={0.5}>
        <path d="M12 19.4 V17.4" />
        <path d="M9.6 19.8 L8.4 18.2" />
        <path d="M14.4 19.8 L15.6 18.2" />
      </g>
    </GlyphShell>
  );
}

/**
 * Batch-2 keys. Same contract as `mockExamBatch1Glyphs`: these are the
 * BACKEND's own iconName strings, each owned by exactly one AchievementBadge
 * row, spread into the icon maps after the (now empty) stock lucide block so
 * they are the only definition of those keys.
 */
export const mockExamBatch2Glyphs = {
  // Comeback Kid
  TrendingUp: IconComebackArc,
  ArrowUpRight: IconBreakthroughWedge,
  ChevronsUp: IconSurgeChevrons,
  // Podium Finisher
  Trophy: IconPodiumSteps,
  Star: IconLaurelStar,
  Sparkles: IconChampionWreath,
  // Sharpshooter
  Crosshair: IconPrecisionReticle,
  Aperture: IconApertureIris,
  Radar: IconRadarSweep,
  // Underdog
  Shield: IconBatteredShield,
  Anchor: IconAnchorHold,
  Mountain: IconSummitRidge,
  // High Achiever (backend code `polymath`)
  Brain: IconMindLattice,
  Lightbulb: IconInsightLamp,
  Library: IconGreatLibrary,
} as const;
