import { useEffect, useMemo, useState } from "react";
import {
  getProjectAnalyticsFilterOptions,
  getProjectAnalyticsProjects,
  getProjectAnalyticsSummary,
  type ProjectAnalyticsFilterOptions,
  type ProjectAnalyticsProject,
  type ProjectAnalyticsSummary,
} from "../../services/api";
import ProjectAnalyticsCharts from "./ProjectAnalyticsCharts";

const emptyFilters: ProjectAnalyticsFilterOptions = {
  sectors: [],
  ministries: [],
  states: [],
  risk_levels: [],
  schedule_statuses: [],
};

const emptySummary: ProjectAnalyticsSummary = {
  total_projects: 0,
  delayed_projects: 0,
  delay_rate_pct: 0,
  cost_overrun_projects: 0,
  cost_overrun_rate_pct: 0,
  total_original_cost_cr: 0,
  total_revised_cost_cr: 0,
  total_expenditure_cr: 0,
  average_risk_score: 0,
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function riskClass(risk: string | null) {
  switch (risk) {
    case "CRITICAL":
      return "bg-red-100 text-red-700";
    case "HIGH":
      return "bg-orange-100 text-orange-700";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-700";
    case "LOW":
      return "bg-green-100 text-green-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function statusClass(status: string | null) {
  if (status === "Delayed") {
    return "bg-red-100 text-red-700";
  }

  if (status === "On Track") {
    return "bg-green-100 text-green-700";
  }

  if (status === "Accelerated") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-600";
}

export default function ProjectAnalyticsPage() {
  const [filters, setFilters] =
    useState<ProjectAnalyticsFilterOptions>(emptyFilters);

  const [selectedSector, setSelectedSector] = useState("");
  const [selectedMinistry, setSelectedMinistry] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedRisk, setSelectedRisk] = useState("");
  const [selectedSchedule, setSelectedSchedule] = useState("");

  const [summary, setSummary] =
    useState<ProjectAnalyticsSummary>(emptySummary);

  const [projects, setProjects] = useState<ProjectAnalyticsProject[]>([]);

  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const requestParams = useMemo(
    () => ({
      ...(selectedSector ? { sector: selectedSector } : {}),
      ...(selectedMinistry ? { ministry: selectedMinistry } : {}),
      ...(selectedState ? { state: selectedState } : {}),
      ...(selectedRisk ? { risk_level: selectedRisk } : {}),
      ...(selectedSchedule ? { schedule_status: selectedSchedule } : {}),
    }),
    [
      selectedSector,
      selectedMinistry,
      selectedState,
      selectedRisk,
      selectedSchedule,
    ],
  );

  useEffect(() => {
    async function loadFilters() {
      try {
        setLoadingFilters(true);
        setError("");

        const response = await getProjectAnalyticsFilterOptions();
        setFilters(response);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Project Analytics filters.",
        );
      } finally {
        setLoadingFilters(false);
      }
    }

    loadFilters();
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoadingData(true);
        setError("");

        const [summaryResponse, projectsResponse] = await Promise.all([
          getProjectAnalyticsSummary(requestParams),
          getProjectAnalyticsProjects(requestParams),
        ]);

        setSummary(summaryResponse);
        setProjects(projectsResponse.projects);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Project Analytics data.",
        );
      } finally {
        setLoadingData(false);
      }
    }

    loadAnalytics();
  }, [requestParams]);

  function clearFilters() {
    setSelectedSector("");
    setSelectedMinistry("");
    setSelectedState("");
    setSelectedRisk("");
    setSelectedSchedule("");
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* Header */}
        <div>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Project Analytics
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Portfolio-level project monitoring, risk and performance
                analytics.
              </p>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Portfolio Filters
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Filter projects by sector, ministry, state, risk and schedule.
              </p>
            </div>

            {loadingFilters && (
              <span className="text-xs text-slate-400">
                Loading filters...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">

            {/* Sector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Sector
              </label>

              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">All Sectors</option>

                {filters.sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </div>

            {/* Ministry */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Ministry
              </label>

              <select
                value={selectedMinistry}
                onChange={(e) => setSelectedMinistry(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">All Ministries</option>

                {filters.ministries.map((ministry) => (
                  <option key={ministry} value={ministry}>
                    {ministry}
                  </option>
                ))}
              </select>
            </div>

            {/* State */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                State / UT
              </label>

              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">All States / UTs</option>

                {filters.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            {/* Risk */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Risk Level
              </label>

              <select
                value={selectedRisk}
                onChange={(e) => setSelectedRisk(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">All Risk Levels</option>

                {filters.risk_levels.map((risk) => (
                  <option key={risk} value={risk}>
                    {risk}
                  </option>
                ))}
              </select>
            </div>

            {/* Schedule */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Schedule Status
              </label>

              <select
                value={selectedSchedule}
                onChange={(e) => setSelectedSchedule(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">All Schedule Statuses</option>

                {filters.schedule_statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Total Projects
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatNumber(summary.total_projects)}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Projects matching current filters
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Delayed Projects
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatNumber(summary.delayed_projects)}
            </p>

            <p className="mt-2 text-xs text-red-600">
              Delay rate: {formatPercent(summary.delay_rate_pct)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Cost Overrun Projects
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatNumber(summary.cost_overrun_projects)}
            </p>

            <p className="mt-2 text-xs text-orange-600">
              Overrun rate: {formatPercent(summary.cost_overrun_rate_pct)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Average Risk Score
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {summary.average_risk_score.toFixed(1)}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Model-based portfolio risk
            </p>
          </div>
        </section>

        {/* Financial Summary */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-400">
              Original Cost
            </p>

            <p className="mt-2 text-xl font-bold text-slate-900">
              ₹ {formatNumber(summary.total_original_cost_cr)} Cr
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-400">
              Revised Cost
            </p>

            <p className="mt-2 text-xl font-bold text-slate-900">
              ₹ {formatNumber(summary.total_revised_cost_cr)} Cr
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-400">
              Expenditure
            </p>

            <p className="mt-2 text-xl font-bold text-slate-900">
              ₹ {formatNumber(summary.total_expenditure_cr)} Cr
            </p>
          </div>
        </section>

        <ProjectAnalyticsCharts projects={projects ?? []} />

        {/* Project Table */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Project Portfolio
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                {projects.length.toLocaleString("en-IN")} projects returned
              </p>
            </div>

            {loadingData && (
              <span className="text-xs text-slate-400">
                Loading...
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Project
                  </th>

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sector
                  </th>

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ministry
                  </th>

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    State / UT
                  </th>

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Risk
                  </th>

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Schedule
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr
                    key={project.project_code}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <div className="max-w-[360px]">
                        <p className="text-xs font-semibold text-slate-400">
                          {project.project_code}
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {project.project_name}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {project.sector || "—"}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {project.ministry || "—"}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {project.flash_state || "—"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskClass(
                          project.risk_level,
                        )}`}
                      >
                        {project.risk_level || "N/A"}
                      </span>

                      {project.overall_risk_score !== null && (
                        <div className="mt-1 text-xs text-slate-400">
                          {project.overall_risk_score.toFixed(1)}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          project.schedule_status,
                        )}`}
                      >
                        {project.schedule_status || "—"}
                      </span>
                    </td>
                  </tr>
                ))}

                {!loadingData && projects.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      No projects found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}