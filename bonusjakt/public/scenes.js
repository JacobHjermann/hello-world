// Illustrated background for each region (inline SVG, so no image hosting is needed).
(function () {
  function rnd(seed) { return () => (seed = (seed * 9301 + 49297) % 233280) / 233280; }
  function stars(n) { const r = rnd(7); let s = ""; for (let i = 0; i < n; i++) s += `<circle cx="${(r() * 1600) | 0}" cy="${(r() * 380) | 0}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.6 + 0.3).toFixed(2)}"/>`; return s; }
  function trees(x, y, n, c) { let s = ""; for (let i = 0; i < n; i++) { const tx = x + i * 42 + (i % 3) * 9, h = 40 + (i * 37 % 30); s += `<path d="M${tx} ${y + 10} L${tx + 14} ${y - h} L${tx + 28} ${y + 10}Z" fill="${c}"/>`; } return s; }
  function skyline(reflect) {
    const r = rnd(3); let s = "", x = 0;
    while (x < 1600) {
      const w = 50 + r() * 70, h = 140 + r() * 300, top = 690 - h;
      s += reflect ? `<rect x="${x}" y="690" width="${w - 6}" height="${h * 0.35}" fill="#1a1f4d"/>` : `<rect x="${x}" y="${top}" width="${w - 6}" height="${h}" fill="#141a3f"/>`;
      if (!reflect) for (let wy = top + 16; wy < 680; wy += 22) for (let wx = x + 8; wx < x + w - 14; wx += 14) if (r() > 0.62) s += `<rect x="${wx}" y="${wy}" width="5" height="8" fill="#ffd98a" opacity=".8"/>`;
      x += w;
    }
    return s;
  }
  function acacia(x, y, k) { return `<g fill="#1e0e05" transform="translate(${x} ${y}) scale(${k})"><path d="M-4 0 L-2 -110 L-30 -150 L-26 -152 L0 -122 L22 -158 L27 -155 L4 -110 L4 0Z"/><ellipse cx="-20" cy="-158" rx="90" ry="18"/><ellipse cx="30" cy="-165" rx="70" ry="15"/></g>`; }
  function palm(x, y, k) {
    return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 0 Q-20 -120 10 -240" stroke="#5a3b1e" stroke-width="12" fill="none"/>
    <g fill="#1f6b3a"><path d="M10 -240 Q-60 -270 -130 -220 Q-60 -250 10 -232Z"/><path d="M10 -240 Q80 -280 150 -230 Q80 -255 10 -232Z"/><path d="M10 -240 Q-30 -300 -90 -310 Q-20 -280 8 -236Z"/><path d="M10 -240 Q60 -310 120 -300 Q50 -280 12 -236Z"/><path d="M10 -240 Q-40 -200 -80 -140 Q-20 -200 8 -234Z"/></g></g>`;
  }

  const S = {
    all: { cap: "Nordlys over fjorden · alle destinasjoner", h: "Finn ledige bonusseter før alle andre", svg: `
      <defs><linearGradient id="a0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05122b"/><stop offset=".6" stop-color="#0f2d4f"/><stop offset="1" stop-color="#1b4a63"/></linearGradient>
      <linearGradient id="a1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3dffb0" stop-opacity="0"/><stop offset=".4" stop-color="#3dffb0" stop-opacity=".55"/><stop offset=".8" stop-color="#5ad1ff" stop-opacity=".35"/><stop offset="1" stop-color="#9b7bff" stop-opacity="0"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#a0)"/>
      <path d="M-50 260 C 300 120, 600 330, 900 200 S 1400 120, 1700 230 L1700 330 C 1400 230, 1200 330, 900 300 S 400 260, -50 360Z" fill="url(#a1)"/>
      <path d="M100 170 C 450 60, 800 250, 1150 140 S 1500 100, 1700 160 L1700 200 C 1450 150, 1200 210, 1000 220 S 400 130, 100 230Z" fill="url(#a1)" opacity=".5"/>
      ${stars(80)}
      <path d="M0 560 L180 400 L300 470 L470 330 L640 520 L760 450 L900 560 L1050 380 L1230 500 L1380 390 L1600 540 L1600 800 L0 800Z" fill="#0a1a2c"/>
      <path d="M0 620 L1600 620 L1600 800 L0 800Z" fill="#0d2438"/>
      <path d="M0 620 L180 700 L300 660 L470 760 L640 640 L760 680 L900 620Z" fill="#0a1a2c" opacity=".5"/>` },
    europa: { cap: "Alpene ved solnedgang · Europa", h: "Bonusreiser til Europa", svg: `
      <defs><linearGradient id="e0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a6b"/><stop offset=".55" stop-color="#e0796a"/><stop offset="1" stop-color="#f6c58b"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#e0)"/><circle cx="1150" cy="470" r="90" fill="#ffe2a8" opacity=".9"/>
      <path d="M0 560 L220 300 L330 400 L520 210 L700 430 L850 330 L1040 520 L1200 360 L1400 470 L1600 300 L1600 800 L0 800Z" fill="#5a4a7e"/>
      <path d="M470 270 L520 210 L575 280 L545 265 L520 290 L495 262Z M170 360 L220 300 L265 355 L235 345Z" fill="#f4eef8"/>
      <path d="M0 620 L260 480 L460 590 L700 470 L980 610 L1250 500 L1600 600 L1600 800 L0 800Z" fill="#2f2b4d"/>
      ${trees(0, 690, 40, "#1d1b33")}
      <rect y="700" width="1600" height="100" fill="#1d1b33"/>` },
    "nord-amerika": { cap: "Skyline i skumringen · Nord-Amerika", h: "Bonusreiser til Nord-Amerika", svg: `
      <defs><linearGradient id="n0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101d4a"/><stop offset=".6" stop-color="#5b3f86"/><stop offset="1" stop-color="#f08a5d"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#n0)"/>${stars(30)}
      ${skyline()}
      <rect y="690" width="1600" height="110" fill="#0b1230"/>
      <g opacity=".35">${skyline(true)}</g>` },
    "sor-amerika": { cap: "Fjell ved havet · Sør-Amerika", h: "Bonusreiser til Sør-Amerika", svg: `
      <defs><linearGradient id="r0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d8bc4"/><stop offset=".7" stop-color="#9ad7e6"/><stop offset="1" stop-color="#f3e3b5"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#r0)"/><circle cx="300" cy="180" r="60" fill="#fff6d6" opacity=".9"/>
      <path d="M820 600 Q860 300 1000 260 Q1120 260 1150 600Z" fill="#1f5b46"/>
      <path d="M1100 600 Q1150 420 1250 400 Q1330 410 1360 600Z" fill="#2b6f55"/>
      <path d="M0 600 L150 420 L300 520 L470 380 L650 600Z" fill="#3a7f5f"/>
      <rect y="600" width="1600" height="200" fill="#1c7aa0"/>
      <path d="M0 640 Q200 630 400 645 T800 640 T1200 650 T1600 640" stroke="#bfeaf5" stroke-width="3" fill="none" opacity=".6"/>
      <path d="M0 700 Q300 690 600 705 T1200 700 T1600 705" stroke="#bfeaf5" stroke-width="2" fill="none" opacity=".4"/>
      <path d="M0 740 Q500 700 900 760 L900 800 L0 800Z" fill="#f1dca5"/>` },
    asia: { cap: "Fjell og pagode ved soloppgang · Asia", h: "Bonusreiser til Asia", svg: `
      <defs><linearGradient id="s0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d9c4"/><stop offset=".7" stop-color="#f2a7a0"/><stop offset="1" stop-color="#d98a9a"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#s0)"/><circle cx="1180" cy="250" r="110" fill="#d8323b" opacity=".85"/>
      <path d="M300 640 L700 260 Q760 220 820 260 L1220 640Z" fill="#6c7aa6"/>
      <path d="M640 318 L700 260 Q760 220 820 260 L880 318 Q840 300 810 330 Q780 300 760 330 Q735 300 705 330 Q670 300 640 318Z" fill="#fbf6f4"/>
      <path d="M0 680 Q400 590 800 660 T1600 640 L1600 800 L0 800Z" fill="#3e3a5c"/>
      <g fill="#2a2440" transform="translate(220 470)">
        <rect x="40" y="70" width="70" height="140"/><path d="M-10 80 L150 80 L120 60 L20 60Z"/><path d="M5 30 L135 30 L110 12 L30 12Z"/><rect x="50" y="30" width="50" height="40"/><rect x="72" y="-30" width="6" height="45"/>
      </g>` },
    midtosten: { cap: "Ørken og by i kveldslys · Midtøsten", h: "Bonusreiser til Midtøsten", svg: `
      <defs><linearGradient id="m0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a5c"/><stop offset=".55" stop-color="#c46a52"/><stop offset="1" stop-color="#f2c27a"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#m0)"/><circle cx="420" cy="430" r="80" fill="#ffe6b0" opacity=".85"/>
      <g fill="#3a2440"><rect x="1080" y="250" width="26" height="380"/><path d="M1093 120 L1106 250 L1080 250Z"/><rect x="1130" y="400" width="60" height="230"/><rect x="1200" y="360" width="44" height="270"/><rect x="1000" y="430" width="70" height="200"/><rect x="1260" y="460" width="80" height="170"/><rect x="940" y="480" width="50" height="150"/></g>
      <path d="M0 640 Q300 560 600 630 T1200 610 T1600 620 L1600 800 L0 800Z" fill="#d79a55"/>
      <path d="M0 700 Q400 640 800 700 T1600 690 L1600 800 L0 800Z" fill="#b8763b"/>` },
    afrika: { cap: "Savanne ved solnedgang · Afrika", h: "Bonusreiser til Afrika", svg: `
      <defs><linearGradient id="f0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2a1e"/><stop offset=".55" stop-color="#e2672b"/><stop offset="1" stop-color="#f8c45a"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#f0)"/><circle cx="800" cy="560" r="190" fill="#ffd77a" opacity=".85"/>
      <rect y="600" width="1600" height="200" fill="#2a1408"/>
      <path d="M0 610 Q400 585 800 605 T1600 595 L1600 640 L0 640Z" fill="#3a1d0c"/>
      ${acacia(260, 610, 1.1)}${acacia(1250, 615, 1.4)}${acacia(1480, 605, 0.8)}
      <g fill="#2a1408"><ellipse cx="560" cy="590" rx="34" ry="16"/><rect x="530" y="590" width="6" height="22"/><rect x="580" y="590" width="6" height="22"/><path d="M588 582 L612 470 L622 472 L600 590Z"/><ellipse cx="620" cy="466" rx="12" ry="7"/></g>` },
    oseania: { cap: "Turkis lagune · Oseania", h: "Bonusreiser til Oseania", svg: `
      <defs><linearGradient id="o0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58b9e8"/><stop offset="1" stop-color="#c8ecf7"/></linearGradient>
      <linearGradient id="o1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1aa7b8"/><stop offset="1" stop-color="#5fe0d0"/></linearGradient></defs>
      <rect width="1600" height="800" fill="url(#o0)"/>
      <ellipse cx="400" cy="200" rx="160" ry="34" fill="#fff" opacity=".7"/><ellipse cx="1200" cy="140" rx="200" ry="30" fill="#fff" opacity=".55"/>
      <rect y="500" width="1600" height="300" fill="url(#o1)"/>
      <path d="M700 800 Q1000 610 1600 640 L1600 800Z" fill="#f6e5bb"/>
      ${palm(1260, 660, 1.2)}${palm(1430, 650, 0.9)}` },
  };

  document.querySelectorAll(".scene").forEach((el) => {
    el.innerHTML = `<svg viewBox="0 0 1600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${S[el.dataset.scene].svg}</svg>`;
  });

  window.SCENES = S;
})();
