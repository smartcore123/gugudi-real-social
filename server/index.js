import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = Number(process.env.PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'gugudi-local-dev-secret-change-before-production'
const DB_PATH = process.env.GUGUDI_DB_PATH || path.join(__dirname, 'gugudi.db.json')
const PROJECT_ROOT = path.resolve(__dirname, '..')
const CODE_BACKUP_DIR = path.join(PROJECT_ROOT, '.code-backups')
const AUDIT_PATH = process.env.GUGUDI_AUDIT_PATH || path.join(__dirname, 'audit.log')
const OPEN_API_KEYS = String(process.env.OPEN_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean)
const loginAttempts = new Map()

function isAllowedOrigin(origin) {
  if (!origin) return true
  try {
    const url = new URL(origin)
    const host = url.hostname
    return (
      ['localhost', '127.0.0.1'].includes(host) ||
      host.endsWith('.loca.lt') ||
      host.endsWith('.onrender.com') ||
      host.endsWith('.vercel.app') ||
      host.endsWith('.railway.app')
    )
  } catch {
    return false
  }
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin) ? origin || true : false)
  },
  credentials: true
}))
app.use(express.json({ limit: '200mb' }))
app.use(express.urlencoded({ limit: '200mb', extended: true }))
app.use((req, res, next) => {
  req.requestId = nanoid()
  res.setHeader('X-Request-Id', req.requestId)
  res.removeHeader('X-Powered-By')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://*.loca.lt http://localhost:4000 http://127.0.0.1:4000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )
  next()
})

function seedDb() {
  return {
    users: [],
    posts: [
      {
        id: nanoid(),
        userId: 'system',
        nick: '咕咕滴官方',
        content: '真实社交平台版本已上线：注册、登录、发动态、点赞、评论都会持久化保存。',
        image: '',
        createdAt: Date.now() - 1000 * 60 * 8
      }
    ],
    likes: [],
    comments: [],
    mails: [],
    certApplications: [],
    notices: [
      {
        id: nanoid(),
        title: '真实登录系统上线',
        content: '账号密码会加密保存，登录后由 JWT Token 保护个人接口。',
        createdAt: Date.now() - 1000 * 60 * 60
      },
      {
        id: nanoid(),
        title: '社交数据持久化',
        content: '动态、点赞、评论、站内信会写入本地数据库文件，重启服务后仍然存在。',
        createdAt: Date.now() - 1000 * 60 * 60 * 3
      }
    ],
    games: []
  }
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seedDb(), null, 2), 'utf8')
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  db.users ||= []
  db.posts ||= []
  db.likes ||= []
  db.comments ||= []
  db.mails ||= []
  db.certApplications ||= []
  db.notices ||= []
  db.videos ||= []
  db.videoLikes ||= []
  db.videoComments ||= []
  db.aiNovels ||= []
  db.aiAnimations ||= []
  db.aiRuns ||= []
  db.openEvents ||= []
  db.games ||= []
  db.platformSettings ||= {
    siteName: '咕咕滴',
    registrationOpen: true,
    maintenanceMode: false,
    contentReviewMode: false,
    publicApiReadEnabled: true,
    publicApiWriteEnabled: false
  }
  return db
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    phone: user.phone,
    nick: user.nick,
    bio: user.bio || '',
    isCert: Boolean(user.isCert),
    isAdmin: Boolean(user.isAdmin),
    status: user.status || 'active',
    createdAt: user.createdAt
  }
}

function audit(action, req, detail = {}) {
  const record = {
    id: nanoid(),
    time: new Date().toISOString(),
    action,
    requestId: req.requestId,
    userId: req.user?.id || '',
    ip: req.ip,
    detail
  }
  fs.appendFileSync(AUDIT_PATH, JSON.stringify(record) + '\n', 'utf8')
}

function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ message: '请先登录' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const db = readDb()
    const user = db.users.find(u => u.id === payload.id)
    if (!user) return res.status(401).json({ message: '登录已失效' })
    if ((user.status || 'active') === 'suspended') return res.status(403).json({ message: '账号已被限制' })
    req.user = user
    next()
  } catch {
    res.status(401).json({ message: '登录已失效，请重新登录' })
  }
}

function adminOnly(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ message: '仅限官方管理员操作' })
  next()
}

function requireText(value, field, min = 1, max = 500) {
  const text = String(value || '').trim()
  if (text.length < min) throw new Error(`${field}不能为空`)
  if (text.length > max) throw new Error(`${field}不能超过${max}个字符`)
  return text
}

function contentGuard(text, field = '内容') {
  const blocked = ['诈骗', '涉黄', '赌博', '病毒', '盗号']
  const hit = blocked.find(word => text.includes(word))
  if (hit) throw new Error(`${field}包含违规词：${hit}`)
  const lower = text.toLowerCase()
  const attackPatterns = ['<script', 'javascript:', 'onerror=', 'onload=', '<iframe', '<object', '<embed']
  const attack = attackPatterns.find(word => lower.includes(word))
  if (attack) throw new Error(`${field}包含不安全脚本内容`)
  return text
}

