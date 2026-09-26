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
      <app-biombo-canvas [config]="config"></app-biombo-canvas>

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

      <!-- HUD Superior Flotante (Glassmorphism) -->
      <div class="hud-top-bar">
        <div class="biombo-meta">
          <span class="biombo-title">{{ config.title }}</span>
          <span class="status-pill" [class]="engine.state().toLowerCase()">
            {{ engine.state() }}
          </span>
        </div>
        <div class="round-info">
          <span>RONDA: 3 BOLAS</span>
        </div>
      </div>

      <!-- HUD Inferior Flotante: solo control de la ronda -->
      <div class="hud-bottom-dock">
        <ion-button
          class="cyber-action-btn"
          [disabled]="!engine.isReady() || (engine.state() !== 'IDLE' && engine.state() !== 'FINISHED')"
          (click)="engine.play()">
          {{ engine.state() === 'FINISHED' ? 'NUEVA RONDA' : 'INICIAR SORTEO' }}
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
    .hud-top-bar {
      position: absolute;
      top: 16px;
      left: 16px;
      right: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
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
  `],
})
export class BiomboCardComponent {
  @Input({ required: true }) config!: BiomboConfig;
  public readonly engine: BiomboEngineService = inject(BiomboEngineService);
}