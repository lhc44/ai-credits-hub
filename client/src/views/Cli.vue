<template>
  <div class="chat-app-layout">
    <!-- 移动端抽屉遮罩 -->
    <div
      v-if="showMobileSidebar"
      class="mobile-drawer-overlay"
      @click="showMobileSidebar = false"
    ></div>

    <!-- 左侧：分对话管理边栏 (Sessions Sidebar) -->
    <aside :class="['sessions-sidebar', showMobileSidebar ? 'open' : '']">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="createNewSession">
          <span class="plus-icon">➕</span>
          <span>新建对话</span>
        </button>
      </div>

      <div class="sessions-list">
        <div v-if="sessions.length === 0" class="empty-sessions">
          暂无历史对话
        </div>
        <div
          v-for="s in sessions"
          :key="s.id"
          :class="['session-item', currentSessionId === s.id ? 'active' : '']"
          @click="switchSession(s.id)"
        >
          <span class="session-icon">💬</span>
          <div class="session-info">
            <div class="session-title">{{ s.title || '新对话' }}</div>
            <div class="session-meta">
              <span>{{ s.messages.length }} 条消息</span>
              <span>· {{ s.model.replace('-preview', '') }}</span>
            </div>
          </div>
          <button
            class="del-session-btn"
            @click.stop="deleteSession(s.id)"
            title="删除对话"
          >
            🗑️
          </button>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="storage-info">
          <span>共 {{ sessions.length }} 个独立对话</span>
          <button class="clear-all-link" @click="clearAllSessions">全部清空</button>
        </div>
      </div>
    </aside>

    <!-- 右侧：当前对话主视窗 (Chat Main View) -->
    <main class="chat-main-view">
      <!-- 顶部控制栏 -->
      <header class="chat-top-header">
        <div class="top-header-left">
          <!-- 移动端侧边栏切换按钮 -->
          <button class="mobile-menu-btn" @click="showMobileSidebar = !showMobileSidebar">
            ☰ 对话 ({{ sessions.length }})
          </button>
          <div class="chat-header-title">
            <span class="active-title">{{ currentSession?.title || '新对话' }}</span>
            <span class="active-badge">{{ currentModel?.badge || '在线' }}</span>
          </div>
        </div>

        <div class="top-header-controls">
          <!-- 模型下拉菜单 -->
          <div class="selector-wrap">
            <label class="selector-label">模型:</label>
            <select v-model="selectedModel" class="compact-select model-select" :disabled="sending">
              <optgroup v-for="(group, gName) in groupedModels" :key="gName" :label="gName">
                <option v-for="m in group" :key="m.id" :value="m.id">
                  {{ m.name }} [{{ m.badge }}]
                </option>
              </optgroup>
            </select>
          </div>

          <!-- 账号下拉菜单 -->
          <div class="selector-wrap">
            <label class="selector-label">账号:</label>
            <select v-model="selectedAccountId" class="compact-select account-select" :disabled="sending">
              <option v-for="acc in cliInfo.accounts" :key="acc.id" :value="acc.id">
                {{ acc.nickname }} (余: {{ acc.credits ?? 0 }})
              </option>
              <option v-if="!cliInfo.accounts?.length" :value="null" disabled>
                暂无可用 WorkBuddy 账号
              </option>
            </select>
          </div>

          <div class="header-action-btns">
            <!-- 本地/网络工具执行开关 -->
            <button
              class="state-btn"
              :class="{ active: enableTools }"
              @click="enableTools = !enableTools"
              :title="enableTools ? '已开启终端命令、本地执行与网页爬取能力' : '纯文本问答模式'"
            >
              {{ enableTools ? '🛠️ 工具: 开' : '💬 纯对话' }}
            </button>

            <!-- 记忆状态切换 -->
            <button
              class="state-btn"
              :class="{ active: enableContext }"
              @click="enableContext = !enableContext"
              :title="enableContext ? '连续上下文记忆已开启' : '单轮问答模式'"
            >
              {{ enableContext ? '🧠 记忆开' : '⚡ 单轮' }}
            </button>

            <!-- 本地脚本运行指导 -->
            <button class="state-btn" @click="showLocalModal = true" title="本地终端运行指南">
              💻 本地CLI
            </button>
          </div>
        </div>
      </header>

      <!-- 消息气泡列表区 -->
      <div class="messages-flow" ref="messagesContainer">
        <!-- 会话为空时的欢迎展示 -->
        <div v-if="!currentMessages.length" class="empty-chat-hero">
          <div class="hero-logo">🤖</div>
          <h2 class="hero-title">AI 在线全模型对话终端</h2>
          <p class="hero-subtitle">
            当前已接入 <b>混元 4 (hy4-preview)</b> 与 DeepSeek、GLM、Kimi 全系大模型，支持<b>深度思考推理链可视化</b>与<b>多轮对话上下文记忆</b>！
          </p>

          <div class="hero-quick-cards">
            <div
              v-for="(qp, idx) in quickPrompts"
              :key="idx"
              class="quick-card"
              @click="sendQuickPrompt(qp.text)"
            >
              <div class="qc-badge">{{ qp.label }}</div>
              <div class="qc-text">{{ qp.text }}</div>
            </div>
          </div>
        </div>

        <!-- 消息流 -->
        <div v-else class="messages-stream">
          <!-- 历史更早消息折叠/分页加载栏 -->
          <div v-if="hiddenHistoryCount > 0" class="history-pagination-bar">
            <button class="btn-load-history" @click="loadMoreHistory">
              📜 查看更早的 {{ hiddenHistoryCount }} 条历史记录
            </button>
            <button class="btn-load-history-all" @click="displayCount = currentMessages.length">
              全部展开
            </button>
          </div>

          <div
            v-for="(msg, index) in visibleMessages"
            :key="index"
            :class="['msg-item', msg.role === 'user' ? 'msg-user' : 'msg-ai']"
          >
            <!-- AI 头像 -->
            <div v-if="msg.role === 'assistant'" class="msg-avatar ai-avatar">🤖</div>

            <div class="msg-bubble-box">
              <!-- AI 头部元信息栏 -->
              <div v-if="msg.role === 'assistant'" class="ai-meta-bar">
                <span class="meta-pill model-pill">{{ msg.model || selectedModel }}</span>
                <span v-if="msg.duration_ms" class="meta-pill time-pill">⏱️ {{ (msg.duration_ms / 1000).toFixed(1) }}s</span>
                <button class="meta-action-btn" @click="copyText(msg.content)">📋 复制结果</button>
              </div>

              <!-- 实时执行状态指示胶囊 (流式阶段动态显示，消除卡顿与中断感) -->
              <div v-if="msg.streaming" class="live-status-pill">
                <span class="pulsing-radar"></span>
                <span class="status-pill-text">{{ getLiveStatusText(msg) }}</span>
              </div>

              <!-- 💭 深度思考 / 推理过程折叠卡片 (CoT Chain of Thought) -->
              <div v-if="msg.thinking || (msg.streaming && !msg.content)" class="thinking-accordion">
                <div class="thinking-header" @click="msg.showThinking = !msg.showThinking">
                  <span class="thinking-icon">💭</span>
                  <span class="thinking-title">深度推理与思考过程</span>
                  <span v-if="msg.streaming && !msg.content" class="thinking-live-badge">⚡ 思考中...</span>
                  <span class="thinking-toggle-arrow">{{ msg.showThinking ? '▼ 收起' : '▶ 展开思考' }}</span>
                </div>
                <div v-show="msg.showThinking" class="thinking-body">
                  <pre class="thinking-pre"><code>{{ msg.thinking || '正在组织思考逻辑与分析指令...' }}</code></pre>
                </div>
              </div>

              <!-- 🛠️ 本地与网络工具执行折叠卡片 (Tool Executions) -->
              <div v-if="msg.toolCalls && msg.toolCalls.length" class="tools-accordion">
                <div class="tools-header" @click="msg.showTools = !msg.showTools">
                  <span class="tools-icon">🛠️</span>
                  <span class="tools-title">已执行 {{ msg.toolCalls.length }} 项服务器工具 ({{ msg.toolCalls.map(t => t.name).join(', ') }})</span>
                  <span class="tools-toggle-arrow">{{ msg.showTools ? '▼ 收起' : '▶ 查看工具调用' }}</span>
                </div>
                <div v-show="msg.showTools" class="tools-body">
                  <div v-for="(tc, tcIdx) in msg.toolCalls" :key="tcIdx" class="tool-call-item">
                    <div class="tool-call-name">⚡ 工具: <strong>{{ tc.name }}</strong></div>
                    <pre class="tool-call-input"><code>{{ typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input, null, 2) }}</code></pre>
                  </div>
                </div>
              </div>

              <!-- 回答正文 (Markdown 渲染 + 打字机光标) -->
              <div v-if="msg.content || !msg.streaming" class="msg-bubble">
                <div class="msg-markdown markdown-body" v-html="renderMarkdown(msg.content)"></div>
                <span v-if="msg.streaming && msg.content" class="streaming-cursor">▍</span>
              </div>

              <!-- 用户消息时间 -->
              <div v-if="msg.role === 'user'" class="user-time-label">
                {{ msg.time }}
              </div>
            </div>

            <!-- 用户头像 -->
            <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">👤</div>
          </div>

          <!-- 正在生成中骨架卡片 -->
          <div v-if="sending && !currentMessages.some(m => m.streaming)" class="msg-item msg-ai thinking-progress">
            <div class="msg-avatar ai-avatar pulsing">🤖</div>
            <div class="msg-bubble-box">
              <div class="thinking-active-box">
                <div class="dots-pulse"><span></span><span></span><span></span></div>
                <span class="thinking-active-txt">
                  <b>{{ currentModel?.name || selectedModel }}</b> 正在深度推理思考并生成回答...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入框区 (自适应电脑与手机) -->
      <footer class="chat-input-dock">
        <!-- 快捷 Prompts 横向手势滚动栏 -->
        <div class="dock-chips-bar">
          <button
            v-for="(qp, idx) in quickPrompts"
            :key="idx"
            class="dock-chip"
            @click="fillInput(qp.text)"
            :disabled="sending"
          >
            {{ qp.label }}
          </button>
        </div>

        <div class="dock-input-form">
          <textarea
            ref="inputRef"
            v-model="inputContent"
            class="dock-textarea"
            rows="1"
            placeholder="输入对话内容或指令... (Enter 发送，Shift+Enter 换行)"
            :disabled="sending"
            @keydown="handleKeydown"
            @input="autoGrow"
          ></textarea>

          <button
            class="dock-send-btn"
            @click="submitCurrentMessage"
            :disabled="sending || !inputContent.trim()"
          >
            <span v-if="!sending">➤</span>
            <span v-else class="dock-spinner"></span>
          </button>
        </div>

        <div class="dock-tip">
          <span>支持多轮连续上下文记忆 · 自动调度 WorkBuddy 凭据直通混元4</span>
        </div>
      </footer>
    </main>

    <!-- 本地 CLI 命令弹窗 -->
    <div v-if="showLocalModal" class="modal-overlay" @click="showLocalModal = false">
      <div class="modal-window" @click.stop>
        <div class="modal-header">
          <h3>💻 本地终端直连混元 4</h3>
          <button class="modal-close" @click="showLocalModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-hint">
            复制下方命令在您本地电脑的终端中运行，无需扫码直接调用混元 4：
          </p>
          <div class="tabs-row">
            <button :class="['tab-btn', localTab === 'ps' ? 'active' : '']" @click="localTab = 'ps'">
              Windows PowerShell
            </button>
            <button :class="['tab-btn', localTab === 'cmd' ? 'active' : '']" @click="localTab = 'cmd'">
              Windows CMD
            </button>
            <button :class="['tab-btn', localTab === 'bash' ? 'active' : '']" @click="localTab = 'bash'">
              macOS / Linux
            </button>
          </div>
          <div class="code-box">
            <pre><code>{{ localCommand }}</code></pre>
            <button class="btn-copy-code" @click="copyText(localCommand)">📋 复制整段命令</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import api from '../api'

