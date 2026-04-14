// Jest manual mock for expo-crypto — uses Node.js crypto as a test stand-in
const nodeCrypto = require('crypto');

module.exports = {
  getRandomBytes: jest.fn((size: number): Uint8Array => {
    return new Uint8Array(nodeCrypto.randomBytes(size));
  }),
  digestStringAsync: jest.fn(async (_algo: string, data: string): Promise<string> => {
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
};
