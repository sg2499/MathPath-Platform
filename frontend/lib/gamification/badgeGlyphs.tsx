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
 * PHASE 3 (2026-07-29) -- Level Mastery, per-level icons.
 * OPUS ELEVATION PASS (2026-07-29, second pass): the first build of these 15
 * glyphs got the *structure* right -- per-level silhouettes, and a real
 * BASE -> SUPER -> LEGENDARY escalation within each level -- but every
 * LEGENDARY tier reached for the SAME flourish: a 6-ray radial starburst
 * whose ray offsets were literally identical numbers in all five families
 * (+/-3.3,-1.7 and +/-4.7,+0.9 off the anchor), plus the same twin diamond
 * flares and the same dashed line at y=22.6. That is a template, not five
 * designs, and LEGENDARY is precisely the badge a student screenshots.
 *
 * What is PRESERVED (this is the project convention, arrived at after
 * Shailesh rejected an all-tiers-recoloured version -- "the student should
 * feel the difference and that should make them feel good being a higher
 * achievement"):
 *   BASE       -- hollow outline only, zero fill anywhere, sparsest glyph.
 *   SUPER      -- solid single-tone fill + a soft glow + exactly one extra
 *                 structural detail. Calm, finished, but single-tone.
 *   LEGENDARY  -- two-band layered fill + light that deliberately BREAKS PAST
 *                 the glyph's own silhouette and past the 24x24 viewBox edge
 *                 + a small particle scatter + an environmental echo.
 *
 * What CHANGED: the *form* that escaping light takes is now argued per badge
 * from what the badge is actually about, and every one of the five escapes
 * the frame along a different axis:
 *   BM-L1   -- a bridge is about SPANNING, so its apex light runs HORIZONTALLY
 *              along the deck and exits both side edges. Plus real suspension
 *              hangers and pier-top lanterns.
 *   MM-L1   -- a summit at night: AURORA ribbons sweeping across the sky out
 *              of both side edges, one 4-point concave beacon star piercing
 *              the top edge, a varied starfield, a secondary ridge.
 *   YLM-L1  -- germination is the only motif here that acts DOWNWARD: the
 *              seed coat splits into two parted halves, roots break past the
 *              BOTTOM edge and the shoot's first leaves break past the TOP.
 *              Both vertical extremes, which nothing else in the set does.
 *   YLM-L2  -- water: dew droplets on the leaf tips, one drop falling in
 *              through the TOP edge, grass blades arcing out of both side
 *              edges, an impact ripple on the soil. No radial rays at all.
 *   YLM-L3  -- dispersal: six CURVED stamens with anthers (built from one
 *              path rotated 6x at 60deg, deliberately off-phase from the 5
 *              petals at 72deg so it reads organic), and a true Archimedean
 *              pollen spiral of nine decaying motes that exits the RIGHT edge.
 *
 * Colours are unchanged from the first pass and remain the real
 * verify-badge-colour-distinctness.mjs numbers (0 FAIL); see the
 * LEVEL_MASTERY_NEW block in that script for each pick's rationale.
 *
 * THIRD PASS (2026-07-30) -- render-and-look. The two passes above were both
 * argued from the code; this one rendered all 15 glyphs to real SVG at badge
 * size, on their real gradients, and judged them side by side. Three findings,
 * two acted on:
 *   1. YLM-L1 was plainly the worst mark in the set. The "asymmetric bean with
 *      a hilum notch" read as a potato at 130px, and its LEGENDARY jagged
 *      crack read as a lightning bolt through a walnut. Rebuilt as a symmetric
 *      OGIVE with a curved suture -- see the SEED_BODY block below. Container
 *      clip-path and the 3D husk radius were re-cut to match.
 *   2. BM-L1 LEGENDARY had two real defects, both invisible in source: the 4
 *      suspension ties at strokeWidth 0.75/alpha 0.85 closed the arch void and
 *      read as a portcullis, and the "water reflection" arc was drawn at a
 *      radius that put almost all of it outside the 24x24 viewBox, surviving
 *      on screen as two disconnected squiggles. Both fixed in place.
 *   3. MM-L1, YLM-L2 and YLM-L3 held up at size and were left alone. Saying so
 *      is part of the judgement, not an omission from it.
 * ------------------------------------------------------------------------ */

/* ==========================================================================
 * BM-L1 -- a single stone arch (bridge). BM is the shortest, single-level
 * alternate entry path into IM, so the motif is a CROSSING: two piers, a
 * deck, one arch, and (at the apex tier) light that travels along the span.
 * ========================================================================== */
const BRIDGE_PLUM = "#7d123d";
const BRIDGE_MAGENTA = "#cf17aa";
const BRIDGE_ROSE = "#dfa69f";
const BRIDGE_MIST = "#f3d4ce";

// Shared arch geometry, so all three tiers are provably the same structure:
// outer radius 6.4 and inner radius 4.9 about (12, 8.6) -- a true semicircular
// voussoir band springing from the pier tops at x=5.6 and x=18.4.
const ARCH_OUTER = "M5.6 8.6 A6.4 6.4 0 0 1 18.4 8.6";
const ARCH_BAND = "M5.6 8.6 A6.4 6.4 0 0 1 18.4 8.6 L18.4 8.6 A4.9 4.9 0 0 0 5.6 8.6 Z";
const ARCH_BAND_INNER = "M7.1 8.6 A4.9 4.9 0 0 1 16.9 8.6 L16.9 8.6 A3.4 3.4 0 0 0 7.1 8.6 Z";

export function IconLevelMasteryBmL1Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Piers -- outline only, no fill. Nothing here reads as "finished"
          yet. */}
      <path d="M2.2 8.6 L2.2 20.6 L5.6 20.6 L5.6 8.6 Z" strokeWidth={1.15} />
      <path d="M18.4 8.6 L18.4 20.6 L21.8 20.6 L21.8 8.6 Z" strokeWidth={1.15} />

      {/* Plain deck, no parapet railing. */}
      <path d="M1 8.6 H23" strokeWidth={1.5} />

      {/* The arch -- outline only, unfilled, no keystone. */}
      <path d={ARCH_OUTER} fill="none" strokeWidth={1.6} />
    </GlyphShell>
  );
}

export function IconLevelMasteryBmL1Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Piers, now solidly filled -- a finished structure, not a sketch. */}
      <path d="M2.2 8.6 L2.2 20.6 L5.6 20.6 L5.6 8.6 Z" fill={BRIDGE_PLUM} opacity={0.55} stroke="none" />
      <path d="M18.4 8.6 L18.4 20.6 L21.8 20.6 L21.8 8.6 Z" fill={BRIDGE_MAGENTA} opacity={0.55} stroke="none" />
      <path d="M2.2 8.6 L2.2 20.6 L5.6 20.6 L5.6 8.6 Z" strokeWidth={1.15} />
      <path d="M18.4 8.6 L18.4 20.6 L21.8 20.6 L21.8 8.6 Z" strokeWidth={1.15} />

      {/* The arch, solidly filled -- one even wash, calm and finished. */}
      <path d={ARCH_BAND} fill={BRIDGE_MAGENTA} opacity={0.4} stroke="none" />
      <path d={ARCH_OUTER} fill="none" strokeWidth={1.6} />

      {/* Deck + parapet railing -- BASE's plain bar becomes a real railing. */}
      <path d="M1 8.6 H23" strokeWidth={1.5} />
      <g strokeWidth={0.9} opacity={0.75}>
        <path d="M3.9 8.6 L3.9 7.1" />
        <path d="M7.4 8.6 L7.4 7.1" />
        <path d="M10.9 8.6 L10.9 7.1" />
        <path d="M13.1 8.6 L13.1 7.1" />
        <path d="M16.6 8.6 L16.6 7.1" />
        <path d="M20.1 8.6 L20.1 7.1" />
      </g>

      {/* Soft single glow at the crown -- the first hint of "lit up". */}
      <circle cx="12" cy="3.1" r="2.4" fill={BRIDGE_MAGENTA} opacity={0.3} stroke="none" />
      {/* Keystone -- set at the true crown of the band (between r=6.4 and
          r=4.9), not floating in the opening. The arch is now a completed
          crossing. */}
      <path d="M10.6 2.2 L13.4 2.2 L12.9 4 L11.1 4 Z" fill={BRIDGE_PLUM} stroke="none" />
      <path d="M10.6 2.2 L13.4 2.2 L12.9 4 L11.1 4 Z" strokeWidth={0.85} />
    </GlyphShell>
  );
}

export function IconLevelMasteryBmL1Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* SPAN-LIGHT. A bridge's axis is horizontal, so this family's escaping
          light travels ALONG the deck and exits both side edges of the
          viewBox -- it does not radiate isotropically. Drawn first so the
          structure sits on top of it. */}
      <g strokeLinecap="round" fill="none">
        <path d="M12 8.6 H26.4" stroke={BRIDGE_ROSE} strokeWidth={1.9} opacity={0.45} />
        <path d="M12 8.6 H-2.4" stroke={BRIDGE_ROSE} strokeWidth={1.9} opacity={0.45} />
        <path d="M12 7.5 H25.2" stroke={BRIDGE_MIST} strokeWidth={0.65} opacity={0.7} />
        <path d="M12 9.7 H-1.2" stroke={BRIDGE_MIST} strokeWidth={0.65} opacity={0.7} />
      </g>

      {/* Piers, richest fill of the three. */}
      <path d="M2.2 8.6 L2.2 20.6 L5.6 20.6 L5.6 8.6 Z" fill={BRIDGE_PLUM} opacity={0.65} stroke="none" />
      <path d="M18.4 8.6 L18.4 20.6 L21.8 20.6 L21.8 8.6 Z" fill={BRIDGE_MAGENTA} opacity={0.65} stroke="none" />
      <path d="M2.2 8.6 L2.2 20.6 L5.6 20.6 L5.6 8.6 Z" strokeWidth={1.15} />
      <path d="M18.4 8.6 L18.4 20.6 L21.8 20.6 L21.8 8.6 Z" strokeWidth={1.15} />

      {/* The arch -- two layered fill bands (echoing the 3D scene's voussoir
          stack), richer than SUPER's single flat wash. */}
      <path d={ARCH_BAND} fill={BRIDGE_MAGENTA} opacity={0.5} stroke="none" />
      <path d={ARCH_BAND_INNER} fill={BRIDGE_ROSE} opacity={0.45} stroke="none" />
      <path d={ARCH_OUTER} fill="none" strokeWidth={1.6} />

      {/* SUSPENSION CABLES -- vertical ties dropped from the arch's inner
          face down to the deck. Their lengths are the real chord solution
          for r=4.9 about (12, 8.6), which is what stops them reading as
          arbitrary decoration. LEGENDARY-only structural addition.
          Deliberately HAIRLINE (0.45 at 0.55 alpha): at 0.75/0.85 these four
          ties filled the arch opening and read as a portcullis -- the void
          under an arch is the whole point of an arch, so the cables have to
          be legible without closing it. */}
      <g strokeWidth={0.45} opacity={0.55} stroke={BRIDGE_MIST}>
        <path d="M8.4 5.3 L8.4 8.6" />
        <path d="M10.2 4.0 L10.2 8.6" />
        <path d="M13.8 4.0 L13.8 8.6" />
        <path d="M15.6 5.3 L15.6 8.6" />
      </g>

      {/* Deck + parapet railing. */}
      <path d="M1 8.6 H23" strokeWidth={1.5} />
      <g strokeWidth={0.9} opacity={0.8}>
        <path d="M3.9 8.6 L3.9 7.1" />
        <path d="M7.4 8.6 L7.4 7.1" />
        <path d="M10.9 8.6 L10.9 7.1" />
        <path d="M13.1 8.6 L13.1 7.1" />
        <path d="M16.6 8.6 L16.6 7.1" />
        <path d="M20.1 8.6 L20.1 7.1" />
      </g>

      {/* PIER-TOP LANTERNS -- a lit crossing is lit end to end, and a real
          lantern (cup + flame) is a bridge object, where the generic diamond
          flare this slot used to hold was not. */}
      <g>
        <circle cx="3.9" cy="4.9" r="2" fill={BRIDGE_ROSE} opacity={0.25} stroke="none" />
        <path d="M3.2 7.1 H4.6 L4.3 5.7 H3.5 Z" fill={BRIDGE_ROSE} opacity={0.9} stroke="none" />
        <path d="M3.9 5.7 C4.6 4.8 4.7 4.2 3.9 3.1 C3.1 4.2 3.2 4.8 3.9 5.7 Z" fill={BRIDGE_MIST} stroke="none" />
        <circle cx="20.1" cy="4.9" r="2" fill={BRIDGE_ROSE} opacity={0.25} stroke="none" />
        <path d="M19.4 7.1 H20.8 L20.5 5.7 H19.7 Z" fill={BRIDGE_ROSE} opacity={0.9} stroke="none" />
        <path d="M20.1 5.7 C20.8 4.8 20.9 4.2 20.1 3.1 C19.3 4.2 19.4 4.8 20.1 5.7 Z" fill={BRIDGE_MIST} stroke="none" />
      </g>

      {/* Keystone, at the true crown, blazing. It carries a PLUM core inside a
          mist rim: filled flat mist it was white-on-white against the lit
          crown and the one stone that completes the crossing simply vanished. */}
      <circle cx="12" cy="3.1" r="3" fill={BRIDGE_ROSE} opacity={0.3} stroke="none" />
      <path d="M10.6 2.2 L13.4 2.2 L12.9 4 L11.1 4 Z" fill={BRIDGE_PLUM} stroke="none" />
      <path d="M10.6 2.2 L13.4 2.2 L12.9 4 L11.1 4 Z" fill="none" stroke={BRIDGE_MIST} strokeWidth={0.9} />
      <path d="M12 2.2 L12 -1" stroke={BRIDGE_MIST} strokeWidth={0.8} opacity={0.75} strokeLinecap="round" />

      {/* WATER. The waterline is now at the pier feet (y=20.8), so the piers
          actually stand IN the river instead of hovering above a rule, and
          the reflection is the real arch's own span (x=5.6..18.4, the same
          springing points) vertically squashed into the 3.2 units of frame
          that remain. The previous version drew a full-radius arc from
          y=22.2, which fell almost entirely outside the 24x24 viewBox and
          survived on screen as two disconnected squiggles. */}
      <path d="M0.6 20.8 H23.4" strokeWidth={0.7} opacity={0.55} strokeDasharray="1.2 1.4" stroke={BRIDGE_MIST} />
      <path d="M5.6 20.8 A6.4 2.6 0 0 0 18.4 20.8" fill="none" strokeWidth={0.9} opacity={0.5} stroke={BRIDGE_MIST} />
      <path d="M7.1 20.8 A4.9 2 0 0 0 16.9 20.8" fill="none" strokeWidth={0.6} opacity={0.32} stroke={BRIDGE_ROSE} />
      {/* Pier reflections -- broken by the current, so dashed, not solid. */}
      <g stroke={BRIDGE_MIST} strokeWidth={0.9} opacity={0.32} strokeDasharray="0.9 1.1">
        <path d="M3.9 20.8 L3.9 23.6" />
        <path d="M20.1 20.8 L20.1 23.6" />
      </g>
    </GlyphShell>
  );
}

/* ==========================================================================
 * MM-L1 -- a summit at night. MM is the capstone module every student path
 * ends in (IM -> MM, always), so this is the "final peak", and its apex
 * flourish is a SKY EVENT (aurora + a beacon star) rather than a sunburst:
 * the light belongs to the night around the mountain, not to the rock.
 * ========================================================================== */
const PEAK_NIGHT = "#100637";
const PEAK_SAPPHIRE = "#7578d7";
const PEAK_FROST = "#a9bec6";

const PEAK_OUTLINE = "M2.2 21.4 L12 3.2 L21.8 21.4 Z";

export function IconLevelMasteryMmL1Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Base-camp markers -- outline only, no fill. */}
      <path d="M2.2 21.4 L2.2 18.4 L4.4 21.4 Z" fill="none" strokeWidth={1.15} />
      <path d="M21.8 21.4 L21.8 18.4 L19.6 21.4 Z" fill="none" strokeWidth={1.15} />

      {/* Plain ground line, no snow contour. */}
      <path d="M1 21.4 H23" strokeWidth={1.5} />

      {/* The peak -- outline only, unfilled. */}
      <path d={PEAK_OUTLINE} fill="none" strokeWidth={1.6} />
    </GlyphShell>
  );
}

export function IconLevelMasteryMmL1Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Base-camp markers, now solidly filled. */}
      <path d="M2.2 21.4 L2.2 18.4 L4.4 21.4 Z" fill={PEAK_NIGHT} opacity={0.55} stroke="none" />
      <path d="M21.8 21.4 L21.8 18.4 L19.6 21.4 Z" fill={PEAK_SAPPHIRE} opacity={0.55} stroke="none" />
      <path d="M2.2 21.4 L2.2 18.4 L4.4 21.4 Z" fill="none" strokeWidth={1.15} />
      <path d="M21.8 21.4 L21.8 18.4 L19.6 21.4 Z" fill="none" strokeWidth={1.15} />

      {/* Ground line + snow-line contour -- BASE's plain line gains a
          dashed contour partway up the slope. */}
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d="M6.8 13.4 H17.2" strokeWidth={0.9} opacity={0.75} strokeDasharray="1.4 1.2" />

      {/* The peak, solidly filled -- one even wash, calm and finished. */}
      <path d={PEAK_OUTLINE} fill={PEAK_SAPPHIRE} opacity={0.4} stroke="none" />
      <path d={PEAK_OUTLINE} fill="none" strokeWidth={1.6} />

      {/* Soft single glow behind the summit -- first hint of "lit up". */}
      <circle cx="12" cy="5.4" r="2.6" fill={PEAK_SAPPHIRE} opacity={0.3} stroke="none" />
      {/* Summit cap -- the peak is now a finished climb. */}
      <path d="M12 3.2 L13.5 6.7 L10.5 6.7 Z" fill={PEAK_FROST} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryMmL1Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* AURORA. Two ribbons sweeping the whole sky and exiting BOTH side
          edges of the viewBox -- this family's escaping light is horizontal
          and atmospheric, drawn behind the mountain so the translucent peak
          fill veils it exactly the way a real ridge veils an aurora. */}
      <g fill="none" strokeLinecap="round">
        <path
          d="M-2.4 5.6 C2.4 1.4 5.6 7.4 9.4 4.6 C13 2 16.4 6.6 20.2 3.8 C22.4 2.2 24.6 3 26.4 1.6"
          stroke={PEAK_FROST}
          strokeWidth={1.5}
          opacity={0.5}
        />
        <path
          d="M-2.4 8.6 C2.6 4.6 5.4 10.2 9.6 7.4 C13.4 4.8 16.2 9.4 20.4 6.6 C22.6 5 24.4 6 26.4 4.6"
          stroke={PEAK_SAPPHIRE}
          strokeWidth={1.1}
          opacity={0.55}
        />
        <path
          d="M-2.4 11.4 C3 7.8 5.2 12.8 9.8 10.2 C13.8 7.9 16 12.2 20.6 9.4"
          stroke={PEAK_FROST}
          strokeWidth={0.6}
          opacity={0.35}
        />
      </g>

      {/* STARFIELD -- varied radii and opacities so it reads as depth rather
          than as three identical dots. */}
      <g stroke="none" fill={PEAK_FROST}>
        <circle cx="3.4" cy="3.0" r="0.5" opacity={0.85} />
        <circle cx="5.9" cy="1.4" r="0.32" opacity={0.55} />
        <circle cx="8.2" cy="1.6" r="0.28" opacity={0.45} />
        <circle cx="16.4" cy="0.9" r="0.38" opacity={0.6} />
        <circle cx="18.9" cy="2.2" r="0.45" opacity={0.75} />
        <circle cx="21.4" cy="4.6" r="0.3" opacity={0.5} />
      </g>

      {/* Base-camp markers, richest fill of the three. */}
      <path d="M2.2 21.4 L2.2 18.4 L4.4 21.4 Z" fill={PEAK_NIGHT} opacity={0.65} stroke="none" />
      <path d="M21.8 21.4 L21.8 18.4 L19.6 21.4 Z" fill={PEAK_SAPPHIRE} opacity={0.65} stroke="none" />
      <path d="M2.2 21.4 L2.2 18.4 L4.4 21.4 Z" fill="none" strokeWidth={1.15} />
      <path d="M21.8 21.4 L21.8 18.4 L19.6 21.4 Z" fill="none" strokeWidth={1.15} />

      {/* Camp beacons: a lit point with a rising smoke wisp at each base
          camp -- a camp object, replacing the generic twin diamond flare. */}
      <g>
        <circle cx="3.3" cy="17.7" r="0.62" fill={PEAK_FROST} stroke="none" />
        <path d="M3.3 17.0 C3.9 16.1 3.0 15.5 3.4 14.5" stroke={PEAK_FROST} strokeWidth={0.6} opacity={0.7} fill="none" />
        <circle cx="20.7" cy="17.7" r="0.62" fill={PEAK_FROST} stroke="none" />
        <path d="M20.7 17.0 C21.3 16.1 20.4 15.5 20.8 14.5" stroke={PEAK_FROST} strokeWidth={0.6} opacity={0.7} fill="none" />
      </g>

      {/* Ground line + snow-line contour. */}
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d="M6.8 13.4 H17.2" strokeWidth={0.9} opacity={0.8} strokeDasharray="1.4 1.2" />

      {/* The peak -- two layered fill bands (echoing the 3D scene's rock
          strata), richer than SUPER's single flat wash. */}
      <path d={PEAK_OUTLINE} fill={PEAK_SAPPHIRE} opacity={0.5} stroke="none" />
      <path d="M6.4 13.4 L12 3.2 L17.6 13.4 Z" fill={PEAK_FROST} opacity={0.45} stroke="none" />
      <path d={PEAK_OUTLINE} fill="none" strokeWidth={1.6} />

      {/* SECONDARY RIDGE -- a mountain without a subsidiary spur is a
          triangle. LEGENDARY-only structural addition. */}
      <path
        d="M12 3.2 L14.7 10.4 L12.9 12.6 L15.4 17.2 L14.2 21.4"
        fill="none"
        strokeWidth={0.75}
        opacity={0.6}
      />

      {/* BEACON STAR -- a single four-point star with concave sides, pierced
          through the top edge of the viewBox. One deliberate, shaped light
          instead of six interchangeable straight rays. */}
      <circle cx="12" cy="3.4" r="3.2" fill={PEAK_FROST} opacity={0.25} stroke="none" />
      <path
        d="M12 -1.2 C12.6 2.2 13.2 2.8 16.6 3.4 C13.2 4 12.6 4.6 12 8 C11.4 4.6 10.8 4 7.4 3.4 C10.8 2.8 11.4 2.2 12 -1.2 Z"
        fill={PEAK_FROST}
        stroke="none"
      />

      {/* Dashed frost-line beneath the ground -- the family's environmental
          echo, held over because a frozen lake below a peak is real. */}
      <path d="M0.6 22.6 H23.4" strokeWidth={0.7} opacity={0.5} strokeDasharray="1.2 1.4" stroke={PEAK_FROST} />
    </GlyphShell>
  );
}

