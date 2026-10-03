# 1024 守门员

把 [1024 交易手册](./1024交易手册.md) 里的计算和纪律写成 PWA：开单闸门、仓位与杠杆、冷静期、持仓日志、资金等级、真相面板。

## 本地运行

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
npm run preview  # http://localhost:4173
```

## 上线（GitHub Pages，免费）

1. 在 GitHub 新建**公开**仓库（例如 `1024-guard`），不要勾选 README（本地已有）。
2. 在本目录执行：

```bash
git init -b main
git add -A
git commit -m "Initial commit: 1024 守门员 PWA"
git remote add origin https://github.com/<你的用户名>/1024-guard.git
git push -u origin main
```

3. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（workflow 已包含在 `.github/workflows/pages.yml`）。
4. 等 Actions 跑绿，访问：`https://<你的用户名>.github.io/1024-guard/#gate`

iPhone：Safari 打开上述地址 → 分享 → **添加到主屏幕**。

## 数据与隐私

- 交易记录、余额、入金记录只存在**本机浏览器** `localStorage`，不上传服务器。
- 行情只读币安公开接口（浏览器直连），不需要 API Key。
