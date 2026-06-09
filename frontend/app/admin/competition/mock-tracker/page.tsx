import { AppShell } from "@/components/common/AppShell";
import type { ReactNode } from "react";
import { BarChart3, Gauge, Target } from "lucide-react";

export default function AdminCompetitionMockTrackerPage() {
  return (
    <AppShell title="Competition Mock Tracker">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Tracker</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Track completion, speed, accuracy, concept strengths, weak areas, and competition readiness for assigned mock examinations.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard icon={<Target size={18} />} title="Completion Tracking" description="Monitor assigned, attempted, completed, and pending competition mocks." />
          <FeatureCard icon={<Gauge size={18} />} title="Speed And Accuracy" description="Review score, accuracy percentage, time taken, and time utilization." />
          <FeatureCard icon={<BarChart3 size={18} />} title="Concept Insights" description="Identify level-wise strengths and weak concepts for competition preparation." />
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
