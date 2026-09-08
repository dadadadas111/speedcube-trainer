# Speedcube Trainer

App luyện speedcubing chạy hoàn toàn trên máy bạn — không tài khoản, không thu phí,
không gửi dữ liệu đi đâu. Làm riêng cho **Roux** (nhưng vẫn phân tích được CFOP).

Kết nối smart cube GAN qua Web Bluetooth để lấy được từng nước và từng mốc thời gian,
từ đó tách solve thành các bước, chỉ ra chỗ bạn đang mất thời gian, và đo xem trong một
alg bạn hay khựng ở nước nào.

## Chạy

```bash
npm install
npm run dev      # mở http://localhost:5173
```

Cần **Chrome hoặc Edge** (trên desktop hoặc Android) — Web Bluetooth không chạy trên
Safari và iOS. Không có smart cube vẫn dùng được: bấm giờ bằng phím cách, hoặc bật
"khối ảo bàn phím" trong Cài đặt để thử toàn bộ tính năng.

Muốn dùng trên điện thoại Android trong cùng mạng LAN: `npm run dev` đã bật `--host`,
nhưng Web Bluetooth đòi HTTPS hoặc localhost, nên trên điện thoại cần build rồi phục vụ
qua HTTPS (hoặc bật cờ `chrome://flags/#unsafely-treat-insecure-origin-as-secure`).

## Bốn tính năng

**1. Bấm giờ.** Scramble random-state chuẩn WCA. Khi đã kết nối cube, app so trạng thái
khối thật với scramble và chỉ sẵn sàng khi khớp; đồng hồ tự chạy từ nước đầu tiên và tự
dừng đúng lúc khối được giải xong, lấy mốc thời gian từ đồng hồ trong cube (chính xác hơn
đồng hồ máy vì không dính độ trễ bluetooth). Có +2, DNF, inspection, nhiều phiên tập.

**2. Xem lại từng bước.** Mỗi solve được tách thành FB → SB → CMLL → EO → 4b → 4c
(hoặc Cross → F2L → OLL → PLL). Phát lại đúng nhịp thật, tự dừng ở cuối mỗi bước, tua
từng nước, xem khối ở mọi thời điểm với các miếng của bước hiện tại được tô sáng.
Dải "từng nước" cho thấy ô nào rộng (lâu) và chỗ nào bị tính là dừng tay.

**3. Báo cáo.** Xu hướng thời gian kèm ao5/ao12, cấu trúc solve theo thời gian, tỷ trọng
từng bước so với hồ sơ tham chiếu, tỷ lệ đứng yên từng bước, số nước từng bước.
Phần "Nên cải thiện gì" xếp hạng các nút thắt theo số giây bạn đang mất, và phân biệt
nguyên nhân: **nhận dạng/nhìn trước** (dừng nhiều) hay **thực thi** (TPS thấp) hay
**hiệu quả lời giải** (nhiều nước) — ba nguyên nhân đó cần ba cách tập khác nhau.

**4. Drill alg.** Nhập alg bằng chữ hoặc **thực hiện thẳng trên cube để app ghi lại**.
Vào drill: app dựng case, chờ bạn vặn khối về đúng case rồi tự đếm giờ. Sau nhiều lần,
app dựng biểu đồ thời gian trung vị của **từng nước** trong alg và chỉ ra nước nào bạn
hay khựng — thường là chỗ phải đổi cách cầm.

## Vì sao phải làm cẩn thận phần đọc nước

Cảm biến của smart cube chỉ đo được vòng quay của 6 mặt **so với lõi**. Mà nước lát cắt
làm chính cái lõi quay. Hệ quả:

| Bạn làm | Cảm biến báo về |
|---|---|
| `M` | hai sự kiện `R` rồi `L'` |
| `r` | `L` |
| `x` `y` `z` | không có gì |

Và sau một nước như vậy thì **mọi nước tiếp theo đều bị đổi hệ quy chiếu**. Ví dụ có thật
từ test của app: bạn thực hiện `R U R' U' M' U R U' r'` thì cube báo về
`R U R' U' R' L F R F' L'`.

Với Roux thì đây là vấn đề lớn vì LSE gần như toàn nước `M`. App xử lý bằng hai việc:

- **Nhận dạng bước không phụ thuộc hướng cầm khối.** Mọi điều kiện được kiểm tra trên cả
  24 hướng ("tồn tại một hướng sao cho khối FB đã xong"). Hệ quy chiếu lệch dần bao nhiêu
  cũng không ảnh hưởng.