/* ==========================================================================
 * YLM-L1/L2/L3 -- "seed -> sprout -> blossom". YLM is the very first module
 * in every student path, so the three levels are one growth story told in
 * three genuinely different structures. They deliberately SHARE the soil line
 * at y=21.4 (that continuity is the point of a trilogy) and differ in
 * everything else, including which direction each level's apex light escapes.
 * ========================================================================== */
const SEED_HUSK = "#350d03";
const SEED_SPARK = "#c1bb44";
const SEED_DAWN = "#ceb785";

// SEED CONTOUR -- rebuilt 2026-07-30 after looking at all 15 glyphs rendered
// side by side at badge size. The previous "asymmetric bean with a concave
// hilum notch" was argued well on paper and failed in the eye: at 130px the
// lumpy left flank read as a potato, and next to L2's clean sprout and L3's
// clean blossom it was plainly the worst mark in the family.
//
// This is a symmetric ogive -- pointed apex, full round base. A teardrop is
// the one silhouette that reads as "seed" instantly at any size, it gives the
// shoot a natural place to emerge (the point), and it is a genuinely new
// silhouette in the set: BM is an arch, MM a triangle, L2 a two-leaf crown,
// L3 a five-fold rosette, L1 now a drop. Widest at y=14.3, which puts the
// visual mass low, the way a seed sits.
const SEED_BODY =
  "M12 4.2 C15.9 7.9 18.2 11.1 18.2 14.3 C18.2 18 15.4 20.9 12 20.9 C8.6 20.9 5.8 18 5.8 14.3 C5.8 11.1 8.1 7.9 12 4.2 Z";
// The suture: the line a real seed splits along, running base -> apex. A
// gentle double curve, NOT the previous zig-zag polyline -- at badge size
// that polyline read as a lightning bolt struck through a walnut rather than
// as a coat opening. Both halves are closed against this same curve, so they
// still interlock exactly when parted.
const SEED_SUTURE = "C13.3 17.4 10.9 13.6 12.9 10 C13.7 8.4 12.6 6.2 12 4.2";
const SEED_HALF_R =
  "M12 4.2 C15.9 7.9 18.2 11.1 18.2 14.3 C18.2 18 15.4 20.9 12 20.9 " + SEED_SUTURE + " Z";
const SEED_HALF_L =
  "M12 4.2 C8.1 7.9 5.8 11.1 5.8 14.3 C5.8 18 8.6 20.9 12 20.9 " + SEED_SUTURE + " Z";
// Drawn as a groove (SUPER) rather than as a cut.
const SEED_SEAM = "M12 20.9 " + SEED_SUTURE;

export function IconLevelMasteryYlmL1Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Soil line -- plain, no glow. */}
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      {/* Seed coat -- outline only, unfilled, intact, dormant. */}
      <path d={SEED_BODY} fill="none" strokeWidth={1.6} />
      {/* A single hairline radicle just reaching the soil. Nothing has
          germinated yet. */}
      <path d="M12 20.9 C12.2 21.6 12 22.1 11.7 22.7" fill="none" strokeWidth={0.85} opacity={0.7} />
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL1Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      {/* Seed, solidly filled -- one even wash. */}
      <path d={SEED_BODY} fill={SEED_SPARK} opacity={0.42} stroke="none" />
      <path d={SEED_BODY} fill="none" strokeWidth={1.6} />
      {/* The one extra structural detail: the suture drawn as a GROOVE running
          the seed's own long axis, plus the hilum scar low on the left flank
          where a seed's attachment point actually is. */}
      <path d={SEED_SEAM} fill="none" strokeWidth={0.9} opacity={0.7} />
      <ellipse cx="8.6" cy="17.6" rx="0.6" ry="1.35" transform="rotate(-38 8.6 17.6)" strokeWidth={0.7} opacity={0.8} />
      {/* Roots: the radicle has pierced the soil and forked. Heavier stroke
          than the previous 0.8 hairlines, which vanished into the soil line
          at badge size and left the tier looking like a frayed tassel. */}
      <g fill="none" strokeWidth={1} opacity={0.85} strokeLinecap="round">
        <path d="M11.4 20.8 C10.6 21.9 9.8 22.4 8.9 23.2" />
        <path d="M12 21 C12.1 22 12 22.8 11.9 23.7" />
        <path d="M12.6 20.8 C13.4 21.9 14.2 22.4 15.1 23.2" />
      </g>
      {/* Shoot tip just breaking the apex, with a soft glow. It leaves from
          the POINT of the drop, which is the whole reason the contour is an
          ogive rather than a blob. */}
      <circle cx="13.2" cy="2.6" r="2.1" fill={SEED_SPARK} opacity={0.3} stroke="none" />
      <path d="M12 4.2 C12.3 3 13 2.3 13.7 1.9" fill="none" strokeWidth={1.15} opacity={0.9} />
      <path d="M13.7 1.9 C14.7 1.7 15.4 2.2 15.6 3.1 C14.5 3.3 13.9 2.8 13.7 1.9 Z" fill={SEED_SPARK} opacity={0.9} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL1Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />

      {/* ROOT GLOW below the soil -- germination is the only motif in this
          whole family that acts DOWNWARD, so this is where its escaping light
          goes. The fan and the two outer roots both break past the BOTTOM
          edge of the viewBox. */}
      <path d="M12 21 L5.2 25.6 L18.8 25.6 Z" fill={SEED_DAWN} opacity={0.18} stroke="none" />
      <g fill="none" strokeWidth={1} opacity={0.9} stroke={SEED_DAWN} strokeLinecap="round">
        <path d="M11.5 20.9 C10.2 22 8.6 22.8 6.6 25.2" />
        <path d="M11.8 20.9 C11.2 22.2 10.4 23.2 9.4 24.8" />
        <path d="M12 20.9 C12.1 22.4 12 23.6 11.9 25.6" />
        <path d="M12.2 20.9 C12.8 22.2 13.6 23.2 14.6 24.8" />
        <path d="M12.5 20.9 C13.8 22 15.4 22.8 17.4 25.2" />
      </g>
      <g fill="none" strokeWidth={0.55} opacity={0.5} stroke={SEED_DAWN} strokeLinecap="round">
        <path d="M10.7 22.6 L9.4 22.3" />
        <path d="M13.3 22.6 L14.6 22.3" />
      </g>

      {/* The inner body, showing through the split coat -- this is the second
          fill band, and it is MOTIVATED here rather than decorative: it is
          the living seed the coat has just opened onto. */}
      <path d={SEED_BODY} fill={SEED_DAWN} opacity={0.5} stroke="none" />
      {/* Light escaping from between the two halves, thrown along the suture's
          own normal at three points so it reads as one seam glowing rather
          than as three unrelated ticks. */}
      <g strokeLinecap="round" stroke={SEED_DAWN} fill="none" opacity={0.85}>
        <path d="M12.5 7.6 L14.7 6.9" strokeWidth={0.7} />
        <path d="M12.4 11.4 L9.9 10.7" strokeWidth={0.75} />
        <path d="M12.6 15.6 L15 15" strokeWidth={0.7} />
        <path d="M12.1 18.8 L9.8 18.4" strokeWidth={0.6} />
      </g>

      {/* THE COAT, SPLIT. The two halves are cut from the same contour along
          one shared jagged crack and parted along its normal -- the same
          "the shell breaks and there is still light inside" technique this
          file already uses for PerfectionistGemMythic, argued here from
          germination rather than borrowed as a formula. */}
      <g transform="rotate(3.5 12 20.9) translate(1.25 0)">
        <path d={SEED_HALF_R} fill={SEED_SPARK} opacity={0.55} stroke="none" />
        <path d={SEED_HALF_R} fill="none" strokeWidth={1.4} />
      </g>
      <g transform="rotate(-3.5 12 20.9) translate(-1.25 0)">
        <path d={SEED_HALF_L} fill={SEED_SPARK} opacity={0.55} stroke="none" />
        <path d={SEED_HALF_L} fill="none" strokeWidth={1.4} />
        <ellipse cx="8.6" cy="17.6" rx="0.6" ry="1.35" transform="rotate(-38 8.6 17.6)" strokeWidth={0.7} opacity={0.8} />
      </g>

      {/* THE SHOOT, risen -- stem and first true leaves break past the TOP
          edge. Between this and the roots, YLM-L1 is the only glyph in the
          set whose light escapes both vertical extremes at once. The leaves
          are ~60% larger than the first version's: at badge size those read
          as a nail head sitting on the seed, not as a plant. */}
      <circle cx="12" cy="2.4" r="3.4" fill={SEED_DAWN} opacity={0.28} stroke="none" />
      <path d="M12 5.4 C12.3 3.6 12.1 1.2 12 -2.2" fill="none" strokeWidth={1.3} stroke={SEED_DAWN} strokeLinecap="round" />
      <path d="M11.9 2.6 C9.7 2.4 8.1 0.9 7.6 -1.6 C10.1 -1.1 11.6 0.3 11.9 2.6 Z" fill={SEED_DAWN} opacity={0.9} stroke="none" />
      <path d="M12.1 2.6 C14.3 2.4 15.9 0.9 16.4 -1.6 C13.9 -1.1 12.4 0.3 12.1 2.6 Z" fill={SEED_DAWN} opacity={0.9} stroke="none" />

      {/* Soil dust kicked up by the break. */}
      <g stroke="none" fill={SEED_DAWN}>
        <circle cx="4.5" cy="19.4" r="0.45" opacity={0.75} />
        <circle cx="19.4" cy="18.6" r="0.38" opacity={0.6} />
        <circle cx="17.2" cy="20.6" r="0.3" opacity={0.5} />
      </g>
      {/* Dashed subsoil glow. */}
      <path d="M0.6 23.6 H23.4" strokeWidth={0.7} opacity={0.45} strokeDasharray="1.2 1.4" stroke={SEED_DAWN} />
    </GlyphShell>
  );
}

const SPROUT_MOSS = "#0d2c35";
const SPROUT_TEAL = "#11a8b1";
const SPROUT_MIST = "#b6eff7";

// Lanceolate cotyledons with a real taper, and a stem with a slight natural
// lean rather than a ruled vertical -- the first pass's leaves were symmetric
// blobs on a plumb line, which is what made this glyph read as clip-art next
// to the arch and the peak.
const LEAF_L = "M12 11.9 C8.3 11.2 5.5 8.5 5.1 4.3 C8.8 5.3 11.4 8.2 12 11.9 Z";
const LEAF_R = "M12 11.9 C15.7 11.2 18.5 8.5 18.9 4.3 C15.2 5.3 12.6 8.2 12 11.9 Z";
const LEAF_L_INNER = "M12 11.4 C9.5 10.8 7.5 8.8 7.2 5.9 C9.7 6.6 11.6 8.8 12 11.4 Z";
const LEAF_R_INNER = "M12 11.4 C14.5 10.8 16.5 8.8 16.8 5.9 C14.3 6.6 12.4 8.8 12 11.4 Z";
const SPROUT_STEM = "M12 21.4 C12.3 17.4 11.6 14 12 10.8";

export function IconLevelMasteryYlmL2Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      {/* Stem -- outline only. */}
      <path d={SPROUT_STEM} fill="none" strokeWidth={1.4} />
      {/* Twin cotyledon leaves -- outline only, unfilled, no venation. */}
      <path d={LEAF_L} fill="none" strokeWidth={1.15} />
      <path d={LEAF_R} fill="none" strokeWidth={1.15} />
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL2Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d={SPROUT_STEM} fill="none" strokeWidth={1.4} />
      {/* Leaves, solidly filled. */}
      <path d={LEAF_L} fill={SPROUT_TEAL} opacity={0.45} stroke="none" />
      <path d={LEAF_R} fill={SPROUT_TEAL} opacity={0.45} stroke="none" />
      <path d={LEAF_L} fill="none" strokeWidth={1.15} />
      <path d={LEAF_R} fill="none" strokeWidth={1.15} />
      {/* The one extra structural detail: midribs. */}
      <path d="M11.7 11.4 C9.4 10.1 7.1 7.7 5.7 5.0" strokeWidth={0.8} opacity={0.7} fill="none" />
      <path d="M12.3 11.4 C14.6 10.1 16.9 7.7 18.3 5.0" strokeWidth={0.8} opacity={0.7} fill="none" />
      {/* Bud at the leaf junction, with a soft glow. */}
      <circle cx="12" cy="10.8" r="1.9" fill={SPROUT_TEAL} opacity={0.35} stroke="none" />
      <circle cx="12" cy="10.8" r="1.1" fill={SPROUT_TEAL} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL2Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />

      {/* COMPANION GRASS -- the sprout is no longer alone. Four blades arc out
          of the soil and exit BOTH side edges of the viewBox: this family's
          escaping light is lateral and living, not radial. */}
      <g fill="none" strokeLinecap="round" stroke={SPROUT_MIST}>
        <path d="M12.4 21.4 C8 20.6 3.4 18.6 -1.6 14.2" strokeWidth={0.85} opacity={0.6} />
        <path d="M11.6 21.4 C16 20.6 20.6 18.6 25.6 14.2" strokeWidth={0.85} opacity={0.6} />
        <path d="M12.2 21.4 C9 21 5.6 19.8 1.4 17.4" strokeWidth={0.55} opacity={0.4} />
        <path d="M11.8 21.4 C15 21 18.4 19.8 22.6 17.4" strokeWidth={0.55} opacity={0.4} />
      </g>

      <path d={SPROUT_STEM} fill="none" strokeWidth={1.4} />
      {/* Leaves -- two layered fill bands. */}
      <path d={LEAF_L} fill={SPROUT_TEAL} opacity={0.5} stroke="none" />
      <path d={LEAF_R} fill={SPROUT_TEAL} opacity={0.5} stroke="none" />
      <path d={LEAF_L_INNER} fill={SPROUT_MIST} opacity={0.45} stroke="none" />
      <path d={LEAF_R_INNER} fill={SPROUT_MIST} opacity={0.45} stroke="none" />
      <path d={LEAF_L} fill="none" strokeWidth={1.15} />
      <path d={LEAF_R} fill="none" strokeWidth={1.15} />
      {/* Midribs plus secondary venation -- LEGENDARY-only structural step. */}
      <path d="M11.7 11.4 C9.4 10.1 7.1 7.7 5.7 5.0" strokeWidth={0.8} opacity={0.75} fill="none" />
      <path d="M12.3 11.4 C14.6 10.1 16.9 7.7 18.3 5.0" strokeWidth={0.8} opacity={0.75} fill="none" />
      <g strokeWidth={0.5} opacity={0.55} fill="none">
        <path d="M10.2 10.2 C9.7 9.3 9.3 8.7 9.0 8.0" />
        <path d="M8.4 8.4 C8.0 7.6 7.7 6.9 7.5 6.2" />
        <path d="M13.8 10.2 C14.3 9.3 14.7 8.7 15.0 8.0" />
        <path d="M15.6 8.4 C16.0 7.6 16.3 6.9 16.5 6.2" />
      </g>

      {/* DEW. Two drops hanging off the leaf tips, one drop falling IN through
          the top edge, and the impact ripple its predecessor left on the soil.
          A drop is a shape; the six straight rays this slot used to hold
          were not. */}
      <g stroke="none">
        <path d="M5.4 4.6 C6.5 6 6.7 6.9 6.2 7.6 C5.7 8.3 4.7 8.3 4.3 7.6 C3.8 6.9 4.3 6 5.4 4.6 Z" fill={SPROUT_MIST} opacity={0.85} />
        <circle cx="4.9" cy="6.6" r="0.4" fill="#ffffff" opacity={0.9} />
        <path d="M18.6 4.6 C19.7 6 19.9 6.9 19.4 7.6 C18.9 8.3 17.9 8.3 17.5 7.6 C17 6.9 17.5 6 18.6 4.6 Z" fill={SPROUT_MIST} opacity={0.85} />
        <circle cx="18.1" cy="6.6" r="0.35" fill="#ffffff" opacity={0.8} />
        <path d="M14.8 -1.8 C15.7 -0.7 15.9 0 15.4 0.6 C15 1.1 14.3 1.1 13.9 0.6 C13.5 0 14 -0.7 14.8 -1.8 Z" fill={SPROUT_MIST} opacity={0.8} />
      </g>
      <path d="M14.8 -3.2 L14.8 -2.2" stroke={SPROUT_MIST} strokeWidth={0.55} opacity={0.6} strokeLinecap="round" />

      {/* Bud, brightest element, with its own halo. */}
      <circle cx="12" cy="10.8" r="2.6" fill={SPROUT_MIST} opacity={0.28} stroke="none" />
      <circle cx="12" cy="10.8" r="1.3" fill={SPROUT_MIST} stroke="none" />

      {/* Impact ripple on the soil -- this family's environmental echo,
          concentric rather than a dashed rule. */}
      <g fill="none" stroke={SPROUT_MIST} strokeLinecap="round">
        <path d="M13.4 21.4 A3.2 1.1 0 0 0 19.8 21.4" strokeWidth={0.65} opacity={0.55} />
        <path d="M14.8 21.4 A1.8 0.7 0 0 0 18.4 21.4" strokeWidth={0.5} opacity={0.4} />
      </g>
    </GlyphShell>
  );
}

const BLOOM_PLUM = "#20131c";
const BLOOM_ORCHID = "#a678c2";
const BLOOM_FUCHSIA = "#f69eee";

// Single petal, pointing up from the flower's center (12, 10) -- reused 5x
// at 72deg increments via a wrapping <g transform="rotate(...)">.
const PETAL_PATH = "M12 10 C9.8 9 9 6.6 10.3 4.1 C11 2.8 13 2.8 13.7 4.1 C15 6.6 14.2 9 12 10 Z";
const PETAL_INNER_PATH = "M12 10 C10.3 9.4 9.8 7.6 10.7 5.7 C11.2 4.9 12.8 4.9 13.3 5.7 C14.2 7.6 13.7 9.4 12 10 Z";
const PETAL_ANGLES = [0, 72, 144, 216, 288];
// Petal-tip highlight, reused at the same 5 angles.
const PETAL_TIP = "M12 2.6 C12.7 3.4 12.9 4 12.6 4.6 C12.3 5.1 11.7 5.1 11.4 4.6 C11.1 4 11.3 3.4 12 2.6 Z";
// One stamen -- a CURVED filament with an anther at its end -- reused 6x at
// 60deg. 6-on-60 against 5-petals-on-72 never lines up, which is exactly why
// the flower reads as grown rather than as a diagram.
const STAMEN_PATH = "M12 10 C13.4 8.6 14.6 7.2 15.8 5.4";
const STAMEN_ANGLES = [0, 60, 120, 180, 240, 300];
// A true Archimedean pollen trail: r = 3 + 1.5i, theta = -60deg - 38deg*i.
// The last two motes leave the 24x24 frame on the right, which is this
// family's silhouette break -- dispersal, not radiance.
const POLLEN: Array<[number, number, number, number]> = [
  [13.5, 7.4, 0.55, 0.9],
  [11.37, 5.55, 0.5, 0.85],
  [7.69, 5.83, 0.46, 0.78],
  [4.54, 9.22, 0.42, 0.7],
  [4.37, 14.77, 0.38, 0.62],
  [8.41, 19.87, 0.34, 0.54],
  [15.71, 21.41, 0.3, 0.46],
  [23.19, 17.55, 0.26, 0.38],
  [26.97, 8.95, 0.22, 0.3],
];

export function IconLevelMasteryYlmL3Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d="M12 21.4 L12 14" fill="none" strokeWidth={1.4} />
      {/* 5 petals -- outline only, unfilled. */}
      {PETAL_ANGLES.map((a) => (
        <path key={a} d={PETAL_PATH} fill="none" strokeWidth={1.05} transform={`rotate(${a} 12 10)`} />
      ))}
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL3Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d="M12 21.4 L12 14" fill="none" strokeWidth={1.4} />
      {/* Petals, solidly filled. */}
      {PETAL_ANGLES.map((a) => (
        <path key={a} d={PETAL_PATH} fill={BLOOM_ORCHID} opacity={0.45} stroke="none" transform={`rotate(${a} 12 10)`} />
      ))}
      {PETAL_ANGLES.map((a) => (
        <path key={`o${a}`} d={PETAL_PATH} fill="none" strokeWidth={1.05} transform={`rotate(${a} 12 10)`} />
      ))}
      {/* The one extra structural detail: the bloom ring. */}
      <circle cx="12" cy="10" r="7.4" fill="none" strokeWidth={0.8} opacity={0.6} strokeDasharray="1.3 1.4" />
      <circle cx="12" cy="10" r="1.9" fill={BLOOM_ORCHID} opacity={0.35} stroke="none" />
      <circle cx="12" cy="10" r="1.1" fill={BLOOM_ORCHID} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryYlmL3Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21.4 H23" strokeWidth={1.5} />
      <path d="M12 21.4 L12 14" fill="none" strokeWidth={1.4} />

      {/* POLLEN SPIRAL -- drawn first so the flower sits inside its own
          dispersal. Motes decay in radius and opacity along a real spiral and
          the outermost two leave the frame on the right. */}
      <g stroke="none" fill={BLOOM_FUCHSIA}>
        {POLLEN.map(([cx, cy, r, o], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
        ))}
      </g>

      {/* Petals -- two layered fill bands. */}
      {PETAL_ANGLES.map((a) => (
        <path key={a} d={PETAL_PATH} fill={BLOOM_ORCHID} opacity={0.5} stroke="none" transform={`rotate(${a} 12 10)`} />
      ))}
      {PETAL_ANGLES.map((a) => (
        <path key={`i${a}`} d={PETAL_INNER_PATH} fill={BLOOM_FUCHSIA} opacity={0.5} stroke="none" transform={`rotate(${a} 12 10)`} />
      ))}
      {PETAL_ANGLES.map((a) => (
        <path key={`o${a}`} d={PETAL_PATH} fill="none" strokeWidth={1.05} transform={`rotate(${a} 12 10)`} />
      ))}
      <circle cx="12" cy="10" r="7.4" fill="none" strokeWidth={0.8} opacity={0.65} strokeDasharray="1.3 1.4" />

      {/* Every petal tip lit, not an arbitrary two of five. */}
      {PETAL_ANGLES.map((a) => (
        <path key={`t${a}`} d={PETAL_TIP} fill={BLOOM_FUCHSIA} opacity={0.85} stroke="none" transform={`rotate(${a} 12 10)`} />
      ))}

      {/* STAMENS -- six curved filaments with anthers, off-phase from the five
          petals. This is the LEGENDARY-only structural addition and it is a
          real floral organ, which the six straight rays it replaces were not. */}
      {STAMEN_ANGLES.map((a) => (
        <g key={`s${a}`} transform={`rotate(${a} 12 10)`}>
          <path d={STAMEN_PATH} fill="none" strokeWidth={0.75} opacity={0.9} stroke={BLOOM_FUCHSIA} />
          <circle cx="15.8" cy="5.4" r="0.62" fill={BLOOM_FUCHSIA} stroke="none" />
        </g>
      ))}

      {/* Pollen core. */}
      <circle cx="12" cy="10" r="2.8" fill={BLOOM_FUCHSIA} opacity={0.28} stroke="none" />
      <circle cx="12" cy="10" r="1.3" fill={BLOOM_FUCHSIA} stroke="none" />
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

