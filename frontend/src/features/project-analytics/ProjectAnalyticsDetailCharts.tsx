import React, { useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";

type HistoryRecord = {
    [key: string]: string | number | null | undefined;
};

interface ProjectAnalyticsDetailChartsProps {
    history: HistoryRecord[];
    flashHistory?: HistoryRecord[];
    progressTrajectory?: HistoryRecord[];
    riskTrajectory?: HistoryRecord[];
}

type RangeKey = "6M" | "12M" | "24M" | "ALL";

const RANGE_OPTIONS: RangeKey[] = [
    "6M",
    "12M",
    "24M",
    "ALL",
];

function toNumber(
    value: string | number | null | undefined,
): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed =
        typeof value === "number"
            ? value
            : Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: unknown): string {
    if (!value) {
        return "-";
    }

    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
    });
}

function formatNumber(
    value: number | null | undefined,
    digits = 1,
): string {
    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(value)
    ) {
        return "-";
    }

    return value.toLocaleString("en-IN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function filterByRange<T>(
    data: T[],
    range: RangeKey,
): T[] {
    if (range === "ALL") {
        return data;
    }

    const count =
        range === "6M"
            ? 6
            : range === "12M"
                ? 12
                : 24;

    return data.slice(-count);
}

function ChartCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-900">
                    {title}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                    {subtitle}
                </p>
            </div>

            <div className="h-[320px] w-full">
                {children}
            </div>
        </div>
    );
}

function EmptyChartState({
    message,
}: {
    message: string;
}) {
    return (
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
            <div className="px-6 text-center">
                <p className="text-sm font-medium text-slate-600">
                    No chart data available
                </p>

                <p className="mt-1 text-xs text-slate-400">
                    {message}
                </p>
            </div>
        </div>
    );
}

function tooltipValue(
    value: number | string | undefined,
): string {
    if (typeof value === "number") {
        return formatNumber(value, 2);
    }

    return value ?? "-";
}

