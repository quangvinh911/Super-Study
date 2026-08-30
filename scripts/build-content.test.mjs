import { describe, expect, it } from 'vitest';

import {
  ContentValidationError,
  buildContent,
  compileFromDocuments,
  loadAuthoringDocuments,
} from './build-content.mjs';

function clone(value) {
  return structuredClone(value);
}

async function documents() {
  return loadAuthoringDocuments();
}

describe('CTFL content compiler', () => {
  it('builds the complete, versioned 80-question bank', async () => {
    const output = await buildContent({ write: false });

    expect(output.questionEnvelope.questions).toHaveLength(80);
    expect(output.solutionEnvelope.solutions).toHaveLength(80);
    expect(output.manifest.inventory.totalBlueprintBuckets).toBe(40);
    expect(output.manifest.inventory.byChapter).toEqual({
      '1': 16,
      '2': 12,
      '3': 8,
      '4': 22,
      '5': 18,
      '6': 4,
    });
    expect(output.manifest.inventory.byKLevel).toEqual({ K1: 16, K2: 48, K3: 16 });
    expect(output.manifest.inventory.byInteraction).toEqual({
      singleChoice: 78,
      multiSelect: 2,
    });
    expect(output.manifest.inventory.buckets.every((bucket) => bucket.questionIds.length === 2)).toBe(
      true,
    );
  });

  it('rejects duplicate question and option IDs', async () => {
    const source = await documents();
    const chapters = clone(source.chapters);
    chapters[0].questions[1].id = chapters[0].questions[0].id;
    chapters[0].questions[2].options[1].id = chapters[0].questions[2].options[0].id;

    expect(() => compileFromDocuments({ ...source, chapters })).toThrow(ContentValidationError);
    try {
      compileFromDocuments({ ...source, chapters });
    } catch (error) {
      expect(error.problems.join('\n')).toContain('duplicate question id');
      expect(error.problems.join('\n')).toContain('duplicate option id');
    }
  });

  it('rejects an invalid answer ID and mismatched selection count', async () => {
    const source = await documents();
    const chapters = clone(source.chapters);
    chapters[0].questions[0].solution.correctOptionIds = ['U'];
    chapters[0].questions[0].interaction.requiredSelections = 2;

    expect(() => compileFromDocuments({ ...source, chapters })).toThrowError(/must match pattern/);
  });

  it('rejects missing evidence metadata through JSON Schema validation', async () => {
    const source = await documents();
    const chapters = clone(source.chapters);
    delete chapters[1].questions[0].solution.references;

    expect(() => compileFromDocuments({ ...source, chapters })).toThrowError(/references/);
  });

  it('rejects a blueprint bucket with insufficient inventory', async () => {
    const source = await documents();
    const chapters = clone(source.chapters);
    chapters[5].questions.pop();

    expect(() => compileFromDocuments({ ...source, chapters })).toThrowError(
      /requires 2 candidates, found 1/,
    );
  });
});
