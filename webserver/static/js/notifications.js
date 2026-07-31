// Notifications — system alert bell with threshold-based alerts
(function () {
  'use strict';

  var STORAGE_KEY = 'pi_dash_alerts';
  var DEFAULTS = {
    enabled: true,
    cpu: { enabled: true, threshold: 85 },
    temp: { enabled: true, threshold: 75 },
    mem: { enabled: true, threshold: 85 },
    disk: { enabled: true, threshold: 90 },
  };

  function loadConfig() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) return Object.assign({}, DEFAULTS, saved);
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  var config = loadConfig();
  var alerts = [];
  var activeAlerts = {}; // key -> alert obj (dedupe while active)

  function checkMetric(snap) {
    if (!config.enabled) return;
    var checks = [
      { key: 'cpu', val: snap.cpu_percent, label: 'CPU Usage', unit: '%' },
      { key: 'temp', val: snap.cpu_temp, label: 'CPU Temperature', unit: '°C' },
      { key: 'mem', val: snap.mem_percent, label: 'Memory Usage', unit: '%' },
      { key: 'disk', val: snap.disk_percent, label: 'Disk Usage', unit: '%' },
    ];
    checks.forEach(function (c) {
      var cfg = config[c.key];
      if (!cfg || !cfg.enabled || c.val == null) {
        delete activeAlerts[c.key];
        return;
      }
      if (c.val >= cfg.threshold) {
        if (!activeAlerts[c.key]) {
          var alert = {
            id: c.key + '-' + Date.now(),
            key: c.key,
            label: c.label,
            value: c.val,
            threshold: cfg.threshold,
            unit: c.unit,
            time: Date.now(),
          };
          activeAlerts[c.key] = alert;
          alerts.unshift(alert);
          if (alerts.length > 50) alerts.pop();
          if (window.toast) window.toast(c.label + ' at ' + c.val + c.unit, 'err');
        } else {
          activeAlerts[c.key].value = c.val;
        }
      } else {
        delete activeAlerts[c.key];
      }
    });
    renderBell();
  }

  function unreadCount() {
    return Object.keys(activeAlerts).length;
  }

  function renderBell() {
    var btn = document.getElementById('notifBtn');
    var dot = document.getElementById('notifDot');
    var panel = document.getElementById('notifPanel');
    if (!btn) return;
    var count = unreadCount();
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';
    if (panel && panel.classList.contains('show')) renderPanel();
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderPanel() {
    var list = document.getElementById('notifList');
    var badge = document.getElementById('notifBadge');
    if (!list) return;
    var count = unreadCount();
    if (badge) badge.textContent = count > 0 ? count : '';
    if (!alerts.length) {
      list.innerHTML = '<div class="notif-empty">No alerts yet. You will be notified when CPU temperature, disk usage, or other metrics exceed your thresholds.</div>';
      return;
    }
    list.innerHTML = '';
    alerts.slice(0, 20).forEach(function (a) {
      var isActive = activeAlerts[a.key];
      var item = document.createElement('div');
      item.className = 'notif-item' + (isActive ? ' active' : '');
      item.innerHTML =
        '<div class="notif-icon ' + (isActive ? 'warn' : 'resolved') + '">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          (isActive
            ? '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
            : '<path d="M20 6 9 17l-5-5"/>') +
          '</svg>' +
        '</div>' +
        '<div class="notif-body">' +
          '<div class="notif-title">' + a.label + '</div>' +
          '<div class="notif-desc">' + a.value + a.unit + ' — threshold ' + a.threshold + a.unit + '</div>' +
        '</div>' +
        '<div class="notif-time">' + fmtTime(a.time) + '</div>';
      list.appendChild(item);
    });
  }

  function togglePanel() {
    var panel = document.getElementById('notifPanel');
    if (!panel) return;
    if (panel.classList.contains('show')) {
      panel.classList.remove('show');
    } else {
      renderPanel();
      panel.classList.add('show');
    }
  }

  function clearAll() {
    alerts = [];
    activeAlerts = {};
    renderBell();
    renderPanel();
  }

  window.NOTIF_SYSTEM = {
    checkMetric: checkMetric,
    getConfig: function () { return config; },
    setConfig: function (c) { config = c; saveConfig(c); renderBell(); },
    resetConfig: function () { config = Object.assign({}, DEFAULTS); saveConfig(config); renderBell(); },
    clearAll: clearAll,
    togglePanel: togglePanel,
    getAlerts: function () { return alerts; },
  };

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('notifBtn');
    var panel = document.getElementById('notifPanel');
    var clearBtn = document.getElementById('notifClear');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    if (clearBtn) clearBtn.addEventListener('click', function (e) { e.stopPropagation(); clearAll(); });
    if (panel) panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () {
      if (panel) panel.classList.remove('show');
    });
  });
})();
