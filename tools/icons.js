// Genera los iconos de la app (PNG) a partir del dibujo. Uso: node tools/icons.js www
const path = require('path');
const sharp = require('sharp');
const OUT = process.argv[2] || 'www';
const CELL = 48;
const GRID = 5; // arte de 5 x 5 casillas (240 x 240)
const PATH = [ // de la cola a la cabeza: una "S" de tres tramos
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
  [4, 3],
  [4, 2], [3, 2], [2, 2], [1, 2], [0, 2],
  [0, 1],
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
];
const COLORS = ['#1fe0c8', '#9b7bff', '#4cc9f0'];
const f = (n) => Math.round(n * 100) / 100;

function art() {
  const snake = PATH.slice().reverse(); // 0 = cabeza, igual que en el juego
  const n = snake.length;
  const cx = (s) => s[0] * CELL + CELL / 2;
  const cy = (s) => s[1] * CELL + CELL / 2;
  const widthAt = (i) => {
    const k = n - 1 - i; // distancia a la cola: la cola se afina
    return CELL * 0.78 * (k >= 4 ? 1 : 0.64 + 0.36 * (k / 4));
  };
  let out = '';
  const pass = (colorOf, extra) => {
    for (let i = n - 1; i >= 0; i--) {
      const s = snake[i];
      if (i < n - 1) {
        const p = snake[i + 1];
        out += `<line x1="${cx(p)}" y1="${cy(p)}" x2="${cx(s)}" y2="${cy(s)}" stroke="${colorOf(i + 1)}" stroke-width="${f((widthAt(i) + widthAt(i + 1)) / 2 + extra)}"/>`;
      }
      out += `<circle cx="${cx(s)}" cy="${cy(s)}" r="${f((widthAt(i) + extra) / 2)}" fill="${colorOf(i)}"/>`;
    }
  };
  pass(() => 'rgba(8,5,36,0.55)', CELL * 0.12);
  pass((i) => COLORS[(n - 1 - i) % 3], 0);
  for (let i = 1; i < n; i++) {
    out += `<circle cx="${cx(snake[i])}" cy="${cy(snake[i])}" r="${f(widthAt(i) * 0.13)}" fill="rgba(255,255,255,0.55)"/>`;
  }

  // Flor en la casilla de abajo de la cabeza (la cabeza mira hacia ella).
  const fx = 4 * CELL + CELL / 2;
  const fy = 1 * CELL + CELL / 2;
  const r = CELL * 0.46;
  const ring = (count, dist, rad, color, rot) => {
    let s = '';
    for (let i = 0; i < count; i++) {
      const a = rot + (i / count) * Math.PI * 2;
      s += `<circle cx="${f(fx + Math.cos(a) * r * dist)}" cy="${f(fy + Math.sin(a) * r * dist)}" r="${f(r * rad)}" fill="${color}"/>`;
    }
    return s;
  };
  out += ring(8, 0.6, 0.4, '#ff7a00', 0) + ring(8, 0.36, 0.3, '#ffb000', Math.PI / 8);
  out += `<circle cx="${fx}" cy="${fy}" r="${f(r * 0.14)}" fill="#c24a00"/>`;

  // Cabeza mirando hacia abajo: d = (0, 1), perpendicular p = (-1, 0).
  const hx = cx(snake[0]);
  const hy = cy(snake[0]);
  const size = CELL * 0.94;
  const edge = CELL * 0.05;
  out += `<rect x="${f(hx - size / 2 - edge)}" y="${f(hy - size / 2 - edge)}" width="${f(size + edge * 2)}" height="${f(size + edge * 2)}" rx="${f(size * 0.45)}" fill="rgba(8,5,36,0.55)"/>`;
  out += `<rect x="${f(hx - size / 2)}" y="${f(hy - size / 2)}" width="${f(size)}" height="${f(size)}" rx="${f(size * 0.42)}" fill="#ff2e93"/>`;
  for (const side of [-1, 1]) {
    const ex = hx - side * CELL * 0.22;
    const ey = hy + CELL * 0.12;
    out += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(CELL * 0.17)}" fill="#fff"/>`;
    out += `<circle cx="${f(ex)}" cy="${f(ey + CELL * 0.05)}" r="${f(CELL * 0.085)}" fill="#1a1140"/>`;
  }
  return out;
}

function svg(size, { rounded, scale }) {
  const box = GRID * CELL;
  const cs = CELL * scale;
  const o = 256 - (box * scale) / 2; // esquina del arte, para que los cuadros coincidan con la serpiente
  let checker = '';
  for (let c = -4; c < 14; c++) {
    for (let r = -4; r < 14; r++) {
      if ((c + r) % 2 !== 0) checker += `<rect x="${f(o + c * cs)}" y="${f(o + r * cs)}" width="${f(cs)}" height="${f(cs)}" fill="#221c6e"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <defs><clipPath id="c"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath></defs>
    <g clip-path="url(#c)">
      <rect width="512" height="512" fill="#1c1760"/>${checker}
      <g transform="translate(256 256) scale(${scale}) translate(${-box / 2} ${-box / 2})">${art()}</g>
    </g>
  </svg>`;
}


const SPECS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1.3 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1.3 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 1.15 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 1.2 },
];
(async () => {
  for (const s of SPECS) {
    await sharp(Buffer.from(svg(s.size, s))).png().toFile(path.join(OUT, s.file));
    console.log('listo', s.file);
  }
})();
