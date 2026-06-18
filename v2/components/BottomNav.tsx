"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  isActive: (path: string) => boolean;
  icon: React.ReactNode;
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Search",
    isActive: (p) => p === "/" || p.startsWith("/clients") || p.startsWith("/intake"),
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    isActive: (p) => p.startsWith("/schedule"),
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
  {
    href: "/inbox",
    label: "Messages",
    isActive: (p) => p.startsWith("/inbox"),
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M4 5h16v11H7l-3 3V5Z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-line bg-surface/95 shadow-[0_-12px_28px_rgba(28,27,34,0.08)] backdrop-blur nav-safe md:max-w-3xl lg:max-w-4xl">
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs ${
                  active ? "font-semibold text-brand" : "font-medium text-ink-faint"
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
