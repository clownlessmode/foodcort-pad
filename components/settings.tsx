import { Button } from "./ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "./ui/form";
import { useForm } from "react-hook-form";
import { Input } from "./ui/input";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type TerminalData = {
  idStore: number;
  code: string;
  tvCode?: string;
};

type FormValues = {
  "terminal-code": string;
  "tv-code": string;
};

type ApiResponse = {
  idStore?: number;
  success?: boolean;
  message?: string;
};

export const Settings = () => {
  const [idStore, setIdStore] = useState<number | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      "terminal-code": "",
      "tv-code": "",
    },
  });

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
  const tvCode = form.watch("tv-code") || "";

  // Получение данных из localStorage при монтировании компонента
  useEffect(() => {
    const terminalData = getTerminalData();
    if (terminalData) {
      form.setValue("terminal-code", terminalData.code || "");
      form.setValue("tv-code", terminalData.tvCode || "");
      setIdStore(terminalData.idStore ? Number(terminalData.idStore) : null);
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

      if (data.idStore && data.success) {
        setIdStore(data.idStore);
        saveTerminalData({
          idStore: data.idStore,
          code: terminalCode,
        });
      } else {
        toast.error(data.message);
        setIdStore(null);
      }
    } catch (error) {
      toast.error("Ошибка при сохранении кода терминала");
      setIdStore(null);
    }
  };

  // Сохранение кода телевизора
  const handleSaveTvCode = async () => {
    if (tvCode.length !== 4 || !idStore) {
      return;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
      const url = `${baseUrl}/device-communication/find-one-tv-pad`;
      
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idStore,
          code: tvCode,
        }),
      }
      ).then(() => {
        const terminalData = getTerminalData();
        saveTerminalData({
          idStore: terminalData?.idStore || idStore,
          code: terminalData?.code || terminalCode,
          tvCode: tvCode,
        });
      });
    } catch (error) {
      toast.error("Ошибка при сохранении кода телевизора");
    }
  };

  // Обработка ввода только цифр
  const handleNumericInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldOnChange: (value: string) => void
  ) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 4) {
      fieldOnChange(value);
    }
  };

  return (
    <form className="w-[80%] mx-auto min-h-[60vh] flex flex-col items-center justify-center gap-20">
      <Form {...form}>
        <FormField
          control={form.control}
          name="terminal-code"
          render={({ field }) => (
            <FormItem className="w-full grid grid-cols-[max-content_1fr_max-content] gap-4 items-center">
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
                onClick={handleSaveTerminalCode}
                disabled={terminalCode.length !== 4}
              >
                Сохранить
              </Button>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tv-code"
          render={({ field }) => (
            <FormItem className="w-full grid grid-cols-[max-content_1fr_max-content] gap-4 items-center">
              <FormLabel className="text-4xl font-semibold w-full gap-0">
                Код телевизора
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={!idStore}
                  className="h-12 text-2xl! font-semibold border-1 border-primary rounded-lg"
                  onChange={(e) => handleNumericInput(e, field.onChange)}
                />
              </FormControl>
              <Button
                type="button"
                className="text-2xl h-12"
                disabled={!idStore || tvCode.length !== 4}
                onClick={handleSaveTvCode}
              >
                Сохранить
              </Button>
            </FormItem>
          )}
        />
      </Form>
    </form>
  );
};
