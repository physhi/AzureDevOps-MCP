import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { ProjectService } from '../Services/ProjectService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  ListProjectsParams,
  GetProjectDetailsParams,
  CreateProjectParams,
  GetAreasParams,
  GetIterationsParams,
  CreateAreaParams,
  CreateIterationParams,
  GetProcessesParams,
  GetWorkItemTypesParams,
  GetWorkItemTypeFieldsParams
} from '../Interfaces/ProjectManagement';
import getClassMethods from "../utils/getClassMethods";
import {
  formatFullDate,
  truncateText,
  markdownTable
} from '../utils/formatHelpers';

export class ProjectTools {
  private projectService: ProjectService;

  constructor(config: AzureDevOpsConfig) {
    this.projectService = new ProjectService(config);
  }

  /**
   * List all projects
   */
  public async listProjects(params: ListProjectsParams): Promise<McpResponse> {
    try {
      const projects = await this.projectService.listProjects(params);
      const items = Array.isArray(projects) ? projects : [];

      if (items.length === 0) {
        return formatMcpResponse(projects, `## Projects\n\nNo projects found.`);
      }

      let md = `## Projects\n\n**${items.length} project${items.length !== 1 ? 's' : ''}**\n\n`;
      const rows = items.map((p: any) => [
        p.name || 'N/A',
        p.id || 'N/A',
        p.state || '-',
        p.visibility || '-'
      ]);
      md += markdownTable(['Name', 'ID', 'State', 'Visibility'], rows);

      return formatMcpResponse(projects, md, false, true);
    } catch (error) {
      console.error('Error in listProjects tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get project details
   */
  public async getProjectDetails(params: GetProjectDetailsParams): Promise<McpResponse> {
    try {
      const project = await this.projectService.getProjectDetails(params);

      let md = `## Project: ${project.name || 'Unknown'}\n\n`;
      if (project.description) md += `${truncateText(project.description, 200)}\n\n`;
      md += `**ID:** ${project.id || 'N/A'}\n`;
      md += `**State:** ${project.state || 'N/A'}\n`;
      md += `**Visibility:** ${project.visibility || 'N/A'}\n`;
      if (project.capabilities?.versioncontrol?.sourceControlType) {
        md += `**Source Control:** ${project.capabilities.versioncontrol.sourceControlType}\n`;
      }
      if (project.capabilities?.processTemplate?.templateName) {
        md += `**Process Template:** ${project.capabilities.processTemplate.templateName}\n`;
      }
      if (project.lastUpdateTime) {
        md += `**Last Updated:** ${formatFullDate(project.lastUpdateTime)}\n`;
      }

      return formatMcpResponse(project, md, false, true);
    } catch (error) {
      console.error('Error in getProjectDetails tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a project
   */
  public async createProject(params: CreateProjectParams): Promise<McpResponse> {
    try {
      const project = await this.projectService.createProject(params);

      const md = `## ✅ Project Creation Initiated\n\n**Name:** ${params.name}\n**ID:** ${project.id || 'pending'}\n\n💡 Project creation is asynchronous. Use \`getProjectDetails\` to check status.`;

      return formatMcpResponse(project, md, false, true);
    } catch (error) {
      console.error('Error in createProject tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get areas
   */
  public async getAreas(params: GetAreasParams): Promise<McpResponse> {
    try {
      const areas = await this.projectService.getAreas(params);

      let md = `## Areas\n\n**Project:** \`${params.projectId}\`\n\n`;

      const formatAreaTree = (node: any, indent: number = 0): string => {
        let result = '';
        const prefix = indent > 0 ? '  '.repeat(indent) + '└─ ' : '';
        const name = node.name || 'N/A';
        result += `${prefix}📁 ${name}`;
        if (node.id) result += ` (ID: ${node.id})`;
        result += '\n';
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any) => {
            result += formatAreaTree(child, indent + 1);
          });
        }
        return result;
      };

      if (areas && typeof areas === 'object') {
        md += '```\n';
        if (Array.isArray(areas)) {
          areas.forEach((a: any) => { md += formatAreaTree(a); });
        } else {
          md += formatAreaTree(areas);
        }
        md += '```\n';
      }

      return formatMcpResponse(areas, md, false, true);
    } catch (error) {
      console.error('Error in getAreas tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get iterations
   */
  public async getIterations(params: GetIterationsParams): Promise<McpResponse> {
    try {
      const iterations = await this.projectService.getIterations(params);

      let md = `## Iterations\n\n**Project:** \`${params.projectId}\`\n\n`;

      const flattenIterations = (node: any, list: any[] = []): any[] => {
        if (node.hasChildren === false || (!node.children && node.name)) {
          list.push(node);
        }
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any) => flattenIterations(child, list));
        }
        return list;
      };

      let iterList: any[] = [];
      if (Array.isArray(iterations)) {
        iterList = iterations;
      } else if (iterations?.children) {
        iterList = flattenIterations(iterations);
      } else if (iterations?.name) {
        iterList = [iterations];
      }

      if (iterList.length === 0) {
        md += `No iterations found.\n\n💡 Use \`createIteration\` to create iterations.`;
      } else {
        const rows = iterList.map((i: any) => [
          i.name || 'N/A',
          i.attributes?.startDate ? formatFullDate(i.attributes.startDate) : '-',
          i.attributes?.finishDate ? formatFullDate(i.attributes.finishDate) : '-',
          i.attributes?.timeFrame || '-'
        ]);
        md += markdownTable(['Name', 'Start', 'End', 'TimeFrame'], rows);
      }

      return formatMcpResponse(iterations, md, false, true);
    } catch (error) {
      console.error('Error in getIterations tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create area
   */
  public async createArea(params: CreateAreaParams): Promise<McpResponse> {
    try {
      const area = await this.projectService.createArea(params);

      let md = `## ✅ Area Created\n\n**Name:** ${params.name}\n`;
      if (params.parentPath) md += `**Parent:** ${params.parentPath}\n`;
      md += `**Project:** ${params.projectId}\n`;
      if (area.path) md += `**Full Path:** ${area.path}\n`;
      if (area.id) md += `**ID:** ${area.id}\n`;

      return formatMcpResponse(area, md, false, true);
    } catch (error) {
      console.error('Error in createArea tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create iteration
   */
  public async createIteration(params: CreateIterationParams): Promise<McpResponse> {
    try {
      const iteration = await this.projectService.createIteration(params);

      let md = `## ✅ Iteration Created\n\n**Name:** ${params.name}\n`;
      if (params.parentPath) md += `**Parent:** ${params.parentPath}\n`;
      md += `**Project:** ${params.projectId}\n`;
      if (params.startDate) md += `**Start:** ${formatFullDate(params.startDate)}\n`;
      if (params.finishDate) md += `**End:** ${formatFullDate(params.finishDate)}\n`;
      if (iteration.path) md += `**Full Path:** ${iteration.path}\n`;
      if (iteration.id) md += `**ID:** ${iteration.id}\n`;

      return formatMcpResponse(iteration, md, false, true);
    } catch (error) {
      console.error('Error in createIteration tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get processes
   */
  public async getProcesses(params: GetProcessesParams): Promise<McpResponse> {
    try {
      const processes = await this.projectService.getProcesses(params);
      const items = Array.isArray(processes) ? processes : [];

      if (items.length === 0) {
        return formatMcpResponse(processes, `## Processes\n\nNo processes found.`);
      }

      let md = `## Processes\n\n**${items.length} process${items.length !== 1 ? 'es' : ''}**\n\n`;
      const rows = items.map((p: any) => [
        p.name || 'N/A',
        p.typeId || p.id || 'N/A',
        truncateText(p.description || '-', 40)
      ]);
      md += markdownTable(['Name', 'ID', 'Description'], rows);

      return formatMcpResponse(processes, md, false, true);
    } catch (error) {
      console.error('Error in getProcesses tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get work item types
   */
  public async getWorkItemTypes(params: GetWorkItemTypesParams): Promise<McpResponse> {
    try {
      const types = await this.projectService.getWorkItemTypes(params);
      const items = Array.isArray(types) ? types : [];

      if (items.length === 0) {
        return formatMcpResponse(types, `## Work Item Types\n\nNo work item types found for process \`${params.processId}\`.`);
      }

      let md = `## Work Item Types\n\n**${items.length} type${items.length !== 1 ? 's' : ''}** for process \`${params.processId}\`\n\n`;
      const rows = items.map((t: any) => [
        t.name || 'N/A',
        t.referenceName || t.id || 'N/A',
        t.color ? `🟣 ${t.color}` : '-'
      ]);
      md += markdownTable(['Name', 'Reference Name', 'Color'], rows);

      return formatMcpResponse(types, md, false, true);
    } catch (error) {
      console.error('Error in getWorkItemTypes tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get work item type fields
   */
  public async getWorkItemTypeFields(params: GetWorkItemTypeFieldsParams): Promise<McpResponse> {
    try {
      const fields = await this.projectService.getWorkItemTypeFields(params);
      const items = Array.isArray(fields) ? fields : [];

      if (items.length === 0) {
        return formatMcpResponse(fields, `## Work Item Type Fields\n\nNo fields found for type \`${params.witRefName}\`.`);
      }

      let md = `## Work Item Type Fields\n\n**${items.length} field${items.length !== 1 ? 's' : ''}** for \`${params.witRefName}\`\n\n`;
      const rows = items.map((f: any) => [
        f.name || 'N/A',
        f.referenceName || f.id || 'N/A',
        f.type || '-'
      ]);
      md += markdownTable(['Name', 'Reference Name', 'Type'], rows);

      return formatMcpResponse(fields, md, false, true);
    } catch (error) {
      console.error('Error in getWorkItemTypeFields tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const ProjectToolMethods = getClassMethods(ProjectTools.prototype);
