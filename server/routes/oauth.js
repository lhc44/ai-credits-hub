const express = require('express');
const axios = require('axios');
const db = require('../db');

const router = express.Router();

function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
  } catch (e) {}
  return null;
}

// ==================== WorkBuddy 在线扫码与授权登录 ====================

// 1. 获取官方登录二维码链接与 state
router.get('/workbuddy/init', async (req, res) => {
  try {
    const resp = await axios.post(
      'https://copilot.tencent.com/v2/plugin/auth/state?platform=CLI',
      {},
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    if (resp.data && resp.data.code === 0 && resp.data.data) {
      return res.json({
        code: 0,
        data: {
          state: resp.data.data.state,
          authUrl: resp.data.data.authUrl,
        },
      });
    }

    res.status(500).json({ code: 500, message: resp.data?.msg || '获取登录二维码失败' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '请求官方登录服务失败: ' + err.message });
  }
});

// 2. 轮询登录状态
router.get('/workbuddy/poll', async (req, res) => {
  const { state, nickname } = req.query;
  const userId = req.user ? req.user.id : 1;

  if (!state) {
    return res.status(400).json({ code: 400, message: '缺少 state 参数' });
  }

  try {
    const resp = await axios.get(
      `https://copilot.tencent.com/v2/plugin/auth/token?state=${encodeURIComponent(state)}`,
      { timeout: 10000 }
    );

    const data = resp.data;

    if (!data || data.code !== 0 || !data.data || !data.data.accessToken) {
      return res.json({
        code: 0,
        data: {
          completed: false,
          status: 'waiting',
          message: data?.msg || '等待扫码确认...',
        },
      });
    }

    const { accessToken, refreshToken } = data.data;

    // 解析 JWT 获取唯一用户 ID (sub) 和手机号
    const jwtPayload = parseJwt(accessToken);
    const sub = jwtPayload?.sub;
    const phone = jwtPayload?.preferred_username;

    let userNickname = nickname || jwtPayload?.nickname || (phone ? `WorkBuddy_${phone}` : 'WorkBuddy账号');
    try {
      const profileResp = await axios.get(
        `https://copilot.tencent.com/v2/plugin/login/account?state=${encodeURIComponent(state)}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      );
      if (profileResp.data?.data?.nickname) {
        userNickname = profileResp.data.data.nickname;
      }
    } catch (e) {}

    // 精准去重查询：匹配 sub 或 phone 或同名
    const allAccounts = db.prepare('SELECT id, nickname, access_token, extra_data FROM accounts WHERE user_id = ? AND platform = ?')
      .all(userId, 'workbuddy');

    let existing = null;
    if (sub) {
      existing = allAccounts.find(a => {
        try {
          const extra = JSON.parse(a.extra_data || '{}');
          if (extra.sub && extra.sub === sub) return true;
        } catch (e) {}
        const oldJwt = parseJwt(a.access_token);
        return oldJwt?.sub === sub;
      });
    }
    if (!existing && phone) {
      existing = allAccounts.find(a => {
        try {
          const extra = JSON.parse(a.extra_data || '{}');
          if (extra.phone && extra.phone === phone) return true;
        } catch (e) {}
        const oldJwt = parseJwt(a.access_token);
        return oldJwt?.preferred_username === phone;
      });
    }
    if (!existing) {
      existing = allAccounts.find(a => a.nickname === userNickname);
    }

    let accountId;
    const extraDataObj = { sub, phone };

    if (existing) {
      let mergedExtra = {};
      try { mergedExtra = JSON.parse(existing.extra_data || '{}'); } catch (e) {}
      Object.assign(mergedExtra, extraDataObj);

      db.prepare(`
        UPDATE accounts
        SET nickname = ?, access_token = ?, refresh_token = ?, extra_data = ?, status = 'active', updated_at = ?
        WHERE id = ?
      `).run(userNickname, accessToken, refreshToken, JSON.stringify(mergedExtra), new Date().toISOString(), existing.id);
      accountId = existing.id;
    } else {
      const insertRes = db.prepare(`
        INSERT INTO accounts (user_id, platform, nickname, access_token, refresh_token, extra_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, 'workbuddy', userNickname, accessToken, refreshToken, JSON.stringify(extraDataObj));
      accountId = insertRes.lastInsertRowid;
    }

    res.json({
      code: 0,
      data: {
        completed: true,
        status: 'success',
        accountId,
        nickname: userNickname,
        message: existing ? `账号「${userNickname}」授权凭据已更新就绪！` : '登录成功并已自动绑定！',
      },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '轮询登录状态失败: ' + err.message });
  }
});

// ==================== 油猴脚本一键同步接口 (Web Import + 手机号/昵称识别 + 精准去重) ====================

function processWebImport(data, reqUser) {
  const { platform, nickname, accessToken, refreshToken, extraData = {}, syncKey } = data;

  const validSyncKeys = [
    process.env.SYNC_KEY,
    db.getSettings()?.sync_key,
    'ai-credits-hub-sync',
    'ai-credits-hub-sync-key'
  ].filter(Boolean);

  const isAuth = reqUser || (syncKey && validSyncKeys.includes(syncKey));

  if (!isAuth) {
    return { error: '同步凭证无效或未授权', statusCode: 401 };
  }

  const userId = reqUser ? reqUser.id : 1;

  if (!platform || (!accessToken && !refreshToken)) {
    return { error: '缺少平台类型或 Token', statusCode: 400 };
  }

  const validPlatforms = ['workbuddy', 'qoder', 'trae'];
  if (!validPlatforms.includes(platform)) {
    return { error: '不支持的平台: ' + platform, statusCode: 400 };
  }

  // 尝试解析 JWT 载荷
  function parseJwt(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) base64 += '=';
        const str = Buffer.from(base64, 'base64').toString('utf-8');
        return JSON.parse(str);
      }
    } catch (e) {}
    return null;
  }

  const jwtPayload = parseJwt(accessToken);
  const uid = jwtPayload?.data?.id || jwtPayload?.sub || jwtPayload?.user_id || extraData?.uid;
  const phone = extraData?.phone || jwtPayload?.preferred_username || jwtPayload?.phone_number || jwtPayload?.mobile;

  if (uid && !extraData.uid) extraData.uid = uid;
  if (phone && !extraData.phone) extraData.phone = phone;

  // 计算合理的账号名称
  let cleanNickname = (nickname || '').trim();
  const isPlaceholder = !cleanNickname ||
    cleanNickname.includes('网页账号') ||
    cleanNickname.includes('_web_') ||
    cleanNickname.includes('未命名');

  if (isPlaceholder) {
    if (phone) {
      cleanNickname = `${platform.toUpperCase()}_${phone}`;
    } else if (platform === 'trae' && uid) {
      cleanNickname = `Trae_${String(uid).slice(-6)}`;
    } else if (platform === 'qoder' && accessToken.startsWith('pt-')) {
      cleanNickname = `Qoder_PAT_${accessToken.slice(3, 9)}`;
    } else if (jwtPayload?.nickname || jwtPayload?.name) {
      cleanNickname = jwtPayload.nickname || jwtPayload.name;
    } else {
      cleanNickname = `${platform}_${uid ? String(uid).slice(-4) : '用户'}`;
    }
  }

  // 查询该用户该平台现有所有账号，进行深度去重
  const allAccounts = db.prepare('SELECT id, nickname, access_token, refresh_token, extra_data FROM accounts WHERE user_id = ? AND platform = ?')
    .all(userId, platform);

  let existing = null;

  // 1. 基于平台唯一 UID 去重 (Trae data.id, Qoder/WorkBuddy sub)
  if (uid) {
    existing = allAccounts.find(a => {
      try {
        const extra = JSON.parse(a.extra_data || '{}');
        if (extra.uid && String(extra.uid) === String(uid)) return true;
        if (extra.sub && String(extra.sub) === String(uid)) return true;
      } catch (e) {}
      if (a.access_token) {
        const oldJwt = parseJwt(a.access_token);
        if (oldJwt?.data?.id && String(oldJwt.data.id) === String(uid)) return true;
        if (oldJwt?.sub && String(oldJwt.sub) === String(uid)) return true;
      }
      return false;
    });
  }

  // 2. 基于手机号去重
  if (!existing && phone) {
    existing = allAccounts.find(a => {
      try {
        const extra = JSON.parse(a.extra_data || '{}');
        if (extra.phone && String(extra.phone) === String(phone)) return true;
      } catch (e) {}
      if (a.nickname && a.nickname.includes(phone)) return true;
      return false;
    });
  }

  // 3. 基于精确 Token 去重
  if (!existing && accessToken) {
    existing = allAccounts.find(a => a.access_token === accessToken);
  }

  // 4. 基于明确昵称去重 (非占位符时)
  if (!existing && !isPlaceholder) {
    existing = allAccounts.find(a => a.nickname && a.nickname.toLowerCase() === cleanNickname.toLowerCase());
  }

  // 5. 容错回退：如果用户该平台原本只有 1 个账号，且旧账号是占位符名字，直接更新该账号而非重复插入
  if (!existing && allAccounts.length === 1) {
    const single = allAccounts[0];
    const singleIsPlaceholder = !single.nickname ||
      single.nickname.includes('网页账号') ||
      single.nickname.includes('_web_');
    if (singleIsPlaceholder) {
      existing = single;
    }
  }

  let accountId;
  let isUpdate = false;

  if (existing) {
    isUpdate = true;
    let mergedExtra = {};
    try {
      mergedExtra = JSON.parse(existing.extra_data || '{}');
    } catch (e) {}
    Object.assign(mergedExtra, extraData);

    let finalName = existing.nickname;
    if ((!finalName || finalName.includes('网页账号') || finalName.includes('_web_')) && cleanNickname) {
      finalName = cleanNickname;
    } else if (!isPlaceholder && cleanNickname) {
      finalName = cleanNickname;
    }

    db.prepare(`
      UPDATE accounts
      SET access_token = ?,
          refresh_token = COALESCE(NULLIF(?, ''), refresh_token),
          nickname = ?,
          extra_data = ?,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      accessToken || existing.access_token,
      refreshToken || '',
      finalName,
      JSON.stringify(mergedExtra),
      existing.id
    );

    accountId = existing.id;
    cleanNickname = finalName;
  } else {
    const insertRes = db.prepare(`
      INSERT INTO accounts (user_id, platform, nickname, access_token, refresh_token, extra_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      platform,
      cleanNickname,
      accessToken || '',
      refreshToken || '',
      JSON.stringify(extraData)
    );
    accountId = insertRes.lastInsertRowid;
  }

  return {
    success: true,
    data: { id: accountId, nickname: cleanNickname, isUpdate, phone: phone || '' }
  };
}

