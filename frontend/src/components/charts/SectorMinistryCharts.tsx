import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type AnalyticsRow = Record<string, any>;

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
  "#14b8a6",
  "#e11d48",
];

const HEALTH_COLORS = {
  low: "#22c55e",
  moderate: "#f59e0b",
  high: "#f97316",
  veryHigh: "#ef4444",
};

function shortName(value: string, max = 24) {
  if (!value) return "Unknown";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function labelFor(row: AnalyticsRow) {
  return row.sector ?? row.ministry ?? "Unknown";
}

function crore(value: number) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} Cr`;
}

function pct(value: number) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function ChartShell({
  children,
  height = 320,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectsBySectorChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter((row) => Number(row.total_projects ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.total_projects ?? 0) -
        Number(a.total_projects ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      value: Number(row.total_projects ?? 0),
    }));

  const total = rows.reduce(
    (sum, row) => sum + row.value,
    0,
  );

  return (
    <div className="relative h-[330px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            cx="38%"
            cy="50%"
            innerRadius={68}
            outerRadius={105}
            paddingAngle={2}
            strokeWidth={1}
          >
            {rows.map((_, index) => (
              <Cell
                key={`project-pie-${index}`}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>

          <Tooltip
            formatter={(value: number) =>
              `${Number(value).toLocaleString("en-IN")} projects`
            }
          />

          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{
              fontSize: 11,
              lineHeight: "18px",
              maxWidth: "58%",
            }}
            formatter={(value) => {
              const row = rows.find(
                (item) => item.name === value,
              );

              const share = total
                ? ((row?.value ?? 0) / total) * 100
                : 0;

              return `${shortName(value, 22)} (${share.toFixed(1)}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Donut center value */}
      <div
        className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
        style={{
          left: "23%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "115px",
          height: "75px",
        }}
      >
        <div className="whitespace-nowrap text-[20px] font-bold leading-none text-slate-900">
          {total.toLocaleString("en-IN")}
        </div>

        <div className="mt-2 text-[10px] font-medium text-slate-400">
          Projects
        </div>
      </div>
    </div>
  );
}

export function ProjectsRankingChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter((row) => Number(row.total_projects ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.total_projects ?? 0) -
        Number(a.total_projects ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      projects: Number(row.total_projects ?? 0),
    }));

  return (
    <ChartShell height={340}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{
          top: 5,
          right: 25,
          left: 10,
          bottom: 5,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
        />

        <XAxis
          type="number"
          tick={{ fontSize: 10 }}
        />

        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={{ fontSize: 10 }}
          tickFormatter={(value) => shortName(value, 25)}
        />

        <Tooltip
          formatter={(value: number) =>
            `${Number(value).toLocaleString("en-IN")} projects`
          }
        />

        <Bar
          dataKey="projects"
          name="Projects"
          fill="#2563eb"
          radius={[0, 5, 5, 0]}
        />
      </BarChart>
    </ChartShell>
  );
}

export function CostVsExpenditureChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter(
      (row) =>
        Number(row.total_revised_cost_cr ?? 0) > 0 ||
        Number(row.total_expenditure_cr ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        Number(b.total_revised_cost_cr ?? 0) -
        Number(a.total_revised_cost_cr ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      revised_cost: Number(row.total_revised_cost_cr ?? 0),
      expenditure: Number(row.total_expenditure_cr ?? 0),
    }));

  return (
    <ChartShell height={350}>
      <BarChart
        data={rows}
        margin={{
          top: 20,
          right: 20,
          left: 10,
          bottom: 75,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis
          dataKey="name"
          angle={-30}
          textAnchor="end"
          interval={0}
          height={80}
          tick={{ fontSize: 9 }}
          tickFormatter={(value) => shortName(value, 18)}
        />

        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(value) => Number(value).toLocaleString("en-IN")}
        />

        <Tooltip
          formatter={(value: number) => crore(value)}
        />

        <Legend />

        <Bar
          dataKey="revised_cost"
          name="Revised Cost"
          fill="#2563eb"
          radius={[4, 4, 0, 0]}
        />

        <Bar
          dataKey="expenditure"
          name="Expenditure"
          fill="#22a06b"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartShell>
  );
}

export function HealthDistributionChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .slice(0, 12)
    .map((row) => ({
      name: labelFor(row),
      low: Number(row["Low Risk"] ?? 0),
      moderate: Number(row["Moderate Risk"] ?? 0),
      high: Number(row["High Risk"] ?? 0),
      veryHigh: Number(row["Very High Risk"] ?? 0),
    }));

  return (
    <ChartShell height={390}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{
          top: 10,
          right: 20,
          left: 10,
          bottom: 10,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
        />

        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 10 }}
        />

        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={{ fontSize: 9 }}
          tickFormatter={(value) => shortName(value, 25)}
        />

        <Tooltip
          formatter={(value: number) => pct(value)}
        />

        <Legend />

        <Bar
          dataKey="low"
          name="Low Risk"
          stackId="health"
          fill={HEALTH_COLORS.low}
        />

        <Bar
          dataKey="moderate"
          name="Moderate Risk"
          stackId="health"
          fill={HEALTH_COLORS.moderate}
        />

        <Bar
          dataKey="high"
          name="High Risk"
          stackId="health"
          fill={HEALTH_COLORS.high}
        />

        <Bar
          dataKey="veryHigh"
          name="Very High Risk"
          stackId="health"
          fill={HEALTH_COLORS.veryHigh}
        />
      </BarChart>
    </ChartShell>
  );
}

