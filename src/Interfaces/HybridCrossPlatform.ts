export interface ManageMultiplatformBuildsParams {
  definitionId?: number;
  platforms?: ('windows' | 'linux' | 'macos' | 'android' | 'ios' | 'web')[];
  action?: 'configure' | 'queue' | 'status';
}

export interface SyncGitHubProjectsParams {
  githubRepo: string;
  adoProjectId: string;
  syncItems?: ('issues' | 'prs' | 'releases' | 'discussions')[];
  syncDirection?: 'github-to-ado' | 'ado-to-github' | 'bidirectional';
}

export interface IntegrateGitLabPipelinesParams {
  gitlabProjectUrl: string;
  adoProjectId: string;
  triggerType?: 'manual' | 'automatic' | 'webhook';
}

export interface ManageCrossRepoWorkflowsParams {
  primaryRepository: string;
  dependentRepositories: string[];
  workflowType?: 'build' | 'release' | 'test' | 'custom';
  workflowDefinition?: Record<string, any>;
}

export interface ManageHybridDeploymentsParams {
  releaseDefinitionId?: number;
  environments?: ('azure' | 'aws' | 'gcp' | 'onprem' | 'kubernetes')[];
  action?: 'configure' | 'status' | 'promote';
}

export interface ConfigureMulticloudPipelinesParams {
  definitionName: string;
  clouds: ('azure' | 'aws' | 'gcp' | 'oracle' | 'ibm')[];
  templatePath?: string;
}

export interface OptimizeCloudResourcesParams {
  environments?: string[];
  resourceTypes?: ('compute' | 'storage' | 'database' | 'network' | 'all')[];
  optimizationGoals?: ('cost' | 'performance' | 'availability' | 'all')[];
}

export interface MonitorHybridEnvironmentsParams {
  environmentNames?: string[];
  metricTypes?: ('health' | 'performance' | 'cost' | 'security' | 'all')[];
  timeRange?: string;
} 