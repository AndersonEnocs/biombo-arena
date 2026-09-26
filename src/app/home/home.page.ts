import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular';

import { BiomboConfig } from '../features/biombo/utilities/biombo.interfaces';
import { BiomboCardComponent } from '../features/biombo/components/biombo-card/biombo-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    BiomboCardComponent,
    IonContent,
    IonHeader,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonToolbar,
  ],
  template: `
    <ion-header class="ion-no-border cyber-header">
      <ion-toolbar>
        <div class="header-container">
          <div class="brand">
            <span class="pulse-dot"></span>
            <h2>TESLA LOTTERY ARENA 3D</h2>
          </div>

          <ion-segment [value]="mode()" (ionChange)="mode.set($any($event).detail.value)" class="mode-segment">
            <ion-segment-button value="single">
              <ion-label>1 BIOMBO (FULL VIEW)</ion-label>
            </ion-segment-button>
            <ion-segment-button value="dual">
              <ion-label>2 BIOMBOS (DUAL ARENA)</ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" [scrollY]="false">
      <div class="viewport-stage" [class.dual-mode]="mode() === 'dual'">
        <div class="stage-slot slot-alfa">
          <app-biombo-card [config]="biomboAlfa"></app-biombo-card>
        </div>

        @if (mode() === 'dual') {
          <div class="stage-slot slot-beta">
            <app-biombo-card [config]="biomboBeta"></app-biombo-card>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --header-h: 60px;
    }
    .cyber-header {
      background: #090b10;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    ion-toolbar {
      --background: transparent;
      --color: #ffffff;
      --min-height: var(--header-h);
    }
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      width: 100%;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 2.5px;
      color: #ffffff;
      text-transform: uppercase;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #00ffaa;
      border-radius: 50%;
      box-shadow: 0 0 10px #00ffaa;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .mode-segment {
      max-width: 380px;
      --background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    ion-segment-button {
      --color: #8e95a5;
      --color-checked: #ffd200;
      --indicator-color: rgba(255, 210, 0, 0.15);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .viewport-stage {
      display: grid;
      grid-template-columns: 1fr;
      width: 100vw;
      height: 100%;
      background: #07080b;
      overflow: hidden;
    }
    .viewport-stage.dual-mode {
      grid-template-columns: 1fr 1fr;
    }
    .stage-slot {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-right: 1px solid rgba(255, 255, 255, 0.05);
    }
  `],
})
export class HomePage {
  public mode = signal<'single' | 'dual'>('single');

  public biomboAlfa: BiomboConfig = {
    id: 'biombo-alfa',
    title: 'BIOMBO ALFA',
    ballAmount: 30,
    resultCount: 3, // Regla estricta: 3 bolas
    ballType: 'color',
  };

  public biomboBeta: BiomboConfig = {
    id: 'biombo-beta',
    title: 'BIOMBO BETA',
    ballAmount: 30,
    resultCount: 3, // Regla estricta: 3 bolas
    ballType: 'yellow',
  };
}