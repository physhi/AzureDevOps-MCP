import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { GitService } from '../Services/GitService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  ListRepositoriesParams,
  GetRepositoryParams,
  CreateRepositoryParams,
  ListBranchesParams,
  SearchCodeParams,
  BrowseRepositoryParams,
  GetFileContentParams,
  GetCommitHistoryParams,
  ListPullRequestsParams,
  CreatePullRequestParams,
  GetPullRequestParams,
  GetPullRequestCommentsParams,
  ApprovePullRequestParams,
  MergePullRequestParams,
  AddPullRequestInlineCommentParams,
  AddPullRequestFileCommentParams,
  AddPullRequestCommentParams,
  GetPullRequestFileChangesParams,
  GetPullRequestChangesCountParams,
  GetAllPullRequestChangesParams
} from '../Interfaces/CodeAndRepositories';
import getClassMethods from "../utils/getClassMethods";

export class GitTools {
  private gitService: GitService;

  constructor(config: AzureDevOpsConfig) {
    this.gitService = new GitService(config);
  }

  /**
   * List all repositories
   */
  public async listRepositories(params: ListRepositoriesParams): Promise<McpResponse> {
    try {
      const repositories = await this.gitService.listRepositories(params);
      const formattedTable = this.formatRepositoriesTable(repositories);
      return formatMcpResponse(repositories, formattedTable);
    } catch (error) {
      console.error('Error in listRepositories tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats repositories data into a readable table format
   */
  private formatRepositoriesTable(repositories: any[]): string {
    if (!repositories || repositories.length === 0) {
      return "No repositories found.";
    }

    // Table header
    let table = "## Repositories\n\n";
    table += "| Repository Name | Repository Id | Repository URL |\n";
    table += "|-----------------|---------------|----------------|\n";

    // Table rows
    repositories.forEach(repo => {
      const name = repo.name || 'N/A';
      const id = repo.id || 'N/A';
      const url = repo.webUrl || repo.remoteUrl || 'N/A';
      
      table += `| ${name} | ${id} | ${url} |\n`;
    });

    table += `\n**Total repositories:** ${repositories.length}`;
    
    return table;
  }

  /**
   * Get repository details
   */
  public async getRepository(params: GetRepositoryParams): Promise<McpResponse> {
    try {
      const repository = await this.gitService.getRepository(params);
      return formatMcpResponse(repository, `Repository details for ${repository.name}`);
    } catch (error) {
      console.error('Error in getRepository tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a repository
   */
  public async createRepository(params: CreateRepositoryParams): Promise<McpResponse> {
    try {
      const repository = await this.gitService.createRepository(params);
      return formatMcpResponse(repository, `Created repository: ${repository.name}`);
    } catch (error) {
      console.error('Error in createRepository tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * List branches
   */
  public async listBranches(params: ListBranchesParams): Promise<McpResponse> {
    try {
      const branches = await this.gitService.listBranches(params);
      return formatMcpResponse(branches, `Found ${branches.length} branches`);
    } catch (error) {
      console.error('Error in listBranches tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Search code
   */
  public async searchCode(params: SearchCodeParams): Promise<McpResponse> {
    try {
      const items = await this.gitService.searchCode(params);
      return formatMcpResponse(items, `Found ${items.length} matching files`);
    } catch (error) {
      console.error('Error in searchCode tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Browse repository
   */
  public async browseRepository(params: BrowseRepositoryParams): Promise<McpResponse> {
    try {
      const items = await this.gitService.browseRepository(params);
      return formatMcpResponse(items, `Found ${items.length} items in repository`);
    } catch (error) {
      console.error('Error in browseRepository tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get file content
   */
  public async getFileContent(params: GetFileContentParams): Promise<McpResponse> {
    try {
      const file = await this.gitService.getFileContent(params);
      return formatMcpResponse(file, `Content of file: ${params.path}`);
    } catch (error) {
      console.error('Error in getFileContent tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get commit history
   */
  public async getCommitHistory(params: GetCommitHistoryParams): Promise<McpResponse> {
    try {
      const commits = await this.gitService.getCommitHistory(params);
      return formatMcpResponse(commits, `Found ${commits.length} commits`);
    } catch (error) {
      console.error('Error in getCommitHistory tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * List pull requests
   */
  public async listPullRequests(params: ListPullRequestsParams): Promise<McpResponse> {
    try {
      const pullRequests = await this.gitService.getPullRequests(params);
      return formatMcpResponse(pullRequests, `Found ${pullRequests.length} pull requests`);
    } catch (error) {
      console.error('Error in listPullRequests tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create pull request
   */
  public async createPullRequest(params: CreatePullRequestParams): Promise<McpResponse> {
    try {
      const pullRequest = await this.gitService.createPullRequest(params);
      return formatMcpResponse(pullRequest, `Created pull request: ${pullRequest.pullRequestId}`);
    } catch (error) {
      console.error('Error in createPullRequest tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get pull request by ID
   */
  public async getPullRequest(params: GetPullRequestParams): Promise<McpResponse> {
    try {
      const pullRequest = await this.gitService.getPullRequest(params);
      const formattedText = this.formatPullRequestText(pullRequest);
      return formatMcpResponse(pullRequest, formattedText);
    } catch (error) {
      console.error('Error in getPullRequest tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull request data into readable text format
   */
  private formatPullRequestText(pullRequest: any): string {
    return `---
# Title

${pullRequest.title || 'N/A'}

## Author:

Name: ${pullRequest.createdBy?.displayName || 'N/A'}

## Description

${pullRequest.description || 'N/A'}

## Repository Detials

ProjectId: ${pullRequest.repository?.project?.id || 'N/A'}
ProjectName: ${pullRequest.repository?.project?.name || 'N/A'}

Name: ${pullRequest.repository?.name || 'N/A'}
Id: ${pullRequest.repository?.id || 'N/A'}

## Branch Data

SourceBranch: ${pullRequest.sourceRefName || 'N/A'}
TargetBranch: ${pullRequest.targetRefName || 'N/A'}

SourceCommitId: ${pullRequest.lastMergeSourceCommit?.commitId || 'N/A'}
TargetCommitId: ${pullRequest.lastMergeTargetCommit?.commitId || 'N/A'}
---`;
  }

  /**
   * Get pull request comments
   */
  public async getPullRequestComments(params: GetPullRequestCommentsParams): Promise<McpResponse> {
    try {
      const comments = await this.gitService.getPullRequestComments(params);
      const formattedDocument = this.formatPullRequestCommentsDocument(comments, params.pullRequestId);
      return formatMcpResponse(comments, formattedDocument);
    } catch (error) {
      console.error('Error in getPullRequestComments tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull request comments data into a readable document format
   */
  private formatPullRequestCommentsDocument(data: any, pullRequestId: number): string {
    if (!data || (!Array.isArray(data) && !data.length && !data.value)) {
      return `# Pull Request ${pullRequestId} - Comments\n\nNo comments found in this pull request.`;
    }

    // Handle both array and object with value property
    const threads = Array.isArray(data) ? data : (data.value || []);
    
    if (threads.length === 0) {
      return `# Pull Request ${pullRequestId} - Comments\n\nNo comments found in this pull request.`;
    }

    let document = `# Pull Request ${pullRequestId} - Comments & Activity\n\n`;
    document += `**Total threads:** ${threads.length}\n\n`;
    document += `---\n\n`;

    threads.forEach((thread: any, index: number) => {
      document += this.formatCommentThread(thread, index + 1);
      document += `\n---\n\n`;
    });

    return document;
  }

  /**
   * Formats a single comment thread
   */
  private formatCommentThread(thread: any, threadNumber: number): string {
    const threadId = thread.id || 'Unknown';
    const publishedDate = thread.publishedDate ? new Date(thread.publishedDate).toLocaleString() : 'Unknown';
    const lastUpdated = thread.lastUpdatedDate ? new Date(thread.lastUpdatedDate).toLocaleString() : 'Unknown';
    
    let threadDoc = `## Thread ${threadNumber} (ID: ${threadId})\n\n`;
    threadDoc += `**Published:** ${publishedDate}  \n`;
    threadDoc += `**Last Updated:** ${lastUpdated}  \n`;

    // Determine thread type and context
    const threadType = thread.properties?.CodeReviewThreadType?.$value || 'Unknown';
    threadDoc += `**Type:** ${this.getThreadTypeDescription(threadType)}  \n`;

    // Add file context if available
    if (thread.threadContext?.filePath) {
      threadDoc += `**File:** \`${thread.threadContext.filePath}\`  \n`;
      if (thread.threadContext.rightFileStart && thread.threadContext.rightFileEnd) {
        threadDoc += `**Lines:** ${thread.threadContext.rightFileStart.line}-${thread.threadContext.rightFileEnd.line}  \n`;
      }
    }

    threadDoc += `\n`;

    // Format comments in the thread
    if (thread.comments && thread.comments.length > 0) {
      threadDoc += `### Comments:\n\n`;
      
      thread.comments.forEach((comment: any, commentIndex: number) => {
        threadDoc += this.formatSingleComment(comment, commentIndex + 1, thread.identities);
      });
    }

    // Add additional context based on thread type
    threadDoc += this.formatThreadSpecificInfo(thread, threadType);

    return threadDoc;
  }

  /**
   * Formats a single comment
   */
  private formatSingleComment(comment: any, commentNumber: number, identities: any): string {
    const author = comment.author?.displayName || 'Unknown Author';
    const content = comment.content || 'No content';
    const publishedDate = comment.publishedDate ? new Date(comment.publishedDate).toLocaleString() : 'Unknown';
    const isReply = comment.parentCommentId > 0;
    
    let commentDoc = `${isReply ? '  ' : ''}**${isReply ? '↳ Reply' : 'Comment'} ${commentNumber}** by **${author}**  \n`;
    commentDoc += `${isReply ? '  ' : ''}*${publishedDate}*\n\n`;
    commentDoc += `${isReply ? '  ' : ''}> ${content}\n\n`;

    // Add likes if any
    if (comment.usersLiked && comment.usersLiked.length > 0) {
      commentDoc += `${isReply ? '  ' : ''}👍 *${comment.usersLiked.length} like(s)*\n\n`;
    }

    return commentDoc;
  }

  /**
   * Gets a human-readable description for thread types
   */
  private getThreadTypeDescription(threadType: string): string {
    switch (threadType) {
      case 'RefUpdate': return 'Branch Update';
      case 'ReviewersUpdate': return 'Reviewers Change';
      case 'IsDraftUpdate': return 'Draft Status Change';
      case 'CodeReview': return 'Code Review Comment';
      case 'General': return 'General Comment';
      default: return threadType || 'Unknown';
    }
  }

  /**
   * Formats thread-specific information
   */
  private formatThreadSpecificInfo(thread: any, threadType: string): string {
    let info = '';

    if (threadType === 'RefUpdate' && thread.properties) {
      const refName = thread.properties.CodeReviewRefName?.$value;
      const commitCount = thread.properties.CodeReviewRefNewCommitsCount?.$value;
      const newCommits = thread.properties.CodeReviewRefNewCommits?.$value;
      
      if (refName) {
        info += `**Updated Branch:** \`${refName}\`  \n`;
      }
      if (commitCount) {
        info += `**New Commits:** ${commitCount}  \n`;
      }
      if (newCommits) {
        const commits = newCommits.split(';');
        info += `**Commit IDs:**\n`;
        commits.forEach((commit: string) => {
          info += `  - \`${commit.substring(0, 8)}...\`\n`;
        });
      }
      info += `\n`;
    }

    if (threadType === 'ReviewersUpdate' && thread.properties) {
      const added = thread.properties.CodeReviewReviewersUpdatedNumAdded?.$value;
      const removed = thread.properties.CodeReviewReviewersUpdatedNumRemoved?.$value;
      
      if (added > 0) {
        info += `**Reviewers Added:** ${added}  \n`;
      }
      if (removed > 0) {
        info += `**Reviewers Removed:** ${removed}  \n`;
      }
      info += `\n`;
    }

    return info;
  }

  /**
   * Approve pull request
   */
  public async approvePullRequest(params: ApprovePullRequestParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.approvePullRequest(params);
      return formatMcpResponse(result, `Approved pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in approvePullRequest tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Merge pull request
   */
  public async mergePullRequest(params: MergePullRequestParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.mergePullRequest(params);
      return formatMcpResponse(result, `Merged pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in mergePullRequest tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Add inline comment to pull request
   */
  public async addPullRequestInlineComment(params: AddPullRequestInlineCommentParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.addPullRequestInlineComment(params);
      return formatMcpResponse(result, `Added inline comment to pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in addPullRequestInlineComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Add file comment to pull request
   */
  public async addPullRequestFileComment(params: AddPullRequestFileCommentParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.addPullRequestFileComment(params);
      return formatMcpResponse(result, `Added file comment to pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in addPullRequestFileComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Add general comment to pull request
   */
  public async addPullRequestComment(params: AddPullRequestCommentParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.addPullRequestComment(params);
      return formatMcpResponse(result, `Added comment to pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in addPullRequestComment tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get pull request file changes
   */
  public async getPullRequestFileChanges(params: GetPullRequestFileChangesParams): Promise<McpResponse> {
    try {
      const changes = await this.gitService.getPullRequestFileChanges(params);
      return formatMcpResponse(changes, `Retrieved changes for file in pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in getPullRequestFileChanges tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get pull request changes count
   */
  public async getPullRequestChangesCount(params: GetPullRequestChangesCountParams): Promise<McpResponse> {
    try {
      const count = await this.gitService.getPullRequestChangesCount(params);
      return formatMcpResponse(count, `Retrieved changes count for pull request ${params.pullRequestId}`);
    } catch (error) {
      console.error('Error in getPullRequestChangesCount tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get all pull request changes
   */
  public async getAllPullRequestChanges(params: GetAllPullRequestChangesParams): Promise<McpResponse> {
    try {
      const changes = await this.gitService.getAllPullRequestChanges(params);
      const formattedTable = this.formatPullRequestChangesTable(changes);
      return formatMcpResponse(changes, formattedTable);
    } catch (error) {
      console.error('Error in getAllPullRequestChanges tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull request changes data into a readable table format
   */
  private formatPullRequestChangesTable(data: any): string {
    if (!data || !data.changes || data.changes.length === 0) {
      return "No changes found in this pull request.";
    }

    const changes = data.changes;
    
    // Helper function to convert change type to readable string
    const getChangeTypeString = (changeType: number): string => {
      switch (changeType) {
        case 1: return 'Added';
        case 2: return 'Modified';
        case 3: return 'Deleted';
        default: return 'Unknown';
      }
    };

    // Helper function to get file extension for easier scanning
    const getFileExtension = (path: string): string => {
      const lastDot = path.lastIndexOf('.');
      return lastDot > -1 ? path.substring(lastDot) : '';
    };

    // Table header
    let table = `## Pull Request Changes\n\n`;
    table += "| # | Change Type | File Path | Extension |\n";
    table += "|---|-------------|-----------|----------|\n";

    // Table rows
    changes.forEach((change: any, index: number) => {
      const changeNum = (index + 1).toString();
      const changeType = getChangeTypeString(change.changeType);
      const filePath = change.item?.path || 'N/A';
      const extension = getFileExtension(filePath);
      
      table += `| ${changeNum} | ${changeType} | ${filePath} | ${extension} |\n`;
    });

    // Summary statistics
    const addedCount = changes.filter((c: any) => c.changeType === 1).length;
    const modifiedCount = changes.filter((c: any) => c.changeType === 2).length;
    const deletedCount = changes.filter((c: any) => c.changeType === 3).length;

    table += `\n**Summary:**\n`;
    table += `- **Total files changed:** ${data.totalCount || changes.length}\n`;
    table += `- **Added:** ${addedCount} files\n`;
    table += `- **Modified:** ${modifiedCount} files\n`;
    table += `- **Deleted:** ${deletedCount} files`;
    
    return table;
  }
}

export const GitToolMethods = getClassMethods(GitTools.prototype);