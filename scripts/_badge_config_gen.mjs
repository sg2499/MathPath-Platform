/* Throwaway: emit paste-ready badgeColorConfig entries from the solved palette. */
const hexToRgb = (hex) => { const h = hex.replace("#",""); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };
const rgbToHex = ([r,g,b]) => "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
function rgbToHsl([r,g,b]){const R=r/255,G=g/255,B=b/255;const mx=Math.max(R,G,B),mn=Math.min(R,G,B);const l=(mx+mn)/2;const d=mx-mn;if(d===0)return[0,0,l];const s=l>0.5?d/(2-mx-mn):d/(mx+mn);let h;if(mx===R)h=((G-B)/d)%6;else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;if(h<0)h+=360;return[h,s,l];}
function hslToRgb(h,s,l){const c=(1-Math.abs(2*l-1))*s;const hp=(((h%360)+360)%360)/60;const x=c*(1-Math.abs((hp%2)-1));let rgb;if(hp<1)rgb=[c,x,0];else if(hp<2)rgb=[x,c,0];else if(hp<3)rgb=[0,c,x];else if(hp<4)rgb=[0,x,c];else if(hp<5)rgb=[x,0,c];else rgb=[c,0,x];const m=l-c/2;return rgb.map(v=>(v+m)*255);}
const hsl=(h,s,l)=>rgbToHex(hslToRgb(h,s,l));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const P = [
  ["perfectionist_BASE",            "#239f82", "BASE",      "jade"],
  ["perfectionist_LEGENDARY",       "#149bf5", "LEGENDARY", "azure"],
  ["speed_demon_SUPER",             "#f2fa05", "SUPER",     "electric citron"],
  ["speed_demon_LEGENDARY",         "#c11f65", "LEGENDARY", "plasma rose"],
  ["competitor_BASE",               "#9591a1", "BASE",      "pewter"],
  ["competitor_SUPER",              "#ce0909", "SUPER",     "signal red"],
  ["competitor_LEGENDARY",          "#c19915", "LEGENDARY", "imperial gold"],
  ["unstoppable_streak_BASE",       "#23339f", "BASE",      "cobalt cold-flame"],
  ["unstoppable_streak_SUPER",      "#1ae657", "SUPER",     "vital green"],
  ["unstoppable_streak_LEGENDARY",  "#f84fd6", "LEGENDARY", "orchid"],
  ["early_bird_BASE",               "#7f5824", "BASE",      "antique bronze"],
  ["early_bird_SUPER",              "#f6caac", "SUPER",     "dawn peach"],
  ["early_bird_LEGENDARY",          "#0f626c", "LEGENDARY", "blue-hour petrol"],
];

for (const [key, id, tier, note] of P) {
  const [h,s,l] = rgbToHsl(hexToRgb(id));
  const [r,g,b] = hexToRgb(id);
  const dark  = hsl(h, clamp(s*1.02,0,1), clamp(l - 0.19, 0.10, 1));
  const deep  = hsl(h, clamp(s*1.02,0,1), clamp(l - 0.30, 0.07, 1));
  const pale  = hsl(h, clamp(s*0.62,0,1), clamp(l + 0.34, 0, 0.93));
  // WCAG relative luminance, NOT HSL lightness: hsl(62,96%,50%) is "mid
  // lightness" but has ~0.85 relative luminance, so a white glyph on it is
  // unreadable. Luminance is what actually decides the ink colour.
  const linz = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const Y = 0.2126 * linz(r) + 0.7152 * linz(g) + 0.0722 * linz(b);
  const isLight = Y > 0.5;
  const ink = isLight ? hsl(h, 0.62, 0.15) : hsl(h, 0.45, 0.96);
  const bloomA = tier === "BASE" ? 0.6 : tier === "SUPER" ? 0.8 : 0.9;
  const shadowA = tier === "BASE" ? 0.2 : tier === "SUPER" ? 0.35 : 0.45;
  const border = tier === "BASE" ? '"none"'
    : tier === "SUPER" ? (isLight ? `"2px solid ${hsl(h,0.7,0.32)}"` : '"2px solid rgba(255,255,255,0.72)"')
    : `"4px solid ${pale}"`;
  const burst = tier === "LEGENDARY" ? [id, dark, pale, "#ffffff"]
    : tier === "SUPER" ? [id, dark, isLight ? deep : "#ffffff"]
    : [id, dark, deep];
  const bgDark = tier === "LEGENDARY" ? deep : dark;
  console.log(
`  // ${note}
  "${key}": { customBg: "linear-gradient(135deg, ${id} 0%, ${bgDark} 100%)", customShadow: "0 10px 15px -3px rgba(${r}, ${g}, ${b}, ${shadowA})", customBorder: ${border}, iconColorHex: "${ink}", bloomColor: "rgba(${r}, ${g}, ${b}, ${bloomA})", glitch: ${tier !== "BASE"}, burst: [${burst.map(x=>`"${x}"`).join(", ")}] },`
  );
}
