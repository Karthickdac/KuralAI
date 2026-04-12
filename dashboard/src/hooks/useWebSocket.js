/**
 * useWebSocket - Real-time event feed from KuralAI backend
 * Connects to the WebSocket server with JWT auth.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem('kuralai_token');
    if (!token || !mountedRef.current) return;

    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage && mountedRef.current) onMessage(data);
      } catch (e) {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setConnected(false);
        // Reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
