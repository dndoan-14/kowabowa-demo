import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
}

// =====================================================================
// KIỂU DỮ LIỆU DÙNG CHO CÁC HÀM PHỤ
// =====================================================================

// Kiểu của biến supabase.
// "any" nghĩa là "chấp nhận mọi kiểu", để không phải import thêm gì ngoài createClient.
// deno-lint-ignore no-explicit-any
type SupabaseClient = any

// Kiểu của user: các hàm phụ chỉ cần dùng id của user
type User = {
  id: string
}

// =====================================================================
// HÀM TRẢ LỜI CHUNG
// =====================================================================

// Khai 1 lần để tạo mẫu trả lời JSON chung cho tất cả các endpoint.
// body: dữ liệu muốn trả về, status: mã trạng thái (200, 201, 400, 404...)
const jsonResponse = (body: unknown, status: number) => {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {...corsHeaders, 'Content-Type':'application/json'},
  })
}

// Mẫu trả lời khi có lỗi. Luôn có dạng: { "error": "thông báo lỗi" }
const jsonError = (message: string, status: number) => {
  return jsonResponse({ error: message }, status)
}

// =====================================================================
// HÀM KIỂM TRA DỮ LIỆU
// =====================================================================

// Lấy id của log từ URL.
// URL "/logs/abc123" cắt theo dấu "/" sẽ được: ['', 'logs', 'abc123']
// -> id là phần tử thứ 3 (vị trí số 2, vì máy tính đếm từ 0)
// URL "/logs" không có phần tử thứ 3 -> trả về null (không có id)
const getIdFromUrl = (url: string) => {
  const parts = new URL(url).pathname.split('/')
  const id = parts[2]

  if (id === undefined || id === '') {
    return null
  }
  return id
}

// Đọc body của request.
// Nếu body không phải JSON hợp lệ -> trả về null
const readJsonBody = async (req: Request) => {
  try {
    const body = await req.json()
    return body
  } catch (_error) {
    return null
  }
}

// Kiểm tra các trường của log (dùng chung cho POST và PUT).
// Có lỗi -> trả về thông báo lỗi. Không có lỗi -> trả về null.
const findLogFieldError = (body: Record<string, unknown>) => {
  // Log (title) - bắt buộc
  if (typeof body.title !== 'string') {
    return 'Log là bắt buộc'
  }
  if (body.title.trim() === '') {
    return 'Log là bắt buộc'
  }

  // Goal (goal_id) - bắt buộc
  if (typeof body.goal_id !== 'string') {
    return 'Goal là bắt buộc'
  }

  // Date & time (logged_at) - bắt buộc, vd: "2026-09-26T16:00:00+07:00"
  if (typeof body.logged_at !== 'string') {
    return 'Date & time là bắt buộc'
  }
  const loggedAt = new Date(body.logged_at)
  if (isNaN(loggedAt.getTime())) {
    return 'Date & time không hợp lệ'
  }

  // Skills (skill_id) - không bắt buộc. Nếu có gửi thì phải là chữ.
  if (body.skill_id !== undefined && body.skill_id !== null) {
    if (typeof body.skill_id !== 'string') {
      return 'Skill không hợp lệ'
    }
  }

  // Description - không bắt buộc. Nếu có gửi thì phải là chữ.
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return 'Description không hợp lệ'
    }
  }

  // Achievement (is_achievement) - không bắt buộc. Nếu có gửi thì phải là true hoặc false.
  if (body.is_achievement !== undefined) {
    if (typeof body.is_achievement !== 'boolean') {
      return 'Achievement phải là true hoặc false'
    }
  }

  return null
}

// Kiểm tra goal có tồn tại và thuộc về user đang đăng nhập không
const checkGoalBelongsToUser = async (supabase: SupabaseClient, user: User, goalId: string) => {
  const result = await supabase
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (result.data === null) {
    return false
  }
  return true
}

