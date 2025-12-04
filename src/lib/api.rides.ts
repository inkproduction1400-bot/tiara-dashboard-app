import { RideListItem } from "./types.rides";

const API = process.env.NEXT_PUBLIC_API_URL;

export async function listRides(params?: { date?: string }) {
  const qs = new URLSearchParams();

  if (params?.date) qs.set("date", params.date);

  const res = await fetch(`${API}/rides?${qs.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch rides");
  return res.json() as Promise<RideListItem[]>;
}

export async function updateRide(id: string, data: any) {
  const res = await fetch(`${API}/rides/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update ride");
  return res.json();
}
