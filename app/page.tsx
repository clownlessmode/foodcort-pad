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
      id: string | number;
      id_store?: string | number;
      phone_number?: string | null;
      products?: unknown;
      status?: string;
      create_at?: string;
      created_at?: string;
      updated_at?: string;
    };

    const mapServerOrderToLocal = (src: ServerOrder): Order => {
      const createdAtIso = src.create_at || src.created_at;
      const updatedAtIso = src.updated_at;
      const rawProducts = src.products;

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
            const name = (anyP["name"] as string) || `Товар ${index + 1}`;
            const quantity = Number(
              (anyP["quantity"] as number) || (anyP["qty"] as number) || 1
            );
            return {
              id: String(
                (anyP["id"] as string | number) ?? `${src.id}-${index}`
              ),
              name,
              quantity,
            };
          });
        }
      }

      const mapped: Order = {
        id: String(src.id),
        number: String(src.id),
        items,
        status: (src.status as OrderStatus) || "new",
        createdAt: createdAtIso ? new Date(createdAtIso) : new Date(),
        updatedAt: updatedAtIso ? new Date(updatedAtIso) : undefined,
        total: 0,
        orderType: "takeaway",
      };

      return mapped;
    };

    client
      .connect()
      .then(() => {
        console.log("🔌 WebSocket connected (page)");
        wsRef.current = client;

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
      <OrderDetails
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onUpdateStatus={updateOrderStatus}
      />
    );
  }

  return <OrdersList orders={orders} onSelectOrder={setSelectedOrder} />;
}
