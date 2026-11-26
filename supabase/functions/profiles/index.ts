import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
}

// ---- Helper ----
// Mọi response có nội dung đều đi qua hàm này để cùng 1 dạng và luôn có CORS header
// thành công: json({data})
// lỗi: json({error: '...'}, 404)

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mọi endpoint của Profiles nằm trong function này.
// URL: /functions/v1/profiles
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

  // Dòng này gửi token lên Supabse để hỏi token này của ai, và nhận về một object mô tả người đó
  //   user = {
  //   id: 'bff7b798-1b4d-47cb-8ab8-7fcce01ec715',
  //   email: 'eliotran2690@gmail.com',
  //   ...
  // }                          

  const { data: { user } } = await supabase.auth.getUser()

  // Kiểm tra có người đăng nhập không (user có null hay không)
  if (!user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // --- GET PROFILES --- ĐỌC PROFILE CỦA MÌNH
  // GET /profiles

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select()
      .eq('id', user.id)
      .maybeSingle()
    // .single() coi "O dòng" là lỗi 500, .maybeSingle() thì trả data = null, không có error

    // error ở đây là lỗi thật của server/database (mất kết nối, sai tên côt...) -> 500
    if (error) {
      return json({ error: error.message }, 500)
    }

    // ko có lỗi, nhưng data = NULL: user này không có dòng nào trong bảng profile -> 404
    if (!data) {
      return json({ error: 'Profile not found' }, 404)
    }

    // Gọi skills count, viết sau if(!data) vì Profile not found thì ko chạy hàm này
    const { data: skillsData, error: skillsError } = await supabase
      .from('skills_used_count')
      .select('skills_count')
      .eq('user_id', user.id)
      .maybeSingle()
    // user chưa có log nào, tất cả log đã xóa mềm -> single() sẽ báo lỗi, maybeSingle() -> data = null
    // user có log nhưng log ko có skill -> view vẫn có dòng vs skills_count = 0 -> cái này để signle() vẫn chạy đưuocj
    if (skillsError) {
      return json({ error: skillsError.message }, 500)
    }
    return json({ data: { ...data, skills_count: skillsData?.skills_count ?? 0 } })
  }

  // --- PATCH PROFILES --- ĐÁNH DẤU COMPLETED ONBOARDING
  // PATCH /profiles

  if (req.method === 'PATCH') {
    const { data, error } = await supabase
      .from('profiles')
      .update({ obd_completed: true }) // {truyền 1 object}
      .eq('id', user.id)
      .select()
      .maybeSingle() // không có dòng nào để sửa thì data = NULL, ko báo error

    if (error) {
      return json({ error: error.message }, 500)
    }

    // Không sửa được dòng nào vì user không có profile -> 404
    if (!data) {
      return json({ error: "Profile not found" }, 404)
    }
    return json({ data })
  }

  // --- PUT PROFILES --- SỬA HỌ TÊN, NGÀY SINH
  // PUT /profiles 

  if (req.method === 'PUT') {
    // 1. Đọc body. Không phải JSON thì body = NULL
    const body = await req.json().catch(() => null)

    // Body phải là object dạng {...}
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json({ error: 'Body must be a JSON object' }, 400)
    }

    // 2. Chỉ lấy đúng 3 filed, field thừa bị bỏ qua
    const { first_name, last_name, date_of_birth } = body

    // 3. Validate first_name
    // first_name: phải là chuỗi, không rỗng sau khi trim
    if (typeof first_name !== 'string' || first_name.trim() === '') {
      return json({ error: 'First name is required' }, 400)
    }
    const firstName = first_name.trim()

    // 4. Validate last_name
    // last_name: phải là chuỗi, không rỗng sau khi trim
    if (typeof last_name !== 'string' || last_name.trim() === '') {
      return json({ error: 'Last name is required' }, 400)
    }
    const lastName = last_name.trim()

    // 5. Validate date_of_birth
    // date phải là chuỗi
    if (typeof date_of_birth !== 'string') {
      return json({ error: 'Date of birth is required' }, 400)
    }

    // đúng dạng YYYY-MM-DD. Regex .test() trả true khi khớp, ! bắt trường hợp không khớp
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
      return json({ error: 'Date of birth must be in YYYY-MM-DD format' }, 400)
    }
    const dob = new Date(date_of_birth)

    // date phải là ngày có thật
    if (isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== date_of_birth) {
      return json({ error: 'Date of birth is not a real date' }, 400)
    }

    // date không được ở tương lai
    if (dob > new Date()) {
      return json({ error: 'Date of birth cannot be in the future' }, 400)
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        date_of_birth: date_of_birth,
      })
      .eq('id', user.id)
      .select() // trả lại dòng profile được sửa
      .maybeSingle()

    if (error) {
      return json({ error: error.message }, 500)
    }

    // Không sửa được dòng nào vì user không có profile -> 404
    if (!data) {
      return json({ error: "Profile not found" }, 404)
    }
    return json({ data })

  }


  return json({ error: 'Method not allowed' }, 405)

})

