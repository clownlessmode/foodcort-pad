"use client";

import { useEffect, useRef, useState } from "react";
import { OrdersList } from "@/components/orders-list";
import { OrderDetails } from "@/components/order-details";
import { OrdersWebSocketClient } from "@/lib/websocket-client";

export type OrderStatus = "new" | "completed" | "cancelled" | "delivered";

export type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  comment?: string;
  addons?: string[];
};

export type Order = {
  id: string;
  number: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
  updatedAt?: Date;
  total: number;
  orderType: "takeaway" | "dine-in";
  receivingMethod: "delivery" | "self_service";
  note?: string;
  phoneNumber?: string | null;
  storeId?: string | number;
};

export default function KitchenApp() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const wsRef = useRef<OrdersWebSocketClient | null>(null);

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    // Emit to server
    const numericId = Number(orderId);
    if (!Number.isNaN(numericId)) {
      wsRef.current?.updateOrderStatus(numericId, status);
      console.log("🔼 emit update_order_status:", {
        orderId: numericId,
        status,
      });
    }

    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status } : order))
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status } : null));
    }
  };

  // Temporary websocket hook-in: just log orders/events to console
  useEffect(() => {
    const client = new OrdersWebSocketClient();

    type ServerOrder = {
      id?: string | number;
      orderId?: string | number;
      id_store?: string | number;
      idStore?: string | number;
      phone_number?: string | number | null;
      phoneNumber?: string | number | null;
      products?: unknown;
      status?: string;
      create_at?: string;
      created_at?: string;
      createdAt?: string;
      updated_at?: string;
      updatedAt?: string;
      receiving_method?: "delivery" | "self_service";
      receivingMethod?: "delivery" | "self_service";
      message?: string;
    };

    const parseServerDate = (input?: unknown): Date => {
      if (!input) return new Date();
      if (input instanceof Date) return new Date(input.getTime());
      if (typeof input === "number") {
        const ms = input < 1e12 ? input * 1000 : input;
        return new Date(ms);
      }
      if (typeof input === "string") {
        const trimmed = input.trim();
        // Try native parser first (handles ISO, RFC, etc.)
        const native = new Date(trimmed);
        if (!Number.isNaN(native.getTime())) return native;

        // Handle formats like "DD.MM.YYYY, HH:MM:SS" or "DD.MM.YYYY HH:MM:SS"
        const match = trimmed.match(
          /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );
        if (match) {
          const [, dStr, mStr, yStr, hhStr, mmStr, ssStr] = match;
          const day = Number(dStr);
          const month = Number(mStr) - 1;
          let year = Number(yStr);
          if (year < 100) year += 2000;
          const hours = hhStr ? Number(hhStr) : 0;
          const minutes = mmStr ? Number(mmStr) : 0;
          const seconds = ssStr ? Number(ssStr) : 0;
          return new Date(year, month, day, hours, minutes, seconds);
        }

        // Numeric strings as epoch
        if (/^\d+$/.test(trimmed)) {
          const num = Number(trimmed);
          const ms = num < 1e12 ? num * 1000 : num;
          return new Date(ms);
        }
      }
      // Fallback to now to avoid Invalid Date downstream
      return new Date();
    };

    const mapServerOrderToLocal = (src: ServerOrder): Order => {
      const idValue = src.id ?? src.orderId;
      const createdAtIso = src.create_at || src.created_at || src.createdAt;
      const updatedAtIso = src.updated_at || src.updatedAt;
      const rawProducts = src.products;
      const receivingMethodValue = (src.receiving_method ??
        src.receivingMethod ??
        "self_service") as "delivery" | "self_service";

      let items: OrderItem[] = [];
      if (Array.isArray(rawProducts)) {
        const flattened = (rawProducts as unknown[]).flat(
          Infinity
        ) as unknown[];
        const productObjects = flattened.filter(
          (p) => p && typeof p === "object"
        );
        if (productObjects.length > 0) {
          items = productObjects.map((p, index) => {
            const anyP = p as Record<string, unknown>;
            const preferredName =
              (anyP["name_original"] as string) ||
              (anyP["nameOriginal"] as string) ||
              (anyP["name"] as string) ||
              "";
            const name =
              preferredName && preferredName.toString().trim().length > 0
                ? (preferredName as string)
                : `Товар ${index + 1}`;
            const quantity = Number(
              (anyP["quantity"] as number) ??
                (anyP["qty"] as number) ??
                (anyP["count"] as number) ??
                1
            );
            // Map include -> addons and merge exclude/comment -> comment
            let addons: string[] | undefined;
            const rawInclude = anyP["include"] as unknown;
            if (Array.isArray(rawInclude)) {
              const mappedAddons = rawInclude
                .map((inc) => {
                  if (!inc || typeof inc !== "object") return "";
                  const incAny = inc as Record<string, unknown>;
                  const incName =
                    (incAny["name"] as string) ||
                    (incAny["name_original"] as string) ||
                    "";
                  const incCount = Number(
                    (incAny["count"] as number) ??
                      (incAny["quantity"] as number) ??
                      1
                  );
                  if (!incName) return "";
                  return incCount > 1 ? `${incName} x${incCount}` : incName;
                })
                .filter((s) => s && s.trim().length > 0);
              if (mappedAddons.length > 0) addons = mappedAddons;
            }

            const excludeText =
              typeof anyP["exclude"] === "string"
                ? (anyP["exclude"] as string)
                : undefined;
            const extraComment =
              typeof anyP["comment"] === "string"
                ? (anyP["comment"] as string)
                : undefined;
            const comment =
              [excludeText, extraComment]
                .filter((x) => x && x.toString().trim().length > 0)
                .join(" • ") || undefined;

            return {
              id: String(
                (anyP["id"] as string | number) ??
                  `${String(idValue ?? "unknown")}-${index}`
              ),
              name,
              quantity,
              comment,
              addons,
            };
          });
        }
      }

      const mapped: Order = {
        id: String(idValue ?? ""),
        number: String(idValue ?? ""),
        items,
        status: (src.status as OrderStatus) || "new",
        createdAt: parseServerDate(createdAtIso),
        updatedAt: updatedAtIso ? parseServerDate(updatedAtIso) : undefined,
        total: 0,
        orderType: "takeaway",
        receivingMethod: receivingMethodValue,
        note:
          typeof src.message === "string" && src.message.trim().length > 0
            ? src.message
            : undefined,
        phoneNumber: (() => {
          const raw = (src.phoneNumber ?? src.phone_number) as
            | string
            | number
            | null
            | undefined;
          if (raw === null || raw === undefined) return null;
          return String(raw);
        })(),
        storeId: src.idStore ?? src.id_store,
      };

      return mapped;
    };

    client
      .connect()
      .then(() => {
        console.log("🔌 WebSocket connected (page)");
        wsRef.current = client;

        // Разблокируем звук при первом пользовательском взаимодействии
        const unlock = async () => {
          try {
            await wsRef.current?.unlockAudio?.();
          } catch {}
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
          window.removeEventListener("touchstart", unlock);
        };
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        window.addEventListener("touchstart", unlock, { once: true });

        client.onConnectionConfirmed((data) => {
          console.log("🔗 connection_confirmed:", data);
        });

        client.onOrdersList((ordersData) => {
          console.log("📋 orders_list received (raw):", ordersData);
          try {
            const mapped = (ordersData as unknown[]).map((o) =>
              mapServerOrderToLocal(o as ServerOrder)
            );
            console.log("📋 orders_list mapped:", mapped);
            setOrders(mapped);
          } catch (e) {
            console.error("Failed to map orders_list:", e);
          }
        });

        client.onNewOrder((order) => {
          console.log("🆕 new_order received (raw):", order);
          try {
            const mapped = mapServerOrderToLocal(order as ServerOrder);
            console.log("🆕 new_order mapped:", mapped);
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === mapped.id);
              if (exists) {
                return prev.map((o) => (o.id === mapped.id ? mapped : o));
              }
              return [...prev, mapped];
            });
          } catch (e) {
            console.error("Failed to map new_order:", e);
          }
        });

        client.onOrderStatusUpdate((update) => {
          console.log("🔄 order_status_updated:", update);
          setOrders((prev) =>
            prev.map((o) =>
              o.id === String(update.orderId)
                ? {
                    ...o,
                    status: update.status as OrderStatus,
                    updatedAt: new Date(),
                  }
                : o
            )
          );
        });
      })
      .catch((err) => {
        console.error("WebSocket connection error:", err);
      });

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, []);

  if (selectedOrder) {
    return (
      <>
        <OrderDetails
          order={selectedOrder}
          onBack={() => setSelectedOrder(null)}
          onUpdateStatus={updateOrderStatus}
        />
        <TestSoundButton wsRef={wsRef} />
      </>
    );
  }

  return (
    <>
      <OrdersList orders={orders} onSelectOrder={setSelectedOrder} />
      <TestSoundButton wsRef={wsRef} />
    </>
  );
}

