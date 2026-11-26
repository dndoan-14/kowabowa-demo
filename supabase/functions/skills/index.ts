import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

// Bỏ khoảng trắng thừa:
function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

// Báo lỗi nếu title trống, chỉ có khoảng trắng hoặc ko phải chữ
function validateSkill(title: unknown, description: unknown) {
  if (typeof title !== "string" || !cleanText(title)) {
    return "Title is required";
  }
  if (description != null && typeof description !== "string") {
    return "Description must be text";   // trả về dạng lỗi thay vì cụ thể message
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Check trùng (không phân biệt hoa thường)
async function isDuplicate(title: string, userId: string, skipId?: string) {
  const { data } = await supabase
    .from("skills")
    .select("id, title")
    .or(`user_id.eq.${userId},is_system.eq.true`);

  return (data ?? []).some((skill) =>
    skill.id !== skipId &&
    cleanText(skill.title).toLowerCase() === title.toLowerCase()
  );
}

// URL: /functions/v1/skills
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);

  // GET
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .or(`user_id.eq.${user.id},is_system.eq.true`)
      .order("created_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);
    return json({ data });
  }

  // POST
  if (req.method === "POST") {
    const { title, description } = await req.json();
    const invalid = validateSkill(title, description);
    if (invalid) return json({ error: invalid }, 400);

    const cleanTitle = cleanText(title);
    if (await isDuplicate(cleanTitle, user.id)) {
      return json({ error: "Skill already exists" }, 409);
    }

    const { data, error } = await supabase
      .from("skills")
      .insert({
        title: cleanTitle,
        description,
        user_id: user.id,
        is_system: false,    // user_id = null vs. is_system -> null thì tiết kiệm được 1 cột, nhưng is_system thì tường minh hơn 
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data }, 201);
  }

  // PATCH
  if (req.method === "PATCH") {
    const { id, title, description } = await req.json();
    if (!id) {
      return json({ error: "Missing ID" }, 400);
    }
    const invalid = validateSkill(title, description);
    if (invalid) return json({ error: invalid }, 400);

    const cleanTitle = cleanText(title);
    if (await isDuplicate(cleanTitle, user.id, id)) {
      return json({ error: "Skill already exists" }, 409);
    }

    const { data, error } = await supabase
      .from("skills")
      .update({ title: cleanTitle, description })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_system", false)
      .select()
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Skill not found" }, 404);
    return json({ data });
  }

  // DELETE:
  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return json({ error: "Missing ID" }, 400);
    }

    // Skill đang được dùng trong log thì không cho xoá
    const { count, error: countError } = await supabase
      .from("raw_logs")
      .select("id", { count: "exact", head: true })
      .eq("skill_id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (countError) return json({ error: countError.message }, 500);
    if (count) {
      return json({ error: "Skill is used in logs", log_count: count }, 409);
    }

    const { data, error } = await supabase
      .from("skills")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_system", false)
      .select()
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Skill not found" }, 404);
    return json({ data });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
});
