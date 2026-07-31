(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let currentPath = '';
  let items = [];

  const iconFolder = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg>';
  const iconFile = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const dlIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
  const delIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function renderCrumbs() {
    const c = $('crumb');
    c.innerHTML = '';
    const parts = currentPath ? currentPath.split('/') : [];
    const home = document.createElement('a');
    home.textContent = 'Home';
    home.href = '#';
    home.onclick = (e) => { e.preventDefault(); navigate(''); };
    c.appendChild(home);
    let acc = '';
    parts.forEach((p, i) => {
      acc = acc ? acc + '/' + p : p;
      const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '/'; c.appendChild(sep);
      if (i === parts.length - 1) {
        const cur = document.createElement('span'); cur.className = 'cur'; cur.textContent = p; c.appendChild(cur);
      } else {
        const a = document.createElement('a'); a.textContent = p; a.href = '#';
        const seg = acc;
        a.onclick = (e) => { e.preventDefault(); navigate(seg); };
        c.appendChild(a);
      }
    });
  }

  function renderList() {
    const list = $('fileList');
    const filter = ($('search').value || '').toLowerCase();
    const shown = items.filter(i => !filter || i.name.toLowerCase().includes(filter));
    if (!shown.length) {
      list.innerHTML = '<div class="file-empty">This folder is empty.</div>';
      return;
    }
    list.innerHTML = '';
    shown.forEach(it => {
      const row = document.createElement('div');
      row.className = 'file-row';
      const icon = document.createElement('div');
      icon.className = 'ficon' + (it.is_dir ? '' : ' file');
      icon.innerHTML = it.is_dir ? iconFolder : iconFile;
      const name = document.createElement('div');
      name.className = 'fname';
      name.textContent = it.name;
      const meta = document.createElement('div');
      meta.className = 'fmeta';
      meta.textContent = it.is_dir ? '—' : fmt.bytes(it.size);
      const date = document.createElement('div');
      date.className = 'fmeta';
      date.textContent = fmt.date(it.modified);
      const actions = document.createElement('div');
      actions.className = 'faction';
      if (!it.is_dir) {
        const dl = document.createElement('button');
        dl.className = 'icon-btn'; dl.title = 'Download'; dl.innerHTML = dlIcon;
        dl.onclick = () => download(it.name);
        actions.appendChild(dl);
      }
      if (window.IS_ADMIN) {
        const del = document.createElement('button');
        del.className = 'icon-btn'; del.title = 'Delete'; del.innerHTML = delIcon;
        del.style.color = 'var(--error)';
        del.onclick = () => delItem(it);
        actions.appendChild(del);
      }
      row.appendChild(icon); row.appendChild(name); row.appendChild(meta); row.appendChild(date); row.appendChild(actions);
      if (it.is_dir) {
        row.style.cursor = 'pointer';
        row.onclick = (e) => { if (e.target.closest('.faction')) return; navigate(joinPath(currentPath, it.name)); };
      }
      list.appendChild(row);
    });
  }

  function joinPath(base, name) { return base ? base + '/' + name : name; }

  async function navigate(path) {
    currentPath = path || '';
    $('search').value = '';
    renderCrumbs();
    $('fileList').innerHTML = '<div class="file-empty">Loading…</div>';
    try {
      const data = await api('/api/files/list?path=' + encodeURIComponent(currentPath));
      items = data.items || [];
      renderList();
    } catch (e) {
      $('fileList').innerHTML = '<div class="file-empty">' + (e.message || 'Access denied') + '</div>';
    }
  }

  function download(name) {
    const p = joinPath(currentPath, name);
    window.location.href = '/api/files/download?path=' + encodeURIComponent(p);
  }

  async function delItem(it) {
    if (!confirm('Delete "' + it.name + '"? This cannot be undone.')) return;
    try {
      await api('/api/files/delete', { method: 'POST', body: { path: joinPath(currentPath, it.name) } });
      toast('Deleted ' + it.name, 'ok');
      navigate(currentPath);
    } catch (e) { toast(e.message, 'err'); }
  }

  // toolbar
  $('upBtn').onclick = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    navigate(parts.join('/'));
  };
  $('refreshBtn').onclick = () => navigate(currentPath);
  $('search').addEventListener('input', renderList);

  if (window.IS_ADMIN) {
    $('newFolderBtn').onclick = () => {
      $('mkdirName').value = '';
      $('mkdirPath').textContent = 'Inside: ' + (currentPath || 'Home');
      openModal('mkdirModal');
      setTimeout(() => $('mkdirName').focus(), 50);
    };
    $('mkdirConfirm').onclick = async () => {
      const name = $('mkdirName').value.trim();
      if (!name) return;
      try {
        await api('/api/files/mkdir', { method: 'POST', body: { path: currentPath, name } });
        closeModal('mkdirModal');
        toast('Folder created', 'ok');
        navigate(currentPath);
      } catch (e) { toast(e.message, 'err'); }
    };

    // upload
    const fileInput = $('fileInput');
    const dropzone = $('dropzone');
    $('uploadBtn').onclick = () => { dropzone.classList.add('show'); };
    fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
    dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });
  }

  async function uploadFiles(files) {
    let ok = 0, fail = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('path', currentPath);
      try {
        await api('/api/files/upload', { method: 'POST', body: fd });
        ok++;
      } catch (e) { fail++; toast(e.message, 'err'); }
    }
    if (ok) toast('Uploaded ' + ok + ' file' + (ok > 1 ? 's' : ''), 'ok');
    $('dropzone').classList.remove('show');
    $('fileInput').value = '';
    navigate(currentPath);
  }

  navigate('');
})();
