import { useCallback, useEffect, useRef, useState } from "react";
import GlassRoom from "./scenes/GlassRoom";
import CenterWord from "./components/ui/CenterWord";
import styles from "./App.module.css";

/**
 * 方針：
 * - 画面には作者名を出さない（没入優先）
 * - でもメタ（source）は内部に持つ（将来のクレジット用）
 */
const WORDS = [
  // ── アドラー系（課題・共同体感覚・勇気の方向）
  { text: "評価は、相手に返していい。", source: "Adler-ish" },
  { text: "嫌われる勇気は、進む勇気だ。", source: "Adler-ish" },
  { text: "変えるのは他人じゃない。自分だ。", source: "Adler-ish" },
  { text: "逃げるな。引くのは戦略だ。", source: "Adler-ish" },
  { text: "目的がある。だから苦しい。", source: "Adler-ish" },
  { text: "承認より、貢献の方が強い。", source: "Adler-ish" },

  // ── 釈迦・仏教系（執着・無常・手放し）
  { text: "握るほど、失うものが増える。", source: "Buddha-ish" },
  { text: "変わる。だから、今がある。", source: "Buddha-ish" },
  { text: "執着は、痛みの根になる。", source: "Buddha-ish" },
  { text: "足りないのではない。欲が増える。", source: "Buddha-ish" },
  { text: "怒りは、まず自分を焼く。", source: "Buddha-ish" },
  { text: "持たない強さが、残る。", source: "Buddha-ish" },

  // ── 厳しめ（背中を押すやつ）
  { text: "できない理由は、才能じゃない。", source: "Hardline" },
  { text: "傷があるから、深くなる。", source: "Hardline" },
  { text: "続けた者だけが、景色を変える。", source: "Hardline" },
  { text: "迷いは、止まっていない証拠だ。", source: "Hardline" },
  { text: "失う前に、手放せるか。", source: "Hardline" },
  { text: "壊れたのではない。更新された。", source: "Hardline" },

  // ── 余白（決めなかった／言わなかった／宙づり）
  { text: "言わなかったことが、残っている。", source: "Void" },
  { text: "選ばなかった方が、時々疼く。", source: "Void" },
  { text: "答えを急ぐほど、遠ざかる。", source: "Void" },
  { text: "説明できないままでも、進める。", source: "Void" },
  { text: "終わりは、いつも無音で来る。", source: "Void" },
  { text: "空白は、弱さじゃない。", source: "Void" },

  // ── 手放し（軽さ・諦めではない離脱）
  { text: "勝たなくても、価値は残る。", source: "Release" },
  { text: "わかってもらうのを、やめた。", source: "Release" },
  { text: "正しさより、軽くなる方へ。", source: "Release" }, // ←「呼吸」避けた
  { text: "期待を降ろすと、目が開く。", source: "Release" },
  { text: "証明しなくていい日が来る。", source: "Release" },
  { text: "それでも、朝は来る。", source: "Release" },
];

// Claudeの“間”
const GAP_CLEAR_MS = 180; // 0.18s：中央は何も起きていない
const WORD_SHOW_MS = 380; // 0.38s：言葉が現れる

// 見えないけど「空白」を保つ（CenterWordのレイアウト崩れ対策）
const BLANK = "\u200B";

export default function App() {
  const [word, setWord] = useState("ひとつ、触れてみてください。");

  const clearTimerRef = useRef(0);
  const showTimerRef = useRef(0);
  const lastIndexRef = useRef(-1);

  const pickWord = useCallback(() => {
    if (!WORDS.length) return "…";

    // 連続同一を避ける（1つしかない場合は例外）
    let idx = Math.floor(Math.random() * WORDS.length);
    if (WORDS.length > 1) {
      let guard = 0;
      while (idx === lastIndexRef.current && guard < 8) {
        idx = Math.floor(Math.random() * WORDS.length);
        guard++;
      }
    }

    lastIndexRef.current = idx;
    return WORDS[idx].text;
  }, []);

  const onFragmentTap = useCallback(() => {
    // 連打対策：既存タイマーを完全に潰す
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);

    // 0.18s：中央から一瞬“消える”（静寂）
    clearTimerRef.current = window.setTimeout(() => {
      setWord(BLANK);
      clearTimerRef.current = 0;
    }, GAP_CLEAR_MS);

    // 0.38s：言葉が現れる
    showTimerRef.current = window.setTimeout(() => {
      setWord(pickWord());
      showTimerRef.current = 0;
    }, WORD_SHOW_MS);
  }, [pickWord]);

  // unmount cleanup（StrictModeでも事故らない）
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      clearTimerRef.current = 0;
      showTimerRef.current = 0;
    };
  }, []);

  return (
    <main className={styles.root}>
      {/* 背景（App.module.css で管理） */}
      <div className={styles.bgImage} aria-hidden="true" />
      <div className={styles.bgVeil} aria-hidden="true" />

      {/* ガラス */}
      <GlassRoom onFragmentTap={onFragmentTap} />

      {/* 言葉 */}
      <CenterWord text={word} />

      {/* UI（薄く） */}
      <div className={styles.corner} aria-hidden="true">
        <span className={styles.title}>GLASS ROOM</span>
        <span className={styles.sub}>破片の部屋</span>
      </div>
    </main>
  );
}