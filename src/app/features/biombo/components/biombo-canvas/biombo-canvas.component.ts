import { Component, ElementRef, inject, Input, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BiomboConfig } from '../../utilities/biombo.interfaces';
import { BiomboEngineService } from '../../services/biombo-engine.service';

@Component({
  selector: 'app-biombo-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #viewport class="canvas-viewport">
      @if (hasError()) {
        <div class="canvas-fallback">
          <div class="fallback-panel">
            <div class="fallback-status">WEBGL NO DISPONIBLE</div>
            <h3>BIOMBO 3D NO DISPONIBLE</h3>
            <p>
              Este navegador no admite render 3D. Activa la aceleración por hardware o usa Chrome/Edge moderno
              para ver la arena en modo profesional.
            </p>
            <div class="fallback-metrics">
              <span>Render 3D: OFFLINE</span>
              <span>Modo alternativo: UI premium</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .canvas-viewport {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 12px;
      background: radial-gradient(circle at top, #121722 0%, #090b10 42%, #05070a 100%);
    }
    .canvas-fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(6, 8, 12, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .fallback-panel {
      width: min(520px, 92%);
      padding: 28px 24px;
      border: 1px solid rgba(255, 210, 0, 0.3);
      border-radius: 20px;
      background: rgba(19, 22, 29, 0.9);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
      text-align: center;
    }
    .fallback-status {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.7rem;
      letter-spacing: 2px;
      font-weight: 800;
      color: #ffd200;
      background: rgba(255, 210, 0, 0.12);
      border: 1px solid rgba(255, 210, 0, 0.32);
    }
    .fallback-panel h3 {
      margin: 18px 0 8px;
      font-size: clamp(1.3rem, 2vw, 2rem);
      color: #ffffff;
      letter-spacing: 1.6px;
      text-transform: uppercase;
    }
    .fallback-panel p {
      margin: 0;
      color: #d5dae5;
      line-height: 1.6;
      font-size: 0.95rem;
    }
    .fallback-metrics {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 22px;
    }
    .fallback-metrics span {
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #bfc9d9;
      background: rgba(255, 255, 255, 0.04);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
  `]
})
export class BiomboCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;
  @Input({ required: true }) config!: BiomboConfig;

  private resizeObserver!: ResizeObserver;

  public readonly engine: BiomboEngineService = inject(BiomboEngineService);
  public readonly hasError = signal(false);

  public async ngOnInit(): Promise<void> {
    try {
      await this.engine.initialize(this.viewportRef.nativeElement, this.config);
      this.hasError.set(!!this.engine.errorMessage());
      if (this.engine.errorMessage()) {
        return;
      }
    } catch {
      this.hasError.set(true);
      return;
    }

    if (this.engine.errorMessage()) {
      this.hasError.set(true);
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.engine.resize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.viewportRef.nativeElement);
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.engine.destroy();
  }
}