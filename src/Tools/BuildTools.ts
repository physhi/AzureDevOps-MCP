import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { BuildService } from '../Services/BuildService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
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
import getClassMethods from '../utils/getClassMethods';
import {
  formatRelativeDate,
  formatFullDate,
  truncateText,
  markdownTable,
} from '../utils/formatHelpers';

export class BuildTools {
  private buildService: BuildService;

  constructor(config: AzureDevOpsConfig) {
    this.buildService = new BuildService(config);
  }

  // ── List Builds ──────────────────────────────────────────────────

  public async getBuilds(params: ListBuildsParams): Promise<McpResponse> {
    try {
      const builds = await this.buildService.getBuilds(params);

      if (builds.length === 0) {
        return formatMcpResponse(builds, `## Builds\n\nNo builds found matching the specified filters.`);
      }

      let md = `## Builds\n\n**${builds.length} build${builds.length !== 1 ? 's' : ''}** found\n\n`;

      const rows = builds.map((b: any) => [
        `#${b.id || 'N/A'}`,
        truncateText(b.definition?.name || 'Unknown', 30),
        b.buildNumber || '-',
        getBuildStatusEmoji(b.status) + ' ' + getBuildStatusLabel(b.status),
        getBuildResultEmoji(b.result) + ' ' + getBuildResultLabel(b.result),
        truncateText(b.sourceBranch?.replace('refs/heads/', '') || '-', 25),
        b.requestedFor?.displayName || '-',
        b.startTime ? formatRelativeDate(b.startTime) : '-',
        formatDuration(b.startTime, b.finishTime),
      ]);

      md += markdownTable(
        ['ID', 'Pipeline', 'Build #', 'Status', 'Result', 'Branch', 'Requested By', 'Started', 'Duration'],
        rows,
      );

      return formatMcpResponse(builds, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Build ────────────────────────────────────────────────────

  public async getBuild(params: GetBuildParams): Promise<McpResponse> {
    try {
      const build = await this.buildService.getBuild(params);

      let md = `## Build #${build.id}\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Pipeline** | ${build.definition?.name || 'Unknown'} |\n`;
      md += `| **Build Number** | ${build.buildNumber || '-'} |\n`;
      md += `| **Status** | ${getBuildStatusEmoji(build.status)} ${getBuildStatusLabel(build.status)} |\n`;
      md += `| **Result** | ${getBuildResultEmoji(build.result)} ${getBuildResultLabel(build.result)} |\n`;
      md += `| **Branch** | \`${build.sourceBranch?.replace('refs/heads/', '') || '-'}\` |\n`;
      md += `| **Source Version** | \`${truncateText(build.sourceVersion || '-', 12)}\` |\n`;
      md += `| **Requested By** | ${build.requestedFor?.displayName || '-'} |\n`;
      md += `| **Requested For** | ${build.requestedFor?.displayName || '-'} |\n`;
      md += `| **Queue** | ${build.queue?.name || '-'} |\n`;
      md += `| **Start Time** | ${build.startTime ? formatFullDate(build.startTime) : 'Not started'} |\n`;
      md += `| **Finish Time** | ${build.finishTime ? formatFullDate(build.finishTime) : 'In progress'} |\n`;
      md += `| **Duration** | ${formatDuration(build.startTime, build.finishTime)} |\n`;
      md += `| **Reason** | ${getBuildReasonLabel(build.reason)} |\n`;

      if (build.tags && build.tags.length > 0) {
        md += `| **Tags** | ${build.tags.join(', ')} |\n`;
      }

      if (build.triggerInfo) {
        md += `\n### Trigger Info\n`;
        md += `| Key | Value |\n|---|---|\n`;
        for (const [key, value] of Object.entries(build.triggerInfo)) {
          md += `| ${key} | ${value} |\n`;
        }
      }

      return formatMcpResponse(build, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Build Logs ───────────────────────────────────────────────

  public async getBuildLog(params: GetBuildLogParams): Promise<McpResponse> {
    try {
      const result = await this.buildService.getBuildLogs(params);

      if (params.logId !== undefined) {
        // Specific log content
        const lines: string[] = result.lines || [];
        let md = `## Build #${params.buildId} - Log #${params.logId}\n\n`;
        md += `**${lines.length} line${lines.length !== 1 ? 's' : ''}**\n\n`;
        md += '```\n';
        md += lines.join('\n');
        md += '\n```';
        return formatMcpResponse(result, md, false, true);
      }

      // Log metadata list
      const logs: any[] = result;
      let md = `## Build #${params.buildId} - Logs\n\n`;
      md += `**${logs.length} log${logs.length !== 1 ? 's' : ''}** available\n\n`;

      if (logs.length > 0) {
        const rows = logs.map((log: any) => [
          `${log.id || 'N/A'}`,
          log.type || '-',
          `${log.lineCount || 0}`,
        ]);
        md += markdownTable(['Log ID', 'Type', 'Lines'], rows);
        md += `\n\nUse \`getBuildLog\` with a specific \`logId\` to view log content.`;
      }

      return formatMcpResponse(result, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Build Changes ────────────────────────────────────────────

  public async getBuildChanges(params: GetBuildChangesParams): Promise<McpResponse> {
    try {
      const changes = await this.buildService.getBuildChanges(params);

      if (changes.length === 0) {
        return formatMcpResponse(changes, `## Build #${params.buildId} - Changes\n\nNo changes found.`);
      }

      let md = `## Build #${params.buildId} - Changes\n\n`;
      md += `**${changes.length} change${changes.length !== 1 ? 's' : ''}**\n\n`;

      const rows = changes.map((c: any) => [
        truncateText(c.id || '-', 12),
        c.author?.displayName || '-',
        truncateText(c.message || '-', 60),
        c.timestamp ? formatRelativeDate(c.timestamp) : '-',
      ]);

      md += markdownTable(['Commit', 'Author', 'Message', 'Date'], rows);

      return formatMcpResponse(changes, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── List Definitions ─────────────────────────────────────────────

  public async getDefinitions(params: ListDefinitionsParams): Promise<McpResponse> {
    try {
      const definitions = await this.buildService.getDefinitions(params);

      if (definitions.length === 0) {
        return formatMcpResponse(definitions, `## Pipeline Definitions\n\nNo definitions found.`);
      }

      let md = `## Pipeline Definitions\n\n`;
      md += `**${definitions.length} definition${definitions.length !== 1 ? 's' : ''}** found\n\n`;

      const rows = definitions.map((d: any) => [
        `${d.id || 'N/A'}`,
        d.name || 'Unknown',
        d.path || '\\',
        d.type === 2 ? 'YAML' : d.type === 1 ? 'Designer' : `${d.type || '-'}`,
        d.queueStatus === 0 ? 'Enabled' : d.queueStatus === 1 ? 'Paused' : d.queueStatus === 2 ? 'Disabled' : '-',
        d.latestBuild ? `#${d.latestBuild.id} (${getBuildResultLabel(d.latestBuild.result)})` : '-',
      ]);

      md += markdownTable(['ID', 'Name', 'Path', 'Type', 'Status', 'Latest Build'], rows);

      return formatMcpResponse(definitions, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Definition ───────────────────────────────────────────────

  public async getDefinition(params: GetDefinitionParams): Promise<McpResponse> {
    try {
      const def = await this.buildService.getDefinition(params);

      let md = `## Pipeline Definition #${def.id}\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Name** | ${def.name || 'Unknown'} |\n`;
      md += `| **Path** | ${def.path || '\\'} |\n`;
      md += `| **Type** | ${def.type === 2 ? 'YAML' : def.type === 1 ? 'Designer' : `${def.type || '-'}`} |\n`;
      md += `| **Queue Status** | ${def.queueStatus === 0 ? 'Enabled' : def.queueStatus === 1 ? 'Paused' : 'Disabled'} |\n`;
      md += `| **Default Branch** | \`${def.repository?.defaultBranch?.replace('refs/heads/', '') || '-'}\` |\n`;
      md += `| **Repository** | ${def.repository?.name || '-'} |\n`;

      if (def.process?.yamlFilename) {
        md += `| **YAML File** | \`${def.process.yamlFilename}\` |\n`;
      }

      if (def.latestBuild) {
        md += `\n### Latest Build\n`;
        md += `| Property | Value |\n|---|---|\n`;
        md += `| **Build #** | ${def.latestBuild.buildNumber || '-'} |\n`;
        md += `| **Result** | ${getBuildResultEmoji(def.latestBuild.result)} ${getBuildResultLabel(def.latestBuild.result)} |\n`;
        md += `| **Date** | ${def.latestBuild.finishTime ? formatFullDate(def.latestBuild.finishTime) : '-'} |\n`;
      }

      return formatMcpResponse(def, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Run Pipeline ─────────────────────────────────────────────────

  public async runPipeline(params: RunPipelineParams): Promise<McpResponse> {
    try {
      const build = await this.buildService.runPipeline(params);

      let md = `## Pipeline Run Queued\n\n`;
      md += `Build **#${build.id}** has been queued successfully.\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Build ID** | ${build.id} |\n`;
      md += `| **Build Number** | ${build.buildNumber || 'Pending'} |\n`;
      md += `| **Pipeline** | ${build.definition?.name || 'Unknown'} |\n`;
      md += `| **Status** | ${getBuildStatusEmoji(build.status)} ${getBuildStatusLabel(build.status)} |\n`;
      md += `| **Branch** | \`${build.sourceBranch?.replace('refs/heads/', '') || '-'}\` |\n`;
      md += `| **Requested By** | ${build.requestedBy?.displayName || '-'} |\n`;

      return formatMcpResponse(build, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── List Build Artifacts ─────────────────────────────────────────

  public async getBuildArtifacts(params: ListBuildArtifactsParams): Promise<McpResponse> {
    try {
      const artifacts = await this.buildService.getBuildArtifacts(params);

      if (artifacts.length === 0) {
        return formatMcpResponse(artifacts, `## Build #${params.buildId} - Artifacts\n\nNo artifacts found.`);
      }

      let md = `## Build #${params.buildId} - Artifacts\n\n`;
      md += `**${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}**\n\n`;

      const rows = artifacts.map((a: any) => [
        `${a.id || 'N/A'}`,
        a.name || 'Unknown',
        a.resource?.type || '-',
        a.resource?.url ? '[Download](' + a.resource.url + ')' : '-',
      ]);

      md += markdownTable(['ID', 'Name', 'Type', 'Link'], rows);

      return formatMcpResponse(artifacts, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Build Timeline ───────────────────────────────────────────

  public async getBuildTimeline(params: GetBuildTimelineParams): Promise<McpResponse> {
    try {
      const timeline = await this.buildService.getBuildTimeline(params);
      const records = timeline?.records || [];

      if (records.length === 0) {
        return formatMcpResponse(timeline, `## Build #${params.buildId} - Timeline\n\nNo timeline records found.`);
      }

      // Group by type: Stage > Job > Task
      // Azure DevOps uses "Phase" for job-level and "Job" for the actual job record
      const stages = records.filter((r: any) => r.type === 'Stage');
      const phases = records.filter((r: any) => r.type === 'Phase');
      const jobs = records.filter((r: any) => r.type === 'Job');
      const tasks = records.filter((r: any) => r.type === 'Task');


      let md = `## Build #${params.buildId} - Timeline\n\n`;
      md += `**${stages.length} stage(s), ${phases.length + jobs.length} job(s), ${tasks.length} task(s)**\n\n`;

      for (const stage of stages) {
        md += `### ${getTimelineResultEmoji(stage.result)} Stage: ${stage.name || 'Unknown'}\n`;
        md += `Status: ${formatTimelineState(stage.state)} | Result: ${formatTimelineResult(stage.result)} | Duration: ${formatDuration(stage.startTime, stage.finishTime)}\n\n`;

        const stagePhases = phases.filter((p: any) => p.parentId === stage.id);
        // If no phases, fall back to jobs directly under the stage
        const stageJobs = stagePhases.length > 0 ? stagePhases : jobs.filter((j: any) => j.parentId === stage.id);
        for (const job of stageJobs) {
          md += `#### ${getTimelineResultEmoji(job.result)} Job: ${job.name || 'Unknown'}\n`;
          md += `Status: ${formatTimelineState(job.state)} | Result: ${formatTimelineResult(job.result)} | Duration: ${formatDuration(job.startTime, job.finishTime)}\n\n`;

          // Tasks may be under Job records (children of Phase), or directly under Phase
          const childJobIds = jobs.filter((j: any) => j.parentId === job.id).map((j: any) => j.id);
          const taskParentIds = childJobIds.length > 0 ? childJobIds : [job.id];
          const jobTasks = tasks.filter((t: any) => taskParentIds.includes(t.parentId));
          if (jobTasks.length > 0) {
            const taskRows = jobTasks.map((t: any) => [
              getTimelineResultEmoji(t.result),
              truncateText(t.name || 'Unknown', 40),
              formatTimelineState(t.state),
              formatTimelineResult(t.result),
              formatDuration(t.startTime, t.finishTime),
            ]);
            md += markdownTable(['', 'Task', 'State', 'Result', 'Duration'], taskRows);
            md += '\n\n';
          }
        }
      }

      return formatMcpResponse(timeline, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }

  // ── Get Build Work Items ─────────────────────────────────────────

  public async getBuildWorkItems(params: GetBuildWorkItemsParams): Promise<McpResponse> {
    try {
      const workItems = await this.buildService.getBuildWorkItems(params);

      if (workItems.length === 0) {
        return formatMcpResponse(workItems, `## Build #${params.buildId} - Work Items\n\nNo associated work items found.`);
      }

      let md = `## Build #${params.buildId} - Work Items\n\n`;
      md += `**${workItems.length} work item${workItems.length !== 1 ? 's' : ''}**\n\n`;

      const rows = workItems.map((wi: any) => [
        `#${wi.id || 'N/A'}`,
        wi.url ? `[View](${wi.url})` : '-',
      ]);

      md += markdownTable(['ID', 'Link'], rows);

      return formatMcpResponse(workItems, md, false, true);
    } catch (error: any) {
      return formatErrorResponse(error);
    }
  }
}

// ── Export tool method names ──────────────────────────────────────

export const BuildToolMethods = getClassMethods(BuildTools);

// ── Helper Functions ─────────────────────────────────────────────

function getBuildStatusEmoji(status: number | undefined): string {
  switch (status) {
    case 1: return '🔄'; // InProgress
    case 2: return '✅'; // Completed
    case 4: return '⏸️';  // Cancelling
    case 8: return '⏳'; // Postponed
    case 32: return '🆕'; // NotStarted
    default: return '❓';
  }
}

function getBuildStatusLabel(status: number | undefined): string {
  switch (status) {
    case 1: return 'In Progress';
    case 2: return 'Completed';
    case 4: return 'Cancelling';
    case 8: return 'Postponed';
    case 32: return 'Not Started';
    default: return 'None';
  }
}

function getBuildResultEmoji(result: number | undefined): string {
  switch (result) {
    case 2: return '✅'; // Succeeded
    case 4: return '⚠️';  // PartiallySucceeded
    case 8: return '❌'; // Failed
    case 32: return '🚫'; // Canceled
    default: return '➖';
  }
}

function getBuildResultLabel(result: number | undefined): string {
  switch (result) {
    case 2: return 'Succeeded';
    case 4: return 'Partially Succeeded';
    case 8: return 'Failed';
    case 32: return 'Canceled';
    default: return 'None';
  }
}

function getBuildReasonLabel(reason: number | undefined): string {
  switch (reason) {
    case 1: return 'Manual';
    case 2: return 'Individual CI';
    case 4: return 'Batch CI';
    case 8: return 'Schedule';
    case 16: return 'Schedule Forced';
    case 32: return 'User Created';
    case 64: return 'Validate Shelveset';
    case 128: return 'Check-in Shelveset';
    case 256: return 'Pull Request';
    case 512: return 'Build Completion';
    case 1024: return 'Resource Trigger';
    default: return `${reason || 'Unknown'}`;
  }
}

function getTimelineResultEmoji(result: string | number | undefined): string {
  if (result === undefined || result === null) return '🔄';
  const r = typeof result === 'number' ? result : String(result).toLowerCase();
  if (r === 0 || r === 'succeeded') return '✅';
  if (r === 1 || r === 'succeededwithissues') return '⚠️';
  if (r === 2 || r === 'failed') return '❌';
  if (r === 3 || r === 'canceled') return '🚫';
  if (r === 4 || r === 'skipped') return '⏭️';
  return '🔄';
}

function formatDuration(start: string | Date | undefined, end: string | Date | undefined): string {
  if (!start) return '-';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = endTime - startTime;

  if (diffMs < 0) return '-';
  if (diffMs < 1000) return '<1s';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimelineState(state: string | number | undefined): string {
  if (state === undefined || state === null) return '-';
  const stateMap: Record<number, string> = { 0: 'Pending', 1: 'In Progress', 2: 'Completed' };
  if (typeof state === 'number') return stateMap[state] || `${state}`;
  return String(state);
}

function formatTimelineResult(result: string | number | undefined): string {
  if (result === undefined || result === null) return '-';
  const resultMap: Record<number, string> = { 0: 'Succeeded', 1: 'Succeeded with Issues', 2: 'Failed', 3: 'Canceled', 4: 'Skipped', 5: 'Abandoned' };
  if (typeof result === 'number') return resultMap[result] || `${result}`;
  return String(result);
}
