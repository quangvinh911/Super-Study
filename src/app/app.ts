import {
  Component,
  ElementRef,
  HostListener,
  signal,
  inject,
  computed,
  viewChild,
} from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, tap } from 'rxjs';
import { CERTIFICATES } from './certificates/registry';
import { UiPreferencesRepository } from './core/persistence';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly preferences = inject(UiPreferencesRepository);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  protected readonly isMenuOpen = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      tap((event) => {
        this.isMenuOpen.set(false);
        const id = event.urlAfterRedirects.split(/[/?#]/)[2];
        if (CERTIFICATES.some((certificate) => certificate.id === id)) {
          const current = this.preferences.load();
          if (current.recentCertificateId !== id) {
            this.preferences.save({ ...current, recentCertificateId: id });
          }
        }
      }),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly certificates = CERTIFICATES;
  protected readonly activeCertificate = computed(() =>
    CERTIFICATES.find((certificate) => this.url().split(/[/?#]/)[2] === certificate.id),
  );
  protected readonly section = computed(() => this.url().split(/[/?#]/)[3] ?? '');
  protected readonly isKnowledgeRoute = computed(() =>
    this.activeCertificate()?.learningResources?.some(
      (resource) => resource.path === this.section(),
    ),
  );
  protected readonly sectionLabel = computed(() => {
    const section = this.section();
    if (!section) return 'Tổng quan';
    const resource = this.activeCertificate()?.learningResources?.find(
      (item) => item.path === section,
    );
    if (resource) return resource.label;
    return (
      {
        practice: 'Luyện tập',
        'mock-exam': 'Thi thử',
        progress: 'Tiến độ',
        'saved-vocabulary': 'Từ vựng đã lưu',
        methodology: 'Hướng dẫn & nguồn',
        results: 'Kết quả',
      }[section] ?? 'Tổng quan'
    );
  });
  protected readonly isFocusLayout = computed(() => {
    this.url();
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['layout'] === 'focus';
  });
  protected readonly lessonBreadcrumb = computed(() => {
    this.url();
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return typeof route.data['breadcrumb'] === 'string' ? route.data['breadcrumb'] : undefined;
  });
  protected link(page = ''): string[] {
    const certificate = this.activeCertificate();
    return certificate ? ['/certificates', certificate.id, ...(page ? [page] : [])] : ['/'];
  }
  protected switchCertificate(id: string): void {
    if (!CERTIFICATES.some((certificate) => certificate.id === id)) return;
    void this.router.navigate(['/certificates', id]);
    this.closeMenu();
  }
  protected readonly currentYear = new Date().getFullYear();
  protected readonly isOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  protected toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(returnFocus = false): void {
    this.isMenuOpen.set(false);
    if (returnFocus) this.menuButton()?.nativeElement.focus();
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
    if (this.isMenuOpen()) this.closeMenu(true);
  }
}
