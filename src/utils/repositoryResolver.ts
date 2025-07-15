/**
 * Repository Auto-Detection and Resolution Utilities
 * Provides hybrid support for both repository IDs (GUIDs) and repository names
 */

/**
 * Determines if a string is a repository ID (GUID format)
 * @param value - The string to check
 * @returns true if the value matches GUID pattern (8-4-4-4-12 hex characters)
 */
export function isRepositoryId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  
  // GUID pattern: 8-4-4-4-12 hexadecimal characters separated by hyphens
  // Example: c5e7435f-113e-4328-9d8a-726f094bfa95
  const guidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return guidPattern.test(value);
}

/**
 * Determines if a string is a repository name (not a GUID)
 * @param value - The string to check
 * @returns true if the value is not a GUID (assumed to be a repository name)
 */
export function isRepositoryName(value: string): boolean {
  return !isRepositoryId(value);
}

/**
 * Gets a descriptive string for the repository identifier type
 * @param value - The repository identifier
 * @returns "ID" for GUIDs, "Name" for names
 */
export function getRepositoryIdentifierType(value: string): 'ID' | 'Name' {
  return isRepositoryId(value) ? 'ID' : 'Name';
}
