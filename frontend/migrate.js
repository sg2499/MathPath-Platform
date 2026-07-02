const fs = require('fs');
let code = fs.readFileSync('app/student/achievements/page.tsx', 'utf8');

const regex = /\"([a-z_]+_(BASE|SUPER|LEGENDARY))\":\s*\{\s*unlockedBg:\s*\"([^\"]+)\",\s*iconColor:\s*\"([^\"]+)\",\s*bloomColor:\s*\"([^\"]+)\",\s*glitch:\s*(true|false),\s*burst:\s*\[([^\]]+)\]\s*\}/g;

const colorMap = {
  'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065f46',
  'cyan-400': '#22d3ee', 'cyan-500': '#06b6d4', 'cyan-600': '#0891b2', 'cyan-700': '#0e7490', 'cyan-800': '#155e75',
  'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8', 'blue-800': '#1e40af', 'blue-900': '#1e3a8a',
  'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c', 'red-800': '#991b1b', 'red-900': '#7f1d1d',
  'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c', 'orange-700': '#c2410c', 'orange-800': '#9a3412',
  'indigo-400': '#818cf8', 'indigo-500': '#6366f1', 'indigo-600': '#4f46e5', 'indigo-700': '#4338ca', 'indigo-800': '#3730a3',
  'yellow-400': '#facc15', 'yellow-500': '#eab308', 'yellow-600': '#ca8a04', 'yellow-700': '#a16207', 'yellow-800': '#854d0e',
  'pink-500': '#ec4899', 'pink-600': '#db2777', 'pink-700': '#be185d', 'pink-800': '#9d174d', 'pink-900': '#831843',
  'fuchsia-500': '#d946ef', 'fuchsia-600': '#c026d3', 'fuchsia-700': '#a21caf', 'violet-600': '#7c3aed', 'violet-700': '#6d28d9', 'violet-800': '#5b21b6',
  'teal-400': '#2dd4bf', 'teal-500': '#14b8a6', 'teal-600': '#0d9488', 'teal-700': '#0f766e', 'teal-800': '#115e59',
  'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b'
};

const textMap = {
  'white': '#ffffff', 'emerald-50': '#ecfdf5', 'cyan-50': '#ecfeff', 'blue-50': '#eff6ff', 'red-50': '#fef2f2',
  'orange-50': '#fff7ed', 'indigo-50': '#eef2ff', 'yellow-50': '#fefce8', 'pink-50': '#fdf2f8', 'fuchsia-50': '#fdf4ff',
  'teal-50': '#f0fdfa', 'slate-50': '#f8fafc', 'slate-400': '#94a3b8', 'slate-600': '#475569'
};

const shadowMap = {
  'emerald-500/20': 'rgba(16, 185, 129, 0.2)', 'emerald-500/30': 'rgba(16, 185, 129, 0.3)', 'emerald-500/40': 'rgba(16, 185, 129, 0.4)',
  'cyan-500/20': 'rgba(6, 182, 212, 0.2)', 'cyan-500/30': 'rgba(6, 182, 212, 0.3)', 'cyan-500/40': 'rgba(6, 182, 212, 0.4)',
  'blue-500/20': 'rgba(59, 130, 246, 0.2)', 'blue-500/30': 'rgba(59, 130, 246, 0.3)', 'blue-500/40': 'rgba(59, 130, 246, 0.4)',
  'red-500/20': 'rgba(239, 68, 68, 0.2)', 'red-500/30': 'rgba(239, 68, 68, 0.3)', 'red-500/40': 'rgba(239, 68, 68, 0.4)',
  'orange-500/20': 'rgba(249, 115, 22, 0.2)', 'orange-500/30': 'rgba(249, 115, 22, 0.3)', 'orange-500/40': 'rgba(249, 115, 22, 0.4)',
  'indigo-500/20': 'rgba(99, 102, 241, 0.2)', 'indigo-500/30': 'rgba(99, 102, 241, 0.3)', 'indigo-500/40': 'rgba(99, 102, 241, 0.4)',
  'yellow-500/20': 'rgba(234, 179, 8, 0.2)', 'yellow-500/30': 'rgba(234, 179, 8, 0.3)', 'yellow-500/40': 'rgba(234, 179, 8, 0.4)',
  'pink-500/20': 'rgba(236, 72, 153, 0.2)', 'pink-500/30': 'rgba(236, 72, 153, 0.3)', 'pink-500/40': 'rgba(236, 72, 153, 0.4)',
  'fuchsia-500/20': 'rgba(217, 70, 239, 0.2)', 'fuchsia-500/30': 'rgba(217, 70, 239, 0.3)', 'fuchsia-500/40': 'rgba(217, 70, 239, 0.4)',
  'teal-500/20': 'rgba(20, 184, 166, 0.2)', 'teal-500/30': 'rgba(20, 184, 166, 0.3)', 'teal-500/40': 'rgba(20, 184, 166, 0.4)',
  'slate-500/20': 'rgba(100, 116, 139, 0.2)', 'slate-500/30': 'rgba(100, 116, 139, 0.3)', 'slate-500/40': 'rgba(100, 116, 139, 0.4)'
};

