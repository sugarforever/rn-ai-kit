// Type stub for expo-crypto (Expo SDK 55)
// The actual package will be installed in the app workspace.
declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm {
    SHA1 = 'SHA-1',
    SHA256 = 'SHA-256',
    SHA384 = 'SHA-384',
    SHA512 = 'SHA-512',
    MD2 = 'MD2',
    MD4 = 'MD4',
    MD5 = 'MD5',
  }

  export function getRandomBytes(byteCount: number): Uint8Array;

  export function digestStringAsync(
    algorithm: CryptoDigestAlgorithm,
    data: string,
    options?: { encoding?: 'hex' | 'base64' },
  ): Promise<string>;
}
