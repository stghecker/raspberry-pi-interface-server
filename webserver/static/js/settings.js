(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TS = window.THEME_SYSTEM;
  const PRESETS = TS.PRESETS;

  let currentTheme = null;

  // ---- Theme ----
  async function loadTheme() {
    try {
      currentTheme = await api('/api/theme');
      renderThemeGrid();
      var accent = currentTheme.accent || (PRESETS[currentTheme.preset] || PRESETS.midnight).vars['--primary'];
      $('accentPicker').value = accent;
      $('accentHex').value = accent;
    } catch (e) { toast(e.message, 'err'); }
  }

  function renderThemeGrid() {
    const grid = $('themeGrid');
    grid.innerHTML = '';
    Object.keys(PRESETS).forEach(function (key) {
      const p = PRESETS[key];
      const card = document.createElement('div');
      card.className = 'theme-card' + (currentTheme.preset === key && !currentTheme.accent ? ' active' : '');
      const v = p.vars;
      card.innerHTML =
        '<div class="theme-preview" style="background:' + v['--bg'] + ';border:1px solid ' + v['--border-soft'] + '">' +
          '<div class="tp-bar" style="background:' + v['--primary'] + '"></div>' +
          '<div class="tp-card" style="background:' + v['--surface'] + ';border:1px solid ' + v['--border-soft'] + '">' +
            '<div class="tp-line" style="background:' + v['--text-dim'] + ';width:60%"></div>' +
            '<div class="tp-line" style="background:' + v['--text-faint'] + ';width:40%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="theme-name">' + p.name + '</div>';
      card.onclick = function () {
        currentTheme = { preset: key };
        TS.applyTheme(currentTheme);
        renderThemeGrid();
        saveTheme();
      };
      grid.appendChild(card);
    });
  }

  async function saveTheme() {
    try {
      await api('/api/theme', { method: 'POST', body: currentTheme });
      toast('Theme saved', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  $('applyAccent').onclick = function () {
    const hex = $('accentHex').value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) { toast('Enter a valid hex color (e.g. #2dd4bf)', 'err'); return; }
    currentTheme.accent = hex;
    TS.applyTheme(currentTheme);
    saveTheme();
  };

  $('accentPicker').addEventListener('input', function () {
    $('accentHex').value = $('accentPicker').value;
  });

  $('resetThemeBtn').onclick = async function () {
    currentTheme = { preset: 'midnight' };
    TS.applyTheme(currentTheme);
    $('accentPicker').value = '#2dd4bf';
    $('accentHex').value = '#2dd4bf';
    renderThemeGrid();
    await saveTheme();
  };

  // ---- Notifications ----
  const ALERT_KEYS = [
    { key: 'cpu', label: 'CPU Usage', unit: '%', min: 50, max: 100, def: 85 },
    { key: 'temp', label: 'CPU Temperature', unit: '°C', min: 40, max: 100, def: 75 },
    { key: 'mem', label: 'Memory Usage', unit: '%', min: 50, max: 100, def: 85 },
    { key: 'disk', label: 'Disk Usage', unit: '%', min: 50, max: 100, def: 90 },
  ];

  function renderAlerts() {
    const cfg = NOTIF_SYSTEM.getConfig();
    const grid = $('alertGrid');
    grid.innerHTML = '';
    $('notifMaster').checked = cfg.enabled;
    ALERT_KEYS.forEach(function (a) {
      const item = cfg[a.key];
      const row = document.createElement('div');
      row.className = 'alert-row';
      row.innerHTML =
        '<div class="alert-info">' +
          '<label class="switch"><input type="checkbox" data-enable="' + a.key + '"' + (item.enabled ? ' checked' : '') + '><span class="switch-track"><span class="switch-thumb"></span></span></label>' +
          '<div><div class="alert-label">' + a.label + '</div><div class="alert-desc">Alert when above threshold</div></div>' +
        '</div>' +
        '<div class="alert-thresh">' +
          '<input type="range" min="' + a.min + '" max="' + a.max + '" value="' + item.threshold + '" data-range="' + a.key + '">' +
          '<span class="alert-val" data-val="' + a.key + '">' + item.threshold + a.unit + '</span>' +
        '</div>';
      grid.appendChild(row);
    });

    grid.querySelectorAll('[data-enable]').forEach(function (cb) {
      cb.onchange = function () {
        const k = cb.dataset.enable;
        const c = NOTIF_SYSTEM.getConfig();
        c[k].enabled = cb.checked;
        NOTIF_SYSTEM.setConfig(c);
      };
    });
    grid.querySelectorAll('[data-range]').forEach(function (rng) {
      const unit = ALERT_KEYS.find(function (x) { return x.key === rng.dataset.range; }).unit;
      rng.oninput = function () {
        grid.querySelector('[data-val="' + rng.dataset.range + '"]').textContent = rng.value + unit;
      };
      rng.onchange = function () {
        const c = NOTIF_SYSTEM.getConfig();
        c[rng.dataset.range].threshold = parseInt(rng.value, 10);
        NOTIF_SYSTEM.setConfig(c);
      };
    });
  }

  $('notifMaster').onchange = function () {
    const c = NOTIF_SYSTEM.getConfig();
    c.enabled = $('notifMaster').checked;
    NOTIF_SYSTEM.setConfig(c);
  };

  $('resetAlertsBtn').onclick = function () {
    NOTIF_SYSTEM.resetConfig();
    renderAlerts();
    toast('Alert thresholds restored', 'ok');
  };

  loadTheme();
  renderAlerts();
})();
