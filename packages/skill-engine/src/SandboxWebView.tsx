import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { BridgeMessage } from './types';
import { BRIDGE_RUNTIME_JS } from './bridge/bridge-runtime-source';

export interface SandboxWebViewRef {
  sendMessage(data: unknown): void;
  injectToolRegistration(toolName: string, executeFnBody: string): void;
  executeToolRequest(toolName: string, args: Record<string, unknown>, requestId: string): void;
}

interface SandboxWebViewProps {
  onBridgeMessage: (msg: BridgeMessage) => void;
  onToolResult: (requestId: string, result: { success: boolean; data?: unknown; error?: string }) => void;
}

const SANDBOX_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>${BRIDGE_RUNTIME_JS}</script></body></html>`;

export const SandboxWebView = forwardRef<SandboxWebViewRef, SandboxWebViewProps>(
  function SandboxWebView({ onBridgeMessage, onToolResult }, ref) {
    const webViewRef = useRef<WebView>(null);

    const sendMessage = useCallback((data: unknown) => {
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(JSON.stringify(data))} })); true;`,
      );
    }, []);

    const injectToolRegistration = useCallback((toolName: string, executeFnBody: string) => {
      const escaped = JSON.stringify(executeFnBody);
      webViewRef.current?.injectJavaScript(
        `window.__registerTool(${JSON.stringify(toolName)}, ${escaped}); true;`,
      );
    }, []);

    const executeToolRequest = useCallback(
      (toolName: string, args: Record<string, unknown>, requestId: string) => {
        sendMessage({ type: 'execute-tool', toolName, args, requestId });
      },
      [sendMessage],
    );

    useImperativeHandle(ref, () => ({
      sendMessage,
      injectToolRegistration,
      executeToolRequest,
    }));

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let data: any;
        try {
          data = JSON.parse(event.nativeEvent.data);
        } catch {
          return;
        }

        if (data.type === 'tool-result' || data.type === 'tool-error') {
          onToolResult(data.id, data.payload);
        } else {
          onBridgeMessage(data as BridgeMessage);
        }
      },
      [onBridgeMessage, onToolResult],
    );

    return (
      <View style={styles.hidden}>
        <WebView
          ref={webViewRef}
          source={{ html: SANDBOX_HTML }}
          onMessage={handleMessage}
          javaScriptEnabled
          originWhitelist={['*']}
          style={styles.hidden}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  hidden: { width: 0, height: 0, position: 'absolute', opacity: 0 },
});
