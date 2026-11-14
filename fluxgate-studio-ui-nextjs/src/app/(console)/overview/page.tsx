import { Suspense } from 'react';

import { OverviewScreen } from '@/modules/console/screens/OverviewScreen';

export default function OverviewPage() {
  return (
    <Suspense>
      <OverviewScreen />
    </Suspense>
  );
}
