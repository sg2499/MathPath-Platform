export type UserRole = "ADMIN" | "SUPER_ADMIN" | "TEACHER" | "STUDENT";

export type CurrentUser = {
  id: string;
  fullName: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  loginId?: string | null;
  isActive?: boolean;
  profilePhotoUrl?: string | null;
  twoFactorEnabled?: boolean;
  student?: {
    id: string;
    studentCode: string;
    customId?: string | null;
    currentModuleId?: string | null;
    currentLevelId?: string | null;
    photoUrl?: string | null;
    signatureUrl?: string | null;
    className?: string | null;
    section?: string | null;
    teacher?: string | null;
  } | null;
  teacher?: {
    id: string;
    teacherCode: string;
    photoUrl?: string | null;
    signatureUrl?: string | null;
    designation?: string | null;
    subjectSpecialization?: string | null;
  } | null;
};

export type LoginResponse = {
  // No accessToken here as of the 2026-07-22 cookie migration -- the
  // session is set via an httpOnly Set-Cookie response header instead
  // (see backend/app/api/routes_auth.py's login_route()), never handed to
  // page JS in the JSON body where an XSS payload (or anything else that
  // can read the fetch response) could read it back out.
  tokenType: string;
  user: CurrentUser;
};

export type TwoFactorChallenge = {
  twoFactorRequired: true;
  challengeToken: string;
  tokenType: string;
};

export type LoginResult = LoginResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(Result: LoginResult): Result is TwoFactorChallenge {
  return (Result as TwoFactorChallenge).twoFactorRequired === true;
}
