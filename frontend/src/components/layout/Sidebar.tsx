import { NavLink } from "react-router-dom";
import { navigationSections } from "../../app/navigation";
import logo from "../../assets/logo.png";

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    onNavigate?: () => void;
}

export default function Sidebar({
    collapsed,
    onToggle,
    onNavigate,
}: SidebarProps) {
    return (
        <aside
            className={[
                "flex h-full flex-col",
                "overflow-hidden",
                "rounded-[16px]",
                "border border-white/[0.08]",
                "bg-gradient-to-b",
                "from-[#2B2C2F]",
                "to-[#222326]",
                "text-white",
                "shadow-[0_14px_36px_rgba(0,0,0,0.20)]",
                "transition-[width] duration-200 ease-out",
                collapsed
                    ? "w-[68px]"
                    : "w-[292px]",
            ].join(" ")}
        >
            {/* =================================================
                BRAND
            ================================================= */}

            <div
                className={[
                    "flex shrink-0 items-center",
                    "border-b border-white/[0.08]",
                    collapsed
                        ? "h-[76px] justify-center px-2"
                        : "h-[76px] px-5",
                ].join(" ")}
            >
                <div
                    className={[
                        "flex min-w-0 items-center",
                        collapsed
                            ? "justify-center"
                            : "gap-3.5",
                    ].join(" ")}
                >
                    <div
                        className="
                            grid h-10 w-10 shrink-0
                            place-items-center
                            overflow-hidden
                            rounded-[11px]
                            bg-white
                            shadow-[0_2px_8px_rgba(0,0,0,0.16)]
                        "
                    >
                        <img
                            src={logo}
                            alt="NIRMAAN AI"
                            className="
                                h-full w-full
                                object-contain
                            "
                        />
                    </div>

                    {!collapsed && (
                        <div className="min-w-0">
                            <div className="
                                truncate
                                text-[14px]
                                font-bold
                                tracking-[-0.02em]
                                text-white
                            ">
                                NIRMAAN AI
                            </div>

                            <div className="
                                mt-0.5
                                truncate
                                text-[10px]
                                font-medium
                                text-[#B0B2B5]
                            ">
                                Infrastructure Intelligence
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* =================================================
                NAVIGATION
            ================================================= */}

            <nav
                className="
                    min-h-0 flex-1
                    overflow-y-auto
                    px-3 py-4
                "
            >
                {navigationSections.map(
                    (section, sectionIndex) => (
                        <div
                            key={`${section.title ?? "main"}-${sectionIndex}`}
                            className="
                                mb-5
                                last:mb-0
                            "
                        >
                            {section.title &&
                                !collapsed && (
                                    <div className="
                                        mb-2.5 px-2
                                        text-[9px]
                                        font-bold
                                        uppercase
                                        tracking-[0.14em]
                                        text-[#8F9195]
                                    ">
                                        {section.title}
                                    </div>
                                )}

                            {section.items.map(
                                (item) => {
                                    const Icon =
                                        item.icon;

                                    return (
                                        <NavLink
                                            key={item.path}
                                            to={item.path}
                                            title={
                                                collapsed
                                                    ? item.label
                                                    : undefined
                                            }
                                            onClick={
                                                onNavigate
                                            }
                                            className={({
                                                isActive,
                                            }) =>
                                                [
                                                    "group relative mb-1",
                                                    "flex h-10 items-center",
                                                    "rounded-[10px]",
                                                    "transition-[background-color,color,box-shadow]",
                                                    "duration-150",

                                                    collapsed
                                                        ? "justify-center px-0"
                                                        : "gap-3 px-3.5",

                                                    isActive
                                                        ? [
                                                            "bg-[#4A4C50]",
                                                            "text-white",
                                                            "shadow-[inset_2px_0_0_#F3F4F6]",
                                                        ].join(" ")
                                                        : [
                                                            "text-[#C2C4C7]",
                                                            "hover:bg-[#383A3D]",
                                                            "hover:text-white",
                                                        ].join(" "),
                                                ].join(" ")
                                            }
                                        >
                                            <Icon
                                                size={18}
                                                strokeWidth={1.8}
                                                className="
                                                    shrink-0
                                                    text-current
                                                    transition-colors
                                                    duration-150
                                                "
                                            />

                                            {!collapsed && (
                                                <span className="
                                                    min-w-0
                                                    truncate
                                                    text-[11px]
                                                    font-semibold
                                                ">
                                                    {item.label}
                                                </span>
                                            )}
                                        </NavLink>
                                    );
                                },
                            )}
                        </div>
                    ),
                )}
            </nav>


            {/* =================================================
                FOOTER / COLLAPSE
            ================================================= */}

            <div
                className="
                    shrink-0
                    border-t
                    border-white/[0.08]
                    bg-[#222326]/95
                    p-3
                "
            >
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={
                        collapsed
                            ? "Expand sidebar"
                            : "Collapse sidebar"
                    }
                    className={[
                        "flex h-10 w-full",
                        "items-center",
                        "rounded-[10px]",
                        "text-[11px]",
                        "font-medium",
                        "text-[#B0B2B5]",
                        "transition-[background-color,color]",
                        "duration-150",
                        "hover:bg-[#383A3D]",
                        "hover:text-white",
                        collapsed
                            ? "justify-center"
                            : "justify-center gap-2.5",
                    ].join(" ")}
                >
                    <span className="
                        text-[16px]
                        leading-none
                    ">
                        {collapsed
                            ? "→"
                            : "←"}
                    </span>

                    {!collapsed && (
                        <span>
                            Collapse sidebar
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}