function loginRateLimit(req, phone) {
  const now = Date.now()
  const key = `${req.ip}:${phone}`
  const state = loginAttempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 }
  if (state.lockedUntil > now) {
    const seconds = Math.ceil((state.lockedUntil - now) / 1000)
    const err = new Error(`登录错误次数过多，请 ${seconds} 秒后再试`)
    err.status = 429
    throw err
  }
  if (now - state.firstAt > 15 * 60 * 1000) {
    state.count = 0
    state.firstAt = now
    state.lockedUntil = 0
  }
  return { key, state }
}

function recordLoginFailure(key, state) {
  state.count += 1
  if (state.count >= 5) state.lockedUntil = Date.now() + 10 * 60 * 1000
  loginAttempts.set(key, state)
}

function openApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey
  if (!OPEN_API_KEYS.length || !OPEN_API_KEYS.includes(String(key || ''))) {
    return res.status(401).json({ message: '开放 API 密钥无效' })
  }
  next()
}

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md',
  '.env', '.example', '.yml', '.yaml', '.txt', '.ps1', '.cmd'
])

const CODE_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.code-backups', '.cache'
])

function normalizeProjectPath(inputPath = '') {
  const clean = String(inputPath || '').replaceAll('\\', '/').replace(/^\/+/, '')
  const absolute = path.resolve(PROJECT_ROOT, clean)
  if (!absolute.startsWith(PROJECT_ROOT)) {
    throw new Error('非法路径，禁止访问项目目录外文件')
  }
  return { clean, absolute }
}

function isCodeFile(filePath) {
  const base = path.basename(filePath)
  const ext = path.extname(filePath)
  return CODE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(base) || base.includes('.env')
}

function listCodeFiles(dir = PROJECT_ROOT, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
    const abs = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (CODE_SKIP_DIRS.has(entry.name)) continue
      files.push(...listCodeFiles(abs, rel))
    } else if (entry.isFile() && isCodeFile(abs)) {
      const stat = fs.statSync(abs)
      if (stat.size <= 1024 * 1024) {
        files.push({
          path: rel.replaceAll('\\', '/'),
          name: entry.name,
          size: stat.size,
          updatedAt: stat.mtimeMs
        })
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: '咕咕滴真实社交平台', time: Date.now() })
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const phone = requireText(req.body.phone, '手机号', 11, 11)
    const nick = requireText(req.body.nick, '昵称', 2, 20)
    const password = requireText(req.body.password, '密码', 6, 64)

    if (!/^1\d{10}$/.test(phone)) return res.status(400).json({ message: '请输入正确的中国大陆手机号' })

    const db = readDb()
    if (db.platformSettings?.maintenanceMode) return res.status(503).json({ message: '平台维护中' })
    if (db.platformSettings?.registrationOpen === false) return res.status(403).json({ message: '平台暂未开放注册' })
    if (db.users.some(u => u.phone === phone)) return res.status(409).json({ message: '该手机号已注册' })

    const isFirst = db.users.length === 0
    const user = {
      id: nanoid(),
      phone,
      nick,
      passwordHash: await bcrypt.hash(password, 12),
      bio: '',
      isCert: false,
      isAdmin: isFirst,
      createdAt: Date.now()
    }
    db.users.push(user)

    if (isFirst) {
      db.mails.push({
        id: nanoid(),
        userId: user.id,
        title: '恭喜！你是官方管理员',
        content: '你是第一个注册的用户，已自动获得官方管理员权限。你可以发布公告、审核认证、管理用户和动态。',
        createdAt: Date.now()
      })
      db.notices.push({
        id: nanoid(),
        title: '官方管理员已就位',
        content: `平台管理员「${user.nick}」已上线，将为大家提供更好的服务。`,
        createdAt: Date.now()
      })
    } else {
      db.mails.push({
        id: nanoid(),
        userId: user.id,
        title: '欢迎加入咕咕滴',
        content: '你的真实账号已创建成功。现在可以发布动态、点赞、评论和申请认证。',
        createdAt: Date.now()
      })
    }
    writeDb(db)
    audit('auth.register', { ...req, user }, { phone, userId: user.id })

    res.status(201).json({ token: signToken(user), user: publicUser(user) })
  } catch (err) {
    res.status(400).json({ message: err.message || '注册失败' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const phone = requireText(req.body.phone, '手机号', 11, 11)
    const password = requireText(req.body.password, '密码', 1, 64)
    const rate = loginRateLimit(req, phone)
    const db = readDb()
    if (db.platformSettings?.maintenanceMode) return res.status(503).json({ message: '平台维护中' })
    const user = db.users.find(u => u.phone === phone)
    if (!user) {
      recordLoginFailure(rate.key, rate.state)
      return res.status(401).json({ message: '手机号或密码错误' })
    }
    if ((user.status || 'active') === 'suspended') return res.status(403).json({ message: '账号已被限制登录' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      recordLoginFailure(rate.key, rate.state)
      return res.status(401).json({ message: '手机号或密码错误' })
    }
    loginAttempts.delete(rate.key)
    audit('auth.login', { ...req, user }, { phone, userId: user.id })
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || '登录失败' })
  }
})

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