/* ==========================================================================
 * PM-L1 -- A foundation block / cornerstone.
 * Base: Small, low-detail wireframe cube outline.
 * Super: Massive, heavy stone ashlar banded with thick iron straps (breaks silhouette).
 * Legendary: Block split by a forge hammer, exposing a glowing red-hot core and sparks.
 * ========================================================================== */
const PM_L1_BASE_COLOR = "#ff3a19";
const PM_L1_SUPER_COLOR = "#df2946";
const PM_L1_LEG_COLOR = "#02b804";

export function IconLevelMasteryPmL1Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Small, unimposing wireframe cube */}
      <path d="M12 9 L17 11.5 L12 14 L7 11.5 Z" fill="none" strokeWidth={1.5} />
      <path d="M7 11.5 L12 14 L12 19 L7 16.5 Z" fill="none" strokeWidth={1.5} />
      <path d="M17 11.5 L12 14 L12 19 L17 16.5 Z" fill="none" strokeWidth={1.5} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL1Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Massive block, physically larger than Base */}
      <path d="M12 4 L20 8 L12 12 L4 8 Z" fill={PM_L1_SUPER_COLOR} opacity={0.6} stroke="none" />
      <path d="M4 8 L12 12 L12 21 L4 17 Z" fill={PM_L1_BASE_COLOR} opacity={0.9} stroke="none" />
      <path d="M20 8 L12 12 L12 21 L20 17 Z" fill={PM_L1_SUPER_COLOR} opacity={0.4} stroke="none" />

      {/* Heavy iron bands wrapping the block, breaking the straight silhouette */}
      <path d="M3.5 12 L12 16.5 L20.5 12 L20.5 14 L12 18.5 L3.5 14 Z" fill="#291b18" opacity={0.8} stroke="none" />
      <path d="M8 6 L16 10 L16 19 L8 15 Z" fill="none" stroke="#291b18" strokeWidth={1.5} opacity={0.6} />

      {/* Outer block wireframe over the fills */}
      <path d="M12 4 L20 8 L20 17 L12 21 L4 17 L4 8 Z" fill="none" strokeWidth={1.6} />
      <path d="M4 8 L12 12 L20 8 M12 12 L12 21" fill="none" strokeWidth={1.6} />

      {/* Iron band rivets */}
      <circle cx="7" cy="13.5" r="0.6" fill="#fff" opacity={0.7} />
      <circle cx="12" cy="16" r="0.6" fill="#fff" opacity={0.7} />
      <circle cx="17" cy="13.5" r="0.6" fill="#fff" opacity={0.7} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL1Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Glowing split core */}
      <path d="M12 5 L16 10 L12 21 L8 10 Z" fill={PM_L1_LEG_COLOR} opacity={0.9} stroke="none" />
      <circle cx="12" cy="12" r="5" fill={PM_L1_SUPER_COLOR} opacity={0.5} stroke="none" />
      <circle cx="12" cy="12" r="3" fill="#fff" opacity={0.8} stroke="none" />

      {/* Left split half (angled away) */}
      <path d="M10 3 L10 11 L10 21 L3 17 L3 8 Z" fill={PM_L1_BASE_COLOR} opacity={0.8} stroke="none" />
      <path d="M10 3 L10 11 L10 21 L3 17 L3 8 Z" fill="none" strokeWidth={1.6} />
      <path d="M3 8 L10 11 L10 21" fill="none" strokeWidth={1.2} opacity={0.5} />

      {/* Right split half (angled away) */}
      <path d="M14 5 L21 8 L21 17 L14 21 L14 13 Z" fill={PM_L1_SUPER_COLOR} opacity={0.6} stroke="none" />
      <path d="M14 5 L21 8 L21 17 L14 21 L14 13 Z" fill="none" strokeWidth={1.6} />
      <path d="M21 8 L14 13 L14 21" fill="none" strokeWidth={1.2} opacity={0.5} />

      {/* Forge sparks flying out of the gap */}
      <path d="M12 2 L12 -2 M9 6 L6 3 M15 6 L18 3" fill="none" stroke={PM_L1_LEG_COLOR} strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
      <circle cx="7" cy="0" r="0.8" fill="#fff" stroke="none" />
      <circle cx="17" cy="-1" r="1.2" fill={PM_L1_LEG_COLOR} stroke="none" />
    </GlyphShell>
  );
}

/* ==========================================================================
 * PM-L2 -- Classical Pillar
 * Base: A plain, perfectly straight column outline (no base, no capital).
 * Super: A full Ionic column (stepped wide base, fluting, massive volutes poking out).
 * Legendary: Pillar ablaze with celestial fire, glowing aura, ivy climbing.
 * ========================================================================== */
const PM_L2_BASE = "#0c8281";
const PM_L2_SUPER = "#aa012d";
const PM_L2_LEG = "#765449";

export function IconLevelMasteryPmL2Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Simple, straight rectangle. No architectural detail. */}
      <path d="M9 21 L9 5 L15 5 L15 21 Z" fill="none" strokeWidth={1.5} />
      {/* One simple detail line inside */}
      <path d="M12 5 L12 21" fill="none" strokeWidth={0.8} opacity={0.4} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL2Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Pillar Fills (solid to prevent overlap issues) */}
      <path d="M7 19 L7 18 L8 18 L8 6 L5 6 L5 4 L19 4 L19 6 L16 6 L16 18 L17 18 L17 19 Z" fill={PM_L2_BASE} opacity={0.6} stroke="none" />
      {/* Stepped Base at the bottom to widen the footprint */}
      <path d="M5 21 L5 19 L19 19 L19 21 Z" fill={PM_L2_SUPER} opacity={0.5} stroke="none" />
      <path d="M8 6 L16 6 L16 18 L8 18 Z" fill={PM_L2_SUPER} opacity={0.5} stroke="none" />

      {/* Fluting */}
      <path d="M10 6 L10 18 M12 6 L12 18 M14 6 L14 18" fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.4} />

      {/* Outlines (layered over fills to maintain clean lines) */}
      <path d="M7 19 L7 18 L8 18 L8 6 M16 18 L16 6 L19 6 M5 6 L8 6" fill="none" strokeWidth={1.6} />
      <path d="M5 4 L19 4 M5 19 L19 19 M5 21 L5 19 M19 21 L19 19" fill="none" strokeWidth={1.6} />
      <path d="M16 18 L17 18 L17 19" fill="none" strokeWidth={1.6} />

      {/* Volutes (solid fill blocks lines underneath) */}
      <circle cx="5" cy="5" r="2.5" fill={PM_L2_BASE} stroke="none" />
      <circle cx="5" cy="5" r="2.5" fill="none" strokeWidth={1.2} />
      <path d="M5 5 A 1 1 0 0 1 5 2.5" fill="none" strokeWidth={1} opacity={0.7} />

      <circle cx="19" cy="5" r="2.5" fill={PM_L2_BASE} stroke="none" />
      <circle cx="19" cy="5" r="2.5" fill="none" strokeWidth={1.2} />
      <path d="M19 5 A 1 1 0 0 0 19 2.5" fill="none" strokeWidth={1} opacity={0.7} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL2Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Aura / Flame core */}
      <path d="M12 -3 L10 -7 L14 -7 Z" fill={PM_L2_LEG} opacity={0.8} stroke="none" />
      <circle cx="12" cy="0" r="4" fill={PM_L2_LEG} opacity={0.3} stroke="none" />
      <circle cx="12" cy="1" r="2" fill="#fff" opacity={0.9} stroke="none" />

      {/* Pillar Fills */}
      <path d="M7 19 L7 18 L8 18 L8 6 L5 6 L5 4 L19 4 L19 6 L16 6 L16 18 L17 18 L17 19 Z" fill={PM_L2_BASE} opacity={0.7} stroke="none" />
      <path d="M5 21 L5 19 L19 19 L19 21 Z" fill={PM_L2_SUPER} opacity={0.6} stroke="none" />
      <path d="M8 6 L16 6 L16 18 L8 18 Z" fill={PM_L2_SUPER} opacity={0.4} stroke="none" />

      {/* Pillar wireframe */}
      <path d="M7 19 L7 18 L8 18 L8 6 M16 18 L16 6 L19 6 M5 6 L8 6" fill="none" strokeWidth={1.6} />
      <path d="M5 4 L19 4 M5 19 L19 19 M5 21 L5 19 M19 21 L19 19" fill="none" strokeWidth={1.6} />
      <path d="M16 18 L17 18 L17 19" fill="none" strokeWidth={1.6} />

      <circle cx="5" cy="5" r="2.5" fill={PM_L2_BASE} stroke="none" />
      <circle cx="5" cy="5" r="2.5" fill="none" strokeWidth={1.2} />
      <circle cx="19" cy="5" r="2.5" fill={PM_L2_BASE} stroke="none" />
      <circle cx="19" cy="5" r="2.5" fill="none" strokeWidth={1.2} />

      {/* Celestial flame rays */}
      <path d="M12 4 L12 -5 M9 3 L6 -2 M15 3 L18 -2" fill="none" stroke={PM_L2_LEG} strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />

      {/* Glowing ivy wrapping around */}
      <path d="M7 20 C 13 18, 15 15, 8 13 C 3 11, 15 9, 17 6" fill="none" stroke={PM_L2_LEG} strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />
    </GlyphShell>
  );
}

/* ==========================================================================
 * PM-L3 -- Staircase
 * Base: A narrow, simple 2-step profile outline.
 * Super: A massive 3-step solid staircase with glowing braziers breaking the silhouette.
 * Legendary: Stairs ascending into a glowing cosmic archway portal.
 * ========================================================================== */
const PM_L3_BASE = "#ff9c72";
const PM_L3_SUPER = "#052a4f";
const PM_L3_LEG = "#412c5b";

export function IconLevelMasteryPmL3Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Narrow 2-step outline */}
      <path d="M7 21 L7 14 L13 14 L13 7 L19 7 L19 21 Z" fill="none" strokeWidth={1.5} strokeLinejoin="miter" />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL3Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Wide 3-step solid staircase */}
      <path d="M2 21 L2 16 L8 16 L8 21 Z" fill={PM_L3_BASE} opacity={0.9} stroke="none" />
      <path d="M8 21 L8 11 L14 11 L14 21 Z" fill={PM_L3_SUPER} opacity={0.7} stroke="none" />
      <path d="M14 21 L14 6 L20 6 L20 21 Z" fill={PM_L3_BASE} opacity={0.9} stroke="none" />

      {/* Base Silhouette */}
      <path d="M2 21 L2 16 L8 16 L8 11 L14 11 L14 6 L20 6 L20 21 Z" fill="none" strokeWidth={1.6} strokeLinejoin="miter" />

      {/* Treads (Highlights) */}
      <path d="M2 16 L8 16 M8 11 L14 11 M14 6 L20 6" fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.4} />

      {/* Braziers resting on each step, protruding up */}
      <path d="M4 16 L4 14 L6 14 L6 16 Z" fill={PM_L3_SUPER} stroke="none" />
      <path d="M4 16 L4 14 L6 14 L6 16 Z" fill="none" strokeWidth={1} />
      <circle cx="5" cy="13" r="1.5" fill="#fff" opacity={0.8} stroke="none" />

      <path d="M10 11 L10 9 L12 9 L12 11 Z" fill={PM_L3_SUPER} stroke="none" />
      <path d="M10 11 L10 9 L12 9 L12 11 Z" fill="none" strokeWidth={1} />
      <circle cx="11" cy="8" r="1.5" fill="#fff" opacity={0.8} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL3Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Cosmic Archway / Portal Core */}
      <path d="M14 6 A 3 5 0 0 1 20 6 Z" fill={PM_L3_LEG} opacity={0.9} stroke="none" />
      <circle cx="17" cy="1" r="5" fill={PM_L3_SUPER} opacity={0.3} stroke="none" />
      <circle cx="17" cy="1" r="3" fill="#fff" opacity={0.7} stroke="none" />

      {/* Archway rings */}
      <path d="M13 6 A 4 7 0 0 1 21 6" fill="none" stroke={PM_L3_LEG} strokeWidth={1.5} opacity={0.8} />

      {/* Step columns */}
      <path d="M2 21 L2 16 L8 16 L8 21 Z M14 21 L14 6 L20 6 L20 21 Z" fill={PM_L3_BASE} opacity={0.8} stroke="none" />
      <path d="M8 21 L8 11 L14 11 L14 21 Z" fill={PM_L3_SUPER} opacity={0.6} stroke="none" />

      {/* Silhouette */}
      <path d="M2 21 L2 16 L8 16 L8 11 L14 11 L14 6 L20 6 L20 21 Z" fill="none" strokeWidth={1.6} strokeLinejoin="miter" />

      {/* Glowing Treads spilling light */}
      <path d="M2 16 L8 16 M8 11 L14 11 M14 6 L20 6" fill="none" stroke={PM_L3_LEG} strokeWidth={2} opacity={0.9} strokeLinecap="round" />
      <path d="M8 16 L8 21 M14 11 L14 21 M20 6 L20 21" fill="none" stroke="#000" strokeWidth={1} opacity={0.6} />

      {/* Floating stardust */}
      <circle cx="6" cy="7" r="0.8" fill={PM_L3_LEG} stroke="none" />
      <circle cx="21" cy="-2" r="1.2" fill="#fff" stroke="none" />
      <circle cx="22" cy="8" r="0.8" fill={PM_L3_LEG} stroke="none" />
    </GlyphShell>
  );
}

/* ==========================================================================
 * PM-L4 -- Observatory Dome
 * Base: A plain semi-circle dome outline.
 * Super: A massive facility with a giant telescope poking out of a split dome.
 * Legendary: Telescope firing a massive beam into the sky with orbiting rings.
 * ========================================================================== */
const PM_L4_BASE = "#fe7eaa";
const PM_L4_SUPER = "#044967";
const PM_L4_LEG = "#514303";

export function IconLevelMasteryPmL4Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Plain semi-circle outline */}
      <path d="M6 21 L6 16 A 6 6 0 0 1 18 16 L18 21 Z" fill="none" strokeWidth={1.5} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL4Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Giant protruding telescope barrel */}
      <path d="M14 13 L21 4 L23 5.5 L16 14 Z" fill={PM_L4_SUPER} opacity={0.8} stroke="none" />
      <path d="M14 13 L21 4 L23 5.5 L16 14 Z" fill="none" strokeWidth={1.2} />
      <path d="M21 4 L23 5.5" fill="none" stroke="#fff" strokeWidth={2} opacity={0.8} />

      {/* Massive facility base */}
      <path d="M4 21 L4 12 L20 12 L20 21 Z" fill={PM_L4_BASE} opacity={0.7} stroke="none" />
      <path d="M4 21 L4 12 L20 12 L20 21 Z" fill="none" strokeWidth={1.6} />

      {/* Split dome housing the telescope */}
      <path d="M6 12 A 6 6 0 0 1 18 12 Z" fill={PM_L4_SUPER} opacity={0.5} stroke="none" />
      <path d="M6 12 A 6 6 0 0 1 13 6.5 L13 12 Z" fill="none" strokeWidth={1.5} />
      <path d="M15 6.5 A 6 6 0 0 1 18 12" fill="none" strokeWidth={1.5} />

      {/* Heavy blast door detail */}
      <path d="M10 21 L10 16 L14 16 L14 21" fill="none" strokeWidth={1.2} opacity={0.6} />
    </GlyphShell>
  );
}

export function IconLevelMasteryPmL4Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Energy Beam */}
      <path d="M21 5 L25 -4 L27 -3 L23 6 Z" fill={PM_L4_LEG} opacity={0.6} stroke="none" />
      <path d="M22 4 L26 -3" fill="none" stroke="#fff" strokeWidth={2} opacity={0.9} />

      {/* Telescope barrel */}
      <path d="M14 13 L21 4 L23 5.5 L16 14 Z" fill={PM_L4_SUPER} opacity={0.9} stroke="none" />
      <path d="M14 13 L21 4 L23 5.5 L16 14 Z" fill="none" strokeWidth={1.2} />

      {/* Facility base */}
      <path d="M4 21 L4 12 L20 12 L20 21 Z" fill={PM_L4_BASE} opacity={0.8} stroke="none" />
      <path d="M4 21 L4 12 L20 12 L20 21 Z" fill="none" strokeWidth={1.6} />

      {/* Dome */}
      <path d="M6 12 A 6 6 0 0 1 18 12 Z" fill={PM_L4_SUPER} opacity={0.6} stroke="none" />
      <path d="M6 12 A 6 6 0 0 1 13 6.5 L13 12 Z" fill="none" strokeWidth={1.5} />
      <path d="M15 6.5 A 6 6 0 0 1 18 12" fill="none" strokeWidth={1.5} />

      {/* Orbital Rings around the beam */}
      <ellipse cx="23" cy="1" rx="4" ry="1.5" transform="rotate(-30 23 1)" fill="none" stroke={PM_L4_LEG} strokeWidth={1.5} opacity={0.8} />

      {/* Glowing stars */}
      <circle cx="7" cy="2" r="1" fill="#fff" opacity={0.9} stroke="none" />
      <circle cx="12" cy="-2" r="0.8" fill={PM_L4_LEG} opacity={0.7} stroke="none" />
    </GlyphShell>
  );
}
/* ==========================================================================
 * IM-L1 -- The Compass
 * Base: Flat wireframe compass needle and ring.
 * Super: Solid brass compass housing, glass dome, ticking gears.
 * Legendary: Shattered glass, glowing star map hologram projecting up.
 * ========================================================================== */
const IM_L1_BASE_COLOR = "#004c6a";
const IM_L1_SUPER_COLOR = "#ff9b73";
const IM_L1_LEG_COLOR = "#00b60b";

export function IconLevelMasteryImL1Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Flat wireframe compass ring */}
      <circle cx="12" cy="12" r="7" fill="none" strokeWidth={1.5} />
      {/* Flat Needle */}
      <path d="M12 5 L14 12 L12 19 L10 12 Z" fill="none" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="1.5" fill="none" strokeWidth={1.5} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL1Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Heavy brass housing */}
      <circle cx="12" cy="13" r="8" fill={IM_L1_BASE_COLOR} opacity={0.8} stroke="none" />
      <circle cx="12" cy="12" r="8" fill={IM_L1_SUPER_COLOR} opacity={0.9} stroke="none" />
      <circle cx="12" cy="12" r="8" fill="none" strokeWidth={1.6} />
      <circle cx="12" cy="13" r="8" fill="none" strokeWidth={1.6} />

      {/* Ticking gears inside */}
      <circle cx="12" cy="12" r="6" fill="#222" opacity={0.6} stroke="none" />
      <path d="M9 12 A 3 3 0 0 1 12 9" fill="none" stroke="#fff" strokeWidth={1} opacity={0.4} strokeDasharray="1 1" />
      <path d="M15 12 A 3 3 0 0 1 12 15" fill="none" stroke="#fff" strokeWidth={1} opacity={0.4} strokeDasharray="1 1" />
      <circle cx="12" cy="12" r="3" fill="none" stroke={IM_L1_SUPER_COLOR} strokeWidth={1.5} opacity={0.5} />

      {/* 3D Needle */}
      <path d="M12 6 L14.5 12 L12 12 Z" fill="#ff4444" opacity={0.9} stroke="none" />
      <path d="M12 6 L9.5 12 L12 12 Z" fill="#aa0000" opacity={0.9} stroke="none" />
      <path d="M12 18 L14.5 12 L12 12 Z" fill="#ccc" opacity={0.9} stroke="none" />
      <path d="M12 18 L9.5 12 L12 12 Z" fill="#888" opacity={0.9} stroke="none" />
      <path d="M12 6 L14.5 12 L12 18 L9.5 12 Z" fill="none" strokeWidth={1.2} />
      <circle cx="12" cy="12" r="2" fill={IM_L1_SUPER_COLOR} strokeWidth={1} />

      {/* Glass dome glare */}
      <path d="M7 8 A 5 5 0 0 1 11 5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL1Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Shattered housing bottom */}
      <path d="M4 12 C 4 17, 8 21, 12 21 C 16 21, 20 17, 20 12 C 20 10, 18 10, 16 11 L 12 9 L 8 11 C 6 10, 4 10, 4 12 Z" fill={IM_L1_BASE_COLOR} opacity={0.9} stroke="none" />
      <path d="M4 12 C 4 17, 8 21, 12 21 C 16 21, 20 17, 20 12 C 20 10, 18 10, 16 11 L 12 9 L 8 11 C 6 10, 4 10, 4 12 Z" fill="none" strokeWidth={1.6} />

      {/* Glowing core emitting hologram */}
      <circle cx="12" cy="10" r="4" fill={IM_L1_LEG_COLOR} opacity={0.6} stroke="none" />
      <circle cx="12" cy="10" r="2" fill="#fff" opacity={0.9} stroke="none" />

      {/* Holographic Star Map Projecting Upward */}
      <path d="M12 10 L4 -2 M12 10 L10 -4 M12 10 L14 -4 M12 10 L20 -2" fill="none" stroke={IM_L1_LEG_COLOR} strokeWidth={1} opacity={0.6} />

      {/* Constellations */}
      <circle cx="6" cy="2" r="1.5" fill="#fff" stroke="none" />
      <circle cx="9" cy="-1" r="1" fill="#fff" stroke="none" />
      <circle cx="14" cy="3" r="1.2" fill="#fff" stroke="none" />
      <circle cx="18" cy="0" r="1.5" fill="#fff" stroke="none" />
      <path d="M6 2 L9 -1 M14 3 L18 0" fill="none" stroke={IM_L1_LEG_COLOR} strokeWidth={1.5} opacity={0.8} />

      {/* Floating shattered glass shards */}
      <path d="M5 6 L7 4 L6 7 Z" fill="#fff" opacity={0.7} stroke="none" />
      <path d="M18 5 L20 6 L19 8 Z" fill="#fff" opacity={0.7} stroke="none" />
    </GlyphShell>
  );
}

/* ==========================================================================
 * IM-L2 -- The Spyglass
 * Base: Simple collapsed cylinder outline.
 * Super: Fully extended 3-segment brass and leather telescope.
 * Legendary: Burning starlight beam firing out of the lens, leather burning away.
 * ========================================================================== */
const IM_L2_BASE_COLOR = "#402848";
const IM_L2_SUPER_COLOR = "#899ec8";
const IM_L2_LEG_COLOR = "#f1ebaf";

