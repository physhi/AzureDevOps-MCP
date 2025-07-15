export interface RunSecurityScanParams {
  repository: string;
  branch?: string;
  scanType?: 'static' | 'dynamic' | 'container' | 'dependency' | 'all';
}

export interface GetSecurityScanResultsParams {
  scanId: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'all';
}

export interface TrackSecurityVulnerabilitiesParams {
  vulnerabilityId?: string;
  status?: 'open' | 'in-progress' | 'mitigated' | 'resolved' | 'false-positive';
  timeRange?: string;
}

export interface GenerateSecurityComplianceParams {
  standardType?: 'owasp' | 'pci-dss' | 'hipaa' | 'gdpr' | 'iso27001' | 'custom';
  includeEvidence?: boolean;
}

export interface IntegrateSarifResultsParams {
  sarifFilePath: string;
  createWorkItems?: boolean;
}

export interface RunComplianceChecksParams {
  complianceStandard: string;
  scopeId?: string;
}

export interface GetComplianceStatusParams {
  standardId?: string;
  includeHistory?: boolean;
}

export interface CreateComplianceReportParams {
  standardId: string;
  format?: 'pdf' | 'html' | 'json';
}

export interface ManageSecurityPoliciesParams {
  policyName: string;
  action: 'create' | 'update' | 'delete' | 'get';
  policyDefinition?: Record<string, any>;
}

export interface TrackSecurityAwarenessParams {
  teamId?: string;
  trainingId?: string;
  timeRange?: string;
}

export interface RotateSecretsParams {
  secretName?: string;
  secretType?: 'password' | 'token' | 'certificate' | 'key';
  force?: boolean;
}

export interface AuditSecretUsageParams {
  secretName?: string;
  timeRange?: string;
}

export interface VaultIntegrationParams {
  vaultUrl: string;
  secretPath?: string;
  action: 'get' | 'list' | 'set' | 'delete';
  secretValue?: string;
} 