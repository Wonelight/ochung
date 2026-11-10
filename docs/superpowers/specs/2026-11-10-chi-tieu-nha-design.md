# Chi tiêu nhà: Tài liệu thiết kế

- Ngày: 2026-11-10
- Trạng thái: chờ duyệt
- Mockup giao diện chuẩn: `E:\ochung\Chi tiêu nhà — iOS web-app.html` (9 màn, mỗi màn có bản tối và sáng)

Quy ước: những chỗ đánh dấu **[quyết định của Claude]** là do người viết tài liệu tự chọn, chưa được chủ dự án xác nhận. Mọi chỗ khác là chủ dự án đã nói rõ.

---

## 1. Mục đích và lý do

Chủ dự án ở chung căn hộ chung cư với 3 người khác. Cuối tháng, chủ dự án ứng tiền trả hết các hóa đơn (điện, nước, gửi xe, phí dịch vụ, tiền nhà…), rồi tính phần của từng người để mọi người chuyển lại. Phần lớn các tháng chia đều. Nhưng tháng nào có người vắng 10–20 ngày thì phải tính lại riêng tiền điện nước cho người đó, và còn có những khoản chi chung phát sinh do từng người tự bỏ tiền ra mua. Tính tay vừa mất công, vừa khó minh bạch.

App cần làm được 3 việc:
1. Chủ nhà nhập số liệu một lần, app tự tính đúng số tiền của từng người.
2. Mỗi người có một **phiếu thanh toán (payslip)** chi tiết, ghi rõ từng khoản và cách tính.
3. Ai đã đóng, ai chưa đóng **công khai cho cả nhà xem**.

Thiết bị chính là iPhone. App phải dùng được đầy đủ trên trình duyệt máy tính và các cỡ màn hình khác.

## 2. Vai trò

| Vai trò | Ai | Được làm gì |
|---|---|---|
| **Quản trị viên** | Chủ dự án (có thể có nhiều quản trị viên) | Tạo tài khoản (tên đăng nhập + mật khẩu tạm), khóa/mở khóa tài khoản, đặt lại mật khẩu. **[quyết định của Claude]** Quản trị viên không xem được dữ liệu tiền của nhà mình không tham gia. |
| **Chủ nhà** | Người tạo ra nhà (mỗi nhà có đúng 1 chủ nhà) | Sửa và xóa nhà; cài đặt các khoản cố định, bảng giá điện nước, tài khoản ngân hàng, hạn đóng; mời, duyệt và xóa thành viên; nhập số liệu tháng; ghi chi phát sinh; chốt sổ; xác nhận đã nhận tiền; gửi thông báo |
| **Thành viên** | Người ở trong nhà | Chỉ được xem: phiếu của mình, số tiền và trạng thái của mọi người, lịch sử các tháng. Hành động duy nhất được làm: báo "đã chuyển tiền", kèm ảnh chuyển khoản nếu muốn |

Một tài khoản có thể thuộc nhiều nhà (chuyển nhà vẫn giữ được lịch sử nhà cũ), và đổi nhà qua menu "Tên nhà ▾" ở đầu trang chủ. **[quyết định của Claude]** Ai có tài khoản cũng tạo được nhà mới.

## 3. Mục tiêu, phạm vi, điều cần tránh

**Mục tiêu**
- Cuối tháng chủ nhà nhập số liệu trong vài phút, mọi người nhận thông báo kèm số tiền chính xác.
- Phiếu của từng người tự giải thích được: ai đọc cũng hiểu vì sao ra con số đó.
- Trạng thái thanh toán của cả nhà minh bạch.
- Chạy được hoàn toàn trên gói miễn phí (Vercel Hobby, Neon Free).

**Ngoài phạm vi (không làm)**
- App native hay đưa lên App Store. Chỉ làm PWA: thêm vào Màn hình chính từ Safari.
- Tự lấy hóa đơn điện từ EVN. EVN không có API công khai, muốn lấy phải giả lập đăng nhập trang CSKH, rất dễ hỏng. Để vào danh sách "có thể làm sau".
- Người dùng tự đăng ký tài khoản.
- Trả tiền ngay trong app. App chỉ hiện mã QR để người dùng chuyển khoản bằng app ngân hàng của họ.
- Tự động nhắc nợ theo lịch.
- Quản lý chi tiêu cá nhân, ngân sách, biểu đồ thống kê.

