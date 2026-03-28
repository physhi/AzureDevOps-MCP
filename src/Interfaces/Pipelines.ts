/**
 * Parameters for listing builds with filters.
 */
export interface ListBuildsParams {
  project?: string;
  definitions?: number[];
  statusFilter?: string;
  resultFilter?: string;
  branchName?: string;
  repositoryId?: string;
  repositoryType?: string;
  requestedFor?: string;
  tagFilters?: string[];
  top?: number;
  queryOrder?: string;
}

/**
 * Parameters for getting a single build.
 */
export interface GetBuildParams {
  buildId: number;
  project?: string;
}

/**
 * Parameters for getting build logs.
 */
export interface GetBuildLogParams {
  buildId: number;
  logId?: number;
  startLine?: number;
  endLine?: number;
  project?: string;
}

/**
 * Parameters for getting build changes (commits).
 */
export interface GetBuildChangesParams {
  buildId: number;
  top?: number;
  project?: string;
}

/**
 * Parameters for listing build/pipeline definitions.
 */
export interface ListDefinitionsParams {
  project?: string;
  name?: string;
  repositoryId?: string;
  repositoryType?: string;
  path?: string;
  top?: number;
  includeLatestBuilds?: boolean;
}

/**
 * Parameters for getting a single definition.
 */
export interface GetDefinitionParams {
  definitionId: number;
  project?: string;
  includeLatestBuilds?: boolean;
}

/**
 * Parameters for running/queueing a pipeline.
 */
export interface RunPipelineParams {
  definitionId: number;
  project?: string;
  sourceBranch?: string;
  parameters?: Record<string, string>;
}

/**
 * Parameters for listing build artifacts.
 */
export interface ListBuildArtifactsParams {
  buildId: number;
  project?: string;
}

/**
 * Parameters for getting build timeline.
 */
export interface GetBuildTimelineParams {
  buildId: number;
  project?: string;
}

/**
 * Parameters for getting build work items.
 */
export interface GetBuildWorkItemsParams {
  buildId: number;
  top?: number;
  project?: string;
  fields?: string[];
}

/**
 * Parameters for getting builds associated with a pull request.
 */
export interface GetPullRequestBuildsParams {
  repository: string;
  pullRequestId: number;
  includeTimeline?: boolean;
  includeLogs?: boolean;
  project?: string;
}