app.put('/api/me/profile', auth, (req, res) => {
  try {
    const nick = requireText(req.body.nick || req.user.nick, '昵称', 2, 20)
    const bio = String(req.body.bio || '').trim().slice(0, 160)
    const db = readDb()
    const user = db.users.find(u => u.id === req.user.id)
    user.nick = nick
    user.bio = bio
    writeDb(db)
    audit('profile.update', req, { nick })
    res.json({ user: publicUser(user), message: '个人资料已更新' })
  } catch (err) {
    res.status(400).json({ message: err.message || '更新资料失败' })
  }
})

app.get('/api/platform/status', (req, res) => {
  const db = readDb()
  res.json({
    name: db.platformSettings?.siteName || '咕咕滴',
    settings: db.platformSettings,
    counters: {
      users: db.users.length,
      posts: db.posts.length,
      comments: db.comments.length,
      notices: db.notices.length,
      aiNovels: db.aiNovels.length,
      aiAnimations: db.aiAnimations.length
    },
    time: Date.now()
  })
})

app.get('/api/posts', (req, res) => {
  const db = readDb()
  const posts = db.posts
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(post => {
      const author = db.users.find(u => u.id === post.userId)
      return {
        ...post,
        nick: post.nick || author?.nick || '普通用户',
        isAdmin: Boolean(author?.isAdmin),
        isCert: Boolean(author?.isCert || post.userId === 'system'),
        likes: db.likes.filter(l => l.postId === post.id).length,
        comments: db.comments.filter(c => c.postId === post.id).length
      }
    })
  res.json({ posts })
})

app.post('/api/posts', auth, (req, res) => {
  try {
    const content = contentGuard(requireText(req.body.content, '动态内容', 1, 1000), '动态内容')
    const image = String(req.body.image || '')
    const db = readDb()
    const post = {
      id: nanoid(),
      userId: req.user.id,
      nick: req.user.nick,
      content,
      image,
      createdAt: Date.now()
    }
    db.posts.push(post)
    writeDb(db)
    audit('post.create', req, { postId: post.id })
    res.status(201).json({ post })
  } catch (err) {
    res.status(400).json({ message: err.message || '发布失败' })
  }
})

app.delete('/api/posts/:id', auth, adminOnly, (req, res) => {
  const db = readDb()
  const index = db.posts.findIndex(p => p.id === req.params.id)
  if (index < 0) return res.status(404).json({ message: '动态不存在' })
  db.posts.splice(index, 1)
  db.likes = db.likes.filter(l => l.postId !== req.params.id)
  db.comments = db.comments.filter(c => c.postId !== req.params.id)
  writeDb(db)
  audit('post.delete', req, { postId: req.params.id })
  res.json({ message: '动态已删除' })
})

app.post('/api/posts/:id/like', auth, (req, res) => {
  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id)
  if (!post) return res.status(404).json({ message: '动态不存在' })

  const index = db.likes.findIndex(l => l.postId === req.params.id && l.userId === req.user.id)
  let liked = false
  if (index >= 0) {
    db.likes.splice(index, 1)
  } else {
    db.likes.push({ id: nanoid(), postId: req.params.id, userId: req.user.id, createdAt: Date.now() })
    liked = true
  }
  writeDb(db)
  res.json({ liked, likes: db.likes.filter(l => l.postId === req.params.id).length })
})

