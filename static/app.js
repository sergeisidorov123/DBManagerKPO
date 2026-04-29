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
      const loginBtn = document.getElementById('btn-login');
      const registerBtn = document.getElementById('btn-register');
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      if (loginBtn) loginBtn.style.display = isAuth ? 'none' : 'inline-block';
      if (registerBtn) registerBtn.style.display = isAuth ? 'none' : 'inline-block';
      if (usernameInput) usernameInput.style.display = isAuth ? 'none' : 'inline-block';
      if (passwordInput) passwordInput.style.display = isAuth ? 'none' : 'inline-block';
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
    let inner = '';
    // Expand/collapse control when loading on-demand
    if (a.has_songs) {
      inner += `<button class='expand-artist' data-aid='${a.id}'>+</button> `;
    }
    inner += `<strong>${a.name}</strong>`;
    if(isAuth) inner += ` <button data-a='${a.id}' class='del-artist'>Delete</button>`;
    inner += ` <input placeholder='New song' data-aid='${a.id}' class='new-song'/> <button class='add-song' data-aid='${a.id}'>Add Song</button>`;
    adiv.innerHTML = inner;
    // If server returned songs (full load), render them immediately
    if (a.songs && Array.isArray(a.songs)) {
      for (const s of a.songs) {
        const sdiv = document.createElement('div'); sdiv.className='song';
        sdiv.dataset.id = s.id;
        sdiv.draggable = true;
        let sinner = '';
        if (s.has_tunings) {
          sinner += `<button class='expand-song' data-sid='${s.id}'>+</button> `;
        }
        sinner += `${s.title}`;
        if(isAuth) sinner += ` <button data-s='${s.id}' class='del-song'>Delete</button>`;
        sinner += ` <input placeholder='New tuning' data-sid='${s.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${s.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${s.id}'>Add Tuning</button>`;
        sdiv.innerHTML = sinner;
        if (s.tunings && Array.isArray(s.tunings)) {
          for (const t of s.tunings) {
            const tdiv = document.createElement('div'); tdiv.className='tuning';
            tdiv.dataset.id = t.id;
            tdiv.draggable = true;
            let tinner = `${t.name} ${t.notes?'- '+t.notes:''}`;
            if(isAuth) tinner += ` <button data-t='${t.id}' class='del-tuning'>Delete</button>`;
            tdiv.innerHTML = tinner;
            sdiv.appendChild(tdiv);
          }
        }
        adiv.appendChild(sdiv);
      }
    }
    tree.appendChild(adiv);
  }
  attachHandlers();
  attachDragHandlers();
  attachExpandSongHandlers();
  if (isAdmin) {
    await loadAdminUsers();
    await loadAuditLog();
  } else {
    const adminUsersDiv = document.getElementById('admin-users');
    if (adminUsersDiv) adminUsersDiv.innerHTML = '';
  }

  // attach expand handlers for on-demand loading
  document.querySelectorAll('.expand-artist').forEach(b=>b.onclick=async()=>{
    const aid = b.dataset.aid;
    const isExpanded = b.textContent === '-';
    const artistDiv = document.querySelector(`.artist[data-id="${aid}"]`);
    if (!artistDiv) return;
    
    if (isExpanded) {
      // Collapse: hide all songs
      artistDiv.querySelectorAll('.song').forEach(s => s.style.display = 'none');
      b.textContent = '+';
      b.style.backgroundColor = '#ccc';
    } else {
      // Expand: show/load songs
      const songs = artistDiv.querySelectorAll('.song');
      if (songs.length > 0) {
        // Already loaded, just show them
        songs.forEach(s => s.style.display = 'block');
        b.textContent = '-';
        b.style.backgroundColor = '#ff9800';
      } else {
        // Load from server
        try{
          const songsList = await fetchJSON(`/api/artists/${aid}/songs`);
          for (const s of songsList) {
            const sdiv = document.createElement('div'); sdiv.className='song'; sdiv.dataset.id = s.id; sdiv.draggable = true;
            let sinner = '';
            if (s.has_tunings) {
              sinner += `<button class='expand-song' data-sid='${s.id}'>+</button> `;
            }
            sinner += `${s.title}`;
            if(isAuth) sinner += ` <button data-s='${s.id}' class='del-song'>Delete</button>`;
            sinner += ` <input placeholder='New tuning' data-sid='${s.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${s.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${s.id}'>Add Tuning</button>`;
            sdiv.innerHTML = sinner;
            artistDiv.appendChild(sdiv);
          }
          attachHandlers(); attachDragHandlers(); attachExpandSongHandlers();
          b.textContent = '-';
          b.style.backgroundColor = '#ff9800';
        }catch(e){alert('Failed loading songs: '+e)}
      }
    }
  });

  attachExpandSongHandlers();
}

