"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("กำลังยืนยัน magic link...");
  const [error, setError] = useState("");

  useEffect(() => {
    async function completeAuthentication() {
      if (!isSupabaseConfigured()) {
        setError("ยังไม่ได้ตั้งค่า Supabase env");
        setMessage("");
        return;
      }

      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;
      const supabase = createBrowserSupabaseClient();
      let authError: Error | null = null;

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        authError = exchangeError;
      } else if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        authError = verifyError;
      } else {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          authError = sessionError;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setError("ลิงก์นี้ไม่มี code หรือ token สำหรับยืนยัน กรุณาส่ง Magic Link ใหม่และตรวจ Email Template");
            setMessage("");
            return;
          }
        }
      }

      if (authError) {
        setError(authError.message);
        setMessage("");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const pendingLotNo = searchParams.get("lot")
        || window.localStorage.getItem("village_pending_lot_no")
        || String(sessionData.session?.user.user_metadata?.lot_no ?? "").trim();

      if (accessToken && pendingLotNo) {
        setMessage("เข้าสู่ระบบสำเร็จ กำลังตรวจอีเมลและเลขที่บ้าน/แปลง...");
        try {
          const response = await fetch("/api/identity/auto-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ lotNo: pendingLotNo }),
          });
          const result = await response.json() as { status?: string; verified_count?: number; error?: string };
          if (!response.ok) {
            setMessage(`เข้าสู่ระบบสำเร็จ แต่ตรวจสิทธิ์อัตโนมัติไม่สำเร็จ: ${result.error || "กรุณาให้ Admin ตรวจสอบ"}`);
          } else if (result.status === "verified") {
            setMessage(`ยืนยันตัวตนอัตโนมัติสำเร็จ ${result.verified_count ?? 1} การประชุม กำลังพาไป Dashboard...`);
          } else if (result.status === "already_verified") {
            setMessage("บัญชีนี้ยืนยันตัวตนแล้ว กำลังพาไป Dashboard...");
          } else {
            setMessage("เข้าสู่ระบบสำเร็จ แต่ข้อมูลอีเมลหรือเลขที่บ้านยังไม่ตรงกับสิทธิ์ประชุม กรุณาให้ Admin ตรวจสอบ");
          }
          window.localStorage.removeItem("village_pending_lot_no");
        } catch {
          setMessage("เข้าสู่ระบบสำเร็จ แต่ระบบตรวจสิทธิ์อัตโนมัติขัดข้อง กรุณาให้ Admin ตรวจสอบ");
        }
      } else {
        setMessage("เข้าสู่ระบบสำเร็จ กำลังพาไปหน้า Dashboard...");
      }

      window.setTimeout(() => router.replace("/dashboard"), 1200);
    }

    completeAuthentication();
  }, [router, searchParams]);

  return (
    <section className="panel login-card">
      <span className="eyebrow">Auth callback</span>
      <h1>ยืนยันอีเมล</h1>
      {message ? <p className="form-message success">{message}</p> : null}
      {error ? <p className="form-message error">{error}</p> : null}
      <Link className="btn" href="/login">กลับไปหน้า Login</Link>
    </section>
  );
}
