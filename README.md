# 🍸 珠免酒鬼人格测试 - 部署指南

## 项目结构

```
zm-quiz/
├── api/
│   ├── submit.js         # 提交测试结果（公开）
│   ├── stats.js          # 统计数据（需登录）
│   ├── data.js           # 数据列表（需登录）
│   ├── export.js         # 导出CSV（需登录）
│   ├── setup.js          # 初始化数据库（需SETUP_KEY）
│   └── auth/
│       ├── login.js      # 登录
│       └── users.js      # 用户管理（管理员）
├── lib/
│   ├── db.js             # 数据库连接
│   └── auth.js           # JWT认证
├── public/
│   ├── index.html        # 测试页（首页）
│   └── dashboard.html    # 数据看板
├── package.json
├── vercel.json
└── README.md
```

## 一、部署到 Vercel（免费）

### 1. 安装 Vercel CLI

```bash
npm i -g vercel
```

### 2. 安装依赖

```bash
cd zm-quiz
npm install
```

### 3. 部署

```bash
vercel
```

首次部署会要求登录（用 GitHub 账号），然后一路回车即可。部署完成后会得到一个 URL，如：
`https://zm-quiz-xxx.vercel.app`

### 4. 创建数据库

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard)
2. 进入你的项目 → **Storage** 标签
3. 点击 **Create Database** → 选择 **Postgres (Neon)**
4. 选择免费区域（默认），点击 Create
5. 回到项目 → **Settings** → **Environment Variables**，确认已有 `POSTGRES_URL`

### 5. 配置环境变量

在 Vercel Dashboard → Settings → Environment Variables 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `JWT_SECRET` | 随机字符串，如 `my-s3cr3t-k3y-2026` | JWT签名密钥 |
| `SETUP_KEY` | 随机字符串，如 `setup-zm-2026` | 初始化密钥（用完可删） |

添加后点击 **Redeploy** 重新部署。

### 6. 初始化数据库

在终端执行（替换 URL 和 SETUP_KEY）：

```bash
curl -X POST https://你的域名.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -H "X-Setup-Key: 你设置的SETUP_KEY" \
  -d "{\"admin_username\":\"admin\",\"admin_password\":\"你的管理员密码\"}"
```

看到 `"ok": true` 就成功了。

### 7. 访问

- 🧪 测试页：`https://你的域名.vercel.app/`
- 📊 看板：`https://你的域名.vercel.app/dashboard.html`

## 二、用户管理

1. 用 admin 账号登录看板
2. 点击右上角 **👥 用户** 按钮
3. 输入用户名、密码、角色（查看者/管理员）
4. 点击添加

- **管理员**：可查看数据 + 管理用户
- **查看者**：只能查看数据

## 三、二维码配置

测试结果页预留了二维码位置，图片路径为 `/qr-code.png`。

替换方法：
1. 把你的企微客服二维码保存为 `qr-code.png`
2. 放到 `public/` 目录下
3. 重新部署：`vercel --prod`

## 四、本地开发

```bash
npm install -g vercel
cd zm-quiz
npm install
vercel dev
```

需要本地 `.env` 文件配置 `POSTGRES_URL`、`JWT_SECRET`、`SETUP_KEY`。

## 五、后续迁移到公司服务器

代码使用标准 `pg` 库，只需：
1. 安装 Node.js + PostgreSQL
2. 设置 `POSTGRES_URL` 环境变量
3. 运行 `node server.js`（需要加一个 Express 入口）

数据库表结构完全兼容，数据可直接导出导入。
