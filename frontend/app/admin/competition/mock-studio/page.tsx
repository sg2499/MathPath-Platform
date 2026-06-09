import { AppShell } from "@/components/common/AppShell";
import type { ReactNode } from "react";
import { FilePenLine, ShieldCheck, Target } from "lucide-react";

export default function AdminCompetitionMockStudioPage() {
  return (
    <AppShell title="Competition Mock Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Studio</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Create, publish, and assign championship-style mock examinations by module and level. This workflow is independent from DPS Practice and Assessment progression.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard icon={<FilePenLine size={18} />} title="Mock Paper Setup" description="Admin-controlled mock paper creation and publishing will be added here." />
          <FeatureCard icon={<Target size={18} />} title="Level-Wise Assignment" description="Assign one or multiple mock papers to all students or selected students in a level." />
          <FeatureCard icon={<ShieldCheck size={18} />} title="Competition-Only Flow" description="No impact on Practice, Assessments, readiness, progression, or existing reports." />
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
