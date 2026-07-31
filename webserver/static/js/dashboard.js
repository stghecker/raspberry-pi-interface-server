(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const cpuChart = new Sparkline($('cpuChart'), { max: 100, min: 0, unit: '%', color: '#2dd4bf' });
  const memChart = new Sparkline($('memChart'), { max: 100, min: 0, unit: '%', color: '#38bdf8' });
  const tempChart = new Sparkline($('tempChart'), { max: 90, min: 30, unit: '°C', color: '#fb923c' });
  // network chart stores combined rate; we'll use two values drawn separately
  let netChart, netUpHist = [], netDownHist = [];

  function makeNetChart() {
    const c = $('netChart');
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    function resize() {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, r.width * dpr);
      c.height = Math.max(1, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    return {
      draw(upHist, downHist) {
        const r = c.getBoundingClientRect();
        const w = r.width, h = r.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(35,49,86,0.5)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const y = (h / 4) * i;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        const all = upHist.concat(downHist);
        if (all.length < 2) return;
        const max = Math.max(1024, ...all) * 1.15;
        const step = w / 59;
        function line(hist, color) {
          ctx.beginPath();
          hist.forEach((v, i) => {
            const x = i * step;
            const y = h - (v / max) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        }
        line(downHist, '#38bdf8');
        line(upHist, '#2dd4bf');
      }
    };
  }
  netChart = makeNetChart();

  let lastNet = null;

  function gaugeColor(pct) {
    if (pct >= 85) return 'crit';
    if (pct >= 65) return 'warn';
    return '';
  }

  async function poll() {
    try {
      const s = await api('/api/metrics');
      setLiveStatus('live', 'Live');

      // CPU
      const cpu = s.cpu_percent;
      $('cpuVal').textContent = fmt.pct(cpu);
      $('cpuSub').textContent = s.cpu_count_physical + ' cores · ' + s.cpu_count + ' threads';
      const cg = $('cpuGauge'); cg.style.width = cpu + '%'; cg.className = 'gauge-fill ' + gaugeColor(cpu);
      cpuChart.push(cpu); $('cpuNow').textContent = fmt.pct(cpu);

      // Memory
      $('memVal').textContent = fmt.pct(s.mem_percent);
      $('memSub').textContent = fmt.bytes(s.mem_used) + ' / ' + fmt.bytes(s.mem_total);
      const mg = $('memGauge'); mg.style.width = s.mem_percent + '%'; mg.className = 'gauge-fill ' + gaugeColor(s.mem_percent);
      memChart.push(s.mem_percent); $('memNow').textContent = fmt.pct(s.mem_percent);

      // Temperature
      const t = s.cpu_temp;
      if (t != null) {
        $('tempVal').textContent = t + '°C';
        const tp = clamp((t - 30) / 60 * 100, 0, 100);
        const tg = $('tempGauge'); tg.style.width = tp + '%'; tg.className = 'gauge-fill ' + (t >= 75 ? 'crit' : t >= 60 ? 'warn' : '');
        tempChart.push(t); $('tempNow').textContent = t + '°C';
      } else {
        $('tempVal').textContent = 'N/A';
        $('tempNow').textContent = 'N/A';
      }

      // Disk
      $('diskVal').textContent = fmt.pct(s.disk_percent);
      $('diskSub').textContent = fmt.bytes(s.disk_used) + ' / ' + fmt.bytes(s.disk_total);
      const dg = $('diskGauge'); dg.style.width = s.disk_percent + '%'; dg.className = 'gauge-fill ' + gaugeColor(s.disk_percent);

      // Network rate (delta)
      let upRate = 0, downRate = 0;
      if (lastNet) {
        const dt = 2; // approx poll interval
        upRate = Math.max(0, (s.net_sent - lastNet.sent) / dt);
        downRate = Math.max(0, (s.net_recv - lastNet.recv) / dt);
      }
      lastNet = { sent: s.net_sent, recv: s.net_recv };
      netUpHist.push(upRate); netDownHist.push(downRate);
      if (netUpHist.length > 60) netUpHist.shift();
      if (netDownHist.length > 60) netDownHist.shift();
      netChart.draw(netUpHist, netDownHist);
      $('netUp').textContent = fmt.bytes(upRate) + '/s';
      $('netDown').textContent = fmt.bytes(downRate) + '/s';

      // Bottom row
      $('upVal').textContent = fmt.uptime(s.uptime_seconds);
      $('bootSub').textContent = 'booted ' + fmt.uptime(s.uptime_seconds) + ' ago';
      $('loadVal').textContent = s.load_avg ? s.load_avg.map(n => n.toFixed(2)).join('  ') : 'N/A';
      $('procVal').textContent = s.processes;
      if (window.NOTIF_SYSTEM) NOTIF_SYSTEM.checkMetric(s);
      $('swapVal').textContent = fmt.pct(s.swap_percent);
      $('swapSub').textContent = fmt.bytes(s.swap_used) + ' / ' + fmt.bytes(s.swap_total);
    } catch (e) {
      setLiveStatus('offline', 'Offline');
    }
  }

  poll();
  setInterval(poll, 2000);

  // ---- Process modal ----
  let procTimer = null;
  let procList = [];

  function openProcModal() {
    openModal('procModal');
    loadProcesses();
    procTimer = setInterval(loadProcesses, 3000);
  }

  function closeProcModal() {
    if (procTimer) { clearInterval(procTimer); procTimer = null; }
  }

  async function loadProcesses() {
    try {
      procList = await api('/api/processes');
      renderProcesses();
    } catch (e) { /* ignore */ }
  }

  function renderProcesses() {
    const body = $('procBody');
    const filter = ($('procSearch').value || '').toLowerCase();
    const shown = procList.filter(function (p) {
      return !filter || p.name.toLowerCase().includes(filter) || String(p.pid).includes(filter);
    });
    $('procCount').textContent = procList.length + ' processes';
    if (!shown.length) {
      body.innerHTML = '<tr><td colspan="' + (window.IS_ADMIN ? 7 : 6) + '" style="text-align:center;color:var(--text-faint);padding:20px">No matching processes.</td></tr>';
      return;
    }
    body.innerHTML = '';
    shown.slice(0, 100).forEach(function (p) {
      const tr = document.createElement('tr');
      const cpuClass = p.cpu > 50 ? 'style="color:var(--error)"' : p.cpu > 20 ? 'style="color:var(--warning)"' : '';
      const memClass = p.mem > 50 ? 'style="color:var(--error)"' : p.mem > 20 ? 'style="color:var(--warning)"' : '';
      tr.innerHTML =
        '<td style="font-family:var(--mono);font-size:12px;color:var(--text-dim)">' + p.pid + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td style="font-size:12px;color:var(--text-faint)">' + esc(p.user) + '</td>' +
        '<td style="font-family:var(--mono)" ' + cpuClass + '>' + p.cpu.toFixed(1) + '</td>' +
        '<td style="font-family:var(--mono)" ' + memClass + '>' + p.mem.toFixed(1) + '</td>' +
        '<td><span class="badge ' + (p.status === 'running' ? 'badge-user' : '') + '" style="font-size:10.5px;text-transform:capitalize">' + esc(p.status) + '</span></td>' +
        (window.IS_ADMIN ? '<td style="text-align:right"><button class="btn btn-danger btn-sm" data-kill="' + p.pid + '">Stop</button></td>' : '');
      body.appendChild(tr);
    });
    if (window.IS_ADMIN) {
      body.querySelectorAll('[data-kill]').forEach(function (btn) {
        btn.onclick = function () { killProcess(parseInt(btn.dataset.kill, 10)); };
      });
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  async function killProcess(pid) {
    if (!confirm('Stop process ' + pid + '? This will terminate it immediately.')) return;
    try {
      const res = await api('/api/processes/' + pid + '/kill', { method: 'POST' });
      toast('Stopped ' + (res.name || pid), 'ok');
      loadProcesses();
    } catch (e) { toast(e.message, 'err'); }
  }

  if ($('procCard')) $('procCard').onclick = openProcModal;
  if ($('procSearch')) $('procSearch').addEventListener('input', renderProcesses);
  document.addEventListener('click', function (e) {
    const modal = $('procModal');
    if (modal && modal.classList.contains('show') && e.target === modal) closeProcModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeProcModal();
  });
})();
