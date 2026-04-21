async function fetchJSON(url, opts) {
  const r = await fetch(url, Object.assign({headers:{'Content-Type':'application/json'}}, opts));
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

let isAuth = false;
let isAdmin = false;
let currentUser = null;

async function checkAuth(){
  try{
    const r = await fetch('/api/me');
    const j = await r.json();
    isAuth = !!j.user;
    isAdmin = !!j.is_admin;
    currentUser = j.user || null;
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.style.display = isAuth ? 'inline' : 'none';
    const artistControls = document.getElementById('artist-controls');
    if (artistControls) artistControls.style.display = isAuth ? 'block' : 'none';
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) adminPanel.style.display = isAdmin ? 'block' : 'none';
    const exportBtns = document.getElementById('export-buttons');
    if (exportBtns) exportBtns.style.display = isAuth ? 'block' : 'none';
    return isAuth;
  }catch(e){isAuth=false; isAdmin=false; currentUser=null; return false}
}

async function load() {
  await checkAuth();
  const artists = await fetchJSON('/api/artists');
  const tree = document.getElementById('tree');
  tree.innerHTML = '';
  for (const a of artists) {
    const adiv = document.createElement('div'); adiv.className='artist';
    adiv.dataset.id = a.id;
    adiv.draggable = true;
    let inner = `<strong>${a.name}</strong>`;
    if(isAuth) inner += ` <button data-a='${a.id}' class='del-artist'>Delete</button>`;
    inner += ` <input placeholder='New song' data-aid='${a.id}' class='new-song'/> <button class='add-song' data-aid='${a.id}'>Add Song</button>`;
    adiv.innerHTML = inner;
    for (const s of a.songs) {
      const sdiv = document.createElement('div'); sdiv.className='song';
      sdiv.dataset.id = s.id;
      sdiv.draggable = true;
      let sinner = `${s.title}`;
      if(isAuth) sinner += ` <button data-s='${s.id}' class='del-song'>Delete</button>`;
      sinner += ` <input placeholder='New tuning' data-sid='${s.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${s.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${s.id}'>Add Tuning</button>`;
      sdiv.innerHTML = sinner;
      for (const t of s.tunings) {
        const tdiv = document.createElement('div'); tdiv.className='tuning';
        tdiv.dataset.id = t.id;
        tdiv.draggable = true;
        let tinner = `${t.name} ${t.notes?'- '+t.notes:''}`;
        if(isAuth) tinner += ` <button data-t='${t.id}' class='del-tuning'>Delete</button>`;
        tdiv.innerHTML = tinner;
        sdiv.appendChild(tdiv);
      }
      adiv.appendChild(sdiv);
    }
    tree.appendChild(adiv);
  }
  attachHandlers();
  attachDragHandlers();
  if (isAdmin) {
    await loadAdminUsers();
  } else {
    const adminUsersDiv = document.getElementById('admin-users');
    if (adminUsersDiv) adminUsersDiv.innerHTML = '';
  }
}

// Incremental updates
function addArtistIncremental(artist) {
  const tree = document.getElementById('tree');
  const adiv = document.createElement('div'); adiv.className='artist';
  adiv.dataset.id = artist.id;
  adiv.draggable = true;
  let inner = `<strong>${artist.name}</strong>`;
  if(isAuth) inner += ` <button data-a='${artist.id}' class='del-artist'>Delete</button>`;
  inner += ` <input placeholder='New song' data-aid='${artist.id}' class='new-song'/> <button class='add-song' data-aid='${artist.id}'>Add Song</button>`;
  adiv.innerHTML = inner;
  tree.appendChild(adiv);
  attachHandlers();
}

function deleteArtistIncremental(artistId) {
  const elem = document.querySelector(`.artist[data-id="${artistId}"]`);
  if (elem) elem.remove();
}

function addSongIncremental(artistId, song) {
  const artistDiv = document.querySelector(`.artist[data-id="${artistId}"]`);
  if (!artistDiv) return;
  const sdiv = document.createElement('div'); sdiv.className='song';
  sdiv.dataset.id = song.id;
  sdiv.draggable = true;
  let sinner = `${song.title}`;
  if(isAuth) sinner += ` <button data-s='${song.id}' class='del-song'>Delete</button>`;
  sinner += ` <input placeholder='New tuning' data-sid='${song.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${song.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${song.id}'>Add Tuning</button>`;
  sdiv.innerHTML = sinner;
  artistDiv.appendChild(sdiv);
  attachHandlers();
}

