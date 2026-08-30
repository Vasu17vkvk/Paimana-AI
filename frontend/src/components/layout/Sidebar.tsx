import { NavLink } from "react-router-dom";

import { navigationSections } from "../../app/navigation";

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({
    collapsed,
    onToggle,
}: SidebarProps) {
    return (
        <aside
            className={[
                "paimana-sidebar",
                collapsed ? "paimana-sidebar-collapsed" : "",
            ].join(" ")}
        >
            {/* Brand */}
            <div className="flex h-[76px] shrink-0 items-center border-b border-white/10 px-5">
                <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-extrabold text-slate-900">
                        P
                    </div>

                    {!collapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight text-white">
                                PAIMANA AI
                            </span>

                            <span className="mt-0.5 text-[10px] text-slate-400">
                                Infrastructure Intelligence
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-5">
                {navigationSections.map((section, index) => (
                    <div
                        key={`${section.title ?? "main"}-${index}`}
                        className="mb-6"
                    >
                        {!collapsed && section.title && (
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
                                    className={({ isActive }) =>
                                        [
                                            "mb-1 flex h-10 items-center gap-3 rounded-lg px-3",
                                            "text-xs font-medium transition-all",
                                            isActive
                                                ? "bg-white text-slate-900 shadow-sm"
                                                : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                            collapsed
                                                ? "justify-center px-0"
                                                : "justify-start",
                                        ].join(" ")
                                    }
                                >
                                    <Icon size={18} strokeWidth={1.8} />

                                    {!collapsed && (
                                        <span>{item.label}</span>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Bottom */}
            <div className="border-t border-white/10 p-3">
                <button
                    type="button"
                    onClick={onToggle}
                    className={[
                        "flex h-10 w-full items-center justify-center rounded-lg",
                        "text-xs text-slate-400 transition",
                        "hover:bg-slate-800 hover:text-white",
                        collapsed ? "" : "gap-2",
                    ].join(" ")}
                >
                    <span className="text-lg">
                        {collapsed ? "→" : "←"}
                    </span>

                    {!collapsed && <span>Collapse sidebar</span>}
                </button>
            </div>
        </aside>
    );
}