marked.setOptions({
  breaks: true,
  gfm: true
})

// Markdown 渲染缓存映射：防止长文本在 Vue 每次微小状态变动时重复繁重计算导致卡顿
const markdownCache = new Map()

function renderMarkdown(content) {
  if (!content) return ''
  if (markdownCache.has(content)) {
    return markdownCache.get(content)
  }
  try {
    const html = marked.parse(content)
    if (markdownCache.size > 200) {
      const first = markdownCache.keys().next().value
      markdownCache.delete(first)
    }
    markdownCache.set(content, html)
    return html
  } catch (e) {
    return content
  }
}

// 存储 key
const SESSIONS_STORAGE_KEY = 'ai_credits_hub_sessions_v2'

// 状态定义
const cliInfo = ref({
  cliAvailable: false,
  cliVersion: '2.179.3',
  models: [],
  accounts: []
})

const selectedAccountId = ref(null)
const selectedModel = ref('hy4-preview')
const inputContent = ref('')
const sending = ref(false)
const enableContext = ref(true)
const enableTools = ref(true)
const showLocalModal = ref(false)
const showMobileSidebar = ref(false)
const localTab = ref('ps')

const messagesContainer = ref(null)
const inputRef = ref(null)

// 快捷示例
const quickPrompts = [
  { label: '🌐 爬虫网页抓取', text: '请使用本地 WebFetch 或 curl 抓取 https://httpbin.org/user-agent 并提取分析返回的字段数据。' },
  { label: '💻 终端系统诊断', text: '请执行终端命令查看当前服务器系统的操作系统版本、内存占用及当前运行时间。' },
  { label: '🌟 混元4特性优势', text: '请用中文详细介绍腾讯混元 4 (hy4-preview) 大模型的核心优势、MoE 架构与主要特性。' },
  { label: '⚡ 经典比大小问题', text: '9.11 和 9.8 哪个数值大？请给出详细深入的思考推理过程。' },
  { label: '🚀 原地快速排序', text: '请用 JavaScript 和 Python 分别实现原地快速排序算法，并附带时间复杂度分析与测试用例。' },
  { label: '💡 Node.js 并发队列', text: '在 Node.js 中如何设计一个限制最大并发数为 5 的异步任务执行队列？请给出完整优雅的代码实现。' },
  { label: '🔍 深入解释 MoE', text: '请用通俗生动的比喻解释大模型领域的 MoE（Mixture of Experts）混合专家架构原理。' }
]

