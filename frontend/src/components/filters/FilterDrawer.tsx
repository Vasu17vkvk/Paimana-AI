import { X } from "lucide-react";

import Button from "../ui/Button";
import Select from "../ui/Select";

import {
    ministries,
    sectors,
    states,
    riskLevels,
    statuses,
    reportingPeriods,
} from "../../features/dashboard/dashboard.data";

import type { DashboardFilters } from "../../features/dashboard/dashboard.types";

interface FilterDrawerProps {
    open: boolean;
    filters: DashboardFilters;
    onChange: (filters: DashboardFilters) => void;
    onApply: () => void;
    onClose: () => void;
    onReset: () => void;
}

export default function FilterDrawer({
    open,
    filters,
    onChange,
    onApply,
    onClose,
    onReset,
}: FilterDrawerProps) {
    if (!open) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                aria-label="Close filters"
                onClick={onClose}
                className="fixed inset-0 z-[70] bg-slate-950/40"
            />

            <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:rounded-none md:rounded-l-3xl">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                            PAIMANA AI
                        </div>

                        <h2 className="mt-1 text-lg font-bold text-slate-900">
                            Dashboard Filters
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label="Close filters"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-6 space-y-4">
                    <Select
                        label="Reporting Period"
                        value={filters.period}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                period: event.target.value,
                            })
                        }
                        options={reportingPeriods.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />

                    <Select
                        label="Ministry"
                        value={filters.ministry}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                ministry: event.target.value,
                            })
                        }
                        options={ministries.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />

                    <Select
                        label="Sector"
                        value={filters.sector}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                sector: event.target.value,
                            })
                        }
                        options={sectors.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />

                    <Select
                        label="State / Region"
                        value={filters.state}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                state: event.target.value,
                            })
                        }
                        options={states.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />

                    <Select
                        label="Risk Level"
                        value={filters.risk}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                risk: event.target.value,
                            })
                        }
                        options={riskLevels.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />

                    <Select
                        label="Project Status"
                        value={filters.status}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                status: event.target.value,
                            })
                        }
                        options={statuses.map((item) => ({
                            label: item,
                            value: item,
                        }))}
                    />
                </div>

                <div className="mt-7 flex gap-3 border-t border-slate-100 pt-5">
                    <Button
                        variant="secondary"
                        fullWidth
                        onClick={onReset}
                    >
                        Reset
                    </Button>

                    <Button
                        fullWidth
                        onClick={onApply}
                    >
                        Apply Filters
                    </Button>
                </div>
            </div>
        </>
    );
}