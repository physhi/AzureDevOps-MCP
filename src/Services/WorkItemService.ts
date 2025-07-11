import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
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
  UpdateWorkItemStateParams,
  AssignWorkItemParams,
  CreateLinkParams,
  BulkWorkItemParams
} from '../Interfaces/WorkItems';

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
      const queryResult = await witApi.queryByWiql({
        query: wiqlQuery
      }, {
        project: this.config.project
      });
      
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
      const workItem = await witApi.getWorkItem(params.id, undefined, undefined, undefined, this.config.project);
      
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
            // Extract work item ID from URL (e.g., ".../_apis/wit/workItems/12345" -> 12345)
            const urlParts = relation.url.split('/');
            const relatedId = parseInt(urlParts[urlParts.length - 1]);
            
            return {
              relationshipType: relation.rel,
              relatedWorkItemId: relatedId,
              comment: relation.attributes?.comment || null
            };
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
      
      return queryResult;
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
      
      // Add description if provided
      if (params.description) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.Description",
          value: params.description
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
      
      // Add fields from the params
      for (const [key, value] of Object.entries(params.fields)) {
        patchDocument.push({
          op: Operation.Add,
          path: `/fields/${key}`,
          value: value
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
   * Add a comment to a work item
   */
  public async addWorkItemComment(params: AddWorkItemCommentParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const comment = await witApi.addComment({
        text: params.text
      }, this.config.project, params.id);
      
      return comment;
    } catch (error) {
      console.error(`Error adding comment to work item ${params.id}:`, error);
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
      
      // Add comment if provided
      if (params.comment) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.History",
          value: params.comment
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
   * Create a link between work items
   */
  public async createLink(params: CreateLinkParams): Promise<any> {
    try {
      const witApi = await this.getWorkItemTrackingApi();
      
      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: "/relations/-",
          value: {
            rel: params.linkType,
            url: `${this.config.orgUrl}/_apis/wit/workItems/${params.targetId}`,
            attributes: {
              comment: params.comment || ""
            }
          }
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
      console.error(`Error creating link between work items:`, error);
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
}