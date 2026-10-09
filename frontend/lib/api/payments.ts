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
  advancePaise?: number;
  advanceDisplay?: string | null;
};

export type InvoicePreview = {
  advanceAppliedPaise: number;
  advanceAppliedDisplay: string;
  advanceStudents: number;
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
  advanceAppliedPaise: number;
  advanceAppliedDisplay: string;
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
  discountPaise: number;
  discountDisplay: string;
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
  totals: { amountDisplay: string; paidDisplay: string; discountDisplay: string; balanceDisplay: string };
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

export async function cancelInvoice(invoiceId: string, reason: string): Promise<Invoice & { movedToAdvancePaise: number; movedToAdvanceDisplay: string }> {
  const { data } = await api.post(`/admin/payments/invoices/${invoiceId}/cancel`, { reason });
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


// ---------------------------------------------------------------------------
// 2026-10-08 (Payments Phase 3): payments received, receipts, advances and
// each student's account.
// ---------------------------------------------------------------------------

export type PaymentMethodCode = "CASH" | "UPI" | "CHEQUE" | "NET_BANKING" | "CREDIT_CARD" | "DEBIT_CARD" | "RAZORPAY" | "OTHERS";

export const COUNTER_METHODS: { value: PaymentMethodCode; label: string; needsReference: boolean }[] = [
  { value: "CASH", label: "Cash", needsReference: false },
  { value: "UPI", label: "UPI", needsReference: true },
  { value: "CHEQUE", label: "Cheque", needsReference: true },
  { value: "NET_BANKING", label: "Net Banking", needsReference: true },
  { value: "CREDIT_CARD", label: "Credit Card", needsReference: false },
  { value: "DEBIT_CARD", label: "Debit Card", needsReference: false },
  { value: "OTHERS", label: "Others", needsReference: false },
];

export type PaymentAllocationView = {
  allocationId: string;
  invoiceId: string;
  invoiceNumber: string;
  feeName: string;
  periodLabel: string | null;
  amountPaise: number;
  amountDisplay: string;
  discountPaise: number;
  discountDisplay: string;
  kind: "DIRECT" | "ADVANCE";
  released: boolean;
  releaseReason: string | null;
  invoiceStatus: InvoiceStatus;
  invoiceBalanceDisplay: string;
};

export type Payment = {
  paymentId: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  centreName: string | null;
  paymentDate: string;
  payBy: string | null;
  receivedByUserId: string | null;
  receivedByName: string | null;
  amountPaise: number;
  amountDisplay: string;
  discountPaise: number;
  discountDisplay: string;
  discountReason: string | null;
  advancePaise: number;
  advanceDisplay: string;
  note: string | null;
  channel: "COUNTER" | "ONLINE";
  status: "RECORDED" | "CANCELLED";
  statusLabel: string;
  methods: { method: PaymentMethodCode; methodLabel: string; amountPaise: number; amountDisplay: string; reference: string | null }[];
  methodSummary: string;
  invoiceNumbers: string[];
  source: string;
  createdAt: string | null;
  createdByName: string | null;
  editedAt: string | null;
  editedByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  allocations?: PaymentAllocationView[];
  replayed?: boolean;
};

export type PaymentInput = {
  paymentDate?: string | null;
  payBy?: string | null;
  receivedByUserId?: string | null;
  note?: string | null;
  allocations: { invoiceId: string; amountPaise: number; discountPaise: number }[];
  methods: { method: PaymentMethodCode; amountPaise: number; reference?: string | null }[];
  discountReason?: string | null;
  keepAdvance?: boolean;
};

export type StatementEntry = {
  type: "INVOICE" | "PAYMENT";
  id: string;
  number: string;
  date: string;
  description: string;
  chargePaise: number;
  creditPaise: number;
  chargeDisplay: string | null;
  creditDisplay: string | null;
  cancelled: boolean;
  amountDisplay: string;
  balancePaise: number;
  balanceDisplay: string;
};

export type StudentAccount = {
  student: {
    studentId: string;
    name: string;
    studentCode: string;
    customId: string | null;
    levelCode: string | null;
    centreName: string | null;
    parentName: string | null;
    mobile: string | null;
    isActive: boolean;
  };
  totals: {
    invoicedPaise: number; invoicedDisplay: string;
    receivedPaise: number; receivedDisplay: string;
    discountPaise: number; discountDisplay: string;
    duePaise: number; dueDisplay: string;
    overduePaise: number; overdueDisplay: string;
    advancePaise: number; advanceDisplay: string;
  };
  receiptNumbering: { numberingReady: boolean; nextNumber: string | null };
  unpaidInvoices: Invoice[];
  invoices: Invoice[];
  payments: Payment[];
  statement: StatementEntry[];
};

export type PaymentFilters = {
  status?: string;
  method?: string;
  receivedBy?: string;
  centreId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type PaymentList = {
  page: number;
  pageSize: number;
  totalCount: number;
  totals: { receivedDisplay: string; discountDisplay: string; byMethod: { method: PaymentMethodCode; methodLabel: string; amountDisplay: string; amountPaise: number }[] };
  payments: Payment[];
};

function CleanPaymentFilters(filters: PaymentFilters): PaymentFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== "ALL")) as PaymentFilters;
}

