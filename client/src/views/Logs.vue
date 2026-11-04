<template>
  <div class="logs-page">
    <h1 class="page-title">📝 签到日志</h1>

    <!-- 筛选工具栏 -->
    <div class="card filter-card">
      <div class="filter-inputs">
        <select v-model="filters.platform" class="form-select filter-select">
          <option value="">全部平台</option>
          <option value="workbuddy">🤖 WorkBuddy</option>
          <option value="qoder">💻 QoderCN</option>
          <option value="trae">⚡ Trae</option>
        </select>
        <select v-model="filters.status" class="form-select filter-select">
          <option value="">全部状态</option>
          <option value="success">✅ 成功</option>
          <option value="already_done">🔁 已签到</option>
          <option value="failed">❌ 失败</option>
          <option value="token_expired">⚠️ Token过期</option>
        </select>
      </div>
      <button class="btn btn-outline btn-sm filter-refresh-btn" @click="fetchLogs">🔄 刷新</button>
    </div>

    <!-- 桌面端表格视图 (屏幕 >= 768px) -->
    <div class="card table-container desktop-only-block">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>账号</th>
            <th>平台</th>
            <th>状态</th>
            <th>积分</th>
            <th>消息</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="logs.length === 0">
            <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-light);">
              暂无签到日志
            </td>
          </tr>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ formatTime(log.created_at) }}</td>
            <td style="font-weight: 600;">{{ log.nickname || `#${log.account_id}` }}</td>
            <td>
              <span>{{ getPlatformIcon(log.platform) }} {{ getPlatformName(log.platform) }}</span>
            </td>
            <td>
              <span :class="['tag', getStatusClass(log.status)]">{{ getStatusText(log.status) }}</span>
            </td>
            <td>
              <span v-if="log.credits_earned > 0" style="color: var(--success); font-weight: 700;">
                +{{ log.credits_earned }}
              </span>
              <span v-else style="color: var(--text-light);">0</span>
            </td>
            <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              {{ log.message }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片视图 (屏幕 < 768px) -->
    <div class="mobile-only-block logs-mobile-list">
      <div v-if="logs.length === 0" class="card" style="text-align: center; padding: 30px; color: var(--text-light);">
        暂无签到日志
      </div>
      <div v-for="log in logs" :key="log.id" class="mobile-log-card">
        <div class="m-log-top">
          <div class="m-log-account">
            <span style="font-size: 16px;">{{ getPlatformIcon(log.platform) }}</span>
            <span style="font-weight: 600; font-size: 13px;">{{ log.nickname || `#${log.account_id}` }}</span>
          </div>
          <span :class="['tag', getStatusClass(log.status)]">{{ getStatusText(log.status) }}</span>
        </div>

        <div class="m-log-body">
          <div class="m-log-msg">{{ log.message }}</div>
          <div class="m-log-credit" v-if="log.credits_earned > 0">
            +{{ log.credits_earned }} 积分
          </div>
        </div>

        <div class="m-log-time">{{ formatTime(log.created_at) }}</div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination" v-if="total > pageSize">
      <button @click="page > 1 && changePage(page - 1)" :disabled="page <= 1">上一页</button>
      <span class="current">{{ page }} / {{ totalPages }}</span>
      <button @click="page < totalPages && changePage(page + 1)" :disabled="page >= totalPages">下一页</button>
    </div>
  </div>
</template>

<script>
import api from '../api'

const PLATFORM_MAP = {
  workbuddy: { name: 'WorkBuddy', icon: '🤖' },
  qoder: { name: 'QoderCN', icon: '💻' },
  trae: { name: 'Trae', icon: '⚡' },
}

const STATUS_MAP = {
  success: { text: '成功', class: 'tag-success' },
  already_done: { text: '已签到', class: 'tag-info' },
  failed: { text: '失败', class: 'tag-danger' },
  token_expired: { text: 'Token过期', class: 'tag-warning' },
}

export default {
  data() {
    return {
      logs: [],
      total: 0,
      page: 1,
      pageSize: 20,
      filters: {
        platform: '',
        status: '',
      },
    }
  },
  computed: {
    totalPages() {
      return Math.ceil(this.total / this.pageSize)
    },
  },
  watch: {
    'filters.platform'() { this.page = 1; this.fetchLogs() },
    'filters.status'() { this.page = 1; this.fetchLogs() },
  },
  mounted() {
    this.fetchLogs()
  },
  methods: {
    async fetchLogs() {
      try {
        const params = {
          page: this.page,
          pageSize: this.pageSize,
          ...this.filters,
        }
        Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })

        const res = await api.get('/logs', { params })
        this.logs = res.data.list
        this.total = res.data.total
      } catch (err) {
        console.error('获取日志失败:', err)
      }
    },
    changePage(p) {
      this.page = p
      this.fetchLogs()
    },
    formatTime(t) {
      if (!t) return '-'
      const d = new Date(t)
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    },
    getPlatformIcon(p) { return PLATFORM_MAP[p]?.icon || '❓' },
    getPlatformName(p) { return PLATFORM_MAP[p]?.name || p },
    getStatusClass(s) { return STATUS_MAP[s]?.class || 'tag-info' },
    getStatusText(s) { return STATUS_MAP[s]?.text || s },
  },
}
</script>

<style scoped>
.filter-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-inputs {
  display: flex;
  gap: 10px;
  flex: 1;
}

.filter-select {
  width: auto;
  min-width: 130px;
}

.desktop-only-block { display: block; }
.mobile-only-block { display: none; }

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.pagination button {
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.pagination .current {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
}

/* ==================== 手机端适配 ==================== */
@media (max-width: 767px) {
  .desktop-only-block { display: none !important; }
  .mobile-only-block { display: block !important; }

  .filter-card {
    padding: 12px;
  }

  .filter-inputs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    width: 100%;
    gap: 8px;
  }

  .filter-select {
    min-width: auto;
    width: 100%;
    padding: 8px;
    font-size: 13px;
  }

  .filter-refresh-btn {
    width: 100%;
    padding: 8px;
  }

  .logs-mobile-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-log-card {
    background: white;
    border-radius: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .m-log-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .m-log-account {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .m-log-body {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 6px;
  }

  .m-log-msg {
    font-size: 13px;
    color: var(--text);
    line-height: 1.4;
    word-break: break-all;
  }

  .m-log-credit {
    font-size: 13px;
    font-weight: 700;
    color: var(--success);
    white-space: nowrap;
  }

  .m-log-time {
    font-size: 11px;
    color: var(--text-light);
  }
}
</style>
