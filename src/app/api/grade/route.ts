import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { NextResponse } from "next/server";
import type { GradeResult } from "@/lib/types";

export const runtime = "nodejs";
/** Vercel のサーバーレスが先に切らないよう余裕を持たせる */
export const maxDuration = 60;

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";

/** 数学採点で誤ブロックされやすいカテゴリを緩める */
const GRADE_SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
}));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function errText(e: unknown): string {
  if (e && typeof e === "object" && "status" in e) {
    const fe = e as { message?: string; status?: number; statusText?: string; errorDetails?: unknown };
    const parts = [
      fe.message,
      fe.status != null ? `HTTP ${fe.status}${fe.statusText ? ` ${fe.statusText}` : ""}` : "",
      fe.errorDetails != null ? `details: ${JSON.stringify(fe.errorDetails)}` : "",
    ].filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * 先頭の `{` から対応する `}` までを括弧深度で切り出す（文字列内の `{}` は無視）。
 * `lastIndexOf("}")` だと analysis 内の `}` で誤判定しやすい。
 */
function extractFirstJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  if (start === -1) {
    throw new Error("モデル出力に `{` がありません。先頭200文字: " + s.slice(0, 200));
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  throw new Error("モデル出力から閉じた JSON オブジェクトを切り出せませんでした。先頭400文字: " + s.slice(0, 400));
}

function parseGradeResult(text: string): GradeResult {
  let jsonStr: string;
  try {
    jsonStr = extractFirstJsonObject(text);
  } catch (e) {
    throw new Error(errText(e));
  }
  let parsed: Partial<GradeResult>;
  try {
    parsed = JSON.parse(jsonStr) as Partial<GradeResult>;
  } catch (e) {
    throw new Error(
      `JSON.parse 失敗: ${errText(e)} | 切り出し先頭200文字: ${jsonStr.slice(0, 200)}`,
    );
  }

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

function normalizeModelId(name: string): string {
  return name.replace(/^models\//, "").trim();
}

/**
 * responseMimeType はプレビュー系モデルで失敗することがあるため使わず、
 * プレーンテキストで JSON を返させてパースする。
 */
async function generateGradeRawText(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string,
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: normalizeModelId(modelName),
    safetySettings: GRADE_SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
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

## 出力形式（厳守）
- 次のキーだけを持つ JSON オブジェクトを 1 つだけ出力すること。
- 前後に説明文・Markdown・コードフェンスを付けないこと。
- 文字列は必ず二重引用符で囲むこと（JSON として有効な形式）。
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
        model: normalizeModelId(modelName),
      },
      { status: 502 },
    );
  }
}
