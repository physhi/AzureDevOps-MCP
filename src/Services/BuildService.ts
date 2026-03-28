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
  GetPullRequestBuildsParams,
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

    const builds = await this.withAuthRetry(() => buildApi.getBuilds(
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
    ), {
      operationName: 'builds.list',
      details: {
        project,
        top: params.top || 25,
        branchName: params.branchName,
        repositoryId: params.repositoryId,
        statusFilter: params.statusFilter,
        resultFilter: params.resultFilter,
      },
    });

    return builds || [];
  }

  /**
   * Get a single build by ID.
   */
  public async getBuild(params: GetBuildParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    return await this.withAuthRetry(() => buildApi.getBuild(project, params.buildId), {
      operationName: 'builds.get',
      details: {
        project,
        buildId: params.buildId,
      },
    });
  }

  /**
   * Get build logs. If logId is provided, returns specific log lines; otherwise returns log metadata list.
   */
  public async getBuildLogs(params: GetBuildLogParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    if (params.logId !== undefined) {
      // Get specific log lines
      const logId = params.logId;
      const lines = await this.withAuthRetry(() => buildApi.getBuildLogLines(
        project,
        params.buildId,
        logId,
        params.startLine,
        params.endLine,
      ), {
        operationName: 'builds.logs.lines',
        details: {
          project,
          buildId: params.buildId,
          logId,
        },
      });
      return { logId, lines: lines || [] };
    }

    // Get all log metadata
    const logs = await this.withAuthRetry(() => buildApi.getBuildLogs(project, params.buildId), {
      operationName: 'builds.logs.list',
      details: {
        project,
        buildId: params.buildId,
      },
    });
    return logs || [];
  }

  /**
   * Get changes (commits) associated with a build.
   */
  public async getBuildChanges(params: GetBuildChangesParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const changes = await this.withAuthRetry(() => buildApi.getBuildChanges(
      project,
      params.buildId,
      undefined,       // continuationToken
      params.top || 50,
    ), {
      operationName: 'builds.changes.list',
      details: {
        project,
        buildId: params.buildId,
        top: params.top || 50,
      },
    });
    return changes || [];
  }

  /**
   * List build/pipeline definitions.
   */
  public async getDefinitions(params: ListDefinitionsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    const definitions = await this.withAuthRetry(() => buildApi.getDefinitions(
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
    ), {
      operationName: 'builds.definitions.list',
      details: {
        project,
        top: params.top || 25,
        repositoryId: params.repositoryId,
        path: params.path,
        name: params.name,
      },
    });
    return definitions || [];
  }

  /**
   * Get a single build definition by ID.
   */
  public async getDefinition(params: GetDefinitionParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    return await this.withAuthRetry(() => buildApi.getDefinition(
      project,
      params.definitionId,
      undefined,                   // revision
      undefined,                   // minMetricsTime
      undefined,                   // propertyFilters
      params.includeLatestBuilds,  // includeLatestBuilds
    ), {
      operationName: 'builds.definitions.get',
      details: {
        project,
        definitionId: params.definitionId,
      },
    });
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

    return await this.withAuthRetry(() => buildApi.queueBuild(build, project), {
      operationName: 'builds.queue',
      details: {
        project,
        definitionId: params.definitionId,
        sourceBranch: params.sourceBranch,
      },
    });
  }

  /**
   * List artifacts for a build.
   */
  public async getBuildArtifacts(params: ListBuildArtifactsParams): Promise<any[]> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    const artifacts = await this.withAuthRetry(() => buildApi.getArtifacts(project, params.buildId), {
      operationName: 'builds.artifacts.list',
      details: {
        project,
        buildId: params.buildId,
      },
    });
    return artifacts || [];
  }

  /**
   * Get build timeline (stages, jobs, tasks).
   */
  public async getBuildTimeline(params: GetBuildTimelineParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    return await this.withAuthRetry(() => buildApi.getBuildTimeline(project, params.buildId), {
      operationName: 'builds.timeline.get',
      details: {
        project,
        buildId: params.buildId,
      },
    });
  }

  /**
   * Get work items associated with a build.
   */
  public async getBuildWorkItems(params: GetBuildWorkItemsParams): Promise<any> {
    const throttleNotices: import('./AzureDevOpsService').ThrottleNotice[] = [];
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;
    const refs = await this.withAuthRetry(() => buildApi.getBuildWorkItemsRefs(project, params.buildId, params.top || 50), {
      operationName: 'builds.workItems.refs',
      details: {
        project,
        buildId: params.buildId,
        top: params.top || 50,
      },
    }, throttleNotices);

    const workItems = await this.hydrateWorkItemRefs(refs || [], {
      fields: params.fields,
      operationName: 'builds.workItems.batchHydrate',
      project,
      throttleAccumulator: throttleNotices,
    });

    return {
      workItems,
      count: workItems.length,
      throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
    };
  }

  /**
   * Get builds associated with a pull request via policy evaluations.
   * Extracts build IDs from build validation policies and fetches build details.
   */
  public async getPullRequestBuilds(params: GetPullRequestBuildsParams): Promise<any> {
    const buildApi = await this.getBuildApi();
    const project = params.project || this.config.project;

    // Get policy evaluations to find build IDs
    const policyApi = await this.connection.getPolicyApi();
    const coreApi = await this.connection.getCoreApi();
    const projectDetails = await this.withAuthRetry(() => coreApi.getProject(project), {
      operationName: 'builds.pullRequest.project',
      details: {
        project,
        pullRequestId: params.pullRequestId,
      },
    });
    const projectId = projectDetails?.id;
    if (!projectId) {
      throw new Error(`Could not resolve project ID for "${project}"`);
    }

    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}%2F${params.pullRequestId}`;
    const evaluations = await this.withAuthRetry(() => policyApi.getPolicyEvaluations(project, artifactId), {
      operationName: 'builds.pullRequest.policyEvaluations',
      details: {
        project,
        pullRequestId: params.pullRequestId,
      },
    });

    // Extract build IDs from build validation policy evaluations
    const buildInfos: Array<{ buildId: number; definitionName: string; status: string | undefined }> = [];
    for (const evaluation of (evaluations || [])) {
      const config = evaluation.configuration;
      if (!config?.type?.id) continue;

      // Build validation policy type ID: 0609b952-1397-4640-95ec-e00a01b2c241
      const policyTypeId = config.type.id;
      if (policyTypeId !== '0609b952-1397-4640-95ec-e00a01b2c241') continue;

      const settings = config.settings;
      if (!settings) continue;

      const buildDefinitionId = settings.buildDefinitionId;
      const displayName = settings.displayName || config.type.displayName || `Definition ${buildDefinitionId}`;

      // The most recent build ID is in the evaluation context
      const context = evaluation.context as any;
      const buildId = context?.buildId;

      if (buildId) {
        buildInfos.push({
          buildId,
          definitionName: displayName,
          status: String(evaluation.status ?? 'unknown'),
        });
      } else if (buildDefinitionId) {
        // No build yet — find most recent build for this definition on the PR branch
        try {
          const gitApi = await this.connection.getGitApi();
          const repositoryId = await this.resolveRepositoryId(params.repository, project);
          const pr = await gitApi.getPullRequest(repositoryId, params.pullRequestId, project);
          const branchName = pr.sourceRefName;
          if (branchName) {
            const builds = await this.withAuthRetry(() => buildApi.getBuilds(
              project,
              [buildDefinitionId],
              undefined, undefined, undefined, undefined, undefined, undefined,
              undefined, undefined, undefined, undefined,
              1, // top=1, most recent
              undefined, undefined, undefined,
              BuildQueryOrder.StartTimeDescending,
              branchName,
            ), {
              operationName: 'builds.pullRequest.validationBuilds',
              details: {
                project,
                pullRequestId: params.pullRequestId,
                definitionId: buildDefinitionId,
              },
            });
            if (builds && builds.length > 0) {
              buildInfos.push({
                buildId: builds[0].id!,
                definitionName: displayName,
                status: String(evaluation.status ?? 'unknown'),
              });
            }
          }
        } catch {
          // Skip if we can't find the build
        }
      }
    }

    // Fetch build details and optionally timeline for each build (parallel)
    const builds = await Promise.all(buildInfos.map(async (info) => {
      try {
        const build = await this.withAuthRetry(() => buildApi.getBuild(project, info.buildId), {
          operationName: 'builds.pullRequest.buildDetails',
          details: {
            project,
            buildId: info.buildId,
            pullRequestId: params.pullRequestId,
          },
        });
        const buildResult: any = {
          ...build,
          policyDefinitionName: info.definitionName,
          policyStatus: info.status,
        };

        if (params.includeTimeline) {
          try {
            const timeline = await this.withAuthRetry(() => buildApi.getBuildTimeline(project, info.buildId), {
              operationName: 'builds.pullRequest.timeline',
              details: {
                project,
                buildId: info.buildId,
              },
            });
            buildResult.timeline = timeline;
          } catch {
            buildResult.timeline = null;
          }
        }

        if (params.includeLogs) {
          try {
            const logs = await this.withAuthRetry(() => buildApi.getBuildLogs(project, info.buildId), {
              operationName: 'builds.pullRequest.logs',
              details: {
                project,
                buildId: info.buildId,
              },
            });
            buildResult.logMetadata = logs;
          } catch {
            buildResult.logMetadata = null;
          }
        }

        return buildResult;
      } catch (error) {
        return {
          buildId: info.buildId,
          policyDefinitionName: info.definitionName,
          policyStatus: info.status,
          error: `Failed to fetch build details: ${error}`,
        };
      }
    }));

    return { builds, totalPolicyBuilds: buildInfos.length };
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
