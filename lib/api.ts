
const BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export interface AvailabilityProjectRow {
  project_id: string;
  type_of_project: string | null;
  allocation_by_percentage: number;
  resourcing_status: string;
}

export interface AvailabilityRow {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  total_allocated_pct: number;
  client_allocated_pct: number;
  available_pct: number;
  is_fully_free: boolean;
  as_of_date: string;
   current_projects: AvailabilityProjectRow[];
}

export interface AllocationRow {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  project_id: string;
  type_of_project: string | null;
  coe: string | null;
  resourcing_status: string;
  allocation_by_percentage: number;
  allocated_start_date: string;
  allocated_end_date: string;
  employee_total_allocation_pct: number;
  // Excludes Internal Project allocation -- this is what utilization_band's
  // "over_allocated" is actually judged on, since internal work is discretionary.
  employee_client_allocation_pct: number;
  employee_internal_allocation_pct: number;
  over_allocated_due_to_internal: boolean;
  utilization_band: "over_allocated" | "normal" | "under_utilized";
  actual_hours_logged: number;
  expected_hours: number;
  hours_utilization_pct: number | null;
  hours_data_available: boolean;
  possible_unplanned_absence: boolean;
  days_to_end: number;
  ending_soon: boolean;
}

export interface RoleMixTemplate {
  type_of_project: string;
  tech_coe: string | null;
  role_mix: Record<string, number>;
  sample_size: number | null;
  source: string;
}

export interface RoleMixDetailRow {
  designation: string;
  headcount: number;
  typical_pct: number;
  prevalence_pct: number | null;
  common: boolean;
}

export interface DocxCategoryRoleMix {
  category: string;
  role_mix: Record<string, number>;
  roles: RoleMixDetailRow[];
  sample_size: number | null;
  source: string;
  resolved_via?: Record<string, unknown>;
}

export type StaffingSignal = "redeploy" | "redeploy_with_training" | "hire" | "not_assessed";
export type CandidateBucket = "eligible" | "trainable" | "gap" | "not_assessed";

export type MatchTier = "skill_match" | "same_grade_fallback" | "adjacent_level_fallback" | null;

export type ExperienceConfidence = "observed" | "related_only" | "no_history" | "no_match" | "no_requirement";

// All 5 ranking parameters are independently selectable in Advanced Filters --
// mirrors scoring.BASE_WEIGHTS on the backend. skill/competency/availability
// default true, the other two default false.
export interface IncludeParams {
  skill: boolean;
  competency: boolean;
  availability: boolean;
  category_match: boolean;
  project_count: boolean;
}

export const DEFAULT_INCLUDE_PARAMS: IncludeParams = {
  skill: true,
  competency: true,
  availability: true,
  category_match: false,
  project_count: false,
};

