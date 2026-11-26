import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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

  const {data : {user}} = await supabase.auth.getUser ()
  {
      // Kiểm tra có người đăng nhập không (user có null hay không)
    if (!user) {
      return new Response ('Not verified', {status: 401, headers: corsHeaders})
    }
}
  // TODO: code các endpoint của Profiles ở đây, rẽ nhánh theo req.method

  // ----- GET PROFILE ----- 
  if (req.method === 'GET') {

      const {data, error} = await supabase
        .from('profiles')
        .select()
        .eq('id',user.id)
        .maybeSingle() // .single() coi "0 dòng" là lỗi (→ 500). .maybeSingle() thì trả data = null, không có error

      // error ở đây là lỗi thật của server/database (mất kết nối, sai tên cột...) → 500
      if (error) {
      return Response.json(error.message, {status: 500, headers: corsHeaders })
    }
      // Không có error nhưng data = null: user này không có dòng nào trong bảng profiles → 404
      if (!data) {
        return Response.json('Profile not found', {status: 404, headers: corsHeaders})
      }
      return Response.json(data, {status: 200, headers: corsHeaders})
  }

   // ---- PATCH PROFILE ---- 

  if (req.method === 'PATCH') {
      const {data, error} = await supabase
        .from('profiles')
        .update ({obd_completed: true}) // {} truyền 1 object
        .eq('id',user.id)
        .select().maybeSingle() // giống GET: không có dòng nào để sửa thì data = null, không báo error

      if (error) {
        return Response.json(error.message, {status: 500, headers: corsHeaders})
      }
      // Không sửa được dòng nào vì user không có profile → 404
      if (!data) {
        return Response.json('Profile not found', {status: 404, headers: corsHeaders})
      }
      return Response.json(data, {status: 200, headers: corsHeaders})
      
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
