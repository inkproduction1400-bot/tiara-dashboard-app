"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  type CreateStaffInput,
  type StaffUser,
  type UpdateStaffInput,
  createStaff,
  listStaffs,
  updateStaff,
} from "@/lib/api.staffs";
import {
  createRideDriver,
  listRideDrivers,
  type RideDriver,
  updateRideDriver,
} from "@/lib/api.ride-drivers";
import {
  createRideVehicle,
  listRideVehicles,
  type RideVehicle,
  updateRideVehicle,
} from "@/lib/api.ride-vehicles";

const defaultCreate: CreateStaffInput = {
  loginId: "",
  email: "",
  password: "",
  userType: "staff",
  status: "active",
  mustChangePassword: false,
};

const defaultVehicleCreate = {
  carNumber: "",
  carType: "",
  plateNumber: "",
  driverName: "",
};

const defaultDriverCreate = {
  name: "",
  address: "",
  birthdate: "",
  licenseNumber: "",
};

export default function Page() {
  const [activeTab, setActiveTab] = useState<
    "staff" | "vehicles" | "drivers"
  >("staff");
  const [items, setItems] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateStaffInput>(defaultCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateStaffInput>({});

  const [vehicleItems, setVehicleItems] = useState<RideVehicle[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehicleCreate, setVehicleCreate] = useState(
    defaultVehicleCreate,
  );
  const [vehicleEditingId, setVehicleEditingId] =
    useState<string | null>(null);
  const [vehicleEditForm, setVehicleEditForm] = useState({
    carNumber: "",
    carType: "",
    plateNumber: "",
    driverName: "",
  });

  const [driverItems, setDriverItems] = useState<RideDriver[]>([]);
  const [driverLoading, setDriverLoading] = useState(true);
  const [driverSaving, setDriverSaving] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [driverCreate, setDriverCreate] = useState(defaultDriverCreate);
  const [driverEditingId, setDriverEditingId] =
    useState<string | null>(null);
  const [driverEditForm, setDriverEditForm] = useState({
    name: "",
    address: "",
    birthdate: "",
    licenseNumber: "",
  });

  const editing = useMemo(
    () => items.find((i) => i.id === editingId) ?? null,
    [items, editingId],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listStaffs();
      setItems(list);
    } catch (e: any) {
      setError(e?.message ?? "スタッフ一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    setVehicleLoading(true);
    setVehicleError(null);
    try {
      const list = await listRideVehicles();
      setVehicleItems(list);
    } catch (e: any) {
      setVehicleError(e?.message ?? "送迎車一覧の取得に失敗しました");
    } finally {
      setVehicleLoading(false);
    }
  };

  const loadDrivers = async () => {
    setDriverLoading(true);
    setDriverError(null);
    try {
      const list = await listRideDrivers();
      setDriverItems(list);
    } catch (e: any) {
      setDriverError(e?.message ?? "運転手一覧の取得に失敗しました");
    } finally {
      setDriverLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeTab === "vehicles") void loadVehicles();
    if (activeTab === "drivers") void loadDrivers();
  }, [activeTab]);

  const handleCreate = async () => {
    if (!createForm.loginId?.trim()) {
      setError("スタッフ名（ログインID）を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createStaff({
        ...createForm,
        loginId: createForm.loginId.trim(),
        email: createForm.email?.trim() || undefined,
        password: createForm.password?.trim() || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setCreateForm(defaultCreate);
    } catch (e: any) {
      setError(e?.message ?? "スタッフ作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (u: StaffUser) => {
    setEditingId(u.id);
    setEditForm({
      loginId: u.loginId ?? "",
      email: u.email ?? "",
      userType: u.userType,
      status: u.status,
      mustChangePassword: u.mustChangePassword ?? false,
      password: "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (typeof editForm.loginId === "string" && !editForm.loginId.trim()) {
      setError("スタッフ名（ログインID）を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStaff(editingId, {
        ...editForm,
        loginId:
          typeof editForm.loginId === "string"
            ? editForm.loginId.trim()
            : undefined,
        email:
          typeof editForm.email === "string"
            ? editForm.email.trim() || null
            : undefined,
        password:
          typeof editForm.password === "string" && editForm.password.trim()
            ? editForm.password.trim()
            : undefined,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      cancelEdit();
    } catch (e: any) {
      setError(e?.message ?? "スタッフ更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleVehicleCreate = async () => {
    const rawNumber = vehicleCreate.carNumber.trim();
    const parsedNumber = Number(rawNumber);
    if (!rawNumber || Number.isNaN(parsedNumber)) {
      setVehicleError("車番（数字）を入力してください");
      return;
    }
    setVehicleSaving(true);
    setVehicleError(null);
    try {
      const created = await createRideVehicle({
        carNumber: parsedNumber,
        carType: vehicleCreate.carType.trim() || undefined,
        plateNumber: vehicleCreate.plateNumber.trim() || undefined,
        driverName: vehicleCreate.driverName.trim() || undefined,
      });
      setVehicleItems((prev) => [created, ...prev]);
      setVehicleCreate(defaultVehicleCreate);
    } catch (e: any) {
      setVehicleError(e?.message ?? "送迎車の登録に失敗しました");
    } finally {
      setVehicleSaving(false);
    }
  };

  const beginVehicleEdit = (v: RideVehicle) => {
    setVehicleEditingId(v.id);
    setVehicleEditForm({
      carNumber: String(v.carNumber ?? ""),
      carType: v.carType ?? "",
      plateNumber: v.plateNumber ?? "",
      driverName: v.driverName ?? "",
    });
  };

  const cancelVehicleEdit = () => {
    setVehicleEditingId(null);
    setVehicleEditForm({
      carNumber: "",
      carType: "",
      plateNumber: "",
      driverName: "",
    });
  };

  const handleVehicleUpdate = async () => {
    if (!vehicleEditingId) return;
    const rawNumber = vehicleEditForm.carNumber.trim();
    const parsedNumber = Number(rawNumber);
    if (!rawNumber || Number.isNaN(parsedNumber)) {
      setVehicleError("車番（数字）を入力してください");
      return;
    }
    setVehicleSaving(true);
    setVehicleError(null);
    try {
      const updated = await updateRideVehicle(vehicleEditingId, {
        carNumber: parsedNumber,
        carType: vehicleEditForm.carType.trim() || null,
        plateNumber: vehicleEditForm.plateNumber.trim() || null,
        driverName: vehicleEditForm.driverName.trim() || null,
      });
      setVehicleItems((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i)),
      );
      cancelVehicleEdit();
    } catch (e: any) {
      setVehicleError(e?.message ?? "送迎車の更新に失敗しました");
    } finally {
      setVehicleSaving(false);
    }
  };

  const handleDriverCreate = async () => {
    if (!driverCreate.name.trim()) {
      setDriverError("運転手名を入力してください");
      return;
    }
    setDriverSaving(true);
    setDriverError(null);
    try {
      const created = await createRideDriver({
        name: driverCreate.name.trim(),
        address: driverCreate.address.trim() || undefined,
        birthdate: driverCreate.birthdate.trim() || undefined,
        licenseNumber: driverCreate.licenseNumber.trim() || undefined,
      });
      setDriverItems((prev) => [created, ...prev]);
      setDriverCreate(defaultDriverCreate);
    } catch (e: any) {
      setDriverError(e?.message ?? "運転手の登録に失敗しました");
    } finally {
      setDriverSaving(false);
    }
  };

  const beginDriverEdit = (d: RideDriver) => {
    setDriverEditingId(d.id);
    setDriverEditForm({
      name: d.name ?? "",
      address: d.address ?? "",
      birthdate: d.birthdate ? d.birthdate.slice(0, 10) : "",
      licenseNumber: d.licenseNumber ?? "",
    });
  };

  const cancelDriverEdit = () => {
    setDriverEditingId(null);
    setDriverEditForm({
      name: "",
      address: "",
      birthdate: "",
      licenseNumber: "",
    });
  };

  const handleDriverUpdate = async () => {
    if (!driverEditingId) return;
    if (!driverEditForm.name.trim()) {
      setDriverError("運転手名を入力してください");
      return;
    }
    setDriverSaving(true);
    setDriverError(null);
    try {
      const updated = await updateRideDriver(driverEditingId, {
        name: driverEditForm.name.trim(),
        address: driverEditForm.address.trim() || null,
        birthdate: driverEditForm.birthdate.trim() || null,
        licenseNumber: driverEditForm.licenseNumber.trim() || null,
      });
      setDriverItems((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i)),
      );
      cancelDriverEdit();
    } catch (e: any) {
      setDriverError(e?.message ?? "運転手の更新に失敗しました");
    } finally {
      setDriverSaving(false);
    }
  };

  return (
    <AppShell>
      <section className="tiara-panel grow p-4 h-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div>
            <h2 className="text-lg font-bold">設定</h2>
            <p className="text-xs text-muted mt-1">
              スタッフ管理・送迎車管理・運転手管理の登録/変更を行います。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className={`px-3 h-8 rounded-full border ${
                activeTab === "staff"
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-ink border-gray-300"
              }`}
              onClick={() => setActiveTab("staff")}
            >
              スタッフ管理
            </button>
            <button
              type="button"
              className={`px-3 h-8 rounded-full border ${
                activeTab === "vehicles"
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-ink border-gray-300"
              }`}
              onClick={() => setActiveTab("vehicles")}
            >
              送迎車管理
            </button>
            <button
              type="button"
              className={`px-3 h-8 rounded-full border ${
                activeTab === "drivers"
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-ink border-gray-300"
              }`}
              onClick={() => setActiveTab("drivers")}
            >
              運転手管理
            </button>
          </div>
        </header>

        {activeTab === "staff" && (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">新規スタッフ登録</h3>
              <p className="text-[11px] text-muted mt-1">
                パスワード未入力時は{" "}
                <span className="font-semibold">admin123</span> が設定されます。
              </p>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">スタッフ名（ログインID）</span>
              <input
                className="tiara-input h-9"
                value={createForm.loginId}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    loginId: e.target.value,
                  }))
                }
                placeholder="例）北村"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">メールアドレス（任意）</span>
              <input
                className="tiara-input h-9"
                value={createForm.email ?? ""}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="admin@example.com"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">権限</span>
              <select
                className="tiara-input h-9"
                value={createForm.userType ?? "staff"}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    userType: e.target.value as "staff" | "admin",
                  }))
                }
              >
                <option value="staff">スタッフ</option>
                <option value="admin">管理</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">状態</span>
              <select
                className="tiara-input h-9"
                value={createForm.status ?? "active"}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    status: e.target.value as
                      | "active"
                      | "suspended"
                      | "preactive",
                  }))
                }
              >
                <option value="active">有効</option>
                <option value="suspended">停止</option>
                <option value="preactive">仮登録</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">初期パスワード（任意）</span>
              <input
                className="tiara-input h-9"
                type="password"
                value={createForm.password ?? ""}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                placeholder="admin123"
              />
            </label>

            <label className="flex items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={createForm.mustChangePassword ?? false}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    mustChangePassword: e.target.checked,
                  }))
                }
              />
              初回ログイン時にパスワード変更を要求する
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="tiara-btn h-9 px-4 text-xs"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? "保存中..." : "登録"}
            </button>
          </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">登録スタッフ一覧</h3>

              {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
              {loading ? (
                <p className="mt-3 text-xs text-muted">読み込み中...</p>
              ) : (
                <div className="mt-3 overflow-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-[180px]">
                          スタッフ名
                        </th>
                        <th className="px-3 py-2 text-left">メール</th>
                        <th className="px-3 py-2 text-center w-[90px]">
                          権限
                        </th>
                        <th className="px-3 py-2 text-center w-[90px]">状態</th>
                        <th className="px-3 py-2 text-center w-[140px]">
                          最終ログイン
                        </th>
                        <th className="px-3 py-2 text-center w-[120px]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-4 text-center text-[11px] text-muted"
                          >
                            登録スタッフがありません。
                          </td>
                        </tr>
                      ) : (
                        items.map((u) => (
                          <tr
                            key={u.id}
                            className="border-t border-gray-200"
                          >
                            <td className="px-3 py-2">
                              {u.loginId ?? "-"}
                            </td>
                            <td className="px-3 py-2">{u.email ?? "-"}</td>
                            <td className="px-3 py-2 text-center">
                              {u.userType === "admin" ? "管理" : "スタッフ"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {u.status === "active"
                                ? "有効"
                                : u.status === "suspended"
                                  ? "停止"
                                  : "仮登録"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {u.lastLoginAt
                                ? new Date(u.lastLoginAt).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="tiara-btn h-8 px-3 text-[11px]"
                                onClick={() => beginEdit(u)}
                              >
                                編集
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {editing && (
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold">スタッフ情報の編集</h3>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">
                      スタッフ名（ログインID）
                    </span>
                    <input
                      className="tiara-input h-9"
                      value={(editForm.loginId as string) ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          loginId: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">
                      メールアドレス（任意）
                    </span>
                    <input
                      className="tiara-input h-9"
                      value={(editForm.email as string) ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">権限</span>
                    <select
                      className="tiara-input h-9"
                      value={(editForm.userType as string) ?? "staff"}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          userType: e.target.value as "staff" | "admin",
                        }))
                      }
                    >
                      <option value="staff">スタッフ</option>
                      <option value="admin">管理</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">状態</span>
                    <select
                      className="tiara-input h-9"
                      value={(editForm.status as string) ?? "active"}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          status: e.target.value as
                            | "active"
                            | "suspended"
                            | "preactive",
                        }))
                      }
                    >
                      <option value="active">有効</option>
                      <option value="suspended">停止</option>
                      <option value="preactive">仮登録</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">
                      新しいパスワード（任意）
                    </span>
                    <input
                      className="tiara-input h-9"
                      type="password"
                      value={(editForm.password as string) ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="変更時のみ入力"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={editForm.mustChangePassword ?? false}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          mustChangePassword: e.target.checked,
                        }))
                      }
                    />
                    初回ログイン時にパスワード変更を要求する
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white text-gray-700 px-3 h-9 text-xs"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="tiara-btn h-9 px-4 text-xs"
                    onClick={handleUpdate}
                    disabled={saving}
                  >
                    {saving ? "保存中..." : "更新"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "vehicles" && (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">送迎車の登録</h3>
              <p className="text-[11px] text-muted mt-1">
                送迎管理ページの車番ドロップダウンに表示される情報を登録します。
              </p>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">車番（数字）</span>
                  <input
                    className="tiara-input h-9"
                    value={vehicleCreate.carNumber}
                    onChange={(e) =>
                      setVehicleCreate((prev) => ({
                        ...prev,
                        carNumber: e.target.value,
                      }))
                    }
                    placeholder="例）1"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">車種</span>
                  <input
                    className="tiara-input h-9"
                    value={vehicleCreate.carType}
                    onChange={(e) =>
                      setVehicleCreate((prev) => ({
                        ...prev,
                        carType: e.target.value,
                      }))
                    }
                    placeholder="例）ワゴン"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">ナンバー</span>
                  <input
                    className="tiara-input h-9"
                    value={vehicleCreate.plateNumber}
                    onChange={(e) =>
                      setVehicleCreate((prev) => ({
                        ...prev,
                        plateNumber: e.target.value,
                      }))
                    }
                    placeholder="例）品川 300 あ 12-34"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">運転手名</span>
                  <input
                    className="tiara-input h-9"
                    value={vehicleCreate.driverName}
                    onChange={(e) =>
                      setVehicleCreate((prev) => ({
                        ...prev,
                        driverName: e.target.value,
                      }))
                    }
                    placeholder="例）山田太郎"
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="tiara-btn h-9 px-4 text-xs"
                  onClick={handleVehicleCreate}
                  disabled={vehicleSaving}
                >
                  {vehicleSaving ? "保存中..." : "登録"}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">登録済み送迎車</h3>
              {vehicleError && (
                <p className="mt-2 text-xs text-rose-500">{vehicleError}</p>
              )}
              {vehicleLoading ? (
                <p className="mt-3 text-xs text-muted">読み込み中...</p>
              ) : (
                <div className="mt-3 overflow-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-[80px]">車番</th>
                        <th className="px-3 py-2 text-left">車種</th>
                        <th className="px-3 py-2 text-left">ナンバー</th>
                        <th className="px-3 py-2 text-left">運転手名</th>
                        <th className="px-3 py-2 text-center w-[120px]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-4 text-center text-[11px] text-muted"
                          >
                            登録済みの送迎車がありません。
                          </td>
                        </tr>
                      ) : (
                        vehicleItems.map((v) => (
                          <tr
                            key={v.id}
                            className="border-t border-gray-200"
                          >
                            <td className="px-3 py-2">{v.carNumber}</td>
                            <td className="px-3 py-2">{v.carType ?? "-"}</td>
                            <td className="px-3 py-2">
                              {v.plateNumber ?? "-"}
                            </td>
                            <td className="px-3 py-2">
                              {v.driverName ?? "-"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="tiara-btn h-8 px-3 text-[11px]"
                                onClick={() => beginVehicleEdit(v)}
                              >
                                編集
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {vehicleEditingId && (
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold">送迎車情報の編集</h3>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">車番（数字）</span>
                    <input
                      className="tiara-input h-9"
                      value={vehicleEditForm.carNumber}
                      onChange={(e) =>
                        setVehicleEditForm((prev) => ({
                          ...prev,
                          carNumber: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">車種</span>
                    <input
                      className="tiara-input h-9"
                      value={vehicleEditForm.carType}
                      onChange={(e) =>
                        setVehicleEditForm((prev) => ({
                          ...prev,
                          carType: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">ナンバー</span>
                    <input
                      className="tiara-input h-9"
                      value={vehicleEditForm.plateNumber}
                      onChange={(e) =>
                        setVehicleEditForm((prev) => ({
                          ...prev,
                          plateNumber: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">運転手名</span>
                    <input
                      className="tiara-input h-9"
                      value={vehicleEditForm.driverName}
                      onChange={(e) =>
                        setVehicleEditForm((prev) => ({
                          ...prev,
                          driverName: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white text-gray-700 px-3 h-9 text-xs"
                    onClick={cancelVehicleEdit}
                    disabled={vehicleSaving}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="tiara-btn h-9 px-4 text-xs"
                    onClick={handleVehicleUpdate}
                    disabled={vehicleSaving}
                  >
                    {vehicleSaving ? "保存中..." : "更新"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "drivers" && (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">運転手登録</h3>
              <p className="text-[11px] text-muted mt-1">
                送迎管理ページの運転手名ドロップダウンに表示される情報を登録します。
              </p>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">氏名</span>
                  <input
                    className="tiara-input h-9"
                    value={driverCreate.name}
                    onChange={(e) =>
                      setDriverCreate((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="例）山田太郎"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">住所</span>
                  <input
                    className="tiara-input h-9"
                    value={driverCreate.address}
                    onChange={(e) =>
                      setDriverCreate((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    placeholder="例）東京都渋谷区..."
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">生年月日</span>
                  <input
                    className="tiara-input h-9"
                    type="date"
                    value={driverCreate.birthdate}
                    onChange={(e) =>
                      setDriverCreate((prev) => ({
                        ...prev,
                        birthdate: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">運転免許証番号</span>
                  <input
                    className="tiara-input h-9"
                    value={driverCreate.licenseNumber}
                    onChange={(e) =>
                      setDriverCreate((prev) => ({
                        ...prev,
                        licenseNumber: e.target.value,
                      }))
                    }
                    placeholder="例）123456789012"
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="tiara-btn h-9 px-4 text-xs"
                  onClick={handleDriverCreate}
                  disabled={driverSaving}
                >
                  {driverSaving ? "保存中..." : "登録"}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold">登録済み運転手</h3>
              {driverError && (
                <p className="mt-2 text-xs text-rose-500">{driverError}</p>
              )}
              {driverLoading ? (
                <p className="mt-3 text-xs text-muted">読み込み中...</p>
              ) : (
                <div className="mt-3 overflow-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-[160px]">
                          氏名
                        </th>
                        <th className="px-3 py-2 text-left">住所</th>
                        <th className="px-3 py-2 text-left w-[140px]">
                          生年月日
                        </th>
                        <th className="px-3 py-2 text-left w-[180px]">
                          免許証番号
                        </th>
                        <th className="px-3 py-2 text-center w-[120px]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-4 text-center text-[11px] text-muted"
                          >
                            登録済みの運転手がありません。
                          </td>
                        </tr>
                      ) : (
                        driverItems.map((d) => (
                          <tr
                            key={d.id}
                            className="border-t border-gray-200"
                          >
                            <td className="px-3 py-2">{d.name}</td>
                            <td className="px-3 py-2">
                              {d.address ?? "-"}
                            </td>
                            <td className="px-3 py-2">
                              {d.birthdate
                                ? d.birthdate.slice(0, 10)
                                : "-"}
                            </td>
                            <td className="px-3 py-2">
                              {d.licenseNumber ?? "-"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="tiara-btn h-8 px-3 text-[11px]"
                                onClick={() => beginDriverEdit(d)}
                              >
                                編集
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {driverEditingId && (
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold">運転手情報の編集</h3>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">氏名</span>
                    <input
                      className="tiara-input h-9"
                      value={driverEditForm.name}
                      onChange={(e) =>
                        setDriverEditForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">住所</span>
                    <input
                      className="tiara-input h-9"
                      value={driverEditForm.address}
                      onChange={(e) =>
                        setDriverEditForm((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">生年月日</span>
                    <input
                      className="tiara-input h-9"
                      type="date"
                      value={driverEditForm.birthdate}
                      onChange={(e) =>
                        setDriverEditForm((prev) => ({
                          ...prev,
                          birthdate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">運転免許証番号</span>
                    <input
                      className="tiara-input h-9"
                      value={driverEditForm.licenseNumber}
                      onChange={(e) =>
                        setDriverEditForm((prev) => ({
                          ...prev,
                          licenseNumber: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white text-gray-700 px-3 h-9 text-xs"
                    onClick={cancelDriverEdit}
                    disabled={driverSaving}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="tiara-btn h-9 px-4 text-xs"
                    onClick={handleDriverUpdate}
                    disabled={driverSaving}
                  >
                    {driverSaving ? "保存中..." : "更新"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
