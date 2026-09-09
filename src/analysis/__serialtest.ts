import { isFreshSerial } from '../smartcube/serial';

let fails = 0;
const check = (n: string, c: boolean, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? '  <' + x + '>' : '')); } else console.log('ok   ' + n); };

check('chưa có mốc thì chấp nhận tất', isFreshSerial(0, null) && isFreshSerial(200, null));
check('cùng số thứ tự là còn tươi', isFreshSerial(50, 50));
check('mới hơn một nhịp', isFreshSerial(51, 50));
check('mới hơn nhiều nhịp', isFreshSerial(120, 50));
check('cũ hơn một nhịp -> bỏ', !isFreshSerial(49, 50));
check('cũ hơn nhiều nhịp -> bỏ', !isFreshSerial(10, 50));

// Chạy vòng qua mốc 255 -> 0 là chuyện bình thường, không được hiểu nhầm thành lùi
check('chạy vòng 255 -> 0 vẫn là mới', isFreshSerial(0, 255));
check('chạy vòng 250 -> 5 vẫn là mới', isFreshSerial(5, 250));
check('chạy vòng ngược 0 -> 255 là cũ', !isFreshSerial(255, 0));
check('chạy vòng ngược 5 -> 250 là cũ', !isFreshSerial(250, 5));

// Đây chính là kịch bản gây lỗi: đang giải, cube đẩy ảnh chụp cũ vài nước
check('ảnh chụp trễ 3 nước bị bỏ qua', !isFreshSerial(97, 100));
check('ảnh chụp đúng nước hiện tại được nhận', isFreshSerial(100, 100));

console.log(fails === 0 ? '\nTẤT CẢ ĐỀU PASS' : `\n${fails} TEST LỖI`);
