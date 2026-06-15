'use client'

import { useEffect, useMemo, useState } from "react";

type Question = {
  question: string;
  answer: string;
  category: string;
  importance: string;
};

type Mode = "normal" | "wrong";

const categoryLabels: Record<string, string> = {
  all: "全部",
  theme01: "テーマ1",
  theme02: "テーマ2",
  theme03: "テーマ3",
  theme04: "テーマ4",
  theme05: "テーマ5",
  theme06: "テーマ6",
  theme07: "テーマ7",
  theme08: "テーマ8",
  theme09: "テーマ9",
  theme10: "テーマ10",
  theme11: "テーマ11",
  theme12: "テーマ12",
  theme13: "テーマ13",
  theme14: "テーマ14",
  theme15: "テーマ15",
};

const importanceLabels: Record<string, string> = {
  all: "重要度 全部",
  A: "重要度 A",
  B: "重要度 B",
  C: "重要度 C",
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export default function Page() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedImportance, setSelectedImportance] = useState("all");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  const [wrongMap, setWrongMap] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>("normal");
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wrongMap");
      if (saved) setWrongMap(JSON.parse(saved));
    } catch {
      localStorage.removeItem("wrongMap");
      setWrongMap({});
    }
  }, []);

  useEffect(() => {
    async function loadCSV() {
      try {
        const controller = new AbortController();

const timer = setTimeout(() => {
  controller.abort();
}, 5000);

const res = await fetch(`/questions.csv?v=${Date.now()}`, {
  signal: controller.signal,
});

clearTimeout(timer);
        if (!res.ok) throw new Error("questions.csv が見つかりません。");

        const text = await res.text();
        const normalized = text
          .replace(/\uFEFF/g, "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim();

        if (!normalized) throw new Error("questions.csv が空です。");

        const data = normalized
          .split("\n")
          .map((line) => parseCSVLine(line))
          .filter((parts) => parts.length >= 3)
          .map((parts) => ({
            question: parts[0].trim(),
            answer: parts[1].trim(),
            category: parts[2].trim(),
            importance: parts[3]?.trim() || "A",
          }))
          .filter((q) => q.question && q.answer && q.category)
          .filter(
            (q) =>
              !(
                q.question.toLowerCase() === "question" &&
                q.answer.toLowerCase() === "answer" &&
                q.category.toLowerCase() === "category"
              )
          );

        if (data.length === 0) {
          throw new Error("読み込める問題がありません。CSVの列を確認してください。");
        }

        setQuestions(data);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : "CSVの読み込みに失敗しました。");
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
      const categoryOK = selectedCategory === "all" || q.category === selectedCategory;
      const importanceOK = selectedImportance === "all" || q.importance === selectedImportance;
      return categoryOK && importanceOK;
    });
  }, [questions, selectedCategory, selectedImportance]);

  const wrongFilteredQuestions = useMemo(() => {
    return filteredQuestions.filter((q) => wrongMap[q.question] !== undefined);
  }, [filteredQuestions, wrongMap]);

  const currentQuestions = mode === "wrong" ? wrongFilteredQuestions : filteredQuestions;
  const currentQuestion = currentQuestions[index];

  useEffect(() => {
    setIndex(0);
    setAnswer("");
    setResult("");
  }, [selectedCategory, selectedImportance, mode]);

  const saveWrongMap = (updated: Record<string, number>) => {
    setWrongMap(updated);
    localStorage.setItem("wrongMap", JSON.stringify(updated));
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;

    const currentCount = wrongMap[currentQuestion.question];

    if (currentCount === undefined) {
      setResult("正解");
      return;
    }

    const nextCount = currentCount + 1;
    const updated = { ...wrongMap };

    if (nextCount >= 5) {
      delete updated[currentQuestion.question];
      setResult("正解：5回正解したのでミス復習から卒業");
    } else {
      updated[currentQuestion.question] = nextCount;
      setResult(`正解：連続正解 ${nextCount}/5`);
    }

    saveWrongMap(updated);
  };

  const handleWrong = () => {
    if (!currentQuestion) return;

    setResult(`不正解：正解は「${currentQuestion.answer}」`);
    saveWrongMap({
      ...wrongMap,
      [currentQuestion.question]: 0,
    });
  };

  const nextQuestion = () => {
    if (currentQuestions.length === 0) return;
    setIndex((prev) => (prev + 1) % currentQuestions.length);
    setAnswer("");
    setResult("");
  };

  const handleEnter = () => {
    if (!currentQuestion) return;

    if (result === "") {
      if (answer.trim().includes(currentQuestion.answer.trim())) {
        handleCorrect();
      } else {
        handleWrong();
      }
    } else {
      nextQuestion();
    }
  };

  const resetView = () => {
    setIndex(0);
    setAnswer("");
    setResult("");
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>財務諸表論 穴埋めアプリ</h1>
          <p>読み込み中...</p>
        </section>
      </main>
    );
  }

  if (csvError) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>財務諸表論 穴埋めアプリ</h1>
          <p style={styles.error}>{csvError}</p>
          <p>public/questions.csv を確認してください。</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>財務諸表論 穴埋めアプリ</h1>

        <div style={styles.buttons}>
          <button style={chip(mode === "normal")} onClick={() => setMode("normal")}>
            通常
          </button>
          <button style={chip(mode === "wrong")} onClick={() => setMode("wrong")}>
            ミス復習
          </button>
        </div>

        <div style={styles.buttons}>
          {categories.map((category) => (
            <button
              key={category}
              style={chip(selectedCategory === category)}
              onClick={() => {
                setSelectedCategory(category);
                resetView();
              }}
            >
              {categoryLabels[category] ?? category}
            </button>
          ))}
        </div>

        <div style={styles.buttons}>
          {["all", "A", "B", "C"].map((importance) => (
            <button
              key={importance}
              style={chip(selectedImportance === importance)}
              onClick={() => {
                setSelectedImportance(importance);
                resetView();
              }}
            >
              {importanceLabels[importance]}
            </button>
          ))}
        </div>

        {currentQuestions.length === 0 ? (
          <p style={styles.message}>該当する問題がありません。</p>
        ) : (
          <>
            <p style={styles.info}>
              {index + 1} / {currentQuestions.length} 問　ミス登録：{Object.keys(wrongMap).length}問
            </p>

            <div style={styles.questionBox}>
              <p style={styles.question}>{currentQuestion.question}</p>
            </div>

            <input
              style={styles.input}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEnter();
              }}
              placeholder="解答を入力してEnter"
              autoFocus
            />

            {result && (
              <p style={result.startsWith("正解") ? styles.correct : styles.wrong}>
                {result}
              </p>
            )}

            <button style={styles.nextButton} onClick={result ? nextQuestion : handleEnter}>
              {result ? "次の問題へ" : "採点"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

const chip = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? "#fde68a" : "#ffffff",
  border: active ? "1px solid #f59e0b" : "1px solid #d1d5db",
  borderRadius: "9999px",
  padding: "8px 14px",
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
});

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "32px 16px",
    color: "#111827",
  },
  card: {
    maxWidth: "760px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: {
    textAlign: "center",
    fontSize: "26px",
    marginBottom: "24px",
  },
  buttons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "16px",
  },
  info: {
    color: "#6b7280",
    marginTop: "20px",
  },
  questionBox: {
    backgroundColor: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "20px",
    marginBottom: "18px",
  },
  question: {
    fontSize: "20px",
    lineHeight: 1.8,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    padding: "14px",
    fontSize: "18px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    marginBottom: "14px",
    color: "#111827",
  },
  correct: {
    color: "#2563eb",
    fontWeight: 700,
    fontSize: "18px",
  },
  wrong: {
    color: "#dc2626",
    fontWeight: 700,
    fontSize: "18px",
  },
  nextButton: {
    width: "100%",
    padding: "14px",
    fontSize: "18px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    marginTop: "10px",
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