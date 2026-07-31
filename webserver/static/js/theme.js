// Theme system — loaded in <head> to prevent flash of unstyled content
(function () {
  'use strict';

  var PRESETS = {
    midnight: {
      name: 'Midnight',
      vars: {
        '--bg': '#0b1120', '--bg-2': '#0f172a', '--surface': '#111c34',
        '--surface-2': '#15213c', '--surface-3': '#1b294a',
        '--border': '#233156', '--border-soft': '#1a2540',
        '--text': '#e8edf7', '--text-dim': '#94a3b8', '--text-faint': '#64748b',
        '--primary': '#2dd4bf', '--primary-600': '#14b8a6', '--primary-700': '#0d9488',
        '--primary-soft': 'rgba(45,212,191,0.14)', '--accent': '#38bdf8',
        '--glow-1': 'rgba(45,212,191,0.08)', '--glow-2': 'rgba(56,189,248,0.07)',
        '--topbar-bg': 'rgba(11,17,32,0.72)', '--sidebar-end': '#0c1426',
        '--on-primary': '#042f2e',
        '--shadow': '0 10px 30px -12px rgba(0,0,0,0.6)',
        '--shadow-sm': '0 2px 10px -4px rgba(0,0,0,0.5)',
      },
    },
    ocean: {
      name: 'Ocean',
      vars: {
        '--bg': '#0a1628', '--bg-2': '#0e1d35', '--surface': '#112440',
        '--surface-2': '#15294a', '--surface-3': '#1a3155',
        '--border': '#234068', '--border-soft': '#1a3050',
        '--text': '#e8edf7', '--text-dim': '#94a3b8', '--text-faint': '#64748b',
        '--primary': '#38bdf8', '--primary-600': '#0ea5e9', '--primary-700': '#0284c7',
        '--primary-soft': 'rgba(56,189,248,0.14)', '--accent': '#7dd3fc',
        '--glow-1': 'rgba(56,189,248,0.08)', '--glow-2': 'rgba(125,211,252,0.06)',
        '--topbar-bg': 'rgba(10,22,40,0.72)', '--sidebar-end': '#081428',
        '--on-primary': '#082030',
        '--shadow': '0 10px 30px -12px rgba(0,0,0,0.6)',
        '--shadow-sm': '0 2px 10px -4px rgba(0,0,0,0.5)',
      },
    },
    forest: {
      name: 'Forest',
      vars: {
        '--bg': '#0d1b14', '--bg-2': '#102318', '--surface': '#142920',
        '--surface-2': '#1a3328', '--surface-3': '#1f3d31',
        '--border': '#2a4d3a', '--border-soft': '#1f3d2e',
        '--text': '#e8f5ed', '--text-dim': '#94a3b8', '--text-faint': '#64748b',
        '--primary': '#34d399', '--primary-600': '#10b981', '--primary-700': '#059669',
        '--primary-soft': 'rgba(52,211,153,0.14)', '--accent': '#86efac',
        '--glow-1': 'rgba(52,211,153,0.08)', '--glow-2': 'rgba(134,239,172,0.06)',
        '--topbar-bg': 'rgba(13,27,20,0.72)', '--sidebar-end': '#0a1810',
        '--on-primary': '#06291c',
        '--shadow': '0 10px 30px -12px rgba(0,0,0,0.6)',
        '--shadow-sm': '0 2px 10px -4px rgba(0,0,0,0.5)',
      },
    },
    sunset: {
      name: 'Sunset',
      vars: {
        '--bg': '#1a1020', '--bg-2': '#20142a', '--surface': '#251a35',
        '--surface-2': '#2c2040', '--surface-3': '#33274a',
        '--border': '#3d2e5c', '--border-soft': '#2e2350',
        '--text': '#f5edf7', '--text-dim': '#a896b8', '--text-faint': '#7a6b8b',
        '--primary': '#fb923c', '--primary-600': '#f97316', '--primary-700': '#ea580c',
        '--primary-soft': 'rgba(251,146,60,0.14)', '--accent': '#fbbf24',
        '--glow-1': 'rgba(251,146,60,0.08)', '--glow-2': 'rgba(248,113,113,0.06)',
        '--topbar-bg': 'rgba(26,16,32,0.72)', '--sidebar-end': '#160c1e',
        '--on-primary': '#2a1505',
        '--shadow': '0 10px 30px -12px rgba(0,0,0,0.6)',
        '--shadow-sm': '0 2px 10px -4px rgba(0,0,0,0.5)',
      },
    },
    light: {
      name: 'Light',
      vars: {
        '--bg': '#f1f5f9', '--bg-2': '#ffffff', '--surface': '#ffffff',
        '--surface-2': '#f8fafc', '--surface-3': '#e2e8f0',
        '--border': '#cbd5e1', '--border-soft': '#e2e8f0',
        '--text': '#1e293b', '--text-dim': '#64748b', '--text-faint': '#94a3b8',
        '--primary': '#0d9488', '--primary-600': '#0f766e', '--primary-700': '#115e59',
        '--primary-soft': 'rgba(13,148,136,0.12)', '--accent': '#0284c7',
        '--glow-1': 'rgba(13,148,136,0.06)', '--glow-2': 'rgba(56,189,248,0.05)',
        '--topbar-bg': 'rgba(248,250,252,0.82)', '--sidebar-end': '#e2e8f0',
        '--on-primary': '#ffffff',
        '--shadow': '0 10px 30px -12px rgba(0,0,0,0.15)',
        '--shadow-sm': '0 2px 8px -3px rgba(0,0,0,0.1)',
      },
    },
  };

  function hexToHsl(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    var toHex = function (x) { return Math.round(x * 255).toString(16).padStart(2, '0'); };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function deriveAccent(hex) {
    var hsl = hexToHsl(hex);
    var h = hsl[0], s = hsl[1], l = hsl[2];
    return {
      '--primary': hex,
      '--primary-600': hslToHex(h, s, Math.max(0, l - 8)),
      '--primary-700': hslToHex(h, s, Math.max(0, l - 16)),
      '--primary-soft': 'hsla(' + h + ',' + s + '%,' + l + '%,0.14)',
      '--accent': hslToHex(h, Math.min(100, s + 5), Math.min(85, l + 12)),
    };
  }

  function applyTheme(theme) {
    theme = theme || { preset: 'midnight' };
    var preset = PRESETS[theme.preset] || PRESETS.midnight;
    var root = document.documentElement;
    root.setAttribute('data-theme', theme.preset || 'midnight');
    Object.keys(preset.vars).forEach(function (k) {
      root.style.setProperty(k, preset.vars[k]);
    });
    if (theme.accent) {
      var derived = deriveAccent(theme.accent);
      Object.keys(derived).forEach(function (k) {
        root.style.setProperty(k, derived[k]);
      });
    }
  }

  var theme = { preset: 'midnight' };
  if (window.__THEME_RAW) {
    try { theme = JSON.parse(window.__THEME_RAW); } catch (e) {}
  }
  applyTheme(theme);

  window.THEME_SYSTEM = {
    PRESETS: PRESETS,
    applyTheme: applyTheme,
    deriveAccent: deriveAccent,
    hexToHsl: hexToHsl,
    hslToHex: hslToHex,
  };
})();
