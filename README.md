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

## Worker Secrets の設定手順

初回デプロイ後、以下の手順で Secrets を登録してください。

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) を開く
2. **Workers & Pages** → **wellness-mcp** → **Settings** → **Variables and Secrets** へ移動
3. **Add** ボタンを押し、以下の 4 つを **Type: Secret** で登録する

| 変数名 | 説明 |
|--------|------|
| `OURA_ACCESS_TOKEN` | Oura Cloud の Personal Access Token |
| `SWITCHBOT_TOKEN` | SwitchBot アプリ → プロフィール → 開発者オプション → Token |
| `SWITCHBOT_SECRET` | 同 Secret |
| `MCP_AUTH_TOKEN` | 任意の長いランダム文字列（MCP クライアントが Bearer で送る） |

4. 登録後、**Deploy** ページからリデプロイ（または次の push を待つ）して Secrets を有効化する

> セットアップ完了後の手順は Step 3 で追記予定。

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
