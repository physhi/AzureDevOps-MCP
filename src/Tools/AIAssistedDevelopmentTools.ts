import { AzureDevOpsConfig } from "../Interfaces/AzureDevOps";
import { AIAssistedDevelopmentService } from "../Services/AIAssistedDevelopmentService";
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  GetAICodeReviewParams,
  SuggestCodeOptimizationParams,
  IdentifyCodeSmellsParams,
  GetPredictiveBugAnalysisParams,
  GetDeveloperProductivityParams,
  GetPredictiveEffortEstimationParams,
  GetCodeQualityTrendsParams,
  SuggestWorkItemRefinementsParams,
  SuggestAutomationOpportunitiesParams,
  CreateIntelligentAlertsParams,
  PredictBuildFailuresParams,
  OptimizeTestSelectionParams
} from "../Interfaces/AIAssisted";
import getClassMethods from "../utils/getClassMethods";

export class AIAssistedDevelopmentTools {
  private service: AIAssistedDevelopmentService;

  constructor(config: AzureDevOpsConfig) {
    this.service = new AIAssistedDevelopmentService(config);
  }

  async getAICodeReview(params: GetAICodeReviewParams): Promise<McpResponse> {
    try {
      const result = await this.service.getAICodeReview(params);
      return formatMcpResponse(result, "AI-powered code review", false, true);
    } catch (error: unknown) {
      console.error('Error getting AI code review:', error);
      return formatErrorResponse(error);
    }
  }

  async suggestCodeOptimization(params: SuggestCodeOptimizationParams): Promise<McpResponse> {
    try {
      const result = await this.service.suggestCodeOptimization(params);
      return formatMcpResponse(result, `Code optimization suggestions for ${params.filePath}`, false, true);
    } catch (error: unknown) {
      console.error('Error suggesting code optimizations:', error);
      return formatErrorResponse(error);
    }
  }

  async identifyCodeSmells(params: IdentifyCodeSmellsParams): Promise<McpResponse> {
    try {
      const result = await this.service.identifyCodeSmells(params);
      return formatMcpResponse(result, "Code smell analysis", false, true);
    } catch (error: unknown) {
      console.error('Error identifying code smells:', error);
      return formatErrorResponse(error);
    }
  }

  async getPredictiveBugAnalysis(params: GetPredictiveBugAnalysisParams): Promise<McpResponse> {
    try {
      const result = await this.service.getPredictiveBugAnalysis(params);
      return formatMcpResponse(result, "Predictive bug analysis", false, true);
    } catch (error: unknown) {
      console.error('Error getting predictive bug analysis:', error);
      return formatErrorResponse(error);
    }
  }

  async getDeveloperProductivity(params: GetDeveloperProductivityParams): Promise<McpResponse> {
    try {
      const result = await this.service.getDeveloperProductivity(params);
      return formatMcpResponse(result, "Developer productivity metrics", false, true);
    } catch (error: unknown) {
      console.error('Error getting developer productivity metrics:', error);
      return formatErrorResponse(error);
    }
  }

  async getPredictiveEffortEstimation(params: GetPredictiveEffortEstimationParams): Promise<McpResponse> {
    try {
      const result = await this.service.getPredictiveEffortEstimation(params);
      return formatMcpResponse(result, "Predictive effort estimations", false, true);
    } catch (error: unknown) {
      console.error('Error getting predictive effort estimations:', error);
      return formatErrorResponse(error);
    }
  }

  async getCodeQualityTrends(params: GetCodeQualityTrendsParams): Promise<McpResponse> {
    try {
      const result = await this.service.getCodeQualityTrends(params);
      return formatMcpResponse(result, "Code quality trends analysis", false, true);
    } catch (error: unknown) {
      console.error('Error getting code quality trends:', error);
      return formatErrorResponse(error);
    }
  }

  async suggestWorkItemRefinements(params: SuggestWorkItemRefinementsParams): Promise<McpResponse> {
    try {
      const result = await this.service.suggestWorkItemRefinements(params);
      return formatMcpResponse(result, `Work item refinement suggestions for ${params.workItemId || "work items"}`, false, true);
    } catch (error: unknown) {
      console.error('Error suggesting work item refinements:', error);
      return formatErrorResponse(error);
    }
  }

  async suggestAutomationOpportunities(params: SuggestAutomationOpportunitiesParams): Promise<McpResponse> {
    try {
      const result = await this.service.suggestAutomationOpportunities(params);
      return formatMcpResponse(result, "Automation opportunities analysis", false, true);
    } catch (error: unknown) {
      console.error('Error suggesting automation opportunities:', error);
      return formatErrorResponse(error);
    }
  }

  async createIntelligentAlerts(params: CreateIntelligentAlertsParams): Promise<McpResponse> {
    try {
      const result = await this.service.createIntelligentAlerts(params);
      return formatMcpResponse(result, `Created intelligent alert: ${params.alertName}`, false, true);
    } catch (error: unknown) {
      console.error('Error creating intelligent alerts:', error);
      return formatErrorResponse(error);
    }
  }

  async predictBuildFailures(params: PredictBuildFailuresParams): Promise<McpResponse> {
    try {
      const result = await this.service.predictBuildFailures(params);
      return formatMcpResponse(result, `Predictive build failure analysis for build definition ${params.buildDefinitionId}`, false, true);
    } catch (error: unknown) {
      console.error('Error predicting build failures:', error);
      return formatErrorResponse(error);
    }
  }

  async optimizeTestSelection(params: OptimizeTestSelectionParams): Promise<McpResponse> {
    try {
      const result = await this.service.optimizeTestSelection(params);
      return formatMcpResponse(result, `Optimized test selection for build ${params.buildId}`, false, true);
    } catch (error: unknown) {
      console.error('Error optimizing test selection:', error);
      return formatErrorResponse(error);
    }
  }
}

export const AIAssistedDevelopmentToolMethods = getClassMethods(AIAssistedDevelopmentTools.prototype);