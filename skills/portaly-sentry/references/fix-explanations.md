# Fix Explanations — Plain-Language Copy for 26 Checks

## Use This Reference For

- generating the "最嚴重的 N 件事" list in the summary output (Stage 2)
- rendering the "為什麼要改 / 會影響 / 不會影響" block in the Interactive Fix Workflow (Stage 3)
- keeping user-facing wording consistent across summary and per-item views

Each entry provides:

- **白話標題** — human-readable title shown instead of the technical check name
- **為什麼要改** — 1–2 sentences explaining impact in plain Mandarin, no jargon
- **會影響** — which parts of the user's project a fix touches
- **不會影響** — reassurance about what stays untouched

Severity values match `SKILL.md`. When `SKILL.md` and `health-check-contract.md` disagree, use `SKILL.md` (the skill definition is canonical for the UX layer).

---

## SIG — 付款簽章驗證

### SIG-001 · CRITICAL
- **白話標題**：簽章排序方式跟 Portaly 不一致
- **為什麼要改**：你目前用 `Object.keys().sort()` 依 Unicode 預設順序排欄位，只要 callback 裡有大小寫混合或非 ASCII 字元，算出的 HMAC 就跟 Portaly 不一樣，付款會被你自己的程式當成「簽章驗證失敗」擋掉，訂單卡在付了錢卻沒權限的狀態。
- **會影響**：callback 驗證邏輯（`stableJson` 那段）
- **不會影響**：資料庫、前端、其他 API

### SIG-002 · CRITICAL
- **白話標題**：簽章演算法用錯了（不是 SHA-256）
- **為什麼要改**：Portaly 用 SHA-256 算簽章，你用 MD5 或 SHA-1 算出來的結果必然對不上，每一筆 callback 都會驗證失敗，完全沒有訂單能完成。
- **會影響**：callback 驗證邏輯（`createHmac` 那行）
- **不會影響**：資料庫、前端、其他 API

### SIG-003 · WARNING
- **白話標題**：沒擋「舊 callback 被重播」的攻擊
- **為什麼要改**：callback 有附時戳，但你沒檢查是不是 5 分鐘內發出的。攻擊者只要抓到一筆過去的合法 callback，就能一直重送讓系統以為又收到一次付款，等於免費領訂閱。
- **會影響**：callback handler（在驗簽前多一段時間檢查）
- **不會影響**：資料庫、前端、其他 API

### SIG-004 · CRITICAL
- **白話標題**：簽章比對方式有漏洞（時序攻擊）
- **為什麼要改**：你目前用 `!==` 或 `===` 比對簽章，攻擊者能透過比較速度的微秒差，一個字一個字猜出正確簽章。改用 `crypto.timingSafeEqual` 後，不管對不對花的時間都一樣，線索就不會洩漏。
- **會影響**：callback 驗證邏輯（比對那幾行）
- **不會影響**：資料庫、前端、其他 API

---

## SUB — 訂閱生命週期

### SUB-001 · CRITICAL
- **白話標題**：subscriptionId 沒有存下（之後無法管理訂閱）
- **為什麼要改**：付款完成的 callback 沒把 Portaly 的 `sessionId` 存起來當 `subscriptionId`。之後用戶要取消或查詢訂閱時，你手上沒有 Portaly 認得的 ID，API 一律回 404，客服會被灌爆。
- **會影響**：callback handler 的成功分支、資料庫（多存一個欄位）
- **不會影響**：簽章驗證、前端、結帳流程

### SUB-002 · WARNING
- **白話標題**：同一筆 callback 會被重複處理
- **為什麼要改**：你沒檢查同一個 `sessionId` 是不是已經處理過。Portaly 重試或網路抖動時，同一筆付款可能被處理兩次，造成用戶拿到兩份訂閱期或庫存被扣兩次。
- **會影響**：callback handler（新增一段去重檢查）、資料庫寫入
- **不會影響**：簽章驗證、前端、結帳流程

### SUB-003 · CRITICAL
- **白話標題**：取消訂閱時讀到錯的 ID
- **為什麼要改**：取消／恢復訂閱的程式讀的欄位，跟 callback 當初寫入的欄位不是同一個。呼叫 Portaly 會回 404，用戶想取消卻取消不了，最後只能去銀行申訴 chargeback。
- **會影響**：取消／恢復訂閱的 API 呼叫邏輯
- **不會影響**：結帳流程、callback 驗證、前端

---

## CBK — Callback 端點

