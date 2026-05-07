# wellness-mcp

Cloudflare Workers + D1 で動作する MCP サーバー。
SwitchBot 温湿度センサーと Oura リングのデータを定期収集し、
claude.ai のカスタムコネクタ経由で健康データを照会できるようにする。

## アーキテクチャ

```
claude.ai ──MCP──▶ Cloudflare Worker (wellness-mcp)
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
           Oura     SwitchBot    D1
           API v2   API v1.1  (sensor_readings)
```

## エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック — `{ ok: true }` を返す |

## スケジュール

`*/10 * * * *`（10分毎）でセンサーデータを収集し D1 に保存する。

## セットアップ

> セットアップ手順は Step 3 で完成予定。

## デプロイ

`main` ブランチへの push で GitHub Actions が自動デプロイ:

1. `npm test` — ユニットテスト
2. `wrangler d1 migrations apply DB --remote` — マイグレーション適用
3. `wrangler deploy` — Worker デプロイ

デプロイ後、Cloudflare ダッシュボードで以下の Worker Secrets を設定すること:

- `OURA_ACCESS_TOKEN`
- `SWITCHBOT_TOKEN`
- `SWITCHBOT_SECRET`
- `MCP_AUTH_TOKEN`
