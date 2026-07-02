import { Suspense } from "react";
import { CallbackClient } from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <main className="login-page">
      <Suspense fallback={<section className="panel login-card"><p>กำลังโหลด...</p></section>}>
        <CallbackClient />
      </Suspense>
    </main>
  );
}