**Điều cần tránh (app chạy được nhưng vẫn coi là hỏng)**
- Tổng tiền của các phiếu không khớp với tổng chi, hoặc làm tròn khiến lệch mà không ai thấy.
- Sửa cài đặt nhà (giá điện, tiền nhà…) làm thay đổi số tiền của các tháng đã chốt.
- Thành viên nhìn thấy hoặc bấm được vào chức năng sửa số liệu.
- Mở app trên iPhone thấy chậm hay giật: trang chủ phải hiện gần như tức thì.
- Nhập liệu rườm rà hơn tính bằng Excel.

## 4. Ràng buộc

- **Hosting:** Vercel Hobby (miễn phí). Không chạy được tiến trình nền lâu dài; cron chỉ có giới hạn.
- **Database:** Neon Postgres Free. Chọn Neon thay Supabase vì gói free của Supabase tự tạm dừng sau 7 ngày không ai dùng, trong khi app này mỗi tháng chỉ dùng mạnh vài ngày.
- **iOS:** web push chỉ chạy trên iOS 16.4 trở lên **và** khi app đã được thêm vào Màn hình chính. App phải hướng dẫn người dùng thêm vào Màn hình chính.
- **Ngôn ngữ, tiền tệ:** giao diện tiếng Việt; đơn vị VND, lưu dạng số nguyên (không dùng số thực); múi giờ Asia/Ho_Chi_Minh.
- **Giao diện:** theo mockup. Font Be Vietnam Pro (chữ) và Lexend Exa (số lớn); tông nâu ấm, màu nhấn cam `#E8833A`; có chế độ tối và sáng; bộ màu (token) lấy nguyên từ hàm `tokens()` trong mockup; thanh điều hướng dưới "Dione" có 3 nút: Trang chủ / + / Cài đặt. Vùng bấm tối thiểu 44px.

## 5. Luật tính tiền (phần quan trọng nhất)

### 5.1 Các loại khoản

| Loại | Ví dụ | Cách chia |
|---|---|---|
| **Cố định, chia đều** | Tiền nhà, phí dịch vụ, internet, rác | Chia đều cho tất cả thành viên được tính trong tháng, **dù có ai vắng** |
| **Cố định, theo người** | Tiền xe | Chỉ tính cho người có xe: số xe × đơn giá. **[quyết định của Claude, chủ dự án không phản đối]** |
| **Điện, nước** | | Chia theo **số ngày ở** của từng người |
| **Chi phát sinh** | Nước giặt, giấy vệ sinh, bóng đèn | Chia đều cho tất cả thành viên được tính trong tháng; người đã ứng tiền được trừ lại |

Danh sách khoản cố định do chủ nhà tự quản lý: thêm, sửa, xóa, đặt tên, chọn cách chia. Mỗi tháng có thể bật/tắt từng khoản, như các công tắc trong màn "Tạo hóa đơn" của mockup.

### 5.2 Điện và nước có 2 chế độ

Chủ nhà chọn chế độ riêng cho điện và cho nước, đổi được bất cứ lúc nào. Thay đổi chỉ áp dụng cho các tháng chưa chốt.
- **Theo bậc:** nhập chỉ số đầu và chỉ số cuối kỳ. App lấy số tiêu thụ tính theo bảng giá bậc thang do chủ nhà tự cài (các bậc: từ–đến, đơn giá), cộng VAT (%) và các phụ phí (%), ví dụ phí bảo vệ môi trường của nước. Bảng giá cài riêng cho từng nhà vì mỗi chung cư có thể áp giá khác nhau. Chỉ số cuối tháng này tự điền làm chỉ số đầu tháng sau.
  - **[quyết định của Claude]** Mỗi bảng giá có công tắc **"Định mức theo số người"**. Khi tắt, mốc các bậc là cố định cho cả hộ (kiểu Hà Nội: 0–10 m³ một hộ). Khi bật, mốc các bậc bằng định mức nhân số người đăng ký (kiểu TP.HCM: 4 m³ một người). Số người đăng ký là một ô riêng trong bảng giá, không lấy theo số thành viên trong app.
  - **[quyết định của Claude]** Thứ tự tính: `tiền_gốc` = tổng các bậc, sau đó **mỗi phụ phí và VAT đều tính theo % của `tiền_gốc`** rồi cộng lại, không tính chồng phí lên VAT. Đây là cách hóa đơn nước thường ghi, ví dụ VAT 5% và phí BVMT 10% đều tính trên tiền nước. Với các khoản tính theo bậc, app hiện cả số tiền này và yêu cầu chủ nhà so với hóa đơn giấy. Nếu lệch, chủ nhà chuyển khoản đó sang chế độ "Nhập tổng".