function deleteSongIncremental(songId) {
  const elem = document.querySelector(`.song[data-id="${songId}"]`);
  if (elem) elem.remove();
}

function addTuningIncremental(songId, tuning) {
  const songDiv = document.querySelector(`.song[data-id="${songId}"]`);
  if (!songDiv) return;
  const tdiv = document.createElement('div'); tdiv.className='tuning';
  tdiv.dataset.id = tuning.id;
  tdiv.draggable = true;
  let tinner = `${tuning.name} ${tuning.notes?'- '+tuning.notes:''}`;
  if(isAuth) tinner += ` <button data-t='${tuning.id}' class='del-tuning'>Delete</button>`;
  tdiv.innerHTML = tinner;
  songDiv.appendChild(tdiv);
  attachHandlers();
}

function deleteTuningIncremental(tuningId) {
  const elem = document.querySelector(`.tuning[data-id="${tuningId}"]`);
  if (elem) elem.remove();
}

// Context menu support for artist nodes
function showContextMenu(x, y, artistId) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';
  menu.innerHTML = '';
  // artistId param may be an object {type,id}
  const type = artistId && artistId.type ? artistId.type : 'artist';
  const id = artistId && artistId.id ? artistId.id : artistId;
  if (type === 'artist'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit' data-id='${id}'>Edit Artist</button>`;
    const add = document.createElement('div'); add.innerHTML = `<button class='ctx-add-song' data-id='${id}'>Add Song</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete' data-id='${id}'>Delete Artist</button>`;
    menu.appendChild(edit); menu.appendChild(add); menu.appendChild(del);
  } else if (type === 'song'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit-song' data-id='${id}'>Edit Song</button>`;
    const add = document.createElement('div'); add.innerHTML = `<button class='ctx-add-tuning' data-id='${id}'>Add Tuning</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete-song' data-id='${id}'>Delete Song</button>`;
    menu.appendChild(edit); menu.appendChild(add); menu.appendChild(del);
  } else if (type === 'tuning'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit-tuning' data-id='${id}'>Edit Tuning</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete-tuning' data-id='${id}'>Delete Tuning</button>`;
    menu.appendChild(edit); menu.appendChild(del);
  }
  attachContextHandlers();
}

function hideContextMenu(){
  const menu = document.getElementById('context-menu');
  if(menu) menu.style.display = 'none';
}

function attachContextHandlers(){
  // artist handlers
  document.querySelectorAll('.ctx-edit').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id;
    const newName = prompt('New artist name:');
    if(newName===null) return hideContextMenu();
    try{ await fetchJSON(`/api/artists/${id}`, {method:'PUT', body: JSON.stringify({name:newName})}); hideContextMenu(); load(); }catch(e){ alert('Edit failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-add-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const title = prompt('Song title:');
    if(!title) return hideContextMenu();
    try{ const song = await fetchJSON('/api/songs_auth', {method:'POST', body: JSON.stringify({title, artist_id: parseInt(id)})}); hideContextMenu(); addSongIncremental(id, song); }catch(e){ alert('Add song failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete artist?')) return hideContextMenu();
    try{ await fetchJSON(`/api/artists/${id}/auth`, {method:'DELETE'}); hideContextMenu(); deleteArtistIncremental(id); }catch(e){ alert('Delete failed: '+e); hideContextMenu(); }
  });
  // song handlers
  document.querySelectorAll('.ctx-edit-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const newName = prompt('New song title:'); if(newName===null) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'PUT', body: JSON.stringify({title:newName})}); hideContextMenu(); load(); }catch(e){ alert('Edit song failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-add-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const name = prompt('Tuning name:'); const notes = prompt('Notes (optional):',''); if(!name) return hideContextMenu(); try{ const tuning = await fetchJSON('/api/tunings_auth', {method:'POST', body: JSON.stringify({name, notes, song_id: parseInt(id)})}); hideContextMenu(); addTuningIncremental(id, tuning); }catch(e){ alert('Add tuning failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete song?')) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'DELETE'}); hideContextMenu(); deleteSongIncremental(id); }catch(e){ alert('Delete song failed: '+e); hideContextMenu(); }
  });
  // tuning handlers
  document.querySelectorAll('.ctx-edit-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const newName = prompt('New tuning name:'); if(newName===null) return hideContextMenu(); const notes = prompt('Notes (optional):',''); try{ await fetchJSON(`/api/tunings/${id}/auth`, {method:'PUT', body: JSON.stringify({name:newName, notes})}); hideContextMenu(); load(); }catch(e){ alert('Edit tuning failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete tuning?')) return hideContextMenu(); try{ await fetchJSON(`/api/tunings/${id}/auth`, {method:'DELETE'}); hideContextMenu(); deleteTuningIncremental(id); }catch(e){ alert('Delete tuning failed: '+e); hideContextMenu(); }
  });
}

document.addEventListener('click', (e)=>{ hideContextMenu(); });
document.addEventListener('contextmenu', (e)=>{
  const el = e.target.closest && e.target.closest('.artist');
  if(el && isAuth){
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    showContextMenu(e.pageX, e.pageY, el.dataset.id);
  }
});

// Drag and Drop support
let draggedElement = null;

function attachDragHandlers() {
  document.querySelectorAll('.artist, .song, .tuning').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      draggedElement = el;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragend', (e) => {
      el.style.opacity = '1';
      draggedElement = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!draggedElement || draggedElement === el) return;
      // For now, disable cross-type drops or implement reparenting logic here
      const draggedType = draggedElement.className.split(' ')[0];
      const targetType = el.className.split(' ')[0];
      // Could implement drag-to-reparent logic here (e.g., song to new artist)
    });
  });
}

function attachHandlers(){
  document.querySelectorAll('.del-artist').forEach(b=>b.onclick=async()=>{ const id = b.dataset.a; await fetchJSON('/api/artists/'+id+'/auth',{method:'DELETE'}); deleteArtistIncremental(id); });
  document.querySelectorAll('.del-song').forEach(b=>b.onclick=async()=>{ const id = b.dataset.s; await fetchJSON('/api/songs/'+id+'/auth',{method:'DELETE'}); deleteSongIncremental(id); });
  document.querySelectorAll('.del-tuning').forEach(b=>b.onclick=async()=>{ const id = b.dataset.t; await fetchJSON('/api/tunings/'+id+'/auth',{method:'DELETE'}); deleteTuningIncremental(id); });
  document.querySelectorAll('.add-song').forEach(b=>b.onclick=async()=>{ const inp=document.querySelector(`.new-song[data-aid="${b.dataset.aid}"]`); const title=inp.value.trim(); if(!title) return alert('Enter song title'); const song = await fetchJSON('/api/songs_auth',{method:'POST', body:JSON.stringify({title, artist_id:parseInt(b.dataset.aid)})}); inp.value = ''; addSongIncremental(b.dataset.aid, song); });
  document.querySelectorAll('.add-tuning').forEach(b=>b.onclick=async()=>{ const name=document.querySelector(`.new-tuning[data-sid="${b.dataset.sid}"]`).value.trim(); const notes=document.querySelector(`.new-tuning-notes[data-sid-notes="${b.dataset.sid}"]`).value.trim(); if(!name) return alert('Enter tuning name'); const tuning = await fetchJSON('/api/tunings_auth',{method:'POST', body:JSON.stringify({name, notes, song_id:parseInt(b.dataset.sid)})}); document.querySelector(`.new-tuning[data-sid="${b.dataset.sid}"]`).value=''; document.querySelector(`.new-tuning-notes[data-sid-notes="${b.dataset.sid}"]`).value=''; addTuningIncremental(b.dataset.sid, tuning); });
}

async function loadAdminUsers() {
  try {
    const users = await fetchJSON('/api/admin/users');
    const adminUsersDiv = document.getElementById('admin-users');
    adminUsersDiv.innerHTML = '';
    for (const u of users) {
      const udiv = document.createElement('div'); udiv.className='admin-user';
      let inner = `<strong>${u.username}</strong> (id: ${u.id}) ${u.is_admin ? '[ADMIN]' : ''}`;
      if (isAdmin) {
        if (!u.is_admin) inner += ` <button class='promote-user' data-id='${u.id}'>Promote</button>`;
        else inner += ` <button class='demote-user' data-id='${u.id}'>Demote</button>`;
        if (currentUser !== u.username) inner += ` <button class='delete-user' data-id='${u.id}'>Delete</button>`;
        inner += ` <button class='edit-user' data-id='${u.id}'>Edit</button>`;
      }
      udiv.innerHTML = inner;
      adminUsersDiv.appendChild(udiv);
    }
    attachAdminHandlers();
  } catch(e) { console.error('loadAdminUsers', e); const adminUsersDiv = document.getElementById('admin-users'); if(adminUsersDiv) adminUsersDiv.innerText = 'Error loading users'; }
}

function attachAdminHandlers(){
  document.querySelectorAll('.promote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON('/api/admin/promote',{method:'POST', body:JSON.stringify({user_id:parseInt(b.dataset.id)})}); await load(); await loadAdminUsers();}catch(e){alert('Promote failed: '+e)}});
  document.querySelectorAll('.demote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({is_admin:false})}); await load(); await loadAdminUsers();}catch(e){alert('Demote failed: '+e)}});
  document.querySelectorAll('.delete-user').forEach(b=>b.onclick=async()=>{if(!confirm('Delete user?')) return; try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'DELETE'}); await load(); await loadAdminUsers();}catch(e){alert('Delete failed: '+e)}});
  document.querySelectorAll('.edit-user').forEach(b=>b.onclick=async()=>{const newName = prompt('New username:', ''); if(newName===null) return; const newPass = prompt('New password (leave blank to keep):', ''); try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({username:newName || undefined, password:newPass || undefined})}); await load(); await loadAdminUsers();}catch(e){alert('Edit failed: '+e)}});
  const refreshBtn = document.getElementById('admin-refresh');
  if (refreshBtn) refreshBtn.onclick = async ()=>{ await loadAdminUsers(); };
}

// Export handlers
function setupExportHandlers() {
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.onclick = async () => {
      try {
        window.location.href = '/api/export/json';
      } catch(e) {
        alert('Export failed: ' + e);
      }
    };
  }
  
  const exportXmlBtn = document.getElementById('export-xml-btn');
  if (exportXmlBtn) {
    exportXmlBtn.onclick = async () => {
      try {
        window.location.href = '/api/export/xml';
      } catch(e) {
        alert('Export failed: ' + e);
      }
    };
  }
}

document.getElementById('add-artist').onclick = async ()=>{
  const name = document.getElementById('new-artist').value.trim();
  if(!name) return alert('Enter artist name');
  try{
    const artist = await fetchJSON('/api/artists_auth', {method:'POST', body: JSON.stringify({name})});
    document.getElementById('new-artist').value = '';
    addArtistIncremental(artist);
  }catch(e){alert(e)}
}

document.getElementById('btn-login').onclick = async ()=>{
  const u=document.getElementById('username').value.trim(); const p=document.getElementById('password').value;
  if(!u||!p) return alert('Enter credentials');
  try{ await fetchJSON('/api/login',{method:'POST', body:JSON.stringify({username:u,password:p})}); await checkAuth(); load(); }catch(e){alert('Login failed')}
}

document.getElementById('btn-register').onclick = async ()=>{
  const u=document.getElementById('username').value.trim(); const p=document.getElementById('password').value;
  if(!u||!p) return alert('Enter credentials');
  try{ await fetchJSON('/api/register',{method:'POST', body:JSON.stringify({username:u,password:p})}); alert('Registered'); }catch(e){alert('Register failed: '+e)}
}

document.getElementById('btn-logout').onclick = async ()=>{ await fetchJSON('/api/logout',{method:'POST'}); await checkAuth(); load(); }

setupExportHandlers();
load();


// Context menu support for artist nodes
function showContextMenu(x, y, artistId) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';
  menu.innerHTML = '';
  // artistId param may be an object {type,id}
  const type = artistId && artistId.type ? artistId.type : 'artist';
  const id = artistId && artistId.id ? artistId.id : artistId;
  if (type === 'artist'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit' data-id='${id}'>Edit Artist</button>`;
    const add = document.createElement('div'); add.innerHTML = `<button class='ctx-add-song' data-id='${id}'>Add Song</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete' data-id='${id}'>Delete Artist</button>`;
    menu.appendChild(edit); menu.appendChild(add); menu.appendChild(del);
  } else if (type === 'song'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit-song' data-id='${id}'>Edit Song</button>`;
    const add = document.createElement('div'); add.innerHTML = `<button class='ctx-add-tuning' data-id='${id}'>Add Tuning</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete-song' data-id='${id}'>Delete Song</button>`;
    menu.appendChild(edit); menu.appendChild(add); menu.appendChild(del);
  } else if (type === 'tuning'){
    const edit = document.createElement('div'); edit.innerHTML = `<button class='ctx-edit-tuning' data-id='${id}'>Edit Tuning</button>`;
    const del = document.createElement('div'); del.innerHTML = `<button class='ctx-delete-tuning' data-id='${id}'>Delete Tuning</button>`;
    menu.appendChild(edit); menu.appendChild(del);
  }
  attachContextHandlers();
}

