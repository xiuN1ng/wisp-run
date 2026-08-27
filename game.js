(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    time: document.getElementById("time"),
    title: document.getElementById("title"),
    over: document.getElementById("gameover"),
    finalScore: document.getElementById("final-score"),
    bestScore: document.getElementById("best-score"),
    play: document.getElementById("play"),
    restart: document.getElementById("restart"),
    mute: document.getElementById("mute"),
  };

  const BEST_KEY = "wisp-run-best";
  const MUTE_KEY = "wisp-run-mute";

  const ACCEL = 2200;
  const MAX_SPEED = 400;
  const DRAG = 5.4;
  const PLAYER_VISUAL = 11;
  const PLAYER_HIT = 8;

  let W = 800;
  let H = 600;
  let state = "title";
  let paused = false;
  let lastTs = 0;
  let elapsed = 0;
  let score = 0;
  let combo = 0;
  let spawnGuard = 0;
  let shake = 0;
  let flash = 0;
  let nextMoteAt = 0;
  let nextShardAt = 0;
  let hudScore = -1;
  let hudCombo = -1;
  let hudTime = -1;

  const keys = new Set();
  const pointer = { on: false, x: 0, y: 0 };
  const player = { x: 0, y: 0, vx: 0, vy: 0 };
  const motes = [];
  const shards = [];
  const sparks = [];
  const stars = [];
  const nebulae = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hypot = Math.hypot;

  function multiplier() {
    return 1 + Math.floor(combo / 4);
  }

  const audio = {
    ctx: null,
    master: null,
    padGain: null,
    muted: false,

    load() {
      try {
        this.muted = localStorage.getItem(MUTE_KEY) === "1";
      } catch (_) {
        this.muted = false;
      }
      ui.mute.classList.toggle("is-muted", this.muted);
      ui.mute.setAttribute("aria-pressed", this.muted ? "true" : "false");
    },

    ensure() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : 0.22;
          this.master.connect(this.ctx.destination);
          this.startPad();
        }
        if (this.ctx.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
      } catch (_) {}
    },

    setMuted(muted) {
      this.muted = muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      } catch (_) {}
      ui.mute.classList.toggle("is-muted", muted);
      ui.mute.setAttribute("aria-pressed", muted ? "true" : "false");
      if (this.master) {
        this.master.gain.value = muted ? 0 : 0.22;
      }
    },

    toggle() {
      this.ensure();
      this.setMuted(!this.muted);
    },

    startPad() {
      if (!this.ctx || this.padGain) return;
      try {
        const g = this.ctx.createGain();
        g.gain.value = 0.07;
        g.connect(this.master);
        const freqs = [110, 164.81, 220];
        freqs.forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = f;
          const lg = this.ctx.createGain();
          lg.gain.value = i === 0 ? 0.5 : 0.22;
          o.connect(lg);
          lg.connect(g);
          o.start();
        });
        this.padGain = g;
      } catch (_) {}
    },

    beep(freq, dur, type, vol) {
      if (!this.ctx || this.muted) return;
      try {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type || "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol || 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch (_) {}
    },

    pickup(mult) {
      this.beep(480 + Math.min(mult, 12) * 28, 0.09, "triangle", 0.2);
      this.beep(720 + Math.min(mult, 12) * 18, 0.14, "sine", 0.08);
    },

    death() {
      if (!this.ctx || this.muted) return;
      try {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(280, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.55);
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 0.6);
      } catch (_) {}
    },
  };

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (_) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (_) {}
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    stars.length = 0;
    nebulae.length = 0;
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: rand(0.3, 1.4),
        a: rand(0.18, 0.85),
        tw: rand(0, Math.PI * 2),
      });
    }
    nebulae.push(
      { x: W * 0.28, y: H * 0.32, r: Math.min(W, H) * 0.42, c: "rgba(70, 20, 110, 0.16)" },
      { x: W * 0.72, y: H * 0.68, r: Math.min(W, H) * 0.38, c: "rgba(12, 70, 110, 0.14)" }
    );
  }

  function burst(x, y, color, count, speed) {
    const cap = 240 - sparks.length;
    const n = Math.min(count, Math.max(0, cap));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.25, speed);
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.25, 0.7),
        max: 0,
        r: rand(1.2, 3.4),
        color,
      });
      sparks[sparks.length - 1].max = sparks[sparks.length - 1].life;
    }
  }

  function spawnMote(forceRare) {
    const margin = 40;
    const rare = forceRare || Math.random() < 0.12;
    motes.push({
      x: rand(margin, W - margin),
      y: rand(margin, H - margin),
      vx: rand(-28, 28),
      vy: rand(-28, 28),
      r: rare ? 7 : 5.2,
      rare,
      phase: rand(0, Math.PI * 2),
    });
  }

  function spawnShard() {
    const edge = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (edge === 0) {
      x = rand(0, W);
      y = -24;
    } else if (edge === 1) {
      x = rand(0, W);
      y = H + 24;
    } else if (edge === 2) {
      x = -24;
      y = rand(0, H);
    } else {
      x = W + 24;
      y = rand(0, H);
    }
    if (state === "playing" && hypot(x - player.x, y - player.y) < 140) {
      x = player.x + (x < player.x ? -220 : 220);
      y = clamp(y, -24, H + 24);
    }
    const chaseChance = clamp(0.22 + elapsed * 0.012, 0.22, 0.62);
    const chase = Math.random() < chaseChance;
    const speed = 50 + elapsed * 2.1;
    const ang = Math.atan2(H * 0.5 - y, W * 0.5 - x) + rand(-0.6, 0.6);
    shards.push({
      x,
      y,
      vx: Math.cos(ang) * speed * rand(0.5, 1),
      vy: Math.sin(ang) * speed * rand(0.5, 1),
      r: rand(11, 16),
      rot: rand(0, Math.PI * 2),
      spin: rand(-2.8, 2.8),
      chase,
      sides: Math.random() < 0.5 ? 3 : 4,
    });
  }

  function resetRun() {
    score = 0;
    combo = 0;
    elapsed = 0;
    spawnGuard = 0.9;
    shake = 0;
    flash = 0;
    nextMoteAt = 0.2;
    nextShardAt = 1.1;
    motes.length = 0;
    shards.length = 0;
    sparks.length = 0;
    player.x = W * 0.5;
    player.y = H * 0.5;
    player.vx = 0;
    player.vy = 0;
    for (let i = 0; i < 8; i++) spawnMote();
    spawnShard();
    spawnShard();
    hudScore = -1;
    hudCombo = -1;
    hudTime = -1;
    syncHud();
  }

  function show(el, on) {
    el.classList.toggle("hidden", !on);
  }

  function setState(next) {
    state = next;
    show(ui.title, next === "title");
    show(ui.over, next === "over");
    show(ui.hud, next === "playing");
  }

  function startGame() {
    audio.ensure();
    audio.beep(320, 0.12, "sine", 0.12);
    resetRun();
    setState("playing");
  }

  function endGame() {
    audio.death();
    shake = 14;
    flash = 0.85;
    burst(player.x, player.y, "rgba(255, 90, 200, 1)", 48, 280);
    burst(player.x, player.y, "rgba(120, 240, 255, 1)", 18, 160);
    const best = Math.max(score, readBest());
    writeBest(best);
    ui.finalScore.textContent = String(score);
    ui.bestScore.textContent = String(best);
    setState("over");
  }

  function syncHud() {
    if (score !== hudScore) {
      hudScore = score;
      ui.score.textContent = String(score);
    }
    const m = multiplier();
    if (combo !== hudCombo) {
      hudCombo = combo;
      ui.combo.textContent = "x" + m;
    }
    const t = elapsed.toFixed(1);
    if (t !== hudTime) {
      hudTime = t;
      ui.time.textContent = t;
    }
  }

  function clientToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * W;
    pointer.y = ((e.clientY - rect.top) / rect.height) * H;
  }

  function updatePlayer(dt) {
    let ax = 0;
    let ay = 0;
    if (keys.has("keyw") || keys.has("arrowup")) ay -= 1;
    if (keys.has("keys") || keys.has("arrowdown")) ay += 1;
    if (keys.has("keya") || keys.has("arrowleft")) ax -= 1;
    if (keys.has("keyd") || keys.has("arrowright")) ax += 1;
    if (ax || ay) {
      const len = hypot(ax, ay) || 1;
      ax = (ax / len) * ACCEL;
      ay = (ay / len) * ACCEL;
    }
    if (pointer.on) {
      const dx = pointer.x - player.x;
      const dy = pointer.y - player.y;
      const d = hypot(dx, dy);
      if (d > 10) {
        ax += (dx / d) * ACCEL;
        ay += (dy / d) * ACCEL;
      }
    }
    player.vx += ax * dt;
    player.vy += ay * dt;
    const damp = Math.exp(-DRAG * dt);
    player.vx *= damp;
    player.vy *= damp;
    const sp = hypot(player.vx, player.vy);
    if (sp > MAX_SPEED) {
      player.vx = (player.vx / sp) * MAX_SPEED;
      player.vy = (player.vy / sp) * MAX_SPEED;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    const pad = PLAYER_VISUAL;
    if (player.x < pad) {
      player.x = pad;
      player.vx = Math.abs(player.vx) * 0.35;
    } else if (player.x > W - pad) {
      player.x = W - pad;
      player.vx = -Math.abs(player.vx) * 0.35;
    }
    if (player.y < pad) {
      player.y = pad;
      player.vy = Math.abs(player.vy) * 0.35;
    } else if (player.y > H - pad) {
      player.y = H - pad;
      player.vy = -Math.abs(player.vy) * 0.35;
    }

    if (sp > 40) {
      sparks.push({
        x: player.x - (player.vx / sp) * 8 + rand(-2, 2),
        y: player.y - (player.vy / sp) * 8 + rand(-2, 2),
        vx: -player.vx * 0.12 + rand(-18, 18),
        vy: -player.vy * 0.12 + rand(-18, 18),
        life: rand(0.18, 0.38),
        max: 0.3,
        r: rand(1.4, 2.8),
        color: Math.random() < 0.25 ? "rgba(255, 90, 210, 1)" : "rgba(90, 245, 255, 1)",
      });
      sparks[sparks.length - 1].max = sparks[sparks.length - 1].life;
    }
  }

  function updateMotes(dt) {
    const want = 10;
    nextMoteAt -= dt;
    while (motes.length < want && nextMoteAt <= 0) {
      spawnMote();
      nextMoteAt = 0.18;
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.phase += dt * 4;
      const dx = player.x - m.x;
      const dy = player.y - m.y;
      const d = hypot(dx, dy);
      if (d < 110 && d > 0.001) {
        const pull = (m.rare ? 140 : 95) * dt;
        m.vx += (dx / d) * pull;
        m.vy += (dy / d) * pull;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= Math.exp(-0.6 * dt);
      m.vy *= Math.exp(-0.6 * dt);
      if (m.x < 12 || m.x > W - 12) m.vx *= -1;
      if (m.y < 12 || m.y > H - 12) m.vy *= -1;
      m.x = clamp(m.x, 12, W - 12);
      m.y = clamp(m.y, 12, H - 12);
      if (d < PLAYER_HIT + m.r + 3) {
        const mult = multiplier();
        const gain = (m.rare ? 28 : 12) * mult;
        score += gain;
        combo += 1;
        flash = Math.min(1, flash + (m.rare ? 0.45 : 0.28));
        audio.pickup(mult);
        burst(m.x, m.y, m.rare ? "rgba(255, 90, 210, 1)" : "rgba(255, 230, 140, 1)", m.rare ? 18 : 12, 150);
        motes.splice(i, 1);
        nextMoteAt = Math.min(nextMoteAt, 0.05);
      }
    }
  }

  function updateShards(dt) {
    const cap = Math.min(18, 3 + Math.floor(elapsed / 7));
    nextShardAt -= dt;
    const interval = Math.max(0.55, 2.15 - elapsed * 0.038);
    if (shards.length < cap && nextShardAt <= 0) {
      spawnShard();
      nextShardAt = interval;
    }
    const seek = 85 + elapsed * 2.4;
    for (const s of shards) {
      s.rot += s.spin * dt;
      if (s.chase) {
        const dx = player.x - s.x;
        const dy = player.y - s.y;
        const d = hypot(dx, dy) || 1;
        s.vx += (dx / d) * seek * dt;
        s.vy += (dy / d) * seek * dt;
      } else {
        s.vx += Math.sin(elapsed * 1.3 + s.rot) * 18 * dt;
        s.vy += Math.cos(elapsed * 1.1 + s.rot) * 18 * dt;
      }
      const max = 70 + elapsed * 3.2 + (s.chase ? 40 : 0);
      const sp = hypot(s.vx, s.vy);
      if (sp > max) {
        s.vx = (s.vx / sp) * max;
        s.vy = (s.vy / sp) * max;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < -40) s.x = W + 30;
      else if (s.x > W + 40) s.x = -30;
      if (s.y < -40) s.y = H + 30;
      else if (s.y > H + 40) s.y = -30;
    }
    if (spawnGuard > 0) return;
    for (const s of shards) {
      const hitR = s.r * 0.72;
      if (hypot(s.x - player.x, s.y - player.y) < PLAYER_HIT + hitR) {
        endGame();
        return;
      }
    }
  }

  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    if (sparks.length > 240) sparks.splice(0, sparks.length - 240);
  }

  function update(dt) {
    if (state === "playing") {
      elapsed += dt;
      spawnGuard = Math.max(0, spawnGuard - dt);
      shake = Math.max(0, shake - dt * 28);
      flash = Math.max(0, flash - dt * 2.4);
      updatePlayer(dt);
      updateMotes(dt);
      if (state === "playing") updateShards(dt);
      syncHud();
    } else {
      shake = Math.max(0, shake - dt * 20);
      flash = Math.max(0, flash - dt * 1.6);
      player.x = W * 0.5 + Math.sin(elapsed * 0.4) * 8;
      player.y = H * 0.52 + Math.cos(elapsed * 0.32) * 6;
      elapsed += dt * 0.35;
    }
    updateSparks(dt);
  }

  function glow(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBackground() {
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, W, H);
    for (const n of nebulae) {
      glow(n.x, n.y, n.r, n.c);
    }
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(elapsed * s.z * 1.8 + s.tw);
      ctx.fillStyle = "rgba(210, 235, 255," + (s.a * tw).toFixed(3) + ")";
      ctx.fillRect(s.x, s.y, s.z, s.z);
    }
  }

  function drawMotes() {
    for (const m of motes) {
      const pulse = 1 + Math.sin(m.phase) * 0.18;
      if (m.rare) {
        glow(m.x, m.y, 22 * pulse, "rgba(255, 70, 200, 0.28)");
        ctx.fillStyle = "#ff7ae4";
      } else {
        glow(m.x, m.y, 18 * pulse, "rgba(255, 220, 120, 0.22)");
        ctx.fillStyle = "#ffe08a";
      }
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(m.x - 1.2, m.y - 1.2, m.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShards() {
    for (const s of shards) {
      glow(s.x, s.y, s.r * 2.1, "rgba(180, 40, 120, 0.22)");
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      for (let i = 0; i < s.sides; i++) {
        const a = (Math.PI * 2 * i) / s.sides - Math.PI / 2;
        const rr = i % 2 === 0 ? s.r : s.r * 0.72;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(18, 6, 22, 0.92)";
      ctx.fill();
      ctx.strokeStyle = s.chase ? "#ff4fd8" : "#9a5cff";
      ctx.lineWidth = 1.6;
      ctx.shadowColor = "#ff4fd8";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSparks() {
    for (const p of sparks) {
      const a = p.life / p.max;
      ctx.fillStyle = p.color.replace(", 1)", ", " + (a * 0.9).toFixed(3) + ")");
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWisp() {
    const sp = hypot(player.vx, player.vy);
    const ang = Math.atan2(player.vy, player.vx);
    ctx.save();
    ctx.translate(player.x, player.y);
    if (sp > 20) ctx.rotate(ang);
    ctx.scale(1 + Math.min(sp / MAX_SPEED, 1) * 0.22, 1 - Math.min(sp / MAX_SPEED, 1) * 0.12);
    glow(0, 0, 34, "rgba(80, 240, 255, 0.28)");
    glow(0, 0, 18, "rgba(255, 120, 220, 0.18)");
    ctx.fillStyle = "#7af7ff";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_VISUAL, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-2, -2.4, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFx() {
    if (flash > 0) {
      ctx.fillStyle = "rgba(180, 255, 255," + (flash * 0.16).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (state === "over") {
      ctx.fillStyle = "rgba(40, 0, 30," + (0.18).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawBackground();
    drawSparks();
    drawMotes();
    drawShards();
    if (state !== "over") drawWisp();
    else if (flash > 0.05) drawWisp();
    drawFx();
    ctx.restore();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (paused) {
      lastTs = ts;
      return;
    }
    const dt = lastTs ? Math.min(0.033, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    update(dt);
    draw();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.repeat) {
      keys.add(e.code.toLowerCase());
      return;
    }
    const code = e.code.toLowerCase();
    keys.add(code);
    if (code === "keym") {
      audio.toggle();
      return;
    }
    if (code === "enter" || code === "space") {
      e.preventDefault();
      if (state === "title" || state === "over") startGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code.toLowerCase());
  });

  canvas.addEventListener("pointerdown", (e) => {
    pointer.on = true;
    clientToWorld(e);
    canvas.setPointerCapture(e.pointerId);
    audio.ensure();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.on && e.pointerType === "mouse") clientToWorld(e);
    if (pointer.on) clientToWorld(e);
  });
  const endPtr = (e) => {
    pointer.on = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);

  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    lastTs = 0;
  });

  ui.play.addEventListener("click", startGame);
  ui.restart.addEventListener("click", startGame);
  ui.mute.addEventListener("click", () => audio.toggle());

  audio.load();
  resize();
  player.x = W * 0.5;
  player.y = H * 0.52;
  burst(W * 0.5, H * 0.48, "rgba(90, 245, 255, 1)", 20, 80);
  setState("title");
  requestAnimationFrame(frame);
})();