- **Nhập tổng:** gõ thẳng số tiền trên hóa đơn.

### 5.3 Công thức

Gọi `N` là số ngày của tháng (28–31), `d_i` là số ngày người `i` ở trong tháng (mặc định `N`, chủ nhà sửa riêng cho người vắng), `M` là số thành viên được tính trong tháng.

```
điện_i  = tổng_điện × d_i / Σd
nước_i  = tổng_nước × d_i / Σd
cố_định_đều_i = Σ(khoản đều đang bật) / M
cố_định_riêng_i = Σ(số lượng_i × đơn giá)          // tiền xe
phát_sinh_i = Σ(khoản phát sinh trong tháng) / M
phần_i  = điện_i + nước_i + cố_định_đều_i + cố_định_riêng_i + phát_sinh_i
cần_chuyển_i = phần_i − (tiền người i đã ứng cho chi phát sinh)
```

- **Chủ nhà** là người ứng tiền trả hóa đơn, nên phiếu của chủ nhà chỉ hiện "phần của bạn" và không có dòng "cần chuyển".
- Nếu `cần_chuyển_i < 0` (người đó ứng nhiều hơn phần của mình), phiếu ghi "Chủ nhà cần trả lại bạn X đ".
- **Không làm tròn** (chủ dự án yêu cầu): mọi số tiền chính xác đến từng đồng và chủ nhà không phải gánh phần chênh nào. Có những phép chia không ra số đồng chẵn, ví dụ 1.000.000 ÷ 3. **[quyết định của Claude]** Khi đó app chia theo cách "dư lớn nhất": mỗi người nhận phần nguyên của mình, rồi từng đồng còn dư (tối đa vài đồng) được chia cho những người có phần lẻ lớn nhất. Nếu phần lẻ bằng nhau thì xét theo thứ tự cố định của thành viên. Nhờ vậy tổng các phiếu luôn khớp tuyệt đối với tổng chi, và không ai bị lệch quá 1đ cho mỗi khoản.
- **[quyết định của Claude]** Ai vào nhà hoặc rời nhà giữa tháng: chủ nhà sửa số ngày ở. Muốn bỏ hẳn một người khỏi tháng thì tắt "Tính tháng này" cho người đó.

### 5.4 Ví dụ đối chiếu (dùng làm test chuẩn)

Tháng 11 có 30 ngày, nhà 4 người: Linh (chủ nhà), An, Bình, Chi. Chi ở 15 ngày.
- Tiền nhà 8.000.000, phí dịch vụ 600.000 (chia đều)
- Xe: Linh, An, Chi mỗi người 1 xe × 120.000; Bình không có xe
- Điện 1.260.000, nước 315.000. Σd = 30 × 3 + 15 = 105
- Phát sinh: An ứng 200.000, Linh ứng 120.000 → mỗi người 80.000

| | Nhà | DV | Xe | Điện | Nước | Phát sinh | Phần | Đã ứng | Cần chuyển |
|---|---|---|---|---|---|---|---|---|---|
| Linh (chủ) | 2.000.000 | 150.000 | 120.000 | 360.000 | 90.000 | 80.000 | 2.800.000 | (chủ nhà) | – |
| An | 2.000.000 | 150.000 | 120.000 | 360.000 | 90.000 | 80.000 | 2.800.000 | 200.000 | **2.600.000** |
| Bình | 2.000.000 | 150.000 | 0 | 360.000 | 90.000 | 80.000 | 2.680.000 | 0 | **2.680.000** |
| Chi | 2.000.000 | 150.000 | 120.000 | 180.000 | 45.000 | 80.000 | 2.575.000 | 0 | **2.575.000** |

Kiểm tra: tổng chi 10.855.000 = tổng 4 phần. Chủ nhà ứng 10.655.000 và thu về 7.855.000, nên thực tế chủ nhà chi 2.800.000, đúng bằng phần của mình.

## 6. Vòng đời một tháng

