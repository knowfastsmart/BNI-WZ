# BNI 會員紅綠燈查詢

這是一個可部署到 GitHub Pages 的純前端儀表板。

## 更換 Google Sheet 資料來源

1. 開啟 Google Sheet。
2. 選擇「檔案」->「共用」->「發佈到網路」。
3. 格式選擇 CSV。
4. 複製產生的 CSV 網址。
5. 把 `js/data.js` 裡的 `DATA_URL` 改成該網址。

資料欄位需維持與原始 BNI dashboard 相同格式。