function hideContextMenu(){
  const menu = document.getElementById('context-menu');
  if(menu) menu.style.display = 'none';
}

function attachContextHandlers(){
  // artist handlers
  document.querySelectorAll('.ctx-edit').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id;
    const newName = prompt('New artist name:');
    if(newName===null) return hideContextMenu();
    try{ await fetchJSON(`/api/artists/${id}`, {method:'PUT', body: JSON.stringify({name:newName})}); hideContextMenu(); load(); }catch(e){ alert('Edit failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-add-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const title = prompt('Song title:');
    if(!title) return hideContextMenu();
    try{ await fetchJSON('/api/songs_auth', {method:'POST', body: JSON.stringify({title, artist_id: parseInt(id)})}); hideContextMenu(); load(); }catch(e){ alert('Add song failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete artist?')) return hideContextMenu();
    try{ await fetchJSON(`/api/artists/${id}/auth`, {method:'DELETE'}); hideContextMenu(); load(); }catch(e){ alert('Delete failed: '+e); hideContextMenu(); }
  });
  // song handlers
  document.querySelectorAll('.ctx-edit-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const newName = prompt('New song title:'); if(newName===null) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'PUT', body: JSON.stringify({title:newName})}); hideContextMenu(); load(); }catch(e){ alert('Edit song failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-add-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const name = prompt('Tuning name:'); const notes = prompt('Notes (optional):',''); if(!name) return hideContextMenu(); try{ await fetchJSON('/api/tunings_auth', {method:'POST', body: JSON.stringify({name, notes, song_id: parseInt(id)})}); hideContextMenu(); load(); }catch(e){ alert('Add tuning failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete song?')) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'DELETE'}); hideContextMenu(); load(); }catch(e){ alert('Delete song failed: '+e); hideContextMenu(); }
  });
  // tuning handlers
  document.querySelectorAll('.ctx-edit-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const newName = prompt('New tuning name:'); if(newName===null) return hideContextMenu(); const notes = prompt('Notes (optional):',''); try{ await fetchJSON(`/api/tunings/${id}/auth`, {method:'PUT', body: JSON.stringify({name:newName, notes})}); hideContextMenu(); load(); }catch(e){ alert('Edit tuning failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete tuning?')) return hideContextMenu(); try{ await fetchJSON(`/api/tunings/${id}/auth`, {method:'DELETE'}); hideContextMenu(); load(); }catch(e){ alert('Delete tuning failed: '+e); hideContextMenu(); }
  });
}

