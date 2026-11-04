<template>
  <div class="accounts-page">
    <!-- 顶部操作栏 -->
    <div class="page-top-bar">
      <div>
        <h1 class="page-title">👤 账号管理</h1>
        <div class="page-subtitle">
          支持 WorkBuddy、QoderCN、Trae 多账号独立自动轮签
        </div>
      </div>
      <div class="top-actions">
        <button class="btn btn-outline" @click="refreshAllAccounts" :disabled="refreshingAll">
          {{ refreshingAll ? '⏳ 正在同步...' : '🔄 刷新实时积分' }}
        </button>
        <button class="btn btn-outline" @click="openSettingsModal">
          ⏰ 自动签到设置
        </button>
        <button class="btn btn-outline" @click="showTampermonkeyModal = true">
          🐒 油猴同步
        </button>
        <button class="btn btn-primary" @click="openAddModal()">
          ➕ 添加账号
        </button>
      </div>
    </div>

    <!-- 平台分类筛选 Tabs (支持平滑横向手势滑动) -->
    <div class="tabs-container">
      <button
        :class="['tab-btn', currentFilter === 'all' ? 'active' : '']"
        @click="currentFilter = 'all'"
      >
        全部 ({{ accounts.length }})
      </button>
      <button
        :class="['tab-btn', currentFilter === 'workbuddy' ? 'active' : '']"
        @click="currentFilter = 'workbuddy'"
      >
        🤖 WorkBuddy ({{ getPlatformCount('workbuddy') }})
      </button>
      <button
        :class="['tab-btn', currentFilter === 'qoder' ? 'active' : '']"
        @click="currentFilter = 'qoder'"
      >
        💻 QoderCN ({{ getPlatformCount('qoder') }})
      </button>
      <button
        :class="['tab-btn', currentFilter === 'trae' ? 'active' : '']"
        @click="currentFilter = 'trae'"
      >
        ⚡ Trae ({{ getPlatformCount('trae') }})
      </button>
    </div>

    <!-- 自适应账号列表 (完美适配电脑大屏、笔记本、平板与手机端) -->
    <div v-if="filteredAccounts.length > 0" class="accounts-adaptive-list">
      <div v-for="account in filteredAccounts" :key="account.id" class="adaptive-account-card">
        <!-- 账号基础身份信息区 -->
        <div class="aac-main">
          <span class="aac-icon">{{ account.platformInfo?.icon || '❓' }}</span>
          <div class="aac-identity">
            <div class="aac-name-row">
              <span class="aac-name" :title="account.nickname">{{ account.nickname || '未命名账号' }}</span>
              <span class="platform-badge" :class="'badge-' + account.platform">
                {{ account.platformInfo?.name || account.platform }}
              </span>
              <span :class="['tag', getStatusClass(account.status)]">
                {{ getStatusText(account.status) }}
              </span>
            </div>
            <!-- 签到反馈信息 -->
            <div v-if="account._result" :class="['aac-result-tag', account._result.success ? 'result-success' : 'result-error']">
              {{ account._result.message }}
            </div>
          </div>
        </div>

        <!-- 统计核心指标胶囊区 -->
        <div class="aac-stats">
          <div class="aac-stat-item">
            <span class="aac-stat-label">累计积分:</span>
            <span class="aac-stat-val val-credits">{{ account.credits_balance || 0 }}</span>
          </div>
          <div class="aac-stat-divider">·</div>
          <div class="aac-stat-item">
            <span class="aac-stat-label">连续签到:</span>
            <span class="aac-stat-val">{{ account.consecutive_days || 0 }} 天</span>
          </div>
          <div class="aac-stat-divider">·</div>
          <div class="aac-stat-item">
            <span class="aac-stat-label">上次签到:</span>
            <span class="aac-stat-time">{{ formatTime(account.last_checkin_at) }}</span>
          </div>
        </div>

        <!-- 操作按钮工具区 -->
        <div class="aac-actions">
          <button
            class="btn btn-success btn-sm aac-btn-checkin"
            @click="checkinAccount(account)"
            :disabled="account._loading"
          >
            {{ account._loading ? '签到中...' : '✅ 立即签到' }}
          </button>
          <div class="aac-btn-tools">
            <button class="btn btn-outline btn-sm" @click="refreshAccount(account)" :disabled="account._refreshing" title="查该账号官方实时积分与状态">
              {{ account._refreshing ? '⏳' : '🔄 查积分' }}
            </button>
            <button class="btn btn-outline btn-sm" @click="renameAccount(account)" title="修改账号名称">✏️ 改名</button>
            <button class="btn btn-outline btn-sm" @click="editAccount(account)" title="配置Token">⚙️ 配置</button>
            <button class="btn btn-outline btn-sm" @click="toggleStatus(account)" :title="account.status === 'active' ? '暂停定时任务' : '开启定时任务'">
              {{ account.status === 'active' ? '⏸️' : '▶️' }}
            </button>
            <button class="btn btn-danger btn-sm" @click="deleteAccount(account)" title="删除账号">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 网页凭据极速同步弹窗 (全浏览器/Edge深度适配) -->
    <div v-if="showTampermonkeyModal" class="modal-overlay" @click.self="showTampermonkeyModal = false">
      <div class="modal modal-wide" style="max-width: 680px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 26px;">⚡</span>
            <div>
              <h2 class="modal-title" style="margin-bottom: 0;">Trae / Qoder 凭证一键同步</h2>
              <div style="color: var(--text-light); font-size: 12px;">支持多种方式，解决 Edge/Chrome 等浏览器插件权限问题</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" @click="showTampermonkeyModal = false">✕</button>
        </div>

        <!-- 同步方式切换 Tabs -->
        <div class="sync-tabs" style="display: flex; gap: 8px; margin-bottom: 16px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 8px;">
          <button
            :class="['sync-tab-btn', syncModalTab === 'f12' ? 'active' : '']"
            @click="syncModalTab = 'f12'"
          >
            ⚡ F12 控制台一键同步 (Edge 首选 / 免装插件)
          </button>
          <button
            :class="['sync-tab-btn', syncModalTab === 'tm' ? 'active' : '']"
            @click="syncModalTab = 'tm'"
          >
            🐒 油猴插件同步 (自动检测)
          </button>
          <button
            :class="['sync-tab-btn', syncModalTab === 'bm' ? 'active' : '']"
            @click="syncModalTab = 'bm'"
          >
            📌 浏览器书签一键同步
          </button>
        </div>

        <!-- 方式 1: F12 控制台一键同步 -->
        <div v-if="syncModalTab === 'f12'">
          <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 14px; font-size: 12.5px; color: #93c5fd; line-height: 1.5;">
            💡 <strong>Edge 强烈推荐</strong>：完全不受 Edge 插件策略与权限限制，在 Trae 页面按 F12 粘贴回车即可 100% 成功同步！
          </div>

          <div class="guide-step-card" style="margin-bottom: 10px;">
            <div class="step-num">1</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 13px;">在 Edge 中打开并登录 Trae</div>
              <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                访问 <a href="https://www.trae.cn/dashboard#account" target="_blank" style="color: var(--primary); font-weight: 600;">trae.cn/dashboard#account ↗</a> 确保处于已登录状态。
              </div>
            </div>
          </div>

          <div class="guide-step-card" style="margin-bottom: 12px;">
            <div class="step-num">2</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 13px;">按 F12 键打开【控制台 (Console)】，粘贴下方代码按回车</div>
              <div style="position: relative; margin-top: 8px;">
                <textarea readonly :value="f12ConsoleCode" rows="3" style="width: 100%; box-sizing: border-box; background: #0f172a; color: #38bdf8; border: 1px solid #334155; border-radius: 6px; padding: 8px; font-family: monospace; font-size: 11px; resize: none;"></textarea>
                <button class="btn btn-primary btn-sm" @click="copyCode(f12ConsoleCode)" style="margin-top: 6px; width: 100%;">
                  📋 一键复制 F12 控制台同步代码
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 方式 2: 油猴插件同步及 Edge 常见问题排查 -->
        <div v-if="syncModalTab === 'tm'">
          <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 12px; margin-bottom: 14px; font-size: 12px; color: #fcd34d; line-height: 1.6;">
            ⚠️ <strong>Edge 没显示按钮常见原因与排查</strong>：<br>
            1. <b>快捷键冲突</b>：Edge 浏览器将 <code>Ctrl + Shift + S</code> 占为了自带的“网页截图”工具！在 Edge 中请改按 <b>Alt + Shift + S</b> 或 <b>Ctrl + Shift + X</b> 触发同步！<br>
            2. <b>插件站点权限</b>：请点击 Edge 右上角拼图扩展图标 🧩 -> 油猴 Tampermonkey -> 检查是否被 Edge 设置为了“在单击时运行”；请勾选为<b>【在所有网站上运行】</b>。<br>
            3. <b>Edge 首选终极方案</b>：直接切换上方第一项<b>【⚡ F12 控制台一键同步】</b>，无需任何扩展插件，在 Trae 按 F12 粘贴回车秒级同步！
          </div>

          <!-- 操作按钮组 -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <a :href="tampermonkeyScriptUrl" target="_blank" class="btn btn-primary btn-sm" style="display: inline-flex; justify-content: center; align-items: center;">
              🚀 点击自动安装脚本 (.user.js)
            </a>
            <button class="btn btn-outline btn-sm" @click="copyTampermonkeyScript" style="justify-content: center;">
              📋 一键复制代码 (手动新建粘贴)
            </button>
          </div>

          <div class="guide-step-card" style="margin-bottom: 10px;">
            <div class="step-num">1</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 13px;">若手动添加：打开油猴 -> 【添加新脚本】 -> 全选粘贴 -> Ctrl+S 保存</div>
              <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                点击复制按钮后，在 Edge 右上角点击油猴插件图标 🐒 -> 【添加新脚本】，将内容全选替换后按 Ctrl+S 保存即可生效！
              </div>
            </div>
          </div>

          <div class="guide-step-card">
            <div class="step-num">2</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 13px;">在 Trae 页面同步：点击油猴菜单 或 按快捷键</div>
              <div style="font-size: 12px; color: var(--text-light); margin-top: 3px;">
                在 Trae 网页上点击油猴图标 -> 选择 <b>“🚀 立即同步账号到签到面板”</b>，或直接按下 <b>Ctrl + Shift + S</b> 即可同步！
              </div>
            </div>
          </div>
        </div>

        <!-- 方式 3: 浏览器书签栏一键同步 -->
        <div v-if="syncModalTab === 'bm'">
          <div style="font-size: 13px; color: var(--text-light); margin-bottom: 12px; line-height: 1.5;">
            将下方按钮直接拖动到 Edge 浏览器的【收藏夹栏/书签栏】，以后在 Trae 登录页点击一下该书签即可自动同步：
          </div>

          <div style="text-align: center; margin: 18px 0;">
            <a
              :href="bookmarkletCode"
              class="btn btn-primary"
              style="cursor: grab; display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px; font-size: 14px; text-decoration: none;"
              onclick="alert('请将此按钮直接拖拽到浏览器的收藏夹/书签栏中！在 Trae 页面点击即可同步。'); return false;"
            >
              📌 拖拽我到收藏夹:「一键同步Trae」
            </a>
          </div>

          <div style="font-size: 12px; color: #94a3b8; text-align: center;">
            提示: 按 <code>Ctrl + Shift + B</code> 可以显示 Edge 收藏夹栏。
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 18px;">
          <button class="btn btn-outline" @click="showTampermonkeyModal = false">关闭窗口</button>
        </div>
      </div>
    </div>

    <!-- 添加 / 编辑账号通用弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h2 class="modal-title">{{ editingId ? '✏️ 编辑账号' : '➕ 添加 AI 平台账号' }}</h2>

        <!-- 平台选择卡片 -->
        <div v-if="!editingId" class="platform-selector">
          <div
            :class="['platform-tab-card', form.platform === 'workbuddy' ? 'active' : '']"
            @click="switchPlatform('workbuddy')"
          >
            <span style="font-size: 20px;">🤖</span>
            <div class="p-tab-name">WorkBuddy</div>
            <div class="p-tab-desc">微信扫码</div>
          </div>
          <div
            :class="['platform-tab-card', form.platform === 'qoder' ? 'active' : '']"
            @click="switchPlatform('qoder')"
          >
            <span style="font-size: 20px;">💻</span>
            <div class="p-tab-name">QoderCN</div>
            <div class="p-tab-desc">客户端自动生效</div>
          </div>
          <div
            :class="['platform-tab-card', form.platform === 'trae' ? 'active' : '']"
            @click="switchPlatform('trae')"
          >
            <span style="font-size: 20px;">⚡</span>
            <div class="p-tab-name">Trae CN</div>
            <div class="p-tab-desc">每日积分</div>
          </div>
        </div>

        <!-- WorkBuddy 专属：微信扫码直登 -->
        <div v-if="form.platform === 'workbuddy' && !editingId" class="login-method-box">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; font-size: 13px;">📲 微信扫码一键绑定</span>
            <button class="btn btn-primary btn-sm" @click="startQrLogin" :disabled="qrLoading">
              {{ qrLoading ? '加载中...' : '生成二维码' }}
            </button>
          </div>

          <div v-if="qrCodeUrl" style="text-align: center; padding: 10px 0;">
            <img :src="qrCodeUrl" alt="微信二维码" style="width: 150px; height: 150px; border-radius: 8px; border: 1px solid var(--border);" />
            <div style="font-size: 12px; margin-top: 6px; font-weight: 500;">
              微信扫码后自动绑定
            </div>
            <div style="margin-top: 4px;">
              <a :href="authTargetUrl" target="_blank" style="font-size: 12px; color: var(--primary);">
                🔗 或在浏览器直接打开授权
              </a>
            </div>
            <div class="poll-status" style="margin-top: 8px;">
              <span class="pulse-dot"></span>
              <span>{{ pollStatusText }}</span>
            </div>
          </div>
        </div>

        <!-- WorkBuddy 官方网址与指引 -->
        <div v-if="form.platform === 'workbuddy'" class="modal-platform-guide">
          <div class="mpg-header">
            <span style="font-weight: 600; font-size: 13px;">🤖 WorkBuddy (腾讯) 绑定指引</span>
            <a href="https://copilot.tencent.com" target="_blank" class="mpg-link">官方控制台 ↗</a>
          </div>
          <div class="mpg-content">
            支持微信扫码直登（推荐）或手动录入。扫码后系统将自动保存 AccessToken 与 RefreshToken 并保持长期有效。
          </div>
        </div>

        <!-- QoderCN 官方网址与指引 -->
        <div v-if="form.platform === 'qoder'" class="modal-platform-guide">
          <div class="mpg-header">
            <span style="font-weight: 600; font-size: 13px;">💻 QoderCN (通义灵码) 机制说明</span>
            <div style="display: flex; gap: 8px;">
              <a href="https://qoder.cn" target="_blank" class="mpg-link">官方控制台 ↗</a>
            </div>
          </div>
          <div class="mpg-content">
            📌 <strong>关于每日额度说明：</strong>Qoder 官方并未提供网页端每日签到接口（PAT 令牌仅用于 CLI/Agent 代码生成），每日免费额度由阿里云在桌面客户端启动登录时自动分配与刷新。<br/>
            在此处添加账号可用于集中记录与监控，每日定时任务会自动确认状态，无需手动打卡。
          </div>
        </div>

        <!-- Trae CN 官方网址与指引 -->
        <div v-if="form.platform === 'trae'" class="modal-platform-guide">
          <div class="mpg-header">
            <span style="font-weight: 600; font-size: 13px;">⚡ Trae CN (字节跳动) 绑定指引</span>
            <div style="display: flex; gap: 8px;">
              <a href="https://www.trae.cn/dashboard#account" target="_blank" class="mpg-link">账号设置页 ↗</a>
              <a href="https://www.trae.cn" target="_blank" class="mpg-link">官网 ↗</a>
            </div>
          </div>
          <div class="mpg-content">
            💡 <strong>推荐油猴一键同步：</strong>打开 <a href="https://www.trae.cn/dashboard#account" target="_blank" style="color: #6366f1; font-weight: 600;">trae.cn/dashboard#account</a>，点击右下角「🚀 同步账号到签到面板」，直通官方 GetUserInfo 接口自动识别用户名与手机号！
          </div>
        </div>

        <!-- 表单录入 -->
        <div class="form-group">
          <label class="form-label">账号备注/昵称</label>
          <input
            v-model="form.nickname"
            class="form-input"
            :placeholder="getPlaceholderNickname(form.platform)"
          />
        </div>

        <div class="form-group">
          <label class="form-label">
            {{ form.platform === 'qoder' ? '访问凭据 / PAT (选填)' : 'Access Token' }}
          </label>
          <textarea
            v-model="form.accessToken"
            class="form-textarea"
            placeholder="粘贴 Token 字符串..."
          ></textarea>
        </div>

        <div class="form-group" v-if="form.platform !== 'qoder'">
          <label class="form-label">Refresh Token (可选)</label>
          <textarea
            v-model="form.refreshToken"
            class="form-textarea"
            placeholder="粘贴 Refresh Token (如有)..."
          ></textarea>
        </div>

        <div class="modal-actions">
          <button class="btn btn-outline" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="submitForm" :disabled="submitting">
            {{ submitting ? '保存中...' : (editingId ? '保存修改' : '确认添加账号') }}
          </button>
        </div>
      </div>
    </div>

    
    <!-- ⏰ 每日自动签到设置弹窗 -->
    <div v-if="showSettingsModal" class="modal-overlay" @click.self="showSettingsModal = false">
      <div class="modal">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
          <span style="font-size: 26px;">⏰</span>
          <div>
            <h2 class="modal-title" style="margin-bottom: 0;">每日自动签到设置</h2>
            <div style="color: var(--text-light); font-size: 12px;">自定义每天全自动轮签的执行时间与状态</div>
          </div>
        </div>

        <div class="form-group" style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 16px;">
          <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin-bottom: 0;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">开启每日自动定时签到</div>
              <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">开启后后台调度器每天准时全自动轮签</div>
            </div>
            <input type="checkbox" v-model="settingsForm.autoCheckinEnabled" style="width: 20px; height: 20px; cursor: pointer;" />
          </label>
        </div>

        <div class="form-group" v-if="settingsForm.autoCheckinEnabled">
          <label class="form-label" style="font-weight: 600;">每日触发时间 (北京时间 / Asia/Shanghai)</label>
          <input
            type="time"
            class="form-input"
            v-model="settingsForm.checkinTime"
            style="font-size: 18px; font-weight: 700; padding: 10px; text-align: center;"
          />
          <div style="font-size: 12px; color: var(--text-light); margin-top: 6px; text-align: center;">
            当前执行计划：每天 <strong>{{ settingsForm.checkinTime }}</strong> 自动轮签
          </div>
        </div>

        <!-- 常用时间快捷选择 -->
        <div class="form-group" v-if="settingsForm.autoCheckinEnabled">
          <label class="form-label" style="font-size: 12px; color: var(--text-light);">快捷时间推荐：</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button
              v-for="t in ['08:00', '08:05', '08:30', '09:00', '09:30', '10:00', '12:00']"
              :key="t"
              type="button"
              class="btn btn-outline btn-sm"
              :style="settingsForm.checkinTime === t ? 'background: #e0e7ff; color: #4338ca; border-color: #6366f1; font-weight: 700;' : ''"
              @click="settingsForm.checkinTime = t"
            >
              {{ t }}
            </button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-outline" @click="showSettingsModal = false">取消</button>
          <button class="btn btn-primary" @click="saveSettings" :disabled="savingSettings">
            {{ savingSettings ? '保存中...' : '💾 保存并立即生效' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast 提示 -->
    <div v-if="toast.show" :class="['toast', 'toast-' + toast.type]">{{ toast.message }}</div>
  </div>
</template>

<script>
import api from '../api'

export default {
  data() {
    return {
      accounts: [],
      platforms: {},
      currentFilter: 'all',

      showModal: false,
      showTampermonkeyModal: false,
      syncModalTab: 'f12',
      showPlatformLinks: true,
      editingId: null,
      submitting: false,

      qrLoading: false,
      qrCodeUrl: '',
      authTargetUrl: '',
      qrState: '',
      pollTimer: null,
      pollStatusText: '等待微信扫码确认...',

      form: {
        platform: 'workbuddy',
        nickname: '',
        accessToken: '',
        refreshToken: '',
        extraData: {},
      },
      toast: { show: false, type: 'info', message: '' },

      // ⏰ 定时签到设置弹窗响应式状态
      refreshingAll: false,
      showSettingsModal: false,
      savingSettings: false,
      settingsForm: {
        checkinTime: '08:30',
        autoCheckinEnabled: true,
        cronSchedule: '30 8 * * *',
      },

      // 视图模式：桌面端默认表格 table，可切卡片 cards
      
    }
  },
  computed: {
    filteredAccounts() {
      if (this.currentFilter === 'all') return this.accounts
      return this.accounts.filter(a => a.platform === this.currentFilter)
    },
    tampermonkeyScriptUrl() {
      return '/api/oauth/tampermonkey.user.js'
    },
    f12ConsoleCode() {
      const serverUrl = window.location.origin;
      return `(async () => {
  try {
    let token = (document.cookie.match(/eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}/) || [])[0];
    if (!token) {
      for (const s of [localStorage, sessionStorage]) {
        for (let i = 0; i < s.length; i++) {
          const v = s.getItem(s.key(i)) || '';
          const m = v.match(/eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}/) || v.match(/pt-[a-zA-Z0-9_-]{20,}/);
          if (m) { token = m[0]; break; }
        }
        if (token) break;
      }
    }
    if (!token) {
      return alert('❌ 未在当前 Trae 页面检测到已登录凭据！请确保在 trae.cn 登录后按 F12 执行。');
    }
    window.open('${serverUrl}/api/oauth/import-web?platform=trae&syncKey=ai-credits-hub-sync&accessToken=' + encodeURIComponent(token), '_blank');
  } catch (e) {
    alert('同步失败: ' + e.message);
  }
})();`;
    }
  },
  mounted() {
    this.fetchPlatforms()
    this.fetchAccounts()
    if (this.$route.query.settings) {
      this.openSettingsModal()
    }
  },
  beforeUnmount() {
    this.stopPolling()
  },
  methods: {
    copyCode(text) {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('success', '已复制 F12 控制台代码！请在 Edge 打开的 Trae 网页按 F12 粘贴回车，将全自动弹窗完成同步！');
      }).catch(() => {
        prompt('请按 Ctrl+C 复制以下代码：', text);
      });
    },
    async copyTampermonkeyScript() {
      try {
        const res = await fetch('/api/oauth/tampermonkey.user.js');
        const scriptText = await res.text();
        await navigator.clipboard.writeText(scriptText);
        this.showToast('success', '已复制完整油猴脚本源码！请在油猴插件中点击【添加新脚本】直接粘贴保存 (Ctrl+S) 即可。');
      } catch (err) {
        window.open('/api/oauth/tampermonkey.user.js', '_blank');
        this.showToast('info', '已在新标签页打开脚本，可直接全选复制。');
      }
    },
    async fetchPlatforms() {
      try {
        const res = await api.get('/platforms')
        this.platforms = res.data
      } catch (err) {
        console.error(err)
      }
    },
    
    async openSettingsModal() {
      this.showSettingsModal = true;
      try {
        const res = await api.get('/settings');
        if (res.data) {
          this.settingsForm.checkinTime = res.data.checkinTime || '08:05';
          this.settingsForm.autoCheckinEnabled = res.data.autoCheckinEnabled !== false;
          this.settingsForm.cronSchedule = res.data.cronSchedule || '5 8 * * *';
        }
      } catch (e) {
        console.error('加载定时设置失败:', e);
      }
    },
    async saveSettings() {
      this.savingSettings = true;
      try {
        const res = await api.post('/settings', this.settingsForm);
        this.showToast('success', res.message || '定时签到设置保存成功并已立即生效！');
        this.showSettingsModal = false;
      } catch (e) {
        this.showToast('error', '保存失败: ' + (e.response?.data?.message || e.message));
      } finally {
        this.savingSettings = false;
      }
    },
    async refreshAccount(account) {
      account._refreshing = true
      try {
        const res = await api.post(`/accounts/${account.id}/refresh`)
        if (res.data) {
          Object.assign(account, res.data)
          this.showToast('success', `「${account.nickname}」积分已同步：${account.credits_balance || 0} 积分`)
        }
      } catch (e) {
        this.showToast('error', '刷新积分失败: ' + (e.response?.data?.message || e.message))
      } finally {
        account._refreshing = false
      }
    },
    async refreshAllAccounts() {
      this.refreshingAll = true
      try {
        await api.post('/accounts/refresh-all')
        await this.fetchAccounts()
        this.showToast('success', '所有账号最新积分与签到状态已同步完成！')
      } catch (e) {
        this.showToast('error', '批量刷新失败: ' + (e.response?.data?.message || e.message))
      } finally {
        this.refreshingAll = false
      }
    },
    async fetchAccounts() {
      try {
        const res = await api.get('/accounts')
        this.accounts = (res.data || []).map(a => ({ ...a, _loading: false, _refreshing: false, _result: null }))
      } catch (err) {
        console.error(err)
      }
    },
    getPlatformCount(platform) {
      return this.accounts.filter(a => a.platform === platform).length
    },
    getPlatformName(platform) {
      const map = { workbuddy: 'WorkBuddy', qoder: 'QoderCN', trae: 'Trae CN' }
      return map[platform] || platform
    },
    getPlaceholderNickname(platform) {
      const count = this.getPlatformCount(platform) + 1
      const map = {
        workbuddy: `如: WorkBuddy 账号 ${count}`,
        qoder: `如: Qoder 主账号 / 小号 ${count}`,
        trae: `如: Trae 个人号 ${count}`,
      }
      return map[platform] || '如: 账号备注'
    },
    openAddModal(platform = 'workbuddy') {
      this.editingId = null
      this.form = {
        platform: platform || 'workbuddy',
        nickname: '',
        accessToken: '',
        refreshToken: '',
        extraData: {},
      }
      this.qrCodeUrl = ''
      this.stopPolling()
      this.showModal = true
    },
    switchPlatform(p) {
      this.form.platform = p
      this.qrCodeUrl = ''
      this.stopPolling()
    },
    async startQrLogin() {
      this.qrLoading = true
      this.qrCodeUrl = ''
      this.authTargetUrl = ''
      this.stopPolling()

      try {
        const res = await api.get('/oauth/workbuddy/init')
        if (res.data && res.data.authUrl) {
          this.authTargetUrl = res.data.authUrl
          this.qrState = res.data.state
          this.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(res.data.authUrl)}`
          this.pollStatusText = '等待微信扫码确认...'
          this.startPolling()
        }
      } catch (err) {
        this.showToast('error', err.message || '获取登录二维码失败')
      } finally {
        this.qrLoading = false
      }
    },
    startPolling() {
      this.stopPolling()
      this.pollTimer = setInterval(async () => {
        if (!this.qrState) return
        try {
          const res = await api.get('/oauth/workbuddy/poll', {
            params: { state: this.qrState, nickname: this.form.nickname },
          })
          if (res.data && res.data.completed) {
            this.stopPolling()
            this.showToast('success', `🎉 ${res.data.nickname} 绑定成功！`)
            setTimeout(() => {
              this.closeModal()
              this.fetchAccounts()
            }, 800)
          }
        } catch (err) {
          console.error('轮询出错:', err)
        }
      }, 2500)
    },
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },
    closeModal() {
      this.stopPolling()
      this.showModal = false
      this.editingId = null
    },
    async checkinAccount(account) {
      account._loading = true
      account._result = null
      try {
        const res = await api.post(`/accounts/${account.id}/checkin`)
        account._result = res.data
        this.showToast(res.data.success ? 'success' : 'error', res.data.message)
        this.fetchAccounts()
      } catch (err) {
        account._result = { success: false, message: err.message || '签到失败' }
        this.showToast('error', err.message || '签到失败')
      } finally {
        account._loading = false
      }
    },
    editAccount(account) {
      this.editingId = account.id
      this.form = {
        platform: account.platform,
        nickname: account.nickname || '',
        accessToken: '',
        refreshToken: '',
        extraData: {},
      }
      this.showModal = true
    },
    async toggleStatus(account) {
      const newStatus = account.status === 'active' ? 'disabled' : 'active'
      try {
        await api.put(`/accounts/${account.id}`, { status: newStatus })
        this.showToast('success', `账号已${newStatus === 'active' ? '启用' : '暂停'}`)
        this.fetchAccounts()
      } catch (err) {
        this.showToast('error', err.message)
      }
    },
    async renameAccount(account) {
      const current = account.nickname || ''
      const newName = prompt(`请输入账号「${current}」的新备注名称:`, current)
      if (newName !== null && newName.trim() && newName.trim() !== current) {
        try {
          await api.put(`/accounts/${account.id}`, { nickname: newName.trim() })
          this.showToast('success', '账号备注修改成功！')
          this.fetchAccounts()
        } catch (err) {
          this.showToast('error', err.message || '修改失败')
        }
      }
    },
    async deleteAccount(account) {
      if (!confirm(`确定要删除账号 "${account.nickname || account.id}" 吗？此操作不可撤销。`)) return
      try {
        await api.delete(`/accounts/${account.id}`)
        this.showToast('success', '账号已删除')
        this.fetchAccounts()
      } catch (err) {
        this.showToast('error', err.message)
      }
    },
    async submitForm() {
      if (!this.editingId && !this.form.accessToken && !this.form.refreshToken) {
        this.showToast('error', '请填写 Token 或通过扫码绑定')
        return
      }

      this.submitting = true
      try {
        if (this.editingId) {
          const body = { nickname: this.form.nickname }
          if (this.form.accessToken) body.accessToken = this.form.accessToken
          if (this.form.refreshToken) body.refreshToken = this.form.refreshToken
          await api.put(`/accounts/${this.editingId}`, body)
          this.showToast('success', '账号更新成功')
        } else {
          await api.post('/accounts', this.form)
          this.showToast('success', '账号添加成功！')
        }
        this.closeModal()
        this.fetchAccounts()
      } catch (err) {
        this.showToast('error', err.message || '操作失败')
      } finally {
        this.submitting = false
      }
    },
    getStatusClass(status) {
      return { active: 'tag-success', expired: 'tag-danger', disabled: 'tag-warning' }[status] || 'tag-info'
    },
    getStatusText(status) {
      return { active: '活跃', expired: 'Token过期', disabled: '已暂停' }[status] || status
    },
    formatTime(t) {
      if (!t) return '从未'
      const d = new Date(t)
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    },
    showToast(type, message) {
      this.toast = { show: true, type, message }
      setTimeout(() => { this.toast.show = false }, 3000)
    },
  },
}
</script>

<style scoped>
.page-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-subtitle {
  color: var(--text-light);
  font-size: 13px;
}

.top-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 平台 Tabs */
.tabs-container {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tabs-container::-webkit-scrollbar { display: none; }

.tab-btn {
  padding: 7px 14px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab-btn:hover { border-color: var(--primary); color: var(--primary); }
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  font-weight: 600;
}

.empty-card { text-align: center; padding: 40px 16px; }

/* ==================== 统一自适应账号列表 (Responsive Adaptive Cards) ==================== */
.accounts-adaptive-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.adaptive-account-card {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  transition: all 0.2s ease;
}

.adaptive-account-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.aac-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 240px;
  flex: 1.2;
}

.aac-icon {
  font-size: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.aac-identity {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.aac-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.aac-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
  word-break: break-all;
}

.platform-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-workbuddy { background: #e0f2fe; color: #0284c7; }
.badge-qoder { background: #fef3c7; color: #b45309; }
.badge-trae { background: #ede9fe; color: #7c3aed; }

.aac-result-tag {
  display: inline-block;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  word-break: break-all;
}
.result-success { background: #dcfce7; color: #166534; }
.result-error { background: #fee2e2; color: #991b1b; }

/* 统计数据胶囊 */
.aac-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.aac-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  white-space: nowrap;
}

.aac-stat-label {
  color: var(--text-light);
  font-size: 12px;
}

.aac-stat-val {
  font-weight: 600;
  color: var(--text);
}

.val-credits {
  color: #059669;
  font-weight: 700;
}

.aac-stat-time {
  color: var(--text-light);
  font-size: 12px;
}

.aac-stat-divider {
  color: #cbd5e1;
  font-weight: bold;
}

/* 操作按钮区 */
.aac-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.aac-btn-checkin {
  padding: 7px 14px;
}

.aac-btn-tools {
  display: flex;
  gap: 6px;
}

/* ==================== 弹窗与指引样式 ==================== */
.platform-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.platform-tab-card {
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 10px 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.platform-tab-card.active {
  border-color: var(--primary);
  background: #eff6ff;
}

.p-tab-name { font-weight: 600; font-size: 12px; margin-top: 2px; }
.p-tab-desc { font-size: 10px; color: var(--text-light); }

.login-method-box {
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}

.modal-platform-guide {
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid var(--border);
  padding: 12px 14px;
  margin-bottom: 14px;
}
.mpg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.mpg-link {
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.mpg-link:hover { text-decoration: underline; }
.mpg-content {
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.5;
}

.guide-step-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 8px;
}

.step-num {
  width: 22px;
  height: 22px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.poll-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #ffffff;
  border-radius: 16px;
  font-size: 11px;
  color: var(--text-light);
  border: 1px solid var(--border);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(102, 126, 234, 0); }
  100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0); }
}

/* ==================== 屏幕自适应媒体查询 ==================== */

/* 平板与较小笔记本 (1024px 以下) */
@media (max-width: 1024px) {
  .adaptive-account-card {
    flex-wrap: wrap;
    padding: 16px;
  }
  .aac-main {
    flex: 1 1 100%;
  }
  .aac-stats {
    flex: 1;
  }
  .aac-actions {
    margin-left: auto;
  }
}

/* 手机端适配 (767px 以下) */
@media (max-width: 767px) {
  .page-top-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .top-actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: 100%;
    gap: 6px;
  }

  .top-actions .btn {
    width: 100%;
    padding: 8px 4px;
    font-size: 12px;
    justify-content: center;
  }

  .adaptive-account-card {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 14px;
  }

  .aac-main {
    min-width: 0;
    width: 100%;
  }

  .aac-icon {
    font-size: 26px;
  }

  .aac-name {
    font-size: 14px;
  }

  .aac-stats {
    width: 100%;
    justify-content: space-between;
    padding: 8px 10px;
  }

  .aac-actions {
    width: 100%;
    flex-direction: column;
    gap: 8px;
    margin-left: 0;
  }

  .aac-btn-checkin {
    width: 100%;
    padding: 9px;
  }

  .aac-btn-tools {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .aac-btn-tools .btn {
    width: 100%;
    padding: 7px 2px;
    font-size: 12px;
    justify-content: center;
  }
}

.sync-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.sync-tab-btn.active {
  background: var(--primary);
  color: #ffffff;
}

</style>