import {
    Bell,
    Menu,
    Search,
} from "lucide-react";

import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

import { useNavigate } from "react-router-dom";


interface HeaderProps {
    onMobileMenu: () => void;
}

export default function Header({
    onMobileMenu,
}: HeaderProps) {
    const navigate = useNavigate();

    const [notificationCount, setNotificationCount] =
        useState(0);

    useEffect(() => {
        let cancelled = false;

        async function loadNotificationCount() {
            try {
                const notifications =
                    await apiRequest<
                        Array<{
                            project_code: number | string;
                            warning_count?: number;
                        }>
                    >("/early-warnings/projects");

                if (cancelled) return;

                const readIds = new Set<string>();

                try {
                    const stored = JSON.parse(
                        localStorage.getItem(
                            "paimana-notification-read",
                        ) || "[]",
                    );

                    if (Array.isArray(stored)) {
                        stored.forEach((id) =>
                            readIds.add(String(id)),
                        );
                    }
                } catch {
                    // Ignore invalid local storage.
                }

                const unreadCount =
                    notifications.filter(
                        (notification) =>
                            !readIds.has(
                                `EW-${String(
                                    notification.project_code,
                                )
                                    .replace(/^PM-/i, "")
                                    .trim()}`,
                            ),
                    ).length;

                setNotificationCount(unreadCount);
            } catch (error) {
                console.error(
                    "Notification count loading failed:",
                    error,
                );
            }
        }

        loadNotificationCount();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:h-[76px] sm:px-5 lg:px-7">
            {/* Left */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={onMobileMenu}
                    aria-label="Open navigation"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
                >
                    <Menu size={20} />
                </button>

                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 sm:max-w-[360px]">
                    <Search
                        size={16}
                        className="shrink-0 text-slate-400"
                    />

                    <input
                        type="search"
                        placeholder="Search projects..."
                        className="min-w-0 w-full bg-transparent py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />

                    <span className="hidden h-6 min-w-6 shrink-0 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400 sm:grid">
                        /
                    </span>
                </div>
            </div>

            {/* Right */}
            <div className="ml-2 flex shrink-0 items-center gap-2 sm:gap-4">
                <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() =>
                        navigate("/notifications")
                    }
                    className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                    <Bell size={18} />

                    {notificationCount > 0 && (
                        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[8px] font-bold leading-4 text-white">
                            {notificationCount > 99
                                ? "99+"
                                : notificationCount}
                        </span>
)}
                </button>

                <div className="hidden h-7 w-px bg-slate-200 sm:block" />

                <button
                    type="button"
                    className="flex items-center gap-2"
                >
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        A
                    </div>

                    <div className="hidden text-left lg:block">
                        <div className="text-xs font-semibold text-slate-800">
                            Administrator
                        </div>

                        <div className="text-[10px] text-slate-400">
                            PAIMANA Monitoring
                        </div>
                    </div>
                </button>
            </div>
        </header>
    );
}