import * as FileSystem from 'expo-file-system';

export class FsProxy {
  private baseDir: string;

  constructor(skillDataDir: string) {
    this.baseDir = skillDataDir;
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
    const normalized = relativePath.replace(/\.\./g, '').replace(/^\//, '');
    return `${this.baseDir}/${normalized}`;
  }
}