// 会话数据结构: { id, title, model, cliSessionId, messages: [{ role, content, thinking, showThinking, time, duration_ms, model }] }
const sessions = ref([])
const currentSessionId = ref('')

// 初始化加载会话
function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        sessions.value = parsed
        currentSessionId.value = parsed[0].id
        selectedModel.value = parsed[0].model || 'hy4-preview'
        return
      }
    }
  } catch (e) {}

  // 默认新建一个初始会话
  createNewSession()
}

// 保存会话到本地 (对超长历史思考做安全裁剪，避免超出浏览器 localStorage 5MB 限制)
function saveSessionsToStorage() {
  try {
    const sanitized = sessions.value.map(s => ({
      ...s,
      messages: (s.messages || []).slice(-50).map(m => ({
        role: m.role,
        content: m.content,
        thinking: m.thinking && m.thinking.length > 4000 ? m.thinking.slice(0, 4000) + '\n... [历史思考记录已截断存储]' : m.thinking,
        toolCalls: m.toolCalls ? m.toolCalls.slice(0, 10) : [],
        model: m.model,
        duration_ms: m.duration_ms,
        time: m.time
      }))
    }))
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sanitized))
  } catch (err) {
    console.warn('存储会话失败(可能超出浏览器存储限额):', err)
  }
}

