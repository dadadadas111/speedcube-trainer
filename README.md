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

Trên điện thoại Android thì mở thẳng bản đã triển khai (có HTTPS). Xem thêm mục địa chỉ
MAC bên dưới — trên điện thoại thường phải nhập tay một lần.

## Bốn tính năng

**1. Bấm giờ, có dẫn vặn scramble.** Scramble random-state chuẩn WCA. Khi đã kết nối
cube, app dẫn bạn vặn từng nước: nước tiếp theo hiện to, nước đã vặn thì mờ đi, có thanh
tiến độ. Vặn sai là báo ngay và **chỉ luôn cần vặn ngược lại những gì** để quay về đúng
chỗ — không phải giải lại từ đầu. Xong scramble thì đồng hồ tự chạy từ nước đầu tiên và
tự dừng đúng lúc khối được giải, lấy mốc thời gian từ đồng hồ trong cube (chính xác hơn
đồng hồ máy vì không dính độ trễ bluetooth). Có +2, DNF, inspection, nhiều phiên tập.

Việc dò tiến độ so khớp theo khoá bất biến-với-phép-quay, nên **bạn cầm khối kiểu gì cũng
được** — chỉ cần thực hiện đúng ký hiệu trong hệ quy chiếu của chính mình. Khoá này vẫn
phân biệt màu nên vặn nhầm mặt đối diện (cam thay vì đỏ) vẫn bị bắt lỗi.

**2. Xem lại từng bước.** Mỗi solve được tách thành FB → SB → CMLL → EO → 4b → 4c
(hoặc Cross → F2L → OLL → PLL). Phát lại đúng nhịp thật, tự dừng ở cuối mỗi bước, tua
từng nước, xem khối ở mọi thời điểm với các miếng của bước hiện tại được tô sáng.
Dải "từng nước" cho thấy ô nào rộng (lâu) và chỗ nào bị tính là dừng tay.

**3. Xem lại và chấm điểm từng nước.** Kiểu xem lại ván cờ, nhưng thang đo là
**nhanh/chậm** chứ không phải hay/dở — app không biết nước nào là lựa chọn tốt, nhưng
biết rất rõ nước nào chậm hơn tốc độ thường ngày của chính bạn.

Mốc so sánh dựng từ lịch sử của bạn, theo ba tầng dự phòng: đúng cặp nước đó
(`R' → U2`), rồi cặp mặt (`R → U`), rồi bước đang làm (FB, SB, CMLL...). Nhờ vậy "chậm"
có nghĩa là chậm *trong đúng tình huống đó*. Ví dụ có thật từ test: cùng 200ms, nhưng
đi sau nước `R` thì là **chậm**, còn đi sau nước `U` lại là **nhanh** — một con số chung
chung không phân biệt được chuyện này.

Kết quả ra thành một câu đọc được ngay: *"3.23s mất thêm ở 5 nước chậm bất thường. Nếu
những nước đó chạy bằng tốc độ thường ngày của bạn thì solve này còn 14.04s."* Kèm danh
sách những nước tốn kém nhất, bấm vào là nhảy thẳng tới đúng nước đó trong replay.

**4. Báo cáo.** Xu hướng thời gian kèm ao5/ao12, cấu trúc solve theo thời gian, tỷ trọng
từng bước so với hồ sơ tham chiếu, tỷ lệ đứng yên từng bước, số nước từng bước.
Phần "Nên cải thiện gì" xếp hạng các nút thắt theo số giây bạn đang mất, và phân biệt
nguyên nhân: **nhận dạng/nhìn trước** (dừng nhiều) hay **thực thi** (TPS thấp) hay
**hiệu quả lời giải** (nhiều nước) — ba nguyên nhân đó cần ba cách tập khác nhau.

**5. Drill alg.** Nhập alg bằng chữ hoặc **thực hiện thẳng trên cube để app ghi lại**.
Vào drill: app dựng case, chờ bạn vặn khối về đúng case rồi tự đếm giờ. Sau nhiều lần,
app dựng biểu đồ thời gian trung vị của **từng nước** trong alg và chỉ ra nước nào bạn
hay khựng — thường là chỗ phải đổi cách cầm.