const borderMap = {
  'white/70': '2px solid rgba(255,255,255,0.7)', 'white': '2px solid #ffffff',
  'emerald-200': '4px solid #a7f3d0', 'cyan-200': '4px solid #a5f3fc', 'blue-200': '4px solid #bfdbfe',
  'red-200': '4px solid #fecaca', 'orange-200': '4px solid #fed7aa', 'indigo-200': '4px solid #c7d2fe',
  'yellow-200': '4px solid #fef08a', 'pink-200': '4px solid #fbcfe8', 'fuchsia-200': '4px solid #f5d0fe',
  'teal-200': '4px solid #99f6e4', 'slate-300': '4px solid #cbd5e1'
};

let output = code.replace(regex, (match, key, tier, bg, icon, bloom, glitch, burst) => {
  let fromMatch = bg.match(/from-([a-z]+-\d+)/);
  let toMatch = bg.match(/to-([a-z]+-\d+)/);
  let shadowMatch = bg.match(/shadow-([a-z0-9-\/]+)/);
  let borderCMatch = bg.match(/border-([a-z0-9-\/]+)$/);
  if (!borderCMatch && bg.includes('border-white/70')) borderCMatch = [null, 'white/70'];
  if (!borderCMatch && bg.includes('border-white')) borderCMatch = [null, 'white'];
  
  let gradientStr = `linear-gradient(to bottom right, ${colorMap[fromMatch[1]] || '#000'}, ${colorMap[toMatch[1]] || '#000'})`;
  let shadowStr = shadowMatch ? `0 10px 15px -3px ${shadowMap[shadowMatch[1]] || 'rgba(0,0,0,0.1)'}` : 'none';
  let borderStr = borderCMatch ? borderMap[borderCMatch[1]] : 'none';
  
  let iconColorHex = textMap[icon.replace('text-', '')] || '#ffffff';
  
  return `"${key}": { customBg: "${gradientStr}", customShadow: "${shadowStr}", customBorder: "${borderStr}", iconColorHex: "${iconColorHex}", bloomColor: "${bloom}", glitch: ${glitch}, burst: [${burst}] }`;
});

// Update the JSX to use the new fields
output = output.replace(
  /className=\{\`absolute inset-0 transition-all duration-500 \$\{isUnlocked \? config\.unlockedBg : \'bg-slate-200 dark:bg-slate-800 shadow-inner\'\}\`\}/g,
  `className={\`absolute inset-0 transition-all duration-500 \${!isUnlocked ? 'bg-slate-200 dark:bg-slate-800 shadow-inner' : ''}\`}`
);
output = output.replace(
  /style=\{\{ clipPath: shape\.clipPath \}\}/g,
  `style={{ clipPath: shape.clipPath, ...(isUnlocked ? { background: config.customBg, boxShadow: config.customShadow, border: config.customBorder } : {}) }}`
);

output = output.replace(
  /<Icon size=\{32\} className=\{\`relative z-10 \$\{isUnlocked \? config\.iconColor : 'text-slate-400 dark:text-slate-600'\} transition-all duration-300\`\}/g,
  `<Icon size={32} className={\`relative z-10 \${!isUnlocked ? 'text-slate-400 dark:text-slate-600' : ''} transition-all duration-300\`}`
);
output = output.replace(
  /filter: isUnlocked && config\.glitch/g,
  `color: isUnlocked ? config.iconColorHex : undefined,\n            filter: isUnlocked && config.glitch`
);

// Delete the hot reload string
output = output.replace(/const _TAILWIND_HOT_RELOAD_SAFELIST[\s\S]+?;\n/, '');

fs.writeFileSync('app/student/achievements/page.tsx', output);
console.log('Done!');
