"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type FormState = "checking" | "ready" | "saving" | "success" | "error";

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<FormState>("checking");
  const [message, setMessage] = useState("กำลังตรวจสอบลิงก์ตั้งรหัสผ่านใหม่...");

  useEffect(() => {
    async function prepareRecoverySession() {
      if (!isSupabaseConfigured()) {
        setState("error");
        setMessage("ยังไม่ได้ตั้งค่า Supabase env");
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;
      let authError: Error | null = null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error;
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        authError = error;
      } else {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          authError = error;
        }
      }

      if (authError) {
        setState("error");
        setMessage(authError.message);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setState("error");
        setMessage("ลิงก์นี้หมดอายุหรือไม่มี session สำหรับตั้งรหัสผ่านใหม่ กรุณากดส่ง reset password อีกครั้ง");
        return;
      }

      setState("ready");
      setMessage("กรอกรหัสผ่านใหม่สำหรับบัญชี Admin แล้วกดบันทึก");
    }

    prepareRecoverySession();
  }, [searchParams]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setState("error");
      setMessage("รหัสผ่านควรมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    if (password !== confirmPassword) {
      setState("error");
      setMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setState("saving");
    setMessage("กำลังบันทึกรหัสผ่านใหม่...");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }

    await supabase.auth.signOut();
    setState("success");
    setMessage("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว นำรหัสผ่านนี้ไปใส่ใน Vercel เป็น ADMIN_LOGIN_PASSWORD ได้เลย");
  }

  const canEditPassword = state === "ready" || state === "error";
  const isSavingPassword = state === "saving";

  return (
    <section className="panel login-card">
      <span className="eyebrow">PASSWORD RECOVERY</span>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      <p>ใช้หน้านี้หลังจากกดลิงก์ Reset password จาก Supabase</p>

      <form className="grid" onSubmit={updatePassword}>
        <label>
          รหัสผ่านใหม่
          <input
            autoComplete="new-password"
            disabled={!canEditPassword}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            required
            type="password"
            value={password}
          />
        </label>
        <label>
          ยืนยันรหัสผ่านใหม่
          <input
            autoComplete="new-password"
            disabled={!canEditPassword}
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="กรอกรหัสผ่านเดิมอีกครั้ง"
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        <button className="btn primary" disabled={!canEditPassword || isSavingPassword} type="submit">
          {isSavingPassword ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
        </button>
      </form>

      {message ? <p className={state === "error" ? "form-message error" : "form-message success"}>{message}</p> : null}
      {state === "success" ? <Link className="btn" href="/login">กลับไปหน้า Login</Link> : null}
      {state === "error" ? <button className="btn" onClick={() => router.refresh()} type="button">ลองตรวจลิงก์อีกครั้ง</button> : null}
    </section>
  );
}
