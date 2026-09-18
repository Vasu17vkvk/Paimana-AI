import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MoreHorizontal } from "lucide-react";

import type { ProjectAnalyticsProject } from "../../services/api";

interface ProjectAnalyticsChartsProps {
  projects: ProjectAnalyticsProject[];
}

// ============================================================
// CHART COLORS
// ============================================================


const SCHEDULE_COLORS: Record<string, string> = {
  Delayed: "#df4b4b",
  "No Revised Date": "#8794a5",
  "On Schedule": "#2fbd73",
  Accelerated: "#4d83d9",
};

const CATEGORY_COLORS = [
  "#4d83d9",
  "#2fbd73",
  "#e5a11b",
  "#df4b4b",
  "#8b7fc2",
  "#5a9eac",
  "#e08a35",
  "#5a9e8f",
  "#bd667d",
  "#7b8492",
];

// ============================================================
// DATA HELPERS
// ============================================================

function countByField(
  projects: ProjectAnalyticsProject[],
  field: "sector" | "ministry" | "risk_level" | "schedule_status",
) {
  const counts = new Map<string, number>();

  projects.forEach((project) => {
    const rawValue = project[field];

    const value =
      rawValue && String(rawValue).trim()
        ? String(rawValue).trim()
        : "Unknown";

    counts.set(
      value,
      (counts.get(value) ?? 0) + 1,
    );
  });

  return Array.from(counts.entries())
    .map(([name, value]) => ({
      name,
      value,
    }))
    .sort(
      (a, b) =>
        b.value - a.value,
    );
}

function getRiskData(
  projects: ProjectAnalyticsProject[],
) {
  const counts = {
    Critical: 0,
    High: 0,
    Elevated: 0,
    Moderate: 0,
    Low: 0,
  };

  projects.forEach((project) => {
    const score = Number(
      project.overall_risk_score,
    );

    if (!Number.isFinite(score)) {
      return;
    }

    if (score >= 85) {
      counts.Critical += 1;
    } else if (score >= 70) {
      counts.High += 1;
    } else if (score >= 55) {
      counts.Elevated += 1;
    } else if (score >= 40) {
      counts.Moderate += 1;
    } else {
      counts.Low += 1;
    }
  });

  return [
    {
      name: "Critical",
      value: counts.Critical,
      color: "#ef4444",
    },
    {
      name: "High",
      value: counts.High,
      color: "#f97316",
    },
    {
      name: "Elevated",
      value: counts.Elevated,
      color: "#fbbf24",
    },
    {
      name: "Moderate",
      value: counts.Moderate,
      color: "#3b82f6",
    },
    {
      name: "Low",
      value: counts.Low,
      color: "#22c55e",
    },
  ];
}

function getSectorDelayData(
  projects: ProjectAnalyticsProject[],
) {
  const sectorMap = new Map<
    string,
    {
      total: number;
      delayed: number;
    }
  >();

  projects.forEach((project) => {
    const sector =
      project.sector &&
      project.sector.trim()
        ? project.sector.trim()
        : "Unknown";

    const current =
      sectorMap.get(sector) ?? {
        total: 0,
        delayed: 0,
      };

    current.total += 1;

    if (
      project.schedule_status &&
      project.schedule_status
        .toLowerCase()
        .includes("delay")
    ) {
      current.delayed += 1;
    }

    sectorMap.set(
      sector,
      current,
    );
  });

  return Array.from(
    sectorMap.entries(),
  )
    .map(
      ([sector, values]) => ({
        sector,
        delay_rate_pct:
          values.total > 0
            ? Number(
                (
                  (values.delayed /
                    values.total) *
                  100
                ).toFixed(1),
              )
            : 0,
        total_projects:
          values.total,
      }),
    )
    .sort(
      (a, b) =>
        b.delay_rate_pct -
        a.delay_rate_pct,
    )
    .slice(0, 10);
}

// ============================================================
// PROJECT ANALYTICS CHARTS
// ============================================================

