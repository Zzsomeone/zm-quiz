# 珠免酒鬼人格测试

一个完整的问卷调查系统，包含：
- 📋 18题 MBTI 酒鬼人格测试问卷
- 📊 实时数据看板（统计、图表、导出）
- 💬 微信客服二维码入口（私域引流）

---

## 🚀 一键部署（推荐 Vercel，免费）

### 步骤 1: 注册 Vercel 账号

1. 打开 https://vercel.com
2. 点击 **Sign Up** → 选择 **Continue with GitHub**（用 GitHub 登录最快）
3. 授权完成即可

### 步骤 2: 上传代码到 GitHub

**方式 A：在 GitHub 网页直接上传（最简单）**

1. 登录 GitHub → 点击 **New repository**
2. 仓库名填 `zhu-mian-survey`，设为 Private 或 Public 都行
3. 点击 **Add file** → **Upload files**
4. 把这个文件夹里的所有文件拖进去上传
5. 点击 **Commit changes**

**方式 B：用命令行（需要 Git）**

```bash
cd /Users/someone/Desktop/zhu-mian-survey
git init
git add .
git commit -m "初始化珠免问卷系统"
git remote add origin https://github.com/你的用户名/zhu-mian-survey.git
git push -u origin main
```

### 步骤 3: 在 Vercel 部署

1. 打开 https://vercel.com → 点击 **New Project**
2. 选择你刚创建的 `zhu-mian-survey` 仓库
3. 点击 **Deploy**（无需修改任何配置）
4. 等待 1-2 分钟 → 部署完成！

### 步骤 4: 获取访问地址

部署完成后，Vercel 会给你一个地址，类似：
- `https://zhu-mian-survey.vercel.app`

你的问卷地址就是：
- **问卷页面**: `https://你的域名.vercel.app/survey.html`
- **数据看板**: `https://你的域名.vercel.app/dashboard.html`

---

## 📱 微信公众号对接

### 添加菜单入口

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 进入 **内容与互动** → **自定义菜单**
3. 添加菜单：
   - 菜单名称：`酒鬼人格测试`
   - 跳转链接：填入你的问卷地址
4. 保存并发布

### 企业微信客服发送

直接把问卷链接发给客户即可。

---

## 🖼️ 替换微信客服二维码

1. 准备一张微信客服二维码图片（PNG 格式，200x200 像素）
2. 命名为 `wechat-qr.png`
3. 放到 `public/` 文件夹
4. 重新部署（推送代码到 GitHub，Vercel 自动更新）

---

## 📊 数据看板使用

访问 `https://你的域名.vercel.app/dashboard.html`

功能：
- 总参与人数、今日新增
- 人格分布饼图
- 维度倾向对比
- 每日参与趋势
- 明细数据查询
- 导出 CSV

---

## 🔧 本地开发测试

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 访问
# 问卷: http://localhost:3000/survey.html
# 看板: http://localhost:3000/dashboard.html
```

---

## ❓ 常见问题

**Q: 数据会丢失吗？**
A: Vercel 是 Serverless 环境，数据存在 SQLite 会定期清理。建议定期导出 CSV 备份，或升级到云数据库（如 Supabase 免费版）。

**Q: 想要持久化数据怎么办？**
A: 可以接入 Supabase（免费 PostgreSQL）或微信云托管（自带 MySQL）。需要的话我可以帮你改代码。

**Q: 能自定义域名吗？**
A: 可以。在 Vercel 项目设置 → Domains → 添加你的域名。

---

## 📁 文件结构

```
zhu-mian-survey/
├── server.js          # 后端服务（API）
├── package.json       # 依赖配置
├── vercel.json        # Vercel 部署配置
├── public/
│   ├── survey.html    # 问卷页面
│   ├── dashboard.html # 数据看板
│   └── wechat-qr.png  # 微信客服二维码（需替换）
└── db/
    └── survey.db      # SQLite 数据库（自动创建）
```

---

## 🎉 完成！

部署后你就有了一个完整的问卷调查系统：

✅ 零服务器成本（Vercel 免费）  
✅ 零域名成本（自带 .vercel.app 域名）  
✅ 自动 HTTPS  
✅ 全球 CDN 加速  
✅ 微信公众号/企业微信友好  

有问题随时问我！
