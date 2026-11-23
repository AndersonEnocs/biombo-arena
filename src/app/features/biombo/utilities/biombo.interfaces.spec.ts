import { describe, expect, it } from 'vitest';
import { generateBiomboResults } from './biombo.interfaces';

describe('generateBiomboResults', () => {
    it('genera exactamente una bola dentro del rango 0 a 9', () => {
        const result = generateBiomboResults({
            ballAmount: 10,
            resultCount: 1,
            ballType: 'color',
            id: 'demo',
            title: 'demo',
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThanOrEqual(0);
        expect(result[0]).toBeLessThanOrEqual(9);
    });

    it('usa resultados personalizados si los recibe', () => {
        const result = generateBiomboResults({
            ballAmount: 10,
            resultCount: 1,
            ballType: 'yellow',
            id: 'demo',
            title: 'demo',
            customResult: [7],
        });

        expect(result).toEqual([7]);
    });
});