function attachExpandSongHandlers() {
  // attach expand handlers for songs
  document.querySelectorAll('.expand-song').forEach(b=>b.onclick=async()=>{
    const sid = b.dataset.sid;
    const isExpanded = b.textContent === '-';
    const songDiv = document.querySelector(`.song[data-id="${sid}"]`);
    if (!songDiv) return;
    
    if (isExpanded) {
      // Collapse: hide all tunings
      songDiv.querySelectorAll('.tuning').forEach(t => t.style.display = 'none');
      b.textContent = '+';
      b.style.backgroundColor = '#ccc';
    } else {
      // Expand: show/load tunings
      const tunings = songDiv.querySelectorAll('.tuning');
      if (tunings.length > 0) {
        // Already loaded, just show them
        tunings.forEach(t => t.style.display = 'block');
        b.textContent = '-';
        b.style.backgroundColor = '#ff9800';
      } else {
        // Load from server
        try{
          const loadedTunings = await fetchJSON(`/api/songs/${sid}/tunings`);
          for (const t of loadedTunings) {
            const tdiv = document.createElement('div'); tdiv.className='tuning'; tdiv.dataset.id = t.id; tdiv.draggable = true;
            let tinner = `${t.name} ${t.notes?'- '+t.notes:''}`;
            if(isAuth) tinner += ` <button data-t='${t.id}' class='del-tuning'>Delete</button>`;
            tdiv.innerHTML = tinner;
            songDiv.appendChild(tdiv);
          }
          attachHandlers(); attachDragHandlers(); attachExpandSongHandlers();
          b.textContent = '-';
          b.style.backgroundColor = '#ff9800';
        }catch(e){alert('Failed loading tunings: '+e)}
      }
    }
  });
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
  let sinner = '';
  // New songs don't have tunings yet
  if (song.has_tunings) {
    sinner += `<button class='expand-song' data-sid='${song.id}'>+</button> `;
  }
  sinner += `${song.title}`;
  if(isAuth) sinner += ` <button data-s='${song.id}' class='del-song'>Delete</button>`;
  sinner += ` <input placeholder='New tuning' data-sid='${song.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${song.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${song.id}'>Add Tuning</button>`;
  sdiv.innerHTML = sinner;
  artistDiv.appendChild(sdiv);
  
  // Update artist expand button to minus if this is the first song
  const artistExpandBtn = artistDiv.querySelector('.expand-artist');
  if (artistExpandBtn && artistExpandBtn.textContent === '+') {
    artistExpandBtn.textContent = '-';
    artistExpandBtn.style.backgroundColor = '#ff9800';
  }
  
  attachHandlers();
  attachDragHandlers();
  attachExpandSongHandlers();
}

function deleteSongIncremental(songId) {
  const elem = document.querySelector(`.song[data-id="${songId}"]`);
  if (elem) elem.remove();
}

function addTuningIncremental(songId, tuning) {
  const songDiv = document.querySelector(`.song[data-id="${songId}"]`);
  if (!songDiv) return;
  
  // Check if song has expand button, if not - add it
  const existingExpandBtn = songDiv.querySelector('.expand-song');
  if (!existingExpandBtn) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-song';
    expandBtn.dataset.sid = songId;
    expandBtn.textContent = '+';
    songDiv.insertBefore(expandBtn, songDiv.firstChild);
  }
  
  const tdiv = document.createElement('div'); tdiv.className='tuning';
  tdiv.dataset.id = tuning.id;
  tdiv.draggable = true;
  let tinner = `${tuning.name} ${tuning.notes?'- '+tuning.notes:''}`;
  if(isAuth) tinner += ` <button data-t='${tuning.id}' class='del-tuning'>Delete</button>`;
  tdiv.innerHTML = tinner;
  songDiv.appendChild(tdiv);
  attachHandlers();
  attachDragHandlers();
  attachExpandSongHandlers();
}

function deleteTuningIncremental(tuningId) {
  const elem = document.querySelector(`.tuning[data-id="${tuningId}"]`);
  if (elem) elem.remove();
}

