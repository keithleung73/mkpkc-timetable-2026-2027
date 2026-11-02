# 課表資料

- `schedule.json`、`official/*.xlsx` 只留喺學務部電腦，**唔提交 GitHub**（公開倉庫會被人下載全校課表）。
- GitHub 只存 `schedule.enc.json`（加密課表）同 `records.enc.json`（加密代調堂結餘／紀錄）。網上版要用學務部發出嘅完整連結（`?k=`）先解得開。
- 明文 `cover.json`／`swaps.json` 只留學務部電腦。更新網站時會一併加密發布，手機先睇到同電腦一樣嘅 ± 結餘。
- 更新課表後，喺有 `.site-access-key` 嘅電腦執行 `npm run encrypt-data`，再發佈 Pages。
