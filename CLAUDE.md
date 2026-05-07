# wellness-mcp — Claude引き継ぎドキュメント

## プロジェクト概要

Cloudflare Workers + D1 で構築する MCP サーバー。
SwitchBot 温湿度センサーと Oura リングのデータを定期収集し、
claude.ai カスタムコネクタ経由で健康データを照会できるようにする。

## 技術スタック

| 役割 | パッケージ |
|------|-----------|
| HTTPルーター | Hono v4 |
| MCPプロトコル | @modelcontextprotocol/sdk |
| ランタイム | Cloudflare Workers |
| データベース | Cloudflare D1 (SQLite) |
| テスト | Vitest (node環境) |

## インフラ情報

### D1 データベース
- database_name: `sensor-history`
- database_id: `966517ba-1cce-4a51-8a2b-442abacfefd1`
- binding名: `DB`（コードでは `env.DB` でアクセス）

### GitHub Secrets（登録済み）
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Worker Secrets（デプロイ後にダッシュボードで設定）
- `OURA_ACCESS_TOKEN`
- `SWITCHBOT_TOKEN`
- `SWITCHBOT_SECRET`
- `MCP_AUTH_TOKEN`

コードでは `env.XXX` として参照する（src/index.ts の `Env` interface を参照）。

## 絶対に守る制約

1. **wrangler コマンドはこのサンドボックス内で一切実行しない**
   - `wrangler deploy`, `wrangler dev`, `wrangler d1`, `wrangler secret` など全て禁止
   - デプロイは GitHub Actions (`cloudflare/wrangler-action@v3`) のみ
2. **ローカル開発用スクリプトを追加しない**（`npm run dev` 等）
3. **外部APIへの実通信はしない** — テストでは必ずモック
4. **検証は `npm test` と `tsc --noEmit` のみ**

## ディレクトリ構成

```
wellness-mcp/
├── migrations/
│   └── 0001_init.sql          # sensor_readings テーブル
├── src/
│   ├── index.ts               # Hono app + scheduled handler stub
│   ├── db/                    # D1 アクセスレイヤー（Step 2で実装）
│   ├── mcp/                   # MCPツール定義（Step 2で実装）
│   ├── oura/                  # Oura API クライアント（Step 2で実装）
│   └── switchbot/             # SwitchBot API クライアント（Step 2で実装）
├── .github/workflows/
│   ├── deploy.yml             # main push → 本番デプロイ
│   └── test.yml               # PR / main以外 push → テストのみ
├── wrangler.toml
├── package.json
└── tsconfig.json
```

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

## 後続セッションへの引き継ぎ（Step 2の作業）

### 優先度順タスク

1. **src/switchbot/index.ts** — SwitchBot API からデバイス一覧と温湿度を取得する関数
   - `GET /v1.1/devices` でデバイス一覧
   - `GET /v1.1/devices/{deviceId}/status` でステータス取得
   - HMAC-SHA256 署名（`env.SWITCHBOT_TOKEN`, `env.SWITCHBOT_SECRET`）

2. **src/oura/index.ts** — Oura API v2 クライアント
   - `GET /v2/usercollection/daily_sleep` など
   - Bearer トークン認証（`env.OURA_ACCESS_TOKEN`）

3. **src/db/index.ts** — D1 への読み書き関数
   - `insertSensorReading(db: D1Database, reading: SensorReading)`
   - `getRecentReadings(db: D1Database, deviceId: string, limit: number)`

4. **src/index.ts の scheduled handler** — 上記を組み合わせて10分毎に実行

5. **src/mcp/index.ts** — MCP ツール定義
   - `get_sensor_history`, `get_sleep_summary` などのツールを登録
   - `MCP_AUTH_TOKEN` でリクエストを認証

### テスト方針
- 外部API呼び出しは `vi.fn()` でモック
- D1 は `@miniflare/d1` またはインメモリ SQLite でモック
- `npm test` と `npx tsc --noEmit` が通ること

## デプロイフロー

```
git push origin main
  → GitHub Actions: npm ci → npm test
  → wrangler d1 migrations apply DB --remote
  → wrangler deploy
```

Worker URL は Cloudflare ダッシュボードで確認後、Step 2 で `claude.ai` カスタムコネクタに登録する。
