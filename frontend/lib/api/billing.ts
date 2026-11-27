// 2026-11-27 (billing Release 2): invoices with several lines, New
// Admission, late fees, handover, article fields and dated prices, stock,
// the book queue and the ledger / register / tuition reports. Admin only.
import { api } from "@/lib/api";
import type { FeeItem, Invoice, Payment, PaymentMethodCode } from "@/lib/api/payments";

export type ArticleKind = "TUITION" | "REGISTRATION" | "BOOK" | "MERCH" | "LATE_FEE" | "OTHER";
export const ARTICLE_KIND_LABELS: Record<ArticleKind, string> = {
  TUITION: "Tuition",
  REGISTRATION: "Registration",
  BOOK: "Book / study material",
  MERCH: "Merchandise / kit",
  LATE_FEE: "Late fee",
  OTHER: "Other",
};

export type InvoiceType = "ADMISSION" | "MONTHLY_TUITION" | "STUDY_MATERIAL" | "SALE" | "LATE_FEE" | "OTHER";
export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  ADMISSION: "Admission",
  MONTHLY_TUITION: "Monthly tuition",
  STUDY_MATERIAL: "Study material",
  SALE: "Sale",
  LATE_FEE: "Late fee",
  OTHER: "Other",
};

export type UpcomingPrice = { priceId: string; amountPaise: number; amount: string; amountDisplay: string; effectiveFrom: string; reason: string | null };

export type Article = {
  articleKind: ArticleKind;
  articleKindLabel: string;
  sku: string | null;
  isStock: boolean;
  levelCode: string | null;
  unit: string | null;
  costPaise: number | null;
  cost: string | null;
  costDisplay: string | null;
  inKit: boolean;
  upcomingPrices: UpcomingPrice[];
};

export type ArticleFeeItem = FeeItem & Partial<Article>;

export async function updateArticle(feeItemId: string, payload: Partial<{ articleKind: ArticleKind; sku: string | null; isStock: boolean; levelCode: string | null; unit: string | null; cost: string | null; inKit: boolean }>): Promise<ArticleFeeItem> {
  const { data } = await api.patch<ArticleFeeItem>(`/admin/payments/fee-items/${feeItemId}/article`, payload);
  return data;
}

export async function schedulePrice(feeItemId: string, payload: { amount: string; effectiveFrom: string; reason?: string | null }): Promise<ArticleFeeItem> {
  const { data } = await api.post<ArticleFeeItem>(`/admin/payments/fee-items/${feeItemId}/prices`, payload);
  return data;
}

export async function cancelScheduledPrice(priceId: string): Promise<ArticleFeeItem> {
  const { data } = await api.post<ArticleFeeItem>(`/admin/payments/fee-prices/${priceId}/cancel`, {});
  return data;
}

// --- New Invoice / New Admission ---------------------------------------------

export type DiscountType = "FIXED" | "PERCENT";

export type DraftLine = {
  feeItemId: string;
  quantity?: number;
  discountType?: DiscountType | null;
  discountValue?: string | null;
  isKit?: boolean;
  billingMonth?: number | null;
  billingYear?: number | null;
};

export type DraftPayment = {
  paymentDate?: string | null;
  payBy?: string | null;
  receivedByUserId?: string | null;
  note?: string | null;
  methods: { method: PaymentMethodCode; amountPaise: number; reference?: string | null }[];
  keepAdvance?: boolean;
};

export type InvoiceDraft = {
  studentId: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  lines: DraftLine[];
  invoiceDiscount?: { type: DiscountType | null; value: string | null } | null;
  discountReason?: string | null;
  approvedByUserId?: string | null;
  payment?: DraftPayment | null;
};

export type PricedLine = {
  lineNo: number;
  feeItemId: string;
  name: string;
  description: string;
  kind: ArticleKind;
  quantity: number;
  unitPaise: number;
  unitDisplay: string;
  grossPaise: number;
  discountPaise: number;
  discountDisplay: string;
  discountText: string | null;
  netPaise: number;
  netDisplay: string;
  isKit: boolean;
  isStock: boolean;
  periodKey: string | null;
};

