import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonSpinner } from '@ionic/angular';
import { BiomboCanvasComponent } from '../biombo-canvas/biombo-canvas.component';
import { BiomboConfig } from '../../utilities/biombo.interfaces';
import { BiomboEngineService } from '../../services/biombo-engine.service';

@Component({
  selector: 'app-biombo-card',
  standalone: true,
  imports: [CommonModule, BiomboCanvasComponent, IonButton, IonSpinner],
  providers: [BiomboEngineService],
  template: `
    <div class="biombo-stage-wrapper">
      <!-- Visor 3D a pantalla completa -->
      <app-biombo-canvas
        [config]="config"
        [secondaryConfig]="secondaryConfig"
        [tertiaryConfig]="tertiaryConfig"
        [quaternaryConfig]="quaternaryConfig">
      </app-biombo-canvas>

    <!-- Feedback de Carga / Error -->
      @if (!engine.isReady()) {
        <div class="loader-backdrop">
          @if (engine.errorMessage()) {
            <p style="color: #ff4d4d; font-size: 1rem;">⚠️ ERROR DE CARGA:</p>
            <p style="color: #ffffff; font-size: 0.85rem; max-width: 80%; text-align: center;">
              {{ engine.errorMessage() }}
            </p>
          } @else {
            <ion-spinner name="crescent" color="warning"></ion-spinner>
            <p>CALIBRANDO BIOMBO 3D...</p>
          }
        </div>
      }

      <button
        type="button"
        class="background-control background-control-previous"
        [disabled]="!engine.isReady() || engine.isChangingBackground()"
        [attr.aria-label]="'Fondo anterior. Actual: ' + engine.backgroundName()"
        [title]="'Fondo anterior. Actual: ' + engine.backgroundName()"
        (click)="engine.changeBackground(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        class="background-control background-control-next"
        [disabled]="!engine.isReady() || engine.isChangingBackground()"
        [attr.aria-label]="'Fondo siguiente. Actual: ' + engine.backgroundName()"
        [title]="'Fondo siguiente. Actual: ' + engine.backgroundName()"
        (click)="engine.changeBackground(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      @if (engine.backgroundError()) {
        <p class="background-error" role="alert">{{ engine.backgroundError() }}</p>
      }

      <!-- HUD Superior Flotante (Glassmorphism) -->
      <div class="hud-top-bar"
        [class.dual-hud]="!!secondaryConfig"
        [class.triple-hud]="!!tertiaryConfig"
        [class.quadruple-hud]="!!quaternaryConfig">
        <div class="biombo-meta">
          <div class="machine-meta">
            <span class="biombo-title">{{ config.title }}</span>
            <span class="status-pill" [class]="engine.state().toLowerCase()">
              {{ engine.state() }}
            </span>
          </div>
          @if (secondaryConfig) {
            <div class="machine-meta">
              <span class="biombo-title">{{ secondaryConfig.title }}</span>
              <span class="status-pill" [class]="engine.secondaryState().toLowerCase()">
                {{ engine.secondaryState() }}
              </span>
            </div>
          }
          @if (tertiaryConfig) {
            <div class="machine-meta">
              <span class="biombo-title">{{ tertiaryConfig.title }}</span>
              <span class="status-pill" [class]="engine.tertiaryState().toLowerCase()">
                {{ engine.tertiaryState() }}
              </span>
            </div>
          }
          @if (quaternaryConfig) {
            <div class="machine-meta">
              <span class="biombo-title">{{ quaternaryConfig.title }}</span>
              <span class="status-pill" [class]="engine.quaternaryState().toLowerCase()">
                {{ engine.quaternaryState() }}
              </span>
            </div>
          }
        </div>
        <div class="round-info">
          <span>RONDA: 3 BOLAS</span>
        </div>
      </div>

      <!-- HUD Inferior Flotante: solo control de la ronda -->
      <div class="hud-bottom-dock">
        <ion-button
          class="cyber-action-btn"
          [disabled]="!engine.isReady() || !engine.canStartRound()"
          (click)="engine.play()">
          {{ engine.isRoundFinished() ? 'NUEVA RONDA' : 'INICIAR SORTEO' }}
        </ion-button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .biombo-stage-wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }
    .loader-backdrop {
      position: absolute;
      inset: 0;
      background: #080a0f;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 14px;
      z-index: 100;
    }
    .loader-backdrop p {
      color: #ffd200;
      font-size: 0.8rem;
      letter-spacing: 2px;
      font-weight: 700;
      margin: 0;
    }
    .background-control {
      position: absolute;
      top: 36px;
      z-index: 30;
      display: grid;
      width: 40px;
      height: 40px;
      place-items: center;
      padding: 0;
      color: #f4f6fa;
      background: rgba(10, 12, 18, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      cursor: pointer;
      transform: translateY(-50%);
      transition: color 160ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease;
    }
    .background-control-previous {
      left: 22px;
    }
    .background-control-next {
      right: 22px;
    }
    .background-control:hover:not(:disabled) {
      color: #ffd200;
      background: rgba(10, 12, 18, 0.92);
      border-color: rgba(255, 210, 0, 0.65);
    }
    .background-control:focus-visible {
      outline: 2px solid #ffd200;
      outline-offset: 3px;
    }
    .background-control:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .background-control svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }
    .background-error {
      position: absolute;
      top: 62px;
      left: 50%;
      z-index: 31;
      max-width: calc(100% - 32px);
      margin: 0;
      padding: 7px 12px;
      color: #fff;
      background: rgba(120, 20, 20, 0.92);
      border: 1px solid rgba(255, 100, 100, 0.5);
      border-radius: 8px;
      font-size: 0.72rem;
      text-align: center;
      transform: translateX(-50%);
    }
    .hud-top-bar {
      position: absolute;
      top: 16px;
      left: 16px;
      right: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 58px;
      background: rgba(10, 12, 18, 0.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      z-index: 20;
    }
    .biombo-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .machine-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dual-hud .biombo-meta {
      flex-wrap: wrap;
      row-gap: 6px;
    }
    .dual-hud .biombo-title {
      font-size: 0.78rem;
      letter-spacing: 0.8px;
    }
    .triple-hud {
      gap: 8px;
      padding: 8px 54px;
    }
    .triple-hud .biombo-meta {
      flex-wrap: wrap;
      gap: 6px 10px;
    }
    .triple-hud .machine-meta {
      gap: 6px;
    }
    .triple-hud .biombo-title {
      font-size: 0.7rem;
      letter-spacing: 0.5px;
    }
    .triple-hud .status-pill {
      font-size: 0.58rem;
      padding: 3px 6px;
    }
    .quadruple-hud {
      gap: 6px;
      padding: 6px 48px;
    }
    .quadruple-hud .biombo-meta {
      flex-wrap: wrap;
      gap: 4px 8px;
    }
    .quadruple-hud .machine-meta {
      gap: 4px;
    }
    .quadruple-hud .biombo-title {
      font-size: 0.62rem;
      letter-spacing: 0.3px;
    }
    .quadruple-hud .status-pill {
      font-size: 0.52rem;
      padding: 2px 5px;
    }
    .biombo-title {
      color: #fff;
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 1.5px;
    }
    .status-pill {
      font-size: 0.65rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: #1c202a;
      color: #8892b0;
    }
    .status-pill.shuffling, .status-pill.waiting, .status-pill.picking {
      background: rgba(255, 210, 0, 0.2);
      color: #ffd200;
      border: 1px solid #ffd200;
    }
    .status-pill.finished {
      background: rgba(0, 255, 170, 0.2);
      color: #00ffaa;
      border: 1px solid #00ffaa;
    }
    .round-info {
      font-size: 0.75rem;
      font-weight: 700;
      color: #8e95a5;
      letter-spacing: 1px;
    }
    .hud-bottom-dock {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(10, 12, 18, 0.75);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      z-index: 20;
    }
    .cyber-action-btn {
      --background: #ffd200;
      --color: #000;
      --border-radius: 10px;
      font-weight: 900;
      letter-spacing: 1.5px;
      margin: 0;
      height: 46px;
    }
    @media (max-width: 520px) {
      .background-control {
        top: 34px;
        width: 34px;
        height: 34px;
        border-radius: 10px;
      }
      .background-control-previous {
        left: 20px;
      }
      .background-control-next {
        right: 20px;
      }
      .background-control svg {
        width: 18px;
        height: 18px;
      }
      .hud-top-bar {
        padding-right: 48px;
        padding-left: 48px;
      }
      .triple-hud {
        padding-right: 46px;
        padding-left: 46px;
      }
      .quadruple-hud {
        padding-right: 40px;
        padding-left: 40px;
      }
    }
  `],
})
export class BiomboCardComponent {
  @Input({ required: true }) config!: BiomboConfig;
  @Input() secondaryConfig: BiomboConfig | null = null;
  @Input() tertiaryConfig: BiomboConfig | null = null;
  @Input() quaternaryConfig: BiomboConfig | null = null;
  public readonly engine: BiomboEngineService = inject(BiomboEngineService);
}