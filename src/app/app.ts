import { Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
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
