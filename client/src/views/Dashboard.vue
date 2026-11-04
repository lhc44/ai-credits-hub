<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1 class="page-title">📊 数据概览</h1>
      <button class="btn btn-outline btn-sm" @click="fetchDashboard">🔄 刷新数据</button>
    </div>

    <!-- 统计网格卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #667eea, #764ba2)">👤</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.accounts?.total || 0 }}</div>
          <div class="stat-label">总账号数</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #48bb78, #38a169)">💰</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.accounts?.totalCredits || 0 }}</div>
          <div class="stat-label">累计总积分</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669)">✅</div>
        <div class="stat-info">
          <div class="stat-value">
            {{ stats.today?.checkedAccounts !== undefined ? stats.today.checkedAccounts : ((stats.today?.success || 0) + (stats.today?.alreadyDone || 0)) }}
            <span style="font-size: 13px; font-weight: normal; color: var(--text-light);">/ {{ stats.accounts?.total || 0 }}</span>
          </div>
          <div class="stat-label">今日已打卡账号</div>
          <div style="font-size: 11px; color: #10b981; margin-top: 2px;">
            新签 {{ stats.today?.success || 0 }} · 无需重签 {{ stats.today?.alreadyDone || 0 }}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #f56565, #e53e3e)">❌</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.today?.failed || 0 }}</div>
          <div class="stat-label">今日签到异常</div>
          <div style="font-size: 11px; color: var(--text-light); margin-top: 2px;">
            待打卡 {{ stats.today?.pending || 0 }}
          </div>
        </div>
      </div>
    </div>

    <!-- 核心操作区 -->
    <div class="card action-card">
      <div class="action-left">
        <button class="btn btn-primary checkin-all-btn" @click="checkinAll" :disabled="checkinLoading">
          {{ checkinLoading ? '⏳ 正在批量轮签中...' : '🚀 一键全部签到' }}
        </button>
        <div v-if="lastCheckinResult" class="checkin-summary">
          上次执行：新打卡成功 {{ lastCheckinResult.success || 0 }} 个 · 今日已签过 {{ lastCheckinResult.alreadyDone || 0 }} 个 · 异常 {{ lastCheckinResult.failed || 0 }} 个
        </div>
      </div>

      <div class="cron-status-box" @click="$router.push('/accounts?settings=1')" title="点击修改每日签到时间">
        <span style="font-size: 22px;">⏰</span>
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: 600;">
            每日自动签到：每天 {{ settings.checkinTime || '08:30' }}
          </div>
          <div style="font-size: 11px; color: var(--text-light); margin-top: 2px;">
            <span :style="{ color: settings.autoCheckinEnabled !== false ? '#10b981' : '#f59e0b', fontWeight: 600 }">
              {{ settings.autoCheckinEnabled !== false ? '● 运行中' : '○ 已暂停' }}
            </span>
            · 点击修改签到时间
          </div>
        </div>
        <button class="btn btn-outline btn-sm" style="padding: 4px 10px; font-size: 12px;" @click.stop="$router.push('/accounts?settings=1')">
          ⚙️ 设置
        </button>
      </div>
    </div>

    <!-- 平台分布 -->
    <div class="card" v-if="stats.platformCounts?.length">
      <h3 style="margin-bottom: 12px; font-size: 15px; font-weight: 700;">📱 各平台账号分布</h3>
      <div class="platform-grid">
        <div v-for="p in stats.platformCounts" :key="p.platform" class="platform-item">
          <span class="platform-icon">{{ getPlatformIcon(p.platform) }}</span>
          <div>
            <div style="font-weight: 600; font-size: 14px;">{{ getPlatformName(p.platform) }}</div>
            <div style="color: var(--text-light); font-size: 12px;">
              {{ p.count }} 个账号 · 累计 {{ p.credits || 0 }} 积分
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 7天趋势 -->
    <div class="card" v-if="stats.weekTrend?.length">
      <h3 style="margin-bottom: 14px; font-size: 15px; font-weight: 700;">📈 近 7 天打卡趋势 (按账号去重)</h3>
      <div class="trend-chart">
        <div v-for="day in stats.weekTrend" :key="day.date" class="trend-bar-group">
          <div class="trend-bar-container">
            <div
              class="trend-bar"
              :style="{ height: getBarHeight((day.success || 0) + (day.alreadyDone || 0)) + '%' }"
              :title="`新打卡: ${day.success}, 已签过: ${day.alreadyDone || 0}, 账号总数: ${day.total}`"
            ></div>
          </div>
          <div class="trend-date">{{ formatDate(day.date) }}</div>
          <div class="trend-count">{{ day.success }}</div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast.show" :class="['toast', 'toast-' + toast.type]">{{ toast.message }}</div>
  </div>
