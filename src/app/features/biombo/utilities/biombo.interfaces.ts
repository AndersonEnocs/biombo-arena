export type BallColorType = 'color' | 'yellow';

export type BiomboState = 'IDLE' | 'SHUFFLING' | 'WAITING' | 'PICKING' | 'FINISHED';

export interface BiomboConfig {
  id: string;
  title: string;
  ballAmount: number;
  resultCount: number;
  ballType: BallColorType;
  customResult?: number[];
}

export interface BiomboEventPayload {
  biomboId: string;
  ballNumber: number;
  extractedList: number[];
  state: BiomboState;
}

export function generateBiomboResults(config: BiomboConfig): number[] {
  const safeCount = Math.max(1, Math.min(config.resultCount || 1, config.ballAmount || 1));
  const custom = Array.isArray(config.customResult) ? config.customResult.slice() : [];

  if (custom.length > 0) {
    const normalized = custom
      .map((value) => Math.round(Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= config.ballAmount)
      .slice(0, safeCount);

    if (normalized.length === safeCount) {
      return [...new Set(normalized)].slice(0, safeCount).sort((a, b) => a - b);
    }
  }

  const pool = Array.from({ length: config.ballAmount }, (_, index) => index + 1);
  const draws: number[] = [];

  while (draws.length < safeCount && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const selected = pool.splice(index, 1)[0];
    draws.push(selected);
  }

  return draws.sort((a, b) => a - b);
}