import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { BoardsSprintsService } from '../Services/BoardsSprintsService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
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
import getClassMethods from "../utils/getClassMethods";

export class BoardsSprintsTools {
  private boardsSprintsService: BoardsSprintsService;

  constructor(config: AzureDevOpsConfig) {
    this.boardsSprintsService = new BoardsSprintsService(config);
  }

  /**
   * Get all boards
   */
  public async getBoards(params: GetBoardsParams): Promise<McpResponse> {
    try {
      const boards = await this.boardsSprintsService.getBoards(params);
      return formatMcpResponse(boards, `Found ${boards.length} boards`);
    } catch (error) {
      console.error('Error in getBoards tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get board columns
   */
  public async getBoardColumns(params: GetBoardColumnsParams): Promise<McpResponse> {
    try {
      const columns = await this.boardsSprintsService.getBoardColumns(params);
      return formatMcpResponse(columns, `Found ${columns.length} columns for board ${params.boardId}`);
    } catch (error) {
      console.error('Error in getBoardColumns tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get board items
   */
  public async getBoardItems(params: GetBoardItemsParams): Promise<McpResponse> {
    try {
      const items = await this.boardsSprintsService.getBoardItems(params);
      return formatMcpResponse(items, `Retrieved items for board ${params.boardId}`);
    } catch (error) {
      console.error('Error in getBoardItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Move a card on board
   */
  public async moveCardOnBoard(params: MoveCardOnBoardParams): Promise<McpResponse> {
    try {
      const result = await this.boardsSprintsService.moveCardOnBoard(params);
      return formatMcpResponse(result, `Moved work item ${params.workItemId} to column ${params.columnId}`);
    } catch (error) {
      console.error('Error in moveCardOnBoard tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get all sprints
   */
  public async getSprints(params: GetSprintsParams): Promise<McpResponse> {
    try {
      const sprints = await this.boardsSprintsService.getSprints(params);
      return formatMcpResponse(sprints, `Found ${sprints.length} sprints`);
    } catch (error) {
      console.error('Error in getSprints tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get current sprint
   */
  public async getCurrentSprint(params: GetCurrentSprintParams): Promise<McpResponse> {
    try {
      const sprint = await this.boardsSprintsService.getCurrentSprint(params);
      return formatMcpResponse(sprint, sprint ? `Current sprint: ${sprint.name}` : 'No current sprint found');
    } catch (error) {
      console.error('Error in getCurrentSprint tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get sprint work items
   */
  public async getSprintWorkItems(params: GetSprintWorkItemsParams): Promise<McpResponse> {
    try {
      const workItems = await this.boardsSprintsService.getSprintWorkItems(params);
      return formatMcpResponse(workItems, `Found ${workItems.workItems?.length || 0} work items in sprint ${params.sprintId}`);
    } catch (error) {
      console.error('Error in getSprintWorkItems tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get sprint capacity
   */
  public async getSprintCapacity(params: GetSprintCapacityParams): Promise<McpResponse> {
    try {
      const capacity = await this.boardsSprintsService.getSprintCapacity(params);
      return formatMcpResponse(capacity, `Retrieved capacity for sprint ${params.sprintId}`);
    } catch (error) {
      console.error('Error in getSprintCapacity tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get team members
   */
  public async getTeamMembers(params: GetTeamMembersParams): Promise<McpResponse> {
    try {
      const members = await this.boardsSprintsService.getTeamMembers(params);
      return formatMcpResponse(members, `Found ${members.length} team members`);
    } catch (error) {
      console.error('Error in getTeamMembers tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get all teams in the configured project
   */
  public async getTeams(): Promise<McpResponse> {
    try {
      const teams = await this.boardsSprintsService.getTeams();
      return formatMcpResponse(teams, `Found ${teams.length} teams`);
    } catch (error) {
      console.error('Error in getTeams tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const BoardsSprintsToolMethods = getClassMethods(BoardsSprintsTools.prototype);