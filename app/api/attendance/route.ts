import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const allowedActions = new Set(["identity_submit", "join_meeting", "leave_meeting"]);

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authenticated session" }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { meetingId?: string; eligibleVoterId?: string; action?: string } | null;
  if (!body?.meetingId || !body.eligibleVoterId || !body.action || !allowedActions.has(body.action)) {
    return NextResponse.json({ error: "Invalid attendance event" }, { status: 400 });
  }

  const [{ data: eligible, error: eligibleError }, { data: meeting, error: meetingError }] = await Promise.all([
    supabase
      .from("meeting_eligible_voters")
      .select("id,meeting_id,profile_id,representative_email,identity_status")
      .eq("id", body.eligibleVoterId)
      .eq("meeting_id", body.meetingId)
      .maybeSingle(),
    supabase.from("meetings").select("id,status").eq("id", body.meetingId).maybeSingle(),
  ]);

  if (eligibleError || meetingError || !eligible || !meeting) {
    return NextResponse.json({ error: "ไม่พบสิทธิ์เข้าร่วมการประชุมนี้" }, { status: 403 });
  }
  const profileMatches = eligible.profile_id === userData.user.id;
  if (!profileMatches) {
    const { data: linked, error: linkError } = await supabase.rpc("link_eligible_voter_profile", {
      target_eligible_voter_id: eligible.id,
      target_meeting_id: body.meetingId,
    });
    if (linkError) {
      const migrationMissing = linkError.message.includes("link_eligible_voter_profile");
      return NextResponse.json({
        error: migrationMissing ? "กรุณารัน 016_fix_identity_profile_link.sql ใน Supabase ก่อน" : linkError.message,
      }, { status: 403 });
    }
    if (linked !== true) return NextResponse.json({ error: "รายชื่อผู้มีสิทธิ์นี้ไม่ตรงกับบัญชีที่ Login" }, { status: 403 });
  }
  if (body.action === "identity_submit" && !["identity_open", "in_progress"].includes(meeting.status)) {
    return NextResponse.json({ error: "การประชุมยังไม่เปิดรับการแสดงตน" }, { status: 409 });
  }
  if (["join_meeting", "leave_meeting"].includes(body.action)) {
    if (eligible.identity_status !== "verified") {
      return NextResponse.json({ error: "ต้องผ่านการยืนยันตัวตนก่อน" }, { status: 403 });
    }
    if (meeting.status !== "in_progress") {
      return NextResponse.json({ error: "การประชุมยังไม่อยู่ในสถานะกำลังประชุม" }, { status: 409 });
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent");
  const metadata = { source: "web_attendance_api", path: "/meetings" };

  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance_logs")
    .insert({
      meeting_id: body.meetingId,
      eligible_voter_id: body.eligibleVoterId,
      profile_id: userData.user.id,
      action: body.action,
      ip,
      user_agent: userAgent,
      metadata,
    })
    .select("id,created_at")
    .single();
  if (attendanceError) {
    return NextResponse.json({ error: attendanceError.message }, { status: 400 });
  }

  const { error: trafficError } = await supabase.from("traffic_logs").insert({
    meeting_id: body.meetingId,
    eligible_voter_id: body.eligibleVoterId,
    profile_id: userData.user.id,
    action: body.action,
    resource_type: "meeting",
    resource_id: body.meetingId,
    ip,
    user_agent: userAgent,
    metadata,
  });

  return NextResponse.json({
    ok: true,
    attendance,
    trafficLogged: !trafficError,
    warning: trafficError?.message ?? null,
  });
}
