import { getTenantSession } from '@/lib/tenantSession';
import ProfileForms from '@/components/tenant/ProfileForms';
import TelegramConnect from '@/components/tenant/TelegramConnect';

export const metadata = { title: 'Kabinet — Savora' };

export default async function ProfilePage() {
  const { user, org, User } = await getTenantSession();
  const dbUser = await User.findById(user.id).lean();

  const isAdmin = user.role === 'admin';

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Kabinet</h1>
          <p className="dash-sub">Foydalanuvchi: <strong>{user.username}</strong> · {isAdmin ? 'Admin' : 'Filial'}</p>
        </div>
      </div>

      <ProfileForms
        username={user.username}
        fullName={dbUser?.fullName ?? ''}
        mustChangePassword={Boolean(dbUser?.mustChangePassword)}
      />

      {isAdmin && (
        <TelegramConnect orgId={org._id} connected={!!org.telegramChatId} />
      )}
    </>
  );
}
