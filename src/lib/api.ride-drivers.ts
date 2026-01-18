// src/lib/api.ride-drivers.ts
"use client";

import { apiFetch } from "./api";

export type RideDriver = {
  id: string;
  name: string;
  address: string | null;
  birthdate: string | null;
  licenseNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RideDriverInput = {
  name: string;
  address?: string;
  birthdate?: string;
  licenseNumber?: string;
};

export type RideDriverUpdate = {
  name?: string;
  address?: string | null;
  birthdate?: string | null;
  licenseNumber?: string | null;
};

export function listRideDrivers(): Promise<RideDriver[]> {
  return apiFetch<RideDriver[]>("/ride-drivers");
}

export function createRideDriver(
  input: RideDriverInput,
): Promise<RideDriver> {
  return apiFetch<RideDriver>("/ride-drivers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRideDriver(
  id: string,
  input: RideDriverUpdate,
): Promise<RideDriver> {
  return apiFetch<RideDriver>(`/ride-drivers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