Có hai chế độ: luyện **một case** cụ thể, hoặc **ngẫu nhiên trong họ** — chọn vài họ rồi
app bốc ngẫu nhiên, dẫn bạn vặn khối vào case đó và tính giờ từ lúc vào case tới lúc giải
xong. Case chưa luyện lần nào được bốc trúng nhiều hơn để không bỏ sót, và cuối phiên có
bảng xếp hạng case nào đang chậm nhất.

*Một chỗ phải nói thẳng:* chuỗi setup chính là alg đảo ngược, nên nhìn cả chuỗi là biết
luôn case. Vì thế mặc định app chỉ hiện **từng nước một** — vặn theo kiểu máy móc thì lúc
xong vẫn phải tự nhận dạng. Muốn scramble trông thật sự ngẫu nhiên như csTimer thì cần
một bộ giải hai pha, tôi chưa làm.

Thư viện xếp hai tầng **họ → case** (bấm Sune rồi mới chọn case bên trong), kèm ô tìm
kiếm và số case đã luyện của từng họ, để còn dùng được khi có hàng trăm alg. Họ nào chỉ
có một case thì bấm là chọn luôn, không phải mở ra.

**App tự nhận ra case.** Khi bạn dán một alg vào, app tính ra hướng và hoán vị của bốn
góc lớp trên rồi tự xếp vào đúng họ, đồng thời báo nếu bạn đã có alg khác giải cùng case
đó. Việc này thuần tính toán chứ không dựa vào tên ai đặt — ví dụ Niklas được máy xếp
cùng họ với Sune, không phải do gõ tay. Chữ ký case được chuẩn hoá theo AUF, nên thêm
nước U trước alg vẫn ra đúng một case; còn thêm U *sau* alg thì là case khác thật, vì
đích của CMLL là bốn góc về đúng chỗ so với hai khối.

## Địa chỉ MAC của cube (hay gặp khi dùng điện thoại)

GAN mã hoá dữ liệu bluetooth bằng khoá **trộn từ chính địa chỉ MAC của cube**, nên MAC là
bắt buộc chứ không phải tuỳ chọn — thiếu nó thì mọi gói tin giải mã ra rác. Trình duyệt
chỉ đọc được MAC qua `watchAdvertisements()`, mà API này trên Chrome Android nằm sau cờ
thử nghiệm, nên trên điện thoại thường phải nhập tay một lần.

Hai cách:

- **Nhập tay một lần.** App hiện hộp thoại kèm hướng dẫn tìm MAC, nhận mọi kiểu gõ
  (`AB:CD:EF:12:34:56`, `ab-cd-ef-12-34-56`, hay `abcdef123456`), rồi nhớ luôn cho lần sau.
  Tìm MAC dễ nhất bằng app quét Bluetooth như nRF Connect trên Android.
- **Hoặc bật cờ để khỏi nhập.** `chrome://flags` → *Experimental Web Platform features* →
  khởi động lại Chrome. Khi đó trình duyệt tự đọc MAC từ tín hiệu quảng bá của cube.

Nhập nhầm MAC là trường hợp khó chịu nhất: cube vẫn "kết nối được" nhưng dữ liệu ra rác.
App tự bắt chuyện này bằng cách kiểm tra trạng thái đọc về có đúng mỗi màu 9 ô không, và
nói thẳng là MAC sai thay vì để bạn ngồi đoán. Vào Cài đặt xoá MAC đã lưu rồi nhập lại.

## Khi app và khối thật lệch nhau

Hai kiểu lệch, hai cách xử lý khác nhau, đều có nút riêng ở trang Bấm giờ và trong Cài đặt:

- **App lệch so với cube** — rớt nước qua bluetooth. Cube vẫn biết đúng, chỉ cần
  *Hỏi lại cube*. App cũng tự sửa mỗi khi cube gửi trạng thái về, và đếm số lần lệch.
- **Chính cube lệch so với thực tế** — bạn tháo lắp khối, hoặc cube bỏ sót nước của chính
  nó. Lúc này phải giải khối về trạng thái đã giải rồi bấm *Khối đang đã giải* để nói cho
  cube biết. Nút này có hỏi lại trước khi làm, vì bấm nhầm lúc khối chưa giải sẽ làm mọi
  thứ sau đó sai hết.

## Hiển thị khối

Mặc định là **khối 3D** kéo chuột xoay được (hoặc dùng phím mũi tên), dựng bằng CSS
transform chứ không cần thư viện đồ hoạ nào — vị trí 54 ô màu lấy thẳng từ cùng mô hình
toạ độ mà engine giải dùng. Trang xem lại có nút đổi nhanh sang bản trải phẳng khi cần
thấy đủ cả 6 mặt một lúc; đổi mặc định trong Cài đặt.

