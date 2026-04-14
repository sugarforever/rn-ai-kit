import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
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

// Lazily built to avoid computing at module scope (safe for React Native)
let _sandboxHtml: string | null = null;
function getSandboxHtml(): string {
  if (!_sandboxHtml) {
    _sandboxHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>${BRIDGE_RUNTIME_JS}</script></body></html>`;
  }
  return _sandboxHtml;
}

export const SandboxWebView = forwardRef<SandboxWebViewRef, SandboxWebViewProps>(
  function SandboxWebView({ onBridgeMessage, onToolResult }, ref) {
    const webViewRef = useRef<WebView>(null);

    // Use refs for callbacks to prevent unnecessary WebView re-renders
    const onBridgeMessageRef = useRef(onBridgeMessage);
    const onToolResultRef = useRef(onToolResult);
    useEffect(() => { onBridgeMessageRef.current = onBridgeMessage; }, [onBridgeMessage]);
    useEffect(() => { onToolResultRef.current = onToolResult; }, [onToolResult]);

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
          onToolResultRef.current(data.id, data.payload);
        } else {
          onBridgeMessageRef.current(data as BridgeMessage);
        }
      },
      [], // stable reference — no dependency on props
    );

    return (
      <View style={styles.hidden}>
        <WebView
          ref={webViewRef}
          source={{ html: getSandboxHtml() }}
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