// Context menu support
function showContextMenu(x, y, artistId) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';
  menu.innerHTML = '';
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
  document.querySelectorAll('.ctx-edit-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const newName = prompt('New song title:'); if(newName===null) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'PUT', body: JSON.stringify({title:newName})}); hideContextMenu(); load(); }catch(e){ alert('Edit song failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-add-tuning').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; const name = prompt('Tuning name:'); const notes = prompt('Notes (optional):',''); if(!name) return hideContextMenu(); try{ const tuning = await fetchJSON('/api/tunings_auth', {method:'POST', body: JSON.stringify({name, notes, song_id: parseInt(id)})}); hideContextMenu(); addTuningIncremental(id, tuning); }catch(e){ alert('Add tuning failed: '+e); hideContextMenu(); }
  });
  document.querySelectorAll('.ctx-delete-song').forEach(b=>b.onclick=async()=>{
    const id = b.dataset.id; if(!confirm('Delete song?')) return hideContextMenu(); try{ await fetchJSON(`/api/songs/${id}/auth`, {method:'DELETE'}); hideContextMenu(); deleteSongIncremental(id); }catch(e){ alert('Delete song failed: '+e); hideContextMenu(); }
  });
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
  // Setup drag handles for songs (for song reparenting)
  document.querySelectorAll('.song').forEach(song => {
    // Remove old handle if exists
    const oldHandle = song.querySelector('.drag-handle-song');
    if (oldHandle) oldHandle.remove();
    
    // Create handle
    const handle = document.createElement('span');
    handle.textContent = '⠿ ';
    handle.style.cssText = `
        cursor: grab;
        display: inline-block;
        margin-right: 8px;
        font-size: 16px;
        user-select: none;
        padding: 2px 4px;
    `;
    handle.title = 'Drag to move to another artist';
    handle.className = 'drag-handle-song';
    
    // Insert at beginning of song
    song.insertBefore(handle, song.firstChild);
    
    // Make handle draggable
    handle.draggable = true;
    
    handle.ondragstart = (e) => {
      draggedElement = song;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', song.dataset.id);
      song.style.opacity = '0.5';
      e.stopPropagation();
    };
    
    handle.ondragend = (e) => {
      if (song) song.style.opacity = '1';
      e.stopPropagation();
    };
    
    // Prevent drag from song itself
    song.ondragstart = (e) => {
      e.preventDefault();
      return false;
    };
  });

  // Setup drag handles for tunings (for tuning reparenting)
  document.querySelectorAll('.tuning').forEach(tuning => {
    // Remove old handle if exists
    const oldHandle = tuning.querySelector('.drag-handle-tuning');
    if (oldHandle) oldHandle.remove();
    
    // Create handle
    const handle = document.createElement('span');
    handle.textContent = '⠿ ';
    handle.style.cssText = `
        cursor: grab;
        display: inline-block;
        margin-right: 8px;
        font-size: 14px;
        user-select: none;
        padding: 2px 4px;
    `;
    handle.title = 'Drag to move to another song';
    handle.className = 'drag-handle-tuning';
    
    // Insert at beginning
    tuning.insertBefore(handle, tuning.firstChild);
    handle.draggable = true;
    
    handle.ondragstart = (e) => {
      draggedElement = tuning;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tuning.dataset.id);
      tuning.style.opacity = '0.5';
      e.stopPropagation();
    };
    
    handle.ondragend = (e) => {
      if (tuning) tuning.style.opacity = '1';
      e.stopPropagation();
    };
    
    tuning.ondragstart = (e) => {
      e.preventDefault();
      return false;
    };
  });

  // Setup drop zones for artists (songs)
  document.querySelectorAll('.artist').forEach(artist => {
    artist.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      artist.style.backgroundColor = '#e0e0e0';
    };
    
    artist.ondragleave = (e) => {
      if (e.target === artist) {
        artist.style.backgroundColor = '';
      }
    };
    
    artist.ondrop = async (e) => {
      e.preventDefault();
      artist.style.backgroundColor = '';
      
      if (draggedElement && draggedElement.classList.contains('song')) {
        const songEl = draggedElement;
        const songId = parseInt(songEl.dataset.id);
        const newArtistId = parseInt(artist.dataset.id);
        
        // Prevent moving to same artist
        const currentArtist = songEl.closest('.artist');
        if (currentArtist && parseInt(currentArtist.dataset.id) === newArtistId) {
          draggedElement = null;
          return;
        }
        
        try {
          await fetchJSON(`/api/songs/${songId}/reparent`, {
            method: 'PUT',
            body: JSON.stringify({artist_id: newArtistId})
          });
          
          // Move DOM node
          songEl.remove();
          artist.appendChild(songEl);
          
          // Re-attach handlers to maintain functionality
          attachDragHandlers();
        } catch(err) {
          console.error('Move failed:', err);
          alert('Move failed: ' + err);
          if (songEl) songEl.style.opacity = '1';
        }
      }
      draggedElement = null;
    };
  });

  // Setup drop zones for songs (tunings)
  document.querySelectorAll('.song').forEach(song => {
    song.ondragover = (e) => {
      if (draggedElement && draggedElement.classList.contains('tuning')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        song.style.backgroundColor = '#d4e6f1';
      }
    };
    
    song.ondragleave = (e) => {
      if (e.target === song) {
        song.style.backgroundColor = '';
      }
    };
    
    song.ondrop = async (e) => {
      if (!draggedElement || !draggedElement.classList.contains('tuning')) return;
      
      e.preventDefault();
      song.style.backgroundColor = '';
      
      const tuningEl = draggedElement;
      const tuningId = parseInt(tuningEl.dataset.id);
      const newSongId = parseInt(song.dataset.id);
      
      const currentSong = tuningEl.closest('.song');
      if (currentSong && parseInt(currentSong.dataset.id) === newSongId) {
        draggedElement = null;
        return;
      }
      
      try {
          const clone = tuningEl.cloneNode(true);
          clone.querySelectorAll('.delete-btn, [data-action="delete"], button').forEach(btn => btn.remove());
          const cleanText = clone.textContent.replace('⠿ ', '').trim();
          cleanText = cleanText.replace('Delete', '').trim(); 
          
          await fetchJSON(`/api/tunings/${tuningId}/auth`, {
              method: 'PUT',
              body: JSON.stringify({
                  name: cleanText.split(' - ')[0]?.trim() || '', 
                  notes: cleanText.includes(' - ') ? cleanText.split(' - ')[1]?.trim() || '' : '',
                  song_id: newSongId
              })
          });
          
          tuningEl.remove();
          song.appendChild(tuningEl);
          
          attachDragHandlers();
      } catch(err) {
        console.error('Tuning move failed:', err);
        alert('Tuning move failed: ' + err);
        if (tuningEl) tuningEl.style.opacity = '1';
      }
      draggedElement = null;
    };
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
    adminUsersDiv.innerHTML = '<h3>Users</h3>';
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
    await loadAuditLog();
  } catch(e) { console.error('loadAdminUsers', e); const adminUsersDiv = document.getElementById('admin-users'); if(adminUsersDiv) adminUsersDiv.innerHTML = '<h3>Users</h3><p>Error loading users</p>'; }
}

