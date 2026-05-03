import { useEffect, useRef, useState } from "react";
import styles from "./CenterWord.module.css";

const BLANK = "\u200B";

function isBlankLike(v) {
  if (v == null) return true;
  const s = String(v).replaceAll(BLANK, "").trim();
  return s.length === 0;
}

export default function CenterWord({ text }) {
  const [stack, setStack] = useState(() => [
    { id: crypto?.randomUUID?.() ?? String(Date.now()), text: text ?? "" },
  ]);

  const [silent, setSilent] = useState(false);
  const lastTextRef = useRef(text);

  useEffect(() => {
    // StrictModeの二重発火対策 + 同一テキスト連続の無駄更新防止
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;

    // ✅ “間”のための空白が来たら、stackは更新しない（=言葉を積まない）
    if (isBlankLike(text)) {
      setSilent(true);
      return;
    }

    setSilent(false);

    setStack((prev) => {
      const current = prev?.[0]?.text ?? "";
      if (current === text) return prev;

      const next = [
        { id: crypto?.randomUUID?.() ?? String(Date.now()), text },
        ...prev,
      ];
      return next.slice(0, 2);
    });
  }, [text]);

  const current = stack[0];
  const previous = stack[1];

  return (
    <div
      className={`${styles.wrap} ${silent ? styles.isSilent : ""}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {previous && (
        <p key={previous.id} className={`${styles.word} ${styles.previous}`}>
          {previous.text}
        </p>
      )}

      {current && (
        <p key={current.id} className={`${styles.word} ${styles.current}`}>
          {current.text}
        </p>
      )}
    </div>
  );
}