1. **Nháp:** chủ nhà bấm "+" rồi chọn "Hóa đơn tháng", nhập chỉ số hoặc tổng tiền điện nước, bật/tắt các khoản cố định, sửa số ngày ở. App hiện tổng tiền và số của từng người ngay khi đang nhập. Chi phát sinh thì nhập lúc nào cũng được, qua "+" rồi "Khoản chi lẻ": số tiền, nội dung, ngày, ai đã trả.
2. **Chốt sổ** (nút "Tạo & gửi hóa đơn"): app lưu cố định (snapshot) toàn bộ đơn giá, khoản và bảng giá tại thời điểm chốt, rồi gửi thông báo đẩy cho cả nhà: "Tháng 11: bạn cần chuyển 2.600.000đ".
3. **Thu tiền:** xem mục 7.
4. **Sửa sau khi chốt:** **[quyết định của Claude]** chủ nhà vẫn sửa được. App tính lại và gửi thông báo "Phiếu tháng 11 đã cập nhật". Trạng thái của từng người được tính lại theo số tiền đã thực nhận (xem 7), nên ai đã đóng mà số tiền tăng lên sẽ chuyển sang "Còn thiếu X".
5. **Hạn đóng:** chủ nhà đặt một ngày cố định trong tháng, ví dụ mùng 10. Hạn này chỉ để hiển thị, app không tự gửi nhắc.

**Chi phát sinh thuộc tháng nào** **[quyết định của Claude]**: tính vào tháng của ngày chi, nếu tháng đó vẫn còn nháp. Nếu tháng đó đã chốt thì mặc định chuyển sang **tháng nháp gần nhất**, app ghi rõ trên phiếu "chi ngày 28/11, tính vào T12". Chủ nhà vẫn có thể chủ động chọn tháng đã chốt (tức là sửa sau chốt). Vì vậy sửa sau chốt chỉ là trường hợp hiếm.

**[quyết định của Claude]** "Tháng 11" là tháng **tiêu dùng**: điện nước dùng trong tháng 11, chốt sổ vào đầu tháng 12, hạn đóng là ngày 10/12. Các ngày ghi trong mockup chỉ là ví dụ minh họa.

## 7. Thanh toán và trạng thái

- Chủ nhà khai tài khoản ngân hàng một lần trong cài đặt nhà. Phiếu của thành viên có nút **"Mã QR chuyển khoản"**, mã QR chuẩn VietQR đã điền sẵn số tiền và nội dung (ví dụ `AN T11`). Người dùng quét bằng app ngân hàng là chuyển được. **[quyết định của Claude]**
- Chuyển xong, thành viên bấm **"Tôi đã chuyển"**, đính kèm ảnh chuyển khoản nếu muốn. Trạng thái chuyển sang **Chờ xác nhận**.
- Chủ nhà bấm **Xác nhận** (hoặc **Từ chối**, kèm lý do). Chủ nhà cũng có thể tự đánh dấu "đã nhận" khi người đó trả tiền mặt.
- Mỗi lần trả được lưu thành một bản ghi riêng có số tiền. Trạng thái được **tính ra**, không lưu tay:
  - **Đã trả:** tổng tiền đã xác nhận ≥ số cần chuyển
  - **Chờ xác nhận:** có bản ghi đang chờ chủ nhà duyệt
  - **Chưa trả / Còn thiếu X:** các trường hợp còn lại
- Cả nhà đều xem được trạng thái của từng người (màn "Hóa đơn" trong mockup có bộ lọc: Tất cả / Chưa trả / Chờ duyệt / Đã trả).
- **Chủ nhà trả lại tiền** **[quyết định của Claude]**: trường hợp này xảy ra khi số cần chuyển âm, hoặc khi sửa sau chốt làm số tiền giảm xuống dưới số người đó đã trả. Bản ghi thanh toán có **chiều**: thành viên → chủ nhà, hoặc chủ nhà → thành viên. Chủ nhà bấm "Đã trả lại X đ" để tạo bản ghi chiều ngược lại, bản ghi này được xác nhận luôn. Số dư được tính là `cần_chuyển − đã nhận + đã trả lại`:
  - số dư > 0: Chưa trả / Còn thiếu
  - số dư = 0: Đã trả
  - số dư < 0: trạng thái **"Chủ nhà nợ X"**, gộp vào bộ lọc "Chưa trả"
  - Số dư khác 0 theo bất kỳ chiều nào đều tính là còn nợ (áp dụng cho luật "không được rời nhà khi còn nợ").

## 8. Thông báo

Thông báo đẩy (Web Push) chỉ gửi trong 2 trường hợp, theo yêu cầu của chủ dự án:
1. Khi chủ nhà chốt sổ, hoặc cập nhật phiếu sau khi đã chốt.
2. Khi chủ nhà tự gửi: soạn một tin nhắn cho cả nhà, hoặc bấm "Nhắc" cho từng người chưa đóng như trong mockup.