export type InvoicePreviewR2 = {
  invoiceDate: string;
  dueDate: string;
  lines: PricedLine[];
  subtotalPaise: number;
  subtotalDisplay: string;
  invoiceDiscountPaise: number;
  invoiceDiscountDisplay: string;
  totalPaise: number;
  totalDisplay: string;
  taxableDisplay: string;
  cgstDisplay: string;
  sgstDisplay: string;
  gstRatePercent: number;
  hasDiscount: boolean;
  short: { feeItemId: string; name: string; centreName: string; inStock: number; needed: number }[];
  problems: string[];
};

export type InvoiceLineView = {
  lineId: string | null;
  lineNo: number;
  feeItemId: string | null;
  name: string;
  description: string | null;
  kind: ArticleKind;
  kindLabel: string;
  quantity: number;
  unitPaise: number;
  unitDisplay: string;
  discountPaise: number;
  discountDisplay: string;
  discountText: string | null;
  netPaise: number;
  netDisplay: string;
  finalPaise: number;
  isKit: boolean;
  isStock: boolean;
  periodKey: string | null;
  stockCentreName: string | null;
  handedOverOn: string | null;
  handedOverByName: string | null;
  canHandOver: boolean;
  handOverBlockedReason?: string | null;
};

export type InvoiceDetail = Invoice & {
  snapshot: Record<string, unknown>;
  lines: InvoiceLineView[];
  lateFees: { invoiceId: string; invoiceNumber: string; status: string; amountDisplay: string }[];
  parentInvoice: { invoiceId: string; invoiceNumber: string; feeName: string } | null;
  lateFee: { allowed: boolean; reason: string | null };
};

export type CreatedInvoice = { invoice: InvoiceDetail; payment: Payment | null; replayed: boolean };

export async function previewNewInvoice(draft: InvoiceDraft, admission = false): Promise<InvoicePreviewR2> {
  const { data } = await api.post<InvoicePreviewR2>(admission ? "/admin/payments/admission/preview" : "/admin/payments/invoices/create/preview", draft);
  return data;
}

export async function createNewInvoice(draft: InvoiceDraft & { idempotencyKey: string }, admission = false): Promise<CreatedInvoice> {
  const { data } = await api.post<CreatedInvoice>(admission ? "/admin/payments/admission" : "/admin/payments/invoices/create", draft);
  return data;
}

export type StockAvailability = { trackingEnabled: boolean; stockCentreId: string | null; stockCentreName: string | null; lowStockThreshold: number; quantities: Record<string, number> };

export type AdmissionTemplate = {
  studentId: string;
  studentName: string;
  studentCode: string;
  levelCode: string | null;
  billingMode: "INDIA" | "INTERNATIONAL" | "EXEMPT";
  rateGroup: "EXISTING" | "NEW";
  admissionDate: string | null;
  invoiceDate: string;
  lines: (DraftLine & { included?: boolean })[];
  notes: string[];
  existingAdmission: { invoiceId: string; invoiceNumber: string } | null;
  stock: StockAvailability;
};

export async function getAdmissionTemplate(studentId: string, invoiceDate?: string): Promise<AdmissionTemplate> {
  const { data } = await api.get<AdmissionTemplate>("/admin/payments/admission/template", { params: { studentId, invoiceDate: invoiceDate || undefined } });
  return data;
}

export async function getStockAvailability(studentId: string): Promise<StockAvailability> {
  const { data } = await api.get<StockAvailability>("/admin/payments/inventory/availability", { params: { studentId } });
  return data;
}

export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
  const { data } = await api.get<InvoiceDetail>(`/admin/payments/invoices/${invoiceId}`);
  return data;
}

export async function addLateFee(invoiceId: string): Promise<InvoiceDetail> {
  const { data } = await api.post<InvoiceDetail>(`/admin/payments/invoices/${invoiceId}/late-fee`, {});
  return data;
}

export async function recordHandover(invoiceId: string, lineId: string, date: string): Promise<InvoiceDetail> {
  const { data } = await api.post<InvoiceDetail>(`/admin/payments/invoices/${invoiceId}/lines/${lineId}/handover`, { date });
  return data;
}

// --- Inventory ---------------------------------------------------------------

export type InventoryCentre = { centreId: string; name: string; isActive: boolean; holdsStock: boolean; stockFromCentreId: string | null; stockFromCentreName: string | null };