</template>

<script>
import api from '../api'

const PLATFORM_MAP = {
  workbuddy: { name: 'WorkBuddy', icon: '🤖' },
  qoder: { name: 'QoderCN', icon: '💻' },
  trae: { name: 'Trae', icon: '⚡' },
}

export default {
  data() {
    return {
      stats: {},
      settings: { checkinTime: '08:05', autoCheckinEnabled: true },
      checkinLoading: false,
      lastCheckinResult: null,
      toast: { show: false, type: 'info', message: '' },
    }
  },
  mounted() {
    this.fetchDashboard()
  },
  methods: {
    async fetchDashboard() {
      try {
        const [dashRes, setRes] = await Promise.all([
          api.get('/dashboard'),
          api.get('/settings').catch(() => null)
        ])
        this.stats = dashRes.data
        if (setRes && setRes.data) {
          this.settings = setRes.data
        }
      } catch (err) {
        console.error('获取统计失败:', err)
      }
    },
    async checkinAll() {
      this.checkinLoading = true
      try {
        const res = await api.post('/checkin-all')
        this.lastCheckinResult = res.data
        const { success = 0, alreadyDone = 0, failed = 0 } = res.data || {}
        let msg = ''
        if (success > 0) {
          msg = `签到完成! 新增打卡成功 ${success} 个` + (alreadyDone > 0 ? `，已签过 ${alreadyDone} 个` : '')
        } else if (alreadyDone > 0) {
          msg = `所有账号今日均已完成签到 (${alreadyDone} 个无需重复打卡)`
        } else {
          msg = '签到执行完成'
        }
        if (failed > 0) msg += `，异常 ${failed} 个`

        this.showToast(failed > 0 && success === 0 && alreadyDone === 0 ? 'error' : 'success', msg)
        this.fetchDashboard()
      } catch (err) {
        this.showToast('error', '签到失败: ' + (err.message || '未知错误'))
      } finally {
        this.checkinLoading = false
      }
    },
    getPlatformIcon(platform) {
      return PLATFORM_MAP[platform]?.icon || '❓'
    },
    getPlatformName(platform) {
      return PLATFORM_MAP[platform]?.name || platform
    },
    formatDate(dateStr) {
      const d = new Date(dateStr)
      return `${d.getMonth() + 1}/${d.getDate()}`
    },
    getBarHeight(value) {
      const max = Math.max(...(this.stats.weekTrend || []).map(d => (d.success || 0) + (d.alreadyDone || 0)), 1)
      return Math.max((value / max) * 100, 8)
    },
    showToast(type, message) {
      this.toast = { show: true, type, message }
      setTimeout(() => { this.toast.show = false }, 3000)
    },
  },
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--border);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 2px;
}

.action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cron-status-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid var(--border);
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.cron-status-box:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.checkin-summary {
  font-size: 13px;
  color: var(--text-light);
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.platform-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.platform-icon {
  font-size: 24px;
}

.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 150px;
  padding: 0 6px;
}

.trend-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.trend-bar-container {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.trend-bar {
  width: 24px;
  background: linear-gradient(180deg, #667eea, #764ba2);
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.3s ease;
}

.trend-date {
  font-size: 11px;
  color: var(--text-light);
}

.trend-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

/* ==================== 手机端适配 ==================== */
@media (max-width: 767px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-card {
    padding: 12px 10px;
    gap: 10px;
  }

  .stat-icon {
    width: 36px;
    height: 36px;
    font-size: 16px;
    border-radius: 8px;
  }

  .stat-value {
    font-size: 18px;
  }

  .stat-label {
    font-size: 11px;
  }

  .action-card {
    flex-direction: column;
    align-items: stretch;
    padding: 14px;
  }

  .checkin-all-btn {
    width: 100%;
    padding: 12px;
    font-size: 15px;
    font-weight: 600;
  }

  .checkin-summary {
    text-align: center;
    font-size: 12px;
  }

  .trend-bar {
    width: 16px;
  }
}
</style>
