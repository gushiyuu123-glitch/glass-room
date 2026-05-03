// src/scenes/GlassRoom.jsx
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import styles from "./GlassRoom.module.css";

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
   Geometry — 三角形 65% / 針型 35%
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
   Configs — 分散＆左右バランス（中央に余白）
───────────────────────────────────────────── */
function createShardConfigs(count = 56) {
  const rand = mulberry32(20260503);

  const HALF = Math.floor(count / 2);
  const CENTER_VOID_R = 1.28;
  const MIN_DIST = 0.78;

  const XR_MIN = 1.05;
  const XR_MAX = 5.55;

  const Y_MIN = -1.55;
  const Y_MAX = 2.35;

  const Z_MIN = -3.8;
  const Z_MAX = 3.8;

  const bases = [];

  const dist2 = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const inCenterVoid = (x, y) => Math.sqrt(x * x + y * y) < CENTER_VOID_R;

  for (let i = 0; i < HALF; i++) {
    let chosen = null;

    const band = i % 4;
    const bandMin = XR_MIN + (XR_MAX - XR_MIN) * (band / 4);
    const bandMax = XR_MIN + (XR_MAX - XR_MIN) * ((band + 1) / 4);

    const row = Math.floor(i / 4);
    const rows = Math.ceil(HALF / 4);
    const yBase = Y_MIN + (Y_MAX - Y_MIN) * (row / Math.max(1, rows - 1));

    const tries = 36;
    for (let t = 0; t < tries; t++) {
      let x = bandMin + rand() * (bandMax - bandMin);
      x = Math.max(XR_MIN, x);

      let y = yBase + (rand() - 0.5) * 1.15;
      y = Math.max(Y_MIN, Math.min(Y_MAX, y));

      let z = Z_MIN + rand() * (Z_MAX - Z_MIN);

      if (inCenterVoid(x, y)) x += 0.9;

      const cand = { x, y, z };

      let ok = true;
      for (let k = 0; k < bases.length; k++) {
        const need = MIN_DIST * (0.78 + rand() * 0.55);
        if (dist2(cand, bases[k]) < need * need) {
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
      if (inCenterVoid(chosen.x, chosen.y)) chosen.x += 1.0;
    }

    bases.push(chosen);
  }

  const points = [];
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];

    points.push({ x: b.x, y: b.y, z: b.z });
    points.push({
      x: -b.x + (rand() - 0.5) * 0.34,
      y: b.y + (rand() - 0.5) * 0.26,
      z: b.z + (rand() - 0.5) * 0.46,
    });
  }

  if (points.length < count) {
    points.push({
      x: (rand() - 0.5) * 0.6,
      y: (rand() - 0.5) * 0.9,
      z: Z_MIN + rand() * (Z_MAX - Z_MIN),
    });
  }

  const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
  for (const p of points) p.x -= meanX;

  const items = [];
  for (let i = 0; i < count; i++) {
    const p = points[i];

    const r0 = rand();
    let scale;
    if (r0 < 0.64) scale = 0.44 + rand() * 0.86;
    else if (r0 < 0.92) scale = 0.92 + rand() * 0.92;
    else scale = 1.55 + rand() * 1.15;

    const floatAmp = 0.05 + rand() * 0.20;
    const floatSpeed = 0.22 + rand() * 0.70;
    const driftAmp = 0.03 + rand() * 0.20;
    const rotSpeed = 0.32 + rand() * 0.76;

    const hue = 0.56 + rand() * 0.10;
    const sat = 0.24 + rand() * 0.22;
    const lit = 0.68 + rand() * 0.24;
    const tint = new THREE.Color().setHSL(hue, sat, lit);

    const distFromCenter = Math.sqrt(p.x * p.x + p.y * p.y);
    const entranceDelay = 240 + distFromCenter * 240 + rand() * 220;

    items.push({
      id: i,
      seed: i + 1,
      px: p.x,
      py: p.y,
      pz: p.z,
      rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      scale,
      floatAmp,
      floatSpeed,
      driftAmp,
      rotSpeed,
      tint,
      hsl: { h: hue, s: sat, l: lit },
      entranceDelay,
    });
  }

  return items;
}

