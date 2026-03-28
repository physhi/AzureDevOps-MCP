import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { WorkItemService } from '../Services/WorkItemService';
import { GitService } from '../Services/GitService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  WorkItemByIdParams,
  SearchWorkItemsParams,
  RecentWorkItemsParams,
  MyWorkItemsParams,
  CreateWorkItemParams,
  UpdateWorkItemParams,
  AddWorkItemCommentParams,
  ManageWorkItemCommentParams,
  GetWorkItemCommentsParams,
  UpdateWorkItemStateParams,
  AssignWorkItemParams,
  CreateLinkParams,
  CreateLinkServiceParams,
  ParsedTarget,
  ArtifactTargetType,
  BulkWorkItemParams,
  GetWorkItemsBatchParams,
  GetWorkItemRevisionsParams,
  GetQueryResultsParams,
  AddChildWorkItemParams,
  UnlinkWorkItemParams,
  ListWorkItemsParams,
} from '../Interfaces/WorkItems';
import getClassMethods from "../utils/getClassMethods";
import {
  formatRelativeDate,
  formatFullDate,
  getWorkItemTypeEmoji,
  getStateEmoji,
  getPriorityEmoji,
  formatEffort,
  truncateText,
  stripHtml,
  markdownTable
} from '../utils/formatHelpers';

/**
 * Parse a target ID string with optional prefix into a typed target.
 * Supports: PR#123, BUILD#456, BRANCH#main, COMMIT#abc, WI#789, or plain "789"
 */
