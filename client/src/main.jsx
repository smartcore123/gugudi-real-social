import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bird, Bell, Camera, Check, Gem, Heart, LogOut, Mail, MessageCircle,
  Radio, Send, ShieldCheck, Trash2, User, Users, Video, X, Crown, BarChart3, Megaphone, Gamepad2, Download, Play
} from 'lucide-react'
import './styles.css'

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

function formatTime(time) {
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return new Date(time).toLocaleString()
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('gugudi_token') || '')
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [tab, setTab] = useState('feed')
  const [posts, setPosts] = useState([])
  const [videos, setVideos] = useState([])
  const [notices, setNotices] = useState([])
  const [mails, setMails] = useState([])
  const [aiDaily, setAiDaily] = useState(null)
  const [profile, setProfile] = useState(null)
  const [comments, setComments] = useState({})
  const [commentInputs, setCommentInputs] = useState({})
  const [authForm, setAuthForm] = useState({ phone: '', password: '', nick: '' })
  const [postForm, setPostForm] = useState({ content: '', image: '' })
  const [videoForm, setVideoForm] = useState({ title: '', description: '', videoUrl: '', cover: '' })
  const [certText, setCertText] = useState('')
  const [toast, setToast] = useState('')
  const [liveOpen, setLiveOpen] = useState(false)
  const [games, setGames] = useState([])
  const [gameForm, setGameForm] = useState({ title: '', description: '', genre: '其他', gameUrl: '', cover: '', gameFile: '' })
  const [selectedGame, setSelectedGame] = useState(null)

  // Admin state
  const [adminTab, setAdminTab] = useState('stats')
  const [stats, setStats] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [certApps, setCertApps] = useState([])
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '' })
  const [broadcastForm, setBroadcastForm] = useState({ title: '', content: '' })
  const [codeFiles, setCodeFiles] = useState([])
  const [selectedCodePath, setSelectedCodePath] = useState('')
  const [codeContent, setCodeContent] = useState('')
  const [codeMeta, setCodeMeta] = useState(null)
  const [codeDirty, setCodeDirty] = useState(false)
  const knownMailIds = useRef(new Set())
  const mailPollReady = useRef(false)
  const knownPostIds = useRef(new Set())
  const postPollReady = useRef(false)
  const knownVideoIds = useRef(new Set())
  const videoPollReady = useRef(false)
  const knownCertIds = useRef(new Set())
  const certPollReady = useRef(false)
  const knownGameIds = useRef(new Set())
  const gamePollReady = useRef(false)

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  const isAdmin = user?.isAdmin

  function show(message) {
    setToast(message)
    setTimeout(() => setToast(''), 2400)
  }

  async function request(path, options = {}) {
    let res
    try {
      res = await fetch(`${API}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
      })
    } catch {
      const err = new Error('网络连接失败，请刷新页面或检查公网链接是否可用')
      err.status = 0
      throw err
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.message || '请求失败')
      err.status = res.status
      throw err
    }
    return data
  }

  async function loadPosts(notify = false) {
    const data = await request('/posts')
    const nextPosts = data.posts || []
    const nextIds = new Set(nextPosts.map(post => post.id))
    if (notify && postPollReady.current) {
      const fresh = nextPosts.filter(post => !knownPostIds.current.has(post.id) && post.userId !== user?.id)
      if (fresh.length > 0) show(`广场有新动态：${fresh[0].nick || '用户'}`)
    }
    knownPostIds.current = nextIds
    postPollReady.current = true
    setPosts(nextPosts)
  }

  async function loadVideos(notify = false) {
    const data = await request('/shorts/feed')
    const nextVideos = data.videos || []
    const nextIds = new Set(nextVideos.map(video => video.id))
    if (notify && videoPollReady.current) {
      const fresh = nextVideos.filter(video => !knownVideoIds.current.has(video.id) && video.userId !== user?.id)
      if (fresh.length > 0) show(`短视频有新作品：${fresh[0].title || '新视频'}`)
    }
    knownVideoIds.current = nextIds
    videoPollReady.current = true
    setVideos(nextVideos)
  }

  async function publishVideo(e) {
    e.preventDefault()
    if (!token) return show('请先登录')
    try {
      await request('/shorts/videos', {
        method: 'POST',
        body: JSON.stringify(videoForm)
      })
      setVideoForm({ title: '', description: '', videoUrl: '', cover: '' })
      show('短视频已发布')
      loadVideos()
    } catch (err) {
      show(err.message)
    }
  }

  async function loadNotices() {
    const data = await request('/notices')
    setNotices(data.notices)
  }

  async function loadMails(notify = false) {
    if (!token) return
    const data = await request('/mails')
    const nextMails = data.mails || []
    const nextIds = new Set(nextMails.map(mail => mail.id))
    if (notify && mailPollReady.current) {
      const fresh = nextMails.filter(mail => !knownMailIds.current.has(mail.id))
      if (fresh.length > 0) {
        const latest = fresh[0]
        show(`收到新邮件：${latest.title || '系统消息'}`)
      }
    }
    knownMailIds.current = nextIds
    mailPollReady.current = true
    setMails(nextMails)
  }

  async function loadAiDaily() {
    const data = await request('/ai/daily')
    setAiDaily(data)
  }

  async function loadProfile() {
    if (!user) return
    const data = await request(`/users/${user.id}/homepage`)
    setProfile(data)
  }

  async function loadMe() {
    if (!token) return
    try {
      const data = await request('/me')
      setUser(data.user)
    } catch (err) {
      console.error('loadMe failed:', err.message, 'status:', err.status)
      if (err.status === 401) {
        show('登录已过期，请重新登录')
        localStorage.removeItem('gugudi_token')
        setToken('')
        setUser(null)
      } else if (err.status === 0) {
        show('网络连接失败，登录状态未验证')
      } else {
        show('登录状态验证失败：' + err.message)
      }
    }
  }

  useEffect(() => {
    loadPosts().catch(err => show(err.message))
    loadVideos().catch(err => show(err.message))
    loadNotices().catch(err => show(err.message))
    loadAiDaily().catch(err => show(err.message))
    loadGames().catch(err => show(err.message))
  }, [])

  useEffect(() => {
    loadMe()
    if (token) loadMails(false).catch(() => {})
    if (!token) {
      knownMailIds.current = new Set()
      mailPollReady.current = false
      knownCertIds.current = new Set()
      certPollReady.current = false
    }
  }, [token])

  useEffect(() => {
    const timer = setInterval(() => {
      loadPosts(true).catch(() => {})
      loadVideos(true).catch(() => {})
      loadGames(true).catch(() => {})
      if (token) loadMails(true).catch(() => {})
      if (isAdmin) {
        loadAdminStats()
        loadAllUsers()
        loadCertApps(true)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [token, headers, isAdmin, user?.id])

  // Admin data loaders
  async function loadAdminStats() {
    if (!isAdmin) return
    try {
      const data = await request('/admin/stats')
      setStats(data)
    } catch (err) { show(err.message) }
  }

  async function loadAllUsers() {
    if (!isAdmin) return
    try {
      const data = await request('/admin/users')
      setAllUsers(data.users)
    } catch (err) { show(err.message) }
  }

  async function loadCertApps(notify = false) {
    if (!isAdmin) return
    try {
      const data = await request('/admin/certs')
      const nextApps = data.applications || []
      const nextIds = new Set(nextApps.map(app => app.id))
      if (notify && certPollReady.current) {
        const fresh = nextApps.filter(app => !knownCertIds.current.has(app.id))
        if (fresh.length > 0) show(`后台有新认证申请：${fresh[0].nick || '用户'}`)
      }
      knownCertIds.current = nextIds
      certPollReady.current = true
      setCertApps(nextApps)
    } catch (err) { show(err.message) }
  }

  async function loadGames(notify = false) {
    try {
      const data = await request('/games')
      const nextGames = data.games || []
      const nextIds = new Set(nextGames.map(g => g.id))
      if (notify && gamePollReady.current) {
        const fresh = nextGames.filter(g => !knownGameIds.current.has(g.id))
        if (fresh.length > 0) show(`游戏商店有新上架：${fresh[0].title || '新游戏'}`)
      }
      knownGameIds.current = nextIds
      gamePollReady.current = true
      setGames(nextGames)
    } catch (err) { show(err.message) }
  }

  async function publishGame(e) {
    e.preventDefault()
    if (!token) return show('请先登录')
    if (!gameForm.title.trim()) return show('请填写游戏标题')
    if (!gameForm.description.trim()) return show('请填写游戏描述')
    if (!gameForm.gameUrl.trim() && !gameForm.gameFile) return show('请填写游戏链接或上传游戏包')
    setUploading(true)
    show('正在上传游戏，请稍候...')
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 120000)
      const res = await fetch(`${API}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(gameForm),
        signal: controller.signal
      })
      clearTimeout(timer)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || '上架失败')
      setGameForm({ title: '', description: '', genre: '其他', gameUrl: '', cover: '', gameFile: '' })
      setGameFileLabel('')
      setGameCoverLabel('')
      show('游戏已上架')
      loadGames()
    } catch (err) {
      if (err.name === 'AbortError') {
        show('上传超时，游戏文件可能过大，建议填写游戏链接代替上传')
      } else {
        show(err.message)
      }
    } finally {
      setUploading(false)
    }
  }

  async function deleteGame(id) {
    if (!confirm('确定要下架这个游戏吗？')) return
    try {
      await request(`/games/${id}`, { method: 'DELETE' })
      show('游戏已下架')
      loadGames()
      if (selectedGame?.id === id) setSelectedGame(null)
    } catch (err) { show(err.message) }
  }

  const [gameFileLabel, setGameFileLabel] = useState('')
  const [gameCoverLabel, setGameCoverLabel] = useState('')
  const [uploading, setUploading] = useState(false)

  function handleGameFile(file) {
    if (!file) return
    // 游戏文件大小无上限
    setGameFileLabel(file.name)
    const reader = new FileReader()
    reader.onload = e => setGameForm(prev => ({ ...prev, gameFile: e.target.result }))
    reader.readAsDataURL(file)
  }

  function handleGameCover(file) {
    if (!file) return
    setGameCoverLabel(file.name)
    const reader = new FileReader()
    reader.onload = e => setGameForm(prev => ({ ...prev, cover: e.target.result }))
    reader.readAsDataURL(file)
  }

  async function loadCodeFiles() {
    if (!isAdmin) return
    try {
      const data = await request('/admin/code/files')
      setCodeFiles(data.files)
      if (!selectedCodePath && data.files[0]) {
        loadCodeFile(data.files[0].path)
      }
    } catch (err) { show(err.message) }
  }

  async function loadCodeFile(filePath) {
    if (!isAdmin || !filePath) return
    try {
      const data = await request(`/admin/code/file?path=${encodeURIComponent(filePath)}`)
      setSelectedCodePath(data.path)
      setCodeContent(data.content)
      setCodeMeta(data)
      setCodeDirty(false)
    } catch (err) { show(err.message) }
  }

  async function saveCodeFile() {
    if (!isAdmin || !selectedCodePath) return
    try {
      const data = await request('/admin/code/file', {
        method: 'PUT',
        body: JSON.stringify({ path: selectedCodePath, content: codeContent })
      })
      setCodeDirty(false)
      setCodeMeta({ ...codeMeta, updatedAt: data.updatedAt })
      show(`保存成功，已备份到 ${data.backup}`)
      loadCodeFiles()
    } catch (err) { show(err.message) }
  }

  useEffect(() => {
    if (tab === 'admin' && isAdmin) {
      loadAdminStats()
      loadAllUsers()
      loadCertApps()
    }
    if (tab === 'profile' && user) {
      loadProfile().catch(err => show(err.message))
    }
    if (tab === 'ai') {
      loadAiDaily().catch(err => show(err.message))
    }
    if (tab === 'video') {
      loadVideos().catch(err => show(err.message))
    }
    if (tab === 'mail' && user) {
      loadMails().catch(err => show(err.message))
    }
  }, [tab, isAdmin, user?.id])

  async function submitAuth(e) {
    e.preventDefault()
    try {
      const data = await request(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(authForm)
      })
      localStorage.setItem('gugudi_token', data.token)
      setToken(data.token)
      setUser(data.user)
      show(mode === 'login' ? '登录成功' : '注册成功')
      setAuthForm({ phone: '', password: '', nick: '' })
      setTab('feed')
    } catch (err) {
      show(err.message)
    }
  }

  function logout() {
    localStorage.removeItem('gugudi_token')
    setToken('')
    setUser(null)
    setMails([])
    setStats(null)
    setAllUsers([])
    setCertApps([])
    show('已退出登录')
  }

  function handleImage(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => setPostForm(prev => ({ ...prev, image: e.target.result }))
    reader.readAsDataURL(file)
  }

  function handleVideoFile(file) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return show('视频文件不能超过 8MB，建议先压缩或填写视频链接')
    const reader = new FileReader()
    reader.onload = e => setVideoForm(prev => ({ ...prev, videoUrl: e.target.result }))
    reader.readAsDataURL(file)
  }

  function handleCoverFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => setVideoForm(prev => ({ ...prev, cover: e.target.result }))
    reader.readAsDataURL(file)
  }

  async function publishPost(e) {
    e.preventDefault()
    if (!token) return show('请先登录')
    try {
      await request('/posts', {
        method: 'POST',
        body: JSON.stringify(postForm)
      })
      setPostForm({ content: '', image: '' })
      show('动态已发布')
      loadPosts()
    } catch (err) {
      show(err.message)
    }
  }

  async function deletePost(id) {
    if (!isAdmin) return
    try {
      await request(`/posts/${id}`, { method: 'DELETE' })
      show('动态已删除')
      loadPosts()
    } catch (err) { show(err.message) }
  }

  async function likePost(id) {
    if (!token) return show('请先登录')
    try {
      await request(`/posts/${id}/like`, { method: 'POST' })
      loadPosts()
    } catch (err) {
      show(err.message)
    }
  }

  async function openComments(id) {
    if (comments[id]) {
      setComments(prev => ({ ...prev, [id]: null }))
      return
    }
    try {
      const data = await request(`/posts/${id}/comments`)
      setComments(prev => ({ ...prev, [id]: data.comments }))
    } catch (err) {
      show(err.message)
    }
  }

  async function sendComment(id) {
    if (!token) return show('请先登录')
    try {
      await request(`/posts/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentInputs[id] || '' })
      })
      setCommentInputs(prev => ({ ...prev, [id]: '' }))
      const data = await request(`/posts/${id}/comments`)
      setComments(prev => ({ ...prev, [id]: data.comments }))
      loadPosts()
    } catch (err) {
      show(err.message)
    }
  }

  async function applyCert(e) {
    e.preventDefault()
    if (!token) return show('请先登录')
    try {
      const data = await request('/cert/apply', {
        method: 'POST',
        body: JSON.stringify({ info: certText })
      })
      setCertText('')
      show(data.message)
      loadMails()
      setTab('mail')
    } catch (err) {
      show(err.message)
    }
  }

  // Admin actions
  async function publishNotice(e) {
    e.preventDefault()
    try {
      await request('/notices', {
        method: 'POST',
        body: JSON.stringify(noticeForm)
      })
      setNoticeForm({ title: '', content: '' })
      show('公告已发布')
      loadNotices()
    } catch (err) { show(err.message) }
  }

  async function broadcastMail(e) {
    e.preventDefault()
    try {
      const data = await request('/admin/notice/broadcast', {
        method: 'POST',
        body: JSON.stringify(broadcastForm)
      })
      setBroadcastForm({ title: '', content: '' })
      show(data.message)
    } catch (err) { show(err.message) }
  }

  async function approveCert(id) {
    try {
      await request(`/admin/certs/${id}/approve`, { method: 'POST' })
      show('已通过认证')
      loadCertApps()
      loadAllUsers()
    } catch (err) { show(err.message) }
  }

  async function rejectCert(id) {
    try {
      await request(`/admin/certs/${id}/reject`, { method: 'POST' })
      show('已拒绝认证')
      loadCertApps()
    } catch (err) { show(err.message) }
  }

  async function deleteUser(id, nick) {
    if (!confirm(`确定要删除用户「${nick}」吗？其所有数据将被清除。`)) return
    try {
      await request(`/admin/users/${id}`, { method: 'DELETE' })
      show('用户已删除')
      loadAllUsers()
      loadAdminStats()
    } catch (err) { show(err.message) }
  }

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon"><Bird size={22} /></span>
          <div>
            <h1>咕咕滴</h1>
            <p>真实社交平台</p>
          </div>
        </div>
        <div className="userbar">
          {user ? (
            <>
              <span className={`user-chip ${isAdmin ? 'admin-chip' : ''}`}>
                {isAdmin ? <Crown size={14} /> : <User size={15} />}
                {user.nick}
              </span>
              <button onClick={logout}><LogOut size={15} />退出</button>
            </>
          ) : (
            <button onClick={() => setTab('auth')}><ShieldCheck size={15} />登录 / 注册</button>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}><Bird size={18} />广场</button>
        <button className={tab === 'video' ? 'active' : ''} onClick={() => setTab('video')}><Video size={18} />短视频</button>
        <button className={tab === 'game' ? 'active' : ''} onClick={() => { setTab('game'); loadGames() }}><Gamepad2 size={18} />游戏</button>
        <button className={tab === 'notice' ? 'active' : ''} onClick={() => setTab('notice')}><Bell size={18} />公告</button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => { setTab('ai'); loadAiDaily() }}><Gem size={18} />AI创作</button>
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}><Radio size={18} />直播</button>
        <button className={tab === 'mail' ? 'active' : ''} onClick={() => { setTab('mail'); loadMails() }}><Mail size={18} />邮件</button>
        {user && <button className={tab === 'profile' ? 'active' : ''} onClick={() => { setTab('profile'); loadProfile() }}><User size={18} />个人主页</button>}
        {isAdmin && (
          <button className={`admin-tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); loadAdminStats(); loadAllUsers(); loadCertApps() }}><Crown size={18} />管理</button>
        )}
      </nav>

      <main className="shell">
        {tab === 'auth' && (
          <section className="panel auth-panel">
            <h2>{mode === 'login' ? '真实账号登录' : '创建真实账号'}</h2>
            <p className="hint">
              {mode === 'register'
                ? '密码会加密保存。第一个注册的用户将自动成为官方管理员。'
                : '登录后使用 JWT Token 访问个人接口。'}
            </p>
            <form onSubmit={submitAuth} className="form">
              {mode === 'register' && (
                <input placeholder="昵称，2-20个字符" value={authForm.nick} onChange={e => setAuthForm({ ...authForm, nick: e.target.value })} />
              )}
              <input placeholder="手机号" value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} />
              <input type="password" placeholder="密码，至少6位" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
              <button className="primary">{mode === 'login' ? '登录' : '注册'}</button>
            </form>
            <button className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </button>
          </section>
        )}

        {tab === 'feed' && (
          <>
            <section className="panel composer">
              <form onSubmit={publishPost}>
                <textarea placeholder={user ? '发布一条真实保存的动态...' : '登录后可以发布动态'} value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
                {postForm.image && (
                  <div className="preview">
                    <img src={postForm.image} alt="预览" />
                    <button type="button" onClick={() => setPostForm({ ...postForm, image: '' })}><X size={16} /></button>
                  </div>
                )}
                <div className="row">
                  <label className="upload"><Camera size={16} />添加图片<input type="file" accept="image/*" onChange={e => handleImage(e.target.files[0])} /></label>
                  <button className="primary"><Send size={16} />发布</button>
                </div>
              </form>
            </section>

            <section className="feed">
              {posts.map(post => (
                <article className="post" key={post.id}>
                  <div className="post-head">
                    <div className="avatar">{post.nick?.[0] || '咕'}</div>
                    <div className="post-head-info">
                      <strong>
                        {post.nick}
                        {post.isAdmin && <span className="admin-badge"><Crown size={11} />官方</span>}
                        {post.isCert && <span className="cert"><Gem size={12} />认证</span>}
                      </strong>
                      <p>{formatTime(post.createdAt)}</p>
                    </div>
                    {isAdmin && post.userId !== 'system' && (
                      <button className="delete-btn" onClick={() => deletePost(post.id)}><Trash2 size={14} /></button>
                    )}
                  </div>
                  <p className="post-text">{post.content}</p>
                  {post.image && <img className="post-img" src={post.image} alt="" />}
                  <div className="actions">
                    <button onClick={() => likePost(post.id)}><Heart size={17} />{post.likes}</button>
                    <button onClick={() => openComments(post.id)}><MessageCircle size={17} />{post.comments}</button>
                  </div>
                  {comments[post.id] && (
                    <div className="comments">
                      {comments[post.id].map(c => (
                        <p key={c.id}><strong>{c.nick}：</strong>{c.content}</p>
                      ))}
                      <div className="comment-input">
                        <input placeholder="写评论" value={commentInputs[post.id] || ''} onChange={e => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })} />
                        <button onClick={() => sendComment(post.id)}>发送</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>
          </>
        )}

        {tab === 'video' && (
          <section className="stack">
            <form className="panel composer" onSubmit={publishVideo}>
              <h2><Video size={18} /> 发布短视频</h2>
              <input placeholder="短视频标题" value={videoForm.title} onChange={e => setVideoForm({ ...videoForm, title: e.target.value })} />
              <textarea placeholder="短视频描述" value={videoForm.description} onChange={e => setVideoForm({ ...videoForm, description: e.target.value })} />
              <input placeholder="视频链接，也可以上传 8MB 以内视频文件" value={videoForm.videoUrl} onChange={e => setVideoForm({ ...videoForm, videoUrl: e.target.value })} />
              <div className="row">
                <label className="upload"><Video size={16} />上传视频<input type="file" accept="video/*" onChange={e => handleVideoFile(e.target.files[0])} /></label>
                <label className="upload"><Camera size={16} />上传封面<input type="file" accept="image/*" onChange={e => handleCoverFile(e.target.files[0])} /></label>
                <button className="primary"><Send size={16} />发布短视频</button>
              </div>
            </form>
            <section className="grid2">
              {videos.length === 0 ? (
                <div className="empty">还没有短视频，登录后发布第一条吧</div>
              ) : videos.map(video => (
                <article className="video-card" key={video.id}>
                  {video.videoUrl ? (
                    <video className="short-video" src={video.videoUrl} poster={video.cover} controls playsInline />
                  ) : video.cover ? (
                    <img className="short-video" src={video.cover} alt="" />
                  ) : <Video size={38} />}
                  <strong>{video.title}</strong>
                  <p>{video.description}</p>
                  <span>{video.nick || '用户'} · {formatTime(video.createdAt)} · {video.likes || 0}赞</span>
                </article>
              ))}
            </section>
          </section>
        )}

        {tab === 'game' && (
          <section className="stack">
            {selectedGame ? (
              <section className="panel game-detail">
                <button className="link" onClick={() => setSelectedGame(null)}><X size={16} /> 返回游戏商店</button>
                <h2><Gamepad2 size={20} /> {selectedGame.title}</h2>
                <p className="hint">{selectedGame.genre} · {selectedGame.nick || '用户'} · {formatTime(selectedGame.createdAt)}</p>
                {selectedGame.cover && <img className="game-cover-large" src={selectedGame.cover} alt="" />}
                <p className="game-desc">{selectedGame.description}</p>
                <div className="row">
                  {selectedGame.gameUrl ? (
                    <a className="primary" href={selectedGame.gameUrl} target="_blank" rel="noopener noreferrer"><Play size={16} /> 在线游玩</a>
                  ) : (
                    <a className="primary" href={`${API}/games/${selectedGame.id}/download`} download><Download size={16} /> 下载游戏</a>
                  )}
                  {(selectedGame.userId === user?.id || isAdmin) && (
                    <button className="delete-btn" onClick={() => deleteGame(selectedGame.id)}><Trash2 size={14} />下架</button>
                  )}
                </div>
              </section>
            ) : (
              <>
                <form className="panel composer" onSubmit={publishGame}>
                  <h2><Gamepad2 size={18} /> 上架游戏</h2>
                  <input placeholder="游戏标题" value={gameForm.title} onChange={e => setGameForm({ ...gameForm, title: e.target.value })} />
                  <textarea placeholder="游戏描述" value={gameForm.description} onChange={e => setGameForm({ ...gameForm, description: e.target.value })} />
                  <select value={gameForm.genre} onChange={e => setGameForm({ ...gameForm, genre: e.target.value })}>
                    <option value="其他">其他</option>
                    <option value="休闲">休闲</option>
                    <option value="动作">动作</option>
                    <option value="冒险">冒险</option>
                    <option value="策略">策略</option>
                    <option value="角色扮演">角色扮演</option>
                    <option value="益智">益智</option>
                    <option value="体育">体育</option>
                    <option value="模拟">模拟</option>
                    <option value="射击">射击</option>
                  </select>
                  <input placeholder="游戏链接（可选，在线游戏直接填写网址）" value={gameForm.gameUrl} onChange={e => setGameForm({ ...gameForm, gameUrl: e.target.value })} />
                  <div className="row">
                    <label className="upload"><Gamepad2 size={16} />上传游戏包{gameFileLabel && <span className="file-label">{gameFileLabel}</span>}<input type="file" accept=".zip,.html,.js" onChange={e => handleGameFile(e.target.files[0])} /></label>
                    <label className="upload"><Camera size={16} />上传封面{gameCoverLabel && <span className="file-label">{gameCoverLabel}</span>}<input type="file" accept="image/*" onChange={e => handleGameCover(e.target.files[0])} /></label>
                    <button className="primary" disabled={uploading}>{uploading ? '上传中...' : <><Send size={16} />上架游戏</>}</button>
                  </div>
                </form>
                <section className="grid2">
                  {games.length === 0 ? (
                    <div className="empty">还没有游戏，登录后上架第一款吧</div>
                  ) : games.map(game => (
                    <article className="game-card" key={game.id} onClick={() => setSelectedGame(game)}>
                      {game.cover ? (
                        <img className="game-cover" src={game.cover} alt="" />
                      ) : (
                        <div className="game-cover-placeholder"><Gamepad2 size={38} /></div>
                      )}
                      <strong>{game.title}</strong>
                      <span className="game-genre">{game.genre}</span>
                      <p>{game.nick || '用户'} · {formatTime(game.createdAt)} · {game.downloads || 0}次下载</p>
                    </article>
                  ))}
                </section>
              </>
            )}
          </section>
        )}

        {tab === 'ai' && (
          <section className="stack">
            <section className="panel ai-hero">
              <h2><Gem size={18} /> AI 创作</h2>
              <p className="hint">每天自动发布 20 页小说，并生成 5 个 20 分钟动画片企划。</p>
              <div className="ai-stats">
                <span>小说：{aiDaily?.novel?.pages?.length || 0} 页</span>
                <span>动画片：{aiDaily?.animations?.length || 0} 个</span>
                <span>{aiDaily?.date || '正在加载'}</span>
              </div>
              <button className="primary" type="button" onClick={() => loadAiDaily().catch(err => show(err.message))}>刷新AI内容</button>
            </section>
            {!aiDaily ? <div className="empty">AI 创作加载中...</div> : (
              <>
                <section className="panel novel-panel">
                  <h2>{aiDaily.novel?.title || '今日小说'}</h2>
                  <p className="hint">{aiDaily.novel?.summary}</p>
                  <div className="novel-pages">
                    {(aiDaily.novel?.pages || []).map(page => (
                      <article className="novel-page" key={page.page}>
                        <strong>{page.title}</strong>
                        <p>{page.content}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="grid2">
                  {(aiDaily.animations || []).map(animation => (
                    <article className="animation-card" key={animation.id}>
                      <div className="animation-cover">{animation.cover}</div>
                      <strong>{animation.title}</strong>
                      <span>{animation.durationMinutes} 分钟动画片</span>
                      <p>{animation.synopsis}</p>
                    </article>
                  ))}
                </section>
              </>
            )}
          </section>
        )}

        {tab === 'notice' && (
          <section className="stack">
            {isAdmin && (
              <form className="panel" onSubmit={publishNotice}>
                <h2><Megaphone size={16} /> 发布公告</h2>
                <input placeholder="公告标题" value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} />
                <textarea placeholder="公告内容" value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })} />
                <button className="primary"><Bell size={16} />发布公告</button>
              </form>
            )}
            {notices.map(n => (
              <article className="notice" key={n.id}>
                <Bell size={18} />
                <div><h3>{n.title}</h3><p>{n.content}</p><span>{formatTime(n.createdAt)}</span></div>
              </article>
            ))}
          </section>
        )}

        {tab === 'live' && (
          <section className="panel live-panel">
            <h2>实时直播</h2>
            <p className="hint">真实直播需要 WebRTC 信令服务器和媒体服务，本版本保留入口并完成前端状态流。</p>
            <button className="primary" onClick={() => setLiveOpen(true)}><Radio size={17} />进入直播间</button>
          </section>
        )}

        {tab === 'mail' && (
          <section className="stack">
            {!user?.isAdmin && (
              <form className="panel" onSubmit={applyCert}>
                <h2>蓝V认证申请</h2>
                <textarea placeholder="填写创作方向、代表作、申请理由，至少10个字符" value={certText} onChange={e => setCertText(e.target.value)} />
                <button className="primary"><Gem size={16} />提交认证申请</button>
              </form>
            )}
            <section className="panel">
              <h2><Mail size={18} /> 我的邮件</h2>
              <p className="hint">这里显示系统通知、认证结果和管理员群发消息。</p>
              {!user ? (
                <div className="empty">请先登录后查看站内信</div>
              ) : mails.length === 0 ? (
                <div className="empty">暂无邮件，收到系统通知后会显示在这里</div>
              ) : mails.map(m => (
                <article className="mail" key={m.id}>
                  <Mail size={17} />
                  <div><strong>{m.title}</strong><p>{m.content}</p><span>{formatTime(m.createdAt)}</span></div>
                </article>
              ))}
            </section>
          </section>
        )}

        {tab === 'profile' && (
          <section className="stack">
            {!user ? (
              <div className="empty">请先登录后查看个人中心</div>
            ) : (
              <>
                <section className="panel profile-card">
                  <div className="avatar big">{user.nick?.[0] || '咕'}</div>
                  <div>
                    <h2>{user.nick} 的个人中心</h2>
                    <p className="hint">{user.bio || '这个人还没有填写简介。'}</p>
                    <div className="ai-stats">
                      <span>{user.isAdmin ? '官方管理员' : '普通用户'}</span>
                      <span>{user.isCert ? '已认证' : '未认证'}</span>
                      <span>加入时间：{formatTime(user.createdAt)}</span>
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <h2><BarChart3 size={16} /> 我的数据</h2>
                  <div className="stats-grid">
                    <div className="stat-card"><Bird size={22} /><strong>{(profile?.posts || posts.filter(p => p.userId === user.id)).length}</strong><span>动态</span></div>
                    <div className="stat-card"><Mail size={22} /><strong>{mails.length}</strong><span>邮件</span></div>
                    <div className="stat-card"><Video size={22} /><strong>{videos.filter(v => v.userId === user.id).length}</strong><span>短视频</span></div>
                    <div className="stat-card"><Gem size={22} /><strong>{aiDaily?.novel?.pages?.length || 0}</strong><span>AI页数</span></div>
                  </div>
                </section>

                <section className="panel">
                  <h2><Gem size={16} /> AI 创作入口</h2>
                  <p className="hint">今日 AI 已准备小说和动画片内容。</p>
                  <button className="primary" type="button" onClick={() => { setTab('ai'); loadAiDaily() }}>进入 AI 创作</button>
                </section>

                <section className="feed">
                  {(profile?.posts || posts.filter(p => p.userId === user.id)).length === 0 ? (
                    <div className="empty">你还没有发布动态</div>
                  ) : (profile?.posts || posts.filter(p => p.userId === user.id)).map(post => (
                    <article className="post" key={post.id}>
                      <div className="post-head">
                        <div className="avatar">{post.nick?.[0] || user.nick?.[0] || '咕'}</div>
                        <div className="post-head-info"><strong>{post.nick || user.nick}</strong><p>{formatTime(post.createdAt)}</p></div>
                      </div>
                      <p className="post-text">{post.content}</p>
                      {post.image && <img className="post-img" src={post.image} alt="" />}
                    </article>
                  ))}
                </section>
              </>
            )}
          </section>
        )}

        {/* Admin Panel */}
        {tab === 'admin' && isAdmin && (
          <section className="admin-panel">
            <h2 className="admin-title"><Crown size={22} /> 官方管理后台</h2>
            <button className="primary" type="button" onClick={() => { loadAdminStats(); loadAllUsers(); loadCertApps(); show('管理数据已刷新') }}>
              刷新管理数据
            </button>

            <div className="admin-nav">
              <button className={adminTab === 'stats' ? 'active' : ''} onClick={() => setAdminTab('stats')}><BarChart3 size={16} />概览</button>
              <button className={adminTab === 'users' ? 'active' : ''} onClick={() => { setAdminTab('users'); loadAllUsers() }}><Users size={16} />用户管理</button>
              <button className={adminTab === 'certs' ? 'active' : ''} onClick={() => { setAdminTab('certs'); loadCertApps() }}><ShieldCheck size={16} />认证审核</button>
              <button className={adminTab === 'broadcast' ? 'active' : ''} onClick={() => setAdminTab('broadcast')}><Megaphone size={16} />群发通知</button>
              <button className={adminTab === 'code' ? 'active' : ''} onClick={() => { setAdminTab('code'); loadCodeFiles() }}><ShieldCheck size={16} />代码中心</button>
            </div>

            {adminTab === 'stats' && (
              stats ? (
                <div className="stats-grid">
                  <div className="stat-card">
                    <Users size={24} />
                    <strong>{stats.users}</strong>
                    <span>注册用户</span>
                  </div>
                  <div className="stat-card">
                    <Bird size={24} />
                    <strong>{stats.posts}</strong>
                    <span>动态总数</span>
                  </div>
                  <div className="stat-card">
                    <MessageCircle size={24} />
                    <strong>{stats.comments}</strong>
                    <span>评论总数</span>
                  </div>
                  <div className="stat-card">
                    <ShieldCheck size={24} />
                    <strong>{stats.pendingCerts}</strong>
                    <span>待审认证</span>
                  </div>
                </div>
              ) : <div className="empty">管理数据加载中，点上方“刷新管理数据”可重新加载</div>
            )}

            {adminTab === 'users' && (
              <div className="user-list">
                {allUsers.length === 0 ? (
                  <div className="empty">暂无注册用户</div>
                ) : allUsers.map(u => (
                  <div className="user-row" key={u.id}>
                    <div className="avatar-sm">{u.nick[0]}</div>
                    <div className="user-info">
                      <strong>
                        {u.nick}
                        {u.isAdmin && <span className="admin-badge"><Crown size={11} />官方</span>}
                        {u.isCert && <span className="cert"><Gem size={11} />认证</span>}
                      </strong>
                      <span>{u.phone} · {formatTime(u.createdAt)}</span>
                    </div>
                    {!u.isAdmin && (
                      <button className="danger-btn" onClick={() => deleteUser(u.id, u.nick)}><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {adminTab === 'certs' && (
              <div className="cert-list">
                {certApps.length === 0 ? (
                  <div className="empty">暂无认证申请</div>
                ) : certApps.map(app => (
                  <div className="cert-card" key={app.id}>
                    <div className="cert-header">
                      <strong>{app.nick}</strong>
                      <span className={`cert-status cert-status-${app.status}`}>
                        {app.status === 'pending' ? '待审核' : app.status === 'approved' ? '已通过' : '已拒绝'}
                      </span>
                    </div>
                    <p>{app.info}</p>
                    <span className="cert-time">{formatTime(app.createdAt)}</span>
                    {app.status === 'pending' && (
                      <div className="cert-actions">
                        <button className="approve-btn" onClick={() => approveCert(app.id)}><Check size={14} />通过</button>
                        <button className="danger-btn" onClick={() => rejectCert(app.id)}><X size={14} />拒绝</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {adminTab === 'broadcast' && (
              <form className="panel" onSubmit={broadcastMail}>
                <h2><Megaphone size={16} /> 群发邮件给所有用户</h2>
                <input placeholder="邮件标题" value={broadcastForm.title} onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })} />
                <textarea placeholder="邮件内容（会同时发布为公告）" value={broadcastForm.content} onChange={e => setBroadcastForm({ ...broadcastForm, content: e.target.value })} />
                <button className="primary"><Send size={16} />群发给所有用户</button>
              </form>
            )}

            {adminTab === 'code' && (
              <section className="code-center">
                <div className="code-sidebar">
                  <div className="code-toolbar">
                    <strong>平台代码</strong>
                    <button type="button" onClick={loadCodeFiles}>刷新</button>
                  </div>
                  <div className="code-file-list">
                    {codeFiles.map(file => (
                      <button
                        type="button"
                        key={file.path}
                        className={selectedCodePath === file.path ? 'active' : ''}
                        onClick={() => {
                          if (codeDirty && !confirm('当前文件还没保存，确定切换吗？')) return
                          loadCodeFile(file.path)
                        }}
                      >
                        <span>{file.path}</span>
                        <small>{Math.ceil(file.size / 1024)}KB</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="code-editor-panel">
                  <div className="code-editor-head">
                    <div>
                      <strong>{selectedCodePath || '请选择文件'}</strong>
                      <span>{codeDirty ? '未保存' : '已同步'}{codeMeta?.updatedAt ? ` · ${formatTime(codeMeta.updatedAt)}` : ''}</span>
                    </div>
                    <button type="button" className="primary" disabled={!selectedCodePath || !codeDirty} onClick={saveCodeFile}>
                      保存代码
                    </button>
                  </div>
                  <textarea
                    className="code-editor"
                    spellCheck="false"
                    value={codeContent}
                    placeholder="选择左侧文件后在这里实时编辑平台代码"
                    onChange={e => {
                      setCodeContent(e.target.value)
                      setCodeDirty(true)
                    }}
                  />
                  <p className="hint">保存会自动生成备份。修改前端后需要重新构建，修改后端后需要重启服务才会生效。</p>
                </div>
              </section>
            )}
          </section>
        )}
      </main>

      {liveOpen && (
        <div className="live-modal">
          <button className="close" onClick={() => setLiveOpen(false)}><X /></button>
          <Radio size={76} className="pulse" />
          <h2>直播间连接中</h2>
          <p>这里可以继续接入 WebRTC、弹幕网关和媒体服务器。</p>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
