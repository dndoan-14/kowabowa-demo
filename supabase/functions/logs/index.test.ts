// Test cho Logs API (supabase/functions/logs/index.ts)
// Chạy: deno test --allow-env --import-map=test/import_map.json index.test.ts
// import_map thay npm:@supabase/supabase-js@2 bằng bản giả trong test/supabase_mock.ts,
// nên test không cần kết nối Supabase thật.

import { assertEquals } from 'jsr:@std/assert@1'
import { mock, type QueryCall, type QueryResult } from './test/supabase_mock.ts'

// Bắt lấy handler mà index.ts truyền vào Deno.serve thay vì mở server thật
let handler: (req: Request) => Promise<Response>
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (h: typeof handler) => {
  handler = h
}
await import('./index.ts')

// =====================================================================
// DỮ LIỆU GIẢ
// =====================================================================

const LOG = {
  id: 'log-1',
  user_id: 'user-1',
  goal_id: 'goal-1',
  title: 'Học Deno',
  skill_id: null,
  logged_at: '2026-09-26T16:00:00+07:00',
  description: null,
  is_achievement: false,
  deleted_at: null,
}

const SKILLS: Record<string, { id: string; user_id: string | null; is_system: boolean }> = {
  'skill-sys': { id: 'skill-sys', user_id: null, is_system: true },
  'skill-mine': { id: 'skill-mine', user_id: 'user-1', is_system: false },
  'skill-other': { id: 'skill-other', user_id: 'user-2', is_system: false },
}

const filter = (call: QueryCall, col: string) => call.filters.find((f) => f[1] === col)?.[2]

const hasNotDeletedFilter = (call: QueryCall) =>
  call.filters.some((f) => f[0] === 'is' && f[1] === 'deleted_at' && f[2] === null)

// Số đếm giả: tổng 13 log / 3 achievement, goal-1 có 5 log / 2 achievement
const fakeCount = (call: QueryCall) => {
  const onlyAchievements = filter(call, 'is_achievement') === true
  const byGoal = filter(call, 'goal_id') !== undefined
  if (byGoal) return onlyAchievements ? 2 : 5
  return onlyAchievements ? 3 : 13
}

// Thế giới giả mặc định: goal-1 thuộc user-1, log-1 tồn tại
const defaultResolver = (call: QueryCall): QueryResult => {
  if (call.table === 'goals') {
    const ok = filter(call, 'id') === 'goal-1' && filter(call, 'user_id') === 'user-1'
    return { data: ok ? { id: 'goal-1' } : null }
  }
  if (call.table === 'skills') {
    return { data: SKILLS[String(filter(call, 'id'))] ?? null }
  }
  // raw_logs
  if (call.op === 'select' && call.options?.head === true) {
    return { count: fakeCount(call) }
  }
  if (call.op === 'insert') {
    return { data: { id: 'log-new', ...(call.payload as object), deleted_at: null } }
  }
  // Lấy danh sách (GET /logs): trả về mảng log
  if (call.op === 'select' && call.terminal === 'await') {
    return { data: [LOG] }
  }
  const found = filter(call, 'id') === 'log-1' && filter(call, 'user_id') === 'user-1'
  if (!found) return { data: null }
  if (call.op === 'update') return { data: { ...LOG, ...(call.payload as object) } }
  return { data: LOG }
}

const BASE = 'http://localhost/logs'

const send = async (method: string, path = '', body?: unknown, rawBody?: string) => {
  const init: RequestInit = { method, headers: { Authorization: 'Bearer token' } }
  if (rawBody !== undefined) init.body = rawBody
  else if (body !== undefined) init.body = JSON.stringify(body)
  const res = await handler(new Request(BASE + path, init))
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch (_e) {
    json = text
  }
  // deno-lint-ignore no-explicit-any
  return { status: res.status, json: json as any, headers: res.headers }
}

const validBody = () => ({
  title: '  Học Deno  ',
  goal_id: 'goal-1',
  logged_at: '2026-09-26T16:00:00+07:00',
})

// Bọc Deno.test để reset mock trước mỗi test
const test = (name: string, fn: () => Promise<void>) =>
  Deno.test(name, async () => {
    mock.reset()
    mock.resolver = defaultResolver
    await fn()
  })

// Các lệnh ghi (insert / update) vào raw_logs
const writes = () => mock.calls.filter((c) => c.table === 'raw_logs' && c.op !== 'select')
const firstWrite = () => writes()[0].payload as Record<string, unknown>

// =====================================================================
// CHUNG: CORS, ĐĂNG NHẬP, ROUTING
// =====================================================================

