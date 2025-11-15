import { useMemo } from "react";

const CLIENT_KEY = "saifur-auction:clientId";

const createClientId = () => {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const useClientId = () => {
  return useMemo(() => {
    if (typeof window === "undefined") return "";

    const existing = window.localStorage.getItem(CLIENT_KEY);
    if (existing) {
      return existing;
    }

    const next = createClientId();
    window.localStorage.setItem(CLIENT_KEY, next);
    return next;
  }, []);
};
