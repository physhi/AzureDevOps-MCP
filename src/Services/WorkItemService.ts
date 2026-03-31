import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { WorkItemExpand, CommentExpandOptions, CommentSortOrder } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  JsonPatchOperation,
  Operation
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService } from './AzureDevOpsService';
import {
  WorkItemByIdParams,
  RecentWorkItemsParams,
  MyWorkItemsParams,
  CreateWorkItemParams,
  UpdateWorkItemParams,
  AddWorkItemCommentParams,
  GetWorkItemCommentsParams,
  UpdateWorkItemStateParams,
  AssignWorkItemParams,
  CreateLinkServiceParams,
  BulkWorkItemParams,
  GetWorkItemsBatchParams,
  GetWorkItemRevisionsParams,
  GetQueryResultsParams,
  AddChildWorkItemParams,
  UnlinkWorkItemParams,
  ListWorkItemsParams,
} from '../Interfaces/WorkItems';
import { ThrottleNotice } from './AzureDevOpsService';
import { markdownToHtml, unescapeHtmlEntities, normalizeLiteralEscapes } from '../utils/formatHelpers';
import {
  analyzeWiql,
  buildListWorkItemsUsageProfile,
  buildMyWorkItemsUsageProfile,
  buildRecentWorkItemsUsageProfile,
  buildSavedQueryUsageProfile,
} from '../utils/apiUsageGuidance';

/** Rich-text fields that expect HTML — markdown is auto-converted for these */
const RICH_TEXT_FIELDS = new Set([
  'System.Description',
  'System.History',
  'System.ReproSteps',
  'Microsoft.VSTS.TCM.Steps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
]);

export class WorkItemService extends AzureDevOpsService {
  private wiqlCache = new Map<string, { result: any; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 60 seconds
  private readonly MAX_CACHE_ENTRIES = 50;
  private readonly DEFAULT_RECENT_DAYS = 7;
  private readonly MAX_RECENT_DAYS = 30;
  private readonly DEFAULT_FIELDS = [
    ...AzureDevOpsService.BASE_SUMMARY_FIELDS,
    ...AzureDevOpsService.SCHEDULING_FIELDS,
  ];

  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  private getCachedWiql(cacheKey: string): any | undefined {
    const entry = this.wiqlCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < this.CACHE_TTL_MS) {
      return entry.result;
    }
    if (entry) {
      this.wiqlCache.delete(cacheKey);
    }
    return undefined;
  }

