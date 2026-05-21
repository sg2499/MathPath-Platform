import { redirect } from "next/navigation";

export default async function TeacherStudentResultsRedirectPage({
  params,
}: {
  params: Promise<{ studentCode: string }>;
}) {
  const { studentCode } = await params;
  redirect(`/teacher/assignment-tracker/student/${encodeURIComponent(studentCode)}`);
}
