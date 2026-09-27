import { Component, HostListener, signal, inject, computed } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { CERTIFICATES } from './certificates/registry';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly certificates = CERTIFICATES;
  protected readonly activeCertificate = computed(() =>
    CERTIFICATES.find((certificate) => this.url().split(/[/?#]/)[2] === certificate.id),
  );
  protected link(page: string): string {
    return `/certificates/${this.activeCertificate()?.id ?? 'ctfl'}/${page}`;
  }
  protected switchCertificate(id: string): void {
    void this.router.navigate(['/certificates', id]);
    this.closeMenu();
  }
  protected readonly currentYear = new Date().getFullYear();
  protected readonly isMenuOpen = signal(false);
  protected readonly isOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  protected toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  @HostListener('window:online')
  protected handleOnline(): void {
    this.isOnline.set(true);
  }

  @HostListener('window:offline')
  protected handleOffline(): void {
    this.isOnline.set(false);
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    this.closeMenu();
  }
}