app.get('/api/posts/:id/comments', (req, res) => {
  const db = readDb()
  const comments = db.comments
    .filter(c => c.postId === req.params.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(c => ({ ...c, nick: db.users.find(u => u.id === c.userId)?.nick || '用户' }))
  res.json({ comments })
})

app.post('/api/posts/:id/comments', auth, (req, res) => {
  try {
    const content = contentGuard(requireText(req.body.content, '评论内容', 1, 300), '评论内容')
    const db = readDb()
    const post = db.posts.find(p => p.id === req.params.id)
    if (!post) return res.status(404).json({ message: '动态不存在' })
    const comment = {
      id: nanoid(),
      postId: req.params.id,
      userId: req.user.id,
      nick: req.user.nick,
      content,
      createdAt: Date.now()
    }
    db.comments.push(comment)
    writeDb(db)
    audit('comment.create', req, { postId: req.params.id, commentId: comment.id })
    res.status(201).json({ comment })
  } catch (err) {
    res.status(400).json({ message: err.message || '评论失败' })
  }
})

app.get('/api/notices', (req, res) => {
  const db = readDb()
  res.json({ notices: db.notices.slice().sort((a, b) => b.createdAt - a.createdAt) })
})

function enrichVideo(db, video) {
  const author = db.users.find(u => u.id === video.userId)
  const rawVideoUrl = String(video.videoUrl || '')
  const rawCover = String(video.cover || '')
  const videoUrl = rawVideoUrl.startsWith('data:') ? `/api/shorts/videos/${video.id}/media` : rawVideoUrl
  const cover = rawCover.startsWith('data:') && rawCover.length > 1024 * 1024 ? '' : rawCover
  return {
    ...video,
    videoUrl,
    cover,
    nick: video.nick || author?.nick || '咕咕滴用户',
    isAdmin: Boolean(author?.isAdmin),
    isCert: Boolean(author?.isCert),
    likes: db.videoLikes.filter(l => l.videoId === video.id).length,
    comments: db.videoComments.filter(c => c.videoId === video.id).length
  }
}

app.get('/api/shorts/feed', (req, res) => {
  const db = readDb()
  const videos = db.videos
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(v => enrichVideo(db, v))
  res.json({ videos })
})

app.get('/api/shorts/videos/:id/media', (req, res) => {
  const db = readDb()
  const video = db.videos.find(v => v.id === req.params.id)
  if (!video) return res.status(404).send('视频不存在')
  const raw = String(video.videoUrl || '')
  if (!raw.startsWith('data:')) return res.redirect(raw)
  const match = raw.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return res.status(400).send('视频格式无效')
  const buffer = Buffer.from(match[2], 'base64')
  res.setHeader('Content-Type', match[1])
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(buffer)
})

app.post('/api/shorts/videos', auth, (req, res) => {
  try {
    const title = contentGuard(requireText(req.body.title, '短视频标题', 1, 80), '短视频标题')
    const description = contentGuard(requireText(req.body.description || title, '短视频描述', 1, 500), '短视频描述')
    const videoUrl = String(req.body.videoUrl || '').trim()
    const cover = String(req.body.cover || '').trim()
    if (!videoUrl) return res.status(400).json({ message: '请上传视频文件或填写视频链接' })
    if (videoUrl.length > 9 * 1024 * 1024) return res.status(413).json({ message: '视频太大，请上传 8MB 以内文件或填写视频链接' })
    const db = readDb()
    const video = {
      id: nanoid(),
      userId: req.user.id,
      nick: req.user.nick,
      title,
      description,
      videoUrl,
      cover,
      createdAt: Date.now()
    }
    db.videos.push(video)
    writeDb(db)
    audit('video.create', req, { videoId: video.id })
    res.status(201).json({ video: enrichVideo(db, video) })
  } catch (err) {
    res.status(400).json({ message: err.message || '发布短视频失败' })
  }
})

app.post('/api/shorts/videos/:id/like', auth, (req, res) => {
  const db = readDb()
  if (!db.videos.some(v => v.id === req.params.id)) return res.status(404).json({ message: '短视频不存在' })
  const index = db.videoLikes.findIndex(l => l.videoId === req.params.id && l.userId === req.user.id)
  let liked = false
  if (index >= 0) db.videoLikes.splice(index, 1)
  else {
    db.videoLikes.push({ id: nanoid(), videoId: req.params.id, userId: req.user.id, createdAt: Date.now() })
    liked = true
  }
  writeDb(db)
  res.json({ liked, likes: db.videoLikes.filter(l => l.videoId === req.params.id).length })
})

app.post('/api/notices', auth, adminOnly, (req, res) => {
  try {
    const title = requireText(req.body.title, '公告标题', 2, 100)
    const content = requireText(req.body.content, '公告内容', 2, 2000)
    const db = readDb()
    const notice = {
      id: nanoid(),
      title,
      content,
      createdAt: Date.now()
    }
    db.notices.push(notice)
    writeDb(db)
    audit('notice.create', req, { noticeId: notice.id })
    res.status(201).json({ notice })
  } catch (err) {
    res.status(400).json({ message: err.message || '发布公告失败' })
  }
})

app.get('/api/mails', auth, (req, res) => {
  const db = readDb()
  const mails = db.mails.filter(m => m.userId === req.user.id).sort((a, b) => b.createdAt - a.createdAt)
  res.json({ mails })
})

app.post('/api/cert/apply', auth, (req, res) => {
  try {
    const info = requireText(req.body.info, '认证资料', 10, 1000)
    const db = readDb()
    if (db.certApplications.some(c => c.userId === req.user.id && c.status === 'pending')) {
      return res.status(400).json({ message: '你已有待审核的认证申请' })
    }
    const application = {
      id: nanoid(),
      userId: req.user.id,
      nick: req.user.nick,
      info,
      status: 'pending',
      createdAt: Date.now()
    }
    db.certApplications.push(application)
    writeDb(db)
    audit('cert.apply', req, { applicationId: application.id })
    res.status(201).json({ message: '认证申请已提交，等待管理员审核' })
  } catch (err) {
    res.status(400).json({ message: err.message || '提交失败' })
  }
})

app.get('/api/admin/stats', auth, adminOnly, (req, res) => {
  const db = readDb()
  res.json({
    users: db.users.length,
    posts: db.posts.length,
    comments: db.comments.length,
    pendingCerts: db.certApplications.filter(c => c.status === 'pending').length,
    notices: db.notices.length,
    mails: db.mails.length,
    aiNovels: db.aiNovels.length,
    aiAnimations: db.aiAnimations.length,
    openEvents: db.openEvents.length
  })
})

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const db = readDb()
  const users = db.users.map(u => ({
    id: u.id,
    phone: u.phone,
    nick: u.nick,
    isAdmin: Boolean(u.isAdmin),
    isCert: Boolean(u.isCert),
    status: u.status || 'active',
    createdAt: u.createdAt
  }))
  res.json({ users })
})

