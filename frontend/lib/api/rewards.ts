import { api } from "@/lib/api";

// 2026-10-18 (Rewards): the student's Reward Store.
export type RewardStatus = "UNLOCKED" | "READY" | "COLLECTED" | "CANCELLED" | "REJECTED";

export type StoreItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  inStock: boolean;
  coinsToGo: number;
  progress: number;
  canUnlock: boolean;
  isGoal: boolean;
};

export type RewardOrder = {
  id: string;
  itemId: string | null;
  itemName: string;
  imageUrl: string | null;
  price: number;
  status: RewardStatus;
  pickupCode: string;
  unlockedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  canCancel: boolean;
};

export type RewardStore = {
  balance: number;
  lifetimeEarned: number;
  spent: number;
  items: StoreItem[];
  goal: StoreItem | null;
  orders: RewardOrder[];
  counts: { unlocked: number; ready: number; collected: number };
};

export type CoinEntry = { id: string; at: string | null; type: "EARN" | "SPEND" | "REFUND"; coins: number; label: string; source: string };
export type CoinHistoryPage = { entries: CoinEntry[]; more: boolean; next: string | null };

export async function getRewardStore() {
  const { data } = await api.get<RewardStore>("/student/rewards");
  return data;
}

export async function unlockReward(itemId: string, requestKey: string) {
  const { data } = await api.post<{ order: RewardOrder; created: boolean; store: RewardStore }>("/student/rewards/unlock", { itemId, requestKey });
  return data;
}

export async function cancelReward(orderId: string) {
  const { data } = await api.post<{ order: RewardOrder; store: RewardStore }>(`/student/rewards/orders/${encodeURIComponent(orderId)}/cancel`);
  return data;
}

export async function setRewardGoal(itemId: string | null) {
  const { data } = await api.put<RewardStore>("/student/rewards/goal", { itemId });
  return data;
}

export async function getCoinHistory(before?: string | null, limit = 40) {
  const { data } = await api.get<CoinHistoryPage>("/student/rewards/history", { params: { limit, ...(before ? { before } : {}) } });
  return data;
}

/** A fresh key for each unlock, so a double tap or a retry never unlocks twice. */
/** Where the browser should load a reward photo from. The backend stores
 *  same-origin paths such as /uploads/rewards/starter-x.webp, and the site
 *  itself serves /uploads (nginx in production, the Next rewrite locally), so
 *  the path is used as it is. Prefixing the API host here sent production
 *  browsers to http://localhost:8000, because that build has no
 *  NEXT_PUBLIC_API_BASE_URL. */
export function rewardPhotoSrc(Url?: string | null): string {
  const Clean = String(Url || "").trim();
  if (!Clean || Clean.startsWith("data:")) return "";
  if (/^(https?:|blob:)/.test(Clean)) return Clean;
  return Clean.startsWith("/") ? Clean : `/${Clean}`;
}

export function newRequestKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------- admin (Part 3) -------------------------------------------------------

export type AdminRewardItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: number | null;
  inStock: boolean;
  isActive: boolean;
  isStarter: boolean;
  sortOrder: number;
  unlocked: number;
  waiting: number;
  ready: number;
  collected: number;
  updatedAt: string | null;
};

export type RewardPerson = {
  studentId: string;
  studentCode: string;
  name: string;
  photoUrl: string | null;
  levelCode: string | null;
  isDemo: boolean;
  isActive: boolean;
};

export type AdminRewardOrder = Omit<RewardOrder, "canCancel"> & {
  student: RewardPerson | null;
  readyBy: string | null;
  collectedBy: string | null;
  closedBy: string | null;
};

export type RewardSummary = {
  toPrepare: number;
  ready: number;
  collectedThisMonth: number;
  coinsWithStudents: number;
  items: { active: number; off: number; outOfStock: number };
};

export type ShoppingRow = { itemId: string | null; itemName: string; imageUrl: string | null; count: number; oldest: string | null };
export type CoinStudent = RewardPerson & { balance: number; earned: number; spent: number; openRewards: number };
export type OrderFilters = { status?: string; q?: string; start?: string; end?: string };

function Clean(Params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(Params).filter(([, Value]) => Value !== undefined && Value !== "" && Value !== "ALL"));
}

export async function getRewardSummary() {
  const { data } = await api.get<RewardSummary>("/admin/rewards/summary");
  return data;
}

export async function getAdminRewardItems() {
  const { data } = await api.get<{ items: AdminRewardItem[] }>("/admin/rewards/items");
  return data.items;
}

export type RewardItemInput = { name?: string; description?: string | null; price?: number; stock?: number | null; isActive?: boolean };

export async function createRewardItem(payload: RewardItemInput) {
  const { data } = await api.post<{ item: AdminRewardItem; items: AdminRewardItem[] }>("/admin/rewards/items", payload);
  return data;
}

export async function updateRewardItem(id: string, payload: RewardItemInput) {
  const { data } = await api.patch<{ item: AdminRewardItem; items: AdminRewardItem[] }>(`/admin/rewards/items/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function uploadRewardPhoto(id: string, file: File) {
  const Form = new FormData();
  Form.append("file", file);
  const { data } = await api.post<{ item: AdminRewardItem }>(`/admin/rewards/items/${encodeURIComponent(id)}/image`, Form, { headers: { "Content-Type": "multipart/form-data" } });
  return data.item;
}

export async function reorderRewardItems(itemIds: string[]) {
  const { data } = await api.post<{ items: AdminRewardItem[] }>("/admin/rewards/items/reorder", { itemIds });
  return data.items;
}

export async function getAdminRewardOrders(filters: OrderFilters = {}) {
  const { data } = await api.get<{ orders: AdminRewardOrder[] }>("/admin/rewards/orders", { params: Clean(filters) });
  return data.orders;
}

export async function downloadRewardOrders(filters: OrderFilters = {}): Promise<Blob> {
  const { data } = await api.get("/admin/rewards/orders/export", { params: Clean(filters), responseType: "blob" });
  return data;
}

export async function getShoppingList() {
  const { data } = await api.get<{ items: ShoppingRow[] }>("/admin/rewards/shopping-list");
  return data.items;
}

export async function findRewardCode(code: string) {
  const { data } = await api.get<{ match: RewardOrder; student: RewardPerson | null; open: RewardOrder[] }>(`/admin/rewards/orders/by-code/${encodeURIComponent(code)}`);
  return data;
}

export async function markRewardsReady(orderIds: string[]) {
  const { data } = await api.post<{ moved: RewardOrder[] }>("/admin/rewards/orders/ready", { orderIds });
  return data.moved;
}

export async function markRewardCollected(orderId: string) {
  const { data } = await api.post<{ order: RewardOrder }>(`/admin/rewards/orders/${encodeURIComponent(orderId)}/collect`);
  return data.order;
}

export async function rejectReward(orderId: string, reason: string) {
  const { data } = await api.post<{ order: RewardOrder }>(`/admin/rewards/orders/${encodeURIComponent(orderId)}/reject`, { reason });
  return data.order;
}

export async function getCoinStudents(q?: string, levelId?: string) {
  const { data } = await api.get<{ students: CoinStudent[]; levels: { id: string; code: string }[] }>("/admin/rewards/coins", { params: Clean({ q, levelId }) });
  return data;
}

export async function getStudentCoinHistory(studentId: string, before?: string | null) {
  const { data } = await api.get<CoinHistoryPage>(`/admin/rewards/coins/${encodeURIComponent(studentId)}/history`, { params: { limit: 60, ...(before ? { before } : {}) } });
  return data;
}
