# 咕咕滴真实社交平台 - 部署指南

## 目标
将本项目部署到 Render 免费云平台，获得永久固定网址。

## 准备工作

### 1. 注册账号
- [GitHub](https://github.com) - 代码托管
- [Render](https://render.com) - 云平台（支持 GitHub 直接登录）

### 2. 安装 Git
- Windows: 下载 [Git for Windows](https://git-scm.com/download/win)
- 安装时保持默认选项即可

## 部署步骤

### 步骤 1：创建 GitHub 仓库
1. 登录 GitHub
2. 点击右上角 `+` -> `New repository`
3. 仓库名：`gugudi-real-social`
4. 选择 `Public`（公开）
5. 点击 `Create repository`

### 步骤 2：推送代码到 GitHub
在本地项目文件夹中打开命令行，执行：

```bash
# 初始化 Git 仓库
git init

# 添加所有文件
git add .

# 提交代码
git commit -m "initial commit"

# 关联远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/gugudi-real-social.git

# 推送代码
git push -u origin main
```

### 步骤 3：在 Render 上部署
1. 登录 [Render](https://render.com)（用 GitHub 账号登录）
2. 点击 `New` -> `Blueprint`
3. 选择你的 GitHub 仓库 `gugudi-real-social`
4. Render 会自动读取 `render.yaml` 配置
5. 点击 `Apply`
6. 等待部署完成（约 2-5 分钟）

### 步骤 4：获取永久网址
部署完成后，Render 会分配一个固定域名：
```
https://gugudi-real-social.onrender.com
```

这个域名是**永久固定**的，只要你的 Render 服务在运行，就可以一直访问。

## 注意事项

### 数据持久化
Render 免费套餐的磁盘是临时的：
- **15 分钟无访问会休眠**（首次访问需要 30 秒唤醒）
- **重新部署后数据会重置**
- 如果数据很重要，建议升级到付费套餐（$7/月）或使用外部数据库

### 自定义域名（可选）
如果你有域名，可以在 Render 控制台绑定自定义域名：
1. 进入 Render 控制台 -> 你的服务 -> Settings
2. 找到 `Custom Domains`
3. 添加你的域名
4. 按照提示配置 DNS

### 休眠问题
免费套餐 15 分钟无访问会自动休眠。可以通过以下方式避免：
- 使用 [UptimeRobot](https://uptimerobot.com) 免费版，每 5 分钟 ping 一次你的网址
- 升级到 Render 付费套餐（$7/月），永不休眠

## 项目已做的适配

- `render.yaml` - Render Blueprint 配置文件
- `package.json` - 添加了 `postinstall` 自动构建脚本
- `server/index.js` - CORS 已添加 `.onrender.com` 域名支持
- `.gitignore` - 忽略 node_modules 和 dist 目录
