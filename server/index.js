require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');

const db = require('./db');
const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const oauthRoutes = require('./routes/oauth');
const { runCheckinTask } = require('./tasks/checkin');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ==================== 中间件 ====================
app.use(helmet({
  contentSecurityPolicy: false,  // 允许内联脚本 (Vue前端需要)
}));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan('combined'));

// ==================== 路由 ====================

// 认证路由 (内含公开的 /login 与受保护的 /me, /change-password)
app.use('/api/auth', authRoutes);

// 在线扫码与油猴同步路由 (内含扫码与用户脚本分发)
app.use('/api/oauth', oauthRoutes);
app.get('/tampermonkey.user.js', (req, res, next) => {
  req.url = '/tampermonkey.user.js';
  oauthRoutes(req, res, next);
});

// 业务路由 (需要登录)
app.use('/api', authMiddleware, apiRoutes);

// 静态文件服务 (Vue 前端)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// SPA 回退
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 404, message: 'API not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ==================== 初始化 ====================

// 创建默认管理员账号
function initAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(adminUsername, hashed);
    console.log(`✅ 管理员账号已创建: ${adminUsername}`);
  }
}

// ==================== 定时签到任务调度 ====================
let cronTask = null;

function updateCronSchedule(schedule, enabled = true) {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  if (!enabled) {
    console.log('⏸️ 自动定时签到任务已停用');
    return { success: true, enabled: false };
  }

  const validSchedule = schedule || '5 8 * * *';
  if (cron.validate(validSchedule)) {
    cronTask = cron.schedule(validSchedule, async () => {
      console.log(`\n🕐 定时签到任务触发 (Schedule: ${validSchedule})...`);
      try {
        await runCheckinTask();
      } catch (err) {
        console.error('❌ 定时签到任务失败:', err.message);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });
    console.log(`⏰ 定时签到已更新并启动: ${validSchedule} (Asia/Shanghai)`);
    return { success: true, enabled: true, schedule: validSchedule };
  } else {
    console.error(`❌ 无效的Cron表达式: ${validSchedule}`);
    return { success: false, message: '无效的Cron表达式' };
  }
}

global.updateCronSchedule = updateCronSchedule;

function initCronJob() {
  const settings = db.getSettings();
  const schedule = settings.cron_schedule || process.env.CRON_SCHEDULE || '5 8 * * *';
  const enabled = settings.auto_checkin_enabled !== false;
  updateCronSchedule(schedule, enabled);
}

// ==================== 启动 ====================
initAdmin();
initCronJob();

app.listen(PORT, HOST, () => {
  console.log('\n🚀 =======================================');
  console.log(`   AI Credits Hub 已启动`);
  console.log(`   地址: http://${HOST}:${PORT}`);
  console.log(`   环境: ${process.env.NODE_ENV || 'development'}`);
  console.log('🚀 =======================================\n');
});
