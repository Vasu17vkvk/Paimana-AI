import { NavLink } from "react-router-dom";

import { navigationSections } from "../../app/navigation";

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
                "flex h-screen flex-col",
                "border-r border-slate-800",
                "bg-slate-950 text-white",
                collapsed ? "w-[76px]" : "w-[256px]",
            ].join(" ")}
        >
            {/* =========================
          BRAND
      ========================== */}
            <div className="flex h-[76px] shrink-0 items-center border-b border-white/10 px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-extrabold text-slate-900">
                        P
                    </div>

                    {!collapsed && (
                        <div className="min-w-0">
                            <div className="truncate text-sm font-bold tracking-tight">
                                PAIMANA AI
                            </div>

                            <div className="truncate text-[10px] text-slate-400">
                                Infrastructure Intelligence
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* =========================
          NAVIGATION
      ========================== */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
                {navigationSections.map((section, index) => (
                    <div
                        key={`${section.title ?? "main"}-${index}`}
                        className="mb-6"
                    >
                        {section.title && !collapsed && (
                            <div className="mb-2 px-3 text-[10px] font-bold tracking-[0.1em] text-slate-500">
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
                                            "mb-1 flex h-10 items-center gap-3 rounded-lg",
                                            "text-xs font-medium transition-colors",
                                            collapsed
                                                ? "justify-center px-0"
                                                : "px-3",
                                            isActive
                                                ? "bg-white text-slate-900"
                                                : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                        ].join(" ")
                                    }
                                >
                                    <Icon
                                        size={18}
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
            <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-slate-950 p-3">
                <button
                    type="button"
                    onClick={onToggle}
                    className={[
                        "flex h-10 w-full items-center justify-center rounded-lg",
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