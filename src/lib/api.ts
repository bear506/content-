import { Brand, CampaignResult, Post, PromoCodeRecord } from "../types";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export type Role = "admin" | "editor" | "viewer";

export interface AuthMe {
  authenticated: boolean;
  id?: string;
  username?: string;
  role?: Role;
}

export interface ManagedUser {
  id: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId?: string;
  username: string;
  body: string;
  createdAt: string;
}

export const authApi = {
  me: () => apiFetch<AuthMe>("/api/auth/me"),
  login: (username: string, password: string) =>
    apiFetch<{ success: true; username: string; role: Role }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => apiFetch<{ success: true }>("/api/auth/logout", { method: "POST" }),
  listUsers: () => apiFetch<{ users: ManagedUser[] }>("/api/auth/users").then((r) => r.users),
  createUser: (username: string, password: string, role: Role) =>
    apiFetch<{ success: true; id: string }>("/api/auth/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  updateUser: (id: string, patch: { role?: Role; isActive?: boolean }) =>
    apiFetch<{ success: true }>(`/api/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  resetUserPassword: (id: string, newPassword: string) =>
    apiFetch<{ success: true }>(`/api/auth/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),
  deleteUser: (id: string) => apiFetch<{ success: true }>(`/api/auth/users/${id}`, { method: "DELETE" }),
};

export const brandsApi = {
  list: () => apiFetch<{ brands: Brand[] }>("/api/brands").then((r) => r.brands),
  save: (brand: Brand) =>
    apiFetch<{ success: true; brand: Brand }>("/api/brands", { method: "POST", body: JSON.stringify(brand) }).then(
      (r) => r.brand
    ),
  remove: (id: string) => apiFetch<{ success: true }>(`/api/brands/${id}`, { method: "DELETE" }),
};

export const campaignsApi = {
  list: () => apiFetch<{ campaigns: CampaignResult[] }>("/api/campaigns").then((r) => r.campaigns),
  create: (config: CampaignResult["config"], brandsData: CampaignResult["brandsData"]) =>
    apiFetch<{ success: true; campaign: CampaignResult }>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ config, brandsData }),
    }).then((r) => r.campaign),
  remove: (id: string) => apiFetch<{ success: true }>(`/api/campaigns/${id}`, { method: "DELETE" }),
};

export const postsApi = {
  update: (id: string, patch: Partial<Post>) =>
    apiFetch<{ success: true; post: Post }>(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then(
      (r) => r.post
    ),
  remove: (id: string) => apiFetch<{ success: true }>(`/api/posts/${id}`, { method: "DELETE" }),
  bulkApprove: (postIds: string[]) =>
    apiFetch<{ success: true; count: number }>("/api/posts/bulk-approve", {
      method: "POST",
      body: JSON.stringify({ postIds }),
    }),
  listComments: (postId: string) => apiFetch<{ comments: Comment[] }>(`/api/posts/${postId}/comments`).then((r) => r.comments),
  addComment: (postId: string, body: string) =>
    apiFetch<{ success: true; id: string }>(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
};

export interface AuditLogEntry {
  id: string;
  userId?: string;
  username: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export const auditLogApi = {
  list: (limit = 200) => apiFetch<{ entries: AuditLogEntry[] }>(`/api/audit-log?limit=${limit}`).then((r) => r.entries),
};

// The reusable "shape" of a campaign — deliberately excludes date/instance-specific fields
// (title, startDate, promoCode, selectedBrandIds, custom voucher codes) so a template can be
// applied fresh to a brand-new campaign without carrying over stale specifics.
export interface CampaignTemplateConfig {
  campaignType: string;
  durationDays: number;
  postsPerDay: number;
  discountType: "percentage" | "amount" | "cashback" | "custom";
  discountValue: number;
  currencyUnit: string;
  minSpend: string;
  discountDetails: string;
  targetPlatforms: string[];
  customNotes: string;
  language: string;
  customGuidelines: string;
  timeSlots: string[];
}

export interface CampaignTemplate {
  id: string;
  name: string;
  config: CampaignTemplateConfig;
  createdBy?: string;
  createdAt: string;
}

export const campaignTemplatesApi = {
  list: () => apiFetch<{ templates: CampaignTemplate[] }>("/api/campaign-templates").then((r) => r.templates),
  create: (name: string, config: CampaignTemplateConfig) =>
    apiFetch<{ success: true; id: string }>("/api/campaign-templates", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    }),
  remove: (id: string) => apiFetch<{ success: true }>(`/api/campaign-templates/${id}`, { method: "DELETE" }),
};

export const settingsApi = {
  getWebhookUrl: () => apiFetch<{ url: string; fromEnv: boolean }>("/api/settings/webhook-url"),
  setWebhookUrl: (url: string) =>
    apiFetch<{ success: true; url: string }>("/api/settings/webhook-url", {
      method: "PUT",
      body: JSON.stringify({ url }),
    }),
  testWebhook: () => apiFetch<{ success: true }>("/api/settings/webhook-url/test", { method: "POST" }),
  getCampaignSop: () =>
    apiFetch<{ sop: Record<string, string>; defaults: Record<string, string> }>("/api/settings/campaign-sop"),
  setCampaignSop: (campaignType: string, text: string) =>
    apiFetch<{ success: true; campaignType: string; text: string }>("/api/settings/campaign-sop", {
      method: "PUT",
      body: JSON.stringify({ campaignType, text }),
    }),
};

export interface PromoCodeSuggestion {
  code: string;
  tagline: string;
  recommendedDiscount: string;
}

export const aiApi = {
  generatePromoCodes: (params: {
    campaignType: string;
    campaignTitle: string;
    monthYear: string;
    brandShortCodes: string[];
    discountDetails: string;
    avoidCodes: string[];
  }) =>
    apiFetch<{ success: true; suggestions: PromoCodeSuggestion[] }>("/api/campaign/generate-promocodes", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const chatApi = {
  send: (message: string, history: ChatMessage[], contextSummary: string) =>
    apiFetch<{ success: true; reply: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, contextSummary }),
    }),
};

export const promoCodesApi = {
  list: () => apiFetch<{ promoCodes: PromoCodeRecord[] }>("/api/promo-codes").then((r) => r.promoCodes),
  create: (record: Partial<PromoCodeRecord>) =>
    apiFetch<{ success: true; id: string }>("/api/promo-codes", { method: "POST", body: JSON.stringify(record) }),
  updateRedemptionCount: (id: string, redemptionCount: number) =>
    apiFetch<{ success: true }>(`/api/promo-codes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ redemptionCount }),
    }),
  remove: (id: string) => apiFetch<{ success: true }>(`/api/promo-codes/${id}`, { method: "DELETE" }),
};
