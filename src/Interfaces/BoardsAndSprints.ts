/**
 * Interface for getting boards
 */
export interface GetBoardsParams {
  teamId?: string;
}

/**
 * Interface for getting board columns
 */
export interface GetBoardColumnsParams {
  teamId?: string;
  boardId: string;
}

/**
 * Interface for getting board items
 */
export interface GetBoardItemsParams {
  teamId?: string;
  boardId: string;
}

/**
 * Interface for moving a card on board
 */
export interface MoveCardOnBoardParams {
  teamId?: string;
  boardId: string;
  workItemId: number;
  columnId: string;
  position?: number;
}

/**
 * Interface for getting sprints
 */
export interface GetSprintsParams {
  teamId?: string;
}

/**
 * Interface for getting current sprint
 */
export interface GetCurrentSprintParams {
  teamId?: string;
}

/**
 * Interface for getting sprint work items
 */
export interface GetSprintWorkItemsParams {
  teamId?: string;
  sprintId: string;
}

/**
 * Interface for getting sprint capacity
 */
export interface GetSprintCapacityParams {
  teamId?: string;
  sprintId: string;
}

/**
 * Interface for getting team members
 */
export interface GetTeamMembersParams {
  teamId?: string;
}

/**
 * Interface for getting teams
 */
export interface GetTeamsParams {
  filter?: string;
  top?: number;
  skip?: number;
}
