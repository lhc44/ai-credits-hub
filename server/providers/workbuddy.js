const axios = require('axios');

/**
 * WorkBuddy / CodeBuddy 签到模块
 * 
 * API 基础域名: https://copilot.tencent.com
 * 
 * 主要接口:
 * - POST /v2/billing/meter/daily-checkin          签到
 * - POST /v2/billing/meter/checkin-activity-status 查询签到状态
 * - POST /v2/plugin/auth/token/refresh             刷新Token
 */

const BASE_URL = 'https://copilot.tencent.com';

class WorkBuddyProvider {
  constructor(account) {
    this.account = account;
    this.accessToken = account.access_token;
    this.refreshToken = account.refresh_token;
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
  }

  /**
   * 刷新 Access Token
   */
  async refreshAccessToken() {
    try {
      const resp = await axios.post(`${BASE_URL}/v2/plugin/auth/token/refresh`, {}, {
        headers: {
          'X-Refresh-Token': this.refreshToken,
          'X-Auth-Refresh-Source': 'plugin',
          'X-Domain': 'copilot.tencent.com',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      if (resp.data && resp.data.access_token) {
        this.accessToken = resp.data.access_token;
        if (resp.data.refresh_token) {
          this.refreshToken = resp.data.refresh_token;
        }
        return {
          success: true,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
        };
      }

      return { success: false, message: '刷新Token返回数据异常' };
    } catch (err) {
      return {
        success: false,
        message: `刷新Token失败: ${err.response?.data?.msg || err.message}`,
      };
    }
  }

  /**
   * 查询签到状态
   */
  async getCheckinStatus() {
    try {
      const resp = await axios.post(
        `${BASE_URL}/v2/billing/meter/checkin-activity-status`,
        {},
        { headers: this.getHeaders(), timeout: 15000 }
      );
      return { success: true, data: resp.data };
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        return { success: false, tokenExpired: true, message: 'Token已过期' };
      }
      return { success: false, message: err.message };
    }
  }

  /**
   * 执行每日签到
   */
  async checkin() {
    try {
      // 先尝试刷新Token
      const refreshResult = await this.refreshAccessToken();
      if (refreshResult.success) {
        console.log(`[WorkBuddy] Token刷新成功`);
      }

      const resp = await axios.post(
        `${BASE_URL}/v2/billing/meter/daily-checkin`,
        {},
        { headers: this.getHeaders(), timeout: 15000 }
      );

      const data = resp.data;
      const credit = data?.data?.credit !== undefined ? data.data.credit : (data?.credit || 0);

      if (data && (data.code === 0 || credit !== undefined)) {
        return {
          success: true,
          status: 'success',
          creditsEarned: credit,
          message: `签到成功! 获得 ${credit} 积分`,
          rawResponse: JSON.stringify(data),
          newAccessToken: this.accessToken,
          newRefreshToken: this.refreshToken,
        };
      }

      return {
        success: true,
        status: 'success',
        creditsEarned: 0,
        message: '签到成功',
        rawResponse: JSON.stringify(data),
        newAccessToken: this.accessToken,
        newRefreshToken: this.refreshToken,
      };
    } catch (err) {
      const status = err.response?.status;
      const errData = err.response?.data;

      // 已经签到过
      if (status === 400 && errData?.code === 10001) {
        return {
          success: true,
          status: 'already_done',
          creditsEarned: 0,
          message: errData.msg || '今天已签到',
          rawResponse: JSON.stringify(errData),
          newAccessToken: this.accessToken,
          newRefreshToken: this.refreshToken,
        };
      }

      // Token过期
      if (status === 401 || status === 403) {
        return {
          success: false,
          status: 'token_expired',
          creditsEarned: 0,
          message: 'Token已过期，请重新登录获取',
          rawResponse: JSON.stringify(errData || {}),
        };
      }

      return {
        success: false,
        status: 'failed',
        creditsEarned: 0,
        message: `签到失败: ${errData?.msg || err.message}`,
        rawResponse: JSON.stringify(errData || { error: err.message }),
      };
    }
  }

  /**
   * 查询余额与积分明细
   */
  async getBalance() {
    try {
      const statusResult = await this.getCheckinStatus();
      if (statusResult.success && statusResult.data) {
        const d = statusResult.data.data || statusResult.data;
        return {
          success: true,
          credits: d.total_credits !== undefined ? d.total_credits : (d.today_credit || 0),
          consecutiveDays: d.streak_days !== undefined ? d.streak_days : (d.consecutive_days || 0),
          todayChecked: Boolean(d.today_checked_in || d.today_checked),
          details: {
            dailyCredit: d.daily_credit || 100,
            checkinDates: d.checkin_dates || [],
          }
        };
      }
      return { success: false, message: statusResult.message, tokenExpired: statusResult.tokenExpired };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = WorkBuddyProvider;
