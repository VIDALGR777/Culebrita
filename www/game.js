'use strict';

/*
  Culebra — el clásico Snake.
  Sin dependencias ni compilación: sube index.html, style.css y game.js
  a la misma carpeta de cualquier hosting estático y listo.
*/

/* ───────────── Motor del juego (sin DOM) ───────────── */

const DIRS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});

class SnakeEngine {
  constructor({ cols = 20, rows = 20, wrap = false, rng = Math.random } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.wrap = wrap;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.grid = new Uint8Array(this.cols * this.rows);
    // La cabeza va primero; `n` numera los segmentos para repartir los colores.
    this.snake = [0, 1, 2].map((i) => ({ x: cx - i, y: cy, n: 2 - i }));
    for (const s of this.snake) this.grid[s.y * this.cols + s.x] = 1;
    this.seq = 3;
    this.dir = DIRS.right;
    this.queue = [];
    this.score = 0;
    this.eaten = 0;
    this.over = null; // null | 'wall' | 'self' | 'won'
    this.food = null;
    this.placeFood();
  }

  placeFood() {
    const free = [];
    for (let i = 0; i < this.grid.length; i++) if (!this.grid[i]) free.push(i);
    if (!free.length) {
      this.food = null;
      return false;
    }
    const pick = free[Math.floor(this.rng() * free.length)];
    this.food = { x: pick % this.cols, y: Math.floor(pick / this.cols) };
    return true;
  }

  /** Milisegundos entre pasos: arranca tranquilo y se acelera al comer. */
  tickMs() {
    return Math.max(80, Math.round(160 - this.eaten * 3));
  }

  /** Encola un giro. Ignora repetidos y reversas para no morderse al instante. */
  turn(dir) {
    if (this.over || this.queue.length >= 2) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (dir.x === last.x && dir.y === last.y) return false;
    if (dir.x === -last.x && dir.y === -last.y) return false;
    this.queue.push(dir);
    return true;
  }

  /** Avanza un paso y dice qué pasó: move | eat | won | over | none. */
  step() {
    if (this.over) return { type: 'none' };
    if (this.queue.length) this.dir = this.queue.shift();

    const head = this.snake[0];
    let nx = head.x + this.dir.x;
    let ny = head.y + this.dir.y;

    if (this.wrap) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      this.over = 'wall';
      return { type: 'over', cause: 'wall' };
    }

    const eating = this.food !== null && nx === this.food.x && ny === this.food.y;
    const tail = this.snake[this.snake.length - 1];
    const idx = ny * this.cols + nx;
    // La cola se mueve en este mismo paso, así que su casilla queda libre (salvo que coma).
    const tailLeaves = !eating && tail.x === nx && tail.y === ny;
    if (this.grid[idx] === 1 && !tailLeaves) {
      this.over = 'self';
      return { type: 'over', cause: 'self' };
    }

    if (!eating) {
      this.snake.pop();
      this.grid[tail.y * this.cols + tail.x] = 0;
    }
    this.snake.unshift({ x: nx, y: ny, n: this.seq++ });
    this.grid[idx] = 1;

    if (!eating) return { type: 'move' };

    this.eaten += 1;
    this.score += 10;
    if (!this.placeFood()) {
      this.over = 'won';
      return { type: 'won', x: nx, y: ny };
    }
    return { type: 'eat', x: nx, y: ny };
  }
}

/* ───────────── Interfaz ───────────── */

