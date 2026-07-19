"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

type Question = {
  id: string;
  question: string;
  answers: string[][];
  category: string;
  importance: string;
};

type Mode = "normal" | "wrong";

const categoryLabels: Record<string, string> = {
  all: "全部",
  theme01: "Chapter 1　財務諸表論の基礎",
  theme02: "Chapter 2　一般原則",
  theme03: "Chapter 3　資産と負債",
  theme04: "Chapter 4　表示原則",
  theme05: "Chapter 5　損益会計",
  theme06: "Chapter 6　損益認識",
  theme07: "Chapter 7　棚卸資産",
  theme08: "Chapter 8　金融商品",
  theme09: "Chapter 9　減価償却",
  theme10: "Chapter 10　引当金",
  theme11: "Chapter 11　繰延資産",
  theme12: "Chapter 12　外貨建取引",
  theme13: "Chapter 13　減損会計",
  theme14: "Chapter 14　税効果会計",
  theme15: "Chapter 15　純資産",
  theme16: "Chapter 16　資産除去債務",
  theme17: "Chapter 17　退職給付引当金",
  theme18: "Chapter 18　研究開発",
  theme19: "Chapter 19　変更・誤謬基準",
  theme20: "Chapter 20　リース会計",
  theme21: "Chapter 21　収益認識基準",
  theme22: "Chapter 22　連結・中間財務諸表",
  theme23: "Chapter 23　包括利益",
  theme24: "Chapter 24　企業結合等",
  theme25: "Chapter 25　キャッシュ・フロー計算書",
  theme26: "Chapter 26　開示制度等",
};

const importanceLabels: Record<string, string> = {
  all: "重要度 全部",
  A: "重要度 A",
  B: "重要度 B",
  C: "重要度 C",
};

const circledNumbers = [
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "⑥",
  "⑦",
  "⑧",
  "⑨",
  "⑩",
  "⑪",
  "⑫",
  "⑬",
  "⑭",
  "⑮",
  "⑯",
  "⑰",
  "⑱",
  "⑲",
  "⑳",
];

function answerLabel(index: number) {
  return circledNumbers[index] ?? String(index + 1);
}

