import { ReactNode } from 'react';
import { DemoRole, getLoginPathForRole, hasRole } from '../auth/demoAuth';

export default function ProtectedRoleRoute({
  expectedRole,
  children,
}: {
  expectedRole: DemoRole;
  children: ReactNode;
}) {
  if (!hasRole(expectedRole)) {
    window.location.replace(getLoginPathForRole(expectedRole));
    return null;
  }

  return <>{children}</>;
}
