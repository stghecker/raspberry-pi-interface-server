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
      $('swapVal').textContent = fmt.pct(s.swap_percent);
      $('swapSub').textContent = fmt.bytes(s.swap_used) + ' / ' + fmt.bytes(s.swap_total);
    } catch (e) {
      setLiveStatus('offline', 'Offline');
    }
  }

  poll();
  setInterval(poll, 2000);
})();
