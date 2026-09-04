# 中英快譯 ZH→EN（Chrome 擴充功能）v1.1

兩個模式，同一個視窗：

- **翻譯**：輸入中文，立刻翻成英文。單字、片語、長句、整段都可以，一鍵複製。
- **圖片提示詞**：用中文描述畫面，直接產出 Stable Diffusion / ComfyUI 用的**正向 + 負面提示詞**。

不需要註冊、不需要 API key。

## 安裝（約 30 秒）

1. 解壓縮 `zh2en-translator.zip`（解出來的資料夾裡直接就有 `manifest.json`）。
2. 把資料夾放到不會刪掉的位置，例如「文件」。
3. Chrome 網址列輸入 `chrome://extensions` 並 Enter。
4. 右上角打開「**開發人員模式 / Developer mode**」。
5. 左上角「**載入未封裝項目 / Load unpacked**」→ 選那個資料夾。
6. 點工具列拼圖圖示，把「中英快譯」釘選起來。

> 更新版本時：解壓新版覆蓋原資料夾，回 `chrome://extensions` 按該擴充功能上的**重新載入（⟳）**即可。
> 資料夾刪掉或搬走，擴充功能就會失效。

## 用法

打開視窗：點工具列圖示，或按 `Ctrl + Shift + Z`（Mac 是 `Cmd + Shift + Z`）。
兩個模式共用同一個輸入框，打字停頓約半秒會自動處理，`Ctrl + Enter` 立即執行並自動複製。

### 翻譯模式

- 打中文 → 出英文。
- `中 → 英 ⇄` 可切成英翻中。
- 下方保留最近 3 筆紀錄，點一下填回輸入框。

### 圖片提示詞模式

用中文描述畫面，例如：

> 黃昏的東京巷弄，一位年輕女子站在霓虹燈下，燈光倒映在濕掉的柏油路上

會產出：

```
正向：masterpiece, best quality, ultra detailed, high resolution,
      A young woman standing under neon lights in a Tokyo alley at dusk,
      the lights reflecting on the wet asphalt,
      photorealistic, sharp focus, 85mm lens, shallow depth of field,
      natural lighting, ultra detailed skin texture, raw photo

負面：lowres, worst quality, low quality, jpeg artifacts, blurry,
      bad anatomy, bad hands, extra fingers, ... , cartoon, anime, 3d render
```

**風格膠囊**（點一下即時重算，不用重翻）：

| 風格 | 補的關鍵字方向 |
|---|---|
| 寫實 | photorealistic、85mm lens、shallow depth of field、raw photo |
| 動漫 | anime key visual、cel shading、clean lineart、detailed eyes |
| 插畫 | concept art、matte painting、intricate details |
| 3D | octane render、unreal engine 5、ray tracing、SSS |
| 水彩 | watercolor、traditional media、textured paper |
| 電影 | cinematic still、film grain、rim lighting、color graded |
| 無風格 | 只出你描述的內容，不加任何風格字 |

**三個開關**：

- `畫質標籤`：前面加上 `masterpiece, best quality, ultra detailed, high resolution`。
- `主體加權`：把第一個子句包成 `(主體:1.3)`，SD 權重語法，讓主體更強勢。
- `負面提示詞`：關掉就只出正向，版面也會變精簡。

處理邏輯：中文先翻成英文，再依標點與 `and` 切成逗號片語、去掉 `there is` 這類贅字、去重，最後和風格關鍵字接起來。

## 隱私與權限

- 沒有後端伺服器，文字只送去 Google 翻譯端點（`translate.googleapis.com`，備援 `clients5.google.com`）。
- 歷史紀錄、草稿、偏好只存在你的瀏覽器（`chrome.storage.local`）。
- 權限只有 `storage` 和上述兩個翻譯網域，**不讀取你瀏覽的任何網頁**。

## 檔案

```
manifest.json   擴充功能設定（MV3）
popup.html      視窗結構
popup.css       樣式（自動跟隨淺色／深色模式）
popup.js        翻譯、提示詞組裝、歷史紀錄
icons/          圖示
```

想改風格模板，打開 `popup.js` 最上面的 `PRESETS`、`QUALITY_TAGS`、`BASE_NEG` 三個陣列，改完存檔、回 `chrome://extensions` 按重新載入就生效。

## 小提醒

Google 這個端點是非官方公開介面，長期有小機率變動或限流。
若哪天翻譯失敗，改成自備 API key（Gemini / OpenAI / DeepL）只需要動 `popup.js` 裡的 `translate()` 一個函式。