export default function ProjectAnalyticsCharts({
  projects,
}: ProjectAnalyticsChartsProps) {
  const riskData = getRiskData(
    projects,
  );

  const scheduleData =
    countByField(
      projects,
      "schedule_status",
    );

  const sectorData =
    countByField(
      projects,
      "sector",
    ).slice(0, 10);

  const ministryData =
    countByField(
      projects,
      "ministry",
    ).slice(0, 10);

  const sectorDelayData =
    getSectorDelayData(
      projects,
    );

  return (
    <section className="space-y-6">

      {/* ================================================== */}
      {/* ROW 1 */}
      {/* ================================================== */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* ================================================== */}
        {/* Risk Distribution */}
        {/* ================================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                Risk Distribution
              </h3>

              <p className="mt-2 text-lg font-semibold text-slate-900">
                Current model-based risk classification
              </p>
            </div>

            <button
              type="button"
              aria-label="Risk distribution options"
              className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          <div className="mt-4 grid min-h-[320px] grid-cols-1 items-center gap-6 md:grid-cols-[minmax(280px,1fr)_minmax(320px,1fr)]">
            {riskData.length === 0 ? (
              <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-400 md:col-span-2">
                No risk data available
              </div>
            ) : (
              <>
                <div className="relative flex h-[280px] items-center justify-center">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <PieChart>
                      <Pie
                        data={riskData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={122}
                        innerRadius={78}
                        paddingAngle={1}
                        stroke="#ffffff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {riskData.map(
                          (entry, index) => (
                            <Cell
                              key={`risk-${entry.name}-${index}`}
                              fill={
                                entry.color ??
                                CATEGORY_COLORS[
                                  index %
                                    CATEGORY_COLORS.length
                                ]
                              }
                            />
                          ),
                        )}
                      </Pie>

                      <Tooltip
                        formatter={(value) => [
                          Number(value ?? 0).toLocaleString("en-IN"),
                          "Projects",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-3xl font-bold tracking-tight text-slate-900">
                      {riskData.reduce(
                        (total, item) =>
                          total + item.value,
                        0,
                      ).toLocaleString("en-IN")}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Projects
                    </div>
                  </div>
                </div>

                <div className="space-y-5 pr-2">
                  {riskData.map((item) => {
                    const total = riskData.reduce(
                      (sum, entry) =>
                        sum + entry.value,
                      0,
                    );

                    const percentage =
                      total > 0
                        ? (item.value / total) * 100
                        : 0;

                    return (
                      <div
                        key={item.name}
                        className="grid grid-cols-[16px_minmax(0,1fr)_80px_60px] items-center gap-3"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: item.color,
                          }}
                        />

                        <span className="text-sm font-medium text-slate-500">
                          {item.name}
                        </span>

                        <span className="text-right text-sm font-semibold text-slate-700">
                          {item.value.toLocaleString("en-IN")}
                        </span>

                        <span className="text-right text-sm text-slate-400">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ================================================== */}
        {/* Schedule Status */}
        {/* ================================================== */}

        <div className="rounded-2xl border border-[#d7dadd] bg-[#f5f6f7] p-5 shadow-[0_2px_8px_rgba(20,24,30,0.045)]">

          <div className="mb-4">

            <h3 className="text-base font-semibold text-slate-900">
              Schedule Status
            </h3>

            <p className="text-sm text-slate-500">
              Portfolio-wise schedule classification
            </p>

          </div>

          <div className="h-[320px]">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={scheduleData}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="value"
                  name="Projects"
                  radius={[
                    6,
                    6,
                    0,
                    0,
                  ]}
                >

                  {scheduleData.map(
                    (entry, index) => (
                      <Cell
                        key={`schedule-${entry.name}-${index}`}
                        fill={
                          SCHEDULE_COLORS[
                            entry.name
                          ] ??
                          CATEGORY_COLORS[
                            index %
                              CATEGORY_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}

                </Bar>

              </BarChart>
            </ResponsiveContainer>

          </div>
        </div>

      </div>

      {/* ================================================== */}
      {/* ROW 2 */}
      {/* ================================================== */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* ================================================== */}
        {/* Projects by Sector */}
        {/* ================================================== */}

        <div className="rounded-2xl border border-[#d7dadd] bg-[#f5f6f7] p-5 shadow-[0_2px_8px_rgba(20,24,30,0.045)]">

          <div className="mb-4">

            <h3 className="text-base font-semibold text-slate-900">
              Projects by Sector
            </h3>

            <p className="text-sm text-slate-500">
              Top sectors by project count
            </p>

          </div>

          <div className="h-[360px]">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={sectorData}
                layout="vertical"
                margin={{
                  left: 20,
                  right: 20,
                  top: 5,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  type="number"
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 11 }}
                />

                <Tooltip />

                <Bar
                  dataKey="value"
                  name="Projects"
                  radius={[
                    0,
                    6,
                    6,
                    0,
                  ]}
                >

                  {sectorData.map(
                    (entry, index) => (
                      <Cell
                        key={`sector-${entry.name}-${index}`}
                        fill={
                          CATEGORY_COLORS[
                            index %
                              CATEGORY_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}

                </Bar>

              </BarChart>
            </ResponsiveContainer>

          </div>
        </div>

        {/* ================================================== */}
        {/* Projects by Ministry */}
        {/* ================================================== */}

        <div className="rounded-2xl border border-[#d7dadd] bg-[#f5f6f7] p-5 shadow-[0_2px_8px_rgba(20,24,30,0.045)]">

          <div className="mb-4">

            <h3 className="text-base font-semibold text-slate-900">
              Projects by Ministry
            </h3>

            <p className="text-sm text-slate-500">
              Top ministries by project count
            </p>

          </div>

          <div className="h-[360px]">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={ministryData}
                layout="vertical"
                margin={{
                  left: 20,
                  right: 20,
                  top: 5,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  type="number"
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  width={170}
                  tick={{ fontSize: 10 }}
                />

                <Tooltip />

                <Bar
                  dataKey="value"
                  name="Projects"
                  radius={[
                    0,
                    6,
                    6,
                    0,
                  ]}
                >

                  {ministryData.map(
                    (entry, index) => (
                      <Cell
                        key={`ministry-${entry.name}-${index}`}
                        fill={
                          CATEGORY_COLORS[
                            index %
                              CATEGORY_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}

                </Bar>

              </BarChart>
            </ResponsiveContainer>

          </div>
        </div>

      </div>

      {/* ================================================== */}
      {/* ROW 3 */}
      {/* ================================================== */}

      <div className="rounded-2xl border border-[#d7dadd] bg-[#f5f6f7] p-5 shadow-[0_2px_8px_rgba(20,24,30,0.045)]">

        <div className="mb-4">

          <h3 className="text-base font-semibold text-slate-900">
            Sector Delay Rate
          </h3>

          <p className="text-sm text-slate-500">
            Top sectors ranked by proportion of delayed projects
          </p>

        </div>

        <div className="h-[380px]">

          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={sectorDelayData}
              layout="vertical"
              margin={{
                left: 20,
                right: 25,
                top: 5,
                bottom: 5,
              }}
            >

              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
              />

              <YAxis
                type="category"
                dataKey="sector"
                width={160}
                tick={{ fontSize: 11 }}
              />

              <Tooltip
                formatter={(value) => [
                  `${Number(value ?? 0)}%`,
                  "Delay Rate",
                ]}
              />

              <Bar
                dataKey="delay_rate_pct"
                name="Delay Rate"
                radius={[
                  0,
                  6,
                  6,
                  0,
                ]}
              >

                {sectorDelayData.map(
                  (entry, index) => (
                    <Cell
                      key={`delay-${entry.sector}-${index}`}
                      fill={
                        index === 0
                          ? "#df4b4b"
                          : index === 1
                            ? "#e08a35"
                            : index === 2
                              ? "#e5a11b"
                              : CATEGORY_COLORS[
                                  index %
                                    CATEGORY_COLORS.length
                                ]
                      }
                    />
                  ),
                )}

              </Bar>

            </BarChart>
          </ResponsiveContainer>

        </div>
      </div>

    </section>
  );
}
