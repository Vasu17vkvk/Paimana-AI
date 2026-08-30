import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile sidebar when switching to desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setMobileOpen(false);
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    // Close mobile sidebar after navigation
    const handleNavigate = () => {
        if (window.innerWidth < 768) {
            setMobileOpen(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* =========================
          MOBILE OVERLAY
      ========================== */}
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] md:hidden"
                />
            )}

            {/* =========================
          SIDEBAR
      ========================== */}
            <div
                className={[
                    "fixed inset-y-0 left-0 z-50",
                    "transition-transform duration-200 ease-out",
                    mobileOpen
                        ? "translate-x-0"
                        : "-translate-x-full md:translate-x-0",
                ].join(" ")}
            >
                <Sidebar
                    collapsed={collapsed}
                    onToggle={() =>
                        setCollapsed((current) => !current)
                    }
                    onNavigate={handleNavigate}
                />
            </div>

            {/* =========================
          MAIN CONTENT
      ========================== */}
            <div
                className={[
                    "min-h-screen transition-[margin] duration-200",
                    collapsed
                        ? "md:ml-[68px]"
                        : "md:ml-[220px]"
                ].join(" ")}
            >
                <Header
                    onMobileMenu={() => setMobileOpen(true)}
                />

                <main className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-7">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}