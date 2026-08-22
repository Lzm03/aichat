// 純色頭像佔位：從穩定 id（或電郵）雜湊出一個固定顏色，學生沒有設定頭像時顯示純色塊
const AVATAR_COLORS = ["#6366F1", "#8B5CF6", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899"];

export function getAvatarColor(seed?: string): string {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