app.patch('/api/admin/users/:id/status', auth, adminOnly, (req, res) => {
  const status = String(req.body.status || '')
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ message: '账号状态无效' })
  const db = readDb()
  if (req.user.id === req.params.id) return res.status(400).json({ message: '不能限制自己' })
  const user = db.users.find(u => u.id === req.params.id)
  if (!user) return res.status(404).json({ message: '用户不存在' })
  user.status = status
  writeDb(db)
  audit('user.status.update', req, { targetUserId: user.id, status })
  res.json({ user: publicUser(user), message: '账号状态已更新' })
})

app.get('/api/admin/platform/settings', auth, adminOnly, (req, res) => {
  const db = readDb()
  res.json({ settings: db.platformSettings })
})

app.put('/api/admin/platform/settings', auth, adminOnly, (req, res) => {
  const db = readDb()
  const allowed = ['siteName', 'registrationOpen', 'maintenanceMode', 'contentReviewMode', 'publicApiReadEnabled', 'publicApiWriteEnabled']
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) db.platformSettings[key] = req.body[key]
  }
  writeDb(db)
  audit('platform.settings.update', req, { settings: db.platformSettings })
  res.json({ settings: db.platformSettings })
})

app.get('/api/admin/audit', auth, adminOnly, (req, res) => {
  if (!fs.existsSync(AUDIT_PATH)) return res.json({ records: [] })
  const records = fs.readFileSync(AUDIT_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-300)
    .map(line => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
    .reverse()
  res.json({ records })
})

app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const db = readDb()
  if (req.user.id === req.params.id) return res.status(400).json({ message: '不能删除自己' })
  const index = db.users.findIndex(u => u.id === req.params.id)
  if (index < 0) return res.status(404).json({ message: '用户不存在' })
  db.users.splice(index, 1)
  db.posts = db.posts.filter(p => p.userId !== req.params.id)
  db.likes = db.likes.filter(l => l.userId !== req.params.id)
  db.comments = db.comments.filter(c => c.userId !== req.params.id)
  db.mails = db.mails.filter(m => m.userId !== req.params.id)
  db.certApplications = db.certApplications.filter(c => c.userId !== req.params.id)
  writeDb(db)
  audit('user.delete', req, { targetUserId: req.params.id })
  res.json({ message: '用户已删除' })
})

app.get('/api/admin/certs', auth, adminOnly, (req, res) => {
  const db = readDb()
  res.json({ applications: db.certApplications.slice().sort((a, b) => b.createdAt - a.createdAt) })
})

app.post('/api/admin/certs/:id/approve', auth, adminOnly, (req, res) => {
  const db = readDb()
  const app = db.certApplications.find(c => c.id === req.params.id)
  if (!app) return res.status(404).json({ message: '申请不存在' })
  app.status = 'approved'
  const user = db.users.find(u => u.id === app.userId)
  if (user) {
    user.isCert = true
    db.mails.push({
      id: nanoid(),
      userId: user.id,
      title: '认证通过',
      content: '恭喜！你的咕咕滴官方蓝V认证已通过审核。',
      createdAt: Date.now()
    })
  }
  writeDb(db)
  audit('cert.approve', req, { applicationId: app.id, userId: app.userId })
  res.json({ message: '已通过认证' })
})

app.post('/api/admin/certs/:id/reject', auth, adminOnly, (req, res) => {
  const db = readDb()
  const app = db.certApplications.find(c => c.id === req.params.id)
  if (!app) return res.status(404).json({ message: '申请不存在' })
  app.status = 'rejected'
  const user = db.users.find(u => u.id === app.userId)
  if (user) {
    db.mails.push({
      id: nanoid(),
      userId: user.id,
      title: '认证未通过',
      content: '很遗憾，你的认证申请未通过审核。你可以重新提交申请。',
      createdAt: Date.now()
    })
  }
  writeDb(db)
  audit('cert.reject', req, { applicationId: app.id, userId: app.userId })
  res.json({ message: '已拒绝认证' })
})

