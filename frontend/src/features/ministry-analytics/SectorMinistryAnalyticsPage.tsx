import {
  ProjectsBySectorChart,
  ProjectsRankingChart,
  CostVsExpenditureChart,
  HealthDistributionChart,
  DelayAnalysisChart,
  TopCostOverrunChart,
  PerformanceSummaryChart,
  MonthlyTrendChart,
} from "../../components/charts/SectorMinistryCharts";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  Database,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  getSectorMinistryAnalytics,
  type SummaryRow,
} from "../../services/sectorMinistryApi";

function formatCrore(value: number): string {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L Cr`;
  }

  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(2)}K Cr`;
  }

  return `₹${value.toFixed(2)} Cr`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(
    Math.round(value),
  );
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function healthClass(value: number): string {
  if (value >= 75) {
    return "text-red-600";
  }

  if (value >= 50) {
    return "text-orange-600";
  }

  if (value >= 25) {
    return "text-yellow-600";
  }

  return "text-emerald-600";
}

export default function SectorMinistryAnalyticsPage() {
  const [viewBy, setViewBy] = useState<"sector" | "ministry">("sector");
  const [ministry, setMinistry] = useState("All Ministries");
  const [sector, setSector] = useState("All Sectors");
  const [state, setState] = useState("All States");
  const [financialYear, setFinancialYear] = useState("All Years");
  const [snapshotMonth, setSnapshotMonth] = useState("All Months");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "sector-ministry-analytics",
      viewBy,
      ministry,
      sector,
      state,
      financialYear,
      snapshotMonth,
    ],
    queryFn: () =>
      getSectorMinistryAnalytics({
        view_by: viewBy,
        ministry,
        sector,
        state,
        financial_year: financialYear,
        snapshot_month: snapshotMonth,
      }),
    staleTime: 60_000,
  });

  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (!data) {
      return [];
    }

    return viewBy === "sector"
      ? data.sector_summary
      : data.ministry_summary;
  }, [data, viewBy]);

  const trends = data
    ? viewBy === "sector"
      ? data.monthly_trends.sector
      : data.monthly_trends.ministry
    : [];

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <BarChart3 size={13} />
              Portfolio Intelligence
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Sector / Ministry Analytics
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Descriptive, diagnostic and rule-based infrastructure
              portfolio analytics.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Filters */}
