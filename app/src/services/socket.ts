import { Socket } from 'socket.io-client';

/**
 * SocketService
 * 
 * Handles terminal communication using an existing socket connection.
 * This service should use the same socket as AppClient to maintain
 * the same session ID for pairing verification.
 * 
 * SECURITY NOTE: This service relies on AppClient for pairing verification.
 * The broker requires apps to be paired with runners before allowing
 * terminal connections.
 */
class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  /**
   * Set the socket to use for terminal communication
   * This should be the same socket used by AppClient
   */
  setSocket(socket: Socket): void {
    // Clean up old socket listeners if any
    if (this.socket) {
      ['terminal_output', 'session_created', 'session_ended', 'runner_offline'].forEach(
        (event) => {
          this.socket?.off(event);
        }
      );
    }

    this.socket = socket;

    // Set up event listeners
    ['terminal_output', 'session_created', 'session_ended', 'runner_offline'].forEach(
      (event) => {
        this.socket?.on(event, (data) => {
          this.emit(event, data);
        });
      }
    );

    console.log('✅ SocketService configured with AppClient socket');
  }

  connectToRunner(runnerId: string, sessionId: string): void {
    if (!this.socket) {
      console.error('❌ SocketService: No socket configured');
      return;
    }
    this.socket.emit('connect_runner', { runnerId, sessionId });
  }

  sendInput(sessionId: string, data: string): void {
    if (!this.socket) {
      console.error('❌ SocketService: No socket configured');
      return;
    }
    this.socket.emit('terminal_input', { sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (!this.socket) {
      console.error('❌ SocketService: No socket configured');
      return;
    }
    this.socket.emit('terminal_resize', { sessionId, cols, rows });
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  disconnect(): void {
    // Don't disconnect the socket - it's managed by AppClient
    // Just clean up listeners
    this.listeners.clear();
  }
}

export const socketService = new SocketService();