document.addEventListener('click', (e)=>{ hideContextMenu(); });
document.addEventListener('contextmenu', (e)=>{
  const el = e.target.closest && e.target.closest('.artist');
  if(el && isAuth){
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    showContextMenu(e.pageX, e.pageY, el.dataset.id);
  }
});

function attachHandlers(){
  document.querySelectorAll('.del-artist').forEach(b=>b.onclick=async()=>{await fetchJSON('/api/artists/'+b.dataset.a+'/auth',{method:'DELETE'});load();});
  document.querySelectorAll('.del-song').forEach(b=>b.onclick=async()=>{await fetchJSON('/api/songs/'+b.dataset.s+'/auth',{method:'DELETE'});load();});
  document.querySelectorAll('.del-tuning').forEach(b=>b.onclick=async()=>{await fetchJSON('/api/tunings/'+b.dataset.t+'/auth',{method:'DELETE'});load();});
  document.querySelectorAll('.add-song').forEach(b=>b.onclick=async()=>{const inp=document.querySelector(`.new-song[data-aid="${b.dataset.aid}"]`);const title=inp.value.trim(); if(!title) return alert('Enter song title'); await fetchJSON('/api/songs_auth',{method:'POST', body:JSON.stringify({title, artist_id:parseInt(b.dataset.aid)})}); load();});
  document.querySelectorAll('.add-tuning').forEach(b=>b.onclick=async()=>{const name=document.querySelector(`.new-tuning[data-sid="${b.dataset.sid}"]`).value.trim(); const notes=document.querySelector(`.new-tuning-notes[data-sid-notes="${b.dataset.sid}"]`).value.trim(); if(!name) return alert('Enter tuning name'); await fetchJSON('/api/tunings_auth',{method:'POST', body:JSON.stringify({name, notes, song_id:parseInt(b.dataset.sid)})}); load();});
}


