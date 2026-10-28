// The board: lays out the glyphs, and moves the planchette from one to the next.

const ROW1 = 'ABCDEFGHIJKLM'.split('');
const ROW2 = 'NOPQRSTUVWXYZ'.split('');
const DIGITS = '1234567890'.split('');
export const WORDS = ['YES', 'NO', 'GOODBYE'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Board {
  constructor(el, planchette) {
    this.el = el;
    this.inner = el.querySelector('.board-inner');
    this.p = planchette;
    this.glyphs = new Map();
    this.pos = { x: 50, y: 62 }; // percent of board
    this.idleTimer = null;
    this.build();
    this.place(this.pos, 0);
  }

  build() {
    const add = (key, text, x, y, rot, cls) => {
      const s = document.createElement('span');
      s.className = `glyph ${cls}`;
      s.textContent = text;
      s.style.left = `${x}%`;
      s.style.top = `${y}%`;
      s.style.setProperty('--rot', `${rot}deg`);
      this.inner.append(s);
      this.glyphs.set(key, { el: s, x, y });
    };
    // Two arcs of letters, like the 1890s Kennard boards.
    const arc = (letters, cy, ry, spread, cls) => {
      letters.forEach((ch, i) => {
        const t = (i / (letters.length - 1)) * 2 - 1; // -1..1
        const ang = t * spread;
        const x = 50 + Math.sin(ang) * 42;
        const y = cy - Math.cos(ang) * ry;
        add(ch, ch, x, y, (ang * 180) / Math.PI * 0.85, cls);
      });
    };
    arc(ROW1, 64, 30, 1.0, 'letter');
    arc(ROW2, 80, 30, 0.92, 'letter');
    DIGITS.forEach((d, i) => add(d, d, 22 + i * 6.2, 72, 0, 'digit'));
    add('YES', 'YES', 13, 11, -8, 'word');
    add('NO', 'NO', 87, 11, 8, 'word');
    add('GOODBYE', 'GOOD BYE', 50, 89, 0, 'word bye');

    const deco = document.createElement('div');
    deco.className = 'deco';
    deco.innerHTML = `
      <span class="sun">☀</span><span class="moon">☾</span>
      <span class="maker">✦ OUIJA · OFFLINE ✦</span>`;
    this.inner.append(deco);
  }

  // x, y in percent of the board. The lens (not the tip) goes over the glyph.
  place({ x, y }, ms) {
    const r = this.el.getBoundingClientRect();
    const px = (x / 100) * r.width;
    const py = (y / 100) * r.height;
    const pw = this.p.offsetWidth;
    const lensY = pw * 0.44; // lens centre inside the planchette (from svg: 44/100)
    const tilt = (x - 50) * 0.25 + (Math.random() * 6 - 3);
    this.p.style.transitionDuration = `${ms}ms`;
    this.p.style.transform = `translate(${px - pw / 2}px, ${py - lensY}px) rotate(${tilt}deg)`;
    this.pos = { x, y };
  }

  async moveTo(key, { speed = 1 } = {}) {
    const g = this.glyphs.get(key);
    if (!g) return;
    this.stopIdle();
    const jitter = () => Math.random() * 1.6 - 0.8;
    const target = { x: g.x + jitter(), y: g.y + jitter() };
    const dist = Math.hypot(target.x - this.pos.x, target.y - this.pos.y);
    if (dist < 2) {
      // Same letter twice: the planchette circles away and comes back.
      this.place({ x: g.x + 6, y: g.y + 8 }, 260 / speed);
      await sleep(280 / speed);
    }
    const ms = Math.min(1100, 320 + dist * 14) / speed;
    this.place(target, ms);
    await sleep(ms);
    g.el.classList.remove('lit');
    void g.el.offsetWidth; // restart the glow animation
    g.el.classList.add('lit');
  }

  // Slow, uneasy drifting while the spirit gathers itself.
  startIdle() {
    this.stopIdle();
    const drift = () => {
      const x = 35 + Math.random() * 30;
      const y = 40 + Math.random() * 30;
      this.place({ x, y }, 2400);
      this.idleTimer = setTimeout(drift, 2300 + Math.random() * 900);
    };
    drift();
  }

  stopIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  rest() {
    this.place({ x: 50, y: 50 }, 900);
  }

  shudder() {
    this.el.classList.remove('shake');
    void this.el.offsetWidth;
    this.el.classList.add('shake');
  }
}

// ---- Text → board moves -------------------------------------------------

// Turn raw model output into board-legal words.
export function cleanWords(raw) {
  let t = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ');
  t = t.split('\n').map((l) => l.trim()).find((l) => l) || '';
  t = t.replace(/^\s*(A|ANSWER|SPIRIT)\s*:\s*/i, '');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  t = t.replace(/GOOD\s*-?\s*BYE/g, 'GOODBYE').replace(/['\u2019]/g, '');
  t = t.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ') : [];
}

export function wordToMoves(word) {
  if (WORDS.includes(word)) return [{ key: word, word: true }];
  return word.split('').map((ch) => ({ key: ch }));
}
