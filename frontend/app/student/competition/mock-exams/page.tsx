import { AppShell } from "@/components/common/AppShell";
import type { ReactNode } from "react";
import { ClipboardPlus, Clock3, Target } from "lucide-react";

export default function StudentCompetitionMockExamsPage() {
  return (
    <AppShell title="Competition Mock Exams">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Mock Exams</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Attempt assigned championship-style mock exams for your current level. This section is separate from regular Practice and Assessments.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard icon={<ClipboardPlus size={18} />} title="Assigned Mocks" description="Only Admin-assigned and level-relevant mock exams will appear here." />
          <FeatureCard icon={<Clock3 size={18} />} title="Timed Practice" description="Mocks will simulate real competition pressure and time constraints." />
          <FeatureCard icon={<Target size={18} />} title="Competition Readiness" description="Build speed, accuracy, focus, stamina, and confidence." />
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
