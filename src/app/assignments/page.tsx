// src/app/assignments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  type ShopAssignment,
  loadAssignments,
  saveAssignments,
  createEmptyAssignment,
  subscribeAssignments,
} from "@/store/assignmentsStore";
import { listShopOrders } from "@/lib/api.shop-orders";
import {
  type ScheduleShopRequest,
  loadScheduleShopRequests,
} from "@/lib/schedule.store";

// 今日/明日 用の日付キー（YYYY-MM-DD）
const dateKey = (offset: number = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const todayKey = () => dateKey(0);
const tomorrowKey = () => dateKey(1);

const resolveAssignmentsDateKey = (
  filter: "all" | "today" | "tomorrow",
): string | undefined => {
  if (filter === "today") return todayKey();
  if (filter === "tomorrow") return tomorrowKey();
  return undefined;
};

const formatDateLabel = (date: string) => {
  if (date === todayKey()) return "本日";
  if (date === tomorrowKey()) return "明日";
  return date;
};

const formatDateYmdJa = (date: string) => {
  // YYYY-MM-DD → YYYY/MM/DD 表示用
  if (!date) return "";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${y}/${m}/${d}`;
};

const resolveShopKey = (shop: ScheduleShopRequest) => shop.shopId ?? shop.id;

type OrderCandidate = {
  id: string;
  orderNo: number;
  startTime?: string | null;
};

type AssignmentGroup = {
  orderId?: string;
  orderNo?: number;
  orderStartTime?: string;
  assignments: ShopAssignment[];
};

const formatOrderLabel = (group?: AssignmentGroup) => {
  if (!group) return "-";
  const time = group.orderStartTime ?? "";
  if (group.orderNo) {
    return time ? `No.${group.orderNo} / ${time}` : `No.${group.orderNo}`;
  }
  return time || "-";
};

const resolveTargetOrdersForShop = async (
  shopId: string,
  date?: string,
): Promise<OrderCandidate[]> => {
  if (!date) return [];
  try {
    const orders = await listShopOrders(date);
    const matches = orders.filter(
      (order) => order?.shopId === shopId || order?.shop?.id === shopId,
    );
    if (matches.length === 0) return [];
    const sorted = [...matches].sort((a, b) => {
      const an = Number(a?.orderNo ?? a?.order_no ?? 0);
      const bn = Number(b?.orderNo ?? b?.order_no ?? 0);
      return an - bn;
    });
    return sorted.map((order) => ({
      id: order.id,
      orderNo: Number(order?.orderNo ?? order?.order_no ?? 0),
      startTime: order?.startTime ?? order?.start_time ?? null,
    }));
  } catch {
    return [];
  }
};

// 新規リクエストのひな形（スケジュール共通ストア用）
const createEmptyScheduleRequest = (date: string): ScheduleShopRequest => ({
  id: `shop_${Date.now()}`,
  date,
  code: "",
  name: "",
  requestedHeadcount: 0,
  minHourly: undefined,
  maxHourly: undefined,
  minAge: undefined,
  maxAge: undefined,
  requireDrinkOk: false,
  note: "",
});

export default function Page() {
  // スケジュール（本日＋明日分）は API からロード
  const [items, setItems] = useState<ScheduleShopRequest[]>([]);
  // 割当キャストは従来どおりローカルストア
  const [assignments, setAssignments] = useState<ShopAssignment[]>(() =>
    loadAssignments(resolveAssignmentsDateKey("all")),
  );

  const [keyword, setKeyword] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow">(
    "all",
  );
  useEffect(() => {
    console.warn("[assignments] dateFilter init", {
      dateFilter,
      resolved: resolveAssignmentsDateKey(dateFilter),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 店舗編集モーダル用
  const [editing, setEditing] = useState<ScheduleShopRequest | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);

  // 店舗編集モーダル内：割当編集フォーム用
  const [assignmentDraft, setAssignmentDraft] =
    useState<ShopAssignment | null>(null);
  const [assignmentDraftIsNew, setAssignmentDraftIsNew] = useState(false);
  const [orderCandidates, setOrderCandidates] = useState<OrderCandidate[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderSelectOpen, setOrderSelectOpen] = useState(false);
  const editingRef = useRef<ScheduleShopRequest | null>(null);
  const assignmentDraftRef = useRef<ShopAssignment | null>(null);
  const dateFilterRef = useRef<"all" | "today" | "tomorrow">("all");

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  const handlePrint = () => {
    window.print();
  };

  // 初期ロード: 本日 + 明日の店舗リクエストを取得
  const fetchSchedule = useCallback(async () => {
    try {
      const today = todayKey();
      const tomorrow = tomorrowKey();
      const [todayList, tomorrowList] = await Promise.all([
        loadScheduleShopRequests(today),
        loadScheduleShopRequests(tomorrow),
      ]);
      setItems([...todayList, ...tomorrowList]);
    } catch (err) {
      console.error(
        "failed to load schedule shop requests for assignments page",
        err,
      );
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  useEffect(() => {
    const onFocus = () => {
      if (items.length === 0) void fetchSchedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && items.length === 0) {
        void fetchSchedule();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items.length, fetchSchedule]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    assignmentDraftRef.current = assignmentDraft;
  }, [assignmentDraft]);

  useEffect(() => {
    dateFilterRef.current = dateFilter;
    console.warn("[assignments] dateFilter change", {
      dateFilter,
      resolved: resolveAssignmentsDateKey(dateFilter),
    });
    if (editingRef.current || assignmentDraftRef.current) return;
    const key = resolveAssignmentsDateKey(dateFilter);
    setAssignments(loadAssignments(key));
  }, [dateFilter]);

  useEffect(() => {
    const unsubscribe = subscribeAssignments(() => {
      if (editingRef.current || assignmentDraftRef.current) return;
      const key = resolveAssignmentsDateKey(dateFilterRef.current);
      setAssignments(loadAssignments(key));
    });
    return unsubscribe;
  }, []);

  // 店舗ごとの割当リスト（一覧表示用）
  const assignmentsByShop = useMemo(() => {
    const map: Record<string, ShopAssignment[]> = {};
    for (const a of assignments) {
      if (!map[a.shopId]) map[a.shopId] = [];
      map[a.shopId].push(a);
    }
    return map;
  }, [assignments]);

  const groupAssignmentsByOrder = useCallback(
    (shop: ScheduleShopRequest): AssignmentGroup[] => {
      const shopKey = resolveShopKey(shop);
      const list = assignmentsByShop[shopKey] ?? [];
      if (list.length === 0) return [];
      const map: Record<string, AssignmentGroup> = {};
      for (const a of list) {
        const key = a.orderId ?? a.orderStartTime ?? "default";
        const current = map[key] ?? {
          orderId: a.orderId,
          orderNo: a.orderNo,
          orderStartTime: a.orderStartTime,
          assignments: [],
        };
        current.assignments.push(a);
        map[key] = current;
      }
      return Object.values(map).sort((a, b) => {
        const an = a.orderNo ?? 0;
        const bn = b.orderNo ?? 0;
        if (an !== bn) return an - bn;
        const at = a.orderStartTime ?? "";
        const bt = b.orderStartTime ?? "";
        return at.localeCompare(bt);
      });
    },
    [assignmentsByShop],
  );

  const filteredItems = useMemo(() => {
    let list = [...items];

    if (dateFilter === "today") {
      const t = todayKey();
      list = list.filter((i) => i.date === t);
    } else if (dateFilter === "tomorrow") {
      const tm = tomorrowKey();
      list = list.filter((i) => i.date === tm);
    }

    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter(
        (i) =>
          i.name.includes(q) ||
          i.code.includes(q) ||
          i.note?.includes(q),
      );
    }

    // 仮でコード昇順
    list.sort((a, b) => a.code.localeCompare(b.code));

    return list;
  }, [items, keyword, dateFilter]);

  const rows = useMemo(() => {
    const result: { shop: ScheduleShopRequest; group: AssignmentGroup }[] = [];
    for (const shop of filteredItems) {
      const groups = groupAssignmentsByOrder(shop);
      if (!groups.length) {
        result.push({ shop, group: { assignments: [] } });
        continue;
      }
      for (const group of groups) {
        result.push({ shop, group });
      }
    }
    return result;
  }, [filteredItems, groupAssignmentsByOrder]);

  // 集計（資料っぽいヘッダー用：件数・希望人数合計・割当人数合計）
  const summary = useMemo(() => {
    const totalShops = filteredItems.length;
    let totalRequestedHeadcount = 0;
    let totalAssigned = 0;

    for (const shop of filteredItems) {
      totalRequestedHeadcount += shop.requestedHeadcount ?? 0;
      totalAssigned += assignmentsByShop[resolveShopKey(shop)]?.length ?? 0;
    }

    return {
      totalShops,
      totalRequestedHeadcount,
      totalAssigned,
    };
  }, [filteredItems, assignmentsByShop]);

  // 編集中店舗に紐づく割当（モーダル内表示用）
  const currentEditingAssignments = useMemo(() => {
    if (!editing) return [];
    const shopKey = resolveShopKey(editing);
    return assignments.filter((a) => a.shopId === shopKey);
  }, [assignments, editing]);

  const openEdit = (shop: ScheduleShopRequest) => {
    setEditing(shop);
    setEditingIsNew(false);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
  };

  const openNew = () => {
    const next = createEmptyScheduleRequest(todayKey());
    setEditing(next);
    setEditingIsNew(true);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditingIsNew(false);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
  };

  const saveEdit = () => {
    if (!editing) return;

    // いまはローカル state のみ更新（API 連携は後続タスク）
    setItems((prev) => {
      const exists = prev.some((i) => i.id === editing.id);
      const next = exists
        ? prev.map((i) => (i.id === editing.id ? editing : i))
        : [...prev, editing];
      return next;
    });

    closeEdit();
  };

  const deleteItem = (shop: ScheduleShopRequest) => {
    if (
      !window.confirm(
        `店舗番号 ${shop.code} / ${shop.name} のリクエストを削除しますか？\n（この店舗の割当キャストも併せて削除されます）`,
      )
    ) {
      return;
    }

    const shopKey = resolveShopKey(shop);

    // スケジュール行を削除（ローカル state のみ）
    setItems((prev) => prev.filter((i) => i.id !== shop.id));

    // この店舗に紐づく割当キャストも削除（ローカルストア永続）
    setAssignments((prev) => {
      const next = prev.filter((a) => a.shopId !== shopKey);
      saveAssignments(next, resolveAssignmentsDateKey(dateFilter));
      return next;
    });

    // 編集中だったものを削除した場合はモーダルも閉じる
    if (editing && editing.id === shop.id) {
      closeEdit();
    }
  };

  // ===== 割当キャスト 編集系（モーダル内） =====
  const beginNewAssignment = async () => {
    if (!editing) return;
    const shopKey = resolveShopKey(editing);
    const draft = createEmptyAssignment(shopKey);
    if (editing.date) {
      const candidates = await resolveTargetOrdersForShop(
        shopKey,
        editing.date,
      );
      if (candidates.length === 1) {
        draft.id = `${candidates[0].id}-${Date.now()}`;
        draft.orderId = candidates[0].id;
        draft.orderNo = candidates[0].orderNo || undefined;
        draft.orderStartTime = candidates[0].startTime ?? undefined;
        setOrderCandidates([]);
        setSelectedOrderId(null);
        setOrderSelectOpen(false);
      } else if (candidates.length > 1) {
        setOrderCandidates(candidates);
        setSelectedOrderId(null);
        setOrderSelectOpen(true);
      } else {
        setOrderCandidates([]);
        setSelectedOrderId(null);
        setOrderSelectOpen(false);
      }
    } else {
      setOrderCandidates([]);
      setSelectedOrderId(null);
      setOrderSelectOpen(false);
    }
    setAssignmentDraft(draft);
    setAssignmentDraftIsNew(true);
  };

  const beginEditAssignment = (a: ShopAssignment) => {
    setAssignmentDraft({ ...a });
    setAssignmentDraftIsNew(false);
    setOrderCandidates([]);
    setSelectedOrderId(null);
    setOrderSelectOpen(false);
  };

  const cancelAssignmentDraft = () => {
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
    setOrderCandidates([]);
    setSelectedOrderId(null);
    setOrderSelectOpen(false);
  };

  const saveAssignmentDraft = () => {
    if (orderSelectOpen) {
      return;
    }
    if (!assignmentDraft) return;

    setAssignments((prev) => {
      const exists = prev.some((a) => a.id === assignmentDraft.id);
      const next = exists
        ? prev.map((a) => (a.id === assignmentDraft.id ? assignmentDraft : a))
        : [...prev, assignmentDraft];
      saveAssignments(next, resolveAssignmentsDateKey(dateFilter));
      return next;
    });

    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
  };

  const deleteAssignment = (a: ShopAssignment) => {
    if (
      !window.confirm(
        `この店舗からキャスト ${a.castCode} / ${a.castName} の割当を削除しますか？`,
      )
    ) {
      return;
    }

    setAssignments((prev) => {
      const next = prev.filter((x) => x.id !== a.id);
      saveAssignments(next, resolveAssignmentsDateKey(dateFilter));
      return next;
    });

    if (assignmentDraft && assignmentDraft.id === a.id) {
      cancelAssignmentDraft();
    }
  };

  const formatAssignedNames = (list: ShopAssignment[]) => {
    if (list.length === 0) return "—";
    const names = list.map((a) => a.castName);
    if (names.length <= 3) return names.join(" / ");
    return `${names.slice(0, 3).join(" / ")} ほか${names.length - 3}名`;
  };

  // ヘッダー右側に表示する基準日（フィルタと連動というより、「本日」の日付をメイン表示）
  const todayLabel = formatDateYmdJa(todayKey());

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-3">
        {/* ヘッダー */}
        <section className="tiara-panel p-3 flex flex-col gap-2">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="text-sm font-semibold text-gray-900">
                割当確認リスト / 店舗リクエスト一覧
              </h1>
              <p className="text-[11px] text-muted">
                本日・明日の店舗リクエストに対して、割当済みキャストを一覧で確認・管理する画面です。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end mr-2">
                <span className="text-[10px] text-muted">対象日</span>
                <span className="text-[11px] font-medium text-gray-900">
                  本日 {todayLabel}
                </span>
              </div>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-[11px] hover:bg-gray-50"
                onClick={handlePrint}
              >
                印刷（割当リスト）
              </button>
              <button
                type="button"
                className="tiara-btn text-[11px] px-3 py-1.5"
                onClick={openNew}
              >
                ＋ 新規店舗リクエスト
              </button>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300 text-gray-600">
                build: {buildStamp}
              </span>
            </div>
          </header>

          {/* 集計バー（資料っぽい帯） */}
          <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
              <span className="text-muted whitespace-nowrap">対象店舗数</span>
              <span className="text-base font-semibold text-sky-900">
                {summary.totalShops}
              </span>
              <span className="text-[10px] text-sky-900/80">件</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-muted whitespace-nowrap">希望人数合計</span>
              <span className="text-base font-semibold text-emerald-900">
                {summary.totalRequestedHeadcount}
              </span>
              <span className="text-[10px] text-emerald-900/80">名</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
              <span className="text-muted whitespace-nowrap">
                割当済みキャスト合計
              </span>
              <span className="text-base font-semibold text-indigo-900">
                {summary.totalAssigned}
              </span>
              <span className="text-[10px] text-indigo-900/80">名</span>
            </div>
          </div>

          {/* フィルタ */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">日付</span>
              <div className="inline-flex rounded-full bg-white border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 text-[11px] ${
                    dateFilter === "all"
                      ? "bg-sky-600 text-white"
                      : "bg-transparent text-gray-700"
                  }`}
                  onClick={() => setDateFilter("all")}
                >
                  すべて
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-[11px] ${
                    dateFilter === "today"
                      ? "bg-sky-600 text-white"
                      : "bg-transparent text-gray-700"
                  }`}
                  onClick={() => setDateFilter("today")}
                >
                  本日
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-[11px] ${
                    dateFilter === "tomorrow"
                      ? "bg-sky-600 text-white"
                      : "bg-transparent text-gray-700"
                  }`}
                  onClick={() => setDateFilter("tomorrow")}
                >
                  明日
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">キーワード</span>
              <input
                className="tiara-input h-8 w-[260px] text-xs"
                placeholder="店舗番号・店舗名・メモで検索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* メイン：店舗リクエスト＋割当済みキャスト名 */}
        <section className="tiara-panel flex-1 p-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 text-[11px] text-muted">
            <span>
              表示中の店舗：
              <span className="font-semibold text-gray-900">
                {filteredItems.length}
              </span>{" "}
              件（希望人数合計{" "}
              <span className="font-semibold text-gray-900">
                {summary.totalRequestedHeadcount}
              </span>
              名 / 割当済み{" "}
              <span className="font-semibold text-gray-900">
                {summary.totalAssigned}
              </span>
              名）
            </span>
            <span>
              ※ 行の「割当キャスト」列で、現在の割当状況を一覧で確認できます。
            </span>
          </div>

          <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] text-gray-500 sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left w-[80px]">店舗番号</th>
                  <th className="px-3 py-2 text-left">店舗名</th>
                  <th className="px-3 py-2 text-left w-[100px]">日付</th>
                  <th className="px-3 py-2 text-right w-[80px]">希望人数</th>
                  <th className="px-3 py-2 text-left w-[120px]">
                    オーダー時間
                  </th>
                  <th className="px-3 py-2 text-right w-[120px]">
                    時給レンジ
                  </th>
                  <th className="px-3 py-2 text-right w-[120px]">
                    年齢レンジ
                  </th>
                  <th className="px-3 py-2 text-center w-[80px]">飲酒条件</th>
                  <th className="px-3 py-2 text-left w-[200px]">
                    割当キャスト
                  </th>
                  <th className="px-3 py-2 text-left">メモ</th>
                  <th className="px-3 py-2 text-center w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-4 text-center text-[11px] text-muted"
                      colSpan={11}
                    >
                      条件に一致する店舗リクエストがありません。
                    </td>
                  </tr>
                ) : (
                  rows.map(({ shop, group }) => {
                    const assignedList = group.assignments ?? [];
                    const assignedNames = formatAssignedNames(assignedList);
                    const assignedCount = assignedList.length;
                    const orderLabel = formatOrderLabel(group);

                    return (
                      <tr
                        key={`${shop.id}-${group?.orderId ?? group?.orderStartTime ?? "default"}`}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 font-mono">{shop.code}</td>
                        <td className="px-3 py-2">{shop.name}</td>
                        <td className="px-3 py-2">
                          {formatDateLabel(shop.date)}{" "}
                          <span className="text-[10px] text-muted">
                            ({formatDateYmdJa(shop.date)})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {shop.requestedHeadcount} 名
                        </td>
                        <td className="px-3 py-2">{orderLabel}</td>
                        <td className="px-3 py-2 text-right">
                          {shop.minHourly
                            ? `¥${shop.minHourly.toLocaleString()}`
                            : "-"}
                          {" 〜 "}
                          {shop.maxHourly
                            ? `¥${shop.maxHourly.toLocaleString()}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {shop.minAge ?? "-"}{" 〜 "}
                          {shop.maxAge ?? "-"} 歳
                        </td>
                        <td className="px-3 py-2 text-center">
                          {shop.requireDrinkOk ? "飲酒OK必須" : "不問"}
                        </td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="line-clamp-2 text-[11px] text-gray-800">
                              {assignedNames}
                            </span>
                            <span className="text-[10px] text-muted">
                              割当済み:{" "}
                              <span className="font-semibold">
                                {assignedCount}
                              </span>{" "}
                              名
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <span className="line-clamp-2 text-[11px] text-gray-700">
                            {shop.note || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="tiara-btn text-[11px] px-3 py-1"
                              onClick={() => openEdit(shop)}
                            >
                              詳細・編集
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-red-500 bg-white text-red-600 px-3 py-1 text-[11px] hover:bg-red-50"
                              onClick={() => deleteItem(shop)}
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 編集 / 新規追加モーダル（リクエスト＋割当キャスト） */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeEdit}
          />
          {/* モーダル本体 */}
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {editingIsNew
                    ? "新規店舗リクエストを追加"
                    : `店舗リクエスト / 割当キャストを編集`}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  上段で「店舗リクエスト条件」、下段で「この店舗への割当キャスト」を編集します。
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-gray-900"
                onClick={closeEdit}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 space-y-5 text-xs text-gray-900 bg-white">
              {/* 店舗情報・条件 */}
              <div className="space-y-4">
                {/* 店舗情報 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      店舗番号
                    </label>
                    <input
                      className="tiara-input h-8 w-full text-xs"
                      placeholder="例）001"
                      value={editing.code}
                      onChange={(e) =>
                        setEditing({ ...editing, code: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-muted mb-1">
                      店舗名
                    </label>
                    <input
                      className="tiara-input h-8 w-full text-xs"
                      placeholder="例）クラブ ティアラ本店"
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* 日付・人数・飲酒 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      日付
                    </label>
                    <select
                      className="tiara-input h-8 w-full text-xs"
                      value={editing.date}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          date: e.target.value,
                        })
                      }
                    >
                      <option value={todayKey()}>本日</option>
                      <option value={tomorrowKey()}>明日</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望人数
                    </label>
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      min={0}
                      value={editing.requestedHeadcount}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          requestedHeadcount: Number(e.target.value || 0),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      飲酒条件
                    </label>
                    <select
                      className="tiara-input h-8 w-full text-xs"
                      value={editing.requireDrinkOk ? "require" : "any"}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          requireDrinkOk: e.target.value === "require",
                        })
                      }
                    >
                      <option value="any">不問（飲酒NGも可）</option>
                      <option value="require">飲酒OK必須</option>
                    </select>
                  </div>
                </div>

                {/* 時給レンジ・年齢レンジ */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望時給レンジ（円）
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="tiara-input h-8 w-full text-xs text-right"
                        placeholder="min"
                        value={editing.minHourly ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            minHourly: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                      <span className="text-muted">〜</span>
                      <input
                        type="number"
                        className="tiara-input h-8 w-full text-xs text-right"
                        placeholder="max"
                        value={editing.maxHourly ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            maxHourly: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望年齢レンジ（歳）
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="tiara-input h-8 w-full text-xs text-right"
                        placeholder="min"
                        value={editing.minAge ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            minAge: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                      <span className="text-muted">〜</span>
                      <input
                        type="number"
                        className="tiara-input h-8 w-full text-xs text-right"
                        placeholder="max"
                        value={editing.maxAge ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            maxAge: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* NG情報など将来用のメモ */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    備考メモ（NG情報・客層など）
                  </label>
                  <textarea
                    className="tiara-input w-full text-xs min-h-[80px]"
                    value={editing.note ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, note: e.target.value })
                    }
                    placeholder="例）NGキャスト: A101 / A205 など。客層・希望タイプ・注意事項などを記載。"
                  />
                </div>
              </div>

              {/* この店舗の割当キャスト一覧 */}
              <div className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-muted">
                      この店舗の割当キャスト
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-700">
                      名前・ID・単価を確認し、必要に応じて追加・編集・削除を行えます。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="tiara-btn text-[11px] px-3 py-1"
                    onClick={beginNewAssignment}
                  >
                    ＋ 割当を追加（ローカル）
                  </button>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left w-[80px]">
                          キャストID
                        </th>
                        <th className="px-2 py-1.5 text-left w-[120px]">
                          キャスト名
                        </th>
                        <th className="px-2 py-1.5 text-right w-[90px]">
                          割当時給
                        </th>
                        <th className="px-2 py-1.5 text-left">メモ</th>
                        <th className="px-2 py-1.5 text-center w-[120px]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentEditingAssignments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-2 py-3 text-center text-[11px] text-muted"
                          >
                            この店舗に割当済みのキャストはまだ登録されていません。
                          </td>
                        </tr>
                      ) : (
                        currentEditingAssignments.map((a) => (
                          <tr
                            key={a.id}
                            className="border-t border-gray-100 hover:bg-gray-50"
                          >
                            <td className="px-2 py-1.5 font-mono">
                              {a.castCode}
                            </td>
                            <td className="px-2 py-1.5">{a.castName}</td>
                            <td className="px-2 py-1.5 text-right">
                              ¥{a.agreedHourly.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 max-w-[220px]">
                              <span className="line-clamp-2 text-gray-700">
                                {a.note || "-"}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  className="tiara-btn text-[10px] px-2.5 py-1"
                                  onClick={() => beginEditAssignment(a)}
                                >
                                  編集
                                </button>
                                <button
                                  type="button"
                                  className="rounded-xl border border-red-500 bg-white text-red-600 px-2.5 py-1 text-[10px] hover:bg-red-50"
                                  onClick={() => deleteAssignment(a)}
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 割当編集フォーム（インライン） */}
                {assignmentDraft && (
                  <div className="mt-3 p-3 rounded-lg bg-sky-50 border border-sky-300 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-sky-900 font-semibold">
                          割当キャストを
                          {assignmentDraftIsNew ? "追加" : "編集"}
                        </div>
                        <p className="mt-0.5 text-[10px] text-sky-900/70">
                          キャストID・名前・時給・メモを入力して保存します。
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] text-muted hover:text-gray-900"
                        onClick={cancelAssignmentDraft}
                      >
                        ✕ 閉じる
                      </button>
                    </div>

                    {orderSelectOpen && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="text-[11px] text-amber-900 font-semibold">
                          オーダー番号を選択してください
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="tiara-input h-8 text-[11px] min-w-[180px]"
                            value={selectedOrderId ?? ""}
                            onChange={(e) =>
                              setSelectedOrderId(e.target.value || null)
                            }
                          >
                            <option value="">オーダー番号を選択</option>
                            {orderCandidates.map((candidate, index) => (
                              <option key={candidate.id} value={candidate.id}>
                                {`オーダー${candidate.orderNo || index + 1}`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="tiara-btn text-[11px] px-3 py-1"
                            disabled={!selectedOrderId}
                            onClick={() => {
                              if (!selectedOrderId) return;
                              const selected = orderCandidates.find(
                                (c) => c.id === selectedOrderId,
                              );
                              setAssignmentDraft({
                                ...assignmentDraft,
                                id: `${selectedOrderId}-${Date.now()}`,
                                orderId: selectedOrderId,
                                orderNo: selected?.orderNo || undefined,
                                orderStartTime:
                                  selected?.startTime ?? undefined,
                              });
                              setOrderSelectOpen(false);
                            }}
                          >
                            このオーダーで割当を作成
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-gray-300 bg-white text-gray-700 px-3 py-1 text-[11px] hover:bg-gray-50"
                            onClick={cancelAssignmentDraft}
                          >
                            キャンセル
                          </button>
                        </div>
                        <div className="text-[10px] text-amber-800/80">
                          ※ 選択後は割当の入力フォームに戻ります。
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] text-muted mb-1">
                          キャストID
                        </label>
                        <input
                          className="tiara-input h-8 w-full text-[11px]"
                          placeholder="例）A101"
                          value={assignmentDraft.castCode}
                          onChange={(e) =>
                            setAssignmentDraft({
                              ...assignmentDraft,
                              castCode: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] text-muted mb-1">
                          キャスト名
                        </label>
                        <input
                          className="tiara-input h-8 w-full text-[11px]"
                          placeholder="例）あいな"
                          value={assignmentDraft.castName}
                          onChange={(e) =>
                            setAssignmentDraft({
                              ...assignmentDraft,
                              castName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-1">
                          割当時給（円）
                        </label>
                        <input
                          type="number"
                          className="tiara-input h-8 w-full text-[11px] text-right"
                          value={assignmentDraft.agreedHourly}
                          onChange={(e) =>
                            setAssignmentDraft({
                              ...assignmentDraft,
                              agreedHourly: Number(e.target.value || 0),
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-muted mb-1">
                        メモ
                      </label>
                      <textarea
                        className="tiara-input w-full text-[11px] min-h-[60px]"
                        value={assignmentDraft.note ?? ""}
                        onChange={(e) =>
                          setAssignmentDraft({
                            ...assignmentDraft,
                            note: e.target.value,
                          })
                        }
                        placeholder="例）VIP席担当／同伴あり／NG店舗配慮など"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-300 bg-white text-gray-700 px-4 py-1.5 text-[11px]"
                        onClick={cancelAssignmentDraft}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className={`tiara-btn text-[11px] ${
                          orderSelectOpen ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                        disabled={orderSelectOpen}
                        onClick={saveAssignmentDraft}
                      >
                        {assignmentDraftIsNew
                          ? "割当を追加（ローカル）"
                          : "割当を保存（ローカル）"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white text-gray-700 px-4 py-1.5 text-xs"
                onClick={closeEdit}
              >
                閉じる
              </button>
              <button
                type="button"
                className="tiara-btn text-xs"
                onClick={saveEdit}
              >
                {editingIsNew
                  ? "リクエストを追加（ローカル）"
                  : "リクエストを保存（ローカル）"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