/**
 * 改行を含む引用フィールドにも対応した簡易CSVパーサー。
 * ExcelからUTF-8 CSVで保存したファイルも読み込めます。
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[\s　]+/g, "")
    .replace(/および/g, "及び")
    .replace(/[「」『』【】()（）]/g, "")
    .replace(/[、。．，,・･]/g, "");
}

function isCorrectAnswer(input: string, alternatives: string[]) {
  const normalizedInput = normalizeAnswer(input);
  if (!normalizedInput) return false;

  return alternatives.some(
    (alternative) => normalizeAnswer(alternative) === normalizedInput,
  );
}

function displayCorrectAnswer(alternatives: string[]) {
  return alternatives.join(" / ");
}

export default function Page() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedImportance, setSelectedImportance] = useState("all");
  const [index, setIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [fieldResults, setFieldResults] = useState<boolean[]>([]);
  const [result, setResult] = useState("");
  const [wrongMap, setWrongMap] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>("normal");
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wrongMapV2");
      if (saved) setWrongMap(JSON.parse(saved));
    } catch {
      localStorage.removeItem("wrongMapV2");
      setWrongMap({});
    }
  }, []);

  useEffect(() => {
    async function loadCSV() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`/questions.csv?v=${Date.now()}`, {
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) throw new Error("questions.csv が見つかりません。");

        const text = (await res.text()).replace(/\uFEFF/g, "").trim();

        if (!text) throw new Error("questions.csv が空です。");

        const csvRows = parseCSV(text);
        if (csvRows.length < 2) {
          throw new Error("CSVに問題データがありません。");
        }

        const headers = csvRows[0].map((header) => header.trim().toLowerCase());
        const getColumn = (name: string) => headers.indexOf(name);

        const idIndex = getColumn("id");
        const questionIndex = getColumn("question");
        const answersIndex = getColumn("answers");
        const oldAnswerIndex = getColumn("answer");
        const categoryIndex = getColumn("category");
        const importanceIndex = getColumn("importance");

        if (
          questionIndex < 0 ||
          (answersIndex < 0 && oldAnswerIndex < 0) ||
          categoryIndex < 0
        ) {
          throw new Error(
            "CSVの列は id, question, answers, category, importance の順で用意してください。",
          );
        }

        const data = csvRows
          .slice(1)
          .map((parts, rowIndex): Question | null => {
            const question = parts[questionIndex]?.trim() ?? "";
            const rawAnswers =
              parts[
                answersIndex >= 0 ? answersIndex : oldAnswerIndex
              ]?.trim() ?? "";
            const category = parts[categoryIndex]?.trim() ?? "";
            const importance =
              importanceIndex >= 0
                ? parts[importanceIndex]?.trim() || "A"
                : "A";

            if (!question || !rawAnswers || !category) return null;

            // 「||」＝解答欄の区切り、「|」＝同じ解答欄で許容する別解。
            const answers = rawAnswers
              .split("||")
              .map((answerGroup) =>
                answerGroup
                  .split("|")
                  .map((answer) => answer.trim())
                  .filter(Boolean),
              )
              .filter((answerGroup) => answerGroup.length > 0);

            if (answers.length === 0) return null;

            return {
              id:
                (idIndex >= 0 ? parts[idIndex]?.trim() : "") ||
                `${category}-${rowIndex + 1}`,
              question,
              answers,
              category,
              importance,
            };
          })
          .filter((question): question is Question => question !== null);

        if (data.length === 0) {
          throw new Error(
            "読み込める問題がありません。CSVの内容を確認してください。",
          );
        }

        setQuestions(data);
      } catch (err) {
        setCsvError(
          err instanceof Error ? err.message : "CSVの読み込みに失敗しました。",
        );
      } finally {
        setLoading(false);
      }
    }

    loadCSV();
  }, []);

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(questions.map((q) => q.category)))];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const categoryOK =
        selectedCategory === "all" || q.category === selectedCategory;
      const importanceOK =
        selectedImportance === "all" || q.importance === selectedImportance;
      return categoryOK && importanceOK;
    });
  }, [questions, selectedCategory, selectedImportance]);

  const wrongFilteredQuestions = useMemo(() => {
    return filteredQuestions.filter((q) => wrongMap[q.id] !== undefined);
  }, [filteredQuestions, wrongMap]);

  const currentQuestions =
    mode === "wrong" ? wrongFilteredQuestions : filteredQuestions;
  const currentQuestion = currentQuestions[index];

  const clearAnswerState = (answerCount = 0) => {
    setUserAnswers(Array(answerCount).fill(""));
    setFieldResults([]);
    setResult("");
    inputRefs.current = [];
  };

  const retryQuestion = useCallback(() => {
    if (!currentQuestion) return;

    setUserAnswers(Array(currentQuestion.answers.length).fill(""));
    setFieldResults([]);
    setResult("");
    inputRefs.current = [];

    requestAnimationFrame(() => inputRefs.current[0]?.focus());
  }, [currentQuestion]);

  useEffect(() => {
    if (!result) return;

    const handleRetryShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.key.toLowerCase() !== "r"
      ) {
        return;
      }

      event.preventDefault();
      retryQuestion();
    };

    window.addEventListener("keydown", handleRetryShortcut);
    return () => window.removeEventListener("keydown", handleRetryShortcut);
  }, [result, retryQuestion]);

  useEffect(() => {
    setIndex(0);
    clearAnswerState(0);
  }, [selectedCategory, selectedImportance, mode]);

  useEffect(() => {
    if (!currentQuestion) {
      clearAnswerState(0);
      return;
    }

    clearAnswerState(currentQuestion.answers.length);
    requestAnimationFrame(() => inputRefs.current[0]?.focus());
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (currentQuestions.length === 0) {
      setIndex(0);
    } else if (index >= currentQuestions.length) {
      setIndex(currentQuestions.length - 1);
    }
  }, [currentQuestions.length, index]);

  const saveWrongMap = (updated: Record<string, number>) => {
    setWrongMap(updated);
    localStorage.setItem("wrongMapV2", JSON.stringify(updated));
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;

    const currentCount = wrongMap[currentQuestion.id];
    if (currentCount === undefined) {
      setResult("〇　全問正解");
      return;
    }

    const nextCount = currentCount + 1;
    const updated = { ...wrongMap };

    if (nextCount >= 5) {
      delete updated[currentQuestion.id];
      setResult("〇　全問正解：5回正解したのでミス復習から卒業");
    } else {
      updated[currentQuestion.id] = nextCount;
      setResult(`〇　全問正解：連続正解 ${nextCount}/5`);
    }

    saveWrongMap(updated);
  };

  const handleWrong = (results: boolean[]) => {
    if (!currentQuestion) return;

    const correctCount = results.filter(Boolean).length;
    setResult(
      `×　${correctCount}/${currentQuestion.answers.length}欄正解。赤い欄を確認してください。`,
    );
    saveWrongMap({
      ...wrongMap,
      [currentQuestion.id]: 0,
    });
  };

  const gradeQuestion = () => {
    if (!currentQuestion || result) return;

    const results = currentQuestion.answers.map((alternatives, answerIndex) =>
      isCorrectAnswer(userAnswers[answerIndex] ?? "", alternatives),
    );

    setFieldResults(results);

    if (results.every(Boolean)) {
      handleCorrect();
    } else {
      handleWrong(results);
    }
  };

  const nextQuestion = () => {
    if (currentQuestions.length === 0) return;

    setIndex((prev) => {
      if (mode === "wrong" && result.includes("卒業")) {
        return Math.min(prev, Math.max(currentQuestions.length - 2, 0));
      }
      return (prev + 1) % currentQuestions.length;
    });

    // 選択条件により1問しかない場合でも、同じ問題をもう一度解けるようにする。
    clearAnswerState(currentQuestion?.answers.length ?? 0);
    requestAnimationFrame(() => inputRefs.current[0]?.focus());
  };

  const handleInputEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    answerIndex: number,
  ) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();

    if (result) {
      nextQuestion();
      return;
    }

    const isLastInput =
      !currentQuestion || answerIndex === currentQuestion.answers.length - 1;

    if (!isLastInput) {
      inputRefs.current[answerIndex + 1]?.focus();
    } else {
      gradeQuestion();
    }
  };

  const resetView = () => {
    setIndex(0);
    clearAnswerState(0);
  };

  if (loading) {
    return (
      <main style={styles.loadingPage}>
        <section style={styles.loadingCard}>
          <h1 style={styles.loadingTitle}>財務諸表論 穴埋めアプリ</h1>
          <p>読み込み中...</p>
        </section>
      </main>
    );
  }

  if (csvError) {
    return (
      <main style={styles.loadingPage}>
        <section style={styles.loadingCard}>
          <h1 style={styles.loadingTitle}>財務諸表論 穴埋めアプリ</h1>
          <p style={styles.error}>{csvError}</p>
          <p>public/questions.csv を確認してください。</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <style>{responsiveCss}</style>

      <main className="appPage">
        <div className="appShell">
          <aside className="appSidebar">
            <h1 className="appTitle">財務諸表論<br />穴埋めアプリ</h1>

            <section className="sideSection">
              <p className="sideLabel">学習モード</p>
              <div className="sideButtonGroup">
                <button
                  style={chip(mode === "normal")}
                  onClick={() => setMode("normal")}
                >
                  通常
                </button>
                <button
                  style={chip(mode === "wrong")}
                  onClick={() => setMode("wrong")}
                >
                  ミス復習
                </button>
              </div>
            </section>

            <section className="sideSection">
              <label className="sideLabel" htmlFor="category-select">
                チャプター
              </label>
              <select
                id="category-select"
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  resetView();
                }}
                className="chapterSelect"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category] ?? category}
                  </option>
                ))}
              </select>
            </section>

            <section className="sideSection">
              <p className="sideLabel">重要度</p>
              <div className="importanceGrid">
                {["all", "A", "B", "C"].map((importance) => (
                  <button
                    key={importance}
                    style={chip(selectedImportance === importance)}
                    onClick={() => {
                      setSelectedImportance(importance);
                      resetView();
                    }}
                  >
                    {importance === "all" ? "全部" : importance}
                  </button>
                ))}
              </div>
            </section>

            <section className="sideStats" aria-label="学習状況">
              <div>
                <span className="statLabel">現在</span>
                <strong>
                  {currentQuestions.length === 0 ? 0 : index + 1} / {currentQuestions.length}問
                </strong>
              </div>
              <div>
                <span className="statLabel">ミス登録</span>
                <strong>{Object.keys(wrongMap).length}問</strong>
              </div>
            </section>

            <section className="shortcutBox">
              <p className="shortcutTitle">キーボード操作</p>
              <p><kbd>Enter</kbd> 次の欄・採点・次の問題</p>
              <p><kbd>R</kbd> 同じ問題をもう一度</p>
            </section>
          </aside>

          <section className="mainCard">
            {currentQuestions.length === 0 ? (
              <p style={styles.message}>該当する問題がありません。</p>
            ) : (
              <>
                <header className="mainHeader">
                  <div>
                    <p className="chapterName">
                      {categoryLabels[currentQuestion.category] ?? currentQuestion.category}
                    </p>
                    <p className="questionPosition">
                      {index + 1} / {currentQuestions.length}問
                    </p>
                  </div>
                  <span className="importanceBadge">
                    重要度 {currentQuestion.importance}
                  </span>
                </header>

                <div className="questionBox">
                  <p className="questionText">{currentQuestion.question}</p>
                </div>

                <div className="answerGrid">
                  {currentQuestion.answers.map((alternatives, answerIndex) => {
                    const judged = result !== "";
                    const correct = fieldResults[answerIndex];

                    return (
                      <div
                        key={`${currentQuestion.id}-${answerIndex}`}
                        className="answerRow"
                      >
                        <label
                          htmlFor={`answer-${answerIndex}`}
                          className="answerNumber"
                        >
                          {answerLabel(answerIndex)}
                        </label>

                        <div className="inputArea">
                          <input
                            id={`answer-${answerIndex}`}
                            ref={(element) => {
                              inputRefs.current[answerIndex] = element;
                            }}
                            style={{
                              ...styles.input,
                              ...(judged
                                ? correct
                                  ? styles.inputCorrect
                                  : styles.inputWrong
                                : {}),
                            }}
                            value={userAnswers[answerIndex] ?? ""}
                            onChange={(event) => {
                              const updated = [...userAnswers];
                              updated[answerIndex] = event.target.value;
                              setUserAnswers(updated);
                            }}
                            onKeyDown={(event) =>
                              handleInputEnter(event, answerIndex)
                            }
                            placeholder={`${answerLabel(answerIndex)}の解答`}
                            readOnly={judged}
                            aria-readonly={judged}
                            autoComplete="off"
                          />

                          {judged && !correct && (
                            <p style={styles.correctAnswer}>
                              正解：{displayCorrectAnswer(alternatives)}
                            </p>
                          )}
                        </div>

                        {judged && (
                          <span
                            style={
                              correct ? styles.fieldCorrect : styles.fieldWrong
                            }
                            aria-label={correct ? "正解" : "不正解"}
                          >
                            {correct ? "〇" : "×"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="resultArea" aria-live="polite">
                  {result && (
                    <>
                      <p
                        style={
                          result.startsWith("〇") ? styles.correct : styles.wrong
                        }
                      >
                        {result}
                      </p>
                      <p style={styles.shortcutHint}>
                        R：同じ問題をもう一度　／　Enter：次の問題
                      </p>
                    </>
                  )}
                </div>

                {result ? (
                  <div className="actionButtons">
                    <button style={styles.retryButton} onClick={retryQuestion}>
                      同じ問題をもう一度（R）
                    </button>
                    <button style={styles.nextButton} onClick={nextQuestion}>
                      次の問題へ（Enter）
                    </button>
                  </div>
                ) : (
                  <button style={styles.gradeButton} onClick={gradeQuestion}>
                    採点
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

const chip = (active: boolean): CSSProperties => ({
  backgroundColor: active ? "#fde68a" : "#ffffff",
  border: active ? "1px solid #f59e0b" : "1px solid #d1d5db",
  borderRadius: "9999px",
  padding: "9px 14px",
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const responsiveCss = `
  * { box-sizing: border-box; }

  body { margin: 0; }

  .appPage {
    min-height: 100vh;
    padding: 20px;
    color: #111827;
    background: #f3f4f6;
  }

  .appShell {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 18px;
    width: min(1440px, 100%);
    margin: 0 auto;
    align-items: start;
  }

  .appSidebar,
  .mainCard {
    background: #ffffff;
    border-radius: 18px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.07);
  }

  .appSidebar {
    position: sticky;
    top: 20px;
    padding: 22px;
  }

  .appTitle {
    margin: 0 0 22px;
    font-size: 23px;
    line-height: 1.45;
    text-align: center;
  }

  .sideSection {
    padding: 16px 0;
    border-top: 1px solid #e5e7eb;
  }

  .sideLabel {
    display: block;
    margin: 0 0 9px;
    color: #374151;
    font-size: 14px;
    font-weight: 800;
  }

  .sideButtonGroup {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chapterSelect {
    width: 100%;
    padding: 11px 12px;
    border: 1px solid #d1d5db;
    border-radius: 11px;
    background: #ffffff;
    color: #111827;
    font-size: 15px;
  }

  .importanceGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .importanceGrid button {
    width: 100%;
  }

  .sideStats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 14px;
    border-radius: 12px;
    background: #f9fafb;
  }

  .sideStats div {
    min-width: 0;
  }

  .sideStats strong,
  .statLabel {
    display: block;
  }

  .sideStats strong {
    margin-top: 3px;
    font-size: 16px;
  }

  .statLabel {
    color: #6b7280;
    font-size: 12px;
    font-weight: 700;
  }

  .shortcutBox {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    color: #4b5563;
    background: #ffffff;
    font-size: 13px;
  }

  .shortcutBox p {
    margin: 6px 0;
  }

  .shortcutTitle {
    color: #111827;
    font-weight: 800;
  }

  kbd {
    display: inline-block;
    min-width: 50px;
    margin-right: 6px;
    padding: 3px 7px;
    border: 1px solid #d1d5db;
    border-bottom-width: 2px;
    border-radius: 6px;
    color: #111827;
    background: #f9fafb;
    text-align: center;
    font-family: inherit;
    font-weight: 800;
  }

  .mainCard {
    min-width: 0;
    padding: 24px;
  }

  .mainHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .chapterName,
  .questionPosition {
    margin: 0;
  }

  .chapterName {
    font-size: 18px;
    font-weight: 800;
  }

  .questionPosition {
    margin-top: 4px;
    color: #6b7280;
    font-size: 14px;
  }

  .importanceBadge {
    flex-shrink: 0;
    padding: 7px 11px;
    border: 1px solid #f59e0b;
    border-radius: 999px;
    background: #fffbeb;
    font-size: 13px;
    font-weight: 800;
  }

  .questionBox {
    margin-bottom: 16px;
    padding: 18px 20px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #f9fafb;
  }

  .questionText {
    margin: 0;
    font-size: 19px;
    font-weight: 650;
    line-height: 1.75;
    white-space: pre-wrap;
  }

  .answerGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
    gap: 10px 14px;
    align-items: start;
  }

  .answerRow {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 28px;
    gap: 8px;
    align-items: start;
    min-width: 0;
  }

  .answerNumber {
    padding-top: 10px;
    font-size: 20px;
    font-weight: 800;
    text-align: center;
  }

  .inputArea {
    min-width: 0;
  }

  .resultArea {
    min-height: 45px;
  }

  .actionButtons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 10px;
  }

  @media (max-width: 980px) {
    .appShell {
      grid-template-columns: 230px minmax(0, 1fr);
    }

    .appSidebar {
      padding: 18px;
    }

    .mainCard {
      padding: 20px;
    }

    .answerGrid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .appPage {
      padding: 10px;
    }

    .appShell {
      display: block;
    }

    .appSidebar {
      position: static;
      margin-bottom: 10px;
    }

    .appTitle {
      margin-bottom: 14px;
      font-size: 21px;
    }

    .sideSection {
      padding: 12px 0;
    }

    .shortcutBox {
      display: none;
    }

    .mainCard {
      padding: 16px;
    }

    .mainHeader {
      align-items: center;
    }

    .questionBox {
      padding: 15px;
    }

    .questionText {
      font-size: 17px;
      line-height: 1.7;
    }
  }

  @media (max-width: 520px) {
    .actionButtons {
      grid-template-columns: 1fr;
    }

    .importanceGrid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .importanceGrid button {
      padding-left: 6px !important;
      padding-right: 6px !important;
    }
  }
`;

const styles: Record<string, CSSProperties> = {
  loadingPage: {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "32px 16px",
    color: "#111827",
  },
  loadingCard: {
    maxWidth: "760px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  loadingTitle: {
    textAlign: "center",
    fontSize: "26px",
    marginBottom: "24px",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "11px",
    color: "#111827",
    backgroundColor: "#ffffff",
    fontSize: "17px",
    lineHeight: 1.35,
    outlineOffset: "2px",
  },
  inputCorrect: {
    border: "2px solid #16a34a",
    backgroundColor: "#f0fdf4",
  },
  inputWrong: {
    border: "2px solid #dc2626",
    backgroundColor: "#fef2f2",
  },
  correctAnswer: {
    margin: "5px 2px 0",
    color: "#dc2626",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.4,
  },
  fieldCorrect: {
    paddingTop: "8px",
    color: "#16a34a",
    fontSize: "21px",
    fontWeight: 800,
  },
  fieldWrong: {
    paddingTop: "8px",
    color: "#dc2626",
    fontSize: "21px",
    fontWeight: 800,
  },
  correct: {
    margin: "12px 0 0",
    color: "#16a34a",
    fontSize: "17px",
    fontWeight: 800,
  },
  wrong: {
    margin: "12px 0 0",
    color: "#dc2626",
    fontSize: "17px",
    fontWeight: 800,
  },
  shortcutHint: {
    margin: "6px 0 0",
    color: "#4b5563",
    fontSize: "14px",
    fontWeight: 600,
  },
  retryButton: {
    width: "100%",
    padding: "12px",
    border: "1px solid #111827",
    borderRadius: "11px",
    color: "#111827",
    backgroundColor: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  nextButton: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "11px",
    color: "#ffffff",
    backgroundColor: "#111827",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  gradeButton: {
    width: "100%",
    marginTop: "8px",
    padding: "12px",
    border: "none",
    borderRadius: "11px",
    color: "#ffffff",
    backgroundColor: "#111827",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  message: {
    textAlign: "center",
    fontSize: "18px",
    padding: "32px",
  },
  error: {
    color: "#dc2626",
    fontWeight: 700,
  },
};
