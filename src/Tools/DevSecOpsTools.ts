import { AzureDevOpsConfig } from "../Interfaces/AzureDevOps";
import { DevSecOpsService } from "../Services/DevSecOpsService";
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  RunSecurityScanParams,
  GetSecurityScanResultsParams,
  TrackSecurityVulnerabilitiesParams,
  GenerateSecurityComplianceParams,
  IntegrateSarifResultsParams,
  RunComplianceChecksParams,
  GetComplianceStatusParams,
  CreateComplianceReportParams,
  ManageSecurityPoliciesParams,
  TrackSecurityAwarenessParams,
  RotateSecretsParams,
  AuditSecretUsageParams,
  VaultIntegrationParams
} from "../Interfaces/DevSecOps";
import getClassMethods from "../utils/getClassMethods";

export class DevSecOpsTools {
  private service: DevSecOpsService;

  constructor(config: AzureDevOpsConfig) {
    this.service = new DevSecOpsService(config);
  }

  async runSecurityScan(params: RunSecurityScanParams): Promise<McpResponse> {
    try {
      const result = await this.service.runSecurityScan(params);
      return formatMcpResponse(result, `Security scan initiated for repository ${params.repository}`);
    } catch (error: unknown) {
      console.error('Error running security scan:', error);
      return formatErrorResponse(error);
    }
  }

  async getSecurityScanResults(params: GetSecurityScanResultsParams): Promise<McpResponse> {
    try {
      const result = await this.service.getSecurityScanResults(params);
      return formatMcpResponse(result, `Security scan results for scan ${params.scanId}`);
    } catch (error: unknown) {
      console.error('Error getting security scan results:', error);
      return formatErrorResponse(error);
    }
  }

  async trackSecurityVulnerabilities(params: TrackSecurityVulnerabilitiesParams): Promise<McpResponse> {
    try {
      const result = await this.service.trackSecurityVulnerabilities(params);
      return formatMcpResponse(result, "Security vulnerabilities tracking information");
    } catch (error: unknown) {
      console.error('Error tracking security vulnerabilities:', error);
      return formatErrorResponse(error);
    }
  }

  async generateSecurityCompliance(params: GenerateSecurityComplianceParams): Promise<McpResponse> {
    try {
      const result = await this.service.generateSecurityCompliance(params);
      return formatMcpResponse(result, `Security compliance report for ${params.standardType || 'owasp'} standard`);
    } catch (error: unknown) {
      console.error('Error generating security compliance report:', error);
      return formatErrorResponse(error);
    }
  }

  async integrateSarifResults(params: IntegrateSarifResultsParams): Promise<McpResponse> {
    try {
      const result = await this.service.integrateSarifResults(params);
      return formatMcpResponse(result, `SARIF results integrated from ${params.sarifFilePath}`);
    } catch (error: unknown) {
      console.error('Error integrating SARIF results:', error);
      return formatErrorResponse(error);
    }
  }

  async runComplianceChecks(params: RunComplianceChecksParams): Promise<McpResponse> {
    try {
      const result = await this.service.runComplianceChecks(params);
      return formatMcpResponse(result, `Compliance checks for ${params.complianceStandard} standard`);
    } catch (error: unknown) {
      console.error('Error running compliance checks:', error);
      return formatErrorResponse(error);
    }
  }

  async getComplianceStatus(params: GetComplianceStatusParams): Promise<McpResponse> {
    try {
      const result = await this.service.getComplianceStatus(params);
      return formatMcpResponse(result, `Compliance status for ${params.standardId || 'all standards'}`);
    } catch (error: unknown) {
      console.error('Error getting compliance status:', error);
      return formatErrorResponse(error);
    }
  }

  async createComplianceReport(params: CreateComplianceReportParams): Promise<McpResponse> {
    try {
      const result = await this.service.createComplianceReport(params);
      return formatMcpResponse(result, `Compliance report created for ${params.standardId}`);
    } catch (error: unknown) {
      console.error('Error creating compliance report:', error);
      return formatErrorResponse(error);
    }
  }

  async manageSecurityPolicies(params: ManageSecurityPoliciesParams): Promise<McpResponse> {
    try {
      const result = await this.service.manageSecurityPolicies(params);
      return formatMcpResponse(result, `Security policy '${params.policyName}' ${params.action}d`);
    } catch (error: unknown) {
      console.error('Error managing security policies:', error);
      return formatErrorResponse(error);
    }
  }

  async trackSecurityAwareness(params: TrackSecurityAwarenessParams): Promise<McpResponse> {
    try {
      const result = await this.service.trackSecurityAwareness(params);
      return formatMcpResponse(result, `Security awareness tracking for ${params.teamId || 'all teams'}`);
    } catch (error: unknown) {
      console.error('Error tracking security awareness:', error);
      return formatErrorResponse(error);
    }
  }

  async rotateSecrets(params: RotateSecretsParams): Promise<McpResponse> {
    try {
      const result = await this.service.rotateSecrets(params);
      return formatMcpResponse(result, `Secrets rotation for ${params.secretName || 'all applicable secrets'}`);
    } catch (error: unknown) {
      console.error('Error rotating secrets:', error);
      return formatErrorResponse(error);
    }
  }

  async auditSecretUsage(params: AuditSecretUsageParams): Promise<McpResponse> {
    try {
      const result = await this.service.auditSecretUsage(params);
      return formatMcpResponse(result, `Secret usage audit for ${params.secretName || 'all secrets'}`);
    } catch (error: unknown) {
      console.error('Error auditing secret usage:', error);
      return formatErrorResponse(error);
    }
  }

  async vaultIntegration(params: VaultIntegrationParams): Promise<McpResponse> {
    try {
      const result = await this.service.vaultIntegration(params);
      return formatMcpResponse(result, `Vault integration: ${params.action} operation on ${params.vaultUrl}`);
    } catch (error: unknown) {
      console.error('Error with vault integration:', error);
      return formatErrorResponse(error);
    }
  }
}

export const DevSecOpsToolMethods = getClassMethods(DevSecOpsTools.prototype);