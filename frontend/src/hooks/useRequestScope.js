import { useLayoutEffect, useState } from 'react';
import { createRequestScope } from '../utils/requestScope.js';

export function useRequestScope(key) {
  const [scope] = useState(() => createRequestScope(key));
  scope.setKey(key);
  useLayoutEffect(() => {
    scope.activate();
    return () => scope.deactivate();
  }, [key, scope]);
  return scope;
}
