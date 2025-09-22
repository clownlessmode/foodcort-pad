"use client";

import { useEffect } from "react";

export default function PwaSwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const swUrl = "/grill-terminal/service-worker.js";
    navigator.serviceWorker
      .register(swUrl)
      .then(() => {
        // Registered
      })
      .catch((err) => {
        console.error("SW registration failed", err);
      });
  }, []);

  return null;
}
