import { apiRequest } from "./api";

export interface SectorMinistryFilters {
  view_by?: "sector" | "ministry";
  ministry?: string;
  sector?: string;
  state?: string;
  financial_year?: string;
  snapshot_month?: string;
}

export interface SectorMinistryFilterOptions {
  ministries: string[];
  sectors: string[];
  states: string[];
  financial_years: string[];
  snapshot_months: string[];
}

export interface AnalyticsKpis {
  avg_cost_overrun_pct: number | null;
  avg_delay_months: number | null;
  cost_overrun_projects: number;
  cost_overrun_rate_pct: number;
  data_quality?: {
    definition: string;
    projects_flagged: number;
    rate_pct: number | null;
  };
  delay_rate_pct: number;
  delayed_projects: number;
  projects_with_cost_overrun: number;
  total_analytical_cost_cr: number;
  total_cost_change_exposure_cr: number;
  total_cost_increase_cr: number;
  total_expenditure_cr: number;
  total_original_cost_cr: number;
  total_projects: number;
  total_revised_cost_cr: number;
}

export interface SummaryRow {
  avg_cost_overrun_pct: number | null;
  avg_delay_days: number | null;
  avg_delay_months: number | null;

  cost_overrun_projects: number;
  cost_overrun_rate_pct: number;
  data_quality_flagged_projects?: number | null;
  data_quality_rate_pct?: number | null;
  delay_rate_pct: number;
  delayed_projects: number;
  expenditure_to_analytical_cost_pct?: number | null;
  sector?: string | null;
  ministry?: string | null;
  total_analytical_cost_cr?: number | null;
  total_cost_change_exposure_cr?: number | null;
  total_cost_increase_cr?: number | null;
  total_expenditure_cr?: number | null;
  total_original_cost_cr?: number | null;
  total_projects: number;
  total_revised_cost_cr?: number | null;
}

export interface RiskDistributionRow {
  sector?: string | null;
  ministry?: string | null;
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

export interface MonthlyTrendRow {
  avg_cost_overrun_pct: number | null;
  avg_delay_days: number | null;
  avg_delay_months: number | null;
  cost_overrun_projects: number;
  cost_overrun_rate_pct: number;
  delay_rate_pct: number;
  delayed_projects: number;
  expenditure_cr: number;
  revised_cost_cr: number;
  project_count: number;
  snapshot_month: string;
  sector?: string | null;
  ministry?: string | null;
}

export interface KeyInsight {
  group?: string;
  message: string;
  metric: string;
  title: string;
  type: string;
  value: number;
}

export interface EarlyWarning {
  title: string;
  severity: "low" | "moderate" | "high" | "immediate";
  message: string;
  metric: string;
  value: number;
  affected_projects: number;
  source_field: string;
  reason: string;
  group?: string;
}

export interface PriorityProject {
  project_code: string;
  project_name: string;
  sector: string | null;
  state: string | null;

  overall_risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  future_delay_probability: number;
  future_progress_stall_probability: number;
  predicted_cost_overrun_pct: number;
  cost_risk_score: number;
  early_warning_active: boolean;

  delay_months: number;
  cost_overrun_pct: number;
}

export interface PortfolioSummary {
  kpis: AnalyticsKpis;
  rows: SummaryRow[];
  selected_view?: "sector" | "ministry";
}

export interface AnalyticsResponse {
  metadata: {
    analytics_type: string;
    financial_year_definition: string;
    health_definition: string;
    health_score_label: string;
    ml_predictions_included: boolean;
    snapshot_month_definition: string;
    source_datasets: string[];
    temporal_metric_definition: string;
    version: string;
  };

  filters: {
    financial_year: string;
    ministry: string;
    sector: string;
    snapshot_month: string;
    state: string;
    view_by: "sector" | "ministry";
  };

  portfolio_summary: PortfolioSummary;

  sector_summary: SummaryRow[];

  ministry_summary: SummaryRow[];

  cost_analysis: {
    sector: SummaryRow[];
    ministry: SummaryRow[];
  };

  delay_analysis: {
    sector: SummaryRow[];
    ministry: SummaryRow[];
  };

  risk_analysis: {
    sector: RiskDistributionRow[];
    ministry: RiskDistributionRow[];
  };

  monthly_trends: {
    sector: MonthlyTrendRow[];
    ministry: MonthlyTrendRow[];
  };

  key_insights: KeyInsight[];

  early_warnings: EarlyWarning[];

  priority_projects: PriorityProject[];

  data_quality: {
    definition: string;
    projects_flagged: number;
    rate_pct: number | null;
  };
}

export async function getSectorMinistryFilterOptions(): Promise<SectorMinistryFilterOptions> {
  return apiRequest<SectorMinistryFilterOptions>(
    "/sector-ministry/filter-options",
  );
}

export async function getSectorMinistryAnalytics(
  filters: SectorMinistryFilters = {},
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams();

  if (filters.view_by) {
    params.set("view_by", filters.view_by);
  }

  if (filters.ministry && filters.ministry !== "All Ministries") {
    params.set("ministry", filters.ministry);
  }

  if (filters.sector && filters.sector !== "All Sectors") {
    params.set("sector", filters.sector);
  }

  if (filters.state && filters.state !== "All States") {
    params.set("state", filters.state);
  }

  if (
    filters.financial_year &&
    filters.financial_year !== "All Years"
  ) {
    params.set(
      "financial_year",
      filters.financial_year.replace(/^FY\s+/i, ""),
    );
  }

  if (
    filters.snapshot_month &&
    filters.snapshot_month !== "All Months"
  ) {
    params.set(
      "snapshot_month",
      filters.snapshot_month,
    );
  }

  const query = params.toString();

  return apiRequest<AnalyticsResponse>(
    `/sector-ministry/analytics${query ? `?${query}` : ""}`,
  );
}