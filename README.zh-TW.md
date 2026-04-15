繁體中文 | [English](./README.md)

# Portaly Skills

[Portaly](https://portaly.cc) 創作者專用的 AI Agent Skill 集合。透過 AI Agent 將 Portaly 服務 — 分析、支付 — 整合到任何專案中。

## 安裝

```bash
# 安裝全部
npx skills add portaly-ai/portaly-skills

# 安裝單一 skill
npx skills add portaly-ai/portaly-skills --skill portaly-analytics
```

## Skills 一覽

| Skill | 說明 | 觸發關鍵字 |
|-------|------|-----------|
| **portaly-analytics** | GA4 分析安裝、Portaly 事件追蹤、儀表板連結 | `GA4`、`Google Analytics`、`事件追蹤` |
| **portaly-payment** | Portaly Vibe 託管結帳、訂閱方案、callback 驗證 | `Portaly Vibe 支付`、`訂閱`、`結帳` |

## Portaly Analytics Integration

協助創作者在網站安裝 Google Analytics 4，並連結到 Portaly 後台查看分析數據。

- 支援 Next.js（App Router / Pages Router）、React SPA、純 HTML 的 GA4 安裝
- 5 個 Portaly 標準事件 + GA4 電商事件對應
- Portaly 後台 GA 授權連結流程

**前置條件：** Google Analytics 4 帳號與 Measurement ID（`G-XXXXXXX`），以及 Portaly 帳號。

## Portaly Vibe Payment Integration

協助串接 Portaly Vibe 託管支付結帳，包含商家設定、訂閱方案、結帳 session 與 callback 驗證。

- 透過 API 建立商家設定與訂閱方案
- 託管結帳 session 流程
- HMAC-SHA256 callback 簽章驗證
- 訂閱生命週期管理（取消 / 恢復）
- 訂閱者自助入口（Self-Service Portal）

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。至 [Portaly 管理後台](https://portaly.cc/admin/creator-subscription) 申請。

## 從舊 Repo 遷移

如果你之前從獨立的 repository 安裝過 skill：

```bash
rm -rf ~/.claude/skills/portaly-analytics-skill
rm -rf ~/.claude/skills/portaly-payment-skill
npx skills add portaly-ai/portaly-skills --all -g
```

舊的 repository 已封存：
- `real-engine-tw/portaly-analytics-skill`（已封存）
- `real-engine-tw/portaly-payment-skill`（已封存）

## Windows 注意事項

在 Windows 環境使用支付相關 API 時，PowerShell 可能會有中文編碼問題。請先執行：

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
```

## 授權條款

MIT
