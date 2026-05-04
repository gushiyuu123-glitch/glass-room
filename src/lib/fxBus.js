// src/lib/fxBus.js
const bus = new EventTarget();

export const FX = {
  PULSE: "fx:pulse",
};

/**
 * emitFx(FX.PULSE, { phase, strength, duration, centerY })
 * phase: "tap" | "reveal"
 * strength: 0..1.6
 * duration: ms
 * centerY: 0..1（中心のY位置。CenterWordに寄せるなら 0.46 推奨）
 */
export function emitFx(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * const off = onFx(FX.PULSE, (detail)=>{})
 * off() で解除
 */
export function onFx(type, handler) {
  const fn = (e) => handler?.(e?.detail ?? {});
  bus.addEventListener(type, fn);
  return () => bus.removeEventListener(type, fn);
}