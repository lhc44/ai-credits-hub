const WorkBuddyProvider = require('./workbuddy');
const QoderProvider = require('./qoder');
const TraeProvider = require('./trae');

/**
 * 签到服务提供者工厂
 */
function getProvider(account) {
  switch (account.platform) {
    case 'workbuddy':
      return new WorkBuddyProvider(account);
    case 'qoder':
      return new QoderProvider(account);
    case 'trae':
      return new TraeProvider(account);
    default:
      throw new Error(`不支持的平台: ${account.platform}`);
  }
}

const PLATFORM_INFO = {
  workbuddy: {
    name: 'WorkBuddy / CodeBuddy',
    icon: '🤖',
    description: '腾讯AI编程助手',
    tokenGuide: '在WorkBuddy/CodeBuddy桌面端登录后，从开发者工具的Network面板中获取 Authorization Header 中的 Bearer Token',
    fields: ['access_token', 'refresh_token'],
  },
  qoder: {
    name: 'QoderCN',
    icon: '💻',
    description: 'Qoder 编程助手',
    tokenGuide: '从QoderCN桌面端的 auth.v1.dat 文件中解密获取Token，或从客户端网络请求中抓取',
    fields: ['access_token', 'refresh_token', 'machineToken'],
  },
  trae: {
    name: 'Trae',
    icon: '⚡',
    description: '字节跳动AI编程助手',
    tokenGuide: '从Trae客户端的 storage.json 中获取 refreshToken，或使用开源工具一键提取',
    fields: ['access_token', 'refresh_token', 'deviceId', 'sessionId'],
  },
};

module.exports = { getProvider, PLATFORM_INFO };
