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

import type { ProjectAnalyticsProject } from "../../services/api";

interface ProjectAnalyticsChartsProps {
  projects: ProjectAnalyticsProject[];
}

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

    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, value]) => ({
      name,
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

function getRiskData(projects: ProjectAnalyticsProject[]) {
  const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  const counts = new Map<string, number>();

  projects.forEach((project) => {
    const value = project.risk_level || "UNKNOWN";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return order
    .map((name) => ({
      name,
      value: counts.get(name) ?? 0,
    }))
    .filter((item) => item.value > 0);
}

function getSectorDelayData(projects: ProjectAnalyticsProject[]) {
  const sectorMap = new Map<
    string,
    {
      total: number;
      delayed: number;
    }
  >();

  projects.forEach((project) => {
    const sector =
      project.sector && project.sector.trim()
        ? project.sector.trim()
        : "Unknown";

    const current = sectorMap.get(sector) ?? {
      total: 0,
      delayed: 0,
    };

    current.total += 1;

    if (
      project.schedule_status &&
      project.schedule_status.toLowerCase().includes("delay")
    ) {
      current.delayed += 1;
    }

    sectorMap.set(sector, current);
  });

  return Array.from(sectorMap.entries())
    .map(([sector, values]) => ({
      sector,
      delay_rate_pct:
        values.total > 0
          ? Number(((values.delayed / values.total) * 100).toFixed(1))
          : 0,
      total_projects: values.total,
    }))
    .sort((a, b) => b.delay_rate_pct - a.delay_rate_pct)
    .slice(0, 10);
}

export default function ProjectAnalyticsCharts({
  projects,
}: ProjectAnalyticsChartsProps) {
  const riskData = getRiskData(projects);

  const scheduleData = countByField(
    projects,
    "schedule_status",
  );

  const sectorData = countByField(
    projects,
    "sector",
  ).slice(0, 10);

  const ministryData = countByField(
    projects,
    "ministry",
  ).slice(0, 10);

  const sectorDelayData = getSectorDelayData(projects);

  return (
    <section className="space-y-6">
      {/* Row 1 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Risk Distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Risk Distribution
            </h3>
            <p className="text-sm text-slate-500">
              Current model-based risk classification
            </p>
          </div>

          <div className="h-[320px]">
            {riskData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No risk data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={105}
                    innerRadius={65}
                    paddingAngle={3}
                  >
                    {riskData.map((entry, index) => (
                      <Cell
                        key={`risk-${entry.name}-${index}`}
                      />
                    ))}
                  </Pie>

                  <Tooltip
                    formatter={(value: number) =>
                      value.toLocaleString("en-IN")
                    }
                  />

                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Schedule Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Schedule Status
            </h3>
            <p className="text-sm text-slate-500">
              Portfolio-wise schedule classification
            </p>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scheduleData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Projects by Sector */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Projects by Sector
            </h3>
            <p className="text-sm text-slate-500">
              Top sectors by project count
            </p>
          </div>

          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
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
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis type="number" />

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
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Projects by Ministry */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Projects by Ministry
            </h3>
            <p className="text-sm text-slate-500">
              Top ministries by project count
            </p>
          </div>

          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
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
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis type="number" />

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
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900">
            Sector Delay Rate
          </h3>
          <p className="text-sm text-slate-500">
            Top sectors ranked by proportion of delayed projects
          </p>
        </div>

        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
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
              <CartesianGrid strokeDasharray="3 3" />

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
                formatter={(value: number) => [
                  `${value}%`,
                  "Delay Rate",
                ]}
              />

              <Bar
                dataKey="delay_rate_pct"
                name="Delay Rate"
                radius={[0, 6, 6, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}