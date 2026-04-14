import { BridgeHost } from '../src/bridge/BridgeHost';
import type { BridgeMessage, BridgeResponse } from '../src/types';

describe('BridgeHost', () => {
  let bridge: BridgeHost;
  const mockSendToWebView = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new BridgeHost({
      skillId: 'test-skill',
      allowedDomains: ['api.example.com'],
      sendToWebView: mockSendToWebView,
    });
  });

  it('handles fetch messages by calling FetchProxy', async () => {
    const msg: BridgeMessage = {
      id: 'req-1',
      type: 'fetch',
      payload: { url: 'https://api.example.com/data', options: {} },
    };

    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
      headers: new Map([['content-type', 'application/json']]),
    });

    await bridge.handleMessage(msg);

    expect(mockSendToWebView).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1', success: true }),
    );
  });

  it('rejects fetch to disallowed domains', async () => {
    const msg: BridgeMessage = {
      id: 'req-2',
      type: 'fetch',
      payload: { url: 'https://evil.com/steal', options: {} },
    };

    await bridge.handleMessage(msg);

    expect(mockSendToWebView).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-2',
        success: false,
        error: expect.stringContaining('not allowed'),
      }),
    );
  });

  it('handles unknown message types with error', async () => {
    const msg: BridgeMessage = {
      id: 'req-3',
      type: 'unknown-type' as any,
      payload: {},
    };

    await bridge.handleMessage(msg);

    expect(mockSendToWebView).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-3',
        success: false,
        error: expect.stringContaining('Unknown'),
      }),
    );
  });
});