// 当前激活的会话对象
const currentSession = computed(() => {
  return sessions.value.find(s => s.id === currentSessionId.value) || sessions.value[0]
})

// 当前激活会话的消息列表
const currentMessages = computed(() => {
  return currentSession.value?.messages || []
})

// 分页加载控制：默认只渲染最近的 PAGE_SIZE 条消息，极大减轻超长文本与 DOM 渲染压力
const PAGE_SIZE = 8
const displayCount = ref(PAGE_SIZE)

// 实际渲染的消息列表（只展示最近 displayCount 条）
const visibleMessages = computed(() => {
  const all = currentMessages.value
  if (all.length <= displayCount.value) return all
  return all.slice(-displayCount.value)
})

// 历史更早消息条数
const hiddenHistoryCount = computed(() => {
  const total = currentMessages.value.length
  return Math.max(0, total - displayCount.value)
})

function loadMoreHistory() {
  displayCount.value += PAGE_SIZE
}

function getLiveStatusText(msg) {
  if (msg.liveStatus) return msg.liveStatus
  if (msg.toolCalls && msg.toolCalls.length && !msg.toolFinished) {
    const lastTool = msg.toolCalls[msg.toolCalls.length - 1]
    return `⚡ 正在服务器执行工具: ${lastTool.name}，请稍候...`
  }
  if (msg.thinking && !msg.content) {
    return `💭 模型正在深度推理与构建分析 (${msg.thinking.length} 字)...`
  }
  if (msg.content) {
    return `✍️ 正在组织输出报告...`
  }
  return `⚡ 正在调度云端大模型并准备执行...`
}

// 新建对话
function createNewSession() {
  displayCount.value = PAGE_SIZE
  const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  const newSession = {
    id: newId,
    title: '新对话',
    model: selectedModel.value || 'hy4-preview',
    cliSessionId: null, // 对应后端的 CodeBuddy 会话 ID
    messages: []
  }
  sessions.value.unshift(newSession)
  currentSessionId.value = newId
  saveSessionsToStorage()
  showMobileSidebar.value = false
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// 切换对话
function switchSession(id) {
  currentSessionId.value = id
  displayCount.value = PAGE_SIZE
  const target = sessions.value.find(s => s.id === id)
  if (target?.model) {
    selectedModel.value = target.model
  }
  showMobileSidebar.value = false
  scrollToBottom()
}

// 删除对话
function deleteSession(id) {
  if (confirm('确定要删除这个对话吗？')) {
    sessions.value = sessions.value.filter(s => s.id !== id)
    if (sessions.value.length === 0) {
      createNewSession()
    } else if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0].id
    }
    saveSessionsToStorage()
  }
}

// 清空所有对话
function clearAllSessions() {
  if (confirm('确定要清空所有历史对话吗？此操作不可撤销。')) {
    sessions.value = []
    createNewSession()
  }
}

// 模型分组
const groupedModels = computed(() => {
  const groups = {}
  for (const m of cliInfo.value.models || []) {
    const cat = m.category || '其他模型'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(m)
  }
  return groups
})

const currentModel = computed(() => {
  return (cliInfo.value.models || []).find(m => m.id === selectedModel.value)
})

const currentAccount = computed(() => {
  if (!cliInfo.value.accounts?.length) return null
  return cliInfo.value.accounts.find(a => a.id === selectedAccountId.value) || cliInfo.value.accounts[0]
})