function parseTargetId(targetId: string): ParsedTarget {
  const trimmed = targetId.trim();
  const match = trimmed.match(/^(PR|BUILD|BRANCH|COMMIT|WI)#(.+)$/i);

  if (!match) {
    // Plain number = work item
    return { type: 'workitem', id: trimmed, displayName: 'Work Item' };
  }

  const prefix = match[1].toUpperCase();
  const id = match[2];

  const prefixMap: Record<string, { type: ArtifactTargetType; displayName: string }> = {
    'PR':     { type: 'pr',       displayName: 'Pull Request' },
    'BUILD':  { type: 'build',    displayName: 'Build' },
    'BRANCH': { type: 'branch',   displayName: 'Branch' },
    'COMMIT': { type: 'commit',   displayName: 'Commit' },
    'WI':     { type: 'workitem', displayName: 'Work Item' },
  };

  return { ...prefixMap[prefix], id };
}

export class WorkItemTools {
  private workItemService: WorkItemService;
  private gitService: GitService;
  private config: AzureDevOpsConfig;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
    this.workItemService = new WorkItemService(config);
    this.gitService = new GitService(config);
  }

  /**
   * Resolve project name to project ID (GUID) using CoreApi
   */
  private async resolveProjectId(): Promise<string> {
    const coreApi = await this.workItemService['connection'].getCoreApi();
    const project = await coreApi.getProject(this.config.project);
    if (!project?.id) {
      throw new Error(`Could not resolve project '${this.config.project}' to a GUID.`);
    }
    return project.id;
  }

  private buildSummaryTable(workItems: any[], includeChanged = false): string {
    const headers = ['ID', 'Title', 'Type', 'State', 'Assigned', 'Author', 'Area', 'Team'];
    const rows = workItems.map((workItem: any) => {
      const row = [
        `#${workItem.id || 'N/A'}`,
        truncateText(workItem.title || '-', 36),
        `${getWorkItemTypeEmoji(workItem.workItemType || '')} ${workItem.workItemType || '-'}`,
        `${getStateEmoji(workItem.state || '')} ${workItem.state || '-'}`,
        truncateText(workItem.assignedTo?.displayName || 'Unassigned', 18),
        truncateText(workItem.createdBy?.displayName || 'Unknown', 18),
        truncateText(workItem.areaPath || '-', 22),
        truncateText(workItem.teamProject || '-', 16),
      ];

      if (includeChanged) {
        row.push(workItem.changedDate ? formatRelativeDate(workItem.changedDate) : '-');
      }

      return row;
    });

    if (includeChanged) {
      headers.push('Changed');
    }

    return markdownTable(headers, rows);
  }

  /**
   * List work items based on a WIQL query
   */
  public async listWorkItems(params: ListWorkItemsParams): Promise<McpResponse> {
    try {
      const response = await this.workItemService.listWorkItems(params.query, params.top, params.days, params.fields);
      const items = response.workItems || [];

      if (items.length === 0) {
        let md = `## Work Items\n\nNo work items found for the given WIQL query.`;
        if (response.recentDaysApplied) {
          md += `\n\nScoped to the last **${response.recentDaysApplied} day${response.recentDaysApplied === 1 ? '' : 's'}** by default.`;
        }
        md += `\n\nCheck your query syntax, widen the date window, or broaden the filter criteria.`;
        return formatMcpResponse(response, md);
      }

      let md = `## Work Items\n\n**${items.length} item${items.length !== 1 ? 's' : ''}** from WIQL query\n\n`;
      if (response.recentDaysApplied) {
        md += `Scoped to the last **${response.recentDaysApplied} day${response.recentDaysApplied === 1 ? '' : 's'}** by default.\n\n`;
      }
      md += this.buildSummaryTable(items);
      if (response.effectiveQuery) {
        md += `\n\n**Effective WIQL**\n\n\`\`\`sql\n${response.effectiveQuery}\n\`\`\``;
      }
      md += `\n\nUse \`getWorkItemsBatch\` with selected IDs and fields when you need details.`;

      return formatMcpResponse(response, md, false, true);
    } catch (error) {
      console.error('Error in listWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get a work item by ID
   */
  public async getWorkItemById(params: WorkItemByIdParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.getWorkItemWithEffortRollup(params);
      return this.formatWorkItemResponse(workItem, params.fullDescription);
    } catch (error) {
      console.error('Error in getWorkItemById tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Format work item response with optimized token usage
   */
  private formatWorkItemResponse(workItem: any, fullDescription?: boolean): McpResponse {
    if (!workItem) {
      return {
        content: [
          {
            type: "text",
            text: "Work item not found."
          }
        ]
      };
    }

    // Helper function to parse and format description
    const formatDescription = (description: string): string => {
      if (!description) return 'No description provided';
      const cleanDesc = stripHtml(description);
      if (fullDescription) return cleanDesc;
      return cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '...' : cleanDesc;
    };

    // Helper function to format sprint information (inline)
    const formatSprintInfo = (iterationPath: string): string => {
      if (!iterationPath) return 'No sprint';
      const parts = iterationPath.split('\\');
      const sprint = parts[parts.length - 1];
      return sprint;
    };

    // Generate the main work item display with summary at top
    const emoji = getWorkItemTypeEmoji(workItem.workItemType);
    const stateEmoji = getStateEmoji(workItem.state);
    const priorityEmoji = getPriorityEmoji(workItem.priority);

    let result = `## Work Item #${workItem.id}\n\n`;

    // One-line summary with key info
    result += `**${emoji} ${workItem.workItemType}** | ${stateEmoji} ${workItem.state} | ${priorityEmoji} P${workItem.priority || '?'} | `;
    result += `Assigned: ${workItem.assignedTo?.displayName || 'Unassigned'} | `;
    result += `${formatSprintInfo(workItem.iterationPath)}\n\n`;

    result += `# ${workItem.title}\n\n`;

    // Metadata: one-line format instead of table
    const createdBy = workItem.createdBy?.displayName || 'Unknown';
    const createdDate = workItem.createdDate ? `${formatFullDate(workItem.createdDate)} (${formatRelativeDate(workItem.createdDate)})` : 'Not set';
    const updatedDate = workItem.changedDate ? `${formatFullDate(workItem.changedDate)} (${formatRelativeDate(workItem.changedDate)})` : 'Not set';
    result += `**Area:** ${workItem.areaPath || 'Not set'} | **Created:** ${createdDate} by ${createdBy} | **Updated:** ${updatedDate}\n\n`;
    result += `---\n\n`;

    // Effort Tracking Section (condensed from 3 tables to inline stats)
    const hasEffortData = workItem.originalEstimate || workItem.completedWork || workItem.remainingWork;
    const hasChildEffort = workItem.childEffortRollup;

    if (hasEffortData || hasChildEffort) {
      result += `### Effort\n\n`;

      if (hasEffortData) {
        const original = workItem.originalEstimate || 0;
        const completed = workItem.completedWork || 0;
        const remaining = workItem.remainingWork || 0;
        const percentage = original > 0 ? Math.round((completed / original) * 100) : 0;
        result += `**Direct:** ${formatEffort(completed)}/${formatEffort(original)} done (${percentage}%) | ${formatEffort(remaining)} remaining\n`;
      }

      if (hasChildEffort) {
        const rollup = workItem.childEffortRollup;
        const childPercentage = rollup.totalOriginalEstimate > 0
          ? Math.round((rollup.totalCompletedWork / rollup.totalOriginalEstimate) * 100)
          : 0;
        result += `**Children (${rollup.childCount}):** ${formatEffort(rollup.totalCompletedWork)}/${formatEffort(rollup.totalOriginalEstimate)} done (${childPercentage}%) | ${formatEffort(rollup.totalRemainingWork)} remaining\n`;
      }

      // Combined summary if both exist
      if (hasEffortData && hasChildEffort) {
        const combinedOriginal = (workItem.originalEstimate || 0) + workItem.childEffortRollup.totalOriginalEstimate;
        const combinedCompleted = (workItem.completedWork || 0) + workItem.childEffortRollup.totalCompletedWork;
        const combinedRemaining = (workItem.remainingWork || 0) + workItem.childEffortRollup.totalRemainingWork;
        const combinedPercentage = combinedOriginal > 0
          ? Math.round((combinedCompleted / combinedOriginal) * 100)
          : 0;
        result += `**Total:** ${formatEffort(combinedCompleted)}/${formatEffort(combinedOriginal)} done (${combinedPercentage}%) | ${formatEffort(combinedRemaining)} remaining\n`;
      }

      result += `\n---\n\n`;
    }

    // Relationships section (concise list instead of detailed breakdown)
    if (workItem.relations && workItem.relations.length > 0) {
      result += `### Related Items\n\n`;

      // Separate work item links from artifact links
      const wiRelations = workItem.relations.filter((r: any) => r.relationshipType !== 'ArtifactLink');
      const artifactRelations = workItem.relations.filter((r: any) => r.relationshipType === 'ArtifactLink');

      // Group work item links by relationship type
      if (wiRelations.length > 0) {
        const grouped: { [key: string]: number[] } = {};
        wiRelations.forEach((relation: any) => {
          const relType = relation.relationshipType || 'Related';
          if (!grouped[relType]) grouped[relType] = [];
          grouped[relType].push(relation.relatedWorkItemId);
        });

        const relationTypes: { [key: string]: string } = {
          'System.LinkTypes.Hierarchy-Forward': 'Child',
          'System.LinkTypes.Hierarchy-Reverse': 'Parent',
          'System.LinkTypes.Dependency-Forward': 'Successor',
          'System.LinkTypes.Dependency-Reverse': 'Predecessor',
          'System.LinkTypes.Related': 'Related'
        };

        Object.entries(grouped).forEach(([relType, ids]) => {
          const label = relationTypes[relType]?.split(' ')[1] || 'Related';
          const idList = ids.map(id => `#${id}`).join(', ');
          result += `- ${idList} (${label})\n`;
        });
      }

      // Show artifact links
      if (artifactRelations.length > 0) {
        const artifactEmojis: { [key: string]: string } = {
          'Pull Request': 'PR',
          'Build': 'Build',
          'Branch': 'Branch',
          'Commit': 'Commit',
        };

        artifactRelations.forEach((relation: any) => {
          const displayName = relation.artifactDisplayName || relation.artifactType || 'Artifact';
          const prefix = artifactEmojis[relation.artifactType] || 'Artifact';
          result += `- ${prefix} ${displayName} #${relation.artifactId} (${relation.artifactType})\n`;
        });
      }

      result += `\n---\n\n`;
    }

    // Description section
    result += `## Description\n\n`;
    result += `${formatDescription(workItem.description)}\n\n`;

    // Prepare structured content
    const structuredData = {
      id: workItem.id,
      type: workItem.workItemType,
      title: workItem.title,
      state: workItem.state,
      priority: workItem.priority,
      assignedTo: workItem.assignedTo?.displayName,
      createdBy: workItem.createdBy?.displayName,
      createdDate: workItem.createdDate,
      changedDate: workItem.changedDate,
      areaPath: workItem.areaPath,
      iterationPath: workItem.iterationPath,
      effort: {
        original: workItem.originalEstimate,
        completed: workItem.completedWork,
        remaining: workItem.remainingWork
      },
      childEffort: hasChildEffort ? {
        childCount: workItem.childEffortRollup.childCount,
        totalOriginal: workItem.childEffortRollup.totalOriginalEstimate,
        totalCompleted: workItem.childEffortRollup.totalCompletedWork,
        totalRemaining: workItem.childEffortRollup.totalRemainingWork
      } : null,
      relations: workItem.relations?.map((r: any) => {
        if (r.relationshipType === 'ArtifactLink') {
          return {
            type: r.relationshipType,
            artifactType: r.artifactType,
            artifactId: r.artifactId,
            artifactDisplayName: r.artifactDisplayName,
            artifactUri: r.artifactUri,
          };
        }
        return {
          type: r.relationshipType,
          relatedId: r.relatedWorkItemId,
        };
      }) || [],
      description: workItem.description
    };

    return formatMcpResponse(structuredData, result, false, true);
  }

  /**
   * Search work items
   */
  public async searchWorkItems(params: SearchWorkItemsParams): Promise<McpResponse> {
    try {
      const results = await this.workItemService.searchWorkItems(params);
      return this.formatSearchResultsResponse(results);
    } catch (error) {
      console.error('Error in searchWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Format search results response with optimized tabular view
   */
  private formatSearchResultsResponse(results: any): McpResponse {
    if (!results || !results.workItems || results.workItems.length === 0) {
      const recentWindow = results?.recentDaysApplied ? ` in the last ${results.recentDaysApplied} day${results.recentDaysApplied === 1 ? '' : 's'}` : '';
      const wiqlBlock = results?.wiql ? `\n\n**Generated WIQL**\n\n\`\`\`sql\n${results.wiql}\n\`\`\`` : '';
      return {
        content: [
          {
            type: "text",
            text: `## Search Results\n\nNo work items found matching "${results?.searchQuery || 'your search'}"${recentWindow}.\n\nContains-based search is expensive in Azure DevOps. Prefer focused WIQL via \`listWorkItems\` or a saved query when possible.${wiqlBlock}`
          }
        ]
      };
    }

    // Calculate summary statistics upfront
    const typeSummary = results.workItems.reduce((acc: any, item: any) => {
      acc[item.workItemType] = (acc[item.workItemType] || 0) + 1;
      return acc;
    }, {});

    const stateSummary = results.workItems.reduce((acc: any, item: any) => {
      acc[item.state] = (acc[item.state] || 0) + 1;
      return acc;
    }, {});

    const totalEffort = {
      original: results.workItems.reduce((sum: number, i: any) => sum + (i.originalEstimate || 0), 0),
      completed: results.workItems.reduce((sum: number, i: any) => sum + (i.completedWork || 0), 0)
    };

    // Compact type/status lists
    const typeList = Object.entries(typeSummary)
      .map(([type, count]) => `${count} ${type.toLowerCase()}${(count as number) === 1 ? '' : 's'}`)
      .join(', ');
    const statusList = Object.entries(stateSummary)
      .map(([state, count]) => `${count} ${state.toLowerCase()}`)
      .join(', ');

    // START WITH SUMMARY AT TOP
    let result = `## Search Results: "${results.searchQuery}"\n\n`;
    result += `**${results.totalResults} items** | ${typeList} | ${statusList}`;
    if (totalEffort.completed > 0) {
      result += ` | **${formatEffort(totalEffort.completed)}/${formatEffort(totalEffort.original)}** completed`;
    }
    result += `\n\n---\n\n`;

    result += `| ID | Title | Type | Status | Assigned | Author | Area | Team |\n`;
    result += `|----|-------|------|--------|----------|--------|------|------|\n`;

    results.workItems.forEach((workItem: any) => {
      const typeEmoji = getWorkItemTypeEmoji(workItem.workItemType);
      const stateEmoji = getStateEmoji(workItem.state);
      const assignedTo = truncateText(workItem.assignedTo?.displayName || 'Unassigned', 18);
      const createdBy = truncateText(workItem.createdBy?.displayName || 'Unknown', 18);
      const areaPath = truncateText(workItem.areaPath || '-', 22);
      const teamProject = truncateText(workItem.teamProject || '-', 16);

      result += `| **#${workItem.id}** | ${truncateText(workItem.title, 36)} | ${typeEmoji} ${workItem.workItemType} | ${stateEmoji} ${workItem.state} | ${assignedTo} | ${createdBy} | ${areaPath} | ${teamProject} |\n`;
    });

    result += `\n---\n\n`;

    // High priority items (one line)
    const highPriorityItems = results.workItems.filter((item: any) => item.priority && item.priority <= 2);
    if (highPriorityItems.length > 0) {
      const highPriorityIds = highPriorityItems.map((i: any) => `#${i.id}`).join(', ');
      result += `**High Priority:** ${highPriorityIds} (${highPriorityItems.length} items)\n`;
    }

    // Recently updated (one line, top 3)
    const recentItems = results.workItems
      .sort((a: any, b: any) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime())
      .slice(0, 3);
    const recentList = recentItems.map((i: any) => `#${i.id} (${formatRelativeDate(i.changedDate)})`).join(', ');
    result += `**Recently Updated:** ${recentList}\n\n`;

    result += `---\n`;
    result += `Contains-based search is expensive in Azure DevOps and should be treated as a fallback, not the default discovery path.\n`;
    if (results.wiql) {
      result += `\n**Generated WIQL**\n\n\`\`\`sql\n${results.wiql}\n\`\`\`\n`;
    }
    result += `\nUse \`listWorkItems\` with focused WIQL for repeatable queries, and use \`getWorkItemsBatch\` when you want to fetch a controlled field set for specific IDs.\n`;

    // Prepare structured content
    const structuredData = {
      searchQuery: results.searchQuery,
      totalResults: results.totalResults,
      returnedResults: results.returnedResults,
      recentDaysApplied: results.recentDaysApplied,
      advisory: results.advisory,
      wiql: results.wiql,
      throttleInfo: results.throttleInfo,
      workItems: results.workItems.map((item: any) => ({
        id: item.id,
        teamProject: item.teamProject,
        type: item.workItemType,
        title: item.title,
        state: item.state,
        priority: item.priority,
        assignedTo: item.assignedTo?.displayName,
        createdBy: item.createdBy?.displayName,
        areaPath: item.areaPath,
        iterationPath: item.iterationPath,
        effort: {
          original: item.originalEstimate,
          completed: item.completedWork,
          remaining: item.remainingWork
        },
        changedDate: item.changedDate
      })),
      summary: {
        byType: typeSummary,
        byStatus: stateSummary,
        effort: totalEffort
      }
    };

    return formatMcpResponse(structuredData, result, false, true);
  }

  /**
   * Get recently updated work items
   */
  public async getRecentlyUpdatedWorkItems(params: RecentWorkItemsParams): Promise<McpResponse> {
    try {
      const results = await this.workItemService.getRecentWorkItems(params);
      const items = results.workItems || [];

      if (items.length === 0) {
        return formatMcpResponse(results, `## Recently Updated Work Items\n\nNo recently updated work items found.\n\nTry increasing the time range or check project permissions.`);
      }

      let md = `## Recently Updated Work Items\n\n**${items.length} item${items.length !== 1 ? 's' : ''}**\n\n`;
      if (results.recentDaysApplied) {
        md += `Scoped to the last **${results.recentDaysApplied} day${results.recentDaysApplied === 1 ? '' : 's'}**.\n\n`;
      }
      md += this.buildSummaryTable(items, true);
      md += `\n\nUse \`getWorkItemsBatch\` to fetch only the fields you need for selected IDs.`;

      return formatMcpResponse(results, md, false, true);
    } catch (error) {
      console.error('Error in getRecentlyUpdatedWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get work items assigned to current user
   */
  public async getMyWorkItems(params: MyWorkItemsParams): Promise<McpResponse> {
    try {
      const results = await this.workItemService.getMyWorkItems(params);
      const items = results.workItems || [];

      if (items.length === 0) {
        return formatMcpResponse(results, `## My Work Items\n\nNo work items assigned to you.\n\nUse \`searchWorkItems\` or \`listWorkItems\` to find items across the project.`);
      }

      let md = `## My Work Items\n\n**${items.length} item${items.length !== 1 ? 's' : ''}** assigned to you\n\n`;
      if (results.recentDaysApplied) {
        md += `Scoped to the last **${results.recentDaysApplied} day${results.recentDaysApplied === 1 ? '' : 's'}** by default.\n\n`;
      }
      md += this.buildSummaryTable(items, true);
      md += `\n\nUse \`getWorkItemsBatch\` to fetch details for selected IDs.`;

      return formatMcpResponse(results, md, false, true);
    } catch (error) {
      console.error('Error in getMyWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a work item
   */
  public async createWorkItem(params: CreateWorkItemParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.createWorkItem(params);

      const typeEmoji = getWorkItemTypeEmoji(params.workItemType);
      let md = `## Work Item Created\n\n`;
      md += `**#${workItem.id}** ${typeEmoji} ${params.workItemType}`;
      if (workItem.fields?.['System.State']) md += ` | ${workItem.fields['System.State']}`;
      if (params.assignedTo) md += ` | ${params.assignedTo}`;
      md += `\n`;
      md += `**Title:** ${params.title}\n`;
      if (params.iterationPath) md += `**Sprint:** ${params.iterationPath}\n`;
      if (params.areaPath) md += `**Area:** ${params.areaPath}\n`;

      return formatMcpResponse(workItem, md, false, true);
    } catch (error) {
      console.error('Error in createWorkItem tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Update a work item
   */
  public async updateWorkItem(params: UpdateWorkItemParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.updateWorkItem(params);

      let md = `## Work Item Updated\n\n**#${params.id}** updated\n\n`;
      const fields = params.fields || {};
      const changedKeys = Object.keys(fields);
      if (changedKeys.length > 0) {
        md += `**Changed fields:** ${changedKeys.join(', ')}\n`;
      }

      return formatMcpResponse(workItem, md, false, true);
    } catch (error) {
      console.error('Error in updateWorkItem tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get comments on a work item
   */
  public async getWorkItemComments(params: GetWorkItemCommentsParams): Promise<McpResponse> {
    try {
      const commentList = await this.workItemService.getWorkItemComments(params);
      if (!commentList || !Array.isArray(commentList.comments)) {
        throw new Error(`Azure DevOps API returned unexpected response for work item ${params.id} comments`);
      }
      const comments = commentList.comments;

      if (comments.length === 0) {
        return formatMcpResponse(commentList, `## Work Item #${params.id} - Comments\n\nNo comments found.`);
      }

      let md = `## Work Item #${params.id} - Comments\n\n`;
      md += `**${comments.length} comment${comments.length !== 1 ? 's' : ''}**\n\n`;

      for (const comment of comments) {
        const author = comment.createdBy?.displayName || 'Unknown';
        const date = comment.createdDate ? formatFullDate(comment.createdDate) : 'Unknown date';
        const relDate = comment.createdDate ? formatRelativeDate(comment.createdDate) : '';

        md += `### Comment #${comment.id}\n`;
        md += `**${author}** | ${date} (${relDate})\n\n`;
        // Prefer raw text (markdown) over renderedText (HTML)
        md += `${comment.text || stripHtml(comment.renderedText || '') || '(empty)'}\n\n`;
        md += `---\n\n`;
      }

      const structuredData = {
        workItemId: params.id,
        totalCount: commentList?.totalCount ?? comments.length,
        count: comments.length,
        comments: comments.map((c: any) => ({
          id: c.id,
          text: c.text,
          renderedText: c.renderedText,
          createdBy: c.createdBy ? {
            displayName: c.createdBy.displayName,
            uniqueName: c.createdBy.uniqueName,
          } : null,
          createdDate: c.createdDate,
          modifiedBy: c.modifiedBy ? {
            displayName: c.modifiedBy.displayName,
            uniqueName: c.modifiedBy.uniqueName,
          } : null,
          modifiedDate: c.modifiedDate,
          format: c.format,
        })),
      };

      return formatMcpResponse(structuredData, md, false, true);
    } catch (error) {
      console.error('Error in getWorkItemComments tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Add a comment to a work item
   */
  public async addWorkItemComment(params: AddWorkItemCommentParams): Promise<McpResponse> {
    try {
      const comment = await this.workItemService.addWorkItemComment(params);
      const formatUsed = params.format || 'markdown';

      const md = `## Comment Added\n\n**Work Item:** #${params.id} | **Format:** ${formatUsed}\n\n> ${truncateText(params.text, 100)}`;

      return formatMcpResponse(comment, md, false, true);
    } catch (error) {
      console.error('Error in addWorkItemComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Manage (add or update) a work item comment
   */
  public async manageWorkItemComment(params: ManageWorkItemCommentParams): Promise<McpResponse> {
    try {
      const formatUsed = params.format || 'markdown';

      if (params.action === 'update') {
        if (!params.commentId) {
          throw new Error('commentId is required when action is "update"');
        }
        const comment = await this.workItemService.updateWorkItemComment({
          id: params.id,
          commentId: params.commentId,
          text: params.text,
          format: params.format,
        });

        const md = `## Comment Updated\n\n**Work Item:** #${params.id} | **Comment:** #${params.commentId} | **Format:** ${formatUsed}\n\n> ${truncateText(params.text, 100)}`;
        return formatMcpResponse(comment, md, false, true);
      } else {
        const comment = await this.workItemService.addWorkItemComment({
          id: params.id,
          text: params.text,
          format: params.format,
        });

        const md = `## Comment Added\n\n**Work Item:** #${params.id} | **Format:** ${formatUsed}\n\n> ${truncateText(params.text, 100)}`;
        return formatMcpResponse(comment, md, false, true);
      }
    } catch (error) {
      console.error('Error in manageWorkItemComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Update work item state
   */
  public async updateWorkItemState(params: UpdateWorkItemStateParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.updateWorkItemState(params);
      const stateEmoji = getStateEmoji(params.state);

      let md = `## State Updated\n\n**#${params.id}** -> ${stateEmoji} ${params.state}`;
      if (params.comment) md += `\n\n> ${truncateText(params.comment, 100)}`;

      return formatMcpResponse(workItem, md, false, true);
    } catch (error) {
      console.error('Error in updateWorkItemState tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Assign work item to a user
   */
  public async assignWorkItem(params: AssignWorkItemParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.assignWorkItem(params);

      const md = `## Work Item Assigned\n\n**#${params.id}** -> ${params.assignedTo}`;

      return formatMcpResponse(workItem, md, false, true);
    } catch (error) {
      console.error('Error in assignWorkItem tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a link between a work item and another work item or artifact
   */
  public async createLink(params: CreateLinkParams): Promise<McpResponse> {
    try {
      const parsed = parseTargetId(params.targetId);

      // Validate repository is provided for types that need it
      if (['pr', 'branch', 'commit'].includes(parsed.type) && !params.repository) {
        throw new Error(
          `The 'repository' parameter is required for ${parsed.displayName} links. ` +
          `Please provide the repository name or ID.`
        );
      }

      let serviceParams: CreateLinkServiceParams;

      if (parsed.type === 'workitem') {
        // Work item link (existing behavior)
        const targetWiId = parseInt(parsed.id, 10);
        if (isNaN(targetWiId)) {
          throw new Error(`Invalid work item ID: '${parsed.id}'. Must be a number.`);
        }
        serviceParams = {
          sourceId: params.sourceId,
          linkType: params.linkType,
          comment: params.comment,
          targetWorkItemId: targetWiId,
        };
      } else {
        // Artifact link - build vstfs URI
        const projectId = await this.resolveProjectId();
        let artifactUri: string;
        let repoId: string | undefined;

        if (params.repository) {
          repoId = await this.gitService.resolveRepositoryId(params.repository);
        }

        // Azure DevOps artifact URIs use %2F (URL-encoded /) between composite ID segments
        // e.g. vstfs:///Git/PullRequestId/{projectId}%2F{repoId}%2F{prId}
        switch (parsed.type) {
          case 'pr':
            artifactUri = `vstfs:///Git/PullRequestId/${projectId}%2F${repoId}%2F${parsed.id}`;
            break;
          case 'build':
            artifactUri = `vstfs:///Build/Build/${parsed.id}`;
            break;
          case 'branch': {
            const branchRef = parsed.id.startsWith('GB') ? parsed.id : `GB${parsed.id}`;
            artifactUri = `vstfs:///Git/Ref/${projectId}%2F${repoId}%2F${branchRef}`;
            break;
          }
          case 'commit':
            artifactUri = `vstfs:///Git/Commit/${projectId}%2F${repoId}%2F${parsed.id}`;
            break;
          default:
            throw new Error(`Unsupported artifact type: ${parsed.type}`);
        }

        serviceParams = {
          sourceId: params.sourceId,
          linkType: params.linkType,
          comment: params.comment,
          artifactUri,
          artifactName: parsed.displayName,
        };
      }

      const workItem = await this.workItemService.createLink(serviceParams);

      // Build readable response
      const targetLabel = parsed.type === 'workitem'
        ? `**WI#${parsed.id}**`
        : `**${parsed.type.toUpperCase()}#${parsed.id}**`;

      const md = `## Link Created\n\n**WI#${params.sourceId}** <-> ${targetLabel} (${parsed.displayName})`;

      const structuredData = {
        sourceId: params.sourceId,
        targetId: params.targetId,
        targetType: parsed.type,
        targetDisplayName: parsed.displayName,
        linkType: params.linkType,
      };

      return formatMcpResponse(structuredData, md, false, true);
    } catch (error) {
      console.error('Error in createLink tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Bulk create or update work items
   */
  public async bulkCreateWorkItems(params: BulkWorkItemParams): Promise<McpResponse> {
    try {
      const results = await this.workItemService.bulkUpdateWorkItems(params);

      const created = results.created || [];
      const updated = results.updated || [];
      const count = results.count || (created.length + updated.length);

      let md = `## Bulk Operation Complete\n\n**${count} work items processed**`;
      if (created.length > 0) md += ` | ${created.length} created`;
      if (updated.length > 0) md += ` | ${updated.length} updated`;
      md += '\n';

      if (created.length > 0) {
        const ids = created.map((wi: any) => `#${wi.id}`).join(', ');
        md += `\n**Created:** ${ids}`;
      }
      if (updated.length > 0) {
        const ids = updated.map((wi: any) => `#${wi.id}`).join(', ');
        md += `\n**Updated:** ${ids}`;
      }

      return formatMcpResponse(results, md, false, true);
    } catch (error) {
      console.error('Error in bulkCreateWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  // New Work Item Enhancement Tools

  /**
   * Get multiple work items by IDs in a single call
   */
  public async getWorkItemsBatch(params: GetWorkItemsBatchParams): Promise<McpResponse> {
    try {
      const workItems = await this.workItemService.getWorkItemsBatch(params);

      if (workItems.length === 0) {
        return formatMcpResponse(workItems, `## Work Items Batch\n\nNo work items found for the given IDs.`);
      }

      let md = `## Work Items Batch\n\n**${workItems.length} work item${workItems.length !== 1 ? 's' : ''}** retrieved\n\n`;

      const rows = workItems.map((wi: any) => {
        const fields = wi.fields || {};
        return [
          `#${wi.id}`,
          getWorkItemTypeEmoji(fields['System.WorkItemType'] || '') + ' ' + (fields['System.WorkItemType'] || '-'),
          truncateText(fields['System.Title'] || '-', 50),
          getStateEmoji(fields['System.State'] || '') + ' ' + (fields['System.State'] || '-'),
          fields['System.AssignedTo']?.displayName || '-',
        ];
      });

      md += markdownTable(['ID', 'Type', 'Title', 'State', 'Assigned To'], rows);

      return formatMcpResponse(workItems, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Get revision history for a work item
   */
  public async getWorkItemRevisions(params: GetWorkItemRevisionsParams): Promise<McpResponse> {
    try {
      const revisions = await this.workItemService.getWorkItemRevisions(params);

      if (revisions.length === 0) {
        return formatMcpResponse(revisions, `## Work Item #${params.id} - Revisions\n\nNo revisions found.`);
      }

      let md = `## Work Item #${params.id} - Revision History\n\n`;
      md += `**${revisions.length} revision${revisions.length !== 1 ? 's' : ''}**\n\n`;

      const rows = revisions.map((rev: any, index: number) => {
        const fields = rev.fields || {};
        return [
          `${rev.rev || index + 1}`,
          truncateText(fields['System.Title'] || '-', 40),
          fields['System.State'] || '-',
          fields['System.ChangedBy']?.displayName || fields['System.ChangedBy'] || '-',
          fields['System.ChangedDate'] ? formatRelativeDate(fields['System.ChangedDate']) : '-',
        ];
      });

      md += markdownTable(['Rev', 'Title', 'State', 'Changed By', 'Changed'], rows);

      return formatMcpResponse(revisions, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Execute a saved WIQL query by query ID
   */
  public async getQueryResults(params: GetQueryResultsParams): Promise<McpResponse> {
    try {
      const result = await this.workItemService.getQueryResults(params);
      const workItems = result.workItems || [];

      if (workItems.length === 0) {
        return formatMcpResponse(result, `## Query Results\n\nNo work items returned by query \`${params.queryId}\`.`);
      }

      let md = `## Query Results\n\n`;
      md += `**${workItems.length} work item${workItems.length !== 1 ? 's' : ''}** returned\n\n`;

      if (result.queryType) {
        md += `**Query Type:** ${result.queryType}\n\n`;
      }
      if (result.columns?.length) {
        md += `**Saved Query Columns:** ${result.columns.join(', ')}\n\n`;
      }

      md += this.buildSummaryTable(workItems);
      md += `\n\nUse \`getWorkItemsBatch\` with the IDs above and an explicit field list to hydrate only what you need.`;

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a child work item linked to a parent
   */
  public async addChildWorkItem(params: AddChildWorkItemParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.addChildWorkItem(params);

      let md = `## Child Work Item Created\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **ID** | #${workItem.id} |\n`;
      md += `| **Parent ID** | #${params.parentId} |\n`;
      md += `| **Type** | ${params.workItemType} |\n`;
      md += `| **Title** | ${params.title} |\n`;
      if (params.assignedTo) md += `| **Assigned To** | ${params.assignedTo} |\n`;

      return formatMcpResponse(workItem, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Remove a relation (link) from a work item by relation index
   */
  public async unlinkWorkItem(params: UnlinkWorkItemParams): Promise<McpResponse> {
    try {
      const result = await this.workItemService.unlinkWorkItem(params);

      let md = `## Work Item #${params.id} - Link Removed\n\n`;
      md += `Relation at index **${params.relationIndex}** has been removed.\n`;
      md += `\nUse \`getWorkItemById\` to see remaining relations.`;

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }
}

export const WorkItemToolMethods = getClassMethods(WorkItemTools.prototype);
