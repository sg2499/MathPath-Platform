// Illustrated (SVG) versions of the three sign-in stages. They paint instantly, and stay in place
// on phones, under reduced motion, and on machines where 3D is unavailable or too slow.
// All colour comes from the --si-* tokens in login.css, so role and theme changes need no code here.

import { RODS } from "./shared";
import type { BeadKind, BeadTapHandler, DigitOptions, LoginRole } from "./shared";

export interface FlatStage {
  setDigits(digits: number[], options?: DigitOptions): void;
  show(role: LoginRole): void;
  destroy(): void;
}

interface BeadElement extends SVGGElement {
  placed?: string;
}

function buildAbacus(host: HTMLElement, onTap: BeadTapHandler) {
  const x0 = 30;
  const yTop = 30;
  const heaven = 95;
  const beamHeight = 16;
  const earth = 220;
  const innerWidth = 730;
  const width = innerWidth + 60;
  const height = heaven + beamHeight + earth + 60;
  const beadHeight = 42;
  const centre = x0 + innerWidth / 2;
  const beamTop = yTop + heaven;
  const beamBottom = beamTop + beamHeight;
  const bottom = beamBottom + earth;
  const beadPath = "M-41 0 L-15 -19 H15 L41 0 L15 19 H-15 Z";
  const frame =
    `M26 0H${width - 26}a26 26 0 0 1 26 26V${height - 26}a26 26 0 0 1-26 26H26a26 26 0 0 1-26-26V26A26 26 0 0 1 26 0Z ` +
    `M${x0} ${yTop}V${bottom}H${x0 + innerWidth}V${yTop}Z`;

  let svg =
    `<svg viewBox="-16 -14 ${width + 32} ${height + 64}" preserveAspectRatio="xMidYMid meet" focusable="false">` +
    `<defs><linearGradient id="mp-si-a-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>` +
    `<linearGradient id="mp-si-a-fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>` +
    `<filter id="mp-si-a-bl" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="12"/></filter></defs>` +
    `<ellipse cx="${width / 2}" cy="${height + 34}" rx="${width * 0.46}" ry="13" style="fill:var(--si-shadow2d)" filter="url(#mp-si-a-bl)"/>` +
    `<path fill-rule="evenodd" style="fill:var(--si-frame)" d="${frame}"/><path fill-rule="evenodd" fill="url(#mp-si-a-fr)" d="${frame}"/>`;

  for (let rod = 0; rod < RODS; rod += 1) {
    const x = centre + (3 - rod) * 100;
    svg += `<line x1="${x}" x2="${x}" y1="${yTop}" y2="${bottom}" style="stroke:var(--si-rod)" stroke-width="8"/>`;
  }
  svg += `<rect x="${x0}" y="${beamTop}" width="${innerWidth}" height="${beamHeight}" style="fill:var(--si-beam)"/>`;
  [0, 3, 6].forEach((rod) => {
    svg += `<circle cx="${centre + (3 - rod) * 100}" cy="${beamTop + beamHeight / 2}" r="3.6" style="fill:var(--si-glow)"/>`;
  });
  const bead = (extra: string, rod: number, kind: BeadKind, index: number) =>
    `<g class="mp-si-bead${extra}" data-rod="${rod}" data-kind="${kind}" data-i="${index}">` +
    `<path class="body" d="${beadPath}" stroke-width="5" stroke-linejoin="round"/><path d="${beadPath}" fill="url(#mp-si-a-sh)"/>` +
    `<path class="gloss" d="M-29 -3 L-12 -15 H9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/></g>`;
  for (let rod = 0; rod < RODS; rod += 1) {
    svg += bead(" hi", rod, "h", 0);
    for (let i = 0; i < 4; i += 1) svg += bead("", rod, "e", i);
  }
  host.innerHTML = `${svg}</svg>`;

  const beads = Array.from(host.querySelectorAll<BeadElement>(".mp-si-bead"));

  function setDigits(digits: number[], options?: DigitOptions) {
    const stagger = options?.stagger ?? 0;
    let moved = 0;
    for (let rod = RODS - 1; rod >= 0; rod -= 1) {
      const digit = digits[rod];
      const heavenOn = digit >= 5;
      const earthOn = digit % 5;
      const x = centre + (3 - rod) * 100;
      let changed = false;
      beads.forEach((element) => {
        if (Number(element.dataset.rod) !== rod) return;
        const index = Number(element.dataset.i);
        const y =
          element.dataset.kind === "h"
            ? heavenOn
              ? beamTop - beadHeight / 2
              : yTop + beadHeight / 2
            : index < earthOn
              ? beamBottom + beadHeight / 2 + index * beadHeight
              : bottom - beadHeight / 2 - (3 - index) * beadHeight;
        const transform = `translate(${x}px,${y}px)`;
        if (element.placed !== transform) {
          element.placed = transform;
          element.style.transitionDelay = `${moved * stagger}s`;
          element.style.transform = transform;
          changed = true;
        }
      });
      if (changed) moved += 1;
    }
  }

  const handleClick = (event: MouseEvent) => {
    const target = (event.target as Element | null)?.closest<SVGGElement>(".mp-si-bead");
    if (!target) return;
    onTap(Number(target.dataset.rod), target.dataset.kind as BeadKind, Number(target.dataset.i));
  };
  host.addEventListener("click", handleClick);

  return { setDigits, destroy: () => host.removeEventListener("click", handleClick) };
}