async function loadAuditLog() {
  try {
    const logs = await fetchJSON('/api/admin/audit-log');
    const tbody = document.querySelector('#audit-log-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #999;">No activities recorded yet</td></tr>';
      return;
    }
    for (const log of logs) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom: 1px solid #eee;';
      const time = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
      tr.innerHTML = `<td style="padding: 8px; border: 1px solid #ddd;">${time}</td><td style="padding: 8px; border: 1px solid #ddd;">${log.user_id}</td><td style="padding: 8px; border: 1px solid #ddd;">${log.action}</td><td style="padding: 8px; border: 1px solid #ddd;">${log.target_type}</td><td style="padding: 8px; border: 1px solid #ddd;">${log.target_id}</td>`;
      tbody.appendChild(tr);
    }
  } catch(e) { console.error('loadAuditLog', e); }
}

function attachAdminHandlers(){
  document.querySelectorAll('.promote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON('/api/admin/promote',{method:'POST', body:JSON.stringify({user_id:parseInt(b.dataset.id)})}); await load(); await loadAdminUsers();}catch(e){alert('Promote failed: '+e)}});
  document.querySelectorAll('.demote-user').forEach(b=>b.onclick=async()=>{try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({is_admin:false})}); await load(); await loadAdminUsers();}catch(e){alert('Demote failed: '+e)}});
  document.querySelectorAll('.delete-user').forEach(b=>b.onclick=async()=>{if(!confirm('Delete user?')) return; try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'DELETE'}); await load(); await loadAdminUsers();}catch(e){alert('Delete failed: '+e)}});
  document.querySelectorAll('.edit-user').forEach(b=>b.onclick=async()=>{const newName = prompt('New username:', ''); if(newName===null) return; const newPass = prompt('New password (leave blank to keep):', ''); try{await fetchJSON(`/api/admin/users/${b.dataset.id}`,{method:'PUT', body:JSON.stringify({username:newName || undefined, password:newPass || undefined})}); await load(); await loadAdminUsers();}catch(e){alert('Edit failed: '+e)}});
  const refreshBtn = document.getElementById('admin-refresh');
  if (refreshBtn) refreshBtn.onclick = async ()=>{ await loadAdminUsers(); };
  const refreshLogsBtn = document.getElementById('admin-refresh-logs');
  if (refreshLogsBtn) refreshLogsBtn.onclick = async ()=>{ await loadAuditLog(); };
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
