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
   * Format work item response with enhanced readability and effort tracking
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

    // Helper function to format dates
    const formatDate = (dateString: string): string => {
      if (!dateString) return 'Not set';
      
      try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        let timeAgo = '';
        if (diffDays > 0) {
          timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
          timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else {
          timeAgo = 'Recently';
        }

        const formatted = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric'
        });

        return `${formatted} (${timeAgo})`;
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

    // Helper function to calculate effort progress
    const calculateProgress = (original: number, completed: number, remaining: number): { percentage: number, status: string } => {
      if (!original || original === 0) {
        if (completed > 0) {
          return { percentage: 100, status: 'Over budget' };
        }
        return { percentage: 0, status: 'Not estimated' };
      }

      const totalSpent = completed + remaining;
      const percentage = Math.round((completed / original) * 100);
      
      let status = 'On track';
      if (totalSpent > original * 1.2) {
        status = 'Over budget';
      } else if (percentage >= 100) {
        status = 'Complete';
      } else if (totalSpent > original) {
        status = 'Slightly over';
      }

      return { percentage: Math.min(percentage, 100), status };
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

    // Helper function to format sprint information
    const formatSprintInfo = (iterationPath: string): string => {
      if (!iterationPath) return 'No sprint assigned';
      
      const parts = iterationPath.split('\\');
      const sprint = parts[parts.length - 1];
      
      // Check if it's a sprint pattern
      if (sprint.toLowerCase().includes('sprint')) {
        return `🏃‍♂️ ${sprint}`;
      }
      
      return `📅 ${sprint}`;
    };

    // Generate the main work item display
    const emoji = getWorkItemTypeEmoji(workItem.workItemType);
    const stateEmoji = getStateEmoji(workItem.state);
    const priorityEmoji = getPriorityEmoji(workItem.priority);

    let result = `## ${emoji} ${workItem.workItemType} #${workItem.id}\n\n`;
    result += `# ${workItem.title}\n\n`;

    // Status and metadata table
    result += `| Property | Value |\n`;
    result += `|----------|-------|\n`;
    result += `| **Status** | ${stateEmoji} **${workItem.state}** |\n`;
    result += `| **Priority** | ${priorityEmoji} ${workItem.priority ? `Priority ${workItem.priority}` : 'Not set'} |\n`;
    result += `| **Area** | ${workItem.areaPath || 'Not set'} |\n`;
    result += `| **Sprint** | ${formatSprintInfo(workItem.iterationPath)} |\n`;

    // People information
    if (workItem.assignedTo) {
      result += `| **Assigned To** | 👤 ${workItem.assignedTo.displayName} |\n`;
    } else {
      result += `| **Assigned To** | ⭕ *Unassigned* |\n`;
    }
    
    if (workItem.createdBy) {
      result += `| **Created By** | 👨‍💻 ${workItem.createdBy.displayName} |\n`;
    }

    // Dates
    result += `| **Created** | ${formatDate(workItem.createdDate)} |\n`;
    result += `| **Last Updated** | ${formatDate(workItem.changedDate)} |\n`;

    result += `\n`;

    // Effort Tracking Section
    const hasEffortData = workItem.originalEstimate || workItem.completedWork || workItem.remainingWork;
    const hasChildEffort = workItem.childEffortRollup;
    
    if (hasEffortData || hasChildEffort) {
      result += `## ⏱️ Effort Tracking\n\n`;
      
      if (hasEffortData) {
        const original = workItem.originalEstimate || 0;
        const completed = workItem.completedWork || 0;
        const remaining = workItem.remainingWork || 0;
        const progress = calculateProgress(original, completed, remaining);

        result += `### 📊 Direct Effort\n\n`;
        result += `| Metric | Value | Progress |\n`;
        result += `|--------|-------|---------|\n`;
        result += `| **Original Estimate** | ${formatEffort(original)} | 📊 Baseline |\n`;
        result += `| **Completed Work** | ${formatEffort(completed)} | ✅ ${progress.percentage}% |\n`;
        result += `| **Remaining Work** | ${formatEffort(remaining)} | ⏳ To do |\n`;
        result += `| **Total Effort** | ${formatEffort(completed + remaining)} | 📈 ${progress.status} |\n`;

        // Progress bar visualization
        const progressBars = Math.floor(progress.percentage / 10);
        const progressBar = '█'.repeat(progressBars) + '░'.repeat(10 - progressBars);
        result += `\n**Progress:** \`${progressBar}\` ${progress.percentage}%\n\n`;
      }

      // Child effort roll-up section
      if (hasChildEffort) {
        const rollup = workItem.childEffortRollup;
        const childProgress = calculateProgress(rollup.totalOriginalEstimate, rollup.totalCompletedWork, rollup.totalRemainingWork);
        
        result += `### 📈 Child Work Items Roll-up (${rollup.childCount} items)\n\n`;
        result += `| Metric | Value | Status |\n`;
        result += `|--------|-------|---------|\n`;
        result += `| **Total Original Estimate** | ${formatEffort(rollup.totalOriginalEstimate)} | 🎯 Planned |\n`;
        result += `| **Total Completed Work** | ${formatEffort(rollup.totalCompletedWork)} | ✅ Done |\n`;
        result += `| **Total Remaining Work** | ${formatEffort(rollup.totalRemainingWork)} | ⏳ Pending |\n`;
        result += `| **Total Effort** | ${formatEffort(rollup.totalCompletedWork + rollup.totalRemainingWork)} | 📊 ${childProgress.status} |\n`;

        // Child progress bar
        const childProgressBars = Math.floor(childProgress.percentage / 10);
        const childProgressBar = '█'.repeat(childProgressBars) + '░'.repeat(10 - childProgressBars);
        result += `\n**Child Progress:** \`${childProgressBar}\` ${childProgress.percentage}%\n\n`;

        // Child work items breakdown
        if (rollup.childDetails && rollup.childDetails.length > 0) {
          result += `#### 📋 Child Work Items Breakdown\n\n`;
          rollup.childDetails.forEach((child: any) => {
            const childEmoji = getWorkItemTypeEmoji(child.workItemType);
            const childStateEmoji = getStateEmoji(child.state);
            const childTotal = (child.completedWork || 0) + (child.remainingWork || 0);
            
            result += `- ${childEmoji} **#${child.id}** ${child.title}\n`;
            result += `  - ${childStateEmoji} *${child.state}* | `;
            result += `📊 ${formatEffort(child.originalEstimate)} estimated | `;
            result += `✅ ${formatEffort(child.completedWork)} done | `;
            result += `⏳ ${formatEffort(child.remainingWork)} remaining\n\n`;
          });
        }

        // Combined effort summary if both direct and child effort exist
        if (hasEffortData) {
          const combinedOriginal = (workItem.originalEstimate || 0) + rollup.totalOriginalEstimate;
          const combinedCompleted = (workItem.completedWork || 0) + rollup.totalCompletedWork;
          const combinedRemaining = (workItem.remainingWork || 0) + rollup.totalRemainingWork;
          const combinedProgress = calculateProgress(combinedOriginal, combinedCompleted, combinedRemaining);

          result += `### 🎯 Combined Effort Summary\n\n`;
          result += `| Metric | Direct | Children | **Total** |\n`;
          result += `|--------|--------|----------|-----------|\n`;
          result += `| **Original** | ${formatEffort(workItem.originalEstimate || 0)} | ${formatEffort(rollup.totalOriginalEstimate)} | **${formatEffort(combinedOriginal)}** |\n`;
          result += `| **Completed** | ${formatEffort(workItem.completedWork || 0)} | ${formatEffort(rollup.totalCompletedWork)} | **${formatEffort(combinedCompleted)}** |\n`;
          result += `| **Remaining** | ${formatEffort(workItem.remainingWork || 0)} | ${formatEffort(rollup.totalRemainingWork)} | **${formatEffort(combinedRemaining)}** |\n`;
          
          const combinedProgressBars = Math.floor(combinedProgress.percentage / 10);
          const combinedProgressBar = '█'.repeat(combinedProgressBars) + '░'.repeat(10 - combinedProgressBars);
          result += `\n**Overall Progress:** \`${combinedProgressBar}\` ${combinedProgress.percentage}% (${combinedProgress.status})\n\n`;
        }
      }
    }

    // Relationships section
    if (workItem.relations && workItem.relations.length > 0) {
      result += `## 🔗 Related Work Items\n\n`;
      
      const relationTypes: { [key: string]: string } = {
        'System.LinkTypes.Hierarchy-Forward': '⬇️ Child',
        'System.LinkTypes.Hierarchy-Reverse': '⬆️ Parent',
        'System.LinkTypes.Dependency-Forward': '➡️ Successor',
        'System.LinkTypes.Dependency-Reverse': '⬅️ Predecessor',
        'System.LinkTypes.Related': '🔄 Related',
        'Microsoft.VSTS.Common.TestedBy-Forward': '🧪 Tested by',
        'Microsoft.VSTS.Common.TestedBy-Reverse': '🧪 Tests'
      };

      workItem.relations.forEach((relation: any) => {
        const relationEmoji = relationTypes[relation.relationshipType] || '🔗';
        result += `- ${relationEmoji} **Work Item #${relation.relatedWorkItemId}**`;
        if (relation.comment) {
          result += ` - *${relation.comment}*`;
        }
        result += `\n`;
      });
      result += `\n`;
    }

    // Description section
    result += `## 📝 Description\n\n`;
    result += `${formatDescription(workItem.description)}\n\n`;

    // Technical details section
    result += `## 🔧 Technical Details\n\n`;
    result += `- **Work Item ID:** ${workItem.id}\n`;
    result += `- **Revision:** ${workItem.rev}\n`;
    result += `- **Work Item Type:** ${workItem.workItemType}\n`;
    if (workItem.originalEstimate || workItem.completedWork || workItem.remainingWork) {
      result += `- **Effort Summary:** ${formatEffort(workItem.completedWork || 0)} completed of ${formatEffort(workItem.originalEstimate || 0)} estimated\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: result
        }
      ]
    };
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
   * Format search results response with comprehensive tabular view
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

    // Helper functions from the detailed work item formatter
    const formatDate = (dateString: string): string => {
      if (!dateString) return 'Not set';
      
      try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        let timeAgo = '';
        if (diffDays > 0) {
          timeAgo = `${diffDays}d ago`;
        } else if (diffHours > 0) {
          timeAgo = `${diffHours}h ago`;
        } else {
          timeAgo = 'Recent';
        }

        return timeAgo;
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

    const getPriorityEmoji = (priority: number): string => {
      if (priority === 1) return '🔴';
      if (priority === 2) return '🟡';
      if (priority === 3) return '🟢';
      if (priority === 4) return '🔵';
      return '⚪';
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

    // Generate search results header
    let result = `## 🔍 Search Results: "${results.searchQuery}"\n\n`;
    result += `**Found:** ${results.totalResults} items | **Showing:** ${results.returnedResults} items\n\n`;

    // Main results table
    result += `| Type | ID | Title | Status | Assigned | Priority | Effort | Updated |\n`;
    result += `|------|----|----|--------|----------|----------|--------|----------|\n`;

    results.workItems.forEach((workItem: any) => {
      const typeEmoji = getWorkItemTypeEmoji(workItem.workItemType);
      const stateEmoji = getStateEmoji(workItem.state);
      const priorityEmoji = getPriorityEmoji(workItem.priority);
      const assignedTo = workItem.assignedTo ? workItem.assignedTo.displayName.split(' ')[0] : 'Unassigned';
      const effortInfo = workItem.originalEstimate || workItem.completedWork || workItem.remainingWork 
        ? `${formatEffort(workItem.completedWork)}/${formatEffort(workItem.originalEstimate)}`
        : '-';
      
      result += `| ${typeEmoji} ${workItem.workItemType} | **#${workItem.id}** | ${truncateTitle(workItem.title)} | ${stateEmoji} ${workItem.state} | ${assignedTo} | ${priorityEmoji} | ${effortInfo} | ${formatDate(workItem.changedDate)} |\n`;
    });

    result += `\n`;

    // Summary by work item type
    const typeSummary = results.workItems.reduce((acc: any, item: any) => {
      acc[item.workItemType] = (acc[item.workItemType] || 0) + 1;
      return acc;
    }, {});

    result += `### 📊 Summary by Type\n\n`;
    Object.entries(typeSummary).forEach(([type, count]) => {
      const emoji = getWorkItemTypeEmoji(type);
      result += `- ${emoji} **${type}**: ${count} items\n`;
    });

    // Summary by state
    const stateSummary = results.workItems.reduce((acc: any, item: any) => {
      acc[item.state] = (acc[item.state] || 0) + 1;
      return acc;
    }, {});

    result += `\n### 📈 Summary by Status\n\n`;
    Object.entries(stateSummary).forEach(([state, count]) => {
      const emoji = getStateEmoji(state);
      result += `- ${emoji} **${state}**: ${count} items\n`;
    });

    // Recent activity (most recently updated items)
    const recentItems = results.workItems
      .sort((a: any, b: any) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime())
      .slice(0, 5);

    result += `\n### ⏰ Recently Updated\n\n`;
    recentItems.forEach((item: any) => {
      const typeEmoji = getWorkItemTypeEmoji(item.workItemType);
      const stateEmoji = getStateEmoji(item.state);
      result += `- ${typeEmoji} **#${item.id}** ${truncateTitle(item.title, 40)} ${stateEmoji} *${formatDate(item.changedDate)}*\n`;
    });

    // High priority items if any
    const highPriorityItems = results.workItems.filter((item: any) => item.priority && item.priority <= 2);
    if (highPriorityItems.length > 0) {
      result += `\n### 🚨 High Priority Items\n\n`;
      highPriorityItems.forEach((item: any) => {
        const typeEmoji = getWorkItemTypeEmoji(item.workItemType);
        const priorityEmoji = getPriorityEmoji(item.priority);
        const stateEmoji = getStateEmoji(item.state);
        result += `- ${priorityEmoji} ${typeEmoji} **#${item.id}** ${truncateTitle(item.title, 40)} ${stateEmoji}\n`;
      });
    }

    // Effort summary if any items have effort tracking
    const itemsWithEffort = results.workItems.filter((item: any) => 
      item.originalEstimate || item.completedWork || item.remainingWork
    );

    if (itemsWithEffort.length > 0) {
      const totalOriginal = itemsWithEffort.reduce((sum: number, item: any) => sum + (item.originalEstimate || 0), 0);
      const totalCompleted = itemsWithEffort.reduce((sum: number, item: any) => sum + (item.completedWork || 0), 0);
      const totalRemaining = itemsWithEffort.reduce((sum: number, item: any) => sum + (item.remainingWork || 0), 0);

      result += `\n### ⏱️ Effort Summary (${itemsWithEffort.length} items with tracking)\n\n`;
      result += `| Metric | Value |\n`;
      result += `|--------|-------|\n`;
      result += `| **Total Estimated** | ${formatEffort(totalOriginal)} |\n`;
      result += `| **Total Completed** | ${formatEffort(totalCompleted)} |\n`;
      result += `| **Total Remaining** | ${formatEffort(totalRemaining)} |\n`;
    }

    // Instructions for getting more details
    result += `\n---\n`;
    result += `💡 **Tip:** Use \`getWorkItemById\` with any ID above to see full details, effort tracking, and relationships.\n`;

    return {
      content: [
        {
          type: "text",
          text: result
        }
      ]
    };
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
      return formatMcpResponse(workItem, `Created work item: ${workItem.id}`);
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
      return formatMcpResponse(workItem, `Updated work item: ${params.id}`);
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
      return formatMcpResponse(comment, `Comment added to work item: ${params.id}`);
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
      return formatMcpResponse(workItem, `Created ${params.linkType} link from work item ${params.sourceId} to ${params.targetId}`);
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