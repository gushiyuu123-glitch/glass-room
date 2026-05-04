// src/components/fx/SpaceDust.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./SpaceDust.module.css";
import { onFx, FX } from "../../lib/fxBus";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const update = () => setReduced(!!mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse)");
    if (!mq) return;
    const update = () => setCoarse(!!mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return coarse;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/* ────────────────────────────────────────────
   PRNG（再現性のある乱数）
──────────────────────────────────────────── */
function mulberry32(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default function SpaceDust({ active = true, intensity = 1, className = "" }) {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();

  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e) => {
      pointer.current.x = clamp((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1, -1, 1);
      pointer.current.y = clamp((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1, -1, 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const pulseRef = useRef({
    on: false, phase: "tap", t: 0, dur: 0,
    strength: 0, centerY: 0.46,
  });

  useEffect(() => {
    return onFx(FX.PULSE, (d) => {
      pulseRef.current = {
        on: true,
        phase: d.phase ?? "tap",
        t: 0,
        dur: Math.max(120, d.duration ?? 420),
        strength: clamp(d.strength ?? 1, 0, 1.6),
        centerY: clamp(d.centerY ?? 0.46, 0.2, 0.8),
      };
    });
  }, []);

  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    on();
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dprCap = coarse ? 1.25 : 1.8;
    let dpr = Math.min(window.devicePixelRatio || 1, dprCap);

    let motes = [];         // 通常の浮遊粒子（3層）
    let crystals = [];      // 結晶きらめき
    let streaks = [];       // 流星
    let nebulae = [];       // 星雲（大きな光の塊）
    let auroraBands = [];   // オーロラ帯
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let elapsed = 0;        // 総経過時間（ms）

    const FPS = coarse ? 26 : 30;
    const STEP = 1000 / FPS;

    /* ── リサイズ + 初期化 ── */
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const rand = mulberry32(20260503);

      // ── 粒子 3層（奥・中・手前）
      const baseCount = coarse ? 60 : 130;
      const count = Math.floor(baseCount * clamp(intensity, 0.4, 1.8));

      motes = Array.from({ length: count }, (_, i) => {
        const layer = i % 3; // 0:奥 1:中 2:手前
        const layerScale = [0.4, 0.75, 1.2][layer];
        const r = (0.5 + rand() * 1.2) * layerScale;
        return {
          x: rand() * cw,
          y: rand() * ch,
          r,
          baseA: (0.05 + rand() * 0.18) * layerScale,
          vx: (rand() - 0.5) * 0.09 * layerScale,
          vy: (rand() - 0.5) * 0.07 * layerScale,
          tw: rand() * Math.PI * 2,
          tws: (0.28 + rand() * 0.55) * layerScale,
          layer,
          // 色相：青0.62 / 青紫0.70 / シアン0.54 をランダムに
          hue: [0.54, 0.62, 0.70][Math.floor(rand() * 3)],
          sat: 0.55 + rand() * 0.35,
        };
      });

      // ── 結晶きらめき（ごく少数、強くきらっと）
      const crystalCount = coarse ? 8 : 18;
      crystals = Array.from({ length: crystalCount }, () => ({
        x: rand() * cw,
        y: rand() * ch,
        phase: rand() * Math.PI * 2,
        speed: 0.0008 + rand() * 0.0014,
        maxA: 0.55 + rand() * 0.45,
        size: 1.2 + rand() * 2.8,
        hue: 0.58 + rand() * 0.14,
        vx: (rand() - 0.5) * 0.04,
        vy: (rand() - 0.5) * 0.03,
      }));

      // ── 星雲（大きな柔らかい光の塊）
      const nebulaCount = coarse ? 3 : 6;
      nebulae = Array.from({ length: nebulaCount }, () => ({
        x: rand() * cw,
        y: rand() * ch,
        r: 80 + rand() * 180,
        baseA: 0.012 + rand() * 0.018,
        tw: rand() * Math.PI * 2,
        tws: 0.06 + rand() * 0.12,
        vx: (rand() - 0.5) * 0.025,
        vy: (rand() - 0.5) * 0.018,
        hue: 0.60 + rand() * 0.18, // 青〜青紫
      }));

      // ── オーロラ帯（水平方向の淡い帯）
      const auroraCount = coarse ? 2 : 4;
      auroraBands = Array.from({ length: auroraCount }, (_, i) => ({
        y: ch * (0.15 + i * 0.22 + rand() * 0.12),
        height: 60 + rand() * 120,
        tw: rand() * Math.PI * 2,
        tws: 0.04 + rand() * 0.07,
        hue: 0.56 + rand() * 0.20,
        baseA: 0.008 + rand() * 0.012,
        drift: (rand() - 0.5) * 0.015,
      }));

      streaks = [];
      draw(0);
    };

    /* ── 流星生成 ── */
    const spawnStreak = () => {
      if (coarse) return;
      if (Math.random() > 0.022 * clamp(intensity, 0.4, 1.6)) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // 稀に長い流星、ほとんどは短い
      const isLong = Math.random() < 0.15;
      streaks.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.65,
        vx: 0.55 + Math.random() * 0.65,
        vy: 0.12 + Math.random() * 0.28,
        len: isLong ? 180 + Math.random() * 220 : 50 + Math.random() * 110,
        t: 0,
        life: isLong ? 800 + Math.random() * 600 : 420 + Math.random() * 480,
        a: isLong ? 0.18 + Math.random() * 0.12 : 0.08 + Math.random() * 0.10,
        hue: 0.56 + Math.random() * 0.18,
      });
    };

    /* ── パルスリング ── */
    const drawPulseRing = (cx, cy, k, phase, strength) => {
      const isTap = phase === "tap";
      const r0 = isTap ? 220 : 18;
      const r1 = isTap ? 26 : 160;
      const r = r0 + (r1 - r0) * easeOutCubic(k);
      const a = (isTap ? 0.18 : 0.14) * (1 - k) * strength;

      // 二重リング（内側は少し色温度を変える）
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, r * 0.68), cx, cy, r);
      g.addColorStop(0, `rgba(0,0,0,0)`);
      g.addColorStop(0.5, `rgba(150,210,255,${a * 0.5})`);
      g.addColorStop(0.8, `rgba(200,230,255,${a})`);
      g.addColorStop(1, `rgba(180,210,255,${a * 0.3})`);

      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 外側の薄いリング
      if (!isTap && k < 0.7) {
        const r2 = r * 1.35;
        const a2 = a * 0.35 * (1 - k / 0.7);
        const g2 = ctx.createRadialGradient(cx, cy, r, cx, cy, r2);
        g2.addColorStop(0, `rgba(180,220,255,${a2})`);
        g2.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(cx, cy, r2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    };

    /* ── メイン描画 ── */
    const draw = (dt) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const centerY = pulseRef.current.centerY ?? 0.46;
      const cx = w * 0.5;
      const cy = h * centerY;

      // ── pulse 計算
      let pull = 0;
      let phase = "tap";
      let pulseK = 0;
      if (pulseRef.current.on) {
        phase = pulseRef.current.phase;
        pulseRef.current.t += dt;
        pulseK = clamp(pulseRef.current.t / pulseRef.current.dur, 0, 1);
        const e = easeOutCubic(pulseK);
        const base = phase === "tap" ? 1 : 0.65;
        pull = (1 - e) * pulseRef.current.strength * base;
        drawPulseRing(cx, cy, pulseK, phase, pulseRef.current.strength);
        if (pulseK >= 1) pulseRef.current.on = false;
      }

      const n = dt / 16.67; // フレームレート正規化係数
      const driftX = pointer.current.x * 0.18;
      const driftY = pointer.current.y * 0.10;

      // ────────────────────────────────────────
      // ① オーロラ帯（最背面）
      // ────────────────────────────────────────
      ctx.globalCompositeOperation = "screen";
      for (const band of auroraBands) {
        band.tw += dt * 0.001 * band.tws;
        band.y += band.drift * n;
        if (band.y < -band.height) band.y = h + band.height;
        if (band.y > h + band.height) band.y = -band.height;

        const pulse = Math.sin(band.tw) * 0.5 + 0.5;
        const a = band.baseA * (0.5 + pulse * 0.5) * (1 + pull * 0.6);
        const waveY = band.y + Math.sin(elapsed * 0.00018 + band.tw) * 12;

        // 横方向にゆらぐオーロラ帯
        for (let xi = 0; xi < 3; xi++) {
          const xOff = (xi / 3) * w;
          const bw = w * 0.5;
          const g = ctx.createRadialGradient(xOff + bw * 0.5, waveY, 0, xOff + bw * 0.5, waveY, band.height);
          const h1 = band.hue;
          const h2 = band.hue + 0.08;
          g.addColorStop(0, `hsla(${h1 * 360|0},70%,75%,${a * 0.9})`);
          g.addColorStop(0.45, `hsla(${h2 * 360|0},65%,70%,${a * 0.5})`);
          g.addColorStop(1, `rgba(0,0,0,0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(xOff + bw * 0.5, waveY, bw * 0.8, band.height, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ────────────────────────────────────────
      // ② 星雲（背面のふわっとした光塊）
      // ────────────────────────────────────────
      for (const neb of nebulae) {
        neb.tw += dt * 0.001 * neb.tws;
        neb.x += neb.vx * n;
        neb.y += neb.vy * n;
        if (neb.x < -neb.r * 2) neb.x = w + neb.r;
        if (neb.x > w + neb.r * 2) neb.x = -neb.r;
        if (neb.y < -neb.r * 2) neb.y = h + neb.r;
        if (neb.y > h + neb.r * 2) neb.y = -neb.r;

        const pulse = Math.sin(neb.tw) * 0.5 + 0.5;
        const a = neb.baseA * (0.6 + pulse * 0.4) * (1 + pull * 0.4);
        const r = neb.r * (0.9 + pulse * 0.15);

        const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, r);
        g.addColorStop(0, `hsla(${neb.hue * 360|0},60%,78%,${a})`);
        g.addColorStop(0.4, `hsla(${(neb.hue + 0.06) * 360|0},55%,72%,${a * 0.55})`);
        g.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(neb.x, neb.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ────────────────────────────────────────
      // ③ 中央ベール（極薄の光膜）
      // ────────────────────────────────────────
      const veil = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.48);
      veil.addColorStop(0, "rgba(160,205,255,0.028)");
      veil.addColorStop(0.4, "rgba(140,170,255,0.016)");
      veil.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);

      // ────────────────────────────────────────
      // ④ 浮遊粒子（3層）
      // ────────────────────────────────────────
      for (const p of motes) {
        p.tw += dt * 0.001 * p.tws;
        p.x += (p.vx + driftX * 0.016) * n;
        p.y += (p.vy + driftY * 0.014) * n;

        // 吸い込み or 渦巻き（pulse時）
        if (pull > 0) {
          const vx = cx - p.x;
          const vy = cy - p.y;
          const dist = Math.hypot(vx, vy) + 1;
          const fall = 1 / (1 + dist * 0.005);
          const force = pull * 0.028 * fall;

          if (phase === "tap") {
            // 吸い込み
            p.x += vx * force * n;
            p.y += vy * force * n;
          } else {
            // reveal：外に押し出す + 軽い渦
            p.x -= vx * force * 0.5 * n;
            p.y -= vy * force * 0.5 * n;
            // 渦成分
            p.x += (-vy / dist) * force * 0.4 * n;
            p.y += (vx / dist) * force * 0.4 * n;
          }
        }

        // wrap
        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;
        if (p.y < -30) p.y = h + 30;
        if (p.y > h + 30) p.y = -30;

        const twinkle = 0.5 + Math.sin(p.tw) * 0.5;
        const alpha = p.baseA * (0.5 + twinkle * 0.5) * (1 + pull * 0.5);
        const r = p.r * (0.85 + twinkle * 0.18);

        // 奥の粒子は小さく青く、手前は明るくシアンに
        const hDeg = p.hue * 360;
        const lightness = [55, 68, 80][p.layer];

        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.5);
        gg.addColorStop(0, `hsla(${hDeg},${p.sat*100|0}%,${lightness}%,${alpha})`);
        gg.addColorStop(0.3, `hsla(${hDeg},60%,${lightness}%,${alpha * 0.7})`);
        gg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // ────────────────────────────────────────
      // ⑤ コンステレーション（近い粒子を極薄の線で結ぶ）
      //    パフォーマンスのためhand前層のみ、数を絞る
      // ────────────────────────────────────────
      if (!coarse) {
        const frontMotes = motes.filter(p => p.layer === 2);
        const DIST = 90;
        ctx.lineWidth = 0.4;
        for (let i = 0; i < frontMotes.length; i++) {
          for (let j = i + 1; j < frontMotes.length; j++) {
            const a = frontMotes[i], b = frontMotes[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d < DIST) {
              const alpha = (1 - d / DIST) * 0.045 * (1 + pull * 0.3);
              ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      // ────────────────────────────────────────
      // ⑥ 結晶きらめき（稀にきらっと光る十字）
      // ────────────────────────────────────────
      for (const c of crystals) {
        c.phase += dt * c.speed * 1000;
        c.x += c.vx * n;
        c.y += c.vy * n;
        if (c.x < 0) c.x = w; if (c.x > w) c.x = 0;
        if (c.y < 0) c.y = h; if (c.y > h) c.y = 0;

        const t = (Math.sin(c.phase) + 1) * 0.5;
        // 急上昇・緩降下（ちらっと光る質感）
        const glint = Math.pow(t, 4);
        if (glint < 0.02) continue;

        const a = glint * c.maxA * (1 + pull * 0.4);
        const size = c.size * (0.8 + glint * 0.5);
        const hDeg = c.hue * 360;

        // 中心の光点
        const gg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, size * 3.5);
        gg.addColorStop(0, `hsla(${hDeg},70%,95%,${a})`);
        gg.addColorStop(0.4, `hsla(${hDeg},60%,80%,${a * 0.5})`);
        gg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(c.x, c.y, size * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 十字の光芒（4方向）
        if (glint > 0.3) {
          const armLen = size * (4 + glint * 8);
          const armA = a * 0.6;
          ctx.lineWidth = size * 0.5;
          for (let angle = 0; angle < Math.PI; angle += Math.PI / 2) {
            const lx = ctx.createLinearGradient(
              c.x + Math.cos(angle) * armLen,
              c.y + Math.sin(angle) * armLen,
              c.x - Math.cos(angle) * armLen,
              c.y - Math.sin(angle) * armLen
            );
            lx.addColorStop(0, `rgba(255,255,255,0)`);
            lx.addColorStop(0.5, `hsla(${hDeg},80%,95%,${armA})`);
            lx.addColorStop(1, `rgba(255,255,255,0)`);
            ctx.strokeStyle = lx;
            ctx.beginPath();
            ctx.moveTo(c.x + Math.cos(angle) * armLen, c.y + Math.sin(angle) * armLen);
            ctx.lineTo(c.x - Math.cos(angle) * armLen, c.y - Math.sin(angle) * armLen);
            ctx.stroke();
          }
        }
      }

      // ────────────────────────────────────────
      // ⑦ 流星
      // ────────────────────────────────────────
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.t += dt;
        const k = clamp(s.t / s.life, 0, 1);
        s.x += s.vx * n;
        s.y += s.vy * n;

        // フェードイン/アウト
        const fadeIn = clamp(s.t / 80, 0, 1);
        const a = s.a * (1 - k) * fadeIn;

        const x2 = s.x - s.len * 0.92;
        const y2 = s.y - s.len * 0.26;
        const hDeg = s.hue * 360;

        const lg = ctx.createLinearGradient(s.x, s.y, x2, y2);
        lg.addColorStop(0, `hsla(${hDeg},75%,90%,${a})`);
        lg.addColorStop(0.35, `hsla(${hDeg},65%,80%,${a * 0.7})`);
        lg.addColorStop(0.7, `hsla(${hDeg},55%,75%,${a * 0.3})`);
        lg.addColorStop(1, "rgba(0,0,0,0)");

        ctx.strokeStyle = lg;
        ctx.lineWidth = s.len > 160 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (k >= 1 || s.x > w + 280 || s.y > h + 240) streaks.splice(i, 1);
      }

      ctx.globalCompositeOperation = "source-over";
    };

    /* ── tick ── */
    const tick = (now) => {
      raf = 0;
      if (reduced || !active || !pageVisible) return;

      const dt = now - last;
      last = now;
      elapsed += dt;

      acc += dt;
      if (acc < STEP) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const stepDt = acc;
      acc = 0;

      spawnStreak();
      draw(stepDt);

      raf = requestAnimationFrame(tick);
    };

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });
    resize();

    if (!reduced && active && pageVisible) raf = requestAnimationFrame(tick);
    if (reduced || !active || !pageVisible) draw(0);

    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, coarse, intensity, active, pageVisible]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.canvas} ${className}`}
      aria-hidden="true"
    />
  );
}