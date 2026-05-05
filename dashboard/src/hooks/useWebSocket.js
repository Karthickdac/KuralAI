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
  const onMessageRef = useRef(onMessage);

  // Keep latest onMessage in a ref so changing the callback does NOT trigger reconnects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = localStorage.getItem('kuralai_token');
    if (!token || !mountedRef.current) return;

    // Avoid duplicate sockets if one is already open/connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessageRef.current && mountedRef.current) onMessageRef.current(data);
      } catch (e) {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (mountedRef.current) {
        setConnected(false);
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      try { ws.close(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimeout.current);
      try { wsRef.current?.close(); } catch (_) {}
      wsRef.current = null;
    };
  }, [connect]);

  return { connected };
}
