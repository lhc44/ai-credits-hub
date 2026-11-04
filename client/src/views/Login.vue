<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <span class="login-logo">🤖</span>
        <h1>AI Credits Hub</h1>
        <p>AI编程工具积分签到管理平台</p>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input
            v-model="form.username"
            class="form-input"
            type="text"
            placeholder="请输入管理员用户名"
            autofocus
            autocomplete="username"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="form.password"
            class="form-input"
            type="password"
            placeholder="请输入管理员密码"
            autocomplete="current-password"
          />
        </div>
        <button class="btn btn-primary login-btn" type="submit" :disabled="loading">
          {{ loading ? '登录验证中...' : '登 录' }}
        </button>
      </form>

      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>
  </div>
</template>

<script>
import api from '../api'

export default {
  data() {
    return {
      form: { username: '', password: '' },
      loading: false,
      error: '',
    }
  },
  methods: {
    async handleLogin() {
      if (!this.form.username || !this.form.password) {
        this.error = '请输入用户名和密码'
        return
      }
      this.loading = true
      this.error = ''
      try {
        const res = await api.post('/auth/login', this.form)
        localStorage.setItem('token', res.data.token)
        this.$router.push('/')
      } catch (err) {
        this.error = err.message || '用户名或密码错误'
      } finally {
        this.loading = false
      }
    },
  },
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  padding: 16px;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 36px 28px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.login-logo {
  font-size: 44px;
  display: block;
  margin-bottom: 8px;
}

.login-header h1 {
  font-size: 21px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 4px;
}

.login-header p {
  color: #64748b;
  font-size: 13px;
}

.login-btn {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  margin-top: 10px;
  justify-content: center;
  border-radius: 10px;
}

.error-msg {
  text-align: center;
  color: #ef4444;
  font-size: 13px;
  margin-top: 14px;
  padding: 8px;
  background: #fef2f2;
  border-radius: 6px;
}

@media (max-width: 767px) {
  .login-card {
    padding: 28px 20px;
    border-radius: 16px;
  }
}
</style>