// Вспомогательная тестовая кнопка для воспроизведения звука
function TestSoundButton({
  wsRef,
}: {
  wsRef: React.RefObject<OrdersWebSocketClient | null>;
}) {
  const [status, setStatus] = useState<string>("");

  const playBeepFallback = async () => {
    try {
      const Ctx: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) throw new Error("WebAudio недоступен");
      const ctx = new Ctx();
      await ctx.resume();

      // Создаем более громкий и заметный звук
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;

      // Увеличиваем громкость fallback звука
      gain.gain.value = 0.1; // Начальная громкость выше
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const duration = 0.5; // Увеличиваем длительность

      // Более заметный звук с резким началом и плавным затуханием
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.05); // Максимальная громкость
      gain.gain.exponentialRampToValueAtTime(0.1, now + duration);

      osc.start(now);
      osc.stop(now + duration);

      console.log("🔊 Fallback звук воспроизведен (громкий)");
      return true;
    } catch (e) {
      console.warn("WebAudio fallback error:", e);
      return false;
    }
  };

  const onClick = async () => {
    setStatus("Тест начат…");

    try {
      // 1) Разблокировка аудио
      setStatus("Разблокировка аудио…");
      await wsRef.current?.unlockAudio?.();

      // 2) Используем тот же механизм, что и WebSocket клиент
      setStatus("Проигрывание звука…");
      const success = await wsRef.current?.playNewOrderSound?.();

      if (success) {
        setStatus("✅ Звук воспроизведен успешно");
        console.log("🔊 Тестовый звук воспроизведен через WebSocket клиент");
      } else {
        // 3) Fallback только если основной звук не сработал
        setStatus("Fallback звук…");
        const fallbackSuccess = await playBeepFallback();
        setStatus(
          fallbackSuccess
            ? "✅ Fallback звук воспроизведен"
            : "❌ Ошибка воспроизведения"
        );
      }
    } catch (e: any) {
      console.warn("Ошибка тестового звука:", e);

      // 4) Последний fallback на WebAudio
      try {
        setStatus("Последний fallback…");
        const fallbackSuccess = await playBeepFallback();
        setStatus(
          fallbackSuccess
            ? "✅ Fallback звук воспроизведен"
            : "❌ Все методы не сработали"
        );
      } catch (fallbackError) {
        setStatus(`❌ Ошибка: ${e?.message || e}`);
      }
    }
  };

  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 9999,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--background)",
        color: "var(--foreground)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        touchAction: "manipulation",
        fontSize: 14,
      }}
      aria-live="polite"
      aria-label="Тестовый звук"
      title="Тестовый звук"
    >
      ▶︎ Тест звука{status ? ` — ${status}` : ""}
    </button>
  );
}