// Kiểm tra skill có được phép dùng không:
// skill của hệ thống (is_system = true) hoặc skill do chính user tạo
const checkSkillCanBeUsed = async (supabase: SupabaseClient, user: User, skillId: string) => {
  const result = await supabase
    .from('skills')
    .select('id, user_id, is_system')
    .eq('id', skillId)
    .maybeSingle()

  if (result.data === null) {
    return false
  }
  if (result.data.is_system === true) {
    return true
  }
  if (result.data.user_id === user.id) {
    return true
  }
  return false
}

// =====================================================================
// BỘ ĐẾM LOGS / ACHIEVEMENTS
// Sau mỗi lần POST / PUT / PATCH / DELETE thành công, trả về số đếm mới
// để FE cập nhật con số trên màn hình (Logs 13, Achievements 3...).
// =====================================================================

// Đếm số log của user (chưa bị xoá).
// goalId khác null -> chỉ đếm log của goal đó.
// onlyAchievements = true -> chỉ đếm log được đánh dấu achievement.
const countLogs = async (
  supabase: SupabaseClient,
  user: User,
  goalId: string | null,
  onlyAchievements: boolean,
) => {
  let query = supabase
    .from('raw_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (goalId !== null) {
    query = query.eq('goal_id', goalId)
  }
  if (onlyAchievements === true) {
    query = query.eq('is_achievement', true)
  }

  const result = await query
  if (result.error !== null) {
    return null
  }
  return result.count
}

// Gom tất cả số đếm vào 1 object
const getCounts = async (supabase: SupabaseClient, user: User, goalId: string | null) => {
  const totalLogs = await countLogs(supabase, user, null, false)
  const totalAchievements = await countLogs(supabase, user, null, true)

  let goalLogs = null
  let goalAchievements = null
  if (goalId !== null) {
    goalLogs = await countLogs(supabase, user, goalId, false)
    goalAchievements = await countLogs(supabase, user, goalId, true)
  }

  return {
    logs: totalLogs,
    achievements: totalAchievements,
    goal_logs: goalLogs,
    goal_achievements: goalAchievements,
  }
}

// =====================================================================
// CÁC ENDPOINT
// =====================================================================

// POST /logs
// Tạo log mới khi bấm "Save" hoặc "Save & Create new".
// (Hai nút gọi cùng 1 endpoint, FE tự quyết định đóng modal hay xoá trắng form.)
const postLog = async (supabase: SupabaseClient, user: User, req: Request) => {
  // 1. Body phải là JSON
  const body = await readJsonBody(req)
  if (body === null) {
    return jsonError('Body phải là JSON hợp lệ', 400)
  }

  // 2. Kiểm tra các trường bắt buộc (Log, Goal, Date & time)
  const fieldError = findLogFieldError(body)
  if (fieldError !== null) {
    return jsonError(fieldError, 400)
  }

  const goalId = String(body.goal_id)

  // 3. Goal phải thuộc về user
  const goalIsValid = await checkGoalBelongsToUser(supabase, user, goalId)
  if (goalIsValid === false) {
    return jsonError('Goal không tồn tại', 400)
  }

  // 4. Skill (nếu có) phải được phép dùng
  let skillId = null
  if (typeof body.skill_id === 'string') {
    skillId = body.skill_id
    const skillIsValid = await checkSkillCanBeUsed(supabase, user, skillId)
    if (skillIsValid === false) {
      return jsonError('Skill không tồn tại', 400)
    }
  }

  // 5. Chuẩn bị dữ liệu để lưu
  let description = null
  if (typeof body.description === 'string') {
    if (body.description.trim() !== '') {
      description = body.description.trim()
    }
  }

  let isAchievement = false
  if (body.is_achievement === true) {
    isAchievement = true
  }

  const newLog = {
    user_id: user.id, // luôn lấy từ token, không tin user_id do client gửi
    title: String(body.title).trim(),
    goal_id: goalId,
    skill_id: skillId,
    logged_at: String(body.logged_at),
    description: description,
    is_achievement: isAchievement,
  }

  // 6. Tạo log
  const result = await supabase
    .from('raw_logs')
    .insert(newLog)
    .select()
    .single()

  if (result.error !== null) {
    return jsonError('Không tạo được log', 500)
  }

  // 7. Trả log vừa tạo + số đếm mới
  const counts = await getCounts(supabase, user, goalId)
  return jsonResponse({ log: result.data, counts: counts }, 201)
}