export type InventorySettings = {
  stockTrackingEnabled: boolean;
  trackingStartedAt: string | null;
  lowStockThreshold: number;
  defaultStockCentreId: string | null;
  defaultStockCentreName: string | null;
  autoBookInvoices: boolean;
  stockItemCount: number;
  movementCount: number;
  centres: InventoryCentre[];
};

export type StockCentreRow = {
  centreId: string;
  centreName: string;
  quantity: number;
  isLow: boolean;
  opening: number;
  received: number;
  issued: number;
  returned: number;
  transferredIn: number;
  transferredOut: number;
  writtenOff: number;
  ledgerMatches: boolean;
};

export type StockItemRow = {
  feeItemId: string;
  name: string;
  sku: string | null;
  kind: ArticleKind;
  levelCode: string | null;
  unit: string | null;
  inKit: boolean;
  isActive: boolean;
  priceDisplay: string;
  costDisplay: string | null;
  valuePaise: number;
  valueDisplay: string | null;
  total: number;
  centres: StockCentreRow[];
};

export type StockSummary = {
  trackingEnabled: boolean;
  lowStockThreshold: number;
  lowCount: number;
  centres: { centreId: string; name: string }[];
  items: StockItemRow[];
  ledgerMatches: boolean;
};

export type StockMovementType = "OPENING" | "INWARD" | "ISSUE" | "CANCEL_RETURN" | "TRANSFER_OUT" | "TRANSFER_IN" | "WRITE_OFF";
export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  OPENING: "Opening stock",
  INWARD: "Stock received",
  ISSUE: "Issued on invoice",
  CANCEL_RETURN: "Returned: invoice cancelled",
  TRANSFER_OUT: "Sent to another centre",
  TRANSFER_IN: "Received from another centre",
  WRITE_OFF: "Written off",
};

export type StockMovementRow = {
  movementId: string;
  date: string;
  type: StockMovementType;
  typeLabel: string;
  feeItemId: string;
  itemName: string;
  sku: string | null;
  centreId: string;
  centreName: string;
  quantity: number;
  balanceAfter: number;
  unitCostDisplay: string | null;
  supplier: string | null;
  billNumber: string | null;
  reason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  studentId: string | null;
  studentName: string | null;
  studentCode: string | null;
  actorName: string | null;
  createdAt: string | null;
};

export type MovementFilters = { feeItemId?: string; centreId?: string; type?: string; studentId?: string; dateFrom?: string; dateTo?: string };

function Clean<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "" && item !== "ALL")) as Partial<T>;
}

export type StockRequest = {
  centreId?: string;
  fromCentreId?: string;
  toCentreId?: string;
  date?: string;
  supplier?: string;
  billNumber?: string;
  note?: string;
  reason?: string;
  lines: { feeItemId: string; quantity: number; unitCost?: string | null }[];
};

export async function getInventorySettings(): Promise<InventorySettings> {
  const { data } = await api.get<InventorySettings>("/admin/payments/inventory/settings");
  return data;
}

export async function updateInventorySettings(payload: Partial<{ stockTrackingEnabled: boolean; lowStockThreshold: number; defaultStockCentreId: string; autoBookInvoices: boolean; reason: string; centres: { centreId: string; holdsStock?: boolean; stockFromCentreId?: string | null }[] }>): Promise<InventorySettings> {
  const { data } = await api.put<InventorySettings>("/admin/payments/inventory/settings", payload);
  return data;
}

export async function getStockSummary(): Promise<StockSummary> {
  const { data } = await api.get<StockSummary>("/admin/payments/inventory/summary");
  return data;
}

export async function listStockMovements(filters: MovementFilters, page = 1, pageSize = 50): Promise<{ page: number; pageSize: number; totalCount: number; movements: StockMovementRow[] }> {
  const { data } = await api.get("/admin/payments/inventory/movements", { params: { ...Clean(filters), page, pageSize } });
  return data;
}

export async function recordStock(kind: "opening" | "inward" | "transfer" | "write-off", payload: StockRequest): Promise<{ recorded: number; summary: StockSummary }> {
  const { data } = await api.post(`/admin/payments/inventory/${kind}`, payload);
  return data;
}

export async function downloadStockExcel(filters: MovementFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/inventory/export", { params: Clean(filters), responseType: "blob" });
  return data;
}

// --- Book queue --------------------------------------------------------------

