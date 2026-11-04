<template>
  <div id="app-root">
    <template v-if="isLoggedIn && $route.path !== '/login'">
      <!-- 桌面端侧边栏 (屏幕 >= 768px 显示) -->
      <aside class="sidebar desktop-only">
        <div class="logo">
          <span class="logo-icon">🤖</span>
          <span class="logo-text">AI Credits Hub</span>
        </div>
        <nav class="nav-menu">
          <router-link to="/" class="nav-item" exact-active-class="active">
            <span class="nav-icon">📊</span>
            <span>仪表盘</span>
          </router-link>
          <router-link to="/accounts" class="nav-item" active-class="active">
            <span class="nav-icon">👤</span>
            <span>账号管理</span>
          </router-link>
          <router-link to="/logs" class="nav-item" active-class="active">
            <span class="nav-icon">📝</span>
            <span>签到日志</span>
          </router-link>
          <router-link to="/cli" class="nav-item" active-class="active">
            <span class="nav-icon">💬</span>
            <span>AI 在线对话 (混元4)</span>
          </router-link>
        </nav>
        <div class="sidebar-footer">
          <button class="logout-btn" @click="logout">
            <span>🚪</span> 退出登录
          </button>
        </div>
      </aside>

      <!-- 移动端顶部标题栏 (屏幕 < 768px 显示) -->
      <header class="mobile-header mobile-only">
        <div class="mobile-logo">
          <span style="font-size: 22px;">🤖</span>
          <span style="font-weight: 700; font-size: 16px;">AI Credits Hub</span>
        </div>
        <button class="mobile-logout-btn" @click="logout" title="退出登录">
          🚪
        </button>
      </header>

      <!-- 主内容区域 -->
      <main class="main-content">
        <router-view />
      </main>

      <!-- 移动端底部 App 导航栏 (屏幕 < 768px 显示) -->
      <nav class="mobile-bottom-nav mobile-only">
        <router-link to="/" class="bottom-nav-item" exact-active-class="active">
          <span class="bottom-nav-icon">📊</span>
          <span class="bottom-nav-label">仪表盘</span>
        </router-link>
        <router-link to="/accounts" class="bottom-nav-item" active-class="active">
          <span class="bottom-nav-icon">👤</span>
          <span class="bottom-nav-label">账号</span>
        </router-link>
        <router-link to="/logs" class="bottom-nav-item" active-class="active">
          <span class="bottom-nav-icon">📝</span>
          <span class="bottom-nav-label">日志</span>
        </router-link>
        <router-link to="/cli" class="bottom-nav-item" active-class="active">
          <span class="bottom-nav-icon">💬</span>
          <span class="bottom-nav-label">AI 对话</span>
        </router-link>
      </nav>
    </template>

    <template v-else>
      <router-view />
    </template>
  </div>
</template>

<script>
export default {
  computed: {
    isLoggedIn() {
      return !!localStorage.getItem('token')
    },
  },
  methods: {
    logout() {
      localStorage.removeItem('token')
      this.$router.push('/login')
    },
  },
}
</script>

<style>
/* ==================== 全局通用样式 ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

:root {
  --primary: #667eea;
  --primary-dark: #5a67d8;
  --primary-light: #7c8cf0;
  --success: #48bb78;
  --warning: #ed8936;
  --danger: #f56565;
  --bg: #f8fafc;
  --bg-card: #ffffff;
  --text: #1e293b;
  --text-light: #64748b;
  --border: #e2e8f0;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  --radius: 12px;
  --sidebar-width: 230px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  overflow-x: hidden;
}

#app-root {
  min-height: 100vh;
}

/* 桌面/移动端显示控制 */
.desktop-only { display: flex; }
.mobile-only { display: none; }

/* ==================== 桌面端侧边栏 ==================== */
.sidebar {
  width: var(--sidebar-width);
  background: linear-gradient(180deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 100;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.05);
}

