// This script is injected into the WebView sandbox.
// It provides bridged APIs (fetch, sqlite, fs) and handles tool execution.

(function () {
  const pendingRequests = new Map();
  let requestCounter = 0;

  function sendBridgeRequest(type, payload) {
    return new Promise((resolve, reject) => {
      const id = `br-${++requestCounter}`;
      pendingRequests.set(id, { resolve, reject });
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ id, type, payload })
      );
    });
  }

  window.addEventListener('message', function (event) {
    let data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return;
    }

    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.success) {
        resolve(data.data);
      } else {
        reject(new Error(data.error || 'Bridge request failed'));
      }
      return;
    }

    if (data.type === 'execute-tool') {
      executeTool(data.toolName, data.args, data.requestId);
    }
  });

  window.fetch = async function (url, options) {
    const result = await sendBridgeRequest('fetch', { url, options: options || {} });
    return {
      status: result.status,
      ok: result.status >= 200 && result.status < 300,
      headers: new Headers(result.headers || {}),
      text: () => Promise.resolve(result.body),
      json: () => Promise.resolve(JSON.parse(result.body)),
    };
  };

  window.sqlite = {
    exec: (sql, params) => sendBridgeRequest('sqlite-exec', { sql, params }),
    query: (sql, params) => sendBridgeRequest('sqlite-query', { sql, params }),
  };

  window.fs = {
    read: (path) => sendBridgeRequest('fs-read', { path }),
    write: (path, content) => sendBridgeRequest('fs-write', { path, content }),
  };

  const tools = {};

  window.__registerTool = function (name, executeFnBody) {
    tools[name] = new Function('return ' + executeFnBody)();
  };

  async function executeTool(toolName, args, requestId) {
    try {
      const fn = tools[toolName];
      if (!fn) throw new Error('Tool not found: ' + toolName);
      const result = await fn(args);
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          id: requestId,
          type: 'tool-result',
          payload: { success: true, data: result },
        })
      );
    } catch (err) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          id: requestId,
          type: 'tool-error',
          payload: { success: false, error: err.message || String(err) },
        })
      );
    }
  }

  window.__bridgeReady = true;
})();