export type BookTaskStatus = "PENDING" | "ISSUED" | "WAITING_STOCK" | "NO_BOOK" | "ERROR" | "SKIPPED" | "CANCELLED";

export type BookTask = {
  taskId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  levelCode: string | null;
  bookName: string | null;
  priceDisplay: string | null;
  status: BookTaskStatus;
  statusLabel: string;
  lastError: string | null;
  skipReason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  clearedOn: string | null;
  canRaise: boolean;
};

export type BookQueue = { autoBookInvoices: boolean; openCount: number; counts: Partial<Record<BookTaskStatus, number>>; tasks: BookTask[] };

export async function getBookQueue(status?: string): Promise<BookQueue> {
  const { data } = await api.get<BookQueue>("/admin/payments/books/queue", { params: { status: status || undefined } });
  return data;
}

export async function raiseBooks(taskIds: string[]): Promise<{ raised: number; notRaised: { taskId: string; student: string; reason: string }[]; queue: BookQueue }> {
  const { data } = await api.post("/admin/payments/books/raise", { taskIds });
  return data;
}

export async function skipBook(taskId: string, reason: string): Promise<BookQueue> {
  const { data } = await api.post<BookQueue>(`/admin/payments/books/${taskId}/skip`, { reason });
  return data;
}

export async function reopenBook(taskId: string): Promise<BookQueue> {
  const { data } = await api.post<BookQueue>(`/admin/payments/books/${taskId}/reopen`, {});
  return data;
}

export async function downloadBookQueueExcel(status?: string): Promise<Blob> {
  const { data } = await api.get("/admin/payments/books/export", { params: { status: status || undefined }, responseType: "blob" });
  return data;
}

// --- Reports -----------------------------------------------------------------

export type LedgerFilters = { studentId?: string; centreId?: string; dateFrom?: string; dateTo?: string };

export type LedgerStudent = { studentId: string; studentName: string; studentCode: string; centreName: string | null; openingPaise: number; debitPaise: number; creditPaise: number; balancePaise: number; balanceDisplay: string };
export type LedgerRow = { studentId: string; studentName: string; studentCode: string; centreName: string | null; date: string; document: string; kind: string; type: string; description: string; debitPaise: number; creditPaise: number; balancePaise: number; note: string | null };
export type StudentLedger = { students: LedgerStudent[]; rows: LedgerRow[]; totals: { debitPaise: number; creditPaise: number; balancePaise: number } };

export async function getStudentLedger(filters: LedgerFilters): Promise<StudentLedger> {
  const { data } = await api.get<StudentLedger>("/admin/payments/reports/ledger", { params: Clean(filters) });
  return data;
}

export async function downloadLedgerExcel(filters: LedgerFilters): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/ledger/export", { params: Clean(filters), responseType: "blob" });
  return data;
}

export async function downloadRegisterExcel(filters: { centreId?: string; dateFrom?: string; dateTo?: string; invoiceType?: string; includeCancelled?: boolean }): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/register/export", { params: Clean(filters), responseType: "blob" });
  return data;
}

export type TuitionRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  centreName: string;
  levelCode: string | null;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  type: string;
  feeName: string;
  feePaise: number;
  feeDisplay: string;
  paidPaise: number;
  paidDisplay: string;
  unpaidPaise: number;
  unpaidDisplay: string;
  status: string;
};

export type TuitionReport = {
  period: string;
  periodLabel: string;
  billedCount: number;
  paidCount: number;
  billedPaise: number;
  billedDisplay: string;
  collectedPaise: number;
  collectedDisplay: string;
  unpaidPaise: number;
  unpaidDisplay: string;
  byRate: { label: string; count: number; billedDisplay: string; collectedDisplay: string }[];
  rows: TuitionRow[];
};

export async function getTuitionReport(period: string, centreId?: string): Promise<TuitionReport> {
  const { data } = await api.get<TuitionReport>("/admin/payments/reports/tuition", { params: Clean({ period, centreId }) });
  return data;
}

export async function downloadTuitionExcel(period: string, centreId?: string): Promise<Blob> {
  const { data } = await api.get("/admin/payments/reports/tuition/export", { params: Clean({ period, centreId }), responseType: "blob" });
  return data;
}

export function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  } catch {
    // fall through
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
