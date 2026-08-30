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
        return ![
            "All Ministries",
            "All Sectors",
            "All States",
            "All Risk Levels",
            "All Statuses",
        ].includes(chip.value);
    });

    return (
        <div className="flex min-w-0 flex-wrap gap-2">
            {chips.map((chip) => (
                <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                        if (chip.key === "period") {
                            onChange({
                                ...filters,
                                period: "April 2026",
                            });

                            return;
                        }

                        if (chip.key === "ministry") {
                            onChange({
                                ...filters,
                                ministry: "All Ministries",
                            });

                            return;
                        }

                        if (chip.key === "sector") {
                            onChange({
                                ...filters,
                                sector: "All Sectors",
                            });

                            return;
                        }

                        if (chip.key === "state") {
                            onChange({
                                ...filters,
                                state: "All States",
                            });

                            return;
                        }

                        if (chip.key === "risk") {
                            onChange({
                                ...filters,
                                risk: "All Risk Levels",
                            });

                            return;
                        }

                        if (chip.key === "status") {
                            onChange({
                                ...filters,
                                status: "All Statuses",
                            });
                        }
                    }}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                    <span className="max-w-[140px] truncate">
                        {chip.value}
                    </span>

                    <X size={12} />
                </button>
            ))}
        </div>
    );
}