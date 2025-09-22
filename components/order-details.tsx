"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Clock,
  Package,
  CheckCircle,
  XCircle,
  Phone,
  Store,
  StickyNote,
} from "lucide-react";
import type { Order, OrderStatus } from "@/app/page";

interface OrderDetailsProps {
  order: Order;
  onBack: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
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

const formatElapsedTime = (dateLike: Date | string) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const now = new Date();
  const createdMs = date.getTime();
  if (Number.isNaN(createdMs)) return "—";
  const diffInMinutes = Math.floor((now.getTime() - createdMs) / (1000 * 60));

  if (diffInMinutes < 1) return "0 мин";
  if (diffInMinutes < 60) return `${diffInMinutes} мин`;

  const hours = Math.floor(diffInMinutes / 60);
  const minutes = diffInMinutes % 60;
  return `${hours}ч ${minutes}м`;
};

export function OrderDetails({
  order,
  onBack,
  onUpdateStatus,
}: OrderDetailsProps) {
  const handleComplete = () => {
    onUpdateStatus(order.id, "completed");
  };

  const handleCancel = () => {
    onUpdateStatus(order.id, "cancelled");
  };

  const handleDeliver = () => {
    onUpdateStatus(order.id, "delivered");
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto pb-36">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b mb-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="lg"
              onClick={onBack}
              className="p-6 bg-transparent border-2 hover:scale-105"
            >
              <ArrowLeft className="w-8 h-8" />
            </Button>
            <h1 className="text-3xl font-bold text-foreground">
              Заказ {order.number}
            </h1>
          </div>
          <Badge
            className={`text-2xl px-6 py-3 ${getStatusColor(order.status)}`}
          >
            {getStatusText(order.status)}
          </Badge>
        </div>

        {/* Order Meta */}
        {(order.note || order.phoneNumber || order.storeId) && (
          <Card className="p-8 mb-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {order.note && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <StickyNote className="w-6 h-6 text-primary" />
                    <h3 className="text-2xl font-semibold">Комментарий</h3>
                  </div>
                  <p className="text-xl">{order.note}</p>
                </div>
              )}
              {order.phoneNumber && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Phone className="w-6 h-6 text-primary" />
                    <h3 className="text-2xl font-semibold">Телефон</h3>
                  </div>
                  <p className="text-xl">{order.phoneNumber}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="p-8 mb-12">
          <h2 className="text-3xl font-bold mb-8">Состав заказа</h2>
          <div className="space-y-8">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="border-b border-border pb-8 last:border-b-0"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-semibold text-foreground">
                    {item.name}
                  </h3>
                  <span className="text-2xl font-bold text-primary">
                    x{item.quantity}
                  </span>
                </div>

                {item.addons && item.addons.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xl font-medium text-muted-foreground mb-3">
                      Дополнения:
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {item.addons.map((addon, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-lg px-3 py-1"
                        >
                          {addon}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {item.comment && (
                  <div className="bg-muted p-6 rounded-lg">
                    <p className="text-xl font-medium text-muted-foreground mb-2">
                      Комментарий:
                    </p>
                    <p className="text-xl text-foreground">{item.comment}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Bottom bar spacer handled by parent padding */}
      </div>
      {/* Sticky/FIxed bottom bar with compact info and actions */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
        <div className="max-w-5xl mx-auto px-8 py-3 flex items-center justify-between gap-6">
          <div className="grid grid-cols-2 gap-6 w-full md:flex-1">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <span className="text-lg md:text-xl font-semibold text-foreground">
                {formatElapsedTime(order.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <Badge
                className={`text-xs px-2 py-0.5 ${
                  order.receivingMethod === "delivery"
                    ? "bg-blue-500"
                    : "bg-amber-500"
                } text-white`}
              >
                {order.receivingMethod === "delivery"
                  ? "Доставка"
                  : "Самовывоз"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {order.status === "new" && (
              <Button
                onClick={handleComplete}
                className="px-6 py-3 text-lg md:text-xl hover:scale-105 transition-transform"
              >
                <CheckCircle className="w-6 h-6 mr-2" />
                Отметить готовым
              </Button>
            )}
            {order.status === "new" && (
              <Button
                variant="destructive"
                onClick={handleCancel}
                className="px-6 py-3 text-lg md:text-xl hover:scale-105 transition-transform"
              >
                <XCircle className="w-6 h-6 mr-2" />
                Отменить
              </Button>
            )}
            {order.status === "completed" && (
              <Button
                onClick={handleDeliver}
                className="px-6 py-3 text-lg md:text-xl hover:scale-105 transition-transform"
              >
                <CheckCircle className="w-6 h-6 mr-2" />
                Отдать заказ
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