export interface EmployeeProjectHistoryRow {
  project_code: string;
  client_id: string | null;
  proposition_coe: string[];
  tech_coe: string[];
  status: string;
  type_of_project: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ExperienceCategory {
  category: string;
  count: number;
}

export interface RecommendationCandidate {
  employee_id: string;
  job_name: string;
  coe: string | null;
  composite_score: number;
  bucket: CandidateBucket;
  staffing_signal: StaffingSignal;
  explanation: string;
  skill_score: number;
  matched_skills: string[];
  missing_skills: string[];
  skill_confidence: string;
  semantic_score?: number | null;
  competency_score: number;
  competency_confidence: string;
  available_pct: number;
  meets_requested_capacity: boolean;
  match_tier?: MatchTier;
  earliest_available_date?: string | null;
  earliest_available_proof?: string | null;
  on_leave_now?: boolean;
  in_free_pool?: boolean;
  // Track-record / experience layer -- see app/engines/experience_engine.py
  total_projects: number;
  distinct_clients: number;
  relevant_project_count: number;
  relevant_project_ratio: number;
  experience_confidence: ExperienceConfidence;
  top_categories: ExperienceCategory[];
  project_count_score: number;
}

export interface FallbackCandidates {
  requested_designations: string[];
  same_grade: RecommendationCandidate[];
  adjacent_level: RecommendationCandidate[];
}

export interface DealCompositionRow {
  row_index: number;
  resources_requested: string | null;
  requested_pct: string | null;
  skillset: string | null;
  is_current: boolean;
}

export interface RecommendationResult {
  request: { skillset_text: string; required_phrases: string[]; likely_start_date: string; requested_pct: number };
  candidates: RecommendationCandidate[];
  hire_vs_redeploy_flag: boolean;
  top_candidate_signal: StaffingSignal;
  // false when no skillset was specified at all -- candidates are then ranked by
  // competency/availability only, with zero skill match performed (bucket "not_assessed"
  // for all of them). The fixed top-15 display cap looks identical either way without this.
  has_skillset: boolean;
  total_employees_considered: number;
  candidate_pool_size: number;
  candidates_with_real_skill_match: number;
  genuine_skill_match_count?: number;
  observed_skill_match_count?: number;
  inferred_skill_match_count?: number;
  semantic_only_match_count?: number;
  fallback_candidates?: FallbackCandidates | null;
  best_fit_if_delayed?: RecommendationCandidate[];
  // Everyone scored who isn't in `candidates` above -- same engine, same fields,
  // no gating/cap. Powers the "Other options to consider" section.
  other_options?: RecommendationCandidate[];
  other_options_window_days?: number;
  deal_composition: DealCompositionRow[];
  pipeline_row?: {
    row_index: number;
    deal_id: number | null;
    cluster: number | null;
    client: string | null;
    client_priority: string | null;
    em: string | null;
    solution: string | null;
    resources_requested: string | null;
    requested_pct: string | null;
    sow_signed: string | null;
    status: string | null;
    priority: string | null;
    likely_start_date: string | null;
    request_received: string | null;
    original_requested_start_date: string | null;
    start_date_confirmed: string | null;
    number_of_weeks: number | string | null;
    request_type: string | null;
    deal_stage_hubspot: string | null;
    comments: string | null;
    skillset_coe_categories: string[];
    skillset_classification_proof: SkillsetClassificationProofRow[];
    requested_designations?: string[];
  };
}

export interface DealRole {
  row_index: number;
  resources_requested: string | null;
  requested_pct: string | null;
  skillset: string | null;
  status: string | null;
  priority: string | null;
  likely_start_date: string | null;
  client_priority: string | null;
  request_type: string | null;
  deal_stage_hubspot: string | null;
  start_date_confirmed: string | null;
  is_late_notice: boolean | null;
}

export interface DealSummary {
  deal_key: string;
  row_indices: number[];
  client: string | null;
  cluster: number | null;
  solution: string | null;
  role_count: number;
  roles: DealRole[];
  earliest_start: string | null;
  priority: string | null;
  status: string | null;
  sow_signed: boolean;
  is_late_notice: boolean;
  start_date_confirmed: string | null;
  client_priority: string | null;
  request_type: string | null;
  deal_stage_hubspot: string | null;
}

export type TeamRoleStatus = "assigned" | "hire_signal" | "conflict";

export interface TeamRoleResult {
  row_index: number;
  pipeline_row: RecommendationResult["pipeline_row"];
  requested_pct: number;
  has_skillset: boolean;
  hire_vs_redeploy_flag: boolean;
  status: TeamRoleStatus;
  assigned: RecommendationCandidate | null;
  alternatives: RecommendationCandidate[];
  candidates: RecommendationCandidate[];
  fallback_candidates?: FallbackCandidates | null;
}

export interface TeamCoverageSummary {
  total: number;
  assigned: number;
  hire_signal: number;
  conflict: number;
}

export interface ProjectTeamRecommendation {
  roles: TeamRoleResult[];
  coverage_summary: TeamCoverageSummary;
}

export interface SkillsetClassificationProofRow {
  coe_skill: string | null;
  coe_skills_list: string | null;
  skills_combined: string | null;
}

export interface CoverageSummaryRow {
  row_index: number;
  client: string | null;
  resources_requested: string | null;
  top_candidate_signal: StaffingSignal | null;
  top_bucket: CandidateBucket | null;
  has_skillset: boolean;
}

export interface CoverageSummary {
  total_demand_rows: number;
  no_skillset_specified_count: number;
  redeploy_ready_count: number;
  redeploy_with_training_count: number;
  hire_signal_count: number;
  hire_signal_pct: number;
  rows: CoverageSummaryRow[];
}

export interface PipelineDemandRow {
  row_index: number;
  deal_id: number | null;
  cluster: number | null;
  client: string | null;
  client_priority: string | null;
  em: string | null;
  solution: string | null;
  status: string;
  priority: string | null;
  resources_requested: string | null;
  requested_pct: string | null;
  skillset: string | null;
  request_received: string | null;
  original_requested_start_date: string | null;
  request_type: string | null;
  start_date_confirmed: string | null;
  number_of_weeks: number | string | null;
  deal_stage_hubspot: string | null;
  comments: string | null;
  likely_start_date: string | null;
  sow_signed: string | null;
  notice_days: number | null;
  is_late_notice: boolean | null;
  skillset_coe_categories: string[];
}

export interface HealthProject {
  project_code: string;
  client_id: string | null;
  type_of_project: string;
  tech_coe: string | null;
  coe: string | null;
  n_employees: number;
  expected_headcount: number | null;
  is_understaffed: boolean;
  overrun_days: number | null;
  shadow_unbilled_share: number | null;
  monthly_unbilled_value_usd: number;
  churn_per_month: number | null;
  overtime_employee_count: number;
  is_effort_spike: boolean;
  wsr_trend: "deteriorating" | "stable" | "improving" | null;
  risk_score: number;
  risk_band: "high" | "medium" | "low";
  root_causes: string[];
  is_ramp_down_candidate: boolean;
  days_to_ramp_down: number | null;
  wsr_data_available: boolean;
  wsr_worst_signal: string | null;
  wsr_latest_signal: string | null;
  devops_data_available: boolean;
  devops_extension_risk: boolean;
  devops_open_tickets: number;
  devops_blocked_tickets: number;
  devops_in_progress_tickets: number;
  devops_tickets_past_project_end: number;
  devops_remaining_effort_hours: number;
  devops_completed_work_hours: number;
  devops_original_estimate_hours: number;
  devops_effort_completion_pct: number | null;
  devops_to_do_tickets: number;
  devops_within_risk_window: boolean;
  devops_working_days_in_window: number;
  devops_team_capacity_hours: number;
  devops_team_capacity_hours_after_leave: number;
  devops_capacity_surplus_hours: number | null;
  devops_is_overdue: boolean;
  devops_tickets_missing_remaining_estimate: number;
  devops_tickets_with_no_effort_data: number;
}

export interface RosterEntry {
  employee_id: string;
  job_name: string | null;
  resourcing_status: string;
  allocation_by_percentage: number;
  allocated_start_date: string | null;
  allocated_end_date: string | null;
  is_allocation_active: boolean;
}

export interface ProjectRoster {
  project_code: string;
  roster: RosterEntry[];
  distinct_employees: number;
}

export interface OverrunProof {
  fired: boolean;
  threshold_days: number;
  overrun_days: number | null;
  project_end_date: string | null;
  qualifying_allocations: {
    employee_id: string;
    job_name: string | null;
    resourcing_status: string;
    allocated_end_date: string | null;
    days_past_project_end: number;
    is_allocation_active: boolean;
  }[];
}

export interface ShadowHeavyProof {
  fired: boolean;
  threshold_share: number;
  shadow_unbilled_share: number | null;
  monthly_unbilled_value_usd: number;
  total_allocation_rows: number;
  shadow_allocation_rows: number;
  qualifying_allocations: {
    employee_id: string;
    job_name: string | null;
    resourcing_status: string;
    allocation_by_percentage: number;
    hourly_rate_usd: number | null;
    monthly_unbilled_value_usd: number;
    allocated_start_date: string | null;
    allocated_end_date: string | null;
  }[];
}

export interface HighChurnProof {
  fired: boolean;
  churn_per_month: number | null;
  cohort_p75_threshold: number;
  distinct_employees: number;
  roster_timeline: RosterEntry[];
}

export interface UnderstaffedProof {
  fired: boolean;
  ratio_threshold: number;
  actual_headcount_all_time: number;
  expected_headcount: number | null;
  role_mix_source: string;
  role_mix_sample_size: number | null;
  expected_roles: RoleMixDetailRow[];
  expected_role_mix: Record<string, number>;
  actual_headcount_active_now_by_role: Record<string, number>;
  actual_fte_active_now_by_role: Record<string, number>;
  headcount_all_time_by_role: Record<string, number>;
}

export interface OvertimeEmployeeProof {
  employee_id: string;
  job_name: string | null;
  overtime_days_recent: number;
  max_daily_hours_recent: number;
  is_sustained_overtime: boolean;
  daily_hours: { date: string; hours: number; is_overtime: boolean }[];
}

export interface OvertimeRiskProof {
  fired: boolean;
  daily_threshold_hours: number;
  sustained_min_days: number;
  window_days: number;
  overtime_employee_count: number;
  employees: OvertimeEmployeeProof[];
}

export interface EffortSpikeProof {
  fired: boolean;
  ratio_threshold: number;
  min_baseline_weeks: number;
  weekly_hours: { week: string; hours: number }[];
}

export interface SentimentScore {
  date: string | null;
  label: string;
  compound: number;
  comment: string;
}

export interface SentimentSummary {
  has_data: boolean;
  label: string | null;
  compound: number | null;
  avg_compound?: number | null;
  trend: string | null;
  risk_signal: string;
  latest_comment: string | null;
  recent_scores?: SentimentScore[];
}

export interface WsrReportRow {
  week_start_date: string | null;
  week_end_date: string | null;
  scope_status: string;
  schedule_status: string;
  quality_status: string;
  csat_status: string;
  team_status: string;
  worst_signal: string;
  comment?: string | null;
}

export interface WsrProof {
  fired_deteriorating: boolean;
  fired_critical: boolean;
  fired_long_term_decline: boolean;
  data_available: boolean;
  worst_signal: string | null;
  latest_signal: string | null;
  trend: "deteriorating" | "stable" | "improving" | null;
  is_critical: boolean;
  is_long_term_decline: boolean;
  recent_avg_severity: number | null;
  prior_avg_severity: number | null;
  baseline_avg_severity: number | null;
  critical_severity_threshold: number;
  recent_n: number;
  min_reports_required: number;
  critical_min_reports_required: number;
  long_term_min_reports_required: number;
  reports: WsrReportRow[];
}


export interface DevopsTicketRow {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string;
  is_blocked: boolean;
  is_in_progress: boolean;
  assigned_to: string | null;
  start_date: string | null;
  due_date: string | null;
  is_past_project_end: boolean;
  original_estimate_hours: number | null;
  remaining_hours: number | null;
  completed_hours: number | null;
  is_effort_inconsistent: boolean;
  sprint_name: string;
  effective_remaining_hours: number | null;
}

export interface SprintBreakdownRow {
  iteration_path: string;
  sprint_name: string;
  ticket_count: number;
  blocked_count: number;
  in_progress_count: number;
  to_do_count: number;
  remaining_hours: number;
  tickets_with_no_effort_data: number;
  sprint_start_date: string | null;
  sprint_end_date: string | null;
  latest_due_date: string | null;
  has_open_work: boolean;
}

export interface DevopsExtensionRiskProof {
  fired: boolean;
  data_available: boolean;
  window_days: number;
  open_ticket_count: number;
  blocked_ticket_count: number;
  in_progress_ticket_count: number;
  to_do_ticket_count: number;
  tickets_due_past_project_end: number;
  remaining_effort_hours: number;
  completed_work_hours: number;
  original_estimate_hours: number;
  effort_completion_pct: number | null;
  within_risk_window: boolean;
  working_days_in_window: number;
  team_capacity_hours: number;
  team_capacity_hours_after_leave: number;
  capacity_surplus_hours: number | null;
  is_overdue: boolean;
  tickets_missing_remaining_estimate: number;
  tickets_with_no_effort_data: number;
  sprint_breakdown: SprintBreakdownRow[];
  tickets: DevopsTicketRow[];
  
}
export interface ProjectHealthDetail {
  project_code: string;
  client_id: string | null;
  type_of_project: string;
  tech_coe: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  risk_score: number;
  risk_band: "high" | "medium" | "low";
  root_causes: string[];
  overrun: OverrunProof;
  shadow_heavy: ShadowHeavyProof;
  high_churn: HighChurnProof;
  understaffed: UnderstaffedProof;
  overtime_risk: OvertimeRiskProof;
  effort_spike: EffortSpikeProof;
  wsr: WsrProof;
  devops: DevopsExtensionRiskProof;
  allocations_roster: RosterEntry[];
}

export interface FreePoolCandidate {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  reason: "ending_soon" | "under_utilized" | "fully_free";
  project_id: string | null;
  days_to_end?: number;
  current_allocation_pct?: number;
  ending_allocation_pct?: number;
  ending_allocations?: { project_id: string; allocation_pct: number; days_to_end: number }[];
  primary_coe: string | null;
  idle_capacity_pct: number;
  hourly_rate_usd: number | null;
  idle_value_usd_per_month: number | null;
  days_free: number | null;
  last_ended_project_id: string | null;
  last_ended_date: string | null;
  recommended_project_count?: number;
  top_recommended_project?: TopRecommendedProject | null;
}

export interface TopRecommendedProject {
  row_index: number;
  client: string | null;
  resources_requested: string | null;
  skill_areas: string[];
  skill_score: number;
  composite_score: number;
}

export interface ReliefCandidate extends FreePoolCandidate {
  composite_score: number;
  skill_score: number;
  matched_skills: string[];
  missing_skills: string[];
  skill_confidence: "observed" | "imputed" | "no_match" | "no_requirement";
  competency_score: number;
  competency_confidence: "observed" | "imputed";
  skill_bucket: "eligible" | "trainable" | "gap" | "not_assessed";
  coe_matches_project: boolean;
  // Only present on available_soon_candidates -- still busy today, but with a real,
  // dated end to that.
  days_to_available?: number | null;
  available_from_date?: string | null;
}

export interface ReliefStaffingResult {
  project_code: string;
  overtime_fired: boolean;
  understaffed_fired: boolean;
  overtime_employee_count: number;
  project_coe: string | null;
  required_skills: string[];
  required_skill_source: "project_roster" | "coe_typical" | "none";
  candidate_pool_size: number;
  candidates: ReliefCandidate[];
  available_soon_candidates: ReliefCandidate[];
}

export interface ProjectBurnoutOverview {
  total_flagged: number;
  overtime_count: number;
  understaffed_count: number;
  projects: HealthProject[];
}

export interface BurnoutOvertimeEmployee {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  overtime_days_recent: number;
  max_daily_hours_recent: number;
  daily_hours: { date: string; hours: number; is_overtime: boolean }[];
  recent_projects: { project_id: string; hours_recent: number; needs_support: boolean }[];
}

export interface EmployeeBurnoutOverview {
  overtime_employee_count: number;
  overtime_employees: BurnoutOvertimeEmployee[];
}

export interface RedeployMatch {
  row_index: number;
  client: string | null;
  resources_requested: string | null;
  requested_pct: string | null;
  likely_start_date: string | null;
  status: string | null;
  priority: string | null;
  skill_areas: string[];
  skill_score: number;
  matched_skills: string[];
  missing_skills: string[];
  skill_confidence: "observed" | "imputed" | "no_match" | "no_requirement";
  competency_score: number;
  competency_confidence: "observed" | "imputed";
  available_pct: number;
  composite_score: number;
  bucket: "eligible" | "trainable" | "gap" | "not_assessed";
}

export interface RevenueMonth {
  month: string;
  value: number;
  raw: string;
}


export interface RedeployCandidate {
  employee_id: string;
  job_name: string;
  department_name?: string | null;
  location?: string | null;
  coe?: string | null;
  reason: "ending_soon" | "under_utilized" | "fully_free";
  project_id: string | null;
  days_to_end?: number;
  current_allocation_pct?: number;
  available_pct_as_of?: number;
  skill_score?: number;
  matched_skills?: string[];
  missing_skills?: string[];
  skill_confidence?: "observed" | "imputed" | "no_match" | "no_requirement";
  skill_bucket?: "eligible" | "trainable" | "gap" | "not_assessed";
  source_designation?: string;
  level_offset?: number;
}

export interface ForecastBreakdownRow {
  designation: string;
  start_date: string;
  duration_weeks: number | null;
  needed_fte: number;
  needed_headcount: number;
  available_for_redeploy: number;
  // <= available_for_redeploy when skills were requested -- only those who actually meet the
  // skill threshold (not just hold the title) count toward covering the need.
  qualifying_for_redeploy: number;
  redeploy_candidates: RedeployCandidate[];
  adjacent_level_candidates: RedeployCandidate[];
  adjacent_fill_count: number;
  shortfall: number;
  shortfall_value_usd: number;
  full_role_monthly_value_usd: number;
  achievable_monthly_value_usd: number;
  hire_signal: boolean;
  recommended_start_date: string | null;
  recommended_start_date_proof: string | null;
  recommended_available_then: RedeployCandidate[];
}

export interface ForecastSpec {
  coes?: string[] | null;
  type_of_project?: string | null;
  category?: string | null;
  count: number;
  role_mix_overrides?: Record<string, number> | null;
  required_skills?: string[] | null;
  start_date?: string | null;
  duration_weeks?: number | null;
}

export interface ExcludedRareRole {
  designation: string;
  prevalence_pct: number | null;
  fte: number;
}

export interface NewProjectForecastResult {
  specs: ForecastSpec[];
  role_mix_sources: { spec: ForecastSpec; source: string; sample_size: number | null; matched_project_codes: string[] }[];
  required_skills: string[];
  breakdown: ForecastBreakdownRow[];
  excluded_rare_roles: ExcludedRareRole[];
  total_shortfall_headcount: number;
  total_shortfall_value_usd: number;
  total_full_role_value_usd: number;
  total_achievable_value_usd: number;
  pct_achievable_with_current_headcount: number | null;
}

export interface CoeOption {
  coe: string;
  sample_size: number;
}

export interface RoleMixPreview {
  role_mix: Record<string, number>;
  roles: RoleMixDetailRow[];
  sample_size: number | null;
  source: string;
  on_time_sample_size?: number;
  all_completed_sample_size?: number;
  matched_project_codes: string[];
}

export interface CoeSkill {
  skill: string;
  subskill: string;
  employee_count: number;
  avg_score: number;
  common_experience: string | null;
}

export interface CoeSkillsForCoe {
  skills: CoeSkill[];
  confidence: "medium" | "low" | "none";
  matched_skill_coes: string[];
  fallback: string | null;
}

export interface CoeSkillsResult {
  by_coe: Record<string, CoeSkillsForCoe>;
  combined: CoeSkill[];
}

export interface LeaveImpact {
  employee_id: string;
  job_name: string | null;
  leave_type: "Planned" | "Sick" | "Emergency";
  leave_start_date: string;
  leave_end_date: string;
  is_currently_on_leave: boolean;
  project_id: string;
  coe: string | null;
  allocation_by_percentage: number;
  backfill_candidates: RedeployCandidate[];
  backfill_available: boolean;
  top_backfill_skill_score: number | null;
  required_skills: string[];
  // "project_roster": matched against the skills of this project's own team;
  // "own_skills": project roster too thin, fell back to the leave-taker's own skills;
  // "none": neither was available -- skill fit isn't assessed for this row.
  required_skill_source: "project_roster" | "own_skills" | "none";
}

export interface OutlookMonth {
  month: string;
  confirmed_demand_count: number;
  unconfirmed_demand_count: number;
  projected_supply_count: number;
  net_confirmed_surplus_shortfall: number;
  early_warning: boolean;
  has_real_demand_data: boolean;
  has_real_supply_data: boolean;
  supply_anomaly_note: string | null;
  confirmed_value_usd: number;
  unconfirmed_value_usd: number;
}

export interface OutlookRoleDemandRow {
  month: string;
  role: string;
  role_code: string;
  resolved_designations: string[];
  needed_headcount: number;
  available_headcount: number | null;
  shortfall: number | null;
  shortfall_value_usd: number;
  value_usd: number | null;
  is_confirmed: boolean;
}

export interface OutlookSkillAreaDemandRow {
  month: string;
  skill_area: string;
  count: number;
}

export interface OutlookClusterScorecard {
  cluster: number;
  deal_count: number;
  confirmed_count: number;
  unconfirmed_count: number;
  sow_signed_rate_pct: number;
  value_usd: number;
  top_roles: { role: string; count: number }[];
  top_skill_areas: { skill_area: string; count: number }[];
  clients: string[];
}

export interface SixMonthOutlookResult {
  start_date: string;
  horizon_months: number;
  granularity: "month" | "week";
  months: OutlookMonth[];
  first_shortfall_month: string | null;
  first_shortfall_roles: OutlookRoleDemandRow[];
  real_demand_data_through: string | null;
  real_supply_data_through: string | null;
  role_demand_by_month: OutlookRoleDemandRow[];
  skill_area_demand_by_month: OutlookSkillAreaDemandRow[];
  no_skill_area_specified_count: number;
  project_mix_by_cluster_by_month: { month: string; cluster: number; count: number }[];
  project_mix_by_solution_by_month: { month: string; solution: string; count: number }[];
  cluster_scorecards: OutlookClusterScorecard[];
  assumption: string;
}

export interface OutlookDrilldownDeal {
  deal_id: number | null;
  client: string | null;
  cluster: number | null;
  client_priority: string | null;
  em: string | null;
  solution: string | null;
  status: string | null;
  priority: string | null;
  role_code: string | null;
  role_label: string;
  resolved_designations: string[];
  requested_pct: string | null;
  skillset: string | null;
  skill_areas: string[];
  request_received: string | null;
  original_requested_start_date: string | null;
  likely_start_date: string | null;
  request_type: string | null;
  start_date_confirmed: string | null;
  number_of_weeks: string | number | null;
  deal_stage_hubspot: string | null;
  comments: string | null;
  sow_signed: string | null;
  is_confirmed: boolean;
  notice_days: number | null;
  is_late_notice: boolean | null;
  hourly_rate_usd: number | null;
  value_usd: number | null;
}

export interface OutlookDrilldownEmployee {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  project_id: string | null;
  resourcing_status: string | null;
  allocation_by_percentage: number | null;
  allocated_start_date: string | null;
  allocated_end_date: string | null;
  is_anomaly_cluster: boolean;
}

export interface RosterAllocation {
  project_id: string;
  type_of_project: string | null;
  allocation_by_percentage: number;
  allocated_start_date: string | null;
  allocated_end_date: string | null;
  is_internal: boolean;
}

export interface DesignationRosterEntry {
  employee_id: string;
  job_name: string | null;
  location: string | null;
  department_name: string | null;
  available_pct: number;
  is_available: boolean;
  current_allocations: RosterAllocation[];
}

export interface OutlookDrilldownResult {
  month: string | null;
  dimension: string;
  value: string | null;
  deals: OutlookDrilldownDeal[];
  supply_employees: OutlookDrilldownEmployee[];
  supply_anomaly_note: string | null;
  designation_roster: DesignationRosterEntry[];
}

export interface SemanticMatchCandidate {
  employee_id: string;
  matched_requirement: string;
  skill: string | null;
  subskill: string | null;
  score: number | null;
  skill_source: string;
  confidence: "high" | "medium";
  rationale: string | null;
}

export interface SemanticMatchResult {
  available: boolean;
  reason?: string;
  requirement?: string | null;
  matches?: SemanticMatchCandidate[];
  candidates_considered?: number;
  no_match_found?: boolean;
}

export interface BuddyTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface BuddyStat {
  label: string;
  value: string;
}

export interface BuddyAnswer {
  answer: string;
  format: "table" | "stats" | "text";
  table?: BuddyTable;
  stats?: BuddyStat[];
  data?: unknown;
}

export interface BuddyToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface BuddyStreamEvent {
  type: "tool_call" | "tool_result" | "done";
  tool?: string;
  arguments?: Record<string, unknown>;
  answer?: string;
  format?: "table" | "stats" | "text";
  table?: BuddyTable;
  stats?: BuddyStat[];
  data?: unknown;
}

/** SSE variant of api.buddyAsk -- yields {type: "tool_call"|"tool_result"|"done", ...}
 * as Buddy works, instead of waiting for the full answer. Uses fetch() directly since
 * the structured-final-answer JSON only arrives once on the "done" event, not streamed
 * token-by-token (the backend's final answer is parsed JSON, not free prose). */
export async function* buddyAskStream(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  priorContext?: string
): AsyncGenerator<BuddyStreamEvent> {
  const res = await fetch(`${BASE}/buddy/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, prior_context: priorContext }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`/buddy/ask/stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6));
    }
  }
}

