import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles, Environment } from "@react-three/drei";
import * as THREE from "three";
import styles from "./GlassRoom.module.css";
import SpaceDust from "../components/fx/SpaceDust";
/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
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

function useInView(ref, threshold = 0.08) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry.isIntersecting),
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return inView;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    on();
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/* ─────────────────────────────────────────────
   PRNG
───────────────────────────────────────────── */
function mulberry32(seed) {
  let t = seed;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ─────────────────────────────────────────────
   Geometry
───────────────────────────────────────────── */
function createShardGeometry(seed = 1) {
  const rand = mulberry32(seed * 9973);
  const isNeedle = rand() < 0.35;

  const w = isNeedle ? 0.05 + rand() * 0.10 : 0.16 + rand() * 0.34;
  const h = isNeedle ? 0.9 + rand() * 1.4 : 0.42 + rand() * 0.92;
  const t = 0.008 + rand() * 0.024;

  const skewX = (rand() - 0.5) * (isNeedle ? 0.14 : 0.34);
  const skewY = (rand() - 0.5) * 0.16;

  const a = [-w * 0.55, -h * 0.45, t * 0.5];
  const b = [w * 0.58, -h * 0.34, t * 0.5];
  const c = [skewX, h * 0.55, t * 0.5];

  const bsX = (rand() - 0.5) * 0.07;
  const bsY = (rand() - 0.5) * 0.07;

  const d = [a[0] + bsX, a[1] + bsY, -t * 0.5];
  const e = [b[0] + bsX, b[1] + bsY + skewY, -t * 0.5];
  const f = [c[0] + bsX, c[1] + bsY, -t * 0.5];

  const vertices = new Float32Array([...a, ...b, ...c, ...d, ...e, ...f]);
  const indices = [
    0, 1, 2, 5, 4, 3,
    0, 1, 4, 0, 4, 3,
    1, 2, 5, 1, 5, 4,
    2, 0, 3, 2, 3, 5,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ─────────────────────────────────────────────
   Configs（増量＋中心にも配置）
───────────────────────────────────────────── */
function createShardConfigs(count = 96) {
  const rand = mulberry32(20260503);

  // 中央にも増やす（全体の約16%を中心クラスタに）
  const CENTER_EXTRA = Math.min(18, Math.max(10, Math.floor(count * 0.16)));
  const peripheralCount = Math.max(0, count - CENTER_EXTRA);

  // 配置レンジ（少し広げる＆内側も寄せる）
  const XR_MIN = 0.55, XR_MAX = 6.05;
  const Y_MIN = -1.70, Y_MAX = 2.55;
  const Z_MIN = -4.05, Z_MAX = 4.05;

  // 破片同士の距離（少し詰める）
  const MIN_DIST = 0.62;

  // 中央の“超小さな”空白（テキストの呼吸だけ確保）
  const CENTER_VOID_R = 0.22;

  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const inCenterVoid = (x, y) => Math.sqrt(x * x + y * y) < CENTER_VOID_R;

  /* -------------------------
     1) Peripheral（左右に広い分布）
  ------------------------- */
  const HALF = Math.floor(peripheralCount / 2);
  const bases = [];

  for (let i = 0; i < HALF; i++) {
    let chosen = null;

    // バンドでばらけさせる（SANKOUっぽい面を作る）
    const band = i % 4;
    const bandMin = XR_MIN + (XR_MAX - XR_MIN) * (band / 4);
    const bandMax = XR_MIN + (XR_MAX - XR_MIN) * ((band + 1) / 4);

    const row = Math.floor(i / 4);
    const rows = Math.ceil(HALF / 4);
    const yBase = Y_MIN + (Y_MAX - Y_MIN) * (row / Math.max(1, rows - 1));

    for (let t = 0; t < 44; t++) {
      let x = bandMin + rand() * (bandMax - bandMin);
      x = Math.max(XR_MIN, x);

      let y = Math.max(
        Y_MIN,
        Math.min(Y_MAX, yBase + (rand() - 0.5) * 1.20)
      );

      let z = Z_MIN + rand() * (Z_MAX - Z_MIN);

      // 中心が空きすぎないよう“押し出し”は弱く
      if (inCenterVoid(x, y)) x += 0.35;

      const cand = { x, y, z };

      let ok = true;
      for (let k = 0; k < bases.length; k++) {
        if (dist2(cand, bases[k]) < (MIN_DIST * (0.82 + rand() * 0.45)) ** 2) {
          ok = false;
          break;
        }
      }

      if (ok) {
        chosen = cand;
        break;
      }
    }

    if (!chosen) {
      chosen = {
        x: XR_MIN + rand() * (XR_MAX - XR_MIN),
        y: Y_MIN + rand() * (Y_MAX - Y_MIN),
        z: Z_MIN + rand() * (Z_MAX - Z_MIN),
      };
      if (inCenterVoid(chosen.x, chosen.y)) chosen.x += 0.45;
    }

    bases.push(chosen);
  }

  const peripheralPoints = [];
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];

    // 右側
    peripheralPoints.push({ x: b.x, y: b.y, z: b.z });

    // 左側（ミラー＋微ズレ）
    peripheralPoints.push({
      x: -b.x + (rand() - 0.5) * 0.36,
      y: b.y + (rand() - 0.5) * 0.28,
      z: b.z + (rand() - 0.5) * 0.52,
    });
  }

  // peripheralCountが奇数だった場合の補完
  while (peripheralPoints.length < peripheralCount) {
    peripheralPoints.push({
      x: (rand() - 0.5) * 0.85,
      y: (rand() - 0.5) * 1.15,
      z: Z_MIN + rand() * (Z_MAX - Z_MIN),
    });
  }
  peripheralPoints.length = peripheralCount;

  /* -------------------------
     2) Center cluster（中心にも増やす）
     - ただしテキスト用に“微小な穴”だけ残す
  ------------------------- */
  const centerPoints = [];
  const centerMinR = 0.14;   // ど真ん中は避ける（呼吸）
  const centerMaxR = 0.95;   // 中央付近に集める

  const okCenter = (cand) => {
    if (inCenterVoid(cand.x, cand.y)) return false;

    // 中心同士の距離
    for (let i = 0; i < centerPoints.length; i++) {
      if (dist2(cand, centerPoints[i]) < (MIN_DIST * 0.58) ** 2) return false;
    }
    // peripheralとの距離（近すぎを少し避ける）
    for (let i = 0; i < peripheralPoints.length; i++) {
      if (dist2(cand, peripheralPoints[i]) < (MIN_DIST * 0.52) ** 2) return false;
    }
    return true;
  };

  for (let i = 0; i < CENTER_EXTRA; i++) {
    let chosen = null;

    for (let t = 0; t < 64; t++) {
      // 半径分布（中心寄りに出るよう sqrt）
      const rr = centerMinR + Math.sqrt(rand()) * (centerMaxR - centerMinR);
      const th = rand() * Math.PI * 2;

      const x = Math.cos(th) * rr + (rand() - 0.5) * 0.06;
      const y = Math.sin(th) * rr + (rand() - 0.5) * 0.06;
      const z = Z_MIN + rand() * (Z_MAX - Z_MIN);

      const cand = { x, y, z };
      if (okCenter(cand)) {
        chosen = cand;
        break;
      }
    }

    if (!chosen) {
      // 最後の逃げ（多少被ってもOKな救済）
      const th = rand() * Math.PI * 2;
      const rr = 0.55 + rand() * 0.35;
      chosen = { x: Math.cos(th) * rr, y: Math.sin(th) * rr, z: Z_MIN + rand() * (Z_MAX - Z_MIN) };
    }

    centerPoints.push(chosen);
  }

  /* -------------------------
     3) Mix points（中心を先に入れて、確実に“中央密度”を作る）
  ------------------------- */
  const points = [...centerPoints, ...peripheralPoints];

  // xの平均を0に寄せる（重心を戻す）
  const meanX = points.reduce((s, p) => s + p.x, 0) / Math.max(1, points.length);
  for (const p of points) p.x -= meanX;

  /* -------------------------
     4) Build items
  ------------------------- */
  const items = [];
  for (let i = 0; i < count; i++) {
    const p = points[i] ?? {
      x: (rand() - 0.5) * 1.6,
      y: (rand() - 0.5) * 2.0,
      z: Z_MIN + rand() * (Z_MAX - Z_MIN),
    };

    // 中央クラスタは「少し小さめ」を多めにして美しく密度を出す
    const isCenter = i < centerPoints.length;

    const r0 = rand();
    let scale;

    if (isCenter) {
      if (r0 < 0.78) scale = 0.30 + rand() * 0.62;
      else if (r0 < 0.96) scale = 0.72 + rand() * 0.62;
      else scale = 1.10 + rand() * 0.70;
    } else {
      if (r0 < 0.64) scale = 0.44 + rand() * 0.86;
      else if (r0 < 0.92) scale = 0.92 + rand() * 0.92;
      else scale = 1.55 + rand() * 1.15;
    }

    const hue = 0.56 + rand() * 0.10;
    const sat = 0.24 + rand() * 0.22;
    const lit = 0.68 + rand() * 0.24;
    const tint = new THREE.Color().setHSL(hue, sat, lit);

    const distFromCenter = Math.sqrt(p.x * p.x + p.y * p.y);

    items.push({
      id: i,
      seed: i + 1,
      px: p.x,
      py: p.y,
      pz: p.z,
      rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      scale,
      floatAmp: (isCenter ? 0.045 : 0.05) + rand() * (isCenter ? 0.16 : 0.20),
      floatSpeed: 0.22 + rand() * 0.70,
      driftAmp: 0.03 + rand() * 0.20,
      rotSpeed: 0.32 + rand() * 0.76,
      tint,
      hsl: { h: hue, s: sat, l: lit },
      entranceDelay: 220 + distFromCenter * 220 + rand() * 240,
    });
  }

  return items;
}

/* ─────────────────────────────────────────────
   Lights
───────────────────────────────────────────── */
function OrbitLight({ reduced }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current || reduced) return;
    const t = state.clock.elapsedTime;
    const orbit = t * 0.07;
    ref.current.position.x = Math.sin(orbit) * 4.6;
    ref.current.position.z = Math.cos(orbit) * 2.9 + 1.8;
    ref.current.position.y = 2.8 + Math.sin(orbit * 0.5) * 0.6;
    const warm = (Math.sin(t * 0.038) + 1) * 0.5;
    ref.current.color.setHSL(0.61 - warm * 0.07, 0.52, 0.88);
    ref.current.intensity = 24 + Math.sin(t * 0.092) * 5;
  });
  return (
    <pointLight
      ref={ref}
      position={[0, 2.8, 2.6]}
      color="#cfe3ff"
      intensity={26}
      distance={22}
    />
  );
}

