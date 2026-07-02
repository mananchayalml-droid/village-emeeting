"use client";

import { FormEvent, useEffect, useState } from "react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type FormState = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
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

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured) {
      setState("error");
      setMessage("ยังไม่ได้ตั้งค่า Supabase env: NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }

    if (!email.trim()) {
      setState("error");
      setMessage("กรุณากรอกอีเมลที่ลงทะเบียน");
      return;
    }

    if (!lotNo.trim()) {
      setState("error");
      setMessage("กรุณากรอกเลขที่บ้าน/แปลงเพื่อใช้ตรวจสิทธิ์อัตโนมัติ");
      return;
    }

    setState("sending");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?lot=${encodeURIComponent(lotNo.trim())}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          data: {
            lot_no: lotNo.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      window.localStorage.setItem("village_pending_lot_no", lotNo.trim());
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
        อีเมลที่ลงทะเบียน
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          type="email"
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
        {state === "sending" ? "กำลังส่ง..." : cooldown > 0 ? `ส่งใหม่ได้ใน ${cooldown} วินาที` : "ส่ง Magic Link"}
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
