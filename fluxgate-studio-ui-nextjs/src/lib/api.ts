import { getSession } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

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
}

export interface ApiDashboardStats {
  totalRules: number;
  activeRules: number;
  disabledRules: number;
  totalRuleSets: number;
  lastUpdated: string;
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
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await getSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Handle 401 Unauthorized - session might be expired
    if (response.status === 401) {
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.message || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Dashboard API
export async function fetchDashboardStats(): Promise<ApiDashboardStats> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/dashboard/stats`, { headers });
  return handleResponse<ApiDashboardStats>(response);
}

// Rules API
export async function fetchRules(ruleSetId?: string): Promise<ApiRule[]> {
  const headers = await getAuthHeaders();
  const url = ruleSetId
    ? `${API_BASE_URL}/api/rules?ruleSetId=${encodeURIComponent(ruleSetId)}`
    : `${API_BASE_URL}/api/rules`;
  const response = await fetch(url, { headers });
  return handleResponse<ApiRule[]>(response);
}

export async function fetchRuleById(id: string): Promise<ApiRule> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/rules/${encodeURIComponent(id)}`, { headers });
  return handleResponse<ApiRule>(response);
}

export async function createRule(request: CreateRuleRequest): Promise<ApiRule> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/rules`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });
  return handleResponse<ApiRule>(response);
}

export async function updateRule(id: string, request: UpdateRuleRequest): Promise<ApiRule> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(request),
  });
  return handleResponse<ApiRule>(response);
}

export async function deleteRule(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  return handleResponse<void>(response);
}

export async function toggleRule(id: string): Promise<ApiRule> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/rules/${encodeURIComponent(id)}/toggle`, {
    method: 'PATCH',
    headers,
  });
  return handleResponse<ApiRule>(response);
}

export async function deleteRulesByRuleSetId(ruleSetId: string): Promise<{ deletedCount: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/rules?ruleSetId=${encodeURIComponent(ruleSetId)}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  return handleResponse<{ deletedCount: number }>(response);
}

export { ApiError };
