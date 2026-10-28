import { Engine, VESSELS } from './engine.js';
import { Board, cleanWords, wordToMoves } from './board.js';
import { SPIRITS, UNINVITED, customSpirit, buildMessages } from './spirits.js';
import { Sound } from './sound.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem(`ouija.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ouija.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(`ouija.${k}`); } catch { /* private mode */ } },
};
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

const engine = new Engine();
const sound = new Sound();
let board;

const state = {
  spirit: null,
  history: [],
  active: false,
  busy: false,
  abort: null,
  idleTimer: null,
  lastShake: 0,
};

// ---------------------------------------------------------------- screens

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.dataset.screen = id;
}

// ---------------------------------------------------------------- 1. vessels

async function renderVessels() {
  const cached = await engine.cachedUrls();
  const last = store.get('vessel');
  const ul = $('#vessels');
  ul.replaceChildren();
  for (const v of VESSELS) {
    const has = cached.has(v.url);
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="vessel ${has ? 'cached' : ''} ${last === v.id ? 'last' : ''}">
        <span class="nick">${v.nick}</span>
        <span class="model">${v.model} · ${v.quant} · ${v.sizeMB} MB · ${v.license}</span>
        <span class="note">${v.note}</span>
        <span class="state">${has ? '✓ Kept on this device. Summons offline.' : `Download once · ${v.sizeMB} MB`}</span>
      </button>
      ${has ? '<button type="button" class="forget link-btn">forget</button>' : ''}`;
    li.querySelector('.vessel').onclick = () => loadVessel(v);
    li.querySelector('.forget')?.addEventListener('click', async () => {
      if (!confirm(`Delete ${v.model} from this device?`)) return;
      await engine.forget(v.url);
      renderVessels();
    });
    ul.append(li);
  }
}

function renderDeviceInfo() {
  const bits = [
    engine.webgpu ? 'GPU via WebGPU ✓' : 'no WebGPU, CPU only',
    `${navigator.hardwareConcurrency || '?'} CPU threads`,
    crossOriginIsolated ? 'multi-threaded' : 'single-threaded',
  ];
  $('#device-info').textContent = `Your device: ${bits.join(' · ')}`;
}

let loadAbort = null;

async function loadVessel(source) {
  sound.unlock();
  const box = $('#load-status');
  const fill = box.querySelector('.fill');
  const msg = box.querySelector('.msg');
  box.hidden = false;
  box.classList.remove('error');
  document.body.classList.add('loading');
  fill.style.width = '0%';
  const name = source instanceof File ? source.name : `${source.nick} (${source.model})`;
  msg.textContent = `Preparing ${name}…`;
  loadAbort = new AbortController();
  try {
    await engine.load(source, {
      signal: loadAbort.signal,
      onProgress(loaded, total) {
        const pct = total ? (loaded / total) * 100 : 0;
        fill.style.width = `${pct.toFixed(1)}%`;
        msg.textContent = pct < 100
          ? `Drawing ${name} from the ether… ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`
          : 'Binding the spirit to the vessel…';
      },
    });
    if (!(source instanceof File)) store.set('vessel', source.id);
    navigator.storage?.persist?.().catch(() => {});
    fill.style.width = '100%';
    box.hidden = true;
    goSpirits();
  } catch (err) {
    console.error(err);
    box.classList.add('error');
    msg.textContent = loadAbort.signal.aborted
      ? 'Cancelled.'
      : `The vessel cracked: ${err?.message || err}. Try a smaller vessel, or close other apps to free memory.`;
  } finally {
    document.body.classList.remove('loading');
    loadAbort = null;
    renderVessels();
  }
}

$('#load-cancel').onclick = () => {
  if (loadAbort) loadAbort.abort();
  else $('#load-status').hidden = true;
};

$('#byo-file').onchange = (e) => {
  const f = e.target.files?.[0];
  if (f) loadVessel(f);
  e.target.value = '';
};

// ---------------------------------------------------------------- 2. spirits

function goSpirits() {
  $('#vessel-line').textContent = `Vessel: ${engine.label} · running on your ${engine.backend}`;
  renderSpirits();
  show('screen-spirits');
}

function renderSpirits() {
  const haunted = store.get('unclosed');
  const ul = $('#spirits');
  ul.replaceChildren();
  const list = haunted ? [UNINVITED, ...SPIRITS] : SPIRITS;
  for (const s of list) {
    const blocked = haunted && s !== UNINVITED;
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="spirit ${s === UNINVITED ? 'uninvited' : ''}" ${blocked ? 'disabled' : ''}>
        <span class="sigil">${s.sigil}</span>
        <span class="text">
          <span class="name">${s.name}</span>
          <span class="epithet">${s.epithet}</span>
          <span class="blurb">${blocked ? 'It will not let anyone else through.' : s.blurb}</span>
        </span>
      </button>`;
    li.querySelector('button').onclick = () => {
      askMotionPermission(); // must run inside the tap
      sound.unlock();
      if (s.custom) openRemember();
      else startSeance(s);
    };
    ul.append(li);
  }
}

