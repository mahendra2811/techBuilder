import { Redirect } from 'expo-router';
import { useSession } from '../stores/session';

/** Entry: route to the role home if logged in, else to login. (Splash UI can layer on later.) */
export default function Index() {
  const user = useSession((s) => s.user);
  return <Redirect href={user ? '/home' : '/login'} />;
}
