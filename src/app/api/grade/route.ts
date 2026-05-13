import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import type { GradeResult } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("モデル出力から JSON オブジェクトを検出できませんでした");
  }
  return s.slice(start, end + 1);
}

function parseGradeResult(text: string): GradeResult {
  const jsonStr = extractJsonObject(text);
  const parsed = JSON.parse(jsonStr) as Partial<GradeResult>;
  const score = typeof parsed.score === "number" ? Math.max(0, Math.min(10, parsed.score)) : 0;
  const maxScore =
    typeof parsed.maxScore === "number" ? Math.max(1, Math.min(10, parsed.maxScore)) : 10;
  const points = Array.isArray(parsed.points)
    ? parsed.points.map((x) => String(x)).filter(Boolean)
    : [];
  const analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";
  const rubricHits =
    parsed.rubricHits && typeof parsed.rubricHits === "object" ? parsed.rubricHits : undefined;

  return {
    score,
    maxScore,
    points,
    analysis,
    rubricHits,
  };
}

async function withRetries<T>(fn: () => Promise<T>, opts?: { max?: number }): Promise<T> {
  const max = opts?.max ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = errText(e);
      const retryable =
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("503");
      if (!retryable || attempt === max - 1) throw e;
      const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

const gradeSchemaHint = `{
  "score": number,
  "maxScore": 10,
  "points": string[],
  "analysis": string,
  "rubricHits": { "キー": boolean }
}`;

/**
 * gemini-3.1-flash-lite-preview 等では responseMimeType: application/json が
 * 未対応・不安定なことがあるため、通常のテキスト生成のみ行い JSON はプロンプトで指示してパースする。
 */
async function generateGradeRawText(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string,
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
    },
  });
  const res = await withRetries(() => model.generateContent(prompt));
  let text: string;
  try {
    text = res.response.text();
  } catch (e) {
    throw new Error(`応答テキストの取得に失敗しました: ${errText(e)}`);
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("モデルから空の応答が返りました（ブロックやフィルタの可能性があります）");
  }
  return trimmed;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が未設定です。Vercel の環境変数または .env.local を確認してください。" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です" }, { status: 400 });
  }

  const b = body as {
    predictedProblemText?: string;
    canonicalPolicy?: string;
    userAnswer?: string;
  };

  const predictedProblemText = (b.predictedProblemText ?? "").trim();
  const canonicalPolicy = (b.canonicalPolicy ?? "").trim();
  const userAnswer = (b.userAnswer ?? "").trim();

  if (!canonicalPolicy || !userAnswer) {
    return NextResponse.json(
      { error: "canonicalPolicy と userAnswer は必須です" },
      { status: 400 },
    );
  }

  const prompt = `あなたは数学の「方針解答」の採点者です。以下のルーブリック（正解方針の本質項目と到達過程）に照らし、ユーザーの回答が本質を捉えているか、文章として破綻がないかを評価してください。

【予測問題文】
${predictedProblemText || "（なし）"}

【ルーブリック（正解方針・採点基準）】
${canonicalPolicy}

【ユーザーの方針回答】
${userAnswer}

## 採点ルール
- 満点は10点。ルーブリックの各本質項目がユーザーの文章に十分反映されているかで減点。
- 数式の細部の誤りより「方針の筋の良さ」「論理のつながり」「結論への道筋」を重視。
- 空回し・問題文と無関係な一般論のみの場合は低めの点数。
- points は短い箇条書き（日本語）で良い点/改善点を2〜5件。
- analysis は2〜4文の日本語で総評。

## 出力形式
次のキーだけを持つ JSON オブジェクトを 1 つだけ返してください（前後に説明文や Markdown を付けないでください）。
${gradeSchemaHint}`;

  const modelName =
    (process.env.GEMINI_GRADING_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const raw = await generateGradeRawText(genAI, modelName, prompt);
    const grade = parseGradeResult(raw);
    return NextResponse.json({ grade });
  } catch (e) {
    const message = errText(e);
    return NextResponse.json(
      {
        error: "採点 API でエラーが発生しました",
        detail: message,
        model: modelName,
      },
      { status: 502 },
    );
  }
}
