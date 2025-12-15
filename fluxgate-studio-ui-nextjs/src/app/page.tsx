import { AdminDashboard, ThemeProvider } from '@/modules/admin';

export default function Home() {
  return (
    <ThemeProvider>
      <AdminDashboard />
    </ThemeProvider>
  );
}
