export type AdminTeacher = {
  teacherId: string;
  userId: string;
  teacherName: string;
  teacherCode: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  subjectSpecialization: string | null;
  qualification: string | null;
  joiningDate: string | null;
  address: string | null;
  notes: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | string;
  isActive: boolean;
  studentCount: number;
  activeStudentCount: number;
  inactiveStudentCount: number;
  createdAt: string | null;
};

export type TeacherPayload = {
  teacherName: string;
  teacherCode: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  designation?: string | null;
  subjectSpecialization?: string | null;
  qualification?: string | null;
  joiningDate?: string | null;
  address?: string | null;
  notes?: string | null;
  status: "ACTIVE" | "INACTIVE";
};
