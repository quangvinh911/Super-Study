import Ajv from 'ajv';
import schema from '../content/schema/certificate-bank.schema.json' with { type: 'json' };

export const bankAjv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, esm: true },
});

export default bankAjv.compile(schema);
