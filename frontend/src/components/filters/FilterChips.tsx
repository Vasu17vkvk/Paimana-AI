import { X } from "lucide-react";

import type { DashboardFilters } from "../../features/dashboard/dashboard.types";

interface FilterChipsProps {
    filters: DashboardFilters;
    onChange: (filters: DashboardFilters) => void;
}

export default function FilterChips({
    filters,
    onChange,
}: FilterChipsProps) {
    const chips = [
        {
            key: "period",
            value: filters.period,
        },
        {
            key: "ministry",
            value: filters.ministry,
        },
        {
            key: "sector",
            value: filters.sector,
        },
        {
            key: "state",
            value: filters.state,
        },
        {
            key: "risk",
            value: filters.risk,
        },
        {
            key: "status",
            value: filters.status,
        },
    ].filter((chip) => {
        if (!chip.value) {
            return false;
        }

        return ![
            "All Periods",
            "All Ministries",
            "All Sectors",
            "All States",
            "All Risk Levels",
            "All Statuses",
        ].includes(chip.value);
    });

    const clearChip = (key: string) => {
        if (key === "period") {
            onChange({
                ...filters,
                period: "",
            });
            return;
        }

        if (key === "ministry") {
            onChange({
                ...filters,
                ministry: "All Ministries",
            });
            return;
        }

        if (key === "sector") {
            onChange({
                ...filters,
                sector: "All Sectors",
            });
            return;
        }

        if (key === "state") {
            onChange({
                ...filters,
                state: "All States",
            });
            return;
        }

        if (key === "risk") {
            onChange({
                ...filters,
                risk: "All Risk Levels",
            });
            return;
        }

        if (key === "status") {
            onChange({
                ...filters,
                status: "All Statuses",
            });
        }
    };

    return (
        <div className="
            flex min-w-0 flex-wrap
            items-center gap-1.5
        ">
            {chips.map((chip) => (
                <button
                    key={chip.key}
                    type="button"
                    onClick={() =>
                        clearChip(chip.key)
                    }
                    className="
                        group inline-flex max-w-full
                        items-center gap-1.5
                        rounded-full
                        border border-[#D9E1E8]
                        bg-white
                        px-2.5 py-1.5
                        text-[9px] font-semibold
                        text-[#64748B]
                        shadow-[0_1px_2px_rgba(15,23,42,0.03)]
                        transition-[background-color,border-color,color]
                        duration-150
                        hover:border-slate-300
                        hover:bg-[#F8FAFB]
                        hover:text-[#334155]
                    "
                >
                    <span className="
                        max-w-[150px]
                        truncate
                    ">
                        {chip.value}
                    </span>

                    <span className="
                        grid h-3.5 w-3.5
                        shrink-0 place-items-center
                        rounded-full
                        text-[#94A3B8]
                        transition-colors
                        group-hover:bg-[#EEF2F5]
                        group-hover:text-[#475569]
                    ">
                        <X
                            size={10}
                            strokeWidth={2}
                        />
                    </span>
                </button>
            ))}
        </div>
    );
}