"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type FormState = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function signInAdminDirectly() {
    setState("sending");
    setMessage("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), lot_no: lotNo.trim() }),
      });
      const payload = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; error?: string } | null;

      if (!response.ok || !payload?.access_token || !payload.refresh_token) {
        throw new Error(payload?.error ?? "เข้าสู่ระบบ Admin ไม่สำเร็จ");
      }

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });

      if (error) throw error;

      window.localStorage.removeItem("village_pending_lot_no");
      setState("sent");
      setMessage("เข้าสู่ระบบ Admin สำเร็จ กำลังพาไปหน้าหลัก");
      router.replace(searchParams.get("next") || "/dashboard");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบ Admin ไม่สำเร็จ");
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedLotNo = lotNo.trim();

    if (!configured) {
      setState("error");
      setMessage("ยังไม่ได้ตั้งค่า Supabase env: NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }

    if (!normalizedEmail) {
      setState("error");
      setMessage("กรุณากรอกอีเมลที่ลงทะเบียน หรือรหัส Admin");
      return;
    }

    if (!normalizedLotNo) {
      setState("error");
      setMessage("กรุณากรอกเลขที่บ้าน/แปลงเพื่อใช้ตรวจสิทธิ์อัตโนมัติ");
      return;
    }

    if (normalizedEmail === "VEMadmin" && normalizedLotNo === "0000") {
      await signInAdminDirectly();
      return;
    }

    setState("sending");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?lot=${encodeURIComponent(normalizedLotNo)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            lot_no: normalizedLotNo,
          },
        },
      });

      if (error) {
        throw error;
      }

      window.localStorage.setItem("village_pending_lot_no", normalizedLotNo);
      setState("sent");
      setCooldown(60);
      setMessage("ส่ง magic link ไปที่อีเมลแล้ว กรุณาเปิดอีเมลและกดลิงก์เพื่อเข้าสู่ระบบ");
    } catch (error) {
      setState("error");
      const rawMessage = error instanceof Error ? error.message : "ส่ง magic link ไม่สำเร็จ";
      if (rawMessage.toLowerCase().includes("rate limit")) {
        setMessage("ส่งอีเมลเกินข้อจำกัดของ Supabase แล้ว กรุณารอประมาณ 1 ชั่วโมง หรือตั้งค่า Custom SMTP ก่อนลองใหม่");
      } else {
        setMessage(rawMessage);
      }
    }
  }

  return (
    <form className="grid" onSubmit={sendMagicLink}>
      <label>
        อีเมลที่ลงทะเบียน / รหัส Admin
        <input
          autoComplete="username"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com หรือ VEMadmin"
          type="text"
          value={email}
        />
      </label>
      <label>
        เลขที่บ้าน/แปลง
        <input
          autoComplete="off"
          onChange={(event) => setLotNo(event.target.value)}
          placeholder="เช่น A-12"
          required
          value={lotNo}
        />
      </label>
      <button className="btn primary" disabled={state === "sending" || cooldown > 0} type="submit">
        {state === "sending" ? "กำลังเข้าสู่ระบบ..." : cooldown > 0 ? `ส่งใหม่ได้ใน ${cooldown} วินาที` : email.trim() === "VEMadmin" && lotNo.trim() === "0000" ? "เข้าสู่ระบบ Admin" : "ส่ง Magic Link"}
      </button>
      {message ? <p className={state === "error" ? "form-message error" : "form-message success"}>{message}</p> : null}
      {!configured ? (
        <p className="form-message warning">
          โหมดนี้ต้องตั้งค่า Supabase ใน `.env.local` ก่อนจึงจะส่งอีเมลได้จริง
        </p>
      ) : null}
    </form>
  );
}
