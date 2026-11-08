import { describe, expect, it } from 'vitest';
import { createDeterministicRandom, gridForPieceCount, imageOffset } from './puzzle-engine.js';

describe('deterministic puzzle generation helpers', () => {
  it('returns the same sequence for the same puzzle seed', () => {
    const first = createDeterministicRandom('harbor:4:4');
    const second = createDeterministicRandom('harbor:4:4');
    expect(Array.from({ length: 8 }, () => first())).toEqual(Array.from({ length: 8 }, () => second()));
  });

  it('returns a different sequence for different puzzle seeds', () => {
    const first = createDeterministicRandom('harbor:4:4');
    const second = createDeterministicRandom('harbor:5:5');
    expect(first()).not.toBe(second());
  });

  it('keeps image coordinates aligned when a piece is moved', () => {
    const board = { x: 0, y: 0, cellWidth: 100, cellHeight: 40 };
    expect(imageOffset({ x: 140, y: 90, col: 1, row: 2 }, board)).toEqual({ x: 40, y: 10 });
    const offsetBoard = { x: 25, y: 15, cellWidth: 100, cellHeight: 40 };
    expect(imageOffset({ x: 165, y: 105, col: 1, row: 2 }, offsetBoard)).toEqual({ x: 40, y: 10 });
  });

  it('chooses a rectangular grid that preserves the requested piece count', () => {
    expect(gridForPieceCount(36)).toEqual({ rows: 6, cols: 6 });
    expect(gridForPieceCount(100)).toEqual({ rows: 10, cols: 10 });
  });
});
