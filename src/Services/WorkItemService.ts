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
  SearchWorkItemsParams,
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
} from '../Interfaces/WorkItems';
import { markdownToHtml } from '../utils/formatHelpers';

/** Rich-text fields that expect HTML — markdown is auto-converted for these */
const RICH_TEXT_FIELDS = new Set([
  'System.Description',
  'System.History',
  'System.ReproSteps',
  'Microsoft.VSTS.TCM.Steps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
]);

export class WorkItemService extends AzureDevOpsService {
  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  /**
   * Query work items using WIQL
   */
  public async listWorkItems(wiqlQuery: string): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      // Execute the WIQL query
      const queryResult = await this.withAuthRetry(() =>
        witApi.queryByWiql({ query: wiqlQuery }, { project: this.config.project })
      );
      
      return queryResult;
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
  public async searchWorkItems(params: SearchWorkItemsParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const query = `SELECT [System.Id], [System.Title], [System.State], [System.CreatedDate] 
                    FROM WorkItems 
                    WHERE [System.TeamProject] = @project 
                    AND (
                      [System.Title] CONTAINS '${params.searchText}'
                      OR [System.Description] CONTAINS '${params.searchText}'
                    )
                    ORDER BY [System.CreatedDate] DESC`;
      
      const queryResult = await witApi.queryByWiql({
        query
      }, {
        project: this.config.project
      });
      
      // Get full work item details if we have results
      if (queryResult.workItems && queryResult.workItems.length > 0) {
        const workItemIds = queryResult.workItems
          .slice(0, params.top || 50) // Limit results to avoid too many API calls
          .map((wi: any) => wi.id);
        
        // Fetch detailed work item information
        const detailedWorkItems = await witApi.getWorkItems(
          workItemIds,
          [
            'System.Id', 
            'System.Title', 
            'System.WorkItemType',
            'System.State', 
            'System.AssignedTo',
            'System.CreatedBy',
            'System.CreatedDate',
            'System.ChangedDate',
            'System.AreaPath',
            'System.IterationPath',
            'Microsoft.VSTS.Common.Priority',
            'Microsoft.VSTS.Scheduling.OriginalEstimate',
            'Microsoft.VSTS.Scheduling.CompletedWork',
            'Microsoft.VSTS.Scheduling.RemainingWork'
          ],
          undefined,
          undefined,
          undefined,
          this.config.project
        );
        
        // Transform to consistent format
        const transformedWorkItems = detailedWorkItems.map((workItem: any) => ({
          id: workItem.id,
          title: workItem.fields['System.Title'],
          workItemType: workItem.fields['System.WorkItemType'],
          state: workItem.fields['System.State'],
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
          areaPath: workItem.fields['System.AreaPath'],
          iterationPath: workItem.fields['System.IterationPath'],
          priority: workItem.fields['Microsoft.VSTS.Common.Priority'],
          originalEstimate: workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
          completedWork: workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'],
          remainingWork: workItem.fields['Microsoft.VSTS.Scheduling.RemainingWork']
        }));
        
        return {
          searchQuery: params.searchText,
          totalResults: queryResult.workItems.length,
          returnedResults: transformedWorkItems.length,
          workItems: transformedWorkItems
        };
      }
      
      return {
        searchQuery: params.searchText,
        totalResults: 0,
        returnedResults: 0,
        workItems: []
      };
    } catch (error) {
      console.error('Error searching work items:', error);
      throw error;
    }
  }

  /**
   * Get recently updated work items
   */
  public async getRecentWorkItems(params: RecentWorkItemsParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      const query = `SELECT [System.Id], [System.Title], [System.State], [System.ChangedDate] 
                    FROM WorkItems 
                    WHERE [System.TeamProject] = @project 
                    ORDER BY [System.ChangedDate] DESC`;
      
      const queryResult = await witApi.queryByWiql({
        query
      }, {
        project: this.config.project
      });
      
      const top = params.top || 10;
      const skip = params.skip || 0;
      
      if (queryResult.workItems) {
        queryResult.workItems = queryResult.workItems.slice(skip, skip + top);
      }
      
      return queryResult;
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
      const witApi = await this.getWorkItemTrackingApi();
      let stateCondition = '';
      if (params.state) {
        stateCondition = `AND [System.State] = '${params.state}'`;
      }
      
      const query = `SELECT [System.Id], [System.Title], [System.State], [System.CreatedDate] 
                    FROM WorkItems 
                    WHERE [System.TeamProject] = @project 
                    AND [System.AssignedTo] = @me
                    ${stateCondition}
                    ORDER BY [System.CreatedDate] DESC`;
      
      const queryResult = await witApi.queryByWiql({
        query
      }, {
        project: this.config.project
      });
      
      const top = params.top || 100;
      
      if (queryResult.workItems) {
        queryResult.workItems = queryResult.workItems.slice(0, top);
      }
      
      return queryResult;
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
   * Unescape HTML entities in markdown text so that characters like ", >, <
   * render correctly instead of appearing as &quot;, &gt;, &lt; literals.
   */
  private unescapeHtmlEntities(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Add a comment to a work item.
   * Uses ADO's server-side markdown renderer (format=0) for comments.
   */
  public async addWorkItemComment(params: AddWorkItemCommentParams): Promise<any> {
    try {
      const format = params.format === 'html' ? 1 : 0; // default to markdown (0)
      const text = format === 0 ? this.unescapeHtmlEntities(params.text) : params.text;

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
   * Uses ADO's server-side markdown renderer (format=0) for comments.
   */
  public async updateWorkItemComment(params: { id: number; commentId: number; text: string; format?: 'markdown' | 'html' }): Promise<any> {
    try {
      const format = params.format === 'html' ? 1 : 0;
      const text = format === 0 ? this.unescapeHtmlEntities(params.text) : params.text;

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
      const witApi = await this.getWorkItemTrackingApi();

      // Execute the stored query
      const queryResult = await witApi.queryById(
        params.queryId,
        { project: this.config.project } as any,
      );

      if (!queryResult || !queryResult.workItems || queryResult.workItems.length === 0) {
        return { workItems: [], count: 0, queryType: queryResult.queryType };
      }

      // Get full work item details for the returned IDs
      const ids = queryResult.workItems
        .map((wi: any) => wi.id)
        .filter((id: number | undefined): id is number => id !== undefined)
        .slice(0, 200); // Limit to 200

      if (ids.length === 0) {
        return { workItems: [], count: 0, queryType: queryResult.queryType };
      }

      const workItems = await witApi.getWorkItems(ids);
      return {
        workItems: workItems || [],
        count: workItems?.length || 0,
        queryType: queryResult.queryType,
        columns: queryResult.columns?.map((c: any) => c.referenceName),
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