export function IconLevelMasteryImL2Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      {/* Collapsed simple cylinder outline */}
      <path d="M8 21 L8 14 L16 14 L16 21 Z" fill="none" strokeWidth={1.5} strokeLinejoin="miter" />
      <path d="M7 14 L17 14 L17 12 L7 12 Z" fill="none" strokeWidth={1.5} strokeLinejoin="miter" />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL2Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Base segment (Leather wrapped) */}
      <path d="M7 21 L7 13 L17 13 L17 21 Z" fill={IM_L2_BASE_COLOR} opacity={0.8} stroke="none" />
      <path d="M7 21 L7 13 L17 13 L17 21 Z" fill="none" strokeWidth={1.6} />
      <path d="M9 13 L9 21 M12 13 L12 21 M15 13 L15 21" fill="none" stroke="#000" strokeWidth={0.8} opacity={0.3} />

      {/* Middle segment (Brass) */}
      <path d="M8.5 13 L8.5 7 L15.5 7 L15.5 13 Z" fill={IM_L2_SUPER_COLOR} opacity={0.8} stroke="none" />
      <path d="M8.5 13 L8.5 7 L15.5 7 L15.5 13 Z" fill="none" strokeWidth={1.6} />
      <path d="M9.5 7 L9.5 13" fill="none" stroke="#fff" strokeWidth={1} opacity={0.5} />

      {/* Top segment (Lens housing) */}
      <path d="M10 7 L10 2 L14 2 L14 7 Z" fill={IM_L2_SUPER_COLOR} opacity={0.9} stroke="none" />
      <path d="M9 2 L15 2 L15 0 L9 0 Z" fill={IM_L2_SUPER_COLOR} opacity={0.7} stroke="none" />
      <path d="M10 7 L10 2 L14 2 L14 7 Z" fill="none" strokeWidth={1.6} />
      <path d="M9 2 L15 2 L15 0 L9 0 Z" fill="none" strokeWidth={1.6} />

      {/* Glass Lens */}
      <ellipse cx="12" cy="0" rx="2.5" ry="1" fill="#44ccff" opacity={0.8} />
      <path d="M11 0 L13 0" fill="none" stroke="#fff" strokeWidth={1} opacity={0.9} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL2Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Starlight Beam firing up */}
      <path d="M12 -2 L6 -8 L18 -8 Z" fill={IM_L2_LEG_COLOR} opacity={0.5} stroke="none" />
      <path d="M12 -2 L9 -8 L15 -8 Z" fill="#fff" opacity={0.8} stroke="none" />
      <circle cx="12" cy="-2" r="3" fill={IM_L2_LEG_COLOR} opacity={0.8} stroke="none" />

      {/* Burned Base segment */}
      <path d="M7 21 L7 13 L17 13 L17 21 Z" fill={IM_L2_BASE_COLOR} opacity={0.9} stroke="none" />
      <path d="M7 21 L7 13 C 10 16, 14 12, 17 13 L17 21 Z" fill="#222" opacity={0.8} stroke="none" /> {/* Charred leather */}
      <path d="M7 21 L7 13 L17 13 L17 21 Z" fill="none" strokeWidth={1.6} />

      {/* Overheating Middle segment (Brass) */}
      <path d="M8.5 13 L8.5 7 L15.5 7 L15.5 13 Z" fill={IM_L2_SUPER_COLOR} opacity={0.5} stroke="none" />
      <path d="M8.5 13 L8.5 7 L15.5 7 L15.5 13 Z" fill={IM_L2_LEG_COLOR} opacity={0.4} stroke="none" />
      <path d="M8.5 13 L8.5 7 L15.5 7 L15.5 13 Z" fill="none" strokeWidth={1.6} />

      {/* Top segment (Melting/Glowing) */}
      <path d="M10 7 L10 2 L14 2 L14 7 Z" fill={IM_L2_LEG_COLOR} opacity={0.8} stroke="none" />
      <path d="M9 2 L15 2 L15 0 L9 0 Z" fill={IM_L2_SUPER_COLOR} opacity={0.8} stroke="none" />
      <path d="M10 7 L10 2 L14 2 L14 7 Z" fill="none" strokeWidth={1.6} />
      <path d="M9 2 L15 2 L15 0 L9 0 Z" fill="none" strokeWidth={1.6} />

      {/* Floating glowing embers */}
      <circle cx="8" cy="8" r="0.8" fill={IM_L2_LEG_COLOR} stroke="none" />
      <circle cx="15" cy="4" r="1.2" fill="#fff" stroke="none" />
      <circle cx="17" cy="11" r="0.8" fill={IM_L2_LEG_COLOR} stroke="none" />
    </GlyphShell>
  );
}

/* ==========================================================================
 * IM-L3 -- The Ship's Helm
 * Base: Basic 4-spoke wheel outline.
 * Super: Heavy 8-spoke solid wheel with iron banding.
 * Legendary: Wheel spinning violently, ethereal energy vortex.
 * ========================================================================== */
const IM_L3_BASE_COLOR = "#8e707a";
const IM_L3_SUPER_COLOR = "#950437";
const IM_L3_LEG_COLOR = "#913f77";

export function IconLevelMasteryImL3Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      <circle cx="12" cy="11" r="7" fill="none" strokeWidth={1.5} />
      <circle cx="12" cy="11" r="5" fill="none" strokeWidth={1.5} />
      <path d="M12 2 L12 20 M3 11 L21 11" fill="none" strokeWidth={1.5} />
      <circle cx="12" cy="11" r="1.5" fill="none" strokeWidth={1.5} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL3Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* 8 Spokes (thick) */}
      <g strokeWidth={1.6}>
        <path d="M12 2 L12 20 M3 11 L21 11 M5.5 4.5 L18.5 17.5 M5.5 17.5 L18.5 4.5" fill="none" />
      </g>
      <g stroke={IM_L3_BASE_COLOR} strokeWidth={3} opacity={0.8}>
        <path d="M12 2 L12 20 M3 11 L21 11 M5.5 4.5 L18.5 17.5 M5.5 17.5 L18.5 4.5" fill="none" />
      </g>

      {/* Outer wooden rim */}
      <circle cx="12" cy="11" r="6.5" fill={IM_L3_BASE_COLOR} opacity={0.9} stroke="none" />
      <circle cx="12" cy="11" r="5" fill="#111" opacity={0.5} stroke="none" />
      <circle cx="12" cy="11" r="6.5" fill="none" strokeWidth={1.6} />
      <circle cx="12" cy="11" r="5" fill="none" strokeWidth={1.6} />

      {/* Iron hub */}
      <circle cx="12" cy="11" r="2.5" fill={IM_L3_SUPER_COLOR} opacity={0.9} stroke="none" />
      <circle cx="12" cy="11" r="2.5" fill="none" strokeWidth={1.6} />
      <circle cx="12" cy="11" r="1" fill="#fff" opacity={0.5} stroke="none" />

      {/* Peg highlights */}
      <circle cx="12" cy="3" r="0.8" fill={IM_L3_SUPER_COLOR} stroke="none" />
      <circle cx="12" cy="19" r="0.8" fill={IM_L3_SUPER_COLOR} stroke="none" />
      <circle cx="4" cy="11" r="0.8" fill={IM_L3_SUPER_COLOR} stroke="none" />
      <circle cx="20" cy="11" r="0.8" fill={IM_L3_SUPER_COLOR} stroke="none" />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL3Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Glowing Ethereal Vortex Behind */}
      <path d="M12 11 A 8 8 0 0 1 20 11 A 8 8 0 0 1 12 19 A 8 8 0 0 1 4 11 A 8 8 0 0 1 12 11 Z" fill={IM_L3_LEG_COLOR} opacity={0.3} stroke="none" />
      <path d="M12 11 A 6 6 0 0 0 6 5 A 6 6 0 0 0 12 17 A 6 6 0 0 0 18 11 Z" fill={IM_L3_LEG_COLOR} opacity={0.5} stroke="none" />

      {/* Motion Blur Spokes */}
      <g stroke={IM_L3_LEG_COLOR} strokeWidth={2} opacity={0.7} strokeDasharray="4 2">
        <path d="M12 1 L12 21 M2 11 L22 11 M5 4 L19 18 M5 18 L19 4" fill="none" />
        <path d="M10 2 L14 20 M4 9 L20 13 M7 4 L17 18 M5 16 L19 6" fill="none" />
      </g>

      {/* Outer wooden rim (breaking apart) */}
      <path d="M12 4.5 A 6.5 6.5 0 0 1 18.5 11" fill="none" strokeWidth={1.6} />
      <path d="M18.5 11 A 6.5 6.5 0 0 1 12 17.5" fill="none" strokeWidth={1.6} strokeDasharray="3 3" />
      <path d="M12 17.5 A 6.5 6.5 0 0 1 5.5 11" fill="none" strokeWidth={1.6} />
      <path d="M5.5 11 A 6.5 6.5 0 0 1 12 4.5" fill="none" strokeWidth={1.6} strokeDasharray="4 2" />

      {/* Iron hub exploding */}
      <circle cx="12" cy="11" r="3" fill={IM_L3_LEG_COLOR} opacity={0.9} stroke="none" />
      <circle cx="12" cy="11" r="1.5" fill="#fff" opacity={0.9} stroke="none" />
      <path d="M12 8 L13 11 L16 11 L13 12 L14 15 L12 13 L10 15 L11 12 L8 11 L11 11 Z" fill="#fff" stroke="none" />
    </GlyphShell>
  );
}

/* ==========================================================================
 * IM-L4 -- The Astrolabe / Armillary Sphere
 * Base: Simple 2D circle with equator.
 * Super: Interlocking 3D brass rings.
 * Legendary: Brass rings align, glowing miniature solar system in center.
 * ========================================================================== */
const IM_L4_BASE_COLOR = "#56782c";
const IM_L4_SUPER_COLOR = "#708f7f";
const IM_L4_LEG_COLOR = "#64aece";

export function IconLevelMasteryImL4Base(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />
      <circle cx="12" cy="11" r="8" fill="none" strokeWidth={1.5} />
      <path d="M4 11 L20 11" fill="none" strokeWidth={1.5} />
      <path d="M12 3 L12 19" fill="none" strokeWidth={1.5} />
      <circle cx="12" cy="11" r="2" fill="none" strokeWidth={1.5} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL4Super(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Outer Meridian Ring */}
      <circle cx="12" cy="11" r="8.5" fill="none" stroke={IM_L4_BASE_COLOR} strokeWidth={2.5} opacity={0.8} />
      <circle cx="12" cy="11" r="8.5" fill="none" strokeWidth={1.6} />

      {/* Equator Ring (3D ellipse) */}
      <ellipse cx="12" cy="11" rx="8" ry="3" fill="none" stroke={IM_L4_SUPER_COLOR} strokeWidth={2} opacity={0.9} />
      <ellipse cx="12" cy="11" rx="8" ry="3" fill="none" strokeWidth={1.2} />

      {/* Ecliptic Ring (Tilted) */}
      <ellipse cx="12" cy="11" rx="7.5" ry="2.5" transform="rotate(30 12 11)" fill="none" stroke={IM_L4_SUPER_COLOR} strokeWidth={2} opacity={0.7} />
      <ellipse cx="12" cy="11" rx="7.5" ry="2.5" transform="rotate(30 12 11)" fill="none" strokeWidth={1.2} />

      {/* Center Earth globe */}
      <circle cx="12" cy="11" r="2.5" fill={IM_L4_BASE_COLOR} stroke="none" />
      <circle cx="12" cy="11" r="2.5" fill="none" strokeWidth={1.6} />
      <path d="M11 9 C 13 10, 14 12, 11 13" fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.5} />

      {/* Support Stand */}
      <path d="M12 19.5 L12 21 M9 21 L15 21" fill="none" strokeWidth={2} />
    </GlyphShell>
  );
}

export function IconLevelMasteryImL4Legendary(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M1 21 H23" strokeWidth={1.5} />

      {/* Center Sun glowing */}
      <circle cx="12" cy="11" r="5" fill={IM_L4_LEG_COLOR} opacity={0.4} stroke="none" />
      <circle cx="12" cy="11" r="3.5" fill={IM_L4_SUPER_COLOR} opacity={0.8} stroke="none" />
      <circle cx="12" cy="11" r="2" fill="#fff" opacity={0.9} stroke="none" />

      {/* Outer Meridian Ring (Gold/Glowing) */}
      <circle cx="12" cy="11" r="8.5" fill="none" stroke={IM_L4_SUPER_COLOR} strokeWidth={2.5} opacity={0.9} />
      <circle cx="12" cy="11" r="8.5" fill="none" strokeWidth={1.6} />

      {/* Ethereal Orbital Paths */}
      <ellipse cx="12" cy="11" rx="8" ry="3" fill="none" stroke={IM_L4_LEG_COLOR} strokeWidth={1.5} opacity={0.8} />
      <ellipse cx="12" cy="11" rx="7.5" ry="2.5" transform="rotate(45 12 11)" fill="none" stroke={IM_L4_LEG_COLOR} strokeWidth={1.5} opacity={0.6} />
      <ellipse cx="12" cy="11" rx="7.5" ry="2.5" transform="rotate(-45 12 11)" fill="none" stroke={IM_L4_LEG_COLOR} strokeWidth={1.5} opacity={0.6} />

      {/* Orbiting Planets (Dots) */}
      <circle cx="19.5" cy="10" r="1.5" fill="#fff" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill={IM_L4_LEG_COLOR} stroke="none" />
      <circle cx="12" cy="5" r="1.2" fill={IM_L4_SUPER_COLOR} stroke="none" />
      <circle cx="15" cy="16" r="0.8" fill="#fff" stroke="none" />

      {/* Magic Runes floating on the edge */}
      <path d="M11 2 L13 2 M12 1 L12 3" fill="none" stroke={IM_L4_LEG_COLOR} strokeWidth={1} />
      <path d="M20 11 L22 11 M21 10 L21 12" fill="none" stroke={IM_L4_LEG_COLOR} strokeWidth={1} />

      {/* Support Stand (Intact) */}
      <path d="M12 19.5 L12 21 M9 21 L15 21" fill="none" strokeWidth={2} />
    </GlyphShell>
  );
}


export const levelMasteryImGlyphs = {
  LevelMasteryImL1Cleared: IconLevelMasteryImL1Base,
  LevelMasteryImL1Mastered: IconLevelMasteryImL1Super,
  LevelMasteryImL1Perfected: IconLevelMasteryImL1Legendary,
  LevelMasteryImL2Cleared: IconLevelMasteryImL2Base,
  LevelMasteryImL2Mastered: IconLevelMasteryImL2Super,
  LevelMasteryImL2Perfected: IconLevelMasteryImL2Legendary,
  LevelMasteryImL3Cleared: IconLevelMasteryImL3Base,
  LevelMasteryImL3Mastered: IconLevelMasteryImL3Super,
  LevelMasteryImL3Perfected: IconLevelMasteryImL3Legendary,
  LevelMasteryImL4Cleared: IconLevelMasteryImL4Base,
  LevelMasteryImL4Mastered: IconLevelMasteryImL4Super,
  LevelMasteryImL4Perfected: IconLevelMasteryImL4Legendary,
};

export const referenceBatchGlyphs = {
  SpeedComet: IconSpeedComet,
  PerfectionistGem: IconPerfectionistGem,
  PerfectionistGemMythic: IconPerfectionistGemMythic,
  LevelMonument: IconLevelMonument,
  StreakChainLegendary: IconStreakChainLegendary,

  // PHASE 3 (2026-07-29) -- Level Mastery, BM-L1. Each tier is its own
  // escalated icon (corrected after live review -- see the header comment
  // above IconLevelMasteryBmL1Base for why), not one shape recolored 3
  // times.
  LevelMasteryBmL1Cleared: IconLevelMasteryBmL1Base,
  LevelMasteryBmL1Mastered: IconLevelMasteryBmL1Super,
  LevelMasteryBmL1Perfected: IconLevelMasteryBmL1Legendary,

  // PHASE 3, Batch 2 (2026-07-29) -- Level Mastery, MM-L1.
  LevelMasteryMmL1Cleared: IconLevelMasteryMmL1Base,
  LevelMasteryMmL1Mastered: IconLevelMasteryMmL1Super,
  LevelMasteryMmL1Perfected: IconLevelMasteryMmL1Legendary,

  // PHASE 3, Batch 3 (2026-07-29) -- Level Mastery, YLM-L1/L2/L3.
  LevelMasteryYlmL1Cleared: IconLevelMasteryYlmL1Base,
  LevelMasteryYlmL1Mastered: IconLevelMasteryYlmL1Super,
  LevelMasteryYlmL1Perfected: IconLevelMasteryYlmL1Legendary,
  LevelMasteryYlmL2Cleared: IconLevelMasteryYlmL2Base,
  LevelMasteryYlmL2Mastered: IconLevelMasteryYlmL2Super,
  LevelMasteryYlmL2Perfected: IconLevelMasteryYlmL2Legendary,
  LevelMasteryYlmL3Cleared: IconLevelMasteryYlmL3Base,
  LevelMasteryYlmL3Mastered: IconLevelMasteryYlmL3Super,
  LevelMasteryYlmL3Perfected: IconLevelMasteryYlmL3Legendary,
  // PHASE 3, Batch 4 (2026-07-30) -- Level Mastery, PM-L1/L2/L3/L4.
  LevelMasteryPmL1Cleared: IconLevelMasteryPmL1Base,
  LevelMasteryPmL1Mastered: IconLevelMasteryPmL1Super,
  LevelMasteryPmL1Perfected: IconLevelMasteryPmL1Legendary,
  LevelMasteryPmL2Cleared: IconLevelMasteryPmL2Base,
  LevelMasteryPmL2Mastered: IconLevelMasteryPmL2Super,
  LevelMasteryPmL2Perfected: IconLevelMasteryPmL2Legendary,
  LevelMasteryPmL3Cleared: IconLevelMasteryPmL3Base,
  LevelMasteryPmL3Mastered: IconLevelMasteryPmL3Super,
  LevelMasteryPmL3Perfected: IconLevelMasteryPmL3Legendary,
  LevelMasteryPmL4Cleared: IconLevelMasteryPmL4Base,
  LevelMasteryPmL4Mastered: IconLevelMasteryPmL4Super,
  LevelMasteryPmL4Perfected: IconLevelMasteryPmL4Legendary,

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

/* ==========================================================================
 * PHASE 1 -- MYTHIC TIER (2026-07-28)
 * --------------------------------------------------------------------------
 * Nine hand-drawn marks for the new MYTHIC tier of the nine skill-badge
 * families that did not already have one. (The tenth, perfectionist, got
 * `IconPerfectionistGemMythic` in the reference batch above and is untouched.)
 *
 * CONTRACT: like the reference batch and UNLIKE batches 1 and 2, these are
 * brand-new iconName strings -- `SpeedCometMythic`, `CrownMythic`,
 * `InfinityMythic`, `DawnBreakMythic`, `PhoenixSurgeMythic`,
 * `LaurelCrownMythic`, `PrecisionCoreMythic`, `SummitMythic`, `OracleMythic`.
 * They were seeded by the backend alongside the nine new MYTHIC
 * AchievementBadge rows, so each key is owned by exactly one row and none of
 * them can shadow, or be shadowed by, a key an existing badge resolves through.
 *
 * DRAWING RULE FOR THIS TIER: every mark is the SAME OBJECT its family's
 * LEGENDARY mark draws, escalated -- not a new object. The tier step is carried
 * by (a) an added structural element that only a ceiling tier would earn (a
 * mach cone, a vault arch, an orbital ring, a horizon, a wing pair, a monument,
 * a collapsed core, a summit banner, an opened eye) and (b) a denser internal
 * facet/ray pass. If you can swap one of these with its family's LEGENDARY mark
 * and not notice, it is wrong.
 *
 * THREE OF THE NINE ARE DRAWN FOR A LIGHT CARD (`DawnBreakMythic`,
 * `LaurelCrownMythic`, `OracleMythic`): their badge colour is a high-luminance
 * near-white, so those three take an INK `iconColorHex` and their accent fills
 * are DEEP rather than bright. Bright accents vanish on those cards.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * M1. SpeedCometMythic -- Speed Demon, MYTHIC. Tachyon violet.
 * The BASE `SpeedComet` dart, now supersonic: the same raked crystal
 * silhouette, but a MACH CONE opens behind it (the structural addition), the
 * two trails become four of alternating weight, and the hot core at the waist
 * has bloomed into a four-point flare. Still leaning into its direction of
 * travel -- the family's asymmetry is the continuity.
 * ------------------------------------------------------------------------ */
const SDM_VIOLET = "#c445ff";
const SDM_HOT = "#f0b3ff";
const SDM_WHITE = "#ffffff";

export function IconSpeedCometMythic(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Mach cone -- the shock envelope the dart is outrunning. Drawn first
          and filled faintly so the dart reads as being INSIDE it. */}
      <path d="M21.4 2.4 L4.6 11.2 L7.8 22.4 Z" fill={SDM_VIOLET} opacity={0.14} stroke="none" />
      <g stroke={SDM_VIOLET} strokeWidth={1} opacity={0.5} fill="none">
        <path d="M21.4 2.4 L4.6 11.2" />
        <path d="M21.4 2.4 L7.8 22.4" />
      </g>

      {/* Four motion trails, alternating weight so they read as a wake rather
          than as hatching. All parallel to the dart's own axis. */}
      <g stroke={SDM_HOT} fill="none">
        <path d="M8.6 4.4 Q6.4 7.2 4.2 10.0" strokeWidth={1.15} opacity={0.55} />
        <path d="M11.4 5.4 Q9.2 8.0 7.0 10.6" strokeWidth={0.7} opacity={0.4} />
        <path d="M18.4 14.2 Q16.2 17.0 14.0 19.8" strokeWidth={1.15} opacity={0.55} />
        <path d="M20.8 15.4 Q19.0 17.8 17.2 20.2" strokeWidth={0.7} opacity={0.4} />
      </g>

      {/* Velocity echo -- the silhouette dropped back along its own axis. */}
      <path d="M19.9 4.6 L17.6 13.2 L8.4 20.4 L12.2 9.0 Z" fill={SDM_VIOLET} opacity={0.24} stroke="none" />

      {/* Hero dart. */}
      <path d="M22.3 1.5 L19.8 10.9 L9.5 18.9 L13.8 6.5 Z" fill={SDM_VIOLET} fillOpacity={0.3} />
      <path d="M22.3 1.5 L9.5 18.9" strokeWidth={1.05} opacity={0.9} />
      <path d="M13.8 6.5 L19.8 10.9" strokeWidth={1.05} opacity={0.7} />
      <path d="M16.1 4.0 L15.3 12.3" strokeWidth={0.75} opacity={0.5} />

      {/* Four-point flare where BASE had a plain round core. */}
      <path
        d="M17.9 4.6 L18.9 7.6 L21.9 8.6 L18.9 9.6 L17.9 12.6 L16.9 9.6 L13.9 8.6 L16.9 7.6 Z"
        fill={SDM_WHITE}
        stroke="none"
      />
      <circle cx="17.9" cy="8.6" r="1.15" fill={SDM_HOT} stroke="none" opacity={0.95} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M2. CrownMythic -- Competitor, MYTHIC. Imperial sapphire.
 * The LEGENDARY `Crown` mark, vaulted. Same five-point coronet, but it now sits
 * UNDER an arch (the vault -- the structural addition, and the tie to the
 * `EnvCrownVault` cinematic), every point is capped by an orb rather than a
 * bare tip, and a jewelled band runs across the base. Five rays leave the
 * centre stone.
 * ------------------------------------------------------------------------ */
const CRM_SAPPHIRE = "#0064a8";
const CRM_BRIGHT = "#4aa8e8";
const CRM_LIGHT = "#d6ecff";

export function IconCrownMythic(props: BadgeGlyphProps) {
  const points: [number, number, number][] = [
    [3.0, 8.6, 1.05],
    [7.5, 5.4, 1.25],
    [12.0, 2.9, 1.55],
    [16.5, 5.4, 1.25],
    [21.0, 8.6, 1.05],
  ];
  return (
    <GlyphShell {...props}>
      {/* Vault arch. Open at the bottom, so the crown sits in it rather than
          on it -- this is the one element the LEGENDARY mark does not have. */}
      <path d="M1.4 21.6 V11.4 A10.6 10.6 0 0 1 22.6 11.4 V21.6" strokeWidth={1.05} opacity={0.45} fill="none" />
      <path d="M3.4 21.6 V11.6 A8.6 8.6 0 0 1 20.6 11.6 V21.6" strokeWidth={0.6} opacity={0.28} fill="none" />

      {/* Rays off the centre stone. */}
      <g stroke={CRM_BRIGHT} strokeWidth={0.8} opacity={0.65}>
        <path d="M12 2.4 V0.5" />
        <path d="M9.0 3.4 L7.7 1.8" />
        <path d="M15.0 3.4 L16.3 1.8" />
        <path d="M6.6 5.6 L5.0 4.4" />
        <path d="M17.4 5.6 L19.0 4.4" />
      </g>

      {/* Coronet body -- the same zig-zag the LEGENDARY Crown draws. */}
      <path
        d="M3.0 8.6 L7.5 5.4 L12 2.9 L16.5 5.4 L21 8.6 L19.4 18.2 L4.6 18.2 Z"
        fill={CRM_SAPPHIRE}
        fillOpacity={0.42}
        strokeWidth={1.45}
      />
      {/* Interior facets: each point drops a line to the band. */}
      <g strokeWidth={0.75} opacity={0.5}>
        <path d="M7.5 5.4 L8.2 14.4" />
        <path d="M12 2.9 L12 14.4" />
        <path d="M16.5 5.4 L15.8 14.4" />
      </g>

      {/* Jewelled band. */}
      <path d="M4.6 18.2 H19.4 L19.0 21.4 H5.0 Z" fill={CRM_SAPPHIRE} fillOpacity={0.6} strokeWidth={1.2} />
      <g fill={CRM_LIGHT} stroke="none">
        <circle cx="8.2" cy="19.8" r="0.8" />
        <circle cx="12" cy="19.8" r="1" />
        <circle cx="15.8" cy="19.8" r="0.8" />
      </g>

      {/* Orb caps -- the tier step: LEGENDARY's points are bare, these are set. */}
      <g stroke="none">
        {points.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i === 2 ? CRM_LIGHT : CRM_BRIGHT} />
        ))}
      </g>
      <circle cx="12" cy="2.9" r="2.5" stroke={CRM_LIGHT} strokeWidth={0.6} fill="none" opacity={0.55} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M3. InfinityMythic -- Unstoppable Streak, MYTHIC. Eternal turquoise.
 * The LEGENDARY `Infinity` lemniscate, made eternal rather than merely long:
 * the single line becomes a WOVEN DOUBLE BAND (two offset lemniscates that
 * cross at the waist), an orbital ring is set behind it, and twelve tick marks
 * ring the whole figure like a dial with no start and no end. Deliberately no
 * fire anywhere -- this family is non-fire by construction.
 * ------------------------------------------------------------------------ */