async function loadAdminUsers() {
  try {
    const users = await fetchJSON('/api/admin/users');
    const adminUsersDiv = document.getElementById('admin-users');
    adminUsersDiv.innerHTML = '';
    for (const u of users) {
      const udiv = document.createElement('div'); udiv.className='admin-user';
      let inner = `<strong>${u.username}</strong> (id: ${u.id}) ${u.is_admin ? '[ADMIN]' : ''}`;
      if (isAdmin) {
        if (!u.is_admin) inner += ` <button class='promote-user' data-id='${u.id}'>Promote</button>`;
        else inner += ` <button class='demote-user' data-id='${u.id}'>Demote</button>`;
        if (currentUser !== u.username) inner += ` <button class='delete-user' data-id='${u.id}'>Delete</button>`;
        inner += ` <button class='edit-user' data-id='${u.id}'>Edit</button>`;
      }
      udiv.innerHTML = inner;
      adminUsersDiv.appendChild(udiv);
    }
    attachAdminHandlers();
  } catch(e) { console.error('loadAdminUsers', e); const adminUsersDiv = document.getElementById('admin-users'); if(adminUsersDiv) adminUsersDiv.innerText = 'Error loading users'; }
}

function attachAdminHandlers(){
  document.querySelectorAll('.promote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON('/api/admin/promote',{method:'POST', body:JSON.stringify({user_id:parseInt(b.dataset.id)})}); await load(); await loadAdminUsers();}catch(e){alert('Promote failed: '+e)}});
  document.querySelectorAll('.demote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({is_admin:false})}); await load(); await loadAdminUsers();}catch(e){alert('Demote failed: '+e)}});
  document.querySelectorAll('.delete-user').forEach(b=>b.onclick=async()=>{if(!confirm('Delete user?')) return; try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'DELETE'}); await load(); await loadAdminUsers();}catch(e){alert('Delete failed: '+e)}});
  document.querySelectorAll('.edit-user').forEach(b=>b.onclick=async()=>{const newName = prompt('New username:', ''); if(newName===null) return; const newPass = prompt('New password (leave blank to keep):', ''); try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({username:newName || undefined, password:newPass || undefined})}); await load(); await loadAdminUsers();}catch(e){alert('Edit failed: '+e)}});
  const refreshBtn = document.getElementById('admin-refresh');
  if (refreshBtn) refreshBtn.onclick = async ()=>{ await loadAdminUsers(); };
}

document.getElementById('add-artist').onclick = async ()=>{
  const name = document.getElementById('new-artist').value.trim();
  if(!name) return alert('Enter artist name');
  try{
    await fetchJSON('/api/artists_auth', {method:'POST', body: JSON.stringify({name})});
    document.getElementById('new-artist').value = '';
    load();
  }catch(e){alert(e)}
}

document.getElementById('btn-login').onclick = async ()=>{
  const u=document.getElementById('username').value.trim(); const p=document.getElementById('password').value;
  if(!u||!p) return alert('Enter credentials');
  try{ await fetchJSON('/api/login',{method:'POST', body:JSON.stringify({username:u,password:p})}); await checkAuth(); load(); }catch(e){alert('Login failed')}
}

document.getElementById('btn-register').onclick = async ()=>{
  const u=document.getElementById('username').value.trim(); const p=document.getElementById('password').value;
  if(!u||!p) return alert('Enter credentials');
  try{ await fetchJSON('/api/register',{method:'POST', body:JSON.stringify({username:u,password:p})}); alert('Registered'); }catch(e){alert('Register failed: '+e)}
}

document.getElementById('btn-logout').onclick = async ()=>{ await fetchJSON('/api/logout',{method:'POST'}); await checkAuth(); load(); }

load();
