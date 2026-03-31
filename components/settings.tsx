import { Button } from "./ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "./ui/form";
import { useForm } from "react-hook-form";
import { Input } from "./ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { TvIcon, PlusIcon, TrashIcon, Pencil, Check, X } from "lucide-react";

type TerminalData = {
  idStore: number;
  nameStore?: string;
  code: string;
  tvCode?: string[];
};

type FormValues = {
  "terminal-code": string;
  "tv-code": string[];
};

type ApiResponse = {
  idStore?: number;
  nameStore?: string;
  success?: boolean;
  message?: string;
};

export const Settings = () => {
  const [idStore, setIdStore] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [tvInput, setTvInput] = useState<string>("");
  const [nameStore, setNameStore] = useState<string>("");
  const form = useForm<FormValues>({
    defaultValues: {
      "terminal-code": "",
      "tv-code": [],
    },
  });

  // Нормализация кодов телевизоров для совместимости с старым форматом
  const normalizeTvCodes = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(String).filter((s) => s.trim().length > 0);
    }
    if (typeof value === "string") {
      const parts = value
        .split(/[^0-9]+/g)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts;
    }
    return [];
  };

  // Получение данных из localStorage
  const getTerminalData = (): TerminalData | null => {
    if (typeof window === "undefined") return null;

    try {
      const data = localStorage.getItem("terminal");
      if (data) {
        return JSON.parse(data) as TerminalData;
      }
    } catch (e) {
      console.warn("Ошибка при парсинге данных из localStorage:", e);
    }
    return null;
  };

  // Сохранение данных в localStorage
  const saveTerminalData = (data: TerminalData) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("terminal", JSON.stringify(data));
      window.dispatchEvent(new Event("localStorageChange"));
    } catch (e) {
      console.warn("Ошибка при сохранении данных в localStorage:", e);
    }
  };

  const terminalCode = form.watch("terminal-code") || "";
  const tvCode = normalizeTvCodes(form.watch("tv-code"));

  // Получение данных из localStorage при монтировании компонента
  useEffect(() => {
    const terminalData = getTerminalData();
    if (terminalData) {
      const rawTvCode = (terminalData as any).tvCode;
      const normalizedTvCode = normalizeTvCodes(rawTvCode);

      form.setValue("terminal-code", terminalData.code || "");
      form.setValue("tv-code", normalizedTvCode);
      setIdStore(terminalData.idStore ? Number(terminalData.idStore) : null);
      setNameStore(terminalData.nameStore || "");

      // Миграция старого формата localStorage (tvCode мог быть строкой)
      if (typeof rawTvCode === "string") {
        saveTerminalData({
          idStore: terminalData.idStore,
          nameStore: terminalData.nameStore,
          code: terminalData.code,
          tvCode: normalizedTvCode,
        });
      }
    }
  }, [form]);

  // Сохранение кода терминала
  const handleSaveTerminalCode = async () => {
    if (terminalCode.length !== 4) {
      return;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
      const url = `${baseUrl}/device-communication/find-one-terminal-pad/${terminalCode}`;

      const response = await fetch(url);
      const data = (await response.json()) as ApiResponse;

      if (data.idStore && data.nameStore && data.success) {
        setIdStore(data.idStore);
        setNameStore(data.nameStore);
        saveTerminalData({
          idStore: data.idStore,
          nameStore: data.nameStore,
          code: terminalCode,
        });
        setEditMode(false);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Ошибка при сохранении кода терминала");
    }
  };

  const handleSaveCountTv = async () => {
    if (!idStore) {
      return;
    }
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
      const url = `${baseUrl}/banner-tv/set-count-tv`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idStore: Number(idStore),
          count: tvCode.length * 2,
        }),
      });
    } catch (error) {
      console.error("Ошибка при сохранении количества телевизоров:", error);
    }
  };

  useEffect(() => {
    handleSaveCountTv();
  }, [tvCode?.length, idStore]);

  // Сохранение кода телевизора
  const handleSaveTvCode = async () => {
    if (tvInput.length !== 4 || !idStore) {
      return;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
      const url = `${baseUrl}/device-communication/find-one-tv-pad`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idStore,
          code: tvInput,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as ApiResponse;
      const ok = data.success ?? response.ok;

      if (!ok) {
        toast.error(data.message || "Ошибка при сохранении кода телевизора");
        return;
      }

      const normalizedTvCode = tvInput.trim();
      const nextTvCodes = Array.from(new Set([...tvCode, normalizedTvCode]));

      form.setValue("tv-code", nextTvCodes);
      saveTerminalData({
        idStore: Number(idStore),
        nameStore: nameStore || "",
        code: terminalCode,
        tvCode: nextTvCodes,
      });

      setTvInput("");
    } catch (error) {
      toast.error("Ошибка при сохранении кода телевизора");
    }
  };

  // Обработка ввода только цифр
  const handleNumericInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldOnChange: (value: string) => void,
  ) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 4) {
      fieldOnChange(value);
    }
  };

  // Удаление кода телевизора
  const handleDeleteTvCode = (code: string) => {
    const nextTvCodes = tvCode.filter((c) => c !== code);
    if (idStore) {
      saveTerminalData({
        idStore: Number(idStore),
        code: terminalCode,
        nameStore: nameStore,
        tvCode: nextTvCodes,
      });
    }
    form.setValue("tv-code", nextTvCodes);
  };

  return (
    <form className="w-[80%] mx-auto min-h-[60vh] flex flex-col items-center justify-center gap-20">
      <Form {...form}>
        {idStore && !editMode && (
          <div className="w-full text-4xl font-semibold flex gap-4 items-center justify-center">
            {nameStore || "Без названия"}
            <div className="flex gap-4"></div>
            <Button
              type="button"
              className="text-2xl h-12"
              onClick={() => setEditMode(true)}
            >
              <Pencil className="size-6" />
            </Button>
            {idStore && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" className="text-2xl h-12">
                    <TvIcon className="size-6" />
                  </Button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Подключение телевизоров</DialogTitle>
                  </DialogHeader>
                  <div className="w-full grid grid-cols-[max-content_1fr_max-content] gap-4 items-center">
                    <FormLabel className="w-full text-xl font-semibold">
                      Код TV
                    </FormLabel>
                    <FormControl>
                      <Input
                        value={tvInput}
                        className="border-1 border-primary rounded-lg"
                        onChange={(e) => handleNumericInput(e, setTvInput)}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      disabled={tvInput.length !== 4}
                      onClick={handleSaveTvCode}
                    >
                      <PlusIcon className="size-4" /> Добавить
                    </Button>
                  </div>
                  <div className="w-full gap-4 grid auto-cols-max grid-flow-col overflow-x-auto">
                    {tvCode.length === 0 ? (
                      <div className="text-muted-foreground">
                        TV пока не добавлены
                      </div>
                    ) : (
                      tvCode.map((code, idx) => (
                        <div
                          key={`${code}-${idx}`}
                          className="text-xl flex items-center gap-0"
                        >
                          TV {idx + 1}-{idx + 2}
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteTvCode(code)}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
        {(editMode || !idStore) && (
          <FormField
            control={form.control}
            name="terminal-code"
            render={({ field }) => (
              <FormItem className="w-full grid grid-cols-[max-content_1fr_max-content_max-content] gap-4 items-center">
                <FormLabel className="text-4xl font-semibold w-full gap-0">
                  Код терминала
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    className="h-12 text-2xl! font-semibold border-1 border-primary rounded-lg"
                    onChange={(e) => handleNumericInput(e, field.onChange)}
                  />
                </FormControl>
                <Button
                  type="button"
                  className="text-2xl h-12"
                  onClick={() => setEditMode(false)}
                >
                  <X className="size-6" />
                </Button>
                <Button
                  type="button"
                  className="text-2xl h-12"
                  onClick={handleSaveTerminalCode}
                  disabled={terminalCode.length !== 4}
                >
                  <Check className="size-6" />
                </Button>
              </FormItem>
            )}
          />
        )}
      </Form>
    </form>
  );
};
