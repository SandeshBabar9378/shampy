import { ArtistView } from "./ArtistView";

export const instant = false;

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArtistView id={id} />;
}
