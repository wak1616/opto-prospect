// Force dynamic rendering for Firebase functionality
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function SavedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
