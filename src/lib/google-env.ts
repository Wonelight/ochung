/**
 * Khóa OAuth của Google (Google Cloud Console > Credentials > OAuth client ID, loại Web application;
 * Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`).
 * Chưa đặt đủ hai biến thì đăng nhập Google tắt hẳn: máy chủ không đăng ký provider, giao diện không hiện nút.
 */
export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function googleEnabled(): boolean {
  return googleCredentials() !== null
}
