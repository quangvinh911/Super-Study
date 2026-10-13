import { AccountApiError } from '../../core/auth/auth.service';
const messages: Readonly<Record<string, string>> = {
  invalid_credentials: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  rate_limited: 'Bạn đã thử quá nhiều lần. Hãy thử lại sau 15 phút.',
  invalid_session: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  login_required: 'Bạn cần đăng nhập để tiếp tục.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  username_exists: 'Tên đăng nhập đã được sử dụng.',
  invalid_username: 'Tên đăng nhập cần 3–50 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.',
  invalid_password: 'Mật khẩu cần từ 11 đến 128 ký tự.',
  invalid_email: 'Email không đúng định dạng.',
  last_admin: 'Hệ thống phải còn ít nhất một Admin hoạt động.',
  cannot_delete_self: 'Bạn không thể xóa chính tài khoản đang đăng nhập.',
  cannot_demote_self: 'Bạn không thể tự bỏ quyền Admin.',
  concurrent_user_change: 'Tài khoản vừa được thay đổi. Hãy tải lại danh sách và thử lại.',
  account_maintenance: 'Dữ liệu tài khoản đang được bảo trì. Hãy thử lại sau.',
  auth_not_configured: 'Dịch vụ đăng nhập chưa được cấu hình.',
};
export function accountError(error: unknown): string {
  return error instanceof AccountApiError && messages[error.code]
    ? messages[error.code]
    : 'Không thể kết nối dịch vụ tài khoản. Hãy thử lại.';
}
