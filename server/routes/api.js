const express = require('express');
const db = require('../db');
const { getProvider, PLATFORM_INFO } = require('../providers');
const { runCheckinTask } = require('../tasks/checkin');

const router = express.Router();

// ==================== 平台信息 ====================

// 获取支持的平台列表
router.get('/platforms', (req, res) => {
  res.json({ code: 0, data: PLATFORM_INFO });
});

// ==================== 账号管理 ====================

// 获取所有账号
router.get('/accounts', (req, res) => {
  const accounts = db.prepare(`
    SELECT id, user_id, platform, nickname, status, credits_balance,
           consecutive_days, last_checkin_at, created_at, updated_at
    FROM accounts WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id);

  // 添加平台信息
  const enriched = accounts.map(acc => ({
    ...acc,
    platformInfo: PLATFORM_INFO[acc.platform] || { name: acc.platform, icon: '❓' },
    hasToken: true,  // 只告诉前端有token，不暴露token
  }));

  res.json({ code: 0, data: enriched });
});

// 添加账号
router.post('/accounts', (req, res) => {
  const { platform, nickname, accessToken, refreshToken, extraData } = req.body;

  if (!platform || !PLATFORM_INFO[platform]) {
    return res.status(400).json({ code: 400, message: '不支持的平台' });
  }
  if (!accessToken && !refreshToken) {
    return res.status(400).json({ code: 400, message: '至少需要提供一个Token' });
  }

  const result = db.prepare(`
    INSERT INTO accounts (user_id, platform, nickname, access_token, refresh_token, extra_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    platform,
    nickname || '',
    accessToken || '',
    refreshToken || '',
    JSON.stringify(extraData || {})
  );

  res.json({
    code: 0,
    message: '账号添加成功',
    data: { id: result.lastInsertRowid },
  });
});

// 更新账号
router.put('/accounts/:id', (req, res) => {
  const { id } = req.params;
  const { nickname, accessToken, refreshToken, extraData, status } = req.body;

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!account) {
    return res.status(404).json({ code: 404, message: '账号不存在' });
  }

  const updates = [];
  const values = [];

  if (nickname !== undefined) { updates.push('nickname = ?'); values.push(nickname); }
  if (accessToken !== undefined) { updates.push('access_token = ?'); values.push(accessToken); }
  if (refreshToken !== undefined) { updates.push('refresh_token = ?'); values.push(refreshToken); }
  if (extraData !== undefined) { updates.push('extra_data = ?'); values.push(JSON.stringify(extraData)); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ code: 0, message: '账号更新成功' });
});

// 删除账号
router.delete('/accounts/:id', (req, res) => {
  const { id } = req.params;

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!account) {
    return res.status(404).json({ code: 404, message: '账号不存在' });
  }

  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

  res.json({ code: 0, message: '账号删除成功' });
});

// ==================== 签到操作 ====================