test('OPTIONS trả về 200 kèm CORS header', async () => {
  const res = await send('OPTIONS')
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*')
})

test('Chưa đăng nhập -> 401, không truy vấn DB', async () => {
  mock.user = null
  const res = await send('GET', '/log-1')
  assertEquals(res.status, 401)
  assertEquals(res.json, { error: 'Please sign in to continue' })
  assertEquals(mock.calls.length, 0)
})

test('Response lỗi có Content-Type JSON và CORS header', async () => {
  const res = await send('GET', '/missing')
  assertEquals(res.headers.get('Content-Type'), 'application/json')
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*')
})

for (const method of ['PUT', 'PATCH', 'DELETE']) {
  test(`${method} /logs không có id -> 400`, async () => {
    const hasBody = method === 'PUT' || method === 'PATCH'
    const res = await send(method, '', hasBody ? {} : undefined)
    assertEquals(res.status, 400)
    assertEquals(res.json, { error: 'Log ID is required' })
  })
}


test('POST /logs/{id} -> 405', async () => {
  const res = await send('POST', '/log-1', validBody())
  assertEquals(res.status, 405)
})

test('Method không hỗ trợ (HEAD) -> 405', async () => {
  const res = await send('HEAD', '/log-1')
  assertEquals(res.status, 405)
})

// =====================================================================
// POST /logs
// =====================================================================

test('POST hợp lệ -> 201, trim title, user_id lấy từ token', async () => {
  const res = await send('POST', '', { ...validBody(), user_id: 'hacker' })
  assertEquals(res.status, 201)
  assertEquals(res.json.data.title, 'Học Deno')
  assertEquals(res.json.data.user_id, 'user-1')
  assertEquals(res.json.data.skill_id, null)
  assertEquals(res.json.data.description, null)
  assertEquals(res.json.data.is_achievement, false)
})

test('POST đủ trường tuỳ chọn -> lưu đúng skill, description (trim), achievement', async () => {
  const res = await send('POST', '', {
    ...validBody(),
    skill_id: 'skill-sys',
    description: '  ghi chú  ',
    is_achievement: true,
  })
  assertEquals(res.status, 201)
  assertEquals(firstWrite().skill_id, 'skill-sys')
  assertEquals(firstWrite().description, 'ghi chú')
  assertEquals(firstWrite().is_achievement, true)
})

test('POST description toàn khoảng trắng -> lưu null', async () => {
  await send('POST', '', { ...validBody(), description: '   ' })
  assertEquals(firstWrite().description, null)
})

test('POST lưu logged_at dạng ISO UTC', async () => {
  await send('POST', '', validBody())
  assertEquals(firstWrite().logged_at, '2026-09-26T09:00:00.000Z')
})

test('POST skill_id null và description null được chấp nhận', async () => {
  const res = await send('POST', '', { ...validBody(), skill_id: null, description: null })
  assertEquals(res.status, 201)
})

test('POST skill do chính user tạo -> 201', async () => {
  const res = await send('POST', '', { ...validBody(), skill_id: 'skill-mine' })
  assertEquals(res.status, 201)
})

