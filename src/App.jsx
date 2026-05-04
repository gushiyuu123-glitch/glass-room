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
 * - UIは足さない（名言と署名だけ）
 * - 名言は“核が伝わる要旨/意訳”中心（誤引用事故を避ける）
 * - 多様性：戦略/心理/創作/決断/習慣/人間関係/回復/仕事
 */
const QUOTES = [
  // Steve Jobs
  { text: "点でいい。あとで線になる。", author: "Steve Jobs", tag: "Work" },
  {
    text: "本当に大事なことに集中するには、捨てる勇気が要る。",
    author: "Steve Jobs",
    tag: "Decision",
  },
  {
    text: "完璧は、足した先じゃない。削って残した先だ。",
    author: "Steve Jobs",
    tag: "Craft",
  },
  {
    text: "他人の人生を生きるな。自分の声を聞け。",
    author: "Steve Jobs",
    tag: "Life",
  },

  // Elon Musk
  {
    text: "失敗できない場所に、革新は生まれない。",
    author: "Elon Musk",
    tag: "Work",
  },
  {
    text: "難しいのは“できるか”じゃない。やり切る設計だ。",
    author: "Elon Musk",
    tag: "Strategy",
  },
  {
    text: "批判は宝だ。現実に当たる角度を変えてくれる。",
    author: "Elon Musk",
    tag: "Mind",
  },

  // Albert Einstein
  {
    text: "問題は、問題を生んだ視点では解けない。",
    author: "Albert Einstein",
    tag: "Mind",
  },
  {
    text: "同じやり方を続けて、違う結果は来ない。",
    author: "Albert Einstein",
    tag: "Decision",
  },
  {
    text: "想像力は、知識より先に世界を拓く。",
    author: "Albert Einstein",
    tag: "Create",
  },

  // Gustave Le Bon
  {
    text: "群衆は理屈で動かない。感情が先、理由は後。",
    author: "Gustave Le Bon",
    tag: "Psychology",
  },
  {
    text: "不安が増えるほど、人は“強い言葉”に寄っていく。",
    author: "Gustave Le Bon",
    tag: "Psychology",
  },
  {
    text: "多数の正しさは、真実とは別の生き物だ。",
    author: "Gustave Le Bon",
    tag: "Mind",
  },

  // Sun Tzu
  {
    text: "勝つ戦いを選べ。戦わずに勝て。",
    author: "Sun Tzu",
    tag: "Strategy",
  },
  {
    text: "彼を知り己を知れば、百戦あやうからず。",
    author: "Sun Tzu",
    tag: "Strategy",
  },
  { text: "速さは力だ。整って速い者が勝つ。", author: "Sun Tzu", tag: "Work" },

  // Stoics
  {
    text: "外ではなく内を整えよ。反応は選べる。",
    author: "Marcus Aurelius",
    tag: "Mind",
  },
  {
    text: "変えられないことは受け入れ、変えられることに集中せよ。",
    author: "Marcus Aurelius",
    tag: "Decision",
  },
  { text: "人生は短いのではない。浪費している。", author: "Seneca", tag: "Habit" },
  { text: "起きたことではなく、解釈が心を傷つける。", author: "Epictetus", tag: "Mind" },

  // Viktor Frankl
  { text: "刺激と反応のあいだに、選択がある。", author: "Viktor E. Frankl", tag: "Mind" },
  { text: "意味は“与えられる”のではなく、掴みに行くものだ。", author: "Viktor E. Frankl", tag: "Life" },

  // Nietzsche
  { text: "自分の“なぜ”があれば、多くの“どうやって”は耐えられる。", author: "Friedrich Nietzsche", tag: "Life" },

  // Leonardo da Vinci
  { text: "観察は、才能を起動する。", author: "Leonardo da Vinci", tag: "Craft" },
  { text: "複雑さは、削った先で静かに負ける。", author: "Leonardo da Vinci", tag: "Craft" },

  // Marie Curie
  { text: "恐れるより、理解しよう。理解は恐怖を薄くする。", author: "Marie Curie", tag: "Mind" },

  // Miyamoto Musashi
  { text: "型は入口。道は、その先に残る。", author: "Miyamoto Musashi", tag: "Craft" },
  { text: "勝つとは、相手より先に自分を整えること。", author: "Miyamoto Musashi", tag: "Strategy" },

  // Philosophers / Leaders (paraphrase)
  { text: "自分を知ることが、すべての始まりだ。", author: "Socrates", tag: "Mind" },
  { text: "習慣は、人格になる。", author: "Aristotle", tag: "Habit" },
  { text: "目的が定まれば、手段は選べる。", author: "Confucius", tag: "Decision" },
  { text: "千里の道も、一歩から始まる。", author: "Laozi", tag: "Habit" },

  // Science / Exploration
  { text: "見えるものは、仮説で変わる。", author: "Charles Darwin", tag: "Mind" },
  { text: "肩の上に立て。先人の積み重ねを使え。", author: "Isaac Newton", tag: "Work" },

  // Courage / Action
  { text: "恐れがあるまま進め。勇気は“無怖”じゃない。", author: "Winston Churchill", tag: "Mind" },
  { text: "遅くてもいい。止まらなければ前に進む。", author: "Nelson Mandela", tag: "Life" },
  { text: "未来は、今日の選択でできていく。", author: "Abraham Lincoln", tag: "Decision" },
  { text: "変化は外ではなく、自分から始まる。", author: "Mahatma Gandhi", tag: "Life" },
];

