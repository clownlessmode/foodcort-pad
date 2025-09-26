import { io, Socket } from "socket.io-client";

export class OrdersWebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private newOrderAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private audioContext: AudioContext | null = null;

  // Конфигурация аудио форматов с приоритетом
  private audioFormats = [
    { ext: "mp3", mime: "audio/mpeg", priority: 1 },
    { ext: "aac", mime: "audio/aac", priority: 2 },
    { ext: "wav", mime: "audio/wav", priority: 3 },
    { ext: "aiff", mime: "audio/aiff", priority: 4 },
    { ext: "wma", mime: "audio/x-ms-wma", priority: 5 },
  ];

  // Heartbeat и переподключение
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 секунда
  private maxReconnectDelay = 30000; // 30 секунд
  private heartbeatIntervalMs = 30000; // 30 секунд
  private lastHeartbeat = Date.now();
  private isManualDisconnect = false;

  constructor(
    private serverUrl: string = process.env.NEXT_PUBLIC_API_URL || ""
  ) {
    // Настраиваем звук для новых заказов (в браузере)
    if (typeof window !== "undefined") {
      try {
        const audioPath = this.getAudioPath();
        if (audioPath) {
          console.log(`🔊 Инициализация аудио в конструкторе: ${audioPath}`);
          this.newOrderAudio = new Audio(audioPath);
          this.newOrderAudio.preload = "auto";
          this.newOrderAudio.volume = 1.0;
          try {
            this.newOrderAudio.setAttribute("playsinline", "true");
            (this.newOrderAudio as any).webkitPlaysInline = true;
          } catch {}
        } else {
          console.warn(
            "⚠️ Не удалось определить поддерживаемый аудио формат в конструкторе"
          );
        }
      } catch (e) {
        console.warn("⚠️ Не удалось инициализировать звук нового заказа:", e);
      }

      // Добавляем обработчик видимости страницы для переподключения
      this.setupVisibilityHandlers();
    }
  }

  // Настройка обработчиков видимости страницы
  private setupVisibilityHandlers(): void {
    if (typeof document === "undefined") return;

    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        !this.isConnected &&
        !this.isManualDisconnect
      ) {
        console.log("👁️ Страница стала видимой, пытаемся переподключиться...");
        this.connect();
      }
    });
  }

  // Запуск heartbeat
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        // Отправляем ping
        this.socket.emit("ping");
        console.log("💓 Heartbeat отправлен");

        // Проверяем, получили ли мы pong в последние 60 секунд
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
        if (timeSinceLastHeartbeat > 60000) {
          console.warn("⚠️ Heartbeat timeout, переподключаемся...");
          this.handleDisconnection();
        }
      }
    }, this.heartbeatIntervalMs);
  }

  // Остановка heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Обработка отключения
  private handleDisconnection(): void {
    this.isConnected = false;
    this.stopHeartbeat();

    if (
      !this.isManualDisconnect &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.scheduleReconnect();
    }
  }

  // Планирование переподключения с экспоненциальной задержкой
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(
      `🔄 Переподключение через ${delay}ms (попытка ${
        this.reconnectAttempts + 1
      }/${this.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error("❌ Ошибка переподключения:", error);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          console.error(
            "❌ Максимальное количество попыток переподключения достигнуто"
          );
        }
      });
    }, delay);
  }

  // Сброс счетчика попыток переподключения
  private resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Проверка поддержки аудио форматов браузером
  private getSupportedAudioFormat(): string | null {
    if (typeof window === "undefined") return null;

    const audio = document.createElement("audio");

    for (const format of this.audioFormats) {
      if (audio.canPlayType(format.mime) !== "") {
        console.log(`✅ Поддерживается формат: ${format.ext} (${format.mime})`);
        return format.ext;
      }
    }

    console.warn("⚠️ Ни один аудио формат не поддерживается браузером");
    return null;
  }

  // Получение пути к аудио файлу с учетом поддерживаемого формата
  private getAudioPath(): string | null {
    const supportedFormat = this.getSupportedAudioFormat();
    if (!supportedFormat) return null;

    const prefixRaw = ((window as any).__NEXT_DATA__?.assetPrefix ||
      (window as any).__NEXT_DATA__?.basePath ||
      process.env.NEXT_PUBLIC_BASE_PATH ||
      "") as string;
    const prefix = prefixRaw.replace(/\/$/, "");

    return `${prefix}/neworder.${supportedFormat}`;
  }

  // Вызывать из обработчика жеста пользователя, чтобы разблокировать звук на iOS/Android
  async unlockAudio(): Promise<boolean> {
    if (this.audioUnlocked) return true;
    try {
      if (!this.newOrderAudio && typeof window !== "undefined") {
        const audioPath = this.getAudioPath();
        if (!audioPath) {
          console.warn("⚠️ Не удалось определить поддерживаемый аудио формат");
          return false;
        }

        console.log(`🔊 Инициализация аудио: ${audioPath}`);
        this.newOrderAudio = new Audio(audioPath);
        this.newOrderAudio.preload = "auto";
        try {
          this.newOrderAudio.setAttribute("playsinline", "true");
          (this.newOrderAudio as any).webkitPlaysInline = true;
        } catch {}
      }
      if (!this.newOrderAudio) return false;
      this.newOrderAudio.muted = true;
      await this.newOrderAudio.play();
      this.newOrderAudio.pause();
      this.newOrderAudio.currentTime = 0;
      this.newOrderAudio.muted = false;
      this.audioUnlocked = true;
      console.log("🔊 Звук разблокирован пользователем");
      return true;
    } catch (e) {
      console.warn("⚠️ Не удалось разблокировать звук (HTMLAudio):", e);
      try {
        const Ctx =
          (window as any)?.AudioContext || (window as any)?.webkitAudioContext;
        if (Ctx) {
          this.audioContext = this.audioContext || new Ctx();
          await (this.audioContext as AudioContext).resume();
          this.audioUnlocked = true;
          console.log("🔊 WebAudio разблокирован пользователем");
          return true;
        }
      } catch (e2) {
        console.warn("⚠️ Не удалось разблокировать WebAudio:", e2);
      }
      return false;
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isManualDisconnect = false; // Сбрасываем флаг ручного отключения
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
        reconnection: false, // Отключаем встроенное переподключение, используем свое
        reconnectionAttempts: 0,
        reconnectionDelay: 0,
      });

      this.socket.on("connect", () => {
        this.isConnected = true;
        this.resetReconnectAttempts(); // Сбрасываем счетчик попыток при успешном подключении
        console.log("✅ Подключен к серверу заказов");
        console.log("🔗 Socket ID:", this.socket?.id);
        const transportName = (this.socket as any)?.io?.engine?.transport?.name;
        console.log("🔗 Transport:", transportName);

        // Запускаем heartbeat
        this.startHeartbeat();

        // Автоматически запрашиваем список заказов при подключении
        this.socket?.emit("get_orders");
        console.log("📋 Запрашиваем список заказов...");

        resolve();
      });

      // Обработчик подтверждения подключения от сервера
      this.socket.on("connection_confirmed", (data) => {
        console.log("🔗 Подтверждение подключения от сервера:", data);
      });

      // Обработчик pong для heartbeat
      this.socket.on("pong", () => {
        this.lastHeartbeat = Date.now();
        console.log("💓 Pong получен");
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
        console.log("❌ ===== ОТКЛЮЧЕНИЕ =====");
        console.log("❌ Причина:", reason);
        console.log("❌ ===== КОНЕЦ ОТКЛЮЧЕНИЯ =====");
        this.handleDisconnection();
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
    this.isManualDisconnect = true;
    this.stopHeartbeat();
    this.resetReconnectAttempts();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }

    console.log("🔌 Ручное отключение от WebSocket");
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
        // Проиграть звук с fallback
        void this.playNewOrderSound();
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

  // Принудительное переподключение
  forceReconnect(): Promise<void> {
    console.log("🔄 Принудительное переподключение...");
    this.disconnect();
    return this.connect();
  }

  // Получение статистики подключения
  getConnectionStats(): {
    isConnected: boolean;
    reconnectAttempts: number;
    lastHeartbeat: number;
    isManualDisconnect: boolean;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastHeartbeat: this.lastHeartbeat,
      isManualDisconnect: this.isManualDisconnect,
    };
  }

  // Получение информации о поддерживаемых аудио форматах
  getAudioFormatInfo(): {
    supportedFormat: string | null;
    audioPath: string | null;
    allFormats: Array<{ ext: string; mime: string; supported: boolean }>;
  } {
    const supportedFormat = this.getSupportedAudioFormat();
    const audioPath = this.getAudioPath();

    const allFormats = this.audioFormats.map((format) => ({
      ext: format.ext,
      mime: format.mime,
      supported:
        typeof window !== "undefined" &&
        document.createElement("audio").canPlayType(format.mime) !== "",
    }));

    return {
      supportedFormat,
      audioPath,
      allFormats,
    };
  }

  // Ручное проигрывание звука с fallback
  async playNewOrderSound(): Promise<boolean> {
    try {
      if (typeof window !== "undefined" && !this.newOrderAudio) {
        const audioPath = this.getAudioPath();
        if (!audioPath) {
          console.warn(
            "⚠️ Не удалось определить поддерживаемый аудио формат для воспроизведения"
          );
          return false;
        }

        console.log(`🔊 Создание аудио для воспроизведения: ${audioPath}`);
        this.newOrderAudio = new Audio(audioPath);
        this.newOrderAudio.preload = "auto";
        try {
          this.newOrderAudio.setAttribute("playsinline", "true");
          (this.newOrderAudio as any).webkitPlaysInline = true;
        } catch {}
      }
      if (this.newOrderAudio) {
        this.newOrderAudio.currentTime = 0;
        await this.newOrderAudio.play();
        return true;
      }
    } catch (e) {
      console.warn(
        "⚠️ Проигрывание mp3 не удалось, пробуем WebAudio fallback:",
        e
      );
    }

    try {
      const Ctx =
        (window as any)?.AudioContext || (window as any)?.webkitAudioContext;
      if (!Ctx) return false;
      this.audioContext = this.audioContext || new Ctx();
      await (this.audioContext as AudioContext).resume();

      const durationSec = 0.5; // Увеличиваем длительность
      const ctx = this.audioContext as AudioContext;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;

      // Увеличиваем громкость fallback звука
      gainNode.gain.value = 0.1; // Начальная громкость выше
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;

      // Более заметный звук с резким началом и плавным затуханием
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.8, now + 0.05); // Максимальная громкость
      gainNode.gain.exponentialRampToValueAtTime(0.1, now + durationSec);

      oscillator.start(now);
      oscillator.stop(now + durationSec);

      console.log("🔊 WebAudio fallback воспроизведен (громкий)");
      return true;
    } catch (e2) {
      console.warn("⚠️ WebAudio fallback не сработал:", e2);
      return false;
    }
  }
}