function startUI() {
  const COLS = 20;
  const ROWS = 20;
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');
  const ovTitle = $('ov-title');
  const ovText = $('ov-text');
  const ovBtn = $('ov-btn');
  const optWrap = $('opt-wrap');
  const scoreEl = $('score');
  const bestEl = $('best');
  const btnSound = $('btn-sound');
  const btnPause = $('btn-pause');

  const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const PALETTE = {
    boardA: '#1c1760',
    boardB: '#221c6e',
    body: ['#1fe0c8', '#9b7bff', '#4cc9f0'],
    head: '#ff2e93',
    tongue: '#ff5d73',
    outline: 'rgba(8, 5, 36, 0.55)',
    petalOuter: '#ff7a00',
    petalInner: '#ffb000',
    petalCore: '#c24a00',
  };

  /* ── Almacenamiento (puede no estar disponible en modo privado) ── */
  const store = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem('culebra:' + key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem('culebra:' + key, String(value));
      } catch (e) {
        /* sin almacenamiento: el juego sigue igual */
      }
    },
  };

  /* ── Ajustes y estado ── */
  const keyOf = (w) => (w ? 'wrap' : 'wall');
  let wrap = store.get('wrap', '0') === '1';
  const best = {
    wall: parseInt(store.get('best-wall', '0'), 10) || 0,
    wrap: parseInt(store.get('best-wrap', '0'), 10) || 0,
  };

  let engine = new SnakeEngine({ cols: COLS, rows: ROWS, wrap });
  let state = 'ready'; // ready | playing | paused | dying | over
  let acc = 0;
  let cell = 0;
  let bg = null;
  let foodSince = performance.now();
  let dyingSince = 0;
  let lockUntil = 0;
  let lastResult = null;
  const floaters = [];

  /* ── Sonido y vibración ── */
  const sound = {
    ctx: null,
    on: store.get('sound', '1') === '1',
    unlock() {
      if (!this.on) return;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state !== 'running') {
          const p = this.ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (e) {
        /* sin audio */
      }
    },
    tone(freq, dur, { type = 'square', vol = 0.06, delay = 0, to = null } = {}) {
      // Con el audio aún bloqueado no se programa nada: los tonos saldrían todos juntos al desbloquearlo.
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      try {
        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      } catch (e) {
        /* sin audio */
      }
    },
    eat() {
      this.tone(660, 0.09, { type: 'triangle', vol: 0.1 });
      this.tone(990, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 });
    },
    over() {
      this.tone(320, 0.5, { type: 'sawtooth', vol: 0.07, to: 70 });
    },
  };

  const vibrate = (pattern) => {
    if (!sound.on || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* sin vibración */
    }
  };

  /* ── Marcador y pantallas ── */
  function updateHud(bump) {
    // El récord sube en vivo mientras juegas; al cambiar de modo en la pantalla de fin no se mezclan.
    const live = engine.wrap === wrap ? engine.score : 0;
    scoreEl.textContent = String(engine.score);
    bestEl.textContent = String(Math.max(best[keyOf(wrap)], live));
    if (bump) {
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth; // reinicia la animación
      scoreEl.classList.add('bump');
    }
  }

  function setState(next) {
    state = next;
    document.body.dataset.state = next;
    if (next === 'playing' || next === 'dying') overlay.hidden = true;
    const paused = next === 'paused';
    btnPause.disabled = !(next === 'playing' || paused);
    btnPause.classList.toggle('is-paused', paused);
    btnPause.setAttribute('aria-label', paused ? 'Seguir jugando' : 'Pausar');
  }

  function showOverlay(kind) {
    let title;
    let text;
    let button = 'Jugar otra vez';
    if (kind === 'ready') {
      title = 'Culebra';
      text = 'Come flores, crece y no te muerdas la cola.';
      button = 'Jugar';
    } else if (kind === 'paused') {
      title = 'Pausa';
      text = 'Tu culebra te espera.';
      button = 'Seguir';
    } else if (lastResult && lastResult.cause === 'won') {
      title = '¡Llenaste el tablero!';
      text = `Hiciste ${lastResult.score} puntos y no quedó ni un lugar libre.`;
    } else {
      const r = lastResult || { cause: 'self', score: 0, record: false };
      title = r.cause === 'wall' ? '¡Te estrellaste!' : '¡Te mordiste la cola!';
      text = `Hiciste ${r.score} puntos.` + (r.record ? ' Es tu nuevo récord.' : '');
    }
    overlay.dataset.kind = kind;
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovBtn.textContent = button;
    overlay.hidden = false;
  }

  /* ── Flujo del juego ── */
  function startGame() {
    sound.unlock();
    engine = new SnakeEngine({ cols: COLS, rows: ROWS, wrap });
    acc = 0;
    floaters.length = 0;
    foodSince = performance.now();
    updateHud();
    setState('playing');
  }

  function pause() {
    if (state !== 'playing') return;
    setState('paused');
    showOverlay('paused');
  }

  function resume() {
    if (state !== 'paused') return;
    acc = 0;
    setState('playing');
  }

  function finish(cause) {
    const key = keyOf(wrap);
    const record = engine.score > best[key];
    if (record) {
      best[key] = engine.score;
      store.set('best-' + key, engine.score);
    }
    lastResult = { cause, score: engine.score, record };
    dyingSince = performance.now();
    lockUntil = dyingSince + 900; // evita reiniciar sin querer al seguir tecleando
    updateHud();
    if (cause === 'won') sound.eat();
    else sound.over();
    vibrate([70, 40, 110]);
    setState('dying');
  }

  function tick() {
    const r = engine.step();
    if (r.type === 'eat' || r.type === 'won') {
      foodSince = performance.now();
      floaters.push({ x: r.x, y: r.y, t0: performance.now() });
      sound.eat();
      vibrate(12);
      updateHud(true);
    }
    if (r.type === 'over') finish(r.cause);
    else if (r.type === 'won') finish('won');
  }

  function primary() {
    if (state === 'paused') resume();
    else if ((state === 'ready' || state === 'over') && performance.now() >= lockUntil) startGame();
  }

  function handleDirection(name) {
    if (state === 'ready') startGame(); // el primer giro también arranca la partida
    if (state !== 'playing') return;
    engine.turn(DIRS[name]);
  }

  /* ── Dibujo ── */
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function resize() {
    const css = board.clientWidth;
    if (!css) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cell = Math.max(6, Math.floor((css * dpr) / COLS));
    canvas.width = cell * COLS;
    canvas.height = cell * ROWS;

    // El fondo de cuadros se pinta una sola vez y se reutiliza en cada cuadro.
    bg = document.createElement('canvas');
    bg.width = canvas.width;
    bg.height = canvas.height;
    const g = bg.getContext('2d');
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        g.fillStyle = (x + y) % 2 ? PALETTE.boardB : PALETTE.boardA;
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  function drawFood(now) {
    const f = engine.food;
    if (!f) return;
    const born = Math.min(1, Math.max(0, (now - foodSince) / 240));
    const pulse = calm ? 1 : 1 + Math.sin(now / 280) * 0.05;
    const r = cell * 0.46 * easeOutBack(born) * pulse;
    if (r <= 0) return;

    ctx.save();
    ctx.translate((f.x + 0.5) * cell, (f.y + 0.5) * cell);
    const ring = (count, dist, rad, color, rot) => {
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const a = rot + (i / count) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * dist, Math.sin(a) * r * dist, r * rad, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ring(8, 0.6, 0.4, PALETTE.petalOuter, 0);
    ring(8, 0.36, 0.3, PALETTE.petalInner, Math.PI / 8);
    ctx.fillStyle = PALETTE.petalCore;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBody() {
    const s = engine.snake;
    const n = s.length;
    const cx = (seg) => (seg.x + 0.5) * cell;
    const cy = (seg) => (seg.y + 0.5) * cell;
    const widthAt = (i) => {
      const fromTail = n - 1 - i;
      return cell * 0.78 * (fromTail >= 4 ? 1 : 0.64 + 0.36 * (fromTail / 4)); // la cola se afina
    };
    const linked = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

    // De la cola a la cabeza: cada segmento tapa con su frente redondo al anterior (como escamas).
    const paint = (colorOf, extra) => {
      ctx.lineCap = 'butt';
      for (let i = n - 1; i >= 0; i--) {
        const seg = s[i];
        if (i < n - 1 && linked(s[i + 1], seg)) {
          ctx.strokeStyle = colorOf(s[i + 1]);
          ctx.lineWidth = (widthAt(i) + widthAt(i + 1)) / 2 + extra;
          ctx.beginPath();
          ctx.moveTo(cx(s[i + 1]), cy(s[i + 1]));
          ctx.lineTo(cx(seg), cy(seg));
          ctx.stroke();
        }
        ctx.fillStyle = colorOf(seg);
        ctx.beginPath();
        ctx.arc(cx(seg), cy(seg), (widthAt(i) + extra) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    paint(() => PALETTE.outline, cell * 0.12);
    paint((seg) => PALETTE.body[seg.n % PALETTE.body.length], 0);

    // Puntitos, como en una artesanía pintada a mano.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.arc(cx(s[i]), cy(s[i]), widthAt(i) * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHead(now) {
    const h = engine.snake[0];
    const d = engine.dir;
    const x = (h.x + 0.5) * cell;
    const y = (h.y + 0.5) * cell;
    const size = cell * 0.94;

    if (!calm && state === 'playing') {
      const phase = now % 1700;
      if (phase < 300) {
        const len = Math.sin((phase / 300) * Math.PI) * cell * 0.6;
        const bx = x + d.x * cell * 0.4;
        const by = y + d.y * cell * 0.4;
        const tx = bx + d.x * len;
        const ty = by + d.y * len;
        const fx = d.x * len * 0.35;
        const fy = d.y * len * 0.35;
        const px = -d.y * len * 0.28;
        const py = d.x * len * 0.28;
        ctx.strokeStyle = PALETTE.tongue;
        ctx.lineWidth = Math.max(2, cell * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + fx + px, ty + fy + py);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + fx - px, ty + fy - py);
        ctx.stroke();
      }
    }

    const edge = cell * 0.05;
    ctx.fillStyle = PALETTE.outline;
    roundRect(x - size / 2 - edge, y - size / 2 - edge, size + edge * 2, size + edge * 2, size * 0.45);
    ctx.fill();
    ctx.fillStyle = PALETTE.head;
    roundRect(x - size / 2, y - size / 2, size, size, size * 0.42);
    ctx.fill();

    const px = -d.y;
    const py = d.x;
    for (const side of [-1, 1]) {
      const ex = x + d.x * cell * 0.12 + px * side * cell * 0.22;
      const ey = y + d.y * cell * 0.12 + py * side * cell * 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1140';
      ctx.beginPath();
      ctx.arc(ex + d.x * cell * 0.05, ey + d.y * cell * 0.05, cell * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFloaters(now) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const age = (now - f.t0) / 650;
      if (age >= 1) {
        floaters.splice(i, 1);
        continue;
      }
      const x = Math.min(Math.max((f.x + 0.5) * cell, cell * 1.2), canvas.width - cell * 1.2);
      const y = Math.max(cell * 0.7, (f.y + 0.5) * cell - cell * 0.7 - (calm ? 0 : age * cell * 1.1));
      ctx.globalAlpha = 1 - age * age;
      ctx.font = `800 ${Math.round(cell * 0.72)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = cell * 0.14;
      ctx.strokeStyle = 'rgba(8, 5, 36, 0.85)';
      ctx.strokeText('+10', x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('+10', x, y);
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    if (!bg) return;
    ctx.drawImage(bg, 0, 0);
    drawFood(now);
    const blinkOff = state === 'dying' && Math.floor((now - dyingSince) / 130) % 2 === 1;
    if (!blinkOff) {
      drawBody();
      drawHead(now);
    }
    drawFloaters(now);
  }

  /* ── Bucle principal ── */
  let lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(Math.max(now - lastFrame, 0), 100);
    lastFrame = now;

    if (state === 'playing') {
      acc += dt;
      let ms = engine.tickMs();
      while (acc >= ms && state === 'playing') {
        acc -= ms;
        tick();
        ms = engine.tickMs();
      }
    } else if (state === 'dying' && now - dyingSince > 750) {
      setState('over');
      showOverlay('over');
    }
    draw(now);
  }

  /* ── Controles: teclado ── */
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    sound.unlock();
    const name = KEYMAP[e.code];
    if (name) {
      e.preventDefault();
      handleDirection(name);
      return;
    }
    if (e.repeat) return;
    const onControl = e.target instanceof Element && e.target.closest('button, input, label');
    if ((e.code === 'Space' || e.code === 'Enter') && !onControl) {
      e.preventDefault();
      if (state === 'playing') pause();
      else primary();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing') pause();
      else if (state === 'paused') resume();
    }
  });

  /* ── Controles: deslizar el dedo (o arrastrar con el mouse) ── */
  let tracking = false;
  let sx = 0;
  let sy = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('button, label')) return;
    sound.unlock();
    tracking = true;
    sx = e.clientX;
    sy = e.clientY;
  });
  stage.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    sx = e.clientX; // permite encadenar giros sin levantar el dedo
    sy = e.clientY;
    handleDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const stopTracking = () => { tracking = false; };
  // En pantallas táctiles solo "pointerup" cuenta como gesto para activar el audio (iOS lo exige).
  stage.addEventListener('pointerup', () => sound.unlock());
  stage.addEventListener('pointerup', stopTracking);
  stage.addEventListener('pointercancel', stopTracking);
  stage.addEventListener('pointerleave', stopTracking);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ── Controles: botones en pantalla ── */
  document.querySelectorAll('.dpad [data-dir]').forEach((btn) => {
    const release = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      sound.unlock();
      handleDirection(btn.dataset.dir);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    // Con teclado (Tab + Enter) el clic llega sin puntero.
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) handleDirection(btn.dataset.dir);
    });
  });

  /* ── Botones del marcador y de la pantalla ── */
  ovBtn.addEventListener('click', primary);
  btnPause.addEventListener('click', () => {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  });

  const renderSoundButton = () => btnSound.setAttribute('aria-pressed', String(sound.on));
  btnSound.addEventListener('click', () => {
    sound.on = !sound.on;
    store.set('sound', sound.on ? '1' : '0');
    renderSoundButton();
    if (sound.on) {
      sound.unlock();
      sound.tone(520, 0.08, { type: 'triangle', vol: 0.1 });
    }
  });

  optWrap.addEventListener('change', () => {
    wrap = optWrap.checked;
    store.set('wrap', wrap ? '1' : '0');
    board.classList.toggle('no-walls', wrap);
    updateHud();
  });

  // La partida se pausa sola si te cambias de pestaña o de app.
  const autoPause = () => { if (state === 'playing') pause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);

  /* ── Arranque ── */
  renderSoundButton();
  optWrap.checked = wrap;
  board.classList.toggle('no-walls', wrap);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(board);
  else window.addEventListener('resize', resize);
  resize();
  updateHud();
  setState('ready');
  showOverlay('ready');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') startUI();
if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeEngine, DIRS };
