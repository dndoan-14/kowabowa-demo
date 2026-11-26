//Supabase Edge Function: goals
//
//  GET       /goals           ->  list goals (view goal_stats, counts)
//  POST      /goals           ->  create goal
//  GET       /goals/:id       ->  goal detail: {goal, logs, skills}
//  PUT       /goals/:id       ->  update goal
//  DELETE    /goals/:id        ->  delete goal
//  GET       /goals/:id/logs   ->  load log của goal
//  POST      /goals/:id/logs  ->  add log to goal

import { createClient } from "npm:@supabase/supabase-js@2";

// ----------------------------- helpers -------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-type": "application/json" },
  });

const noContent = () =>
  new Response(null, { status: 204, headers: corsHeaders });

// Thành công: luôn bọc { data } cho khớp FE (response.data.data)
const ok = (data: any, status = 200) => json({ data }, status);

// Lỗi validate: có cả `error` (FE interceptor đọc) và `errors` (lỗi theo field)
const badRequest = (errors: Record<string, string>) =>
  json({ error: "Validation failed", errors }, 400);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateGoal(b: any) {
  const errors: Record<string, string> = {};
  if (!b.title?.trim()) errors.title = "Title is required";
  else if (b.title.trim().length > 120)
    errors.title = "Keep it under 120 characters";
  if (b.description && b.description.length > 500)
    errors.description = "Keep it under 500 characters";
  if (!b.start_date) errors.start_date = "Start date is required";
  if (!b.end_date) errors.end_date = "End date is required";
  if (b.start_date && b.end_date && b.end_date < b.start_date) {
    errors.end_date = "End date must be after start date";
  }
  return errors;
}

function validateLog(b: any) {
  const errors: Record<string, string> = {};
  if (!b.title?.trim()) errors.title = "Title is required";
  if (!b.logged_at) errors.logged_at = "Date is required";
  return errors;
}

const hasErrors = (e: any) => Object.keys(e).length > 0;

// ----------------------------- handlers -------------------------------
// Mọi endpoint của Goals nằm trong function này.

// GET /goals
async function listGoals(supabase: any, user: any) {
  const { data, error } = await supabase
    .from("goal_stats")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
}

// POST /goals
async function createGoal(supabase: any, user: any, body: any) {
  const errors = validateGoal(body);
  if (hasErrors(errors)) return badRequest(errors);

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: user.id,
      title: body.title.trim(),
      description: body.description ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
    })
    .select()
    .single();
  if (error) throw error;
  return ok(data, 201);
}

// GET /goals/:id       -> call 3 queries in parallel
async function getGoalDetail(supabase: any, user: any, id: any) {
  const [goalRes, logsRes, skillsRes] = await Promise.all([
    supabase
      .from("goals")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("raw_logs")
      .select("*, skill:skills(id,title)")
      .eq("goal_id", id)
      .is("deleted_at", null)
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false }),
    supabase
      .from("skills")
      .select("id,title,description,is_system")
      .or(`user_id.eq.${user.id},is_system.eq.true`)
      .order("title"),
  ]);
  if (goalRes.error) throw goalRes.error;
  if (logsRes.error) throw logsRes.error;
  if (skillsRes.error) throw skillsRes.error;
  if (!goalRes.data) return json({ error: "Goal not found" }, 404);

  return ok({
    goal: goalRes.data,
    logs: logsRes.data,
    skills: skillsRes.data,
  });
}

// PUT goals/:id
async function updateGoal(supabase: any, user: any, id: any, body: any) {
  const errors = validateGoal(body);
  if (hasErrors(errors)) return badRequest(errors);

  const { data, error } = await supabase
    .from("goals")
    .update({
      title: body.title.trim(),
      description: body.description ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return json({ error: "Goal not found" }, 404);
  return ok(data);
}

// DELETE /goals/:id
async function deleteGoal(supabase: any, user: any, id: any) {
  const { data, error } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) throw error;
  if (!data.length) return json({ error: "Goal not found" }, 404);
  return noContent();
}

// GET /goals/:id/logs
async function getLogs(supabase: any, user: any, goalId: any) {
  const { data, error } = await supabase
    .from("raw_logs")
    .select("*, skill:skills(id,title)")
    .eq("goal_id", goalId)
    .is("deleted_at", null)
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return ok(data);
}

// POST /goals/:id/logs
async function createLog(supabase: any, user: any, goalId: any, body: any) {
  const errors = validateLog(body);
  if (hasErrors(errors)) return badRequest(errors);

  // Make sure this goal belong to this user (RLS hides other users' goals)
  const { data: goal } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return json({ error: "Goal not found" }, 404);

  const { data, error } = await supabase
    .from("raw_logs")
    .insert({
      goal_id: goalId,
      user_id: user.id,
      title: body.title.trim(),
      description: body.description ?? null,
      logged_at: body.logged_at,
      skill_id: body.skill_id ?? null,
      is_achievement: body.is_achievement ?? false,
    })
    .select("*,skill:skills(id, title)")
    .single();
  if (error) throw error;
  return ok(data, 201);
}

// ---------------------------- router --------------------------
// URL: /functions/v1/goals

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Client dùng token của người đang đăng nhập, nên policy theo auth.uid() vẫn có hiệu lực
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // /functions/v1/goals/123/logs -> id='123', sub='logs'
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const [id, sub] = parts.slice(parts.indexOf("goals") + 1);
  if (id && !UUID_RE.test(id)) return json({ error: "Invalid goal id" }, 400);
  const body = ["POST", "PUT"].includes(req.method)
    ? await req.json().catch(() => ({}))
    : null;

  // TODO: code các endpoint của Goals ở đây, rẽ nhánh theo req.method
  try {
    if (!id) {
      if (req.method === "GET") return await listGoals(supabase, user);
      if (req.method === "POST") return await createGoal(supabase, user, body);
    } else if (!sub) {
      if (req.method === "GET") return await getGoalDetail(supabase, user, id);
      if (req.method === "PUT")
        return await updateGoal(supabase, user, id, body);
      if (req.method === "DELETE") return await deleteGoal(supabase, user, id);
    } else if (sub === "logs") {
      if (req.method === "GET") return await getLogs(supabase, user, id);
      if (req.method === "POST")
        return await createLog(supabase, user, id, body);
    }
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
});
