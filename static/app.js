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
    let inner = `<strong>${a.name}</strong>`;
    if(isAuth) inner += ` <button data-a='${a.id}' class='del-artist'>Delete</button>`;
    inner += ` <input placeholder='New song' data-aid='${a.id}' class='new-song'/> <button class='add-song' data-aid='${a.id}'>Add Song</button>`;
    adiv.innerHTML = inner;
    for (const s of a.songs) {
      const sdiv = document.createElement('div'); sdiv.className='song';
      let sinner = `${s.title}`;
      if(isAuth) sinner += ` <button data-s='${s.id}' class='del-song'>Delete</button>`;
      sinner += ` <input placeholder='New tuning' data-sid='${s.id}' class='new-tuning'/> <input placeholder='Notes' data-sid-notes='${s.id}' class='new-tuning-notes'/> <button class='add-tuning' data-sid='${s.id}'>Add Tuning</button>`;
      sdiv.innerHTML = sinner;
      for (const t of s.tunings) {
        const tdiv = document.createElement('div'); tdiv.className='tuning';
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
  if (isAdmin) {
    await loadAdminUsers();
  } else {
    const adminUsersDiv = document.getElementById('admin-users');
    if (adminUsersDiv) adminUsersDiv.innerHTML = '';
  }
}

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
