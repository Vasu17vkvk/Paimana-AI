import { useState } from "react";
import { Outlet } from "react-router-dom";

import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="paimana-app">
            <div
                className={[
                    "fixed inset-y-0 left-0 z-50",
                    mobileOpen ? "block" : "hidden md:block",
                ].join(" ")}
            >
                <Sidebar
                    collapsed={collapsed}
                    onToggle={() =>
                        setCollapsed((current) => !current)
                    }
                />
            </div>

            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
                />
            )}

            <div
                className={[
                    "paimana-main",
                    collapsed
                        ? "paimana-main-expanded"
                        : "",
                ].join(" ")}
            >
                <Header
                    onMobileMenu={() => setMobileOpen(true)}
                />

                <main className="px-4 py-6 sm:px-6 lg:px-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}