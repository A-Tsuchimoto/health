# wellness-mcp — Claude 引き継ぎドキュメント

## プロジェクト概要

Cloudflare Workers + D1 で構築した MCP サーバー。
SwitchBot 温湿度センサーと Oura リングのデータを 10 分毎に収集し、
claude.ai カスタムコネクタ経由で健康データを自然言語で照会できる。

**現在の状態: Step 1〜2 完了（実装・テスト・デプロイワークフロー済み）**

---

## 技術スタック

| 役割 | パッケージ |
|------|-----------|
| HTTP ルーター | Hono v4 |
| MCP プロトコル | @modelcontextprotocol/sdk + agents (Cloudflare) |
| MCP transport | Streamable HTTP (`createMcpHandler` from `agents/mcp`) |
| ランタイム | Cloudflare Workers |
| データベース | Cloudflare D1 (SQLite) |
| テスト | Vitest (node 環境、全モック) |

---

## インフラ情報

### D1 データベース
- database_name: `sensor-history`
- database_id: `966517ba-1cce-4a51-8a2b-442abacfefd1`
- binding 名: `DB`（コードでは `env.DB` でアクセス）

### GitHub Secrets（登録済み）
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Worker Secrets（デプロイ後にダッシュボードで設定）
- `OURA_CLIENT_ID` — Oura Developer Portal で発行する OAuth Client ID
- `OURA_CLIENT_SECRET` — 同 Client Secret
- `SWITCHBOT_TOKEN` — SwitchBot アプリの Developer Options で取得
- `SWITCHBOT_SECRET` — 同 Client Secret
- `MCP_AUTH_TOKEN` — MCP クライアントが Bearer で送るランダム文字列

コードでは `env.XXX` として参照（`src/types.ts` の `Env` interface）。

---

## 絶対に守る制約

1. **wrangler コマンドはこのサンドボックス内で一切実行しない**
   - `wrangler deploy`, `wrangler dev`, `wrangler d1`, `wrangler secret` など全て禁止
   - デプロイは GitHub Actions (`cloudflare/wrangler-action@v3`) のみ
2. **ローカル開発用スクリプトを追加しない**（`npm run dev` 等）
3. **外部 API への実通信はしない** — テストでは必ずモック (`vi.fn()`)
4. **検証は `npm test` と `npx tsc --noEmit` のみ**

---

## ディレクトリ構成

```
wellness-mcp/
├── migrations/
│   └── 0001_init.sql          # sensor_readings テーブル
├── src/
│   ├── types.ts               # Env インターフェース
│   ├── index.ts               # Hono app + scheduled handler
│   ├── scheduled.ts           # cron 処理（SwitchBot → D1）
│   ├── db/
│   │   ├── index.ts           # (空スタブ)
│   │   └── queries.ts         # insertReading / getRecentReadings / getReadingsInRange
│   ├── mcp/
│   │   ├── index.ts           # (空スタブ)
│   │   └── server.ts          # buildMcpServer(env) — 7 ツール定義
│   ├── oura/
│   │   ├── index.ts           # (空スタブ)
│   │   └── client.ts          # OuraClient — sleep/readiness/activity/heartrate
│   └── switchbot/
│       ├── index.ts           # (空スタブ)
│       └── client.ts          # SwitchBotClient — HMAC-SHA256 署名
├── .github/workflows/
│   ├── deploy.yml             # main push → test → D1 migrate → deploy
│   └── test.yml               # PR / main 以外 → npm test + tsc
├── wrangler.toml              # compatibility_flags = ["nodejs_compat"] 必須
├── package.json
└── tsconfig.json
```

---

## sensor_readings テーブルスキーマ

```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
device_id   TEXT    NOT NULL
device_name TEXT
temperature REAL
humidity    INTEGER
battery     INTEGER
recorded_at INTEGER NOT NULL  -- Unix timestamp (秒)
```

インデックス: `(device_id, recorded_at)`

---

## Oura OAuth 2.0 フロー

Oura API v2 は Authorization Code フロー（PKCE なし、client_secret あり）を使う。

