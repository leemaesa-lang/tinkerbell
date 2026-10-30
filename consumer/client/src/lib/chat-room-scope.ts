export type ChatRoomType = "used" | "meet" | "review";

export function chatRoomDataScope(type: ChatRoomType, roomId: string | number): string {
  return `${type}:${encodeURIComponent(String(roomId))}`;
}
