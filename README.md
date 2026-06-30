# 咕咕滴真实社交平台

这是把原来的静态演示页面升级成的真实全栈社交平台。

## 已实现

- 真实注册与登录：手机号 + 密码
- 密码加密保存：使用 `bcryptjs`
- 登录态保护：使用 `JWT`
- 真实持久化数据：写入 `server/gugudi.db.json`
- 社交广场：发布动态、图片动态、点赞、评论
- 站内邮件：注册欢迎信、认证申请通知
- 官方公告：后端读取
- 科技感前端：深色玻璃拟态、霓虹渐变、移动端优先布局

## 启动方式

1. 安装依赖：

```bash
npm run install:all
```

2. 开发模式启动：

```bash
npm run dev
```

3. 打开前端：

```text
http://localhost:5173
```

4. 后端接口：

```text
http://localhost:4000/api/health
```

## 生产构建

```bash
npm run build
npm run start
```

构建后由后端服务托管前端页面，访问：

```text
http://localhost:4000
```

## 重要说明

当前版本已经是真实账号系统，但短信验证码、短视频上传、真实直播还需要接入第三方服务：

- 短信验证码：阿里云短信、腾讯云短信、Twilio 等
- 图片/视频存储：S3、COS、OSS、R2 等对象存储
- 直播：WebRTC 信令服务器、TURN 服务、媒体服务器
- 线上部署：云服务器、数据库、HTTPS、域名

如果要上线公网，请修改 `server/.env.example` 中的 `JWT_SECRET` 并配置真实环境变量。
