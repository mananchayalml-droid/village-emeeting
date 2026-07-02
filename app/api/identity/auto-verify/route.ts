import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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

  const body = await request.json().catch(() => null) as { lotNo?: string } | null;
  const lotNo = body?.lotNo?.trim();
  if (!lotNo || lotNo.length > 100) {
    return NextResponse.json({ error: "กรุณาระบุเลขที่บ้าน/แปลง" }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent");
  const { data, error } = await supabase.rpc("auto_verify_identity_by_email_lot", {
    p_lot_no: lotNo,
    p_user_agent: userAgent,
    p_ip: ip,
  });

  if (error) {
    const migrationMissing = error.message.includes("auto_verify_identity_by_email_lot");
    return NextResponse.json({
      error: migrationMissing ? "กรุณารัน 007_email_auto_verification.sql ใน Supabase ก่อน" : error.message,
    }, { status: 400 });
  }

  return NextResponse.json(data);
}
