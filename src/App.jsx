import { useCallback, useEffect, useRef, useState } from "react";
import GlassRoom from "./scenes/GlassRoom";
import CenterWord from "./components/ui/CenterWord";
import styles from "./App.module.css";
import { emitFx, FX } from "./lib/fxBus"; // ✅ 同期用

// Claudeの“間”
const GAP_CLEAR_MS = 180; // 0.18s：中央は何も起きていない
const WORD_SHOW_MS = 380; // 0.38s：言葉が現れる

// 見えないけど「空白」を保つ（CenterWordのレイアウト崩れ対策）
const BLANK = "\u200B";

function makeId() {
  return (
    crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

/**
 * 方針：
 * - 名言は“核が伝わる要旨/意訳”中心（誤引用事故を避ける）
 * - タグは少数に統一（Work / Strategy / Mind / Craft / Habit / Life / Money）
 */
const QUOTES = [
  // --- Work / Craft (削って残す・集中)
  { text: "点でいい。あとで線になる。", author: "Steve Jobs（要旨）", tag: "Work" },
  { text: "本当に大事なことに集中するには、捨てる勇気が要る。", author: "Steve Jobs（要旨）", tag: "Strategy" },
  { text: "完璧は、足した先じゃない。削って残した先だ。", author: "Steve Jobs（要旨）", tag: "Craft" },
  { text: "他人の人生を生きるな。自分の声を聞け。", author: "Steve Jobs（要旨）", tag: "Life" },

  // --- Mind (視点・思考の更新)
  { text: "問題は、問題を生んだ視点では解けない。", author: "Albert Einstein（要旨）", tag: "Mind" },
  { text: "同じやり方を続けて、違う結果は来ない。", author: "Albert Einstein（要旨）", tag: "Mind" },
  { text: "恐れるより、理解しよう。理解は恐怖を薄くする。", author: "Marie Curie（要旨）", tag: "Mind" },

  // --- Strategy (勝ち方・設計)
  { text: "勝つ戦いを選べ。戦わずに勝て。", author: "孫子", tag: "Strategy" },
  { text: "彼を知り己を知れば、百戦あやうからず。", author: "孫子", tag: "Strategy" },
  { text: "型は入口。道は、その先に残る。", author: "宮本武蔵（要旨）", tag: "Craft" },
  { text: "勝つとは、相手より先に自分を整えること。", author: "宮本武蔵（要旨）", tag: "Strategy" },

  // --- Habit (継続・行動の出し方)
  { text: "継続は才能じゃない。摩擦を減らした設計だ。", author: "James Clear（要旨）", tag: "Habit" },
  { text: "やる気は後から来る。行動が先だ。", author: "James Clear（要旨）", tag: "Habit" },
  { text: "休むのも戦略。燃え尽きは負けだ。", author: "—", tag: "Habit" },
  { text: "人生は短いのではない。浪費している。", author: "Seneca（要旨）", tag: "Habit" },

  // --- Life (意味・軸)
  { text: "刺激と反応のあいだに、選択がある。", author: "Viktor E. Frankl（要旨）", tag: "Mind" },
  { text: "意味は“与えられる”のではなく、掴みに行くものだ。", author: "Viktor E. Frankl（要旨）", tag: "Life" },
  { text: "自分の“なぜ”があれば、多くの“どうやって”は耐えられる。", author: "Nietzsche（要旨）", tag: "Life" },
  { text: "成功の反対は、何もしないこと。", author: "—", tag: "Life" },

  // --- Money (現実・複利)
  { text: "価格は払うもの。価値は残るもの。", author: "Warren Buffett（要旨）", tag: "Money" },
  { text: "リスクは“理解してないこと”から来る。", author: "Warren Buffett（要旨）", tag: "Money" },
  { text: "世の中はノイズだ。重要な少数だけ見ろ。", author: "Charlie Munger（要旨）", tag: "Mind" },

  // --- Famous JP quotes (画像系の強い核)
  { text: "待っているだけの人達にも、何かが起こるかもしれないが、それは努力した人達の残り物だけである。", author: "Abraham Lincoln", tag: "Work" },
  { text: "石の上にも三年という。しかし、三年を一年で習得する努力を怠ってはならない。", author: "松下幸之助（要旨）", tag: "Habit" },
  { text: "踏まれても叩かれても、努力さえしつづけていれば、必ずいつかは実を結ぶ。", author: "井田幸三（要旨）", tag: "Habit" },
  { text: "目標を達成するには、全力で取り組む以外に方法はない。そこに近道はない。", author: "Michael Jordan（要旨）", tag: "Work" },
  { text: "1日0.1%の改善でも、1年間続ければ44%もの改善になる。", author: "三木谷浩史（要旨）", tag: "Habit" },

  // --- Messi / Sakanaction (今回の核)
  { text: "僕が成功するために17年と114日がかかった。でも、世間はそれを「一夜にして手に入れた成功」と呼ぶんだ。", author: "Lionel Messi（要旨）", tag: "Work" },
  { text: "本当に夢を叶えるやつって、本気通り越して狂気のやつなんだよね。", author: "山口一郎（要旨）", tag: "Mind" },
  { text: "わかんねえなっていうぐらいの狂気の人なんだよね。", author: "山口一郎（要旨）", tag: "Mind" },

  // --- Extra (使える一文だけ残す)
  { text: "顧客が欲しいのは“商品”じゃない。変化だ。", author: "—", tag: "Work" },
  { text: "売るとは、価値を翻訳すること。", author: "—", tag: "Work" },
];

// 圧縮版：配列はこれ一本で回す
const ALL_QUOTES = QUOTES;



export default function App() {
  const [quote, setQuote] = useState(() => ({
    id: makeId(),
    text: "ひとつ、触れてみてください。",
    author: "",
    tag: "Intro",
  }));

  const clearTimerRef = useRef(0);
  const showTimerRef = useRef(0);

  // 直近の被り回避
  const lastIndicesRef = useRef([]);
  const lastAuthorRef = useRef("");
  const lastTagRef = useRef("");

  const pickQuote = useCallback(() => {
    if (!ALL_QUOTES.length) {
      return { id: makeId(), text: "…", author: "", tag: "None" };
    }

    let idx = Math.floor(Math.random() * ALL_QUOTES.length);
    let guard = 0;

    // 直近4つのインデックス / 同一作者連続 / 同一タグ連続 を避ける
    while (guard < 32) {
      const q = ALL_QUOTES[idx];
      const badIndex = lastIndicesRef.current.includes(idx);
      const badAuthor = q.author && q.author === lastAuthorRef.current;
      const badTag = q.tag && q.tag === lastTagRef.current;

      // 作者連続は強く避ける。タグ連続は後半許容。
      if (!badIndex && !badAuthor && (!badTag || guard > 14)) break;

      idx = Math.floor(Math.random() * ALL_QUOTES.length);
      guard++;
    }

    const chosen = ALL_QUOTES[idx];

    lastIndicesRef.current = [idx, ...lastIndicesRef.current].slice(0, 4);
    lastAuthorRef.current = chosen.author ?? "";
    lastTagRef.current = chosen.tag ?? "";

    return { id: makeId(), ...chosen };
  }, []);

  const onFragmentTap = useCallback(() => {
    // ✅ ① タップ瞬間：空間粒子を中心へ吸う（tap phase）
    emitFx({
      type: FX.PULSE,
      phase: "tap",
      intensity: 1.0,
      duration: WORD_SHOW_MS,
      centerY: 0.48,
    });

    // 連打対策：既存タイマーを完全に潰す
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);

    // 0.18s：中央から一瞬“消える”（静寂）
    clearTimerRef.current = window.setTimeout(() => {
      setQuote({ id: makeId(), text: BLANK, author: "", tag: "Silent" });
      clearTimerRef.current = 0;
    }, GAP_CLEAR_MS);

    // 0.38s：言葉が現れる
    showTimerRef.current = window.setTimeout(() => {
      setQuote(pickQuote());

      // ✅ ② 言葉の出現：結晶化（reveal phase）
      requestAnimationFrame(() => {
        emitFx({
          type: FX.PULSE,
          phase: "reveal",
          intensity: 0.75,
          duration: 520,
          centerY: 0.48,
        });
      });

      showTimerRef.current = 0;
    }, WORD_SHOW_MS);
  }, [pickQuote]);

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
      <div className={styles.bgImage} aria-hidden="true" />
      <div className={styles.bgVeil} aria-hidden="true" />

      <GlassRoom onFragmentTap={onFragmentTap} />

      {/* 名言 + 作者名 */}
      <CenterWord quote={quote} />

 
    </main>
  );
}