const MORE_QUOTES = [
  // ── Psychology / Mind (深め)
  { text: "現実は、心のレンズで歪む。レンズを疑え。", author: "Carl Jung", tag: "Mind" },
  { text: "影を否定するほど、影は強くなる。", author: "Carl Jung", tag: "Mind" },
  { text: "恐怖は未来の物語だ。今の行動に戻れ。", author: "Stoics", tag: "Mind" },
  { text: "感情は敵じゃない。情報だ。扱い方が問題だ。", author: "Stoics", tag: "Mind" },
  { text: "人は事実ではなく、解釈で苦しむ。", author: "Stoics", tag: "Mind" },
  { text: "不安は“準備不足”のサインになることがある。", author: "Psychology", tag: "Mind" },

  // ── Decision / Strategy (勝ち方)
  { text: "勝ちは、始める前に決まっている。配置で勝て。", author: "Sun Tzu", tag: "Strategy" },
  { text: "戦う場所を選べ。正面突破は最後だ。", author: "Sun Tzu", tag: "Strategy" },
  { text: "選択肢が多いほど、人は動けなくなる。", author: "Daniel Kahneman", tag: "Decision" },
  { text: "損失の痛みは、利益の喜びより強い。設計で避けろ。", author: "Daniel Kahneman", tag: "Psychology" },
  { text: "短期の快は、長期の自由を削る。", author: "Stoics", tag: "Decision" },
  { text: "最強の一手は『やらない』を決めること。", author: "Strategy", tag: "Decision" },

  // ── Work / Craft (作る・磨く)
  { text: "仕事は、才能より“基準”で決まる。", author: "Peter Drucker", tag: "Work" },
  { text: "測れないものは改善しにくい。だからまず定義しろ。", author: "Peter Drucker", tag: "Work" },
  { text: "質は偶然じゃない。設計された結果だ。", author: "Craft", tag: "Craft" },
  { text: "上達は、派手な一発じゃなく微差の積み重ね。", author: "Kaizen", tag: "Habit" },
  { text: "プロは気分でやらない。仕組みでやる。", author: "Work", tag: "Habit" },
  { text: "完成は“十分に削れた”のサインだ。", author: "Design", tag: "Craft" },

  // ── Learning (学び)
  { text: "学ぶとは、昨日の自分を更新すること。", author: "Learning", tag: "Learning" },
  { text: "理解したつもりを疑え。説明できるか？", author: "Richard Feynman", tag: "Learning" },
  { text: "本質は、例外の中に隠れていることがある。", author: "Science", tag: "Learning" },
  { text: "知識は道具。視点がなければ武器にならない。", author: "Einstein-ish", tag: "Learning" },

  // ── Money / Business (現実に効く)
  { text: "複利は、時間が味方につく唯一の魔法だ。", author: "Albert Einstein", tag: "Money" },
  { text: "リスクは“理解してないこと”から来る。", author: "Warren Buffett", tag: "Money" },
  { text: "価格は払うもの。価値は残るもの。", author: "Warren Buffett", tag: "Money" },
  { text: "長く持てるものだけ買え。時間で勝て。", author: "Warren Buffett", tag: "Strategy" },
  { text: "世の中はノイズだ。重要な少数だけ見ろ。", author: "Charlie Munger", tag: "Mind" },
  { text: "簡単に儲かる話は、だいたい罠だ。", author: "Charlie Munger", tag: "Money" },
  { text: "顧客が欲しいのは“商品”じゃない。変化だ。", author: "Marketing", tag: "Work" },
  { text: "売るとは、価値を翻訳すること。", author: "Marketing", tag: "Work" },

  // ── Creativity / Art (作家性)
  { text: "模倣で学び、統合で自分になる。", author: "Creativity", tag: "Create" },
  { text: "上手いより、“違う”が残る。", author: "Art", tag: "Create" },
  { text: "表現は、説明を減らしたところで強くなる。", author: "Art", tag: "Craft" },
  { text: "最初に決めるべきは“方向”だ。手段は後。", author: "Design", tag: "Decision" },
  { text: "美しさは、余計なものが無い状態に宿る。", author: "Minimalism", tag: "Craft" },

  // ── Life / Meaning (人生に効く)
  { text: "人生は一度きりじゃない。“今日”は一度きりだ。", author: "Life", tag: "Life" },
  { text: "自由は、選ばない勇気から生まれる。", author: "Life", tag: "Decision" },
  { text: "孤独は敵じゃない。深さの条件だ。", author: "Philosophy", tag: "Life" },
  { text: "自分に嘘をつくほど、世界が濁る。", author: "Philosophy", tag: "Mind" },
  { text: "失敗は終わりじゃない。更新ログだ。", author: "Life", tag: "Mind" },

  // ── Relations (人間関係)
  { text: "境界線は冷たさじゃない。持続の技術だ。", author: "Relationships", tag: "Relations" },
  { text: "相手を変えるな。距離と環境を変えろ。", author: "Relationships", tag: "Decision" },
  { text: "合わない場で頑張るほど、あなたが壊れる。", author: "Relationships", tag: "Life" },
  { text: "承認は短期。尊重は長期。", author: "Relationships", tag: "Relations" },

  // ── Habit / Health (習慣・回復)
  { text: "継続は才能じゃない。摩擦を減らした設計だ。", author: "James Clear", tag: "Habit" },
  { text: "やる気は後から来る。行動が先だ。", author: "James Clear", tag: "Habit" },
  { text: "休むのも戦略。燃え尽きは負けだ。", author: "Work", tag: "Habit" },
  { text: "睡眠は“明日の脳”を作る作業だ。", author: "Health", tag: "Habit" },

  // ── Japanese greats（要旨）
  { text: "学びは自分を救う。だから怠るな。", author: "Fukuzawa Yukichi", tag: "Learning" },
  { text: "志は、環境に負けない芯になる。", author: "Yoshida Shoin", tag: "Life" },
  { text: "芸術は爆発だ。怖がるな。", author: "Taro Okamoto", tag: "Create" },
  { text: "道を極めるのは、余計を捨てることでもある。", author: "Zeami", tag: "Craft" },

  // ── Additional modern thinkers（要旨）
  { text: "大きな賭けは小さく試し、当たったら増やせ。", author: "Nassim Taleb", tag: "Strategy" },
  { text: "壊れても生き残る設計にしろ。", author: "Nassim Taleb", tag: "Strategy" },
  { text: "知るべきは“何を知らないか”だ。", author: "Donald Rumsfeld", tag: "Mind" },
  { text: "完璧を待つと、永遠に始まらない。", author: "Voltaire-ish", tag: "Decision" },

  // ── Calm / Night
  { text: "静けさは、思考を澄ませる装置だ。", author: "Philosophy", tag: "Mind" },
  { text: "夜は、余計なものが消える。残るのは核だ。", author: "Philosophy", tag: "Life" },
  { text: "焦りを消すには、“いま出来る一手”に戻れ。", author: "Strategy", tag: "Mind" },
];

// ✅ ここが“完全版”の肝：全部まとめる
const ALL_QUOTES = [...QUOTES, ...MORE_QUOTES];

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