export default function ProjectAnalyticsDetailCharts({
    history,
    flashHistory = [],
    progressTrajectory = [],
    riskTrajectory = [],
}: ProjectAnalyticsDetailChartsProps) {
    const [range, setRange] =
        useState<RangeKey>("ALL");

    /*
     * --------------------------------------------------------
     * Schedule trajectory
     * --------------------------------------------------------
     */

    const scheduleData = useMemo(() => {
        const source = history.length
            ? history
            : flashHistory;

        const mapped = source
            .map((row) => {
                const date =
                    row.snapshot_month ??
                    row.snapshot_date;

                return {
                    date,
                    label: formatDate(date),
                    delay_days: toNumber(
                        row.delay_days,
                    ),
                    schedule_change_days: toNumber(
                        row.schedule_change_days,
                    ),
                };
            })
            .filter(
                (row) =>
                    row.date !== null &&
                    (row.delay_days !== null ||
                        row.schedule_change_days !== null),
            );

        return filterByRange(
            mapped,
            range,
        );
    }, [
        history,
        flashHistory,
        range,
    ]);

    /*
     * --------------------------------------------------------
     * Cost / expenditure trajectory
     * --------------------------------------------------------
     */

    const costData = useMemo(() => {
        const source = flashHistory.length
            ? flashHistory
            : history;

        const mapped = source
            .map((row) => {
                const date =
                    row.snapshot_month ??
                    row.snapshot_date;

                return {
                    date,
                    label: formatDate(date),

                    expenditure: toNumber(
                        row.cumulative_expenditure ??
                        row.expenditure_cr,
                    ),

                    revised_cost: toNumber(
                        row.revised_cost ??
                        row.revised_cost_cr,
                    ),

                    original_cost: toNumber(
                        row.original_cost,
                    ),
                };
            })
            .filter(
                (row) =>
                    row.date !== null &&
                    (row.expenditure !== null ||
                        row.revised_cost !== null ||
                        row.original_cost !== null),
            );

        return filterByRange(
            mapped,
            range,
        );
    }, [
        history,
        flashHistory,
        range,
    ]);

    /*
     * --------------------------------------------------------
     * Physical progress trajectory
     * --------------------------------------------------------
     */

    const progressData = useMemo(() => {
        /*
         * progressTrajectory contains the preferred analytical
         * trajectory, but flashHistory may contain newer snapshots.
         *
         * Merge both sources by date so the chart always includes
         * the latest available physical progress.
         */

        const merged = new Map<
            string,
            {
                date: string | null;
                label: string;
                progress: number | null;
                progress_change: number | null;
            }
        >();

        const addRow = (row: HistoryRecord) => {
            const rawDate =
                row.snapshot_date ??
                row.snapshot_month;

            if (!rawDate) {
                return;
            }

            const date = String(rawDate);

            const existing = merged.get(date);

            const progress =
                toNumber(row.physical_progress_pct);

            const progressChange =
                toNumber(
                    row.progress_change_pct ??
                    row.physical_progress_change_pct,
                );

            merged.set(date, {
                date,
                label: formatDate(date),

                /*
                 * Prefer an explicitly provided progress value.
                 * Otherwise keep the existing value.
                 */
                progress:
                    progress ??
                    existing?.progress ??
                    null,

                progress_change:
                    progressChange ??
                    existing?.progress_change ??
                    null,
            });
        };

        /*
         * Add analytical trajectory first.
         */
        progressTrajectory.forEach(addRow);

        /*
         * Add FLASH afterward so newer FLASH snapshots
         * can fill missing/latest dates.
         */
        flashHistory.forEach(addRow);

        const mapped = Array.from(
            merged.values(),
        ).sort((a, b) =>
            String(a.date).localeCompare(
                String(b.date),
            ),
        );

        return filterByRange(
            mapped,
            range,
        );
    }, [
        progressTrajectory,
        flashHistory,
        range,
    ]);

    const riskData = useMemo(() => {
        const mapped = riskTrajectory
            .map((row) => {
                const date =
                    row.snapshot_date ??
                    row.snapshot_month;

                return {
                    date,
                    label: formatDate(date),

                    overall_risk:
                        toNumber(
                            row.overall_risk,
                        ),

                    cost_risk:
                        toNumber(
                            row.cost_risk,
                        ),

                    future_delay:
                        toNumber(
                            row.future_delay,
                        ),

                    progress_stall:
                        toNumber(
                            row.progress_stall,
                        ),

                    risk_level:
                        row.risk_level ?? null,
                };
            })
            .filter(
                (row) =>
                    row.date !== null &&
                    (
                        row.overall_risk !== null ||
                        row.cost_risk !== null ||
                        row.future_delay !== null ||
                        row.progress_stall !== null
                    ),
            );

        return filterByRange(
            mapped,
            range,
        );
    }, [
        riskTrajectory,
        range,
    ]);

    /*
     * --------------------------------------------------------
     * Summary metrics
     * --------------------------------------------------------
     */

    const latestProgress =
        progressData.length > 0
            ? progressData[
                progressData.length - 1
            ].progress
            : null;

    const latestDelay =
        scheduleData.length > 0
            ? scheduleData[
                scheduleData.length - 1
            ].delay_days
            : null;

    const latestExpenditure =
        costData.length > 0
            ? costData[
                costData.length - 1
            ].expenditure
            : null;

    const latestOriginalCost =
        costData.length > 0
            ? costData[
                costData.length - 1
            ].original_cost
            : null;

    /*
     * --------------------------------------------------------
     * Render
     * --------------------------------------------------------
     */

    return (
        <section className="mt-6 space-y-5">
            {/* Header */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Project Performance Analysis
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Historical schedule, cost and physical
                            progress trends for the selected project.
                        </p>
                    </div>

                    {/* Range selector */}
                    <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {RANGE_OPTIONS.map(
                            (option) => {
                                const active =
                                    range === option;

                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() =>
                                            setRange(
                                                option,
                                            )
                                        }
                                        className={[
                                            "rounded-lg px-3 py-2 text-xs font-semibold transition",
                                            active
                                                ? "bg-white text-slate-900 shadow-sm"
                                                : "text-slate-500 hover:text-slate-800",
                                        ].join(
                                            " ",
                                        )}
                                    >
                                        {option}
                                    </button>
                                );
                            },
                        )}
                    </div>
                </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Latest Progress
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-900">
                        {formatNumber(
                            latestProgress,
                            2,
                        )}
                        <span className="ml-1 text-sm font-medium text-slate-400">
                            %
                        </span>
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Delay
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-900">
                        {formatNumber(
                            latestDelay,
                            0,
                        )}
                        <span className="ml-1 text-sm font-medium text-slate-400">
                            days
                        </span>
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Expenditure
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-900">
                        ₹
                        {formatNumber(
                            latestExpenditure,
                            2,
                        )}
                        <span className="ml-1 text-sm font-medium text-slate-400">
                            Cr
                        </span>
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Original Cost
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-900">
                        ₹
                        {formatNumber(
                            latestOriginalCost,
                            2,
                        )}
                        <span className="ml-1 text-sm font-medium text-slate-400">
                            Cr
                        </span>
                    </p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {/* Schedule */}
                <ChartCard
                    title="Schedule Trajectory"
                    subtitle="Delay and schedule-change history"
                >
                    {scheduleData.length === 0 ? (
                        <EmptyChartState
                            message="Schedule history is not available for this project."
                        />
                    ) : (
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                        >
                            <LineChart
                                data={scheduleData}
                                margin={{
                                    top: 10,
                                    right: 20,
                                    left: 10,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                />

                                <XAxis
                                    dataKey="label"
                                    tick={{
                                        fontSize: 11,
                                    }}
                                    minTickGap={24}
                                />

                                <YAxis
                                    tick={{
                                        fontSize: 11,
                                    }}
                                    width={55}
                                />

                                <Tooltip
                                    formatter={(
                                        value,
                                        name,
                                    ) => [
                                            tooltipValue(
                                                value as
                                                | number
                                                | string
                                                | undefined,
                                            ),
                                            name ===
                                                "delay_days"
                                                ? "Delay Days"
                                                : "Schedule Change",
                                        ]}
                                />

                                <Legend />

                                <Line
                                    type="monotone"
                                    dataKey="delay_days"
                                    name="Delay Days"
                                    strokeWidth={2}
                                    dot={{
                                        r: 3,
                                    }}
                                    activeDot={{
                                        r: 5,
                                    }}
                                    connectNulls
                                />

                                <Line
                                    type="monotone"
                                    dataKey="schedule_change_days"
                                    name="Schedule Change"
                                    strokeWidth={2}
                                    dot={{
                                        r: 3,
                                    }}
                                    activeDot={{
                                        r: 5,
                                    }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                {/* Cost */}
                <ChartCard
                    title="Cost & Expenditure"
                    subtitle="Cumulative expenditure against project cost"
                >
                    {costData.length === 0 ? (
                        <EmptyChartState
                            message="Cost and expenditure history is not available."
                        />
                    ) : (
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                        >
                            <LineChart
                                data={costData}
                                margin={{
                                    top: 10,
                                    right: 20,
                                    left: 10,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                />

                                <XAxis
                                    dataKey="label"
                                    tick={{
                                        fontSize: 11,
                                    }}
                                    minTickGap={24}
                                />

                                <YAxis
                                    tick={{
                                        fontSize: 11,
                                    }}
                                    width={65}
                                    tickFormatter={(
                                        value,
                                    ) =>
                                        `₹${value}`
                                    }
                                />

                                <Tooltip
                                    formatter={(
                                        value,
                                        name,
                                    ) => [
                                            `₹${tooltipValue(
                                                value as
                                                | number
                                                | string
                                                | undefined,
                                            )} Cr`,
                                            name ===
                                                "expenditure"
                                                ? "Expenditure"
                                                : name ===
                                                    "revised_cost"
                                                    ? "Revised Cost"
                                                    : "Original Cost",
                                        ]}
                                />

                                <Legend />

                                <Line
                                    type="monotone"
                                    dataKey="expenditure"
                                    name="Expenditure"
                                    strokeWidth={2}
                                    dot={{
                                        r: 3,
                                    }}
                                    activeDot={{
                                        r: 5,
                                    }}
                                    connectNulls
                                />

                                <Line
                                    type="monotone"
                                    dataKey="revised_cost"
                                    name="Revised Cost"
                                    strokeWidth={2}
                                    dot={{
                                        r: 3,
                                    }}
                                    activeDot={{
                                        r: 5,
                                    }}
                                    connectNulls
                                />

                                <Line
                                    type="monotone"
                                    dataKey="original_cost"
                                    name="Original Cost"
                                    strokeWidth={2}
                                    dot={{
                                        r: 3,
                                    }}
                                    activeDot={{
                                        r: 5,
                                    }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                {/* Progress */}
                <div className="xl:col-span-2">
                    <ChartCard
                        title="Physical Progress Trajectory"
                        subtitle="Project completion progress over time"
                    >
                        {progressData.length === 0 ? (
                            <EmptyChartState
                                message="Physical progress history is not available."
                            />
                        ) : (
                            <ResponsiveContainer
                                width="100%"
                                height="100%"
                            >
                                <LineChart
                                    data={progressData}
                                    margin={{
                                        top: 10,
                                        right: 20,
                                        left: 10,
                                        bottom: 5,
                                    }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                    />

                                    <XAxis
                                        dataKey="label"
                                        tick={{
                                            fontSize: 11,
                                        }}
                                        minTickGap={24}
                                    />

                                    {/* Physical progress */}
                                    <YAxis
                                        yAxisId="progress"
                                        domain={[
                                            0,
                                            100,
                                        ]}
                                        tick={{
                                            fontSize: 11,
                                        }}
                                        width={45}
                                        tickFormatter={(value) =>
                                            `${value}%`
                                        }
                                    />

                                    {/* Monthly progress change */}
                                    <YAxis
                                        yAxisId="change"
                                        orientation="right"
                                        tick={{
                                            fontSize: 11,
                                        }}
                                        width={45}
                                        tickFormatter={(value) =>
                                            `${value}%`
                                        }
                                    />

                                    <Tooltip
                                        labelFormatter={(label) =>
                                            `Snapshot: ${label}`
                                        }
                                        formatter={(
                                            value,
                                            name,
                                        ) => {
                                            const numericValue =
                                                typeof value === "number"
                                                    ? value
                                                    : Number(value);

                                            if (name === "Physical Progress") {
                                                return [
                                                    `${formatNumber(
                                                        numericValue,
                                                        2,
                                                    )}%`,
                                                    "Physical Progress",
                                                ];
                                            }

                                            return [
                                                `${formatNumber(
                                                    numericValue,
                                                    2,
                                                )}%`,
                                                "Monthly Progress Change",
                                            ];
                                        }}
                                    />

                                    <Legend />

                                    {/* Main project progress */}
                                    <Area
                                        yAxisId="progress"
                                        type="monotone"
                                        dataKey="progress"
                                        name="Physical Progress"
                                        fillOpacity={0.08}
                                        strokeWidth={3}
                                        dot={{
                                            r: 3,
                                        }}
                                        activeDot={{
                                            r: 5,
                                        }}
                                        connectNulls
                                    />

                                    {/* Secondary monthly movement */}
                                    <Line
                                        yAxisId="change"
                                        type="monotone"
                                        dataKey="progress_change"
                                        name="Monthly Progress Change"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={{
                                            r: 3,
                                        }}
                                        activeDot={{
                                            r: 5,
                                        }}
                                        connectNulls
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        {/* Overall Risk */}
                        <ChartCard
                            title="Overall Risk Trajectory"
                            subtitle="Historical composite project risk"
                        >
                            {riskData.length === 0 ? (
                                <EmptyChartState
                                    message="Historical ML risk snapshots are not available for this project."
                                />
                            ) : (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                >
                                    <LineChart
                                        data={riskData}
                                        margin={{
                                            top: 10,
                                            right: 20,
                                            left: 10,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                        />

                                        <XAxis
                                            dataKey="label"
                                            tick={{
                                                fontSize: 11,
                                            }}
                                            minTickGap={24}
                                        />

                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{
                                                fontSize: 11,
                                            }}
                                            width={50}
                                            tickFormatter={(value) =>
                                                `${value}`
                                            }
                                        />

                                        <Tooltip
                                            labelFormatter={(label) =>
                                                `Snapshot: ${label}`
                                            }
                                            formatter={(value) => [
                                                `${formatNumber(
                                                    Number(value),
                                                    2,
                                                )}`,
                                                "Overall Risk",
                                            ]}
                                        />

                                        <Line
                                            type="monotone"
                                            dataKey="overall_risk"
                                            name="Overall Risk"
                                            strokeWidth={3}
                                            dot={{
                                                r: 3,
                                            }}
                                            activeDot={{
                                                r: 5,
                                            }}
                                            connectNulls
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        {/* Risk Drivers */}
                        <ChartCard
                            title="Risk Drivers"
                            subtitle="Prediction components influencing project risk"
                        >
                            {riskData.length === 0 ? (
                                <EmptyChartState
                                    message="Historical ML risk components are not available."
                                />
                            ) : (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                >
                                    <LineChart
                                        data={riskData}
                                        margin={{
                                            top: 10,
                                            right: 20,
                                            left: 10,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                        />

                                        <XAxis
                                            dataKey="label"
                                            tick={{
                                                fontSize: 11,
                                            }}
                                            minTickGap={24}
                                        />

                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{
                                                fontSize: 11,
                                            }}
                                            width={50}
                                            tickFormatter={(value) =>
                                                `${value}%`
                                            }
                                        />

                                        <Tooltip
                                            labelFormatter={(label) =>
                                                `Snapshot: ${label}`
                                            }
                                            formatter={(
                                                value,
                                                name,
                                            ) => [
                                                    `${formatNumber(
                                                        Number(value),
                                                        2,
                                                    )}%`,
                                                    String(name),
                                                ]}
                                        />

                                        <Legend />

                                        <Line
                                            type="monotone"
                                            dataKey="future_delay"
                                            name="Future Delay"
                                            strokeWidth={2}
                                            dot={{
                                                r: 2,
                                            }}
                                            activeDot={{
                                                r: 4,
                                            }}
                                            connectNulls
                                        />

                                        <Line
                                            type="monotone"
                                            dataKey="progress_stall"
                                            name="Progress Stall"
                                            strokeWidth={2}
                                            dot={{
                                                r: 2,
                                            }}
                                            activeDot={{
                                                r: 4,
                                            }}
                                            connectNulls
                                        />

                                        <Line
                                            type="monotone"
                                            dataKey="cost_risk"
                                            name="Cost Risk"
                                            strokeWidth={2}
                                            dot={{
                                                r: 2,
                                            }}
                                            activeDot={{
                                                r: 4,
                                            }}
                                            connectNulls
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>
                </div>
            </div>
        </section>
    );
}