export interface GetAICodeReviewParams {
  pullRequestId?: number;
  repository?: string;
  commitId?: string;
  filePath?: string;
}

export interface SuggestCodeOptimizationParams {
  repository: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  optimizationType?: 'performance' | 'memory' | 'readability' | 'all';
}

export interface IdentifyCodeSmellsParams {
  repository: string;
  branch?: string;
  filePath?: string;
  severity?: 'high' | 'medium' | 'low' | 'all';
}

export interface GetPredictiveBugAnalysisParams {
  repository: string;
  pullRequestId?: number;
  branch?: string;
  filePath?: string;
}

export interface GetDeveloperProductivityParams {
  userId?: string;
  teamId?: string;
  timeRange?: string;
  includeMetrics?: string[];
}

export interface GetPredictiveEffortEstimationParams {
  workItemIds?: number[];
  workItemType?: string;
  areaPath?: string;
}

export interface GetCodeQualityTrendsParams {
  repositoryId?: string;
  branch?: string;
  timeRange?: string;
  metrics?: string[];
}

export interface SuggestWorkItemRefinementsParams {
  workItemId?: number;
  workItemType?: string;
  areaPath?: string;
}

export interface SuggestAutomationOpportunitiesParams {
  projectId?: string;
  scopeType?: 'builds' | 'releases' | 'tests' | 'workitems' | 'all';
}

export interface CreateIntelligentAlertsParams {
  alertName: string;
  alertType: 'build' | 'release' | 'test' | 'workitem' | 'code';
  conditions: Record<string, any>;
  actions?: Record<string, any>;
}

export interface PredictBuildFailuresParams {
  buildDefinitionId: number;
  lookbackPeriod?: string;
}

export interface OptimizeTestSelectionParams {
  buildId: number;
  changedFiles?: string[];
  maxTestCount?: number;
} 