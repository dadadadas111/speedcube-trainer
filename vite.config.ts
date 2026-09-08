import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    /**
     * Hai tuỳ chọn dưới đây tồn tại vì cùng một lý do, và chỉ bản production mới
     * lộ ra vấn đề — dev server luôn chạy đúng.
     *
     * cubing.js sinh scramble random-state trong một Web Worker. Worker đó nằm
     * chung đồ thị module với app, nên chunk của nó import cả chunk entry và gọi
     * helper `__vitePreload` của Vite ngay lúc nạp. Helper này đụng `document`
     * để chèn thẻ <link> preload — mà trong worker không có `document`, nên worker
     * chết. Hậu quả rất kín: app vẫn chạy bình thường nhưng âm thầm rơi từ
     * scramble random-state chuẩn WCA xuống random-move.
     *
     * - modulePreload: false  -> bỏ phần chèn link preload cho module.
     * - cssCodeSplit: false   -> gộp CSS thành một file nạp từ HTML, nhờ vậy
     *                            dynamic import không còn kèm danh sách CSS cần
     *                            preload. Danh sách rỗng thì `__vitePreload`
     *                            thoát sớm và không chạm tới `document` nữa.
     *
     * Xem thêm lớp bảo vệ ở src/main.tsx (chặn tác dụng phụ DOM của entry) và
     * chỉ báo nguồn scramble trên giao diện để lỗi này không thể lặng lẽ quay lại.
     */
    modulePreload: false,
    cssCodeSplit: false,
  },
});
