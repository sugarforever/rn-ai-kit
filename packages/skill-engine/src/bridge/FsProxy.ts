import * as FileSystem from 'expo-file-system';

export class FsProxy {
  private baseDir: string;

  constructor(skillDataDir: string) {
    // Trim trailing slashes for consistent prefix checking
    this.baseDir = skillDataDir.replace(/\/+$/, '');
  }

  async read(payload: { path: string }): Promise<string> {
    const fullPath = this.resolveSafePath(payload.path);
    return FileSystem.readAsStringAsync(fullPath);
  }

  async write(payload: { path: string; content: string }): Promise<void> {
    const fullPath = this.resolveSafePath(payload.path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(fullPath, payload.content);
  }

  private resolveSafePath(relativePath: string): string {
    // Build full path and normalize by collapsing dot/double-dot segments
    const segments = `${this.baseDir}/${relativePath}`.split('/');
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === '..') {
        resolved.pop();
      } else if (seg !== '.' && seg !== '') {
        resolved.push(seg);
      }
    }
    const fullPath = '/' + resolved.join('/');
    if (!fullPath.startsWith(this.baseDir + '/') && fullPath !== this.baseDir) {
      throw new Error('Path traversal not allowed');
    }
    return fullPath;
  }
}
