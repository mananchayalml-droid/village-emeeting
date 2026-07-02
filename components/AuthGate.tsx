"use client";

import Link from "next/link";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string;
  email: string | null;
  role: "participant" | "observer" | "staff" | "admin";
  is_active: boolean;
};

type AuthContextValue = {
  user: User;
  profile: Profile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAccess = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user ?? null;

    if (sessionError || !currentUser) {
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
      setLoading(false);
      return;
    }

    setUser(currentUser);
    const [{ data: profileData, error: profileError }, { data: adminAccess, error: adminError }] = await Promise.all([
      supabase.from("profiles").select("full_name,email,role,is_active").eq("id", currentUser.id).maybeSingle(),
      supabase.rpc("is_admin"),
    ]);

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const currentProfile = (profileData as Profile | null) ?? null;
    if (currentProfile && !currentProfile.is_active) {
      await supabase.auth.signOut();
      router.replace("/login?error=inactive");
      setLoading(false);
      return;
    }

    setProfile(currentProfile);
    const admin = !adminError && adminAccess === true;
    setIsAdmin(admin);

    if (pathname.startsWith("/admin") && !admin) {
      router.replace("/dashboard?error=admin_required");
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [pathname, router, supabase]);

  useEffect(() => {
    loadAccess();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [loadAccess, router, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <div className="access-screen"><div className="panel"><h2>กำลังตรวจสิทธิ์...</h2><p>ตรวจสอบ Supabase session และบทบาทผู้ใช้งาน</p></div></div>;
  }

  if (error || !user) {
    return <div className="access-screen"><div className="panel"><h2>ไม่สามารถตรวจสิทธิ์ได้</h2><p className="form-message error">{error || "ไม่พบ session"}</p><Link className="btn" href="/login">กลับไปหน้า Login</Link></div></div>;
  }

  return <AuthContext.Provider value={{ user, profile, isAdmin, signOut }}>{children}</AuthContext.Provider>;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : null;
}

export function AppNavigation() {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "ภาพรวม" },
    { href: "/meetings", label: "การประชุม" },
    { href: "/documents", label: "เอกสาร" },
    { href: "/voting", label: "ลงคะแนน" },
    { href: "/incidents", label: "แจ้งเหตุ" },
    { href: "/guide", label: "คู่มือ" },
    ...(isAdmin ? [{ href: "/admin", label: "ผู้ดูแล" }] : []),
  ];

  return <nav aria-label="เมนูหลัก">{items.map((item) => {
    const active = pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin/"));
    return <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} key={item.href} href={item.href}>{item.label}</Link>;
  })}</nav>;
}

export function SessionControls() {
  const { user, profile, isAdmin, signOut } = useAuth();
  return (
    <div className="session-controls">
      <span className="user-avatar" aria-hidden="true" />
      <span><strong>{profile?.full_name || user.email}</strong><small>{isAdmin ? "Admin" : profile?.role || "User"}</small></span>
      <button className="btn compact" type="button" onClick={signOut}>ออกจากระบบ</button>
    </div>
  );
}