.logo {
  padding: 24px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.logo-icon { font-size: 26px; }
.logo-text { font-size: 17px; font-weight: 700; letter-spacing: 0.3px; }

.nav-menu {
  flex: 1;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.82);
  text-decoration: none;
  transition: all 0.2s;
  font-size: 14px;
  font-weight: 500;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.nav-icon { font-size: 18px; width: 22px; text-align: center; }

.sidebar-footer {
  padding: 16px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.logout-btn {
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.logout-btn:hover { background: rgba(255, 255, 255, 0.25); }

/* ==================== 桌面端主内容 ==================== */
.main-content {
  margin-left: var(--sidebar-width);
  padding: 28px 36px;
  min-height: 100vh;
  max-width: 1400px;
}

/* ==================== 通用组件库 ==================== */
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 20px;
  letter-spacing: -0.3px;
}

.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-success { background: var(--success); color: white; }
.btn-success:hover { background: #38a169; }
.btn-danger { background: var(--danger); color: white; }
.btn-danger:hover { background: #e53e3e; }

.btn-outline {
  background: white;
  border: 1px solid var(--border);
  color: var(--text);
}
.btn-outline:hover { border-color: var(--primary); color: var(--primary); }

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* 表单输入控件 */
.form-group { margin-bottom: 14px; }
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 5px;
}

.form-input, .form-select, .form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text);
  background: white;
  transition: all 0.2s;
}

.form-input:focus, .form-select:focus, .form-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

/* 标签样式 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.tag-success { background: #dcfce7; color: #166534; }
.tag-warning { background: #fef9c3; color: #854d0e; }
.tag-danger { background: #fee2e2; color: #991b1b; }
.tag-info { background: #e0f2fe; color: #075985; }

/* 模态弹窗 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  padding: 16px;
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalScale {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

/* 表格与分页 */
.table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { width: 100%; border-collapse: collapse; min-width: 500px; }
th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
th { font-weight: 600; color: var(--text-light); font-size: 12px; }

/* Toast */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 30px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  animation: toastFade 0.25s ease;
  max-width: 90%;
  text-align: center;
}
.toast-success { background: #10b981; }
.toast-error { background: #ef4444; }
.toast-info { background: #6366f1; }

@keyframes toastFade {
  from { opacity: 0; transform: translate(-50%, -10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ========================================================== */
/* 📱 手机端专用响应式适配 (Screens < 768px)                   */
/* ========================================================== */
@media (max-width: 767px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: flex !important; }

  /* 移动端顶栏 */
  .mobile-header {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    height: 52px;
    background: white;
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 100;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  }

  .mobile-logo {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-logout-btn {
    border: none;
    background: #f1f5f9;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }

  /* 移动端主内容铺满屏幕，底部留出空间 */
  .main-content {
    margin-left: 0;
    padding: 16px 12px 80px 12px;
    min-height: calc(100vh - 52px);
  }

  .page-title {
    font-size: 19px;
    margin-bottom: 14px;
  }

  .card {
    padding: 16px 14px;
    border-radius: 12px;
  }

  /* 移动端底部原生级 Tab 导航栏 */
  .mobile-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-around;
    z-index: 100;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .bottom-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: #94a3b8;
    text-decoration: none;
    flex: 1;
    height: 100%;
    transition: all 0.15s;
  }

  .bottom-nav-icon {
    font-size: 19px;
  }

  .bottom-nav-label {
    font-size: 11px;
    font-weight: 500;
  }

  .bottom-nav-item.active {
    color: var(--primary);
    font-weight: 700;
  }

  /* 移动端弹窗直接吸附底部或全宽展示 */
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal {
    border-radius: 20px 20px 0 0;
    max-height: 85vh;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom)) 16px;
    animation: modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .modal-actions {
    flex-direction: column;
    gap: 8px;
  }

  .modal-actions .btn {
    width: 100%;
    padding: 12px;
  }
}
</style>