const INM_TURQ = "#0bcda8";
const INM_DEEP = "#06705d";
const INM_LIGHT = "#9ffbe6";

export function IconInfinityMythic(props: BadgeGlyphProps) {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 3 === 0;
    ticks.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * 10.1).toFixed(2)} ${(12 + Math.sin(a) * 10.1).toFixed(2)} L${(12 + Math.cos(a) * (long ? 11.6 : 11.0)).toFixed(2)} ${(12 + Math.sin(a) * (long ? 11.6 : 11.0)).toFixed(2)}`}
        strokeWidth={long ? 1.2 : 0.7}
        opacity={long ? 0.85 : 0.5}
      />
    );
  }
  // The lemniscate, twice, offset on Y -- the two strands of the weave.
  const lemni = (dy: number) =>
    `M12 ${12 + dy} C12 ${8.4 + dy} 14.6 ${6.6 + dy} 17.0 ${6.6 + dy} C19.6 ${6.6 + dy} 21.6 ${9.0 + dy} 21.6 ${12 + dy} C21.6 ${15.0 + dy} 19.6 ${17.4 + dy} 17.0 ${17.4 + dy} C14.6 ${17.4 + dy} 12 ${15.6 + dy} 12 ${12 + dy} C12 ${8.4 + dy} 9.4 ${6.6 + dy} 7.0 ${6.6 + dy} C4.4 ${6.6 + dy} 2.4 ${9.0 + dy} 2.4 ${12 + dy} C2.4 ${15.0 + dy} 4.4 ${17.4 + dy} 7.0 ${17.4 + dy} C9.4 ${17.4 + dy} 12 ${15.6 + dy} 12 ${12 + dy} Z`;

  return (
    <GlyphShell {...props}>
      {/* Dial ticks -- twelve positions, none of them a beginning. */}
      <g stroke={INM_TURQ}>{ticks}</g>

      {/* Orbital ring behind the figure. */}
      <ellipse cx="12" cy="12" rx="10.1" ry="4.0" stroke={INM_DEEP} strokeWidth={0.9} opacity={0.55} fill="none" transform="rotate(-16 12 12)" />

      {/* Woven double band. The lower strand is drawn first and darker, so the
          two cross rather than overlap. */}
      <path d={lemni(1.1)} fill={INM_DEEP} fillOpacity={0.32} stroke={INM_DEEP} strokeWidth={1.15} opacity={0.85} />
      <path d={lemni(-1.1)} fill={INM_TURQ} fillOpacity={0.22} strokeWidth={1.5} />

      {/* Waist crossing -- the knot that makes the weave legible at card size. */}
      <path d="M9.6 9.4 L14.4 14.6" stroke={INM_LIGHT} strokeWidth={1} opacity={0.8} />
      <path d="M14.4 9.4 L9.6 14.6" stroke={INM_LIGHT} strokeWidth={1} opacity={0.8} />

      {/* Travelling node -- the streak's current position on a loop with no end. */}
      <circle cx="20.4" cy="10.0" r="1.5" fill={INM_LIGHT} stroke="none" />
      <circle cx="20.4" cy="10.0" r="2.6" stroke={INM_LIGHT} strokeWidth={0.6} fill="none" opacity={0.5} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M4. DawnBreakMythic -- Early Bird, MYTHIC. Genesis solar.
 * The family's Clock -> Sun -> AlarmClock line resolves into the event those
 * three were counting down to. The sun is no longer a disc floating in space
 * (that is `Sun`, SUPER): it is BREAKING A HORIZON -- the horizon line is the
 * structural addition -- with a twelve-ray corona, a returning-light band on
 * the water below, and one bird crossing the disc.
 * DRAWN FOR A LIGHT CARD: accents are deep amber, not bright.
 * ------------------------------------------------------------------------ */
const DBM_DEEP = "#7a4f00";
const DBM_MID = "#c98a00";
const DBM_PALE = "#fff0b8";

export function IconDawnBreakMythic(props: BadgeGlyphProps) {
  const rays = [];
  for (let i = 0; i < 11; i++) {
    // Half-wheel only: rays above the horizon, which is what makes it a
    // sunRISE rather than a sun.
    const a = Math.PI + (i / 10) * Math.PI;
    const long = i % 2 === 0;
    rays.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * 7.4).toFixed(2)} ${(15.4 + Math.sin(a) * 7.4).toFixed(2)} L${(12 + Math.cos(a) * (long ? 11.2 : 9.4)).toFixed(2)} ${(15.4 + Math.sin(a) * (long ? 11.2 : 9.4)).toFixed(2)}`}
        strokeWidth={long ? 1.3 : 0.75}
        opacity={long ? 0.9 : 0.5}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      <g stroke={DBM_MID}>{rays}</g>

      {/* Sun disc, clipped by the horizon: the arc stops at y = 15.4. */}
      <path d="M6.2 15.4 A5.8 5.8 0 0 1 17.8 15.4 Z" fill={DBM_MID} fillOpacity={0.4} strokeWidth={1.5} />
      <path d="M8.6 15.4 A3.4 3.4 0 0 1 15.4 15.4 Z" fill={DBM_PALE} fillOpacity={0.85} stroke={DBM_DEEP} strokeWidth={0.7} />

      {/* Horizon -- the whole point of the mark. Heavier than anything else. */}
      <path d="M0.8 15.4 H23.2" strokeWidth={1.7} />

      {/* Returning light on the water: a band of decreasing dashes. */}
      <g stroke={DBM_MID} strokeLinecap="round">
        <path d="M7.6 17.4 H16.4" strokeWidth={1.15} opacity={0.75} />
        <path d="M8.8 19.2 H15.2" strokeWidth={0.95} opacity={0.6} />
        <path d="M9.8 20.9 H14.2" strokeWidth={0.8} opacity={0.45} />
      </g>
      {/* Far shoreline, so the horizon reads as a place and not as a rule. */}
      <path d="M0.8 15.4 L3.6 13.6 L5.4 15.4" strokeWidth={0.85} opacity={0.55} fill="none" />
      <path d="M18.8 15.4 L20.8 13.9 L23.2 15.4" strokeWidth={0.85} opacity={0.55} fill="none" />

      {/* One bird crossing the disc -- the badge is called Early Bird. */}
      <path d="M9.6 9.2 Q11.0 7.9 12.2 9.2 Q13.4 7.9 14.8 9.2" strokeWidth={1.1} fill="none" stroke={DBM_DEEP} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M5. PhoenixSurgeMythic -- Comeback Kid, MYTHIC. Phoenix ember.
 * The family's whole line is arrows going up (TrendingUp -> ArrowUpRight ->
 * ChevronsUp). At MYTHIC the arrow GROWS WINGS: the ascending chevron stack is
 * still the spine of the mark, but a pair of swept wings opens off it and an
 * updraft of three decaying chevrons feeds it from below. Rebirth, not just
 * recovery.
 * ------------------------------------------------------------------------ */
const PSM_EMBER = "#dd5c3b";
const PSM_HOT = "#ffb391";
const PSM_DEEP = "#6d230f";

export function IconPhoenixSurgeMythic(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Wings. Swept back and up; the far wing is darker so the bird has
          depth rather than reading as a flat butterfly. */}
      <path
        d="M11.2 9.4 C8.2 7.4 4.6 6.8 1.4 8.2 C3.6 9.4 4.6 11.0 4.8 13.0 C6.4 11.8 8.4 11.6 10.4 12.4 Z"
        fill={PSM_DEEP}
        fillOpacity={0.55}
        strokeWidth={1.15}
      />
      <path
        d="M12.8 9.4 C15.8 7.4 19.4 6.8 22.6 8.2 C20.4 9.4 19.4 11.0 19.2 13.0 C17.6 11.8 15.6 11.6 13.6 12.4 Z"
        fill={PSM_EMBER}
        fillOpacity={0.5}
        strokeWidth={1.15}
      />
      {/* Primary feathers -- three strokes per wing, unequal. */}
      <g stroke={PSM_HOT} strokeWidth={0.7} opacity={0.7} fill="none">
        <path d="M9.8 9.8 L5.2 9.0" />
        <path d="M9.4 11.2 L5.8 11.2" />
        <path d="M14.2 9.8 L18.8 9.0" />
        <path d="M14.6 11.2 L18.2 11.2" />
      </g>

      {/* Spine: the ascending chevron stack, tightening as it rises. */}
      <path d="M12 1.4 L16.4 6.6 H13.9 L13.9 9.6 H10.1 L10.1 6.6 H7.6 Z" fill={PSM_EMBER} fillOpacity={0.55} strokeWidth={1.4} />
      <path d="M12 4.2 L12 8.8" strokeWidth={0.75} opacity={0.55} />

      {/* Body / tail, tapering to a point so the whole mark still reads as an
          upward arrow at 32px. */}
      <path d="M10.6 12.2 L13.4 12.2 L12.6 17.4 L12 19.2 L11.4 17.4 Z" fill={PSM_EMBER} fillOpacity={0.6} strokeWidth={1.15} />

      {/* Updraft: three decaying chevrons feeding the rise. */}
      <g strokeWidth={1.25} fill="none" stroke={PSM_HOT}>
        <path d="M8.2 18.4 L12 15.6 L15.8 18.4" opacity={0.75} />
        <path d="M9.4 21.0 L12 19.0 L14.6 21.0" opacity={0.5} />
        <path d="M10.4 23.2 L12 21.8 L13.6 23.2" opacity={0.3} />
      </g>

      {/* Ignition point at the sternum. */}
      <circle cx="12" cy="11.0" r="1.35" fill={PSM_HOT} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M6. LaurelCrownMythic -- Podium Finisher, MYTHIC ("The Immortal").
 * LEGENDARY is "The Champion" and its mark is a closed wreath. Immortality is
 * not a bigger wreath, so the structural addition is a MONUMENT: the wreath now
 * encircles a standing stele with the winner's star cut into it, on a stepped
 * plinth. The wreath is what you win; the stele is what outlives you.
 * DRAWN FOR A LIGHT CARD: accents are deep olive, not bright.
 * ------------------------------------------------------------------------ */
const LCM_DEEP = "#41521a";
const LCM_MID = "#8ba336";
const LCM_PALE = "#eeffc4";