/* ─────────────────────────────────────────────
   OrbitLight
───────────────────────────────────────────── */
function OrbitLight() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
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

/* ─────────────────────────────────────────────
   DeepGlows
───────────────────────────────────────────── */
function DeepGlows() {
  const r1 = useRef(),
    r2 = useRef(),
    r3 = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (r1.current) {
      r1.current.position.x = Math.sin(t * 0.052) * 1.9;
      r1.current.position.y = 0.55 + Math.cos(t * 0.038) * 0.6;
      r1.current.material.opacity = 0.055 + Math.sin(t * 0.17) * 0.018;
    }
    if (r2.current) {
      r2.current.position.x = Math.sin(t * 0.068 + 2.1) * 2.6;
      r2.current.position.y = 0.2 + Math.cos(t * 0.048) * 1.1;
      r2.current.material.opacity = 0.030 + Math.sin(t * 0.12 + 1.2) * 0.012;
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
          opacity={0.030}
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
   ✅ hover中心を「Raycast一致」にする（誤爆しない）
   ✅ glow/edgeはraycast無効（誤タップ防止）
   ✅ outPos に “今の実座標” を書き込む（rippleも正確に）
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

    pulse.current = Math.max(0, pulse.current - delta * 0.95);

    const hoverNear = hoverStrengthRef?.current ?? 0; // ← GlassFieldが制御
    const hoverHard = hovered.current ? 0.70 : 0;
    const total = pulse.current + hoverNear + hoverHard;

    const hShift =
      Math.sin(state.clock.elapsedTime * 0.11 + cfg.seed * 0.82) * 0.08;

    iriColor.current.setHSL(
      cfg.hsl.h + hShift,
      cfg.hsl.s,
      Math.min(0.94, cfg.hsl.l + total * 0.09)
    );

    vel.current.addScaledVector(kick.current, 0.85);
    kick.current.multiplyScalar(0.82);

    vel.current.multiplyScalar(0.86);
    offset.current.addScaledVector(vel.current, delta);
    offset.current.multiplyScalar(0.90);

    const nx =
      cfg.px + Math.sin(t * 0.90) * cfg.driftAmp + offset.current.x;
    const ny =
      cfg.py + Math.sin(t * 1.25) * cfg.floatAmp + offset.current.y;
    const nz =
      cfg.pz + Math.cos(t * 0.85) * cfg.driftAmp * 0.85 + offset.current.z;

    groupRef.current.position.set(nx, ny, nz);

    // ✅ “今の実座標”を共有（hover/ripple精度が上がる）
    if (outPos) outPos.set(nx, ny, nz);

    groupRef.current.scale.setScalar(
      cfg.scale *
        entry *
        (1 + hoverHard * 0.08 + hoverNear * 0.05 + pulse.current * 0.03)
    );

    const rs = cfg.rotSpeed;
    groupRef.current.rotation.x =
      cfg.rotation[0] + Math.sin(t * 0.55 * rs) * 0.22 + total * 0.22;
    groupRef.current.rotation.y =
      cfg.rotation[1] + Math.cos(t * 0.48 * rs) * 0.30 + total * 0.30;
    groupRef.current.rotation.z =
      cfg.rotation[2] + Math.sin(t * 0.72 * rs) * 0.24 + pulse.current * 0.12;

    if (materialRef.current) {
      materialRef.current.emissive.copy(iriColor.current);
      materialRef.current.emissiveIntensity = 0.06 + total * 0.34;
      materialRef.current.opacity =
        (0.18 + total * 0.10) * Math.max(0.12, entry);

      materialRef.current.roughness =
        0.085 - hoverHard * 0.02 - hoverNear * 0.01;
      materialRef.current.envMapIntensity = 1.6 + total * 0.55;
    }
    if (glowRef.current) {
      glowRef.current.material.color.copy(iriColor.current);
      glowRef.current.material.opacity =
        (0.030 + total * 0.16) * Math.max(0.10, entry);
    }
    if (edgeMatRef.current) {
      edgeMatRef.current.color.copy(iriColor.current);
      edgeMatRef.current.opacity =
        (0.06 + total * 0.34) * Math.max(0.10, entry);
    }
  });

  const tap = (e) => {
    e.stopPropagation();

    // ✅ Raycast一致の point（world座標）を使う
    const p = e.point ?? groupRef.current?.position;
    if (p) onTap?.(p.x, p.y, p.z);

    pulse.current = 1;
    vel.current.add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.55,
        0.22 + Math.random() * 0.32,
        (Math.random() - 0.5) * 0.45
      )
    );
    kick.current.add(new THREE.Vector3(0, 0.10, 0));
  };

  return (
    <group
      ref={groupRef}
      scale={0}
      onPointerDown={tap}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        hoveredIndexRef.current = index; // ✅ hover中心は“Raycast一致”
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
      {/* 本体：raycast対象 */}
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          ref={materialRef}
          color={cfg.tint}
          transparent
          opacity={0.18}
          transmission={0.92}
          thickness={0.90}
          roughness={0.085}
          metalness={0.0}
          ior={1.16}
          reflectivity={1}
          clearcoat={1}
          clearcoatRoughness={0.10}
          envMapIntensity={1.6}
          emissive={cfg.tint}
          emissiveIntensity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
          flatShading
        />
      </mesh>

      {/* glow：見せるけどraycast無効 */}
      <mesh
        geometry={geometry}
        scale={[1.034, 1.034, 1.034]}
        ref={glowRef}
        raycast={() => null}
      >
        <meshBasicMaterial
          color={cfg.tint}
          transparent
          opacity={0.030}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* edge：raycast無効 */}
      <lineSegments geometry={edgesGeo} raycast={() => null}>
        <lineBasicMaterial
          ref={edgeMatRef}
          color="#cfe2ff"
          transparent
          opacity={0.10}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/* ─────────────────────────────────────────────
   GlassField
   ✅ hoverNearは「hoverされた破片」を中心に広げる（mouse中心はやめる）
   ✅ rippleは“今の実座標”で距離計算（ズレない）
   ✅ ぴかーん保持
───────────────────────────────────────────── */
function GlassField({ onFragmentTap, mountEl }) {
  const shards = useMemo(() => createShardConfigs(56), []);
  const pulseRefs = useMemo(() => shards.map(() => ({ current: null })), [shards]);
  const hoverStrengthRefs = useMemo(() => shards.map(() => ({ current: 0 })), [shards]);

  // ✅ 各破片の“今の実座標”
  const livePosRef = useRef(null);
  if (!livePosRef.current) {
    livePosRef.current = shards.map(() => new THREE.Vector3(999, 999, 999));
  }

  // ✅ hoverの中心（Raycast一致）
  const hoveredIndexRef = useRef(-1);

  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const camSmooth = useRef({ x: 0, y: 0 });

  const lastAction = useRef(Date.now());
  const lastAutoIdx = useRef(-1);

  const projVec = useRef(new THREE.Vector3());
  const projHover = useRef(new THREE.Vector3());

  const burstMeshRef = useRef();
  const burstMatRef = useRef();
  const burstState = useRef({ active: false, t: 0, pos: new THREE.Vector3() });

  useEffect(() => {
    const el = mountEl?.current || document.documentElement;
    const setVars = () => {
      el.style.setProperty("--mx", String(mouse.current.x));
      el.style.setProperty("--my", String(mouse.current.y));
    };

    const onMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
      lastAction.current = Date.now();
      setVars();
    };
    const onTouch = (e) => {
      if (!e.touches?.[0]) return;
      mouse.current.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      lastAction.current = Date.now();
      setVars();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    setVars();

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
    };
  }, [mountEl]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // 空間（カメラ）
    camSmooth.current.x += (mouse.current.x * 0.60 - camSmooth.current.x) * 0.036;
    camSmooth.current.y += (mouse.current.y * 0.28 - camSmooth.current.y) * 0.036;

    camera.position.x = camSmooth.current.x + Math.sin(t * 0.17) * 0.042;
    camera.position.y = 0.25 + camSmooth.current.y + Math.cos(t * 0.13) * 0.024;
    camera.lookAt(0, 0.08, 0);

    // ✅ hoverNear：hover中心からだけ広げる（mouse中心は撤廃）
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

        // 中心を強め、周辺は軽く
        const RADIUS = 0.22;
        const target = dist < RADIUS ? ((RADIUS - dist) / RADIUS) * 0.58 : 0;

        hoverStrengthRefs[i].current += (target - hoverStrengthRefs[i].current) * 0.12;
      }
    } else {
      // hoverしてない時は全部沈める（誤反応ゼロ）
      for (let i = 0; i < shards.length; i++) {
        hoverStrengthRefs[i].current += (0 - hoverStrengthRefs[i].current) * 0.14;
      }
    }

    // 放置時の微オート
    if (Date.now() - lastAction.current > 9000) {
      lastAction.current = Date.now() - 5500;
      let idx;
      do idx = Math.floor(Math.random() * shards.length);
      while (idx === lastAutoIdx.current);
      lastAutoIdx.current = idx;
      pulseRefs[idx].current?.(0.32);
    }

    // ぴかーん（バーストリング）
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
          burstMatRef.current.opacity = (1 - bs.t) * 0.30;
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

    // ✅ “今の実座標”で距離計算（ズレない）
    for (let j = 0; j < shards.length; j++) {
      if (j === centerIndex) continue;

      const lp = livePosRef.current[j]; // world pos (live)
      const dx = lp.x - cx;
      const dy = lp.y - cy;
      const dz = lp.z - cz;

      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (d < R) {
        const n = 1 - d / R;
        const strength = 0.62 * n;

        TMP_DIR.set(dx, dy * 0.85, dz).normalize();

        const delay = 40 + d * 120;
        window.setTimeout(() => {
          pulseRefs[j].current?.(strength, TMP_DIR, 0.08);
        }, delay);
      }
    }
  };

  return (
    <>
      <fog attach="fog" args={["#01030a", 9.5, 21]} />

      <ambientLight intensity={0.26} />
      <OrbitLight />
      <pointLight position={[-3.9, 0.9, -2.2]} color="#5a8fff" intensity={13} distance={15} />
      <pointLight position={[3.2, 1.4, -1.8]} color="#9ac0ff" intensity={11} distance={14} />
      <pointLight position={[0, -2.6, 1.3]} color="#0f1e4a" intensity={7} distance={12} />

      <DeepGlows />

      <Sparkles count={140} scale={[16, 9, 12]} size={0.9} speed={0.16} opacity={0.26} color="#9ec0ff" />
      <Sparkles count={60} scale={[22, 11, 9]} size={0.55} speed={0.09} opacity={0.14} color="#6e8bd4" />
      <Sparkles count={28} scale={[8, 5, 6]} size={2.4} speed={0.04} opacity={0.05} color="#c8d8ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.95, 0]}>
        <circleGeometry args={[14, 80]} />
        <meshBasicMaterial color="#050710" transparent opacity={0.10} depthWrite={false} />
      </mesh>

      {/* ぴかーん */}
      <mesh ref={burstMeshRef} visible={false}>
        <ringGeometry args={[0.72, 1.02, 72]} />
        <meshBasicMaterial
          ref={burstMatRef}
          color="#b4cfff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
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

  return (
    <div ref={mountRef} className={styles.wrap} style={{ "--bg": `url(${bg})` }}>
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.aurora} aria-hidden="true" />

      <Canvas
        className={styles.canvas}
        dpr={[1, 1.8]}
        camera={{ position: [0, 0.25, 6.6], fov: 38 }}
        gl={{
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#000000"), 0);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
        }}
      >
        <GlassField onFragmentTap={onFragmentTap} mountEl={mountRef} />
      </Canvas>

      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.chromatic} aria-hidden="true" />
    </div>
  );
}