export async function getStudentAccount(studentId: string): Promise<StudentAccount> {
  const { data } = await api.get<StudentAccount>(`/admin/payments/students/${studentId}/account`);
  return data;
}

export async function listPaymentStaff(): Promise<{ staff: { userId: string; name: string }[]; currentUserId: string }> {
  const { data } = await api.get("/admin/payments/staff");
  return data;
}

export async function recordPayment(payload: PaymentInput & { studentId: string; idempotencyKey: string }): Promise<Payment> {
  const { data } = await api.post<Payment>("/admin/payments/receipts", payload);
  return data;
}

export async function editPayment(paymentId: string, payload: PaymentInput & { reason: string }): Promise<Payment> {
  const { data } = await api.put<Payment>(`/admin/payments/receipts/${paymentId}`, payload);
  return data;
}

export async function cancelPayment(paymentId: string, reason: string): Promise<Payment> {
  const { data } = await api.post<Payment>(`/admin/payments/receipts/${paymentId}/cancel`, { reason });
  return data;
}

export async function getPayment(paymentId: string): Promise<Payment> {
  const { data } = await api.get<Payment>(`/admin/payments/receipts/${paymentId}`);
  return data;
}

export async function listPayments(filters: PaymentFilters, page = 1, pageSize = 50): Promise<PaymentList> {
  const { data } = await api.get<PaymentList>("/admin/payments/receipts", { params: { ...CleanPaymentFilters(filters), page, pageSize } });
  return data;
}

export async function applyStudentAdvance(studentId: string): Promise<{ appliedPaise: number; appliedDisplay: string }> {
  const { data } = await api.post(`/admin/payments/students/${studentId}/apply-advance`);
  return data;
}

export async function downloadReceiptPdf(paymentId: string): Promise<Blob> {
  const { data } = await api.get(`/admin/payments/receipts/${paymentId}/pdf`, { responseType: "blob" });
  return data;
}

export async function downloadReceiptsPdf(payload: { paymentIds?: string[]; filters?: PaymentFilters }): Promise<Blob> {
  const body = { paymentIds: payload.paymentIds, filters: payload.filters ? CleanPaymentFilters(payload.filters) : undefined };
  const { data } = await api.post("/admin/payments/receipts/pdf", body, { responseType: "blob" });
  return data;
}

export async function downloadPaymentsExcel(filters: PaymentFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/receipts/export", { params: CleanPaymentFilters(filters), responseType: "blob" });
  return data;
}

// ---------------------------------------------------------------------------
// 2026-10-08 (Payments Phase 4): reports and expenses.
// ---------------------------------------------------------------------------

export type MoneyValue = { paise: number; display: string };
export type MethodTotal = MoneyValue & { method: PaymentMethodCode; methodLabel: string };
export type DuesBucketKey = "NOT_DUE" | "D0_30" | "D31_60" | "D61_90" | "D90_PLUS";

export type PaymentsOverview = {
  today: string;
  todayCollected: MoneyValue;
  todayPaymentCount: number;
  todayByMethod: MethodTotal[];
  thisMonthLabel: string;
  thisMonthCollected: MoneyValue;
  lastMonthLabel: string;
  lastMonthCollected: MoneyValue;
  thisMonthSpent: MoneyValue;
  thisMonthNet: MoneyValue;
  due: MoneyValue;
  overdue: MoneyValue;
  studentsWithDues: number;
  unpaidInvoices: number;
  buckets: (MoneyValue & { bucket: DuesBucketKey; label: string })[];
  advanceHeld: MoneyValue;
  series: { month: string; label: string; collected: MoneyValue; spent: MoneyValue }[];
  recentPayments: Payment[];
};

export type CollectionFilters = { dateFrom?: string; dateTo?: string; method?: string; receivedBy?: string; centreId?: string };

export type CollectionsReport = {
  dateFrom: string;
  dateTo: string;
  total: MoneyValue;
  discount: MoneyValue;
  paymentCount: number;
  byMethod: MethodTotal[];
  byStaff: (MoneyValue & { userId: string | null; name: string; paymentCount: number; byMethod: MethodTotal[] })[];
  byDay: (MoneyValue & { date: string; paymentCount: number; byMethod: MethodTotal[] })[];
  payments: (Payment & { inFilterPaise: number; inFilterDisplay: string })[];
  paymentsTruncated: boolean;
};

