import {
  DocumentSection,
  ExtractedItem,
  AuditLog,
  ReviewedSummary,
} from "@contract-assistant/shared";

export const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001/api";

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

export async function getContract(id: string): Promise<ContractDetailsResponse> {
  const res = await fetch(`${API_BASE}/contracts/${id}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch contract details");
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

export async function getDashboardData(timeframeDays?: number): Promise<any> {
  const query = timeframeDays ? `?timeframe=${timeframeDays}` : "";
  const res = await fetch(`${API_BASE}/dashboard${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch dashboard data");
  }
  return data;
}

export async function getContractSummary(contractId: string): Promise<{ summary: ReviewedSummary }> {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/summary`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to fetch contract summary");
  }
  return data;
}

export async function generateContractSummary(contractId: string): Promise<{ summary: ReviewedSummary }> {
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

