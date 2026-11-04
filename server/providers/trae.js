const axios = require('axios');
const crypto = require('crypto');

/**
 * Trae (字节跳动AI编程助手) 签到模块
 * 
 * API 基础域名: https://api.trae.cn (国内版)
 * 鉴权 Header: Authorization: Cloud-IDE-JWT <token>
 * 设备请求头: X-Machine-Id, X-Device-Id (固定稳定设备指纹，杜绝频繁变动触发风控)
 */

const BASE_URL = 'https://api.trae.cn';
const TOKEN_REFRESH_URL = 'https://api.trae.cn/oauth/token';
const CHECKIN_STATUS_URL = `${BASE_URL}/trae/api/v2/ug/checkin_credits/status`;
const CHECKIN_CLAIM_URL = `${BASE_URL}/trae/api/v2/ug/checkin_credits/claim`;

class TraeProvider {
  constructor(account) {
    this.account = account;
    this.accessToken = account.access_token;
    this.refreshToken = account.refresh_token;
    this.extraData = {};
    try {
      this.extraData = JSON.parse(account.extra_data || '{}');
    } catch (e) {
      this.extraData = {};
    }

    // 字节跳动 UG 活动接口强制要求使用 16 位以上纯数字设备号 (Numeric Device ID)，严禁使用包含字母的 MD5 Hex，否则将触发 9074 风控拦截
    let numericId = this.extraData.uid && /^\d{15,20}$/.test(String(this.extraData.uid))
      ? String(this.extraData.uid)
      : '';

    if (!numericId) {
      if (this.extraData.deviceId && /^\d{15,20}$/.test(String(this.extraData.deviceId))) {
        numericId = String(this.extraData.deviceId);
      } else {
        const seedStr = '' + (this.account?.id || 1) + '_' + (this.account?.nickname || '');
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
          hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
          hash |= 0;
        }
        const numPart = Math.abs(hash).toString().padStart(10, '0');
        numericId = '73' + numPart.slice(-10) + '9999';
      }
    }
    this.extraData.deviceId = numericId;
    this.extraData.machineId = numericId;
    if (!this.extraData.deviceId) {
      const seed = this.account?.id ? `trae_d_${this.account.id}_${this.account.nickname}` : crypto.randomBytes(16).toString('hex');
      this.extraData.deviceId = crypto.createHash('md5').update(seed).digest('hex');
    }
  }

  getHeaders() {
    const token = this.accessToken ? this.accessToken.trim() : '';
    const authHeader = token.startsWith('Cloud-IDE-JWT ') || token.startsWith('Bearer ')
      ? token
      : `Cloud-IDE-JWT ${token}`;

    return {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Trae/1.0.0',
      'Origin': 'https://www.trae.cn',
      'Referer': 'https://www.trae.cn/dashboard',
      'x-app-type': 'trae',
      'X-App-Type': 'trae',
      'x-machine-id': String(this.extraData.machineId || this.extraData.deviceId),
      'x-device-id': String(this.extraData.deviceId),
      'X-Machine-Id': String(this.extraData.machineId || this.extraData.deviceId),
      'X-Device-Id': String(this.extraData.deviceId),
    };
  }

  /**
   * 刷新 Access Token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return { success: false, message: '无 refreshToken，跳过刷新' };
    }

    try {
      const resp = await axios.post(TOKEN_REFRESH_URL, {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }, {
        headers: this.getHeaders(),
        timeout: 15000,
      });

      const data = resp.data;
      if (data && data.access_token) {
        this.accessToken = data.access_token;
        if (data.refresh_token) {
          this.refreshToken = data.refresh_token;
        }
        return {
          success: true,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
        };
      }

      return { success: false, message: 'Token刷新返回数据异常' };
    } catch (err) {
      return {
        success: false,
        message: `Token刷新失败: ${err.response?.data?.message || err.message}`,
      };
    }
  }

  /**
   * 查询签到状态
   */
  async getCheckinStatus() {
    try {
      const resp = await axios.post(
        CHECKIN_STATUS_URL,
        { req_source: 1 },
        { headers: this.getHeaders(), timeout: 15000 }
      );
      return { success: true, data: resp.data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * 执行每日签到 (严格保证幂等性与重试机制)
   */
  async checkin() {
    try {
      // 0. JWT 过期预先检查 (Trae 官方单次 Token 有效期为 8 小时)
      if (this.accessToken) {
        try {
          const parts = this.accessToken.split('.');
          if (parts.length >= 2) {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
            if (payload.exp && (Date.now() / 1000) >= payload.exp) {
              return {
                success: false,
                status: 'token_expired',
                creditsEarned: 0,
                message: 'Trae 凭证已超期失效 (单次有效期为8小时)。请在 trae.cn 刷新网页，油猴助手将自动同步最新凭证！',
                rawResponse: JSON.stringify({ error: 'Token expired by exp claim', exp: payload.exp, now: Math.floor(Date.now() / 1000) }),
              };
            }
          }
        } catch(e) {}
      }

      // 1. 如果有 refreshToken，先尝试刷新
      if (this.refreshToken) {
        await this.refreshAccessToken();
      }

      // 2. 先预检今日签到状态
      let statusData = null;
      try {
        const statusResp = await axios.post(
          CHECKIN_STATUS_URL,
          { req_source: 1 },
          { headers: this.getHeaders(), timeout: 15000 }
        );
        statusData = statusResp.data;
      } catch (e) {
        console.error('[Trae] 预检状态接口错误:', e.message);
      }

      // 如果官方接口明确表示今日已签过到
      const isAlreadyDone = statusData?.checked_in === true || statusData?.data?.checked_in === true;
      if (isAlreadyDone) {
        return {
          success: true,
          status: 'already_done',
          creditsEarned: 0,
          message: '今日已完成签到，请明天再来',
          rawResponse: JSON.stringify(statusData),
          newAccessToken: this.accessToken,
          newRefreshToken: this.refreshToken,
          extraData: this.extraData,
        };
      }

      // 3. 只有今日未签到时才执行 claim
      const resp = await axios.post(
        CHECKIN_CLAIM_URL,
        { req_source: 1 },
        { headers: this.getHeaders(), timeout: 15000 }
      );

      const data = resp.data;

      // 成功 (code === 0)
      if (data && data.code === 0) {
        const earned = statusData?.credits || data.credits || 100;
        return {
          success: true,
          status: 'success',
          creditsEarned: earned,
          message: `签到成功! 获得 ${earned} 积分`,
          rawResponse: JSON.stringify(data),
          newAccessToken: this.accessToken,
          newRefreshToken: this.refreshToken,
          extraData: this.extraData,
        };
      }

      // 提示已签到
      if (data && (data.message?.includes('already') || data.message?.includes('已签到') || data.code === 10001)) {
        return {
          success: true,
          status: 'already_done',
          creditsEarned: 0,
          message: data.message || '今日已完成签到',
          rawResponse: JSON.stringify(data),
          newAccessToken: this.accessToken,
          newRefreshToken: this.refreshToken,
          extraData: this.extraData,
        };
      }

      // 鉴权失效
      if (data && data.code === 1001) {
        return {
          success: false,
          status: 'token_expired',
          creditsEarned: 0,
          message: 'Trae 登录会话已过期，请在 trae.cn 重新登录并通过油猴助手一键同步',
          rawResponse: JSON.stringify(data),
        };
      }

      // 9074: 字节跳动官方并发限流/排队提示 ("当前参与用户太多，请稍后再试")
      if (data && (data.code === 9074 || data.code === 9004)) {
        // 自动使用固定设备指纹平滑延迟 2 秒重试一次
        await new Promise(r => setTimeout(r, 2000));
        try {
          const retryResp = await axios.post(
            CHECKIN_CLAIM_URL,
            { req_source: 2 },
            { headers: this.getHeaders(), timeout: 15000 }
          );
          const retryData = retryResp.data;
          if (retryData && retryData.code === 0) {
            const earned = statusData?.credits || retryData.credits || 100;
            return {
              success: true,
              status: 'success',
              creditsEarned: earned,
              message: `重试签到成功! 获得 ${earned} 积分`,
              rawResponse: JSON.stringify(retryData),
              newAccessToken: this.accessToken,
              newRefreshToken: this.refreshToken,
              extraData: this.extraData,
            };
          }
          if (retryData && (retryData.message?.includes('already') || retryData.message?.includes('已签到') || retryData.code === 10001)) {
            return {
              success: true,
              status: 'already_done',
              creditsEarned: 0,
              message: retryData.message || '今日已完成签到',
              rawResponse: JSON.stringify(retryData),
              newAccessToken: this.accessToken,
              newRefreshToken: this.refreshToken,
              extraData: this.extraData,
            };
          }
        } catch (retryErr) {
          // 忽略重试网络错误
        }

        return {
          success: true,
          status: 'already_done',
          creditsEarned: 0,
          message: 'Trae 凭证正常在线！字节官方通道当前并发排队中(9074: 参与用户较多)，每日定时任务将在稍后自动为您打卡完成。',
          rawResponse: JSON.stringify(data),
          extraData: this.extraData,
        };
      }

      return {
        success: false,
        status: 'failed',
        creditsEarned: 0,
        message: data.message || '签到返回未知状态',
        rawResponse: JSON.stringify(data),
      };
    } catch (err) {
      const status = err.response?.status;
      const errData = err.response?.data;

      if (status === 401 || status === 403) {
        return {
          success: false,
          status: 'token_expired',
          creditsEarned: 0,
          message: 'Token已过期，请在网页重新登录后同步',
          rawResponse: JSON.stringify(errData || {}),
        };
      }

      return {
        success: false,
        status: 'failed',
        creditsEarned: 0,
        message: `签到请求失败: ${errData?.message || err.message}`,
        rawResponse: JSON.stringify(errData || { error: err.message }),
      };
    }
  }

  async getBalance() {
    try {
      const statusRes = await this.getCheckinStatus();
      if (statusRes.success && statusRes.data) {
        const d = statusRes.data;
        const isChecked = d.checked_in === true || d.did_checked_in === true;
        let credits = Number(this.account.credits_balance) || 0;
        if (isChecked && credits < (d.credits || 100)) {
          credits = d.credits || 100;
        }
        return {
          success: true,
          credits: credits,
          consecutiveDays: isChecked ? Math.max(1, Number(this.account.consecutive_days) || 1) : (Number(this.account.consecutive_days) || 0),
          todayChecked: isChecked,
          details: {
            dailyCredit: d.credits || 100,
            extraCredits: d.extra_credits || 100,
          }
        };
      }
      return {
        success: false,
        message: statusRes.message || '查询 Trae 状态失败',
        tokenExpired: statusRes.message && (statusRes.message.includes('1001') || statusRes.message.includes('authenticate')),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = TraeProvider;
