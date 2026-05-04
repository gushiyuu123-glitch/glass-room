import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./CenterWord.module.css";

const BLANK = "\u200B";
const NBSP = "\u00A0";
const MAX_ANIM_CHARS = 120;

function isBlankLike(v) {
  if (v == null) return true;
  const s = String(v).replaceAll(BLANK, "").trim();
  return s.length === 0;
}

function makeId() {
  return (
    crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createDust(rand, count = 4) {
  return Array.from({ length: count }, (_, i) => {
    const angle = rand() * Math.PI * 2;
    const dist = 18 + rand() * 64;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.78;

    return {
      key: `dust_${i}_${Math.round(dx)}_${Math.round(dy)}`,
      dx,
      dy,
      size: 1 + rand() * 2.8,
      delay: rand() * 180,
      dur: 900 + rand() * 520,
      blur: 0.4 + rand() * 1.2,
      opacity: 0.28 + rand() * 0.5,
    };
  });
}

function buildCharFX(text, seedKey) {
  const chars = Array.from(text ?? "");
  const rand = mulberry32(hashString(seedKey));

  const fx = [];
  let visibleIndex = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === "\n") {
      fx.push({ type: "br", key: `br_${i}` });
      continue;
    }

    const isSpace = ch === " " || ch === "\t";
    const shown = isSpace ? NBSP : ch;
    const animate = !isSpace && visibleIndex < MAX_ANIM_CHARS;

    const angle = rand() * Math.PI * 2;
    const dist = animate ? 36 + rand() * 58 : 0;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.74;
    const rot = animate ? (rand() * 2 - 1) * 9 : 0;
    const delay = animate ? visibleIndex * 18 + rand() * 110 : 0;
    const blur = animate ? 0.8 + rand() * 1.2 : 0;
    const scale = animate ? 0.88 + rand() * 0.14 : 1;

    fx.push({
      type: "ch",
      key: `ch_${i}`,
      ch: shown,
      animate,
      dx,
      dy,
      rot,
      delay,
      blur,
      scale,
      dust: animate ? createDust(rand, 5) : [],
    });

    if (!isSpace) visibleIndex++;
  }

  return {
    fx,
    authorDelay: Math.min(visibleIndex * 18 + 420, 1400),
  };
}

export default function CenterWord({ text, quote }) {
  const incoming = quote ?? { text: text ?? "", author: "" };

  const [stack, setStack] = useState(() => [
    {
      id: makeId(),
      text: incoming.text ?? "",
      author: incoming.author ?? "",
    },
  ]);

  const [silent, setSilent] = useState(false);

  const lastRef = useRef({
    text: incoming.text,
    author: incoming.author,
  });

  useEffect(() => {
    if (
      incoming.text === lastRef.current.text &&
      (incoming.author ?? "") === (lastRef.current.author ?? "")
    ) {
      return;
    }

    lastRef.current = {
      text: incoming.text,
      author: incoming.author ?? "",
    };

    if (isBlankLike(incoming.text)) {
      setSilent(true);
      return;
    }

    setSilent(false);

    setStack((prev) => {
      const cur = prev?.[0] ?? { text: "", author: "" };

      if (
        cur.text === incoming.text &&
        (cur.author ?? "") === (incoming.author ?? "")
      ) {
        return prev;
      }

      return [
        {
          id: makeId(),
          text: incoming.text ?? "",
          author: incoming.author ?? "",
        },
        ...prev,
      ].slice(0, 2);
    });
  }, [incoming.text, incoming.author]);

  const current = stack[0];
  const previous = stack[1];

  const currentFx = useMemo(() => {
    if (!current) return { fx: [], authorDelay: 320 };
    return buildCharFX(current.text, `${current.id}_${current.text}`);
  }, [current]);

  return (
    <div
      className={`${styles.wrap} ${silent ? styles.isSilent : ""}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {previous && (
        <figure key={previous.id} className={`${styles.word} ${styles.previous}`}>
          <blockquote className={styles.quote}>{previous.text}</blockquote>
          {!!previous.author && (
            <figcaption className={styles.author}>— {previous.author}</figcaption>
          )}
        </figure>
      )}

      {current && (
        <figure key={current.id} className={`${styles.word} ${styles.current}`}>
          <blockquote className={styles.quote} aria-label={current.text}>
            {currentFx.fx.map((item) => {
              if (item.type === "br") return <br key={item.key} />;

              if (!item.animate) {
                return (
                  <span key={item.key} className={styles.charStatic}>
                    {item.ch}
                  </span>
                );
              }

              return (
                <span
                  key={item.key}
                  className={styles.charShell}
                  style={{
                    "--char-dx": `${item.dx}px`,
                    "--char-dy": `${item.dy}px`,
                    "--char-rot": `${item.rot}deg`,
                    "--char-delay": `${item.delay}ms`,
                    "--char-blur": `${item.blur}px`,
                    "--char-scale": item.scale,
                  }}
                >
                  {item.dust.map((d) => (
                    <span
                      key={d.key}
                      className={styles.dust}
                      style={{
                        "--dust-dx": `${d.dx}px`,
                        "--dust-dy": `${d.dy}px`,
                        "--dust-size": `${d.size}px`,
                        "--dust-delay": `${item.delay + d.delay}ms`,
                        "--dust-dur": `${d.dur}ms`,
                        "--dust-blur": `${d.blur}px`,
                        "--dust-opacity": d.opacity,
                      }}
                    />
                  ))}

                  <span className={styles.charGlow} aria-hidden="true" />

                  <span className={styles.charCore}>{item.ch}</span>
                </span>
              );
            })}
          </blockquote>

          {!!current.author && (
            <figcaption
              className={styles.author}
              style={{ "--author-delay": `${currentFx.authorDelay}ms` }}
            >
              — {current.author}
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
}