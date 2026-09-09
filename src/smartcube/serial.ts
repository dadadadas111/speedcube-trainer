/**
 * So sánh số thứ tự gói tin của cube.
 *
 * Cube đánh số mỗi lần trạng thái đổi, chạy vòng theo modulo 256. Ảnh chụp
 * trạng thái mà cube đẩy về theo chu kỳ có thể TỚI SAU vài nước mới nhưng lại mô
 * tả trạng thái CŨ hơn — ghi đè bừa là kéo lùi trạng thái của app, khiến lúc
 * giải xong app không nhận ra là đã xong.
 *
 * Tách riêng khỏi module bluetooth để test chạy được ngoài trình duyệt.
 */

/** Nửa vòng: quá khoảng này thì coi như đã chạy vòng ngược về quá khứ. */
const HALF = 128;

/**
 * `candidate` có mới bằng hoặc mới hơn `last` không.
 * `last` là null nghĩa là chưa có mốc nào, chấp nhận tất.
 */
export function isFreshSerial(candidate: number, last: number | null): boolean {
  if (last === null) return true;
  return (((candidate - last) % 256) + 256) % 256 <= HALF;
}
