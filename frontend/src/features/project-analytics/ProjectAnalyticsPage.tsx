import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import {
  getProjectAnalyticsDetail,
  getProjectAnalyticsFilterOptions,
  getProjectAnalyticsProjects,
  getProjectAnalyticsSummary,
  simulateProjectAnalytics,
  type ProjectAnalyticsDetail,
  type ProjectAnalyticsFilterOptions,
  type ProjectAnalyticsProject,
  type ProjectAnalyticsSummary,
  type ProjectAnalyticsWhatIfResponse,
} from "../../services/api";
import ProjectAnalyticsCharts from "./ProjectAnalyticsCharts";

import ProjectAnalyticsDetailCharts from "./ProjectAnalyticsDetailCharts";

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

  if (status === "On Track" || status === "On Schedule") {
    return "bg-green-100 text-green-700";
  }

  if (status === "Accelerated") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-600";
}

type MultiSelectDropdownProps = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
};

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "Search...",
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLowerCase();

    const filtered = normalizedQuery
      ? options.filter((option) =>
        option
          .toLowerCase()
          .includes(normalizedQuery),
      )
      : options;

    return [...filtered].sort((a, b) => {
      const aSelected = selected.includes(a);
      const bSelected = selected.includes(b);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      return a.localeCompare(b);
    });
  }, [options, query, selected]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(
        selected.filter(
          (item) => item !== value,
        ),
      );
      return;
    }

    onChange([
      ...selected,
      value,
    ]);
  }

  function clearSelection(
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    onChange([]);
  }

  const selectionLabel =
    selected.length === 0
      ? `All ${label}s`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <label className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition ${open
          ? "border-slate-400 ring-2 ring-slate-100"
          : "border-slate-200 hover:border-slate-300"
          }`}
      >
        <span
          className={`min-w-0 truncate text-sm ${selected.length > 0
            ? "font-medium text-slate-800"
            : "text-slate-400"
            }`}
        >
          {selectionLabel}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {selected.length > 0 && (
            <span
              onClick={clearSelection}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
            >
              {selected.length}
            </span>
          )}

          <span
            className={`text-xs text-slate-400 transition-transform ${open ? "rotate-180" : ""
              }`}
          >
            ▼
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-3">
            <input
              type="text"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              onClick={(event) =>
                event.stopPropagation()
              }
              placeholder={placeholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />

            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {selected.length > 0
                  ? `${selected.length} selected`
                  : "Nothing selected"}
              </span>

              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                No matching options
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked =
                  selected.includes(option);

                return (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition ${checked
                      ? "bg-slate-50"
                      : "hover:bg-slate-50"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleValue(option)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                    />

                    <span className="min-w-0 text-xs leading-5 text-slate-700">
                      {option}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function numberValue(
  value: unknown,
  fallback = null,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export default function ProjectAnalyticsPage() {
  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  const projectFromUrl =
    searchParams.get("project")?.trim() || "";

  const [filters, setFilters] =
    useState<ProjectAnalyticsFilterOptions>(emptyFilters);

  const [selectedSector, setSelectedSector] = useState<string[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<string[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<string[]>([]);
  const [search, setSearch] = useState(
    projectFromUrl,
  );

  const [summary, setSummary] =
    useState<ProjectAnalyticsSummary>(emptySummary);

  const [projects, setProjects] =
    useState<ProjectAnalyticsProject[]>([]);

  const [selectedProjectCode, setSelectedProjectCode] =
    useState(projectFromUrl);

  const [projectDetail, setProjectDetail] =
    useState<ProjectAnalyticsDetail | null>(null);

  const [loadingProjectDetail, setLoadingProjectDetail] =
    useState(false);

  const [whatIfResult, setWhatIfResult] =
    useState<ProjectAnalyticsWhatIfResponse | null>(null);

  const [whatIfLoading, setWhatIfLoading] =
    useState(false);

  const [scenario, setScenario] = useState({
    physical_progress_delta: 0,
    schedule_delay_days: 0,
    monthly_expenditure_change_cr: 0,
    revised_cost_change_cr: 0,
  });

  const [loadingFilters, setLoadingFilters] =
    useState(true);

  const [loadingData, setLoadingData] =
    useState(false);

  const [error, setError] =
    useState("");

  const effectiveSearch =
    projectFromUrl || search.trim();

  const requestParams = useMemo(
    () => ({
      ...(selectedSector.length > 0
        ? { sector: selectedSector }
        : {}),
      ...(selectedMinistry.length > 0
        ? { ministry: selectedMinistry }
        : {}),
      ...(selectedState.length > 0
        ? { state: selectedState }
        : {}),
      ...(selectedRisk.length > 0
        ? { risk_level: selectedRisk }
        : {}),
      ...(selectedSchedule.length > 0
        ? { schedule_status: selectedSchedule }
        : {}),
      ...(effectiveSearch
        ? { search: effectiveSearch }
        : {}),
    }),
    [
      selectedSector,
      selectedMinistry,
      selectedState,
      selectedRisk,
      selectedSchedule,
      effectiveSearch,
    ],
  );



  useEffect(() => {
    async function loadFilters() {
      try {
        setLoadingFilters(true);
        setError("");

        const response =
          await getProjectAnalyticsFilterOptions();

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

        const [
          summaryResponse,
          projectsResponse,
        ] = await Promise.all([
          getProjectAnalyticsSummary(
            requestParams,
          ),
          getProjectAnalyticsProjects(
            requestParams,
          ),
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


  useEffect(() => {
    if (!selectedProjectCode) {
      setProjectDetail(null);
      setWhatIfResult(null);
      return;
    }

    async function loadProjectDetail() {
      try {
        setLoadingProjectDetail(true);
        setError("");

        const response =
          await getProjectAnalyticsDetail(
            selectedProjectCode,
          );

        setProjectDetail(response);
        setWhatIfResult(null);

        setScenario({
          physical_progress_delta: 0,
          schedule_delay_days: 0,
          monthly_expenditure_change_cr: 0,
          revised_cost_change_cr: 0,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load project details.",
        );

        setProjectDetail(null);
      } finally {
        setLoadingProjectDetail(false);
      }
    }

    loadProjectDetail();
  }, [selectedProjectCode]);

  function clearFilters() {
    setSelectedSector([]);
    setSelectedMinistry([]);
    setSelectedState([]);
    setSelectedRisk([]);
    setSelectedSchedule([]);
    setSearch("");
  }

  function updateScenario(
    field:
      | "physical_progress_delta"
      | "schedule_delay_days"
      | "monthly_expenditure_change_cr"
      | "revised_cost_change_cr",
    value: number,
  ) {
    setScenario((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function runWhatIf() {
    if (!selectedProjectCode) {
      return;
    }

    try {
      setWhatIfLoading(true);
      setError("");

      const response =
        await simulateProjectAnalytics(
          selectedProjectCode,
          scenario,
        );

      setWhatIfResult(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run What-If simulation.",
      );
    } finally {
      setWhatIfLoading(false);
    }
  }

  function resetWhatIf() {
    setScenario({
      physical_progress_delta: 0,
      schedule_delay_days: 0,
      monthly_expenditure_change_cr: 0,
      revised_cost_change_cr: 0,
    });

    setWhatIfResult(null);
  }

  const projectInfo =
    projectDetail?.project;

  const keyFacts =
    projectDetail?.key_facts;

  const risk =
    projectDetail?.risk;

  const selectedRiskLevel =
    typeof risk?.risk_level === "string"
      ? risk.risk_level
      : null;

  const selectedRiskScore =
    numberValue(risk?.overall_risk);

  const selectedDelayProbability =
    numberValue(risk?.future_delay);

  const selectedProgressStall =
    numberValue(risk?.progress_stall);

  const selectedCostRisk =
    numberValue(risk?.cost_risk);

  const selectedPhysicalProgress =
    numberValue(keyFacts?.physical_progress_pct);

  const selectedDelayDays =
    numberValue(keyFacts?.delay_days);

  const selectedOriginalCost =
    numberValue(keyFacts?.original_cost_cr);

  const selectedExpenditure =
    numberValue(keyFacts?.expenditure_cr);

  const selectedProjectName =
    typeof projectInfo?.project_name === "string"
      ? projectInfo.project_name
      : selectedProjectCode;

  const baseline =
    whatIfResult?.baseline;

  const simulated =
    whatIfResult?.scenario;

  const change =
    whatIfResult?.change;

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
            <MultiSelectDropdown
              label="Sector"
              options={filters.sectors}
              selected={selectedSector}
              onChange={setSelectedSector}
              placeholder="Search sectors..."
            />

            <MultiSelectDropdown
              label="Ministry"
              options={filters.ministries}
              selected={selectedMinistry}
              onChange={setSelectedMinistry}
              placeholder="Search ministries..."
            />

            <MultiSelectDropdown
              label="State / UT"
              options={filters.states}
              selected={selectedState}
              onChange={setSelectedState}
              placeholder="Search states..."
            />

            <MultiSelectDropdown
              label="Risk Level"
              options={filters.risk_levels}
              selected={selectedRisk}
              onChange={setSelectedRisk}
              placeholder="Search risk levels..."
            />

            <MultiSelectDropdown
              label="Schedule Status"
              options={filters.schedule_statuses}
              selected={selectedSchedule}
              onChange={setSelectedSchedule}
              placeholder="Search schedule status..."
            />
          </div>

          {/* Search */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Search Project
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) => {
                const value =
                  e.target.value;

                setSearch(value);

                /*
                 * Manual search means the user is
                 * leaving project-specific analysis.
                 */
                if (
                  searchParams.has("project")
                ) {
                  setSelectedProjectCode("");

                  const nextParams =
                    new URLSearchParams(
                      searchParams,
                    );

                  nextParams.delete(
                    "project",
                  );

                  setSearchParams(
                    nextParams,
                    {
                      replace: true,
                    },
                  );
                }
              }}
              placeholder="Search by project code or project name..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
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
              {formatNumber(summary.average_risk_score)}
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

        {!search.trim() && !selectedProjectCode && (
          <ProjectAnalyticsCharts
            projects={projects ?? []}
          />
        )}

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

                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Analysis
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr
                    key={project.project_code}
                    className={`transition hover:bg-slate-50 ${selectedProjectCode === project.project_code
                      ? "bg-slate-50"
                      : ""
                      }`}
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

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectCode(
                            project.project_code,
                          );

                          setSearch(
                            project.project_code,
                          );

                          setSearchParams(
                            {
                              project:
                                project.project_code,
                            },
                            {
                              replace: true,
                            },
                          );
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}

                {!loadingData && projects.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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

        {/* Project Detail */}
        {
          selectedProjectCode && (
            <section className="space-y-6">

              <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Selected Project
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selectedProjectName}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Project Code: {selectedProjectCode}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectCode("");
                    setSearch("");

                    const nextParams =
                      new URLSearchParams(
                        searchParams,
                      );

                    nextParams.delete(
                      "project",
                    );

                    setSearchParams(
                      nextParams,
                      {
                        replace: true,
                      },
                    );
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Close Analysis
                </button>
              </div>

              {loadingProjectDetail && (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  Loading project analysis...
                </div>
              )}

              {!loadingProjectDetail && projectDetail && (
                <>
                  {/* Project Header / Key Facts */}
                  <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Risk Score
                      </p>

                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {formatNumber(selectedRiskScore)}
                      </p>

                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskClass(
                            selectedRiskLevel,
                          )}`}
                        >
                          {selectedRiskLevel || "N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Future Delay Probability
                      </p>

                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {formatPercent(selectedDelayProbability)}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        Model-based prediction
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Physical Progress
                      </p>

                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {formatPercent(selectedPhysicalProgress)}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        Latest available progress
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Delay Days
                      </p>

                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {formatNumber(selectedDelayDays)}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        Recorded schedule delay
                      </p>
                    </div>
                  </section>

                  {/* Project Facts */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Project Overview
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

                      <div>
                        <p className="text-xs text-slate-400">
                          Ministry
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.ministry === "string"
                            ? projectInfo.ministry
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Sector
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.sector === "string"
                            ? projectInfo.sector
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          State / UT
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.state === "string"
                            ? projectInfo.state
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Implementing Agency
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.implementing_agency === "string"
                            ? projectInfo.implementing_agency
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Schedule Status
                        </p>

                        <div className="mt-1">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                              typeof projectInfo?.schedule_status === "string"
                                ? projectInfo.schedule_status
                                : null,
                            )}`}
                          >
                            {typeof projectInfo?.schedule_status === "string"
                              ? projectInfo.schedule_status
                              : "—"}
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Original Completion
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.original_completion === "string"
                            ? projectInfo.original_completion
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Revised Completion
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {typeof projectInfo?.revised_completion === "string"
                            ? projectInfo.revised_completion
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Original Cost
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-800">
                          ₹ {formatNumber(selectedOriginalCost)} Cr
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Risk Breakdown */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Risk Breakdown
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">

                      <div className="rounded-lg bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          Cost Risk
                        </p>

                        <p className="mt-2 text-2xl font-bold text-slate-900">
                          {formatPercent(selectedCostRisk)}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          Future Delay
                        </p>

                        <p className="mt-2 text-2xl font-bold text-slate-900">
                          {formatPercent(selectedDelayProbability)}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          Progress Stall
                        </p>

                        <p className="mt-2 text-2xl font-bold text-slate-900">
                          {formatPercent(selectedProgressStall)}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          Overall Risk
                        </p>

                        <p className="mt-2 text-2xl font-bold text-slate-900">
                          {formatNumber(selectedRiskScore)}
                        </p>
                      </div>
                    </div>
                  </section>

                  <ProjectAnalyticsDetailCharts
                    history={projectDetail.history}
                    flashHistory={projectDetail.flash_history}
                    progressTrajectory={
                      projectDetail.progress_trajectory
                    }
                    riskTrajectory={
                      projectDetail.risk_trajectory
                    }
                  />

                  {/* Delay Reasons */}
                  {projectDetail.delay_reasons.length > 0 && (
                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Reasons for Delay
                        </h3>
                      </div>

                      <div className="space-y-3">
                        {projectDetail.delay_reasons.map(
                          (reason, index) => (
                            <div
                              key={`${reason.title}-${index}`}
                              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                            >
                              <p className="text-sm font-semibold text-slate-800">
                                {reason.title}
                              </p>

                              <p className="mt-1 text-sm text-slate-600">
                                {reason.explanation}
                              </p>

                              <div className="mt-3 rounded-lg bg-white p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Recommended Solution
                                </p>

                                <p className="mt-1 text-sm text-slate-700">
                                  {reason.recommended_solution}
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </section>
                  )}

                  {/* What-If Simulator */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5">
                      <h3 className="text-lg font-semibold text-slate-900">
                        What-If Risk Simulator
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        Adjust project assumptions and compare baseline versus scenario risk.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

                      {/* Physical Progress */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">
                            Physical Progress Change
                          </label>

                          <span className="text-sm font-semibold text-slate-900">
                            {scenario.physical_progress_delta > 0
                              ? "+"
                              : ""}
                            {scenario.physical_progress_delta}%
                          </span>
                        </div>

                        <input
                          type="range"
                          min={-30}
                          max={30}
                          step={1}
                          value={scenario.physical_progress_delta}
                          onChange={(e) =>
                            updateScenario(
                              "physical_progress_delta",
                              Number(e.target.value),
                            )
                          }
                          className="mt-3 w-full"
                        />

                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>-30%</span>
                          <span>0%</span>
                          <span>+30%</span>
                        </div>
                      </div>

                      {/* Delay */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">
                            Additional Schedule Delay
                          </label>

                          <span className="text-sm font-semibold text-slate-900">
                            {scenario.schedule_delay_days > 0
                              ? "+"
                              : ""}
                            {scenario.schedule_delay_days} days
                          </span>
                        </div>

                        <input
                          type="range"
                          min={-365}
                          max={365}
                          step={1}
                          value={scenario.schedule_delay_days}
                          onChange={(e) =>
                            updateScenario(
                              "schedule_delay_days",
                              Number(e.target.value),
                            )
                          }
                          className="mt-3 w-full"
                        />

                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>-365</span>
                          <span>0</span>
                          <span>+365</span>
                        </div>
                      </div>

                      {/* Expenditure */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">
                            Monthly Expenditure Change
                          </label>

                          <span className="text-sm font-semibold text-slate-900">
                            {scenario.monthly_expenditure_change_cr > 0
                              ? "+"
                              : ""}
                            ₹ {scenario.monthly_expenditure_change_cr} Cr
                          </span>
                        </div>

                        <input
                          type="range"
                          min={-200}
                          max={200}
                          step={1}
                          value={
                            scenario.monthly_expenditure_change_cr
                          }
                          onChange={(e) =>
                            updateScenario(
                              "monthly_expenditure_change_cr",
                              Number(e.target.value),
                            )
                          }
                          className="mt-3 w-full"
                        />

                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>-₹200 Cr</span>
                          <span>₹0</span>
                          <span>+₹200 Cr</span>
                        </div>
                      </div>

                      {/* Revised Cost */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">
                            Revised Cost Change
                          </label>

                          <span className="text-sm font-semibold text-slate-900">
                            {scenario.revised_cost_change_cr > 0
                              ? "+"
                              : ""}
                            ₹ {scenario.revised_cost_change_cr} Cr
                          </span>
                        </div>

                        <input
                          type="range"
                          min={-500}
                          max={500}
                          step={1}
                          value={scenario.revised_cost_change_cr}
                          onChange={(e) =>
                            updateScenario(
                              "revised_cost_change_cr",
                              Number(e.target.value),
                            )
                          }
                          className="mt-3 w-full"
                        />

                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>-₹500 Cr</span>
                          <span>₹0</span>
                          <span>+₹500 Cr</span>
                        </div>
                      </div>
                    </div>

                    {/* Simulator Actions */}
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={runWhatIf}
                        disabled={whatIfLoading}
                        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {whatIfLoading
                          ? "Running Simulation..."
                          : "Run What-If Simulation"}
                      </button>

                      <button
                        type="button"
                        onClick={resetWhatIf}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Reset Scenario
                      </button>
                    </div>

                    {/* What-If Result */}
                    {whatIfResult && (
                      <div className="mt-6 space-y-5">

                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">
                            Scenario Comparison
                          </h4>

                          <p className="mt-1 text-xs text-slate-500">
                            Baseline versus simulated project risk.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

                          {/* Baseline */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Baseline
                            </p>

                            <p className="mt-3 text-3xl font-bold text-slate-900">
                              {formatNumber(
                                numberValue(
                                  baseline?.overall_risk,
                                ),
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Overall Risk
                            </p>

                            <div className="mt-4 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Delay Probability
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      baseline?.delay_probability,
                                    ) !== null
                                      ? numberValue(
                                        baseline?.delay_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Progress Stall
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      baseline?.stall_probability,
                                    ) !== null
                                      ? numberValue(
                                        baseline?.stall_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Predicted Cost Overrun
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      baseline?.predicted_cost_overrun,
                                    ),
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Cost Risk
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      baseline?.cost_risk,
                                    ),
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Scenario */}
                          <div className="rounded-xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Scenario
                            </p>

                            <p className="mt-3 text-3xl font-bold text-slate-900">
                              {formatNumber(
                                numberValue(
                                  simulated?.overall_risk,
                                ),
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Overall Risk
                            </p>

                            <div className="mt-4 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Risk Level
                                </span>

                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${riskClass(
                                    typeof simulated?.risk_level === "string"
                                      ? simulated?.risk_level
                                      : null,
                                  )}`}
                                >
                                  {typeof simulated?.risk_level === "string"
                                    ? simulated?.risk_level
                                    : "N/A"}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Delay Probability
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      simulated?.delay_probability,
                                    ) !== null
                                      ? numberValue(
                                        simulated?.delay_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Progress Stall
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      simulated?.stall_probability,
                                    ) !== null
                                      ? numberValue(
                                        simulated?.stall_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Predicted Cost Overrun
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      simulated?.predicted_cost_overrun,
                                    ),
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Cost Risk
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      simulated?.cost_risk,
                                    ),
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Change */}
                          <div className="rounded-xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Change
                            </p>

                            <p className="mt-3 text-3xl font-bold text-slate-900">
                              {formatNumber(
                                numberValue(
                                  change?.overall_risk,
                                ),
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Risk Score Change
                            </p>

                            <div className="mt-4 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Delay Probability
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      change?.delay_probability,
                                    ) !== null
                                      ? numberValue(
                                        change?.delay_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Progress Stall
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      change?.stall_probability,
                                    ) !== null
                                      ? numberValue(
                                        change?.stall_probability,
                                      )! * 100
                                      : null,
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Predicted Cost Overrun
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      change?.predicted_cost_overrun,
                                    ),
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="text-slate-500">
                                  Cost Risk
                                </span>

                                <span className="font-medium">
                                  {formatPercent(
                                    numberValue(
                                      change?.cost_risk,
                                    ),
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Scenario Inputs */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Applied Scenario Inputs
                          </p>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <p className="text-xs text-slate-500">
                                Progress
                              </p>

                              <p className="mt-1 text-sm font-semibold text-slate-800">
                                {scenario.physical_progress_delta > 0
                                  ? "+"
                                  : ""}
                                {scenario.physical_progress_delta}%
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">
                                Schedule Delay
                              </p>

                              <p className="mt-1 text-sm font-semibold text-slate-800">
                                {scenario.schedule_delay_days > 0
                                  ? "+"
                                  : ""}
                                {scenario.schedule_delay_days} days
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">
                                Monthly Expenditure
                              </p>

                              <p className="mt-1 text-sm font-semibold text-slate-800">
                                {scenario.monthly_expenditure_change_cr > 0
                                  ? "+"
                                  : ""}
                                ₹ {scenario.monthly_expenditure_change_cr} Cr
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">
                                Revised Cost
                              </p>

                              <p className="mt-1 text-sm font-semibold text-slate-800">
                                {scenario.revised_cost_change_cr > 0
                                  ? "+"
                                  : ""}
                                ₹ {scenario.revised_cost_change_cr} Cr
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Latest Expenditure */}
                  <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Expenditure
                      </p>

                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        ₹ {formatNumber(selectedExpenditure)} Cr
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Progress Stall Risk
                      </p>

                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {formatPercent(selectedProgressStall)}
                      </p>
                    </div>
                  </section>
                </>
              )}
            </section>
          )
        }

      </div >
    </div >
  );
}