// 本地运行命令
const localCommand = computed(() => {
  const token = currentAccount.value?.rawToken || '<YOUR_TOKEN>'
  const model = selectedModel.value || 'hy4-preview'

  if (localTab.value === 'ps') {
    return `# 1. 全局安装 CLI (若未装)\nnpm install -g @tencent-ai/codebuddy-code\n\n# 2. 注入凭据环境变量\n$env:CODEBUDDY_AUTH_TOKEN="${token}"\n\n# 3. 启动本地全功能交互式 Agent (在本地电脑执行命令/自动化/写代码)\ncodebuddy --model ${model}\n\n# (可选) 若想在本地浏览器中图形化控制本机，可运行：\n# codebuddy --serve`
  } else if (localTab.value === 'cmd') {
    return `:: 1. 全局安装 CLI\nnpm install -g @tencent-ai/codebuddy-code\n\n:: 2. 注入凭据环境变量\nset CODEBUDDY_AUTH_TOKEN=${token}\n\n:: 3. 启动本地全功能交互式 Agent\ncodebuddy --model ${model}`
  } else {
    return `# 1. 全局安装 CLI\nnpm install -g @tencent-ai/codebuddy-code\n\n# 2. 注入凭据环境变量\nexport CODEBUDDY_AUTH_TOKEN="${token}"\n\n# 3. 启动本地全功能交互式 Agent\ncodebuddy --model ${model}`
  }
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 130) + 'px'
}

function fillInput(text) {
  inputContent.value = text
  nextTick(() => {
    autoGrow()
    inputRef.value?.focus()
  })
}

function sendQuickPrompt(text) {
  fillInput(text)
  submitCurrentMessage()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitCurrentMessage()
  }
}

// 发送消息
async function submitCurrentMessage() {
  const text = inputContent.value.trim()
  if (!text || sending.value) return

  const curSes = currentSession.value
  if (!curSes) return

  // 如果会话还是默认标题，自动采用第一句话作为标题
  if (curSes.title === '新对话' || !curSes.title) {
    curSes.title = text.slice(0, 16) + (text.length > 16 ? '...' : '')
  }
  curSes.model = selectedModel.value

  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // 追加用户消息
  curSes.messages.push({
    role: 'user',
    content: text,
    time: timeStr
  })

  inputContent.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'
  scrollToBottom()
  saveSessionsToStorage()

  sending.value = true

  // 确保新发送的消息在当前分页可见
  displayCount.value = Math.max(displayCount.value, PAGE_SIZE)

  // 创建助手消息占位（开启流式状态）
  const aiMsg = {
    role: 'assistant',
    content: '',
    thinking: '',
    showThinking: true, // 默认展开深度思考过程
    toolCalls: [],
    showTools: true,
    model: selectedModel.value,
    duration_ms: 0,
    time: timeStr,
    streaming: true,
    liveStatus: '⚡ 正在连接云端大模型并初始化环境...',
    toolFinished: true
  }
  curSes.messages.push(aiMsg)
  scrollToBottom()

  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/cli/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        accountId: selectedAccountId.value,
        model: selectedModel.value,
        prompt: text,
        sessionId: enableContext.value ? curSes.cliSessionId : null,
        continueSession: enableContext.value,
        enableTools: enableTools.value,
        stream: true
      })
    })

    if (!response.ok) {
      let errText = ''
      try {
        const errJson = await response.json()
        errText = errJson.message || response.statusText
      } catch (e) {
        errText = await response.text()
      }
      aiMsg.content = `❌ 请求异常 (${response.status}): ${errText}`
      aiMsg.streaming = false
      saveSessionsToStorage()
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let sseBuffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      sseBuffer += chunk

      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() // 未换行部分留在 buffer

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr) continue
        try {
          const data = JSON.parse(jsonStr)
          if (data.type === 'session' && data.sessionId) {
            curSes.cliSessionId = data.sessionId
          } else if (data.type === 'thinking_delta' && data.delta) {
            aiMsg.thinking = (aiMsg.thinking || '') + data.delta
            scrollToBottom()
          } else if (data.type === 'text_delta' && data.delta) {
            aiMsg.content = (aiMsg.content || '') + data.delta
            scrollToBottom()
          } else if (data.type === 'status' && data.status) {
            aiMsg.liveStatus = data.status
            if (data.status.includes('完成')) {
              aiMsg.toolFinished = true
            }
            scrollToBottom()
          } else if (data.type === 'tool_use' && data.tool) {
            aiMsg.toolCalls.push(data.tool)
            aiMsg.toolFinished = false
            aiMsg.liveStatus = `⚡ 正在服务器执行工具: ${data.tool.name}...`
            scrollToBottom()
          } else if (data.type === 'done') {
            if (data.sessionId) curSes.cliSessionId = data.sessionId
            if (data.duration_ms) aiMsg.duration_ms = data.duration_ms
            if (!aiMsg.content && data.reply) aiMsg.content = data.reply
            if (!aiMsg.thinking && data.thinking) aiMsg.thinking = data.thinking
            aiMsg.streaming = false
            aiMsg.liveStatus = ''
            if (aiMsg.content) renderMarkdown(aiMsg.content)
          } else if (data.type === 'error') {
            aiMsg.content = (aiMsg.content ? aiMsg.content + '\n\n' : '') + `❌ 错误: ${data.message}`
            aiMsg.streaming = false
          }
        } catch (e) {
          console.warn('SSE parse error:', e, jsonStr)
        }
      }
    }
  } catch (err) {
    aiMsg.content = (aiMsg.content ? aiMsg.content + '\n\n' : '') + `❌ 网络异常或中断: ${err.message || '未知错误'}`
  } finally {
    aiMsg.streaming = false
    sending.value = false
    scrollToBottom()
    saveSessionsToStorage()
  }
}