app.post('/api/admin/notice/broadcast', auth, adminOnly, (req, res) => {
  try {
    const title = requireText(req.body.title, '标题', 2, 100)
    const content = requireText(req.body.content, '内容', 2, 500)
    const db = readDb()
    db.mails.push(
      ...db.users.map(u => ({
        id: nanoid(),
        userId: u.id,
        title,
        content,
        createdAt: Date.now()
      }))
    )
    db.notices.push({
      id: nanoid(),
      title,
      content,
      createdAt: Date.now()
    })
    writeDb(db)
    audit('notice.broadcast', req, { count: db.users.length })
    res.json({ message: `已群发邮件给 ${db.users.length} 位用户` })
  } catch (err) {
    res.status(400).json({ message: err.message || '群发失败' })
  }
})


function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function makeNovelPages(date) {
  const chapterNames = ['雾港来信', '旧城飞鸟', '星桥夜奔', '蓝色服务器', '逆光主页']
  const pages = []
  for (let i = 1; i <= 20; i++) {
    const chapter = chapterNames[(i - 1) % chapterNames.length]
    pages.push({
      page: i,
      title: `第 ${i} 页 · ${chapter}`,
      content: [
        `今天的咕咕滴城被一层温柔的数据雾包围，少年站在发光的主页前，听见远处服务器像心跳一样稳定。`,
        `第 ${i} 页的故事从一个小小的通知开始：有人在凌晨发布了一条动态，说自己看见 AI 把云端写成了星空。`,
        `他们沿着时间线往前走，路过公告、邮件、短视频和直播间，每一个按钮都像一扇通往新世界的门。`,
        `当夜色落下，主角终于明白，真正的独立不是永不关机，而是每次重启后仍然记得自己的名字。`
      ].join('\n')
    })
  }
  return {
    id: `novel-${date}`,
    date,
    title: `《咕咕滴云端纪事》${date} 连载`,
    summary: 'AI 每日自动连载小说，今天更新 20 页。',
    pages,
    createdAt: Date.now(),
    authorId: 'system',
    nick: '咕咕滴AI'
  }
}

function makeAnimations(date) {
  const names = ['云端小鸟', '学习机大冒险', '不会关机的梦', '迷你主机守护队', '星河个人主页']
  return names.map((name, idx) => ({
    id: `animation-${date}-${idx + 1}`,
    date,
    title: `${name} · 第 ${idx + 1} 集`,
    durationMinutes: 20,
    cover: ['🐦', '📚', '☁️', '🖥️', '✨'][idx],
    synopsis: `AI 自动生成的 20 分钟动画片企划：${name}，包含完整分镜、旁白和剧情节奏。`,
    scenes: Array.from({ length: 8 }).map((_, i) => ({
      minute: `${i * 2 + 1}-${i * 2 + 3}分钟`,
      title: `镜头 ${i + 1}`,
      script: `角色进入${name}的世界，完成第 ${i + 1} 个任务：保护咕咕滴主页、修复云端连接，并把新的故事发布出去。`
    })),
    createdAt: Date.now(),
    authorId: 'system',
    nick: '咕咕滴AI'
  }))
}

function ensureDailyAiContent(db) {
  const date = todayKey()
  const hasNovel = db.aiNovels.some(n => n.date === date)
  const todayAnimations = db.aiAnimations.filter(a => a.date === date)
  let changed = false
  if (!hasNovel) {
    db.aiNovels.push(makeNovelPages(date))
    changed = true
  }
  if (todayAnimations.length < 5) {
    const fresh = makeAnimations(date)
    const existing = new Set(todayAnimations.map(a => a.id))
    db.aiAnimations.push(...fresh.filter(a => !existing.has(a.id)).slice(0, 5 - todayAnimations.length))
    changed = true
  }
  if (!db.aiRuns.some(r => r.date === date)) {
    db.aiRuns.push({ id: nanoid(), date, createdAt: Date.now(), novelPages: 20, animations: 5 })
    db.posts.unshift({
      id: nanoid(),
      userId: 'system',
      nick: '咕咕滴AI',
      content: `AI 内容工厂今日已发布：20 页小说 + 5 个 20 分钟动画片企划。打开“AI创作”查看。`,
      image: '',
      createdAt: Date.now()
    })
    changed = true
  }
  return changed
}

app.get('/api/ai/daily', (req, res) => {
  const db = readDb()
  if (ensureDailyAiContent(db)) writeDb(db)
  const date = todayKey()
  res.json({
    date,
    novel: db.aiNovels.find(n => n.date === date),
    animations: db.aiAnimations.filter(a => a.date === date).slice(0, 5),
    history: db.aiRuns.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 14)
  })
})

