import {
    Bell,
    ChevronDown,
    Menu,
    Search,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import {
    useEffect,
    useState,
} from "react";

import {
    getActiveWarnings,
} from "../../services/warningsApi";

interface HeaderProps {
    onMobileMenu: () => void;
}

export default function Header({
    onMobileMenu,
}: HeaderProps) {
    const navigate = useNavigate();

    const [
        activeWarningCount,
        setActiveWarningCount,
    ] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const loadActiveWarnings =
            async () => {
                try {
                    const warnings =
                        await getActiveWarnings();

                    if (!cancelled) {
                        setActiveWarningCount(
                            warnings.length,
                        );
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
        <header
            className="
                sticky top-3 z-30
                flex h-[62px] items-center
                justify-between
                rounded-[14px]
                border border-[#D9E1E8]
                bg-white
                px-3
                shadow-[0_4px_16px_rgba(15,23,42,0.05)]
                sm:h-[66px] sm:px-4
                lg:px-5
            "
        >
            {/* =====================================================
               LEFT
            ====================================================== */}

            <div
                className="
                    flex min-w-0 flex-1
                    items-center gap-2
                    sm:gap-3
                "
            >
                {/* Mobile menu */}

                <button
                    type="button"
                    onClick={onMobileMenu}
                    aria-label="Open navigation"
                    className="
                        grid h-9 w-9 shrink-0
                        place-items-center
                        rounded-[9px]
                        text-[#64748B]
                        transition-colors
                        hover:bg-[#EEF2F5]
                        hover:text-[#172033]
                        md:hidden
                    "
                >
                    <Menu
                        size={18}
                        strokeWidth={1.8}
                    />
                </button>


                {/* Global search */}

                <div
                    className="
                        flex min-w-0 flex-1
                        items-center gap-2.5
                        rounded-[10px]
                        border border-[#D9E1E8]
                        bg-[#F8FAFB]
                        px-3
                        shadow-[0_1px_2px_rgba(15,23,42,0.02)]
                        transition-[border-color,background,box-shadow]
                        duration-150
                        focus-within:border-[#B7C3CF]
                        focus-within:bg-white
                        focus-within:shadow-[0_2px_8px_rgba(15,23,42,0.04)]
                        sm:max-w-[430px]
                    "
                >
                    <Search
                        size={16}
                        strokeWidth={1.8}
                        className="
                            shrink-0
                            text-[#94A3B8]
                        "
                    />

                    <input
                        type="search"
                        placeholder="Search projects..."
                        className="
                            min-w-0 w-full
                            bg-transparent
                            py-2.5
                            text-[12px]
                            font-medium
                            text-[#334155]
                            outline-none
                            placeholder:text-[#94A3B8]
                        "
                    />

                    <span
                        className="
                            hidden h-6 min-w-6
                            shrink-0 place-items-center
                            rounded-[6px]
                            border border-[#D9E1E8]
                            bg-white
                            px-1.5
                            text-[9px]
                            font-semibold
                            text-[#94A3B8]
                            shadow-[0_1px_2px_rgba(15,23,42,0.03)]
                            sm:grid
                        "
                    >
                        /
                    </span>
                </div>
            </div>


            {/* =====================================================
               RIGHT
            ====================================================== */}

            <div
                className="
                    ml-3 flex shrink-0
                    items-center
                    gap-1
                    sm:gap-2.5
                "
            >
                {/* Notifications */}

                <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() =>
                        navigate(
                            "/notifications",
                        )
                    }
                    className="
                        relative grid
                        h-9 w-9
                        place-items-center
                        rounded-[9px]
                        text-[#64748B]
                        transition-colors
                        hover:bg-[#EEF2F5]
                        hover:text-[#172033]
                    "
                >
                    <Bell
                        size={18}
                        strokeWidth={1.8}
                    />

                    {activeWarningCount > 0 && (
                        <span
                            className="
                                absolute
                                -right-0.5 -top-0.5
                                grid min-h-4 min-w-4
                                place-items-center
                                rounded-full
                                bg-[#EF4444]
                                px-1
                                text-[8px]
                                font-bold
                                leading-none
                                text-white
                                shadow-sm
                            "
                        >
                            {activeWarningCount > 99
                                ? "99+"
                                : activeWarningCount}
                        </span>
                    )}
                </button>


                {/* Divider */}

                <div
                    className="
                        hidden h-7 w-px
                        bg-[#D9E1E8]
                        sm:block
                    "
                />


                {/* Administrator */}

                <button
                    type="button"
                    className="
                        flex items-center
                        gap-2
                        rounded-[10px]
                        px-1.5 py-1
                        transition-colors
                        hover:bg-[#F8FAFB]
                    "
                >
                    <div
                        className="
                            grid h-8 w-8
                            place-items-center
                            rounded-full
                            bg-[#E8EDF2]
                            text-[10px]
                            font-bold
                            text-[#334155]
                        "
                    >
                        A
                    </div>

                    <div
                        className="
                            hidden text-left
                            lg:block
                        "
                    >
                        <div
                            className="
                                text-[11px]
                                font-bold
                                leading-tight
                                text-[#172033]
                            "
                        >
                            Administrator
                        </div>

                        <div
                            className="
                                mt-0.5
                                text-[9px]
                                font-medium
                                leading-tight
                                text-[#94A3B8]
                            "
                        >
                            NIRMAAN Monitoring
                        </div>
                    </div>

                    <ChevronDown
                        size={14}
                        strokeWidth={1.8}
                        className="
                            hidden
                            text-[#64748B]
                            lg:block
                        "
                    />
                </button>
            </div>
        </header>
    );
}