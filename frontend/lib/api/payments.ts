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

// ---------------------------------------------------------------------------
// 2026-10-08 (Payments Phase 2): invoices.
// ---------------------------------------------------------------------------

export type InvoiceStatus = "PENDING" | "PART_PAID" | "PAID" | "CANCELLED";

export type InvoiceRunRequest = {
  feeItemIds: string[];
  studentIds: string[];
  billingMonth?: number | null;
  billingYear?: number | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  allowRepeatOneTime?: boolean;
};

export type InvoicePlanLine = {
  studentId: string;
  studentName: string;
  studentCode: string;
  feeItemId: string;
  feeName: string;
  periodLabel: string | null;
  amountPaise: number;
  amountDisplay: string;
  reason?: string;
};

export type InvoicePreview = {
  numberingReady: boolean;
  nextNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  periodLabel: string | null;
  studentsSelected: number;
  studentsInvoiced: number;
  invoiceCount: number;
  skippedCount: number;
  totalPaise: number;
  totalDisplay: string;
  invoices: InvoicePlanLine[];
  skipped: InvoicePlanLine[];
};

export type InvoiceBatchResult = {
  batchId: string;
  replayed: boolean;
  invoiceCount: number;
  skippedCount: number;
  totalPaise: number;
  totalDisplay: string;
  firstNumber: string | null;
  lastNumber: string | null;
  skipped: InvoicePlanLine[];
};

export type Invoice = {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  feeItemId: string | null;
  feeName: string;
  billingType: BillingType;
  periodLabel: string | null;
  description: string;
  invoiceDate: string;
  dueDate: string | null;
  amountPaise: number;
  amountDisplay: string;
  taxableDisplay: string;
  cgstDisplay: string;
  sgstDisplay: string;
  gstIncluded: boolean;
  paidPaise: number;
  paidDisplay: string;
  balancePaise: number;
  balanceDisplay: string;
  status: InvoiceStatus;
  statusLabel: string;
  isOverdue: boolean;
  levelCode: string | null;
  centreName: string | null;
  source: string;
  batchId: string | null;
  createdAt: string | null;
  createdByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
};

export type InvoiceFilters = {
  status?: string;
  feeItemId?: string;
  period?: string;
  centreId?: string;
  studentId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type InvoiceList = {
  page: number;
  pageSize: number;
  totalCount: number;
  totals: { amountDisplay: string; paidDisplay: string; balanceDisplay: string };
  invoices: Invoice[];
};

export type InvoiceStudentOption = {
  studentId: string;
  studentName: string;
  studentCode: string;
  customId: string | null;
  levelCode: string | null;
  moduleCode: string | null;
  teacherName: string | null;
  centreId: string | null;
  centreName: string | null;
  batches: { batchId: string; batchName: string }[];
  isActive: boolean;
};

function CleanFilters(filters: InvoiceFilters): InvoiceFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== "ALL")) as InvoiceFilters;
}

export async function listInvoiceStudentOptions(): Promise<InvoiceStudentOption[]> {
  const { data } = await api.get<{ students: InvoiceStudentOption[] }>("/admin/payments/invoices/student-options");
  return data.students;
}

export async function previewInvoices(payload: InvoiceRunRequest): Promise<InvoicePreview> {
  const { data } = await api.post<InvoicePreview>("/admin/payments/invoices/preview", payload);
  return data;
}

export async function generateInvoices(payload: InvoiceRunRequest & { idempotencyKey: string }): Promise<InvoiceBatchResult> {
  const { data } = await api.post<InvoiceBatchResult>("/admin/payments/invoices/generate", payload);
  return data;
}

export async function listInvoices(filters: InvoiceFilters, page = 1, pageSize = 50): Promise<InvoiceList> {
  const { data } = await api.get<InvoiceList>("/admin/payments/invoices", { params: { ...CleanFilters(filters), page, pageSize } });
  return data;
}

export async function getInvoice(invoiceId: string): Promise<Invoice & { snapshot: Record<string, unknown> }> {
  const { data } = await api.get(`/admin/payments/invoices/${invoiceId}`);
  return data;
}

export async function cancelInvoice(invoiceId: string, reason: string): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/admin/payments/invoices/${invoiceId}/cancel`, { reason });
  return data;
}

export async function downloadInvoicePdf(invoiceId: string): Promise<Blob> {
  const { data } = await api.get(`/admin/payments/invoices/${invoiceId}/pdf`, { responseType: "blob" });
  return data;
}

export async function downloadInvoicesPdf(payload: { invoiceIds?: string[]; filters?: InvoiceFilters }): Promise<Blob> {
  const body = { invoiceIds: payload.invoiceIds, filters: payload.filters ? CleanFilters(payload.filters) : undefined };
  const { data } = await api.post("/admin/payments/invoices/pdf", body, { responseType: "blob" });
  return data;
}

export async function downloadInvoicesExcel(filters: InvoiceFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/invoices/export", { params: CleanFilters(filters), responseType: "blob" });
  return data;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