- **Drill so khớp theo trạng thái khối, không theo tên nước.** Dùng khoá chuẩn hoá bất
  biến với phép quay, nên `r` hay `L`, `M` hay `R L'` đều được chấp nhận như nhau.

Ký hiệu hiển thị thì được gộp ngược lại (`R` + `L'` gần nhau → `M`) cho dễ đọc.

Một điều app **không** làm được: phân biệt `r` thật với `L` thật, vì hai nước đó cho ra
cùng một trạng thái khối, chỉ khác nhau đúng một phép quay toàn khối. Cảm biến mặt không
có cách nào biết. Chỗ đó ký hiệu sẽ hiện `L`. (Về lý thuyết có thể dùng con quay hồi
chuyển để đoán, nhưng lúc giải nhanh tay rung nhiều nên không đáng tin.)

## Kiểm thử

```bash
npm test            # 109 khẳng định, chạy trong vài giây
npm run check:lse   # duyệt toàn bộ 184.320 trạng thái của nhóm LSE ⟨M, U⟩
```

Engine khối được kiểm chứng bằng bất biến chứ không phải bằng bảng chép tay: chuỗi facelet
sau `F R` khớp đúng chuẩn Kociemba mà thư viện GAN dùng, `M = R L' x'`, `r = L x`,
`(R U R' U')⁶ = e`, T-perm là phép đối hợp, nhóm quay đúng 24 phần tử, mọi hoán vị đều
là song ánh.

Bộ nhận dạng bước được kiểm bằng một solve Roux dựng ngược từ trạng thái đã giải, mỗi
bước chỉ dùng nhóm nước bảo toàn các bước trước. Ba phép kiểm quan trọng nhất:

- Sáu biên bước phát hiện **đúng từng nước một**.
- Kết quả **không đổi** khi mỗi trạng thái bị quay một hướng khác nhau (mô phỏng hệ quy
  chiếu lệch dần).
- Kết quả **không đổi** trên dòng nước đã mô phỏng đúng cách cảm biến báo về.

Ngoài ra bộ sinh dữ liệu thử đã chạy 60 solve Roux ngẫu nhiên hợp lệ: không biên bước nào
bị bỏ sót.

## Hai chỗ app cố tình chọn cách hiểu chặt

**1. Khi nào tính là "EO xong".** Tiêu chí: cả 6 cạnh đúng chiều *và* lát M đang thẳng
hàng. Điều kiện thẳng hàng nghe như thừa nhưng không phải — nó bắt buộc, vì tập "EO xong"
phải bất biến dưới nhóm nước của bước 4b là ⟨M2, U⟩ (làm 4b thì không được phá EO). Một
tiêu chí nới hơn, chấp nhận cả khi lát M lệch 90°, sẽ không bất biến dưới nước U: một
nước U trộn cạnh lát M với cạnh UL/UR thành trạng thái nửa đúng nửa sai. Chạy
`npm run check:lse` để thấy: trong 5.760 trạng thái "6 cạnh đúng chiều", đúng một nửa có
lát M lệch.

*Hệ quả cần biết:* nếu bạn kết thúc 4a mà lát giữa còn lệch 90°, app sẽ ghi mốc EO muộn
hơn cảm nhận của bạn một chút, và thời gian đó bị tính sang 4b. Các mốc FB/SB/CMLL và
tổng LSE thì không bị ảnh hưởng.

**2. Nước rộng `r` bị ghi thành `L`.** Không sửa được (xem bảng ở trên). Ký hiệu trong
replay sẽ hiện `L`. Việc tách bước và chấm điểm drill thì không bị ảnh hưởng, vì cả hai
đều được thiết kế bất biến với phép quay toàn khối.

## Chỉnh hồ sơ tham chiếu

Các tỷ trọng bước dùng để so sánh nằm ở `REFERENCE` trong
[src/analysis/recommend.ts](src/analysis/recommend.ts), đang đặt theo mức người giải
20–30s. Khi bạn nhanh hơn thì nên sửa lại cho khớp mục tiêu của mình.

## Dữ liệu

Nằm trong IndexedDB của trình duyệt. Xoá dữ liệu trình duyệt là mất, nên vào
Cài đặt → Xuất file sao lưu định kỳ.
