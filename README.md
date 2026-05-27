# 公众号图片回复

将微信表情包自动转成可保存的图片回复给用户。

## 功能说明

微信中收到的表情包无法直接保存到本地，本项目通过公众号实现：
1. 用户将表情包/图片转发给公众号
2. 公众号自动将同一张图以**图片消息**回复给用户
3. 用户收到图片消息后可以**长按保存**

## 费用：0 元

- 个人订阅号：免费
- Vercel 云函数：免费额度（100GB/月）完全够个人使用

## 部署到 Vercel（共 4 步，约 5 分钟）

### 第 1 步：获取公众号配置信息

登录 **微信公众平台**（https://mp.weixin.qq.com）：

1. 左侧菜单「设置与开发」→「开发接口管理」（会跳转到 https://developers.weixin.qq.com）
2. 在新页面中找到 **AppID** 和 **AppSecret**（AppSecret 可能需要点击「重置」或「查看」，需管理员扫码）
3. 记下这两个值

### 第 2 步：注册 Vercel 账号

1. 打开 https://vercel.com
2. 点击右上角「Log In」
3. 用 GitHub 账号登录（没有 GitHub 账号就先注册一个，免费）

### 第 3 步：创建项目并部署

#### 方式 A：拖拽上传（最简单）

1. 把本项目文件夹中的 `api/index.js` 和 `package.json` 两个文件放在一个新文件夹中
2. 打开 https://vercel.com/new，点「Import Third-Party Template」或「Continue Without Template」
3. 选择「Upload」，把整个文件夹拖进去
4. 点击「Deploy」

#### 方式 B：通过 GitHub（推荐，方便后续修改）

1. 在 GitHub 上创建一个新仓库（如 `wechat-img-reply`）
2. 把本项目的 `api/index.js` 和 `package.json` 推送到这个仓库
3. 在 Vercel 中点「Import Git Repository」，选择刚才的仓库
4. 点击「Deploy」

### 第 4 步：设置环境变量

部署完成后：

1. 进入项目 → 点击「Settings」→「Environment Variables」
2. 添加以下三个变量：

| Name | Value |
|------|-------|
| `WECHAT_TOKEN` | 你自定义的 Token（随便填一个字符串，如 `mytoken123`） |
| `WECHAT_APPID` | 你的公众号 AppID |
| `WECHAT_APPSECRET` | 你的公众号 AppSecret |

3. 添加后点击「Deployments」→ 找到最新的一条 → 点右侧三个点 →「Redeploy」

部署成功后，Vercel 会给你一个域名，类似：
```
https://wechat-img-reply-xxx.vercel.app
```

记下这个地址。

### 第 5 步：配置公众号服务器

在新开发者平台上（https://developers.weixin.qq.com）：

1. 找到**服务器配置**（可能在「基本信息」页面，或左侧菜单中找「消息」「接收消息」相关选项）
2. 填写：
   - **URL**：填入 Vercel 给你的域名地址
   - **Token**：和第 4 步环境变量中的 `WECHAT_TOKEN` 保持一致
3. 点击「提交」→「启用」

### 第 6 步：测试

用另一个微信号给你的公众号发送一个表情包，应该会收到同一张图片的回复。

## 项目结构

```
公众号图片回复/
├── api/
│   └── index.js     ← 云函数代码
├── package.json     ← 项目配置
└── README.md        ← 说明文档
```

## 查看日志

1. 在 Vercel 项目页面点击「Logs」标签
2. 可以看到所有请求日志（完全免费）
3. 每次用户发送消息都会在这里记录

## 常见问题

### Q: 配置服务器 URL 时提示验证失败？
- 检查环境变量 `WECHAT_TOKEN` 是否已设置并已重新部署
- 确认 URL 末尾没有多余的 `/` 或空格
- 试试在浏览器中访问 `https://你的域名.vercel.app/?echostr=123456&timestamp=123456&nonce=abc&signature=xxx`，看是否有响应

### Q: 发送图片后没有收到回复？
- 在 Vercel「Logs」中查看是否有请求记录
- 检查 `WECHAT_APPID` 和 `WECHAT_APPSECRET` 是否正确
- 确认公众号服务器配置已「启用」

### Q: Access Token 获取失败？
- AppSecret 可能过期，去开发者平台重置后更新环境变量
- 个人订阅号的权限有限，确认已开通「接收消息」功能

### Q: 表情包（GIF 动图）发回来是静态图？
- 微信公众号图片消息不支持发送 GIF 动图的动态效果
- 这是微信平台的限制，无法绕过

## 技术原理

```
用户发送表情/图片
       ↓
微信服务器 POST 请求到 Vercel 云函数
       ↓
云函数下载图片到内存
       ↓
云函数调用微信素材接口上传图片，获取 media_id
       ↓
云函数返回图片消息 XML
       ↓
微信服务器将图片消息发送给用户
       ↓
用户收到图片，可以长按保存
```

## 费用说明

| 项目 | 费用 |
|------|------|
| 微信公众号（个人订阅号） | 免费 |
| Vercel 免费额度 | 每月 100GB 流量 |
| Vercel 日志 | 免费 |
| **总计** | **0 元** |