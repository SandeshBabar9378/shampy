import { AlbumView } from "./AlbumView";

export const instant = false;

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlbumView id={id} />;
}
