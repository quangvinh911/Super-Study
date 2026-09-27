import { Component, inject, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { QuizSessionStore } from '../core/state';

@Component({
  selector: 'app-certificate-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class CertificateShell implements OnDestroy {
  private readonly store = inject(QuizSessionStore);
  ngOnDestroy(): void {
    void this.store.close();
  }
}
