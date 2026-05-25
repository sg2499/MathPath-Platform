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
  searchParams?: Promise<LoginSearchParams> | LoginSearchParams;
}) {
  const ResolvedSearchParams = searchParams
    ? typeof (searchParams as Promise<LoginSearchParams>).then === "function"
      ? await (searchParams as Promise<LoginSearchParams>)
      : (searchParams as LoginSearchParams)
    : null;

  return <LoginClient InitialRole={GetRoleParam(ResolvedSearchParams)} />;
}
