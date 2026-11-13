// Quy tắc nút của app: một chỗ duy nhất, mọi màn dùng lại (không tự chọn màu ở từng màn).
// Thiết kế và bằng chứng: bộ màu hành động chỉ có hai màu, cam (chính, thêm) và đỏ gạch ấm (xóa); xanh dương, tím, ngọc chỉ
// dùng cho danh mục và trạng thái. Không dựa vào màu để phân biệt: Thêm luôn có dấu +, Xóa có thùng rác, và mọi thao tác
// mất dữ liệu đã lưu đi qua ConfirmSheet.
//
// - btnPrimary: đặc cam, chữ mực tối. Hành động chốt của một khối. Tối đa một nút đặc cam mỗi màn / form / tấm. Khi "Thêm" là việc
//   chính của cả màn (Khoản chi, chân tấm tạo) thì nút Thêm CHÍNH LÀ btnPrimary, kèm dấu + (PlusIcon).
// - btnAdd: nền trong suốt, viền và chữ cam, kèm PlusIcon. Thêm một mục mới khi đó không phải việc chính của màn.
// - btnSecondary: trung tính (nền inner, viền line2). Hủy, Hoàn tác, Nhắc, Ghi tiền mặt, Vào nhà bằng mã.
// - btnDanger: viền đỏ, nền trong suốt, kèm TrashIcon. Điểm vào của thao tác xóa; luôn đi tiếp tới ConfirmSheet.
// - btnDangerSolid: đặc đỏ. CHỈ ở bước chốt (ConfirmSheet, chân tấm "Từ chối"). Không bao giờ cạnh nút đặc cam.
// - btnIcon: nút tròn chỉ có biểu tượng, trung tính (bỏ một dòng chưa lưu, từ chối yêu cầu). btnDangerIcon: như vậy nhưng đỏ
//   (xóa thật, vd hủy link mời), phải kèm ConfirmSheet. Nút chỉ có biểu tượng bắt buộc có aria-label.
// - linkAction / linkDanger: chữ không viền.
//
// Trạng thái: nhấn = thu nhỏ nhẹ + màu "press"; tắt = opacity 45% thống nhất; lấy nét bàn phím = vòng `focus`.
// Màu lấy từ token trong src/styles/tokens.css (đổi theo giao diện sáng/tối).

const state =
  'transition-transform active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [-webkit-tap-highlight-color:transparent]'
const base = `flex cursor-pointer items-center justify-center gap-1.5 font-[inherit] disabled:cursor-default disabled:opacity-45 ${state}`

/** Chính: cao 44. */
export const btnPrimary = `${base} h-11 rounded-[22px] border-0 bg-accent px-5 text-[14px] font-bold text-on-solid active:bg-accent-press`
/** Chính, cỡ lớn (rộng cả hàng): cao 50. */
export const btnPrimaryLg = `${base} h-[50px] rounded-[25px] border-0 bg-accent px-5 text-[15px] font-bold text-on-solid active:bg-accent-press`

/** Thêm: cao 44. Luôn kèm <PlusIcon />. */
export const btnAdd = `${base} h-11 rounded-[22px] border border-accent-line bg-transparent px-4 text-[14px] font-semibold text-accent-text active:bg-accent-soft`
/** Thêm, cỡ lớn (rộng cả hàng): cao 50. */
export const btnAddLg = `${base} h-[50px] rounded-[25px] border border-accent-line bg-transparent px-4 text-[15px] font-semibold text-accent-text active:bg-accent-soft`

/** Phụ trung tính: cao 44. */
export const btnSecondary = `${base} h-11 rounded-[22px] border border-line2 bg-inner px-4 text-[14px] font-semibold text-text active:bg-raised`

/** Xóa (điểm vào): cao 44. Luôn kèm <TrashIcon /> và đi tiếp tới ConfirmSheet. */
export const btnDanger = `${base} h-11 rounded-[22px] border border-danger-line bg-transparent px-4 text-[14px] font-semibold text-danger-fg active:bg-danger-bg`
/** Xóa, cỡ lớn (rộng cả hàng): cao 50. */
export const btnDangerLg = `${base} h-[50px] rounded-[25px] border border-danger-line bg-transparent px-4 text-[15px] font-semibold text-danger-fg active:bg-danger-bg`
/** Xóa, bước chốt (đặc). */
export const btnDangerSolid = `${base} h-[50px] rounded-[25px] border-0 bg-danger px-4 text-[15px] font-bold text-on-solid active:bg-danger-press`

/** Nút tròn chỉ có biểu tượng, trung tính (44). */
export const btnIcon = `${base} size-11 shrink-0 rounded-[22px] border border-line2 bg-transparent p-0 text-muted active:bg-inner`
/** Nút tròn chỉ có biểu tượng, đỏ (44): xóa thật, kèm ConfirmSheet. */
export const btnDangerIcon = `${base} size-11 shrink-0 rounded-[22px] border border-danger-line bg-transparent p-0 text-danger-fg active:bg-danger-bg`

/** Hành động dạng chữ. */
export const linkAction = 'flex min-h-11 items-center text-[14px] font-semibold text-accent-text no-underline'
export const linkDanger = 'flex min-h-11 items-center text-[15px] font-semibold text-danger-fg'