// POST 导入接口 (油猴脚本 / 扩展调用)
router.post('/import-web', (req, res) => {
  const result = processWebImport(req.body, req.user);
  if (result.error) {
    return res.status(result.statusCode || 400).json({ code: result.statusCode || 400, message: result.error });
  }
  const { isUpdate, nickname } = result.data;
  res.json({
    code: 0,
    message: isUpdate
      ? `🎉 [${req.body.platform}] 账号「${nickname}」凭据已成功更新（未产生重复账号）！`
      : `🎉 [${req.body.platform}] 新账号「${nickname}」添加成功！`,
    data: result.data,
  });
});

// GET 导入接口 (F12 控制台一行秒同步 / 书签一键同步调用，自带友好完成页)
router.get('/import-web', (req, res) => {
  const query = req.query || {};
  const token = query.accessToken || query.token;
  const data = {
    platform: query.platform || 'trae',
    nickname: query.nickname || '',
    accessToken: token,
    refreshToken: query.refreshToken || '',
    syncKey: query.syncKey || 'ai-credits-hub-sync',
    extraData: {
      phone: query.phone || '',
      uid: query.uid || ''
    }
  };

  const result = processWebImport(data, req.user);

  if (req.xhr || req.headers.accept?.includes('application/json') || query.format === 'json') {
    if (result.error) {
      return res.status(result.statusCode || 400).json({ code: result.statusCode || 400, message: result.error });
    }
    return res.json({ code: 0, data: result.data });
  }

  if (result.error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>同步失败 - AI Credits Hub</title>
      <style>body{background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head>
      <body>
        <div style="background:#1e293b;padding:32px;border-radius:12px;text-align:center;border:1px solid #ef4444;max-width:400px;">
          <div style="font-size:48px;margin-bottom:12px;">❌</div>
          <h2 style="color:#f87171;margin:0 0 10px 0;">同步未成功</h2>
          <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">${result.error}</p>
          <a href="/#/accounts" style="background:#3b82f6;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">返回面板</a>
        </div>
      </body>
      </html>
    `);
  }

  const { nickname, isUpdate, phone } = result.data;
  return res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Trae 账号同步成功 - AI Credits Hub</title>
      <style>
        body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 36px 30px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .icon { font-size: 52px; margin-bottom: 16px; }
        h2 { margin: 0 0 10px 0; color: #34d399; font-size: 22px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
        .meta { background: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; margin-bottom: 24px; font-size: 13.5px; color: #38bdf8; word-break: break-all; }
        .btn { display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; }
        .btn:hover { background: #2563eb; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🎉</div>
        <h2>Trae 账号${isUpdate ? '凭据已更新' : '添加成功'}！</h2>
        <p>已从浏览器极速同步至 <b>AI Credits Hub</b> 签到中心，每日自动打卡任务已就绪。</p>
        <div class="meta">已绑定账号：<b>${nickname}</b> ${phone ? `<br><span style="font-size:12px;color:#94a3b8;">关联手机: ${phone}</span>` : ''}</div>
        <a href="/#/accounts" class="btn">前往控制台查看</a>
      </div>
    </body>
    </html>
  `);
});

// ==================== 增强版油猴脚本 (v1.4.1 深度融合 ByteDance Passport 与 DOM 穿透) ====================
router.get('/tampermonkey.user.js', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const serverUrl = `${protocol}://${host}`;
  const syncKey = db.getSettings()?.sync_key || 'ai-credits-hub-sync';

  const script = `// ==UserScript==
// @name         AI Credits Hub 网页一键极速同步助手 (Edge兼容增强版)
// @namespace    https://github.com/lhc44/ai-credits-hub
// @version      2.0.0
// @description  极简极速同步 Trae / Qoder / WorkBuddy 账号凭据与手机号至 AI Credits Hub 签到面板！
// @author       Antigravity
// @match        *://*.qoder.cn/*
// @match        *://qoder.cn/*
// @match        *://*.trae.cn/*
// @match        *://trae.cn/*
// @match        *://*.trae.com.cn/*
// @match        *://trae.com.cn/*
// @match        *://*.trae.ai/*
// @match        *://trae.ai/*
// @match        *://*.trae.com/*
// @match        *://trae.com/*
// @match        *://*.passport.trae.cn/*
// @match        *://passport.trae.cn/*
// @match        *://*.passport.trae.ai/*
// @match        *://passport.trae.ai/*
// @match        *://copilot.tencent.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 注册油猴插件菜单项 (即使网页界面遮挡，点击油猴图标也能一键同步)
    try {
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('🚀 立即同步账号到签到面板', function() {
                handleSync();
            });
        }
    } catch(e) {}

    const CONFIG = {
        serverUrl: '${serverUrl}',
        syncKey: '${syncKey}'
    };

    const host = window.location.hostname;
    let platform = host.includes('qoder') ? 'qoder' : (host.includes('trae') ? 'trae' : (host.includes('tencent') ? 'workbuddy' : ''));
    let platformName = platform === 'qoder' ? 'QoderCN' : (platform === 'trae' ? 'Trae CN' : 'WorkBuddy');
    if (!platform) return;

    // 嗅探状态池
    const sniffed = {
        token: '',
        rawAuth: '',
        nickname: '',
        phone: '',
        uid: ''
    };

    // 严谨手机号/掩码识别 (支持明文11位与字节跳动 176******86 / 常规 176****6486 掩码)
    function extractPhone(str) {
        if (!str || typeof str !== 'string') return '';
        str = str.trim();
        const m1 = str.match(/1[3-9]\\d[\\s-]*[*xX•●·＊⁎~_-]{2,8}[\\s-]*\\d{2,4}/);
        if (m1) return m1[0].replace(/[\\s-]/g, '');
        const m2 = str.match(/(?:^|[^\\d])(1[3-9]\\d[\\s-]?\\d{4}[\\s-]?\\d{4})(?:[^\\d]|$)/);
        if (m2) return m2[1].replace(/[\\s-]/g, '');
        const m3 = str.match(/(?:^|[^\\d])(1[3-9]\\d{9})(?:[^\\d]|$)/);
        if (m3) return m3[1];
        return '';
    }

    // JWT 有效性与过期检查 (兼容 padding 与异常处理)
    function isTokenExpired(t) {
        if (!t || typeof t !== 'string') return true;
        try {
            const parts = t.split('.');
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4 !== 0) {
                    base64 += '=';
                }
                const binaryStr = atob(base64);
                let json = '';
                for (let i = 0; i < binaryStr.length; i++) {
                    json += String.fromCharCode(binaryStr.charCodeAt(i));
                }
                const payload = JSON.parse(json);
                if (payload.exp) {
                    return (Date.now() / 1000) >= (payload.exp - 30);
                }
            }
        } catch(e) {}
        return false;
    }

    // 1. 网络嗅探：第一时间捕获 Trae 官方 GetUserInfo 与用户 JWT
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._reqUrl = typeof url === 'string' ? url : (url ? url.toString() : '');
        this.addEventListener('load', function() {
            try {
                if (this._reqUrl && /GetUserInfo/i.test(this._reqUrl)) {
                    const data = JSON.parse(this.responseText);
                    if (data?.Result) {
                        if (data.Result.ScreenName) sniffed.nickname = data.Result.ScreenName;
                        if (data.Result.NonPlainTextMobile) sniffed.phone = data.Result.NonPlainTextMobile;
                        if (data.Result.UserID) sniffed.uid = String(data.Result.UserID);
                    }
                }
            } catch(e) {}
        });
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (/authorization|token|session|jwt/i.test(header) && value) {
            sniffed.rawAuth = value;
            sniffed.token = value.replace(/^Bearer\\s+/i, '').replace(/^Cloud-IDE-JWT\\s+/i, '').trim();
            updateUI();
        }
        return originalSetRequestHeader.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const req = args[0];
            const opts = args[1] || {};
            const headers = opts.headers || (req instanceof Request ? req.headers : {});
            if (headers) {
                let auth = headers instanceof Headers ? headers.get('authorization') : headers['authorization'];
                if (auth && auth.length > 20) {
                    sniffed.rawAuth = auth;
                    sniffed.token = auth.replace(/^Bearer\\s+/i, '').replace(/^Cloud-IDE-JWT\\s+/i, '').trim();
                    updateUI();
                }
            }
        } catch(e) {}

        const res = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            if (/GetUserInfo/i.test(url)) {
                res.clone().json().then(data => {
                    if (data?.Result) {
                        if (data.Result.ScreenName) sniffed.nickname = data.Result.ScreenName;
                        if (data.Result.NonPlainTextMobile) sniffed.phone = data.Result.NonPlainTextMobile;
                        if (data.Result.UserID) sniffed.uid = String(data.Result.UserID);
                    }
                }).catch(()=>{});
            }
        } catch(e) {}
        return res;
    };

    // 监听跨 iframe 凭证传递
    if (window.top === window.self) {
        window.addEventListener('message', function(ev) {
            try {
                if (ev.data && ev.data.type === 'AI_CREDITS_HUB_SNIFFED') {
                    if (ev.data.rawAuth) sniffed.rawAuth = ev.data.rawAuth;
                    if (ev.data.token) sniffed.token = ev.data.token;
                    updateUI();
                }
            } catch(e) {}
        });
    }

    // 2. 本地与 DOM 深度扫描 (全面支持 JSON 对象中的 JWT 嗅探)
    function scanEnv() {
        try {
            if (document.cookie) {
                const cMatch = document.cookie.match(/eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}/);
                if (cMatch && !sniffed.token) sniffed.token = cMatch[0];
            }
        } catch(e) {}
        for (let s of [localStorage, sessionStorage]) {
            try {
                for (let i = 0; i < s.length; i++) {
                    const k = s.key(i);
                    const v = s.getItem(k);
                    if (!v) continue;
                    if (v.includes('pt-')) {
                        const m = v.match(/pt-[a-zA-Z0-9_-]{20,}/);
                        if (m && !sniffed.token) sniffed.token = m[0];
                    }
                    const jwtMatch = v.match(/eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}/);
                    if (jwtMatch) {
                        const cand = jwtMatch[0];
                        if (!isTokenExpired(cand)) {
                            sniffed.token = cand;
                        } else if (!sniffed.token) {
                            sniffed.token = cand;
                        }
                    }
                }
            } catch(e) {}
        }

        try {
            const bodyTxt = document.body ? document.body.innerText : '';
            const patMatch = bodyTxt.match(/pt-[a-zA-Z0-9_-]{20,}/);
            if (patMatch && !sniffed.token) sniffed.token = patMatch[0];

            const jwtMatch = bodyTxt.match(/eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{20,}/);
            if (jwtMatch && !sniffed.token) sniffed.token = jwtMatch[0];

            const p = extractPhone(bodyTxt);
            if (p && !sniffed.phone) sniffed.phone = p;

            const nameMatch = bodyTxt.match(/用户\\d{6,14}/);
            if (nameMatch && !sniffed.nickname) sniffed.nickname = nameMatch[0];
        } catch(e) {}
    }

    // 3. 生成展示名称
    function getSuggestedName(token) {
        if (sniffed.nickname && sniffed.phone) {
            return sniffed.nickname + ' (' + sniffed.phone + ')';
        }
        if (sniffed.nickname) {
            return sniffed.nickname;
        }
        if (sniffed.phone) {
            return platformName + ' (' + sniffed.phone + ')';
        }
        if (token && token.startsWith('pt-')) {
            return 'Qoder_PAT_' + token.slice(3, 9);
        }
        if (sniffed.uid) {
            return platformName + '_' + sniffed.uid.slice(-6);
        }
        return platformName + '_账号';
    }

    // 4. Trae 官方 GetUserInfo 主动查询
    async function fetchTraeUserInfo(token) {
        if (platform !== 'trae') return;
        const auth = sniffed.rawAuth || (token ? ('Cloud-IDE-JWT ' + token) : '');
        try {
            const res = await originalFetch('https://api.trae.cn/cloudide/api/v3/trae/GetUserInfo', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'Authorization': auth },
                body: '{}'
            });
            const data = await res.json();
            if (data?.Result) {
                if (data.Result.ScreenName) sniffed.nickname = data.Result.ScreenName;
                if (data.Result.NonPlainTextMobile) sniffed.phone = data.Result.NonPlainTextMobile;
                if (data.Result.UserID) sniffed.uid = String(data.Result.UserID);
            }
        } catch(e) {}
    }

    // 5. Qoder 提示弹窗
    function showQoderModal() {
        const modal = document.createElement('div');
        modal.id = 'qoder-pat-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;';
        modal.innerHTML = \`
            <div style="background:#1e1e2d;color:#fff;width:420px;max-width:90vw;border-radius:14px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;font-size:16px;color:#60a5fa;">💡 Qoder 机制说明与导入</h3>
                    <span id="qoder-modal-close" style="cursor:pointer;font-size:20px;color:#94a3b8;">&times;</span>
                </div>
                <p style="font-size:13px;line-height:1.5;color:#cbd5e1;margin-bottom:12px;">
                    📌 <strong>Qoder 机制说明</strong>：Qoder 每日免费额度在桌面端客户端登录时由阿里云自动分配生效，网页端未开放每日签到接口。
                </p>
                <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#93c5fd;">
                    如需将账号加入面板集中管理监控，可生成并粘贴 PAT 令牌，系统每日签到任务将自动标记为常驻生效状态。
                </div>
                <input id="qoder-pat-input" placeholder="直接粘贴 pt- 开头的 PAT 令牌" style="width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;border:1px solid #3b82f6;background:#0f172a;color:#fff;font-size:13px;outline:none;margin-bottom:14px;" />
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="qoder-open-url" style="background:#3b82f6;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">打开令牌生成页 ↗</button>
                    <button id="qoder-submit-btn" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">确认导入</button>
                </div>
            </div>
        \`;
        document.body.appendChild(modal);
        document.getElementById('qoder-modal-close').onclick = () => modal.remove();
        document.getElementById('qoder-open-url').onclick = () => {
            modal.remove();
            window.open('https://qoder.cn/account/integrations', '_blank');
        };
        document.getElementById('qoder-submit-btn').onclick = () => {
            const val = document.getElementById('qoder-pat-input').value.trim();
            if (!val.startsWith('pt-')) {
                alert('请输入以 pt- 开头的有效 PAT 令牌');
                return;
            }
            modal.remove();
            handleSync(val);
        };
    }

    // 6. 执行同步
    async function handleSync(forcedToken) {
        scanEnv();
        let token = forcedToken || sniffed.token;

        if (platform === 'trae') {
            await fetchTraeUserInfo(token);
            scanEnv();
            token = token || sniffed.token;
        }

        if (platform === 'trae' && token && isTokenExpired(token)) {
            const shouldReload = confirm('当前 Trae 凭证已超过 8 小时有效期。点击【确定】将为您刷新网页重新激活最新凭证！');
            if (shouldReload) {
                window.location.reload();
                return;
            }
        }

        if (!token) {
            if (platform === 'qoder') {
                showQoderModal();
            } else {
                const manual = prompt('当前网页未自动捕获到凭据。如果您刚登录，请按 F5 刷新网页后再试；或直接在此粘贴 Cloud-IDE-JWT Token：');
                if (manual && manual.trim()) {
                    const cleanTok = manual.trim().replace(/^Bearer\\s+/i, '').replace(/^Cloud-IDE-JWT\\s+/i, '');
                    handleSync(cleanTok);
                }
            }
            return;
        }

        const suggested = getSuggestedName(token);
        const userCustomNick = prompt('请确认在签到面板显示的名称 (可直接修改)：', suggested);
        if (userCustomNick === null) return;

        const finalNickname = (userCustomNick.trim() || suggested);
        sendToServer(token, finalNickname);
    }

    // 7. 发送至 AI Credits Hub
    function sendToServer(token, nickname) {
        if (floatingBtn) floatingBtn.innerText = '⏳ 正在同步...';
        GM_xmlhttpRequest({
            method: 'POST',
            url: CONFIG.serverUrl + '/api/oauth/import-web',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                platform,
                nickname,
                accessToken: token,
                refreshToken: '',
                extraData: {
                    uid: sniffed.uid || '',
                    phone: sniffed.phone || extractPhone(nickname) || '',
                    scrapedNickname: sniffed.nickname || ''
                },
                syncKey: CONFIG.syncKey
            }),
            onload: function(r) {
                try {
                    const res = JSON.parse(r.responseText);
                    if (res.code === 0) {
                        if (floatingBtn) {
                            floatingBtn.innerHTML = '✅ 账号同步成功！';
                            floatingBtn.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                        }
                        alert('🎉 恭喜！账号「' + (res.data?.nickname || nickname) + '」已成功同步到 AI Credits Hub！');
                    } else {
                        alert('❌ 同步失败: ' + res.message);
                    }
                } catch(e) {
                    alert('❌ 解析服务响应失败: ' + r.responseText);
                }
            },
            onerror: function() {
                alert('❌ 无法连接到 AI Credits Hub 服务端 (' + CONFIG.serverUrl + ')，请检查网络。');
            }
        });
    }

    // 8. 悬浮按钮 UI (采用高优先级挂载与周期自愈机制，防止 SPA 路由销毁)
    let floatingBtn = null;
    function updateUI() {
        if (!floatingBtn) return;
        scanEnv();
        if (sniffed.token && !isTokenExpired(sniffed.token)) {
            floatingBtn.innerHTML = '✨ 已捕获凭据！点击一键同步';
            floatingBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else {
            floatingBtn.innerHTML = '🚀 同步账号到签到面板';
            floatingBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    }

    function initUI() {
        if (window.top !== window.self) return;
        const root = document.body;
        if (!root) return;
        let btn = document.getElementById('ai-credits-hub-btn');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'ai-credits-hub-btn';
            btn.innerText = '🚀 同步账号到签到面板';
            btn.title = '点击一键同步到签到面板 (快捷键: Ctrl + Shift + S)';
            btn.style.cssText = 'position:fixed !important;bottom:30px !important;right:30px !important;z-index:2147483647 !important;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%) !important;color:#ffffff !important;padding:12px 20px !important;border-radius:30px !important;font-size:13.5px !important;font-weight:700 !important;cursor:pointer !important;box-shadow:0 6px 20px rgba(102,126,234,0.6) !important;user-select:none !important;display:flex !important;align-items:center !important;gap:8px !important;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif !important;pointer-events:auto !important;border:2px solid rgba(255,255,255,0.4) !important;visibility:visible !important;opacity:1 !important;';
            btn.onclick = () => handleSync();
            root.appendChild(btn);
            floatingBtn = btn;
        } else if (btn.parentElement !== root) {
            root.appendChild(btn);
            floatingBtn = btn;
        } else {
            floatingBtn = btn;
        }
        updateUI();
    }

    // 全局热键支持：Ctrl + Shift + S 强制唤醒同步
    window.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault();
            handleSync();
        }
    }, true);

    // 周期检测自愈：在 SPA 路由切换时如按钮被移除立即重建
    setInterval(() => {
        initUI();
    }, 1000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(script);
});

module.exports = router;