function DeepGlows({ reduced }) {
  const r1 = useRef(),
    r2 = useRef(),
    r3 = useRef();
  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    if (r1.current) {
      r1.current.position.x = Math.sin(t * 0.052) * 1.9;
      r1.current.position.y = 0.55 + Math.cos(t * 0.038) * 0.6;
      r1.current.material.opacity = 0.055 + Math.sin(t * 0.17) * 0.018;
    }
    if (r2.current) {
      r2.current.position.x = Math.sin(t * 0.068 + 2.1) * 2.6;
      r2.current.position.y = 0.2 + Math.cos(t * 0.048) * 1.1;
      r2.current.material.opacity = 0.03 + Math.sin(t * 0.12 + 1.2) * 0.012;
    }
    if (r3.current) {
      r3.current.position.x = Math.sin(t * 0.042 + 4.2) * 1.6;
      r3.current.material.opacity = 0.018 + Math.sin(t * 0.21 + 0.8) * 0.007;
    }
  });
  return (
    <group>
      <mesh ref={r1} position={[0, 0.55, -4.5]}>
        <circleGeometry args={[4.2, 72]} />
        <meshBasicMaterial
          color="#2a59d9"
          transparent
          opacity={0.055}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={r2} position={[0, 0.2, -3.8]}>
        <circleGeometry args={[2.8, 64]} />
        <meshBasicMaterial
          color="#4488ff"
          transparent
          opacity={0.03}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={r3} position={[0, 1.0, -5.8]}>
        <circleGeometry args={[3.4, 64]} />
        <meshBasicMaterial
          color="#7733cc"
          transparent
          opacity={0.018}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────
   Shard
───────────────────────────────────────────── */
const ENTRANCE_DURATION = 2400;
const TMP_DIR = new THREE.Vector3();

function Shard({
  cfg,
  index,
  onTap,
  externalPulseRef,
  hoverStrengthRef,
  hoveredIndexRef,
  outPos,
  reduced,
  coarse,
}) {
  const groupRef = useRef(null);
  const materialRef = useRef(null);
  const glowRef = useRef(null);
  const edgeMatRef = useRef(null);

  const hovered = useRef(false);
  const iriColor = useRef(new THREE.Color());

  const geometry = useMemo(() => createShardGeometry(cfg.seed), [cfg.seed]);
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geometry, 18), [geometry]);

  const offset = useRef(new THREE.Vector3());
  const vel = useRef(new THREE.Vector3());
  const kick = useRef(new THREE.Vector3());
  const pulse = useRef(0);
  const born = useRef(Date.now());

  useEffect(() => {
    if (!externalPulseRef) return;
    externalPulseRef.current = (v = 1, dir = null, kickUp = 0) => {
      pulse.current = Math.max(pulse.current, v);
      if (dir) {
        vel.current.addScaledVector(dir, 0.55 * v);
        if (kickUp) vel.current.y += kickUp * v;
      } else {
        vel.current.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.22,
            0.06 + Math.random() * 0.12,
            (Math.random() - 0.5) * 0.18
          )
        );
      }
      kick.current.add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.14,
          0.03 + Math.random() * 0.08,
          (Math.random() - 0.5) * 0.12
        )
      );
    };
    return () => {
      externalPulseRef.current = null;
    };
  }, [externalPulseRef]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const age = Date.now() - born.current - cfg.entranceDelay;
    const raw = clamp01(age / ENTRANCE_DURATION);
    const entry = 1 - Math.pow(1 - raw, 5);

    const t = state.clock.elapsedTime * cfg.floatSpeed + cfg.seed * 0.75;
    const motionMul = reduced ? 0.35 : 1;

    pulse.current = Math.max(0, pulse.current - delta * 0.95);

    const hoverNear = hoverStrengthRef?.current ?? 0;
    const hoverHard = hovered.current ? 0.7 : 0;
    const total = pulse.current + hoverNear + hoverHard;

    const s = Math.sin(state.clock.elapsedTime * 0.55 + cfg.seed * 1.7);
    const glint = Math.pow(Math.max(0, s), 10);
    const hShift = Math.sin(state.clock.elapsedTime * 0.11 + cfg.seed * 0.82) * 0.08;

    iriColor.current.setHSL(
      cfg.hsl.h + hShift,
      cfg.hsl.s,
      Math.min(0.94, cfg.hsl.l + total * 0.09 + glint * 0.05)
    );

    vel.current.addScaledVector(kick.current, 0.85);
    kick.current.multiplyScalar(0.82);
    vel.current.multiplyScalar(0.86);
    offset.current.addScaledVector(vel.current, delta);
    offset.current.multiplyScalar(0.9);

    const nx = cfg.px + Math.sin(t * 0.9) * cfg.driftAmp * motionMul + offset.current.x;
    const ny = cfg.py + Math.sin(t * 1.25) * cfg.floatAmp * motionMul + offset.current.y;
    const nz = cfg.pz + Math.cos(t * 0.85) * cfg.driftAmp * 0.85 * motionMul + offset.current.z;

    groupRef.current.position.set(nx, ny, nz);
    if (outPos) outPos.set(nx, ny, nz);

    groupRef.current.scale.setScalar(
      cfg.scale *
        entry *
        (1 + hoverHard * 0.08 + hoverNear * 0.05 + pulse.current * 0.03 + glint * 0.02)
    );

    const rs = cfg.rotSpeed * motionMul;
    groupRef.current.rotation.x = cfg.rotation[0] + Math.sin(t * 0.55 * rs) * 0.22 + total * 0.22;
    groupRef.current.rotation.y = cfg.rotation[1] + Math.cos(t * 0.48 * rs) * 0.3 + total * 0.3;
    groupRef.current.rotation.z = cfg.rotation[2] + Math.sin(t * 0.72 * rs) * 0.24 + pulse.current * 0.12;

    if (materialRef.current) {
      materialRef.current.emissive.copy(iriColor.current);
      materialRef.current.emissiveIntensity = 0.06 + total * 0.34 + glint * 0.22;
      materialRef.current.opacity = (0.18 + total * 0.1 + glint * 0.06) * Math.max(0.12, entry);
      materialRef.current.roughness = (0.085 - hoverHard * 0.02 - hoverNear * 0.01) + (coarse ? 0.02 : 0);
      materialRef.current.envMapIntensity = 1.9 + total * 0.65 + glint * 0.35;
      materialRef.current.thickness = 0.85 + total * 0.15;
    }
    if (glowRef.current) {
      glowRef.current.material.color.copy(iriColor.current);
      glowRef.current.material.opacity = (0.022 + total * 0.14 + glint * 0.08) * Math.max(0.1, entry);
    }
    if (edgeMatRef.current) {
      edgeMatRef.current.color.copy(iriColor.current);
      edgeMatRef.current.opacity = (0.05 + total * 0.3 + glint * 0.16) * Math.max(0.1, entry);
    }
  });

  const tap = (e) => {
    e.stopPropagation();
    const p = e.point ?? groupRef.current?.position;
    if (p) onTap?.(p.x, p.y, p.z);
    pulse.current = 1;
    vel.current.add(new THREE.Vector3((Math.random() - 0.5) * 0.55, 0.22 + Math.random() * 0.32, (Math.random() - 0.5) * 0.45));
    kick.current.add(new THREE.Vector3(0, 0.1, 0));
  };

  return (
    <group
      ref={groupRef}
      scale={0}
      onPointerDown={tap}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        hoveredIndexRef.current = index;
        pulse.current = Math.max(pulse.current, 0.35);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        hovered.current = false;
        if (hoveredIndexRef.current === index) hoveredIndexRef.current = -1;
        document.body.style.cursor = "default";
      }}
    >
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          ref={materialRef}
          color={cfg.tint}
          transparent
          opacity={0.18}
          transmission={0.94}
          thickness={0.9}
          roughness={0.085}
          metalness={0.0}
          ior={1.16}
          reflectivity={1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.9}
          emissive={cfg.tint}
          emissiveIntensity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
          flatShading
        />
      </mesh>

      <mesh geometry={geometry} scale={[1.034, 1.034, 1.034]} ref={glowRef} raycast={() => null}>
        <meshBasicMaterial color={cfg.tint} transparent opacity={0.022} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <lineSegments geometry={edgesGeo} raycast={() => null}>
        <lineBasicMaterial ref={edgeMatRef} color="#cfe2ff" transparent opacity={0.1} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

