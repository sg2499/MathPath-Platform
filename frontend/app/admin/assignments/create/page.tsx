"use client";

import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CreateAssignmentRedirectPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();

  useEffect(() => {
    if (Ready) Router.replace("/admin/curriculum");
  }, [Ready, Router]);

  return <LoadingState label="Opening Learning Path Studio..." />;
}
