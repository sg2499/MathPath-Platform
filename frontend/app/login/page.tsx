import LoginClient from "./LoginClient";

type LoginSearchParams = {
  role?: string | string[];
};

function GetRoleParam(SearchParams?: LoginSearchParams | null) {
  const RoleValue = SearchParams?.role;
  return Array.isArray(RoleValue) ? RoleValue[0] : RoleValue || null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<LoginSearchParams>;
}) {
  const ResolvedSearchParams = searchParams ? await searchParams : null;

  return <LoginClient InitialRole={GetRoleParam(ResolvedSearchParams)} />;
}