$('#change-vessel').onclick = () => { renderVessels(); show('screen-vessel'); };

function openRemember() {
  const dlg = $('#remember-dialog');
  const form = $('#remember-form');
  const saved = store.get('remember', {});
  for (const k of ['name', 'relation', 'memories']) form.elements[k].value = saved[k] || '';
  dlg.showModal();
}

$('#remember-cancel').onclick = () => $('#remember-dialog').close();
$('#remember-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const data = { name: f.name.value.trim(), relation: f.relation.value.trim(), memories: f.memories.value.trim() };
  if (!data.name) return;
  store.set('remember', data); // localStorage, on this device only
  $('#remember-dialog').close();
  startSeance(customSpirit(data));
};

// ---------------------------------------------------------------- 3. séance

function setStatus(t) { $('#status').textContent = t; }

function logLine(cls, text) {
  const li = document.createElement('li');
  li.className = `msg-${cls}`;
  li.textContent = text;
  $('#log').append(li);
  li.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return li;
}

function setBusy(b) {
  state.busy = b;
  $('#ask-btn').disabled = b;
  for (const q of document.querySelectorAll('#quick button')) q.disabled = b;
  document.body.classList.toggle('possessed', b);
}

function renderQuick() {
  const box = $('#quick');
  box.replaceChildren();
  if (!state.active) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Leave the board';
    b.onclick = () => goSpirits();
    box.append(b);
    return;
  }
  for (const q of state.spirit.quick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = q;
    b.onclick = () => ask(q);
    box.append(b);
  }
  const bye = document.createElement('button');
  bye.type = 'button';
  bye.className = 'bye';
  bye.textContent = 'Say goodbye';
  bye.onclick = () => ask('Goodbye.');
  box.append(bye);
}

function updateNetChip() {
  const off = !navigator.onLine;
  const chip = $('#chip-net');
  chip.textContent = off ? 'offline · the veil is thin' : 'online · not needed';
  chip.classList.toggle('offline', off);
}
addEventListener('online', updateNetChip);
addEventListener('offline', updateNetChip);

async function startSeance(spirit) {
  state.spirit = spirit;
  state.history = [];
  state.active = true;
  // Every board warns you: always say goodbye. Until you do, the door stays open.
  store.set('unclosed', spirit.id);

  $('#spirit-name').textContent = spirit.name;
  $('#chip-engine').textContent = `${engine.label} · ${engine.backend}`;
  updateNetChip();
  $('#log').replaceChildren();
  $('#spelled').replaceChildren();
  $('#ask-input').disabled = false;
  $('#ask-form').hidden = false;
  document.body.dataset.spirit = spirit.id;
  renderQuick();
  show('screen-seance');
  board.place({ x: 50, y: 55 }, 0);

  sound.startDrone();
  sound.whoosh();
  logLine('event', `You rest your fingers on the planchette and call for ${spirit.name}…`);
  await sleep(900);
  await ask('Is anyone here?', { event: 'You whisper: “Is anyone here?”' });
}

const MAX_WORDS = 7;
const BYE_RE = /\b(good\s*-?\s*bye|bye|farewell|adios|adiós|go away|leave now)\b/i;

async function ask(question, { event = null } = {}) {
  question = question.trim();
  if (!question || state.busy || !state.active) return;
  clearTimeout(state.idleTimer);
  setBusy(true);
  const userSaidBye = !event && BYE_RE.test(question);
  // Tiny models love to say goodbye early. A spirit that just arrived is not allowed to leave yet.
  const mayLeave = userSaidBye || state.history.length >= 3;
  const legal = (words) => (mayLeave ? words : words.filter((w) => w !== 'GOODBYE'));
  logLine(event ? 'event' : 'you', event || question);

  const spelled = $('#spelled');
  spelled.replaceChildren();
  setStatus('The planchette trembles…');
  board.startIdle();

  // Producer: stream tokens from the model and turn them into finished words.
  // Consumer: walk the planchette over each word while the model keeps thinking.
  const queue = [];
  let done = false;
  let wake = null;
  const push = (w) => { queue.push(w); wake?.(); };

  const animator = (async () => {
    let first = true;
    for (;;) {
      if (!queue.length) {
        if (done) break;
        await new Promise((r) => { wake = r; });
        wake = null;
        continue;
      }
      const word = queue.shift();
      if (first) { setStatus(''); first = false; }
      const span = document.createElement('span');
      span.className = 'word';
      spelled.append(span);
      for (const m of wordToMoves(word)) {
        await board.moveTo(m.key);
        sound.tock();
        buzz(m.word ? [30, 40, 30] : 12);
        span.textContent += m.word ? word : m.key;
        await sleep(m.word ? 600 : 140);
      }
      await sleep(320);
    }
  })();

  const messages = buildMessages(state.spirit, state.history, question);
  state.abort = new AbortController();
  let raw = '';
  let emitted = 0;
  try {
    for await (const delta of engine.speak(messages, { signal: state.abort.signal })) {
      raw += delta;
      const words = legal(cleanWords(raw)).slice(0, MAX_WORDS);
      // The last word may still be growing; only hand over the ones that are finished.
      while (emitted < words.length - 1) push(words[emitted++]);
    }
  } catch (err) {
    if (!state.abort.signal.aborted) {
      console.error(err);
      setStatus('The connection to the other side faltered.');
    }
  }
  const words = legal(cleanWords(raw)).slice(0, MAX_WORDS);
  while (emitted < words.length) push(words[emitted++]);
  done = true;
  wake?.();
  await animator;
  board.stopIdle();

  let answer = words.join(' ');
  if (!answer) {
    setStatus('The planchette does not move.');
    answer = '...';
  }
  state.history.push({ q: question, a: answer });
  logLine('spirit', answer);

  const spiritLeft = words.includes('GOODBYE');
  if (userSaidBye && !spiritLeft) {
    // A proper goodbye always ends on GOOD BYE, whether the spirit likes it or not.
    setStatus('The planchette slides, slowly, to GOOD BYE.');
    await sleep(500);
    await board.moveTo('GOODBYE', { speed: 0.5 });
    sound.tock();
  }
  setBusy(false);
  if (spiritLeft || userSaidBye) return endSeance();

  armIdle();
  board.rest();
}

