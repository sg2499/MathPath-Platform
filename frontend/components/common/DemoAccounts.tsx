"use client";

// "Show Demo Accounts" switch and the "Demo" tag (2026-10-14, Phase 2
// part 3). See lib/demoSwitch.ts and backend app/services/demo_students.py.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { getActiveRoleHeaderValue } from "@/lib/auth";
import { SetShowingDemo, useShowDemo } from "@/lib/demoSwitch";
import { StatePill } from "@/components/common/DetailWorkspaceViews";

export function DemoSwitchButton({ compact = false }: { compact?: boolean }) {
  const ShowDemo = useShowDemo();
  const QueryClient = useQueryClient();
  const Label = ShowDemo ? "Hide Demo Accounts" : "Show Demo Accounts";
  return (
    <button
      type="button"
      className={`math-theme-toggle mp-demo-switch ${compact ? "px-3" : ""}`}
      data-on={ShowDemo ? "true" : "false"}
      aria-pressed={ShowDemo}
      aria-label={Label}
      title={ShowDemo ? "Demo accounts are shown and counted. Click to hide them." : "Show demo accounts everywhere, to test features on them"}
      onClick={() => {
        SetShowingDemo(!ShowDemo);
        // Every screen reloads its data with the new setting.
        void QueryClient.invalidateQueries();
      }}
    >
      <FlaskConical size={16} />
      {compact ? null : <span className="hidden 2xl:inline">{ShowDemo ? "Demo On" : "Demo"}</span>}
    </button>
  );
}

function useDemoStudentKeys(): Set<string> {
  const ShowDemo = useShowDemo();
  const Role = String(getActiveRoleHeaderValue() || "").toUpperCase();
  const Path = Role === "ADMIN" ? "/admin/demo-students" : Role === "TEACHER" ? "/teacher/demo-students" : "";
  const Query = useQuery({
    queryKey: ["demo-students", Role],
    queryFn: async () => {
      const { data } = await api.get<{ students: Array<{ studentId: string; studentCode: string }> }>(Path);
      return data.students;
    },
    enabled: ShowDemo && Boolean(Path),
    staleTime: 5 * 60 * 1000,
  });
  const Keys = new Set<string>();
  (Query.data || []).forEach((Item) => {
    if (Item.studentId) Keys.add(Item.studentId);
    if (Item.studentCode) Keys.add(Item.studentCode);
  });
  return Keys;
}

/** A purple "Demo" tag after a student's name while demo accounts are shown. */
export function DemoTag({ studentId, studentCode }: { studentId?: string | null; studentCode?: string | null }) {
  const Keys = useDemoStudentKeys();
  const IsDemo = Boolean((studentId && Keys.has(studentId)) || (studentCode && Keys.has(studentCode)));
  if (!IsDemo) return null;
  return (
    <span className="ml-2 inline-flex align-middle" title="Demo account, shown because Show Demo Accounts is on">
      <StatePill tone="purple">Demo</StatePill>
    </span>
  );
}
