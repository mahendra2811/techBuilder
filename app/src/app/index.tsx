import { Redirect } from 'expo-router';
import { useSession } from '../stores/session';

/**
 * Entry: route to the role home if logged in, else straight to the DEV role picker.
 * Real login/auth screen is deferred — see dev-role-picker.tsx. Revert to '/login' when
 * real auth is implemented.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  return <Redirect href={user ? '/home' : '/dev-role-picker'} />;
}
