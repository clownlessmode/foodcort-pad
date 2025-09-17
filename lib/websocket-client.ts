import { io, Socket } from "socket.io-client";

export class OrdersWebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;

  constructor(
    private serverUrl: string = process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
      "http://localhost:3006"
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(`${this.serverUrl}/orders`, {
        transports: ["websocket"],
        timeout: 20000,
      });

      this.socket.on("connect", () => {
        this.isConnected = true;
        console.log("✅ Подключен к серверу заказов");

        // Автоматически запрашиваем список заказов при подключении
        this.socket?.emit("get_orders");
        console.log("📋 Запрашиваем список заказов...");

        resolve();
      });

      // Обработчик подтверждения подключения от сервера
      this.socket.on("connection_confirmed", (data) => {
        console.log("🔗 Подтверждение подключения от сервера:", data);
      });

      this.socket.on("connect_error", (error) => {
        console.error("❌ Ошибка подключения к серверу заказов:", error);
        reject(error);
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        console.log("❌ Отключен от сервера заказов. Причина:", reason);
      });

      // Обработчик ошибок WebSocket
      this.socket.on("error", (error) => {
        console.error("❌ Ошибка WebSocket:", error);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  updateOrderStatus(orderId: number, status: string): void {
    if (!this.socket) return;
    this.socket.emit("update_order_status", { orderId, status });
  }

  getOrders(): void {
    this.socket?.emit("get_orders");
  }

  onNewOrder(callback: (order: unknown) => void): void {
    if (this.socket) {
      this.socket.on("new_order", callback);
    }
  }

  onOrderStatusUpdate(
    callback: (data: {
      orderId: number;
      status: string;
      updatedBy: string;
      timestamp: string;
    }) => void
  ): void {
    if (this.socket) {
      this.socket.on("order_status_updated", callback);
    }
  }

  onOrdersList(callback: (orders: unknown[]) => void): void {
    if (this.socket) {
      this.socket.on("orders_list", callback);
    }
  }

  onConnectionConfirmed(
    callback: (data: {
      message: string;
      clientId: string;
      timestamp: string;
    }) => void
  ): void {
    if (this.socket) {
      this.socket.on("connection_confirmed", callback);
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