app.post('/api/admin/ai/generate', auth, adminOnly, (req, res) => {
  const db = readDb()
  const date = todayKey()
  db.aiNovels = db.aiNovels.filter(n => n.date !== date)
  db.aiAnimations = db.aiAnimations.filter(a => a.date !== date)
  db.aiRuns = db.aiRuns.filter(r => r.date !== date)
  ensureDailyAiContent(db)
  writeDb(db)
  res.json({ message: 'AI 今日内容已重新生成', date })
})

app.get('/api/users/:id/homepage', (req, res) => {
  const db = readDb()
  if (ensureDailyAiContent(db)) writeDb(db)
  const user = req.params.id === 'me' ? null : db.users.find(u => u.id === req.params.id)
  const profileUser = user || db.users[0] || { id: 'system', nick: '咕咕滴官方', phone: '', createdAt: Date.now(), isAdmin: true, isCert: true }
  res.json({
    user: publicUser(profileUser),
    posts: db.posts.filter(p => p.userId === profileUser.id || (profileUser.id === 'system' && p.userId === 'system')).slice(0, 20),
    aiNovels: db.aiNovels.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 7),
    aiAnimations: db.aiAnimations.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 15)
  })
})

app.get('/api/admin/code/files', auth, adminOnly, (req, res) => {
  try {
    res.json({
      root: 'gugudi-real-social',
      files: listCodeFiles()
    })
  } catch (err) {
    res.status(500).json({ message: err.message || '读取代码列表失败' })
  }
})

app.get('/api/admin/code/file', auth, adminOnly, (req, res) => {
  try {
    const { clean, absolute } = normalizeProjectPath(req.query.path)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return res.status(404).json({ message: '文件不存在' })
    }
    if (!isCodeFile(absolute)) {
      return res.status(403).json({ message: '该文件类型不允许在线编辑' })
    }
    const stat = fs.statSync(absolute)
    if (stat.size > 1024 * 1024) {
      return res.status(413).json({ message: '文件太大，不适合在线编辑' })
    }
    res.json({
      path: clean,
      content: fs.readFileSync(absolute, 'utf8'),
      size: stat.size,
      updatedAt: stat.mtimeMs
    })
  } catch (err) {
    res.status(400).json({ message: err.message || '读取文件失败' })
  }
})

app.put('/api/admin/code/file', auth, adminOnly, (req, res) => {
  try {
    const targetPath = requireText(req.body.path, '文件路径', 1, 300)
    const content = String(req.body.content ?? '')
    if (content.length > 1024 * 1024) {
      return res.status(413).json({ message: '文件内容太大，禁止保存' })
    }
    const { clean, absolute } = normalizeProjectPath(targetPath)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return res.status(404).json({ message: '文件不存在' })
    }
    if (!isCodeFile(absolute)) {
      return res.status(403).json({ message: '该文件类型不允许在线编辑' })
    }
    fs.mkdirSync(CODE_BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupName = `${clean.replace(/[\\/]/g, '__')}.${stamp}.bak`
    fs.copyFileSync(absolute, path.join(CODE_BACKUP_DIR, backupName))
    fs.writeFileSync(absolute, content, 'utf8')
    res.json({
      message: '代码已保存，并已自动备份',
      path: clean,
      backup: `.code-backups/${backupName}`,
      updatedAt: fs.statSync(absolute).mtimeMs
    })
  } catch (err) {
    res.status(400).json({ message: err.message || '保存文件失败' })
  }
})

app.get('/api/search', (req, res) => {
  const db = readDb()
  const q = String(req.query.q || '').trim().toLowerCase()
  if (!q) return res.json({ users: [], posts: [], notices: [] })
  const users = db.users
    .filter(u => `${u.nick} ${u.phone}`.toLowerCase().includes(q))
    .map(publicUser)
    .slice(0, 20)
  const posts = db.posts
    .filter(p => `${p.nick} ${p.content}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
  const notices = db.notices
    .filter(n => `${n.title} ${n.content}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
  res.json({ users, posts, notices })
})

app.get('/api/open/v1', (req, res) => {
  const db = readDb()
  res.json({
    name: '咕咕滴开放 API',
    version: 'v1',
    readEnabled: db.platformSettings?.publicApiReadEnabled !== false,
    writeEnabled: Boolean(db.platformSettings?.publicApiWriteEnabled && OPEN_API_KEYS.length),
    endpoints: [
      'GET /api/open/v1/status',
      'GET /api/open/v1/posts',
      'GET /api/open/v1/notices',
      'POST /api/open/v1/events'
    ]
  })
})

app.get('/api/open/v1/status', (req, res) => res.redirect(307, '/api/platform/status'))

app.get('/api/open/v1/posts', (req, res) => {
  const db = readDb()
  if (db.platformSettings?.publicApiReadEnabled === false) return res.status(403).json({ message: '平台未开放读取 API' })
  res.json({ posts: db.posts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) })
})

