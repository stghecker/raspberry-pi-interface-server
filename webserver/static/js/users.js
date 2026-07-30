(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let users = [];
  let editingId = null;
  let createFolders = [];
  let editFolders = [];

  const chip = (path, onRemove) => {
    const el = document.createElement('span');
    el.className = 'chip';
    const t = document.createElement('span'); t.textContent = path; el.appendChild(t);
    const x = document.createElement('button'); x.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    x.onclick = () => { onRemove(path); renderChips(); };
    el.appendChild(x);
    return el;
  };

  function renderChips() {
    const a = $('cu_folders'); a.innerHTML = '';
    createFolders.forEach(p => a.appendChild(chip(p, (f) => { createFolders = createFolders.filter(x => x !== f); })));
    const b = $('eu_folders'); b.innerHTML = '';
    editFolders.forEach(p => b.appendChild(chip(p, (f) => { editFolders = editFolders.filter(x => x !== f); })));
  }

  function addFolder(list, inputId) {
    const inp = $(inputId);
    const v = (inp.value || '').trim();
    if (!v) return;
    if (!list.includes(v)) list.push(v);
    inp.value = '';
    renderChips();
  }
  $('cu_folderAdd').onclick = () => addFolder(createFolders, 'cu_folderInput');
  $('cu_folderInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFolder(createFolders, 'cu_folderInput'); } });
  $('eu_folderAdd').onclick = () => addFolder(editFolders, 'eu_folderInput');
  $('eu_folderInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFolder(editFolders, 'eu_folderInput'); } });

  $('cu_admin').addEventListener('change', function () {
    $('cu_foldersField').style.display = this.checked ? 'none' : '';
  });

  async function loadUsers() {
    try {
      users = await api('/api/users');
      render();
    } catch (e) { toast(e.message, 'err'); }
  }

  function render() {
    const body = $('usersBody');
    if (!users.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:28px">No users yet.</td></tr>';
      return;
    }
    body.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const folderTxt = u.is_admin ? 'All folders' : (u.folders.length ? u.folders.length + ' folder' + (u.folders.length > 1 ? 's' : '') : 'No access');
      tr.innerHTML =
        '<td><strong style="font-family:var(--mono)">' + esc(u.username) + '</strong></td>' +
        '<td>' + esc(u.display_name || '—') + '</td>' +
        '<td><span class="badge ' + (u.is_admin ? 'badge-admin' : 'badge-user') + '">' + (u.is_admin ? 'Admin' : 'User') + '</span></td>' +
        '<td style="color:var(--text-dim);font-size:12.5px">' + esc(folderTxt) + '</td>' +
        '<td style="color:var(--text-faint);font-size:12.5px">' + esc(u.created_at || '—') + '</td>' +
        '<td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="' + u.id + '">Edit</button></div></td>';
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEdit(parseInt(b.dataset.edit, 10)));
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  $('addUserBtn').onclick = () => {
    $('cu_username').value = ''; $('cu_display').value = ''; $('cu_password').value = '';
    $('cu_admin').checked = false; $('cu_foldersField').style.display = '';
    createFolders = []; renderChips();
    openModal('createModal');
    setTimeout(() => $('cu_username').focus(), 50);
  };

  $('cu_create').onclick = async () => {
    const username = $('cu_username').value.trim();
    const display_name = $('cu_display').value.trim();
    const password = $('cu_password').value;
    const is_admin = $('cu_admin').checked;
    if (!username || !password) { toast('Username and password are required', 'err'); return; }
    if (password.length < 6) { toast('Password must be at least 6 characters', 'err'); return; }
    try {
      await api('/api/users/create', { method: 'POST', body: { username, display_name, password, is_admin, folders: is_admin ? [] : createFolders } });
      closeModal('createModal');
      toast('User created', 'ok');
      loadUsers();
    } catch (e) { toast(e.message, 'err'); }
  };

  function openEdit(id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    editingId = id;
    $('eu_username').textContent = u.username;
    $('eu_display').value = u.display_name;
    $('eu_password').value = '';
    editFolders = u.folders.slice();
    $('eu_foldersHint').style.display = u.is_admin ? 'none' : '';
    renderChips();
    openModal('editModal');
  }

  $('eu_save').onclick = async () => {
    if (editingId == null) return;
    const display_name = $('eu_display').value.trim();
    const password = $('eu_password').value;
    try {
      await api('/api/users/' + editingId + '/profile', { method: 'POST', body: { display_name } });
      await api('/api/users/' + editingId + '/folders', { method: 'POST', body: { folders: editFolders } });
      if (password) {
        if (password.length < 6) { toast('Password must be at least 6 characters', 'err'); return; }
        await api('/api/users/' + editingId + '/password', { method: 'POST', body: { password } });
      }
      closeModal('editModal');
      toast('Changes saved', 'ok');
      loadUsers();
    } catch (e) { toast(e.message, 'err'); }
  };

  $('eu_delete').onclick = async () => {
    if (editingId == null) return;
    const u = users.find(x => x.id === editingId);
    if (!confirm('Delete user "' + u.username + '"? This cannot be undone.')) return;
    try {
      await api('/api/users/' + editingId, { method: 'DELETE' });
      closeModal('editModal');
      toast('User deleted', 'ok');
      loadUsers();
    } catch (e) { toast(e.message, 'err'); }
  };

  loadUsers();
})();
