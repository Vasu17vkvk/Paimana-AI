import {
    Bell,
    Menu,
    Search,
} from "lucide-react";

interface HeaderProps {
    onMobileMenu: () => void;
}

export default function Header({
    onMobileMenu,
}: HeaderProps) {
    return (
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-7 backdrop-blur">
            {/* Left */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onMobileMenu}
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
                    aria-label="Open menu"
                >
                    <Menu size={20} />
                </button>

                <div className="flex h-10 w-[320px] items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3">
                    <Search
                        size={17}
                        className="text-slate-400"
                    />

                    <input
                        type="search"
                        placeholder="Search projects..."
                        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />

                    <span className="grid h-6 min-w-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400">
                        /
                    </span>
                </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Notifications"
                >
                    <Bell size={19} />

                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                </button>

                <div className="hidden h-7 w-px bg-slate-200 sm:block" />

                <button
                    type="button"
                    className="flex items-center gap-2.5"
                >
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        A
                    </div>

                    <div className="hidden text-left sm:block">
                        <div className="text-xs font-semibold text-slate-800">
                            Administrator
                        </div>

                        <div className="text-[10px] text-slate-400">
                            PAIMANA Monitoring
                        </div>
                    </div>
                </button>
            </div>
        </header>
    );
}