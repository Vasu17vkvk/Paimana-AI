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
                collapsed ? "w-[60px]" : "w-[300px]",
            ].join(" ")}
        >
            <div className="flex min-h-[76px] shrink-0 items-center border-b border-white/[0.08] px-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white shadow-sm">
                        <img
                            src={logo}
                            alt="My New Brand"
                            className="h-[88%] w-[88%] object-contain"
                        />
                    </div>

                    {!collapsed && (
                        <div className="min-w-0">
                            <div className="truncate text-[17px] font-bold tracking-[-0.02em] text-white">
                                NIRMAAN AI
                            </div>

                            <div className="truncate text-[11px] font-medium text-white">
                                Infrastructure Intelligence
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
                {navigationSections.map((section, index) => (
                    <div
                        key={`${section.title ?? "main"}-${index}`}
                        className="mb-5"
                    >
                        {section.title && !collapsed && (
                            <div className="mb-2.5 px-2.5 text-[11px] font-bold tracking-[0.12em] text-white">
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
                                            "mb-0.5 flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12px] font-semibold text-white transition-all",
                                            collapsed
                                                ? "justify-center px-0"
                                                : "px-2.5",
                                            isActive
                                                ? "border border-white/10 bg-[#505155] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                                                : "text-white hover:bg-white/[0.06] hover:text-white",
                                        ].join(" ")
                                    }
                                >
                                    <Icon size={18} strokeWidth={1.8} />

                                    {!collapsed && (
                                        <span className="truncate text-white">
                                            {item.label}
                                        </span>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/[0.08] p-1.5">
                <button
                    type="button"
                    onClick={onToggle}
                    className={[
                        "flex h-7 w-full items-center justify-center rounded-lg",
                        "text-[12px] text-white transition-colors",
                        "hover:bg-slate-800 hover:text-white",
                        collapsed ? "" : "gap-1.5",
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