import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_LOGIN_NAME = "VEMadmin";
const ADMIN_LOT_NO = "0000";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; lot_no?: string } | null;
  const loginName = body?.email?.trim();
  const lotNo = body?.lot_no?.trim();

  if (loginName !== ADMIN_LOGIN_NAME || lotNo !== ADMIN_LOT_NO) {
    return NextResponse.json({ error: "รหัส Admin หรือเลขที่บ้านไม่ถูกต้อง" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_LOGIN_EMAIL;
  const adminPassword = process.env.ADMIN_LOGIN_PASSWORD;

  if (!supabaseUrl || !supabaseAnonKey || !adminEmail || !adminPassword) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้งค่า ADMIN_LOGIN_EMAIL และ ADMIN_LOGIN_PASSWORD ใน Environment Variables",
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (error || !data.session) {
    return NextResponse.json({
      error: error?.message ?? "เข้าสู่ระบบ Admin ไม่สำเร็จ",
    }, { status: 401 });
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user,
  });
}
