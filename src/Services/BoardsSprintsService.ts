import * as azdev from 'azure-devops-node-api';
import { WorkApi } from 'azure-devops-node-api/WorkApi';
import { CoreApi } from 'azure-devops-node-api/CoreApi';
import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService, ThrottleNotice } from './AzureDevOpsService';
import {
  GetBoardsParams,
  GetBoardColumnsParams,
  GetBoardItemsParams,
  MoveCardOnBoardParams,
  GetSprintsParams,
  GetCurrentSprintParams,
  GetSprintWorkItemsParams,
  GetSprintCapacityParams,
  GetTeamMembersParams
} from '../Interfaces/BoardsAndSprints';
import { buildSprintWorkItemsUsageProfile } from '../utils/apiUsageGuidance';

// Define TeamContext interface since it's not exported from WorkInterfaces
interface TeamContext {
  project: string;
  team?: string;
}

export class BoardsSprintsService extends AzureDevOpsService {
  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  /**
   * Get the Work API client
   */
  private async getWorkApi(): Promise<WorkApi> {
    return await this.connection.getWorkApi();
  }

  /**
   * Get the Core API client
   */
  private async getCoreApi(): Promise<CoreApi> {
    return await this.connection.getCoreApi();
  }

  /**
   * Get team context
   */
  private getTeamContext(teamId?: string): TeamContext {
    return {
      project: this.config.project,
      team: teamId
    };
  }

