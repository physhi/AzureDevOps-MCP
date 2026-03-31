export type RelativeCost = 'low' | 'medium' | 'high' | 'very-high';

export interface QueryTemplate {
  label: string;
  rationale: string;
  query: string;
}

export interface WiqlQueryAuthoringGuidance {
  usesContains: boolean;
  usesEver: boolean;
  usesAsOf: boolean;
  usesWorkItemLinks: boolean;
  hasProjectFilter: boolean;
  hasDateWindow: boolean;
  hasAreaFilter: boolean;
  hasIterationFilter: boolean;
  hasAssignedFilter: boolean;
  hasStateFilter: boolean;
  hasTypeFilter: boolean;
  requestedFieldCount: number;
  top: number;
  narrowFilterCount: number;
  riskFlags: string[];
  bestPractices: string[];
  avoidPatterns: string[];
  recommendedAlternatives: string[];
  recommendedTemplates: QueryTemplate[];
}

export interface ApiUsageProfile {
  toolName: string;
  relativeCost: RelativeCost;
  estimatedAdoCalls: number;
  callBreakdown: string[];
  tstuGuidance: string;
  costDrivers: string[];
  bestFor: string[];
  bestPractices: string[];
  avoid: string[];
  rateLimitHeadersToWatch: string[];
  recommendedAlternativeTools?: string[];
  queryAuthoring?: WiqlQueryAuthoringGuidance;
}

const RATE_LIMIT_HEADERS = [
  'Retry-After',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-RateLimit-Delay',
];

const TSTU_GUIDANCE = 'Azure DevOps does not expose a deterministic per-call TSTU formula. This server reports relative cost and estimated Azure DevOps API round-trips based on query shape, result volume, and requested fields.';

const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    label: 'Recent active work by type and state',
    rationale: 'Bound the query by work item type, state, and a recent changed-date window.',
    query: `SELECT [System.Id]\nFROM WorkItems\nWHERE\n  [System.TeamProject] = @project\n  AND [System.WorkItemType] = 'Bug'\n  AND [System.State] IN ('New', 'Active', 'Resolved')\n  AND [System.ChangedDate] >= @Today - 30\nORDER BY [System.ChangedDate] DESC`,
  },
  {
    label: 'Area-scoped backlog slice',
    rationale: 'Use UNDER on AreaPath instead of substring matching on titles or descriptions.',
    query: `SELECT [System.Id]\nFROM WorkItems\nWHERE\n  [System.TeamProject] = @project\n  AND [System.AreaPath] UNDER 'Contoso\\Platform'\n  AND [System.State] <> 'Closed'\n  AND [System.ChangedDate] >= @Today - 14\nORDER BY [System.ChangedDate] DESC`,
  },
  {
    label: 'My current iteration work',
    rationale: 'Use identity and iteration macros instead of free-text search.',
    query: `SELECT [System.Id]\nFROM WorkItems\nWHERE\n  [System.TeamProject] = @project\n  AND [System.AssignedTo] = @Me\n  AND [System.IterationPath] = @CurrentIteration('[Contoso]\\Web')\n  AND [System.State] <> 'Closed'\nORDER BY [System.ChangedDate] DESC`,
  },
];

function estimateHydrationCalls(resultCount: number): number {
  if (resultCount <= 0) {
    return 0;
  }

  return Math.ceil(resultCount / 200);
}

function chooseRelativeCost(score: number): RelativeCost {
  if (score >= 5) {
    return 'very-high';
  }

  if (score >= 3) {
    return 'high';
  }

  if (score >= 1) {
    return 'medium';
  }

  return 'low';
}

function buildCallBreakdown(firstCallLabel: string, resultCount: number): string[] {
  const hydrationCalls = estimateHydrationCalls(resultCount);
  const breakdown = [`1 x ${firstCallLabel}`];

  if (hydrationCalls > 0) {
    breakdown.push(`${hydrationCalls} x getWorkItems batch hydrate for ${resultCount} ID${resultCount === 1 ? '' : 's'}`);
  }

  return breakdown;
}