// 手动签到单个账号
router.post('/accounts/:id/checkin', async (req, res) => {
  const { id } = req.params;

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!account) {
    return res.status(404).json({ code: 404, message: '账号不存在' });
  }

  try {
    const provider = getProvider(account);
    const result = await provider.checkin();

    // 记录日志
    db.prepare(`
      INSERT INTO checkin_logs (account_id, platform, status, credits_earned, message, raw_response)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(account.id, account.platform, result.status, result.creditsEarned, result.message, result.rawResponse || '');

    // 更新账号
    const updates = { last_checkin_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (result.status === 'success') {
      updates.credits_balance = (account.credits_balance || 0) + (result.creditsEarned || 0);
      updates.consecutive_days = (account.consecutive_days || 0) + 1;
      updates.status = 'active';
    } else if (result.status === 'already_done') {
      if (!account.credits_balance) updates.credits_balance = 100;
      if (!account.consecutive_days) updates.consecutive_days = 1;
      updates.status = 'active';
    } else if (result.status === 'token_expired') {
      updates.status = 'expired';
    }

    try {
      const liveBal = await provider.getBalance();
      if (liveBal.success) {
        if (liveBal.credits !== undefined) updates.credits_balance = liveBal.credits;
        if (liveBal.consecutiveDays !== undefined) updates.consecutive_days = liveBal.consecutiveDays;
        updates.status = 'active';
      }
    } catch(e) {}
    if (result.newAccessToken) updates.access_token = result.newAccessToken;
    if (result.newRefreshToken) updates.refresh_token = result.newRefreshToken;
    if (result.extraData) updates.extra_data = JSON.stringify(result.extraData);

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const vals = [...Object.values(updates), account.id];
    db.prepare(`UPDATE accounts SET ${setClauses} WHERE id = ?`).run(...vals);

    res.json({ code: 0, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: `签到失败: ${err.message}` });
  }
});

// 手动签到所有账号
router.post('/checkin-all', async (req, res) => {
  try {
    const result = await runCheckinTask();
    res.json({ code: 0, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 刷新单个账号实时积分与状态
router.post('/accounts/:id/refresh', async (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!account) {
    return res.status(404).json({ code: 404, message: '账号不存在' });
  }

  try {
    const provider = getProvider(account);
    const balanceInfo = await provider.getBalance();
    const updates = { updated_at: new Date().toISOString() };

    if (balanceInfo.success) {
      if (balanceInfo.credits !== undefined) updates.credits_balance = balanceInfo.credits;
      if (balanceInfo.consecutiveDays !== undefined) updates.consecutive_days = balanceInfo.consecutiveDays;
      if (balanceInfo.todayChecked) {
        updates.last_checkin_at = updates.last_checkin_at || new Date().toISOString();
      }
      updates.status = 'active';
    } else if (balanceInfo.tokenExpired) {
      updates.status = 'expired';
    }

    const setClauses = Object.keys(updates).map(k => k + ' = ?').join(', ');
    const vals = [...Object.values(updates), account.id];
    db.prepare('UPDATE accounts SET ' + setClauses + ' WHERE id = ?').run(...vals);

    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
    res.json({ code: 0, data: updated, live: balanceInfo });
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询积分失败: ' + err.message });
  }
});

// 批量刷新所有账号实时积分与状态
router.post('/accounts/refresh-all', async (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(req.user.id);
    const results = [];
    for (const account of accounts) {
      try {
        const provider = getProvider(account);
        const balanceInfo = await provider.getBalance();
        const updates = { updated_at: new Date().toISOString() };

        if (balanceInfo.success) {
          if (balanceInfo.credits !== undefined) updates.credits_balance = balanceInfo.credits;
          if (balanceInfo.consecutiveDays !== undefined) updates.consecutive_days = balanceInfo.consecutiveDays;
          if (balanceInfo.todayChecked) {
            updates.last_checkin_at = updates.last_checkin_at || new Date().toISOString();
          }
          updates.status = 'active';
        } else if (balanceInfo.tokenExpired) {
          updates.status = 'expired';
        }

        const setClauses = Object.keys(updates).map(k => k + ' = ?').join(', ');
        const vals = [...Object.values(updates), account.id];
        db.prepare('UPDATE accounts SET ' + setClauses + ' WHERE id = ?').run(...vals);
        results.push({ id: account.id, success: true, live: balanceInfo });
      } catch (err) {
        results.push({ id: account.id, success: false, message: err.message });
      }
    }
    res.json({ code: 0, data: results });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ==================== 日志查询 ====================

// 获取签到日志
router.get('/logs', (req, res) => {
  const { page = 1, pageSize = 20, accountId, platform, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let where = 'WHERE a.user_id = ?';
  const params = [req.user.id];

  if (accountId) { where += ' AND l.account_id = ?'; params.push(accountId); }
  if (platform) { where += ' AND l.platform = ?'; params.push(platform); }
  if (status) { where += ' AND l.status = ?'; params.push(status); }

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    ${where}
  `).get(...params).count;

  const logs = db.prepare(`
    SELECT l.*, a.nickname, a.platform as account_platform
    FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({
    code: 0,
    data: {
      list: logs,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    },
  });
});

// ==================== 统计数据 ====================

// 仪表盘统计
router.get('/dashboard', (req, res) => {
  const userId = req.user.id;

  // 账号统计
  const accountStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
      SUM(credits_balance) as totalCredits
    FROM accounts WHERE user_id = ?
  `).get(userId);

  // 今日签到统计
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN l.status = 'already_done' THEN 1 ELSE 0 END) as alreadyDone,
      SUM(CASE WHEN l.status = 'failed' OR l.status = 'token_expired' THEN 1 ELSE 0 END) as failed,
      SUM(l.credits_earned) as creditsEarned
    FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    WHERE a.user_id = ? AND date(l.created_at) = ?
  `).get(userId, today);

  // 最近7天签到趋势
  const weekTrend = db.prepare(`
    SELECT
      date(l.created_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN l.status = 'success' OR l.status = 'already_done' THEN 1 ELSE 0 END) as success,
      SUM(l.credits_earned) as credits
    FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    WHERE a.user_id = ? AND l.created_at >= datetime('now', '-7 days')
    GROUP BY date(l.created_at)
    ORDER BY date(l.created_at)
  `).all(userId);

  // 各平台账号数
  const platformCounts = db.prepare(`
    SELECT platform, COUNT(*) as count, SUM(credits_balance) as credits
    FROM accounts WHERE user_id = ?
    GROUP BY platform
  `).all(userId);

  res.json({
    code: 0,
    data: {
      accounts: accountStats,
      today: todayStats,
      weekTrend,
      platformCounts,
    },
  });
});

// ==================== 定时签到时间与系统设置 ====================

// 获取当前签到设置
router.get('/settings', (req, res) => {
  const settings = db.getSettings();
  res.json({
    code: 0,
    data: {
      checkinTime: settings.checkin_time || '08:05',
      cronSchedule: settings.cron_schedule || '5 8 * * *',
      autoCheckinEnabled: settings.auto_checkin_enabled !== false,
    },
  });
});

// 保存并动态应用定时签到设置
router.post('/settings', (req, res) => {
  const { checkinTime, cronSchedule, autoCheckinEnabled } = req.body;
  const cron = require('node-cron');

  let finalTime = checkinTime;
  let finalCron = cronSchedule;

  // 支持输入 HH:mm (如 08:30)，自动换算为 Cron 表达式 (30 8 * * *)
  if (checkinTime && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(checkinTime.trim())) {
    const parts = checkinTime.trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    finalCron = `${m} ${h} * * *`;
    finalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else if (!finalCron) {
    finalCron = '5 8 * * *';
    finalTime = '08:05';
  }

  if (!cron.validate(finalCron)) {
    return res.status(400).json({ code: 400, message: '无效的时间格式或 Cron 表达式' });
  }

  const enabled = autoCheckinEnabled !== false;
  db.setSettings({
    checkin_time: finalTime,
    cron_schedule: finalCron,
    auto_checkin_enabled: enabled,
  });

  // 动态重载调度器
  if (global.updateCronSchedule) {
    global.updateCronSchedule(finalCron, enabled);
  }

  res.json({
    code: 0,
    message: '每日自动签到设置已成功保存并立即生效！',
    data: {
      checkinTime: finalTime,
      cronSchedule: finalCron,
      autoCheckinEnabled: enabled,
    },
  });
});


// ==================== CodeBuddy CLI 与 在线对话终端 ====================
const { spawn } = require('child_process');

// 完整全模型清单（分类整理）
const ALL_SUPPORTED_MODELS = [
  // 腾讯混元大模型
  { id: 'hy4-preview', name: '混元 4 Preview (hy4-preview)', category: '腾讯混元', badge: '首选推荐 / 免费', description: '腾讯 Hunyuan 4.0 旗舰大模型，代码编写与深度逻辑推理卓越' },
  { id: 'hy4free', name: '混元 4 Free (hy4free)', category: '腾讯混元', badge: '官方免费版', description: '腾讯官方混元 4.0 免额度极速版' },
  { id: 'hy4std', name: '混元 4 Standard (hy4std)', category: '腾讯混元', badge: '标准版', description: '混元 4.0 标准全能力大模型' },
  { id: 'hy3', name: '混元 3 (hy3)', category: '腾讯混元', badge: '稳定', description: '腾讯混元 3.0 大语言模型' },
  { id: 'hy3-x', name: '混元 3-X (hy3-x)', category: '腾讯混元', badge: '增强版', description: '混元 3.0 深度优化增强版' },

  // DeepSeek 深度求索
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', category: 'DeepSeek', badge: '极速代码', description: '超高并发极速代码推理模型' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', category: 'DeepSeek', badge: '旗舰推理', description: 'DeepSeek 专业深度思维推理模型' },

  // 智谱 GLM
  { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash', category: '智谱 GLM', badge: '高响应', description: '智谱轻量极速文本对话模型' },
  { id: 'glm-5.3', name: 'GLM 5.3', category: '智谱 GLM', badge: '通用旗舰', description: '智谱清言通用全能大模型' },
  { id: 'glm-5.2', name: 'GLM 5.2', category: '智谱 GLM', badge: '经典版', description: '智谱 5.2 稳定推理版' },

  // 月之暗面 Kimi
  { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', category: '月之暗面 Kimi', badge: '超长上下文', description: '长文本长上下文分析专家模型' },
  { id: 'kimi-k3-1', name: 'Kimi K3-1', category: '月之暗面 Kimi', badge: '多轮对话', description: '高鲁棒性多轮会话模型' },
  { id: 'kimi-k2.8-preview', name: 'Kimi K2.8 Preview', category: '月之暗面 Kimi', badge: '预览版', description: 'Kimi 2.8 预览版' },

  // MiniMax
  { id: 'minimax-m3.1-flash', name: 'MiniMax M3.1 Flash', category: 'MiniMax', badge: '轻量敏捷', description: 'MiniMax 极速多任务模型' },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', category: 'MiniMax', badge: '通用', description: 'MiniMax 经典通用模型' },

  // 阶跃星辰 & 其他
  { id: 'step-5-preview', name: '阶跃星辰 Step 5', category: '前沿模型', badge: '多模态推理', description: '阶跃星辰 Step-5 预览版' },
  { id: 'mimo-v2.6-pro', name: 'Mimo V2.6 Pro', category: '前沿模型', badge: '专业版', description: 'Mimo 2.6 专业分析模型' },
  { id: 'space-bunny', name: 'Space Bunny', category: '前沿模型', badge: '特色', description: 'Space Bunny 特色模型' },
];

// 获取 CLI 与在线对话支持信息
router.get('/cli/info', (req, res) => {
  const accounts = db.prepare(`
    SELECT id, nickname, platform, status, credits_balance, consecutive_days, access_token
    FROM accounts WHERE user_id = ? AND platform = 'workbuddy'
  `).all(req.user.id);

  const safeAccounts = accounts.map(a => ({
    id: a.id,
    nickname: a.nickname || `账号 #${a.id}`,
    platform: a.platform,
    status: a.status,
    credits: a.credits_balance,
    streak: a.consecutive_days,
    hasToken: !!a.access_token,
    tokenPreview: a.access_token ? `${a.access_token.slice(0, 15)}...${a.access_token.slice(-10)}` : '',
    rawToken: a.access_token
  }));

  res.json({
    code: 0,
    data: {
      cliAvailable: true,
      cliVersion: '2.179.3',
      models: ALL_SUPPORTED_MODELS,
      accounts: safeAccounts
    }
  });
});

