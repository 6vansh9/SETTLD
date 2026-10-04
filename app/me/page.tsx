import { ProfileScreen } from "@/components/features/profile/ProfileScreen";
import { getUserAndProfile, requireOnboarded } from "@/lib/auth";

export const metadata = { title: "You · Settld" };

export default async function MePage() {
  const profile = await requireOnboarded("/me");
  const { user } = await getUserAndProfile();
  return <ProfileScreen initialProfile={profile} email={user?.email ?? ""} />;
}
