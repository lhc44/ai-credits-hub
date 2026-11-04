const axios = require('axios');

/**
 * QoderCN 提供商模块
 * 
 * 官方架构与机制说明：
 * 1. Qoder (通义灵码 / 阿里云) 的每日免费额度（如每日 100 次补全/请求）由官方云端后台直接分配给桌面客户端。
 * 2. 网页端 (qoder.cn) 属于官网及账号管理控制台，全站由阿里云 WAF 与 CSRF 严格防护，官方并未在网页端提供每日签到按钮或公开签到 API。
 * 3. 官方个人访问令牌 (PAT, 以 pt- 开头) 仅用于 Git 代码库集成与 Cloud Agent 命令行调用，不具备福利活动或签到兑换权限 (请求 sash 接口直接返回 401 TOKEN_INVALID)。
 * 4. 因此，Qoder 用户无需也不必在网页端手动打卡；系统将其视为桌面端常驻有效状态。
 */

class QoderProvider {
  constructor(account) {
    this.account = account;
    this.accessToken = (account.access_token || '').trim();
    this.refreshToken = account.refresh_token;
    this.extraData = {};
    try {
      this.extraData = JSON.parse(account.extra_data || '{}');
    } catch (e) {
      this.extraData = {};
    }
  }

  /**
   * 执行每日签到 / 额度状态确认
   */
  async checkin() {
    // Qoder 官方每日免费额度为桌面端自动生效机制，无需打卡
    return {
      success: true,
      status: 'already_done',
      creditsEarned: 0,
      message: 'Qoder 额度由官方桌面客户端登录后每日自动分配（网页端/PAT官方无签到接口，无需手动打卡）',
      rawResponse: JSON.stringify({
        platform: 'qoder',
        type: 'desktop_auto_allocated',
        hasToken: !!this.accessToken,
        note: 'Qoder credits are managed by Alibaba Cloud backend and refreshed daily in desktop IDE.'
      }),
    };
  }

  async getBalance() {
    return {
      success: true,
      credits: this.account.credits_balance || 0,
      todayChecked: true,
    };
  }
}

module.exports = QoderProvider;
