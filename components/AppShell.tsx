import Link from "next/link";
import type { ReactNode } from "react";
import { AppNavigation, AuthGate, SessionControls } from "@/components/AuthGate";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" href="/dashboard" aria-label="Village e-Meeting Dashboard">
            <span className="brand-mark" aria-hidden="true"><span>V</span></span>
            <span><strong>ประชุมหมู่บ้าน</strong><small>Village e-Meeting</small></span>
          </Link>
          <AppNavigation />
          <SessionControls />
        </header>
        <main>{children}</main>
        <div className="forest-floor" aria-hidden="true">
          <span className="forest-sprig forest-sprig-left"><i /><i /><i /></span>
          <span className="forest-acorn"><i /></span>
          <span className="forest-sprig forest-sprig-right"><i /><i /><i /></span>
        </div>
      </div>
    </AuthGate>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  visual,
  featured = false,
  tone = "community",
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  visual?: ReactNode;
  featured?: boolean;
  tone?: "community" | "meeting" | "documents" | "voting" | "incidents" | "admin";
}) {
  return (
    <section className={`page-header tone-${tone}${featured ? " featured" : ""}${visual ? " has-visual" : ""}`}>
      <div className="page-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {action ? <div className="page-action">{action}</div> : null}
      </div>
      {visual ? <div className="page-header-visual">{visual}</div> : null}
      <VillageScenery featured={featured} />
    </section>
  );
}

function VillageScenery({ featured }: { featured: boolean }) {
  return (
    <div className={`village-scenery${featured ? " featured-scenery" : ""}`} aria-hidden="true">
      <span className="village-path" />
      <span className="village-tree village-tree-left"><i /></span>
      <span className="village-home village-home-main"><i /><b /></span>
      <span className="village-home village-home-small"><i /><b /></span>
      <span className="village-tree village-tree-right"><i /></span>
    </div>
  );
}

export function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export function StatusBadge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "blue" | "amber" | "red" | "gray" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
