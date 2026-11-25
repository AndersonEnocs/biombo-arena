import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-biombo-speed-control',
  standalone: true,
  template: `
    <label class="speed-control">
      <span class="speed-heading">
        <span>VELOCIDAD</span>
        <output>{{ speedPercent }}%</output>
      </span>
      <input
        type="range"
        [min]="minSpeedPercent"
        [max]="maxSpeedPercent"
        step="5"
        [value]="speedPercent"
        [disabled]="disabled"
        [attr.aria-valuetext]="speedPercent + '%'"
        aria-label="Velocidad del mecanismo"
        (input)="onInput($event)">
    </label>
  `,
  styles: [`
    :host {
      display: block;
      padding: 0 5px;
    }
    .speed-control {
      display: grid;
      gap: 5px;
    }
    .speed-heading {
      display: flex;
      justify-content: space-between;
      color: #bfc9d9;
      font-size: 0.62rem;
      font-weight: 800;
    }
    output {
      color: #ffd200;
    }
    input {
      width: 100%;
      margin: 0;
      accent-color: #ffd200;
    }
  `],
})
export class BiomboSpeedControlComponent {
  @Input() speedPercent = 100;
  @Input() minSpeedPercent = 10;
  @Input() maxSpeedPercent = 150;
  @Input() disabled = false;
  @Output() speedChange = new EventEmitter<number>();

  public onInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.speedChange.emit(Number(event.target.value));
    }
  }
}