function endSeance() {
  state.active = false;
  store.del('unclosed');
  clearTimeout(state.idleTimer);
  sound.whoosh(true);
  sound.stopDrone();
  logLine('event', `${state.spirit.name} has gone. The board is closed.`);
  setStatus('The board is closed. You are safe.');
  $('#ask-input').disabled = true;
  $('#ask-form').hidden = true;
  renderQuick();
}

// Left alone too long, the planchette starts moving by itself. Once per silence.
function armIdle() {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    if (!state.active || state.busy || $('#ask-input').value || document.hidden) return;
    ask('Are you still there?', {
      event: 'The planchette begins to move on its own…',
    });
  }, 45000);
}

$('#ask-input').addEventListener('input', () => clearTimeout(state.idleTimer));

$('#ask-form').onsubmit = (e) => {
  e.preventDefault();
  sound.unlock();
  const input = $('#ask-input');
  const q = input.value;
  if (state.busy || !q.trim()) return;
  input.value = '';
  ask(q);
};

$('#leave').onclick = () => {
  if (state.active) {
    if (!confirm('You have not said goodbye. Leaving now leaves the board open.\n\nLeave anyway?')) return;
    state.abort?.abort();
    state.active = false;
    clearTimeout(state.idleTimer);
    sound.stopDrone();
    board.stopIdle();
    setBusy(false);
  }
  goSpirits();
};

$('#sound-toggle').onclick = (e) => {
  sound.unlock();
  e.currentTarget.textContent = sound.toggle() ? '🔊' : '🔇';
};

// ---------------------------------------------------------------- shaking the board

let motionAsked = false;
function askMotionPermission() {
  if (motionAsked) return;
  motionAsked = true;
  const DME = window.DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') {
    DME.requestPermission().then((r) => r === 'granted' && listenMotion()).catch(() => {});
  } else {
    listenMotion();
  }
}

function listenMotion() {
  addEventListener('devicemotion', (e) => {
    const a = e.acceleration?.x != null ? e.acceleration : e.accelerationIncludingGravity;
    if (!a) return;
    const g = e.acceleration?.x != null ? 0 : 9.8;
    const mag = Math.abs(Math.hypot(a.x || 0, a.y || 0, a.z || 0) - g);
    if (mag < 18 || !state.active) return;
    const now = Date.now();
    if (now - state.lastShake < 6000) return;
    state.lastShake = now;
    board.shudder();
    buzz([80, 50, 120]);
    if (!state.busy) {
      ask('I just shook the board hard. Are you angry?', { event: 'You shake the board. Something stirs.' });
    }
  });
}

// ---------------------------------------------------------------- boot

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('No service worker', err);
    return;
  }
  // The worker adds cross-origin isolation headers, which unlock multi-threaded inference.
  // That only applies after one reload, so do it once, and only before anything has started.
  const reloadOnce = () => {
    if (crossOriginIsolated || sessionStorage.getItem('coi-reloaded')) return;
    if (document.body.dataset.screen !== 'screen-vessel' || document.body.classList.contains('loading')) return;
    sessionStorage.setItem('coi-reloaded', '1');
    location.reload();
  };
  if (navigator.serviceWorker.controller) reloadOnce();
  else navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
}

async function boot() {
  board = new Board($('#board'), $('#planchette'));
  addEventListener('resize', () => board.place(board.pos, 0));
  show('screen-vessel');
  renderDeviceInfo();
  await renderVessels();
  registerServiceWorker();
}

boot();
