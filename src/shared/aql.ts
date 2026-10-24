// Shape of Artifactory's response to POST /artifactory/api/search/aql.
export interface AqlRange {
  start_pos: number;
  end_pos: number;
  total: number;
  limit?: number;
}

export interface AqlResponse {
  results: Record<string, unknown>[];
  range: AqlRange;
}
