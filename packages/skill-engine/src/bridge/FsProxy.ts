import * as FileSystem from 'expo-file-system';
import * as path from 'path';

export class FsProxy {
  private baseDir: string;

  constructor(skillDataDir: string) {
    // Normalize baseDir to ensure consistent prefix checking
    this.baseDir = path.resolve(skillDataDir);
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
    const resolved = path.resolve(this.baseDir, relativePath);
    if (!resolved.startsWith(this.baseDir + '/') && resolved !== this.baseDir) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }
}
