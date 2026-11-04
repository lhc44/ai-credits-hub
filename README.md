# AI Credits Hub 🚀

> **AI 编程工具多账号额度管理、每日自动签到与云端全能 Web CLI 终端**
>
> 专为 **WorkBuddy / CodeBuddy**、**Trae**、**QoderCN** 等主流 AI 编程助手打造的一体化自建服务平台。支持自动签到保活、Token 自动轮转、多浏览器油猴一键凭据同步，以及直通大模型的**云端在线 CLI 对话终端（支持实时 SSE 流式推理、深度思考链可视化与服务器运维命令执行）**。

---

## 🌟 核心特性

- 🤖 **在线全能 AI CLI 终端 (`/cli`)**：
  - **全系模型支持**：支持直连混元 4（`hy4-preview` MoE 架构）、DeepSeek-V3、GLM-4、Kimi 等多种顶尖大模型。
  - **实时 SSE 流式推送**：基于 Server-Sent Events 实现毫秒级响应，打字机实时流式输出。
  - **深度推理思考链可视化**：完整展示模型的 CoT（Chain of Thought）思考与推理推导折叠卡片。
  - **服务器 Root 终端能力**：模型具备云端 Bash/curl/python/node/systemctl/grep 等最高权限工具，可直接执行实时网页抓取、系统诊断与运维任务。
  - **规范化 Markdown 数据排版**：严格按照核心指标加粗、结构化表格、多源数据交叉校验与可复用命令格式化呈现。
  - **多轮会话上下文记忆**：支持多对话管理、上下文断线自动容错重试。
- 🔑 **多账号集中管理**：
  - 集中监控每个账号的积分余额、连续签到天数、Token 状态与最后签到时间。
- ⚡ **多浏览器极速凭据同步**：
  - **油猴脚本 (Tampermonkey)**：全自动拦截 Trae / Qoder / WorkBuddy 登录凭据，一键自动同步至面板。
  - **Edge / Chrome 深度适配**：支持 Manifest V3，提供 Alt+Shift+S 自定义快捷键与 F12 控制台一键无插件同步方案。
- ⏰ **全自动定时签到**：
  - 内置 Cron 定时器（默认每日早晨 08:05 自动执行），支持防风控的随机延迟（Jitter）与失败自动重试机制。
- 🔄 **Token 自动续期与轮转**：
  - 后台静默调度 Refresh Token Rotation，确保账号凭据长期有效不掉线。
- 📊 **可视化统计仪表盘**：
  - 概览活跃账号总数、今日签到成功率、积分增长趋势图与完整运行审计日志。
- 🐳 **开箱即用的一键部署**：
  - 提供 Docker Compose、一键 Shell 脚本以及 PM2 独立部署等多种方案。

---

## 📱 支持平台与能力矩阵

| 平台 | 每日签到 | 额度/积分查询 | Token 自动续期 | 油猴/控制台一键同步 | 在线 CLI 直连 |
|:---|:---:|:---:|:---:|:---:|:---:|
| 🤖 **WorkBuddy / CodeBuddy** | ✅ | ✅ | ✅ | ✅ | ✅ (混元4/深度思考) |
| ⚡ **Trae** | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🧩 **QoderCN** | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🚀 快速部署

### 方式一：Docker Compose（推荐，最省心）

1. **克隆项目到服务器**：
   ```bash
   git clone https://github.com/lhc44/ai-credits-hub.git /opt/ai-credits-hub
   cd /opt/ai-credits-hub
   ```

2. **配置环境变量**：
   ```bash
   cp .env.example .env
   # 强烈建议修改 .env 中的 JWT_SECRET 和 ADMIN_PASSWORD
   nano .env
   ```

3. **构建并启动容器**：
   ```bash
   docker compose up -d --build
   ```

4. **查看运行日志**：
   ```bash
   docker compose logs -f
   ```

---

### 方式二：Linux 一键脚本部署（适合 Ubuntu / Debian / CentOS）

```bash
git clone https://github.com/lhc44/ai-credits-hub.git /opt/ai-credits-hub
cd /opt/ai-credits-hub
chmod +x deploy.sh
./deploy.sh
```

