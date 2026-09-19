import { useEffect, useRef, useState } from "react";
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
    const navRef = useRef<HTMLElement | null>(null);
    const [scrollbar, setScrollbar] = useState({ top: 0, height: 0, visible: false });

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const updateScrollbar = () => {
            const { scrollTop, scrollHeight, clientHeight } = nav;
            const visible = scrollHeight > clientHeight + 1;
            const height = visible
                ? Math.max(34, (clientHeight / scrollHeight) * clientHeight)
                : 0;
            const maxTop = Math.max(0, clientHeight - height);
            const top =
                scrollHeight > clientHeight
                    ? (scrollTop / (scrollHeight - clientHeight)) * maxTop
                    : 0;

            setScrollbar({ top, height, visible });
        };

        updateScrollbar();
        nav.addEventListener("scroll", updateScrollbar, { passive: true });

        const resizeObserver = new ResizeObserver(updateScrollbar);
        resizeObserver.observe(nav);
        resizeObserver.observe(nav.firstElementChild ?? nav);

        return () => {
            nav.removeEventListener("scroll", updateScrollbar);
            resizeObserver.disconnect();
        };
    }, []);

    const handleScrollbarDrag = (event: React.MouseEvent<HTMLDivElement>) => {
        const nav = navRef.current;
        if (!nav || !scrollbar.visible) return;

        event.preventDefault();

        const startY = event.clientY;
        const startScrollTop = nav.scrollTop;
        const trackHeight = nav.clientHeight;
        const maxThumbTop = trackHeight - scrollbar.height;

        const onMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientY - startY;
            const ratio = maxThumbTop > 0 ? delta / maxThumbTop : 0;
            nav.scrollTop =
                startScrollTop + ratio * (nav.scrollHeight - nav.clientHeight);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

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

            <div className="relative min-h-0 flex-1">
                <nav
                    ref={navRef}
                    className="min-h-0 h-full overflow-y-auto px-2 py-4"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                {navigationSections.map((section, index) => (
                    <div
                        key={`${section.title ?? "main"}-${index}`}
                        className={[
                            "mb-5",
                            section.title && !collapsed
                                ? "rounded-xl bg-gradient-to-r from-slate-400/[0.07] via-slate-400/[0.025] to-transparent px-1.5 py-1"
                                : "",
                        ].join(" ")}
                    >
                        {section.title && !collapsed && (
                            <div className="mb-3 flex items-center gap-3 px-2.5 pt-2">
                                <div className="shrink-0 bg-gradient-to-r from-white via-slate-300 to-slate-500 bg-clip-text text-[12px] font-bold tracking-[0.12em] text-transparent">
                                    {section.title}
                                </div>
                                <div className="h-px flex-1 bg-white/[0.14]" />
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
                                            "mb-1 flex h-10 items-center gap-2 rounded-lg px-2.5 text-[16px] font-semibold text-white transition-all",
                                            collapsed
                                                ? "justify-center px-0"
                                                : "px-2.5",
                                            isActive
                                                ? "border border-white/10 bg-[#505155] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                                                : "text-white hover:bg-white/[0.06] hover:text-white",
                                        ].join(" ")
                                    }
                                >
                                    <Icon size={20} strokeWidth={1.8} />

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

                {scrollbar.visible && (
                    <div
                        aria-hidden="true"
                        onMouseDown={handleScrollbarDrag}
                        className="absolute right-[4px] top-1 bottom-1 z-20 w-[6px] cursor-pointer"
                    >
                        <div
                            className="absolute left-0 w-full rounded-full bg-[#697b91] transition-[top,height] duration-75"
                            style={{
                                top: scrollbar.top,
                                height: scrollbar.height,
                            }}
                        />
                    </div>
                )}
            </div>

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