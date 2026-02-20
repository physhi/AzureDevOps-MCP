import { BuildApi } from 'azure-devops-node-api/BuildApi';
import { BuildStatus, BuildResult, BuildQueryOrder } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService } from './AzureDevOpsService';
import {
  ListBuildsParams,
  GetBuildParams,
  GetBuildLogParams,
  GetBuildChangesParams,
  ListDefinitionsParams,
  GetDefinitionParams,
  RunPipelineParams,
  ListBuildArtifactsParams,
  GetBuildTimelineParams,
  GetBuildWorkItemsParams,
} from '../Interfaces/Pipelines';

export class BuildService extends AzureDevOpsService {
  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  private async getBuildApi(): Promise<BuildApi> {
    return await this.connection.getBuildApi();
  }

  /**
   * List builds with optional filters.
   */
  public async getBuilds(params: ListBuildsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const statusFilter = params.statusFilter ? this.parseBuildStatus(params.statusFilter) : undefined;
    const resultFilter = params.resultFilter ? this.parseBuildResult(params.resultFilter) : undefined;
    const queryOrder = params.queryOrder === 'startTimeAscending'
      ? BuildQueryOrder.StartTimeAscending
      : BuildQueryOrder.StartTimeDescending;

    const builds = await buildApi.getBuilds(
      project,
      params.definitions,       // definitions
      undefined,                // queues
      undefined,                // buildNumber
      undefined,                // minTime
      undefined,                // maxTime
      params.requestedFor,      // requestedFor
      undefined,                // reasonFilter
      statusFilter,             // statusFilter
      resultFilter,             // resultFilter
      params.tagFilters,        // tagFilters
      undefined,                // properties
      params.top || 25,         // top
      undefined,                // continuationToken
      undefined,                // maxBuildsPerDefinition
      undefined,                // deletedFilter
      queryOrder,               // queryOrder
      params.branchName,        // branchName
      undefined,                // buildIds
      params.repositoryId,      // repositoryId
      params.repositoryType,    // repositoryType
    );

    return builds || [];
  }

  /**
   * Get a single build by ID.
   */
  public async getBuild(params: GetBuildParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    return await buildApi.getBuild(project, params.buildId);
  }

  /**
   * Get build logs. If logId is provided, returns specific log lines; otherwise returns log metadata list.
   */
  public async getBuildLogs(params: GetBuildLogParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    if (params.logId !== undefined) {
      // Get specific log lines
      const lines = await buildApi.getBuildLogLines(
        project,
        params.buildId,
        params.logId,
        params.startLine,
        params.endLine,
      );
      return { logId: params.logId, lines: lines || [] };
    }

    // Get all log metadata
    const logs = await buildApi.getBuildLogs(project, params.buildId);
    return logs || [];
  }

  /**
   * Get changes (commits) associated with a build.
   */
  public async getBuildChanges(params: GetBuildChangesParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const changes = await buildApi.getBuildChanges(
      project,
      params.buildId,
      undefined,       // continuationToken
      params.top || 50,
    );
    return changes || [];
  }

  /**
   * List build/pipeline definitions.
   */
  public async getDefinitions(params: ListDefinitionsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const definitions = await buildApi.getDefinitions(
      project,
      params.name,              // name filter
      params.repositoryId,      // repositoryId
      params.repositoryType,    // repositoryType
      undefined,                // queryOrder
      params.top || 25,         // top
      undefined,                // continuationToken
      undefined,                // minMetricsTime
      undefined,                // definitionIds
      params.path,              // path
      undefined,                // builtAfter
      undefined,                // notBuiltAfter
      undefined,                // includeAllProperties
      params.includeLatestBuilds, // includeLatestBuilds
    );
    return definitions || [];
  }

  /**
   * Get a single build definition by ID.
   */
  public async getDefinition(params: GetDefinitionParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    return await buildApi.getDefinition(
      project,
      params.definitionId,
      undefined,                   // revision
      undefined,                   // minMetricsTime
      undefined,                   // propertyFilters
      params.includeLatestBuilds,  // includeLatestBuilds
    );
  }

  /**
   * Queue/trigger a build run.
   */
  public async runPipeline(params: RunPipelineParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const build: any = {
      definition: { id: params.definitionId },
      ...(params.sourceBranch && { sourceBranch: params.sourceBranch }),
      ...(params.parameters && { parameters: JSON.stringify(params.parameters) }),
    };

    return await buildApi.queueBuild(build, project);
  }

  /**
   * List artifacts for a build.
   */
  public async getBuildArtifacts(params: ListBuildArtifactsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    const artifacts = await buildApi.getArtifacts(project, params.buildId);
    return artifacts || [];
  }

  /**
   * Get build timeline (stages, jobs, tasks).
   */
  public async getBuildTimeline(params: GetBuildTimelineParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    return await buildApi.getBuildTimeline(project, params.buildId);
  }

  /**
   * Get work items associated with a build.
   */
  public async getBuildWorkItems(params: GetBuildWorkItemsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    const refs = await buildApi.getBuildWorkItemsRefs(project, params.buildId, params.top || 50);
    return refs || [];
  }

  private parseBuildStatus(status: string): BuildStatus | undefined {
    const map: Record<string, BuildStatus> = {
      'inprogress': BuildStatus.InProgress,
      'completed': BuildStatus.Completed,
      'cancelling': BuildStatus.Cancelling,
      'postponed': BuildStatus.Postponed,
      'notstarted': BuildStatus.NotStarted,
      'all': BuildStatus.All,
    };
    return map[status.toLowerCase()];
  }

  private parseBuildResult(result: string): BuildResult | undefined {
    const map: Record<string, BuildResult> = {
      'succeeded': BuildResult.Succeeded,
      'partiallysucceeded': BuildResult.PartiallySucceeded,
      'failed': BuildResult.Failed,
      'canceled': BuildResult.Canceled,
    };
    return map[result.toLowerCase()];
  }
}
