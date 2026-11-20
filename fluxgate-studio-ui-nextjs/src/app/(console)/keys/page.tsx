import { Suspense } from 'react';

import { KeysScreen } from '@/modules/console/screens/KeysScreen';

export default function KeysPage() {
  return (
    <Suspense>
      <KeysScreen />
    </Suspense>
  );
}
