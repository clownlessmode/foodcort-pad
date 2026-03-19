import { io, Socket } from "socket.io-client";

export class OrdersWebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private newOrderAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private audioContext: AudioContext | null = null;
  private idStore: number | null = null;
  private storageWatcherInitialized = false;

  // Конфигурация аудио форматов с приоритетом
  private audioFormats = [
    { ext: "mp3", mime: "audio/mpeg", priority: 1 },
    { ext: "aac", mime: "audio/aac", priority: 2 },
    { ext: "wav", mime: "audio/wav", priority: 3 },
    { ext: "aiff", mime: "audio/aiff", priority: 4 },
    { ext: "wma", mime: "audio/x-ms-wma", priority: 5 },
  ];

  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 секунда
  private maxReconnectDelay = 30000; // 30 секунд
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
      
      // Добавляем отслеживание изменений localStorage
      this.setupLocalStorageWatcher();
    }
  }

  // Настройка отслеживания изменений localStorage
  private setupLocalStorageWatcher(): void {
    if (this.storageWatcherInitialized) return;
    this.storageWatcherInitialized = true;

    const checkAndReconnect = () => {
      const newIdStore = this.getIdStore();
      
      // Если idStore появился и его не было раньше
      if (newIdStore && !this.idStore) {
        console.log("🔄 Обнаружен idStore в localStorage, подключаемся...");
        
        // Подключаемся
        this.connect().catch((error) => {
          console.error("❌ Ошибка при автоматическом подключении:", error);
        });
      }
      // Если idStore изменился и мы уже подключены
      else if (newIdStore && this.idStore && newIdStore !== this.idStore) {
        console.log("🔄 idStore изменился, переподключаемся...");
        
        // Отключаемся и подключаемся заново
        this.disconnect();
        this.connect().catch((error) => {
          console.error("❌ Ошибка при автоматическом переподключении:", error);
        });
      }
      // Если idStore появился, но мы не подключены
      else if (newIdStore && !this.isConnected) {
        console.log("🔄 idStore найден, но нет подключения, подключаемся...");
        
        this.connect().catch((error) => {
          console.error("❌ Ошибка при автоматическом подключении:", error);
        });
      }
    };

    // Слушаем изменения из других вкладок/окон
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "terminal" || e.key === null) {
        checkAndReconnect();
      }
    };

    // Слушаем изменения в текущей вкладке
    const handleCustomChange = () => {
      checkAndReconnect();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("localStorageChange", handleCustomChange);
  }
  
  // Настройка обработчиков видимости страницы
  private setupVisibilityHandlers(): void {
    if (typeof document === "undefined") return;

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !this.isManualDisconnect) {
        console.log("👁️ Страница стала видимой, проверяем соединение...");
        
        // Если сокет физически отключен, но мы думаем, что подключены
        if (this.socket && !this.socket.connected) {
          console.log("🔄 Сокет разорван, переподключаемся...");
          this.forceReconnect();
        } 
        // Если вообще нет сокета или мы знаем, что отключены
        else if (!this.isConnected || !this.socket) {
          console.log("🔄 Нет подключения, подключаемся...");
          this.connect();
        } else {
          // Если сокет жив, на всякий случай запрашиваем актуальный список заказов
          // так как за время сна могли прийти новые заказы, а события потеряться
          console.log("🔄 Сокет жив, запрашиваем актуальный список заказов...");
          this.getOrders();
        }
      }
    });
  }

  private handleDisconnection(): void {
    this.isConnected = false;

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

    return `${prefix}/grill-terminal/neworder.${supportedFormat}`;
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

  private getIdStore(): number | null {
    if (typeof window === "undefined") return null;

    try {
      const terminalDataStr = localStorage.getItem("terminal");
      if (terminalDataStr) {
        const terminalData = JSON.parse(terminalDataStr);
        return terminalData.idStore || null;
      }
    } catch (e) {
      console.warn("Ошибка при получении idStore:", e);
    }
    return null;
  }

  connect(): Promise<void> {
    this.idStore = this.getIdStore();
    if (!this.idStore) {
      return Promise.reject(new Error("Нет idStore в localStorage"));
    }

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
        reconnection: true,
        reconnectionAttempts: Infinity, // Бесконечные попытки переподключения
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000, // Максимальная задержка 10 секунд
        randomizationFactor: 0.5,
      });

      this.socket.on("connect", () => {
        this.isConnected = true;
        this.resetReconnectAttempts(); // Сбрасываем счетчик попыток при успешном подключении
        console.log("✅ Подключен к серверу заказов");
        console.log("🔗 Socket ID:", this.socket?.id);
        const transportName = (this.socket as any)?.io?.engine?.transport?.name;
        console.log("🔗 Transport:", transportName);

        this.idStore = this.getIdStore();
        if (this.idStore) {
          // Автоматически запрашиваем список заказов при подключении
          this.socket?.emit("get_orders", this.idStore);
          console.log("📋 Запрашиваем список заказов...");
        } else {
          console.error("❌ Не удалось получить получить данные о заказах");
        }

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
        console.log("❌ ===== ОТКЛЮЧЕНИЕ =====");
        console.log("❌ Причина:", reason);
        console.log("❌ ===== КОНЕЦ ОТКЛЮЧЕНИЯ =====");

        this.isConnected = false;

        if (!this.isManualDisconnect) {
          this.handleDisconnection();
        }
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
    this.socket?.emit("get_orders", this.idStore);
  }

  onNewOrder(callback: (order: unknown) => void): void {
    if (this.socket) {
      this.idStore = this.getIdStore();

      if (this.idStore) {
        this.socket.on(`new_order_${this.idStore}`, (order: unknown) => {
          try {
            console.log("🧾 Получен заказ (new_order):", order);
          } catch {}
          // Проиграть звук с fallback
          void this.playNewOrderSound();
          callback(order);
        });
      } else {
        console.error("❌ Не удалось получить получить данные о заказах");
      }
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
      this.socket.on(`orders_list_${this.idStore}`, (orders: unknown[]) => {
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
    isManualDisconnect: boolean;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
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
