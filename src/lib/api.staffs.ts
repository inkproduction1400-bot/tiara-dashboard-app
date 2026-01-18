// src/lib/api.staffs.ts
"use client";

import { apiFetch } from "./api";

export type StaffUser = {
  id: string;
  loginId: string | null;
  email: string | null;
  userType: "staff" | "admin";
  status: "active" | "suspended" | "preactive";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  mustChangePassword?: boolean;
};

export type CreateStaffInput = {
  loginId: string;
  email?: string;
  password?: string;
  userType?: "staff" | "admin";
  status?: "active" | "suspended" | "preactive";
  mustChangePassword?: boolean;
};

export type UpdateStaffInput = Partial<CreateStaffInput> & {
  email?: string | null;
};

export function listStaffs(): Promise<StaffUser[]> {
  return apiFetch<StaffUser[]>("/staffs");
}

export function createStaff(input: CreateStaffInput): Promise<StaffUser> {
  return apiFetch<StaffUser>("/staffs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStaff(
  id: string,
  input: UpdateStaffInput,
): Promise<StaffUser> {
  return apiFetch<StaffUser>(`/staffs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