// GET /logs
// Lấy danh sách tất cả log của user (chưa bị xoá), log mới nhất nằm trên cùng.
const getLogs = async (supabase: SupabaseClient, user: User) => {
  const result = await supabase
    .from('raw_logs')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('logged_at', { ascending: false })

  if (result.error !== null) {
    return jsonError('Không lấy được danh sách log', 500)
  }

  // Chưa có log nào -> result.data là danh sách rỗng [], vẫn trả 200
  return jsonResponse({ logs: result.data }, 200)
}

// GET /logs/{id}
// Lấy thông tin 1 log để điền sẵn vào form Edit log.
const getLog = async (supabase: SupabaseClient, user: User, id: string) => {
  const result = await supabase
    .from('raw_logs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (result.error !== null) {
    return jsonError('Không lấy được log', 500)
  }

  // Không có log nào khớp id (hoặc log của người khác, hoặc đã xoá)
  if (result.data === null) {
    return jsonError('Log not found', 404)
  }

  return jsonResponse({ log: result.data }, 200)
}

// PUT /logs/{id}
// Cập nhật log khi bấm "Save changes".
// FE gửi lại đầy đủ các trường của form (giống POST).
const putLog = async (supabase: SupabaseClient, user: User, id: string, req: Request) => {
  // 1. Body phải là JSON
  const body = await readJsonBody(req)
  if (body === null) {
    return jsonError('Body phải là JSON hợp lệ', 400)
  }

  // 2. Kiểm tra các trường bắt buộc (Log, Goal, Date & time)
  const fieldError = findLogFieldError(body)
  if (fieldError !== null) {
    return jsonError(fieldError, 400)
  }

  const goalId = String(body.goal_id)

  // 3. Goal phải thuộc về user
  const goalIsValid = await checkGoalBelongsToUser(supabase, user, goalId)
  if (goalIsValid === false) {
    return jsonError('Goal không tồn tại', 400)
  }

  // 4. Skill (nếu có) phải được phép dùng
  let skillId = null
  if (typeof body.skill_id === 'string') {
    skillId = body.skill_id
    const skillIsValid = await checkSkillCanBeUsed(supabase, user, skillId)
    if (skillIsValid === false) {
      return jsonError('Skill không tồn tại', 400)
    }
  }

  // 5. Chuẩn bị dữ liệu để lưu
  let description = null
  if (typeof body.description === 'string') {
    if (body.description.trim() !== '') {
      description = body.description.trim()
    }
  }

  const changes: Record<string, unknown> = {
    title: String(body.title).trim(),
    goal_id: goalId,
    skill_id: skillId,
    logged_at: String(body.logged_at),
    description: description,
  }

  // Chỉ đổi is_achievement khi FE có gửi lên. Không gửi -> giữ nguyên giá trị cũ.
  if (typeof body.is_achievement === 'boolean') {
    changes.is_achievement = body.is_achievement
  }

  // 6. Cập nhật. Chỉ cập nhật được log của chính user và chưa bị xoá.
  const result = await supabase
    .from('raw_logs')
    .update(changes)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (result.error !== null) {
    return jsonError('Không cập nhật được log', 500)
  }

  // Không có dòng nào được cập nhật -> không tìm thấy log (hoặc không phải log của user)
  if (result.data === null) {
    return jsonError('Log not found', 404)
  }

  // 7. Trả log đã cập nhật + số đếm mới
  const counts = await getCounts(supabase, user, goalId)
  return jsonResponse({ log: result.data, counts: counts }, 200)
}

