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

## 一键推送（本机已装 gh 且已 login）

```bash
export GH_BIN=/path/to/gh   # 可选
./scripts/deploy-github.sh 1024-guard
```

## 运维成本（上线后）

| 项目 | 费用 |
| --- | --- |
| **GitHub Pages（公开仓库）** | **0 元/月**。纯静态文件，GitHub 托管，HTTPS 自带。 |
| **服务器 / 数据库** | **不需要**。没有后端，数据在浏览器 `localStorage`。 |
| **币安行情** | **0 元**。浏览器直连公开接口，不走你的服务器。 |
| **GitHub Actions 构建** | 公开仓库额度通常够用；私有仓库有免费分钟数，超出才收费。 |
| **自定义域名（可选）** | 域名约几十元/年；不用域名则用 `*.github.io` 免费。 |
| **你的时间** | 改代码后 `git push`，Actions 自动重新部署，**无需日常运维**。 |

国内访问 GitHub Pages 有时慢或被干扰，可开代理访问，或以后换 Cloudflare Pages（同样可免费）。

## 数据与隐私

- 交易记录、余额、入金记录只存在**本机浏览器** `localStorage`，不上传服务器。
- 行情只读币安公开接口（浏览器直连），不需要 API Key。
