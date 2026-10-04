import {
  DocumentSection,
  ExtractedItem,
  AuditLog,
  ReviewedSummary,
  DashboardData,
  CompiledSummaryData,
} from "@contract-assistant/shared";

export const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "/api";

export interface HealthResponse {
  status: string;
  llmMode: "gemini" | "groq" | "huggingface" | "mock";
  db: string;
  timestamp?: string;
  service?: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export interface ContractDetailsResponse {
  contract: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    totalVersions: number;
  };
  activeVersion: {
    id: string;
    versionNumber: number;
    fileType: string;
    pageCount: number | null;
    createdAt: string;
    sections: DocumentSection[];
    extractedItems: ExtractedItem[];
    auditLogs: AuditLog[];
  };
  allVersions: Array<{
    id: string;
    versionNumber: number;
    createdAt: string;
    itemCount: number;
  }>;
  isDemoMode: boolean;
}

export interface ContractListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  approvedCount: number;
  pendingCount: number;
  latestVersionNumber: number;
}

export async function uploadContract(formData: FormData): Promise<{
  contractId: string;
  versionId: string;
  title: string;
  sectionCount: number;
  itemCount: number;
  rejectedCount: number;
  stepErrors: Array<{ step: string; error: string }>;
}> {
  const res = await fetch(`${API_BASE}/contracts/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to upload contract");
  }
  return data;
}

export async function uploadNewVersion(
  contractId: string,
  formData: FormData
): Promise<{
  contractId: string;
  versionId: string;
  versionNumber: number;
  newItemsCount: number;
  staleCount: number;
  carriedOverCount: number;
}> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/versions`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to upload new version");
  }
  return data;
}

export async function getContract(id: string, version?: number): Promise<ContractDetailsResponse> {
  const query = version !== undefined ? `?version=${version}` : "";
  const res = await fetch(`${API_BASE}/contracts/${id}${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch contract details");
  }
  return data;
}

export interface SectionDiffItem {
  id?: string;
  label: string;
  heading: string | null;
  text: string;
  page?: number | null;
}

export interface VersionCompareResponse {
  contractId: string;
  v1: number;
  v2: number;
  sectionDiff: {
    added: SectionDiffItem[];
    removed: SectionDiffItem[];
    modified: Array<{
      v1: SectionDiffItem;
      v2: SectionDiffItem;
      diffSummary: string;
    }>;
    unchanged: SectionDiffItem[];
  };
  staleItemsQueue: ExtractedItem[];
}

export async function compareVersions(
  contractId: string,
  v1?: number,
  v2?: number
): Promise<VersionCompareResponse> {
  const params = new URLSearchParams();
  if (v1 !== undefined) params.append("v1", v1.toString());
  if (v2 !== undefined) params.append("v2", v2.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/contracts/${contractId}/versions/compare${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to compare versions");
  }
  return data;
}

export async function resolveStaleItem(
  contractId: string,
  itemId: string,
  action: "reconfirm" | "dismiss",
  note?: string
): Promise<{ success: boolean; item: ExtractedItem }> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/items/${itemId}/stale-resolve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to resolve stale item");
  }
  return data;
}

export async function retryExtractionStep(
  contractId: string,
  step: string
): Promise<{
  success: boolean;
  step: string;
  addedCount: number;
  stepErrors: Array<{ step: string; error: string }>;
}> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/extract/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to retry step ${step}`);
  }
  return data;
}

export async function listContracts(): Promise<{ contracts: ContractListItem[] }> {
  const res = await fetch(`${API_BASE}/contracts`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch contracts");
  }
  return data;
}

export async function reviewItem(
  contractId: string,
  itemId: string,
  action: "approve" | "reject" | "edit" | "override_date" | "answer_question",
  newValue?: string,
  note?: string
): Promise<{ success: boolean; item: ExtractedItem }> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, newValue, note }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to update review item");
  }
  return data;
}

export async function bulkApproveItems(
  contractId: string,
  itemIds: string[]
): Promise<{
  success: boolean;
  approvedCount: number;
  skippedUncertainCount: number;
  skippedItemIds: string[];
}> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/items/bulk-approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Bulk approval failed");
  }
  return data;
}

export async function getAuditLog(contractId: string): Promise<{ logs: AuditLog[] }> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/audit-log`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch audit log");
  }
  return data;
}

export async function getDashboardData(timeframe?: string | number): Promise<DashboardData> {
  const query = timeframe && timeframe !== "all" ? `?timeframe=${timeframe}` : "";
  const res = await fetch(`${API_BASE}/dashboard${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch dashboard data");
  }
  return data;
}

export interface ContractSummaryResponse {
  summary: ReviewedSummary;
  compiled: CompiledSummaryData;
  isOutdated: boolean;
}

export async function getContractSummary(contractId: string): Promise<ContractSummaryResponse> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/summary`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch contract summary");
  }
  return data;
}

export async function generateContractSummary(contractId: string): Promise<ContractSummaryResponse> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/summary/generate`, {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to generate summary");
  }
  return data;
}

export async function deleteContract(
  contractId: string
): Promise<{ success: boolean; message: string; deletedId: string }> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to delete contract");
  }
  return data;
}