export function IconLaurelCrownMythic(props: BadgeGlyphProps) {
  // Six leaves per side, mirrored. Deterministic -- this renders on every card.
  const leaf = (side: 1 | -1, i: number) => {
    const a = -1.15 + (i / 5) * 2.0; // radians, sweeping up the side
    const cx = 12 + side * (7.6 + Math.cos(a) * 0.6);
    const cy = 13.4 + Math.sin(a) * 6.6;
    const rot = (side === 1 ? 34 : -34) + i * (side === 1 ? -11 : 11);
    return (
      <ellipse
        key={`${side}-${i}`}
        cx={cx.toFixed(2)}
        cy={cy.toFixed(2)}
        rx="2.5"
        ry="1.15"
        transform={`rotate(${rot} ${cx.toFixed(2)} ${cy.toFixed(2)})`}
        fill={i % 2 === 0 ? LCM_MID : LCM_DEEP}
        fillOpacity={i % 2 === 0 ? 0.7 : 0.5}
        stroke={LCM_DEEP}
        strokeWidth={0.5}
      />
    );
  };
  return (
    <GlyphShell {...props}>
      {/* Wreath branches -- the two arcs the leaves are set on. */}
      <path d="M8.4 21.0 C3.8 18.4 3.4 10.6 7.8 4.8" strokeWidth={1.2} fill="none" opacity={0.8} />
      <path d="M15.6 21.0 C20.2 18.4 20.6 10.6 16.2 4.8" strokeWidth={1.2} fill="none" opacity={0.8} />
      <g stroke="none">
        {[0, 1, 2, 3, 4, 5].map((i) => leaf(1, i))}
        {[0, 1, 2, 3, 4, 5].map((i) => leaf(-1, i))}
      </g>
      {/* Tie at the foot of the wreath. */}
      <path d="M9.6 21.2 L12 22.6 L14.4 21.2" strokeWidth={1.1} fill="none" />

      {/* The stele -- the element LEGENDARY does not have. */}
      <path d="M9.5 18.2 V6.6 L12 3.6 L14.5 6.6 V18.2 Z" fill={LCM_DEEP} fillOpacity={0.45} strokeWidth={1.35} />
      {/* Stepped plinth. */}
      <path d="M8.4 18.2 H15.6 V19.7 H8.4 Z" fill={LCM_DEEP} fillOpacity={0.6} strokeWidth={1} />

      {/* The winner's star, cut INTO the stone (pale, so it reads as a void). */}
      <path
        d="M12 8.0 L13.05 11.0 L16.2 11.0 L13.65 12.9 L14.6 15.9 L12 14.05 L9.4 15.9 L10.35 12.9 L7.8 11.0 L10.95 11.0 Z"
        fill={LCM_PALE}
        stroke={LCM_DEEP}
        strokeWidth={0.55}
      />
      {/* Two carved rules above and below the star -- an inscription that is
          deliberately unreadable at this size. */}
      <g stroke={LCM_DEEP} strokeWidth={0.6} opacity={0.6}>
        <path d="M10.2 6.2 H13.8" />
        <path d="M10.2 17.0 H13.8" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M7. PrecisionCoreMythic -- Sharpshooter, MYTHIC. Singularity rose.
 * Crosshair -> Aperture -> Radar all SEARCH. This one has already found it: the
 * reticle has COLLAPSED. Four heavy lock brackets have closed all the way in on
 * a core barely a pixel across, the concentric rings are drawn as broken arcs
 * (a lock, not a target) and every ring is inside the previous one. The
 * structural addition is the bracket set -- nothing below this tier has it.
 * ------------------------------------------------------------------------ */
const PCM_ROSE = "#ea7ba9";
const PCM_DEEP = "#7c2748";
const PCM_LIGHT = "#ffdcea";

export function IconPrecisionCoreMythic(props: BadgeGlyphProps) {
  // Four corner brackets, closed in tight on the core.
  const bracket = (sx: 1 | -1, sy: 1 | -1, i: number) => {
    const x = 12 + sx * 5.4;
    const y = 12 + sy * 5.4;
    return (
      <path
        key={i}
        d={`M${x} ${y - sy * 2.6} L${x} ${y} L${x - sx * 2.6} ${y}`}
        strokeWidth={1.8}
        fill="none"
      />
    );
  };
  return (
    <GlyphShell {...props}>
      {/* Outer arcs -- broken, because a lock reads as segments and a target
          reads as full circles. Each pair is rotated off the last. */}
      <g stroke={PCM_ROSE} fill="none">
        <path d="M12 1.6 A10.4 10.4 0 0 1 22.4 12" strokeWidth={1.15} opacity={0.6} />
        <path d="M12 22.4 A10.4 10.4 0 0 1 1.6 12" strokeWidth={1.15} opacity={0.6} />
        <path d="M19.4 4.6 A10.4 10.4 0 0 1 21.2 7.4" strokeWidth={0.8} opacity={0.4} />
        <path d="M4.6 19.4 A10.4 10.4 0 0 1 2.8 16.6" strokeWidth={0.8} opacity={0.4} />
      </g>
      <g stroke={PCM_DEEP} fill="none" opacity={0.75}>
        <path d="M4.4 8.0 A8.2 8.2 0 0 1 16.0 4.4" strokeWidth={1} />
        <path d="M19.6 16.0 A8.2 8.2 0 0 1 8.0 19.6" strokeWidth={1} />
      </g>

      {/* Lock brackets -- the tier's structural addition. */}
      <g stroke="currentColor">
        {bracket(-1, -1, 0)}
        {bracket(1, -1, 1)}
        {bracket(-1, 1, 2)}
        {bracket(1, 1, 3)}
      </g>

      {/* Cross hairs, cut away from the centre so the core is never touched. */}
      <g strokeWidth={0.9} opacity={0.7}>
        <path d="M12 6.2 V9.4" />
        <path d="M12 14.6 V17.8" />
        <path d="M6.2 12 H9.4" />
        <path d="M14.6 12 H17.8" />
      </g>

      {/* The collapsed core: a tiny, absolutely bright point with a halo. The
          smallness IS the statement -- everything else in the family is big. */}
      <circle cx="12" cy="12" r="3.1" fill={PCM_DEEP} fillOpacity={0.35} stroke={PCM_ROSE} strokeWidth={0.7} />
      <circle cx="12" cy="12" r="1.25" fill={PCM_LIGHT} stroke="none" />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M8. SummitMythic -- Underdog, MYTHIC. Summit sky.
 * LEGENDARY's `Mountain` is a ridge. This is the same ridge SUMMITED: the
 * structural addition is the switchback route drawn all the way up the face and
 * the planted banner at the top, plus a second, higher peak behind that the
 * route has already crossed. Cornice snow on the lee side keeps it from
 * reading as a triangle.
 * ------------------------------------------------------------------------ */
const SUM_SKY = "#8dbfff";
const SUM_DEEP = "#16407a";
const SUM_SNOW = "#eef5ff";

export function IconSummitMythic(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Stars -- altitude. Small, few, asymmetric. */}
      <g fill={SUM_SNOW} stroke="none" opacity={0.9}>
        <circle cx="4.2" cy="3.2" r="0.65" />
        <circle cx="19.4" cy="2.4" r="0.5" />
        <circle cx="21.4" cy="6.0" r="0.4" />
      </g>

      {/* Far peak, behind and to the right -- already crossed. */}
      <path d="M12.8 14.8 L17.4 5.8 L22.8 14.8 Z" fill={SUM_DEEP} fillOpacity={0.45} strokeWidth={1} opacity={0.7} />

      {/* Hero peak. */}
      <path d="M1.2 20.6 L9.4 4.2 L17.6 20.6 Z" fill={SUM_SKY} fillOpacity={0.28} strokeWidth={1.5} />
      {/* Cornice snow on the lee side only -- asymmetric, like real snow. */}
      <path d="M9.4 4.2 L12.6 10.6 L10.6 9.8 L8.6 11.2 L6.6 9.4 Z" fill={SUM_SNOW} fillOpacity={0.9} stroke={SUM_DEEP} strokeWidth={0.5} />
      {/* Face facet, so the mountain has a lit and an unlit side. */}
      <path d="M9.4 4.2 L9.4 20.6 L1.2 20.6 Z" fill={SUM_DEEP} fillOpacity={0.25} stroke="none" />

      {/* The route: a switchback climbing the face. This is the badge -- the
          underdog did not arrive at the top, they walked it. */}
      <path
        d="M4.0 20.2 L7.6 18.2 L4.8 16.0 L8.6 13.6 L6.2 11.4 L9.2 8.4"
        stroke={SUM_SNOW}
        strokeWidth={1.05}
        strokeDasharray="1.9 1.3"
        fill="none"
        opacity={0.95}
      />

      {/* Planted banner at the summit. */}
      <path d="M9.4 4.2 V0.9" strokeWidth={1.25} />
      <path d="M9.4 1.1 L14.2 2.2 L9.4 3.6 Z" fill={SUM_SKY} fillOpacity={0.95} strokeWidth={0.9} />

      {/* Ground line, so the summit has something to be above. */}
      <path d="M0.6 20.9 H23.4" strokeWidth={1.15} opacity={0.6} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * M9. OracleMythic -- High Achiever (`polymath`), MYTHIC.
 * Brain -> Lightbulb -> Library goes private thought -> single insight ->
 * collected knowledge. The ceiling is knowing it ALL AT ONCE, so the mark is an
 * open eye set in a mandorla, its iris built from the same node-and-edge
 * lattice the BASE `Brain` mark uses (that lattice is the family thread), with
 * eight rays and three orbiting archive nodes.
 * DRAWN FOR A LIGHT CARD: accents are deep violet, not bright.
 * ------------------------------------------------------------------------ */
const ORM_DEEP = "#4b1f6b";
const ORM_MID = "#9d5cc8";
const ORM_PALE = "#f6e2ff";

export function IconOracleMythic(props: BadgeGlyphProps) {
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const long = i % 2 === 0;
    rays.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * 8.6).toFixed(2)} ${(12 + Math.sin(a) * 8.6).toFixed(2)} L${(12 + Math.cos(a) * (long ? 11.4 : 10.1)).toFixed(2)} ${(12 + Math.sin(a) * (long ? 11.4 : 10.1)).toFixed(2)}`}
        strokeWidth={long ? 1.25 : 0.7}
        opacity={long ? 0.85 : 0.5}
      />
    );
  }
  // Iris lattice -- same construction language as IconMindLattice (BASE).
  const nodes: [number, number][] = [
    [12, 8.6],
    [15.0, 10.8],
    [13.9, 14.4],
    [10.1, 14.4],
    [9.0, 10.8],
  ];
  return (
    <GlyphShell {...props}>
      <g stroke={ORM_MID}>{rays}</g>

      {/* Mandorla -- two arcs meeting at points, not an ellipse. */}
      <path d="M1.6 12 C5.2 5.6 18.8 5.6 22.4 12 C18.8 18.4 5.2 18.4 1.6 12 Z" fill={ORM_DEEP} fillOpacity={0.22} strokeWidth={1.5} />
      {/* Lid crease above, so it reads as an eye and not as a lens. */}
      <path d="M3.6 10.2 C7.4 6.0 16.6 6.0 20.4 10.2" strokeWidth={0.7} opacity={0.45} fill="none" />

      {/* Iris. */}
      <circle cx="12" cy="12" r="5.0" fill={ORM_DEEP} fillOpacity={0.3} strokeWidth={1.2} />
      <g stroke={ORM_MID} strokeWidth={0.7} opacity={0.85} fill="none">
        <path d={`M${nodes[0][0]} ${nodes[0][1]} L${nodes[1][0]} ${nodes[1][1]} L${nodes[2][0]} ${nodes[2][1]} L${nodes[3][0]} ${nodes[3][1]} L${nodes[4][0]} ${nodes[4][1]} Z`} />
        <path d={`M${nodes[0][0]} ${nodes[0][1]} L${nodes[2][0]} ${nodes[2][1]}`} opacity={0.6} />
        <path d={`M${nodes[1][0]} ${nodes[1][1]} L${nodes[3][0]} ${nodes[3][1]}`} opacity={0.6} />
        <path d={`M${nodes[4][0]} ${nodes[4][1]} L${nodes[1][0]} ${nodes[1][1]}`} opacity={0.45} />
      </g>
      <g stroke="none" fill={ORM_DEEP}>
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.72} />
        ))}
      </g>

      {/* Pupil, and the single catchlight that makes the eye look open. */}
      <circle cx="12" cy="12" r="1.9" fill={ORM_DEEP} stroke="none" />
      <circle cx="11.2" cy="11.2" r="0.62" fill={ORM_PALE} stroke="none" />

      {/* Three archive nodes in orbit -- the library, reduced to its index. */}
      <g fill={ORM_MID} stroke="none">
        <circle cx="4.4" cy="7.4" r="0.85" />
        <circle cx="20.0" cy="8.2" r="0.7" />
        <circle cx="17.2" cy="18.4" r="0.75" />
      </g>
    </GlyphShell>
  );
}

/**
 * Phase-1 MYTHIC keys. Same "brand-new iconName" contract as
 * `referenceBatchGlyphs` rather than the "reuse the backend's existing string"
 * contract of the two mock-exam batches: all nine strings below were seeded by
 * the backend with the nine new MYTHIC AchievementBadge rows, and each is owned
 * by exactly one row. Kept as one export so `badgeVisuals.ts` and
 * `BadgeInspectionModal.tsx` cannot drift on which glyph a key resolves to.
 */
export const mythicPhase1Glyphs = {
  SpeedCometMythic: IconSpeedCometMythic,      // speed_demon        MYTHIC
  CrownMythic: IconCrownMythic,                // competitor         MYTHIC
  InfinityMythic: IconInfinityMythic,          // unstoppable_streak MYTHIC
  DawnBreakMythic: IconDawnBreakMythic,        // early_bird         MYTHIC
  PhoenixSurgeMythic: IconPhoenixSurgeMythic,  // comeback_kid       MYTHIC
  LaurelCrownMythic: IconLaurelCrownMythic,    // podium_finisher    MYTHIC ("The Immortal")
  PrecisionCoreMythic: IconPrecisionCoreMythic,// sharpshooter       MYTHIC
  SummitMythic: IconSummitMythic,              // underdog           MYTHIC
  OracleMythic: IconOracleMythic,              // polymath           MYTHIC
} as const;

/* ==========================================================================
 * PHASE 2 -- FIVE NEW BADGE FAMILIES, FOUR TIERS EACH (2026-07-28)
 * --------------------------------------------------------------------------
 * Twenty hand-drawn marks for Marathoner, Iron Wall, The Veteran, Last-Minute
 * Hero and Section Specialist. Same "brand-new iconName" contract as the
 * reference batch and phase-1 MYTHIC: all twenty strings below were seeded by
 * the backend alongside the twenty new AchievementBadge rows (see the seed list
 * in backend/app/services/achievements.py), each is owned by exactly one row,
 * and none of them can shadow -- or be shadowed by -- a key an existing badge
 * resolves through.
 *
 * DRAWING RULE FOR THIS PHASE: a family is ONE OBJECT redrawn four times, not
 * four objects sharing a colour ramp. Each family therefore has a single
 * structural motif that every tier is obliged to keep, and the tier step is
 * carried by adding structure to that motif rather than by swapping it:
 *
 *   Marathoner         -- a trail in one-point perspective. BASE has one
 *                         milestone; MYTHIC's trail has closed into a loop.
 *   Iron Wall          -- running-bond masonry. BASE is a single brick;
 *                         MYTHIC is a walled citadel built of the same course.
 *   The Veteran        -- the chevron. It is stacked, struck into a medal,
 *                         flown on a standard, and finally built into a
 *                         monument -- but it is the same chevron every time.
 *   Last-Minute Hero   -- a dial with its FINAL WEDGE marked (the last 10% of
 *                         the window, which is literally the unlock rule).
 *                         The wedge sparks, flashes, burns, then eclipses.
 *   Section Specialist -- HEXAGONAL nodes and straight links. Hexagons, not
 *                         circles, specifically so this never reads as
 *                         polymath BASE's round-node plexus (IconMindLattice),
 *                         which is the nearest existing mark.
 *
 * SIX OF THE TWENTY ARE DRAWN FOR A LIGHT CARD -- MarathonHorizon,
 * MarathonEternal, IronWallRampart, LastMinuteFlash, SectionSpecialistGrid and
 * SectionSpecialistNexus. Their badge colour has WCAG relative luminance above
 * 0.45, so those six take an INK `iconColorHex` and every baked accent constant
 * below them is DEEP rather than bright. The accents are literal hexes, not
 * `currentColor`, so they do not follow the ink automatically -- a pale accent
 * that reads on a navy card is invisible on a near-white one.
 * ========================================================================== */

/** Pointy-top hexagon as a closed path. Used only by the Section Specialist
 *  family, whose whole visual argument is "these are cells in a structure",
 *  and which needs a primitive no other badge in the catalogue uses. */
function hexPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/* --------------------------------------------------------------------------
 * MARATHONER -- cumulative time invested, lifetime.
 * Motif: a trail in one-point perspective, vanishing at (12, 6.6). Every tier
 * keeps the two converging edges and the decaying centre dashes; what changes
 * is how far down it you can see. NOT a track or a lap -- a lap is a sprint
 * shape, and this badge is about distance that does not come back round.
 * (Except at MYTHIC, where it does, on purpose.)
 * ------------------------------------------------------------------------ */

/** P1. MarathonTrail -- Marathoner BASE (trail grey). The entry rung: one
 *  milestone, two footfalls, and a horizon you cannot see anything past. The
 *  deliberately plain mark of the deliberately plainest colour in the set. */
const MTR_DUST = "#bdb6b6";
const MTR_DEEP = "#2b2828";
const MTR_LIGHT = "#f5f2f2";

export function IconMarathonTrail(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Ground the trail crosses. */}
      <path d="M0.8 22.2 H23.2" stroke={MTR_DUST} strokeWidth={1} opacity={0.5} />

      {/* Trail bed. */}
      <path d="M2.6 22.2 L10.6 6.6 L13.4 6.6 L21.4 22.2 Z" fill={MTR_DEEP} fillOpacity={0.45} strokeWidth={1.4} />

      {/* Centre markings -- five dashes, shrinking with distance. That decay is
          what turns two converging lines into perspective; equal dashes read as
          a ladder. */}
      <g stroke={MTR_DUST}>
        <path d="M12 21.4 V19.0" strokeWidth={1.7} opacity={0.95} />
        <path d="M12 17.2 V15.4" strokeWidth={1.3} opacity={0.8} />
        <path d="M12 14.0 V12.7" strokeWidth={1} opacity={0.65} />
        <path d="M12 11.6 V10.7" strokeWidth={0.75} opacity={0.5} />
        <path d="M12 9.8 V9.1" strokeWidth={0.55} opacity={0.35} />
      </g>

      {/* One milestone. Three hours in, there is exactly one. */}
      <path d="M5.6 20.0 V15.2" strokeWidth={1.35} stroke={MTR_LIGHT} />
      <path d="M5.6 15.2 L8.7 14.4 L8.7 16.9 L5.6 17.7 Z" fill={MTR_LIGHT} opacity={0.85} stroke="none" />

      {/* Two footfalls on the near verge, so the trail is being walked rather
          than photographed. */}
      <g fill={MTR_DUST} stroke="none" opacity={0.85}>
        <ellipse cx="15.7" cy="19.4" rx="0.95" ry="1.5" transform="rotate(14 15.7 19.4)" />
        <ellipse cx="17.2" cy="16.5" rx="0.7" ry="1.15" transform="rotate(14 17.2 16.5)" />
      </g>

      {/* Horizon. */}
      <path d="M8.2 6.6 H15.8" strokeWidth={1.1} stroke={MTR_LIGHT} opacity={0.7} />
    </GlyphShell>
  );
}

/** P2. MarathonSurge -- Marathoner SUPER (sun-baked ochre). The same trail with
 *  something moving on it: a forward chevron mid-road trailing three decaying
 *  wake arcs, plus a second milestone further up. Ten hours is where the trail
 *  stops being a walk. */
const MSU_EMBER = "#ffd39a";
const MSU_DEEP = "#3b2408";
const MSU_LIGHT = "#fff6e8";

export function IconMarathonSurge(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <path d="M0.8 22.2 H23.2" stroke={MSU_EMBER} strokeWidth={1} opacity={0.5} />

      {/* Heat shimmer over the road surface -- two low arcs, opposite phase. */}
      <g stroke={MSU_EMBER} strokeWidth={0.7} opacity={0.45} fill="none">
        <path d="M4.6 20.4 Q7.2 19.2 9.8 20.4" />
        <path d="M14.4 20.4 Q17.0 19.2 19.6 20.4" />
      </g>

      <path d="M2.6 22.2 L10.6 6.6 L13.4 6.6 L21.4 22.2 Z" fill={MSU_DEEP} fillOpacity={0.5} strokeWidth={1.4} />

      <g stroke={MSU_EMBER}>
        <path d="M12 21.4 V19.0" strokeWidth={1.7} opacity={0.95} />
        <path d="M12 17.2 V15.4" strokeWidth={1.3} opacity={0.8} />
        <path d="M12 14.0 V12.7" strokeWidth={1} opacity={0.65} />
        <path d="M12 11.6 V10.7" strokeWidth={0.75} opacity={0.5} />
        <path d="M12 9.8 V9.1" strokeWidth={0.55} opacity={0.35} />
      </g>

      {/* Wake -- three arcs behind the runner, decaying downroad. */}
      <g stroke={MSU_EMBER} fill="none">
        <path d="M8.9 17.8 Q12 16.6 15.1 17.8" strokeWidth={1.25} opacity={0.8} />
        <path d="M8.0 19.6 Q12 18.2 16.0 19.6" strokeWidth={0.95} opacity={0.55} />
        <path d="M7.1 21.4 Q12 19.8 16.9 21.4" strokeWidth={0.7} opacity={0.3} />
      </g>

      {/* The runner, as the trail's own chevron pushed up off the surface. */}
      <path d="M12 10.6 L16.2 16.2 L12 14.4 L7.8 16.2 Z" fill={MSU_LIGHT} stroke="none" />
      <path d="M12 13.0 L14.6 16.4 L12 15.3 L9.4 16.4 Z" fill={MSU_DEEP} opacity={0.7} stroke="none" />

      {/* Two milestones now, the far one smaller. */}
      <g stroke={MSU_LIGHT}>
        <path d="M4.9 20.6 V15.6" strokeWidth={1.35} />
        <path d="M18.6 14.6 V11.2" strokeWidth={0.95} opacity={0.85} />
      </g>
      <path d="M4.9 15.6 L8.1 14.7 L8.1 17.3 L4.9 18.2 Z" fill={MSU_LIGHT} opacity={0.85} stroke="none" />
      <path d="M18.6 11.2 L16.3 10.6 L16.3 12.4 L18.6 13.0 Z" fill={MSU_LIGHT} opacity={0.6} stroke="none" />

      <path d="M8.2 6.6 H15.8" strokeWidth={1.1} stroke={MSU_LIGHT} opacity={0.7} />
    </GlyphShell>
  );
}

/** P3. MarathonHorizon -- Marathoner LEGENDARY (horizon blue).
 *  INK MARK: pale card, so every accent below is a DEEP navy. The tier step is
 *  that you can now see PAST the trail: three receding ridge layers, the
 *  curvature arc of the earth, and a marker planted at the vanishing point.
 *  Twenty-five hours buys you a view. */
const MHZ_INK = "#12243c";
const MHZ_MID = "#2f4f78";
const MHZ_DEEP = "#070f1c";

export function IconMarathonHorizon(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Curvature arc -- the reason this reads as a horizon and not a shelf. */}
      <path d="M0.6 9.4 Q12 4.6 23.4 9.4" stroke={MHZ_MID} strokeWidth={0.85} opacity={0.5} fill="none" />

      {/* Three receding ridge layers, palest furthest back. */}
      <path d="M0.8 10.4 L5.0 7.8 L9.0 10.0 L13.4 7.2 L18.0 9.8 L23.2 7.6 V11.2 H0.8 Z" fill={MHZ_MID} opacity={0.28} stroke="none" />
      <path d="M0.8 12.0 L4.2 9.8 L8.6 11.8 L12.6 9.4 L17.4 11.6 L23.2 9.6 V12.6 H0.8 Z" fill={MHZ_MID} opacity={0.45} stroke="none" />

      {/* The horizon itself, full width -- the widest single line in the mark. */}
      <path d="M0.6 12.6 H23.4" strokeWidth={1.7} stroke={MHZ_INK} />

      {/* Trail, now running all the way out to that line. */}
      <path d="M3.2 22.4 L10.8 12.6 L13.2 12.6 L20.8 22.4 Z" fill={MHZ_DEEP} fillOpacity={0.42} strokeWidth={1.35} />
      <g stroke={MHZ_MID}>
        <path d="M12 21.8 V19.6" strokeWidth={1.6} opacity={0.95} />
        <path d="M12 18.2 V16.6" strokeWidth={1.2} opacity={0.78} />
        <path d="M12 15.5 V14.4" strokeWidth={0.85} opacity={0.58} />
        <path d="M12 13.6 V13.0" strokeWidth={0.6} opacity={0.4} />
      </g>

      {/* Marker planted at the vanishing point, with a small pennant. */}
      <path d="M12 12.6 V8.6" strokeWidth={1.15} stroke={MHZ_INK} />
      <path d="M12 8.6 L15.2 9.6 L12 10.8 Z" fill={MHZ_INK} stroke="none" />

      {/* Distance ticks along the horizon -- every one is a hour already run. */}
      <g stroke={MHZ_INK} strokeWidth={0.9} opacity={0.65}>
        <path d="M3.4 12.6 V11.2" />
        <path d="M7.0 12.6 V11.5" />
        <path d="M17.0 12.6 V11.5" />
        <path d="M20.6 12.6 V11.2" />
      </g>
    </GlyphShell>
  );
}

/** P4. MarathonEternal -- Marathoner MYTHIC (endless dawn).
 *  INK MARK: near-white card, so all accents are DEEP umber. The structural
 *  addition that only a ceiling tier earns: THE TRAIL CLOSES. The two
 *  converging edges bend round into a banked loop with sixteen dashes and no
 *  start line, a light source rises from behind its far side, and the single
 *  BASE milestone has become an obelisk. Sixty hours is not a distance any
 *  more, it is a circuit. */
const MET_INK = "#4a3410";
const MET_MID = "#8a6520";
const MET_DEEP = "#231705";

export function IconMarathonEternal(props: BadgeGlyphProps) {
  const dashes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 4 === 0;
    const x1 = 12 + Math.cos(a) * 7.4;
    const y1 = 14.6 + Math.sin(a) * 3.5;
    const x2 = 12 + Math.cos(a) * 9.2;
    const y2 = 14.6 + Math.sin(a) * 4.4;
    dashes.push(
      <path
        key={i}
        d={`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`}
        strokeWidth={long ? 1.2 : 0.7}
        opacity={long ? 0.9 : 0.5}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      {/* Light rising from behind the far side of the loop -- seven rays,
          alternating length, clipped to the upper half. */}
      <g stroke={MET_MID} strokeWidth={0.9} opacity={0.5}>
        <path d="M12 10.2 V2.6" />
        <path d="M8.6 10.8 L5.8 4.6" />
        <path d="M15.4 10.8 L18.2 4.6" />
        <path d="M5.6 12.0 L1.4 7.6" />
        <path d="M18.4 12.0 L22.6 7.6" />
      </g>

      {/* Horizon behind the loop. */}
      <path d="M0.8 11.4 H23.2" stroke={MET_INK} strokeWidth={1.05} opacity={0.6} />

      {/* The banked loop: outer and inner ellipse make a road, not a wire. */}
      <ellipse cx="12" cy="14.6" rx="9.2" ry="4.4" fill={MET_DEEP} fillOpacity={0.34} strokeWidth={1.45} />
      <ellipse cx="12" cy="14.6" rx="5.6" ry="2.5" strokeWidth={1.1} opacity={0.8} fill="none" />

      {/* Sixteen dashes across the carriageway. No start line anywhere. */}
      <g stroke={MET_MID}>{dashes}</g>

      {/* The BASE milestone, grown into an obelisk on the near kerb. */}
      <path d="M10.6 21.8 H13.4 L12.9 14.2 L12 12.6 L11.1 14.2 Z" fill={MET_INK} fillOpacity={0.75} strokeWidth={1.2} />
      <path d="M9.6 21.8 H14.4" strokeWidth={1.4} stroke={MET_INK} />
      <path d="M11.2 16.6 H12.8" strokeWidth={0.7} opacity={0.7} />

      {/* Apex light on the obelisk -- the one bright thing on an ink mark. */}
      <circle cx="12" cy="12.2" r="1.2" fill={MET_MID} stroke="none" />
      <circle cx="12" cy="12.2" r="2.2" stroke={MET_MID} strokeWidth={0.55} fill="none" opacity={0.55} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * IRON WALL -- never drops below an escalating score floor.
 * Motif: running-bond masonry. Every tier is built out of the same brick unit
 * with the same half-brick offset per course; the tier step is how much of the
 * fortification you can see. This is DEFENCE, not dominance -- it never points
 * at anything, it only holds a line, which is what separates it from
 * Unstoppable Streak's forward-moving marks.
 * ------------------------------------------------------------------------ */

/** P5. IronWallBrick -- Iron Wall BASE (fired brick). One reinforced unit:
 *  a single bevelled brick with four corner rivets, sitting on the offset
 *  half-bricks of the course below. Five mocks is one brick. */
const IWB_CLAY = "#d18b4a";
const IWB_DEEP = "#2a1705";
const IWB_LIGHT = "#ffe6cd";

export function IconIronWallBrick(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Course below, in offset bond -- the reason this reads as masonry
          rather than as a box. */}
      <g stroke={IWB_CLAY} strokeWidth={1.1} opacity={0.55} fill="none">
        <rect x="1.4" y="16.6" width="8.2" height="4.6" rx="0.5" />
        <rect x="10.4" y="16.6" width="8.2" height="4.6" rx="0.5" />
        <path d="M19.4 16.6 H22.6 V21.2 H19.4" />
      </g>

      {/* The hero brick. */}
      <rect x="3.2" y="6.4" width="17.6" height="9.4" rx="0.8" fill={IWB_DEEP} fillOpacity={0.55} strokeWidth={1.6} />
      {/* Bevel -- a lit top-left edge and a shadowed bottom-right one, so the
          unit has thickness. */}
      <path d="M4.4 14.8 V7.4 H19.6" stroke={IWB_CLAY} strokeWidth={1} opacity={0.8} fill="none" />
      <path d="M4.4 14.8 H19.6 V7.4" stroke={IWB_DEEP} strokeWidth={1} opacity={0.7} fill="none" />

      {/* Four rivets -- "reinforced", which is the whole point of the family. */}
      <g fill={IWB_LIGHT} stroke="none">
        <circle cx="6.2" cy="9.2" r="1" />
        <circle cx="17.8" cy="9.2" r="1" />
        <circle cx="6.2" cy="13.0" r="1" />
        <circle cx="17.8" cy="13.0" r="1" />
      </g>

      {/* Mortar bed the brick is set into. */}
      <path d="M1.4 16.0 H22.6" strokeWidth={1.5} stroke={IWB_CLAY} opacity={0.85} />
      <path d="M1.4 22.0 H22.6" strokeWidth={1.1} stroke={IWB_CLAY} opacity={0.55} />
    </GlyphShell>
  );
}

/** P6. IronWallBastion -- Iron Wall SUPER (quarry stone). The brick has become
 *  a structure: four courses in running bond, three merlons crenellating the
 *  top, one arrow slit, and a splayed plinth. Still a single tower -- the wall
 *  itself does not arrive until LEGENDARY. */
const IWS_STONE = "#dcdcd4";
const IWS_DEEP = "#33332e";
const IWS_LIGHT = "#fbfbf6";

export function IconIronWallBastion(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Crenellations. Three merlons, two embrasures. */}
      <path
        d="M5.2 6.4 H8.0 V4.0 H11.0 V6.4 H13.0 V4.0 H16.0 V6.4 H18.8 V8.0 H5.2 Z"
        fill={IWS_DEEP}
        fillOpacity={0.45}
        strokeWidth={1.35}
      />

      {/* Tower body -- four courses, alternating offset. */}
      <rect x="5.2" y="8.0" width="13.6" height="11.2" fill={IWS_DEEP} fillOpacity={0.3} strokeWidth={1.5} />
      <g stroke={IWS_STONE} strokeWidth={0.9} opacity={0.75} fill="none">
        <path d="M5.2 10.8 H18.8" />
        <path d="M5.2 13.6 H18.8" />
        <path d="M5.2 16.4 H18.8" />
        {/* Perpends, offset half a brick per course. */}
        <path d="M9.7 8.0 V10.8 M14.3 8.0 V10.8" />
        <path d="M7.4 10.8 V13.6 M12.0 10.8 V13.6 M16.6 10.8 V13.6" />
        <path d="M9.7 13.6 V16.4 M14.3 13.6 V16.4" />
        <path d="M7.4 16.4 V19.2 M16.6 16.4 V19.2" />
      </g>

      {/* Arrow slit -- a cross-slit, so it reads as defensive rather than as a
          window. */}
      <path d="M12 14.2 V18.4" strokeWidth={1.5} stroke={IWS_LIGHT} />
      <path d="M10.6 16.0 H13.4" strokeWidth={1.1} stroke={IWS_LIGHT} opacity={0.85} />

      {/* Splayed plinth. */}
      <path d="M5.2 19.2 L3.4 21.8 H20.6 L18.8 19.2 Z" fill={IWS_DEEP} fillOpacity={0.5} strokeWidth={1.35} />
      <path d="M2.4 22.4 H21.6" strokeWidth={1.2} stroke={IWS_STONE} opacity={0.7} />
    </GlyphShell>
  );
}

/** P7. IronWallRampart -- Iron Wall LEGENDARY (pale limestone).
 *  INK MARK: near-white card, so all accents are DEEP slate. The bastion is now
 *  a curtain wall spanning the full grid: five merlons, two flanking towers and
 *  a gate arch with a portcullis. Twenty mocks is a defended frontage, not a
 *  building. */
const IWR_INK = "#2a2222";
const IWR_MID = "#5e5252";
const IWR_DEEP = "#141010";

export function IconIronWallRampart(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Curtain wall, edge to edge. */}
      <rect x="0.8" y="10.4" width="22.4" height="9.6" fill={IWR_DEEP} fillOpacity={0.28} strokeWidth={1.35} />

      {/* Crenellation along the whole frontage. */}
      <path
        d="M0.8 10.4 V8.2 H3.2 V10.4 H5.6 V8.2 H8.0 V10.4 H10.6 V8.2 H13.4 V10.4 H16.0 V8.2 H18.4 V10.4 H20.8 V8.2 H23.2 V10.4"
        strokeWidth={1.3}
        stroke={IWR_INK}
        fill="none"
      />

      {/* Two flanking towers, taller than the wall they anchor. */}
      <g strokeWidth={1.4} stroke={IWR_INK}>
        <path d="M1.6 20.0 V5.6 H4.0 V7.2 H6.0 V5.6 H6.8 V20.0" fill={IWR_DEEP} fillOpacity={0.4} />
        <path d="M17.2 20.0 V5.6 H18.0 V7.2 H20.0 V5.6 H22.4 V20.0" fill={IWR_DEEP} fillOpacity={0.4} />
      </g>

      {/* Masonry courses across the curtain. */}
      <g stroke={IWR_MID} strokeWidth={0.75} opacity={0.7} fill="none">
        <path d="M6.8 13.4 H17.2" />
        <path d="M6.8 16.4 H17.2" />
        <path d="M9.2 10.4 V13.4 M14.8 10.4 V13.4" />
        <path d="M7.9 13.4 V16.4 M16.1 13.4 V16.4" />
      </g>

      {/* Gate arch, closed, with a portcullis grid behind it. */}
      <path d="M9.2 20.0 V15.4 A2.8 2.8 0 0 1 14.8 15.4 V20.0 Z" fill={IWR_INK} fillOpacity={0.6} strokeWidth={1.3} />
      <g stroke={IWR_MID} strokeWidth={0.7} opacity={0.85} fill="none">
        <path d="M10.4 15.0 V20.0 M12 14.4 V20.0 M13.6 15.0 V20.0" />
        <path d="M9.5 17.0 H14.5 M9.3 18.6 H14.7" />
      </g>

      {/* Ground line the wall is founded on. */}
      <path d="M0.6 20.0 H23.4" strokeWidth={1.6} stroke={IWR_INK} />
      <path d="M0.6 22.2 H23.4" strokeWidth={0.9} stroke={IWR_MID} opacity={0.55} />

      {/* Two arrow slits in the towers. */}
      <g stroke={IWR_INK} strokeWidth={1.15}>
        <path d="M4.2 11.4 V14.2" />
        <path d="M19.8 11.4 V14.2" />
      </g>
    </GlyphShell>
  );
}

/** P8. IronWallCitadel -- Iron Wall MYTHIC (verdigris).
 *  The structural addition that earns the ceiling tier: DEPTH. Where LEGENDARY
 *  is one frontage, this is two concentric rings of wall with a keep rising
 *  behind them, pennants on the towers, a lit gate and a corona off the keep's
 *  spire. Same running-bond courses, same crenellation rhythm, three storeys of
 *  it. Forty mocks without dropping below 80% is a city, not a wall. */
const IWC_BRONZE = "#8fe6c2";
const IWC_DEEP = "#0b3527";
const IWC_LIGHT = "#e9fff7";

export function IconIronWallCitadel(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Corona off the spire -- six rays, alternating length. */}
      <g stroke={IWC_BRONZE} strokeWidth={0.8} opacity={0.55}>
        <path d="M12 3.4 V0.7" />
        <path d="M9.4 4.2 L7.7 2.0" />
        <path d="M14.6 4.2 L16.3 2.0" />
        <path d="M7.4 5.8 L5.2 4.4" />
        <path d="M16.6 5.8 L18.8 4.4" />
      </g>

      {/* The keep, furthest back and tallest. */}
      <path
        d="M8.6 13.6 V6.8 H10.4 V8.2 H11.2 V6.8 H12.8 V8.2 H13.6 V6.8 H15.4 V13.6 Z"
        fill={IWC_DEEP}
        fillOpacity={0.55}
        strokeWidth={1.3}
      />
      <path d="M12 6.8 L12 3.6" strokeWidth={1.15} stroke={IWC_BRONZE} />
      <path d="M12 3.6 L15.0 4.6 L12 5.7 Z" fill={IWC_LIGHT} stroke="none" />
      <circle cx="12" cy="3.3" r="0.85" fill={IWC_LIGHT} stroke="none" />

      {/* Inner ring of wall. */}
      <path
        d="M5.4 18.4 V12.6 H7.0 V11.2 H8.2 V12.6 H15.8 V11.2 H17.0 V12.6 H18.6 V18.4 Z"
        fill={IWC_DEEP}
        fillOpacity={0.4}
        strokeWidth={1.35}
      />
      <g stroke={IWC_BRONZE} strokeWidth={0.7} opacity={0.7} fill="none">
        <path d="M5.4 15.2 H18.6" />
        <path d="M8.7 12.6 V15.2 M15.3 12.6 V15.2" />
        <path d="M7.0 15.2 V18.4 M12 15.2 V18.4 M17.0 15.2 V18.4" />
      </g>

      {/* Outer ring, lower and wider -- the depth that LEGENDARY does not have. */}
      <path
        d="M1.2 22.0 V17.0 H2.8 V15.8 H4.2 V17.0 H19.8 V15.8 H21.2 V17.0 H22.8 V22.0 Z"
        fill={IWC_DEEP}
        fillOpacity={0.28}
        strokeWidth={1.35}
      />
      <g stroke={IWC_BRONZE} strokeWidth={0.7} opacity={0.6} fill="none">
        <path d="M1.2 19.4 H22.8" />
        <path d="M5.6 17.0 V19.4 M18.4 17.0 V19.4" />
      </g>

      {/* Lit gate in the outer ring. */}
      <path d="M10.0 22.0 V19.4 A2.0 2.0 0 0 1 14.0 19.4 V22.0 Z" fill={IWC_LIGHT} opacity={0.85} stroke="none" />
      <path d="M10.0 22.0 V19.4 A2.0 2.0 0 0 1 14.0 19.4 V22.0" strokeWidth={1.2} fill="none" />

      {/* Pennants on the inner towers. */}
      <g stroke={IWC_BRONZE} strokeWidth={0.9}>
        <path d="M7.0 11.2 V8.8" />
        <path d="M17.0 11.2 V8.8" />
      </g>
      <path d="M7.0 8.8 L9.2 9.6 L7.0 10.4 Z" fill={IWC_BRONZE} stroke="none" opacity={0.9} />
      <path d="M17.0 8.8 L14.8 9.6 L17.0 10.4 Z" fill={IWC_BRONZE} stroke="none" opacity={0.9} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * THE VETERAN -- lifetime question volume.
 * Motif: THE CHEVRON. It appears in all four tiers and is the only thing the
 * four have in common: stacked on a sleeve, struck into a medal's field, flown
 * on a standard, and finally coursed up a monument. Service, then rank, then
 * colours, then legacy.
 * ------------------------------------------------------------------------ */

/** P9. VeteranChevron -- The Veteran BASE (olive drab). Two stacked chevrons
 *  over a rocker arc and a service bar. Deliberately flat and issued-looking:
 *  this is a sleeve patch, not a trophy. */
const VTB_KHAKI = "#a6b862";
const VTB_DEEP = "#141c00";
const VTB_LIGHT = "#f4f9e0";

export function IconVeteranChevron(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Patch backing -- a shield-ish field so the chevrons are ON something. */}
      <path d="M3.2 2.6 H20.8 V17.2 L12 22.2 L3.2 17.2 Z" fill={VTB_DEEP} fillOpacity={0.45} strokeWidth={1.35} />
      <path d="M4.9 4.3 H19.1 V16.3 L12 20.3 L4.9 16.3 Z" strokeWidth={0.7} opacity={0.5} fill="none" stroke={VTB_KHAKI} />

      {/* Upper chevron. */}
      <path d="M12 5.0 L19.0 11.0 L19.0 13.4 L12 7.4 L5.0 13.4 L5.0 11.0 Z" fill={VTB_KHAKI} opacity={0.95} stroke="none" />
      {/* Lower chevron, same rake, slightly shorter span. */}
      <path d="M12 10.2 L17.6 15.0 L17.6 17.0 L12 12.2 L6.4 17.0 L6.4 15.0 Z" fill={VTB_LIGHT} opacity={0.85} stroke="none" />

      {/* Rocker arc under the chevrons -- the service band. */}
      <path d="M6.8 18.6 Q12 21.0 17.2 18.6" strokeWidth={1.4} stroke={VTB_KHAKI} fill="none" />

      {/* Two issue studs. */}
      <g fill={VTB_LIGHT} stroke="none" opacity={0.8}>
        <circle cx="5.6" cy="3.9" r="0.6" />
        <circle cx="18.4" cy="3.9" r="0.6" />
      </g>
    </GlyphShell>
  );
}

/** P10. VeteranMedallion -- The Veteran SUPER (campaign crimson). A SUSPENSION
 *  medal: striped ribbon bar at the top, a trapezoid drop, and a notched disc
 *  carrying the BASE chevron struck into its field.
 *
 *  Deliberately NOT competitor BASE's `IconStruckMedallion`, which is a fluted
 *  disc on two CROSSED ribbon straps with a laurel pair inside. This one hangs
 *  straight down from a horizontal bar and has a chevron, not laurels -- the
 *  two never share a silhouette. Metals were unavailable to this family for
 *  colour reasons (see badgeVisuals.ts), so the ribbon is doing the work. */
const VTS_ROSE = "#e79a94";
const VTS_DEEP = "#3a1210";
const VTS_LIGHT = "#fff0ee";

export function IconVeteranMedallion(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Ribbon bar, with five vertical campaign stripes. */}
      <rect x="4.6" y="1.6" width="14.8" height="3.6" rx="0.5" fill={VTS_DEEP} fillOpacity={0.5} strokeWidth={1.35} />
      <g stroke={VTS_ROSE} strokeWidth={1.15} opacity={0.9}>
        <path d="M7.4 1.9 V4.9" />
        <path d="M9.7 1.9 V4.9" />
        <path d="M14.3 1.9 V4.9" />
        <path d="M16.6 1.9 V4.9" />
      </g>
      <path d="M12 1.9 V4.9" strokeWidth={1.3} stroke={VTS_LIGHT} />

      {/* Suspension drop. */}
      <path d="M9.8 5.2 H14.2 L13.2 9.0 H10.8 Z" fill={VTS_ROSE} opacity={0.55} strokeWidth={1.15} />

      {/* Notched rim -- twelve short radial cuts, so the disc is struck metal
          rather than a coin outline. */}
      <g stroke={VTS_ROSE} strokeWidth={0.9} opacity={0.8}>
        <path d="M12 8.4 V9.6" />
        <path d="M15.6 9.4 L15.0 10.4" />
        <path d="M18.1 12.0 L17.0 12.6" />
        <path d="M18.1 17.0 L17.0 16.4" />
        <path d="M15.6 19.6 L15.0 18.6" />
        <path d="M12 20.6 V19.4" />
        <path d="M8.4 19.6 L9.0 18.6" />
        <path d="M5.9 17.0 L7.0 16.4" />
        <path d="M5.9 12.0 L7.0 12.6" />
        <path d="M8.4 9.4 L9.0 10.4" />
      </g>

      {/* Disc. */}
      <circle cx="12" cy="14.5" r="5.5" fill={VTS_DEEP} fillOpacity={0.4} strokeWidth={1.5} />
      <circle cx="12" cy="14.5" r="4.0" strokeWidth={0.8} opacity={0.6} fill="none" />

      {/* The BASE chevron, struck into the field. */}
      <path d="M12 11.6 L15.6 14.8 L15.6 16.3 L12 13.1 L8.4 16.3 L8.4 14.8 Z" fill={VTS_LIGHT} stroke="none" />
      <circle cx="12" cy="17.9" r="0.7" fill={VTS_LIGHT} stroke="none" opacity={0.85} />
    </GlyphShell>
  );
}

/** P11. VeteranStandard -- The Veteran LEGENDARY (regimental bottle green).
 *  The colours. A pike with a spear finial and a cross-bar, a hanging standard
 *  with a fringed foot, and THREE chevrons on the field (BASE has two, this has
 *  three -- the count is the rank).
 *
 *  Deliberately NOT competitor SUPER's `IconStartBanner`, which is a race
 *  banner flying HORIZONTALLY off a mast with a checker block and a
 *  swallow-tail. This one hangs vertically from a cross-bar and is fringed. */
const VTL_GREEN = "#57c99a";
const VTL_DEEP = "#03211a";
const VTL_LIGHT = "#e8fff6";

export function IconVeteranStandard(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Pike, spear finial, cross-bar. */}
      <path d="M12 3.4 V22.4" strokeWidth={1.5} />
      <path d="M12 0.8 L13.5 3.0 L12 4.4 L10.5 3.0 Z" fill={VTL_LIGHT} stroke="none" />
      <path d="M5.4 4.2 H18.6" strokeWidth={1.35} stroke={VTL_GREEN} />
      <g fill={VTL_GREEN} stroke="none">
        <circle cx="5.4" cy="4.2" r="0.85" />
        <circle cx="18.6" cy="4.2" r="0.85" />
      </g>

      {/* The standard, hanging. */}
      <path d="M6.0 4.6 H18.0 V18.0 H6.0 Z" fill={VTL_DEEP} fillOpacity={0.55} strokeWidth={1.4} />
      <path d="M7.3 5.9 H16.7 V16.7 H7.3 Z" strokeWidth={0.7} opacity={0.5} stroke={VTL_GREEN} fill="none" />

      {/* Three chevrons on the field -- BASE's two, plus one. */}
      <g fill={VTL_GREEN} stroke="none">
        <path d="M12 6.8 L16.0 9.9 L16.0 11.1 L12 8.0 L8.0 11.1 L8.0 9.9 Z" opacity={0.95} />
        <path d="M12 10.2 L16.0 13.3 L16.0 14.5 L12 11.4 L8.0 14.5 L8.0 13.3 Z" opacity={0.8} />
      </g>
      <path d="M12 13.6 L16.0 16.7 L16.0 17.9 L12 14.8 L8.0 17.9 L8.0 16.7 Z" fill={VTL_LIGHT} stroke="none" opacity={0.9} />

      {/* Fringe -- five tassels, so the foot of the standard reads as cloth. */}
      <g stroke={VTL_GREEN} strokeWidth={1} opacity={0.85}>
        <path d="M7.4 18.0 V20.0" />
        <path d="M9.7 18.0 V20.6" />
        <path d="M14.3 18.0 V20.6" />
        <path d="M16.6 18.0 V20.0" />
      </g>

      {/* Ground the pike is planted in. */}
      <path d="M8.6 22.4 H15.4" strokeWidth={1.2} stroke={VTL_GREEN} opacity={0.7} />
    </GlyphShell>
  );
}

/** P12. VeteranLegacy -- The Veteran MYTHIC (honour mauve).
 *  The structural addition: the chevron stops being worn and becomes
 *  ARCHITECTURE. Four chevron courses, tapering, form an obelisk on a stepped
 *  plinth; two of the LEGENDARY standards flank it; a struck star burns at the
 *  apex with six rays. 7,500 questions is a monument to somebody who kept
 *  showing up.
 *
 *  Distinct from the reference batch's `IconLevelMonument` (a wide four-tier
 *  ziggurat, symmetrical trapezoids, no chevrons): this is narrow, vertical,
 *  and every course is a V. */
const VTM_LILAC = "#f3c9e0";
const VTM_DEEP = "#3a1a2d";
const VTM_LIGHT = "#ffffff";

export function IconVeteranLegacy(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Six rays off the apex star. */}
      <g stroke={VTM_LILAC} strokeWidth={0.8} opacity={0.55}>
        <path d="M12 2.4 V0.5" />
        <path d="M9.6 3.2 L8.2 1.5" />
        <path d="M14.4 3.2 L15.8 1.5" />
        <path d="M8.2 5.0 L6.2 4.0" />
        <path d="M15.8 5.0 L17.8 4.0" />
      </g>

      {/* Apex star. */}
      <path d="M12 2.0 L13.1 4.6 L15.9 4.9 L13.8 6.8 L14.4 9.6 L12 8.2 L9.6 9.6 L10.2 6.8 L8.1 4.9 L10.9 4.6 Z" fill={VTM_LIGHT} stroke="none" />

      {/* Obelisk shaft: four chevron courses, each narrower than the one below.
          The V is the family's mark, load-bearing here in the literal sense. */}
      <g fill={VTM_LILAC} stroke="none">
        <path d="M12 9.4 L14.3 11.5 L14.3 12.6 L12 10.5 L9.7 12.6 L9.7 11.5 Z" opacity={0.95} />
        <path d="M12 12.0 L15.0 14.2 L15.0 15.3 L12 13.1 L9.0 15.3 L9.0 14.2 Z" opacity={0.85} />
        <path d="M12 14.6 L15.7 16.9 L15.7 18.0 L12 15.7 L8.3 18.0 L8.3 16.9 Z" opacity={0.75} />
      </g>
      <path d="M12 17.2 L16.4 19.6 L16.4 20.7 L12 18.3 L7.6 20.7 L7.6 19.6 Z" fill={VTM_DEEP} fillOpacity={0.7} strokeWidth={1} />

      {/* Shaft outline, so the four courses read as one object. */}
      <path d="M9.4 21.0 L10.9 9.2 H13.1 L14.6 21.0 Z" strokeWidth={1.25} fill="none" opacity={0.85} />

      {/* Stepped plinth. */}
      <path d="M7.4 21.0 H16.6 L17.4 22.4 H6.6 Z" fill={VTM_DEEP} fillOpacity={0.6} strokeWidth={1.2} />
      <path d="M5.4 23.2 H18.6" strokeWidth={1.2} stroke={VTM_LILAC} opacity={0.7} />

      {/* Two flanking standards -- the LEGENDARY mark, kept as honour guard. */}
      <g stroke={VTM_LILAC} strokeWidth={1}>
        <path d="M3.6 21.0 V10.6" />
        <path d="M20.4 21.0 V10.6" />
      </g>
      <path d="M3.6 10.6 L6.6 11.6 L3.6 13.0 Z" fill={VTM_LILAC} stroke="none" opacity={0.8} />
      <path d="M20.4 10.6 L17.4 11.6 L20.4 13.0 Z" fill={VTM_LILAC} stroke="none" opacity={0.8} />
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * LAST-MINUTE HERO -- submits in the final 10% of the window, still scores 80%+.
 * Motif: a dial with its FINAL WEDGE marked. The wedge spans the last ~10% of
 * the face (12 o'clock round to about 1:10), which is not decoration -- it is
 * literally the unlock condition drawn. Every tier keeps the ring, the twelve
 * ticks and that wedge; what changes is what is happening inside the wedge.
 *
 * Mirror image of Early Bird by construction: that family is a dial you BEAT,
 * calm and warm-lit; this one is a dial that is about to run out.
 * ------------------------------------------------------------------------ */

// Shared geometry so the four tiers cannot drift: centre (12, 12.6), outer
// radius 8.6, inner radius 5.4, wedge from -90deg to -54deg.
const LM_WEDGE = "M12 4.00 A8.6 8.6 0 0 1 17.06 5.64 L15.17 8.23 A5.4 5.4 0 0 0 12 7.20 Z";

function lmTicks(stroke: string) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const long = i % 3 === 0;
    const r1 = long ? 9.0 : 9.4;
    const r2 = 10.6;
    out.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * r1).toFixed(2)} ${(12.6 + Math.sin(a) * r1).toFixed(2)} L${(12 + Math.cos(a) * r2).toFixed(2)} ${(12.6 + Math.sin(a) * r2).toFixed(2)}`}
        strokeWidth={long ? 1.25 : 0.7}
        opacity={long ? 0.9 : 0.55}
        stroke={stroke}
      />
    );
  }
  return out;
}

