"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const ONE_YEAR = 60 * 60 * 24 * 365;

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Switches between light and dark mode. Without a choice the site follows the device. */
export function ThemeToggle({ variant = "button" }: { variant?: "button" | "menu" }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(currentTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setTheme(next);
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const icon = theme === "dark" ? <Sun size={variant === "menu" ? 20 : 16} aria-hidden="true" /> : <Moon size={variant === "menu" ? 20 : 16} aria-hidden="true" />;
  if (variant === "menu") {
    return (
      <button type="button" onClick={toggle} className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-ink hover:bg-surface">
        {icon}
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} className="btn btn-sm" aria-label={label} title={label}>
      {icon}
    </button>
  );
}