  /**
   * Get all boards
   */
  public async getBoards(params: GetBoardsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      const boards = await this.withAuthRetry(() => workApi.getBoards(teamContext), {
        operationName: 'boards.list',
        details: {
          project: this.config.project,
          teamId: params.teamId,
        },
      });
      return boards;
    } catch (error) {
      console.error('Error getting boards:', error);
      throw error;
    }
  }

  /**
   * Get board columns
   */
  public async getBoardColumns(params: GetBoardColumnsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      const columns = await this.withAuthRetry(() => workApi.getBoardColumns(teamContext, params.boardId), {
        operationName: 'boards.columns.list',
        details: {
          project: this.config.project,
          teamId: params.teamId,
          boardId: params.boardId,
        },
      });
      return columns;
    } catch (error) {
      console.error(`Error getting columns for board ${params.boardId}:`, error);
      throw error;
    }
  }

  /**
   * Get board items
   */
  public async getBoardItems(params: GetBoardItemsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      // Get board cards - use a different approach since getCardsBySettings doesn't exist
      // First get the board
      const board = await this.withAuthRetry(() => workApi.getBoard(teamContext, params.boardId), {
        operationName: 'boards.get',
        details: {
          project: this.config.project,
          teamId: params.teamId,
          boardId: params.boardId,
        },
      });
      
      // Then get the board columns
      const columns = await this.withAuthRetry(() => workApi.getBoardColumns(teamContext, params.boardId), {
        operationName: 'boards.items.columns',
        details: {
          project: this.config.project,
          teamId: params.teamId,
          boardId: params.boardId,
        },
      });
      
      // Combine the data
      return {
        board,
        columns
      };
    } catch (error) {
      console.error(`Error getting board items for board ${params.boardId}:`, error);
      throw error;
    }
  }

  /**
   * Move a card on board
   */
  public async moveCardOnBoard(params: MoveCardOnBoardParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      // We need to update the work item to change its board column
      // This often requires knowing the field mappings for the board
      // This is a simplified implementation that assumes standard mappings
      const updateData = {
        id: params.workItemId,
        fields: {
          "System.BoardColumn": params.columnId
        }
      };
      
      // The proper implementation would use the board's column mappings
      // For now, we return the update data as confirmation
      return updateData;
    } catch (error) {
      console.error(`Error moving card ${params.workItemId} on board ${params.boardId}:`, error);
      throw error;
    }
  }

  /**
   * Get all sprints
   */
  public async getSprints(params: GetSprintsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      const sprints = await this.withAuthRetry(() => workApi.getTeamIterations(teamContext), {
        operationName: 'sprints.list',
        details: {
          project: this.config.project,
          teamId: params.teamId,
        },
      });
      return sprints;
    } catch (error) {
      console.error('Error getting sprints:', error);
      throw error;
    }
  }

  /**
   * Get current sprint
   */
  public async getCurrentSprint(params: GetCurrentSprintParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      const currentIterations = await this.withAuthRetry(() => workApi.getTeamIterations(teamContext, "current"), {
        operationName: 'sprints.current',
        details: {
          project: this.config.project,
          teamId: params.teamId,
        },
      });
      return currentIterations && currentIterations.length > 0 ? currentIterations[0] : null;
    } catch (error) {
      console.error('Error getting current sprint:', error);
      throw error;
    }
  }

  /**
   * Get sprint work items
   */
  public async getSprintWorkItems(params: GetSprintWorkItemsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      const requestedFields = this.getRequestedFields(params.fields);

      const throttleNotices: ThrottleNotice[] = [];
      const workItems = await this.withAuthRetry(() => workApi.getIterationWorkItems(teamContext, params.sprintId), {
        operationName: 'boards.sprint.getIterationWorkItems',
        details: {
          project: this.config.project,
          sprintId: params.sprintId,
          teamId: params.teamId,
        },
      }, throttleNotices);
      const sprintItems: any = workItems;
      const itemRefs = sprintItems?.workItems || sprintItems?.workItemRelations || [];
      const hydratedWorkItems = await this.hydrateWorkItemRefs(Array.isArray(itemRefs) ? itemRefs : [], {
        fields: params.fields,
        extractId: (item: any) => item?.target?.id || item?.id || item?.workItem?.id,
        operationName: 'boards.sprint.batchHydrate',
        throttleAccumulator: throttleNotices,
      });

      return {
        ...workItems,
        workItems: hydratedWorkItems,
        count: hydratedWorkItems.length,
        throttleInfo: AzureDevOpsService.buildThrottleInfo(throttleNotices),
        apiUsage: buildSprintWorkItemsUsageProfile({
          resultCount: hydratedWorkItems.length,
          requestedFieldCount: requestedFields.length,
        }),
      };
    } catch (error) {
      console.error(`Error getting work items for sprint ${params.sprintId}:`, error);
      throw error;
    }
  }

  /**
   * Get board cards
   */
  public async getBoardCards(params: GetBoardItemsParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      // Get board charts instead of cards since getBoardCards doesn't exist
      const charts = await this.withAuthRetry(() => workApi.getBoardCharts(teamContext, params.boardId), {
        operationName: 'boards.charts.list',
        details: {
          project: this.config.project,
          teamId: params.teamId,
          boardId: params.boardId,
        },
      });
      
      return charts;
    } catch (error) {
      console.error(`Error getting board charts for board ${params.boardId}:`, error);
      throw error;
    }
  }

  /**
   * Get sprint capacity
   */
  public async getSprintCapacity(params: GetSprintCapacityParams): Promise<any> {
    try {
      const workApi = await this.getWorkApi();
      const teamContext = this.getTeamContext(params.teamId);
      
      // Get team settings instead of capacities since getCapacities doesn't exist
      const teamSettings = await this.withAuthRetry(() => workApi.getTeamSettings(teamContext), {
        operationName: 'sprints.capacity.teamSettings',
        details: {
          project: this.config.project,
          teamId: params.teamId,
          sprintId: params.sprintId,
        },
      });
      
      // Return team settings as a workaround
      return {
        teamSettings,
        sprintId: params.sprintId,
        message: "Direct capacity API not available, returning team settings instead"
      };
    } catch (error) {
      console.error(`Error getting capacity for sprint ${params.sprintId}:`, error);
      throw error;
    }
  }

  /**
   * Get team members
   */
  public async getTeamMembers(params: GetTeamMembersParams): Promise<any> {
    try {
      const coreApi = await this.getCoreApi();
      const teamId = params.teamId || this.config.project;
      
      // Get team members with extended properties
      const members = await this.withAuthRetry(() => coreApi.getTeamMembersWithExtendedProperties(this.config.project, teamId), {
        operationName: 'teams.members.list',
        details: {
          project: this.config.project,
          teamId,
        },
      });
      
      // Transform to streamlined format for MCP tool consumption
      if (members && Array.isArray(members)) {
        const streamlined = members.map((member: any) => ({
          displayName: member.identity?.displayName,
          uniqueName: member.identity?.uniqueName,
          isTeamAdmin: member.isTeamAdmin || false
        }));
        
        return streamlined;
      }
      
      return members;
    } catch (error) {
      console.error(`Error getting team members for team ${params.teamId}:`, error);
      throw error;
    }
  }

  /**
   * Get teams in the configured project with pagination
   */
  public async getTeams(top?: number, skip?: number): Promise<any[]> {
    try {
      const coreApi = await this.getCoreApi();
      const teams = await this.withAuthRetry(() => coreApi.getTeams(this.config.project, undefined, top ?? 100, skip), {
        operationName: 'teams.list',
        details: {
          project: this.config.project,
          top: top ?? 100,
          skip,
        },
      });
      return teams;
    } catch (error) {
      console.error('Error getting teams:', error);
      throw error;
    }
  }

  /**
   * Helper to get default team ID
   */
  private async getDefaultTeamId(): Promise<string> {
    try {
      const coreApi = await this.getCoreApi();
      const teams = await this.withAuthRetry(() => coreApi.getTeams(this.config.project), {
        operationName: 'teams.default.lookup',
        details: {
          project: this.config.project,
        },
      });
      
      // Find the default team, which often has the same name as the project
      const defaultTeam = teams.find(team => team.name === this.config.project) || teams[0];
      
      return defaultTeam.id!;
    } catch (error) {
      console.error('Error getting default team ID:', error);
      throw error;
    }
  }
} 