# fffff

Focus Gold 数学の「方針暗記」用の個人向け Next.js アプリです。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に GEMINI_API_KEY を設定
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GEMINI_API_KEY` | はい | Google AI の API キー |
| `GEMINI_GRADING_MODEL` | いいえ | 未設定時は `gemini-3.1-flash-lite-preview` |

## デプロイ（Vercel）

プロジェクトルートをこの `web` フォルダにし、Vercel の Environment Variables に `GEMINI_API_KEY` を設定してください。
