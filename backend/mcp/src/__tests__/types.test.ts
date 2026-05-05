/**
 * Unit tests for mcp-types.ts - cursor utilities and error classes
 */

import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  McpToolError,
  NodeNotFoundError,
  DeviceNotConnectedError,
  PaginationCursor,
} from '../types/mcp-types';

describe('Cursor Utilities', () => {
  describe('encodeCursor', () => {
    it('should encode cursor to base64 string', () => {
      const cursor: PaginationCursor = { index: 0, parentId: 'node_1' };
      const encoded = encodeCursor(cursor);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should produce different encodings for different cursors', () => {
      const cursor1: PaginationCursor = { index: 0, parentId: 'node_1' };
      const cursor2: PaginationCursor = { index: 10, parentId: 'node_2' };
      expect(encodeCursor(cursor1)).not.toBe(encodeCursor(cursor2));
    });
  });

  describe('decodeCursor', () => {
    it('should decode cursor back to original value', () => {
      const original: PaginationCursor = { index: 5, parentId: 'FrameLayout_42' };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(original);
    });

    it('should handle cursor with index 0', () => {
      const original: PaginationCursor = { index: 0, parentId: 'root' };
      const decoded = decodeCursor(encodeCursor(original));
      expect(decoded).toEqual(original);
    });

    it('should handle large indices', () => {
      const original: PaginationCursor = { index: 9999, parentId: 'node_123' };
      const decoded = decodeCursor(encodeCursor(original));
      expect(decoded).toEqual(original);
    });
  });

  describe('encode/decode roundtrip', () => {
    it('should preserve all cursor fields through encode/decode cycle', () => {
      const cursors: PaginationCursor[] = [
        { index: 0, parentId: 'node_1' },
        { index: 50, parentId: 'FrameLayout_99' },
        { index: 100, parentId: 'Button_5' },
      ];

      for (const original of cursors) {
        const decoded = decodeCursor(encodeCursor(original));
        expect(decoded).toEqual(original);
      }
    });
  });

  describe('decodeCursor error handling', () => {
    it('should throw error for invalid base64', () => {
      expect(() => decodeCursor('not-valid-base64!!!')).toThrow();
    });

    it('should throw error for non-JSON base64', () => {
      const nonJson = Buffer.from('not json').toString('base64');
      expect(() => decodeCursor(nonJson)).toThrow();
    });

    it('should throw error for JSON that is not a cursor object', () => {
      const notCursor = Buffer.from('{"foo": "bar"}').toString('base64');
      expect(() => decodeCursor(notCursor)).toThrow("Invalid cursor: missing required fields");
    });

    it('should throw error for cursor with missing index', () => {
      const missingIndex = Buffer.from('{"parentId": "node_1"}').toString('base64');
      expect(() => decodeCursor(missingIndex)).toThrow("Invalid cursor: missing required fields");
    });

    it('should throw error for cursor with missing parentId', () => {
      const missingParentId = Buffer.from('{"index": 5}').toString('base64');
      expect(() => decodeCursor(missingParentId)).toThrow("Invalid cursor: missing required fields");
    });
  });
});

describe('Error Classes', () => {
  describe('McpToolError', () => {
    it('should create error with correct properties', () => {
      const error = new McpToolError('Test error', 'TEST_CODE', 400, { key: 'value' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('McpToolError');
    });

    it('should default statusCode to 400', () => {
      const error = new McpToolError('Test', 'TEST');
      expect(error.statusCode).toBe(400);
    });

    it('should be instance of Error', () => {
      const error = new McpToolError('Test', 'TEST');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof McpToolError).toBe(true);
    });
  });

  describe('NodeNotFoundError', () => {
    it('should create error with nodeId in message', () => {
      const error = new NodeNotFoundError('Button_42');

      expect(error.message).toBe('Node not found: Button_42');
      expect(error.code).toBe('NODE_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NodeNotFoundError');
    });

    it('should include nodeId in details', () => {
      const error = new NodeNotFoundError('FrameLayout_99');
      expect(error.details).toEqual({ nodeId: 'FrameLayout_99', availableIds: undefined });
    });

    it('should include availableIds limited to 10', () => {
      const availableIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
      const error = new NodeNotFoundError('node_1', availableIds);

      expect(error.details?.availableIds).toHaveLength(10);
      expect(error.details?.availableIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    });

    it('should handle empty availableIds', () => {
      const error = new NodeNotFoundError('node_1', []);
      expect(error.details?.availableIds).toEqual([]);
    });
  });

  describe('DeviceNotConnectedError', () => {
    it('should create error with deviceId in message', () => {
      const error = new DeviceNotConnectedError('emulator-5554');

      expect(error.message).toBe('Device not connected: emulator-5554');
      expect(error.code).toBe('DEVICE_NOT_CONNECTED');
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('DeviceNotConnectedError');
    });

    it('should include deviceId in details', () => {
      const error = new DeviceNotConnectedError('device-abc');
      expect(error.details).toEqual({ deviceId: 'device-abc' });
    });
  });
});