function buildFieldPayloadNote(requestedFieldCount: number): string {
  return requestedFieldCount > 12
    ? `Large field list (${requestedFieldCount} fields) increases payload size.`
    : `Field list is reasonably scoped at ${requestedFieldCount} field${requestedFieldCount === 1 ? '' : 's'}.`;
}

export function analyzeWiql(query: string, top: number, requestedFieldCount: number): WiqlQueryAuthoringGuidance {
  const usesContains = /\bcontains(?:\s+words)?\b/i.test(query);
  const usesEver = /\bwas\s+ever\b|\bever\b/i.test(query);
  const usesAsOf = /\basof\b/i.test(query);
  const usesWorkItemLinks = /\bfrom\s+workitemlinks\b/i.test(query);
  const hasProjectFilter = /\[System\.TeamProject\]\s*=\s*(?:@project|'|")/i.test(query);
  const hasDateWindow = /(\[System\.(?:ChangedDate|CreatedDate)\]|\[Microsoft\.VSTS\.Common\.ClosedDate\]|@today|@startofday|@startofweek|@startofmonth|@startofyear)/i.test(query);
  const hasAreaFilter = /\[System\.AreaPath\]\s+(?:=|under|not under|in|not in)/i.test(query);
  const hasIterationFilter = /\[System\.IterationPath\]\s+(?:=|under|not under|in|not in)/i.test(query);
  const hasAssignedFilter = /\[System\.AssignedTo\]/i.test(query);
  const hasStateFilter = /\[System\.State\]/i.test(query);
  const hasTypeFilter = /\[System\.WorkItemType\]/i.test(query);
  const hasIdFilter = /\[System\.Id\]\s*(?:=|in|>|<|>=|<=)/i.test(query);

  const narrowFilterCount = [
    hasAreaFilter,
    hasIterationFilter,
    hasAssignedFilter,
    hasStateFilter,
    hasTypeFilter,
    hasIdFilter,
    hasDateWindow,
  ].filter(Boolean).length;

  const riskFlags: string[] = [];
  if (usesContains) {
    riskFlags.push('Uses CONTAINS / CONTAINS WORDS substring matching, which is expensive for routine listing.');
  }
  if (usesEver) {
    riskFlags.push('Uses EVER / WAS EVER, which scans revision history and can be significantly more expensive.');
  }
  if (usesAsOf) {
    riskFlags.push('Uses ASOF historical evaluation, which is more complex than current-state queries.');
  }
  if (usesWorkItemLinks) {
    riskFlags.push('Uses WorkItemLinks, which is typically more expensive than flat WorkItems queries.');
  }
  if (!hasDateWindow && !usesWorkItemLinks) {
    riskFlags.push('No date window detected. Add ChangedDate or CreatedDate bounds for routine scans.');
  }
  if (narrowFilterCount < 2) {
    riskFlags.push('Query may be broad. Add filters like type, state, assignee, area, iteration, or ID range.');
  }
  if (top > 100) {
    riskFlags.push(`High top value (${top}) increases hydration and payload cost.`);
  }
  if (requestedFieldCount > 12) {
    riskFlags.push(`Large field list (${requestedFieldCount}) increases payload size.`);
  }
  if (!hasProjectFilter) {
    riskFlags.push('Missing explicit TeamProject filter. Keep queries project-bounded whenever possible.');
  }

  return {
    usesContains,
    usesEver,
    usesAsOf,
    usesWorkItemLinks,
    hasProjectFilter,
    hasDateWindow,
    hasAreaFilter,
    hasIterationFilter,
    hasAssignedFilter,
    hasStateFilter,
    hasTypeFilter,
    requestedFieldCount,
    top,
    narrowFilterCount,
    riskFlags,
    bestPractices: [
      'Always keep [System.TeamProject] = @project unless you intentionally need cross-project behavior.',
      'Prefer =, IN, and UNDER filters over substring operators like CONTAINS.',
      'Add a bounded ChangedDate or CreatedDate window using @Today or @StartOfMonth for routine listing.',
      'Use AreaPath UNDER, IterationPath UNDER, @CurrentIteration, and @Me to express structure directly.',
      'Return IDs first, then request only the fields you need in the batch hydration step.',
      'Move repeatable team logic into saved queries and call getQueryResults when possible.',
    ],
    avoidPatterns: [
      'Avoid CONTAINS / CONTAINS WORDS for default work item listing.',
      'Avoid EVER / WAS EVER unless you specifically need revision-history semantics.',
      'Avoid large unbounded top values with no date window.',
      'Avoid hydrating broad result sets with oversized field lists.',
    ],
    recommendedAlternatives: [
      'Use listWorkItems with exact filters when you know the fields to filter on.',
      'Use getQueryResults when a saved query already exists in Azure DevOps.',
      'Use getRecentlyUpdatedWorkItems or getMyWorkItems for common bounded slices.',
      'Use getWorkItemsBatch after you already know the IDs you need.',
    ],
    recommendedTemplates: QUERY_TEMPLATES,
  };
}

export function buildListWorkItemsUsageProfile(options: {
  resultCount: number;
  top: number;
  requestedFieldCount: number;
  queryAnalysis: WiqlQueryAuthoringGuidance;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  let score = 0;
  if (options.queryAnalysis.usesContains) score += 3;
  if (options.queryAnalysis.usesEver || options.queryAnalysis.usesAsOf || options.queryAnalysis.usesWorkItemLinks) score += 2;
  if (!options.queryAnalysis.hasDateWindow) score += 1;
  if (estimatedAdoCalls > 2) score += 1;
  if (options.requestedFieldCount > 12) score += 1;
  if (options.queryAnalysis.narrowFilterCount < 2) score += 1;

  return {
    toolName: 'listWorkItems',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('queryByWiql', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      'WIQL breadth and selectivity',
      'Returned ID count that must be hydrated',
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Repeatable, structured work item discovery with exact filters.',
      'Replacing free-text search when the caller knows type, state, assignee, area, iteration, or date bounds.',
    ],
    bestPractices: options.queryAnalysis.bestPractices,
    avoid: options.queryAnalysis.avoidPatterns,
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['getQueryResults', 'getRecentlyUpdatedWorkItems', 'getMyWorkItems', 'getWorkItemsBatch'],
    queryAuthoring: options.queryAnalysis,
  };
}

export function buildRecentWorkItemsUsageProfile(options: {
  resultCount: number;
  top: number;
  requestedFieldCount: number;
  days: number;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  const score = estimatedAdoCalls > 2 || options.requestedFieldCount > 12 ? 2 : 0;

  return {
    toolName: 'getRecentlyUpdatedWorkItems',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('queryByWiql for recent changes', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      `ChangedDate window of ${options.days} day${options.days === 1 ? '' : 's'}`,
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Cheap recent-change monitoring instead of a broad project scan.',
      'Bootstrapping follow-up calls for a small set of recently changed IDs.',
    ],
    bestPractices: [
      'Keep the date window tight.',
      'Keep top small for polling or frequent refreshes.',
      'Use getWorkItemsBatch afterward if you need a richer field set for only a few IDs.',
    ],
    avoid: [
      'Avoid using this for historical reporting windows that should live in a saved query.',
      'Avoid oversized field lists during frequent polling.',
    ],
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['listWorkItems', 'getQueryResults', 'getWorkItemsBatch'],
  };
}

export function buildMyWorkItemsUsageProfile(options: {
  resultCount: number;
  top: number;
  requestedFieldCount: number;
  days: number;
  state?: string;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  const score = estimatedAdoCalls > 2 || options.requestedFieldCount > 12 ? 2 : 0;

  return {
    toolName: 'getMyWorkItems',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('queryByWiql for @Me', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      `ChangedDate window of ${options.days} day${options.days === 1 ? '' : 's'}`,
      options.state ? `State filter on ${options.state}` : 'No explicit state filter',
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Assigned-to-me slices without inventing custom WIQL.',
      'Personal work views with bounded freshness windows.',
    ],
    bestPractices: [
      'Add a state filter when possible.',
      'Keep the day window focused on the current planning horizon.',
      'Use getWorkItemsBatch or getWorkItemById only for the few IDs you actually need to inspect deeply.',
    ],
    avoid: [
      'Avoid using this as a substitute for cross-team reporting.',
      'Avoid large top values for routine refreshes.',
    ],
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['listWorkItems', 'getQueryResults', 'getWorkItemsBatch'],
  };
}

export function buildSavedQueryUsageProfile(options: {
  resultCount: number;
  requestedFieldCount: number;
  queryType?: string;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  const score = estimatedAdoCalls > 2 || options.requestedFieldCount > 12 ? 2 : 0;

  return {
    toolName: 'getQueryResults',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('queryById for saved WIQL', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      options.queryType ? `Saved query type: ${options.queryType}` : 'Saved query execution',
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Repeatable team queries already curated in Azure DevOps.',
      'Keeping LLM prompts out of the query-authoring path for stable reporting logic.',
    ],
    bestPractices: [
      'Prefer saved queries for recurring dashboards and team workflows.',
      'Still request only the fields you need in hydration.',
      'Keep saved query filters selective and bounded over time when possible.',
    ],
    avoid: [
      'Avoid hydrating excessive fields if the saved query is already broad.',
    ],
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['listWorkItems', 'getWorkItemsBatch'],
  };
}

export function buildBuildWorkItemsUsageProfile(options: {
  resultCount: number;
  requestedFieldCount: number;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  const score = estimatedAdoCalls > 2 || options.requestedFieldCount > 12 ? 2 : 1;

  return {
    toolName: 'getBuildWorkItems',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('getBuildWorkItemsRefs', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      'Build-to-work-item association lookup',
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Inspecting the work items tied to a single known build.',
    ],
    bestPractices: [
      'Call this only after you already know the build ID you care about.',
      'Keep the field list narrow for build diagnostics workflows.',
    ],
    avoid: [
      'Avoid using this in loops over many builds without backoff or caching.',
    ],
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['getBuilds', 'getWorkItemsBatch'],
  };
}

export function buildSprintWorkItemsUsageProfile(options: {
  resultCount: number;
  requestedFieldCount: number;
}): ApiUsageProfile {
  const estimatedAdoCalls = 1 + estimateHydrationCalls(options.resultCount);
  const score = estimatedAdoCalls > 2 || options.requestedFieldCount > 12 ? 2 : 1;

  return {
    toolName: 'getSprintWorkItems',
    relativeCost: chooseRelativeCost(score),
    estimatedAdoCalls,
    callBreakdown: buildCallBreakdown('getIterationWorkItems', options.resultCount),
    tstuGuidance: TSTU_GUIDANCE,
    costDrivers: [
      'Sprint backlog reference lookup',
      buildFieldPayloadNote(options.requestedFieldCount),
    ],
    bestFor: [
      'Inspecting the items for one known sprint and team context.',
    ],
    bestPractices: [
      'Use this once you already know the sprint ID from getCurrentSprint or getSprints.',
      'Keep the field list limited to planning columns you actually need.',
    ],
    avoid: [
      'Avoid repeatedly polling many sprint IDs in a tight loop.',
    ],
    rateLimitHeadersToWatch: RATE_LIMIT_HEADERS,
    recommendedAlternativeTools: ['getCurrentSprint', 'getSprints', 'getWorkItemsBatch'],
  };
}