繁體中文 | [English](./README.md)

# Portaly Skills

[Portaly](https://portaly.cc) 創作者專用的 AI Agent Skill 集合。透過 AI Agent 將 Portaly 服務 — 支付、數位商品 — 整合到任何專案中。

## 安裝

```bash
# 安裝全部
npx skills add portaly-ai/portaly-skills

# 安裝單一 skill
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

## 更新

```bash
# 更新所有已安裝的 skill 到最新版
npx skills update

# 更新單一 skill
npx skills update portaly-payment
```

## Skills 一覽

| Skill | 說明 | 觸發關鍵字 |
|-------|------|-----------|
| **portaly-payment** | Portaly Vibe 託管結帳、訂閱方案、單次購買、動態金額定價、優惠碼、callback 驗證 | `Portaly Vibe 支付`、`訂閱`、`結帳`、`優惠碼`、`單次購買`、`動態定價`、`贊助` |
| **portaly-product** | 從你 vibe-coded 的網站賣創作者的 Portaly 數位商品 — 商品列表 API、單品或 bundle checkout session、託管結帳 + 寄信、簽章 webhook | `Portaly 數位商品`、`bundle 結帳`、`商品 API` |

## Portaly Vibe Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

協助串接 Portaly Vibe 託管支付結帳，包含商家設定、訂閱方案、結帳 session 與 callback 驗證。

- 透過 API 建立商家設定與訂閱方案
- 託管結帳 session 流程
- 固定價格方案（`monthly` / `yearly` 訂閱）與**動態定價方案（dynamic plan）**：適用於單次購買、贊助，或任何金額需要由買家或系統動態決定的場景；實際金額於每次建立結帳 session 時傳入。年費方案採 12 個月遞延性撥款：買家一次付清、創作者每月收到 1/12 淨收入，第 1 期釋出後該訂單即無法退款。
- 優惠碼（Discount Code）— 支援定額／折扣百分比／免費，可重複 N 期或永久，亦可作為註冊推薦碼於結帳時自動套用
- HMAC-SHA256 callback 簽章驗證
- 訂閱生命週期管理（取消 / 恢復）
- 訂閱者自助入口（Self-Service Portal）

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。至 [Portaly Vibe Dashboard](https://portaly.cc/admin/creator-subscription) 申請。

**Skill 觸發條件：**
- 「幫我在 Portaly Vibe 上新增一個訂閱商品」
- 「幫我串接 Portaly Vibe 的支付功能」
- 「我要使用 Portaly Vibe 的支付 API」
- 「請協助我整合 Portaly Vibe 的支付功能」
- 「幫我在 Portaly Vibe 建立優惠碼」
- 「在 Portaly Vibe 加上單次購買或自訂金額的結帳流程」
- 「在 Portaly Vibe 加上贊助功能」

## Portaly Digital Products Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-product
```

協助 vibe coder 在自家網站上販售創作者的 Portaly 數位商品 — 商品展示 UI 由你掌控，Portaly 負責結帳、金流、寄信與訂單成功頁。

- 透過 API 取得創作者商品並在自家網站渲染（價格一律讀 `effectivePrice`）
- 單品或自訂 bundle checkout session，跳轉到 Portaly 託管結帳頁
- Bundle 採原價比例拆價，每筆商品在 Portaly 端各自獨立成單
- HMAC-SHA256 webhook 簽章驗證（timestamp 5 分鐘有效）
- Per-order 事件：`digital_product.checkout.completed`、`digital_product.order.refunded`
- 託管寄信 — 每筆付費訂單一封確認信，免費商品跳過

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`），與 payment skill 共用。至 [Portaly Vibe Dashboard](https://portaly.cc/admin/creator-subscription) 申請。

**Skill 觸發條件：**
- 「在我自己的網站上賣 Portaly 數位商品」
- 「幫我做 Portaly 商品的 bundle 結帳」
- 「在我的網站上列出創作者的下載/模板/課程」
- 「打造一個 powered by Portaly 的商店」
- 「設定 Portaly 數位商品的 webhook」

## 串接到自己的 Server

這些 skill 預設指向 `https://portaly.ai`，直接安裝者不用設定。若 fork 後要串自架或相容後端，設定 `PORTALY_API_HOST` 即可——內建 script 與 Agent 產出的程式碼都會讀：

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

後端相容契約見 [PROVIDER.md](./PROVIDER.md)。

## 從舊 Repo 遷移

如果你之前從獨立的 repository 安裝過 skill：

```bash
rm -rf ~/.claude/skills/portaly-payment-skill
npx skills add portaly-ai/portaly-skills --all -g
```

舊的 repository 已封存：
- `real-engine-tw/portaly-payment-skill`（已封存）

## Windows 注意事項

在 Windows 環境使用支付相關 API 時，PowerShell 可能會有中文編碼問題。請先執行：

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
```

## 授權條款

MIT
