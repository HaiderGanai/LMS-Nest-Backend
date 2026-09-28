import type { Model, Schema } from 'mongoose';
import { requireLegacyModule } from './legacy-module.util';

export const getLegacyModelSchema = (modelName: string): Schema => {
  const legacyModel = requireLegacyModule<Model<any>>(`src/legacy/models/${modelName}.js`);
  if (!legacyModel?.schema) {
    throw new Error(`Legacy model schema not found for ${modelName}`);
  }
  return legacyModel.schema;
};
