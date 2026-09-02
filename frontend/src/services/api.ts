const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiRequest<T>(
    endpoint: string,
    options?: RequestInit,
): Promise<T> {
    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            ...options,

            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
        },
    );

    if (!response.ok) {
        let message = `API request failed: ${response.status}`;

        try {
            const errorBody =
                await response.json();

            if (
                typeof errorBody?.error ===
                "string"
            ) {
                message = errorBody.error;
            }
        } catch {
            // Keep default message.
        }

        throw new Error(message);
    }

    return response.json() as Promise<T>;
}

// ===============================
// Project Analytics API
// ===============================

export interface ProjectAnalyticsFilterOptions {
  sectors: string[];
  ministries: string[];
  states: string[];
  risk_levels: string[];
  schedule_statuses: string[];
}

export interface ProjectAnalyticsProject {
  project_code: string;
  project_name: string;
  sector: string | null;
  ministry: string | null;
  flash_state: string | null;
  schedule_status: string | null;
  overall_risk_score: number | null;
  risk_level: string | null;
}

export interface ProjectAnalyticsProjectsResponse {
  count: number;
  projects: ProjectAnalyticsProject[];
}

export interface ProjectAnalyticsSummary {
  total_projects: number;
  delayed_projects: number;
  delay_rate_pct: number;
  cost_overrun_projects: number;
  cost_overrun_rate_pct: number;
  total_original_cost_cr: number;
  total_revised_cost_cr: number;
  total_expenditure_cr: number;
  average_risk_score: number;
}

export async function getProjectAnalyticsFilterOptions() {
  return apiRequest<ProjectAnalyticsFilterOptions>(
    "/project-analytics/filter-options",
  );
}

export async function getProjectAnalyticsProjects(params?: {
  sector?: string;
  ministry?: string;
  state?: string;
  risk_level?: string;
  schedule_status?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params?.sector) searchParams.set("sector", params.sector);
  if (params?.ministry) searchParams.set("ministry", params.ministry);
  if (params?.state) searchParams.set("state", params.state);
  if (params?.risk_level) searchParams.set("risk_level", params.risk_level);
  if (params?.schedule_status) {
    searchParams.set("schedule_status", params.schedule_status);
  }

  const query = searchParams.toString();

  return apiRequest<ProjectAnalyticsProjectsResponse>(
    `/project-analytics/projects${query ? `?${query}` : ""}`,
  );
}

export async function getProjectAnalyticsSummary(params?: {
  sector?: string;
  ministry?: string;
  state?: string;
  risk_level?: string;
  schedule_status?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params?.sector) searchParams.set("sector", params.sector);
  if (params?.ministry) searchParams.set("ministry", params.ministry);
  if (params?.state) searchParams.set("state", params.state);
  if (params?.risk_level) searchParams.set("risk_level", params.risk_level);
  if (params?.schedule_status) {
    searchParams.set("schedule_status", params.schedule_status);
  }

  const query = searchParams.toString();

  return apiRequest<ProjectAnalyticsSummary>(
    `/project-analytics/summary${query ? `?${query}` : ""}`,
  );
}

export async function getProjectAnalyticsDetail(projectCode: string) {
  return apiRequest<any>(
    `/project-analytics/project/${encodeURIComponent(projectCode)}`,
  );
}

export async function simulateProjectAnalytics(
  projectCode: string,
  scenario: {
    physical_progress_delta: number;
    schedule_delay_days: number;
    monthly_expenditure_change_cr: number;
    revised_cost_change_cr: number;
  },
) {
  return apiRequest<any>(
    `/project-analytics/project/${encodeURIComponent(projectCode)}/what-if`,
    {
      method: "POST",
      body: JSON.stringify(scenario),
    },
  );
}