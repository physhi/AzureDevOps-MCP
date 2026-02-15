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
import {
  formatFullDate,
  formatRelativeDate,
  truncateText,
  markdownTable,
  getSprintTimeframeEmoji,
  getSprintTimeframeLabel
} from '../utils/formatHelpers';

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
      const items = Array.isArray(boards) ? boards : [];

      if (items.length === 0) {
        return formatMcpResponse(boards, `## Boards\n\nNo boards found.\n\n💡 Check your team settings or use \`getTeams\` to verify the team ID.`);
      }

      let md = `## Boards\n\n**${items.length} board${items.length !== 1 ? 's' : ''}**\n\n`;
      const rows = items.map((b: any) => [b.name || 'N/A', b.id || 'N/A']);
      md += markdownTable(['Name', 'ID'], rows);

      return formatMcpResponse(boards, md, false, true);
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
      const items = Array.isArray(columns) ? columns : [];

      if (items.length === 0) {
        return formatMcpResponse(columns, `## Board Columns\n\nNo columns found for board \`${params.boardId}\`.\n\n💡 Verify the board ID using \`getBoards\`.`);
      }

      let md = `## Board Columns\n\n**${items.length} columns** for board \`${params.boardId}\`\n\n`;
      const rows = items.map((c: any) => [
        c.name || 'N/A',
        c.columnType || c.stateMappings ? 'Mapped' : 'N/A',
        c.itemLimit ? String(c.itemLimit) : '-'
      ]);
      md += markdownTable(['Name', 'Type', 'WIP Limit'], rows);

      return formatMcpResponse(columns, md, false, true);
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
      const itemList = Array.isArray(items) ? items : (items?.value || []);

      if (itemList.length === 0) {
        return formatMcpResponse(items, `## Board Items\n\nNo items found on board \`${params.boardId}\`.\n\n💡 The board may be empty or items may not be assigned to columns.`);
      }

      let md = `## Board Items\n\n**${itemList.length} item${itemList.length !== 1 ? 's' : ''}** on board \`${params.boardId}\`\n\n`;

      // Group by column if possible
      const byColumn: Record<string, any[]> = {};
      itemList.forEach((item: any) => {
        const col = item.boardColumn || item.column?.name || 'Unknown';
        if (!byColumn[col]) byColumn[col] = [];
        byColumn[col].push(item);
      });

      if (Object.keys(byColumn).length > 1) {
        for (const [col, colItems] of Object.entries(byColumn)) {
          md += `### ${col} (${colItems.length})\n\n`;
          const rows = colItems.map((i: any) => [
            `#${i.id || i.workItem?.id || 'N/A'}`,
            truncateText(i.title || i.workItem?.fields?.['System.Title'] || 'N/A', 60),
            i.state || i.workItem?.fields?.['System.State'] || '-'
          ]);
          md += markdownTable(['ID', 'Title', 'State'], rows);
          md += '\n\n';
        }
      } else {
        const rows = itemList.map((i: any) => [
          `#${i.id || i.workItem?.id || 'N/A'}`,
          truncateText(i.title || i.workItem?.fields?.['System.Title'] || 'N/A', 60),
          i.state || i.workItem?.fields?.['System.State'] || '-',
          i.boardColumn || i.column?.name || '-'
        ]);
        md += markdownTable(['ID', 'Title', 'State', 'Column'], rows);
      }

      return formatMcpResponse(items, md, false, true);
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

      const md = `## ✅ Card Moved\n\n**#${params.workItemId}** → Column \`${params.columnId}\`\n\n💡 Use \`getBoardItems\` to see the updated board state.`;

      return formatMcpResponse(result, md, false, true);
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
      const items = Array.isArray(sprints) ? sprints : [];

      if (items.length === 0) {
        return formatMcpResponse(sprints, `## Sprints\n\nNo sprints found.\n\n💡 Use \`createIteration\` to create sprint iterations.`);
      }

      const currentCount = items.filter((s: any) => getSprintTimeframeLabel(s.attributes?.timeFrame) === 'Current').length;
      const pastCount = items.filter((s: any) => getSprintTimeframeLabel(s.attributes?.timeFrame) === 'Past').length;
      const futureCount = items.filter((s: any) => getSprintTimeframeLabel(s.attributes?.timeFrame) === 'Future').length;

      let md = `## Sprints\n\n**${items.length} sprints**`;
      const parts: string[] = [];
      if (currentCount > 0) parts.push(`${currentCount} current`);
      if (pastCount > 0) parts.push(`${pastCount} past`);
      if (futureCount > 0) parts.push(`${futureCount} future`);
      if (parts.length > 0) md += ` | ${parts.join(', ')}`;
      md += '\n\n';

      const rows = items.map((s: any) => {
        const tf = s.attributes?.timeFrame;
        const emoji = getSprintTimeframeEmoji(tf);
        const label = getSprintTimeframeLabel(tf);
        return [
          s.name || 'N/A',
          s.attributes?.startDate ? formatFullDate(s.attributes.startDate) : '-',
          s.attributes?.finishDate ? formatFullDate(s.attributes.finishDate) : '-',
          `${emoji} ${label}`
        ];
      });
      md += markdownTable(['Name', 'Start', 'End', 'Status'], rows);

      return formatMcpResponse(sprints, md, false, true);
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

      if (!sprint) {
        return formatMcpResponse(sprint, `## Current Sprint\n\nNo current sprint found.\n\n💡 Use \`getSprints\` to see all sprints or \`createIteration\` to create one.`);
      }

      const startDate = sprint.attributes?.startDate;
      const endDate = sprint.attributes?.finishDate;

      let md = `## 🏃 Current Sprint\n\n`;
      md += `**${sprint.name}**\n\n`;

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const daysElapsed = totalDays - daysRemaining;
        const pct = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0;

        md += `**Dates:** ${formatFullDate(startDate)} → ${formatFullDate(endDate)}\n`;
        md += `**Progress:** ${daysElapsed}/${totalDays} days (${pct}%) | **${daysRemaining} days remaining**\n`;
      }

      if (sprint.id) md += `**ID:** ${sprint.id}\n`;
      if (sprint.path) md += `**Path:** ${sprint.path}\n`;

      return formatMcpResponse(sprint, md, false, true);
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
      const items = workItems?.workItems || workItems?.workItemRelations || [];
      const itemList = Array.isArray(items) ? items : [];

      if (itemList.length === 0) {
        return formatMcpResponse(workItems, `## Sprint Work Items\n\nNo work items found in sprint \`${params.sprintId}\`.\n\n💡 Items may not be assigned to this sprint yet.`);
      }

      let md = `## Sprint Work Items\n\n**${itemList.length} item${itemList.length !== 1 ? 's' : ''}** in sprint \`${params.sprintId}\`\n\n`;

      const rows = itemList.map((item: any) => {
        const wi = item.target || item;
        const id = wi.id || wi.workItem?.id || 'N/A';
        const url = wi.url || wi.workItem?.url || '-';
        return [`#${id}`, url !== '-' ? `[Link](${url})` : '-'];
      });
      md += markdownTable(['ID', 'URL'], rows);

      md += `\n\n💡 Use \`getWorkItemById\` with any ID to see full details.`;

      return formatMcpResponse(workItems, md, false, true);
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

      let md = `## Sprint Capacity\n\n**Sprint:** \`${params.sprintId}\`\n\n`;

      // Handle daysOff and teamSettings if present
      if (capacity?.daysOff) {
        const daysOff = Array.isArray(capacity.daysOff) ? capacity.daysOff : [];
        md += `**Team Days Off:** ${daysOff.length > 0 ? daysOff.length + ' days' : 'None'}\n`;
      }

      if (capacity?.teamMembers || capacity?.value) {
        const members = capacity.teamMembers || capacity.value || [];
        const memberList = Array.isArray(members) ? members : [];
        if (memberList.length > 0) {
          md += `**Team Members with Capacity:** ${memberList.length}\n\n`;
          const rows = memberList.map((m: any) => {
            const name = m.teamMember?.displayName || m.displayName || 'Unknown';
            const activities = m.activities || [];
            const actStr = activities.map((a: any) => `${a.name || 'General'}: ${a.capacityPerDay || 0}h/day`).join(', ') || '-';
            return [name, actStr];
          });
          md += markdownTable(['Member', 'Capacity'], rows);
        }
      } else {
        md += `*No capacity data available.*`;
      }

      return formatMcpResponse(capacity, md, false, true);
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
      const response = await this.boardsSprintsService.getTeamMembers(params);
      const members = response.value || response;
      const memberList = Array.isArray(members) ? members : [];

      if (memberList.length === 0) {
        return formatMcpResponse(response, `## Team Members\n\nNo team members found.\n\n💡 Use \`getTeams\` to verify the team ID.`);
      }

      let md = `## Team Members\n\n**${memberList.length} member${memberList.length !== 1 ? 's' : ''}**\n\n`;

      const rows = memberList.map((m: any) => {
        const identity = m.identity || m;
        const name = identity.displayName || 'Unknown';
        const email = identity.uniqueName || identity.mailAddress || '-';
        const isAdmin = m.isTeamAdmin ? '✅' : '-';
        return [name, email, isAdmin];
      });
      md += markdownTable(['Name', 'Email', 'Admin'], rows);

      return formatMcpResponse(response, md, false, true);
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
      const items = Array.isArray(teams) ? teams : [];

      if (items.length === 0) {
        return formatMcpResponse(teams, `## Teams\n\nNo teams found.`);
      }

      let md = `## Teams\n\n**${items.length} team${items.length !== 1 ? 's' : ''}**\n\n`;

      const rows = items.map((t: any) => [
        t.name || 'N/A',
        t.id || 'N/A',
        truncateText(t.description || '-', 40)
      ]);
      md += markdownTable(['Name', 'ID', 'Description'], rows);

      return formatMcpResponse(teams, md, false, true);
    } catch (error) {
      console.error('Error in getTeams tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const BoardsSprintsToolMethods = getClassMethods(BoardsSprintsTools.prototype);