- Authorization URL: `https://cloud.ouraring.com/oauth/authorize`
- Token URL: `https://api.ouraring.com/oauth/token`
- Scopes: `daily heartrate`
- トークンは D1 の `oauth_tokens` テーブルに保存（provider = 'oura'）
- 有効期限 5 分前に `refresh_token` で自動更新
- 初回認証: ブラウザで `/oura/auth?token=<MCP_AUTH_TOKEN>` を開く
  → Oura の認可画面 → Allow → `/oura/callback` でコード交換 → D1 保存

実装: `src/oura/auth.ts`（startOAuthFlow / handleOAuthCallback / getValidToken）

## MCP エンドポイントのアーキテクチャ

- **Bearer 認証**: Hono ミドルウェアで `Authorization` ヘッダーを確認
  - `crypto.subtle.digest('SHA-256')` でハッシュ化した後に全バイト XOR 比較（timing-safe）
- **MCP サーバー生成**: リクエストごとに `buildMcpServer(env)` を呼び、env をクロージャに閉じ込める
  - `createMcpHandler` が env を受け取らないため、この方式を採用
- **Transport**: `agents/mcp` の `createMcpHandler` が Streamable HTTP を自動処理

### 登録済みツール一覧

| ツール名 | データソース | 説明 |
|---------|------------|------|
| `oura_daily_sleep` | Oura API | 日別睡眠スコア |
| `oura_daily_readiness` | Oura API | 日別レディネス |
| `oura_daily_activity` | Oura API | 日別アクティビティ |
| `oura_heart_rate` | Oura API | 心拍数サンプル |
| `list_switchbot_devices` | SwitchBot API | デバイス一覧 |
| `switchbot_current_status` | SwitchBot API | 現在の温湿度（直接取得） |
| `switchbot_history` | D1 | 温湿度履歴（蓄積データ） |

---

## SwitchBot API 署名仕様

```
t     = Date.now().toString()
nonce = crypto.randomUUID()
sign  = HMAC-SHA256(token + t + nonce, secret).toUpperCase()

Headers: Authorization=token, sign=sign, t=t, nonce=nonce
```

実装: `src/switchbot/client.ts` の `buildHeaders()`

---

## デプロイフロー

```
git push origin main
  → GitHub Actions (deploy.yml):
      npm ci
      npm test
      wrangler d1 migrations apply DB --remote
      wrangler deploy
```

---

## テスト構成

| テストファイル | 内容 |
|--------------|------|
| `src/switchbot/client.test.ts` | 署名ヘッダー検証、エラーハンドリング (4 tests) |
| `src/oura/client.test.ts` | クエリパラメータ、Bearer 認証ヘッダー (6 tests) |
| `src/db/queries.test.ts` | SQL バインディング確認 (4 tests) |
| `src/scheduled.test.ts` | Meter フィルタ、個別デバイス失敗時の継続 (3 tests) |
| `src/__tests__/health.test.ts` | /health エンドポイント (1 test) |

合計: **18 tests**。外部 API・D1・SwitchBotClient はすべて `vi.fn()` でモック。

---

## 既知の制約・注意事項

### agents パッケージ
- `agents@0.12.3` は **zod v4** が必要（`package.json` に `"zod": "^4.0.0"` を明記）
- `createMcpHandler` の import パスは `agents/mcp`（`agents` 直接ではない）
- health.test.ts では `vi.mock('agents/mcp', ...)` が必要（Node.js で `cloudflare:` プロトコル URL が解決できないため）

### wrangler.toml
- `compatibility_flags = ["nodejs_compat"]` が必須（`agents` 経由で node:crypto 等を使用）

### SwitchBot
- Bluetooth 単体デバイスはクラウド API では取得できない（ハブ経由が必要）
- `deviceType.includes('Meter')` でフィルタリング（MeterPlus / WoIOSensor も含む）

---

## 後続セッションで追加検討できる機能

- Oura メトリクス追加（SpO2, VO2max, stress, resilience）
- SwitchBot 以外のセンサー（Nature Remo, SwitchBot プラグ等）
- 週間・月間集計ビュー MCP ツール
- D1 の古いレコード自動削除（retention policy）
- Multiple user 対応（認証の拡張）
