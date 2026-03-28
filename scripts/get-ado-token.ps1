# get-ado-token.ps1
# Returns an Azure DevOps access token for use in scripts and skills.
#
# Usage:
#   $token = & B:\sources\AzureDevOps-MCP\scripts\get-ado-token.ps1
#   Invoke-RestMethod -Uri "$orgUrl/_apis/..." -Headers @{ Authorization = "Bearer $token" }
#
# Auth priority:
#   1. AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN env var
#   2. Shared token file written by the MCP server (Entra auth)
#   3. Azure CLI fallback (az account get-access-token)
#
# The MCP server persists the Entra bearer token at:
#   ~/.azuredevops-mcp/access-token-{org-label}.json
# and refreshes it every 45 minutes, so this file is almost always valid.

param(
    [string]$OrgUrl = $env:AZURE_DEVOPS_ORG_URL,
    [string]$EnvFile = "$PSScriptRoot\..\.env"
)

# ── 1. Check env var ─────────────────────────────────────────────
if ($env:AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN) {
    Write-Output $env:AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN
    return
}

# ── 2. Read PAT from .env file ───────────────────────────────────
if (Test-Path $EnvFile) {
    $pat = Get-Content $EnvFile | Where-Object { $_ -match '^\s*AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN\s*=' } |
        ForEach-Object { ($_ -split '=', 2)[1].Trim().Trim('"', "'") }
    if ($pat) {
        Write-Output $pat
        return
    }
    # Also grab OrgUrl from .env if not passed
    if (-not $OrgUrl) {
        $OrgUrl = Get-Content $EnvFile | Where-Object { $_ -match '^\s*AZURE_DEVOPS_ORG_URL\s*=' } |
            ForEach-Object { ($_ -split '=', 2)[1].Trim().Trim('"', "'") }
    }
}

# ── 3. Shared token file from MCP server (Entra auth) ───────────
# The MCP server writes access-token-{label}.json on every token acquire/refresh.
# Label is derived from the org URL (e.g. "myorg.visualstudio.com" → "myorg.visualstudio.com").
$tokenDir = Join-Path $HOME ".azuredevops-mcp"
if (Test-Path $tokenDir) {
    # Derive label the same way the MCP server does: strip scheme, replace special chars with '-'
    $label = if ($OrgUrl) {
        ($OrgUrl -replace '^https?://', '' -replace '[/\\:*?"<>|]+', '-').TrimEnd('-')
    } else { $null }

    $tokenFile = if ($label) { Join-Path $tokenDir "access-token-$label.json" } else { $null }

    # If no exact match by label, pick the most recently written token file
    if (-not $tokenFile -or -not (Test-Path $tokenFile)) {
        $tokenFile = Get-ChildItem "$tokenDir\access-token-*.json" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
    }

    if ($tokenFile -and (Test-Path $tokenFile)) {
        $tokenData = Get-Content $tokenFile -Raw | ConvertFrom-Json
        # Check expiry (expiresOnTimestamp is in milliseconds)
        $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if ($tokenData.expiresOnTimestamp -gt ($nowMs + 60000)) {
            Write-Output $tokenData.accessToken
            return
        }
        else {
            Write-Warning "MCP server token expired. Falling back to az cli."
        }
    }
}

# ── 4. Azure CLI fallback ────────────────────────────────────────
$azDevOpsResourceId = "499b84ac-1321-427f-aa17-267ca6975798"
try {
    $tokenJson = az account get-access-token --resource $azDevOpsResourceId 2>$null | ConvertFrom-Json
    if ($tokenJson.accessToken) {
        Write-Output $tokenJson.accessToken
        return
    }
} catch {
    # Fall through to error
}

Write-Error "Could not obtain Azure DevOps token. Ensure the MCP server is running, az cli is logged in (az login), or set AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN."
exit 1
