import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'arena',
    loadComponent: () =>
      import('./features/biombo/components/biombo-canvas/biombo-canvas.component').then(
        (m) => m.BiomboCanvasComponent,
      ),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