/** P13. LastMinuteSpark -- Last-Minute Hero BASE (struck amber). The dial, the
 *  wedge, and one four-point spark struck off the wedge's outer edge. Both
 *  hands are already inside the wedge. Done it once. */
const LMB_AMBER = "#f6bc4c";
const LMB_DEEP = "#2f1c00";
const LMB_LIGHT = "#fff4dc";

export function IconLastMinuteSpark(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      <g>{lmTicks(LMB_AMBER)}</g>

      {/* Dial face. */}
      <circle cx="12" cy="12.6" r="8.6" fill={LMB_DEEP} fillOpacity={0.45} strokeWidth={1.5} />
      <circle cx="12" cy="12.6" r="5.4" strokeWidth={0.8} opacity={0.5} fill="none" />

      {/* The final wedge. */}
      <path d={LM_WEDGE} fill={LMB_AMBER} opacity={0.85} stroke="none" />
      <path d={LM_WEDGE} strokeWidth={1} opacity={0.9} fill="none" />

      {/* Hands, both inside the wedge. */}
      <path d="M12 12.6 L12 6.4" strokeWidth={1.5} stroke={LMB_LIGHT} />
      <path d="M12 12.6 L15.4 8.2" strokeWidth={1.15} stroke={LMB_LIGHT} opacity={0.85} />
      <circle cx="12" cy="12.6" r="1.05" fill={LMB_LIGHT} stroke="none" />

      {/* One spark, struck off the wedge's outer edge. */}
      <path d="M14.9 3.1 L15.6 5.2 L17.7 5.9 L15.6 6.6 L14.9 8.7 L14.2 6.6 L12.1 5.9 L14.2 5.2 Z" fill={LMB_LIGHT} stroke="none" />
      <circle cx="14.9" cy="5.9" r="0.75" fill={LMB_AMBER} stroke="none" />
    </GlyphShell>
  );
}

/** P14. LastMinuteFlash -- Last-Minute Hero SUPER (flashbulb lime).
 *  INK MARK: this sits on the second-highest-luminance card in the family, so
 *  every accent below is a DARK olive. BASE's single spark has become a
 *  full-frame FLASH: an eight-point burst over the wedge with six escaping
 *  flash lines, and the wedge itself blown out. Five times is not luck. */
const LMS_INK = "#2b3a05";
const LMS_MID = "#5c7a0d";
const LMS_DEEP = "#131a02";

