// ===== Shared app JS =====
(function () {
  'use strict';

  // ---- Sidebar (mobile) ----
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const menuBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('sidebarClose');

  function openSidebar() { sidebar.classList.add('open'); backdrop.classList.add('show'); }
  function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // ---- Toast ----
  let toastTimer = null;
  window.toast = function (msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast ' + (type || ''); }, 3200);
  };

  // ---- Fetch helper with JSON ----
  window.api = async function (url, opts) {
    opts = opts || {};
    const init = {
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    if (opts.body !== undefined) {
      if (opts.body instanceof FormData) {
        init.body = opts.body;
      } else {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
    }
    const res = await fetch(url, init);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json();
    } else if (ct.includes('text/')) {
      data = await res.text();
    }
    if (!res.ok) {
      const msg = (data && data.error) || ('Request failed (' + res.status + ')');
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  // ---- Formatting helpers ----
  window.fmt = {
    bytes(n) {
      if (n == null) return '—';
      if (n < 1024) return n + ' B';
      const u = ['KB', 'MB', 'GB', 'TB', 'PB'];
      let i = -1; let v = n;
      do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
      return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
    },
    pct(n) { return (n == null ? '—' : (Math.round(n * 10) / 10) + '%'); },
    date(ts) {
      if (!ts) return '—';
      const d = new Date(ts * 1000);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    uptime(s) {
      if (s == null) return '—';
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const parts = [];
      if (d) parts.push(d + 'd');
      parts.push(h + 'h');
      parts.push(m + 'm');
      return parts.join(' ');
    },
  };

  // ---- Live status indicator ----
  const dot = document.getElementById('liveDot');
  const status = document.getElementById('liveStatus');
  window.setLiveStatus = function (state, label) {
    if (!dot) return;
    dot.className = 'status-dot ' + state;
    if (status && label) status.textContent = label;
  };

  // ---- Modal helper ----
  window.openModal = function (id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('show');
  };
  window.closeModal = function (id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('show');
  };
  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('show');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.show').forEach(m => m.classList.remove('show'));
    }
  });

  // ---- Hostname display ----
  (async function loadHost() {
    try {
      const snap = await api('/api/metrics');
      const host = snap.hostname;
      const el = document.getElementById('sidebar-host');
      if (el && host) el.textContent = host;
    } catch (e) { /* ignore */ }
  })();
})();