export type DuesFilters = { centreId?: string; levelCode?: string; feeItemId?: string; bucket?: string; search?: string; activeOnly?: string; sort?: string };

export type DuesStudent = {
  studentId: string;
  studentName: string;
  studentCode: string;
  customId: string | null;
  parentName: string | null;
  mobile: string | null;
  centreName: string | null;
  levelCode: string | null;
  isActive: boolean;
  invoices: {
    invoiceId: string;
    invoiceNumber: string;
    feeName: string;
    periodLabel: string | null;
    invoiceDate: string;
    dueDate: string | null;
    daysOverdue: number;
    bucket: DuesBucketKey;
    bucketLabel: string;
    balancePaise: number;
    balanceDisplay: string;
    amountDisplay: string;
  }[];
  duePaise: number;
  dueDisplay: string;
  overduePaise: number;
  overdueDisplay: string;
  maxDaysOverdue: number;
  oldestDueDate: string | null;
  bucket: DuesBucketKey;
  bucketLabel: string;
  advancePaise: number;
  advanceDisplay: string;
};

export type DuesReport = {
  asOf: string;
  studentCount: number;
  invoiceCount: number;
  total: MoneyValue;
  overdue: MoneyValue;
  buckets: (MoneyValue & { bucket: DuesBucketKey; label: string })[];
  students: DuesStudent[];
};

export type ExpenseCategory = { categoryId: string; name: string; displayOrder: number; isActive: boolean; expenseCount: number };

export type Expense = {
  expenseId: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId: string | null;
  categoryName: string;
  item: string;
  vendor: string | null;
  billNumber: string | null;
  details: string | null;
  note: string | null;
  centreId: string | null;
  centreName: string | null;
  amountPaise: number;
  amountDisplay: string;
  methods: { method: PaymentMethodCode; methodLabel: string; amountPaise: number; amountDisplay: string; reference: string | null }[];
  methodSummary: string;
  status: "RECORDED" | "CANCELLED";
  statusLabel: string;
  createdAt: string | null;
  createdByName: string | null;
  editedAt: string | null;
  editedByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  replayed?: boolean;
};

export type ExpenseInput = {
  expenseDate?: string | null;
  categoryId: string;
  item: string;
  vendor?: string | null;
  billNumber?: string | null;
  details?: string | null;
  note?: string | null;
  centreId?: string | null;
  methods: { method: PaymentMethodCode; amountPaise: number; reference?: string | null }[];
};

export type ExpenseFilters = { status?: string; month?: string; dateFrom?: string; dateTo?: string; categoryId?: string; centreId?: string; method?: string; search?: string };

export type ExpenseList = {
  page: number;
  pageSize: number;
  totalCount: number;
  totals: {
    totalPaise: number;
    totalDisplay: string;
    byCategory: { categoryName: string; amountPaise: number; amountDisplay: string; count: number }[];
    byMethod: { method: PaymentMethodCode; methodLabel: string; amountPaise: number; amountDisplay: string }[];
  };
  expenses: Expense[];
};

function CleanParams<T extends Record<string, string | undefined>>(filters: T): Partial<T> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== "ALL")) as Partial<T>;
}

export async function getPaymentsOverview(): Promise<PaymentsOverview> {
  const { data } = await api.get<PaymentsOverview>("/admin/payments/reports/overview");
  return data;
}

export async function getCollectionsReport(filters: CollectionFilters): Promise<CollectionsReport> {
  const { data } = await api.get<CollectionsReport>("/admin/payments/reports/collections", { params: CleanParams(filters) });
  return data;
}

export async function downloadCollectionsExcel(filters: CollectionFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/collections/export", { params: CleanParams(filters), responseType: "blob" });
  return data;
}

export async function downloadCollectionsPdf(filters: CollectionFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/collections/pdf", { params: CleanParams(filters), responseType: "blob" });
  return data;
}

export async function getDuesReport(filters: DuesFilters): Promise<DuesReport> {
  const { data } = await api.get<DuesReport>("/admin/payments/reports/dues", { params: CleanParams(filters) });
  return data;
}

export async function downloadDuesExcel(filters: DuesFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/dues/export", { params: CleanParams(filters), responseType: "blob" });
  return data;
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data } = await api.get<{ categories: ExpenseCategory[] }>("/admin/payments/expense-categories");
  return data.categories;
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const { data } = await api.post<ExpenseCategory>("/admin/payments/expense-categories", { name });
  return data;
}

export async function updateExpenseCategory(categoryId: string, payload: { name?: string; isActive?: boolean; reason?: string | null }): Promise<ExpenseCategory> {
  const { data } = await api.patch<ExpenseCategory>(`/admin/payments/expense-categories/${categoryId}`, payload);
  return data;
}