export function IconLastMinuteFlash(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Flash lines escaping the wedge, alternating length. */}
      <g stroke={LMS_MID} strokeWidth={1} opacity={0.7}>
        <path d="M15.6 3.4 L17.4 0.9" />
        <path d="M18.4 6.0 L21.6 4.6" />
        <path d="M19.4 9.0 L22.9 9.2" />
        <path d="M13.2 1.9 L13.6 0.6" />
        <path d="M18.9 11.6 L21.4 12.6" />
      </g>

      <g>{lmTicks(LMS_MID)}</g>

      <circle cx="12" cy="12.6" r="8.6" fill={LMS_DEEP} fillOpacity={0.3} strokeWidth={1.5} />
      <circle cx="12" cy="12.6" r="5.4" strokeWidth={0.8} opacity={0.45} fill="none" />

      {/* Wedge, blown out. */}
      <path d={LM_WEDGE} fill={LMS_INK} opacity={0.9} stroke="none" />
      <path d={LM_WEDGE} strokeWidth={1.05} opacity={0.95} fill="none" />

      <path d="M12 12.6 L12 6.4" strokeWidth={1.5} stroke={LMS_INK} />
      <path d="M12 12.6 L15.4 8.2" strokeWidth={1.15} stroke={LMS_INK} opacity={0.8} />
      <circle cx="12" cy="12.6" r="1.05" fill={LMS_INK} stroke="none" />

      {/* Eight-point burst, sitting on the wedge. Four long arms and four
          short diagonals -- a four-point star reads as a sparkle, eight reads
          as an overexposure. */}
      <path
        d="M14.9 0.9 L15.9 4.5 L19.5 5.5 L15.9 6.5 L14.9 10.1 L13.9 6.5 L10.3 5.5 L13.9 4.5 Z"
        fill={LMS_INK}
        stroke="none"
      />
      <path
        d="M14.9 2.6 L16.5 4.4 L17.6 3.2 L16.5 6.6 L18.2 5.5 L14.9 9.0 L13.3 6.6 L12.2 7.8 L13.3 4.4 L11.6 5.5 Z"
        fill={LMS_MID}
        opacity={0.55}
        stroke="none"
      />
      <circle cx="14.9" cy="5.5" r="1.1" fill={LMS_DEEP} stroke="none" />
    </GlyphShell>
  );
}

/** P15. LastMinuteBlaze -- Last-Minute Hero LEGENDARY (scorched gold). The
 *  wedge is now on fire and the dial is being consumed by it: three flame
 *  tongues climb out of the wedge, two smoke curls drift off them, and the ring
 *  is BROKEN across the wedge -- the only tier where the dial does not close.
 *  Fifteen times means the deadline is not a deadline any more. */
const LMLG_FLAME = "#dcd857";
const LMLG_DEEP = "#1c1c00";
const LMLG_LIGHT = "#fcfbdb";

export function IconLastMinuteBlaze(props: BadgeGlyphProps) {
  return (
    <GlyphShell {...props}>
      {/* Smoke, drawn first so the flame sits in front of it. */}
      <g stroke={LMLG_FLAME} strokeWidth={0.8} opacity={0.4} fill="none">
        <path d="M16.4 3.0 Q19.2 1.8 18.6 0.4" />
        <path d="M13.6 1.6 Q11.6 0.8 12.4 -0.2" />
      </g>

      <g>{lmTicks(LMLG_FLAME)}</g>

      {/* Dial, BROKEN across the wedge: the arc runs from 1:10 all the way
          round to 12 the long way, and simply stops. */}
      <path
        d="M17.06 5.64 A8.6 8.6 0 1 1 12 4.00"
        strokeWidth={1.5}
        fill={LMLG_DEEP}
        fillOpacity={0.4}
      />
      <circle cx="12" cy="12.6" r="5.4" strokeWidth={0.8} opacity={0.5} fill="none" />

      {/* The wedge, glowing rather than filled flat. */}
      <path d={LM_WEDGE} fill={LMLG_FLAME} opacity={0.6} stroke="none" />

      {/* Three flame tongues climbing out of the break. */}
      <path
        d="M13.2 5.6 C13.0 2.8 14.4 1.4 14.0 -0.4 C16.4 1.6 17.4 3.6 17.0 6.0 C16.4 4.8 15.8 4.2 15.0 3.8 C15.4 5.0 15.2 5.8 14.6 6.6 Z"
        fill={LMLG_FLAME}
        fillOpacity={0.7}
        strokeWidth={1.05}
      />
      <path
        d="M14.2 5.4 C14.2 3.8 14.9 3.0 14.9 1.8 C16.0 3.2 16.2 4.4 15.8 5.8 Z"
        fill={LMLG_LIGHT}
        opacity={0.9}
        stroke="none"
      />
      <path d="M11.4 5.0 C11.2 3.6 11.8 2.8 11.6 1.8 C12.6 3.0 12.7 4.0 12.3 5.2 Z" fill={LMLG_FLAME} opacity={0.65} stroke="none" />

      {/* Hands. The hour hand is inside the wedge and burning with it. */}
      <path d="M12 12.6 L12 7.2" strokeWidth={1.5} stroke={LMLG_LIGHT} />
      <path d="M12 12.6 L15.6 8.6" strokeWidth={1.15} stroke={LMLG_LIGHT} opacity={0.85} />
      <circle cx="12" cy="12.6" r="1.05" fill={LMLG_LIGHT} stroke="none" />

      {/* Embers falling off the break. */}
      <g fill={LMLG_FLAME} stroke="none">
        <circle cx="19.4" cy="8.0" r="0.7" opacity={0.85} />
        <circle cx="20.6" cy="11.2" r="0.5" opacity={0.6} />
        <circle cx="18.4" cy="4.4" r="0.45" opacity={0.5} />
      </g>
    </GlyphShell>
  );
}

/** P16. LastMinuteEclipse -- Last-Minute Hero MYTHIC (eclipse plum).
 *  The structural addition that earns the ceiling tier: the dial's face has
 *  become an OCCULTING DISC. The ring survives as a corona, eight streamers
 *  leave it at alternating length, and the final wedge survives as the single
 *  bright bead where the last of the light gets out -- the diamond-ring instant.
 *  Dark before light, which is the brief's own reading of a deadline. */
const LME_CORONA = "#eebfd6";
const LME_DEEP = "#2a1420";
const LME_LIGHT = "#ffffff";

export function IconLastMinuteEclipse(props: BadgeGlyphProps) {
  const streamers = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0;
    const r1 = 9.2;
    const r2 = long ? 12.4 : 10.8;
    streamers.push(
      <path
        key={i}
        d={`M${(12 + Math.cos(a) * r1).toFixed(2)} ${(12.6 + Math.sin(a) * r1).toFixed(2)} L${(12 + Math.cos(a) * r2).toFixed(2)} ${(12.6 + Math.sin(a) * r2).toFixed(2)}`}
        strokeWidth={long ? 1.15 : 0.7}
        opacity={long ? 0.8 : 0.45}
      />
    );
  }
  return (
    <GlyphShell {...props}>
      {/* Residual dial ticks, pushed right out to the rim -- the family's DNA,
          surviving as the only thing still measuring time. */}
      <g>{lmTicks(LME_DEEP)}</g>

      {/* Corona streamers. */}
      <g stroke={LME_CORONA}>{streamers}</g>

      {/* Corona: two rings, the outer one diffuse. */}
      <circle cx="12" cy="12.6" r="9.0" stroke={LME_CORONA} strokeWidth={0.7} opacity={0.4} fill="none" />
      <circle cx="12" cy="12.6" r="8.6" strokeWidth={1.6} fill="none" />

      {/* The occulting disc. The one solid black shape in the whole phase. */}
      <circle cx="12" cy="12.6" r="8.0" fill={LME_DEEP} fillOpacity={0.96} stroke="none" />
      <circle cx="12" cy="12.6" r="8.0" stroke={LME_CORONA} strokeWidth={0.9} opacity={0.65} fill="none" />

      {/* The final wedge, surviving only as light leaking round the limb. */}
      <path d="M12 4.00 A8.6 8.6 0 0 1 17.06 5.64 L15.17 8.23 A5.4 5.4 0 0 0 12 7.20 Z" fill={LME_CORONA} opacity={0.35} stroke="none" />
      <path d="M12 4.0 A8.6 8.6 0 0 1 17.06 5.64" strokeWidth={1.7} stroke={LME_LIGHT} fill="none" />

      {/* The diamond-ring bead, at the wedge's midpoint. */}
      <circle cx="14.71" cy="4.45" r="1.7" fill={LME_LIGHT} stroke="none" />
      <circle cx="14.71" cy="4.45" r="2.9" fill={LME_CORONA} opacity={0.3} stroke="none" />

      {/* Two inner corona wisps against the disc, so it is not a flat hole. */}
      <g stroke={LME_CORONA} strokeWidth={0.6} opacity={0.35} fill="none">
        <path d="M6.2 15.6 Q9.0 17.6 11.4 17.0" />
        <path d="M17.2 16.6 Q15.0 18.8 12.6 18.6" />
      </g>
    </GlyphShell>
  );
}

/* --------------------------------------------------------------------------
 * SECTION SPECIALIST -- 100% on every question of one concept, N times over.
 * Motif: HEXAGONAL nodes joined by straight links. Hexagons specifically,
 * because polymath BASE's `IconMindLattice` already owns round nodes inside a
 * cranial silhouette and the two must never be confused: that one is a mind,
 * this one is a structure being mastered cell by cell. The tier step is the
 * count of cells and how many of them are lit.
 * ------------------------------------------------------------------------ */

/** P17. SectionSpecialistNode -- Section Specialist BASE (dim phosphor). ONE
 *  cell, resolved: a large hexagon with a concentric inner hexagon and a lit
 *  core, wired to three unlit neighbours. Three sections mastered is one node
 *  and the beginnings of a neighbourhood. */
const SCB_LEAF = "#d3ecc9";
const SCB_DEEP = "#1c3216";
const SCB_LIGHT = "#f5fff0";

export function IconSectionSpecialistNode(props: BadgeGlyphProps) {
  const sats: [number, number][] = [[19.4, 6.0], [4.4, 9.6], [7.2, 20.2]];
  return (
    <GlyphShell {...props}>
      {/* Links out to the unlit neighbours, drawn first. */}
      <g stroke={SCB_LEAF} strokeWidth={1} opacity={0.6}>
        <path d="M15.6 9.2 L18.6 6.9" />
        <path d="M7.4 10.6 L5.2 10.0" />
        <path d="M9.6 16.4 L7.7 19.0" />
      </g>

      {/* Three unlit neighbours -- outline only, so "unresolved" is legible. */}
      <g stroke={SCB_LEAF} strokeWidth={1.1} fill="none" opacity={0.8}>
        {sats.map(([x, y], i) => (
          <path key={i} d={hexPath(x, y, 1.9)} />
        ))}
      </g>

      {/* The resolved cell. */}
      <path d={hexPath(12, 12.6, 6.4)} fill={SCB_DEEP} fillOpacity={0.5} strokeWidth={1.6} />
      <path d={hexPath(12, 12.6, 4.0)} stroke={SCB_LEAF} strokeWidth={1} opacity={0.85} fill="none" />
      <path d={hexPath(12, 12.6, 2.0)} fill={SCB_LIGHT} stroke="none" />

      {/* Six vertex pips -- every corner of the cell accounted for. */}
      <g fill={SCB_LEAF} stroke="none" opacity={0.9}>
        {[...Array(6)].map((_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          return <circle key={i} cx={12 + Math.cos(a) * 6.4} cy={12.6 + Math.sin(a) * 6.4} r={0.75} />;
        })}
      </g>
    </GlyphShell>
  );
}

/** P18. SectionSpecialistGrid -- Section Specialist SUPER (grid cyan-green).
 *  INK MARK: this card's relative luminance is 0.453, just over the line, so
 *  every accent below is a DEEP teal. One cell has become a 3x3 LATTICE with
 *  orthogonal links; the centre cell is filled and haloed and four others are
 *  resolved, the corners are not. Ten sections is a grid with holes in it. */
const SCS_INK = "#12332d";
const SCS_MID = "#2e6058";
const SCS_DEEP = "#071e1a";

export function IconSectionSpecialistGrid(props: BadgeGlyphProps) {
  const cols = [5.4, 12, 18.6];
  const rows = [6.0, 12.6, 19.2];
  const cells: { x: number; y: number; lit: number }[] = [];
  rows.forEach((y, r) =>
    cols.forEach((x, c) => {
      // Centre is the hub; the four edge-centres are resolved; corners are not.
      const isCorner = (r === 0 || r === 2) && (c === 0 || c === 2);
      cells.push({ x, y, lit: r === 1 && c === 1 ? 2 : isCorner ? 0 : 1 });
    })
  );
  return (
    <GlyphShell {...props}>
      {/* Orthogonal links. */}
      <g stroke={SCS_MID} strokeWidth={1} opacity={0.75}>
        <path d="M7.7 6.0 H9.7 M14.3 6.0 H16.3" />
        <path d="M7.7 12.6 H9.7 M14.3 12.6 H16.3" />
        <path d="M7.7 19.2 H9.7 M14.3 19.2 H16.3" />
        <path d="M5.4 8.3 V10.3 M5.4 14.9 V16.9" />
        <path d="M12 8.3 V10.3 M12 14.9 V16.9" />
        <path d="M18.6 8.3 V10.3 M18.6 14.9 V16.9" />
      </g>

      {/* Cells. */}
      {cells.map((c, i) => (
        <g key={i}>
          <path
            d={hexPath(c.x, c.y, c.lit === 2 ? 3.0 : 2.3)}
            fill={c.lit === 0 ? "none" : SCS_INK}
            fillOpacity={c.lit === 2 ? 0.9 : 0.45}
            stroke={c.lit === 0 ? SCS_MID : undefined}
            strokeWidth={c.lit === 2 ? 1.5 : 1.15}
            opacity={c.lit === 0 ? 0.65 : 1}
          />
        </g>
      ))}

      {/* Hub halo and core. */}
      <path d={hexPath(12, 12.6, 4.4)} stroke={SCS_MID} strokeWidth={0.7} fill="none" opacity={0.6} />
      <circle cx="12" cy="12.6" r="1.1" fill={SCS_DEEP} stroke="none" />

      {/* Baseline rule -- the lattice is mounted on something. */}
      <path d="M1.6 22.6 H22.4" strokeWidth={0.9} stroke={SCS_MID} opacity={0.45} />
    </GlyphShell>
  );
}

/** P19. SectionSpecialistMatrix -- Section Specialist LEGENDARY (matrix green).
 *  The grid rotates 45 degrees and densifies into a DIAMOND lattice of thirteen
 *  cells on diagonal links, with a resolved path traced through four of them
 *  and an outer diamond frame closing the structure. Twenty-five sections is
 *  no longer a grid with holes; it is a solved shape. */
const SCL_MINT = "#8bf7a4";
const SCL_DEEP = "#032b18";
const SCL_LIGHT = "#e9fff0";

export function IconSectionSpecialistMatrix(props: BadgeGlyphProps) {
  // Diamond arrangement: rows of 1 / 3 / 5 / 3 / 1.
  const rowsDef: [number, number][] = [[12.6, 1], [8.0, 3], [3.4, 5], [8.0, 3], [12.6, 1]];
  const nodes: [number, number][] = [];
  const yRows = [3.0, 7.8, 12.6, 17.4, 22.2];
  rowsDef.forEach(([, n], r) => {
    const span = 4.6;
    const startX = 12 - ((n - 1) * span) / 2;
    for (let i = 0; i < n; i++) nodes.push([startX + i * span, yRows[r]]);
  });
  // A resolved path threading the lattice bottom-left to top-right.
  const litIdx = [5, 7, 9, 11];
  return (
    <GlyphShell {...props}>
      {/* Outer diamond frame. */}
      <path d="M12 1.2 L22.8 12.6 L12 24.0 L1.2 12.6 Z" stroke={SCL_MINT} strokeWidth={0.8} opacity={0.45} fill={SCL_DEEP} fillOpacity={0.22} />

      {/* Diagonal links -- every cell to its neighbours on the diagonal. */}
      <g stroke={SCL_MINT} strokeWidth={0.75} opacity={0.6}>
        <path d="M12 3.0 L9.7 7.8 M12 3.0 L14.3 7.8" />
        <path d="M7.4 7.8 L5.1 12.6 M7.4 7.8 L9.7 12.6" />
        <path d="M12 7.8 L9.7 12.6 M12 7.8 L14.3 12.6" />
        <path d="M16.6 7.8 L14.3 12.6 M16.6 7.8 L18.9 12.6" />
        <path d="M4.8 12.6 L7.1 17.4 M9.4 12.6 L7.1 17.4 M9.4 12.6 L11.7 17.4" />
        <path d="M14.6 12.6 L12.3 17.4 M14.6 12.6 L16.9 17.4 M19.2 12.6 L16.9 17.4" />
        <path d="M7.4 17.4 L9.7 22.2 M16.6 17.4 L14.3 22.2 M12 17.4 L12 22.2" />
      </g>

      {/* Cells. */}
      {nodes.map(([x, y], i) => {
        const lit = litIdx.includes(i);
        return (
          <path
            key={i}
            d={hexPath(x, y, lit ? 2.1 : 1.6)}
            fill={lit ? SCL_LIGHT : SCL_DEEP}
            fillOpacity={lit ? 0.95 : 0.55}
            strokeWidth={lit ? 1.2 : 0.95}
            opacity={lit ? 1 : 0.8}
          />
        );
      })}

      {/* The resolved path itself, drawn over the links it uses. */}
      <path d="M4.8 12.6 L9.4 12.6 L14.6 12.6 L19.2 12.6" stroke={SCL_LIGHT} strokeWidth={1.3} opacity={0.85} fill="none" />
    </GlyphShell>
  );
}

/** P20. SectionSpecialistNexus -- Section Specialist MYTHIC (nexus white).
 *  INK MARK: near-white card, so every accent is a DEEP forest teal. The
 *  structural addition: the lattice stops being flat and CONVERGES. Twelve
 *  perimeter cells feed twelve spokes into one core cell, two orbit rings hold
 *  the ring together, and six long rays leave the core -- the only tier where
 *  anything escapes the structure. Fifty sections is a network with a centre. */
const SSM_INK = "#0e2b1d";
const SSM_MID = "#215c3f";
const SSM_DEEP = "#04140d";

export function IconSectionSpecialistNexus(props: BadgeGlyphProps) {
  const ring = [...Array(12)].map((_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: 12 + Math.cos(a) * 9.3, y: 12 + Math.sin(a) * 9.3, a, big: i % 3 === 0 };
  });
  return (
    <GlyphShell {...props}>
      {/* Six long rays escaping the core. */}
      <g stroke={SSM_MID} strokeWidth={0.75} opacity={0.5}>
        {[...Array(6)].map((_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.26;
          return (
            <path
              key={i}
              d={`M${(12 + Math.cos(a) * 4.6).toFixed(2)} ${(12 + Math.sin(a) * 4.6).toFixed(2)} L${(12 + Math.cos(a) * 12.2).toFixed(2)} ${(12 + Math.sin(a) * 12.2).toFixed(2)}`}
            />
          );
        })}
      </g>

      {/* Two orbit rings. */}
      <circle cx="12" cy="12" r="9.3" stroke={SSM_MID} strokeWidth={0.7} opacity={0.5} fill="none" />
      <circle cx="12" cy="12" r="6.6" stroke={SSM_MID} strokeWidth={0.55} opacity={0.32} fill="none" />

      {/* Twelve spokes, all the way in. */}
      <g stroke={SSM_MID} strokeWidth={0.85} opacity={0.7}>
        {ring.map((n, i) => (
          <path
            key={i}
            d={`M${(12 + Math.cos(n.a) * 7.7).toFixed(2)} ${(12 + Math.sin(n.a) * 7.7).toFixed(2)} L${(12 + Math.cos(n.a) * 3.6).toFixed(2)} ${(12 + Math.sin(n.a) * 3.6).toFixed(2)}`}
          />
        ))}
      </g>

      {/* Perimeter cells. */}
      {ring.map((n, i) => (
        <path
          key={i}
          d={hexPath(n.x, n.y, n.big ? 1.85 : 1.3)}
          fill={SSM_INK}
          fillOpacity={n.big ? 0.85 : 0.5}
          strokeWidth={n.big ? 1.15 : 0.85}
        />
      ))}

      {/* The core. Three concentric hexagons, the innermost solid. */}
      <path d={hexPath(12, 12, 5.0)} fill={SSM_DEEP} fillOpacity={0.35} strokeWidth={1.55} />
      <path d={hexPath(12, 12, 3.3)} stroke={SSM_MID} strokeWidth={0.9} fill="none" opacity={0.85} />
      <path d={hexPath(12, 12, 1.7)} fill={SSM_INK} stroke="none" />
    </GlyphShell>
  );
}

/**
 * Phase-2 keys -- five new families, four tiers each. Same "brand-new iconName"
 * contract as `referenceBatchGlyphs` and `mythicPhase1Glyphs`: every string
 * below was seeded by the backend alongside its own AchievementBadge row and is
 * owned by exactly one row, so this spread cannot change the appearance of any
 * badge from the original 30 or from phase 1. Kept as one export so
 * `badgeVisuals.ts` and `BadgeInspectionModal.tsx` cannot drift on which glyph
 * a key resolves to.
 */
export const phase2Glyphs = {
  MarathonTrail: IconMarathonTrail,                          // marathoner         BASE
  MarathonSurge: IconMarathonSurge,                          // marathoner         SUPER
  MarathonHorizon: IconMarathonHorizon,                      // marathoner         LEGENDARY
  MarathonEternal: IconMarathonEternal,                      // marathoner         MYTHIC
  IronWallBrick: IconIronWallBrick,                          // iron_wall          BASE
  IronWallBastion: IconIronWallBastion,                      // iron_wall          SUPER
  IronWallRampart: IconIronWallRampart,                      // iron_wall          LEGENDARY
  IronWallCitadel: IconIronWallCitadel,                      // iron_wall          MYTHIC
  VeteranChevron: IconVeteranChevron,                        // veteran            BASE
  VeteranMedallion: IconVeteranMedallion,                    // veteran            SUPER
  VeteranStandard: IconVeteranStandard,                      // veteran            LEGENDARY
  VeteranLegacy: IconVeteranLegacy,                          // veteran            MYTHIC
  LastMinuteSpark: IconLastMinuteSpark,                      // last_minute_hero   BASE
  LastMinuteFlash: IconLastMinuteFlash,                      // last_minute_hero   SUPER
  LastMinuteBlaze: IconLastMinuteBlaze,                      // last_minute_hero   LEGENDARY
  LastMinuteEclipse: IconLastMinuteEclipse,                  // last_minute_hero   MYTHIC
  SectionSpecialistNode: IconSectionSpecialistNode,          // section_specialist BASE
  SectionSpecialistGrid: IconSectionSpecialistGrid,          // section_specialist SUPER
  SectionSpecialistMatrix: IconSectionSpecialistMatrix,      // section_specialist LEGENDARY
  SectionSpecialistNexus: IconSectionSpecialistNexus,        // section_specialist MYTHIC
} as const;
