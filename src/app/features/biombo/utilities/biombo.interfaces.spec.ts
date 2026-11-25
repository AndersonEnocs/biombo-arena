import { describe, expect, it } from 'vitest';
import { generateBiomboResults } from './biombo.interfaces';

describe('generateBiomboResults', () => {
    it('genera exactamente 3 bolas únicas dentro del rango configurado', () => {
        const result = generateBiomboResults({
            ballAmount: 30,
            resultCount: 3,
            ballType: 'color',
            id: 'demo',
            title: 'demo',
        });

        expect(result).toHaveLength(3);
        expect(new Set(result).size).toBe(3);
        result.forEach((value) => {
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(30);
        });
    });

    it('usa resultados personalizados si los recibe', () => {
        const result = generateBiomboResults({
            ballAmount: 30,
            resultCount: 3,
            ballType: 'yellow',
            id: 'demo',
            title: 'demo',
            customResult: [12, 5, 29],
        });

        expect(result).toEqual([5, 12, 29]);
    });
});