export async function buddyRate(params: {
  session_id: string;
  message_index: number;
  question: string;
  answer_snippet: string;
  rating: "up" | "down";
}): Promise<void> {
  await fetch(`${BASE}/buddy/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
  });
}

export interface EmployeeSkillRow {
  coe: string | null;
  coe_skill: string | null;
  skill: string | null;
  subskill: string | null;
  experience: string | null;
  score: number | null;
  skill_source: string;
}

export interface EmployeeCompetencyRow {
  competency_sheet: string | null;
  competency_question: string | null;
  response: string | null;
  score: number | null;
  competency_source: string;
}

export interface EmployeeAllocationRow {
  project_id: string;
  client_id: string | null;
  type_of_project: string | null;
  project_status: string | null;
  resourcing_status: string;
  allocation_by_percentage: number | null;
  allocated_start_date: string | null;
  allocated_end_date: string | null;
  is_allocation_active: boolean;
}

export interface EmployeeOvertimeRisk {
  overtime_days_recent: number;
  max_daily_hours_recent: number;
  is_sustained_overtime: boolean;
}

export interface EmployeeDailyHours {
  date: string;
  hours: number;
  is_overtime: boolean;
}

export interface EmployeeLeaveRow {
  leave_type: string;
  leave_start_date: string | null;
  leave_end_date: string | null;
  status: string;
  source: string;
  is_currently_on_leave: boolean;
}

export interface EmployeeSignals {
  over_allocated: boolean;
  over_allocated_threshold: number;
  // True when the only reason total allocation exceeds 100% is internal-project work
  // stacked on top of an at-or-under-100% client commitment -- not a real overload.
  over_allocated_due_to_internal: boolean;
  under_utilized: boolean;
  under_utilized_threshold: number;
  sustained_overtime: boolean;
  overtime_daily_threshold_hours: number;
  overtime_sustained_min_days: number;
  overtime_window_days: number;
  possible_unplanned_absence: boolean;
}

export interface EmployeeProfile {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  date_of_join: string | null;
  account_status: boolean | null;
  coe: string | null;
  manager_employee_id: string | null;
  employee_total_allocation_pct: number | null;
  employee_client_allocation_pct: number | null;
  employee_internal_allocation_pct: number | null;
  skills: EmployeeSkillRow[];
  competencies: EmployeeCompetencyRow[];
  allocations: EmployeeAllocationRow[];
  current_allocations: AllocationRow[];
  overtime_risk: EmployeeOvertimeRisk;
  daily_hours_recent: EmployeeDailyHours[];
  leaves: EmployeeLeaveRow[];
  signals: EmployeeSignals;
}

export interface AllocationTimesheet extends AllocationRow {
  hours_window_end: string;
  daily_hours: { date: string; hours: number | null; expected_hours: number; utilization_pct: number | null; is_missing: boolean }[];
}

export interface ProjectInfo {
  project_code: string;
  client_id: string | null;
  type_of_project: string | null;
  tech_coe: string | null;
  project_status: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  is_health_tracked: boolean;
}

export interface EmployeeHeadcountSummary {
  total_ever: number;
  currently_active: number;
  delivery_active: number;
  already_departed: number;
  in_notice_period: number;
}

export interface BackfillContext {
  pulled_employee_id: string;
  pulled_employee_job: string | null;
  pulled_employee_coe: string | null;
  source_project_id: string;
  vacated_allocation_pct: number;
  skill_basis: string[];
}

export interface BackfillResult {
  candidates: RecommendationCandidate[];
  best_fit_if_delayed?: RecommendationCandidate[];
  fallback_candidates?: FallbackCandidates | null;
  hire_vs_redeploy_flag?: boolean;
  backfill_context: BackfillContext | null;
  error?: string;
}

export interface OvertimeRiskSummary {
  employees_at_risk: number;
  threshold_days: number;
  window_days: number;
  daily_hours_threshold: number;
  employees: {
    employee_id: string;
    job_name: string | null;
    overtime_days_recent: number;
    max_daily_hours_recent: number;
  }[];
}

export interface EmployeeListRow {
  employee_id: string;
  job_name: string | null;
  department_name: string | null;
  location: string | null;
  manager_employee_id: string | null;
  date_of_join: string | null;
  date_of_resignation: string | null;
  status: "active" | "departed" | "notice_period";
  // Real primary CoE for this employee (employee_coe.py) -- null when not determined
  // (no observed Skill Details row on record), never a guessed default.
  coe: string | null;
  // Current total allocation % across active projects -- null if no active allocation.
  current_allocation_pct: number | null;
}

export interface DigestSendResult {
  sent_to: string;
  no_backfill_count: number;
  high_risk_total_count: number;
}

export const api = {
  tables: () => getJSON<Record<string, number>>("/meta/tables"),
  sendDigestNow: () => postJSON<DigestSendResult>(`/digest/send?period_label=${encodeURIComponent("right now")}`, {}),
  buddyAsk: (message: string, history: { role: "user" | "assistant"; content: string }[] = []) =>
    postJSON<BuddyAnswer>("/buddy/ask", { message, history }),
  employeeProfile: (employeeId: string) => getJSON<EmployeeProfile>(`/employees/${encodeURIComponent(employeeId)}/profile`),
  employeeProjectHistory: (employeeId: string, category?: string) =>
    getJSON<EmployeeProjectHistoryRow[]>(
      `/employees/${encodeURIComponent(employeeId)}/project-history${category ? `?category=${encodeURIComponent(category)}` : ""}`
    ),
  employeeHeadcountSummary: () => getJSON<EmployeeHeadcountSummary>("/employees/headcount-summary"),
  overtimeRiskSummary: () => getJSON<OvertimeRiskSummary>("/employees/overtime-risk-summary"),
  employeesList: () => getJSON<EmployeeListRow[]>("/employees"),
  employeeDesignations: () => getJSON<string[]>("/employees/designations"),
  allocations: () => getJSON<AllocationRow[]>("/allocations/current"),
  availability: (asOfDate?: string) =>
    getJSON<AvailabilityRow[]>(`/allocations/availability${asOfDate ? `?as_of_date=${asOfDate}` : ""}`),
  allocationTimesheet: (employeeId: string, projectId: string) =>
    getJSON<AllocationTimesheet>(`/allocations/timesheet?employee_id=${encodeURIComponent(employeeId)}&project_id=${encodeURIComponent(projectId)}`),
  roleMixTemplates: () => getJSON<RoleMixTemplate[]>("/role-mix/templates"),
  roleMixCategories: () => getJSON<DocxCategoryRoleMix[]>("/role-mix/categories"),
  recommendationsForPipelineRow: (
    rowIndex: number, topN: number = 15, include: IncludeParams = DEFAULT_INCLUDE_PARAMS,
    includeBelowCapacity: boolean = false
  ) =>
    getJSON<RecommendationResult>(
      `/recommendations/pipeline-row/${rowIndex}?top_n=${topN}` +
        `&include_skill=${include.skill}&include_competency=${include.competency}&include_availability=${include.availability}` +
        `&include_category_match=${include.category_match}&include_project_count=${include.project_count}` +
        `&include_below_capacity=${includeBelowCapacity}`
    ),
  recommendationsCoverageSummary: () => getJSON<CoverageSummary>("/recommendations/coverage-summary"),
  semanticMatch: (rowIndex: number) =>
    postJSON<SemanticMatchResult>(`/recommendations/pipeline-row/${rowIndex}/semantic-match`, {}),
  recommendationsSearch: (skillsetText: string, likelyStartDate: string, requestedPct = "100") =>
    getJSON<RecommendationResult>(
      `/recommendations/search?skillset_text=${encodeURIComponent(skillsetText)}&likely_start_date=${likelyStartDate}&requested_pct=${requestedPct}`
    ),
  listDeals: () => getJSON<DealSummary[]>("/recommendations/deals"),
  projectTeamRecommendation: (rowIndices: number[], topN: number = 15, include: IncludeParams = DEFAULT_INCLUDE_PARAMS) =>
    postJSON<ProjectTeamRecommendation>("/recommendations/project-team", {
      row_indices: rowIndices, top_n: topN,
      include_skill: include.skill, include_competency: include.competency, include_availability: include.availability,
      include_category_match: include.category_match, include_project_count: include.project_count,
    }),
  pipelineForecast: () => getJSON<PipelineDemandRow[]>("/pipeline/forecast"),
  healthProjects: () => getJSON<HealthProject[]>("/health-monitor/projects"),
  projectRoster: (projectCode: string) => getJSON<ProjectRoster>(`/health-monitor/projects/${encodeURIComponent(projectCode)}/roster`),
  healthProjectDetail: (projectCode: string) => getJSON<ProjectHealthDetail>(`/health-monitor/projects/${encodeURIComponent(projectCode)}/detail`),
  reliefStaffingCandidates: (projectCode: string) =>
    getJSON<ReliefStaffingResult>(`/health-monitor/projects/${encodeURIComponent(projectCode)}/relief-candidates`),
  healthProjectSentiment: (projectCode: string, lastN?: number) =>
    getJSON<SentimentSummary>(`/health-monitor/projects/${encodeURIComponent(projectCode)}/sentiment${lastN ? `?last_n=${lastN}` : ""}`),
  projectBurnoutOverview: () => getJSON<ProjectBurnoutOverview>("/wellbeing/projects"),
  employeeBurnoutOverview: () => getJSON<EmployeeBurnoutOverview>("/wellbeing/employees"),
  projectInfo: (projectCode: string) => getJSON<ProjectInfo>(`/health-monitor/projects/${encodeURIComponent(projectCode)}/info`),
  newProjectForecast: (specs: ForecastSpec[]) =>
    postJSON<NewProjectForecastResult>("/forecast/new-projects", specs),
  roleMixPreview: (coes: string[], typeOfProject: string | null) =>
    postJSON<RoleMixPreview>("/forecast/role-mix-preview", { coes, type_of_project: typeOfProject }),
  roleMixCoes: () => getJSON<CoeOption[]>("/role-mix/coes"),
  roleMixCoeSkills: (coes: string[]) =>
    getJSON<CoeSkillsResult>(`/role-mix/coe-skills?coes=${encodeURIComponent(coes.join(","))}`),
  sixMonthOutlook: (startDate?: string, horizonMonths?: number, granularity?: "month" | "week") => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (horizonMonths) params.set("horizon_months", String(horizonMonths));
    if (granularity) params.set("granularity", granularity);
    const qs = params.toString();
    return getJSON<SixMonthOutlookResult>(`/forecast/six-month-outlook${qs ? `?${qs}` : ""}`);
  },
  outlookDrilldown: (opts: {
    dimension: string;
    value?: string;
    month?: string | null;
    startDate?: string;
    horizonMonths?: number;
    granularity?: "month" | "week";
    isConfirmed?: boolean;
  }) => {
    const params = new URLSearchParams({ dimension: opts.dimension });
    if (opts.value != null) params.set("value", opts.value);
    if (opts.month) params.set("month", opts.month);
    if (opts.startDate) params.set("start_date", opts.startDate);
    if (opts.horizonMonths) params.set("horizon_months", String(opts.horizonMonths));
    if (opts.granularity) params.set("granularity", opts.granularity);
    if (opts.isConfirmed != null) params.set("is_confirmed", String(opts.isConfirmed));
    return getJSON<OutlookDrilldownResult>(`/forecast/six-month-outlook/drilldown?${params.toString()}`);
  },
  freePool: () => getJSON<FreePoolCandidate[]>("/free-pool"),
  freePoolMatches: (employeeId: string, topN = 20) =>
    getJSON<RedeployMatch[]>(`/free-pool/${encodeURIComponent(employeeId)}/matches?top_n=${topN}`),
  backfillCandidates: (employeeId: string, sourceProjectId: string, topN = 15) =>
    getJSON<BackfillResult>(`/recommendations/backfill?employee_id=${encodeURIComponent(employeeId)}&source_project_id=${encodeURIComponent(sourceProjectId)}&top_n=${topN}`),
  revenueTrend: () => getJSON<RevenueMonth[]>("/revenue/trend"),
  leaveImpact: () => getJSON<LeaveImpact[]>("/leave/impact"),
  predictionForecast: (horizonMonths: number = 24) =>
    getJSON<PredictionForecastResult>(`/forecast/prediction?horizon_months=${horizonMonths}`),
};

// ── Prediction Forecast ────────────────────────────────────────────────────
export interface PredictionHistoryRow {
  month: string;
  total_headcount_demand: number;
  confirmed_headcount: number;
  win_rate_pct: number;
  revenue_usd: number;
}

export interface PredictionForecastRow {
  month: string;
  forecast: number;
  lower: number;
  upper: number;
}

export interface PredictionForecastResult {
  history: PredictionHistoryRow[];
  horizon_months: number;
  demand_forecast: PredictionForecastRow[];
  revenue_forecast: PredictionForecastRow[];
  winrate_forecast: PredictionForecastRow[];
  summary: {
    peak_demand_month: string;
    peak_demand_headcount: number;
    total_forecast_headcount: number;
    total_forecast_revenue_usd: number;
    demand_monthly_growth_rate: number;
  };
  model_info: {
    type: string;
    formula: string;
    training_months: number;
    training_period: string;
    confidence_interval: string;
    note: string;
  };
}
