import {
    Bell,
    Menu,
    Search,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { getActiveWarnings } from "../../services/warningsApi";

interface HeaderProps {
    onMobileMenu: () => void;
}

export default function Header({
    onMobileMenu,
}: HeaderProps) {
    const navigate = useNavigate();

    const [activeWarningCount, setActiveWarningCount] =
        useState(0);

    useEffect(() => {
        let cancelled = false;

        const loadActiveWarnings = async () => {
            try {
                const warnings = await getActiveWarnings();

                if (!cancelled) {
                    setActiveWarningCount(warnings.length);
                }
            } catch {
                if (!cancelled) {
                    setActiveWarningCount(0);
                }
            }
        };

        loadActiveWarnings();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <header className="z-30 mx-3 mt-3 flex h-[70px] items-center justify-between rounded-[18px] border border-slate-200/90 bg-white px-3 shadow-[0_4px_18px_rgba(20,35,55,0.06)] backdrop-blur sm:mx-5 sm:mt-4 sm:h-[76px] sm:px-5 lg:mx-6">

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

                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 sm:max-w-[500px]">

                    <Search
                        size={16}
                        className="shrink-0 text-slate-400"
                    />

                    <input
                        type="search"
                        placeholder="Search projects..."
                        className="min-w-0 w-full bg-transparent py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />

                    <span className="hidden h-7 min-w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400 sm:grid">
                        /
                    </span>
                </div>
            </div>

            {/* Right */}
            <div className="ml-2 flex shrink-0 items-center gap-2 sm:gap-4">

                <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() => navigate("/notifications")}
                    className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                    <Bell size={18} />

                    {activeWarningCount > 0 && (
                        <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                            {activeWarningCount > 99
                                ? "99+"
                                : activeWarningCount}
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
                            NIRMAAN Monitoring
                        </div>
                    </div>
                </button>
            </div>
        </header>
    );
}