// PATCH /logs/{id}
// Bật / tắt trạng thái achievement của log.
// Body: { "is_achievement": true } hoặc { "is_achievement": false }
const patchLog = async (supabase: SupabaseClient, user: User, id: string, req: Request) => {
  // 1. Body phải là JSON
  const body = await readJsonBody(req)
  if (body === null) {
    return jsonError('Body phải là JSON hợp lệ', 400)
  }

  // 2. is_achievement là bắt buộc và phải là true / false
  if (typeof body.is_achievement !== 'boolean') {
    return jsonError('is_achievement phải là true hoặc false', 400)
  }

  // 3. Cập nhật
  const result = await supabase
    .from('raw_logs')
    .update({ is_achievement: body.is_achievement })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (result.error !== null) {
    return jsonError('Không cập nhật được achievement', 500)
  }

  if (result.data === null) {
    return jsonError('Log not found', 404)
  }

  // 4. Trả log đã cập nhật + số đếm mới
  const counts = await getCounts(supabase, user, result.data.goal_id)
  return jsonResponse({ log: result.data, counts: counts }, 200)
}

// DELETE /logs/{id}
// Xoá log. Bảng raw_logs có cột deleted_at, nên "xoá" ở đây là ghi thời điểm xoá
// vào deleted_at. Mọi endpoint khác đều bỏ qua log có deleted_at, nên với người dùng
// log đã biến mất (kể cả khỏi Achievements và các bộ đếm).
const deleteLog = async (supabase: SupabaseClient, user: User, id: string) => {
  const result = await supabase
    .from('raw_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (result.error !== null) {
    return jsonError('Không xoá được log', 500)
  }

  // Không tìm thấy log, log của người khác, hoặc log đã xoá từ trước
  if (result.data === null) {
    return jsonError('Log not found', 404)
  }

  // Trả id của log đã xoá + số đếm mới
  const counts = await getCounts(supabase, user, result.data.goal_id)
  return jsonResponse({ deleted_id: id, counts: counts }, 200)
}

// Mọi endpoint của Logs nằm trong function này.
// URL: /functions/v1/logs
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Client dùng token của người đang đăng nhập, nên policy theo auth.uid() vẫn có hiệu lực
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )

  // 1. Kiểm tra đăng nhập (function để verify_jwt = false nên phải tự kiểm tra)
  const userResult = await supabase.auth.getUser()
  if (userResult.error !== null || userResult.data.user === null) {
    return jsonError('Bạn chưa đăng nhập', 401)
  }
  const user = userResult.data.user

  // 2. Lấy id từ URL (/logs/{id}). Không có id -> null
  const id = getIdFromUrl(req.url)

  // 3. Rẽ nhánh theo req.method

  // POST /logs
  if (req.method === 'POST' && id === null) {
    return await postLog(supabase, user, req)
  }

  // GET /logs      -> lấy cả danh sách log
  // GET /logs/{id} -> lấy 1 log
  if (req.method === 'GET') {
    if (id === null) {
      return await getLogs(supabase, user)
    }
    return await getLog(supabase, user, id)
  }

  // PUT /logs/{id}
  if (req.method === 'PUT') {
    if (id === null) {
      return jsonError('Thiếu id của log', 400)
    }
    return await putLog(supabase, user, id, req)
  }

  // PATCH /logs/{id}
  if (req.method === 'PATCH') {
    if (id === null) {
      return jsonError('Thiếu id của log', 400)
    }
    return await patchLog(supabase, user, id, req)
  }

  // DELETE /logs/{id}
  if (req.method === 'DELETE') {
    if (id === null) {
      return jsonError('Thiếu id của log', 400)
    }
    return await deleteLog(supabase, user, id)
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
