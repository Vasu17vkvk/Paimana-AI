import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
    const [collapsed, setCollapsed] =
        useState(false);

    const [mobileOpen, setMobileOpen] =
        useState(false);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setMobileOpen(false);
            }
        };

        window.addEventListener(
            "resize",
            handleResize,
        );

        return () => {
            window.removeEventListener(
                "resize",
                handleResize,
            );
        };
    }, []);

    const handleNavigate = () => {
        if (window.innerWidth < 768) {
            setMobileOpen(false);
        }
    };

    return (
        <div
            className="
                min-h-screen
                bg-[#EEF2F5]
                text-[#172033]
            "
        >
            {/* =================================================
                MOBILE OVERLAY
            ================================================= */}

            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() =>
                        setMobileOpen(false)
                    }
                    className="
                        fixed inset-0 z-[90]
                        bg-slate-950/40
                        backdrop-blur-[2px]
                        md:hidden
                    "
                />
            )}


            {/* =================================================
                FLOATING SIDEBAR
            ================================================= */}

            <div
                className={[
                    "fixed z-[100]",
                    "left-3 top-3 bottom-3",
                    "transition-[width,transform]",
                    "duration-200 ease-out",
                    mobileOpen
                        ? "translate-x-0"
                        : "-translate-x-[110%] md:translate-x-0",
                ].join(" ")}
            >
                <Sidebar
                    collapsed={collapsed}
                    onToggle={() =>
                        setCollapsed(
                            (current) =>
                                !current,
                        )
                    }
                    onNavigate={handleNavigate}
                />
            </div>


            {/* =================================================
                MAIN AREA
            ================================================= */}

            <div
                className={[
                    "min-h-screen",
                    "transition-[margin] duration-200 ease-out",
                    collapsed
                        ? "md:ml-[92px]"
                        : "md:ml-[316px]",
                ].join(" ")}
            >
                {/* =================================================
                    HEADER
                ================================================= */}

                <div
                    className="
                        px-3 pt-3
                        sm:px-4 sm:pt-3
                        lg:px-5 lg:pt-3
                    "
                >
                    <Header
                        onMobileMenu={() =>
                            setMobileOpen(true)
                        }
                    />
                </div>


                {/* =================================================
                    PAGE CONTENT
                ================================================= */}

                <main
                    className="
                        px-3 py-4
                        sm:px-4 sm:py-5
                        lg:px-5 lg:py-5
                    "
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
}