### CBK-001 · CRITICAL
- **白話標題**：callbackUrl 用 http:// 而不是 https://
- **為什麼要改**：沒加密的情況下，callback 內容（含簽章、用戶資料、付款狀態）在網路上以明文傳輸，路徑上任何人都能攔截甚至竄改。Portaly 正式環境會直接拒絕非 HTTPS 的 URL。
- **會影響**：建立結帳 session 時傳給 Portaly 的 `callbackUrl` 欄位
- **不會影響**：資料庫、前端、callback 處理邏輯

### CBK-002 · WARNING
- **白話標題**：callback 驗證失敗時沒留下任何線索
- **為什麼要改**：簽章驗證失敗的分支沒寫 log，也沒回 401。之後發生「用戶付了錢但沒拿到權限」時，你完全不知道是哪一步壞掉，只能靠猜。多幾行 log 能省掉幾小時的 debug。
- **會影響**：callback handler 的失敗分支
- **不會影響**：成功流程、資料庫、前端

### CBK-003 · INFO
- **白話標題**：callback 成功時沒明確回 200
- **為什麼要改**：現在靠 framework 預設回應碼。如果之後 middleware 改動，Portaly 可能收到非 200、誤以為你處理失敗，進而重試，結果重複處理同一筆付款。
- **會影響**：callback handler 的成功分支（加一行 `res.status(200)`）
- **不會影響**：驗證邏輯、資料庫、前端

---

## ENV — 環境變數與憑證

### ENV-001 · CRITICAL
- **白話標題**：.env 少了必要的環境變數
- **為什麼要改**：`PORTALY_API_KEY` 或 `PORTALY_CALLBACK_SECRET` 其中一個沒設定，正式環境一跑到結帳或驗證 callback 就會當機。
- **會影響**：`.env`（或 `.env.example` / `.env.local`）
- **不會影響**：程式碼本身、資料庫

### ENV-002 · CRITICAL
- **白話標題**：.env 沒被 .gitignore 擋住
- **為什麼要改**：`.env` 存的是你的商家金鑰。一旦提交到 GitHub，整個 repo 歷史都會有這組金鑰，就算之後刪掉也沒用——網路上早就有爬蟲專門掃 GitHub 找遺漏的憑證。
- **會影響**：`.gitignore`
- **不會影響**：程式碼、資料庫、前端

### ENV-003 · CRITICAL
- **白話標題**：原始碼裡硬編了 API Key 或 callback 金鑰
- **為什麼要改**：金鑰字串直接寫在程式碼（不是從 env 讀），一 push 到 repo 就等同公開。之後要換金鑰也必須改程式、重新部署才能生效，緊急輪換來不及。
- **會影響**：找到硬編金鑰的那幾個檔案（改為 `process.env.XXX`）
- **不會影響**：資料庫、前端、其他商業邏輯

---

## SEC — 安全最佳實踐

### SEC-001 · CRITICAL
- **白話標題**：金鑰不小心暴露在瀏覽器端
- **為什麼要改**：callback 金鑰或 API Key 出現在前端 bundle、`public/` 資料夾或 `NEXT_PUBLIC_` 開頭的變數裡，任何人打開 F12 就看得到，等於把金庫鑰匙掛在大門上。
- **會影響**：找到金鑰的前端檔案（把邏輯搬到 server-side）
- **不會影響**：後端 callback 驗證邏輯、資料庫

### SEC-002 · INFO
- **白話標題**：沒留 callback 處理紀錄
- **為什麼要改**：完全沒記錄哪些 `sessionId` 被處理過。之後用戶申訴「我付錢但沒開通」時，你連查都沒地方查。不用整包存，至少把 `sessionId`、`status` 和時間寫進 log 或一張 audit table 即可。
- **會影響**：callback handler（多幾行 log 或新增一張 audit table）
- **不會影響**：驗證邏輯、前端、既有業務流程

### SEC-003 · INFO
- **白話標題**：金鑰沒從 env 讀，要輪換金鑰就得改程式
- **為什麼要改**：萬一金鑰外洩要緊急輪換時，得改原始碼、測試、重新部署才能生效。從 `process.env` 讀就只要改環境變數重啟。
- **會影響**：把硬編值改為從 env 讀
- **不會影響**：資料庫、前端、業務邏輯

### SEC-004 · WARNING
- **白話標題**：callback 端點開了全網站 CORS（`*`）
- **為什麼要改**：callback 端點只該接受 Portaly server 打進來的請求，不該讓瀏覽器跨站呼叫。`Access-Control-Allow-Origin: *` 等於開門讓任何網站的 JavaScript 都能探測你的 API，增加攻擊面。
- **會影響**：callback 路由的 CORS 設定
- **不會影響**：Portaly 自己發來的 callback、結帳流程

