const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ============ 配置 ============
// 使用 Vercel 环境变量（推荐）或在此处直接填写
const CONFIG = {
  token: process.env.WECHAT_TOKEN || '',
  appId: process.env.WECHAT_APPID || '',
  appSecret: process.env.WECHAT_APPSECRET || '',
};
// =================================

/**
 * Vercel Serverless Function 入口
 * GET  → 微信服务器验证
 * POST → 接收用户消息并回复
 */
module.exports = async (req, res) => {
  try {
    const method = req.method;

    // ========== GET 请求（微信服务器验证） ==========
    if (method === 'GET') {
      const { signature, timestamp, nonce, echostr } = req.query;
      if (checkSignature(signature, timestamp, nonce)) {
        return res.status(200).send(echostr);
      }
      return res.status(403).send('验证失败');
    }

    // ========== POST 请求（接收用户消息） ==========
    if (method === 'POST') {
      const body = await getRawBody(req);
      console.log('收到消息:', body);

      const msg = parseSimpleXml(body);
      if (!msg || !msg.MsgType) {
        return res.status(200).send('success');
      }

      const msgType = msg.MsgType;
      const fromUser = msg.FromUserName;
      const toUser = msg.ToUserName;

      console.log('消息类型:', msgType, '来自:', fromUser);

      // ---------- 处理图片消息 ----------
      if (msgType === 'image') {
        const picUrl = msg.PicUrl;
        console.log('收到图片:', picUrl);

        const imageData = await downloadImage(picUrl);
        if (!imageData) {
          console.error('下载图片失败');
          return sendTextMsg(res, fromUser, toUser, '抱歉，图片下载失败，请稍后再试~');
        }

        const mediaId = await uploadImageToWechat(imageData);
        if (!mediaId) {
          console.error('上传素材失败');
          return sendTextMsg(res, fromUser, toUser, '抱歉，图片处理失败，请稍后再试~');
        }

        console.log('回复图片，MediaId:', mediaId);
        return sendImageMsg(res, fromUser, toUser, mediaId);
      }

      // ---------- 处理文本消息 ----------
      if (msgType === 'text') {
        return sendTextMsg(res, fromUser, toUser,
          '请直接发送表情包或图片给我，我会自动转成可保存的图片回复给你哦~ 😊');
      }

      // ---------- 其他消息类型 ----------
      return sendTextMsg(res, fromUser, toUser,
        '请发送表情包或图片，我会帮你转成可保存的格式~');
    }

    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    console.error('处理请求出错:', err);
    return res.status(500).send('Internal Server Error');
  }
};

// ============================================================
//  获取请求原始 body
// ============================================================

function getRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

// ============================================================
//  简易 XML 解析（不依赖第三方库）
// ============================================================

function parseSimpleXml(xml) {
  try {
    const result = {};
    const regex = /<(\w+)>[\s\S]*?(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))[\s\S]*?<\/\1>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const key = match[1];
      const value = match[2] !== undefined ? match[2] : match[3];
      result[key] = value.trim();
    }
    return result;
  } catch (err) {
    console.error('解析 XML 失败:', err);
    return null;
  }
}

// ============================================================
//  签名验证
// ============================================================

function checkSignature(signature, timestamp, nonce) {
  const arr = [CONFIG.token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
}

// ============================================================
//  下载图片
// ============================================================

function downloadImage(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log('跟随重定向:', res.headers.location);
        downloadImage(res.headers.location).then(resolve);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log('图片下载成功，大小:', buffer.length, 'bytes，类型:', res.headers['content-type']);
        resolve({
          buffer: buffer,
          contentType: res.headers['content-type'] || 'image/jpeg',
        });
      });
      res.on('error', (err) => {
        console.error('下载图片错误:', err);
        resolve(null);
      });
    }).on('error', (err) => {
      console.error('下载图片请求失败:', err);
      resolve(null);
    });
  });
}

// ============================================================
//  获取微信 Access Token
// ============================================================

function getAccessToken() {
  return new Promise((resolve) => {
    const url =
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.appId}&secret=${CONFIG.appSecret}`;
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.access_token) {
            console.log('获取 Access Token 成功');
            resolve(data.access_token);
          } else {
            console.error('获取 Access Token 失败:', JSON.stringify(data));
            resolve(null);
          }
        } catch (e) {
          console.error('解析 Access Token 响应失败:', e);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error('获取 Access Token 请求失败:', err);
      resolve(null);
    });
  });
}

// ============================================================
//  上传图片到微信临时素材
// ============================================================

async function uploadImageToWechat(imageData) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');

    let ext = 'jpg';
    const ct = imageData.contentType || 'image/jpeg';
    if (ct.includes('gif')) ext = 'gif';
    else if (ct.includes('png')) ext = 'png';
    else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';

    const fileName = `image.${ext}`;

    const headerStr =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n` +
      `Content-Type: ${ct}\r\n\r\n`;
    const header = Buffer.from(headerStr);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, imageData.buffer, footer]);

    const options = {
      hostname: 'api.weixin.qq.com',
      path: `/cgi-bin/media/upload?access_token=${accessToken}&type=image`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString());
          console.log('上传素材响应:', JSON.stringify(result));
          if (result.media_id) {
            resolve(result.media_id);
          } else {
            console.error('上传素材失败:', JSON.stringify(result));
            resolve(null);
          }
        } catch (e) {
          console.error('解析上传响应失败:', e);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('上传素材请求失败:', err);
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

// ============================================================
//  构建微信回复消息
// ============================================================

function sendTextMsg(res, fromUser, toUser, content) {
  const xml =
    `<xml>\n` +
    `  <ToUserName><![CDATA[${fromUser}]]></ToUserName>\n` +
    `  <FromUserName><![CDATA[${toUser}]]></FromUserName>\n` +
    `  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>\n` +
    `  <MsgType><![CDATA[text]]></MsgType>\n` +
    `  <Content><![CDATA[${content}]]></Content>\n` +
    `</xml>`;
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  return res.status(200).send(xml);
}

function sendImageMsg(res, fromUser, toUser, mediaId) {
  const xml =
    `<xml>\n` +
    `  <ToUserName><![CDATA[${fromUser}]]></ToUserName>\n` +
    `  <FromUserName><![CDATA[${toUser}]]></FromUserName>\n` +
    `  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>\n` +
    `  <MsgType><![CDATA[image]]></MsgType>\n` +
    `  <Image>\n` +
    `    <MediaId><![CDATA[${mediaId}]]></MediaId>\n` +
    `  </Image>\n` +
    `</xml>`;
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  return res.status(200).send(xml);
}