// Teacher: rails, one bead per learner, four level gates.
function buildClassroom(host: HTMLElement) {
  const width = 820;
  const height = 400;
  const rails = 7;
  let svg =
    `<svg class="mp-si-t2" viewBox="0 0 ${width} ${height + 40}" preserveAspectRatio="xMidYMid meet" focusable="false">` +
    `<defs><filter id="mp-si-t-bl" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="12"/></filter>` +
    `<radialGradient id="mp-si-t-p" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient></defs>` +
    `<ellipse cx="${width / 2}" cy="${height + 18}" rx="${width * 0.45}" ry="12" style="fill:var(--si-shadow2d)" filter="url(#mp-si-t-bl)"/>` +
    `<rect x="10" y="20" width="${width - 20}" height="${height - 40}" rx="22" style="fill:var(--si-frame)"/>` +
    `<rect x="34" y="44" width="${width - 68}" height="${height - 88}" rx="10" style="fill:var(--si-beam)"/>`;
  [0, 1, 2, 3].forEach((gate) => {
    const x = 180 + gate * 155;
    svg += `<line class="gate" x1="${x}" x2="${x}" y1="52" y2="${height - 52}"/>`;
  });
  for (let i = 0; i < rails; i += 1) {
    const y = 78 + i * ((height - 156) / (rails - 1));
    svg +=
      `<line class="rail" x1="48" x2="${width - 48}" y1="${y}" y2="${y}"/>` +
      `<g class="pearl" style="animation-duration:${22 + ((i * 7) % 5) * 5}s;animation-delay:-${(i * 37) % 23}s">` +
      `<circle cx="60" cy="${y}" r="13"/><circle cx="60" cy="${y}" r="13" fill="url(#mp-si-t-p)"/></g>`;
  }
  host.innerHTML = `${svg}</svg>`;
}

// Admin: the institution as a stacked skyline. Columns are modules, tiers are levels.
function buildLattice(host: HTMLElement) {
  const tiers = [
    [3, 5, 7, 4, 6, 8, 4],
    [2, 4, 5, 6, 3, 5, 3],
    [1, 2, 3, 2, 4, 2, 1],
  ];
  const a = 46;
  const b = 23;
  const h = 17;
  let shapes = "";
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const baseX = 250 + (column - row) * a * 1.25;
      const baseY = 45 + (column + row) * b * 1.25;
      for (let tier = 0; tier < tiers[row][column]; tier += 1) {
        const y = baseY - tier * h * 1.5;
        const top = `M${baseX} ${y - b}l${a} ${b}l-${a} ${b}l-${a} -${b}Z`;
        const delay = (((column * 3 + row * 5) % 9) * 0.7 + tier * 0.22).toFixed(2);
        shapes +=
          `<path class="l" d="M${baseX - a} ${y}l${a} ${b}v${h}l-${a} -${b}Z"/><path class="r" d="M${baseX + a} ${y}l-${a} ${b}v${h}l${a} -${b}Z"/>` +
          `<path class="t" d="${top}"/><path class="p" d="${top}" style="animation-delay:${delay}s"/>`;
      }
    }
  }
  host.innerHTML =
    `<svg class="mp-si-a2" viewBox="0 -40 820 480" preserveAspectRatio="xMidYMid meet" focusable="false">` +
    `<defs><filter id="mp-si-l-bl" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="12"/></filter></defs>` +
    `<ellipse cx="410" cy="418" rx="330" ry="13" style="fill:var(--si-shadow2d)" filter="url(#mp-si-l-bl)"/>${shapes}</svg>`;
}

export function createFlatStage(host: HTMLElement, onTap: BeadTapHandler): FlatStage {
  host.innerHTML = '<div data-stage="student"></div><div data-stage="teacher" hidden></div><div data-stage="admin" hidden></div>';
  const layer = (role: LoginRole) => host.querySelector<HTMLElement>(`[data-stage="${role}"]`) as HTMLElement;
  const abacus = buildAbacus(layer("student"), onTap);
  const built: Partial<Record<LoginRole, boolean>> = { student: true };

  return {
    setDigits: abacus.setDigits,
    show(role) {
      if (role === "teacher" && !built.teacher) {
        buildClassroom(layer("teacher"));
        built.teacher = true;
      }
      if (role === "admin" && !built.admin) {
        buildLattice(layer("admin"));
        built.admin = true;
      }
      (["student", "teacher", "admin"] as LoginRole[]).forEach((name) => {
        layer(name).hidden = name !== role;
      });
    },
    destroy() {
      abacus.destroy();
      host.innerHTML = "";
    },
  };
}
