/**
 * Admin API client.
 *
 * Every call goes through the Next.js route handler at `/api/proxy/...` (see
 * `src/app/api/proxy/[...path]/route.ts`), which attaches the Keycloak access token on the server.
 * The token is therefore never exposed to client-side JavaScript.
 */
const API_BASE_PATH = '/api/proxy';

// API Response Types (matching Spring Boot DTOs)
export interface ApiRateBand {
  windowSeconds: number;
  capacity: number;
  label: string | null;
}

export interface ApiRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: string;
  keyStrategyId: string;
  onLimitExceedPolicy: string;
  bands: ApiRateBand[];
  ruleSetId: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  /** Optimistic locking token, echoed back on update. */
  version: number;
}

export interface ApiPage<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
}

export interface ApiDashboardStats {
  totalRules: number;
  activeRules: number;
  disabledRules: number;
  totalRuleSets: number;
  lastUpdated: string;
}

export interface ApiBandSimulation {
  label: string | null;
  windowSeconds: number;
  capacity: number;
  available: number;
  consumed: number;
  remaining: number;
  exceeded: boolean;
}

export interface ApiSimulation {
  ruleId: string;
  requests: number;
  seconds: number;
  allowed: boolean;
  consumed: number;
  remaining: number;
  bands: ApiBandSimulation[];
}

export interface ApiImportResult {
  total: number;
  created: number;
  updated: number;
}

export interface CreateRuleRequest {
  id: string;
  name: string;
  enabled: boolean;
  scope: string;
  keyStrategyId: string;
  onLimitExceedPolicy: string;
  bands: { windowSeconds: number; capacity: number; label?: string }[];
  ruleSetId?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
}

export interface UpdateRuleRequest {
  name: string;
  enabled: boolean;
  scope: string;
  keyStrategyId: string;
  onLimitExceedPolicy: string;
  bands: { windowSeconds: number; capacity: number; label?: string }[];
  ruleSetId?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  /** Optimistic locking token taken from the rule that was read before editing. */
  version: number;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Per-field messages from `ErrorResponse.details`, e.g. `["name: name is required"]`. */
    public details: string[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Handle 401 Unauthorized - session might be expired
    if (response.status === 401) {
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || `HTTP ${response.status}`,
      Array.isArray(errorData.details) ? errorData.details : []
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Dashboard API
export async function fetchDashboardStats(): Promise<ApiDashboardStats> {
  const response = await fetch(`${API_BASE_PATH}/api/dashboard/stats`);
  return handleResponse<ApiDashboardStats>(response);
}

// Rules API
export async function fetchRules(ruleSetId?: string): Promise<ApiRule[]> {
  const url = ruleSetId
    ? `${API_BASE_PATH}/api/rules?ruleSetId=${encodeURIComponent(ruleSetId)}`
    : `${API_BASE_PATH}/api/rules`;
  const response = await fetch(url);
  return handleResponse<ApiRule[]>(response);
}

/** Fetch a single page of rules. Returns the page envelope `{content, page, size, totalElements}`. */
export async function fetchRulesPage(
  page: number,
  size: number,
  ruleSetId?: string
): Promise<ApiPage<ApiRule>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (ruleSetId) {
    params.set('ruleSetId', ruleSetId);
  }
  const response = await fetch(`${API_BASE_PATH}/api/rules?${params.toString()}`);
  return handleResponse<ApiPage<ApiRule>>(response);
}

export async function fetchRuleById(id: string): Promise<ApiRule> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/${encodeURIComponent(id)}`);
  return handleResponse<ApiRule>(response);
}

export async function createRule(request: CreateRuleRequest): Promise<ApiRule> {
  const response = await fetch(`${API_BASE_PATH}/api/rules`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
  return handleResponse<ApiRule>(response);
}

export async function updateRule(id: string, request: UpdateRuleRequest): Promise<ApiRule> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { ...JSON_HEADERS, 'If-Match': String(request.version) },
    body: JSON.stringify(request),
  });
  return handleResponse<ApiRule>(response);
}

export async function deleteRule(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(response);
}

export async function toggleRule(id: string): Promise<ApiRule> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/${encodeURIComponent(id)}/toggle`, {
    method: 'PATCH',
  });
  return handleResponse<ApiRule>(response);
}

export async function deleteRulesByRuleSetId(ruleSetId: string): Promise<{ deletedCount: number }> {
  const response = await fetch(
    `${API_BASE_PATH}/api/rules?ruleSetId=${encodeURIComponent(ruleSetId)}`,
    { method: 'DELETE' }
  );
  return handleResponse<{ deletedCount: number }>(response);
}

/** Download every rule as a JSON array, ready to be fed back into {@link importRules}. */
export async function exportRules(): Promise<ApiRule[]> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/export`);
  return handleResponse<ApiRule[]>(response);
}

/** Upsert a batch of rules. Admin only; the server validates every entry before writing. */
export async function importRules(rules: CreateRuleRequest[]): Promise<ApiImportResult> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/import`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ rules }),
  });
  return handleResponse<ApiImportResult>(response);
}

/** Server side dry-run: how many of `requests` requests spread over `seconds` would pass. */
export async function simulateRule(
  id: string,
  requests: number,
  seconds: number
): Promise<ApiSimulation> {
  const response = await fetch(`${API_BASE_PATH}/api/rules/${encodeURIComponent(id)}/simulate`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ requests, seconds }),
  });
  return handleResponse<ApiSimulation>(response);
}

export { ApiError };
