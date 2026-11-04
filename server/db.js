const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/db.json');
const jsonPath = DB_PATH.endsWith('.db') ? DB_PATH.replace(/\.db$/, '.json') : DB_PATH;

// 确保数据目录存在
const dbDir = path.dirname(path.resolve(jsonPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 内存数据库结构
let state = {
  users: [],
  accounts: [],
  checkin_logs: [],
  settings: {},
  _seq: { users: 0, accounts: 0, checkin_logs: 0 }
};

// 从磁盘加载
if (fs.existsSync(jsonPath)) {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    state = JSON.parse(raw);
    state._seq = state._seq || { users: 0, accounts: 0, checkin_logs: 0 };
  } catch (err) {
    console.error('[DB] 加载已有数据失败，使用初始结构:', err.message);
  }
}

// 防抖写入磁盘
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] 保存数据失败:', e);
    }
  }, 100);
}

function persistSync() {
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DB] 同步保存数据失败:', e);
  }
}

// 提供与 better-sqlite3 兼容的 interface
const db = {
  pragma: () => {},
  exec: () => {},
  prepare: (sql) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      get: (...params) => {
        // SELECT * FROM users WHERE username = ?
        if (/SELECT \* FROM users WHERE username = \?/i.test(normalized) || /SELECT id FROM users WHERE username = \?/i.test(normalized)) {
          const username = params[0];
          return state.users.find(u => u.username === username) || null;
        }

        // SELECT * FROM users WHERE id = ?
        if (/SELECT \* FROM users WHERE id = \?/i.test(normalized)) {
          const id = Number(params[0]);
          return state.users.find(u => u.id === id) || null;
        }

        // SELECT * FROM accounts WHERE id = ? AND user_id = ?
        if (/SELECT \* FROM accounts WHERE id = \? AND user_id = \?/i.test(normalized)) {
          const [id, userId] = params.map(Number);
          return state.accounts.find(a => a.id === id && a.user_id === userId) || null;
        }

        // SELECT * FROM accounts WHERE user_id = ? AND platform = 'workbuddy'
        if (/FROM accounts WHERE user_id = \? AND platform = 'workbuddy'/i.test(normalized)) {
          const userId = Number(params[0]);
          return state.accounts.find(a => a.user_id === userId && a.platform === 'workbuddy' && a.access_token) || null;
        }

        // Dashboard 账号统计
        if (/COUNT\(\*\) as total,.*SUM\(CASE WHEN status = 'active'.*FROM accounts WHERE user_id = \?/i.test(normalized)) {
          const userId = Number(params[0]);
          const userAccounts = state.accounts.filter(a => a.user_id === userId);
          return {
            total: userAccounts.length,
            active: userAccounts.filter(a => a.status === 'active').length,
            expired: userAccounts.filter(a => a.status === 'expired').length,
            totalCredits: userAccounts.reduce((acc, a) => acc + (Number(a.credits_balance) || 0), 0)
          };
        }

        // Dashboard 今日签到统计 (按账号严格去重，每账号今日最多计 1 次，杜绝重复计数)
        if (/COUNT\(\*\) as total,.*SUM\(CASE WHEN l\.status = 'success'.*WHERE a\.user_id = \? AND date\(l\.created_at\) = \?/i.test(normalized)) {
          const userId = Number(params[0]);
          const today = params[1];
          const userAccounts = state.accounts.filter(a => a.user_id === userId);
          const userAccountIds = new Set(userAccounts.map(a => a.id));
          const logsToday = state.checkin_logs.filter(l => userAccountIds.has(l.account_id) && (l.created_at || '').slice(0, 10) === today);

          // 按时间升序遍历，每个账号取今日最新的状态
          const latestLogByAccount = new Map();
          for (const l of logsToday) {
            latestLogByAccount.set(l.account_id, l);
          }

          let successCount = 0;
          let alreadyDoneCount = 0;
          let failedCount = 0;

          for (const acc of userAccounts) {
            const log = latestLogByAccount.get(acc.id);
            if (log) {
              if (log.status === 'success') {
                successCount++;
              } else if (log.status === 'already_done') {
                alreadyDoneCount++;
              } else if (log.status === 'failed' || log.status === 'token_expired') {
                failedCount++;
              }
            } else if (acc.status === 'expired') {
              failedCount++;
            }
          }

          const checkedAccounts = successCount + alreadyDoneCount;
          const pendingCount = Math.max(0, userAccounts.length - checkedAccounts - failedCount);

          return {
            total: userAccounts.length,
            checkedAccounts,
            success: successCount,
            alreadyDone: alreadyDoneCount,
            pending: pendingCount,
            failed: failedCount,
            creditsEarned: logsToday.filter(l => l.status === 'success').reduce((acc, l) => acc + (Number(l.credits_earned) || 0), 0)
          };
        }

        // 日志总数统计
        if (/SELECT COUNT\(\*\) as count FROM checkin_logs l/i.test(normalized)) {
          const userId = Number(params[0]);
          const userAccountIds = new Set(state.accounts.filter(a => a.user_id === userId).map(a => a.id));
          let list = state.checkin_logs.filter(l => userAccountIds.has(l.account_id));

          let paramIdx = 1;
          if (/AND l\.account_id = \?/i.test(normalized)) {
            const accId = Number(params[paramIdx++]);
            list = list.filter(l => l.account_id === accId);
          }
          if (/AND l\.platform = \?/i.test(normalized)) {
            const platform = params[paramIdx++];
            list = list.filter(l => l.platform === platform);
          }
          if (/AND l\.status = \?/i.test(normalized)) {
            const status = params[paramIdx++];
            list = list.filter(l => l.status === status);
          }

          return { count: list.length };
        }

        return null;
      },

      all: (...params) => {
        // SELECT * FROM accounts WHERE status = ?
        if (/SELECT \* FROM accounts WHERE status = \?/i.test(normalized)) {
          const status = params[0];
          return state.accounts.filter(a => a.status === status);
        }

        // SELECT id, user_id, platform... FROM accounts WHERE user_id = ? ORDER BY created_at DESC
        if (/FROM accounts WHERE user_id = \? AND platform = 'workbuddy'/i.test(normalized)) {
          const userId = Number(params[0]);
          return state.accounts.filter(a => a.user_id === userId && a.platform === 'workbuddy');
        }

        if (/FROM accounts WHERE user_id = \?/i.test(normalized) && !/GROUP BY platform/i.test(normalized)) {
          const userId = Number(params[0]);
          return state.accounts
            .filter(a => a.user_id === userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        // 各平台账号数统计: SELECT platform, COUNT(*) as count, SUM(credits_balance) as credits FROM accounts WHERE user_id = ? GROUP BY platform
        if (/SELECT platform, COUNT\(\*\) as count.*GROUP BY platform/i.test(normalized)) {
          const userId = Number(params[0]);
          const userAccounts = state.accounts.filter(a => a.user_id === userId);
          const groups = {};
          for (const a of userAccounts) {
            if (!groups[a.platform]) groups[a.platform] = { platform: a.platform, count: 0, credits: 0 };
            groups[a.platform].count += 1;
            groups[a.platform].credits += (Number(a.credits_balance) || 0);
          }
          return Object.values(groups);
        }

        // 近7天趋势 (按日期与账号严格去重，每账号每天仅计 1 次)
        if (/GROUP BY date\(l\.created_at\)/i.test(normalized)) {
          const userId = Number(params[0]);
          const userAccountIds = new Set(state.accounts.filter(a => a.user_id === userId).map(a => a.id));
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          const relevantLogs = state.checkin_logs.filter(l => userAccountIds.has(l.account_id) && (l.created_at || '').slice(0, 10) >= sevenDaysAgo);

          const groups = {};
          for (const l of relevantLogs) {
            const date = (l.created_at || '').slice(0, 10);
            if (!groups[date]) groups[date] = { date, accountsMap: new Map(), credits: 0 };
            if (!groups[date].accountsMap.has(l.account_id)) {
              groups[date].accountsMap.set(l.account_id, l.status);
            } else if (l.status === 'success') {
              groups[date].accountsMap.set(l.account_id, 'success');
            }
            if (l.status === 'success') {
              groups[date].credits += (Number(l.credits_earned) || 0);
            }
          }

          const result = Object.values(groups).map(g => {
            let success = 0;
            let alreadyDone = 0;
            for (const status of g.accountsMap.values()) {
              if (status === 'success') success++;
              else if (status === 'already_done') alreadyDone++;
            }
            return {
              date: g.date,
              total: g.accountsMap.size,
              success,
              alreadyDone,
              credits: g.credits
            };
          });

          return result.sort((a, b) => a.date.localeCompare(b.date));
        }

        // 日志列表分页查询: SELECT l.*, a.nickname, a.platform as account_platform FROM checkin_logs l JOIN accounts a ...
        if (/FROM checkin_logs l JOIN accounts a/i.test(normalized)) {
          const userId = Number(params[0]);
          const accountsMap = new Map(state.accounts.filter(a => a.user_id === userId).map(a => [a.id, a]));
          let list = state.checkin_logs
            .filter(l => accountsMap.has(l.account_id))
            .map(l => {
              const acc = accountsMap.get(l.account_id);
              return {
                ...l,
                nickname: acc ? acc.nickname : '',
                account_platform: acc ? acc.platform : l.platform
              };
            });

          let paramIdx = 1;
          if (/AND l\.account_id = \?/i.test(normalized)) {
            const accId = Number(params[paramIdx++]);
            list = list.filter(l => l.account_id === accId);
          }
          if (/AND l\.platform = \?/i.test(normalized)) {
            const platform = params[paramIdx++];
            list = list.filter(l => l.platform === platform);
          }
          if (/AND l\.status = \?/i.test(normalized)) {
            const status = params[paramIdx++];
            list = list.filter(l => l.status === status);
          }

          // 排序
          list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

          // LIMIT ? OFFSET ?
          const limit = Number(params[paramIdx++]);
          const offset = Number(params[paramIdx++]);

          return list.slice(offset, offset + limit);
        }

        return [];
      },

      run: (...params) => {
        // INSERT INTO users (username, password) VALUES (?, ?)
        if (/INSERT INTO users/i.test(normalized)) {
          const [username, password] = params;
          state._seq.users += 1;
          const newUser = {
            id: state._seq.users,
            username,
            password,
            created_at: new Date().toISOString()
          };
          state.users.push(newUser);
          persistSync();
          return { lastInsertRowid: newUser.id, changes: 1 };
        }

        // UPDATE users SET password = ? WHERE id = ?
        if (/UPDATE users SET password = \? WHERE id = \?/i.test(normalized)) {
          const [password, id] = params;
          const user = state.users.find(u => u.id === Number(id));
          if (user) {
            user.password = password;
            persistSync();
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // INSERT INTO accounts (user_id, platform, nickname, access_token, refresh_token, extra_data) VALUES (...)
        if (/INSERT INTO accounts/i.test(normalized)) {
          const [user_id, platform, nickname, access_token, refresh_token, extra_data] = params;
          state._seq.accounts += 1;
          const newAccount = {
            id: state._seq.accounts,
            user_id: Number(user_id),
            platform,
            nickname: nickname || '',
            access_token: access_token || '',
            refresh_token: refresh_token || '',
            extra_data: extra_data || '{}',
            status: 'active',
            credits_balance: 0,
            consecutive_days: 0,
            last_checkin_at: null,
            last_token_refresh_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          state.accounts.push(newAccount);
          persistSync();
          return { lastInsertRowid: newAccount.id, changes: 1 };
        }

        // UPDATE accounts SET ... WHERE id = ?
        if (/UPDATE accounts SET/i.test(normalized)) {
          const id = Number(params[params.length - 1]);
          const account = state.accounts.find(a => a.id === id);
          if (account) {
            // 解析 set 子句
            const setPart = normalized.substring(normalized.indexOf('SET') + 3, normalized.indexOf('WHERE')).trim();
            const keys = setPart.split(',').map(s => s.split('=')[0].trim());
            for (let i = 0; i < keys.length; i++) {
              account[keys[i]] = params[i];
            }
            account.updated_at = new Date().toISOString();
            persistSync();
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // DELETE FROM accounts WHERE id = ?
        if (/DELETE FROM accounts WHERE id = \?/i.test(normalized)) {
          const id = Number(params[0]);
          const beforeLen = state.accounts.length;
          state.accounts = state.accounts.filter(a => a.id !== id);
          state.checkin_logs = state.checkin_logs.filter(l => l.account_id !== id);
          persistSync();
          return { changes: beforeLen - state.accounts.length };
        }

        // INSERT INTO checkin_logs (account_id, platform, status, credits_earned, message, raw_response) VALUES (...)
        if (/INSERT INTO checkin_logs/i.test(normalized)) {
          const [account_id, platform, status, credits_earned, message, raw_response] = params;
          state._seq.checkin_logs += 1;
          const newLog = {
            id: state._seq.checkin_logs,
            account_id: Number(account_id),
            platform,
            status,
            credits_earned: Number(credits_earned) || 0,
            message: message || '',
            raw_response: raw_response || '',
            created_at: new Date().toISOString()
          };
          state.checkin_logs.push(newLog);
          persist();
          return { lastInsertRowid: newLog.id, changes: 1 };
        }

        return { changes: 0 };
      }
    };
  },
  getSettings: () => {
    return state.settings || {};
  },
  setSettings: (newSettings) => {
    state.settings = Object.assign(state.settings || {}, newSettings);
    persistSync();
    return state.settings;
  }
};

module.exports = db;