### SEC-005 · INFO
- **白話標題**：付款相關頁面沒設 Content-Security-Policy
- **為什麼要改**：沒 CSP 的情況下，如果頁面有 XSS 漏洞，攻擊者可以注入腳本偷用戶刷卡資訊。設了 CSP 等於多一道保險，即使有漏洞也很難被利用。
- **會影響**：success／cancel／checkout 重導頁的 HTTP header
- **不會影響**：後端 API、資料庫、callback 邏輯

---

## WEB — Web 安全基本功

### WEB-001 · CRITICAL
- **白話標題**：成功／取消頁的網址可以被偽造（open redirect）
- **為什麼要改**：使用者提供的 `successRedirectUrl`、`cancelRedirectUrl` 沒檢查網域就送給 Portaly。攻擊者可以做一組「付款後跳到釣魚站」的連結到處散發，用戶看前面是你家合法金流頁就信了，最後在釣魚站輸入卡號。
- **會影響**：建立結帳 session 的程式（加網域白名單檢查）
- **不會影響**：資料庫、callback 驗證、前端其他頁面

### WEB-002 · WARNING
- **白話標題**：錯誤訊息洩漏內部細節
- **為什麼要改**：`catch` 直接把完整 stack trace、檔案路徑或 DB 錯誤回給呼叫端。攻擊者可以從這些資訊反推你用什麼框架、哪個檔案、什麼資料庫，加速找漏洞的速度。
- **會影響**：錯誤處理分支的回應內容
- **不會影響**：成功流程、資料庫、業務邏輯

### WEB-003 · WARNING
- **白話標題**：callback 沒檢查 Content-Type
- **為什麼要改**：沒檢查的話，攻擊者可以用 `text/plain` 或 `multipart/form-data` 送 request 來繞過某些框架的 body 解析或驗簽。Next.js 多半會自動處理，Express 或裸 server 要自己加一行驗證。
- **會影響**：callback 路由（多一行 Content-Type 驗證）
- **不會影響**：驗證通過後的處理邏輯

### WEB-004 · WARNING
- **白話標題**：callback 沒限制請求大小
- **為什麼要改**：攻擊者可以送超大的 body 把你的 Node 程序記憶體撐爆，造成服務掛掉（DoS）。Next.js 預設 4.5MB 上限，Express 要自己設 `limit`。
- **會影響**：body parser 設定
- **不會影響**：驗證邏輯、資料庫、正常尺寸的 callback

---

## DEP — 依賴套件安全

### DEP-001 · CRITICAL
- **白話標題**：有套件被登記為已知漏洞
- **為什麼要改**：`npm audit` 掃到正式環境用的套件有 critical 等級的 CVE。攻擊者會用自動化工具掃描線上服務版本，挑有漏洞的下手。這類漏洞通常有公開的利用範例，不升級等於把鑰匙留在門口。
- **會影響**：`package.json`、lock file（升版）
- **不會影響**：你自己寫的程式邏輯（除非該套件有 breaking change，會在升版時提醒）

### DEP-002 · WARNING
- **白話標題**：缺少 lock file（不同環境裝到不同版本）
- **為什麼要改**：沒有 `package-lock.json` / `pnpm-lock.yaml`，你本機裝到的跟正式環境裝到的可能是不同小版本。哪天正式環境自動升到有 bug 或有漏洞的版本，你都不會察覺。
- **會影響**：專案根目錄會多一個 lock file
- **不會影響**：程式碼、資料庫、前端

---

## DATA — 資料處理安全

### DATA-001 · WARNING
- **白話標題**：callback 資料沒驗證就寫進資料庫
- **為什麼要改**：沒檢查 `sessionId` 是不是字串、`amount` 是不是正數。萬一 Portaly 格式變動或 body 損毀，你資料庫會塞進壞資料，之後報表、對帳都會翻車。
- **會影響**：callback handler 在寫入資料庫前的驗證邏輯
- **不會影響**：簽章驗證、前端、結帳流程

### DATA-002 · WARNING
- **白話標題**：Log 裡面有完整金鑰或用戶 PII
- **為什麼要改**：你現在 `console.log(req.body)` 把完整 callback 印出來，裡面可能有用戶 email、付款參考號甚至金鑰前綴。Log 通常存在 Datadog / CloudWatch 等有較多人可看的系統，等於把機密洩漏出去，還可能違反 GDPR 或個資法。
- **會影響**：所有 `console.log` / `logger.info` 的內容（改成只印 `sessionId` 和 `status`）
- **不會影響**：業務邏輯、資料庫、前端
