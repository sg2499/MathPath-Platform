import { AppShell } from "@/components/common/AppShell";
import type { ReactNode } from "react";
import { BarChart3, Gauge, Target } from "lucide-react";

export default function StudentCompetitionProgressPage() {
  return (
    <AppShell title="Competition Progress">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Progress</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Review mock-exam performance, strengths, weak areas, speed, accuracy, and improvement trends for competition preparation.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard icon={<BarChart3 size={18} />} title="Performance Summary" description="Overall score, accuracy, and completion-speed insights will appear here." />
          <FeatureCard icon={<Target size={18} />} title="Strengths And Weak Areas" description="Concept-wise performance will guide daily improvement." />
          <FeatureCard icon={<Gauge size={18} />} title="Time Utilization" description="Track how effectively time is used under mock-exam pressure." />
        </div>
      </section>
    </AppShell>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <article className="math-card p-5">
      <div className="flex items-center gap-3 text-[var(--math-role-primary)]">
        {icon}
        <h2 className="text-base font-black text-slate-950 dark:text-white">{title}</h2>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </article>
  );
}
