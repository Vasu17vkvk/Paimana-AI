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
        <div className="min-h-screen bg-[#eef3f6]">
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] md:hidden"
                />
            )}

            <div
                className={[
                    "fixed left-[14px] top-[14px] bottom-[14px] z-50",
                    "transition-transform duration-200 ease-out",
                    mobileOpen
                        ? "translate-x-0"
                        : "-translate-x-[calc(100%+20px)] md:translate-x-0",
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

            <div
                className={[
                    "min-h-screen transition-[margin] duration-200 ease-out",
                    collapsed
                        ? "md:ml-[74px]"
                        : "md:ml-[322px]",
                ].join(" ")}
            >
                <Header
                    onMobileMenu={() => setMobileOpen(true)}
                />

                <main className="px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:px-6 lg:pb-12 lg:pt-7">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}