/* ─────────────────────────────────────────────
   GlassField（既存の挙動は維持）
───────────────────────────────────────────── */
const LONG_PRESS_MS = 480;

function GlassField({ onFragmentTap, mountEl, coarse, reduced }) {
  // ✅ ガラス量（PC多め / SP控えめ / reduced控えめ）
  const shards = useMemo(() => {
    if (coarse) return createShardConfigs(78);
    if (reduced) return createShardConfigs(86);
    return createShardConfigs(96);
  }, [coarse, reduced]);

  const pulseRefs = useMemo(() => shards.map(() => ({ current: null })), [shards]);
  const hoverStrengthRefs = useMemo(() => shards.map(() => ({ current: 0 })), [shards]);

  const livePosRef = useRef(null);
  if (!livePosRef.current || livePosRef.current.length !== shards.length) {
    livePosRef.current = shards.map(() => new THREE.Vector3(999, 999, 999));
  }

  const hoveredIndexRef = useRef(-1);
  const { camera } = useThree();

  const mouse = useRef({ x: 0, y: 0 });
  const camSmooth = useRef({ x: 0, y: 0 });

  const scrollTarget = useRef({ x: 0, y: 0 });
  const scrollLook = useRef({ x: 0, y: 0 });

  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    x: 0,
    y: 0,
    pid: null,
  });
  const dragVel = useRef({ x: 0, y: 0 });
  const dragPrev = useRef({ x: 0, y: 0, ts: 0 });

  const longPress = useRef({
    timer: null,
    active: false,
    strength: 0,
    startX: 0,
    startY: 0,
  });

  const lastAction = useRef(Date.now());
  const lastAutoIdx = useRef(-1);

  const projVec = useRef(new THREE.Vector3());
  const projHover = useRef(new THREE.Vector3());

  const burstMeshRef = useRef();
  const burstMatRef = useRef();
  const burstState = useRef({ active: false, t: 0, pos: new THREE.Vector3() });

  useEffect(() => {
    const el = mountEl?.current;
    if (!el) return;

    const rectNorm = (clientX, clientY) => {
      const r = el.getBoundingClientRect();
      const x = ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      const y = -(((clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    };

    const cancelLongPress = () => {
      if (longPress.current.timer) {
        clearTimeout(longPress.current.timer);
        longPress.current.timer = null;
      }
      longPress.current.active = false;
    };

    const startLongPress = (clientX, clientY) => {
      cancelLongPress();
      longPress.current.startX = clientX;
      longPress.current.startY = clientY;
      longPress.current.timer = setTimeout(() => {
        longPress.current.active = true;
        longPress.current.strength = 0;
        for (let i = 0; i < shards.length; i++) {
          const delay = i * 18 + Math.random() * 40;
          setTimeout(() => {
            pulseRefs[i].current?.(0.45 + Math.random() * 0.3);
          }, delay);
        }
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (e) => {
      if (drag.current.active) return;
      const p = rectNorm(e.clientX, e.clientY);
      mouse.current.x = p.x;
      mouse.current.y = p.y;
      lastAction.current = Date.now();

      if (longPress.current.timer) {
        const dx = Math.abs(e.clientX - longPress.current.startX);
        const dy = Math.abs(e.clientY - longPress.current.startY);
        if (dx > 12 || dy > 12) cancelLongPress();
      }
    };

    const onPointerDown = (e) => {
      drag.current.active = true;
      drag.current.startX = e.clientX;
      drag.current.startY = e.clientY;
      drag.current.baseX = drag.current.x;
      drag.current.baseY = drag.current.y;
      drag.current.pid = e.pointerId ?? null;

      dragVel.current = { x: 0, y: 0 };
      dragPrev.current = { x: drag.current.x, y: drag.current.y, ts: e.timeStamp || performance.now() };

      try {
        if (drag.current.pid != null) el.setPointerCapture?.(drag.current.pid);
      } catch {}

      lastAction.current = Date.now();
      startLongPress(e.clientX, e.clientY);
    };

    const onPointerDrag = (e) => {
      if (!drag.current.active) return;

      const dxRaw = (e.clientX - drag.current.startX) / Math.max(1, window.innerWidth);
      const dyRaw = (e.clientY - drag.current.startY) / Math.max(1, window.innerHeight);

      if (Math.abs(dxRaw) * window.innerWidth > 10 || Math.abs(dyRaw) * window.innerHeight > 10) {
        cancelLongPress();
      }

      const nextX = Math.max(-0.9, Math.min(0.9, drag.current.baseX + dxRaw * 2.2));
      const nextY = Math.max(-0.5, Math.min(0.5, drag.current.baseY - dyRaw * 1.6));

      const now = e.timeStamp || performance.now();
      const dt = Math.max(16, now - dragPrev.current.ts);

      dragVel.current.x = Math.max(-2.4, Math.min(2.4, (nextX - dragPrev.current.x) / (dt / 1000)));
      dragVel.current.y = Math.max(-1.8, Math.min(1.8, (nextY - dragPrev.current.y) / (dt / 1000)));

      dragPrev.current = { x: nextX, y: nextY, ts: now };
      drag.current.x = nextX;
      drag.current.y = nextY;
      lastAction.current = Date.now();
    };

    const onPointerUp = () => {
      drag.current.active = false;
      cancelLongPress();
      try {
        if (drag.current.pid != null) el.releasePointerCapture?.(drag.current.pid);
      } catch {}
      drag.current.pid = null;
    };

    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerDrag, { passive: true });
    el.addEventListener("pointerup", onPointerUp, { passive: true });
    el.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      cancelLongPress();
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerDrag);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [mountEl, shards, pulseRefs]);

  useEffect(() => {
    const el = mountEl?.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;

      const p = clamp01((vh - r.top) / (vh + r.height));

      const x = (p - 0.5) * 1.4;
      const y = (0.5 - p) * 0.28;

      scrollTarget.current.x = Math.max(-0.85, Math.min(0.85, x));
      scrollTarget.current.y = Math.max(-0.4, Math.min(0.4, y));
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mountEl]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    const sk = 1 - Math.exp(-delta * 7.8);
    scrollLook.current.x += (scrollTarget.current.x - scrollLook.current.x) * sk;
    scrollLook.current.y += (scrollTarget.current.y - scrollLook.current.y) * sk;

    if (!drag.current.active) {
      drag.current.x = Math.max(-0.9, Math.min(0.9, drag.current.x + dragVel.current.x * delta));
      drag.current.y = Math.max(-0.5, Math.min(0.5, drag.current.y + dragVel.current.y * delta));
      dragVel.current.x *= Math.exp(-delta * 5.8);
      dragVel.current.y *= Math.exp(-delta * 5.8);

      const idle = Date.now() - lastAction.current;
      if (idle > 1400) {
        const k = 1 - Math.exp(-delta * 0.85);
        drag.current.x += (0 - drag.current.x) * k;
        drag.current.y += (0 - drag.current.y) * k;
      }
    }

    if (longPress.current.active) {
      longPress.current.strength = Math.min(1, longPress.current.strength + delta * 1.2);
    } else {
      longPress.current.strength = Math.max(0, longPress.current.strength - delta * 2.0);
    }

    const lookX = Math.max(-1, Math.min(1, mouse.current.x * 0.45 + scrollLook.current.x + drag.current.x));
    const lookY = Math.max(-0.85, Math.min(0.85, mouse.current.y * 0.3 + scrollLook.current.y + drag.current.y));

    const host = mountEl?.current;
    if (host) {
      host.style.setProperty("--mx", String(lookX));
      host.style.setProperty("--my", String(lookY));
    }

    const ampX = coarse ? 0.5 : 0.68;
    const ampY = coarse ? 0.28 : 0.38;
    const motionMul = reduced ? 0.4 : 1;

    camSmooth.current.x += (lookX * ampX * motionMul - camSmooth.current.x) * 0.036;
    camSmooth.current.y += (lookY * ampY * motionMul - camSmooth.current.y) * 0.036;

    const wobbleX = reduced ? 0 : Math.sin(t * 0.17) * 0.042;
    const wobbleY = reduced ? 0 : Math.cos(t * 0.13) * 0.024;

    camera.position.x = camSmooth.current.x + wobbleX;
    camera.position.y = 0.25 + camSmooth.current.y + wobbleY;
    camera.position.z = 6.6 + longPress.current.strength * 1.2;

    camera.lookAt(camSmooth.current.x * 0.12, 0.08 + camSmooth.current.y * 0.06, 0);
    camera.rotation.z = coarse || reduced ? 0 : camSmooth.current.x * -0.03;

    const hi = hoveredIndexRef.current;
    if (hi >= 0) {
      const hp = livePosRef.current[hi];
      projHover.current.copy(hp).project(camera);

      for (let i = 0; i < shards.length; i++) {
        const p = livePosRef.current[i];
        projVec.current.copy(p).project(camera);

        const dx = projVec.current.x - projHover.current.x;
        const dy = projVec.current.y - projHover.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const RADIUS = 0.22;
        const target = dist < RADIUS ? ((RADIUS - dist) / RADIUS) * 0.58 : 0;
        hoverStrengthRefs[i].current += (target - hoverStrengthRefs[i].current) * 0.12;
      }
    } else {
      for (let i = 0; i < shards.length; i++) {
        hoverStrengthRefs[i].current += (0 - hoverStrengthRefs[i].current) * 0.14;
      }
    }

    if (!reduced && Date.now() - lastAction.current > 9000) {
      lastAction.current = Date.now() - 5500;
      let idx;
      do idx = Math.floor(Math.random() * shards.length);
      while (idx === lastAutoIdx.current);
      lastAutoIdx.current = idx;
      pulseRefs[idx].current?.(0.32);
    }

    const bs = burstState.current;
    if (bs.active) {
      bs.t = Math.min(1, bs.t + delta * 1.8);
      if (bs.t >= 1) {
        bs.active = false;
        if (burstMeshRef.current) burstMeshRef.current.visible = false;
      } else {
        const eased = 1 - Math.pow(1 - bs.t, 3);
        if (burstMeshRef.current) {
          burstMeshRef.current.visible = true;
          burstMeshRef.current.position.copy(bs.pos);
          burstMeshRef.current.scale.setScalar(eased * 4.8);
        }
        if (burstMatRef.current) {
          burstMatRef.current.opacity = (1 - bs.t) * 0.3;
        }
      }
    }
  });

  const triggerBurst = (x, y, z) => {
    burstState.current = { active: true, t: 0, pos: new THREE.Vector3(x, y, z) };
    if (burstMeshRef.current) burstMeshRef.current.visible = false;
  };

  const triggerRipple = (centerIndex, cx, cy, cz) => {
    lastAction.current = Date.now();
    pulseRefs[centerIndex].current?.(1);

    const R = 1.85;
    for (let j = 0; j < shards.length; j++) {
      if (j === centerIndex) continue;

      const lp = livePosRef.current[j];
      const dx = lp.x - cx,
        dy = lp.y - cy,
        dz = lp.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (d < R) {
        const n = 1 - d / R;
        TMP_DIR.set(dx, dy * 0.85, dz).normalize();

        setTimeout(() => {
          pulseRefs[j].current?.(0.62 * n, TMP_DIR, 0.08);
        }, 40 + d * 120);
      }
    }
  };

  const sparkMul = reduced ? 0.55 : 1;

  return (
    <>
      <fog attach="fog" args={["#01030a", 9.5, 21]} />
      <Environment preset="night" background={false} />
      <ambientLight intensity={0.26} />
      <OrbitLight reduced={reduced} />
      <pointLight position={[-3.9, 0.9, -2.2]} color="#5a8fff" intensity={13} distance={15} />
      <pointLight position={[3.2, 1.4, -1.8]} color="#9ac0ff" intensity={11} distance={14} />
      <pointLight position={[0, -2.6, 1.3]} color="#0f1e4a" intensity={7} distance={12} />
      <DeepGlows reduced={reduced} />

      <Sparkles count={Math.floor((coarse ? 90 : 160) * sparkMul)} scale={[16, 9, 12]} size={0.9} speed={0.16} opacity={0.26} color="#9ec0ff" />
      <Sparkles count={Math.floor((coarse ? 40 : 70) * sparkMul)} scale={[22, 11, 9]} size={0.55} speed={0.09} opacity={0.14} color="#6e8bd4" />
      <Sparkles count={Math.floor((coarse ? 18 : 32) * sparkMul)} scale={[8, 5, 6]} size={2.4} speed={0.04} opacity={0.05} color="#c8d8ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.95, 0]}>
        <circleGeometry args={[14, 80]} />
        <meshBasicMaterial color="#050710" transparent opacity={0.1} depthWrite={false} />
      </mesh>

      <mesh ref={burstMeshRef} visible={false}>
        <ringGeometry args={[0.72, 1.02, 72]} />
        <meshBasicMaterial ref={burstMatRef} color="#b4cfff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <group>
        {shards.map((cfg, i) => (
          <Shard
            key={cfg.id}
            cfg={cfg}
            index={i}
            externalPulseRef={pulseRefs[i]}
            hoverStrengthRef={hoverStrengthRefs[i]}
            hoveredIndexRef={hoveredIndexRef}
            outPos={livePosRef.current[i]}
            reduced={reduced}
            coarse={coarse}
            onTap={(x, y, z) => {
              triggerBurst(x, y, z);
              triggerRipple(i, x, y, z);
              onFragmentTap?.();
            }}
          />
        ))}
      </group>
    </>
  );
}

/* ─────────────────────────────────────────────
   Export
───────────────────────────────────────────── */
export default function GlassRoom({ onFragmentTap, bg = "/images/glass-room-bg.png" }) {
  const mountRef = useRef(null);
  const coarse = useCoarsePointer();
  const reduced = useReducedMotion();
  const inView = useInView(mountRef, 0.08);
  const pageVisible = usePageVisible();
  const active = inView && pageVisible;

  const dpr = reduced ? [1, 1.1] : coarse ? [1, 1.25] : [1, 1.8];

  return (
    <div ref={mountRef} className={styles.wrap} style={{ "--bg": `url(${bg})` }}>
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.aurora} aria-hidden="true" />

      <Canvas
        className={styles.canvas}
        frameloop={active ? "always" : "never"}
        dpr={dpr}
        camera={{ position: [0, 0.25, 6.6], fov: 38 }}
        gl={{
          antialias: !coarse && !reduced,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#000000"), 0);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
          gl.physicallyCorrectLights = true;
        }}
      >
        <GlassField onFragmentTap={onFragmentTap} mountEl={mountRef} coarse={coarse} reduced={reduced} />
      </Canvas>
<SpaceDust active={active} intensity={coarse ? 0.85 : 1.0} />
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.chromatic} aria-hidden="true" />
    </div>
  );
}