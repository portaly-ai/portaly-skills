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
| **portaly-overview** | Portaly 開放 API 總覽與導航 — 依能力分組的 API 目錄、功能對照 API 的速查表、以及完整 API 文件位置 | `Portaly 能做什麼`、`Portaly 有哪些 API`、`列出 Portaly API`、`Portaly API 文件`、`該裝哪個 Portaly skill`、評估是否要串接 Portaly |
| **portaly-payment** | Portaly Payment 託管結帳、訂閱方案、單次購買、動態金額定價、優惠碼、callback 驗證 | `Portaly Payment 支付`、`訂閱`、`結帳`、`優惠碼`、`單次購買`、`動態定價`、`贊助` |
| **portaly-product** | 從你 vibe-coded 的網站賣創作者的 Portaly 數位商品 — 商品列表 API、單品或 bundle checkout session、託管結帳 + 寄信、簽章 webhook | `Portaly 數位商品`、`bundle 結帳`、`商品 API` |

## Portaly Overview

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-overview
```

導航型 skill — 在你決定串接前，先了解 Portaly 開放 API 能做哪些事，以及該裝哪個 skill。本身不執行任何串接動作。

- 開放 API 能力總覽：訂閱支付、數位商品、優惠碼、訂閱者自助服務、訂單／發票查詢
- 依能力分組的 API 目錄，並指示 agent 從 `llms.txt`／`openapi.json` 即時抓取最新完整端點清單
- 「常見產品功能 → API / skill」對照表
- 指向 Portaly 完整 API 文件：
  - [`portaly.ai/docs`](https://portaly.ai/docs) — 給人看的互動式文件
  - [`portaly.ai/openapi.json`](https://portaly.ai/openapi.json) — 機器可讀的 OpenAPI 規格
  - [`portaly.ai/llms.txt`](https://portaly.ai/llms.txt) — 給 LLM 快速索引用的精簡版
- 依需求導流到 `portaly-payment` 和／或 `portaly-product` 進行實際串接

**Skill 觸發條件：**
- 「Portaly 能做什麼？」
- 「Portaly 有哪些 API？」
- 「Portaly 的 API 文件在哪？」
- 「我該裝哪個 Portaly skill？」
- 「我在評估要不要串接 Portaly 的支付或商品 API」

## Portaly Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

協助串接 Portaly Payment 託管支付結帳，包含商家設定、訂閱方案、結帳 session 與 callback 驗證。

- 透過 API 建立商家設定與訂閱方案
- 託管結帳 session 流程
- 固定價格方案（`monthly` / `yearly` 訂閱）與**動態定價方案（dynamic plan）**：適用於單次購買、贊助，或任何金額需要由買家或系統動態決定的場景；實際金額於每次建立結帳 session 時傳入。年費方案採 12 個月遞延性撥款：買家一次付清、創作者每月收到 1/12 淨收入，第 1 期釋出後該訂單即無法退款。
- 優惠碼（Discount Code）— 支援定額／折扣百分比／免費，可重複 N 期或永久，亦可作為註冊推薦碼於結帳時自動套用
- HMAC-SHA256 callback 簽章驗證
- 訂閱生命週期管理（取消 / 恢復）
- 訂閱者自助入口（Self-Service Portal）

**前置條件：** Portaly Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。還沒有帳號？先至 [portaly.cc/payment](https://portaly.cc/payment) 註冊，再於 [Portaly Payment Dashboard](https://portaly.cc/admin/creator-subscription) 建立金鑰。

**Skill 觸發條件：**
- 「幫我在 Portaly Payment 上新增一個訂閱商品」
- 「幫我串接 Portaly Payment 的支付功能」
- 「我要使用 Portaly Payment 的支付 API」
- 「請協助我整合 Portaly Payment 的支付功能」
- 「幫我在 Portaly Payment 建立優惠碼」
- 「在 Portaly Payment 加上單次購買或自訂金額的結帳流程」
- 「在 Portaly Payment 加上贊助功能」

## Portaly Digital Products Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-product
```

協助 vibe coder 在自家網站上販售創作者的 Portaly 數位商品 — 商品展示 UI 由你掌控，Portaly 負責結帳、金流、寄信與訂單成功頁。

- 透過 API 取得創作者商品並在自家網站渲染（價格一律讀 `effectivePrice`）
- 單品或自訂 bundle checkout session，跳轉到 Portaly 託管結帳頁
- Bundle 採生效價（特價後）比例拆價，每筆商品在 Portaly 端各自獨立成單
- HMAC-SHA256 webhook 簽章驗證（timestamp 5 分鐘有效）
- Per-order 事件：`digital_product.checkout.completed`、`digital_product.order.refunded`
- 託管寄信 — 每筆付費訂單一封確認信，免費商品跳過

**前置條件：** Portaly Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`），與 payment skill 共用。還沒有帳號？先至 [portaly.cc/payment](https://portaly.cc/payment) 註冊，再於 [Portaly Payment Dashboard](https://portaly.cc/admin/creator-subscription) 建立金鑰。

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

## 版本回報（Telemetry）

當環境中已有 Portaly Payment API 金鑰時，每個 skill 會送出一次性、非阻塞的版本回報至 `POST https://portaly.ai/api/creator-subscription/skill-version`。請求內容僅包含 skill 名稱與版本（例如 `{ "skillName": "portaly-payment", "version": "0.5.5" }`）——不含任何專案內容或使用者資料——用途是讓你的 Portaly Dashboard 能偵測已安裝的 skill 是否過期。Agent 會在第一次執行時告知使用者。若要關閉，移除該 skill `SKILL.md` 中的「Report the installed skill version」步驟即可。

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
