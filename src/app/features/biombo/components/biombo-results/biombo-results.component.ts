import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { BiomboState } from '../../utilities/biombo.interfaces';

export interface BiomboResultBoard {
  title: string;
  state: BiomboState;
  extracted: number[];
  resultCount: number;
}

@Component({
  selector: 'app-biombo-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="results-panel" aria-label="Resultados de los biombos">
      <header class="results-heading">
        <span class="results-indicator" aria-hidden="true"></span>
        <h2>RESULTADOS</h2>
      </header>

      <div class="results-grid" aria-live="polite">
        @for (board of boards; track board.title) {
          <article class="result-card">
            <div class="result-card-heading">
              <h3>{{ board.title }}</h3>
              <span class="result-status" [class]="board.state.toLowerCase()">
                {{ stateLabel(board.state) }}
              </span>
            </div>

            <div class="result-balls" [attr.aria-label]="board.extracted.length + ' de ' + board.resultCount + ' resultados'">
              @for (number of board.extracted; track $index) {
                <span class="result-ball">{{ number }}</span>
              } @empty {
                <span class="empty-results">En espera del sorteo</span>
              }
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [`
    :host {
      position: absolute;
      left: 20px;
      bottom: 20px;
      z-index: 20;
      display: block;
      width: min(220px, calc(100% - 40px));
      pointer-events: none;
    }

    :host(.multi-board) {
      width: min(220px, calc(100% - 40px));
    }

    .results-panel {
      padding: 10px;
      color: #f4f6fa;
      background: rgba(10, 12, 18, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .results-heading,
    .result-card-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .results-heading {
      justify-content: flex-start;
      margin-bottom: 10px;
    }

    .results-indicator {
      width: 7px;
      height: 7px;
      flex: 0 0 7px;
      background: #00ffaa;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(0, 255, 170, 0.65);
    }

    .results-heading h2,
    .result-card-heading h3 {
      overflow: hidden;
      margin: 0;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .results-heading h2 {
      color: #f4f6fa;
      font-size: 0.68rem;
      letter-spacing: 1.5px;
    }

    .results-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .result-card {
      min-width: 0;
      padding: 9px;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
    }

    .result-card-heading {
      margin-bottom: 8px;
    }

    .result-card-heading h3 {
      color: #dce1eb;
      font-size: 0.62rem;
      letter-spacing: 0.7px;
    }

    .result-status {
      flex: 0 0 auto;
      color: #8892a6;
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0.45px;
      text-transform: uppercase;
    }

    .result-status.shuffling,
    .result-status.waiting,
    .result-status.picking {
      color: #ffd200;
    }

    .result-status.finished {
      color: #00ffaa;
    }

    .result-balls {
      display: flex;
      min-height: 30px;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .result-ball {
      display: grid;
      width: 30px;
      height: 30px;
      place-items: center;
      color: #101218;
      background: linear-gradient(145deg, #ffe45c, #ffd200 72%);
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(255, 210, 0, 0.22), inset 0 1px 2px rgba(255, 255, 255, 0.65);
      font-size: 0.75rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }

    .empty-results {
      color: #8892a6;
      font-size: 0.65rem;
    }

    @media (max-width: 520px) {
      :host,
      :host(.multi-board) {
        bottom: 84px;
        left: 12px;
        width: min(220px, calc(100% - 24px));
      }

      .results-panel {
        padding: 10px;
      }

      .results-grid {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
      }

      .result-card {
        padding: 7px;
      }

      .result-card-heading {
        gap: 4px;
      }

      .result-card-heading h3 {
        font-size: 0.55rem;
      }

      .result-status {
        font-size: 0.48rem;
      }
    }
  `],
})
export class BiomboResultsComponent {
  @Input({ required: true }) boards: BiomboResultBoard[] = [];

  public stateLabel(state: BiomboState): string {
    switch (state) {
      case 'SHUFFLING':
        return 'MEZCLANDO';
      case 'WAITING':
        return 'PREPARANDO';
      case 'PICKING':
        return 'EXTRAYENDO';
      case 'FINISHED':
        return 'COMPLETADO';
      default:
        return 'EN ESPERA';
    }
  }
}
