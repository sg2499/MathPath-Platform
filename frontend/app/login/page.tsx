import localFont from "next/font/local";
import LoginClient from "./LoginClient";
import "./login.css";

// Display typeface for the sign-in page only (headline, headings, numerals, buttons). Bundled with
// the app (SIL Open Font License, see ./fonts/OFL.txt) so it looks the same on every device and
// never waits on an outside font host.
const SignInDisplayFont = localFont({
  src: "./fonts/Gabarito-Variable.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-si-display",
});

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

  return (
    <div className={SignInDisplayFont.variable}>
      <LoginClient InitialRole={GetRoleParam(ResolvedSearchParams)} />
    </div>
  );
}
