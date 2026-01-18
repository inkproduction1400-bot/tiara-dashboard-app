// src/lib/api.ride-vehicles.ts
"use client";

import { apiFetch } from "./api";

export type RideVehicle = {
  id: string;
  carNumber: number;
  carType: string | null;
  plateNumber: string | null;
  driverName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RideVehicleInput = {
  carNumber: number;
  carType?: string;
  plateNumber?: string;
  driverName?: string;
};

export type RideVehicleUpdate = {
  carNumber?: number;
  carType?: string | null;
  plateNumber?: string | null;
  driverName?: string | null;
};

export function listRideVehicles(): Promise<RideVehicle[]> {
  return apiFetch<RideVehicle[]>("/ride-vehicles");
}

export function createRideVehicle(
  input: RideVehicleInput,
): Promise<RideVehicle> {
  return apiFetch<RideVehicle>("/ride-vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRideVehicle(
  id: string,
  input: RideVehicleUpdate,
): Promise<RideVehicle> {
  return apiFetch<RideVehicle>(`/ride-vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