**[quyết định của Claude]** Các sự kiện khác chỉ hiện trong chuông thông báo trong app, không gửi đẩy: có người xin vào nhà, được duyệt vào nhà, có người báo đã chuyển tiền, bị từ chối xác nhận. Ai chưa thêm app vào Màn hình chính (nên không nhận được thông báo đẩy) thì vẫn thấy các thông báo này trong chuông.

## 9. Tài khoản và vào nhà

**Đăng nhập** (theo mockup): tên đăng nhập + mật khẩu do quản trị viên cấp. Màn đăng nhập không có nút đăng ký.
- **[quyết định của Claude]** Lần đầu đăng nhập, người dùng bắt buộc phải đổi mật khẩu tạm.
- **Face ID:** dùng passkey (WebAuthn). Sau lần đăng nhập đầu, app hỏi có bật Face ID không. Mật khẩu vẫn dùng được song song.
- Phiên đăng nhập kéo dài để không phải đăng nhập lại liên tục. **[quyết định của Claude]** Phiên 90 ngày.
- Hồ sơ cá nhân: tên hiển thị, ngày sinh, mã tài khoản dạng `U-xxxxx`, avatar tự sinh từ tên (thuật toán có sẵn trong mockup) và nút "Tạo hình mới".
- **Trang quản trị** (`/admin`, chỉ quản trị viên vào được, dùng tốt trên máy tính): danh sách tài khoản, tạo tài khoản, đặt lại mật khẩu, khóa tài khoản.

**3 cách vào nhà**
1. **Link mời:** chủ nhà bấm "Chia sẻ link mời" và gửi link qua Zalo hoặc Messenger. Người nhận mở link, đăng nhập là vào nhà luôn, không cần duyệt. **[quyết định của Claude]** Một link dùng được cho nhiều người, hết hạn sau 7 ngày, chủ nhà hủy được bất cứ lúc nào.
2. **Mã nhà** (6 ký tự, ví dụ `CG-7K2Q`): người muốn vào nhập mã, rồi chủ nhà duyệt hoặc từ chối. Người gửi yêu cầu có thể tự hủy.
3. **Mã tài khoản:** chủ nhà nhập mã `U-xxxxx` của một người để thêm thẳng người đó vào nhà.

**Xóa nhà** **[quyết định của Claude]**: thực chất là **lưu trữ** nhà. Nhà biến khỏi danh sách đang dùng, mọi người (cả thành viên cũ) vẫn xem lại được lịch sử ở chế độ chỉ đọc, và không ai sửa được nữa. App chặn xóa nếu còn tháng đã chốt mà chưa thu đủ, trừ khi chủ nhà xác nhận lần hai. Không có chức năng xóa vĩnh viễn trong bản đầu.

Chủ nhà xóa được thành viên. Thành viên bị xóa vẫn còn trong lịch sử các tháng đã chốt. **[quyết định của Claude]** Thành viên tự rời nhà được, trừ khi còn nợ tiền của tháng đã chốt. Chuyển quyền chủ nhà: chưa làm ở bản đầu.

## 10. Các màn hình

Bố cục theo mockup. Những màn đánh dấu ✚ là màn mới hoặc phải sửa so với mockup.

| Màn | Nguồn | Ghi chú |
|---|---|---|
| Đăng nhập | mockup | thêm luồng bật Face ID ✚ |
| Đổi mật khẩu lần đầu ✚ | mới | |
| Trang chủ | mockup | ✚ Với thành viên: ô đầu trang hiện **số tiền của bạn** và trạng thái thay cho "mỗi người · chia 4". Danh sách cả nhà hiện **số tiền riêng của từng người** |
| Biểu phí tháng / **Phiếu thanh toán** | mockup + ✚ | Hiện chi tiết từng dòng của người đang xem, kèm cách tính (như ví dụ 5.4), số cần chuyển và nút mã QR. Chủ nhà xem được phiếu của bất kỳ ai |
| Hóa đơn và trạng thái | mockup | số tiền của từng người khác nhau ✚; thêm thao tác Từ chối ✚ |
| Tạo (nút +): Hóa đơn tháng / Khoản chi lẻ | mockup | ✚ 2 chế độ điện nước, số ngày ở của từng người, chọn ai đã trả cho khoản chi lẻ. Thành viên không thấy nút "+" |
| Quản lý nhà | mockup | ✚ thêm: các khoản cố định, bảng giá bậc thang, tài khoản ngân hàng, hạn đóng, số xe của từng người, quản lý link mời, sửa/xóa nhà |
| Tạo nhà mới ✚ | mới | |
| Vào nhà | mockup | |
| Cài đặt | mockup | thêm công tắc thông báo và hướng dẫn "Thêm vào Màn hình chính" ✚ |
| Thông báo (chuông) ✚ | mới | |
| Quản trị `/admin` ✚ | mới | không cần theo phong cách mockup |

