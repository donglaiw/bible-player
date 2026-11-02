const $ = id => document.getElementById(id);
const audio = $('audio');
const storageKey = 'daily-psalms-v1';
const defaults = () => ({mode:'monthly', part:'daily', positions:{}, start:Plan.dateKey(), day:0, index:0, seconds:0, repeat:'off', speed:1});
let state = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && ['progress','calendar','monthly'].includes(saved.mode) && /^\d{4}-\d{2}-\d{2}$/.test(saved.start)
      && Number.isFinite(Date.parse(saved.start)) && Number.isInteger(saved.day) && saved.day >= 0
      && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < 10
      && Number.isFinite(saved.seconds) && saved.seconds >= 0) state = {...state, ...saved};
} catch (_) { /* A fresh plan also works when browser storage is unavailable. */ }
if (!['off','chapter','reading'].includes(state.repeat)) state.repeat = 'off';
if (![0.75,1,1.25,1.5].includes(state.speed)) state.speed = 1;
if (!['daily','annual'].includes(state.part)) state.part = 'daily';
if (!state.positions || typeof state.positions !== 'object') state.positions = {};
let books = {Psalms:{}, Proverbs:{}};
let queue = [];
let loaded = false;
let lastSave = 0;
let resumeAt = 0;
let completionMessage = '';
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch (_) { $('message').textContent = 'Browser storage is unavailable. Your position cannot be saved.'; }
}
let activeDate = Plan.dateKey();
function syncCalendar() {
  if (state.mode !== 'progress') {
    const day = Plan.calendarDay(state.start);
    if (day !== state.day || activeDate !== Plan.dateKey()) {
      audio.pause(); state.day = day; state.index = 0; state.seconds = 0; loaded = false; save();
    }
    activeDate = Plan.dateKey();
  }
}
function render() {
  queue = state.part === 'annual' ? Plan.annual(state.day) : state.mode === 'monthly' ? Plan.monthly() : Plan.reading(state.day);
  if (state.index >= queue.length) { state.index=0; state.seconds=0; loaded=false; }
  $('dayLabel').textContent = state.part === 'annual' ? `BIBLE IN A YEAR · DAY ${state.day%365+1}` : state.mode === 'monthly' ? `MONTHLY READING · ${Plan.dateKey()}` : `READING ${state.day+1}`;
  const grouped = [];
  for (const item of queue) {
    const last = grouped[grouped.length-1];
    if (last && last.book===item.book) last.end=item.chapter;
    else grouped.push({book:item.book,start:item.chapter,end:item.chapter});
  }
  $('readingTitle').textContent = grouped.map(g => `${g.book} ${g.start}${g.end!==g.start ? '–'+g.end : ''}`).join(' · ');
  $('planNote').textContent = state.part==='annual' ? 'Genesis to Revelation in 365 readings. This part includes Psalms and Proverbs again.' : state.mode==='monthly' ? 'Every Psalm and Proverb each month. Daily portions adjust to the month’s length.' : state.mode === 'progress' ? 'Your place is kept. Missing a day won’t skip a reading.' : 'Selected automatically from your plan start date.';
  $('dailyPart').setAttribute('aria-pressed', String(state.part==='daily'));
  $('annualPart').setAttribute('aria-pressed', String(state.part==='annual'));
  $('queue').replaceChildren(...queue.map((item, index) => {
    const li = document.createElement('li');
    li.className = index === state.index ? 'current' : '';
    const button = document.createElement('button');
    const name = document.createElement('span'); name.textContent = `${item.book} ${item.chapter}`;
    const status = document.createElement('small');
    status.textContent = books[item.book]?.[item.chapter] ? (index === state.index ? 'Selected' : 'Ready') : 'Add MP3';
    button.append(name, status);
    button.disabled = !books[item.book]?.[item.chapter];
    button.onclick = () => { choose(index); play(); };
    li.append(button); return li;
  }));
  const missing = queue.filter(item => !books[item.book]?.[item.chapter]);
  $('play').disabled = missing.length > 0;
  $('previous').disabled = state.index === 0;
  $('next').disabled = state.index === queue.length-1;
  const current = queue[state.index];
  $('now').textContent = `${current.book} ${current.chapter}`;
  $('message').textContent = missing.length ? `${missing.length} chapter MP3${missing.length === 1 ? '' : 's'} needed for this reading. Add them on the Mac, then refresh the library.` : completionMessage;
  $('mode').value = state.mode; $('start').value = state.start;
  $('repeat').value = state.repeat; $('speed').value = String(state.speed);
  audio.playbackRate = state.speed;
  audio.loop = state.repeat === 'chapter';
}
function load() {
  const item = queue[state.index];
  const source = books[item.book]?.[item.chapter];
  if (!source) { $('message').textContent = 'This chapter’s MP3 is missing. Add it and refresh the library.'; return false; }
  resumeAt = state.seconds;
  audio.src = source;
  audio.load();
  loaded = true;
  if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
    navigator.mediaSession.metadata = new MediaMetadata({title:`${item.book} ${item.chapter}`, artist:'Daily Psalms', album:`Reading ${state.day+1}`});
  }
  return true;
}
function choose(index) {
  audio.pause(); state.index = index; state.seconds = 0; completionMessage = ''; loaded = false; save(); render(); load();
}
async function play() {
  syncCalendar(); render();
  if (!loaded && !load()) return;
  try { await audio.play(); }
  catch (_) { $('message').textContent = 'Tap the audio Play button to continue. If playback fails, check your connection to the Mac.'; }
}
$('play').onclick = () => audio.paused ? play() : audio.pause();
$('previous').onclick = () => { if (state.index > 0) { choose(state.index-1); play(); } };
$('next').onclick = () => { if (state.index < queue.length-1) { choose(state.index+1); play(); } };
audio.addEventListener('loadedmetadata', () => {
  if (resumeAt && Number.isFinite(audio.duration)) audio.currentTime = Math.min(resumeAt, Math.max(0,audio.duration-0.25));
  resumeAt = 0;
  audio.playbackRate = state.speed;
});
audio.addEventListener('timeupdate', () => {
  if (!loaded) return;
  state.seconds = audio.currentTime || 0;
  if (Date.now()-lastSave > 2000) { save(); lastSave = Date.now(); }
});
audio.addEventListener('play', () => { $('play').textContent = 'Pause reading'; });
audio.addEventListener('pause', () => { $('play').textContent = 'Resume reading'; save(); });
audio.addEventListener('error', () => { $('message').textContent = 'Couldn’t load this audio. Check the MP3 and your connection, then tap Play to retry.'; loaded = false; });
audio.addEventListener('ended', () => {
  if (state.repeat === 'chapter') { audio.currentTime = 0; play(); return; }
  if (state.index < queue.length-1) { choose(state.index+1); play(); return; }
  if (state.repeat === 'reading') { choose(0); play(); return; }
  // Stop at the end of this part. Prepare the next reading without starting it.
  state.index = 0; state.seconds = 0;
  if (state.mode === 'progress') state.day += 1;
  loaded = false;
  audio.removeAttribute('src'); audio.load();
  completionMessage = state.mode === 'progress' ? 'This part is complete. Your next reading is ready whenever you are.' : 'This part of today’s reading is complete. Switch parts, or tap Play to listen again.';
  save(); render(); $('play').textContent = 'Play my reading';
  if (state.part === 'daily') {
    switchPart('annual');
    if (!$('play').disabled) play();
    else $('message').textContent = 'Psalms & Proverbs complete. Add the annual reading’s audio to continue with part two.';
  }
});
$('repeat').onchange = () => { state.repeat = $('repeat').value; audio.loop = state.repeat === 'chapter'; save(); };
$('speed').onchange = () => { state.speed = Number($('speed').value); audio.playbackRate = state.speed; save(); };
$('apply').onclick = () => {
  const start = $('start').value;
  if (!start || start > Plan.dateKey()) { $('message').textContent = 'Choose a start date of today or earlier.'; return; }
  if (!confirm('Start this plan from the beginning? This replaces your saved position.')) return;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  state = {...defaults(), mode:$('mode').value, start, repeat:state.repeat, speed:state.speed};
  loaded = false; completionMessage = ''; syncCalendar(); save(); render();
};
async function refresh() {
  try {
    const response = await fetch('/api/library', {cache:'no-store'});
    if (!response.ok) throw new Error('Library unavailable');
    const result = await response.json(); books = result.books;
    const count = book => Object.values(books[book] || {}).filter(Boolean).length;
    const total = Object.keys(books).reduce((sum,book) => sum+count(book),0);
    $('libraryStatus').textContent = `${count('Psalms')}/150 Psalms · ${count('Proverbs')}/31 Proverbs · ${total}/1189 total chapters loaded. ${result.warnings.join(' · ')}`;
    render();
  } catch (_) { $('message').textContent = 'Can’t reach your library. Check that the Mac and player are running, then refresh.'; }
}
$('refresh').onclick = refresh;
function switchPart(part) {
  if (part===state.part) return;
  audio.pause();
  state.positions[state.part] = {day:state.day,index:state.index,seconds:state.seconds};
  const position = state.positions[part];
  const valid = position && Number.isInteger(position.day) && position.day>=0 && Number.isInteger(position.index) && position.index>=0 && position.index<10 && Number.isFinite(position.seconds) && position.seconds>=0;
  Object.assign(state, valid ? position : {day:0,index:0,seconds:0});
  state.part=part; loaded=false; completionMessage='';
  audio.removeAttribute('src'); audio.load(); syncCalendar(); save(); render();
  $('play').textContent='Play my reading';
}
$('dailyPart').onclick = () => switchPart('daily');
$('annualPart').onclick = () => switchPart('annual');
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else if (audio.paused) { syncCalendar(); render(); } });
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({play, pause:() => audio.pause(), previoustrack:() => $('previous').click(), nexttrack:() => $('next').click(), seekbackward:() => {audio.currentTime=Math.max(0,audio.currentTime-15);}, seekforward:() => {if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+15);}})) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  }
}
syncCalendar(); render(); refresh();
