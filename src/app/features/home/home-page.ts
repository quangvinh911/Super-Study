import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CERTIFICATES } from '../../certificates/registry';
import { UiPreferencesRepository } from '../../core/persistence';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly preferences = inject(UiPreferencesRepository);
  protected readonly recentCertificate = CERTIFICATES.find(
    (certificate) => certificate.id === this.preferences.load().recentCertificateId,
  );
  protected readonly languageCertificates = CERTIFICATES.filter(
    (certificate) => certificate.catalogGroup === 'language',
  );
  protected readonly professionalCertificates = CERTIFICATES.filter(
    (certificate) => certificate.catalogGroup === 'professional',
  );
}
