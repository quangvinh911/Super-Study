import { inject, Injectable, InjectionToken } from '@angular/core';
import { CertificateDefinition, Question } from '../core/models';
import { CTFL } from './registry';

export const CERTIFICATE = new InjectionToken<CertificateDefinition>('Certificate definition', {
  factory: () => CTFL,
});

@Injectable({ providedIn: 'root' })
export class CertificateContext {
  readonly definition = inject(CERTIFICATE);
  readonly id = this.definition.id;
  readonly name = this.definition.name;
  readonly isSyllabus = this.definition.taxonomy === 'syllabus';
  readonly parts = this.definition.exam.sections?.flatMap((section) => section.parts) ?? [];
  readonly topics = this.parts.length ? this.parts : (this.definition.topics ?? []);

  link(page = '', sessionId?: string): string[] {
    return [`/certificates/${this.id}`, ...(page ? [page] : []), ...(sessionId ? [sessionId] : [])];
  }

  questionLabel(question: Question): string {
    const classification = question.classification;
    return this.isSyllabus
      ? [
          classification.chapter ? `Chapter ${classification.chapter}` : '',
          classification.kLevel,
          classification.learningObjective,
        ]
          .filter(Boolean)
          .join(' · ')
      : this.partLabel(classification.section);
  }

  partLabel(id: string): string {
    return this.topics.find((part) => part.id === id)?.label ?? id;
  }
}
