const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  position:    { type: Number, required: true, default: 1 },
  minAge:      { type: Number, required: true, default: 1 },
  category:    {
    type: String,
    required: true,
    enum: ['regular', 'addition', 'learning'],
  },
  description: { type: String, default: '' },
  stars:       { type: Number, default: 4, min: 1, max: 5 },
  isActive:    { type: Boolean, default: true },
}, {
  collection: 'courses',
  timestamps: true,
});

CourseSchema.index({ category: 1, position: 1 });

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