// 在线对话 / CLI 执行接口
router.post('/cli/chat', async (req, res) => {
  const {
    accountId,
    model = 'hy4-preview',
    prompt,
    sessionId,
    continueSession = false,
    enableTools = true,
    stream = true
  } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ code: 400, message: '请输入对话内容' });
  }

  // 查找可用账号
  let account;
  if (accountId) {
    account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, req.user.id);
  } else {
    account = db.prepare("SELECT * FROM accounts WHERE user_id = ? AND platform = 'workbuddy' AND access_token IS NOT NULL AND access_token != '' LIMIT 1").get(req.user.id);
  }

  if (!account || !account.access_token) {
    return res.status(400).json({
      code: 400,
      message: '未找到已配置的 WorkBuddy / CodeBuddy 账号，请先在【账号管理】中录入或通过脚本同步！'
    });
  }

  const startTime = Date.now();
  const safeModel = ALL_SUPPORTED_MODELS.some(m => m.id === model) ? model : 'hy4-preview';
  const isStreaming = stream !== false;

  if (isStreaming) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();
  }

  function runProcess(resumeId) {
    return new Promise((resolve) => {
      const args = [
        '-y',
        '--output-format', 'stream-json',
        '--include-partial-messages'
      ];

      if (enableTools !== false) {
        args.push(
          '--permission-mode', 'bypassPermissions',
          '--tools', 'default',
          '--system-prompt', [
            '你是部署在 Linux 云端服务器 (/opt/ai-credits-hub) 上的全能高级运维与开发 AI 智能工程师，具备终端命令执行(Bash/curl/python/node/systemctl/grep/find)、文件读写、网页抓取与代码分析的最高 root 权限。',
            '所有命令均直接在当前 Linux 服务器中以 root 身份执行。请主动调用工具完成用户的数据抓取、系统诊断、文件处理与服务管理任务。',
            '',
            '【排版规范】',
            '当用户要求抓取网页、分析数据、监控系统时，请真实执行命令获取数据，并严格采用以下 Markdown 结构呈现结果：',
            '',
            '## 核心结果标题（如：## 抓取结果 或 ## 服务器监控状态）',
            '',
            '**核心指标加粗高亮**（如 **关注数：4027**、**当前 CPU 使用率：14.2%**、**状态：正常运行**）',
            '',
            '简明背景信息（如目标应用/页面标题/App ID/服务器环境/时间等）。',
            '',
            '**完整数据明细**（使用规范 Markdown 表格）',
            '',
            '| 项目 | 数值 |',
            '|---|---|',
            '| 指标项 | **数值** |',
            '',
            '### 数据来源与校验',
            '详细交代执行了什么工具（如 curl、grep、awk、python、WebFetch），从哪些独立来源（如 SSR 数据、DOM 节点、系统 /proc 等）交叉校验，证实数据真实性。',
            '',
            '### 可复用的执行命令',
            '给出可供用户直接在服务器终端复查的单行或脚本式 Bash 命令（使用 ```bash 代码块包裹）。',
            '',
            '给出针对性的运维或监控建议（如定时抓取方案、稳定性提示等）。'
          ].join('\n'));
      } else {
        args.push(
          '--tools', '',
          '--system-prompt', '你是专业的 AI 智能助手，请用中文给出清晰、准确、排版优雅的 Markdown 回答。如有数据对比，优先使用 Markdown 表格呈现。'
        );
      }

      if (resumeId) {
        args.push('--resume', resumeId);
      } else {
        args.push('--model', safeModel);
      }

      args.push('-p', prompt.trim());

      const child = spawn('codebuddy', args, {
        cwd: '/opt/ai-credits-hub',
        env: {
          ...process.env,
          CODEBUDDY_AUTH_TOKEN: account.access_token,
          CODEBUDDY_IS_SANDBOX: '1',
          PATH: process.env.PATH ? `${process.env.PATH}:/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` : '/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          LANG: 'zh_CN.UTF-8',
          LC_ALL: 'zh_CN.UTF-8'
        },
        timeout: 120000
      });

      let stdoutRaw = '';
      let stderrRaw = '';
      let thinking = '';
      let text = '';
      const toolCalls = [];
      let finalSessionId = resumeId || null;
      let stdoutBuffer = '';

      const onCloseClient = () => {
        try {
          if (!res.writableEnded && !child.killed) child.kill('SIGTERM');
        } catch (e) {}
      };
      res.on('close', onCloseClient);

      child.stdout.on('data', data => {
        const chunk = data.toString('utf-8');
        stdoutRaw += chunk;
        stdoutBuffer += chunk;

        let newlineIndex;
        while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          if (!line) continue;

          try {
            const obj = JSON.parse(line);
            if (obj.session_id) {
              finalSessionId = obj.session_id;
              if (isStreaming) {
                res.write(`data: ${JSON.stringify({ type: 'session', sessionId: finalSessionId })}\n\n`);
              }
            }

            if (obj.type === 'stream_event' && obj.event?.delta) {
              const d = obj.event.delta;
              if (d.type === 'thinking_delta' && d.thinking) {
                thinking += d.thinking;
                if (isStreaming) {
                  res.write(`data: ${JSON.stringify({ type: 'thinking_delta', delta: d.thinking })}\n\n`);
                }
              } else if (d.type === 'text_delta' && d.text) {
                text += d.text;
                if (isStreaming) {
                  res.write(`data: ${JSON.stringify({ type: 'text_delta', delta: d.text })}\n\n`);
                }
              }
            } else if (obj.type === 'assistant' && obj.message?.content) {
              if (Array.isArray(obj.message.content)) {
                for (const b of obj.message.content) {
                  if (b.type === 'tool_use') {
                    const tc = { name: b.name, input: b.input };
                    toolCalls.push(tc);
                    if (isStreaming) {
                      res.write(`data: ${JSON.stringify({ type: 'tool_use', tool: tc })}\n\n`);
                    }
                  } else if (b.type === 'text' && !text) {
                    text = b.text;
                    if (isStreaming) {
                      res.write(`data: ${JSON.stringify({ type: 'text_delta', delta: b.text })}\n\n`);
                    }
                  }
                }
              } else if (!text && typeof obj.message.content === 'string') {
                text = obj.message.content;
                if (isStreaming) {
                  res.write(`data: ${JSON.stringify({ type: 'text_delta', delta: obj.message.content })}\n\n`);
                }
              }
            }
          } catch (e) {}
        }
      });

      child.stderr.on('data', data => {
        stderrRaw += data.toString('utf-8');
      });

      child.on('close', code => {
        res.off('close', onCloseClient);
        let reply = text.trim();
        if (!reply && stdoutRaw.trim()) {
          const clean = stdoutRaw.replace(/\{[^}]+\}/g, '').trim();
          if (clean) reply = clean;
        }
        if (!reply && thinking.trim()) {
          reply = thinking.trim();
        }
        resolve({
          code,
          reply,
          thinking: thinking.trim() || null,
          toolCalls,
          finalSessionId,
          stdoutRaw,
          stderrRaw
        });
      });

      child.on('error', err => {
        res.off('close', onCloseClient);
        resolve({
          code: 1,
          reply: '',
          thinking: '',
          toolCalls: [],
          finalSessionId: null,
          stdoutRaw: '',
          stderrRaw: err.message
        });
      });
    });
  }

  try {
    const initialResumeId = (sessionId && continueSession !== false) ? sessionId : null;
    let resObj = await runProcess(initialResumeId);

    // 容错回退：如果是 resume 失败（如 SessionNotFoundError 或返回空），自动回退为新会话重新执行一次
    if (initialResumeId && (!resObj.reply && !resObj.thinking)) {
      console.warn(`[CLI] 会话 ${initialResumeId} 恢复失败或已清理，自动切换为新会话重试...`);
      resObj = await runProcess(null);
    }

    const durationMs = Date.now() - startTime;

    if (isStreaming) {
      if (resObj.reply || resObj.thinking) {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          reply: resObj.reply || '已完成推理与处理。',
          thinking: resObj.thinking,
          toolCalls: resObj.toolCalls,
          sessionId: resObj.finalSessionId,
          model: safeModel,
          account_nickname: account.nickname || `账号 #${account.id}`,
          duration_ms: durationMs,
          exitCode: resObj.code
        })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: resObj.stderrRaw.trim() || `模型响应超时或异常退出 (退出码: ${resObj.code})`
        })}\n\n`);
      }
      return res.end();
    } else {
      if (resObj.reply || resObj.thinking) {
        return res.json({
          code: 0,
          data: {
            reply: resObj.reply || '已完成推理与处理。',
            thinking: resObj.thinking,
            output: resObj.reply || resObj.thinking,
            toolCalls: resObj.toolCalls,
            sessionId: resObj.finalSessionId,
            model: safeModel,
            account_nickname: account.nickname || `账号 #${account.id}`,
            duration_ms: durationMs,
            exitCode: resObj.code
          }
        });
      } else {
        return res.status(500).json({
          code: 500,
          message: resObj.stderrRaw.trim() || `模型响应超时或异常退出 (退出码: ${resObj.code})`,
          output: resObj.stdoutRaw.trim()
        });
      }
    }
  } catch (err) {
    if (isStreaming) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: '服务执行异常: ' + err.message
      })}\n\n`);
      return res.end();
    }
    return res.status(500).json({
      code: 500,
      message: '服务执行异常: ' + err.message
    });
  }
});

router.post('/cli/execute', (req, res) => {
  return router.handle({ ...req, url: '/cli/chat', method: 'POST' }, res);
});

module.exports = router;
