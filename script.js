const DB_NAME = 'kikyo-character-archive';
const DB_VERSION = 1;
const STORE = 'images';
const $ = (id) => document.getElementById(id);
let records = [];
let currentImages = [];
let soundEnabled = false;
let audioContext = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function imagePut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function imageGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function imageDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const loadRecords = () => {
  try { records = JSON.parse(localStorage.getItem('kikyoCharacters') || '[]'); }
  catch { records = []; }
};
const saveRecords = () => localStorage.setItem('kikyoCharacters', JSON.stringify(records));
const makeId = () => 'KCA-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2300);
}
function beep() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .07);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + .075);
  } catch {}
}
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(name + 'View').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('crumb').textContent = name.toUpperCase();
  beep();
  if (name === 'dashboard') renderDashboard();
  if (name === 'characters') renderCharacters();
}
function go(name) { showView(name); window.scrollTo({top:0, behavior:'smooth'}); }
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.go === 'register') resetForm();
  go(b.dataset.go);
}));
$('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled; $('soundToggle').textContent = soundEnabled ? '♫ ON' : '♫ OFF';
  toast(soundEnabled ? '効果音をONにしました' : '効果音をOFFにしました'); beep();
});
function getMainImage(record) { return record.images?.[0]; }
async function imageDataUrl(id) {
  const item = await imageGet(id);
  if (!item) return '';
  return await new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(item.blob);
  });
}
function renderDashboard() {
  $('totalCount').textContent = records.length;
  $('imageCount').textContent = records.reduce((n,r) => n + (r.images?.length || 0), 0);
  $('customCount').textContent = records.reduce((n,r) => n + (r.custom?.length || 0), 0);
  const recent = [...records].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  const host = $('recentList');
  if (!recent.length) { host.className = 'record-list empty-state'; host.textContent = 'まだキャラクターが登録されていません。'; return; }
  host.className = 'record-list'; host.innerHTML = '';
  recent.forEach(r => {
    const row = document.createElement('div'); row.className = 'record-row';
    row.innerHTML = `<div class="record-avatar">${esc((r.name||'?').slice(0,1))}</div><div><strong>${esc(r.name)}</strong><small>${esc(r.id)} ・ ${esc(r.gender || '性別未設定')}</small></div><span class="record-date">${new Date(r.updatedAt).toLocaleDateString('ja-JP')}</span>`;
    row.addEventListener('click', () => openDetail(r.id)); host.appendChild(row);
  });
}
function searchableText(r, field) {
  const basic = ['gender','age','height','weight','affiliation','species','summary','background','notes','equipment'];
  let values = [];
  if (field === 'all' || field === 'name') values.push(r.name);
  if (field === 'all' || field === 'basic') values.push(...basic.map(k => r[k]));
  if (field === 'all' || field === 'personality') values.push(r.personality);
  if (field === 'all' || field === 'ability') values.push(r.abilityName, r.ability);
  if (field === 'all' || field === 'custom') values.push(...(r.custom || []).flatMap(c => [c.label,c.value]));
  return values.join(' ').toLocaleLowerCase();
}
async function renderCharacters() {
  const q = $('searchInput').value.trim().toLocaleLowerCase(), field = $('searchField').value;
  const filtered = records.filter(r => !q || searchableText(r, field).includes(q));
  $('resultCount').textContent = `${filtered.length}件`;
  const host = $('characterGrid'); host.innerHTML = '';
  if (!filtered.length) { host.className = 'character-grid empty-state'; host.textContent = records.length ? '条件に一致するカルテがありません。' : '登録データがありません。'; return; }
  host.className = 'character-grid';
  for (const r of filtered) {
    const card = document.createElement('article'); card.className = 'character-card';
    const first = getMainImage(r), src = first ? await imageDataUrl(first.id) : '';
    card.innerHTML = `<div class="card-image">${src ? `<img src="${src}" alt="">` : esc((r.name||'?').slice(0,1))}</div><div class="card-body"><h3>${esc(r.name)}</h3><div class="card-meta"><span>${esc(r.gender || '性別未設定')}</span><span>${esc(r.age || '年齢未設定')}</span><span>${esc(r.height || '身長未設定')}</span></div><p class="card-summary">${esc(r.summary || r.personality || '概要は未登録です。')}</p></div>`;
    card.addEventListener('click', () => openDetail(r.id)); host.appendChild(card);
  }
}
$('searchInput').addEventListener('input', renderCharacters);
$('searchField').addEventListener('change', renderCharacters);
$('clearSearch').addEventListener('click', () => { $('searchInput').value=''; $('searchField').value='all'; renderCharacters(); });
function resetForm() {
  $('characterForm').reset(); $('editingId').value=''; $('formTitle').textContent='新規カルテ作成';
  $('customFields').innerHTML=''; $('existingImages').innerHTML=''; currentImages=[];
}
function addCustomRow(label='', value='') {
  const row = document.createElement('div'); row.className = 'custom-field-row';
  row.innerHTML = `<input class="custom-label" placeholder="項目名（例：ランク）" value="${esc(label)}"><input class="custom-value" placeholder="内容" value="${esc(value)}"><button type="button" class="remove-custom">削除</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('customFields').appendChild(row);
}
$('addCustomField').addEventListener('click', () => { addCustomRow(); beep(); });
async function previewImages() {
  const host = $('existingImages'); host.innerHTML = '';
  for (const img of currentImages) {
    const src = img.newFile ? URL.createObjectURL(img.newFile) : await imageDataUrl(img.id);
    const item = document.createElement('div'); item.className = 'preview-item';
    item.innerHTML = `<img src="${src}" alt=""><button type="button" aria-label="画像を外す">×</button>`;
    item.querySelector('button').addEventListener('click', async () => {
      if (!img.newFile) await imageDelete(img.id);
      currentImages = currentImages.filter(x => x !== img); previewImages();
    });
    host.appendChild(item);
  }
}
$('images').addEventListener('change', e => {
  [...e.target.files].forEach(file => { if (file.type.startsWith('image/')) currentImages.push({newFile:file}); });
  previewImages(); e.target.value='';
});
async function saveImageFiles() {
  const result = [];
  for (const item of currentImages) {
    if (item.newFile) {
      const id = 'IMG-' + crypto.randomUUID();
      await imagePut({id, blob:item.newFile, name:item.newFile.name, type:item.newFile.type});
      result.push({id, name:item.newFile.name, caption:''});
    } else result.push(item);
  }
  return result;
}
$('characterForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('editingId').value || makeId();
  const old = records.find(r => r.id === id);
  const custom = [...document.querySelectorAll('.custom-field-row')].map(row => ({label:row.querySelector('.custom-label').value.trim(), value:row.querySelector('.custom-value').value.trim()})).filter(c => c.label || c.value);
  const record = {
    id, name:$('name').value.trim(), gender:$('gender').value.trim(), age:$('age').value.trim(),
    height:$('height').value.trim(), weight:$('weight').value.trim(), affiliation:$('affiliation').value.trim(),
    species:$('species').value.trim(), summary:$('summary').value.trim(), personality:$('personality').value.trim(),
    background:$('background').value.trim(), notes:$('notes').value.trim(), abilityName:$('abilityName').value.trim(),
    ability:$('ability').value.trim(), equipment:$('equipment').value.trim(), custom,
    images:await saveImageFiles(), createdAt:old?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  const index = records.findIndex(r => r.id === id);
  if (index >= 0) records[index] = record; else records.push(record);
  saveRecords(); toast('カルテを保存しました'); go('characters');
});
async function openDetail(id) {
  const r = records.find(x => x.id === id); if (!r) return;
  $('detailId').textContent = `${r.id} ・ 最終更新 ${new Date(r.updatedAt).toLocaleString('ja-JP')}`;
  let firstSrc = r.images?.[0] ? await imageDataUrl(r.images[0].id) : '';
  $('detailContent').innerHTML = `
    <div class="detail-hero"><div class="detail-portrait">${firstSrc ? `<img src="${firstSrc}" alt="">` : esc(r.name.slice(0,1))}</div><div><div class="eyebrow">CHARACTER PROFILE</div><h2 class="detail-name">${esc(r.name)}</h2><div class="detail-tags">${[r.gender,r.age,r.affiliation].filter(Boolean).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><p class="detail-summary">${esc(r.summary || '概要は未登録です。')}</p></div></div>
    ${detailSection('基本情報',[['性別',r.gender],['年齢',r.age],['身長',r.height],['体重',r.weight],['所属・組織',r.affiliation],['種族',r.species]])}
    ${detailSection('人物設定',[['性格',r.personality],['過去・経歴',r.background],['備考',r.notes]])}
    ${detailSection('能力・装備',[['能力名',r.abilityName],['能力詳細',r.ability],['武器・装備',r.equipment]])}
    ${r.custom?.length ? detailSection('カスタム項目',r.custom.map(c=>[c.label,c.value])) : ''}
    <section class="detail-section"><h3>画像資料 <span class="muted">/ ${(r.images||[]).length} FILES</span></h3><div class="detail-images" id="detailImages"></div></section>`;
  const imageHost = $('detailImages');
  for (const img of (r.images || [])) {
    const src = await imageDataUrl(img.id); if (!src) continue;
    const item = document.createElement('div'); item.className='detail-image';
    item.innerHTML = `<img src="${src}" alt="${esc(img.name||'character image')}"><small>${esc(img.caption || img.name || '画像資料')}</small>`;
    item.querySelector('img').addEventListener('click', () => window.open(src, '_blank')); imageHost.appendChild(item);
  }
  $('editCharacter').onclick = () => editRecord(id);
  $('deleteCharacter').onclick = async () => {
    if (!confirm(`「${r.name}」のカルテを削除しますか？この操作は元に戻せません。`)) return;
    for (const img of r.images || []) await imageDelete(img.id);
    records = records.filter(x => x.id !== id); saveRecords(); toast('カルテを削除しました'); go('characters');
  };
  go('detail');
}
function detailSection(title, pairs) {
  const rows = pairs.filter(p => p[1]).map(p => `<div class="data-item"><dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd></div>`).join('');
  return rows ? `<section class="detail-section"><h3>${title}</h3><dl class="detail-data">${rows}</dl></section>` : '';
}
async function editRecord(id) {
  const r = records.find(x => x.id === id); if (!r) return;
  resetForm(); $('editingId').value=id; $('formTitle').textContent='カルテ編集';
  const map = {name:'name',gender:'gender',age:'age',height:'height',weight:'weight',affiliation:'affiliation',species:'species',summary:'summary',personality:'personality',background:'background',notes:'notes',abilityName:'abilityName',ability:'ability',equipment:'equipment'};
  Object.entries(map).forEach(([key,el]) => $(el).value = r[key] || '');
  (r.custom||[]).forEach(c => addCustomRow(c.label,c.value));
  currentImages = [...(r.images||[])]; await previewImages(); go('register');
}
$('backupButton').addEventListener('click', async () => {
  try {
    const payload = {format:'KIKYO_CHARACTER_ARCHIVE_BACKUP',version:1,exportedAt:new Date().toISOString(),records:[]};
    for (const r of records) {
      const copy = structuredClone(r);
      for (const img of copy.images || []) {
        const item = await imageGet(img.id);
        if (item) img.data = await new Promise(resolve => { const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.readAsDataURL(item.blob); });
      }
      payload.records.push(copy);
    }
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=`kikyo-character-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url); toast('バックアップを書き出しました');
  } catch(err) { console.error(err); toast('バックアップに失敗しました'); }
});
$('backupButton').addEventListener('contextmenu', e => { e.preventDefault(); $('restoreInput').click(); });
$('restoreInput').addEventListener('change', async e => {
  const file=e.target.files[0]; if(!file) return;
  try {
    const data=JSON.parse(await file.text());
    if(data.format!=='KIKYO_CHARACTER_ARCHIVE_BACKUP'||!Array.isArray(data.records)) throw new Error('Invalid backup');
    if(!confirm(`${data.records.length}件のカルテを取り込みます。既存データと同じIDは上書きされます。続けますか？`)) return;
    for(const incoming of data.records) {
      for(const img of incoming.images||[]) if(img.data) {
        const blob=await (await fetch(img.data)).blob(); await imagePut({id:img.id,blob,name:img.name||'image',type:blob.type}); delete img.data;
      }
      const idx=records.findIndex(r=>r.id===incoming.id);
      if(idx>=0) records[idx]=incoming; else records.push(incoming);
    }
    saveRecords(); renderDashboard(); toast('バックアップを復元しました');
  } catch(err) { console.error(err); alert('バックアップファイルを読み込めませんでした。正しいKIKYOバックアップか確認してください。'); }
  e.target.value='';
});
// Backup restore is also available by long-pressing the backup button on touch devices.
let pressTimer;
$('backupButton').addEventListener('touchstart',()=>{pressTimer=setTimeout(()=>$('restoreInput').click(),750)},{passive:true});
$('backupButton').addEventListener('touchend',()=>clearTimeout(pressTimer));
loadRecords();
renderDashboard();