test('POST skill của user khác -> 400 Skill not found', async () => {
  const res = await send('POST', '', { ...validBody(), skill_id: 'skill-other' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Skill not found' })
  assertEquals(writes().length, 0)
})

test('POST skill không có trong DB -> 400', async () => {
  const res = await send('POST', '', { ...validBody(), skill_id: 'nope' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Skill not found' })
})

test('POST goal không thuộc user -> 400 Goal not found', async () => {
  const res = await send('POST', '', { ...validBody(), goal_id: 'goal-x' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Goal not found' })
  assertEquals(writes().length, 0)
})

test('POST body không phải JSON -> 400', async () => {
  const res = await send('POST', '', undefined, '{not json')
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Invalid request body' })
})

const invalidCases: Array<[string, Record<string, unknown>, string]> = [
  ['thiếu title', { title: undefined }, 'Title is required'],
  ['title không phải chữ', { title: 123 }, 'Title is required'],
  ['title toàn khoảng trắng', { title: '   ' }, 'Title is required'],
  ['thiếu goal_id', { goal_id: undefined }, 'Goal is required'],
  ['goal_id là số', { goal_id: 1 }, 'Goal is required'],
  ['thiếu logged_at', { logged_at: undefined }, 'Date & time is required'],
  ['logged_at sai định dạng', { logged_at: 'hôm qua' }, 'Invalid date & time'],
  ['description là số', { description: 5 }, 'Invalid description'],
]

for (const [name, patch, message] of invalidCases) {
  test(`POST ${name} -> 400 "${message}"`, async () => {
    const res = await send('POST', '', { ...validBody(), ...patch })
    assertEquals(res.status, 400)
    assertEquals(res.json, { error: message })
    assertEquals(writes().length, 0)
  })
}

test('POST insert lỗi DB -> 500', async () => {
  mock.resolver = (c) => (c.op === 'insert' ? { error: { message: 'boom' } } : defaultResolver(c))
  const res = await send('POST', '', validBody())
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to create log' })
})

test('POST không còn trả / không còn đếm counts', async () => {
  const res = await send('POST', '', validBody())
  assertEquals(res.status, 201)
  assertEquals(res.json.counts, undefined)
  assertEquals(mock.calls.filter((c) => c.options?.head === true).length, 0)
})

// =====================================================================
// GET /logs
// =====================================================================

test('GET /logs -> 200, lọc theo user, chưa xoá, mới nhất trước', async () => {
  const res = await send('GET')
  assertEquals(res.status, 200)
  assertEquals(res.json, { data: [LOG] })
  assertEquals(filter(mock.calls[0], 'user_id'), 'user-1')
  assertEquals(hasNotDeletedFilter(mock.calls[0]), true)
  assertEquals(mock.calls[0].order, ['logged_at', { ascending: false }])
})

test('GET /logs/ (dấu / cuối, id rỗng) -> lấy danh sách', async () => {
  const res = await send('GET', '/')
  assertEquals(res.status, 200)
  assertEquals(res.json, { data: [LOG] })
})

test('GET /logs?goal_id= -> chỉ lấy log của goal đó', async () => {
  const res = await send('GET', '?goal_id=goal-1')
  assertEquals(res.status, 200)
  assertEquals(filter(mock.calls[0], 'goal_id'), 'goal-1')
  assertEquals(filter(mock.calls[0], 'user_id'), 'user-1')
})

test('GET /logs không có goal_id -> không lọc theo goal', async () => {
  await send('GET')
  assertEquals(filter(mock.calls[0], 'goal_id'), undefined)
})

test('GET /logs chưa có log nào -> 200, danh sách rỗng', async () => {
  mock.resolver = () => ({ data: [] })
  const res = await send('GET')
  assertEquals(res.status, 200)
  assertEquals(res.json, { data: [] })
})

test('GET /logs lỗi DB -> 500', async () => {
  mock.resolver = () => ({ error: { message: 'boom' } })
  const res = await send('GET')
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to load logs' })
})

// =====================================================================
// GET /logs/{id}
// =====================================================================

test('GET log tồn tại -> 200, lọc theo user và chưa xoá', async () => {
  const res = await send('GET', '/log-1')
  assertEquals(res.status, 200)
  assertEquals(res.json, { data: LOG })
  assertEquals(filter(mock.calls[0], 'user_id'), 'user-1')
  assertEquals(hasNotDeletedFilter(mock.calls[0]), true)
})

test('GET log không tồn tại / của user khác / đã xoá -> 404', async () => {
  const res = await send('GET', '/log-x')
  assertEquals(res.status, 404)
  assertEquals(res.json, { error: 'Log not found' })
})

test('GET lỗi DB -> 500', async () => {
  mock.resolver = () => ({ error: { message: 'boom' } })
  const res = await send('GET', '/log-1')
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to load log' })
})

// =====================================================================
// PUT /logs/{id}
// =====================================================================

test('PUT hợp lệ -> 200, trả log đã cập nhật', async () => {
  const res = await send('PUT', '/log-1', { ...validBody(), title: 'Mới' })
  assertEquals(res.status, 200)
  assertEquals(res.json.data.title, 'Mới')
  assertEquals(hasNotDeletedFilter(writes()[0]), true)
})

test('PUT không gửi is_achievement -> giữ nguyên is_achievement', async () => {
  await send('PUT', '/log-1', validBody())
  assertEquals('is_achievement' in firstWrite(), false)
})

test('PUT có gửi is_achievement -> cập nhật', async () => {
  await send('PUT', '/log-1', { ...validBody(), is_achievement: true })
  assertEquals(firstWrite().is_achievement, true)
})

test('PUT không gửi description -> giữ nguyên description', async () => {
  await send('PUT', '/log-1', validBody())
  assertEquals('description' in firstWrite(), false)
})

for (const value of [null, '', '   ']) {
  test(`PUT description=${JSON.stringify(value)} -> xoá description`, async () => {
    await send('PUT', '/log-1', { ...validBody(), description: value })
    assertEquals(firstWrite().description, null)
  })
}

test('PUT có gửi description -> lưu (trim)', async () => {
  await send('PUT', '/log-1', { ...validBody(), description: '  ghi chú  ' })
  assertEquals(firstWrite().description, 'ghi chú')
})

test('PUT bỏ skill_id -> skill_id thành null', async () => {
  await send('PUT', '/log-1', validBody())
  assertEquals(firstWrite().skill_id, null)
})

test('PUT lưu logged_at dạng ISO UTC', async () => {
  await send('PUT', '/log-1', validBody())
  assertEquals(firstWrite().logged_at, '2026-09-26T09:00:00.000Z')
})

test('PUT không cho đổi user_id', async () => {
  await send('PUT', '/log-1', { ...validBody(), user_id: 'hacker' })
  assertEquals('user_id' in firstWrite(), false)
})

test('PUT log không tồn tại -> 404', async () => {
  const res = await send('PUT', '/log-x', validBody())
  assertEquals(res.status, 404)
  assertEquals(res.json, { error: 'Log not found' })
})

test('PUT title rỗng -> 400', async () => {
  const res = await send('PUT', '/log-1', { ...validBody(), title: '' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Title is required' })
})

test('PUT goal không thuộc user -> 400', async () => {
  const res = await send('PUT', '/log-1', { ...validBody(), goal_id: 'goal-x' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Goal not found' })
})

test('PUT skill của user khác -> 400', async () => {
  const res = await send('PUT', '/log-1', { ...validBody(), skill_id: 'skill-other' })
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Skill not found' })
})

test('PUT body không phải JSON -> 400', async () => {
  const res = await send('PUT', '/log-1', undefined, 'abc')
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Invalid request body' })
})

test('PUT lỗi DB -> 500', async () => {
  mock.resolver = (c) => (c.op === 'update' ? { error: { message: 'boom' } } : defaultResolver(c))
  const res = await send('PUT', '/log-1', validBody())
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to update log' })
})

// =====================================================================
// PATCH /logs/{id}
// =====================================================================

for (const value of [true, false]) {
  test(`PATCH is_achievement=${value} -> 200`, async () => {
    const res = await send('PATCH', '/log-1', { is_achievement: value })
    assertEquals(res.status, 200)
    assertEquals(res.json.data.is_achievement, value)
    assertEquals(writes()[0].payload, { is_achievement: value })
  })
}

test('PATCH chỉ cập nhật is_achievement, bỏ qua trường khác', async () => {
  await send('PATCH', '/log-1', { is_achievement: true, title: 'hack' })
  assertEquals(writes()[0].payload, { is_achievement: true })
})

for (const bad of [undefined, 'true', 1, null]) {
  test(`PATCH is_achievement=${JSON.stringify(bad)} -> 400`, async () => {
    const res = await send('PATCH', '/log-1', { is_achievement: bad })
    assertEquals(res.status, 400)
    assertEquals(res.json, { error: 'is_achievement must be true or false' })
  })
}

test('PATCH body không phải JSON -> 400', async () => {
  const res = await send('PATCH', '/log-1', undefined, '')
  assertEquals(res.status, 400)
  assertEquals(res.json, { error: 'Invalid request body' })
})

test('PATCH log không tồn tại -> 404', async () => {
  const res = await send('PATCH', '/log-x', { is_achievement: true })
  assertEquals(res.status, 404)
  assertEquals(res.json, { error: 'Log not found' })
})

test('PATCH lỗi DB -> 500', async () => {
  mock.resolver = (c) => (c.op === 'update' ? { error: { message: 'boom' } } : defaultResolver(c))
  const res = await send('PATCH', '/log-1', { is_achievement: true })
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to update achievement' })
})

// =====================================================================
// DELETE /logs/{id}
// =====================================================================

test('DELETE -> 200, soft delete (ghi deleted_at), trả id của log', async () => {
  const res = await send('DELETE', '/log-1')
  assertEquals(res.status, 200)
  assertEquals(res.json, { data: { id: 'log-1' } })
  const w = writes()[0]
  assertEquals(w.op, 'update')
  const deletedAt = (w.payload as Record<string, string>).deleted_at
  assertEquals(isNaN(new Date(deletedAt).getTime()), false)
  assertEquals(hasNotDeletedFilter(w), true)
})

test('DELETE log không tồn tại / đã xoá -> 404', async () => {
  const res = await send('DELETE', '/log-x')
  assertEquals(res.status, 404)
  assertEquals(res.json, { error: 'Log not found' })
})

test('DELETE lỗi DB -> 500', async () => {
  mock.resolver = () => ({ error: { message: 'boom' } })
  const res = await send('DELETE', '/log-1')
  assertEquals(res.status, 500)
  assertEquals(res.json, { error: 'Failed to delete log' })
})
