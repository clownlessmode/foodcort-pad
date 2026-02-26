import { useEffect, useState } from "react";

export const useLocalStorage = (key: string) => {
  const [value, setValue] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key || e.key === null) {
        setValue(localStorage.getItem(key));
      }
    };

    const handleCustomChange = () => {
      setValue(localStorage.getItem(key));
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("localStorageChange", handleCustomChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("localStorageChange", handleCustomChange);
    };
  }, [key]);

  return value;
};