export function DelayAnalysisChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter((row) => Number(row.total_projects ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.total_projects ?? 0) -
        Number(a.total_projects ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      projects: Number(row.total_projects ?? 0),
      delayed: Number(row.delayed_projects ?? 0),
      delay_rate: Number(row.delay_rate_pct ?? 0),
    }));

  return (
    <ChartShell height={360}>
      <BarChart
        data={rows}
        margin={{
          top: 20,
          right: 30,
          left: 5,
          bottom: 80,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis
          dataKey="name"
          angle={-30}
          textAnchor="end"
          interval={0}
          height={85}
          tick={{ fontSize: 9 }}
          tickFormatter={(value) => shortName(value, 18)}
        />

        <YAxis
          yAxisId="left"
          tick={{ fontSize: 10 }}
        />

        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 10 }}
        />

        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "Delay %") {
              return pct(value);
            }

            return Number(value).toLocaleString("en-IN");
          }}
        />

        <Legend />

        <Bar
          yAxisId="left"
          dataKey="projects"
          name="Total Projects"
          fill="#2563eb"
          radius={[4, 4, 0, 0]}
        />

        <Bar
          yAxisId="left"
          dataKey="delayed"
          name="Delayed Projects"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        />

        <Line
          yAxisId="right"
          type="monotone"
          dataKey="delay_rate"
          name="Delay %"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </BarChart>
    </ChartShell>
  );
}

export function TopCostOverrunChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter((row) => row.avg_cost_overrun_pct != null)
    .sort(
      (a, b) =>
        Number(b.avg_cost_overrun_pct ?? 0) -
        Number(a.avg_cost_overrun_pct ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      avg_overrun: Number(row.avg_cost_overrun_pct ?? 0),
      overrun_projects: Number(row.cost_overrun_projects ?? 0),
    }));

  return (
    <ChartShell height={350}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{
          top: 5,
          right: 30,
          left: 10,
          bottom: 5,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
        />

        <XAxis
          type="number"
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 10 }}
        />

        <YAxis
          type="category"
          dataKey="name"
          width={155}
          tick={{ fontSize: 9 }}
          tickFormatter={(value) => shortName(value, 25)}
        />

        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "Avg Overrun %") {
              return pct(value);
            }

            return Number(value).toLocaleString("en-IN");
          }}
        />

        <Bar
          dataKey="avg_overrun"
          name="Avg Overrun %"
          fill="#ef4444"
          radius={[0, 5, 5, 0]}
        />
      </BarChart>
    </ChartShell>
  );
}

export function PerformanceSummaryChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .filter((row) => Number(row.total_projects ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.total_projects ?? 0) -
        Number(a.total_projects ?? 0),
    )
    .slice(0, 10)
    .map((row) => ({
      name: labelFor(row),
      progress: Math.max(
        0,
        Math.min(
          100,
          100 - Number(row.avg_delay_months ?? 0) * 1.2,
        ),
      ),
      expenditure: Number(
        row.expenditure_to_analytical_cost_pct ?? 0,
      ),
      quality: Math.max(
        0,
        Math.min(
          100,
          100 - Number(row.data_quality_rate_pct ?? 0),
        ),
      ),
    }));

  return (
    <div className="space-y-3 py-2">
      {rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span
              className="max-w-[48%] truncate text-[10px] font-medium text-slate-700"
              title={row.name}
            >
              {row.name}
            </span>

            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span>
                Progress {row.progress.toFixed(0)}%
              </span>
              <span>
                Expense {row.expenditure.toFixed(0)}%
              </span>
              <span>
                Quality {row.quality.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${row.progress}%` }}
              />
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, row.expenditure),
                  )}%`,
                }}
              />
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${row.quality}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonthlyTrendChart({
  data,
}: {
  data: AnalyticsRow[];
}) {
  const rows = data
    .slice()
    .sort(
      (a, b) =>
        String(a.snapshot_month ?? "").localeCompare(
          String(b.snapshot_month ?? ""),
        ),
    )
    .slice(-12)
    .map((row) => ({
      month: String(row.snapshot_month ?? "").slice(0, 7),
      delay_rate: Number(row.delay_rate_pct ?? 0),
      cost_overrun_rate: Number(
        row.cost_overrun_rate_pct ?? 0,
      ),
      projects: Number(row.project_count ?? 0),
    }));

  return (
    <ChartShell height={340}>
      <LineChart
        data={rows}
        margin={{
          top: 20,
          right: 20,
          left: 5,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 10 }}
        />

        <YAxis
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 10 }}
        />

        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "Projects") {
              return Number(value).toLocaleString("en-IN");
            }

            return pct(value);
          }}
        />

        <Legend />

        <Line
          type="monotone"
          dataKey="delay_rate"
          name="Delay Rate"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3 }}
        />

        <Line
          type="monotone"
          dataKey="cost_overrun_rate"
          name="Cost Overrun Rate"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ChartShell>
  );
}