"use client";

import { useEffect } from "react";
import { APP_VERSION } from "../lib/app-version";

const RELOAD_KEY = "war-app-version-reload";

type VersionResponse = { version?: string };

export function VersionGuard() {
  useEffect(() => {
    let active = true;

    async function checkVersion() {
      try {
        const response = await fetch(`/version.json?check=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" }
        });
        if (!response.ok) return;

        const payload = await response.json() as VersionResponse;
        const serverVersion = payload.version?.trim();
        if (!active || !serverVersion) return;

        if (serverVersion === APP_VERSION) {
          sessionStorage.removeItem(RELOAD_KEY);
          const url = new URL(window.location.href);
          if (url.searchParams.has("app_version")) {
            url.searchParams.delete("app_version");
            window.history.replaceState({}, "", url.toString());
          }
          return;
        }

        if (sessionStorage.getItem(RELOAD_KEY) === serverVersion) return;
        sessionStorage.setItem(RELOAD_KEY, serverVersion);

        const url = new URL(window.location.href);
        url.searchParams.set("app_version", serverVersion);
        window.location.replace(url.toString());
      } catch {
        // Version checks must not block the application when the endpoint is unavailable.
      }
    }

    void checkVersion();
    return () => { active = false; };
  }, []);

  return <span className="version-label" aria-label={`Versi aplikasi ${APP_VERSION}`}>v{APP_VERSION}</span>;
}