export async function listExpenses(filters: ExpenseFilters, page = 1, pageSize = 50): Promise<ExpenseList> {
  const { data } = await api.get<ExpenseList>("/admin/payments/expenses", { params: { ...CleanParams(filters), page, pageSize } });
  return data;
}

export async function createExpense(payload: ExpenseInput & { idempotencyKey: string }): Promise<Expense> {
  const { data } = await api.post<Expense>("/admin/payments/expenses", payload);
  return data;
}

export async function editExpense(expenseId: string, payload: ExpenseInput & { reason: string }): Promise<Expense> {
  const { data } = await api.put<Expense>(`/admin/payments/expenses/${expenseId}`, payload);
  return data;
}

export async function cancelExpense(expenseId: string, reason: string): Promise<Expense> {
  const { data } = await api.post<Expense>(`/admin/payments/expenses/${expenseId}/cancel`, { reason });
  return data;
}

export async function downloadExpensesExcel(filters: ExpenseFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/expenses/export", { params: CleanParams(filters), responseType: "blob" });
  return data;
}


// ---------------------------------------------------------------------------
// 2026-10-09 (Payments Phase 5): online payments -- the switches, the Online
// Payments log and parent pay links.
// ---------------------------------------------------------------------------

export type OnlineSettings = {
  studentFeesEnabled: boolean;
  onlinePaymentsEnabled: boolean;
  onlinePaymentsLive: boolean;
  keyMode: "TEST" | "LIVE" | null;
  keyIdMasked: string | null;
  keysReady: boolean;
  webhookSecretSet: boolean;
  receiptNumberingReady: boolean;
  problems: string[];
  webhookPath: string;
  webhookEvents: string[];
  updatedAt: string | null;
};

export type OnlineOrderStatus = "CREATED" | "ABANDONED" | "FAILED" | "PAID" | "ATTENTION";

export type OnlineOrder = {
  orderRef: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  amountPaise: number;
  amountDisplay: string;
  invoices: { invoiceId: string; invoiceNumber: string; amountPaise: number; amountDisplay: string }[];
  source: "STUDENT" | "PAY_LINK";
  sourceLabel: string;
  keyMode: "TEST" | "LIVE";
  status: OnlineOrderStatus;
  statusLabel: string;
  methodDetail: string | null;
  lastError: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  receiptStatus: string | null;
  createdAt: string | null;
  paidAt: string | null;
  events?: { eventId: string; source: string; type: string; label: string; detail: string | null; razorpayPaymentId: string | null; createdAt: string | null }[];
};

export type OnlineOrderFilters = { status?: string; source?: string; studentId?: string; dateFrom?: string; dateTo?: string; search?: string };

export type OnlineOrderList = {
  page: number;
  pageSize: number;
  totalCount: number;
  counts: Record<OnlineOrderStatus, number>;
  paidDisplay: string;
  orders: OnlineOrder[];
  settings: OnlineSettings;
};

export type PayLink = {
  linkId: string;
  token: string;
  path: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string | null;
};

export async function getOnlineSettings(): Promise<OnlineSettings> {
  const { data } = await api.get<OnlineSettings>("/admin/payments/online/settings");
  return data;
}

export async function updateOnlineSettings(payload: { studentFeesEnabled?: boolean; onlinePaymentsEnabled?: boolean }): Promise<OnlineSettings> {
  const { data } = await api.put<OnlineSettings>("/admin/payments/online/settings", payload);
  return data;
}

export async function listOnlineOrders(filters: OnlineOrderFilters, page = 1, pageSize = 50): Promise<OnlineOrderList> {
  const { data } = await api.get<OnlineOrderList>("/admin/payments/online/orders", { params: { ...filters, page, pageSize } });
  return data;
}

export async function getOnlineOrder(orderRef: string): Promise<OnlineOrder> {
  const { data } = await api.get<OnlineOrder>(`/admin/payments/online/orders/${encodeURIComponent(orderRef)}`);
  return data;
}

export async function checkOnlineOrder(orderRef: string): Promise<OnlineOrder> {
  const { data } = await api.post<OnlineOrder>(`/admin/payments/online/orders/${encodeURIComponent(orderRef)}/check`);
  return data;
}

export async function getStudentPayLink(studentId: string): Promise<{ link: PayLink | null; onlinePaymentsLive: boolean }> {
  const { data } = await api.get(`/admin/payments/students/${encodeURIComponent(studentId)}/pay-link`);
  return data;
}

export async function createStudentPayLink(studentId: string): Promise<{ link: PayLink; onlinePaymentsLive: boolean }> {
  const { data } = await api.post(`/admin/payments/students/${encodeURIComponent(studentId)}/pay-link`);
  return data;
}

export async function revokePayLink(linkId: string): Promise<{ link: PayLink }> {
  const { data } = await api.post(`/admin/payments/pay-links/${encodeURIComponent(linkId)}/revoke`);
  return data;
}
