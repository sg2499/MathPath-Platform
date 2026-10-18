import { api } from "@/lib/api";

// 2026-10-18 (Birthdays): the student's own greeting on their birthday.
export type BirthdayGreeting = {
  id: string;
  date: string;
  firstName: string;
  age: number | null;
  text: string;
  style: string;
  signedBy: string;
  seen: boolean;
  dismissed: boolean;
};

export type StudentBirthday = { isBirthday: boolean; greeting: BirthdayGreeting | null };

export async function getStudentBirthday() {
  const { data } = await api.get<StudentBirthday>("/student/birthday");
  return data;
}

export async function markBirthdaySeen(id: string) {
  await api.post(`/student/birthday/${encodeURIComponent(id)}/seen`);
}

export async function dismissBirthday(id: string) {
  await api.post(`/student/birthday/${encodeURIComponent(id)}/dismiss`);
}

// ---------- admin (Part 2) ---------------------------------------------------

export type BirthdayStatus = "SEEN" | "SENT" | "WAITING" | "SCHEDULED" | "NOT_SENT";

export type BirthdayPerson = {
  studentId: string;
  studentCode: string;
  name: string;
  photoUrl: string | null;
  levelCode: string | null;
  teacherName: string | null;
  centreName: string | null;
  isDemo: boolean;
};

export type BirthdayEntry = BirthdayPerson & {
  date: string;
  age: number;
  isToday: boolean;
  status: BirthdayStatus;
  wish: string | null;
  sentAt: string | null;
  seenAt: string | null;
};

export type BirthdayFilters = { teacherId?: string; levelId?: string; centreId?: string; q?: string };
export type BirthdayRange = { start?: string; days?: number; month?: string };

export type AdminBirthdays = {
  today: string;
  start: string;
  end: string;
  sendTime: string;
  counts: { today: number; thisWeek: number; thisMonth: number; missingDob: number };
  entries: BirthdayEntry[];
  filters: {
    teachers: { id: string; name: string }[];
    levels: { id: string; code: string }[];
    centres: { id: string; name: string }[];
  };
};

export type MissingDobStudent = BirthdayPerson & { dob: string | null; problem: "MISSING" | "UNREADABLE" | "UNLIKELY" };

function Clean(Params: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(Params).filter(([, Value]) => Value !== undefined && Value !== "" && Value !== "ALL"));
}

export async function getAdminBirthdays(range: BirthdayRange, filters: BirthdayFilters = {}) {
  const { data } = await api.get<AdminBirthdays>("/admin/birthdays", { params: Clean({ ...range, ...filters }) });
  return data;
}

export async function getAdminMissingDob(filters: BirthdayFilters = {}) {
  const { data } = await api.get<{ students: MissingDobStudent[] }>("/admin/birthdays/missing", { params: Clean({ ...filters }) });
  return data.students;
}

export async function downloadAdminBirthdays(range: BirthdayRange, filters: BirthdayFilters = {}): Promise<Blob> {
  const { data } = await api.get("/admin/birthdays/export", { params: Clean({ ...range, ...filters }), responseType: "blob" });
  return data;
}

// ---------- admin (Part 3): wishes, sent log, dashboard ------------------------

export type WishStyle = "WARM" | "PLAYFUL" | "PROUD" | "MATHS" | "SHORT";
export type WishBand = "ALL" | "YOUNG" | "MIDDLE" | "OLDER";

export type BirthdayWish = {
  id: string;
  text: string;
  style: WishStyle;
  ageBand: WishBand;
  needsLevel: boolean;
  isActive: boolean;
  isStarter: boolean;
  uses: number;
  lastUsed: string | null;
  updatedAt: string | null;
};

export type WishList = { wishes: BirthdayWish[]; activeByAge: Record<"YOUNG" | "MIDDLE" | "OLDER", number>; minimumPerAge: number };

export async function getBirthdayWishes() {
  const { data } = await api.get<WishList>("/admin/birthdays/wishes");
  return data;
}

export async function createBirthdayWish(payload: { text: string; style: WishStyle; ageBand: WishBand }) {
  const { data } = await api.post<WishList>("/admin/birthdays/wishes", payload);
  return data;
}

export async function updateBirthdayWish(id: string, payload: Partial<{ text: string; style: WishStyle; ageBand: WishBand; isActive: boolean }>) {
  const { data } = await api.patch<WishList>(`/admin/birthdays/wishes/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function getBirthdaySent(month: string, filters: BirthdayFilters = {}) {
  const { data } = await api.get<{ today: string; start: string; end: string; entries: BirthdayEntry[]; sendTime?: string }>("/admin/birthdays/sent", { params: Clean({ month, ...filters }) });
  return data;
}

export async function getBirthdaysToday() {
  const { data } = await api.get<{ today: string; count: number; students: { studentId: string; studentCode: string; name: string; age: number; status: BirthdayStatus }[] }>("/admin/birthdays/today");
  return data;
}

// ---------- teacher (Part 4): their own students -------------------------------

export type TeacherBirthdays = Omit<AdminBirthdays, "filters"> & { filters: { levels: { id: string; code: string }[] } };

export async function getTeacherBirthdays(range: BirthdayRange, filters: { levelId?: string; q?: string } = {}) {
  const { data } = await api.get<TeacherBirthdays>("/teacher/birthdays", { params: Clean({ ...range, ...filters }) });
  return data;
}

export async function getTeacherBirthdaysWeek() {
  const { data } = await api.get<{ today: string; counts: AdminBirthdays["counts"]; entries: Pick<BirthdayEntry, "studentId" | "studentCode" | "name" | "photoUrl" | "levelCode" | "date" | "age" | "isToday" | "status">[] }>("/teacher/birthdays/today");
  return data;
}
