// 2026-10-08 (Payments Phase 1): fee setup, business details, centres,
// document numbering and the change history. Admin only.
import { api } from "@/lib/api";

export type BillingType = "MONTHLY" | "ONE_TIME";

export type FeeItem = {
  feeItemId: string;
  name: string;
  description: string | null;
  amountPaise: number;
  amount: string;
  amountDisplay: string;
  gstIncluded: boolean;
  gstRatePercent: number;
  taxableDisplay: string;
  gstDisplay: string;
  billingType: BillingType;
  billingTypeLabel: string;
  displayOrder: number;
  isActive: boolean;
  legacyNames: string[];
  updatedAt: string | null;
};

export type BusinessProfile = {
  legalName: string;
  brandName: string | null;
  gstin: string | null;
  pan: string | null;
  registeredAddress: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  invoiceFooter: string | null;
  updatedAt: string | null;
};

export type PaymentCentre = {
  centreId: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  displayOrder: number;
  isActive: boolean;
  studentCount: number;
};

export type NumberSequence = {
  key: "INVOICE" | "RECEIPT";
  label: string;
  prefix: string;
  padWidth: number;
  isConfigured: boolean;
  nextNumber: number;
  nextFormatted: string;
  lastIssuedNumber: number | null;
  lastIssuedFormatted: string | null;
};

export type PaymentSettings = {
  business: BusinessProfile;
  centres: PaymentCentre[];
  numbering: NumberSequence[];
  activeStudentsWithoutCentre: number;
};

export type CentreStudent = {
  studentId: string;
  studentName: string;
  studentCode: string;
  customId: string | null;
  levelCode: string | null;
  moduleCode: string | null;
  teacherName: string | null;
  isActive: boolean;
  centreId: string | null;
  centreName: string | null;
};

export type PaymentAuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string | null;
};

export async function listFeeItems(): Promise<FeeItem[]> {
  const { data } = await api.get<{ feeItems: FeeItem[] }>("/admin/payments/fee-items");
  return data.feeItems;
}

export async function createFeeItem(payload: { name: string; amount: string; gstIncluded: boolean; billingType: BillingType; description?: string | null }): Promise<FeeItem> {
  const { data } = await api.post<FeeItem>("/admin/payments/fee-items", payload);
  return data;
}

export async function updateFeeItem(
  feeItemId: string,
  payload: { name?: string; amount?: string; gstIncluded?: boolean; billingType?: BillingType; description?: string | null; clearDescription?: boolean; reason?: string | null }
): Promise<FeeItem> {
  const { data } = await api.patch<FeeItem>(`/admin/payments/fee-items/${feeItemId}`, payload);
  return data;
}

export async function setFeeItemActive(feeItemId: string, payload: { isActive: boolean; reason?: string | null }): Promise<FeeItem> {
  const { data } = await api.post<FeeItem>(`/admin/payments/fee-items/${feeItemId}/active`, payload);
  return data;
}

export async function reorderFeeItems(orderedIds: string[]): Promise<FeeItem[]> {
  const { data } = await api.post<{ feeItems: FeeItem[] }>("/admin/payments/fee-items/reorder", { orderedIds });
  return data.feeItems;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const { data } = await api.get<PaymentSettings>("/admin/payments/settings");
  return data;
}

export async function updateBusinessProfile(payload: Partial<Omit<BusinessProfile, "updatedAt">>): Promise<BusinessProfile> {
  const { data } = await api.put<BusinessProfile>("/admin/payments/settings/business", payload);
  return data;
}

export async function createCentre(payload: { name: string; address?: string | null; phone?: string | null }): Promise<PaymentCentre> {
  const { data } = await api.post<PaymentCentre>("/admin/payments/centres", payload);
  return data;
}

export async function updateCentre(centreId: string, payload: { name?: string; address?: string | null; phone?: string | null; isActive?: boolean; reason?: string | null }): Promise<PaymentCentre> {
  const { data } = await api.patch<PaymentCentre>(`/admin/payments/centres/${centreId}`, payload);
  return data;
}

export async function listCentreStudents(): Promise<CentreStudent[]> {
  const { data } = await api.get<{ students: CentreStudent[] }>("/admin/payments/centres/students");
  return data.students;
}

export async function assignStudentsToCentre(payload: { studentIds: string[]; centreId: string | null }): Promise<{ studentsSelected: number; studentsChanged: number; centreName: string | null }> {
  const { data } = await api.post("/admin/payments/centres/assign", payload);
  return data;
}

export async function setStartingNumber(sequenceKey: "INVOICE" | "RECEIPT", payload: { nextNumber: number; reason?: string | null }): Promise<NumberSequence> {
  const { data } = await api.put<NumberSequence>(`/admin/payments/numbering/${sequenceKey}`, payload);
  return data;
}

export async function listPaymentAudit(params: { entityType?: string; entityId?: string; limit?: number }): Promise<PaymentAuditEntry[]> {
  const { data } = await api.get<{ entries: PaymentAuditEntry[] }>("/admin/payments/audit", { params });
  return data.entries;
}
