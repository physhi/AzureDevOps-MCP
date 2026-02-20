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
  GetAllPullRequestChangesParams,
  UpdatePullRequestParams,
  UpdatePullRequestReviewersParams,
  ReplyToCommentParams,
  UpdatePullRequestThreadParams,
  CreateBranchParams,
} from '../Interfaces/CodeAndRepositories';
import getClassMethods from "../utils/getClassMethods";
import {
  formatRelativeDate,
  formatFullDate,
  getChangeTypeString,
  getPrStatusString,
  truncateText,
  markdownTable
} from '../utils/formatHelpers';

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

      let md = `## Repository: ${repository.name || 'Unknown'}\n\n`;
      if (repository.id) md += `**ID:** ${repository.id}\n`;
      md += `**Default Branch:** ${repository.defaultBranch?.replace('refs/heads/', '') || 'N/A'}\n`;
      if (repository.size) md += `**Size:** ${(repository.size / 1024).toFixed(1)} KB\n`;
      if (repository.remoteUrl) md += `**Clone URL:** ${repository.remoteUrl}\n`;
      if (repository.webUrl) md += `**Web URL:** ${repository.webUrl}\n`;
      if (repository.project?.name) md += `**Project:** ${repository.project.name}\n`;

      return formatMcpResponse(repository, md, false, true);
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

      let md = `## ✅ Repository Created\n\n**${repository.name || params.name}**\n`;
      if (repository.id) md += `**ID:** ${repository.id}\n`;
      if (repository.remoteUrl) md += `**Clone URL:** ${repository.remoteUrl}\n`;
      if (repository.webUrl) md += `**Web URL:** ${repository.webUrl}\n`;

      return formatMcpResponse(repository, md, false, true);
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
      const items = Array.isArray(branches) ? branches : [];

      if (items.length === 0) {
        return formatMcpResponse(branches, `## Branches\n\nNo branches found in repository \`${params.repository}\`.\n\n💡 The repository may be empty.`);
      }

      let md = `## Branches\n\n**${items.length} branch${items.length !== 1 ? 'es' : ''}** in \`${params.repository}\`\n\n`;
      const rows = items.map((b: any) => {
        const name = b.name?.replace('refs/heads/', '') || 'N/A';
        const shortCommit = b.commit?.commitId?.substring(0, 8) || b.objectId?.substring(0, 8) || '-';
        const ahead = b.aheadCount != null ? String(b.aheadCount) : '-';
        const behind = b.behindCount != null ? String(b.behindCount) : '-';
        return [name, `\`${shortCommit}\``, ahead, behind];
      });
      md += markdownTable(['Name', 'Commit', 'Ahead', 'Behind'], rows);

      return formatMcpResponse(branches, md, false, true);
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
      const results = Array.isArray(items) ? items : (items?.results || items?.value || []);

      if (results.length === 0) {
        return formatMcpResponse(items, `## Code Search\n\nNo results found for "${params.searchText || ''}".\n\n💡 Try different keywords or check the repository name.`);
      }

      let md = `## Code Search Results\n\n**${results.length} result${results.length !== 1 ? 's' : ''}**\n\n`;
      const rows = results.map((r: any) => [
        r.path || r.fileName || 'N/A',
        r.fileName || r.path?.split('/').pop() || '-',
        r.fileExtension || r.path?.split('.').pop() || '-'
      ]);
      md += markdownTable(['Path', 'File', 'Extension'], rows);

      return formatMcpResponse(items, md, false, true);
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
      const entries = Array.isArray(items) ? items : (items?.value || []);

      const path = params.path || '/';
      if (entries.length === 0) {
        return formatMcpResponse(items, `## Browse: \`${path}\`\n\nNo items found at this path.\n\n💡 Check the path or use \`listBranches\` to verify the branch.`);
      }

      const folders = entries.filter((e: any) => e.isFolder || e.gitObjectType === 'tree');
      const files = entries.filter((e: any) => !e.isFolder && e.gitObjectType !== 'tree');

      let md = `## Browse: \`${path}\`\n\n`;
      md += `**${entries.length} items** | ${folders.length} folders, ${files.length} files\n\n`;
      md += '```\n';

      // Folders first, then files
      folders.forEach((f: any) => {
        const segments = f.path?.split('/').filter(Boolean) || [];
        const name = segments.length > 0 ? segments[segments.length - 1] : (f.name || '.');
        md += `📁 ${name}/\n`;
      });
      files.forEach((f: any) => {
        const segments = f.path?.split('/').filter(Boolean) || [];
        const name = segments.length > 0 ? segments[segments.length - 1] : (f.name || 'N/A');
        md += `📄 ${name}\n`;
      });

      md += '```\n';

      return formatMcpResponse(items, md, false, true);
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
      const formattedContent = this.formatFileContent(file, params.path, params);

      // Extract metadata from service response
      const content = file.content || '';
      const metadata = file.metadata || {};
      const lines = content.split('\n');
      const actualLineCount = lines.length;
      const sizeInBytes = Buffer.byteLength(content, 'utf8');

      // Truncation limits
      const maxLines = 200;
      const maxChars = 8000;

      // Determine truncation for structured content
      let truncated = false;
      let truncatedDueTo: 'lineLimit' | 'charLimit' | 'none' = 'none';
      let structuredContent = content;

      // Apply line limit
      if (actualLineCount > maxLines) {
        const truncatedLines = lines.slice(0, maxLines);
        structuredContent = truncatedLines.join('\n');
        truncated = true;
        truncatedDueTo = 'lineLimit';
      }

      // Apply character limit
      if (structuredContent.length > maxChars) {
        // Find how many lines fit within char limit
        let charCount = 0;
        let linesFit = 0;
        const linesToCheck = structuredContent.split('\n');
        for (let i = 0; i < linesToCheck.length; i++) {
          const lineWithNewline = linesToCheck[i] + '\n';
          if (charCount + lineWithNewline.length > maxChars) {
            break;
          }
          charCount += lineWithNewline.length;
          linesFit++;
        }
        structuredContent = linesToCheck.slice(0, linesFit).join('\n');
        truncated = true;
        truncatedDueTo = 'charLimit';
      }

      // Calculate effective end line for structured content
      const structuredLines = structuredContent.split('\n');
      const effectiveStartLine = metadata.startLine || 1;
      const effectiveEndLine = effectiveStartLine + structuredLines.length - 1;

      // Return with enhanced structured content
      return formatMcpResponse(
        {
          path: params.path,
          content: structuredContent,
          metadata: {
            startLine: effectiveStartLine,
            endLine: effectiveEndLine,
            totalLines: metadata.totalLines || actualLineCount,
            requestedStartLine: params.startLine || 1,
            requestedLineCount: params.lineCount || metadata.totalLines || actualLineCount,
            actualLineCount: structuredLines.length,
            size: sizeInBytes,
            encoding: 'utf-8',
            truncated: truncated,
            truncatedDueTo: truncatedDueTo,
            maxLinesPerRequest: maxLines,
            maxCharsPerRequest: maxChars,
            ...(params.versionDescriptor?.version && { version: params.versionDescriptor.version })
          }
        },
        formattedContent,
        false,
        true  // Enable structured content
      );
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
   * Format commit history response with concise, LLM-optimized formatting
   */
  private formatCommitHistoryResponse(commits: any[], params: GetCommitHistoryParams): McpResponse {
    if (!commits || commits.length === 0) {
      return formatMcpResponse(
        { commits: [], totalCommits: 0, repository: params.repository },
        `## Commit History\n\n**No commits found** for the specified criteria.\n\n**Repository:** ${params.repository}\n${params.itemPath ? `**File Path:** ${params.itemPath}\n` : ''}**Total commits:** 0`
      );
    }

    // Helper function to format author
    const formatAuthor = (author: any): string => {
      if (!author) return 'Unknown';
      return author.displayName || author.name || author.email || 'Unknown';
    };

    // Helper function to format commit message
    const formatCommitMessage = (message: string): { title: string, description: string } => {
      if (!message) return { title: 'No commit message', description: '' };
      const lines = message.trim().split('\n');
      const title = lines[0] || 'No commit message';
      const description = lines.slice(1).join('\n').trim();
      return { title, description };
    };

    // Calculate summary statistics upfront
    const totalAuthors = new Set(commits.map((c: any) => formatAuthor(c.author))).size;

    // START WITH SUMMARY AT TOP
    let result = `## Commit History\n\n`;
    result += `**${commits.length} commits** | **${totalAuthors} contributor${totalAuthors > 1 ? 's' : ''}**`;
    if (params.itemPath) {
      result += ` | **Path:** \`${params.itemPath}\``;
    }
    result += `\n\n`;

    // Optional pagination info
    if (params.skip && params.skip > 0) {
      result += `⚠️ Skipped ${params.skip} commits\n\n`;
    }

    result += `---\n\n`;

    // Commit list (simplified inline format)
    commits.forEach((commit: any, index: number) => {
      const { title, description } = formatCommitMessage(commit.comment);
      const author = formatAuthor(commit.author);
      const commitDate = commit.author?.date || commit.committer?.date;
      const shortDate = commitDate ? new Date(commitDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : 'Unknown';
      const shortId = commit.commitId?.substring(0, 8) || 'Unknown';

      result += `### ${index + 1}. ${title}\n\n`;

      // Inline metadata (concise, one line)
      result += `**\`${shortId}\`** by **${author}** on ${shortDate}`;

      // Add file changes if available
      if (commit.changeCounts) {
        const changes = commit.changeCounts;
        const changesParts: string[] = [];
        if (changes.Add > 0) changesParts.push(`+${changes.Add}`);
        if (changes.Edit > 0) changesParts.push(`~${changes.Edit}`);
        if (changes.Delete > 0) changesParts.push(`-${changes.Delete}`);
        if (changesParts.length > 0) {
          result += ` | ${changesParts.join(' ')} files`;
        }
      }

      result += `\n\n`;

      // Add description if present (no code block, just quote)
      if (description) {
        result += `> ${description.split('\n').join('\n> ')}\n\n`;
      }

      // Add commit link if available
      if (commit.remoteUrl) {
        result += `[View Commit](${commit.remoteUrl})\n\n`;
      }

      result += `---\n\n`;
    });

    // Prepare structured content
    const structuredData = {
      repository: params.repository,
      itemPath: params.itemPath,
      commits: commits.map((commit: any) => ({
        commitId: commit.commitId,
        author: formatAuthor(commit.author),
        date: commit.author?.date || commit.committer?.date,
        message: commit.comment,
        changeCounts: commit.changeCounts,
        remoteUrl: commit.remoteUrl
      })),
      summary: {
        totalCommits: commits.length,
        contributors: totalAuthors
      }
    };

    return formatMcpResponse(structuredData, result, false, true);
  }

  /**
   * List pull requests
   */
  public async listPullRequests(params: ListPullRequestsParams): Promise<McpResponse> {
    try {
      const pullRequests = await this.gitService.getPullRequests(params);
      const formattedDocument = this.formatPullRequestsTable(pullRequests, params.repository);

      // Calculate summary for structured content
      const activeCount = pullRequests.filter((pr: any) => pr.status === 1).length;
      const completedCount = pullRequests.filter((pr: any) => pr.status === 2).length;
      const abandonedCount = pullRequests.filter((pr: any) => pr.status === 3).length;

      // Return with structured content
      return formatMcpResponse(
        {
          repository: params.repository,
          pullRequests: pullRequests.map((pr: any) => ({
            id: pr.pullRequestId,
            title: pr.title,
            author: pr.createdBy?.displayName || pr.createdBy?.uniqueName,
            status: pr.status,
            createdDate: pr.creationDate,
            sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
            targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
            isDraft: pr.isDraft,
            url: pr.url
          })),
          summary: {
            total: pullRequests.length,
            byStatus: {
              active: activeCount,
              completed: completedCount,
              abandoned: abandonedCount
            }
          }
        },
        formattedDocument,
        false,
        true  // Enable structured content
      );
    } catch (error) {
      console.error('Error in listPullRequests tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull requests data into a detailed, LLM-friendly format
   * with comprehensive information including dates, draft status, and URLs
   */
  private formatPullRequestsTable(data: any[], repository: string): string {
    if (!data || data.length === 0) {
      return `## Pull Requests\n\n**No pull requests found** in repository: ${repository}`;
    }

    // Calculate summary statistics upfront
    const activeCount = data.filter((pr: any) => pr.status === 1).length;
    const completedCount = data.filter((pr: any) => pr.status === 2).length;
    const abandonedCount = data.filter((pr: any) => pr.status === 3).length;
    const draftCount = data.filter((pr: any) => pr.isDraft).length;

    // START WITH SUMMARY AT TOP
    let result = `## Pull Requests\n\n`;
    result += `**${data.length} PRs** in **${repository}**`;
    if (activeCount > 0 || completedCount > 0 || abandonedCount > 0) {
      result += ` | ${activeCount} active, ${completedCount} completed, ${abandonedCount} abandoned`;
    }
    if (draftCount > 0) {
      result += ` | ${draftCount} draft`;
    }
    result += `\n\n---\n\n`;

    // DETAILED LIST
    data.forEach((pr: any, index: number) => {
      const prId = pr.pullRequestId;
      const title = pr.title || 'No Title';
      const author = pr.createdBy?.displayName || pr.createdBy?.uniqueName || 'Unknown';
      const status = getPrStatusString(pr.status);
      const sourceBranch = pr.sourceRefName?.replace('refs/heads/', '') || '?';
      const targetBranch = pr.targetRefName?.replace('refs/heads/', '') || '?';
      const isDraft = pr.isDraft || false;

      // PR Header
      result += `### ${index + 1}. #${prId} - ${title}\n\n`;

      // Status and Date line
      result += `**Status:** ${status}`;
      if (isDraft) {
        result += ` 📝 **DRAFT**`;
      }

      if (pr.creationDate) {
        const relativeDate = formatRelativeDate(pr.creationDate);
        const fullDate = formatFullDate(pr.creationDate);
        result += ` | **Created:** ${relativeDate} (${fullDate})`;
      }
      result += `\n`;

      // Author and Branches line
      result += `**Author:** ${author} | **Branches:** \`${sourceBranch}\` → \`${targetBranch}\`\n\n`;

      result += `---\n\n`;
    });

    return result;
  }

  /**
   * Create pull request
   */
  public async createPullRequest(params: CreatePullRequestParams): Promise<McpResponse> {
    try {
      const pullRequest = await this.gitService.createPullRequest(params);

      const sourceBranch = params.sourceRefName?.replace('refs/heads/', '') || '?';
      const targetBranch = params.targetRefName?.replace('refs/heads/', '') || '?';

      let md = `## ✅ Pull Request Created\n\n`;
      md += `**PR #${pullRequest.pullRequestId}** - ${pullRequest.title || params.title || 'N/A'}\n`;
      md += `**Branches:** \`${sourceBranch}\` → \`${targetBranch}\`\n`;
      if (params.reviewers && params.reviewers.length > 0) {
        md += `**Reviewers:** ${params.reviewers.map((r: any) => r.displayName || r.id || r).join(', ')}\n`;
      }
      if (pullRequest.url) md += `**URL:** ${pullRequest.url}\n`;

      return formatMcpResponse(pullRequest, md, false, true);
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
              text: `## ❌ Pull Request Not Found\n\nPull request #${params.pullRequestId} was not found in repository '${params.repository}'.\n\nPlease check:\n- The pull request ID is correct\n- The repository name/ID is correct\n- You have access permissions to the repository`
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
    let md = `## Pull Request #${pullRequest.pullRequestId || 'N/A'}\n\n`;
    md += `### ${pullRequest.title || 'N/A'}\n\n`;

    // Status & meta info table
    md += `| Property | Value |\n|---|---|\n`;
    md += `| **Status** | ${getPrStatusString(pullRequest.status)} |\n`;
    md += `| **Created By** | ${pullRequest.createdBy?.displayName || 'N/A'} |\n`;
    md += `| **Created Date** | ${pullRequest.creationDate ? formatFullDate(pullRequest.creationDate) : 'N/A'} |\n`;
    md += `| **Is Draft** | ${pullRequest.isDraft ? 'Yes' : 'No'} |\n`;
    md += `| **Merge Status** | ${getMergeStatusLabel(pullRequest.mergeStatus)} |\n`;
    md += `| **Source Branch** | \`${pullRequest.sourceRefName?.replace('refs/heads/', '') || 'N/A'}\` |\n`;
    md += `| **Target Branch** | \`${pullRequest.targetRefName?.replace('refs/heads/', '') || 'N/A'}\` |\n`;
    md += `| **Repository** | ${pullRequest.repository?.name || 'N/A'} |\n`;
    md += `| **Source Commit** | \`${truncateText(pullRequest.lastMergeSourceCommit?.commitId || 'N/A', 12)}\` |\n`;
    md += `| **Target Commit** | \`${truncateText(pullRequest.lastMergeTargetCommit?.commitId || 'N/A', 12)}\` |\n`;
    if (pullRequest.closedDate) {
      md += `| **Closed Date** | ${formatFullDate(pullRequest.closedDate)} |\n`;
    }
    if (pullRequest.autoCompleteSetBy?.displayName) {
      md += `| **Auto-Complete By** | ${pullRequest.autoCompleteSetBy.displayName} |\n`;
    }

    // Description
    md += `\n### Description\n\n`;
    md += `${pullRequest.description || '_No description provided._'}\n`;

    // Reviewers
    if (pullRequest.reviewers && pullRequest.reviewers.length > 0) {
      md += `\n### Reviewers\n\n`;
      const reviewerRows = pullRequest.reviewers.map((r: any) => [
        r.displayName || 'Unknown',
        getVoteLabel(r.vote),
        r.isRequired ? 'Required' : 'Optional',
      ]);
      md += markdownTable(['Reviewer', 'Vote', 'Type'], reviewerRows);
    }

    // Labels/Tags
    if (pullRequest.labels && pullRequest.labels.length > 0) {
      md += `\n### Labels\n\n`;
      md += pullRequest.labels.map((l: any) => `\`${l.name || l}\``).join(', ') + '\n';
    }

    // Work items
    if (pullRequest.workItems && pullRequest.workItems.length > 0) {
      md += `\n### Associated Work Items\n\n`;
      const wiRows = pullRequest.workItems.map((wi: any) => [
        `#${wi.id}`,
        wi.title || 'N/A',
        wi.type || '-',
        wi.state || '-',
        wi.assignedTo || '-',
      ]);
      md += markdownTable(['ID', 'Title', 'Type', 'State', 'Assigned To'], wiRows);
    }

    // Completion options
    if (pullRequest.completionOptions) {
      md += `\n### Completion Options\n\n`;
      md += `| Option | Value |\n|---|---|\n`;
      if (pullRequest.completionOptions.mergeStrategy !== undefined) {
        md += `| **Merge Strategy** | ${getMergeStrategyLabel(pullRequest.completionOptions.mergeStrategy)} |\n`;
      }
      if (pullRequest.completionOptions.deleteSourceBranch !== undefined) {
        md += `| **Delete Source Branch** | ${pullRequest.completionOptions.deleteSourceBranch ? 'Yes' : 'No'} |\n`;
      }
      if (pullRequest.completionOptions.mergeCommitMessage) {
        md += `| **Merge Commit Message** | ${truncateText(pullRequest.completionOptions.mergeCommitMessage, 60)} |\n`;
      }
    }

    return md;
  }

  /**
   * Get pull request comments
   */
  public async getPullRequestComments(params: GetPullRequestCommentsParams): Promise<McpResponse> {
    try {
      const comments = await this.gitService.getPullRequestComments(params);
      const formattedDocument = this.formatPullRequestCommentsDocument(comments, params.pullRequestId);

      // Handle both array and object with value property
      const threads = Array.isArray(comments) ? comments : (comments.value || []);

      // Prepare structured content
      const structuredData = {
        pullRequestId: params.pullRequestId,
        threads: threads.map((thread: any) => ({
          id: thread.id,
          type: thread.properties?.CodeReviewThreadType?.$value,
          filePath: thread.threadContext?.filePath,
          lineStart: thread.threadContext?.rightFileStart?.line,
          lineEnd: thread.threadContext?.rightFileEnd?.line,
          comments: (thread.comments || []).map((comment: any) => ({
            author: comment.author?.displayName || comment.author?.uniqueName,
            content: comment.content,
            publishedDate: comment.publishedDate,
            isReply: comment.parentCommentId > 0,
            likesCount: comment.usersLiked?.length || 0
          }))
        })),
        summary: {
          totalThreads: threads.length,
          totalComments: threads.reduce((sum: number, t: any) => sum + (t.comments?.length || 0), 0)
        }
      };

      return formatMcpResponse(structuredData, formattedDocument, false, true);
    } catch (error) {
      console.error('Error in getPullRequestComments tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull request comments data into a concise document format
   */
  private formatPullRequestCommentsDocument(data: any, pullRequestId: number): string {
    if (!data || (!Array.isArray(data) && !data.length && !data.value)) {
      return `## PR Comments\n\n**No comments found** in PR #${pullRequestId}`;
    }

    // Handle both array and object with value property
    const threads = Array.isArray(data) ? data : (data.value || []);

    if (threads.length === 0) {
      return `## PR Comments\n\n**No comments found** in PR #${pullRequestId}`;
    }

    // Calculate summary statistics upfront
    const commentCount = threads.reduce((sum: number, thread: any) => sum + (thread.comments?.length || 0), 0);
    const codeReviewCount = threads.filter((t: any) => t.properties?.CodeReviewThreadType?.$value === 'CodeReview').length;
    const generalCount = threads.filter((t: any) => t.properties?.CodeReviewThreadType?.$value === 'General').length;
    const systemCount = threads.length - codeReviewCount - generalCount;

    // START WITH SUMMARY AT TOP
    let document = `## PR #${pullRequestId} Comments\n\n`;
    document += `**${threads.length} threads** | **${commentCount} comments**`;
    if (codeReviewCount > 0 || generalCount > 0 || systemCount > 0) {
      document += ` | ${codeReviewCount} code review, ${generalCount} general, ${systemCount} system`;
    }
    document += `\n\n---\n\n`;

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
    const threadType = thread.properties?.CodeReviewThreadType?.$value || 'Unknown';
    const typeLabel = this.getThreadTypeDescription(threadType);

    let threadDoc = `### ${threadNumber}. ${typeLabel}`;

    // Add file context if available (inline)
    if (thread.threadContext?.filePath) {
      const filePath = thread.threadContext.filePath;
      const lineStart = thread.threadContext.rightFileStart?.line;
      const lineEnd = thread.threadContext.rightFileEnd?.line;

      threadDoc += ` | \`${filePath}\``;
      if (lineStart && lineEnd) {
        threadDoc += `:${lineStart}-${lineEnd}`;
      }
    }

    threadDoc += `\n\n`;

    // Format comments in the thread
    if (thread.comments && thread.comments.length > 0) {
      thread.comments.forEach((comment: any) => {
        threadDoc += this.formatSingleComment(comment);
      });
    }

    return threadDoc;
  }

  /**
   * Formats a single comment
   */
  private formatSingleComment(comment: any): string {
    const author = comment.author?.displayName || 'Unknown';
    const content = comment.content || 'No content';
    const isReply = comment.parentCommentId > 0;

    let commentDoc = `${isReply ? '  ' : ''}**${isReply ? '↳ ' : ''}${author}:**`;

    // Add likes if any
    if (comment.usersLiked && comment.usersLiked.length > 0) {
      commentDoc += ` 👍${comment.usersLiked.length}`;
    }

    commentDoc += `\n${isReply ? '  ' : ''}> ${content}\n\n`;

    return commentDoc;
  }

  /**
   * Gets a human-readable description for thread types
   */
  private getThreadTypeDescription(threadType: string): string {
    switch (threadType) {
      case 'CodeReview': return '💬 Code Review';
      case 'General': return '💭 General';
      case 'RefUpdate': return '🔄 Branch Update';
      case 'ReviewersUpdate': return '👥 Reviewers Change';
      case 'IsDraftUpdate': return '📝 Draft Change';
      default: return threadType || 'Unknown';
    }
  }

  /**
   * Approve pull request
   */
  public async approvePullRequest(params: ApprovePullRequestParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.approvePullRequest(params);

      const md = `## ✅ Pull Request Approved\n\n**PR #${params.pullRequestId}** in \`${params.repository}\` has been approved.`;

      return formatMcpResponse(result, md, false, true);
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

      let md = `## ✅ Pull Request Merged\n\n**PR #${params.pullRequestId}** in \`${params.repository}\``;
      if (params.mergeStrategy) md += ` | Strategy: ${params.mergeStrategy}`;
      md += '\n';

      return formatMcpResponse(result, md, false, true);
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

      // Build concise confirmation message
      const fileName = params.path.split('/').pop() || params.path;
      const message = `## Comment Added\n\n**Type:** Inline comment\n**PR:** #${params.pullRequestId}\n**File:** \`${fileName}\`\n**Line:** ${params.position.line}\n\n✅ Your comment has been posted to the Files tab.`;

      return formatMcpResponse(result, message, false, true);
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
                text: `## ❌ Invalid Line Position\n\n${error.message}\n\n### 🔍 **How to Find the Correct Line:**\n\n\`\`\`\ngetPullRequestFileChanges repository="${params.repository}" pullRequestId=${params.pullRequestId} path="${params.path}"\n\`\`\`\n\nThis will show you:\n\n**📁 For NEWLY ADDED files:**\n- All lines are available for comments (1, 2, 3, ... N)\n- Diff shows: \`+1: line content\`, \`+2: line content\`, etc.\n- You can comment on ANY line number from 1 to the total lines\n\n**📝 For MODIFIED files:**\n- Only changed line ranges can be commented on\n- Look for lines with \`+\` (added) or context lines\n- Line numbers correspond to the new version of the file\n\n**🗑️ For DELETED files:**\n- Only the deleted lines can be commented on\n- Diff shows: \`-1: deleted content\`, \`-2: deleted content\`, etc.`
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

      // Build concise confirmation message
      const fileName = params.path.split('/').pop() || params.path;
      const message = `## Comment Added\n\n**Type:** File-level comment\n**PR:** #${params.pullRequestId}\n**File:** \`${fileName}\`\n\n✅ Your comment has been posted to the Files tab.`;

      return formatMcpResponse(result, message, false, true);
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

      // Build concise confirmation message
      const message = `## Comment Added\n\n**Type:** General PR comment\n**PR:** #${params.pullRequestId}\n\n✅ Your comment has been posted to the Overview tab.`;

      return formatMcpResponse(result, message, false, true);
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
      return formatMcpResponse(changes, formattedContent, false, true); // Enable structured content
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

      const total = count?.totalChanges || count?.totalFiles || count?.total || count?.count || 0;
      const modified = count?.modifiedFiles || count?.modified || 0;
      const added = count?.addedFiles || count?.added || 0;
      const deleted = count?.deletedFiles || count?.deleted || 0;

      let md = `## PR #${params.pullRequestId} Changes\n\n`;
      md += `**${total} files**`;
      const parts: string[] = [];
      if (modified > 0) parts.push(`${modified} modified`);
      if (added > 0) parts.push(`${added} added`);
      if (deleted > 0) parts.push(`${deleted} deleted`);
      if (parts.length > 0) md += `: ${parts.join(', ')}`;

      return formatMcpResponse(count, md, false, true);
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

      // Calculate summary for structured content
      const changeList = changes.changes || [];
      const addedCount = changeList.filter((c: any) => c.changeType === 1).length;
      const modifiedCount = changeList.filter((c: any) => c.changeType === 2).length;
      const deletedCount = changeList.filter((c: any) => c.changeType === 3).length;

      // Return with structured content
      return formatMcpResponse(
        {
          pullRequestId: params.pullRequestId,
          changes: changeList.map((change: any) => ({
            path: change.item?.path,
            changeType: change.changeType,
            size: change.item?.size
          })),
          summary: {
            totalChanges: changes.totalCount || changeList.length,
            byType: {
              added: addedCount,
              modified: modifiedCount,
              deleted: deletedCount
            }
          }
        },
        formattedTable,
        false,
        true  // Enable structured content
      );
    } catch (error) {
      console.error('Error in getAllPullRequestChanges tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Formats pull request changes data into a concise table format
   */
  private formatPullRequestChangesTable(data: any): string {
    if (!data || !data.changes || data.changes.length === 0) {
      return "No changes found in this pull request.";
    }

    const changes = data.changes;

    // Calculate summary statistics upfront (to put at top)
    const addedCount = changes.filter((c: any) => c.changeType === 1).length;
    const modifiedCount = changes.filter((c: any) => c.changeType === 2).length;
    const deletedCount = changes.filter((c: any) => c.changeType === 3).length;
    const totalCount = data.totalCount || changes.length;

    // START WITH SUMMARY AT TOP
    let result = `## PR Changes\n\n`;
    result += `**${totalCount} files:** ${modifiedCount} modified, ${addedCount} added, ${deletedCount} deleted\n\n`;

    // Optional pagination info
    if (data.totalCount && data.totalCount > changes.length) {
      result += `⚠️ Showing ${changes.length} of ${totalCount} files (use pagination for more)\n\n`;
    }

    result += `---\n\n`;

    // Simplified 3-column table
    result += `| # | Path | Change |\n`;
    result += `|---|------|--------|\n`;

    changes.forEach((change: any, index: number) => {
      const changeNum = index + 1;
      const changeType = getChangeTypeString(change.changeType);
      const filePath = change.item?.path || 'N/A';

      result += `| ${changeNum} | \`${filePath}\` | ${changeType} |\n`;
    });

    return result;
  }

  /**
   * Formats file content with line numbers (arrow notation style) and metadata
   * Truncates to 200 lines or 8K characters, whichever comes first
   */
  private formatFileContent(data: any, path: string, params: GetFileContentParams): string {
    if (!data || !data.content) {
      return `## File: \`${path}\`\n\n*No content available*`;
    }

    const content = data.content;
    const metadata = data.metadata || {};
    const lines = content.split('\n');

    const totalLines = metadata.totalLines || lines.length;
    const startLine = metadata.startLine || 1;
    const endLine = metadata.endLine || lines.length;
    const actualLineCount = lines.length;

    // Calculate file size
    const sizeInBytes = Buffer.byteLength(content, 'utf8');
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);

    // Truncation limits
    const maxLines = 200;
    const maxChars = 8000;

    // Determine truncation
    let displayLines = lines;
    let truncated = false;
    let truncatedDueTo: 'lineLimit' | 'charLimit' | 'none' = 'none';
    let effectiveEndLine = endLine;

    // First apply line limit
    if (actualLineCount > maxLines) {
      displayLines = lines.slice(0, maxLines);
      truncated = true;
      truncatedDueTo = 'lineLimit';
      effectiveEndLine = startLine + maxLines - 1;
    }

    // Then check character limit
    let formattedContent = displayLines.map((line: string, idx: number) => {
      const lineNum = startLine + idx;
      return `${lineNum.toString().padStart(6, ' ')}→${line}`;
    }).join('\n');

    if (formattedContent.length > maxChars) {
      // Find how many lines fit within char limit
      let charCount = 0;
      let linesFit = 0;
      for (let i = 0; i < displayLines.length; i++) {
        const lineNum = startLine + i;
        const formattedLine = `${lineNum.toString().padStart(6, ' ')}→${displayLines[i]}\n`;
        if (charCount + formattedLine.length > maxChars) {
          break;
        }
        charCount += formattedLine.length;
        linesFit++;
      }

      displayLines = displayLines.slice(0, linesFit);
      truncated = true;
      truncatedDueTo = 'charLimit';
      effectiveEndLine = startLine + linesFit - 1;

      // Reformat with adjusted lines
      formattedContent = displayLines.map((line: string, idx: number) => {
        const lineNum = startLine + idx;
        return `${lineNum.toString().padStart(6, ' ')}→${line}`;
      }).join('\n');
    }

    // Build header with metadata
    let result = `## File: \`${path}\`\n\n`;

    if (startLine === 1 && effectiveEndLine >= totalLines && !truncated) {
      result += `**${totalLines} lines** | **${sizeInKB} KB** | **Encoding:** utf-8`;
    } else {
      result += `**Lines ${startLine}-${effectiveEndLine} of ${totalLines}** | **${sizeInKB} KB** | **Encoding:** utf-8`;
    }

    if (truncated) {
      result += `\n\n> ⚠️ **Truncated** - `;
      if (truncatedDueTo === 'lineLimit') {
        result += `showing first ${maxLines} lines of ${actualLineCount} requested`;
      } else {
        result += `content exceeds ${(maxChars / 1024).toFixed(1)}K character limit`;
      }
      result += `\n> 💡 **Tip:** Use \`startLine\` and \`lineCount\` parameters to view specific ranges`;
    } else if (effectiveEndLine < totalLines) {
      result += `\n\n> 💡 **More content available:** Use \`startLine=${effectiveEndLine + 1}\` to continue reading`;
    }

    result += `\n\n---\n\n`;

    // Format content with arrow notation line numbers
    result += `\`\`\`\n${formattedContent}\n\`\`\`\n`;

    // Add usage hints for large files
    if (totalLines > maxLines || truncated) {
      result += `\n**Navigation hints:**\n`;
      if (effectiveEndLine < totalLines) {
        result += `- Next range: \`startLine=${effectiveEndLine + 1}\`, \`lineCount=${maxLines}\`\n`;
      }
      if (startLine > 1) {
        result += `- Previous range: \`startLine=${Math.max(1, startLine - maxLines)}\`, \`lineCount=${maxLines}\`\n`;
      }
      result += `- Specific range: \`startLine=<line>\`, \`lineCount=<count>\` (max ${maxLines} lines)\n`;
    }

    return result;
  }

  /**
   * Formats pull request file changes data into a detailed, readable format with diff content
   */
  private formatPullRequestFileChanges(data: any): string {
    if (!data || !data.changeEntries || data.changeEntries.length === 0) {
      return "No file changes found in this pull request.";
    }

    const changes = data.changeEntries;
    const MAX_DIFF_LINES = 20; // Limit diff preview to first 20 lines

    // Helper function to convert change type to short label
    const getChangeTypeLabel = (changeType: number): string => {
      switch (changeType) {
        case 1: return 'Added';
        case 2: return 'Modified';
        case 3: return 'Deleted';
        default: return 'Unknown';
      }
    };

    // Calculate summary statistics
    const addedCount = changes.filter((c: any) => c.changeType === 1).length;
    const modifiedCount = changes.filter((c: any) => c.changeType === 2).length;
    const deletedCount = changes.filter((c: any) => c.changeType === 3).length;

    // Calculate total line changes and prepare file info
    let totalAdditions = 0;
    let totalDeletions = 0;
    const fileInfos: Array<{ path: string; type: string; added: number; removed: number; diffLines: number; }> = [];

    changes.forEach((change: any) => {
      const filePath = change.item?.path || 'N/A';
      let added = 0;
      let removed = 0;
      let diffLines = 0;

      if (change.diffContent) {
        const lines = change.diffContent.split('\n');
        diffLines = lines.length;
        added = lines.filter((line: string) => line.startsWith('+') && !line.startsWith('+++')).length;
        removed = lines.filter((line: string) => line.startsWith('-') && !line.startsWith('---')).length;
        totalAdditions += added;
        totalDeletions += removed;
      }

      fileInfos.push({
        path: filePath,
        type: getChangeTypeLabel(change.changeType),
        added,
        removed,
        diffLines
      });
    });

    // Build output starting with compact summary
    let result = `## PR File Changes (${changes.length} files)\n\n`;

    // Compact summary line
    const parts: string[] = [];
    if (modifiedCount > 0) parts.push(`${modifiedCount} modified`);
    if (addedCount > 0) parts.push(`${addedCount} added`);
    if (deletedCount > 0) parts.push(`${deletedCount} deleted`);
    result += `${parts.join(' • ')}`;

    if (totalAdditions > 0 || totalDeletions > 0) {
      result += ` | **+${totalAdditions} -${totalDeletions}** lines`;
    }
    result += `\n\n`;

    if (data.totalChanges && data.processedChanges && data.totalChanges > data.processedChanges) {
      result += `> Showing ${data.processedChanges} of ${data.totalChanges} files\n\n`;
    }

    // Compact file list
    result += `### Files\n`;
    fileInfos.forEach((info, idx) => {
      const changeIndicator = info.added > 0 || info.removed > 0 ? ` (+${info.added} -${info.removed})` : '';
      result += `${idx + 1}. \`${info.path}\` - ${info.type}${changeIndicator}\n`;
    });

    result += `\n---\n\n`;
    result += `### Diff Preview\n\n`;

    // Show diff previews (truncated)
    changes.forEach((change: any, index: number) => {
      const filePath = change.item?.path || 'N/A';
      const info = fileInfos[index];
      const changeIndicator = info.added > 0 || info.removed > 0 ? `(+${info.added} -${info.removed})` : '';

      result += `**${index + 1}. ${filePath}** ${changeIndicator}\n`;

      if (change.diffContent) {
        const lines = change.diffContent.split('\n');
        const totalLines = lines.length;
        const truncated = totalLines > MAX_DIFF_LINES;
        const displayLines = truncated ? lines.slice(0, MAX_DIFF_LINES) : lines;

        result += `\`\`\`diff\n${displayLines.join('\n')}\n\`\`\`\n`;

        if (truncated) {
          const hiddenLines = totalLines - MAX_DIFF_LINES;
          result += `> ... ${hiddenLines} more lines hidden\n`;
        }
      } else {
        result += `*No diff available*\n`;
      }

      result += `\n`;
    });

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
          linesInfo += `- **Type:** ${change.changeType === 1 ? 'ADDED (New file)' : change.changeType === 2 ? 'MODIFIED' : change.changeType === 3 ? 'DELETED' : 'Unknown'}\n`;
          if (change.item.path) {
            linesInfo += `- **Path:** \`${change.item.path}\`\n`;
          }
          
          // Provide specific guidance based on change type
          if (change.changeType === 1) {
            // Newly added file
            linesInfo += `\n💡 **For NEW files:** All lines are available for commenting!\n`;
            linesInfo += `- Line numbers: 1, 2, 3, ... up to the total lines in the file\n`;
            linesInfo += `- Example: Use line 1 for the first line, line 2 for the second line, etc.\n`;
            linesInfo += `- The diff will show: \`+1: content\`, \`+2: content\`, etc.\n`;
          } else if (change.changeType === 2) {
            // Modified file
            linesInfo += `\n💡 **For MODIFIED files:** Only changed lines can be commented on\n`;
            linesInfo += `- Look for lines with \`+\` (added) or context lines in the diff\n`;
            linesInfo += `- Line numbers correspond to the new version of the file\n`;
          } else if (change.changeType === 3) {
            // Deleted file
            linesInfo += `\n💡 **For DELETED files:** Only deleted lines can be commented on\n`;
            linesInfo += `- The diff will show: \`-1: content\`, \`-2: content\`, etc.\n`;
          }
          
          linesInfo += `\n`;
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

  // ── New PR Enhancement Tools ─────────────────────────────────

  /**
   * Update pull request properties (title, description, status, auto-complete, draft)
   */
  public async updatePullRequest(params: UpdatePullRequestParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.updatePullRequest(params);

      let md = `## Pull Request #${params.pullRequestId} Updated\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Title** | ${result.title || '-'} |\n`;
      md += `| **Status** | ${getPrStatusString(result.status)} |\n`;
      md += `| **Is Draft** | ${result.isDraft ? 'Yes' : 'No'} |\n`;
      if (result.autoCompleteSetBy?.displayName) {
        md += `| **Auto-Complete By** | ${result.autoCompleteSetBy.displayName} |\n`;
      }

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Add or remove reviewers on a pull request
   */
  public async updatePullRequestReviewers(params: UpdatePullRequestReviewersParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.updatePullRequestReviewers(params);

      let md = `## PR #${params.pullRequestId} - Reviewers Updated\n\n`;
      if (result.added.length > 0) {
        md += `**Added ${result.added.length} reviewer(s):**\n`;
        result.added.forEach((r: any) => {
          md += `- ${r.displayName || r.id || 'Unknown'}${r.isRequired ? ' (Required)' : ''}\n`;
        });
      }
      if (result.removed.length > 0) {
        md += `\n**Removed ${result.removed.length} reviewer(s):**\n`;
        result.removed.forEach((r: string) => {
          md += `- ${r}\n`;
        });
      }

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Reply to an existing comment thread on a PR
   */
  public async replyToComment(params: ReplyToCommentParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.replyToComment(params);

      let md = `## Reply Added to Thread #${params.threadId}\n\n`;
      md += `**Author:** ${result.author?.displayName || 'Unknown'}\n`;
      md += `**Comment ID:** ${result.id}\n\n`;
      md += `> ${params.comment}\n`;

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Update a comment thread's status (resolve/reactivate)
   */
  public async updatePullRequestThread(params: UpdatePullRequestThreadParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.updatePullRequestThread(params);

      let md = `## Thread #${params.threadId} Updated\n\n`;
      md += `**Status:** ${params.status}\n`;

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a new branch from a source ref (branch name or commit SHA)
   */
  public async createBranch(params: CreateBranchParams): Promise<McpResponse> {
    try {
      const result = await this.gitService.createBranch(params);

      let md = `## Branch Created\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Branch** | \`${result.name || params.branchName}\` |\n`;
      md += `| **New Object ID** | \`${truncateText(result.newObjectId || '-', 12)}\` |\n`;
      md += `| **Success** | ${result.success !== false ? 'Yes' : 'No'} |\n`;

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }
}

export const GitToolMethods = getClassMethods(GitTools.prototype);

// ── Helper Functions ─────────────────────────────────────────────

function getVoteLabel(vote: number | undefined): string {
  switch (vote) {
    case 10: return '✅ Approved';
    case 5: return '👍 Approved with Suggestions';
    case 0: return '⏳ No Vote';
    case -5: return '⏸️ Waiting for Author';
    case -10: return '❌ Rejected';
    default: return `${vote ?? 'N/A'}`;
  }
}

function getMergeStatusLabel(status: number | undefined): string {
  switch (status) {
    case 0: return 'Not Set';
    case 1: return 'Queued';
    case 2: return 'Conflicts';
    case 3: return 'Succeeded';
    case 4: return 'Rejected by Policy';
    case 5: return 'Failure';
    default: return `${status ?? 'N/A'}`;
  }
}

function getMergeStrategyLabel(strategy: number | undefined): string {
  switch (strategy) {
    case 1: return 'No Fast-Forward';
    case 2: return 'Squash';
    case 3: return 'Rebase';
    case 4: return 'Rebase Merge';
    default: return `${strategy ?? 'Default'}`;
  }
}