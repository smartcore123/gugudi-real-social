const TARGET = (process.env.TARGET_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')
const API = `${TARGET}/api`

const results = []

function add(name, status, detail) {
  results.push({ name, status, detail })
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌'
  console.log(`${icon} ${name}: ${detail}`)
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return { res, data, text }
}

async function main() {
  console.log(`\n安全冒烟测试目标：${TARGET}`)
  console.log('说明：本脚本只做低频、非破坏性测试，不做 DDoS、不删库、不爆破真实账号。\n')

  const health = await request('/health')
  add('服务健康检查', health.res.status === 200 ? 'PASS' : 'FAIL', `HTTP ${health.res.status}`)

  const adminNoAuth = await request('/admin/stats')
  add('后台未登录拦截', adminNoAuth.res.status === 401 ? 'PASS' : 'FAIL', `GET /api/admin/stats -> HTTP ${adminNoAuth.res.status}`)

  const meNoAuth = await request('/me')
  add('个人接口未登录拦截', meNoAuth.res.status === 401 ? 'PASS' : 'FAIL', `GET /api/me -> HTTP ${meNoAuth.res.status}`)

  const openWriteNoKey = await request('/open/v1/events', {
    method: 'POST',
    body: JSON.stringify({ type: 'security-test', payload: { ok: true } })
  })
  add('开放写入 API 密钥拦截', openWriteNoKey.res.status === 401 ? 'PASS' : 'FAIL', `POST /api/open/v1/events -> HTTP ${openWriteNoKey.res.status}`)

  const traversal = await request('/admin/code/file?path=../../server/gugudi.db.json')
  add('路径穿越未登录拦截', traversal.res.status === 401 ? 'PASS' : 'FAIL', `GET /api/admin/code/file?path=../../... -> HTTP ${traversal.res.status}`)

  const cors = await fetch(`${API}/health`, {
    headers: { Origin: 'https://evil.example' }
  })
  const corsOrigin = cors.headers.get('access-control-allow-origin') || ''
  add('CORS 来源策略', corsOrigin === 'https://evil.example' ? 'WARN' : 'PASS', corsOrigin ? `返回 Access-Control-Allow-Origin: ${corsOrigin}` : '没有暴露跨域来源')

  const headers = await fetch(`${TARGET}/`)
  const csp = headers.headers.get('content-security-policy')
  const frame = headers.headers.get('x-frame-options')
  const poweredBy = headers.headers.get('x-powered-by')
  add('安全响应头', csp && frame ? 'PASS' : 'WARN', `CSP=${csp || '缺失'}；X-Frame-Options=${frame || '缺失'}；X-Powered-By=${poweredBy || '未暴露'}`)

  const suffix = String(Date.now() % 1_000_000_000).padStart(9, '0')
  const phone = `13${suffix}`
  const password = `T${suffix}!`
  const nick = `安全测试${suffix.slice(-4)}`

  const register = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone, password, nick })
  })
  const token = register.data.token
  add('测试账号注册', register.res.status === 201 && token ? 'PASS' : 'FAIL', `HTTP ${register.res.status}`)

  if (token) {
    const userAdmin = await request('/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
    add('普通用户访问后台拦截', userAdmin.res.status === 403 ? 'PASS' : 'FAIL', `GET /api/admin/users -> HTTP ${userAdmin.res.status}`)

    const xssPayload = `<img src=x onerror=alert('xss-${suffix}')><script>alert('xss')</script>`
    const xssPost = await request('/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: xssPayload, image: '' })
    })
    add('XSS 内容提交防护', xssPost.res.status >= 400 ? 'PASS' : 'WARN', xssPost.res.status >= 400 ? `已拒绝：HTTP ${xssPost.res.status}` : '后端允许保存 HTML/脚本内容，需要依赖前端 React 转义显示')

    let locked = false
    for (let i = 0; i < 8; i++) {
      const bad = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password: `wrong-${i}` })
      })
      if (bad.res.status === 429 || bad.res.status === 423) locked = true
    }
    add('登录暴力尝试限制', locked ? 'PASS' : 'WARN', locked ? '多次错误后触发限制' : '连续 8 次错误登录没有触发限速/锁定')
  }

  const pass = results.filter(r => r.status === 'PASS').length
  const warn = results.filter(r => r.status === 'WARN').length
  const fail = results.filter(r => r.status === 'FAIL').length

  console.log('\n测试汇总')
  console.log(`PASS: ${pass}，WARN: ${warn}，FAIL: ${fail}`)
  console.log('\n建议优先修复 WARN/FAIL：CORS 白名单、安全响应头、登录限速、后端内容净化。')

  if (fail > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('测试脚本异常：', err)
  process.exit(1)
})
