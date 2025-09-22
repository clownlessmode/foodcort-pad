"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Package } from "lucide-react";
import type { Order } from "@/app/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OrdersListProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
}

const getStatusColor = (status: Order["status"]) => {
  switch (status) {
    case "new":
      return "bg-accent text-accent-foreground";
    case "completed":
      return "bg-muted text-muted-foreground";
    case "cancelled":
      return "bg-destructive text-destructive-foreground";
    case "delivered":
      return "bg-green-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getStatusText = (status: Order["status"]) => {
  switch (status) {
    case "new":
      return "Новый";
    case "completed":
      return "Готовый";
    case "cancelled":
      return "Отменен";
    case "delivered":
      return "Отдан";
    default:
      return status;
  }
};

const formatTime = (dateLike: Date | string) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const now = new Date();
  const createdMs = date.getTime();
  if (Number.isNaN(createdMs)) return "—";
  const diffInMinutes = Math.floor((now.getTime() - createdMs) / (1000 * 60));

  if (diffInMinutes < 1) return "Только что";
  if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;

  const hours = Math.floor(diffInMinutes / 60);
  const minutes = diffInMinutes % 60;
  return `${hours}ч ${minutes}м назад`;
};

export function OrdersList({ orders, onSelectOrder }: OrdersListProps) {
  const newOrders = orders.filter((order) => order.status === "new");
  const completedOrders = orders.filter(
    (order) => order.status === "completed"
  );
  const deliveredOrders = orders.filter(
    (order) => order.status === "delivered"
  );

  const isToday = (date: Date) => {
    const d = date;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const deliveredToday = deliveredOrders.filter((o) =>
    isToday(o.updatedAt ?? o.createdAt)
  );
  console.log("Заказы:", orders);
  console.log("Новые заказы:", newOrders);
  console.log("Готовые заказы:", completedOrders);
  console.log("Отданы за сегодня:", deliveredToday);
  const renderGrid = (list: Order[]) => (
    <div className="grid grid-cols-3">
      {list.map((order) => (
        <Card
          key={order.id}
          className="p-4 cursor-pointer hover:shadow-xl transition-all duration-200 border-2 hover:border-primary hover:scale-105"
          onClick={() => onSelectOrder(order)}
        >
          <div className="flex items-center justify-between ">
            <h2 className="text-3xl font-bold text-foreground">
              Заказ {order.number}
            </h2>
            <Badge
              className={`text-xl px-4 py-2 ${getStatusColor(order.status)}`}
            >
              {getStatusText(order.status)}
            </Badge>
          </div>

          <div className="space-y-2 mb-3">
            {order.items.slice(0, 3).map((item) => (
              <div key={item.id} className="flex justify-between items-center">
                <span className="text-xl text-card-foreground font-medium">
                  {item.name}
                </span>
                <span className="text-xl font-bold text-primary">
                  x{item.quantity}
                </span>
              </div>
            ))}
            {order.items.length > 3 && (
              <div className="text-muted-foreground text-xl">
                +{order.items.length - 3} позиций...
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 justify-between text-muted-foreground flex-col">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6" />
              <span className="text-xl font-medium">
                {formatTime(order.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6" />
              <span className="text-xl font-medium">
                {order.orderType === "takeaway" ? "С собой" : "В зале"}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="new">
          <TabsList className="mb-3 flex gap-6 p-4 md:p-6 rounded-xl w-full !px-0 ">
            <TabsTrigger
              value="new"
              className="text-2xl md:text-3xl md:px-10 py-5 md:py-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Новые {newOrders.length > 0 ? newOrders.length : ""}
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="text-2xl md:text-3xl px-8 md:px-10 py-5 md:py-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Готовые {completedOrders.length > 0 ? completedOrders.length : ""}
            </TabsTrigger>
            <TabsTrigger
              value="delivered_today"
              className="text-2xl md:text-3xl px-8 md:px-10 py-5 md:py-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Отданы {deliveredToday.length > 0 ? deliveredToday.length : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            {newOrders.length > 0 ? (
              renderGrid(newOrders)
            ) : (
              <div className="text-center py-20">
                <Package className="w-20 h-20 text-muted-foreground mx-auto mb-6" />
                <h2 className="text-3xl font-semibold text-muted-foreground mb-4">
                  Нет новых заказов
                </h2>
                <p className="text-xl text-muted-foreground">
                  Новые заказы появятся здесь автоматически
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedOrders.length > 0 ? (
              renderGrid(completedOrders)
            ) : (
              <div className="text-center py-20">
                <Package className="w-20 h-20 text-muted-foreground mx-auto mb-6" />
                <h2 className="text-3xl font-semibold text-muted-foreground mb-4">
                  Нет готовых заказов
                </h2>
                <p className="text-xl text-muted-foreground">
                  Завершенные заказы появятся здесь
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="delivered_today">
            {deliveredToday.length > 0 ? (
              renderGrid(deliveredToday)
            ) : (
              <div className="text-center py-20">
                <Package className="w-20 h-20 text-muted-foreground mx-auto mb-6" />
                <h2 className="text-3xl font-semibold text-muted-foreground mb-4">
                  Нет заказов Отданы за сегодня
                </h2>
                <p className="text-xl text-muted-foreground">
                  Как только статусы будут "Отдан" сегодня, они появятся здесь
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
