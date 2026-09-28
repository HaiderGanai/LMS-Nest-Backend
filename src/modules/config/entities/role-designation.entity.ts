import { Schema } from 'mongoose';

export const RoleDesignationModelName = 'RoleDesignation';

export const RoleDesignationSchema = new Schema(
  {
    _id: { type: String }, // role name is the document key
    role: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    updatedBy: { type: String },
    updatedAt: { type: Date },
  },
  {
    collection: 'roledesignations',
    strict: false,
    _id: false,
  },
);
