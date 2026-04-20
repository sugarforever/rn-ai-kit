export {};

const nodeCrypto = require('crypto');

module.exports = {
  getRandomBytes: jest.fn((size: number): Uint8Array => {
    return new Uint8Array(nodeCrypto.randomBytes(size));
  }),
  randomUUID: jest.fn((): string => nodeCrypto.randomUUID()),
  digestStringAsync: jest.fn(async (_algo: string, data: string): Promise<string> => {
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
};
