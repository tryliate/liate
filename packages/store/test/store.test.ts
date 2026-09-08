import { describe, expect, it } from 'bun:test';
import { LIATE_DIR, GLOBAL_MCP_FILE, getProjectLiateDir } from '../src/paths';

describe('@liate/store paths and storage', () => {
  it('should resolve sovereign system paths correctly', () => {
    expect(LIATE_DIR).toBeDefined();
    expect(LIATE_DIR).toContain('.liate');
    expect(GLOBAL_MCP_FILE).toContain('liate_mcp.json');
    expect(getProjectLiateDir('/test')).toContain('.liate');
  });
});
