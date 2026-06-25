const textEncoder = new TextEncoder();

const hashValue = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const generateStaffInviteToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const hashStaffInviteToken = async (inviteToken: string) => {
  return await hashValue(inviteToken.trim());
};
