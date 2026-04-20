const parseEmailList = (value: string | undefined, fallback: string[]) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .concat(fallback)
    .filter((item, index, list) => list.indexOf(item) === index);

export const UNLIMITED_ACCOUNT_EMAILS = parseEmailList(
  process.env.UNLIMITED_ACCOUNT_EMAILS,
  ["lzm200303@gmail.com"]
);

export const RESETTABLE_ACCOUNT_EMAILS = parseEmailList(
  process.env.RESETTABLE_ACCOUNT_EMAILS,
  ["lzm200303@gmail.com"]
);

export const MANAGEABLE_ADMIN_EMAILS = parseEmailList(
  process.env.MANAGEABLE_ADMIN_EMAILS,
  ["lzm200303@gmail.com"]
);

export function isUnlimitedAccount(email: string) {
  return UNLIMITED_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
}

export function canResetOwnUsage(email: string) {
  return RESETTABLE_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
}

export function canManageAllAccounts(email: string) {
  return MANAGEABLE_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
