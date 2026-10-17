"use client";

import { LoadingState } from "@/components/common/LoadingState";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// Item E (2026-10, admin revamp): this page was a second copy of the practice
// detail page (the same data from getAdminAssignmentDetailFull, with "Back to
// Assessments"), and nothing in the app links to it. An old link to it now
// opens the practice detail page, which shows the same record.
export default function AdminAssessmentDetailRedirect() {
  const params = useParams<{ assessmentId: string }>();
  const router = useRouter();
  useEffect(() => {
    if (params.assessmentId) router.replace(`/admin/assignments/${encodeURIComponent(params.assessmentId)}`);
  }, [params.assessmentId, router]);
  return <LoadingState label="Opening the record…" />;
}
