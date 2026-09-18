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
                "flex h-full flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#292a2d] text-white shadow-[0_8px_28px_rgba(15,23,42,0.18)]",
                collapsed ? "w-[70px]" : "w-[290px]",
            ].join(" ")}
        >
            {/* =========================
          BRAND
      ========================== */}
            <div className="flex min-h-[74px] shrink-0 items-center border-b border-white/[0.08] px-3.5">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
                        <img
                            src={logo}
                            alt="My New Brand"
                            className="h-[88%] w-[88%] object-contain"
                        />
                    </div>

                    {!collapsed && (
                        <div className="min-w-0">
                            <div className="truncate text-[15px] font-bold tracking-[-0.02em]">
                                NIRMAAN AI
                            </div>

                            <div className="truncate text-[10px] font-medium text-slate-400">
                                Infrastructure Intelligence
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* =========================
          NAVIGATION
      ========================== */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
                {navigationSections.map((section, index) => (
                    <div
                        key={`${section.title ?? "main"}-${index}`}
                        className="mb-2"
                    >
                        {section.title && !collapsed && (
                            <div className="mb-2.5 px-2.5 text-[10px] font-bold tracking-[0.14em] text-slate-500">
                                {section.title}
                            </div>
                        )}

                        {section.items.map((item) => {
                            const Icon = item.icon;

                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    title={collapsed ? item.label : undefined}
                                    onClick={onNavigate}
                                    className={({ isActive }) =>
                                        [
                                            "mb-0.5 flex h-9 items-center gap-2 rounded-lg px-2.5 text-[11px] font-semibold transition-all",
                                            collapsed
                                                ? "justify-center px-0"
                                                : "px-3",
                                            isActive
                                                ? "border border-white/10 bg-[#505155] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                                                : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                                        ].join(" ")
                                    }
                                >
                                    <Icon
                                        size={17}
                                        strokeWidth={1.8}
                                    />

                                    {!collapsed && (
                                        <span className="truncate">
                                            {item.label}
                                        </span>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* =========================
          FIXED BOTTOM CONTROL
      ========================== */}
            <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/[0.08] p-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className={[
                        "flex h-8 w-full items-center justify-center rounded-xl",
                        "text-xs text-slate-400 transition-colors",
                        "hover:bg-slate-800 hover:text-white",
                        collapsed ? "" : "gap-2",
                    ].join(" ")}
                >
                    <span className="text-sm">
                        {collapsed ? "→" : "←"}
                    </span>

                    {!collapsed && (
                        <span>Collapse sidebar</span>
                    )}
                </button>
            </div>
        </aside>
    );
}