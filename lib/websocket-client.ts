import { io, Socket } from "socket.io-client";

export class OrdersWebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private newOrderAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;

  constructor(
    private serverUrl: string = process.env.NEXT_PUBLIC_API_URL || ""
  ) {
    // Настраиваем звук для новых заказов (в браузере)
    if (typeof window !== "undefined") {
      try {
        const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(
          /\/$/,
          ""
        );
        const audioPath = `${base}/neworder.mp3`;
        this.newOrderAudio = new Audio(audioPath);
        this.newOrderAudio.preload = "auto";
        this.newOrderAudio.volume = 1.0;
        try {
          this.newOrderAudio.setAttribute("playsinline", "true");
          (this.newOrderAudio as any).webkitPlaysInline = true;
        } catch {}
      } catch (e) {
        console.warn("⚠️ Не удалось инициализировать звук нового заказа:", e);
      }
    }
  }

  // Вызывать из обработчика жеста пользователя, чтобы разблокировать звук на iOS/Android
  async unlockAudio(): Promise<void> {
    if (!this.newOrderAudio) return;
    if (this.audioUnlocked) return;
    try {
      this.newOrderAudio.muted = true;
      await this.newOrderAudio.play();
      this.newOrderAudio.pause();
      this.newOrderAudio.currentTime = 0;
      this.newOrderAudio.muted = false;
      this.audioUnlocked = true;
      console.log("🔊 Звук разблокирован пользователем");
    } catch (e) {
      console.warn("⚠️ Не удалось разблокировать звук:", e);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Derive origin and socket path from serverUrl
      let origin = this.serverUrl;
      let socketPath = "/socket.io";
      try {
        const parsed = new URL(this.serverUrl);
        origin = `${parsed.protocol}//${parsed.host}`;
        const basePath = parsed.pathname.replace(/\/$/, "");
        socketPath = `${basePath || ""}/socket.io` || "/socket.io";
      } catch (e) {
        console.warn(
          "⚠️ Некорректный NEXT_PUBLIC_API_URL, используем как есть:",
          this.serverUrl
        );
      }

      const namespace = "/orders";
      const namespaceUrl = `${origin}${namespace}`;

      console.log("🔌 Попытка подключения к WebSocket (origin):", origin);
      console.log("🔌 Socket.IO path:", socketPath);
      console.log("🔌 Namespace:", namespace);
      console.log("🔌 Полный URL для namespace:", namespaceUrl);

      this.socket = io(namespaceUrl, {
        transports: ["websocket"],
        path: socketPath,
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on("connect", () => {
        this.isConnected = true;
        console.log("✅ Подключен к серверу заказов");
        console.log("🔗 Socket ID:", this.socket?.id);
        const transportName = (this.socket as any)?.io?.engine?.transport?.name;
        console.log("🔗 Transport:", transportName);

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
        console.error("❌ ===== ОШИБКА ПОДКЛЮЧЕНИЯ =====");
        {
          const errAny = error as any;
          console.error(
            "❌ Тип ошибки:",
            errAny && "type" in errAny ? errAny.type : "неизвестно"
          );
          console.error("❌ Сообщение:", (error as Error).message);
          console.error(
            "❌ Описание:",
            errAny && "description" in errAny
              ? errAny.description
              : "нет описания"
          );
          console.error(
            "❌ Контекст:",
            errAny && "context" in errAny ? errAny.context : "нет контекста"
          );
        }
        console.error("❌ Полная ошибка:", error);
        console.error("❌ URL (origin):", origin);
        console.error("❌ Socket.IO path:", socketPath);
        console.error("❌ Namespace URL:", namespaceUrl);
        console.error("❌ ===== КОНЕЦ ОШИБКИ =====");
        reject(error);
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        console.log("❌ ===== ОТКЛЮЧЕНИЕ =====");
        console.log("❌ Причина:", reason);
        console.log("❌ ===== КОНЕЦ ОТКЛЮЧЕНИЯ =====");
      });

      // Обработчик ошибок WebSocket
      this.socket.on("error", (error) => {
        console.error("❌ ===== ОШИБКА WEBSOCKET =====");
        console.error("❌ Ошибка:", error);
        console.error("❌ Тип:", typeof error);
        console.error("❌ ===== КОНЕЦ ОШИБКИ WEBSOCKET =====");
      });

      // Дополнительные обработчики для диагностики
      this.socket.io.on("error", (ioError: unknown) => {
        console.error("❌ ===== ОШИБКА IO =====");
        console.error("❌ IO Ошибка:", ioError);
        console.error("❌ ===== КОНЕЦ ОШИБКИ IO =====");
      });

      (this.socket as any).io.engine.on("error", (engineError: unknown) => {
        console.error("❌ ===== ОШИБКА ENGINE =====");
        console.error("❌ Engine Ошибка:", engineError);
        console.error("❌ ===== КОНЕЦ ОШИБКИ ENGINE =====");
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
      this.socket.on("new_order", (order: unknown) => {
        try {
          console.log("🧾 Получен заказ (new_order):", order);
        } catch {}
        // Пытаемся проиграть звук прихода нового заказа
        try {
          if (this.newOrderAudio) {
            this.newOrderAudio.currentTime = 0;
            // Некоторые браузеры могут блокировать авто-воспроизведение без взаимодействия пользователя
            const p = this.newOrderAudio.play();
            if (p && typeof p.catch === "function") {
              p.catch(() => {
                // игнорируем ошибку авто-воспроизведения
              });
            }
          }
        } catch {}
        callback(order);
      });
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
      this.socket.on("orders_list", (orders: unknown[]) => {
        try {
          const count = Array.isArray(orders) ? orders.length : 0;
          console.log(
            "📥 Получен начальный список заказов (orders_list), кол-во:",
            count
          );
          if (Array.isArray(orders)) {
            orders.forEach((order) => {
              console.log("🧾 Заказ из начального списка:", order);
            });
          } else {
            console.log("📥 orders_list (raw):", orders);
          }
        } catch {}
        callback(orders);
      });
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

  // Ручное проигрывание звука (для тестовой кнопки)
  playNewOrderSound(): void {
    try {
      if (!this.newOrderAudio) return;
      this.newOrderAudio.currentTime = 0;
      const p = this.newOrderAudio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    } catch {}
  }
}
