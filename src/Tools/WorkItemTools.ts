import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { WorkItemService } from '../Services/WorkItemService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  WorkItemByIdParams,
  SearchWorkItemsParams,
  RecentWorkItemsParams,
  MyWorkItemsParams,
  CreateWorkItemParams,
  UpdateWorkItemParams,
  AddWorkItemCommentParams,
  UpdateWorkItemStateParams,
  AssignWorkItemParams,
  CreateLinkParams,
  BulkWorkItemParams
} from '../Interfaces/WorkItems';
import getClassMethods from "../utils/getClassMethods";

export class WorkItemTools {
  private workItemService: WorkItemService;

  constructor(config: AzureDevOpsConfig) {
    this.workItemService = new WorkItemService(config);
  }

  /**
   * List work items based on a WIQL query
   */
  public async listWorkItems(params: { query: string }): Promise<McpResponse> {
    try {
      const response = await this.workItemService.listWorkItems(params.query);
      return formatMcpResponse(response, `Found ${response.workItems?.length || 0} work items.`);
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
      return this.formatWorkItemResponse(workItem);
    } catch (error) {
      console.error('Error in getWorkItemById tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Format work item response with optimized token usage
   */
  private formatWorkItemResponse(workItem: any): McpResponse {
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

    // Helper function to format dates (simplified)
    const formatDate = (dateString: string): string => {
      if (!dateString) return 'Not set';
      try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${formatted} (${diffDays}d ago)`;
      } catch {
        return dateString;
      }
    };

    // Helper function to get work item type emoji
    const getWorkItemTypeEmoji = (type: string): string => {
      const typeMap: { [key: string]: string } = {
        'Epic': '🎯',
        'Feature': '🚀',
        'User Story': '📖',
        'Task': '✅',
        'Bug': '🐛',
        'Test Case': '🧪',
        'Issue': '⚠️'
      };
      return typeMap[type] || '📋';
    };

    // Helper function to get state emoji
    const getStateEmoji = (state: string): string => {
      const stateMap: { [key: string]: string } = {
        'New': '🆕',
        'Active': '🔄',
        'In Progress': '⚡',
        'Resolved': '✅',
        'Closed': '✅',
        'Done': '✅',
        'Removed': '❌',
        'To Do': '📋',
        'Doing': '⚡',
        'Testing': '🧪'
      };
      return stateMap[state] || '📌';
    };

    // Helper function to get priority emoji
    const getPriorityEmoji = (priority: number): string => {
      if (priority === 1) return '🔴'; // Critical
      if (priority === 2) return '🟡'; // High
      if (priority === 3) return '🟢'; // Medium
      if (priority === 4) return '🔵'; // Low
      return '⚪'; // Unset
    };

    // Helper function to format effort tracking
    const formatEffort = (hours: number | null | undefined): string => {
      if (!hours || hours === 0) return '0h';
      if (hours < 1) return `${Math.round(hours * 60)}m`;
      return `${hours}h`;
    };

    // Helper function to parse and format description
    const formatDescription = (description: string): string => {
      if (!description) return 'No description provided';

      // Remove HTML tags for basic cleanup
      let cleanDesc = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      // Look for acceptance criteria patterns
      const acMatch = cleanDesc.match(/acceptance criteria:?\s*(.*?)(?:\n\n|\*\*|$)/i);
      if (acMatch) {
        const acText = acMatch[1];
        // Look for AC patterns like AC1:, AC-1:, etc.
        const acItems = acText.split(/AC[\s-]*\d+:?/i).filter(item => item.trim());
        if (acItems.length > 1) {
          return cleanDesc.substring(0, 200) + (cleanDesc.length > 200 ? '...' : '');
        }
      }

      // Truncate if too long
      return cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '...' : cleanDesc;
    };

    // Helper function to format sprint information (inline)
    const formatSprintInfo = (iterationPath: string): string => {
      if (!iterationPath) return '📅 No sprint';
      const parts = iterationPath.split('\\');
      const sprint = parts[parts.length - 1];
      return sprint.toLowerCase().includes('sprint') ? `🏃‍♂️ ${sprint}` : `📅 ${sprint}`;
    };

    // Generate the main work item display with summary at top
    const emoji = getWorkItemTypeEmoji(workItem.workItemType);
    const stateEmoji = getStateEmoji(workItem.state);
    const priorityEmoji = getPriorityEmoji(workItem.priority);

    let result = `## Work Item #${workItem.id}\n\n`;

    // One-line summary with key info
    result += `**${emoji} ${workItem.workItemType}** | ${stateEmoji} ${workItem.state} | ${priorityEmoji} P${workItem.priority || '?'} | `;
    result += `👤 ${workItem.assignedTo?.displayName || 'Unassigned'} | `;
    result += `${formatSprintInfo(workItem.iterationPath)}\n\n`;

    result += `# ${workItem.title}\n\n`;

    // Metadata: one-line format instead of table
    const createdBy = workItem.createdBy?.displayName || 'Unknown';
    const createdDate = formatDate(workItem.createdDate);
    const updatedDate = formatDate(workItem.changedDate);
    result += `**Area:** ${workItem.areaPath || 'Not set'} | **Created:** ${createdDate} by ${createdBy} | **Updated:** ${updatedDate}\n\n`;
    result += `---\n\n`;

    // Effort Tracking Section (condensed from 3 tables to inline stats)
    const hasEffortData = workItem.originalEstimate || workItem.completedWork || workItem.remainingWork;
    const hasChildEffort = workItem.childEffortRollup;

    if (hasEffortData || hasChildEffort) {
      result += `### ⏱️ Effort\n\n`;

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
      result += `### 🔗 Related Items\n\n`;

      // Group by relationship type
      const grouped: { [key: string]: number[] } = {};
      workItem.relations.forEach((relation: any) => {
        const relType = relation.relationshipType || 'Related';
        if (!grouped[relType]) grouped[relType] = [];
        grouped[relType].push(relation.relatedWorkItemId);
      });

      const relationTypes: { [key: string]: string } = {
        'System.LinkTypes.Hierarchy-Forward': '⬇️ Child',
        'System.LinkTypes.Hierarchy-Reverse': '⬆️ Parent',
        'System.LinkTypes.Dependency-Forward': '➡️ Successor',
        'System.LinkTypes.Dependency-Reverse': '⬅️ Predecessor',
        'System.LinkTypes.Related': '🔄 Related'
      };

      Object.entries(grouped).forEach(([relType, ids]) => {
        const label = relationTypes[relType]?.split(' ')[1] || 'Related';
        const emojiPart = relationTypes[relType]?.split(' ')[0] || '🔗';
        const idList = ids.map(id => `#${id}`).join(', ');
        result += `- ${emojiPart} ${idList} (${label})\n`;
      });

      result += `\n---\n\n`;
    }

    // Description section
    result += `## 📝 Description\n\n`;
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
      relations: workItem.relations?.map((r: any) => ({
        type: r.relationshipType,
        relatedId: r.relatedWorkItemId
      })) || [],
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
      return {
        content: [
          {
            type: "text",
            text: `## 🔍 Search Results\n\nNo work items found matching "${results?.searchQuery || 'your search'}".\n\nTry:\n- Using different keywords\n- Searching for partial words\n- Looking for work item types (Bug, Task, Feature, etc.)`
          }
        ]
      };
    }

    // Helper functions
    const formatDate = (dateString: string): string => {
      if (!dateString) return 'Unknown';
      try {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        return `${diffDays}d ago`;
      } catch {
        return 'Unknown';
      }
    };

    const getWorkItemTypeEmoji = (type: string): string => {
      const typeMap: { [key: string]: string } = {
        'Epic': '🎯',
        'Feature': '🚀',
        'User Story': '📖',
        'Task': '✅',
        'Bug': '🐛',
        'Test Case': '🧪',
        'Issue': '⚠️'
      };
      return typeMap[type] || '📋';
    };

    const getStateEmoji = (state: string): string => {
      const stateMap: { [key: string]: string } = {
        'New': '🆕',
        'Active': '🔄',
        'In Progress': '⚡',
        'Resolved': '✅',
        'Closed': '✅',
        'Done': '✅',
        'Removed': '❌',
        'To Do': '📋',
        'Doing': '⚡',
        'Testing': '🧪'
      };
      return stateMap[state] || '📌';
    };

    const formatEffort = (hours: number | null | undefined): string => {
      if (!hours || hours === 0) return '-';
      if (hours < 1) return `${Math.round(hours * 60)}m`;
      return `${hours}h`;
    };

    const truncateTitle = (title: string, maxLength: number = 50): string => {
      if (!title) return 'No title';
      return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
    };

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

    // Simplified 5-column table (was 8 columns)
    result += `| ID | Title | Type | Status | Assigned |\n`;
    result += `|----|-------|------|--------|----------|\n`;

    results.workItems.forEach((workItem: any) => {
      const typeEmoji = getWorkItemTypeEmoji(workItem.workItemType);
      const stateEmoji = getStateEmoji(workItem.state);
      const assignedTo = workItem.assignedTo?.displayName.split(' ')[0] || 'Unassigned';

      result += `| **#${workItem.id}** | ${truncateTitle(workItem.title)} | ${typeEmoji} ${workItem.workItemType} | ${stateEmoji} ${workItem.state} | ${assignedTo} |\n`;
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
    const recentList = recentItems.map((i: any) => `#${i.id} (${formatDate(i.changedDate)})`).join(', ');
    result += `**Recently Updated:** ${recentList}\n\n`;

    result += `---\n`;
    result += `💡 **Tip:** Use \`getWorkItemById\` with any ID above to see full details, effort tracking, and relationships.\n`;

    // Prepare structured content
    const structuredData = {
      searchQuery: results.searchQuery,
      totalResults: results.totalResults,
      returnedResults: results.returnedResults,
      workItems: results.workItems.map((item: any) => ({
        id: item.id,
        type: item.workItemType,
        title: item.title,
        state: item.state,
        priority: item.priority,
        assignedTo: item.assignedTo?.displayName,
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
      return formatMcpResponse(results, `Found ${results.workItems?.length || 0} recently updated work items`);
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
      return formatMcpResponse(results, `Found ${results.workItems?.length || 0} work items assigned to you`);
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
      return formatMcpResponse(workItem, `Created work item: ${workItem.id}`, false, true);
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
      return formatMcpResponse(workItem, `Updated work item: ${params.id}`, false, true);
    } catch (error) {
      console.error('Error in updateWorkItem tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Add a comment to a work item
   */
  public async addWorkItemComment(params: AddWorkItemCommentParams): Promise<McpResponse> {
    try {
      const comment = await this.workItemService.addWorkItemComment(params);
      return formatMcpResponse(comment, `Comment added to work item: ${params.id}`, false, true);
    } catch (error) {
      console.error('Error in addWorkItemComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Update work item state
   */
  public async updateWorkItemState(params: UpdateWorkItemStateParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.updateWorkItemState(params);
      return formatMcpResponse(workItem, `Updated state of work item ${params.id} to "${params.state}"`);
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
      return formatMcpResponse(workItem, `Assigned work item ${params.id} to ${params.assignedTo}`);
    } catch (error) {
      console.error('Error in assignWorkItem tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a link between work items
   */
  public async createLink(params: CreateLinkParams): Promise<McpResponse> {
    try {
      const workItem = await this.workItemService.createLink(params);
      return formatMcpResponse(workItem, `Created ${params.linkType} link from work item ${params.sourceId} to ${params.targetId}`, false, true);
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
      return formatMcpResponse(results, `Processed ${results.count} work items`);
    } catch (error) {
      console.error('Error in bulkCreateWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const WorkItemToolMethods = getClassMethods(WorkItemTools.prototype);