function copyText(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    alert('已成功复制到剪贴板！')
  }).catch(() => {
    alert('复制失败，请手动选择复制')
  })
}

async function fetchCliInfo() {
  try {
    const res = await api.get('/cli/info')
    if (res.code === 0) {
      cliInfo.value = res.data
      if (res.data.accounts?.length && !selectedAccountId.value) {
        selectedAccountId.value = res.data.accounts[0].id
      }
    }
  } catch (err) {
    console.error('获取 CLI 信息失败:', err)
  }
}

onMounted(() => {
  loadSessionsFromStorage()
  fetchCliInfo()
  scrollToBottom()
})
</script>

<style scoped>
/* 整个应用双栏 / 抽屉布局 */
.chat-app-layout {
  display: flex;
  height: calc(100vh - 40px);
  max-width: 1440px;
  margin: 0 auto;
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4);
  position: relative;
}

@media (max-width: 768px) {
  .chat-app-layout {
    height: calc(100dvh - 120px);
    border-radius: 0;
    border: none;
  }
}

/* 抽屉遮罩 */
.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99;
}

/* 左侧：分对话管理边栏 */
.sessions-sidebar {
  width: 260px;
  background: #111827;
  border-right: 1px solid #1f2937;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: transform 0.3s ease;
  z-index: 100;
}

@media (max-width: 768px) {
  .sessions-sidebar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    transform: translateX(-100%);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
  }
  .sessions-sidebar.open {
    transform: translateX(0);
  }
}

.sidebar-header {
  padding: 14px;
  border-bottom: 1px solid #1f2937;
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  border: none;
  padding: 10px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-sessions {
  text-align: center;
  color: #6b7280;
  font-size: 12px;
  padding: 30px 10px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #9ca3af;
  transition: all 0.2s;
}

.session-item:hover {
  background: #1f2937;
  color: #f3f4f6;
}

.session-item.active {
  background: #1e293b;
  color: #60a5fa;
  border-left: 3px solid #3b82f6;
}

.session-icon { font-size: 14px; }

.session-info {
  flex: 1;
  overflow: hidden;
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}

.del-session-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
  border-radius: 4px;
  opacity: 0.6;
}

.del-session-btn:hover {
  opacity: 1;
  color: #ef4444;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #1f2937;
  font-size: 11.5px;
  color: #6b7280;
}

.storage-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.clear-all-link {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 11.5px;
}

/* 右侧主视窗 */
.chat-main-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #090d16;
  overflow: hidden;
}

/* 顶部控制栏 */
.chat-top-header {
  background: #111827;
  border-bottom: 1px solid #1f2937;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.top-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-menu-btn {
  display: none;
  background: #1f2937;
  border: 1px solid #374151;
  color: #f3f4f6;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: block;
  }
}

.chat-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.active-title {
  font-size: 15px;
  font-weight: 700;
  color: #f9fafb;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-badge {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
}

.top-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.selector-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.selector-label {
  font-size: 11.5px;
  color: #9ca3af;
}

.compact-select {
  background: #1f2937;
  border: 1px solid #374151;
  color: #f3f4f6;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  max-width: 170px;
}

.model-select {
  max-width: 200px;
  font-weight: 600;
  color: #38bdf8;
}

@media (max-width: 640px) {
  .compact-select {
    max-width: 125px;
  }
}

.header-action-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}

.state-btn {
  background: #1f2937;
  border: 1px solid #374151;
  color: #d1d5db;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.2s;
}

.state-btn:hover { background: #374151; }
.state-btn.active {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.4);
}

/* 消息流动区 */
.messages-flow {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  scroll-behavior: smooth;
}

/* 欢迎页 */
.empty-chat-hero {
  max-width: 680px;
  margin: 30px auto;
  text-align: center;
  padding: 0 10px;
}