Có thêm tuỳ chọn cho khối trên màn hình **xoay theo con quay của cube thật**. Phần này
đang tắt sẵn và ghi rõ là thử nghiệm: tôi chưa có cube thật để kiểm chứng phép đổi hệ
trục, nên nếu bật lên mà thấy xoay sai trục thì tắt đi.

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
npm test            # 193 khẳng định, chạy trong vài giây
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

Bộ dẫn vặn scramble có test riêng cho các tình huống thật: vặn đúng, vặn nhầm mặt đối
diện, vặn sai chiều, lạc nhiều nước rồi sửa theo gợi ý, vặn lùi, và mất kết nối giữa
chừng (khi đó app không bịa ra gợi ý sửa).

## Một cái bẫy của bản production

Scramble random-state chuẩn WCA do cubing.js sinh ra trong một Web Worker. Worker đó
nằm chung đồ thị module với app, nên chunk của nó import cả chunk entry và gọi helper
`__vitePreload` ngay lúc nạp — mà helper này đụng `document` để chèn thẻ preload, còn
trong worker thì không có `document`. Worker chết, và app **vẫn chạy bình thường**
nhưng âm thầm rơi xuống scramble random-move. Dev server không dính, chỉ bản build mới lộ.

Ba lớp xử lý, đều ghi rõ lý do tại chỗ:

- `modulePreload: false` và `cssCodeSplit: false` trong
  [vite.config.ts](vite.config.ts) — để `__vitePreload` nhận danh sách rỗng rồi
  thoát sớm, không chạm `document`.
- [src/main.tsx](src/main.tsx) bọc mọi tác dụng phụ DOM sau `typeof document`, vì
  file entry này thật sự bị nạp trong ngữ cảnh worker.
- Giao diện hiện nhãn `random-move` cạnh nút Đổi khi phải dùng hàng thay thế — để
  lần sau nếu hỏng lại thì nhìn thấy ngay chứ không im lặng.

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

## Triển khai

Bản chạy thật: **https://cube.dash.id.vn**

Mỗi lần push lên `main`, GitHub Actions
([.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml)) sẽ:

1. `npm ci` → `npm run typecheck` → `npm test` (109 khẳng định) → `npm run build`
2. Nếu tất cả xanh mới rsync thư mục `dist/` lên server
3. Gọi thử lại site, không trả về 200 thì báo hỏng

Pull request chỉ chạy bước 1 — không deploy.

### Hạ tầng

| Thành phần | Cấu hình |
|---|---|
| Server | Ubuntu 22.04, nginx (chung máy với `casino.dash.id.vn`, hai site tách biệt) |
| Webroot | `/var/www/cube.dash.id.vn` |
| TLS | Let's Encrypt, certbot tự gia hạn qua `certbot.timer` |
| DNS | Cloudflare (proxy bật) → origin `160.187.247.2` |

### Về bảo mật khoá deploy

CI **không** dùng `root`. Có một user riêng `cubedeploy`, và khoá SSH của nó bị ép
chỉ chạy được đúng một lệnh:

```
command="/usr/bin/rrsync /var/www/cube.dash.id.vn",no-pty,no-port-forwarding,...
```

Nghĩa là nếu secret trên GitHub bị lộ, kẻ lấy được cũng chỉ ghi được file vào đúng
thư mục web đó, không mở được shell, không đụng được sang site khác. Đã kiểm chứng:
thử chạy `id; cat /etc/shadow` bằng khoá này thì bị chặn.

Host key của server được ghim sẵn trong secret `DEPLOY_KNOWN_HOSTS` thay vì dùng
`ssh-keyscan` lúc chạy, để không bị tráo server giữa đường.

### Thư mục xác thực TLS

`/.well-known/acme-challenge/` được nginx trỏ sang `/var/www/acme`, **nằm ngoài**
webroot. Lý do: deploy dùng `rsync --delete` nên mọi thứ trong webroot bị dọn sạch
mỗi lần; để thư mục ACME ở trong đó thì lần gia hạn cert sau sẽ hỏng.

### Deploy tay khi cần

```bash
npm run build
rsync -az --delete dist/ root@160.187.247.2:/var/www/cube.dash.id.vn/
```
