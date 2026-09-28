export const ROLE_METADATA_KEY = 'roles';
export const MIN_PERMISSION_METADATA_KEY = 'minPermission';
export const REQUIRE_ADMIN_DEPT_METADATA_KEY = 'requireAdminDept';
export const REQUIRE_HR_DEPT_METADATA_KEY = 'requireHRDept';

export const PERMISSION_LEVEL: Record<string, number> = {
  admin: 100,
  hod_manager: 90,
  hod_hr: 90,
  hod_qc: 90,
  senior_manager: 80,
  manager: 70,
  hr_manager: 60,
  floor_manager: 20,
  teacher: 20,
  parent: 10,
  student: 10,
};

export function getPermissionLevel(role: string): number {
  return PERMISSION_LEVEL[role] ?? 0;
}

export const ADMIN_DEPARTMENT_ROLES = ['admin', 'hod_manager', 'senior_manager', 'manager', 'floor_manager'];
export const HR_DEPARTMENT_ROLES = ['admin', 'hod_hr', 'hr_manager'];
export const QC_DEPARTMENT_ROLES = ['admin', 'hod_qc'];

export const STAFF_ROLES = [
  'admin',
  'hod_manager',
  'senior_manager',
  'manager',
  'floor_manager',
  'hod_hr',
  'hr_manager',
  'hod_qc',
  'teacher',
];

export const ROLE_DEPARTMENTS = [
  { department: 'Admin', roles: ['admin', 'hod_manager', 'senior_manager', 'manager', 'floor_manager'] },
  { department: 'HR', roles: ['hod_hr', 'hr_manager'] },
  { department: 'QC', roles: ['hod_qc'] },
];

export const DEFAULT_DESIGNATIONS: Record<string, string> = {
  admin: 'Admin',
  hod_manager: 'Head of Department (Manager)',
  senior_manager: 'Senior Manager',
  manager: 'Manager',
  floor_manager: 'Floor Manager',
  hod_hr: 'Head of HR',
  hr_manager: 'HR Manager',
  hod_qc: 'Head of QC',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
};

export type UserRole = keyof typeof PERMISSION_LEVEL;
