// src/lib/api.applications.ts
"use client";

import { apiFetch } from "./api";

export type ApplicationStatus = "pending" | "approved" | "rejected";

export type ApplicationListItem = {
  id: string;
  status: ApplicationStatus;
  receivedAt: string | null;
  registeredAt?: string | null;
  fullName: string | null;
  furigana?: string | null;
  birthdate?: string | null;
  age: number | null;
  address: string | null;
  phone?: string | null;
  email?: string | null;
};

export type ApplicationWorkHistory = {
  id: string;
  applicationId: string;
  shopName: string;
  hourlyWage: number | null;
};

export type ApplicationNgShop = {
  id: string;
  applicationId: string;
  shopName: string;
};

export type ApplicationDoc = {
  id: string;
  docType: string;
  s3Key: string;
  uploadedAt: string;
};

export type ApplicationDetail = ApplicationListItem & {
  channel?: string;
  drinkOk?: boolean | null;
  genres?: string[];
  hourlyExpectation?: number | null;
  interviewNotes?: string | null;
  desiredArea?: string | null;
  heightCm?: number | null;
  clothingSize?: string | null;
  shoeSizeCm?: number | null;
  preferredDays?: string[];
  preferredTimeFrom?: string | null;
  preferredTimeTo?: string | null;
  desiredMonthly?: number | null;
  tattoo?: boolean | null;
  needPickup?: boolean | null;
  drinkLevel?: string | null;
  howFound?: string | null;
  motivation?: string | null;
  competitorCount?: string | null;
  reasonChoose?: string | null;
  shopSelectionPoints?: string | null;
  otherNotes?: string | null;
  workHistories?: ApplicationWorkHistory[];
  ngShops?: ApplicationNgShop[];
  docs?: ApplicationDoc[];
};

export type UpdateApplicationFormInput = Partial<{
  fullName: string;
  furigana: string;
  birthdate: string;
  age: number;
  phone: string;
  email: string;
  desiredArea: string;
  drinkOk: boolean;
  genres: string[];
  hourlyExpectation: number;
  registeredAt: string;
  address: string;
  heightCm: number;
  clothingSize: string;
  shoeSizeCm: number;
  preferredDays: string[];
  preferredTimeFrom: string;
  preferredTimeTo: string;
  desiredMonthly: number;
  tattoo: boolean;
  needPickup: boolean;
  drinkLevel: string;
  howFound: string;
  motivation: string;
  competitorCount: string;
  reasonChoose: string;
  shopSelectionPoints: string;
  otherNotes: string;
}>;

export type ListApplicationsParams = {
  status?: ApplicationStatus;
  q?: string;
  take?: number;
};

export function listApplications(
  params: ListApplicationsParams = {}
): Promise<ApplicationListItem[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (typeof params.take === "number") qs.set("take", String(params.take));
  const query = qs.toString();
  return apiFetch<ApplicationListItem[]>(
    `/applications${query ? `?${query}` : ""}`
  );
}

export function getApplication(id: string): Promise<ApplicationDetail> {
  return apiFetch<ApplicationDetail>(`/applications/${id}`);
}

export function approveApplication(id: string) {
  return apiFetch(`/applications/${id}/approve`, { method: "PATCH" });
}

export function updateApplicationForm(
  id: string,
  payload: UpdateApplicationFormInput
): Promise<ApplicationDetail> {
  return apiFetch<ApplicationDetail>(`/applications/${id}/form`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
