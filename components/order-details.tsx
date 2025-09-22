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
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-3xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b mb-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="bg-transparent"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">
              Заказ {order.number}
            </h1>
          </div>
          <Badge
            className={`text-sm md:text-base px-3 py-1 ${getStatusColor(
              order.status
            )}`}
          >
            {getStatusText(order.status)}
          </Badge>
        </div>

        {/* Order Meta */}
        {(order.note || order.phoneNumber || order.storeId) && (
          <Card className="p-4 md:p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {order.note && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <StickyNote className="w-4 h-4 text-primary" />
                    <h3 className="text-lg md:text-xl font-semibold">
                      Комментарий
                    </h3>
                  </div>
                  <p className="text-base md:text-lg">{order.note}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="p-4 md:p-6 mb-6">
          <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">
            Состав заказа
          </h2>
          <div className="space-y-4 md:space-y-6">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="border-b border-border pb-4 md:pb-6 last:border-b-0"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg md:text-xl font-semibold text-foreground">
                    {item.name}
                  </h3>
                  <span className="text-lg md:text-xl font-bold text-primary">
                    x{item.quantity}
                  </span>
                </div>

                {item.addons && item.addons.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm md:text-base font-medium text-muted-foreground mb-2">
                      Дополнения:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.addons.map((addon, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs md:text-sm px-2 py-0.5"
                        >
                          {addon}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {item.comment && (
                  <div className="bg-muted p-3 md:p-4 rounded-lg">
                    <p className="text-sm md:text-base font-medium text-muted-foreground mb-1 md:mb-2">
                      Комментарий:
                    </p>
                    <p className="text-base md:text-lg text-foreground">
                      {item.comment}
                    </p>
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
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-2 flex items-center justify-between gap-4">
          <div className="grid grid-cols-2 gap-4 w-full md:flex-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <span className="text-base md:text-lg font-semibold text-foreground">
                {formatElapsedTime(order.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <Badge
                className={`text-xs px-2 py-0.5 ${
                  order.receivingMethod === "delivery"
                    ? "bg-blue-500"
                    : "bg-amber-500"
                } text-white`}
              >
                {order.receivingMethod === "delivery" ? "В пакете" : "В зале"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {order.status === "new" && (
              <Button
                onClick={handleComplete}
                className="px-4 py-2 text-sm md:text-base hover:scale-[1.02] transition-transform"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Отметить готовым
              </Button>
            )}
            {order.status === "new" && (
              <Button
                variant="destructive"
                onClick={handleCancel}
                className="px-4 py-2 text-sm md:text-base hover:scale-[1.02] transition-transform"
              >
                <XCircle className="w-5 h-5 mr-2" />
                Отменить
              </Button>
            )}
            {order.status === "completed" && (
              <Button
                onClick={handleDeliver}
                className="px-4 py-2 text-sm md:text-base hover:scale-[1.02] transition-transform"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Отдать заказ
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