**Responsive:** thiết kế cho điện thoại trước. Trên màn hình rộng, app không bị kéo giãn méo và vẫn đủ chức năng. Bố cục cụ thể do người làm quyết.

## 11. Công nghệ **[quyết định của Claude, chủ dự án giao cho Claude chọn]**

- **Next.js (App Router) + TypeScript + Tailwind CSS**, deploy lên Vercel. Ưu tiên Server Components và Server Actions, hạn chế JavaScript chạy phía trình duyệt để app nhẹ.
- **Neon Postgres + Drizzle ORM**.
- **Better Auth**, dùng plugin username và plugin passkey. Khi bắt tay vào làm phải tra tài liệu mới nhất qua Context7.
- **PWA:** manifest, service worker, icon cho iOS, `apple-mobile-web-app-capable`. **Web Push** dùng khóa VAPID và thư viện `web-push`.
- **Ảnh chuyển khoản:** nén ngay trên máy người dùng xuống khoảng 200KB trước khi tải lên. Nơi lưu (Vercel Blob hoặc chỗ khác) do người làm chọn, miễn nằm trong gói miễn phí.
- **Tốc độ mở app** **[quyết định của Claude]**: database Neon bản miễn phí tự ngủ khi không ai dùng, và hàm serverless của Vercel cũng khởi động lạnh, nên lần mở đầu tiên có thể mất 1–3 giây. Cách xử lý:
  - service worker lưu sẵn khung giao diện, nên app hiện ra ngay
  - phần dữ liệu hiện khung chờ (skeleton) trong lúc tải
  - **không** hiện số tiền hay trạng thái cũ đã lưu từ lần trước, để tránh cảnh "Chưa trả" hiện sai cho người vừa chuyển tiền
- **Logic tính tiền** viết thành một module thuần, không phụ thuộc database hay giao diện, có unit test, và lấy ví dụ 5.4 làm test bắt buộc.

**Dữ liệu chính** (người làm được phép đổi tên hay tách gộp bảng): users, houses, house_members (vai trò, ngày vào, ngày rời), invite_links, join_requests, charge_items (khoản cố định của nhà), member_charge_qty (số xe…), utility_tariffs (điện/nước: chế độ, các bậc, VAT, phụ phí), periods (nhà, tháng, trạng thái nháp/đã chốt, hạn đóng, **snapshot** lúc chốt), period_readings, period_member_days, expenses (chi phát sinh), payments, push_subscriptions, notifications.

## 12. Thứ tự làm đề xuất

1. Khung dự án, giao diện cơ bản theo mockup (token màu, font, thanh Dione), đăng nhập, trang quản trị tạo tài khoản.
2. Tạo nhà, quản lý nhà, 3 cách vào nhà.
3. Module tính tiền và test, cài đặt khoản cố định và bảng giá, tạo hóa đơn tháng, chi lẻ, chốt sổ, phiếu thanh toán.
4. Thanh toán: QR, báo đã chuyển kèm ảnh, xác nhận, các trạng thái.
5. PWA, thông báo đẩy, chuông thông báo.
6. Face ID (passkey), hoàn thiện responsive, kiểm tra trên iPhone thật.

## 13. Để người làm tự quyết

- Cấu trúc thư mục, tên route, tên bảng và cột.
- Bố cục desktop, hiệu ứng chuyển cảnh, thiết kế cụ thể của các màn mới (giữ cùng phong cách mockup).
- Cách sinh mã nhà và mã tài khoản, miễn là ngắn, dễ đọc, không trùng.
- Thư viện tạo mã QR VietQR, thư viện nén ảnh.
- Cách cài đặt service worker.

## 14. Có thể làm sau

- Tự lấy hóa đơn điện từ EVN.
- Chuyển quyền chủ nhà.
- Xuất phiếu ra ảnh hoặc PDF để gửi Zalo.
- Thống kê chi tiêu theo tháng.