.hero-logo { font-size: 42px; margin-bottom: 8px; }
.hero-title { font-size: 20px; font-weight: 700; color: #f9fafb; margin-bottom: 6px; }
.hero-subtitle { font-size: 13px; color: #9ca3af; line-height: 1.6; margin-bottom: 24px; }

.hero-quick-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  text-align: left;
}

@media (max-width: 600px) {
  .hero-quick-cards { grid-template-columns: 1fr; }
}

.quick-card {
  background: #111827;
  border: 1px solid #1f2937;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-card:hover {
  border-color: #3b82f6;
  background: #1f2937;
  transform: translateY(-2px);
}

.qc-badge { font-size: 12.5px; font-weight: 700; color: #60a5fa; margin-bottom: 4px; }
.qc-text { font-size: 11.5px; color: #9ca3af; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 消息流列表 */
.messages-stream {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.msg-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.msg-user { justify-content: flex-end; }
.msg-ai { justify-content: flex-start; }

.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.ai-avatar {
  background: #1f2937;
  border: 1px solid #3b82f6;
}

.user-avatar { background: #2563eb; }

.msg-bubble-box {
  max-width: 82%;
  display: flex;
  flex-direction: column;
}

@media (max-width: 640px) {
  .msg-bubble-box { max-width: 90%; }
}

.ai-meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 11px;
}

.meta-pill {
  background: #1f2937;
  padding: 2px 6px;
  border-radius: 4px;
  color: #9ca3af;
}

.model-pill { color: #38bdf8; font-weight: 600; }
.meta-action-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 11px;
}
.meta-action-btn:hover { color: #d1d5db; }

/* 💭 深度思考过程折叠样式 */
.thinking-accordion {
  margin-bottom: 8px;
  background: #111827;
  border: 1px solid #1f2937;
  border-left: 3px solid #60a5fa;
  border-radius: 6px;
  overflow: hidden;
}

.thinking-header {
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  background: rgba(31, 41, 55, 0.5);
  user-select: none;
}

.thinking-header:hover {
  background: #1f2937;
}

.thinking-icon { font-size: 13px; }
.thinking-title { font-size: 12px; font-weight: 600; color: #93c5fd; flex: 1; }
.thinking-toggle-arrow { font-size: 11px; color: #6b7280; }

.thinking-body {
  padding: 10px 12px;
  border-top: 1px dashed #1f2937;
  max-height: 220px;
  overflow-y: auto;
}

.thinking-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11.5px;
  line-height: 1.55;
  color: #9ca3af;
}

/* 🛠️ 本地与网络工具折叠样式 */
.tools-accordion {
  margin-bottom: 8px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-left: 3px solid #10b981;
  border-radius: 6px;
  overflow: hidden;
}

.tools-header {
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  background: rgba(16, 185, 129, 0.08);
  user-select: none;
}

.tools-header:hover {
  background: rgba(16, 185, 129, 0.16);
}

.tools-icon { font-size: 13px; }
.tools-title { font-size: 12px; font-weight: 600; color: #34d399; flex: 1; }
.tools-toggle-arrow { font-size: 11px; color: #94a3b8; }

.tools-body {
  padding: 10px 12px;
  border-top: 1px dashed #334155;
  max-height: 220px;
  overflow-y: auto;
}

.tool-call-item {
  margin-bottom: 8px;
  background: #090d16;
  border-radius: 4px;
  padding: 6px 10px;
  border: 1px solid #1e293b;
}

.tool-call-item:last-child {
  margin-bottom: 0;
}

.tool-call-name {
  font-size: 11.5px;
  color: #38bdf8;
  margin-bottom: 4px;
}

.tool-call-input {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #cbd5e1;
}

/* 消息正文气泡 */
.msg-bubble {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 14px;
  word-break: break-word;
}

.msg-user .msg-bubble {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  border-bottom-right-radius: 3px;
}

.msg-ai .msg-bubble {
  background: #111827;
  color: #f3f4f6;
  border: 1px solid #1f2937;
  border-bottom-left-radius: 3px;
}

.msg-markdown {
  word-break: break-word;
}

/* GitHub 风格 Markdown 样式 */
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.65;
  color: #e5e7eb;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body h1 {
  font-size: 1.4rem;
  border-bottom: 1px solid #374151;
  padding-bottom: 6px;
  color: #f9fafb;
}

.markdown-body h2 {
  font-size: 1.2rem;
  border-bottom: 1px solid #2d3748;
  padding-bottom: 6px;
  color: #60a5fa;
}

.markdown-body h3 {
  font-size: 1.05rem;
  color: #93c5fd;
}

.markdown-body p {
  margin-top: 0;
  margin-bottom: 10px;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body strong {
  font-weight: 600;
  color: #38bdf8;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  border: 1px solid #374151;
  border-radius: 6px;
  overflow: hidden;
  font-size: 13px;
}

.markdown-body th,
.markdown-body td {
  padding: 8px 12px;
  border: 1px solid #374151;
  text-align: left;
}

.markdown-body th {
  background: #1e293b;
  font-weight: 600;
  color: #f3f4f6;
}

.markdown-body tr:nth-child(even) {
  background: #131b2e;
}

.markdown-body tr:hover {
  background: #1e293b;
}

.markdown-body code {
  font-family: Consolas, Monaco, monospace;
  font-size: 12.5px;
  background: #1f2937;
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-body pre {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 10px 0;
}

.markdown-body pre code {
  background: transparent;
  color: #e5e7eb;
  padding: 0;
  border-radius: 0;
}

.markdown-body blockquote {
  margin: 10px 0;
  padding: 6px 12px;
  color: #9ca3af;
  border-left: 4px solid #3b82f6;
  background: #111827;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 20px;
  margin: 8px 0;
}

/* 打字机光标动画 */
.streaming-cursor {
  display: inline-block;
  color: #60a5fa;
  font-weight: bold;
  animation: cursorBlink 0.8s infinite;
  margin-left: 2px;
}

@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.thinking-live-badge {
  font-size: 11px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  padding: 1px 8px;
  margin-left: 6px;
  animation: pulseBadge 1.5s infinite;
}

@keyframes pulseBadge {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.96); }
}

.user-time-label {
  font-size: 10.5px;
  color: #6b7280;
  text-align: right;
  margin-top: 3px;
  margin-right: 4px;
}

/* 思考中加载态 */
.thinking-active-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #111827;
  border: 1px solid #3b82f6;
  padding: 12px 16px;
  border-radius: 10px;
  color: #9ca3af;
  font-size: 13px;
}

.dots-pulse {
  display: flex;
  gap: 4px;
}

.dots-pulse span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  animation: bounceDot 1.4s infinite ease-in-out both;
}

.dots-pulse span:nth-child(1) { animation-delay: -0.32s; }
.dots-pulse span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounceDot {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 底部输入框 */
.chat-input-dock {
  background: #111827;
  border-top: 1px solid #1f2937;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dock-chips-bar {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  white-space: nowrap;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.dock-chips-bar::-webkit-scrollbar { display: none; }

.dock-chip {
  background: #1f2937;
  border: 1px solid #374151;
  color: #9ca3af;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.dock-chip:hover {
  color: #38bdf8;
  border-color: #38bdf8;
}

.dock-input-form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: #090d16;
  border: 1px solid #1f2937;
  border-radius: 12px;
  padding: 8px 12px;
}

.dock-input-form:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.dock-textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: #f9fafb;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 130px;
  font-family: inherit;
}

.dock-send-btn {
  background: #2563eb;
  border: none;
  color: #ffffff;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.dock-send-btn:hover:not(:disabled) {
  background: #1d4ed8;
  transform: scale(1.05);
}

.dock-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dock-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.dock-tip {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: #6b7280;
  padding: 0 4px;
}

/* 本地弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
}

.modal-window {
  background: #111827;
  border: 1px solid #1f2937;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid #1f2937;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 { margin: 0; font-size: 16px; color: #f9fafb; }
.modal-close { background: transparent; border: none; color: #9ca3af; font-size: 18px; cursor: pointer; }

.modal-body { padding: 18px; }
.modal-hint { font-size: 13px; color: #9ca3af; margin-top: 0; margin-bottom: 12px; }

.tabs-row { display: flex; gap: 6px; margin-bottom: 10px; }
.tab-btn {
  background: #1f2937;
  border: 1px solid #374151;
  color: #9ca3af;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.tab-btn.active { background: #2563eb; color: #ffffff; border-color: #2563eb; }

.code-box pre {
  background: #090d16;
  border: 1px solid #1f2937;
  padding: 12px;
  border-radius: 8px;
  color: #38bdf8;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.btn-copy-code {
  width: 100%;
  background: #2563eb;
  border: none;
  color: #ffffff;
  padding: 9px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
</style>

/* 历史更早消息分页折叠栏 */
.history-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 16px;
  border-bottom: 1px dashed #2d3748;
  margin-bottom: 16px;
}

.btn-load-history {
  background: #1e293b;
  border: 1px solid #3b82f6;
  color: #93c5fd;
  font-size: 13px;
  padding: 7px 18px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.btn-load-history:hover {
  background: #2563eb;
  color: #fff;
  transform: translateY(-1px);
}

.btn-load-history-all {
  background: transparent;
  border: 1px solid #4b5563;
  color: #9ca3af;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-load-history-all:hover {
  background: #374151;
  color: #f3f4f6;
}

/* 实时动态执行状态指示胶囊 */
.live-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(59, 130, 246, 0.45);
  padding: 5px 12px;
  border-radius: 16px;
  font-size: 12px;
  color: #60a5fa;
  margin-bottom: 10px;
  backdrop-filter: blur(4px);
  animation: fadeInPill 0.3s ease;
}

.pulsing-radar {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  animation: radarPulse 1.6s infinite;
}

@keyframes radarPulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 7px rgba(59, 130, 246, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
}

@keyframes fadeInPill {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
