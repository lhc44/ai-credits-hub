const db = require('../db');
const { getProvider } = require('../providers');

/**
 * 签到任务执行器
 * 对所有 active 状态的账号执行签到
 */
async function runCheckinTask() {
  console.log('\n========================================');
  console.log(`[签到任务] 开始执行 - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('========================================\n');

  const accounts = db.prepare(
    'SELECT * FROM accounts WHERE status = ?'
  ).all('active');

  if (accounts.length === 0) {
    console.log('[签到任务] 没有活跃账号，跳过');
    return { total: 0, success: 0, failed: 0, results: [] };
  }

  console.log(`[签到任务] 找到 ${accounts.length} 个活跃账号`);

  const results = [];
  let successCount = 0;
  let alreadyDoneCount = 0;
  let failedCount = 0;

  for (const account of accounts) {
    // 随机延迟，防止被检测
    const minDelay = parseInt(process.env.CHECKIN_DELAY_MIN || '10');
    const maxDelay = parseInt(process.env.CHECKIN_DELAY_MAX || '120');
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    console.log(`\n[签到任务] 账号: ${account.nickname || account.id} (${account.platform}) - 延迟 ${delay} 秒...`);
    await sleep(delay * 1000);

    try {
      const provider = getProvider(account);
      const result = await provider.checkin();

      // 记录签到日志
      db.prepare(`
        INSERT INTO checkin_logs (account_id, platform, status, credits_earned, message, raw_response)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        account.id,
        account.platform,
        result.status,
        result.creditsEarned,
        result.message,
        result.rawResponse || ''
      );

      // 更新账号信息
      const updates = {
        last_checkin_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (result.status === 'success') {
        updates.credits_balance = (account.credits_balance || 0) + (result.creditsEarned || 0);
        updates.consecutive_days = (account.consecutive_days || 0) + 1;
        successCount++;
      } else if (result.status === 'already_done') {
        alreadyDoneCount++;
        if (!account.credits_balance) updates.credits_balance = 100;
        if (!account.consecutive_days) updates.consecutive_days = 1;
      } else if (result.status === 'token_expired') {
        updates.status = 'expired';
        failedCount++;
      } else {
        failedCount++;
      }

      // 实时校准官方最新余额与连签天数
      try {
        const liveBal = await provider.getBalance();
        if (liveBal && liveBal.success) {
          if (liveBal.credits !== undefined) updates.credits_balance = liveBal.credits;
          if (liveBal.consecutiveDays !== undefined) updates.consecutive_days = liveBal.consecutiveDays;
        }
      } catch (e) {}

      // 更新 Token (如果有新的)
      if (result.newAccessToken) {
        updates.access_token = result.newAccessToken;
      }
      if (result.newRefreshToken) {
        updates.refresh_token = result.newRefreshToken;
      }
      if (result.extraData) {
        updates.extra_data = JSON.stringify(result.extraData);
      }

      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(account.id);

      db.prepare(`UPDATE accounts SET ${setClauses} WHERE id = ?`).run(...values);

      console.log(`[签到任务] ✅ ${account.nickname || account.id} (${account.platform}): ${result.message}`);

      results.push({
        accountId: account.id,
        nickname: account.nickname,
        platform: account.platform,
        ...result,
      });
    } catch (err) {
      console.error(`[签到任务] ❌ ${account.nickname || account.id} (${account.platform}): ${err.message}`);
      failedCount++;

      db.prepare(`
        INSERT INTO checkin_logs (account_id, platform, status, credits_earned, message, raw_response)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(account.id, account.platform, 'failed', 0, err.message, '');

      results.push({
        accountId: account.id,
        nickname: account.nickname,
        platform: account.platform,
        success: false,
        status: 'failed',
        message: err.message,
      });
    }
  }

  console.log(`\n========================================`);
  console.log(`[签到任务] 完成! 新签成功: ${successCount}, 今日已签过: ${alreadyDoneCount}, 失败: ${failedCount}`);
  console.log('========================================\n');

  return {
    total: accounts.length,
    success: successCount,
    alreadyDone: alreadyDoneCount,
    failed: failedCount,
    results,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 如果直接运行此文件则立即执行签到
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  runCheckinTask()
    .then(result => {
      console.log('\n签到结果:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('签到任务出错:', err);
      process.exit(1);
    });
}

module.exports = { runCheckinTask };
