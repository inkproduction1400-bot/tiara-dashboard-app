// src/app/assignments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  type ShopAssignment,
  loadAssignments,
  saveAssignments,
  createEmptyAssignment,
  subscribeAssignments,
} from "@/store/assignmentsStore";
import {
  listShopOrders,
  replaceOrderAssignments,
  updateShopOrder,
  confirmShopOrder,
} from "@/lib/api.shop-orders";
import { getCast } from "@/lib/api.casts";
import { updateShopRequest } from "@/lib/api.shop-requests";
import {
  type ScheduleShopRequest,
  loadScheduleShopRequests,
} from "@/lib/schedule.store";

// 今日/明日 用の日付キー（YYYY-MM-DD）
// 5時までは前日扱い（締め作業の兼ね合い）
const dateKey = (offset: number = 0) => {
  const d = new Date();
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
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
const assignmentPickStorageKey = "tiara:assignments:pick";

type OrderCandidate = {
  id: string;
  orderNo: number;
  startTime?: string | null;
  status?: string | null;
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

const resolveStatusKey = (
  shopId: string,
  group: AssignmentGroup,
): string => {
  if (group.orderId) return `${shopId}:${group.orderId}`;
  if (group.orderStartTime) return `${shopId}:time:${group.orderStartTime}`;
  return "";
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
      status: order?.status ?? null,
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

type IdDocImage = {
  url: string;
  label: string;
};

type IdDocPrintItem = {
  castName: string;
  castCode?: string | null;
  images: IdDocImage[];
};

const resolveCastIdForAssignment = (assignment: ShopAssignment) =>
  assignment.castId ?? null;

const pickIdDocImages = (cast: any): IdDocImage[] => {
  const images: IdDocImage[] = [];
  const seen = new Set<string>();
  const pushUnique = (url?: string | null, label?: string) => {
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    images.push({ url, label: label ?? "身分証" });
  };

  pushUnique(cast?.idDocWithFaceUrl, "身分証（顔あり）");
  pushUnique(cast?.idDocWithoutFaceUrl, "身分証（本籍地）");

  if (Array.isArray(cast?.idPhotosWithFace)) {
    cast.idPhotosWithFace.forEach((url: string) =>
      pushUnique(url, "身分証（顔あり）"),
    );
  }
  if (Array.isArray(cast?.idPhotosWithoutFace)) {
    cast.idPhotosWithoutFace.forEach((url: string) =>
      pushUnique(url, "身分証（本籍地）"),
    );
  }

  return images;
};

const buildIdDocPrintHtml = (items: IdDocPrintItem[]) => {
  const body = items
    .map((item) => {
      const header = `${item.castName || "キャスト"}${
        item.castCode ? `（${item.castCode}）` : ""
      }`;
      const images = item.images.length
        ? item.images
            .map(
              (img) => `
            <figure class="doc">
              <figcaption>${img.label}</figcaption>
              <img src="${img.url}" alt="${img.label}" />
            </figure>`,
            )
            .join("")
        : `<p class="empty">身分証画像が未登録です</p>`;
      return `
        <section class="card">
          <h2>${header}</h2>
          <div class="grid">${images}</div>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>身分証印刷</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #111827; }
          h2 { font-size: 14px; margin: 0 0 8px; }
          .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .doc { margin: 0; }
          figcaption { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
          img { width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
          .empty { font-size: 12px; color: #9ca3af; }
        </style>
      </head>
      <body>
        ${body}
        <script>
          window.addEventListener("load", () => {
            setTimeout(() => {
              window.print();
            }, 100);
          });
        </script>
      </body>
    </html>
  `;
};

export default function Page() {
  const router = useRouter();
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
  const [orderStartTime, setOrderStartTime] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderSelectOpen, setOrderSelectOpen] = useState(false);
  const [orderStatusByKey, setOrderStatusByKey] = useState<
    Record<string, string>
  >({});
  const [activeOrderCountByShopDate, setActiveOrderCountByShopDate] = useState<
    Record<string, number>
  >({});
  const [totalOrderCountByShopDate, setTotalOrderCountByShopDate] = useState<
    Record<string, number>
  >({});
  const [confirming, setConfirming] = useState(false);
  const [printingIdDocs, setPrintingIdDocs] = useState(false);
  const editingRef = useRef<ScheduleShopRequest | null>(null);
  const assignmentDraftRef = useRef<ShopAssignment | null>(null);
  const dateFilterRef = useRef<"all" | "today" | "tomorrow">("all");
  const [castHourlyById, setCastHourlyById] = useState<
    Record<string, number | null>
  >({});

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);
  const orderTimeOptions = useMemo(() => {
    const fromOrders = orderCandidates
      .map((c) => c.startTime)
      .filter((t): t is string => !!t);
    const base = ["00:00", "20:00", "21:00", "22:00", "23:00"];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const t of [...fromOrders, ...base]) {
      if (seen.has(t)) continue;
      seen.add(t);
      merged.push(t);
    }
    return merged;
  }, [orderCandidates]);

  const selectedOrderCandidate = useMemo(
    () => orderCandidates.find((c) => c.id === selectedOrderId) ?? null,
    [orderCandidates, selectedOrderId],
  );

  const fetchOrderStatuses = useCallback(async () => {
    try {
      const today = todayKey();
      const tomorrow = tomorrowKey();
      const [todayOrders, tomorrowOrders] = await Promise.all([
        listShopOrders(today),
        listShopOrders(tomorrow),
      ]);

      const next: Record<string, string> = {};
      const nextActive: Record<string, number> = {};
      const nextTotal: Record<string, number> = {};

      const applyOrders = (orders: any[], date: string) => {
        for (const order of orders) {
          const shopId = order?.shopId ?? order?.shop?.id ?? "";
          if (!shopId || !order?.id) continue;

          const status = order?.status ?? "";
          next[`${shopId}:${order.id}`] = status;

          const time = order?.startTime ?? order?.start_time ?? "";
          if (time) {
            next[`${shopId}:time:${time}`] = status;
          }

          const key = `${date}:${shopId}`;
          nextTotal[key] = (nextTotal[key] ?? 0) + 1;
          if (status !== "canceled") {
            nextActive[key] = (nextActive[key] ?? 0) + 1;
          }
        }
      };

      applyOrders(todayOrders, today);
      applyOrders(tomorrowOrders, tomorrow);

      setOrderStatusByKey(next);
      setActiveOrderCountByShopDate(nextActive);
      setTotalOrderCountByShopDate(nextTotal);
    } catch {
      setOrderStatusByKey({});
      setActiveOrderCountByShopDate({});
      setTotalOrderCountByShopDate({});
    }
  }, []);

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
    void fetchOrderStatuses();
  }, [fetchSchedule, fetchOrderStatuses]);

  useEffect(() => {
    const onFocus = () => {
      void fetchSchedule();
      void fetchOrderStatuses();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchSchedule();
        void fetchOrderStatuses();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchSchedule, fetchOrderStatuses]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchSchedule();
      void fetchOrderStatuses();
    }, 30000);
    return () => window.clearInterval(id);
  }, [fetchSchedule, fetchOrderStatuses]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    assignmentDraftRef.current = assignmentDraft;
  }, [assignmentDraft]);

  useEffect(() => {
    if (!orderStartTime && orderTimeOptions.length > 0) {
      setOrderStartTime(orderTimeOptions[0]);
    }
  }, [orderStartTime, orderTimeOptions]);

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
      const shopKey = resolveShopKey(shop);
      const activeKey = `${shop.date}:${shopKey}`;
      const activeCount = activeOrderCountByShopDate[activeKey] ?? 0;
      const groups = groupAssignmentsByOrder(shop).filter((group) => {
        const statusKey = resolveStatusKey(shopKey, group);
        if (!statusKey) return true;
        return orderStatusByKey[statusKey] !== "canceled";
      });

      if (!groups.length) {
        if (activeCount > 0) {
          result.push({ shop, group: { assignments: [] } });
        }
        continue;
      }
      for (const group of groups) {
        result.push({ shop, group });
      }
    }
    return result;
  }, [
    filteredItems,
    groupAssignmentsByOrder,
    orderStatusByKey,
    activeOrderCountByShopDate,
  ]);

  // 集計（資料っぽいヘッダー用：件数・希望人数合計・割当人数合計）
  const summary = useMemo(() => {
    const totalShops = filteredItems.length;
    let totalAssigned = 0;

    for (const shop of filteredItems) {
      totalAssigned += assignmentsByShop[resolveShopKey(shop)]?.length ?? 0;
    }

    return {
      totalShops,
      totalAssigned,
    };
  }, [filteredItems, assignmentsByShop]);

  // 編集中店舗に紐づく割当（モーダル内表示用）
  const currentEditingAssignments = useMemo(() => {
    if (!editing) return [];
    const shopKey = resolveShopKey(editing);
    return assignments.filter((a) => a.shopId === shopKey);
  }, [assignments, editing]);

  useEffect(() => {
    let active = true;
    const ids = Array.from(
      new Set(
        currentEditingAssignments
          .map((a) => a.castId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const missing = ids.filter(
      (id) => !Object.prototype.hasOwnProperty.call(castHourlyById, id),
    );
    if (missing.length === 0) return;
    (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const detail = await getCast(id);
            const hourly =
              detail?.preferences?.desiredHourly ??
              (detail as any)?.desiredHourly ??
              null;
            return [id, hourly] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      if (!active) return;
      setCastHourlyById((prev) => {
        const next = { ...prev };
        for (const [id, hourly] of results) {
          next[id] = hourly;
        }
        return next;
      });
    })();
    return () => {
      active = false;
    };
  }, [currentEditingAssignments, castHourlyById]);

  const openEdit = (shop: ScheduleShopRequest, group?: AssignmentGroup) => {
    setEditing(shop);
    setEditingIsNew(false);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
    setOrderStartTime(group?.orderStartTime ?? "");
    setSelectedOrderId(group?.orderId ?? null);
    setOrderCandidates([]);
    setOrderSelectOpen(false);
    if (shop.date) {
      void (async () => {
        const candidates = await resolveTargetOrdersForShop(
          resolveShopKey(shop),
          shop.date,
        );
        setOrderCandidates(candidates);
        if (group?.orderId) {
          const selected = candidates.find((c) => c.id === group.orderId);
          const time = selected?.startTime ?? group.orderStartTime ?? "";
          if (time) setOrderStartTime(time);
          setSelectedOrderId(group.orderId);
          return;
        }
        if (candidates.length >= 1 && !group?.orderStartTime) {
          const first = candidates[0].startTime ?? "";
          if (first) setOrderStartTime(first);
        }
      })();
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(assignmentPickStorageKey);
    if (!raw) return;
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload?.shopId || !payload?.castId) return;

    const shop = items.find((s) => resolveShopKey(s) === payload.shopId);
    if (!shop) return;

    window.localStorage.removeItem(assignmentPickStorageKey);
    openEdit(shop, {
      orderId: payload.orderId ?? undefined,
      orderStartTime: payload.orderStartTime ?? undefined,
      assignments: [],
    });

    setAssignments((prev) => {
      const exists = prev.some(
        (a) =>
          a.castId === payload.castId &&
          (payload.orderId
            ? a.orderId === payload.orderId
            : a.orderStartTime === payload.orderStartTime),
      );
      if (exists) return prev;
      const next = [
        ...prev,
        {
          id: `${payload.orderId ?? payload.shopId}-${payload.castId}-${Date.now()}`,
          shopId: payload.shopId,
          orderId: payload.orderId ?? undefined,
          orderStartTime: payload.orderStartTime ?? undefined,
          castId: payload.castId,
          castCode: payload.castCode ?? "",
          castName: payload.castName ?? "",
          agreedHourly:
            Number.isFinite(Number(payload.agreedHourly))
              ? Number(payload.agreedHourly)
              : 0,
          note: "",
        },
      ];
      saveAssignments(next, resolveAssignmentsDateKey(dateFilter));
      return next;
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("pick") === "1") {
      router.replace("/assignments");
    }
  }, [items, router, dateFilter]);

  const openNew = () => {
    const next = createEmptyScheduleRequest(todayKey());
    setEditing(next);
    setEditingIsNew(true);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
    setOrderStartTime("");
    setOrderCandidates([]);
    setSelectedOrderId(null);
    setOrderSelectOpen(false);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditingIsNew(false);
    setAssignmentDraft(null);
    setAssignmentDraftIsNew(false);
    setOrderStartTime("");
    setOrderCandidates([]);
    setSelectedOrderId(null);
    setOrderSelectOpen(false);
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

  const resolveEditingOrderId = useCallback(() => {
    if (selectedOrderId) return selectedOrderId;
    if (orderCandidates.length === 1) return orderCandidates[0].id;
    if (orderStartTime) {
      const matched = orderCandidates.find(
        (c) => c.startTime === orderStartTime,
      );
      if (matched) return matched.id;
    }
    return null;
  }, [orderCandidates, orderStartTime, selectedOrderId]);

  const confirmMatching = async () => {
    if (!editing || editingIsNew) {
      alert("既存の店舗リクエストを選択してください。");
      return;
    }
    const orderId = resolveEditingOrderId();
    if (!orderId) {
      alert("対象オーダーが特定できません。入店時間を選択してください。");
      return;
    }

    if (confirming) return;
    setConfirming(true);

    try {
      const updatedRequest = await updateShopRequest(editing.id, {
        requestedHeadcount: editing.requestedHeadcount ?? 0,
        minHourly: editing.minHourly ?? undefined,
        maxHourly: undefined,
        minAge: editing.minAge ?? undefined,
        maxAge: undefined,
        requireDrinkOk: editing.requireDrinkOk,
        note: editing.note ?? null,
      });
      if (orderStartTime) {
        await updateShopOrder(orderId, { startTime: orderStartTime });
      }
      await confirmShopOrder(orderId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                requestedHeadcount: updatedRequest.requestedHeadcount,
                minHourly: updatedRequest.minHourly ?? undefined,
                maxHourly: updatedRequest.maxHourly ?? undefined,
                minAge: updatedRequest.minAge ?? undefined,
                maxAge: updatedRequest.maxAge ?? undefined,
                requireDrinkOk: updatedRequest.requireDrinkOk,
                note: updatedRequest.note ?? undefined,
              }
            : item,
        ),
      );
      await printIdDocsForAssignments(currentEditingAssignments, {
        silent: true,
      });
      alert("マッチングを確定しました。");
      closeEdit();
    } catch (err) {
      console.warn("[assignments] confirmMatching failed", err);
      alert("マッチング確定に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setConfirming(false);
    }
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

  const deleteOrder = async (
    shop: ScheduleShopRequest,
    group?: AssignmentGroup,
  ) => {
    let orderId = group?.orderId ?? null;
    if (!orderId) {
      const shopId = resolveShopKey(shop);
      const date = shop.date ?? editing?.date ?? todayKey();
      try {
        const orders = await listShopOrders(date);
        const candidates = orders.filter(
          (order) => order?.shopId === shopId || order?.shop?.id === shopId,
        );
        if (group?.orderStartTime) {
          const matched = candidates.filter(
            (order) =>
              (order?.startTime ?? order?.start_time ?? "") ===
              group.orderStartTime,
          );
          if (matched.length === 1) {
            orderId = matched[0].id ?? null;
          }
        }
        if (!orderId && candidates.length === 1) {
          orderId = candidates[0].id ?? null;
        }
      } catch (err) {
        console.warn("[assignments] deleteOrder lookup failed", err);
      }
    }

    if (!orderId) {
      deleteItem(shop);
      return;
    }

    const orderLabel = formatOrderLabel(group);
    if (
      !window.confirm(
        `${shop.name} のオーダー ${orderLabel || ""} を削除しますか？\n（このオーダーの割当キャストも削除されます）`,
      )
    ) {
      return;
    }

    try {
      await replaceOrderAssignments(orderId, []);
      await updateShopOrder(orderId, { status: "canceled" });
    } catch (err) {
      console.warn("[assignments] deleteOrder failed", err);
      alert("オーダー削除に失敗しました。時間をおいて再度お試しください。");
      return;
    }

    setAssignments((prev) => {
      const shopKey = resolveShopKey(shop);
      const orderStart = group?.orderStartTime ?? null;
      const orderNo = group?.orderNo ?? null;
      const next = prev.filter((a) => {
        if (a.orderId && a.orderId === orderId) return false;
        if (a.shopId !== shopKey) return true;
        if (!a.orderId && orderStart && a.orderStartTime === orderStart) {
          return false;
        }
        if (!a.orderId && orderNo != null && a.orderNo === orderNo) {
          return false;
        }
        return true;
      });
      saveAssignments(next, resolveAssignmentsDateKey(dateFilter));
      return next;
    });
  };

  // ===== 割当キャスト 編集系（モーダル内） =====
  const openCastPicker = () => {
    if (!editing) return;
    const shopId = resolveShopKey(editing);
    const params = new URLSearchParams({
      pick: "1",
      tab: "casts",
      shopId,
      return: "/assignments",
    });
    if (selectedOrderId) params.set("orderId", selectedOrderId);
    if (orderStartTime) params.set("orderStartTime", orderStartTime);
    router.push(`/casts/today?${params.toString()}`);
  };

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

  const printIdDocsForAssignments = useCallback(
    async (
      targetAssignments: ShopAssignment[],
      options: { silent?: boolean } = {},
    ) => {
      const castIds = Array.from(
        new Set(
          targetAssignments
            .map((a) => resolveCastIdForAssignment(a))
            .filter((id): id is string => !!id),
        ),
      );

      if (castIds.length === 0) {
        if (!options.silent) {
          alert("キャストIDが未設定のため印刷できません。");
        }
        return;
      }

      setPrintingIdDocs(true);
      try {
        const results = await Promise.all(
          castIds.map(async (castId) => {
            try {
              const cast = await getCast(castId);
              const images = pickIdDocImages(cast);
              return {
                castName: cast?.displayName ?? "キャスト",
                castCode: cast?.castCode ?? null,
                images,
              } as IdDocPrintItem;
            } catch (err) {
              console.warn("[assignments] failed to load cast for print", err);
              return null;
            }
          }),
        );

        const items = results.filter(
          (item): item is IdDocPrintItem => !!item,
        );
        if (items.length === 0) {
          if (!options.silent) {
            alert("印刷対象のキャスト情報が取得できませんでした。");
          }
          return;
        }

        const win = window.open("", "_blank", "noopener,noreferrer");
        if (!win) {
          if (!options.silent) {
            alert("印刷ウィンドウを開けませんでした（ポップアップ許可をご確認ください）。");
          }
          return;
        }
        win.document.open();
        win.document.write(buildIdDocPrintHtml(items));
        win.document.close();
      } finally {
        setPrintingIdDocs(false);
      }
    },
    [],
  );

  const resolveOrderIdForAssignment = useCallback(
    async (a: ShopAssignment): Promise<string | null> => {
      if (a.orderId) return a.orderId;
      if (!editing?.date) return null;
      const shopKey = resolveShopKey(editing);
      const candidates = await resolveTargetOrdersForShop(shopKey, editing.date);
      if (candidates.length === 1) return candidates[0].id;
      if (a.orderStartTime) {
        const matched = candidates.find((c) => c.startTime === a.orderStartTime);
        if (matched) return matched.id;
      }
      return resolveEditingOrderId();
    },
    [editing, resolveEditingOrderId],
  );

  const deleteAssignment = async (a: ShopAssignment) => {
    if (
      !window.confirm(
        `この店舗からキャスト ${a.castCode} / ${a.castName} の割当を削除しますか？`,
      )
    ) {
      return;
    }

    const orderId = await resolveOrderIdForAssignment(a);
    if (!orderId) {
      alert("対象オーダーが特定できません。入店時間を選択してください。");
      return;
    }

    try {
      const date = editing?.date ?? todayKey();
      const orders = await listShopOrders(date);
      const target = orders.find((o) => o?.id === orderId);
      const current = Array.isArray(target?.assignments)
        ? target.assignments
        : [];
      const remaining = current.filter((item: any) => item?.id !== a.id);
      const payloads = remaining.map((item: any) => ({
        castId:
          item?.castId ??
          item?.cast?.userId ??
          item?.cast?.id ??
          undefined,
        assignedFrom: item?.assignedFrom ?? item?.assigned_from ?? undefined,
        assignedTo: item?.assignedTo ?? item?.assigned_to ?? null,
        priority: Number.isFinite(Number(item?.priority))
          ? Number(item?.priority)
          : 0,
        reasonOverride: item?.reasonOverride ?? item?.reason_override ?? null,
      }));
      await replaceOrderAssignments(orderId, payloads);
    } catch (err) {
      console.warn("[assignments] deleteAssignment failed", err);
      alert("割当削除に失敗しました。時間をおいて再度お試しください。");
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

  const formatAssignedHourly = (a: ShopAssignment) => {
    const hourly =
      (a.castId ? castHourlyById[a.castId] : null) ??
      (Number.isFinite(a.agreedHourly) && a.agreedHourly > 0
        ? a.agreedHourly
        : null);
    return hourly != null ? `¥${hourly.toLocaleString()}` : "—";
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
          <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
              <span className="text-muted whitespace-nowrap">対象店舗数</span>
              <span className="text-base font-semibold text-sky-900">
                {summary.totalShops}
              </span>
              <span className="text-[10px] text-sky-900/80">件</span>
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
              件（割当済み{" "}
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
                    希望時給
                  </th>
                  <th className="px-3 py-2 text-right w-[120px]">
                    希望年齢
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
                    const shopKey = resolveShopKey(shop);
                    const statusKey = group.orderId
                      ? `${shopKey}:${group.orderId}`
                      : group.orderStartTime
                      ? `${shopKey}:time:${group.orderStartTime}`
                      : "";
                    const isConfirmed =
                      statusKey &&
                      orderStatusByKey[statusKey] === "confirmed";

                    return (
                      <tr
                        key={`${shop.id}-${group?.orderId ?? group?.orderStartTime ?? "default"}`}
                        className={`border-t border-gray-100 ${
                          isConfirmed
                            ? "bg-emerald-50/60 hover:bg-emerald-50"
                            : "hover:bg-gray-50"
                        }`}
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
                        </td>
                        <td className="px-3 py-2 text-right">
                          {shop.minAge != null ? `${shop.minAge} 歳` : "-"}
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
                              className="tiara-btn text-[11px] px-3 py-1 min-w-[72px] leading-tight"
                              onClick={() => openEdit(shop, group)}
                            >
                              <span className="block whitespace-nowrap">
                                詳細
                              </span>
                              <span className="block whitespace-nowrap">
                                編集
                              </span>
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-red-500 bg-white text-red-600 px-3 py-1 text-[11px] hover:bg-red-50"
                              onClick={() => void deleteOrder(shop, group)}
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

                {/* 入店時間・人数・飲酒 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      入店時間
                    </label>
                    <select
                      className="tiara-input h-9 w-full py-1 text-xs leading-normal"
                      value={orderStartTime}
                      onChange={(e) => setOrderStartTime(e.target.value)}
                    >
                      <option value="">未指定</option>
                      {orderTimeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望人数
                    </label>
                    <select
                      className="tiara-input h-9 w-full py-1 text-xs leading-normal"
                      value={String(editing.requestedHeadcount ?? 0)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          requestedHeadcount: Number(e.target.value || 0),
                        })
                      }
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} 名
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      飲酒条件
                    </label>
                    <select
                      className="tiara-input h-9 w-full py-1 text-xs leading-normal"
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

                {/* 時給・年齢 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望時給
                    </label>
                    <select
                      className="tiara-input h-9 w-full py-1 text-xs leading-normal"
                      value={editing.minHourly ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          minHourly: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                          maxHourly: undefined,
                        })
                      }
                    >
                      <option value="">未指定</option>
                      {[2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000].map(
                        (n) => (
                          <option key={n} value={n}>
                            ¥{n.toLocaleString()}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      希望年齢
                    </label>
                    <select
                      className="tiara-input h-9 w-full py-1 text-xs leading-normal"
                      value={editing.minAge ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          minAge: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                          maxAge: undefined,
                        })
                      }
                    >
                      <option value="">未指定</option>
                      {Array.from({ length: 23 }, (_, i) => 18 + i).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n} 歳
                          </option>
                        ),
                      )}
                    </select>
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
                    onClick={openCastPicker}
                  >
                    ＋ 割当を追加
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
                              {formatAssignedHourly(a)}
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
                      <div
                        className={`rounded-lg border p-3 space-y-2 ${
                          selectedOrderCandidate?.status === "confirmed"
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
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
                                {`オーダー${candidate.orderNo || index + 1}${
                                  candidate.startTime
                                    ? `（${candidate.startTime}）`
                                    : ""
                                }${candidate.status === "confirmed" ? "（確定）" : ""}`}
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
                        className="rounded-xl border border-sky-400 bg-white text-sky-700 px-4 py-1.5 text-[11px] hover:bg-sky-50"
                        onClick={() => {
                          if (!assignmentDraft) return;
                          void printIdDocsForAssignments([assignmentDraft]);
                        }}
                        disabled={printingIdDocs}
                      >
                        {printingIdDocs ? "印刷準備中..." : "身分証印刷"}
                      </button>
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
                onClick={confirmMatching}
                disabled={confirming}
              >
                {confirming ? "確定中..." : "マッチング確定"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
