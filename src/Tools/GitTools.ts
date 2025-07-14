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
      return formatMcpResponse(repository);
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
      return formatMcpResponse(repository);
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
      return formatMcpResponse(branches);
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
      return formatMcpResponse(items);
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
      return formatMcpResponse(items);
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
      return formatMcpResponse(file);
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
      return this.formatCommitHistoryResponse(commits, params);
    } catch (error) {
      console.error('Error in getCommitHistory tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Format commit history response with enhanced readability
   */
  private formatCommitHistoryResponse(commits: any[], params: GetCommitHistoryParams): McpResponse {
    if (!commits || commits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `## 📊 Commit History\n\n**No commits found** for the specified criteria.\n\n**Repository:** ${params.repositoryId}\n${params.itemPath ? `**File Path:** ${params.itemPath}\n` : ''}**Total commits:** 0`
          }
        ]
      };
    }

    // Helper function to format date in a readable way
    const formatDate = (dateString: string): string => {
      try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        let timeAgo = '';
        if (diffDays > 0) {
          timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
          timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMinutes > 0) {
          timeAgo = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
        } else {
          timeAgo = 'Just now';
        }

        const formatted = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `${formatted} (${timeAgo})`;
      } catch {
        return dateString;
      }
    };

    // Helper function to format commit message
    const formatCommitMessage = (message: string): { title: string, description: string } => {
      if (!message) return { title: 'No commit message', description: '' };
      
      const lines = message.trim().split('\n');
      const title = lines[0] || 'No commit message';
      const description = lines.slice(1).join('\n').trim();
      
      return { title, description };
    };

    // Helper function to format author
    const formatAuthor = (author: any): string => {
      if (!author) return 'Unknown';
      if (author.displayName) return author.displayName;
      if (author.name) return author.name;
      if (author.email) return author.email;
      return 'Unknown';
    };

    // Generate the formatted output
    let result = `## 📊 Commit History\n\n`;

    // Add header with metadata
    result += `**Repository:** ${params.repositoryId}\n`;
    if (params.itemPath) {
      result += `**File Path:** ${params.itemPath}\n`;
    }
    result += `**Total commits:** ${commits.length}\n`;
    if (params.top) {
      result += `**Showing:** Latest ${Math.min(params.top, commits.length)} commits\n`;
    }
    result += `\n---\n\n`;

    // Add each commit
    commits.forEach((commit, index) => {
      const { title, description } = formatCommitMessage(commit.comment);
      const author = formatAuthor(commit.author);
      const committer = formatAuthor(commit.committer);
      const commitDate = formatDate(commit.author?.date || commit.committer?.date);
      
      result += `### ${index + 1}. 🔸 ${title}\n\n`;

      // Commit metadata table
      result += `| Property | Value |\n`;
      result += `|----------|-------|\n`;
      result += `| **Commit ID** | \`${commit.commitId?.substring(0, 12) || 'Unknown'}...\` |\n`;
      result += `| **Author** | ${author} |\n`;
      if (committer && committer !== author) {
        result += `| **Committer** | ${committer} |\n`;
      }
      result += `| **Date** | ${commitDate} |\n`;
      if (commit.changeCounts) {
        const changes = commit.changeCounts;
        let changesSummary = [];
        if (changes.Add > 0) changesSummary.push(`${changes.Add} added`);
        if (changes.Edit > 0) changesSummary.push(`${changes.Edit} modified`);
        if (changes.Delete > 0) changesSummary.push(`${changes.Delete} deleted`);
        if (changesSummary.length > 0) {
          result += `| **Files Changed** | ${changesSummary.join(', ')} |\n`;
        }
      }

      // Add description if present
      if (description) {
        result += `\n**Description:**\n\`\`\`\n${description}\n\`\`\`\n`;
      }

      // Add remote URL if available
      if (commit.remoteUrl) {
        result += `\n📍 **[View Commit](${commit.remoteUrl})**\n`;
      }

      result += `\n---\n\n`;
    });

    // Add summary statistics
    const totalAuthors = new Set(commits.map(c => formatAuthor(c.author))).size;
    const dateRange = commits.length > 1 ? 
      `${formatDate(commits[commits.length - 1]?.author?.date || commits[commits.length - 1]?.committer?.date)} to ${formatDate(commits[0]?.author?.date || commits[0]?.committer?.date)}` :
      'Single commit';

    result += `## 📈 Summary\n\n`;
    result += `- **Total commits shown:** ${commits.length}\n`;
    result += `- **Contributors:** ${totalAuthors} author${totalAuthors > 1 ? 's' : ''}\n`;
    result += `- **Date range:** ${dateRange}\n`;

    if (params.skip && params.skip > 0) {
      result += `- **Pagination:** Skipped ${params.skip} commits\n`;
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
   * List pull requests
   */
  public async listPullRequests(params: ListPullRequestsParams): Promise<McpResponse> {
    try {
      const pullRequests = await this.gitService.getPullRequests(params);
      return formatMcpResponse(pullRequests);
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
      return formatMcpResponse(pullRequest);
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
      
      // Check if pullRequest is null or undefined
      if (!pullRequest) {
        return {
          content: [
            {
              type: "text",
              text: `## ❌ Pull Request Not Found\n\nPull request #${params.pullRequestId} was not found in repository '${params.repositoryId}'.\n\nPlease check:\n- The pull request ID is correct\n- The repository ID is correct\n- You have access permissions to the repository`
            }
          ]
        };
      }
      
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
      return formatMcpResponse(result);
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
      return formatMcpResponse(result);
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
      return formatMcpResponse(result, `✅ Inline comment added successfully to ${params.path} at line ${params.position.line}`);
    } catch (error: any) {
      console.error('Error in addPullRequestInlineComment tool:', error);
      
      // Provide enhanced user-friendly error responses
      if (error instanceof Error) {
        // File not in PR changes
        if (error.message.includes('not part of the changes')) {
          return {
            content: [
              {
                type: "text",
                text: `## ❌ Cannot Add Inline Comment\n\n${error.message}\n\n💡 **Next Steps:**\n\n1. Use \`getPullRequestFileChanges\` to see which files are available\n2. Check the exact file paths in the PR changes\n3. Ensure you're using the correct file path format`
              }
            ]
          };
        }
        
        // Line number or position issues
        if (error.message.includes('line number') || 
            error.message.includes('getPullRequestFileChanges') ||
            error.message.includes('line position')) {
          return {
            content: [
              {
                type: "text",
                text: `## ❌ Invalid Line Position\n\n${error.message}\n\n### 🔍 **How to Find the Correct Line:**\n\n\`\`\`\ngetPullRequestFileChanges repositoryId="${params.repositoryId}" pullRequestId=${params.pullRequestId} path="${params.path}"\n\`\`\`\n\nThis will show you:\n- The exact code diff for this file\n- Line numbers that can be commented on\n- Added/modified/deleted line ranges\n- The actual content at each line`
              }
            ]
          };
        }
      }
      
      return formatErrorResponse(error);
    }
  }

  /**
   * Add file comment to pull request
   */
  public async addPullRequestFileComment(params: AddPullRequestFileCommentParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.addPullRequestFileComment(params);
      return formatMcpResponse(result);
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
      return formatMcpResponse(result);
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
      const formattedContent = this.formatPullRequestFileChanges(changes);
      return formatMcpResponse(changes, formattedContent);
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
      return formatMcpResponse(count);
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
      return lastDot > -1 ? path.substring(lastDot) : 'No ext';
    };

    // Helper function to format file size
    const formatFileSize = (sizeInBytes: number): string => {
      if (!sizeInBytes || sizeInBytes === 0) return 'N/A';
      if (sizeInBytes < 1024) return `${sizeInBytes}B`;
      if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)}KB`;
      return `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    // Helper function to get directory path
    const getDirectory = (path: string): string => {
      const lastSlash = path.lastIndexOf('/');
      return lastSlash > -1 ? path.substring(0, lastSlash) : '/';
    };

    // Enhanced table header with more information
    let table = `## Pull Request Changes (${data.totalCount || changes.length} files)\n\n`;
    table += "| # | Change | File Path | Size | Directory | Extension | Tracking ID |\n";
    table += "|---|--------|-----------|------|-----------|-----------|-------------|\n";

    // Table rows with enhanced information
    changes.forEach((change: any, index: number) => {
      const changeNum = (index + 1).toString();
      const changeType = getChangeTypeString(change.changeType);
      const filePath = change.item?.path || 'N/A';
      const fileSize = formatFileSize(change.item?.size);
      const directory = getDirectory(filePath).substring(0, 40) + (getDirectory(filePath).length > 40 ? '...' : '');
      const extension = getFileExtension(filePath);
      const trackingId = change.changeTrackingId ? change.changeTrackingId.toString().substring(0, 8) : 'N/A';
      
      table += `| ${changeNum} | ${changeType} | ${filePath} | ${fileSize} | ${directory} | ${extension} | ${trackingId} |\n`;
    });

    // Enhanced summary statistics
    const addedCount = changes.filter((c: any) => c.changeType === 1).length;
    const modifiedCount = changes.filter((c: any) => c.changeType === 2).length;
    const deletedCount = changes.filter((c: any) => c.changeType === 3).length;

    // File type analysis
    const fileTypes = new Map<string, { count: number; added: number; modified: number; deleted: number }>();
    const directories = new Map<string, { count: number; added: number; modified: number; deleted: number }>();
    
    changes.forEach((change: any) => {
      const ext = getFileExtension(change.item?.path || '');
      const dir = getDirectory(change.item?.path || '');
      const changeType = change.changeType;
      
      // File type statistics
      if (!fileTypes.has(ext)) {
        fileTypes.set(ext, { count: 0, added: 0, modified: 0, deleted: 0 });
      }
      const typeStats = fileTypes.get(ext)!;
      typeStats.count++;
      if (changeType === 1) typeStats.added++;
      else if (changeType === 2) typeStats.modified++;
      else if (changeType === 3) typeStats.deleted++;
      
      // Directory statistics (top-level only)
      const topDir = dir.split('/')[1] || '/';
      if (!directories.has(topDir)) {
        directories.set(topDir, { count: 0, added: 0, modified: 0, deleted: 0 });
      }
      const dirStats = directories.get(topDir)!;
      dirStats.count++;
      if (changeType === 1) dirStats.added++;
      else if (changeType === 2) dirStats.modified++;
      else if (changeType === 3) dirStats.deleted++;
    });

    table += `\n**📊 Summary Statistics:**\n`;
    table += `- **Total files:** ${data.totalCount || changes.length}\n`;
    table += `- **Added:** ${addedCount} files 🟢\n`;
    table += `- **Modified:** ${modifiedCount} files 🟡\n`;
    table += `- **Deleted:** ${deletedCount} files 🔴\n`;

    // File type breakdown (top 5)
    const sortedTypes = Array.from(fileTypes.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    
    if (sortedTypes.length > 0) {
      table += `\n**📁 File Types (Top 5):**\n`;
      sortedTypes.forEach(([ext, stats]) => {
        table += `- **${ext}**: ${stats.count} files (${stats.added}🟢 ${stats.modified}🟡 ${stats.deleted}🔴)\n`;
      });
    }

    // Directory breakdown (top 5)
    const sortedDirs = Array.from(directories.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    
    if (sortedDirs.length > 0) {
      table += `\n**📂 Most Affected Directories:**\n`;
      sortedDirs.forEach(([dir, stats]) => {
        table += `- **${dir}**: ${stats.count} files (${stats.added}🟢 ${stats.modified}🟡 ${stats.deleted}🔴)\n`;
      });
    }

    // Total size calculation (for added/modified files)
    const totalSize = changes
      .filter((c: any) => c.changeType === 1 || c.changeType === 2)
      .reduce((sum: number, c: any) => sum + (c.item?.size || 0), 0);
    
    if (totalSize > 0) {
      table += `\n**💾 Total Size Impact:** ${formatFileSize(totalSize)} (added/modified files)\n`;
    }
    
    return table;
  }

  /**
   * Formats pull request file changes data into a detailed, readable format with diff content
   */
  private formatPullRequestFileChanges(data: any): string {
    if (!data || !data.changeEntries || data.changeEntries.length === 0) {
      return "No file changes found in this pull request.";
    }

    const changes = data.changeEntries;
    
    // Helper function to convert change type to readable string with emoji
    const getChangeTypeString = (changeType: number): string => {
      switch (changeType) {
        case 1: return '🟢 Added';
        case 2: return '🟡 Modified';
        case 3: return '🔴 Deleted';
        default: return '❓ Unknown';
      }
    };

    // Helper function to get file extension
    const getFileExtension = (path: string): string => {
      const lastDot = path.lastIndexOf('.');
      return lastDot > -1 ? path.substring(lastDot) : 'No ext';
    };

    // Helper function to get directory path
    const getDirectory = (path: string): string => {
      const lastSlash = path.lastIndexOf('/');
      return lastSlash > -1 ? path.substring(0, lastSlash) : '/';
    };

    // Helper function to format Git object ID for display
    const formatObjectId = (objectId: string): string => {
      return objectId ? objectId.substring(0, 8) + '...' : 'N/A';
    };

    // Helper function to format diff content for display with better readability
    const formatDiffContent = (diffContent: string): string => {
      if (!diffContent || diffContent === '[Diff not available]' || diffContent === '[Content not available]') {
        return diffContent;
      }
      
      const lines = diffContent.split('\n');
      let formattedLines: string[] = [];
      let inHunk = false;
      
      lines.forEach((line, index) => {
        if (line.startsWith('@@')) {
          // Hunk header - make it stand out and add some spacing
          if (inHunk) {
            formattedLines.push(''); // Add spacing between hunks
          }
          formattedLines.push(`**${line}**`);
          inHunk = true;
        } else if (line.startsWith('+++') || line.startsWith('---')) {
          // File headers - less prominent
          formattedLines.push(`*${line}*`);
        } else if (line.startsWith('+')) {
          // Added line - green
          formattedLines.push(`+ ${line.substring(1)}`);
        } else if (line.startsWith('-')) {
          // Removed line - red  
          formattedLines.push(`- ${line.substring(1)}`);
        } else if (line.startsWith(' ')) {
          // Context line - normal
          formattedLines.push(`  ${line.substring(1)}`);
        } else if (line.trim() === '') {
          // Empty line
          formattedLines.push('');
        } else {
          // Other lines
          formattedLines.push(line);
        }
      });
      
      return formattedLines.join('\n');
    };

    // Helper function to extract meaningful change summary
    const getChangeSummary = (diffContent: string, changeType: number): string => {
      if (!diffContent || diffContent === '[Diff not available]' || diffContent === '[Content not available]') {
        return 'No diff available';
      }
      
      const lines = diffContent.split('\n');
      const addedLines = lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
      const removedLines = lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length;
      const hunks = lines.filter(line => line.startsWith('@@')).length;
      
      // Handle specific change types
      if (changeType === 1) {
        // Added file
        return `New file (${addedLines} lines)`;
      } else if (changeType === 3) {
        // Deleted file
        return `Deleted file (${removedLines} lines)`;
      } else if (changeType === 2) {
        // Modified file
        if (addedLines === 0 && removedLines === 0) {
          return 'No meaningful changes (likely formatting)';
        }
        
        let summary = [];
        if (addedLines > 0) summary.push(`${addedLines} additions`);
        if (removedLines > 0) summary.push(`${removedLines} deletions`);
        if (hunks > 1) summary.push(`${hunks} change blocks`);
        
        return summary.join(', ');
      }
      
      return 'Unknown change type';
    };

    let result = `## 📁 Pull Request File Changes with Diff Content\n\n`;

    if (data.totalChanges && data.processedChanges && data.totalChanges > data.processedChanges) {
      result += `**⚠️ Note:** Showing detailed diffs for ${data.processedChanges} of ${data.totalChanges} files (limited for performance)\n\n`;
    }

    changes.forEach((change: any, index: number) => {
      const filePath = change.item?.path || 'N/A';
      const changeType = getChangeTypeString(change.changeType);
      const extension = getFileExtension(filePath);
      const directory = getDirectory(filePath);
      const changeNum = index + 1;

      result += `### ${changeNum}. ${changeType} - \`${filePath}\`\n\n`;
      
      // File metadata table
      result += `| Property | Value |\n`;
      result += `|----------|-------|\n`;
      result += `| **Directory** | \`${directory}\` |\n`;
      result += `| **File Type** | \`${extension}\` |\n`;
      result += `| **Change Type** | ${changeType} |\n`;
      result += `| **Change Tracking ID** | \`${change.changeTrackingId}\` |\n`;
      result += `| **Change ID** | \`${change.changeId}\` |\n`;

      if (change.changeType === 2) { // Modified file
        result += `| **Original Object ID** | \`${formatObjectId(change.item?.originalObjectId)}\` |\n`;
        result += `| **Current Object ID** | \`${formatObjectId(change.item?.objectId)}\` |\n`;
      } else if (change.changeType === 1) { // Added file
        result += `| **Object ID** | \`${formatObjectId(change.item?.objectId)}\` |\n`;
      } else if (change.changeType === 3) { // Deleted file
        result += `| **Original Object ID** | \`${formatObjectId(change.item?.originalObjectId)}\` |\n`;
      }

      result += `\n`;

      // Diff content
      if (change.diffContent) {
        result += `#### � **Diff Content:**\n\n`;
        result += `\`\`\`diff\n${formatDiffContent(change.diffContent)}\n\`\`\`\n\n`;
        
        // Parse diff statistics for detailed view
        const diffLines = change.diffContent.split('\n');
        const addedLines = diffLines.filter((line: string) => line.startsWith('+') && !line.startsWith('+++')).length;
        const removedLines = diffLines.filter((line: string) => line.startsWith('-') && !line.startsWith('---')).length;
        const hunkCount = diffLines.filter((line: string) => line.startsWith('@@')).length;
        
        if (addedLines > 0 || removedLines > 0) {
          result += `**📊 Statistics:**\n`;
          if (addedLines > 0) result += `- **🟢 Added:** ${addedLines} lines\n`;
          if (removedLines > 0) result += `- **🔴 Removed:** ${removedLines} lines\n`;
          if (hunkCount > 0) result += `- **📝 Change blocks:** ${hunkCount}\n`;
          result += `\n`;
        }
      } else {
        result += `*No diff content available for this file.*\n\n`;
      }
      
      result += `---\n\n`;
    });

    // Summary statistics
    const addedCount = changes.filter((c: any) => c.changeType === 1).length;
    const modifiedCount = changes.filter((c: any) => c.changeType === 2).length;
    const deletedCount = changes.filter((c: any) => c.changeType === 3).length;

    result += `## 📈 Summary Statistics\n\n`;
    result += `- **🟢 Added:** ${addedCount} files\n`;
    result += `- **🟡 Modified:** ${modifiedCount} files\n`;
    result += `- **🔴 Deleted:** ${deletedCount} files\n`;

    // File type breakdown
    const fileTypes = new Map<string, { count: number; added: number; modified: number; deleted: number }>();
    changes.forEach((change: any) => {
      const ext = getFileExtension(change.item?.path || '');
      if (!fileTypes.has(ext)) {
        fileTypes.set(ext, { count: 0, added: 0, modified: 0, deleted: 0 });
      }
      const stats = fileTypes.get(ext)!;
      stats.count++;
      if (change.changeType === 1) stats.added++;
      else if (change.changeType === 2) stats.modified++;
      else if (change.changeType === 3) stats.deleted++;
    });

    const sortedTypes = Array.from(fileTypes.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    if (sortedTypes.length > 0) {
      result += `\n**📄 File Types:**\n`;
      sortedTypes.forEach(([ext, stats]) => {
        result += `- **${ext}**: ${stats.count} files (${stats.added}🟢 ${stats.modified}🟡 ${stats.deleted}🔴)\n`;
      });
    }

    // Pagination info if available
    if (data.nextTop !== undefined || data.nextSkip !== undefined) {
      result += `\n**📄 Pagination Info:**\n`;
      result += `- **Next Top:** ${data.nextTop || 'N/A'}\n`;
      result += `- **Next Skip:** ${data.nextSkip || 'N/A'}\n`;
    }

    return result;
  }

  /**
   * Get available lines for inline comments in a PR file
   */
  public async getPullRequestFileLines(params: GetPullRequestFileChangesParams): Promise<McpResponse> {
    try {
      const changes = await this.gitService.getPullRequestFileChanges(params);
      
      if (!changes || !changes.changes || changes.changes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `## 📝 No Changes Found\n\nNo changes found for file '${params.path}' in PR #${params.pullRequestId}.\n\n💡 **Tip:** Use \`getPullRequestFileChanges\` without the path parameter to see all changed files in this PR.`
            }
          ]
        };
      }

      // Extract line information for commenting guidance
      let linesInfo = `## 📍 Available Lines for Inline Comments\n\n**File:** \`${params.path}\`\n**PR:** #${params.pullRequestId}\n\n`;
      
      changes.changes.forEach((change: any, index: number) => {
        if (change.item && change.item.gitObjectType === 'blob') {
          linesInfo += `### Change ${index + 1}:\n`;
          linesInfo += `- **Type:** ${change.changeType}\n`;
          if (change.item.path) {
            linesInfo += `- **Path:** \`${change.item.path}\`\n`;
          }
          linesInfo += `\n💡 **For inline comments:** Use line numbers from the actual diff content shown in \`getPullRequestFileChanges\`\n\n`;
        }
      });

      linesInfo += `---\n\n**Next Steps:**\n1. Use \`getPullRequestFileChanges\` to see the actual code diff\n2. Look for line numbers in the diff (lines starting with + or - or context lines)\n3. Use those line numbers for \`addPullRequestInlineComment\``;

      return {
        content: [
          {
            type: "text",
            text: linesInfo
          }
        ]
      };
    } catch (error) {
      console.error('Error in getPullRequestFileLines tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const GitToolMethods = getClassMethods(GitTools.prototype);