  private setCachedWiql(cacheKey: string, result: any): void {
    if (this.wiqlCache.size >= this.MAX_CACHE_ENTRIES) {
      const oldestKey = this.wiqlCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.wiqlCache.delete(oldestKey);
      }
    }
    this.wiqlCache.set(cacheKey, { result, timestamp: Date.now() });
  }

  private buildWiqlCacheKey(query: string, top?: number): string {
    return `${this.config.project}:${top ?? 'none'}:${query}`;
  }

  private normalizeRecentDays(days?: number): number {
    if (!days || Number.isNaN(days)) {
      return this.DEFAULT_RECENT_DAYS;
    }

    return Math.min(Math.max(Math.floor(days), 1), this.MAX_RECENT_DAYS);
  }

  private escapeWiqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private applyRecentChangesFilter(query: string, days?: number): { query: string; recentDaysApplied?: number } {
    const normalizedDays = this.normalizeRecentDays(days);

    if (/\bfrom\s+workitemlinks\b/i.test(query) || /\[System\.ChangedDate\]/i.test(query)) {
      return { query };
    }

    const orderByMatch = query.match(/\border\s+by\b/i);
    const whereMatch = query.match(/\bwhere\b/i);
    const fromWorkItemsMatch = query.match(/\bfrom\s+workitems\b/i);

    if (!whereMatch) {
      if (!fromWorkItemsMatch || fromWorkItemsMatch.index === undefined) {
        return { query };
      }

      const insertAt = fromWorkItemsMatch.index + fromWorkItemsMatch[0].length;
      const scopedQuery = `${query.slice(0, insertAt)}\n                    WHERE [System.ChangedDate] >= @today - ${normalizedDays}${query.slice(insertAt)}`;
      return { query: scopedQuery, recentDaysApplied: normalizedDays };
    }

    const filter = `\n                    AND [System.ChangedDate] >= @today - ${normalizedDays}`;

    if (orderByMatch && orderByMatch.index !== undefined) {
      return {
        query: `${query.slice(0, orderByMatch.index)}${filter}\n                    ${query.slice(orderByMatch.index)}`,
        recentDaysApplied: normalizedDays,
      };
    }

    return {
      query: `${query}${filter}`,
      recentDaysApplied: normalizedDays,
    };
  }

  /**
   * Query work items using WIQL
   */
  public async listWorkItems(wiqlQuery: string, top?: number, days?: number, fields?: string[]): Promise<any> {
    try {
      const serverTop = top ?? 100;
      const scopedQuery = this.applyRecentChangesFilter(wiqlQuery, days);
      const requestedFields = this.getRequestedFields(fields, this.DEFAULT_FIELDS);
      const queryAnalysis = analyzeWiql(scopedQuery.query, serverTop, requestedFields.length);
      const cacheKey = this.buildWiqlCacheKey(scopedQuery.query, serverTop);
      const cached = this.getCachedWiql(cacheKey);
      if (cached) return cached;

      const throttleNotices: ThrottleNotice[] = [];
      const witApi = await this.getWorkItemTrackingApi();

      const queryResult = await this.withAuthRetry(() =>
        witApi.queryByWiql({ query: scopedQuery.query }, { project: this.config.project }, undefined, serverTop)
      , {
        operationName: 'workItems.list.queryByWiql',
        details: { project: this.config.project, top: serverTop, recentDays: scopedQuery.recentDaysApplied },
      }, throttleNotices);

      const hydratedWorkItems = await this.hydrateWorkItemRefs(queryResult.workItems || [], {
        fields, defaults: this.DEFAULT_FIELDS, operationName: 'workItems.list.batchHydrate',
        throttleAccumulator: throttleNotices,
      });

      const response = {
        ...queryResult,
        workItems: hydratedWorkItems,
        count: hydratedWorkItems.length,
        originalQuery: wiqlQuery,
        effectiveQuery: scopedQuery.query,
        recentDaysApplied: scopedQuery.recentDaysApplied,
        throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
        apiUsage: buildListWorkItemsUsageProfile({
          resultCount: hydratedWorkItems.length,
          top: serverTop,
          requestedFieldCount: requestedFields.length,
          queryAnalysis,
        }),
      };

      this.setCachedWiql(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Error listing work items:', error);
      throw error;
    }
  }

  /**
   * Get a work item by ID
   */
  public async getWorkItemById(params: WorkItemByIdParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const workItem = await this.withAuthRetry(() =>
        witApi.getWorkItem(params.id, undefined, undefined, WorkItemExpand.Relations, this.config.project)
      );
      
      // Transform to streamlined format for MCP tool consumption
      if (workItem && workItem.fields) {
        const streamlined: any = {
          id: workItem.id,
          rev: workItem.rev,
          title: workItem.fields['System.Title'],
          workItemType: workItem.fields['System.WorkItemType'],
          state: workItem.fields['System.State'],
          areaPath: workItem.fields['System.AreaPath'],
          iterationPath: workItem.fields['System.IterationPath'],
          assignedTo: workItem.fields['System.AssignedTo'] ? {
            displayName: workItem.fields['System.AssignedTo'].displayName,
            uniqueName: workItem.fields['System.AssignedTo'].uniqueName
          } : null,
          createdBy: workItem.fields['System.CreatedBy'] ? {
            displayName: workItem.fields['System.CreatedBy'].displayName,
            uniqueName: workItem.fields['System.CreatedBy'].uniqueName
          } : null,
          createdDate: workItem.fields['System.CreatedDate'],
          changedDate: workItem.fields['System.ChangedDate'],
          description: workItem.fields['System.Description'],
          priority: workItem.fields['Microsoft.VSTS.Common.Priority'],
          originalEstimate: workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
          completedWork: workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'],
          remainingWork: workItem.fields['Microsoft.VSTS.Scheduling.RemainingWork']
        };
        
        // Add work item relations/dependencies
        if (workItem.relations && workItem.relations.length > 0) {
          streamlined.relations = workItem.relations.map((relation: any) => {
            if (relation.rel === 'ArtifactLink') {
              // Artifact link (PR, Build, Branch, Commit, etc.)
              const artifactInfo = this.parseArtifactUri(relation.url);
              return {
                relationshipType: relation.rel,
                artifactType: artifactInfo.type,
                artifactId: artifactInfo.id,
                artifactDisplayName: relation.attributes?.name || artifactInfo.type,
                artifactUri: relation.url,
                comment: relation.attributes?.comment || null
              };
            } else {
              // Work item link
              const urlParts = relation.url.split('/');
              const relatedId = parseInt(urlParts[urlParts.length - 1]);
              return {
                relationshipType: relation.rel,
                relatedWorkItemId: relatedId,
                comment: relation.attributes?.comment || null
              };
            }
          });
        }
        
        // Remove undefined fields to keep response clean
        Object.keys(streamlined).forEach(key => {
          if (streamlined[key] === undefined) {
            delete streamlined[key];
          }
        });
        
        return streamlined;
      }
      
      return workItem;
    } catch (error) {
      console.error(`Error getting work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Get work item with child effort roll-up
   */
  public async getWorkItemWithEffortRollup(params: WorkItemByIdParams): Promise<any> {
    try {
      const workItem = await this.getWorkItemById(params);
      
      // If this work item has child relationships, get effort roll-up
      if (workItem.relations) {
        const childRelations = workItem.relations.filter((rel: any) => 
          rel.relationshipType === 'System.LinkTypes.Hierarchy-Forward'
        );
        
        if (childRelations.length > 0) {
          // Fetch child work items to calculate effort roll-up
          const childEffort = await this.calculateChildEffort(childRelations);
          
          // Add roll-up information to the work item
          workItem.childEffortRollup = {
            childCount: childRelations.length,
            totalOriginalEstimate: childEffort.totalOriginal,
            totalCompletedWork: childEffort.totalCompleted,
            totalRemainingWork: childEffort.totalRemaining,
            childWorkItems: childEffort.childDetails
          };
        }
      }
      
      return workItem;
    } catch (error) {
      console.error(`Error getting work item with effort rollup ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Parse a vstfs:/// artifact URI into type and ID.
   * Handles both %2F and / separators in composite IDs.
   */
  private parseArtifactUri(uri: string): { type: string; id: string } {
    // Normalize %2F to / for easier parsing
    const normalized = uri.replace(/%2[fF]/g, '/');

    // vstfs:///Git/PullRequestId/{projectId}/{repoId}/{prId}
    const prMatch = normalized.match(/vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/);
    if (prMatch) return { type: 'Pull Request', id: prMatch[1] };

    // vstfs:///Build/Build/{buildId}
    const buildMatch = normalized.match(/vstfs:\/\/\/Build\/Build\/(\d+)/);
    if (buildMatch) return { type: 'Build', id: buildMatch[1] };

    // vstfs:///Git/Ref/{projectId}/{repoId}/GB{branchName}
    const branchMatch = normalized.match(/vstfs:\/\/\/Git\/Ref\/[^/]+\/[^/]+\/GB(.+)/);
    if (branchMatch) return { type: 'Branch', id: branchMatch[1] };

    // vstfs:///Git/Commit/{projectId}/{repoId}/{commitSha}
    const commitMatch = normalized.match(/vstfs:\/\/\/Git\/Commit\/[^/]+\/[^/]+\/([a-f0-9]+)/i);
    if (commitMatch) return { type: 'Commit', id: commitMatch[1] };

    // Fallback: extract tool/type from URI pattern vstfs:///{tool}/{type}/...
    const genericMatch = normalized.match(/vstfs:\/\/\/([^/]+)\/([^/]+)\/(.*)/);
    if (genericMatch) return { type: `${genericMatch[1]}/${genericMatch[2]}`, id: genericMatch[3] };

    return { type: 'Unknown', id: uri };
  }

  /**
   * Calculate effort roll-up from child work items
   */
  private async calculateChildEffort(childRelations: any[]): Promise<{
    totalOriginal: number;
    totalCompleted: number;
    totalRemaining: number;
    childDetails: any[];
  }> {
    const witApi = await this.getWorkItemTrackingApi();
    
    let totalOriginal = 0;
    let totalCompleted = 0;
    let totalRemaining = 0;
    const childDetails: any[] = [];
    
    // Fetch child work items in batch
    const childIds = childRelations.map((rel: any) => rel.relatedWorkItemId);
    
    try {
      const childWorkItems = await witApi.getWorkItems(
        childIds,
        ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State',
         'Microsoft.VSTS.Scheduling.OriginalEstimate',
         'Microsoft.VSTS.Scheduling.CompletedWork', 
         'Microsoft.VSTS.Scheduling.RemainingWork'],
        undefined,
        undefined,
        undefined,
        this.config.project
      );
      
      childWorkItems.forEach((child: any) => {
        const original = child.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] || 0;
        const completed = child.fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0;
        const remaining = child.fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0;
        
        totalOriginal += original;
        totalCompleted += completed;
        totalRemaining += remaining;
        
        childDetails.push({
          id: child.id,
          title: child.fields['System.Title'],
          workItemType: child.fields['System.WorkItemType'],
          state: child.fields['System.State'],
          originalEstimate: original,
          completedWork: completed,
          remainingWork: remaining
        });
      });
      
    } catch (error) {
      console.error('Error fetching child work items for effort calculation:', error);
    }
    
    return {
      totalOriginal,
      totalCompleted,
      totalRemaining,
      childDetails
    };
  }

  /**
   * Search work items using text
   */

  /**
   * Get recently updated work items
   */
  public async getRecentWorkItems(params: RecentWorkItemsParams): Promise<any> {
    try {
      const days = this.normalizeRecentDays(params.days);
      const top = params.top || 10;
      const skip = params.skip || 0;
      const serverTop = skip + top;
      const requestedFields = this.getRequestedFields(params.fields, this.DEFAULT_FIELDS);
      const query = `SELECT [System.Id], [System.Title], [System.State], [System.ChangedDate]
                    FROM WorkItems
                    WHERE [System.TeamProject] = @project
                    AND [System.ChangedDate] >= @today - ${days}
                    ORDER BY [System.ChangedDate] DESC`;

      const cacheKey = this.buildWiqlCacheKey(query, serverTop);
      const cached = this.getCachedWiql(cacheKey);
      if (cached) return cached;

      const throttleNotices: ThrottleNotice[] = [];
      const witApi = await this.getWorkItemTrackingApi();
      const queryResult = await this.withAuthRetry(() => witApi.queryByWiql({
        query
      }, {
        project: this.config.project
      }, undefined, serverTop), {
        operationName: 'workItems.recent.queryByWiql',
        details: { project: this.config.project, top: serverTop, recentDays: days },
      }, throttleNotices);

      const pageRefs = queryResult.workItems ? queryResult.workItems.slice(skip, skip + top) : [];
      const hydratedWorkItems = await this.hydrateWorkItemRefs(pageRefs, {
        fields: params.fields, defaults: this.DEFAULT_FIELDS, operationName: 'workItems.recent.batchHydrate',
        throttleAccumulator: throttleNotices,
      });

      const response = {
        ...queryResult,
        workItems: hydratedWorkItems,
        count: hydratedWorkItems.length,
        recentDaysApplied: days,
        throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
        apiUsage: buildRecentWorkItemsUsageProfile({
          resultCount: hydratedWorkItems.length,
          top,
          requestedFieldCount: requestedFields.length,
          days,
        }),
      };
      this.setCachedWiql(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Error getting recent work items:', error);
      throw error;
    }
  }

  /**
   * Get work items assigned to current user
   */
  public async getMyWorkItems(params: MyWorkItemsParams): Promise<any> {
    try {
      let stateCondition = '';
      if (params.state) {
        stateCondition = `AND [System.State] = '${this.escapeWiqlLiteral(params.state)}'`;
      }
      const serverTop = params.top || 50;
      const recentDays = this.normalizeRecentDays(params.days);
      const requestedFields = this.getRequestedFields(params.fields, this.DEFAULT_FIELDS);

      const query = `SELECT [System.Id], [System.Title], [System.State], [System.CreatedDate]
                    FROM WorkItems
                    WHERE [System.TeamProject] = @project
                    AND [System.AssignedTo] = @me
                    AND [System.ChangedDate] >= @today - ${recentDays}
                    ${stateCondition}
                    ORDER BY [System.CreatedDate] DESC`;

      const cacheKey = this.buildWiqlCacheKey(query, serverTop);
      const cached = this.getCachedWiql(cacheKey);
      if (cached) return cached;

      const throttleNotices: ThrottleNotice[] = [];
      const witApi = await this.getWorkItemTrackingApi();
      const queryResult = await this.withAuthRetry(() => witApi.queryByWiql({
        query
      }, {
        project: this.config.project
      }, undefined, serverTop), {
        operationName: 'workItems.mine.queryByWiql',
        details: { project: this.config.project, top: serverTop, recentDays },
      }, throttleNotices);

      const hydratedWorkItems = await this.hydrateWorkItemRefs(queryResult.workItems || [], {
        fields: params.fields, defaults: this.DEFAULT_FIELDS, operationName: 'workItems.mine.batchHydrate',
        throttleAccumulator: throttleNotices,
      });

      const response = {
        ...queryResult,
        workItems: hydratedWorkItems,
        count: hydratedWorkItems.length,
        recentDaysApplied: recentDays,
        throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
        apiUsage: buildMyWorkItemsUsageProfile({
          resultCount: hydratedWorkItems.length,
          top: serverTop,
          requestedFieldCount: requestedFields.length,
          days: recentDays,
          state: params.state,
        }),
      };
      this.setCachedWiql(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Error getting my work items:', error);
      throw error;
    }
  }

  /**
   * Create a work item
   */
  public async createWorkItem(params: CreateWorkItemParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const patchDocument: JsonPatchOperation[] = [];
      
      // Add title
      patchDocument.push({
        op: Operation.Add,
        path: "/fields/System.Title",
        value: params.title
      });
      
      // Add description if provided (convert markdown to HTML for Azure DevOps rich-text field)
      if (params.description) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.Description",
          value: markdownToHtml(params.description)
        });
      }
      
      // Add assigned to if provided
      if (params.assignedTo) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.AssignedTo",
          value: params.assignedTo
        });
      }
      
      // Add state if provided
      if (params.state) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.State",
          value: params.state
        });
      }
      
      // Add area path if provided
      if (params.areaPath) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.AreaPath",
          value: params.areaPath
        });
      }
      
      // Add iteration path if provided
      if (params.iterationPath) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.IterationPath",
          value: params.iterationPath
        });
      }
      
      // Add additional fields if provided
      if (params.additionalFields) {
        for (const [key, value] of Object.entries(params.additionalFields)) {
          patchDocument.push({
            op: Operation.Add,
            path: `/fields/${key}`,
            value: value
          });
        }
      }
      
      const workItem = await witApi.createWorkItem(
        undefined,
        patchDocument,
        this.config.project,
        params.workItemType
      );
      
      return workItem;
    } catch (error) {
      console.error('Error creating work item:', error);
      throw error;
    }
  }

  /**
   * Update a work item
   */
  public async updateWorkItem(params: UpdateWorkItemParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const patchDocument: JsonPatchOperation[] = [];
      
      // Add fields from the params (rich-text fields auto-converted from markdown to HTML)
      for (const [key, value] of Object.entries(params.fields)) {
        patchDocument.push({
          op: Operation.Add,
          path: `/fields/${key}`,
          value: RICH_TEXT_FIELDS.has(key) && typeof value === 'string' ? markdownToHtml(value) : value
        });
      }
      
      const workItem = await witApi.updateWorkItem(
        undefined,
        patchDocument,
        params.id,
        this.config.project
      );
      
      return workItem;
    } catch (error) {
      console.error(`Error updating work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Get comments on a work item
   */
  public async getWorkItemComments(params: GetWorkItemCommentsParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const sortOrder = params.order === 'asc' ? CommentSortOrder.Asc : CommentSortOrder.Desc;

      const commentList = await this.withAuthRetry(() =>
        witApi.getComments(
          this.config.project,
          params.id,
          params.top,
          undefined, // continuationToken
          params.includeDeleted ?? false,
          CommentExpandOptions.None,
          sortOrder
        )
      );

      return commentList;
    } catch (error) {
      console.error(`Error getting comments for work item ${params.id}:`, error);
      throw error;
    }
  }


  /**
   * Add a comment to a work item.
   * Uses ADO's server-side markdown renderer (format=markdown) for comments.
   */
  public async addWorkItemComment(params: AddWorkItemCommentParams): Promise<any> {
    try {
      const format = params.format === 'html' ? 'html' : 'markdown';
      const text = format === 'markdown' ? normalizeLiteralEscapes(unescapeHtmlEntities(params.text)) : params.text;

      // Sanitise inputs before URL interpolation (SDK calls handle this internally, but this is a raw REST call)
      const id = Math.floor(Number(params.id));
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid work item ID: ${params.id}`);
      const baseUrl = this.connection.serverUrl.replace(/\/+$/, '');
      const project = encodeURIComponent(this.config.project);
      const url = `${baseUrl}/${project}/_apis/wit/workItems/${id}/comments?format=${format}&api-version=7.2-preview.4`;

      const response = await this.withAuthRetry(() =>
        this.connection.rest.create<any>(url, { text })
      );

      if (!response.result) {
        throw new Error(`Azure DevOps API returned no data when creating comment on work item ${params.id}`);
      }
      return response.result;
    } catch (error) {
      console.error(`Error adding comment to work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing comment on a work item.
   * Uses ADO's server-side markdown renderer (format=markdown) for comments.
   */
  public async updateWorkItemComment(params: { id: number; commentId: number; text: string; format?: 'markdown' | 'html' }): Promise<any> {
    try {
      const format = params.format === 'html' ? 'html' : 'markdown';
      const text = format === 'markdown' ? normalizeLiteralEscapes(unescapeHtmlEntities(params.text)) : params.text;

      const id = Math.floor(Number(params.id));
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid work item ID: ${params.id}`);
      const commentId = Math.floor(Number(params.commentId));
      if (!Number.isSafeInteger(commentId) || commentId <= 0) throw new Error(`Invalid comment ID: ${params.commentId}`);

      const baseUrl = this.connection.serverUrl.replace(/\/+$/, '');
      const project = encodeURIComponent(this.config.project);
      const url = `${baseUrl}/${project}/_apis/wit/workItems/${id}/comments/${commentId}?format=${format}&api-version=7.2-preview.4`;

      const response = await this.withAuthRetry(() =>
        this.connection.rest.update<any>(url, { text })
      );

      if (!response.result) {
        throw new Error(`Azure DevOps API returned no data when updating comment ${params.commentId} on work item ${params.id}`);
      }
      return response.result;
    } catch (error) {
      console.error(`Error updating comment ${params.commentId} on work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Update work item state
   */
  public async updateWorkItemState(params: UpdateWorkItemStateParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: "/fields/System.State",
          value: params.state
        }
      ];
      
      // Add comment if provided (convert markdown to HTML for rich-text field)
      if (params.comment) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.History",
          value: markdownToHtml(params.comment)
        });
      }
      
      const workItem = await witApi.updateWorkItem(
        undefined,
        patchDocument,
        params.id,
        this.config.project
      );
      
      return workItem;
    } catch (error) {
      console.error(`Error updating state for work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Assign work item to a user
   */
  public async assignWorkItem(params: AssignWorkItemParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: "/fields/System.AssignedTo",
          value: params.assignedTo
        }
      ];
      
      const workItem = await witApi.updateWorkItem(
        undefined,
        patchDocument,
        params.id,
        this.config.project
      );
      
      return workItem;
    } catch (error) {
      console.error(`Error assigning work item ${params.id}:`, error);
      throw error;
    }
  }

  /**
   * Create a link between a work item and another work item or artifact
   */
  public async createLink(params: CreateLinkServiceParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();

      let relationValue: any;

      if (params.artifactUri) {
        // Artifact link (PR, Build, Branch, Commit)
        relationValue = {
          rel: "ArtifactLink",
          url: params.artifactUri,
          attributes: {
            comment: params.comment || "",
            name: params.artifactName || ""
          }
        };
      } else {
        // Work item link (existing behavior)
        relationValue = {
          rel: params.linkType,
          url: `${this.config.orgUrl}/_apis/wit/workItems/${params.targetWorkItemId}`,
          attributes: {
            comment: params.comment || ""
          }
        };
      }

      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: "/relations/-",
          value: relationValue
        }
      ];

      const workItem = await witApi.updateWorkItem(
        undefined,
        patchDocument,
        params.sourceId,
        this.config.project
      );

      return workItem;
    } catch (error) {
      console.error(`Error creating link:`, error);
      throw error;
    }
  }

  /**
   * Bulk create or update work items
   */
  public async bulkUpdateWorkItems(params: BulkWorkItemParams): Promise<any> {
    try {
      const results = [];
      
      for (const workItemParams of params.workItems) {
        if ('id' in workItemParams) {
          // It's an update
          const result = await this.updateWorkItem(workItemParams);
          results.push(result);
        } else {
          // It's a create
          const result = await this.createWorkItem(workItemParams);
          results.push(result);
        }
      }
      
      return {
        count: results.length,
        workItems: results
      };
    } catch (error) {
      console.error('Error in bulk work item operation:', error);
      throw error;
    }
  }

  // ── New Work Item Enhancement Methods ──────────────────────────

  /**
   * Get multiple work items by IDs in a single call.
   */
  public async getWorkItemsBatch(params: GetWorkItemsBatchParams): Promise<any[]> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const workItems = await witApi.getWorkItems(
        params.ids,
        params.fields,
        undefined, // asOf
        WorkItemExpand.Relations,
      );
      return workItems || [];
    } catch (error) {
      console.error('Error getting work items batch:', error);
      throw error;
    }
  }

  /**
   * Get revision history for a work item.
   */
  public async getWorkItemRevisions(params: GetWorkItemRevisionsParams): Promise<any[]> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const revisions = await witApi.getRevisions(
        params.id,
        params.top,
        params.skip,
      );
      return revisions || [];
    } catch (error) {
      console.error('Error getting work item revisions:', error);
      throw error;
    }
  }

  /**
   * Execute a saved WIQL query by query ID and return the work items.
   */
  public async getQueryResults(params: GetQueryResultsParams): Promise<any> {
    try {
      const throttleNotices: ThrottleNotice[] = [];
      const witApi = await this.getWorkItemTrackingApi();
      const requestedFields = this.getRequestedFields(params.fields, this.DEFAULT_FIELDS);

      const queryResult = await this.withAuthRetry(() => witApi.queryById(
        params.queryId,
        { project: this.config.project } as any,
      ), {
        operationName: 'workItems.savedQuery.queryById',
        details: { project: this.config.project, queryId: params.queryId },
      }, throttleNotices);

      if (!queryResult || !queryResult.workItems || queryResult.workItems.length === 0) {
        const queryType = queryResult?.queryType !== undefined ? String(queryResult.queryType) : undefined;
        return {
          workItems: [],
          count: 0,
          queryType,
          columns: queryResult?.columns?.map((c: any) => c.referenceName),
          throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
          apiUsage: buildSavedQueryUsageProfile({
            resultCount: 0,
            requestedFieldCount: requestedFields.length,
            queryType,
          }),
        };
      }

      const queryType = queryResult.queryType !== undefined ? String(queryResult.queryType) : undefined;

      const hydratedWorkItems = await this.hydrateWorkItemRefs(queryResult.workItems, {
        fields: params.fields, defaults: this.DEFAULT_FIELDS, operationName: 'workItems.savedQuery.batchHydrate',
        throttleAccumulator: throttleNotices,
      });

      return {
        workItems: hydratedWorkItems,
        count: hydratedWorkItems.length,
        queryType,
        columns: queryResult.columns?.map((c: any) => c.referenceName),
        throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
        apiUsage: buildSavedQueryUsageProfile({
          resultCount: hydratedWorkItems.length,
          requestedFieldCount: requestedFields.length,
          queryType,
        }),
      };
    } catch (error) {
      console.error('Error executing saved query:', error);
      throw error;
    }
  }

  /**
   * Create a child work item linked to a parent.
   */
  public async addChildWorkItem(params: AddChildWorkItemParams): Promise<any> {
    try {
      // First create the work item
      const createParams: CreateWorkItemParams = {
        workItemType: params.workItemType,
        title: params.title,
        description: params.description,
        assignedTo: params.assignedTo,
        state: params.state,
        areaPath: params.areaPath,
        iterationPath: params.iterationPath,
        additionalFields: params.additionalFields,
      };
      const child = await this.createWorkItem(createParams);

      if (!child || !child.id) {
        throw new Error('Failed to create child work item.');
      }

      // Link child to parent
      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: '/relations/-',
          value: {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: `${this.config.orgUrl}/_apis/wit/workItems/${params.parentId}`,
            attributes: { comment: 'Created as child work item' },
          },
        },
      ];

      const witApi = await this.getWorkItemTrackingApi();
      const updated = await witApi.updateWorkItem(
        {} as any, // customHeaders
        patchDocument,
        child.id,
        this.config.project,
      );

      return updated || child;
    } catch (error) {
      console.error('Error creating child work item:', error);
      throw error;
    }
  }

  /**
   * Remove a relation (link) from a work item by relation index.
   */
  public async unlinkWorkItem(params: UnlinkWorkItemParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();

      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Remove,
          path: `/relations/${params.relationIndex}`,
        },
      ];

      return await witApi.updateWorkItem(
        {} as any,
        patchDocument,
        params.id,
        this.config.project,
      );
    } catch (error) {
      console.error('Error unlinking work item:', error);
      throw error;
    }
  }
}