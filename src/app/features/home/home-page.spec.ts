import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UiPreferencesRepository } from '../../core/persistence';
import { HomePage } from './home-page';

describe('Certificate catalog', () => {
  it('offers a return link for a recognized recent certificate', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        {
          provide: UiPreferencesRepository,
          useValue: {
            load: () => ({ theme: 'system', reducedMotion: false, recentCertificateId: 'toeic' }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.querySelector('.recent-certificate a')?.getAttribute('href')).toBe(
      '/certificates/toeic',
    );
    expect(rendered.querySelectorAll('.catalog-group')).toHaveLength(2);
  });

  it('ignores an unknown recent certificate', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        {
          provide: UiPreferencesRepository,
          useValue: {
            load: () => ({ theme: 'system', reducedMotion: false, recentCertificateId: 'unknown' }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.recent-certificate')).toBeNull();
  });
});