app.get('/api/open/v1/notices', (req, res) => {
  const db = readDb()
  if (db.platformSettings?.publicApiReadEnabled === false) return res.status(403).json({ message: '平台未开放读取 API' })
  res.json({ notices: db.notices.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) })
})

app.post('/api/open/v1/events', openApiKey, (req, res) => {
  const db = readDb()
  if (!db.platformSettings?.publicApiWriteEnabled) return res.status(403).json({ message: '平台未开启开放写入 API' })
  const event = {
    id: nanoid(),
    type: requireText(req.body.type, '事件类型', 2, 80),
    payload: req.body.payload || {},
    createdAt: Date.now()
  }
  db.openEvents.push(event)
  writeDb(db)
  audit('open.event.create', req, { eventId: event.id, type: event.type })
  res.status(201).json({ event })
})

const GAMES_UPLOAD_DIR = path.join(__dirname, 'uploads', 'games')
if (!fs.existsSync(GAMES_UPLOAD_DIR)) fs.mkdirSync(GAMES_UPLOAD_DIR, { recursive: true })

app.post('/api/games', auth, (req, res) => {
  try {
    const title = requireText(req.body.title, '游戏标题', 1, 80)
    const description = requireText(req.body.description, '游戏描述', 1, 2000)
    const genre = String(req.body.genre || '其他').trim()
    const gameUrl = String(req.body.gameUrl || '').trim()
    const gameFileBase64 = String(req.body.gameFile || '').trim()
    const cover = String(req.body.cover || '').trim()
    if (!gameUrl && !gameFileBase64) return res.status(400).json({ message: '请提供游戏链接或上传游戏文件' })
    let gameFileName = ''
    let gameFileSize = 0
    if (gameFileBase64) {
      const match = gameFileBase64.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return res.status(400).json({ message: '游戏文件格式无效' })
      const ext = match[1].split('/')[1] || 'bin'
      const buf = Buffer.from(match[2], 'base64')
      gameFileName = `${nanoid()}.${ext}`
      fs.writeFileSync(path.join(GAMES_UPLOAD_DIR, gameFileName), buf)
      gameFileSize = buf.length
    }
    const db = readDb()
    const game = {
      id: nanoid(),
      userId: req.user.id,
      nick: req.user.nick,
      title,
      description,
      genre,
      cover,
      gameUrl,
      gameFile: gameFileName,
      gameFileSize,
      downloads: 0,
      status: 'active',
      createdAt: Date.now()
    }
    db.games.unshift(game)
    writeDb(db)
    audit('game.create', req, { gameId: game.id, title })
    res.status(201).json({ game, message: '游戏已上架' })
  } catch (err) {
    res.status(400).json({ message: err.message || '上架失败' })
  }
})

app.get('/api/games', (req, res) => {
  const db = readDb()
  const games = db.games.filter(g => g.status === 'active').slice().sort((a, b) => b.createdAt - a.createdAt)
  res.json({ games: games.map(g => ({ ...g, gameFile: undefined })) })
})

app.get('/api/games/:id', (req, res) => {
  const db = readDb()
  const game = db.games.find(g => g.id === req.params.id)
  if (!game) return res.status(404).json({ message: '游戏不存在' })
  res.json({ game: { ...game, gameFile: undefined } })
})

app.get('/api/games/:id/download', (req, res) => {
  const db = readDb()
  const game = db.games.find(g => g.id === req.params.id)
  if (!game) return res.status(404).json({ message: '游戏不存在' })
  if (game.gameUrl) return res.json({ url: game.gameUrl, type: 'url' })
  if (game.gameFile) {
    const filePath = path.join(GAMES_UPLOAD_DIR, game.gameFile)
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '游戏文件已丢失' })
    game.downloads = (game.downloads || 0) + 1
    writeDb(db)
    return res.download(filePath, `${game.title}.${path.extname(game.gameFile)}`)
  }
  res.status(404).json({ message: '无可下载内容' })
})

app.delete('/api/games/:id', auth, (req, res) => {
  const db = readDb()
  const game = db.games.find(g => g.id === req.params.id)
  if (!game) return res.status(404).json({ message: '游戏不存在' })
  if (game.userId !== req.user.id && !req.user.isAdmin) return res.status(403).json({ message: '只能删除自己上架的游戏' })
  if (game.gameFile) {
    const filePath = path.join(GAMES_UPLOAD_DIR, game.gameFile)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
  game.status = 'deleted'
  writeDb(db)
  audit('game.delete', req, { gameId: game.id })
  res.json({ message: '游戏已下架' })
})

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')))
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'client', 'dist', 'index.html')
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
  res.status(404).json({ message: '前端还未构建，请先运行 npm run build' })
})

app.listen(PORT, () => {
  console.log(`咕咕滴真实社交平台后端已启动：http://localhost:${PORT}`)
})