---

### 方式三：手动无 Docker 运行（Node.js 20+）

```bash
# 1. 安装后端依赖
npm install --production

# 2. 安装前端依赖并构建静态页面
cd client
npm install
npm run build
cd ..

# 3. 初始化环境
cp .env.example .env
nano .env

# 4. 启动服务 (推荐使用 PM2 守护)
npm install -g pm2
pm2 start server/index.js --name ai-credits-hub
pm2 save
pm2 startup
```

---

## ⚙️ 环境变量配置说明 (`.env`)

复制 `.env.example` 为 `.env` 后可进行以下个性化配置：

```ini
# 服务监听端口与主机
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# JWT 鉴权密钥 (生产环境请务必替换为 32 位以上随机字符)
JWT_SECRET=your-super-secret-jwt-key-change-this

# 初始管理员账号密码 (首次启动自动创建，登录后建议在个人设置中修改)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 定时签到时间表达式 (Cron 格式，默认每天上午 8:05)
CRON_SCHEDULE=5 8 * * *

# 签到随机扰动延迟 (秒)，有效避免批量请求被服务端风控检测
CHECKIN_DELAY_MIN=10
CHECKIN_DELAY_MAX=120

# 数据库存储路径 (纯 JSON/SQLite，无外挂数据库依赖)
DB_PATH=./data/database.json
```

---

## 📖 使用指南

### 1. 登录控制台
- 浏览器打开 `http://<你的服务器IP>:3000`
- 默认管理员账号：`admin`，默认密码：`admin123`（登录后请尽快修改）。

### 2. 账号凭据录入与一键同步
进入**「账号管理」**页面，点击右上角**「油猴同步」**弹窗：
- **方案 A（F12 控制台一键同步 - 零插件）**：
  在浏览器登录 Trae 或各大平台后，按 `F12` 打开开发者控制台，粘贴复制弹出的单行脚本回车，秒级将手机号与登录凭据双向导入。
- **方案 B（油猴脚本自动同步）**：
  点击弹窗内的“安装脚本”，在 Edge 或 Chrome 中打开各平台网页即可通过顶部悬浮窗一键上传。

### 3. 在线 CLI 与 AI 智能助手 (`/cli`)
- 切换至**「在线对话 / CLI 终端」**：
  - 选择对话大模型（支持混元 4、DeepSeek、GLM 等）。
  - 支持直接下达运维任务，例如：*“请执行命令检查服务器当前 CPU、内存与磁盘占用情况，并以规范表格输出”* 或 *“抓取目标网页并交叉核验关注人数”*。
  - 模型将实时流式展示思考链，并调用服务器终端工具执行真实命令后返回结构化排版报告。

---

## 📁 目录结构

```
├── client/                 # Vue 3 前端工程 (Vite + Pinia + marked)
│   ├── src/
│   │   ├── views/          # 视图组件 (Cli, Accounts, Dashboard, Logs)
│   │   └── api.js          # Axios / SSE 网络请求封装
│   └── index.html
├── server/                 # Express 服务端
│   ├── index.js            # 入口启动与调度
│   ├── db.js               # 轻量持久化数据库引擎
│   ├── middleware/         # JWT 鉴权中间件
│   ├── providers/          # 各平台签到与刷新 Adapter
│   ├── routes/             # RESTful API、SSE 与 OAuth 路由
│   └── tasks/              # 签到调度与自动化任务
├── .env.example            # 环境变量配置模板
├── deploy.sh               # 一键 Linux 部署脚本
├── docker-compose.yml      # Docker 编排配置
├── Dockerfile              # 多阶段安全构建 Dockerfile
└── package.json
```

---

## 🔒 安全与脱敏规范

- ⚠️ **切勿将 `.env` 或 `data/` 目录提交至公共仓库**（已在 `.gitignore` 中默认过滤）。
- 生产环境建议在前端配置 **Nginx 反向代理并配置 HTTPS (SSL 证书)**，保护网络传输安全。
- 账号凭据均保存在本地私有数据存储中，不向任何第三方服务上报。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。欢迎提交 Pull Request 与 Issue！