<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="mb-3 text-xs font-semibold text-slate-800">
    Analytics Filters
  </div>

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
    {/* View By */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        View By
      </span>

      <select
        value={viewBy}
        onChange={(event) =>
          setViewBy(
            event.target.value as "sector" | "ministry",
          )
        }
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="sector">Sector</option>
        <option value="ministry">Ministry</option>
      </select>
    </label>

    {/* Ministry */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Ministry
      </span>

      <select
        value={ministry}
        onChange={(event) => setMinistry(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="All Ministries">
          All Ministries
        </option>

        {data?.ministry_summary
          ?.map((row) => row.ministry)
          .filter(
            (value): value is string =>
              Boolean(value),
          )
          .sort((a, b) => a.localeCompare(b))
          .map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
      </select>
    </label>

    {/* Sector */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Sector
      </span>

      <select
        value={sector}
        onChange={(event) => setSector(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="All Sectors">
          All Sectors
        </option>

        {data?.sector_summary
          ?.map((row) => row.sector)
          .filter(
            (value): value is string =>
              Boolean(value),
          )
          .sort((a, b) => a.localeCompare(b))
          .map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
      </select>
    </label>

    {/* State */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        State
      </span>

      <select
        value={state}
        onChange={(event) => setState(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="All States">
          All States
        </option>

        {/* State options will be added from backend filter_options */}
      </select>
    </label>

    {/* Financial Year */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Financial Year
      </span>

      <select
        value={financialYear}
        onChange={(event) =>
          setFinancialYear(event.target.value)
        }
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="All Years">
          All Years
        </option>

        <option value="FY 2025-26">
          FY 2025-26
        </option>

        <option value="FY 2024-25">
          FY 2024-25
        </option>

        <option value="FY 2023-24">
          FY 2023-24
        </option>

        <option value="FY 2022-23">
          FY 2022-23
        </option>

        <option value="FY 2021-22">
          FY 2021-22
        </option>
      </select>
    </label>

    {/* Snapshot Month */}
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Snapshot Month
      </span>

      <select
        value={snapshotMonth}
        onChange={(event) =>
          setSnapshotMonth(event.target.value)
        }
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <option value="All Months">
          All Months
        </option>

        <option value="2026-03">
          March 2026
        </option>

        <option value="2026-02">
          February 2026
        </option>

        <option value="2026-01">
          January 2026
        </option>

        <option value="2025-12">
          December 2025
        </option>

        <option value="2025-11">
          November 2025
        </option>

        <option value="2025-10">
          October 2025
        </option>

        <option value="2025-09">
          September 2025
        </option>

        <option value="2025-08">
          August 2025
        </option>

        <option value="2025-07">
          July 2025
        </option>

        <option value="2025-06">
          June 2025
        </option>

        <option value="2025-05">
          May 2025
        </option>

        <option value="2025-04">
          April 2025
        </option>
      </select>
    </label>
  </div>
</div>

        {/* Loading */}
        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-sm font-medium text-slate-700">
              Loading portfolio analytics...
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Processing sector and ministry data.
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <AlertTriangle size={16} />
              Unable to load analytics
            </div>

            <div className="mt-1 text-xs text-red-600">
              {error instanceof Error
                ? error.message
                : "The analytics API returned an error."}
            </div>
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && data && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Total Projects
                  </span>
                  <Building2 size={16} className="text-slate-400" />
                </div>

                <div className="mt-3 text-2xl font-semibold text-slate-900">
                  {formatNumber(
                    data.portfolio_summary.kpis.total_projects,
                  )}
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  Selected portfolio
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Delay Rate
                  </span>
                  <TrendingDown size={16} className="text-orange-500" />
                </div>

                <div className="mt-3 text-2xl font-semibold text-orange-600">
                  {formatPct(data.portfolio_summary.kpis.delay_rate_pct)}
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  {formatNumber(
                    data.portfolio_summary.kpis.delayed_projects,
                  )}{" "}
                  delayed projects
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Cost Overrun Rate
                  </span>
                  <TrendingUp size={16} className="text-red-500" />
                </div>

                <div className="mt-3 text-2xl font-semibold text-red-600">
                  {formatPct(
                    data.portfolio_summary.kpis.cost_overrun_rate_pct,
                  )}
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  {formatNumber(
                    data.portfolio_summary.kpis.cost_overrun_projects,
                  )}{" "}
                  projects
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Cost Exposure
                  </span>
                  <Database size={16} className="text-slate-400" />
                </div>

                <div className="mt-3 text-xl font-semibold text-slate-900">
                  {formatCrore(
                    data.portfolio_summary.kpis
                      .total_cost_change_exposure_cr,
                  )}
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  Validated positive cost-change exposure
                </div>
              </div>
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Original Cost
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCrore(
                    data.portfolio_summary.kpis
                      .total_original_cost_cr,
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Revised Cost
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCrore(
                    data.portfolio_summary.kpis
                      .total_revised_cost_cr,
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Expenditure
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCrore(
                    data.portfolio_summary.kpis.total_expenditure_cr,
                  )}
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {viewBy === "sector"
                      ? "Projects by Sector"
                      : "Projects by Ministry"}
                  </div>

                  <div className="text-xs text-slate-400">
                    Top 10 groups by project count.
                  </div>
                </div>

                <ProjectsBySectorChart data={summaryRows} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {viewBy === "sector"
                      ? "Projects by Sector"
                      : "Projects by Ministry"}{" "}
                    <span className="font-normal text-slate-400">
                      (Top 10)
                    </span>
                  </div>

                  <div className="text-xs text-slate-400">
                    Project concentration across the selected portfolio.
                  </div>
                </div>

                <ProjectsRankingChart data={summaryRows} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2">
                <div className="text-sm font-semibold text-slate-800">
                  Revised Cost vs Expenditure{" "}
                  {viewBy === "sector" ? "by Sector" : "by Ministry"}
                </div>

                <div className="text-xs text-slate-400">
                  Financial comparison across the selected portfolio.
                </div>
              </div>

              <CostVsExpenditureChart data={summaryRows} />

            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Project Health by{" "}
                    {viewBy === "sector" ? "Sector" : "Ministry"}
                  </div>

                  <div className="text-xs text-slate-400">
                    Rule-based V1 health distribution; not the ML risk model.
                  </div>
                </div>

                <HealthDistributionChart
                  data={
                    viewBy === "sector"
                      ? data.health_analysis.sector
                      : data.health_analysis.ministry
                  }
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Delay Analysis by{" "}
                    {viewBy === "sector" ? "Sector" : "Ministry"}
                  </div>

                  <div className="text-xs text-slate-400">
                    Total projects, delayed projects and delay percentage.
                  </div>
                </div>

                <DelayAnalysisChart
                  data={
                    viewBy === "sector"
                      ? data.delay_analysis.sector
                      : data.delay_analysis.ministry
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Top{" "}
                    {viewBy === "sector"
                      ? "Sectors"
                      : "Ministries"}{" "}
                    by Cost Overrun
                  </div>

                  <div className="text-xs text-slate-400">
                    Average observed cost-overrun percentage.
                  </div>
                </div>

                <TopCostOverrunChart
                  data={
                    viewBy === "sector"
                      ? data.cost_analysis.sector
                      : data.cost_analysis.ministry
                  }
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {viewBy === "sector"
                      ? "Sector Performance Summary"
                      : "Ministry Performance Summary"}
                  </div>

                  <div className="text-xs text-slate-400">
                    Relative progress, expenditure and data-quality indicators.
                  </div>
                </div>

                <PerformanceSummaryChart data={summaryRows} />
              </div>
            </div>

            {/* Summary table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {viewBy === "sector"
                      ? "Sector Performance"
                      : "Ministry Performance"}
                  </div>

                  <div className="mt-0.5 text-xs text-slate-400">
                    {summaryRows.length} groups
                  </div>
                </div>

                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                  {data.metadata.version}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {viewBy === "sector" ? "Sector" : "Ministry"}
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Projects
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Delay Rate
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Cost Overrun
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Avg Delay
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Cost Exposure
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {summaryRows.slice(0, 15).map((row) => (
                      <tr
                        key={row.sector ?? row.ministry}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-slate-800">
                          {row.sector ?? row.ministry}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-600">
                          {formatNumber(row.total_projects)}
                        </td>

                        <td className="px-4 py-3 text-xs text-orange-600">
                          {formatPct(row.delay_rate_pct)}
                        </td>

                        <td className="px-4 py-3 text-xs text-red-600">
                          {formatPct(row.cost_overrun_rate_pct)}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-600">
                          {row.avg_delay_months.toFixed(1)} mo
                        </td>

                        <td className="px-4 py-3 text-xs font-medium text-slate-700">
                          {row.total_cost_change_exposure_cr != null
                            ? formatCrore(
                                row.total_cost_change_exposure_cr,
                              )
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insights + warnings */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-500" />

                  <h2 className="text-sm font-semibold text-slate-800">
                    Key Insights
                  </h2>
                </div>

                <div className="space-y-2">
                  {data.key_insights.map((insight) => (
                    <div
                      key={`${insight.title}-${insight.group ?? ""}`}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="text-xs font-semibold text-slate-800">
                        {insight.title}
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {insight.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-slate-500" />

                  <h2 className="text-sm font-semibold text-slate-800">
                    Early Warnings
                  </h2>
                </div>

                <div className="space-y-2">
                  {data.early_warnings.slice(0, 6).map((warning) => (
                    <div
                      key={warning.title}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-800">
                          {warning.title}
                        </div>

                        <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase text-red-600">
                          {warning.severity}
                        </span>
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {warning.message}
                      </div>
                    </div>
                  ))}

                  {data.early_warnings.length === 0 && (
                    <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
                      No rule-based warnings for the selected portfolio.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Health analysis */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-semibold text-slate-800">
                  V1 Project Health Distribution
                </div>

                <div className="mt-0.5 text-xs text-slate-400">
                  Rule-based health score; not the ML risk model.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Group
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                        Low
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-yellow-600">
                        Moderate
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-orange-600">
                        High
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                        Very High
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {(viewBy === "sector"
                      ? data.health_analysis.sector
                      : data.health_analysis.ministry
                    )
                      .slice(0, 12)
                      .map((row) => (
                        <tr key={row.sector ?? row.ministry}>
                          <td className="px-4 py-3 text-xs font-medium text-slate-800">
                            {row.sector ?? row.ministry}
                          </td>

                          <td className="px-4 py-3 text-xs font-semibold text-emerald-600">
                            {row["Low Risk"].toFixed(1)}%
                          </td>

                          <td className="px-4 py-3 text-xs font-semibold text-yellow-600">
                            {row["Moderate Risk"].toFixed(1)}%
                          </td>

                          <td className="px-4 py-3 text-xs font-semibold text-orange-600">
                            {row["High Risk"].toFixed(1)}%
                          </td>

                          <td className="px-4 py-3 text-xs font-semibold text-red-600">
                            {row["Very High Risk"].toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Priority projects */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-semibold text-slate-800">
                  Priority Projects
                </div>

                <div className="mt-0.5 text-xs text-slate-400">
                  Highest V1 health-score exposure in the selected portfolio.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Project
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Sector
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        State
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Health
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Delay
                      </th>

                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Cost Overrun
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {data.priority_projects.slice(0, 10).map((project) => (
                      <tr
                        key={project.project_code}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-800">
                            {project.project_code}
                          </div>

                          <div className="mt-0.5 max-w-xs text-[11px] text-slate-400">
                            {project.project_name}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-600">
                          {project.sector}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-600">
                          {project.state}
                        </td>

                        <td className="px-4 py-3">
                          <div
                            className={`text-sm font-semibold ${healthClass(
                              project.health_score_v1,
                            )}`}
                          >
                            {project.health_score_v1}
                          </div>

                          <div className="text-[10px] text-slate-400">
                            {project.health_band_v1}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs text-orange-600">
                          {project.delay_months.toFixed(1)} mo
                        </td>

                        <td className="px-4 py-3 text-xs text-red-600">
                          {project.cost_overrun_pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data quality */}
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <Database size={14} />
                  Data Quality
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  {data.data_quality.definition}
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-lg font-semibold text-slate-900">
                  {data.data_quality.projects_flagged}
                </div>

                <div className="text-[11px] text-slate-400">
                  {data.data_quality.rate_pct.toFixed(2)}% flagged
                </div>
              </div>
            </div>

            {/* Monthly trend chart */}
            {trends.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays size={15} className="text-slate-500" />

                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Monthly Performance Trend
                    </div>

                    <div className="text-xs text-slate-400">
                      Delay rate and cost-overrun rate over the latest monthly observations.
                    </div>
                  </div>
                </div>

                <MonthlyTrendChart data={trends} />
              </div>
            )}

            {/* Monthly trend */}
            {trends.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays size={15} className="text-slate-500" />

                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Monthly Trend Data
                    </div>

                    <div className="text-xs text-slate-400">
                      Latest monthly observations from the analytics service.
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left">
                    <thead className="border-b border-slate-100 bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Month
                        </th>

                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Projects
                        </th>

                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Delay Rate
                        </th>

                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Cost Overrun Rate
                        </th>

                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Expenditure
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {trends.slice(-12).map((trend) => (
                        <tr
                          key={`${trend.snapshot_month}-${trend.sector ?? trend.ministry ?? ""}`}
                        >
                          <td className="px-4 py-3 text-xs text-slate-700">
                            {trend.snapshot_month.slice(0, 7)}
                          </td>

                          <td className="px-4 py-3 text-xs text-slate-600">
                            {formatNumber(trend.project_count)}
                          </td>

                          <td className="px-4 py-3 text-xs text-orange-600">
                            {formatPct(trend.delay_rate_pct)}
                          </td>

                          <td className="px-4 py-3 text-xs text-red-600">
                            {formatPct(trend.cost_overrun_rate_pct)}
                          </td>

                          <td className="px-4 py-3 text-xs text-slate-700">
                            {formatCrore(trend.expenditure_cr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}