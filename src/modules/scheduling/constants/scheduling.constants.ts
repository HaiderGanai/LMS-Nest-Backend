export const SCHEDULING_CONSTANTS = {
  defaultSlotMinutes: Number(process.env.SCHEDULING_DEFAULT_SLOT_MINUTES || 30),
  businessTimezone: process.env.SCHEDULING_BUSINESS_TIMEZONE || 'Asia/Karachi',
} as const;
