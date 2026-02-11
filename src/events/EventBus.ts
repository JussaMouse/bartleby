// src/events/EventBus.ts
import { debug } from '../utils/logger.js';
import type { GardenRecord } from '../services/garden.js';

/**
 * Event Bus for loosely-coupled communication between services.
 *
 * Design principles:
 * - Services emit events without knowing who's listening
 * - Listeners register for events without coupling to emitters
 * - Events are typed for safety
 * - Synchronous execution (listeners run immediately)
 * - No error propagation (listener errors are logged but don't fail emit)
 */

// === Event Types ===

export type GardenEvent =
  | { type: 'record.created'; record: GardenRecord }
  | { type: 'record.updated'; record: GardenRecord; previous: GardenRecord }
  | { type: 'record.deleted'; record: GardenRecord }
  | { type: 'relationship.created'; sourceId: string; targetId: string; relationType: string }
  | { type: 'relationship.deleted'; sourceId: string; targetId: string; relationType: string };

export type EventType = GardenEvent['type'];

export type EventListener<T extends GardenEvent = GardenEvent> = (event: T) => void | Promise<void>;

// === Event Bus ===

export class EventBus {
  private listeners: Map<EventType, Set<EventListener>>;
  private enabled: boolean;

  constructor() {
    this.listeners = new Map();
    this.enabled = true;
  }

  /**
   * Register a listener for an event type
   * @param eventType - The event type to listen for
   * @param listener - The callback function
   * @returns Unsubscribe function
   */
  on<T extends GardenEvent>(
    eventType: T['type'],
    listener: EventListener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const listeners = this.listeners.get(eventType)!;
    listeners.add(listener as EventListener);

    debug('Event listener registered', { eventType, listenerCount: listeners.size });

    // Return unsubscribe function
    return () => this.off(eventType, listener);
  }

  /**
   * Remove a listener for an event type
   * @param eventType - The event type
   * @param listener - The callback function to remove
   */
  off<T extends GardenEvent>(
    eventType: T['type'],
    listener: EventListener<T>
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener);
      debug('Event listener removed', { eventType, listenerCount: listeners.size });

      // Clean up empty sets
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Emit an event to all registered listeners
   * @param event - The event to emit
   */
  async emit(event: GardenEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const listeners = this.listeners.get(event.type);
    if (!listeners || listeners.size === 0) {
      return;
    }

    debug('Event emitted', {
      type: event.type,
      listenerCount: listeners.size,
      recordId: 'record' in event ? event.record.id : undefined
    });

    // Execute all listeners (synchronously for now, can make async later)
    const promises: Promise<void>[] = [];
    for (const listener of listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (err) {
        // Log but don't propagate errors
        console.error(`Event listener error for ${event.type}:`, err);
      }
    }

    // Wait for async listeners
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Remove all listeners for an event type (or all events if no type specified)
   * @param eventType - Optional event type to clear
   */
  clear(eventType?: EventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
      debug('Event listeners cleared', { eventType });
    } else {
      this.listeners.clear();
      debug('All event listeners cleared');
    }
  }

  /**
   * Get listener count for an event type
   * @param eventType - The event type
   * @returns Number of registered listeners
   */
  listenerCount(eventType: EventType): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }

  /**
   * Temporarily disable event emission (useful for bulk operations)
   */
  disable(): void {
    this.enabled = false;
    debug('EventBus disabled');
  }

  /**
   * Re-enable event emission
   */
  enable(): void {
    this.enabled = true;
    debug('EventBus enabled');
  }

  /**
   * Check if event bus is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics about registered listeners
   */
  getStats(): { totalListeners: number; eventTypes: string[] } {
    let totalListeners = 0;
    const eventTypes: string[] = [];

    for (const [type, listeners] of this.listeners.entries()) {
      totalListeners += listeners.size;
      eventTypes.push(type);
    }

    return { totalListeners, eventTypes };
  }
}

// === Singleton Instance ===

let eventBusInstance: EventBus | null = null;

/**
 * Get the global EventBus instance (singleton)
 */
export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

/**
 * Reset the global EventBus instance (useful for testing)
 */
export function resetEventBus(): void {
  eventBusInstance = null;
}
